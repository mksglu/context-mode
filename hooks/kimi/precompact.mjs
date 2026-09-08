#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * Kimi Code CLI PreCompact hook - snapshot generation.
 */

import {
  readStdin,
  parseStdin,
  getSessionId,
  getSessionDBPath,
  getInputProjectDir,
  resolveConfigDir,
  KIMI_OPTS,
} from "../session-helpers.mjs";
import { createSessionLoaders } from "../session-loaders.mjs";
import { createToolNamer } from "../core/tool-naming.mjs";

const searchTool = createToolNamer("kimi")("ctx_search");
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadSnapshot } = createSessionLoaders(HOOK_DIR);
const OPTS = KIMI_OPTS;
// Diagnostic log is opt-in via CONTEXT_MODE_DEBUG. Long-running installs hit
// compaction repeatedly; an unbounded append-only file under the user's data
// root accrues on every transient error. Gating the write behind an env flag
// preserves the diagnostic for contributors who want it without burdening
// everyone else's disk. Match the pattern used by other hooks for error
// telemetry — most stay silent unless explicitly enabled.
const DEBUG_LOG = process.env.CONTEXT_MODE_DEBUG
  ? join(resolveConfigDir(OPTS), "context-mode", "precompact-debug.log")
  : null;

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

    const fileEvents = events.filter((event) => event.category === "file");
    db.insertEvent(sessionId, {
      type: "compaction_summary",
      category: "compaction",
      data: `Session compacted. ${events.length} events, ${fileEvents.length} files touched.`,
      priority: 1,
    }, "PreCompact");
  }

  db.close();
} catch (err) {
  if (DEBUG_LOG) {
    try {
      appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${err?.message || err}\n`);
    } catch {
      // Hook errors must not break Kimi Code compaction.
    }
  }
  // Without CONTEXT_MODE_DEBUG, swallow silently — same shape as other hooks.
}

process.stdout.write(JSON.stringify({}) + "\n");
