// D-NI-GEMINI-GATE-1: gemini-cli 0.66.0 runs an extension hook only when (a) the extension is enabled for the user AND the
// workspace scope (`Enabled (Workspace):` in `gemini extensions list`), (b) merged settings hooksConfig.enabled is not false
// (system > workspace > user), (c) the hook command is not in hooksConfig.disabled (union of all scopes), (d) no admin
// setting turns extensions off. Live (temp HOME, fake local model): each of these made the real binary skip our hook, and
// `gemini extensions list` still showed the extension enabled for the user. Doctor and setup must FAIL with a one-line fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { runDoctor, runSetup } from "../../../src/setup/index.ts";

const SKIP_SH = { skip: process.platform === "win32" && "fake agent binaries are sh scripts" };
const HOOK_CMD = (dir) => `node "${path.join(dir, "hook.mjs")}" --agent gemini`;

function fakePkg(root) {
  const dir = path.join(root, "pkg");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
  writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  const skills = path.join(import.meta.dirname, "..", "..", "..", "skills");
  for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
  return dir;
}

// The real 0.66.0 `gemini extensions list` text (stderr), with the two scope lines.
const LIST = (user, workspace) => `✓ context-mode (2.0.0)\n ID: x\n Path: /x\n Source: /x (Type: link)\n Enabled (User): ${user}\n Enabled (Workspace): ${workspace}\n MCP servers:\n  context-mode\n`;

function sandbox(t, { user = true, workspace = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-gemgate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const listFile = path.join(root, "list.txt");
  writeFileSync(listFile, LIST(user, workspace));
  const file = path.join(bin, "gemini");
  writeFileSync(file, `#!/bin/sh\ncase "$1 $2" in\n  "extensions list") cat "${listFile}" >&2 ;;\n  "extensions link") exit 7 ;;\nesac\nexit 0\n`);
  chmodSync(file, 0o755);
  const pkgDir = fakePkg(root);
  const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000",
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(root, "system", "settings.json") };
  return { root, home, pkgDir, env, user: path.join(home, ".gemini", "settings.json"), system: env.GEMINI_CLI_SYSTEM_SETTINGS_PATH };
}

function put(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return file;
}

async function doctor(s) {
  const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["gemini"] });
  return doc.agents[0];
}
const regDetail = (a) => a.checks.find((c) => c.name === "hook-registered")?.detail ?? "";

test("[D-NI-GEMINI-GATE-1] baseline: enabled in both scopes, plain settings, an unrelated disabled hook -> PASS", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { theme: "dark", hooksConfig: { enabled: true, disabled: ["my-own-hook"] } });
  const a = await doctor(s);
  assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
});

test("[D-NI-GEMINI-GATE-1] doctor: extension disabled for the workspace scope is a FAIL that names the scope flag", SKIP_SH, async (t) => {
  const s = sandbox(t, { workspace: false });
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes("gemini extensions enable context-mode --scope workspace"), regDetail(a));
});

test("[D-NI-GEMINI-GATE-1] doctor: hooksConfig.enabled=false in the user settings is a FAIL that names the file and key", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { hooksConfig: { enabled: false } });
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes(s.user) && regDetail(a).includes("hooksConfig.enabled"), regDetail(a));
});

test("[D-NI-GEMINI-GATE-1] doctor: the system settings win over the user settings (hooksConfig.enabled=false there is a FAIL)", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { hooksConfig: { enabled: true } });
  put(s.system, { hooksConfig: { enabled: false } });
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes(s.system), regDetail(a));
});

test("[D-NI-GEMINI-GATE-1] doctor: our hook command in hooksConfig.disabled is a FAIL that names the entry", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { hooksConfig: { disabled: ["my-own-hook", HOOK_CMD(s.pkgDir)] } });
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes("hooksConfig.disabled") && regDetail(a).includes("hook.mjs"), regDetail(a));
});

test("[D-NI-GEMINI-GATE-1] doctor: an admin setting that turns extensions off is a FAIL", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.system, { admin: { extensions: { enabled: false } } });
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes("admin"), regDetail(a));
});

test("[D-NI-GEMINI-GATE-1] doctor: hooksConfig.enabled=false in the workspace settings of the current folder is a FAIL", SKIP_SH, async (t) => {
  const s = sandbox(t);
  const ws = path.join(s.root, "project");
  put(path.join(ws, ".gemini", "settings.json"), { hooksConfig: { enabled: false } });
  const before = process.cwd();
  process.chdir(ws);
  try {
    const a = await doctor(s);
    assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
    assert.ok(regDetail(a).includes("hooksConfig.enabled"), regDetail(a));
  } finally { process.chdir(before); }
});

test("[D-NI-GEMINI-GATE-1] setup: a gated gemini install is a FAIL with the same fix, and setup writes no settings file", SKIP_SH, async (t) => {
  const s = sandbox(t);
  const text = JSON.stringify({ hooksConfig: { enabled: false } });
  put(s.user, text);
  const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["gemini"], runId: "g1" });
  const a = res.agents[0];
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok((a.reason ?? "").includes("hooksConfig.enabled"), a.reason);
  assert.deepEqual(a.changes, []);
  assert.equal(readFileSync(s.user, "utf8"), text, "a user key is never rewritten");
  assert.equal(existsSync(s.system), false);
});
