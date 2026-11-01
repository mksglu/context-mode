#!/usr/bin/env node
// Deterministic analysis for bench/evidence/try-it (pre-registration: prereg.md, commit f924eda2; amendment 1:
// prereg-amendment-1.md, commit c091a4cb). For web-scrape, docs-search and large-json only the run lines with
// "amendment": 1 count; the first-run lines of these prompts stay in the run files and go to ab.json "superseded".
// Inputs:  runs/<prompt>.jsonl (one line per session) and tool-result-bytes.json (written once by measure-bytes.mjs
//          from the private transcripts; it holds each transcript's SHA-256, and no ids or text).
// Outputs: ab.json (schema context-mode.benchmark-evidence/2) and index.json, in this folder.
// No clock, no network, no randomness: the same inputs give the same bytes. `--check` exits 1 when the files differ.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS = ["repo-research", "git-history", "web-scrape", "large-json", "docs-search"];
const DEMO = "session-continuity";
const ARMS = ["plain", "v1", "v2", "gateway"];
const N_PLANNED = 4, N_DEMO = 2, STOP_USD = 80;
const LABELS = {
  "repo-research": "Deep repo research", "git-history": "Git history analysis", "web-scrape": "Web scraping",
  "large-json": "Large JSON API", "docs-search": "Documentation search", "session-continuity": "Session continuity",
};
const PRICES = { "claude-opus-5-5": { in: 4, out: 20, cr: 0.2, cw5: 5, cw1h: 8 } }; // prereg "Freeze", USD per MTok
const PLUGIN = { v1: { git_head: "a92cf6a77ac02971fb5fafe2155e5ee229491884", version: "1.0.169" },
  v2: { git_head: "7f320e1664577c5389f37d0fbd250f867ed69fcc", version: "0.0.0-dev" } };
const HARNESS_COMMIT = "bb28f201436a4d03b4a59a4e182552d8b5750654";
const HARNESS_COMMIT_A1 = "c23ecd199f645a00405ea0b0098ac482792a4b98";
// Prompts re-run under amendment 1, and why their first-run lines are superseded (prereg-amendment-1.md).
const AMENDED = {
  "web-scrape": "Gateway arm: the completion check counted only client tool_use blocks, but the gateway ran the fetch at its edge (gateway record edge_calls >= 1), so all gateway sessions failed no-tool-call. The tenant was shared per prompt with memory and skills on, so a later cycle could see an earlier one.",
  "docs-search": "Gateway arm: the completion check counted only client tool_use blocks, but the gateway ran the fetch at its edge (gateway record edge_calls >= 1), so all gateway sessions failed no-tool-call. The tenant was shared per prompt with memory and skills on, so a later cycle could see an earlier one.",
  "large-json": "All arms: the record check read the served data from disk, but every session built the data in memory, so every arm failed no-served-data-on-disk. The tenant was shared per prompt with memory and skills on.",
};
const AMENDMENT = { file: "bench/evidence/try-it/prereg-amendment-1.md", commit: "c091a4cb227170db6875340cce3844ee77a97544",
  committed: "2026-10-22T13:38:00Z", last_edit_before_first_run: { commit: "da17021383c0e8e3b853a80713d20fc14b7631f2", committed: "2026-10-22T14:49:44Z" },
  first_run_commit: { commit: "c9ba8cfdb4fa7873dc77354c0c8200229ebc807d", committed: "2026-10-22T14:56:26Z" } };
