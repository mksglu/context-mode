// ADR-0017 (v1 retention): v1 vs v2 differential, and the v1 executor, store and Windows build-tool cases ported to v2.
// Moved from tests/v2/{compat/v1-v2-diff,tools/v1-executor-ported,tools/v1-store-ported,sandbox/win-build-ported}.test.mjs. Names and bodies unchanged.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import { rewriteWindowsBuildTools as rw } from "../../src/core/sandbox/win-build.ts";
import { ctxExecute } from "../../src/core/tools/execute.ts";
import { ctxIndex } from "../../src/core/tools/index.ts";
import { ctxSearch } from "../../src/core/tools/search.ts";

describe("ADR-0017: every v1 PreToolUse call through the built v2 hook bundle", () => {
  // Differential test: every PreToolUse call the v1 suite makes (tests/v2/fixtures/v1-cases/pretooluse.json, recorded from
  // context-mode 1.0.169 by scripts/v1-cases/) goes through the built v2 hook bundle. v1 allow/deny must equal v2 allow/deny,
  // or the difference must sit in ALLOW below with a DEVIATIONS row id. A difference in neither fails the test: no silent skips.
  // Serial: one shared before/after (built bundle and temp dir), and each test spawns the hook once.
  const ROOT = join(import.meta.dirname, "..", "..");
  const FIX = JSON.parse(readFileSync(join(ROOT, "tests/v2/fixtures/v1-cases/pretooluse.json"), "utf8"));
  const DEVIATIONS = readFileSync(join(ROOT, "docs/v2/DEVIATIONS.md"), "utf8");

  // v1 platform name -> v2 agent id. A v1 host with no v2 hook entry runs as codex (the plain Claude hook shape, no replace).
  const HOST = { "claude-code": "claude-code", codex: "codex", "gemini-cli": "gemini", "qwen-code": "qwen", "vscode-copilot": "vscode", kiro: "kiro" };
  // canonical tool -> the name that host sends (src/adapters/table.ts nativeTools, live fixtures).
  const NATIVE = {
    gemini: { Bash: "run_shell_command", WebFetch: "web_fetch", Read: "read_file", Grep: "grep_search" },
    qwen: { Bash: "run_shell_command", WebFetch: "web_fetch", Read: "read_file", Grep: "grep_search" },
    vscode: { Bash: "run_in_terminal", WebFetch: "fetch_webpage", Read: "read_file" },
    kiro: { Bash: "execute_bash" },
  };
  const PREFIX = { "claude-code": "mcp__plugin_context-mode_context-mode__", codex: "mcp__context_mode__" };
  const FOREIGN = "mcp__other__";
  const V1_ONLY_NAMES = new Set(["exec_command", "run_command", "read_url_content", "mcp_web_fetch", "mcp_fetch_tool", "view_file", "local_shell", "shell_command", "Shell"]);

  /** Allowed differences: id -> [DEVIATIONS row id, predicate(row, ctx)]. Every entry must match at least one row (no stale entries). */
  const ALLOW = {
    replace: ["D-V1DIFF-REPLACE-1", (r, c) => c.agent !== "codex" && r.tool === "Bash" && r.v1.action === "modify" && c.v2 === "allow" && c.leg2 === "deny"],
    noInject: ["D-V1DIFF-NOINJECT-1", (r) => (r.tool === "Agent" || r.tool === "Task") && r.v1.action === "modify"],
    cwdPin: ["D-V1DIFF-CWDPIN-1", (r) => r.v1.action === "modify" && /ctx_(execute|batch_execute|execute_file)$/.test(r.tool ?? "")],
    noMarker: ["D-V1DIFF-NOMARKER-1", (r, c) => r.v1.action === "passthrough" && c.v2 === "deny" && (r.mcpReady === false || r.options?.mcpToolsAvailable === false)],
    hostNames: ["D-V1DIFF-HOSTNAMES-1", (r) => V1_ONLY_NAMES.has(r.tool ?? "")],
    foreign: ["D-V1DIFF-FOREIGN-1", (r) => (r.tool ?? "").startsWith(FOREIGN)],
    failClosed: ["D-V1DIFF-SECMODULE-1", (r) => (r.v1.reason || "").includes("fail-closed engaged")],
  };

  let work, bundle;
  before(() => {
    work = mkdtempSync(join(tmpdir(), "cm-v1diff-"));
    bundle = join(work, "out");
    const b = spawnSync(process.execPath, [join(ROOT, "build", "build.mjs"), "--out", bundle], { encoding: "utf8", cwd: ROOT });
    assert.equal(b.status, 0, b.stderr);
  });
  after(() => rmSync(work, { recursive: true, force: true }));

  function translate(row, agent) {
    let tool = row.tool ?? "", input = row.input ?? {};
    const base = tool.includes("__") ? tool.slice(tool.lastIndexOf("__") + 2) : tool;
    const own = !tool.startsWith(FOREIGN);
    if (own && (tool.startsWith("ctx_") || tool.startsWith("mcp__plugin_context-mode"))) {
      let name = base;
      if (base === "ctx_execute_file") { name = "ctx_execute"; input = { language: input.language, code: input.code, file: input.path }; }
      if (base === "ctx_batch_execute") { name = "ctx_batch"; input = { commands: (input.commands || []).map((c) => c.command) }; }
      tool = (PREFIX[agent] ?? PREFIX.codex) + name;
    } else if (NATIVE[agent]?.[tool]) tool = NATIVE[agent][tool];
    return { tool, input };
  }

  function run(agent, row, settings) {
    const home = mkdtempSync(join(work, "h-"));
    const repo = join(home, "repo");
    mkdirSync(join(repo, ".claude"), { recursive: true });
    mkdirSync(join(home, ".claude"), { recursive: true });
    if (settings) {
      if (settings.project) writeFileSync(join(repo, ".claude/settings.json"), JSON.stringify(settings.project));
      if (settings.projectLocal) writeFileSync(join(repo, ".claude/settings.local.json"), JSON.stringify(settings.projectLocal));
      if (settings.user) writeFileSync(join(home, ".claude/settings.json"), JSON.stringify(settings.user));
    }
    const { tool, input } = translate(row, agent);
    const payload = { session_id: "s-" + row.id, cwd: repo, hook_event_name: agent === "gemini" ? "BeforeTool" : "PreToolUse", tool_name: tool, tool_input: input };
    const r = spawnSync(process.execPath, [join(bundle, "hook.mjs"), "--agent", agent], { input: JSON.stringify(payload), encoding: "utf8", cwd: repo, env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo } });
    assert.ok(r.status === 0 || r.status === 2, `${row.id}: hook exit ${r.status}: ${r.stderr}`); // the hook never errors: exit 0, or 2 for a host that denies by exit code
    return r.status === 2 || r.stdout.includes('"deny"') ? "deny" : "allow";
  }

  test("v1 cases: the fixture is the recorded v1 suite", () => {
    assert.equal(FIX.v1Version, "1.0.169");
    assert.ok(FIX.rows.length >= 300, "rows: " + FIX.rows.length);
    for (const r of FIX.rows) assert.ok(r.source && r.v1?.action, r.id);
  });

  test("every v1 PreToolUse case: same allow/deny in v2, or a named intended difference", () => {
    const hit = {}, unclassified = [], counts = { cases: 0, same: 0, intended: 0 };
    for (const row of FIX.rows) {
      const settings = row.settings ? FIX.settings[row.settings] : null;
      const agent = settings ? "claude-code" : HOST[row.platform] ?? "codex";
      const v1 = row.v1.action === "modify" || row.v1.action === "deny" ? "deny" : "allow";
      const v2 = run(agent, row, settings);
      // Second leg for run-then-replace hosts: the same dump on a host without replace must still deny (rule parity).
      const leg2 = agent !== "codex" && row.tool === "Bash" ? run("codex", row, null) : null;
      counts.cases++;
      if (v1 === v2) { counts.same++; if (leg2 !== null && !settings && v1 === "deny") assert.equal(leg2, "deny", row.id); continue; }
      const ctx = { agent, v2, leg2 };
      const id = Object.keys(ALLOW).find((k) => ALLOW[k][1](row, ctx));
      if (id === undefined) { unclassified.push(`${row.id} ${row.source} ${agent} v1=${row.v1.action} v2=${v2} ${row.tool} ${JSON.stringify(row.input).slice(0, 80)}`); continue; }
      hit[id] = (hit[id] ?? 0) + 1;
      if (process.env.V1DIFF_LIST) console.log("DIFF", id, row.id, agent, row.v1.action, "->", v2, row.tool, JSON.stringify(row.input).slice(0, 70));
      counts.intended++;
    }
    console.log("v1-v2-diff", JSON.stringify({ ...counts, byDeviation: hit }));
    assert.deepEqual(unclassified, [], "v1 and v2 differ and no ALLOW entry names the difference");
    for (const k of Object.keys(ALLOW)) assert.ok(hit[k] > 0, `ALLOW.${k} matched no row (stale entry)`);
  });

  test("every ALLOW entry cites a DEVIATIONS row", () => {
    for (const [k, [id]] of Object.entries(ALLOW)) assert.ok(DEVIATIONS.includes("| " + id + " |"), `${k}: ${id} is not in docs/v2/DEVIATIONS.md`);
  });
});

