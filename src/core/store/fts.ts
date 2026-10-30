// impl/02 §9, impl/00 §4 (ftsInsert/ftsQuery signatures), impl/05 §0 + ctx_search steps 5-8,
// DECISIONS-r9 M19 (order), M20 (RRF_K), M21 (SNIPPET_MAX_BYTES), V24 (tokenizer),
// ADR-0009 §8.3 (RRF for scope "project"), DEVIATIONS D-M1-8, D-M1-9, D-M1-T8-1..4.
// M4: ftsListSource (empty-query listing of one source, ADR-0009 §8.2); the timeline skips the
// reserved "decision" chunk sources, whose rows it already reads from the journal (D-M4-arch-5).
// M2: ftsInsert returns the new id (D-M2-1); ftsQueryTimeline (ADR-0009 §8.1, DECISIONS-r9 M14-M18,
// D-M2-3, D-M2-T3-1); rankTexts, the in-memory BM25 form selectChunksInMemory calls (impl/05 §5 step 2).
import { CtxError } from "../contracts/errors.ts";
import { DECISION_SOURCE, INDEX_WRITE_CHUNK, RRF_K, SNIPPET_MAX_BYTES, SOURCE_HANDLE_MAX_DIGITS } from "../contracts/constants.ts";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { Chunk, DbHandle, Hit, ProjectContext, SearchScope, SourceRow, TimelineRow, UnitCandidate } from "../contracts/types.ts";
import { withWrite } from "./db.ts";
import { FTS_TOKENIZE } from "./schema.ts";
import { buildSnippet, snippetTerms } from "./snippet.ts";
import { blankTokens } from "./words.ts";

// The DB owns sources.id (AUTOINCREMENT, D-M1-4, D-M2-1).
const INSERT_SOURCE = `
INSERT INTO sources(session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts)
VALUES (:session_id, :worktree, :agent, :kind, :label, :bytes_total, :chunk_count, :created_ts, :created_at, :created_ts)
RETURNING id`;

const INSERT_CHUNK = `
INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body, title) VALUES (?, ?, ?, ?, ?, ?, ?)`;

// One match set for every scope (PORTER_MATCH). Candidates = every MATCH row inside the scope and
// source filter; both RRF rank lists run over that full set before LIMIT/OFFSET (ADR-0009 §8.3).
// Order (M19 + #895, D-M2-R6-1): current session first, then the current worktree, then score desc,
// newest source first, ord asc. The worktree tier only changes the order for scope "project".
// Ranking reads only the narrow columns; the chunk body is fetched by rowid for the page rows alone,
// so a broad query never moves every matched body through the window sorts (review-M1 perf carry).
// D-SEARCH-3: BM25 weight of the title column against body 1.0. Measured 1/2/5/10 on the held-out set: 1.0
// keeps every whole fence of the 7 bench scenarios; 2-10 lose one (v1 weighted headings 5x).
const TITLE_WEIGHT = 1.0;

// D-SEARCH-4: the porter list, every match in final order (rid only; bodies load for one page).
// D-HQ-PERF-1: only scope "project" reads rank_a/rank_b (RRF). Scope session/worktree score by -bm, so
// their statement skips the two window sorts over every match (same rows, same order, about 35% less SQL time).
// D-HTML-READABLE-1: the raw body of an HTML page is stored as "<label> (raw)"; default search (no `source`) skips it.
export const RAW_LABEL_SUFFIX = " (raw)";
const NOT_RAW = `AND (:source IS NOT NULL OR substr(s.label, -${RAW_LABEL_SUFFIX.length}) <> '${RAW_LABEL_SUFFIX}')`;
const PORTER_MATCH = `
  SELECT chunks.rowid AS rid, chunks.source_id AS source_id, chunks.session_id AS session_id,
         chunks.worktree AS worktree, chunks.ord AS ord, s.created_ts AS created_ts,
         bm25(chunks, 0, 0, 0, 0, 0, 1.0, ${TITLE_WEIGHT}) AS bm,
         (chunks.rowid IN (SELECT rowid FROM chunks WHERE chunks MATCH :all)) AS full
  FROM chunks JOIN sources s ON s.id = chunks.source_id
  WHERE chunks MATCH :match
    AND (:scope <> 'session' OR chunks.session_id = :session_id)
    AND (:scope <> 'worktree' OR chunks.worktree = :worktree)
    AND (:source IS NULL OR s.label = :source)
    ${NOT_RAW}`;
