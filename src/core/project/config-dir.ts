// impl/02 §4, impl/00 §2 (store), DEVIATIONS D-M1-6, D-M1-T3-1.
// The one config-dir reader: every module gets ~/.context-mode from here, none reads HOME again.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { basename, dirname, join, posix, resolve, win32 } from "node:path";
import { AGENT_HOME_DIR, UPGRADE_HOST_COMMAND, APPDATA_ENV, CONFIG_TOML_FILE, SETUP_BACKUP_DIR_NAME, SETUP_MANIFEST_FILE, CLAUDE_CONFIG_DIR_ENV, CODEX_HOME_ENV, COPILOT_HOME_ENV, GEMINI_CLI_HOME_ENV, DATA_DIR_ENV, DATA_ROOT, HOST_PLUGINS_DIR_NAME, PLUGIN_CACHE_DIR_NAME, KIRO_HOME_ENV, OPENCODE_CONFIG_DIR_ENV, PI_AGENT_DIR, PI_AGENT_DIR_ENV, VSCODE_USER_DIR_SEGMENTS, XDG_CONFIG_HOME_ENV } from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";

/** The one home rule. An empty value counts as unset; null when nothing is set (D-M3-F-8).
 *  POSIX (D-M1-T3-1): HOME, then USERPROFILE.
 *  win32 (D-WIN-HOME-2): USERPROFILE, then HOMEDRIVE+HOMEPATH, then HOME. Every host CLI is a Node program that takes its
 *  home from os.homedir(), which is USERPROFILE on Windows and ignores HOME; Git Bash, MSYS and some CI shells set HOME
 *  to another (often POSIX style) path, so HOME first would write where the host never reads.
 *  `platform` is a parameter so the rule is tested on every OS. */
export function homeDirOf(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string | null {
  const set = (v: string | undefined): v is string => v !== undefined && v !== "";
  if (platform === "win32") {
    if (set(env.USERPROFILE)) return env.USERPROFILE;
    if (set(env.HOMEDRIVE) && set(env.HOMEPATH)) return env.HOMEDRIVE + env.HOMEPATH;
    return set(env.HOME) ? env.HOME : null;
  }
  if (set(env.HOME)) return env.HOME;
  return set(env.USERPROFILE) ? env.USERPROFILE : null;
}

/** D-N6-CODEX-HOME-2: the dir Codex reads config.toml and hooks.json from: $CODEX_HOME when set and not empty,
 *  else <home>/.codex. Same rule as setup's agentPath (D-N5-CODEX-HOME-1). */
export function codexDirOf(env: NodeJS.ProcessEnv, home: string): string {
  const dir = env[CODEX_HOME_ENV];
  return dir !== undefined && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR.codex);
}

/** D-CODEX-HOME-RUN-1: the Codex home whose plugins/cache holds the running bundle: Codex installs a plugin in
 *  <codex home>/plugins/cache/<marketplace>/<plugin>/<version>. Null when the bundle sits in no plugins/cache dir (npm route).
 *  Claude Code keeps its plugins in the same shape under ~/.claude, so only the codex server asks this. */
export function codexPluginHomeOf(bundleDir: string): string | null {
  let dir = resolve(bundleDir);
  while (dirname(dir) !== dir) {
    const up = dirname(dir);
    if (basename(dir) === PLUGIN_CACHE_DIR_NAME && basename(up) === HOST_PLUGINS_DIR_NAME) return dirname(up);
    dir = up;
  }
  return null;
}

/** D-CODEX-HOME-RUN-1: the Codex home the running codex server belongs to: $CODEX_HOME when set and not empty; else the
 *  home whose plugins/cache holds the bundle (codexPluginHomeOf); else <home>/.codex. The MCP child env of a Codex session
 *  may carry neither HOME nor CODEX_HOME, and Codex then reads the OS profile home, so the doctor names this dir to Codex. */
