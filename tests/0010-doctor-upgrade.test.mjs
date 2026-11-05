// tests/0010-doctor-upgrade.test.mjs
// Area: ADR-0010 (ctx_doctor, ctx_upgrade), PRD-v2 section 13, TECH-SPEC GP11.
// One file per ADR area (ADR-0024). A new doctor or upgrade test goes into the describe block of its section.
import { after, before, describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync, chmodSync, readdirSync, renameSync, symlinkSync, unlinkSync, readlinkSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { checkDoubleFire, checkHostConfig, checkV1Leftovers, composeMatcher } from "../src/core/ops/doctor-config.ts";
import { bundleDirOf, ownBundleDir } from "../src/core/ops/bundle-dir.ts";
import { openReadOnlyHandle } from "../src/core/store/open-read.ts";
import { nodeLaunch } from "../src/core/sandbox/host-node.ts";
import { getAdapter, ADAPTERS } from "../src/adapters/table.ts";
import { checkDb, checkIndex } from "../src/core/ops/doctor-db.ts";
import { openDb, closeDb } from "../src/core/store/db.ts";
import * as C from "../src/core/contracts/constants.ts";
import { SCHEMA_VERSION, TOOL_ORDER } from "../src/core/contracts/constants.ts";
import { bundleVersion, channelOf, fetchCause, checkMcp, checkMode, checkNode, checkProject, checkVersion, compareVersions, parseVersion } from "../src/core/ops/doctor-env.ts";
import { checkHookRoundTrip, codexHookJournaled, payloadFor } from "../src/core/ops/doctor-hook.ts";
import { DDL } from "../src/core/store/schema.ts";
import { healD8 } from "../src/core/ops/db-heal.ts";
import { writeOwnerPid } from "../src/core/store/owners.ts";
import { CtxError } from "../src/core/contracts/errors.ts";
import { buildReport } from "../src/core/ops/report.ts";
import { verifySums } from "../src/core/ops/verify-sums.ts";
import { ctxDoctor, runDoctorChecks } from "../src/core/tools/doctor.ts";
import { ctxUpgrade, runUpgrade } from "../src/core/tools/upgrade.ts";
import { buildRegistry, hookRunsCheck, runSetup } from "../src/setup/index.ts";
import { generateManifests } from "../build/manifests.ts";
import { fakeCodexBin, trustedToml } from "./_lib/codex-fake.mjs";

// D-WIN-RM-RETRY-1 (same rule as D-M3-F-9 and tests 0002, 0007, 0009): retry the temp cleanup, and on win32 only keep a
// folder that a child process still holds (EPERM) in the runner temp dir. Every other error still fails the test.
function rmTempDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    if (process.platform !== "win32" || err.code !== "EPERM") throw err;
  }
}

// D-ORPHAN-WAL-1 (tester, next.34): "With the main DB deliberately removed and WAL left, doctor just repeats 'run ctx_doctor'."
// A real context.db with one canary row still in its WAL; then only context.db goes away, -wal and -shm stay byte for byte.
async function seedOrphanWal(p) {
  const db = await openDb(p);
  db.raw.exec("PRAGMA wal_autocheckpoint = 0");
  db.raw.exec("CREATE TABLE canary(v TEXT)");
  db.raw.prepare("INSERT INTO canary VALUES (?)").run("REAL_WAL_CANARY value=614972");
  const main = readFileSync(p.dbPath);
  const wal = readFileSync(p.dbPath + "-wal");
  const shm = readFileSync(p.dbPath + "-shm");
  db.raw.close();
  for (const s of ["", "-wal", "-shm"]) rmSync(p.dbPath + s, { force: true });
  writeFileSync(p.dbPath + "-wal", wal);
  writeFileSync(p.dbPath + "-shm", shm);
  return { main, wal, shm };
}
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

describe("ADR-0010 doctor D3, D4, D5b: host config, double fire, v1 leftovers", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §5 D3, D4, D5b; DEVIATIONS D-M5-arch-3, D-M5-D2-1..4.


  function tmp(t) {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-doctor-config-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }
  const put = (file, value) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), "utf8");
  };

  // A Codex install as ctx_upgrade + the release hook file would leave it.
  function codexInstall(home, opts = {}) {
    const codexDir = opts.codexDir ?? path.join(home, ".codex");
    const row = getAdapter("codex");
    const cmd = opts.cmd ?? "node /opt/cm/hook.mjs --agent codex";
    const hooks = {};
    for (const [canonical, native] of Object.entries(row.eventMap)) {
      const group = { hooks: [{ type: "command", command: cmd, timeout: opts.timeout ?? 5 }] };
      if (canonical === "PreToolUse" || canonical === "PostToolUse") group.matcher = opts.matcher ?? composeMatcher(row, canonical);
      hooks[native] = [group];
    }
    put(path.join(codexDir, "hooks.json"), { hooks });
    // JSON string escapes are TOML basic-string escapes: a Windows path keeps its backslashes (D-M3-F-9 rule).
    const serverArgs = JSON.stringify([path.join(path.dirname(process.argv[1] ?? ""), "server.mjs"), "--agent", "codex"]);
    put(path.join(codexDir, "config.toml"), `model = "o1"\n${opts.features ?? ""}\n[mcp_servers.context-mode]\ncommand = "node"\nargs = ${serverArgs}\nomit_tools_from = ["deferred"]\ndefault_tools_approval_mode = "approve"\n`);
    return row;
  }

  test("[M5] doctor-config/composeMatcher-is-buildMatcher-text", async () => {
    const { buildMatcher } = await import("../build/manifests.ts");
    for (const id of ["claude-code", "codex", "qwen", "zcode"]) {
      assert.equal(composeMatcher(getAdapter(id)), buildMatcher(getAdapter(id)));
    }
  });

  test("[M5] doctor-config/hook-matcher-valid-regex: composed matcher hits a real tool name (#1222)", () => {
    for (const id of ["claude-code", "codex", "qwen", "zcode"]) {
      const row = getAdapter(id);
      const re = new RegExp(composeMatcher(row));
      assert.ok(Object.values(row.nativeTools).flat().some((n) => re.test(n)) || re.test(row.toolNamePrefix + "ctx_execute"));
      assert.ok(re.test(row.toolNamePrefix + "ctx_search"));
    }
  });

  test("[M5] doctor-config/D3-codex-pass-no-features-hooks-key-means-true (#1152 #1153)", (t) => {
    const home = tmp(t);
    const row = codexInstall(home);
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test("[M5] doctor-config/D3-codex-features-hooks-false-fails-hook-entries", (t) => {
    const home = tmp(t);
    const row = codexInstall(home, { features: "[features]\nhooks = false\n" });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "FAIL");
    assert.equal(d3.detail, "wrong: hook entries");
    assert.equal(d3.fixCommand, "run ctx_upgrade");
  });

  // D-C166-NATIVE-CWD-1 (tester report, Codex 0.166.0-alpha.5.1): the native route (`codex plugin add context-mode@context-mode`)
  // writes no mcp_servers entry and no hooks.json. Codex holds the entries in the plugin cache, <CODEX_HOME>/plugins/cache/
  // <marketplace>/context-mode/<version>/.codex-plugin/{mcp,hooks}.json, and the plugin switch in config.toml.
  function codexNative(home, opts = {}) {
    const codexDir = path.join(home, ".codex");
    const out = path.join(home, "release");
    generateManifests(out);
    const dir = path.join(codexDir, "plugins", "cache", "context-mode", "context-mode", "1.0.0");
    mkdirSync(dir, { recursive: true });
    cpSync(path.join(out, ".codex-plugin"), path.join(dir, ".codex-plugin"), { recursive: true });
    if (opts.edit !== undefined) opts.edit(path.join(dir, ".codex-plugin"));
    put(path.join(codexDir, "config.toml"), `model = "o1"\n[plugins."context-mode@context-mode"]\nenabled = ${opts.enabled ?? true}\n`);
    return getAdapter("codex");
  }
  const editJson = (name, fn) => (dir) => {
    const file = path.join(dir, name);
    const value = JSON.parse(readFileSync(file, "utf8"));
    fn(value);
    writeFileSync(file, JSON.stringify(value));
  };

  test("D3 codex native plugin: the plugin's own MCP and hook entries PASS (tester: 'wrong: MCP entry, hook entries')", (t) => {
    const home = tmp(t);
    const row = codexNative(home);
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test("D3 codex native plugin: CODEX_HOME moves where the plugin cache is read", (t) => {
    const home = tmp(t);
    const row = codexNative(home);
    const elsewhere = path.join(home, "elsewhere");
    cpSync(path.join(home, ".codex"), elsewhere, { recursive: true });
    rmSync(path.join(home, ".codex"), { recursive: true });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home, CODEX_HOME: elsewhere }, home);
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test("D3 codex native plugin switched off in config.toml is still wrong", (t) => {
    const home = tmp(t);
    const row = codexNative(home, { enabled: false });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "FAIL");
    assert.equal(d3.detail, "wrong: MCP entry, hook entries");
  });

  test("D3 codex native plugin: an MCP entry for another agent names MCP entry only", (t) => {
    const home = tmp(t);
    const row = codexNative(home, { edit: editJson("mcp.json", (v) => { v.mcpServers["context-mode"].args = ["./server.mjs", "--agent", "gemini"]; }) });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "FAIL");
    assert.equal(d3.detail, "wrong: MCP entry");
  });

  test("D3 codex native plugin: a plugin hook file with a wrong matcher names hook entries only", (t) => {
    const home = tmp(t);
    const row = codexNative(home, { edit: editJson("hooks.json", (v) => { v.hooks.PreToolUse[0].matcher = "Bash"; }) });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "FAIL");
    assert.equal(d3.detail, "wrong: hook entries");
  });

  test("[M5] doctor-config/D3-wrong-matcher-names-hook-entries", (t) => {
    const home = tmp(t);
    const row = codexInstall(home, { matcher: "Bash" });
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: hook entries");
  });

  test("[M5] doctor-config/D3-bad-timeout-names-hook-timeout", (t) => {
    const home = tmp(t);
    const row = codexInstall(home, { timeout: "5" });
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: hook timeout");
  });

  test("[M5] doctor-config/user-hook-timeout-kept: a user-set timeout is a valid value, not a FAIL (#1226)", (t) => {
    const home = tmp(t);
    const row = codexInstall(home, { timeout: 45 });
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "PASS");
  });

  test("[D-N6-CODEX-HOME-2] doctor-config/D3 reads codex config.toml and hooks.json from CODEX_HOME when it is set", (t) => {
    const home = tmp(t);
    const codexDir = path.join(tmp(t), "codex-home");
    const row = codexInstall(home, { codexDir });
    assert.equal(checkHostConfig(row, { HOME: home, CODEX_HOME: codexDir }, home).status, "PASS");
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: MCP entry, hook entries");
    codexInstall(home, { codexDir, features: "[features]\nhooks = false\n" });
    assert.equal(checkHostConfig(row, { HOME: home, CODEX_HOME: codexDir }, home).detail, "wrong: hook entries");
    assert.equal(checkHostConfig(row, { HOME: home, CODEX_HOME: "" }, home).detail, "wrong: MCP entry, hook entries");
  });

  test("[M5] doctor-config/D3-empty-home-names-all-three-parts-for-codex", (t) => {
    const home = tmp(t);
    const d3 = checkHostConfig(getAdapter("codex"), { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "FAIL");
    assert.equal(d3.detail, "wrong: MCP entry, hook entries");
  });

  test("[M5] doctor-config/D3-broken-config-is-FAIL-not-throw", (t) => {
    const home = tmp(t);
    const row = codexInstall(home);
    put(path.join(home, ".codex", "hooks.json"), "{ not json");
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "FAIL");
  });

  test("[M5] doctor-config/D4-folds-every-finding-into-one-row", (t) => {
    const home = tmp(t);
    const empty = tmp(t);
    assert.equal(checkV1Leftovers("claude-code", home, { tmp: empty }).status, "PASS");
    put(path.join(home, ".claude", "settings.json"), { mcpServers: { "context-mode": { command: "node", args: ["v1/server.js"] } } });
    mkdirSync(path.join(home, ".claude", "context-mode"), { recursive: true });
    const d4 = checkV1Leftovers("claude-code", home, { tmp: empty });
    assert.equal(d4.id, "D4");
    assert.equal(d4.status, "WARN", "D-D4-WARN-1 (#1304): a 1.x leftover is WARN, not FAIL");
    assert.ok(d4.detail.split("; ").length >= 2, d4.detail);
    assert.equal(d4.fixCommand, "run ctx_upgrade");
  });

  test("[M5] doctor-config/D5b-double-fire-detected", (t) => {
    const repo = tmp(t);
    assert.equal(checkDoubleFire("claude-code", repo).status, "PASS");
    put(path.join(repo, ".claude", "settings.json"), { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } });
    assert.equal(checkDoubleFire("claude-code", repo).status, "PASS");
    put(path.join(repo, ".vscode", "settings.json"), '{\n  // jsonc comment\n  "chat.useClaudeHooks": true,\n}\n');
    for (const agent of ["claude-code", "vscode"]) {
      const d5b = checkDoubleFire(agent, repo);
      assert.equal(d5b.status, "FAIL");
      assert.equal(d5b.detail, "both Claude Code hooks and VS Code chat.useClaudeHooks are active for this repo");
      assert.equal(d5b.fixCommand, "disable chat.useClaudeHooks or the Claude Code hooks block");
    }
    assert.equal(checkDoubleFire("codex", repo).status, "PASS");
  });

  // GP11 pi-discovery-dirs-doctor (#1168), pi-doctor-real-paths (#1266); DEVIATIONS D-M7-G2-1.
  const piSettings = (dir, packages) => put(path.join(dir, "settings.json"), { packages });
  const PI_GIT = "git:github.com/mksglu/context-mode@release";

  test("[M7] doctor-config/D3-pi-reports-default-agent-dir-path (#1266)", (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".pi", "agent");
    piSettings(dir, [PI_GIT]);
    const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", d3.detail);
    assert.ok(d3.detail.includes(path.join(dir, "settings.json")), d3.detail);
  });

  test("[M7] doctor-config/D3-pi-PI_CODING_AGENT_DIR-wins, legacy path never named (#1168 #1035)", (t) => {
    const home = tmp(t);
    const custom = tmp(t);
    piSettings(custom, [PI_GIT]);
    const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: custom }, home);
    assert.equal(d3.status, "PASS", d3.detail);
    assert.ok(d3.detail.includes(path.join(custom, "settings.json")), d3.detail);
    assert.ok(!d3.detail.includes(path.join(home, ".pi")), d3.detail);
  });

  // D-R38-PI-D3-1 (host audit pi-1, #1312 armingx and worldofgeese): every spec `pi install` writes is the install.
  for (const spec of ["npm:context-mode", "npm:context-mode@next", "npm:context-mode@2.1.0", { source: "npm:context-mode" }, PI_GIT]) {
    test(`[D-R38-PI-D3-1] doctor-config/D3-pi-native-install ${JSON.stringify(spec)} is PASS (#1312)`, (t) => {
      const home = tmp(t);
      piSettings(path.join(home, ".pi", "agent"), [spec]);
      const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home }, home);
      assert.equal(d3.status, "PASS", d3.detail);
    });
  }

  test("[D-R38-PI-D3-1] doctor-config/D3-pi `pi install -l` project entry is PASS and names the project file", (t) => {
    const home = tmp(t);
    const repo = tmp(t);
    piSettings(path.join(repo, ".pi"), ["npm:context-mode"]);
    // Pi runs `pi install -l` only in a trusted project (package-manager.js assertProjectTrustedForScope).
    put(path.join(home, ".pi", "agent", "trust.json"), { [repo]: true });
    const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home }, repo);
    assert.equal(d3.status, "PASS", d3.detail);
    assert.ok(d3.detail.includes(path.join(repo, ".pi", "settings.json")), d3.detail);
  });

  // D-R41-PI-1315-1 (#1315 peperonid): the reporter's own install. `pi install npm:context-mode` wrote the npm spec into
  // ~/.pi/agent/settings.json and Pi put 2.1.0 at ~/.pi/agent/npm/node_modules/context-mode. D3 is PASS and D4 keeps
  // the npm package out of its old-entry list.
  test("[D-R41-PI-1315-1] doctor-config/D3 PASS and D4 without the npm package for the #1315 Pi install", (t) => {
    const home = tmp(t);
    const piDir = path.join(home, ".pi", "agent");
    piSettings(piDir, ["npm:context-mode"]);
    put(path.join(piDir, "npm", "node_modules", "context-mode", "package.json"), { name: "context-mode", version: "2.1.0" });
    const env = { HOME: home, USERPROFILE: home };
    const d3 = checkHostConfig(getAdapter("pi"), env, home);
    assert.equal(d3.status, "PASS", d3.detail);
    assert.ok(d3.detail.includes(path.join(piDir, "settings.json")), d3.detail);
    const d4 = checkV1Leftovers("pi", home, { piAgentDir: piDir, tmp: tmp(t) });
    assert.equal(d4.status, "PASS", d4.detail);
  });

  test("[M7] doctor-config/D3-pi-missing-package-FAIL-names-the-file-read", (t) => {
    const home = tmp(t);
    const custom = tmp(t);
    const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: custom }, home);
    assert.equal(d3.status, "FAIL");
    assert.ok(d3.detail.startsWith("wrong: MCP entry"), d3.detail);
    assert.ok(d3.detail.includes(path.join(custom, "settings.json")), d3.detail);
    assert.equal(d3.fixCommand, "pi install npm:context-mode"); // D-R38-PI-D3-1: Pi's own install command
  });

  test("[D-N6-CODEX-DIRECT-1] doctor-config/D3 names the MCP entry when the codex entry lacks omit_tools_from deferred", (t) => {
    const home = tmp(t);
    const row = codexInstall(home);
    const file = path.join(home, ".codex", "config.toml");
    const text = readFileSync(file, "utf8");
    put(file, text.split('omit_tools_from = ["deferred"]\n').join(""));
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: MCP entry");
  });

  test("[D-N7-CODEX-APPROVE-1] doctor-config/D3 names the MCP entry when the codex entry lacks default_tools_approval_mode approve", (t) => {
    const home = tmp(t);
    const row = codexInstall(home);
    const file = path.join(home, ".codex", "config.toml");
    const text = readFileSync(file, "utf8");
    put(file, text.split('default_tools_approval_mode = "approve"\n').join(""));
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: MCP entry");
  });

  // W-CODEX-1 (D-VT-DOCTOR-CMD-1): setup writes `"<execPath>" "<dir>/hook.mjs" --agent <id>`; doctor must own it.
  test("[D-VT-DOCTOR-CMD-1] doctor-config/D3 owns the quoted absolute-path hook command setup writes (Windows, POSIX)", (t) => {
    const cmds = [
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\a b\\AppData\\ctx\\hook.mjs" --agent codex',
      '"/usr/local/bin/node" "/opt/my dir/cm/hook.mjs" --agent codex',
      '"C:\\Program Files\\nodejs\\NODE.EXE" "C:\\ctx\\hook.mjs" --agent codex',
      'node "/opt/my dir/cm/hook.mjs" --agent codex',
    ];
    for (const cmd of cmds) {
      const home = tmp(t);
      const row = codexInstall(home, { cmd });
      const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
      assert.equal(d3.status, "PASS", `${cmd}: ${d3.detail}`);
    }
  });

  test("[D-VT-DOCTOR-CMD-1] doctor-config/D3 rejects a hook command whose first token is not node or whose agent differs", (t) => {
    const cmds = [
      '"C:\\tools\\python.exe" "C:\\ctx\\hook.mjs" --agent codex',
      '"/usr/bin/nodejs-foo" "/opt/cm/hook.mjs" --agent codex',
      '"/usr/bin/node" "/opt/cm/other.mjs" --agent codex',
      '"/usr/bin/node" "/opt/cm/hook.mjs" --agent gemini',
      '"/usr/bin/node "/opt/cm/hook.mjs" --agent codex',
    ];
    for (const cmd of cmds) {
      const home = tmp(t);
      const row = codexInstall(home, { cmd });
      assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "FAIL", cmd);
    }
  });

  // Runs on every OS; on win32 process.execPath is the real "C:\Program Files\nodejs\node.exe" form (D-VT-DOCTOR-CMD-1).
  test("[D-VT-DOCTOR-CMD-1] doctor-config/D3 owns the exact command setup builds from the real process.execPath", async (t) => {
    const { hookCommandString } = await import("../src/setup/registry.ts");
    const cmd = hookCommandString({ hookCommand: [process.execPath, path.join(tmp(t), "dir with space", "hook.mjs"), "--agent", "codex"] });
    const home = tmp(t);
    const row = codexInstall(home, { cmd });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", `${cmd}: ${d3.detail}`);
  });

  // GEM-WIN-4: Gemini and Qwen ship their hooks inside the extension (<ext>/hooks/hooks.json, <ext>/hooks/qwen.json), not in
  // ~/.<agent>/settings.json. Gemini's command names the script as "${extensionPath}${/}hook.mjs" (the host fills ${/} with
  // the OS separator). Runs on every OS: the files come from the real generator, the paths are plain temp dirs.
  async function extensionInstall(t, id, mutate = (s) => s) {
    const { generateManifests } = await import("../build/manifests.ts");
    const base = tmp(t);
    const out = path.join(base, "out");
    mkdirSync(out);
    generateManifests(out);
    const home = path.join(base, "home");
    const ext = path.join(home, `.${id}`, "extensions", "context-mode");
    mkdirSync(path.join(ext, "hooks"), { recursive: true });
    const file = id === "gemini" ? "hooks.json" : `${id}.json`;
    writeFileSync(path.join(ext, "hooks", file), mutate(readFileSync(path.join(out, "hooks", file), "utf8")), "utf8");
    return { home, row: getAdapter(id), file: path.join(ext, "hooks", file) };
  }

  for (const id of ["gemini", "qwen"]) {
    test(`[GEM-WIN-4] doctor-config/D3 reads the ${id} extension hook file the build generates and passes`, async (t) => {
      const { home, row } = await extensionInstall(t, id);
      const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
      assert.equal(d3.status, "PASS", d3.detail);
    });

    test(`[GEM-WIN-4] doctor-config/D3 fails a ${id} extension whose hook command is not ours`, async (t) => {
      const { home, row } = await extensionInstall(t, id, (s) => s.replaceAll("hook.mjs", "other.mjs"));
      assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "FAIL");
    });
  }

  test("[GEM-WIN-4] doctor-config/D3 gemini: the ${/} token is a separator, a bare ${extensionPath} suffix is not", async (t) => {
    const real = await extensionInstall(t, "gemini");
    assert.match(readFileSync(real.file, "utf8"), /\$\{extensionPath\}\$\{\/\}hook\.mjs/);
    const bad = await extensionInstall(t, "gemini", (s) => s.replaceAll("${extensionPath}${/}hook.mjs", "${extensionPath}hook.mjs"));
    assert.equal(checkHostConfig(bad.row, { HOME: bad.home, USERPROFILE: bad.home }, bad.home).status, "FAIL");
  });

  // D-DOC-D3-ROOT-1: Claude Code 2.1.311 puts the plugin under plugins/cache/<marketplace>/context-mode/<version> and records
  // that dir as installPath. D3 must read hooks/claude-code.json from there (tester report 2, next.8: "wrong: hook entries").
  for (const [name, layout] of [["versioned", true], ["flat", false]]) {
    for (const spaced of [false, true]) {
      test(`[D-DOC-D3-ROOT-1] doctor-config/D3 claude-code ${name} plugin cache${spaced ? ", space in HOME" : ""} passes`, async (t) => {
        const { generateManifests } = await import("../build/manifests.ts");
        const base = tmp(t);
        const out = path.join(base, "out");
        mkdirSync(out);
        generateManifests(out);
        const home = path.join(base, spaced ? "my home" : "home");
        const plugins = path.join(home, ".claude", "plugins");
        const root = layout ? path.join(plugins, "cache", "context-mode", "context-mode", "2.0.0-next.8") : path.join(plugins, "cache", "mp", "context-mode");
        put(path.join(root, "hooks", "claude-code.json"), readFileSync(path.join(out, "hooks", "claude-code.json"), "utf8"));
        if (layout) put(path.join(plugins, "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ scope: "user", installPath: root }] } }));
        const d3 = checkHostConfig(getAdapter("claude-code"), { HOME: home, USERPROFILE: home }, home);
        assert.equal(d3.status, "PASS", d3.detail);
      });
    }
  }

  // D-OC2-D3-PLUGINS-1 (#1307, bhazard451, OpenCode 2.2.5 on Windows): "D3 PASS on an OpenCode 2.x plugin install".
  // The reporter's file: ~/.config/opencode/opencode.jsonc with "plugins": ["context-mode@2.0.1"].
  const OC2_CASES = [
    ["the reporter's plugins array with name@version (#1307)", "// ~/.config/opencode/opencode.jsonc\n{\n  \"plugins\": [\"context-mode@2.0.1\"]\n}\n", "PASS"],
    ["the plugins array with the bare name (opencode plugin add context-mode)", "{\n  \"plugins\": [\"context-mode\"]\n}\n", "PASS"],
    ["the plugin array with name@tag (OpenCode 1.x native install)", "{\n  \"plugin\": [\"context-mode@latest\"]\n}\n", "PASS"],
    ["the plugins array with the release git spec", `{ "plugins": ["${C.OPENCODE_GIT_SPEC}"] }`, "PASS"],
    ["a plugins array that holds only another plugin", "{\n  \"plugins\": [\"other-plugin@1.0.0\", \"context-mode-extra@1.0.0\"]\n}\n", "FAIL"],
  ];
  for (const [name, text, want] of OC2_CASES) {
    test(`[D-OC2-D3-PLUGINS-1] doctor-config/D3 opencode: ${name} is ${want}`, (t) => {
      const home = tmp(t);
      put(path.join(home, ".config", "opencode", "opencode.jsonc"), text);
      const d3 = checkHostConfig(getAdapter("opencode"), { HOME: home, USERPROFILE: home }, home);
      assert.equal(d3.status, want, d3.detail);
    });
  }

  // D-R44-OC-D3-1 (#1310, host audit opencode-4): the plugin file path and the local MCP entry (2.x mcp.servers, 1.x mcp) are own entries.
  const bundle = ownBundleDir();
  const OC_OWN = [
    ["the plugin file path inside the package", JSON.stringify({ plugins: [path.join(bundle, "opencode", "plugin.js")] })],
    ["the package dir", JSON.stringify({ plugin: [bundle] })],
    ["mcp.servers.context-mode (2.x form)", JSON.stringify({ mcp: { servers: { "context-mode": { type: "local", command: ["node", path.join(bundle, "server.mjs"), "--agent", "opencode"] } } } })],
    ["mcp.context-mode (1.x form)", JSON.stringify({ mcp: { "context-mode": { type: "local", command: ["node", path.join(bundle, "server.mjs"), "--agent", "opencode"] } } })],
  ];
  for (const [name, text] of OC_OWN) {
    test(`[D-R44-OC-D3-1] doctor-config/D3 opencode: ${name} is PASS`, (t) => {
      const home = tmp(t);
      put(path.join(home, ".config", "opencode", "opencode.json"), text);
      const d3 = checkHostConfig(getAdapter("opencode"), { HOME: home, USERPROFILE: home }, home);
      assert.equal(d3.status, "PASS", d3.detail);
    });
  }

  test("[D-R44-OC-D3-1] doctor-config/D3 opencode: an mcp entry that runs another script is FAIL", (t) => {
    const home = tmp(t);
    put(path.join(home, ".config", "opencode", "opencode.json"), JSON.stringify({ mcp: { servers: { "context-mode": { type: "local", command: ["node", "/x/other.mjs", "--agent", "opencode"] } } } }));
    assert.equal(checkHostConfig(getAdapter("opencode"), { HOME: home, USERPROFILE: home }, home).status, "FAIL");
  });
});

