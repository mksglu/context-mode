#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";

import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir, QODER_OPTS } from "../session-helpers.mjs";
import { createSessionLoaders, attributeAndInsertEvents } from "../session-loaders.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadExtract, loadProjectAttribution } = createSessionLoaders(HOOK_DIR);

try {
  const input = parseStdin(await readStdin());
  const projectDir = getInputProjectDir(input, QODER_OPTS);
  const prompt = input.prompt ?? input.message ?? "";
  const trimmed = prompt.trim();
  const isSystem = trimmed.startsWith("<task-notification>")
    || trimmed.startsWith("<system-reminder>")
    || trimmed.startsWith("<context_guidance>")
    || trimmed.startsWith("<tool-result>");
  if (trimmed && !isSystem) {
    const { SessionDB } = await loadSessionDB();
    const { extractUserEvents } = await loadExtract();
    const { resolveProjectAttributions } = await loadProjectAttribution();
    const db = new SessionDB({ dbPath: getSessionDBPath(QODER_OPTS, projectDir) });
    const sessionId = getSessionId(input, QODER_OPTS);
    db.ensureSession(sessionId, projectDir);
    attributeAndInsertEvents(db, sessionId, [
      { type: "user_prompt", category: "user-prompt", data: prompt, priority: 1 },
      ...extractUserEvents(trimmed),
    ], input, projectDir, "UserPromptSubmit", resolveProjectAttributions);
    db.close();
  }
} catch { /* hook failures must not block Qoder */ }

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "" },
}) + "\n");
