/**
 * OpenCode / KiloCode TypeScript plugin entry point for context-mode.
 *
 * Supports BOTH plugin API generations from one default export:
 *   - OpenCode 1.x / KiloCode call `server(ctx)` and read a v1 hook map.
 *   - OpenCode 2.x calls `setup(ctx)` and registers on the v2 plugin domains.
 * The official dual-shape contract is `{ ...Plugin.define({id, setup}), server }`;
 * the two APIs are separate and this file adapts between them explicitly.
 *
 * V1 hooks (v1.0.107 — Mickey OC-1..OC-4 follow-up):
 *   - tool.execute.before  — Routing enforcement (deny/modify/passthrough)
 *   - tool.execute.after   — Session event capture + first-fire AGENTS.md scan (OC-4)
 *   - experimental.session.compacting — Compaction snapshot + budget-capped auto-injection (OC-3)
 *   - experimental.chat.system.transform — ROUTING_BLOCK + resume snapshot injection (OC-1)
 *   - chat.message         — User-prompt capture w/ CCv2 inline filter (OC-2) + AGENTS.md scan (OC-4)
 *   - event                — per-turn token + cost capture
 *   - tool                 — the 11 ctx_* tools, in-process (no stdio MCP child)
 *
 * V2 equivalents (see setupContextModeV2):
 *   tool.execute.before   → ctx.tool.hook("execute.before")
 *   tool.execute.after    → ctx.tool.hook("execute.after")
 *   chat.message          → ctx.session.hook("prompt")
 *   …session.compacting   → ctx.session.hook("compaction")
 *   …chat.system.transform→ ctx.session.hook("context")
 *   event                 → ctx.event.subscribe()
 *   tool map              → ctx.tool.transform()
 *
 * Constraints:
 *   - No SessionStart hook (OpenCode doesn't support it — #14808, #5409)
 *   - context injection now via chat.system.transform surrogate (OC-1)
 *   - No routing file auto-write (avoid dirtying project trees)
 *   - Session cleanup happens at plugin init (no SessionStart)
 */

import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

import z from "zod/v4";

import { resolveSessionDbPath, SessionDB } from "../../session/db.js";
import {
  extractEvents,
  extractUserEvents,
  parseOpencodeUsage,
  buildAgentUsageEvent,
} from "../../session/extract.js";
import type { HookInput } from "../../session/extract.js";
import { buildResumeSnapshot } from "../../session/snapshot.js";
import type { SessionEvent } from "../../types.js";
import { AdapterPlatformType, OpenCodeAdapter } from "./index.js";
import { PLATFORM_ENV_VARS } from "../detect.js";
import { zod3ShapeToV4 } from "./zod3tov4.js";

// ── Types ─────────────────────────────────────────────────

/** OpenCode / Kilo plugin input — both platforms pass at least `directory`. */
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

/**
 * OpenCode 2.x plugin context. Only the members this adapter actually touches
 * are declared — the real Context is a superset (see @opencode/plugin).
 */
type V2Context = {
  location: { directory: string };
  session: {
    hook: (name: string, cb: (event: any) => unknown) => Promise<unknown>;
  };
  tool: {
    hook: (name: string, cb: (event: any) => unknown) => Promise<unknown>;
    transform: (cb: (editor: any) => void) => Promise<unknown>;
  };
  event: { subscribe: (opts?: { signal?: AbortSignal }) => AsyncIterable<any> };
};

type NativeToolContext = {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;
  worktree?: string;
  abort?: AbortSignal;
  metadata?: (input: {
    title?: string;
    metadata?: Record<string, unknown>;
  }) => void;
};

type NativeToolDefinition = {
  description: string;
  args: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    ctx: NativeToolContext,
  ) => Promise<
    | string
    | { title?: string; output: string; metadata?: Record<string, unknown> }
  >;
};

/**
 * A registered ctx_* tool, host-agnostic. `run` is the single implementation;
 * the v1 and v2 adapters below only translate its arguments and result shape.
 */
