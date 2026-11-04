// DEVIATIONS D-M2-3, D-M2-T9-1, D-UNIFIED-MEMORY-1; DECISIONS-r9 M14 (auto-memory = the host's own memory files for this
// project), M16 (timestamp = file mtime), M17 (no seq).
// Returns the rows ftsQueryTimeline merges as its `memory` argument and the chunks a relevance query ranks
// (memoryHits); the store never sees a host path and user memory files are never written to context.db.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Hit, ProjectContext, TimelineRow } from "../contracts/types.ts";
import { isInside } from "../project/contain.ts";
import { rankTexts, highlight } from "../store/fts.ts";
import { MEMORY_LABEL_PREFIX, SNIPPET_MAX_BYTES } from "../contracts/constants.ts";
import { chunkText } from "./chunk.ts";

// Project memory / instruction files per host, relative to the worktree root (format facts of the hosts, not
// tunables; same rule as `.gitignore` in walk.ts, D-M2-T6-2). Every agent reads all of them (owner, D-UNIFIED-MEMORY-1).
// Sources: CLAUDE.md, CLAUDE.local.md, .claude/CLAUDE.md = Claude Code; AGENTS.md = Codex, OpenCode, Pi;
// GEMINI.md = Gemini CLI; QWEN.md = Qwen Code (src/setup/registry.ts INSTRUCTION_FILES);
// .github/copilot-instructions.md = Copilot CLI, VS Code (docs/architecture/PRD-setup.md prompt-file list);
// .kiro/steering/*.md = Kiro (src/core/contracts/constants.ts V1_REASON.kiroSteering). Order = the order rows are returned.
const MEMORY_FILES: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(["CLAUDE.md"]),
  Object.freeze(["CLAUDE.local.md"]),
  Object.freeze([".claude", "CLAUDE.md"]),
  Object.freeze(["AGENTS.md"]),
  Object.freeze(["GEMINI.md"]),
  Object.freeze(["QWEN.md"]),
  Object.freeze([".github", "copilot-instructions.md"]),
]);
const KIRO_STEERING: readonly string[] = Object.freeze([".kiro", "steering"]);
const MD = ".md";

function steeringFiles(worktree: string): (readonly string[])[] {
  try {
    return readdirSync(join(worktree, ...KIRO_STEERING))
      .filter((n) => n.endsWith(MD))
      .sort()
      .map((n) => [...KIRO_STEERING, n]);
  } catch {
    return [];
  }
}

/**
 * One row per memory file inside this worktree, for every agent (D-UNIFIED-MEMORY-1).
 * A file that is missing, unreadable, or whose realpath leaves the worktree gives no row; this
 * function never throws.
 */
export function readAutoMemory(project: Pick<ProjectContext, "agent" | "worktree">): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const segs of [...MEMORY_FILES, ...steeringFiles(project.worktree)]) {
    const path = join(project.worktree, ...segs);
    // isInside is false for a missing path and for a symlink that points out of the worktree.
    if (!isInside(project.worktree, path)) continue;
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      rows.push({
        origin: "memory",
        ts: Math.trunc(st.mtimeMs),
        seq: null,
        sourceId: null,
        path,
        label: segs.join("/"),
        text: readFileSync(path, "utf8"),
      });
    } catch {
      // Unreadable (permissions, removed between stat and read): no row for this file.
    }
  }
  return rows;
}

/**
 * D-MEMORY-SOURCE-1: the memory file a `source` value names: its label (either slash form) or the label as a hit shows
 * it ("memory AGENTS.md"). No such file -> null.
 */
export function memoryFileNamed(rows: readonly TimelineRow[], value: string): TimelineRow | null {
  const v = value.split("\\").join("/");
  return rows.find((r) => r.label === v || MEMORY_LABEL_PREFIX + r.label === v) ?? null;
}

/** A memory chunk, ready to rank. */
export interface MemoryChunk { fileNo: number; label: string; ord: number; text: string }

export function memoryChunks(rows: readonly TimelineRow[]): MemoryChunk[] {
  const out: MemoryChunk[] = [];
  rows.forEach((r, i) => {
    for (const c of chunkText(r.text, "md")) out.push({ fileNo: i + 1, label: r.label, ord: c.ord, text: c.text });
  });
  return out;
}

/**
 * D-UNIFIED-MEMORY-1: memory chunks that match `q`, best first, scored by the store's BM25 in a private in-memory
 * FTS. `full` = the chunk holds every query word. Memory hits have sourceId = -fileNo (never a content row id).
 */
export function memoryHits(chunks: readonly MemoryChunk[], q: string, limit: number): Hit[] {
  if (chunks.length === 0) return [];
  const texts = chunks.map((c) => c.text);
  const any = rankTexts(texts, q, "any");
  const all = rankTexts(texts, q, "all");
  return chunks
    .map((c, i) => ({ c, s: any[i], full: all[i] > 0 }))
    .filter((e) => e.s > 0)
    .sort((a, b) => Number(b.full) - Number(a.full) || b.s - a.s || a.c.fileNo - b.c.fileNo || a.c.ord - b.c.ord)
    .slice(0, limit)
    .map((e) => ({ sourceId: -e.c.fileNo, label: MEMORY_LABEL_PREFIX + e.c.label, ord: e.c.ord, snippet: highlight(e.c.text, q, SNIPPET_MAX_BYTES), score: e.s, full: e.full }));
}
