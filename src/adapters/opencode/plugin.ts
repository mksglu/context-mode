/**
 * OpenCode / KiloCode TypeScript plugin entry point for context-mode.
 *
 * Provides five hooks (v1.0.107 — Mickey OC-1..OC-4 follow-up):
 *   - tool.execute.before  — Routing enforcement (deny/modify/passthrough)
 *   - tool.execute.after   — Session event capture + first-fire AGENTS.md scan (OC-4)
 *   - experimental.session.compacting — Compaction snapshot + budget-capped auto-injection (OC-3)
 *   - experimental.chat.system.transform — ROUTING_BLOCK + resume snapshot injection (OC-1)
 *   - chat.message         — User-prompt capture w/ CCv2 inline filter (OC-2) + AGENTS.md scan (OC-4)
 *
 * KiloCode loads this via: import("context-mode") → expects default export
 * with shape { server: (input) => Promise<Hooks> } (PluginModule).
 *
 * OpenCode loads this via: import("context-mode/plugin") → also supports
 * the named export ContextModePlugin for backward compat.
 *
 * Constraints:
 *   - No SessionStart hook (OpenCode doesn't support it — #14808, #5409)
 *   - context injection now via chat.system.transform surrogate (OC-1)
 *   - No routing file auto-write (avoid dirtying project trees)
 *   - Session cleanup happens at plugin init (no SessionStart)
 *
 * OpenCode 2 note: V1 plugin implementations (the `server()` shape above) do
 * not run under OpenCode 2 — its plugin loader only recognizes a default
 * export produced by `Plugin.define({ id, setup })` from `@opencode/plugin`.
 * The bottom of this file exports BOTH shapes from one object, per OpenCode's
 * own documented "support V1 and V2 from one package" pattern
 * (opencode.ai/v2/docs/build/plugins#support-v1): OpenCode 1.x / KiloCode call
 * `server()` and use its returned hooks; OpenCode 2 reads `id`/`setup` off the
 * same object and ignores `server()`. See `setupContextModePluginV2` below.
 */

import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { resolveSessionDbPath, SessionDB } from "../../session/db.js";
import { extractEvents, extractUserEvents, parseOpencodeUsage, parseOpencodeV2StepUsage, buildAgentUsageEvent } from "../../session/extract.js";
import type { HookInput } from "../../session/extract.js";
import { buildResumeSnapshot } from "../../session/snapshot.js";
import type { SessionEvent } from "../../types.js";
import { AdapterPlatformType, OpenCodeAdapter } from "./index.js";
import { PLATFORM_ENV_VARS } from "../detect.js";
import { zod3ShapeToV4 } from "./zod3tov4.js";

// ── Types ─────────────────────────────────────────────────

/** KiloCode/OpenCode plugin input — both platforms pass at least `directory`. */
type PluginClientAppLogBodyExtra = {
  sessionId?: string;
  source?: string;
};

type PluginClientAppLogBody = {
  service: string;
  level: "info" | "warn" | "error" | "debug"; // Strict union for log levels
  message: string;
  extra?: PluginClientAppLogBodyExtra;
};

type PluginClientAppLogOptions = {
  body: PluginClientAppLogBody;
};

type PluginClientApp = {
  log: (options: PluginClientAppLogOptions) => Promise<void>;
};

type PluginClient = {
  app: PluginClientApp;
};

type PluginContext = {
  client: PluginClient;
  directory: string;
};

type NativeToolContext = {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;
  worktree?: string;
  abort?: AbortSignal;
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void;
};

type NativeToolDefinition = {
  description: string;
  args: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    ctx: NativeToolContext,
  ) => Promise<string | { title?: string; output: string; metadata?: Record<string, unknown> }>;
};

/** OpenCode tool.execute.before — first parameter */
interface BeforeHookInput {
  tool: string;
  sessionID: string;
  callID: string;
}

/** OpenCode tool.execute.before — second parameter */
interface BeforeHookOutput {
  args: any;
}

/** OpenCode tool.execute.after — first parameter */
interface AfterHookInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: any;
}

/** OpenCode tool.execute.after — second parameter */
interface AfterHookOutput {
  title: string;
  output: string;
  metadata: any;
}

/**
 * OpenCode generic bus `event` hook — single parameter.
 * The plugin SDK delivers every bus Event here (refs/platforms/opencode/
 * packages/plugin/src/index.ts:224). We narrow to `message.updated`, whose
 * `properties.info` is the full assistant Message carrying tokens/cost/modelID.
 */
interface EventHookInput {
  event?: {
    type?: string;
    properties?: { info?: { sessionID?: string } & Record<string, unknown> };
  };
}

/** OpenCode experimental.session.compacting — first parameter */
interface CompactingHookInput {
  sessionID: string;
}

/** OpenCode experimental.session.compacting — second parameter */
interface CompactingHookOutput {
  context: string[];
  prompt?: string;
}

/**
 * OpenCode experimental.chat.system.transform — first parameter.
 * Verified against sst/opencode/dev/packages/plugin/src/index.ts:
 *   input: { sessionID?: string; model: Model }
 * `sessionID` is optional in the SDK type but is in practice always set
 * (the transform runs *for* a session). We treat it as required and
 * skip injection when absent rather than fall back to a fabricated ID.
 *
 * NOTE: We deliberately do NOT use `experimental.chat.messages.transform`.
 * Its SDK input shape is `{}` (no sessionID) and its output is
 * `{ messages: { info: Message; parts: Part[] }[] }` — the prior code
 * (`output.messages.unshift({ role, content })`) wrote a value of the
 * wrong shape and was silently dropped (Mickey / PR #376 root cause).
 */
interface SystemTransformHookInput {
  sessionID?: string;
  model: unknown;
}

/** OpenCode experimental.chat.system.transform — second parameter */
interface SystemTransformHookOutput {
  system: string[];
}

/**
 * OpenCode chat.message hook — verified against
 * refs/platforms/opencode/packages/plugin/src/index.ts:233.
 *   input:  { sessionID; agent?; model?; messageID?; variant? }
 *   output: { message: UserMessage; parts: Part[] }
 * We read text from `parts[*].text` (the orchestrator reference at
 * refs/plugin-examples/opencode/opencode-orchestrator/src/plugin-handlers/
 * chat-message-handler.ts:41-65 uses the same pattern).
 */
