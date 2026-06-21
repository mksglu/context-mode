#!/usr/bin/env node
import "./suppress-stderr.mjs";
import "./ensure-deps.mjs";
/**
 * Claude Code Stop hook — record turn-end state for continuity.
 *
 * Stop fires when Claude is about to finish the current assistant turn. This is
 * not a true session shutdown event, so record a turn_end marker and never ask
 * Claude to continue.
 */

import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir } from "./session-helpers.mjs";
import { createSessionLoaders } from "./session-loaders.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB } = createSessionLoaders(HOOK_DIR);

try {
  const raw = await readStdin();
  const input = parseStdin(raw);
  const projectDir = getInputProjectDir(input);

  const { SessionDB } = await loadSessionDB();
  const dbPath = getSessionDBPath(undefined, projectDir);
  const db = new SessionDB({ dbPath });
  const sessionId = getSessionId(input);

  db.ensureSession(sessionId, projectDir);
  const payload = {
    stop_hook_active: input.stop_hook_active ?? false,
    last_assistant_message: typeof input.last_assistant_message === "string"
      ? input.last_assistant_message.slice(0, 2000)
      : null,
  };
  db.insertEvent(sessionId, {
    type: "turn_end",
    category: "session",
    data: JSON.stringify(payload),
    priority: 1,
  }, "Stop");

  db.close();
} catch {
  // Claude Code hooks must not block the session.
}

process.stdout.write("{}\n");
