import "../setup-home";
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, parse, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { OpenCodeAdapter } from "../../src/adapters/opencode/index.js";
import pluginDefault, { ContextModePlugin } from "../../src/adapters/opencode/plugin.js";
import { getCore, resetCoreCache } from "../../src/adapters/opencode/core.js";
import { parseOpencodeV2StepUsage } from "../../src/session/extract.js";
import { isMCPReady, sentinelPathForPid } from "../../hooks/core/mcp-ready.mjs";

function env(home: string) {
  const root = parse(home).root;
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    HOMEDRIVE: root.replace(/[\\/]+$/, ""),
    HOMEPATH: home.slice(root.length) || root,
  };
}

describe("OpenCodeAdapter", () => {
  describe("OpenCode platform (default)", () => {
    let adapter: OpenCodeAdapter;

    beforeEach(() => {
      adapter = new OpenCodeAdapter();
    });

  // ── Capabilities ──────────────────────────────────────

  describe("capabilities", () => {
    it("sessionStart is true", () => {
      expect(adapter.capabilities.sessionStart).toBe(true);
    });

    it("canInjectSessionContext is true", () => {
      expect(adapter.capabilities.canInjectSessionContext).toBe(true);
    });

    it("preToolUse and postToolUse are true", () => {
      expect(adapter.capabilities.preToolUse).toBe(true);
      expect(adapter.capabilities.postToolUse).toBe(true);
    });

    it("paradigm is ts-plugin", () => {
      expect(adapter.paradigm).toBe("ts-plugin");
    });
  });

  // ── parsePreToolUseInput ──────────────────────────────

  describe("parsePreToolUseInput", () => {
    it("extracts sessionId from sessionID (camelCase)", () => {
      const event = adapter.parsePreToolUseInput({
        tool: "shell",
        sessionID: "oc-session-123",
      });
      expect(event.sessionId).toBe("oc-session-123");
    });

    it("projectDir falls back to cwd when no OPENCODE_PROJECT_DIR", () => {
      const event = adapter.parsePreToolUseInput({
        tool: "shell",
      });
      expect(event.projectDir).toBe(process.cwd());
    });

    it("extracts toolName from tool", () => {
      const event = adapter.parsePreToolUseInput({
        tool: "read_file",
        args: { path: "/some/file" },
      });
      expect(event.toolName).toBe("read_file");
    });

    it("falls back to pid when no sessionID", () => {
      const event = adapter.parsePreToolUseInput({
        tool: "shell",
      });
      expect(event.sessionId).toBe(`pid-${process.ppid}`);
    });
  });

  // ── formatPreToolUseResponse ──────────────────────────

  describe("formatPreToolUseResponse", () => {
    it("throws Error for deny decision", () => {
      expect(() =>
        adapter.formatPreToolUseResponse({
          decision: "deny",
          reason: "Blocked",
        }),
      ).toThrow("Blocked");
    });

    it("throws Error with default message when no reason for deny", () => {
      expect(() =>
        adapter.formatPreToolUseResponse({
          decision: "deny",
        }),
      ).toThrow("Blocked by context-mode hook");
    });

    it("returns args object for modify", () => {
      const updatedInput = { command: "echo hi" };
      const result = adapter.formatPreToolUseResponse({
        decision: "modify",
        updatedInput,
      });
      expect(result).toEqual({ args: updatedInput });
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
    it("formats updatedOutput as output field", () => {
      const result = adapter.formatPostToolUseResponse({
        updatedOutput: "New output",
      });
      expect(result).toEqual({ output: "New output" });
    });

    it("formats additionalContext", () => {
      const result = adapter.formatPostToolUseResponse({
        additionalContext: "Extra info",
      });
      expect(result).toEqual({ additionalContext: "Extra info" });
    });

    it("returns undefined for empty response", () => {
      const result = adapter.formatPostToolUseResponse({});
      expect(result).toBeUndefined();
    });
  });

  // ── parseSessionStartInput ────────────────────────────

  describe("parseSessionStartInput", () => {
    it("parses startup source by default", () => {
      const event = adapter.parseSessionStartInput({});
      expect(event.source).toBe("startup");
      expect(event.projectDir).toBe(process.cwd());
    });

    it("parses compact source", () => {
      const event = adapter.parseSessionStartInput({ source: "compact" });
      expect(event.source).toBe("compact");
    });

    it("parses resume source", () => {
      const event = adapter.parseSessionStartInput({ source: "resume" });
      expect(event.source).toBe("resume");
    });

    it("parses clear source", () => {
      const event = adapter.parseSessionStartInput({ source: "clear" });
      expect(event.source).toBe("clear");
    });

    it("extracts sessionId from sessionID", () => {
      const event = adapter.parseSessionStartInput({ sessionID: "oc-123" });
      expect(event.sessionId).toBe("oc-123");
    });
  });

  // ── Config paths ──────────────────────────────────────

  describe("config paths", () => {
    it("settings path is opencode.json (relative)", () => {
      expect(adapter.getSettingsPath()).toBe(resolve("opencode.json"));
    });

    it("session dir is under platform-specific config directory", () => {
      const sessionDir = adapter.getSessionDir();
      let expectedDir: string;
      if (process.platform === "win32") {
        const configDir = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
        expectedDir = join(configDir, "opencode", "context-mode", "sessions");
      } else {
        const configDir = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
        expectedDir = join(configDir, "opencode", "context-mode", "sessions");
      }
      expect(sessionDir).toBe(expectedDir);
    });

    it("configureAllHooks writes back to the global config it read", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const home = join(root, "home");
      const conf = join(home, ".config", "opencode");
      const file = join(conf, "opencode.json");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      mkdirSync(conf, { recursive: true });
      writeFileSync(file, JSON.stringify({ plugin: [] }, null, 2) + "\n");
      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify({backup:a.backupSettings(),changes:a.configureAllHooks('/tmp/plugin')}))`,
        ],
        {
          cwd: dir,
          env: env(home),
          encoding: "utf-8",
        },
      );

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({
        backup: file + ".bak",
        changes: ["Added context-mode to plugin array"],
      });
      expect(() => readFileSync(resolve(dir, "opencode.json"), "utf-8")).toThrow();
      expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ plugin: ["context-mode"] });

      rmSync(root, { recursive: true, force: true });
    });

    it("configureAllHooks removes legacy context-mode MCP block for plugin-only mode (#574)", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const home = join(root, "home");
      const conf = join(home, ".config", "opencode");
      const file = join(conf, "opencode.json");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      mkdirSync(conf, { recursive: true });
      writeFileSync(file, JSON.stringify({
        mcp: {
          "context-mode": {
            type: "local",
            command: ["context-mode"],
          },
          other: { type: "local", command: ["other"] },
        },
        plugin: ["context-mode"],
      }, null, 2) + "\n");

      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.configureAllHooks('/tmp/plugin')))`,
        ],
        { cwd: dir, env: env(home), encoding: "utf-8" },
      );

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout)).toContain("Removed legacy context-mode MCP block (plugin-native tools)");
      expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({
        mcp: { other: { type: "local", command: ["other"] } },
        plugin: ["context-mode"],
      });

      rmSync(root, { recursive: true, force: true });
    });

    it("validateHooks warns when a legacy mcp.context-mode block remains after upgrade (#574)", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const home = join(root, "home");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "opencode.json"), JSON.stringify({
        mcp: { "context-mode": { type: "local", command: ["context-mode"] } },
        plugin: ["context-mode"],
      }, null, 2) + "\n");

      const prevHome = process.env.HOME;
      const prevUserProfile = process.env.USERPROFILE;
      Object.assign(process.env, env(home));
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const results = new OpenCodeAdapter().validateHooks("/tmp/plugin");
        expect(results).toContainEqual(expect.objectContaining({
          check: "Legacy MCP registration",
          status: "warn",
          fix: expect.stringContaining("removes only mcp.context-mode"),
        }));
      } finally {
        process.chdir(cwd);
        if (prevHome !== undefined) process.env.HOME = prevHome;
        else delete process.env.HOME;
        if (prevUserProfile !== undefined) process.env.USERPROFILE = prevUserProfile;
        else delete process.env.USERPROFILE;
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("readSettings prioritizes config with context-mode plugin", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const home = join(root, "home");
      const conf = join(home, ".config", "opencode");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      mkdirSync(conf, { recursive: true });
      writeFileSync(join(conf, "opencode.json"), JSON.stringify({ plugin: ["other-plugin"] }, null, 2) + "\n");
      writeFileSync(resolve(dir, "opencode.json"), JSON.stringify({ plugin: ["context-mode"] }, null, 2) + "\n");
      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();a.readSettings();console.log(JSON.stringify({path:a.settingsPath}))`,
        ],
        {
          cwd: dir,
          env: env(home),
          encoding: "utf-8",
        },
      );

      expect(run.status).toBe(0);
      const resultPath = JSON.parse(run.stdout).path;
      expect(resultPath).toContain(join("project", "opencode.json"));

      rmSync(root, { recursive: true, force: true });
    });

    it("readSettings falls back to global config when no plugin found", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const home = join(root, "home");
      const conf = join(home, ".config", "opencode");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      mkdirSync(conf, { recursive: true });
      writeFileSync(join(conf, "opencode.json"), JSON.stringify({ plugin: ["other-plugin"] }, null, 2) + "\n");
      writeFileSync(resolve(dir, "opencode.json"), JSON.stringify({ plugin: [] }, null, 2) + "\n");
      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();a.readSettings();console.log(JSON.stringify({path:a.settingsPath}))`,
        ],
        {
          cwd: dir,
          env: env(home),
          encoding: "utf-8",
        },
      );

      expect(run.status).toBe(0);
      const resultPath = JSON.parse(run.stdout).path;
      expect(resultPath).toContain(join(home, ".config", "opencode", "opencode.json"));

      rmSync(root, { recursive: true, force: true });
    });

    it("readSettings reads opencode.jsonc with comments stripped", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "opencode.jsonc"),
        `{
  // This is a line comment
  "plugin": ["context-mode"],
  /* Block comment */
  "version": "1.0"
}
`,
      );
      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.readSettings()))`,
        ],
        { cwd: dir, env: env(join(root, "home")), encoding: "utf-8" },
      );
      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({ plugin: ["context-mode"], version: "1.0" });
      rmSync(root, { recursive: true, force: true });
    });

    // Issue #806: the naive line-comment regex (/\/\/.*$/gm) truncated every
    // string value containing `//` — e.g. "$schema" or mcp URLs — so a
    // perfectly valid opencode.jsonc failed JSON.parse, readSettings returned
    // null, and doctor reported "[FAIL] Plugin configuration: Could not read
    // opencode.json or opencode.jsonc".
    it("readSettings parses opencode.jsonc whose string values contain URLs (#806)", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "opencode.jsonc"),
        `{
  "$schema": "https://opencode.ai/config.json",
  // context-mode plugin registration
  "plugin": ["context-mode/plugin"],
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" }
  }
}
`,
      );
      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.readSettings()))`,
        ],
        { cwd: dir, env: env(join(root, "home")), encoding: "utf-8" },
      );
      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({
        $schema: "https://opencode.ai/config.json",
        plugin: ["context-mode/plugin"],
        mcp: { context7: { type: "remote", url: "https://mcp.context7.com/mcp" } },
      });
      rmSync(root, { recursive: true, force: true });
    });

    // #849: when both exist, opencode.jsonc is authoritative — OpenCode merges
    // the project-root `.jsonc` LAST (refs/.../config/config.ts:406-408 +
    // paths.ts:15-22), so its values win. readSettings must surface the .jsonc
    // (and target it for writes), not the .json, to avoid shadowing.
    it("prefers opencode.jsonc over opencode.json when both exist (#849)", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "opencode.json"), JSON.stringify({ from: "json" }));
      writeFileSync(join(dir, "opencode.jsonc"), `{ /* comment */ "from": "jsonc" }`);
      const run = spawnSync(
        process.execPath,
        [
          tsx,
          "-e",
          `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();const s=a.readSettings();console.log(JSON.stringify({settings:s,path:a.settingsPath}))`,
        ],
        { cwd: dir, env: env(join(root, "home")), encoding: "utf-8" },
      );
      expect(run.status).toBe(0);
      const out = JSON.parse(run.stdout);
      expect(out.settings).toEqual({ from: "jsonc" });
      expect(out.path).toContain(join("project", "opencode.jsonc"));
      rmSync(root, { recursive: true, force: true });
    });

    it("configureAllHooks works with opencode.jsonc", () => {
      const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
      const dir = join(root, "project");
      const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
      const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "opencode.jsonc"),
        `{
  // My config
  "plugin": []
}
`,
        );
        const run = spawnSync(
          process.execPath,
          [
            tsx,
            "-e",
            `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.configureAllHooks('/tmp/plugin')))`,
          ],
          { cwd: dir, env: env(join(root, "home")), encoding: "utf-8" },
        );
        expect(run.status).toBe(0);
        expect(JSON.parse(run.stdout)).toEqual(["Added context-mode to plugin array"]);
        // Should write back to .jsonc (same file it read)
        expect(JSON.parse(readFileSync(join(dir, "opencode.jsonc"), "utf-8"))).toEqual({
          plugin: ["context-mode"],
        });
        rmSync(root, { recursive: true, force: true });
      });

      // #849: when both opencode.json (placeholder) and opencode.jsonc (real
      // config) exist, configureAllHooks must write into the .jsonc — the file
      // OpenCode treats as authoritative (loaded last in the project-config
      // merge, refs/.../config/config.ts:406-408 + paths.ts:15-22) — and must
      // NOT mutate the placeholder .json into a shadowing config.
      it("configureAllHooks writes into opencode.jsonc, not the shadowing opencode.json, when both exist (#849)", () => {
        const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
        const dir = join(root, "project");
        const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
        const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
        mkdirSync(dir, { recursive: true });
        // Placeholder .json (e.g. auto-generated stub) with no real config.
        writeFileSync(join(dir, "opencode.json"), "{}\n");
        // The user's REAL config lives in .jsonc (with comments + settings).
        writeFileSync(
          join(dir, "opencode.jsonc"),
          `{
  // My real OpenCode config
  "theme": "tokyonight",
  "plugin": ["my-plugin"]
}
`,
        );
        const run = spawnSync(
          process.execPath,
          [
            tsx,
            "-e",
            `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.configureAllHooks('/tmp/plugin')))`,
          ],
          { cwd: dir, env: env(join(root, "home")), encoding: "utf-8" },
        );
        expect(run.status).toBe(0);

        // context-mode must be merged INTO the real .jsonc config, preserving it.
        const jsonc = JSON.parse(readFileSync(join(dir, "opencode.jsonc"), "utf-8"));
        expect(jsonc).toEqual({
          theme: "tokyonight",
          plugin: ["my-plugin", "context-mode"],
        });

        // The placeholder .json must stay an untouched empty object — never a
        // shadowing config that overrides the user's .jsonc.
        const jsonPlaceholder = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"));
        expect(jsonPlaceholder).toEqual({});

        rmSync(root, { recursive: true, force: true });
      });

      it("validates hooks with jsonc config shows correct error message", () => {
        const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
        const dir = join(root, "project");
        const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
        const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
        mkdirSync(dir, { recursive: true });
        // No config file at all
        const run = spawnSync(
          process.execPath,
          [
            tsx,
            "-e",
            `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.validateHooks('/tmp')))`,
          ],
          { cwd: dir, env: env(join(root, "home")), encoding: "utf-8" },
        );
        expect(run.status).toBe(0);
        const results = JSON.parse(run.stdout);
        const pluginCheck = results.find((r: { check: string }) => r.check === "Plugin configuration");
        expect(pluginCheck.message).toContain("jsonc");
        rmSync(root, { recursive: true, force: true });
      });

      it("configureAllHooks writes back to .opencode/opencode.json when that is the selected config", () => {
        const root = mkdtempSync(join(tmpdir(), "opencode-adapter-"));
        const dir = join(root, "project");
        const home = join(root, "home");
        const conf = join(dir, ".opencode");
        const file = join(conf, "opencode.json");
        const src = resolve(process.cwd(), "src", "adapters", "opencode", "index.ts");
        const tsx = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
        mkdirSync(dir, { recursive: true });
        mkdirSync(conf, { recursive: true });
        writeFileSync(file, JSON.stringify({ plugin: [] }, null, 2) + "\n");
        const run = spawnSync(
          process.execPath,
          [
            tsx,
            "-e",
            `import { OpenCodeAdapter } from ${JSON.stringify(src)};const a=new OpenCodeAdapter();console.log(JSON.stringify(a.configureAllHooks('/tmp/plugin')))`,
          ],
          {
            cwd: dir,
            env: env(home),
            encoding: "utf-8",
          },
        );

        expect(run.status).toBe(0);
        expect(JSON.parse(run.stdout)).toEqual(["Added context-mode to plugin array"]);
        expect(() => readFileSync(resolve(dir, "opencode.json"), "utf-8")).toThrow();
        expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ plugin: ["context-mode"] });

        rmSync(root, { recursive: true, force: true });
      });
    });
  });
});

describe("OpenCodeAdapter for KiloCode", () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter("kilo");
  });

  describe("constructor and name", () => {
    it("accepts kilo platform parameter", () => {
      expect(adapter).toBeInstanceOf(OpenCodeAdapter);
    });

    it("returns KiloCode as name when platform is kilo", () => {
      expect(adapter.name).toBe("KiloCode");
    });
  });

  describe("capabilities", () => {
    it("has same capabilities as OpenCode", () => {
      expect(adapter.capabilities.sessionStart).toBe(true);
      expect(adapter.capabilities.canInjectSessionContext).toBe(true);
      expect(adapter.capabilities.preToolUse).toBe(true);
      expect(adapter.capabilities.postToolUse).toBe(true);
      expect(adapter.paradigm).toBe("ts-plugin");
    });
  });

  describe("config paths", () => {
    it("settings path is kilo.json (relative)", () => {
      expect(adapter.getSettingsPath()).toBe(resolve("kilo.json"));
    });

    it("session dir is under platform-specific config directory", () => {
      const sessionDir = adapter.getSessionDir();
      let expectedDir: string;
      if (process.platform === "win32") {
        const configDir = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
        expectedDir = join(configDir, "kilo", "context-mode", "sessions");
      } else {
        const configDir = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
        expectedDir = join(configDir, "kilo", "context-mode", "sessions");
      }
      expect(sessionDir).toBe(expectedDir);
    });

    // Phase 7 Kilo-1 (LOW): Kilo runtime accepts `.kilocode/` as config dir
    // alongside `.kilo/` and `.opencode/`. See refs/platforms/kilo/packages/
    // opencode/src/kilocode/config/config.ts:50
    //   KILO_DIR_SUFFIXES = [".kilo", ".kilocode"]
    // Plugin loader globs {plugin,plugins}/*.{ts,js} in each config dir
    // (refs/.../config/plugin.ts:33), so `.kilocode/kilo.json[c]` must be
    // discoverable by the adapter for users who organize project config under
    // `.kilocode/` instead of `.kilo/`.
    it("readSettings discovers .kilocode/kilo.json", () => {
      const root = mkdtempSync(join(tmpdir(), "kilo-paths-"));
      const prev = process.cwd();
      try {
        mkdirSync(join(root, ".kilocode"), { recursive: true });
        writeFileSync(
          join(root, ".kilocode", "kilo.json"),
          JSON.stringify({ marker: "from-dot-kilocode" }),
        );
        process.chdir(root);
        const a = new OpenCodeAdapter("kilo");
        const settings = a.readSettings() as { marker?: string } | null;
        expect(settings?.marker).toBe("from-dot-kilocode");
      } finally {
        process.chdir(prev);
        rmSync(root, { recursive: true, force: true });
      }
    });

    // Issue #806 (kilo path): the same adapter parses kilo.jsonc, so URLs in
    // string values must survive comment stripping there too.
    it("readSettings parses kilo.jsonc whose string values contain URLs (#806)", () => {
      const root = mkdtempSync(join(tmpdir(), "kilo-jsonc-url-"));
      const prev = process.cwd();
      try {
        writeFileSync(
          join(root, "kilo.jsonc"),
          `{
  // kilo config with URL-bearing string values
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["context-mode/plugin"]
}
`,
        );
        process.chdir(root);
        const a = new OpenCodeAdapter("kilo");
        const settings = a.readSettings() as { $schema?: string; plugin?: string[] } | null;
        expect(settings?.$schema).toBe("https://opencode.ai/config.json");
        expect(settings?.plugin).toEqual(["context-mode/plugin"]);
      } finally {
        process.chdir(prev);
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // ── buildNodeCommand opts parameter (in-process plugin platforms) ──

  describe("buildNodeCommand opts parameter for in-process plugin platforms", () => {
    it("isInProcessPluginPlatform membership test", async () => {
      const { isInProcessPluginPlatform } = await import("../../src/adapters/types.js");
      expect(isInProcessPluginPlatform("opencode")).toBe(true);
      expect(isInProcessPluginPlatform("kilo")).toBe(true);
      expect(isInProcessPluginPlatform("claude-code")).toBe(false);
      expect(isInProcessPluginPlatform(undefined)).toBe(false);
    });

    it("buildNodeCommand substitutes jsRuntime for opencode/kilo when execPath is not node/bun/deno", async () => {
      const { buildNodeCommand } = await import("../../src/adapters/types.js");
      const cmd = buildNodeCommand("/script.mjs", { platform: "opencode", jsRuntime: "/usr/bin/bun" });
      // On Node.js, execPath ends with 'node', so no substitution occurs.
      // The test verifies the command still contains the script path.
      expect(cmd).toContain("/script.mjs");
    });

    it("buildNodeCommand falls back to 'node' when jsRuntime is undefined for in-process platforms", async () => {
      const { buildNodeCommand } = await import("../../src/adapters/types.js");
      const cmd = buildNodeCommand("/script.mjs", { platform: "kilo" });
      expect(cmd).toContain("node");
      expect(cmd).toContain("/script.mjs");
    });

    it("buildNodeCommand ignores opts for non in-process platforms", async () => {
      const { buildNodeCommand } = await import("../../src/adapters/types.js");
      const cmd = buildNodeCommand("/script.mjs", { platform: "claude-code", jsRuntime: "/usr/bin/bun" });
      // Should NOT substitute jsRuntime since claude-code is not an in-process platform
      expect(cmd).not.toContain("/usr/bin/bun");
      expect(cmd).toContain("/script.mjs");
    });
  });// ── buildNodeCommand opts parameter (in-process plugin platforms) ──

  describe("buildNodeCommand opts parameter for in-process plugin platforms", () => {
    it("isInProcessPluginPlatform membership test", async () => {
      const { isInProcessPluginPlatform } = await import("../../src/adapters/types.js");
      expect(isInProcessPluginPlatform("opencode")).toBe(true);
      expect(isInProcessPluginPlatform("kilo")).toBe(true);
      expect(isInProcessPluginPlatform("claude-code")).toBe(false);
      expect(isInProcessPluginPlatform(undefined)).toBe(false);
    });

    it("buildNodeCommand substitutes jsRuntime for opencode/kilo when execPath is not node/bun/deno", async () => {
      const { buildNodeCommand } = await import("../../src/adapters/types.js");
      const cmd = buildNodeCommand("/script.mjs", { platform: "opencode", jsRuntime: "/usr/bin/bun" });
      // On Node.js, execPath ends with 'node', so no substitution occurs.
      // The test verifies the command still contains the script path.
      expect(cmd).toContain("/script.mjs");
    });

    it("buildNodeCommand falls back to 'node' when jsRuntime is undefined for in-process platforms", async () => {
      const { buildNodeCommand } = await import("../../src/adapters/types.js");
      const cmd = buildNodeCommand("/script.mjs", { platform: "kilo" });
      expect(cmd).toContain("node");
      expect(cmd).toContain("/script.mjs");
    });

    it("buildNodeCommand ignores opts for non in-process platforms", async () => {
      const { buildNodeCommand } = await import("../../src/adapters/types.js");
      const cmd = buildNodeCommand("/script.mjs", { platform: "claude-code", jsRuntime: "/usr/bin/bun" });
      // Should NOT substitute jsRuntime since claude-code is not an in-process platform
      expect(cmd).not.toContain("/usr/bin/bun");
      expect(cmd).toContain("/script.mjs");
    });
  });
});

// ─────────────────────────────────────────────────────────
// v1 / v2 target axis
// ─────────────────────────────────────────────────────────

describe("OpenCodeAdapter v1/v2 target axis", () => {
  /**
   * Run `fn` against a fresh project dir + isolated HOME with `config` written
   * to opencode.json, using an adapter built for `target`. Restores cwd/env.
   */
  function withTargetConfig<T>(
    config: Record<string, unknown>,
    target: "v1" | "v2",
    fn: (adapter: OpenCodeAdapter, file: string) => T,
  ): T {
    const root = mkdtempSync(join(tmpdir(), "opencode-target-"));
    const dir = join(root, "project");
    const home = join(root, "home");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "opencode.json");
    writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    const prevHome = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    const cwd = process.cwd();
    Object.assign(process.env, env(home));
    process.chdir(dir);
    try {
      const adapter = new OpenCodeAdapter("opencode", target);
      return fn(adapter, file);
    } finally {
      process.chdir(cwd);
      if (prevHome !== undefined) process.env.HOME = prevHome;
      else delete process.env.HOME;
      if (prevUserProfile !== undefined) process.env.USERPROFILE = prevUserProfile;
      else delete process.env.USERPROFILE;
      rmSync(root, { recursive: true, force: true });
    }
  }

  describe("key getters", () => {
    it("v1 targets the singular `plugin` key", () => {
      const a = new OpenCodeAdapter("opencode", "v1");
      expect(a.pluginKey).toBe("plugin");
      expect(a.oppositeKey).toBe("plugins");
    });

    it("v2 targets the plural `plugins` key", () => {
      const a = new OpenCodeAdapter("opencode", "v2");
      expect(a.pluginKey).toBe("plugins");
      expect(a.oppositeKey).toBe("plugin");
    });

    it("defaults to v1 when no target is passed", () => {
      const a = new OpenCodeAdapter("opencode");
      expect(a.pluginKey).toBe("plugin");
    });
  });

  describe("configureAllHooks (7.1 / 7.3)", () => {
    it("v2 writes the `plugins` key and leaves no `plugin` key", () => {
      withTargetConfig({}, "v2", (_a, file) => {
        const adapter = new OpenCodeAdapter("opencode", "v2");
        const changes = adapter.configureAllHooks("/tmp/plugin");
        expect(changes).toContain("Added context-mode to plugins array");
        const written = JSON.parse(readFileSync(file, "utf-8"));
        expect(written).toEqual({ plugins: ["context-mode"] });
        expect(written).not.toHaveProperty("plugin");
      });
    });

    it("v1 writes the `plugin` key and leaves no `plugins` key (byte-identical)", () => {
      withTargetConfig({}, "v1", (_a, file) => {
        const adapter = new OpenCodeAdapter("opencode", "v1");
        const changes = adapter.configureAllHooks("/tmp/plugin");
        expect(changes).toEqual(["Added context-mode to plugin array"]);
        const written = JSON.parse(readFileSync(file, "utf-8"));
        expect(written).toEqual({ plugin: ["context-mode"] });
        expect(written).not.toHaveProperty("plugins");
      });
    });

    it("v1→v2 upgrade removes the stale `plugin` key (7.3)", () => {
      withTargetConfig({ plugin: ["context-mode"] }, "v2", (_a, file) => {
        const adapter = new OpenCodeAdapter("opencode", "v2");
        const changes = adapter.configureAllHooks("/tmp/plugin");
        expect(changes).toContain("Added context-mode to plugins array");
        expect(changes.some((c) => c.includes("Removed stale plugin key"))).toBe(true);
        const written = JSON.parse(readFileSync(file, "utf-8"));
        expect(written).toEqual({ plugins: ["context-mode"] });
        expect(written).not.toHaveProperty("plugin");
      });
    });

    it("v2→v1 downgrade removes the stale `plugins` key (7.3)", () => {
      withTargetConfig({ plugins: ["context-mode"] }, "v1", (_a, file) => {
        const adapter = new OpenCodeAdapter("opencode", "v1");
        const changes = adapter.configureAllHooks("/tmp/plugin");
        expect(changes).toContain("Added context-mode to plugin array");
        expect(changes.some((c) => c.includes("Removed stale plugins key"))).toBe(true);
        const written = JSON.parse(readFileSync(file, "utf-8"));
        expect(written).toEqual({ plugin: ["context-mode"] });
        expect(written).not.toHaveProperty("plugins");
      });
    });

    it("pure-v1 install (no `plugins` key) is untouched by the stale-key logic", () => {
      withTargetConfig({ plugin: ["context-mode"] }, "v1", (_a, file) => {
        const adapter = new OpenCodeAdapter("opencode", "v1");
        const changes = adapter.configureAllHooks("/tmp/plugin");
        // No "Removed stale" change — there was no opposite key to clear.
        expect(changes).toEqual(["context-mode already in plugin array"]);
        const written = JSON.parse(readFileSync(file, "utf-8"));
        expect(written).toEqual({ plugin: ["context-mode"] });
      });
    });

    it("v2 recognizes a `{ package }` object entry as already registered", () => {
      withTargetConfig({ plugins: [{ package: "context-mode" }] }, "v2", (_a, file) => {
        const adapter = new OpenCodeAdapter("opencode", "v2");
        const changes = adapter.configureAllHooks("/tmp/plugin");
        expect(changes).toContain("context-mode already in plugins array");
        // No duplicate pushed.
        const written = JSON.parse(readFileSync(file, "utf-8"));
        expect(written.plugins).toHaveLength(1);
      });
    });
  });

  describe("doctor / validateHooks (7.4)", () => {
    it("v2 flags a stale `plugin` key as a warning", () => {
      withTargetConfig({ plugins: ["context-mode"], plugin: ["context-mode"] }, "v2", (adapter) => {
        const results = adapter.validateHooks("/tmp/plugin");
        expect(results).toContainEqual(
          expect.objectContaining({
            check: "Stale plugin key",
            status: "warn",
            message: expect.stringContaining("plugin"),
            fix: expect.stringContaining("removes the stale key"),
          }),
        );
      });
    });

    it("v1 flags a stale `plugins` key as a warning", () => {
      withTargetConfig({ plugin: ["context-mode"], plugins: ["context-mode"] }, "v1", (adapter) => {
        const results = adapter.validateHooks("/tmp/plugin");
        expect(results).toContainEqual(
          expect.objectContaining({
            check: "Stale plugin key",
            status: "warn",
            message: expect.stringContaining("plugins"),
          }),
        );
      });
    });

    it("no stale-key warning when only the target key is present", () => {
      withTargetConfig({ plugins: ["context-mode"] }, "v2", (adapter) => {
        const results = adapter.validateHooks("/tmp/plugin");
        expect(results.some((r) => r.check === "Stale plugin key")).toBe(false);
        expect(results).toContainEqual(
          expect.objectContaining({ check: "Plugin registration", status: "pass" }),
        );
      });
    });
  });

  describe("detectTargetFromConfig", () => {
    it("returns v2 when context-mode is under `plugins`", () => {
      withTargetConfig({ plugins: ["context-mode"] }, "v1", (adapter) => {
        expect(adapter.detectTargetFromConfig()).toBe("v2");
      });
    });

    it("returns v1 when context-mode is under `plugin`", () => {
      withTargetConfig({ plugin: ["context-mode"] }, "v2", (adapter) => {
        expect(adapter.detectTargetFromConfig()).toBe("v1");
      });
    });

    it("prefers v2 when both keys carry context-mode", () => {
      withTargetConfig({ plugin: ["context-mode"], plugins: ["context-mode"] }, "v1", (adapter) => {
        expect(adapter.detectTargetFromConfig()).toBe("v2");
      });
    });

    it("returns null when neither key carries context-mode", () => {
      withTargetConfig({ theme: "tokyonight" }, "v1", (adapter) => {
        expect(adapter.detectTargetFromConfig()).toBeNull();
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// OpenCode v2 (`setup` mouth) tests — dual-support adapter.
//
// Driven through a minimal mock of `Plugin.Context` that captures the
// tools registered via `ctx.tool.transform` and the handlers registered
// via `ctx.tool.hook` / `ctx.session.hook`, so each hook can be exercised
// directly. Covers the v2 spec deltas: merged export, ctx-namespace
// registration, the JSON-Schema input bridge, routing enforcement, capture,
// compaction ownership, per-session directory resolution, load-idempotency,
// and cleanup.
// ═══════════════════════════════════════════════════════════════

// ── Mock Plugin.Context ───────────────────────────────────

interface MockCtx {
  ctx: any;
  tools: any[];
  toolHooks: Record<string, Array<(ev: any) => any>>;
  sessionHooks: Record<string, Array<(ev: any) => any>>;
  eventBus: {
    push: (ev: any) => void;
    subscribe: (opts?: { signal?: AbortSignal }) => AsyncIterable<any>;
  };
  disposed: string[];
  sessionGetCalls: () => number;
}

/**
 * Build a mock v2 context. `directory` is the plugin-load-scope dir;
 * `sessionDir` (optional) is what `session.get` reports as the session's own
 * location, so per-session resolution can be pointed at a different dir.
 */
function makeMockCtx(directory: string, sessionDir?: string, options?: Record<string, any>): MockCtx {
  const tools: any[] = [];
  const toolHooks: Record<string, Array<(ev: any) => any>> = {};
  const sessionHooks: Record<string, Array<(ev: any) => any>> = {};
  const disposed: string[] = [];
  let getCallCount = 0;

  const reg = (label: string) => ({
    dispose: async () => {
      disposed.push(label);
    },
  });

  // ── Event bus backing ctx.event.subscribe (drives usage capture) ──
  // A single-consumer async queue: `push` enqueues and wakes a parked consumer;
  // `subscribe` yields queued events and parks when empty, ending on abort.
  const pending: any[] = [];
  let wake: (() => void) | null = null;
  const eventBus = {
    push(ev: any) {
      pending.push(ev);
      const w = wake;
      wake = null;
      if (w) w();
    },
    subscribe(opts?: { signal?: AbortSignal }): AsyncIterable<any> {
      const signal = opts?.signal;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<any>> {
              for (;;) {
                if (signal?.aborted) return { done: true, value: undefined };
                if (pending.length > 0) return { done: false, value: pending.shift() };
                await new Promise<void>((resolve) => {
                  wake = () => resolve();
                  signal?.addEventListener("abort", () => resolve(), { once: true });
                });
              }
            },
          };
        },
      };
    },
  };

  const ctx: any = {
    location: { directory },
    options: options ?? {},
    event: eventBus,
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        getCallCount++;
        return { location: { directory: sessionDir ?? directory }, sessionID };
      },
      hook: async (name: string, handler: (ev: any) => any) => {
        (sessionHooks[name] ??= []).push(handler);
        return reg(`session:${name}`);
      },
    },
    tool: {
      transform: async (fn: (ed: any) => void) => {
        const editor = {
          add: (tool: any) => {
            tools.push(tool);
          },
        };
        fn(editor);
        return reg("tool.transform");
      },
      hook: async (name: string, handler: (ev: any) => any) => {
        (toolHooks[name] ??= []).push(handler);
        return reg(`tool:${name}`);
      },
    },
  };

  return {
    ctx,
    tools,
    toolHooks,
    sessionHooks,
    eventBus,
    disposed,
    sessionGetCalls: () => getCallCount,
  };
}

/** Run the v2 setup mouth against a mock context and return the captured state. */
async function setupV2For(directory: string, sessionDir?: string, options?: Record<string, any>) {
  const mock = makeMockCtx(directory, sessionDir, options);
  const cleanup = await (pluginDefault.setup as any)(mock.ctx);
  return { ...mock, cleanup: cleanup as () => Promise<void> };
}

// ── MCP readiness sentinel (routing island checks it in-process) ──
const _sentinelDir = process.platform === "win32" ? tmpdir() : "/tmp";
const mcpSentinel = resolve(_sentinelDir, `context-mode-mcp-ready-${process.pid}`);

beforeEach(() => {
  writeFileSync(mcpSentinel, String(process.pid));
  // Ensure the shared platform resolves to "opencode" (not kilo) for these tests.
  delete process.env.KILO_PID;
});
afterEach(() => {
  try {
    unlinkSync(mcpSentinel);
  } catch {
    /* ignore */
  }
});

// ── Tests ─────────────────────────────────────────────────

describe("OpenCode v2 setup mouth", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "opencode-v2-test-"));
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* cleanup best effort */
    }
  });

  // ── Merged default export ─────────────────────────────

  describe("merged default export", () => {
    it("carries both a v2 `setup` mouth and a v1 `server` mouth", () => {
      expect(pluginDefault).toHaveProperty("id", "context-mode");
      expect(typeof (pluginDefault as any).setup).toBe("function");
      expect(typeof (pluginDefault as any).server).toBe("function");
    });

    it("preserves the pre-1.18.29 named export lifeline", () => {
      expect(typeof ContextModePlugin).toBe("function");
    });

    // #1171 — the v2 `setup` must survive a host where @opencode/plugin
    // cannot be resolved (e.g. `opencode plugin add` skipping full dependency
    // resolution). Our default export is a plain object literal, so it never
    // depends on that import — but this guards against a future reintroduction
    // of a dynamic-import-with-fallback that would silently drop `setup` and
    // make OpenCode 2 reject the whole plugin ("Plugin must export a default
    // definition with an id and an effect or setup function").
    it("still exposes a working v2 `setup` when @opencode/plugin fails to resolve", async () => {
      vi.resetModules();
      vi.doMock("@opencode/plugin", () => {
        throw new Error("Cannot find module '@opencode/plugin'");
      });
      try {
        const mod = await import("../../src/adapters/opencode/plugin.js");
        expect(typeof (mod.default as any).setup).toBe("function");
        expect(typeof (mod.default as any).server).toBe("function");
      } finally {
        vi.doUnmock("@opencode/plugin");
        vi.resetModules();
      }
    });
  });

  // ── Tool registration under the ctx namespace ─────────

  describe("tool registration", () => {
    it("registers the ctx tool set under the `ctx` namespace with bare names", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "reg"));
      try {
        const names = tools.map((t) => t.name).sort();
        // Bare names (ctx_ prefix stripped); namespace supplies the ctx_ prefix.
        expect(names).toEqual([
          "batch_execute",
          "doctor",
          "execute",
          "execute_file",
          "fetch_and_index",
          "index",
          "insight",
          "purge",
          "search",
          "stats",
          "upgrade",
        ]);
        for (const t of tools) {
          expect(t.options?.namespace).toBe("ctx");
        }
      } finally {
        await cleanup();
      }
    });

    it("marks the three sandbox-execute tools with the borrowed `bash` permission", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "perm"));
      try {
        const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
        expect(byName.execute.options.permission).toBe("bash");
        expect(byName.execute_file.options.permission).toBe("bash");
        expect(byName.batch_execute.options.permission).toBe("bash");
        // Read-only tools must NOT borrow bash.
        expect(byName.search.options.permission).toBeUndefined();
        expect(byName.stats.options.permission).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("presents a Zod v4 input schema (StandardSchemaV1 marker) on every tool", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "zodv4"));
      try {
        expect(tools.length).toBeGreaterThan(0);
        for (const t of tools) {
          expect((t.input as any)?._zod, `tool ${t.name} input missing _zod`).toBeDefined();
        }
      } finally {
        await cleanup();
      }
    });
  });

  // ── Tool execute: JSON-Schema input bridge ────────────

  describe("tool execute", () => {
    it("runs the shared handler for valid arguments", async () => {
      const dir = join(tempDir, "exec-valid");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        const res = await stats.execute({}, { sessionID: "s-exec-valid" });
        expect(res.content).toContain("context-mode");
      } finally {
        await cleanup();
      }
    });

    it("returns text in `content` and never an `output` key (v2 no-output-schema contract)", async () => {
      // The v2 host dies with "Tool result declared output without an output
      // schema" when a tool that declares no `output` schema returns an `output`
      // key. This tool set declares none, so results must carry text in
      // `content` and must NOT include an `output` key.
      const dir = join(tempDir, "exec-content-contract");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        const res = await stats.execute({}, { sessionID: "s-content-contract" });
        expect(res).not.toHaveProperty("output");
        expect(typeof res.content).toBe("string");
        expect(res.content).toContain("context-mode");
      } finally {
        await cleanup();
      }
    });

    it("surfaces invalid arguments as a tool error (not a crash)", async () => {
      const dir = join(tempDir, "exec-invalid");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const batch = tools.find((t) => t.name === "batch_execute")!;
        await expect(
          batch.execute({ queries: ["x"] } as any, { sessionID: "s-exec-invalid" }),
        ).rejects.toThrow(/Invalid arguments for ctx_batch_execute/);
      } finally {
        await cleanup();
      }
    });

    it("coerces JSON-stringified array args via the v3 schema preprocess", async () => {
      const dir = join(tempDir, "exec-coerce");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const batch = tools.find((t) => t.name === "batch_execute")!;
        const res = await batch.execute(
          {
            commands: JSON.stringify([{ label: "echo", command: "echo v2-coerce" }]),
            queries: JSON.stringify(["v2-coerce"]),
          } as any,
          { sessionID: "s-exec-coerce" },
        );
        expect(res.content).toContain("Executed");
      } finally {
        await cleanup();
      }
    });

    it("surfaces a throwing handler as a failed tool call (not a crash)", async () => {
      const dir = join(tempDir, "exec-handler-throws");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        // The registered tool's execute closes over the shared core's CoreTool.
        // Patch that same object's run to throw (as an isError handler would) and
        // confirm the rejection propagates as a failed tool call.
        const core = await getCore({ platform: "opencode", loadScopeDir: dir });
        const coreTool = core.getTools().find((t: any) => t.name === "ctx_stats")!;
        const origRun = coreTool.run;
        coreTool.run = async () => {
          throw new Error("handler boom");
        };
        try {
          const stats = tools.find((t) => t.name === "stats")!;
          await expect(stats.execute({}, { sessionID: "s-throw" })).rejects.toThrow(
            "handler boom",
          );
        } finally {
          coreTool.run = origRun;
        }
      } finally {
        await cleanup();
      }
    });
  });

  // ── Destructive-tool policy (context-mode-owned) ──────

  describe("destructive-tool policy", () => {
    it("refuses ctx_purge by default with a context-mode-attributed error", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "destr-purge-default"));
      try {
        const purge = tools.find((t) => t.name === "purge")!;
        await expect(purge.execute({}, { sessionID: "s-purge" })).rejects.toThrow(
          /disabled by context-mode policy/,
        );
        await expect(purge.execute({}, { sessionID: "s-purge" })).rejects.toThrow(
          /not a host permission denial/,
        );
      } finally {
        await cleanup();
      }
    });

    it("refuses ctx_upgrade by default", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "destr-up-default"));
      try {
        const up = tools.find((t) => t.name === "upgrade")!;
        await expect(up.execute({}, { sessionID: "s-up" })).rejects.toThrow(
          /disabled by context-mode policy/,
        );
      } finally {
        await cleanup();
      }
    });

    it("allows destructive tools when CONTEXT_MODE_ALLOW_DESTRUCTIVE=1", async () => {
      const dir = join(tempDir, "destr-allow");
      const { tools, cleanup } = await setupV2For(dir);
      const prev = process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE;
      try {
        // Patch run to a sentinel so the allow path is exercised without real
        // destructive work.
        const core = await getCore({ platform: "opencode", loadScopeDir: dir });
        const coreTool = core.getTools().find((t: any) => t.name === "ctx_purge")!;
        const origRun = coreTool.run;
        coreTool.run = async () => "purge-ran";
        process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE = "1";
        try {
          const purge = tools.find((t) => t.name === "purge")!;
          const res = await purge.execute({}, { sessionID: "s-allow" });
          expect(res.content).toBe("purge-ran");
        } finally {
          coreTool.run = origRun;
          if (prev === undefined) delete process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE;
          else process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE = prev;
        }
      } finally {
        await cleanup();
      }
    });

    it("does not gate non-destructive tools under the default policy", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "destr-nongate"));
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        const res = await stats.execute({}, { sessionID: "s-nongate" });
        expect(res.content).toContain("context-mode");
      } finally {
        await cleanup();
      }
    });
  });

  // ── Routing enforcement (execute.before) ──────────────

  describe("execute.before routing", () => {
    it("blocks a curl command (deny throws, or modify rewrites to echo)", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "route-curl"));
      try {
        const before = toolHooks["execute.before"][0];
        const ev: any = {
          tool: "Bash",
          sessionID: "s-route-curl",
          input: { command: "curl https://example.com/data" },
        };
        try {
          await before(ev);
          expect(String(ev.input.command).startsWith("echo ")).toBe(true);
        } catch (e: any) {
          expect(e.message).toContain("context-mode");
        }
      } finally {
        await cleanup();
      }
    });

    it("passes through an unrouted tool unchanged", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "route-pass"));
      try {
        const before = toolHooks["execute.before"][0];
        const ev: any = { tool: "TaskCreate", sessionID: "s-route-pass", input: { subject: "x" } };
        await before(ev);
        expect(ev.input).toEqual({ subject: "x" });
      } finally {
        await cleanup();
      }
    });

    it("injects guidance as additionalContext for an allowed grep", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "route-grep"));
      try {
        const before = toolHooks["execute.before"][0];
        const ev: any = { tool: "grep", sessionID: "s-route-grep", input: { command: "grep hello" } };
        await before(ev);
        expect(ev.input).toHaveProperty("additionalContext");
        expect(String(ev.input.additionalContext)).toContain("<context_guidance>");
      } finally {
        await cleanup();
      }
    });
  });

  // ── Capture (execute.after) ───────────────────────────

  describe("execute.after capture", () => {
    it("captures a completed tool event without throwing", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "cap-ok"));
      try {
        const after = toolHooks["execute.after"][0];
        await expect(
          after({
            tool: "Read",
            sessionID: "s-cap-ok",
            input: { file_path: "/src/index.ts" },
            status: "completed",
            result: { output: "export default {}", metadata: {} },
          }),
        ).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("skips capture on the error status path", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "cap-err"));
      try {
        const after = toolHooks["execute.after"][0];
        await expect(
          after({
            tool: "Read",
            sessionID: "s-cap-err",
            input: {},
            status: "error",
            error: { message: "boom" },
          }),
        ).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });
  });

  // ── Prompt capture ────────────────────────────────────

  describe("prompt capture", () => {
    it("captures a real user prompt", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "prompt-ok"));
      try {
        const prompt = sessionHooks["prompt"][0];
        await expect(
          prompt({ sessionID: "s-prompt-ok", prompt: { text: "please refactor the parser" } }),
        ).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("skips an empty prompt", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "prompt-empty"));
      try {
        const prompt = sessionHooks["prompt"][0];
        await expect(prompt({ sessionID: "s-prompt-empty", prompt: { text: "" } })).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });
  });

  // ── Context hook: routing block + resume ──────────────

  describe("context hook (primary injection)", () => {
    it("injects the routing block on a fresh session", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "ctx-fresh"));
      try {
        const context = sessionHooks["context"][0];
        const ev: any = { sessionID: "s-ctx-fresh", system: [{ type: "text", text: "HEADER" }] };
        await context(ev);
        expect(ev.system[0].text).toBe("HEADER");
        expect(ev.system.length).toBe(2);
        expect(ev.system[1].text).toContain("<context_window_protection>");
      } finally {
        await cleanup();
      }
    });

    it("does not re-inject when routing instructions are already present", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "ctx-existing"));
      try {
        const context = sessionHooks["context"][0];
        const existing =
          "<context_window_protection> use ctx_search and ctx_index for retrieval </context_window_protection>";
        const ev: any = { sessionID: "s-ctx-existing", system: [{ type: "text", text: existing }] };
        await context(ev);
        // Only the pre-existing block; no duplicate appended.
        expect(ev.system.length).toBe(1);
      } finally {
        await cleanup();
      }
    });

    it("appends a claimed resume snapshot alongside the routing block", async () => {
      const dir = join(tempDir, "ctx-resume");
      const first = await setupV2For(dir);
      try {
        // Build a resume row in a prior session via compaction.
        const after = first.toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "prior",
          input: { file_path: "/a.ts" },
          status: "completed",
          result: { output: "content", metadata: {} },
        });
        const compaction = first.sessionHooks["compaction"][0];
        await compaction({ sessionID: "prior" });
      } finally {
        await first.cleanup();
      }

      // A fresh mouth over the same DB claims the resume on the context hook.
      const second = await setupV2For(dir);
      try {
        const context = second.sessionHooks["context"][0];
        const ev: any = { sessionID: "fresh", system: [{ type: "text", text: "HEADER" }] };
        await context(ev);
        const joined = ev.system.map((p: any) => p.text).join("\n");
        expect(joined).toContain("<context_window_protection>");
        expect(joined).toContain("session_resume");
      } finally {
        await second.cleanup();
      }
    });
  });

  // ── Compaction ownership ──────────────────────────────

  describe("compaction", () => {
    it("leaves the result unset when the TOC is empty", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "compact-empty"));
      try {
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-empty" };
        await compaction(ev);
        expect(ev.result).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("supplies the DB TOC as the summary when events exist", async () => {
      const { toolHooks, sessionHooks, cleanup } = await setupV2For(join(tempDir, "compact-snap"));
      try {
        const after = toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "s-compact-snap",
          input: { file_path: "/src/index.ts" },
          status: "completed",
          result: { output: "export default {}", metadata: {} },
        });
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-snap" };
        await compaction(ev);
        expect(ev.result).toBeDefined();
        expect(ev.result.summary).toContain("session_resume");
        expect(ev.result.summary).toContain("index.ts");
        // The summary is the DB TOC only — the routing block (which lives in the
        // `context` hook, fired solely for primary requests) never pollutes it.
        expect(ev.result.summary).not.toContain("<context_window_protection>");
      } finally {
        await cleanup();
      }
    });

    it("passthrough: leaves result unset so the host narrates, but still upserts the resume TOC", async () => {
      const { toolHooks, sessionHooks, cleanup } = await setupV2For(
        join(tempDir, "compact-passthrough"),
        undefined,
        { compaction: "passthrough" },
      );
      try {
        const after = toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "s-compact-pass",
          input: { file_path: "/src/index.ts" },
          status: "completed",
          result: { output: "export default {}", metadata: {} },
        });
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-pass" };
        await compaction(ev);
        // passthrough: the model narrates — the result override is NOT set.
        expect(ev.result).toBeUndefined();
        // The TOC was still upserted at compaction. The COMPACTING session does
        // NOT re-inject its own TOC (anti-self-injection: `session_id != ?`),
        // but a DIFFERENT resumed session claims it via the context hook — the
        // same cross-session resume delivery that own mode also provides.
        const context = sessionHooks["context"][0];
        const cev: any = { sessionID: "s-resumed-pass", system: [] };
        await context(cev);
        const joined = cev.system.map((p: any) => p.text).join("\n");
        expect(joined).toContain("session_resume");
        expect(joined).toContain("index.ts");
      } finally {
        await cleanup();
      }
    });

    it("passthrough alias `host` also leaves the result unset", async () => {
      const { toolHooks, sessionHooks, cleanup } = await setupV2For(
        join(tempDir, "compact-host-alias"),
        undefined,
        { compaction: "host" },
      );
      try {
        const after = toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "s-compact-host",
          input: { file_path: "/src/index.ts" },
          status: "completed",
          result: { output: "export default {}", metadata: {} },
        });
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-host" };
        await compaction(ev);
        expect(ev.result).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("explicit `own` option still supplies the TOC as the summary", async () => {
      const { toolHooks, sessionHooks, cleanup } = await setupV2For(
        join(tempDir, "compact-own-explicit"),
        undefined,
        { compaction: "own" },
      );
      try {
        const after = toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "s-compact-own",
          input: { file_path: "/src/index.ts" },
          status: "completed",
          result: { output: "export default {}", metadata: {} },
        });
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-own" };
        await compaction(ev);
        expect(ev.result).toBeDefined();
        expect(ev.result.summary).toContain("session_resume");
      } finally {
        await cleanup();
      }
    });
  });

  // ── Doctor: compaction-mode surfacing (v2 only) ──────────

  describe("doctor — compaction mode", () => {
    function doctorWith(settings: Record<string, unknown>, target: "v1" | "v2") {
      const dir = mkdtempSync(join(tempDir, "doctor-"));
      const settingsPath = join(dir, "opencode.json");
      writeFileSync(settingsPath, JSON.stringify(settings));
      const adapter = new OpenCodeAdapter("opencode", target);
      // readSettings() reads this.paths(); point it at the temp settings file.
      Object.defineProperty(adapter, "paths", { value: () => [settingsPath] });
      return adapter.validateHooks("");
    }

    it("reports 'own' by default for a v2 target with no compaction option", () => {
      const results = doctorWith({ plugins: ["context-mode"] }, "v2");
      const cm = results.find((r) => r.check === "Compaction mode");
      expect(cm).toBeDefined();
      expect(cm!.status).toBe("pass");
      expect(cm!.message).toContain("own");
    });

    it("reports 'passthrough' when options.compaction is passthrough", () => {
      const results = doctorWith(
        { plugins: [{ package: "context-mode", options: { compaction: "passthrough" } }] },
        "v2",
      );
      const cm = results.find((r) => r.check === "Compaction mode");
      expect(cm).toBeDefined();
      expect(cm!.message).toContain("passthrough");
    });

    it("honors the `host` alias in the config", () => {
      const results = doctorWith(
        { plugins: [{ package: "context-mode", options: { compaction: "host" } }] },
        "v2",
      );
      const cm = results.find((r) => r.check === "Compaction mode");
      expect(cm!.message).toContain("passthrough");
    });

    it("does NOT surface a compaction-mode check for a v1 target", () => {
      const results = doctorWith({ plugin: ["context-mode"] }, "v1");
      expect(results.find((r) => r.check === "Compaction mode")).toBeUndefined();
    });
  });

  // ── Doctor: target reachability (config → adapter target) ──

  describe("doctor — target reachability", () => {
    async function targetFromConfig(config: Record<string, unknown>) {
      const dir = mkdtempSync(join(tempDir, "reach-"));
      const cwd = process.cwd();
      writeFileSync(join(dir, "opencode.json"), JSON.stringify(config));
      process.chdir(dir);
      try {
        const { detectOpencodeTargetFromConfig } = await import("../../src/adapters/detect.js");
        return await detectOpencodeTargetFromConfig("opencode");
      } finally {
        process.chdir(cwd);
      }
    }

    it("resolves v2 from a `plugins` config so the doctor builds a v2 adapter", async () => {
      expect(await targetFromConfig({ plugins: ["context-mode"] })).toBe("v2");
    });

    it("resolves v1 from a `plugin` config (no false v2)", async () => {
      expect(await targetFromConfig({ plugin: ["context-mode"] })).toBe("v1");
    });

    it("returns null for a non-opencode platform (helper gating)", async () => {
      const { detectOpencodeTargetFromConfig } = await import("../../src/adapters/detect.js");
      expect(await detectOpencodeTargetFromConfig("claude-code")).toBeNull();
    });
  });

  // ── Per-session directory resolution ──────────────────

  describe("per-session directory resolution", () => {
    it("resolves the session dir from session.get and caches it", async () => {
      const loadDir = join(tempDir, "dir-load");
      const sessionDir = join(tempDir, "dir-session");
      const { tools, sessionGetCalls, cleanup } = await setupV2For(loadDir, sessionDir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        // First call resolves (one session.get), second reuses the cache.
        await stats.execute({}, { sessionID: "s-dir" });
        const afterFirst = sessionGetCalls();
        await stats.execute({}, { sessionID: "s-dir" });
        const afterSecond = sessionGetCalls();

        expect(afterFirst).toBe(1);
        expect(afterSecond).toBe(1); // cached — no second resolution
      } finally {
        await cleanup();
      }
    });

    it("resolves each distinct session independently", async () => {
      const loadDir = join(tempDir, "dir-multi-load");
      const sessionDir = join(tempDir, "dir-multi-session");
      const { tools, sessionGetCalls, cleanup } = await setupV2For(loadDir, sessionDir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        await stats.execute({}, { sessionID: "sA" });
        await stats.execute({}, { sessionID: "sB" });
        expect(sessionGetCalls()).toBe(2);
      } finally {
        await cleanup();
      }
    });
  });

  // ── Load-idempotency ────────────────────────────────

  describe("load-idempotent core", () => {
    it("getCore memoizes on platform::loadScopeDir", async () => {
      resetCoreCache();
      const dir = join(tempDir, "idem-memo");
      const a = await getCore({ platform: "opencode", loadScopeDir: dir });
      const b = await getCore({ platform: "opencode", loadScopeDir: dir });
      expect(a).toBe(b);
      await a.dispose();
    });

    it("setup and server over the same dir share one core instance", async () => {
      resetCoreCache();
      const dir = join(tempDir, "idem-mouths");
      // Prime the cache the way the first mouth would.
      const primed = await getCore({ platform: "opencode", loadScopeDir: dir });

      // v2 mouth.
      const mock = makeMockCtx(dir);
      const cleanup = await (pluginDefault.setup as any)(mock.ctx);

      // v1 mouth over the same directory.
      const v1 = await (pluginDefault.server as any)({
        directory: dir,
        client: { app: { log: async () => {} } },
      });
      expect(v1).toHaveProperty("tool.execute.before");

      // Both mouths reused the primed core — the cache was never replaced.
      const after = await getCore({ platform: "opencode", loadScopeDir: dir });
      expect(after).toBe(primed);

      await (cleanup as () => Promise<void>)();
    });
  });

  // ── Cleanup ─────────────────────────────────────────

  describe("cleanup", () => {
    it("disposes every registration and the shared core", async () => {
      resetCoreCache();
      const dir = join(tempDir, "cleanup");
      const { disposed, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });

      await cleanup();

      expect(disposed).toContain("tool.transform");
      expect(disposed).toContain("tool:execute.before");
      expect(disposed).toContain("tool:execute.after");
      expect(disposed).toContain("session:prompt");
      expect(disposed).toContain("session:context");
      expect(disposed).toContain("session:compaction");
      // Core removed from the cache on dispose.
      const after = await getCore({ platform: "opencode", loadScopeDir: dir });
      expect(after).not.toBe(core);
    });
  });

  // ── parseOpencodeV2StepUsage (pure mapping) ────────────────────────

  describe("parseOpencodeV2StepUsage", () => {
    it("maps v2 step.ended data, folding reasoning into output", () => {
      const c = parseOpencodeV2StepUsage(
        {
          cost: 0.05,
          tokens: { input: 10, output: 4, reasoning: 6, cache: { read: 3, write: 1 } },
        },
        "anthropic/claude-sonnet-4",
      );
      expect(c).toEqual({
        model_id: "anthropic/claude-sonnet-4",
        input_tokens: 10,
        output_tokens: 10, // 4 output + 6 reasoning folded
        cache_creation_tokens: 1,
        cache_read_tokens: 3,
        native_cost_usd: 0.05,
      });
    });

    it("returns null for an all-zero step", () => {
      expect(
        parseOpencodeV2StepUsage(
          { cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: {} } },
          "m",
        ),
      ).toBeNull();
    });

    it("returns null when tokens are absent", () => {
      expect(parseOpencodeV2StepUsage({ cost: 1 }, "m")).toBeNull();
    });

    it("tolerates a missing cache and a non-numeric cost", () => {
      const c = parseOpencodeV2StepUsage({ tokens: { input: 5, output: 2 } }, "m");
      expect(c).toEqual({
        model_id: "m",
        input_tokens: 5,
        output_tokens: 2,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        native_cost_usd: null,
      });
    });

    it("returns null for non-object data", () => {
      expect(parseOpencodeV2StepUsage(null, "m")).toBeNull();
      expect(parseOpencodeV2StepUsage("x", "m")).toBeNull();
    });
  });

  // ── Usage capture wiring (event bus → core.recordUsage) ────────────

  describe("usage capture", () => {
    // The capture loop runs in the background; poll until it records.
    async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
      const start = Date.now();
      while (!cond()) {
        if (Date.now() - start > ms) throw new Error("timed out waiting for usage capture");
        await new Promise((r) => setTimeout(r, 5));
      }
    }

    const stepStarted = (
      sessionID: string,
      msgId: string,
      providerID: string,
      model: string,
    ) => ({
      type: "session.step.started",
      data: { sessionID, assistantMessageID: msgId, agent: "build", model: { id: model, providerID } },
    });

    const stepEnded = (sessionID: string, msgId: string, tokens: unknown, cost: number) => ({
      type: "session.step.ended",
      data: { sessionID, assistantMessageID: msgId, finish: "stop", cost, tokens },
    });

    /** Replace core.recordUsage with a capturing passthrough; returns the sink + restore. */
    function captureUsage(core: any) {
      const calls: Array<{ sid: string; project: string; ev: any; src?: string }> = [];
      const orig = core.recordUsage.bind(core);
      core.recordUsage = (sid: string, project: string, ev: any, src?: string) => {
        calls.push({ sid, project, ev, src });
        return orig(sid, project, ev, src);
      };
      return { calls, restore: () => (core.recordUsage = orig) };
    }

    it("records one agent_usage per step.ended, with the model from step.started", async () => {
      const dir = join(tempDir, "usage-basic");
      const { eventBus, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });
      const { calls, restore } = captureUsage(core);
      try {
        eventBus.push(stepStarted("s1", "m1", "anthropic", "claude-sonnet-4"));
        eventBus.push(
          stepEnded(
            "s1",
            "m1",
            { input: 100, output: 40, reasoning: 10, cache: { read: 5, write: 2 } },
            0.0123,
          ),
        );
        await waitFor(() => calls.length >= 1);

        expect(calls).toHaveLength(1);
        const { sid, src, ev } = calls[0];
        expect(sid).toBe("s1");
        expect(src).toBe("StepEnded");
        expect(ev.type).toBe("agent_usage");
        expect(ev.model_id).toBe("anthropic/claude-sonnet-4");
        expect(ev.input_tokens).toBe(100);
        expect(ev.output_tokens).toBe(50); // 40 + 10 reasoning
        expect(ev.cache_read_tokens).toBe(5);
        expect(ev.cache_creation_tokens).toBe(2);
        expect(ev.cost_usd).toBeCloseTo(0.0123, 6);
      } finally {
        restore();
        await cleanup();
      }
    });

    it("folds reasoning tokens into output", async () => {
      const dir = join(tempDir, "usage-reasoning");
      const { eventBus, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });
      const { calls, restore } = captureUsage(core);
      try {
        eventBus.push(stepStarted("s2", "m2", "openai", "gpt-5"));
        eventBus.push(
          stepEnded("s2", "m2", { input: 10, output: 7, reasoning: 33, cache: { read: 0, write: 0 } }, 0.001),
        );
        await waitFor(() => calls.length >= 1);
        expect(calls[0].ev.input_tokens).toBe(10);
        expect(calls[0].ev.output_tokens).toBe(40); // 7 + 33
      } finally {
        restore();
        await cleanup();
      }
    });

    it("still records usage when step.ended has no matching step.started (empty model)", async () => {
      const dir = join(tempDir, "usage-no-model");
      const { eventBus, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });
      const { calls, restore } = captureUsage(core);
      try {
        eventBus.push(
          stepEnded("s3", "orphan", { input: 5, output: 3, reasoning: 0, cache: { read: 0, write: 0 } }, 0.0005),
        );
        await waitFor(() => calls.length >= 1);
        // Empty model → the builder omits model_id, but cost + tokens are captured.
        expect(calls[0].ev.model_id).toBeUndefined();
        expect(calls[0].ev.input_tokens).toBe(5);
        expect(calls[0].ev.output_tokens).toBe(3);
        expect(calls[0].ev.cost_usd).toBeCloseTo(0.0005, 8);
      } finally {
        restore();
        await cleanup();
      }
    });

    it("does not record an all-zero step", async () => {
      const dir = join(tempDir, "usage-zero");
      const { eventBus, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });
      const { calls, restore } = captureUsage(core);
      try {
        eventBus.push(stepStarted("s4", "m4", "anthropic", "claude"));
        eventBus.push(
          stepEnded("s4", "m4", { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, 0),
        );
        await new Promise((r) => setTimeout(r, 60));
        expect(calls).toHaveLength(0);
      } finally {
        restore();
        await cleanup();
      }
    });

    it("ignores non-usage event types", async () => {
      const dir = join(tempDir, "usage-ignore");
      const { eventBus, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });
      const { calls, restore } = captureUsage(core);
      try {
        eventBus.push({ type: "session.idle", data: { sessionID: "s5" } });
        eventBus.push({ type: "server.heartbeat", data: {} });
        await new Promise((r) => setTimeout(r, 60));
        expect(calls).toHaveLength(0);
      } finally {
        restore();
        await cleanup();
      }
    });

    it("stops processing after cleanup aborts the subscription", async () => {
      const dir = join(tempDir, "usage-abort");
      const { eventBus, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });
      const { calls, restore } = captureUsage(core);
      try {
        eventBus.push(stepStarted("s6", "m6", "anthropic", "claude"));
        eventBus.push(
          stepEnded("s6", "m6", { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }, 0.0001),
        );
        await waitFor(() => calls.length >= 1);
        const before = calls.length;

        await cleanup();

        // After teardown, further events must not be processed.
        eventBus.push(
          stepEnded("s6", "m6b", { input: 9, output: 9, reasoning: 0, cache: { read: 0, write: 0 } }, 0.9),
        );
        await new Promise((r) => setTimeout(r, 60));
        expect(calls.length).toBe(before);
      } finally {
        restore();
      }
    });
  });

  // ── Readiness sentinel (v2 native-tool mode publishes its own marker) ──
  // In v2 there is no MCP stdio server, so the setup mouth must write the
  // sentinel that the routing island (isMCPReady) checks. Isolated via
  // CONTEXT_MODE_MCP_SENTINEL_DIR so the writer and reader share a temp dir.

  describe("readiness sentinel", () => {
    let sentinelDir: string;

    beforeEach(() => {
      sentinelDir = mkdtempSync(join(tmpdir(), "cm-v2-sentinel-"));
      process.env.CONTEXT_MODE_MCP_SENTINEL_DIR = sentinelDir;
    });

    afterEach(() => {
      delete process.env.CONTEXT_MODE_MCP_SENTINEL_DIR;
      try {
        rmSync(sentinelDir, { recursive: true, force: true });
      } catch {
        /* cleanup best effort */
      }
    });

    it("publishes a sentinel carrying this process's PID during setup", async () => {
      const path = sentinelPathForPid(process.pid);
      expect(existsSync(path)).toBe(false); // fresh isolated dir — nothing yet

      const { cleanup } = await setupV2For(join(tempDir, "sentinel-write"));
      try {
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, "utf8")).toBe(String(process.pid));
      } finally {
        await cleanup();
      }
    });

    it("makes the routing reader (isMCPReady) see this process as ready", async () => {
      const { cleanup } = await setupV2For(join(tempDir, "sentinel-ready"));
      try {
        expect(isMCPReady()).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it("removes the sentinel on cleanup", async () => {
      const path = sentinelPathForPid(process.pid);
      const { cleanup } = await setupV2For(join(tempDir, "sentinel-remove"));
      expect(existsSync(path)).toBe(true); // written during setup

      await cleanup();
      expect(existsSync(path)).toBe(false);
    });

    it("re-establishes the sentinel on a later setup after the prior cleanup", async () => {
      const path = sentinelPathForPid(process.pid);
      const first = await setupV2For(join(tempDir, "sentinel-a"));
      await first.cleanup();
      expect(existsSync(path)).toBe(false);

      const second = await setupV2For(join(tempDir, "sentinel-b"));
      try {
        expect(existsSync(path)).toBe(true);
        expect(isMCPReady()).toBe(true);
      } finally {
        await second.cleanup();
      }
      expect(existsSync(path)).toBe(false);
    });
  });
});