const PORTER_ORDER = `
ORDER BY (session_id = :session_id) DESC, (worktree = :worktree) DESC, full DESC, score DESC, source_id DESC, ord ASC`;
const PORTER_RANK_PROJECT = `
WITH m AS (${PORTER_MATCH}
), r AS (
  SELECT *,
         ROW_NUMBER() OVER (ORDER BY full DESC, bm ASC, source_id DESC, ord ASC) AS rank_a,
         ROW_NUMBER() OVER (ORDER BY created_ts DESC, source_id DESC, ord ASC) AS rank_b
  FROM m
)
SELECT rid, source_id, session_id, worktree, ord, full, 1.0 / (:k + rank_a) + 1.0 / (:k + rank_b) AS score
FROM r${PORTER_ORDER}`;
const PORTER_RANK_BM25 = `
WITH m AS (${PORTER_MATCH}
)
SELECT rid, source_id, session_id, worktree, ord, full, -bm AS score
FROM m${PORTER_ORDER}`;

export function porterRankSql(scope: SearchScope): string {
  return scope === "project" ? PORTER_RANK_PROJECT : PORTER_RANK_BM25;
}

// D-SEARCH-4: the trigram list (substrings: identifiers, paths, partial words), same filters.
const TRI_RANK = `
SELECT t.rowid AS rid, c.source_id AS source_id, c.session_id AS session_id, c.worktree AS worktree, c.ord AS ord
FROM chunks_tri t JOIN chunks c ON c.rowid = t.rowid JOIN sources s ON s.id = c.source_id
WHERE chunks_tri MATCH :match
  AND (:scope <> 'session' OR c.session_id = :session_id)
  AND (:scope <> 'worktree' OR c.worktree = :worktree)
  AND (:source IS NULL OR s.label = :source)
  ${NOT_RAW}
ORDER BY bm25(chunks_tri, 1.0, ${TITLE_WEIGHT}) ASC, c.source_id DESC, c.ord ASC`;

const PAGE_ROWS = `
SELECT c.rowid AS rid, c.source_id AS source_id, c.ord AS ord, c.body AS body, s.label AS label
FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.rowid IN (SELECT value FROM json_each(:ids))`;

const INSERT_TRI = "INSERT INTO chunks_tri(rowid, body, title) VALUES (?, ?, ?)";
// Contentless FTS5 delete: the row's own indexed text goes back in with the 'delete' command.
const TRI_DELETE = "INSERT INTO chunks_tri(chunks_tri, rowid, body, title) SELECT 'delete', rowid, body, title FROM chunks";

// The source fields a write stores. The id is the DB's own AUTOINCREMENT id; bytes_total and chunk_count come from the chunks.
export type SourceDraft = Pick<SourceRow, "sessionId" | "worktree" | "agent" | "kind" | "label" | "createdAt">;


// impl/02 §9.1, impl/05 step 4, D-M2-1: one sources INSERT + chunk INSERTs, each withWrite holding at
// most INDEX_WRITE_CHUNK bytes of chunk text (ADR-0002 decision 2). The source row rides the first
// batch; its new id is returned.
export function ftsInsert(db: DbHandle, src: Omit<SourceRow, "id">, chunks: Chunk[]): number {
  const id = reserveSource(db, src, chunks);
  insertChunks(db, id, src, chunks);
  return id;
}

/**
 * D-CR3-HANDLE-2: write the source row alone (one small transaction) and return its id, so a caller can name
 * the source by its short id before the chunks are written (the detached F1 path). bytes_total and
 * chunk_count come from `chunks`, as ftsInsert stores them.
 */
export function reserveSource(db: DbHandle, src: SourceDraft, chunks: Chunk[]): number {
  let total = 0;
  for (const c of chunks) total += c.bytes;
  return withWrite(db, (h) => {
    const row = h.raw.prepare(INSERT_SOURCE).get({
      session_id: src.sessionId,
      worktree: src.worktree,
      agent: src.agent,
      kind: src.kind,
      label: src.label,
      bytes_total: total,
      chunk_count: chunks.length,
      created_ts: src.createdAt,
      created_at: new Date(src.createdAt).toISOString(),
    }) as { id: number };
    return Number(row.id);
  });
}

// D-R4-RESERVE-1: the detached write of a reserved source. When the chunk or unit write throws, the reserved
// row and whatever part of it landed are deleted, so no 0-chunk orphan stays in sources; the error is rethrown.
export function finishReserved(db: DbHandle, id: number, src: SourceDraft, chunks: Chunk[], units: ReadonlyArray<{ ord: number; body: string }>): void {
  try {
    insertChunks(db, id, src, chunks);
    insertUnits(db, id, src.sessionId, units);
  } catch (err) {
    withWrite(db, (h) => {
      deleteChunkRows(h.raw, { sourceId: id });
      h.raw.prepare("DELETE FROM sources WHERE id = ?").run(id);
    });
    throw err;
  }
}

