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

import { resolveContextModeDataRoot } from "../base.js";
import { resolveSessionDbPath, SessionDB } from "../../session/db.js";
import { OpenClawSessionDB } from "./session-db.js";
import { extractEvents, extractUserEvents } from "../../session/extract.js";
import type { HookInput } from "../../session/extract.js";
import { buildResumeSnapshot } from "../../session/snapshot.js";
import type { SessionEvent } from "../../types.js";

import { WorkspaceRouter } from "./workspace-router.js";
import { buildNodeCommand } from "../types.js";
import { OPENCLAW_TOOL_DEFS } from "./mcp-tools.js";
import type { OpenClawToolDef } from "./mcp-tools.js";

// ── System-reminder filter (CCv2 — SLICE OClaw-3) ─────────
// Mirror hooks/userpromptsubmit.mjs:30-33: skip system-generated wrappers
// so before_model_resolve never inserts spurious user-prompt events.
const SYSTEM_REMINDER_PREFIXES = [
  "<system-reminder>",
  "<task-notification>",
  "<context_guidance>",
  "<tool-result>",
] as const;
const SKILL_FRONTMATTER_REGEX = /^---\s*\n[\s\S]*?\n---\s*\n?/;
const OPENCLAW_SKILL_PROMPT_CHAR_LIMIT = 6000;
const SKILL_SECTION_HEADINGS = [
  "MANDATORY RULE",
  "Decision Tree",
  "When to Use Each Tool",
  "Critical Rules",
] as const;
function isSystemReminderMessage(msg: string): boolean {
  const trimmed = msg.trimStart();
  for (const prefix of SYSTEM_REMINDER_PREFIXES) {
    if (trimmed.startsWith(prefix)) return true;
  }
  return false;
}
function stripMarkdownFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  return normalized.replace(SKILL_FRONTMATTER_REGEX, "").trim();
}
function extractMarkdownSection(markdown: string, heading: string): string | null {
  const sectionHeader = `## ${heading}`;
  const start = markdown.indexOf(sectionHeader);
  if (start === -1) return null;
  const afterHeader = markdown.slice(start + sectionHeader.length);
  const nextHeadingOffset = afterHeader.search(/\n##\s+|\n#\s+/);
  const body = (nextHeadingOffset === -1 ? afterHeader : afterHeader.slice(0, nextHeadingOffset)).trim();
  if (!body) return null;
  return `${sectionHeader}\n\n${body}`;
}
function buildOpenClawSkillLikeGuidance(skillMarkdown: string): string {
  const skillBody = stripMarkdownFrontmatter(skillMarkdown);
  const skillTitle = skillBody.match(/^#\s+.+$/m)?.[0]?.trim() ?? "# Context Mode Skill";
  const selectedSections = SKILL_SECTION_HEADINGS
    .map((heading) => extractMarkdownSection(skillBody, heading))
    .filter((section): section is string => Boolean(section));
  const rawContent = (
    selectedSections.length > 0
      ? [skillTitle, ...selectedSections].join("\n\n")
      : skillBody
  ).trim();
  const boundedContent = rawContent.length > OPENCLAW_SKILL_PROMPT_CHAR_LIMIT
    ? `${rawContent.slice(0, OPENCLAW_SKILL_PROMPT_CHAR_LIMIT).trimEnd()}\n\n[skill excerpt truncated for prompt budget]`
    : rawContent;
  return [
    "<context_mode_skill_like_guidance source=\"skills/context-mode/SKILL.md\">",
    boundedContent,
    "</context_mode_skill_like_guidance>",
  ].join("\n");
}

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

interface OpenClawCommandDefinition {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  handler: (ctx: CommandContext) => { text: string } | Promise<{ text: string }>;
}

/** OpenClaw plugin API provided to the register function. */
interface OpenClawPluginApi {
  registerHook?(
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
  registerContextEngine?(id: string, factory: () => ContextEngineInstance): void;
  registerCommand?: (cmd: OpenClawCommandDefinition) => void;
  registerCli?(
    factory: (ctx: { program: unknown }) => void,
    meta: { commands: string[] },
  ): void;
  /**
   * Register an agent tool (OpenClaw native registerTool) — see
   * refs/platforms/openclaw/docs/plugins/building-plugins.md:116. Optional in
   * the type so we degrade silently on legacy hosts that pre-date this API.
   */
  registerTool?(tool: OpenClawToolDef, opts?: { optional?: boolean }): void;
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
  sessionKey?: string;
  resumedFrom?: string;
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
  /** Stable per agent turn — all tool calls in the same LLM response share a runId. */
  runId?: string;
  toolCallId?: string;
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
  // Issue #649: honor CONTEXT_MODE_DATA_DIR universal storage override
  // ahead of the hardcoded ~/.openclaw root so dev-container/CI/NFS-home
  // users can relocate context-mode storage without patching the source.
  // Kept in sync with OpenClawAdapter.getSessionDir() (inherited from
  // BaseAdapter) — both call sites must agree byte-for-byte.
  const override = resolveContextModeDataRoot();
  const dir = override
    ? join(override, "context-mode", "sessions")
    : join(homedir(), ".openclaw", "context-mode", "sessions");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Issue #645 follow-up — route through the canonical per-project
// resolver the MCP server uses (src/server.ts ctx_stats / ctx_search
// timeline). The previous raw `sha256(projectDir).slice(0, 16)` shape
// produced a different file from the `<canonical-hash>.db` the server
// reads on darwin/win32 (case-fold) and inside linked worktrees
// (suffix). The result was silent degradation of `ctx_stats` (zero
// history) and `ctx_search(sort: "timeline")` (sort dropped) for any
// OpenClaw user with an uppercase character in their projectDir.
// Mirrors the matching Pi (src/adapters/pi/extension.ts:223) and OMP
// (src/adapters/omp/plugin.ts:90) fixes, and the opencode plugin
// pattern (src/adapters/opencode/plugin.ts:307).
function getDBPath(projectDir: string): string {
  return resolveSessionDbPath({ projectDir, sessionsDir: getSessionDir() });
}

// ── Module-level DB singleton ─────────────────────────────
// Shared across all register() calls (one per agent session).
// Lazy-initialized on first register() using the first projectDir seen.
// Uses OpenClawSessionDB for session_key mapping and rename support.
let _dbSingleton: OpenClawSessionDB | null = null;
let _dbSingletonPath = "";
function getOrCreateDB(projectDir: string): OpenClawSessionDB {
  // Reopen the singleton if the resolved DB path changes. Production
  // code normally loads the plugin once per process with a single
  // workspace, but defensive re-keying on resolved path keeps the
  // contract honest if a host ever calls register() twice with
  // different projectDirs, and removes a subtle test-isolation
  // foot-gun where a stale singleton pointed at a prior test's
  // `<hash>.db`. Mirrors the Pi/OMP fix (#645).
  const dbPath = getDBPath(projectDir);
  if (!_dbSingleton || _dbSingletonPath !== dbPath) {
    if (_dbSingleton) {
      try { _dbSingleton.close(); } catch { /* best effort */ }
    }
    _dbSingleton = new OpenClawSessionDB({ dbPath });
    _dbSingletonPath = dbPath;
    _dbSingleton.cleanupOldSessions(7);
  }
  return _dbSingleton;
}

// ── Module-level state for command handlers ───────────────
// Commands are re-registered on each register() call (OpenClaw's registerCommand
// is idempotent). These refs give handlers access to the current session's state.
let _latestDb: OpenClawSessionDB | null = null;
let _latestSessionId = "";
let _latestPluginRoot = "";

// ── Plugin Definition (object export) ─────────────────────

/**
 * OpenClaw plugin definition. The object form provides declarative metadata
 * (id, name, configSchema) that OpenClaw can read without executing code.
 * register() is called once per agent session with a fresh api object.
 * Each call creates isolated closures (db, sessionId, hooks) — no shared state.
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
    const projectDir = process.cwd();
    const pluginRoot = resolve(buildDir, "..", "..", "..");

    // Structured logger — wraps api.logger, falls back to no-op.
    // info/error always emit; debug only when api.logger.debug is present
    // (i.e. OpenClaw running with --log-level debug or lower).
    const log = {
      info: (...args: unknown[]) => api.logger?.info?.("[context-mode]", ...args),
      error: (...args: unknown[]) => api.logger?.error?.("[context-mode]", ...args),
      debug: (...args: unknown[]) => api.logger?.debug?.("[context-mode]", ...args),
      warn: (...args: unknown[]) => api.logger?.warn?.("[context-mode]", ...args),
    };

    const registerCommandHook = (
      event: string,
      handler: () => Promise<void> | void,
      meta: { name: string; description: string },
    ): void => {
      if (api.registerHook) {
        api.registerHook(event, handler, meta);
        return;
      }
      try {
        api.on(event, handler as (...args: unknown[]) => unknown);
        log.debug("command hook registered via api.on fallback", { event });
      } catch (err) {
        log.warn?.("command hook registration skipped", { event }, err);
      }
    };

    const registerAutoReplyCommand = (command: OpenClawCommandDefinition): void => {
      if (!api.registerCommand) return;
      try {
        api.registerCommand(command);
      } catch (err) {
        log.warn?.(
          "registerCommand failed; skipping auto-reply command",
          { name: command.name },
          err,
        );
      }
    };

    // Get shared DB singleton (lazy-init on first register() call)
    const db = getOrCreateDB(projectDir);
    // Start with temp UUID — session_start will assign the real ID + sessionKey
    let sessionId = randomUUID();
    log.info("register() called, sessionId:", sessionId.slice(0, 8));
    // SLICE OClaw-6 (F6 retraction): `resumeInjected` is correctly scoped
    // per-register() singleton — Phase 7 confirmed F6 fabrication-as-tech-debt.
    // Each OpenClaw agent session calls register() once and gets its own
    // closure; the flag prevents double-injection of the resume snapshot in
    // back-to-back before_prompt_build calls within the same session. Do not
    // promote to module scope.
    let resumeInjected = false;
    let sessionKey: string | undefined;
    // Create temp session so after_tool_call events before session_start have a valid row
    db.ensureSession(sessionId, projectDir);

    const workspaceRouter = new WorkspaceRouter();

    // Async init: load routing module + dynamic routing-block factory.
    // SLICE OClaw-2: replaced static readFileSync(configs/openclaw/AGENTS.md)
    // with createRoutingBlock(createToolNamer("openclaw")) so OpenClaw-specific
    // MCP-prefix substitution stays in lockstep with hooks/routing-block.mjs.
    let routingInstructions = "";
    let skillLikeInstructions = "";
    const initPromise = (async () => {
      const routingPath = resolve(buildDir, "..", "..", "..", "hooks", "core", "routing.mjs");
      const routing = await import(pathToFileURL(routingPath).href);
      // initSecurity() looks for `<dir>/security.js`, which lives at the
      // top of build/ — two levels up from this adapter directory.
      const buildRoot = resolve(buildDir, "..", "..");
      await routing.initSecurity(buildRoot);

      try {
        const blockMod = await import(
          pathToFileURL(resolve(buildDir, "..", "..", "..", "hooks", "routing-block.mjs")).href
        );
        const namingMod = await import(
          pathToFileURL(
            resolve(buildDir, "..", "..", "..", "hooks", "core", "tool-naming.mjs"),
          ).href
        );
        const toolNamer = namingMod.createToolNamer("openclaw");
        routingInstructions = blockMod.createRoutingBlock(toolNamer);
      } catch (err) {
        log.warn?.("failed to build dynamic routing block", err);
        // Fallback: legacy disk-read of AGENTS.md (kept for resilience only —
        // primary path is the dynamic factory above).
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
      }

      try {
        const skillPath = resolve(pluginRoot, "skills", "context-mode", "SKILL.md");
        if (existsSync(skillPath)) {
          skillLikeInstructions = buildOpenClawSkillLikeGuidance(readFileSync(skillPath, "utf-8"));
        } else {
          log.debug("context-mode skill file missing; skipping skill-like prompt injection", { skillPath });
        }
      } catch (err) {
        log.warn?.("failed to build skill-like guidance from SKILL.md", err);
      }

      return { routing };
    })();

    // ── 1. tool_call:before — Routing enforcement ──────────
    // NOTE: api.on() was broken in OpenClaw ≤2026.1.29 (fixed in PR #9761, issue #5513).
    // api.on() is the correct API for typed lifecycle hooks (session_start, before_tool_call, etc.).
    // api.registerHook() is for generic/command hooks (command:new, command:reset, command:stop).

    api.on(
      "before_tool_call",
      async (event: unknown) => {
        const { routing } = await initPromise;
        const e = event as BeforeToolCallEvent;
        const toolName = e.toolName ?? "";
        const toolInput = e.params ?? {};

        let decision;
        try {
          decision = routing.routePreToolUse(toolName, toolInput, projectDir, "openclaw");
        } catch {
          return; // Routing failure → allow passthrough
        }

        if (!decision) return; // No routing match → passthrough

        log.debug("before_tool_call", { tool: toolName, action: decision.action });

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

          // Resolve agent-specific sessionId from workspace paths in params
          const routedSessionId = workspaceRouter.resolveSessionId(e.params ?? {}) ?? sessionId;

          if (events.length > 0) {
            for (const ev of events) {
              db.insertEvent(routedSessionId, ev as SessionEvent, "PostToolUse");
            }
            log.debug("after_tool_call", { tool: rawToolName, mapped: mappedToolName, sessionId: routedSessionId.slice(0, 8), events: events.length, durationMs: e.durationMs });
          } else if (rawToolName) {
            // Fallback: record any unrecognized tool call as a generic event
            const data = JSON.stringify({
              tool: rawToolName,
              params: e.params,
              durationMs: e.durationMs,
            });
            db.insertEvent(
              routedSessionId,
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
            log.debug("after_tool_call", { tool: rawToolName, mapped: rawToolName, sessionId: routedSessionId.slice(0, 8), events: 1, durationMs: e.durationMs });
          }
        } catch {
          // Silent — session capture must never break the tool call
        }
      },
    );

    // ── 3. command:new — Session initialization ────────────

    registerCommandHook(
      "command:new",
      async () => {
        try {
          log.debug("command:new", { sessionId: sessionId.slice(0, 8) });
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

    registerCommandHook(
      "command:reset",
      async () => {
        try {
          log.debug("command:reset", { sessionId: sessionId.slice(0, 8) });
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
    registerCommandHook(
      "command:stop",
      async () => {
        try {
          log.debug("command:stop", { sessionId: sessionId.slice(0, 8), sessionKey });
          if (sessionKey) {
            workspaceRouter.removeSession(sessionKey);
          }
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
          const sid = e?.sessionId;
          if (!sid) return;

          const key = e?.sessionKey;
          const resumedFrom = e?.resumedFrom;
          log.debug("session_start", { sessionId: sid.slice(0, 8), sessionKey: key, resumedFrom });

          if (key) {
            // Per-agent session lookup via sessionKey
            const prevId = db.getMostRecentSession(key);
            if (prevId && prevId !== sid) {
              db.renameSession(prevId, sid);
              log.info(`session re-keyed ${prevId.slice(0, 8)}… → ${sid.slice(0, 8)}… (key=${key})`);
            } else if (!prevId) {
              db.ensureSessionWithKey(sid, projectDir, key);
              log.info(`new session ${sid.slice(0, 8)}… (key=${key})`);
            }
          } else {
            // Fallback: no sessionKey → fresh session (Option A)
            db.ensureSession(sid, projectDir);
            log.info(`session ${sid.slice(0, 8)}… (no sessionKey — fallback)`);
          }

          sessionId = sid as ReturnType<typeof randomUUID>;
          _latestSessionId = sessionId;
          sessionKey = key;
          if (key) {
            workspaceRouter.registerSession(key, sessionId);
          }
          resumeInjected = false;

          // Write routing instructions (AGENTS.md) now that we know the real
          // workspace. Derive the workspace directory from the sessionKey so we
          // only write into recognised /.openclaw/workspace* paths, never into
          // the gateway's cwd or any other arbitrary directory.
        } catch {
          // best effort — never break session start
        }
      },
    );

    // ── 5. before_compaction — Flush events to snapshot before compaction ─
    // NOTE: OpenClaw compaction hooks were broken until #4967/#3728 fix.
    // Adapter gracefully degrades — session recovery falls back to DB snapshot
    // reconstruction when compaction events don't fire.

    api.on(
      "before_compaction",
      async () => {
        try {
          const sid = sessionId; // snapshot to avoid race with concurrent session_start
          const allEvents = db.getEvents(sid);
          log.debug("before_compaction", { sessionId: sid.slice(0, 8), events: allEvents.length });
          if (allEvents.length === 0) return;
          const freshStats = db.getSessionStats(sid);
          const snapshot = buildResumeSnapshot(allEvents, {
            compactCount: (freshStats?.compact_count ?? 0) + 1,
          });
          db.upsertResume(sid, snapshot, allEvents.length);
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
          const sid = sessionId;
          log.debug("after_compaction", { sessionId: sid.slice(0, 8) });
          db.incrementCompactCount(sid); // sessionId consistent with before_compaction within same sync cycle
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
          const sid = sessionId; // snapshot to avoid race with concurrent session_start
          const e = event as BeforeModelResolveEvent;
          const messageText = e?.userMessage ?? e?.message ?? e?.content ?? "";
          log.debug("before_model_resolve", { hasMessage: !!messageText });
          if (!messageText) return;
          // SLICE OClaw-3: skip system-generated wrappers so we never
          // misclassify them as user prompts. Mirrors hooks/userpromptsubmit.mjs:30-33.
          if (isSystemReminderMessage(messageText)) {
            log.debug("before_model_resolve[skip-system-reminder]");
            return;
          }
          const events = extractUserEvents(messageText);
          for (const ev of events) {
            db.insertEvent(sid, ev as import("../../types.js").SessionEvent, "PostToolUse");
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
          const sid = sessionId; // snapshot to avoid race with concurrent session_start
          const resume = db.getResume(sid);
          log.debug("before_prompt_build[resume]", { sessionId: sid.slice(0, 8), hasResume: !!resume, injected: !resumeInjected });
          if (resumeInjected) return undefined;
          if (!resume) return undefined;
          const freshStats = db.getSessionStats(sid);
          if ((freshStats?.compact_count ?? 0) === 0) return undefined;
          resumeInjected = true;
          return { prependSystemContext: resume.snapshot };
        } catch {
          return undefined;
        }
      },
      { priority: 10 },
    );

    // ── 8. before_prompt_build — Routing instruction injection ──
    // SLICE OClaw-2: register unconditionally; routingInstructions is populated
    // asynchronously by initPromise. The closure resolves the latest value at
    // call-time, so the first prompt-build firing after dynamic-import resolution
    // sees the dynamic ROUTING_BLOCK XML (matching hooks/routing-block.mjs).

    api.on(
      "before_prompt_build",
      () => {
        if (!routingInstructions && !skillLikeInstructions) return undefined;
        log.debug("before_prompt_build[routing+skill]", {
          hasRoutingInstructions: !!routingInstructions,
          hasSkillLikeInstructions: !!skillLikeInstructions,
        });
        const injectedBlocks: string[] = [];
        if (routingInstructions) {
          // v1.0.107 — visible marker so OpenClaw users can verify the routing
          // block reached the model (Mickey-class verification path; mirrors
          // OpenCode + Pi adapters).
          const marker = `<!-- context-mode: routing block injected (sessionID=${String(sessionId).slice(0, 8)}) -->`;
          injectedBlocks.push(marker + "\n" + routingInstructions);
        }
        if (skillLikeInstructions) injectedBlocks.push(skillLikeInstructions);
        return { appendSystemContext: injectedBlocks.join("\n\n") };
      },
      { priority: 5 },
    );

    // ── 8b. registerTool — Expose 11 ctx_* tools (SLICE OClaw-1) ────
    // Phase 7 audit (v1.0.107-adapter-openclaw.json) flagged severity=CRITICAL:
    // routing block tells agents to call ctx_execute / ctx_search / etc. but
    // nothing called api.registerTool, so the tools didn't exist in the
    // OpenClaw session. This loop fixes that — mirrors swarmvault MCP pattern
    // (refs/plugin-examples/openclaw/swarmvault/packages/engine/src/mcp.ts:46-51).
    if (api.registerTool) {
      for (const def of OPENCLAW_TOOL_DEFS) {
        try {
          api.registerTool(def);
        } catch (err) {
          log.warn?.("registerTool failed", { name: def.name }, err);
        }
      }
      log.debug("registerTool[ctx_*]", { count: OPENCLAW_TOOL_DEFS.length });
    } else {
      log.warn?.("api.registerTool unavailable — ctx_* tools not exposed in this OpenClaw build");
    }

    // ── 8c. session_end — Finalize resume snapshot (SLICE OClaw-4) ───
    // OpenClaw fires session_end at session lifecycle boundaries (per
    // refs/platforms/openclaw/docs/plugins/hooks.md:110). We persist a final
    // resume snapshot so a future session_start with resumedFrom can re-attach.
    api.on(
      "session_end",
      async () => {
        try {
          const sid = sessionId;
          const allEvents = db.getEvents(sid);
          log.debug("session_end", { sessionId: sid.slice(0, 8), events: allEvents.length });
          if (allEvents.length === 0) return;
          const freshStats = db.getSessionStats(sid);
          const snapshot = buildResumeSnapshot(allEvents, {
            compactCount: freshStats?.compact_count ?? 0,
          });
          db.upsertResume(sid, snapshot, allEvents.length);
        } catch {
          // best effort — never break session shutdown
        }
      },
    );

    // ── 8d. subagent_spawning — Inject routing block (SLICE OClaw-5) ─
    // OpenClaw's subagent lifecycle (hooks.md:116) gives us a chance to seed
    // every spawned subagent with the same routing block the parent agent
    // sees. Without this, subagents have no MCP-routing guidance and degrade
    // back to flooding the context with raw tool output.
    api.on(
      "subagent_spawning",
      (event: unknown) => {
        try {
          const e = (event ?? {}) as { input?: { prompt?: string } };
          const basePrompt = e?.input?.prompt ?? "";
          if (!routingInstructions && !skillLikeInstructions) return undefined;
          const injectedBlocks: string[] = [];
          if (routingInstructions) injectedBlocks.push(routingInstructions);
          if (skillLikeInstructions) injectedBlocks.push(skillLikeInstructions);
          const injectedPromptBlock = injectedBlocks.join("\n\n");
          const newPrompt = basePrompt
            ? `${basePrompt}\n\n${injectedPromptBlock}`
            : injectedPromptBlock;
          log.debug("subagent_spawning[inject-routing+skill]", {
            basePromptLen: basePrompt.length,
            hasRoutingInstructions: !!routingInstructions,
            hasSkillLikeInstructions: !!skillLikeInstructions,
            blockLen: injectedPromptBlock.length,
          });
          return { inputOverride: { ...(e.input ?? {}), prompt: newPrompt } };
        } catch {
          return undefined;
        }
      },
    );

    // ── 9. Context engine — Compaction management ──────────

    if (api.registerContextEngine) {
      api.registerContextEngine("context-mode", () => ({
        info: {
          id: "context-mode",
          name: "Context Mode",
          ownsCompaction: false,
        },

        async ingest() {
          return { ingested: true };
        },

        async assemble({ messages }: { messages: unknown[] }) {
          return { messages, estimatedTokens: 0 };
        },

        async compact() {
          // No-op: session continuity is handled by before_compaction / after_compaction hooks.
          // Returning ownsCompaction: false + compacted: false lets the host platform (OpenClaw)
          // manage conversation truncation, preserving Anthropic thinking/redacted_thinking blocks.
          // See: https://github.com/mksglu/context-mode/issues/191
          return { ok: true, compacted: false };
        },
      }));
    } else {
      log.warn?.("api.registerContextEngine unavailable — skipping context engine registration");
    }

    // ── 10. Auto-reply commands — ctx slash commands ──────
    // Update module-level refs so command handlers (registered once) always
    // read the latest session's db/sessionId/pluginRoot.
    _latestDb = db;
    _latestSessionId = sessionId;
    _latestPluginRoot = pluginRoot;

    if (api.registerCommand) {
      registerAutoReplyCommand({
        name: "ctx-stats",
        description: "Show context-mode session statistics",
        handler: () => {
          const text = buildStatsText(_latestDb!, _latestSessionId);
          return { text };
        },
      });
      registerAutoReplyCommand({
        name: "ctx-doctor",
        description: "Run context-mode diagnostics",
        handler: () => {
          const bundlePath = resolve(_latestPluginRoot, "cli.bundle.mjs");
          const fallbackPath = resolve(_latestPluginRoot, "build", "cli.js");
          const cliPath = existsSync(bundlePath) ? bundlePath : fallbackPath;
          const cmd = `${buildNodeCommand(cliPath)} doctor`;
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

      registerAutoReplyCommand({
        name: "ctx-upgrade",
        description: "Upgrade context-mode to the latest version",
        handler: () => {
          const bundlePath = resolve(_latestPluginRoot, "cli.bundle.mjs");
          const fallbackPath = resolve(_latestPluginRoot, "build", "cli.js");
          const cliPath = existsSync(bundlePath) ? bundlePath : fallbackPath;
          const cmd = `${buildNodeCommand(cliPath)} upgrade`;
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
