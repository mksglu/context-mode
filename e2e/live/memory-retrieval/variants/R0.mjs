// R0 — v1 behaviour.
// Read: src/search/unified.ts + src/store.ts (cm-main).
// - sort:"relevance" (default): ContentStore only -> BM25 ranked WITHIN
//   the current session only (unified.ts calls store.searchWithFallback()
//   with no cross-session join unless a SessionDB is also queried, which
//   only happens in timeline mode).
// - sort:"timeline": merges ContentStore + SessionDB + auto-memory, i.e.
//   every source across the whole project, oldest first (unified.ts
//   `results.sort by timestamp asc`, no scope restriction applied to
//   non-ContentStore sources in v1).
import { ftsQuery, timelineQuery } from "../lib/db.mjs";

export function search(db, { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity }) {
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "project", worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  return ftsQuery(db, { query, scope: "session", sessionId, worktree, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
}
