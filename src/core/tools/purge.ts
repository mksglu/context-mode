// impl/06 §6, ADR-0017 R5, PRD §4/§8; DEVIATIONS D-M4-arch-3 (handler shape (input, ctx)), D-M4-S4-1
// (source scope matches `sources.label`). ctx_purge: exactly one scope of session/source/project,
// deleted inside one withWrite (BEGIN IMMEDIATE) on this project's own context.db only.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod/v4";
import {
  PURGE_BUSY_LINE,
  PURGE_MANY_SCOPES_LINE,
  PURGE_NO_SCOPE_LINE,
  PURGE_SCOPES,
  PURGE_SUMMARY,
  SQLITE_BUSY_CODE,
  SQLITE_PRIMARY_CODE_MASK,
} from "../contracts/constants.ts";
import type { CtxPurgeInput, DbHandle, ToolContext, ToolReply } from "../contracts/types.ts";
import { closeDb, openDb, withWrite } from "../store/db.ts";
import { deleteChunkRows, pickSource } from "../store/fts.ts";
import { unknownField } from "./search.ts";

export type { CtxPurgeInput } from "../contracts/types.ts";

type PurgeScope = (typeof PURGE_SCOPES)[number];

export const ctxPurgeSchema = z.object({
  session: z.string().optional(),
  source: z.string().optional(),
  project: z.boolean().optional(),
}, { error: unknownField }).strict();

function reply(text: string, isError: boolean): ToolReply {
  return { text, isError, sandboxBytes: 0 };
}

// Step 1: a scope is set when its field is present; `project: false` asks for no project purge.
function scopesOf(input: CtxPurgeInput): PurgeScope[] {
  const set: Record<PurgeScope, boolean> = {
    session: input.session !== undefined,
    source: input.source !== undefined,
    project: input.project === true,
  };
  return PURGE_SCOPES.filter((s) => set[s]);
}

function changes(raw: DatabaseSync, sql: string, ...args: string[]): number {
  return Number(raw.prepare(sql).run(...args).changes);
}

// Steps 3-5: the rows deleted for one scope, summed across the tables it touches.
function purgeScope(db: DbHandle, scope: PurgeScope, input: CtxPurgeInput): number {
  const raw = db.raw;
  if (scope === "session") return changes(raw, "DELETE FROM events WHERE session_id = ?", input.session as string);
  if (scope === "source") {
    // D-PATH-LABEL-1: a path label is named by either slash form. D-LABEL-HANDLE-1/2: a stored label wins, then
    // a source's handle (so a long label is purged by its short handle); no "#" suffix match for a delete.
    const label = pickSource(db, input.source as string, false).label;
    return deleteChunkRows(raw, { label }) + changes(raw, "DELETE FROM sources WHERE label = ?", label);
  }
  const chunks = deleteChunkRows(raw, "all");
  return changes(raw, "DELETE FROM events") + chunks + changes(raw, "DELETE FROM sources");
}

// PRD §4: SQLITE_BUSY past the node:sqlite timeout is the busy line; no added retry loop.
function isBusy(err: unknown): boolean {
  const code = (err as { errcode?: unknown } | null)?.errcode;
  return typeof code === "number" && (code & SQLITE_PRIMARY_CODE_MASK) === SQLITE_BUSY_CODE;
}

async function handler(input: CtxPurgeInput, ctx: ToolContext): Promise<ToolReply> {
  const scopes = scopesOf(input);
  if (scopes.length === 0) return reply(PURGE_NO_SCOPE_LINE, true);
  if (scopes.length > 1) return reply(PURGE_MANY_SCOPES_LINE, true);
  const scope = scopes[0];
  try {
    const db = await openDb(ctx.project);
    try {
      // Steps 2 and 6: one BEGIN IMMEDIATE; withWrite commits or rolls back.
      const rows = withWrite(db, (h) => purgeScope(h, scope, input));
      return reply(PURGE_SUMMARY(rows, scope), false); // steps 7-8
    } finally {
      closeDb(db);
    }
  } catch (err) {
    if (isBusy(err)) return reply(PURGE_BUSY_LINE, true);
    throw err;
  }
}

export const ctxPurge = Object.freeze({
  name: "ctx_purge",
  description: "",
  schema: ctxPurgeSchema,
  readOnly: false,
  alwaysLoad: false,
  handler,
});
