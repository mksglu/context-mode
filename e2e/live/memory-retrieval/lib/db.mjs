// lib/db.mjs
// In-memory node:sqlite DB built from a journal JSON, following the v2
// `events` table shape in docs/architecture/modules/02-store.md §5.1, plus an FTS5
// index over body/key/path (porter + unicode61 tokenizer, per
// https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/memory-retrieval-r7.workflow.js step 1).
//
// Journal JSON shape (one file per project, produced from toJournal()):
//   { projectKey, worktree, agent, rows: [
//       { seq, session_id, turn, kind, tool, key, path, ok, exit_code,
//         bytes, body, ts, worktree? }
//   ] }
import { DatabaseSync } from "node:sqlite";

const KINDS = ["prompt", "edit", "cmd", "toolerr", "index", "cost", "decision"];

export function buildDb(journal) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA journal_mode = MEMORY;
    CREATE TABLE events (
      seq         INTEGER PRIMARY KEY,
      session_id  TEXT NOT NULL,
      worktree    TEXT NOT NULL,
      agent       TEXT NOT NULL,
      kind        TEXT NOT NULL CHECK (kind IN (${KINDS.map((k) => `'${k}'`).join(",")})),
      tool        TEXT,
      key         TEXT,
      path        TEXT,
      ok          INTEGER,
      exit_code   INTEGER,
      bytes       INTEGER,
      body        TEXT,
      turn        INTEGER NOT NULL,
      ts          INTEGER NOT NULL
    );
    CREATE INDEX idx_events_session_kind_seq ON events(session_id, kind, seq);
    CREATE INDEX idx_events_session_kind_key_seq ON events(session_id, kind, key, seq);

    CREATE VIRTUAL TABLE events_fts USING fts5(
      body, key, path,
      content='events', content_rowid='seq',
      tokenize='porter unicode61'
    );
  `);

  const insert = db.prepare(
    `INSERT INTO events (seq, session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn, ts)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const defaultWorktree = journal.worktree ?? "wt";
  const defaultAgent = journal.agent ?? "claude-code";
  for (const r of (Array.isArray(journal) ? journal : journal.rows || journal.events || [])) {
    if (!KINDS.includes(r.kind)) continue;
    insert.run(
      r.seq,
      r.session_id ?? r.session ?? "s",
      r.worktree ?? defaultWorktree,
      r.agent ?? defaultAgent,
      r.kind,
      r.tool ?? null,
      r.key ?? null,
      r.path ?? null,
      r.ok === undefined || r.ok === null ? null : r.ok ? 1 : 0,
      r.exit_code ?? null,
      r.bytes ?? (r.body ? Buffer.byteLength(r.body, "utf8") : null),
      r.body ?? null,
      r.turn ?? 0,
      r.ts ?? r.seq,
    );
  }
  db.exec(`INSERT INTO events_fts(rowid, body, key, path) SELECT seq, body, key, path FROM events;`);
  return db;
}

// A small, fixed function-word list so a natural-language question does
// not out-rank the content word it is actually asking about ("what",
// "did", "we" carry near-zero IDF signal in a tiny corpus). This is a
// measurement-harness query-shaping step, not the production no-regex
// FTS contract in store.ts §9.2 (which governs the server's own query
// path, left as a plain bareword/OR match there).
const STOPWORDS = new Set([
  "a","an","the","this","that","these","those","is","are","was","were","be","been","being",
  "do","did","does","done","what","which","who","whom","how","why","when","where",
  "we","i","you","it","they","he","she","me","my","our","your","their","its",
  "to","of","in","on","at","for","with","about","again","before","last","this","time",
  "fixed","solve","solved","earlier","right","now","work","before","after","than","then",
]);

// FTS5 MATCH clause: each bareword content token quoted (safe against
// punctuation), terms OR'd together so a natural-language query still
// gets partial matches ranked by bm25 (store.ts §9.2 "no regex
// pre-processing" — this only quotes/filters tokens, it never stems).
function ftsMatch(query) {
  const tokens = String(query)
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase())
    .filter((t) => t && !STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

function scopeClause(scope, sessionId, worktree) {
  if (scope === "session") return { sql: "AND e.session_id = ?", params: [sessionId] };
  if (scope === "worktree") return { sql: "AND e.worktree = ?", params: [worktree] };
  return { sql: "", params: [] }; // project: no extra filter
}

/**
 * BM25 relevance query within one scope. Returns rows best-first
 * (bm25() in SQLite FTS5 is ascending-better, §9.2).
 */
export function ftsQuery(db, { query, scope = "worktree", sessionId, worktree, visibleBeforeSeq = Infinity, limit = 20, kindFilter }) {
  const match = ftsMatch(query);
  if (!match) return [];
  const sc = scopeClause(scope, sessionId, worktree);
  let where = `events_fts MATCH ? AND e.seq < ?`;
  const params = [match, visibleBeforeSeq];
  where += " " + sc.sql;
  params.push(...sc.params);
  if (kindFilter) {
    where += " AND e.kind = ?";
    params.push(kindFilter);
  }
  const sql = `SELECT e.seq, e.session_id, e.kind, e.key, e.path, e.body, e.ts,
                      bm25(events_fts) AS score
               FROM events_fts JOIN events e ON e.seq = events_fts.rowid
               WHERE ${where}
               ORDER BY score, e.seq
               LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params);
}

/**
 * sort:"timeline" — oldest first, after cursor, page size `limit`.
 * Same rule for every variant (DECISIONS-r6 D2; task step 2 "Timeline
 * mode for all: oldest first, after cursor, page size 10").
 */
export function timelineQuery(db, { scope = "worktree", sessionId, worktree, after = 0, visibleBeforeSeq = Infinity, limit = 10, kindFilter }) {
  const sc = scopeClause(scope, sessionId, worktree);
  let where = "e.seq > ? AND e.seq < ?";
  const params = [after, visibleBeforeSeq];
  where += " " + sc.sql;
  params.push(...sc.params);
  if (kindFilter) {
    where += " AND e.kind = ?";
    params.push(kindFilter);
  }
  const sql = `SELECT e.seq, e.session_id, e.kind, e.key, e.path, e.body, e.ts
               FROM events e
               WHERE ${where}
               ORDER BY e.ts ASC, e.seq ASC
               LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function rowBody(db, seq) {
  const r = db.prepare("SELECT body, key, path FROM events WHERE seq = ?").get(seq);
  return r ? r.body || r.key || r.path || "" : "";
}
