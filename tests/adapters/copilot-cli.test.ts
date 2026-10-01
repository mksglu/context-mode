import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { CopilotCliAdapter, copilotCliMcpConfigPath } from "../../src/adapters/copilot-cli/index.js";
import { HOOK_TYPES, HOOK_SCRIPTS, buildHookCommand } from "../../src/adapters/copilot-cli/hooks.js";

describe("CopilotCliAdapter", () => {
  let adapter: CopilotCliAdapter;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.COPILOT_HOME;
    delete process.env.CONTEXT_MODE_DATA_DIR;
    adapter = new CopilotCliAdapter();
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  describe("capabilities", () => {
    it("uses json-stdio hooks", () => {
      expect(adapter.paradigm).toBe("json-stdio");
      expect(adapter.capabilities.preToolUse).toBe(true);
      expect(adapter.capabilities.postToolUse).toBe(true);
      expect(adapter.capabilities.preCompact).toBe(true);
      expect(adapter.capabilities.sessionStart).toBe(true);
    });
  });

  describe("paths", () => {
    it("uses ~/.copilot/mcp-config.json for MCP registration", () => {
      expect(copilotCliMcpConfigPath()).toBe(resolve(homedir(), ".copilot", "mcp-config.json"));
    });

    it("uses ~/.copilot/hooks/context-mode.json for hook registration", () => {
      expect(adapter.getSettingsPath()).toBe(
        resolve(homedir(), ".copilot", "hooks", "context-mode.json"),
      );
    });

    it("honors COPILOT_HOME", () => {
      process.env.COPILOT_HOME = resolve(homedir(), "custom-copilot");
      expect(copilotCliMcpConfigPath()).toBe(
        resolve(homedir(), "custom-copilot", "mcp-config.json"),
      );
      expect(adapter.getSettingsPath()).toBe(
        resolve(homedir(), "custom-copilot", "hooks", "context-mode.json"),
      );
    });

    it("session dir is under ~/.copilot/context-mode/sessions", () => {
      const sessionDir = adapter.getSessionDir();
      expect(sessionDir).toBe(join(homedir(), ".copilot", "context-mode", "sessions"));
    });

    it("session dir follows COPILOT_HOME so the server and hook runtime agree", () => {
      // The hook runtime honors COPILOT_HOME (COPILOT_OPTS.configDirEnv); the
      // server's getSessionDir() must too, or writes and reads diverge.
      process.env.COPILOT_HOME = resolve(homedir(), "custom-copilot");
      expect(adapter.getSessionDir()).toBe(
        join(resolve(homedir(), "custom-copilot"), "context-mode", "sessions"),
      );
    });
  });

  describe("hook config", () => {
    it("preserves custom hooks and their ordering when refreshing context-mode", () => {
      const before = { type: "command", command: "node policy-check.mjs", timeoutSec: 15 };
      const after = { type: "command", command: "node audit-event.mjs", cwd: "/audit" };
      adapter.writeSettings({
        version: 1,
        customSetting: { retained: true },
        hooks: {
          [HOOK_TYPES.PRE_TOOL_USE]: [before, {
            type: "command",
            command: buildHookCommand(HOOK_TYPES.PRE_TOOL_USE),
            timeoutSec: 30,
          }, after],
          customEvent: [after],
        },
      });

      adapter.configureAllHooks("/any/plugin/root");
      const written = adapter.readSettings()!;
      const hooks = written.hooks as Record<string, unknown[]>;
      expect(hooks[HOOK_TYPES.PRE_TOOL_USE]).toEqual([before, {
        type: "command",
        command: buildHookCommand(HOOK_TYPES.PRE_TOOL_USE),
        timeoutSec: 30,
      }, after]);
      expect(hooks.customEvent).toEqual([after]);
      expect(written.customSetting).toEqual({ retained: true });
      expect(adapter.configureAllHooks("/any/plugin/root")).toEqual([]);
    });

    it.each(Object.values(HOOK_TYPES))("adds %s alongside existing custom callbacks", (hookType) => {
      const external = {
        type: "command",
        command: "node ./company-pretooluse.mjs",
        bash: "./guard.sh",
        powershell: ".\\guard.ps1",
        timeoutSec: 15,
      };
      const http = { type: "http", url: "https://audit.invalid/events" };
      adapter.writeSettings({ version: 1, hooks: { [hookType]: [external, http] } });
      adapter.configureAllHooks("/any/plugin/root");
      const hooks = adapter.readSettings()!.hooks as Record<string, unknown[]>;
      expect(hooks[hookType]).toEqual([external, http, {
        type: "command", command: buildHookCommand(hookType),
      }]);
      expect(adapter.configureAllHooks("/any/plugin/root")).toEqual([]);
    });

    it("buildHookCommand emits CLI dispatcher form", () => {
      expect(buildHookCommand(HOOK_TYPES.PRE_TOOL_USE)).toBe("context-mode hook copilot-cli pretooluse");
    });

    it("generateHookConfig writes flat entries for every hook", () => {
      const config = adapter.generateHookConfig("/any/plugin/root") as Record<string, Array<{ command?: string; hooks?: unknown }>>;
      expect(Object.keys(config).sort()).toEqual(Object.values(HOOK_TYPES).sort());
      for (const [hookType, entries] of Object.entries(config)) {
        expect(HOOK_SCRIPTS[hookType]).toBeDefined();
        // Dispatch token = the .mjs script base (decoupled from the camelCase
        // host event name), e.g. event "userPromptSubmitted" -> "userpromptsubmit".
        const token = HOOK_SCRIPTS[hookType].replace(/\.mjs$/, "");
        expect(entries[0].command).toBe(`context-mode hook copilot-cli ${token}`);
        expect(entries[0].hooks).toBeUndefined();
      }
    });

    it("configureAllHooks writes version:1 + flat hooks, then is idempotent", () => {
      const settingsPath = adapter.getSettingsPath();
      rmSync(settingsPath, { force: true });

      const changes = adapter.configureAllHooks("/any/plugin/root");
      expect(changes.length).toBeGreaterThan(0);

      const written = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
        version?: number;
        hooks?: Record<string, Array<{ type?: string; command?: string; hooks?: unknown }>>;
      };
      // We pin a top-level version:1 explicitly. Per copilot-cli
      // changelog.md:1109 the version field is OPTIONAL (the CLI accepts files
      // that omit it); we still emit it to make the schema self-documenting.
      expect(written.version).toBe(1);
      expect(written.hooks?.[HOOK_TYPES.PRE_TOOL_USE]?.[0]).toEqual({
        type: "command",
        command: "context-mode hook copilot-cli pretooluse",
      });
      // Flat shape — no nested Claude-Code matcher/hooks wrapper.
      expect(written.hooks?.[HOOK_TYPES.PRE_TOOL_USE]?.[0].hooks).toBeUndefined();

      // A second run sees no drift and writes nothing.
      expect(adapter.configureAllHooks("/any/plugin/root")).toEqual([]);
    });
  });

  describe("parse and format", () => {
    it("parses snake_case Copilot CLI payload", () => {
      const event = adapter.parsePreToolUseInput({
        session_id: "copilot-session",
        cwd: "/repo",
        tool_name: "Bash",
        tool_input: { command: "pwd" },
      });

      expect(event.sessionId).toBe("copilot-session");
      expect(event.projectDir).toBe("/repo");
      expect(event.toolName).toBe("Bash");
      expect(event.toolInput).toEqual({ command: "pwd" });
    });

    it("formats PreToolUse decisions with Copilot CLI top-level fields", () => {
      expect(adapter.formatPreToolUseResponse({
        decision: "deny",
        reason: "no",
      })).toEqual({
        permissionDecision: "deny",
        permissionDecisionReason: "no",
      });

      expect(adapter.formatPreToolUseResponse({
        decision: "modify",
        updatedInput: { command: "echo ok" },
      })).toEqual({
        modifiedArgs: { command: "echo ok" },
      });

      expect(adapter.formatPreToolUseResponse({
        decision: "context",
        additionalContext: "ctx",
      })).toEqual({
        additionalContext: "ctx",
      });
    });

    it("formats SessionStart context as top-level additionalContext", () => {
      expect(adapter.formatSessionStartResponse({ context: "hello" })).toEqual({
        additionalContext: "hello",
      });
    });
  });

  describe("plugin registration", () => {
    it("fails with manual-MCP remediation when mcp-config.json is missing", () => {
      rmSync(copilotCliMcpConfigPath(), { force: true });

      // `context-mode upgrade` writes hooks only; Copilot CLI's own
      // `copilot mcp add` is the clean way to register the MCP server.
      expect(adapter.checkPluginRegistration()).toMatchObject({
        check: "MCP registration",
        status: "fail",
        fix: "copilot mcp add context-mode -- context-mode",
      });
    });

    it("passes MCP registration when running from the Copilot plugin bundle", () => {
      process.env.CONTEXT_MODE_COPILOT_PLUGIN = "1";
      rmSync(copilotCliMcpConfigPath(), { force: true });

      expect(adapter.checkPluginRegistration()).toMatchObject({
        check: "MCP registration",
        status: "pass",
        message: expect.stringContaining("Copilot CLI plugin bundle"),
      });
    });

    it("treats user-level Copilot config as standalone for version comparison", () => {
      mkdirSync(resolve(homedir(), ".copilot"), { recursive: true });
      rmSync(copilotCliMcpConfigPath(), { force: true });
      rmSync(adapter.getSettingsPath(), { force: true });
      expect(adapter.getInstalledVersion()).toBe("not installed");

      mkdirSync(resolve(homedir(), ".copilot", "hooks"), { recursive: true });
      adapter.configureAllHooks("/any/plugin/root");

      expect(adapter.getInstalledVersion()).toBe("standalone");
    });
  });

  describe("doctor hook validation", () => {
    it("validates all six user-level Copilot hook events", () => {
      rmSync(adapter.getSettingsPath(), { force: true });
      adapter.configureAllHooks("/any/plugin/root");

      const results = adapter.validateHooks("/any/plugin/root");
      expect(results.find((r) => r.check === "Hooks schema version")).toMatchObject({ status: "pass" });
      for (const hookName of Object.values(HOOK_TYPES)) {
        expect(results.find((r) => r.check === `${hookName} hook`)).toMatchObject({
          status: "pass",
        });
      }
    });

    it("validates the bundled plugin hooks when the MCP came from the Copilot plugin", () => {
      process.env.CONTEXT_MODE_COPILOT_PLUGIN = "1";
      rmSync(adapter.getSettingsPath(), { force: true });

      const results = adapter.validateHooks(process.cwd());
      expect(results.find((r) => r.check === "Hooks schema version")).toMatchObject({ status: "pass" });
      for (const hookName of Object.values(HOOK_TYPES)) {
        expect(results.find((r) => r.check === `${hookName} hook`)).toMatchObject({
          status: "pass",
          message: expect.stringContaining("plugin bundle"),
        });
      }
    });
  });
});

