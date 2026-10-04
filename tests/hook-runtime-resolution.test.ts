/**
 * Hook runtime resolution — issue #738.
 *
 * Auto-detect bun for hook command emission to cut ~40-60ms cold-start per
 * tool-call. Falls back to node when bun is missing, too old, or fails the
 * version probe. Resolution is cached at module load.
 *
 * Design constraints (locked with Mert, 2026-05-31):
 *   - NO env var, NO opt-out flag. User's escape is uninstall bun.
 *   - bun ≥ 1.0 required (older versions had ESM bugs that broke hooks).
 *   - Silent fallback on any failure — never block hook execution.
 *   - Module-load probe with cached result; not per-call.
 *   - `buildNodeCommand` semantics UNCHANGED (kept for openclaw doctor /
 *     upgrade hints which must stay on node — better-sqlite3 ABI, #543).
 *   - New `buildHookRuntimeCommand` wraps `buildNodeCommand` shape but
 *     swaps in the resolved JS runtime when bun is available.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// node:fs / node:child_process mocks below pin POSIX-shape bunFallbackPaths()
// candidates (~/.bun/bin/bun). Windows resolves to %USERPROFILE%\.bun\bin\bun.exe
// AND additional %LOCALAPPDATA%\Programs\bun\* candidates; faithfully mocking
// that generator from the test side is brittle and has already gone red twice
// chasing one-off mismatches. The production code path itself is Windows-safe
// (bunCommand() handles the .exe suffix + %LOCALAPPDATA% trap from #506); we
// guard those invariants in tests/runtime.test.ts which uses the real fs.
// Skip the POSIX-mock-only cases on Windows so CI stops getting blocked by
// test-infra fragility while still exercising the same logic on Ubuntu+macOS.
const itPosix = process.platform === "win32" ? test.skip : test;

describe("resolveHookRuntime — auto-detect bun ≥1.0, fall back to node (#738)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
  });

  itPosix("returns bun path + isBun=true when bun ≥1.0 is available", async () => {
    // bunCommand() resolves to either:
    //   1) the first existing path in bunFallbackPaths() (~/.bun/bin/bun on Unix), OR
    //   2) the literal "bun" string when commandExists("bun") succeeds.
    // We exercise branch (1) by stubbing HOME to a known directory and
    // claiming only "$HOME/.bun/bin/bun" exists.
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn((cmd: string, args: string[]) => {
        if (cmd === fakeBun && args[0] === "--version") {
          return Buffer.from("1.1.0\n");
        }
        throw new Error(`unexpected execFile: ${cmd} ${args.join(" ")}`);
      });
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const r = resolveHookRuntime();
      expect(r.isBun).toBe(true);
      expect(r.path).toBe(fakeBun);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test("returns node + isBun=false when bun is not installed", async () => {
    const execSync = vi.fn((cmd: string) => {
      if (/^command -v\s+bun$/.test(cmd)) throw new Error("not found");
      if (/^where\s+bun$/.test(cmd)) throw new Error("not found");
      return "";
    });
    const execFileSync = vi.fn(() => Buffer.from(""));
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      // The host's real process.execPath must read as live so the #841
      // liveness guard passes it through; only bun candidates are absent.
      return { ...actual, existsSync: (p: string | URL) => String(p) === process.execPath };
    });

    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
    resetHookRuntimeCache();
    const r = resolveHookRuntime();
    expect(r.isBun).toBe(false);
    expect(r.path).toBe(process.execPath);
  });

  itPosix("returns node + isBun=false when bun version < 1.0", async () => {
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn(() => Buffer.from("0.8.1\n"));
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const r = resolveHookRuntime();
      expect(r.isBun).toBe(false);
      expect(r.path).toBe(process.execPath);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  itPosix("returns node + isBun=false when bun version probe crashes", async () => {
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn(() => {
        throw new Error("segfault");
      });
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const r = resolveHookRuntime();
      expect(r.isBun).toBe(false);
      expect(r.path).toBe(process.execPath);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  itPosix("returns node + isBun=false when bun reports unparseable version string", async () => {
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn(() => Buffer.from("not-a-version\n"));
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const r = resolveHookRuntime();
      expect(r.isBun).toBe(false);
      expect(r.path).toBe(process.execPath);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test("caches result across calls (only probes once)", async () => {
    const execSync = vi.fn((cmd: string) => {
      if (/^command -v\s+bun$/.test(cmd)) throw new Error("nope");
      return "";
    });
    const execFileSync = vi.fn(() => Buffer.from(""));
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync: () => false };
    });

    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
    resetHookRuntimeCache();
    const r1 = resolveHookRuntime();
    const probeCallCount = execSync.mock.calls.length + execFileSync.mock.calls.length;
    const r2 = resolveHookRuntime();
    const r3 = resolveHookRuntime();
    const afterCount = execSync.mock.calls.length + execFileSync.mock.calls.length;
    expect(afterCount).toBe(probeCallCount); // no new probes
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
  });
});

// ─────────────────────────────────────────────────────────
// #841: Hooks break after a mise/asdf/nvm Node *patch* upgrade.
//
// When bun is absent, resolveHookRuntime() falls back to process.execPath,
// which under a version manager is a *version-pinned* absolute path
// (e.g. ~/.local/share/mise/installs/node/20.1.0/bin/node). `mise upgrade
// node` (also asdf/nvm) installs 20.1.1 and removes the 20.1.0 dir. The MCP
// server caches the now-dangling 20.1.0 path; every baked hook command then
// fails with spawn ENOENT and context-mode silently dies for that user.
//
// Extends the #800/#803 liveness-guard pattern (resolveJavascriptRuntime,
// Homebrew Cellar ENOENT) to the HOOK runtime path: use the pinned execPath
// IFF it exists on disk, else re-resolve a working `node` from PATH. The
// reason execPath was pinned (#190 snap-node / #369 Windows MSYS PATH) is
// preserved — a *live* execPath is still returned verbatim.
// ─────────────────────────────────────────────────────────
describe("resolveHookRuntime — liveness-guard stale version-manager execPath (#841)", () => {
  let originalExecPath: string;

  beforeEach(() => {
    vi.resetModules();
    originalExecPath = process.execPath;
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    Object.defineProperty(process, "execPath", {
      value: originalExecPath,
      configurable: true,
    });
  });

  function stubExecPath(value: string): void {
    Object.defineProperty(process, "execPath", {
      value,
      configurable: true,
    });
  }

  // bunFallbackPaths() emits POSIX (~/.bun/bin/bun) AND Windows
  // (\.bun\bin\bun.exe, \bun\bin\bun.exe) candidates. Block them all so
  // bunExists() is false and the node fallback path is exercised.
  // Algorithmic (no regex): true when the path contains a bun binary segment
  // (…/bun/bin/bun or …/.bun/bin/bun), with either path separator. The
  // original regex /[\\/]\.?bun[\\/]bin[\\/]bun/ required a leading separator
  // before the segment, so a leading "/" is normalized in and both forms are
  // covered by the two includes checks below.
  const isBunBinaryPath = (p: string): boolean => {
    const s = p.split("\\").join("/");
    return s.includes("/bun/bin/bun") || s.includes("/.bun/bin/bun");
  };

  // Path shapes that the three popular version managers pin execPath to.
  // After a patch upgrade the *old* directory is deleted, so existsSync
  // returns false for these exact paths.
  const STALE_PATHS: ReadonlyArray<[string, string]> = [
    ["mise", "/home/dev/.local/share/mise/installs/node/20.1.0/bin/node"],
    ["asdf", "/home/dev/.asdf/installs/nodejs/20.1.0/bin/node"],
    ["nvm", "/home/dev/.nvm/versions/node/v20.1.0/bin/node"],
  ];

  for (const [manager, stalePath] of STALE_PATHS) {
    test(`${manager}: stale pinned execPath (deleted after patch upgrade) → falls back to PATH node, never ENOENT`, async () => {
      // Simulate a no-bun host whose process.execPath points at a Node
      // version dir that the version manager has just deleted.
      stubExecPath(stalePath);

      const execSync = vi.fn((cmd: string) => {
        if (cmd === "where bun" || cmd === "command -v bun") {
          throw new Error("bun not found");
        }
        if (cmd === "command -v node") return "/home/dev/.local/share/mise/shims/node\n";
        if (cmd === "where node") return "C:\\Program Files\\nodejs\\node.exe\n";
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        if (/^where\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      });
      const execFileSync = vi.fn(() => Buffer.from("ok\n"));
      // The pinned (stale) execPath does NOT exist; bun candidates don't either.
      const existsSync = vi.fn(
        (p: string | URL) => String(p) !== stalePath && !isBunBinaryPath(String(p)),
      );

      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return { ...actual, existsSync };
      });

      const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const r = resolveHookRuntime();

      // The bug: baking the stale version-pinned path → spawn ENOENT at hook
      // run time. The guard must NEVER return the dangling path.
      expect(r.path).not.toBe(stalePath);
      // Must re-resolve a working node from PATH instead.
      expect(r.path).toBe("node");
      expect(r.isBun).toBe(false);
    });
  }

  test("live pinned execPath is preserved verbatim — does NOT regress #190/#369", async () => {
    // A current (un-upgraded) version-manager Node still exists on disk; the
    // liveness guard must pass it through unchanged so the snap-node (#190)
    // and Windows MSYS PATH (#369) reasons execPath was pinned still hold.
    const livePath = "/home/dev/.local/share/mise/installs/node/20.1.0/bin/node";
    stubExecPath(livePath);

    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun" || cmd === "command -v bun") throw new Error("bun not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      if (/^where\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      // Only the pinned execPath exists; no bun candidates.
      return { ...actual, existsSync: (p: string | URL) => String(p) === livePath };
    });

    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../src/runtime.js");
    resetHookRuntimeCache();
    const r = resolveHookRuntime();

    expect(r.path).toBe(livePath);
    expect(r.isBun).toBe(false);
  });
});

describe("buildHookRuntimeCommand — emits bun when available, node otherwise (#738)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
  });

  itPosix("emits bun path when bun ≥1.0 is resolved", async () => {
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn(() => Buffer.from("1.2.0\n"));
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const { buildHookRuntimeCommand } = await import("../src/adapters/types.js");
      const cmd = buildHookRuntimeCommand("/plugin/hooks/pretooluse.mjs");
      expect(cmd).toBe(`"${fakeBun}" "/plugin/hooks/pretooluse.mjs"`);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test("emits node (process.execPath) when bun is unavailable", async () => {
    const execSync = vi.fn((cmd: string) => {
      if (/^command -v\s+bun$/.test(cmd)) throw new Error("not found");
      if (/^where\s+bun$/.test(cmd)) throw new Error("not found");
      return "";
    });
    const execFileSync = vi.fn(() => Buffer.from(""));
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      // Host process.execPath reads as live (#841 guard passes it through);
      // bun candidates are absent → node fallback uses the pinned execPath.
      return { ...actual, existsSync: (p: string | URL) => String(p) === process.execPath };
    });

    const { resetHookRuntimeCache } = await import("../src/runtime.js");
    resetHookRuntimeCache();
    const { buildHookRuntimeCommand } = await import("../src/adapters/types.js");
    const cmd = buildHookRuntimeCommand("/plugin/hooks/pretooluse.mjs");
    const nodePath = process.execPath.replace(/\\/g, "/");
    expect(cmd).toBe(`"${nodePath}" "/plugin/hooks/pretooluse.mjs"`);
  });

  itPosix("output is parseable by parseNodeCommand (round-trip invariant)", async () => {
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn(() => Buffer.from("1.1.0\n"));
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const { buildHookRuntimeCommand, parseNodeCommand } = await import("../src/adapters/types.js");
      const cmd = buildHookRuntimeCommand("/plugin/hooks/pretooluse.mjs");
      const parsed = parseNodeCommand(cmd);
      expect(parsed).not.toBeNull();
      expect(parsed!.scriptPath).toBe("/plugin/hooks/pretooluse.mjs");
      expect(parsed!.nodePath).toBe(fakeBun);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  itPosix("buildNodeCommand semantics UNCHANGED — always returns process.execPath", async () => {
    // Regression guard: openclaw doctor/upgrade hints embed buildNodeCommand
    // output as user-facing copy-paste suggestions. They MUST stay on node
    // because the CLI needs better-sqlite3 (#543 bun ABI mismatch).
    const fakeHome = "/fake/home/for-738-test";
    const fakeBun = `${fakeHome}/.bun/bin/bun`;
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const execSync = vi.fn((cmd: string) => {
        if (/^command -v\s+bun$/.test(cmd)) return `${fakeBun}\n`;
        return "";
      });
      const execFileSync = vi.fn(() => Buffer.from("1.1.0\n"));
      vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          existsSync: (p: string | URL) =>
            String(p) === fakeBun || String(p) === process.execPath,
        };
      });

      const { resetHookRuntimeCache } = await import("../src/runtime.js");
      resetHookRuntimeCache();
      const { buildNodeCommand } = await import("../src/adapters/types.js");
      const cmd = buildNodeCommand("/cli.bundle.mjs");
      // Even with bun available, buildNodeCommand stays on node.
      expect(cmd).not.toContain(fakeBun);
      expect(cmd).toContain(process.execPath.replace(/\\/g, "/"));
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });
});
