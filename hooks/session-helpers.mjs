/**
 * Shared session helpers for context-mode hooks.
 * Used by posttooluse.mjs, precompact.mjs, sessionstart.mjs,
 * and platform-specific hooks (Gemini CLI, VS Code Copilot).
 *
 * All functions accept an optional `opts` parameter for platform-specific
 * configuration. Defaults to Claude Code settings for backward compatibility.
 *
 * ─── PATH / HASH HELPERS ARE BOUND, NOT REIMPLEMENTED ──────────────────
 * Hash + worktree-suffix + legacy migration logic lives in TypeScript at
 * `src/session/db.ts` and is bundled to `hooks/session-db.bundle.mjs` by
 * the existing esbuild step in `npm run bundle`. This file imports those
 * exports via the bundle so the JS hooks and the TS server cannot drift
 * again — the same drift that produced rounds 5 and 6 of case-fold fixes.
 *
 * Bundle-first / build-fallback resolution mirrors the pattern in
 * `session-loaders.mjs` for marketplace installs that ship `build/`
 * artifacts instead of pre-built bundles.
 */

import { join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

// ─────────────────────────────────────────────────────────
// Bundle binding — single source of truth for path/hash logic.
// ─────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadSessionDbModule() {
  // Bundle is co-located with this file in published installs.
  const bundlePath = join(__dirname, "session-db.bundle.mjs");
  if (existsSync(bundlePath)) {
    return await import(pathToFileURL(bundlePath).href);
  }
  // Marketplace fallback: build/session/db.js when bundles are absent.
  const buildPath = join(__dirname, "..", "build", "session", "db.js");
  return await import(pathToFileURL(buildPath).href);
}

const _sessionDb = await loadSessionDbModule();
const {
  ensureWritableStorageDir,
  hashProjectDirCanonical,
  hashProjectDirLegacy,
  normalizeWorktreePath,
  resolveDefaultSessionDir,
  resolveSessionStorageDir,
  resolveSessionPath: _resolveSessionPath,
  getWorktreeSuffix: _getWorktreeSuffixBundle,
} = _sessionDb;

// ─────────────────────────────────────────────────────────
// Cross-process worktree-suffix cache — hook-fork-only optimisation.
// ─────────────────────────────────────────────────────────
//
// The TS bundle's getWorktreeSuffix has an in-process cache, but every
// Pre/PostToolUse hook is a fresh `node` fork — that cache is dead on
// arrival. The marker file in tmpdir keyed by sha256(projectDir) lets
// subsequent forks short-circuit the 12-50ms `git worktree list` cost.
// The marker filename uses the canonical hash (case-folded on Mac/Win)
// so two terminals with different casing of the same physical worktree
// share one marker (and one cached suffix) — same correctness guarantee
// as the canonical DB filename.

let _wtCacheInProcess;

function workTreeMarkerPath(projectDir) {
  return join(
    tmpdir(),
    `cm-wt-${hashProjectDirCanonical(normalizeWorktreePath(projectDir))}.txt`,
  );
}

function getWorktreeSuffix(projectDir = process.cwd()) {
  const envSuffix = process.env.CONTEXT_MODE_SESSION_SUFFIX;
  const normalizedProjectDir = normalizeWorktreePath(projectDir);

  if (
    _wtCacheInProcess &&
    _wtCacheInProcess.projectDir === normalizedProjectDir &&
    _wtCacheInProcess.envSuffix === envSuffix
  ) {
    return _wtCacheInProcess.suffix;
  }

  let suffix;
  if (envSuffix !== undefined) {
    suffix = envSuffix ? `__${envSuffix}` : "";
  } else {
    // Try cross-process marker first.
    const markerPath = workTreeMarkerPath(projectDir);
    try {
      suffix = readFileSync(markerPath, "utf-8");
      _wtCacheInProcess = { projectDir: normalizedProjectDir, envSuffix, suffix };
      return suffix;
    } catch {
      // marker missing → delegate to bundle for the canonical computation.
    }

    // Single source of truth: the bundle's getWorktreeSuffix runs the
    // git subprocess, the case-fold comparison, and the suffix hashing.
    // We just persist the result so other forks can skip the git call.
    try {
      suffix = _getWorktreeSuffixBundle(projectDir);
    } catch {
      // git not available or not a git repo — no suffix
      suffix = "";
    }

    // Best-effort write so subsequent hook forks short-circuit.
    try {
      writeFileSync(markerPath, suffix, "utf-8");
    } catch {
      // tmpdir not writable — degrade gracefully
    }
  }

  _wtCacheInProcess = { projectDir: normalizedProjectDir, envSuffix, suffix };
  return suffix;
}