describe("ADR-0010 doctor D3 fix: setup fixes a wrong or missing MCP entry (D-D3-SETUP-FIX-1)", { concurrency: CONC }, () => {
  // Tester, next.34 (Windows, OpenCode, empty profile): "FAIL opencode: D3 — wrong: MCP entry. Fix: run ctx_upgrade" while the
  // closing line says "Run in a terminal: context-mode setup --agents opencode". One rule: an MCP part in D3 -> the setup command.
  for (const row of ADAPTERS) {
    test(`[M5] doctor-config/D3-${row.id}-empty-home-fix-is-the-setup-command`, (t) => {
      const home = mkdtempSync(path.join(tmpdir(), "cm-d3-fix-"));
      t.after(() => rmTempDir(home));
      const env = { HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming"), XDG_CONFIG_HOME: path.join(home, ".config") };
      const d3 = checkHostConfig(row, env, home);
      assert.equal(d3.status, "FAIL", row.id);
      // D-R38-PI-D3-1: Pi's fix is its own install command (owner rule: each agent's native install).
      if (row.id === "pi") assert.equal(d3.fixCommand, "pi install npm:context-mode", d3.detail);
      else if (d3.detail.includes("MCP entry")) assert.equal(d3.fixCommand, `context-mode setup --agents ${row.id}`, row.id + ": " + d3.detail);
      else assert.ok(d3.fixCommand === "run ctx_upgrade" || d3.fixCommand.startsWith("context-mode setup"), row.id + ": " + d3.fixCommand);
    });
  }
});

describe("ADR-0010 doctor D8, D9: database and index checks", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §5 D8 D9, impl/02 (store), DEVIATIONS D-M5-U1-6, D-M5-D4-1..4.
  // D8: stale schema and integrity_check are two distinct FAIL causes under one row id (A-T5).
  // D9: empty index is PASS with "0 sources, 0 chunks indexed" (#1014).


  function project(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-doctor-db-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const projectDir = path.join(root, "projects", "p1");
    mkdirSync(projectDir, { recursive: true });
    return {
      projectKey: "p1", projectDir, dbPath: path.join(projectDir, "context.db"),
      worktree: root, containmentRoot: root, agent: "claude-code", source: "spawn-cwd",
    };
  }

  async function freshDb(p) {
    const db = await openDb(p);
    closeDb(db);
  }

  // D-R44-OC-SQLITE-RO-1 (#1310, opencode-3): under Bun the read-only open is a normal open plus query_only.
  test("[D-R44-OC-SQLITE-RO-1] doctor-db/bun read-only handle reads and refuses writes", async (t) => {
    const p = project(t);
    await freshDb(p);
    const raw = openReadOnlyHandle(await import("node:sqlite"), p.dbPath, { bun: "1.4.4" });
    try {
      assert.equal(Number(Object.values(raw.prepare("PRAGMA user_version").get())[0]), SCHEMA_VERSION);
      assert.throws(() => raw.exec("CREATE TABLE zz(a)"), /readonly/i);
    } finally {
      raw.close();
    }
    const heal = openReadOnlyHandle(await import("node:sqlite"), p.dbPath, { bun: "1.4.4", queryOnly: false });
    try { heal.prepare("VACUUM INTO ?").run(p.dbPath + ".copy"); } finally { heal.close(); rmSync(p.dbPath + ".copy", { force: true }); }
  });

  // D-R44-OC-HOSTNODE-1 (#1310, D5): a Bun host's execPath is the host binary; a real node from PATH runs the hook.
  test("[D-R44-OC-HOSTNODE-1] sandbox/nodeLaunch: node host keeps execPath, Bun host takes node from PATH, else BUN_BE_BUN", () => {
    const env = { PATH: "/p" };
    assert.deepEqual(nodeLaunch(env, { bun: undefined, execPath: "/usr/bin/node" }), { file: "/usr/bin/node", env });
    assert.deepEqual(nodeLaunch(env, { bun: "1.4.4", execPath: "/opt/opencode" }, () => "/usr/bin/node"), { file: "/usr/bin/node", env });
    assert.deepEqual(nodeLaunch(env, { bun: "1.4.4", execPath: "/opt/opencode" }, () => null), { file: "/opt/opencode", env: { PATH: "/p", BUN_BE_BUN: "1" } });
  });

  test("[M5] doctor-db/D8-pass-on-current-schema", async (t) => {
    const p = project(t);
    await freshDb(p);
    const r = await checkDb(p);
    assert.equal(r.row.id, "D8");
    assert.equal(r.row.status, "PASS");
    assert.equal(r.schemaStale, false);
    assert.equal(r.integrityFailed, false);
  });

  test("[M5] doctor-db/D8-stale-schema-FAIL-names-versions-and-upgrade", async (t) => {
    const p = project(t);
    await freshDb(p);
    const raw = new DatabaseSync(p.dbPath);
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION - 1}`);
    raw.close();
    const r = await checkDb(p);
    assert.equal(r.row.status, "FAIL");
    assert.equal(r.row.detail, `stale schema (v${SCHEMA_VERSION - 1}, expected v${SCHEMA_VERSION})`);
    assert.equal(r.row.fixCommand, "run ctx_upgrade");
    assert.equal(r.schemaStale, true);
    assert.equal(r.integrityFailed, false);
  });

  test("[M5] doctor-db/D8-integrity-check-FAIL-is-a-distinct-cause", async (t) => {
    const p = project(t);
    const raw = new DatabaseSync(p.dbPath);
    raw.exec("PRAGMA page_size = 4096; PRAGMA journal_mode = DELETE;");
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    raw.exec("CREATE TABLE t(x TEXT); CREATE INDEX t_x ON t(x);");
    const ins = raw.prepare("INSERT INTO t(x) VALUES (?)");
    for (let i = 0; i < 2000; i += 1) ins.run(`row-${i}-${"y".repeat(40)}`);
    raw.close();
    // Overwrite the middle of one index page: the header stays valid, integrity_check finds the damage.
    const buf = readFileSync(p.dbPath);
    const pages = buf.length / 4096;
    const page = Math.floor(pages * 0.75);
    for (let i = 100; i < 4000; i += 1) buf[page * 4096 + i] = (i * 7) & 0xff;
    writeFileSync(p.dbPath, buf);
    const r = await checkDb(p);
    assert.equal(r.row.status, "FAIL");
    assert.equal(r.row.detail, "integrity_check failed");
    assert.equal(r.row.fixCommand, "doctor will heal context.db on the next run");
    assert.equal(r.integrityFailed, true);
    assert.equal(r.schemaStale, false);
  });

  test("[M5] doctor-db/D8-not-a-database-is-integrity-cause-not-stale", async (t) => {
    const p = project(t);
    writeFileSync(p.dbPath, Buffer.alloc(8192, 0x41));
    const r = await checkDb(p);
    assert.equal(r.row.status, "FAIL");
    assert.equal(r.row.detail, "integrity_check failed");
    assert.equal(r.integrityFailed, true);
    assert.equal(r.schemaStale, false);
  });

  test("[M5] doctor-db/D8-missing-db-PASS-and-never-created", async (t) => {
    const p = project(t);
    const r = await checkDb(p);
    assert.equal(r.row.status, "PASS");
    assert.equal(existsSync(p.dbPath), false, "doctor must not create context.db");
  });

  test("[D-ORPHAN-WAL-1] D8 FAILs when context.db is missing and its -wal and -shm are left, naming both paths and byte sizes", async (t) => {
    const p = project(t);
    const { wal, shm } = await seedOrphanWal(p);
    const r = await checkDb(p);
    assert.equal(r.row.status, "FAIL");
    assert.equal(r.row.detail, C.D8_ORPHAN_DETAIL([{ path: p.dbPath + "-wal", bytes: wal.length }, { path: p.dbPath + "-shm", bytes: shm.length }]));
    assert.ok(r.row.detail.includes(p.dbPath + "-wal (" + wal.length + " bytes)"), r.row.detail);
    assert.ok(r.row.detail.includes(p.dbPath + "-shm (" + shm.length + " bytes)"), r.row.detail);
    assert.equal(r.row.fixCommand, C.D8_ORPHAN_FIX);
    assert.deepEqual(r.orphan, [{ path: p.dbPath + "-wal", bytes: wal.length }, { path: p.dbPath + "-shm", bytes: shm.length }]);
    assert.equal(existsSync(p.dbPath), false, "the check alone writes nothing");
    assert.equal(sha256(readFileSync(p.dbPath + "-wal")), sha256(wal));
  });

  test("[M5] doctor-db/D8-read-only-does-not-migrate-stale-db", async (t) => {
    const p = project(t);
    await freshDb(p);
    const raw = new DatabaseSync(p.dbPath);
    raw.exec("PRAGMA user_version = 1");
    raw.close();
    await checkDb(p);
    const again = new DatabaseSync(p.dbPath, { readOnly: true });
    assert.equal(again.prepare("PRAGMA user_version").get().user_version, 1);
    again.close();
  });

  test("[M5] doctor-db/D9-empty-index-PASS-with-zero-counts", async (t) => {
    const p = project(t);
    await freshDb(p);
    const row = await checkIndex(p);
    assert.equal(row.id, "D9");
    assert.equal(row.status, "PASS");
    assert.equal(row.detail, "0 sources, 0 chunks indexed");
  });

  test("[M5] doctor-db/D9-missing-db-PASS-with-zero-counts", async (t) => {
    const p = project(t);
    const row = await checkIndex(p);
    assert.equal(row.status, "PASS");
    assert.equal(row.detail, "0 sources, 0 chunks indexed");
    assert.equal(existsSync(p.dbPath), false);
  });

  test("[M5] doctor-db/D9-counts-sources-and-chunks", async (t) => {
    const p = project(t);
    await freshDb(p);
    const raw = new DatabaseSync(p.dbPath);
    const now = Date.now();
    const src = raw.prepare(
      "INSERT INTO sources(session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    src.run("s1", "/w", "claude-code", "content", "a", 10, 2, now, "2026-10-19", now);
    src.run("s1", "/w", "claude-code", "content", "b", 10, 1, now, "2026-10-19", now);
    const ch = raw.prepare("INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body) VALUES (?,?,?,?,?,?)");
    ch.run(1, "s1", "/w", "claude-code", 0, "alpha");
    ch.run(1, "s1", "/w", "claude-code", 1, "beta");
    ch.run(2, "s1", "/w", "claude-code", 0, "gamma");
    raw.close();
    const row = await checkIndex(p);
    assert.equal(row.status, "PASS");
    assert.equal(row.detail, "2 sources, 3 chunks indexed");
  });
});

describe("ADR-0010 doctor D1, D2, D6, D7: version, node, mcp, mode, project", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §5 D1 D2 D6 D7 D10, ADR-0010, DEVIATIONS D-M5-arch-3, D-M5-arch-5,
  // D-M5-C2-1, D-M5-U1-6, D-M5-D1-1.


  const SHA_A = "a".repeat(40);
  const SHA_B = "b".repeat(40);
  const VER = "2.0.0-next.26";
  const HEAD = `${VER} (aaaaaaa): `; // D-DOCTOR-D1-CAUSE-1: installed version and short bundle sha lead every detail
  const GIT_FIX = 'git ls-remote --tags --refs https://github.com/mksglu/context-mode.git "v*"';
  const NPM_FIX = "npm view context-mode dist-tags";
  const DEAD_REGISTRY = "http://127.0.0.1:9/dist-tags"; // default: fetch blocks port 9 ("bad port"), no network use in tests

  function tmp(t) {
    const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-doctor-env-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  // A fake `git` on PATH running one sh body (POSIX only: a #!/bin/sh script). `name` is git.exe for the win32 cases.
  function fakeGit(t, body, name = "git") {
    const bin = path.join(tmp(t), "bin");
    mkdirSync(bin);
    const file = path.join(bin, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    return { PATH: `${bin}:/bin:/usr/bin`, HOME: path.dirname(bin), USERPROFILE: path.dirname(bin) };
  }
  const noGit = (t) => ({ PATH: path.join(tmp(t), "empty"), HOME: tmp(t), USERPROFILE: tmp(t) });

  // A local registry that answers the dist-tags body (or an HTTP status) on 127.0.0.1.
  async function registry(t, status, body) {
    const server = createServer((_req, res) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    t.after(() => server.close());
    return `http://127.0.0.1:${server.address().port}/-/package/context-mode/dist-tags`;
  }

  const posix = process.platform !== "win32";
  const run = (env, bundleSha, o = {}) => checkVersion({
    bundleSha, version: "version" in o ? o.version : VER, registryUrl: o.registryUrl ?? DEAD_REGISTRY, timeoutMs: o.timeoutMs ?? 10000,
    env, cwd: env.HOME ?? tmpdir(), signal: new AbortController().signal,
  });

  test("[M5] doctor-env/D1-dev-build-is-UNKNOWN-without-spawning-git", async () => {
    const row = await run({ PATH: "" }, undefined);
    assert.deepEqual(row, { id: "D1", label: "version", status: "UNKNOWN", detail: C.D1_DEV_BUILD_DETAIL });
  });

  // D-DOCTOR-D1-TAGS-1 (packed run of 2.0.0-next.32: "| D1 version | FAIL | 2.0.0-next.32 (feb8de1): update available |"
  // although next.32 was the newest). D1 compared the bundle sha (the source commit, tag v2.0.0-next.32 -> feb8de11) with the
  // head of the release branch (the CI-built commit a730707b "release v2.0.0-next.32"): they never match. D1 now compares
  // versions in the bundle's channel: the npm dist-tag first (the user can only install what npm has), git tags after.
  // A fake git: `ls-remote --tags` prints one refs/tags line per name; any other call prints the release head `head`.
  // Every call appends its argv to $HOME/git-argv.
  const tagsGit = (tags, head = SHA_B) => `echo "$*" >> "$HOME/git-argv"; case "$*" in *--tags*) printf '${tags.map((v) => `${SHA_A}\\trefs/tags/${v}\\n`).join("")}';; *) printf '${head}\\trefs/heads/release\\n';; esac`;
  const AHEAD = "2.0.0-next.25";

  test("[M5] doctor-env/D1-release-head-sha-differs-from-bundle-sha-is-not-FAIL", { skip: !posix }, async (t) => {
    const env = fakeGit(t, tagsGit(["v2.0.0-next.25", `v${VER}`]));
    const row = await run(env, SHA_A, { registryUrl: await registry(t, 503, {}) });
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}latest next on GitHub tags; npm registry answered HTTP 503` });
    assert.equal(readFileSync(path.join(env.HOME, "git-argv"), "utf8"), "ls-remote --tags --refs https://github.com/mksglu/context-mode.git v*\n");
  });

  test("[M5] doctor-env/D1-npm-same-version-is-PASS-and-git-is-not-started", { skip: !posix }, async (t) => {
    const env = fakeGit(t, tagsGit(["v2.0.0-next.27"]));
    const row = await run(env, SHA_A, { registryUrl: await registry(t, 200, { latest: "1.0.169", next: VER }) });
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}latest next on npm` });
    assert.equal(existsSync(path.join(env.HOME, "git-argv")), false);
  });

  test("[M5] doctor-env/D1-npm-newer-is-FAIL-with-both-versions", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, tagsGit([`v${VER}`])), SHA_A, { registryUrl: await registry(t, 200, { latest: "1.0.169", next: "2.0.0-next.29" }) });
    assert.deepEqual(row, { id: "D1", label: "version", status: "FAIL", detail: `${HEAD}update available, next on npm is 2.0.0-next.29`, fixCommand: "run ctx_upgrade" });
  });

  test("[M5] doctor-env/D1-npm-down-git-tags-higher-next-is-FAIL-numeric-compare", { skip: !posix }, async (t) => {
    const ver = "2.0.0-next.9";
    const env = fakeGit(t, tagsGit(["v2.0.0-next.10", "v2.0.0-next.9", "v2.0.0-next.2"]));
    const row = await run(env, SHA_A, { version: ver, registryUrl: await registry(t, 503, {}) });
    assert.deepEqual(row, {
      id: "D1", label: "version", status: "FAIL",
      detail: `${ver} (aaaaaaa): update available, next on GitHub tags is 2.0.0-next.10; npm registry answered HTTP 503`, fixCommand: "run ctx_upgrade",
    });
  });

  test("[M5] doctor-env/D1-npm-down-git-tags-equal-is-PASS", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, tagsGit(["v2.0.0-next.1", `v${VER}`])), SHA_A, { registryUrl: await registry(t, 404, {}) });
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}latest next on GitHub tags; npm registry answered HTTP 404` });
  });

  test("[M5] doctor-env/D1-tags-of-the-other-channel-are-ignored", { skip: !posix }, async (t) => {
    const tags = ["v1.0.169", "v1.0.170-beta.1", "v2.0.0", "v3.0.0-beta.4", `v${VER}`, "vnot-a-version", "v2.0.0-next.x"];
    const url = await registry(t, 503, {});
    const next = await run(fakeGit(t, tagsGit(tags)), SHA_A, { registryUrl: url });
    assert.deepEqual(next, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}latest next on GitHub tags; npm registry answered HTTP 503` });
    const latest = await run(fakeGit(t, tagsGit(["v1.0.169", "v1.0.168", "v2.0.0-next.40"])), SHA_A, { version: "2.0.0", registryUrl: url });
    assert.deepEqual(latest, {
      id: "D1", label: "version", status: "PASS", detail: "2.0.0 (aaaaaaa): ahead of latest on GitHub tags (1.0.169); npm registry answered HTTP 503",
    });
  });

  test("[M5] doctor-env/D1-tag-without-npm-publish-npm-decides-PASS", { skip: !posix }, async (t) => {
    const ver = "2.0.0-next.30"; // next.31 was tagged but never published: the user cannot install it
    const env = fakeGit(t, tagsGit(["v2.0.0-next.31", "v2.0.0-next.30"]));
    const row = await run(env, SHA_A, { version: ver, registryUrl: await registry(t, 200, { latest: "1.0.169", next: ver }) });
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: `${ver} (aaaaaaa): latest next on npm` });
  });

  test("[M5] doctor-env/D1-dev-build-ahead-of-npm-and-tags-is-PASS-naming-both", { skip: !posix }, async (t) => {
    const env = fakeGit(t, tagsGit([`v${AHEAD}`]));
    const npm = await run(env, SHA_A, { registryUrl: await registry(t, 200, { next: AHEAD }) });
    assert.deepEqual(npm, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}ahead of next on npm (${AHEAD})` });
    const tags = await run(env, SHA_A, { registryUrl: await registry(t, 503, {}) });
    assert.deepEqual(tags, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}ahead of next on GitHub tags (${AHEAD}); npm registry answered HTTP 503` });
  });

  test("[M5] doctor-env/D1-compareVersions-semver-order", () => {
    assert.equal(compareVersions("2.0.0-next.10", "2.0.0-next.9"), 1);
    assert.equal(compareVersions("2.0.0-next.32", "2.0.0-next.32"), 0);
    assert.equal(compareVersions("2.0.0-next.32", "2.0.0"), -1);
    assert.equal(compareVersions("1.0.169", "1.0.17"), 1);
    assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
    assert.equal(compareVersions("2.0.0-beta.1", "2.0.0-next.1"), -1);
    assert.equal(compareVersions("2.0.0-next.x", "2.0.0-next.1"), null);
    assert.equal(parseVersion("2.0.0-next.1.1"), null);
    assert.equal(parseVersion("2.0"), null);
    assert.equal(parseVersion("v2.0.0"), null);
    assert.deepEqual(parseVersion("2.0.0-next.32"), { core: [2, 0, 0], pre: ["next", 32] });
    assert.deepEqual(parseVersion("1.0.169"), { core: [1, 0, 169], pre: [] });
  });

  // D-DOCTOR-D1-CAUSE-1 (Windows tester, 2.0.0-next.26, "| D1 version | UNKNOWN | no network | |" on a machine with
  // network): D1 passed the bare name "git" to runProcess, and on win32 an argv[0] with no extension starts as
  // [bash.exe, "git", ...], so bash read git as a script and exited 126. D1 now starts the git.exe found on PATH.
  // Platform spoof only around the synchronous part of checkVersion, as in the D-VT-WINBASH-1 cases: D1 looks up git.exe
  // before its first await (D-DOCTOR-D1-TAGS-1 reads npm first), and starts that full path, which has an extension.
  test("[M5] doctor-env/D1-win32-starts-git.exe-from-PATH-directly-not-through-bash", { skip: !posix }, async (t) => {
    const env = fakeGit(t, tagsGit([`v${VER}`]), "git.exe");
    const url = await registry(t, 503, {});
    const gitRoot = path.join(env.HOME, "Git", "bin"); // a Git Bash beside it: the old path ran "bash.exe git ls-remote ..."
    mkdirSync(gitRoot, { recursive: true });
    symlinkSync("/bin/sh", path.join(gitRoot, "bash.exe"));
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    const saved = process.env.PATH;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    process.env.PATH = `${path.join(env.HOME, "Git", "cmd")}:${env.PATH}`;
    let pending;
    try {
      pending = run({ ...env, PATHEXT: ".COM;.EXE;.BAT;.CMD" }, SHA_A, { registryUrl: url });
    } finally {
      Object.defineProperty(process, "platform", real);
      process.env.PATH = saved;
    }
    const row = await pending;
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}latest next on GitHub tags; npm registry answered HTTP 503` });
  });

  test("[M5] doctor-env/D1-git-missing-and-registry-down-is-UNKNOWN-with-both-causes-and-npm-fix", async (t) => {
    const server = createServer();
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    await new Promise((r) => server.close(r)); // a free local port: the connection is refused
    const row = await run(noGit(t), SHA_A, { registryUrl: `http://127.0.0.1:${port}/dist-tags` });
    assert.equal(row.status, "UNKNOWN");
    assert.ok(row.detail.startsWith(`${HEAD}latest unknown, npm registry: `), row.detail);
    assert.ok(row.detail.includes("ECONNREFUSED"), row.detail);
    assert.ok(row.detail.endsWith("; git not found on PATH"), row.detail);
    assert.ok(!row.detail.includes("  ") && !row.detail.includes(" ;"), row.detail); // D-D1-CAUSE-SPACE-1
    assert.equal(row.fixCommand, NPM_FIX);
  });

  // D-D1-CAUSE-SPACE-1 (tester, next.34 Windows: "npm registry: ECONNREFUSED  |"): a refused fetch on Windows has an
  // AggregateError cause with code ECONNREFUSED and an empty message; the cause text has no stray space.
  test("[M5] doctor-env/D1-npm-cause-text-is-exact (D-D1-CAUSE-SPACE-1)", () => {
    const refused = (message) => Object.assign(new Error("fetch failed"), { cause: Object.assign(new AggregateError([], message), { code: "ECONNREFUSED" }) });
    assert.equal(fetchCause(refused(""), 5000), "npm registry: ECONNREFUSED");
    assert.equal(fetchCause(refused("connect ECONNREFUSED 127.0.0.1:9"), 5000), "npm registry: connect ECONNREFUSED 127.0.0.1:9");
    assert.equal(fetchCause(Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }) }), 5000), "npm registry: ENOTFOUND getaddrinfo");
  });

  test("[M5] doctor-env/D1-git-exit-names-code-and-first-stderr-line", { skip: !posix }, async (t) => {
    const env = fakeGit(t, "echo 'fatal: unable to access the repo' >&2; echo 'second line' >&2; exit 128");
    const url = await registry(t, 503, {});
    const row = await run(env, SHA_A, { registryUrl: url });
    assert.deepEqual(row, {
      id: "D1", label: "version", status: "UNKNOWN",
      detail: `${HEAD}latest unknown, npm registry answered HTTP 503; git exit 128: fatal: unable to access the repo`, fixCommand: GIT_FIX,
    });
  });

  test("[M5] doctor-env/D1-git-timeout-names-the-limit", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, "sleep 5"), SHA_A, { timeoutMs: 300, registryUrl: await registry(t, 200, { latest: "1.0.168" }) });
    assert.deepEqual(row, {
      id: "D1", label: "version", status: "UNKNOWN",
      detail: `${HEAD}latest unknown, npm registry answered no next version; git timed out after 300 ms`, fixCommand: GIT_FIX,
    });
  });

  test("[M5] doctor-env/D1-git-answer-without-channel-tag-says-so", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, tagsGit(["v1.0.169"])), SHA_A, { registryUrl: await registry(t, 503, {}) });
    assert.deepEqual(row, { id: "D1", label: "version", status: "UNKNOWN", detail: `${HEAD}latest unknown, npm registry answered HTTP 503; git answered no next tag`, fixCommand: GIT_FIX });
  });

  test("[M5] doctor-env/D1-no-installed-version-is-UNKNOWN-without-network", { skip: !posix }, async (t) => {
    const env = fakeGit(t, tagsGit([`v${VER}`]));
    const row = await run(env, SHA_A, { version: undefined });
    assert.deepEqual(row, { id: "D1", label: "version", status: "UNKNOWN", detail: "bundle (aaaaaaa): latest unknown, no version in package.json", fixCommand: NPM_FIX });
    assert.equal(existsSync(path.join(env.HOME, "git-argv")), false);
  });

  // D-OC2-BUNDLE-DIR-1 (#1306, bhazard451): inside the Bun-compiled OpenCode binary process.argv[1] is "B:/~BUN/root/...",
  // while the plugin loads from ~/.cache/opencode/npm/context-mode@2.0.1/<stamp>/node_modules/context-mode/opencode/plugin.js.
  test("[D-OC2-BUNDLE-DIR-1] doctor-env/D1 reads 2.0.1 from the loaded plugin's package when argv[1] is Bun's B:/~BUN/root", (t) => {
    const cache = tmp(t);
    const pkg = path.join(cache, ".cache", "opencode", "npm", "context-mode@2.0.1", "1793822759080", "node_modules", "context-mode");
    mkdirSync(path.join(pkg, "opencode"), { recursive: true });
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.1" }));
    writeFileSync(path.join(pkg, "server.mjs"), "");
    writeFileSync(path.join(pkg, "opencode", "plugin.js"), "");
    // the wrapper dir one level up has no version field (the reporter's `cat .../1793822759080/package.json`)
    writeFileSync(path.join(cache, ".cache", "opencode", "npm", "context-mode@2.0.1", "1793822759080", "package.json"), JSON.stringify({ dependencies: { "context-mode": "2.0.1" } }));
    const dir = bundleDirOf("B:/~BUN/root/src/index.js", path.join(pkg, "opencode", "plugin.js"));
    assert.equal(dir, pkg);
    assert.equal(bundleVersion(dir), "2.0.1");
  });

  // D-R38-PI-BUNDLE-1 (host audit pi-5): in Pi argv[1] is Pi's own dist/cli.js; the bundle is the loaded pi/index.js package.
  test("[D-R38-PI-BUNDLE-1] doctor-env/D1 reads the version from the Pi package when argv[1] is Pi's dist/cli.js", (t) => {
    const root = tmp(t);
    const piDist = path.join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist");
    mkdirSync(piDist, { recursive: true });
    writeFileSync(path.join(piDist, "cli.js"), "");
    const pkg = path.join(root, ".pi", "agent", "npm", "node_modules", "context-mode");
    mkdirSync(path.join(pkg, "pi"), { recursive: true });
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "context-mode", version: "2.1.0" }));
    writeFileSync(path.join(pkg, "server.mjs"), "");
    writeFileSync(path.join(pkg, "pi", "index.js"), "");
    const dir = bundleDirOf(path.join(piDist, "cli.js"), path.join(pkg, "pi", "index.js"));
    assert.equal(dir, pkg);
    assert.equal(bundleVersion(dir), "2.1.0");
  });

  test("[D-OC2-BUNDLE-DIR-1] doctor-env/bundle dir stays the server bundle's dir when argv[1] is server.mjs", (t) => {
    const pkg = tmp(t);
    writeFileSync(path.join(pkg, "server.mjs"), "");
    assert.equal(bundleDirOf(path.join(pkg, "server.mjs"), path.join(pkg, "server.mjs")), pkg);
    assert.equal(bundleDirOf(path.join(pkg, "server.mjs"), "/elsewhere/src/core/ops/host-config.ts"), pkg);
  });

  test("[M5] doctor-env/D1-git-missing-registry-same-version-is-PASS", async (t) => {
    const url = await registry(t, 200, { latest: "1.0.168", next: VER });
    const row = await run(noGit(t), SHA_A, { registryUrl: url });
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: `${HEAD}latest next on npm` });
  });

  test("[M5] doctor-env/D1-git-missing-registry-newer-is-FAIL-with-both-versions", async (t) => {
    const url = await registry(t, 200, { latest: "1.0.168", next: "2.0.0-next.29" });
    const row = await run(noGit(t), SHA_A, { registryUrl: url });
    assert.deepEqual(row, {
      id: "D1", label: "version", status: "FAIL",
      detail: `${HEAD}update available, next on npm is 2.0.0-next.29`, fixCommand: "run ctx_upgrade",
    });
  });

  test("[M5] doctor-env/D1-channel-and-installed-version-from-the-bundle", (t) => {
    assert.equal(channelOf("2.0.0-next.26"), "next");
    assert.equal(channelOf("2.0.0"), "latest");
    assert.equal(channelOf("2.1.0-beta"), "beta");
    const dir = tmp(t);
    assert.equal(bundleVersion(dir), undefined);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: VER }));
    assert.equal(bundleVersion(dir), VER);
    writeFileSync(path.join(dir, "package.json"), "{");
    assert.equal(bundleVersion(dir), undefined);
  });

  test("[M5] doctor-env/D2-current-node-PASS-and-sqlite-loads", async () => {
    const row = await checkNode({ nodeVersion: "v24.15.0", bunVersion: undefined });
    assert.deepEqual(row, { id: "D2", label: "node", status: "PASS", detail: "ok" });
    const newer = await checkNode({ nodeVersion: "v25.0.0", bunVersion: undefined });
    assert.equal(newer.status, "PASS");
  });

  test("[M5] doctor-env/D2-old-node-FAIL-with-NODE_TOO_OLD-text", async () => {
    const row = await checkNode({ nodeVersion: "v24.14.9", bunVersion: undefined });
    assert.deepEqual(row, { id: "D2", label: "node", status: "FAIL", detail: "Node v24.14.9 is below 24.15.0", fixCommand: "install Node 24.15.0 or later" });
    const major = await checkNode({ nodeVersion: "v22.20.0", bunVersion: undefined });
    assert.equal(major.status, "FAIL");
  });

  test("[M5] doctor-env/D2-bun-is-noted-even-on-PASS", async () => {
    const row = await checkNode({ nodeVersion: "v24.15.0", bunVersion: "1.2.3" });
    assert.equal(row.status, "PASS");
    assert.equal(row.detail, "running under Bun 1.2.3");
    const old = await checkNode({ nodeVersion: "v20.0.0", bunVersion: "1.2.3" });
    assert.equal(old.status, "FAIL");
    assert.ok(old.detail.includes("Node v20.0.0 is below 24.15.0") && old.detail.includes("running under Bun 1.2.3"));
  });

  test("[M5] doctor-env/D6-missing-both-is-UNKNOWN-never-FAIL", () => {
    const row = checkMcp({ clientInfo: undefined, protocolVersion: "" });
    assert.deepEqual(row, { id: "D6", label: "MCP", status: "UNKNOWN", detail: "no clientInfo or protocolVersion on the request" });
  });

  test("[M5] doctor-env/D6-client-or-protocol-present-PASS", () => {
    const row = checkMcp({ clientInfo: { name: "claude-code", version: "2.1.0" }, protocolVersion: "2025-06-18" });
    assert.deepEqual(row, { id: "D6", label: "MCP", status: "PASS", detail: "ok" });
    const one = checkMcp({ clientInfo: undefined, protocolVersion: "2025-06-18" });
    assert.equal(one.status, "PASS");
  });

  function project(worktree, source, agent = "claude-code") {
    return { projectKey: "0".repeat(16), projectDir: "/x", dbPath: "/x/context.db", worktree, containmentRoot: worktree, agent, source };
  }

  test("[M5] doctor-env/D7-source-matches-adapter-PASS", (t) => {
    const wt = tmp(t);
    const row = checkProject({ project: project(wt, "env:CLAUDE_PROJECT_DIR"), adapter: { id: "claude-code", projectSource: "env:CLAUDE_PROJECT_DIR" }, piCwd: undefined });
    assert.deepEqual(row, { id: "D7", label: "project and worktree", status: "PASS", detail: "ok" });
  });

  test("[M5] doctor-env/D7-source-mismatch-FAIL", (t) => {
    const wt = tmp(t);
    const row = checkProject({ project: project(wt, "spawn-cwd"), adapter: { id: "claude-code", projectSource: "env:CLAUDE_PROJECT_DIR" }, piCwd: undefined });
    assert.deepEqual(row, {
      id: "D7", label: "project and worktree", status: "FAIL",
      detail: "resolved project source spawn-cwd does not match the host's actual cwd",
      fixCommand: "restart the agent in the correct directory",
    });
  });

  test("[M5] doctor-env/D7-pi-cwd-inside-worktree-PASS-outside-FAIL", (t) => {
    const wt = tmp(t);
    const sub = path.join(wt, "pkg");
    mkdirSync(sub);
    const adapter = { id: "pi", projectSource: "pi:ctx.cwd" };
    assert.equal(checkProject({ project: project(wt, "pi:ctx.cwd", "pi"), adapter, piCwd: wt }).status, "PASS");
    assert.equal(checkProject({ project: project(wt, "pi:ctx.cwd", "pi"), adapter, piCwd: sub }).status, "PASS");
    assert.equal(checkProject({ project: project(wt, "pi:ctx.cwd", "pi"), adapter, piCwd: tmp(t) }).status, "FAIL");
    assert.equal(checkProject({ project: project(wt, "pi:ctx.cwd", "pi"), adapter, piCwd: undefined }).status, "FAIL");
    assert.equal(checkProject({ project: project(wt, "pi:ctx.cwd", "pi"), adapter, piCwd: path.join(wt, "gone") }).status, "FAIL");
  });

  test("[M5] doctor-env/D10-reports-denyChannel-as-PASS-detail", () => {
    assert.deepEqual(checkMode({ denyChannel: "deny-reason" }), { id: "D10", label: "enforcement mode", status: "PASS", detail: "enforcement mode: deny-reason" });
    assert.equal(checkMode({ denyChannel: "hint-only" }).detail, "enforcement mode: hint-only");
  });

  test("[M5] doctor-env/rows-carry-no-baked-build-paths", async (t) => {
    const rows = [await run({ PATH: "" }, undefined), await checkNode({ nodeVersion: process.version, bunVersion: undefined }), checkMcp({ protocolVersion: "" }), checkMode({ denyChannel: "hint-only" })];
    for (const r of rows) assert.ok(!JSON.stringify(r).includes("/Users/"), `row ${r.id} shows a path`);
  });
});

