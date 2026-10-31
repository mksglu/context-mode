// tests/v2/0010-doctor-upgrade.test.mjs
// Area: ADR-0010 (ctx_doctor, ctx_upgrade), PRD-v2 section 13, TECH-SPEC GP11.
// One file per ADR area (ADR-0024). A new doctor or upgrade test goes into the describe block of its section.
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync, chmodSync, readdirSync, renameSync, symlinkSync, unlinkSync, readlinkSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { checkDoubleFire, checkHostConfig, checkV1Leftovers, composeMatcher } from "../../src/core/ops/doctor-config.ts";
import { getAdapter, ADAPTERS } from "../../src/adapters/table.ts";
import { checkDb, checkIndex } from "../../src/core/ops/doctor-db.ts";
import { openDb, closeDb } from "../../src/core/store/db.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { SCHEMA_VERSION, TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { checkMcp, checkMode, checkNode, checkProject, checkVersion } from "../../src/core/ops/doctor-env.ts";
import { checkHookRoundTrip, codexHookJournaled } from "../../src/core/ops/doctor-hook.ts";
import { DDL } from "../../src/core/store/schema.ts";
import { healD8 } from "../../src/core/ops/db-heal.ts";
import { writeOwnerPid } from "../../src/core/store/owners.ts";
import { fetchRelease } from "../../src/core/ops/release-fetch.ts";
import { CtxError } from "../../src/core/contracts/errors.ts";
import { buildReport } from "../../src/core/ops/report.ts";
import { verifySums } from "../../src/core/ops/verify-sums.ts";
import { ctxDoctor, runDoctorChecks } from "../../src/core/tools/doctor.ts";
import { ctxUpgrade, runUpgrade } from "../../src/core/tools/upgrade.ts";
import { buildRegistry, hookRunsCheck, runSetup } from "../../src/setup/index.ts";
import { generateManifests } from "../../build/manifests.ts";

describe("ADR-0010 doctor D3, D4, D5b: host config, double fire, v1 leftovers", { concurrency: CONC }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md §5 D3, D4, D5b; DEVIATIONS D-M5-arch-3, D-M5-D2-1..4.


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
    const { buildMatcher } = await import("../../build/manifests.ts");
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
    assert.equal(d4.status, "FAIL");
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

  test("[M7] doctor-config/D3-pi-missing-package-FAIL-names-the-file-read", (t) => {
    const home = tmp(t);
    const custom = tmp(t);
    const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: custom }, home);
    assert.equal(d3.status, "FAIL");
    assert.ok(d3.detail.startsWith("wrong: MCP entry"), d3.detail);
    assert.ok(d3.detail.includes(path.join(custom, "settings.json")), d3.detail);
    assert.equal(d3.fixCommand, "run ctx_upgrade");
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
    const { hookCommandString } = await import("../../src/setup/registry.ts");
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
    const { generateManifests } = await import("../../build/manifests.ts");
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
        const { generateManifests } = await import("../../build/manifests.ts");
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
});

