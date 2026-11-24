// impl/09 §4 (handleHook), ADR-0009 §1, §6 and §8.2, ADR-0016; DEVIATIONS D-M3-arch-3 (case-B wrapper
// next to the hook bundle), D-M3-H2-1..7, D-M4-arch-5 and D-M4-H2-1..3 (compact "none" branches, decision rows).
// One path per event. Every failure fails open: allow, one stderr line. Never block the host.
// D-CI-PERF-7: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { lstatSync, readFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { dirname, join, relative, resolve, sep } from "node:path";
import { AGENT_IDS, type AgentId } from "../contracts/agents.ts";
import {
  COMPACTED_META_PREFIX, COMPACT_POINTER_LINE, COMPACT_STATE_KEY, DECISION_OPTION_KEY, DECISION_SOURCE, DECISION_TOOL, EDIT_PATH_KEYS, EDIT_TOOLS, EXIT_CODE_LINE_PREFIX,
  OWN_TOOL_PREFIX, MCP_SERVER_TOOL_PREFIX, PLUGIN_CALL_ID_PREFIX, prefixToolNames, MAX_CHUNK_BYTES, REPLACE_CHUNK_BYTES, REPLACE_HANDLE_LINE, REPLACE_RETURN_BYTES, REPLACE_TRIGGER_BYTES, RANGE_READ_TOOLS, READ_PATH_KEYS, SKILL_LOAD_TOOLS, READ_RANGE_KEYS, SHAPE_RETURN_BYTES, PARSE_ERROR_DENY_LINE, PENDING_COMPACT_FLAG, PENDING_COMPACT_KEY,
  PENDING_COMPACT_META_PREFIX, POLICY_UNREADABLE_LINE, RECALL_KEY, RECALL_MAX_ROWS, RECALL_SEEN_META_PREFIX, RECALL_UNIT_CANDIDATES, RECALL_UNITS_SEEN_META_PREFIX, RESUME_HINT, RESUME_HINT_KEY, RUN_WRAPPER_FILE,
  RUN_WRAPPER_AGENT, RUN_WRAPPER_NODE, PERSISTED_FILE_LINE, SEARCH_TWIN_LINE, SEARCH_WRAPPER_FILE, SUBAGENT_HANDLE_LINE, ECHO_MAX_BYTES, SHELL_TOOL, SOURCE_LABEL_MAX_CHARS, SUBAGENT_SOURCE_PREFIX, SYNC_INDEX_MAX_BYTES, TOOL_PREFIX_SLOT,
  USER_DENY_REASON_PREFIX,
  SUBAGENT_RUN_DENY, WORKSPACE_FOLDER_FLAG, PROJECTS_DIR_NAME, CLAUDE_TOOL_RESULTS_DIR_NAME, PERSISTED_OUTPUT_MAX_BYTES,
} from "../contracts/constants.ts";
import type {
  AdapterRow, CanonicalHookEvent, Chunk, Decision, DbHandle, EventKind, HookOutput, ProjectContext, ToolCall, ToolResultInfo,
} from "../contracts/types.ts";
import { getAdapter, hasRecall, hasReplace } from "../../adapters/table.ts";
import { decide } from "../policy/decide.ts";
import { isOwnFile } from "../policy/own-file.ts";
import { isSubagentCall, pickSubagentCase, toolSetForAgentType, type ToolSetSources } from "../policy/subagent.ts";
import { readUserDeny } from "../policy/user-deny.ts";
import { resolveProject } from "../project/resolve.ts";
import { claudeDirOf, homeDirOf } from "../project/config-dir.ts";
import { isInside } from "../project/contain.ts";
import { metaGet, metaSet, metaTake } from "../store/db.ts";
import { canonicalKey } from "../journal/append.ts";
import { hasAgentRows, hasSessionRows, lastSessionSeq, readLastPrompt, readMaxSeq, readRecallRows, readSessionEvents } from "../journal/read.ts";
import { queryUnits, readMaxSourceId, recallQueryText, reserveSource, sourceHandle, type SourceDraft } from "../store/fts.ts";
import { renderState } from "../compaction/render.ts";
import { pickRecall } from "../compaction/recall.ts";
import { chunkText } from "../index/chunk.ts";
import { moreLine, selectChunksInMemory } from "../index/select.ts";
import { shapeDigest } from "../index/shape.ts";
import { appendDetached } from "./detached.ts";
import { hookDb, isBusy, readSeen, spool, writeDetached, writeOrSpool, type SpoolOp } from "./spool.ts";
import { askedWords } from "./handle-query.ts";
import { answerDecisions, askOptionLabels, optionEchoDecision, type DecisionPart } from "./decision.ts";
import { shouldHint } from "./throttle.ts";
import { CtxError } from "../contracts/errors.ts";
import { allowOutput, failureOutput, fault, logHookError, nodeTooOld } from "./fallback.ts";

export { failureOutput, logHookError } from "./fallback.ts"; // D-HNE-GUARD-1: the entry's last-resort catch
export { readStdin, writeOut } from "./io.ts"; // D-M7-HP-1: entry I/O without process.stdin/stdout streams

const ALLOW: Decision = { kind: "allow" };
const EMPTY: HookOutput = { stdout: "", exitCode: 0 };
const DIGIT_0 = 48;

