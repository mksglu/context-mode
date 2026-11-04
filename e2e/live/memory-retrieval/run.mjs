#!/usr/bin/env node
// run.mjs — deterministic eval for the v2 memory-retrieval variants.
// No model calls. Reads queries + journals, builds one in-memory DB per
// project, runs each requested variant, scores it, writes aggregate
// tables to --out and per-query rows to a private directory.
//
// Usage:
//   node run.mjs --queries <dir> --journals <dir> --variants R0,R1,R2,R3,R4,R5
//                [--out https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md]
//                [--privout /tmp/memory-retrieval-private/results]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDb } from "./lib/db.mjs";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const QUERIES_DIR = arg("--queries");
const JOURNALS_DIR = arg("--journals");
const VARIANTS = (arg("--variants", "R0,R1,R2,R3,R4,R5") || "").split(",").filter(Boolean);
const OUT = arg("--out", path.join(path.dirname(new URL(import.meta.url).pathname), "results.md"));
const PRIVOUT = arg("--privout", "/tmp/memory-retrieval-private/results");

if (!QUERIES_DIR || !JOURNALS_DIR) {
  console.error("Usage: run.mjs --queries <dir> --journals <dir> [--variants R0,R1,...] [--out path] [--privout dir]");
  process.exit(2);
}