/** The chunks of a reserved source, batched at INDEX_WRITE_CHUNK bytes per withWrite (porter + trigram). */
export function insertChunks(db: DbHandle, id: number, src: SourceDraft, chunks: Chunk[]): void {
  const batches: Chunk[][] = [];
  let batch: Chunk[] = [];
  let batchBytes = 0;
  for (const c of chunks) {
    if (batch.length > 0 && batchBytes + c.bytes > INDEX_WRITE_CHUNK) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(c);
    batchBytes += c.bytes;
  }
  if (batch.length > 0) batches.push(batch);
  for (const rows of batches) {
    withWrite(db, (h) => {
      const ins = h.raw.prepare(INSERT_CHUNK);
      const tri = h.raw.prepare(INSERT_TRI);
      for (const c of rows) {
        const title = c.title ?? "";
        const rid = ins.run(id, src.sessionId, src.worktree, src.agent, c.ord, c.text, title).lastInsertRowid;
        tri.run(rid, c.text, title);
      }
    });
  }
}

// The chunks a delete reaches: one source by id, every source with one label, or all of them.
export type ChunkScope = { sourceId: number } | { label: string } | "all";

// The one place chunk text leaves the store: porter rows, trigram rows and line units go together (D-SEARCH-4).
// Source rows stay with the caller. Returns the chunk rows deleted.
export function deleteChunkRows(raw: DatabaseSync, scope: ChunkScope): number {
  if (scope === "all") {
    raw.exec("INSERT INTO chunks_tri(chunks_tri) VALUES ('delete-all')");
    raw.exec("DELETE FROM line_units");
    return Number(raw.prepare("DELETE FROM chunks").run().changes);
  }
  const [where, arg] = "sourceId" in scope
    ? ["source_id = ?", scope.sourceId]
    : ["source_id IN (SELECT id FROM sources WHERE label = ?)", scope.label];
  raw.prepare(TRI_DELETE + " WHERE " + where).run(arg);
  raw.prepare("DELETE FROM line_units WHERE " + where).run(arg);
  return Number(raw.prepare("DELETE FROM chunks WHERE " + where).run(arg).changes);
}

// One source's chunks leave both tables (porter and trigram). Returns the chunk rows deleted.
export function deleteSourceChunks(raw: DatabaseSync, sourceId: number): number {
  return deleteChunkRows(raw, { sourceId });
}

// D-M1-T8-1: each whitespace-separated word becomes one FTS5 string ("" doubles a quote) with a
// prefix star, words joined by implicit AND. FTS5 operators in user text stay plain words.
function toMatch(q: string): string {
  const words: string[] = [];
  let cur = "";
  for (const ch of q) {
    // D-SEARCH-6: NUL ends an FTS5 string ("unterminated string"), so it splits words like whitespace.
    if (ch.trim() === "" || ch === "\u0000") {
      if (cur !== "") words.push(cur);
      cur = "";
    } else {
      cur += ch === '"' ? '""' : ch;
    }
  }
  if (cur !== "") words.push(cur);
  return words.map((w) => `"${w}"*`).join(" ");
}

// D-M7-SV-5: any-word form for ranking only (each distinct word a quoted prefix term, joined by OR).
function toMatchAny(q: string): string {
  const terms = new Set(toMatch(q).split(" ").filter((t) => t !== ""));
  return [...terms].join(" OR ");
}

// D-SEARCH-2: common English words that carry no search signal (v1 src/store.ts STOPWORDS, general part).
// A query made only of stopwords keeps all its words.
const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "by", "is", "be", "it", "as", "do", "i",
  "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "his",
  "how", "its", "may", "who", "did", "get", "got", "let", "she", "too", "will", "with", "this", "that",
  "from", "they", "been", "have", "some", "them", "than", "each", "into", "your", "could", "would",
  "about", "which", "their", "there", "other", "should", "also", "very", "when", "what", "then", "these",
  "those", "being", "does", "both", "while", "where", "here", "were", "much", "any", "my", "me", "we",
]);

// D-SEARCH-2: the quoted prefix terms of a search query, stopwords dropped (all kept if all are stopwords).
function searchTerms(q: string): string[] {
  const all = [...new Set(toMatch(q).split(" ").filter((t) => t !== ""))];
  const kept = all.filter((t) => !STOPWORDS.has(t.slice(1, -2).toLowerCase()));
  return kept.length > 0 ? kept : all;
}


interface QueryRow { source_id: number; label: string; ord: number; body: string; score: number; }
interface RankRow { rid: number; source_id: number; session_id: string; worktree: string; ord: number; full?: number; }
interface PageRow { rid: number; source_id: number; ord: number; body: string; label: string; }

