// impl/10 §4 + shared decode/encode pseudocode. Gemini CLI (gemini-cli@51617c1, spike-hooks-verified.md Gemini row).
// Native events: SessionStart (decoded, but no hook entry since D-FU-GCH-1) / BeforeAgent / BeforeTool / AfterTool, plus PreCompress -> aux PreCompact (impl/10 §1.4).
// Own prefix mcp_context-mode_ (single underscore, TECH-SPEC §3.8). No subagent field, no BeforeTool hint field,
// replace is AfterTool decision deny + reason (D-HA-GEMINI-REPLACE-1). Deny is the JSON `decision` field on exit 0 (DEVIATIONS D-M3-A1-1).
import type { CanonicalHookEvent, Decision, HookOutput, ToolResultInfo } from "../core/contracts/types.ts";

export const TOOL_NAME_PREFIX = "mcp_context-mode_"; // impl/10 §1.3, TECH-SPEC §3.8 Gemini row

type Event = CanonicalHookEvent["event"];
type Source = NonNullable<CanonicalHookEvent["source"]>;

// Reverse of the table.ts gemini eventMap row (impl/10 §1.4).
const GEMINI_EVENTS: Readonly<Record<string, Event>> = {
  SessionStart: "SessionStart",
  BeforeAgent: "UserPromptSubmit",
  BeforeTool: "PreToolUse",
  AfterTool: "PostToolUse",
  PreCompress: "PreCompact",
};

// Gemini SessionStartSource is startup|resume|clear only; compact never arrives (impl/10 §4 gap row).
const GEMINI_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear" };

// Events whose native output reads hookSpecificOutput.additionalContext (spike matrix; BeforeTool has none).
const HINT_EVENTS: readonly Event[] = ["SessionStart", "UserPromptSubmit", "PostToolUse"];
// Events whose native output reads decision deny/block (spike matrix: BeforeAgent, BeforeTool).
const DENY_EVENTS: readonly Event[] = ["UserPromptSubmit", "PreToolUse"];

const EMPTY: HookOutput = { stdout: "", exitCode: 0 };

function own(p: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(p, key) ? p[key] : undefined;
}

// Own tool -> bare ctx_* name; another MCP server's tool -> "mcp:<server>:<tool>" read from the payload's
// mcp_context {server_name, tool_name}, never split out of the sanitized name (DEVIATIONS D-M3-A1-2);
// the four native ids in NATIVE_TO_CANONICAL map to canonical names; other native names unchanged (impl/01 §2).
// gemini-cli 0.65.0 SHELL/READ_FILE/GREP/WEB_FETCH_TOOL_NAME -> canonical name (D-HA-GEMINI-NAMES-1).
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = {
  run_shell_command: "Bash",
  read_file: "Read",
  grep_search: "Grep",
  web_fetch: "WebFetch",
};

function canonicalName(name: string, mcp: unknown): string {
  if (name.startsWith(TOOL_NAME_PREFIX)) return name.slice(TOOL_NAME_PREFIX.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL, name)) return NATIVE_TO_CANONICAL[name];
  if (typeof mcp !== "object" || mcp === null) return name;
  const m = mcp as Record<string, unknown>;
  const server = own(m, "server_name");
  const tool = own(m, "tool_name");
  if (typeof server !== "string" || typeof tool !== "string") return name;
  return "mcp:" + server + ":" + tool;
}

// tool_response is Gemini's {llmContent, returnDisplay, error?}; a non-null `error` marks failure (DEVIATIONS D-M3-A1-3).
// D-HA-GEMINI-REPLACE-1: a string llmContent is the text the model sees, so it is the result text a replace selects
// from; any other shape (Part list) stays the JSON text, as before.
function readResult(resp: unknown): ToolResultInfo {
  const obj = typeof resp === "object" && resp !== null ? (resp as Record<string, unknown>) : undefined;
  const llm = obj === undefined ? undefined : own(obj, "llmContent");
  const text = resp === undefined ? "" : typeof resp === "string" ? resp : typeof llm === "string" ? llm : JSON.stringify(resp);
  const err = obj === undefined ? undefined : own(obj, "error");
  return { isError: err !== undefined && err !== null, bytes: Buffer.byteLength(text), text };
}

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("gemini: hook payload is not a JSON object");
  const p = raw as Record<string, unknown>;
  const native = own(p, "hook_event_name");
  const event = typeof native === "string" && Object.hasOwn(GEMINI_EVENTS, native) ? GEMINI_EVENTS[native] : undefined;
  if (event === undefined) throw new Error("gemini: unknown hook event " + String(native));
  const ev: CanonicalHookEvent = { event, agent: "gemini", sessionId: String(own(p, "session_id") ?? ""), cwd: String(own(p, "cwd") ?? "") };
  const source = own(p, "source");
  if (event === "SessionStart" && typeof source === "string" && Object.hasOwn(GEMINI_SOURCES, source)) ev.source = GEMINI_SOURCES[source];
  const prompt = own(p, "prompt");
  if (event === "UserPromptSubmit" && typeof prompt === "string") ev.prompt = prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(own(p, "tool_name") ?? "");
    const input = own(p, "tool_input");
    ev.tool = {
      name,
      canonicalName: canonicalName(name, own(p, "mcp_context")),
      input: typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {},
    };
  }
  if (event === "PostToolUse") ev.result = readResult(own(p, "tool_response"));
  return ev;
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  switch (d.kind) {
    case "allow":
      return EMPTY;
    case "hint":
      // BeforeTool has no hint field: dropped (impl/10 shared encode step 1); PreCompress is advisory.
      if (!HINT_EVENTS.includes(ev.event)) return EMPTY;
      return { stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: d.text } }), exitCode: 0 };
    case "deny":
      if (!DENY_EVENTS.includes(ev.event)) return EMPTY;
      return { stdout: JSON.stringify({ decision: "deny", reason: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason }), exitCode: 0 };
    case "replace":
      // gemini-cli 0.65.0 docs/hooks/reference.md AfterTool: decision "deny" + reason, the reason replaces the tool
      // result sent to the model (D-HA-GEMINI-REPLACE-1).
      if (ev.event !== "PostToolUse") return EMPTY;
      return { stdout: JSON.stringify({ decision: "deny", reason: d.output }), exitCode: 0 };
  }
}
