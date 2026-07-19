#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * Devin CLI sessionStart hook for context-mode.
 */

import { createRoutingBlock } from "../routing-block.mjs";
import { createToolNamer } from "../core/tool-naming.mjs";

const toolNamer = createToolNamer("devin");
const ROUTING_BLOCK = createRoutingBlock(toolNamer);
import {
  writeSessionEventsFile,
  buildSessionDirective,
  getSessionEvents,
} from "../session-directive.mjs";
import {
  readStdin,
  parseStdin,
  getSessionId,
  getSessionDBPath,
  getSessionEventsPath,
  getCleanupFlagPath,
  getInputProjectDir,
  resolveConfigDir,
  DEVIN_OPTS,
} from "../session-helpers.mjs";
import { createSessionLoaders } from "../session-loaders.mjs";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = fileURLToPath(new URL(".", import.meta.url));
const { loadSessionDB } = createSessionLoaders(HOOK_DIR);
const OPTS = DEVIN_OPTS;

let additionalContext = ROUTING_BLOCK;

function captureDevinInstructionRules(db, sessionId, projectDir) {
  const paths = [];
  for (const baseDir of [resolveConfigDir(OPTS), projectDir]) {
    paths.push(join(baseDir, "AGENTS.md"));
  }

  for (const p of [...new Set(paths)]) {
    try {
      if (!existsSync(p)) continue;
      const content = readFileSync(p, "utf8");
      db.insertEvent(sessionId, { type: "rule", category: "rule", data: p, priority: 1 });
      db.insertEvent(sessionId, { type: "rule_content", category: "rule", data: content, priority: 1 });
    } catch {
      // Missing or unreadable rule files should never break SessionStart.
    }
  }
}

try {
  const raw = await readStdin();
  const input = parseStdin(raw);
  const source = input.source ?? "startup";
  const projectDir = getInputProjectDir(input, DEVIN_OPTS);

  if (source === "compact" || source === "resume") {
    const { SessionDB } = await loadSessionDB();
    const dbPath = getSessionDBPath(OPTS, projectDir);
    const db = new SessionDB({ dbPath });
    const sessionId = getSessionId(input, OPTS);
    let resumeSnapshot = null;

    if (source === "compact") {
      const resume = sessionId ? db.getResume(sessionId) : null;
      if (resume && !resume.consumed) {
        resumeSnapshot = resume.snapshot;
      }
    } else {
      try { unlinkSync(getCleanupFlagPath(OPTS, projectDir)); } catch { /* no flag */ }
    }

    if (resumeSnapshot) {
      additionalContext = buildSessionDirective(resumeSnapshot, ROUTING_BLOCK);
    }

    db.close();
  }

  // Capture instruction rules on every session start
  if (source === "startup" || source === "clear") {
    const { SessionDB } = await loadSessionDB();
    const dbPath = getSessionDBPath(OPTS, projectDir);
    const db = new SessionDB({ dbPath });
    const sessionId = getSessionId(input, OPTS);
    db.ensureSession(sessionId, projectDir);
    captureDevinInstructionRules(db, sessionId, projectDir);
    db.close();
  }
} catch {
  // SessionStart must never block the session.
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
}) + "\n");