describe("ADR-0010 doctor D5: hook round trip", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §5 D5 + "D5 Codex trust sub-case", DECISIONS-r9 R6,
  // DEVIATIONS D-M5-arch-4 (fixture keyed by agent, hook.mjs --agent from the bundle dir), D-M5-D3-1.


  const FIXTURE = {
    "claude-code": { event: "PreToolUse", payload: { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } } },
    codex: { event: "PreToolUse", payload: { event: "exec", command: "ls" } },
  };

  // A fake release root: hook.mjs prints `out` (and echoes the --agent it got to stderr), fixtures/ next to it.
  function bundle(t, out, { fixture = FIXTURE, exit = 0 } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-doctor-hook-"));
    // D-WIN-RM-RETRY-1: Windows can hold a child's cwd after "close" (EPERM); see rmTempDir.
    t.after(() => rmTempDir(dir));
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE),
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s);process.stderr.write(process.argv.slice(2).join(" "));process.stdout.write(${JSON.stringify(out)});process.exitCode=${exit};});`);
    if (fixture !== null) {
      mkdirSync(path.join(dir, C.HOOK_FIXTURE_DIR));
      writeFileSync(path.join(dir, C.HOOK_FIXTURE_DIR, C.HOOK_FIXTURE_FILE), JSON.stringify(fixture));
    }
    return dir;
  }

  // D-D5-TEST-TIMEOUT-1: a stub hook on a busy runner can need over HOOK_TIMEOUT_MS to start; the tests give it 30 s.
  const STUB_TIMEOUT_MS = 30_000;

  function clock(...ticks) { let i = 0; return () => ticks[Math.min(i++, ticks.length - 1)]; }

  function input(dir, extra = {}) {
    return {
      agent: "claude-code", bundleDir: dir, env: { PATH: process.env.PATH ?? "" },
      signal: new AbortController().signal, codexConfigDir: path.join(dir, "no-codex"), db: null,
      now: clock(0, 5), samples: 1, bareMs: async () => 0, timeoutMs: STUB_TIMEOUT_MS, ...extra,
    };
  }

  function dbWith(t, agents) {
    const raw = new DatabaseSync(":memory:");
    raw.exec(DDL);
    const ins = raw.prepare("INSERT INTO events (session_id, worktree, agent, kind, turn, created_at, accessed_at) VALUES (?, ?, ?, 'cmd', 0, 0, 0)");
    for (const a of agents) ins.run("s1", "/w", a);
    t.after(() => raw.close());
    return { raw, projectKey: "k", path: ":memory:" };
  }

  const native = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "x" } });

  test("[M5] doctor-hook/D5-pass-native-shape-under-p95", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native)));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "PASS", detail: C.DOCTOR_PASS_DETAIL });
  });

  test("[M5] doctor-hook/D5-empty-stdout-is-allow-and-native", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, "")));
    assert.equal(r.status, "PASS");
  });

  test("[M5] doctor-hook/D5-non-json-output-FAILs-shape", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, "not json")));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "FAIL", detail: C.D5_SHAPE_DETAIL, fixCommand: C.D5_FIX });
  });

  test("[M5] doctor-hook/D5-wrong-event-name-FAILs-shape", async (t) => {
    const out = JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse" } });
    const r = await checkHookRoundTrip(input(bundle(t, out)));
    assert.equal(r.detail, C.D5_SHAPE_DETAIL);
  });

  // D-D5-READ-SHAPE-1 (#1304): claude-code D5 also sends a large PostToolUse Read and checks updatedToolOutput.
  // D-R41-READ-OFFSET-1 (#1314): `full` true replaces only a Read with no offset/limit, as the fixed hook does.
  const readHook = (out, full) => `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);` +
    `const bounded=${full ? "p.tool_input.offset!==undefined||p.tool_input.limit!==undefined" : "false"};` +
    `process.stdout.write(p.hook_event_name!=="PostToolUse"?${JSON.stringify(native)}:bounded?"":JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",updatedToolOutput:${out}}}));});`;
  function readBundle(t, out, full = true) {
    const dir = bundle(t, native);
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE), readHook(out, full));
    return dir;
  }

  test("[M5] doctor-hook/D5-read-replace-as-string-FAILs (#1304)", async (t) => {
    const r = await checkHookRoundTrip(input(readBundle(t, JSON.stringify("pointer"))));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "FAIL", detail: C.D5_READ_SHAPE_DETAIL, fixCommand: C.D5_FIX });
  });

  test("[M5] doctor-hook/D5-read-replace-in-Read-shape-PASSes (#1304)", async (t) => {
    const obj = JSON.stringify({ type: "text", file: { filePath: "/a", content: "c", numLines: 1, startLine: 1, totalLines: 1 } });
    const r = await checkHookRoundTrip(input(readBundle(t, obj)));
    assert.equal(r.status, "PASS", r.detail);
  });

  test("[M5] doctor-hook/D5-bounded-read-replaced-FAILs (#1314)", async (t) => {
    const obj = JSON.stringify({ type: "text", file: { filePath: "/a", content: "c", numLines: 1, startLine: 1, totalLines: 1 } });
    const r = await checkHookRoundTrip(input(readBundle(t, obj, false)));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "FAIL", detail: C.D5_READ_RANGE_DETAIL, fixCommand: C.D5_FIX });
  });

  test("[M5] doctor-hook/D5-bad-exit-code-FAILs-shape", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native, { exit: 1 })));
    assert.equal(r.status, "FAIL");
    assert.equal(r.detail, C.D5_SHAPE_DETAIL);
  });

  test("[M5] doctor-hook/D5-over-HOOK_P95_MS-FAILs-slow", async (t) => {
    const ms = C.HOOK_P95_MS + 1;
    const r = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, ms) }));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "FAIL", detail: C.D5_SLOW_DETAIL(ms), fixCommand: C.D5_FIX });
  });

  // D-D5-BARE-1 (Viet round, Windows Claude Desktop): D5 FAIL at 72 ms and 58 ms. On windows-latest bare `node -e ""`
  // alone is 42.7 ms p50, so a wall budget of 40 ms fails for node.exe start that the host pays with or without the hook.
  // D5 measures the hook's own cost: hook wall minus bare node wall, same run, same spawn path. The 40 ms bound stays.
  test("[M5] doctor-hook/D5-slow-node-start-is-not-the-hook (D-D5-BARE-1)", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, 72), bareMs: async () => 50 }));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "PASS", detail: C.DOCTOR_PASS_DETAIL });
  });

  test("[M5] doctor-hook/D5-hook-cost-over-bare-node-still-FAILs-slow (D-D5-BARE-1)", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, 100), bareMs: async () => 50 }));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "FAIL", detail: C.D5_SLOW_DETAIL(50), fixCommand: C.D5_FIX });
  });

  test("[M5] doctor-hook/D5-exactly-HOOK_P95_MS-over-bare-node-passes (D-D5-BARE-1)", async (t) => {
    const ok = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, 50 + C.HOOK_P95_MS), bareMs: async () => 50 }));
    assert.equal(ok.status, "PASS");
    const slow = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, 51 + C.HOOK_P95_MS), bareMs: async () => 50 }));
    assert.equal(slow.status, "FAIL");
  });

  test("[M5] doctor-hook/D5-uses-the-fastest-of-several-pairs, noise only adds time (D-D5-BARE-1)", async (t) => {
    // hook walls 200, 60, 90 and bare walls 50, 45, 80: min 60 minus min 45 = 15 ms, a PASS; the first pair alone is 150 ms.
    const walls = [0, 200, 200, 260, 260, 350];
    const bares = [50, 45, 80];
    let b = 0;
    const r = await checkHookRoundTrip(input(bundle(t, native), { samples: 3, now: clock(...walls), bareMs: async () => bares[b++] }));
    assert.equal(r.status, "PASS", r.detail);
  });

  // D-D5-MORE-PAIRS-1: a noisy runner (parallel test files, macOS file scans) can slow the first pairs only. Pairs go on, up to 9,
  // while the estimate is over the bound; a hook that is really slow stays over it in every pair and still FAILs.
  test("[M5] doctor-hook/D5-noisy-first-pairs-then-quiet-PASSes (D-D5-MORE-PAIRS-1)", async (t) => {
    // pairs 1-3: hook 100 over bare 10 (90 ms over); pair 4: hook 45 over bare 10 (35 ms over, inside the 40 ms bound).
    const walls = [0, 100, 100, 200, 200, 300, 300, 345];
    const r = await checkHookRoundTrip(input(bundle(t, native), { samples: undefined, now: clock(...walls), bareMs: async () => 10 }));
    assert.equal(r.status, "PASS", r.detail);
  });

  test("[M5] doctor-hook/D5-really-slow-hook-FAILs-after-the-last-pair (D-D5-MORE-PAIRS-1)", async (t) => {
    const walls = [];
    for (let n = 0; n < 12; n++) walls.push(n * 100, n * 100 + 100);
    let bareRuns = 0;
    const r = await checkHookRoundTrip(input(bundle(t, native), { samples: undefined, now: clock(...walls), bareMs: async () => { bareRuns++; return 10; } }));
    assert.equal(r.status, "FAIL");
    assert.equal(r.detail, C.D5_SLOW_DETAIL(90));
    assert.equal(bareRuns, 9, "stops at the 9th pair");
  });

  test("[M5] doctor-hook/D5-quiet-hook-stops-after-the-3-pair-minimum (D-D5-MORE-PAIRS-1)", async (t) => {
    let bareRuns = 0;
    const r = await checkHookRoundTrip(input(bundle(t, native), { samples: undefined, now: clock(0, 15, 15, 30, 30, 45, 45, 60), bareMs: async () => { bareRuns++; return 10; } }));
    assert.equal(r.status, "PASS");
    assert.equal(bareRuns, 3);
  });

  test("[M5] doctor-hook/D5-default-baseline-is-a-real-bare-node-run (D-D5-BARE-1)", async (t) => {
    // No bareMs override: the baseline is measured with a real `node -e ""`, so a stub hook that only sleeps 150 ms
    // is slow over it, and a stub that answers at once is not.
    const dir = bundle(t, native);
    const base = { ...input(dir), samples: undefined, now: undefined };
    delete base.bareMs;
    delete base.now;
    const fast = await checkHookRoundTrip(base);
    assert.equal(fast.status, "PASS", fast.detail);
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE), `setTimeout(()=>{process.stdout.write(${JSON.stringify(native)});},${C.HOOK_P95_MS + 400});process.stdin.resume();process.stdin.on("end",()=>{});`);
    const slow = await checkHookRoundTrip(base);
    assert.equal(slow.status, "FAIL");
    assert.equal(slow.fixCommand, C.D5_FIX);
  });

  // D-D5-TEST-TIMEOUT-1: release run 41679948852 (macos-latest, node 26): 12 stub-hook tests each took 6-8 s and got
  // "not the agent's native shape", because the busy runner needed over HOOK_TIMEOUT_MS (5000) to start a stub hook.
  // The kill limit is an input, so the tests give the stub room; the server keeps HOOK_TIMEOUT_MS, the host limit.
  test("[D-D5-TEST-TIMEOUT-1] D5 kills the hook at the timeoutMs it gets, a FAIL on shape", async (t) => {
    const dir = bundle(t, native);
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE), `setTimeout(()=>{process.stdout.write(${JSON.stringify(native)});},1500);process.stdin.resume();`);
    const r = await checkHookRoundTrip(input(dir, { timeoutMs: 300 }));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "FAIL", detail: C.D5_SHAPE_DETAIL, fixCommand: C.D5_FIX });
  });

  test("[M5] doctor-hook/D5-exactly-HOOK_P95_MS-passes", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, C.HOOK_P95_MS) }));
    assert.equal(r.status, "PASS");
  });

  test("[M5] doctor-hook/D5-agent-without-fixture-key-is-UNKNOWN (D-M5-arch-4)", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native), { agent: "gemini" }));
    assert.equal(r.status, "UNKNOWN");
    assert.ok(r.detail.startsWith(C.D5_NO_FIXTURE_DETAIL("gemini") + ": "), r.detail); // D-DOCTOR-ISSUE-1: names the agents the file records
  });

  // D-D5-ALL-AGENTS-1 (owner: every agent has 100% hooks): each agent's recorded payload gives PASS or FAIL, never UNKNOWN.
  const SHIPPED = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "..", "e2e", "fixtures", "hook-roundtrip.json"), "utf8"));
  for (const { id } of ADAPTERS) {
    test(`[M5] doctor-hook/D5-${id}-has-a-recorded-payload-and-PASSes (D-D5-ALL-AGENTS-1)`, async (t) => {
      assert.ok(Object.hasOwn(SHIPPED, id), id + " has no recorded payload in e2e/fixtures/hook-roundtrip.json");
      const decoded = getAdapter(id).decode(SHIPPED[id].payload);
      assert.equal(decoded.event, SHIPPED[id].event, id);
      assert.equal(decoded.tool?.canonicalName, "Bash", id);
      const r = await checkHookRoundTrip(input(bundle(t, "", { fixture: SHIPPED }), { agent: id, codexConfigDir: path.join(tmpdir(), "cm-no-codex-home") }));
      assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "PASS", detail: C.DOCTOR_PASS_DETAIL }, id);
    });
  }

  test("[M5] doctor-hook/D5-payload-cwd-goes-in-the-agent's-own-key (D-D5-ALL-AGENTS-1)", () => {
    assert.deepEqual(payloadFor("opencode", { type: "execute.before", directory: "/tmp/project" }, "/w"), { type: "execute.before", directory: "/w" });
    assert.deepEqual(payloadFor("pi", { type: "tool_call", cwd: "/tmp/project" }, "/w"), { type: "tool_call", cwd: "/w" });
    assert.deepEqual(payloadFor("copilot-cli", { toolName: "bash" }, undefined), { toolName: "bash" });
  });

  test("[M5] doctor-hook/D5-non-claude-shapes: gemini JSON decision, kiro stderr deny, opencode text deny are native", async (t) => {
    const deny = { gemini: JSON.stringify({ decision: "deny", reason: "x" }), "copilot-cli": JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: "x" }) };
    for (const [id, out] of Object.entries(deny)) {
      const r = await checkHookRoundTrip(input(bundle(t, out, { fixture: SHIPPED }), { agent: id }));
      assert.equal(r.status, "PASS", id + " " + r.detail);
    }
    for (const id of ["kiro", "opencode", "pi"]) {
      const r = await checkHookRoundTrip(input(bundle(t, "use ctx_execute", { fixture: SHIPPED, exit: 2 }), { agent: id }));
      assert.equal(r.status, "PASS", id + " " + r.detail);
    }
    const bad = await checkHookRoundTrip(input(bundle(t, "not json", { fixture: SHIPPED }), { agent: "gemini" }));
    assert.equal(bad.status, "FAIL");
  });

  test("[M5] doctor-hook/D5-no-fixture-file-is-UNKNOWN", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native, { fixture: null })));
    assert.equal(r.status, "UNKNOWN");
    assert.ok(r.detail.startsWith("hook fixture ") && r.detail.includes(C.HOOK_FIXTURE_FILE) && r.detail.endsWith(" is absent: the round trip needs it"), r.detail); // D-DOCTOR-ISSUE-1, D-DOCTOR-FIX-1 shorter row
  });

  test("[M5] doctor-hook/D5-codex-hooks-file-and-no-journal-row-is-UNKNOWN-not-trusted (R6)", async (t) => {
    const dir = bundle(t, native);
    const codexDir = path.join(dir, "codex-home");
    mkdirSync(codexDir);
    writeFileSync(path.join(codexDir, C.HOOKS_JSON_FILE), "{}");
    for (const db of [null, dbWith(t, ["claude-code"])]) {
      const r = await checkHookRoundTrip(input(dir, { agent: "codex", codexConfigDir: codexDir, db }));
      assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "UNKNOWN", detail: C.D5_CODEX_UNTRUSTED_DETAIL });
    }
  });

  test("[M5] doctor-hook/D5-codex-with-journaled-row-runs-round-trip", async (t) => {
    const dir = bundle(t, native);
    const codexDir = path.join(dir, "codex-home");
    mkdirSync(codexDir);
    writeFileSync(path.join(codexDir, C.HOOKS_JSON_FILE), "{}");
    const r = await checkHookRoundTrip(input(dir, { agent: "codex", codexConfigDir: codexDir, db: dbWith(t, ["codex"]) }));
    assert.equal(r.status, "PASS");
  });

  test("[M5] doctor-hook/D5-codex-without-hooks-file-runs-round-trip (no trust case)", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, "garbage"), { agent: "codex" }));
    assert.equal(r.detail, C.D5_SHAPE_DETAIL);
  });

  // D-NI-CODEX-TRUST-3 (tester report, native Codex plugin route, before the user trusts the plugin hooks): the terminal doctor
  // FAILed hook-registered, but ctx_doctor showed D3/D4/D5 PASS while `cat` still ran. The plugin route leaves no hooks.json in
  // CODEX_HOME, so the D5 trust sub-case never ran, and the round trip calls hook.mjs itself, which proves nothing about Codex.
  // D5 now asks Codex (hooks/list) the way the terminal doctor does. The fake app-server reports the 0.156.1 hash (plain)
  // and, with FAKE_COMPOSITE=1, the 0.166 hash ("<hook hash>/<plugin hash>").
  const SKIP_SH = { skip: process.platform === "win32" && "fake codex is an sh script" };
  function nativeCodex(t, { toml = "", composite = false, fake = true } = {}) {
    const dir = bundle(t, native);
    const codexHome = path.join(dir, "codex-home");
    mkdirSync(codexHome);
    if (toml !== "") writeFileSync(path.join(codexHome, "config.toml"), toml);
    const bin = fake ? fakeCodexBin(dir, process.execPath) : path.join(dir, "no-codex-bin");
    const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), CODEX_HOME: codexHome, ...(composite ? { FAKE_COMPOSITE: "1" } : {}) };
    return input(dir, { agent: "codex", env, codexConfigDir: codexHome, worktree: dir });
  }

  for (const [format, composite] of [["0.156.1 hash", false], ["0.166 hash", true]]) {
    test(`[D-NI-CODEX-TRUST-3] D5 native codex plugin, hooks untrusted (${format}): FAIL, same detail as the terminal doctor, fix names context-mode setup`, SKIP_SH, async (t) => {
      const r = await checkHookRoundTrip(nativeCodex(t, { composite }));
      assert.equal(r.status, "FAIL", JSON.stringify(r));
      assert.equal(r.detail, "codex lists 4 of 4 context-mode plugin hooks untrusted, so they do not run; run: context-mode setup");
      assert.equal(r.fixCommand, "context-mode setup --agents codex");
    });

    test(`[D-NI-CODEX-TRUST-3] D5 native codex plugin, hooks trusted (${format}): PASS`, SKIP_SH, async (t) => {
      const r = await checkHookRoundTrip(nativeCodex(t, { composite, toml: trustedToml() }));
      assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "PASS", detail: C.DOCTOR_PASS_DETAIL });
    });
  }

  test("[D-NI-CODEX-TRUST-3] D5 native codex plugin: one untrusted hook of four is a FAIL that counts it", SKIP_SH, async (t) => {
    const lines = trustedToml().split("\n\n");
    const r = await checkHookRoundTrip(nativeCodex(t, { toml: lines.slice(1).join("\n\n") }));
    assert.equal(r.status, "FAIL");
    assert.match(r.detail, /^codex lists 1 of 4 /);
  });

  test("[D-NI-CODEX-TRUST-3] D5 with no answer from Codex (not on PATH) does not claim untrusted: the round trip decides", async (t) => {
    const r = await checkHookRoundTrip(nativeCodex(t, { fake: false }));
    assert.equal(r.status, "PASS", JSON.stringify(r));
  });

  test("[M5] doctor-hook/codexHookJournaled-filters-agent-codex", (t) => {
    assert.equal(codexHookJournaled(null), false);
    assert.equal(codexHookJournaled(dbWith(t, [])), false);
    assert.equal(codexHookJournaled(dbWith(t, ["claude-code", "gemini"])), false);
    assert.equal(codexHookJournaled(dbWith(t, ["claude-code", "codex"])), true);
  });

  test("[M5] doctor-hook/D5-passes-agent-flag-and-fixture-payload-on-stdin", async (t) => {
    // The stub JSON.parses stdin (a non-JSON stdin would crash it -> exit 1 -> FAIL), so PASS proves the payload.
    const dir = bundle(t, native);
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE),
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);const ok=process.argv[2]===${JSON.stringify(C.AGENT_ARG)}&&process.argv[3]==="codex"&&p.command==="ls";process.stdout.write(ok?${JSON.stringify(native)}:"bad");});`);
    const r = await checkHookRoundTrip(input(dir, { agent: "codex" }));
    assert.equal(r.status, "PASS");
  });

  // Finding 3 (Viet, Windows, next.17): the shipped codex fixture had no hook_event_name, so the real hook said
  // "decode failed: codex: unknown hook event undefined". Every shipped fixture runs through the built hook of its host,
  // and its keys must equal the recorded native PreToolUse payload the adapter tests use (e2e/fixtures/<host>/<ver>/).
  test("[D-D5-FIXTURE-1] D5 sends the fixture with the project worktree as cwd, so the hook finds a repository", async (t) => {
    const dir = bundle(t, native);
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE),
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);process.stdout.write(p.cwd===${JSON.stringify("/the/worktree")}?${JSON.stringify(native)}:"bad");});`);
    const r = await checkHookRoundTrip(input(dir, { worktree: "/the/worktree" }));
    assert.equal(r.status, "PASS");
  });

  describe("shipped fixtures through the built hook (D-D5-FIXTURE-1)", () => {
    const REPO = path.resolve(import.meta.dirname, "..");
    let out;
    let fixtures;
    let buildTicks = 0;
    before(async () => {
      out = mkdtempSync(path.join(tmpdir(), "cm-d5-fixture-build-"));
      const tick = setInterval(() => buildTicks++, 5);
      // Async on purpose (D-D5-SYNC-BUILD-1): a spawnSync here stops the timers of the D5 round trips running beside it.
      await promisify(execFile)(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out], { encoding: "utf8" });
      clearInterval(tick);
      fixtures = JSON.parse(readFileSync(path.join(out, C.HOOK_FIXTURE_DIR, C.HOOK_FIXTURE_FILE), "utf8"));
    });

    // D-D5-SYNC-BUILD-1 (release runs of next.33 and next.34, macos-latest node 26): this block runs beside the D5 round
    // trips (CONC). A build that stops the event loop for more than HOOK_TIMEOUT_MS lets each round trip's 5 s timer fire
    // before its "close" event, so a fast hook reads as killed: "timeout" and D5 FAILs with the shape detail. The loop must turn.
    test("the fixture build lets the event loop run, so the D5 round trips beside it keep their timers (D-D5-SYNC-BUILD-1)", () => {
      assert.ok(buildTicks > 0, "the event loop stood still for the whole build");
    });
    after(() => rmSync(out, { recursive: true, force: true }));

    function recordedPreToolUse(host) {
      const root = path.join(REPO, "e2e", "fixtures", host);
      const versions = readdirSync(root).sort().filter((v) => existsSync(path.join(root, v, "PreToolUse.json")));
      assert.ok(versions.length > 0, host + " has no recorded PreToolUse payload");
      return JSON.parse(readFileSync(path.join(root, versions[versions.length - 1], "PreToolUse.json"), "utf8"));
    }

    test("every shipped fixture has the key set of the recorded native PreToolUse payload", () => {
      // D-D5-ALL-AGENTS-1: every agent has hooks, so every agent has a recorded payload; claude-code and codex have host recordings.
      assert.deepEqual(Object.keys(fixtures).sort(), ADAPTERS.map((r) => r.id).sort());
      for (const host of ["claude-code", "codex"]) {
        const entry = fixtures[host];
        assert.equal(entry.payload.hook_event_name, "PreToolUse", host);
        assert.deepEqual(Object.keys(entry.payload).sort(), Object.keys(recordedPreToolUse(host)).sort(), host);
        assert.equal(entry.payload.tool_name, recordedPreToolUse(host).tool_name, host);
      }
    });

    test("every shipped fixture passes the built hook of its host: exit 0, no decode error, allow", () => {
      for (const [host, entry] of Object.entries(fixtures)) {
        const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-d5-fixture-home-")));
        try {
          spawnSync("git", ["init", "-q", home]);
          const env = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, ".codex"), CLAUDE_PROJECT_DIR: home };
          const r = spawnSync(process.execPath, [path.join(out, C.HOOK_ENTRY_FILE), C.AGENT_ARG, host], {
            input: JSON.stringify(payloadFor(host, entry.payload, home)), encoding: "utf8", env, cwd: home,
          });
          assert.equal(r.status, 0, host + " " + r.stderr);
          assert.ok(!r.stderr.includes("decode failed"), host + " " + r.stderr);
          assert.equal(r.stdout, "", host + " expected allow, got " + r.stdout);
          const log = path.join(home, ".context-mode", "hook-errors.log");
          assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", host + " logged a hook error");
        } finally {
          rmSync(home, { recursive: true, force: true });
        }
      }
    });
  });
});

