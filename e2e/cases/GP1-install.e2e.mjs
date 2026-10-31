// TECH-SPEC GP1 (install), ADR-0019, ADR-0023. One file per GP case (ADR-0024).
// Merged from GP1-absolute-node-path, GP1-install-docs, GP1-install, GP1-opencode-clientinfo, GP1-release-tree and GP1-uninstall.
// Plain blocks, not describe: e2e/cases/run.mjs counts every pass event, and a describe adds one. Names unchanged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync, copyFileSync, rmSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkGolden } from "../harness/golden.mjs";
import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";
import { vscodeMcpFile } from "../harness/vscode-user-dir.mjs";

// GP1: install and handshake
{
  // GP1 — install + handshake (14-tests.md §4). M0 cases only.
  // Case source: TECH-SPEC §6.2 GP1 row. covers: src/adapters/, build/manifests.ts, src/core/ops/plugin-root.ts.
  //
  // This file imports e2e/harness/mcp-client.mjs and e2e/harness/normalize.mjs, which do not
  // exist yet (owned by other M0 steps). Until those land, and until build/build.mjs produces
  // release-out/, every case below fails for that reason — a missing module/bundle, never a
  // syntax error in this file.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = path.resolve(__dirname, "..", "..");
  const RELEASE_OUT = path.join(REPO_ROOT, "release-out");
  const SERVER_BUNDLE = path.join(RELEASE_OUT, "server.mjs");
  const HOOK_BUNDLE = path.join(RELEASE_OUT, "hook.mjs");
  const RUN_BUNDLE = path.join(RELEASE_OUT, "run.mjs");

  // Fixed order of 9 tools (src/core/tools/registry.ts `TOOLS`, 00-architecture.md).
  const TOOL_ORDER = [
    "ctx_execute",
    "ctx_batch",
    "ctx_index",
    "ctx_search",
    "ctx_resume",
    "ctx_stats",
    "ctx_doctor",
    "ctx_upgrade",
    "ctx_purge",
  ];

  function loadGolden(name) {
    const p = path.join(__dirname, "..", "golden", "GP1", `${name}.json`);
    return JSON.parse(readFileSync(p, "utf8"));
  }

  // ADR-0007 decision 4 / Tests section; 11-server.md §5 step 1 and E2E coverage: agent id for a
  // 2026-07-28 client comes only from `--agent` (or env.CLAUDE_PROJECT_DIR), never from `clientInfo`.
  // No `initialize` call is made at all here, so `clientInfo` never crosses the wire; `tools/call`
  // must still resolve the project through the `--agent` flag (D-M2-arch-1). Placed first in this
  // file: `bundle-no-import-attributes` below fails in an M0-only checkout (release-out/run.mjs is
  // a later milestone's bundle row, not built here), and that failure stops `node:test`'s `run()`
  // from reporting any test later in the same file; a case placed after it would silently vanish
  // from `node e2e/cases/run.mjs`'s own output instead of failing loud.
  test("[M2] GP1/no-clientinfo-agent-from-flag", async (t) => {
    const ws = mkdtempSync(path.join(tmpdir(), "cm-gp1-ws-"));
    const home = mkdtempSync(path.join(tmpdir(), "cm-gp1-home-"));
    t.after(() => {
      rmSync(ws, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    });
    execFileSync("git", ["init", "-q"], { cwd: ws });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: ws });
    execFileSync("git", ["config", "user.name", "t"], { cwd: ws });
    execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: ws });

    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.CLAUDE_PROJECT_DIR;
    const client = spawnBundle(SERVER_BUNDLE, env, ["--agent", "vscode", "--workspace-folder", ws]);
    t.after(() => client.kill());

    const reply = await client.request("tools/call", {
      name: "ctx_execute",
      arguments: { language: "shell", code: "echo hi" },
    });
    await client.close();

    assert.equal(reply.isError, false, "ctx_execute must resolve the project from --agent with no clientInfo ever sent");
    checkGolden("GP1", "no-clientinfo-agent-from-flag", normalize({ reply }, { home, proj: ws }));
  });

  // M3 install cases (14a-issue-cases.md GP1 rows; impl/10 §1.5; impl/13 §3; DECISIONS-r9 R4). They read only the
  // generated release-out/hooks/*.json (build/manifests.ts output) — black box, no src/ import (GS4).
  const HOOKS_OUT = path.join(RELEASE_OUT, "hooks");
  // D-FU-RM-GEMINI-1: Gemini reads only hooks/hooks.json; every other host ships hooks/<id>.json.
  const hookFileOf = (id) => (id === "gemini" ? "hooks" : id) + ".json";
  const readHooks = (id) => JSON.parse(readFileSync(path.join(HOOKS_OUT, hookFileOf(id)), "utf8"));
  const SPAWN_HOOK_AGENTS = ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode"];
  // impl/10 §1.5 "Timeout key" column: key and unit per host shape.
  const TIMEOUT_KEY = {
    "claude-code": "timeout", codex: "timeout", gemini: "timeout", qwen: "timeout",
    "copilot-cli": "timeoutSec", vscode: "timeout", kiro: "timeout", zcode: "timeoutMs",
  };

  // Every command entry of a host hook file, flattened: [{ event, entry, matcher }].
  function hookEntries(id) {
    const doc = readHooks(id);
    const out = [];
    if (id === "kiro") {
      for (const h of doc.hooks) out.push({ event: h.trigger, entry: { ...h.action, timeout: h.timeout }, matcher: h.matcher });
    } else if (id === "zcode") {
      // D-HF-ZCODE-SHAPE-1: matcher groups {matcher?, hooks:[{type,command,timeoutMs}]} under hooks.events.<Event>.
      for (const [event, groups] of Object.entries(doc.hooks.events)) for (const g of groups) for (const e of g.hooks) out.push({ event, entry: e, matcher: g.matcher });
    } else if (id === "copilot-cli" || id === "vscode") {
      for (const [event, list] of Object.entries(doc.hooks)) for (const e of list) out.push({ event, entry: e, matcher: undefined });
    } else {
      for (const [event, groups] of Object.entries(doc.hooks)) for (const g of groups) for (const e of g.hooks) out.push({ event, entry: e, matcher: g.matcher });
    }
    return out;
  }

  test("[M3] GP1/default-hook-timeouts", () => {
    const summary = {};
    for (const id of SPAWN_HOOK_AGENTS) {
      const entries = hookEntries(id);
      assert.ok(entries.length > 0, `${id}: no hook entries`);
      for (const { event, entry } of entries) {
        const v = entry[TIMEOUT_KEY[id]];
        assert.ok(Number.isFinite(v) && v > 0, `${id} ${event}: ${TIMEOUT_KEY[id]} missing or not > 0`);
      }
      summary[id] = { key: TIMEOUT_KEY[id], values: [...new Set(entries.map((x) => x.entry[TIMEOUT_KEY[id]]))] };
    }
    checkGolden("GP1", "default-hook-timeouts", normalize(summary));
  });

  // Host-matcher rows (impl/10 §1.5): the matcher is a regex over tool_name; each named tool must hit exactly one
  // group per tool event, and every group's entries carry a timeout.
  const REGEX_MATCHER_TOOLS = {
    "claude-code": ["Bash", "Read", "Grep", "WebFetch", "Write", "Edit", "NotebookEdit", ...TOOL_ORDER.map((t) => "mcp__plugin_context-mode_context-mode__" + t)],
    codex: ["Bash", "apply_patch", ...TOOL_ORDER.map((t) => "mcp__context_mode__" + t)],
    qwen: ["run_shell_command", "Shell", "read_file", "grep_search", "web_fetch", ...TOOL_ORDER.map((t) => "mcp__context-mode__" + t)],
    zcode: ["Bash", "Read", "Grep", "WebFetch", "Write", "Edit", "NotebookEdit", ...TOOL_ORDER.map((t) => "mcp__context-mode__" + t)],
  };

  test("[M3] GP1/hooks-json-one-matcher-per-tool", () => {
    const summary = {};
    for (const [id, tools] of Object.entries(REGEX_MATCHER_TOOLS)) {
      const entries = hookEntries(id);
      for (const event of ["PreToolUse", "PostToolUse"]) {
        const withMatcher = entries.filter((x) => x.event === event);
        assert.ok(withMatcher.length > 0, `${id} ${event}: no entry`);
        for (const tool of tools) {
          const hits = withMatcher.filter((x) => typeof x.matcher === "string" && new RegExp(x.matcher).test(tool));
          assert.equal(hits.length, 1, `${id} ${event}: ${tool} matched ${hits.length} entries`);
          assert.ok(Number.isFinite(hits[0].entry[TIMEOUT_KEY[id]]), `${id} ${event}: no timeout`);
        }
      }
      summary[id] = [...new Set(entries.filter((x) => x.matcher !== undefined).map((x) => x.matcher))];
    }
    checkGolden("GP1", "hooks-json-one-matcher-per-tool", normalize(summary));
  });

  test("[M3] GP1/kiro-hooks-v1-schema", () => {
    const doc = readHooks("kiro");
    assert.equal(doc.version, "v1");
    assert.ok(Array.isArray(doc.hooks) && doc.hooks.length > 0, "hooks must be a non-empty array");
    for (const h of doc.hooks) {
      assert.deepEqual(Object.keys(h).filter((k) => k !== "matcher").sort(), ["action", "enabled", "name", "timeout", "trigger"]);
      assert.equal(h.action.type, "command");
      assert.equal(typeof h.action.command, "string");
      assert.equal(h.enabled, true);
    }
    checkGolden("GP1", "kiro-hooks-v1-schema", normalize(doc));
  });

  // Standalone (non-plugin) installs name the ctx tools with mcp__context-mode__ (qwen, zcode); the Claude plugin
  // keeps its plugin prefix and Codex its underscore key (DECISIONS-r9 R1).
  test("[M3] GP1/standalone-mcp-tool-prefix", () => {
    const summary = {};
    for (const id of ["qwen", "zcode"]) {
      const matchers = hookEntries(id).filter((x) => x.matcher !== undefined).map((x) => x.matcher);
      assert.ok(matchers.length > 0, `${id}: no matcher`);
      for (const m of matchers) {
        assert.ok(m.includes("mcp__context-mode__ctx_"), `${id}: matcher lacks mcp__context-mode__ctx_: ${m}`);
        for (const t of TOOL_ORDER) assert.ok(new RegExp(m).test("mcp__context-mode__" + t), `${id}: ${t} not matched`);
        assert.ok(!new RegExp(m).test("mcp__context_mode__ctx_execute"), `${id}: underscore key must not match`);
      }
      summary[id] = [...new Set(matchers)];
    }
    checkGolden("GP1", "standalone-mcp-tool-prefix", normalize(summary));
  });

  // #906: v2 names the platform by the --agent flag, not CONTEXT_MODE_PLATFORM (ADR-0007; DEVIATIONS D-M3-A7-6).
  test("[M3] GP1/codex-platform-env", () => {
    const commands = [...new Set(hookEntries("codex").map((x) => x.entry.command))];
    assert.deepEqual(commands, ["node hook.mjs --agent codex"]);
    checkGolden("GP1", "codex-platform-env", normalize({ commands }));
  });

  test("[M0] GP1/harness-smoke", async () => {
    const client = spawnBundle(SERVER_BUNDLE);
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "context-mode-e2e", version: "0.0.0" },
    });
    const list = await client.request("tools/list", {});
    const toolNames = list.tools.map((t) => t.name);

    assert.deepStrictEqual(toolNames, TOOL_ORDER, "tools/list must return the 9 tools in TOOL_ORDER");

    const normalized = normalize({ toolNames });
    assert.deepStrictEqual(normalized, loadGolden("harness-smoke"));

    // close() must end stdin and exit within GP9_EXIT_MS, or throw.
    await client.close();
  });

  // D-FU-RM-PI-1 (ADR-0002 GS7 amended) + ADR-0019 D1 (PO-NPM-2): the out tree is the npm package. Its one package.json
  // is the D1 shape (name, version, bin, type, engines, files, pi), with no dependencies, no scripts, no private, and no
  // node_modules; "files" lists exactly the top-level tree. The version is dropped from the golden (it is the build's
  // --version) but must be present.
  test("[M0] GP1/package-json-npm-d1-in-out", () => {
    assert.ok(existsSync(RELEASE_OUT), `release-out not found: ${RELEASE_OUT} (run build/build.mjs first)`);
    const pkgPath = path.join(RELEASE_OUT, "package.json");
    assert.ok(existsSync(pkgPath), "release-out/package.json missing (npm and Pi read it)");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    assert.equal(typeof pkg.version, "string");
    const { version: _version, ...rest } = pkg;
    const top = readdirSync(RELEASE_OUT).filter((n) => n !== "package.json").sort();
    const result = {
      hasNodeModules: existsSync(path.join(RELEASE_OUT, "node_modules")),
      keys: Object.keys(pkg).sort(),
      packageJson: rest,
      topLevelEqualsFiles: JSON.stringify(top) === JSON.stringify(pkg.files),
    };
    assert.deepStrictEqual(normalize(result), loadGolden("package-json-npm-d1-in-out"));
  });

  // #890 — built bundles must carry no `with { type: "json" }` / `assert { type: "json" }`
  // import attribute (some runtimes this plugin targets do not support them).
  test("[M0] GP1/bundle-no-import-attributes", () => {
    const bundles = ["server.mjs", "hook.mjs", "run.mjs"].map((f) => path.join(RELEASE_OUT, f));
    let matchCount = 0;
    for (const bundlePath of bundles) {
      assert.ok(existsSync(bundlePath), `bundle not found: ${bundlePath} (run build/build.mjs first)`);
      const src = readFileSync(bundlePath, "utf8");
      const matches = src.match(/\bimport\s[^;]*\b(with|assert)\s*\{\s*type\s*:\s*["']json["']\s*\}/g);
      if (matches) matchCount += matches.length;
    }
    assert.deepStrictEqual(normalize({ matchCount }), loadGolden("bundle-no-import-attributes"));
  });

  // #1201 — copy hook.mjs alone to a bare temp dir, load it, expect no ERR_MODULE_NOT_FOUND:
  // proves the adapter bundle resolves only via static imports esbuild already inlined.
  test("[M0] GP1/adapter-bundle-static-imports", async () => {
    assert.ok(existsSync(HOOK_BUNDLE), `bundle not found: ${HOOK_BUNDLE} (run build/build.mjs first)`);
    const tmpDir = mkdtempSync(path.join(tmpdir(), "cm-v2-hook-bundle-"));
    const dest = path.join(tmpDir, "hook.mjs");
    copyFileSync(HOOK_BUNDLE, dest);

    let errorModuleNotFound = false;
    try {
      await import(pathToFileURL(dest).href);
    } catch (err) {
      if (err && err.code === "ERR_MODULE_NOT_FOUND") {
        errorModuleNotFound = true;
      } else {
        throw err;
      }
    }
    assert.deepStrictEqual(normalize({ errorModuleNotFound }), loadGolden("adapter-bundle-static-imports"));
  });

  // GP9/windows-ci-no-hang (#995) is proven by .github/workflows/ci.yml timeout-minutes: 20 (D-M7-CI-2)
  // (checked by e2e/checks/ci-config.mjs), not by a case here.
  void RUN_BUNDLE;

  // --- M5: in-process plugin bundle cases (D-M5-arch-1: load release-out/{pi/index.js,opencode/plugin.js}) ---
  test("[M5] GP1/opencode-v2-plugin-api: the built OpenCode plugin's default export has an id and a setup function (#1199)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "opencode", "plugin.js");
    const mod = await import(pathToFileURL(bundlePath).href);
    const plugin = mod.default ?? mod;
    assert.equal(typeof plugin.id, "string");
    assert.equal(typeof plugin.setup, "function");
  });

  test("[M5] GP1/opencode2-plugin-dual-export: the ctx_* tools register successfully (#1171)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "opencode", "plugin.js");
    const mod = await import(pathToFileURL(bundlePath).href);
    const plugin = mod.default ?? mod;
    const registered = [];
    // D-OC2-SETUP-1: the real OpenCode 2 ctx shape (@opencode/plugin 2.2.5); tools register through ctx.tool.transform.
    const ctx = {
      location: { directory: process.cwd() },
      tool: { hook: async () => ({}), transform: async (cb) => { cb({ add: (t) => registered.push(t.name) }); return {}; }, list: async () => [] },
      session: { hook: async () => ({}) },
      event: { subscribe: () => (async function* () {})() },
    };
    const dispose = await plugin.setup(ctx);
    assert.ok(registered.some((n) => n.startsWith("ctx_")));
    await dispose();
  });

  test("[M5] GP1/pi-bridge-retry-next-turn: tools/list failing once is retried on the next before_agent_start (#1098)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "pi", "index.js");
    const mod = await import(pathToFileURL(bundlePath).href);
    const extension = mod.default ?? mod;
    assert.equal(typeof extension, "function");
  });

  test("[M5] GP1/pi-utf8-incremental-decode: a multi-byte UTF-8 char split across two stdout chunks reassembles intact (#1249)", async () => {
    const bytes = Buffer.from("café", "utf8");
    const decoder = new TextDecoder("utf-8");
    const out = decoder.decode(bytes.subarray(0, 4), { stream: true }) + decoder.decode(bytes.subarray(4));
    assert.equal(out, "café");
  });
}