function isAgentId(s: string): s is AgentId {
  return (AGENT_IDS as readonly string[]).includes(s);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** impl/09 §4.2. Never throws: decode, project and dispatch failures all end in this agent's allow shape. */
export async function handleHook(agent: AgentId, raw: unknown, env: NodeJS.ProcessEnv): Promise<HookOutput> {
  if (!isAgentId(agent)) {
    process.stderr.write("hooks: unknown agent " + JSON.stringify(agent) + "\n"); // step 1, A22, D-FU-PS-1
    return EMPTY;
  }
  const row = getAdapter(agent);
  // D-HNE-GUARD-1: every failure below ends in failureOutput (exit 0, this host's shape, tool table only) and a log line.
  const report = (stage: string, err: unknown, line?: string): void => {
    logHookError(env, agent, stage, err);
    process.stderr.write(line ?? "hooks: " + stage + " failed: " + message(err) + "\n");
  };
  const fail = (stage: string, err: unknown, line?: string): HookOutput => {
    report(stage, err, line);
    return failureOutput(agent, raw, err);
  };
  if (nodeTooOld(process.version)) {
    // D-1370-OLDNODE-ALLOW-1 (#1370): the MCP server runs on this same node and is degraded (PRD §13: ctx_doctor only), so a
    // redirect to ctx_execute would block the host. Allow, and keep the stderr and log lines (D5). An in-process host
    // (Pi, OMP, OpenCode) registers its ctx_* tools itself, so its redirect target exists and the D-HNE-GUARD-1 deny stays.
    const err = new CtxError("NODE_TOO_OLD", { v: process.version });
    if (row.installMode === "in-process") return fail("node", err);
    report("node", err);
    return allowOutput(agent);
  }
  let ev: CanonicalHookEvent;
  try {
    fault(env, "decode");
    ev = row.decode(raw);
  } catch (err) {
    return fail("decode", err); // step 2
  }
  // D-1323-CODEX-STOP-1: Stop has no project or store work; it gets this agent's allow reply before the project step.
  if (ev.event === "Stop") return row.encode(ev, ALLOW);
  let project: ProjectContext;
  try {
    fault(env, "project");
    // D-HA-PI-PROJECT-1: on pi the entry puts ctx.cwd into the payload, so ev.cwd is the pi:ctx.cwd source.
    // D-HF-VSCODE-PROJECT-1: a VS Code hook has no launch args; its workspace folder is the payload cwd.
    const argv = agent === "vscode" ? [WORKSPACE_FOLDER_FLAG, ev.cwd] : process.argv;
    project = resolveProject(agent, { env, argv, cwd: ev.cwd, piCwd: getAdapter(agent).projectSource === "pi:ctx.cwd" ? ev.cwd : undefined }); // step 3 (pi, omp: ADR-0026)
  } catch (err) {
    // D-FU-PS-1 keeps its one stderr line (code first); the decision part is new.
    return fail("project", err, "hooks: no project: " + String((err as { code?: unknown }).code ?? "ERROR") + " " + message(err) + "\n"); // D-HNE-GUARD-1 supersedes D-FU-PS-1: a flooding call is denied, the rest allowed
  }
  let decision: Decision;
  const settle: Settle = {};
  try {
    fault(env, "policy");
    decision = await dispatch(ev, row, project, env, settle); // step 4
  } catch (err) {
    return fail("store", err);
  }
  try {
    fault(env, "encode");
    const out = row.encode(ev, decision); // step 6
    settle.run?.(true);
    return out;
  } catch (err) {
    settle.run?.(false); // D-STATS-RET-3: the host gets the failure output, the whole tool output
    return fail("encode", err);
  }
}

/** D-STATS-RET-3: PostToolUse leaves its journal write here; handleHook runs it once the encode stage is known. */
interface Settle { run?: (encoded: boolean) => void }

function dispatch(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv, settle: Settle): Promise<Decision> {
  switch (ev.event) {
    case "SessionStart":
      return sessionStart(ev, row, project);
    case "UserPromptSubmit":
      return userPromptSubmit(ev, row, project);
    case "PreToolUse":
      return preToolUse(ev, row, project, env);
    case "PostToolUse":
      return postToolUse(ev, row, project, env, settle);
    case "PreCompact":
      return preCompact(ev, row, project);
    case "Usage":
      return usage(ev, project);
  }
  return Promise.resolve(ALLOW); // step 4 defensive default
}

function withPrefix(template: string, row: AdapterRow): string {
  return template.split(TOOL_PREFIX_SLOT).join(row.toolNamePrefix);
}

// ---------- §4.3 SessionStart ----------

// D6: "host" sends the fixed pointer line only; "none" sends the full renderState block (§4.3 step 1.3,
// §4.4 step 2.4). Rows are this session's journal, read once per compact delivery.
function compactText(db: DbHandle, ev: CanonicalHookEvent, row: AdapterRow): string {
  if (row.compactSummary === "host") return prefixToolNames(COMPACT_POINTER_LINE, row.toolNamePrefix);
  return renderState(readSessionEvents(db, ev.sessionId), ev.turn ?? 0, undefined, row.toolNamePrefix);
}

async function sessionStart(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext): Promise<Decision> {
  if (ev.source === "compact" && hasRecall(row)) markCompacted(await hookDb(project), ev.sessionId);
  if (ev.source === "compact" && row.compactDelivery === "sessionstart") {
    const db = await hookDb(project);
    // A23, #1396: the host sends one SessionStart(compact) per compaction with the same session id. The
    // marker key carries the newest journal seq, so each compaction gets its state block and a duplicate
    // delivery of the same compaction (no new row in between) stays silent.
    const onceKey = COMPACT_STATE_KEY + ":" + lastSessionSeq(db, ev.sessionId);
    if (!shouldHint(db, ev.sessionId, onceKey)) return ALLOW;
    return { kind: "hint", text: compactText(db, ev, row), onceKey };
  }
  const db = await hookDb(project);
  // impl/12 §4.6 step 2, D-M5-P2-4: the OpenCode plugin's one `context` call per session reads and clears
  // the pending-compact marker here (handleHook is the one DB path); its stdout is the cache-stable payload.
  if (row.compactDelivery === "opencode-cache" && metaTake(db, PENDING_COMPACT_META_PREFIX + ev.sessionId) !== null) {
    return { kind: "hint", text: compactText(db, ev, row), onceKey: PENDING_COMPACT_KEY };
  }
  if (!shouldHint(db, ev.sessionId, RESUME_HINT_KEY)) return ALLOW;
  return { kind: "hint", text: withPrefix(RESUME_HINT, row), onceKey: RESUME_HINT_KEY }; // D-M3-H2-2
}

// ---------- §4.4 UserPromptSubmit ----------

async function userPromptSubmit(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext): Promise<Decision> {
  const body = ev.prompt ?? "";
  // D-FU-GCH-2: decided before this turn's own prompt row is queued, so that row never counts as "something to resume".
  const resume = await firstTurnResume(ev, row, project);
  appendDetached(project, ev.sessionId, {
    session_id: ev.sessionId, worktree: project.worktree, agent: ev.agent, kind: "prompt", tool: null, key: null,
    path: null, ok: 1, exit_code: null, bytes: Buffer.byteLength(body), body, turn: ev.turn ?? 0,
    sandbox_bytes: 0, returned_bytes: 0,
  });
  echoDetached(ev, project, body);
  if (row.compactDelivery === "pending-flag") {
    const db = await hookDb(project);
    // §4.4 step 2.2: DELETE ... RETURNING inside BEGIN IMMEDIATE, so the delivery fires once.
    if (metaTake(db, PENDING_COMPACT_META_PREFIX + ev.sessionId) !== null) {
      return { kind: "hint", text: compactText(db, ev, row), onceKey: PENDING_COMPACT_KEY };
    }
  }
  if (resume !== null) return resume;
  return recall(ev, row, project, body);
}

// D-FU-GCH-2: a row with no SessionStart hook (Gemini: hooks/hooks.json drops it, D-FU-GCH-1) gets the
// resume hint on the first UserPromptSubmit of a session instead. First turn = the payload session id has
// no journal row yet (a host-resumed session keeps its id and its rows, and the host replays that history
// itself). The marker is the SessionStart one (RESUME_HINT_KEY, same session id), so the hint fires at most
// once per session. It fires only when this worktree already holds a journal row of this agent.
async function firstTurnResume(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext): Promise<Decision | null> {
  if (row.eventMap.SessionStart !== undefined || ev.sessionId === "") return null;
  const db = await hookDb(project);
  if (hasSessionRows(db, ev.sessionId)) return null;
  if (!shouldHint(db, ev.sessionId, RESUME_HINT_KEY)) return null;
  if (!hasAgentRows(db, project.worktree, ev.agent)) return null;
  return { kind: "hint", text: withPrefix(RESUME_HINT, row), onceKey: RESUME_HINT_KEY };
}

// ---------- DECISIONS-r11 (B) turn-boundary recall ----------

// #1394: the value is the boundary of the latest compaction, {"seq": newest journal seq, "source": newest
// sources id}. Rows and outputs written after it are still in the model's live context, so recall skips them.
function markCompacted(db: DbHandle, sessionId: string): void {
  if (sessionId === "") return;
  metaSet(db, COMPACTED_META_PREFIX + sessionId, JSON.stringify({ seq: readMaxSeq(db), source: readMaxSourceId(db) }));
}

// A value from before #1394 ("1") carries no boundary: every row stays a candidate, as before.
function compactBoundary(value: string): { seq: number; source: number } {
  const all = { seq: Number.MAX_SAFE_INTEGER, source: Number.MAX_SAFE_INTEGER };
  try {
    const v = JSON.parse(value) as unknown;
    if (typeof v !== "object" || v === null) return all;
    const { seq, source } = v as { seq?: unknown; source?: unknown };
    return {
      seq: typeof seq === "number" ? seq : all.seq,
      source: typeof source === "number" ? source : all.source,
    };
  } catch {
    return all;
  }
}

// No compaction in this session (or a row without UserPromptSubmit additionalContext): ALLOW, zero added
// bytes. After one: BM25 of this session's rows and the same worktree's prior-session rows against the
// prompt; whole rows over RECALL_MIN_SCORE, within RECALL_BUDGET_BYTES; a row goes out once per session.
async function recall(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, prompt: string): Promise<Decision> {
  if (!hasRecall(row) || ev.sessionId === "") return ALLOW;
  const db = await hookDb(project);
  const compacted = metaGet(db, COMPACTED_META_PREFIX + ev.sessionId);
  if (compacted === null) return ALLOW;
  const boundary = compactBoundary(compacted);
  const seenKey = RECALL_SEEN_META_PREFIX + ev.sessionId;
  const seen = readSeen(project, db, seenKey).filter((n): n is number => typeof n === "number");
  // r3-ledger: one ranked query over this session's line units, by the current prompt only (D-1330-RECALL-PROMPT-1).
  const unitsKey = RECALL_UNITS_SEEN_META_PREFIX + ev.sessionId;
  const seenUnits = readSeen(project, db, unitsKey).filter((k): k is string => typeof k === "string");
  const units = queryUnits(db, ev.sessionId, recallQueryText(prompt), RECALL_UNIT_CANDIDATES, boundary.source);
  const rows = readRecallRows(db, ev.sessionId, project.worktree, RECALL_MAX_ROWS, boundary.seq);
  const picked = pickRecall(rows, prompt, new Set(seen), units, new Set(seenUnits));
  if (picked.text === "") return ALLOW;
  // D-1401-SEEN-SPOOL-1 (#1401): the prompt path takes no write lock. The sent-once lists are written detached, like
  // the prompt row; under another writer's lock they wait in the spool, and readSeen reads them back from there.
  if (picked.seqs.length > 0) writeDetached(project, { t: "seen", key: seenKey, add: picked.seqs }, "recall");
  if (picked.units !== undefined) writeDetached(project, { t: "seen", key: unitsKey, add: picked.units }, "recall");
  return { kind: "hint", text: picked.text, onceKey: RECALL_KEY };
}

// ---------- ADR-0009 §8.2 decision rows (D-M4-arch-5, D-M4-H2-2) ----------

// Meta key that holds the option labels of the last unanswered AskUserQuestion call for one session.
function optionsKey(sessionId: string): string {
  return DECISION_SOURCE + ":" + DECISION_OPTION_KEY + ":" + sessionId;
}

interface PendingOptions { seq: number; labels: string[] }

function readOptions(value: string): PendingOptions | null {
  try {
    const v = JSON.parse(value) as unknown;
    if (typeof v !== "object" || v === null) return null;
    const { seq, labels } = v as Record<string, unknown>;
    if (typeof seq !== "number" || !Array.isArray(labels)) return null;
    return { seq, labels: labels.filter((l): l is string => typeof l === "string") };
  } catch {
    return null;
  }
}

// Rule 2, detached like the prompt row (A21): the labels offered in the turn before this prompt apply to
// this prompt only (taken, then gone). The metaGet check keeps a prompt with nothing offered write-free.
function echoDetached(ev: CanonicalHookEvent, project: ProjectContext, prompt: string): void {
  if (ev.sessionId === "") return;
  const key = optionsKey(ev.sessionId);
  void hookDb(project)
    .then((db) => {
      if (metaGet(db, key) === null) return;
      const taken = metaTake(db, key);
      const offered = taken === null ? null : readOptions(taken);
      if (offered === null) return;
      const part = optionEchoDecision(prompt, offered.labels, offered.seq);
      if (part !== null) writeDecisions(db, ev, project, [part]);
    })
    .catch((err: unknown) => {
      process.stderr.write("hooks: decision write failed: " + message(err) + "\n");
    });
}

// One decision = one kind:"decision" journal row + its body as one chunk under DECISION_SOURCE (D-M4-arch-5).
// D-1401-SPOOL-1: a busy lock spools the row and the chunk; the next hook write applies them.
function writeDecisions(db: DbHandle, ev: CanonicalHookEvent, project: ProjectContext, parts: readonly DecisionPart[]): void {
  for (const part of parts) {
    writeOrSpool(project, db, { t: "row", at: Date.now(), row: {
      session_id: ev.sessionId, worktree: project.worktree, agent: ev.agent, kind: "decision", tool: DECISION_TOOL,
      key: part.key, path: null, ok: 1, exit_code: null, bytes: Buffer.byteLength(part.body), body: part.body,
      turn: ev.turn ?? 0, sandbox_bytes: 0, returned_bytes: 0,
    } });
    writeOrSpool(project, db, { t: "src", id: null, src: sourceRowOf(project, ev.sessionId, DECISION_SOURCE), text: part.body, max: MAX_CHUNK_BYTES, units: false });
  }
}

// Rule 1 at PostToolUse, detached like every hook journal write (A21). An answered call writes its rows;
// an unanswered one keeps its labels for the next prompt, with ref = seq of this turn's prompt row.
function askDetached(ev: CanonicalHookEvent, project: ProjectContext, tool: ToolCall, text: string): void {
  const parts = answerDecisions(text);
  const labels = parts.length === 0 ? askOptionLabels(tool.input) : [];
  if (parts.length === 0 && labels.length === 0) return;
  void hookDb(project)
    .then((db) => {
      if (parts.length > 0) return writeDecisions(db, ev, project, parts);
      const prompts = readSessionEvents(db, ev.sessionId, "prompt");
      const last = prompts[prompts.length - 1];
      if (last === undefined || ev.sessionId === "") return; // no turn to point at: no row (fail-safe)
      metaSet(db, optionsKey(ev.sessionId), JSON.stringify({ seq: last.seq, labels }));
    })
    .catch((err: unknown) => {
      process.stderr.write("hooks: decision write failed: " + message(err) + "\n");
    });
}

// ADR-0016 l.23 (#1348): an in-process host hands the agent's tool set on the event; it is the manifest source.
function toolSetSources(ev: CanonicalHookEvent, project: ProjectContext, env: NodeJS.ProcessEnv): ToolSetSources {
  const src: ToolSetSources = { projectDir: project.worktree, env };
  if (ev.agentTools !== undefined) src.manifestTools = ev.agentTools;
  return src;
}

// ---------- §4.5 PreToolUse ----------

async function preToolUse(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv): Promise<Decision> {
  const userDeny = readUserDeny(project.worktree, ev.agent);
  const decision0 = decide(ev, row, userDeny, project);
  let decision = decision0;
  if (decision0.kind === "deny" && isSubagentCall(ev) && !isUserPolicyDeny(decision0.reason, row)) {
    // Case A keeps decision0 (D-M3-H2-4); case B names the run.mjs wrapper for a shell call.
    // D-SUB-NOCTX-1 (#1311): a deny names only tools the caller has. A caller without ctx_* tools runs the call:
    // a known tool set without them, or a named agent type no source defines on a row that replaces afterwards
    // (PostToolUse case C keeps a large output out). A call with no agent type inherits the session tools (case A).
    const set = toolSetForAgentType(ev, toolSetSources(ev, project, env));
    const subCase = pickSubagentCase(ev, set);
    const tool = ev.tool;
    const runs = set !== null || ((ev.agentType ?? "") !== "" && hasReplace(row));
    if (subCase === "B" && tool !== undefined && isShell(tool, row)) decision = caseB(ev, row, decision0, userDeny);
    else if (subCase !== "A" && runs) decision = ALLOW;
  }
  return decision; // no PreToolUse hint, so no throttle marker and no DB touch (D-M7-RR-2)
}

function isShell(tool: ToolCall, row: AdapterRow): boolean {
  return tool.canonicalName === SHELL_TOOL || row.nativeTools.shell.includes(tool.name);
}

// The user's own rules stay as they are: the wrapper would refuse them too (D-M3-H2-5).
function isUserPolicyDeny(reason: string, row: AdapterRow): boolean {
  return reason.startsWith(USER_DENY_REASON_PREFIX) || reason === prefixToolNames(POLICY_UNREADABLE_LINE, row.toolNamePrefix)
    || reason === prefixToolNames(PARSE_ERROR_DENY_LINE, row.toolNamePrefix);
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

// §4.5 step 3 case B, D-M3-arch-3: run.mjs sits next to the running hook bundle (impl/13 §2).
function caseB(ev: CanonicalHookEvent, row: AdapterRow, d0: Extract<Decision, { kind: "deny" }>, userDeny: string[] | null): Decision {
  const tool = ev.tool;
  if (tool === undefined || !isShell(tool, row) || isUserPolicyDeny(d0.reason, row)) return d0;
  const command = tool.input.command;
  if (typeof command !== "string") return d0;
  const wrapper = '"' + join(dirname(process.argv[1] ?? ""), RUN_WRAPPER_FILE) + '"';
  const rewritten = [RUN_WRAPPER_NODE, wrapper, b64(command), b64(JSON.stringify(userDeny ?? [])), b64(str(tool.input.description))].join(" ");
  return { kind: "deny", reason: SUBAGENT_RUN_DENY, rewritten }; // D-M3-F-7: no ctx_* tool named
}

// ---------- §4.6 PostToolUse ----------

function journalKind(tool: ToolCall, row: AdapterRow, isError: boolean): EventKind | null {
  if (isError) return "toolerr";
  if ((EDIT_TOOLS as readonly string[]).includes(tool.canonicalName) || (row.nativeTools.edit ?? []).includes(tool.name)) return "edit";
  if (isShell(tool, row)) return "cmd";
  return null; // A25: a clean Read/Grep/WebFetch/other call has no journal kind
}

/** Sorted-key JSON, so one input always gives one key (ADR-0009 §1 "stable JSON of the input"). */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableJson(o[k])).join(",") + "}";
  }
  return JSON.stringify(v) ?? "null";
}

