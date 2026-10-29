// D-NI-VSCODE-GATE-1: conditions under which VS Code (microsoft/vscode main, 1.144.0 bundle) has our hook file
// ~/.copilot/hooks/context-mode-vscode.json but loads no hook (promptsServiceImpl.ts getHooks: `useChatHooks &&
// isWorkspaceTrusted && areAgentHooksAllowed`; PromptsConfig.getLocationsValue + getPromptSourceFolders):
//   - chat.useHooks is false (user settings.json, or the workspace .vscode/settings.json);
//   - chat.hookFilesLocations is set and leaves out "~/.copilot/hooks" (a configured object replaces the defaults);
//   - managed-settings.json (GitHubCopilot) has allowManagedHooksOnly or strictPluginOnlyCustomization true.
// Doctor and setup only read these files; they never write a user's setting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { vscodeUserDirOf } from "../../../src/core/project/config-dir.ts";
import { runDoctor, runSetup } from "../../../src/setup/index.ts";
import { vscodeSettingsGate } from "../../../src/setup/vscode-gate.ts";

function fakePkg(root) {
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
  const skills = path.join(import.meta.dirname, "..", "..", "..", "skills");
  for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
  return dir;
}

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-vsgate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const pkgDir = fakePkg(root);
  const env = { PATH: "/usr/bin:/bin", HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
  const user = path.join(vscodeUserDirOf(env, home), "settings.json");
  return { root, home, pkgDir, env, user };
}

function put(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return file;
}

async function setup(s) {
  const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["vscode"], runId: "r1" });
  return res.agents[0];
}
async function doctor(s) {
  const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["vscode"] });
  return doc.agents[0];
}
const regDetail = (a) => a.checks.find((c) => c.name === "hook-registered")?.detail ?? "";
const HOOKS_DIR = "~/.copilot/hooks";

test("[D-NI-VSCODE-GATE-1] baseline: no gating setting -> setup and doctor PASS", async (t) => {
  const s = sandbox(t);
  assert.equal((await setup(s)).status, "PASS");
  assert.equal((await doctor(s)).status, "PASS");
});

test("[D-NI-VSCODE-GATE-1] baseline: chat.useHooks true, locations that keep ~/.copilot/hooks -> PASS", async (t) => {
  for (const settings of [{ "chat.useHooks": true }, { "chat.hookFilesLocations": { [HOOKS_DIR]: true, ".github/hooks": false } }, { "chat.hookFilesLocations": { ".github/hooks": true, [HOOKS_DIR]: true } }]) {
    const s = sandbox(t);
    put(s.user, settings);
    const a = await setup(s);
    assert.equal(a.status, "PASS", `${JSON.stringify(settings)} ${JSON.stringify(a, null, 2)}`);
  }
});

test("[D-NI-VSCODE-GATE-1] doctor: chat.useHooks false in the user settings is a FAIL that names the file and the fix", async (t) => {
  const s = sandbox(t);
  assert.equal((await setup(s)).status, "PASS");
  put(s.user, '{\n  // keep\n  "chat.useHooks": false,\n}\n');
  const a = await doctor(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(regDetail(a).includes(s.user) && regDetail(a).includes("chat.useHooks"), regDetail(a));
  assert.ok(regDetail(a).includes("true"), regDetail(a));
});

test("[D-NI-VSCODE-GATE-1] setup: chat.useHooks false makes setup FAIL (hooks would never run)", async (t) => {
  const s = sandbox(t);
  put(s.user, { "chat.useHooks": false });
  const a = await setup(s);
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok(String(a.reason).includes("chat.useHooks"), a.reason);
});

test("[D-NI-VSCODE-GATE-1] doctor: chat.useHooks false in the workspace .vscode/settings.json wins over the user value", async (t) => {
  const s = sandbox(t);
  put(s.user, { "chat.useHooks": true });
  const ws = path.join(s.root, "project");
  put(path.join(ws, ".vscode", "settings.json"), { "chat.useHooks": false });
  const before = process.cwd();
  process.chdir(ws);
  try {
    assert.equal(vscodeSettingsGate(s.env, s.home, ws, path.join(s.root, "none.json"))?.includes(path.join(".vscode", "settings.json")), true);
    // the reverse: a workspace true wins over a user false
    put(s.user, { "chat.useHooks": false });
    put(path.join(ws, ".vscode", "settings.json"), { "chat.useHooks": true });
    assert.equal(vscodeSettingsGate(s.env, s.home, ws, path.join(s.root, "none.json")), undefined);
  } finally { process.chdir(before); }
});

for (const locations of [{}, { ".github/hooks": true }, { [HOOKS_DIR]: false }, { [HOOKS_DIR]: false, ".github/hooks": true }]) {
  test(`[D-NI-VSCODE-GATE-1] doctor: chat.hookFilesLocations ${JSON.stringify(locations)} leaves out ~/.copilot/hooks -> FAIL`, async (t) => {
    const s = sandbox(t);
    assert.equal((await setup(s)).status, "PASS");
    put(s.user, { "chat.hookFilesLocations": locations });
    const a = await doctor(s);
    assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
    assert.ok(regDetail(a).includes(s.user) && regDetail(a).includes("chat.hookFilesLocations") && regDetail(a).includes(HOOKS_DIR), regDetail(a));
  });
}

test("[D-NI-VSCODE-GATE-1] gate: managed-settings.json allowManagedHooksOnly or strictPluginOnlyCustomization true -> one line naming the file", async (t) => {
  for (const key of ["allowManagedHooksOnly", "strictPluginOnlyCustomization"]) {
    const s = sandbox(t);
    const managed = put(path.join(s.root, "managed-settings.json"), { [key]: true });
    const line = vscodeSettingsGate(s.env, s.home, s.root, managed);
    assert.ok(line && line.includes(managed) && line.includes(key), String(line));
  }
  const s = sandbox(t);
  const off = put(path.join(s.root, "managed-settings.json"), { allowManagedHooksOnly: false, strictPluginOnlyCustomization: false });
  assert.equal(vscodeSettingsGate(s.env, s.home, s.root, off), undefined);
});

test("[D-NI-VSCODE-GATE-1] gate: an unreadable or missing settings file is the host's to report, the gate stays silent", async (t) => {
  const s = sandbox(t);
  put(s.user, "{ not json");
  assert.equal(vscodeSettingsGate(s.env, s.home, s.root, path.join(s.root, "none.json")), undefined);
});