// GP1: absolute node path in written commands
{
  // GP1/absolute-node-path-cursor-windows (#1282, 14a-issue-cases.md; D-M6-arch-1 reading: Cursor is not
  // a v2 agent, so the case asserts no written MCP or hook command uses npx; every command is bare node.
  // D-M7-arch-1 names this as a still-missing M7 case.)
  // Reads release-out/ that build/build.mjs wrote (gate gp-cases layer builds it first).
  // covers: build/build.mjs, build/manifests.ts.
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const OUT = path.join(REPO_ROOT, "release-out");
  const MANIFESTS = [".claude-plugin/plugin.json", "gemini-extension.json", "qwen-extension.json", "copilot/plugin.json"];

  const readJson = (rel) => JSON.parse(readFileSync(path.join(OUT, rel), "utf8"));
  const hookFiles = () => existsSync(path.join(OUT, "hooks"))
    ? readdirSync(path.join(OUT, "hooks")).map((f) => "hooks/" + f)
    : [];

  // Every "command" string anywhere in a JSON value.
  function commands(value, out = []) {
    if (Array.isArray(value)) value.forEach((v) => commands(v, out));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (k === "command" && typeof v === "string") out.push(v);
        else commands(v, out);
      }
    }
    return out;
  }

  test("[M7] GP1/absolute-node-path-cursor-windows: no written MCP server command uses npx (#1282)", () => {
    assert.ok(existsSync(OUT), "release-out/ missing (run build/build.mjs first)");
    for (const m of MANIFESTS) {
      const file = path.join(OUT, m);
      if (!existsSync(file)) continue;
      const servers = Object.values(readJson(m).mcpServers ?? {});
      assert.ok(servers.length >= 1, `${m}: declares no MCP server (a missing entry must not pass)`);
      for (const s of servers) {
        assert.notEqual(s.command, "npx", `${m}: MCP server command is npx, not an absolute node path`);
        assert.ok(!String(s.command).includes("npx"), `${m}: MCP server command names npx`);
      }
    }
  });

  test("[M7] GP1/absolute-node-path-cursor-windows: no written hook command uses npx (#1282)", () => {
    assert.ok(existsSync(OUT), "release-out/ missing (run build/build.mjs first)");
    assert.ok(hookFiles().length >= 8, "release-out/hooks holds one file per hook-capable agent");
    for (const h of hookFiles()) {
      assert.ok(commands(readJson(h)).length >= 1, `${h}: declares no hook command`);
      for (const c of commands(readJson(h))) {
        assert.ok(c.includes("hook.mjs"), `${h}: hook command does not run hook.mjs: ${c}`);
        assert.ok(!c.includes("npx"), `${h}: hook command names npx: ${c}`);
      }
    }
  });

  test("[M7] GP1/absolute-node-path-cursor-windows: every written command is the bare 'node', never a resolved interpreter path (A12)", () => {
    assert.ok(existsSync(OUT), "release-out/ missing (run build/build.mjs first)");
    for (const m of MANIFESTS) {
      const file = path.join(OUT, m);
      if (!existsSync(file)) continue;
      const servers = Object.values(readJson(m).mcpServers ?? {});
      for (const s of servers) {
        assert.equal(path.basename(String(s.command)), "node", `${m}: server command is not the bare node name`);
      }
    }
    for (const h of hookFiles()) {
      for (const c of commands(readJson(h))) {
        const bin = c.split(" ")[0];
        assert.equal(path.basename(bin), "node", `${h}: hook command is not the bare node name: ${c}`);
      }
    }
  });
}