// D-SEARCH-4: the trigram match: every query word (stopwords out) of 3+ characters as one quoted
// substring, plus the whole query when it has more than one word; joined by OR.
function trigramMatch(q: string): string {
  const words = blankTokens(q);
  const kept = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const parts = new Set((kept.length > 0 ? kept : words).filter((w) => [...w].length >= 3));
  const whole = words.join(" ");
  if (words.length > 1 && [...whole].length >= 3) parts.add(whole);
  return [...parts].map((w) => `"${w.replaceAll('"', '""')}"`).join(" OR ");
}

// Levenshtein distance with a cut-off: returns max + 1 when the distance is over max.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Prepared statements of the search path, cached per connection: one prepare per SQL text per db,
// not one per call. The WeakMap drops the cache when the connection object goes.
const STMTS = new WeakMap<DatabaseSync, Map<string, StatementSync>>();
function stmt(raw: DatabaseSync, sql: string): StatementSync {
  let m = STMTS.get(raw);
  if (m === undefined) {
    m = new Map();
    STMTS.set(raw, m);
  }
  let st = m.get(sql);
  if (st === undefined) {
    st = raw.prepare(sql);
    m.set(sql, st);
  }
  return st;
}

// The store tokenizer's terms for q (porter stems), in a private in-memory table.
function queryStems(q: string): string[] {
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (sqlite === undefined) throw new CtxError("NO_SQLITE");
  const mem = new sqlite.DatabaseSync(":memory:");
  try {
    mem.exec(`CREATE VIRTUAL TABLE q USING fts5(body, ${FTS_TOKENIZE}); CREATE VIRTUAL TABLE v USING fts5vocab(q, 'row');`);
    mem.prepare("INSERT INTO q(body) VALUES (?)").run(q);
    return (mem.prepare("SELECT term FROM v").all() as unknown as Array<{ term: string }>).map((r) => r.term);
  } finally {
    mem.close();
  }
}

// D-SEARCH-4: typo correction from the index vocabulary. Each query stem of 5+ characters that is not in
// the index takes the nearest index term (edit distance <= 2; ties: more documents, then term order).
// Returns the corrected quoted terms, or null when no stem changed.
const TYPO_MIN_LEN = 5;
const TYPO_MAX_DIST = 2;
function typoTerms(db: DbHandle, words: string[]): string[] | null {
  const has = stmt(db.raw, "SELECT 1 AS x FROM chunks_vocab WHERE term = ?");
  // D-HQ-PERF-2: chunks_vocab has no index on length(term), so each read walks the whole porter vocabulary.
  // One read covers every missing stem's length window; each stem then keeps the rows of its own window
  // (same candidates, same term order as one read per stem).
  const near = stmt(db.raw, "SELECT term, doc, length(term) AS n FROM chunks_vocab WHERE length(term) BETWEEN ? AND ?");
  const stems = queryStems(words.join(" "));
  const miss = stems.map((stem) => has.get(stem) === undefined && [...stem].length >= TYPO_MIN_LEN);
  if (!miss.includes(true)) return null;
  const lens = stems.filter((_, i) => miss[i]).map((stem) => stem.length);
  const rows = near.all(Math.min(...lens) - TYPO_MAX_DIST, Math.max(...lens) + TYPO_MAX_DIST) as unknown as Array<{ term: string; doc: number; n: number }>;
  let changed = false;
  const out: string[] = [];
  stems.forEach((stem, i) => {
    if (!miss[i]) {
      out.push(stem);
      return;
    }
    let best: { term: string; d: number; doc: number } | null = null;
    for (const r of rows) {
      const n = Number(r.n);
      if (n < stem.length - TYPO_MAX_DIST || n > stem.length + TYPO_MAX_DIST) continue;
      const d = editDistance(stem, r.term, TYPO_MAX_DIST);
      if (d > TYPO_MAX_DIST) continue;
      if (best === null || d < best.d || (d === best.d && (r.doc > best.doc || (r.doc === best.doc && r.term < best.term)))) {
        best = { term: r.term, d, doc: Number(r.doc) };
      }
    }
    if (best !== null) {
      out.push(best.term);
      changed = true;
    }
  });
  return changed ? out.map((t) => `"${t.replaceAll('"', '""')}"*`) : null;
}