describe("ADR-0010 D8 heal: lossless heal and rename-aside", { concurrency: CONC }, () => {
  // Unit tests for src/core/ops/db-heal.ts (impl/07 §5 step 7, ADR-0010 D8, impl/02 §7 owners.ts).
  // healD8 runs only after D8's integrity_check failed. Sole live owner -> healLossless (read-only open,
  // VACUUM INTO <db>.heal, REINDEX, verify, rename over). Else, or if that throws -> rename context.db,
  // -wal, -shm aside as <file>.<ts>.bak and recreate an empty context.db via openDb.


  const ROWS = 400;
  const FAILED_ROW = Object.freeze({ id: "D8", label: "context.db", status: "FAIL", detail: C.D8_INTEGRITY_DETAIL, fixCommand: C.D8_INTEGRITY_FIX });

  function project(configDir) {
    const projectKey = "healproj00000000";
    const projectDir = join(configDir, "projects", projectKey);
    return { projectKey, projectDir, dbPath: join(projectDir, "context.db"), worktree: configDir, containmentRoot: configDir, agent: "claude-code", source: "spawn-cwd" };
  }

  // A real context.db plus a test table whose index we break: rows stay readable, the index does not.
  async function seed(t) {
    const configDir = mkdtempSync(join(tmpdir(), "cm-dbheal-"));
    t.after(() => rmSync(configDir, { recursive: true, force: true }));
    const p = project(configDir);
    const db = await openDb(p);
    db.raw.exec("CREATE TABLE heal_rows(n INTEGER, s TEXT); CREATE INDEX heal_rows_s ON heal_rows(s);");
    const ins = db.raw.prepare("INSERT INTO heal_rows VALUES (?, ?)");
    for (let i = 1; i <= ROWS; i += 1) ins.run(i, "row" + String(i).padStart(4, "0"));
    closeDb(db);
    return { configDir, p };
  }

  // Flip one byte of a key inside the index b-tree (the last copy of the text is in the index page).
  function breakIndex(dbPath) {
    const b = readFileSync(dbPath);
    const at = b.lastIndexOf(Buffer.from("row0399"));
    assert.ok(at > 0);
    b[at + 3] = 0x78;
    writeFileSync(dbPath, b);
  }

  // Overwrite the index root page: VACUUM INTO then fails with "malformed".
  function smashIndex(dbPath) {
    const d = new DatabaseSync(dbPath, { readOnly: true });
    const root = d.prepare("SELECT rootpage FROM sqlite_schema WHERE name = 'heal_rows_s'").get().rootpage;
    const pageSize = d.prepare("PRAGMA page_size").get().page_size;
    d.close();
    const b = readFileSync(dbPath);
    b.fill(0x41, (root - 1) * pageSize, root * pageSize);
    writeFileSync(dbPath, b);
  }

  function integrity(dbPath) {
    const d = new DatabaseSync(dbPath, { readOnly: true });
    try { return d.prepare(C.PRAGMA_INTEGRITY_CHECK).all().map((r) => r.integrity_check); } finally { d.close(); }
  }

  function count(dbPath) {
    const d = new DatabaseSync(dbPath, { readOnly: true });
    try { return d.prepare("SELECT count(*) AS n FROM heal_rows").get().n; } finally { d.close(); }
  }

  test("fixture: breakIndex makes integrity_check fail while every row stays readable", async (t) => {
    const { p } = await seed(t);
    breakIndex(p.dbPath);
    assert.notDeepEqual(integrity(p.dbPath), [C.INTEGRITY_OK]);
    assert.equal(count(p.dbPath), ROWS);
  });

  test("sole live owner -> healed (lossless): PASS, integrity ok, zero data loss on non-corrupt rows", async (t) => {
    const { configDir, p } = await seed(t);
    writeOwnerPid(configDir, p.projectKey, "srv-me");
    breakIndex(p.dbPath);
    const row = await healD8({ project: p, configDir, serverId: "srv-me", row: FAILED_ROW });
    assert.equal(row.id, "D8");
    assert.equal(row.status, "PASS");
    assert.equal(row.detail, C.D8_HEALED_LOSSLESS_DETAIL);
    assert.equal(row.fixCommand, undefined);
    assert.deepEqual(integrity(p.dbPath), [C.INTEGRITY_OK]);
    assert.equal(count(p.dbPath), ROWS);
    assert.equal(existsSync(p.dbPath + C.HEAL_TMP_SUFFIX), false);
    // The healed file opens through the store at the current schema, in WAL mode.
    const db = await openDb(p);
    assert.equal(db.raw.prepare("PRAGMA user_version").get().user_version, C.SCHEMA_VERSION);
    assert.equal(db.raw.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    closeDb(db);
    assert.equal(FAILED_ROW.status, "FAIL"); // input row not mutated
  });

  test("not the live owner -> rename aside with <ts>.bak and recreate empty; old data kept", async (t) => {
    const { configDir, p } = await seed(t);
    breakIndex(p.dbPath);
    writeFileSync(p.dbPath + C.DB_WAL_SUFFIX, "");
    const row = await healD8({ project: p, configDir, serverId: "srv-me", row: FAILED_ROW });
    assert.equal(row.status, "FAIL");
    const prefix = "healed by recreate — old data kept at context.db.";
    assert.ok(row.detail.startsWith(prefix));
    const ts = row.detail.slice(prefix.length, -C.HEAL_BACKUP_SUFFIX.length);
    assert.equal(row.detail, C.D8_HEALED_RECREATE_DETAIL(ts));
    const bak = p.dbPath + C.HEAL_TS_SEP + ts + C.HEAL_BACKUP_SUFFIX;
    assert.ok(existsSync(bak));
    assert.equal(count(bak), ROWS);
    assert.ok(existsSync(p.dbPath + C.DB_WAL_SUFFIX + C.HEAL_TS_SEP + ts + C.HEAL_BACKUP_SUFFIX));
    assert.deepEqual(integrity(p.dbPath), [C.INTEGRITY_OK]);
    const db = await openDb(p);
    assert.equal(db.raw.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'heal_rows'").get().n, 0);
    closeDb(db);
  });

  test("another live owner besides this server -> recreate, never a lossless swap under it", async (t) => {
    const { configDir, p } = await seed(t);
    writeOwnerPid(configDir, p.projectKey, "srv-me");
    writeOwnerPid(configDir, p.projectKey, "srv-other"); // same live pid: a second server
    breakIndex(p.dbPath);
    const row = await healD8({ project: p, configDir, serverId: "srv-me", row: FAILED_ROW });
    assert.equal(row.status, "FAIL");
    assert.ok(readdirSync(p.projectDir).some((n) => n.endsWith(C.HEAL_BACKUP_SUFFIX)));
  });

  test("owner but healLossless throws (VACUUM INTO on a smashed page) -> recreate, no .heal temp left", async (t) => {
    const { configDir, p } = await seed(t);
    writeOwnerPid(configDir, p.projectKey, "srv-me");
    smashIndex(p.dbPath);
    const row = await healD8({ project: p, configDir, serverId: "srv-me", row: FAILED_ROW });
    assert.equal(row.status, "FAIL");
    assert.ok(row.detail.startsWith("healed by recreate"));
    assert.equal(existsSync(p.dbPath + C.HEAL_TMP_SUFFIX), false);
    assert.deepEqual(integrity(p.dbPath), [C.INTEGRITY_OK]);
  });
});

describe("ADR-0010 doctor report text", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md (exports buildReport). 14a GP11/redact-secrets-in-debug-report
  // (#1144) and GP11/redact-secrets-in-doctor-output (#1141): a token-shaped env value must never
  // appear verbatim in a doctor/debug report.


  test("[M5] report/redact-secrets-in-debug-report: a token-shaped env var is redacted (#1144)", () => {
    const out = buildReport({ env: { SOME_API_TOKEN: "sk-abcdef0123456789" }, rows: [] });
    assert.ok(!out.includes("sk-abcdef0123456789"));
  });

  test("[M5] report/redact-secrets-in-doctor-output: X_TOKEN=abc is absent from the output (#1141)", () => {
    const out = buildReport({ env: { X_TOKEN: "abc" }, rows: [] });
    assert.ok(!out.includes("abc"));
  });

  test("[M5] report/non-secret-env-values-pass-through", () => {
    const out = buildReport({ env: { NODE_ENV: "test" }, rows: [] });
    assert.ok(out.includes("test"));
  });
});

describe("ADR-0010 upgrade step 4b: SHA256SUMS check", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §6 step 4b + Errors, docs/architecture/modules/13-build-release.md §4,
  // DEVIATIONS D-M5-U3-1. verifySums(dir) checks every file of the fetched tree against
  // <dir>/SHA256SUMS ("<hex>  <relative/posix/path>\n", sha256); any mismatch throws
  // CtxError BUNDLE_HASH_MISMATCH.


  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-verify-sums-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  const sha = (s) => createHash("sha256").update(s).digest("hex");

  // Same shape build/hash.mjs writes (impl/13 §4): sorted POSIX paths, two spaces, "\n" per line.
  function tree(t, files) {
    const dir = tmp(t);
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(dir, ...rel.split("/"));
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    return dir;
  }
  function writeSums(dir, files) {
    const lines = Object.keys(files).sort().map((rel) => `${sha(files[rel])}  ${rel}\n`).join("");
    writeFileSync(path.join(dir, "SHA256SUMS"), lines);
  }
  function assertMismatch(fn) {
    assert.throws(fn, (e) => e instanceof CtxError && e.code === "BUNDLE_HASH_MISMATCH"
      && e.message === "Fetched bundle hash does not match SHA256SUMS. Fix: run ctx_upgrade again.");
  }

  const FILES = { "server.mjs": "export {};\n", "hooks/pre.mjs": "hook\n", "a/b/c.json": "{}" };

  test("a matching tree passes (nested dirs, POSIX paths)", (t) => {
    const dir = tree(t, FILES);
    writeSums(dir, FILES);
    assert.equal(verifySums(dir), undefined);
  });

  test("the .git dir of the clone is not checked", (t) => {
    const dir = tree(t, { ...FILES, ".git/HEAD": "ref: refs/heads/release\n" });
    writeSums(dir, FILES);
    assert.equal(verifySums(dir), undefined);
  });

  test("a changed byte throws BUNDLE_HASH_MISMATCH", (t) => {
    const dir = tree(t, FILES);
    writeSums(dir, FILES);
    writeFileSync(path.join(dir, "hooks", "pre.mjs"), "hooK\n");
    assertMismatch(() => verifySums(dir));
  });

  test("a listed file that is missing throws", (t) => {
    const dir = tree(t, FILES);
    writeSums(dir, FILES);
    unlinkSync(path.join(dir, "server.mjs"));
    assertMismatch(() => verifySums(dir));
  });

  test("a file that SHA256SUMS does not list throws", (t) => {
    const dir = tree(t, { ...FILES, "extra.mjs": "x" });
    writeSums(dir, FILES);
    assertMismatch(() => verifySums(dir));
  });

  test("no SHA256SUMS file throws", (t) => {
    const dir = tree(t, FILES);
    assertMismatch(() => verifySums(dir));
  });

  test("a malformed line throws (one space, empty path, bad hex)", (t) => {
    for (const bad of [
      `${sha("x")} server.mjs\n`,
      `${sha("x")}  \n`,
      `${"z".repeat(64)}  server.mjs\n`,
      `${sha("x").slice(0, 10)}  server.mjs\n`,
    ]) {
      const dir = tree(t, { "server.mjs": "x" });
      writeFileSync(path.join(dir, "SHA256SUMS"), bad);
      assertMismatch(() => verifySums(dir));
    }
  });

  test("a duplicate path line throws", (t) => {
    const dir = tree(t, { "server.mjs": "x" });
    writeFileSync(path.join(dir, "SHA256SUMS"), `${sha("x")}  server.mjs\n${sha("x")}  server.mjs\n`);
    assertMismatch(() => verifySums(dir));
  });

  test("an empty tree with an empty SHA256SUMS passes", (t) => {
    const dir = tree(t, {});
    writeSums(dir, {});
    assert.equal(verifySums(dir), undefined);
  });

  test("hex must be the lower-case digest build/hash.mjs writes (D-M5-U3-1)", (t) => {
    const dir = tree(t, { "server.mjs": "x" });
    writeFileSync(path.join(dir, "SHA256SUMS"), `${sha("x").toUpperCase()}  server.mjs\n`);
    assertMismatch(() => verifySums(dir));
  });

  // review-M5 open note, D-M6-V1-1: the walk takes only regular files and dirs; a symlink is a mismatch,
  // even when the target's bytes match the listed hash.
  test("a symlink to a file whose bytes match still throws (D-M6-V1-1)", (t) => {
    const dir = tree(t, FILES);
    const outside = tmp(t);
    writeFileSync(path.join(outside, "server.mjs"), FILES["server.mjs"]);
    unlinkSync(path.join(dir, "server.mjs"));
    symlinkSync(path.join(outside, "server.mjs"), path.join(dir, "server.mjs"));
    writeSums(dir, FILES);
    assertMismatch(() => verifySums(dir));
  });

  test("a symlink to a dir throws (D-M6-V1-1)", (t) => {
    const dir = tree(t, FILES);
    const outside = tree(t, { "c.json": "{}" });
    rmSync(path.join(dir, "a", "b"), { recursive: true });
    symlinkSync(outside, path.join(dir, "a", "b"));
    writeSums(dir, FILES);
    assertMismatch(() => verifySums(dir));
  });

  test("a symlinked SHA256SUMS throws (D-M6-V1-1)", (t) => {
    const dir = tree(t, FILES);
    const outside = tmp(t);
    writeSums(outside, FILES);
    symlinkSync(path.join(outside, "SHA256SUMS"), path.join(dir, "SHA256SUMS"));
    assertMismatch(() => verifySums(dir));
  });
});