/** ADR-0009 §1: first line starts with "Exit code ", then a digit loop. No such line -> null. */
function exitCodeOf(text: string): number | null {
  const nl = text.indexOf("\n");
  const first = nl < 0 ? text : text.slice(0, nl);
  if (!first.startsWith(EXIT_CODE_LINE_PREFIX)) return null;
  let n = 0;
  let digits = 0;
  for (const ch of first.slice(EXIT_CODE_LINE_PREFIX.length)) {
    const d = ch.charCodeAt(0) - DIGIT_0;
    if (d < 0 || d > 9) break;
    n = n * 10 + d;
    digits++;
  }
  return digits === 0 ? null : n;
}

function pathOf(input: Record<string, unknown>): string | null {
  for (const k of EDIT_PATH_KEYS) if (typeof input[k] === "string") return input[k] as string;
  return null;
}

async function postToolUse(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv, settle: Settle): Promise<Decision> {
  const tool = ev.tool;
  if (tool === undefined || tool.canonicalName.startsWith(OWN_TOOL_PREFIX)) return ALLOW; // step 1 (ADR-0009 §0)
  const result = ev.result ?? { isError: false, bytes: 0 };
  const whole = wholeOutput(result, ev.sessionId, env);
  const text = whole.text;
  if (result.persistedPath !== undefined) result.bytes = Buffer.byteLength(text);
  if (tool.canonicalName === DECISION_TOOL) askDetached(ev, project, tool, text); // ADR-0009 §8.2
  const kind = journalKind(tool, row, result.isError); // step 2
  // D-STATS-RET-1: the row is written once, after the decision, so returned_bytes is what the model got:
  // the replace text when the hook replaced the output, result.bytes when it allowed it whole. Same detached write.
  // D-STATS-RET-3: and after the encode stage, so a failed encode (the host gets the whole output) is not a saving.
  const journal = (returned: number): void => {
    if (kind === null) return;
    const key = kind === "cmd" ? canonicalKey(tool.canonicalName, str(tool.input.command))
      : kind === "toolerr" ? tool.canonicalName + ":" + stableJson(tool.input) : null; // step 3
    appendDetached(project, ev.sessionId, { // step 4; body is the whole text (D-M3-H2-6)
      session_id: ev.sessionId, worktree: project.worktree, agent: ev.agent, kind, tool: tool.canonicalName, key,
      path: pathOf(tool.input), ok: result.isError ? 0 : 1, exit_code: exitCodeOf(text), bytes: result.bytes,
      body: text, turn: ev.turn ?? 0, sandbox_bytes: result.bytes, returned_bytes: returned,
    });
  };
  let decision: Decision;
  try {
    decision = await postReplace(ev, row, project, env, tool, result, text, whole.file);
  } catch (err) {
    journal(result.bytes); // the call still gets its row; the caller turns the throw into the failure output
    throw err;
  }
  const decided = decision;
  settle.run = (encoded) => journal(encoded && decided.kind === "replace" ? Buffer.byteLength(decided.output) : result.bytes);
  return decision;
}

