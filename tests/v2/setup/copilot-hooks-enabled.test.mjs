// D-HF-COPILOT-ENABLED-1: Copilot CLI 1.0.105 does not run a hook whose key is in settings.json `disabledHooks`
// (live-proven in tests/v2/e2e/copilot-cli-fire.test.mjs). Setup removes our own keys; doctor FAILs with a one-line fix.
// The stub spells source relative to COPILOT_HOME, as copilot 1.0.105 does. The host here is a stub that answers `copilot --server --stdio` hooks.discover from the files in COPILOT_HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { generateManifests } from "../../../build/manifests.ts";
import { runDoctor, runRemove, runSetup } from "../../../src/setup/index.ts";

const NODE = process.execPath;
const REPO = path.resolve(import.meta.dirname, "../../..");
const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
const key = (source, event) => createHash("sha256").update(source + "\n" + event).digest("hex");

const STUB = `
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const args = process.argv.slice(2);
if (!args.includes("--server")) { console.log("context-mode"); process.exit(0); }
if (process.env.STUB_NO_ANSWER) process.exit(0);
const dir = process.env.COPILOT_HOME || path.join(process.env.HOME, ".copilot");
const read = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return {}; } };
let buf = Buffer.alloc(0);
process.stdin.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  const s = buf.toString("latin1"); const i = s.indexOf("\\r\\n\\r\\n"); if (i < 0) return;
  const n = Number(s.slice(0, i).split(":")[1]); if (buf.length < i + 4 + n) return;
  const m = JSON.parse(buf.slice(i + 4, i + 4 + n).toString());
  const file = path.join(dir, "hooks", "context-mode.json");
  const set = read(path.join(dir, "settings.json"));
  const doc = existsSync(file) ? read(file) : { hooks: {} };
  const hooks = Object.keys(doc.hooks || {}).map((event) => {
    const k = createHash("sha256").update(file + "\\n" + event).digest("hex");
    // hooks.discover schema: disableKey is omitted when disable-all suppresses the action
    return { id: "hook:" + k, hookType: event, origin: "user", source: path.relative(dir, file).split(path.sep).join("/"), enabled: !set.disableAllHooks && !(set.disabledHooks || []).includes(k), ...(set.disableAllHooks ? {} : { disableKey: k }) };
  });
  const body = JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { hooks, warnings: [], errors: [] } });
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
});
`;

function pkg(root) {
  const dir = path.join(root, "pkg");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "server.mjs"), `
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
  writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  generateManifests(dir);
  for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "skills", s), { recursive: true });
  for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "pi", "skills", s), { recursive: true }); // D-HQ-SKILLS-1: the bare-name skill dir
  return dir;
}

function sandbox(t, extraEnv = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-cop-enabled-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "copilot-stub.mjs"), STUB);
  if (process.platform === "win32") writeFileSync(path.join(bin, "copilot.cmd"), `@"${NODE}" "%~dp0copilot-stub.mjs" %*\r\n`);
  else writeFileSync(path.join(bin, "copilot"), `#!/bin/sh\nexec "${NODE}" "${path.join(bin, "copilot-stub.mjs")}" "$@"\n`, { mode: 0o755 });
  const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
  return { root, home, pkgDir: pkg(root), settings: path.join(home, ".copilot", "settings.json"), hookFile: path.join(home, ".copilot", "hooks", "context-mode.json"),
    env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win, ...extraEnv } };
}

const opts = (s, extra = {}) => ({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["copilot-cli"], ...extra });
const why = (r) => JSON.stringify(r.agents.map((a) => [a.id, a.status, a.reason]));

test("D-HF-COPILOT-ENABLED-1: setup removes only our own keys from disabledHooks and keeps every other setting", async (t) => {
  const s = sandbox(t);
  mkdirSync(path.dirname(s.settings), { recursive: true });
  const first = await runSetup(opts(s, { runId: "a" }));
  assert.equal(first.exitCode, 0, why(first));
  const mine = key(s.hookFile, "preToolUse");
  const theirs = "f".repeat(64);
  const user = JSON.stringify({ model: "gpt-x", disabledHooks: [theirs, mine, key(s.hookFile, "postToolUse")] }, null, 2) + "\n";
  writeFileSync(s.settings, user);
  const again = await runSetup(opts(s, { runId: "b" }));
  assert.equal(again.exitCode, 0, why(again));
  const doc = JSON.parse(readFileSync(s.settings, "utf8"));
  assert.deepEqual(doc.disabledHooks, [theirs], "only a key that is not ours stays");
  assert.equal(doc.model, "gpt-x");
  assert.ok(again.agents[0].changes.some((c) => c.file === s.settings), "the settings edit is reported");
  const third = await runSetup(opts(s, { runId: "c" }));
  assert.deepEqual(third.agents[0].changes, [], "idempotent");
  assert.equal(runRemove({ home: s.home, env: s.env }).exitCode, 0);
  assert.equal(readFileSync(s.settings, "utf8"), user, "remove puts settings.json back byte for byte");
});

test("D-HF-COPILOT-ENABLED-1: doctor FAILs one line when the host lists our hooks disabled, and names the fix", async (t) => {
  const s = sandbox(t);
  assert.equal((await runSetup(opts(s, { runId: "a" }))).exitCode, 0);
  writeFileSync(s.settings, JSON.stringify({ disabledHooks: [key(s.hookFile, "preToolUse")] }));
  const d = await runDoctor(opts(s));
  assert.equal(d.exitCode, 1, why(d));
  const c = d.agents[0].checks.find((x) => x.name === "hook-enabled");
  assert.equal(c.ok, false, JSON.stringify(d.agents[0].checks));
  assert.match(c.detail, /1 of 4 context-mode hooks disabled/);
  assert.match(c.detail, /disabledHooks/);
  assert.match(c.detail, /run: context-mode setup/);
  assert.equal(c.detail.includes("\n"), false);
});

test("D-HF-COPILOT-ENABLED-1: disableAllHooks is the user's choice: setup does not flip it, it FAILs and names the setting", async (t) => {
  const s = sandbox(t);
  mkdirSync(path.dirname(s.settings), { recursive: true });
  writeFileSync(s.settings, JSON.stringify({ disableAllHooks: true }));
  const r = await runSetup(opts(s, { runId: "a" }));
  assert.equal(r.exitCode, 1, why(r));
  assert.match(r.agents[0].reason, /disableAllHooks/);
  assert.equal(JSON.parse(readFileSync(s.settings, "utf8")).disableAllHooks, true, "the user's flag is untouched");
});

test("D-HF-COPILOT-ENABLED-1: doctor is green when the host lists all hooks enabled", async (t) => {
  const s = sandbox(t);
  assert.equal((await runSetup(opts(s, { runId: "a" }))).exitCode, 0);
  const d = await runDoctor(opts(s));
  assert.equal(d.exitCode, 0, why(d));
  const c = d.agents[0].checks.find((x) => x.name === "hook-enabled");
  assert.equal(c.ok, true);
  assert.notEqual(c.warn, true);
});

test("D-HF-COPILOT-ENABLED-1: a host that gives no answer is a WARN, never a FAIL", async (t) => {
  const s = sandbox(t, { STUB_NO_ANSWER: "1" });
  const r = await runSetup(opts(s, { runId: "a" }));
  assert.equal(r.exitCode, 0, why(r));
  const c = r.agents[0].checks.find((x) => x.name === "hook-enabled");
  assert.equal(c.ok, true);
  assert.equal(c.warn, true);
  assert.match(c.detail, /copilot did not report hook state/);
});
