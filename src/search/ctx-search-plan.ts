/**
 * Pure decision helpers for the ctx_search handler.
 *
 * Extracted from server.ts so the branching logic can be unit-tested
 * without spinning up an MCP server (MAJOR D, issue #737 round-2 review).
 *
 * Two exported functions:
 *   - {@link planCtxSearchScope}: maps raw `project` param + mode flags to a
 *     discriminated scope object the handler can switch on.
 *   - {@link shouldReturnEmptyGuidance}: returns true only when all sources
 *     truly have no hits AND the content store has no chunks — prevents the
 *     "Knowledge base is empty" message from hiding auto-memory-only results.
 */

import { isAbsolute } from "node:path";

// ─────────────────────────────────────────────────────────
// Scope plan
// ─────────────────────────────────────────────────────────

/**
 * Discriminated result of {@link planCtxSearchScope}.
 *
 * | kind             | handler action                                          |
 * |------------------|---------------------------------------------------------|
 * | `global`         | fan-out across ALL project DB files (no row filter)     |
 * | `absPathPerProject` | open `dir`'s hashed content+session DBs, read-only   |
 * | `rowFilter`      | single shared DB with `project_dir = scope` row filter  |
 * | `current`        | single per-project DB, no row filter (default)          |
 */
export type CtxSearchScope =
  | { kind: "global" }
  | { kind: "absPathPerProject"; dir: string }
  | { kind: "rowFilter"; scope: string }
  | { kind: "current" };

/**
 * Map the raw `project` parameter + mode flags to a {@link CtxSearchScope}.
 *
 * Rules (evaluated in order):
 *   1. `"global"` → `{kind:"global"}` in both modes.
 *   2. Absolute path in SHARED mode → `{kind:"rowFilter", scope: project}`
 *      (shared DB has all events; use a `project_dir = ?` row filter).
 *   3. Absolute path in PER-PROJECT mode → `{kind:"absPathPerProject", dir: project}`
 *      (that project's hashed DB pair is opened read-only; DB file = boundary).
 *   4. Shared mode, any other value → `{kind:"rowFilter", scope: workingDir}`
 *      (`undefined` / `"current"` both resolve to the real cwd).
 *   5. Per-project mode, any value → `{kind:"current"}` (ignore param; DB is
 *      already scoped by project hash).
 *
 * `isAbsPath` is injectable for testability; defaults to node's `isAbsolute`.
 * `getWorkingDir` is injectable for testability; in production pass
 *   `getCurrentWorkingProject` (real cwd, not pinned CONTEXT_MODE_PROJECT_DIR).
 */
export function planCtxSearchScope(
  rawProject: string | undefined,
  sharedMode: boolean,
  getWorkingDir: () => string,
  isAbsPath: (p: string) => boolean = isAbsolute,
): CtxSearchScope {
  // Rule 1: "global" always fans out.
  if (rawProject === "global") {
    return { kind: "global" };
  }

  // Rules 2 & 3: absolute path.
  if (typeof rawProject === "string" && isAbsPath(rawProject)) {
    if (sharedMode) {
      // Shared DB mode: filter rows by project_dir = rawProject.
      return { kind: "rowFilter", scope: rawProject };
    } else {
      // Per-project DB mode: open that project's hashed DB pair.
      return { kind: "absPathPerProject", dir: rawProject };
    }
  }

  // Rules 4 & 5: current / undefined.
  if (sharedMode) {
    // Resolve real cwd (not pinned env) for the row filter.
    return { kind: "rowFilter", scope: getWorkingDir() };
  }

  // Per-project default: no row filter; DB hash already scopes the project.
  return { kind: "current" };
}

// ─────────────────────────────────────────────────────────
// Empty-guidance predicate
// ─────────────────────────────────────────────────────────

/**
 * Return `true` only when a post-search guidance message is warranted.
 *
 * The guidance ("Knowledge base is empty — use ctx_batch_execute…") should
 * appear ONLY when:
 *   - the content store has 0 indexed chunks, AND
 *   - the search produced 0 results across ALL sources.
 *
 * BLOCKER D fix: the pre-search short-circuit was removed. This predicate
 * is called AFTER the search so auto-memory-only recall (CLAUDE.md / memory
 * files) is never blocked by an empty content store.
 */
export function shouldReturnEmptyGuidance(opts: {
  chunks: number;
  totalResults: number;
}): boolean {
  return opts.totalResults === 0 && opts.chunks === 0;
}

// ─────────────────────────────────────────────────────────
// Per-query result limit
// ─────────────────────────────────────────────────────────

/**
 * Per-query result cap for ctx_search.
 *
 * Single-DB scopes stay tight (1-2) to protect the context window. Breadth
 * scopes (global fan-out / abs-path) need a higher cap: cross-DB RRF ties
 * every project's top hit at the same score, so a specific answer can rank
 * mid-pack behind generic common-term noise (#737 — the "download APK" how-to
 * ranked #8). A 1-2 cap silently chops it off; 10-12 surfaces it while the
 * 40KB total-output guard in the handler still bounds flooding.
 */
export function effectiveSearchLimit(opts: {
  breadthScope: boolean;
  throttled: boolean;
  requestedLimit: number;
}): number {
  const { breadthScope, throttled, requestedLimit } = opts;
  if (breadthScope) {
    return throttled ? 5 : Math.min(Math.max(requestedLimit, 10), 12);
  }
  return throttled ? 1 : Math.min(requestedLimit, 2);
}
