// impl/04 §3 (ctx_batch), A13-A16; PRD §8 ("queries search the whole session scope; an identical
// chunk returned twice inside one batch call is deduped"); DECISIONS-r3 Q8 (one timeout bounds the
// whole handler, batch included: #947); TECH-SPEC §5 runPool row (#915, #932); DEVIATIONS D-M2-2
// (journal facts), D-M2-4 (no run-wrapper in M2), D-M2-6 (whole chunks, capBytes is a final bound),
// D-M2-T11-1, D-M2-R4-1 (ingest byte budget, #961).
import { z } from "zod/v4";
import {
  CANCELLED_LINE, ECHO_MAX_BYTES, EXEC_TIMEOUT_MS, INDEX_WRITE_CHUNK, OUTPUT_CAP, RETENTION_SIZE_CAP_BYTES, SEARCH_PAGE_SIZE,
} from "../contracts/constants.ts";
import { CtxError, formatError } from "../contracts/errors.ts";
import type { BatchInput, Chunk, DbHandle, ToolContext, ToolReply } from "../contracts/types.ts";
import { chunkText } from "../index/chunk.ts";
import { canonicalKey } from "../journal/append.ts";
import { capBytes } from "../sandbox/cap.ts";
import { buildChildEnv } from "../sandbox/env.ts";
import { findRuntime, noRuntimeError } from "../sandbox/runtimes.ts";
import { runProcess } from "../sandbox/spawn.ts";
import { closeDb, openDb } from "../store/db.ts";
import { ftsInsert, ftsQuery } from "../store/fts.ts";
import { unknownField } from "./search.ts";

export type { BatchInput } from "../contracts/types.ts";

// §3.1.
export const ctxBatchSchema = z.object({
  commands: z.array(z.string().min(1)).min(1),
  queries: z.array(z.string().min(1)).min(1),
}, { error: unknownField }).strict(); // 00 §5.2 step 1: the SDK validates first, so the text lives on the schema

const TOOL = "ctx_batch";
const LABEL_PREFIX = TOOL + ":"; // §3.3 step 5: label = "ctx_batch:" + turn
const SHELL = "shell";
const SHELL_INLINE_FLAG = "-c";
const MARKER = "$ "; // §3.3 step 4: one "$ <command>" line heads each block
const BLOCK_SEP = "\n\n"; // a blank line: a "text" chunk never spans two command blocks
const LINE_SEP = "\n";
// A13: commands run one at a time, in array order. A design fact of this tool, not a tunable.
const ONE_AT_A_TIME = 1;

// ---- runPool (TECH-SPEC §5: capped === (jobs >= concurrency); #915, #932) ----

export interface PoolResult<T> {
  /** Results of the jobs that ran, in input order; a job after a stop never starts. */
  results: T[];
  /** True only when the jobs filled every worker slot. Fewer jobs than slots: false. */
  capped: boolean;
}

/** At most `concurrency` jobs in flight; once `stop(result)` is true, no further job starts. */
export async function runPool<T>(
  jobs: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
  stop: (result: T) => boolean,
): Promise<PoolResult<T>> {
  const results: T[] = [];
  let next = 0;
  let stopped = false;
  const worker = async (): Promise<void> => {
    while (!stopped && next < jobs.length) {
      const i = next;
      next += 1;
      const r = await jobs[i]();
      results[i] = r;
      if (stop(r)) stopped = true;
    }
  };
  const width = Math.min(concurrency, jobs.length);
  await Promise.all(Array.from({ length: width }, worker));
  return { results, capped: jobs.length >= concurrency };
}

// ---- steps 2-4, 11: run the commands ----

interface CmdOut { head: string; block: string; exitCode: number | null; bytes: number; error: string | null; }

function headOf(cmd: string): string {
  return MARKER + cmd + LINE_SEP;
}

function stoppedAt(cmd: string, error: string): CmdOut {
  return { head: headOf(cmd), block: headOf(cmd) + error, exitCode: null, bytes: 0, error };
}

async function runCommand(cmd: string, shell: string | null, ctx: ToolContext, deadline: number, boundMs: number): Promise<CmdOut> {
  if (shell === null) return stoppedAt(cmd, noRuntimeError(SHELL).toLine());
  const left = deadline - Date.now();
  if (left <= 0) return stoppedAt(cmd, formatError("TIMEOUT", { ms: boundMs }));
  const r = await runProcess([shell, SHELL_INLINE_FLAG, cmd], {
    cwd: ctx.project.worktree,
    env: buildChildEnv(process.env),
    signal: ctx.signal,
    timeoutMs: left,
  });
  if (r.killed === "timeout") return stoppedAt(cmd, formatError("TIMEOUT", { ms: boundMs }));
  if (r.killed === "cancel") return stoppedAt(cmd, CANCELLED_LINE);
  if (r.exitCode === null && r.stdout.length === 0 && r.stderr.length === 0) {
    return stoppedAt(cmd, formatError("SPAWN_FAILED", { detail: shell }));
  }
  // impl/04 §2.3 step 12: stderr only on a non-zero exit.
  const withErr = r.exitCode !== 0;
  const out = r.stdout.toString("utf8") + (withErr ? r.stderr.toString("utf8") : "");
  return { head: headOf(cmd), block: headOf(cmd) + out, exitCode: r.exitCode, bytes: r.stdout.length + (withErr ? r.stderr.length : 0), error: null };
}