/**
 * Guards the shipped GitHub Copilot CLI plugin bundle (configs/copilot-cli/),
 * which users install with `copilot plugin install mksglu/context-mode:configs/copilot-cli`.
 *
 * Copilot auto-discovers a plugin's components from fixed filenames (verified
 * against real marketplace plugins, github/copilot-plugins + github/awesome-copilot):
 *   MCP    → `.mcp.json` in the plugin root
 *   skills → `skills/<name>/SKILL.md`
 *   manifest (optional metadata) → `.github/plugin/plugin.json`
 *
 * Unlike every other bundle in this repo, this `.mcp.json` IS committed: a
 * Copilot plugin has no other way to declare MCP, so .gitignore un-ignores
 * exactly `configs/copilot-cli/.mcp.json` (the repo-wide `.mcp.json` ignore from
 * #253/#531 guards the repo-ROOT dev file, not a plugin's own config).
 */
const PLUGIN = resolve(__dirname, "..", "..", "configs", "copilot-cli");
const REPO_ROOT = resolve(__dirname, "..", "..");

describe("configs/copilot-cli — GitHub Copilot CLI plugin bundle", () => {
  it("ships a COMMITTED .mcp.json (git must not ignore it)", () => {
    const mcpPath = resolve(PLUGIN, ".mcp.json");
    expect(existsSync(mcpPath)).toBe(true);
    // The repo-wide `.mcp.json` ignore must be negated for this one path, or the
    // plugin ships with no MCP config and `copilot plugin install` is a no-op.
    let ignored = "";
    try {
      ignored = execFileSync("git", ["check-ignore", "configs/copilot-cli/.mcp.json"], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      }).trim();
    } catch {
      // `git check-ignore` exits non-zero (no output) when the path is NOT
      // ignored — exactly what we want.
    }
    expect(ignored).toBe("");
  });

  it(".mcp.json declares the context-mode server pinned to CONTEXT_MODE_PLATFORM=copilot-cli", () => {
    const mcp = JSON.parse(readFileSync(resolve(PLUGIN, ".mcp.json"), "utf-8"));
    const server = mcp.mcpServers?.["context-mode"];
    expect(server?.command).toBe("context-mode");
    // Copilot CLI 1.0.44 rejects stdio MCP plugin entries when `args` is
    // missing, even when the server takes no arguments. Keep the explicit empty
    // array so local plugin loading works across older and newer Copilot CLI.
    expect(server?.args).toEqual([]);
    // The env pin is the whole point: it makes the server self-identify as
    // Copilot, so ctx_upgrade / platform detection resolve copilot-cli even when
    // Claude Code is co-installed (otherwise ~/.claude wins and writes Claude's
    // config instead of Copilot's).
    expect(server?.env?.CONTEXT_MODE_PLATFORM).toBe("copilot-cli");
    expect(server?.env?.CONTEXT_MODE_COPILOT_PLUGIN).toBe("1");
  });

  it("ships the routing skill at skills/context-mode/SKILL.md", () => {
    const skillPath = resolve(PLUGIN, "skills", "context-mode", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    const skill = readFileSync(skillPath, "utf-8");
    expect(skill).toContain("name: context-mode");
    expect(skill).toMatch(/ctx_execute|ctx_batch_execute/);
  });

  it("manifest declares name + the skill dir", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(PLUGIN, ".github", "plugin", "plugin.json"), "utf-8"),
    );
    expect(manifest.name).toBe("context-mode");
    expect(manifest.skills).toContain("./skills/context-mode");
  });

  it("hooks.json wires the capture hooks via the global `context-mode hook copilot-cli` dispatcher", () => {
    // Copilot auto-discovers a root `hooks.json` (version 1). The bundle ships
    // the SAME shape `context-mode upgrade` writes to ~/.copilot/hooks/ — so a
    // plugin install registers the hooks with no `upgrade` / agent call. Keep
    // them byte-equivalent: the standalone path is what's verified against the
    // @github/copilot binary, and divergence would silently break capture.
    const hooks = JSON.parse(readFileSync(resolve(PLUGIN, "hooks.json"), "utf-8"));
    expect(hooks.version).toBe(1);
    // preToolUse (routing/veto) + sessionStart are the required pair; the rest
    // are capture. All six dispatch the global binary, not a bundled script.
    // Event keys are Copilot's native camelCase. (PascalCase is also accepted
    // and fires — copilot-cli changelog.md:1065 — so casing is not load-bearing;
    // we use camelCase as the CLI's native naming.) The dispatch token (arg) is
    // the lowercase .mjs script base, decoupled from the event casing.
    for (const [event, arg] of [
      ["preToolUse", "pretooluse"],
      ["postToolUse", "posttooluse"],
      ["sessionStart", "sessionstart"],
      ["userPromptSubmitted", "userpromptsubmit"],
      ["agentStop", "stop"],
      ["preCompact", "precompact"],
    ] as const) {
      const entry = hooks.hooks?.[event]?.[0];
      expect(entry?.type).toBe("command");
      expect(entry?.command).toBe(`context-mode hook copilot-cli ${arg}`);
    }
  });
});
