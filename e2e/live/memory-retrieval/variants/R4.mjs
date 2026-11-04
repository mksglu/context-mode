// R4 — R2 + source:"decision" filter applied to decision-type queries
// (caller passes { type: "decision" } or source: "decision" explicitly).
import { timelineQuery } from "../lib/db.mjs";
import { rankRelevance } from "./R2.mjs";

export function search(db, { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity, source, type }) {
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  const kindFilter = source === "decision" || type === "decision" ? "decision" : undefined;
  const ranked = rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq, limit, kindFilter });
  return ranked.slice(0, limit).map((r) => ({ seq: r.seq }));
}