// ---- step 5: index, in INDEX_WRITE_CHUNK groups with the deadline checked before each group ----

/** Why indexing stopped before the end: the Q8 deadline (or a cancel), or the ingest byte budget. */
type IndexStop = "deadline" | "budget" | null;
interface Indexed { bodies: Map<string, string>; indexed: number; total: number; stop: IndexStop; }

function chunkKey(sourceId: number, ord: number): string {
  return sourceId + ":" + ord;
}

// D-M2-T11-1: the "$ <command>" marker is indexed (command-aligned, searchable) but the reply
// shows a block's first chunk without it (Q19: no code echo in replies). Heads are matched in
// array order against the chunks in ord order, so each marker is dropped at most once.
function shown(chunks: Chunk[], heads: string[]): string[] {
  let k = 0;
  return chunks.map((c) => {
    if (k < heads.length && c.text.startsWith(heads[k])) {
      const body = c.text.slice(heads[k].length);
      k += 1;
      return body;
    }
    return c.text;
  });
}

// D-M2-R4-1 (#961): one call ingests at most `budgetBytes` (the tool passes RETENTION_SIZE_CAP_BYTES).
// Whole chunks only, in output order: the first chunk that would pass the budget ends the ingest and
// the reply says how many bytes were indexed. No chunk is cut.
function indexCombined(db: DbHandle, ctx: ToolContext, label: string, ran: CmdOut[], deadline: number, budgetBytes: number): Indexed {
  const chunks = chunkText(ran.map((r) => r.block).join(BLOCK_SEP), "text");
  const display = shown(chunks, ran.map((r) => r.head));
  const bodies = new Map<string, string>();
  let total = 0;
  for (const c of chunks) total += c.bytes;
  let indexed = 0;
  let queued = 0;
  let group: Chunk[] = [];
  let groupBytes = 0;
  const flush = (): boolean => {
    if (group.length === 0) return true;
    // D-M2-T11-1: the first group is always written, so a timed-out batch still indexes what ran
    // (A14); every later group needs time left (Q8). Overrun: at most one INDEX_WRITE_CHUNK write.
    if (ctx.signal.aborted || (indexed > 0 && Date.now() >= deadline)) return false;
    const id = ftsInsert(db, {
      projectKey: ctx.project.projectKey,
      sessionId: ctx.sessionId,
      worktree: ctx.project.worktree,
      agent: ctx.project.agent,
      kind: "content",
      label,
      bytes: groupBytes,
      chunkCount: group.length,
      createdAt: Date.now(),
    }, group);
    for (const c of group) bodies.set(chunkKey(id, c.ord), display[c.ord]);
    indexed += groupBytes;
    group = [];
    groupBytes = 0;
    return true;
  };
  for (const c of chunks) {
    if (queued + c.bytes > budgetBytes) {
      const stop: IndexStop = flush() ? "budget" : "deadline"; // flush first: it adds to `indexed`
      return { bodies, indexed, total, stop };
    }
    if (group.length > 0 && groupBytes + c.bytes > INDEX_WRITE_CHUNK && !flush()) return { bodies, indexed, total, stop: "deadline" };
    group.push(c);
    groupBytes += c.bytes;
    queued += c.bytes;
  }
  const stop: IndexStop = flush() ? null : "deadline";
  return { bodies, indexed, total, stop };
}

// ---- steps 6-8: answer each query inside its share ----

function bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

