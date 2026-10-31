// tests/v2/0007-mcp-server.test.mjs
// Area: ADR-0004, ADR-0005, ADR-0007, PRD-v2 sections 6-7: MCP server, tool registry, call shapes.
// One file per ADR area (ADR-0024).
import { describe, test, before, after } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { z } from "zod/v4";
import { TOOLS, checkCall } from "../../src/core/tools/registry.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { DESCRIPTION_CAP, SURFACE_CAP } from "../../src/core/contracts/constants.ts";
import { ctxResume } from "../../src/core/tools/resume.ts";
import { ctxStats } from "../../src/core/tools/stats.ts";
import { ctxPurge } from "../../src/core/tools/purge.ts";
import { ctxDoctor } from "../../src/core/tools/doctor.ts";
import { ctxUpgrade } from "../../src/core/tools/upgrade.ts";
import { installExitGuard } from "../../src/core/lifecycle/exit.ts";
import { INSTRUCTIONS } from "../../src/entries/server.ts";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import piExtension from "../../src/entries/pi.ts";
import * as opencodePlugin from "../../src/entries/opencode.ts";
import { spawnBundle } from "../../e2e/harness/mcp-client.mjs";

describe("ADR-0005 tool registry", { concurrency: CONC }, () => {
  // Unit tests for src/core/tools/registry.ts (impl/11 §1). TOOLS: readonly ToolDef<any>[], fixed order of 9.

  test("TOOLS has exactly the 9 tools in TOOL_ORDER order", () => {
    assert.deepEqual(TOOLS.map((t) => t.name), [...C.TOOL_ORDER]);
  });

  test("TOOLS is frozen", () => {
    assert.ok(Object.isFrozen(TOOLS));
  });

  test("readOnly is true only for ctx_search, ctx_resume, ctx_stats", () => {
    const readOnlyNames = TOOLS.filter((t) => t.readOnly).map((t) => t.name).sort();
    assert.deepEqual(readOnlyNames, ["ctx_resume", "ctx_search", "ctx_stats"]);
  });

  test("alwaysLoad is true only for ctx_execute", () => {
    const alwaysLoadNames = TOOLS.filter((t) => t.alwaysLoad).map((t) => t.name);
    assert.deepEqual(alwaysLoadNames, ["ctx_execute"]);
  });

  test("every ToolDef has a name, description, schema and handler", () => {
    for (const t of TOOLS) {
      assert.equal(typeof t.name, "string");
      assert.equal(typeof t.description, "string");
      assert.ok(t.schema);
      assert.equal(typeof t.handler, "function");
    }
  });

  test("no tool named ctx_route is registered (internal-only dispatch target)", () => {
    assert.ok(!TOOLS.some((t) => t.name === "ctx_route"));
  });

  // impl/11 §1 step 1, D-M4-arch-3: from M4 the session tools are the real modules, not the not-built stub.

  for (const [name, mod] of [["ctx_resume", ctxResume], ["ctx_stats", ctxStats], ["ctx_purge", ctxPurge]]) {
    test(name + " uses the real module's handler and schema (M4 stub dropped)", () => {
      const t = TOOLS.find((x) => x.name === name);
      assert.equal(t.handler, mod.handler);
      assert.equal(t.schema, mod.schema);
    });
  }

  // D-M5-arch-6: from M5 ctx_doctor and ctx_upgrade are the real modules; no tool is a stub.

  for (const [name, mod] of [["ctx_doctor", ctxDoctor], ["ctx_upgrade", ctxUpgrade]]) {
    test(name + " uses the real module's handler and schema (M5 stub dropped)", () => {
      const t = TOOLS.find((x) => x.name === name);
      assert.equal(t.handler, mod.handler);
      assert.equal(t.schema, mod.schema);
    });
  }
});

  // serial: t.mock replaces process.kill and setTimeout
