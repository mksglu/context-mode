// tests/v2/0021-cache-safety.test.mjs
// Area: ADR-0021 (prompt cache safety): prefix determinism, Pi and OpenCode cache guards, cache usage analysis.
// One file per ADR area (ADR-0024).
import { describe, test, after, before } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseExecJson, requestsFromRollout, findBreaks, hitRatio, crossSessionRead, promptsFor } from "../../e2e/live/cache/codex.mjs";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import { TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { TOOLS } from "../../src/core/tools/registry.ts";
import { INSTRUCTIONS } from "../../src/entries/server.ts";
import { parseSession, analyzeSession, percentile, armOf, workloadOf, summarize } from "../../bench/cache/mine.mjs";
import * as opencodePlugin from "../../src/entries/opencode.ts";
import piExtension from "../../src/entries/pi.ts";

describe("ADR-0021 Codex cache usage analysis", { concurrency: CONC }, () => {
  // Codex cache-usage analysis (docs/v2/spikes/cache). Pure: no spawn, no network.
  // Codex reports input_tokens (which INCLUDES cached_input_tokens) and no cache write count, so the
  // definitions map as: cache_read = cached, cache_creation = input - cached, uncached "input" = 0.

  const ev = (o) => JSON.stringify(o);

  test("parseExecJson: thread id, one usage row per turn.completed, agent text kept", () => {
    const out = [
      ev({ type: "thread.started", thread_id: "t-1" }),
      ev({ type: "turn.started" }),
      ev({ type: "item.completed", item: { id: "i0", type: "agent_message", text: "ok" } }),
      ev({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, cache_write_input_tokens: 0, output_tokens: 5 } }),
    ].join("\n") + "\n";
    const r = parseExecJson(out);
    assert.equal(r.threadId, "t-1");
    assert.equal(r.turns.length, 1);
    assert.deepEqual(r.turns[0].usage, { input: 100, cached: 40, output: 5 });
    assert.equal(r.finalText, "ok");
  });

  test("parseExecJson: a line that is not JSON is an error, not skipped", () => {
    assert.throws(() => parseExecJson("not json\n"), (e) => e.message.includes("not JSON"));
  });

  test("hitRatio: cached / input for one usage row; 0 when input is 0", () => {
    assert.equal(hitRatio({ input: 200, cached: 150, output: 1 }), 0.75);
    assert.equal(hitRatio({ input: 0, cached: 0, output: 0 }), 0);
  });

  test("requestsFromRollout: token_usage_record rows in ordinal order with turn id", () => {
    const lines = [
      { ordinal: 20, type: "token_usage_record", payload: { turn_id: "a", usage: { input_tokens: 300, cached_input_tokens: 128, output_tokens: 4 } } },
      { ordinal: 3, type: "session_meta", payload: {} },
      { ordinal: 6, type: "token_usage_record", payload: { turn_id: "a", usage: { input_tokens: 200, cached_input_tokens: 0, output_tokens: 9 } } },
      { ordinal: 30, type: "token_usage_record", payload: { turn_id: "b", usage: { input_tokens: 500, cached_input_tokens: 256, output_tokens: 2 } } },
    ].map(ev).join("\n");
    assert.deepEqual(requestsFromRollout(lines), [
      { turnId: "a", input: 200, cached: 0, output: 9 },
      { turnId: "a", input: 300, cached: 128, output: 4 },
      { turnId: "b", input: 500, cached: 256, output: 2 },
    ]);
  });

  test("findBreaks: a break is old prefix written again: prev input - cached > 1024", () => {
    const reqs = [
      { turnId: "a", input: 10000, cached: 0, output: 10 },
      { turnId: "a", input: 12000, cached: 9984, output: 10 },   // prefix mostly read: no break
      { turnId: "b", input: 15000, cached: 4096, output: 10 },   // 12000 - 4096 = 7904 > 1024: break
      { turnId: "b", input: 15500, cached: 14976, output: 10 },  // 15000 - 14976 = 24: no break
    ];
    const b = findBreaks(reqs);
    assert.equal(b.length, 1);
    assert.deepEqual(b[0], { index: 2, turnId: "b", rewritten: 7904 });
  });

  test("findBreaks: exactly 1024 is not a break; the first request never is", () => {
    assert.deepEqual(findBreaks([{ turnId: "a", input: 5000, cached: 0, output: 1 }]), []);
    const r = [{ turnId: "a", input: 5000, cached: 0, output: 1 }, { turnId: "a", input: 6000, cached: 3976, output: 1 }];
    assert.deepEqual(findBreaks(r), []);
  });

  test("crossSessionRead: second session's first-request cached over first session's first-request input", () => {
    const a = [{ turnId: "a", input: 14000, cached: 0, output: 3 }];
    const b = [{ turnId: "b", input: 14100, cached: 13952, output: 3 }];
    const r = crossSessionRead(a, b);
    assert.equal(r.cachedB, 13952);
    assert.equal(r.prefixA, 14000);
    assert.ok(Math.abs(r.fraction - 13952 / 14000) < 1e-12);
  });


  test("promptsFor: 5 turns per arm; only the v2 arm names the ctx tools, off arm never does", () => {
    const off = promptsFor("off"), v2 = promptsFor("v2");
    assert.equal(off.length, 5);
    assert.equal(v2.length, 5);
    assert.ok(!off.some((p) => p.includes("ctx_")));
    assert.ok(v2[2].includes("ctx_index") && v2[2].includes("ctx_search"));
    assert.deepEqual(off.filter((_, i) => i !== 2), v2.filter((_, i) => i !== 2));
  });
});

  // serial: tests set process.env.HOME and CLAUDE_PROJECT_DIR
