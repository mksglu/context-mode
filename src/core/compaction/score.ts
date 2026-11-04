// ADR-0009 §3, impl/06 §2, DECISIONS-r6 D1, DECISIONS-r9 M6/M7. Integers only:
// score = Math.round(WEIGHT[w] * DECAY_X1000[min(age, 127)] * bonus / DECAY_SCALE), bonus = 1 + floor(log2(repeat)).
import { DECAY_SCALE, DECAY_X1000, WEIGHT } from "../contracts/constants.ts";
import type { Candidate, CandidateSection } from "../contracts/types.ts";

export type WeightKey = keyof typeof WEIGHT;

export interface ScoreInput {
  section: WeightKey; // the weight row: toolerr, decision, prompt, edit, index (cost has none; decision since DECISIONS-r11)
  currentTurn: number;
  itemTurn: number;
  repeatCount: number;
}

export function scoreCandidate(input: ScoreInput): number {
  if (!Object.hasOwn(WEIGHT, input.section)) {
    throw new Error(`compaction: "${String(input.section)}" has no weight; only toolerr, decision, prompt, edit and index rows are scored (ADR-0009 §3, DECISIONS-r11).`);
  }
  const age = Math.max(0, input.currentTurn - input.itemTurn); // impl/06 §2 step 2: a negative age clamps to 0
  const decay = DECAY_X1000[Math.min(age, DECAY_X1000.length - 1)] as number; // DECISIONS-r9 M6
  let bonus = 1; // 1 + floor(log2(repeatCount)), by halving: integer only
  for (let n = Math.max(1, input.repeatCount); n > 1; n >>= 1) bonus += 1;
  return Math.round((WEIGHT[input.section] * decay * bonus) / DECAY_SCALE); // DECISIONS-r9 M7: one round at the end
}

/** impl/06 §2 step 1: section -> weight row. */
function weightKey(section: CandidateSection): WeightKey {
  switch (section) {
    case "last_request":
    case "earlier_requests":
      return "prompt";
    case "open_errors":
      return "toolerr";
    case "changed_files":
      return "edit";
    case "decisions":
      return "decision";
    case "indexed_sources":
      return "index";
  }
}

/** impl/06 §2 step 8: same order, score attached. Pinning is a selection rule (render.ts), not a score. */
export function scoreCandidates<T extends Candidate>(candidates: readonly T[], currentTurn: number): Array<T & { score: number }> {
  return candidates.map((c) => ({
    ...c,
    score: scoreCandidate({ section: weightKey(c.section), currentTurn, itemTurn: c.turn, repeatCount: c.repeatCount }),
  }));
}
