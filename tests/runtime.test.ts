import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeMap } from "../src/runtime.js";

/**
 * Windows command resolution no longer spawns `where` — it reads a PATH index
 * built from the filesystem (#1159). Suites that used to assert on
 * `execSync("where <cmd>")` now inject the listing directly via
 * `__setWhereOnPathForTests`, which keeps the same "this command is/ isn't on
 * PATH" shape without depending on the host's real PATH.
 *
 * Returns the mocked `whereOnPath` plus the `execSync`/`execFileSync` spies so
 * a suite can still assert on the `--version` probe that is deliberately kept.
 */
function mockWhereOnPath(hits: Record<string, string[]>) {
  const fn = vi.fn((cmd: string) => hits[cmd] ?? []);
  return { whereOnPath: fn };
}

describe("runtime version reporting", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
  });

  test("uses 'go version' for Go while preserving '--version' for other runtimes", async () => {
    const execFileSync = vi.fn((cmd: string, args: string[]) => {
      if (cmd === "go" && args.length === 1 && args[0] === "version") {
        return "go version go1.26.2 darwin/arm64\n";
      }
      if (cmd === "node" && args.length === 1 && args[0] === "--version") {
        return "v25.9.0\n";
      }
      throw new Error(`unexpected version probe: ${cmd} ${args.join(" ")}`);
    });

    // PR #537 Windows path: getVersion() routes through execSync(cmdStr) on
    // win32 (DEP0190 fix — no args array with shell:true). The mock must
    // recognise the same probe shapes via the joined command string so the
    // summary assertions below also exercise the Windows codepath, not just
    // POSIX. Returning undefined here (the prior vi.fn() default) caused the
    // Windows summary to render "(unknown)" and CI run 25741355786 went red.
    const execSync = vi.fn((cmdStr: string) => {
      if (cmdStr === "go version") {
        return "go version go1.26.2 darwin/arm64\n";
      }
      if (cmdStr === "node --version") {
        return "v25.9.0\n";
      }
      throw new Error(`unexpected execSync probe: ${cmdStr}`);
    });

    vi.doMock("node:child_process", () => ({
      execFileSync,
      execSync,
    }));

    const { getRuntimeSummary } = await import("../src/runtime.js");
    const runtimes: RuntimeMap = {
      javascript: "node",
      typescript: null,
      python: null,
      shell: "node",
      ruby: null,
      go: "go",
      rust: null,
      php: null,
      perl: null,
      r: null,
      elixir: null,
      csharp: null,
    };

    const summary = getRuntimeSummary(runtimes);

    // PR #537: POSIX path no longer passes `shell` option to execFileSync.
    // On Windows, getVersion() now uses execSync(quotedCmdString) — so the
    // execFileSync assertion only applies to non-Windows here.
    if (process.platform !== "win32") {
      expect(execFileSync).toHaveBeenCalledWith(
        "go",
        ["version"],
        expect.objectContaining({ encoding: "utf-8" }),
      );
    }
    expect(execFileSync).not.toHaveBeenCalledWith(
      "go",
      ["--version"],
      expect.anything(),
    );
    // PR #537: on Windows getVersion() routes through `execSync(quotedCmdString)`
    // rather than execFileSync, so the mocked execFileSync is never called for
    // `node --version` on win32. L49 above already gates the `go version`
    // assertion the same way — this matching gate was missed in PR #537's
    // sweep and was caught by CI run 25740169321.
    if (process.platform !== "win32") {
      expect(execFileSync).toHaveBeenCalledWith(
        "node",
        ["--version"],
        expect.anything(),
      );
    }
    expect(summary).toContain("Go:         go (go version go1.26.2 darwin/arm64)");
    expect(summary).not.toContain("Go:         go (unknown)");
  });
});

