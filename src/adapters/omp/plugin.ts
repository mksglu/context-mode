/**
 * Oh My Pi (OMP) plugin entry point for context-mode.
 *
 * Mirrors the Pi extension shape (`src/adapters/pi/extension.ts`) for
 * the four OMP hook events that materially protect the context window
 * and persist session continuity:
 *
 *   - session_start         — initialize the session row in our DB
 *   - tool_call             — hard-block curl/wget/inline-HTTP in bash
 *   - tool_result           — extract structured events into the session DB
 *   - session_before_compact — persist a resume snapshot before compaction
 *
 * Loaded by OMP via the `omp` (or `pi`) field in package.json — see
 * upstream loader at refs/platforms/oh-my-pi/packages/coding-agent/src/
 * extensibility/plugins/loader.ts:75:
 *   `const manifest: PluginManifest | undefined = pluginPkg.omp || pluginPkg.pi;`
 * Hook factory contract from refs/.../extensibility/hooks/types.ts:809:
 *   `export type HookFactory = (pi: HookAPI) => void;`
 *
 * OMP differs from Pi in two ways that justify a dedicated plugin file:
 *   1. Storage roots at ~/.omp/context-mode/ via OMPAdapter, not ~/.pi/
 *   2. OMP has native MCP support (mcp.json), so no MCP bridge is needed
 *      — the bridge that Pi's extension ships (mcp-bridge.ts) is dead weight
 *      under OMP and is intentionally omitted here.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSessionDbPath, SessionDB } from "../../session/db.js";
import { extractEvents } from "../../session/extract.js";
import type { HookInput } from "../../session/extract.js";
import { buildResumeSnapshot } from "../../session/snapshot.js";
import type { SessionEvent } from "../../types.js";
import { OMPAdapter } from "./index.js";

// ── Tool-name normalization ─────────────────────────────
// OMP uses lowercase tool names (refs/.../hooks/types.ts:451 example
// `toolName: "bash"`). Shared event extractors expect PascalCase
// (Claude Code convention). Map the common ones.
const OMP_TOOL_MAP: Record<string, string> = {
  bash: "Bash",
  edit: "Edit",
  read: "Read",
  write: "Write",
  list: "Glob",
  view: "Read",
};

// ── Routing patterns ─────────────────────────────────────
// Inline HTTP client patterns to hard-block in bash. Identical to the
// Pi extension list (src/adapters/pi/extension.ts:42). One unrouted
// curl can dump 56 KB into context.
const BLOCKED_BASH_PATTERNS: RegExp[] = [
  /\bcurl\s/,
  /\bwget\s/,
  /\bfetch\s*\(/,
  /\brequests\.get\s*\(/,
  /\brequests\.post\s*\(/,
  /\bhttp\.get\s*\(/,
  /\bhttp\.request\s*\(/,
  /\burllib\.request/,
  /\bInvoke-WebRequest\b/,
];

// ── Module-level singletons ──────────────────────────────
// Same shape as Pi: one DB per process, session ID rebound on each
// session_start so multi-session reuse within a long-lived plugin
// process keeps event attribution correct.
let _db: SessionDB | null = null;
let _dbPath = "";
let _sessionId = "";

const _ompAdapter = new OMPAdapter();

// ── MCP self-registration (issue #677) ───────────────────
// The `omp plugin install context-mode` path wires THIS extension factory
// (so routing hooks fire), but never creates the MCP config — so the 11
// `ctx_*` tools stay unreachable even though curl/wget are blocked. Register
// the server ourselves on plugin load, ONLY when absent (never clobber a
// user's existing entry). Takes effect on the next OMP restart, same as the
// manual mcp.json workaround the issue documents.
const MCP_SERVER_NAME = "context-mode";
// plugin.js ships at <pkg>/build/adapters/omp/plugin.js; the MCP server
// bundle sits at the package root (<pkg>/server.bundle.mjs) — three up.
const SERVER_BUNDLE_RELATIVE = "../../../server.bundle.mjs";

function resolveServerBundle(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const bundle = resolve(here, SERVER_BUNDLE_RELATIVE);
    return existsSync(bundle) ? bundle : null;
  } catch {
    return null;
  }
}

/**
 * Ensure `~/.omp/agent/mcp.json` registers the context-mode MCP server.
 *
 * Uses `node <abs>/server.bundle.mjs` rather than the `context-mode` bin:
 * under the plugin install the package lives in `~/.omp/plugins/node_modules`
 * and its bin is NOT on PATH, so the bare command would fail to spawn (the
 * exact symptom reported on issue #677). Best effort — never throws, never
 * breaks plugin load.
 */
