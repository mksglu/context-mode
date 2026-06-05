#!/usr/bin/env node
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * GitHub Copilot CLI SessionStart hook for context-mode.
 * Mirrors VS Code / JetBrains Copilot logic (same Copilot wire contract).
 */

import { createSessionLoaders } from "../session-loaders.mjs";
import { createRoutingBlock } from "../routing-block.mjs";
import { createToolNamer } from "../core/tool-naming.mjs";

const toolNamer = createToolNamer("copilot-cli");
const ROUTING_BLOCK = createRoutingBlock(toolNamer);

import { writeSessionEventsFile, buildSessionDirective, getSessionEvents } from "../session-directive.mjs";
import {
  readStdin, parseStdin, getSessionId, getSessionDBPath, getSessionEventsPath, getCleanupFlagPath,
  getInputProjectDir, resolveConfigDir, COPILOT_CLI_OPTS,
} from "../session-helpers.mjs";
import { join, dirname } from "node:path";
import { readFileSync, unlinkSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HOOK_DIR = fileURLToPath(new URL(".", import.meta.url));
const { loadSessionDB } = createSessionLoaders(HOOK_DIR);
const OPTS = COPILOT_CLI_OPTS;

let additionalContext = ROUTING_BLOCK;

try {
  const raw = await readStdin();
  const input = parseStdin(raw);
  const source = input.source ?? "startup";
  const projectDir = getInputProjectDir(input, OPTS);

  if (source === "compact") {
    const { SessionDB } = await loadSessionDB();
    const dbPath = getSessionDBPath(OPTS, projectDir);
    const db = new SessionDB({ dbPath });
    const sessionId = getSessionId(input, OPTS);
    const resume = db.getResume(sessionId);

    if (resume && !resume.consumed) {
      db.markResumeConsumed(sessionId);
    }

    const events = getSessionEvents(db, sessionId);
    if (events.length > 0) {
      const eventMeta = writeSessionEventsFile(events, getSessionEventsPath(OPTS, projectDir));
      additionalContext += buildSessionDirective("compact", eventMeta, toolNamer);
    }

    db.close();
  } else if (source === "resume") {
    try { unlinkSync(getCleanupFlagPath(OPTS, projectDir)); } catch { /* no flag */ }

    const { SessionDB } = await loadSessionDB();
    const dbPath = getSessionDBPath(OPTS, projectDir);
    const db = new SessionDB({ dbPath });

    // Filter events to the session being resumed (cross-session bleed guard).
    const sessionId = getSessionId(input, OPTS);
    const events = sessionId ? getSessionEvents(db, sessionId) : [];
    if (events.length > 0) {
      const eventMeta = writeSessionEventsFile(events, getSessionEventsPath(OPTS, projectDir));
      additionalContext += buildSessionDirective("resume", eventMeta, toolNamer);
    }

    db.close();
  } else if (source === "startup") {
    const { SessionDB } = await loadSessionDB();
    const dbPath = getSessionDBPath(OPTS, projectDir);
    const db = new SessionDB({ dbPath });
    try { unlinkSync(getSessionEventsPath(OPTS, projectDir)); } catch { /* no stale file */ }

    db.cleanupOldSessions(7);
    db.db.exec(`DELETE FROM session_events WHERE session_id NOT IN (SELECT session_id FROM session_meta)`);

    const sessionId = getSessionId(input, OPTS);
    db.ensureSession(sessionId, projectDir);

    // Canonical project-level instruction file.
    const ruleFilePaths = [
      join(projectDir, ".github", "copilot-instructions.md"),
    ];
    for (const p of ruleFilePaths) {
      try {
        const content = readFileSync(p, "utf-8");
        if (content.trim()) {
          db.insertEvent(sessionId, { type: "rule", category: "rule", data: p, priority: 1 });
          db.insertEvent(sessionId, { type: "rule_content", category: "rule", data: content, priority: 1 });
        }
      } catch { /* file doesn't exist — skip */ }
    }

    db.close();
  }
  // "clear" — no action needed
} catch (err) {
  try {
    const debugLog = join(resolveConfigDir(OPTS), "context-mode", "sessionstart-debug.log");
    mkdirSync(dirname(debugLog), { recursive: true });
    appendFileSync(
      debugLog,
      `[${new Date().toISOString()}] ${err?.message || err}\n${err?.stack || ""}\n`,
    );
  } catch { /* ignore logging failure */ }
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
}));
