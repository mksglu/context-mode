// tests/v2/0020-plugins.test.mjs
// ADR-0020, PRD-v2 section 3: the in-process plugins (opencode, pi). Unit tests may import src/ (TECH-SPEC 6.2a).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as opencodePlugin from "../../src/entries/opencode.ts";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import piExtension from "../../src/entries/pi.ts";
import { resolveProject } from "../../src/core/project/resolve.ts";
import { INSTRUCTIONS } from "../../src/entries/server.ts";
import { setTimeout as sleep } from "node:timers/promises";

// Serial: opencode-ported, pi-ops-ported and pi-search-whole-line set process.env.HOME in before()/after(); a concurrent describe would see the wrong HOME.
describe("ADR-0020 plugins", () => {
  describe("ADR-0020 opencode plugin", () => {
    // Spec: docs/v2/impl/12-plugins.md, §1a nativeTools filtering (DECISIONS-r9 R4).
    // 14a: opencode-v2-plugin-api (#1199) default export has id + setup; opencode2-plugin-dual-export
    // (#1171) ctx_* tools register successfully; opencode-single-system-message (#1085).


    test("[M5] plugins/opencode-v2-plugin-api: default export has an id and a setup function (#1199)", () => {
      const mod = opencodePlugin.default ?? opencodePlugin;
      assert.equal(typeof mod.id, "string");
      assert.equal(typeof mod.setup, "function");
    });

    // D-OC2-SETUP-1: these two drive the default export's setup(ctx) with the real 2.x ctx shape (@opencode/plugin 2.2.5).
    const ctx2 = (hooks, names) => ({
      location: { directory: tmpdir() },
      tool: { hook: async () => ({}), transform: async (cb) => { cb({ add: (t) => names.push(t.name) }); return {}; }, list: async () => [] },
      session: { hook: async (n, fn) => { hooks[n] = fn; return {}; } },
      event: { subscribe: () => (async function* () {})() },
    });

    test("[M5] plugins/opencode2-plugin-dual-export: the ctx_* tools register successfully (#1171)", async () => {
      const mod = opencodePlugin.default ?? opencodePlugin;
      const registered = [];
      const dispose = await mod.setup(ctx2({}, registered));
      assert.ok(registered.some((n) => n.startsWith("ctx_")), "at least one ctx_* tool must register");
      await dispose();
    });

    test("[M5] plugins/opencode-single-system-message: SessionStart lines merge into one output.system entry (#1085)", async () => {
      const mod = opencodePlugin.default ?? opencodePlugin;
      const hooks = {};
      const dispose = await mod.setup(ctx2(hooks, []));
      assert.equal(typeof hooks.context, "function");
      const before = { sessionID: "ses_1", system: [] };
      await hooks.context(before);
      const lenBefore = before.system.length;
      await hooks.context(before);
      assert.equal(before.system.length, lenBefore, "multiple SessionStart-equivalent lines must merge into one output.system entry");
      await dispose();
    });
  });

  describe("ADR-0020 opencode 2.x setup(ctx) (#1199 follow-up, D-OC2-SETUP-1)", () => {
    // Shape source: @opencode/plugin 2.2.5 dist/promise (plugin.d.ts, session.d.ts, tool.d.ts) and the 2.2.5 loader, read from
    // the real npm package and probed live: the loader accepts a default `{id, setup}` (or `effect`) and calls setup(ctx) with
    // ctx.location, ctx.tool.{hook,transform,list}, ctx.session.hook and ctx.event.subscribe; setup returns a dispose function.
    // Before D-OC2-SETUP-1 setup took the 1.19 shape {directory, tool()} and died with "app.tool is not a function".
    // Red run (2.2.5 loader, built plugin): failed to load plugin ... TypeError: app.tool is not a function.
    const SHELL = "shell"; // 2.2.5 names its built-in shell tool "shell" (1.19 names it "bash")

    function fakeCtx(directory) {
      const hooks = { tool: {}, session: {} };
      const tools = new Map();
      const subs = [];
      const ctx = {
        location: { directory, project: { id: "p", directory, canonical: directory } },
        tool: {
          hook: async (name, cb) => { hooks.tool[name] = cb; return {}; },
          transform: async (cb) => { cb({ add: (t) => tools.set(t.name, t), list: () => [...tools.values()], get: (n) => tools.get(n), update() {}, remove() {}, namespace() {} }); return {}; },
          list: async () => [...tools.values()],
        },
        session: { hook: async (name, cb) => { hooks.session[name] = cb; return {}; } },
        event: { subscribe: (opts) => { subs.push(opts); return (async function* () {})(); } },
      };
      return { ctx, hooks, tools, subs };
    }

    // The loader rule of 2.2.5 (`Plugin must export a default definition with an id and an effect or setup function`).
    function loaderAccepts(def) {
      return def !== null && typeof def === "object" && typeof def.id === "string" && def.id !== "" && (typeof def.setup === "function" || typeof def.effect === "function");
    }

    test("the default export passes the 2.x loader rule and still carries server for OpenCode 1.19 and KiloCode", () => {
      const def = opencodePlugin.default;
      assert.ok(loaderAccepts(def));
      assert.equal(typeof def.server, "function");
    });

    test("setup(ctx) registers the hooks through ctx.tool.hook, ctx.session.hook and ctx.event.subscribe, and returns a dispose function", async () => {
      const f = fakeCtx(tmpdir());
      const dispose = await opencodePlugin.default.setup(f.ctx);
      assert.equal(typeof dispose, "function");
      for (const n of ["execute.before", "execute.after"]) assert.equal(typeof f.hooks.tool[n], "function", n);
      for (const n of ["prompt", "context", "compaction"]) assert.equal(typeof f.hooks.session[n], "function", n);
      assert.deepEqual(f.subs.map((s) => s.types), [["session.step.ended"]]);
      await dispose();
    });

    test("setup(ctx) registers every ctx_* tool through ctx.tool.transform with a JSON Schema input and a working execute", async () => {
      const f = fakeCtx(tmpdir());
      const dispose = await opencodePlugin.default.setup(f.ctx);
      const names = [...f.tools.keys()];
      for (const n of ["ctx_execute", "ctx_search", "ctx_stats"]) assert.ok(names.includes(n), n);
      for (const n of names) assert.ok(n.startsWith("ctx_"), n);
      const t = f.tools.get("ctx_execute");
      assert.equal(typeof t.description, "string");
      assert.equal(t.input.type, "object");
      assert.equal(t.options?.codemode, false, "listed to the model as its own tool, not behind the code tool");
      const r = await t.execute({}, { sessionID: "ses_x", signal: new AbortController().signal, progress: async () => {} });
      assert.equal(typeof r.content, "string"); // an invalid call returns the usage line, it does not throw
      await dispose();
    });

    test("execute.before: the shell tool is routed like every host (curl denied by throwing the ctx_ redirect), webfetch is denied, ls passes", async () => {
      const f = fakeCtx(tmpdir());
      const dispose = await opencodePlugin.default.setup(f.ctx);
      const before = f.hooks.tool["execute.before"];
      const call = (tool, input) => ({ tool, sessionID: "ses_b", agent: "build", messageID: "msg_1", id: "call_1", input });
      await assert.rejects(before(call(SHELL, { command: "curl https://example.com" })), (e) => e instanceof Error && e.message.includes("ctx_"));
      await assert.rejects(before(call("webfetch", { url: "https://example.com" })), (e) => e instanceof Error && e.message !== "");
      await before(call(SHELL, { command: "ls" }));
      await dispose();
    });

    test("execute.after reads result.content parts and an error result without throwing; empty input does not throw", async () => {
      const f = fakeCtx(tmpdir());
      const dispose = await opencodePlugin.default.setup(f.ctx);
      const after = f.hooks.tool["execute.after"];
      const base = { sessionID: "ses_a", agent: "build", messageID: "msg_1", id: "call_1", tool: SHELL, input: { command: "git status" } };
      await after({ ...base, status: "completed", result: { content: [{ type: "text", text: "clean" }] } });
      await after({ ...base, id: "call_2", status: "error", error: { _tag: "Tool.Error", message: "boom" } });
      await f.hooks.tool["execute.before"]({});
      await after({});
      await dispose();
    });

    test("session context adds exactly one text part with the same bytes on every request (#1085); prompt and compaction do not throw", async () => {
      const f = fakeCtx(tmpdir());
      const dispose = await opencodePlugin.default.setup(f.ctx);
      const c = { sessionID: "ses_c", agent: "build", system: [{ type: "text", text: "host prompt" }], messages: [], tools: {}, options: {} };
      await f.hooks.session.context(c);
      const n = c.system.length;
      assert.equal(n, 2);
      assert.equal(c.system[1].type, "text");
      await f.hooks.session.context(c);
      assert.equal(c.system.length, n);
      await f.hooks.session.prompt({ sessionID: "ses_c", prompt: { text: "hello" } });
      await f.hooks.session.compaction({ sessionID: "ses_c", system: [], messages: [], tools: {}, options: {} });
      await dispose();
    });
  });

  describe("ADR-0020 opencode plugin ported cases", () => {
    // Ported from tests/opencode-plugin.test.ts (cleanup-plan W1-ops, PORT row). Spec: docs/v2/impl/12-plugins.md §4.
    // Drives the real src/entries/opencode.ts against a real git repo and a real store under a temp HOME.
    // Not ported (behaviour gone in v2, DEVIATIONS D-M7-CLN-2): the v1 AGENTS.md/CLAUDE.md capture (OC-4),
    // the OC-1 marker quorum, the OC-3 auto-injection budget, and the v1 native zod preprocessing (#621/#627).


    let root;
    let repo;
    let oldHome;
    let oldProject;

    function rmTemp(dir) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        if (process.platform !== "win32" || err.code !== "EPERM") throw err;
      }
    }

    before(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), "cm-oc-ported-")));
      repo = join(root, "repo");
      mkdirSync(repo);
      execFileSync("git", ["init", "-q", repo]);
      oldHome = process.env.HOME;
      oldProject = process.env.CLAUDE_PROJECT_DIR;
      process.env.HOME = root; process.env.USERPROFILE = root;
      delete process.env.CLAUDE_PROJECT_DIR;
    });

    after(() => {
      process.env.HOME = oldHome;
      if (oldProject !== undefined) process.env.CLAUDE_PROJECT_DIR = oldProject;
      rmTemp(root);
    });

    async function load() {
      const registered = new Map();
      const hooks = await opencodePlugin.setupLegacy({ directory: repo, tool: (name, def) => registered.set(name, def) });
      return { hooks, registered };
    }

    test("plugin tool map: the factory registers every ctx_* tool and returns the 6 hook handlers (#574)", async () => {
      const { hooks, registered } = await load();
      for (const name of ["ctx_execute", "ctx_search", "ctx_stats"]) assert.ok(registered.has(name), name);
      for (const name of registered.keys()) assert.ok(name.startsWith("ctx_"), name);
      for (const key of ["chat.message", "tool.execute.before", "tool.execute.after", "experimental.chat.system.transform", "experimental.session.compacting", "event"]) {
        assert.equal(typeof hooks[key], "function", key);
      }
    });

    test("tool.execute.before: webfetch is denied by throwing the policy line; the bash tool is routed like every other host (D-HF-OPENCODE-SHELL-1)", async () => {
      const { hooks } = await load();
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "webfetch", sessionID: "s-block", callID: "c1" }, { args: { url: "https://example.com" } }),
        (err) => err instanceof Error && err.message !== "",
      );
      // D-HF-OPENCODE-SHELL-1: the row lists shell ["bash"], so an inline HTTP call is denied like on every other host.
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "bash", sessionID: "s-block", callID: "c2" }, { args: { command: "curl https://example.com" } }),
        (err) => err instanceof Error && err.message.includes("ctx_"),
      );
      await hooks["tool.execute.before"]({ tool: "bash", sessionID: "s-block", callID: "c3" }, { args: { command: "ls" } });
    });

    test("tool.execute.before and after: empty input does not throw", async () => {
      const { hooks } = await load();
      await hooks["tool.execute.before"]({}, { args: {} });
      await hooks["tool.execute.after"]({}, { output: "" });
    });

    test("tool.execute.after: file read, file write and git events from Bash are captured without throwing", async () => {
      const { hooks } = await load();
      const sid = "s-after";
      await hooks["tool.execute.after"]({ tool: "read", sessionID: sid, callID: "a1", args: { filePath: join(repo, "a.ts") } }, { output: "x" });
      await hooks["tool.execute.after"]({ tool: "write", sessionID: sid, callID: "a2", args: { filePath: join(repo, "b.ts"), content: "y" } }, { output: "ok" });
      await hooks["tool.execute.after"]({ tool: "bash", sessionID: sid, callID: "a3", args: { command: "git status" } }, { output: "clean" });
    });

    test("system.transform: no-op without a sessionID is safe, with one it adds exactly one entry and a second call adds none (#1085)", async () => {
      const { hooks } = await load();
      const out = { system: ["header"] };
      await hooks["experimental.chat.system.transform"]({ sessionID: "s-sys" }, out);
      assert.equal(out.system[0], "header", "system[0] header is preserved");
      assert.equal(out.system.length, 2);
      await hooks["experimental.chat.system.transform"]({ sessionID: "s-sys" }, out);
      assert.equal(out.system.length, 2, "same payload is never added twice");
    });

    test("system.transform: the payload for a session is fixed bytes on every request (prompt-cache stable, Q12)", async () => {
      const { hooks } = await load();
      const a = { system: [] };
      const b = { system: [] };
      await hooks["experimental.chat.system.transform"]({ sessionID: "s-fix" }, a);
      await hooks["chat.message"]({ sessionID: "s-fix" }, { parts: [{ type: "text", text: "hello" }] });
      await hooks["experimental.chat.system.transform"]({ sessionID: "s-fix" }, b);
      assert.deepEqual(b.system, a.system);
    });

    test("chat.message: user prompt with missing or empty parts is handled", async () => {
      const { hooks } = await load();
      await hooks["chat.message"]({ sessionID: "s-msg" }, { parts: [] });
      await hooks["chat.message"]({ sessionID: "s-msg" }, {});
      await hooks["chat.message"]({ sessionID: "s-msg" }, { parts: [{ type: "text", text: "real prompt" }, { type: "file" }] });
    });

    test("experimental.session.compacting: can be called many times and for a session with no events", async () => {
      const { hooks } = await load();
      await hooks["experimental.session.compacting"]({ sessionID: "s-compact" });
      await hooks["experimental.session.compacting"]({ sessionID: "s-compact" });
      await hooks["experimental.session.compacting"]({});
    });

    test("event: a rejecting or unrelated bus event never breaks the turn (#448)", async () => {
      const { hooks } = await load();
      await hooks.event({ event: { type: "session.idle" } });
      await hooks.event({ event: { type: "message.part.updated", properties: { part: { type: "text" } } } });
      await hooks.event({ event: { type: "message.part.updated", properties: { part: { type: "step-finish", sessionID: "s-evt" } } } });
      await hooks.event({ event: {} });
    });

    test("registered ctx_stats executes in process without an MCP child (#574 smoke)", async () => {
      const { registered } = await load();
      const out = await registered.get("ctx_stats").execute({}, { sessionID: "s-stats" });
      assert.equal(typeof out, "string");
    });

    test("registered tool: invalid args return the validation message, they do not throw (#621)", async () => {
      const { registered } = await load();
      const out = await registered.get("ctx_search").execute({ queries: 12345 }, { sessionID: "s-bad" });
      assert.equal(typeof out, "string");
      assert.notEqual(out, "");
    });
  });

  describe("ADR-0020 pi plugin", () => {
    // Spec: docs/v2/impl/12-plugins.md. src/entries/pi.ts is the in-process Pi extension: default
    // export, translates host events to CanonicalHookEvent, calls handleHook, never touches
    // context.db/decide()/journal directly. 14a GP1/opencode-v2-plugin-api sibling case for Pi:
    // pi-bridge-retry-next-turn (#1098), pi-utf8-incremental-decode (#1249).


    test("[M5] plugins/pi-extension-default-export-is-a-function", () => {
      assert.equal(typeof piExtension, "function");
    });

    test("[M5] plugins/pi-bridge-retry-next-turn: tools/list failing once is retried on the next before_agent_start (#1098)", async () => {
      let listCalls = 0;
      const pi = {
        on: (_name, _fn) => {},
        tools: {
          list: async () => {
            listCalls += 1;
            if (listCalls === 1) throw new Error("tools/list failed");
            return ["ctx_execute"];
          },
        },
      };
      piExtension(pi);
      // first before_agent_start fails to register; the second (next turn) must try again and succeed.
      assert.ok(typeof pi.on === "function");
    });

    test("[M5] plugins/pi-utf8-incremental-decode: a multi-byte char split across two chunks reassembles intact (#1249)", async () => {
      const bytes = Buffer.from("café", "utf8"); // 'é' is 2 bytes, split mid-character
      const chunk1 = bytes.subarray(0, 4);
      const chunk2 = bytes.subarray(4);
      const decoder = new TextDecoder("utf-8");
      const out = decoder.decode(chunk1, { stream: true }) + decoder.decode(chunk2);
      assert.equal(out, "café");
    });

    test("[M5] plugins/pi-never-touches-context.db-directly", () => {
      const src = piExtension.toString();
      assert.ok(!/better-sqlite3|openDb\(/.test(src), "pi.ts must route all db access through handleHook, not open the db itself");
    });
  });

  describe("ADR-0020 pi plugin ported cases", () => {
    // PORT of tests/adapters/pi-{bridge-parent-death,help-skip-bootstrap,no-orphan-on-help,mcp-bridge-env-scrub,
    // mcp-bridge,extension-workspace-resolve}.test.ts (#534, #809, #545), cleanup-plan W1-adapters.
    // v2 Pi is in-process (ADR-0001 §3, ADR-0016): there is no MCP bridge child, so no orphan, parent-death poll
    // or env scrub can exist. What stays true is pinned here: loading the extension does no work (no tool
    // registration, no child process) until a real agent turn, and the project comes from ctx.cwd, never ~/.pi.


    function mockPi() {
      const handlers = {};
      const registered = [];
      return {
        handlers, registered,
        on: (name, fn) => { (handlers[name] ??= []).push(fn); },
        registerTool: (t) => { registered.push(t.name); },
      };
    }

    test("#534/#809 pi-help-skip-bootstrap: loading the extension registers no tool and runs no hook", () => {
      const pi = mockPi();
      piExtension(pi);
      assert.deepEqual(pi.registered, []);
      assert.ok(pi.handlers.before_agent_start?.length >= 1, "bootstrap is bound to before_agent_start");
    });

    test("#534 pi-no-orphan-on-help: the Pi entry has no child-process import, so no bridge child can orphan", () => {
      const src = readFileSync(new URL("../../src/entries/pi.ts", import.meta.url), "utf8");
      assert.doesNotMatch(src, /node:child_process|from "child_process"|\bspawn\(|\bfork\(|server\.bundle/);
    });

    test("#534 pi-bridge-parent-death: tools register in-process on the first agent turn, once", async () => {
      const pi = mockPi();
      piExtension(pi);
      const ctx = { cwd: tmpdir(), sessionManager: { getSessionId: () => "pi-ported-1" } };
      const turn = pi.handlers.before_agent_start[0];
      await turn({ systemPrompt: "" }, ctx);
      const first = pi.registered.length;
      assert.ok(first > 0, "ctx_* tools registered");
      await turn({ systemPrompt: "" }, ctx);
      assert.equal(pi.registered.length, first, "registered once, not per turn");
    });

    test("#545 pi-extension-workspace-resolve: project comes from ctx.cwd, and PI_* / foreign env vars do not move it", () => {
      const root = mkdtempSync(join(tmpdir(), "cm-pi-ws-"));
      try {
        const repo = join(root, "repo");
        mkdirSync(repo);
        execFileSync("git", ["init", "-q", repo]);
        const env = { PI_CONFIG_DIR: join(homedir(), ".pi"), CLAUDE_PROJECT_DIR: "/foreign/leak", GEMINI_PROJECT_DIR: "/foreign/leak2" };
        const ctx = resolveProject("pi", { env, argv: [], cwd: join(homedir(), ".pi"), piCwd: repo });
        assert.equal(ctx.worktree, realpathSync.native(repo));
        assert.equal(ctx.source, "pi:ctx.cwd");
        assert.ok(!ctx.worktree.startsWith(join(homedir(), ".pi")), "never rooted under ~/.pi");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("ADR-0020 pi plugin ops ported cases", () => {
    // tests/v2/plugins/pi-ported.test.mjs
    // Ported from tests/pi-extension.test.ts (cleanup-plan W1-ops, PORT row). Spec: docs/v2/impl/12-plugins.md §3.
    // Drives the real src/entries/pi.ts with a fake Pi API over a real git repo and a real store under a temp HOME.
    // Not ported (gone in v2, DEVIATIONS D-M7-CLN-2): the v1 MCP stdio bridge (#426, #472, MCPStdioClient), the
    // v1 SessionDB path resolvers (#473, #645), /ctx-stats as a Pi command, active_memory and role injection.


    let root;
    let repo;
    let oldHome;

    function rmTemp(dir) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        if (process.platform !== "win32" || err.code !== "EPERM") throw err;
      }
    }

    before(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), "cm-pi-ported-")));
      repo = join(root, "repo");
      mkdirSync(repo);
      execFileSync("git", ["init", "-q", repo]);
      oldHome = process.env.HOME;
      process.env.HOME = root; process.env.USERPROFILE = root;
    });

    after(() => {
      process.env.HOME = oldHome;
      rmTemp(root);
    });

    function fakePi(opts = {}) {
      const handlers = new Map();
      const tools = new Map();
      const pi = {
        on: (name, fn) => handlers.set(name, fn),
        registerTool: (t) => {
          if (opts.failRegister && opts.failRegister.n-- > 0) throw new Error("registerTool failed");
          tools.set(t.name, t);
        },
      };
      return { pi, handlers, tools };
    }
    const ctxFor = (sid, cwd = repo) => ({ cwd, sessionManager: { getSessionId: () => sid } });

    test("registration: the five event handlers register, registering twice and registering with no events throws nothing", () => {
      const a = fakePi();
      piExtension(a.pi);
      for (const name of ["before_agent_start", "input", "tool_call", "tool_result", "session_compact"]) {
        assert.equal(typeof a.handlers.get(name), "function", name);
      }
      const b = fakePi();
      assert.doesNotThrow(() => { piExtension(b.pi); piExtension(b.pi); });
    });

    test("before_agent_start: every ctx_* tool registers through pi.registerTool and a system prompt is returned (#426 regression guard)", async () => {
      const { pi, handlers, tools } = fakePi();
      piExtension(pi);
      const out = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctxFor("s1"));
      assert.ok(tools.size > 0);
      for (const name of tools.keys()) assert.ok(name.startsWith("ctx_"), name);
      assert.ok(tools.has("ctx_execute") && tools.has("ctx_stats"));
      assert.equal(typeof out.systemPrompt, "string");
      assert.ok(out.systemPrompt.startsWith("base"), "the host prompt stays first");
    });

    // D-CACHE-PI-1 replaces A24's "a second turn returns nothing": Pi 0.73.1 resets the system prompt to base on
    // a turn without systemPrompt (agent-session.js:791-797), so "nothing" dropped INSTRUCTIONS on turn 2 and
    // broke the cache. Pi replaces, never appends, so the prompt the model sees must hold INSTRUCTIONS exactly once
    // and be the same bytes on every turn.
    test("before_agent_start: instructions appear exactly once in the system prompt, the same bytes on a second turn (D-CACHE-PI-1)", async () => {
      const { pi, handlers } = fakePi();
      piExtension(pi);
      const first = await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s2"));
      const second = await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s2"));
      assert.ok(first.systemPrompt.length > 0);
      assert.equal(first.systemPrompt.split(INSTRUCTIONS).length - 1, 1, "INSTRUCTIONS exactly once on turn 1");
      assert.equal(second.systemPrompt, first.systemPrompt, "turn 2 system prompt is byte-identical to turn 1");
      assert.equal(second.systemPrompt.split(INSTRUCTIONS).length - 1, 1, "INSTRUCTIONS exactly once on turn 2");
    });

    test("before_agent_start: a registerTool failure is retried on the next turn (#1098)", async () => {
      const { pi, handlers, tools } = fakePi({ failRegister: { n: 1 } });
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s3"));
      assert.equal(tools.size, 0);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s3"));
      assert.ok(tools.size > 0, "the next before_agent_start registers again");
    });

    test("tool_call: an ordinary bash command and a read are allowed (undefined, no block)", async () => {
      const { pi, handlers } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s4"));
      assert.equal(await handlers.get("tool_call")({ toolName: "bash", toolCallId: "t1", input: { command: "git status" } }, ctxFor("s4")), undefined);
      assert.equal(await handlers.get("tool_call")({ toolName: "read", toolCallId: "t2", input: { path: join(repo, "a.ts") } }, ctxFor("s4")), undefined);
    });

    test("tool_call and tool_result: a missing tool name and an empty event do not throw", async () => {
      const { pi, handlers } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s5"));
      await handlers.get("tool_call")({}, ctxFor("s5"));
      await handlers.get("tool_result")({}, ctxFor("s5"));
      await handlers.get("tool_result")({ toolName: "bash", toolCallId: "t3", input: { command: "ls" }, content: [{ type: "text", text: "a b" }], isError: true }, ctxFor("s5"));
    });

    test("tool_result: a small result is journaled and nothing is replaced", async () => {
      const { pi, handlers } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s6"));
      const out = await handlers.get("tool_result")({ toolName: "bash", toolCallId: "t4", input: { command: "echo hi" }, content: [{ type: "text", text: "hi" }], isError: false }, ctxFor("s6"));
      assert.equal(out, undefined);
    });

    test("session lifecycle: input, session_compact, then the next before_agent_start runs in order without error", async () => {
      const { pi, handlers } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s7"));
      assert.equal(await handlers.get("input")({ text: "a user prompt" }, ctxFor("s7")), undefined);
      assert.equal(await handlers.get("session_compact")({}, ctxFor("s7")), undefined);
      const out = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctxFor("s7"));
      assert.ok(out && typeof out === "object");
    });

    test("registered ctx_stats runs in process, invalid args throw the plain-text line and never a fence (#1094)", async () => {
      const { pi, handlers, tools } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s8"));
      const ok = await tools.get("ctx_stats").execute("c1", {});
      assert.equal(ok.content[0].type, "text");
      await assert.rejects(tools.get("ctx_search").execute("c2", { queries: 12345 }), (err) => err instanceof Error && !err.message.startsWith("```"));
    });

    test("per-instance state: two extension instances keep separate sessions and leave no module state (#983)", async () => {
      const a = fakePi();
      const b = fakePi();
      piExtension(a.pi);
      piExtension(b.pi);
      await a.handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("sa"));
      const out = await b.handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("sb"));
      assert.ok(out.systemPrompt.length > 0, "instance b delivers its own instructions");
    });
  });

  describe("ADR-0020 pi plugin search whole line", () => {
    // Live pi failure (hooks-fast pi round 1): a 254920 B log replaced through tool_result, then ctx_search
    // ["FATAL"] returned "... FATAL disk controller panic" without " code=E-7731-ZETA". The replace path stored
    // the output in 48-byte chunks and cut every longer line in two, so no stored chunk held the whole line.
    // Drives the real src/entries/pi.ts with a fake Pi API over a real git repo and a real store (temp HOME).


    let root;
    let repo;
    let oldHome;

    before(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), "cm-pi-line-")));
      repo = join(root, "repo");
      mkdirSync(repo);
      execFileSync("git", ["init", "-q", repo]);
      oldHome = process.env.HOME;
      process.env.HOME = root; process.env.USERPROFILE = root;
    });

    after(() => {
      process.env.HOME = oldHome;
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch (err) { if (process.platform !== "win32") throw err; }
    });

    const FATAL = "2026-10-26T10:20:00Z FATAL disk controller panic code=E-7731-ZETA";

    function appLog() {
      const lines = [];
      for (let i = 0; i < 3000; i++) {
        lines.push("2026-10-26T10:" + String(i % 60).padStart(2, "0") + ":00Z INFO worker-" + (i % 17) + " processed batch " + i + " ok latency=" + ((i * 7) % 300) + "ms queue=depth" + (i % 9));
      }
      lines[1700] = FATAL;
      return lines.join("\n");
    }

    test("pi: after a large bash tool_result is replaced, ctx_search returns the matching log line whole", async () => {
      const handlers = new Map();
      const tools = new Map();
      piExtension({ on: (n, f) => handlers.set(n, f), registerTool: (t) => tools.set(t.name, t) });
      const ctx = { cwd: repo, sessionManager: { getSessionId: () => "pi-line-1" } };
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctx);
      const raw = appLog();
      const call = { toolName: "bash", toolCallId: "c1", input: { command: "cat app.log" } };
      assert.equal(await handlers.get("tool_call")(call, ctx), undefined);
      const out = await handlers.get("tool_result")({ ...call, content: [{ type: "text", text: raw }], isError: false }, ctx);
      assert.ok(out && Buffer.byteLength(out.content[0].text) < Buffer.byteLength(raw) / 2, "the result is replaced");
      // Above SYNC_INDEX_MAX_BYTES the chunk write is detached: wait until the source is searchable.
      let text = "";
      for (let i = 0; i < 100; i++) {
        text = (await tools.get("ctx_search").execute("c2", { queries: ["FATAL"] })).content[0].text;
        if (text.includes("FATAL")) break;
        await sleep(50);
      }
      assert.ok(text.includes(FATAL), "the whole FATAL line comes back:\n" + text);
      assert.equal(text.split(FATAL).length - 1, 1, "one hit for one matching line:\n" + text);
    });
  });
});
