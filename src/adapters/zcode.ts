// impl/10 §9: ZCode uses the Claude hook shape with camelCase twins (spike-hooks-verified §2).
// Own prefix is the documented ZCode MCP name mcp__<server>__<tool> (D-N7-ZCODE-NAMES-1); native names are Claude names.
// Twins: decode reads snake_case first, then the camelCase twin, for the two rows impl/10 §9 names.
// PostToolUseFailure decodes to canonical PostToolUse with isError (impl/10 §9 "+Failure", DEVIATIONS D-M3-A6-1).
// No replace field is documented.
import type { CanonicalHookEvent, Decision, HookOutput } from "../core/contracts/types.ts";
import { decodeClaudeShape, encodeClaudeShape } from "./claude-code.ts";

// zcode.z.ai/en/docs/subagents: "in the form `mcp__<server>__<tool>`"; ZCode core/src/mcp/name.ts keeps "-" in the server part.
export const TOOL_NAME_PREFIX = "mcp__context-mode__";

type Source = NonNullable<CanonicalHookEvent["source"]>;
const ZCODE_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };

// snake_case field -> its camelCase twin (impl/10 §9 rows "event name" and "sessionId").
const TWINS: Readonly<Record<string, string>> = { hook_event_name: "hookEventName", session_id: "sessionId" };

const FAILURE_EVENT = "PostToolUseFailure";

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("zcode: hook payload is not a JSON object");
  const p: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [snake, camel] of Object.entries(TWINS)) if (p[snake] === undefined) p[snake] = p[camel];
  const failure = p.hook_event_name === FAILURE_EVENT;
  if (failure) p.hook_event_name = "PostToolUse";
  const ev = decodeClaudeShape(p, "zcode", TOOL_NAME_PREFIX, ZCODE_SOURCES);
  if (failure) {
    const text = typeof p.error === "string" ? p.error : p.error === undefined ? "" : JSON.stringify(p.error);
    ev.result = { isError: true, bytes: Buffer.byteLength(text), text };
  }
  return ev;
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  return encodeClaudeShape(ev, d, false);
}
