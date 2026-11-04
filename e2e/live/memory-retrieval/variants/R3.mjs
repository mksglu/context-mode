// R3 — R2 + MMR (lambda = 0.7) on token Jaccard, to diversify the top hits.
import { timelineQuery, rowBody } from "../lib/db.mjs";
import { rankRelevance } from "./R2.mjs";
import { mmrRerank } from "../lib/rank.mjs";

export function search(db, { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity, source }) {
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  const kindFilter = source === "decision" ? "decision" : undefined;
  const candidates = rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq, limit: Math.max(limit * 3, 20), kindFilter });
  const diversified = mmrRerank(candidates, (c) => rowBody(db, c.seq), 0.7, limit);
  return diversified.map((r) => ({ seq: r.seq }));
}
