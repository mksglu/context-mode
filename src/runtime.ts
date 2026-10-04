import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { JS_RUNTIMES } from "./adapters/types.js";

/**
 * Allowlist for SHELL env override. Only POSIX shells + Windows shells permit
 * arbitrary command interpretation; anything else (e.g., /usr/bin/python set
 * as SHELL) would let an attacker redirect the executor to a non-shell binary.
 *
 * basename split handles BOTH `/` and `\` separators so a Windows-style path
 * (`C:\Program Files\PowerShell\7\pwsh.exe`) classifies correctly even when
 * the runtime is on POSIX (where node:path.basename only splits on `/`).
 *
 * Match is case-insensitive; `.exe` extension tolerated for Windows binaries.
 */
const ALLOWED_SHELL_BASENAMES = /^(bash|sh|zsh|dash|pwsh|powershell|cmd)(\.exe)?$/i;
const BUN_BASENAME = /^bun(\.exe)?$/i;

function runtimeBasename(runtimePath: string): string {
  const segments = runtimePath.split(/[\\/]/);
  return segments[segments.length - 1] ?? runtimePath;
}

export function isAllowlistedShell(shellPath: string): boolean {
  // Cross-OS basename: split on either separator, take the last segment.
  return ALLOWED_SHELL_BASENAMES.test(runtimeBasename(shellPath));
}

