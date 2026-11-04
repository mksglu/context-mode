// impl/10 §6 + shared decode/encode pseudocode; spike-hooks-verified §2 (Copilot CLI 1.0.96).
// Dual-cased payload: camelCase event names carry camelCase keys (hookEventName, sessionId, toolName,
// toolArgs, toolResult); PascalCase event names carry snake_case keys (hook_event_name, session_id,
// tool_name, tool_input, tool_result). Subagent fields [U] (S-NAMES): never set.
// Deny is plain deny-with-reason, never modifiedArgs (ADR-0008 per-adapter table: unverified).
// Decisions not fixed by the docs: DEVIATIONS D-M3-A3-1..4.
import type { CanonicalEventName, CanonicalHookEvent, Decision, HookOutput, ToolCall, ToolResultInfo } from "../core/contracts/types.ts";

// Copilot CLI 1.0.103 names MCP tools <server>-<tool> ("github-mcp-server-search_code",
// "playwright-browser_take_screenshot" in the shipped bundle); server key "context-mode" (D-HQ-COPILOT-NAMES-2).
export const TOOL_NAME_PREFIX = "context-mode-";

type Source = NonNullable<CanonicalHookEvent["source"]>;
type Casing = "camel" | "snake";
interface NativeEvent { event: CanonicalEventName; casing: Casing; failure: boolean }

// impl/10 §1.4 + §6 event row: both casings, plus the PostToolUse failure variant.
const NATIVE_EVENTS: Readonly<Record<string, NativeEvent>> = {
  sessionStart: { event: "SessionStart", casing: "camel", failure: false },
  userPromptSubmitted: { event: "UserPromptSubmit", casing: "camel", failure: false },
  preToolUse: { event: "PreToolUse", casing: "camel", failure: false },
  postToolUse: { event: "PostToolUse", casing: "camel", failure: false },
  postToolUseFailure: { event: "PostToolUse", casing: "camel", failure: true },
  SessionStart: { event: "SessionStart", casing: "snake", failure: false },
  UserPromptSubmit: { event: "UserPromptSubmit", casing: "snake", failure: false },
  PreToolUse: { event: "PreToolUse", casing: "snake", failure: false },
  PostToolUse: { event: "PostToolUse", casing: "snake", failure: false },
  PostToolUseFailure: { event: "PostToolUse", casing: "snake", failure: true },
};

// impl/10 §6: enum startup/resume/new; "new" is a first start (D-M3-A3-2). No compact re-fire.
const COPILOT_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", new: "startup" };

const KEYS: Readonly<Record<Casing, { event: string; session: string; tool: string; args: string; result: string }>> = {
  camel: { event: "hookEventName", session: "sessionId", tool: "toolName", args: "toolArgs", result: "toolResult" },
  snake: { event: "hook_event_name", session: "session_id", tool: "tool_name", args: "tool_input", result: "tool_result" },
};

const RESULT_SUCCESS = "success";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// copilot-cli 1.0.103 native shell tool id -> canonical name (D-HA-COPILOT-NAMES-1, SDK docs toolName "bash").
// D-PWSH-DUMP-1: the Windows shell tool is "powershell" (same as vscode.ts SHELL_TOOL_NAMES); it is the same canonical shell.
export const SHELL_TOOL_NAMES: readonly string[] = Object.freeze(["bash", "powershell"]);
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = Object.fromEntries(SHELL_TOOL_NAMES.map((n) => [n, "Bash"]));

// Own tool -> bare ctx_* name; native names mapped; any other name unchanged. Another server's
// <server>-<tool> name cannot be split (both parts may hold "-"), so it stays whole (D-HQ-COPILOT-NAMES-2).
function canonicalName(name: string): string {
  if (name.startsWith(TOOL_NAME_PREFIX)) return name.slice(TOOL_NAME_PREFIX.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL, name)) return NATIVE_TO_CANONICAL[name];
  return name;
}

// toolArgs arrives as an object or as a JSON-encoded string (D-M3-A3-3); anything else is {}.
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

