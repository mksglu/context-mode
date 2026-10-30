// ADR-0020: hook gates for VS Code, Gemini CLI and Kiro.
// Area: 0020-gates-vscode-gemini-kiro (docs/v2/TEST-LAYOUT.md).
// Merged by ADR-0024 from 3 files (see docs/v2/TEST-LAYOUT.md). One describe block per old file; test names are unchanged.
// vscode-gate and gemini-gate are serial because their tests call process.chdir; kiro-gate runs concurrently.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { vscodeUserDirOf } from "../../src/core/project/config-dir.ts";
import { runDoctor, runSetup } from "../../src/setup/index.ts";
import { vscodeSettingsGate } from "../../src/setup/vscode-gate.ts";

describe("ADR-0020 VS Code gate (D-NI-VSCODE-GATE-1)", () => {
  // serial: tests call process.chdir.
  // D-NI-VSCODE-GATE-1: conditions under which VS Code (microsoft/vscode main, 1.144.0 bundle) has our hook file
  // ~/.copilot/hooks/context-mode-vscode.json but loads no hook (promptsServiceImpl.ts getHooks: `useChatHooks &&
  // isWorkspaceTrusted && areAgentHooksAllowed`; PromptsConfig.getLocationsValue + getPromptSourceFolders):
  //   - chat.useHooks is false (user settings.json, or the workspace .vscode/settings.json);
  //   - chat.hookFilesLocations is set and leaves out "~/.copilot/hooks" (a configured object replaces the defaults);
  //   - managed-settings.json (GitHubCopilot) has allowManagedHooksOnly or strictPluginOnlyCustomization true.
  // Doctor and setup only read these files; they never write a user's setting.


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
    const skills = path.join(import.meta.dirname, "..", "..", "skills");
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
});

describe("ADR-0020 Gemini gate (D-NI-GEMINI-GATE-1)", () => {
  // serial: tests call process.chdir.
  // D-NI-GEMINI-GATE-1: gemini-cli 0.66.0 runs an extension hook only when (a) the extension is enabled for the user AND the
  // workspace scope (`Enabled (Workspace):` in `gemini extensions list`), (b) merged settings hooksConfig.enabled is not false
  // (system > workspace > user), (c) the hook command is not in hooksConfig.disabled (union of all scopes), (d) no admin
  // setting turns extensions off. Live (temp HOME, fake local model): each of these made the real binary skip our hook, and
  // `gemini extensions list` still showed the extension enabled for the user. Doctor and setup must FAIL with a one-line fix.


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
    const skills = path.join(import.meta.dirname, "..", "..", "skills");
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
});

// Independent blocks (own temp dirs, no process-wide state): they run at the same time.
describe("ADR-0020 gates (concurrent blocks)", { concurrency: true }, () => {
  describe("ADR-0020 Kiro gate", { concurrency: true }, () => {
    // D-NI-KIRO-GATE-1: kiro-cli 2.35.2 (V3 engine, real binary, temp HOME) logs `hooks.reload.loaded {read, registered}` and counts a
    // hook with "enabled": false as registered. The docs (kiro.dev/docs/cli/v3/hooks-migration, hooks[].enabled: "Set false to skip
    // the hook without deleting it") say it does not run. A disabled own entry looks installed but never fires: doctor must FAIL
    // with a one-line fix, and setup must rewrite only our own entry back to enabled.


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
      const skills = path.join(import.meta.dirname, "..", "..", "skills");
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
  });
});