describe("ADR-0010 doctor D8, D9: database and index checks", { concurrency: CONC }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md §5 D8 D9, impl/02 (store), DEVIATIONS D-M5-U1-6, D-M5-D4-1..4.
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
  // Spec: docs/v2/impl/07-tools-ops.md §5 D1 D2 D6 D7 D10, ADR-0010, DEVIATIONS D-M5-arch-3, D-M5-arch-5,
  // D-M5-C2-1, D-M5-U1-6, D-M5-D1-1.


  const SHA_A = "a".repeat(40);
  const SHA_B = "b".repeat(40);

  function tmp(t) {
    const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-doctor-env-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  // A fake `git` on PATH that prints one ls-remote line (POSIX only: a #!/bin/sh script).
  function fakeGit(t, stdout, exit = 0) {
    const bin = path.join(tmp(t), "bin");
    mkdirSync(bin);
    const file = path.join(bin, "git");
    writeFileSync(file, `#!/bin/sh\nprintf '${stdout}'\nexit ${exit}\n`);
    chmodSync(file, 0o755);
    return { PATH: `${bin}:/bin:/usr/bin`, HOME: path.dirname(bin), USERPROFILE: path.dirname(bin) };
  }

  const posix = process.platform !== "win32";
  const run = (env, bundleSha) => checkVersion({ bundleSha, env, cwd: env.HOME ?? tmpdir(), signal: new AbortController().signal });

  test("[M5] doctor-env/D1-dev-build-is-UNKNOWN-without-spawning-git", async () => {
    const row = await run({ PATH: "" }, undefined);
    assert.deepEqual(row, { id: "D1", label: "version", status: "UNKNOWN", detail: "dev build" });
  });

  test("[M5] doctor-env/D1-no-git-or-no-network-is-UNKNOWN-not-FAIL", async (t) => {
    const row = await run({ PATH: path.join(tmp(t), "empty"), HOME: tmp(t), USERPROFILE: tmp(t) }, SHA_A);
    assert.deepEqual(row, { id: "D1", label: "version", status: "UNKNOWN", detail: "no network" });
  });

  test("[M5] doctor-env/D1-git-exit-nonzero-is-UNKNOWN", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, "", 128), SHA_A);
    assert.equal(row.status, "UNKNOWN");
    assert.equal(row.detail, "no network");
  });

  test("[M5] doctor-env/D1-equal-sha-PASS", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, `${SHA_A}\\trefs/heads/release\\n`), SHA_A);
    assert.deepEqual(row, { id: "D1", label: "version", status: "PASS", detail: "ok" });
  });

  test("[M5] doctor-env/D1-different-sha-FAIL-update-available-fix-ctx_upgrade", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, `${SHA_B}\\trefs/heads/release\\n`), SHA_A);
    assert.deepEqual(row, { id: "D1", label: "version", status: "FAIL", detail: "update available", fixCommand: "run ctx_upgrade" });
  });

  test("[M5] doctor-env/D1-empty-ls-remote-output-is-UNKNOWN", { skip: !posix }, async (t) => {
    const row = await run(fakeGit(t, ""), SHA_A);
    assert.equal(row.status, "UNKNOWN");
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
  // Spec: docs/v2/impl/07-tools-ops.md §5 D5 + "D5 Codex trust sub-case", DECISIONS-r9 R6,
  // DEVIATIONS D-M5-arch-4 (fixture keyed by agent, hook.mjs --agent from the bundle dir), D-M5-D3-1.


  const FIXTURE = {
    "claude-code": { event: "PreToolUse", payload: { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } } },
    codex: { event: "PreToolUse", payload: { event: "exec", command: "ls" } },
  };

  // A fake release root: hook.mjs prints `out` (and echoes the --agent it got to stderr), fixtures/ next to it.
  function bundle(t, out, { fixture = FIXTURE, exit = 0 } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-doctor-hook-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE),
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s);process.stderr.write(process.argv.slice(2).join(" "));process.stdout.write(${JSON.stringify(out)});process.exitCode=${exit};});`);
    if (fixture !== null) {
      mkdirSync(path.join(dir, C.HOOK_FIXTURE_DIR));
      writeFileSync(path.join(dir, C.HOOK_FIXTURE_DIR, C.HOOK_FIXTURE_FILE), JSON.stringify(fixture));
    }
    return dir;
  }

  function clock(...ticks) { let i = 0; return () => ticks[Math.min(i++, ticks.length - 1)]; }

  function input(dir, extra = {}) {
    return {
      agent: "claude-code", bundleDir: dir, env: { PATH: process.env.PATH ?? "" },
      signal: new AbortController().signal, codexConfigDir: path.join(dir, "no-codex"), db: null,
      now: clock(0, 5), samples: 1, bareMs: async () => 0, ...extra,
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

  test("[M5] doctor-hook/D5-default-baseline-is-a-real-bare-node-run (D-D5-BARE-1)", async (t) => {
    // No bareMs override: the baseline is measured with a real `node -e ""`, so a stub hook that only sleeps 150 ms
    // is slow over it, and a stub that answers at once is not.
    const dir = bundle(t, native);
    const base = { ...input(dir), samples: 2, now: undefined };
    delete base.bareMs;
    delete base.now;
    const fast = await checkHookRoundTrip(base);
    assert.equal(fast.status, "PASS", fast.detail);
    writeFileSync(path.join(dir, C.HOOK_ENTRY_FILE), `setTimeout(()=>{process.stdout.write(${JSON.stringify(native)});},${C.HOOK_P95_MS + 400});process.stdin.resume();process.stdin.on("end",()=>{});`);
    const slow = await checkHookRoundTrip(base);
    assert.equal(slow.status, "FAIL");
    assert.equal(slow.fixCommand, C.D5_FIX);
  });

  test("[M5] doctor-hook/D5-exactly-HOOK_P95_MS-passes", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native), { now: clock(0, C.HOOK_P95_MS) }));
    assert.equal(r.status, "PASS");
  });

  test("[M5] doctor-hook/D5-agent-without-fixture-key-is-UNKNOWN (D-M5-arch-4)", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native), { agent: "gemini" }));
    assert.deepEqual(r, { id: "D5", label: C.DOCTOR_LABEL.D5, status: "UNKNOWN", detail: C.D5_NO_FIXTURE_DETAIL("gemini") });
  });

  test("[M5] doctor-hook/D5-no-fixture-file-is-UNKNOWN", async (t) => {
    const r = await checkHookRoundTrip(input(bundle(t, native, { fixture: null })));
    assert.equal(r.status, "UNKNOWN");
    assert.equal(r.detail, C.D5_NO_FIXTURE_DETAIL("claude-code"));
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

describe("ADR-0010 upgrade step 4a: release fetch", { concurrency: CONC }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md §6 step 4a, ADR-0010 §3, DEVIATIONS D-M5-U1-1, D-M5-U2-1.
  // fetchRelease(agent, url, env, signal) clones one branch (RELEASE_BRANCH) of url with depth 1 into
  // <DATA_ROOT>/plugins/<agent>/.fetch-<pid>, reads HEAD, renames the dir to <sha>. Local repo fixture, no network.


  function tmp(t) {
    const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-release-fetch-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function git(cwd, ...args) {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
  }

  // A repo whose `branch` holds one file; returns { url, sha }.
  function fixtureRepo(root, branch) {
    const repo = path.join(root, "origin");
    mkdirSync(repo);
    git(repo, "init", "-q", "-b", branch);
    writeFileSync(path.join(repo, "server.bundle.mjs"), "export {};\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "release");
    return { url: "file://" + repo, sha: git(repo, "rev-parse", "HEAD") };
  }

  function envFor(home) {
    return { HOME: home, USERPROFILE: home, PATH: process.env.PATH };
  }

  function agentDir(home, agent) {
    return path.join(home, ".context-mode", "plugins", agent);
  }

  test("[M5] release-fetch/clones-release-branch-into-sha-dir", async (t) => {
    const root = tmp(t);
    const { url, sha } = fixtureRepo(root, "release");
    const home = path.join(root, "home");
    mkdirSync(home);
    const r = await fetchRelease("pi", url, envFor(home), new AbortController().signal);
    assert.equal(r.sha, sha);
    assert.equal(r.dir, path.join(agentDir(home, "pi"), sha));
    assert.equal(readFileSync(path.join(r.dir, "server.bundle.mjs"), "utf8"), "export {};\n");
    assert.equal(git(r.dir, "rev-parse", "--abbrev-ref", "HEAD"), "release");
    assert.deepEqual(readdirSync(agentDir(home, "pi")), [sha]);
  });

  test("[M5] release-fetch/missing-release-branch-is-FETCH_FAILED-and-leaves-no-fetch-dir", async (t) => {
    const root = tmp(t);
    const { url } = fixtureRepo(root, "main");
    const home = path.join(root, "home");
    mkdirSync(home);
    await assert.rejects(fetchRelease("opencode", url, envFor(home), new AbortController().signal), (e) => {
      assert.ok(e instanceof CtxError);
      assert.equal(e.code, "FETCH_FAILED");
      assert.ok(String(e.vars.code).startsWith("git exit 128: "), String(e.vars.code));
      return true;
    });
    assert.deepEqual(readdirSync(agentDir(home, "opencode")), []);
  });

  test("[M5] release-fetch/same-sha-already-present-returns-it-unchanged", async (t) => {
    const root = tmp(t);
    const { url, sha } = fixtureRepo(root, "release");
    const home = path.join(root, "home");
    mkdirSync(home);
    const first = await fetchRelease("pi", url, envFor(home), new AbortController().signal);
    writeFileSync(path.join(first.dir, "marker"), "kept");
    const second = await fetchRelease("pi", url, envFor(home), new AbortController().signal);
    assert.equal(second.dir, first.dir);
    assert.equal(readFileSync(path.join(second.dir, "marker"), "utf8"), "kept");
    assert.deepEqual(readdirSync(agentDir(home, "pi")), [sha]);
  });

  test("[M5] release-fetch/argv-form-and-no-prompt-env", async (t) => {
    const root = tmp(t);
    const home = path.join(root, "home");
    const bin = path.join(root, "bin");
    mkdirSync(home);
    mkdirSync(bin);
    const log = path.join(root, "argv.log");
    // A fake git: logs its argv (PATH = bin only, so on Windows the shim is the one hit; printf is an sh builtin) and GIT_TERMINAL_PROMPT, then fails, so the clone never runs.
    writeFileSync(path.join(bin, "git"), `#!/bin/sh\nprintf '%s\\n' "$GIT_TERMINAL_PROMPT" "$@" > '${log}'\nexit 3\n`);
    chmodSync(path.join(bin, "git"), 0o755);
    const url = "https://example.invalid/a b;$(x).git";
    await assert.rejects(fetchRelease("pi", url, { HOME: home, USERPROFILE: home, PATH: bin }, new AbortController().signal), (e) => {
      assert.equal(e.code, "FETCH_FAILED");
      assert.equal(e.vars.code, "git exit 3: ");
      return true;
    });
    const lines = readFileSync(log, "utf8").split("\n");
    lines.pop();
    const fetchDir = path.join(agentDir(home, "pi"), ".fetch-" + process.pid);
    assert.deepEqual(lines, ["0", "clone", "--depth", "1", "--branch", "release", url, fetchDir]);
    assert.equal(existsSync(fetchDir), false);
  });

  test("[M5] release-fetch/git-not-on-PATH-is-FETCH_FAILED-git-did-not-start", async (t) => {
    const root = tmp(t);
    const home = path.join(root, "home");
    mkdirSync(home);
    const empty = path.join(root, "empty-bin");
    mkdirSync(empty);
    await assert.rejects(fetchRelease("pi", "file:///nowhere", { HOME: home, USERPROFILE: home, PATH: empty }, new AbortController().signal), (e) => {
      assert.equal(e.code, "FETCH_FAILED");
      assert.equal(e.vars.code, "git did not start");
      return true;
    });
    assert.deepEqual(readdirSync(agentDir(home, "pi")), []);
  });

  test("[M5] release-fetch/stale-fetch-dir-of-same-pid-is-replaced", async (t) => {
    const root = tmp(t);
    const { url, sha } = fixtureRepo(root, "release");
    const home = path.join(root, "home");
    const stale = path.join(agentDir(home, "pi"), ".fetch-" + process.pid);
    mkdirSync(stale, { recursive: true });
    writeFileSync(path.join(stale, "junk"), "x");
    const r = await fetchRelease("pi", url, envFor(home), new AbortController().signal);
    assert.equal(r.sha, sha);
    assert.equal(existsSync(path.join(r.dir, "junk")), false);
    assert.deepEqual(readdirSync(agentDir(home, "pi")), [sha]);
  });

  // DEVIATIONS D-WIN-ATOMIC-2: the final .fetch-<pid> -> <sha> dir rename fails with EPERM on Windows while
  // antivirus scans the fresh clone. Fake platform + injected rename: runs on every OS.
  test("[win] release-fetch/retries-EPERM-on-dir-rename", async (t) => {
    const root = tmp(t);
    const { url, sha } = fixtureRepo(root, "release");
    const home = path.join(root, "home");
    mkdirSync(home);
    const calls = { n: 0 };
    const rename = (a, b) => {
      calls.n += 1;
      if (calls.n <= 2) throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
      renameSync(a, b);
    };
    const r = await fetchRelease("pi", url, envFor(home), new AbortController().signal, { platform: "win32", rename, sleep: () => {} });
    assert.equal(calls.n, 3);
    assert.equal(r.sha, sha);
    assert.deepEqual(readdirSync(agentDir(home, "pi")), [sha]);
  });
});