export function codexRunDirOf(env: NodeJS.ProcessEnv, home: string, bundleDir: string): string {
  const dir = env[CODEX_HOME_ENV];
  if (dir !== undefined && dir !== "") return dir;
  return codexPluginHomeOf(bundleDir) ?? codexSetupHomeOf(env, home) ?? codexDirOf(env, home);
}

/** #1327 D-1327-CODEX-ENV-1: the Codex home the newest setup run wrote config.toml into, read from the run manifests under
 *  <data root>/backups. Codex Desktop starts the server without CODEX_HOME (its MCP env allowlist drops it), so an entry
 *  written before setup put CODEX_HOME in the entry env is found here. Null when no run names a codex config.toml. */
export function codexSetupHomeOf(env: NodeJS.ProcessEnv, home: string): string | null {
  if (home === "" && !env[DATA_DIR_ENV]) return null;
  const base = join(dataRootOf(env, home), SETUP_BACKUP_DIR_NAME);
  let runs: string[];
  try { runs = readdirSync(base).sort().reverse(); } catch { return null; }
  for (const run of runs) {
    const file = join(base, run, SETUP_MANIFEST_FILE);
    if (!existsSync(file)) continue;
    let entries: unknown;
    try { entries = (JSON.parse(readFileSync(file, "utf8")) as { entries?: unknown }).entries; } catch { continue; }
    if (!Array.isArray(entries)) continue;
    for (const e of entries as { agent?: unknown; file?: unknown }[]) {
      if (e?.agent !== "codex" || typeof e.file !== "string") continue;
      // The manifest holds the host's own path form: a Windows path (D:\\Codex\\.codex\\config.toml) splits on "\\".
      const p = e.file.includes(win32.sep) ? win32 : posix;
      if (p.basename(e.file) === CONFIG_TOML_FILE) return p.dirname(e.file);
    }
  }
  return null;
}

/** D-WIN-COPILOT-HOME-1: the dir Copilot CLI reads hooks/ and skills/ from: $COPILOT_HOME when set and not empty (it replaces
 *  ~/.copilot as a whole), else <home>/.copilot. Same rule as codexDirOf. */
export function copilotDirOf(env: NodeJS.ProcessEnv, home: string): string {
  const dir = env[COPILOT_HOME_ENV];
  return dir !== undefined && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR["copilot-cli"]);
}

/** D-R38-GEMINI-HOME-1: the dir gemini-cli reads .gemini/ from: $GEMINI_CLI_HOME when set and not empty, else the home dir
 *  (gemini-cli 0.67.0 homedir(), bundle chunk-LAR4JEC7.js:252013). The value is a home, so .gemini sits under it. */
export function geminiDirOf(env: NodeJS.ProcessEnv, home: string): string {
  const dir = env[GEMINI_CLI_HOME_ENV];
  return join(dir !== undefined && dir !== "" ? dir : home, ...AGENT_HOME_DIR.gemini);
}

/** D-WIN-KIRO-HOME-1: the dir Kiro CLI V3 reads hooks/, settings/mcp.json, skills/ and agents/ from: $KIRO_HOME when it is an
 *  absolute path that is not a filesystem root, not the home dir and not an ancestor of it (kiro.dev/docs/reference/settings),
 *  else <home>/.kiro. Any other value (empty, relative, drive-less on win32) is ignored by Kiro, so it is ignored here.
 *  `platform` is a parameter so the rule is tested on every OS. */