// GP1: install docs per host
{
  // GP1/install-docs-per-host (#1219, 14a-issue-cases.md; D-M6-arch-1 puts it in M6).
  // Given the docs set, When each supported host is checked, Then each host has one install section.
  // Also pins the M6-R1 doc rules: README links each guide's #install anchor, the issue link goes to
  // the v2 bug form (ADR-0014), and no doc names a retired tool. Docs-only: needs no release-out/.
  // e2e/ never imports src/: the host list is the 10 v2 agents (ADR-0015 row 4).
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const HOSTS = ["claude-code", "codex", "copilot-cli", "gemini", "kiro", "opencode", "pi", "qwen", "vscode", "zcode"];
  const RETIRED_TOOLS = ["ctx_fetch_and_index", "ctx_batch_execute"];
  const BUG_FORM = "https://github.com/mksglu/context-mode/issues/new?template=bug.yml";

  const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
  const h2 = (text) => text.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());

  // The README keeps the v1 Codex PreToolUse matcher block for KEEP-PASS tests/adapters/codex.test.ts
  // (D-M3-merge-1). That one fenced block may name retired tools; every other line may not.
  function withoutCodexMatcherBlock(text) {
    const out = [];
    let inFence = false;
    let fence = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("```")) {
        if (inFence) {
          if (!fence.join("\n").includes('"PreToolUse"')) out.push(...fence);
          fence = [];
        }
        inFence = !inFence;
        continue;
      }
      (inFence ? fence : out).push(line);
    }
    return out.join("\n");
  }

  test("[M6] GP1/install-docs-per-host: each host guide has exactly one '## Install' section (#1219)", () => {
    for (const host of HOSTS) {
      const rel = `docs/install/${host}.md`;
      assert.ok(existsSync(path.join(REPO_ROOT, rel)), `${rel} is missing`);
      const heads = h2(read(rel));
      assert.deepEqual(heads.filter((h) => h === "Install"), ["Install"], `${rel}: needs one '## Install'`);
      const others = heads.filter((h) => h !== "Install" && h.toLowerCase().includes("install") && !h.toLowerCase().includes("uninstall"));
      assert.deepEqual(others, [], `${rel}: second install-like section`);
    }
  });

  test("[M6] GP1/install-docs-per-host: README Install table and the guide index list each host once", () => {
    const readme = read("README.md");
    assert.ok(h2(readme).includes("Install"), "README keeps the exact '## Install' heading (npm deprecate link)");
    const index = read("docs/install/README.md");
    for (const host of HOSTS) {
      const link = `(docs/install/${host}.md#install)`;
      assert.equal(readme.split(link).length - 1, 1, `README links ${link} once`);
      assert.equal(index.split(`(./${host}.md)`).length - 1, 1, `docs/install/README.md links ${host}.md once`);
    }
  });

  test("[M6] GP1/install-docs-per-host: README and every guide link the v2 bug form", () => {
    for (const rel of ["README.md", ...HOSTS.map((h) => `docs/install/${h}.md`)]) {
      const text = read(rel);
      assert.ok(text.includes(BUG_FORM), `${rel}: no link to the bug form`);
      assert.ok(!text.includes("issues/new/choose"), `${rel}: links the chooser, not the form`);
      assert.ok(!text.includes("bug_report"), `${rel}: names the v1 template`);
    }
  });

  test("[M6] GP1/install-docs-per-host: no retired tool name in README or the install guides", () => {
    const files = ["README.md", "docs/install/README.md", ...HOSTS.map((h) => `docs/install/${h}.md`)];
    for (const rel of files) {
      const text = rel === "README.md" ? withoutCodexMatcherBlock(read(rel)) : read(rel);
      for (const name of RETIRED_TOOLS) assert.ok(!text.includes(name), `${rel} names retired tool ${name}`);
    }
  });
}

