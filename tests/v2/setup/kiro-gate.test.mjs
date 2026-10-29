// D-NI-KIRO-GATE-1: kiro-cli 2.35.2 (V3 engine, real binary, temp HOME) logs `hooks.reload.loaded {read, registered}` and counts a
// hook with "enabled": false as registered. The docs (kiro.dev/docs/cli/v3/hooks-migration, hooks[].enabled: "Set false to skip
// the hook without deleting it") say it does not run. A disabled own entry looks installed but never fires: doctor must FAIL
// with a one-line fix, and setup must rewrite only our own entry back to enabled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { runDoctor, runSetup } from "../../../src/setup/index.ts";

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
  writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.exit(2); });\n`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  const skills = path.join(import.meta.dirname, "..", "..", "..", "skills");
  for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
  return dir;
}

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-kirogate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const env = { PATH: ["/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
  return { home, pkgDir: fakePkg(root), env, file: path.join(home, ".kiro", "hooks", "context-mode.json") };
}

const doctor = async (s) => (await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"] })).agents[0];
const regDetail = (a) => a.checks.find((c) => c.name === "hook-registered")?.detail ?? "";
const setup = (s, runId) => runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"], runId });

function disable(s, name) {
  const doc = JSON.parse(readFileSync(s.file, "utf8"));
  const h = doc.hooks.find((e) => e.name === name);
  assert.ok(h, `own entry ${name} present`);
  h.enabled = false;
  writeFileSync(s.file, JSON.stringify(doc, null, 2));
}

test("[D-NI-KIRO-GATE-1] baseline: a fresh kiro install has every own hook enabled -> doctor PASS", async (t) => {
  const s = sandbox(t);
  assert.equal((await setup(s, "k0")).agents[0].status, "PASS");
  const a = await doctor(s);
  assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
});

test("[D-NI-KIRO-GATE-1] doctor: an own hook with enabled:false is a FAIL that names the hook and the fix", async (t) => {
  const s = sandbox(t);
  await setup(s, "k1");
  disable(s, "context-mode-PreToolUse-shell");
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes("enabled") && regDetail(a).includes("context-mode-PreToolUse-shell"), regDetail(a));
});

test("[D-NI-KIRO-GATE-1] doctor: a user hook with enabled:false in the same file is not our business -> still PASS", async (t) => {
  const s = sandbox(t);
  await setup(s, "k2");
  const doc = JSON.parse(readFileSync(s.file, "utf8"));
  doc.hooks.push({ name: "my-lint", trigger: "PreToolUse", matcher: "read", action: { type: "command", command: "npm run lint" }, enabled: false });
  writeFileSync(s.file, JSON.stringify(doc, null, 2));
  const a = await doctor(s);
  assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
});

test("[D-NI-KIRO-GATE-1] setup: a second run turns our disabled entry back on and keeps the user entry", async (t) => {
  const s = sandbox(t);
  await setup(s, "k3");
  disable(s, "context-mode-SessionStart");
  const doc = JSON.parse(readFileSync(s.file, "utf8"));
  const mine = { name: "my-lint", trigger: "PreToolUse", matcher: "read", action: { type: "command", command: "npm run lint" }, enabled: false };
  doc.hooks.push(mine);
  writeFileSync(s.file, JSON.stringify(doc, null, 2));
  const res = await setup(s, "k4");
  assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
  const after = JSON.parse(readFileSync(s.file, "utf8")).hooks;
  assert.equal(after.find((e) => e.name === "context-mode-SessionStart").enabled, true);
  assert.deepEqual(after.find((e) => e.name === "my-lint"), mine);
});