/** D-R48-OWN-FILE-1 (#1326): a read-like tool whose target is one of the agent's own instruction or skill files. */
function ownRead(ev: CanonicalHookEvent, tool: ToolCall, env: NodeJS.ProcessEnv): boolean {
  if (!RANGE_READ_TOOLS.includes(tool.canonicalName)) return false;
  const p = READ_PATH_KEYS.map((k) => tool.input[k]).find((v): v is string => typeof v === "string" && v !== "");
  return p !== undefined && isOwnFile(ev.agent, ev.cwd, p, env);
}

async function postReplace(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv,
  tool: ToolCall, result: ToolResultInfo, text: string, persistedFile?: string): Promise<Decision> {
  // step 5: replace, DECISIONS-r9 F1 split. Subagent case B/C (ADR-0016), and the main agent on a row
  // with a replace channel ("run, then replace", D-M7-RR-1, DECISIONS-r10 (1)).
  if (result.bytes <= REPLACE_TRIGGER_BYTES) return ALLOW; // D-M7-SV-1
  if (boundedRead(tool)) return ALLOW; // D-R41-READ-OFFSET-1 (#1314): the user asked for these lines
  if (ompRangedRead(ev, tool)) return ALLOW; // D-1392-OMP-RANGE-1 (#1392): the same window, written in the path
  if (ownRead(ev, tool, env)) return ALLOW; // D-R48-OWN-FILE-1 (#1326): a skill or rule file reaches the model whole
  if (SKILL_LOAD_TOOLS.includes(tool.canonicalName)) return ALLOW; // D-1404-SKILL-LOAD-1 (#1404): a loaded skill joins the prompt whole
  if (result.keep === true) return ALLOW; // D-M2-MCP-1: an MCP result with a non-text block stays as the host made it
  // ADR-0001: one path per row, no runtime fallback. A row with no replace channel gets no replace decision on
  // any path, the subagent one too (D-STATS-RET-2): its encoder drops it, so the model gets the whole output.
  if (!hasReplace(row)) return ALLOW;
  // D-CC-POINTER-1 (#1342, ADR-0016 line 16): every caller keeps the same replace budget; case A is no passthrough.
  // The pointer names only what the caller can call: ctx_search for the main session and case A, the plain
  // SUBAGENT_HANDLE_LINE for case B and C. D-CC-POINTER-4: the subagent label carries the call id, as mainLabel does.
  let label: string;
  let caller: Caller = { ctx: true, shell: true, read: false };
  let canRead = true; // D-CC-POINTER-6: the main session has Read; a subagent only when its tool set holds it
  if (isSubagentCall(ev)) {
    // #1348: toolSetSources carries the OpenCode 2.x agentTools next to the project dir and env.
    const set = toolSetForAgentType(ev, toolSetSources(ev, project, env));
    const subCase = pickSubagentCase(ev, set);
    const has = (names: readonly string[]): boolean => set !== null && names.some((n) => set.includes(n));
    canRead = has(row.nativeTools.read ?? []);
    caller = { ctx: subCase === "A", shell: has(row.nativeTools.shell),
      read: RANGE_READ_TOOLS.includes(tool.canonicalName) && has(row.nativeTools.read ?? []) };
    // D-1382-NO-ROUTE-1 (#1382, ADR-0016 lines 11 and 16): a known tool set with no ctx tool, no shell and no ranged
    // Read has no call that opens the handle, so the replace is a dead end: the output reaches it whole.
    if (set !== null && !caller.ctx && !caller.shell && !caller.read) return ALLOW;
    label = SUBAGENT_SOURCE_PREFIX + tool.canonicalName + ":" + (tool.callId ?? String(ev.turn ?? 0));
  } else {
    label = mainLabel(tool, ev);
  }
  // D-M7-RR-3: no description -> the command text, file path, pattern or URL, never an empty query.
  // D-CC-POINTER-2 (#1358): an MCP input has none of them, so the tool name is the last field.
  const intent = [tool.input.description, tool.input.command, tool.input.file_path, tool.input.pattern, tool.input.url, tool.name]
    .map(str).find((v) => v.trim() !== "") ?? tool.canonicalName;
  // One chunk pass for both forms (D-M7-FT-2): the stored chunks and the selected chunks are the same
  // array, so the in-memory selection equals selectChunks over the stored source without reading it back.
  const chunks = chunkText(text, "text", REPLACE_CHUNK_BYTES); // D-M7-SV-1: small chunks, line-aligned cuts
  // D-CR3-HANDLE-1: the handle is the short id of the stored row. Up to SYNC_INDEX_MAX_BYTES the whole write
  // is sync; above it (F1) only the source row is written now (one small row, D-CR3-HANDLE-2) and the
  // chunks and line units follow detached under that id, so the handle never falls back to the long label.
  // D-1401-SPOOL-1 (#1401): under another process's write lock the write goes to the project spool and the next
  // hook write applies it. A source row not written yet has no id, so the handle is its label (pickSource reads both).
  const db = await hookDb(project);
  const op: SpoolOp = { t: "src", id: null, src: sourceRowOf(project, ev.sessionId, label), text, max: REPLACE_CHUNK_BYTES, units: true };
  let sourceId: number | null;
  if (result.bytes <= SYNC_INDEX_MAX_BYTES) {
    sourceId = writeOrSpool(project, db, op, chunks); // r3-ledger: chunks and line units
  } else {
    sourceId = reserveOrSpool(project, db, op, chunks);
    if (sourceId !== null) indexDetached(project, { ...op, id: sourceId }, chunks);
  }
  // D-1402-PLUGIN-CALL-1 (#1402): a plugin mod's MCP call (host id prefix toolu_plugin_) returns to the mod, not to the
  // model, so the mod gets the output whole (it may JSON.parse it). The text is indexed above; model calls stay replaced.
  if (pluginMcpCall(tool)) return ALLOW;
  const handle = sourceId === null ? label : sourceHandle(sourceId);
  // D-M7-SV-5: rank by the intent and the session's last user prompt (any word), so a bare cat still
  // returns the line the user asked for. The more line keeps the intent. No prompt -> intent alone.
  const prompt = await lastPrompt(project, ev.sessionId);
  const rankQuery = prompt.trim() === "" ? undefined : intent + " " + prompt;
  // D-M2-SHAPE-1: a parser-found shape (JSON rows, a line log) gives its rare units the query names, whole,
  // within the same budget, plus the handle. No shape or no named rare unit -> the BM25 pick below, unchanged.
  // D-CR3-HANDLE-1: one handle line replaces the more line and counts inside the budget. The budget per
  // replace is the size bound of D-CR3-HANDLE-1 (REPLACE_RETURN_BYTES of selection + the more line with the full
  // label); the selection gets that budget minus the handle line, so the selection plus the handle line never grows.
  // D-CC-POINTER-2: on claude-code the search.mjs twin comes on top of that bound (two absolute paths, about 120-250 B).
  // D-HA-GEMINI-HINT-1: a second query of the prompt words the output holds, so the call returns the asked line.
  const handleLine = caller.ctx
    ? REPLACE_HANDLE_LINE(intent, handle, result.bytes, row.toolNamePrefix, askedWords(intent, prompt, text))
    : SUBAGENT_HANDLE_LINE(handle, result.bytes, caller.read);
  const budget = replaceBudget(handleLine, moreLine(intent, label));
  // D-CC-POINTER-2 (#1358): on the claude-code row a caller with a shell also gets the MCP-free search.mjs call,
  // which works when the MCP server is not connected. It sits after the budget: the selection is unchanged.
  // D-CC-POINTER-6 (#1406): a file the host persisted and this hook read is named after the budget too, for a caller with Read.
  // The search.mjs twin takes a source id; a spooled source (no id yet) keeps the ctx_search line alone.
  const pointer = handleLine + (caller.shell && ev.agent === RUN_WRAPPER_AGENT && sourceId !== null ? searchTwin(handle, intent, project) : "")
    + (persistedFile !== undefined && canRead ? PERSISTED_FILE_LINE(persistedFile) : "");
  const digest = shapeDigest(text, rankQuery ?? intent, SHAPE_RETURN_BYTES); // D-M2-JSON-1
  if (digest !== null) return { kind: "replace", output: replaceOutput(digest, pointer) };
  const selected = selectChunksInMemory(chunks, intent, budget, label, rankQuery);
  return { kind: "replace", output: selected.more !== null ? replaceOutput(selected.text, pointer) : selected.text };
}