// Each query is one LIMIT SEARCH_PAGE_SIZE lookup, a fixed cost, so the queries run after a timeout
// too and show what ran (D-M2-T11-1); only a cancel stops them.
function answer(db: DbHandle, ctx: ToolContext, label: string, queries: string[], share: number, own: Map<string, string>): string[] {
  const seen = new Set<string>(); // step 7: a (sourceId, ord) already shown is not shown again
  const lines: string[] = [];
  for (const [qi, q] of queries.entries()) {
    if (ctx.signal.aborted) break;
    // Step 6, A15: this call's own label first; the whole session scope only when that is empty.
    let hits = ftsQuery(db, q, "session", ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, 0, label);
    if (hits.length === 0) hits = ftsQuery(db, q, "session", ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, 0);
    const head = "## " + (bytes(q) > ECHO_MAX_BYTES ? "query " + (qi + 1) : q); // D-NO-LOSSY-CUT-2: a long query is named by position
    let used = bytes(head) + 1;
    const body: string[] = [];
    for (const h of hits) {
      const key = chunkKey(h.sourceId, h.ord);
      if (seen.has(key)) continue;
      // Own chunks are shown whole; a session hit from another source is the store's snippet.
      const text = own.get(key) ?? h.snippet;
      if (text === "") { seen.add(key); continue; } // a block with no output: its marker only
      const cost = bytes(text) + 1;
      if (used + cost > share) continue; // A16 + ADR-0009 §4: skip it, a smaller chunk may still fit
      seen.add(key);
      body.push(text);
      used += cost;
    }
    if (hits.length === 0) body.push("No hits.");
    else if (body.length === 0) body.push("No new section.");
    lines.push(head, ...body);
  }
  return lines;
}

// ---- handler ----

/**
 * §3.3 with the whole-handler bound and the ingest byte budget as parameters; the tool handler
 * passes EXEC_TIMEOUT_MS and RETENTION_SIZE_CAP_BYTES (D-M2-R4-1).
 */
export async function runBatch(input: unknown, ctx: ToolContext, boundMs: number, budgetBytes: number): Promise<ToolReply> {
  // Step 1.
  const parsed = ctxBatchSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const text = issue.code === "unrecognized_keys" ? formatError("UNKNOWN_FIELD", { f: issue.keys[0] }) : issue.message;
    return { text, isError: true, sandboxBytes: 0 };
  }
  const { commands, queries }: BatchInput = parsed.data;
  // Step 2 (Q8): one deadline for exec, index and search.
  const deadline = Date.now() + boundMs;
  const shell = findRuntime(SHELL);
  const pool = await runPool(commands.map((c) => () => runCommand(c, shell, ctx, deadline, boundMs)), ONE_AT_A_TIME, (r) => r.error !== null);
  const ran = pool.results;
  const last = ran[ran.length - 1];
  const sandboxBytes = ran.reduce((n, r) => n + r.bytes, 0);
  const label = LABEL_PREFIX + ctx.turn;

  try {
    const db = await openDb(ctx.project);
    let sections: string[];
    let idx: Indexed;
    const summary = commands.length + " command(s), " + queries.length + " querie(s), exit " + last.exitCode; // step 9
    // Step 8 template, `[...]` kept as written (D-M2-T11-1): the caller holds its queries.
    const footer = "more: ctx_search({queries:[...], source:" + JSON.stringify(label) + "})";
    let notice: string | null;
    try {
      // Steps 3-5: what ran is indexed, a stopped command's block carries its error line.
      idx = indexCombined(db, ctx, label, ran, deadline, budgetBytes);
      const stop = last.error;
      const cut = idx.indexed < idx.total ? "Indexed " + idx.indexed + " of " + idx.total + " B." : null;
      const timeout = formatError("TIMEOUT", { ms: boundMs });
      // The cause in front of the cut line: a stopped command, else a cancel, else what ended the ingest.
      const cause = stop ?? (ctx.signal.aborted ? CANCELLED_LINE : idx.stop === "deadline" ? timeout : null);
      notice = cut === null ? stop : cause === null ? cut : cause + " " + cut;
      const fixed = bytes(summary) + 1 + (notice === null ? 0 : bytes(notice) + 1) + bytes(footer);
      const share = Math.floor((OUTPUT_CAP - fixed) / queries.length);
      sections = answer(db, ctx, label, queries, share, idx.bodies);
    } finally {
      closeDb(db);
    }
    const lines = [summary, ...(notice === null ? [] : [notice]), ...sections, footer];
    return {
      text: capBytes(lines.join(LINE_SEP), OUTPUT_CAP).text, // step 10: final bound (D-M2-6)
      isError: false, // step 11
      sandboxBytes,
      journal: { kind: "cmd", key: canonicalKey(TOOL, commands.join(LINE_SEP)), path: null, exit_code: last.exitCode },
    };
  } catch (err) {
    if (err instanceof CtxError) return { text: err.toLine(), isError: true, sandboxBytes };
    throw err;
  }
}

export const ctxBatch = Object.freeze({
  name: TOOL,
  schema: ctxBatchSchema,
  readOnly: false, // A12
  alwaysLoad: false,
  handler: (input: BatchInput, ctx: ToolContext): Promise<ToolReply> => runBatch(input, ctx, EXEC_TIMEOUT_MS, RETENTION_SIZE_CAP_BYTES),
});
