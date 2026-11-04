// src/core/journal/own-call.ts
// D-HF-INPROC-JOURNAL-1 (OPEN-ITEMS H6): the in-process entries (opencode plugin, pi extension) run ctx_* tools
// without the MCP server, so they write the server's per-call row themselves (impl/00 §5.2 step 5, ADR-0009 §0).
// One DB handle per project per entry instance; a failed open leaves no entry, so the next call opens again.
import type { DbHandle, ProjectContext, ToolContext, ToolReply } from "../contracts/types.ts";
import { openDb } from "../store/db.ts";
import { appendEvent, ownCallRow } from "./append.ts";

export type OwnJournal = (project: ProjectContext, ctx: ToolContext, name: string, reply: ToolReply) => Promise<void>;

export function ownJournal(): OwnJournal {
  const handles = new Map<string, Promise<DbHandle>>();
  return async (project, ctx, name, reply) => {
    let opening = handles.get(project.dbPath);
    if (opening === undefined) {
      opening = openDb(project);
      handles.set(project.dbPath, opening);
      opening.catch(() => handles.delete(project.dbPath));
    }
    try {
      appendEvent(await opening, ownCallRow(project, ctx, name, reply));
    } catch (err) {
      // The reply already reached the host; a lost row is reported, never turned into a tool failure.
      process.stderr.write("context-mode: no journal row: " + (err instanceof Error ? err.message : String(err)) + "\n");
    }
  };
}
