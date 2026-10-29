// impl/09 §4 (handleHook), ADR-0009 §1, §6 and §8.2, ADR-0016; DEVIATIONS D-M3-arch-3 (case-B wrapper
// next to the hook bundle), D-M3-H2-1..7, D-M4-arch-5 and D-M4-H2-1..3 (compact "none" branches, decision rows).
// One path per event. Every failure fails open: allow, one stderr line. Never block the host.
// D-CI-PERF-7: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { readFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { dirname, join } from "node:path";
import { AGENT_IDS, type AgentId } from "../contracts/agents.ts";
import {
  COMPACTED_META_PREFIX, COMPACT_POINTER_LINE, COMPACT_STATE_KEY, DECISION_OPTION_KEY, DECISION_SOURCE, DECISION_TOOL, EDIT_PATH_KEYS, EDIT_TOOLS, EXIT_CODE_LINE_PREFIX,
  OWN_TOOL_PREFIX, prefixToolNames, REPLACE_CHUNK_BYTES, REPLACE_HANDLE_LINE, REPLACE_RETURN_BYTES, REPLACE_TRIGGER_BYTES, SHAPE_RETURN_BYTES, PARSE_ERROR_DENY_LINE, PENDING_COMPACT_FLAG, PENDING_COMPACT_KEY,
  PENDING_COMPACT_META_PREFIX, POLICY_UNREADABLE_LINE, RECALL_KEY, RECALL_MAX_ROWS, RECALL_SEEN_META_PREFIX, RECALL_UNIT_CANDIDATES, RECALL_UNITS_SEEN_META_PREFIX, RESUME_HINT, RESUME_HINT_KEY, RUN_WRAPPER_FILE,
  RUN_WRAPPER_NODE, SHELL_TOOL, SOURCE_LABEL_MAX_CHARS, SUBAGENT_SOURCE_PREFIX, SYNC_INDEX_MAX_BYTES, TOOL_PREFIX_SLOT,
  USER_DENY_REASON_PREFIX,
  SUBAGENT_RUN_DENY, WORKSPACE_FOLDER_FLAG,
} from "../contracts/constants.ts";
import type {
  AdapterRow, CanonicalHookEvent, Chunk, Decision, DbHandle, EventKind, HookOutput, ProjectContext, ToolCall, ToolResultInfo,
} from "../contracts/types.ts";
import { getAdapter, hasRecall, hasReplace } from "../../adapters/table.ts";
import { decide } from "../policy/decide.ts";
import { isSubagentCall, pickSubagentCase, toolSetForAgentType } from "../policy/subagent.ts";
import { readUserDeny } from "../policy/user-deny.ts";
import { resolveProject } from "../project/resolve.ts";
import { metaGet, metaSet, metaTake, openDb } from "../store/db.ts";
import { appendEvent, canonicalKey } from "../journal/append.ts";
import { hasAgentRows, hasSessionRows, readFirstPrompt, readLastPrompt, readRecallRows, readSessionEvents } from "../journal/read.ts";
import { finishReserved, insertChunks, insertUnits, queryUnits, recallQueryText, reserveSource, sourceHandle, type SourceDraft } from "../store/fts.ts";
import { buildUnits } from "../index/units.ts";
import { renderState } from "../compaction/render.ts";
import { pickRecall } from "../compaction/recall.ts";
import { chunkText } from "../index/chunk.ts";
import { moreLine, selectChunksInMemory } from "../index/select.ts";
import { shapeDigest } from "../index/shape.ts";
import { indexText } from "../index/text.ts";
import { appendDetached } from "./detached.ts";
import { askedWords } from "./handle-query.ts";
import { answerDecisions, askOptionLabels, optionEchoDecision, type DecisionPart } from "./decision.ts";
import { shouldHint } from "./throttle.ts";
import { CtxError } from "../contracts/errors.ts";
import { failureOutput, fault, logHookError, nodeTooOld } from "./fallback.ts";

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
  const fail = (stage: string, err: unknown, line?: string): HookOutput => {
    logHookError(env, agent, stage, err);
    process.stderr.write(line ?? "hooks: " + stage + " failed: " + message(err) + "\n");
    return failureOutput(agent, raw, err);
  };
  if (nodeTooOld(process.version)) return fail("node", new CtxError("NODE_TOO_OLD", { v: process.version }));
  let ev: CanonicalHookEvent;
  try {
    fault(env, "decode");
    ev = row.decode(raw);
  } catch (err) {
    return fail("decode", err); // step 2
  }
  let project: ProjectContext;
  try {
    fault(env, "project");
    // D-HA-PI-PROJECT-1: on pi the entry puts ctx.cwd into the payload, so ev.cwd is the pi:ctx.cwd source.
    // D-HF-VSCODE-PROJECT-1: a VS Code hook has no launch args; its workspace folder is the payload cwd.
    const argv = agent === "vscode" ? [WORKSPACE_FOLDER_FLAG, ev.cwd] : process.argv;
    project = resolveProject(agent, { env, argv, cwd: ev.cwd, piCwd: agent === "pi" ? ev.cwd : undefined }); // step 3
  } catch (err) {
    // D-FU-PS-1 keeps its one stderr line (code first); the decision part is new.
    return fail("project", err, "hooks: no project: " + String((err as { code?: unknown }).code ?? "ERROR") + " " + message(err) + "\n"); // D-HNE-GUARD-1 supersedes D-FU-PS-1: a flooding call is denied, the rest allowed
  }
  let decision: Decision;
  try {
    fault(env, "policy");
    decision = await dispatch(ev, row, project, env); // step 4
  } catch (err) {
    return fail("store", err);
  }
  try {
    fault(env, "encode");
    return row.encode(ev, decision); // step 6
  } catch (err) {
    return fail("encode", err);
  }
}

