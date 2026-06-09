import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { QoderAdapter } from "../../src/adapters/qoder/index.js";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), "tests", "fixtures", "qoder", name), "utf-8"),
  ) as Record<string, unknown>;

describe("QoderAdapter", () => {
  let adapter: QoderAdapter;

  beforeEach(() => {
    adapter = new QoderAdapter();
  });

  describe("capabilities", () => {
    it("enables PreToolUse + PostToolUse without SessionStart/PreCompact", () => {
      expect(adapter.capabilities.preToolUse).toBe(true);
      expect(adapter.capabilities.postToolUse).toBe(true);
      expect(adapter.capabilities.preCompact).toBe(false);
      expect(adapter.capabilities.sessionStart).toBe(false);
      expect(adapter.capabilities.canModifyArgs).toBe(true);
      expect(adapter.capabilities.canModifyOutput).toBe(false);
      expect(adapter.capabilities.canInjectSessionContext).toBe(true);
    });

    it("paradigm is json-stdio", () => {
      expect(adapter.paradigm).toBe("json-stdio");
    });

    it("name is Qoder", () => {
      expect(adapter.name).toBe("Qoder");
    });
  });

  describe("parsePreToolUseInput", () => {
    it("parses Bash tool fixture", () => {
      const event = adapter.parsePreToolUseInput(fixture("pretooluse-bash.json"));
      expect(event.toolName).toBe("Bash");
      expect(event.toolInput).toEqual({ command: "curl https://example.com/api" });
      expect(event.sessionId).toBe("qoder-session-001");
      expect(event.projectDir).toBe("/tmp/qoder-project");
    });

    it("extracts session_id from input", () => {
      const event = adapter.parsePreToolUseInput({
        session_id: "test-123",
        tool_name: "Read",
        tool_input: { file_path: "/tmp/file.txt" },
        cwd: "/project",
      });
      expect(event.sessionId).toBe("test-123");
    });

    it("falls back to QODER_SESSION_ID env var", () => {
      const orig = process.env.QODER_SESSION_ID;
      process.env.QODER_SESSION_ID = "env-session-456";
      try {
        const event = adapter.parsePreToolUseInput({
          tool_name: "Read",
          tool_input: {},
          cwd: "/project",
        });
        expect(event.sessionId).toBe("env-session-456");
      } finally {
        if (orig !== undefined) {
          process.env.QODER_SESSION_ID = orig;
        } else {
          delete process.env.QODER_SESSION_ID;
        }
      }
    });

    it("falls back to pid-based sessionId", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "Read",
        tool_input: {},
        cwd: "/project",
      });
      expect(event.sessionId).toBe(`pid-${process.ppid}`);
    });

    it("uses cwd from input for projectDir", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "Bash",
        tool_input: {},
        cwd: "/my/project",
      });
      expect(event.projectDir).toBe("/my/project");
    });
  });

  describe("parsePostToolUseInput", () => {
    it("parses tool output fixture", () => {
      const event = adapter.parsePostToolUseInput(fixture("posttooluse-bash.json"));
      expect(event.toolName).toBe("Bash");
      expect(event.toolOutput).toContain("package.json");
    });

    it("handles non-string tool_response", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "Read",
        tool_input: {},
        tool_response: { content: "file contents" },
        cwd: "/project",
      });
      expect(event.toolOutput).toBe('{"content":"file contents"}');
    });

    it("returns empty string when tool_response is undefined", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "Read",
        tool_input: {},
        cwd: "/project",
      });
      expect(event.toolOutput).toBe("");
    });

    it("returns empty string when tool_response is null", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "Read",
        tool_input: {},
        tool_response: null,
        cwd: "/project",
      });
      expect(event.toolOutput).toBe("");
    });
  });

  describe("formatPreToolUseResponse", () => {
    it("formats deny with hookSpecificOutput", () => {
      expect(
        adapter.formatPreToolUseResponse({ decision: "deny", reason: "Blocked" }),
      ).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Blocked",
        },
      });
    });

    it("formats ask with permissionDecision ask", () => {
      expect(adapter.formatPreToolUseResponse({ decision: "ask" })).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
        },
      });
    });

    it("formats modify with updatedInput", () => {
      const updatedInput = { file_path: "/new/path" };
      expect(
        adapter.formatPreToolUseResponse({ decision: "modify", updatedInput }),
      ).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput,
        },
      });
    });

    it("formats Bash redirect modify as deny", () => {
      expect(
        adapter.formatPreToolUseResponse({
          decision: "modify",
          updatedInput: { command: 'echo "Use ctx_execute instead"' },
        }),
      ).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Use ctx_execute instead",
        },
      });
    });

    it("formats context with additionalContext", () => {
      expect(
        adapter.formatPreToolUseResponse({
          decision: "context",
          additionalContext: "Use sandbox tools.",
        }),
      ).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: "Use sandbox tools.",
        },
      });
    });

    it("returns undefined for allow", () => {
      expect(
        adapter.formatPreToolUseResponse({ decision: "allow" }),
      ).toBeUndefined();
    });
  });

  describe("formatPostToolUseResponse", () => {
    it("formats additionalContext", () => {
      expect(
        adapter.formatPostToolUseResponse({ additionalContext: "Captured." }),
      ).toEqual({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: "Captured.",
        },
      });
    });

    it("returns undefined when no context", () => {
      expect(adapter.formatPostToolUseResponse({})).toBeUndefined();
    });
  });

  describe("config paths", () => {
    it("settings path is .qoder/settings.json", () => {
      expect(adapter.getSettingsPath()).toBe(resolve(".qoder", "settings.json"));
    });

    it("config dir is .qoder under project dir", () => {
      expect(adapter.getConfigDir("/my/project")).toBe(resolve("/my/project", ".qoder"));
    });

    it("session dir is under ~/.qoder/context-mode/sessions/", () => {
      expect(adapter.getSessionDir()).toBe(
        join(homedir(), ".qoder", "context-mode", "sessions"),
      );
    });

    it("instruction files returns QODER.md", () => {
      expect(adapter.getInstructionFiles()).toEqual(["QODER.md"]);
    });
  });

  describe("hook config management", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "qoder-adapter-test-"));
      Object.defineProperty(adapter, "getSettingsPath", {
        value: () => join(tempDir, "settings.json"),
        configurable: true,
      });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("generates hook config for 4 events", () => {
      const config = adapter.generateHookConfig("/plugin/root") as Record<string, unknown>;
      expect(Object.keys(config).sort()).toEqual([
        "PostToolUse",
        "PreToolUse",
        "Stop",
        "UserPromptSubmit",
      ]);
    });

    it("configureAllHooks writes settings.json with hooks", () => {
      const changes = adapter.configureAllHooks("/plugin/root");
      const written = JSON.parse(
        readFileSync(join(tempDir, "settings.json"), "utf-8"),
      ) as Record<string, unknown>;

      expect(changes.length).toBeGreaterThan(0);
      expect(written.hooks).toBeTruthy();

      const hooks = written.hooks as Record<string, Array<Record<string, unknown>>>;
      expect(hooks.PreToolUse).toBeDefined();
      expect(hooks.PostToolUse).toBeDefined();
      expect(hooks.Stop).toBeDefined();
      expect(hooks.UserPromptSubmit).toBeDefined();

      const preEntry = hooks.PreToolUse[0] as Record<string, unknown>;
      expect(String(preEntry.matcher)).toContain("Bash");
    });

    it("configureAllHooks is idempotent and skips write when no changes", () => {
      const firstChanges = adapter.configureAllHooks("/plugin/root");
      const first = readFileSync(join(tempDir, "settings.json"), "utf-8");
      const secondChanges = adapter.configureAllHooks("/plugin/root");
      const second = readFileSync(join(tempDir, "settings.json"), "utf-8");
      expect(first).toBe(second);
      expect(firstChanges.length).toBeGreaterThan(0);
      expect(secondChanges).toEqual([]);
    });

    it("validateHooks passes when hooks configured", () => {
      adapter.configureAllHooks("/plugin/root");
      const results = adapter.validateHooks("/plugin/root");
      const preResult = results.find((r) => r.check === "PreToolUse");
      expect(preResult?.status).toBe("pass");
    });

    it("validateHooks fails when no settings", () => {
      const results = adapter.validateHooks("/plugin/root");
      expect(results[0]?.status).toBe("fail");
    });
  });

  describe("stop hook", () => {
    it("parseStopInput extracts session info", () => {
      const event = adapter.parseStopInput({
        session_id: "stop-session-1",
        last_assistant_message: "Task completed.",
      });
      expect(event.sessionId).toBe("stop-session-1");
      expect(event.lastMessage).toBe("Task completed.");
    });

    it("formatStopResponse with followup returns block", () => {
      expect(
        adapter.formatStopResponse({ followupMessage: "keep going" }),
      ).toEqual({ decision: "block", reason: "keep going" });
    });

    it("formatStopResponse without followup returns empty", () => {
      expect(adapter.formatStopResponse({})).toEqual({});
    });
  });
});
