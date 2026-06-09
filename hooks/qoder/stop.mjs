#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";

import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir, QODER_OPTS } from "../session-helpers.mjs";
import { createSessionLoaders } from "../session-loaders.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB } = createSessionLoaders(HOOK_DIR);

try {
  const input = parseStdin(await readStdin());
  const projectDir = getInputProjectDir(input, QODER_OPTS);
  const { SessionDB } = await loadSessionDB();
  const db = new SessionDB({ dbPath: getSessionDBPath(QODER_OPTS, projectDir) });
  const sessionId = getSessionId(input, QODER_OPTS);
  db.ensureSession(sessionId, projectDir);
  db.insertEvent(sessionId, {
    type: "turn_end", category: "session",
    data: JSON.stringify({
      stop_hook_active: input.stop_hook_active ?? false,
      last_assistant_message: typeof input.last_assistant_message === "string"
        ? input.last_assistant_message.slice(0, 2000) : null,
    }),
    priority: 1,
  }, "Stop");
  db.close();
} catch { /* hook failures must not block Qoder */ }

process.stdout.write("{}\n");
