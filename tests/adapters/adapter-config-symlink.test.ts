/**
 * Regression: the OpenClaw and Copilot (VS Code + JetBrains) adapters write
 * cwd-relative config (`openclaw.json`, `.github/hooks/context-mode.json`). A
 * cloned/malicious repo can plant a symlink at that config path so a plain
 * writeFileSync would truncate an arbitrary file such as ~/.bashrc. These
 * adapters must route through writeProjectConfigSafely and refuse the write.
 *
 * These are behavioral, not source-grep, tests: they call the real writeSettings
 * and assert the out-of-root victim is untouched, so they FAIL if an adapter
 * reverts to a raw writeFileSync.
 */
import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OpenClawAdapter } from "../../src/adapters/openclaw/index.js";
import { VSCodeCopilotAdapter } from "../../src/adapters/vscode-copilot/index.js";
import { JetBrainsCopilotAdapter } from "../../src/adapters/jetbrains-copilot/index.js";

describe("adapter config writes refuse a symlink escape", () => {
  let base: string;
  let projectDir: string;
  let outsideDir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    base = mkdtempSync(join(tmpdir(), "ctx-adapter-symlink-"));
    projectDir = join(base, "project");
    outsideDir = join(base, "outside");
    mkdirSync(projectDir);
    mkdirSync(outsideDir);
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(base, { recursive: true, force: true });
  });

  it("OpenClaw refuses a symlinked openclaw.json (no out-of-root overwrite)", () => {
    const victim = join(outsideDir, "victim");
    writeFileSync(victim, "ORIGINAL");
    symlinkSync(victim, resolve("openclaw.json")); // openclaw.json -> outside/victim
    expect(() => new OpenClawAdapter().writeSettings({ enabled: true })).toThrow();
    expect(readFileSync(victim, "utf-8")).toBe("ORIGINAL");
  });

  it("OpenClaw skips backing up a symlinked openclaw.json (secret not copied locally)", () => {
    const secret = join(outsideDir, "secret");
    writeFileSync(secret, "SECRET");
    symlinkSync(secret, resolve("openclaw.json")); // openclaw.json -> outside/secret
    new OpenClawAdapter().backupSettings();
    // The planted symlink must not be copied into a repo-local .bak.
    expect(existsSync(resolve("openclaw.json.bak"))).toBe(false);
    expect(readFileSync(secret, "utf-8")).toBe("SECRET");
  });

  // Both Copilot leaves inherit writeSettings from CopilotBaseAdapter unchanged,
  // so the same symlinked-target test covers vscode-copilot AND jetbrains-copilot.
  for (const [name, make] of [
    ["VSCodeCopilot", () => new VSCodeCopilotAdapter()],
    ["JetBrainsCopilot", () => new JetBrainsCopilotAdapter()],
  ] as const) {
    it(`${name} refuses a symlinked .github/hooks/context-mode.json`, () => {
      const victim = join(outsideDir, "victim");
      writeFileSync(victim, "ORIGINAL");
      mkdirSync(resolve(".github", "hooks"), { recursive: true });
      symlinkSync(victim, resolve(".github", "hooks", "context-mode.json"));
      expect(() => make().writeSettings({ enabled: true })).toThrow();
      expect(readFileSync(victim, "utf-8")).toBe("ORIGINAL");
    });
  }

  // The Copilot config sits two levels below cwd (.github/hooks/context-mode.json).
  // The shared guard lstat-checks the immediate dir + the target file, but lstat
  // follows an intermediate symlink, so a planted `.github` GRANDPARENT could still
  // redirect the write out of the project. It must be refused too.
  it("VSCodeCopilot refuses a symlinked .github grandparent dir", () => {
    symlinkSync(outsideDir, resolve(".github")); // .github -> outside/
    expect(() => new VSCodeCopilotAdapter().writeSettings({ enabled: true })).toThrow();
    expect(existsSync(join(outsideDir, "hooks", "context-mode.json"))).toBe(false);
  });

  it("OpenClaw still writes normally when no symlink is present", () => {
    new OpenClawAdapter().writeSettings({ enabled: true });
    expect(readFileSync(resolve("openclaw.json"), "utf-8")).toContain("enabled");
  });

  it("Copilot still writes normally when no symlink is present", () => {
    new VSCodeCopilotAdapter().writeSettings({ enabled: true });
    expect(
      readFileSync(resolve(".github", "hooks", "context-mode.json"), "utf-8"),
    ).toContain("enabled");
  });

  // Refusing *every* symlink hard-failed setup for users who manage config with a
  // dotfile manager (stow/chezmoi). A symlink whose real target stays under the
  // project can't redirect the write out of the tree, so it must be accepted and
  // written through, not refused.
  it("OpenClaw writes through an in-root symlinked openclaw.json", () => {
    writeFileSync(resolve("real-openclaw.json"), "{}");
    symlinkSync(resolve("real-openclaw.json"), resolve("openclaw.json")); // -> in-root target
    expect(() => new OpenClawAdapter().writeSettings({ enabled: true })).not.toThrow();
    expect(readFileSync(resolve("real-openclaw.json"), "utf-8")).toContain("enabled");
  });

  it("VSCodeCopilot writes through an in-root symlinked .github grandparent", () => {
    mkdirSync(resolve("real-github"));
    symlinkSync(resolve("real-github"), resolve(".github")); // .github -> real-github (in-root)
    expect(() => new VSCodeCopilotAdapter().writeSettings({ enabled: true })).not.toThrow();
    expect(
      readFileSync(resolve("real-github", "hooks", "context-mode.json"), "utf-8"),
    ).toContain("enabled");
  });

  // backupSettings must mirror the write guard: an in-root symlinked config (a
  // dotfile manager's intra-repo link) still gets a .bak, while a config symlinked
  // OUTSIDE the project is skipped so a secret can't land in a repo-local .bak.
  it("OpenClaw backs up an in-root symlinked openclaw.json", () => {
    writeFileSync(resolve("real-openclaw.json"), JSON.stringify({ enabled: true }));
    symlinkSync(resolve("real-openclaw.json"), resolve("openclaw.json")); // -> in-root target
    const bak = new OpenClawAdapter().backupSettings();
    expect(bak).toBe(resolve("openclaw.json.bak"));
    expect(readFileSync(resolve("openclaw.json.bak"), "utf-8")).toContain("enabled");
  });

  it("OpenClaw skips backup of an openclaw.json symlinked outside the project", () => {
    const secret = join(outsideDir, "secret");
    writeFileSync(secret, "SECRET");
    symlinkSync(secret, resolve("openclaw.json")); // -> outside/secret
    expect(new OpenClawAdapter().backupSettings()).toBeNull();
    expect(existsSync(resolve("openclaw.json.bak"))).toBe(false);
  });
});

describe("adapter backupSettings overrides guard a symlinked config path", () => {
  // base.backupSettings skips a config symlink whose real target escapes the
  // project (so a planted symlink can't copy an arbitrary file into a repo-local
  // .bak) while backing up an in-root symlink in-tree. The three adapters that
  // override backupSettings must carry the same symlinkEscapesRoot guard the
  // write path uses, since the override bypasses the base method entirely.
  const readSrc = (rel: string) =>
    readFileSync(resolve(__dirname, "..", "..", "src", "adapters", rel), "utf-8");
  for (const [name, rel] of [
    ["OpenCode", "opencode/index.ts"],
    ["OpenClaw", "openclaw/index.ts"],
    ["Codex", "codex/index.ts"],
  ] as const) {
    it(`${name} backupSettings skips only a symlink escaping the project`, () => {
      const body = readSrc(rel).slice(readSrc(rel).indexOf("backupSettings("));
      expect(body).toMatch(/symlinkEscapesRoot\([^)]*process\.cwd\(\)\)/);
      expect(body).not.toMatch(/lstatSync\([^)]*\)\.isSymbolicLink\(\)/);
    });
  }
});
