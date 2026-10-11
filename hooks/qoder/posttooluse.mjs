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
  const { extractEvents } = await loadExtract();
  const { resolveProjectAttributions } = await loadProjectAttribution();
  const { SessionDB } = await loadSessionDB();
  const db = new SessionDB({ dbPath: getSessionDBPath(QODER_OPTS, projectDir) });
  const sessionId = getSessionId(input, QODER_OPTS);
  db.ensureSession(sessionId, projectDir);
  const normalized = {
    tool_name: input.tool_name === "Shell" ? "Bash" : (input.tool_name ?? ""),
    tool_input: input.tool_input ?? {},
    tool_response: typeof input.tool_response === "string"
      ? input.tool_response : JSON.stringify(input.tool_response ?? ""),
    tool_output: input.tool_output,
  };
  const events = extractEvents(normalized);
  attributeAndInsertEvents(db, sessionId, events, input, projectDir, "PostToolUse", resolveProjectAttributions);
  db.close();
} catch { /* hook failures must not block Qoder */ }

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "" },
}) + "\n");