describe("ADR-0021 prefix determinism across starts", () => {
  // ADR-0021 rules 1 and 2 (OPEN-ITEMS C5). A cache hit needs the same prefix bytes, so:
  //  1. initialize and tools/list are byte-identical across 5 starts per agent, each start with a different
  //     cwd, TZ, store (HOME), locale and extra env; the server never emits notifications/tools/list_changed.
  //  2. Tool descriptions and instructions are the build-time literals (src/prompt/*.md bytes), and
  //     build/check-prompt-static.mjs finds no dynamic token in them (gate layer ci-checks).
  //  3. Pi and OpenCode system-prompt bytes are identical on every turn of one session.


  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SERVER = path.join(REPO, "src", "entries", "server.ts");
  const LINT = path.join(REPO, "build", "check-prompt-static.mjs");
  const STARTS = 5;
  const QUIET_MS = 400; // after tools/list, any list_changed the server would send arrives in this window
  const TZS = ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Europe/Istanbul", "Pacific/Chatham"];
  const LANGS = ["C", "en_US.UTF-8", "tr_TR.UTF-8", "ja_JP.UTF-8", "de_DE.UTF-8"];

  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-prefix-")));
  after(() => {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) { // D-M3-F-9: a kept DB handle blocks the delete on Windows; cleanup is best-effort there
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  });

  // Start i of agent a: its own HOME (store), cwd (git repo, plain dir or nested dir), TZ, locale and env.
  function startEnv(agent, i) {
    const dir = path.join(root, agent, String(i));
    const home = path.join(dir, "home");
    const cwd = path.join(dir, i % 3 === 0 ? "repo" : i % 3 === 1 ? "plain" : path.join("repo", "a", "b"));
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    if (i % 3 !== 1) execFileSync("git", ["init", "-q", path.join(dir, "repo")]);
    const env = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, HOME: home, USERPROFILE: home, TZ: TZS[i], LANG: LANGS[i], LC_ALL: LANGS[i] };
    env["CM_PREFIX_PROBE_" + i] = String(Date.now() + i);
    if (i % 2 === 1) env.CLAUDE_PROJECT_DIR = cwd;
    if (i >= 2) env.CLAUDE_CODE_SESSION_ID = "sess-" + agent + "-" + i;
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    return { cwd, env };
  }

  // One server start: initialize, initialized, tools/list. Returns the raw reply lines and every notification.
  function probe(agent, i) {
    const { cwd, env } = startEnv(agent, i);
    return new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [SERVER, "--agent", agent], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
      let buf = "";
      let stderr = "";
      const replies = new Map();
      const notes = [];
      const send = (m) => p.stdin.write(JSON.stringify(m) + "\n");
      const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`${agent}#${i}: no reply in 30 s; stderr: ${stderr}`)); }, 30_000);
      p.stderr.on("data", (d) => { stderr += d; });
      p.on("error", reject);
      p.on("close", () => { clearTimeout(timer); resolve({ init: replies.get(1), list: replies.get(2), notes, stderr }); });
      p.stdout.on("data", (d) => {
        buf += d;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line === "") continue;
          const msg = JSON.parse(line);
          if (msg.id === undefined) { notes.push(msg.method); continue; }
          replies.set(msg.id, line);
          if (msg.id === 1) {
            send({ jsonrpc: "2.0", method: "notifications/initialized" });
            send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
          } else if (msg.id === 2) {
            setTimeout(() => p.stdin.end(), QUIET_MS);
          }
        }
      });
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "prefix-probe-" + i, version: String(i) } } });
    });
  }

  for (const agent of AGENT_IDS) {
    test(`prefix: ${agent} initialize and tools/list are byte-identical across ${STARTS} starts, no list_changed`, async () => {
      const runs = await Promise.all(Array.from({ length: STARTS }, (_, i) => probe(agent, i)));
      for (const [i, r] of runs.entries()) {
        assert.ok(r.init !== undefined, `${agent}#${i}: no initialize reply; stderr: ${r.stderr}`);
        assert.ok(r.list !== undefined, `${agent}#${i}: no tools/list reply; stderr: ${r.stderr}`);
        assert.deepEqual(r.notes.filter((m) => m === "notifications/tools/list_changed"), [], `${agent}#${i} sent list_changed`);
      }
      const init = JSON.parse(runs[0].init).result;
      assert.equal(init.instructions, INSTRUCTIONS);
      assert.deepEqual(JSON.parse(runs[0].list).result.tools.map((t) => t.name), [...TOOL_ORDER]);
      for (let i = 1; i < STARTS; i++) {
        assert.equal(runs[i].init, runs[0].init, `${agent}: initialize bytes of start ${i + 1} differ from start 1`);
        assert.equal(runs[i].list, runs[0].list, `${agent}: tools/list bytes of start ${i + 1} differ from start 1`);
      }
    });
  }

  test("prefix: instructions and every tool description are the src/prompt/*.md bytes, nothing added at run time", () => {
    assert.equal(INSTRUCTIONS, readFileSync(path.join(REPO, "src", "prompt", "instructions.md"), "utf8"));
    assert.deepEqual(TOOLS.map((t) => t.name), [...TOOL_ORDER]);
    for (const t of TOOLS) {
      assert.equal(t.description, readFileSync(path.join(REPO, "src", "prompt", "tools", t.name + ".md"), "utf8"), t.name);
    }
  });

  test("prefix lint: build/check-prompt-static.mjs passes on the repo prompt files", () => {
    const r = spawnSync(process.execPath, [LINT], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.startsWith("PASS "), r.stdout);
  });

  test("prefix lint: each dynamic token in a tool description or the instructions fails the lint", () => {
    const cases = {
      "date": "Results since 2026-10-26 rank first.",
      "time": "Indexed at 14:02 today.",
      "template": "Searches ${project} content.",
      "brace placeholder": "Searches {cwd} content.",
      "home path": "Reads /Users/alice/notes.",
      "linux home": "Reads /home/alice/notes.",
      "tilde path": "Reads ~/notes.",
      "windows path": "Reads C:\\Users\\alice.",
      "uuid": "Session 280ff837-09ba-4152-bb02-89ec3a42eca9 only.",
    };
    for (const [name, text] of Object.entries(cases)) {
      for (const file of ["instructions.md", path.join("tools", "ctx_search.md")]) {
        const dir = path.join(root, "lint", name.replace(/ /g, "-"), file === "instructions.md" ? "i" : "t");
        mkdirSync(path.join(dir, "tools"), { recursive: true });
        writeFileSync(path.join(dir, "instructions.md"), "Static instructions.");
        for (const tool of TOOL_ORDER) writeFileSync(path.join(dir, "tools", tool + ".md"), "Static description.");
        writeFileSync(path.join(dir, file), text);
        const r = spawnSync(process.execPath, [LINT, "--prompt-dir", dir], { encoding: "utf8" });
        assert.equal(r.status, 1, `${name} in ${file}: ${r.stdout}${r.stderr}`);
        assert.ok(r.stdout.startsWith("FAIL "), `${name} in ${file}: ${r.stdout}`);
        assert.ok(r.stdout.includes(file), `${name}: the FAIL line names ${file}: ${r.stdout}`);
      }
    }
  });

  test("prefix: the gate's ci-checks layer runs build/check-prompt-static.mjs", () => {
    const gate = readFileSync(path.join(REPO, "scripts", "gate.mjs"), "utf8");
    assert.ok(gate.includes('["build/check-prompt-static.mjs"]'), "scripts/gate.mjs CI_CHECKS lists build/check-prompt-static.mjs");
    const ci = readFileSync(path.join(REPO, ".github", "workflows", "ci.yml"), "utf8");
    assert.ok(ci.includes("- run: node build/check-prompt-static.mjs"), "ci.yml runs the same check (D-M4-GS4-1)");
  });

  // Pi: same fake host as pi-cache.test.mjs (agent-session.js:777-797 keeps result.systemPrompt, else base).
  test("prefix: pi system prompt bytes are identical on turns 1..6 of one session", async () => {
    const { default: piExtension } = await import("../../src/entries/pi.ts");
    const repo = path.join(root, "pi-repo");
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "-q", repo]);
    const oldHome = process.env.HOME;
    process.env.HOME = path.join(root, "pi-home"); process.env.USERPROFILE = path.join(root, "pi-home");
    try {
      const handlers = new Map();
      piExtension({ on: (name, fn) => handlers.set(name, fn), registerTool: () => {} });
      const ctx = { cwd: repo, sessionManager: { getSessionId: () => "prefix-pi" } };
      const seen = [];
      for (let i = 0; i < 6; i++) {
        await handlers.get("input")({ text: "prompt " + i }, ctx);
        const r = await handlers.get("before_agent_start")({ type: "before_agent_start", prompt: "p" + i, systemPrompt: "BASE" }, ctx);
        seen.push(r?.systemPrompt ?? "BASE");
      }
      for (let i = 1; i < seen.length; i++) assert.equal(seen[i], seen[0], `pi turn ${i + 1} differs from turn 1`);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  test("prefix: opencode system payload bytes are identical on turns 1..6 of one session", async () => {
    const opencodePlugin = await import("../../src/entries/opencode.ts");
    const repo = path.join(root, "oc-repo");
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "-q", repo]);
    const oldHome = process.env.HOME;
    const oldProject = process.env.CLAUDE_PROJECT_DIR;
    process.env.HOME = path.join(root, "oc-home"); process.env.USERPROFILE = path.join(root, "oc-home");
    delete process.env.CLAUDE_PROJECT_DIR;
    try {
      const hooks = await opencodePlugin.setupLegacy({ directory: repo, tool: () => {} });
      const seen = [];
      for (let i = 0; i < 6; i++) {
        await hooks["chat.message"]({ sessionID: "prefix-oc" }, { parts: [{ type: "text", text: "work " + i }] });
        await hooks["tool.execute.after"]({ sessionID: "prefix-oc", tool: "bash", callID: "c" + i, args: { command: "ls" } }, { output: "a b " + i });
        const out = { system: ["HOST SYSTEM"] };
        await hooks["experimental.chat.system.transform"]({ sessionID: "prefix-oc" }, out);
        seen.push(JSON.stringify(out.system));
      }
      for (let i = 1; i < seen.length; i++) assert.equal(seen[i], seen[0], `opencode turn ${i + 1} differs from turn 1`);
    } finally {
      process.env.HOME = oldHome;
      if (oldProject !== undefined) process.env.CLAUDE_PROJECT_DIR = oldProject;
    }
  });
});

