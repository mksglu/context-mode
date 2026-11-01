// R7 — M2 candidate O2 (TECH-SPEC §9, DECISIONS-r7 O2): each `edit` row
// also stores the prompt text of its own turn (same session, same turn),
// so a later topic prompt can match an old edit row. Ranking is R2
// unchanged (BM25 per scope + RRF k=60, current session first).
// The prompt of a turn always has a lower seq than the turn's edits, so
// no row sees text from after its own seq.
import { buildDb, timelineQuery } from "../lib/db.mjs";
import { rankRelevance } from "./R2.mjs";

const augmented = new WeakMap(); // source db -> db with prompt text on edit rows

function withPromptOnEdits(db) {
  const hit = augmented.get(db);
  if (hit) return hit;
  const rows = db.prepare("SELECT * FROM events ORDER BY seq").all();
  const promptOf = new Map(); // `${session}\u0000${turn}` -> prompt body
  for (const r of rows) {
    if (r.kind !== "prompt") continue;
    const key = `${r.session_id}\u0000${r.turn}`;
    promptOf.set(key, promptOf.has(key) ? `${promptOf.get(key)} ${r.body ?? ""}` : (r.body ?? ""));
  }
  const out = rows.map((r) => {
    const p = r.kind === "edit" ? promptOf.get(`${r.session_id}\u0000${r.turn}`) : undefined;
    return {
      ...r,
      ok: r.ok === null ? null : r.ok === 1,
      body: p ? `${r.body ?? ""} ${p}` : r.body,
    };
  });
  const next = buildDb({ rows: out });
  augmented.set(db, next);
  return next;
}

export function search(db, { query, sessionId, worktree, sort = "relevance", after = 0, limit = 5, visibleBeforeSeq = Infinity, source }) {
  if (sort === "timeline") {
    return timelineQuery(db, { scope: "worktree", sessionId, worktree, after, visibleBeforeSeq, limit }).map((r) => ({ seq: r.seq }));
  }
  const kindFilter = source === "decision" ? "decision" : undefined;
  return rankRelevance(withPromptOnEdits(db), { query, sessionId, worktree, visibleBeforeSeq, limit, kindFilter })
    .slice(0, limit)
    .map((r) => ({ seq: r.seq }));
}
