import "../setup-home";
import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CodexAdapter, parseCodexContextModePluginRoot, probeCodexCliVersion } from "../../src/adapters/codex/index.js";
import { resolveSessionDbPath, SessionDB } from "../../src/session/db.js";

function writeCodexPluginManifest(pluginRoot: string): void {
  const pluginDir = join(pluginRoot, ".codex-plugin");
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(join(pluginDir, "hooks.json"), JSON.stringify({
    hooks: new CodexAdapter().generateHookConfig(pluginRoot),
  }, null, 2), "utf-8");
}

function pluginEnabledSettings(extra = ""): string {
  return `[features]
hooks = true

[plugins."context-mode@context-mode"]
enabled = true

${extra}`;
}

function pluginListOutput(pluginRoot: string): string {
  return `Marketplace \`context-mode\`
/Users/test/.codex/.tmp/marketplaces/context-mode/.agents/plugins/marketplace.json

PLUGIN                    STATUS              VERSION  PATH
context-mode@context-mode  installed, enabled  1.0.162  ${pluginRoot}
`;
}

function adapterWithCodexPluginRoot(pluginRoot: string): CodexAdapter {
  return new CodexAdapter({
    codexPluginListRunner: () => pluginListOutput(pluginRoot),
  });
}

describe("CodexAdapter", () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = new CodexAdapter({
      codexPluginListRunner: () => {
        throw new Error("codex plugin list unavailable in unit tests");
      },
    });
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

    it("canModifyArgs is false (Codex does not support updatedInput)", () => {
      expect(adapter.capabilities.canModifyArgs).toBe(false);
    });

    it("canModifyOutput is false (Codex does not support updatedMCPToolOutput)", () => {
      expect(adapter.capabilities.canModifyOutput).toBe(false);
    });

    it("canInjectSessionContext is true", () => {
      expect(adapter.capabilities.canInjectSessionContext).toBe(true);
    });

    it("paradigm is json-stdio", () => {
      expect(adapter.paradigm).toBe("json-stdio");
    });
  });

  // ── parsePreToolUseInput ──────────────────────────────

  describe("parsePreToolUseInput", () => {
    it("extracts tool_name from input", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "s1",
        cwd: "/tmp",
        hook_event_name: "PreToolUse",
        model: "o3",
        permission_mode: "default",
        tool_use_id: "tu1",
        transcript_path: null,
        turn_id: "t1",
      });
      expect(event.toolName).toBe("Bash");
    });

    it("extracts session_id", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "codex-123",
        cwd: "/proj",
        hook_event_name: "PreToolUse",
        model: "o3",
        permission_mode: "default",
        tool_use_id: "tu1",
        transcript_path: null,
        turn_id: "t1",
      });
      expect(event.sessionId).toBe("codex-123");
    });

    it("extracts projectDir from cwd", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "s1",
        cwd: "/my/project",
        hook_event_name: "PreToolUse",
        model: "o3",
        permission_mode: "default",
        tool_use_id: "tu1",
        transcript_path: null,
        turn_id: "t1",
      });
      expect(event.projectDir).toBe("/my/project");
    });

    it("falls back to CODEX_PROJECT_DIR when cwd missing", () => {
      const savedCwd = process.env.CODEX_PROJECT_DIR;
      process.env.CODEX_PROJECT_DIR = "/env/project";
      try {
        const event = adapter.parsePreToolUseInput({
          tool_name: "Bash",
          tool_input: { command: "ls" },
          session_id: "s1",
          hook_event_name: "PreToolUse",
        });
        expect(event.projectDir).toBe("/env/project");
      } finally {
        if (savedCwd === undefined) delete process.env.CODEX_PROJECT_DIR;
        else process.env.CODEX_PROJECT_DIR = savedCwd;
      }
    });

    it("falls back to process.cwd() when cwd and env both missing", () => {
      const savedCwd = process.env.CODEX_PROJECT_DIR;
      delete process.env.CODEX_PROJECT_DIR;
      try {
        const event = adapter.parsePreToolUseInput({
          tool_name: "Bash",
          tool_input: { command: "ls" },
          session_id: "s1",
          hook_event_name: "PreToolUse",
        });
        expect(event.projectDir).toBe(process.cwd());
      } finally {
        if (savedCwd !== undefined) process.env.CODEX_PROJECT_DIR = savedCwd;
      }
    });

    it("post/precompact/sessionstart parsers also fall back to process.cwd()", () => {
      const savedCwd = process.env.CODEX_PROJECT_DIR;
      delete process.env.CODEX_PROJECT_DIR;
      try {
        const post = adapter.parsePostToolUseInput({ tool_name: "Bash" });
        expect(post.projectDir).toBe(process.cwd());

        const compact = adapter.parsePreCompactInput({ session_id: "s1" });
        expect(compact.projectDir).toBe(process.cwd());

        const start = adapter.parseSessionStartInput({ session_id: "s1" });
        expect(start.projectDir).toBe(process.cwd());
      } finally {
        if (savedCwd !== undefined) process.env.CODEX_PROJECT_DIR = savedCwd;
      }
    });
  });

  // ── formatPreToolUseResponse ──────────────────────────

  describe("formatPreToolUseResponse", () => {
    it("deny returns hookSpecificOutput with hookEventName and permissionDecision deny", () => {
      const resp = adapter.formatPreToolUseResponse({
        decision: "deny",
        reason: "blocked",
      });
      const hso = (resp as { hookSpecificOutput: Record<string, unknown> }).hookSpecificOutput;
      expect(hso.hookEventName).toBe("PreToolUse");
      expect(hso.permissionDecision).toBe("deny");
      expect(hso.permissionDecisionReason).toBe("blocked");
    });

    it("allow returns empty object (passthrough)", () => {
      const resp = adapter.formatPreToolUseResponse({ decision: "allow" });
      expect(resp).toEqual({});
    });
  });

  // ── parsePostToolUseInput ─────────────────────────────

  describe("parsePostToolUseInput", () => {
    it("extracts tool_response", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
        tool_response: "hi\n",
        session_id: "s1",
        cwd: "/tmp",
        hook_event_name: "PostToolUse",
        model: "o3",
        permission_mode: "default",
        tool_use_id: "tu1",
        transcript_path: null,
        turn_id: "t1",
      });
      expect(event.toolOutput).toBe("hi\n");
    });
  });

  // ── formatPostToolUseResponse ─────────────────────────

  describe("formatPostToolUseResponse", () => {
    it("context injection returns hookEventName and additionalContext in hookSpecificOutput", () => {
      const resp = adapter.formatPostToolUseResponse({
        additionalContext: "extra info",
      });
      const hso = (resp as { hookSpecificOutput: Record<string, unknown> }).hookSpecificOutput;
      expect(hso.hookEventName).toBe("PostToolUse");
      expect(hso.additionalContext).toBe("extra info");
    });
  });

  // ── parseSessionStartInput ────────────────────────────

  describe("parseSessionStartInput", () => {
    it("extracts source field", () => {
      const event = adapter.parseSessionStartInput({
        session_id: "s1",
        cwd: "/proj",
        hook_event_name: "SessionStart",
        model: "o3",
        permission_mode: "default",
        source: "startup",
        transcript_path: null,
      });
      expect(event.source).toBe("startup");
    });

    it("extracts session_id", () => {
      const event = adapter.parseSessionStartInput({
        session_id: "codex-456",
        cwd: "/proj",
        hook_event_name: "SessionStart",
        model: "o3",
        permission_mode: "default",
        source: "resume",
        transcript_path: null,
      });
      expect(event.sessionId).toBe("codex-456");
    });
  });

  // ── formatSessionStartResponse ──────────────────────

  describe("formatSessionStartResponse", () => {
    it("context returns hookEventName and additionalContext in hookSpecificOutput", () => {
      const resp = adapter.formatSessionStartResponse({
        context: "routing block",
      });
      const hso = (resp as { hookSpecificOutput: Record<string, unknown> }).hookSpecificOutput;
      expect(hso.hookEventName).toBe("SessionStart");
      expect(hso.additionalContext).toBe("routing block");
    });

    it("empty context returns empty object", () => {
      const resp = adapter.formatSessionStartResponse({});
      expect(resp).toEqual({});
    });
  });

  // ── Config paths ──────────────────────────────────────

  describe("config paths", () => {
    it("settings path ends with config.toml", () => {
      expect(adapter.getSettingsPath()).toContain("config.toml");
    });

    it("session dir is under ~/.codex/context-mode/sessions/", () => {
      expect(adapter.getSessionDir()).toContain(".codex");
      expect(adapter.getSessionDir()).toContain("sessions");
    });

    it("honors CODEX_HOME for settings, hooks, and session paths", () => {
      const savedCodexHome = process.env.CODEX_HOME;
      const codexHome = join(homedir(), "custom-codex-home");
      process.env.CODEX_HOME = codexHome;

      try {
        const customAdapter = new CodexAdapter({
          codexPluginListRunner: () => {
            throw new Error("codex plugin list unavailable in unit tests");
          },
        });
        expect(customAdapter.getSettingsPath()).toBe(join(codexHome, "config.toml"));
        expect(customAdapter.getHooksPath()).toBe(join(codexHome, "hooks.json"));
        expect(customAdapter.getSessionDir()).toBe(join(codexHome, "context-mode", "sessions"));
      } finally {
        if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
        else process.env.CODEX_HOME = savedCodexHome;
        rmSync(codexHome, { recursive: true, force: true });
      }
    });
  });

  // ── Version diagnostics ───────────────────────────────

  describe("version diagnostics", () => {
    it("reports standalone MCP mode instead of a missing platform plugin", () => {
      expect(adapter.getInstalledVersion()).toBe("standalone");
    });

    it("trims Codex CLI version probe output", () => {
      expect(probeCodexCliVersion(() => "codex-cli 0.132.0\n")).toBe("codex-cli 0.132.0");
    });

    it("returns null when the Codex CLI version probe fails", () => {
      expect(probeCodexCliVersion(() => {
        throw new Error("ENOENT");
      })).toBeNull();
    });

    it("parses the context-mode runtime root from `codex plugin list` output", () => {
      const pluginRoot = join(homedir(), ".codex", ".tmp", "marketplaces", "context-mode");
      expect(parseCodexContextModePluginRoot(pluginListOutput(pluginRoot))).toBe(pluginRoot);
    });

    it("returns null when context-mode is not installed in `codex plugin list` output", () => {
      expect(parseCodexContextModePluginRoot("browser@openai-bundled installed, enabled 0.1 /tmp/browser")).toBeNull();
    });

    it("surfaces Codex CLI binary availability in diagnostics", () => {
      const checks = adapter.validateHooks("");
      expect(checks.some((result) => result.check === "Codex CLI binary")).toBe(true);
    });
  });

  // ── generateHookConfig ────────────────────────────────

  describe("generateHookConfig", () => {
    it("generates hooks.json with Codex-supported continuity entries", () => {
      const config = adapter.generateHookConfig("/path/to/plugin");
      expect(config).toHaveProperty("PreToolUse");
      expect(config).toHaveProperty("PostToolUse");
      expect(config).toHaveProperty("PreCompact");
      expect(config).toHaveProperty("SessionStart");
      expect(config).toHaveProperty("UserPromptSubmit");
      expect(config).toHaveProperty("Stop");
      expect(config.PreToolUse[0]?.matcher).toContain("apply_patch");
      expect(config.PreToolUse[0]?.matcher).toContain("Edit");
      expect(config.PreToolUse[0]?.matcher).toContain("Write");
      // #547 hotfix: matcher is now charset-clean (no `.*` regex syntax) so
      // the bare `ctx_*` names cover context-mode's own MCP tools and the
      // literal `mcp__` segment exists for parity with hooks/hooks.json.
      expect(config.PreToolUse[0]?.matcher).toContain("ctx_execute");
      expect(config.PreToolUse[0]?.matcher).toContain("ctx_batch_execute");
      expect(config.PreToolUse[0]?.matcher).toMatch(/(^|\|)mcp__$/);
      expect(config.PreToolUse[0]?.matcher).not.toMatch(/(^|\|)Read(\||$)/);
      expect(config.PreToolUse[0]?.matcher).not.toContain("mcp__plugin_context-mode_context-mode__");
      expect(config.PreCompact[0]?.hooks[0]?.command).toBe("context-mode hook codex precompact");
      expect(config.UserPromptSubmit[0]?.hooks[0]?.command).toBe("context-mode hook codex userpromptsubmit");
    });
  });

  describe("configureAllHooks", () => {
    const hooksPath = join(homedir(), ".codex", "hooks.json");
    const codexDir = join(homedir(), ".codex");

    beforeEach(() => {
      rmSync(codexDir, { recursive: true, force: true });
      mkdirSync(codexDir, { recursive: true });
    });

    it("writes the native Codex hooks file with the scoped PreToolUse matcher", () => {
      const changes = adapter.configureAllHooks("/ignored/plugin/root");
      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
      };

      expect(changes.some((change) => change.includes("Added PreToolUse hook"))).toBe(true);
      expect(changes.some((change) => change.includes("Wrote native Codex hooks"))).toBe(true);
      expect(changes.some((change) => change.includes("Enabled Codex hooks feature flag"))).toBe(true);
      // #547 hotfix: matcher is charset-clean — bare `ctx_execute` covers
      // context-mode's own MCP tools (hook body filters by tool prefix).
      expect(written.hooks.PreToolUse[0]?.matcher).toContain("ctx_execute");
      expect(written.hooks.PreToolUse[0]?.matcher).toMatch(/(^|\|)mcp__$/);
      expect(written.hooks.PreToolUse[0]?.matcher).not.toMatch(/(^|\|)Read(\||$)/);
      expect(written.hooks.PreToolUse[0]?.matcher).not.toContain("mcp__plugin_context-mode_context-mode__");
      expect(written.hooks.PreCompact[0]?.hooks[0]?.command).toBe("context-mode hook codex precompact");
      expect(written.hooks.Stop[0]?.hooks[0]?.command).toBe("context-mode hook codex stop");
      expect(readFileSync(join(codexDir, "config.toml"), "utf-8")).toContain("hooks = true");
    });

    it("preserves unrelated hook entries while updating context-mode hooks", () => {
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "", hooks: [{ type: "command", command: "node /tmp/context-mode/hooks/pretooluse.mjs" }] },
          ],
          SessionStart: [
            { hooks: [{ type: "command", command: "context-mode hook codex sessionstart" }] },
            { matcher: "startup|resume", hooks: [{ type: "command", command: "node C:/tools/extra-hook.js" }] },
          ],
        },
      }, null, 2));

      adapter.configureAllHooks("/ignored/plugin/root");

      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
      };
      expect(written.hooks.PreToolUse[0]?.matcher).toContain("local_shell|shell|shell_command");
      expect(written.hooks.SessionStart).toHaveLength(2);
      expect(written.hooks.SessionStart[1]?.hooks[0]?.command).toBe("node C:/tools/extra-hook.js");
    });

    it("creates ~/.codex/hooks.json when the parent directory is missing", () => {
      rmSync(codexDir, { recursive: true, force: true });

      adapter.configureAllHooks("/ignored/plugin/root");

      expect(existsSync(hooksPath)).toBe(true);
      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };

      expect(Object.keys(written.hooks).sort()).toEqual([
        "PostToolUse",
        "PreCompact",
        "PreToolUse",
        "SessionStart",
        "Stop",
        "UserPromptSubmit",
      ]);
    });

    it("backs up malformed hooks.json before replacing it", () => {
      const malformed = "{ invalid json";
      writeFileSync(hooksPath, malformed, "utf-8");

      const changes = adapter.configureAllHooks("/ignored/plugin/root");
      const backupName = readdirSync(codexDir).find((name) =>
        name.startsWith("hooks.json.broken-") && name.endsWith(".bak"),
      );

      expect(backupName).toBeDefined();
      expect(readFileSync(join(codexDir, backupName!), "utf-8")).toBe(malformed);
      expect(changes.some((change) => change.includes("Backed up malformed Codex hooks"))).toBe(true);
      expect(JSON.parse(readFileSync(hooksPath, "utf-8")).hooks.PreCompact).toBeDefined();
    });

    it("does not crash on schema-invalid entries with non-array hooks", () => {
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "", hooks: "not-an-array" },
            null,
          ],
        },
      }, null, 2), "utf-8");

      expect(() => adapter.configureAllHooks("/ignored/plugin/root")).not.toThrow();
      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: unknown }>>;
      };
      expect(Array.isArray(written.hooks.PreToolUse)).toBe(true);
    });

    it("does not crash when top-level hooks is not an object", () => {
      writeFileSync(hooksPath, JSON.stringify({
        hooks: [],
      }, null, 2), "utf-8");

      expect(() => adapter.configureAllHooks("/ignored/plugin/root")).not.toThrow();
      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, unknown>;
      };
      expect(typeof written.hooks).toBe("object");
      expect(Array.isArray(written.hooks.PreToolUse)).toBe(true);
    });

    it("backs up both hooks.json and config.toml when both exist", () => {
      writeFileSync(hooksPath, JSON.stringify({ hooks: {} }), "utf-8");
      const settingsPath = join(codexDir, "config.toml");
      writeFileSync(settingsPath, "[features]\nhooks = false\n", "utf-8");

      expect(adapter.backupSettings()).toBe(`${hooksPath}.bak`);
      expect(readFileSync(`${hooksPath}.bak`, "utf-8")).toContain('"hooks"');
      expect(readFileSync(`${settingsPath}.bak`, "utf-8")).toContain("hooks = false");
    });

    // ─────────────────────────────────────────────────────
    // Duplicate dedup regression suite (#603)
    //
    // Reported by jowch + skbsasikumar-rgb: after a context-mode upgrade,
    // ~/.codex/hooks.json carries TWO context-mode entries for the same
    // hook event (e.g., a legacy `node /path/.../hooks/codex/pretooluse.mjs`
    // alongside the new `context-mode hook codex pretooluse`). Codex then
    // fires both, doubling work and historically saturating the MCP
    // transport / inflating codex-tui.log. `configureAllHooks` must collapse
    // these to exactly one canonical entry per event.
    // ─────────────────────────────────────────────────────

    it("dedups twin canonical context-mode entries to a single entry (#603)", () => {
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "old-matcher-A", hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] },
            { matcher: "old-matcher-B", hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] },
          ],
          SessionStart: [
            { hooks: [{ type: "command", command: "context-mode hook codex sessionstart" }] },
            { hooks: [{ type: "command", command: "context-mode hook codex sessionstart" }] },
          ],
        },
      }, null, 2));

      const changes = adapter.configureAllHooks("/ignored/plugin/root");

      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };

      expect(written.hooks.PreToolUse).toHaveLength(1);
      expect(written.hooks.PreToolUse[0]?.hooks[0]?.command).toBe("context-mode hook codex pretooluse");
      expect(written.hooks.SessionStart).toHaveLength(1);
      expect(written.hooks.SessionStart[0]?.hooks[0]?.command).toBe("context-mode hook codex sessionstart");
      expect(changes.some((c) => c.includes("Removed duplicate"))).toBe(true);
    });

    it("dedups legacy-direct-node entry coexisting with canonical entry (#603)", () => {
      // Mirrors the exact user-reported pattern: old direct-node hook left
      // behind by an earlier installer + new canonical entry from a later
      // upgrade run.
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "", hooks: [{ type: "command", command: "node /Users/foo/.nvm/versions/node/v20/lib/node_modules/context-mode/hooks/codex/pretooluse.mjs" }] },
            { matcher: "", hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] },
          ],
          PostToolUse: [
            { hooks: [{ type: "command", command: "/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/context-mode/hooks/posttooluse.mjs" }] },
            { hooks: [{ type: "command", command: "context-mode hook codex posttooluse" }] },
          ],
        },
      }, null, 2));

      adapter.configureAllHooks("/ignored/plugin/root");

      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };

      expect(written.hooks.PreToolUse).toHaveLength(1);
      expect(written.hooks.PreToolUse[0]?.hooks[0]?.command).toBe("context-mode hook codex pretooluse");
      expect(written.hooks.PostToolUse).toHaveLength(1);
      expect(written.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("context-mode hook codex posttooluse");
    });

    it("dedups plugin-cache legacy entry left by /ctx-upgrade with canonical entry (#603)", () => {
      // Plugin-cache install layout: ~/.claude/plugins/cache/context-mode/<v>/hooks/codex/<event>.mjs
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { hooks: [{ type: "command", command: "node /Users/foo/.claude/plugins/cache/context-mode/context-mode/1.0.124/hooks/codex/userpromptsubmit.mjs" }] },
            { hooks: [{ type: "command", command: "context-mode hook codex userpromptsubmit" }] },
          ],
          Stop: [
            { hooks: [{ type: "command", command: "/usr/bin/node /Users/foo/.claude/plugins/marketplaces/context-mode/hooks/codex/stop.mjs" }] },
          ],
        },
      }, null, 2));

      adapter.configureAllHooks("/ignored/plugin/root");

      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };

      expect(written.hooks.UserPromptSubmit).toHaveLength(1);
      expect(written.hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe("context-mode hook codex userpromptsubmit");
      expect(written.hooks.Stop).toHaveLength(1);
      expect(written.hooks.Stop[0]?.hooks[0]?.command).toBe("context-mode hook codex stop");
    });

    it("removes context-mode user hooks when the Codex plugin owns hooks", () => {
      const pluginRoot = join(codexDir, "plugin-root");
      adapter = adapterWithCodexPluginRoot(pluginRoot);
      writeCodexPluginManifest(pluginRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(), "utf-8");
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "node /opt/homebrew/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js" }] },
            { matcher: "local_shell|shell|ctx_execute|mcp__", hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] },
          ],
          SessionStart: [
            { matcher: "startup|resume", hooks: [{ type: "command", command: "node /opt/homebrew/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js" }] },
            { hooks: [{ type: "command", command: "context-mode hook codex sessionstart" }] },
          ],
        },
      }, null, 2), "utf-8");

      const changes = adapter.configureAllHooks(pluginRoot);

      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      expect(written.hooks.PreToolUse).toHaveLength(1);
      expect(written.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("oh-my-codex");
      expect(written.hooks.SessionStart).toHaveLength(1);
      expect(written.hooks.SessionStart[0]?.hooks[0]?.command).toContain("oh-my-codex");
      expect(JSON.stringify(written)).not.toContain("context-mode hook codex");
      expect(changes.some((change) => change.includes("Removed duplicate context-mode user hooks"))).toBe(true);
    });

    it("keeps native fallback hooks when the running doctor root differs from the Codex plugin manager root", () => {
      const doctorRoot = join(codexDir, "versioned-cache-root");
      const runtimeRoot = join(codexDir, "marketplace-root");
      adapter = adapterWithCodexPluginRoot(runtimeRoot);
      writeCodexPluginManifest(doctorRoot);
      writeCodexPluginManifest(runtimeRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(), "utf-8");
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "node /opt/homebrew/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js" }] },
          ],
        },
      }, null, 2), "utf-8");

      const changes = adapter.configureAllHooks(doctorRoot);

      const written = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      expect(written.hooks.PreToolUse).toHaveLength(2);
      expect(written.hooks.PreToolUse.some((entry) =>
        entry.hooks[0]?.command === "context-mode hook codex pretooluse",
      )).toBe(true);
      expect(written.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("context-mode hook codex posttooluse");
      expect(changes.some((change) => change.includes("Removed duplicate context-mode user hooks"))).toBe(false);
      expect(changes).toContain("Wrote native Codex hooks to " + hooksPath);
    });

    it("removes standalone MCP registration and stale user-hook trust state in plugin mode", () => {
      const pluginRoot = join(codexDir, "plugin-root");
      const stateHooksPath = hooksPath.replace(/\//g, "\\");
      adapter = adapterWithCodexPluginRoot(pluginRoot);
      writeCodexPluginManifest(pluginRoot);
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "node /opt/homebrew/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js" }] },
          ],
        },
      }, null, 2), "utf-8");
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(`
[mcp_servers.context-mode]
command = "npx"
args = ["-y", "context-mode"]

[mcp_servers.context-mode.tools.ctx_execute]
approval_mode = "approve"

[hooks.state."${stateHooksPath}:pre_tool_use:0:0"]
trusted_hash = "sha256:live"

[hooks.state."${stateHooksPath}:pre_tool_use:1:0"]
trusted_hash = "sha256:stale"
`), "utf-8");

      const changes = adapter.configureAllHooks(pluginRoot);

      const settings = readFileSync(join(codexDir, "config.toml"), "utf-8");
      expect(settings).not.toContain("[mcp_servers.context-mode]");
      expect(settings).not.toContain("[mcp_servers.context-mode.tools.ctx_execute]");
      expect(settings).toContain(`${stateHooksPath}:pre_tool_use:0:0`);
      expect(settings).not.toContain(`${stateHooksPath}:pre_tool_use:1:0`);
      expect(changes).toContain("Removed standalone Codex context-mode MCP registration");
      expect(changes.some((change) => change.includes("stale Codex hook trust"))).toBe(true);
    });
  });

  describe("validateHooks", () => {
    const hooksPath = join(homedir(), ".codex", "hooks.json");
    const codexDir = join(homedir(), ".codex");

    beforeEach(() => {
      rmSync(codexDir, { recursive: true, force: true });
      mkdirSync(codexDir, { recursive: true });
    });

    it("fails when hooks.json is missing", () => {
      const results = adapter.validateHooks("/ignored/plugin/root");
      expect(results.some((result) => result.status === "fail" && result.check === "Hooks config")).toBe(true);
      expect(results.some((result) => result.check === "Codex hooks feature flag")).toBe(true);
    });

    it("passes when all required Codex hooks are configured", () => {
      adapter.configureAllHooks("/ignored/plugin/root");
      const results = adapter.validateHooks("/ignored/plugin/root");
      // The "Codex CLI binary" check is a runtime environment probe added
      // by PR #686 — it shells out to `codex --version` and reports `warn`
      // when the binary is absent (e.g. CI runners without Codex installed).
      // That probe is orthogonal to the hook-config validation this test is
      // pinning, so exclude it from the all-pass assertion. Probe-specific
      // behaviour (pass/warn shape) is covered separately by the unit tests
      // around probeCodexCliVersion() at L295-299.
      const configChecks = results.filter((r) => r.check !== "Codex CLI binary");
      expect(configChecks.every((result) => result.status === "pass")).toBe(true);
      expect(results.map((result) => result.check)).toContain("PreCompact hook");
      expect(results.map((result) => result.check)).toContain("UserPromptSubmit hook");
      expect(results.map((result) => result.check)).toContain("Stop hook");
    });

    it("passes via Codex plugin hooks and warns when user config still has context-mode hooks", () => {
      const pluginRoot = join(codexDir, "plugin-root");
      writeCodexPluginManifest(pluginRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(), "utf-8");
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "local_shell|shell|ctx_execute|mcp__", hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] },
          ],
        },
      }, null, 2), "utf-8");

      const results = adapter.validateHooks(pluginRoot);

      const preTool = results.find((result) => result.check === "PreToolUse hook");
      expect(preTool?.status).toBe("pass");
      expect(preTool?.message).toMatch(/context-mode@context-mode plugin/);
      const duplicate = results.find((result) => result.check === "PreToolUse plugin duplicate");
      expect(duplicate?.status).toBe("warn");
      expect(duplicate?.message).toMatch(/configured in both/);
      expect(results.some((result) => result.check === "PostToolUse hook" && result.status === "pass")).toBe(true);
      expect(results.some((result) => result.check === "Hooks config" && result.status === "fail")).toBe(false);
    });

    it("passes with missing user hooks.json when the Codex plugin owns hooks", () => {
      const pluginRoot = join(codexDir, "plugin-root");
      writeCodexPluginManifest(pluginRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(), "utf-8");

      const results = adapter.validateHooks(pluginRoot);

      expect(results.some((result) => result.check === "Hooks config" && result.status === "fail")).toBe(false);
      expect(results.some((result) => result.check === "Stop hook" && result.status === "pass")).toBe(true);
    });

    it("uses the Codex plugin manager runtime root instead of failing on a stale doctor root", () => {
      const staleDoctorRoot = join(codexDir, "unversioned-stale-root");
      const runtimeRoot = join(codexDir, "marketplace-runtime-root");
      adapter = adapterWithCodexPluginRoot(runtimeRoot);
      writeCodexPluginManifest(runtimeRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(), "utf-8");

      const results = adapter.validateHooks(staleDoctorRoot);

      const root = results.find((result) => result.check === "Codex plugin root");
      expect(root?.status).toBe("warn");
      expect(root?.message).toContain(staleDoctorRoot);
      expect(root?.message).toContain(runtimeRoot);
      expect(results.some((result) =>
        result.check === "Codex plugin hooks"
        && result.status === "fail"
        && result.message.includes(staleDoctorRoot),
      )).toBe(false);
      expect(results.some((result) => result.check === "Stop hook" && result.status === "pass")).toBe(true);
    });

    it("fails against the Codex plugin manager runtime root when that manifest is missing", () => {
      const staleDoctorRoot = join(codexDir, "unversioned-stale-root");
      const runtimeRoot = join(codexDir, "missing-runtime-root");
      adapter = adapterWithCodexPluginRoot(runtimeRoot);
      writeCodexPluginManifest(staleDoctorRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(), "utf-8");

      const results = adapter.validateHooks(staleDoctorRoot);

      const pluginHooks = results.find((result) => result.check === "Codex plugin hooks");
      expect(pluginHooks?.status).toBe("fail");
      expect(pluginHooks?.message).toContain(join(runtimeRoot, ".codex-plugin", "hooks.json"));
    });

    it("warns when plugin mode still has standalone npx MCP registration", () => {
      const pluginRoot = join(codexDir, "plugin-root");
      adapter = adapterWithCodexPluginRoot(pluginRoot);
      writeCodexPluginManifest(pluginRoot);
      writeFileSync(join(codexDir, "config.toml"), pluginEnabledSettings(`
[mcp_servers.context-mode]
command = "npx"
args = ["-y", "context-mode"]
`), "utf-8");

      const results = adapter.validateHooks(pluginRoot);

      const duplicate = results.find((result) => result.check === "Standalone MCP duplicate");
      expect(duplicate?.status).toBe("warn");
      expect(duplicate?.fix).toMatch(/context-mode upgrade/);
    });

    it("warns instead of failing when only PreCompact is missing", () => {
      const hooks = adapter.generateHookConfig("/ignored/plugin/root");
      delete (hooks as Partial<typeof hooks>).PreCompact;
      writeFileSync(hooksPath, JSON.stringify({ hooks }, null, 2), "utf-8");
      writeFileSync(join(codexDir, "config.toml"), "[features]\nhooks = true\n", "utf-8");

      const results = adapter.validateHooks("/ignored/plugin/root");
      const precompact = results.find((result) => result.check === "PreCompact hook");
      expect(precompact?.status).toBe("warn");
      expect(results.filter((result) => result.status === "fail")).toHaveLength(0);
    });

    it("fails when hooks.json is malformed JSON", () => {
      writeFileSync(hooksPath, "{ invalid json", "utf-8");

      const results = adapter.validateHooks("/ignored/plugin/root");

      expect(results.some((result) => result.status === "fail" && result.message.includes("not valid JSON"))).toBe(true);
    });

    it("warns when duplicate context-mode entries exist for the same hook event (#603)", () => {
      // Mirrors the user-reported scenario: hooks.json carries two
      // context-mode entries for the same event after a partial upgrade.
      // Doctor should surface this so the user knows to run upgrade.
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "", hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] },
            { matcher: "", hooks: [{ type: "command", command: "node /Users/foo/.nvm/versions/node/v20/lib/node_modules/context-mode/hooks/codex/pretooluse.mjs" }] },
          ],
          PostToolUse: [
            { hooks: [{ type: "command", command: "context-mode hook codex posttooluse" }] },
            { hooks: [{ type: "command", command: "context-mode hook codex posttooluse" }] },
          ],
          SessionStart: [
            { hooks: [{ type: "command", command: "context-mode hook codex sessionstart" }] },
          ],
          PreCompact: [
            { hooks: [{ type: "command", command: "context-mode hook codex precompact" }] },
          ],
          UserPromptSubmit: [
            { hooks: [{ type: "command", command: "context-mode hook codex userpromptsubmit" }] },
          ],
          Stop: [
            { hooks: [{ type: "command", command: "context-mode hook codex stop" }] },
          ],
        },
      }, null, 2), "utf-8");
      writeFileSync(join(codexDir, "config.toml"), "[features]\nhooks = true\n", "utf-8");

      const results = adapter.validateHooks("/ignored/plugin/root");

      const preToolDup = results.find((r) => r.check === "PreToolUse duplicates");
      expect(preToolDup?.status).toBe("warn");
      expect(preToolDup?.message).toMatch(/2 context-mode entries/);
      expect(preToolDup?.fix).toMatch(/context-mode upgrade/);

      const postToolDup = results.find((r) => r.check === "PostToolUse duplicates");
      expect(postToolDup?.status).toBe("warn");
      expect(postToolDup?.message).toMatch(/2 context-mode entries/);

      // Events with only one context-mode entry must NOT trigger the duplicate warning.
      expect(results.some((r) => r.check === "SessionStart duplicates")).toBe(false);
      expect(results.some((r) => r.check === "PreCompact duplicates")).toBe(false);
      expect(results.some((r) => r.check === "Stop duplicates")).toBe(false);
    });

    it("fails with a read error message when hooks.json cannot be read", () => {
      mkdirSync(hooksPath, { recursive: true });

      const results = adapter.validateHooks("/ignored/plugin/root");

      expect(results.some((result) => result.status === "fail" && result.message.includes("Could not read"))).toBe(true);
    });

    it("fails when hooks.json entries use an invalid schema", () => {
      writeFileSync(hooksPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "", hooks: "not-an-array" },
            null,
          ],
        },
      }, null, 2), "utf-8");

      const results = adapter.validateHooks("/ignored/plugin/root");

      expect(results.some((result) => result.status === "fail")).toBe(true);
      expect(results.some((result) => result.check === "PreToolUse hook")).toBe(true);
    });

    it("fails when top-level hooks uses an invalid schema", () => {
      writeFileSync(hooksPath, JSON.stringify({
        hooks: [],
      }, null, 2), "utf-8");

      const results = adapter.validateHooks("/ignored/plugin/root");

      expect(results.some((result) => result.status === "fail")).toBe(true);
      expect(results.some((result) => result.check === "PreToolUse hook")).toBe(true);
    });
  });
});

