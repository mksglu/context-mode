/**
 * Host-agnostic core shared by the v1 (`server`) and v2 (`setup`) OpenCode mouths.
 *
 * Holds the SessionDB, the routing / routing-block / auto-injection islands, the
 * ctx tool handlers (reused from server.js), and the capture/claim operations.
 * Each mouth constructs (or reuses, via {@link getCore}) one core and binds it to
 * host-specific hook shapes.
 *
 * Directory model (identical to the pre-v2 plugin): the DB is bound to the
 * plugin-load-scope directory at construction. A per-session / per-call directory
 * is passed to {@link CoreTool.run} only to override the tool-handler cwd via
 * `withProjectDirOverride` — it never re-points the DB.
 *
 * The core is a per-installation singleton keyed by `platform::loadScopeDir`, so a
 * transitional host that invokes both mouths shares one DB handle and one set of
 * loaded islands (load-idempotent core initialization).
 */

import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

import { resolveSessionDbPath, SessionDB } from "../../session/db.js";
import { extractEvents, extractUserEvents } from "../../session/extract.js";
import { buildResumeSnapshot } from "../../session/snapshot.js";
import type { SessionEvent } from "../../types.js";
import { OpenCodeAdapter } from "./index.js";
import type { AdapterPlatformType } from "./index.js";
import { PLATFORM_ENV_VARS } from "../detect.js";

// ── Public types ──────────────────────────────────────────

export type CoreLogger = (message: string, extra?: Record<string, unknown>) => void;

export interface CoreOptions {
  platform: AdapterPlatformType;
  /** Plugin-load-scope directory — binds the SessionDB. */
  loadScopeDir: string;
  logger?: CoreLogger;
}

/** A ctx tool as exposed by the core. Each mouth adapts `inputSchema` to its host. */
export interface CoreTool {
  name: string;
  description: string;
  title: string;
  /** The tool's Zod v3 input schema (authoritative for coercion + error text). */
  inputSchema: any;
  /**
   * Parse `rawArgs` with the v3 schema and run the shared handler under the given
   * project-dir override. Throws `Error("Invalid arguments for <name>: …")` on a
   * schema failure and `Error(<text>)` when the handler returns `isError`.
   */
  run(rawArgs: unknown, projectDir: string, sessionId: string): Promise<string>;
}

export interface CompactionResult {
  snapshot: string;
  autoBlock?: string;
}

export interface RoutingDecision {
  action?: string;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: unknown;
}

export interface ContextModeCore {
  readonly platform: AdapterPlatformType;
  readonly loadScopeDir: string;
  readonly db: SessionDB;
  readonly routingBlock: string;
  getTools(): CoreTool[];
  routePreToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
    projectDir: string,
  ): RoutingDecision | undefined;
  captureToolEvent(
    sessionId: string,
    projectDir: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: unknown,
  ): void;
  captureUserPrompt(sessionId: string, projectDir: string, message: string): void;
  recordUsage(
    sessionId: string,
    projectDir: string,
    usageEvent: Omit<SessionEvent, "data_hash"> & { data_hash?: string },
  ): void;
  buildCompactionSnapshot(sessionId: string, projectDir: string): CompactionResult | null;
  claimResume(sessionId: string): { snapshot: string } | null;
  systemHasRoutingInstructions(system: string[]): boolean;
  dispose(): void;
}

// ── Shared helpers (re-exported by the v1 plugin for its tests) ──

export const SYNTHETIC_MESSAGE_PREFIXES = [
  "<task-notification>",
  "<system-reminder>",
  "<context_guidance>",
  "<tool-result>",
];

export function isSyntheticMessage(text: string): boolean {
  const trimmed = text.trimStart();
  return SYNTHETIC_MESSAGE_PREFIXES.some((p) => trimmed.startsWith(p));
}

export const ROUTING_MARKERS = ["<context_window_protection>", "ctx_search", "ctx_index"];

export function systemHasRoutingInstructions(system: string[]): boolean {
  const joined = system.join("\n");
  let count = 0;
  for (const marker of ROUTING_MARKERS) {
    if (marker.startsWith("<")) {
      if (joined.includes(marker)) count++;
    } else {
      const re = new RegExp(`(?:^|\\W)${marker}(?:\\W|$)`);
      if (re.test(joined)) count++;
    }
  }
  return count >= 2;
}

