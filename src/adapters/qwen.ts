// impl/10 §5: Qwen Code 0.25.1 uses the Claude hook shape (plus transcript_path, permission_mode, timestamp).
// Own prefix is the hyphen form (DECISIONS-r9 R2); no replace field. Native tool ids map to the canonical
// names of impl/01 §2 by table lookup; both shell names stay until S-NAMES closes (impl/10 §1.5b, A6).
// PostToolUseFailure decodes to canonical PostToolUse with isError (impl/10 §5 "+Failure", DEVIATIONS D-M3-A2-1).
import type { CanonicalHookEvent, Decision, HookOutput } from "../core/contracts/types.ts";
import { decodeClaudeShape, encodeClaudeShape } from "./claude-code.ts";

export const TOOL_NAME_PREFIX = "mcp__context-mode__"; // impl/10 §1.3, DECISIONS-r9 R2

type Source = NonNullable<CanonicalHookEvent["source"]>;
const QWEN_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };

// impl/10 §1.3a qwen row -> canonical name; Claude aliases are not listed and pass through unchanged.
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = {
  run_shell_command: "Bash",
  Shell: "Bash",
  read_file: "Read",
  grep_search: "Grep",
  web_fetch: "WebFetch",
};

const FAILURE_EVENT = "PostToolUseFailure";

export function decode(raw: unknown): CanonicalHookEvent {
  const failure = typeof raw === "object" && raw !== null && !Array.isArray(raw) && (raw as Record<string, unknown>).hook_event_name === FAILURE_EVENT;
  const payload = failure ? { ...(raw as Record<string, unknown>), hook_event_name: "PostToolUse" } : raw;
  const ev = decodeClaudeShape(payload, "qwen", TOOL_NAME_PREFIX, QWEN_SOURCES);
  if (ev.tool !== undefined && Object.hasOwn(NATIVE_TO_CANONICAL, ev.tool.name)) ev.tool.canonicalName = NATIVE_TO_CANONICAL[ev.tool.name];
  if (failure) {
    const error = (raw as Record<string, unknown>).error;
    const text = typeof error === "string" ? error : error === undefined ? "" : JSON.stringify(error);
    ev.result = { isError: true, bytes: Buffer.byteLength(text), text };
  }
  return ev;
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  return encodeClaudeShape(ev, d, false);
}