// impl/02 §9.2 + impl/05 steps 5, 7, 8 (D-M1-T8-2, D-M1-T8-4). Zero hits -> [], never throws for
// text input.
export function ftsQuery(
  db: DbHandle,
  q: string,
  scope: SearchScope,
  ctx: ProjectContext,
  sessionId: string,
  limit: number,
  offset: number,
  source?: string,
): Hit[] {
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  const filter = { scope, session_id: sessionId, worktree: ctx.worktree, source: source ?? null };
  // D-SEARCH-2: AND first, then OR. The OR form matches; chunks that also match the AND form (every term)
  // rank before partial matches inside each session/worktree tier.
  const rrf = scope === "project" ? { k: RRF_K } : {};
  const porter = (t: string[]): RankRow[] =>
    stmt(db.raw, porterRankSql(scope)).all({ ...filter, match: t.join(" OR "), all: t.join(" "), ...rrf }) as unknown as RankRow[];
  let pList = porter(terms);
  // D-SEARCH-4: no porter hit -> typo correction from the index vocabulary, then the porter pass again.
  if (pList.length === 0) {
    const fixed = typoTerms(db, terms.map((t) => t.slice(1, -2).replaceAll('""', '"')));
    if (fixed !== null) pList = porter(fixed);
  }
  const tm = trigramMatch(q);
  const tList = tm === "" ? [] : (stmt(db.raw, TRI_RANK).all({ ...filter, match: tm }) as unknown as RankRow[]);

  // D-SEARCH-4: Reciprocal Rank Fusion (k = RRF_K) of the porter and trigram lists, inside the
  // session/worktree tiers; AND matches (full) stay first. Ties: better porter rank, newer source, ord.
  const fused = new Map<number, { r: RankRow; s: number; full: number; p: number }>();
  pList.forEach((r, i) => fused.set(Number(r.rid), { r, s: 1 / (RRF_K + i + 1), full: Number(r.full ?? 0), p: i }));
  tList.forEach((r, i) => {
    const e = fused.get(Number(r.rid));
    if (e) e.s += 1 / (RRF_K + i + 1);
    else fused.set(Number(r.rid), { r, s: 1 / (RRF_K + i + 1), full: 0, p: Number.MAX_SAFE_INTEGER });
  });
  const tier = (r: RankRow): number => (r.session_id === sessionId ? 2 : 0) + (r.worktree === ctx.worktree ? 1 : 0);
  const page = [...fused.values()]
    .sort((a, b) => tier(b.r) - tier(a.r) || b.full - a.full || b.s - a.s || a.p - b.p ||
      Number(b.r.source_id) - Number(a.r.source_id) || Number(a.r.ord) - Number(b.r.ord))
    .slice(offset, offset + limit);
  if (page.length === 0) return [];
  const rows = new Map<number, PageRow>();
  for (const r of stmt(db.raw, PAGE_ROWS).all({ ids: JSON.stringify(page.map((e) => Number(e.r.rid))) }) as unknown as PageRow[]) {
    rows.set(Number(r.rid), r);
  }
  return page.map((e) => {
    const r = rows.get(Number(e.r.rid)) as PageRow;
    return { sourceId: Number(r.source_id), label: r.label, ord: Number(r.ord), snippet: highlight(r.body, q, SNIPPET_MAX_BYTES), score: e.s };
  });
}

// Every chunk of the sources labelled `source` in scope, no MATCH (ADR-0009 §8.2: empty `queries`
// with source:"decision" returns every decision row in scope). Order = the M19 rule without a score:
// current session first, current worktree, newest source first, ord asc. Bodies are read for the
// page rows only, as in QUERY.
const LIST = `
WITH p AS (
  SELECT c.rowid AS rid, c.source_id AS source_id, c.ord AS ord, s.session_id AS session_id,
         s.worktree AS worktree, s.label AS label
  FROM chunks c JOIN sources s ON s.id = c.source_id
  WHERE c.source_id IN (
    SELECT id FROM sources
    WHERE label = :source
      AND (:scope <> 'session' OR session_id = :session_id)
      AND (:scope <> 'worktree' OR worktree = :worktree))
  ORDER BY (s.session_id = :session_id) DESC, (s.worktree = :worktree) DESC, c.source_id DESC, c.ord ASC
  LIMIT :limit OFFSET :offset
)
SELECT p.source_id AS source_id, p.label AS label, p.ord AS ord, c.body AS body, 0 AS score
FROM p JOIN chunks c ON c.rowid = p.rid
ORDER BY (p.session_id = :session_id) DESC, (p.worktree = :worktree) DESC, p.source_id DESC, p.ord ASC`;

export function ftsListSource(
  db: DbHandle,
  source: string,
  scope: SearchScope,
  ctx: ProjectContext,
  sessionId: string,
  limit: number,
  offset: number,
): Hit[] {
  const rows = db.raw.prepare(LIST).all({
    source,
    scope,
    session_id: sessionId,
    worktree: ctx.worktree,
    limit,
    offset,
  }) as unknown as QueryRow[];
  return rows.map((r) => ({
    sourceId: Number(r.source_id),
    label: r.label,
    ord: Number(r.ord),
    snippet: highlight(r.body, "", SNIPPET_MAX_BYTES),
    score: Number(r.score),
  }));
}

