// impl/00 §4 indexText, kept apart from tools/index.ts so the hook and run.mjs bundles do not load
// ctx_index's fetch path (node:http) or zod at startup (GS6 hook budget; DEVIATIONS D-M3-R-1).
import type { Chunk, DbHandle, ProjectContext, SourceKind } from "../contracts/types.ts";
import { ftsInsert } from "../store/fts.ts";
import { chunkText } from "./chunk.ts";

export type ChunkKind = "md" | "html" | "text";

/**
 * Chunk `text` and store it as one source of `sourceKind`. `chunks`, when given, must be
 * chunkText(text, kind); the hook passes the chunks it already made so the text is chunked once
 * (DEVIATIONS D-M7-FT-2).
 */
export function storeText(db: DbHandle, project: ProjectContext, sessionId: string, sourceKind: SourceKind, label: string, text: string, kind: ChunkKind, chunks: Chunk[] = chunkText(text, kind)): { sourceId: number; chunks: number } {
  const sourceId = ftsInsert(db, {
    projectKey: project.projectKey,
    sessionId,
    worktree: project.worktree,
    agent: project.agent,
    kind: sourceKind,
    label,
    bytes: Buffer.byteLength(text, "utf8"),
    chunkCount: chunks.length,
    createdAt: Date.now(),
  }, chunks);
  return { sourceId, chunks: chunks.length };
}

/** impl/00 §4: chunk `text` and store it as one `content` source; the hook and tools-exec path. */
export function indexText(db: DbHandle, ctx: ProjectContext, sessionId: string, source: string, text: string, kind: ChunkKind, chunks?: Chunk[]): { sourceId: number; chunks: number } {
  return storeText(db, ctx, sessionId, "content", source, text, kind, chunks);
}