describe("ADR-0010 ctx_doctor tool: all checks and order", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §5 (ctxDoctor ToolDef + runDoctorChecks), ADR-0010, TECH-SPEC §6.2 GP11;
  // DEVIATIONS D-M5-arch-3/4/5, D-M5-D6-1 (test drives runDoctorChecks(ctx, adapter, host), the impl/07 shape).
  // D8 is one row whose detail names which of stale-schema / integrity_check failed (A-T5).


  const KEY = "d".repeat(16);
  const ORDER = ["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"];

  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-doctor-"));
    t.after(() => rmTempDir(dir)); // D-WIN-RM-RETRY-1
    return dir;
  }

  function ctxFor(home, agent = "claude-code") {
    const projectDir = path.join(home, ".context-mode", "projects", KEY);
    const source = getAdapter(agent).projectSource;
    return {
      project: { projectKey: KEY, projectDir, dbPath: path.join(projectDir, "context.db"), worktree: home, containmentRoot: home, agent, source },
      sessionId: "s1", turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18",
    };
  }

  async function doctor(home, agent = "claude-code", extraEnv = {}) {
    const ctx = ctxFor(home, agent);
    const host = { env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH ?? "", ...extraEnv }, bundleDir: path.join(home, "no-bundle"), piCwd: undefined };
    return { ctx, rows: await runDoctorChecks(ctx, getAdapter(agent), host) };
  }

  const put = (file, value) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), "utf8");
  };

  test("[M5] doctor/returns-ten-row-ids-D1-D10 in DOCTOR_CHECK_ORDER", async (t) => {
    const { rows } = await doctor(tmp(t));
    assert.deepEqual(rows.map((r) => r.id), ORDER);
  });

  test("[M5] doctor/D8-stale-schema-and-integrity-check-are-distinct-detail-strings", async (t) => {
    const home = tmp(t);
    const { ctx } = await doctor(home);
    mkdirSync(ctx.project.projectDir, { recursive: true });
    const db = new DatabaseSync(ctx.project.dbPath);
    db.exec("PRAGMA user_version = 999;"); // stale schema
    db.close();
    const stale = (await doctor(home)).rows.find((r) => r.id === "D8");
    assert.equal(stale.status, "FAIL");
    assert.match(stale.detail, /stale schema/);

    // Not a database: integrity cause, healed by recreate (no other owner proof) -> distinct text.
    rmSync(ctx.project.dbPath, { force: true });
    writeFileSync(ctx.project.dbPath, "x".repeat(4096), "utf8");
    const corrupt = (await doctor(home)).rows.find((r) => r.id === "D8");
    assert.ok(!corrupt.detail.includes("stale schema"), corrupt.detail);
    assert.match(corrupt.detail, /healed/);
  });

  test("[D-ORPHAN-WAL-1] ctx_doctor moves an orphan -wal/-shm whole into orphan-<UTC>/, starts a new context.db, the next run PASSes", async (t) => {
    const home = tmp(t);
    const p = ctxFor(home).project;
    mkdirSync(p.projectDir, { recursive: true });
    const { main, wal, shm } = await seedOrphanWal(p);
    const first = (await doctor(home)).rows.find((r) => r.id === "D8");
    assert.equal(first.status, "FAIL", first.detail);
    const kept = readdirSync(p.projectDir).filter((n) => n.startsWith(C.ORPHAN_DIR_PREFIX));
    assert.equal(kept.length, 1, readdirSync(p.projectDir).join(","));
    assert.ok(kept[0].endsWith("Z"), kept[0]);
    const dir = path.join(p.projectDir, kept[0]);
    assert.equal(sha256(readFileSync(path.join(dir, "context.db-wal"))), sha256(wal), "WAL bytes kept unchanged");
    assert.equal(sha256(readFileSync(path.join(dir, "context.db-shm"))), sha256(shm), "SHM bytes kept unchanged");
    for (const need of [path.join(dir, "context.db-wal"), path.join(dir, "context.db-shm"), String(wal.length) + " bytes", p.dbPath, "put the original context.db"]) {
      assert.ok(first.detail.includes(need), need + " missing in: " + first.detail);
    }
    assert.equal(first.fixCommand, C.D8_ORPHAN_HEALED_FIX);
    assert.equal(existsSync(p.dbPath), true, "a new context.db");
    const second = (await doctor(home)).rows.find((r) => r.id === "D8");
    assert.equal(second.status, "PASS", second.detail);
    assert.equal(readdirSync(p.projectDir).filter((n) => n.startsWith(C.ORPHAN_DIR_PREFIX)).length, 1, "second run moves nothing");
    // The restore line works: the original context.db next to the kept WAL reads the canary.
    writeFileSync(path.join(dir, "context.db"), main);
    const back = new DatabaseSync(path.join(dir, "context.db"));
    try { assert.equal(back.prepare("SELECT v FROM canary").get().v, "REAL_WAL_CANARY value=614972"); } finally { back.close(); }
  });

  // Finding 3 part 2 (D-D5-PAST-1): an old line in hook-errors.log is history, not a current failure. The log stays whole.
  test("[D-D5-PAST-1] D5 labels a hook error older than this doctor run as past, with its time", async (t) => {
    const home = tmp(t);
    const log = path.join(home, ".context-mode", "hook-errors.log");
    const old = JSON.stringify({ ts: "2020-01-02T03:04:05.000Z", agent: "opencode", stage: "decode", label: "SyntaxError", message: "fuzz", stack: "s" });
    put(log, old + "\n");
    const { rows } = await doctor(home);
    const d5 = rows.find((r) => r.id === "D5");
    assert.match(d5.detail, /past hook error 2020-01-02T03:04:05\.000Z at decode \(SyntaxError\)/);
    assert.ok(!d5.detail.includes("last hook error"), d5.detail);
    assert.equal(readFileSync(log, "utf8"), old + "\n", "the log file stays whole");
  });

  test("[D-D5-PAST-1] D5 names a hook error newer than the start of this doctor run as the last hook error", async (t) => {
    const home = tmp(t);
    const ts = new Date(Date.now() + 3_600_000).toISOString();
    put(path.join(home, ".context-mode", "hook-errors.log"), JSON.stringify({ ts, agent: "codex", stage: "decode", label: "Error", message: "m", stack: "s" }) + "\n");
    const { rows } = await doctor(home);
    const d5 = rows.find((r) => r.id === "D5");
    assert.match(d5.detail, new RegExp("last hook error " + ts.replace(/\./g, "\\.") + " at decode \\(Error\\)"));
    assert.ok(!d5.detail.includes("past hook error"), d5.detail);
  });

  test("[M5] doctor/D9-empty-index-is-not-FAIL", async (t) => {
    const { rows } = await doctor(tmp(t));
    const d9 = rows.find((r) => r.id === "D9");
    assert.equal(d9.status, "PASS");
    assert.equal(d9.detail, "0 sources, 0 chunks indexed");
  });

  test("[M5] doctor/D5b-double-fire-detected", async (t) => {
    const home = tmp(t);
    put(path.join(home, ".claude", "settings.json"), { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } });
    put(path.join(home, ".vscode", "settings.json"), '{ "chat.useClaudeHooks": true }');
    const d5b = (await doctor(home)).rows.find((r) => r.id === "D5b");
    assert.equal(d5b.status, "FAIL");
  });

  test("[M5] doctor/codex-effective-hooks-state-no-features-hooks-key-means-true (#1153 #1152)", async (t) => {
    const home = tmp(t);
    const row = getAdapter("codex");
    const hooks = {};
    for (const [canonical, native] of Object.entries(row.eventMap)) {
      const group = { hooks: [{ type: "command", command: "node /opt/cm/hook.mjs --agent codex", timeout: 5 }] };
      if (canonical === "PreToolUse" || canonical === "PostToolUse") group.matcher = composeMatcher(row, canonical);
      hooks[native] = [group];
    }
    put(path.join(home, ".codex", "hooks.json"), { hooks });
    // JSON string escapes are TOML basic-string escapes: a Windows path keeps its backslashes (D-M3-F-9 rule).
    const serverArgs = JSON.stringify([path.join(path.dirname(process.argv[1] ?? ""), "server.mjs"), "--agent", "codex"]);
    put(path.join(home, ".codex", "config.toml"), `model = "o1"\n\n[mcp_servers.context-mode]\ncommand = "node"\nargs = ${serverArgs}\nomit_tools_from = ["deferred"]\ndefault_tools_approval_mode = "approve"\n`);
    const d3 = (await doctor(home, "codex")).rows.find((r) => r.id === "D3");
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test("[D-N6-CODEX-HOME-2] doctor/D5 looks for codex hooks.json under CODEX_HOME when it is set", async (t) => {
    const home = tmp(t);
    const codexDir = path.join(home, "codex-home");
    put(path.join(codexDir, "hooks.json"), { hooks: {} });
    const d5 = (await doctor(home, "codex", { CODEX_HOME: codexDir })).rows.find((r) => r.id === "D5");
    assert.equal(d5.status, "UNKNOWN");
    assert.equal(d5.detail, C.D5_CODEX_UNTRUSTED_DETAIL);
    const d5home = (await doctor(home, "codex")).rows.find((r) => r.id === "D5");
    assert.notEqual(d5home.detail, C.D5_CODEX_UNTRUSTED_DETAIL);
  });

  // D-CODEX-HOME-RUN-1 (tester, candidate baaa3149, Windows, Codex 0.166.0-alpha.5.1): the native plugin sits in
  // <test-home>/.codex/plugins/cache, but the MCP child env has HOME and CODEX_HOME unset. Codex then answers hooks/list for the
  // OS profile home, lists none of our hooks, and D5 said PASS while Codex listed 4 of 4 untrusted in the test home.
  // The fake codex answers for $CODEX_HOME, else <HOME>/.codex, else <FAKE_OS_PROFILE>/.codex, and lists our plugin hooks
  // only where config.toml switches the plugin on.
  const RUN_NATIVE = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "x" } });
  const RUN_SKIP = { skip: process.platform === "win32" && "fake codex is an sh script" };
  function codexRunHome(t, { toml = "", env = {} } = {}) {
    const root = tmp(t);
    const home = path.join(root, "test-home");
    const codexDir = path.join(home, ".codex");
    const bundleDir = path.join(codexDir, "plugins", "cache", "context-mode", "context-mode", "1.0.0");
    generateManifests(bundleDir);
    put(path.join(codexDir, "config.toml"), `[plugins."context-mode@context-mode"]\nenabled = true\n\n${toml}`);
    writeFileSync(path.join(bundleDir, C.HOOK_ENTRY_FILE), `process.stdin.resume().on("end",()=>process.stdout.write(${JSON.stringify(RUN_NATIVE)}));`);
    put(path.join(bundleDir, C.HOOK_FIXTURE_DIR, C.HOOK_FIXTURE_FILE), { codex: { event: "PreToolUse", payload: { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } } } });
    const profile = path.join(root, "os-profile");
    mkdirSync(path.join(profile, ".codex"), { recursive: true });
    const bin = fakeCodexBin(root, process.execPath);
    const hostEnv = { USERPROFILE: home, PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), FAKE_OS_PROFILE: profile, FAKE_PLUGIN_BY_HOME: "1", ...env };
    const ctx = ctxFor(home, "codex");
    return { home, codexDir, run: async () => runDoctorChecks(ctx, getAdapter("codex"), { env: hostEnv, bundleDir, piCwd: undefined }) };
  }
  const rowOf = (rows, id) => rows.find((r) => r.id === id);

  test("[D-CODEX-HOME-RUN-1] D5 native plugin in <test-home>/.codex, HOME and CODEX_HOME unset, hooks untrusted: FAIL with 4 of 4, never PASS", RUN_SKIP, async (t) => {
    const rows = await codexRunHome(t).run();
    const d5 = rowOf(rows, "D5");
    assert.equal(d5.status, "FAIL", JSON.stringify(d5));
    assert.equal(d5.detail, "codex lists 4 of 4 context-mode plugin hooks untrusted, so they do not run; run: context-mode setup");
    assert.equal(d5.fixCommand, "context-mode setup --agents codex");
  });

  test("[D-CODEX-HOME-RUN-1] D5 native plugin in <test-home>/.codex, HOME and CODEX_HOME unset, hooks trusted: PASS", RUN_SKIP, async (t) => {
    const d5 = rowOf(await codexRunHome(t, { toml: trustedToml() }).run(), "D5");
    assert.deepEqual(d5, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "PASS", detail: C.DOCTOR_PASS_DETAIL });
  });

  test("[D-CODEX-HOME-RUN-1] D3 reads the Codex home the running plugin sits in, not <home>/.codex of another home", RUN_SKIP, async (t) => {
    const s = codexRunHome(t, { env: { USERPROFILE: undefined, HOME: tmp(t) } });
    const d3 = rowOf(await s.run(), "D3");
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test("[D-CODEX-HOME-RUN-1] D5 native plugin: Codex answers for another home than the plugin's: FAIL that names both homes", RUN_SKIP, async (t) => {
    const s = codexRunHome(t, { toml: trustedToml(), env: { FAKE_IGNORE_CODEX_HOME: "1" } });
    const d5 = rowOf(await s.run(), "D5");
    assert.equal(d5.status, "FAIL", JSON.stringify(d5));
    assert.ok(d5.detail.includes(s.codexDir), d5.detail);
    assert.equal(d5.fixCommand, "context-mode setup --agents codex");
  });

  test("[D-CODEX-HOME-RUN-1] D5 native plugin: Codex gives no answer: FAIL, never PASS", RUN_SKIP, async (t) => {
    const d5 = rowOf(await codexRunHome(t, { toml: trustedToml(), env: { FAKE_SILENT: "1" } }).run(), "D5");
    assert.equal(d5.status, "FAIL", JSON.stringify(d5));
    assert.equal(d5.fixCommand, "context-mode setup --agents codex");
  });

  test("[D-CODEX-HOME-RUN-1] D5 native plugin: no codex on PATH: UNKNOWN with the setup fix, never PASS", RUN_SKIP, async (t) => {
    const d5 = rowOf(await codexRunHome(t, { toml: trustedToml(), env: { PATH: "/usr/bin:/bin" } }).run(), "D5");
    assert.equal(d5.status, "UNKNOWN", JSON.stringify(d5));
    assert.equal(d5.fixCommand, "context-mode setup --agents codex");
  });

  test("[D-CODEX-HOME-RUN-1] D5 native plugin switched off in config.toml: Codex lists none of our hooks: FAIL", RUN_SKIP, async (t) => {
    const s = codexRunHome(t, { toml: trustedToml() });
    const file = path.join(s.codexDir, "config.toml");
    writeFileSync(file, readFileSync(file, "utf8").replace("enabled = true", "enabled = false"));
    const d5 = rowOf(await s.run(), "D5");
    assert.equal(d5.status, "FAIL", JSON.stringify(d5));
  });

  test("[M5] doctor/user-hook-timeout-kept (doctor reads, never rewrites settings.json)", async (t) => {
    const home = tmp(t);
    const file = path.join(home, ".claude", "settings.json");
    const body = JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ timeout: 45 }] }] } });
    put(file, body);
    await doctor(home);
    const { readFileSync } = await import("node:fs");
    assert.equal(readFileSync(file, "utf8"), body);
  });

  test("[M5] doctor/handler-never-isError and no baked paths in the report", async (t) => {
    const home = tmp(t);
    // D-DOCTOR-ISSUE-1: a FAIL writes a report file under HOME, so the test passes a temp HOME, never process.env.
    const { doctorReply } = await import("../src/core/tools/doctor.ts");
    const reply = await doctorReply(ctxFor(home), { env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH ?? "" }, bundleDir: path.join(home, "no-bundle"), piCwd: undefined });
    assert.equal(reply.isError, false);
    assert.ok(reply.text.includes("D10"));
    assert.equal(reply.sandboxBytes, Buffer.byteLength(reply.text, "utf8"));
    assert.ok(!reply.text.includes("/Users/") || reply.text.includes(home), "any path shown must be the live resolved path");
    assert.equal(ctxDoctor.schema.safeParse({ x: 1 }).success, false, "unknown key rejected");
  });

  test("[M7] doctor/cli-command: the ctx_doctor report prints the exact context-mode command to run (ADR-0019 D7)", async (t) => {
    const home = tmp(t);
    const { doctorReply } = await import("../src/core/tools/doctor.ts");
    const reply = await doctorReply(ctxFor(home, "codex"), { env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH ?? "" }, bundleDir: path.join(home, "no-bundle"), piCwd: undefined });
    assert.match(reply.text, /^Run in a terminal: context-mode (doctor|setup) --agents codex$/m);
    if (reply.text.includes("| FAIL |")) assert.match(reply.text, /context-mode setup --agents codex/);
    assert.ok(Buffer.byteLength(reply.text, "utf8") <= 4096, "report stays within REPORT_CAP");
  });
});

