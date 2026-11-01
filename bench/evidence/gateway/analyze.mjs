#!/usr/bin/env node
// Deterministic analysis for bench/evidence/gateway (pre-registration: prereg.md, commit bcc45e33).
// Inputs:  runs/<workload>.jsonl (one line per session) and published/v3-opus55-short.json (the gateway rows,
//          a byte copy of /benchmarks/data/v3-opus55-short.json from the site, checked by SHA-256).
// Outputs: ab.json (schema context-mode.benchmark-evidence/2) and index.json, in this folder.
// No clock, no network, no randomness: the same inputs give the same bytes. `--check` exits 1 when the files differ.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKLOADS = ["tests", "json", "log", "git", "grep", "edit"];
const ARMS = ["plain", "v1", "v2"];
const N_PLANNED = 8;
const PUBLISHED_FILE = "published/v3-opus55-short.json";
const PUBLISHED_SHA256 = "3298b1b2aa1af9b56abb4ecce660bb0c2ccb9ecc64de664557c03a7e6579cfce";
const PRICES = { // USD per million tokens, copied from the published evidence file (prereg "Freeze")
  "claude-opus-5-5": { in: 4, out: 20, cr: 0.2, cw5: 5, cw1h: 8 },
  "claude-haiku-4-5": { in: 1, out: 5, cr: 0.1, cw5: 1.25, cw1h: 2 },
};
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

// Paired comparison by the prereg rule: d = arm - base per pair; % = mean(d)/mean(base); 95% t interval.
export function paired(base, arm) {
  if (base.length !== arm.length || base.length < 2) fail("paired: need >= 2 equal-length samples");
  const n = base.length, d = arm.map((x, i) => x - base[i]);
  if (n - 1 > T975.length) fail("paired: n above the t table");
  const mb = mean(base), md = mean(d), h = T975[n - 2] * sd(d) / Math.sqrt(n);
  const lo = 100 * (md - h) / mb, hi = 100 * (md + h) / mb;
  return {
    n, base_usd_mean: r5(mb), arm_usd_mean: r5(mean(arm)), pct: r1(100 * md / mb), pct_ci95: [r1(lo), r1(hi)],
    verdict: hi < 0 ? "less" : lo > 0 ? "more" : "same", median_diff_usd: r7(median(d)),
    arm_wins: d.filter((x) => x < 0).length, per_1000_tasks_usd: r1((mb - mean(arm)) * 1000),
    _unrounded: { pct: 100 * md / mb, lo, hi },
  };
}

// Recompute list-price USD from the record's own token columns (an independent check of the runner's usd field).
function recompute(calls) {
  let usd = 0;
  for (let i = 0; i < calls.models.length; i++) {
    const p = PRICES[calls.models[i]]; if (!p) fail("model outside the price table: " + calls.models[i]);
    for (const k of ["in", "out", "cr", "cw5", "cw1h"]) {
      const col = calls[k] || []; let s = 0;
      for (let j = 0; j < col.length; j++) if ((calls.model?.[j] ?? 0) === i) s += col[j] ?? 0;
      usd += s * p[k] / 1e6;
    }
  }
  return usd;
}

function loadRuns(w) {
  const path = join(HERE, "runs", w + ".jsonl");
  const raw = readFileSync(path);
  const rows = raw.toString("utf8").split("\n").filter((l) => l.length > 0).map((l, i) => {
    try { return JSON.parse(l); } catch { fail(`${w}.jsonl line ${i + 1}: not JSON`); }
  });
  for (const r of rows) {
    if (r.w !== w) fail(`${w}.jsonl: row for workload ${r.w}`);
    if (typeof r.usd !== "number" || typeof r.success !== "boolean") fail(`${w}.jsonl: unknown row shape`);
    if (r.model !== "claude-opus-5-5" || r.client_version !== "2.1.303") fail(`${w}.jsonl: model or client drift`);
    if (!r.resolution || r.resolution.ok !== true) fail(`${w}.jsonl: unresolved arm in a counted row (cycle ${r.cycle} ${r.arm})`);
    const rc = recompute(r.calls);
    if (Math.abs(rc - r.usd) > 1e-6) fail(`${w}.jsonl: usd ${r.usd} != recomputed ${rc} (cycle ${r.cycle} ${r.arm})`);
  }
  return { rows, sha256: sha256(raw) };
}

