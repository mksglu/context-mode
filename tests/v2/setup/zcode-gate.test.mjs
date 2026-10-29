// D-NI-ZCODE-GATE-1: zcode 0.17.0 (zai-org/ZCode 3c5b2276, built from source, live with a fake local provider) loads
// ~/.zcode/cli/config.json through a zod schema; ONE invalid key anywhere in the file (ui.locale=12345, logging="loud")
// makes it log "config.file.invalid Config file failed to load" and use NO key of the file, so our hooks never run, while
// the file still parses as JSON. User-scope hooks need no workspace trust (only project zcode.json hooks do, 09-hooks.md).
// Doctor must FAIL with the key and a one-line fix; setup writes nothing to a user's other keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { generateManifests } from "../../../build/manifests.ts";
import { runDoctor, runSetup } from "../../../src/setup/index.ts";

const REPO = path.resolve(import.meta.dirname, "../../..");

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-zcode-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const pkgDir = path.join(root, "pkg");
  mkdirSync(home, { recursive: true });
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
  generateManifests(pkgDir);
  for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) {
    for (const k of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) cpSync(path.join(REPO, "skills", k), path.join(pkgDir, rel, k), { recursive: true });
  }
  return { home, pkgDir, env: { PATH: "/usr/bin:/bin", HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" } };
}

const file = (home) => path.join(home, ".zcode", "cli", "config.json");
const cfg = (home) => JSON.parse(readFileSync(file(home), "utf8"));
const put = (home, doc) => writeFileSync(file(home), JSON.stringify(doc, null, 2));

async function doctorAfterSetup(t, edit) {
  const s = sandbox(t);
  await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["zcode"], runId: "z" });
  if (edit) { const doc = cfg(s.home); edit(doc); put(s.home, doc); }
  const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["zcode"] });
  return d.agents[0];
}

const reg = (a) => a.checks.find((c) => c.name === "hook-registered");

test("D-NI-ZCODE-GATE-1: a clean setup passes doctor", async (t) => {
  const a = await doctorAfterSetup(t);
  assert.equal(a.status, "PASS", JSON.stringify(a));
});

const BAD = [
  ["ui.locale not in auto|en-US|zh-CN", (d) => { d.ui = { locale: 12345 }; }, "ui.locale"],
  ["ui.theme not in auto|dark|light", (d) => { d.ui = { theme: "blue" }; }, "ui.theme"],
  ["logging is a string", (d) => { d.logging = "loud"; }, "logging"],
  ["logging.level not in debug|info|warn|error", (d) => { d.logging = { level: "trace" }; }, "logging.level"],
  ["permission.mode unknown", (d) => { d.permission = { mode: "wild" }; }, "permission.mode"],
  ["features.memory not a boolean", (d) => { d.features.memory = "yes"; }, "features.memory"],
  ["modelStream.idleTimeoutMs not positive", (d) => { d.modelStream = { idleTimeoutMs: -1 }; }, "modelStream.idleTimeoutMs"],
  ["hooks has an unknown key (strict)", (d) => { d.hooks.disabled = true; }, "hooks.disabled"],
  ["hooks.events has an unknown event (strict)", (d) => { d.hooks.events.OnSave = []; }, "hooks.events.OnSave"],
  ["a hook group has an unknown key (strict)", (d) => { d.hooks.events.SessionStart.push({ hooks: [{ type: "command", command: "echo user" }], when: "x" }); }, "hooks.events.SessionStart"],
  ["a hook group holds no hook", (d) => { d.hooks.events.UserPromptSubmit.push({ hooks: [] }); }, "hooks.events.UserPromptSubmit"],
  ["a hook has an unknown type", (d) => { d.hooks.events.SessionStart.push({ hooks: [{ type: "http", command: "x" }] }); }, "hooks.events.SessionStart"],
];
for (const [name, edit, key] of BAD) {
  test(`D-NI-ZCODE-GATE-1: doctor FAILs when ${name} (zcode drops the whole config.json, hooks included)`, async (t) => {
    const a = await doctorAfterSetup(t, edit);
    assert.equal(a.status, "FAIL", JSON.stringify(a));
    const c = reg(a);
    assert.equal(c.ok, false, JSON.stringify(a.checks));
    assert.ok(c.detail.includes(key), c.detail);
    assert.ok(c.detail.includes("config.json"), c.detail);
  });
}

test("D-NI-ZCODE-GATE-1: hooks.enabled=false FAILs doctor", async (t) => {
  const a = await doctorAfterSetup(t, (d) => { d.hooks.enabled = false; });
  assert.equal(a.status, "FAIL", JSON.stringify(a));
});

test("D-NI-ZCODE-GATE-1: our hook entry with enabled=false FAILs doctor", async (t) => {
  const a = await doctorAfterSetup(t, (d) => { d.hooks.events.PreToolUse[0].hooks[0].enabled = false; });
  assert.equal(a.status, "FAIL", JSON.stringify(a));
});

test("D-NI-ZCODE-GATE-1: valid user keys and unknown top-level keys (zcode passes them through) keep PASS", async (t) => {
  const a = await doctorAfterSetup(t, (d) => {
    d.ui = { locale: "zh-CN", theme: "dark" };
    d.logging = { level: "debug", format: "json" };
    d.permission = { mode: "yolo" };
    d.someFutureKey = { anything: 1 };
    d.hooks.timeoutMs = 20000;
  });
  assert.equal(a.status, "PASS", JSON.stringify(a));
});

test("D-NI-ZCODE-GATE-1: setup leaves the user's other keys byte for byte (it never repairs them)", async (t) => {
  const s = sandbox(t);
  mkdirSync(path.dirname(file(s.home)), { recursive: true });
  put(s.home, { ui: { locale: 12345 } });
  await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["zcode"], runId: "z" });
  assert.deepEqual(cfg(s.home).ui, { locale: 12345 });
});
