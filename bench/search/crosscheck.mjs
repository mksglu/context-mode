// Independent cross-check of the held-out search numbers (not bench/search/heldout.mjs).
// Talks MCP stdio to release-out/server.mjs (v2) and, with --v1 <checkout>, to v1 build/server.js plus the v1
// ContentStore engine. Reports: held-out recall@5, MRR@10, zero-hit queries; bench-7 no-hit scenarios and
// fenced blocks whole; p95 of unscoped ctx_search with ~1 MB extra indexed; the same metrics on 10 fresh
// queries (bench/search/crosscheck-queries.json, labels from source text); FTS5 operator probes.
//   node bench/search/crosscheck.mjs [--v1 <checkout of main with build/>]
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const V1 = argv.includes("--v1") ? path.resolve(argv[argv.indexOf("--v1") + 1]) : null;
const rd = (p) => readFileSync(path.join(REPO, p), "utf8");
const HELD = JSON.parse(rd("e2e/fixtures/search/heldout.json"));
const FRESH = JSON.parse(rd("bench/search/crosscheck-queries.json"));
const SCEN = JSON.parse(rd("bench/fixtures/scenarios.json"));
const DATA = "bench/fixtures/data";

const tools = (p) => JSON.parse(rd(p)).map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n---\n\n");
const heldText = (s) => s.fixture ? rd(s.fixture) : s.concat ? s.concat.map((f) => rd(f) + s.sep).join("") : tools(s.mcpTools);
const benchText = (s) => s.fixture ? rd(path.join(DATA, s.fixture)) : s.concat ? s.concat.map((f) => rd(path.join(DATA, f)) + s.sep).join("") : tools(path.join(DATA, s.mcpTools));

// Fenced blocks: line scan, opener ``` or ~~~ (3+), closer same char and at least as long.
function fenced(text) {
  const lines = text.split("\n"), out = [];
  let start = -1, ch = "", n = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    const c = t[0];
    if (c !== "`" && c !== "~") continue;
    let k = 0; while (t[k] === c) k++;
    if (k < 3) continue;
    if (start < 0) { start = i; ch = c; n = k; }
    else if (c === ch && k >= n && t.slice(k).trim() === "") { out.push(lines.slice(start, i + 1).join("\n")); start = -1; }
  }
  return out;
}

function server(cmd, args, env, cwd) {
  const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", next = 0, err = "";
  const wait = new Map();
  child.stderr.on("data", (d) => { err += d; });
  child.stdout.on("data", (d) => {
    buf += d;
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    }
  });
  child.on("exit", (c) => { for (const f of wait.values()) f({ error: { message: `exit ${c}: ${err.slice(-300)}` } }); });
  return {
    rpc: (method, params) => new Promise((res) => { const id = ++next; wait.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); }),
    note: (method) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"),
    stop: () => new Promise((res) => { child.on("exit", res); child.stdin.end(); setTimeout(() => child.kill(), 3000); }),
  };
}
async function tool(s, name, args) {
  const t0 = performance.now();
  const m = await s.rpc("tools/call", { name, arguments: args });
  const ms = performance.now() - t0;
  if (m.error) return { err: m.error.message, text: "", ms };
  const text = (m.result.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
  return { text, ms, isError: m.result.isError === true };
}
// Ranked hit texts of a single-query reply. v2: lines "<label> #<ord>: <snippet>", snippet may span lines.
function hitsV2(text, label) {
  if (text.startsWith("No hits")) return [];
  const body = text.split("\nMore: ")[0];
  const mark = "\n" + label + " #", out = [];
  let i = body.indexOf(mark);
  while (i >= 0) {
    const j = body.indexOf(mark, i + 1);
    const h = body.slice(i + mark.length, j < 0 ? undefined : j);
    out.push(h.slice(h.indexOf(": ") + 2));
    i = j;
  }
  return out;
}
const hitsV1 = (text) => text.split("\n--- [").slice(1);
function metrics(rows) {
  let r5 = 0, rr = 0, zero = 0;
  const per = rows.map(({ q, hits }) => {
    const top = hits.slice(0, 10);
    let rank = null;
    for (let i = 0; i < top.length; i++) if (q.expect.some((e) => top[i].includes(e))) { rank = i + 1; break; }
    if (rank !== null && rank <= 5) r5++;
    if (rank !== null) rr += 1 / rank;
    if (hits.length === 0) zero++;
    return { id: q.id, rank, hits: hits.length };
  });
  return { n: rows.length, recall_at_5: r5 / rows.length, mrr_at_10: rr / rows.length, zero_hit: zero, per };
}
function p(xs, q) { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; }

function sandbox() {
  const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-crosscheck-")));
  const home = path.join(tmp, "home"), project = path.join(tmp, "project");
  mkdirSync(home); mkdirSync(project); execFileSync("git", ["init", "-q", project]);
  const env = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: tmp, CLAUDE_PROJECT_DIR: project,
    CONTEXT_MODE_SEARCH_MAX_RESULTS_AFTER: "100000", CONTEXT_MODE_SEARCH_BLOCK_AFTER: "100000" };
  return { tmp, project, env };
}
async function open(cmd, args, sb) {
  const s = server(cmd, args, sb.env, sb.project);
  const init = await s.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "crosscheck", version: "0" } });
  if (init.error) throw new Error("initialize: " + init.error.message);
  s.note("notifications/initialized");
  return s;
}