describe("ADR-0021 cache mining (bench/cache/mine.mjs)", { concurrency: CONC }, () => {
  // bench/cache/mine.mjs: per-turn prompt-cache accounting from raw Claude Code stream-json (pure parsing).

  const j = (o) => JSON.stringify(o);
  const usage = (i, cc, cr, out = 10) => ({ input_tokens: i, cache_creation_input_tokens: cc, cache_read_input_tokens: cr, output_tokens: out });
  const asst = (id, u, extra = {}) => j({ type: "assistant", session_id: "s", timestamp: "2026-01-01T00:00:00Z", message: { id, usage: u }, ...extra });
  const init = j({ type: "system", subtype: "init", session_id: "s", cwd: "/p", claude_code_version: "9.9.9", model: "m" });

  test("parseSession: one turn per message id (last usage wins), sidechain skipped, version recorded", () => {
    const s = parseSession([init, asst("a", usage(2, 100, 0, 1)), asst("a", usage(2, 100, 0, 5)), asst("x", usage(1, 1, 1), { parent_tool_use_id: "t" }), "garbage", asst("b", usage(2, 50, 100))].join("\n"));
    assert.equal(s.version, "9.9.9");
    assert.equal(s.turns.length, 2);
    assert.equal(s.turns[0].out, 5);
    assert.equal(s.turns[0].kind, "first");
    assert.equal(s.turns[1].kind, "normal");
  });

  test("break rule: prior prefix not read back by more than 1024 tokens", () => {
    const s = parseSession([init, asst("a", usage(2, 5000, 0)), asst("b", usage(2, 300, 5000)), asst("c", usage(2, 4000, 0))].join("\n"));
    const r = analyzeSession(s);
    assert.deepEqual(r.turns.map((t) => t.break), [false, false, true]);
    assert.equal(r.turns[2].rewritten, 5302 - 2);
  });

  test("a rewrite of exactly 1024 is not a break", () => {
    const s = parseSession([init, asst("a", usage(0, 2000, 0)), asst("b", usage(0, 1100, 976))].join("\n"));
    assert.equal(analyzeSession(s).turns[1].rewritten, 1024);
    assert.equal(analyzeSession(s).turns[1].break, false);
  });

  test("compact turn is counted apart and never a normal break", () => {
    const cb = j({ type: "system", subtype: "compact_boundary", session_id: "s" });
    const s = parseSession([init, asst("a", usage(0, 9000, 0)), init, cb, asst("b", usage(0, 3000, 0)), asst("c", usage(0, 100, 3000))].join("\n"));
    const r = analyzeSession(s);
    assert.deepEqual(r.turns.map((t) => t.kind), ["first", "compact", "normal"]);
    assert.equal(r.turns[1].break, false);
    assert.equal(r.turns[1].rewritten, 9000);
  });

  test("resume (new init, no compact) is its own kind and is tested for breaks", () => {
    const s = parseSession([init, asst("a", usage(0, 5000, 0)), init, asst("b", usage(0, 5000, 0))].join("\n"));
    const r = analyzeSession(s);
    assert.equal(r.turns[1].kind, "resume");
    assert.equal(r.turns[1].break, true);
  });

  test("hit ratio = cr / (cr + cc + in)", () => {
    const s = parseSession([init, asst("a", usage(0, 100, 300))].join("\n"));
    assert.equal(analyzeSession(s).turns[0].hit, 0.75);
  });

  test("percentile is nearest rank; empty is null", () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
    assert.equal(percentile([], 0.5), null);
  });

  test("armOf and workloadOf read path segments", () => {
    assert.equal(armOf("compact-m2/du-units/main1/main-direct-cfg-a-0.jsonl"), "off");
    assert.equal(armOf("compact-m2/r3-merge/x/main-v2-tests-seed-0.jsonl"), "v2");
    assert.equal(armOf("m2/big-json-off-a.jsonl"), "off");
    assert.equal(armOf("tryit/large-json/transcripts/large-json-measured-1-1-plain.jsonl"), "off");
    assert.equal(armOf("tryit/large-json/transcripts/large-json-measured-1-1-gateway.jsonl"), "gateway");
    assert.equal(workloadOf("compact-m2/du-units/main1/a.jsonl"), "compact-m2/du-units");
    assert.equal(workloadOf("tryit/large-json/transcripts/a.jsonl"), "tryit/large-json");
    assert.equal(workloadOf("m2/a.jsonl"), "m2");
  });

  test("summarize: per arm and workload, breaks listed with path and turn", () => {
    const mk = (p, rows) => ({ path: p, session: analyzeSession(parseSession([init, ...rows].join("\n"))) });
    const out = summarize([
      mk("w/a/x-v2-0.jsonl", [asst("a", usage(0, 5000, 0)), asst("b", usage(0, 4000, 0))]),
      mk("w/a/x-off-0.jsonl", [asst("a", usage(0, 5000, 0)), asst("b", usage(0, 100, 5000))]),
    ]);
    assert.equal(out.arms.v2.total.breaks, 1);
    assert.equal(out.arms.off.total.breaks, 0);
    assert.deepEqual(out.arms.v2.breakList, [{ path: "w/a/x-v2-0.jsonl", turn: 2, rewritten: 5000 }]);
    assert.equal(out.arms.v2.byWorkload["w/a"].sessions, 1);
  });

  test("zero-usage assistant message (synthetic, no API call) is not a turn and never a break", () => {
    const s = parseSession([init, asst("a", usage(0, 5000, 0)), asst("b", usage(0, 300, 5000)), init, asst("z", usage(0, 0, 0)), asst("c", usage(0, 200, 5300))].join("\n"));
    const r = analyzeSession(s);
    assert.equal(r.turns.length, 3);
    assert.deepEqual(r.turns.map((t) => t.break), [false, false, false]);
  });
});

  // serial: before/after set process.env.HOME and CLAUDE_PROJECT_DIR
