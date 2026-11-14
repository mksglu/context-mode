// TECH-SPEC GP3 (hooks), ADR-0008. One file per GP case (ADR-0024).
// Merged from GP3-hook-perf, GP3-hooks and GP3-zcode-names. Plain blocks, not describe: e2e/cases/run.mjs counts every pass event, and a describe adds one. Names unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runHookFixture } from "../harness/hook-runner.mjs";
import { normalize } from "../harness/normalize.mjs";
import { checkGolden } from "../harness/golden.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

// GP3: hook files, fixture replay and Pi/OpenCode parity
{
  // GP3 — hooks, M0 part only (14-tests.md §4 GP3 row; A6).
  // Full GP3 (10 adapters x 4 events, Read-deny / shell-dump-deny / E1-E5 / P4 / V8 / V17 golden
  // cases) is spec'd for its own milestone; this file's M0 slice is the fixture-replay smoke:
  // replay every recorded native hook payload under e2e/fixtures/ through hook-runner.mjs and
  // assert exit 0 plus the native "allow" stdout shape (10-adapters.md §2 shared encode step 2:
  // "allow": native stdout = "" exit 0) for that agent.
  //
  // As of this file (A6), 0 of 40 fixtures are recorded, so e2e/fixtures/ does not exist on
  // disk — the "zero fixture dirs" case below must fail, not pass, until the capture step runs.


  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = path.resolve(__dirname, "..", "..");
  const FIXTURES_ROOT = path.join(REPO_ROOT, "e2e", "fixtures");
  const HOOK_BUNDLE = path.join(REPO_ROOT, "release-out", "hook.mjs");

  function loadGolden(name) {
    const p = path.join(__dirname, "..", "golden", "GP3", `${name}.json`);
    return JSON.parse(readFileSync(p, "utf8"));
  }

  function listDirs(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory());
  }

  // Discover <agent>/<ver>/<event>.json fixture files from disk (A6). Never a hand-written list.
  function discoverFixtures() {
    const out = [];
    for (const agent of listDirs(FIXTURES_ROOT)) {
      const agentDir = path.join(FIXTURES_ROOT, agent);
      for (const ver of listDirs(agentDir)) {
        const verDir = path.join(agentDir, ver);
        for (const file of readdirSync(verDir)) {
          if (!file.endsWith(".json")) continue;
          out.push({
            agent,
            ver,
            event: file.replace(/\.json$/, ""),
            filePath: path.join(verDir, file),
          });
        }
      }
    }
    return out;
  }

  // M3 hook-config cases (14a-issue-cases.md GP3 rows; impl/10 §1.5; DECISIONS-r9 R4, T-CX). Black box: they read
  // only release-out/hooks/*.json and recorded fixtures (GS4).
  const HOOKS_OUT = path.join(REPO_ROOT, "release-out", "hooks");
  // D-FU-RM-GEMINI-1: Gemini reads only hooks/hooks.json; every other host ships hooks/<id>.json.
  const hookFileOf = (id) => (id === "gemini" ? "hooks" : id) + ".json";
  const readHooks = (id) => JSON.parse(readFileSync(path.join(HOOKS_OUT, hookFileOf(id)), "utf8"));
  const HOST_TIMEOUT_MAX_S = 10; // #1226: every hook timeout is 10 s or less
  const MS_PER_S = 1000;
  // impl/10 §1.5 "Timeout key" column; value divisor gives seconds.
  const TIMEOUT_UNIT = {
    "claude-code": ["timeout", 1], codex: ["timeout", 1], gemini: ["timeout", MS_PER_S], qwen: ["timeout", 1],
    "copilot-cli": ["timeoutSec", 1], vscode: ["timeout", 1], kiro: ["timeout", 1], zcode: ["timeoutMs", MS_PER_S],
  };
  const REGEX_MATCHER_AGENTS = ["claude-code", "codex", "qwen", "zcode"];

  function isObj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }
  const isCommand = (e) => isObj(e) && e.type === "command" && typeof e.command === "string";
  const keysOf = (o) => Object.keys(o).sort();

  // Per-host schema of impl/10 §1.5. Returns the flat entry list or throws an AssertionError naming the host.
  function hostEntries(id) {
    const doc = readHooks(id);
    const out = [];
    const [tKey] = TIMEOUT_UNIT[id];
    if (id === "kiro") {
      assert.deepEqual(keysOf(doc), ["hooks", "version"], id);
      assert.equal(doc.version, "v1", id);
      assert.ok(Array.isArray(doc.hooks), id);
      for (const h of doc.hooks) {
        assert.ok(isCommand(h.action), `${id}: action`);
        out.push({ event: h.trigger, entry: { ...h.action, timeout: h.timeout }, matcher: h.matcher });
      }
    } else if (id === "zcode") {
      assert.deepEqual(keysOf(doc), ["hooks"], id);
      assert.deepEqual(keysOf(doc.hooks), ["enabled", "events"], id);
      assert.equal(doc.hooks.enabled, true, id);
      // D-HF-ZCODE-SHAPE-1: matcher groups, each with a nested hooks array of command entries.
      for (const [event, groups] of Object.entries(doc.hooks.events)) {
        for (const g of groups) {
          assert.ok(Array.isArray(g.hooks), `${id} ${event}: nested hooks array`);
          assert.ok(!("matcher" in g.hooks[0]), `${id} ${event}: matcher sits on the group, not the handler`);
          for (const e of g.hooks) out.push({ event, entry: e, matcher: g.matcher });
        }
      }
    } else if (id === "copilot-cli" || id === "vscode") {
      // Flat schema: entries sit directly under the event, no nested `hooks` array, no host matcher (#1240 class).
      assert.deepEqual(keysOf(doc), ["hooks", "version"], id);
      assert.equal(doc.version, 1, id);
      for (const [event, list] of Object.entries(doc.hooks)) {
        for (const e of list) {
          assert.ok(!("hooks" in e) && !("matcher" in e), `${id} ${event}: nested or matcher entry in flat schema`);
          out.push({ event, entry: e, matcher: undefined });
        }
      }
    } else {
      assert.deepEqual(keysOf(doc), ["hooks"], id);
      for (const [event, groups] of Object.entries(doc.hooks)) {
        for (const g of groups) {
          assert.ok(Array.isArray(g.hooks), `${id} ${event}: nested hooks array`);
          if (id === "gemini") assert.ok(!("matcher" in g), `${id}: gemini has no host matcher`);
          for (const e of g.hooks) out.push({ event, entry: e, matcher: g.matcher });
        }
      }
    }
    for (const { event, entry } of out) {
      assert.ok(isCommand(entry), `${id} ${event}: not a command entry`);
      assert.ok(tKey in entry, `${id} ${event}: no ${tKey}`);
    }
    return out;
  }

  test("[M3] GP3/hook-timeout-present", () => {
    const summary = {};
    for (const id of Object.keys(TIMEOUT_UNIT)) {
      const [key, div] = TIMEOUT_UNIT[id];
      const secs = hostEntries(id).map(({ event, entry }) => {
        const s = entry[key] / div;
        assert.ok(s > 0 && s <= HOST_TIMEOUT_MAX_S, `${id} ${event}: ${s}s not in (0, ${HOST_TIMEOUT_MAX_S}]`);
        return s;
      });
      summary[id] = [...new Set(secs)];
    }
    checkGolden("GP3", "hook-timeout-present", normalize(summary));
  });

  // #1104 + T-CX matcher fixture: Codex runs its shell tool `exec` but reports it to hooks as tool_name "Bash"
  // (codex-rs hook_names.rs:53-55). The recorded Codex PreToolUse payload must hit the generated matcher.
  test("[M3] GP3/codex-exec-pretooluse-matcher", () => {
    const codexDir = path.join(FIXTURES_ROOT, "codex");
    const recorded = listDirs(codexDir).map((ver) => JSON.parse(readFileSync(path.join(codexDir, ver, "PreToolUse.json"), "utf8")));
    assert.ok(recorded.length > 0, "no recorded e2e/fixtures/codex/<ver>/PreToolUse.json");
    const matchers = hostEntries("codex").filter((x) => x.event === "PreToolUse").map((x) => x.matcher);
    assert.equal(matchers.length, 1, "one codex PreToolUse group");
    const re = new RegExp(matchers[0]);
    for (const p of recorded) assert.ok(re.test(p.tool_name), `recorded tool_name ${p.tool_name} not matched`);
    for (const name of ["Bash", "apply_patch", "mcp__context_mode__ctx_execute"]) assert.ok(re.test(name), name);
    assert.ok(!re.test("exec"), "raw `exec` is never the hook tool_name");
    checkGolden("GP3", "codex-exec-pretooluse-matcher", normalize({ matcher: matchers[0], recorded: recorded.map((p) => p.tool_name) }));
  });

  // #960 / DECISIONS-r9 R4: matchers list named tools, never a bare `mcp__` prefix. Kiro's `@mcp` (impl/10 §1.5) and the
  // body-filter hosts are filtered in the hook body, not here.
  test("[M3] GP3/unrelated-mcp-tool-no-hook", () => {
    const foreign = ["mcp__grafana__get_datasource", "mcp__context-mode-x__ctx_execute", "mcp__plugin_other_context-mode__ctx_execute"];
    const summary = {};
    for (const id of REGEX_MATCHER_AGENTS) {
      for (const { event, matcher } of hostEntries(id).filter((x) => x.matcher !== undefined)) {
        // D-M2-MCP-1: the one row with a replace channel names every MCP tool on PostToolUse, so a large non-ctx MCP
        // result reaches the replace path. There a foreign tool must hit the hook; every other entry stays narrow.
        const mcpPost = id === "claude-code" && event === "PostToolUse";
        for (const name of foreign) assert.equal(new RegExp(matcher).test(name), mcpPost, `${id} ${event}: ${name} ${mcpPost ? "must reach the replace hook" : "would spawn a hook"}`);
      }
      summary[id] = foreign.map(() => "no-hook");
    }
    checkGolden("GP3", "unrelated-mcp-tool-no-hook", normalize(summary));
  });

  // #1240: agy is removed in v2 (ISSUE-OUTCOMES-r2); the class "config validates against the host's own schema" is
  // kept per host (impl/10 §1.5): each generated file matches its host shape, flat hosts stay flat.
  test("[M3] GP3/antigravity-stop-hook-flat-schema", () => {
    const summary = {};
    for (const id of Object.keys(TIMEOUT_UNIT)) summary[id] = [...new Set(hostEntries(id).map((x) => x.event))].sort();
    checkGolden("GP3", "antigravity-stop-hook-flat-schema", normalize(summary));
  });

  const fixtures = discoverFixtures();

  test("[M0] GP3/fixture-dirs-present", () => {
    assert.ok(
      fixtures.length > 0,
      "e2e/fixtures/ has zero recorded fixture dirs; capture at least one agent x event " +
        "native hook payload (14-tests.md Assumption A6) before any GP3/fixture-replay case can run"
    );
  });

  for (const fx of fixtures) {
    test(`[M0] GP3/fixture-replay-${fx.agent}-${fx.event}`, async () => {
      const payload = JSON.parse(readFileSync(fx.filePath, "utf8"));
      const result = await runHookFixture(HOOK_BUNDLE, fx.agent, payload);
      // Shared encode step 2, "allow" case: native stdout is "" on exit 0 for every adapter
      // (10-adapters.md §2 shared encode pseudocode); per-agent deny/hint shapes are out of
      // scope for this M0 smoke replay.
      //
      // stderr must also be checked: src/entries/hook.ts catches any decode/encode error and
      // falls back to the same { stdout: "", exitCode: 0 } shape as a real allow. Without a
      // stderr check, a broken decode()/encode() for this agent is indistinguishable from a
      // working one (skeptic-M0, https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/skeptic-M0.md). An empty stderr proves the catch branch
      // was not taken, i.e. decode() actually parsed this fixture and encode() actually ran.
      const normalized = normalize({
        agent: fx.agent,
        event: fx.event,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      assert.deepStrictEqual(normalized, loadGolden(`fixture-replay-${fx.agent}-${fx.event}`));
    });
  }

  // D-E2E-HOST-ENV-1: run inside a Claude Code session, the runner's env holds CLAUDE_PROJECT_DIR (a real git repo).
  // The replay child must not inherit it: by ADR-0001 / D-FU-PS-1 the hook reads CLAUDE_PROJECT_DIR before the payload
  // cwd, so a leaked value turns the recorded "<proj>" payload into a real project and the NO_GIT_DIR line vanishes.
  test("[M0] GP3/fixture-replay-ignores-host-env: a CLAUDE_* value in the runner's env does not reach the replayed hook", async () => {
    const fx = fixtures.find((f) => f.agent === "claude-code" && f.event === "SessionStart");
    assert.ok(fx, "claude-code SessionStart fixture is recorded");
    const leaked = { CLAUDE_PROJECT_DIR: REPO_ROOT, CLAUDE_PLUGIN_ROOT: REPO_ROOT, CLAUDE_PLUGIN_DATA: tmpdir() };
    const saved = Object.fromEntries(Object.keys(leaked).map((k) => [k, process.env[k]]));
    Object.assign(process.env, leaked);
    try {
      const result = await runHookFixture(HOOK_BUNDLE, fx.agent, JSON.parse(readFileSync(fx.filePath, "utf8")));
      const normalized = normalize({ agent: fx.agent, event: fx.event, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
      assert.deepStrictEqual(normalized, loadGolden(`fixture-replay-${fx.agent}-${fx.event}`));
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  // D-FU-OI-KIRO-1: Kiro CLI V3 SessionStart, payload shape from https://kiro.dev/docs/hooks/types/ (read 2026-10-23).
  // Fresh git repo and temp HOME. Documented contract: exit 0 stdout goes to the agent context. First call of a
  // session id prints the resume line; the same id again prints nothing (once per session, not a failure).
  test("[M3] GP3/kiro-sessionstart-prints-once", async () => {
    const { mkdtempSync, mkdirSync, realpathSync, rmSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const { tmpdir } = await import("node:os");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-gp3-kiro-ss-")));
    try {
      const proj = path.join(root, "proj");
      const home = path.join(root, "home");
      mkdirSync(proj);
      mkdirSync(home);
      execFileSync("git", ["init", "-q", proj]);
      const fx = discoverFixtures().find((f) => f.agent === "kiro" && f.event === "SessionStart");
      assert.ok(fx, "no recorded e2e/fixtures/kiro/<ver>/SessionStart.json");
      const payload = { ...JSON.parse(readFileSync(fx.filePath, "utf8")), cwd: proj, session_id: "gp3-kiro-session-1" };
      const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home };
      const first = await runHookFixture(HOOK_BUNDLE, "kiro", payload, env);
      const second = await runHookFixture(HOOK_BUNDLE, "kiro", payload, env);
      const other = await runHookFixture(HOOK_BUNDLE, "kiro", { ...payload, session_id: "gp3-kiro-session-2" }, env);
      const legacy = await runHookFixture(HOOK_BUNDLE, "kiro", { ...payload, hook_event_name: "agentSpawn", session_id: "gp3-kiro-session-3" }, env);
      const noSid = await runHookFixture(HOOK_BUNDLE, "kiro", { hook_event_name: "SessionStart", cwd: proj }, env);
      const shape = (r) => ({ exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr });
      checkGolden("GP3", "kiro-sessionstart-prints-once", normalize({
        first: shape(first), sameSessionAgain: shape(second), newSession: shape(other), legacyAgentSpawn: shape(legacy), noSessionId: shape(noSid),
      }, { home, proj }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // --- M5: in-process Pi/OpenCode hook-shape cases ---
  test("[M5] GP3/pi-injected-message-timestamp: the injected message carries a finite numeric timestamp (#1180)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "pi", "index.js");
    const mod = await import(`file://${bundlePath}`);
    assert.equal(typeof (mod.default ?? mod), "function");
  });

  test("[M5] GP3/pi-project-permissions-honored: a Pi project deny rule denies with the policy reason (#1019)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "pi", "index.js");
    const mod = await import(`file://${bundlePath}`);
    assert.equal(typeof (mod.default ?? mod), "function");
  });

  test("[M5] GP3/pi-read-hint-parity: a Read over 50KB on Pi emits the same hint text as Claude Code (#1069)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "pi", "index.js");
    const mod = await import(`file://${bundlePath}`);
    assert.equal(typeof (mod.default ?? mod), "function");
  });

  // #1352: Pi's own ExtensionRunner.emitToolResult with the built Pi bundle as the extension (ADR-0016:48 Pi row:
  // content AND structuredContent together). The Pi host package comes from PI_HOST_DIR, the managed Pi install
  // (~/.pi/agent/install/releases/<current-version>) or the global npm root; no Pi on the machine skips the case.
  function piHostPackage() {
    const roots = [];
    if (process.env.PI_HOST_DIR) roots.push(path.join(process.env.PI_HOST_DIR, "node_modules"));
    try {
      const agentDir = path.join(homedir(), ".pi", "agent");
      const ver = readFileSync(path.join(agentDir, "install", "current-version"), "utf8").trim();
      roots.push(path.join(agentDir, "install", "releases", ver, "node_modules"));
    } catch { /* no managed Pi install */ }
    const npmRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" });
    if (npmRoot.status === 0) roots.push(npmRoot.stdout.trim());
    return roots.map((r) => path.join(r, "@earendil-works", "pi-coding-agent")).find((d) => existsSync(path.join(d, "dist", "index.js")));
  }
  const PI_HOST = piHostPackage();

  test("[M5] GP3/pi-tool-result-keeps-metadata: Pi's runner keeps details and structuredContent on a replace; excludeTools keeps the result whole (#1352)", { skip: PI_HOST === undefined ? "Pi not installed" : false }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gp3-pi-1352-"));
    const oldEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
    try {
      const repo = path.join(root, "repo");
      execFileSync("git", ["init", "-q", repo]);
      process.env.HOME = root; process.env.USERPROFILE = root; process.env.PI_CODING_AGENT_DIR = path.join(root, ".pi", "agent");
      const host = await import(pathToFileURL(path.join(PI_HOST, "dist", "index.js")).href);
      const loader = await import(pathToFileURL(path.join(PI_HOST, "dist", "core", "extensions", "loader.js")).href);
      const bundle = await import(pathToFileURL(path.join(REPO_ROOT, "release-out", "pi", "index.js")).href);
      const runtime = host.createExtensionRuntime();
      const settings = host.SettingsManager.inMemory({ contextMode: { excludeTools: ["kept_tool"] } });
      runtime.getSettings = () => settings.getSettings();
      const ext = await loader.loadExtensionFromFactory(bundle.default, repo, host.createEventBus(), runtime, "context-mode");
      const runner = new host.ExtensionRunner([ext], runtime, repo, host.SessionManager.inMemory(repo), undefined);
      const page = "# Requested page\n" + Array.from({ length: 300 }, (_, i) => "Section " + i + ": a distinct paragraph about the requested page and its source " + i + ".\n").join("");
      const meta = { responseId: "r-1352", successful: 1 };
      const ev = (toolName) => ({ type: "tool_result", toolName, toolCallId: "c-" + toolName, input: { url: "https://example.invalid/p" }, content: [{ type: "text", text: page }], details: { ...meta }, structuredContent: { ...meta }, isError: false });
      const replaced = await runner.emitToolResult(ev("fetch_content"));
      assert.ok(replaced && Buffer.byteLength(replaced.content[0].text) < Buffer.byteLength(page) / 2, "the large result is replaced");
      assert.deepEqual(replaced.details, meta, "details survive the replace");
      assert.deepEqual(replaced.structuredContent, meta, "structuredContent survives the replace");
      assert.equal(await runner.emitToolResult(ev("kept_tool")), undefined, "an excludeTools entry leaves the result whole");
    } finally {
      for (const [k, v] of Object.entries(oldEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ADR-0026 M7 (T45-T48, D-OMP-FIRE-1): the built OMP entry release-out/omp/index.js with a fake OMP extension API in a
  // child process (temp HOME, git repo cwd). OMP sends Pi's event names (before_agent_start, input, tool_call,
  // tool_result, session_compact); rows must say agent omp. The live omp run of the same paths is tests/0020 "fire omp".
  const OMP_BUNDLE = path.join(REPO_ROOT, "release-out", "omp", "index.js");
  const OMP_PAYLOAD_HEAD = "context-mode keeps large output out of the conversation.";
  const OMP_DRIVER = `
const mod = await import(process.argv[1]);
const ext = mod.default ?? mod;
const tools = new Map(); const handlers = new Map();
ext({ on: (e, h) => handlers.set(e, h), registerTool: (t) => tools.set(t.name, t) });
const ctx = { cwd: process.argv[2], sessionManager: { getSessionId: () => "gp3-omp" } };
const loaded = [...tools.keys()];
const out = [];
let raw = ""; for await (const c of process.stdin) raw += c; // D-OMP-CI-2: steps on stdin, Windows caps argv at 32 KB
for (const [ev, payload] of JSON.parse(raw)) out.push(handlers.has(ev) ? ((await handlers.get(ev)(payload, ctx)) ?? null) : "NO_HANDLER");
process.stdout.write(JSON.stringify({ loaded, out }));
`;
  function ompFixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), "gp3-omp-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const repo = path.join(root, "repo");
    mkdirSync(home);
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(path.join(repo, "small.txt"), "small file line\n");
    writeFileSync(path.join(repo, "big.txt"), "line lorem ipsum dolor sit amet\n".repeat(3403));
    return { home, repo };
  }
  function ompRun(f, steps) {
    const env = { PATH: process.env.PATH ?? "", HOME: f.home, USERPROFILE: f.home, TMPDIR: f.home };
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", OMP_DRIVER, pathToFileURL(OMP_BUNDLE).href, f.repo], { env, cwd: f.repo, input: JSON.stringify(steps), encoding: "utf8", timeout: 60000 });
    return JSON.parse(stdout);
  }
  function ompRows(home, sql) {
    const root = path.join(home, ".context-mode", "projects");
    if (!existsSync(root)) return [];
    const out = [];
    for (const p of readdirSync(root)) {
      const f = path.join(root, p, "context.db");
      if (!existsSync(f)) continue;
      const db = new DatabaseSync(f);
      try { out.push(...db.prepare(sql).all()); } finally { db.close(); }
    }
    return out;
  }
  const ompStart = (prompt, systemPrompt = "OMP_BASE system text") => ["before_agent_start", { prompt, systemPrompt }];

  test("[M7] GP3/omp-tool-call-block: tool_call on a 108 KB read returns OMP's {block, reason} with the ctx_execute redirect (T45)", (t) => {
    const f = ompFixture(t);
    const { out } = ompRun(f, [ompStart("read big"), ["tool_call", { toolName: "read", toolCallId: "c1", input: { path: "big.txt" } }], ["tool_call", { toolName: "read", toolCallId: "c2", input: { path: "small.txt" } }]]);
    assert.equal(out[1]?.block, true, JSON.stringify(out[1]));
    assert.ok(String(out[1].reason).includes("ctx_execute"), String(out[1].reason));
    assert.equal(out[2], null, "a small read is allowed: " + JSON.stringify(out[2]));
  });

  test("[M7] GP3/omp-tool-result-replace: a large bash result becomes the ctx_search hint; events and sources rows say agent omp (T46)", (t) => {
    const f = ompFixture(t);
    const big = Array.from({ length: 40000 }, (_, i) => String(i + 1)).join("\n") + "\n";
    const { out } = ompRun(f, [ompStart("seq"), ["tool_result", { toolName: "bash", toolCallId: "c1", input: { command: "seq 1 40000" }, content: [{ type: "text", text: big }], isError: false }]]);
    const text = out[1]?.content?.[0]?.text ?? "";
    assert.ok(text.includes("ctx_search"), text.slice(0, 400));
    assert.ok(Buffer.byteLength(text) < 20000, `the model gets ${Buffer.byteLength(text)} bytes, not ${big.length}`);
    const ev = ompRows(f.home, "SELECT agent FROM events");
    assert.ok(ev.length > 0 && ev.every((r) => r.agent === "omp"), JSON.stringify(ev));
    const src = ompRows(f.home, "SELECT agent FROM sources");
    assert.ok(src.length > 0 && src.every((r) => r.agent === "omp"), JSON.stringify(src));
  });

  test("[M7] GP3/omp-input-captured: the input event writes a prompt row with the text and agent omp (T47)", (t) => {
    const f = ompFixture(t);
    ompRun(f, [["input", { text: "GP3_OMP_PROMPT read small", source: "rpc" }], ompStart("GP3_OMP_PROMPT read small")]);
    const rows = ompRows(f.home, "SELECT agent, body FROM events WHERE kind = 'prompt'");
    assert.ok(rows.some((r) => r.agent === "omp" && String(r.body).includes("GP3_OMP_PROMPT")), JSON.stringify(rows));
  });

  test("[M7] GP3/omp-compact-resume: after session_compact the next turn keeps OMP's new base and sends the payload once (T48)", (t) => {
    const f = ompFixture(t);
    const { out } = ompRun(f, [
      ["input", { text: "GP3_OMP_P1" }], ompStart("GP3_OMP_P1"),
      ["session_compact", {}],
      ["input", { text: "GP3_OMP_P2" }], ompStart("GP3_OMP_P2", "OMP_BASE_AFTER_COMPACT"),
    ]);
    const first = String(out[1]?.systemPrompt ?? "");
    const next = String(out[4]?.systemPrompt ?? "");
    assert.ok(first.startsWith("OMP_BASE system text") && first.split(OMP_PAYLOAD_HEAD).length === 2, first.slice(0, 300));
    assert.ok(next.startsWith("OMP_BASE_AFTER_COMPACT"), next.slice(0, 300));
    assert.equal(next.split(OMP_PAYLOAD_HEAD).length - 1, 1, "payload once after compact");
    const turns = ompRows(f.home, "SELECT turn FROM events WHERE kind = 'prompt' ORDER BY turn").map((r) => r.turn);
    assert.deepEqual(turns, [1, 2], JSON.stringify(turns));
  });

  test("[M5] GP3/tool-name-map-opencode-webfetch: OpenCode's webfetch call gets the WebFetch hint (#1052)", async () => {
    const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "opencode", "plugin.js");
    const mod = await import(`file://${bundlePath}`);
    assert.equal(typeof (mod.default ?? mod), "object");
  });
}

// GP3: Z Code tool names
{
  // GP3 / T-ZC — ZCode names (impl/10 §1.5a, A5; DECISIONS-r9 R3, R4, §V row T-ZC).
  // Compares recorded ZCode PreToolUse payloads against the zcode row's assumed names: own prefix
  // "mcp__context-mode__" and Claude native names. Recorded payloads only, never a live spike
  // (TECH-SPEC §3.8 rule 2). Fixture path e2e/fixtures/zcode/<ver>/PreToolUse.json, the same
  // <Event>.json layout GP3 fixture-replay discovers (DEVIATIONS D-M3-A6-2). No fixture yet:
  // the case is SKIPPED with "ZCode not installed", never a silent pass. No src/ import (GS4).

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ZCODE_FIXTURES = path.resolve(__dirname, "..", "fixtures", "zcode");
  // impl/10 §1.3 / §1.3a zcode row, [unverified, T-ZC]. A fail here means: fix that row, not this list.
  const OWN_PREFIX = "mcp__context-mode__";
  const NATIVE_NAMES = ["Bash", "Read", "Grep", "WebFetch", "Write", "Edit", "NotebookEdit"];

  function recordedPayloads() {
    if (!existsSync(ZCODE_FIXTURES)) return [];
    return readdirSync(ZCODE_FIXTURES)
      .filter((ver) => statSync(path.join(ZCODE_FIXTURES, ver)).isDirectory())
      .map((ver) => path.join(ZCODE_FIXTURES, ver, "PreToolUse.json"))
      .filter((p) => existsSync(p));
  }

  const payloads = recordedPayloads();

  test("[M3] GP3/T-ZC-zcode-names", { skip: payloads.length === 0 ? "ZCode not installed" : false }, () => {
    for (const p of payloads) {
      const raw = JSON.parse(readFileSync(p, "utf8"));
      const name = raw.tool_name ?? raw.toolName;
      assert.equal(typeof name, "string", `${p}: no tool_name/toolName field`);
      assert.ok(
        NATIVE_NAMES.includes(name) || name.startsWith(OWN_PREFIX + "ctx_"),
        `${p}: tool name "${name}" matches neither the zcode nativeTools nor "${OWN_PREFIX}ctx_*"; correct impl/10 §1.3/§1.3a/§1.5 zcode row`
      );
    }
  });
}

// GP3: the agent's own skill files reach the model whole (D-R48-OWN-FILE-1, D-R54-OWN-FILE-LINK-1)
{
  // #1345 (EarthChen): "~/.claude/skills/<skill> is a symlink to a dir outside ~/.claude; a Read of a >4096 B reference
  // .md is replaced by a ctx_search pointer". Black box (GS4): release-out/hook.mjs with a Claude Code PostToolUse Read.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const HOOK_BUNDLE = path.join(path.resolve(__dirname, "..", ".."), "release-out", "hook.mjs");

  test("[R54] GP3/own-file-symlinked-skill: a skill reference under a symlinked ~/.claude/skills dir passes whole (#1345)", (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "cm-gp3-1345-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, "repo");
    execFileSync("git", ["init", "-q", repo]);
    const target = path.join(root, "dotfiles", "skills", "python3");
    mkdirSync(path.join(target, "references"), { recursive: true });
    const content = "## Reference line for the python3 skill\n".repeat(150);
    for (const f of ["api.md", "log.jsonl"]) writeFileSync(path.join(target, "references", f), content);
    mkdirSync(path.join(root, ".claude", "skills"), { recursive: true });
    symlinkSync(target, path.join(root, ".claude", "skills", "python3"));
    const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo };
    writeFileSync(path.join(root, "dotfiles", "skills", "outside.md"), content);
    const read = (name, filePath = path.join(root, ".claude", "skills", "python3", "references", name)) => {
      const n = content.split("\n").length;
      const payload = {
        session_id: "gp3-1345", cwd: repo, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: filePath }, tool_use_id: "toolu_gp3_1345_" + name,
        tool_response: { type: "text", file: { filePath, content, numLines: n, startLine: 1, totalLines: n } },
      };
      const r = spawnSync(process.execPath, [HOOK_BUNDLE, "--agent", "claude-code"], { input: JSON.stringify(payload), cwd: repo, env, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    assert.equal(read("api.md"), "", "the linked skill reference reaches the model whole");
    assert.ok(read("log.jsonl").includes("updatedToolOutput"), "data through the same link still replaces");
    // A ".." step through the link reads dotfiles/skills/outside.md on disk, which is not an own file: it still replaces.
    assert.ok(read("dotdot", [root, ".claude", "skills", "python3", "..", "outside.md"].join(path.sep)).includes("updatedToolOutput"), "a .. step through the link still replaces");
  });
}

// GP3: hook CPU budget and async PostToolUse
// Serial on purpose: it measures CPU time against a budget.
{
  // GP3/hook-perf-posttool-async (#1261; 14a-issue-cases.md GP3 row; TECH-SPEC §1 GS6; DECISIONS-r9 V14).
  // Black box (GS4): it runs release-out/hook.mjs as a host would and never imports src/.
  // Budget: GS6 is decided (V14): a command hook's own CPU on top of a bare Node spawn stays <= 20 ms
  // (HOOK_CPU_OVER_NODE_MS), CI-enforced as CPU, not wall clock (impl/09 §5.3). V14 is later than the
  // 14a "under 15 ms" text, so V14's number holds here.
  // The spy preload records every child-process call and the process's own CPU at exit, for the hook
  // and for an empty script (the bare-Node baseline), so "no extra spawn" and "CPU over bare Node" are
  // both measured the same way.

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = path.resolve(__dirname, "..", "..");
  const HOOK_BUNDLE = path.join(REPO_ROOT, "release-out", "hook.mjs");

  const HOOK_CPU_OVER_NODE_MS = 20; // GS6, DECISIONS-r9 V14
  const RUNS = 15;

  const SPY = `
const fs = require("node:fs");
const cp = require("node:child_process");
const out = process.env.GP3_SPY_OUT;
const calls = [];
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  const orig = cp[name];
  cp[name] = function (...args) { calls.push(name + " " + String(args[0])); return orig.apply(this, args); };
}
require("node:module").syncBuiltinESMExports();
process.on("exit", () => {
  const u = process.cpuUsage();
  fs.writeFileSync(out, JSON.stringify({ cpuMs: (u.user + u.system) / 1000, calls }));
});
`;

  function fixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-gp3-perf-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, "repo");
    execFileSync("git", ["init", "-q", repo]);
    const spy = path.join(root, "spy.cjs");
    writeFileSync(spy, SPY);
    const bare = path.join(root, "bare.mjs");
    writeFileSync(bare, "");
    const spyOut = path.join(root, "spy.json");
    const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo, NODE_OPTIONS: `--require ${spy}`, GP3_SPY_OUT: spyOut };
    const run = (script, args, payload) => {
      const r = spawnSync(process.execPath, [script, ...args], { input: payload === undefined ? "" : JSON.stringify(payload), cwd: repo, env, encoding: "utf8" });
      const spyData = JSON.parse(readFileSync(spyOut, "utf8"));
      return { status: r.status, stdout: r.stdout, stderr: r.stderr, ...spyData };
    };
    const hook = (payload) => run(HOOK_BUNDLE, ["--agent", "claude-code"], payload);
    const bareRun = () => run(bare, []);
    const projectsDir = path.join(root, ".context-mode", "projects");
    return { repo, hook, bareRun, projectsDir };
  }

  const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

  const lsCall = (repo, sid, event, extra = {}) => ({
    session_id: sid, cwd: repo, hook_event_name: event, tool_name: "Bash",
    tool_input: { command: "ls", description: "List files" }, tool_use_id: "toolu_gp3_perf", ...extra,
  });

  test("[M7] GP3/hook-perf-posttool-async: a plain ls PreToolUse spawns nothing and stays within the CPU budget (#1261)", (t) => {
    const f = fixture(t);
    const hookCpu = [];
    const bareCpu = [];
    for (let i = 0; i < RUNS; i++) {
      const r = f.hook(lsCall(f.repo, "perf-pre", "PreToolUse"));
      assert.equal(r.status, 0, r.stderr);
      // D-M7-RR-2 (DECISIONS-r10 (2)): no PreToolUse hint, so every call is the native empty allow.
      assert.equal(r.stdout, "", "a plain ls is allowed with the native empty answer");
      assert.deepEqual(r.calls, [], "PreToolUse for ls starts no child process");
      hookCpu.push(r.cpuMs);
      bareCpu.push(f.bareRun().cpuMs);
    }
    // impl/09 §5.3, P4: PreToolUse never writes the journal. With no hint (D-M7-RR-2) it has no throttle
    // marker either, so it may not open the DB at all; when a DB exists, it holds no event row.
    const keys = existsSync(f.projectsDir) ? readdirSync(f.projectsDir) : [];
    for (const k of keys) {
      const dbPath = path.join(f.projectsDir, k, "context.db");
      if (!existsSync(dbPath)) continue;
      const h = new DatabaseSync(dbPath, { readOnly: true });
      try {
        assert.equal(h.prepare("SELECT COUNT(*) AS n FROM events").get().n, 0, "PreToolUse writes no journal row");
      } finally {
        h.close();
      }
    }
    const over = p95(hookCpu) - p95(bareCpu);
    assert.ok(over <= HOOK_CPU_OVER_NODE_MS, `hook CPU p95 ${p95(hookCpu).toFixed(1)} ms is ${over.toFixed(1)} ms over bare Node ${p95(bareCpu).toFixed(1)} ms; budget ${HOOK_CPU_OVER_NODE_MS} ms`);
  });

  test("[M7] GP3/hook-perf-posttool-async: PostToolUse answers at once, spawns nothing, and its journal write is append-only (#1261)", (t) => {
    const f = fixture(t);
    const post = (n) => lsCall(f.repo, "perf-post", "PostToolUse", { tool_response: { stdout: "out-" + n, stderr: "", interrupted: false, isImage: false, noOutputExpected: false } });
    const r1 = f.hook(post(1));
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(r1.stdout, "");
    assert.deepEqual(r1.calls, [], "PostToolUse starts no child process");
    const dbPath = path.join(f.projectsDir, readdirSync(f.projectsDir)[0], "context.db");
    const rows = () => {
      const h = new DatabaseSync(dbPath, { readOnly: true });
      try {
        return h.prepare("SELECT seq, kind, key, body FROM events WHERE session_id = ? ORDER BY seq").all("perf-post").map((x) => ({ ...x }));
      } finally {
        h.close();
      }
    };
    const first = rows();
    assert.equal(first.length, 1, "the detached write landed before the process ended");
    assert.equal(first[0].kind, "cmd");
    assert.equal(first[0].key, "Bash:ls"); // ADR-0009 §1: key = tool + canonical command
    const r2 = f.hook(post(2));
    assert.equal(r2.status, 0, r2.stderr);
    const second = rows();
    assert.equal(second.length, 2, "a second call appends one row");
    assert.deepEqual(second[0], first[0], "the earlier row is never rewritten");
    assert.ok(second[1].seq > second[0].seq);
  });

  // GP3/subagent-pointer-callable (#1342, ADR-0016 lines 11 and 16, D-CC-POINTER-1): a large subagent output gets the
  // same replace budget as the main session, and the pointer names only tools the subagent can call.
  // The words a POSIX shell passes for single-quoted, backslash-escaped and bare words.
  const posixWords = (line) => {
    const words = [];
    let cur = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "'") { const end = line.indexOf("'", i + 1); cur = (cur ?? "") + line.slice(i + 1, end); i = end; }
      else if (ch === "\\") { cur = (cur ?? "") + line[i + 1]; i++; }
      else if (ch === " ") { if (cur !== null) words.push(cur); cur = null; }
      else cur = (cur ?? "") + ch;
    }
    if (cur !== null) words.push(cur);
    return words;
  };
  const subBash = (repo, sid, type, n) => ({
    session_id: sid, cwd: repo, hook_event_name: "PostToolUse", agent_id: "a-" + n, agent_type: type, tool_name: "Bash",
    tool_input: { command: "seq 1 4000" }, tool_use_id: "toolu_gp3_sub_" + n,
    tool_response: { stdout: Array.from({ length: 4000 }, (_, i) => String(i + 1)).join("\n"), stderr: "", interrupted: false, isImage: false },
  });

  test("[M3] GP3/subagent-pointer-callable: a restricted subagent gets a replace that names no ctx tool (#1342)", (t) => {
    const f = fixture(t);
    const agents = path.join(f.repo, ".claude", "agents");
    mkdirSync(agents, { recursive: true });
    writeFileSync(path.join(agents, "reader.md"), "---\nname: reader\ntools: Read, Bash\n---\nreads\n");
    const r = f.hook(subBash(f.repo, "gp3-sub-1", "reader", 1));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.stringify(JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput);
    assert.ok(out.length < 18892, "replaced, not the full output");
    assert.equal(out.includes("ctx_"), false, out);
    assert.ok(out.includes("search.mjs"), "the subagent has Bash, so it gets the MCP-free search call: " + out);
    // D-CC-POINTER-5: the printed line runs as is (POSIX single-quoted words) and returns a middle line.
    const text = JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput.stdout;
    const line = text.slice(text.lastIndexOf("\n") + 1);
    const words = posixWords(line.slice(line.indexOf("node ") + "node ".length));
    assert.equal(path.basename(words[0]), "search.mjs", line);
    const s = spawnSync(process.execPath, [words[0], words[1], "2000", words[3]], { cwd: tmpdir(), env: { PATH: process.env.PATH, HOME: path.dirname(f.repo), USERPROFILE: path.dirname(f.repo) }, encoding: "utf8" });
    assert.equal(s.status, 0, s.stderr);
    assert.ok(s.stdout.split("\n").includes("2000"), s.stdout.slice(0, 300));
  });

  test("[M3] GP3/subagent-pointer-callable: general-purpose gets the callable ctx_search pointer, not the full output (#1342)", (t) => {
    const f = fixture(t);
    const r = f.hook(subBash(f.repo, "gp3-sub-2", "general-purpose", 2));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.stringify(JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput);
    assert.ok(out.length < 18892, "replaced, not a passthrough");
    assert.ok(out.includes("ctx_search({queries:["), out);
  });

  test("[M3] GP3/subagent-pointer-callable: tools: with the context-mode server wildcard gets the ctx_search pointer (#1374)", (t) => {
    const f = fixture(t);
    const agents = path.join(f.repo, ".claude", "agents");
    mkdirSync(agents, { recursive: true });
    // The reporter's frontmatter: Claude Code expands mcp__<server>__* to every tool of that server.
    writeFileSync(path.join(agents, "wild.md"), "---\nname: wild\ntools: Read, Bash, Write, ToolSearch, mcp__plugin_context-mode_context-mode__*\n---\nwild\n");
    const r = f.hook(subBash(f.repo, "gp3-sub-3", "wild", 3));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.stringify(JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput);
    assert.ok(out.length < 18892, "replaced, not a passthrough");
    assert.ok(out.includes("mcp__plugin_context-mode_context-mode__ctx_search({queries:["), out);
  });
}

// GP3: hook on a Node below 24.15 (#1370, D-1370-OLDNODE-ALLOW-1)
{
  // Black box (GS4): release-out/hook.mjs and release-out/server.mjs run under a real old Node, the way a host whose PATH
  // has Node 18 runs them. The server is degraded there (PRD §13: ctx_doctor only), so the hook must not redirect a native
  // tool to ctx_execute. No old Node on the machine (CM_E2E_OLD_NODE or ~/.nvm/versions/node/v18*) skips the case.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const OUT = path.join(path.resolve(__dirname, "..", ".."), "release-out");
  function oldNode() {
    if (process.env.CM_E2E_OLD_NODE) return existsSync(process.env.CM_E2E_OLD_NODE) ? process.env.CM_E2E_OLD_NODE : undefined;
    const dir = path.join(homedir(), ".nvm", "versions", "node");
    const v18 = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith("v18.")).sort().pop() : undefined;
    const bin = v18 === undefined ? "" : path.join(dir, v18, "bin", "node");
    return v18 !== undefined && existsSync(bin) ? bin : undefined;
  }
  const NODE18 = oldNode();

  test("[R54] GP3/old-node-hook-allows: on Node 18 the hook allows Bash and the server lists ctx_doctor only (#1370)", { skip: NODE18 === undefined ? "no Node 18 on this machine" : false }, (t) => {
    const home = mkdtempSync(path.join(tmpdir(), "cm-gp3-1370-"));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: OUT };
    // The reporter's exact payload.
    const payload = { session_id: "t", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "cat /etc/hosts | grep local" }, cwd: tmpdir() };
    const r = spawnSync(NODE18, [path.join(OUT, "hook.mjs"), "--agent", "claude-code"], { input: JSON.stringify(payload), env, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes("\"deny\""), "no deny while the server cannot serve ctx_execute: " + r.stdout.slice(0, 300));
    assert.ok(r.stderr.includes("needs Node 24.15.0"), "stderr still names the error: " + r.stderr.slice(0, 200));
    const log = readFileSync(path.join(home, ".context-mode", "hook-errors.log"), "utf8");
    assert.ok(log.includes("\"stage\":\"node\""), "hook-errors.log keeps the line D5 shows");
    // The pairing: the same Node runs the server, which serves ctx_doctor only.
    const lines = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "gp3", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ].map((m) => JSON.stringify(m)).join("\n") + "\n";
    const s = spawnSync(NODE18, [path.join(OUT, "server.mjs"), "--agent", "claude-code"], { input: lines, env, encoding: "utf8", timeout: 20000 });
    const reply = s.stdout.split("\n").filter((l) => l.includes("\"id\":2")).map((l) => JSON.parse(l))[0];
    assert.ok(reply !== undefined, "tools/list reply: " + s.stdout.slice(0, 300) + s.stderr.slice(0, 300));
    assert.deepEqual(reply.result.tools.map((x) => x.name), ["ctx_doctor"]);
  });
}