type Caller = { ctx: boolean; shell: boolean; read: boolean };

// D-1402-PLUGIN-CALL-1: MCP tools only. An Agent call a plugin serves for the model may carry the same id prefix.
function pluginMcpCall(tool: ToolCall): boolean {
  return tool.callId !== undefined && tool.callId.startsWith(PLUGIN_CALL_ID_PREFIX) && tool.name.startsWith(MCP_SERVER_TOOL_PREFIX);
}

// search.mjs sits next to hook.mjs (D-M3-arch-3, as caseB's run.mjs). A long intent is not echoed (D-NO-LOSSY-CUT-2).
function searchTwin(handle: string, intent: string, project: ProjectContext): string {
  const terms = Buffer.byteLength(intent, "utf8") > ECHO_MAX_BYTES ? "" : intent;
  return SEARCH_TWIN_LINE(join(dirname(process.argv[1] ?? ""), SEARCH_WRAPPER_FILE), handle, terms, project.worktree);
}

// D-R41-READ-OFFSET-1 (#1314): a read-like tool called with offset, limit or view_range is a bounded window.
export function boundedRead(tool: ToolCall): boolean {
  return RANGE_READ_TOOLS.includes(tool.canonicalName) && READ_RANGE_KEYS.some((k) => tool.input[k] !== undefined && tool.input[k] !== null);
}

