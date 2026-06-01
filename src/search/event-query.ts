/**
 * Shared tokenizer and SQL builder for session_events LIKE search.
 *
 * Replaces whole-phrase LIKE with multi-term scored matching so
 * natural-language queries surface session memory instead of returning
 * nothing (#737 fix: session_events matcher tokenizes multi-term queries).
 *
 * Design constraints (oracle + reviewer):
 * - Do NOT lowercase-fold tokens or wrap data in lower() — SQLite LIKE is
 *   ASCII case-insensitive by default; case-folding kills any future index.
 * - Preserve LIKE wildcard chars `%` and `_` so literal queries like
 *   `100%` / `_task` keep working.
 * - Keep len>=2 tokens (oracle: "pi"/"ai"/"db"/"js"/"ts" are real tokens);
 *   weight 2-char tokens low so they cannot dominate results.
 * - FTS5 on session_events is ruled out (read-only fan-out constraint #737).
 *   This LIKE tokenizer is the pragmatic stopgap; FTS5 is a separate follow-up.
 */

// ─────────────────────────────────────────────────────────
// Stopwords
// ─────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "how", "did", "we", "the", "to", "of", "is", "it", "and", "or",
  "what", "was", "that", "this", "with", "for", "you", "our", "are",
  "be", "in", "on", "at", "as", "by", "if", "do", "my", "me", "so",
  "no", "an", "up", "a", "i",
]);

const MAX_TERMS = 8;

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Tokenize a natural-language query into search terms.
 *
 * - Split on whitespace.
 * - Trim leading/trailing punctuation EXCEPT: `%` `_` `/` `-` `@` `.`
 *   (LIKE wildcards and path/package separators must be preserved).
 * - Drop English stopwords (exact lowercase match).
 * - Keep tokens with length >= 2 after trim.
 * - Dedupe case-insensitively, preserve first-seen order.
 * - Cap at 8 tokens.
 * - Return [] for empty / all-stopword queries.
 */
export function tokenizeSearchQuery(query: string): string[] {
  if (!query.trim()) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of query.split(/\s+/)) {
    if (!raw) continue;
    // Strip leading/trailing chars outside [A-Za-z0-9%_/@.\-]
    // Keeps internal special chars intact (e.g. narumitw/pi-statusline stays whole).
    // Then strip trailing dots separately: internal dots (v1.2.3, foo.ts) are fine
    // but a trailing dot is almost always sentence punctuation, not a path component.
    const token = raw
      .replace(/^[^A-Za-z0-9%_/@.\-]+|[^A-Za-z0-9%_/@.\-]+$/g, "")
      .replace(/\.+$/, "");
    if (token.length < 2) continue;
    if (STOPWORDS.has(token.toLowerCase())) continue;
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(token);
    if (result.length >= MAX_TERMS) break;
  }

  return result;
}

/**
 * Escape SQLite LIKE metacharacters in a search term.
 * Backslash must be replaced first so subsequent escapes are not re-escaped.
 * Does NOT wrap in %...% — callers do that per usage.
 */
