/**
 * Auto-memory search — searches CLAUDE.md / AGENTS.md / GEMINI.md / etc.
 * and the platform's persistent memory directory for decisions,
 * preferences, and context from prior sessions.
 *
 * Returns results in a format compatible with the unified search pipeline.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { resolveClaudeConfigDir } from "../util/claude-config.js";
import { hashProjectDirCanonical } from "../session/db.js";

const DEBUG = process.env.DEBUG?.includes("context-mode");

export interface AutoMemoryResult {
  title: string;
  content: string;
  source: string;
  origin: "auto-memory";
  timestamp?: string;
}

/**
 * Minimal adapter contract used by searchAutoMemory.
 * Avoids depending on the full HookAdapter type to keep this module standalone.
 */
export interface AutoMemoryAdapter {
  getConfigDir(): string;
  getInstructionFiles(): string[];
  /**
   * `projectDir` is optional for backwards compatibility with legacy
   * callers — when supplied, adapters MUST return a project-scoped path
   * (see HookAdapter.getMemoryDir contract, issue #663).
   */
  getMemoryDir(projectDir?: string): string;
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "word" });

/** Split query whitespace structurally, retaining the existing minimum length. */
function queryTerms(query: string): string[] {
  const terms: string[] = [];
  let term = "";
  for (const character of query) {
    if (character.trim() === "") {
      if (term.length >= 3) terms.push(term);
      term = "";
    } else term += character;
  }
  if (term.length >= 3) terms.push(term);
  return terms;
}

/** Literal whole-term matching with Unicode-aware word boundaries. */
function createTermMatcher(content: string): (term: string) => boolean {
  let graphemes: ReturnType<typeof GRAPHEME_SEGMENTER.segment> | undefined;
  const classes = new Map<string, boolean>();
  function isWordAt(index: number): boolean {
    if (index < 0 || index >= content.length) return false;
    const code = content.charCodeAt(index);
    // Preserve ASCII word/identifier boundaries, including apostrophes.
    if (code < 128) return code === 95 || (code >= 48 && code <= 57)
      || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    // Lazily ask the Unicode parser only at a non-ASCII match boundary.
    // Graphemes keep combining marks and supplementary letters together.
    graphemes ??= GRAPHEME_SEGMENTER.segment(content);
    const grapheme = graphemes.containing(index)!.segment;
    const known = classes.get(grapheme);
    if (known !== undefined) return known;
    let word = false;
    for (const part of WORD_SEGMENTER.segment(grapheme)) {
      if (part.isWordLike) { word = true; break; }
    }
    classes.set(grapheme, word);
    return word;
  }
  const isBoundary = (index: number): boolean => isWordAt(index - 1) !== isWordAt(index);
  return (term: string): boolean => {
    for (let index = content.indexOf(term); index >= 0; index = content.indexOf(term, index + 1)) {
      if (isBoundary(index) && isBoundary(index + term.length)) return true;
    }
    return false;
  };
}

/**
 * Search auto-memory files for content matching any of the given queries.
 *
 * When `adapter` is provided, the per-platform conventions are used:
 *   1. Project-level: <projectDir>/<each instructionFile>
 *   2. User-level: <configDir>/<each instructionFile>
 *   3. Memory dir: <memoryDir>/*.md
 *
 * Without an adapter (legacy callers), defaults to Claude conventions
 * (CLAUDE.md + ~/.claude/memory) for backwards compatibility.
 *
 * @param queries  Array of search terms
 * @param limit    Max results to return
 * @param projectDir  Project directory path
 * @param configDir   Explicit config dir override (legacy callers)
 * @param adapter     Platform adapter — supplies instruction files + memory dir
 * @returns Matching auto-memory results
 */
