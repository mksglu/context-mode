#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
/**
 * Devin CLI preToolUse hook for context-mode.
 *
 * Devin PreToolUse honors `permissionDecision:"deny"` (Claude-Code-compatible
 * format). updatedInput (modify) is not documented for Devin; we convert
 * modify→deny+context for safety (same approach as Codex <0.141.0).
 * additionalContext injection is supported via hookSpecificOutput.
 *
 * NOTE: On Windows, Devin's hook runner cannot spawn commands (confirmed
 * bug as of Devin 2026.7.23). This hook is a no-op on Windows until
 * Cognition fixes the spawn mechanism. The MCP server still works.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin, parseStdin, getInputProjectDir, getSessionId, DEVIN_OPTS } from "../session-helpers.mjs";
import { routePreToolUse, initSecurity } from "../core/routing.mjs";
import { formatDecision } from "../core/formatters.mjs";

const __hookDir = dirname(fileURLToPath(import.meta.url));
await initSecurity(resolve(__hookDir, "..", "..", "build"));

const raw = await readStdin();
const input = parseStdin(raw);
const tool = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};
const projectDir = getInputProjectDir(input, DEVIN_OPTS);

const decision = routePreToolUse(tool, toolInput, projectDir, "devin", getSessionId(input, DEVIN_OPTS));
const response = formatDecision("devin", decision);
const output = response ?? {
  hookSpecificOutput: { hookEventName: "PreToolUse" },
};
process.stdout.write(JSON.stringify(output) + "\n");