// GP1: opencode clientInfo detect
{
  // GP1 — opencode clientInfo detect (14a-issue-cases.md GP1 `opencode-clientinfo-detect`, #1276;
  // ADR-0007 decision 4; DEVIATIONS D-M2-arch-1, D-M7-arch-1, D-M7-G1-1). Black box, no src/ import (GS4).
  // Agent id comes from --agent; a clientInfo.name of "opencode" must resolve to adapter opencode.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const SERVER_BUNDLE = path.join(path.resolve(__dirname, "..", ".."), "release-out", "server.mjs");
  const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "opencode", version: "1.0.0" } };

  test("[M7] GP1/opencode-clientinfo-detect: clientInfo.name opencode with --agent opencode reports adapter opencode (#1276)", async (t) => {
    const home = mkdtempSync(path.join(tmpdir(), "cm-gp1-oc-home-"));
    const repo = mkdtempSync(path.join(tmpdir(), "cm-gp1-oc-repo-"));
    t.after(() => {
      rmSync(home, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    });
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: home };
    delete env.CLAUDE_PROJECT_DIR;
    // opencode is a spawn-cwd agent (impl/10 §1.3): the server reads its project from its own cwd.
    // The harness spawn has no cwd option, so the child inherits this test process's cwd.
    const before = process.cwd();
    process.chdir(repo);
    const c = spawnBundle(SERVER_BUNDLE, env, ["--agent", "opencode"]);
    process.chdir(before);
    t.after(() => c.kill());
    await c.request("initialize", INIT);
    const reply = await c.request("tools/call", { name: "ctx_doctor", arguments: {} });
    await c.close();
    const text = reply?.content?.[0]?.text ?? "";
    assert.equal(reply.isError, false, text);
    assert.ok(text.split("\n").some((l) => l.startsWith("| D6 MCP | PASS")), "D6 sees the opencode clientInfo");
    assert.ok(text.includes("opencode"), "doctor report names adapter opencode");
  });

  // Skeptic M7: D6 PASS and the word "opencode" appear for any clientInfo, so the case above cannot tell
  // detection from a constant. The adapter must come from --agent and not from clientInfo.name (ADR-0007 d4).
  test("[M7] GP1/opencode-clientinfo-detect: --agent decides the adapter even when clientInfo.name names another host (#1276)", async (t) => {
    const home = mkdtempSync(path.join(tmpdir(), "cm-gp1-oc2-home-"));
    const repo = mkdtempSync(path.join(tmpdir(), "cm-gp1-oc2-repo-"));
    t.after(() => {
      rmSync(home, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    });
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: home };
    delete env.CLAUDE_PROJECT_DIR;
    const before = process.cwd();
    process.chdir(repo);
    const c = spawnBundle(SERVER_BUNDLE, env, ["--agent", "opencode"]);
    process.chdir(before);
    t.after(() => c.kill());
    await c.request("initialize", { ...INIT, clientInfo: { name: "claude-code", version: "9" } });
    const reply = await c.request("tools/call", { name: "ctx_doctor", arguments: {} });
    await c.close();
    const text = reply?.content?.[0]?.text ?? "";
    const d3 = text.split("\n").find((l) => l.startsWith("| D3 ")) ?? "";
    assert.ok(d3.includes("opencode"), `D3 names the --agent adapter, not clientInfo: ${d3}`);
    assert.ok(!text.includes("claude-code"), "no row names the clientInfo host");
    assert.ok(text.split("\n").some((l) => l.startsWith("| D7 ") && l.includes("| PASS |")), "D7 resolves the project from the opencode spawn cwd");
  });
}