describe("ADR-0010 ctx_upgrade tool", { concurrency: CONC }, () => {
  // Spec: docs/architecture/modules/07-tools-ops.md §6 (ctxUpgrade ToolDef, mode "upgrade"|"uninstall", confirmDelete),
  // DEVIATIONS D-M5-U7-4, D-M5-U8-1..3. GP11 rows: keep-user-hooks-on-upgrade (#1239 #1235),
  // opencode-merge-sibling-plugins (#1160), v1 entries removed, no baked paths, rollback works, change table.
  // D-M5-U8-1: the handler takes (input, ToolContext) (impl/07 §6 Export); tests drive runUpgrade(input, deps)
  // with a temp HOME and an injected failing writer.



  function tmp(t) {
    const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-upgrade-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function deps(home, agent, extra = {}) {
    return {
      project: { projectKey: "0123456789abcdef", worktree: path.join(home, "repo"), agent },
      env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH },
      signal: new AbortController().signal,
      ...extra,
    };
  }

  test("[M5] upgrade/tool-shape: ctx_upgrade is a write tool with a strict schema", () => {
    assert.equal(ctxUpgrade.name, "ctx_upgrade");
    assert.equal(ctxUpgrade.readOnly, false);
    assert.equal(ctxUpgrade.alwaysLoad, false);
    assert.equal(typeof ctxUpgrade.handler, "function");
    assert.ok(ctxUpgrade.schema.safeParse({}).success);
    assert.ok(!ctxUpgrade.schema.safeParse({ mode: "x" }).success);
    assert.ok(!ctxUpgrade.schema.safeParse({ other: 1 }).success);
  });

  test("[M5] upgrade/keeps-user-hooks-already-present (#1239 #1235)", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Foo", hooks: [{ type: "command", command: "my-user-hook", timeout: 42 }] }] } }), "utf8");
    await runUpgrade({ mode: "upgrade" }, deps(home, "claude-code"));
    const after = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(after.hooks.PreToolUse[0].hooks[0].command, "my-user-hook");
    assert.equal(after.hooks.PreToolUse[0].hooks[0].timeout, 42);
  });

  test("[M5] upgrade/removes-v1-entries", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ mcpServers: { "context-mode": { command: "node", args: ["v1/server.js"] } }, theme: "dark" }), "utf8");
    const reply = await runUpgrade({ mode: "upgrade" }, deps(home, "claude-code"));
    const after = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(!JSON.stringify(after.mcpServers ?? {}).includes("v1/server.js"));
    assert.equal(after.theme, "dark");
    assert.ok(reply.text.includes("| removed |"), reply.text);
  });

  test("[M5] upgrade/change-table: header, host update row, trailing restart line", async (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    const reply = await runUpgrade({}, deps(home, "claude-code"));
    assert.equal(reply.isError, false);
    const lines = reply.text.split("\n");
    assert.equal(lines[0], "| Area | Before | After |");
    assert.equal(lines[1], "|---|---|---|");
    assert.ok(lines.includes("| host update |  | claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode |"), reply.text);
    assert.ok(reply.text.endsWith("\n\nrestart needed"));
  });

  test("[M5] upgrade/no-baked-paths: the written config never contains the build machine's own temp path", async (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    await runUpgrade({ mode: "upgrade" }, deps(home, "claude-code"));
    const text = readFileSync(path.join(home, ".claude", "settings.json"), "utf8");
    assert.ok(!text.includes(process.cwd()), "written config must not bake in the cwd of the process that ran ctx_upgrade");
  });

  test("[M5] upgrade/rollback-on-write-failure-restores-original-file and v1 removals", async (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".codex"), { recursive: true });
    const toml = path.join(home, ".codex", "config.toml");
    const original = 'model = "x"\n\n[mcp_servers.context-mode]\ncommand = "context-mode"\n';
    writeFileSync(toml, original, "utf8");
    const write = () => { throw new Error("forced write failure"); };
    await assert.rejects(() => runUpgrade({ mode: "upgrade" }, deps(home, "codex", { write })), /forced write failure/);
    assert.equal(readFileSync(toml, "utf8"), original, "a failed upgrade leaves the config byte for byte as it was");
  });

  test("[M5] upgrade/uninstall-without-confirmDelete-keeps-user-data (Q16, D-M5-U7-4)", async (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    const reply = await runUpgrade({ mode: "uninstall" }, deps(home, "claude-code"));
    assert.ok(reply.text.includes("user data kept (confirmDelete not set)"), reply.text);
    for (const area of ["| server |", "| cache |"]) assert.ok(reply.text.includes(area), reply.text);
    assert.ok(reply.text.endsWith("restart needed"));
  });

  test("[M5] upgrade/opencode-merge-sibling-plugins-survive (#1160)", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".config", "opencode");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "opencode.json");
    writeFileSync(file, JSON.stringify({ plugin: ["p1", "p2", "p3"] }), "utf8");
    await runUpgrade({ mode: "upgrade" }, deps(home, "opencode"));
    const after = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(after.plugin, ["p1", "p2", "p3"], "native list is never added to");
  });

  // D-R44-UPGRADE-NATIVE-1 (#1309): the release branch is gone. ctx_upgrade clones nothing and names each agent's
  // own update command; an old release-branch entry becomes the npm spec the agent's updater follows.
  for (const [agent, cmd] of [
    ["claude-code", "claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode"],
    ["codex", "codex plugin marketplace upgrade context-mode"],
    ["gemini", "gemini extensions update context-mode"],
    ["qwen", "qwen extensions update context-mode"],
    ["pi", "pi update --extensions"],
    ["opencode", "opencode plugin update"],
    ["copilot-cli", "npm i -g context-mode && context-mode setup --agents copilot-cli"],
    ["vscode", "npm i -g context-mode && context-mode setup --agents vscode"],
    ["kiro", "npm i -g context-mode && context-mode setup --agents kiro"],
    ["zcode", "npm i -g context-mode && context-mode setup --agents zcode"],
  ]) {
    test(`[M5] upgrade/native-update-command ${agent} (#1309)`, async (t) => {
      const home = tmp(t);
      const reply = await runUpgrade({}, deps(home, agent, { env: { HOME: home, USERPROFILE: home, PATH: "" } }));
      assert.ok(reply.text.includes("| host update |  | " + cmd + " |"), reply.text);
      for (const bad of ["#release", "@release", "@next", "git clone"]) assert.ok(!reply.text.includes(bad), reply.text);
      assert.ok(!existsSync(path.join(home, ".context-mode", "plugins")), "no clone dir");
    });
  }

  test("[M5] upgrade/opencode-release-git-entry-becomes-npm-latest, siblings kept (#1309)", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".config", "opencode");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "opencode.json");
    writeFileSync(file, JSON.stringify({ plugin: ["p1", C.OPENCODE_GIT_SPEC, "p2"] }), "utf8");
    await runUpgrade({}, deps(home, "opencode"));
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).plugin, ["p1", "context-mode@latest", "p2"]);
  });

  test("[M5] upgrade/opencode-release-git-entry-dropped-when-native-npm-entry-exists (#1309)", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".config", "opencode");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "opencode.json");
    writeFileSync(file, JSON.stringify({ plugin: [C.OPENCODE_GIT_SPEC, "context-mode@2.1.3"] }), "utf8");
    await runUpgrade({}, deps(home, "opencode"));
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).plugin, ["context-mode@2.1.3"]);
  });

  test("[M5] upgrade/pi-release-git-entry-becomes-npm-latest, object fields kept (#1309, pi-2)", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ packages: ["npm:other", { source: C.PI_GIT_PACKAGE, extensions: ["a"] }] }), "utf8");
    await runUpgrade({}, deps(home, "pi"));
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).packages, ["npm:other", { source: "npm:context-mode@latest", extensions: ["a"] }]);
  });

  test("[M5] upgrade/pi-native-npm-entry-is-left-alone (#1309, pi-7)", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    const text = JSON.stringify({ packages: ["npm:context-mode@2.1.3"] });
    writeFileSync(file, text, "utf8");
    await runUpgrade({}, deps(home, "pi"));
    assert.equal(readFileSync(file, "utf8"), text);
  });

  test("[M5] upgrade/rollback: a failed config write leaves the old entry in place", async (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    const text = JSON.stringify({ packages: [C.PI_GIT_PACKAGE] });
    writeFileSync(file, text, "utf8");
    const write = () => { throw new Error("forced write failure"); };
    await assert.rejects(() => runUpgrade({}, deps(home, "pi", { write })));
    assert.equal(readFileSync(file, "utf8"), text);
  });
});

