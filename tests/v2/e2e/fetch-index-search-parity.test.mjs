// Owner scenario (Pi session 2026-10-30): "Fetch the React useEffect docs, index them, and find the cleanup pattern
// with code examples." For all 10 hosts: ctx_index {url} then ctx_search {queries}, each the way the host runs it.
//   MCP hosts (claude-code, codex, gemini, qwen, copilot-cli, vscode, kiro, zcode): the built server.mjs --agent <host>
//     over stdio JSON-RPC (vscode also gets --workspace-folder, as setup writes it).
//   pi: src/entries/pi.ts in process, with the documented ctx object ({cwd, sessionManager}) from before_agent_start.
//   opencode: src/entries/opencode.ts in process, with the documented app object ({directory, tool}).
// The page is the saved react.dev fixture, served by a local HTTP server. No internet. safeFetch blocks loopback by
// design, so _parity-net-shim.mjs moves only the last hop (a TEST-NET-3 address resolves and connects to 127.0.0.1);
// the URL parse, DNS check and SSRF check of safeFetch still run.
// Asserted per host: same chunk count, same hit list, same reply bytes, reply under OUTPUT_CAP, no error line.
// Clean snippets (no tag, attribute, flight data) are asserted once the readable-text change is in the tree.
import "./_parity-net-shim.mjs"; // first: patches dns and http.request before safeFetch runs in this process
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = resolve(import.meta.dirname, "../../..");
const BUILD = join(REPO, "build/build.mjs");
const FIXTURE = join(REPO, "tests/v2/fixtures/parity/react-useeffect.html");
const SHIM = join(REPO, "tests/v2/e2e/_parity-net-shim.mjs");
const HOST = "docs.parity.test";
const QUERY = "useEffect cleanup function return pattern";
const OUTPUT_CAP = 16384; // src/core/contracts/constants.ts OUTPUT_CAP: the one bound for every reply
const MCP_HOSTS = ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode"];
const ALL_HOSTS = [...MCP_HOSTS, "pi", "opencode"];

let root, pkg, srv, url, probeUrl;
const results = new Map(); // host -> { indexText, searchText }
const savedEnv = {};

function gitRepo(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir]);
  return realpathSync(dir);
}

before(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cm-parity-")));
  const built = spawnSync(process.execPath, [BUILD, "--out", join(root, "pkg")], { cwd: REPO, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  pkg = join(root, "pkg");
  const page = readFileSync(FIXTURE);
  const probe = "<html><body><h1>Probe</h1><p class=\"zz-attr\">The widget parity probe sentence.</p><script>var zzScript = 1;</script></body></html>";
  srv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url.startsWith("/probe") ? probe : page);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://${HOST}:${srv.address().port}`;
  url = `${base}/reference/react/useEffect`;
  probeUrl = `${base}/probe`;
  for (const k of ["HOME", "USERPROFILE", "CLAUDE_PROJECT_DIR", "PARITY_HOST"]) savedEnv[k] = process.env[k];
  delete process.env.CLAUDE_PROJECT_DIR;
});

after(async () => {
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await new Promise((r) => srv.close(r));
  try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch (err) { if (process.platform !== "win32") throw err; }
});

