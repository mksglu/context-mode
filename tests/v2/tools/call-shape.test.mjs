// tests/v2/tools/call-shape.test.mjs
// Owner report: Pi rejected `ctx_search` called with {} ("queries: must have required properties queries").
// Contract for every host (DEVIATIONS D-CALL-SHAPE-1):
//   1. each tool description leads with one exact example call and names the required fields (one source:
//      src/prompt/tools/<tool>.md); the example is valid input for the tool's own schema;
//   2. a call that reaches our code with {} or a wrong shape gets ONE isError line that shows the exact call;
//   3. the schema every MCP host receives keeps `required`, and is the same on all MCP hosts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { z } from "zod/v4";

import { TOOLS, checkCall } from "../../../src/core/tools/registry.ts";
import { AGENT_IDS } from "../../../src/core/contracts/agents.ts";
import { DESCRIPTION_CAP, SURFACE_CAP } from "../../../src/core/contracts/constants.ts";
import piExtension from "../../../src/entries/pi.ts";
import * as opencodePlugin from "../../../src/entries/opencode.ts";
import { spawnBundle } from "../../../e2e/harness/mcp-client.mjs";

const REPO = join(import.meta.dirname, "..", "..", "..");
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
  rmSync(root, { recursive: true, force: true, maxRetries: 3 });
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
    await opencodePlugin.setup({ directory: repo, tool: (n, def) => registered.set(n, def) });
    const out = await registered.get(name).execute(input, { sessionID: "oc-1" });
    assert.equal(typeof out, "string");
    assert.ok(oneLine(out), out);
    assert.ok(out.includes(exampleOf(tool.description)), out);
  });
}

test("Pi and OpenCode register the description and the schema the MCP hosts get", async () => {
  const pi = await fakePi();
  const registered = new Map();
  await opencodePlugin.setup({ directory: repo, tool: (n, def) => registered.set(n, def) });
  for (const tool of TOOLS) {
    assert.equal(pi.get(tool.name).description, tool.description);
    assert.equal(registered.get(tool.name).description, tool.description);
    const want = z.toJSONSchema(tool.schema, { target: "draft-2020-12", io: "input" }).required ?? [];
    const got = pi.get(tool.name).parameters.required ?? [];
    assert.deepEqual(got, want, tool.name);
  }
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