// Claims printed in the README "Try It" section at origin/main a92cf6a7 (prereg "README claim check").
// unit: "calls" = tool_use blocks; "bytes" = tool_result bytes; "pct_saved" = 100 x (1 - v1 / plain) on bytes.
const CLAIMS = [
  { id: "repo-research", text: "5 calls", metric: "v1_calls", claimed: 5, unit: "calls" },
  { id: "repo-research", text: "62 KB context", metric: "v1_bytes", claimed: 62, unit: "KB" },
  { id: "repo-research", text: "raw: 986 KB", metric: "plain_bytes", claimed: 986, unit: "KB" },
  { id: "repo-research", text: "94% saved", metric: "pct_saved", claimed: 94, unit: "%" },
  { id: "git-history", text: "1 call", metric: "v1_calls", claimed: 1, unit: "calls" },
  { id: "git-history", text: "5.6 KB context", metric: "v1_bytes", claimed: 5.6, unit: "KB" },
  { id: "web-scrape", text: "1 call", metric: "v1_calls", claimed: 1, unit: "calls" },
  { id: "web-scrape", text: "3.2 KB context", metric: "v1_bytes", claimed: 3.2, unit: "KB" },
  { id: "large-json", text: "7.5 MB raw", metric: "plain_bytes", claimed: 7500, unit: "KB" },
  { id: "large-json", text: "0.9 KB context", metric: "v1_bytes", claimed: 0.9, unit: "KB" },
  { id: "large-json", text: "99% saved", metric: "pct_saved", claimed: 99, unit: "%" },
  { id: "docs-search", text: "2 calls", metric: "v1_calls", claimed: 2, unit: "calls" },
  { id: "docs-search", text: "1.8 KB context", metric: "v1_bytes", claimed: 1.8, unit: "KB" },
  { id: "session-continuity", text: "compaction recovery with full state", metric: "compaction", claimed: null, unit: null },
];
// two-sided 95% t quantiles, df 1..30 (index = df - 1, so n pairs use T975[n - 2])
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];