interface ChatMessageHookInput {
  sessionID: string;
  agent?: string;
  messageID?: string;
}

interface ChatMessagePart {
  type: string;
  text?: string;
}

interface ChatMessageHookOutput {
  message: unknown;
  parts: ChatMessagePart[];
}

// Synthetic message tags emitted by harnesses (CCv2 inline filter). When the
// user "message" is actually a system-generated nudge (e.g. tool-result, system
// reminder), capturing it as user_prompt would flood the DB with noise.
const SYNTHETIC_MESSAGE_PREFIXES = [
  "<task-notification>",
  "<system-reminder>",
  "<context_guidance>",
  "<tool-result>",
];

function isSyntheticMessage(text: string): boolean {
  const trimmed = text.trim();
  return SYNTHETIC_MESSAGE_PREFIXES.some((p) => trimmed.startsWith(p));
}

// ── Helpers ───────────────────────────────────────────────

// Quorum markers — must NOT be substrings of each other (#487).
// Each token uniquely identifies the routing block / context-mode rules
// without overlapping any other marker. The XML tag is the primary signal;
// the two distinctive bare tool names are the secondary signals. Together
// any 2 of 3 confirm the system prompt already carries routing instructions.
const ROUTING_MARKERS = [
  "<context_window_protection>",
  "ctx_search",
  "ctx_index",
];

function systemHasRoutingInstructions(system: string[]): boolean {
  const text = system.join("\n");
  // Word-boundary check guards against unrelated identifiers that happen to
  // share a prefix/suffix (e.g. a hypothetical `ctx_search_v2`).
  const wordBoundary = (m: string) => {
    if (m.startsWith("<")) return text.includes(m);
    const re = new RegExp(`(?:^|\\W)${m.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\W|$)`);
    return re.test(text);
  };
  return ROUTING_MARKERS.filter(wordBoundary).length >= 2;
}

/**
 * Detect whether the plugin is running under KiloCode or OpenCode.
 *
 * Reuses the canonical PLATFORM_ENV_VARS list (src/adapters/detect.ts) instead
 * of hardcoding env var names — single source of truth, future-proof if Kilo
 * or OpenCode add/rename env vars upstream.
 *
 * Order matters: KiloCode is an OpenCode fork and sets `OPENCODE=1` in
 * addition to `KILO_PID`. PLATFORM_ENV_VARS lists `kilo` BEFORE `opencode`
 * so KILO_PID wins the iteration.
 *
 * Pre-fix version was `return process.env.KILO_PID ? "kilo" : "opencode";` —
 * surfaced by github.com/mksglu/context-mode/pull/376 (mikij). Full symmetric
 * fix: also actively check opencode env vars instead of blind fallback.
 */
function getPlatform(): AdapterPlatformType {
  for (const [platform, vars] of PLATFORM_ENV_VARS) {
    if (platform !== "kilo" && platform !== "opencode") continue;
    if (vars.some((v) => process.env[v.name])) {
      return platform as AdapterPlatformType;
    }
  }
  // Plugin host should always set one of the env vars. Fallback to opencode
  // (the wider ecosystem) when neither is set, for predictable behavior.
  return "opencode";
}

// ── Shared runtime (V1 + V2) ─────────────────────────────────
//
// Everything below is pure initialization — same steps, same order, same
// side effects as the original single-shape createContextModePlugin. It is
// extracted only so the V2 entrypoint (added for OpenCode 2 compatibility)
// can reuse it instead of duplicating ~40 lines of module loading; it does
// not change V1/KiloCode behavior.

async function createContextModeRuntime(directory: string) {
  const platform = getPlatform();
  const adapter = new OpenCodeAdapter(platform);
  const buildDir = dirname(fileURLToPath(import.meta.url));
  // initSecurity() looks for `<dir>/security.js`, which lives at the
  // top of build/ — two levels up from this adapter directory.
  const buildRoot = resolve(buildDir, "..", "..");

  // Load routing module (ESM .mjs, lives outside build/ in hooks/)
  const routingPath = resolve(buildDir, "..", "..", "..", "hooks", "core", "routing.mjs");
  const routing = await import(pathToFileURL(routingPath).href);
  await routing.initSecurity(buildRoot);

  // OC-1 / OC-3: Load hook helpers once at plugin init. Dynamic import keeps
  // the .mjs ESM islands isolated from the .ts compile graph.
  const routingBlockPath = resolve(buildDir, "..", "..", "..", "hooks", "routing-block.mjs");
  const routingBlockMod = await import(pathToFileURL(routingBlockPath).href);
  const toolNamingPath = resolve(buildDir, "..", "..", "..", "hooks", "core", "tool-naming.mjs");
  const toolNamingMod = await import(pathToFileURL(toolNamingPath).href);
  const autoInjectionPath = resolve(buildDir, "..", "..", "..", "hooks", "auto-injection.mjs");
  const autoInjectionMod = await import(pathToFileURL(autoInjectionPath).href);

  // Pre-build the routing block once per process — it is platform-specific
  // (tool naming differs between opencode and kilo) but does NOT depend on
  // sessionID, so we cache it. createToolNamer accepts both "opencode" and
  // "kilo" per hooks/core/tool-naming.mjs:25-26.
  const toolNamer = toolNamingMod.createToolNamer(platform);
  const routingBlock: string = routingBlockMod.createRoutingBlock(toolNamer);

  // Initialize per-process state. We do NOT fabricate a sessionId here —
  // OpenCode/Kilo provide the real `input.sessionID` on every hook, and a
  // process-global UUID would (a) never match prior-session resume rows and
  // (b) collide across multi-session reuse (Mickey / PR #376 root cause).
  const projectDir = directory || process.cwd();
  // C2 narrowing: resolve DB path through the canonical helper directly.
  // BaseAdapter no longer exposes getSessionDBPath; the adapter only owns
  // the sessions DIR (per-platform), the helper owns the per-project FILE
  // (case-fold + worktree-suffix + one-shot legacy migration).
  const db = new SessionDB({
    dbPath: resolveSessionDbPath({ projectDir, sessionsDir: adapter.getSessionDir() }),
  });

  // Clean up old sessions on startup (no SessionStart hook to do this).
  db.cleanupOldSessions(7);

  return { platform, adapter, routing, autoInjectionMod, toolNamer, routingBlock, projectDir, db };
}