fs.mkdirSync(PRIVOUT, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

async function loadVariant(name) {
  const mod = await import(new URL(`./variants/${name}.mjs`, import.meta.url));
  return mod.search;
}

function halfOf(id) {
  const h = crypto.createHash("sha256").update(id).digest()[0];
  return h % 2 === 0 ? "A" : "B";
}

function byteLen(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// Discover projects: every *.json in queries dir that is not a *.decisions.json
const queryFiles = fs
  .readdirSync(QUERIES_DIR)
  .filter((f) => f.endsWith(".checked.json"))
  .sort();

const perQueryAll = []; // across all variants/projects
const timelineChecks = []; // {variant, queryId, orderOk, pagingOk}
const decisionAgg = {}; // variant -> {d3TruePos, d3FalsePos, d3FalseNeg, v1... } computed once per project (variant-independent for tag precision itself; recall measured against retrieval)

for (const qf of queryFiles) {
  const project = qf.replace(/\.checked\.json$|\.json$/, "");
  const journalPath = path.join(JOURNALS_DIR, `${project}.json`);
  if (!fs.existsSync(journalPath)) {
    console.error(`skip ${project}: no journal at ${journalPath}`);
    continue;
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const queries = JSON.parse(fs.readFileSync(path.join(QUERIES_DIR, qf), "utf8"));
  const decisionsPath = path.join(QUERIES_DIR, `${project}.decisions.json`);
  const decisions = fs.existsSync(decisionsPath) ? JSON.parse(fs.readFileSync(decisionsPath, "utf8")) : null;

  const db = buildDb(journal);

  // Decision tag precision/recall: D3 rows actually produced by the
  // journal (kind === 'decision') vs v1shape hint rows, against the
  // owner's humanDecisionsHint gold set. This is variant-independent
  // (it is about the TAG, not the ranking) so it is computed once per
  // project and reported next to the per-variant retrieval numbers.
  if (decisions) {
    const gold = new Set(decisions.humanDecisionsHint || []);
    const d3 = new Set(decisions.d3 || []);
    const v1shape = new Set(decisions.v1shape || []);
    const prf = (predicted) => {
      let tp = 0, fp = 0;
      for (const s of predicted) (gold.has(s) ? tp++ : fp++);
      const fn = [...gold].filter((s) => !predicted.has(s)).length;
      return {
        precision: predicted.size ? tp / predicted.size : 1,
        recall: gold.size ? tp / gold.size : 1,
        falsePositives: fp,
      };
    };
    decisionAgg[project] = { d3: prf(d3), v1shape: prf(v1shape) };
  }

  for (const variantName of VARIANTS) {
    const search = await loadVariant(variantName);
    for (const q of queries) {
      const half = halfOf(q.id);
      const visibleBeforeSeq = q.askedAtSeq ?? Infinity;
      const isTimeline = q.type === "timeline";
      const opts = {
        query: q.query,
        scope: "worktree",
        sessionId: q.session,
        worktree: journal.worktree ?? "wt",
        sort: isTimeline ? "timeline" : "relevance",
        source: q.type === "decision" ? "decision" : undefined,
        type: q.type,
        after: q.after ?? 0,
        limit: isTimeline ? 10 : 5,
        visibleBeforeSeq,
      };
      const t0 = performance.now();
      let hits = [];
      try {
        if (isTimeline && (q.gold || []).length) {
          // page from just before the window, 10 rows per page, follow the after cursor
          let after = q.gold[0] - 1; hits = [];
          while (hits.length < q.gold.length) {
            const page = search(db, { ...opts, after, limit: 10 });
            if (!page.length) break;
            hits.push(...page); after = page[page.length - 1].seq;
          }
          hits = hits.slice(0, q.gold.length);
        } else hits = search(db, opts);
      } catch (e) {
        hits = [];
      }
      const latencyMs = performance.now() - t0;
      const seqs = hits.map((h) => h.seq);
      const gold = q.gold || [];

      let recallAt5 = 0;
      let rr = 0;
      let orderOk = null;
      let pagingOk = null;

      if (isTimeline) {
        // Order correctness: returned seqs equal the gold seqs, in order.
        orderOk = seqs.length === gold.length && seqs.every((s, i) => s === gold[i]);
        // Paging completeness: no row missed or repeated vs the gold set.
        const seqSet = new Set(seqs);
        pagingOk = gold.every((g) => seqSet.has(g)) && seqSet.size === seqs.length;
        recallAt5 = orderOk ? 1 : 0;
        rr = orderOk ? 1 : 0;
        timelineChecks.push({ variant: variantName, id: q.id, orderOk, pagingOk });
      } else {
        const top5 = seqs.slice(0, 5);
        recallAt5 = gold.some((g) => top5.includes(g)) ? 1 : 0;
        const firstHitRank = seqs.findIndex((s) => gold.includes(s));
        rr = firstHitRank >= 0 ? 1 / (firstHitRank + 1) : 0;
      }

      const row = {
        id: q.id,
        project,
        variant: variantName,
        type: q.type,
        half,
        recallAt5,
        mrr: rr,
        orderOk,
        pagingOk,
        latencyMs: Number(latencyMs.toFixed(3)),
        resultBytes: byteLen(hits),
      };
      perQueryAll.push(row);
      fs.writeFileSync(path.join(PRIVOUT, `${project}__${q.id}__${variantName}.json`), JSON.stringify({ ...row, hits: seqs, gold }));
    }
  }
}

// ---- Aggregate ----
function agg(rows) {
  const n = rows.length;
  const recall = rows.reduce((a, r) => a + r.recallAt5, 0) / Math.max(n, 1);
  const mrr = rows.reduce((a, r) => a + r.mrr, 0) / Math.max(n, 1);
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const bytes = rows.map((r) => r.resultBytes);
  return {
    n,
    recallAt5: recall,
    mrr,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    meanBytes: bytes.length ? Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length) : 0,
  };
}

function table(headers, rows) {
  const out = [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`];
  for (const r of rows) out.push(`| ${r.join(" | ")} |`);
  return out.join("\n");
}

const lines = ["# Memory retrieval eval results", "", `Generated by run.mjs. No model calls. Variants: ${VARIANTS.join(", ")}.`, ""];

lines.push("## Overall, per variant");
lines.push(
  table(
    ["Variant", "N", "recall@5", "MRR", "p50 ms", "p95 ms", "Mean result bytes"],
    VARIANTS.map((v) => {
      const rows = perQueryAll.filter((r) => r.variant === v && r.type !== "timeline");
      const a = agg(rows);
      return [v, a.n, a.recallAt5.toFixed(3), a.mrr.toFixed(3), a.p50.toFixed(2), a.p95.toFixed(2), a.meanBytes];
    }),
  ),
);
lines.push("");

lines.push("## Per type, per variant");
const types = [...new Set(perQueryAll.filter((r) => r.type !== "timeline").map((r) => r.type))];
lines.push(
  table(
    ["Variant", "Type", "N", "recall@5", "MRR"],
    VARIANTS.flatMap((v) =>
      types.map((t) => {
        const rows = perQueryAll.filter((r) => r.variant === v && r.type === t);
        const a = agg(rows);
        return [v, t, a.n, a.recallAt5.toFixed(3), a.mrr.toFixed(3)];
      }),
    ),
  ),
);
lines.push("");

lines.push("## A/B halves, per variant");
{
  const abRows = [];
  for (const v of VARIANTS) {
    for (const h of ["A", "B"]) {
      const rows = perQueryAll.filter((r) => r.variant === v && r.half === h && r.type !== "timeline");
      const a = agg(rows);
      abRows.push([v, h, a.n, a.recallAt5.toFixed(3), a.mrr.toFixed(3)]);
    }
  }
  lines.push(table(["Variant", "Half", "N", "recall@5", "MRR"], abRows));
}
lines.push("");

lines.push("## Timeline: order correctness and paging completeness");
lines.push(
  table(
    ["Variant", "N", "Order-correct", "Paging-complete"],
    VARIANTS.map((v) => {
      const rows = timelineChecks.filter((r) => r.variant === v);
      const orderOk = rows.filter((r) => r.orderOk).length;
      const pagingOk = rows.filter((r) => r.pagingOk).length;
      return [v, rows.length, `${orderOk}/${rows.length}`, `${pagingOk}/${rows.length}`];
    }),
  ),
);
lines.push("");

lines.push("## Decision tag: D3 vs v1shape (precision/recall against *.decisions.json)");
lines.push(
  table(
    ["Project", "Rule", "Precision", "Recall", "False positives"],
    Object.entries(decisionAgg).flatMap(([project, d]) => [
      [project, "D3 (structural)", d.d3.precision.toFixed(3), d.d3.recall.toFixed(3), d.d3.falsePositives],
      [project, "v1shape (any-clause)", d.v1shape.precision.toFixed(3), d.v1shape.recall.toFixed(3), d.v1shape.falsePositives],
    ]),
  ),
);
lines.push("");

fs.writeFileSync(OUT, lines.join("\n") + "\n");

// ---- Smoke-friendly stdout summary ----
const r2Rows = perQueryAll.filter((r) => r.variant === "R2" && r.type !== "timeline");
const r2 = agg(r2Rows);
const r2Timeline = timelineChecks.filter((r) => r.variant === "R2");
const timelineOk = r2Timeline.every((r) => r.orderOk && r.pagingOk);
console.log(
  `smoke: projects=${queryFiles.length} queries=${perQueryAll.length / VARIANTS.length} variants=${VARIANTS.join(",")} R2.recallAt5=${r2.recallAt5.toFixed(3)} R2.mrr=${r2.mrr.toFixed(3)} R2.timelineOk=${timelineOk} out=${OUT}`,
);
