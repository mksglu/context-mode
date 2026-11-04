// impl/10 §7 + shared decode/encode pseudocode; ADR-0016 VS Code row (case C: no replace channel).
// VS Code hooks send the Claude-style snake_case payload; tool names are mcp_<server>_<tool> (TECH-SPEC §3.8).
// PreCompact is the aux event that sets the pending flag (ADR-0009 §6, impl/09 §4.7, DEVIATIONS D-M3-A4-1).
import type { CanonicalEventName, AuxEventName, CanonicalHookEvent, Decision, HookOutput, ToolResultInfo } from "../core/contracts/types.ts";
import { encodeClaudeShape } from "./claude-code.ts";

export const TOOL_NAME_PREFIX = "mcp_context-mode_"; // impl/10 §1.3, TECH-SPEC §3.8 VS Code row

const VSCODE_EVENTS: readonly (CanonicalEventName | AuxEventName)[] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact"];
const MCP_PREFIX = "mcp_";
const MCP_SEP = "_";
const SESSION_START_NEW = "new"; // impl/10 §7: SessionStart fires only with source "new" (first turn)

// Own tool -> bare ctx_*; mcp_<server>_<tool> -> "mcp:<server>:<tool>", split at the first "_" after "mcp_"
// (DEVIATIONS D-M3-A4-3); native names unchanged.
// D-N7-VSCODE-TOOLS-1: one list of the documented tool names, used by the decoder and the table row.
// Local harness ids (microsoft/vscode 1.145.0, vscode-copilot-chat 0.44.0 toolNames.ts): run_in_terminal, read_file,
// fetch_webpage. Copilot harness runtime names (docs.github.com copilot/reference/hooks-reference, "Tool names for
// hook matching"): bash, powershell, view, web_fetch. runTerminalCommand is in no source; the next.7 npm-package
// test received it live, so it is mapped as observed. A PascalCase payload names Bash, Read, WebFetch (canonical).
export const SHELL_TOOL_NAMES: readonly string[] = Object.freeze(["run_in_terminal", "runTerminalCommand", "bash", "powershell"]);
export const READ_TOOL_NAMES: readonly string[] = Object.freeze(["read_file", "view"]);
export const WEBFETCH_TOOL_NAMES: readonly string[] = Object.freeze(["fetch_webpage", "web_fetch"]);
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = Object.fromEntries([
  ...SHELL_TOOL_NAMES.map((n) => [n, "Bash"]),
  ...READ_TOOL_NAMES.map((n) => [n, "Read"]),
  ...WEBFETCH_TOOL_NAMES.map((n) => [n, "WebFetch"]),
]);

function canonicalName(name: string): string {
  if (name.startsWith(TOOL_NAME_PREFIX)) return name.slice(TOOL_NAME_PREFIX.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL, name)) return NATIVE_TO_CANONICAL[name];
  if (!name.startsWith(MCP_PREFIX)) return name;
  const rest = name.slice(MCP_PREFIX.length);
  const sep = rest.indexOf(MCP_SEP);
  if (sep <= 0 || sep === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep) + ":" + rest.slice(sep + MCP_SEP.length);
}

// The policy reads Claude keys (file_path, offset, limit, url). Each tool's documented keys are mapped once here:
// read_file {filePath, startLine, endLine} (vscode-copilot-chat package.json copilot_readFile), view {path, view_range}
// (Copilot runtime), fetch_webpage {urls[], query}. The first url is the one checked. Source keys are kept.
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function policyInput(name: string, canonical: string, input: Record<string, unknown>): Record<string, unknown> {
  if (canonical === "Read" && READ_TOOL_NAMES.includes(name)) {
    const out: Record<string, unknown> = { ...input };
    if (name === "read_file") {
      if (typeof input.filePath === "string") out.file_path = input.filePath;
      if (isNum(input.startLine)) out.offset = input.startLine;
      if (isNum(input.startLine) && isNum(input.endLine) && input.endLine >= input.startLine) out.limit = input.endLine - input.startLine + 1;
    } else if (Array.isArray(input.view_range) && isNum(input.view_range[0])) {
      out.offset = input.view_range[0];
      const end = input.view_range[1];
      if (isNum(end) && end >= input.view_range[0]) out.limit = end - input.view_range[0] + 1;
    }
    return out;
  }
  if (canonical === "WebFetch" && name === "fetch_webpage" && Array.isArray(input.urls) && typeof input.urls[0] === "string") {
    return { ...input, url: input.urls[0] };
  }
  return input;
}

function readResult(resp: unknown): ToolResultInfo {
  const text = resp === undefined ? "" : typeof resp === "string" ? resp : JSON.stringify(resp);
  const isError = typeof resp === "object" && resp !== null && (resp as { is_error?: unknown }).is_error === true;
  return { isError, bytes: Buffer.byteLength(text), text };
}