type NativeToolSpec = {
  name: string;
  title: string;
  description: string;
  /** Zod 4 shape — what v1 hosts expect in `args`. */
  zodShape: Record<string, unknown>;
  /** JSON Schema — what v2 hosts expect in `input`. */
  jsonSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, sessionId: string) => Promise<string>;
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
    const re = new RegExp(
      `(?:^|\\W)${m.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\W|$)`,
    );
    return re.test(text);
  };
  return ROUTING_MARKERS.filter(wordBoundary).length >= 2;
}

/**
 * OpenCode 2.x types the system prompt as `SystemPart[]`
 * (`{ type: "text", text, cache? }`), not `string[]`. Every v2 injection goes
 * through here so the shape stays in one place.
 */
function textPart(text: string): { type: "text"; text: string } {
  return { type: "text", text };
}

/**
 * Insert `text` into a system-prompt array at `index`, matching whatever
 * element shape that array already uses.
 *
 * v1 hosts pass `string[]`; v2 hosts pass `SystemPart[]`
 * (`{ type: "text", text }`). Splicing a bare string into a v2 array would
 * produce an element the provider driver cannot read, so the block would
 * silently never reach the model — the exact class of bug that dropped the
 * resume snapshot in PR #376. The element type is read off the array itself
 * rather than hardcoded per entry point, so both generations share one path.
 */
function injectSystemText(
  system: unknown[],
  index: number,
  text: string,
): void {
  if (text.length === 0) return;
  const sample = system.find((p) => p !== undefined && p !== null);
  const wantsParts =
    typeof sample === "object" &&
    typeof (sample as { text?: unknown }).text === "string";
  system.splice(index, 0, wantsParts ? textPart(text) : text);
}

