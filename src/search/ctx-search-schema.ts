/**
 * ctx_search input-schema builder and project-scope resolver.
 *
 * Issue #737: the `project:` parameter is now present in ALL modes (not just
 * shared-DB mode) so per-project users can use `project: "global"` to fan-out
 * across all their project DBs.
 *
 * The handler in `src/server.ts` consumes both exports:
 *   - {@link buildCtxSearchInputSchema} composes the Zod object used at
 *     `registerTool` time. The `project` field is always present.
 *   - {@link resolveProjectScope} normalises the raw param for shared-DB mode:
 *       undefined/"current" → real cwd (getCurrentWorkingProject)
 *       "global"            → null (no row filter; handler fans out)
 *       <absolute-path>     → that string verbatim
 *     In per-project mode the handler reads `project` directly and branches
 *     on isGlobal / isAbsPath before calling resolveProjectScope.
 */

import { z } from "zod";

/**
 * Helper that mirrors the Zod coercer used elsewhere in the server for
 * array-shaped tool args. Kept inline so this module has no runtime
 * dependency on `server.ts` (which would create a cycle).
 *
 * Behaviour mirrors `coerceJsonArray` in `server.ts`:
 *   1. Empty / whitespace string → returned untouched so Zod surfaces the
 *      "non-empty" error rather than masquerading as `[""]`.
 *   2. Valid JSON array string → parsed and returned.
 *   3. Any other plain string (a bare single query) → lifted to a
 *      single-element array. Fixes #627 for the native OpenCode plugin
 *      path where some providers deliver `queries: "search term"`.
 */
function coerceJsonArray(val: unknown): unknown {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length === 0) return val;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through — not JSON, treat as bare-string lift */
    }
    return [val];
  }
  return val;
}

/**
 * Build the Zod object passed to `server.registerTool("ctx_search", …)`.
 *
 * The `project` field is now present in BOTH per-project and shared modes
 * (Slice D/F, issue #737): per-project users need `project: "global"` to
 * fan-out across all their project DBs. The `isSharedMode` parameter is
 * kept for backwards-compatibility but no longer controls field presence.
 *
 * Values:
 *   - omit / "current": search only this project's history (default).
 *   - "global": fan-out across every project's stored sessions and memory.
 *   - <absolute-path>: scope to that specific project directory.
 *
 * Session memory is searched in BOTH relevance and timeline sort modes
 * (Bug 2 fix). `sort` now controls only the ordering of results.
 */
export function buildCtxSearchInputSchema(_isSharedMode: boolean) {
  const projectField = {
    project: z
      .string()
      .optional()
      .describe(
        "Project scope: " +
          "omit or 'current' — this project only (default); " +
          "'global' — fan-out across every project's sessions, content, and memory; " +
          "<absolute-path> — scope to that specific project directory. " +
          "Stay on the default ('current'); only pass 'global' when the user explicitly asks to search across all/other projects (e.g. 'across my projects', 'anywhere', 'globally'). " +
          "Session memory is searched in both relevance and timeline sort modes.",
      ),
  };

  return z.object({
    queries: z.preprocess(coerceJsonArray, z
      .array(z.string())
      .optional()
      .describe("Array of search queries. Batch ALL questions in one call.")),
    // limit: z.coerce.number() (not z.number()) — OpenCode's native
    // plugin path delivers tool args straight from the LLM provider's
    // tool-call JSON, where several providers stringify primitives
    // (limit:"4" instead of limit:4). Since v1.0.139 / #621 we run
    // inputSchema.parse() on that path, so a plain z.number() rejects
    // "4" with "Expected number, received string". z.coerce mirrors what
    // ctx_batch_execute / ctx_fetch_and_index / ctx_execute already do.
    // Fixes #627.
    limit: z
      .coerce.number()
      .optional()
      .default(3)
      .describe("Results per query (default: 3)"),
    source: z
      .string()
      .optional()
      .describe("Filter to a specific indexed source (partial match)."),
    contentType: z
      .enum(["code", "prose"])
      .optional()
      .describe("Filter results by content type: 'code' or 'prose'."),
    sort: z
      .enum(["relevance", "timeline"])
      .optional()
      .default("relevance")
      .describe(
        "Sort mode. 'relevance' (default): BM25-ranked results across all sources " +
          "(content, session events, and auto-memory). " +
          "'timeline': same sources but ordered chronologically.",
      ),
    ...projectField,
  });
}

/**
 * Normalise the raw `project` value into the three-state contract consumed
 * by {@link searchAllSources}.
 *
 *   - shared mode OFF                              → `undefined` (single per-project DB, no row filter)
 *   - shared mode ON, param `undefined`            → real cwd (`getProjectDirFn()` = getCurrentWorkingProject)
 *   - shared mode ON, param `"current"`            → real cwd (same as undefined)
 *   - shared mode ON, param `"global"`             → `null` (no row filter; handler fans out)
 *   - shared mode ON, param `<absolute-path>`      → that string verbatim
 *
 * `getProjectDirFn` MUST be `getCurrentWorkingProject` (real process cwd),
 * NOT `getProjectDir` (which returns the pinned env path in shared mode).
 * Slice D (#737): decouples "which DB to open" (getProjectDir) from
 * "which rows to filter" (getCurrentWorkingProject).
 *
 * The function is pure so it stays trivially testable without spinning up
 * the MCP server.
 */
export function resolveProjectScope(
  raw: string | undefined,
  isSharedMode: boolean,
  getProjectDirFn: () => string,
): string | null | undefined {
  if (!isSharedMode) return undefined;
  if (raw === undefined || raw === "current") return getProjectDirFn();
  if (raw === "global") return null;
  return raw;
}

/**
 * Module-load snapshot of `CONTEXT_MODE_PROJECT_DIR`. Captured once so the
 * tool schema registered with `server.registerTool` reflects the launch
 * environment — the LLM-visible surface should never flip mid-session.
 */
export const CTX_SEARCH_SHARED_MODE = !!process.env.CONTEXT_MODE_PROJECT_DIR;