// ─────────────────────────────────────────────────────────
// Platform options (hook-only — the server doesn't fork hooks).
// ─────────────────────────────────────────────────────────

/** Claude Code platform options (default). */
const CLAUDE_OPTS = {
  configDir: ".claude",
  configDirEnv: "CLAUDE_CONFIG_DIR",
  projectDirEnv: "CLAUDE_PROJECT_DIR",
  sessionIdEnv: "CLAUDE_SESSION_ID",
};

/** Gemini CLI platform options. */
export const GEMINI_OPTS = {
  configDir: ".gemini",
  configDirEnv: "GEMINI_CLI_HOME",
  projectDirEnv: "GEMINI_PROJECT_DIR",
  sessionIdEnv: undefined,
};

/**
 * Antigravity CLI (`agy`) platform options. Shares the Gemini-family session
 * root (~/.gemini/context-mode/sessions). agy supplies the conversation id and
 * workspace path inside the hook payload (mapped to session_id/cwd before these
 * opts are consulted), so no env-var fallbacks are needed.
 */
export const ANTIGRAVITY_CLI_OPTS = {
  configDir: ".gemini",
  configDirEnv: undefined,
  projectDirEnv: undefined,
  sessionIdEnv: undefined,
};

/** VS Code Copilot platform options. */
export const VSCODE_OPTS = {
  configDir: ".vscode",
  configDirEnv: undefined,
  projectDirEnv: "VSCODE_CWD",
  sessionIdEnv: undefined,
};

/** GitHub Copilot CLI platform options. */
export const COPILOT_OPTS = {
  configDir: ".copilot",
  configDirEnv: "COPILOT_HOME",
  projectDirEnv: undefined,
  sessionIdEnv: undefined,
};

/** Cursor platform options. */
export const CURSOR_OPTS = {
  configDir: ".cursor",
  configDirEnv: undefined,
  projectDirEnv: "CURSOR_CWD",
  sessionIdEnv: "CURSOR_SESSION_ID",
};

/** Codex CLI platform options. */
export const CODEX_OPTS = {
  configDir: ".codex",
  configDirEnv: "CODEX_HOME",
  projectDirEnv: undefined,   // Codex passes cwd in hook stdin, no env var
  sessionIdEnv: undefined,    // Uses session_id from hook stdin or ppid fallback
};

/** Kiro CLI platform options. */
export const KIRO_OPTS = {
  configDir: ".kiro",
  configDirEnv: undefined,
  projectDirEnv: undefined,   // Kiro CLI provides cwd in hook stdin, no env var
  sessionIdEnv: undefined,    // No session ID env var — uses ppid fallback
};

/** Kimi Code CLI platform options.
 *
 * `KIMI_CODE_HOME` is documented at
 *   refs/platforms/kimi-code/docs/zh/configuration/env-vars.md:11-21
 *   refs/platforms/kimi-code/docs/en/configuration/env-vars.md:9-21
 * and is read by MoonshotAI's own first-party plugins
 *   refs/platforms/kimi-code/plugins/official/kimi-datasource/bin/
 *     kimi-datasource.mjs:207-210
 * so context-mode must honour it too — otherwise relocated Kimi installs
 * keep the user's data root at `$KIMI_CODE_HOME` while context-mode keeps
 * its session DB stranded at `~/.kimi-code/context-mode/sessions/`.
 */
export const KIMI_OPTS = {
  configDir: ".kimi-code",
  configDirEnv: "KIMI_CODE_HOME",
  projectDirEnv: undefined,   // Kimi Code passes cwd in hook stdin, no env var
  sessionIdEnv: undefined,    // Uses session_id from hook stdin or ppid fallback
};

