// impl/10 §11; DEVIATIONS D-M5-arch-2, D-M5-A1-1. OpenCode 2 is in-process (ADR-0001 §3): the plugin entry calls
// handleHook with a raw object whose `type` is the hook call-site name, plus the hook argument fields.
// decode/encode exist so handleHook stays one code path for every agent (ADR-0001 Decision 3).
import { SERVER_KEY } from "../core/contracts/constants.ts";
import type { AuxEventName, CanonicalEventName, CanonicalHookEvent, Decision, HookOutput, ToolResultInfo } from "../core/contracts/types.ts";

export const TOOL_NAME_PREFIX = ""; // impl/10 §1.3

// Wire prefix OpenCode puts on this server's tools: `context-mode_ctx_execute` (TECH-SPEC §3.8, impl/12 §4.4 step 1).
const OWN_WIRE_PREFIX = SERVER_KEY + "_";

// Call-site name -> canonical event (impl/10 §1.4; Usage = step-finish cost row, D-M5-arch-2).
const OPENCODE_EVENTS: Readonly<Record<string, CanonicalEventName | AuxEventName>> = {
  context: "SessionStart",
  prompt: "UserPromptSubmit",
  "execute.before": "PreToolUse",
  "execute.after": "PostToolUse",
  compaction: "PreCompact",
  "step-finish": "Usage",
};

// OpenCode native tool name -> canonical name decide() knows (#1052). Names not listed stay as received.
// D-HF-OPENCODE-SHELL-1: OpenCode's built-in shell tool is `bash` with `args.command` (opencode.ai/docs/tools, opencode-ai 1.19.4).
// D-OC2-SETUP-1: OpenCode 2.2.5 names the same tool `shell` (args.command); 1.19 and KiloCode keep `bash`.
export const SHELL_TOOL_NAME = "bash";
export const SHELL_TOOL_NAMES: readonly string[] = Object.freeze([SHELL_TOOL_NAME, "shell"]); // both map to canonical Bash; the table row keeps "bash" (nativeTools is the 1.19 name)
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = { webfetch: "WebFetch", ...Object.fromEntries(SHELL_TOOL_NAMES.map((n) => [n, "Bash"])) };

export function toCanonicalTool(name: string): string {
  if (name.startsWith(OWN_WIRE_PREFIX)) return name.slice(OWN_WIRE_PREFIX.length);
  return Object.prototype.hasOwnProperty.call(NATIVE_TO_CANONICAL, name) ? NATIVE_TO_CANONICAL[name] : name;
}

function record(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function readResult(p: Record<string, unknown>): ToolResultInfo {
  const text = p.output === undefined ? "" : typeof p.output === "string" ? p.output : JSON.stringify(p.output);
  const info: ToolResultInfo = { isError: p.isError === true, bytes: Buffer.byteLength(text), text };
  if (typeof p.exitCode === "number") info.exitCode = p.exitCode;
  return info;
}

// cwd is the plugin-init `directory` (impl/10 §11 cwd row). The per-request `context` firing is de-duplicated by
// the caller (impl/10 §11 Errors), so decode stays a pure mapping.
export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("opencode: hook payload is not an object");
  const p = raw as Record<string, unknown>;
  const native = typeof p.type === "string" ? p.type : "";
  const event = Object.prototype.hasOwnProperty.call(OPENCODE_EVENTS, native) ? OPENCODE_EVENTS[native] : undefined;
  if (event === undefined) throw new Error("opencode: unknown hook event " + String(p.type));
  // No documented subagent field on OpenCode: agentId/agentType stay undefined (impl/10 §11).
  const ev: CanonicalHookEvent = { event, agent: "opencode", sessionId: String(p.sessionID ?? ""), cwd: String(p.directory ?? "") };
  if (event === "UserPromptSubmit" && typeof p.message === "string") ev.prompt = p.message;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool ?? "");
    ev.tool = { name, canonicalName: toCanonicalTool(name), input: record(p.args) };
    if (typeof p.callID === "string") ev.tool.callId = p.callID;
  }
  if (event === "PostToolUse") ev.result = readResult(p);
  if (typeof p.turn === "number") ev.turn = p.turn;
  return ev;
}

// hint: only the session `context` hook carries text (no tool hint field). deny: only `execute.before` can fail
// (Tool.Error(reason)), rewrite first, exit 2; the `prompt` hook cannot fail. replace: no documented field, no-op.
// Never throws (shared encode step 3).
export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return { stdout: ev.event === "SessionStart" ? d.text : "", exitCode: 0 };
    case "deny":
      if (ev.event !== "PreToolUse") return { stdout: "", exitCode: 0 };
      return { stdout: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason, exitCode: 2 };
    case "replace":
      return { stdout: "", exitCode: 0 };
  }
}
