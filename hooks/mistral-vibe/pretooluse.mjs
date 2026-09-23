#!/usr/bin/env node
import "../suppress-stderr.mjs";
/**
 * Mistral Vibe PreToolUse hook for context-mode.
 *
 * Vibe wire contract (https://docs.mistral.ai/vibe/code/cli/hooks):
 *   stdin  = JSON with session_id, hook_event_name, transcript_path, cwd,
 *            parent_session_id, tool_name, tool_call_id, tool_input
 *   stdout = JSON with optional decision/reason/system_message/
 *            hook_specific_output (see adapters/mistral-vibe/hooks.ts for
 *            the full schema)
 *   exit 0 = always (Vibe treats non-zero as hook failure and drops output)
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin } from "../core/stdin.mjs";
import { routePreToolUse, initSecurity } from "../core/routing.mjs";
import { formatDecision } from "../core/formatters.mjs";

const __hookDir = dirname(fileURLToPath(import.meta.url));
await initSecurity(resolve(__hookDir, "..", "..", "build"));

let input;
try {
  input = JSON.parse(await readStdin());
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};
const projectDir = input.cwd ?? process.cwd();
const sessionId = input.session_id ?? `vibe-ppid-${process.ppid}`;

const decision = routePreToolUse(tool, toolInput, projectDir, "mistral-vibe", sessionId);
const response = formatDecision("mistral-vibe", decision);
if (response !== null && response !== undefined) {
  process.stdout.write(JSON.stringify(response) + "\n");
}
