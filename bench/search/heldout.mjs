// Held-out search eval (https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/search/DIAGNOSIS.md §4). Plain Node, no network, no model calls.
// Indexes every source of e2e/fixtures/search/heldout.json over MCP (ctx_index), asks each query in its
// own ctx_search call (source-scoped), and scores the reply against the frozen `expect` substrings.
// Also runs the 7 part-2 bench scenarios (no-hit count, code blocks whole) and a p95 latency pass with
// 1 MB extra content indexed.
//   node bench/search/heldout.mjs --engine v2 [--bundle release-out]
//   node bench/search/heldout.mjs --engine v1 --v1 <checkout of origin/main with build/>   (MCP + engine)
// Prints one JSON object. v1 MCP replies hold at most 2 hits per query (v1 server.ts Math.min(limit, 2)),
// so for v1 the ranking metrics also come from ContentStore.searchWithFallback(q, 10, source) directly.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.indexOf(k) >= 0 ? argv[argv.indexOf(k) + 1] : d);
const ENGINE = arg("--engine", "v2");
const BUNDLE = path.resolve(REPO, arg("--bundle", "release-out"));
const V1 = arg("--v1") ? path.resolve(arg("--v1")) : null;
const HELD = JSON.parse(readFileSync(path.join(REPO, "e2e", "fixtures", "search", "heldout.json"), "utf8"));
const SCEN = JSON.parse(readFileSync(path.join(REPO, "bench", "fixtures", "scenarios.json"), "utf8"));
const DATA = path.join(REPO, "bench", "fixtures", "data");

function sourceText(s) {
  const r = (f) => readFileSync(path.join(REPO, f), "utf8");
  if (s.fixture) return r(s.fixture);
  if (s.concat) return s.concat.map((f) => r(f) + s.sep).join("");
  return JSON.parse(r(s.mcpTools)).map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n---\n\n");
}
function part2Content(s) {
  if (s.fixture) return readFileSync(path.join(DATA, s.fixture), "utf8");
  if (s.concat) return s.concat.map((f) => readFileSync(path.join(DATA, f), "utf8") + s.sep).join("");
  return JSON.parse(readFileSync(path.join(DATA, s.mcpTools), "utf8")).map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n---\n\n");
}
const fences = (t) => t.match(/```[\s\S]*?```/g) ?? [];
// 1 MB of extra markdown for the latency pass: https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2 files (review/out excluded), in name order.
function megabyte() {
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!p.includes(path.join("review", "out"))) walk(p); } else if (e.name.endsWith(".md")) files.push(p);
  } };
  walk(path.join(REPO, "docs", "architecture"));
  const parts = []; let n = 0;
  for (const f of files) { if (n >= 1_048_576) break; const t = readFileSync(f, "utf8"); parts.push(t); n += Buffer.byteLength(t); }
  return parts;
}

function mcp(cmd, args, env, cwd) {
  const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0, err = "";
  const pending = new Map();
  child.stderr.on("data", (d) => { err += d; });
  child.stdout.on("data", (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.trim() === "") continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  child.once("exit", (c) => { for (const r of pending.values()) r({ error: { message: "server exited " + c + ": " + err.slice(-400) } }); pending.clear(); });
  const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
  return {
    request: (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); send({ jsonrpc: "2.0", id: i, method, params }); }),
    notify: (method) => send({ jsonrpc: "2.0", method }),
    close: () => new Promise((resolve) => { child.once("exit", resolve); child.stdin.end(); setTimeout(() => child.kill(), 2000); }),
  };
}
async function call(c, name, args) {
  const t = performance.now();
  const m = await c.request("tools/call", { name, arguments: args });
  const ms = performance.now() - t;
  if (m.error) throw new Error(name + ": " + m.error.message);
  const text = (m.result.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
  if (m.result.isError) throw new Error(name + ": " + text.slice(0, 300));
  return { text, ms };
}
// Split one reply into its ranked hit texts.
function hitsOf(text, label) {
  if (ENGINE === "v2") {
    if (text.startsWith("No hits")) return [];
    const head = label + " #";
    return text.split("\n" + head).slice(1).map((h) => h.slice(h.indexOf(": ") + 2));
  }
  if (text.includes("No results found.") && !text.includes("--- [")) return [];
  return text.split("\n--- [").slice(1);
}
function score(rankings) {
  let r5 = 0, mrr = 0, any = 0;
  const per = [];
  for (const { q, hits } of rankings) {
    const at = hits.slice(0, 10).findIndex((h) => q.expect.some((e) => h.includes(e)));
    if (at >= 0 && at < 5) r5++;
    if (at >= 0) mrr += 1 / (at + 1);
    if (hits.length > 0) any++;
    per.push({ id: q.id, kind: q.kind, rank: at >= 0 ? at + 1 : null, hits: hits.length });
  }
  const n = rankings.length;
  const byKind = {};
  for (const p of per) { const k = (byKind[p.kind] ??= { n: 0, r5: 0 }); k.n++; if (p.rank !== null && p.rank <= 5) k.r5++; }
  return { n, recall_at_5: +(r5 / n).toFixed(3), mrr_at_10: +(mrr / n).toFixed(3), no_hit_queries: n - any, by_kind: byKind, per };
}
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)].toFixed(1); };

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-search-heldout-")));
const home = path.join(tmp, "home"), project = path.join(tmp, "project");
mkdirSync(home); mkdirSync(project);
execFileSync("git", ["init", "-q", project]);
const env = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_PROJECT_DIR: project,
  // v1 only: lift the per-window call throttle so 50+ single-query calls are not blocked (it caps hits, not ranking).
  CONTEXT_MODE_SEARCH_MAX_RESULTS_AFTER: "100000", CONTEXT_MODE_SEARCH_BLOCK_AFTER: "100000" };