describe("ADR-0010 doctor: hook-runs check per agent (GP11)", { concurrency: CONC }, () => {
  // Spec: https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/OPEN-ITEMS.md H5, docs/architecture/adr/0020-hooks-and-skills-on-every-agent.md (saving effect per host).
  // Doctor hook-runs sends one large shell read, in the host's own wire shape, through the installed hook bundle. It
  // passes only when the answer is that host's saving effect (deny + ctx_execute redirect, or replace + ctx_search
  // line) with the project resolved. A silent hook or a NO_PROJECT hook was a false PASS before: pi before
  // D-HA-PI-PROJECT-1 and vscode before D-HF-VSCODE-PROJECT-1 both answered nothing and doctor said PASS.


  const REPO = path.resolve(import.meta.dirname, "..");
  // The real hook entry stands in for the built bundle: same code path as <pkgDir>/hook.mjs after a build.
  const REAL_HOOK = `import ${JSON.stringify(pathToFileURL(path.join(REPO, "src", "entries", "hook.ts")).href)};\n`;
  const SILENT_HOOK = `process.stdin.resume(); process.stdin.on("end", () => {});\n`;
  // The exact line dispatch step 3 writes when resolveProject throws (D-FU-PS-1), then an allow (no answer).
  const NO_PROJECT_HOOK = `process.stdin.resume(); process.stdin.on("end", () => { process.stderr.write("hooks: no project: NO_PROJECT no project root\\n"); });\n`;

  function sandbox(t, hookSrc) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-hook-runs-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const pkgDir = path.join(root, "pkg");
    mkdirSync(home, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, "hook.mjs"), hookSrc);
    const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
    const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, ...win };
    return { home, env, reg: buildRegistry({ home, pkgDir, env }) };
  }

  test("H5: doctor hook-runs PASSES on all 10 hosts with the real hook: the large shell read gets the saving effect", (t) => {
    const s = sandbox(t, REAL_HOOK);
    assert.equal(s.reg.length, ADAPTERS.length);
    assert.equal(s.reg.length, 10);
    for (const row of s.reg) {
      const c = hookRunsCheck(row, s.env);
      assert.equal(c.name, "hook-runs", row.id);
      assert.equal(c.ok, true, row.id + ": " + c.detail);
    }
    // Doctor is read-only: the sample runs in its own temp HOME, never in the user's store.
    assert.equal(existsSync(path.join(s.home, ".context-mode")), false, "doctor wrote into HOME/.context-mode");
  });

  test("H5: doctor hook-runs FAILS on every host when the hook answers nothing (no saving decision)", (t) => {
    const s = sandbox(t, SILENT_HOOK);
    for (const row of s.reg) {
      const c = hookRunsCheck(row, s.env);
      assert.equal(c.ok, false, row.id + " a silent hook is a false PASS");
      assert.ok(c.detail.includes("no saving decision"), row.id + ": " + c.detail);
    }
  });

  test("H5: doctor hook-runs FAILS on every host when the hook cannot resolve the project (NO_PROJECT)", (t) => {
    const s = sandbox(t, NO_PROJECT_HOOK);
    for (const row of s.reg) {
      const c = hookRunsCheck(row, s.env);
      assert.equal(c.ok, false, row.id + " a NO_PROJECT hook is a false PASS");
      assert.ok(c.detail.includes("NO_PROJECT"), row.id + ": " + c.detail);
    }
  });
});

  // serial: withArgv sets process.argv[1] for the doctor
