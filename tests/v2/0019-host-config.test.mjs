// ADR-0019 / ADR-0023 / PRD-setup: host config files, atomic writes, plugin root and swap, uninstall.
// Area: 0019-host-config (docs/v2/TEST-LAYOUT.md).
// Merged by ADR-0024 from 8 files (see docs/v2/TEST-LAYOUT.md). One describe block per old file; test names are unchanged.
// Serial where a test sets process.env (host-text); the other blocks use own temp dirs and run their tests concurrently.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { atomicWriteFile, renameWithRetry, unlinkWithRetry } from "../../src/core/ops/atomic-file.ts";
import { ATOMIC_RENAME_RETRIES, PI_GIT_PACKAGE } from "../../src/core/contracts/constants.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { editHostConfigText, hostConfigValueAt, mergeOwnEntries, parseHostConfig, readHostConfig, tomlTableSpans, writeHostConfigEdit } from "../../src/core/ops/host-config.ts";
import { spawnSync } from "node:child_process";
import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import { hostLayout, hostText, withLayout } from "../../src/core/ops/host-text.ts";
import { detectV1 } from "../../src/core/ops/detect-v1.ts";
import { removeV1 } from "../../src/core/ops/v1-remove.ts";
import { checkHostConfig } from "../../src/core/ops/doctor-config.ts";
import { getAdapter } from "../../src/adapters/table.ts";
import { OWN_TABLE, TOML_FIXTURES, WITH_OWN } from "./ops/toml-fixtures.mjs";
import { readUserDeny } from "../../src/core/policy/user-deny.ts";
import { runUninstall } from "../../src/core/ops/uninstall.ts";
import { hostConfigPath, regenerateHostConfig } from "../../src/core/ops/host-write.ts";
import { resolvePluginRoot } from "../../src/core/ops/plugin-root.ts";
import { CtxError } from "../../src/core/contracts/errors.ts";
import { swapPluginCurrent } from "../../src/core/ops/plugin-swap.ts";