/** JetBrains Copilot platform options. */
export const JETBRAINS_OPTS = {
  configDir: ".config/JetBrains",
  configDirEnv: undefined,
  projectDirEnv: "IDEA_INITIAL_DIRECTORY",
  sessionIdEnv: undefined,
};

/**
 * Resolve the platform config directory, respecting env var overrides.
 * Platforms like Claude Code (CLAUDE_CONFIG_DIR), Gemini CLI (GEMINI_CLI_HOME),
 * and Codex CLI (CODEX_HOME) allow users to customize the config location.
 * Falls back to ~/<configDir> when no env var is set.
 */
export function resolveConfigDir(opts = CLAUDE_OPTS) {
  if (opts.configDirEnv) {
    const envVal = process.env[opts.configDirEnv];
    if (envVal) {
      if (envVal.startsWith("~")) return join(homedir(), envVal.replace(/^~[/\\]?/, ""));
      return envVal;
    }
  }
  return join(homedir(), opts.configDir);
}

/**
 * Safely parse raw stdin string as JSON.
 * Returns empty object for empty/whitespace/BOM-only input instead of throwing.
 * Strips BOM prefix before parsing. Throws on genuinely malformed JSON.
 */
export function parseStdin(raw) {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  return cleaned ? JSON.parse(cleaned) : {};
}

/**
 * Read all of stdin as a string (event-based, cross-platform safe).
 *
 * Idle-timeout semantics (override via env `CONTEXT_MODE_HOOK_STDIN_IDLE_MS`,
 * default 1500 ms):
 * - EOF before any data \u2192 resolve("")  \u2014 the original well-behaved path.
 * - EOF after data       \u2192 resolve(buffer) with BOM strip (#139 \u2014 Cursor on
 *                          Windows can emit a leading U+FEFF that crashes
 *                          downstream JSON.parse).
 * - Idle with 0 bytes    \u2192 resolve("")  \u2014 covers hosts that hold the pipe open
 *                          without ever closing it (issue #639 \u2014 Bun re-exec
 *                          EOF path) so the hook still terminates.
 * - Idle with > 0 bytes  \u2192 reject(Error) \u2014 partial data after a stall MUST NOT
 *                          be silently truncated, otherwise downstream
 *                          JSON.parse corrupts on large `tool_response`
 *                          payloads (issue #242 \u2014 Gemini AfterTool >1MB).
 *                          Visible non-zero exit is correct here; the host
 *                          surfaces the failure in its hook diagnostics.
 */
export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    const idleMs = Number(process.env.CONTEXT_MODE_HOOK_STDIN_IDLE_MS || 1500);
    let done = false;
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
      try { process.stdin.pause(); } catch {}
      try { process.stdin.destroy?.(); } catch {}
    };
    const resolveBuffer = () => {
      if (done) return;
      done = true;
      cleanup();
      // Preserves #139 BOM strip \u2014 applies on both EOF and idle-empty paths.
      resolve(data.replace(/^\uFEFF/, ""));
    };
    const rejectIdle = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(
        `stdin idle for ${idleMs}ms with ${data.length} bytes buffered`,
      ));
    };
    const onIdle = () => {
      // Zero-buffer idle = host never wrote anything (issue #639). Resolve
      // empty so the hook can no-op. Non-zero buffer = partial data, which
      // must reject to avoid silent JSON.parse corruption (issue #242).
      if (data.length === 0) {
        resolveBuffer();
      } else {
        rejectIdle();
      }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, idleMs);
      timer.unref?.();
    };
    const onData = (chunk) => {
      data += chunk;
      arm();
    };
    const onEnd = () => resolveBuffer();
    const onError = (error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    };

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
    process.stdin.resume();
    arm();
  });
}

/**
 * Get the project directory for the current platform.
 * Uses the platform-specific env var, falls back to cwd.
 */
export function getProjectDir(opts = CLAUDE_OPTS) {
  return process.env[opts.projectDirEnv] || process.cwd();
}

/**
 * Get the project directory from hook input when available.
 * Falls back to the platform env var and finally process.cwd().
 */
export function getInputProjectDir(input, opts = CLAUDE_OPTS) {
  if (typeof input?.cwd === "string" && input.cwd.length > 0) {
    return input.cwd;
  }
  if (Array.isArray(input?.workspace_roots) && input.workspace_roots.length > 0) {
    return String(input.workspace_roots[0]);
  }
  return getProjectDir(opts);
}