describe("ADR-0004 server entry and exit guard", () => {
  // Unit tests for src/entries/server.ts (impl/11 §5) and src/core/lifecycle/exit.ts (impl/11 §4).

  test("INSTRUCTIONS is a non-empty string under INSTRUCTIONS_CAP", () => {
    assert.equal(typeof INSTRUCTIONS, "string");
    assert.ok(INSTRUCTIONS.length > 0);
    assert.ok(INSTRUCTIONS.length <= C.INSTRUCTIONS_CAP);
  });

  test("INSTRUCTIONS carries no case-sensitive lint-banned words (ADR-0005)", () => {
    for (const banned of ["MUST", "NEVER", "ALWAYS", "CRITICAL", "MANDATORY", "IMPORTANT", "REQUIRED", "DO NOT"]) {
      assert.ok(!INSTRUCTIONS.includes(banned), banned);
    }
  });

  test("installExitGuard registers nothing on stdin when isTTY is true", () => {
    const before = process.stdin.listenerCount("end");
    installExitGuard({ onShutdown: () => {}, isTTY: true });
    assert.equal(process.stdin.listenerCount("end"), before);
  });

  test("installExitGuard attaches an 'end' listener when isTTY is false", () => {
    const beforeListeners = process.stdin.listeners("end");
    installExitGuard({ onShutdown: () => {}, isTTY: false });
    const afterListeners = process.stdin.listeners("end");
    assert.equal(afterListeners.length, beforeListeners.length + 1);
    // Remove the listener this test added, so a later 'end' emit does not fire it (D-M2-F1-1).
    process.stdin.removeListener("end", afterListeners.find((l) => !beforeListeners.includes(l)));
  });

  // The real guard sends SIGTERM to process.pid on 'end' (impl/11 §4 step 4), which would kill
  // this test runner. So process.kill and setTimeout are mocked: the test checks onShutdown, the
  // SIGTERM sent at once, and the SIGKILL sent after EXIT_SIGKILL_MS (D-M2-F1-1).
  test("installExitGuard calls onShutdown on stdin 'end', then SIGTERM, then SIGKILL", (t) => {
    const kills = [];
    t.mock.method(process, "kill", (pid, sig) => { kills.push([pid, sig]); return true; });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let called = false;
    installExitGuard({ onShutdown: () => { called = true; }, isTTY: false });
    process.stdin.emit("end");
    assert.equal(called, true);
    assert.deepEqual(kills, [[process.pid, "SIGTERM"]]);
    t.mock.timers.tick(C.EXIT_SIGKILL_MS - 1);
    assert.deepEqual(kills, [[process.pid, "SIGTERM"]]);
    t.mock.timers.tick(1);
    assert.deepEqual(kills, [[process.pid, "SIGTERM"], [process.pid, "SIGKILL"]]);
  });

  // D-CR2-SID-1: the MCP server uses the session id the hooks journal under, when the host exposes it.
  test("sessionIdOf: _meta first, then the host session env, then mcp:<serverId>", async () => {
    const { sessionIdOf } = await import("../../src/entries/server.ts");
    const env = { CLAUDE_CODE_SESSION_ID: "280ff837-09ba-4152-bb02-89ec3a42eca9" };
    assert.equal(sessionIdOf({ sessionId: "m-1" }, "claude-code", env, "srv"), "m-1");
    assert.equal(sessionIdOf(undefined, "claude-code", env, "srv"), "280ff837-09ba-4152-bb02-89ec3a42eca9");
    assert.equal(sessionIdOf(undefined, "claude-code", {}, "srv"), "mcp:srv");
    assert.equal(sessionIdOf(undefined, "claude-code", { CLAUDE_CODE_SESSION_ID: "" }, "srv"), "mcp:srv");
    // A host without a session env keeps the process-local id.
    assert.equal(sessionIdOf(undefined, "gemini", env, "srv"), "mcp:srv");
    assert.equal(sessionIdOf(undefined, undefined, env, "srv"), "mcp:srv");
  });
});

  // serial: before/after set process.env.HOME