// One result shape per casing (D-HA-COPILOT-REPLACE-1): camel toolResult {resultType, textResultForLlm},
// snake tool_result {result_type, text_result_for_llm}.
const RESULT_KEYS: Readonly<Record<Casing, { type: string; text: string }>> = {
  camel: { type: "resultType", text: "textResultForLlm" },
  snake: { type: "result_type", text: "text_result_for_llm" },
};

function readResult(v: unknown, casing: Casing, failure: boolean): ToolResultInfo {
  const k = RESULT_KEYS[casing];
  const r = isRecord(v) ? v : {};
  const text = typeof r[k.text] === "string" ? (r[k.text] as string) : "";
  const isError = failure || (typeof r[k.type] === "string" && r[k.type] !== RESULT_SUCCESS);
  return { isError, bytes: Buffer.byteLength(text), text };
}

// D-HQ-COPILOT-EVENT-1: the documented camelCase payload (docs.github.com/en/copilot/reference/hooks-configuration)
// names no event. Each event has its own key set: toolResult = postToolUse, toolName = preToolUse,
// prompt = userPromptSubmitted, source = sessionStart. A payload that names its event keeps that name.
const EVENT_BY_KEY: readonly (readonly [string, string])[] = [
  ["toolResult", "postToolUse"], ["toolName", "preToolUse"], ["prompt", "userPromptSubmitted"], ["source", "sessionStart"],
];

function eventName(raw: Record<string, unknown>): unknown {
  if (typeof raw.hookEventName === "string") return raw.hookEventName;
  if (raw.hook_event_name !== undefined) return raw.hook_event_name;
  return EVENT_BY_KEY.find(([key]) => Object.hasOwn(raw, key))?.[1];
}

export function decode(raw: unknown): CanonicalHookEvent {
  if (!isRecord(raw)) throw new Error("copilot-cli: hook payload is not a JSON object");
  const name = eventName(raw);
  const native = typeof name === "string" ? NATIVE_EVENTS[name] : undefined;
  if (native === undefined) throw new Error("copilot-cli: unknown hook event " + String(name));
  const k = KEYS[native.casing];
  const event = native.event;
  const ev: CanonicalHookEvent = { event, agent: "copilot-cli", sessionId: String(raw[k.session] ?? ""), cwd: String(raw.cwd ?? "") };
  if (event === "SessionStart" && typeof raw.source === "string" && COPILOT_SOURCES[raw.source] !== undefined) ev.source = COPILOT_SOURCES[raw.source];
  if (event === "UserPromptSubmit" && typeof raw.prompt === "string") ev.prompt = raw.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const toolName = String(raw[k.tool] ?? "");
    const tool: ToolCall = { name: toolName, canonicalName: canonicalName(toolName), input: readArgs(raw[k.args]) };
    ev.tool = tool;
  }
  if (event === "PostToolUse") ev.result = readResult(raw[k.result], native.casing, native.failure);
  return ev;
}

const EMPTY: HookOutput = { stdout: "", exitCode: 0 };

// Deny exits 0 with the JSON deny field (DEVIATIONS D-M0-T8-1, same rule as the Claude shape).
// hint on PostToolUse and deny off PreToolUse have no native field: silent no-op (D-M3-A3-4).
export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  switch (d.kind) {
    case "allow":
      return EMPTY;
    case "hint":
      return ev.event === "PostToolUse" ? EMPTY : { stdout: JSON.stringify({ additionalContext: d.text }), exitCode: 0 };
    case "deny":
      if (ev.event !== "PreToolUse") return EMPTY;
      return {
        stdout: JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason }),
        exitCode: 0,
      };
    case "replace":
      // D-HA-COPILOT-REPLACE-1: postToolUse output modifiedResult replaces the tool result (copilot SDK types.d.ts).
      if (ev.event !== "PostToolUse") return EMPTY;
      return { stdout: JSON.stringify({ modifiedResult: { resultType: RESULT_SUCCESS, textResultForLlm: d.output } }), exitCode: 0 };
  }
}