// D-HF-VSCODE-DECODE-1: two documented payload shapes, one key set each, chosen by the event name's casing.
// snake: Local harness and the PascalCase alias (code.visualstudio.com/docs/agents/reference/hooks-reference,
// "Common input"): hook_event_name, session_id, tool_name, tool_input, tool_response. camel: Copilot harness
// camelCase events (docs.github.com/en/copilot/reference/hooks-reference): sessionId, toolName, toolArgs,
// toolResult {resultType, textResultForLlm}; the documented payload names no event, a live next.6 payload
// carried hookEventName. No cross-reading of keys between the two.
const CAMEL_EVENTS: Readonly<Record<string, CanonicalEventName | AuxEventName>> = {
  sessionStart: "SessionStart", userPromptSubmitted: "UserPromptSubmit", preToolUse: "PreToolUse", postToolUse: "PostToolUse", preCompact: "PreCompact",
};
// A camelCase payload with no event name: each event has its own key (GitHub hooks reference payload types).
const EVENT_BY_KEY: readonly (readonly [string, string])[] = [
  ["toolResult", "postToolUse"], ["toolName", "preToolUse"], ["prompt", "userPromptSubmitted"], ["source", "sessionStart"], ["trigger", "preCompact"],
];
const SESSION_SOURCES: Readonly<Record<string, NonNullable<CanonicalHookEvent["source"]>>> = { new: "startup", startup: "startup", resume: "resume" };
const RESULT_SUCCESS = "success";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// toolArgs arrives as an object or as a JSON-encoded string; anything else is {} (same rule as copilot-cli).
function readArgs(v: unknown): Record<string, unknown> {
  if (isRecord(v)) return v;
  if (typeof v !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(v);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readCamelResult(v: unknown): ToolResultInfo {
  const r = isRecord(v) ? v : {};
  const text = typeof r.textResultForLlm === "string" ? r.textResultForLlm : "";
  return { isError: typeof r.resultType === "string" && r.resultType !== RESULT_SUCCESS, bytes: Buffer.byteLength(text), text };
}

function decodeCamel(p: Record<string, unknown>, name: unknown): CanonicalHookEvent {
  const event = typeof name === "string" ? CAMEL_EVENTS[name] ?? VSCODE_EVENTS.find((e) => e === name) : undefined;
  if (event === undefined) throw new Error("vscode: unknown hook event " + String(name));
  const ev: CanonicalHookEvent = { event, agent: "vscode", sessionId: String(p.sessionId ?? ""), cwd: String(p.cwd ?? "") };
  if (event === "SessionStart" && typeof p.source === "string" && SESSION_SOURCES[p.source] !== undefined) ev.source = SESSION_SOURCES[p.source];
  if (event === "UserPromptSubmit" && typeof p.prompt === "string") ev.prompt = p.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const toolName = String(p.toolName ?? "");
    const canonical = canonicalName(toolName);
    ev.tool = { name: toolName, canonicalName: canonical, input: policyInput(toolName, canonical, readArgs(p.toolArgs)) };
  }
  if (event === "PostToolUse") ev.result = readCamelResult(p.toolResult);
  return ev;
}

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("vscode: hook payload is not a JSON object");
  const p = raw as Record<string, unknown>;
  if (p.hookEventName !== undefined) return decodeCamel(p, p.hookEventName);
  if (p.hook_event_name === undefined) {
    const byKey = EVENT_BY_KEY.find(([key]) => Object.hasOwn(p, key))?.[1];
    if (byKey === undefined) throw new Error("vscode: missing required field hook_event_name"); // never a silent drop
    return decodeCamel(p, byKey);
  }
  const event = VSCODE_EVENTS.find((e) => e === p.hook_event_name);
  if (event === undefined) throw new Error("vscode: unknown hook event " + String(p.hook_event_name));
  // session_id optional. cwd is the common input field (VS Code hooks reference, "Common input"); it is the
  // hook's one project channel (D-HF-VSCODE-PROJECT-1); the server's is --workspace-folder. No subagent field.
  const ev: CanonicalHookEvent = { event, agent: "vscode", sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  if (event === "SessionStart" && p.source === SESSION_START_NEW) ev.source = "startup"; // DEVIATIONS D-M3-A4-2
  if (event === "UserPromptSubmit" && typeof p.prompt === "string") ev.prompt = p.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool_name ?? "");
    const input = isRecord(p.tool_input) ? p.tool_input : {};
    const canonical = canonicalName(name);
    ev.tool = { name, canonicalName: canonical, input: policyInput(name, canonical, input) };
  }
  if (event === "PostToolUse") ev.result = readResult(p.tool_response);
  return ev;
}

// hint -> additionalContext; deny -> permissionDecision "deny" + reason (rewrite first, ADR-0016 case B);
// replace -> silent no-op, VS Code has no output-replace field (ADR-0016 case C, impl/10 §7).
export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  return encodeClaudeShape(ev, d, false);
}
