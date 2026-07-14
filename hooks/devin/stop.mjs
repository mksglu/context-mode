#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * Devin CLI Stop hook — record turn-end state for continuity.
 *
 * Stop fires at the end of an assistant turn, not at true session shutdown.
 * Store a turn_end marker so session_end remains reserved for actual terminal
 * lifecycle events.
 *
 * Also extracts decision statements from the model's last assistant message
 * and stores them as `decision` category events. These are included in the
 * resume snapshot at compaction time, ensuring decisions survive context
 * compaction (ported from token-optimizer's decision extraction feature).
 */

import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir, DEVIN_OPTS } from "../session-helpers.mjs";
import { createSessionLoaders, attributeAndInsertEvents } from "../session-loaders.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadProjectAttribution, loadExtract } = createSessionLoaders(HOOK_DIR);
const OPTS = DEVIN_OPTS;

try {
  const raw = await readStdin();
  const input = parseStdin(raw);
  const projectDir = getInputProjectDir(input, OPTS);

  const { SessionDB } = await loadSessionDB();
  const { resolveProjectAttributions } = await loadProjectAttribution();
  const { extractAssistantDecisions } = await loadExtract();
  const dbPath = getSessionDBPath(OPTS, projectDir);
  const db = new SessionDB({ dbPath });
  const sessionId = getSessionId(input, OPTS);

  db.ensureSession(sessionId, projectDir);
  const lastAssistantMessage = typeof input.last_assistant_message === "string"
    ? input.last_assistant_message.slice(0, 2000)
    : null;
  const payload = {
    stop_hook_active: input.stop_hook_active ?? false,
    last_assistant_message: lastAssistantMessage,
  };
  db.insertEvent(sessionId, {
    type: "turn_end",
    category: "session",
    data: JSON.stringify(payload),
    priority: 1,
  }, "Stop");

  // Extract decision statements from the assistant's last message.
  // These survive compaction via the resume snapshot's <decisions> section.
  if (lastAssistantMessage) {
    const decisionEvents = extractAssistantDecisions(lastAssistantMessage);
    if (decisionEvents.length > 0) {
      attributeAndInsertEvents(
        db, sessionId, decisionEvents, input, projectDir, "Stop", resolveProjectAttributions,
      );
    }
  }

  db.close();
} catch {
  // Devin hooks must not block the session.
}

process.stdout.write("{}\n");
