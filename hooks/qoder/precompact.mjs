#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";

import {
  readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir,
  resolveConfigDir, QODER_OPTS,
} from "../session-helpers.mjs";
import { createSessionLoaders } from "../session-loaders.mjs";
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadSnapshot } = createSessionLoaders(HOOK_DIR);
const OPTS = QODER_OPTS;
const DEBUG_LOG = join(resolveConfigDir(OPTS), "context-mode", "precompact-debug.log");

try {
  const input = parseStdin(await readStdin());
  const projectDir = getInputProjectDir(input, OPTS);
  const { buildResumeSnapshot } = await loadSnapshot();
  const { SessionDB } = await loadSessionDB();
  const db = new SessionDB({ dbPath: getSessionDBPath(OPTS, projectDir) });
  const sessionId = getSessionId(input, OPTS);
  const events = db.getEvents(sessionId);
  if (events.length > 0) {
    const stats = db.getSessionStats(sessionId);
    const snapshot = buildResumeSnapshot(events, { compactCount: (stats?.compact_count ?? 0) + 1 });
    db.upsertResume(sessionId, snapshot, events.length);
    db.incrementCompactCount(sessionId);
    const fileEvents = events.filter((event) => event.category === "file");
    db.insertEvent(sessionId, {
      type: "compaction_summary", category: "compaction",
      data: `Session compacted. ${events.length} events, ${fileEvents.length} files touched.`, priority: 1,
    }, "PreCompact");
  }
  db.close();
} catch (error) {
  try { appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${error?.message || error}\n`); } catch { /* ignore */ }
}

process.stdout.write(JSON.stringify({}) + "\n");