function ensureMcpServerRegistered(): void {
  try {
    const bundle = resolveServerBundle();
    if (!bundle) return; // bundle missing → nothing safe to register

    const settings = _ompAdapter.readSettings() ?? {};
    const mcpServers =
      (settings.mcpServers as Record<string, unknown> | undefined) ?? {};
    if (MCP_SERVER_NAME in mcpServers) return; // already present — don't clobber

    mcpServers[MCP_SERVER_NAME] = {
      type: "stdio",
      command: "node",
      args: [bundle],
    };
    settings.mcpServers = mcpServers;
    _ompAdapter.writeSettings(settings as Record<string, unknown>);
  } catch {
    // best effort — a registration failure must never break plugin load
  }
}

function getSessionDir(): string {
  const dir = _ompAdapter.getSessionDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Issue #645 — route through the canonical per-project resolver the MCP
// server uses (src/server.ts ctx_stats / ctx_search timeline). The
// previous shared `context-mode.db` literal was a different file from
// the `<canonical-hash>.db` the server reads, so every OMP user's
// `ctx_stats` reported zero history and `ctx_search(sort: "timeline")`
// silently dropped the sort. Mirrors the matching Pi fix and the
// opencode plugin pattern (src/adapters/opencode/plugin.ts:307).
function getDBPath(projectDir: string): string {
  return resolveSessionDbPath({ projectDir, sessionsDir: getSessionDir() });
}

function getOrCreateDB(projectDir: string): SessionDB {
  // Reopen the singleton if the resolved DB path changes. See the
  // matching Pi extension comment — defensive re-keying on projectDir
  // hash keeps tests deterministic and stops a stale singleton from
  // pointing at an earlier projectDir's `<hash>.db`. (#645)
  const dbPath = getDBPath(projectDir);
  if (!_db || _dbPath !== dbPath) {
    if (_db) {
      try { _db.close(); } catch { /* best effort */ }
    }
    _db = new SessionDB({ dbPath });
    _dbPath = dbPath;
  }
  return _db;
}

/**
 * Derive a stable session ID from OMP's session manager when available,
 * otherwise fall back to a wall-clock token. Mirrors the Pi extension
 * derivation (src/adapters/pi/extension.ts:142) — the OMP `ctx` object
 * exposes `sessionManager.getSessionFile()` per refs/.../hooks/types.ts.
 */
function deriveSessionId(ctx: Record<string, unknown> | undefined): string {
  try {
    const sessionManager = (ctx as { sessionManager?: { getSessionFile?: () => string } } | undefined)
      ?.sessionManager;
    const sessionFile = sessionManager?.getSessionFile?.();
    if (sessionFile && typeof sessionFile === "string") {
      return createHash("sha256").update(sessionFile).digest("hex").slice(0, 16);
    }
  } catch {
    // best effort
  }
  return `omp-${Date.now()}`;
}

// ── Test-only state reset (NOT exported via plugin entry) ───────────
// The plugin's default export is the OMP factory; this helper is only
// imported by tests to clear singletons between cases.
export function _resetOmpPluginStateForTests(): void {
  if (_db) {
    try { _db.close(); } catch { /* best effort */ }
  }
  _db = null;
  _dbPath = "";
  _sessionId = "";
}

/**
 * Return the current session ID picked by the most recent session_start
 * handler. Test-only — production code reads `_sessionId` directly via
 * the closure. The shared SQLite DB at `~/.omp/context-mode/` survives
 * between tests, so `getLatestSessionId()` cannot disambiguate which
 * row belongs to "this" test when multiple tests insert in the same
 * second; tests use this getter instead.
 */
export function _getOmpPluginSessionIdForTests(): string {
  return _sessionId;
}

// ── HookAPI shape (local declaration; type erased at runtime) ──────
// We deliberately do NOT take a hard dependency on
// @oh-my-pi/pi-coding-agent. The runtime shape below mirrors the
// upstream HookAPI signature at refs/.../hooks/types.ts:695.
type ToolCallEvent = { toolName: string; toolCallId?: string; input?: Record<string, unknown> };
type ToolResultEvent = {
  toolName: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};
type ToolCallEventResult = { block?: boolean; reason?: string };
type HookEventCtx = Record<string, unknown> | undefined;
type HookHandler<E, R = void> = (event: E, ctx: HookEventCtx) => R | undefined | Promise<R | undefined>;

export interface MinimalHookAPI {
  on(event: "session_start", handler: HookHandler<{ type: "session_start" }>): void;
  on(event: "session_before_compact", handler: HookHandler<{ type: "session_before_compact" }>): void;
  on(event: "tool_call", handler: HookHandler<ToolCallEvent, ToolCallEventResult>): void;
  on(event: "tool_result", handler: HookHandler<ToolResultEvent>): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
}

// ── Plugin entry point ───────────────────────────────────

/**
 * OMP plugin default export. Called once by the OMP runtime per
 * upstream `extensibility/plugins/loader.ts` after `omp plugin install
 * context-mode`. Subsequent `pi.on(...)` registrations route the four
 * lifecycle events to our SessionDB-backed handlers below.
 */
export default function ompPlugin(pi: MinimalHookAPI): void {
  // OMP upstream uses PI_-prefixed env vars only (verified against
  // can1357/oh-my-pi v3.20.1 — see `packages/utils/src/dirs.ts`). The
  // earlier `OMP_PROJECT_DIR` read was an EM mistake — no upstream code
  // ever sets it. Drop it; fall through PI_PROJECT_DIR → cwd().
  const projectDir = process.env.PI_PROJECT_DIR || process.cwd();

  // Self-register the MCP server so `ctx_*` tools are reachable under the
  // plugin install path, not just the manual MCP-only path (issue #677).
  ensureMcpServerRegistered();

  const db = getOrCreateDB(projectDir);

  // ── 1. session_start — initialize session row ─────────
  pi.on("session_start", (_event, ctx) => {
    try {
      _sessionId = deriveSessionId(ctx);
      db.ensureSession(_sessionId, projectDir);
      db.cleanupOldSessions(7);
    } catch {
      // best effort — never break session start
      if (!_sessionId) {
        _sessionId = `omp-${Date.now()}`;
      }
    }
    return undefined;
  });

  // ── 2. tool_call — pre-tool-call hard-block ───────────
  // Returning `{block: true, reason}` per
  // refs/.../hooks/types.ts:566 (ToolCallEventResult) terminates the
  // tool call with the reason surfaced to the LLM.
  pi.on("tool_call", (event) => {
    try {
      const toolName = String(event?.toolName ?? "").toLowerCase();
      if (toolName !== "bash") return undefined;

      const command = String((event?.input as { command?: unknown } | undefined)?.command ?? "");
      if (!command) return undefined;

      const isBlocked = BLOCKED_BASH_PATTERNS.some((p) => p.test(command));
      if (isBlocked) {
        return {
          block: true,
          reason:
            "Use context-mode MCP tools (ctx_execute, ctx_fetch_and_index) instead of inline HTTP. " +
            "curl/wget/fetch dump raw HTTP into the context window.",
        };
      }
    } catch {
      // routing failure → allow passthrough
    }
    return undefined;
  });

  // ── 3. tool_result — post-tool-call event capture ─────
  // OMP `tool_result` payload (refs/.../hooks/types.ts:461 onward) is
  // `{toolName, toolCallId, input, content[], isError}`. We adapt to
  // the Claude Code-shaped HookInput consumed by extractEvents.
  pi.on("tool_result", (event) => {
    try {
      if (!_sessionId) return undefined;

      const rawToolName = String(event?.toolName ?? "");
      const mappedToolName = OMP_TOOL_MAP[rawToolName.toLowerCase()] ?? rawToolName;

      const content = Array.isArray(event?.content) ? event.content : [];
      const textParts = content
        .filter((c): c is { type: string; text: string } => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text);
      const resultStr = textParts.join("\n");

      const hookInput: HookInput = {
        tool_name: mappedToolName,
        tool_input: (event?.input as Record<string, unknown>) ?? {},
        tool_response: resultStr,
        tool_output: event?.isError ? { isError: true } : undefined,
      };

      const events = extractEvents(hookInput);
      for (const ev of events) {
        db.insertEvent(_sessionId, ev as SessionEvent, "PostToolUse");
      }
    } catch {
      // best effort
    }
    return undefined;
  });

  // ── 4. session_before_compact — resume snapshot ───────
  pi.on("session_before_compact", () => {
    try {
      if (!_sessionId) return undefined;
      const events = db.getEvents(_sessionId);
      const snapshot = buildResumeSnapshot(events);
      db.upsertResume(_sessionId, snapshot, events.length);
      db.incrementCompactCount(_sessionId);
    } catch {
      // best effort
    }
    return undefined;
  });
}
