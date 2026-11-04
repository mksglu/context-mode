// impl/10 §10; DEVIATIONS D-M5-A1-1. Pi is in-process (ADR-0001 §3): the plugin entry calls handleHook with a raw
// object whose `type` is the call-site event name (`pi.on(<type>, ...)`), plus the handler argument fields.
// decode/encode exist so handleHook stays one code path for every agent (ADR-0001 Decision 3).
import { PI_ROLE } from "../core/contracts/constants.ts";
import type { CanonicalEventName, CanonicalHookEvent, Decision, HookOutput, ToolResultInfo } from "../core/contracts/types.ts";

export const TOOL_NAME_PREFIX = ""; // impl/10 §1.3: Pi registers ctx_* under their bare names

type Source = NonNullable<CanonicalHookEvent["source"]>;
interface EventRow { event: CanonicalEventName; source?: Source }

// Call-site name -> canonical event (impl/10 §1.4, §10 SessionStart.source row).
const PI_EVENTS: Readonly<Record<string, EventRow>> = {
  session_start: { event: "SessionStart", source: "startup" },
  session_compact: { event: "SessionStart", source: "compact" },
  input: { event: "UserPromptSubmit" },
  tool_call: { event: "PreToolUse" },
  tool_result: { event: "PostToolUse" },
};


/** Pi's encoded output: the native HookOutput plus the custom-role message the entry injects (#1263, #1180). */
export interface PiHookOutput extends HookOutput {
  role: typeof PI_ROLE;
  content: string;
  timestamp: number;
}

// pi 1.4.0 built-in tool names -> canonical names (D-HA-PI-NAMES-1, dist/core/tools name: "bash" / "read").
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = { bash: "Bash", read: "Read" };

function record(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function readResult(p: Record<string, unknown>): ToolResultInfo {
  const text = p.content === undefined ? "" : typeof p.content === "string" ? p.content : JSON.stringify(p.content);
  const info: ToolResultInfo = { isError: p.isError === true, bytes: Buffer.byteLength(text), text };
  if (typeof p.exitCode === "number") info.exitCode = p.exitCode;
  return info;
}

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("pi: hook payload is not an object");
  const p = raw as Record<string, unknown>;
  const native = typeof p.type === "string" ? p.type : "";
  const row = Object.prototype.hasOwnProperty.call(PI_EVENTS, native) ? PI_EVENTS[native] : undefined;
  if (row === undefined) throw new Error("pi: unknown hook event " + String(p.type));
  // No documented subagent field on Pi: agentId/agentType stay undefined (impl/10 §10).
  const ev: CanonicalHookEvent = { event: row.event, agent: "pi", sessionId: String(p.sessionId ?? ""), cwd: String(p.cwd ?? "") };
  if (row.source !== undefined) ev.source = row.source;
  if (row.event === "UserPromptSubmit" && typeof p.message === "string") ev.prompt = p.message;
  if (row.event === "PreToolUse" || row.event === "PostToolUse") {
    const name = String(p.toolName ?? "");
    ev.tool = { name, canonicalName: Object.hasOwn(NATIVE_TO_CANONICAL, name) ? NATIVE_TO_CANONICAL[name] : name, input: record(p.input) };
    if (typeof p.toolCallId === "string") ev.tool.callId = p.toolCallId;
  }
  if (row.event === "PostToolUse") ev.result = readResult(p);
  if (typeof p.turn === "number") ev.turn = p.turn;
  return ev;
}

// hint: only session text carries it (no tool_call hint field, impl/10 §10). deny: tool_call {block, reason},
// rewrite first, exit 2. replace: the tool_result rewrite (ADR-0016 case C). Never throws: a decision Pi
// cannot express, or none at all, encodes as the empty allow (shared encode step 3).
function stdoutFor(ev: CanonicalHookEvent, d: Decision | undefined): HookOutput {
  switch (d?.kind) {
    case "hint":
      return { stdout: ev.event === "SessionStart" ? d.text : "", exitCode: 0 };
    case "deny":
      if (ev.event !== "PreToolUse") return { stdout: "", exitCode: 0 };
      return { stdout: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason, exitCode: 2 };
    case "replace":
      return { stdout: ev.event === "PostToolUse" ? d.output : "", exitCode: 0 };
  }
  return { stdout: "", exitCode: 0 };
}

// allow injects nothing: the native empty shape. Every other result carries the custom-role message fields.
export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput | PiHookOutput {
  const out = stdoutFor(ev, d);
  if (d?.kind === "allow") return out;
  return { stdout: out.stdout, exitCode: out.exitCode, role: PI_ROLE, content: out.stdout, timestamp: Date.now() };
}

/** impl/10 §10 deny field: the `tool_call` handler return value for an encoded output. */
export function checkPermission(out: HookOutput): { block: true; reason: string } | undefined {
  return out.exitCode === 2 ? { block: true, reason: out.stdout } : undefined;
}
