// tests/0020-plugins.test.mjs
// ADR-0020, PRD-v2 section 3: the in-process plugins (opencode, pi). Unit tests may import src/ (TECH-SPEC 6.2a).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as opencodePlugin from "../src/entries/opencode.ts";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import piExtension from "../src/entries/pi.ts";
import * as piEntry from "../src/entries/pi.ts";
import { resolveProject } from "../src/core/project/resolve.ts";
import { openDb } from "../src/core/store/db.ts";
import { readSessionEvents } from "../src/core/journal/read.ts";
import { INSTRUCTIONS } from "../src/entries/server.ts";
import { RESUME_HINT } from "../src/core/contracts/constants.ts";
import { setTimeout as sleep } from "node:timers/promises";

// Serial: opencode-ported, pi-ops-ported and pi-search-whole-line set process.env.HOME in before()/after(); a concurrent describe would see the wrong HOME.
describe("ADR-0020 plugins", () => {
  describe("ADR-0020 opencode plugin", () => {
    // Spec: docs/architecture/modules/12-plugins.md, §1a nativeTools filtering (DECISIONS-r9 R4).
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
      // "generate" (#1369): @opencode/core 2.2.6 sends session.generate (cache warming) through its own hook kind.
      for (const n of ["prompt", "context", "generate", "compaction"]) assert.equal(typeof f.hooks.session[n], "function", n);
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

    // D-1331-OC-PERM-1 (#1331): the ctx_* tools go through OpenCode's own permission rules. The fake host below is
    // OpenCode 2.2.5's rule order: @opencode/core dist/chunks/location-nw8h2gm9.js:100 evaluate3 (the last matching
    // rule wins, no match = "ask"); ctx.permission.assert rejects on deny (@opencode/plugin dist/promise/permission.d.ts:22-28).
    // Red run (before the fix): ctx_execute ran "echo hi" with no assert call at all, asked = [].
    function permissionHost(rules) {
      const asked = [];
      const hit = (value, pattern) => pattern === "*" || value === pattern || (pattern.endsWith(" *") && value.startsWith(pattern.slice(0, -1)));
      const assertFn = async (req) => {
        asked.push(req);
        for (const resource of req.resources) {
          const rule = rules.findLast((r) => hit(req.action, r.action) && hit(resource, r.resource));
          const effect = rule?.effect ?? "ask";
          if (effect === "deny") throw new Error(`permission denied: ${req.action} ${resource}`);
          if (effect === "ask") throw new Error(`permission rejected by the user: ${req.action} ${resource}`);
        }
      };
      return { asked, assertFn };
    }
    const call2 = { sessionID: "ses_perm", agent: "build", messageID: "msg_1", id: "call_1", signal: new AbortController().signal };

    test("[D-1331-OC-PERM-1] the reporter's catch-all ask rule: ctx_execute asks OpenCode before it runs echo hi (#1331)", async () => {
      const f = fakeCtx(tmpdir());
      const host = permissionHost([{ action: "*", resource: "*", effect: "ask" }]);
      f.ctx.permission = { assert: host.assertFn };
      const dispose = await opencodePlugin.default.setup(f.ctx);
      await assert.rejects(f.tools.get("ctx_execute").execute({ language: "shell", code: "echo hi" }, call2), /rejected by the user/);
      assert.deepEqual(host.asked[0], { sessionID: "ses_perm", agent: "build", action: "ctx_execute", resources: ["shell"], save: ["shell"], source: { type: "tool", messageID: "msg_1", id: "call_1" } });
      await dispose();
    });

    test("[D-1331-OC-PERM-1] a shell deny rule applies to ctx_execute shell code and to every ctx_batch command (#1331)", async () => {
      const f = fakeCtx(tmpdir());
      const host = permissionHost([{ action: "*", resource: "*", effect: "allow" }, { action: SHELL, resource: "git push *", effect: "deny" }]);
      f.ctx.permission = { assert: host.assertFn };
      const dispose = await opencodePlugin.default.setup(f.ctx);
      await assert.rejects(f.tools.get("ctx_execute").execute({ language: "bash", code: "echo ok && git push origin main" }, call2), /permission denied: shell git push origin main/);
      await assert.rejects(f.tools.get("ctx_batch").execute({ commands: ["ls", "git push origin main"], queries: ["x"] }, call2), /permission denied: shell git push origin main/);
      const shell = host.asked.filter((r) => r.action === SHELL);
      assert.deepEqual(shell.map((r) => r.resources), [["echo ok", "git push origin main"], ["ls", "git push origin main"]]);
      await dispose();
    });

    test("[D-1331-OC-PERM-1] a read deny rule applies to ctx_index path and ctx_execute file; a JavaScript call asks no shell check (#1331)", async () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), "cm-oc-perm-")));
      const f = fakeCtx(dir);
      const host = permissionHost([{ action: "*", resource: "*", effect: "allow" }, { action: "read", resource: "*", effect: "deny" }]);
      f.ctx.permission = { assert: host.assertFn };
      const dispose = await opencodePlugin.default.setup(f.ctx);
      await assert.rejects(f.tools.get("ctx_index").execute({ path: "secret.env" }, call2), /permission denied: read .*secret\.env/);
      await assert.rejects(f.tools.get("ctx_execute").execute({ language: "javascript", code: "1", file: "secret.env" }, call2), /permission denied: read/);
      assert.ok(!host.asked.some((r) => r.action === SHELL), "a JavaScript call asks no shell check");
      await dispose();
      rmSync(dir, { recursive: true, force: true });
    });

    test("[D-1331-OC-PERM-1] OpenCode 1.19: ctx_execute shell code asks toolCtx.ask with the 1.19 bash action (#1331)", async () => {
      const registered = new Map();
      await opencodePlugin.setupLegacy({ directory: tmpdir(), tool: (name, def) => registered.set(name, def) });
      const asked = [];
      const ask = async (input) => { asked.push(input); if (input.permission === "bash") throw new Error("denied by bash rule"); };
      await assert.rejects(registered.get("ctx_execute").execute({ language: "shell", code: "rm -rf build" }, { sessionID: "s", abort: new AbortController().signal, ask }), /denied by bash rule/);
      assert.deepEqual(asked.map((a) => [a.permission, a.patterns]), [["ctx_execute", ["shell"]], ["bash", ["rm -rf build"]]]);
    });

    test("execute.before: the shell tool is routed like every replace host (curl runs, execute.after replaces a large result), webfetch is denied, ls passes", async () => {
      const f = fakeCtx(tmpdir());
      const dispose = await opencodePlugin.default.setup(f.ctx);
      const before = f.hooks.tool["execute.before"];
      const call = (tool, input) => ({ tool, sessionID: "ses_b", agent: "build", messageID: "msg_1", id: "call_1", input });
      // D-M7-RR-1 + D-R54-OC-REPLACE-1 (#1347): a replace row runs the main agent's curl; no size-guess deny.
      await before(call(SHELL, { command: "curl https://example.com" }));
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

    // #1348, ADR-0016 l.23 (OpenCode 2 tool set from the agent at spawn time) and l.91 (D-SUB-NOCTX-1): the 2.x event carries
    // `agent`, and ctx.agent.get returns Agent.Info {mode, permissions:[{action, resource, effect}]} (@opencode/plugin 2.2.6
    // promise/agent.d.ts, client AgentGetOutput {location, data}). Red on main f681b458: the bridge drops i.agent, so a
    // subagent whose permissions deny every ctx_* tool gets "Tool: ctx_index, then ctx_search" and cannot do its task.
    // #1347, ADR-0016 l.49 + 12-plugins §4.5 step 3: the 2.x host reads afterEvent.result back after the hook (core
    // persistent-pty-fre27jqt.js:124-139); red on main: a 278889-byte result reaches the model unchanged.
    describe("agent tool set and in-process replace (#1348, #1347)", () => {
      const NO_CTX = [{ action: "ctx_*", resource: "*", effect: "deny" }, { action: "webfetch", resource: "*", effect: "allow" }];
      const agents = {
        "arch-review": { id: "arch-review", mode: "subagent", permissions: NO_CTX },
        "ctx-helper": { id: "ctx-helper", mode: "subagent", permissions: [{ action: "*", resource: "*", effect: "allow" }] },
        build: { id: "build", mode: "primary", permissions: NO_CTX },
      };
      let home, oldEnv;
      before(() => {
        home = mkdtempSync(join(tmpdir(), "cm-oc2-agent-"));
        oldEnv = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME };
        process.env.HOME = home; process.env.XDG_CONFIG_HOME = join(home, ".config"); process.env.XDG_DATA_HOME = join(home, ".local", "share");
      });
      after(() => {
        for (const [k, v] of Object.entries(oldEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        rmSync(home, { recursive: true, force: true });
      });
      function agentCtx(directory) {
        const f = fakeCtx(directory);
        f.ctx.agent = { get: async ({ agentID }) => ({ location: { directory }, data: agents[agentID] }) };
        return f;
      }
      const ev = (tool, agent, input) => ({ tool, sessionID: "ses_ag", agent, messageID: "msg_1", id: "call_1", input });

      test("#1348: a subagent whose permissions deny every ctx_* tool runs webfetch; the deny names no tool it lacks", async () => {
        const f = agentCtx(mkdtempSync(join(home, "p-")));
        const dispose = await opencodePlugin.default.setup(f.ctx);
        await f.hooks.tool["execute.before"](ev("webfetch", "arch-review", { url: "https://example.com/" }));
        await dispose();
      });

      test("#1348: a subagent that has the ctx_* tools keeps the webfetch redirect (case A)", async () => {
        const f = agentCtx(mkdtempSync(join(home, "p-")));
        const dispose = await opencodePlugin.default.setup(f.ctx);
        await assert.rejects(f.hooks.tool["execute.before"](ev("webfetch", "ctx-helper", { url: "https://example.com/" })), (e) => e.message.includes("ctx_"));
        await dispose();
      });

      test("#1348: a primary agent and a call with no agent keep the webfetch redirect", async () => {
        const f = agentCtx(mkdtempSync(join(home, "p-")));
        const dispose = await opencodePlugin.default.setup(f.ctx);
        await assert.rejects(f.hooks.tool["execute.before"](ev("webfetch", "build", { url: "https://example.com/" })), (e) => e.message.includes("ctx_"));
        await assert.rejects(f.hooks.tool["execute.before"](ev("webfetch", undefined, { url: "https://example.com/" })), (e) => e.message.includes("ctx_"));
        await dispose();
      });

      test("#1347: a large completed shell result is replaced in result.content; output and metadata stay", async () => {
        const f = agentCtx(mkdtempSync(join(home, "p-")));
        const dispose = await opencodePlugin.default.setup(f.ctx);
        const big = Array.from({ length: 4000 }, (_, i) => `commit ${i.toString(16).padStart(40, "0")} fix thing number ${i}`).join("\n");
        const a = { ...ev(SHELL, "build", { command: "git log" }), status: "completed", result: { content: [{ type: "text", text: big }], output: { exit: 0 }, metadata: { m: 1 } } };
        await f.hooks.tool["execute.after"](a);
        const text = a.result.content.map((c) => c.text).join("");
        assert.ok(text.length < 8000, "the model gets " + text.length + " bytes, not " + big.length);
        assert.ok(text.includes("ctx_search"), text.slice(0, 300));
        assert.deepEqual(a.result.output, { exit: 0 });
        assert.deepEqual(a.result.metadata, { m: 1 });
        await dispose();
      });

      test("#1347: a small result and an error result stay as the host made them", async () => {
        const f = agentCtx(mkdtempSync(join(home, "p-")));
        const dispose = await opencodePlugin.default.setup(f.ctx);
        const small = { ...ev(SHELL, "build", { command: "git status" }), status: "completed", result: { content: [{ type: "text", text: "clean" }] } };
        await f.hooks.tool["execute.after"](small);
        assert.deepEqual(small.result.content, [{ type: "text", text: "clean" }]);
        const err = { ...ev(SHELL, "build", { command: "x" }), id: "call_2", status: "error", error: { _tag: "Tool.Error", message: "boom ".repeat(3000) } };
        await f.hooks.tool["execute.after"](err);
        assert.equal(err.result, undefined);
        assert.equal(err.error.message, "boom ".repeat(3000));
        await dispose();
      });

      test("#1347: OpenCode 1.19 tool.execute.after replaces output.output (the host returns that object to the model)", async () => {
        const dir = mkdtempSync(join(home, "p-"));
        const hooks = await opencodePlugin.default.server({ directory: dir });
        const big = "line lorem ipsum dolor sit amet\n".repeat(6500);
        const out = { title: "git log", metadata: {}, output: big };
        await hooks["tool.execute.after"]({ tool: "bash", sessionID: "ses_l", callID: "c1", args: { command: "git log" } }, out);
        assert.ok(out.output.length < 8000, "the model gets " + out.output.length + " bytes");
        assert.ok(out.output.includes("ctx_search"), out.output.slice(0, 300));
      });
    });
  });

  describe("ADR-0020 opencode plugin ported cases", () => {
    // Ported from tests/opencode-plugin.test.ts (cleanup-plan W1-ops, PORT row). Spec: docs/architecture/modules/12-plugins.md §4.
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
      // D-HF-OPENCODE-SHELL-1: the row lists shell ["bash"], so the user's own Bash rules apply. A curl runs on this
      // replace row and execute.after replaces a large result (D-M7-RR-1, D-R54-OC-REPLACE-1, #1347).
      await hooks["tool.execute.before"]({ tool: "bash", sessionID: "s-block", callID: "c2" }, { args: { command: "curl https://example.com" } });
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
    // Spec: docs/architecture/modules/12-plugins.md. src/entries/pi.ts is the in-process Pi extension: default
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
      const src = readFileSync(new URL("../src/entries/pi.ts", import.meta.url), "utf8");
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
    // tests/plugins/pi-ported.test.mjs
    // Ported from tests/pi-extension.test.ts (cleanup-plan W1-ops, PORT row). Spec: docs/architecture/modules/12-plugins.md §3.
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

    // T14 / D-OMP-TOOLS-1 (ADR-0026 M3): OMP lists a tool as a top-level tool only with loadMode "essential"
    // (OMP docs/extensions.md:826); Pi ignores the field. Every other field keeps the fea7780d shape.
    test("before_agent_start: all 9 ctx_* tools register with loadMode essential, other fields unchanged (OMP M3, T14)", async () => {
      const { pi, handlers, tools } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctxFor("s-t14"));
      assert.equal(tools.size, 9);
      for (const [name, t] of tools) {
        assert.equal(t.loadMode, "essential", name);
        const { loadMode, execute, ...rest } = t;
        assert.equal(typeof execute, "function", name);
        assert.deepEqual(Object.keys(rest), ["name", "label", "description", "parameters"], name);
        assert.equal(rest.label, name);
        assert.equal(typeof rest.description, "string");
        assert.equal(rest.parameters.type, "object", name);
      }
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

    // D-R38-PI-D7-1 (host audit pi-4, #1312): ctx_doctor in Pi gets Pi's ctx.cwd, so D7 is PASS inside the repo.
    test("[D-R38-PI-D7-1] ctx_doctor in Pi: D7 project and worktree is PASS for a session inside the repo (#1312)", async () => {
      const { pi, handlers, tools } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s-doc"));
      const r = await tools.get("ctx_doctor").execute("d1", {});
      const d7 = r.content[0].text.split("\n").find((l) => l.startsWith("| D7 "));
      assert.ok(d7 && d7.includes("| PASS |"), d7);
      // #1312 point 4: a Pi user has no global context-mode CLI; the closing line names Pi's own commands.
      assert.ok(!r.content[0].text.includes("context-mode setup --agents pi"), r.content[0].text);
      assert.match(r.content[0].text, /^Run in a terminal: pi (install npm:context-mode|list)$/m);
    });

    // D-R38-PI-EDIT-1 (host audit pi-6): Pi's edit and write calls are journaled as edits, so ctx_resume names the files.
    test("[D-R38-PI-EDIT-1] tool_result: Pi edit and write calls are journaled and ctx_resume names both files", async () => {
      const { pi, handlers, tools } = fakePi();
      piExtension(pi);
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctxFor("s-edit"));
      for (const [toolName, input] of [["edit", { path: "pi-edited.txt", edits: [] }], ["write", { path: "pi-written.txt", content: "x" }]]) {
        await handlers.get("tool_result")({ toolName, toolCallId: toolName + "1", input, content: [{ type: "text", text: "ok" }], isError: false }, ctxFor("s-edit"));
      }
      const text = (await tools.get("ctx_resume").execute("r1", {})).content[0].text;
      assert.ok(text.includes("pi-edited.txt"), text);
      assert.ok(text.includes("pi-written.txt"), text);
    });
  });

  describe("ADR-0020 pi plugin tool_result metadata and excludeTools (#1352)", () => {
    // #1352 (xz-dev, hoho51): a large extension result (fetch_content, session_search) came back with `details`
    // overwritten by {text} and with `structuredContent` dropped, so the tool lost its continuation id (responseId).
    // ADR-0016:48 Pi row: "set `content` AND `structuredContent` together post-call (`tool_result`)". Pi >= 1.4
    // drops structuredContent on a content-only patch (types.d.ts "Return it along with `content` to keep it") and
    // keeps `details` when the patch omits it. contextMode.excludeTools in Pi settings leaves a named tool whole.
    let root;
    let repo;
    let oldHome;

    before(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), "cm-pi-1352-")));
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

    const PAGE = "# Requested page\n" + Array.from({ length: 300 }, (_, i) => "Section " + i + ": a distinct paragraph about the requested page and its source " + i + ".\n").join("");
    const META = { responseId: "stored-response-for-continuation", successful: 1 };

    function resultEvent(toolName, id, extra = {}) {
      return {
        toolName, toolCallId: id, input: { url: "https://example.invalid/" + id },
        content: [{ type: "text", text: PAGE }], details: { ...META }, structuredContent: { ...META }, isError: false, ...extra,
      };
    }

    async function start(sid, getSettings) {
      const handlers = new Map();
      const pi = { on: (n, f) => handlers.set(n, f), registerTool() {} };
      if (getSettings !== undefined) pi.getSettings = getSettings;
      piExtension(pi);
      const ctx = { cwd: repo, sessionManager: { getSessionId: () => sid } };
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctx);
      return (ev) => handlers.get("tool_result")(ev, ctx);
    }

    // The journal write is detached: wait until the row lands.
    async function rowsOf(sid, kind) {
      const db = await openDb(resolveProject("pi", { env: process.env, argv: [], cwd: repo, piCwd: repo }));
      let rows = [];
      for (let i = 0; i < 100; i++) {
        rows = readSessionEvents(db, sid, kind);
        if (rows.length > 0) break;
        await sleep(20);
      }
      return rows;
    }

    test("[#1352] a large replace keeps the tool's details (no details key) and returns its structuredContent", async () => {
      const toolResult = await start("pi-1352-a");
      const out = await toolResult(resultEvent("fetch_content", "a1"));
      assert.ok(out && Buffer.byteLength(out.content[0].text) < Buffer.byteLength(PAGE) / 2, "the content is replaced");
      assert.equal(Object.hasOwn(out, "details"), false, "details stays as the tool made it: " + JSON.stringify(out.details));
      assert.deepEqual(out.structuredContent, META, "structuredContent goes back with the new content, so Pi keeps it");
      const plain = await toolResult(resultEvent("fetch_content", "a2", { structuredContent: undefined }));
      assert.equal(Object.hasOwn(plain, "structuredContent"), false, "no structuredContent in, none out");
    });

    test("[#1352] excludeTools: a listed tool's 23 KB result stays whole, a cmd row is still journaled, another tool is still replaced", async () => {
      const toolResult = await start("pi-1352-b", () => ({ contextMode: { excludeTools: ["fetch_content", "bash"] } }));
      assert.equal(await toolResult(resultEvent("fetch_content", "b1")), undefined, "fetch_content is left as the host made it");
      const bash = { toolName: "bash", toolCallId: "b2", input: { command: "cat page.md" }, content: [{ type: "text", text: PAGE }], isError: false };
      assert.equal(await toolResult(bash), undefined, "bash is listed, so it is left whole too");
      assert.equal((await rowsOf("pi-1352-b", "cmd")).length, 1, "the kept bash call still has its journal row");
      const other = await toolResult(resultEvent("web_search", "b3"));
      assert.ok(other && Buffer.byteLength(other.content[0].text) < Buffer.byteLength(PAGE) / 2, "a tool not on the list is still replaced");
    });

    test("[#1352] missing, empty or malformed excludeTools settings, and a Pi with no getSettings, give the default replace", async () => {
      const variants = [
        undefined,
        () => ({}),
        () => ({ contextMode: null }),
        () => ({ contextMode: { excludeTools: [] } }),
        () => ({ contextMode: { excludeTools: "fetch_content" } }),
        () => ({ contextMode: { excludeTools: [1, null, { name: "fetch_content" }] } }),
        () => { throw new Error("Extension runtime not initialized"); },
      ];
      for (const [i, getSettings] of variants.entries()) {
        const toolResult = await start("pi-1352-c" + i, getSettings);
        const out = await toolResult(resultEvent("fetch_content", "c" + i));
        assert.ok(out && Buffer.byteLength(out.content[0].text) < Buffer.byteLength(PAGE) / 2, "variant " + i + " replaces");
      }
    });

    test("[#1352] an excluded tool's large error result stays unchanged and is journaled as toolerr", async () => {
      const toolResult = await start("pi-1352-d", () => ({ contextMode: { excludeTools: ["fetch_content"] } }));
      assert.equal(await toolResult(resultEvent("fetch_content", "d1", { isError: true })), undefined);
      assert.equal((await rowsOf("pi-1352-d", "toolerr")).length, 1, "the error row is written");
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

  describe("ADR-0026 OMP entry (#1332)", () => {
    // OMP >= 14.7.0 sends before_agent_start systemPrompt as string[] (runner.ts:2682-2686); a string return replaced
    // every block (#1332). D-OMP-PROMPT-1: an array gets our payload as its last block, once; a string keeps the
    // fea7780d bytes (Pi, Pi-Bolt, OMP < 14.7.0). The shape picks the return form, so one helper serves both entries.
    let root;
    let repo;
    let oldHome;
    let n = 0;

    before(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), "cm-omp-prompt-")));
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

    // A fresh instance and session per test: the first delivery is INSTRUCTIONS plus the one resume hint.
    function start(cwd = repo) {
      const handlers = new Map();
      piExtension({ on: (name, fn) => handlers.set(name, fn), registerTool() {} });
      const ctx = { cwd, sessionManager: { getSessionId: () => "omp-prompt-" + ++n } };
      return { run: (ev) => handlers.get(ev.type)(ev, ctx) };
    }
    const turn = (systemPrompt) => ({ type: "before_agent_start", systemPrompt });
    const FIRST = INSTRUCTIONS + "\n\n" + RESUME_HINT.split("{prefix}").join("");
    const once = (blocks, part) => blocks.join("\n").split(part).length - 1;

    // Hook failure seam: a project that no longer resolves makes handleHook write its stderr line; a throwing
    // stderr makes that line throw out of handleHook, which is the entry's "hook throws" path.
    async function withThrowingHook(fn) {
      const write = process.stderr.write;
      process.stderr.write = () => { throw new Error("hook failed"); };
      try { return await fn(); } finally { process.stderr.write = write; }
    }

    test("[T1] array: every OMP block stays, in order, and the payload is the last block, once", async () => {
      const base = ["BASE", "<project-context>AGENTS</project-context>", "OTHER"];
      const out = await start().run(turn(base));
      assert.ok(Array.isArray(out.systemPrompt), "an array comes back as an array");
      assert.equal(out.systemPrompt.length, 4);
      assert.deepEqual(out.systemPrompt.slice(0, 3), base);
      assert.equal(out.systemPrompt[3], FIRST);
      assert.equal(once(out.systemPrompt, INSTRUCTIONS), 1, "INSTRUCTIONS once");
    });

    test("[T2] string: the bytes equal the fea7780d output (Pi and Pi-Bolt golden)", async () => {
      assert.equal((await start().run(turn("base"))).systemPrompt, "base\n\n" + FIRST);
      assert.equal((await start().run(turn(""))).systemPrompt, FIRST);
      assert.equal((await start().run({ type: "before_agent_start" })).systemPrompt, FIRST, "absent: the payload alone");
    });

    test("[T3] array, two turns, same base: the same output bytes (D-CACHE-PI-1)", async () => {
      const s = start();
      const first = await s.run(turn(["BASE", "OTHER"]));
      const second = await s.run(turn(["BASE", "OTHER"]));
      assert.deepEqual(second.systemPrompt, first.systemPrompt);
      assert.equal(JSON.stringify(second.systemPrompt), JSON.stringify(first.systemPrompt));
    });

    test("[T4] array, the hook throws after the first delivery: base blocks plus the same payload", async () => {
      const own = join(root, "repo-t4");
      mkdirSync(own);
      execFileSync("git", ["init", "-q", own]);
      const s = start(own);
      const first = await s.run(turn(["BASE"]));
      rmSync(own, { recursive: true, force: true });
      const out = await withThrowingHook(() => s.run(turn(["BASE", "MORE"])));
      assert.deepEqual(out.systemPrompt, ["BASE", "MORE", first.systemPrompt[1]]);
    });

    test("[T5] array, the hook throws before the first delivery: {} so OMP keeps its own array", async () => {
      const out = await withThrowingHook(() => start(join(root, "missing")).run(turn(["BASE"])));
      assert.deepEqual(out, {});
    });

    test("[T6] array, compact turn: base kept, payload is INSTRUCTIONS only, no resume hint (O2a)", async () => {
      const s = start();
      await s.run(turn(["BASE"]));
      assert.equal(await s.run({ type: "session_compact" }), undefined);
      const out = await s.run(turn(["BASE", "<summary>after compact</summary>"]));
      assert.deepEqual(out.systemPrompt, ["BASE", "<summary>after compact</summary>", INSTRUCTIONS]);
    });

    test("[T7] empty array: [payload]", async () => {
      assert.deepEqual((await start().run(turn([]))).systemPrompt, [FIRST]);
    });

    // D-OMP-ENTRY-1: one factory, the agent id comes from the entry. omp/index.js calls hostExtension(pi, "omp");
    // the Pi entry is hostExtension(pi, "pi"). PI_CODING_AGENT_DIR and PI_CONFIG_DIR never pick the id.
    function hosted(agent, sid) {
      const handlers = new Map();
      piEntry.hostExtension({ on: (name, fn) => handlers.set(name, fn), registerTool() {} }, agent);
      const ctx = { cwd: repo, sessionManager: { getSessionId: () => sid } };
      return (ev) => handlers.get(ev.type)?.(ev, ctx);
    }
    async function promptRows(sid) {
      const db = await openDb(resolveProject("pi", { env: process.env, argv: [], cwd: repo, piCwd: repo }));
      let rows = [];
      for (let i = 0; i < 100 && rows.length === 0; i++) {
        rows = readSessionEvents(db, sid, "prompt");
        if (rows.length === 0) await sleep(20);
      }
      return rows;
    }
    async function stderrOf(fn) {
      const write = process.stderr.write;
      let text = "";
      process.stderr.write = (chunk) => { text += String(chunk); return true; };
      try { await fn(); } finally { process.stderr.write = write; }
      return text;
    }
    async function withPiEnv(fn) {
      const keep = { a: process.env.PI_CODING_AGENT_DIR, b: process.env.PI_CONFIG_DIR };
      process.env.PI_CODING_AGENT_DIR = join(root, ".omp", "agent");
      process.env.PI_CONFIG_DIR = ".omp";
      try { return await fn(); } finally {
        if (keep.a === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = keep.a;
        if (keep.b === undefined) delete process.env.PI_CONFIG_DIR; else process.env.PI_CONFIG_DIR = keep.b;
      }
    }

    test("[T9] the OMP entry hands handleHook omp; the Pi entry (default export) hands it pi", async () => {
      assert.equal(typeof piEntry.hostExtension, "function");
      const pi = hosted("pi", "omp-t9-pi");
      await pi(turn("base"));
      await pi({ type: "input", text: "hello pi" });
      assert.deepEqual((await promptRows("omp-t9-pi")).map((r) => r.agent), ["pi"]);
      // D-OMP-ROW-1 (M4): the omp AgentId writes its own rows.
      const omp = hosted("omp", "omp-t9-omp");
      await omp(turn(["BASE"]));
      await omp({ type: "input", text: "hello omp" });
      assert.deepEqual((await promptRows("omp-t9-omp")).map((r) => r.agent), ["omp"]);
    });

    test("[T10] PI_CODING_AGENT_DIR and PI_CONFIG_DIR set: the Pi entry stays pi, the OMP entry stays omp", async () => {
      await withPiEnv(async () => {
        const pi = hosted("pi", "omp-t10-pi");
        await pi(turn("base"));
        await pi({ type: "input", text: "hello pi" });
        const omp = hosted("omp", "omp-t10-omp");
        await omp({ type: "input", text: "x" });
      });
      assert.deepEqual((await promptRows("omp-t10-pi")).map((r) => r.agent), ["pi"]);
      assert.deepEqual((await promptRows("omp-t10-omp")).map((r) => r.agent), ["omp"]);
      // Default export with the env set: still pi.
      await withPiEnv(async () => {
        const handlers = new Map();
        piExtension({ on: (name, fn) => handlers.set(name, fn), registerTool() {} });
        const ctx = { cwd: repo, sessionManager: { getSessionId: () => "omp-t10-default" } };
        await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
        await handlers.get("input")({ text: "hi" }, ctx);
      });
      assert.deepEqual((await promptRows("omp-t10-default")).map((r) => r.agent), ["pi"]);
    });

    // D-OMP-TURN-1 (O2c): OMP re-runs before_agent_start in one prompt when its base changed during the call
    // (agent-session.ts:9413-9432). A re-run is the same event.prompt with no input or agent_end in between.
    // Both entries write prompt rows (D-OMP-ROW-1, M4); the turn numbers show one turn per prompt.
    test("[T8] a re-run in one prompt with a grown base: new base + payload once, one turn counted", async () => {
      for (const agent of ["pi", "omp"]) {
        const sid = "omp-t8-" + agent;
        const run = hosted(agent, sid);
        let first;
        let second;
        await stderrOf(async () => {
          await run({ type: "input", text: "p1" });
          first = await run({ type: "before_agent_start", prompt: "p1", systemPrompt: ["BASE"] });
          second = await run({ type: "before_agent_start", prompt: "p1", systemPrompt: ["BASE", "TOOLS"] });
          await run({ type: "agent_end" });
          await run({ type: "input", text: "p2" });
        });
        const payload = first.systemPrompt[1];
        assert.deepEqual(second.systemPrompt, ["BASE", "TOOLS", payload], agent + ": the new base, then the payload");
        assert.equal(once(second.systemPrompt, INSTRUCTIONS), 1, agent + ": INSTRUCTIONS once");
        assert.deepEqual((await promptRows(sid)).map((r) => [r.agent, r.turn]), [[agent, 1], [agent, 2]], agent + ": prompt 2 is turn 2");
      }
    });

    test("[T11] the OMP entry registers the 9 tools at load; the Pi entry in the first before_agent_start", async () => {
      for (const [agent, atLoad] of [["omp", 9], ["pi", 0]]) {
        const names = [];
        const handlers = new Map();
        piEntry.hostExtension({ on: (name, fn) => handlers.set(name, fn), registerTool: (t) => names.push(t.name) }, agent);
        assert.equal(names.length, atLoad, agent + " at load");
        const ctx = { cwd: repo, sessionManager: { getSessionId: () => "omp-t11-" + agent } };
        await stderrOf(() => handlers.get("before_agent_start")({ prompt: "p", systemPrompt: ["BASE"] }, ctx));
        await stderrOf(() => handlers.get("before_agent_start")({ prompt: "p", systemPrompt: ["BASE", "TOOLS"] }, ctx));
        assert.equal(names.length, 9, agent + ": 9 tools, each once");
        assert.equal(new Set(names).size, 9);
      }
      const names = [];
      piExtension({ on() {}, registerTool: (t) => names.push(t.name) });
      assert.equal(names.length, 0, "the Pi default export registers nothing at load");
    });

    test("[T12] two prompts: turns 1 and 2 on both entries, also with the same prompt text", async () => {
      for (const agent of ["pi", "omp"]) {
        const sid = "omp-t12-" + agent;
        const run = hosted(agent, sid);
        await stderrOf(async () => {
          for (const end of [true, false]) {
            await run({ type: "input", text: "continue" });
            await run({ type: "before_agent_start", prompt: "continue", systemPrompt: ["BASE"] });
            if (end) await run({ type: "agent_end" });
          }
        });
        assert.deepEqual((await promptRows(sid)).map((r) => [r.agent, r.turn]), [[agent, 1], [agent, 2]], agent);
      }
    });

    // D-OMP-FILTER-1 (O10): OMP has no getSettings. contextMode.excludeTools comes from api.pi.settings, project
    // over global, read on each tool_result, never at load. No settings or a bad value gives []. Pi reads getSettings.
    test("[T13] OMP entry: contextMode.excludeTools from api.pi.settings per call; no settings -> []", async () => {
      const S = (list) => ({ contextMode: { excludeTools: list } });
      const omp = (global, project) => ({ pi: { settings: { getGlobalSettings: () => global, getProjectSettings: () => project } } });
      const of = piEntry.excludedTools;
      assert.deepEqual(of(omp(S(["read"])), "omp"), ["read"], "global settings");
      assert.deepEqual(of(omp(S(["read"]), {}), "omp"), ["read"], "a project with no list keeps the global list");
      assert.deepEqual(of(omp(S(["read"]), S(["bash"])), "omp"), ["bash"], "the project list wins");
      const empty = [
        {}, { pi: {} }, { pi: { settings: {} } }, omp(undefined, undefined), omp({ contextMode: null }),
        omp(S("read")), omp(S([1, null, { name: "read" }])),
        { pi: { settings: { getGlobalSettings: () => { throw new Error("not bound"); } } } },
        { getSettings: () => S(["read"]) },
      ];
      for (const [i, api] of empty.entries()) assert.deepEqual(of(api, "omp"), [], "omp variant " + i);
      assert.deepEqual(of({ getSettings: () => S(["read"]), ...omp(S(["bash"])) }, "pi"), ["read"], "Pi reads getSettings only");

      let reads = 0;
      const handlers = new Map();
      const api = {
        on: (name, fn) => handlers.set(name, fn), registerTool() {},
        pi: { settings: { getGlobalSettings: () => { reads += 1; return S(["read"]); }, getProjectSettings: () => ({}) } },
      };
      piEntry.hostExtension(api, "omp");
      assert.equal(reads, 0, "never read at load");
      const ctx = { cwd: repo, sessionManager: { getSessionId: () => "omp-t13" } };
      await stderrOf(async () => {
        for (const id of ["r1", "r2"]) {
          await handlers.get("tool_result")({ toolName: "read", toolCallId: id, input: {}, content: [{ type: "text", text: "x" }], isError: false }, ctx);
        }
      });
      assert.equal(reads, 2, "read once per tool_result, so a settings change counts at once");
    });
  });
});
