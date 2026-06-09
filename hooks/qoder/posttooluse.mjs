#!/usr/bin/env node
import "../suppress-stderr.mjs";
/**
 * Qoder PostToolUse hook for context-mode.
 * Passthrough: reads stdin, captures tool_response for session continuity,
 * and exits 0. PostToolUse hooks in context-mode are used for session
 * event tracking, not routing decisions.
 */

import { readStdin, parseStdin } from "../session-helpers.mjs";

const raw = await readStdin();
const input = parseStdin(raw);

// Pure passthrough — no routing decision needed for PostToolUse.
// stdin is consumed above to prevent pipe blocking; variables are intentionally unused.
const _toolName = input.tool_name ?? "";
const _toolResponse = input.tool_response;

// Exit 0: passthrough (no hook response needed)
process.exit(0);