/**
 * OC-4 (#487 follow-up): per-session capture gate. PR #487 trusted the host
 * to deliver AGENTS.md events, but OpenCode only fires `rule_content` events
 * when the user explicitly reads the file. snapshot.ts:172 + analytics.ts:152
 * CONSUME `rule_content` to render rules into the resume snapshot — without
 * this capture path, AGENTS.md is silently absent from continuity output.
 * Keyed by sessionId (NOT projectDir) so multi-session reuse within a long-
 * lived plugin process still gets per-session capture exactly once.
 *
 * Read AGENTS.md (with CLAUDE.md / CONTEXT.md fallbacks) from the project
 * directory and persist as `rule` + `rule_content` events. Mirrors the CC
 * SessionStart pattern at hooks/sessionstart.mjs:121-132 and the OpenCode
 * instruction.ts FILES order. Idempotent via the returned closure's Set,
 * keyed by sessionId. Fail-soft: missing/unreadable files do not throw.
 */
function makeAgentsMdCapture(projectDir: string, db: SessionDB): (sessionId: string) => void {
  const agentsMdCaptured = new Set<string>();
  return function captureAgentsMd(sessionId: string): void {
    if (agentsMdCaptured.has(sessionId)) return;
    agentsMdCaptured.add(sessionId);
    const candidates = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];
    for (const name of candidates) {
      try {
        const p = join(projectDir, name);
        if (!existsSync(p)) continue;
        const content = readFileSync(p, "utf-8");
        if (!content.trim()) continue;
        db.insertEvent(sessionId, {
          type: "rule",
          category: "rule",
          data: p,
          priority: 1,
        } as SessionEvent, "PluginInit");
        db.insertEvent(sessionId, {
          type: "rule_content",
          category: "rule",
          data: content,
          priority: 1,
        } as SessionEvent, "PluginInit");
      } catch {
        // file missing or unreadable — skip silently
      }
    }
  };
}

/**
 * Import the registered ctx_* tool registry without starting its stdio MCP
 * transport. Shared by the V1 native-tool bridge (#574) and the V2
 * `ctx.tool.transform` registration below.
 */
async function loadCtxToolRegistry(): Promise<typeof import("../../server.js")> {
  const prevEmbedded = process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
  process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = "1";
  try {
    return await import("../../server.js");
  } finally {
    if (prevEmbedded === undefined) delete process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
    else process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = prevEmbedded;
  }
}

/** Extract a registered tool's Zod v3 shape (map of field name → Zod schema). */
function extractToolShape(config: Record<string, unknown>): Record<string, unknown> {
  const inputSchema = config.inputSchema as
    | { shape?: unknown; _def?: { shape?: unknown } }
    | undefined;
  if (typeof inputSchema?.shape === "object" && inputSchema.shape !== null) {
    return inputSchema.shape as Record<string, unknown>;
  }
  if (typeof inputSchema?._def?.shape === "function") {
    return (inputSchema._def.shape as () => unknown)() as Record<string, unknown>;
  }
  return {};
}

// ── Plugin Factory (V1 — OpenCode 1.x / KiloCode) ────────────

/**
 * Plugin factory. Called once when KiloCode/OpenCode loads the plugin.
 * Returns an object mapping hook event names to async handler functions.
 *
 * KiloCode expects: export default { id: string, server: (input) => Promise<Hooks> }
 * OpenCode expects: export const ContextModePlugin = (ctx) => Promise<Hooks>
 */
