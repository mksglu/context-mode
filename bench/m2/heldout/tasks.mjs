// M2 heldout set. Candidates that tune M2 must not read or tune on this file: score on it only at the end.
// Each workload: { id, kind, tools, mcp?, http?, build(dir, ctx) -> { prompt, expect: string[] } }.
// Sizes sit between the plugin threshold (4 KB) and the Claude Code own persist limits (Bash about 30K chars,
// MCP about 25K tokens), so the off arm sees the whole output. Fixtures are local and seeded (deterministic). Oracle: the final answer must hold every expect string.
// WebFetch is not used: it upgrades http to https and cannot reach a local server (checked with
// Claude Code 2.1.303). The http-1 workload covers the "fetch a web page" shape with a local server.
import fs from "node:fs";
import path from "node:path";

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
const tok = (r, n = 8) => Array.from({ length: n }, () => ALPHA[Math.floor(r() * ALPHA.length)]).join("");
const W = ["alpha", "bravo", "cargo", "delta", "echo", "fable", "gamma", "hotel", "index", "jolly", "karma", "lumen"];
const pick = (r, a) => a[Math.floor(r() * a.length)];
const put = (dir, f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
const ONLY = " Reply with only the answer, no other text.";

// read-src: one large JS source file (~70 KB). One function returns a unique constant.
function readSrc(dir) {
  const r = rng(101), n = 250, at = 60 + Math.floor(r() * 150); let want = "";
  const fns = [];
  for (let i = 0; i < n; i++) {
    const name = i === at ? "resolveShardKey" : `${pick(r, W)}${pick(r, W)[0].toUpperCase()}${tok(r, 5)}_${i}`;
    const val = "K" + tok(r, 10); if (i === at) want = val;
    fns.push(`export function ${name}(input, opts = {}) {\n  const seed = ${Math.floor(r() * 1e6)};\n  if (!input) return null;\n  return opts.raw ? input : "${val}";\n}\n`);
  }
  put(dir, "src/registry.js", fns.join("\n"));
  return { prompt: 'Use the Read tool to read src/registry.js. What string does the function resolveShardKey return when opts.raw is false?' + ONLY, expect: [want] };
}

// read-csv: a large CSV (~120 KB) read with the Read tool; answer: the city of one customer id.
function readCsv(dir) {
  const r = rng(103), rows = ["id,name,city,plan,mrr,signup"], n = 700, at = 200 + Math.floor(r() * 400);
  const cities = ["Lisbon", "Oslo", "Quito", "Perth", "Tunis", "Lagos", "Hanoi", "Bern"]; let id = "", city = "";
  for (let i = 0; i < n; i++) {
    const cid = "cu_" + tok(r, 9), c = pick(r, cities) + (i === at ? "-Central" : "");
    if (i === at) { id = cid; city = c; }
    rows.push(`${cid},${pick(r, W)} ${pick(r, W)},${c},${pick(r, ["free", "pro", "team"])},${Math.floor(r() * 900)},2026-0${1 + (i % 9)}-1${i % 10}`);
  }
  put(dir, "data/customers.csv", rows.join("\n") + "\n");
  return { prompt: `Use the Read tool to read data/customers.csv. What is the city of customer ${id}?` + ONLY, expect: [city] };
}

// mcp-1: a non-ctx MCP server whose tool returns a large JSON list (~90 KB). One ticket is blocked.
const MCP_SERVER = `import readline from "node:readline";
import fs from "node:fs";
const data = fs.readFileSync(new URL("./tickets.json", import.meta.url), "utf8");
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (l) => {
  let m; try { m = JSON.parse(l); } catch { return; }
  if (m.id === undefined) return;
  if (m.method === "initialize") return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tix", version: "1.0.0" } } });
  if (m.method === "tools/list") return send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "list_tickets", description: "List every open ticket of the project as JSON.", inputSchema: { type: "object", properties: {} } }] } });
  if (m.method === "tools/call") return send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: data }] } });
  send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
});
`;
function mcp1(dir) {
  const r = rng(107), n = 180, at = 40 + Math.floor(r() * 100); let key = "";
  const t = Array.from({ length: n }, (_, i) => {
    const k = "TIX-" + (1000 + i) + "-" + tok(r, 4); if (i === at) key = k;
    return { key: k, title: Array.from({ length: 5 }, () => pick(r, W)).join(" "), status: i === at ? "blocked" : pick(r, ["open", "in_progress", "review"]), assignee: pick(r, W), labels: [pick(r, W), pick(r, W)], updated: `2026-09-${10 + (i % 18)}T0${i % 10}:00:00Z` };
  });
  put(dir, "mcp/tickets.json", JSON.stringify(t, null, 2));
  put(dir, "mcp/server.mjs", MCP_SERVER);
  return { prompt: "Call the list_tickets tool of the tix MCP server once. Exactly one ticket has status blocked. Give its key." + ONLY, expect: [key] };
}

// http-1: an HTML status page (~150 KB) on a local HTTP server, fetched with curl. One node is degraded.
function http1(dir, ctx) {
  const r = rng(109), n = 280, at = 60 + Math.floor(r() * 180); let node = "";
  const rows = Array.from({ length: n }, (_, i) => {
    const name = "node-" + tok(r, 7); if (i === at) node = name;
    return `<tr><td class="n">${name}</td><td>${pick(r, W)}</td><td>${Math.floor(r() * 99)}%</td><td class="s">${i === at ? "degraded" : "healthy"}</td></tr>`;
  });
  ctx.serve("/status.html", `<!doctype html><html><head><title>fleet</title></head><body><table>${rows.join("\n")}</table></body></html>`);
  return { prompt: `Fetch ${ctx.url}/status.html (plain http on localhost; curl works). Exactly one node has status degraded. Give its node name.` + ONLY, expect: [node] };
}

// node-tests-1: a real node --test run, 400 tests in 8 files, one fails. Answer: the failing test name.
function nodeTests(dir) {
  const r = rng(113), files = 8, per = 50, failF = Math.floor(r() * files), failI = Math.floor(r() * per); let name = "";
  for (let f = 0; f < files; f++) {
    const lines = ['import { test } from "node:test";', 'import assert from "node:assert/strict";'];
    for (let i = 0; i < per; i++) {
      const tn = `${pick(r, W)} ${pick(r, W)} handles case ${tok(r, 6)}`; const bad = f === failF && i === failI; if (bad) name = tn;
      lines.push(`test(${JSON.stringify(tn)}, () => { assert.equal(${i} + 1, ${bad ? i + 2 : i + 1}); });`);
    }
    put(dir, `test/t${f}.test.mjs`, lines.join("\n") + "\n");
  }
  return { prompt: "Run `node --test --test-reporter=spec test/` in one Bash call, bare (no pipe, no grep, no redirect). Exactly one test fails. Give its full test name." + ONLY, expect: [name] };
}

// jsonl-1: a structured JSON-lines log (~180 KB); count fatal entries of one service.
function jsonl1(dir) {
  const r = rng(127), n = 170, svc = "svc-ledger"; let k = 0; const lines = [];
  for (let i = 0; i < n; i++) {
    const s = r() < 0.15 ? svc : "svc-" + pick(r, W), lvl = r() < 0.02 ? "fatal" : pick(r, ["info", "debug", "warn", "error"]);
    if (s === svc && lvl === "fatal") k++;
    lines.push(JSON.stringify({ ts: `2026-09-01T${String(i % 24).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`, level: lvl, service: s, req: tok(r, 16), msg: Array.from({ length: 6 }, () => pick(r, W)).join(" "), took_ms: Math.floor(r() * 900) }));
  }
  put(dir, "logs/app.jsonl", lines.join("\n") + "\n");
  return { prompt: `logs/app.jsonl is a JSON-lines log. How many entries have level "fatal" and service "${svc}"? Use tools to read the file.` + ONLY, expect: [String(k)] };
}

// grep-1: Grep over a source tree with many matches (~60 KB of output); one TODO names a unique owner.
function grep1(dir) {
  const r = rng(131), files = 20; let owner = "";
  const tf = Math.floor(r() * files), tl = Math.floor(r() * 40);
  for (let f = 0; f < files; f++) {
    const lines = [];
    for (let i = 0; i < 40; i++) {
      if (f === tf && i === tl) { owner = "owner-" + tok(r, 6); lines.push(`// TODO(${owner}): remove the legacy retry path before release`); continue; }
      lines.push(i % 2 ? `// TODO(team): ${pick(r, W)} ${pick(r, W)} ${tok(r, 12)} cleanup` : `export const v${i} = "${tok(r, 20)}";`);
    }
    put(dir, `pkg/m${f}/index.js`, lines.join("\n") + "\n");
  }
  return { prompt: "Use the Grep tool with output mode content to list every TODO line under pkg/. Exactly one TODO mentions the legacy retry path. Who is its owner (the text inside TODO(...))?" + ONLY, expect: [owner] };
}

export const TASKS = [
  { id: "read-src", kind: "Read source", tools: ["Read", "Bash", "Grep", "Glob"], build: readSrc },
  { id: "read-csv", kind: "Read data", tools: ["Read", "Bash", "Grep", "Glob"], build: readCsv },
  { id: "mcp-1", kind: "MCP tool output", tools: ["Bash", "Read", "Grep", "Glob", "mcp__tix"], mcp: { tix: { command: "node", args: ["mcp/server.mjs"] } }, build: mcp1 },
  { id: "http-1", kind: "web page fetch", tools: ["Bash", "Read", "Grep", "Glob"], http: true, build: http1 },
  { id: "node-tests-1", kind: "test run", tools: ["Bash", "Read", "Grep", "Glob"], build: nodeTests },
  { id: "jsonl-1", kind: "log (JSON lines)", tools: ["Bash", "Read", "Grep", "Glob"], build: jsonl1 },
  { id: "grep-1", kind: "Grep output", tools: ["Grep", "Bash", "Read", "Glob"], build: grep1 },
].map((t) => ({ ...t, set: "heldout" }));
