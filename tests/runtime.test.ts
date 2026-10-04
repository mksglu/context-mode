import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeMap } from "../src/runtime.js";

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
      if (cmd === "where bash") throw new Error("no bash");
      if (cmd === "where pwsh") return "C:\\Program Files\\PowerShell\\7\\pwsh.exe\r\n";
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

    try {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      vi.resetModules();
      const { detectRuntimes } = await import("../src/runtime.js");
      const r = detectRuntimes();
      expect(r.shell).toBe("pwsh");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
      vi.doUnmock("node:child_process");
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
      const { detectRuntimes } = await import("../src/runtime.js");
      const r = detectRuntimes();
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

  /** Build a child_process mock for runnableExists() probes.
   *
   * PR #537 (DEP0190 fix): on Windows, `runnableExists` now calls
   *   execSync(`"${cmd}" --version`, …)
   * for the version probe (string form, no args array), and `getVersion`
   * does the same. So on win32, BOTH `where <cmd>` and the `"<cmd>" --version`
   * probe are routed through `execSync`. `execFileSync` is no longer reached
   * on the Windows code path.
   */
  function mockChildProcess(opts: {
    whereResults: Record<string, string[] | "throw">;
    versionExits: Record<string, "ok" | "throw" | { code: number }>;
  }) {
    const execSync = vi.fn((cmd: string) => {
      // `where <tool>` and `command -v <tool>` (defensive) lookups.
      const whereMatch = cmd.match(/^(?:where|command -v)\s+(.+)$/);
      if (whereMatch) {
        const tool = whereMatch[1].trim();
        const result = opts.whereResults[tool];
        if (result === undefined) throw new Error(`no mock for ${tool}`);
        if (result === "throw") throw new Error(`not found: ${tool}`);
        return result.join("\r\n") + "\r\n";
      }
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
    return { execSync, execFileSync };
  }

  test("filters Microsoft\\WindowsApps stub when a real python3 also exists", async () => {
    const { execSync, execFileSync } = mockChildProcess({
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
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));

    const { detectRuntimes } = await import("../src/runtime.js");
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
    const { execSync, execFileSync } = mockChildProcess({
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
      // Probes must NOT be reached because all hits are stubs and `where` short-circuits.
      versionExits: {},
    });
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

    expect(r.python).toBeNull();
    // PR #537: on Windows, --version probes are issued via execSync as
    // the string `"<cmd>" --version`. No probe should have been executed
    // for python3/python (stubs filtered out before the probe). py threw at
    // `where`, so it's also rejected without a probe.
    expect(execSync).not.toHaveBeenCalledWith('"python3" --version', expect.anything());
    expect(execSync).not.toHaveBeenCalledWith('"python" --version', expect.anything());
  });

  test("rejects runtime when --version exits 9009 (MS Store stub fallthrough)", async () => {
    // Defensive: even if a stub somehow slips past the path filter (e.g. user
    // installed a custom python3.exe under WindowsApps), exit code 9009 from
    // `<cmd> --version` must reject the runtime.
    const { execSync, execFileSync } = mockChildProcess({
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
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

    expect(r.python).toBeNull();
    // PR #537 Windows probe shape.
    expect(execSync).toHaveBeenCalledWith('"python3" --version', expect.anything());
  });

  test("falls back to `py` when python3 and python both fail", async () => {
    const { execSync, execFileSync } = mockChildProcess({
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
    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));

    const { detectRuntimes } = await import("../src/runtime.js");
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

    // `where bun` returns a `.cmd` shim — the broken case from #506.
    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun") {
        return "C:\\Users\\Test\\AppData\\Roaming\\npm\\bun.cmd\r\n";
      }
      throw new Error(`unmocked execSync: ${cmd}`);
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

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

    // detectRuntimes picks the JavaScript runtime: must be the absolute
    // .exe path, NOT the bare string "bun" (the bug regressed under #506).
    expect(r.javascript).toBe(npmBunExe);
    expect(r.javascript).not.toBe("bun");
  });

  test("still resolves the native ~/.bun/bin/bun.exe when both native and npm are present", async () => {
    const nativeBunExe = "C:\\Users\\Test\\.bun\\bin\\bun.exe";
    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun") return `${nativeBunExe}\r\n`;
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("1.1.0\n"));

    // Native path is checked FIRST in bunFallbackPaths order.
    const existsSync = vi.fn((p: string | URL) => String(p) === nativeBunExe);

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

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

  test("Windows OpenCode binary host (opencode.exe) falls back to 'node' on PATH", async () => {
    stubExecPath("C:\\Users\\Test\\opencode.exe");

    // No bun anywhere; commandExists("node") returns true. We don't
    // stub process.platform here — commandExists uses whichever probe
    // matches the test host (POSIX: `command -v`, Windows: `where`).
    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun" || cmd === "command -v bun") throw new Error("bun not found");
      if (cmd === "where node") return "C:\\Program Files\\nodejs\\node.exe\r\n";
      if (cmd === "command -v node") return "/usr/local/bin/node\n";
      // Other commandExists() probes (tsx, ts-node, ruby, go, …) → not found.
      if (/^where\s/.test(cmd)) throw new Error("not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));
    const existsSync = vi.fn(() => false); // no bun fallback paths exist

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

    // Must NOT return the opencode.exe path — that's the bug.
    expect(r.javascript).not.toBe("C:\\Users\\Test\\opencode.exe");
    expect(r.javascript).toBe("node");
  });

  test("POSIX OpenCode binary host (opencode) falls back to 'node' on PATH — cross-OS (not Windows-only)", async () => {
    stubExecPath("/usr/local/bin/opencode");

    const execSync = vi.fn((cmd: string) => {
      // commandExists uses `where <name>` on win32, `command -v <name>` elsewhere.
      // Mock BOTH probe shapes so the test exercises the same fallback path on
      // every CI runner (the test name says "cross-OS, not Windows-only").
      if (cmd === "where bun") throw new Error("bun not found");
      if (cmd === "where node") return "C:\\Program Files\\nodejs\\node.exe\n";
      if (cmd === "command -v node") return "/usr/local/bin/node\n";
      if (/^where\s/.test(cmd)) throw new Error("not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));
    const existsSync = vi.fn(() => false);

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

    expect(r.javascript).not.toBe("/usr/local/bin/opencode");
    expect(r.javascript).toBe("node");
  });

  test("returns null when host is non-JS binary AND node is missing — surfaces actionable error", async () => {
    stubExecPath("/usr/local/bin/opencode");

    const execSync = vi.fn((cmd: string) => {
      // Nothing exists — no bun, no node, no other runtime.
      if (/^where\s/.test(cmd)) throw new Error("not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => {
      throw new Error("not found");
    });
    const existsSync = vi.fn(() => false);

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

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

    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun") throw new Error("bun not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      if (/^where\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));
    const existsSync = vi.fn((p: string) => p === "/snap/node/current/bin/node");

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

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

    const execSync = vi.fn((cmd: string) => {
      // bunExists() — make `where bun` / `command -v bun` succeed so
      // bunCommand() returns the bun path itself.
      if (cmd === "where bun") return "/home/user/.bun/bin/bun\n";
      if (cmd === "command -v bun") return "/home/user/.bun/bin/bun\n";
      if (/^where\s/.test(cmd)) throw new Error("not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("1.1.0\n"));
    const existsSync = vi.fn((p: string) => p === "/home/user/.bun/bin/bun");

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

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

    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun") throw new Error("bun not found");
      if (cmd === "command -v node") return "/opt/homebrew/bin/node\n";
      if (cmd === "where node") return "C:\\Program Files\\nodejs\\node.exe\n";
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      if (/^where\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => Buffer.from("ok\n"));
    // Cellar path is deleted; bun fallback paths don't exist (simulate no-bun host).
    // Cross-platform: bunFallbackPaths returns POSIX paths (/.bun/bin/bun) and
    // Windows paths (\\.bun\\bin\\bun.exe, \\bun\\bin\\bun.exe) — all must be
    // blocked so bunExists() returns false and PATH node is resolved.
    const CELLAR_PATH = "/opt/homebrew/Cellar/node/26.0.0/bin/node";
    const BUN_PATH_RE = /[\/\\]\.?bun[\/\\]bin[\/\\]bun/;
    const existsSync = vi.fn((p: string) => p !== CELLAR_PATH && !BUN_PATH_RE.test(p));

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

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

    const execSync = vi.fn((cmd: string) => {
      if (cmd === "where bun") throw new Error("bun not found");
      if (/^command -v\s/.test(cmd)) throw new Error("not found");
      if (/^where\s/.test(cmd)) throw new Error("not found");
      throw new Error(`unmocked execSync: ${cmd}`);
    });
    const execFileSync = vi.fn(() => {
      throw new Error("not found");
    });
    const existsSync = vi.fn(() => false); // Nothing exists — no Cellar, no bun

    vi.doMock("node:child_process", () => ({ execSync, execFileSync }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return { ...actual, existsSync };
    });

    const { detectRuntimes } = await import("../src/runtime.js");
    const r = detectRuntimes();

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