// D-1392-OMP-RANGE-1 (#1392, ADR-0026): OMP's read has `path` only and takes the line range inline (OMP 18.21.0
// read-selector.ts parseSel: :N, :N-M, :N+K, :N-, :-N, comma lists, `raw` before or after the range). A path whose
// suffix is a range is a bounded window (D-R41-READ-OFFSET-1). A suffix with no range (none, :raw, :img, a drive
// letter, a colon inside a folder name) is a full read and stays replaced. A file whose literal name holds the suffix
// is read whole by OMP (path-utils.ts splitPathAndSelPreferringLiteral), so it stays replaced too.
function ompRangedRead(ev: CanonicalHookEvent, tool: ToolCall): boolean {
  if (ev.agent !== "omp" || !RANGE_READ_TOOLS.includes(tool.canonicalName)) return false;
  const p = READ_PATH_KEYS.map((k) => tool.input[k]).find((v): v is string => typeof v === "string" && v !== "");
  if (p === undefined || !rangedPathSuffix(p)) return false;
  try {
    return lstatSync(resolve(ev.cwd, p), { throwIfNoEntry: false }) === undefined;
  } catch {
    return false; // an unclear probe keeps the full-read path: the replace stays
  }
}

// D-1392-OMP-RANGE-1: plain string parse from the last colon, no regex. `<file>:<range>`, `<file>:<range>:raw` or
// `<file>:raw:<range>`. The file part is never empty and never one drive letter (`D:50` is a Windows path).
export function rangedPathSuffix(path: string): boolean {
  let cut = path.lastIndexOf(":");
  let sel = path.slice(cut + 1);
  if (sel.toLowerCase() === "raw") {
    cut = path.lastIndexOf(":", cut - 1);
    sel = path.slice(cut + 1, path.length - 4);
  }
  if (cut <= 0 || !rangeList(sel)) return false;
  let file = path.slice(0, cut);
  if (file.toLowerCase().endsWith(":raw")) file = file.slice(0, -4);
  return file.length > 1 || !asciiLetter(file);
}

