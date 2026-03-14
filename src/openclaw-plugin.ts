/**
 * OpenClaw TypeScript plugin entry point for context-mode.
 *
 * Exports an object with { id, name, configSchema, register(api) } for
 * declarative metadata and config validation before code execution.
 *
 * register(api) registers:
 *   - before_tool_call hook   — Routing enforcement (deny/modify/passthrough)
 *   - after_tool_call hook    — Session event capture
 *   - command:new hook         — Session initialization and cleanup
 *   - session_start hook             — Re-key DB session to OpenClaw's session ID
 *   - before_compaction hook         — Flush events to resume snapshot
 *   - after_compaction hook          — Increment compact count
 *   - before_prompt_build (p=10)  — Resume snapshot injection into system context
 *   - before_prompt_build (p=5)   — Routing instruction injection into system context
 *   - context-mode engine      — Context engine with compaction management
 *   - /ctx-stats command       — Auto-reply command for session statistics
 *   - /ctx-doctor command      — Auto-reply command for diagnostics
 *   - /ctx-upgrade command     — Auto-reply command for upgrade
 *
 * Loaded by OpenClaw via: openclaw.extensions entry in package.json
 *
 * OpenClaw plugin paradigm:
 *   - Plugins export { id, name, configSchema, register(api) } for metadata
 *   - api.registerHook() for event-driven hooks
 *   - api.on() for typed lifecycle hooks
 *   - api.registerContextEngine() for compaction ownership
 *   - api.registerCommand() for auto-reply slash commands
 *   - Plugins run in-process with the Gateway (trusted code)
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SessionDB } from "./session/db.js";
import { extractEvents, extractUserEvents } from "./session/extract.js";
import type { HookInput } from "./session/extract.js";
import { buildResumeSnapshot } from "./session/snapshot.js";
import type { SessionEvent } from "./types.js";
import { OpenClawAdapter } from "./adapters/openclaw/index.js";

// ── OpenClaw Plugin API Types ─────────────────────────────

/** Context for auto-reply command handlers. */
interface CommandContext {
  senderId?: string;
  channel?: string;
  isAuthorizedSender?: boolean;
  args?: string;
  commandBody?: string;
  config?: Record<string, unknown>;
}

/** OpenClaw plugin API provided to the register function. */
interface OpenClawPluginApi {
  registerHook(
    event: string,
    handler: (...args: unknown[]) => unknown,
    meta: { name: string; description: string },
  ): void;
  /**
   * Register a typed lifecycle hook.
   * Supported names: "session_start", "before_compaction", "after_compaction",
   * "before_prompt_build"
   */
  on(
    event: string,
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number },
  ): void;
  registerContextEngine(id: string, factory: () => ContextEngineInstance): void;
  registerCommand?(cmd: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: CommandContext) => { text: string } | Promise<{ text: string }>;
  }): void;
  registerCli?(
    factory: (ctx: { program: unknown }) => void,
    meta: { commands: string[] },
  ): void;
  logger?: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
}

/** Context engine instance returned by the factory. */
interface ContextEngineInstance {
  info: { id: string; name: string; ownsCompaction: boolean };
  ingest(data: unknown): Promise<{ ingested: boolean }>;
  assemble(ctx: { messages: unknown[] }): Promise<{
    messages: unknown[];
    estimatedTokens: number;
  }>;
  compact(): Promise<{ ok: boolean; compacted: boolean }>;
}

/** Shape of the event OpenClaw passes to session_start hook. */
interface SessionStartEvent {
  sessionId?: string;
  agentId?: string;
  startedAt?: string;
}

/** Shape of the event object OpenClaw passes to before_tool_call hooks. */
interface BeforeToolCallEvent {
  toolName?: string;
  params?: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
}

/** Shape of the event OpenClaw passes to before_model_resolve hooks. */
interface BeforeModelResolveEvent {
  userMessage?: string;
  message?: string;
  content?: string;
}

/** Shape of the event object OpenClaw passes to tool_call:after hooks. */
interface AfterToolCallEvent {
  toolName?: string;
  params?: Record<string, unknown>;
  /** Result payload — OpenClaw v2+ uses `result`; older builds use `output`. */
  result?: unknown;
  output?: string;
  /** Error indicator — string message (v2+) or boolean flag (older builds). */
  error?: string;
  isError?: boolean;
  durationMs?: number;
}

