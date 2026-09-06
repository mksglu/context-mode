#!/usr/bin/env node
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";

import { createSessionLoaders } from "../session-loaders.mjs";
import { createToolNamer } from "../core/tool-naming.mjs";

const searchTool = createToolNamer("copilot-cli")("ctx_search");
import {
  readStdin,
  parseStdin,
  getSessionId,
  getSessionDBPath,
  getInputProjectDir,
  COPILOT_OPTS,
  resolveConfigDir,
} from "../session-helpers.mjs";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadSnapshot } = createSessionLoaders(HOOK_DIR);
const OPTS = COPILOT_OPTS;
// Diagnostic log is opt-in via CONTEXT_MODE_DEBUG (same pattern as the kimi
// hooks): keep the error telemetry available to contributors without writing an
// append-only file to every user's config dir on compaction. See #787 review.
const DEBUG_LOG = process.env.CONTEXT_MODE_DEBUG
  ? join(resolveConfigDir(OPTS), "context-mode", "precompact-debug.log")
  : null;

function logDebug(line) {
  if (!DEBUG_LOG) return;
  try {
    mkdirSync(dirname(DEBUG_LOG), { recursive: true });
    appendFileSync(DEBUG_LOG, line);
  } catch {
    /* silent */
  }
}

try {
  const raw = await readStdin();
  const input = parseStdin(raw);
  const projectDir = getInputProjectDir(input, OPTS);

  const { buildResumeSnapshot } = await loadSnapshot();
  const { SessionDB } = await loadSessionDB();

  const dbPath = getSessionDBPath(OPTS, projectDir);
  const db = new SessionDB({ dbPath });
  const sessionId = getSessionId(input, OPTS);

  const events = db.getEvents(sessionId);

  if (events.length > 0) {
    const stats = db.getSessionStats(sessionId);
    const snapshot = buildResumeSnapshot(events, {
      compactCount: (stats?.compact_count ?? 0) + 1,
      searchTool,
    });

    db.upsertResume(sessionId, snapshot, events.length);
    db.incrementCompactCount(sessionId);
  }

  db.close();
} catch (err) {
  logDebug(`[${new Date().toISOString()}] ${err?.message || err}\n`);
}