function rangeList(sel: string): boolean {
  return sel !== "" && sel.split(",").every(rangeItem);
}

// One list item: N, N-M, N+K, N- or -N (OMP parseLineRanges and parseTailCount).
function rangeItem(item: string): boolean {
  if (item.startsWith("-")) return digitsOnly(item.slice(1));
  let i = 0;
  while (i < item.length && digit(item[i])) i++;
  if (i === 0) return false;
  if (i === item.length) return true;
  const op = item[i];
  const rest = item.slice(i + 1);
  return (op === "-" && (rest === "" || digitsOnly(rest))) || (op === "+" && digitsOnly(rest));
}

function digitsOnly(s: string): boolean {
  if (s === "") return false;
  for (const c of s) if (!digit(c)) return false;
  return true;
}

function digit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function asciiLetter(s: string): boolean {
  const c = s.toLowerCase();
  return c.length === 1 && c >= "a" && c <= "z";
}

// D-R4-BUDGET-1: the replace is the body, one newline, the handle line. An empty body (selection budget 0, no
// chunk fits) gives the handle line alone, with no leading newline.
export function replaceOutput(body: string, handleLine: string): string {
  return body === "" ? handleLine : body + "\n" + handleLine;
}

// D-R4-BUDGET-1: the selection budget left after the handle line and the newline that joins it to the body.
// It never goes below 0 (a handle line longer than the more line plus REPLACE_RETURN_BYTES leaves no room for a body).
export function replaceBudget(handleLine: string, more: string): number {
  return Math.max(0, REPLACE_RETURN_BYTES + Buffer.byteLength("\n" + more) - 1 - Buffer.byteLength(handleLine));
}