export function kiroDirOf(env: NodeJS.ProcessEnv, home: string, platform: NodeJS.Platform = process.platform): string {
  const p = platform === "win32" ? win32 : posix;
  const fallback = p.join(home, ...AGENT_HOME_DIR.kiro);
  // D-R33-KIRO-HOME-2: Kiro CLI 3.0 (Dgs) trims the value and returns the resolved path; YDl/Ngs check root and home on
  // the realpath of the nearest existing parent, so a symlink to home counts as home.
  const dir = env[KIRO_HOME_ENV]?.trim();
  if (dir === undefined || dir === "" || !p.isAbsolute(dir)) return fallback;
  if (platform === "win32" && p.parse(dir).root.length < 2) return fallback; // "\\kiro" has no drive: relative to the current drive
  const abs = p.resolve(dir);
  const real = platform === process.platform ? realOrSelf : (x: string) => x; // a fake-platform path is not on this disk
  const target = real(abs);
  if (p.parse(target).root === target) return fallback; // a filesystem root
  const up = p.relative(target, real(p.resolve(home))); // "" = home itself; no leading ".." = home sits inside dir, so dir is an ancestor
  if (!p.isAbsolute(up) && up.split(p.sep)[0] !== "..") return fallback;
  return abs;
}

/** Kiro CLI 3.0 Ngs: realpath of the nearest existing parent, with the missing tail joined back; the path itself when none exists. */
function realOrSelf(path: string): string {
  const tail: string[] = [];
  for (let at = path; ; ) {
    try {
      return join(realpathSync.native(at), ...tail.reverse());
    } catch {
      const up = dirname(at);
      if (up === at) return path;
      tail.push(basename(at));
      at = up;
    }
  }
}

/** D-WF-CC-CONFIG-1: the dir Claude Code keeps settings.json, plugins/ and agents/ in: $CLAUDE_CONFIG_DIR when set and
 *  not empty, else <home>/.claude. Windows profiles redirected to OneDrive set it. */
export function claudeDirOf(env: NodeJS.ProcessEnv, home: string): string {
  const dir = env[CLAUDE_CONFIG_DIR_ENV];
  return dir !== undefined && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR["claude-code"]);
}

/** #1338: the env words a copied Claude Code command needs to reach the profile in use: `CLAUDE_CONFIG_DIR='<dir>' ` when the
 *  variable is set (a custom profile dir, e.g. Orca), else "". A HOME-based profile needs none: the shell that runs the
 *  command already carries that HOME. POSIX quoting; Windows shells differ, so no words there. */
export function claudeProfileEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
  const dir = env[CLAUDE_CONFIG_DIR_ENV];
  if (dir === undefined || dir === "" || platform === "win32") return "";
  return `${CLAUDE_CONFIG_DIR_ENV}='${dir.split("'").join(`'"'"'`)}' `;
}

/** #1338: the agent's own update command; for Claude Code each `claude` command carries the profile words, so a copied line reaches that profile.
 *  One rule for ctx_upgrade and doctor D1. */
export function hostUpdateCommand(agent: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
  const cmd = UPGRADE_HOST_COMMAND[agent as keyof typeof UPGRADE_HOST_COMMAND];
  if (agent !== "claude-code") return cmd;
  const profile = claudeProfileEnv(env, platform);
  return profile === "" ? cmd : cmd.split(" && ").map((c) => profile + c).join(" && ");
}

/** D-WIN-OPENCODE-DIR-1: the dir OpenCode reads opencode.json and skills/ from: $OPENCODE_CONFIG_DIR when set and not
 *  empty, else $XDG_CONFIG_HOME/opencode (OpenCode takes its global dir from xdg-basedir), else <home>/.config/opencode.
 *  Same shape as codexDirOf. $OPENCODE_CONFIG (a single extra config file, merged on top) does not move the global dir. */
export function opencodeDirOf(env: NodeJS.ProcessEnv, home: string): string {
  const own = env[OPENCODE_CONFIG_DIR_ENV];
  if (own !== undefined && own !== "") return own;
  const xdg = env[XDG_CONFIG_HOME_ENV];
  if (xdg !== undefined && xdg !== "") return join(xdg, AGENT_HOME_DIR.opencode[AGENT_HOME_DIR.opencode.length - 1]);
  return join(home, ...AGENT_HOME_DIR.opencode);
}

/** D-WIN-PIDIR-1: the dir Pi reads settings.json from: $PI_CODING_AGENT_DIR when set and not empty (#1035), else
 *  <home>/.pi/agent. An empty value counts as unset, same rule as codexDirOf; `??` let "" win and gave a relative path. */