// D-SEARCH-7 (owner decision 2026-10-23; was impl/02 §9.3 clip-then-escape, #341/#963): the snippet is
// one contiguous slice of the stored text, never entity-encoded, chosen by term score and grown to
// whole blocks (src/core/store/snippet.ts). Prose stays within maxBytes; a fenced block may use up to
// SNIPPET_CODE_MAX_BYTES. Stopwords do not steer the window unless the query is only stopwords.
export function highlight(row: string, terms: string, maxBytes: number = SNIPPET_MAX_BYTES): string {
  const words = blankTokens(terms);
  const kept = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  return buildSnippet(row, snippetTerms(kept.length > 0 ? kept : words), maxBytes);
}

// ---- ctx_search sort:"timeline" (ADR-0009 §8.1 rules 2-6, DECISIONS-r9 M14-M18, D-M2-3, D-M2-T3-1) ----

// Shared scope filter (rule 2). Each source query fetches its own rows newer than `after` up to and
// including the timestamp group of its limit-th row (rule 3, never clipped inside a group), oldest first.
const TL_SCOPE = `
    AND (:scope <> 'session' OR session_id = :session_id)
    AND (:scope <> 'worktree' OR worktree = :worktree)`;

const TL_EVENTS = `
WITH e AS (
  SELECT seq, kind, key, path, body, created_at FROM events
  WHERE created_at > :after${TL_SCOPE}
    AND (:source IS NULL OR kind = :source)
)
SELECT seq, kind, key, path, body, created_at FROM e
WHERE created_at <= IFNULL((SELECT created_at FROM e ORDER BY created_at, seq LIMIT 1 OFFSET :off), created_at)
ORDER BY created_at ASC, seq ASC`;

const TL_SOURCES = `
WITH s AS (
  SELECT id, label, created_ts FROM sources
  WHERE created_ts > :after${TL_SCOPE}
    AND (:source IS NULL OR label = :source)
    AND label <> :reserved
)
SELECT id, label, created_ts FROM s
WHERE created_ts <= IFNULL((SELECT created_ts FROM s ORDER BY created_ts, id LIMIT 1 OFFSET :off), created_ts)
ORDER BY created_ts ASC, id ASC`;

// First chunk of each listed source: the row body a content timeline line shows.
const TL_FIRST_CHUNK = `
SELECT source_id, body FROM chunks WHERE ord = 0 AND source_id IN (SELECT value FROM json_each(:ids))`;

// Content rows skip the reserved "decision" chunk sources: a decision already is a journal row
// (D-M4-arch-5), so source:"decision" and the unfiltered timeline show it once.
// Rows remain past the page when either DB source has a row newer than the page's last timestamp.
const TL_MORE = `
SELECT EXISTS(SELECT 1 FROM events WHERE created_at > :after${TL_SCOPE} AND (:source IS NULL OR kind = :source))
    OR EXISTS(SELECT 1 FROM sources WHERE created_ts > :after${TL_SCOPE} AND (:source IS NULL OR label = :source)
                 AND label <> :reserved) AS more`;

interface EventTlRow { seq: number; kind: string; key: string | null; path: string | null; body: string | null; created_at: number; }
interface SourceTlRow { id: number; label: string; created_ts: number; }

// Rule 5: timestamp asc; journal rows (seq asc) before rows without seq at one timestamp; then
// content rows by sourceId asc; then auto-memory rows by path asc. Same input, same order.
function timelineOrder(a: TimelineRow, b: TimelineRow): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  const ca = a.seq !== null ? 0 : a.sourceId !== null ? 1 : 2;
  const cb = b.seq !== null ? 0 : b.sourceId !== null ? 1 : 2;
  if (ca !== cb) return ca - cb;
  if (ca === 0) return (a.seq as number) - (b.seq as number);
  if (ca === 1) return (a.sourceId as number) - (b.sourceId as number);
  const pa = a.path ?? "";
  const pb = b.path ?? "";
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}