/** Plugin config schema for OpenClaw validation. */
const configSchema = {
  type: "object" as const,
  properties: {
    enabled: {
      type: "boolean" as const,
      default: true,
      description: "Enable or disable the context-mode plugin.",
    },
  },
  additionalProperties: false,
};

// ── Helpers ───────────────────────────────────────────────

function getSessionDir(): string {
  const dir = join(
    homedir(),
    ".openclaw",
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

// ── Plugin Definition (object export) ─────────────────────

/**
 * OpenClaw plugin definition. The object form provides declarative metadata
 * (id, name, configSchema) that OpenClaw can read without executing code.
 * The register() method is called once when the plugin is loaded.
 */
export default {
  id: "context-mode",
  name: "Context Mode",
  configSchema,

  // OpenClaw calls register() synchronously — returning a Promise causes hooks
  // to be silently ignored. Async init runs eagerly; hooks await it on first use.
  register(api: OpenClawPluginApi): void {
    // Resolve build dir from compiled JS location
    const buildDir = dirname(fileURLToPath(import.meta.url));
    const projectDir = process.env.OPENCLAW_PROJECT_DIR || process.cwd();
    const pluginRoot = resolve(buildDir, "..");

    // Structured logger — wraps api.logger, falls back to no-op.
    // info/error always emit; debug only when api.logger.debug is present
    // (i.e. OpenClaw running with --log-level debug or lower).
    const log = {
      info: (...args: unknown[]) => api.logger?.info("[context-mode]", ...args),
      error: (...args: unknown[]) => api.logger?.error("[context-mode]", ...args),
      debug: (...args: unknown[]) => api.logger?.debug?.("[context-mode]", ...args),
      warn: (...args: unknown[]) => api.logger?.warn?.("[context-mode]", ...args),
    };

    // Initialize session synchronously (SessionDB constructor is sync)
    const db = new SessionDB({ dbPath: getDBPath(projectDir) });
    db.cleanupOldSessions(7);
    // Resume the most recent session for this project (survives gateway restarts)
    let sessionId = db.getMostRecentSession(projectDir) ?? randomUUID();
    let resumeInjected = false;
    db.ensureSession(sessionId, projectDir);

    // Load routing instructions synchronously for prompt injection
    let routingInstructions = "";
    try {
      const instructionsPath = resolve(
        buildDir,
        "..",
        "configs",
        "openclaw",
        "AGENTS.md",
      );
      if (existsSync(instructionsPath)) {
        routingInstructions = readFileSync(instructionsPath, "utf-8");
      }
    } catch {
      // best effort
    }

    // Async init: load routing module + write AGENTS.md. Hooks await this.
    const initPromise = (async () => {
      const routingPath = resolve(buildDir, "..", "hooks", "core", "routing.mjs");
      const routing = await import(pathToFileURL(routingPath).href);
      await routing.initSecurity(buildDir);

      try {
        new OpenClawAdapter().writeRoutingInstructions(projectDir, pluginRoot);
      } catch {
        // best effort — never break plugin init
      }

      return { routing };
    })();

    // ── 1. tool_call:before — Routing enforcement ──────────

    api.on(
      "before_tool_call",
      async (event: unknown) => {
        const { routing } = await initPromise;
        const e = event as BeforeToolCallEvent;
        const toolName = e.toolName ?? "";
        const toolInput = e.params ?? {};

        let decision;
        try {
          decision = routing.routePreToolUse(toolName, toolInput, projectDir);
        } catch {
          return; // Routing failure → allow passthrough
        }

        if (!decision) return; // No routing match → passthrough

        if (decision.action === "deny" || decision.action === "ask") {
          return {
            block: true,
            blockReason: decision.reason ?? "Blocked by context-mode",
          };
        }

        if (decision.action === "modify" && decision.updatedInput) {
          // In-place mutation — OpenClaw reads the mutated params object.
          Object.assign(toolInput, decision.updatedInput);
        }

        // "context" action → handled by before_prompt_build, not inline
      },
    );

    // ── 2. after_tool_call — Session event capture ─────────

    // Map OpenClaw tool names → Claude Code equivalents so extractEvents
    // can recognize them. OpenClaw uses lowercase names; CC uses PascalCase.
    const OPENCLAW_TOOL_MAP: Record<string, string> = {
      exec: "Bash",
      read: "Read",
      write: "Write",
      edit: "Edit",
      apply_patch: "Edit",
      glob: "Glob",
      grep: "Grep",
      search: "Grep",
    };

    api.on(
      "after_tool_call",
      async (event: unknown) => {
        try {
          const e = event as AfterToolCallEvent;
          const rawToolName = e.toolName ?? "";
          const mappedToolName = OPENCLAW_TOOL_MAP[rawToolName] ?? rawToolName;
          // Accept both result (v2+) and output (older builds)
          const rawResult = e.result ?? e.output;
          const resultStr =
            typeof rawResult === "string"
              ? rawResult
              : rawResult != null
                ? JSON.stringify(rawResult)
                : undefined;
          // Accept both error (string, v2+) and isError (boolean, older builds)
          const hasError = Boolean(e.error || e.isError);

          const hookInput: HookInput = {
            tool_name: mappedToolName,
            tool_input: e.params ?? {},
            tool_response: resultStr,
            tool_output: hasError ? { isError: true } : undefined,
          };

          const events = extractEvents(hookInput);

          if (events.length > 0) {
            for (const ev of events) {
              db.insertEvent(sessionId, ev as SessionEvent, "PostToolUse");
            }
            log.debug(`tool_call:after [${mappedToolName}] → ${events.length} event(s) captured`);
          } else if (rawToolName) {
            // Fallback: record any unrecognized tool call as a generic event
            const data = JSON.stringify({
              tool: rawToolName,
              params: e.params,
              durationMs: e.durationMs,
            });
            db.insertEvent(
              sessionId,
              {
                type: "tool_call",
                category: "openclaw",
                data,
                priority: 1,
                data_hash: createHash("sha256")
                  .update(data)
                  .digest("hex")
                  .slice(0, 16),
              },
              "PostToolUse",
            );
            log.debug(`tool_call:after [${rawToolName}] → generic fallback event captured`);
          }
        } catch {
          // Silent — session capture must never break the tool call
        }
      },
    );

    // ── 3. command:new — Session initialization ────────────

    api.registerHook(
      "command:new",
      async () => {
        try {
          db.cleanupOldSessions(7);
        } catch {
          // best effort
        }
      },
      {
        name: "context-mode.session-new",
        description:
          "Session initialization — cleans up old sessions on /new command",
      },
    );

    // ── 3b. command:reset / command:stop — Session cleanup ────

    api.registerHook(
      "command:reset",
      async () => {
        try {
          db.cleanupOldSessions(7);
        } catch {
          // best effort
        }
      },
      {
        name: "context-mode.session-reset",
        description: "Session cleanup on /reset command",
      },
    );

    api.registerHook(
      "command:stop",
      async () => {
        try {
          db.cleanupOldSessions(7);
        } catch {
          // best effort
        }
      },
      {
        name: "context-mode.session-stop",
        description: "Session cleanup on /stop command",
      },
    );

    // ── 4. session_start — Re-key DB session to OpenClaw's session ID ─

    api.on(
      "session_start",
      async (event: unknown) => {
        try {
          const e = event as SessionStartEvent;
          if (e?.sessionId && e.sessionId !== sessionId) {
            const sid = e.sessionId as ReturnType<typeof randomUUID>;
            db.renameSession(sessionId, sid);
            sessionId = sid;
            log.info(`session re-keyed → ${sid.slice(0, 8)}…`);
          }
          resumeInjected = false;
        } catch {
          // best effort — never break session start
        }
      },
    );

    // ── 5. before_compaction — Flush events to snapshot before compaction ─

    api.on(
      "before_compaction",
      async () => {
        try {
          const events = db.getEvents(sessionId);
          if (events.length === 0) return;
          const freshStats = db.getSessionStats(sessionId);
          const snapshot = buildResumeSnapshot(events, {
            compactCount: (freshStats?.compact_count ?? 0) + 1,
          });
          db.upsertResume(sessionId, snapshot, events.length);
        } catch {
          // best effort — never break compaction
        }
      },
    );

    // ── 6. after_compaction — Increment compact count ─────

    api.on(
      "after_compaction",
      async () => {
        try {
          db.incrementCompactCount(sessionId);
        } catch {
          // best effort
        }
      },
    );

    // ── 7. before_model_resolve — User message capture ────────

    api.on(
      "before_model_resolve",
      async (event: unknown) => {
        try {
          const e = event as BeforeModelResolveEvent;
          const text = e?.userMessage ?? e?.message ?? e?.content ?? "";
          if (!text) return;
          const events = extractUserEvents(text);
          for (const ev of events) {
            db.insertEvent(sessionId, ev as import("./types.js").SessionEvent, "PostToolUse");
          }
        } catch {
          // best effort — never break model resolution
        }
      },
    );

    // ── 8. before_prompt_build — Resume snapshot injection ────

    api.on(
      "before_prompt_build",
      () => {
        try {
          if (resumeInjected) return undefined;
          const resume = db.getResume(sessionId);
          if (!resume) return undefined;
          const freshStats = db.getSessionStats(sessionId);
          if ((freshStats?.compact_count ?? 0) === 0) return undefined;
          resumeInjected = true;
          log.debug(`before_prompt_build: injecting resume snapshot (${resume.snapshot.length} chars)`);
          return { prependSystemContext: resume.snapshot };
        } catch {
          return undefined;
        }
      },
      { priority: 10 },
    );

    // ── 8. before_prompt_build — Routing instruction injection ──

    if (routingInstructions) {
      api.on(
        "before_prompt_build",
        () => ({
          appendSystemContext: routingInstructions,
        }),
        { priority: 5 },
      );
    }

    // ── 9. Context engine — Compaction management ──────────

    api.registerContextEngine("context-mode", () => ({
      info: {
        id: "context-mode",
        name: "Context Mode",
        ownsCompaction: true,
      },

      async ingest() {
        return { ingested: true };
      },

      async assemble({ messages }: { messages: unknown[] }) {
        return { messages, estimatedTokens: 0 };
      },

      async compact() {
        try {
          const events = db.getEvents(sessionId);
          if (events.length === 0) return { ok: true, compacted: false };

          const stats = db.getSessionStats(sessionId);
          const snapshot = buildResumeSnapshot(events, {
            compactCount: (stats?.compact_count ?? 0) + 1,
          });

          db.upsertResume(sessionId, snapshot, events.length);
          db.incrementCompactCount(sessionId);

          return { ok: true, compacted: true };
        } catch {
          return { ok: false, compacted: false };
        }
      },
    }));

    // ── 10. Auto-reply commands — ctx slash commands ──────

    if (api.registerCommand) {
      api.registerCommand({
        name: "ctx-stats",
        description: "Show context-mode session statistics",
        handler: () => {
          const text = buildStatsText(db, sessionId);
          return { text };
        },
      });

      api.registerCommand({
        name: "ctx-doctor",
        description: "Run context-mode diagnostics",
        handler: () => {
          const cmd = `node "${pluginRoot}/build/cli.js" doctor`;
          return {
            text: [
              "## ctx-doctor",
              "",
              "Run this command to diagnose context-mode:",
              "",
              "```",
              cmd,
              "```",
            ].join("\n"),
          };
        },
      });

      api.registerCommand({
        name: "ctx-upgrade",
        description: "Upgrade context-mode to the latest version",
        handler: () => {
          const cmd = `node "${pluginRoot}/build/cli.js" upgrade`;
          return {
            text: [
              "## ctx-upgrade",
              "",
              "Run this command to upgrade context-mode:",
              "",
              "```",
              cmd,
              "```",
              "",
              "Restart your session after upgrade.",
            ].join("\n"),
          };
        },
      });
    }
  },
};

// ── Stats helper ──────────────────────────────────────────

function buildStatsText(db: SessionDB, sessionId: string): string {
  try {
    const events = db.getEvents(sessionId);
    const stats = db.getSessionStats(sessionId);
    const lines: string[] = [
      "## context-mode stats",
      "",
      `- Session: \`${sessionId.slice(0, 8)}…\``,
      `- Events captured: ${events.length}`,
      `- Compactions: ${stats?.compact_count ?? 0}`,
    ];

    // Summarize events by type
    const byType: Record<string, number> = {};
    for (const ev of events) {
      const key = ev.type ?? "unknown";
      byType[key] = (byType[key] ?? 0) + 1;
    }
    if (Object.keys(byType).length > 0) {
      lines.push("- Event breakdown:");
      for (const [type, count] of Object.entries(byType)) {
        lines.push(`  - ${type}: ${count}`);
      }
    }

    return lines.join("\n");
  } catch {
    return "context-mode stats unavailable (session DB error)";
  }
}
