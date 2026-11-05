// impl/10 §8 + shared decode/encode pseudocode; impl/09 §5.2 item 6 + A28; DECISIONS-r3 Q24.
// Kiro CLI V3 hooks are plain text only (https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-hooks-verified.md §2): exit 0 stdout goes to context,
// any non-zero exit blocks. denyChannel "hint-only" (impl/10 A3): no structured hint, deny or replace field.
import type { CanonicalEventName, CanonicalHookEvent, Decision, HookOutput, ToolResultInfo } from "../core/contracts/types.ts";

// D-R33-KIRO-NAMES-1: Kiro CLI 3.0 lists an MCP tool as "mcp_" + lowercase("<server>_<tool>") with every space and "-" turned
// into "_" (V3 engine bundle, function uel), so context-mode's tools are mcp_context_mode_ctx_*. The 2.x spelling
// mcp_context-mode_ stays a decode alias for hook payloads from older builds.
export const TOOL_NAME_PREFIX = "mcp_context_mode_";
const LEGACY_TOOL_NAME_PREFIX = "mcp_context-mode_";

// Native event name -> canonical; legacy names are aliases (impl/10 §8 event-name row, §1.4).
// UserPromptSubmit is the trigger the build writes (D-FU-RM-KIRO-1) and the hook_event_name in the Kiro docs'
// prompt hook payload (D-FU-RM-KIRO-2); PromptSubmit stays for hook files written by older builds.
const KIRO_EVENTS: Readonly<Record<string, CanonicalEventName>> = {
  SessionStart: "SessionStart",
  agentSpawn: "SessionStart",
  UserPromptSubmit: "UserPromptSubmit",
  PromptSubmit: "UserPromptSubmit",
  userPromptSubmit: "UserPromptSubmit",
  PreToolUse: "PreToolUse",
  preToolUse: "PreToolUse",
  PostToolUse: "PostToolUse",
  postToolUse: "PostToolUse",
};
// D-R33-KIRO-PROMPT-1: Kiro CLI 3.0 sends the prompt on stdin as "prompt" (V3 engine bundle, function sJn) and sets no
// USER_PROMPT; the env var stays the fallback for Kiro CLI 2.x (impl/10 §8).
const PROMPT_FIELD = "prompt";
const PROMPT_ENV = "USER_PROMPT";
const MCP_PREFIX = "mcp_";
// D-N7-KIRO-1. Event names: kiro.dev/docs/cli/v3/hooks-migration (2026-10-10), 2.x camelCase -> V3 PascalCase.
// Shell tool: the registered matcher "shell" is a category tag; kiro.dev/docs/custom-agents/configuration-reference (2026-10-10)
// lists the built-in ids execute_bash and execute_pwsh, and Kiro CLI 2.34.2 names the tool "shell" (execute_bash is its legacy alias).
export const SHELL_TOOL_NAMES: readonly string[] = Object.freeze(["execute_bash", "execute_pwsh", "shell"]);
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = Object.fromEntries(SHELL_TOOL_NAMES.map((n) => [n, "Bash"]));
const MCP_SEP = "_";

type Source = NonNullable<CanonicalHookEvent["source"]>;
const KIRO_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };

// Own tool -> bare ctx_*; mcp_<server>_<tool> -> "mcp:<server>:<tool>", split at the first "_" after "mcp_"
// (same rule as the VS Code family, DEVIATIONS D-M3-A4-3 / D-M3-A5-2); native names unchanged.
function canonicalName(name: string): string {
  if (name.startsWith(TOOL_NAME_PREFIX)) return name.slice(TOOL_NAME_PREFIX.length);
  if (name.startsWith(LEGACY_TOOL_NAME_PREFIX)) return name.slice(LEGACY_TOOL_NAME_PREFIX.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL, name)) return NATIVE_TO_CANONICAL[name];
  if (!name.startsWith(MCP_PREFIX)) return name;
  const rest = name.slice(MCP_PREFIX.length);
  const sep = rest.indexOf(MCP_SEP);
  if (sep <= 0 || sep === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep) + ":" + rest.slice(sep + MCP_SEP.length);
}

// Kiro documents no error field on PostToolUse; isError stays false, never guessed (impl/10 §8 result row).
function readResult(resp: unknown): ToolResultInfo {
  const text = resp === undefined ? "" : typeof resp === "string" ? resp : JSON.stringify(resp);
  return { isError: false, bytes: Buffer.byteLength(text), text };
}

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("kiro: hook payload is not a JSON object");
  const p = raw as Record<string, unknown>;
  const native = typeof p.hook_event_name === "string" ? p.hook_event_name : "";
  const event = Object.prototype.hasOwnProperty.call(KIRO_EVENTS, native) ? KIRO_EVENTS[native] : undefined;
  if (event === undefined) throw new Error("kiro: unknown hook event " + String(p.hook_event_name));
  // No subagent field on Kiro (Q24 item 7): agentId/agentType stay undefined.
  const ev: CanonicalHookEvent = { event, agent: "kiro", sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  if (event === "SessionStart" && typeof p.source === "string" && KIRO_SOURCES[p.source] !== undefined) ev.source = KIRO_SOURCES[p.source];
  if (event === "UserPromptSubmit") {
    const field = p[PROMPT_FIELD];
    const prompt = typeof field === "string" ? field : process.env[PROMPT_ENV];
    if (prompt !== undefined) ev.prompt = prompt;
  }
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool_name ?? "");
    const input = typeof p.tool_input === "object" && p.tool_input !== null && !Array.isArray(p.tool_input) ? (p.tool_input as Record<string, unknown>) : {};
    ev.tool = { name, canonicalName: canonicalName(name), input };
  }
  if (event === "PostToolUse") ev.result = readResult(p.tool_response);
  return ev;
}

// UserPromptSubmit: hint -> plain stdout, exit 0 (D-R33-KIRO-RECALL-1: Kiro CLI 3.0 uJn/cJn sends it to the model);
// every other decision -> stdout "" exit 0 (A28).
// hint -> plain text stdout, exit 0. deny -> plain text reason (rewrite first) on stderr, exit 2: Kiro blocks the
// tool and returns STDERR to the agent (Kiro CLI 2.x reference; D-HF-KIRO-SHELL-1, was D-M3-A5-1). replace -> no-op.
export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  if (ev.event === "UserPromptSubmit") return { stdout: d.kind === "hint" ? d.text : "", exitCode: 0 };
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return { stdout: d.text, exitCode: 0 };
    case "deny":
      return { stdout: "", stderr: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason, exitCode: 2 };
    case "replace":
      return { stdout: "", exitCode: 0 };
  }
}
