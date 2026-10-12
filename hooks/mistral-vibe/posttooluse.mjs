#!/usr/bin/env node
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * Mistral Vibe PostToolUse hook — session event capture.
 *
 * Captures session events from tool calls and stores them in the per-project
 * SessionDB for later resume snapshot building. Fire-and-forget: swallows all
 * errors so the hook never blocks Vibe.
 */

import { readStdin } from "../core/stdin.mjs";
import { createSessionLoaders, attributeAndInsertEvents } from "../session-loaders.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadExtract, loadProjectAttribution } = createSessionLoaders(HOOK_DIR);

function resolveVibeSessionRoot() {
  const override = process.env.VIBE_HOME;
  const base = override ? override : join(homedir(), ".vibe");
  return join(base, "context-mode", "sessions");
}

try {
  const raw = await readStdin();
  const input = JSON.parse(raw);
  const projectDir = input.cwd ?? process.cwd();
  const sessionId = input.session_id ?? `vibe-ppid-${process.ppid}`;

  const { extractEvents } = await loadExtract();
  const { resolveProjectAttributions } = await loadProjectAttribution();
  const { SessionDB, resolveSessionDbPath } = await loadSessionDB();

  const dbPath = resolveSessionDbPath({
    projectDir,
    sessionsDir: resolveVibeSessionRoot(),
  });
  const db = new SessionDB({ dbPath });
  db.ensureSession(sessionId, projectDir);

  const events = extractEvents({
    tool_name: input.tool_name ?? "",
    tool_input: input.tool_input ?? {},
    tool_response: input.tool_output_text ?? "",
    tool_output: input.tool_output
      ? { ...input.tool_output, isError: input.tool_status === "failure" }
      : undefined,
  });

  attributeAndInsertEvents(db, sessionId, events, input, projectDir, "PostToolUse", resolveProjectAttributions);
  db.close();
} catch {
  // fire-and-forget
}

process.stdout.write(JSON.stringify({}) + "\n");