describe("ADR-0021 OpenCode cache break guard", () => {
  // Cross-session cache guard for OpenCode (D-CACHE-PI-1 review). The pending-compact marker is keyed by the
  // compacted session's id (dispatch.ts PENDING_COMPACT_META_PREFIX + sessionId), so a compaction in session A
  // never changes the system payload of a new session B in the same project: B gets the same bytes as a
  // session that follows no compaction, and the system prefix stays readable from cache across sessions.


  let root;
  let repo;
  let oldHome;
  let oldProject;

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cm-oc-cache-")));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    oldHome = process.env.HOME;
    oldProject = process.env.CLAUDE_PROJECT_DIR;
    process.env.HOME = root; process.env.USERPROFILE = root;
    delete process.env.CLAUDE_PROJECT_DIR;
  });

  // Windows keeps the plugin's store files open until the process ends; same cleanup as opencode-ported.test.mjs.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  after(() => {
    process.env.HOME = oldHome;
    if (oldProject !== undefined) process.env.CLAUDE_PROJECT_DIR = oldProject;
    rmTemp(root);
  });

  async function systemOf(hooks, sessionID) {
    const out = { system: ["HOST SYSTEM"] };
    await hooks["experimental.chat.system.transform"]({ sessionID }, out);
    return out.system;
  }

  test("opencode cache: a compaction in session A leaves the next session's system payload byte-identical", async () => {
    const plain = await opencodePlugin.setupLegacy({ directory: repo, tool: () => {} });
    const ref = await systemOf(plain, "oc-ref");

    const a = await opencodePlugin.setupLegacy({ directory: repo, tool: () => {} });
    await a["chat.message"]({ sessionID: "oc-a" }, { parts: [{ type: "text", text: "work" }] });
    await a["tool.execute.after"]({ sessionID: "oc-a", tool: "bash", callID: "c1", args: { command: "ls" } }, { output: "a b" });
    await systemOf(a, "oc-a");
    await a["experimental.session.compacting"]({ sessionID: "oc-a" });

    // A new process (new plugin load), as when the user starts a new session within minutes.
    const b = await opencodePlugin.setupLegacy({ directory: repo, tool: () => {} });
    assert.deepEqual(await systemOf(b, "oc-b"), ref, "session B system[] differs from a session with no compaction before it");
    await b["chat.message"]({ sessionID: "oc-b" }, { parts: [{ type: "text", text: "next" }] });
    assert.deepEqual(await systemOf(b, "oc-b"), ref, "session B turn 2 system[] differs");
  });
});

  // serial: before/after set process.env.HOME