function dispatch(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv): Promise<Decision> {
  switch (ev.event) {
    case "SessionStart":
      return sessionStart(ev, row, project);
    case "UserPromptSubmit":
      return userPromptSubmit(ev, row, project);
    case "PreToolUse":
      return preToolUse(ev, row, project, env);
    case "PostToolUse":
      return postToolUse(ev, row, project, env);
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
  if (ev.source === "compact" && hasRecall(row)) markCompacted(await openDb(project), ev.sessionId);
  if (ev.source === "compact" && row.compactDelivery === "sessionstart") {
    const db = await openDb(project);
    // A23: the throttle marker guards a duplicate SessionStart(compact) in one session.
    if (!shouldHint(db, ev.sessionId, COMPACT_STATE_KEY)) return ALLOW;
    return { kind: "hint", text: compactText(db, ev, row), onceKey: COMPACT_STATE_KEY };
  }
  const db = await openDb(project);
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
    const db = await openDb(project);
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
  const db = await openDb(project);
  if (hasSessionRows(db, ev.sessionId)) return null;
  if (!shouldHint(db, ev.sessionId, RESUME_HINT_KEY)) return null;
  if (!hasAgentRows(db, project.worktree, ev.agent)) return null;
  return { kind: "hint", text: withPrefix(RESUME_HINT, row), onceKey: RESUME_HINT_KEY };
}

// ---------- DECISIONS-r11 (B) turn-boundary recall ----------

function markCompacted(db: DbHandle, sessionId: string): void {
  if (sessionId !== "") metaSet(db, COMPACTED_META_PREFIX + sessionId, PENDING_COMPACT_FLAG);
}

function seenSeqs(value: string | null): number[] {
  if (value === null) return [];
  try {
    const v = JSON.parse(value) as unknown;
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function seenUnitKeys(value: string | null): string[] {
  if (value === null) return [];
  try {
    const v = JSON.parse(value) as unknown;
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

// No compaction in this session (or a row without UserPromptSubmit additionalContext): ALLOW, zero added
// bytes. After one: BM25 of this session's rows and the same worktree's prior-session rows against the
// prompt; whole rows over RECALL_MIN_SCORE, within RECALL_BUDGET_BYTES; a row goes out once per session.
async function recall(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, prompt: string): Promise<Decision> {
  if (!hasRecall(row) || ev.sessionId === "") return ALLOW;
  const db = await openDb(project);
  if (metaGet(db, COMPACTED_META_PREFIX + ev.sessionId) === null) return ALLOW;
  const seenKey = RECALL_SEEN_META_PREFIX + ev.sessionId;
  const seen = seenSeqs(metaGet(db, seenKey));
  // r3-ledger: one ranked query over this session's line units, by the prompt and the session goal.
  const unitsKey = RECALL_UNITS_SEEN_META_PREFIX + ev.sessionId;
  const seenUnits = seenUnitKeys(metaGet(db, unitsKey));
  const goal = readFirstPrompt(db, ev.sessionId);
  const units = queryUnits(db, ev.sessionId, recallQueryText(prompt, goal), RECALL_UNIT_CANDIDATES);
  const picked = pickRecall(readRecallRows(db, ev.sessionId, project.worktree, RECALL_MAX_ROWS), prompt, new Set(seen), units, new Set(seenUnits));
  if (picked.text === "") return ALLOW;
  if (picked.seqs.length > 0) metaSet(db, seenKey, JSON.stringify([...seen, ...picked.seqs]));
  if (picked.units !== undefined) metaSet(db, unitsKey, JSON.stringify([...seenUnits, ...picked.units]));
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
  void openDb(project)
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
function writeDecisions(db: DbHandle, ev: CanonicalHookEvent, project: ProjectContext, parts: readonly DecisionPart[]): void {
  for (const part of parts) {
    appendEvent(db, {
      session_id: ev.sessionId, worktree: project.worktree, agent: ev.agent, kind: "decision", tool: DECISION_TOOL,
      key: part.key, path: null, ok: 1, exit_code: null, bytes: Buffer.byteLength(part.body), body: part.body,
      turn: ev.turn ?? 0, sandbox_bytes: 0, returned_bytes: 0,
    });
    indexText(db, project, ev.sessionId, DECISION_SOURCE, part.body, "text");
  }
}

// Rule 1 at PostToolUse, detached like every hook journal write (A21). An answered call writes its rows;
// an unanswered one keeps its labels for the next prompt, with ref = seq of this turn's prompt row.
function askDetached(ev: CanonicalHookEvent, project: ProjectContext, tool: ToolCall, text: string): void {
  const parts = answerDecisions(text);
  const labels = parts.length === 0 ? askOptionLabels(tool.input) : [];
  if (parts.length === 0 && labels.length === 0) return;
  void openDb(project)
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

// ---------- §4.5 PreToolUse ----------

async function preToolUse(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv): Promise<Decision> {
  const userDeny = readUserDeny(project.worktree, ev.agent);
  const decision0 = decide(ev, row, userDeny);
  let decision = decision0;
  if (decision0.kind === "deny" && isSubagentCall(ev)) {
    // Case A and case C keep decision0 (D-M3-H2-4); case B names the run.mjs wrapper.
    const subCase = pickSubagentCase(ev, toolSetForAgentType(ev, { projectDir: project.worktree, env }));
    if (subCase === "B") decision = caseB(ev, row, decision0, userDeny);
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

async function postToolUse(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext, env: NodeJS.ProcessEnv): Promise<Decision> {
  const tool = ev.tool;
  if (tool === undefined || tool.canonicalName.startsWith(OWN_TOOL_PREFIX)) return ALLOW; // step 1 (ADR-0009 §0)
  const result = ev.result ?? { isError: false, bytes: 0 };
  const text = wholeOutput(result);
  if (result.persistedPath !== undefined) result.bytes = Buffer.byteLength(text);
  if (tool.canonicalName === DECISION_TOOL) askDetached(ev, project, tool, text); // ADR-0009 §8.2
  const kind = journalKind(tool, row, result.isError); // step 2
  if (kind !== null) {
    const key = kind === "cmd" ? canonicalKey(tool.canonicalName, str(tool.input.command))
      : kind === "toolerr" ? tool.canonicalName + ":" + stableJson(tool.input) : null; // step 3
    appendDetached(project, ev.sessionId, { // step 4; body is the whole text (D-M3-H2-6)
      session_id: ev.sessionId, worktree: project.worktree, agent: ev.agent, kind, tool: tool.canonicalName, key,
      path: pathOf(tool.input), ok: result.isError ? 0 : 1, exit_code: exitCodeOf(text), bytes: result.bytes,
      body: text, turn: ev.turn ?? 0, sandbox_bytes: result.bytes, returned_bytes: result.bytes,
    });
  }
  // step 5: replace, DECISIONS-r9 F1 split. Subagent case B/C (ADR-0016), and the main agent on a row
  // with a replace channel ("run, then replace", D-M7-RR-1, DECISIONS-r10 (1)).
  if (result.bytes <= REPLACE_TRIGGER_BYTES) return ALLOW; // D-M7-SV-1
  if (result.keep === true) return ALLOW; // D-M2-MCP-1: an MCP result with a non-text block stays as the host made it
  let label: string;
  if (isSubagentCall(ev)) {
    const subCase = pickSubagentCase(ev, toolSetForAgentType(ev, { projectDir: project.worktree, env }));
    if (subCase === "A") return ALLOW;
    label = SUBAGENT_SOURCE_PREFIX + tool.canonicalName + ":" + String(ev.turn ?? 0);
  } else {
    if (!hasReplace(row)) return ALLOW; // ADR-0001: one path per row, no runtime fallback
    label = mainLabel(tool, ev);
  }
  // D-M7-RR-3: no description -> the command text, file path, pattern or URL, never an empty query.
  const intent = [tool.input.description, tool.input.command, tool.input.file_path, tool.input.pattern, tool.input.url]
    .map(str).find((v) => v.trim() !== "") ?? "";
  // One chunk pass for both forms (D-M7-FT-2): the stored chunks and the selected chunks are the same
  // array, so the in-memory selection equals selectChunks over the stored source without reading it back.
  const chunks = chunkText(text, "text", REPLACE_CHUNK_BYTES); // D-M7-SV-1: small chunks, line-aligned cuts
  // D-CR3-HANDLE-1: the handle is the short id of the stored row. Up to SYNC_INDEX_MAX_BYTES the whole write
  // is sync; above it (F1) only the source row is written now (one small row, D-CR3-HANDLE-2) and the
  // chunks and line units follow detached under that id, so the handle never falls back to the long label.
  const db = await openDb(project);
  let sourceId: number;
  if (result.bytes <= SYNC_INDEX_MAX_BYTES) {
    sourceId = indexText(db, project, ev.sessionId, label, text, "text", chunks).sourceId;
    insertUnits(db, sourceId, ev.sessionId, buildUnits(text)); // r3-ledger
  } else {
    sourceId = reserveSource(db, sourceRowOf(project, ev.sessionId, label), chunks);
    indexDetached(project, ev.sessionId, sourceId, label, text, chunks);
  }
  const handle = sourceHandle(sourceId);
  // D-M7-SV-5: rank by the intent and the session's last user prompt (any word), so a bare cat still
  // returns the line the user asked for. The more line keeps the intent. No prompt -> intent alone.
  const prompt = await lastPrompt(project, ev.sessionId);
  const rankQuery = prompt.trim() === "" ? undefined : intent + " " + prompt;
  // D-M2-SHAPE-1: a parser-found shape (JSON rows, a line log) gives its rare units the query names, whole,
  // within the same budget, plus the handle. No shape or no named rare unit -> the BM25 pick below, unchanged.
  // D-CR3-HANDLE-1: one handle line replaces the more line and counts inside the budget. The budget per
  // replace is the size bound of D-CR3-HANDLE-1 (REPLACE_RETURN_BYTES of selection + the more line with the full
  // label); the selection gets that budget minus the handle line, so a replace never grows.
  // D-HA-GEMINI-HINT-1: a second query of the prompt words the output holds, so the call returns the asked line.
  const handleLine = REPLACE_HANDLE_LINE(intent, handle, result.bytes, row.toolNamePrefix, askedWords(intent, prompt, text));
  const budget = replaceBudget(handleLine, moreLine(intent, label));
  const digest = shapeDigest(text, rankQuery ?? intent, SHAPE_RETURN_BYTES); // D-M2-JSON-1
  if (digest !== null) return { kind: "replace", output: replaceOutput(digest, handleLine) };
  const selected = selectChunksInMemory(chunks, intent, budget, label, rankQuery);
  return { kind: "replace", output: selected.more !== null ? replaceOutput(selected.text, handleLine) : selected.text };
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

// D-M2-SHAPE-2: the whole output when the host persisted it to a file; an unreadable file keeps the head.
function wholeOutput(result: ToolResultInfo): string {
  const head = result.text ?? "";
  if (result.persistedPath === undefined) return head;
  try {
    return readFileSync(result.persistedPath, "utf8");
  } catch {
    return head;
  }
}

// D-M7-SV-5: best effort; a store that cannot open gives "" and the selection uses the intent alone.
async function lastPrompt(project: ProjectContext, sessionId: string): Promise<string> {
  try {
    return readLastPrompt(await openDb(project), sessionId);
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
// The source row is already reserved (D-CR3-HANDLE-2); chunks and line units land under its id.
function indexDetached(project: ProjectContext, sessionId: string, sourceId: number, label: string, text: string, chunks: Chunk[]): void {
  void openDb(project)
    .then((db) => {
      finishReserved(db, sourceId, sourceRowOf(project, sessionId, label), chunks, buildUnits(text)); // r3-ledger, D-R4-RESERVE-1
    })
    .catch((err: unknown) => {
      process.stderr.write("hooks: index write failed: " + message(err) + "\n");
    });
}

// The source fields a hook output stores (kind "content"). reserveSource and finishReserved take these only;
// the byte and chunk counts come from the chunks they write (DEVIATIONS D-CR3-HANDLE-2).
export function sourceRowOf(project: ProjectContext, sessionId: string, label: string): SourceDraft {
  return { sessionId, worktree: project.worktree, agent: project.agent, kind: "content", label, createdAt: Date.now() };
}

// ---------- §4.7 PreCompact ----------

async function preCompact(ev: CanonicalHookEvent, row: AdapterRow, project: ProjectContext): Promise<Decision> {
  const db = await openDb(project);
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
