// lib/rank.mjs — shared fusion/diversity helpers used by R2-R5.
// RRF: Cormack et al., SIGIR '09, k = 60 (DECISIONS-r6 D4).

/** Reciprocal Rank Fusion over several rank-ordered (best-first) lists. */
export function rrfFuse(lists, k = 60) {
  const scores = new Map(); // seq -> { row, score }
  for (const list of lists) {
    list.forEach((row, i) => {
      const rank = i + 1;
      const prev = scores.get(row.seq);
      const add = 1 / (k + rank);
      if (prev) prev.score += add;
      else scores.set(row.seq, { row, score: add });
    });
  }
  return [...scores.values()];
}

function tokenSet(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * MMR re-rank: lambda * relevance - (1-lambda) * max-sim-to-selected,
 * similarity = token Jaccard over each row's body/key/path text.
 */
export function mmrRerank(candidates, textOf, lambda = 0.7, limit = candidates.length) {
  const pool = candidates.map((c) => ({ c, tokens: tokenSet(textOf(c)) }));
  const selected = [];
  while (pool.length && selected.length < limit) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const rel = pool[i].c.score ?? 0;
      let maxSim = 0;
      for (const s of selected) maxSim = Math.max(maxSim, jaccard(pool[i].tokens, s.tokens));
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    selected.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }
  return selected.map((s) => s.c);
}
