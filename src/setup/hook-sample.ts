// src/setup/hook-sample.ts
// OPEN-ITEMS H5, ADR-0020 (D-HF-DOCTOR-RUNS-1): doctor hook-runs sends one large shell read, in each host's own
// wire shape, through the installed hook bundle. The answer must be that host's saving effect: deny with the
// ctx_execute redirect (D rows) or replace with the ctx_search line (R rows, hasReplace). A silent answer or a
// hook that could not resolve the project is a FAIL, never a PASS.
import { getAdapter, hasReplace } from "../adapters/table.ts";
import { OUTPUT_CAP } from "../core/contracts/constants.ts";
import type { AgentId } from "../core/contracts/types.ts";

export const SAMPLE_FILE = "big.log";
const SAMPLE_COMMAND = "cat " + SAMPLE_FILE;
const SAMPLE_SESSION = "context-mode-doctor-hook-runs";
const SAMPLE_BYTES = OUTPUT_CAP * 4; // well over the one-read cap and the replace trigger
const REDIRECT = "ctx_execute";
const SEARCH_LINE = "ctx_search(";
const DENY_WORD = "deny";
const NO_PROJECT_LINE = "hooks: no project:"; // dispatch step 3 (D-FU-PS-1)
const DENY_EXIT = 2;
// Kiro: exit 2 returns STDERR to the model (D-HF-KIRO-SHELL-1). Every other host reads the answer on stdout.
const DENY_ON_STDERR: readonly AgentId[] = ["kiro"];

export type SavingEffect = "deny" | "replace";
export interface HookSample { effect: SavingEffect; payload: Record<string, unknown>; }
export interface HookAnswer { status: number | null; stdout: string; stderr: string; }

/** Numbered lines, so the replace path has real distinct chunks to index. */
export function sampleText(): string {
  const lines: string[] = [];
  let bytes = 0;
  for (let i = 0; bytes < SAMPLE_BYTES; i++) {
    const l = "context-mode doctor sample line " + i;
    lines.push(l);
    bytes += l.length + 1;
  }
  return lines.join("\n") + "\n";
}

/** The large shell read in the host's own wire shape: PreToolUse for deny rows, PostToolUse with the output for replace rows. */
export function hookSample(id: AgentId, cwd: string, text: string): HookSample {
  const row = getAdapter(id);
  const effect: SavingEffect = hasReplace(row) ? "replace" : "deny";
  const event = effect === "replace" ? row.eventMap.PostToolUse : row.eventMap.PreToolUse;
  const tool = row.nativeTools.shell[0];
  const command = { command: SAMPLE_COMMAND };
  switch (id) {
    case "claude-code":
      return { effect, payload: { hook_event_name: event, session_id: SAMPLE_SESSION, cwd, tool_name: tool, tool_input: command, tool_response: { stdout: text, stderr: "" } } };
    case "gemini":
      return { effect, payload: { hook_event_name: event, session_id: SAMPLE_SESSION, cwd, tool_name: tool, tool_input: command, tool_response: { llmContent: text } } };
    case "copilot-cli":
      // D-HQ-COPILOT-EVENT-1: the documented payload names no event; toolArgs is a JSON string.
      return { effect, payload: { sessionId: SAMPLE_SESSION, timestamp: Date.now(), cwd, toolName: tool, toolArgs: JSON.stringify(command), toolResult: { resultType: "success", textResultForLlm: text } } };
    case "pi":
      return { effect, payload: { type: event, sessionId: SAMPLE_SESSION, cwd, toolName: tool, input: command, content: text, isError: false } };
    case "opencode":
      return { effect, payload: { type: event, sessionID: SAMPLE_SESSION, directory: cwd, tool, args: command } };
    case "codex":
    case "qwen":
    case "vscode":
    case "kiro":
    case "zcode":
      return { effect, payload: { hook_event_name: event, session_id: SAMPLE_SESSION, cwd, tool_name: tool, tool_input: command } };
  }
}

/** null when the answer is the host's saving effect with the project resolved; else the FAIL detail. */
export function sampleVerdict(id: AgentId, effect: SavingEffect, text: string, a: HookAnswer): string | null {
  const noProject = a.stderr.split("\n").find((l) => l.startsWith(NO_PROJECT_LINE));
  if (noProject !== undefined) return "NO_PROJECT: the hook did not resolve the project (" + noProject.trim() + ")";
  if (a.status === null) return "hook did not finish";
  if (a.status !== 0 && a.status !== DENY_EXIT) return `hook exited ${a.status}: ${a.stderr.trim()}`;
  if (effect === "replace") {
    if (a.status === 0 && a.stdout.includes(SEARCH_LINE) && Buffer.byteLength(a.stdout) < Buffer.byteLength(text)) return null;
  } else {
    const seen = DENY_ON_STDERR.includes(id) ? a.stderr : a.stdout;
    if (seen.includes(REDIRECT) && (a.status === DENY_EXIT || a.stdout.includes(DENY_WORD))) return null;
  }
  return `no saving decision for a large shell read (want ${effect}): exit ${a.status}, answer ${JSON.stringify(a.stdout.trim().slice(0, 200))}`;
}
