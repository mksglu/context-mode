// R6 — M2 candidate O1 (TECH-SPEC §9, DECISIONS-r7 O1): R2 with a lower
// weight on the session list's RRF share for `toolerr` rows. Everything
// else is R2: BM25 per scope (session, worktree, project), RRF k=60,
// current session first, then RRF desc, then seq asc.
// `search` uses weight 0.5; searchW0 / searchW25 are the sweep points.
import { ftsQuery, timelineQuery } from "../lib/db.mjs";
import { RRF_K } from "./R2.mjs";

export const TOOLERR_SESSION_WEIGHT = 0.5;

export function rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq = Infinity, limit = 5, kindFilter, k = RRF_K, toolerrSessionWeight = TOOLERR_SESSION_WEIGHT }) {
  const perScopeLimit = Math.max(limit * 3, 20);
  const scopes = ["session", "worktree", "project"];
  const scores = new Map(); // seq -> { row, score }
  for (const scope of scopes) {
    const list = ftsQuery(db, { query, scope, sessionId, worktree, visibleBeforeSeq, limit: perScopeLimit, kindFilter });
    list.forEach((row, i) => {
      const w = scope === "session" && row.kind === "toolerr" ? toolerrSessionWeight : 1;
      const add = w / (k + i + 1);
      const prev = scores.get(row.seq);
      if (prev) prev.score += add;
      else scores.set(row.seq, { row, score: add });
    });
  }
  const fused = [...scores.values()];
  fused.sort((a, b) => {
    const aCur = a.row.session_id === sessionId ? 1 : 0;
    const bCur = b.row.session_id === sessionId ? 1 : 0;
    if (aCur !== bCur) return bCur - aCur;
    if (b.score !== a.score) return b.score - a.score;
    return a.row.seq - b.row.seq;
  });
  return fused.map((f) => ({ ...f.row, score: f.score }));
}

function searchWithWeight(db, opts, toolerrSessionWeight) {
  const { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity, source } = opts;
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  const kindFilter = source === "decision" ? "decision" : undefined;
  return rankRelevance(db, { query, sessionId, worktree, visibleBeforeSeq, limit, kindFilter, toolerrSessionWeight })
    .slice(0, limit)
    .map((r) => ({ seq: r.seq }));
}

export function searchW0(db, opts) {
  return searchWithWeight(db, opts, 0);
}
export function searchW25(db, opts) {
  return searchWithWeight(db, opts, 0.25);
}
export function search(db, opts) {
  return searchWithWeight(db, opts, TOOLERR_SESSION_WEIGHT);
}
