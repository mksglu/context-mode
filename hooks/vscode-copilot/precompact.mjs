#!/usr/bin/env node
import "../suppress-stderr.mjs";
/**
 * VS Code Copilot PreCompact hook — snapshot generation.
 *
 * Triggered when VS Code Copilot is about to compact the conversation.
 * Reads all captured session events, builds a priority-sorted resume
 * snapshot (<2KB XML), and stores it for injection after compact.
 */

import { readStdin, getSessionId, getSessionDBPath, VSCODE_OPTS } from "../session-helpers.mjs";
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_SESSION = join(HOOK_DIR, "..", "..", "build", "session");
const OPTS = VSCODE_OPTS;
const DEBUG_LOG = join(homedir(), ".vscode", "context-mode", "precompact-debug.log");

try {
  const raw = await readStdin();
  const input = JSON.parse(raw);

  const { buildResumeSnapshot } = await import(pathToFileURL(join(PKG_SESSION, "snapshot.js")).href);
  const { SessionDB } = await import(pathToFileURL(join(PKG_SESSION, "db.js")).href);

  const dbPath = getSessionDBPath(OPTS);
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