describe("SHELL env var override", () => {
  let tmpDir: string;
  let allowlistedShell: string;
  let nonAllowlistedShell: string;
  const originalShell = process.env.SHELL;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ctx-shell-"));
    // Allowlisted basename — matches isAllowlistedShell regex
    allowlistedShell = join(tmpDir, "bash");
    writeFileSync(allowlistedShell, "#!/bin/sh\necho fake\n", { mode: 0o755 });
    // Non-allowlisted basename — exists but rejected by allowlist
    nonAllowlistedShell = join(tmpDir, "python");
    writeFileSync(nonAllowlistedShell, "#!/bin/sh\necho python\n", { mode: 0o755 });
  });

  afterEach(() => {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    vi.resetModules();
  });

  test("SHELL env var overrides shell when path exists AND basename is allowlisted", async () => {
    process.env.SHELL = allowlistedShell;
    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();
    expect(r.shell).toBe(allowlistedShell);
  });

  test("SHELL env var REJECTED when basename not in allowlist (security)", async () => {
    // PR #401 ops review: SHELL=/usr/bin/python (or any non-shell binary) must
    // NOT be honored. Otherwise an attacker who controls a profile script can
    // redirect the executor to an arbitrary binary.
    process.env.SHELL = nonAllowlistedShell;
    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();
    expect(r.shell).not.toBe(nonAllowlistedShell);
    expect(r.shell.length).toBeGreaterThan(0); // falls back to platform detection
  });

  test("isAllowlistedShell accepts bash/sh/zsh/dash/pwsh/powershell/cmd", async () => {
    const { isAllowlistedShell } = await import("../src/runtime.js");
    expect(isAllowlistedShell("/bin/bash")).toBe(true);
    expect(isAllowlistedShell("/bin/sh")).toBe(true);
    expect(isAllowlistedShell("/usr/local/bin/zsh")).toBe(true);
    expect(isAllowlistedShell("/bin/dash")).toBe(true);
    expect(isAllowlistedShell("/usr/bin/pwsh")).toBe(true);
    expect(isAllowlistedShell("C:\\Windows\\System32\\cmd.exe")).toBe(true);
    expect(isAllowlistedShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe(true);
  });

  test("isAllowlistedShell rejects non-shell binaries", async () => {
    const { isAllowlistedShell } = await import("../src/runtime.js");
    expect(isAllowlistedShell("/usr/bin/python")).toBe(false);
    expect(isAllowlistedShell("/usr/bin/node")).toBe(false);
    expect(isAllowlistedShell("/usr/bin/curl")).toBe(false);
    expect(isAllowlistedShell("/tmp/evil-script")).toBe(false);
    expect(isAllowlistedShell("/bin/bash-with-suffix")).toBe(false);
  });

  test("SHELL env var ignored when path does not exist", async () => {
    process.env.SHELL = join(tmpDir, "does-not-exist-shell");
    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();
    expect(r.shell).not.toBe(process.env.SHELL);
    expect(r.shell.length).toBeGreaterThan(0);
  });

  test("no SHELL env var falls through to platform-specific detection", async () => {
    delete process.env.SHELL;
    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();
    // Should resolve to a non-empty shell from platform detection
    expect(r.shell.length).toBeGreaterThan(0);
    // On Unix, expect bash or sh; on Windows, expect bash.exe / sh / powershell / cmd
    if (process.platform === "win32") {
      const lower = r.shell.toLowerCase();
      expect(
        lower.includes("bash") ||
          lower.includes("sh") ||
          lower.includes("powershell") ||
          lower.includes("cmd"),
      ).toBe(true);
    } else {
      expect(["bash", "sh"]).toContain(r.shell);
    }
  });

  test("Windows prefers pwsh over powershell when bash unavailable", async () => {
    const originalPlatform = process.platform;
    const originalShell = process.env.SHELL;
    delete process.env.SHELL;

    const execSync = vi.fn((cmd: string) => {
      if (cmd === '"pwsh" --version') return "v7.4.0\n";
      if (cmd === '"powershell" --version') return "v5.1.0\n";
      if (cmd === '"node" --version') return "v25.0.0\n";
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn((cmd: string) => {
      if (cmd === "node") return Buffer.from("v25.0.0\n");
      throw new Error(`unmocked execFileSync: ${cmd}`);
    });
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync: vi.fn(() => false) };
    });

    try {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      vi.resetModules();
      const mod = await import("../src/runtime.js");
      // #1159: PATH resolution is now an in-process index, not `where`.
      mod.__setWhereOnPathForTests(
        mockWhereOnPath({ pwsh: ["C:\\Program Files\\PowerShell\\7\\pwsh.exe"] }).whereOnPath,
      );
      const r = mod.detectRuntimes();
      expect(r.shell).toBe("pwsh");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
      vi.doUnmock("node:child_process");
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  test("Windows ignores SHELL override pointing at WSL bash shim", async () => {
    const originalPlatform = process.platform;
    const wslBash = "C:\\Windows\\System32\\bash.exe";
    const gitBash = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
    process.env.SHELL = wslBash;

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn((p: string | URL) => [wslBash, gitBash].includes(String(p))),
      };
    });
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => ""),
      execSync: vi.fn((cmd: string) => {
        if (cmd === "where bash") return `${wslBash}\r\n${gitBash}\r\n`;
        throw new Error(`unmocked execSync: ${cmd}`);
      }),
    }));

    try {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      const { detectRuntimes } = await import("../src/runtime.js");
      const r = detectRuntimes();
      expect(r.shell).toBe(gitBash);
      expect(r.shell).not.toBe(wslBash);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      vi.doUnmock("node:fs");
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });

  test("Windows prefers Git Bash over ambient SHELL=cmd.exe when Git Bash exists", async () => {
    const originalPlatform = process.platform;
    const cmd = "C:\\Windows\\System32\\cmd.exe";
    const gitBash = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
    process.env.SHELL = cmd;

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn((p: string | URL) => [cmd, gitBash].includes(String(p))),
      };
    });
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => ""),
      execSync: vi.fn((command: string) => {
        if (command === "where bash") return `${gitBash}\r\n`;
        throw new Error(`unmocked execSync: ${command}`);
      }),
    }));

    try {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      const { detectRuntimes } = await import("../src/runtime.js");
      const r = detectRuntimes();
      expect(r.shell).toBe(gitBash);
      expect(r.shell).not.toBe(cmd);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      vi.doUnmock("node:fs");
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });

  test("Windows preserves explicit PowerShell SHELL override when Git Bash exists", async () => {
    const originalPlatform = process.platform;
    const powershell = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
    const gitBash = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
    process.env.SHELL = powershell;

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn((p: string | URL) => [powershell, gitBash].includes(String(p))),
      };
    });
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => ""),
      execSync: vi.fn((command: string) => {
        if (command === "where bash") return `${gitBash}\r\n`;
        throw new Error(`unmocked execSync: ${command}`);
      }),
    }));

    try {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      const { detectRuntimes } = await import("../src/runtime.js");
      const r = detectRuntimes();
      expect(r.shell).toBe(powershell);
      expect(r.shell).not.toBe(gitBash);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      vi.doUnmock("node:fs");
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });

  test("Windows keeps cmd.exe override when Git Bash is unavailable", async () => {
    const originalPlatform = process.platform;
    const cmd = "C:\\Windows\\System32\\cmd.exe";
    process.env.SHELL = cmd;

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn((p: string | URL) => String(p) === cmd),
      };
    });
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => ""),
      execSync: vi.fn(() => {
        throw new Error("not found");
      }),
    }));

    try {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      const mod = await import("../src/runtime.js");
      // #1159: nothing is on PATH, so bash/sh/pwsh/powershell all miss and
      // detection falls through to cmd.exe.
      mod.__setWhereOnPathForTests(mockWhereOnPath({}).whereOnPath);
      const r = mod.detectRuntimes();
      expect(r.shell).toBe(cmd);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      vi.doUnmock("node:fs");
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });
});