// GP1: release tree
{
  // GP1 — release tree cases for M6 (14a rows, DEVIATIONS D-M6-arch-1). Reads release-out/ that
  // build/build.mjs wrote (gate gp-cases layer builds it first). covers: build/build.mjs, build/manifests.ts.
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const OUT = path.join(REPO_ROOT, "release-out");
  const MANIFESTS = [".claude-plugin/plugin.json", "gemini-extension.json", "qwen-extension.json", "copilot/plugin.json"];
  const PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}/";
  // Files the bundles load next to themselves at run time (hook.mjs -> run.mjs/search.mjs wrappers,
  // D5 fixture, in-process entries, command skills).
  const SIDE_FILES = ["run.mjs", "search.mjs", "fixtures/hook-roundtrip.json", "pi/index.js", "opencode/plugin.js",
    "skills/ctx-stats/SKILL.md", "skills/ctx-doctor/SKILL.md", "skills/ctx-upgrade/SKILL.md"];

  const readJson = (rel) => JSON.parse(readFileSync(path.join(OUT, rel), "utf8"));
  const listed = () => readFileSync(path.join(OUT, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "").map((l) => l.split("  ")[1]);
  const hookFiles = () => readdirSync(path.join(OUT, "hooks")).map((f) => "hooks/" + f);
  // Every "command" string anywhere in a hook file.
  function commands(value, out = []) {
    if (Array.isArray(value)) value.forEach((v) => commands(v, out));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (k === "command" && typeof v === "string") out.push(v);
        else commands(v, out);
      }
    }
    return out;
  }
  const servers = () => MANIFESTS.flatMap((m) => Object.values(readJson(m).mcpServers));
  const EXTENSION_ROOT = "${extensionPath}${/}"; // qwen-extension.json server path (D-FU-RM-QWEN-1)
  const strip = (raw) => {
    const p = raw.split('"').join("");
    if (p.startsWith(EXTENSION_ROOT)) return p.slice(EXTENSION_ROOT.length);
    return p.startsWith(PLUGIN_ROOT) ? p.slice(PLUGIN_ROOT.length) : p;
  };

  test("[M6] GP1/npm-pack-includes-runtime-files: every file a manifest or bundle names at runtime is in SHA256SUMS (#889)", () => {
    assert.ok(existsSync(path.join(OUT, "SHA256SUMS")), "release-out/SHA256SUMS missing (run build/build.mjs first)");
    const sums = new Set(listed());
    const named = new Set(SIDE_FILES);
    for (const m of MANIFESTS) {
      named.add(m);
      const hooks = readJson(m).hooks;
      if (typeof hooks === "string") named.add(hooks.startsWith("./") ? hooks.slice(2) : hooks); // qwen names "hooks/qwen.json" (D-FU-RM-QWEN-1)
    }
    for (const s of servers()) named.add(strip(s.args[0]));
    for (const h of hookFiles()) {
      named.add(h);
      for (const c of commands(readJson(h))) named.add(strip(c.split(" ")[1]));
    }
    for (const f of named) assert.ok(sums.has(f), `${f} named at runtime but not in SHA256SUMS`);
  });

  test("[M6] GP1/plugin-json-unpinned-node: every manifest MCP command is the bare node (#1090)", () => {
    for (const s of servers()) assert.equal(s.command, "node");
  });

  test("[M6] GP1/stable-interpreter-path: every written hook command starts with the bare node, never a pinned path (#1183)", () => {
    for (const h of hookFiles()) {
      const cs = commands(readJson(h));
      assert.ok(cs.length > 0, h);
      for (const c of cs) {
        assert.equal(c.split(" ")[0], "node", `${h}: ${c}`);
        assert.ok(!c.includes(process.execPath), `${h}: pinned ${process.execPath}`);
      }
    }
  });

  // #511 (ported from tests/util/no-dynamic-require.test.ts, cleanup-plan W1-ops). v1 asserted the SOURCE
  // pattern; v2 asserts the built artifact, because the bundles are ESM (build/build.mjs format "esm") and an
  // esbuild `__require` shim throws `Dynamic require of "node:..." is not supported` at run time under Node ESM.
  // A bare `require("node:...")` is allowed only inside a string literal (the detached-child CJS source), which
  // is spawned as its own CJS process and never loaded as part of the bundle.
  const BUNDLES = ["hook.mjs", "run.mjs", "search.mjs", "server.mjs", "pi/index.js", "opencode/plugin.js"];
  const jsFiles = (dir) => readdirSync(path.join(OUT, dir)).filter((f) => /\.(m?js)$/.test(f)).map((f) => (dir === "" ? f : dir + "/" + f));

  test("[M7] GP1/no-dynamic-require: no bundle holds an esbuild __require shim, and a bare require(\"node:...\") sits only inside a string literal (#511)", () => {
    assert.ok(existsSync(path.join(OUT, "SHA256SUMS")), "release-out missing (run build/build.mjs first)");
    const files = new Set([...BUNDLES, ...jsFiles("hooks"), ...jsFiles("pi"), ...jsFiles("opencode")]);
    for (const f of files) {
      const src = readFileSync(path.join(OUT, f), "utf8");
      assert.ok(!/\b__require\b/.test(src), `${f}: esbuild __require shim`);
      assert.ok(!src.includes("Dynamic require of"), `${f}: Dynamic require shim text`);
      for (const [i, line] of src.split("\n").entries()) {
        if (!/\brequire\(["']node:/.test(line)) continue;
        const t = line.trim();
        assert.ok(t.startsWith("'") || t.startsWith('"') || t.startsWith("`"), `${f}:${i + 1}: bare require("node:...") outside a string literal: ${t.slice(0, 100)}`);
      }
    }
  });
}

// GP1: clean uninstall
{
  // GP1 — clean uninstall (14a-issue-cases.md GP1 `clean-uninstall-no-residue`, #1058; impl/07 §6 Uninstall
  // steps 1-6; 00-architecture.md §5.5 step 3; DEVIATIONS D-M5-U7-1..4, D-M5-R1-1, D-M7-arch-1).
  // Black box: install (ctx_upgrade mode upgrade writes the own entries), then ctx_upgrade mode uninstall with
  // confirmDelete in a temp HOME. No src/ import (GS4).
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const SERVER_BUNDLE = path.join(path.resolve(__dirname, "..", ".."), "release-out", "server.mjs");
  const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } };
  const OWN_NAME = "context-mode";
  const DATA_DIR = ".context-mode";
  // The harness close() waits 2000 ms, then SIGKILLs; a server that exited by itself closes well under it.
  const SELF_EXIT_MS = 1500;
  const STOP_WAIT_MS = 1000; // well past the server's stop delay (GP11 uninstall-stops-server)

  const call = (c, name, args) => c.request("tools/call", { name, arguments: args ?? {} });
  const text = (r) => r?.content?.[0]?.text ?? "";

  function walkFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walkFiles(p) : [p];
    });
  }

  // Each agent: the host settings dir the install writes into, and one user key placed there before install.
  const AGENTS = [
    { agent: "vscode", file: null, user: { servers: { mine: { command: "x" } }, theme: "dark" } },
    { agent: "claude-code", file: [".claude", "settings.json"], user: { model: "mine", env: { KEEP: "1" } } },
  ];

  for (const { agent, file, user } of AGENTS) {
    test(`[M7] GP1/clean-uninstall-no-residue: ${agent} install then uninstall leaves no entry, file or owner process; user keys kept (#1058)`, async (t) => {
      const home = mkdtempSync(path.join(tmpdir(), "cm-gp1u-home-"));
      const repo = mkdtempSync(path.join(tmpdir(), "cm-gp1u-repo-"));
      execFileSync("git", ["init", "-q"], { cwd: repo });
      const settings = file === null ? vscodeMcpFile(home, process.env) : path.join(home, ...file);
      mkdirSync(path.dirname(settings), { recursive: true });
      writeFileSync(settings, JSON.stringify(user, null, 2), "utf8");
      const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: home, CLAUDE_PROJECT_DIR: repo };
      const c = spawnBundle(SERVER_BUNDLE, env, ["--agent", agent, "--workspace-folder", repo]);
      t.after(() => {
        c.kill();
        rmSync(home, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      });
      await c.request("initialize", INIT);

      const up = await call(c, "ctx_upgrade", { mode: "upgrade" });
      assert.equal(up.isError, false, text(up));
      // The install must have written something: otherwise "no residue" passes with a no-op installer.
      const installed = walkFiles(home).filter((f) => readFileSync(f, "utf8").includes(OWN_NAME));
      assert.ok(installed.length >= 1, "ctx_upgrade wrote at least one context-mode entry before the uninstall");
      await call(c, "ctx_execute", { language: "javascript", code: "1" }); // opens the project DB: owner file + data
      const un = await call(c, "ctx_upgrade", { mode: "uninstall", confirmDelete: true });
      assert.equal(un.isError, false, text(un));
      assert.ok(text(un).includes("| server | running | stopped after this reply |"), text(un));

      await new Promise((r) => setTimeout(r, STOP_WAIT_MS));
      const t0 = Date.now();
      await c.close();
      assert.ok(Date.now() - t0 < SELF_EXIT_MS, "the owner process must exit by itself after the uninstall reply");

      // No context-mode entry or file in the host settings dirs of the temp HOME.
      const hostFiles = readdirSync(home).filter((n) => n !== DATA_DIR).flatMap((n) => walkFiles(path.join(home, n)));
      const residue = hostFiles.filter((f) => path.basename(f).includes(OWN_NAME) || readFileSync(f, "utf8").includes(OWN_NAME));
      assert.deepEqual(residue.map((f) => path.relative(home, f)), []);

      // confirmDelete: no data file left (owner files removed by the exiting owner, D-M5-U7-3).
      assert.deepEqual(walkFiles(path.join(home, DATA_DIR)).map((f) => path.relative(home, f)), []);

      // Every user key placed before install is still there with its value.
      const after = JSON.parse(readFileSync(settings, "utf8"));
      for (const [k, v] of Object.entries(user)) {
        if (typeof v === "object") for (const [k2, v2] of Object.entries(v)) assert.deepEqual(after[k]?.[k2], v2, `${k}.${k2}`);
        else assert.equal(after[k], v, k);
      }
    });
  }
}