/**
 * Detect whether the plugin runs under KiloCode or OpenCode from host env vars.
 *
 * Reuses the canonical PLATFORM_ENV_VARS list (src/adapters/detect.ts) as the
 * single source of truth. Order matters: KiloCode is an OpenCode fork that sets
 * `OPENCODE=1` alongside `KILO_PID`, and PLATFORM_ENV_VARS lists `kilo` before
 * `opencode` so KILO_PID wins the iteration. Shared by both the v1 and v2
 * mouths so the core cache key (`platform::loadScopeDir`) is identical across
 * them — a transitional host invoking both mouths still resolves one core.
 */
export function detectPlatform(): AdapterPlatformType {
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

// ── Singleton cache (load-idempotent core) ────────────────

const coreCache = new Map<string, ContextModeCore>();

/**
 * Return the shared core for `platform::loadScopeDir`, creating it once. A
 * transitional host invoking both mouths receives the same instance — one DB
 * handle, one set of loaded islands, no duplicate background work.
 */
export async function getCore(options: CoreOptions): Promise<ContextModeCore> {
  const key = `${options.platform}::${options.loadScopeDir}`;
  const existing = coreCache.get(key);
  if (existing) return existing;
  const core = await createCore(options);
  coreCache.set(key, core);
  return core;
}

/** Test/teardown helper: drop the cached core for a key (or all). */
export function resetCoreCache(key?: string): void {
  if (key) coreCache.delete(key);
  else coreCache.clear();
}

// ── Core construction ─────────────────────────────────────

async function createCore(options: CoreOptions): Promise<ContextModeCore> {
  const { platform, loadScopeDir } = options;
  const logger = options.logger;
  const safeLog = (message: string, extra?: Record<string, unknown>) => {
    try {
      void logger?.(message, extra);
    } catch {
      /* logging must never break the plugin */
    }
  };

  const buildDir = dirname(fileURLToPath(import.meta.url));
  const buildRoot = resolve(buildDir, "..", "..");

  // Routing enforcement island.
  const routingPath = resolve(buildDir, "..", "..", "..", "hooks", "core", "routing.mjs");
  const routing: any = await import(pathToFileURL(routingPath).href);
  await routing.initSecurity(buildRoot);

  // Routing-block / tool-naming / auto-injection islands.
  const routingBlockMod: any = await import(
    pathToFileURL(resolve(buildDir, "..", "..", "..", "hooks", "routing-block.mjs")).href
  );
  const toolNamingMod: any = await import(
    pathToFileURL(resolve(buildDir, "..", "..", "..", "hooks", "core", "tool-naming.mjs")).href
  );
  const autoInjectionMod: any = await import(
    pathToFileURL(resolve(buildDir, "..", "..", "..", "hooks", "auto-injection.mjs")).href
  );

  const toolNamer = toolNamingMod.createToolNamer(platform);
  const routingBlock: string = routingBlockMod.createRoutingBlock(toolNamer);

  // Session DB bound to the plugin-load-scope directory.
  const adapter = new OpenCodeAdapter(platform);
  const db = new SessionDB({
    dbPath: resolveSessionDbPath({
      projectDir: loadScopeDir,
      sessionsDir: adapter.getSessionDir(),
    }),
  });
  db.cleanupOldSessions(7);

  const agentsMdCaptured = new Set<string>();
  const captureAgentsMd = (sessionId: string) => {
    if (agentsMdCaptured.has(sessionId)) return;
    agentsMdCaptured.add(sessionId);
    for (const name of ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]) {
      try {
        const p = join(loadScopeDir, name);
        if (!existsSync(p)) continue;
        const content = readFileSync(p, "utf-8");
        if (!content.trim()) continue;
        db.insertEvent(sessionId, { type: "rule", category: "rule", data: p, priority: 1 }, "PluginInit");
        db.insertEvent(
          sessionId,
          { type: "rule_content", category: "rule", data: content, priority: 1 },
          "PluginInit",
        );
      } catch {
        /* best-effort */
      }
    }
  };

  // Load the shared ctx tool registry from server.js under the embedded-plugin
  // guard so importing it never installs process-wide unhandledRejection handlers.
  const prevEmbedded = process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
  process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = "1";
  let mod: any;
  try {
    mod = await import("../../server.js");
  } finally {
    if (prevEmbedded === undefined) delete process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
    else process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = prevEmbedded;
  }

  const extractText = (r: any): string => {
    if (r && Array.isArray(r.content)) {
      return r.content
        .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text)
        .join("\n");
    }
    if (typeof r === "string") return r;
    return JSON.stringify(r ?? "");
  };

  const coreTools: CoreTool[] = (mod.REGISTERED_CTX_TOOLS as any[]).map((registered) => {
    const name = registered.name as string;
    const config = (registered.config ?? {}) as Record<string, unknown>;
    const inputSchema = config.inputSchema as any;
    const title = String(config.title ?? name);
    return {
      name,
      description: String(config.description ?? ""),
      title,
      inputSchema,
      async run(rawArgs: unknown, projectDir: string, sessionId: string): Promise<string> {
        let parsed: Record<string, unknown> = (rawArgs ?? {}) as Record<string, unknown>;
        if (inputSchema && typeof inputSchema.parse === "function") {
          try {
            parsed = inputSchema.parse(rawArgs ?? {}) as Record<string, unknown>;
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            throw new Error(`Invalid arguments for ${name}: ${msg}`);
          }
        }
        const result = await mod.withProjectDirOverride(
          { projectDir, sessionId },
          () => registered.handler(parsed),
        );
        const text = extractText(result);
        if (result && (result as any).isError) {
          throw new Error(text || `${name} returned an error`);
        }
        return text;
      },
    };
  });

  return {
    platform,
    loadScopeDir,
    db,
    routingBlock,

    getTools(): CoreTool[] {
      return coreTools;
    },

    routePreToolUse(toolName, toolInput, projectDir): RoutingDecision | undefined {
      try {
        return routing.routePreToolUse(toolName, toolInput, projectDir, platform);
      } catch {
        return undefined;
      }
    },

    captureToolEvent(sessionId, projectDir, toolName, toolInput, toolResponse) {
      if (!sessionId) return;
      try {
        db.ensureSession(sessionId, projectDir);
        captureAgentsMd(sessionId);
        const hookInput = {
          tool_name: toolName ?? "",
          tool_input: toolInput ?? {},
          tool_response: toolResponse,
          tool_output: undefined,
        };
        const events = extractEvents(hookInput as any);
        for (const e of events) db.insertEvent(sessionId, e, "PostToolUse");
      } catch {
        /* best-effort */
      }
    },

    captureUserPrompt(sessionId, projectDir, message) {
      if (!sessionId) return;
      try {
        if (!message || isSyntheticMessage(message)) return;
        db.ensureSession(sessionId, projectDir);
        captureAgentsMd(sessionId);
        db.insertEvent(
          sessionId,
          { type: "user_prompt", category: "user-prompt", data: message, priority: 1 },
          "UserPromptSubmit",
        );
        const userEvents = extractUserEvents(message);
        for (const ev of userEvents) db.insertEvent(sessionId, ev, "UserPromptSubmit");
      } catch {
        /* best-effort */
      }
    },

    recordUsage(sessionId, projectDir, usageEvent) {
      if (!sessionId || !usageEvent) return;
      try {
        db.ensureSession(sessionId, projectDir);
        db.insertEvent(sessionId, usageEvent, "MessageUpdated");
      } catch {
        /* best-effort */
      }
    },

    buildCompactionSnapshot(sessionId, projectDir): CompactionResult | null {
      if (!sessionId) return null;
      try {
        db.ensureSession(sessionId, projectDir);
        const events = db.getEvents(sessionId);
        if (!events || events.length === 0) return null;
        const stats = db.getSessionStats(sessionId);
        const snapshot = buildResumeSnapshot(events, {
          compactCount: (stats?.compact_count ?? 0) + 1,
        });
        db.upsertResume(sessionId, snapshot, events.length);
        db.incrementCompactCount(sessionId);
        let autoBlock: string | undefined;
        try {
          const block = autoInjectionMod.buildAutoInjection(events);
          if (block && block.length > 0) autoBlock = block;
        } catch {
          /* best-effort */
        }
        return { snapshot, autoBlock };
      } catch {
        return null;
      }
    },

    claimResume(sessionId) {
      try {
        const row = db.claimLatestUnconsumedResume(sessionId);
        if (!row || !row.snapshot) return null;
        return { snapshot: row.snapshot };
      } catch {
        return null;
      }
    },

    systemHasRoutingInstructions,

    dispose() {
      try {
        db.close();
      } catch {
        /* best-effort */
      }
      const key = `${platform}::${loadScopeDir}`;
      if (coreCache.get(key) === this) coreCache.delete(key);
    },
  };
}
