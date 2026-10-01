import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { GeminiCLIAdapter } from "../../src/adapters/gemini-cli/index.js";
import {
  HOOK_TYPES,
  HOOK_SCRIPTS,
  buildHookCommand,
} from "../../src/adapters/gemini-cli/hooks.js";

describe("GeminiCLIAdapter", () => {
  let adapter: GeminiCLIAdapter;

  beforeEach(() => {
    adapter = new GeminiCLIAdapter();
  });

  it("refreshes its command without deleting sibling hooks or entry metadata", () => {
    const guard = { type: "command", command: "node policy-check.mjs", timeout: 15000 };
    const audit = { type: "command", command: "node audit-event.mjs" };
    adapter.writeSettings({
      retained: { enabled: true },
      hooks: {
        [HOOK_TYPES.BEFORE_TOOL]: [{
          matcher: "run_shell_command",
          sequential: true,
          hooks: [guard, {
            type: "command",
            command: "node /old/context-mode/hooks/gemini-cli/beforetool.mjs",
            timeout: 30000,
          }, audit],
        }],
      },
    });

    adapter.configureAllHooks("/new/context-mode");
    const written = adapter.readSettings()!;
    const hooks = written.hooks as Record<string, unknown[]>;
    expect(hooks[HOOK_TYPES.BEFORE_TOOL]).toEqual([{
      matcher: "run_shell_command",
      sequential: true,
      hooks: [guard, {
        type: "command",
        command: buildHookCommand(HOOK_TYPES.BEFORE_TOOL, "/new/context-mode"),
        timeout: 30000,
      }, audit],
    }]);
    expect(written.retained).toEqual({ enabled: true });
    expect(adapter.configureAllHooks("/new/context-mode")).toEqual([]);
  });

  it.each([HOOK_TYPES.BEFORE_AGENT, HOOK_TYPES.BEFORE_TOOL, HOOK_TYPES.SESSION_START])(
    "preserves separate %s registrations while adding its hook",
    (hookType) => {
      const external = {
        matcher: "company-tool",
        sequential: true,
        hooks: [{ type: "command", command: "node company-policy.mjs", timeout: 15000 }],
      };
      adapter.writeSettings({ hooks: { [hookType]: [external] } });
      adapter.configureAllHooks("/new/context-mode");
      const hooks = adapter.readSettings()!.hooks as Record<string, unknown[]>;
      expect(hooks[hookType]).toEqual([external, {
        matcher: "",
        hooks: [{ type: "command", command: buildHookCommand(hookType, "/new/context-mode") }],
      }]);
      expect(adapter.configureAllHooks("/new/context-mode")).toEqual([]);
    },
  );

  it("does not mistake a context-mode audit callback for its own hook", () => {
    const external = {
      type: "command",
      command: "node /company/context-mode-audit.mjs --tag beforetool.mjs",
      timeout: 15000,
    };
    const pathArgument = {
      type: "command",
      command: "node /company/audit.mjs --tag /context-mode/hooks/gemini-cli/beforetool.mjs",
    };
    adapter.writeSettings({ hooks: {
      [HOOK_TYPES.BEFORE_TOOL]: [{ matcher: "", hooks: [external, pathArgument, {
        type: "command",
        command: "node /old/context-mode/hooks/gemini-cli/beforetool.mjs",
      }] }],
    } });
    adapter.configureAllHooks("/new/context-mode");
    const hooks = adapter.readSettings()!.hooks as Record<string, Array<{ hooks: unknown[] }>>;
    expect(hooks[HOOK_TYPES.BEFORE_TOOL][0].hooks).toEqual([external, pathArgument, {
      type: "command",
      command: buildHookCommand(HOOK_TYPES.BEFORE_TOOL, "/new/context-mode"),
    }]);
  });

  it.each([
    '"C:/Program Files/nodejs/node.exe" "C:/Users/Rudy/context-mode/hooks/gemini-cli/beforetool.mjs"',
    "bun '/old/context-mode/hooks/gemini-cli/beforetool.mjs'",
    "context-mode hook gemini-cli beforetool",
  ])("refreshes a known legacy command without duplicating custom install hooks: %s", (legacy) => {
    adapter.writeSettings({ hooks: {
      [HOOK_TYPES.BEFORE_TOOL]: [{ matcher: "", hooks: [{
        type: "command", command: legacy, timeout: 30000,
      }] }],
    } });
    adapter.configureAllHooks("/custom/installation");
    const hooks = adapter.readSettings()!.hooks as Record<string, Array<{ hooks: unknown[] }>>;
    expect(hooks[HOOK_TYPES.BEFORE_TOOL]).toEqual([{ matcher: "", hooks: [{
      type: "command", command: buildHookCommand(HOOK_TYPES.BEFORE_TOOL, "/custom/installation"), timeout: 30000,
    }] }]);
    expect(adapter.configureAllHooks("/custom/installation")).toEqual([]);
  });

  // ── Capabilities ──────────────────────────────────────

  describe("capabilities", () => {
    it("has all capabilities enabled", () => {
      expect(adapter.capabilities.preToolUse).toBe(true);
      expect(adapter.capabilities.postToolUse).toBe(true);
      expect(adapter.capabilities.preCompact).toBe(true);
      expect(adapter.capabilities.sessionStart).toBe(true);
      expect(adapter.capabilities.canModifyArgs).toBe(true);
      expect(adapter.capabilities.canModifyOutput).toBe(true);
      expect(adapter.capabilities.canInjectSessionContext).toBe(true);
    });

    it("paradigm is json-stdio", () => {
      expect(adapter.paradigm).toBe("json-stdio");
    });
  });

  // ── parsePreToolUseInput ──────────────────────────────

  describe("parsePreToolUseInput", () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      savedEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = savedEnv;
    });

    it("extracts toolName from tool_name", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
        tool_input: { command: "ls" },
      });
      expect(event.toolName).toBe("shell");
    });

    it("uses GEMINI_PROJECT_DIR for projectDir", () => {
      process.env.GEMINI_PROJECT_DIR = "/gemini/project";
      delete process.env.CLAUDE_PROJECT_DIR;
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
      });
      expect(event.projectDir).toBe("/gemini/project");
    });

    it("falls back to CLAUDE_PROJECT_DIR for projectDir", () => {
      delete process.env.GEMINI_PROJECT_DIR;
      process.env.CLAUDE_PROJECT_DIR = "/claude/project";
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
      });
      expect(event.projectDir).toBe("/claude/project");
    });

    it("prefers input.cwd over env vars when both provided", () => {
      process.env.GEMINI_PROJECT_DIR = "/env/gemini";
      process.env.CLAUDE_PROJECT_DIR = "/env/claude";
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
        cwd: "/wire/cwd",
      } as unknown as Record<string, unknown>);
      expect(event.projectDir).toBe("/wire/cwd");
    });

    it("falls back to process.cwd() when wire cwd and env both missing", () => {
      delete process.env.GEMINI_PROJECT_DIR;
      delete process.env.CLAUDE_PROJECT_DIR;
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
      });
      expect(event.projectDir).toBe(process.cwd());
    });

    it("post/precompact/sessionstart parsers also fall back to process.cwd()", () => {
      delete process.env.GEMINI_PROJECT_DIR;
      delete process.env.CLAUDE_PROJECT_DIR;
      const post = adapter.parsePostToolUseInput({ tool_name: "shell" });
      expect(post.projectDir).toBe(process.cwd());

      const compact = adapter.parsePreCompactInput({ session_id: "s1" });
      expect(compact.projectDir).toBe(process.cwd());

      const start = adapter.parseSessionStartInput({ session_id: "s1" });
      expect(start.projectDir).toBe(process.cwd());
    });

    it("extracts sessionId from session_id field", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
        session_id: "gemini-session-abc",
      });
      expect(event.sessionId).toBe("gemini-session-abc");
    });

    it("falls back to pid when no session_id", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
      });
      expect(event.sessionId).toBe(`pid-${process.ppid}`);
    });
  });

  // ── formatPreToolUseResponse ──────────────────────────

  describe("formatPreToolUseResponse", () => {
    it("formats deny with decision:'deny' NOT permissionDecision", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "deny",
        reason: "Blocked",
      });
      expect(result).toEqual({
        decision: "deny",
        reason: "Blocked",
      });
      // KEY DIFFERENCE: should NOT have permissionDecision
      expect(result).not.toHaveProperty("permissionDecision");
    });

    it("formats modify with hookSpecificOutput.tool_input", () => {
      const updatedInput = { command: "echo hello" };
      const result = adapter.formatPreToolUseResponse({
        decision: "modify",
        updatedInput,
      });
      expect(result).toEqual({
        hookSpecificOutput: {
          tool_input: updatedInput,
        },
      });
    });

    it("returns undefined for allow", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "allow",
      });
      expect(result).toBeUndefined();
    });
  });

  // ── formatPostToolUseResponse ─────────────────────────

  describe("formatPostToolUseResponse", () => {
    it("formats updatedOutput with decision:'deny' and reason", () => {
      const result = adapter.formatPostToolUseResponse({
        updatedOutput: "Replaced output",
      });
      expect(result).toEqual({
        decision: "deny",
        reason: "Replaced output",
      });
    });

    it("formats additionalContext with hookSpecificOutput.additionalContext", () => {
      const result = adapter.formatPostToolUseResponse({
        additionalContext: "Extra context",
      });
      expect(result).toEqual({
        hookSpecificOutput: {
          additionalContext: "Extra context",
        },
      });
    });

    it("returns undefined for empty response", () => {
      const result = adapter.formatPostToolUseResponse({});
      expect(result).toBeUndefined();
    });
  });

  // ── Config paths ──────────────────────────────────────

  describe("config paths", () => {
    it("settings path is ~/.gemini/settings.json", () => {
      expect(adapter.getSettingsPath()).toBe(
        resolve(homedir(), ".gemini", "settings.json"),
      );
    });

    it("session dir is under ~/.gemini/context-mode/sessions/", () => {
      const sessionDir = adapter.getSessionDir();
      expect(sessionDir).toBe(
        join(homedir(), ".gemini", "context-mode", "sessions"),
      );
    });
  });

  // ── BeforeAgent hook (UserPromptSubmit equivalent) ────

  describe("BeforeAgent hook", () => {
    it("HOOK_TYPES declares BeforeAgent (gemini types.ts:547-559)", () => {
      expect(HOOK_TYPES.BEFORE_AGENT).toBe("BeforeAgent");
    });

    it("HOOK_SCRIPTS maps BeforeAgent to beforeagent.mjs", () => {
      expect(HOOK_SCRIPTS["BeforeAgent"]).toBe("beforeagent.mjs");
    });

    it("hooks/gemini-cli/beforeagent.mjs exists on disk", () => {
      const scriptPath = resolve(
        __dirname,
        "..",
        "..",
        "hooks",
        "gemini-cli",
        "beforeagent.mjs",
      );
      expect(existsSync(scriptPath)).toBe(true);
    });

    it("generateHookConfig wires BeforeAgent into settings (matcher: '')", () => {
      const config = adapter.generateHookConfig("/plugin/root") as Record<
        string,
        Array<{ matcher?: string; hooks?: Array<{ command?: string; type?: string }> }>
      >;
      expect(config["BeforeAgent"]).toBeDefined();
      expect(config["BeforeAgent"].length).toBe(1);
      expect(config["BeforeAgent"][0].matcher).toBe("");
      expect(config["BeforeAgent"][0].hooks?.[0].type).toBe("command");
      expect(config["BeforeAgent"][0].hooks?.[0].command).toContain(
        "beforeagent.mjs",
      );
    });

    it("generateHookConfig wires AfterModel into settings (matcher: '') so the host fires aftermodel.mjs", () => {
      const config = adapter.generateHookConfig("/plugin/root") as Record<
        string,
        Array<{ matcher?: string; hooks?: Array<{ command?: string; type?: string }> }>
      >;
      expect(config["AfterModel"]).toBeDefined();
      expect(config["AfterModel"].length).toBe(1);
      expect(config["AfterModel"][0].matcher).toBe("");
      expect(config["AfterModel"][0].hooks?.[0].type).toBe("command");
      expect(config["AfterModel"][0].hooks?.[0].command).toContain(
        "aftermodel.mjs",
      );
    });
  });

  // ── parseSessionStartInput ────────────────────────────

  describe("parseSessionStartInput", () => {
    it("parses source field correctly", () => {
      const event = adapter.parseSessionStartInput({
        session_id: "sess-1",
        source: "resume",
      });
      expect(event.source).toBe("resume");
    });

    it("defaults source to startup for unknown values", () => {
      const event = adapter.parseSessionStartInput({
        session_id: "sess-1",
        source: "unknown-source",
      });
      expect(event.source).toBe("startup");
    });
  });

  // ── buildHookCommand path layout (issue #712) ─────────
  //
  // Regression guard for issue #712: `buildHookCommand` must emit a path
  // under `hooks/gemini-cli/<script>` to match the published tree layout.
  // The introducing commit f5c9d02 carried claude-code's flat
  // `hooks/<script>` shape across without accounting for gemini-cli's
  // platform subdir (see HOOK_MAP in src/cli.ts where the gemini-cli
  // dispatcher already lists `hooks/gemini-cli/<script>.mjs`). The flat
  // emit made `ctx doctor` look for hook scripts at
  // `<pluginRoot>/hooks/<script>.mjs` which never exist for gemini-cli,
  // producing FAIL lines on every install.
  describe("buildHookCommand (issue #712)", () => {
    const pluginRoot = "/plugin/root";

    it("emits BeforeTool path under hooks/gemini-cli/", () => {
      const cmd = buildHookCommand(HOOK_TYPES.BEFORE_TOOL, pluginRoot);
      expect(cmd).toContain("/plugin/root/hooks/gemini-cli/beforetool.mjs");
    });

    it("emits SessionStart path under hooks/gemini-cli/", () => {
      const cmd = buildHookCommand(HOOK_TYPES.SESSION_START, pluginRoot);
      expect(cmd).toContain("/plugin/root/hooks/gemini-cli/sessionstart.mjs");
    });

    it("does not emit the flat hooks/<script>.mjs shape for any hook", () => {
      for (const [hookType, scriptName] of Object.entries(HOOK_SCRIPTS)) {
        const cmd = buildHookCommand(hookType as keyof typeof HOOK_SCRIPTS, pluginRoot);
        expect(cmd, `hook ${hookType} (${scriptName}) flat-path regression`).not.toMatch(
          new RegExp(`/hooks/${scriptName.replace(".", "\\.")}(?:\\b|$|")`),
        );
        expect(cmd).toContain(`/hooks/gemini-cli/${scriptName}`);
      }
    });

    it("every emitted hook command resolves to a file on disk", () => {
      const repoRoot = resolve(__dirname, "..", "..");
      for (const [hookType, scriptName] of Object.entries(HOOK_SCRIPTS)) {
        const cmd = buildHookCommand(hookType as keyof typeof HOOK_SCRIPTS, repoRoot);
        // The published tree layout is the contract — the script path the
        // command points to must exist in the same tree the doctor inspects.
        const expectedPath = join(repoRoot, "hooks", "gemini-cli", scriptName);
        expect(existsSync(expectedPath), `missing ${expectedPath}`).toBe(true);
        // buildHookRuntimeCommand emits forward-slash paths on every OS
        // (MSYS / Git Bash on Windows uses forward slashes). path.join on
        // Windows returns backslashes, so normalize before substring-match.
        expect(cmd).toContain(expectedPath.replace(/\\/g, "/"));
      }
    });

    it("falls back to CLI dispatcher when pluginRoot omitted", () => {
      expect(buildHookCommand(HOOK_TYPES.BEFORE_TOOL)).toBe(
        "context-mode hook gemini-cli beforetool",
      );
    });
  });

  // ── getHealthChecks defense-in-depth (issue #712) ─────
  //
  // Mirrors claude-code's Algo-D1 override: doctor calls
  // `adapter.getHealthChecks(pluginRoot)` and resolves script paths
  // directly via existsSync. No round-trip through a hook command
  // string, so this class of layout bug cannot regress through a
  // regex/parser mismatch.
  describe("getHealthChecks (issue #712 defense in depth)", () => {
    it("declares one check per HOOK_SCRIPTS entry", () => {
      const repoRoot = resolve(__dirname, "..", "..");
      const checks = adapter.getHealthChecks?.(repoRoot) ?? [];
      expect(checks.length).toBeGreaterThanOrEqual(
        Object.keys(HOOK_SCRIPTS).length,
      );
    });

    it("every hook script check passes against the published tree", () => {
      const repoRoot = resolve(__dirname, "..", "..");
      const checks = adapter.getHealthChecks?.(repoRoot) ?? [];
      const hookResults = checks
        .filter((c) => c.name.startsWith("Hook script:"))
        .map((c) => ({ name: c.name, result: c.check() }));
      for (const { name, result } of hookResults) {
        expect(result.status, `${name} -> ${result.detail ?? ""}`).toBe("OK");
      }
    });

    it("FAIL surfaces when pluginRoot is a temporary empty dir", () => {
      const tmp = join(homedir(), ".gemini-test-nonexistent-712");
      const checks = adapter.getHealthChecks?.(tmp) ?? [];
      const hookFail = checks
        .filter((c) => c.name.startsWith("Hook script:"))
        .map((c) => c.check());
      expect(hookFail.length).toBeGreaterThan(0);
      expect(hookFail.every((r) => r.status === "FAIL")).toBe(true);
    });
  });
});
