// impl/10 §3: Codex CLI 0.156.1 uses the Claude hook shape (plus turn_id, model).
// Own prefix is underscore (DECISIONS-r9 R1); source "fork" -> "resume" (impl/10 A4); no replace field.
import type { CanonicalHookEvent, Decision, HookOutput } from "../core/contracts/types.ts";
import { decodeClaudeShape, encodeClaudeShape } from "./claude-code.ts";

export const TOOL_NAME_PREFIX = "mcp__context_mode__"; // impl/10 §1.3, DECISIONS-r9 R1

type Source = NonNullable<CanonicalHookEvent["source"]>;
const CODEX_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear", compact: "compact", fork: "resume" };

export function decode(raw: unknown): CanonicalHookEvent {
  return decodeClaudeShape(raw, "codex", TOOL_NAME_PREFIX, CODEX_SOURCES);
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  return encodeClaudeShape(ev, d, false);
}