async function createContextModePlugin(ctx: PluginContext) {
  const projectDir = ctx?.directory ?? process.cwd();
  const { platform, routing, autoInjectionMod, routingBlock, db } =
    await createContextModeRuntime(projectDir);

  const captureAgentsMd = makeAgentsMdCapture(projectDir, db);

  function logger(
    message = "context-mode debug log",
    extra?: PluginClientAppLogBodyExtra,
  ): Promise<void> {
    return ctx.client.app.log({
      body: {
        service: "context-mode-logger",
        level: "info",
        message,
        extra,
      },
    });
  }

  /**
   * Drop-in wrapper for `logger` that NEVER rejects (#448).
   *
   * The OPENCODE_DEBUG branch awaits `logger(...)` from inside the chat-turn
   * hot path (chat.system.transform). If `ctx.client.app.log` rejects —
   * transport error, closed stream, oversized payload — the promise rejection
   * propagates back to OpenCode core and can break the turn. Debug logging
   * is best-effort; swallow errors silently and let the turn proceed.
   */
  async function safeLog(
    message?: string,
    extra?: PluginClientAppLogBodyExtra,
  ): Promise<void> {
    try {
      await logger(message, extra);
    } catch {
      // Never break the turn on debug-log failure.
    }
  }

  async function buildNativeTools(): Promise<Record<string, NativeToolDefinition>> {
    // Import the existing MCP server registry without starting its stdio
    // transport. This is the plugin-only bridge for #574: OpenCode/Kilo
    // call ctx_* tools in-process through Hooks.tool instead of spawning
    // a separate MCP child per session.
    const mod = await loadCtxToolRegistry();
    const tools: Record<string, NativeToolDefinition> = {};

    for (const registered of mod.REGISTERED_CTX_TOOLS) {
      const config = registered.config as Record<string, unknown>;
      // Zod schema object that the MCP framework normally calls
      // safeParseAsync() on before invoking the handler. The native
      // OpenCode plugin path bypasses MCP's transport layer entirely
      // (refs/platforms/opencode/packages/opencode/src/tool/registry.ts:127),
      // so we must parse args here too — otherwise z.preprocess() coercions
      // (coerceCommandsArray / coerceJsonArray in server.ts) and defaults
      // never fire. Fixes #621.
      const inputSchema = config.inputSchema as
        | { parse?: (input: unknown) => unknown }
        | undefined;
      const shape = extractToolShape(config);

      // Both KiloCode and recent OpenCode bundle Zod v4 in-host; v3 schemas
      // crash with `n._zod.def` undefined. Gate widened from kilo-only (#632)
      // because every consumer of this file is an OpenCode-family host.
      const argsForHost = zod3ShapeToV4(shape as Record<string, unknown>);

      tools[registered.name] = {
        description: String(config.description ?? ""),
        args: argsForHost,
        async execute(args: Record<string, unknown>, toolCtx: NativeToolContext) {
          toolCtx.metadata?.({ title: String(config.title ?? registered.name) });
          const project = toolCtx.directory || projectDir;

          // Run the registered Zod schema BEFORE the handler — same contract
          // as the MCP SDK (server/mcp.js safeParseAsync at line 174). This
          // applies z.preprocess() coercions, populates .default() values,
          // and produces the validation error the handler expects (#621).
          let parsedArgs: Record<string, unknown> = args ?? {};
          if (typeof inputSchema?.parse === "function") {
            try {
              parsedArgs = inputSchema.parse(args ?? {}) as Record<string, unknown>;
            } catch (err) {
              // Surface validation failures with a clear, actionable message
              // (mirrors MCP SDK error format) instead of a downstream
              // "x.map is not a function" crash.
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(
                `Invalid arguments for ${registered.name}: ${message}`,
              );
            }
          }

          const result = await withPinnedPlatform(platform, () =>
            mod.withProjectDirOverride({ projectDir: project, sessionId: toolCtx.sessionID }, async () =>
              registered.handler(parsedArgs),
            ),
          );

          const r = result as {
            content?: Array<{ type?: string; text?: string }>;
            isError?: boolean;
          };
          const text = Array.isArray(r?.content)
            ? r.content
                .filter((c) => c?.type === "text" && typeof c.text === "string")
                .map((c) => c.text)
                .join("\n")
            : typeof result === "string"
              ? result
              : JSON.stringify(result ?? "");

          if (r?.isError) throw new Error(text || `${registered.name} returned an error`);
          return { title: String(config.title ?? registered.name), output: text };
        },
      };
    }

    return tools;
  }

  const nativeTools = await buildNativeTools();

  return {
    tool: nativeTools,

    // ── PreToolUse: Routing enforcement ─────────────────

    "tool.execute.before": async (input: BeforeHookInput, output: BeforeHookOutput) => {
      const toolName = input.tool ?? "";
      const toolInput = output.args ?? {};

      let decision;
      try {
        decision = routing.routePreToolUse(toolName, toolInput, projectDir, platform);
      } catch {
        return; // Routing failure → allow passthrough
      }

      if (!decision) return; // No routing match → passthrough

      if (decision.action === "deny" || decision.action === "ask") {
        // Throw to block — OpenCode catches this and denies the tool call
        throw new Error(decision.reason ?? "Blocked by context-mode");
      }

      if (decision.action === "modify" && decision.updatedInput) {
        // Mutate output.args — OpenCode reads the mutated output object
        Object.assign(output.args, decision.updatedInput);
      }

      if (decision.action === "context" && decision.additionalContext) {
        // Mutate output.args — OpenCode reads the mutated output object
        output.args.additionalContext = decision.additionalContext;
      }
    },

    // ── PostToolUse: Session event capture ──────────────

    "tool.execute.after": async (input: AfterHookInput, output: AfterHookOutput) => {
      const sessionId = input.sessionID;
      if (!sessionId) return;
      try {
        db.ensureSession(sessionId, projectDir);
        // OC-4 (#487 follow-up): AGENTS.md → rule_content capture for snapshot
        // and auto-memory parity. Idempotent per-session via Set guard.
        captureAgentsMd(sessionId);

        const hookInput: HookInput = {
          tool_name: input.tool ?? "",
          tool_input: input.args ?? {},
          tool_response: output.output,
          tool_output: undefined, // OpenCode doesn't provide isError
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

    // ── event: per-turn token + cost capture (paid-observability) ───
    // The generic bus `event` hook (refs/platforms/opencode/packages/plugin/
    // src/index.ts:224) delivers every Event; we filter `message.updated`
    // (published on each assistant-message update incl. step-finish —
    // session.ts:673) and read tokens/cost/modelID off properties.info
    // (assistant filter via role; refs stream.transport.ts:214-216).
    //
    // CAVEAT (refs processor.ts:717-718): message-level `.tokens` is the LAST
    // step's snapshot (overwritten per step-finish), while `.cost` is
    // cumulative for the turn. parseOpencodeUsage passes `.cost` through as
    // native_cost_usd so the billed $ stays exact despite the token snapshot
    // being last-step only. `message.updated` fires multiple times per turn;
    // because tokens are a terminal snapshot and cost is cumulative, the last
    // event for a message carries the final figures — re-emitting on each
    // update is idempotent at the cost column and merely refreshes the
    // last-step token telemetry. db.insertEvent both persists locally AND
    // forwards to the platform (the TS-plugin equivalent of the .mjs
    // attributeAndInsertEvents path).
    event: async (input: EventHookInput) => {
      try {
        const ev = input?.event;
        if (!ev || ev.type !== "message.updated") return;
        const sessionId = ev.properties?.info?.sessionID;
        if (!sessionId || typeof sessionId !== "string") return;

        const counts = parseOpencodeUsage(ev);
        if (!counts) return;
        const usageEvent = buildAgentUsageEvent(counts);
        if (!usageEvent) return;

        db.ensureSession(sessionId, projectDir);
        db.insertEvent(sessionId, usageEvent, "MessageUpdated");
      } catch {
        // Silent — usage capture must never break the session.
      }
    },

    // ── chat.message: User-prompt capture (OC-2 / Z2) ───
    // SDK signature verified at refs/platforms/opencode/packages/plugin/src/
    // index.ts:233. Orchestrator reference at refs/plugin-examples/opencode/
    // opencode-orchestrator/src/plugin-handlers/chat-message-handler.ts:41-65.
    // CCv2 inline filter: skip synthetic harness messages (system reminders,
    // tool results, etc.) so we don't pollute the user-prompt event stream.
    "chat.message": async (input: ChatMessageHookInput, output: ChatMessageHookOutput) => {
      const sessionId = input?.sessionID;
      if (!sessionId) return;
      try {
        const parts = Array.isArray(output?.parts) ? output.parts : [];
        const textPart = parts.find((p) => p && p.type === "text" && typeof p.text === "string" && p.text.length > 0);
        if (!textPart || !textPart.text) return;
        const message = textPart.text;
        if (isSyntheticMessage(message)) return;

        db.ensureSession(sessionId, projectDir);
        // OC-4 (#487 follow-up): also capture on chat.message so sessions that
        // never invoke a tool still seed rule_content events for continuity.
        captureAgentsMd(sessionId);

        // 1. Always save the raw prompt
        db.insertEvent(sessionId, {
          type: "user_prompt",
          category: "user-prompt",
          data: message,
          priority: 1,
        } as SessionEvent, "UserPromptSubmit");

        // 2. Extract role/decision/intent/skill events from the prompt body
        const userEvents = extractUserEvents(message);
        for (const ev of userEvents) {
          db.insertEvent(sessionId, ev as SessionEvent, "UserPromptSubmit");
        }
      } catch {
        // Silent — chat.message must never break the turn
      }
    },

    // ── PreCompact: Snapshot generation ─────────────────

    "experimental.session.compacting": async (input: CompactingHookInput, output: CompactingHookOutput) => {
      const sessionId = input.sessionID;
      if (!sessionId) return "";
      try {
        db.ensureSession(sessionId, projectDir);
        const events = db.getEvents(sessionId);
        if (events.length === 0) return "";

        const stats = db.getSessionStats(sessionId);
        const snapshot = buildResumeSnapshot(events, {
          compactCount: (stats?.compact_count ?? 0) + 1,
        });

        db.upsertResume(sessionId, snapshot, events.length);
        db.incrementCompactCount(sessionId);

        // Mutate output.context to inject the snapshot
        output.context.push(snapshot);

        if (process.env.OPENCODE_DEBUG) {
          await safeLog(snapshot, {
            sessionId,
            source: "on compaction - snapshot",
          });
        }

        // OC-3 / Z3: Add budget-capped auto-injection (P1 role / P2 rules /
        // P3 skills / P4 intent — ≤500 tokens / ~2000 chars per
        // hooks/auto-injection.mjs). Pushed as a separate context entry so
        // OpenCode can fold it independently from the verbose snapshot.
        try {
          const autoBlock: string = autoInjectionMod.buildAutoInjection(events);
          if (autoBlock && autoBlock.length > 0) {
            output.context.push(autoBlock);
          }

          if (process.env.OPENCODE_DEBUG) {
            await safeLog(autoBlock, {
              sessionId,
              source: "on compaction - autoBlock",
            });
          }
        } catch {
          // Auto-injection failure must NOT break the snapshot path.
        }

        return snapshot;
      } catch {
        return "";
      }
    },

    // ── SessionStart equivalent (PR #376) ───────────────
    // OpenCode lacks a real SessionStart hook (#14808, #5409). The closest
    // surrogate is `experimental.chat.system.transform` — verified shape:
    //   input:  { sessionID?: string; model: Model }
    //   output: { system: string[] }
    // We claim the most-recent unconsumed resume snapshot atomically (race-
    // safe across concurrent processes) and prepend it to the system prompt.
    "experimental.chat.system.transform": async (
      input: SystemTransformHookInput,
      output: SystemTransformHookOutput,
    ) => {
      const sessionId = input?.sessionID;
      if (!sessionId) return;

      // ── OC-1 / CCv1: ROUTING_BLOCK injection ──────────────
      // Inject the <context_window_protection> XML block on the first
      // chat.system.transform per session. This is INDEPENDENT of the
      // resume snapshot path below — routing block must fire even when
      // no prior session row exists. Splice at index 1 (NOT unshift) for
      // the same OpenCode llm.ts:117-128 cache-fold reason as resume.
      //
      // Skip injection when system prompt already contains context-mode
      // routing rules (e.g. via AGENTS.md / CLAUDE.md loaded by the host).
      // Detect by checking for a quorum of distinctive tool names — any two
      // of ctx_execute, ctx_batch_execute, ctx_fetch_and_index confirms the
      // instructions are present and avoids ~2K chars of duplication.
      if (Array.isArray(output?.system)) {
        if (!systemHasRoutingInstructions(output.system)) {
          try {
            output.system.splice(1, 0, routingBlock);
          } catch {
            // Never break the chat turn on routing-block injection failure.
          }

          if (process.env.OPENCODE_DEBUG) {
            await safeLog(output.system[1], {sessionId, source: 'on routing block injection'});
          }
        } else if (process.env.OPENCODE_DEBUG) {
          await safeLog(`routing block skipped — system prompt already contains context-mode instructions`, {sessionId, source: 'on routing block injection'});
        }
      }

      try {
        // Pass current sessionId so SQL excludes self-injection (v1.0.106 — Mickey #376
        // follow-up): if Session B compacts mid-flight and produces its own row,
        // B's next system.transform must NOT claim that row back into B's prompt.
        const row = db.claimLatestUnconsumedResume(sessionId);
        if (!row || !row.snapshot) return;        // no row → retry on next turn

        if (process.env.OPENCODE_DEBUG) {
          await safeLog(row.snapshot, {
            sessionId,
            source: "on resume - snapshot",
          });
        }

        if (Array.isArray(output?.system)) {
          // Insert at index 1 (after the header) — NOT unshift.
          // OpenCode's llm.ts:117-128 saves `header = system[0]` BEFORE this
          // hook runs and then folds the rest into a 2-part structure
          // `[header, body]` only if `system[0] === header` after the hook.
          // Prepending via unshift replaces system[0] with the snapshot,
          // making the equality check fail → cache-fold is skipped → every
          // system block is sent as a separate `role: "system"` message →
          // provider prompt cache is invalidated on every resume injection.
          // Inserting at index 1 keeps the header invariant and lets the
          // snapshot ride along inside the cached body block.
          output.system.splice(1, 0, row.snapshot);
          // Mark consumed only AFTER successful splice so failed paths can retry
          if (process.env.OPENCODE_DEBUG) {
            await safeLog(output.system[1], { sessionId, source: "on resume" });
          }
        }
      } catch {
        // Silent — never break the chat turn
      }
    },
  };
}

// ── Plugin Factory (V2 — OpenCode 2) ─────────────────────────
//
// OpenCode 2's plugin loader ignores the `server()` shape above entirely
// (opencode.ai/v2/docs/migrate-v1: "V1 plugin implementations do not run in
// V2"). Verified empirically against opencode@2.0.3: a `{ id, server }`
// default export is silently skipped by both `opencode plugin list` and a
// live session (no load attempt logged at any --log-level), while a
// `Plugin.define({ id, setup })` export from `@opencode/plugin` loads and
// runs its setup() correctly. This mirrors the hook-for-hook mapping in
// OpenCode's own migration guide (opencode.ai/v2/docs/build/plugins/migrate-v1):
//
//   V1 hook                              V2 API
//   tool.execute.before                  ctx.tool.hook("execute.before", ...)
//   tool.execute.after                   ctx.tool.hook("execute.after", ...)
//   event (message.updated)              ctx.event.subscribe()
//   chat.message                         ctx.session.hook("prompt", ...)
//   experimental.session.compacting      ctx.session.hook("compaction", ...)
//   experimental.chat.system.transform   ctx.session.hook("context", ...)
//   tool map                             ctx.tool.transform(editor => editor.add(...))
//
// V2's session-request hooks ("context" and "compaction") share one
// `system: SystemPart[]` field for model-visible context — there is no
// separate `context: string[]` array like V1's compacting hook had, so both
// the resume snapshot and the auto-injection block are pushed onto
// `event.system` as `{ type: "text", text }` parts in both hooks.
//
// Confidence note for reviewers: the config/dual-export mechanics and the
// hook-name mapping above come directly from OpenCode's published migration
// guide and were confirmed against a real opencode@2.0.3 install (plugin
// loads, setup() runs, config keys parsed). The exact field names on
// `ToolExecuteBefore`/`ToolExecuteCompleted`/`ToolExecuteFailed` (assumed:
// `tool`, `input`, `status`, `result`, `error`, and — by analogy with every
// other hook interface OpenCode documents — `sessionID`) are not spelled out
// in the public docs beyond the short examples reproduced above, so the
// session-attribution path in `tool.execute.after` should be exercised
// against a live OpenCode 2 agent turn before release.

/**
 * Register context-mode's ctx_* tools through the V2 tool-transform API.
 *
 * Two V2-specific details, both observed on OpenCode 2.0.7:
 * - Tools added via `editor.add` default to `codemode: true`, which hides them
 *   from the model's direct tool list: they are only reachable by writing code
 *   against the `execute` tool's catalog. Routing enforcement tells the model
 *   to *call* these tools directly, so they are registered with
 *   `codemode: false`.
 * - Their model-visible names must equal `toolNamer(name)` — the names the
 *   routing block and the `execute.before` redirect messages use — so the
 *   guidance the model receives always names a tool that exists. OpenCode 2
 *   composes the visible name as `<namespace>_<name>`, so a namer of the form
 *   `<prefix>_<tool>` maps onto its native `namespace` option (see
 *   `v2ToolIdentity`); any other namer shape is used verbatim as the name.
 */
/**
 * Split a routed tool name into OpenCode 2's `{ name, namespace }` so the
 * host-composed `<namespace>_<name>` equals exactly what the router tells the
 * model to call. Exported for tests.
 */
export function v2ToolIdentity(
  bareTool: string,
  toolNamer: (bareTool: string) => string,
): { name: string; namespace?: string } {
  const routed = toolNamer(bareTool);
  const suffix = `_${bareTool}`;
  if (routed.endsWith(suffix)) {
    const namespace = routed.slice(0, -suffix.length);
    // Only a clean `<prefix>_<tool>` shape; anything else (e.g. `mcp__x__tool`)
    // is registered verbatim so the host never sees an odd namespace.
    if (namespace && !namespace.endsWith("_")) return { name: bareTool, namespace };
  }
  return { name: routed };
}

/**
 * Pin platform detection for in-plugin tool execution (jfayad, #1171).
 *
 * Inside an OpenCode/KiloCode plugin host process none of the `OPENCODE_*` /
 * `KILO_*` env markers are guaranteed to be set, so `detectPlatform()` falls
 * through to config-dir fallbacks (`~/.claude`, `~/.gemini`, …) and tools like
 * `ctx_doctor` misreport the platform. The plugin already knows its platform
 * (see `getPlatform()` / `createContextModeRuntime`), so pin it via the
 * `CONTEXT_MODE_PLATFORM` override that `detectPlatform()` honors — scoped to
 * the handler call only.
 *
 * An explicit user-set `CONTEXT_MODE_PLATFORM` wins and is left untouched.
 * Note: the pin is process-global env, so genuinely concurrent tool executions
 * share it — same trade-off as the existing `CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS`
 * scoping in `loadCtxToolRegistry()`. In practice the value pinned here is
 * always this host's own platform, so interleaving is harmless.
 */
export async function withPinnedPlatform<T>(platform: string, fn: () => Promise<T>): Promise<T> {
  const key = "CONTEXT_MODE_PLATFORM";
  const prev = process.env[key];
  const owned = prev === undefined || prev === "";
  if (owned) process.env[key] = platform;
  try {
    return await fn();
  } finally {
    if (owned) delete process.env[key];
  }
}

async function registerNativeToolsV2(
  ctx: any,
  projectDir: string,
  toolNamer: (bareTool: string) => string,
  platform: string,
): Promise<{ dispose: () => Promise<void> }> {
  const mod = await loadCtxToolRegistry();
  const zod4 = await import("zod/v4");

  return ctx.tool.transform((editor: any) => {
    for (const registered of mod.REGISTERED_CTX_TOOLS) {
      const config = registered.config as Record<string, unknown>;
      const inputSchema = config.inputSchema as
        | { parse?: (input: unknown) => unknown }
        | undefined;
      const shape = extractToolShape(config);
      // V2 tools declare JSON Schema, not a Zod shape — reuse the existing
      // Zod v3→v4 shape conversion (already required for the V1 native-tool
      // bridge, #574) and let Zod v4's own toJSONSchema() do the rest.
      const v4Shape = zod3ShapeToV4(shape) as Record<string, InstanceType<typeof zod4.ZodType>>;
      const jsonSchema = zod4.toJSONSchema(zod4.object(v4Shape));

      const identity = v2ToolIdentity(registered.name, toolNamer);
      editor.add({
        name: identity.name,
        description: String(config.description ?? ""),
        input: jsonSchema,
        options: identity.namespace
          ? { namespace: identity.namespace, codemode: false }
          : { codemode: false },
        async execute(input: Record<string, unknown>) {
          let parsedArgs: Record<string, unknown> = input ?? {};
          if (typeof inputSchema?.parse === "function") {
            try {
              parsedArgs = inputSchema.parse(input ?? {}) as Record<string, unknown>;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(`Invalid arguments for ${registered.name}: ${message}`);
            }
          }

          const result = await withPinnedPlatform(platform, () =>
            mod.withProjectDirOverride({ projectDir }, async () =>
              registered.handler(parsedArgs),
            ),
          );

          const r = result as {
            content?: Array<{ type?: string; text?: string }>;
            isError?: boolean;
          };
          const text = Array.isArray(r?.content)
            ? r.content
                .filter((c) => c?.type === "text" && typeof c.text === "string")
                .map((c) => c.text)
                .join("\n")
            : typeof result === "string"
              ? result
              : JSON.stringify(result ?? "");

          if (r?.isError) throw new Error(text || `${registered.name} returned an error`);
          return { content: text };
        },
      });
    }
  });
}

/**
 * Mark this process as a ready context-mode tool provider.
 *
 * Routing (hooks/core/routing.mjs) redirects curl/wget and large-output
 * commands only when `isMCPReady()` finds a live readiness sentinel. The
 * stdio MCP server writes one from its main(); with native V2 tools there is
 * no MCP server, so without this the redirects silently depend on some
 * unrelated context-mode MCP process (another client's) being alive. Mirrors
 * the server's sentinel: this process's PID, refreshed every 30s (the reader's
 * freshness window is 90s), removed on dispose.
 */
async function startReadinessSentinel(): Promise<() => void> {
  const buildDir = dirname(fileURLToPath(import.meta.url));
  const mcpReadyPath = resolve(buildDir, "..", "..", "..", "hooks", "core", "mcp-ready.mjs");
  const { sentinelPathForPid } = await import(pathToFileURL(mcpReadyPath).href);
  const sentinel: string = sentinelPathForPid(process.pid);
  const write = () => {
    try { writeFileSync(sentinel, String(process.pid)); } catch { /* best effort */ }
  };
  write();
  const refresh = setInterval(write, 30_000);
  refresh.unref();
  return () => {
    clearInterval(refresh);
    try { unlinkSync(sentinel); } catch { /* best effort */ }
  };
}

/** V2 `Plugin.define({ id, setup })` body. `ctx` is the OpenCode 2 plugin context. */
async function setupContextModePluginV2(ctx: any): Promise<() => void> {
  const directory = ctx?.location?.directory ?? process.cwd();
  const { platform, routing, autoInjectionMod, toolNamer, routingBlock, projectDir, db } =
    await createContextModeRuntime(directory);

  const captureAgentsMd = makeAgentsMdCapture(projectDir, db);

  // Every hook/transform registration returns a `{ dispose }` Registration
  // per the SDK (verified against @opencode/plugin@2.0.16 types) — collect
  // them so setup failure AND plugin cleanup release what was acquired
  // instead of leaking stale hooks into the host. Fake hosts in tests may
  // return undefined; only real registrations are tracked.
  const disposers: Array<() => Promise<void>> = [];
  const track = (reg: unknown): void => {
    const dispose = (reg as { dispose?: unknown })?.dispose;
    if (typeof dispose === "function") disposers.push(dispose as () => Promise<void>);
  };
  const teardownRegistrations = async (): Promise<void> => {
    for (const dispose of disposers.splice(0)) {
      try {
        await dispose();
      } catch {
        // Best-effort teardown — never break cleanup.
      }
    }
  };

  const usageController = new AbortController();

  track(await registerNativeToolsV2(ctx, projectDir, toolNamer, platform));
  const stopReadinessSentinel = await startReadinessSentinel();
  try {
  // ── tool.execute.before → routing enforcement ──────────
  track(await ctx.tool.hook("execute.before", (event: any) => {
    const toolName = event?.tool ?? "";
    const toolInput = event?.input ?? {};

    let decision;
    try {
      decision = routing.routePreToolUse(toolName, toolInput, projectDir, platform);
    } catch {
      return;
    }
    if (!decision) return;

    if (decision.action === "deny" || decision.action === "ask") {
      throw new Error(decision.reason ?? "Blocked by context-mode");
    }
    if (decision.action === "modify" && decision.updatedInput && event?.input) {
      Object.assign(event.input, decision.updatedInput);
    }
    if (decision.action === "context" && decision.additionalContext && event?.input) {
      event.input.additionalContext = decision.additionalContext;
    }
  }));

  // ── tool.execute.after → session event capture ─────────
  track(await ctx.tool.hook("execute.after", async (event: any) => {
    const sessionId = event?.sessionID;
    if (!sessionId) return;
    try {
      db.ensureSession(sessionId, projectDir);
      captureAgentsMd(sessionId);

      const output =
        event.status === "error"
          ? String(event.error?.message ?? "")
          : typeof event.result === "string"
            ? event.result
            : Array.isArray(event.result?.content)
              ? event.result.content
                  .filter((c: any) => c?.type === "text" && typeof c.text === "string")
                  .map((c: any) => c.text)
                  .join("\n")
              : JSON.stringify(event.result ?? "");

      const hookInput: HookInput = {
        tool_name: event.tool ?? "",
        tool_input: event.input ?? {},
        tool_response: output,
        tool_output: undefined,
      };
      const events = extractEvents(hookInput);
      for (const ev of events) {
        db.insertEvent(sessionId, ev as SessionEvent, "PostToolUse");
      }
    } catch {
      // Silent — session capture must never break the tool call
    }
  }));

  // ── ctx.event.subscribe → per-step / per-turn token + cost capture ─
  // v2 bus correlation: the model is observed on `session.step.started`
  // keyed by `assistantMessageID`, and the matching `session.step.ended`
  // (which omits the model) is attributed via that key — shapes verified
  // against the published @opencode/plugin@2.0.16 + @opencode/schema@2.0.16
  // types. The legacy `message.updated` path is kept as a fallback, but note
  // it is absent from the v2 bus schema, so on OpenCode 2 the step
  // correlation is the live path.
  const modelByMessage = new Map<string, string>();
  void (async () => {
    try {
      for await (const busEvent of ctx.event.subscribe({ signal: usageController.signal }) as AsyncIterable<any>) {
        try {
          if (!busEvent || typeof busEvent.type !== "string") continue;

          if (busEvent.type === "session.step.started") {
            const data = busEvent.data as
              | { assistantMessageID?: unknown; model?: { id?: unknown; providerID?: unknown } }
              | undefined;
            const msgId = data?.assistantMessageID;
            const model = data?.model;
            if (typeof msgId === "string" && model) {
              const id = typeof model.id === "string" ? model.id : "";
              const providerID = typeof model.providerID === "string" ? model.providerID : "";
              modelByMessage.set(msgId, providerID && id ? `${providerID}/${id}` : id || providerID);
            }
            continue;
          }

          if (busEvent.type === "session.step.ended") {
            const data = busEvent.data as
              | { sessionID?: unknown; assistantMessageID?: unknown }
              | undefined;
            const sessionId = data?.sessionID;
            if (!sessionId || typeof sessionId !== "string") continue;
            const msgId = typeof data?.assistantMessageID === "string" ? data.assistantMessageID : "";
            const counts = parseOpencodeV2StepUsage(data, modelByMessage.get(msgId) ?? "");
            if (msgId) modelByMessage.delete(msgId);
            if (!counts) continue;
            const usageEvent = buildAgentUsageEvent(counts);
            if (!usageEvent) continue;

            db.ensureSession(sessionId, projectDir);
            db.insertEvent(sessionId, usageEvent, "StepEnded");
            continue;
          }

          if (busEvent.type !== "message.updated") continue;
          const sessionId = busEvent.properties?.info?.sessionID;
          if (!sessionId || typeof sessionId !== "string") continue;

          const counts = parseOpencodeUsage(busEvent);
          if (!counts) continue;
          const usageEvent = buildAgentUsageEvent(counts);
          if (!usageEvent) continue;

          db.ensureSession(sessionId, projectDir);
          db.insertEvent(sessionId, usageEvent, "MessageUpdated");
        } catch {
          // Silent — usage capture must never break the session.
        }
      }
    } catch {
      // Stream aborted on cleanup, or the connection dropped — nothing to do.
    }
  })();

  // ── chat.message → session "prompt" hook ────────────────
  track(await ctx.session.hook("prompt", (event: any) => {
    const sessionId = event?.sessionID;
    if (!sessionId) return;
    try {
      const message = event?.prompt?.text;
      if (!message) return;
      if (isSyntheticMessage(message)) return;

      db.ensureSession(sessionId, projectDir);
      captureAgentsMd(sessionId);

      db.insertEvent(sessionId, {
        type: "user_prompt",
        category: "user-prompt",
        data: message,
        priority: 1,
      } as SessionEvent, "UserPromptSubmit");

      const userEvents = extractUserEvents(message);
      for (const ev of userEvents) {
        db.insertEvent(sessionId, ev as SessionEvent, "UserPromptSubmit");
      }
    } catch {
      // Silent — prompt admission must never fail because of capture
    }
  }));

  // ── experimental.session.compacting → session "compaction" hook ─
  track(await ctx.session.hook("compaction", async (event: any) => {
    const sessionId = event?.sessionID;
    if (!sessionId || !Array.isArray(event?.system)) return;
    try {
      db.ensureSession(sessionId, projectDir);
      const dbEvents = db.getEvents(sessionId);
      if (dbEvents.length === 0) return;

      const stats = db.getSessionStats(sessionId);
      const snapshot = buildResumeSnapshot(dbEvents, {
        compactCount: (stats?.compact_count ?? 0) + 1,
      });

      db.upsertResume(sessionId, snapshot, dbEvents.length);
      db.incrementCompactCount(sessionId);

      event.system.push({ type: "text", text: snapshot });

      try {
        const autoBlock: string = autoInjectionMod.buildAutoInjection(dbEvents);
        if (autoBlock && autoBlock.length > 0) {
          event.system.push({ type: "text", text: autoBlock });
        }
      } catch {
        // Auto-injection failure must NOT break the snapshot path.
      }
    } catch {
      // Silent — never break compaction
    }
  }));

  // ── experimental.chat.system.transform → session "context" hook ─
  track(await ctx.session.hook("context", (event: any) => {
    const sessionId = event?.sessionID;
    if (!sessionId || !Array.isArray(event?.system)) return;

    const asText = (part: unknown): string =>
      typeof part === "string" ? part : (part as { text?: string })?.text ?? "";

    try {
      const systemTexts = event.system.map(asText).filter(Boolean);
      if (!systemHasRoutingInstructions(systemTexts)) {
        event.system.splice(1, 0, { type: "text", text: routingBlock });
      }
    } catch {
      // Never break the chat turn on routing-block injection failure.
    }

    try {
      const row = db.claimLatestUnconsumedResume(sessionId);
      if (!row || !row.snapshot) return;
      event.system.splice(1, 0, { type: "text", text: row.snapshot });
    } catch {
      // Silent — never break the chat turn
    }
  }));
  } catch (err) {
    // A failed registration must not leave the earlier hooks behind.
    usageController.abort();
    stopReadinessSentinel();
    await teardownRegistrations();
    throw err;
  }

  return async () => {
    usageController.abort();
    stopReadinessSentinel();
    await teardownRegistrations();
  };
}

// ── Exports ──────────────────────────────────────────────
// KiloCode PluginModule: default export with { server } shape
// OpenCode compat: named export for direct import("context-mode/plugin")
//
// OpenCode 2 support (V1/V2 dual export, per opencode.ai/v2/docs/build/
// plugins#support-v1): spread the V2 shape into the default export alongside
// `server`. OpenCode 1.x/KiloCode call server() and ignore `id`/`setup`;
// OpenCode 2 reads `id`/`setup` and ignores `server`. This is built without
// importing `@opencode/plugin` — `Plugin.define()` in that package is just
// `(plugin) => plugin` (the identity function), so calling it added no
// behavior, only a dependency that isn't guaranteed to resolve on every host
// (#1171: `opencode plugin add` installs don't always run full dependency
// resolution, so the dynamic import used to fail and silently drop `setup`,
// which made OpenCode 2 reject the whole plugin).
const v2PluginShape = { id: "context-mode" as const, setup: setupContextModePluginV2 };

export default { ...v2PluginShape, server: createContextModePlugin };
export { createContextModePlugin as ContextModePlugin };
// Test surface — exported for unit testing the quorum substring fix (#487).
export { systemHasRoutingInstructions, ROUTING_MARKERS };