// impl/00 §4 + D-M2-3 (memory: already scope-filtered auto-memory rows, last argument) + D-M2-T3-1
// (returns the page and whether rows remain). Every row label is a `source` value: content = the
// source label, journal = its kind (so source:"decision" selects kind "decision", D3), memory = as
// given. `after` = epoch-ms cursor (M18): rows with ts <= after are dropped; null starts at the
// oldest row. The page holds `limit` rows, extended to the end of its last timestamp group (rule 6).
export function ftsQueryTimeline(
  db: DbHandle,
  scope: SearchScope,
  ctx: ProjectContext,
  sessionId: string,
  limit: number,
  after: number | null,
  source: string | undefined,
  memory: TimelineRow[],
): { rows: TimelineRow[]; more: boolean } {
  const filter = {
    scope,
    session_id: sessionId,
    worktree: ctx.worktree,
    source: source ?? null,
  };
  const from = after ?? -1;
  const reserved = DECISION_SOURCE;
  const off = limit - 1;
  const merged: TimelineRow[] = [];

  for (const e of db.raw.prepare(TL_EVENTS).all({ ...filter, after: from, off }) as unknown as EventTlRow[]) {
    merged.push({
      origin: "session",
      ts: Number(e.created_at),
      seq: Number(e.seq),
      sourceId: null,
      path: e.path,
      label: e.kind,
      text: e.body ?? e.key ?? e.path ?? "",
    });
  }

  const srcRows = db.raw.prepare(TL_SOURCES).all({ ...filter, after: from, off, reserved }) as unknown as SourceTlRow[];
  if (srcRows.length > 0) {
    const bodies = new Map<number, string>();
    const ids = JSON.stringify(srcRows.map((r) => Number(r.id)));
    for (const c of db.raw.prepare(TL_FIRST_CHUNK).all({ ids }) as unknown as Array<{ source_id: number; body: string }>) {
      bodies.set(Number(c.source_id), c.body);
    }
    for (const r of srcRows) {
      const id = Number(r.id);
      merged.push({ origin: "content", ts: Number(r.created_ts), seq: null, sourceId: id, path: null, label: r.label, text: bodies.get(id) ?? "" });
    }
  }

  for (const m of memory) {
    if (m.ts > from && (source === undefined || m.label === source)) merged.push(m);
  }

  merged.sort(timelineOrder);
  let end = Math.min(limit, merged.length);
  if (end > 0) {
    const last = merged[end - 1].ts;
    while (end < merged.length && merged[end].ts === last) end++;
  }
  const rows = merged.slice(0, end);
  if (rows.length === 0) return { rows, more: false };
  if (merged.length > end) return { rows, more: true };
  const res = db.raw.prepare(TL_MORE).get({ ...filter, after: rows[rows.length - 1].ts, reserved }) as { more: number };
  return { rows, more: Number(res.more) === 1 };
}

// ---- In-memory BM25 (impl/05 §5 step 2, DECISIONS-r9 F1) ----

// Scratch table: one contentless column with the store's tokenizer. bm25() reads only the indexed
// columns, and every other chunks column is UNINDEXED, so the scores equal the chunks table's to the
// bit; the scratch table skips the four UNINDEXED columns and the stored copy of each text
// (DEVIATIONS D-M7-FT-1: 1 MiB / 10.7k texts 18.6 -> 12.8 ms). rowid = index + 1.
const RANK_DDL = `CREATE VIRTUAL TABLE r USING fts5(body, ${FTS_TOKENIZE}, content='')`;
const RANK_INSERT = "INSERT INTO r(rowid, body) VALUES (?, ?)";
const RANK_QUERY = "SELECT rowid AS id, bm25(r) AS bm FROM r WHERE r MATCH ?";

// Scores a plain text set with the same tokenizer and BM25 as ftsQuery, in a private in-memory DB.
// Returns one score per input text, same index: -bm25 (> 0) for a match, 0 for no match.
// mode "any" (D-M7-SV-5): a text matches when it holds any word of q; BM25 IDF weighs rare words up.
export function rankTexts(texts: string[], q: string, mode: "all" | "any" = "all"): number[] {
  const scores = texts.map(() => 0);
  const match = mode === "any" ? toMatchAny(q) : toMatch(q);
  if (match === "" || texts.length === 0) return scores;
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (sqlite === undefined) throw new CtxError("NO_SQLITE");
  const mem = new sqlite.DatabaseSync(":memory:");
  try {
    mem.exec(RANK_DDL);
    const ins = mem.prepare(RANK_INSERT);
    mem.exec("BEGIN");
    for (let i = 0; i < texts.length; i++) ins.run(i + 1, texts[i]);
    mem.exec("COMMIT");
    for (const r of mem.prepare(RANK_QUERY).all(match) as unknown as Array<{ id: number; bm: number }>) {
      scores[Number(r.id) - 1] = -r.bm;
    }
    return scores;
  } finally {
    mem.close();
  }
}

// D-CR3-HANDLE-1: the short stable id of a stored source: "s" + its sources.id (AUTOINCREMENT, never reused)
// in base 36. The id is the row key, so it is stored and stable for the life of the row.
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
export const SOURCE_ID_PREFIX = "s";
const LABEL_SUFFIX_SEP = "#";