export function searchAutoMemory(
  queries: string[],
  limit: number = 5,
  projectDir?: string,
  configDir?: string,
  adapter?: AutoMemoryAdapter,
): AutoMemoryResult[] {
  const results: AutoMemoryResult[] = [];

  // Resolve conventions — adapter wins over explicit configDir, which wins
  // over the historical Claude defaults.
  const instructionFiles = adapter?.getInstructionFiles() ?? ["CLAUDE.md"];
  const adapterConfigDir = adapter?.getConfigDir();
  // Issue #460 round-3: legacy fallback honors $CLAUDE_CONFIG_DIR via the
  // canonical util so callers without an adapter still respect relocated
  // CC config trees (and empty/whitespace env doesn't poison the path).
  const adapterRelative = adapterConfigDir ? resolveAgainst(projectDir, adapterConfigDir) : null;
  const effectiveConfigDir = adapterRelative ?? configDir ?? resolveClaudeConfigDir();
  // Issue #663: scope memory dir by projectDir so parallel projects can't
  // read each other's auto-memory. Adapter-aware path delegates the
  // scoping to the adapter; legacy adapterless fallback applies the same
  // hash directly so the contract holds at both call sites.
  const adapterMemoryDir = adapter?.getMemoryDir(projectDir);
  const fallbackMemoryBase = join(effectiveConfigDir, "memory");
  const fallbackMemoryDir = projectDir
    ? join(fallbackMemoryBase, hashProjectDirCanonical(projectDir))
    : fallbackMemoryBase;
  const memoryDir = adapterMemoryDir
    ? resolveAgainst(projectDir, adapterMemoryDir)
    : fallbackMemoryDir;

  // Collect candidate files
  const candidates: Array<{ path: string; label: string }> = [];

  // 1. Project-level instruction files
  if (projectDir) {
    for (const fileName of instructionFiles) {
      const p = join(projectDir, fileName);
      if (existsSync(p)) {
        candidates.push({ path: p, label: `project/${fileName}` });
      }
    }
  }

  // 2. User-level instruction files (skip when configDir resolves to the
  //    project root — already covered by step 1, would emit dup labels).
  if (effectiveConfigDir && effectiveConfigDir !== projectDir) {
    for (const fileName of instructionFiles) {
      const p = join(effectiveConfigDir, fileName);
      if (existsSync(p)) {
        candidates.push({ path: p, label: `user/${fileName}` });
      }
    }
  }

  // 3. Memory directory
  if (memoryDir && existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        candidates.push({
          path: join(memoryDir, file),
          label: `memory/${file}`,
        });
      }
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] auto-memory dir scan failed: ${e}\n`);
    }
  }

  // Search each candidate file for matching queries
  for (const candidate of candidates) {
    if (results.length >= limit) break;

    try {
      // Single stat for both size guard and timestamp — saves one syscall
      // per candidate file. Cross-platform: statSync semantics identical
      // on macOS / Linux / Windows; size+mtime read in the same inode probe.
      let stat;
      try {
        stat = statSync(candidate.path);
        if (stat.size > 1_000_000) continue;
      } catch { continue; }
      const content = readFileSync(candidate.path, "utf-8");
      const contentLower = content.toLowerCase();
      const matchesTerm = createTermMatcher(contentLower);

      for (const query of queries) {
        if (results.length >= limit) break;

        const queryLower = query.toLowerCase();
        // Split query into terms, match if any term is found
        const terms = queryTerms(queryLower);
        const matched = terms.some(matchesTerm);

        if (matched) {
          // Extract a relevant section around the first match
          const firstTermIdx = terms.reduce((best, term) => {
            const idx = contentLower.indexOf(term);
            return idx >= 0 && (best < 0 || idx < best) ? idx : best;
          }, -1);

          let start = Math.max(0, firstTermIdx - 200);
          let end = Math.min(content.length, firstTermIdx + 500);
          const prevBlank = content.lastIndexOf("\n\n", start);
          const nextBlank = content.indexOf("\n\n", end);
          if (prevBlank >= 0) start = prevBlank + 2;
          if (nextBlank >= 0) end = nextBlank;
          const snippet = content.slice(start, end).trim();

          results.push({
            title: `[auto-memory] ${candidate.label}`,
            content: snippet,
            source: candidate.label,
            origin: "auto-memory",
            timestamp: stat.mtime.toISOString(),
          });
          break; // one result per file per query batch
        }
      }
    } catch (e) {
      if (DEBUG) process.stderr.write(`[ctx] auto-memory file read failed: ${e}\n`);
    }
  }

  return results.slice(0, limit);
}

/**
 * Resolve a possibly-relative path (e.g. ".github", "memory") against a
 * project directory. Absolute paths and empty strings are returned as-is
 * (empty == "use projectDir directly").
 */
function resolveAgainst(projectDir: string | undefined, p: string): string {
  if (!p) return projectDir ?? "";
  if (isAbsolute(p)) return p;
  if (!projectDir) return p;
  return join(projectDir, p);
}
