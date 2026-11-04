// R2 — BM25 per scope (session, worktree, project), fused with RRF k=60.
// Order: current session first (#895), then RRF desc, then seq asc
// (DECISIONS-r6 D4).
import { ftsQuery, timelineQuery } from "../lib/db.mjs";
import { rrfFuse } from "../lib/rank.mjs";

export const RRF_K = 60;

export function rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq = Infinity, limit = 5, kindFilter, k = RRF_K }) {
  const perScopeLimit = Math.max(limit * 3, 20);
  const lists = ["session", "worktree", "project"].map((scope) =>
    ftsQuery(db, { query, scope, sessionId, worktree, visibleBeforeSeq, limit: perScopeLimit, kindFilter }),
  );
  const fused = rrfFuse(lists, k);
  fused.sort((a, b) => {
    const aCur = a.row.session_id === sessionId ? 1 : 0;
    const bCur = b.row.session_id === sessionId ? 1 : 0;
    if (aCur !== bCur) return bCur - aCur;
    if (b.score !== a.score) return b.score - a.score;
    return a.row.seq - b.row.seq;
  });
  return fused.map((f) => ({ ...f.row, score: f.score }));
}

export function search(db, { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity, source }) {
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  const kindFilter = source === "decision" ? "decision" : undefined;
  return rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq, limit, kindFilter }).slice(0, limit).map((r) => ({ seq: r.seq }));
}
