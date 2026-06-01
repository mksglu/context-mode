/**
 * Global fan-out search — enumerate every project's DB files and merge
 * results with Reciprocal Rank Fusion.
 *
 * Issue #737 Slice E: `project: "global"` triggers this path instead of
 * the single-DB `searchAllSources` call. All DB handles are opened and
 * closed within a single call; no shared state persists between searches.
 *
 * Design decisions:
 *   D2 — global = union over DB files, no row filter.
 *   D4 — cross-DB merge = RRF (never concat raw BM25 scores).
 *   D5 — bounded fan-out, capped at CONTEXT_MODE_GLOBAL_FANOUT_MAX (default 1024).
 *        The cap only guards pathological installs; it MUST exceed the
 *        project count of a normal multi-project user or global recall
 *        silently drops most projects (real-world installs have 150+ DBs).
 *   D6 — null everywhere means "no filter" in searchEvents.
 *
 * BLOCKER 3 fix (#737 review): all DB opens in this module use readonly mode —
 * no WAL pragmas, no schema init/migration, no corruption repair/deletion.
 * Unreadable/corrupt DBs are skipped gracefully.
 */

import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { loadDatabase } from "../db-base.js";
import { sanitizeQuery, escapeLikeSource } from "../store.js";
import { canonicalContentDbPath, hashProjectDirCanonical } from "../session/db.js";
import { searchAutoMemory, type AutoMemoryAdapter } from "./auto-memory.js";
import { buildEventMatch } from "./event-query.js";
import type { UnifiedSearchResult } from "./unified.js";

const DEBUG = process.env.DEBUG?.includes("context-mode");

/**
 * Cap on how many DB FILES are fan-out'd per call.
 *
 * Must be large enough to cover a real multi-project install — power users
 * accumulate 150-300+ project DBs, and a low cap silently drops the majority
 * (the original 64 collapsed cross-project recall to whichever projects sorted
 * first by hash). Read-only fan-out is cheap (~0.8 ms/DB), so 1024 stays
 * sub-second while effectively never truncating a normal install. Override
 * with CONTEXT_MODE_GLOBAL_FANOUT_MAX for the rare pathological case.
 */
const DEFAULT_FANOUT_MAX = 1024;

// ─────────────────────────────────────────────────────────
// DB enumeration (MAJOR 5 fix: hash-based pairing, single cap)
// ─────────────────────────────────────────────────────────

/**
 * Extract the project identifier from a DB filename (without extension).
 * Session DBs may carry a worktree suffix: `<hash>__<8hex>.db`.
 * Content DBs are always `<hash>.db` (no suffix).
 * Returns the part BEFORE the first `__` delimiter (or the full name if none).
 */
function extractProjectId(filenameNoExt: string): string {
  const dunder = filenameNoExt.indexOf("__");
  return dunder >= 0 ? filenameNoExt.slice(0, dunder) : filenameNoExt;
}

function listDbsInDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(".db") && !f.endsWith("-wal.db") && !f.endsWith("-shm.db"))
      .map(f => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * List all session DB files for a given project directory, including
 * worktree-suffixed variants (`${hash}__<suffix>.db`).
 *
 * MAJOR fix (#737 round-3): `searchAbsPathProject` previously only opened
 * `${hash}.db`, missing sessions written by worktrees using
 * `CONTEXT_MODE_SESSION_SUFFIX` or `git worktree` detection.
 *
 * Returns paths in sorted order for deterministic behaviour.
 * Skips WAL/SHM sidecars. Returns [] if the directory is missing.
 */
export function listSessionDbsForProject(
  sessionsDir: string,
  projectDir: string,
): string[] {
  if (!existsSync(sessionsDir)) return [];
  const hash = hashProjectDirCanonical(projectDir);
  try {
    return readdirSync(sessionsDir)
      .filter(f => {
        if (!f.endsWith(".db")) return false;
        // Reject WAL/SHM sidecars (they never end with plain ".db" but
        // guard explicitly for safety on unusual FS layouts).
        if (f.endsWith("-wal.db") || f.endsWith("-shm.db")) return false;
        const base = f.slice(0, -3); // strip ".db"
        // Match `${hash}.db` (no suffix) OR `${hash}__<suffix>.db` (worktree).
        return base === hash || base.startsWith(hash + "__");
      })
      .sort()
      .map(f => join(sessionsDir, f));
  } catch {
    return [];
  }
}

/**
 * List DB files paired by project hash, sorted deterministically and capped.
 *
 * MAJOR C fix (round-2): the cap is applied to the TOTAL number of DB files
 * to open (session + content combined), not just to the number of project IDs.
 * Multiple worktree session DBs for the same project ID previously allowed
 * the total open-file count to exceed CONTEXT_MODE_GLOBAL_FANOUT_MAX.
 *
 * Algorithm:
 *   1. Enumerate all session and content DB files.
 *   2. Map each to its project ID (strip worktree suffix).
 *   3. Build the union of project IDs, sort deterministically.
 *   4. For each project ID, collect all its session DBs + optional content DB
 *      into a flat paired list.
 *   5. Cap the TOTAL list of DB files at CONTEXT_MODE_GLOBAL_FANOUT_MAX.
 */
export interface ProjectDbList {
  sessionDbs: string[];
  contentDbs: string[];
  /** Total DB files available across both dirs (before the cap). */
  totalAvailable: number;
  /** DB files actually selected to open (after the cap). */
  opened: number;
  /** Effective cap used (CONTEXT_MODE_GLOBAL_FANOUT_MAX or default). */
  cap: number;
  /** True when the cap dropped one or more DB files (coverage incomplete). */
  truncated: boolean;
}

export function listProjectDbs(
  sessionsDir: string,
  contentDir: string,
): ProjectDbList {
  // Strict parse: only an all-digits positive integer overrides the default.
  // parseInt would accept "3abc"/"3.5" → 3; reject those so the documented
  // "non-numeric falls back to default" contract holds (#737 review MINOR).
  const rawEnv = (process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX ?? "").trim();
  const fanoutMax = /^[1-9]\d*$/.test(rawEnv) ? Number(rawEnv) : DEFAULT_FANOUT_MAX;

  const sessionFiles = listDbsInDir(sessionsDir);
  const contentFiles = listDbsInDir(contentDir);

  // Map project-id → list of session DB file paths (multiple worktrees per project).
  const sessionByProject = new Map<string, string[]>();
  for (const f of sessionFiles) {
    const id = extractProjectId(basename(f).replace(/\.db$/, ""));
    const arr = sessionByProject.get(id) ?? [];
    arr.push(f);
    sessionByProject.set(id, arr);
  }

  // Map project-id → content DB file path (one per project, no worktree suffix).
  const contentByProject = new Map<string, string>();
  for (const f of contentFiles) {
    const id = extractProjectId(basename(f).replace(/\.db$/, ""));
    if (!contentByProject.has(id)) contentByProject.set(id, f);
  }

  // Union of all project ids, sorted deterministically.
  const allIds = Array.from(new Set([...sessionByProject.keys(), ...contentByProject.keys()])).sort();

  // Build the full paired list, then cap total file count (MAJOR C fix).
  const allSessionDbs: string[] = [];
  const allContentDbs: string[] = [];
  for (const id of allIds) {
    const sFiles = (sessionByProject.get(id) ?? []).sort();
    allSessionDbs.push(...sFiles);
    const cFile = contentByProject.get(id);
    if (cFile) allContentDbs.push(cFile);
  }

  // Cap the total number of DB files across both lists.
  const totalFiles = allSessionDbs.length + allContentDbs.length;
  if (totalFiles <= fanoutMax) {
    return {
      sessionDbs: allSessionDbs,
      contentDbs: allContentDbs,
      totalAvailable: totalFiles,
      opened: totalFiles,
      cap: fanoutMax,
      truncated: false,
    };
  }

  // Trim from the end (deterministic: IDs are sorted, files per ID are sorted).
  const sessionDbs: string[] = [];
  const contentDbs: string[] = [];
  let budget = fanoutMax;
  for (const id of allIds) {
    if (budget <= 0) break;
    const sFiles = (sessionByProject.get(id) ?? []).sort();
    for (const f of sFiles) {
      if (budget <= 0) break;
      sessionDbs.push(f);
      budget--;
    }
    const cFile = contentByProject.get(id);
    if (cFile && budget > 0) {
      contentDbs.push(cFile);
      budget--;
    }
  }

  return {
    sessionDbs,
    contentDbs,
    totalAvailable: totalFiles,
    opened: sessionDbs.length + contentDbs.length,
    cap: fanoutMax,
    truncated: true,
  };
}

// ─────────────────────────────────────────────────────────
// Read-only DB readers (BLOCKER 3 fix)
// ─────────────────────────────────────────────────────────

/**
 * Open a content DB in read-only mode and run a basic FTS5 MATCH query.
 *
 * BLOCKER 3: uses { readonly: true } — no WAL pragmas, no schema init,
 * no corruption repair, no FTS5 optimize-on-close. Unreadable DBs return [].
 *
 * Mirrors the porter-stem path in ContentStore.search() without fuzzy
 * correction or trigram fallback (cross-DB search overhead vs. recall).
 */
export function readonlySearchContent(
  dbPath: string,
  query: string,
  limit: number,
  source?: string,
  contentType?: "code" | "prose",
  projectDir?: string,
): UnifiedSearchResult[] {
  const Database = loadDatabase();
  let db: ReturnType<typeof Database> | null = null;
  try {
    db = new Database(dbPath, { readonly: true } as any);
    const porterQuery = sanitizeQuery(query, "OR");
    if (!porterQuery || porterQuery === '""') return [];

    const cols = `chunks.title, chunks.content, chunks.content_type, chunks.timestamp,
                  chunks.session_id, sources.label, bm25(chunks, 5.0, 1.0) AS rank`;
    let sql: string;
    const params: unknown[] = [porterQuery];

    if (source && contentType) {
      sql = `SELECT ${cols}
             FROM chunks JOIN sources ON sources.id = chunks.source_id
             WHERE chunks MATCH ? AND sources.label LIKE ? ESCAPE '\\' AND chunks.content_type = ?
             ORDER BY rank LIMIT ?`;
      params.push(escapeLikeSource(source), contentType, limit);
    } else if (source) {
      sql = `SELECT ${cols}
             FROM chunks JOIN sources ON sources.id = chunks.source_id
             WHERE chunks MATCH ? AND sources.label LIKE ? ESCAPE '\\'
             ORDER BY rank LIMIT ?`;
      params.push(escapeLikeSource(source), limit);
    } else if (contentType) {
      sql = `SELECT ${cols}
             FROM chunks JOIN sources ON sources.id = chunks.source_id
             WHERE chunks MATCH ? AND chunks.content_type = ?
             ORDER BY rank LIMIT ?`;
      params.push(contentType, limit);
    } else {
      sql = `SELECT ${cols}
             FROM chunks JOIN sources ON sources.id = chunks.source_id
             WHERE chunks MATCH ?
             ORDER BY rank LIMIT ?`;
      params.push(limit);
    }

    const rows = db.prepare(sql).all(...params) as Array<{
      title: string; content: string; content_type: string; timestamp: string | null;
      session_id: string | null; label: string; rank: number;
    }>;

    return rows.map(r => ({
      title: r.title,
      content: r.content,
      source: r.label,
      origin: "current-session" as const,
      timestamp: r.timestamp ?? undefined,
      rank: r.rank,
      contentType: r.content_type as "code" | "prose",
      project: projectDir,
      sessionId: r.session_id ?? undefined,
    }));
  } catch (e) {
    if (DEBUG) process.stderr.write(`[ctx] readonlySearchContent ${dbPath}: ${e}\n`);
    return [];
  } finally {
    try { (db as any)?.close(); } catch { /* ignore */ }
  }
}

/**
 * Open a session DB in read-only mode and run a tokenized LIKE search on
 * session_events. No project_dir filter — the DB file is the project boundary.
 *
 * #737 fix: uses buildEventMatch for multi-term scored matching so
 * natural-language queries surface session memory.
 *
 * `orderMode` (default "relevance") — caller passes "timeline" for sort=timeline.
 *
 * BLOCKER 3: uses { readonly: true } — no WAL pragmas, no schema init.
 * Unreadable/corrupt DBs return [].
 */
export function readonlySearchEvents(
  dbPath: string,
  query: string,
  limit: number,
  source?: string,
  orderMode: "timeline" | "relevance" = "relevance",
): UnifiedSearchResult[] {
  // Empty query: never run LIKE '%%' which matches everything.
  if (!query.trim()) return [];
  const Database = loadDatabase();
  let db: ReturnType<typeof Database> | null = null;
  try {
    db = new Database(dbPath, { readonly: true } as any);
    const { matchClause, matchParams, scoreExpr, scoreParams, hasTerms } = buildEventMatch(query);
    const sourceParam = source ?? null;

    // BLOCKER (agy review): bare integer in ORDER BY is a 1-based COLUMN INDEX
    // in SQLite even when parenthesized; the 0-term fallback scoreExpr="1" would
    // sort by id (col 1), not a constant. Only use the score when hasTerms.
    const orderClause =
      orderMode !== "relevance"
        ? `id ASC`
        : hasTerms
          ? `(${scoreExpr}) DESC, created_at DESC, id ASC`
          : `created_at DESC, id ASC`;

    // Binding order: ...matchParams, sourceParam, sourceParam,
    //                [...scoreParams if relevance], limit
    const sql = `
      SELECT id, session_id, category, type, data, created_at, project_dir
      FROM session_events
      WHERE ${matchClause}
        AND (? IS NULL OR category = ?)
      ORDER BY ${orderClause}
      LIMIT ?`;
    const params: unknown[] = [
      ...matchParams,
      sourceParam, sourceParam,
      ...(orderMode === "relevance" ? scoreParams : []),
      limit,
    ];
    const rows = db.prepare(sql).all(...params) as Array<{
      id: number; session_id: string; category: string; type: string; data: string; created_at: string; project_dir: string | null;
    }>;
    return rows.map(r => ({
      title: `[${r.category}] ${r.type}`,
      content: r.data,
      source: "prior-session",
      origin: "prior-session" as const,
      timestamp: r.created_at,
      project: r.project_dir || undefined,
      sessionId: r.session_id || undefined,
    }));
  } catch (e) {
    if (DEBUG) process.stderr.write(`[ctx] readonlySearchEvents ${dbPath}: ${e}\n`);
    return [];
  } finally {
    try { (db as any)?.close(); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────
// Project attribution (#737): resolve a content DB's project_dir
// ─────────────────────────────────────────────────────────

/**
 * Read the human-readable `project_dir` for a session DB (read-only).
 * Content DBs have no project_dir column, but each `<hash>.db` content DB
 * corresponds 1:1 to a project whose sibling session DB carries it in
 * `session_meta`. Best-effort: returns null on any error / empty store.
 */
function readProjectDirForSessionDb(dbPath: string): string | null {
  const Database = loadDatabase();
  let db: ReturnType<typeof Database> | null = null;
  try {
    db = new Database(dbPath, { readonly: true } as any);
    const row = db
      .prepare("SELECT project_dir FROM session_meta WHERE project_dir != '' ORDER BY last_event_at DESC LIMIT 1")
      .get() as { project_dir?: string } | undefined;
    return row?.project_dir || null;
  } catch {
    return null;
  } finally {
    try { (db as any)?.close(); } catch { /* ignore */ }
  }
}

/**
 * Build a `projectHash → project_dir` map from the enumerated session DBs so
 * content-DB hits (which only know their hash filename) can be attributed to
 * the originating project directory. Each hash resolved at most once.
 */
function buildProjectDirByHash(sessionDbs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of sessionDbs) {
    const hash = extractProjectId(basename(p).replace(/\.db$/, ""));
    if (map.has(hash)) continue;
    const projectDir = readProjectDirForSessionDb(p);
    if (projectDir) map.set(hash, projectDir);
  }
  return map;
}

// ─────────────────────────────────────────────────────────
// Source/contentType filter helpers (MINOR 2)
// ─────────────────────────────────────────────────────────

/**
 * Return true when a session-event or auto-memory result's source label
 * matches the caller's `source` filter (case-insensitive substring).
 *
 * MINOR 2 fix: session events and auto-memory results are filtered by their
 * own source label, not by SQL category equality, so the semantics match
 * ContentStore's source-label filter.
 */
function matchesSourceFilter(r: UnifiedSearchResult, source: string): boolean {
  return r.source.toLowerCase().includes(source.toLowerCase());
}

// ─────────────────────────────────────────────────────────
// RRF merge helpers
// ─────────────────────────────────────────────────────────

const RRF_K = 60;

/**
 * Dedupe key: title + first 80 chars of content.
 *
 * MAJOR 6 fix: intentionally excludes `source` so the same content appearing
 * in multiple project DBs (different sources) fuses into a single higher-scored
 * result instead of appearing as separate entries.
 */
function itemKey(r: UnifiedSearchResult): string {
  return `${r.title}|${r.content.slice(0, 80)}`;
}

function applyRrf(
  scoreMap: Map<string, { result: UnifiedSearchResult; score: number }>,
  items: UnifiedSearchResult[],
  defaultOrigin: UnifiedSearchResult["origin"],
): void {
  items.forEach((item, idx) => {
    const k = itemKey(item);
    const contribution = 1 / (RRF_K + idx + 1);
    const existing = scoreMap.get(k);
    if (existing) {
      existing.score += contribution;
    } else {
      scoreMap.set(k, {
        result: { ...item, origin: item.origin ?? defaultOrigin },
        score: contribution,
      });
    }
  });
}

function normalizeTimestamps(results: UnifiedSearchResult[]): void {
  for (const r of results) {
    if (r.timestamp && !r.timestamp.includes("T")) {
      r.timestamp = r.timestamp.replace(" ", "T") + "Z";
    }
  }
}

// ─────────────────────────────────────────────────────────
// Single abs-path project search (BLOCKER 2)
// ─────────────────────────────────────────────────────────

export interface AbsPathSearchOpts {
  query: string;
  limit: number;
  /** Directory containing this project's content DBs. */
  contentDir: string;
  /** Directory containing session DBs. */
  sessionsDir: string;
  /** The absolute project path being searched. */
  projectDir: string;
  source?: string;
  contentType?: "code" | "prose";
  sort?: "relevance" | "timeline";
  configDir?: string;
  adapter?: AutoMemoryAdapter;
}

/**
 * Search a single project identified by an absolute path, opening its DBs
 * read-only.
 *
 * BLOCKER 2: implements `project:"<abs-path>"` in per-project mode. The DB
 * file IS the project boundary — no row-level project_dir filter needed.
 * BLOCKER 3: uses canonical path helpers (no legacy rename) and readonly opens.
 * MAJOR A: round-robin interleave across content/session/auto-memory so all
 * sources surface even when content fills the per-source limit.
 */
export function searchAbsPathProject(opts: AbsPathSearchOpts): UnifiedSearchResult[] {
  const { query, limit, contentDir, sessionsDir, projectDir,
          source, contentType, sort, configDir, adapter } = opts;

  // BLOCKER C: compute canonical content path without triggering any legacy rename.
  const contentDbPath = canonicalContentDbPath({ projectDir, contentDir });

  const contentHits: UnifiedSearchResult[] = [];
  const sessionHits: UnifiedSearchResult[] = [];
  const memHits: UnifiedSearchResult[] = [];

  // ── Content (always searched; contentType filter applied in SQL) ──────────
  // Attribution (#737): this is a single known project, so tag content hits
  // with the requested projectDir directly.
  if (existsSync(contentDbPath)) {
    contentHits.push(...readonlySearchContent(contentDbPath, query, limit, source, contentType, projectDir));
  }

  // ── Session events (MAJOR fix: enumerate ALL session DBs for this project
  //    including worktree-suffixed variants `${hash}__<suffix>.db`;
  //    MINOR 2: skip when contentType filter is set — events have no code/prose type;
  //    MINOR 2: post-filter by source label match, not category equality) ──
  if (!contentType) {
    const sessionDbPaths = listSessionDbsForProject(sessionsDir, projectDir);
    for (const dbPath of sessionDbPaths) {
      // Pass no `source` to readonlySearchEvents — category-equality filter
      // has wrong semantics for a source-label filter. Apply label match below.
      // Thread sort → orderMode (#737 fix: relevance = scored order).
      let items = readonlySearchEvents(dbPath, query, limit, undefined, sort === "timeline" ? "timeline" : "relevance");
      if (source) {
        items = items.filter(r => matchesSourceFilter(r, source));
      }
      sessionHits.push(...items);
    }
  }

  // ── Auto-memory (MINOR 2: skip when contentType filter is set;
  //    filter by source label match when source is set) ─────────────────────
  if (!contentType) {
    try {
      let mem = searchAutoMemory([query], limit, projectDir, configDir, adapter);
      if (source) {
        mem = mem.filter(r => matchesSourceFilter(r, source));
      }
      memHits.push(...mem);
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] searchAbsPathProject auto-memory error: ${e}\n`);
    }
  }

  // MAJOR A: round-robin interleave so all sources surface (mirrors unified.ts).
  const interleaved: UnifiedSearchResult[] = [];
  const maxLen = Math.max(contentHits.length, sessionHits.length, memHits.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < contentHits.length) interleaved.push(contentHits[i]);
    if (i < sessionHits.length) interleaved.push(sessionHits[i]);
    if (i < memHits.length) interleaved.push(memHits[i]);
  }

  normalizeTimestamps(interleaved);

  if (sort === "timeline") {
    interleaved.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  }

  return interleaved.slice(0, limit);
}

// ─────────────────────────────────────────────────────────
// Global fan-out search
// ─────────────────────────────────────────────────────────

export interface GlobalFanoutOpts {
  query: string;
  limit: number;
  sessionsDir: string;
  contentDir: string;
  source?: string;
  contentType?: "code" | "prose";
  sort?: "relevance" | "timeline";
  configDir?: string;
  adapter?: AutoMemoryAdapter;
}

/**
 * Fan-out across every project DB pair with Reciprocal Rank Fusion merge.
 *
 * All DB files are opened read-only (BLOCKER 3). Unreadable/corrupt DBs
 * are skipped gracefully. Auto-memory is queried once globally (null projectDir).
 *
 * MAJOR 2 fix: sort="timeline" produces chronological ordering (same as
 * searchAllSources). RRF primary ordering applies only for sort="relevance".
 *
 * MAJOR 5 fix: DB selection is paired by project hash — cap applies to the
 * project count, not independently to sessions and content dirs.
 *
 * MAJOR 6 / dedupe key fix: cross-DB identical items fuse (key excludes source).
 */
export function searchGlobalFanout(opts: GlobalFanoutOpts): UnifiedSearchResult[] {
  const { query, limit, sessionsDir, contentDir, source, contentType, sort, configDir, adapter } = opts;

  // Non-positive limit → nothing requested. Guard up front so the diversity
  // cap's post-push break can't leak a single item (review NIT).
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const { sessionDbs, contentDbs } = listProjectDbs(sessionsDir, contentDir);

  // Attribution (#737): map each content DB's hash → project_dir via its
  // sibling session DB so cross-project hits can name their origin project.
  const projectDirByHash = buildProjectDirByHash(sessionDbs);

  const scoreMap = new Map<string, { result: UnifiedSearchResult; score: number }>();

  // ── Content DBs (FTS5 MATCH, read-only) ────────────────────────────────
  for (const dbPath of contentDbs) {
    const hash = extractProjectId(basename(dbPath).replace(/\.db$/, ""));
    const projectDir = projectDirByHash.get(hash);
    const items = readonlySearchContent(dbPath, query, limit, source, contentType, projectDir);
    applyRrf(scoreMap, items, "current-session");
  }

  // ── Session DBs (LIKE search, read-only, no project_dir filter)
  //    MINOR 2: skip when contentType filter is set (events have no code/prose type).
  //    MINOR 2: post-filter by source label — do NOT pass `source` as category
  //    equality (wrong semantics for a source-label filter). ──────────────────
  if (!contentType) {
    for (const dbPath of sessionDbs) {
      // Thread sort → orderMode (#737 fix: relevance = scored order per DB).
      let items = readonlySearchEvents(dbPath, query, limit, undefined, sort === "timeline" ? "timeline" : "relevance");
      if (source) {
        items = items.filter(r => matchesSourceFilter(r, source));
      }
      applyRrf(scoreMap, items, "prior-session");
    }
  }

  // ── Auto-memory (global: null = enumerate all hash dirs)
  //    MINOR 2: skip when contentType filter is set; filter by source label. ──
  if (!contentType) {
    try {
      let memResults = searchAutoMemory([query], limit, null, configDir, adapter);
      if (source) {
        memResults = memResults.filter(r => matchesSourceFilter(r, source));
      }
      applyRrf(scoreMap, memResults, "auto-memory");
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] global-fanout auto-memory error: ${e}\n`);
    }
  }

  // ── Sort ────────────────────────────────────────────────────────────────
  // MAJOR 2 fix: timeline = chronological ordering; relevance = RRF score (desc).
  if (sort === "timeline") {
    const chronological = Array.from(scoreMap.values()).map(v => v.result);
    normalizeTimestamps(chronological);
    chronological.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
    return chronological.slice(0, limit);
  }

  // Relevance: RRF score DESC. On EQUAL score, prefer session memory over
  // content so session hits are not evicted purely by scoreMap insertion order
  // (content DBs are applied before session DBs). TIE-ONLY nudge — never
  // promotes a lower-scored item above a higher-scored one (RRF-safe).
  //
  // Note: readonlySearchContent returns origin: "current-session" for ALL
  // content items (including cross-project ones). We therefore give
  // "prior-session" events a STRICTLY lower number than "current-session"
  // so session recall beats content-noise on equal RRF scores.
  const originPriority = (o?: string): number =>
    o === "prior-session" ? 0 : o === "auto-memory" ? 1 : 2;
  const sorted = Array.from(scoreMap.values())
    .sort((a, b) =>
      b.score - a.score ||
      originPriority(a.result.origin) - originPriority(b.result.origin) ||
      0,
    )
    .map(v => v.result);
  normalizeTimestamps(sorted);

  // Session diversity cap (#737, eval-driven): stop one chatty session (e.g.
  // the CURRENT debugging session, which floods the KB with the very topic
  // being worked on) from monopolizing the result window. HARD cap: keep at
  // most CAP items per sessionId, in RRF order, DROPPING a session's surplus
  // (no backfill — backfilling would just re-admit the chatty session and
  // defeat the purpose). Items with no sessionId (content, auto-memory) are
  // NEVER capped. RRF-safe: order is preserved; only surplus same-session
  // items are removed, never a higher-scored item displaced by a lower one.
  // Trade-off: a query whose answer lives entirely in one session returns at
  // most CAP of its events — acceptable for GLOBAL recall, which favours
  // breadth (the session name is surfaced; drill in for depth).
  const CAP = Math.max(3, Math.floor(limit / 4));
  const perSession = new Map<string, number>();
  const capped: UnifiedSearchResult[] = [];
  for (const r of sorted) {
    const sid = r.sessionId;
    if (sid) {
      const n = perSession.get(sid) ?? 0;
      if (n >= CAP) continue; // drop this chatty session's surplus
      perSession.set(sid, n + 1);
    }
    capped.push(r);
    if (capped.length >= limit) break;
  }
  return capped;
}