describe("runnableExists — Windows MS Store stub filter (#454)", () => {
  // Tested through the public `detectRuntimes()` interface (runnableExists is
  // an internal helper). All cases stub process.platform = "win32" and mock
  // `child_process` to simulate `where <cmd>` + `<cmd> --version` probes.

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
    Object.defineProperty(process, "platform", {
      value: process.env.__ORIG_PLATFORM__ ?? "darwin",
      configurable: true,
    });
  });

  beforeEach(() => {
    process.env.__ORIG_PLATFORM__ ??= process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  });

  /** Build the mocks for runnableExists() probes.
   *
   * #1159: `where <cmd>` is no longer spawned — PATH resolution is an
   * in-process filesystem index. The "is this command on PATH" half is
   * injected via `whereOnPathResults`, and only the `"<cmd>" --version`
   * probe (which must really execute the binary to catch MS Store App
   * Execution Alias stubs) still goes through `execSync`.
   *
   * PR #537 (DEP0190 fix): on Windows the version probe is a quoted command
   * string, so `execSync` — not `execFileSync` — is the reached path.
   */
  function mockChildProcess(opts: {
    whereResults: Record<string, string[] | "throw">;
    versionExits: Record<string, "ok" | "throw" | { code: number }>;
  }) {
    // Translate the old `where <cmd>` mock shape into PATH hits. A "throw"
    // entry means "not on PATH", i.e. an empty hit list.
    const hits: Record<string, string[]> = {};
    for (const [tool, result] of Object.entries(opts.whereResults)) {
      hits[tool] = result === "throw" ? [] : result;
    }
    const whereOnPath = vi.fn((cmd: string) => hits[cmd] ?? []);

    const execSync = vi.fn((cmd: string) => {
      // PR #537 Windows probe shape: `"<cmd>" --version` (cmd is quoted).
      const probeMatch = cmd.match(/^"([^"]+)"\s+--version$/);
      if (probeMatch) {
        const tool = probeMatch[1];
        const exit = opts.versionExits[tool];
        if (exit === undefined || exit === "throw") {
          throw new Error(`probe failed: ${tool}`);
        }
        if (typeof exit === "object") {
          const err: NodeJS.ErrnoException & { status?: number } = new Error(
            `exit ${exit.code}`,
          );
          err.status = exit.code;
          throw err;
        }
        return Buffer.from(`${tool} 3.11.0\n`);
      }
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    // execFileSync remains mocked for safety, but on Windows the new code
    // path never reaches it for runnableExists/getVersion probes.
    const execFileSync = vi.fn((cmd: string, args: string[]) => {
      if (args[0] !== "--version") throw new Error(`unexpected args: ${args.join(" ")}`);
      const exit = opts.versionExits[cmd];
      if (exit === undefined || exit === "throw") {
        throw new Error(`probe failed: ${cmd}`);
      }
      if (typeof exit === "object") {
        const err: NodeJS.ErrnoException & { status?: number } = new Error(
          `exit ${exit.code}`,
        );
        err.status = exit.code;
        throw err;
      }
      return Buffer.from(`${cmd} 3.11.0\n`);
    });
    return { execSync, execFileSync, whereOnPath };
  }

  /** Install the mocks and import a fresh runtime module with PATH injected. */
  async function loadRuntime(
    mocks: ReturnType<typeof mockChildProcess>,
  ) {
    vi.doMock("node:child_process", () => ({
      execSync: mocks.execSync,
      execFileSync: mocks.execFileSync,
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync: vi.fn(() => false) };
    });
    const mod = await import("../src/runtime.js");
    mod.__setWhereOnPathForTests(mocks.whereOnPath);
    return mod;
  }

  test("filters Microsoft\\WindowsApps stub when a real python3 also exists", async () => {
    const mocks = mockChildProcess({
      whereResults: {
        python3: [
          "C:\\Users\\X\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe",
          "C:\\Python311\\python3.exe",
        ],
        bun: "throw",
        bash: "throw",
        sh: "throw",
        powershell: "throw",
        tsx: "throw",
        "ts-node": "throw",
        ruby: "throw",
        go: "throw",
        rustc: "throw",
        php: "throw",
        perl: "throw",
        Rscript: "throw",
        r: "throw",
        elixir: "throw",
        "dotnet-script": "throw",
      },
      versionExits: { python3: "ok" },
    });
    const { execSync } = mocks;
    const { detectRuntimes } = await loadRuntime(mocks);
    const r = detectRuntimes();

    // python3 was found in PATH AND --version succeeded → runtime is "python3"
    // (the runnableExists path returned true after filtering the WindowsApps stub).
    expect(r.python).toBe("python3");
    // PR #537: on Windows the --version probe now goes through execSync as
    // the string `"python3" --version` (no args array → no DEP0190).
    expect(execSync).toHaveBeenCalledWith(
      '"python3" --version',
      expect.objectContaining({ stdio: "pipe" }),
    );
    // Should NOT cascade to "python" or "py".
    expect(execSync).not.toHaveBeenCalledWith('"python" --version', expect.anything());
    expect(execSync).not.toHaveBeenCalledWith('"py" --version', expect.anything());
  });

  test("rejects when every `where` hit is a WindowsApps stub", async () => {
    const mocks = mockChildProcess({
      whereResults: {
        python3: ["C:\\Users\\X\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe"],
        python: ["C:\\Users\\X\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe"],
        py: "throw",
        bun: "throw",
        bash: "throw",
        sh: "throw",
        powershell: "throw",
        tsx: "throw",
        "ts-node": "throw",
        ruby: "throw",
        go: "throw",
        rustc: "throw",
        php: "throw",
        perl: "throw",
        Rscript: "throw",
        r: "throw",
        elixir: "throw",
        "dotnet-script": "throw",
      },
      // Probes must NOT be reached because all hits are stubs.
      versionExits: {},
    });
    const { execSync } = mocks;
    const { detectRuntimes } = await loadRuntime(mocks);
    const r = detectRuntimes();

    expect(r.python).toBeNull();
    // PR #537: on Windows, --version probes are issued via execSync as
    // the string `"<cmd>" --version`. No probe should have been executed
    // for python3/python (stubs filtered out before the probe). py was not
    // on PATH, so it's also rejected without a probe.
    expect(execSync).not.toHaveBeenCalledWith('"python3" --version', expect.anything());
    expect(execSync).not.toHaveBeenCalledWith('"python" --version', expect.anything());
  });

  test("rejects runtime when --version exits 9009 (MS Store stub fallthrough)", async () => {
    // Defensive: even if a stub somehow slips past the path filter (e.g. user
    // installed a custom python3.exe under WindowsApps), exit code 9009 from
    // `<cmd> --version` must reject the runtime.
    const mocks = mockChildProcess({
      whereResults: {
        python3: ["C:\\Custom\\python3.exe"], // not under WindowsApps
        python: "throw",
        py: "throw",
        bun: "throw",
        bash: "throw",
        sh: "throw",
        powershell: "throw",
        tsx: "throw",
        "ts-node": "throw",
        ruby: "throw",
        go: "throw",
        rustc: "throw",
        php: "throw",
        perl: "throw",
        Rscript: "throw",
        r: "throw",
        elixir: "throw",
        "dotnet-script": "throw",
      },
      versionExits: { python3: { code: 9009 } },
    });
    const { execSync } = mocks;
    const { detectRuntimes } = await loadRuntime(mocks);
    const r = detectRuntimes();

    expect(r.python).toBeNull();
    // PR #537 Windows probe shape.
    expect(execSync).toHaveBeenCalledWith('"python3" --version', expect.anything());
  });

  test("falls back to `py` when python3 and python both fail", async () => {
    const mocks = mockChildProcess({
      whereResults: {
        python3: "throw",
        python: "throw",
        py: ["C:\\Windows\\py.exe"],
        bun: "throw",
        bash: "throw",
        sh: "throw",
        powershell: "throw",
        tsx: "throw",
        "ts-node": "throw",
        ruby: "throw",
        go: "throw",
        rustc: "throw",
        php: "throw",
        perl: "throw",
        Rscript: "throw",
        r: "throw",
        elixir: "throw",
        "dotnet-script": "throw",
      },
      versionExits: { py: "ok" },
    });
    const { execSync } = mocks;
    const { detectRuntimes } = await loadRuntime(mocks);
    const r = detectRuntimes();

    expect(r.python).toBe("py");
    // PR #537 Windows probe shape.
    expect(execSync).toHaveBeenCalledWith('"py" --version', expect.anything());
  });

  test("non-Windows uses 1500ms probe timeout (faster cold detect)", async () => {
    // Restore non-Windows platform for this case.
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    const execSync = vi.fn((cmd: string) => {
      if (/^command -v\s/.test(cmd)) return ""; // commandExists → true
      throw new Error(`unmocked: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));

    const { detectRuntimes } = await import("../src/runtime.js");
    detectRuntimes();

    // Verify --version probes used the tightened 1500ms timeout on non-Windows.
    const probeCalls = execFileSync.mock.calls.filter(
      (c) => Array.isArray(c[1]) && c[1][0] === "--version",
    );
    expect(probeCalls.length).toBeGreaterThan(0);
    for (const call of probeCalls) {
      const opts = call[2] as { timeout?: number };
      expect(opts.timeout).toBe(1500);
    }
  });
});

// ─────────────────────────────────────────────────────────
// Windows: bunCommand() must return an absolute .exe path when bun is
// installed via `npm i -g bun` (#506). The npm shim creates a `bun.cmd`
// dispatcher on PATH; CreateProcess (used by spawn() with shell:false)
// cannot execute .cmd files directly and ENOENT-errors out.
// ─────────────────────────────────────────────────────────
describe("bunCommand — npm-installed Bun on Windows (#506)", () => {
  let savedAppData: string | undefined;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedLocalAppData: string | undefined;

  beforeEach(() => {
    process.env.__ORIG_PLATFORM__ ??= process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    savedAppData = process.env.APPDATA;
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedLocalAppData = process.env.LOCALAPPDATA;
    process.env.APPDATA = "C:\\Users\\Test\\AppData\\Roaming";
    process.env.USERPROFILE = "C:\\Users\\Test";
    delete process.env.HOME;
    delete process.env.LOCALAPPDATA;
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    Object.defineProperty(process, "platform", {
      value: process.env.__ORIG_PLATFORM__ ?? "darwin",
      configurable: true,
    });
    if (savedAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = savedAppData;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = savedLocalAppData;
  });

  test("returns absolute %APPDATA%\\npm\\...\\bun.exe path, not bare 'bun', when only the npm install is present", async () => {
    const npmBunExe =
      "C:\\Users\\Test\\AppData\\Roaming\\npm\\node_modules\\bun\\bin\\bun.exe";

    // PATH resolves `bun` to a `.cmd` shim — the broken case from #506.
    const whereOnPath = vi.fn((cmd: string) =>
      cmd === "bun" ? ["C:\\Users\\Test\\AppData\\Roaming\\npm\\bun.cmd"] : [],
    );
    const execSync = vi.fn(() => {
      throw new Error("unmocked execSync");
    });
    const execFileSync = vi.fn(() => Buffer.from("1.1.0\n"));

    // Only the npm-prefix .exe exists; the native installer paths do not.
    const existsSync = vi.fn((p: string | URL) => {
      const s = String(p);
      return s === npmBunExe;
    });

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const mod = await import("../src/runtime.js");
    mod.__setWhereOnPathForTests(whereOnPath);
    const r = mod.detectRuntimes();

    // detectRuntimes picks the JavaScript runtime: must be the absolute
    // .exe path, NOT the bare string "bun" (the bug regressed under #506).
    expect(r.javascript).toBe(npmBunExe);
    expect(r.javascript).not.toBe("bun");
  });

  test("still resolves the native ~/.bun/bin/bun.exe when both native and npm are present", async () => {
    const nativeBunExe = "C:\\Users\\Test\\.bun\\bin\\bun.exe";
    const whereOnPath = vi.fn((cmd: string) => (cmd === "bun" ? [nativeBunExe] : []));
    const execSync = vi.fn(() => {
      throw new Error("unmocked execSync");
    });
    const execFileSync = vi.fn(() => Buffer.from("1.1.0\n"));

    // Native path is checked FIRST in bunFallbackPaths order.
    const existsSync = vi.fn((p: string | URL) => String(p) === nativeBunExe);

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const mod = await import("../src/runtime.js");
    mod.__setWhereOnPathForTests(whereOnPath);
    const r = mod.detectRuntimes();

    expect(r.javascript).toBe(nativeBunExe);
  });
});

// ─────────────────────────────────────────────────────────
// Windows: executor.ts needsShell list must include "bun" so the bare
// "bun" fallback (when no .exe is locatable) still spawns through cmd.exe
// — otherwise CreateProcess can't resolve `bun.cmd` shims (#506).
// ─────────────────────────────────────────────────────────
describe("executor needsShell — Windows bun.cmd fallback (#506)", () => {
  test("source-level: needsShell array contains 'bun' alongside tsx/ts-node/elixir", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../src/executor.ts"),
      "utf-8",
    );
    const m = src.match(/needsShell\s*=\s*isWin\s*&&\s*\[([^\]]+)\]\.includes/);
    expect(m, "needsShell array literal not found in executor.ts").not.toBeNull();
    const items = (m![1] || "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    expect(items).toEqual(expect.arrayContaining(["tsx", "ts-node", "elixir", "bun"]));
  });
});

describe("buildCommand shell variants", () => {
  function makeRuntimes(shell: string): RuntimeMap {
    return {
      javascript: "node",
      typescript: null,
      python: null,
      shell,
      ruby: null,
      go: null,
      rust: null,
      php: null,
      perl: null,
      r: null,
      elixir: null,
      csharp: null,
    };
  }

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.doUnmock("node:process");
  });

  async function importWithPlatform(platform: NodeJS.Platform) {
    vi.resetModules();
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    return await import("../src/runtime.js");
  }

  test("Windows bash gets bash -c source pattern", async () => {
    const original = process.platform;
    try {
      const { buildCommand } = await importWithPlatform("win32");
      const cmd = buildCommand(
        makeRuntimes("C:\\Program Files\\Git\\usr\\bin\\bash.exe"),
        "shell",
        "D:\\tmp\\script",
      );
      expect(cmd[0]).toBe("C:\\Program Files\\Git\\usr\\bin\\bash.exe");
      expect(cmd[1]).toBe("-c");
      expect(cmd[2]).toBe("source 'D:\\tmp\\script'");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.resetModules();
    }
  });

  test("Windows powershell gets process-scoped execution policy bypass", async () => {
    const original = process.platform;
    try {
      const { buildCommand } = await importWithPlatform("win32");
      const cmd = buildCommand(
        makeRuntimes("powershell"),
        "shell",
        "C:\\tmp\\script.ps1",
      );
      expect(cmd[0]).toBe("powershell");
      expect(cmd).toEqual([
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\tmp\\script.ps1",
      ]);
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.resetModules();
    }
  });

  test("Windows pwsh gets process-scoped execution policy bypass", async () => {
    const original = process.platform;
    try {
      const { buildCommand } = await importWithPlatform("win32");
      const cmd = buildCommand(
        makeRuntimes("C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
        "shell",
        "C:\\tmp\\script.ps1",
      );
      expect(cmd).toEqual([
        "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\tmp\\script.ps1",
      ]);
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.resetModules();
    }
  });

  test("Windows cmd gets cmd /c pattern", async () => {
    const original = process.platform;
    try {
      const { buildCommand } = await importWithPlatform("win32");
      const cmd = buildCommand(
        makeRuntimes("cmd.exe"),
        "shell",
        "C:\\tmp\\script.cmd",
      );
      expect(cmd).toEqual(["cmd.exe", "/d", "/s", "/c", "C:\\tmp\\script.cmd"]);
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.resetModules();
    }
  });

  test("Unix bash gets direct file path (unchanged)", async () => {
    const original = process.platform;
    try {
      const { buildCommand } = await importWithPlatform("linux");
      const cmd = buildCommand(makeRuntimes("bash"), "shell", "/tmp/script");
      expect(cmd[0]).toBe("bash");
      expect(cmd[1]).toBe("/tmp/script");
      expect(cmd.length).toBe(2);
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.resetModules();
    }
  });

  test("buildCommand on Windows escapes single-quotes in path safely", async () => {
    const original = process.platform;
    try {
      const { buildCommand } = await importWithPlatform("win32");
      const cmd = buildCommand(
        makeRuntimes("C:\\bash.exe"),
        "shell",
        "D:\\path\\with'quote\\script",
      );
      // Single quote escaped via '\'' technique → source 'D:\path\with'\''quote\script'
      expect(cmd[2]).toBe("source 'D:\\path\\with'\\''quote\\script'");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.resetModules();
    }
  });
});

// ─────────────────────────────────────────────────────────
// #731: ctx_execute(language: "javascript") fails when the host process
// is a bun-compiled self-contained binary (OpenCode, Kilo, etc).
//
// detectRuntimes() returned `process.execPath` for `javascript`, which
// in those hosts resolves to `opencode.exe` / `opencode` — NOT node.
// PolyglotExecutor then spawned `opencode.exe <script.js>` which the
// yargs CLI rejects with "Failed to change directory" (it treats the
// path as a cwd, not a script).
//
// The fix gates execPath on the existing JS_RUNTIMES allowlist from
// src/adapters/types.ts (single source of truth — same set used by
// PR #708's buildNodeCommand). When the execPath basename is not a
// known JS runtime, fall back to PATH-resolved `node`. If node is
// also missing, return null and let ctx_doctor surface the error.
//
// Preserves PR #190 (snap-node fix, f69b0d2): snap wrapper's basename
// is `node`, which IS in JS_RUNTIMES → execPath is still returned.
// ─────────────────────────────────────────────────────────
describe("detectRuntimes — JS runtime fallback for in-process plugin hosts (#731)", () => {
  let originalExecPath: string;

  beforeEach(() => {
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

  /**
   * Install the child_process mock and, for the Windows path, the injected
   * PATH index.
   *
   * `commandExists` is platform-split: on win32 it reads the in-process PATH
   * index (#1159 — no more `where` spawn), on POSIX it still shells out to
   * `command -v`. So Windows determinism comes from `whereHits`, POSIX
   * determinism from the `execSync` mock. Both are needed because the suite
   * runs on all three CI platforms.
   */
  async function loadRuntime(opts: {
    whereHits: Record<string, string[]>;
    execSync: (cmd: string) => string;
    existsSync: (p: string | URL) => boolean;
  }) {
    const execSync = vi.fn(opts.execSync);
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync: vi.fn(opts.existsSync) };
    });

    const mod = await import("../src/runtime.js");
    const whereOnPath = vi.fn((cmd: string) => opts.whereHits[cmd] ?? []);
    mod.__setWhereOnPathForTests(whereOnPath);
    return mod;
  }

  test("Windows OpenCode binary host (opencode.exe) falls back to 'node' on PATH", async () => {
    stubExecPath("C:\\Users\\Test\\opencode.exe");

    // No bun anywhere; node is on PATH. The Windows index supplies node and
    // nothing else; the POSIX branch uses the `command -v` mock.
    const mod = await loadRuntime({
      whereHits: { node: ["C:\\Program Files\\nodejs\\node.exe"] },
      execSync: (cmd: string) => {
        if (cmd === "command -v bun") throw new Error("bun not found");
        if (cmd === "command -v node") return "/usr/local/bin/node\n";
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: () => false, // no bun fallback paths exist
    });
    const r = mod.detectRuntimes();

    // Must NOT return the opencode.exe path — that's the bug.
    expect(r.javascript).not.toBe("C:\\Users\\Test\\opencode.exe");
    expect(r.javascript).toBe("node");
  });

  test("POSIX OpenCode binary host (opencode) falls back to 'node' on PATH — cross-OS (not Windows-only)", async () => {
    stubExecPath("/usr/local/bin/opencode");

    const mod = await loadRuntime({
      whereHits: { node: ["C:\\Program Files\\nodejs\\node.exe"] },
      execSync: (cmd: string) => {
        if (cmd === "command -v bun") throw new Error("bun not found");
        if (cmd === "command -v node") return "/usr/local/bin/node\n";
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: () => false,
    });
    const r = mod.detectRuntimes();

    expect(r.javascript).not.toBe("/usr/local/bin/opencode");
    expect(r.javascript).toBe("node");
  });

  test("returns null when host is non-JS binary AND node is missing — surfaces actionable error", async () => {
    stubExecPath("/usr/local/bin/opencode");

    // Nothing exists — no bun, no node, no other runtime.
    const mod = await loadRuntime({
      whereHits: {},
      execSync: (cmd: string) => {
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: () => false,
    });
    const r = mod.detectRuntimes();

    expect(r.javascript).toBeNull();
  });

  test("regression: snap-node host (#190 / f69b0d2) preserves execPath — basename === 'node'", async () => {
    // The snap wrapper's binary is literally named `node`; PR #190 used
    // process.execPath to avoid re-invoking the snap wrapper via PATH.
    // The allowlist gate must NOT regress this — basename "node" is in
    // JS_RUNTIMES so execPath is returned as-is.
    //
    // #800 liveness guard: snap-node paths are stable and always exist on
    // disk, so the existsSync guard passes and execPath is returned.
    stubExecPath("/snap/node/current/bin/node");

    const mod = await loadRuntime({
      whereHits: {},
      execSync: (cmd: string) => {
        if (cmd === "command -v bun") throw new Error("bun not found");
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: (p: string | URL) => String(p) === "/snap/node/current/bin/node",
    });
    const r = mod.detectRuntimes();

    // Snap path returned verbatim — NOT collapsed to bare "node" (would
    // re-invoke the snap wrapper, the original #190 bug).
    expect(r.javascript).toBe("/snap/node/current/bin/node");
  });

  test("regression: bun host preserves execPath — basename matches BUN allowlist", async () => {
    // When the host IS bun (e.g. opencode binary built with bun's
    // bundler exposes execPath as the actual bun binary), the allowlist
    // permits it and bunCommand()'s own detection sets javascript to bun
    // anyway. This case asserts the basename check doesn't accidentally
    // demote a bun execPath.
    stubExecPath("/home/user/.bun/bin/bun");

    // bun is on PATH, so bunExists()/bunCommand() take the bun branch.
    const mod = await loadRuntime({
      whereHits: { bun: ["/home/user/.bun/bin/bun"] },
      execSync: (cmd: string) => {
        if (cmd === "command -v bun") return "/home/user/.bun/bin/bun\n";
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: (p: string | URL) => String(p) === "/home/user/.bun/bin/bun",
    });
    const r = mod.detectRuntimes();

    // bun branch fires first; javascript should be a bun runtime (not
    // collapsed to bare "node" even though basename(execPath) === "bun").
    expect(r.javascript).toMatch(/bun$/);
  });

  test("Homebrew Cellar ENOENT (#800): execPath basename is 'node' but file deleted — falls back to PATH node", async () => {
    // Simulate Homebrew Node: process.execPath is a versioned Cellar path
    // (/opt/homebrew/Cellar/node/26.0.0/bin/node).  After `brew upgrade` +
    // `brew cleanup`, the old Cellar is deleted, so existsSync returns false.
    // The liveness guard must fall through to PATH-resolved "node".
    stubExecPath("/opt/homebrew/Cellar/node/26.0.0/bin/node");

    // Cellar path is deleted; bun fallback paths don't exist (simulate no-bun
    // host), but node IS on PATH.
    const CELLAR_PATH = "/opt/homebrew/Cellar/node/26.0.0/bin/node";
    const BUN_PATH_RE = /[\/\\]\.?bun[\/\\]bin[\/\\]bun/;
    const mod = await loadRuntime({
      whereHits: { node: ["C:\\Program Files\\nodejs\\node.exe"] },
      execSync: (cmd: string) => {
        if (cmd === "command -v bun") throw new Error("bun not found");
        if (cmd === "command -v node") return "/opt/homebrew/bin/node\n";
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: (p: string | URL) =>
        String(p) !== CELLAR_PATH && !BUN_PATH_RE.test(String(p)),
    });
    const r = mod.detectRuntimes();

    // Must NOT return the stale Cellar path — that's the bug.
    expect(r.javascript).not.toBe("/opt/homebrew/Cellar/node/26.0.0/bin/node");
    // Must fall back to PATH-resolved "node".
    expect(r.javascript).toBe("node");
  });

  test("Homebrew Cellar ENOENT (#800): stale execPath AND node missing on PATH → returns null", async () => {
    // Worst-case: Homebrew Cellar deleted AND no node on PATH.
    // Runtime resolution must return null so ctx_doctor surfaces an
    // actionable error instead of a cryptic spawn ENOENT.
    stubExecPath("/opt/homebrew/Cellar/node/26.0.0/bin/node");

    // Worst case: no node on PATH either.
    const mod = await loadRuntime({
      whereHits: {},
      execSync: (cmd: string) => {
        if (cmd === "command -v bun") throw new Error("bun not found");
        if (/^command -v\s/.test(cmd)) throw new Error("not found");
        throw new Error(`unmocked execSync: ${cmd}`);
      },
      existsSync: () => false, // Nothing exists — no Cellar, no bun
    });
    const r = mod.detectRuntimes();

    expect(r.javascript).toBeNull();
  });

  test("doctor surfaces clear error when javascript runtime is null", async () => {
    // When no JS runtime is available, doctor must NOT crash with a
    // cryptic spawn ENOENT — it should produce an actionable message
    // pointing at the missing runtime. This is the user-facing
    // expectation from #731 when the binary host AND PATH both lack node.
    const { getRuntimeSummary } = await import("../src/runtime.js");
    const runtimes: RuntimeMap = {
      javascript: null as unknown as RuntimeMap["javascript"],
      typescript: null,
      python: null,
      shell: "bash",
      ruby: null,
      go: null,
      rust: null,
      php: null,
      perl: null,
      r: null,
      elixir: null,
      csharp: null,
    };

    const summary = getRuntimeSummary(runtimes);

    // Must mention JavaScript and an actionable hint, not a literal `null`.
    expect(summary).toMatch(/JavaScript/);
    expect(summary).toMatch(/not available|install/i);
    expect(summary).not.toMatch(/JavaScript: null/);
  });
});
// ─────────────────────────────────────────────────────────
// #1159: `where <cmd>` used to be the only Windows PATH resolution path, at
// two process creations per probe and 15-19 probes per `detectRuntimes()`.
// `whereOnPath()` replaces it with an in-process index.
//
// These tests pin the `where` semantics that must be preserved. Each
// expectation was verified against the real `where.exe` on Windows; the
// assertions run on every CI platform by injecting the directory listing, so
// they do not depend on the host's actual PATH.
// ─────────────────────────────────────────────────────────
describe("whereOnPath — in-process Windows PATH resolution (#1159)", () => {
  const WINDOWS_PATHEXT = ".COM;.EXE;.BAT;.CMD";
  /** Sentinel for "leave PATHEXT unset" (distinct from "use the default"). */
  const UNSET = "\u0000unset";

  /** Fake directory listing: dir -> entry names (all treated as files). */
  function makeReaddir(filesByDir: Record<string, string[]>) {
    return (dir: string) =>
      (filesByDir[dir] ?? []).map((name) => ({
        name,
        isDirectory: () => false,
      }));
  }

  /** Build the injection deps for `whereOnPath`. */
  function index(
    filesByDir: Record<string, string[]>,
    {
      path,
      cwd,
      pathext = WINDOWS_PATHEXT,
    }: { path: string; cwd: string; pathext?: string },
  ) {
    const env: NodeJS.ProcessEnv = { PATH: path };
    // Callers that want PATHEXT *unset* pass the sentinel below; `undefined`
    // here means "use the default", which is what most cases want.
    if (pathext !== UNSET) env.PATHEXT = pathext;
    return { env, cwd, readdir: makeReaddir(filesByDir) };
  }

  test("returns every PATHEXT match in a directory, not just the first", async () => {
    // `where docker` really returns both docker and docker.exe; `where code`
    // returns code and code.cmd. Stopping at the first extension drops hits.
    const { whereOnPath } = await import("../src/runtime.js");
    const got = whereOnPath(
      "dup",
      index({ "C:\\A": ["dup.exe", "dup.cmd"] }, { path: "C:\\A", cwd: "C:\\EMPTY" }),
    );
    expect(got).toHaveLength(2);
    expect(got.map((p) => p.toLowerCase()).sort()).toEqual([
      "c:\\a\\dup.cmd",
      "c:\\a\\dup.exe",
    ]);
  });

  test("keeps directory listing order within a directory, not PATHEXT order", async () => {
    // Real `where` emits readdir order. Changing PATHEXT order does NOT
    // reorder the output — so the implementation must not loop over PATHEXT.
    const { whereOnPath } = await import("../src/runtime.js");
    const listing = ["z.bat", "z.cmd", "z.com", "z.exe"];
    const a = whereOnPath(
      "z",
      index({ "C:\\A": listing }, { path: "C:\\A", cwd: "C:\\E", pathext: ".COM;.EXE;.BAT;.CMD" }),
    );
    const b = whereOnPath(
      "z",
      index({ "C:\\A": listing }, { path: "C:\\A", cwd: "C:\\E", pathext: ".CMD;.BAT;.EXE;.COM" }),
    );
    expect(a.map((p) => p.toLowerCase())).toEqual([
      "c:\\a\\z.bat",
      "c:\\a\\z.cmd",
      "c:\\a\\z.com",
      "c:\\a\\z.exe",
    ]);
    expect(b).toEqual(a);
  });

  test("searches cwd before PATH", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const got = whereOnPath(
      "same",
      index(
        { "C:\\CWD": ["same.exe"], "C:\\P1": ["same.exe"] },
        { path: "C:\\P1", cwd: "C:\\CWD" },
      ),
    );
    expect(got.map((p) => p.toLowerCase())).toEqual(["c:\\cwd\\same.exe", "c:\\p1\\same.exe"]);
  });

  test("an empty PATH segment resolves to cwd, and cwd is not searched twice", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const got = whereOnPath(
      "only",
      index({ "C:\\CWD": ["only.exe"] }, { path: ";;", cwd: "C:\\CWD" }),
    );
    // cwd is prepended explicitly, so the empty segments must not duplicate it.
    expect(got.map((p) => p.toLowerCase())).toEqual(["c:\\cwd\\only.exe"]);
  });

  test("never returns a directory, even one named *.exe", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const deps = {
      env: { PATH: "C:\\A", PATHEXT: WINDOWS_PATHEXT } as NodeJS.ProcessEnv,
      cwd: "C:\\EMPTY",
      readdir: (dir: string) =>
        dir === "C:\\A"
          ? [
              { name: "dirnamed.exe", isDirectory: () => true },
              { name: "real.exe", isDirectory: () => false },
            ]
          : [],
    };
    expect(whereOnPath("dirnamed", deps)).toEqual([]);
    expect(whereOnPath("real", deps)).toHaveLength(1);
  });

  test("keeps symlink entries — the Store App Execution Alias case (#455)", async () => {
    // %LOCALAPPDATA%\Microsoft\WindowsApps stubs are symlinks whose statSync
    // fails EACCES, so Dirent.isFile() is false for them. Filtering on
    // isFile() would silently drop them; !isDirectory() keeps them.
    const { whereOnPath } = await import("../src/runtime.js");
    const windowsApps = "C:\\Users\\X\\AppData\\Local\\Microsoft\\WindowsApps";
    const deps = {
      env: { PATH: windowsApps, PATHEXT: WINDOWS_PATHEXT } as NodeJS.ProcessEnv,
      cwd: "C:\\EMPTY",
      readdir: (dir: string) =>
        dir === windowsApps
          ? [
              // isFile() === false (symlink/EACCES), isDirectory() === false
              { name: "python3.exe", isDirectory: () => false },
            ]
          : [],
    };
    expect(whereOnPath("python3", deps)).toEqual([
      "C:\\Users\\X\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe",
    ]);
  });

  test("case-insensitive match, on-disk casing preserved in the result", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const deps = index({ "C:\\A": ["MixedCase.EXE"] }, { path: "C:\\A", cwd: "C:\\E" });
    expect(whereOnPath("mixedcase", deps)).toEqual(["C:\\A\\MixedCase.EXE"]);
    expect(whereOnPath("MIXEDCASE", deps)).toEqual(["C:\\A\\MixedCase.EXE"]);
  });

  test("an explicit extension in the query suppresses PATHEXT expansion", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const deps = index({ "C:\\A": ["tool.exe", "tool.cmd"] }, { path: "C:\\A", cwd: "C:\\E" });
    expect(whereOnPath("tool.exe", deps).map((p) => p.toLowerCase())).toEqual(["c:\\a\\tool.exe"]);
  });

  test("unset or empty PATHEXT matches extensionless files only — no default list", async () => {
    // Real `where` applies no fallback: with PATHEXT unset, only a bare
    // extensionless file matches. A `|| ".COM;.EXE;.BAT;.CMD"` default would
    // change the result set.
    const { whereOnPath } = await import("../src/runtime.js");
    for (const pathext of [UNSET, ""]) {
      const deps = index(
        { "C:\\A": ["bare", "bare.exe"] },
        { path: "C:\\A", cwd: "C:\\E", pathext },
      );
      expect(whereOnPath("bare", deps).map((p) => p.toLowerCase())).toEqual(["c:\\a\\bare"]);
    }
  });

  test("does not recurse into subdirectories", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const deps = {
      env: { PATH: "C:\\A", PATHEXT: WINDOWS_PATHEXT } as NodeJS.ProcessEnv,
      cwd: "C:\\EMPTY",
      readdir: (dir: string) =>
        dir === "C:\\A"
          ? [
              { name: "sub", isDirectory: () => true },
              { name: "top.exe", isDirectory: () => false },
            ]
          : [],
    };
    expect(whereOnPath("nested", deps)).toEqual([]);
    expect(whereOnPath("top", deps)).toHaveLength(1);
  });

  test("an unreadable PATH entry is skipped, not fatal", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const deps = {
      env: { PATH: "C:\\MISSING;C:\\A", PATHEXT: WINDOWS_PATHEXT } as NodeJS.ProcessEnv,
      cwd: "C:\\EMPTY",
      readdir: (dir: string) => {
        if (dir === "C:\\MISSING") throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return dir === "C:\\A" ? [{ name: "found.exe", isDirectory: () => false }] : [];
      },
    };
    expect(whereOnPath("found", deps)).toHaveLength(1);
  });

  test("returns [] for a command that is nowhere on PATH", async () => {
    const { whereOnPath } = await import("../src/runtime.js");
    const deps = index({ "C:\\A": ["present.exe"] }, { path: "C:\\A", cwd: "C:\\E" });
    expect(whereOnPath("absent", deps)).toEqual([]);
  });

  test("does not spawn a child process to resolve a command (#1159 regression)", async () => {
    // The whole point of the change: PATH resolution must be filesystem-only.
    const { whereOnPath } = await import("../src/runtime.js");
    const execSync = vi.fn(() => {
      throw new Error("whereOnPath must not spawn a child process");
    });
    vi.doMock("node:child_process", () => ({ execSync, execFileSync: vi.fn() }));
    try {
      const deps = index({ "C:\\A": ["x.exe"] }, { path: "C:\\A", cwd: "C:\\E" });
      expect(whereOnPath("x", deps)).toHaveLength(1);
      expect(execSync).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("node:child_process");
    }
  });
});
