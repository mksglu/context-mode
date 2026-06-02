/**
 * Unified multi-source search — merges ContentStore, SessionDB, and
 * auto-memory results into a single ranked or chronological result set.
 *
 * All three sources are always searched; `sort` controls only the final
 * ordering (relevance vs. chronological). Issue #737 Bug 2 fix: sources
 * are no longer gated on sort mode.
 *
 * MAJOR 3 fix (#737 review): per-source results are interleaved (round-robin)
 * before truncation so session events and auto-memory always get representation
 * even when the ContentStore fills the per-query limit.
 */

import type { ContentStore, SearchResult } from "../store.js";
import type { SessionDB, StoredEvent } from "../session/db.js";
import { searchAutoMemory, type AutoMemoryAdapter } from "./auto-memory.js";

const DEBUG = process.env.DEBUG?.includes("context-mode");

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface UnifiedSearchResult {
  title: string;
  content: string;
  source: string;
  origin: "current-session" | "prior-session" | "auto-memory";
  timestamp?: string;
  rank?: number;
  matchLayer?: string;
  highlighted?: string;
  contentType?: "code" | "prose";
  /** Attribution (#737): project_dir this hit belongs to (cross-project recall). */
  project?: string;
  /** Attribution (#737): session id this hit was captured under, when known. */
  sessionId?: string;
}

export interface SearchAllSourcesOpts {
  query: string;
  limit: number;
  store: ContentStore;
  sort?: "relevance" | "timeline";
  source?: string;
  contentType?: "code" | "prose";
  sessionDB?: SessionDB | null;
  projectDir?: string;
  configDir?: string;
  /** Detected platform adapter — used for adapter-aware auto-memory. */
  adapter?: AutoMemoryAdapter;
  /**
   * Per-project scope for the ContentStore filter (#737). Only honoured
   * when a `sessionDB` is also supplied (the 2-step IN-clause needs the
   * SessionDB to translate `project_dir` → list of session ids).
   *
   *   - `undefined` — no project filter, today's behaviour.
   *   - `null`      — cross-project recall in shared-DB mode (also no filter).
   *   - `string`    — restrict ContentStore results to chunks attributed to
   *                   session ids whose events match this `project_dir`,
   *                   plus legacy `session_id=''` chunks (public surface).
   */
  projectScope?: string | null;
}

// ─────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────

/**
 * Search across all available sources and interleave results.
 *
 * All three sources (ContentStore, SessionDB events, auto-memory) are
 * ALWAYS searched regardless of `sort`. The `sort` parameter controls only
 * the final ordering:
 *   - "relevance" (default): per-source results are interleaved round-robin
 *     so each source gets representation, then stable-sorted by rank/origin.
 *   - "timeline": all results merged and sorted chronologically.
 *
 * MAJOR 3 fix (#737 review): each source's result list is collected
 * independently; they are interleaved round-robin before the final slice so
 * session events + auto-memory always appear even when ContentStore fills
 * the per-query limit.
 *
 * Errors in any single source are caught and logged — partial results
 * are always returned.
 */