/**
 * Derive session ID from hook input.
 * Priority: transcript_path UUID > sessionId (camelCase) > session_id > env var > ppid fallback.
 */
export function getSessionId(input, opts = CLAUDE_OPTS) {
  if (input.transcript_path) {
    const match = input.transcript_path.match(/([a-f0-9-]{36})\.jsonl$/);
    if (match) return match[1];
  }
  if (input.conversation_id) return input.conversation_id;
  if (input.sessionId) return input.sessionId;
  if (input.session_id) return input.session_id;
  if (opts.sessionIdEnv && process.env[opts.sessionIdEnv]) {
    return process.env[opts.sessionIdEnv];
  }
  return `pid-${process.ppid}`;
}

// ─────────────────────────────────────────────────────────
// Per-project file paths — thin wrappers around resolveSessionPath.
// ─────────────────────────────────────────────────────────

function resolveSessionDir(opts) {
  return ensureWritableStorageDir(
    resolveSessionStorageDir(() => resolveDefaultSessionDir({
      configDir: opts.configDir,
      configDirEnv: opts.configDirEnv,
    })),
  );
}

function _resolveProjectFile(opts, projectDirOverride, ext) {
  const projectDir = normalizeWorktreePath(projectDirOverride ?? getProjectDir(opts));
  const sessionsDir = resolveSessionDir(opts);
  mkdirSync(sessionsDir, { recursive: true });
  return _resolveSessionPath({
    projectDir,
    sessionsDir,
    suffix: getWorktreeSuffix(projectDir),
    ext,
  });
}

/**
 * Return the per-project session DB path.
 * Creates the directory if it doesn't exist.
 * Path: ~/<configDir>/context-mode/sessions/<canonicalHash><suffix>.db
 */
export function getSessionDBPath(opts = CLAUDE_OPTS, projectDirOverride) {
  return _resolveProjectFile(opts, projectDirOverride, ".db");
}

/**
 * Return the per-project session events file path.
 * Used by sessionstart hook (write) and MCP server (read + auto-index).
 * Path: ~/<configDir>/context-mode/sessions/<canonicalHash><suffix>-events.md
 */
export function getSessionEventsPath(opts = CLAUDE_OPTS, projectDirOverride) {
  return _resolveProjectFile(opts, projectDirOverride, "-events.md");
}

/**
 * Return the per-project cleanup flag path.
 * Used to detect true fresh starts vs --continue (which fires startup+resume).
 * Path: ~/<configDir>/context-mode/sessions/<canonicalHash><suffix>.cleanup
 */
export function getCleanupFlagPath(opts = CLAUDE_OPTS, projectDirOverride) {
  return _resolveProjectFile(opts, projectDirOverride, ".cleanup");
}

/**
 * Write the hook's response, then exit explicitly.
 *
 * On Windows, node intermittently fails to release the stdin handle
 * (nodejs/node#22999 — "50% exit, 50% don't"), so the event loop never drains
 * and the hook process outlives its parent. Windows does not reap orphaned
 * children, so they accumulate: a four-day-old install was found holding six
 * leaked hook processes. PR #719 documented the symptom ("orphaned hook
 * subprocesses accumulate") but shipped no exit() safety net. This is that net;
 * unref()/destroy() are unreliable on Windows for the same reason (#22999).
 *
 * The exit fires from the write callback, never before it: this payload IS the
 * hook's decision, and process.exit() may truncate a pipe that has not flushed.
 * A dropped `permissionDecision: "deny"` would be a silent security regression.
 *
 * IMPORTANT: this queues the write and RETURNS — the exit happens later, from
 * the callback. Call it as the last statement on the path. Any code after it
 * still runs, and a `process.exit()` there would truncate the very payload this
 * function exists to protect. Paths that write nothing must exit on their own.
 *
 * @param {object|string} payload  Object is JSON-serialized with a trailing newline.
 * @param {number} [code=0]
 */
export function flushAndExit(payload, code = 0) {
  const chunk = typeof payload === "string" ? payload : JSON.stringify(payload) + "\n";
  process.stdout.write(chunk, () => process.exit(code));
}
