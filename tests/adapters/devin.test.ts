import "../setup-home";
import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DevinAdapter } from "../../src/adapters/devin/index.js";
import { resolveSessionDbPath, SessionDB } from "../../src/session/db.js";

describe("DevinAdapter", () => {
  let adapter: DevinAdapter;

  beforeEach(() => {
    adapter = new DevinAdapter();
  });

  // ── Capabilities ──────────────────────────────────────

  describe("capabilities", () => {
    it("preToolUse is true", () => {
      expect(adapter.capabilities.preToolUse).toBe(true);
    });

    it("postToolUse is true", () => {
      expect(adapter.capabilities.postToolUse).toBe(true);
    });

    it("sessionStart is true", () => {
      expect(adapter.capabilities.sessionStart).toBe(true);
    });

    it("preCompact is true", () => {
      expect(adapter.capabilities.preCompact).toBe(true);
    });

    it("canModifyArgs is false (Devin does not document updatedInput)", () => {
      expect(adapter.capabilities.canModifyArgs).toBe(false);
    });

    it("canModifyOutput is false", () => {
      expect(adapter.capabilities.canModifyOutput).toBe(false);
    });

    it("canInjectSessionContext is true", () => {
      expect(adapter.capabilities.canInjectSessionContext).toBe(true);
    });

    it("paradigm is json-stdio", () => {
      expect(adapter.paradigm).toBe("json-stdio");
    });

    it("name is 'Devin CLI'", () => {
      expect(adapter.name).toBe("Devin CLI");
    });
  });

  // ── parsePreToolUseInput ──────────────────────────────

  describe("parsePreToolUseInput", () => {
    it("extracts tool_name from input", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "exec",
        tool_input: { command: "ls" },
        session_id: "s1",
        cwd: "/tmp",
        hook_event_name: "PreToolUse",
      });
      expect(event.toolName).toBe("exec");
      expect(event.toolInput).toEqual({ command: "ls" });
      expect(event.sessionId).toBe("s1");
      expect(event.projectDir).toBe("/tmp");
    });

    it("defaults toolName to empty string when missing", () => {
      const event = adapter.parsePreToolUseInput({});
      expect(event.toolName).toBe("");
      expect(event.toolInput).toEqual({});
    });

    it("extracts projectDir from cwd field", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "exec",
        cwd: "C:\\Users\\test\\project",
      });
      expect(event.projectDir).toBe("C:\\Users\\test\\project");
    });
  });

  // ── parsePostToolUseInput ─────────────────────────────

  describe("parsePostToolUseInput", () => {
    it("extracts tool_response as toolOutput", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "exec",
        tool_response: "hello world",
        session_id: "s1",
        cwd: "/tmp",
      });
      expect(event.toolOutput).toBe("hello world");
      expect(event.toolName).toBe("exec");
    });

    it("toolOutput is undefined when tool_response missing", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "exec",
      });
      expect(event.toolOutput).toBeUndefined();
    });
  });

  // ── parseSessionStartInput ────────────────────────────

  describe("parseSessionStartInput", () => {
    it("defaults to startup source", () => {
      const event = adapter.parseSessionStartInput({});
      expect(event.source).toBe("startup");
    });

    it("maps compact source", () => {
      const event = adapter.parseSessionStartInput({ source: "compact" });
      expect(event.source).toBe("compact");
    });

    it("maps resume source", () => {
      const event = adapter.parseSessionStartInput({ source: "resume" });
      expect(event.source).toBe("resume");
    });

    it("maps clear source", () => {
      const event = adapter.parseSessionStartInput({ source: "clear" });
      expect(event.source).toBe("clear");
    });
  });

  // ── formatPreToolUseResponse ──────────────────────────

  describe("formatPreToolUseResponse", () => {
    it("formats deny with permissionDecision and reason", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "deny",
        reason: "Blocked by security policy",
      }) as Record<string, unknown>;
      const hso = result.hookSpecificOutput as Record<string, unknown>;
      expect(hso.hookEventName).toBe("PreToolUse");
      expect(hso.permissionDecision).toBe("deny");
      expect(hso.permissionDecisionReason).toBe("Blocked by security policy");
    });

    it("formats deny with default reason when reason missing", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "deny",
      }) as Record<string, unknown>;
      const hso = result.hookSpecificOutput as Record<string, unknown>;
      expect(hso.permissionDecisionReason).toBe("Blocked by context-mode hook");
    });

    it("formats context with additionalContext", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "context",
        additionalContext: "Use ctx_execute instead",
      }) as Record<string, unknown>;
      const hso = result.hookSpecificOutput as Record<string, unknown>;
      expect(hso.hookEventName).toBe("PreToolUse");
      expect(hso.additionalContext).toBe("Use ctx_execute instead");
    });

    it("returns empty object for allow", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "allow",
      });
      expect(result).toEqual({});
    });
  });

  // ── formatPostToolUseResponse ─────────────────────────

  describe("formatPostToolUseResponse", () => {
    it("formats additionalContext", () => {
      const result = adapter.formatPostToolUseResponse({
        additionalContext: "Post-tool context",
      }) as Record<string, unknown>;
      const hso = result.hookSpecificOutput as Record<string, unknown>;
      expect(hso.hookEventName).toBe("PostToolUse");
      expect(hso.additionalContext).toBe("Post-tool context");
    });

    it("returns empty object when no additionalContext", () => {
      const result = adapter.formatPostToolUseResponse({});
      expect(result).toEqual({});
    });
  });

  // ── formatSessionStartResponse ────────────────────────

  describe("formatSessionStartResponse", () => {
    it("formats context", () => {
      const result = adapter.formatSessionStartResponse({
        context: "Session start context",
      }) as Record<string, unknown>;
      const hso = result.hookSpecificOutput as Record<string, unknown>;
      expect(hso.hookEventName).toBe("SessionStart");
      expect(hso.additionalContext).toBe("Session start context");
    });

    it("returns empty object when no context", () => {
      const result = adapter.formatSessionStartResponse({});
      expect(result).toEqual({});
    });
  });

  // ── Configuration ─────────────────────────────────────

  describe("configuration", () => {
    it("getConfigDir returns ~/.devin by default", () => {
      const dir = adapter.getConfigDir();
      expect(dir).toBe(join(homedir(), ".devin"));
    });

    it("getConfigDir honors DEVIN_HOME env var", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "devin-home-"));
      try {
        process.env.DEVIN_HOME = tmpDir;
        const dir = adapter.getConfigDir();
        expect(dir).toBe(resolve(tmpDir));
      } finally {
        delete process.env.DEVIN_HOME;
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("getSettingsPath returns config.json in config dir", () => {
      const path = adapter.getSettingsPath();
      expect(path).toBe(join(homedir(), ".devin", "config.json"));
    });

    it("getInstructionFiles returns AGENTS.md", () => {
      const files = adapter.getInstructionFiles();
      expect(files).toEqual(["AGENTS.md"]);
    });
  });

  // ── generateHookConfig ────────────────────────────────

  describe("generateHookConfig", () => {
    it("generates all 6 hook events", () => {
      const config = adapter.generateHookConfig("/tmp/plugin");
      expect(Object.keys(config).sort()).toEqual(
        ["PostToolUse", "PreCompact", "PreToolUse", "SessionStart", "Stop", "UserPromptSubmit"].sort(),
      );
    });

    it("PreToolUse has a matcher with Devin tool names", () => {
      const config = adapter.generateHookConfig("/tmp/plugin");
      const preToolUse = config.PreToolUse;
      expect(preToolUse).toBeDefined();
      expect(preToolUse[0].matcher).toContain("exec");
      expect(preToolUse[0].matcher).toContain("read");
      expect(preToolUse[0].matcher).toContain("grep");
      expect(preToolUse[0].matcher).toContain("webfetch");
    });

    it("hook commands use node.exe path (not .cmd shim)", () => {
      const config = adapter.generateHookConfig("/tmp/plugin");
      for (const [, entries] of Object.entries(config)) {
        for (const entry of entries) {
          for (const hook of entry.hooks) {
            // Commands should be in the form: "<nodePath>" "<scriptPath>"
            expect(hook.command).toMatch(/^".+" ".+"$/);
            expect(hook.command).not.toContain(".cmd");
          }
        }
      }
    });
  });

  // ── readSettings / writeSettings ──────────────────────

  describe("readSettings / writeSettings", () => {
    it("returns null when config.json does not exist", () => {
      const result = adapter.readSettings();
      expect(result).toBeNull();
    });

    it("writes and reads back settings", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "devin-config-"));
      try {
        process.env.DEVIN_HOME = tmpDir;
        adapter.writeSettings({ test: "value", nested: { key: 123 } });
        const read = adapter.readSettings();
        expect(read).toEqual({ test: "value", nested: { key: 123 } });
      } finally {
        delete process.env.DEVIN_HOME;
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ── checkPluginRegistration ───────────────────────────

  describe("checkPluginRegistration", () => {
    it("returns warn when config.json does not exist", () => {
      const result = adapter.checkPluginRegistration();
      expect(result.status).toBe("warn");
    });

    it("returns pass when context-mode is registered in mcpServers", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "devin-config-"));
      try {
        process.env.DEVIN_HOME = tmpDir;
        adapter.writeSettings({
          mcpServers: {
            "context-mode": { command: "node", transport: "stdio" },
          },
        });
        const result = adapter.checkPluginRegistration();
        expect(result.status).toBe("pass");
      } finally {
        delete process.env.DEVIN_HOME;
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns fail when context-mode is not in mcpServers", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "devin-config-"));
      try {
        process.env.DEVIN_HOME = tmpDir;
        adapter.writeSettings({ mcpServers: {} });
        const result = adapter.checkPluginRegistration();
        expect(result.status).toBe("fail");
      } finally {
        delete process.env.DEVIN_HOME;
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ── getInstalledVersion ───────────────────────────────

  describe("getInstalledVersion", () => {
    it("returns 'standalone' (Devin has no plugin marketplace)", () => {
      expect(adapter.getInstalledVersion()).toBe("standalone");
    });
  });
});