/** A minimal MCP stdio client: newline-delimited JSON-RPC, one request at a time. */
async function mcpRun(host, home, proj, calls) {
  const args = [join(pkg, "server.mjs"), "--agent", host];
  if (host === "vscode") args.push("--workspace-folder", proj);
  const env = { ...process.env, HOME: home, USERPROFILE: home, NODE_OPTIONS: `--import=${pathToFileURL(SHIM).href}` };
  delete env.CLAUDE_PROJECT_DIR;
  const child = spawn(process.execPath, args, { cwd: proj, env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  let stderr = "";
  let id = 0;
  const pending = new Map();
  child.stdout.on("data", (b) => {
    buf += b;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.trim() === "") continue;
      const m = JSON.parse(line);
      if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  child.stderr.on("data", (b) => { stderr += b; });
  const rpc = (method, params) => new Promise((ok, bad) => {
    const n = ++id;
    const t = setTimeout(() => bad(new Error(`${host}: ${method} timed out. stderr: ${stderr}`)), 30000);
    pending.set(n, (m) => { clearTimeout(t); ok(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  try {
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "parity", version: "1" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const out = [];
    for (const [name, a] of calls) {
      const r = await rpc("tools/call", { name, arguments: a });
      assert.ok(r.result, `${host}: ${name} had no result: ${JSON.stringify(r.error)}`);
      out.push({ text: r.result.content[0].text, isError: r.result.isError === true });
    }
    return { out, stderr };
  } finally {
    child.kill();
  }
}

/** The pi extension, driven as Pi drives it: before_agent_start with ctx, then tool.execute. */
async function piRun(proj, calls) {
  const { default: piExtension } = await import("../../../src/entries/pi.ts");
  const handlers = new Map();
  const tools = new Map();
  piExtension({ on: (n, f) => handlers.set(n, f), registerTool: (t) => tools.set(t.name, t) });
  const ctx = { cwd: proj, sessionManager: { getSessionId: () => "parity-pi" } };
  await handlers.get("before_agent_start")({ systemPrompt: "" }, ctx);
  const out = [];
  for (const [name, a] of calls) {
    try {
      const r = await tools.get(name).execute("call-" + out.length, a);
      out.push({ text: r.content[0].text, isError: false });
    } catch (err) {
      out.push({ text: err.message, isError: true }); // Pi marks a failed call by a throw
    }
  }
  return { out };
}

/** The opencode plugin, driven as OpenCode drives it: setup(app) registers tools, execute(args, {sessionID}). */
async function opencodeRun(proj, calls) {
  const mod = await import("../../../src/entries/opencode.ts");
  const tools = new Map();
  await mod.default.setup({ directory: proj, tool: (name, def) => tools.set(name, def) });
  const out = [];
  for (const [name, a] of calls) {
    const text = await tools.get(name).execute(a, { sessionID: "parity-oc" });
    out.push({ text, isError: /^(Fetch failed|Project source|Blocked|Invalid|Unknown|Internal)/.test(text) });
  }
  return { out };
}

// tag names the temp home and project, so one host can run twice (the probe) without a shared store.
async function runHost(host, calls, { tag = host, mcp = MCP_HOSTS.includes(host) } = {}) {
  const home = join(root, "home-" + tag);
  mkdirSync(home);
  const proj = gitRepo(join(root, "proj-" + tag));
  if (mcp) return mcpRun(host, home, proj, calls);
  process.env.HOME = home; process.env.USERPROFILE = home; process.env.PARITY_HOST = HOST;
  return host === "pi" ? piRun(proj, calls) : opencodeRun(proj, calls);
}

const chunksOf = (t) => Number(/(\d+) chunk\(s\)/.exec(t)?.[1]);
// A hit line is "<label> #<chunk id>: <snippet>". The id list is the ranking.
const hitIds = (t) => [...t.matchAll(/^\S+ #(\d+): /gm)].map((m) => Number(m[1]));
const bytes = (s) => Buffer.byteLength(s, "utf8");

for (const host of ALL_HOSTS) {
  test(`[parity] ${host}: ctx_index {url} then ctx_search {queries} run without an error line`, async () => {
    const { out } = await runHost(host, [["ctx_index", { url }], ["ctx_search", { queries: [QUERY] }]]);
    const [idx, search] = out;
    assert.equal(idx.isError, false, `${host} index: ${idx.text}`);
    assert.equal(search.isError, false, `${host} search: ${search.text}`);
    assert.ok(Number.isInteger(chunksOf(idx.text)) && chunksOf(idx.text) > 0, idx.text);
    assert.ok(hitIds(search.text).length > 0, `${host}: no hit line in:\n${search.text.slice(0, 600)}`);
    results.set(host, { indexText: idx.text, searchText: search.text });
  });
}

// Setup writes an MCP entry for opencode (server.mjs --agent opencode, spawn-cwd project), so a user can reach the
// scenario through that server too, not only through the plugin. It must match the plugin and every other host.
test("[parity] opencode through its MCP server entry matches the plugin and the other hosts", async () => {
  const { out } = await runHost("opencode", [["ctx_index", { url }], ["ctx_search", { queries: [QUERY] }]], { tag: "opencode-mcp", mcp: true });
  assert.equal(out[0].isError, false, out[0].text);
  assert.equal(out[1].isError, false, out[1].text);
  assert.equal(chunksOf(out[0].text), chunksOf(results.get("claude-code").indexText));
  assert.equal(out[1].text, results.get("claude-code").searchText);
});

test("[parity] all 10 hosts: same chunk count, same hit list, same reply bytes, reply under OUTPUT_CAP", () => {
  assert.equal(results.size, ALL_HOSTS.length, "every host ran: " + [...results.keys()].join(","));
  const ref = results.get("claude-code");
  const table = ALL_HOSTS.map((h) => `${h}: chunks=${chunksOf(results.get(h).indexText)} bytes=${bytes(results.get(h).searchText)} hits=${hitIds(results.get(h).searchText).length}`);
  console.log("parity per host\n" + table.join("\n"));
  for (const host of ALL_HOSTS) {
    const r = results.get(host);
    assert.equal(chunksOf(r.indexText), chunksOf(ref.indexText), `${host} chunk count`);
    assert.deepEqual(hitIds(r.searchText), hitIds(ref.searchText), `${host} hit list`);
    assert.equal(bytes(r.searchText), bytes(ref.searchText), `${host} reply bytes`);
    assert.equal(r.searchText, ref.searchText, `${host} reply text`);
    assert.ok(bytes(r.searchText) <= OUTPUT_CAP, `${host} reply ${bytes(r.searchText)} B over ${OUTPUT_CAP}`);
  }
});

// The readable-text change (html agent) converts HTML before chunking. Detected by behaviour, on a tiny page that
// goes through the same fetch path: once a tag attribute or a script body no longer reaches a snippet, the real page
// must come back clean on every host too. Before the change lands this test only records that fact.
test("[parity] once HTML is converted to readable text, no host returns tags, attributes or flight data", async () => {
  const { out } = await runHost("claude-code", [["ctx_index", { url: probeUrl }], ["ctx_search", { queries: ["widget parity probe sentence"] }]], { tag: "probe" });
  const converted = !/zz-attr|zzScript|<p /.test(out[1].text);
  console.log("readable-text conversion in tree: " + converted);
  if (!converted) return;
  for (const host of ALL_HOSTS) {
    const t = results.get(host).searchText;
    for (const bad of [/<\/?[a-z][a-z0-9]*[\s>]/i, /\sclass="/, /\\u003[ce]/i, /\\"children\\"/, /\$r\\?"/]) {
      assert.ok(!bad.test(t), `${host}: snippet holds ${bad}:\n${t.slice(0, 500)}`);
    }
  }
});

test("[parity] pi has no standalone server user path: setup writes no MCP entry for pi, so pi:ctx.cwd is never missing", async () => {
  const { ownMcpValue } = await import("../../../src/core/ops/host-config.ts");
  assert.equal(ownMcpValue("pi", "node", "/x/server.mjs"), undefined);
  const { buildRegistry } = await import("../../../src/setup/registry.ts");
  const rows = buildRegistry({ home: join(root, "home-reg"), pkgDir: pkg, env: {} });
  const piRow = rows.find((r) => r.id === "pi");
  assert.equal(piRow.installMode, "in-process");
  assert.equal(piRow.config, undefined, "setup must not write an MCP server entry for pi");
  // opencode is spawn-cwd: its MCP entry is valid and covered by the test above.
  assert.deepEqual(rows.find((r) => r.id === "opencode").config.value.command.slice(-2), ["--agent", "opencode"]);
});