describe("ADR-0007 call shape on every host", () => {
  // Owner report: Pi rejected `ctx_search` called with {} ("queries: must have required properties queries").
  // Contract for every host (DEVIATIONS D-CALL-SHAPE-1):
  //   1. each tool description leads with one exact example call and names the required fields (one source:
  //      src/prompt/tools/<tool>.md); the example is valid input for the tool's own schema;
  //   2. a call that reaches our code with {} or a wrong shape gets ONE isError line that shows the exact call;
  //   3. the schema every MCP host receives keeps `required`, and is the same on all MCP hosts.


  const REPO = join(import.meta.dirname, "..", "..");
  let root;
  let repo;
  let bundleDir;
  let oldHome;

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cm-call-shape-")));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    oldHome = process.env.HOME;
    process.env.HOME = root;
    process.env.USERPROFILE = root;
    bundleDir = join(root, "bundle");
    const r = spawnSync(process.execPath, [join(REPO, "build", "build.mjs"), "--out", bundleDir], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });

  after(() => {
    process.env.HOME = oldHome;
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      // Same rule as tests/v2/plugins/pi-ops-ported.test.mjs: Windows keeps the in-process DB file open.
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  });

  // The example call is the text between the first pair of backticks in the description.
  function exampleOf(description) {
    const a = description.indexOf("`");
    const b = description.indexOf("`", a + 1);
    return a < 0 || b < 0 ? "" : description.slice(a + 1, b);
  }
  const requiredOf = (tool) => z.toJSONSchema(tool.schema, { target: "draft-2020-12", io: "input" }).required ?? [];
  const oneLine = (text) => !text.includes("\n") && !text.includes("\n    at ") && !text.includes("ZodError");

  for (const tool of TOOLS) {
    test(`${tool.name}: description leads with one exact example call that its own schema accepts`, () => {
      assert.ok(tool.description.startsWith("Example: `" + tool.name + "("), tool.description.slice(0, 80));
      const call = exampleOf(tool.description);
      assert.ok(call.startsWith(tool.name + "(") && call.endsWith(")"), call);
      const args = vm.runInNewContext("(" + call.slice(tool.name.length + 1, -1) + ")");
      const parsed = tool.schema.safeParse(args);
      assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    });

    test(`${tool.name}: description names the required fields`, () => {
      const req = requiredOf(tool);
      const line = tool.description.slice(tool.description.indexOf("Required:"));
      assert.ok(tool.description.includes("Required:"), tool.description.slice(0, 160));
      for (const f of req) assert.ok(line.slice(0, 120).includes(f), `${f} in ${line.slice(0, 120)}`);
      if (req.length === 0) assert.ok(line.startsWith("Required: none") || line.startsWith("Required: one of"), line.slice(0, 60));
      assert.ok(tool.description.length <= DESCRIPTION_CAP);
    });
  }

  test("surface stays under SURFACE_CAP", () => {
    assert.ok(TOOLS.reduce((n, t) => n + t.description.length, 0) <= SURFACE_CAP);
  });

  const BAD = [
    ["ctx_search", {}],
    ["ctx_search", { queries: "auth" }],
    ["ctx_search", { query: "auth" }],
    ["ctx_execute", {}],
    ["ctx_execute", { code: "ls" }],
    ["ctx_batch", {}],
    ["ctx_batch", { commands: ["ls"] }],
    ["ctx_resume", { seq: "x" }],
    ["ctx_upgrade", { mode: 5 }],
  ];

  for (const [name, input] of BAD) {
    const tool = TOOLS.find((t) => t.name === name);
    test(`checkCall ${name} ${JSON.stringify(input)}: one isError line that shows the exact call`, () => {
      const out = checkCall(tool, input);
      assert.equal(out.ok, false);
      assert.ok(oneLine(out.line), out.line);
      assert.ok(out.line.includes(exampleOf(tool.description)), out.line);
    });
  }

  async function fakePi() {
    const tools = new Map();
    const handlers = new Map();
    piExtension({ on: (n, fn) => handlers.set(n, fn), registerTool: (t) => tools.set(t.name, t) });
    await handlers.get("before_agent_start")({ systemPrompt: "base" }, { cwd: repo, sessionManager: { getSessionId: () => "pi-1" } });
    return tools;
  }

  for (const [name, input] of BAD) {
    const tool = TOOLS.find((t) => t.name === name);
    test(`Pi ${name} ${JSON.stringify(input)}: the thrown line shows the exact call`, async () => {
      const pi = await fakePi();
      await assert.rejects(
        () => pi.get(name).execute("c1", input),
        (err) => oneLine(err.message) && err.message.includes(exampleOf(tool.description)),
      );
    });

    test(`OpenCode ${name} ${JSON.stringify(input)}: the returned line shows the exact call`, async () => {
      const registered = new Map();
      await opencodePlugin.setupLegacy({ directory: repo, tool: (n, def) => registered.set(n, def) });
      const out = await registered.get(name).execute(input, { sessionID: "oc-1" });
      assert.equal(typeof out, "string");
      assert.ok(oneLine(out), out);
      assert.ok(out.includes(exampleOf(tool.description)), out);
    });
  }

  test("Pi and OpenCode register the description and the schema the MCP hosts get", async () => {
    const pi = await fakePi();
    const registered = new Map();
    await opencodePlugin.setupLegacy({ directory: repo, tool: (n, def) => registered.set(n, def) });
    for (const tool of TOOLS) {
      assert.equal(pi.get(tool.name).description, tool.description);
      assert.equal(registered.get(tool.name).description, tool.description);
      const want = z.toJSONSchema(tool.schema, { target: "draft-2020-12", io: "input" }).required ?? [];
      const got = pi.get(tool.name).parameters.required ?? [];
      assert.deepEqual(got, want, tool.name);
    }
  });

  // D-C166-NATIVE-CWD-1 (tester report, Codex 0.166.0-alpha.5.1, Windows): the native plugin route starts the MCP
  // server with cwd = the plugin cache dir (mcp.json "cwd": "."), roots [] and no workspace env. Codex sends the
  // workspace only as _meta["codex/sandbox-state-meta"].sandboxCwd (file URL), and only to a server that declares
  // that experimental capability at initialize (probed on 0.166.0-alpha.5.1, macOS). Project = that workspace.
  const SANDBOX_META = "codex/sandbox-state-meta";
  const codexClient = (cwd) => spawnBundle(join(bundleDir, "server.mjs"), { HOME: root, USERPROFILE: root }, ["--agent", "codex"], { cwd });
  const hello = (client) => client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "codex-mcp-client", version: "0" } });

  test("server declares the codex/sandbox-state-meta capability, so Codex sends the workspace", async (t) => {
    const client = codexClient(repo);
    t.after(() => client.kill());
    const init = await hello(client);
    assert.ok(init.capabilities.experimental?.[SANDBOX_META] !== undefined, JSON.stringify(init.capabilities));
    await client.close();
  });

  test("codex native plugin: started in the plugin dir, a relative path resolves in the _meta workspace (ctx_index application.log)", async (t) => {
    writeFileSync(join(repo, "application.log"), "2026-10-31 ERROR payment gateway timeout\n");
    const client = codexClient(bundleDir);
    t.after(() => client.kill());
    await hello(client);
    const r = await client.request("tools/call", { name: "ctx_index", arguments: { path: "application.log" }, _meta: { [SANDBOX_META]: { sandboxCwd: pathToFileURL(repo).href } } });
    assert.notEqual(r.isError, true, r.content[0].text);
    assert.ok(r.content[0].text.includes("application.log"), r.content[0].text);
    await client.close();
  });

  test("codex native plugin: an absolute path in the workspace is inside the project, not 'outside the project'", async (t) => {
    const client = codexClient(bundleDir);
    t.after(() => client.kill());
    await hello(client);
    const r = await client.request("tools/call", { name: "ctx_index", arguments: { path: join(repo, "application.log") }, _meta: { [SANDBOX_META]: { sandboxCwd: pathToFileURL(repo).href } } });
    assert.notEqual(r.isError, true, r.content[0].text);
    await client.close();
  });

  test("a server started in its own plugin dir with no host workspace never uses that dir: one line names the fix", async (t) => {
    const client = codexClient(bundleDir);
    t.after(() => client.kill());
    await hello(client);
    const r = await client.request("tools/call", { name: "ctx_index", arguments: { path: "application.log" } });
    assert.equal(r.isError, true);
    const text = r.content[0].text;
    assert.ok(oneLine(text), text);
    assert.ok(text.startsWith("Project source "), text);
    assert.ok(text.includes(". Fix: "), text);
    assert.ok(!text.includes(bundleDir), "must not name the plugin dir as the project: " + text);
    await client.close();
  });

  test("a codex server started in the workspace (npm route) keeps using its cwd, no _meta needed", async (t) => {
    const client = codexClient(repo);
    t.after(() => client.kill());
    await hello(client);
    const r = await client.request("tools/call", { name: "ctx_index", arguments: { path: "application.log" } });
    assert.notEqual(r.isError, true, r.content[0].text);
    await client.close();
  });

  const MCP_AGENTS = AGENT_IDS.filter((a) => a !== "pi" && a !== "opencode");

  test("every MCP host gets the same tools/list: required kept, example first, identical text", async () => {
    let first;
    for (const agent of MCP_AGENTS) {
      const client = spawnBundle(join(bundleDir, "server.mjs"), { HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo }, ["--agent", agent]);
      try {
        await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } });
        const list = await client.request("tools/list", {});
        const view = list.tools.map((t) => ({ name: t.name, description: t.description, required: t.inputSchema.required ?? [] }));
        const search = list.tools.find((t) => t.name === "ctx_search");
        assert.deepEqual(search.inputSchema.required, ["queries"], agent);
        for (const t of list.tools) assert.ok(t.description.startsWith("Example: `" + t.name + "("), `${agent} ${t.name}`);
        first ??= JSON.stringify(view);
        assert.equal(JSON.stringify(view), first, agent + " differs from the first host");
        const bad = await client.request("tools/call", { name: "ctx_search", arguments: {} });
        assert.equal(bad.isError, true, agent);
        assert.ok(oneLine(bad.content[0].text), bad.content[0].text);
      } finally {
        await client.close();
      }
    }
  });
});
