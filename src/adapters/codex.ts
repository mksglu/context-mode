// impl/10 §3: Codex CLI 0.156.1 uses the Claude hook shape (plus turn_id, model).
// Own prefix is underscore (DECISIONS-r9 R1); source "fork" -> "resume" (impl/10 A4); no replace field.
import type { CanonicalHookEvent, Decision, HookOutput } from "../core/contracts/types.ts";
import { decodeClaudeShape, encodeClaudeShape } from "./claude-code.ts";

export const TOOL_NAME_PREFIX = "mcp__context_mode__"; // impl/10 §1.3, DECISIONS-r9 R1

type Source = NonNullable<CanonicalHookEvent["source"]>;
const CODEX_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear", compact: "compact", fork: "resume" };

// D-1323-CODEX-STOP-1 (#1323): Codex runs a Stop handler at each turn end (rust-v0.166.0 stop.command.input: cwd, session_id,
// stop_hook_active, turn_id, ...). An older install left a context-mode Stop entry, so the event reaches this hook. It decodes
// as Stop and gets the empty reply: Codex then ends the turn as usual. context-mode has no Stop work of its own.
const STOP_EVENT = "Stop";
const EMPTY: HookOutput = { stdout: "", exitCode: 0 };

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && (raw as Record<string, unknown>).hook_event_name === STOP_EVENT) {
    const p = raw as Record<string, unknown>;
    return { event: STOP_EVENT, agent: "codex", sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  }
  return decodeClaudeShape(raw, "codex", TOOL_NAME_PREFIX, CODEX_SOURCES);
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  if (ev.event === STOP_EVENT) return EMPTY; // D-1323-CODEX-STOP-1: Codex's Stop reply {continue, decision, ...} has no hookSpecificOutput
  return encodeClaudeShape(ev, d, false);
}
