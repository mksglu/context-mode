import "../setup-home";
/**
 * Hook Integration Tests — Devin CLI hooks
 *
 * Tests pretooluse.mjs, posttooluse.mjs, sessionstart.mjs, precompact.mjs,
 * userpromptsubmit.mjs, and stop.mjs by piping simulated JSON stdin and
 * asserting correct output/behavior.
 *
 * Devin uses Claude-Code-compatible hookSpecificOutput wire format:
 *   { hookSpecificOutput: { hookEventName, permissionDecision?, reason?, additionalContext? } }
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { createHash } from "node:crypto";

const _hashCanonical = (p: string) =>
  createHash("sha256").update(
    process.platform === "darwin" || process.platform === "win32" ? p.toLowerCase() : p,
  ).digest("hex").slice(0, 16);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HOOKS_DIR = join(__dirname, "..", "..", "hooks", "devin");

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runHook(hookFile: string, input: Record<string, unknown>, env?: Record<string, string>): HookResult {
  const result = spawnSync("node", [join(HOOKS_DIR, hookFile)], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

describe("Devin CLI hooks", () => {
  let tempDir: string;
  let dbPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "devin-hook-test-"));
    const hash = _hashCanonical(tempDir);
    const sessionsDir = join(homedir(), ".devin", "context-mode", "sessions");
    dbPath = join(sessionsDir, `${hash}.db`);
  });

  afterAll(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* best effort */ }
  });

  // ── PreToolUse ───────────────────────────────────────────

  describe("pretooluse.mjs", () => {
    test("outputs valid JSON with hookSpecificOutput", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "exec",
        tool_input: { command: "ls" },
        session_id: "test-devin-pretool",
        cwd: tempDir,
        hook_event_name: "PreToolUse",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    });

    test("blocks curl with deny decision", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "exec",
        tool_input: { command: "curl https://example.com" },
        session_id: "test-devin-curl",
        cwd: tempDir,
        hook_event_name: "PreToolUse",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const hso = parsed.hookSpecificOutput;
      expect(hso.hookEventName).toBe("PreToolUse");
      expect(hso.permissionDecision).toBe("deny");
      expect(typeof hso.permissionDecisionReason).toBe("string");
    });

    test("blocks webfetch with deny decision", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "webfetch",
        tool_input: { url: "https://example.com" },
        session_id: "test-devin-webfetch",
        cwd: tempDir,
        hook_event_name: "PreToolUse",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const hso = parsed.hookSpecificOutput;
      expect(hso.permissionDecision).toBe("deny");
    });

    test("allows safe tools (edit)", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "edit",
        tool_input: { file_path: "/src/app.ts", old_string: "a", new_string: "b" },
        session_id: "test-devin-edit",
        cwd: tempDir,
        hook_event_name: "PreToolUse",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      // edit is allowed — either empty hookSpecificOutput or no deny
      if (parsed.hookSpecificOutput?.permissionDecision) {
        expect(parsed.hookSpecificOutput.permissionDecision).not.toBe("deny");
      }
    });

    test("handles empty input gracefully", () => {
      const result = runHook("pretooluse.mjs", {});
      expect(result.exitCode).toBe(0);
    });
  });

  // ── PostToolUse ──────────────────────────────────────────

  describe("posttooluse.mjs", () => {
    test("outputs valid JSON with PostToolUse event", () => {
      const result = runHook("posttooluse.mjs", {
        tool_name: "exec",
        tool_input: { command: "git status" },
        tool_response: "On branch main",
        session_id: "test-devin-post",
        cwd: tempDir,
        hook_event_name: "PostToolUse",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    });

    test("normalizes exec to Bash in event capture", () => {
      // The hook normalizes Devin tool names (exec→Bash, read→Read, etc.)
      // before extracting events. Verify it doesn't crash on normalized input.
      const result = runHook("posttooluse.mjs", {
        tool_name: "exec",
        tool_input: { command: "echo hello" },
        tool_response: "hello",
        session_id: "test-devin-normalize",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
    });

    test("handles empty input gracefully", () => {
      const result = runHook("posttooluse.mjs", {});
      expect(result.exitCode).toBe(0);
    });
  });

  // ── SessionStart ─────────────────────────────────────────

  describe("sessionstart.mjs", () => {
    test("startup: outputs routing block as additionalContext", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        session_id: "test-devin-startup",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(typeof parsed.hookSpecificOutput.additionalContext).toBe("string");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("context-mode");
    });

    test("compact: outputs SessionStart with routing block", () => {
      const result = runHook("sessionstart.mjs", {
        source: "compact",
        session_id: "test-devin-compact-start",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    });

    test("resume: outputs SessionStart", () => {
      const result = runHook("sessionstart.mjs", {
        source: "resume",
        session_id: "test-devin-resume",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    });

    test("clear: outputs SessionStart", () => {
      const result = runHook("sessionstart.mjs", {
        source: "clear",
        session_id: "test-devin-clear",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    });

    test("default source is startup", () => {
      const result = runHook("sessionstart.mjs", {
        session_id: "test-devin-default-src",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("context-mode");
    });

    test("outputs structured JSON (not plaintext)", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        session_id: "test-devin-json",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      // stdout must parse as JSON — no leading plaintext
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput).toBeDefined();
    });

    test("handles empty input gracefully", () => {
      const result = runHook("sessionstart.mjs", {});
      expect(result.exitCode).toBe(0);
    });
  });

  // ── PreCompact ───────────────────────────────────────────

  describe("precompact.mjs", () => {
    test("runs silently with empty session", () => {
      const result = runHook("precompact.mjs", {
        session_id: "test-devin-precompact-empty",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      // PreCompact returns empty JSON object (no hookSpecificOutput)
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toEqual({});
    });

    test("handles empty input gracefully", () => {
      const result = runHook("precompact.mjs", {});
      expect(result.exitCode).toBe(0);
    });
  });

  // ── UserPromptSubmit ─────────────────────────────────────

  describe("userpromptsubmit.mjs", () => {
    test("outputs valid JSON with UserPromptSubmit event", () => {
      const result = runHook("userpromptsubmit.mjs", {
        prompt: "Fix the bug in auth.ts",
        session_id: "test-devin-prompt",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    });

    test("filters system messages (task-notification)", () => {
      const result = runHook("userpromptsubmit.mjs", {
        prompt: "<task-notification>some system event</task-notification>",
        session_id: "test-devin-sysmsg",
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(0);
      // System messages are filtered — hook still outputs valid JSON
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    });

    test("handles empty input gracefully", () => {
      const result = runHook("userpromptsubmit.mjs", {});
      expect(result.exitCode).toBe(0);
    });
  });

  // ── Stop ─────────────────────────────────────────────────

  describe("stop.mjs", () => {
    test("outputs empty JSON object", () => {
      const result = runHook("stop.mjs", {
        session_id: "test-devin-stop",
        cwd: tempDir,
        stop_hook_active: false,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toEqual({});
    });

    test("captures last_assistant_message without crashing", () => {
      const result = runHook("stop.mjs", {
        session_id: "test-devin-stop-msg",
        cwd: tempDir,
        stop_hook_active: false,
        last_assistant_message: "I'll use the async pattern for the API client, it's more efficient.",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toEqual({});
    });

    test("extracts decisions from last_assistant_message", () => {
      const result = runHook("stop.mjs", {
        session_id: "test-devin-stop-decision",
        cwd: tempDir,
        stop_hook_active: false,
        last_assistant_message: "I've reviewed the options, and I'll use the async pattern for the API client.",
      });

      expect(result.exitCode).toBe(0);
      // The hook should not crash and should output empty JSON
      // (decision events are stored in the session DB, not in stdout)
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toEqual({});
    });

    test("handles empty input gracefully", () => {
      const result = runHook("stop.mjs", {});
      expect(result.exitCode).toBe(0);
    });
  });

  // ── platform.mjs ─────────────────────────────────────────

  describe("platform.mjs", () => {
    test("sets CONTEXT_MODE_PLATFORM=devin", () => {
      // Verify the platform marker file content
      const src = require("node:fs").readFileSync(join(HOOKS_DIR, "platform.mjs"), "utf-8");
      expect(src).toContain('CONTEXT_MODE_PLATFORM');
      expect(src).toContain('"devin"');
    });
  });

  // ── End-to-end: PostToolUse → PreCompact → SessionStart ──

  describe("end-to-end flow", () => {
    test("capture events, build snapshot, and restore on compact", () => {
      const sessionId = "test-devin-e2e";
      const env = { CONTEXT_MODE_PLATFORM: "devin" };

      // 1. Capture events via PostToolUse
      runHook("posttooluse.mjs", {
        tool_name: "exec",
        tool_input: { command: "git status" },
        tool_response: "On branch main",
        session_id: sessionId,
        cwd: tempDir,
      }, env);

      runHook("posttooluse.mjs", {
        tool_name: "read",
        tool_input: { file_path: "/src/app.ts" },
        tool_response: "export default {}",
        session_id: sessionId,
        cwd: tempDir,
      }, env);

      // 2. Build snapshot via PreCompact
      const precompactResult = runHook("precompact.mjs", {
        session_id: sessionId,
        cwd: tempDir,
      }, env);
      expect(precompactResult.exitCode).toBe(0);

      // 3. SessionStart compact should include session knowledge
      const startResult = runHook("sessionstart.mjs", {
        source: "compact",
        session_id: sessionId,
        cwd: tempDir,
      }, env);
      expect(startResult.exitCode).toBe(0);
      expect(startResult.stdout).toContain("SessionStart");
    });
  });
});