function armRecord(r) {
  const o = { usd: r.usd, usd_low: r.usd_low, usd_client: r.usd_client, client_gap_flag: r.client_gap_flag,
    success: r.success, turns: r.turns, calls: r.calls, calls_from: r.calls_from, tools: r.tools,
    result_subtype: r.result_subtype, timed_out: r.timed_out, rate_limited: r.rate_limited, budget_hit: r.budget_hit,
    order_position: r.position };
  if (r.arm !== "plain" && r.arm !== "gateway") {
    o.plugin_tool_calls = r.plugin_tool_calls;
    o.plugin_tools_listed = r.resolution.plugin_tools.length;
  }
  if (r.gateway_record) {
    o.gateway_record = { found: r.gateway_record.found, complete: r.gateway_record.complete,
      requests: r.gateway_record.requests, edge_calls: r.gateway_record.edge_calls,
      tokens: r.gateway_record.tokens, anthropic_usd: r.gateway_record.anthropic_usd,
      covers_client: r.gateway_record.coverage?.covered === true };
    o.flags_before = r.flags_before; o.flags_after = r.flags_after;
    o.gateway_version_same_before_after = r.gw_version_before === r.gw_version_after;
  }
  return o;
}

const stripU = (a) => { const { _unrounded, ...rest } = a; return rest; };