// Every expect string must be in its source text (labels from source text, not engine output).
for (const q of FRESH.queries) {
  const s = HELD.sources.find((x) => x.label === q.source);
  if (!s || !q.expect.some((e) => heldText(s).includes(e))) throw new Error("fresh query label not in source: " + q.id);
}

const PROBES = ['"', '""', '"unbalanced', "*", "a*b", "NEAR", "NEAR(a b)", "NEAR(useEffect cleanup, 5)", "AND", "OR", "NOT",
  "useEffect AND cleanup", "useEffect OR cleanup", "useEffect NOT cleanup", "^useEffect", "^", ":", "body:useEffect",
  "title:cleanup", "(", ")", "(useEffect", "useEffect)", "(a OR b) AND NOT c", "-", "--", "+", "{a b}", "col:*",
  "'single'", "\\", "\u0000", "ç ğ ş", "\"useEffect cleanup\"", "useEffect\"cleanup", "SELECT * FROM chunks;"];

const out = { node: process.version };
const sb = sandbox();
try {
  const v2 = await open(process.execPath, [path.join(REPO, "release-out", "server.mjs"), "--agent", "claude-code"], sb);
  // bench 7
  let noHitScen = 0, fences = 0, whole = 0, wholeUnesc = 0;
  const bench = [];
  for (const s of SCEN.part2) {
    const content = benchText(s);
    await tool(v2, "ctx_index", { content, source: s.source });
    const replies = [];
    for (const q of s.queries) replies.push((await tool(v2, "ctx_search", { queries: [q], source: s.source })).text);
    const withHits = replies.filter((r) => hitsV2(r, s.source).length > 0).length;
    if (withHits === 0) noHitScen++;
    const all = replies.join("\n");
    const unesc = all.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
    const f = fenced(content);
    const w = f.filter((x) => all.includes(x)).length, wu = f.filter((x) => unesc.includes(x)).length;
    fences += f.length; whole += w; wholeUnesc += wu;
    bench.push({ source: s.source, queries: s.queries.length, with_hits: withHits, fences: f.length, whole: w, whole_after_unescape: wu });
  }
  out.bench7 = { no_hit_scenarios: noHitScen, fences, whole, whole_after_unescape: wholeUnesc, bench };
  // held-out + fresh
  for (const s of HELD.sources) await tool(v2, "ctx_index", { content: heldText(s), source: s.label });
  const run = async (qs) => { const r = []; for (const q of qs) r.push({ q, hits: hitsV2((await tool(v2, "ctx_search", { queries: [q.query], source: q.source })).text, q.source) }); return r; };
  out.v2_heldout = metrics(await run(HELD.queries));
  out.v2_fresh = metrics(await run(FRESH.queries));
  // probes: scoped to React, then unscoped, then through ctx_batch
  out.probes = [];
  for (const q of PROBES) {
    const a = await tool(v2, "ctx_search", { queries: [q], source: "Context7: React" });
    const b = await tool(v2, "ctx_search", { queries: [q] });
    // A probe fails on a JSON-RPC error, an isError reply, or the server's internal-error reply.
    const bad = [a, b].filter((r) => r.err || r.isError || r.text.startsWith("Internal error"));
    out.probes.push({ q, ok: bad.length === 0, hits: hitsV2(a.text, "Context7: React").length, first: bad.length ? (bad[0].err ?? bad[0].text).slice(0, 200) : undefined });
  }
  // p95 with ~1 MB extra (https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2 *.md in path order, review/out skipped), unscoped, 3 rounds
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
    const pth = path.join(d, e.name);
    if (e.isDirectory()) { if (!pth.endsWith(path.join("review", "out"))) walk(pth); } else if (e.name.endsWith(".md")) files.push(pth);
  } };
  walk(path.join(REPO, "docs", "architecture"));
  let extra = 0, k = 0;
  for (const f of files) { if (extra >= 1 << 20) break; const t = readFileSync(f, "utf8"); await tool(v2, "ctx_index", { content: t, source: "mb-" + k++ }); extra += Buffer.byteLength(t); }
  const ms = [];
  for (let round = 0; round < 3; round++) for (const q of [...HELD.queries, ...FRESH.queries]) ms.push((await tool(v2, "ctx_search", { queries: [q.query] })).ms);
  out.latency = { extra_bytes: extra, calls: ms.length, p50_ms: +p(ms, 0.5).toFixed(1), p95_ms: +p(ms, 0.95).toFixed(1), max_ms: +Math.max(...ms).toFixed(1) };
  await v2.stop();

  if (V1) {
    const s1 = await open(process.execPath, [path.join(V1, "build", "server.js")], sandbox());
    for (const s of HELD.sources) await tool(s1, "ctx_index", { content: heldText(s), source: s.label });
    const r1 = async (qs) => { const r = []; for (const q of qs) r.push({ q, hits: hitsV1((await tool(s1, "ctx_search", { queries: [q.query], source: q.source })).text) }); return r; };
    out.v1_mcp_heldout = metrics(await r1(HELD.queries));
    out.v1_mcp_fresh = metrics(await r1(FRESH.queries));
    await s1.stop();
    const { ContentStore } = await import(pathToFileURL(path.join(V1, "build", "store.js")).href);
    const st = new ContentStore(path.join(sb.tmp, "v1.db"));
    for (const s of HELD.sources) st.index({ content: heldText(s), source: s.label });
    const eng = (qs) => qs.map((q) => ({ q, hits: st.searchWithFallback(q.query, 10, q.source).map((r) => r.content) }));
    out.v1_engine_heldout = metrics(eng(HELD.queries));
    out.v1_engine_fresh = metrics(eng(FRESH.queries));
    st.close?.();
  }
} finally {
  rmSync(sb.tmp, { recursive: true, force: true });
}
const brief = (m) => m && { recall_at_5: +m.recall_at_5.toFixed(3), mrr_at_10: +m.mrr_at_10.toFixed(3), zero_hit: m.zero_hit, miss: m.per.filter((x) => x.rank === null || x.rank > 5).map((x) => x.id + "@" + x.rank) };
process.stdout.write(JSON.stringify({ ...out,
  summary: { v2_heldout: brief(out.v2_heldout), v2_fresh: brief(out.v2_fresh), v1_mcp_heldout: brief(out.v1_mcp_heldout), v1_mcp_fresh: brief(out.v1_mcp_fresh),
    v1_engine_heldout: brief(out.v1_engine_heldout), v1_engine_fresh: brief(out.v1_engine_fresh) } }, null, 1) + "\n");
