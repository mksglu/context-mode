/**
 * OpenCode / KiloCode TypeScript plugin entry point for context-mode.
 *
 * This is the **v1 mouth** of the dual-support adapter. All host-agnostic logic
 * (SessionDB, routing islands, ctx tool handlers, capture/claim operations)
 * lives in ./core.js and is shared with the v2 (`setup`) mouth. This file keeps
 * only the v1 hook-shape glue plus platform detection.
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
 */

import { parseOpencodeUsage, buildAgentUsageEvent } from "../../session/extract.js";
import { zod3ShapeToV4 } from "./zod3tov4.js";
import { getCore, detectPlatform, systemHasRoutingInstructions, ROUTING_MARKERS } from "./core.js";
import { setupV2 } from "./plugin-v2.js";

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

// ── Helpers ───────────────────────────────────────────────
// Synthetic-message filter, routing-marker quorum, and the routing-block/DB/tool
// machinery now live in ./core.js (shared with the v2 mouth), including platform
// detection (detectPlatform). The v1 plugin keeps only host-shape glue.

// ── Plugin Factory ────────────────────────────────────────

/**
 * v1 plugin factory. Called once when KiloCode/OpenCode (v1) loads the plugin.
 * Returns an object mapping hook event names to async handler functions.
 *
 * All stateful machinery is obtained from the shared core (load-idempotent), so a
 * transitional host that also invokes the v2 `setup` mouth reuses one DB handle
 * and one set of loaded islands.
 *
 * KiloCode expects: export default { id: string, server: (input) => Promise<Hooks> }
 * OpenCode expects: export const ContextModePlugin = (ctx) => Promise<Hooks>
 */