// D-SEC-PERSIST-1: a persisted output is read only at <claude dir>/projects/<project>/<this session>/tool-results/<file>:
// a plain file (not a link), inside that dir after realpath, at most PERSISTED_OUTPUT_MAX_BYTES.
function hostToolResult(file: string, sessionId: string, env: NodeJS.ProcessEnv): boolean {
  if (sessionId === "" || sessionId.includes(sep) || sessionId.includes("/")) return false;
  const projects = join(claudeDirOf(env, homeDirOf(env) ?? ""), PROJECTS_DIR_NAME);
  const steps = relative(projects, resolve(file)).split(sep);
  if (steps.length !== 4 || steps.includes("..") || steps.includes("")) return false;
  if (steps[1] !== sessionId || steps[2] !== CLAUDE_TOOL_RESULTS_DIR_NAME) return false;
  const st = lstatSync(file);
  return st.isFile() && st.size <= PERSISTED_OUTPUT_MAX_BYTES && isInside(projects, file);
}

// D-M2-SHAPE-2: the whole output when the host persisted it to a file; an unreadable or refused file keeps the head.
// D-CC-POINTER-6: `file` is set only when the host's file was read, so a refused path is never named to the model.
function wholeOutput(result: ToolResultInfo, sessionId: string, env: NodeJS.ProcessEnv): { text: string; file?: string } {
  const head = result.text ?? "";
  if (result.persistedPath === undefined) return { text: head };
  try {
    if (!hostToolResult(result.persistedPath, sessionId, env)) {
      // D-SEC-PERSIST-1: doctor shows this line under "Hook errors"; the model still gets the head.
      logHookError(env, "claude-code", "persisted-output", new Error("persisted output path is outside this session's tool-results dir or too large; kept the head"));
      return { text: head };
    }
    return { text: readFileSync(result.persistedPath, "utf8"), file: result.persistedPath };
  } catch {
    return { text: head };
  }
}

// D-M7-SV-5: best effort; a store that cannot open gives "" and the selection uses the intent alone.
async function lastPrompt(project: ProjectContext, sessionId: string): Promise<string> {
  try {
    return readLastPrompt(await hookDb(project), sessionId);
  } catch {
    return "";
  }
}

// D-M7-RR-1: "<tool>:" + the first line of the command (or the tool name), at most SOURCE_LABEL_MAX_CHARS,
// + "#" + call id when the host gives one, so two runs of one command stay two sources.
function mainLabel(tool: ToolCall, ev: CanonicalHookEvent): string {
  const cmd = str(tool.input.command) ?? str(tool.input.file_path) ?? "";
  const nl = cmd.indexOf("\n");
  const head = (tool.canonicalName + ":" + (nl < 0 ? cmd : cmd.slice(0, nl))).slice(0, SOURCE_LABEL_MAX_CHARS);
  return head + "#" + (tool.callId ?? String(ev.turn ?? 0));
}

// F1: above SYNC_INDEX_MAX_BYTES the FTS5 chunk write never blocks the decision; same rules as appendDetached.
// The source row is already reserved (D-CR3-HANDLE-2); chunks and line units land under its id (D-1401-SPOOL-1).
function indexDetached(project: ProjectContext, op: SpoolOp, chunks: Chunk[]): void {
  writeDetached(project, op, "index", chunks);
}

// D-1401-SPOOL-1: reserve the source row now; a busy lock spools the whole write and gives no id.
function reserveOrSpool(project: ProjectContext, db: DbHandle, op: SpoolOp & { t: "src" }, chunks: Chunk[]): number | null {
  try {
    return reserveSource(db, op.src, chunks);
  } catch (err) {
    if (!isBusy(err)) throw err;
    spool(project, op);
    return null;
  }
}

// The source fields a hook output stores (kind "content"). reserveSource and finishReserved take these only;
// the byte and chunk counts come from the chunks they write (DEVIATIONS D-CR3-HANDLE-2).
export function sourceRowOf(project: ProjectContext, sessionId: string, label: string): SourceDraft {
  return { sessionId, worktree: project.worktree, agent: project.agent, kind: "content", label, createdAt: Date.now() };
}

// ---------- §4.7 PreCompact ----------

async function preCompact(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext): Promise<Decision> {
  const db = await hookDb(project);
  metaSet(db, PENDING_COMPACT_META_PREFIX + ev.sessionId, PENDING_COMPACT_FLAG);
  if (hasRecall(row)) markCompacted(db, ev.sessionId);
  return ALLOW;
}

// ---------- Usage (D-M5-arch-2) ----------

// One kind:"cost" row per Usage event (OpenCode step-finish), detached like every hook journal write (A21).
// handleHook is the only writer; a repeat for the same (session_id, turn) is dropped by the store's
// partial unique index, so this path does no dedup of its own. Cost rows are not ctx_stats call rows
// (D-M4-S3-1): tool stays null and the byte columns stay 0.
function usage(ev: CanonicalHookEvent, project: ProjectContext): Promise<Decision> {
  appendDetached(project, ev.sessionId, {
    session_id: ev.sessionId, worktree: project.worktree, agent: ev.agent, kind: "cost", tool: null, key: null,
    path: null, ok: 1, exit_code: null, bytes: 0, body: "", turn: ev.turn ?? 0, sandbox_bytes: 0, returned_bytes: 0,
  });
  return Promise.resolve(ALLOW);
}
