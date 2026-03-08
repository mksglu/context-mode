/**
 * OpenCode TypeScript plugin entry point for context-mode.
 *
 * Provides three hooks:
 *   - tool.execute.before  — Routing enforcement (deny/modify/passthrough)
 *   - tool.execute.after   — Session event capture
 *   - experimental.session.compacting — Compaction snapshot generation
 *
 * Loaded by OpenCode via: import("context-mode/plugin").ContextModePlugin(ctx)
 *
 * Constraints:
 *   - No SessionStart hook (OpenCode doesn't support it — #14808, #5409)
 *   - No context injection (canInjectSessionContext: false)
 *   - Session cleanup happens at plugin init (no SessionStart)
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SessionDB } from "./session/db.js";
import { extractEvents } from "./session/extract.js";
import type { HookInput } from "./session/extract.js";
import { buildResumeSnapshot } from "./session/snapshot.js";
import type { SessionEvent } from "./types.js";
import { OpenCodeAdapter } from "./adapters/opencode/index.js";

// ── Types ─────────────────────────────────────────────────

/** OpenCode plugin context passed to the factory function. */
interface PluginContext {
  directory: string;
}

/** Shape of the input object OpenCode passes to hook functions. */
interface ToolHookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  is_error?: boolean;
  sessionID?: string;
}

// ── Helpers ───────────────────────────────────────────────

function getSessionDir(): string {
  const dir = join(
    homedir(),
    ".config",
    "opencode",
    "context-mode",
    "sessions",
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getDBPath(projectDir: string): string {
  const hash = createHash("sha256")
    .update(projectDir)
    .digest("hex")
    .slice(0, 16);
  return join(getSessionDir(), `${hash}.db`);
}

// ── Plugin Factory ────────────────────────────────────────

/**
 * OpenCode plugin factory. Called once when OpenCode loads the plugin.
 * Returns an object mapping hook event names to async handler functions.
 */
export const ContextModePlugin = async (ctx: PluginContext) => {
  // Resolve build dir from compiled JS location
  const buildDir = dirname(fileURLToPath(import.meta.url));

  // Load routing module (ESM .mjs, lives outside build/ in hooks/)
  const routingPath = resolve(buildDir, "..", "hooks", "core", "routing.mjs");
  const routing = await import(pathToFileURL(routingPath).href);
  await routing.initSecurity(buildDir);

  // Initialize session
  const projectDir = ctx.directory;
  const db = new SessionDB({ dbPath: getDBPath(projectDir) });
  const sessionId = randomUUID();
  db.ensureSession(sessionId, projectDir);

  // Auto-write AGENTS.md on startup for OpenCode projects
  try {
    new OpenCodeAdapter().writeRoutingInstructions(projectDir, resolve(buildDir, ".."));
  } catch {
    // best effort — never break plugin init
  }

  // Clean up old sessions on startup (replaces SessionStart hook)
  db.cleanupOldSessions(0);

  return {
    // ── PreToolUse: Routing enforcement ─────────────────

    "tool.execute.before": async (input: ToolHookInput) => {
      const toolName = input.tool_name ?? "";
      const toolInput = input.tool_input ?? {};

      let decision;
      try {
        decision = routing.routePreToolUse(toolName, toolInput, projectDir);
      } catch {
        return; // Routing failure → allow passthrough
      }

      if (!decision) return; // No routing match → passthrough

      if (decision.action === "deny" || decision.action === "ask") {
        // Throw to block — OpenCode catches this and denies the tool call
        throw new Error(decision.reason ?? "Blocked by context-mode");
      }

      if (decision.action === "modify" && decision.updatedInput) {
        // Mutate args in place — OpenCode reads the mutated input
        Object.assign(toolInput, decision.updatedInput);
      }

      // "context" action → no-op (OpenCode doesn't support context injection)
    },

    // ── PostToolUse: Session event capture ──────────────

    "tool.execute.after": async (input: ToolHookInput) => {
      try {
        const hookInput: HookInput = {
          tool_name: input.tool_name ?? "",
          tool_input: input.tool_input ?? {},
          tool_response: input.tool_output,
          tool_output: input.is_error ? { isError: true } : undefined,
        };

        const events = extractEvents(hookInput);
        for (const event of events) {
          // Cast: extract.ts SessionEvent lacks data_hash (computed by insertEvent)
          db.insertEvent(sessionId, event as SessionEvent, "PostToolUse");
        }
      } catch {
        // Silent — session capture must never break the tool call
      }
    },

    // ── PreCompact: Snapshot generation ─────────────────

    "experimental.session.compacting": async () => {
      try {
        const events = db.getEvents(sessionId);
        if (events.length === 0) return "";

        const stats = db.getSessionStats(sessionId);
        const snapshot = buildResumeSnapshot(events, {
          compactCount: (stats?.compact_count ?? 0) + 1,
        });

        db.upsertResume(sessionId, snapshot, events.length);
        db.incrementCompactCount(sessionId);

        return snapshot;
      } catch {
        return "";
      }
    },
  };
};
