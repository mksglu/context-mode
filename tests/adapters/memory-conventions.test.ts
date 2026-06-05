import "../setup-home";
import { fakeHome } from "../setup-home";
import { describe, it, expect, afterEach } from "vitest";
import { homedir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// Adapters that honor XDG_CONFIG_HOME / APPDATA (e.g. opencode) read the env
// var BEFORE falling back to homedir(). GitHub Actions Ubuntu can have these
// set to the runner's real home and bypass the homedir mock — anchor them
// under fakeHome so adapters stay sandboxed regardless of host env.
process.env.XDG_CONFIG_HOME = join(fakeHome, ".config");
process.env.XDG_DATA_HOME = join(fakeHome, ".local", "share");
process.env.APPDATA = join(fakeHome, "AppData", "Roaming");
process.env.LOCALAPPDATA = join(fakeHome, "AppData", "Local");

import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { QwenCodeAdapter } from "../../src/adapters/qwen-code/index.js";
import { GeminiCLIAdapter } from "../../src/adapters/gemini-cli/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { OpenCodeAdapter } from "../../src/adapters/opencode/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { VSCodeCopilotAdapter } from "../../src/adapters/vscode-copilot/index.js";
import { JetBrainsCopilotAdapter } from "../../src/adapters/jetbrains-copilot/index.js";
import { CopilotCliAdapter } from "../../src/adapters/copilot-cli/index.js";
import { KiroAdapter } from "../../src/adapters/kiro/index.js";
import { ZedAdapter } from "../../src/adapters/zed/index.js";
import { AntigravityAdapter } from "../../src/adapters/antigravity/index.js";
import { OpenClawAdapter } from "../../src/adapters/openclaw/index.js";

/**
 * Slice 3 — per-adapter memory/config conventions.
 *
 * Each adapter declares its own configDir, instructionFiles, memoryDir.
 * These are consumed by:
 *   - searchAutoMemory()  (auto-memory file scan)
 *   - ctx_search timeline (configDir for prior session lookup)
 *   - extract.ts isRule  (instruction file detection)
 */

describe("Adapter memory conventions", () => {
  describe("QwenCodeAdapter", () => {
    const a = new QwenCodeAdapter();
    it("getConfigDir is ~/.qwen", () => {
      expect(a.getConfigDir()).toBe(join(homedir(), ".qwen"));
    });
    it("getInstructionFiles is ['QWEN.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["QWEN.md"]);
    });
    it("getMemoryDir is ~/.qwen/memory", () => {
      expect(a.getMemoryDir()).toBe(join(homedir(), ".qwen", "memory"));
    });
  });

  describe("GeminiCLIAdapter", () => {
    const a = new GeminiCLIAdapter();
    it("getConfigDir is ~/.gemini", () => {
      expect(a.getConfigDir()).toBe(join(homedir(), ".gemini"));
    });
    it("getInstructionFiles is ['GEMINI.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["GEMINI.md"]);
    });
    it("getMemoryDir is ~/.gemini/memory", () => {
      expect(a.getMemoryDir()).toBe(join(homedir(), ".gemini", "memory"));
    });
  });

  describe("CodexAdapter", () => {
    const a = new CodexAdapter();
    it("getConfigDir is ~/.codex", () => {
      expect(a.getConfigDir()).toBe(join(homedir(), ".codex"));
    });
    it("getInstructionFiles is ['AGENTS.md', 'AGENTS.override.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["AGENTS.md", "AGENTS.override.md"]);
    });
    it("getMemoryDir is ~/.codex/memories (plural)", () => {
      expect(a.getMemoryDir()).toBe(join(homedir(), ".codex", "memories"));
    });
  });

  // OpenCode/KiloCode honor XDG_CONFIG_HOME on POSIX and APPDATA on Windows.
  // setup-home anchors both env vars under fakeHome, so the expected root
  // depends on platform.
  const xdgRoot =
    process.platform === "win32"
      ? join(homedir(), "AppData", "Roaming")
      : join(homedir(), ".config");

  describe("OpenCodeAdapter (default platform=opencode)", () => {
    const a = new OpenCodeAdapter();
    it("getConfigDir is <xdg>/opencode", () => {
      expect(a.getConfigDir()).toBe(join(xdgRoot, "opencode"));
    });
    it("getInstructionFiles is ['AGENTS.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["AGENTS.md"]);
    });
    it("getMemoryDir is <xdg>/opencode/memory", () => {
      expect(a.getMemoryDir()).toBe(join(xdgRoot, "opencode", "memory"));
    });
  });

  describe("OpenCodeAdapter (kilo variant)", () => {
    const a = new OpenCodeAdapter("kilo");
    it("getConfigDir is <xdg>/kilo", () => {
      expect(a.getConfigDir()).toBe(join(xdgRoot, "kilo"));
    });
    it("getInstructionFiles is ['AGENTS.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["AGENTS.md"]);
    });
    it("getMemoryDir is <xdg>/kilo/memory", () => {
      expect(a.getMemoryDir()).toBe(join(xdgRoot, "kilo", "memory"));
    });
  });

  // Project-scoped adapters resolve their convention dir against an
  // explicit projectDir per the always-absolute getConfigDir contract.
  const projectDir = join(fakeHome, "fixture-project");

  describe("CursorAdapter", () => {
    const a = new CursorAdapter();
    it("getConfigDir is <project>/.cursor (absolute)", () => {
      expect(a.getConfigDir(projectDir)).toBe(resolve(projectDir, ".cursor"));
    });
    it("getInstructionFiles is ['context-mode.mdc']", () => {
      expect(a.getInstructionFiles()).toEqual(["context-mode.mdc"]);
    });
    it("getMemoryDir is <cwd>/.cursor/memory (absolute, no projectDir → cwd)", () => {
      // getMemoryDir() inherits BaseAdapter's default which calls
      // getConfigDir() without args → cursor falls back to process.cwd().
      expect(a.getMemoryDir()).toBe(resolve(process.cwd(), ".cursor", "memory"));
    });
  });

  describe("VSCodeCopilotAdapter", () => {
    const a = new VSCodeCopilotAdapter();
    it("getConfigDir is <project>/.github (absolute)", () => {
      expect(a.getConfigDir(projectDir)).toBe(resolve(projectDir, ".github"));
    });
    it("getInstructionFiles is ['copilot-instructions.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["copilot-instructions.md"]);
    });
    it("getMemoryDir is <cwd>/.github/memory (absolute)", () => {
      expect(a.getMemoryDir()).toBe(resolve(process.cwd(), ".github", "memory"));
    });
  });

  describe("JetBrainsCopilotAdapter", () => {
    const a = new JetBrainsCopilotAdapter();
    it("getConfigDir is <project>/.github (absolute)", () => {
      expect(a.getConfigDir(projectDir)).toBe(resolve(projectDir, ".github"));
    });
    it("getInstructionFiles is ['copilot-instructions.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["copilot-instructions.md"]);
    });
    it("getMemoryDir is <project>/.github/memory (absolute)", () => {
      // JetBrains adapter resolves via its own getProjectDir() (env var
      // chain or cwd) when getMemoryDir() is called without args.
      expect(isAbsolute(a.getMemoryDir())).toBe(true);
      expect(a.getMemoryDir().endsWith(join(".github", "memory"))).toBe(true);
    });
  });

  describe("CopilotCliAdapter", () => {
    const a = new CopilotCliAdapter();
    it("getConfigDir is <project>/.github (absolute)", () => {
      expect(a.getConfigDir(projectDir)).toBe(resolve(projectDir, ".github"));
    });
    it("getInstructionFiles is ['copilot-instructions.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["copilot-instructions.md"]);
    });
    it("getMemoryDir honors CWD when no projectDir is provided", () => {
      // When getMemoryDir() is called without args, it implicitly uses
      // process.cwd() via getConfigDir(), resulting in cwd/.github/memory.
      expect(a.getMemoryDir()).toBe(resolve(process.cwd(), ".github", "memory"));
    });
    it("getMemoryDir appends a per-projectDir hash subdir under the base", () => {
      // Per BaseAdapter, getMemoryDir(projectDir) = <base>/<hash(projectDir)>
      // where <base> = getMemoryDir(). Assert the arg actually affects the
      // result (catches a regression that drops projectDir) without coupling
      // to the hash implementation.
      const base = a.getMemoryDir();
      const withProject = a.getMemoryDir(projectDir);
      expect(withProject.startsWith(base)).toBe(true);
      expect(withProject).not.toBe(base);
      expect(a.getMemoryDir(resolve(projectDir, "other"))).not.toBe(withProject);
    });

    // ── getSessionDir ──────────────────────────────────────

    describe("getSessionDir", () => {
      let savedEnv: Record<string, string | undefined>;
      let tmpDirs: string[];

      afterEach(() => {
        // restore env
        for (const [k, v] of Object.entries(savedEnv)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        // clean up tmp dirs
        for (const d of tmpDirs) {
          try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      });

      it("default (no override) → ~/.copilot/context-mode/sessions", () => {
        savedEnv = { COPILOT_HOME: process.env.COPILOT_HOME, CONTEXT_MODE_DATA_DIR: process.env.CONTEXT_MODE_DATA_DIR };
        tmpDirs = [];
        delete process.env.COPILOT_HOME;
        delete process.env.CONTEXT_MODE_DATA_DIR;
        const adapter = new CopilotCliAdapter();
        const dir = adapter.getSessionDir();
        expect(dir).toBe(join(homedir(), ".copilot", "context-mode", "sessions"));
      });

      it("COPILOT_HOME override → <COPILOT_HOME>/context-mode/sessions", () => {
        const fakeHome2 = mkdtempSync(join(tmpdir(), "ctx-copilot-home-"));
        savedEnv = { COPILOT_HOME: process.env.COPILOT_HOME, CONTEXT_MODE_DATA_DIR: process.env.CONTEXT_MODE_DATA_DIR };
        tmpDirs = [fakeHome2];
        delete process.env.CONTEXT_MODE_DATA_DIR;
        process.env.COPILOT_HOME = fakeHome2;
        const adapter = new CopilotCliAdapter();
        const dir = adapter.getSessionDir();
        expect(dir).toBe(join(fakeHome2, "context-mode", "sessions"));
      });

      it("CONTEXT_MODE_DATA_DIR takes precedence over COPILOT_HOME", () => {
        const dataDir = mkdtempSync(join(tmpdir(), "ctx-data-dir-"));
        const copilotHome = mkdtempSync(join(tmpdir(), "ctx-copilot-home-"));
        savedEnv = { COPILOT_HOME: process.env.COPILOT_HOME, CONTEXT_MODE_DATA_DIR: process.env.CONTEXT_MODE_DATA_DIR };
        tmpDirs = [dataDir, copilotHome];
        process.env.CONTEXT_MODE_DATA_DIR = dataDir;
        process.env.COPILOT_HOME = copilotHome;
        const adapter = new CopilotCliAdapter();
        const dir = adapter.getSessionDir();
        expect(dir).toBe(join(dataDir, "context-mode", "sessions"));
        expect(dir).not.toContain(copilotHome);
      });
    });

    // ── getProjectDir ──────────────────────────────────────

    describe("getProjectDir", () => {
      let savedCopilotCwd: string | undefined;

      afterEach(() => {
        if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
        else process.env.COPILOT_CWD = savedCopilotCwd;
      });

      it("COPILOT_CWD set → returns that value", () => {
        savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = "/some/project/dir";
        const adapter = new CopilotCliAdapter();
        // Access protected method via cast
        expect((adapter as unknown as { getProjectDir(): string }).getProjectDir()).toBe("/some/project/dir");
      });

      it("COPILOT_CWD unset → returns process.cwd()", () => {
        savedCopilotCwd = process.env.COPILOT_CWD;
        delete process.env.COPILOT_CWD;
        const adapter = new CopilotCliAdapter();
        expect((adapter as unknown as { getProjectDir(): string }).getProjectDir()).toBe(process.cwd());
      });
    });

    // ── validateHooks — Task A RED test (CWD bug) ─────────
    // validateHooks must inspect the PROJECT's .github/hooks, not process.cwd()

    describe("validateHooks", () => {
      let tmpProject: string;
      let tmpPluginRoot: string;

      afterEach(() => {
        try { rmSync(tmpProject, { recursive: true, force: true }); } catch { /* ignore */ }
        try { rmSync(tmpPluginRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      });

      it("missing .github/hooks dir → returns single fail result (resolves against project dir, not cwd)", () => {
        // project dir has NO .github/hooks — but process.cwd() might have one
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-no-hooks-"));
        tmpPluginRoot = mkdtempSync(join(tmpdir(), "ctx-plugin-root-"));
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          const results = adapter.validateHooks(tmpPluginRoot);
          // Must report failure for missing hooks dir
          expect(results[0].status).toBe("fail");
          expect(results[0].check).toBe("Hooks directory");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });

      it("missing context-mode.json → returns fail for hook config", () => {
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-no-json-"));
        tmpPluginRoot = mkdtempSync(join(tmpdir(), "ctx-plugin-root-"));
        // Create .github/hooks dir but no context-mode.json
        mkdirSync(join(tmpProject, ".github", "hooks"), { recursive: true });
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          const results = adapter.validateHooks(tmpPluginRoot);
          const hookConfig = results.find(r => r.check === "Hook configuration");
          expect(hookConfig).toBeDefined();
          expect(hookConfig!.status).toBe("fail");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });

      it("context-mode.json present but missing PreToolUse → fail for PreToolUse hook", () => {
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-no-pre-"));
        tmpPluginRoot = mkdtempSync(join(tmpdir(), "ctx-plugin-root-"));
        mkdirSync(join(tmpProject, ".github", "hooks"), { recursive: true });
        writeFileSync(
          join(tmpProject, ".github", "hooks", "context-mode.json"),
          JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node sessionstart.mjs" }] }] } }),
        );
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          const results = adapter.validateHooks(tmpPluginRoot);
          const preToolUse = results.find(r => r.check === "PreToolUse hook");
          expect(preToolUse).toBeDefined();
          expect(preToolUse!.status).toBe("fail");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });

      it("context-mode.json present but missing SessionStart → fail for SessionStart hook", () => {
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-no-sess-"));
        tmpPluginRoot = mkdtempSync(join(tmpdir(), "ctx-plugin-root-"));
        mkdirSync(join(tmpProject, ".github", "hooks"), { recursive: true });
        writeFileSync(
          join(tmpProject, ".github", "hooks", "context-mode.json"),
          JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node pretooluse.mjs" }] }] } }),
        );
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          const results = adapter.validateHooks(tmpPluginRoot);
          const sessionStart = results.find(r => r.check === "SessionStart hook");
          expect(sessionStart).toBeDefined();
          expect(sessionStart!.status).toBe("fail");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });

      it("happy path — both hooks present → both pass, plus warn results", () => {
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-happy-"));
        tmpPluginRoot = mkdtempSync(join(tmpdir(), "ctx-plugin-root-"));
        mkdirSync(join(tmpProject, ".github", "hooks"), { recursive: true });
        writeFileSync(
          join(tmpProject, ".github", "hooks", "context-mode.json"),
          JSON.stringify({
            hooks: {
              PreToolUse: [{ hooks: [{ type: "command", command: "node pretooluse.mjs" }] }],
              SessionStart: [{ hooks: [{ type: "command", command: "node sessionstart.mjs" }] }],
            },
          }),
        );
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          const results = adapter.validateHooks(tmpPluginRoot);
          expect(results.find(r => r.check === "PreToolUse hook")!.status).toBe("pass");
          expect(results.find(r => r.check === "SessionStart hook")!.status).toBe("pass");
          expect(results.find(r => r.check === "Hook scripts")!.status).toBe("warn");
          expect(results.find(r => r.check === "Matcher support")!.status).toBe("warn");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });

      it("Task A regression: inspects PROJECT dir .github/hooks, not process.cwd()", () => {
        // process.cwd() is the repo root (which has a real .github/hooks).
        // We create a fresh empty project dir — validateHooks must look there, not cwd.
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-cwd-bug-"));
        tmpPluginRoot = mkdtempSync(join(tmpdir(), "ctx-plugin-root-"));
        // tmpProject deliberately has NO .github/hooks
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          const results = adapter.validateHooks(tmpPluginRoot);
          // Must fail because tmpProject has no .github/hooks —
          // if the bug is present it would succeed by reading cwd's hooks.
          expect(results[0].status).toBe("fail");
          expect(results[0].message).toContain(".github/hooks/");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });
    });

    // ── checkPluginRegistration ────────────────────────────

    describe("checkPluginRegistration", () => {
      it("returns warn status", () => {
        const result = new CopilotCliAdapter().checkPluginRegistration();
        expect(result.status).toBe("warn");
        expect(result.check).toContain("registration");
      });
    });

    // ── getInstalledVersion ────────────────────────────────

    describe("getInstalledVersion", () => {
      let tmpProject: string;

      afterEach(() => {
        try { rmSync(tmpProject, { recursive: true, force: true }); } catch { /* ignore */ }
      });

      it("returns 'configured' when context-mode.json has hooks", () => {
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-ver-configured-"));
        mkdirSync(join(tmpProject, ".github", "hooks"), { recursive: true });
        writeFileSync(
          join(tmpProject, ".github", "hooks", "context-mode.json"),
          JSON.stringify({ hooks: { PreToolUse: [] } }),
        );
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          expect(adapter.getInstalledVersion()).toBe("configured");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });

      it("returns 'unknown' when context-mode.json is absent or unreadable", () => {
        tmpProject = mkdtempSync(join(tmpdir(), "ctx-project-ver-unknown-"));
        // no .github/hooks at all
        const savedCopilotCwd = process.env.COPILOT_CWD;
        process.env.COPILOT_CWD = tmpProject;
        try {
          const adapter = new CopilotCliAdapter();
          expect(adapter.getInstalledVersion()).toBe("unknown");
        } finally {
          if (savedCopilotCwd === undefined) delete process.env.COPILOT_CWD;
          else process.env.COPILOT_CWD = savedCopilotCwd;
        }
      });
    });
  });

  describe("KiroAdapter", () => {
    const a = new KiroAdapter();
    it("getConfigDir is <project>/.kiro (absolute)", () => {
      expect(a.getConfigDir(projectDir)).toBe(resolve(projectDir, ".kiro"));
    });
    it("getInstructionFiles is ['KIRO.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["KIRO.md"]);
    });
    it("getMemoryDir is <cwd>/.kiro/memory (absolute)", () => {
      expect(a.getMemoryDir()).toBe(resolve(process.cwd(), ".kiro", "memory"));
    });
  });

  describe("ZedAdapter", () => {
    const a = new ZedAdapter();
    it("getConfigDir is ~/.config/zed", () => {
      expect(a.getConfigDir()).toBe(join(homedir(), ".config", "zed"));
    });
    it("getInstructionFiles is ['AGENTS.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["AGENTS.md"]);
    });
    it("getMemoryDir is ~/.config/zed/memory", () => {
      expect(a.getMemoryDir()).toBe(join(homedir(), ".config", "zed", "memory"));
    });
  });

  describe("AntigravityAdapter", () => {
    const a = new AntigravityAdapter();
    it("getConfigDir is ~/.gemini/antigravity", () => {
      expect(a.getConfigDir()).toBe(join(homedir(), ".gemini", "antigravity"));
    });
    it("getInstructionFiles is ['GEMINI.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["GEMINI.md"]);
    });
    it("getMemoryDir is ~/.gemini/antigravity/memory", () => {
      expect(a.getMemoryDir()).toBe(
        join(homedir(), ".gemini", "antigravity", "memory"),
      );
    });
  });

  describe("OpenClawAdapter", () => {
    const a = new OpenClawAdapter();
    it("getConfigDir is <project> root (absolute)", () => {
      expect(a.getConfigDir(projectDir)).toBe(resolve(projectDir));
    });
    it("getInstructionFiles is ['AGENTS.md']", () => {
      expect(a.getInstructionFiles()).toEqual(["AGENTS.md"]);
    });
    it("getMemoryDir is <cwd>/memory (absolute)", () => {
      expect(a.getMemoryDir()).toBe(resolve(process.cwd(), "memory"));
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Cross-adapter contract — getConfigDir() ALWAYS returns absolute
  //
  // Catches the leaky-seam bug where some adapters returned project-
  // relative segments ("", ".cursor", ".github", ".kiro") and others
  // returned absolute paths. Every consumer (server.ts, auto-memory.ts)
  // can now treat the return uniformly without isAbsolute() guards.
  // ──────────────────────────────────────────────────────────────────
  describe("HookAdapter.getConfigDir contract", () => {
    const projectDirForContract = join(fakeHome, "fixture-project");

    const allAdapters: Array<{ name: string; instance: { getConfigDir: (p?: string) => string } }> = [
      { name: "ClaudeCodeAdapter", instance: new ClaudeCodeAdapter() },
      { name: "QwenCodeAdapter", instance: new QwenCodeAdapter() },
      { name: "GeminiCLIAdapter", instance: new GeminiCLIAdapter() },
      { name: "CodexAdapter", instance: new CodexAdapter() },
      { name: "OpenCodeAdapter (opencode)", instance: new OpenCodeAdapter() },
      { name: "OpenCodeAdapter (kilo)", instance: new OpenCodeAdapter("kilo") },
      { name: "CursorAdapter", instance: new CursorAdapter() },
      { name: "VSCodeCopilotAdapter", instance: new VSCodeCopilotAdapter() },
      { name: "JetBrainsCopilotAdapter", instance: new JetBrainsCopilotAdapter() },
      { name: "CopilotCliAdapter", instance: new CopilotCliAdapter() },
      { name: "KiroAdapter", instance: new KiroAdapter() },
      { name: "ZedAdapter", instance: new ZedAdapter() },
      { name: "AntigravityAdapter", instance: new AntigravityAdapter() },
      { name: "OpenClawAdapter", instance: new OpenClawAdapter() },
    ];

    it.each(allAdapters)(
      "$name.getConfigDir(projectDir) returns an absolute path",
      ({ instance }) => {
        const dir = instance.getConfigDir(projectDirForContract);
        expect(typeof dir).toBe("string");
        expect(dir.length).toBeGreaterThan(0);
        expect(isAbsolute(dir)).toBe(true);
      },
    );

    it.each(allAdapters)(
      "$name.getConfigDir() (no args) still returns an absolute path",
      ({ instance }) => {
        const dir = instance.getConfigDir();
        expect(typeof dir).toBe("string");
        expect(dir.length).toBeGreaterThan(0);
        expect(isAbsolute(dir)).toBe(true);
      },
    );
  });
});