describe("ADR-0019 host text layout: BOM, CRLF (D-WIN-BOM, D-WIN-EOL)", () => {
  // serial: one test sets process.env.HOME and restores it.
  // tests/v2/ops/host-text.test.mjs
  // CC-WIN-3: BOM and CRLF in host config files. Runs on every OS (the bytes are built in the test).


  const BOM = "﻿";
  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-host-text-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  test("host-text: layout is read, text is plain LF, layout comes back byte for byte", () => {
    const raw = BOM + '{\r\n  "a": 1\r\n}\r\n';
    assert.deepEqual(hostLayout(raw), { bom: true, crlf: true });
    assert.equal(hostText(raw), '{\n  "a": 1\n}\n');
    assert.equal(withLayout(hostText(raw), hostLayout(raw)), raw);
    assert.deepEqual(hostLayout('{"a":1}\n'), { bom: false, crlf: false });
    assert.equal(hostText('{"a":1}\n'), '{"a":1}\n');
    assert.equal(withLayout("x\n", { bom: false, crlf: false }), "x\n");
    assert.equal(hostText(""), "");
    assert.equal(hostText(BOM), "");
    assert.equal(hostText("a\rb"), "a\rb", "a lone CR stays");
    assert.equal(hostText("a" + BOM), "a" + BOM, "only a leading BOM goes");
  });

  test("host-text: readHostConfig strips a BOM and CRLF; writeHostConfigEdit keeps both", (t) => {
    const dir = tmp(t);
    const file = path.join(dir, "settings.json");
    const raw = BOM + '{\r\n  "model": "x"\r\n}\r\n';
    writeFileSync(file, raw, "utf8");
    const cur = readHostConfig("kiro", file);
    assert.equal(cur.text, '{\n  "model": "x"\n}\n');
    writeHostConfigEdit(file, cur, { extra: 1 });
    const out = readFileSync(file, "utf8");
    assert.equal(out.charCodeAt(0), 0xfeff);
    assert.equal(out.split("\r\n").join("").includes("\n"), false, "every line end is CRLF");
    assert.deepEqual(JSON.parse(out.slice(1)), { model: "x", extra: 1 });
  });

  test("host-text: readHostConfig reads a BOM + CRLF opencode.json and a BOM opencode.jsonc sibling (OC-WIN-1)", (t) => {
    const dir = tmp(t);
    const json = path.join(dir, "opencode.json");
    writeFileSync(json, BOM + '{\r\n  "theme": "dark"\r\n}\r\n', "utf8");
    const a = readHostConfig("opencode", json);
    assert.equal(a.text.charCodeAt(0), 0x7b, "BOM off");
    assert.deepEqual(parseHostConfig("opencode", a.path, a.text, a.format), { theme: "dark" });
    writeFileSync(path.join(dir, "opencode.jsonc"), BOM + '{\r\n  // c\r\n  "theme": "light",\r\n}\r\n', "utf8");
    const b = readHostConfig("opencode", json);
    assert.equal(b.format, "jsonc");
    assert.deepEqual(parseHostConfig("opencode", b.path, b.text, b.format), { theme: "light" });
  });

  test("host-text: detectV1 sees a v1 hook in a settings.json that starts with a BOM", (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeFileSync(path.join(home, ".claude", "settings.json"), BOM + JSON.stringify({ mcpServers: { "context-mode": { command: "node" } } }, null, 2).split("\n").join("\r\n"), "utf8");
    assert.ok(detectV1("claude-code", home, { tmp: tmp(t) }).length > 0);
  });

  test("host-text: removeV1 edits a BOM + CRLF file and keeps its layout", (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    const file = path.join(home, ".claude", "settings.json");
    const doc = { model: "x", mcpServers: { "context-mode": { command: "node" } } };
    writeFileSync(file, BOM + JSON.stringify(doc, null, 2).split("\n").join("\r\n") + "\r\n", "utf8");
    const findings = detectV1("claude-code", home, { tmp: tmp(t) });
    const rm = removeV1("claude-code", findings);
    rm.commit();
    const out = readFileSync(file, "utf8");
    assert.equal(out.charCodeAt(0), 0xfeff);
    assert.equal(out.split("\r\n").join("").includes("\n"), false);
    assert.equal(JSON.parse(out.slice(1)).mcpServers["context-mode"], undefined);
    assert.equal(JSON.parse(out.slice(1)).model, "x");
  });

  test("host-text: readUserDeny reads deny rules from a settings.json with a BOM (not fail-closed null)", (t) => {
    const root = tmp(t);
    const home = path.join(root, "home");
    const proj = path.join(root, "proj");
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    mkdirSync(proj, { recursive: true });
    writeFileSync(path.join(home, ".claude", "settings.json"), BOM + '{\r\n  "permissions": { "deny": ["Bash(sudo *)"] }\r\n}\r\n', "utf8");
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
    process.env.HOME = home; process.env.USERPROFILE = home; delete process.env.CLAUDE_CONFIG_DIR;
    t.after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
    assert.deepEqual(readUserDeny(proj, "claude-code"), ["Bash(sudo *)"]);
  });

  // OC-WIN-5: the editor inserts text as LF and withLayout gives it the file's line end. Runs on every OS.
  test("host-text: lines inserted into a CRLF opencode.json are CRLF too, not mixed (OC-WIN-5)", (t) => {
    const dir = tmp(t);
    const file = path.join(dir, "opencode.json");
    const raw = BOM + '{\r\n  "theme": "dark"\r\n}\r\n';
    writeFileSync(file, raw, "utf8");
    const cur = readHostConfig("opencode", file);
    writeHostConfigEdit(file, cur, { plugin: ["a", "b"], mcp: { "context-mode": { type: "local", command: ["node", "s.mjs"] } } });
    const out = readFileSync(file, "utf8");
    assert.equal(out.split("\r\n").join("").includes("\n"), false, "every line end is CRLF");
    assert.ok(out.split("\r\n").length > 8, "the insert added lines");
    assert.deepEqual(JSON.parse(out.slice(1)).theme, "dark");
  });

  test("host-text: the dominant line end wins; a mostly-LF file with one CRLF line stays LF (OC-WIN-5)", (t) => {
    assert.deepEqual(hostLayout('{\n  "a": 1,\r\n  "b": 2\n}\n'), { bom: false, crlf: false });
    assert.deepEqual(hostLayout('{\r\n  "a": 1,\n  "b": 2\r\n}\r\n'), { bom: false, crlf: true });
    assert.deepEqual(hostLayout('{\r\n  "a": 1\n}'), { bom: false, crlf: true }, "a tie keeps CRLF");
    const dir = tmp(t);
    const file = path.join(dir, "opencode.json");
    writeFileSync(file, '{\n  "theme": "dark",\r\n  "x": 1\n}\n', "utf8");
    writeHostConfigEdit(file, readHostConfig("opencode", file), { plugin: ["a"] });
    const out = readFileSync(file, "utf8");
    assert.equal(out.includes("\r"), false, "no CRLF forced onto an LF file");
  });

  // PI-WIN-2: pi settings.json written by PowerShell 5 or Notepad has a BOM and CRLF. Doctor, ctx_upgrade and uninstall
  // read it through readHostConfig. Runs on every OS (the bytes are built in the test).
  function piSettings(t, packages) {
    const home = tmp(t);
    const file = path.join(home, ".pi", "agent", "settings.json");
    mkdirSync(path.dirname(file), { recursive: true });
    const raw = BOM + JSON.stringify({ theme: "dark", packages }, null, 2).split("\n").join("\r\n") + "\r\n";
    writeFileSync(file, raw, "utf8");
    return { home, file, raw };
  }

  test("host-text: readHostConfig reads a BOM + CRLF pi settings.json (PI-WIN-2)", (t) => {
    const { file } = piSettings(t, ["npm:other", PI_GIT_PACKAGE]);
    const cur = readHostConfig("pi", file);
    assert.equal(cur.text.charCodeAt(0), 0x7b, "BOM off");
    assert.equal(cur.text.includes("\r"), false, "CRLF off");
    assert.deepEqual(parseHostConfig("pi", cur.path, cur.text, cur.format).packages, ["npm:other", PI_GIT_PACKAGE]);
  });

  test("host-text: doctor D3 passes on a BOM + CRLF pi settings.json, no CONFIG_PARSE_FAILED (PI-WIN-2)", (t) => {
    const { home } = piSettings(t, [PI_GIT_PACKAGE]);
    const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test("host-text: uninstall drops the own pi package from a BOM + CRLF settings.json and keeps BOM, CRLF and user keys (PI-WIN-2)", (t) => {
    const { home, file } = piSettings(t, ["npm:other", PI_GIT_PACKAGE]);
    runUninstall({ adapter: { id: "pi", installMode: "in-process" }, project: { projectKey: "abcdef0123456789" }, env: { HOME: home, USERPROFILE: home }, confirmDelete: false });
    const out = readFileSync(file, "utf8");
    assert.equal(out.charCodeAt(0), 0xfeff, "BOM kept");
    assert.equal(out.split("\r\n").join("").includes("\n"), false, "every line end is CRLF");
    const doc = JSON.parse(out.slice(1));
    assert.deepEqual(doc.packages, ["npm:other"]);
    assert.equal(doc.theme, "dark");
  });
});

// Independent blocks (own temp dirs, no process-wide state): they run at the same time.
describe("ADR-0019 host config (concurrent blocks)", { concurrency: true }, () => {
  describe("ADR-0019 atomic file replace and unlink (D-WIN-ATOMIC)", { concurrency: true }, () => {
    // tests/v2/ops/atomic-file.test.mjs
    // DEVIATIONS D-WIN-ATOMIC-1: on Windows a rename over a file another process holds open (host watching
    // settings.json, antivirus, indexer) fails with EPERM/EBUSY/EACCES. renameWithRetry retries; atomicWriteFile
    // removes its tmp file on failure and names the file to free. Fake platform + injected rename: runs on every OS.


    function tmp(t) {
      const dir = mkdtempSync(path.join(tmpdir(), "cm-atomic-"));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }
    function failing(code, times, real) {
      const calls = { n: 0 };
      const rename = (a, b) => {
        calls.n += 1;
        if (calls.n <= times) throw Object.assign(new Error(`${code}: busy, rename`), { code });
        real(a, b);
      };
      return { calls, rename };
    }
    const noSleep = () => {};

    test("[win] atomic-file/rename-retries-EPERM-twice-then-succeeds", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "settings.json");
      writeFileSync(file, "old");
      writeFileSync(file + ".new", "new");
      const { calls, rename } = failing("EPERM", 2, (a, b) => renameWithRetry(a, b, { platform: "linux" }));
      renameWithRetry(file + ".new", file, { platform: "win32", rename, sleep: noSleep });
      assert.equal(calls.n, 3);
      assert.equal(readFileSync(file, "utf8"), "new");
    });

    test("[win] atomic-file/rename-retries-EBUSY-and-EACCES", () => {
      for (const code of ["EBUSY", "EACCES"]) {
        const { calls, rename } = failing(code, 1, () => {});
        renameWithRetry("a", "b", { platform: "win32", rename, sleep: noSleep });
        assert.equal(calls.n, 2, code);
      }
    });

    test("[win] atomic-file/rename-does-not-retry-on-posix-or-other-codes", () => {
      const a = failing("EPERM", 9, () => {});
      assert.throws(() => renameWithRetry("a", "b", { platform: "linux", rename: a.rename, sleep: noSleep }), /EPERM/);
      assert.equal(a.calls.n, 1);
      const b = failing("ENOENT", 9, () => {});
      assert.throws(() => renameWithRetry("a", "b", { platform: "win32", rename: b.rename, sleep: noSleep }), /ENOENT/);
      assert.equal(b.calls.n, 1);
    });

    test("[win] atomic-file/rename-gives-up-after-the-retry-budget", () => {
      const { calls, rename } = failing("EBUSY", 99, () => {});
      const slept = [];
      assert.throws(() => renameWithRetry("a", "b", { platform: "win32", rename, sleep: (ms) => slept.push(ms) }), /EBUSY/);
      assert.equal(calls.n, ATOMIC_RENAME_RETRIES + 1);
      assert.equal(slept.length, ATOMIC_RENAME_RETRIES);
    });

    test("[win] atomic-file/write-succeeds-after-two-failed-renames-and-leaves-no-tmp", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "sub", "settings.json");
      const { calls, rename } = failing("EPERM", 2, (a, b) => renameWithRetry(a, b, { platform: "linux" }));
      atomicWriteFile(file, "{}", { platform: "win32", rename, sleep: noSleep });
      assert.equal(calls.n, 3);
      assert.equal(readFileSync(file, "utf8"), "{}");
      assert.deepEqual(readdirSync(path.dirname(file)), ["settings.json"]);
    });

    test("[win] atomic-file/write-failure-removes-tmp-keeps-old-file-and-says-close-the-program", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "settings.json");
      writeFileSync(file, "old");
      const { rename } = failing("EBUSY", 99, () => {});
      assert.throws(
        () => atomicWriteFile(file, "new", { platform: "win32", rename, sleep: noSleep }),
        (e) => e.message.includes(file) && e.message.includes("Fix: close the program using") && e.message.includes("EBUSY"),
      );
      assert.equal(readFileSync(file, "utf8"), "old");
      assert.deepEqual(readdirSync(dir), ["settings.json"]);
      assert.equal(existsSync(file + ".tmp"), false);
    });

    test("[win] atomic-file/posix-write-failure-also-removes-tmp", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "a.json");
      const { rename } = failing("EACCES", 99, () => {});
      assert.throws(() => atomicWriteFile(file, "x", { platform: "linux", rename, sleep: noSleep }), /EACCES/);
      assert.deepEqual(readdirSync(dir), []);
    });

    // Guard: the file replace sites go through the one helper, not a bare renameSync (no regex: plain string search).
    test("[win] atomic-file/no-bare-renameSync-at-the-file-replace-sites", () => {
      for (const f of ["src/setup/engine.ts", "src/core/ops/host-write.ts", "src/core/ops/host-config.ts", "src/core/ops/v1-remove.ts", "src/core/ops/db-heal.ts"]) {
        assert.equal(readFileSync(path.join(import.meta.dirname, "../..", f), "utf8").includes("renameSync("), false, f);
      }
    });

    // Q-WIN-1 / D-WIN-ATOMIC-4: rollback removes a file the setup created. On Windows that unlink fails with
    // EPERM/EBUSY while the host holds the file open, so it retries like the rename does.
    test("[win] atomic-file/unlink-retries-EBUSY-twice-then-succeeds", () => {
      let n = 0;
      const unlink = () => { n += 1; if (n <= 2) throw Object.assign(new Error("EBUSY: busy, unlink"), { code: "EBUSY" }); };
      unlinkWithRetry("C:\\x\\settings.json", { platform: "win32", unlink, sleep: noSleep });
      assert.equal(n, 3);
    });

    test("[win] atomic-file/unlink-does-not-retry-on-posix-and-names-the-file-when-it-gives-up", () => {
      let n = 0;
      const unlink = () => { n += 1; throw Object.assign(new Error("EPERM: busy, unlink"), { code: "EPERM" }); };
      assert.throws(() => unlinkWithRetry("/x/settings.json", { platform: "linux", unlink, sleep: noSleep }), /Could not replace \/x\/settings\.json.*close the program/);
      assert.equal(n, 1);
      n = 0;
      assert.throws(() => unlinkWithRetry("C:\\x\\s.json", { platform: "win32", unlink, sleep: noSleep }), /close the program using C:\\x\\s\.json/);
      assert.equal(n, ATOMIC_RENAME_RETRIES + 1);
    });

    test("[win] atomic-file/unlink-of-a-missing-file-is-not-an-error", () => {
      const unlink = () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
      unlinkWithRetry("/x/gone.json", { platform: "win32", unlink, sleep: noSleep });
    });

    test("[win] atomic-file/setup-rollback-has-no-bare-unlinkSync", () => {
      assert.equal(readFileSync(path.join(import.meta.dirname, "../..", "src/setup/engine.ts"), "utf8").includes("unlinkSync("), false);
    });

    // PI-WIN-3 / D-WIN-ATOMIC-6: on failure the tmp file is removed through the retrying unlink, and a tmp file that
    // stays held (antivirus scanning it) never hides the rename error that the user must see.
    test("[win] atomic-file/failed-write-removes-tmp-with-the-retrying-unlink", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "settings.json");
      const removed = [];
      const { rename } = failing("EBUSY", 99, () => {});
      const unlink = (f) => { removed.push(f); throw Object.assign(new Error("EBUSY: tmp held"), { code: "EBUSY" }); };
      assert.throws(
        () => atomicWriteFile(file, "new", { platform: "win32", rename, unlink, sleep: noSleep }),
        (e) => e.message.includes("Could not replace " + file) && e.message.includes("Fix: close the program using") && !e.message.includes("tmp held"),
      );
      assert.equal(removed.length, ATOMIC_RENAME_RETRIES + 1);
      assert.ok(removed.every((f) => path.dirname(f) === dir && f.includes("settings.json")), removed.join());
    });
  });

  describe("ADR-0019 host config edit keeps user content (M5)", { concurrency: true }, () => {
    // tests/v2/ops/host-config.test.mjs
    // Spec: docs/v2/impl/07-tools-ops.md §2. 14a GP11/jsonc-comment-boundaries (#1271): a JSONC
    // config with a URL string containing // keeps that string and existing comments intact
    // through a read/edit/write round trip.


    function tmp(t) {
      const dir = mkdtempSync(path.join(tmpdir(), "cm-host-config-"));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }

    test("[M5] host-config/jsonc-comment-boundaries: a // inside a URL string survives an edit", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "opencode.jsonc");
      const original = [
        "{",
        '  // keep this comment',
        '  "url": "https://example.com//weird//path",',
        '  "plugin": []',
        "}",
        "",
      ].join("\n");
      writeFileSync(file, original, "utf8");
      const before = readHostConfig("opencode", file);
      writeHostConfigEdit(file, before, { plugin: ["context-mode"] });
      const after = readFileSync(file, "utf8");
      assert.ok(after.includes("// keep this comment"), "existing comment must survive");
      assert.ok(after.includes("https://example.com//weird//path"), "// inside the URL string must survive");
    });

    test("[M5] host-config/keep-user-hooks-on-upgrade: a user-added hook already present stays after an edit (#1239 #1235)", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, JSON.stringify({ plugin: ["user-plugin"] }, null, 2), "utf8");
      const before = readHostConfig("opencode", file);
      writeHostConfigEdit(file, before, { plugin: ["user-plugin", "context-mode"] });
      const after = JSON.parse(readFileSync(file, "utf8"));
      assert.ok(after.plugin.includes("user-plugin"), "user-added entry must still be present");
      assert.ok(after.plugin.includes("context-mode"));
    });

    test("[M5] host-config/opencode-merge-sibling-plugins: 3 existing plugin entries all survive an upgrade write (#1160)", (t) => {
      const dir = tmp(t);
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, JSON.stringify({ plugin: ["p1", "p2", "p3"] }, null, 2), "utf8");
      const before = readHostConfig("opencode", file);
      writeHostConfigEdit(file, before, { plugin: ["p1", "p2", "p3", "context-mode"] });
      const after = JSON.parse(readFileSync(file, "utf8"));
      for (const p of ["p1", "p2", "p3"]) assert.ok(after.plugin.includes(p), `${p} must still be present`);
    });
  });

  describe("ADR-0019 codex TOML reader and editor (D-TOML-PARSER-1)", { concurrency: true }, () => {
    // tests/v2/ops/host-config-toml.test.mjs
    // Tester report 2.0.0-next.6: the Codex setup rejected valid TOML (multiline strings, multiline arrays,
    // [[skills.config]]). Contract: every valid TOML 1.0 file is read, our own table and keys are edited, and every
    // other byte of the file stays. D-TOML-PARSER-1.


    const row = getAdapter("codex");
    const OWN_KEY = ["mcp_servers", "context-mode"];

    const oracle = parseTOML; // independent of host-config.ts: the parser the production code is built on, used as a validator
    const valueOf = (text) => getStaticTOMLValue(oracle(text));
    const without = (value, key) => {
      const copy = structuredClone(value);
      let cur = copy;
      for (const seg of key.slice(0, -1)) cur = cur?.[seg];
      if (cur !== undefined) delete cur[key[key.length - 1]];
      if (copy.mcp_servers && Object.keys(copy.mcp_servers).length === 0) delete copy.mcp_servers;
      return copy;
    };
    const countHeader = (text, header) => text.split("\n").filter((l) => l.trim() === header).length;

    function tmp(t) {
      const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-toml-")));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }

    // python3 tomllib is a second, unrelated TOML 1.0 parser; used when the machine has one.
    function pythonParses(text) {
      for (const bin of ["python3", "python"]) {
        const r = spawnSync(bin, ["-c", "import sys,tomllib;tomllib.loads(sys.stdin.buffer.read().decode('utf-8-sig'))"], { input: text, encoding: "utf8", windowsHide: true });
        if (r.error) continue;
        return r.status === 0;
      }
      return undefined;
    }

    for (const [name, original] of Object.entries(TOML_FIXTURES)) {
      test(`[toml] ${name}: parseHostConfig accepts it and returns the value the oracle parser returns`, () => {
        const parsed = parseHostConfig("codex", "config.toml", original, "toml");
        assert.deepEqual(parsed, valueOf(original));
      });

      test(`[toml] ${name}: merge adds our table once, keeps every user key and byte, and a second merge changes nothing`, () => {
        const first = mergeOwnEntries("codex", original, "toml", row);
        assert.ok(first.edits.length > 0);
        const value = valueOf(first.text); // throws when the output is not valid TOML
        assert.equal(pythonParses(first.text) ?? true, true, "python tomllib parses the output");
        assert.equal(typeof value.mcp_servers["context-mode"].command, "string");
        assert.deepEqual(without(value, OWN_KEY), without(valueOf(original), OWN_KEY), "user keys unchanged");
        assert.equal(countHeader(first.text, OWN_TABLE), countHeader(original, OWN_TABLE) + 1, "our table present once (a header-like line inside a user string is not a table)");
        assert.equal(Object.keys(value.mcp_servers).filter((k) => k === "context-mode").length, 1);
        assert.ok(first.text.startsWith(original), "every original byte is still there, ahead of our appended table");
        const second = mergeOwnEntries("codex", first.text, "toml", row);
        assert.deepEqual(second.edits, []);
        assert.equal(second.text, first.text);
      });

      test(`[toml] ${name}: CRLF and BOM files round trip through the host layout`, () => {
        for (const layout of [{ bom: false, crlf: true }, { bom: true, crlf: false }, { bom: true, crlf: true }]) {
          const raw = withLayout(original, layout);
          assert.deepEqual(hostLayout(raw), original.includes("\n") || !layout.crlf ? layout : { ...layout, crlf: false });
          const first = mergeOwnEntries("codex", hostText(raw), "toml", row);
          const back = withLayout(first.text, hostLayout(raw));
          assert.ok(back.startsWith(raw), "original bytes kept, BOM and line ends included");
          const value = valueOf(hostText(back));
          assert.equal(value.mcp_servers["context-mode"].command.length > 0, true);
          assert.equal(mergeOwnEntries("codex", hostText(back), "toml", row).edits.length, 0);
        }
      });
    }

    test("[toml] an existing own table is replaced in place; comments and tables around it keep their bytes", () => {
      const { before, table, after } = WITH_OWN;
      const original = before + table + after;
      const out = mergeOwnEntries("codex", original, "toml", row);
      assert.ok(out.text.startsWith(before), "text before the table");
      assert.ok(out.text.endsWith(after), "text after the table (a comment ahead of the next table stays)");
      const middle = out.text.slice(before.length, out.text.length - after.length);
      assert.ok(middle.startsWith(OWN_TABLE + "\n"));
      assert.ok(!middle.includes("old-node"));
      assert.equal(countHeader(out.text, OWN_TABLE), 1);
      assert.deepEqual(without(valueOf(out.text), OWN_KEY), without(valueOf(original), OWN_KEY));
    });

    test("[toml] our table written as dotted keys or sub-tables is replaced as one table, not duplicated", () => {
      const dotted = `model = "o3"\nmcp_servers.context-mode.command = "old"\nmcp_servers.other.command = "o"\n\n[features]\nhooks = true\n`;
      const out = mergeOwnEntries("codex", dotted, "toml", row);
      const value = valueOf(out.text);
      assert.equal(value.mcp_servers.other.command, "o");
      assert.notEqual(value.mcp_servers["context-mode"].command, "old");
      assert.equal(value.features.hooks, true);
      const sub = `[mcp_servers.context-mode]\ncommand = "old"\n\n[mcp_servers.context-mode.env]\nK = "v"\n\n[tui]\ntheme = "dark"\n`;
      const out2 = mergeOwnEntries("codex", sub, "toml", row);
      const v2 = valueOf(out2.text);
      assert.deepEqual(v2.mcp_servers["context-mode"].env, { K: "v" }, "the user's env sub-table survives");
      assert.equal(v2.tui.theme, "dark");
      assert.equal(countHeader(out2.text, OWN_TABLE), 1);
    });

    test("[toml] hook trust tables are added beside arrays of tables and multiline strings", () => {
      const original = TOML_FIXTURES["multiline basic string"] + "\n[[skills.config]]\npath = \"/a\"\nenabled = true\n";
      const key = "/h/.codex/hooks.json:pre_tool_use:0:0";
      const out = editHostConfigText("codex", "config.toml", original, "toml", [[["hooks", "state", key], { trusted_hash: "sha256:abc" }]]);
      const value = valueOf(out.text);
      assert.deepEqual(value.hooks.state[key], { trusted_hash: "sha256:abc" });
      assert.deepEqual(value.skills.config, valueOf(original).skills.config);
      assert.ok(out.text.startsWith(original));
    });

    test("[toml] a file that is not TOML is CONFIG_PARSE_FAILED, never rewritten", () => {
      for (const bad of ["a = 1\na = 2\n", "[unclosed\nx = 1\n", "x = \"\"\"never closed\n", "x = [1, 2\n", "= 1\n"]) {
        assert.throws(() => parseHostConfig("codex", "c.toml", bad, "toml"), (e) => e.code === "CONFIG_PARSE_FAILED");
        assert.throws(() => mergeOwnEntries("codex", bad, "toml", row), (e) => e.code === "CONFIG_PARSE_FAILED");
      }
    });

    test("[toml] tomlTableSpans: header, path and line span of each table, a multiline-string line is not a header", () => {
      const text = TOML_FIXTURES["multiline basic string"] + "\n[ mcp_servers . \"context-mode\" ] # spaced\ncommand = \"n\"\n";
      const spans = tomlTableSpans(text);
      assert.deepEqual(spans.map((s) => s.path), [["features"], ["mcp_servers", "context-mode"]]);
      const own = spans[1];
      assert.equal(own.header, "[ mcp_servers . \"context-mode\" ] # spaced");
      assert.equal(text.slice(own.start, own.end), own.header + "\ncommand = \"n\"\n");
    });

    test("[toml] ctx_upgrade: v1 section detection and removal read real tables, not lines of a multiline string", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".codex", "config.toml");
      mkdirSync(path.dirname(file), { recursive: true });
      const original =
        `notes = """\n[mcp_servers.context-mode]\n[not a header]\n"""\n\n[ mcp_servers . "context-mode" ]\ncommand = "context-mode"\nargs = [\n  "[x]",\n]\ndoc = """\n[tui]\n"""\n\n# keep\n[[skills.config]]\npath = "/a"\nenabled = true\n`;
      writeFileSync(file, original);
      const findings = detectV1("codex", home, { tmp: tmp(t) });
      const toml = findings.filter((f) => f.file === file);
      assert.equal(toml.length, 1, "only the real table is a finding");
      const r = removeV1("codex", findings);
      const after = readFileSync(file, "utf8");
      r.commit();
      const value = valueOf(after);
      assert.equal(value.mcp_servers, undefined, "the v1 table is gone with its multiline string");
      assert.equal(value.notes, "[mcp_servers.context-mode]\n[not a header]\n", "the user's string is untouched");
      assert.deepEqual(value.skills.config, [{ path: "/a", enabled: true }]);
      assert.ok(after.includes("# keep\n[[skills.config]]"));
    });

    test("[toml] doctor reads what setup wrote: the same reader on multiline, array-of-tables and CRLF files", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".codex", "config.toml");
      mkdirSync(path.dirname(file), { recursive: true });
      for (const name of ["multiline basic string", "array of tables", "multiline array"]) {
        const merged = mergeOwnEntries("codex", TOML_FIXTURES[name], "toml", row).text;
        writeFileSync(file, withLayout(merged, { bom: true, crlf: true }));
        const d3 = checkHostConfig(row, { HOME: home }, home);
        assert.ok(!String(d3.detail).includes("parse") && !String(d3.detail).includes("unreadable"), `${name}: ${d3.detail}`);
        assert.notEqual(hostConfigValueAt(parseHostConfig("codex", file, merged, "toml"), OWN_KEY), undefined);
      }
    });
  });

  describe("ADR-0019 host config write, rollback, Windows retry", { concurrency: true }, () => {
    // tests/v2/ops/host-write.test.mjs
    // Spec: docs/v2/impl/07-tools-ops.md §6 step 5, §2; DEVIATIONS D-M5-O1-3, D-M5-O1-4, D-M5-U5-1.
    // GP11: keep user values, sibling plugins survive (#1160), .jsonc wins (#849), rollback on write failure,
    // no baked build paths.


    function tmp(t) {
      const dir = mkdtempSync(path.join(tmpdir(), "cm-host-write-"));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }

    test("[M5] host-write/keeps-user-hooks-already-present (#1239 #1235)", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".claude");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "settings.json");
      writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Foo", hooks: [{ type: "command", command: "my-user-hook" }] }] } }), "utf8");
      regenerateHostConfig(getAdapter("claude-code"), home, { env: {} });
      assert.ok(readFileSync(file, "utf8").includes("my-user-hook"));
    });

    test("[M5] host-write/missing-file-is-created-as-valid-config", (t) => {
      const home = tmp(t);
      regenerateHostConfig(getAdapter("claude-code"), home, { env: {} });
      const file = path.join(home, ".claude", "settings.json");
      assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {});
    });

    test("[M5] host-write/opencode-merge-sibling-plugins-survive (#1160)", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, JSON.stringify({ plugin: ["p1", "p2", "p3"] }), "utf8");
      const rows = regenerateHostConfig(getAdapter("opencode"), home, { env: {} });
      const after = JSON.parse(readFileSync(file, "utf8"));
      for (const p of ["p1", "p2", "p3"]) assert.ok(after.plugin.includes(p));
      assert.equal(after.plugin.length, 4);
      assert.equal(rows.length, 1);
      assert.ok(rows[0].area.startsWith(file));
    });

    test("[M5] host-write/opencode-jsonc-wins-and-keeps-comments (#849)", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const json = path.join(dir, "opencode.json");
      const jsonc = path.join(dir, "opencode.jsonc");
      writeFileSync(json, JSON.stringify({ plugin: ["untouched"] }), "utf8");
      writeFileSync(jsonc, '{\n  // mine\n  "plugin": ["context-mode", "p1"]\n}\n', "utf8");
      regenerateHostConfig(getAdapter("opencode"), home, { env: {} });
      assert.equal(readFileSync(json, "utf8"), JSON.stringify({ plugin: ["untouched"] }));
      const text = readFileSync(jsonc, "utf8");
      assert.ok(text.includes("// mine"));
      assert.ok(text.includes('"p1"'));
      assert.ok(!text.includes('"context-mode",'), "bare v1 spec dropped");
    });

    test("[M5] host-write/second-run-is-a-no-op", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "opencode.json"), JSON.stringify({ plugin: [] }), "utf8");
      regenerateHostConfig(getAdapter("opencode"), home, { env: {} });
      assert.deepEqual(regenerateHostConfig(getAdapter("opencode"), home, { env: {} }), []);
    });

    test("[M5] host-write/rollback-on-write-failure-restores-original-file", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "opencode.json");
      const original = JSON.stringify({ plugin: ["p1"] });
      writeFileSync(file, original, "utf8");
      const write = (f, text) => { writeFileSync(f, text.slice(0, 3), "utf8"); throw new Error("disk full"); };
      assert.throws(() => regenerateHostConfig(getAdapter("opencode"), home, { env: {}, write }), /disk full/);
      assert.equal(readFileSync(file, "utf8"), original);
      assert.deepEqual(readdirSync(dir), ["opencode.json"], "no tmp or trash file left behind");
    });

    test("[M5] host-write/rollback-on-write-failure-leaves-no-new-file", (t) => {
      const home = tmp(t);
      const write = () => { throw new Error("disk full"); };
      assert.throws(() => regenerateHostConfig(getAdapter("claude-code"), home, { env: {}, write }));
      assert.ok(!existsSync(path.join(home, ".claude", "settings.json")));
    });

    test("[M5] host-write/parse-failure-writes-nothing (GP11 broken config)", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, "{ broken", "utf8");
      assert.throws(() => regenerateHostConfig(getAdapter("opencode"), home, { env: {} }), (e) => e.code === "CONFIG_PARSE_FAILED");
      assert.equal(readFileSync(file, "utf8"), "{ broken");
    });

    test("[M5] host-write/no-baked-paths: the written config never contains the cwd", (t) => {
      const home = tmp(t);
      regenerateHostConfig(getAdapter("claude-code"), home, { env: {} });
      assert.ok(!readFileSync(path.join(home, ".claude", "settings.json"), "utf8").includes(process.cwd()));
    });

    test("[M5] host-write/mcp-entry-points-at-the-running-bundle (D-M5-O1-4)", (t) => {
      const home = tmp(t);
      regenerateHostConfig(getAdapter("kiro"), home, { env: {} });
      const doc = JSON.parse(readFileSync(path.join(home, ".kiro", "settings", "mcp.json"), "utf8"));
      const entry = doc.mcpServers["context-mode"];
      assert.equal(entry.command, "node");
      assert.equal(entry.args[0], path.join(path.dirname(process.argv[1]), "server.mjs"));
    });

    test("[M5] host-write/codex-toml-entry-and-pi-agent-dir-env", (t) => {
      const home = tmp(t);
      const rows = regenerateHostConfig(getAdapter("codex"), home, { env: {} });
      const text = readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
      assert.ok(text.includes("context-mode"));
      assert.equal(rows.length, 1);
      const piDir = path.join(home, "custom-pi");
      assert.equal(hostConfigPath("pi", home, { PI_CODING_AGENT_DIR: piDir }), path.join(piDir, "settings.json"));
      assert.equal(hostConfigPath("copilot-cli", home, {}), null);
    });

    // DEVIATIONS D-WIN-ATOMIC-3 (GEM-WIN-2): the tmp name is per process, and a rename that stays busy gives a clear error.
    test("[win] host-write/tmp-name-has-the-pid-so-two-runs-do-not-collide", (t) => {
      const home = tmp(t);
      const seen = [];
      const write = (f, text) => { seen.push(f); writeFileSync(f, text, "utf8"); };
      regenerateHostConfig(getAdapter("claude-code"), home, { env: {}, write });
      assert.equal(seen.length, 1);
      assert.ok(seen[0].includes(String(process.pid)), seen[0]);
      assert.notEqual(seen[0], path.join(home, ".claude", "settings.json.tmp"));
    });

    test("[win] host-write/busy-rename-retries-then-succeeds-on-windows", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".claude", "settings.json");
      let n = 0;
      const rename = (a, b) => { n += 1; if (n <= 2) throw Object.assign(new Error("EPERM: busy"), { code: "EPERM" }); renameSync(a, b); };
      regenerateHostConfig(getAdapter("claude-code"), home, { env: {}, atomic: { platform: "win32", rename, sleep: () => {} } });
      assert.equal(n, 3);
      assert.ok(existsSync(file));
      assert.deepEqual(readdirSync(path.dirname(file)), ["settings.json"]);
    });

    test("[win] host-write/busy-rename-gives-up-names-the-file-and-keeps-the-original", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, JSON.stringify({ keep: 1, plugin: [] }), "utf8");
      const rename = (a, b) => {
        if (b === file && a.includes(String(process.pid))) throw Object.assign(new Error("EBUSY: busy, rename"), { code: "EBUSY" });
        renameSync(a, b);
      };
      assert.throws(
        () => regenerateHostConfig(getAdapter("opencode"), home, { env: {}, atomic: { platform: "win32", rename, sleep: () => {} } }),
        (e) => e.message.includes(file) && e.message.includes("Fix: close the program using") && e.message.includes("EBUSY"),
      );
      assert.equal(JSON.parse(readFileSync(file, "utf8")).keep, 1);
      assert.deepEqual(readdirSync(dir), ["opencode.json"], "no tmp or trash file left behind");
    });

    // CP-WIN-3 / D-WIN-ATOMIC-5: fake win32 + injected rename/unlink, so these run on every OS.
    const busy = (code, op) => Object.assign(new Error(`${code}: busy, ${op}`), { code });

    test("[win] host-write/restore-rename-held-names-the-file-and-where-the-original-is", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, JSON.stringify({ plugin: ["p1"] }), "utf8");
      const rename = () => { throw busy("EBUSY", "rename"); };
      assert.throws(
        () => regenerateHostConfig(getAdapter("opencode"), home, { env: {}, atomic: { platform: "win32", rename, sleep: () => {} } }),
        (e) => e.message.includes(file) && e.message.includes("Fix: close the program using") && e.message.includes(".ctx-upgrade-removing"),
      );
    });

    test("[win] host-write/trash-file-held-after-a-good-write-is-not-a-failure", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "opencode.json");
      writeFileSync(file, JSON.stringify({ plugin: ["p1"] }), "utf8");
      const unlinked = [];
      const unlink = (f) => { unlinked.push(f); throw busy("EBUSY", "unlink"); };
      const rows = regenerateHostConfig(getAdapter("opencode"), home, { env: {}, atomic: { platform: "win32", unlink, sleep: () => {} } });
      assert.ok(rows.length > 0);
      assert.ok(unlinked.some((f) => f.endsWith(".ctx-upgrade-removing")), "trash is removed through the retrying helper");
      assert.ok(JSON.parse(readFileSync(file, "utf8")).plugin.includes("p1"));
    });
  });

  describe("ADR-0019 plugin root resolution", { concurrency: true }, () => {
    // tests/v2/ops/plugin-root.test.mjs
    // Spec: docs/v2/impl/07-tools-ops.md §1. resolvePluginRoot(adapter, env) switches on
    // adapter.installMode, realpaths the result, never caches across calls, and throws
    // PLUGIN_ROOT_MISSING when the resolved path does not exist.


    function tmp(t) {
      // impl/07 §1 step 2 returns a realpath; macOS tmpdir() is a symlink (/var -> /private/var).
      const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-plugin-root-")));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }

    test("[M5] plugin-root/marketplace-resolves-under-HOME-claude-plugins-cache", (t) => {
      const home = tmp(t);
      const cache = path.join(home, ".claude", "plugins", "cache", "anthropics", "context-mode");
      mkdirSync(cache, { recursive: true });
      const root = resolvePluginRoot({ id: "claude-code", installMode: "marketplace" }, { HOME: home, USERPROFILE: home });
      assert.equal(root, cache);
    });

    test("[M5] plugin-root/plugin-mode-reads-current-symlink-under-DATA_ROOT", (t) => {
      const home = tmp(t);
      const target = path.join(home, "real-pi-plugin");
      mkdirSync(target, { recursive: true });
      const linkDir = path.join(home, ".context-mode", "plugins", "pi");
      mkdirSync(linkDir, { recursive: true });
      symlinkSync(target, path.join(linkDir, "current"));
      const root = resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home });
      assert.equal(root, target);
    });

    test("[M5] plugin-root/missing-path-throws-PLUGIN_ROOT_MISSING", (t) => {
      const home = tmp(t);
      assert.throws(
        () => resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home }),
        (err) => err instanceof CtxError && err.code === "PLUGIN_ROOT_MISSING",
      );
    });

    test("[M5] plugin-root/never-caches-across-calls: a second call after the dir changes sees the new path", (t) => {
      const home = tmp(t);
      const a = path.join(home, "a-root");
      const b = path.join(home, "b-root");
      mkdirSync(a, { recursive: true });
      mkdirSync(b, { recursive: true });
      const linkDir = path.join(home, ".context-mode", "plugins", "pi");
      mkdirSync(linkDir, { recursive: true });
      const link = path.join(linkDir, "current");
      symlinkSync(a, link);
      const first = resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home });
      rmSync(link);
      symlinkSync(b, link);
      const second = resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home });
      assert.notEqual(first, second);
      assert.equal(second, b);
    });

    // ---- D-DOC-D3-ROOT-1: the versioned plugin cache (Claude Code 2.1.311 layout) ----------------------------------
    // Claude Code copies the plugin to <claude dir>/plugins/cache/<marketplace>/context-mode/<version> and records that dir as
    // installPath in installed_plugins.json. The three source layouts all end in the same cache shape:
    //   release branch (marketplace source "./"), context7 main subfolder (source "./plugins/claude-code"), npm/flat (no record).

    const CLAUDE = { id: "claude-code", installMode: "marketplace" };
    const put = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text, "utf8"); };
    const record = (installPath, extra = {}) => JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ scope: "user", installPath, version: "2.0.0-next.8", ...extra }] } }, null, 2);

    for (const [layout, source] of [["release-branch", "./"], ["context7-main-subfolder", "./plugins/claude-code"]]) {
      test(`[D-DOC-D3-ROOT-1] plugin-root/${layout}: installPath of installed_plugins.json is the root, not the parent dir`, (t) => {
        const home = tmp(t);
        const install = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode", "2.0.0-next.8");
        mkdirSync(path.join(install, "hooks"), { recursive: true });
        put(path.join(home, ".claude", "plugins", "installed_plugins.json"), record(install, { source }));
        assert.equal(resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), install);
      });
    }

    test("[D-DOC-D3-ROOT-1] plugin-root/npm-flat: no record, one flat cache dir is still the root", (t) => {
      const home = tmp(t);
      const flat = path.join(home, ".claude", "plugins", "cache", "mp", "context-mode");
      mkdirSync(flat, { recursive: true });
      assert.equal(resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), flat);
    });

    test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: CLAUDE_CONFIG_DIR and a space in HOME", (t) => {
      const base = tmp(t);
      const home = path.join(base, "my home");
      const cfg = path.join(base, "one drive", "claude cfg");
      const install = path.join(cfg, "plugins", "cache", "context-mode", "context-mode", "2.0.0-next.8");
      mkdirSync(install, { recursive: true });
      mkdirSync(home, { recursive: true });
      put(path.join(cfg, "plugins", "installed_plugins.json"), record(install));
      assert.equal(resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: cfg }), install);
    });

    test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: a record that points at a missing dir is PLUGIN_ROOT_MISSING, no parent-dir pick", (t) => {
      const home = tmp(t);
      const cacheParent = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
      mkdirSync(cacheParent, { recursive: true });
      put(path.join(home, ".claude", "plugins", "installed_plugins.json"), record(path.join(cacheParent, "9.9.9")));
      assert.throws(() => resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), (e) => e instanceof CtxError && e.code === "PLUGIN_ROOT_MISSING");
    });

    test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: two live records and a bundle outside both is PLUGIN_ROOT_MISSING", (t) => {
      const home = tmp(t);
      const base = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
      const a = path.join(base, "1.0.0");
      const b = path.join(base, "2.0.0");
      mkdirSync(a, { recursive: true });
      mkdirSync(b, { recursive: true });
      put(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ installPath: a }, { installPath: b }] } }));
      assert.throws(() => resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), (e) => e instanceof CtxError && e.code === "PLUGIN_ROOT_MISSING");
    });

    // The running bundle decides between two live records, and is the root when there is no record at all.
    function runFromBundle(install, home, withRecord) {
      const script = path.join(install, "server.mjs");
      const mod = new URL("../../src/core/ops/plugin-root.ts", import.meta.url).href;
      writeFileSync(script, `import { resolvePluginRoot } from ${JSON.stringify(mod)};\nconsole.log(resolvePluginRoot({ id: "claude-code", installMode: "marketplace" }, { HOME: ${JSON.stringify(home)}, USERPROFILE: ${JSON.stringify(home)} }));\n`);
      const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    }

    test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: the running bundle's dir wins between two live records", (t) => {
      const home = tmp(t);
      const base = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
      const a = path.join(base, "1.0.0");
      const b = path.join(base, "2.0.0");
      mkdirSync(a, { recursive: true });
      mkdirSync(b, { recursive: true });
      put(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ installPath: a }, { installPath: b }] } }));
      assert.equal(runFromBundle(b, home), b);
    });

    test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: no record, the running bundle inside the cache is the root", (t) => {
      const home = tmp(t);
      const install = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode", "2.0.0-next.8");
      mkdirSync(install, { recursive: true });
      assert.equal(runFromBundle(install, home), install);
    });

    test("[D-DOC-D3-ROOT-1] plugin-root/windows-style: installPath strings keep their backslashes, drive, space and other plugins are skipped", async () => {
      const { recordedInstallPaths } = await import("../../src/core/ops/plugin-root.ts");
      const winPath = "C:\\Users\\Ada Lovelace\\AppData\\Roaming\\Claude\\plugins\\cache\\context-mode\\context-mode\\2.0.0-next.8";
      const text = "\uFEFF" + JSON.stringify({ version: 2, plugins: {
        "context-mode@context-mode": [{ installPath: winPath }],
        "other@context-mode": [{ installPath: "C:\\x\\other" }],
        "context-mode@second": [{ installPath: "D:\\y\\context-mode\\1.0.0" }, { installPath: winPath }, { installPath: "" }, {}],
      } }, null, 2).split("\n").join("\r\n");
      assert.deepEqual(recordedInstallPaths(text), [winPath, "D:\\y\\context-mode\\1.0.0"]);
      assert.deepEqual(recordedInstallPaths("not json"), []);
      assert.deepEqual(recordedInstallPaths(JSON.stringify({ plugins: [] })), []);
    });
  });

  describe("ADR-0019 plugin current swap and rollback generation", { concurrency: true }, () => {
    // tests/v2/ops/plugin-swap.test.mjs
    // Spec: docs/v2/impl/07-tools-ops.md §6 step 4c-4d; DEVIATIONS D-M5-U1-6 (current.swap symlink, then rename),
    // D-M5-U4-1 (signature, which dirs count as a generation), D-M7-W3-1 (current -> current.old, current.swap -> current:
    // Windows cannot rename a link over a dir link).


    function agentDir(t) {
      const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-plugin-swap-")));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }
    function version(dir, sha) {
      mkdirSync(path.join(dir, sha), { recursive: true });
      writeFileSync(path.join(dir, sha, "server.bundle.mjs"), sha, "utf8");
    }
    const current = (dir) => path.join(dir, "current");
    // D-WIN-JUNCTION-1: POSIX stores the bare sha, a Windows junction stores the absolute <dir>/<sha>.
    const linkText = (dir, sha) => (process.platform === "win32" ? path.join(dir, sha) : sha);

    test("[M5] plugin-swap/first-install-creates-current-link", (t) => {
      const dir = agentDir(t);
      version(dir, "aaa");
      const r = swapPluginCurrent(dir, "aaa");
      assert.ok(lstatSync(current(dir)).isSymbolicLink());
      assert.equal(realpathSync(current(dir)), path.join(dir, "aaa"));
      assert.deepEqual(r, { current: path.join(dir, "aaa"), previous: null, removed: [] });
      assert.equal(existsSync(path.join(dir, "current.swap")), false);
    });

    test("[M5] plugin-swap/second-upgrade-keeps-one-rollback-generation", (t) => {
      const dir = agentDir(t);
      version(dir, "aaa");
      swapPluginCurrent(dir, "aaa");
      version(dir, "bbb");
      const r = swapPluginCurrent(dir, "bbb");
      assert.equal(realpathSync(current(dir)), path.join(dir, "bbb"));
      assert.equal(r.previous, path.join(dir, "aaa"));
      assert.ok(existsSync(path.join(dir, "aaa")), "previous dir is kept on disk");
      assert.deepEqual(r.removed, []);
    });

    test("[M5] plugin-swap/third-upgrade-deletes-the-generation-two-back", (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb", "ccc"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      assert.equal(realpathSync(current(dir)), path.join(dir, "ccc"));
      assert.ok(existsSync(path.join(dir, "bbb")));
      assert.equal(existsSync(path.join(dir, "aaa")), false);
    });

    test("[M5] plugin-swap/rollback-is-a-swap-to-the-previous-sha", (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      const r = swapPluginCurrent(dir, "aaa");
      assert.equal(realpathSync(current(dir)), path.join(dir, "aaa"));
      assert.equal(r.previous, path.join(dir, "bbb"));
      assert.ok(existsSync(path.join(dir, "bbb")), "the rolled-back-from dir stays as the rollback generation");
    });

    test("[M5] plugin-swap/same-sha-is-a-no-op-and-keeps-the-rollback", (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      const r = swapPluginCurrent(dir, "bbb");
      assert.deepEqual(r, { current: path.join(dir, "bbb"), previous: null, removed: [] });
      assert.ok(existsSync(path.join(dir, "aaa")));
    });

    test("[M5] plugin-swap/fetch-dirs-and-stale-swap-link-are-not-generations", (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      mkdirSync(path.join(dir, ".fetch-123"));
      symlinkSync("aaa", path.join(dir, "current.swap"), "dir");
      version(dir, "ccc");
      const r = swapPluginCurrent(dir, "ccc");
      assert.ok(existsSync(path.join(dir, ".fetch-123")), "an in-flight fetch dir is not touched");
      assert.equal(existsSync(path.join(dir, "current.swap")), false);
      assert.deepEqual(r.removed, [path.join(dir, "aaa")]);
      assert.equal(readlinkSync(current(dir)), linkText(dir, "ccc"));
    });

    test("[M5] plugin-swap/missing-new-dir-throws-and-leaves-current-alone", (t) => {
      const dir = agentDir(t);
      version(dir, "aaa");
      swapPluginCurrent(dir, "aaa");
      assert.throws(() => swapPluginCurrent(dir, "zzz"), (e) => e instanceof CtxError && e.code === "PLUGIN_ROOT_MISSING");
      assert.equal(realpathSync(current(dir)), path.join(dir, "aaa"));
    });

    test("[M7] plugin-swap/no-current-old-left-after-a-swap", (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      assert.equal(existsSync(path.join(dir, "current.old")), false);
      assert.equal(lstatSync(path.join(dir, "current.old"), { throwIfNoEntry: false }), undefined);
    });

    test("[M7] plugin-swap/a-stop-between-the-two-renames-is-undone-by-the-next-call", (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      // State after a stop between rename(current, current.old) and rename(current.swap, current).
      unlinkSync(current(dir));
      symlinkSync("bbb", path.join(dir, "current.old"), "dir");
      symlinkSync("ccc", path.join(dir, "current.swap"), "dir");
      version(dir, "ccc");
      const r = swapPluginCurrent(dir, "ccc");
      assert.equal(readlinkSync(current(dir)), linkText(dir, "ccc"));
      assert.equal(r.previous, path.join(dir, "bbb"), "the old link was put back first, so bbb is the rollback generation");
      assert.deepEqual(r.removed, [path.join(dir, "aaa")]);
      assert.equal(lstatSync(path.join(dir, "current.old"), { throwIfNoEntry: false }), undefined);
      assert.equal(lstatSync(path.join(dir, "current.swap"), { throwIfNoEntry: false }), undefined);
    });

    // DEVIATIONS D-WIN-ATOMIC-2: on Windows a rename of `current` / `current.swap` fails with EPERM when the host or
    // antivirus holds a handle inside it. Fake platform + injected rename: runs on every OS.
    test("[win] plugin-swap/retries-EPERM-on-link-rename-then-swaps", (t) => {
      const dir = agentDir(t);
      version(dir, "aaa");
      swapPluginCurrent(dir, "aaa");
      version(dir, "bbb");
      const calls = { n: 0 };
      const rename = (a, b) => {
        calls.n += 1;
        if (calls.n <= 2) throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
        renameSync(a, b);
      };
      const r = swapPluginCurrent(dir, "bbb", { platform: "win32", rename, sleep: () => {} });
      assert.ok(calls.n >= 4, "two failed tries, then both renames");
      assert.equal(realpathSync(current(dir)), path.join(dir, "bbb"));
      assert.equal(r.previous, path.join(dir, "aaa"));
      assert.equal(existsSync(path.join(dir, "current.old")), false);
    });

    test("[win] plugin-swap/EPERM-that-never-clears-throws-and-keeps-old-current", (t) => {
      const dir = agentDir(t);
      version(dir, "aaa");
      swapPluginCurrent(dir, "aaa");
      version(dir, "bbb");
      const rename = () => { throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" }); };
      assert.throws(() => swapPluginCurrent(dir, "bbb", { platform: "win32", rename, sleep: () => {} }), /EPERM/);
      assert.equal(realpathSync(current(dir)), path.join(dir, "aaa"));
    });

    // DEVIATIONS D-WIN-JUNCTION-1 (PI-WIN-1): on Windows a `dir` symlink needs admin or Developer Mode (EPERM for a normal
    // user); a junction needs neither. Fake platform + injected symlink that refuses `dir` like Windows and stores the
    // junction target with a trailing slash (what readlink may return there): runs on every OS.
    function winSymlink(calls) {
      return (target, link, type) => {
        calls.push({ target, link: path.basename(link), type });
        if (type !== "junction") throw Object.assign(new Error("EPERM: operation not permitted, symlink"), { code: "EPERM" });
        symlinkSync(target + path.sep, link, "dir");
      };
    }

    test("[win] plugin-swap/win32-makes-a-junction-with-an-absolute-target", (t) => {
      const dir = agentDir(t);
      const calls = [];
      const opts = { platform: "win32", symlink: winSymlink(calls) };
      version(dir, "aaa");
      const r = swapPluginCurrent(dir, "aaa", opts);
      assert.deepEqual(calls, [{ target: path.join(dir, "aaa"), link: "current.swap", type: "junction" }]);
      assert.equal(realpathSync(current(dir)), path.join(dir, "aaa"));
      assert.deepEqual(r, { current: path.join(dir, "aaa"), previous: null, removed: [] });
    });

    test("[win] plugin-swap/win32-junction-target-with-trailing-slash-is-read-as-the-sha", (t) => {
      const dir = agentDir(t);
      const calls = [];
      const opts = { platform: "win32", symlink: winSymlink(calls), sleep: () => {} };
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha, opts); }
      calls.length = 0;
      const same = swapPluginCurrent(dir, "bbb", opts);
      assert.deepEqual(same, { current: path.join(dir, "bbb"), previous: null, removed: [] }, "same sha is a no-op");
      assert.equal(calls.length, 0, "no new link for the sha that is already current");
      version(dir, "ccc");
      const r = swapPluginCurrent(dir, "ccc", opts);
      assert.equal(r.previous, path.join(dir, "bbb"));
      assert.deepEqual(r.removed, [path.join(dir, "aaa")]);
      assert.ok(existsSync(path.join(dir, "bbb")), "the rollback generation is kept");
      const back = swapPluginCurrent(dir, "bbb", opts);
      assert.equal(back.previous, path.join(dir, "ccc"));
      assert.equal(realpathSync(current(dir)), path.join(dir, "bbb"));
    });

    test("[win] plugin-swap/posix-keeps-the-relative-dir-link", (t) => {
      const dir = agentDir(t);
      const calls = [];
      const symlink = (target, link, type) => { calls.push({ target, type }); symlinkSync(target, link, type); };
      version(dir, "aaa");
      swapPluginCurrent(dir, "aaa", { platform: "linux", symlink });
      assert.deepEqual(calls, [{ target: "aaa", type: "dir" }]);
      assert.equal(readlinkSync(current(dir)), "aaa");
    });

    // Windows only: a real junction, no fake. A normal user has no symlink privilege, so only this run proves it.
    test("[win] plugin-swap/real-junction-swap-and-rollback", { skip: process.platform !== "win32" && "junctions are a Windows feature" }, (t) => {
      const dir = agentDir(t);
      for (const sha of ["aaa", "bbb"]) { version(dir, sha); swapPluginCurrent(dir, sha); }
      assert.ok(lstatSync(current(dir)).isSymbolicLink());
      assert.equal(realpathSync.native(current(dir)), path.join(dir, "bbb"));
      assert.equal(swapPluginCurrent(dir, "bbb").previous, null);
      const back = swapPluginCurrent(dir, "aaa");
      assert.equal(back.previous, path.join(dir, "bbb"));
      assert.equal(realpathSync.native(current(dir)), path.join(dir, "aaa"));
      assert.equal(existsSync(path.join(dir, "current.old")), false);
    });
  });

  describe("ADR-0019 uninstall areas (Q21)", { concurrency: true }, () => {
    // tests/v2/ops/uninstall.test.mjs
    // Spec: docs/v2/impl/07-tools-ops.md §6 "Steps (Uninstall)", DECISIONS-r3 Q16 Q21,
    // DEVIATIONS D-M5-U1-3, D-M5-U1-6, D-M5-U7-1..3.
    // Q21: stop, cache and own config entries always run, with or without confirmDelete.


    function tmp(t) {
      const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-uninstall-")));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      return dir;
    }

    const KEY = "abcdef0123456789";

    function dataDir(home) {
      return path.join(home, ".context-mode");
    }

    function projectDir(home, key = KEY) {
      return path.join(dataDir(home), C.PROJECTS_DIR_NAME, key);
    }

    function owner(home, serverId, pid, key = KEY) {
      const dir = path.join(projectDir(home, key), C.OWNERS_DIR_NAME);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, serverId + C.OWNER_PID_EXT), String(pid), "utf8");
      return dir;
    }

    function run(home, id, installMode, confirmDelete = false, key = KEY, extraEnv = {}) {
      return runUninstall({ adapter: { id, installMode }, project: { projectKey: key }, env: { HOME: home, USERPROFILE: home, ...extraEnv }, confirmDelete });
    }

    function area(rows, name) {
      return rows.filter((r) => r.area === name);
    }

    test("[M5] uninstall/all-three-areas-run-without-confirmDelete (Q21)", (t) => {
      const home = tmp(t);
      const cache = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
      mkdirSync(cache, { recursive: true });
      const owners = owner(home, "srv1", process.pid);
      const { rows, stopped } = run(home, "claude-code", "marketplace");
      assert.deepEqual(stopped, ["srv1"]);
      assert.ok(existsSync(path.join(owners, "srv1" + C.OWNER_STOP_EXT)), "stop marker next to the .pid");
      assert.deepEqual(area(rows, C.UPGRADE_SERVER_AREA)[0], { area: C.UPGRADE_SERVER_AREA, before: C.UPGRADE_SERVER_RUNNING, after: C.UPGRADE_SERVER_STOPPED });
      assert.equal(existsSync(cache), false, "marketplace cache removed");
      assert.equal(area(rows, C.UPGRADE_CACHE_AREA)[0].after, C.UPGRADE_REMOVED);
      assert.equal(area(rows, C.UPGRADE_CONFIG_AREA).length, 1, "config area always reported");
      assert.equal(area(rows, C.UPGRADE_DATA_AREA)[0].after, C.UPGRADE_DATA_KEPT);
      assert.ok(existsSync(projectDir(home)), "user data kept without confirmDelete");
    });

    test("[M5] uninstall/three-areas-also-run-with-confirmDelete (Q21)", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".codex", "config.toml");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, '[mcp_servers.context-mode]\ncommand = "node"\nargs = ["/opt/cm/server.mjs", "--agent", "codex"]\n', "utf8");
      owner(home, "srv1", process.pid);
      const { rows } = run(home, "codex", "config-mcp", true);
      for (const a of [C.UPGRADE_SERVER_AREA, C.UPGRADE_CACHE_AREA, C.UPGRADE_DATA_AREA]) assert.equal(area(rows, a).length, 1, a);
      assert.ok(rows.some((r) => r.before === C.UPGRADE_OWN_ENTRY && r.after === C.UPGRADE_REMOVED), "own config entry row");
      assert.equal(area(rows, C.UPGRADE_DATA_AREA)[0].after, C.UPGRADE_DATA_DELETED);
    });

    test("[M5] uninstall/dead-owner-gets-no-stop-marker", (t) => {
      const home = tmp(t);
      const owners = owner(home, "dead", 2147483646);
      const { rows, stopped } = run(home, "claude-code", "marketplace");
      assert.deepEqual(stopped, []);
      assert.equal(existsSync(path.join(owners, "dead" + C.OWNER_STOP_EXT)), false);
      assert.equal(area(rows, C.UPGRADE_SERVER_AREA)[0].after, C.UPGRADE_NOT_FOUND);
      assert.equal(area(rows, C.UPGRADE_CACHE_AREA)[0].after, C.UPGRADE_NOT_FOUND, "no cache: reported, not an error");
    });

    test("[M5] uninstall/plugin-mode-removes-current-and-rollback-generation", (t) => {
      const home = tmp(t);
      const agentDir = path.join(dataDir(home), C.DATA_PLUGINS_DIR_NAME, "copilot-cli");
      mkdirSync(path.join(agentDir, "sha1"), { recursive: true });
      mkdirSync(path.join(agentDir, "sha2"), { recursive: true });
      symlinkSync("sha2", path.join(agentDir, C.PLUGIN_CURRENT_LINK), "dir");
      const { rows } = run(home, "copilot-cli", "plugin");
      assert.equal(existsSync(agentDir), false, "current link, current gen and rollback gen all gone");
      assert.equal(area(rows, C.UPGRADE_CACHE_AREA)[0].after, C.UPGRADE_REMOVED);
    });

    test("[M5] uninstall/extension-mode-removes-extension-dir", (t) => {
      const home = tmp(t);
      const ext = path.join(home, ".gemini", "extensions", "context-mode");
      mkdirSync(ext, { recursive: true });
      const sibling = path.join(home, ".gemini", "extensions", "other");
      mkdirSync(sibling, { recursive: true });
      run(home, "gemini", "extension");
      assert.equal(existsSync(ext), false);
      assert.ok(existsSync(sibling), "another extension is kept");
    });

    test("[M5] uninstall/config-entry-install-cache-reported-by-hand (D-M5-U1-3)", (t) => {
      const home = tmp(t);
      const release = path.join(home, "my-tools", "context-mode");
      mkdirSync(release, { recursive: true });
      const file = path.join(home, ".kiro", "settings", "mcp.json");
      mkdirSync(path.dirname(file), { recursive: true });
      const other = { command: "other-server", args: [] };
      writeFileSync(file, JSON.stringify({ mcpServers: { other, "context-mode": { command: "node", args: [path.join(release, "server.mjs")] } } }, null, 2), "utf8");
      const { rows } = run(home, "kiro", "mcp-entry");
      assert.ok(existsSync(release), "a dir the user chose is never deleted");
      assert.deepEqual(area(rows, C.UPGRADE_CACHE_AREA)[0], { area: C.UPGRADE_CACHE_AREA, before: release, after: C.UPGRADE_CACHE_BY_HAND });
      const after = JSON.parse(readFileSync(file, "utf8"));
      assert.equal(after.mcpServers["context-mode"], undefined, "own MCP entry dropped");
      assert.deepEqual(after.mcpServers.other, other, "other MCP entry kept");
    });

    test("[M5] uninstall/codex-toml-own-table-dropped-other-kept", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".codex", "config.toml");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, 'model = "x"\n\n[mcp_servers.other]\ncommand = "o"\n\n[mcp_servers.context-mode]\ncommand = "node"\nargs = ["/opt/cm/server.mjs"]\n', "utf8");
      run(home, "codex", "config-mcp");
      const text = readFileSync(file, "utf8");
      assert.ok(!text.includes("context-mode"), text);
      assert.ok(text.includes("[mcp_servers.other]") && text.includes('model = "x"'), text);
    });

    test("[M5] uninstall/opencode-drops-own-plugin-keeps-siblings-jsonc-wins (#849 #1160)", (t) => {
      const home = tmp(t);
      const dir = path.join(home, ".config", "opencode");
      mkdirSync(dir, { recursive: true });
      const jsonc = path.join(dir, "opencode.jsonc");
      writeFileSync(jsonc, `{\n  // keep me\n  "plugin": ["sibling-plugin", ${JSON.stringify(C.OPENCODE_GIT_SPEC)}]\n}\n`, "utf8");
      const { rows } = run(home, "opencode", "in-process");
      const text = readFileSync(jsonc, "utf8");
      assert.ok(text.includes("// keep me"), "comments survive");
      assert.ok(text.includes("sibling-plugin"));
      assert.ok(!text.includes(C.OPENCODE_GIT_SPEC));
      assert.equal(existsSync(path.join(dir, "opencode.json")), false, "the .jsonc file is the one written");
      assert.equal(area(rows, C.UPGRADE_CACHE_AREA)[0].after, C.UPGRADE_CACHE_BY_HAND, "in-process: host owns the checkout");
    });

    test("[M5] uninstall/pi-drops-own-package-keeps-others", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".pi", "agent", "settings.json");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ packages: ["npm:other", { source: C.PI_GIT_PACKAGE }] }, null, 2), "utf8");
      run(home, "pi", "in-process");
      assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).packages, ["npm:other"]);
    });

    test("[M5] uninstall/no-own-entry-leaves-config-untouched", (t) => {
      const home = tmp(t);
      const file = path.join(home, ".zcode", "cli", "config.json");
      mkdirSync(path.dirname(file), { recursive: true });
      const original = JSON.stringify({ mcpServers: { other: { command: "o" } } });
      writeFileSync(file, original, "utf8");
      const { rows } = run(home, "zcode", "hooks+mcp");
      assert.equal(readFileSync(file, "utf8"), original, "byte for byte");
      assert.equal(area(rows, C.UPGRADE_CONFIG_AREA)[0].after, C.UPGRADE_NOT_FOUND);
    });

    test("[M5] uninstall/confirmDelete-deletes-only-this-project", (t) => {
      const home = tmp(t);
      const mine = projectDir(home);
      const theirs = projectDir(home, "1111111111111111");
      mkdirSync(mine, { recursive: true });
      mkdirSync(theirs, { recursive: true });
      writeFileSync(path.join(mine, "context.db"), "x", "utf8");
      writeFileSync(path.join(theirs, "context.db"), "y", "utf8");
      const owners = owner(home, "srv1", process.pid);
      run(home, "claude-code", "marketplace", true);
      assert.equal(existsSync(path.join(mine, "context.db")), false, "this project's data deleted");
      assert.equal(readFileSync(path.join(theirs, "context.db"), "utf8"), "y", "another project's data untouched");
      assert.ok(existsSync(path.join(owners, "srv1" + C.OWNER_STOP_EXT)), "live owner still finds its stop marker (D-M5-U7-3)");
    });

    test("[M5] uninstall/confirmDelete-false-keeps-data", (t) => {
      const home = tmp(t);
      const mine = projectDir(home);
      mkdirSync(mine, { recursive: true });
      writeFileSync(path.join(mine, "context.db"), "x", "utf8");
      const { rows } = run(home, "claude-code", "marketplace", false);
      assert.equal(readFileSync(path.join(mine, "context.db"), "utf8"), "x");
      assert.equal(area(rows, C.UPGRADE_DATA_AREA)[0].after, C.UPGRADE_DATA_KEPT);
    });

    test("[M5] uninstall/confirmDelete-never-leaves-projects-dir (isInside)", (t) => {
      const home = tmp(t);
      mkdirSync(projectDir(home), { recursive: true });
      const keep = path.join(dataDir(home), "keep.txt");
      writeFileSync(keep, "k", "utf8");
      assert.throws(() => run(home, "claude-code", "marketplace", true, ".."), (e) => e.code === "OUTSIDE_ROOT");
      assert.throws(() => run(home, "claude-code", "marketplace", true, ""), (e) => e.code === "OUTSIDE_ROOT");
      assert.ok(existsSync(keep) && existsSync(projectDir(home)), "nothing outside this project's dir is deleted");
    });
  });
});
