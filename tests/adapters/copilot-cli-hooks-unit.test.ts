/**
 * Unit tests for copilot-cli hooks — Phase 4 testing of isContextModeHook().
 *
 * Tests the isContextModeHook() matcher which validates both:
 *   - Legacy format: scripts by file name (e.g., "pretooluse.mjs")
 *   - CLI dispatcher format: commands (e.g., "context-mode hook copilot-cli pretooluse")
 */

import { describe, it, expect } from "vitest";
import {
  isContextModeHook,
  HOOK_TYPES,
  HOOK_SCRIPTS,
  buildHookCommand,
} from "../../src/adapters/copilot-cli/hooks.js";

describe("isContextModeHook() — copilot-cli hook validation", () => {
  // ── Test data constants ───────────────────────────────

  const preToolUseScript = HOOK_SCRIPTS[HOOK_TYPES.PRE_TOOL_USE];
  const postToolUseScript = HOOK_SCRIPTS[HOOK_TYPES.POST_TOOL_USE];
  const preCompactScript = HOOK_SCRIPTS[HOOK_TYPES.PRE_COMPACT];
  const sessionStartScript = HOOK_SCRIPTS[HOOK_TYPES.SESSION_START];

  const preToolUseCliCommand = buildHookCommand(HOOK_TYPES.PRE_TOOL_USE);
  const postToolUseCliCommand = buildHookCommand(HOOK_TYPES.POST_TOOL_USE);
  const preCompactCliCommand = buildHookCommand(HOOK_TYPES.PRE_COMPACT);
  const sessionStartCliCommand = buildHookCommand(HOOK_TYPES.SESSION_START);

  // ── PreToolUse tests ──────────────────────────────────

  describe("PreToolUse hook", () => {
    it("returns true when hook command includes legacy script name (pretooluse.mjs)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: `node /some/path/${preToolUseScript}`,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(true);
    });

    it("returns true when hook command is CLI dispatcher format (context-mode hook copilot-cli pretooluse)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: preToolUseCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(true);
    });

    it("returns true when hook command includes script name in absolute path", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: `node "C:\\Users\\test\\.copilot\\hooks\\${preToolUseScript}"`,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(true);
    });

    it("returns false when hook command is unrelated", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: "node /some/other/script.mjs",
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(false);
    });

    it("returns false when hooks array is empty", () => {
      const entry = { hooks: [] };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(false);
    });

    it("returns false when hooks is undefined", () => {
      const entry = {};
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(false);
    });

    it("returns false when command is undefined", () => {
      const entry = { hooks: [{ type: "command" as const }] };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(false);
    });
  });

  // ── PostToolUse tests ─────────────────────────────────

  describe("PostToolUse hook", () => {
    it("returns true when hook command includes legacy script name (posttooluse.mjs)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: `node /path/${postToolUseScript}`,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.POST_TOOL_USE)).toBe(true);
    });

    it("returns true when hook command is CLI dispatcher format (context-mode hook copilot-cli posttooluse)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: postToolUseCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.POST_TOOL_USE)).toBe(true);
    });
  });

  // ── PreCompact tests ──────────────────────────────────

  describe("PreCompact hook", () => {
    it("returns true when hook command includes legacy script name (precompact.mjs)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: `node /path/${preCompactScript}`,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_COMPACT)).toBe(true);
    });

    it("returns true when hook command is CLI dispatcher format (context-mode hook copilot-cli precompact)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: preCompactCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_COMPACT)).toBe(true);
    });
  });

  // ── SessionStart tests ────────────────────────────────

  describe("SessionStart hook", () => {
    it("returns true when hook command includes legacy script name (sessionstart.mjs)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: `node /path/${sessionStartScript}`,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.SESSION_START)).toBe(true);
    });

    it("returns true when hook command is CLI dispatcher format (context-mode hook copilot-cli sessionstart)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: sessionStartCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.SESSION_START)).toBe(true);
    });
  });

  // ── Cross-hook mismatch tests ─────────────────────────

  describe("cross-hook mismatch scenarios", () => {
    it("returns false when entry has PreToolUse hook but PreCompact is checked", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: preToolUseCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_COMPACT)).toBe(false);
    });

    it("returns false when entry has SessionStart hook but PostToolUse is checked", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: sessionStartCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.POST_TOOL_USE)).toBe(false);
    });

    it("returns false when entry contains PreToolUse legacy script but PreCompact is checked", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: `node /path/${preToolUseScript}`,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_COMPACT)).toBe(false);
    });
  });

  // ── Multiple hooks in one entry ───────────────────────

  describe("multiple hooks in one entry", () => {
    it("returns true if ANY hook matches (first hook is match)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: preToolUseCliCommand,
          },
          {
            type: "command" as const,
            command: "unrelated-command",
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(true);
    });

    it("returns true if ANY hook matches (second hook is match)", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: "unrelated-command",
          },
          {
            type: "command" as const,
            command: preToolUseCliCommand,
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(true);
    });

    it("returns false if NO hooks match", () => {
      const entry = {
        hooks: [
          {
            type: "command" as const,
            command: "unrelated-one",
          },
          {
            type: "command" as const,
            command: "unrelated-two",
          },
        ],
      };
      expect(isContextModeHook(entry, HOOK_TYPES.PRE_TOOL_USE)).toBe(false);
    });
  });

  // ── buildHookCommand format verification ──────────────

  describe("buildHookCommand format", () => {
    it("PreToolUse produces 'context-mode hook copilot-cli pretooluse'", () => {
      const cmd = buildHookCommand(HOOK_TYPES.PRE_TOOL_USE);
      expect(cmd).toBe("context-mode hook copilot-cli pretooluse");
    });

    it("PostToolUse produces 'context-mode hook copilot-cli posttooluse'", () => {
      const cmd = buildHookCommand(HOOK_TYPES.POST_TOOL_USE);
      expect(cmd).toBe("context-mode hook copilot-cli posttooluse");
    });

    it("PreCompact produces 'context-mode hook copilot-cli precompact'", () => {
      const cmd = buildHookCommand(HOOK_TYPES.PRE_COMPACT);
      expect(cmd).toBe("context-mode hook copilot-cli precompact");
    });

    it("SessionStart produces 'context-mode hook copilot-cli sessionstart'", () => {
      const cmd = buildHookCommand(HOOK_TYPES.SESSION_START);
      expect(cmd).toBe("context-mode hook copilot-cli sessionstart");
    });
  });
});
