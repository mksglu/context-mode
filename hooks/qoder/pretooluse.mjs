#!/usr/bin/env node
import "../suppress-stderr.mjs";
/**
 * Qoder PreToolUse hook for context-mode.
 * Wire format: hookSpecificOutput (same as Claude Code).
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin, parseStdin, getInputProjectDir, getSessionId, QODER_OPTS } from "../session-helpers.mjs";
import { routePreToolUse, initSecurity } from "../core/routing.mjs";
import { formatDecision } from "../core/formatters.mjs";

const __hookDir = dirname(fileURLToPath(import.meta.url));
await initSecurity(resolve(__hookDir, "..", "..", "build"));

const raw = await readStdin();
const input = parseStdin(raw);
const tool = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};
const projectDir = getInputProjectDir(input, QODER_OPTS);

const decision = routePreToolUse(tool, toolInput, projectDir, "qoder", getSessionId(input, QODER_OPTS));
const response = formatDecision("qoder", decision);

if (response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}