describe("ADR-0010 doctor report text", { concurrency: CONC }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md (exports buildReport). 14a GP11/redact-secrets-in-debug-report
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
  // Spec: docs/v2/impl/07-tools-ops.md §6 step 4b + Errors, docs/v2/impl/13-build-release.md §4,
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
  // Spec: docs/v2/impl/07-tools-ops.md §5 (ctxDoctor ToolDef + runDoctorChecks), ADR-0010, TECH-SPEC §6.2 GP11;
  // DEVIATIONS D-M5-arch-3/4/5, D-M5-D6-1 (test drives runDoctorChecks(ctx, adapter, host), the impl/07 shape).
  // D8 is one row whose detail names which of stale-schema / integrity_check failed (A-T5).


  const KEY = "d".repeat(16);
  const ORDER = ["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"];

  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-doctor-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
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
    const reply = await ctxDoctor.handler({}, ctxFor(home));
    assert.equal(reply.isError, false);
    assert.ok(reply.text.includes("D10"));
    assert.equal(reply.sandboxBytes, Buffer.byteLength(reply.text, "utf8"));
    assert.ok(!reply.text.includes("/Users/") || reply.text.includes(home), "any path shown must be the live resolved path");
    assert.equal(ctxDoctor.schema.safeParse({ x: 1 }).success, false, "unknown key rejected");
  });

  test("[M7] doctor/cli-command: the ctx_doctor report prints the exact context-mode command to run (ADR-0019 D7)", async (t) => {
    const home = tmp(t);
    const reply = await ctxDoctor.handler({}, ctxFor(home, "codex"));
    assert.match(reply.text, /^Run in a terminal: context-mode (doctor|setup) --agents codex$/m);
    if (reply.text.includes("| FAIL |")) assert.match(reply.text, /context-mode setup --agents codex/);
    assert.ok(Buffer.byteLength(reply.text, "utf8") <= 4096, "report stays within REPORT_CAP");
  });
});

