import "../setup-home";
/**
 * Hook Integration Tests — GitHub Copilot CLI hooks
 *
 * Mirrors the VS Code / JetBrains Copilot hook contract:
 *   - pretooluse.mjs: routing block + security redirects
 *   - posttooluse.mjs: event capture (silent)
 *   - precompact.mjs: snapshot generation (silent)
 *   - sessionstart.mjs: routing block + session directive
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, rmdirSync, readdirSync, existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir, homedir } from "node:os";

const _hashCanonical = (p: string) => createHash("sha256").update(
  (process.platform === "darwin" || process.platform === "win32") ? p.toLowerCase() : p,
).digest("hex").slice(0, 16);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HOOKS_DIR = join(__dirname, "..", "..", "hooks", "copilot-cli");

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

// ── Hook scripts exist ────────────────────────────────────

describe("Copilot CLI hook scripts", () => {
  test("pretooluse.mjs exists in hooks/copilot-cli/", () => {
    expect(existsSync(join(HOOKS_DIR, "pretooluse.mjs"))).toBe(true);
  });

  test("posttooluse.mjs exists in hooks/copilot-cli/", () => {
    expect(existsSync(join(HOOKS_DIR, "posttooluse.mjs"))).toBe(true);
  });

  test("precompact.mjs exists in hooks/copilot-cli/", () => {
    expect(existsSync(join(HOOKS_DIR, "precompact.mjs"))).toBe(true);
  });

  test("sessionstart.mjs exists in hooks/copilot-cli/", () => {
    expect(existsSync(join(HOOKS_DIR, "sessionstart.mjs"))).toBe(true);
  });
});

// ── Hook integration tests ────────────────────────────────

describe("GitHub Copilot CLI hooks", () => {
  let tempDir: string;
  let copilotHome: string;
  let dbPath: string;
  let eventsPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "copilot-cli-hook-test-"));
    // Isolate session storage in a temp COPILOT_HOME so these hooks never
    // write into the developer's / CI's real ~/.copilot/context-mode/.
    copilotHome = mkdtempSync(join(tmpdir(), "copilot-cli-home-"));
    const hash = _hashCanonical(tempDir);
    const sessionsDir = join(copilotHome, "context-mode", "sessions");
    dbPath = join(sessionsDir, `${hash}.db`);
    eventsPath = join(sessionsDir, `${hash}-events.md`);
  });

  afterAll(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { rmSync(copilotHome, { recursive: true, force: true }); } catch { /* best effort */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* best effort */ }
    try { if (existsSync(eventsPath)) unlinkSync(eventsPath); } catch { /* best effort */ }
  });


  // MCP readiness sentinel — subprocess hooks check process.ppid (= this test's pid)
  const _sentinelDir = process.platform === "win32" ? tmpdir() : "/tmp";
  const mcpSentinel = resolve(_sentinelDir, `context-mode-mcp-ready-${process.pid}`);

  // Clean file-based guidance throttle markers between tests.
  beforeEach(() => {
    const wid = process.env.VITEST_WORKER_ID;
    const suffix = wid ? `${process.pid}-w${wid}` : String(process.pid);
    const legacyDir = resolve(tmpdir(), `context-mode-guidance-${suffix}`);
    const sessionDir = resolve(tmpdir(), `context-mode-guidance-s-pid-${process.pid}`);

    // fs.rmSync silently no-ops on Windows when tmpdir contains non-ASCII chars (#454).
    const rmRobust = (dir: string) => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      if (!existsSync(dir)) return;
      try {
        for (const name of readdirSync(dir)) {
          try { unlinkSync(resolve(dir, name)); } catch {}
        }
        rmdirSync(dir);
      } catch {}
    };

    rmRobust(legacyDir);
    rmRobust(sessionDir);
    writeFileSync(mcpSentinel, String(process.pid));
  });

  afterEach(() => {
    try { unlinkSync(mcpSentinel); } catch {}
  });

  const copilotEnv = () => ({ COPILOT_CWD: tempDir, COPILOT_HOME: copilotHome });

  // ── PreToolUse ───────────────────────────────────────────

  describe("pretooluse.mjs", () => {
    test("run_in_terminal: injects guidance additionalContext", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "run_in_terminal",
        tool_input: { command: "npm test" },
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout);
      // Flat schema per GitHub Copilot CLI hooks reference (no hookSpecificOutput wrapper)
      expect(out.additionalContext).toContain("ctx_batch_execute");
    });

    test("run_in_terminal: curl is redirected to echo", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "run_in_terminal",
        tool_input: { command: "curl https://example.com" },
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout);
      // Flat schema per GitHub Copilot CLI hooks reference (no hookSpecificOutput wrapper)
      expect(out.modifiedArgs.command).toContain("context-mode");
      expect(out.modifiedArgs.command).toContain("ctx_fetch_and_index");
    });

    test("handles empty input gracefully (no crash)", () => {
      const result = runHook("pretooluse.mjs", {}, copilotEnv());
      expect(result.exitCode).toBe(0);
    });
  });

  // ── PostToolUse ──────────────────────────────────────────

  describe("posttooluse.mjs", () => {
    test("captures Read event silently", () => {
      const result = runHook("posttooluse.mjs", {
        tool_name: "Read",
        tool_input: { file_path: "/src/main.ts" },
        tool_response: "file contents",
        sessionId: "test-copilot-cli-session",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });

    test("supports sessionId camelCase field", () => {
      const result = runHook("posttooluse.mjs", {
        tool_name: "Bash",
        tool_input: { command: "git log --oneline -5" },
        tool_response: "abc1234 feat: add feature",
        sessionId: "test-copilot-cli-camelcase",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });

    test("handles empty input gracefully", () => {
      const result = runHook("posttooluse.mjs", {}, copilotEnv());
      expect(result.exitCode).toBe(0);
    });
  });

  // ── PreCompact ───────────────────────────────────────────

  describe("precompact.mjs", () => {
    test("runs silently with no events", () => {
      const result = runHook("precompact.mjs", {
        sessionId: "test-copilot-cli-precompact",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });

    test("handles empty input gracefully", () => {
      const result = runHook("precompact.mjs", {}, copilotEnv());
      expect(result.exitCode).toBe(0);
    });
  });

  // ── SessionStart ─────────────────────────────────────────

  describe("sessionstart.mjs", () => {
    test("startup: outputs routing block", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        sessionId: "test-copilot-cli-startup",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SessionStart");
      expect(result.stdout).toContain("context-mode");
    });

    test("compact: outputs routing block", () => {
      const result = runHook("sessionstart.mjs", {
        source: "compact",
        sessionId: "test-copilot-cli-compact",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SessionStart");
    });

    test("produces valid JSON with hookSpecificOutput", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        sessionId: "test-copilot-cli-valid-json",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout);
      expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(out.hookSpecificOutput.additionalContext).toBeTruthy();
      expect(typeof out.hookSpecificOutput.additionalContext).toBe("string");
    });

    test("handles empty stdin without crashing", () => {
      const result = runHook("sessionstart.mjs", {}, copilotEnv());
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SessionStart");
    });

    test("supports sessionId camelCase and emits valid JSON with additionalContext", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        sessionId: "test-copilot-cli-camelcase-start",
      }, copilotEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SessionStart");
      const out = JSON.parse(result.stdout);
      expect(out.hookSpecificOutput.additionalContext).toContain("context-mode_");
    });
  });

  // ── End-to-end: PostToolUse → PreCompact → SessionStart ──────────────

  describe("end-to-end flow", () => {
    test("capture events, build snapshot, and restore on compact", () => {
      const sessionId = "test-copilot-cli-e2e";
      const env = copilotEnv();

      // 1. Capture events via PostToolUse
      runHook("posttooluse.mjs", {
        tool_name: "Read",
        tool_input: { file_path: "/src/app.ts" },
        tool_response: "export default {}",
        sessionId,
      }, env);

      runHook("posttooluse.mjs", {
        tool_name: "Edit",
        tool_input: { file_path: "/src/app.ts", old_string: "{}", new_string: "{ foo: 1 }" },
        sessionId,
      }, env);

      // 2. Build snapshot via PreCompact
      const precompactResult = runHook("precompact.mjs", {
        sessionId,
      }, env);
      expect(precompactResult.exitCode).toBe(0);

      // 3. SessionStart compact should include session knowledge
      const startResult = runHook("sessionstart.mjs", {
        source: "compact",
        sessionId,
      }, env);
      expect(startResult.exitCode).toBe(0);
      expect(startResult.stdout).toContain("SessionStart");
    });
  });

  // ── #435 round-3 — COPILOT_HOME override test ──────────────────────────────────
  describe("GitHub Copilot CLI hooks — COPILOT_HOME override", () => {
    let copilotHomeDir: string;
    let homeOverrideWorktreeDir: string;
    let copilotHomeDbPath: string;

    beforeAll(async () => {
      copilotHomeDir = mkdtempSync(join(tmpdir(), "copilot-home-override-"));
      homeOverrideWorktreeDir = mkdtempSync(join(tmpdir(), "copilot-wt-home-"));

      const wtHash = _hashCanonical(homeOverrideWorktreeDir.replace(/\\/g, "/"));

      const copilotHomeSessions = join(copilotHomeDir, "context-mode", "sessions");

      const { mkdirSync: mk } = await import("node:fs");
      mk(copilotHomeSessions, { recursive: true });

      copilotHomeDbPath = join(copilotHomeSessions, `${wtHash}.db`);
    });

    afterAll(() => {
      try { rmSync(copilotHomeDir, { recursive: true, force: true }); } catch { /* best effort */ }
      try { rmSync(homeOverrideWorktreeDir, { recursive: true, force: true }); } catch { /* best effort */ }
      try { if (existsSync(copilotHomeDbPath)) unlinkSync(copilotHomeDbPath); } catch { /* best effort */ }
    });

    const _sentinelDir = process.platform === "win32" ? tmpdir() : "/tmp";
    const mcpSentinel = resolve(_sentinelDir, `context-mode-mcp-ready-${process.pid}`);
    beforeEach(() => { writeFileSync(mcpSentinel, String(process.pid)); });
    afterEach(() => { try { unlinkSync(mcpSentinel); } catch {} });

    test("COPILOT_HOME override: posttooluse writes DB under COPILOT_HOME, not ~/.copilot/", () => {
      const result = runHook("posttooluse.mjs", {
        tool_name: "Read",
        tool_input: { file_path: `${homeOverrideWorktreeDir}/src/main.ts` },
        tool_response: "file contents",
        sessionId: "copilot-home-override-test",
        cwd: homeOverrideWorktreeDir,
      }, { COPILOT_CWD: homeOverrideWorktreeDir, COPILOT_HOME: copilotHomeDir });

      expect(result.exitCode).toBe(0);
      expect(existsSync(copilotHomeDbPath)).toBe(true);
    });

    test("sessionstart with COPILOT_HOME override emits routing block", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        sessionId: "copilot-home-startup",
      }, { COPILOT_CWD: homeOverrideWorktreeDir, COPILOT_HOME: copilotHomeDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SessionStart");
      expect(result.stdout).toContain("context-mode");
    });
  });


  // ── #435 round-3 — DB keyed on COPILOT_CWD-hash ──────────────────────
  describe("GitHub Copilot CLI hooks — DB keyed on COPILOT_CWD-hash (#435)", () => {
    let mcpDir: string;
    let worktreeDir: string;
    let copilotHomeC: string;
    let mcpDbPath: string;
    let worktreeDbPath: string;

    beforeAll(async () => {
      mcpDir = mkdtempSync(join(tmpdir(), "copilot-mcp-A-"));
      worktreeDir = mkdtempSync(join(tmpdir(), "copilot-wt-B-"));
      // Isolate session storage in a temp COPILOT_HOME (not the real ~/.copilot).
      copilotHomeC = mkdtempSync(join(tmpdir(), "copilot-cli-home-c-"));

      const mcpHash = _hashCanonical(mcpDir.replace(/\\/g, "/"));
      const wtHash = _hashCanonical(worktreeDir.replace(/\\/g, "/"));
      const configDir = join(copilotHomeC, "context-mode");
      const sessionsDir = join(configDir, "sessions");

      const { mkdirSync: mk } = await import("node:fs");
      mk(configDir, { recursive: true });

      mcpDbPath = join(sessionsDir, `${mcpHash}.db`);
      worktreeDbPath = join(sessionsDir, `${wtHash}.db`);
    });

    afterAll(() => {
      try { rmSync(mcpDir, { recursive: true, force: true }); } catch { /* best effort */ }
      try { rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* best effort */ }
      try { rmSync(copilotHomeC, { recursive: true, force: true }); } catch { /* best effort */ }
      try { if (existsSync(mcpDbPath)) unlinkSync(mcpDbPath); } catch { /* best effort */ }
      try { if (existsSync(worktreeDbPath)) unlinkSync(worktreeDbPath); } catch { /* best effort */ }
    });

    const _sentinelDir = process.platform === "win32" ? tmpdir() : "/tmp";
    const mcpSentinel = resolve(_sentinelDir, `context-mode-mcp-ready-${process.pid}`);
    beforeEach(() => { writeFileSync(mcpSentinel, String(process.pid)); });
    afterEach(() => { try { unlinkSync(mcpSentinel); } catch {} });

    test("posttooluse writes DB under hook projectDir hash, not env COPILOT_CWD hash", () => {
      const result = runHook("posttooluse.mjs", {
        tool_name: "Read",
        tool_input: { file_path: `${worktreeDir}/src/main.ts` },
        tool_response: "file contents",
        sessionId: "copilot-435-r3",
        cwd: worktreeDir,
      }, { COPILOT_CWD: mcpDir, COPILOT_HOME: copilotHomeC });

      expect(result.exitCode).toBe(0);
      expect(existsSync(worktreeDbPath)).toBe(true);
      expect(existsSync(mcpDbPath)).toBe(false);
    });
  });
});