describe("ADR-0017: v1 executor language cases through ctx_execute", { concurrency: CONC }, () => {
  // Ported from v1 tests/executor.test.ts (context-mode 1.0.169): the language cases, through v2's public ctx_execute handler.
  // A runtime missing on the machine shows as a named skip (node:test prints it), never as a pass.
  // Concurrent: each test makes its own temp root and does not touch process.env or cwd.
  const has = (bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0;
  const skipUnless = (bin) => (has(bin) ? false : `${bin} is not on PATH`);

  function ctxFor(root) {
    const k = "1".repeat(16);
    return {
      project: { projectKey: k, projectDir: join(root, "projects", k), dbPath: join(root, "projects", k, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId: "s1", turn: 1, signal: new AbortController().signal,
    };
  }
  async function exec(input) {
    const root = mkdtempSync(join(tmpdir(), "cm-v1ex-"));
    try { return await ctxExecute.handler(input, ctxFor(root)); } finally { rmSync(root, { recursive: true, force: true }); }
  }

  const OK = [
    ["JS: hello world", "javascript", 'console.log("hello from js");', "hello from js", "node"],
    ["JS: variables, math, template literals", "javascript", "const x = 42; const y = 58; console.log(`sum: ${x + y}`);", "sum: 100", "node"],
    ["JS: JSON parse + transform", "javascript", 'const d=[{a:30},{a:25},{a:35}]; console.log(JSON.stringify({count:d.length,avg:(d.reduce((s,x)=>s+x.a,0)/d.length).toFixed(1)}));', '"avg":"30.0"', "node"],
    ["JS: async/await + setTimeout", "javascript", 'new Promise(r => setTimeout(() => r("async done"), 50)).then(console.log);', "async done", "node"],
    ["JS: require node:os", "javascript", 'console.log("platform:", require("os").platform());', "platform:", "node"],
    ["JS: Array.from + filter/reduce", "javascript", 'console.log("even sum:", Array.from({length:100},(_, i)=>i+1).filter(n=>n%2===0).reduce((a,b)=>a+b,0));', "even sum: 2550", "node"],
    ["Python: hello world", "python", 'print("hello from python")', "hello from python", "python3"],
    ["Python: list comprehension + math", "python", "nums=[i**2 for i in range(10)]\nprint(f'sum: {sum(nums)}')", "sum: 285", "python3"],
    ["Python: dict + json", "python", 'import json\nprint(json.dumps({"count": len([1,2])}))', '"count": 2', "python3"],
    ["Shell: hello world", "shell", 'echo "hello from shell"', "hello from shell", "sh"],
    ["Shell: pipes + sort", "shell", 'printf "banana\\napple\\ncherry" | sort', "apple\nbanana\ncherry", "sh"],
    ["Shell: arithmetic + variables", "shell", 'X=10\nY=20\necho "sum: $((X + Y))"', "sum: 30", "sh"],
    ["Ruby: hello world", "ruby", 'puts "hello from ruby"', "hello from ruby", "ruby"],
    ["Ruby: array methods", "ruby", "puts [1,2,3,4].select(&:even?).sum", "6", "ruby"],
    ["Perl: hello world", "perl", 'print "hello from perl\\n";', "hello from perl", "perl"],
  ];
  for (const [name, language, code, want, bin] of OK) {
    test("v1 executor: " + name, { skip: skipUnless(bin) }, async () => {
      const out = await exec({ language, code });
      assert.equal(out.isError, false, out.text);
      assert.ok(out.text.startsWith("exit 0"), out.text);
      assert.ok(out.text.includes(want), out.text);
    });
  }

  const FAIL = [
    ["JS: syntax error returns non-zero", "javascript", "const x = {", /^exit [1-9]/, "node"],
    ["JS: runtime error returns non-zero and keeps the message", "javascript", 'throw new Error("intentional");', /^exit [1-9][\s\S]*intentional/, "node"],
    ["Python: syntax error", "python", "def foo(\n  pass", /^exit [1-9]/, "python3"],
    ["Shell: failing command", "shell", "exit 3", /^exit 3/, "sh"],
  ];
  for (const [name, language, code, re, bin] of FAIL) {
    test("v1 executor: " + name, { skip: skipUnless(bin) }, async () => {
      const out = await exec({ language, code });
      assert.match(out.text, re);
    });
  }

  // v1 set TMPDIR to its sandbox temp dir (v1 executor.test.ts:520). v2 does not set TMPDIR (D-V1DIFF-TMPDIR-1). The script's cwd is the
  // project root by design, so the kept property is that the sandbox's own script file leaves nothing behind in it.
  test("v1 executor: the sandbox leaves no script or temp file in the project root (D-V1DIFF-TMPDIR-1)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-v1ex-root-"));
    try {
      const before = readdirSync(root).sort();
      const out = await ctxExecute.handler({ language: "shell", code: "pwd; echo done" }, ctxFor(root));
      assert.ok(out.text.includes("done"), out.text);
      const added = readdirSync(root).filter((f) => !before.includes(f) && f !== "projects");
      assert.deepEqual(added, [], "files left in the project root: " + added.join(", "));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0017: v1 store index and search cases through the v2 handlers", { concurrency: CONC }, () => {
  // Ported from v1 tests/store.test.ts (context-mode 1.0.169): index and search behaviour through v2's public handlers.
  // Concurrent: each test makes its own temp store.
  function ctxFor(root) {
    const k = "1".repeat(16);
    return {
      project: { projectKey: k, projectDir: join(root, "projects", k), dbPath: join(root, "projects", k, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId: "s1", turn: 1, signal: new AbortController().signal,
    };
  }
  async function withStore(fn) {
    const root = mkdtempSync(join(tmpdir(), "cm-v1st-"));
    const ctx = ctxFor(root);
    try {
      return await fn({
        index: (content, source) => ctxIndex.handler({ content, source }, ctx),
        search: (queries, extra = {}) => ctxSearch.handler({ queries, ...extra }, ctx),
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  test("v1 store: basic keyword search returns the matching chunk with its source label", async () => {
    await withStore(async (s) => {
      await s.index("# Auth\n\nThe authentication flow uses JWT tokens.\n\n# Cache\n\nCaching strategy runs redis.", "doc_a");
      const r = await s.search(["redis"]);
      assert.equal(r.isError, false);
      assert.ok(r.text.includes("doc_a") && r.text.includes("redis"), r.text);
    });
  });

  test("v1 store: porter stemming matches word variants", async () => {
    await withStore(async (s) => {
      await s.index("# Connecting\n\nEstablish connections to the database.\n\n# Caching\n\nCache your responses.", "stemming");
      const r = await s.search(["connect"]);
      assert.ok(r.text.includes("connections") || r.text.includes("Connecting"), r.text);
    });
  });

  test("v1 store: a query with no match returns a no-hits reply, not an error", async () => {
    await withStore(async (s) => {
      await s.index("# React\n\nComponent lifecycle.", "react");
      const r = await s.search(["kubernetes deployment yaml"]);
      assert.equal(r.isError, false);
      assert.ok(/No hits/.test(r.text), r.text);
    });
  });

  test("v1 store: FTS5 special characters in a query never throw", async () => {
    await withStore(async (s) => {
      await s.index("# Test\n\nSome content here.", "sanitize");
      for (const q of ['test "quoted"', "test AND OR NOT", "test()", "test*", "test:value", "test^2", "{test}", "NEAR/3"]) {
        const r = await s.search([q]);
        assert.equal(typeof r.text, "string", q);
        assert.equal(r.isError, false, `${q}: ${r.text}`);
      }
    });
  });

  test("v1 store: an empty query never throws", async () => {
    await withStore(async (s) => {
      await s.index("# Doc\n\nContent.", "empty-q");
      const r = await s.search([""]);
      assert.equal(typeof r.isError, "boolean");
    });
  });

  // v1 replaced the old entry for a label (v1 store.test.ts:558). v2 appends a new source row and keeps the old one until
  // retention removes it (ADR-0002 Q7; no content is dropped on re-index). D-V1DIFF-REINDEX-1 records it for the owner to confirm.
  test("v1 store: re-indexing the same source label keeps the new content searchable and loses nothing (D-V1DIFF-REINDEX-1)", async () => {
    await withStore(async (s) => {
      await s.index("# Part 1\n\nFirstbatchmarker.", "incremental");
      await s.index("# Part 2\n\nSecondbatchmarker.", "incremental");
      const cur = await s.search(["Secondbatchmarker"]);
      const old = await s.search(["Firstbatchmarker"]);
      assert.ok(cur.text.includes("Secondbatchmarker"), cur.text);
      assert.ok(old.text.includes("Firstbatchmarker"), "v2 keeps the earlier entry: " + old.text);
    });
  });

  test("v1 store: source filter returns only that source, and a non-matching source returns no hits", async () => {
    await withStore(async (s) => {
      await s.index("# A\n\nsharedword alpha.", "src_one");
      await s.index("# B\n\nsharedword beta.", "src_two");
      const one = await s.search(["sharedword"], { source: "src_one" });
      assert.ok(one.text.includes("src_one") && !one.text.includes("src_two"), one.text);
      const none = await s.search(["sharedword"], { source: "nosuchsource" });
      assert.ok(/No hits/.test(none.text), none.text);
    });
  });

  test("v1 store: the source filter does not leak through the _ or % wildcard of a source label (#646)", async () => {
    await withStore(async (s) => {
      await s.index("# A\n\nfoo bar baz qux content matter", "api_v1");
      await s.index("# B\n\nfoo bar baz qux different content matter", "apiXv1");
      await s.index("# C\n\nfoo bar baz qux another content matter", "api-v1");
      const u = await s.search(["foo bar baz qux matter"], { source: "api_v1" });
      assert.ok(u.text.includes("api_v1"), u.text);
      assert.ok(!u.text.includes("apiXv1") && !u.text.includes("api-v1"), "underscore leaked: " + u.text);
      await s.index("# D\n\nfoo bar baz qux percent matter", "pct%x");
      await s.index("# E\n\nfoo bar baz qux plain matter", "pctYYx");
      const p = await s.search(["foo bar baz qux matter"], { source: "pct%x" });
      assert.ok(!p.text.includes("pctYYx"), "percent leaked: " + p.text);
    });
  });

  test("v1 store: index with neither content, path nor url is an error, and whitespace-only content does not crash", async () => {
    await withStore(async (s) => {
      const none = await ctxIndex.handler({ source: "x" }, ctxFor(mkdtempSync(join(tmpdir(), "cm-v1st2-"))));
      assert.equal(none.isError, true);
      const ws = await s.index("   \n\n  ", "blank");
      assert.equal(typeof ws.isError, "boolean");
    });
  });

  test("v1 store: markdown headings split into separate chunks that are found separately", async () => {
    await withStore(async (s) => {
      await s.index("# One\n\nalphamarker text\n\n## Two\n\nbetamarker text\n\n### Three\n\ngammamarker text", "headings");
      const r = await s.search(["alphamarker", "gammamarker"]);
      assert.ok(r.text.includes("alphamarker") && r.text.includes("gammamarker"), r.text);
    });
  });
});

describe("ADR-0017: v1 #782 Windows build-tool rewrite", { concurrency: CONC }, () => {
  // W1-core PORT of tests/executor/win-sandbox-782-788.test.ts #782 (rewriteWindowsBuildTools), same cases.
  // Concurrent: pure functions, no shared state.
  test("[W1-core] #782: bare mvn becomes mvn.cmd on win32", () => {
    assert.equal(rw("mvn clean install", "win32"), "mvn.cmd clean install");
  });
  test("[W1-core] #782: mvn after && ; newline is rewritten", () => {
    assert.equal(rw("cd app && mvn -version", "win32"), "cd app && mvn.cmd -version");
    assert.equal(rw("mvn test; echo done", "win32"), "mvn.cmd test; echo done");
    assert.equal(rw("echo a\nmvn package", "win32"), "echo a\nmvn.cmd package");
  });
  test("[W1-core] #782: other platforms are untouched", () => {
    assert.equal(rw("mvn clean install", "linux"), "mvn clean install");
    assert.equal(rw("mvn clean install", "darwin"), "mvn clean install");
  });
  test("[W1-core] #782: mvn.cmd, mvnw, mvnd, mymvn are not rewritten", () => {
    assert.equal(rw("mvn.cmd clean install", "win32"), "mvn.cmd clean install");
    assert.equal(rw("./mvnw clean", "win32"), "./mvnw clean");
    assert.equal(rw("mymvn run", "win32"), "mymvn run");
    assert.equal(rw("mvnd build", "win32"), "mvnd build");
  });
});
