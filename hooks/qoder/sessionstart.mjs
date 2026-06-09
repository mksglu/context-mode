#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";

import { createRoutingBlock } from "../routing-block.mjs";
import { createToolNamer } from "../core/tool-naming.mjs";
import { writeSessionEventsFile, buildSessionDirective, getSessionEvents } from "../session-directive.mjs";
import {
  readStdin, parseStdin, getSessionId, getSessionDBPath, getSessionEventsPath,
  getCleanupFlagPath, getInputProjectDir, resolveConfigDir, QODER_OPTS,
} from "../session-helpers.mjs";
import { createSessionLoaders } from "../session-loaders.mjs";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const toolNamer = createToolNamer("qoder");
const HOOK_DIR = fileURLToPath(new URL(".", import.meta.url));
const { loadSessionDB } = createSessionLoaders(HOOK_DIR);
const OPTS = QODER_OPTS;
let additionalContext = createRoutingBlock(toolNamer);

function captureInstructionRules(db, sessionId, projectDir) {
  const paths = [];
  for (const baseDir of [resolveConfigDir(OPTS), projectDir]) {
    paths.push(join(baseDir, "AGENTS.md"));
    paths.push(join(baseDir, "AGENTS.override.md"));
  }
  for (const path of [...new Set(paths)]) {
    try {
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf8");
      db.insertEvent(sessionId, { type: "rule", category: "rule", data: path, priority: 1 });
      db.insertEvent(sessionId, { type: "rule_content", category: "rule", data: content, priority: 1 });
    } catch { /* instruction capture must never break SessionStart */ }
  }
}

try {
  const input = parseStdin(await readStdin());
  const source = input.source ?? "startup";
  const projectDir = getInputProjectDir(input, OPTS);
  const { SessionDB } = await loadSessionDB();
  const db = new SessionDB({ dbPath: getSessionDBPath(OPTS, projectDir) });
  const sessionId = getSessionId(input, OPTS);

  if (source === "compact" || source === "resume") {
    let resumeSnapshot = null;
    if (source === "compact") {
      const resume = sessionId ? db.getResume(sessionId) : null;
      if (resume && !resume.consumed) resumeSnapshot = resume.snapshot;
    } else {
      try { unlinkSync(getCleanupFlagPath(OPTS, projectDir)); } catch { /* no flag */ }
    }
    const events = sessionId ? getSessionEvents(db, sessionId) : [];
    if (events.length > 0) {
      const meta = writeSessionEventsFile(events, getSessionEventsPath(OPTS, projectDir));
      additionalContext += buildSessionDirective(source, meta, toolNamer);
    }
    if (resumeSnapshot) {
      additionalContext += `\n\n${resumeSnapshot}`;
      db.markResumeConsumed(sessionId);
    }
  } else if (source === "startup") {
    try { unlinkSync(getSessionEventsPath(OPTS, projectDir)); } catch { /* no stale file */ }
    db.cleanupOldSessions(7);
    db.db.exec(`DELETE FROM session_events WHERE session_id NOT IN (SELECT session_id FROM session_meta)`);
    db.ensureSession(sessionId, projectDir);
    captureInstructionRules(db, sessionId, projectDir);
  }
  db.close();
} catch { /* hook failures must not break Qoder startup */ }

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
}) + "\n");
