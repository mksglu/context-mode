// DECISIONS-r11 (B) turn-boundary recall ("push, not pull"). After a compaction a model does not call a
// tool for state it does not know it lost (0 of 50 clean T-CMP sessions), so the hook pushes the rows the
// next prompt asks about. Pure over JournalRow[]: BM25 (rankTexts, the store's tokenizer) of each row's
// text against the prompt; whole rows only, never cut; nothing when the top score is under RECALL_MIN_SCORE.
import { MMR_REDUNDANCY_WEIGHT, MMR_RELEVANCE_WEIGHT, RECALL_BUDGET_BYTES, RECALL_CLOSE_TAG, RECALL_MIN_SCORE, RECALL_OPEN_TAG } from "../contracts/constants.ts";
import type { JournalRow, UnitCandidate } from "../contracts/types.ts";
import { rankTexts } from "../store/fts.ts";
import { wordTokens } from "../store/words.ts";

export interface Recall {
  text: string; // "" = inject nothing
  seqs: number[]; // rows injected, seq ascending
  units?: string[]; // r3-ledger: line units injected, "sourceId:ord" (absent when none)
}

export function unitKey(u: UnitCandidate): string {
  return u.sourceId + ":" + u.ord;
}

/** One whole unit: "@label line N:" then the unit (ancestors + line), never cut. */
export function unitLine(u: UnitCandidate): string {
  return "@" + u.label + " line " + (u.ord + 1) + ":\n" + u.body;
}

function wordsOf(s: string): Set<string> {
  return new Set(wordTokens(s.toLowerCase()));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return a.size + b.size - n === 0 ? 0 : n / (a.size + b.size - n);
}

/**
 * MMR (lambda 0.7) over ranked units: each step takes the unit with the best
 * 0.7 * score/top - 0.3 * max word overlap with the units already taken, whole units only, while it fits.
 */
export function pickUnits(cands: readonly UnitCandidate[], seen: ReadonlySet<string>, budget: number): UnitCandidate[] {
  const pool = cands.filter((u) => !seen.has(unitKey(u)) && u.score >= RECALL_MIN_SCORE);
  if (pool.length === 0) return [];
  const top = Math.max(...pool.map((u) => u.score));
  const words = pool.map((u) => wordsOf(u.body));
  const taken: number[] = [];
  const left = new Set(pool.map((_, i) => i));
  let used = 0;
  while (left.size > 0) {
    let best = -1;
    let bestVal = -Infinity;
    for (const i of left) {
      let sim = 0;
      for (const j of taken) sim = Math.max(sim, overlap(words[i] as Set<string>, words[j] as Set<string>));
      const val = MMR_RELEVANCE_WEIGHT * ((pool[i] as UnitCandidate).score / top) - MMR_REDUNDANCY_WEIGHT * sim;
      if (val > bestVal) { bestVal = val; best = i; }
    }
    left.delete(best);
    const cost = bytesOf(unitLine(pool[best] as UnitCandidate)) + 1;
    if (used + cost > budget) continue; // skip, a smaller unit may still fit
    used += cost;
    taken.push(best);
  }
  return taken.map((i) => pool[i] as UnitCandidate);
}

const NONE: Recall = { text: "", seqs: [] };

function bytesOf(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** The row's searchable text: key, path and body, as stored. */
function textOf(r: JournalRow): string {
  return [r.key ?? "", r.path ?? "", r.body].filter((t) => t !== "").join("\n");
}

/** One whole row: "#seq kind tool: text". The text is never cut (a row that does not fit is skipped). */
export function recallLine(r: JournalRow): string {
  return "#" + r.seq + " " + r.kind + (r.tool === null ? "" : " " + r.tool) + ": " + textOf(r);
}

/**
 * rows: candidates (any order); prompt: this turn's text; seen: seqs already injected in this session.
 * The current prompt's own row (kind "prompt", same body) is never a candidate.
 */
export function pickRecall(rows: readonly JournalRow[], prompt: string, seen: ReadonlySet<number>, units: readonly UnitCandidate[] = [], seenUnits: ReadonlySet<string> = new Set()): Recall {
  if (prompt.trim() === "") return NONE;
  const pool = rows.filter((r) => !seen.has(r.seq) && r.kind !== "cost" && !(r.kind === "prompt" && r.body === prompt) && textOf(r) !== "");
  const scores = pool.length === 0 ? [] : rankTexts(pool.map(textOf), prompt, "any");
  const order = pool
    .map((r, i) => ({ r, score: scores[i] as number }))
    .filter((x) => x.score >= RECALL_MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.r.seq - a.r.seq);

  let used = bytesOf(RECALL_OPEN_TAG) + 1 + bytesOf(RECALL_CLOSE_TAG);
  const taken: JournalRow[] = [];
  for (const { r } of order) {
    const cost = bytesOf(recallLine(r)) + 1;
    if (used + cost > RECALL_BUDGET_BYTES) continue; // skip, a smaller row may still fit
    used += cost;
    taken.push(r);
  }
  // r3-ledger: the rest of the budget goes to line units of large outputs (a row over budget is skipped above).
  const picked = pickUnits(units, seenUnits, RECALL_BUDGET_BYTES - used);
  if (taken.length === 0 && picked.length === 0) return NONE;
  taken.sort((a, b) => a.seq - b.seq);
  const lines = [...taken.map(recallLine), ...picked.map(unitLine)];
  return { text: [RECALL_OPEN_TAG, ...lines, RECALL_CLOSE_TAG].join("\n"), seqs: taken.map((r) => r.seq), ...(picked.length > 0 ? { units: picked.map(unitKey) } : {}) };
}
