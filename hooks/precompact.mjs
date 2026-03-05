#!/usr/bin/env node
import "./suppress-stderr.mjs";
/**
 * PreCompact hook for context-mode session continuity.
 *
 * Triggered when Claude Code is about to compact the conversation.
 * Reads all captured session events, builds a priority-sorted resume
 * snapshot (<2KB XML), and stores it for injection after compact.
 */

import { readStdin, getSessionId, getSessionDBPath } from "./session-helpers.mjs";
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// Resolve absolute path for imports
const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_SESSION = join(HOOK_DIR, "..", "build", "session");
const DEBUG_LOG = join(homedir(), ".claude", "context-mode", "precompact-debug.log");

try {
  const raw = await readStdin();
  const input = JSON.parse(raw);

  const { buildResumeSnapshot } = await import(join(PKG_SESSION, "snapshot.js"));
  const { SessionDB } = await import(join(PKG_SESSION, "db.js"));

  const dbPath = getSessionDBPath();
  const db = new SessionDB({ dbPath });
  const sessionId = getSessionId(input);

  // Get all events for this session
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
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${err.message}\n`);
  } catch {
    // Silent fallback
  }
}

// PreCompact doesn't need hookSpecificOutput
console.log(JSON.stringify({}));
