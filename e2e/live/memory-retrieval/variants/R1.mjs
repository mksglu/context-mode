// R1 — BM25 only, scope "worktree" (whole project's current worktree),
// no fusion. Baseline against R2's per-scope RRF fuse.
import { ftsQuery, timelineQuery } from "../lib/db.mjs";

export function search(db, { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity }) {
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  return ftsQuery(db, { query, scope: "worktree", sessionId, worktree, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
}
