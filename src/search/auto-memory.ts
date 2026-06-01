/**
 * Auto-memory search — searches CLAUDE.md / AGENTS.md / GEMINI.md / etc.
 * and the platform's persistent memory directory for decisions,
 * preferences, and context from prior sessions.
 *
 * Returns results in a format compatible with the unified search pipeline.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute, dirname } from "node:path";
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
 * Slice B (#737): `projectDir` accepts `null` as an explicit "global" sentinel.
 * When `null`, ALL per-project memory hash subdirs under the base memory directory
 * are enumerated for cross-project recall without migration.
 *
 * @param queries  Array of search terms
 * @param limit    Max results to return
 * @param projectDir  Project directory path, or null for global recall
 * @param configDir   Explicit config dir override (legacy callers)
 * @param adapter     Platform adapter — supplies instruction files + memory dir
 * @returns Matching auto-memory results
 */
export function searchAutoMemory(
  queries: string[],
  limit: number = 5,
  projectDir?: string | null,
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
  const adapterRelative = adapterConfigDir ? resolveAgainst(projectDir ?? undefined, adapterConfigDir) : null;
  const effectiveConfigDir = adapterRelative ?? configDir ?? resolveClaudeConfigDir();
  // Issue #663: scope memory dir by projectDir so parallel projects can't
  // read each other's auto-memory. Adapter-aware path delegates the
  // scoping to the adapter; legacy adapterless fallback applies the same
  // hash directly so the contract holds at both call sites.
  // Slice B: null = global mode. Pass undefined to adapter to get the base dir.
  const adapterMemoryDir = adapter?.getMemoryDir(projectDir ?? undefined);
  const fallbackMemoryBase = join(effectiveConfigDir, "memory");
  const fallbackMemoryDir = projectDir
    ? join(fallbackMemoryBase, hashProjectDirCanonical(projectDir))
    : fallbackMemoryBase;
  const memoryDir = adapterMemoryDir
    ? resolveAgainst(projectDir ?? undefined, adapterMemoryDir)
    : fallbackMemoryDir;

  // Collect candidate files
  const candidates: Array<{ path: string; label: string }> = [];

  // 1. Project-level instruction files (skipped when projectDir is null/global)
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
  if (projectDir === null) {
    // Slice B (#737) global mode: enumerate ALL per-project hash subdirs.
    // Fallback: children of join(effectiveConfigDir, "memory").
    //
    // MAJOR 4 fix: adapter base-dir resolution. `adapter.getMemoryDir(undefined)`
    // may return EITHER:
    //   (a) the base memory dir itself (Codex `memories`, CONTEXT_MODE_DATA_DIR) — use as-is.
    //   (b) a project-hashed subdir `<base>/<16hex>` — we must use dirname(<resolved>).
    // Distinguish by checking whether the resolved basename is a 16-char hex string.
    const globalBases: string[] = [fallbackMemoryBase];
    if (adapterMemoryDir) {
      const resolved = resolveAgainst(undefined, adapterMemoryDir);
      const bname = resolved.split(/[\/\\]/).pop() ?? "";
      const isProjectHash = /^[0-9a-f]{16}$/.test(bname);
      const candidateBase = isProjectHash ? dirname(resolved) : resolved;
      if (candidateBase && candidateBase !== "." && candidateBase !== fallbackMemoryBase) {
        globalBases.push(candidateBase);
      }
    }
    for (const base of globalBases) {
      if (!existsSync(base)) continue;
      try {
        const entries = readdirSync(base, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const subDir = join(base, entry.name);
          try {
            const files = readdirSync(subDir).filter(f => f.endsWith(".md"));
            for (const file of files) {
              candidates.push({ path: join(subDir, file), label: `memory/${entry.name}/${file}` });
            }
          } catch (e) {
            if (DEBUG) process.stderr.write(`[ctx] auto-memory subdir scan failed: ${e}\n`);
          }
        }
      } catch (e) {
        if (DEBUG) process.stderr.write(`[ctx] auto-memory global scan failed: ${e}\n`);
      }
    }
  } else if (memoryDir && existsSync(memoryDir)) {
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

      for (const query of queries) {
        if (results.length >= limit) break;

        const queryLower = query.toLowerCase();
        // Split query into terms, match if any term is found
        const terms = queryLower.split(/\s+/).filter(t => t.length >= 3);
        const matched = terms.some(term => {
          try {
            return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i").test(content);
          } catch {
            return contentLower.includes(term); // fallback for invalid regex
          }
        });

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
