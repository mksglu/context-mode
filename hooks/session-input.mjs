/**
 * Hook input helpers with no dependency on the session-db bundle.
 * PreToolUse runs on every tool call, so it imports this file instead of
 * session-helpers.mjs to skip loading the bundle (#1261).
 */

import { join } from "node:path";
import { homedir } from "node:os";

/** Claude Code platform options (default). */
export const CLAUDE_OPTS = {
  configDir: ".claude",
  configDirEnv: "CLAUDE_CONFIG_DIR",
  projectDirEnv: "CLAUDE_PROJECT_DIR",
  sessionIdEnv: "CLAUDE_SESSION_ID",
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
