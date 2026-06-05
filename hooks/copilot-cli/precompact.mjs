#!/usr/bin/env node
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * GitHub Copilot CLI PreCompact hook — snapshot generation.
 */

import { createSessionLoaders } from "../session-loaders.mjs";
import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir, resolveConfigDir, COPILOT_CLI_OPTS } from "../session-helpers.mjs";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadSnapshot } = createSessionLoaders(HOOK_DIR);
const OPTS = COPILOT_CLI_OPTS;
const DEBUG_LOG = join(resolveConfigDir(OPTS), "context-mode", "precompact-debug.log");

try {
  mkdirSync(dirname(DEBUG_LOG), { recursive: true });

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
    });

    db.upsertResume(sessionId, snapshot, events.length);
    db.incrementCompactCount(sessionId);
  }

  db.close();
} catch (err) {
  try {
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${err?.message || err}\n`);
  } catch { /* silent */ }
}

// PreCompact — no stdout output needed