describe("ADR-0010 doctor: setup then doctor round trip (GP11)", () => {
  // Tester report, next.11 (codex-cli 0.156.1, fresh HOME): `setup --yes --agents codex` passes, then ctx_doctor says
  // "D3 FAIL: wrong: MCP entry" and "D4 FAIL: old context-mode config.toml [mcp_servers.context-mode*] section".
  // Setup and doctor must agree on the MCP entry setup writes (D-DOC-RT-1), and D4 must tell a v1 section from ours.


  const REPO = path.resolve(import.meta.dirname, "..");
  const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
  const HOSTS = ["claude-code", "codex", "copilot-cli", "gemini", "kiro", "opencode", "pi", "qwen", "vscode", "zcode"];
  const FILE_HOSTS = ["codex", "copilot-cli", "kiro", "opencode", "vscode", "zcode"]; // setup runs for these
  const ENTRY_HOSTS = ["codex", "kiro", "opencode", "vscode", "zcode"]; // setup writes the MCP/plugin entry into a host config file (copilot-cli: the entry ships in the plugin manifest)

  function sandbox(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-doc-rt-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const bin = path.join(root, "bin");
    const pkgDir = path.join(root, "prefix", "lib", "node_modules", "context-mode");
    for (const d of [home, bin, pkgDir]) mkdirSync(d, { recursive: true });
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
    for (const dir of ["skills", "pi/skills", "claude-code/skills"]) for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(pkgDir, dir, s), { recursive: true });
    if (process.platform === "win32") writeFileSync(path.join(bin, "copilot.cmd"), "@echo context-mode\r\n");
    else writeFileSync(path.join(bin, "copilot"), "#!/bin/sh\necho context-mode\n", { mode: 0o755 });
    const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
    const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win };
    return { root, home, pkgDir, env, tmp: path.join(root, "tmp") };
  }

  // The doctor runs inside the server: process.argv[1] is the bundle the host launched.
  async function asServer(pkgDir, fn) {
    const was = process.argv[1];
    process.argv[1] = path.join(pkgDir, "server.mjs");
    try { return await fn(); } finally { process.argv[1] = was; }
  }

  const d3Parts = (row) => row.detail.split(":")[0] === "wrong" ? row.detail.replace("wrong: ", "").split(", ") : [];

  test("[D-DOC-RT-1] codex: setup --yes --agents codex, then D3 and D4 PASS on a fresh HOME", async (t) => {
    const s = sandbox(t);
    mkdirSync(s.tmp, { recursive: true });
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
    const row = getAdapter("codex");
    const d3 = await asServer(s.pkgDir, () => checkHostConfig(row, s.env, s.home));
    assert.deepEqual([d3.status, d3.detail], ["PASS", "ok"]);
    const d4 = checkV1Leftovers("codex", s.home, { tmp: s.tmp });
    assert.deepEqual([d4.status, d4.detail], ["PASS", "ok"]);
  });

  test("[D-DOC-RT-1] codex: the same round trip with CODEX_HOME set (D3 and D4 read the Codex dir setup wrote)", async (t) => {
    const s = sandbox(t);
    mkdirSync(s.tmp, { recursive: true });
    const env = { ...s.env, CODEX_HOME: path.join(s.root, "codex-home") };
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env, agents: ["codex"], runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
    const d3 = await asServer(s.pkgDir, () => checkHostConfig(getAdapter("codex"), env, s.home));
    assert.deepEqual([d3.status, d3.detail], ["PASS", "ok"]);
    // v1 left a section in the Codex dir that CODEX_HOME names: D4 must look there, not only in ~/.codex.
    writeFileSync(path.join(env.CODEX_HOME, "config.toml"), readFileSync(path.join(env.CODEX_HOME, "config.toml"), "utf8") + '\n[mcp_servers.context-mode.tools.ctx_execute]\napproval_mode = "approve"\n');
    assert.match(checkV1Leftovers("codex", s.home, { tmp: s.tmp, codexDir: env.CODEX_HOME }).detail, /config\.toml/);
  });

  // The real v1 1.0.169 file (package/configs/codex/config.toml) and its tool tables (Codex adapter removes
  // mcp_servers.context-mode and mcp_servers.context-mode.tools.*).
  const V1_TOML = '[features]\nhooks = true\n\n[mcp_servers.context-mode]\ncommand = "context-mode"\n\n[mcp_servers.context-mode.tools.ctx_execute]\napproval_mode = "approve"\n';

  test("[D-DOC-RT-1] D4 still flags a real v1 1.0.169 codex section, and only that", (t) => {
    const s = sandbox(t);
    mkdirSync(s.tmp, { recursive: true });
    const file = path.join(s.home, ".codex", "config.toml");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, V1_TOML);
    const d4 = checkV1Leftovers("codex", s.home, { tmp: s.tmp });
    assert.equal(d4.status, "WARN"); // D-D4-WARN-1 (#1304)
    assert.match(d4.detail, /\[mcp_servers\.context-mode\*\]/);
  });

  test("[D-DOC-RT-1] D4 does not flag a v2 table, a v2 table with tool tables of other servers, or a sibling server named context-mode-x", (t) => {
    const s = sandbox(t);
    mkdirSync(s.tmp, { recursive: true });
    const file = path.join(s.home, ".codex", "config.toml");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '[mcp_servers.context-mode]\ncommand = "/usr/bin/node"\nargs = ["/p/server.mjs", "--agent", "codex"]\n\n[mcp_servers.context-mode-other]\ncommand = "x"\n');
    assert.equal(checkV1Leftovers("codex", s.home, { tmp: s.tmp }).status, "PASS");
  });

  test("[D-DOC-RT-1] all 10 hosts: after setup, D4 is clean and D3 names no MCP entry for a host whose entry setup wrote", async (t) => {
    const s = sandbox(t);
    mkdirSync(s.tmp, { recursive: true });
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: FILE_HOSTS, runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const project = path.join(s.root, "project");
    mkdirSync(project, { recursive: true });
    const bad = [];
    for (const id of HOSTS) {
      const row = getAdapter(id);
      const d4 = checkV1Leftovers(id, s.home, { tmp: s.tmp, project });
      if (d4.status !== "PASS") bad.push(`${id} D4 ${d4.detail}`);
      if (!ENTRY_HOSTS.includes(id)) continue; // claude-code, gemini, qwen, copilot-cli, pi: the host's own CLI installs the entry, D4 only
      const d3 = await asServer(s.pkgDir, () => checkHostConfig(row, s.env, project));
      if (d3Parts(d3).includes("MCP entry")) bad.push(`${id} D3 ${d3.detail}`);
    }
    assert.deepEqual(bad, []);
  });
});

describe("ADR-0010 ctx_doctor agent issue path (D-DOCTOR-ISSUE-1)", { concurrency: CONC }, () => {
  // Owner 2026-11-03: "bu doctor ciktisini direkt agentler nasil otomatik issue acabilecekler hicbir hook ya da link ya da yonerge yok?"
  // and "User in AI Agent'i, issue yu oyle bir doldurmali ki o issueye oyle veriler vermeliyiz ki sen aninda onu fixleyebilmelisin".
  const KEY6 = "6".repeat(16);
  function home(t) {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-doctor-issue-")));
    t.after(() => rmTempDir(dir));
    return dir;
  }
  function ctxOf(h, agent = "claude-code") {
    const projectDir = path.join(h, ".context-mode", "projects", KEY6);
    return {
      project: { projectKey: KEY6, projectDir, dbPath: path.join(projectDir, "context.db"), worktree: h, containmentRoot: h, agent, source: getAdapter(agent).projectSource },
      sessionId: "s1", turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18", clientInfo: { name: agent, version: "9.9.9" },
    };
  }
  const hostOf = (h, extra = {}) => ({ env: { HOME: h, USERPROFILE: h, PATH: process.env.PATH ?? "", SHELL: "/bin/sh", ...extra }, bundleDir: path.join(h, "no-bundle"), piCwd: undefined });

  test("[M5] doctor-issue/D4-old-temp-file-alone-is-PASS-with-the-finding-and-an-empty-Fix", (t) => {
    const h = home(t);
    const tmpDir = home(t);
    writeFileSync(path.join(tmpDir, C.V1_TMP_PREFIX + "x"), "x");
    const d4 = checkV1Leftovers("claude-code", h, { tmp: tmpDir });
    assert.deepEqual(d4, { id: "D4", label: C.DOCTOR_LABEL.D4, status: "PASS", detail: C.V1_REASON.tmpFile });
  });

  test("[M5] doctor-issue/D3-agent-with-no-setup-names-the-setup-command", (t) => {
    const h = home(t);
    const d3 = checkHostConfig(getAdapter("codex"), { HOME: h, USERPROFILE: h }, h);
    assert.equal(d3.status, "FAIL");
    assert.equal(d3.detail, "wrong: MCP entry, hook entries");
    assert.equal(d3.fixCommand, "context-mode setup --agents codex");
  });

  test("[M5] doctor-issue/every-UNKNOWN-row-names-its-cause", async (t) => {
    const h = home(t);
    const { rows } = { rows: await runDoctorChecks(ctxOf(h), getAdapter("claude-code"), hostOf(h)) };
    for (const r of rows.filter((x) => x.status === "UNKNOWN")) assert.ok(r.detail.length > 20 && r.detail.includes(" "), `${r.id}: ${r.detail}`);
    assert.ok(rows.find((r) => r.id === "D1").detail.startsWith("dev build: "));
  });

  test("[M5] doctor-issue/tilde-prints-a-Windows-home-path-with-forward-slashes (D-DOCTOR-WIN-1)", async () => {
    const { tildeOf } = await import("../src/core/ops/doctor-issue.ts");
    const tilde = tildeOf({ USERPROFILE: "C:\\Users\\runner", HOME: "C:\\Users\\runner" });
    assert.equal(tilde("C:\\Users\\runner\\.context-mode\\reports\\doctor-1.md"), "~/.context-mode/reports/doctor-1.md");
    assert.equal(tilde("Project: C:\\Users\\runner\\a\\b (key k)"), "Project: ~/a/b (key k)");
  });

  test("[M5] doctor-issue/FAIL-writes-the-report-file-and-prints-gh-and-the-form-URL", async (t) => {
    const h = home(t);
    const ctx = ctxOf(h);
    // Seed what a maintainer asks for first: a hook error, journal rows, an agent config with a secret.
    mkdirSync(path.join(h, ".context-mode"), { recursive: true });
    writeFileSync(path.join(h, ".context-mode", "hook-errors.log"), JSON.stringify({ ts: "2026-11-03T01:02:03.000Z", agent: "claude-code", stage: "project", label: "SEEDLABEL", message: "m", stack: `at ${h}/x.js` }) + "\n");
    const db = await openDb(ctx.project);
    db.raw.prepare("INSERT INTO events(session_id, worktree, agent, kind, tool, ok, exit_code, bytes, body, turn, created_at, accessed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("s1", h, "claude-code", "cmd", "Bash", 0, 2, 1234, "SECRETBODY", 1, Date.now(), Date.now());
    closeDb(db);
    mkdirSync(path.join(h, ".claude"), { recursive: true });
    writeFileSync(path.join(h, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "context-mode@context-mode": true }, env: { GITHUB_TOKEN: "ghp_seedsecret" } }, null, 2));
    const { doctorReply } = await import("../src/core/tools/doctor.ts");
    const reply = await doctorReply(ctx, hostOf(h, { CODEX_HOME: path.join(h, "codex-home") }));
    const lines = reply.text.split("\n");
    // 1. Environment: two lines above the table (D-DOCTOR-FIX-1: each fits 80 columns).
    assert.ok(lines[0].startsWith("Environment: context-mode "), lines[0]);
    assert.ok(lines[1].startsWith("Environment: "), lines[1]);
    for (const part of [`${process.platform}-${process.arch}`, process.version, "claude-code 9.9.9", "/bin/sh"]) assert.ok((lines[0] + lines[1]).includes(part), part);
    assert.equal(lines[2], C.REPORT_HEADER);
    // 3 + 5. D3 names setup; D-DOCTOR-FIX-1: the docs link with UTM shows once, under the table, and in no row.
    assert.ok(reply.text.includes("Fix: context-mode setup --agents claude-code"));
    assert.ok(!lines.some((l) => l.startsWith("| ") && l.includes("contextmode.ai")), "rows hold no docs link");
    const docs = lines.filter((l) => l.startsWith("Docs: "));
    assert.equal(docs.length, 1, reply.text);
    assert.ok(docs[0].startsWith("Docs: https://contextmode.ai/docs/engine/doctor?utm_source=ctx_doctor&utm_medium=doctor&utm_content=D"), docs[0]);
    // D-DOCTOR-FIX-1: every line outside the table fits 80 columns; the two URL lines are one link each.
    for (const l of lines.filter((x) => !x.startsWith("| ") && !x.startsWith("Docs: ") && !x.startsWith("Or open: "))) assert.ok([...l].length <= 80, l);
    // 6. Report path (home as ~), gh line and the prefilled form URL.
    const rep = lines.find((l) => l.startsWith("Report file: ~/.context-mode/reports/doctor-"));
    assert.ok(rep, reply.text);
    const file = path.join(h, rep.slice("Report file: ~/".length));
    assert.ok(existsSync(file), file);
    // D-DOCTOR-FIX-1: the gh command wraps with a trailing backslash, so a terminal runs the three lines as one.
    const gi = lines.findIndex((l) => l.startsWith(`File it: gh issue create --repo ${C.ISSUE_REPO_SLUG} --label bug \\`));
    assert.ok(gi > 0, reply.text);
    assert.ok(lines[gi + 1].startsWith("  --title \"ctx_doctor claude-code: ") && lines[gi + 1].endsWith(" \\"), lines[gi + 1]);
    assert.ok(lines[gi + 2].startsWith("  --body-file ~/.context-mode/reports/doctor-"), lines[gi + 2]);
    const url = lines.find((l) => l.startsWith("Or open: https://github.com/mksglu/context-mode/issues/new?template=agent-report.yml&"));
    assert.ok(url && url.length < 8000, url);
    // 10. The report holds every form field, in the form's order, and the debug data, with home as ~ and secrets masked.
    const body = readFileSync(file, "utf8");
    let at = -1;
    for (const head of C.ISSUE_FORM_HEADINGS) {
      const i = body.indexOf("### " + head + "\n", at + 1);
      assert.ok(i > at, "heading missing or out of order: " + head);
      at = i;
    }
    for (const need of ["SEEDLABEL", "2026-11-03T01:02:03.000Z", "| kind | tool | bytes | ok | exit_code | created_at |", "| cmd | Bash | 1234 | 0 | 2 |",
      "~/.claude/settings.json", "context-mode@context-mode", "CODEX_HOME=~/codex-home", "CLAUDE_CONFIG_DIR", "PATH holds node:", "git version",
      "Install route:", "claude plugin marketplace add mksglu/context-mode", "Prompt or command:", "Expected:", "Actual:", "mktemp -d", "Reproduced:", C.REPORT_HEADER]) {
      assert.ok(body.includes(need), "report must hold: " + need);
    }
    for (const leak of ["SECRETBODY", "ghp_seedsecret", h]) assert.ok(!body.includes(leak), "report leaks: " + leak);
    // The report is a valid issue body for the intake check.
    const intake = await import("../.github/scripts/issue-intake.mjs");
    // D-INTAKE-SCORE-1: the bot finds the doctor table and the env facts; a source checkout prints no version number.
    const sc = intake.score(body);
    for (const k of ["report", "agent", "os", "node", "output"]) assert.ok(sc.have[k], k + " " + JSON.stringify(sc));
    // D-INTAKE-SCORE-1: the last note line links the agent's filing rules.
    assert.ok(lines.includes(C.DOCTOR_RULES_LINE + C.ISSUE_GUIDE_URL), reply.text);
    // D-DOCTOR-FIX-1: the whole reply pasted into an issue reads clean too (two env lines, docs line, wrapped gh lines).
    assert.deepEqual(intake.reportKeys(lines).bad, []);
  });

  test("[M5] doctor-issue/agent-report.yml has one required field per report heading; config.yml points to Discord and the docs", () => {
    const form = readFileSync(path.join(import.meta.dirname, "..", ".github", "ISSUE_TEMPLATE", "agent-report.yml"), "utf8");
    const blocks = form.split("\n  - type: ");
    for (const head of C.ISSUE_FORM_HEADINGS) {
      const block = blocks.find((b) => b.includes(`label: ${head}\n`));
      assert.ok(block, "form field missing: " + head);
      assert.ok(block.includes("required: true"), "form field optional: " + head);
    }
    const cfg = readFileSync(path.join(import.meta.dirname, "..", ".github", "ISSUE_TEMPLATE", "config.yml"), "utf8");
    assert.ok(cfg.includes("https://discord.gg/DCN9jUgN5v") && cfg.includes("https://contextmode.ai/docs/engine/doctor?utm_source=github"));
    const brief = readFileSync(path.join(import.meta.dirname, "..", ".github", "AGENT_ISSUE.md"), "utf8");
    assert.ok(brief.includes("agent-report.yml") && brief.includes("~/.context-mode/reports/doctor-"));
  });
});