const out = { engine: ENGINE, node: process.version, heldout_version: HELD.version };
try {
  const c = ENGINE === "v2"
    ? mcp(process.execPath, [path.join(BUNDLE, "server.mjs"), "--agent", "claude-code"], env, project)
    : mcp(process.execPath, [path.join(V1, "build", "server.js")], env, project);
  const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "search-heldout", version: "0" } });
  if (init.error) throw new Error("initialize: " + init.error.message);
  c.notify("notifications/initialized");

  // 1. The 7 bench scenarios (the same inputs and queries as bench/fixtures/run.mjs part 2).
  const bench = [];
  for (const s of SCEN.part2) {
    const content = part2Content(s);
    await call(c, "ctx_index", { content, source: s.source });
    const replies = [];
    for (const q of s.queries) replies.push((await call(c, "ctx_search", { queries: [q], source: s.source })).text);
    const all = replies.join("\n");
    const f = fences(content);
    bench.push({ scenario: s.name, queries: s.queries.length, queries_with_hits: replies.filter((r) => hitsOf(r, s.source).length > 0).length,
      fences: f.length, fences_whole: f.filter((x) => all.includes(x)).length });
  }
  out.bench7 = { scenarios_with_no_hits: bench.filter((b) => b.queries_with_hits === 0).length,
    fences: bench.reduce((a, b) => a + b.fences, 0), fences_whole: bench.reduce((a, b) => a + b.fences_whole, 0), rows: bench };

  // 2. Held-out set over MCP.
  for (const s of HELD.sources) await call(c, "ctx_index", { content: sourceText(s), source: s.label });
  const rankings = [];
  for (const q of HELD.queries) rankings.push({ q, hits: hitsOf((await call(c, "ctx_search", { queries: [q.query], source: q.source })).text, q.source) });
  out.heldout_mcp = score(rankings);

  // 3. Latency: +1 MB indexed, every held-out query unscoped, one call each.
  const mb = megabyte();
  for (let i = 0; i < mb.length; i++) await call(c, "ctx_index", { content: mb[i], source: "perf-" + i });
  const ms = [];
  for (const q of HELD.queries) ms.push((await call(c, "ctx_search", { queries: [q.query] })).ms);
  out.latency = { extra_indexed_bytes: mb.reduce((a, t) => a + Buffer.byteLength(t), 0), queries: ms.length, p50_ms: +[...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)].toFixed(1), p95_ms: p95(ms) };
  await c.close();

  // 4. v1 engine ranking (top 10), same inputs, same scoring.
  if (ENGINE === "v1") {
    const { ContentStore } = await import(pathToFileURL(path.join(V1, "build", "store.js")).href);
    const st = new ContentStore(path.join(tmp, "v1-engine.db"));
    for (const s of HELD.sources) st.index({ content: sourceText(s), source: s.label });
    const rk = [];
    for (const q of HELD.queries) rk.push({ q, hits: st.searchWithFallback(q.query, 10, q.source).map((r) => r.content) });
    out.heldout_engine_top10 = score(rk);
    st.close?.();
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
