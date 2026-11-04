// impl/06 §4, PRD §8/§11, ADR-0009 §0/§4, DECISIONS-r6 D6, DECISIONS-r9 V21; DEVIATIONS D-M4-arch-2
// (renderState(rows, turn) over readSessionEvents rows), D-M4-arch-3 (handler (input, ctx), session from
// ctx.sessionId), D-M4-S2-1 (the seq read returns the whole body). ctx_resume: one read-only open of this
// project's own context.db; it writes nothing (the server writes the one journal row per call).
import { z } from "zod/v4";
import {
  MAX_CANDIDATES,
  RECALL_UNIT_CANDIDATES,
  RESUME_CAP,
  RESUME_EMPTY_LINE,
  RESUME_NO_ROW_LINE,
  RESUME_NO_SESSION_LINE,
  RESUME_UNKNOWN_FIELD_LINE,
} from "../contracts/constants.ts";
import type { CtxResumeInput, ToolContext, ToolReply } from "../contracts/types.ts";
import { renderState } from "../compaction/render.ts";
import { readEventBySeq, readFirstPrompt, readLastPrompt, readSessionEvents } from "../journal/read.ts";
import { listSessionSources, queryUnits, recallQueryText, sourceHandle } from "../store/fts.ts";
import { closeDb, openDb } from "../store/db.ts";

export type { CtxResumeInput } from "../contracts/types.ts";

// Step 1: only session and seq; any other key is the exact unknown-field line.
export const ctxResumeSchema = z.object({
  session: z.string().optional(),
  seq: z.number().int().positive().optional(),
}, {
  error: (issue: z.core.$ZodRawIssue) => (issue.code === "unrecognized_keys" ? RESUME_UNKNOWN_FIELD_LINE : undefined),
}).strict();

function reply(text: string, isError: boolean): ToolReply {
  return { text, isError, sandboxBytes: 0 };
}

async function handler(input: CtxResumeInput, ctx: ToolContext): Promise<ToolReply> {
  // Step 2: the server already resolved _meta.sessionId or "mcp:<serverId>" (D-M4-arch-3).
  const sessionId = input.session ?? ctx.sessionId;
  if (sessionId === "") return reply(RESUME_NO_SESSION_LINE, true);

  const db = await openDb(ctx.project, { readOnly: true }); // step 3
  try {
    // Step 4: primary-key pointer read of the whole row (ADR-0009 §4); a row of another session is
    // "no row" for this one. The body is returned whole, never cut (D-M4-S2-1).
    if (input.seq !== undefined) {
      const row = readEventBySeq(db, input.seq);
      if (row === null || row.session_id !== sessionId) return reply(RESUME_NO_ROW_LINE(input.seq), true);
      return reply(row.body, false);
    }
    // Steps 5-9 (DECISIONS-r6 D6): the on-demand state block. readSessionEvents gives this session's rows
    // in seq order, so the last row is upToSeq and its turn is the current turn (D-M4-arch-2).
    const rows = readSessionEvents(db, sessionId);
    const newest = rows.at(-1);
    if (newest === undefined) return reply(RESUME_EMPTY_LINE, false);
    // D-CR3-RESUME-1: stored sources by short id, and the line units the post-compact recall query ranks
    // (last prompt + session goal, one ranked query), labelled by short id.
    const sources = listSessionSources(db, sessionId, MAX_CANDIDATES)
      .map((r) => "source " + sourceHandle(r.id) + ": " + r.label + " (" + r.bytes + " B)");
    const goal = readFirstPrompt(db, sessionId);
    const last = readLastPrompt(db, sessionId);
    const units = queryUnits(db, sessionId, recallQueryText(last, goal), RECALL_UNIT_CANDIDATES)
      .map((u) => ({ ...u, label: sourceHandle(u.sourceId) }));
    const block = renderState(rows, newest.turn, { sources, units });
    // V21: renderState selects whole lines within STATE_BUDGET (= RESUME_CAP), so this never cuts;
    // a block over the cap is a render bug, surfaced, not hidden.
    if (Buffer.byteLength(block, "utf8") > RESUME_CAP) throw new Error("ctx_resume: state block over RESUME_CAP (render bug).");
    return reply(block, false); // step 11: the block's first line is the summary line
  } finally {
    closeDb(db); // step 10
  }
}

export const ctxResume = Object.freeze({
  name: "ctx_resume",
  schema: ctxResumeSchema,
  readOnly: true,
  alwaysLoad: false,
  handler,
});