async function createContextModePlugin(ctx: PluginContext) {
  const platform = detectPlatform();
  const projectDir = ctx?.directory ?? process.cwd();

  // Debug logger bound to the v1 client. Never throws.
  const safeLog = async (
    message?: string,
    extra?: PluginClientAppLogBodyExtra,
  ): Promise<void> => {
    try {
      await ctx.client.app.log({
        body: {
          service: "context-mode-logger",
          level: "info",
          message: message ?? "context-mode debug log",
          extra,
        },
      });
    } catch {
      // Never break the turn on debug-log failure.
    }
  };

  const core = await getCore({
    platform,
    loadScopeDir: projectDir,
    logger: (message, extra) => {
      void ctx.client.app.log({
        body: { service: "context-mode-logger", level: "info", message, extra },
      });
    },
  });

  // Build native tool definitions from the shared core registry. The core owns
  // parse + handler invocation (with the project-dir override); this mouth only
  // adapts the schema to the v1 host's Zod-v4 `args` shape and the return shape.
  const nativeTools: Record<string, NativeToolDefinition> = {};
  for (const t of core.getTools()) {
    const inputSchema = t.inputSchema as
      | { shape?: unknown; _def?: { shape?: unknown } }
      | undefined;
    const shape =
      typeof inputSchema?.shape === "object" && inputSchema.shape !== null
        ? inputSchema.shape
        : typeof inputSchema?._def?.shape === "function"
          ? (inputSchema._def.shape as () => unknown)()
          : {};
    const argsForHost = zod3ShapeToV4(shape as Record<string, unknown>);

    nativeTools[t.name] = {
      description: t.description,
      args: argsForHost,
      async execute(args: Record<string, unknown>, toolCtx: NativeToolContext) {
        toolCtx.metadata?.({ title: t.title });
        const project = toolCtx.directory || projectDir;
        const text = await t.run(args, project, toolCtx.sessionID);
        return { title: t.title, output: text };
      },
    };
  }

  return {
    tool: nativeTools,

    // ── PreToolUse: Routing enforcement ─────────────────

    "tool.execute.before": async (input: BeforeHookInput, output: BeforeHookOutput) => {
      const decision = core.routePreToolUse(input.tool ?? "", output.args ?? {}, projectDir);
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
      core.captureToolEvent(
        input.sessionID,
        projectDir,
        input.tool ?? "",
        input.args ?? {},
        output.output,
      );
    },

    // ── event: per-turn token + cost capture (paid-observability) ───
    // The generic bus `event` hook delivers every Event; we filter
    // `message.updated` and read tokens/cost/modelID off properties.info.
    // The v1-specific parse stays here; the DB write goes through the core.
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

        core.recordUsage(sessionId, projectDir, usageEvent);
      } catch {
        // Silent — usage capture must never break the session.
      }
    },

    // ── chat.message: User-prompt capture (OC-2 / Z2) ───
    // CCv2 inline filter (skip synthetic harness messages) is applied inside
    // the core's captureUserPrompt.
    "chat.message": async (input: ChatMessageHookInput, output: ChatMessageHookOutput) => {
      const sessionId = input?.sessionID;
      if (!sessionId) return;
      const parts = Array.isArray(output?.parts) ? output.parts : [];
      const textPart = parts.find(
        (p) => p && p.type === "text" && typeof p.text === "string" && p.text.length > 0,
      );
      if (!textPart || !textPart.text) return;
      core.captureUserPrompt(sessionId, projectDir, textPart.text);
    },

    // ── PreCompact: Snapshot generation ─────────────────

    "experimental.session.compacting": async (
      input: CompactingHookInput,
      output: CompactingHookOutput,
    ) => {
      const sessionId = input.sessionID;
      if (!sessionId) return "";

      const res = core.buildCompactionSnapshot(sessionId, projectDir);
      if (!res) return "";

      // Mutate output.context to inject the snapshot
      output.context.push(res.snapshot);
      if (process.env.OPENCODE_DEBUG) {
        await safeLog(res.snapshot, { sessionId, source: "on compaction - snapshot" });
      }

      // OC-3 / Z3: budget-capped auto-injection as a separate context entry.
      if (res.autoBlock && res.autoBlock.length > 0) {
        output.context.push(res.autoBlock);
        if (process.env.OPENCODE_DEBUG) {
          await safeLog(res.autoBlock, { sessionId, source: "on compaction - autoBlock" });
        }
      }

      return res.snapshot;
    },

    // ── SessionStart equivalent (PR #376) ───────────────
    // OpenCode lacks a real SessionStart hook (#14808, #5409). The closest
    // surrogate is `experimental.chat.system.transform`. We inject the routing
    // block (unless already present) and claim the most-recent unconsumed resume
    // snapshot atomically, splicing at index 1 to preserve the header cache-fold.
    "experimental.chat.system.transform": async (
      input: SystemTransformHookInput,
      output: SystemTransformHookOutput,
    ) => {
      const sessionId = input?.sessionID;
      if (!sessionId) return;

      // ── OC-1 / CCv1: ROUTING_BLOCK injection ──────────────
      if (Array.isArray(output?.system)) {
        if (!systemHasRoutingInstructions(output.system)) {
          try {
            output.system.splice(1, 0, core.routingBlock);
          } catch {
            // Never break the chat turn on routing-block injection failure.
          }

          if (process.env.OPENCODE_DEBUG) {
            await safeLog(output.system[1], { sessionId, source: "on routing block injection" });
          }
        } else if (process.env.OPENCODE_DEBUG) {
          await safeLog(
            `routing block skipped — system prompt already contains context-mode instructions`,
            { sessionId, source: "on routing block injection" },
          );
        }
      }

      // ── Resume snapshot claim + inject ──────────────────────
      const row = core.claimResume(sessionId);
      if (!row) return; // no row → retry on next turn

      if (process.env.OPENCODE_DEBUG) {
        await safeLog(row.snapshot, { sessionId, source: "on resume - snapshot" });
      }

      if (Array.isArray(output?.system)) {
        // Insert at index 1 (after the header) — NOT unshift. OpenCode's
        // llm.ts folds `[header, body]` only if system[0] is unchanged; index-1
        // insertion keeps the header invariant and preserves the provider cache.
        output.system.splice(1, 0, row.snapshot);
        if (process.env.OPENCODE_DEBUG) {
          await safeLog(output.system[1], { sessionId, source: "on resume" });
        }
      }
    },
  };
}

// ── Exports ──────────────────────────────────────────────
// Dual-support merged default export: a v1 host (KiloCode, OpenCode v1) reads
// `{ id, server }` and calls `server()`; a v2 host reads `{ id, setup }` and
// calls `setup()`. Both mouths resolve the same load-idempotent core, so a
// transitional host that consults both still gets one DB handle and one set of
// loaded islands.
//
// OpenCode compat: named export for direct import("context-mode/plugin"), and
// the pre-1.18.29 lifeline `ContextModePlugin`.
export default { id: "context-mode", setup: setupV2, server: createContextModePlugin };
export { createContextModePlugin as ContextModePlugin };
// Test surface — exported for unit testing the quorum substring fix (#487).
export { systemHasRoutingInstructions, ROUTING_MARKERS };