export function sourceHandle(id: number): string {
  return SOURCE_ID_PREFIX + id.toString(36);
}

// The inverse of sourceHandle, or null. Digit by digit, no regex.
export function parseSourceHandle(s: string): number | null {
  if (!s.startsWith(SOURCE_ID_PREFIX) || s.length <= SOURCE_ID_PREFIX.length || s.length > SOURCE_ID_PREFIX.length + SOURCE_HANDLE_MAX_DIGITS) return null;
  let n = 0;
  for (const ch of s.slice(SOURCE_ID_PREFIX.length)) {
    const d = BASE36.indexOf(ch);
    if (d < 0) return null;
    n = n * 36 + d;
  }
  return n > 0 && sourceHandle(n) === s ? n : null;
}

// D-CR3-HANDLE-1: the label a `source` argument names, in this order: a short id of a stored row, a full
// label, a label without its "#<call id>" suffix (the newest such source). No match -> the argument as given.
export function resolveSourceLabel(db: DbHandle, source: string): string {
  const id = parseSourceHandle(source);
  if (id !== null) {
    const row = stmt(db.raw, "SELECT label FROM sources WHERE id = ?").get(id) as { label: string } | undefined;
    if (row !== undefined) return row.label;
  }
  if (stmt(db.raw, "SELECT 1 AS x FROM sources WHERE label = ? LIMIT 1").get(source) !== undefined) return source;
  const prefix = source + LABEL_SUFFIX_SEP;
  const rows = stmt(db.raw, "SELECT label FROM sources WHERE substr(label, 1, ?) = ? ORDER BY id DESC").all(prefix.length, prefix) as Array<{ label: string }>;
  for (const r of rows) {
    if (r.label.lastIndexOf(LABEL_SUFFIX_SEP) === source.length) return r.label;
  }
  return source;
}

/** D-CR3-RESUME-1: this session's stored sources, newest first (id, label, bytes). */
export function listSessionSources(db: DbHandle, sessionId: string, limit: number): Array<{ id: number; label: string; bytes: number }> {
  const rows = stmt(db.raw, "SELECT id, label, bytes_total FROM sources WHERE session_id = ? ORDER BY id DESC LIMIT ?").all(sessionId, limit) as Array<{ id: number; label: string; bytes_total: number }>;
  return rows.map((r) => ({ id: Number(r.id), label: r.label, bytes: Number(r.bytes_total) }));
}

// ---------- r3-ledger line units ----------

/** Store one output's line units, batched like ftsInsert (at most INDEX_WRITE_CHUNK bytes per withWrite). */
export function insertUnits(db: DbHandle, sourceId: number, sessionId: string, units: ReadonlyArray<{ ord: number; body: string }>): void {
  let start = 0;
  while (start < units.length) {
    let end = start;
    let bytes = 0;
    while (end < units.length && (end === start || bytes + (units[end] as { body: string }).body.length <= INDEX_WRITE_CHUNK)) {
      bytes += (units[end] as { body: string }).body.length;
      end++;
    }
    const from = start;
    withWrite(db, (h) => {
      const ins = h.raw.prepare("INSERT INTO line_units(body, source_id, session_id, ord) VALUES (?, ?, ?, ?)");
      for (let i = from; i < end; i++) {
        const u = units[i] as { ord: number; body: string };
        ins.run(u.body, sourceId, sessionId, u.ord);
      }
    });
    start = end;
  }
}

// The recall query text: the prompt alone when it equals the session goal, else the prompt, one space, the goal.
// dispatch.ts (turn-boundary recall) and resume.ts (ctx_resume) both rank line units by this text.
export function recallQueryText(prompt: string, goal: string): string {
  return goal === prompt ? prompt : prompt + " " + goal;
}

/** One ranked query over this session's line units (any-word form); best first, -bm25 as the score. */
export function queryUnits(db: DbHandle, sessionId: string, q: string, limit: number): UnitCandidate[] {
  const match = searchTerms(q).join(" OR ");
  if (match === "" || sessionId === "") return [];
  const rows = db.raw.prepare(
    "SELECT u.source_id AS source_id, u.ord AS ord, u.body AS body, -bm25(line_units) AS score, s.label AS label " +
    "FROM line_units u JOIN sources s ON s.id = u.source_id " +
    "WHERE line_units MATCH ? AND u.session_id = ? ORDER BY bm25(line_units) LIMIT ?",
  ).all(match, sessionId, limit) as Array<{ source_id: number; ord: number; body: string; score: number; label: string }>;
  return rows.map((r) => ({ sourceId: Number(r.source_id), ord: Number(r.ord), label: r.label, body: r.body, score: r.score }));
}
