#!/usr/bin/env node
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * Antigravity CLI (`agy`) PreInvocation hook — user prompt and decision capture.
 *
 * agy triggers PreInvocation before each model call in the agent loop.
 * The payload includes:
 *   { conversationId, invocationNum, initialNumSteps, workspacePaths: [..], transcriptPath, artifactDirectoryPath }
 *
 * Since the user prompt text is not directly present in the stdin JSON payload,
 * this hook reads the latest USER_INPUT from the transcript.jsonl file via
 * getLatestUserPromptFromTranscript().
 *
 * To avoid duplicate event writes during multi-step tool loops (where PreInvocation
 * fires again with invocationNum > 1 for the same user turn), we only capture the prompt
 * on the initial invocation (invocationNum <= 1 or undefined).
 *
 * Emits {} on stdout to satisfy agy's PreInvocation JSON contract.
 */

import {
  readStdin,
  getSessionId,
  getSessionDBPath,
  getInputProjectDir,
  ANTIGRAVITY_CLI_OPTS,
} from "../session-helpers.mjs";
import { createSessionLoaders, attributeAndInsertEvents } from "../session-loaders.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fromAgy, parseAgyPayload, getLatestUserPromptFromTranscript } from "./payload.mjs";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadExtract, loadProjectAttribution } = createSessionLoaders(HOOK_DIR);
const OPTS = ANTIGRAVITY_CLI_OPTS;

try {
  const raw = await readStdin();
  const agyPayload = parseAgyPayload(raw);
  const input = fromAgy(agyPayload);

  const invocationNum = typeof agyPayload.invocationNum === "number"
    ? agyPayload.invocationNum
    : (typeof agyPayload.invocation_num === "number" ? agyPayload.invocation_num : 1);

  // Only capture on initial invocation to prevent duplicates during tool loops
  if (invocationNum <= 1) {
    const transcriptPath = agyPayload.transcriptPath ?? input.transcript_path;
    const latest = getLatestUserPromptFromTranscript(transcriptPath);
    const prompt = latest?.prompt ?? "";
    const trimmed = (prompt || "").trim();

    // Skip system-generated messages
    const isSystemMessage = trimmed.startsWith("<task-notification>")
      || trimmed.startsWith("<system-reminder>")
      || trimmed.startsWith("<context_guidance>")
      || trimmed.startsWith("<tool-result>")
      || trimmed.startsWith("<SYSTEM_MESSAGE>");

    if (trimmed.length > 0 && !isSystemMessage) {
      const projectDir = getInputProjectDir(input, OPTS);
      const { SessionDB } = await loadSessionDB();
      const { extractUserEvents, extractUserPromptFeatures } = await loadExtract();
      const { resolveProjectAttributions } = await loadProjectAttribution();

      const dbPath = getSessionDBPath(OPTS, projectDir);
      const db = new SessionDB({ dbPath });
      const sessionId = getSessionId(input, OPTS);

      db.ensureSession(sessionId, projectDir);

      // 1. Save raw prompt with features
      const promptFeatures = typeof extractUserPromptFeatures === "function"
        ? extractUserPromptFeatures(trimmed)
        : {};
      const promptEvent = {
        type: "user_prompt",
        category: "user-prompt",
        data: prompt,
        priority: 1,
        ...promptFeatures,
      };
      const promptAttributions = attributeAndInsertEvents(
        db, sessionId, [promptEvent], input, projectDir, "PreInvocation", resolveProjectAttributions,
      );

      // 2. Extract decision / role / intent / data from user prompt
      const userEvents = extractUserEvents(trimmed);
      const savedLastKnown = promptAttributions[0]?.projectDir || null;
      const sessionStats = db.getSessionStats(sessionId);
      const lastKnownProjectDir = typeof db.getLatestAttributedProjectDir === "function"
        ? db.getLatestAttributedProjectDir(sessionId)
        : null;
      const userAttributions = resolveProjectAttributions(userEvents, {
        sessionOriginDir: sessionStats?.project_dir || projectDir,
        inputProjectDir: projectDir,
        workspaceRoots: Array.isArray(input.workspace_roots) ? input.workspace_roots : [],
        lastKnownProjectDir: savedLastKnown || lastKnownProjectDir,
      });

      if (userEvents.length > 0) {
        attributeAndInsertEvents(
          db,
          sessionId,
          userEvents,
          input,
          projectDir,
          "PreInvocation",
          resolveProjectAttributions,
        );
      }

      db.close();
    }
  }
} catch {
  // PreInvocation must never block the session — silent fallback
}

// Satisfy agy PreInvocation JSON contract on stdout
console.log(JSON.stringify({}));