function systemPartTexts(system: unknown): string[] {
  if (!Array.isArray(system)) return [];
  return system
    .map((p) =>
      typeof p === "string"
        ? p
        : p && typeof p === "object" && typeof (p as any).text === "string"
          ? (p as any).text
          : "",
    )
    .filter((t) => t.length > 0);
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

/** Best-effort debug sink. Never rejects — debug logging must not break a turn. */
type LogSink = (
  message?: string,
  extra?: PluginClientAppLogBodyExtra,
) => Promise<void>;

// ── Shared state + handlers ───────────────────────────────

/**
 * Everything both API generations need: adapter, DB, routing modules, tool
 * specs, and the hook bodies. Building this once and adapting it twice keeps
 * v1 and v2 behaviorally identical by construction.
 */
type ContextModeState = {
  projectDir: string;
  db: SessionDB;
  routing: any;
  routingBlock: string;
  platform: AdapterPlatformType;
  toolSpecs: NativeToolSpec[];
  captureAgentsMd: (sessionId: string) => void;
  safeLog: LogSink;
  /** v1-only: the shell tool also reports a `directory` the v2 ToolContext lacks. */
  handlers: {
    before: (input: BeforeHookInput, output: BeforeHookOutput) => Promise<void>;
    after: (input: AfterHookInput, output: AfterHookOutput) => Promise<void>;
    onEvent: (input: EventHookInput) => Promise<void>;
    onPrompt: (
      input: ChatMessageHookInput,
      output: ChatMessageHookOutput,
    ) => Promise<void>;
    onCompaction: (
      input: CompactingHookInput,
      output: CompactingHookOutput,
    ) => Promise<string | void>;
    onContext: (
      input: SystemTransformHookInput,
      output: SystemTransformHookOutput,
      opts?: ContextHookOptions,
    ) => Promise<void>;
  };
};

/**
 * `routingOncePerSession` is a v2-only concern. v1's
 * `experimental.chat.system.transform` fires once per turn and deliberately
 * re-injects the routing block every time for reliability. v2's `context` hook
 * instead fires for EVERY request kind — primary, compaction, title, generate
 * — so re-injecting unconditionally would burn ~2K chars on every title
 * generation. v2 opts in to the per-session guard; v1 keeps its own behavior.
 */
type ContextHookOptions = { routingOncePerSession?: boolean };

async function initState(
  projectDir: string,
  safeLog: LogSink,
): Promise<ContextModeState> {
  // Resolve build dir from compiled JS location
  const platform = getPlatform();
  const adapter = new OpenCodeAdapter(platform);
  const buildDir = dirname(fileURLToPath(import.meta.url));
  // initSecurity() looks for `<dir>/security.js`, which lives at the
  // top of build/ — two levels up from this adapter directory.
  const buildRoot = resolve(buildDir, "..", "..");

  // Load routing module (ESM .mjs, lives outside build/ in hooks/)
  const routingPath = resolve(
    buildDir,
    "..",
    "..",
    "..",
    "hooks",
    "core",
    "routing.mjs",
  );
  const routing = await import(pathToFileURL(routingPath).href);
  await routing.initSecurity(buildRoot);

  // OC-1 / OC-3: Load hook helpers once at plugin init. Dynamic import keeps
  // the .mjs ESM islands isolated from the .ts compile graph.
  const routingBlockPath = resolve(
    buildDir,
    "..",
    "..",
    "..",
    "hooks",
    "routing-block.mjs",
  );
  const routingBlockMod = await import(pathToFileURL(routingBlockPath).href);
  const toolNamingPath = resolve(
    buildDir,
    "..",
    "..",
    "..",
    "hooks",
    "core",
    "tool-naming.mjs",
  );
  const toolNamingMod = await import(pathToFileURL(toolNamingPath).href);
  const autoInjectionPath = resolve(
    buildDir,
    "..",
    "..",
    "..",
    "hooks",
    "auto-injection.mjs",
  );
  const autoInjectionMod = await import(pathToFileURL(autoInjectionPath).href);

  // Pre-build the routing block once per process — it is platform-specific
  // (tool naming differs between opencode and kilo) but does NOT depend on
  // sessionID, so we cache it. createToolNamer accepts both "opencode" and
  // "kilo" per hooks/core/tool-naming.mjs:25-26.
  const toolNamer = toolNamingMod.createToolNamer(platform);
  const routingBlock: string = routingBlockMod.createRoutingBlock(toolNamer);

  // We do NOT fabricate a sessionId here — OpenCode/Kilo provide the real
  // session ID on every hook, and a process-global UUID would (a) never match
  // prior-session resume rows and (b) collide across multi-session reuse
  // (Mickey / PR #376 root cause).
  // C2 narrowing: resolve DB path through the canonical helper directly.
  const db = new SessionDB({
    dbPath: resolveSessionDbPath({
      projectDir,
      sessionsDir: adapter.getSessionDir(),
    }),
  });

  // Clean up old sessions on startup (no SessionStart hook to do this).
  db.cleanupOldSessions(7);

  // OC-4 (#487 follow-up): per-session capture gate. Keyed by sessionId (NOT
  // projectDir) so multi-session reuse within a long-lived plugin process
  // still gets per-session capture exactly once.
  const agentsMdCaptured = new Set<string>();

  function captureAgentsMd(sessionId: string): void {
    if (agentsMdCaptured.has(sessionId)) return;
    agentsMdCaptured.add(sessionId);
    const candidates = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];
    for (const name of candidates) {
      try {
        const p = join(projectDir, name);
        if (!existsSync(p)) continue;
        const content = readFileSync(p, "utf-8");
        if (!content.trim()) continue;
        db.insertEvent(
          sessionId,
          {
            type: "rule",
            category: "rule",
            data: p,
            priority: 1,
          } as SessionEvent,
          "PluginInit",
        );
        db.insertEvent(
          sessionId,
          {
            type: "rule_content",
            category: "rule",
            data: content,
            priority: 1,
          } as SessionEvent,
          "PluginInit",
        );
      } catch {
        // file missing or unreadable — skip silently
      }
    }
  }

  // ── Tool specs (host-agnostic) ─────────────────────────

  async function buildToolSpecs(): Promise<NativeToolSpec[]> {
    // Import the existing MCP server registry without starting its stdio
    // transport. This is the plugin-only bridge for #574: OpenCode/Kilo
    // call ctx_* tools in-process instead of spawning a separate MCP child
    // per session.
    const prevEmbedded = process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
    process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = "1";
    let mod: typeof import("../../server.js");
    try {
      mod = await import("../../server.js");
    } finally {
      if (prevEmbedded === undefined)
        delete process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
      else process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = prevEmbedded;
    }
    const specs: NativeToolSpec[] = [];

    for (const registered of mod.REGISTERED_CTX_TOOLS) {
      const config = registered.config as Record<string, unknown>;
      // Zod schema object that the MCP framework normally calls
      // safeParseAsync() on before invoking the handler. The native
      // plugin paths bypass MCP's transport layer entirely, so we must
      // parse args here too — otherwise z.preprocess() coercions
      // (coerceCommandsArray / coerceJsonArray in server.ts) and defaults
      // never fire. Fixes #621.
      const inputSchema = config.inputSchema as
        | {
            shape?: unknown;
            _def?: { shape?: unknown };
            parse?: (input: unknown) => unknown;
          }
        | undefined;
      const shape =
        typeof inputSchema?.shape === "object" && inputSchema.shape !== null
          ? inputSchema.shape
          : typeof inputSchema?._def?.shape === "function"
            ? (inputSchema._def.shape as () => unknown)()
            : {};

      // Both KiloCode and recent OpenCode bundle Zod v4 in-host; v3 schemas
      // crash with `n._zod.def` undefined. Gate widened from kilo-only (#632)
      // because every consumer of this file is an OpenCode-family host.
      const zodShape = zod3ShapeToV4(shape as Record<string, unknown>);

      specs.push({
        name: registered.name,
        title: String(config.title ?? registered.name),
        description: String(config.description ?? ""),
        zodShape,
        jsonSchema: zodShapeToJsonSchema(zodShape),
        async run(args, sessionId) {
          const project = projectDir;

          // Run the registered Zod schema BEFORE the handler — same contract
          // as the MCP SDK (server/mcp.js safeParseAsync at line 174). This
          // applies z.preprocess() coercions, populates .default() values,
          // and produces the validation error the handler expects (#621).
          let parsedArgs: Record<string, unknown> = args ?? {};
          if (typeof inputSchema?.parse === "function") {
            try {
              parsedArgs = inputSchema.parse(args ?? {}) as Record<
                string,
                unknown
              >;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(
                `Invalid arguments for ${registered.name}: ${message}`,
              );
            }
          }

          const result = await mod.withProjectDirOverride(
            { projectDir: project, sessionId },
            async () => registered.handler(parsedArgs),
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

          if (r?.isError)
            throw new Error(text || `${registered.name} returned an error`);
          return text;
        },
      });
    }

    return specs;
  }

  // v1 re-checks the routing quorum on every transform because its system
  // prompt is rebuilt per turn. v2's `context` hook fires for every request
  // kind (primary/compaction/title/generate), so a per-session guard is what
  // keeps the block from being injected into title/generate calls.
  const routingBlockInjected = new Set<string>();

  // ── Handlers (shared by both API generations) ──────────

  const handlers: ContextModeState["handlers"] = {
    // ── PreToolUse: Routing enforcement ─────────────────
    async before(input, output) {
      const toolName = input.tool ?? "";
      const toolInput = output.args ?? {};

      let decision;
      try {
        decision = routing.routePreToolUse(
          toolName,
          toolInput,
          projectDir,
          platform,
        );
      } catch {
        return; // Routing failure → allow passthrough
      }

      if (!decision) return; // No routing match → passthrough

      if (decision.action === "deny" || decision.action === "ask") {
        // Throw to block — OpenCode catches this and denies the tool call
        throw new Error(decision.reason ?? "Blocked by context-mode");
      }

      if (decision.action === "modify" && decision.updatedInput) {
        Object.assign(output.args, decision.updatedInput);
      }

      if (decision.action === "context" && decision.additionalContext) {
        output.args.additionalContext = decision.additionalContext;
      }
    },

    // ── PostToolUse: Session event capture ──────────────
    async after(input, output) {
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

    // ── event: per-turn token + cost capture (v1 bus) ───
    async onEvent(input) {
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
    async onPrompt(input, output) {
      const sessionId = input?.sessionID;
      if (!sessionId) return;
      try {
        const parts = Array.isArray(output?.parts) ? output.parts : [];
        const textPartEntry = parts.find(
          (p) =>
            p &&
            p.type === "text" &&
            typeof p.text === "string" &&
            p.text.length > 0,
        );
        if (!textPartEntry || !textPartEntry.text) return;
        const message = textPartEntry.text;
        if (isSyntheticMessage(message)) return;

        db.ensureSession(sessionId, projectDir);
        // OC-4 (#487 follow-up): also capture on chat.message so sessions that
        // never invoke a tool still seed rule_content events for continuity.
        captureAgentsMd(sessionId);

        // 1. Always save the raw prompt
        db.insertEvent(
          sessionId,
          {
            type: "user_prompt",
            category: "user-prompt",
            data: message,
            priority: 1,
          } as SessionEvent,
          "UserPromptSubmit",
        );

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
    async onCompaction(input, output) {
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

        output.context.push(snapshot);

        if (process.env.OPENCODE_DEBUG) {
          await safeLog(snapshot, {
            sessionId,
            source: "on compaction - snapshot",
          });
        }

        // OC-3 / Z3: budget-capped auto-injection (P1 role / P2 rules /
        // P3 skills / P4 intent — ≤500 tokens / ~2000 chars per
        // hooks/auto-injection.mjs).
        try {
          const autoBlock: string = autoInjectionMod.buildAutoInjection(
            events,
            "compaction",
          );
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
    // surrogate is the system-prompt transform. We claim the most-recent
    // unconsumed resume snapshot atomically (race-safe across concurrent
    // processes) and splice it into the system prompt.
    async onContext(input, output, opts) {
      const sessionId = input?.sessionID;
      if (!sessionId) return;

      // ── OC-1 / CCv1: ROUTING_BLOCK injection ──────────────
      // Splice at index 1 (NOT unshift) so the system[0] header identity
      // survives — replacing system[0] invalidates the provider prompt
      // cache fold on every turn. Skip when the prompt already carries the
      // rules (e.g. via AGENTS.md / CLAUDE.md loaded by the host). v2 also
      // gates on once-per-session (see ContextHookOptions).
      const alreadyInjected =
        opts?.routingOncePerSession === true &&
        routingBlockInjected.has(sessionId);
      if (Array.isArray(output?.system) && !alreadyInjected) {
        if (!systemHasRoutingInstructions(systemPartTexts(output.system))) {
          try {
            injectSystemText(output.system, 1, routingBlock);
            routingBlockInjected.add(sessionId);
          } catch {
            // Never break the chat turn on routing-block injection failure.
          }

          if (process.env.OPENCODE_DEBUG) {
            await safeLog(routingBlock, {
              sessionId,
              source: "on routing block injection",
            });
          }
        } else if (process.env.OPENCODE_DEBUG) {
          await safeLog(
            "routing block skipped — system prompt already contains context-mode instructions",
            {
              sessionId,
              source: "on routing block injection",
            },
          );
        }
      }

      try {
        // Pass current sessionId so SQL excludes self-injection (v1.0.106 —
        // Mickey #376 follow-up): if Session B compacts mid-flight and
        // produces its own row, B's next transform must NOT claim that row.
        const row = db.claimLatestUnconsumedResume(sessionId);
        if (!row || !row.snapshot) return; // no row → retry on next turn

        if (process.env.OPENCODE_DEBUG) {
          await safeLog(row.snapshot, {
            sessionId,
            source: "on resume - snapshot",
          });
        }

        if (Array.isArray(output?.system)) {
          injectSystemText(output.system, 1, row.snapshot);
          // Mark consumed only AFTER successful splice so failed paths retry
          if (process.env.OPENCODE_DEBUG) {
            await safeLog(row.snapshot, { sessionId, source: "on resume" });
          }
        }
      } catch {
        // Silent — never break the chat turn
      }
    },
  };

  return {
    projectDir,
    db,
    routing,
    routingBlock,
    platform,
    toolSpecs: await buildToolSpecs(),
    captureAgentsMd,
    safeLog,
    handlers,
  };
}

/**
 * Zod 4 shape → JSON Schema for OpenCode 2.x, which types tool inputs as
 * `JsonSchema.JsonSchema` rather than a Zod object. `unrepresentable: "any"`
 * degrades a type Zod cannot express (z.preprocess, custom transforms) to `{}`
 * instead of throwing — the tool still works, it just documents less.
 */
function zodShapeToJsonSchema(
  shape: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const asJson = z.toJSONSchema(
      z.object(shape as Record<string, z.ZodType>),
      {
        io: "input",
        unrepresentable: "any",
      },
    ) as Record<string, unknown>;
    // $schema is meaningless to the host and only inflates every tool entry.
    delete asJson.$schema;
    return asJson;
  } catch {
    return { type: "object", properties: {}, additionalProperties: true };
  }
}

// ── v1 entrypoint (OpenCode 1.x / KiloCode) ──────────────

/**
 * Plugin factory for the v1 plugin API. KiloCode/OpenCode 1.x call this and
 * read the returned hook map.
 */
async function createContextModePlugin(ctx: PluginContext) {
  const projectDir = ctx?.directory ?? process.cwd();

  const logger = (
    message = "context-mode debug log",
    extra?: PluginClientAppLogBodyExtra,
  ) =>
    ctx.client.app.log({
      body: { service: "context-mode-logger", level: "info", message, extra },
    });

  // Drop-in wrapper for `logger` that NEVER rejects (#448): if the transport
  // errors, the rejection would propagate into the host and break the turn.
  const safeLog: LogSink = async (message, extra) => {
    try {
      await logger(message, extra);
    } catch {
      // Never break the turn on debug-log failure.
    }
  };

  const state = await initState(projectDir, safeLog);
  const h = state.handlers;

  const tool: Record<string, NativeToolDefinition> = {};
  for (const spec of state.toolSpecs) {
    tool[spec.name] = {
      description: spec.description,
      args: spec.zodShape,
      async execute(args, toolCtx) {
        toolCtx.metadata?.({ title: spec.title });
        return {
          title: spec.title,
          output: await spec.run(args, toolCtx.sessionID),
        };
      },
    };
  }

  return {
    tool,
    "tool.execute.before": h.before,
    "tool.execute.after": h.after,
    event: h.onEvent,
    "chat.message": h.onPrompt,
    "experimental.session.compacting": h.onCompaction,
    "experimental.chat.system.transform": h.onContext,
  };
}

// ── v2 usage accounting ─────────────────────────────────

/** One `session.usage.updated` payload, flattened. */
type UsageSnapshot = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

const ZERO_USAGE: UsageSnapshot = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Flatten a v2 usage event payload, or null when it carries no token block. */
function readUsageSnapshot(data: any): UsageSnapshot | null {
  const t = data?.tokens;
  if (!t || typeof t !== "object") return null;
  return {
    input: num(t.input),
    output: num(t.output),
    reasoning: num(t.reasoning),
    cacheRead: num(t.cache?.read),
    cacheWrite: num(t.cache?.write),
    cost: num(data?.cost),
  };
}

/**
 * Convert two consecutive `session.usage.updated` payloads into the usage
 * attributable to the step between them.
 *
 * The event fires once per STEP, but its payload is the session's running
 * total — `tokens.input` climbs monotonically across steps (measured: a
 * three-step turn went 1279918 → 1280031 → 1280078). Inserting the payload
 * verbatim once per step would record the cumulative total N times, so the
 * DB over-counts by roughly the step count.
 *
 * This differs from v1, where `message.updated` carried a LAST-STEP `.tokens`
 * alongside a turn-cumulative `.cost`, so only the cost needed delta-ing there.
 * In v2 both sides are cumulative and both need it.
 *
 * Returns null when nothing moved, so a duplicate or zero-usage step inserts
 * no event at all. A missing `prev` means this is the first snapshot we have
 * seen for the session; since plugins load at server start, before any
 * session exists, the first payload is the whole session total so far and
 * zero is the correct baseline.
 */
function usageDelta(
  prev: UsageSnapshot | undefined,
  next: UsageSnapshot,
): { tokens: Record<string, unknown>; cost: number } | null {
  const base = prev ?? ZERO_USAGE;
  const tokens = {
    input: Math.max(0, next.input - base.input),
    output: Math.max(0, next.output - base.output),
    reasoning: Math.max(0, next.reasoning - base.reasoning),
    cache: {
      read: Math.max(0, next.cacheRead - base.cacheRead),
      write: Math.max(0, next.cacheWrite - base.cacheWrite),
    },
  };
  const cost = Math.max(0, next.cost - base.cost);
  const moved =
    num(tokens.input) +
      num(tokens.output) +
      num(tokens.reasoning) +
      num(tokens.cache.read) +
      num(tokens.cache.write) +
      cost >
    0;
  if (!moved) return null;
  return { tokens, cost };
}

// ── v2 entrypoint (OpenCode 2.x) ─────────────────────────

/**
 * OpenCode 2.x plugin API. `setup` receives the plugin context; hooks are
 * registered on the domain that owns each operation. There is no
 * `client.app.log` in v2 — the closest thing to a diagnostic sink is stderr,
 * which the host forwards to its own log.
 */
async function setupContextModeV2(ctx: V2Context) {
  const projectDir = ctx?.location?.directory ?? process.cwd();

  const safeLog: LogSink = async (message, extra) => {
    if (!process.env.OPENCODE_DEBUG) return;
    try {
      const tag = extra?.source ? ` [${extra.source}]` : "";
      process.stderr.write(`[context-mode]${tag} ${message ?? ""}\n`);
    } catch {
      // Diagnostics only — never break the turn.
    }
  };

  const state = await initState(projectDir, safeLog);
  const h = state.handlers;

  // ── ctx_* tools ───────────────────────────────────────
  // v2 registers tools through a replayable transform. Keep the callback
  // synchronous and side-effect free: it re-runs on every reload.
  await ctx.tool.transform((editor) => {
    for (const spec of state.toolSpecs) {
      editor.add({
        name: spec.name,
        description: spec.description,
        input: spec.jsonSchema,
        async execute(
          input: unknown,
          toolCtx: { sessionID?: string; signal?: AbortSignal },
        ) {
          return {
            content: await spec.run(
              (input ?? {}) as Record<string, unknown>,
              toolCtx?.sessionID ?? "",
            ),
          };
        },
      });
    }
  });

  // ── PreToolUse: routing enforcement ───────────────────
  // v2 delivers one mutable event: `input` replaces v1's `output.args`.
  await ctx.tool.hook("execute.before", async (event) => {
    await h.before(
      { tool: event.tool, sessionID: event.sessionID, callID: event.id },
      { args: event.input },
    );
  });

  // ── PostToolUse: session event capture ────────────────
  // v2 moved the result onto the event: `result.output` or `result.content`.
  await ctx.tool.hook("execute.after", async (event) => {
    const result =
      event.status === "completed"
        ? (event as { result?: any }).result
        : undefined;
    const output =
      typeof result?.output === "string"
        ? result.output
        : Array.isArray(result?.content)
          ? result.content
              .filter(
                (c: any) => c?.type === "text" && typeof c.text === "string",
              )
              .map((c: any) => c.text)
              .join("\n")
          : typeof result?.content === "string"
            ? result.content
            : "";
    await h.after(
      {
        tool: event.tool,
        sessionID: event.sessionID,
        callID: event.id,
        args: event.input,
      },
      { title: "", output, metadata: undefined },
    );
  });

  // ── chat.message: user-prompt capture ──────────────────
  // v2 exposes the prompt as `event.prompt` ({ text, files? }) instead of the
  // v1 `output.parts` array, so the text lookup collapses to one field.
  await ctx.session.hook("prompt", async (event) => {
    const text = event?.prompt?.text;
    if (typeof text !== "string" || !text) return;
    await h.onPrompt(
      { sessionID: event.sessionID, messageID: event.messageID },
      { message: text, parts: [{ type: "text", text }] },
    );
  });

  // ── PreCompact: snapshot injection ─────────────────────
  // v2 types the system prompt as SystemPart[]; the snapshot rides along as
  // an extra part instead of v1's `output.context` string array. We do NOT
  // set `event.result` — that would skip the model's compaction request,
  // which is not what v1 did.
  await ctx.session.hook("compaction", async (event) => {
    const sessionId = event?.sessionID;
    if (!sessionId) return;
    const context: string[] = [];
    await h.onCompaction({ sessionID: sessionId }, { context });
    if (!Array.isArray(event.system)) return;
    for (const entry of context) {
      injectSystemText(event.system, 1, entry);
    }
  });

  // ── SessionStart surrogate: routing block + resume ────
  // This hook fires for every request kind in v2, hence routingOncePerSession.
  await ctx.session.hook("context", async (event) => {
    await h.onContext(
      { sessionID: event?.sessionID, model: (event as any)?.model },
      { system: event.system as string[] },
      { routingOncePerSession: true },
    );
  });

  // ── per-turn token + cost capture ─────────────────────
  // v1 listened for `message.updated` on the generic bus. v2 renamed the whole
  // event vocabulary: usage is `session.usage.updated`, and the billed model
  // is announced separately by `session.model.selected`.
  const controller = new AbortController();
  const modelBySession = new Map<
    string,
    { providerID?: string; modelID?: string }
  >();
  const usageBaseline = new Map<string, UsageSnapshot>();

  void (async () => {
    try {
      for await (const ev of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        try {
          const type = (ev as any)?.type;
          const data = (ev as any)?.data;

          if (type === "session.model.selected") {
            if (typeof data?.sessionID === "string" && data.model) {
              modelBySession.set(data.sessionID, data.model);
            }
            continue;
          }

          if (type === "session.deleted") {
            if (typeof data?.sessionID === "string") {
              modelBySession.delete(data.sessionID);
              usageBaseline.delete(data.sessionID);
            }
            continue;
          }

          if (type !== "session.usage.updated") continue;
          const sessionId = data?.sessionID;
          if (typeof sessionId !== "string") continue;

          const snapshot = readUsageSnapshot(data);
          if (!snapshot) continue;

          const delta = usageDelta(usageBaseline.get(sessionId), snapshot);
          usageBaseline.set(sessionId, snapshot);
          if (!delta) continue;

          const model = modelBySession.get(sessionId);
          // parseOpencodeUsage reads a v1-shaped assistant message. Rebuild
          // that envelope from the v2 payload so the parser — and every test
          // covering it — stays the single source of truth.
          const counts = parseOpencodeUsage({
            role: "assistant",
            tokens: delta.tokens,
            cost: delta.cost,
            providerID: model?.providerID,
            modelID: model?.modelID,
          });
          if (!counts) continue;
          const usageEvent = buildAgentUsageEvent(counts);
          if (!usageEvent) continue;

          state.db.ensureSession(sessionId, state.projectDir);
          state.db.insertEvent(sessionId, usageEvent, "UsageUpdated");
        } catch {
          // Silent — usage capture must never break the session.
        }
      }
    } catch {
      // Stream closed (unload) or transport error — nothing to do.
    }
  })();

  return () => controller.abort();
}

// ── Exports ──────────────────────────────────────────────
// Dual shape: OpenCode 1.x / KiloCode call `server`, OpenCode 2.x calls `setup`.
// Both receive identical behavior; only the registration surface differs.
export default {
  id: "context-mode",
  server: createContextModePlugin,
  setup: setupContextModeV2,
};
export { createContextModePlugin as ContextModePlugin };
export { setupContextModeV2 as setupContextMode };
// Usage accounting — exported for unit testing the cumulative-delta fix (#1036).
export { usageDelta, readUsageSnapshot };
export type { UsageSnapshot };
// Test surface — exported for unit testing the quorum substring fix (#487).
export { systemHasRoutingInstructions, ROUTING_MARKERS };