export function escapeLike(term: string): string {
  return term
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Compute a distinctiveness weight for a term used in session_events scoring.
 *
 * Distinctive tokens (package names with / - . @ _, terms with digits)
 * outrank generic words; bare 2-char tokens get a low weight so `pi`
 * cannot dominate over specific package identifiers.
 *
 * Formula: (contains /@._\- or digit ? 4 : 0) + min(len, 12)
 *
 * Examples:
 *   narumitw/pi-statusline → 4 + 12 = 16
 *   customize              → 0 + 9  =  9
 *   pi                     → 0 + 2  =  2
 */
export function tokenWeight(term: string): number {
  const bonus = /[\/@._\-]/.test(term) || /\d/.test(term) ? 4 : 0;
  return bonus + Math.min(term.length, 12);
}

/**
 * High-signal session_event categories: the human's own messages/questions
 * and synthesized decisions/plans. These carry intent ("what we asked / chose")
 * and should outrank mechanical tool_call/file_read/data bulk on equal term
 * matches. Boost-only scheme (eval-driven, #737): Tier-1 ×CATEGORY_BOOST,
 * everything else ×1 — NO penalty, so file/data recall ("which file did we
 * edit?") is never suppressed.
 */
export const HIGH_SIGNAL_CATEGORIES = ["role", "user-prompt", "decision", "plan"] as const;
export const CATEGORY_BOOST = 3;

/**
 * SQL fragment: multiplies the term-weight sum by CATEGORY_BOOST when the row's
 * category is high-signal, else 1. References the `category` column directly
 * (no bind param); both searchEvents and readonlySearchEvents SELECT it.
 */
export function categoryBoostSql(): string {
  const list = HIGH_SIGNAL_CATEGORIES.map((c) => `'${c}'`).join(", ");
  return `CASE WHEN COALESCE(category,'') IN (${list}) THEN ${CATEGORY_BOOST} ELSE 1 END`;
}

// ─────────────────────────────────────────────────────────
// SQL clause builder
// ─────────────────────────────────────────────────────────

export interface EventMatchResult {
  /** WHERE clause fragment (no AND/OR prefix). */
  matchClause: string;
  /** Positional params bound for matchClause. */
  matchParams: string[];
  /**
   * Score expression for ORDER BY (higher = better match).
   * Weighted sum of per-term booleans + 100× exact-phrase boost.
   * Always `1` in fallback (hasTerms=false) mode.
   */
  scoreExpr: string;
  /** Positional params bound for scoreExpr (only when used in ORDER BY). */
  scoreParams: string[];
  /**
   * true when tokenization produced terms; false when falling back to
   * whole-phrase LIKE (empty/stopword-only query).
   */
  hasTerms: boolean;
}

/**
 * Build a WHERE match clause and scoring expression for session_events LIKE search.
 *
 * When terms are present (hasTerms=true):
 *   - matchClause: OR across all terms (any single term qualifies a row).
 *   - scoreExpr: weighted sum of per-term boolean hits + 100× exact-phrase
 *     boost so a row matching the full original phrase beats any token combo.
 *     Each term contributes 0 or 1 (not frequency-counted) to avoid
 *     double-counting a term appearing multiple times in data.
 *
 * When no terms remain after stopword filtering (hasTerms=false):
 *   - falls back to whole-phrase LIKE, preserving exact-substring / literal-
 *     wildcard queries (`100%`, `_task`, UUIDs, error strings, etc.).
 *
 * Callers MUST check `query.trim() === ""` before calling and return [] to
 * avoid degenerate `LIKE '%%'` matching everything.
 */
export function buildEventMatch(query: string): EventMatchResult {
  const terms = tokenizeSearchQuery(query);

  // ── Whole-phrase fallback ──────────────────────────────────────────────
  // NOTE: data/category are COALESCE'd to '' so a NULL column never poisons
  // SQLite's 3-valued boolean logic (0 OR NULL = NULL). The live schema pins
  // both NOT NULL, but global fan-out opens 160+ arbitrary external/legacy
  // DBs read-only, so this is defensive (agy review hardening). No-op when
  // the columns are non-null.
  if (terms.length === 0) {
    const escaped = escapeLike(query);
    return {
      matchClause: `(COALESCE(data,'') LIKE '%'||?||'%' ESCAPE '\\' OR COALESCE(category,'') LIKE '%'||?||'%' ESCAPE '\\')`,
      matchParams: [escaped, escaped],
      scoreExpr: `1`,
      scoreParams: [],
      hasTerms: false,
    };
  }

  // ── Multi-term OR match (any term qualifies) ───────────────────────────
  // matchClause params: [term0, term0, term1, term1, ...]  (data, category per term)
  const matchClause =
    "(" +
    terms
      .map(() => `COALESCE(data,'') LIKE '%'||?||'%' ESCAPE '\\' OR COALESCE(category,'') LIKE '%'||?||'%' ESCAPE '\\'`)
      .join(" OR ") +
    ")";
  const matchParams = terms.flatMap((t) => [escapeLike(t), escapeLike(t)]);

  // ── Weighted scoring (relevance ORDER BY) ─────────────────────────────
  // scoreExpr params: [term0, term0, term1, term1, ..., phraseEscaped]
  // Each term: weight * (data hit OR category hit) — boolean 0/1 avoids
  // double-counting a term that appears N times in the same event.
  const scoreParts = terms.map(
    (t) =>
      `(${tokenWeight(t)} * (COALESCE(data,'') LIKE '%'||?||'%' ESCAPE '\\' OR COALESCE(category,'') LIKE '%'||?||'%' ESCAPE '\\'))`,
  );
  // Exact-phrase boost: 100 points if the whole query string appears in data.
  // Category boost (#737, boost-only): multiply the TERM-WEIGHT SUM (not the
  // phrase boost) by ×CATEGORY_BOOST for high-signal categories, so the human's
  // role/decision events outrank tool_call/data noise on comparable matches.
  // An exact-phrase hit still scores >=100 regardless of category.
  const phraseEscaped = escapeLike(query);
  const scoreExpr =
    `(${categoryBoostSql()}) * (` + scoreParts.join(" + ") + `)` +
    ` + (100 * (COALESCE(data,'') LIKE '%'||?||'%' ESCAPE '\\'))`;
  const scoreParams = [
    ...terms.flatMap((t) => [escapeLike(t), escapeLike(t)]),
    phraseEscaped,
  ];

  return { matchClause, matchParams, scoreExpr, scoreParams, hasTerms: true };
}
