// R5 — R2 sensitivity sweep on the RRF constant k: k=20 and k=100.
// Exports two named functions for the sweep; `search` defaults to k=60
// (same as R2) so R5 behaves like every other variant under run.mjs.
import { timelineQuery } from "../lib/db.mjs";
import { rankRelevance } from "./R2.mjs";

function searchWithK(db, opts, k) {
  const { sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity, worktree, sessionId, source, query } = opts;
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  const kindFilter = source === "decision" ? "decision" : undefined;
  return rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq, limit, kindFilter, k })
    .slice(0, limit)
    .map((r) => ({ seq: r.seq }));
}

export function searchK20(db, opts) {
  return searchWithK(db, opts, 20);
}
export function searchK100(db, opts) {
  return searchWithK(db, opts, 100);
}
export function search(db, opts) {
  return searchWithK(db, opts, 60);
}