export function build() {
  const pubRaw = readFileSync(join(HERE, PUBLISHED_FILE));
  if (sha256(pubRaw) !== PUBLISHED_SHA256) fail("published gateway file SHA-256 changed");
  const pub = JSON.parse(pubRaw.toString("utf8"));
  if (pub.schema !== "context-mode.benchmark-evidence/2") fail("published file: unknown schema");

  const inputs = [{ file: PUBLISHED_FILE, sha256: PUBLISHED_SHA256 }];
  const workloads = [], pooled = { plain: [], v1: [], v2: [] }, plugin = {};
  let sessions = 0, spend = 0, voids = 0;

  for (const w of WORKLOADS) {
    const { rows, sha256: h } = loadRuns(w);
    inputs.push({ file: `runs/${w}.jsonl`, sha256: h, sessions: rows.length });
    sessions += rows.length; spend += rows.reduce((s, r) => s + r.usd, 0);
    voids += rows.filter((r) => r.role === "void").length;
    for (const r of rows) if (r.plugin) {
      const k = `${r.arm}`; const v = `${r.plugin.git_head}|${r.plugin.manifest_version}|${r.plugin.dirty}`;
      if (plugin[k] && plugin[k] !== v) fail("plugin revision changed inside the run: " + k);
      plugin[k] = v;
    }

    const measured = rows.filter((r) => r.role === "measured");
    const cycles = [...new Set(measured.map((r) => r.cycle))].sort((a, b) => a - b);
    const pairs = [];
    for (const c of cycles) {
      const p = { pair: c, order: null };
      for (const a of ARMS) {
        const rs = measured.filter((r) => r.cycle === c && r.arm === a);
        if (rs.length !== 1) fail(`${w} cycle ${c}: ${rs.length} measured rows for ${a}`);
        p[a] = armRecord(rs[0]); p.order = rs[0].order;
      }
      pairs.push(p);
    }
    if (pairs.length > N_PLANNED) fail(`${w}: more measured cycles than planned`);
    const col = (a) => pairs.map((p) => p[a].usd);
    for (const a of ARMS) pooled[a].push(...col(a));
    const succ = (a) => `${pairs.filter((p) => p[a].success).length}/${pairs.length}`;
    const routed = (a) => `${pairs.filter((p) => p[a].plugin_tool_calls > 0).length}/${pairs.length}`;

    // published gateway row, cited by workload id, re-derived from its own pairs as a check of the method
    const pw = pub.workloads.find((x) => x.id === w); if (!pw) fail("published file has no workload " + w);
    const re = paired(pw.pairs.map((p) => p.plain.usd), pw.pairs.map((p) => p.gateway.usd));
    const ciGap = r1(Math.max(Math.abs(re.pct_ci95[0] - pw.analysis.pct_ci95[0]), Math.abs(re.pct_ci95[1] - pw.analysis.pct_ci95[1])));
    const reproduced = re.pct === pw.analysis.pct && re.verdict === pw.analysis.verdict &&
      re.arm_wins === pw.analysis.gateway_wins && ciGap <= 0.2;

    // bridge: drift check only, never merged
    const br = rows.filter((r) => r.role === "bridge");
    let bridge = { ran: false, why: "not run in this lane: the gateway host in the harness config answered HTTP 404 at the tenant preflight, and the lane ran without the bridge. No gateway figure from today for this workload (INCONCLUSIVE)." };
    if (br.length) {
      const bc = [...new Set(br.map((r) => r.cycle))].sort((a, b) => a - b);
      const bp = bc.map((c) => {
        const pl = br.find((r) => r.cycle === c && r.arm === "plain"), gw = br.find((r) => r.cycle === c && r.arm === "gateway");
        if (!pl || !gw) fail(`${w} bridge pair ${c} incomplete`);
        const pct = 100 * (gw.usd - pl.usd) / pl.usd;
        return { pair: c, order: pl.order, plain: armRecord(pl), gateway: armRecord(gw), pct: r1(pct),
          inside_published_range: pct >= pw.analysis.pct_ci95[0] && pct <= pw.analysis.pct_ci95[1] };
      });
      bridge = { ran: true, pairs: bp, plain_usd_mean: r5(mean(bp.map((p) => p.plain.usd))),
        gateway_usd_mean: r5(mean(bp.map((p) => p.gateway.usd))),
        pct_of_means: r1(100 * (mean(bp.map((p) => p.gateway.usd)) - mean(bp.map((p) => p.plain.usd))) / mean(bp.map((p) => p.plain.usd))),
        inside_published_range: `${bp.filter((p) => p.inside_published_range).length} of ${bp.length}`,
        note: "Drift check only. Two pairs have no interval and no verdict. Not merged into any row." };
    }

    workloads.push({
      id: w, label: pw.label, pairs_planned: N_PLANNED, invalid_attempts: rows.filter((r) => r.role === "void").length,
      warmup_sessions: rows.filter((r) => r.role === "warmup").length,
      analysis: {
        n: pairs.length,
        plain_usd_mean: r5(mean(col("plain"))), v1_usd_mean: r5(mean(col("v1"))), v2_usd_mean: r5(mean(col("v2"))),
        success_plain: succ("plain"), success_v1: succ("v1"), success_v2: succ("v2"),
        routed_v1: routed("v1"), routed_v2: routed("v2"),
        v1_vs_plain: stripU(paired(col("plain"), col("v1"))),
        v2_vs_plain: stripU(paired(col("plain"), col("v2"))),
        v2_vs_v1_secondary: stripU(paired(col("v1"), col("v2"))),
      },
      gateway_published: {
        source_file: "/benchmarks/data/" + pub.source_file, copy: PUBLISHED_FILE, sha256: PUBLISHED_SHA256,
        workload_id: pw.id, date: pub.date, client: pub.client, model: pub.model, gateway_commit: pub.gateway_commit,
        prereg: "/benchmarks/prereg/v3-opus55-short-prereg.md", analysis: pw.analysis,
        reanalysed_from_pairs: { pct: re.pct, pct_ci95: re.pct_ci95, verdict: re.verdict, wins: re.arm_wins,
          per_1000_tasks_usd: re.per_1000_tasks_usd, ci_end_gap_points: ciGap, matches_published: reproduced,
          rule: "same pct, verdict and wins; interval ends within 0.2 points (tolerance for the rounded published pair usd values)" },
      },
      bridge,
      pairs,
    });
  }

  const all = {
    pairs: pooled.plain.length,
    plain_usd_sum: r5(pooled.plain.reduce((s, x) => s + x, 0)),
    v1_usd_sum: r5(pooled.v1.reduce((s, x) => s + x, 0)),
    v2_usd_sum: r5(pooled.v2.reduce((s, x) => s + x, 0)),
    v1_cost_less: pooled.v1.filter((x, i) => x < pooled.plain[i]).length,
    v2_cost_less: pooled.v2.filter((x, i) => x < pooled.plain[i]).length,
    note: "A sum over pairs, not a mean of rows. No interval: the rows are different tasks.",
  };
  all.v1_pct_of_sums = r1(100 * (all.v1_usd_sum - all.plain_usd_sum) / all.plain_usd_sum);
  all.v2_pct_of_sums = r1(100 * (all.v2_usd_sum - all.plain_usd_sum) / all.plain_usd_sum);

  const [v1head, v1ver] = plugin.v1.split("|"), [v2head, v2ver] = plugin.v2.split("|");
  const ab = {
    schema: "context-mode.benchmark-evidence/2",
    title: "Opus 5.5 short tasks: direct vs OSS v1 vs OSS v2, beside the published gateway rows",
    date: "2026-10-21",
    client: "Claude Code 2.1.303",
    model: "claude-opus-5-5",
    harness: "start-cost-ab (gateway commit 408333a4) + bench/gateway-ab/harness.patch",
    harness_commit: "f7a22f4bbc90594256b1adeec865444283fedda6",
    workload_source: "scripts/e2e/short-workloads.mjs at gateway commit 408333a48d082830f5813b3f539ec03993830a89, blob 20b2adfb0c33c3e791a26dcd2f9c6d34ae216756",
    prereg: { file: "bench/evidence/gateway/prereg.md", commit: "bcc45e33b521bb23fc5c6409a40d4f7c5ee2e536",
      committed: "2026-10-21T19:47:18Z", first_run_commit: "2026-10-21T20:13:44Z" },
    arms: {
      plain: "Claude Code alone (direct). Empty strict MCP map, no plugin.",
      v1: `OSS plugin v1: origin/main ${v1head}, version ${v1ver}, built with npm install --omit=dev.`,
      v2: `OSS plugin v2: v2-design ${v2head} built to release-out (manifest version ${v2ver}).`,
      gateway: "Claude Code talks to Anthropic through the Context Mode gateway. Published rows (2026-09-29) and the bridge pairs only.",
    },
    plugin_revisions: { v1: { git_head: v1head, version: v1ver, dirty: false }, v2: { git_head: v2head, version: v2ver, dirty: false } },
    warmup_pairs: 1,
    prices: { as_of: pub.prices.as_of, source_url: pub.prices.source_url, unit: pub.prices.unit, models: PRICES },
    cost_basis: "List price on the token counts in each session's result event, per model. Cache writes whose lifetime is not split are priced at the 1 hour rate (usd) and the 5 minute rate (usd_low). Claude Code's own total_cost_usd is kept as usd_client; a gap above 1% sets client_gap_flag. Bridge gateway sessions: the gateway's per-call record, hidden calls included. The runs used a claude.ai login: there is no per-token invoice, so every figure is a list-price equivalent.",
    analysis_method: "Every measured cycle, failures included, no outlier dropped. Per workload, d = arm - plain per cycle. % = 100 x mean(d) / mean(plain), with the 95% t interval. Verdict: less when the whole interval is below zero, more when above, else same. arm_wins: cycles where the arm cost less than plain. v2 against v1 is secondary. Gateway rows are the published rows, cited by workload id, each against its own published plain arm.",
    spend_usd_list_price: r5(spend),
    sessions, void_sessions: voids,
    inputs,
    pooled: all,
    withheld: ["prompt and answer text", "session ids", "tenant ids", "gateway host", "local paths", "raw transcripts", "credentials"],
    legend: pub.legend,
    workloads,
  };

  const index = {
    title: "Direct vs OSS v1 vs OSS v2 vs the Context Mode gateway: evidence index",
    source: "bench/evidence/gateway/analyze.mjs",
    files: [{ date: ab.date, file: "ab.json", model: ab.model, client: ab.client, prereg: ab.prereg.file,
      workloads: workloads.map((w) => ({ id: w.id, label: w.label,
        v1: { pct: w.analysis.v1_vs_plain.pct, verdict: w.analysis.v1_vs_plain.verdict },
        v2: { pct: w.analysis.v2_vs_plain.pct, verdict: w.analysis.v2_vs_plain.verdict },
        gateway_published: { pct: w.gateway_published.analysis.pct, verdict: w.gateway_published.analysis.verdict },
        bridge: w.bridge.ran ? w.bridge.inside_published_range + " inside the published range" : "not run" })) },
      { date: pub.date, file: PUBLISHED_FILE, model: pub.model, client: pub.client, sha256: PUBLISHED_SHA256,
        url: "/benchmarks/data/v3-opus55-short.json", prereg: "published/v3-opus55-short-prereg.md" }],
    preregistrations: [{ file: "prereg.md", commit: ab.prereg.commit, committed: ab.prereg.committed },
      { file: "published/v3-opus55-short-prereg.md", commit: "6e2b65d565aa68f3eacdcece77fe72721c18573f", committed: "2026-09-29T11:44:26Z" }],
    runs: WORKLOADS.map((w) => `runs/${w}.jsonl`),
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
  for (const w of ab.workloads) {
    const a = w.analysis, g = w.gateway_published;
    console.log(`${w.id}: plain $${a.plain_usd_mean} | v1 ${a.v1_vs_plain.pct}% [${a.v1_vs_plain.pct_ci95}] ${a.v1_vs_plain.verdict} ${a.v1_vs_plain.arm_wins}/${a.n} | v2 ${a.v2_vs_plain.pct}% [${a.v2_vs_plain.pct_ci95}] ${a.v2_vs_plain.verdict} ${a.v2_vs_plain.arm_wins}/${a.n} | v2vsv1 ${a.v2_vs_v1_secondary.pct}% ${a.v2_vs_v1_secondary.verdict} | gw ${g.analysis.pct}% repro=${g.reanalysed_from_pairs.matches_published} | bridge ${w.bridge.ran ? w.bridge.pairs.map((p) => p.pct).join(",") + " in " + w.bridge.inside_published_range : "no"}`);
  }
  console.log(JSON.stringify(ab.pooled), "spend", ab.spend_usd_list_price, "sessions", ab.sessions);
}
