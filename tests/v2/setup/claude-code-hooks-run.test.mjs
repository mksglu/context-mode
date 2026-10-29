// tests/v2/setup/claude-code-hooks-run.test.mjs
// D-CC-HOOKS-RUN-1. Claude Code 2.1.274 (live spike): the plugin hooks never run when the plugin is installed but
// disabled (`claude plugin list` shows "Status: disabled") or when `disableAllHooks: true` is set in a settings file.
// Setup enables our own plugin; doctor FAILs, with a one-line fix, on both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { runDoctor, runSetup } from "../../../src/setup/index.ts";

const SKIP = process.platform === "win32" && "fake agent binaries are sh scripts";
const REPO = path.resolve(import.meta.dirname, "../../..");
const PLUGIN = "context-mode@context-mode";

// The text `claude plugin list` prints (2.1.274): a block per plugin, the Status line ends in enabled / disabled.
const FAKE = (state) => `case "$1 $2" in
  "plugin list") if [ -f "${state}.on" ] || [ -f "${state}.off" ]; then
      echo "Installed plugins:"; echo ""; echo "  ❯ ${PLUGIN}"; echo "    Version: 2.0.0"; echo "    Scope: user"
      if [ -f "${state}.off" ]; then echo "    Status: ✘ disabled"; else echo "    Status: ✔ enabled"; fi
    fi ;;
  "plugin install") touch "${state}.on" ;;
  "plugin enable") rm -f "${state}.off"; touch "${state}.on"; echo enabled >> "${state}.log" ;;
  "plugin disable") rm -f "${state}.on"; touch "${state}.off" ;;
esac
exit 0`;

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-cc-hooks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  const pkgDir = path.join(root, "pkg");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
  writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
  writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  for (const d of ["skills", path.join("claude-code", "skills")]) cpSync(path.join(REPO, "skills"), path.join(pkgDir, d), { recursive: true });
  const state = path.join(root, "claude.state");
  const cli = path.join(root, "npm", "lib", "node_modules", "@anthropic-ai", "claude-code");
  mkdirSync(cli, { recursive: true });
  writeFileSync(path.join(cli, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.0.0" }));
  writeFileSync(path.join(cli, "cli.sh"), `#!/bin/sh\n${FAKE(state)}\n`);
  chmodSync(path.join(cli, "cli.sh"), 0o755);
  symlinkSync(realpathSync(path.join(cli, "cli.sh")), path.join(bin, "claude"));
  return { root, home, pkgDir, state,
    env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" } };
}

const opts = (s) => ({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["claude-code"] });
const check = (res, name) => res.agents[0].checks.find((c) => c.name === name);

test("claude-code: a disabled plugin is enabled by setup with the host's own command, and doctor then passes", { skip: SKIP }, async (t) => {
  const s = sandbox(t);
  writeFileSync(`${s.state}.off`, "");
  const before = await runDoctor(opts(s));
  assert.equal(before.exitCode, 1, "doctor FAILs while the plugin is disabled");
  assert.match(before.agents[0].reason, /hook-enabled: .*disabled.*claude plugin enable context-mode@context-mode/);
  const res = await runSetup({ ...opts(s), runId: "r1" });
  assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
  assert.equal(readFileSync(`${s.state}.log`, "utf8"), "enabled\n", "setup ran claude plugin enable once");
  const after = await runDoctor(opts(s));
  assert.equal(after.exitCode, 0, JSON.stringify(after.agents[0], null, 2));
  assert.equal(check(after, "hook-enabled").ok, true);
});

test("claude-code: doctor FAILs, naming the file and the key, when a settings file sets disableAllHooks", { skip: SKIP }, async (t) => {
  const s = sandbox(t);
  await runSetup({ ...opts(s), runId: "r1" });
  const file = path.join(s.home, ".claude", "settings.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ disableAllHooks: true, model: "x" }));
  const d = await runDoctor(opts(s));
  assert.equal(d.exitCode, 1);
  assert.match(d.agents[0].reason, new RegExp(`hook-enabled: ${file.replaceAll("\\", "\\\\")} sets disableAllHooks, so Claude Code runs no hooks; remove "disableAllHooks" from it`));
  assert.equal(JSON.parse(readFileSync(file, "utf8")).disableAllHooks, true, "doctor never edits the user's own setting");
  writeFileSync(file, JSON.stringify({ disableAllHooks: false }));
  assert.equal((await runDoctor(opts(s))).exitCode, 0, "false is not a gate");
});

test("claude-code: a settings file that is not JSON is a doctor FAIL that names the file, not a crash or a hook-enabled guess", { skip: SKIP }, async (t) => {
  const s = sandbox(t);
  await runSetup({ ...opts(s), runId: "r1" });
  const file = path.join(s.home, ".claude", "settings.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "{ not json");
  const d = await runDoctor(opts(s));
  assert.equal(d.exitCode, 1);
  assert.ok(d.agents[0].reason.includes(file), d.agents[0].reason);
  assert.equal(readFileSync(file, "utf8"), "{ not json", "doctor never edits the user's file");
});