export function searchAllSources(opts: SearchAllSourcesOpts): UnifiedSearchResult[] {
  const {
    query,
    limit,
    store,
    sort = "relevance",
    source,
    contentType,
    sessionDB,
    projectDir,
    configDir,
    adapter,
    projectScope,
  } = opts;

  // Capture session start time once — used as proxy for ContentStore items
  const sessionStartTime = new Date().toISOString();

  // ── Project scope (#737) ──
  // Resolve the per-project session-id allow-set ONCE, before the
  // ContentStore call. `projectScope === null` means cross-project recall —
  // an explicit "no filter" choice surfaced by the ctx_search caller — and
  // `undefined` falls back to today's unfiltered behaviour.
  let sessionIdAllowSet: Set<string> | undefined;
  if (typeof projectScope === "string" && sessionDB) {
    try {
      sessionIdAllowSet = new Set(sessionDB.getSessionIdsForProject(projectScope));
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] getSessionIdsForProject failed: ${e}\n`);
    }
  }

  // ── Source 1: ContentStore ────────────────────────────────────────────────
  const contentResults: UnifiedSearchResult[] = [];
  try {
    const storeResults = store.searchWithFallback(
      query,
      limit,
      source,
      contentType,
      "like",
      sessionIdAllowSet,
    );
    contentResults.push(
      ...storeResults.map((r: SearchResult) => ({
        title: r.title,
        content: r.content,
        source: r.source,
        origin: "current-session" as const,
        timestamp: r.timestamp || sessionStartTime,
        rank: r.rank,
        matchLayer: r.matchLayer,
        highlighted: r.highlighted,
        contentType: r.contentType,
      })),
    );
  } catch (e) {
    if (DEBUG) process.stderr.write(`[ctx] ContentStore search failed: ${e}\n`);
  }

  // ── Sources 2+3: ALWAYS run (Bug 2 fix — sort controls ordering, not source set) ──
  //
  // projectScope drives the row-level filter for both sources:
  //   - undefined → legacy behaviour (projectDir || "" for events, projectDir for memory)
  //   - null      → no filter (cross-project global recall)
  //   - string    → exact match (that project's events/memory)

  // Source 2: SessionDB — prior session events.
  // Gate on !contentType: session events have no code/prose classification,
  // so including them when contentType is set returns wrong result classes
  // (mirrors the global-fanout contentType gate, #737 review MAJOR).
  const sessionResults: UnifiedSearchResult[] = [];
  if (!contentType) {
    try {
      if (sessionDB) {
        const eventsFilter: string | null =
          projectScope === undefined ? (projectDir || "") : projectScope;
        // Thread sort → orderMode (#737 fix: relevance = scored session events).
        const dbResults = sessionDB.searchEvents(query, limit, eventsFilter, source, sort === "timeline" ? "timeline" : "relevance");
        sessionResults.push(
          ...dbResults.map((r: Pick<StoredEvent, "id" | "session_id" | "category" | "type" | "data" | "created_at">) => ({
            title: `[${r.category}] ${r.type}`,
            content: r.data,
            // Use category as source so source-based filtering (e.g. source:"decision")
            // works uniformly via the shared partial matcher; origin preserves provenance.
            source: r.category,
            origin: "prior-session" as const,
            timestamp: r.created_at,
          })),
        );
      }
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] SessionDB search failed: ${e}\n`);
    }
  }

  // Source 3: Auto-memory.
  // Gate on !contentType: auto-memory files have no code/prose classification.
  // Also post-filter by source label when caller sets one (mirrors global-fanout,
  // #737 review MAJOR).
  // projectScope=null → enumerate all memory hash dirs (global);
  // projectScope=string → single hashed dir for that project;
  // projectScope=undefined → legacy: use projectDir (may be undefined → current project).
  const memResults: UnifiedSearchResult[] = [];
  if (!contentType) {
    try {
      const autoMemProjectDir: string | null | undefined =
        projectScope === undefined ? projectDir : projectScope;
      let hits = searchAutoMemory([query], limit, autoMemProjectDir, configDir, adapter);
      if (source) {
        hits = hits.filter((r) => r.source.toLowerCase().includes(source.toLowerCase()));
      }
      memResults.push(...hits);
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] auto-memory search failed: ${e}\n`);
    }
  }

  // ── Normalize timestamps for consistent sorting ──
  // SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" (no T, no Z)
  // ISO → "YYYY-MM-DDTHH:MM:SS.sssZ"
  for (const list of [contentResults, sessionResults, memResults]) {
    for (const r of list) {
      if (r.timestamp && !r.timestamp.includes("T")) {
        r.timestamp = r.timestamp.replace(" ", "T") + "Z";
      }
    }
  }

  // ── Merge and sort ──
  if (sort === "timeline") {
    // Chronological merge of all sources.
    const all = [...contentResults, ...sessionResults, ...memResults];
    all.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
    return all.slice(0, limit);
  }

  // Relevance: round-robin interleave across sources so every source gets
  // representation even when ContentStore fills the per-query limit.
  // MAJOR 3 fix (#737 review): previously all sources were appended in order
  // then sliced — session/auto-memory items vanished when content filled limit.
  const interleaved: UnifiedSearchResult[] = [];
  const maxLen = Math.max(contentResults.length, sessionResults.length, memResults.length);
  for (let i = 0; i < maxLen && interleaved.length < limit; i++) {
    if (i < contentResults.length && interleaved.length < limit) {
      interleaved.push(contentResults[i]);
    }
    if (i < sessionResults.length && interleaved.length < limit) {
      interleaved.push(sessionResults[i]);
    }
    if (i < memResults.length && interleaved.length < limit) {
      interleaved.push(memResults[i]);
    }
  }
  return interleaved;
}
