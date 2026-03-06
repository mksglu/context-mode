/**
 * adapters/detect — Auto-detect which platform is running.
 *
 * Detection priority:
 *   1. Environment variables (high confidence)
 *   2. Config directory existence (medium confidence)
 *   3. Fallback to Claude Code (low confidence — most common)
 *
 * Each platform sets identifiable env vars or creates config dirs:
 *   - Claude Code:  CLAUDE_PROJECT_DIR, ~/.claude/
 *   - Gemini CLI:   GEMINI_PROJECT_DIR, ~/.gemini/
 *   - OpenCode:     OPENCODE_PROJECT_DIR, .opencode/
 *   - Copilot CLI:  GITHUB_COPILOT_*, ~/.config/github-copilot/
 *   - VS Code:      VSCODE_*, ~/.vscode/
 *   - Cursor:       CURSOR_*, ~/.cursor/
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

import type { PlatformId, DetectionSignal, HookAdapter } from "./types.js";

/**
 * Detect the current platform by checking env vars and config dirs.
 */
export function detectPlatform(): DetectionSignal {
  // ── High confidence: environment variables ─────────────

  if (process.env.CLAUDE_PROJECT_DIR || process.env.CLAUDE_SESSION_ID) {
    return {
      platform: "claude-code",
      confidence: "high",
      reason: "CLAUDE_PROJECT_DIR or CLAUDE_SESSION_ID env var set",
    };
  }

  if (process.env.GEMINI_PROJECT_DIR || process.env.GEMINI_SESSION_ID) {
    return {
      platform: "gemini-cli",
      confidence: "high",
      reason: "GEMINI_PROJECT_DIR or GEMINI_SESSION_ID env var set",
    };
  }

  if (process.env.OPENCODE_PROJECT_DIR || process.env.OPENCODE_SESSION_ID ||
      process.env.OPENCODE || process.env.OPENCODE_PID) {
    return {
      platform: "opencode",
      confidence: "high",
      reason: "OPENCODE* env var set",
    };
  }

  if (process.env.GITHUB_COPILOT_AGENT || process.env.COPILOT_SESSION_ID) {
    return {
      platform: "copilot-cli",
      confidence: "high",
      reason: "GITHUB_COPILOT_AGENT or COPILOT_SESSION_ID env var set",
    };
  }

  if (process.env.VSCODE_PID || process.env.VSCODE_CWD) {
    return {
      platform: "vscode-copilot",
      confidence: "high",
      reason: "VSCODE_PID or VSCODE_CWD env var set",
    };
  }

  if (process.env.CURSOR_SESSION_ID || process.env.CURSOR_TRACE_ID) {
    return {
      platform: "cursor",
      confidence: "high",
      reason: "CURSOR_SESSION_ID or CURSOR_TRACE_ID env var set",
    };
  }

  // ── Medium confidence: config directory existence ──────

  const home = homedir();

  if (existsSync(resolve(home, ".config", "opencode"))) {
    return {
      platform: "opencode",
      confidence: "medium",
      reason: "~/.config/opencode/ directory exists",
    };
  }

  if (existsSync(resolve(home, ".claude"))) {
    return {
      platform: "claude-code",
      confidence: "medium",
      reason: "~/.claude/ directory exists",
    };
  }

  if (existsSync(resolve(home, ".gemini"))) {
    return {
      platform: "gemini-cli",
      confidence: "medium",
      reason: "~/.gemini/ directory exists",
    };
  }

  if (existsSync(resolve(home, ".cursor"))) {
    return {
      platform: "cursor",
      confidence: "medium",
      reason: "~/.cursor/ directory exists",
    };
  }

  // ── Low confidence: fallback ───────────────────────────

  return {
    platform: "claude-code",
    confidence: "low",
    reason: "No platform detected, defaulting to Claude Code",
  };
}

/**
 * Get the adapter instance for a given platform.
 * Lazily imports platform-specific adapter modules.
 */
export async function getAdapter(platform?: PlatformId): Promise<HookAdapter> {
  const target = platform ?? detectPlatform().platform;

  switch (target) {
    case "claude-code": {
      const { ClaudeCodeAdapter } = await import("./claude-code/index.js");
      return new ClaudeCodeAdapter();
    }

    case "gemini-cli": {
      const { GeminiCLIAdapter } = await import("./gemini-cli/index.js");
      return new GeminiCLIAdapter();
    }

    case "opencode": {
      const { OpenCodeAdapter } = await import("./opencode/index.js");
      return new OpenCodeAdapter();
    }

    case "codex": {
      const { CodexAdapter } = await import("./codex/index.js");
      return new CodexAdapter();
    }

    case "vscode-copilot": {
      const { VSCodeCopilotAdapter } = await import("./vscode-copilot/index.js");
      return new VSCodeCopilotAdapter();
    }

    default: {
      // Unsupported platform — fall back to Claude Code adapter
      // (MCP server works everywhere, hooks may not)
      const { ClaudeCodeAdapter } = await import("./claude-code/index.js");
      return new ClaudeCodeAdapter();
    }
  }
}