export function piAgentDirOf(env: NodeJS.ProcessEnv, home: string): string {
  const dir = env[PI_AGENT_DIR_ENV];
  return dir !== undefined && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR.pi, PI_AGENT_DIR);
}

/** D-WIN-VSCODE-MCP-1: the VS Code user-profile dir (default profile, holds mcp.json and settings.json). Rule of VS Code's
 *  userDataPath.ts: win32 %APPDATA% (else <home>\\AppData\\Roaming), darwin <home>/Library/Application Support, other
 *  $XDG_CONFIG_HOME (else <home>/.config); then Code/User. An empty value counts as unset. ~/.vscode is the extensions dir.
 *  `platform` is a parameter so the rule is tested on every OS; the path flavour follows it. */
export function vscodeUserDirOf(env: NodeJS.ProcessEnv, home: string, platform: NodeJS.Platform = process.platform): string {
  const set = (v: string | undefined): v is string => v !== undefined && v !== "";
  const p = platform === "win32" ? win32 : posix;
  if (platform === "win32") return p.join(set(env[APPDATA_ENV]) ? env[APPDATA_ENV] : p.join(home, "AppData", "Roaming"), ...VSCODE_USER_DIR_SEGMENTS);
  if (platform === "darwin") return p.join(home, "Library", "Application Support", ...VSCODE_USER_DIR_SEGMENTS);
  return p.join(set(env[XDG_CONFIG_HOME_ENV]) ? env[XDG_CONFIG_HOME_ENV] : p.join(home, ".config"), ...VSCODE_USER_DIR_SEGMENTS);
}

/** D-WIN-VSCODE-MCP-1: the host file holding an agent's own MCP entry. `file` is OWN_MCP_ENTRY[agent].file: segments under
 *  <home>, except VS Code, whose file name sits in the user-profile dir. The one place setup, doctor, upgrade, uninstall
 *  and plugin-root get this path. */
export function ownMcpFileOf(agent: string, file: readonly string[], env: NodeJS.ProcessEnv, home: string): string {
  if (agent === "kiro") return join(kiroDirOf(env, home), ...file.slice(1)); // D-WIN-KIRO-HOME-1: file = [".kiro", ...]
  return agent === "vscode" ? join(vscodeUserDirOf(env, home), ...file) : join(home, ...file);
}

/** The one "home or fail" helper (D-WIN-HOME-3): setup, doctor, upgrade, uninstall, plugin-root and the store all call this.
 *  The NO_HOME error names the var the platform rule reads first: USERPROFILE on win32, HOME elsewhere. */
export function requireHomeDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
  const home = homeDirOf(env, platform);
  if (home !== null) return home;
  throw new CtxError("NO_HOME", { name: platform === "win32" ? "USERPROFILE" : "HOME" });
}

/** #1318 (D-DATA-DIR-ENV-1): the data root. $CONTEXT_MODE_DATA_DIR when set and not empty (resolved to an absolute path),
 *  else <home>/.context-mode. Setup, the store, the hook error log and doctor all take it from here. */
export function dataRootOf(env: NodeJS.ProcessEnv, home: string): string {
  const dir = env[DATA_DIR_ENV];
  return dir !== undefined && dir !== "" ? resolve(dir) : join(home, DATA_ROOT.slice(1)); // DATA_ROOT is "~" + "/.context-mode"; join drops the lead "/"
}

/** impl/02 §4 steps 1-4: expand DATA_ROOT ("~/.context-mode", or $CONTEXT_MODE_DATA_DIR), create it if absent, return its realpath. */
export function resolveConfigDir(env: NodeJS.ProcessEnv): string {
  const set = env[DATA_DIR_ENV];
  const dir = dataRootOf(env, set !== undefined && set !== "" ? "" : requireHomeDir(env));
  mkdirSync(dir, { recursive: true });
  return realpathSync.native(dir); // same canonical form as resolve.ts and contain.ts (review-M1 #1)
}