function isWindowsWslBash(shellPath: string): boolean {
  const lower = shellPath.toLowerCase().replace(/\//g, "\\");
  return /\\windows\\(?:system32|sysnative)\\bash\.exe$/.test(lower) ||
    /\\microsoft\\windowsapps\\bash\.exe$/.test(lower);
}

function isWindowsSystemCmd(shellPath: string): boolean {
  const lower = shellPath.toLowerCase().replace(/\//g, "\\");
  return /\\windows\\(?:system32|sysnative)\\cmd\.exe$/.test(lower);
}

export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "shell"
  | "ruby"
  | "go"
  | "rust"
  | "php"
  | "perl"
  | "r"
  | "elixir"
  | "csharp";

export interface RuntimeInfo {
  command: string;
  available: boolean;
  version: string;
  preferred: boolean;
}

export interface RuntimeMap {
  javascript: string | null;
  typescript: string | null;
  python: string | null;
  shell: string;
  ruby: string | null;
  go: string | null;
  rust: string | null;
  php: string | null;
  perl: string | null;
  r: string | null;
  elixir: string | null;
  csharp: string | null;
}

const isWindows = process.platform === "win32";

function commandExists(cmd: string): boolean {
  try {
    const check = isWindows ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(check, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stricter probe than commandExists() — also verifies the resolved binary
 * actually runs. On Windows, `where python3` matches the Microsoft Store
 * App Execution Alias stub at C:\Users\<u>\AppData\Local\Microsoft\WindowsApps\
 * even when no real Python is installed; the stub exits non-zero (9009) and
 * pops the Store. Filter those entries out and require `<cmd> --version` to
 * exit 0 before declaring the runtime available (#455).
 */
function runnableExists(cmd: string): boolean {
  if (isWindows) {
    // Reject if every `where` hit lives under Microsoft\WindowsApps (Store stubs).
    try {
      const out = execSync(`where ${cmd}`, { encoding: "utf-8", stdio: "pipe" });
      const hits = out.trim().split(/\r?\n/).map(p => p.trim()).filter(Boolean);
      if (hits.length === 0) return false;
      const realHits = hits.filter(p => !/\\Microsoft\\WindowsApps\\/i.test(p));
      if (realHits.length === 0) return false;
    } catch {
      return false;
    }
  } else if (!commandExists(cmd)) {
    return false;
  }
  // Probe with --version. On Windows, allow 5s for cold-start (MS Store stub
  // fallthrough can be slow). On POSIX, 1500ms is plenty for a real binary
  // and keeps cold detection of python3 → python → py under ~5s total (#454).
  try {
    // DEP0190 fix: avoid args array with shell:true on Windows.
    // Use execSync with a command string when shell is required;
    // keep execFileSync (no shell) on POSIX.
    if (isWindows) {
      execSync(`"${cmd}" --version`, { stdio: "pipe", timeout: 5000 });
    } else {
      execFileSync(cmd, ["--version"], { stdio: "pipe", timeout: 1500 });
    }
    return true;
  } catch {
    return false;
  }
}

function bunExists(): boolean {
  if (commandExists("bun")) return true;
  for (const p of bunFallbackPaths()) {
    if (existsSync(p)) return true;
  }
  return false;
}

function bunCommand(): string {
  // Prefer absolute .exe paths so spawn() can run with shell:false on Windows.
  // `where bun` may resolve to a `bun.cmd` npm shim (#506) which CreateProcess
  // cannot execute directly — return the real .exe wherever we can find one.
  for (const p of bunFallbackPaths()) {
    if (existsSync(p)) return p;
  }
  // Bare name only if PATH resolution confirms it. On Windows this is
  // typically a .cmd shim — the executor's needsShell list (which now
  // includes "bun" — see #506) ensures shell:true so cmd.exe can resolve it.
  if (commandExists("bun")) return "bun";
  // Synthetic last-resort path for diagnostics/error messages.
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return isWindows ? `${home}\\.bun\\bin\\bun.exe` : `${home}/.bun/bin/bun`;
}

/** Fallback paths where Bun may be installed but not on PATH. */
function bunFallbackPaths(): string[] {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const appData = process.env.APPDATA ?? "";
    return [
      // Native bun installer locations (irm bun.sh/install.ps1).
      ...(home ? [`${home}\\.bun\\bin\\bun.exe`] : []),
      ...(localAppData ? [`${localAppData}\\bun\\bin\\bun.exe`] : []),
      // npm i -g bun installs bun.exe under the npm prefix (typically
      // %APPDATA%\npm\node_modules\bun\bin\bun.exe). Without this, npm
      // installs were "found" via bun.cmd shim on PATH and the bare "bun"
      // string was returned — spawn() then ENOENT'd because CreateProcess
      // can't execute .cmd files (#506).
      ...(appData ? [`${appData}\\npm\\node_modules\\bun\\bin\\bun.exe`] : []),
    ];
  }
  return home ? [`${home}/.bun/bin/bun`] : [];
}

/** Well-known Git-for-Windows bash.exe locations (MSYS bash that performs
 *  Windows→POSIX path conversion for native git — #826). */
const KNOWN_GIT_BASH_PATHS = [
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
];

/**
 * On Windows, resolve the first non-WSL bash that is actually available.
 *
 * Availability is gated by `where bash` (#796): bash must be discoverable on
 * PATH for us to claim it. WSL bash (C:\Windows\System32\bash.exe) cannot
 * handle Windows paths, so we skip it and prefer Git Bash / MSYS2 bash.
 *
 * Routing the gate through `where bash` — rather than probing the known Git
 * Bash paths with existsSync first — is deliberate: when bash is genuinely
 * unavailable, the caller must fall through to pwsh (PR intent). Probing the
 * filesystem first re-detected a real Git Bash on the runner even though the
 * scenario was "bash unavailable", so pwsh was never reached.
 *
 * #826 is preserved: when `where bash` surfaces a Git Bash candidate we
 * canonicalize it to the absolute Git\usr\bin\bash.exe path (so native git
 * keeps MSYS path conversion) by preferring a matching known path that exists.
 */
function resolveWindowsBash(): string | null {
  let candidates: string[];
  try {
    const result = execSync("where bash", { encoding: "utf-8", stdio: "pipe" });
    candidates = result.trim().split(/\r?\n/).map(p => p.trim()).filter(Boolean);
  } catch {
    // bash not on PATH → genuinely unavailable. Fall through to pwsh/etc.
    return null;
  }

  for (const p of candidates) {
    const lower = p.toLowerCase();
    if (lower.includes("system32") || lower.includes("windowsapps")) continue;
    // Prefer the canonical Git\usr\bin\bash.exe so native git retains MSYS
    // path conversion. `where bash` on a Git-for-Windows install may surface
    // the Git\cmd\bash shim or usr\bin path; upgrade to a known absolute path
    // when one exists on disk.
    for (const known of KNOWN_GIT_BASH_PATHS) {
      if (existsSync(known)) return known;
    }
    return p;
  }
  return null;
}

function resolveWindowsShell(windowsBash: string | null = resolveWindowsBash()): string {
  // Prefer Git Bash (#826) so native git keeps its MSYS path conversion.
  // The caller passes the already-resolved windowsBash to avoid probing the
  // filesystem twice (it also feeds the cmd.exe shellOverride guard above).
  // Fall back through POSIX sh, then PowerShell Core (pwsh) for proper UTF-8
  // handling, then Windows PowerShell, then cmd.exe as the last resort.
  return windowsBash
    ?? (commandExists("sh")
      ? "sh"
      : commandExists("pwsh")
        ? "pwsh"
        : commandExists("powershell")
          ? "powershell"
          : "cmd.exe");
}

function getVersion(cmd: string, args: string[] = ["--version"]): string {
  try {
    // DEP0190 fix: avoid args array with shell:true on Windows.
    if (process.platform === "win32") {
      // Hardening (PR #537 review): quote any cmd.exe metacharacter, not just
      // whitespace. Current arg sources are internally controlled, but cheap
      // defense-in-depth for future call sites.
      const cmdStr = [cmd, ...args]
        .map(a => /[\s"&|<>^()%!]/.test(a) ? JSON.stringify(a) : a)
        .join(" ");
      return execSync(cmdStr, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      })
        .trim()
        .split(/\r?\n/)[0];
    } else {
      return execFileSync(cmd, args, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      })
        .trim()
        .split(/\r?\n/)[0];
    }
  } catch {
    return "unknown";
  }
}

/**
 * Resolve the JavaScript runtime used by PolyglotExecutor.
 *
 * PR #190 (f69b0d2) made `process.execPath` the default so snap-Node
 * envs would not re-invoke the snap wrapper via PATH. That assumed
 * `process.execPath` always points at a JS runtime — true on Node,
 * tsx, and snap-Node, but FALSE when context-mode runs in-process
 * inside a bun-compiled self-contained binary (OpenCode, Kilo, …).
 * In those hosts, `process.execPath` resolves to `opencode.exe` /
 * `opencode` (NOT node), and spawning that with a `.js` argument
 * triggers the yargs "Failed to change directory" error (#731).
 *
 * Fix: gate `process.execPath` on the existing `JS_RUNTIMES`
 * allowlist (single source of truth — same set used by
 * `buildNodeCommand()` in src/adapters/types.ts since PR #708). When
 * the execPath basename is not a known JS runtime, fall back to a
 * PATH-resolved `node`. If neither is reachable, return `null` and
 * let ctx_doctor surface an actionable error.
 *
 * The cross-OS guard is the allowlist itself — NOT a `win32` check.
 * OpenCode ships self-contained binaries on macOS and Linux too,
 * and the bug reproduces identically there.
 */
export function resolveJavascriptRuntime(
  bun: string | null,
  deps: {
    execPath?: string;
    commandExists?: (cmd: string) => boolean;
  } = {},
): string | null {
  if (bun) return bun;

  const execPath = deps.execPath ?? process.execPath;
  const cmdExists = deps.commandExists ?? commandExists;

  // Cross-OS basename: split on either separator, strip optional `.exe`.
  const base = execPath
    .split(/[\\/]/)
    .pop()!
    .replace(/\.exe$/i, "");

  if (JS_RUNTIMES.has(base)) {
    // Real JS runtime (node, bun, deno) — preserves #190 snap-Node fix
    // because the snap wrapper's binary is literally named `node`.
    //
    // Issue #800 — liveness guard: on Homebrew, process.execPath points into
    // the versioned Cellar (/opt/homebrew/Cellar/node/26.0.0/bin/node).
    // `brew upgrade` + `brew cleanup` deletes the old Cellar, so the path
    // dangles for the life of the already-running MCP server.  If the path
    // doesn't exist on disk, skip it and fall through to PATH node.
    if (existsSync(execPath)) {
      return execPath;
    }
    // Stale execPath (deleted Cellar, corrupted install, uninstall while
    // process alive).  Fall through to PATH resolution below.
  }

  // Host binary (opencode/kilo/etc.) — fall back to node on PATH.
  if (cmdExists("node")) return "node";

  // No usable runtime — doctor + summary must handle null gracefully.
  return null;
}

export function detectRuntimes(): RuntimeMap {
  const hasBun = bunExists();
  const bun = hasBun ? bunCommand() : null;

  // Honor SHELL env var when it points at a real binary AND the basename is
  // an allowlisted shell. Lets users with non-standard setups (custom bash,
  // msys2, pwsh) pin context-mode to their preferred shell.
  //
  // Allowlist (PR #401 ops review): basename must match
  // /^(bash|sh|zsh|dash|pwsh|powershell|cmd)(\.exe)?$/. Without this guard, an attacker
  // who controls SHELL (e.g., supply-chain compromise of a profile script)
  // could redirect the executor to /usr/bin/python or any arbitrary binary.
  const userShell = process.env.SHELL;
  const isWin = process.platform === "win32";
  const windowsBash = isWin ? resolveWindowsBash() : null;
  const shellOverride = userShell &&
    existsSync(userShell) &&
    isAllowlistedShell(userShell) &&
    !(isWin && isWindowsWslBash(userShell)) &&
    // Windows OpenSSH can inject the system cmd.exe as ambient SHELL. When
    // Git Bash is installed, treating that as an explicit override breaks the
    // POSIX shell executor path restored by #36/#384/#791.
    !(isWin && windowsBash && isWindowsSystemCmd(userShell))
    ? userShell
    : null;

  return {
    javascript: resolveJavascriptRuntime(bun),
    typescript: bun
      ? bun
      : commandExists("tsx")
        ? "tsx"
        : commandExists("ts-node")
          ? "ts-node"
          : null,
    python: runnableExists("python3")
      ? "python3"
      : runnableExists("python")
        ? "python"
        : runnableExists("py")
          ? "py"
          : null,
    shell: shellOverride ?? (isWin
      ? resolveWindowsShell(windowsBash)
      : commandExists("bash") ? "bash" : "sh"),
    ruby: commandExists("ruby") ? "ruby" : null,
    go: commandExists("go") ? "go" : null,
    rust: commandExists("rustc") ? "rustc" : null,
    php: commandExists("php") ? "php" : null,
    perl: commandExists("perl") ? "perl" : null,
    r: commandExists("Rscript")
      ? "Rscript"
      : commandExists("r")
        ? "r"
        : null,
    elixir: commandExists("elixir") ? "elixir" : null,
    csharp: commandExists("dotnet-script") ? "dotnet-script" : null,
  };
}

export function hasBunRuntime(): boolean {
  return bunExists();
}

/**
 * Resolved JS runtime for hook spawn commands. `path` is the absolute (or
 * bare-name on POSIX where PATH resolution is reliable) binary path.
 * `isBun` is true only when we successfully probed a Bun ≥1.0 install.
 */
export interface HookRuntime {
  readonly path: string;
  readonly isBun: boolean;
}

/**
 * Cached result of {@link resolveHookRuntime}. Populated on first call so the
 * relatively expensive `bun --version` probe runs at most once per process.
 * Reset via {@link resetHookRuntimeCache} (test-only).
 */
let _hookRuntimeCache: HookRuntime | null = null;

/**
 * Reset the hook-runtime resolution cache. Test-only — production code
 * should never call this. Vitest mocks `node:child_process`/`node:fs`
 * per-test, so the per-process cache from a previous test would otherwise
 * mask the mock and yield the host's real bun/node detection result.
 */
export function resetHookRuntimeCache(): void {
  _hookRuntimeCache = null;
}

/**
 * Parse a `bun --version` stdout string and return true when the version is
 * ≥1.0.0. Anything that doesn't match `MAJOR.MINOR.PATCH` (with optional
 * pre-release suffix) returns false — we refuse to trust runtimes whose
 * version we can't read because the failure mode is silent miscompare
 * (e.g. a banner line getting interpreted as "0.0.0").
 */
function bunVersionAtLeast1(versionOutput: string): boolean {
  const trimmed = versionOutput.trim();
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(trimmed);
  if (!m) return false;
  const major = Number(m[1]);
  return Number.isFinite(major) && major >= 1;
}

/**
 * Resolve the JS runtime to use for spawning hook scripts (issue #738).
 *
 * Returns Bun when:
 *   - a bun binary is located via {@link bunCommand} (already handles the
 *     Windows .cmd shim trap from #506 + absolute path fallbacks), AND
 *   - `bun --version` exits 0 within the probe timeout, AND
 *   - the reported semver major is ≥1.
 *
 * Returns Node (`process.execPath`) on every other path — missing bun,
 * version probe failure, version <1, malformed version banner. Silent
 * fallback: never throws, never logs to stderr (a noisy log would clutter
 * the same MCP boot output that #719 tightened up).
 *
 * Result is cached at module load so the cost is amortised across every
 * hook command emission for the lifetime of the process. The cache also
 * keeps the behaviour deterministic — if the user `brew uninstall bun`
 * mid-session, the cached resolution stays valid for that session and the
 * next MCP boot re-detects.
 *
 * Why bun ≥1.0 instead of "any bun":
 *   - Bun 0.x had multiple ESM/module-resolution regressions that broke
 *     dynamic `import()` inside hooks (and our hooks do ~7 dynamic imports
 *     in `pretooluse.mjs`).
 *   - 1.0 ships stable npm-compat that our better-sqlite3-adjacent code
 *     relies on indirectly (hooks share `ensure-deps.mjs` which is
 *     bun-safe past 1.0 but not 0.x).
 *
 * NOT used by:
 *   - `buildNodeCommand` — kept on `process.execPath` for openclaw doctor /
 *     upgrade hints which must invoke the better-sqlite3-loading CLI on
 *     Node (#543: bun cannot dlopen better-sqlite3's prebuilt .node).
 *   - `ensure-deps.mjs` — separate path, must stay on Node for the same
 *     reason.
 *   - `ctx_upgrade` — separate path, must stay on Node for the same reason.
 */
/**
 * Liveness-guarded Node path for the hook-runtime fallback (issue #841).
 *
 * `process.execPath` is pinned into every baked hook command because PATH
 * resolution is unreliable for hooks (#190 snap-Node re-invokes the wrapper;
 * #369 Windows Git Bash / MSYS can't resolve a bare `node`). But under a
 * version manager (mise / asdf / nvm) execPath is a *version-pinned* absolute
 * path — e.g. `~/.local/share/mise/installs/node/20.1.0/bin/node`. A routine
 * `mise upgrade node` installs the next patch and DELETES the 20.1.0 dir, so
 * the cached path dangles and every hook spawn fails with ENOENT — silently
 * killing context-mode for that user.
 *
 * Same liveness-guard shape as the #800/#803 fix in
 * {@link resolveJavascriptRuntime}: use the pinned execPath IFF it still
 * exists on disk (preserving the #190/#369 reasons it was pinned), otherwise
 * re-resolve a working `node` from PATH. The version manager's shim dir is on
 * PATH and always points at the current patch, so bare `node` heals the host
 * without a re-install. Falls back to the (stale) execPath only when no PATH
 * node is reachable either — a strictly-better last resort than a dangling
 * versioned path, and the doctor/upgrade flows surface the actionable error.
 */
function liveNodeRuntime(): HookRuntime {
  if (existsSync(process.execPath)) {
    return { path: process.execPath, isBun: false };
  }
  if (commandExists("node")) {
    return { path: "node", isBun: false };
  }
  return { path: process.execPath, isBun: false };
}

export function resolveHookRuntime(): HookRuntime {
  if (_hookRuntimeCache) return _hookRuntimeCache;
  const nodeFallback: HookRuntime = liveNodeRuntime();
  try {
    if (!bunExists()) {
      _hookRuntimeCache = nodeFallback;
      return _hookRuntimeCache;
    }
    const bun = bunCommand();
    // Re-use the same probe shape as getVersion (POSIX execFile, Windows
    // execSync quoted string for DEP0190 compliance).
    let versionOutput: string;
    try {
      if (process.platform === "win32") {
        const out = execSync(`"${bun}" --version`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        });
        versionOutput = String(out);
      } else {
        const out = execFileSync(bun, ["--version"], {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        });
        versionOutput = String(out);
      }
    } catch {
      _hookRuntimeCache = nodeFallback;
      return _hookRuntimeCache;
    }
    if (!bunVersionAtLeast1(versionOutput)) {
      _hookRuntimeCache = nodeFallback;
      return _hookRuntimeCache;
    }
    _hookRuntimeCache = { path: bun, isBun: true };
    return _hookRuntimeCache;
  } catch {
    _hookRuntimeCache = nodeFallback;
    return _hookRuntimeCache;
  }
}

export function getRuntimeSummary(runtimes: RuntimeMap): string {
  const lines: string[] = [];
  const bunPreferred = runtimes.javascript?.endsWith("bun") ?? false;

  if (runtimes.javascript) {
    lines.push(
      `  JavaScript: ${runtimes.javascript} (${getVersion(runtimes.javascript)})${bunPreferred ? " ⚡" : ""}`,
    );
  } else {
    // #731: host binary (opencode/kilo) AND no PATH-resolvable node.
    // Surface actionable guidance instead of rendering literal `null`.
    lines.push(
      `  JavaScript: not available (install node or bun — host process is not a JS runtime)`,
    );
  }

  if (runtimes.typescript) {
    lines.push(
      `  TypeScript: ${runtimes.typescript} (${getVersion(runtimes.typescript)})`,
    );
  } else {
    lines.push(
      `  TypeScript: not available (install bun, tsx, or ts-node)`,
    );
  }

  if (runtimes.python) {
    lines.push(
      `  Python:     ${runtimes.python} (${getVersion(runtimes.python)})`,
    );
  } else {
    lines.push(`  Python:     not available`);
  }

  lines.push(
    `  Shell:      ${runtimes.shell} (${getVersion(runtimes.shell)})`,
  );

  // Optional runtimes — only show if available
  if (runtimes.ruby)
    lines.push(
      `  Ruby:       ${runtimes.ruby} (${getVersion(runtimes.ruby)})`,
    );
  if (runtimes.go)
    lines.push(`  Go:         ${runtimes.go} (${getVersion(runtimes.go, ["version"])})`);
  if (runtimes.rust)
    lines.push(
      `  Rust:       ${runtimes.rust} (${getVersion(runtimes.rust)})`,
    );
  if (runtimes.php)
    lines.push(
      `  PHP:        ${runtimes.php} (${getVersion(runtimes.php)})`,
    );
  if (runtimes.perl)
    lines.push(
      `  Perl:       ${runtimes.perl} (${getVersion(runtimes.perl)})`,
    );
  if (runtimes.r)
    lines.push(`  R:          ${runtimes.r} (${getVersion(runtimes.r)})`);
  if (runtimes.elixir)
    lines.push(
      `  Elixir:     ${runtimes.elixir} (${getVersion(runtimes.elixir)})`,
    );
  if (runtimes.csharp)
    lines.push(
      `  C#:         ${runtimes.csharp} (${getVersion(runtimes.csharp)})`,
    );

  if (!bunPreferred) {
    lines.push("");
    lines.push(
      "  Tip: Install Bun for 3-5x faster JS/TS execution → https://bun.sh",
    );
  }

  return lines.join("\n");
}

export function getAvailableLanguages(runtimes: RuntimeMap): Language[] {
  const langs: Language[] = ["javascript", "shell"];
  if (runtimes.typescript) langs.push("typescript");
  if (runtimes.python) langs.push("python");
  if (runtimes.ruby) langs.push("ruby");
  if (runtimes.go) langs.push("go");
  if (runtimes.rust) langs.push("rust");
  if (runtimes.php) langs.push("php");
  if (runtimes.perl) langs.push("perl");
  if (runtimes.r) langs.push("r");
  if (runtimes.elixir) langs.push("elixir");
  if (runtimes.csharp) langs.push("csharp");
  return langs;
}

export function buildCommand(
  runtimes: RuntimeMap,
  language: Language,
  filePath: string,
): string[] {
  switch (language) {
    case "javascript":
      if (!runtimes.javascript) {
        // #731: in-process plugin host (opencode/kilo binary) AND no
        // PATH-resolvable node. Refuse early with an actionable error
        // instead of spawning the host binary (the original bug shape).
        throw new Error(
          "No JavaScript runtime available. Install Node.js or Bun on PATH (the host process is not itself a JS runtime).",
        );
      }
      return BUN_BASENAME.test(runtimeBasename(runtimes.javascript))
        ? [runtimes.javascript, "run", filePath]
        : [runtimes.javascript, filePath];

    case "typescript":
      if (!runtimes.typescript) {
        throw new Error(
          "No TypeScript runtime available. Install one of: bun (recommended), tsx (npm i -g tsx), or ts-node.",
        );
      }
      if (BUN_BASENAME.test(runtimeBasename(runtimes.typescript))) return [runtimes.typescript, "run", filePath];
      if (runtimes.typescript === "tsx") return ["tsx", filePath];
      return ["ts-node", filePath];

    case "python":
      if (!runtimes.python) {
        throw new Error(
          "No Python runtime available. Install python3 or python.",
        );
      }
      return [runtimes.python, filePath];

    case "shell": {
      // Re-evaluate platform per call so detection-time and command-build-time
      // can be tested independently (and to allow tests to stub process.platform).
      const winNow = process.platform === "win32";
      if (winNow) {
        const shellName = runtimes.shell.toLowerCase();
        if (shellName.includes("bash") || shellName.endsWith("/sh") || shellName.endsWith("\\sh.exe")) {
          // bash -c "source 'path'" — avoids MSYS2 path mangling on non-C:
          // drives. When bash.exe receives a script as a direct argument,
          // MSYS rewrites D:\tmp\script → D:\c\tmp\script and execution
          // breaks. The -c flag prevents MSYS from touching the file arg.
          // Single-quote escape: ' → '\''
          const escaped = filePath.replace(/'/g, "'\\''");
          return [runtimes.shell, "-c", `source '${escaped}'`];
        }
        if (shellName.includes("powershell") || shellName.includes("pwsh")) {
          // Windows PowerShell defaults to Restricted when no execution policy
          // is configured. Use process-scoped Bypass so generated temp scripts
          // run without changing machine/user policy.
          return [runtimes.shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", filePath];
        }
        const shellBase = shellName.split(/[\\/]/).pop() ?? shellName;
        if (shellBase === "cmd" || shellBase === "cmd.exe") {
          return [runtimes.shell, "/d", "/s", "/c", filePath];
        }
        // Other Windows shells: direct file.
      }
      return [runtimes.shell, filePath];
    }

    case "ruby":
      if (!runtimes.ruby) {
        throw new Error("Ruby not available. Install ruby.");
      }
      return [runtimes.ruby, filePath];

    case "go":
      if (!runtimes.go) {
        throw new Error("Go not available. Install go.");
      }
      return ["go", "run", filePath];

    case "rust": {
      if (!runtimes.rust) {
        throw new Error(
          "Rust not available. Install rustc via https://rustup.rs",
        );
      }
      // Rust needs compile + run — handled specially in executor
      return ["__rust_compile_run__", filePath];
    }

    case "php":
      if (!runtimes.php) {
        throw new Error("PHP not available. Install php.");
      }
      return ["php", filePath];

    case "perl":
      if (!runtimes.perl) {
        throw new Error("Perl not available. Install perl.");
      }
      return ["perl", filePath];

    case "r":
      if (!runtimes.r) {
        throw new Error("R not available. Install R / Rscript.");
      }
      return [runtimes.r, filePath];

    case "elixir":
      if (!runtimes.elixir) {
        throw new Error( "Elixir not available. Install elixir.");
      }
      return ["elixir", filePath];

    case "csharp":
      if (!runtimes.csharp) {
        throw new Error(
          "C# not available. Install dotnet-script via `dotnet tool install -g dotnet-script`.",
        );
      }
      return [runtimes.csharp, filePath];
  }
}