describe("ADR-0010 ctx_upgrade tool", { concurrency: CONC }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md §6 (ctxUpgrade ToolDef, mode "upgrade"|"uninstall", confirmDelete),
  // DEVIATIONS D-M5-U7-4, D-M5-U8-1..3. GP11 rows: keep-user-hooks-on-upgrade (#1239 #1235),
  // opencode-merge-sibling-plugins (#1160), v1 entries removed, no baked paths, rollback works, change table.
  // D-M5-U8-1: the handler takes (input, ToolContext) (impl/07 §6 Export); tests drive runUpgrade(input, deps)
  // with a temp HOME, a local release repo and an injected failing writer.


  // D-WIN-JUNCTION-1: POSIX stores the bare sha, a Windows junction stores the absolute <agentDir>/<sha>.
  const linkText = (agentDir, sha) => (process.platform === "win32" ? path.join(agentDir, sha) : sha);

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
      releaseUrl: "file:///nonexistent",
      ...extra,
    };
  }

  function git(cwd, ...args) {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
  }

  // A local repo whose `release` branch holds server.mjs and a SHA256SUMS for it (good = true) or a wrong one.
  function releaseRepo(root, body, good = true) {
    const repo = path.join(root, "origin");
    if (!existsSync(repo)) { mkdirSync(repo); git(repo, "init", "-q", "-b", "release"); }
    writeFileSync(path.join(repo, "server.mjs"), body);
    const hex = createHash("sha256").update(good ? body : body + "x").digest("hex");
    writeFileSync(path.join(repo, "SHA256SUMS"), hex + "  server.mjs\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", body);
    return { url: "file://" + repo, sha: git(repo, "rev-parse", "HEAD") };
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
    const { url } = releaseRepo(home, "export {};\n");
    await runUpgrade({ mode: "upgrade" }, deps(home, "opencode", { releaseUrl: url }));
    const after = JSON.parse(readFileSync(file, "utf8"));
    for (const p of ["p1", "p2", "p3"]) assert.ok(after.plugin.includes(p));
  });

  test("[M5] upgrade/git-checkout: fetch, verify, swap current, keep one rollback generation", async (t) => {
    const home = tmp(t);
    const agentDir = path.join(home, ".context-mode", "plugins", "pi");
    const one = releaseRepo(home, "export const v = 1;\n");
    const r1 = await runUpgrade({}, deps(home, "pi", { releaseUrl: one.url }));
    assert.equal(readlinkSync(path.join(agentDir, "current")), linkText(agentDir, one.sha));
    assert.ok(r1.text.includes("| plugin checkout |  | " + path.join(agentDir, one.sha) + " |"), r1.text);
    const two = releaseRepo(home, "export const v = 2;\n");
    await runUpgrade({}, deps(home, "pi", { releaseUrl: two.url }));
    assert.equal(readlinkSync(path.join(agentDir, "current")), linkText(agentDir, two.sha));
    assert.ok(existsSync(path.join(agentDir, one.sha)), "previous generation kept for rollback");
  });

  test("[M5] upgrade/git-checkout: SHA256SUMS mismatch is BUNDLE_HASH_MISMATCH, current unchanged", async (t) => {
    const home = tmp(t);
    const agentDir = path.join(home, ".context-mode", "plugins", "pi");
    const one = releaseRepo(home, "export const v = 1;\n");
    await runUpgrade({}, deps(home, "pi", { releaseUrl: one.url }));
    const bad = releaseRepo(home, "export const v = 2;\n", false);
    await assert.rejects(() => runUpgrade({}, deps(home, "pi", { releaseUrl: bad.url })), (e) => e.code === "BUNDLE_HASH_MISMATCH");
    assert.equal(readlinkSync(path.join(agentDir, "current")), linkText(agentDir, one.sha));
    assert.ok(!existsSync(path.join(agentDir, bad.sha)), "a rejected tree is not left on disk");
  });

  test("[M5] upgrade/git-checkout rollback: a failed config write points current back at the kept generation", async (t) => {
    const home = tmp(t);
    const agentDir = path.join(home, ".context-mode", "plugins", "pi");
    const one = releaseRepo(home, "export const v = 1;\n");
    await runUpgrade({}, deps(home, "pi", { releaseUrl: one.url }));
    const two = releaseRepo(home, "export const v = 2;\n");
    writeFileSync(path.join(home, ".pi", "agent", "settings.json"), "{}", "utf8"); // the run must write its entry again
    const write = () => { throw new Error("forced write failure"); };
    await assert.rejects(() => runUpgrade({}, deps(home, "pi", { releaseUrl: two.url, write })));
    assert.equal(readlinkSync(path.join(agentDir, "current")), linkText(agentDir, one.sha));
  });
});

describe("ADR-0010 doctor: hook-runs check per agent (GP11)", { concurrency: CONC }, () => {
  // Spec: docs/v2/OPEN-ITEMS.md H5, docs/v2/adr/0020-hooks-and-skills-on-every-agent.md (saving effect per host).
  // Doctor hook-runs sends one large shell read, in the host's own wire shape, through the installed hook bundle. It
  // passes only when the answer is that host's saving effect (deny + ctx_execute redirect, or replace + ctx_search
  // line) with the project resolved. A silent hook or a NO_PROJECT hook was a false PASS before: pi before
  // D-HA-PI-PROJECT-1 and vscode before D-HF-VSCODE-PROJECT-1 both answered nothing and doctor said PASS.


  const REPO = path.resolve(import.meta.dirname, "../..");
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


  const REPO = path.resolve(import.meta.dirname, "../..");
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
    assert.equal(d4.status, "FAIL");
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