// ── Hook script integration tests ──────────────────────
describe("Codex pretooluse hook script", () => {
  it("outputs valid JSON with hookEventName even for passthrough (no routing match)", () => {
    const hookScript = resolve(__dirname, "../../hooks/codex/pretooluse.mjs");
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      session_id: "test-1",
      cwd: "/tmp",
      hook_event_name: "PreToolUse",
      model: "o3",
      permission_mode: "default",
      tool_use_id: "tu1",
      transcript_path: null,
      turn_id: "t1",
    });

    const stdout = execFileSync(process.execPath, [hookScript], {
      input,
      encoding: "utf-8",
      timeout: 10000,
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.hookSpecificOutput).toBeDefined();
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  });
});

describe("Codex userpromptsubmit hook script", () => {
  it("outputs valid JSON with UserPromptSubmit hookEventName", () => {
    const hookScript = resolve(__dirname, "../../hooks/codex/userpromptsubmit.mjs");
    const input = JSON.stringify({
      session_id: "test-userprompt",
      cwd: "/tmp",
      hook_event_name: "UserPromptSubmit",
      model: "o3",
      permission_mode: "default",
      prompt: "remember this decision",
      transcript_path: null,
      turn_id: "t1",
    });

    const stdout = execFileSync(process.execPath, [hookScript], {
      input,
      encoding: "utf-8",
      timeout: 10000,
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.hookSpecificOutput).toBeDefined();
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  });
});

describe("Codex stop hook script", () => {
  it("outputs valid JSON and records turn_end without requesting continuation", async () => {
    const hookScript = resolve(__dirname, "../../hooks/codex/stop.mjs");
    const codexHome = mkdtempSync(join(tmpdir(), "context-mode-codex-stop-home-"));
    const projectDir = join(codexHome, "project");
    const sessionId = "test-stop";
    const savedCodexHome = process.env.CODEX_HOME;
    mkdirSync(projectDir, { recursive: true });

    const input = JSON.stringify({
      session_id: sessionId,
      cwd: projectDir,
      hook_event_name: "Stop",
      model: "o3",
      permission_mode: "default",
      last_assistant_message: "done",
      stop_hook_active: false,
      transcript_path: null,
      turn_id: "t1",
    });

    process.env.CODEX_HOME = codexHome;
    try {
      const stdout = execFileSync(process.execPath, [hookScript], {
        input,
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(JSON.parse(stdout.trim())).toEqual({});

      const dbPath = resolveSessionDbPath({
        projectDir,
        sessionsDir: new CodexAdapter().getSessionDir(),
      });
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(dbPath, { readonly: true });
      try {
        const rows = db.prepare(
          "SELECT type, data FROM session_events WHERE type IN ('turn_end', 'session_end')",
        ).all() as Array<{ type: string; data: string }>;

        expect(rows.some((row) => row.type === "turn_end")).toBe(true);
        expect(rows.some((row) => row.type === "session_end")).toBe(false);

        const payload = JSON.parse(rows.find((row) => row.type === "turn_end")?.data ?? "{}");
        expect(payload.stop_hook_active).toBe(false);
        expect(payload.last_assistant_message).toBe("done");
      } finally {
        db.close();
      }
    } finally {
      if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = savedCodexHome;
      rmSync(codexHome, { recursive: true, force: true });
    }
  });
});

describe("Codex precompact hook script", () => {
  it("persists a resume snapshot, compact count, and compaction summary", () => {
    const hookScript = resolve(__dirname, "../../hooks/codex/precompact.mjs");
    const codexHome = mkdtempSync(join(tmpdir(), "context-mode-codex-home-"));
    const projectDir = join(codexHome, "project");
    const sessionId = "test-precompact";
    const savedCodexHome = process.env.CODEX_HOME;

    mkdirSync(projectDir, { recursive: true });
    process.env.CODEX_HOME = codexHome;

    try {
      const dbPath = resolveSessionDbPath({
        projectDir,
        sessionsDir: new CodexAdapter().getSessionDir(),
      });
      const db = new SessionDB({ dbPath });
      db.ensureSession(sessionId, projectDir);
      db.insertEvent(sessionId, {
        type: "file_edit",
        category: "file",
        data: "Edited src/app.ts",
        priority: 2,
      }, "PostToolUse");
      db.close();

      const stdout = execFileSync(process.execPath, [hookScript], {
        input: JSON.stringify({
          session_id: sessionId,
          cwd: projectDir,
          hook_event_name: "PreCompact",
          source: "compact",
        }),
        encoding: "utf-8",
        timeout: 10000,
        env: { ...process.env, CODEX_HOME: codexHome },
      });

      expect(JSON.parse(stdout.trim())).toEqual({});

      const verifyDb = new SessionDB({ dbPath });
      const resume = verifyDb.getResume(sessionId);
      const compactCount = verifyDb.getSessionStats(sessionId)?.compact_count;
      const hasCompactionSummary = verifyDb
        .getEvents(sessionId)
        .some((event) => event.category === "compaction");
      verifyDb.close();

      expect(resume?.snapshot).toContain("<session_resume");
      expect(resume?.snapshot).toContain("app.ts");
      expect(resume?.event_count).toBe(1);
      expect(compactCount).toBe(1);
      expect(hasCompactionSummary).toBe(true);
    } finally {
      if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = savedCodexHome;
      try { rmSync(codexHome, { recursive: true, force: true }); } catch { /* Windows may release SQLite handles late */ }
    }
  });
});

describe("Codex sessionstart hook script", () => {
  it("injects a compact resume snapshot before marking it consumed", () => {
    const hookScript = resolve(__dirname, "../../hooks/codex/sessionstart.mjs");
    const codexHome = mkdtempSync(join(tmpdir(), "context-mode-codex-home-"));
    const projectDir = join(codexHome, "project");
    const sessionId = "test-sessionstart-compact";
    const snapshot = "<session_resume><task_state>restore me</task_state></session_resume>";
    const savedCodexHome = process.env.CODEX_HOME;

    mkdirSync(projectDir, { recursive: true });
    process.env.CODEX_HOME = codexHome;

    try {
      const dbPath = resolveSessionDbPath({
        projectDir,
        sessionsDir: new CodexAdapter().getSessionDir(),
      });
      const db = new SessionDB({ dbPath });
      db.ensureSession(sessionId, projectDir);
      db.upsertResume(sessionId, snapshot, 1);
      db.close();

      const stdout = execFileSync(process.execPath, [hookScript], {
        input: JSON.stringify({
          session_id: sessionId,
          cwd: projectDir,
          hook_event_name: "SessionStart",
          source: "compact",
        }),
        encoding: "utf-8",
        timeout: 10000,
        env: { ...process.env, CODEX_HOME: codexHome },
      });

      const parsed = JSON.parse(stdout.trim());
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("restore me");

      const verifyDb = new SessionDB({ dbPath });
      const consumed = verifyDb.getResume(sessionId)?.consumed;
      verifyDb.close();
      expect(consumed).toBe(1);
    } finally {
      if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = savedCodexHome;
      try { rmSync(codexHome, { recursive: true, force: true }); } catch { /* Windows may release SQLite handles late */ }
    }
  });
});

// Pins the #492 follow-up invariants:
//   1. configs/codex/hooks.json PreToolUse matcher equals
//      PRE_TOOL_USE_MATCHER_PATTERN in src/adapters/codex/index.ts
//   2. configs/codex/hooks.json declares a PreCompact entry that routes
//      to `context-mode hook codex precompact`
//   3. README.md documents the same matcher (JSON-escaped form)
describe("Codex matcher parity + config integrity", () => {
  const repoRoot = resolve(__dirname, "..", "..");
  const adapterSrcPath = join(repoRoot, "src", "adapters", "codex", "index.ts");
  const hooksConfigPath = join(repoRoot, "configs", "codex", "hooks.json");
  const readmePath = join(repoRoot, "README.md");

  function readMatcherConstant(): string {
    const src = readFileSync(adapterSrcPath, "utf8");
    const m = src.match(/PRE_TOOL_USE_MATCHER_PATTERN\s*=\s*"([^"]+)"/);
    if (!m) throw new Error("PRE_TOOL_USE_MATCHER_PATTERN constant not found in adapter source");
    // TS source uses \\ for a literal backslash. Convert to runtime string
    // value so it can be compared against a parsed JSON string.
    return m[1].replace(/\\\\/g, "\\");
  }

  it("hooks.json PreToolUse matcher equals the adapter constant", () => {
    const constant = readMatcherConstant();
    const parsed = JSON.parse(readFileSync(hooksConfigPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };
    const cfgMatcher = parsed.hooks.PreToolUse[0]?.matcher;
    expect(cfgMatcher).toBe(constant);
  });

  it("hooks.json declares PreCompact wired to the precompact hook command", () => {
    const parsed = JSON.parse(readFileSync(hooksConfigPath, "utf8")) as {
      hooks: { PreCompact?: Array<{ hooks: Array<{ type: string; command: string }> }> };
    };
    expect(parsed.hooks.PreCompact).toBeDefined();
    const entry = parsed.hooks.PreCompact?.[0];
    expect(entry?.hooks?.[0]?.command).toBe("context-mode hook codex precompact");
  });

  it("README documents the same Codex PreToolUse matcher as the adapter", () => {
    const constant = readMatcherConstant();
    const readme = readFileSync(readmePath, "utf8");
    const blockRe = /"PreToolUse":\s*\[\{\s*"matcher":\s*"([^"]+)"/g;
    const documented: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(readme)) !== null) {
      documented.push(m[1].replace(/\\\\/g, "\\"));
    }
    expect(documented).toContain(constant);
  });
});

// #547: Codex CLI uses Rust's `regex` crate which does NOT support look-around
// (?!...). v1.0.124 shipped matchers containing (?!.*context-mode) and
// (?!plugin_context-mode_) — Codex rejects them at boot with
// "look-around not supported", breaking ALL Codex users.
//
// Codex `is_exact_matcher` (refs/platforms/codex/codex-rs/hooks/src/events/common.rs:152)
// short-circuits the regex engine when matcher chars are all
// [A-Za-z0-9_|]. Pinning matchers to that charset avoids the crate's
// limitations entirely. Drift-guard for future regressions.
describe("Codex matcher #547 — is_exact_matcher charset compliance", () => {
  const EXACT_MATCHER_CHARSET = /^[A-Za-z0-9_|]+$/;

  it("EXTERNAL_MCP_MATCHER_PATTERN passes is_exact_matcher charset", async () => {
    const { EXTERNAL_MCP_MATCHER_PATTERN } = await import(
      "../../src/adapters/codex/hooks.js"
    );
    expect(EXTERNAL_MCP_MATCHER_PATTERN).toMatch(EXACT_MATCHER_CHARSET);
  });

  it("PRE_TOOL_USE_MATCHER_PATTERN (adapter source constant) passes is_exact_matcher charset", () => {
    const path = resolve(__dirname, "..", "..", "src", "adapters", "codex", "index.ts");
    const src = readFileSync(path, "utf8");
    const m = src.match(/PRE_TOOL_USE_MATCHER_PATTERN\s*=\s*"([^"]+)"/);
    if (!m) throw new Error("PRE_TOOL_USE_MATCHER_PATTERN constant not found");
    // TS source uses \\ for a literal backslash. Convert to runtime form.
    const runtimeMatcher = m[1].replace(/\\\\/g, "\\");
    expect(runtimeMatcher).toMatch(EXACT_MATCHER_CHARSET);
  });

  it("configs/codex/hooks.json PreToolUse matcher passes is_exact_matcher charset", () => {
    const path = resolve(__dirname, "..", "..", "configs", "codex", "hooks.json");
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };
    const matcher = parsed.hooks.PreToolUse[0]?.matcher ?? "";
    expect(matcher).toMatch(EXACT_MATCHER_CHARSET);
  });

  it("hooks/hooks.json (universal bundle) MCP catch-all matcher passes is_exact_matcher charset", () => {
    // hooks/hooks.json is the universal bundled file Codex ALSO loads via
    // the plugin cache. The MCP catch-all matcher must drop the lookahead so
    // Codex's regex crate does not reject the file at boot. Claude Code
    // continues to treat the literal `mcp__` as a substring matcher.
    const path = resolve(__dirname, "..", "..", "hooks", "hooks.json");
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };
    const matchers = (parsed.hooks.PreToolUse ?? []).map((e) => e.matcher);
    // Whichever entry was the external-MCP catch-all must now be charset-clean.
    const mcpCatchAll = matchers.find(
      (m) => m && m.startsWith("mcp__") && !m.includes("ctx_"),
    );
    expect(mcpCatchAll, "expected an mcp__ catch-all matcher in hooks.json").toBeDefined();
    expect(mcpCatchAll).toMatch(EXACT_MATCHER_CHARSET);
  });
});