function fail(msg) { throw new Error("analyze: " + msg); }
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function sd(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
function median(a) { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
const r1 = (x) => Math.round(x * 10) / 10;
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const r7 = (x) => Math.round(x * 1e7) / 1e7;
const sumCalls = (o) => Object.values(o).reduce((s, x) => s + x, 0);

// Paired comparison by the prereg rule: d = arm - base per pair; % = mean(d)/mean(base); 95% t interval.
export function paired(base, arm) {
  if (base.length !== arm.length || base.length < 2) fail("paired: need >= 2 equal-length samples");
  const n = base.length, d = arm.map((x, i) => x - base[i]);
  if (n - 1 > T975.length) fail("paired: n above the t table");
  const mb = mean(base), md = mean(d), h = T975[n - 2] * sd(d) / Math.sqrt(n);
  const lo = 100 * (md - h) / mb, hi = 100 * (md + h) / mb;
  return {
    n, t: T975[n - 2], base_usd_mean: r5(mb), arm_usd_mean: r5(mean(arm)), pct: r1(100 * md / mb), pct_ci95: [r1(lo), r1(hi)],
    verdict: hi < 0 ? "less" : lo > 0 ? "more" : "same", ci_crosses_zero: lo <= 0 && hi >= 0,
    median_diff_usd: r7(median(d)), arm_wins: d.filter((x) => x < 0).length, per_1000_tasks_usd: r1((mb - mean(arm)) * 1000),
  };
}

// List-price USD from token columns. Client rows: the result event columns. Gateway rows: the gateway per-call
// record (prompt includes cache reads and writes; cache writes priced at the 1 hour rate, as the runner did).
function clientUsd(calls) {
  let usd = 0;
  for (let i = 0; i < calls.models.length; i++) {
    const p = PRICES[calls.models[i]]; if (!p) fail("model outside the price table: " + calls.models[i]);
    for (const k of ["in", "out", "cr", "cw5", "cw1h", "cwx"]) {
      const col = calls[k] || []; let s = 0;
      for (let j = 0; j < col.length; j++) if ((calls.model?.[j] ?? 0) === i) s += col[j] ?? 0;
      usd += s * p[k === "cwx" ? "cw1h" : k] / 1e6;
    }
  }
  return usd;
}
function gatewayUsd(t) {
  const p = PRICES["claude-opus-5-5"];
  return ((t.prompt - t.cache_read - t.cache_write) * p.in + t.cache_read * p.cr + t.cache_write * p.cw1h + t.output * p.out) / 1e6;
}
function tokens(r) {
  if (r.arm === "gateway") return r.gateway_record.tokens.prompt + r.gateway_record.tokens.output;
  return ["in", "out", "cr", "cw5", "cw1h", "cwx"].reduce((s, k) => s + (r.calls[k] || []).reduce((a, b) => a + b, 0), 0);
}

function loadBytes() {
  const raw = readFileSync(join(HERE, "tool-result-bytes.json"));
  const j = JSON.parse(raw.toString("utf8"));
  if (j.schema !== "context-mode.tryit-tool-result-bytes/1") fail("tool-result-bytes.json: unknown schema");
  return { sessions: j.sessions, method: j.method, sha256: sha256(raw) };
}

function loadRuns(w, bytes) {
  const raw = readFileSync(join(HERE, "runs", w + ".jsonl"));
  const rows = raw.toString("utf8").split("\n").filter((l) => l.length > 0).map((l, i) => {
    try { return JSON.parse(l); } catch { fail(`${w}.jsonl line ${i + 1}: not JSON`); }
  });
  for (const r of rows) {
    const at = `${w} cycle ${r.cycle} ${r.arm}`;
    if (r.w !== w) fail(`${w}.jsonl: row for prompt ${r.w}`);
    if (typeof r.usd !== "number" || typeof r.success !== "boolean") fail(`${at}: unknown row shape`);
    if (r.model !== "claude-opus-5-5" || r.client_version !== "2.1.303") fail(`${at}: model or client drift`);
    if (r.calls.models.some((m) => m !== "claude-opus-5-5")) fail(`${at}: a call on another model`);
    if (!r.resolution || r.resolution.ok !== true) fail(`${at}: unresolved arm in a counted row`);
    const am = r.amendment ?? 0;
    if (am !== 0 && am !== 1) fail(`${at}: unknown amendment ${am}`);
    if (am === 1 && !AMENDED[w]) fail(`${at}: amendment-1 line for a prompt the amendment did not re-run`);
    if (r.harness_commit !== (am ? HARNESS_COMMIT_A1 : HARNESS_COMMIT)) fail(`${at}: harness commit changed`);
    if (r.gw_version_before !== r.gw_version_after) fail(`${at}: gateway version changed during the run`);
    if (PLUGIN[r.arm]) {
      const p = r.plugin;
      if (!p || p.git_head !== PLUGIN[r.arm].git_head || p.manifest_version !== PLUGIN[r.arm].version || p.dirty !== false) fail(`${at}: plugin revision`);
    }
    if (r.arm === "gateway") {
      const g = r.gateway_record;
      if (!g || !g.found || !g.complete || g.coverage?.covered !== true) fail(`${at}: gateway record missing, incomplete or below the client tokens`);
      if (Math.abs(gatewayUsd(g.tokens) - r.usd) > 1e-6 || Math.abs(g.anthropic_usd - r.usd) > 1e-6) fail(`${at}: usd does not match the gateway record`);
      if (JSON.stringify(r.flags_before) !== JSON.stringify(r.flags_after)) fail(`${at}: tenant flags changed`);
    } else if (Math.abs(clientUsd(r.calls) - r.usd) > 1e-6) fail(`${at}: usd ${r.usd} != recomputed ${clientUsd(r.calls)}`);
    const b = bytes.filter((s) => s.w === w && (s.amendment ?? 0) === am && s.cycle === r.cycle && s.arm === r.arm && s.role === r.role && s.attempt === r.attempt);
    if (b.length !== 1) fail(`${at}: ${b.length} byte records`);
    if (typeof b[0].oracle !== "string" || (b[0].oracle === "ok") !== r.success) fail(`${at}: oracle reason and success differ`);
    r._b = b[0];
  }
  return { rows, sha256: sha256(raw) };
}

function armRecord(r) {
  const o = { usd: r.usd, usd_client: r.usd_client, tokens: tokens(r), success: r.success, oracle: r._b.oracle,
    turns: r.turns, result_subtype: r.result_subtype, timed_out: r.timed_out, rate_limited: r.rate_limited, budget_hit: r.budget_hit,
    tool_result_bytes: r._b.tool_result_bytes, tool_result_blocks: r._b.tool_result_blocks,
    tool_calls: sumCalls(r._b.tool_calls), tool_calls_by_name: r._b.tool_calls, tools_runner: r.tools,
    compact_boundary: r._b.compact_boundary, ...(r._b.result_events ? { result_events: r._b.result_events } : {}), transcript_sha256: r._b.transcript_sha256, order_position: r.position, calls: r.calls };
  if (r.arm === "v1" || r.arm === "v2") {
    o.plugin_tool_calls = Object.entries(r._b.tool_calls).filter(([k]) => k.startsWith("mcp__")).reduce((s, [, v]) => s + v, 0);
    o.plugin_tools_listed = r.resolution.plugin_tools.length;
    if (r.plugin.build_sha256sums) o.plugin_build_sha256sums = r.plugin.build_sha256sums;
  }
  if (r.arm === "gateway") {
    const g = r.gateway_record;
    o.gateway_record = { requests: g.requests, edge_calls: g.edge_calls, tokens: g.tokens, anthropic_usd: g.anthropic_usd,
      covers_client: true, unseen_by_client: g.coverage.unseen_by_client };
    o.flags = r.flags_before;
  }
  return o;
}

function pairsOf(w, rows, nPlanned) {
  const measured = rows.filter((r) => r.role === "measured");
  const cycles = [...new Set(measured.map((r) => r.cycle))].sort((a, b) => a - b);
  if (cycles.length > nPlanned) fail(`${w}: more measured cycles than planned`);
  return cycles.map((c) => {
    const p = { cycle: c, order: null };
    for (const a of ARMS) {
      const rs = measured.filter((r) => r.cycle === c && r.arm === a);
      if (rs.length !== 1) fail(`${w} cycle ${c}: ${rs.length} measured rows for ${a}`);
      p[a] = armRecord(rs[0]); p.order = rs[0].order;
    }
    return p;
  });
}

function armSummary(pairs, a) {
  const col = (k) => pairs.map((p) => p[a][k]);
  const s = { usd_mean: r5(mean(col("usd"))), tokens_mean: Math.round(mean(col("tokens"))),
    tool_result_bytes_mean: Math.round(mean(col("tool_result_bytes"))), tool_result_bytes_median: median(col("tool_result_bytes")),
    tool_result_bytes: col("tool_result_bytes"), tool_calls: col("tool_calls"), tool_calls_median: median(col("tool_calls")),
    success: `${pairs.filter((p) => p[a].success).length}/${pairs.length}`,
    oracle_reasons: [...new Set(col("oracle"))].sort() };
  if (a === "v1" || a === "v2") s.routed = `${pairs.filter((p) => p[a].plugin_tool_calls > 0).length}/${pairs.length}`;
  if (a === "gateway") {
    s.no_client_tool_call = `${pairs.filter((p) => p[a].tool_calls === 0).length}/${pairs.length}`;
    s.edge_calls_when_no_client_tool_call = pairs.filter((p) => p[a].tool_calls === 0).map((p) => p[a].gateway_record.edge_calls);
    s.edge_calls = pairs.map((p) => p[a].gateway_record.edge_calls);
  }
  return s;
}

// prereg: HOLDS when the measured median is within 25% of the claimed number, DIFFERS otherwise.
function checkClaim(c, byId) {
  if (c.metric === "compaction") {
    const ps = byId[c.id].pairs;
    const comp = ps.reduce((s, p) => s + p.v1.compact_boundary, 0);
    return { ...c, measured: `${comp} compactions in ${ps.length} v1 sessions`, verdict: comp > 0 ? "INCONCLUSIVE (compaction seen, recovery not scored)" : "INCONCLUSIVE",
      why: "No v1 session compacted (no compact_boundary event in the transcript), so recovery was not exercised. Two cycles, demonstration only." };
  }
  const ps = byId[c.id].pairs;
  const v1b = ps.map((p) => p.v1.tool_result_bytes), plb = ps.map((p) => p.plain.tool_result_bytes);
  const out = { ...c };
  if (c.metric === "v1_calls") {
    const v = ps.map((p) => p.v1.tool_calls), ts = ps.map((p) => p.v1.tool_calls_by_name.ToolSearch || 0);
    out.measured_median = median(v); out.measured_range = [Math.min(...v), Math.max(...v)];
    out.measured_median_without_toolsearch = median(v.map((x, i) => x - ts[i]));
    out.basis = "v1 tool_use blocks per session (all tools, ToolSearch included), median of the measured cycles";
  } else if (c.metric === "v1_bytes" || c.metric === "plain_bytes") {
    const v = c.metric === "v1_bytes" ? v1b : plb;
    out.measured_median_bytes = median(v); out.measured_range_bytes = [Math.min(...v), Math.max(...v)];
    out.measured_median = r1(median(v) / 1000); out.measured_median_kib = r1(median(v) / 1024);
    out.basis = c.metric === "v1_bytes" ? "v1 tool_result bytes per session, median (KB = 1,000 bytes)"
      : "plain arm tool_result bytes per session, median (prereg: the unrouted size where only the plain arm can give it)";
  } else if (c.metric === "pct_saved") {
    const v = ps.map((p) => 100 * (1 - p.v1.tool_result_bytes / p.plain.tool_result_bytes));
    out.measured_median = r1(median(v)); out.measured_range = [r1(Math.min(...v)), r1(Math.max(...v))];
    out.basis = "per cycle 100 x (1 - v1 bytes / plain bytes), median; a negative value means v1 showed more bytes";
  }
  const within = (x) => Math.abs(x - c.claimed) <= 0.25 * Math.abs(c.claimed);
  out.verdict = within(out.measured_median) ? "HOLDS" : "DIFFERS";
  if (c.unit === "KB") out.verdict_if_kb_is_1024 = within(median(c.metric === "v1_bytes" ? v1b : plb) / 1024) ? "HOLDS" : "DIFFERS";
  out.relative_to_claim_pct = r1(100 * (out.measured_median - c.claimed) / Math.abs(c.claimed));
  return out;
}

export function build() {
  const bytes = loadBytes();
  const inputs = [{ file: "tool-result-bytes.json", sha256: bytes.sha256, sessions: bytes.sessions.length }];
  const prompts = [], byId = {};
  let sessions = 0, spend = 0, voids = 0, warm = 0, spendSuperseded = 0;
  const superseded = [];
  for (const w of [...PROMPTS, DEMO]) {
    const { rows: all, sha256: h } = loadRuns(w, bytes.sessions);
    inputs.push({ file: `runs/${w}.jsonl`, sha256: h, sessions: all.length });
    sessions += all.length; spend += all.reduce((s, r) => s + r.usd, 0);
    voids += all.filter((r) => r.role === "void").length; warm += all.filter((r) => r.role === "warmup").length;
    const demo = w === DEMO;
    const rows = AMENDED[w] ? all.filter((r) => r.amendment === 1) : all;
    if (AMENDED[w]) {
      const old = all.filter((r) => (r.amendment ?? 0) === 0);
      if (rows.length === 0) fail(`${w}: no amendment-1 lines`);
      spendSuperseded += old.reduce((s, r) => s + r.usd, 0);
      const op = pairsOf(w, old, N_PLANNED), oc = (a) => op.map((p) => p[a].usd);
      superseded.push({ id: w, label: LABELS[w], reason: AMENDED[w], replaced_by: "amendment 1 run lines of the same prompt",
        run_lines: old.length, harness_commit: HARNESS_COMMIT, gateway_tenant_scope: "prompt",
        analysis: { n: op.length, arms: Object.fromEntries(ARMS.map((a) => [a, armSummary(op, a)])),
          v1_vs_plain: paired(oc("plain"), oc("v1")), v2_vs_plain: paired(oc("plain"), oc("v2")),
          gateway_vs_plain: paired(oc("plain"), oc("gateway")), v2_vs_v1_secondary: paired(oc("v1"), oc("v2")) },
        pairs: op });
    }
    const pairs = pairsOf(w, rows, demo ? N_DEMO : N_PLANNED);
    const col = (a) => pairs.map((p) => p[a].usd);
    const arms = Object.fromEntries(ARMS.map((a) => [a, armSummary(pairs, a)]));
    const entry = { id: w, label: LABELS[w], demonstration_only: demo, pairs_planned: demo ? N_DEMO : N_PLANNED,
      run_set: AMENDED[w] ? "amendment 1" : "first run", harness_commit: AMENDED[w] ? HARNESS_COMMIT_A1 : HARNESS_COMMIT,
      gateway_tenant_scope: AMENDED[w] ? "session" : "prompt",
      gateway_tool_calls_rule: AMENDED[w] ? "completion check counts client tool_use blocks plus gateway edge_calls" : "completion check counts client tool_use blocks only",
      void_sessions: rows.filter((r) => r.role === "void").length, warmup_sessions: rows.filter((r) => r.role === "warmup").length,
      analysis: demo ? { n: pairs.length, arms, note: "Demonstration only (prereg): no interval, no verdict, no claim." } : {
        n: pairs.length, arms,
        v1_vs_plain: paired(col("plain"), col("v1")), v2_vs_plain: paired(col("plain"), col("v2")),
        gateway_vs_plain: paired(col("plain"), col("gateway")), v2_vs_v1_secondary: paired(col("v1"), col("v2")),
      },
      pairs };
    if (!demo) {
      const wu = rows.filter((r) => r.role === "warmup");
      entry.warmup_usd = Object.fromEntries(ARMS.map((a) => [a, r5(wu.find((r) => r.arm === a)?.usd ?? NaN)]));
    }
    prompts.push(entry); byId[w] = entry;
  }
  if (spend >= STOP_USD) fail("spend reached the stop rule; the run files should not hold more sessions");
  const claims = CLAIMS.map((c) => checkClaim(c, byId));
  // Descriptive sum over the measured pairs of prompts 1 to 5 (not in the prereg analysis; no interval: different prompts).
  const counted = prompts.filter((p) => !p.demonstration_only);
  const pooled = { note: "Sum over the measured pairs of the five counted prompts (amendment-1 pairs for web-scrape, docs-search and large-json; first-run pairs for the other two). Descriptive only: no interval, the rows are different prompts.",
    pairs: counted.reduce((s, p) => s + p.pairs.length, 0) };
  const plainTotal = counted.reduce((s, p) => s + p.pairs.reduce((a, q) => a + q.plain.usd, 0), 0);
  pooled.plain_usd = r5(plainTotal);
  for (const a of ["v1", "v2", "gateway"]) {
    const t = counted.reduce((s, p) => s + p.pairs.reduce((x, q) => x + q[a].usd, 0), 0);
    pooled[a] = { usd: r5(t), pct: r1(100 * (t - plainTotal) / plainTotal),
      arm_wins: counted.reduce((s, p) => s + p.pairs.filter((q) => q[a].usd < q.plain.usd).length, 0),
      success: `${counted.reduce((s, p) => s + p.pairs.filter((q) => q[a].success).length, 0)}/${pooled.pairs}` };
  }
  pooled.plain_success = `${counted.reduce((s, p) => s + p.pairs.filter((q) => q.plain.success).length, 0)}/${pooled.pairs}`;

  const ab = {
    schema: "context-mode.benchmark-evidence/2",
    title: "README try-it prompts: direct vs OSS v1 vs OSS v2 vs the Context Mode gateway (Opus 5.5)",
    date: "2026-10-22",
    client: "Claude Code 2.1.303",
    model: "claude-opus-5-5",
    harness: "start-cost-ab-arms --workloads tryit (gateway repo worktree, local branch, never pushed) + bench/gateway-ab/tryit.patch",
    harness_commit: HARNESS_COMMIT,
    harness_commit_amendment_1: HARNESS_COMMIT_A1,
    prereg: { file: "bench/evidence/try-it/prereg.md", commit: "f924eda2ec61692f08aa3fe8dc9bcdf1512dc0e6",
      committed: "2026-10-22T10:51:33Z", first_run_commit: "2026-10-22T11:13:39Z", amendment_1: AMENDMENT },
    arms: {
      plain: "Claude Code alone (direct). Empty strict MCP map, no plugin.",
      v1: `OSS plugin v1: origin/main ${PLUGIN.v1.git_head}, version ${PLUGIN.v1.version}, npm install --omit=dev.`,
      v2: `OSS plugin v2: v2-design ${PLUGIN.v2.git_head} built to release-out (manifest version ${PLUGIN.v2.version}).`,
      gateway: "Claude Code talks to Anthropic through the live Context Mode gateway, default tenant flags. First run: one new disposable tenant per prompt. Amendment 1: one new disposable tenant per session.",
    },
    plugin_revisions: { v1: { ...PLUGIN.v1, dirty: false }, v2: { ...PLUGIN.v2, dirty: false } },
    warmup_cycles: 1,
    prices: { as_of: "2026-09-29", source_url: "https://www.anthropic.com/pricing", unit: "USD per million tokens", models: PRICES },
    cost_basis: "Client arms: list price on the token counts in each session's result event; cache writes whose lifetime is not split are priced at the 1 hour rate. Gateway arm: list price on the gateway's per-call record for the session, hidden calls included; analyze.mjs prices the record again and stops on a difference. Claude Code's own total_cost_usd is kept as usd_client. The runs used a claude.ai login: every figure is a list-price equivalent, not an invoice.",
    bytes_basis: bytes.method + " Gateway arm: the bytes the client sent; the gateway can change them before the model sees them, and the record does not hold that size.",
    analysis_method: "Every measured cycle, failures included, no outlier dropped. Per prompt, d = arm - plain per cycle. % = 100 x mean(d) / mean(plain), with the 95% t interval at df = n - 1 (t = 3.182 at n = 4). Verdict: less when the whole interval is below zero, more when above, else same. arm_wins: cycles where the arm cost less than plain. v2 against v1 is secondary. session-continuity: demonstration only.",
    success_rules: {
      "large-json": "the planted record value is in the final answer, read against the served data on disk; fails closed (no-served-data-on-disk) when no served file exists",
      "git-history": "the final answer names the top git shortlog author over the same 500 commits",
      "large-json (amendment 1)": "every scalar leaf of the record at index 13000, JSON-parsed from the last tool_result that served or generated it, appears whole in the final answer; fails closed (no-record-in-tool-result) when no such tool_result exists",
      other: "completion check: end_turn, at least one tool call, non-empty answer. First run: client tool calls only. Amendment 1: client tool calls plus gateway edge_calls. Not a quality check.",
    },
    spend_usd_list_price: r5(spend), spend_usd_superseded: r5(spendSuperseded), stop_rule_usd: STOP_USD,
    sessions, warmup_sessions: warm, void_sessions: voids,
    inputs,
    withheld: ["prompt and answer text", "session ids", "tenant ids", "gateway host", "local paths", "raw transcripts", "credentials"],
    pooled,
    readme_claims: { source: "README.md 'Try It' at origin/main a92cf6a77ac02971fb5fafe2155e5ee229491884", rule: "HOLDS when the measured median is within 25% of the claimed number, else DIFFERS. A link the run did not exercise is INCONCLUSIVE.", checks: claims },
    prompts,
    superseded,
  };

  const index = {
    title: "README try-it prompts: direct vs OSS v1 vs OSS v2 vs the Context Mode gateway: evidence index",
    source: "bench/evidence/try-it/analyze.mjs",
    files: [{ date: ab.date, file: "ab.json", model: ab.model, client: ab.client, prereg: ab.prereg.file,
      prompts: prompts.map((p) => p.demonstration_only ? { id: p.id, label: p.label, demonstration_only: true, n: p.analysis.n } : {
        id: p.id, label: p.label, n: p.analysis.n,
        v1: { pct: p.analysis.v1_vs_plain.pct, pct_ci95: p.analysis.v1_vs_plain.pct_ci95, verdict: p.analysis.v1_vs_plain.verdict },
        v2: { pct: p.analysis.v2_vs_plain.pct, pct_ci95: p.analysis.v2_vs_plain.pct_ci95, verdict: p.analysis.v2_vs_plain.verdict },
        gateway: { pct: p.analysis.gateway_vs_plain.pct, pct_ci95: p.analysis.gateway_vs_plain.pct_ci95, verdict: p.analysis.gateway_vs_plain.verdict },
        success: Object.fromEntries(ARMS.map((a) => [a, p.analysis.arms[a].success])) }),
      readme_claims: claims.map((c) => ({ id: c.id, claim: c.text, verdict: c.verdict })) },
      { file: "tool-result-bytes.json", sha256: bytes.sha256, writer: "measure-bytes.mjs (needs the private transcripts)" }],
    preregistrations: [{ file: "prereg.md", commit: ab.prereg.commit, committed: ab.prereg.committed },
      { file: "prereg-amendment-1.md", commit: AMENDMENT.commit, committed: AMENDMENT.committed }],
    superseded: superseded.map((x) => ({ id: x.id, run_lines: x.run_lines, reason: x.reason })),
    runs: [...PROMPTS, DEMO].map((w) => `runs/${w}.jsonl`),
  };
  return { ab, index };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const { ab, index } = build();
  const out = { "ab.json": JSON.stringify(ab, null, 1) + "\n", "index.json": JSON.stringify(index, null, 1) + "\n" };
  if (process.argv.includes("--check")) {
    let bad = 0;
    for (const [f, s] of Object.entries(out)) {
      const p = join(HERE, f);
      if (!existsSync(p) || readFileSync(p, "utf8") !== s) { console.error("differs: " + f); bad++; }
    }
    process.exit(bad ? 1 : 0);
  }
  for (const [f, s] of Object.entries(out)) writeFileSync(join(HERE, f), s);
  for (const p of ab.prompts) {
    const a = p.analysis, s = (k) => `${a.arms[k].success} ${a.arms[k].tool_result_bytes_mean}B`;
    if (p.demonstration_only) { console.log(`${p.id} (demo): ` + ARMS.map((k) => `${k} $${a.arms[k].usd_mean} ${s(k)}`).join(" | ")); continue; }
    const f = (x) => `${x.pct}% [${x.pct_ci95}] ${x.verdict} ${x.arm_wins}/${x.n}`;
    console.log(`${p.id}: plain $${a.arms.plain.usd_mean} ${s("plain")} | v1 $${a.arms.v1.usd_mean} ${f(a.v1_vs_plain)} ${s("v1")} | v2 $${a.arms.v2.usd_mean} ${f(a.v2_vs_plain)} ${s("v2")} | gw $${a.arms.gateway.usd_mean} ${f(a.gateway_vs_plain)} ${s("gateway")} | v2vsv1 ${f(a.v2_vs_v1_secondary)}`);
  }
  for (const c of ab.readme_claims.checks) console.log(`claim ${c.id} "${c.text}": ${c.measured ?? c.measured_median} ${c.verdict}${c.verdict_if_kb_is_1024 && c.verdict_if_kb_is_1024 !== c.verdict ? " (KiB: " + c.verdict_if_kb_is_1024 + ")" : ""}`);
  console.log("pooled", JSON.stringify(ab.pooled));
  console.log("spend", ab.spend_usd_list_price, "sessions", ab.sessions, "void", ab.void_sessions);
}
