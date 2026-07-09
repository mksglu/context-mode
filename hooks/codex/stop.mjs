#!/usr/bin/env node
import "./platform.mjs";
import "../suppress-stderr.mjs";
import "../ensure-deps.mjs";
/**
 * Codex CLI Stop hook — record turn-end state for continuity.
 *
 * Stop fires at the end of an assistant turn, not at true session shutdown.
 * Store a turn_end marker so session_end remains reserved for actual terminal
 * lifecycle events on platforms that expose one.
 */

import { readStdin, parseStdin, getSessionId, getSessionDBPath, getInputProjectDir, flushAndExit, CODEX_OPTS } from "../session-helpers.mjs";
import { createSessionLoaders, attributeAndInsertEvents } from "../session-loaders.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const { loadSessionDB, loadProjectAttribution } = createSessionLoaders(HOOK_DIR);
const OPTS = CODEX_OPTS;

/**
 * Locate the codex rollout JSONL for this session. Codex persists turns at
 * $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl (default
 * $CODEX_HOME = ~/.codex). The hook stdin does NOT carry the path, so we walk
 * the sessions tree and match the filename suffix on the session id. Pure
 * directory walk + string suffix test — NO regex. Best-effort: returns null on
 * any failure so cost capture never blocks the turn.
 */
function findCodexRollout(sessionId) {
  try {
    if (typeof sessionId !== "string" || sessionId.length === 0) return null;
    const home = process.env.CODEX_HOME || join(homedir(), ".codex");
    const root = join(home, "sessions");
    if (!existsSync(root)) return null;
    const suffix = `${sessionId}.jsonl`;
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) { stack.push(full); continue; }
        if (e.isFile() && e.name.startsWith("rollout-") && e.name.endsWith(suffix)) {
          return full;
        }
      }
    }
  } catch {
    // ignore — best-effort
  }
  return null;
}

/**
 * Load the codex usage extractor (build/adapters/codex/usage.js), mirroring the
 * loadModule build-path fallback in session-loaders. Returns null if the module
 * is absent (e.g. pre-build dev tree) so the hook degrades gracefully.
 */
async function loadCodexUsage() {
  try {
    const pluginRoot = join(HOOK_DIR, "..", "..");
    const candidates = [
      join(pluginRoot, "build", "adapters", "codex", "usage.js"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return await import(pathToFileURL(p).href);
    }
  } catch {
    // ignore
  }
  return null;
}

try {
  const raw = await readStdin();
  const input = parseStdin(raw);
  const projectDir = getInputProjectDir(input, OPTS);

  const { SessionDB } = await loadSessionDB();
  const dbPath = getSessionDBPath(OPTS, projectDir);
  const db = new SessionDB({ dbPath });
  const sessionId = getSessionId(input, OPTS);

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

  // ─── codex MAIN-turn cost capture (cursor-aware, no double-count) ─────────
  // Codex carries no tokens on the hook payload (model only); per-turn usage is
  // persisted to the session rollout JSONL as `event_msg`/`token_count`
  // records. We tail that file, cursor-gated by rollout LINE INDEX, summing
  // ONLY the completed turns NEW since the last Stop. Each step is best-effort
  // — a hook must never block the session, so any read/extract failure here is
  // swallowed without aborting the turn_end write above.
  try {
    const rolloutPath = findCodexRollout(sessionId);
    if (rolloutPath) {
      let rollout = null;
      try { rollout = readFileSync(rolloutPath, "utf-8"); } catch { /* unreadable — skip */ }
      if (rollout) {
        const usageMod = await loadCodexUsage();
        if (usageMod && typeof usageMod.extractCodexUsageSince === "function") {
          const { resolveProjectAttributions } = await loadProjectAttribution();
          const cursor = db.getUsageCursor(sessionId);
          const { events, cursor: next } = usageMod.extractCodexUsageSince(rollout, cursor);
          if (events.length > 0) {
            // attributeAndInsertEvents both INSERTS locally and FORWARDS to the
            // platform (gated on ~/.context-mode/platform.json).
            attributeAndInsertEvents(db, sessionId, events, input, projectDir, "Stop", resolveProjectAttributions);
          }
          if (next) db.setUsageCursor(sessionId, next);
        }
      }
    }
  } catch {
    // Best-effort cost capture — never block the session on failure.
  }

  db.close();
} catch {
  // Codex hooks must not block the session.
}

flushAndExit("{}\n");
