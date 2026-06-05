#!/usr/bin/env node
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * GitHub Copilot CLI PostToolUse hook — session event capture.
 *
 * Captures session events from tool calls and stores them in the per-project
 * SessionDB for later resume snapshot building.
 */

import { createSessionLoaders, attributeAndInsertEvents } from "../session-loaders.mjs";
import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir, resolveConfigDir, COPILOT_CLI_OPTS } from "../session-helpers.mjs";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadExtract, loadProjectAttribution } = createSessionLoaders(HOOK_DIR);
const OPTS = COPILOT_CLI_OPTS;
const DEBUG_LOG = join(resolveConfigDir(OPTS), "context-mode", "posttooluse-debug.log");

try {
  mkdirSync(dirname(DEBUG_LOG), { recursive: true });

  const raw = await readStdin();
  const input = parseStdin(raw);
  const projectDir = getInputProjectDir(input, OPTS);

  appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] CALL: ${input.tool_name}\n`);

  const { extractEvents } = await loadExtract();
  const { resolveProjectAttributions } = await loadProjectAttribution();
  const { SessionDB } = await loadSessionDB();

  const dbPath = getSessionDBPath(OPTS, projectDir);
  const db = new SessionDB({ dbPath });
  const sessionId = getSessionId(input, OPTS);

  db.ensureSession(sessionId, projectDir);

  const events = extractEvents({
    tool_name: input.tool_name,
    tool_input: input.tool_input ?? {},
    tool_response: typeof input.tool_response === "string"
      ? input.tool_response
      : JSON.stringify(input.tool_response ?? ""),
    tool_output: input.tool_output,
  });

  attributeAndInsertEvents(db, sessionId, events, input, projectDir, "PostToolUse", resolveProjectAttributions);

  appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] OK: ${input.tool_name} → ${events.length} events\n`);
  db.close();
} catch (err) {
  try {
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ERR: ${err?.message || err}\n`);
  } catch { /* silent */ }
}

// PostToolUse — no stdout output