describe("ADR-0021 Pi cache break guard", () => {
  // Cache break guard for Pi (DEVIATIONS D-CACHE-PI-1). Pi 0.73.1 rebuilds the system prompt on every
  // prompt: dist/core/agent-session.js:791-797 keeps result.systemPrompt from before_agent_start, else it
  // resets agent.state.systemPrompt to _baseSystemPrompt. The fake host below does the same, so a turn that
  // returns {} drops our text from the system prompt and the provider writes the whole prefix again.
  // Rule: between two compactions the system prompt the model sees is byte-identical on every turn.


  let root;
  let repo;
  let oldHome;

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cm-pi-cache-")));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
  });

  after(() => {
    process.env.HOME = oldHome;
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) { // D-M3-F-9: a kept DB handle blocks the delete on Windows; cleanup is best-effort there
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  });

  function fakeHost(sid) {
    const handlers = new Map();
    const pi = { on: (name, fn) => handlers.set(name, fn), registerTool: () => {} };
    piExtension(pi);
    const ctx = { cwd: repo, sessionManager: { getSessionId: () => sid } };
    const base = "BASE SYSTEM PROMPT";
    return {
      // agent-session.js:777-797: emitBeforeAgentStart gets _baseSystemPrompt; no systemPrompt means base.
      async turn() {
        const r = await handlers.get("before_agent_start")({ type: "before_agent_start", prompt: "p", systemPrompt: base }, ctx);
        return r?.systemPrompt ? r.systemPrompt : base;
      },
      async compact() {
        await handlers.get("session_compact")({ type: "session_compact" }, ctx);
      },
      async input(text) {
        await handlers.get("input")({ text }, ctx);
      },
      base,
    };
  }

  test("pi cache: the system prompt is byte-identical on turns 1..4 and keeps INSTRUCTIONS (no turn-2 break)", async () => {
    const host = fakeHost("cache-s1");
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await host.input("prompt " + i);
      seen.push(await host.turn());
    }
    assert.ok(seen[0].startsWith(host.base + "\n\n"), "the host prompt stays first");
    assert.ok(seen[0].includes(INSTRUCTIONS));
    for (let i = 1; i < seen.length; i++) assert.equal(seen[i], seen[0], "turn " + (i + 1) + " system prompt differs from turn 1");
  });

  test("pi cache: after a compaction the new system prompt stays byte-identical on every later turn", async () => {
    const host = fakeHost("cache-s2");
    await host.input("first prompt");
    const t1 = await host.turn();
    await host.input("second prompt");
    assert.equal(await host.turn(), t1);
    await host.compact();
    await host.input("third prompt");
    const afterCompact = await host.turn(); // the compact turn: history is new anyway, so it may differ from t1
    assert.ok(afterCompact.includes(INSTRUCTIONS), "INSTRUCTIONS stay in the system prompt after a compaction");
    for (let i = 0; i < 3; i++) {
      await host.input("later prompt " + i);
      assert.equal(await host.turn(), afterCompact, "post-compact turn " + (i + 1) + " system prompt differs");
    }
  });
});
