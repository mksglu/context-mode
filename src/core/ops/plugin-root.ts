// impl/07 §1 (resolvePluginRoot), ADR-0010 "one path per install mode, no fallback", DECISIONS-r4 A38,
// TECH-SPEC §3.11 (#771 generalized), PRD §13 (never cached, #711 #1005); DEVIATIONS D-M5-O1-1..2.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_HOME_DIR, CLAUDE_PLUGIN_ROOT_ENV, CLAUDE_PROJECT_DIR_ENV, DATA_PLUGINS_DIR_NAME, DEFAULT_PLUGIN_SCOPE, ENABLED_PLUGINS_KEY, HOST_CONFIG_DIR_NAME,
  PLUGIN_SCOPE_RANK, PROJECT_PLUGIN_SCOPES, SETTINGS_FILE, SETTINGS_LOCAL_FILE, EXTENSIONS_DIR_NAME, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE,
  MCP_ARGS_FIELD, OWN_MCP_ENTRY, PLUGIN_CACHE_DIR_NAME, PLUGIN_CURRENT_LINK, PLUGIN_KEY_SEPARATOR, PLUGIN_NAME, SERVER_ENTRY_FILE, SERVER_KEY,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { AdapterRow } from "../contracts/types.ts";
import { claudeDirOf, geminiDirOf, ownMcpFileOf, requireHomeDir, resolveConfigDir } from "../project/config-dir.ts";
import { hostText } from "./host-text.ts";
import { hostConfigValueAt, parseHostConfig, readHostConfig } from "./host-config.ts";

type RootInput = Pick<AdapterRow, "id" | "installMode">;

function missing(agent: string, path: string): CtxError {
  return new CtxError("PLUGIN_ROOT_MISSING", { agent, path });
}

/** D-DOC-D3-SCOPE-1: one installed_plugins.json entry of this plugin, as Claude Code wrote it. */
export interface RecordedInstall { key: string; scope: string; projectPath: string | undefined; installPath: string; }

const parseOrNull = (text: string): unknown => {
  try {
    return JSON.parse(hostText(text));
  } catch {
    return null;
  }
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** D-DOC-D3-ROOT-1 + D-DOC-D3-SCOPE-1: every entry Claude Code recorded for this plugin. The file maps
 *  "<plugin>@<marketplace>" to a list of entries; installPath is the plugin root (the versioned cache dir), scope is
 *  user | project | local | managed (none: user), projectPath names the project of a project/local entry. */
export function recordedInstalls(text: string): RecordedInstall[] {
  const parsed = parseOrNull(text);
  const plugins = isRecord(parsed) ? parsed.plugins : undefined;
  if (!isRecord(plugins)) return [];
  const out: RecordedInstall[] = [];
  for (const key of Object.keys(plugins)) {
    const at = key.indexOf(PLUGIN_KEY_SEPARATOR);
    if ((at < 0 ? key : key.slice(0, at)) !== PLUGIN_NAME) continue;
    const entries = plugins[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!isRecord(e) || typeof e.installPath !== "string" || e.installPath === "") continue;
      const scope = typeof e.scope === "string" ? e.scope : DEFAULT_PLUGIN_SCOPE;
      const projectPath = typeof e.projectPath === "string" ? e.projectPath : undefined;
      out.push({ key, scope, projectPath, installPath: e.installPath });
    }
  }
  return out;
}

/** D-DOC-D3-ROOT-1: the install paths, once each. Strings are returned as written: a Windows path keeps its backslashes. */
export function recordedInstallPaths(text: string): string[] {
  const out: string[] = [];
  for (const r of recordedInstalls(text)) if (!out.includes(r.installPath)) out.push(r.installPath);
  return out;
}

const realOrNull = (path: string): string | null => {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
};

const readOrNull = (file: string): string | null => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

const samePath = (a: string, b: string): boolean => a === b || (realOrNull(a) ?? a) === (realOrNull(b) ?? b);

/** enabledPlugins merged the way Claude Code merges settings: user, then project, then local (later wins). */
function enabledPlugins(claudeDir: string, project: string | undefined): Record<string, unknown> {
  const files = [join(claudeDir, SETTINGS_FILE)];
  if (project !== undefined) files.push(join(project, HOST_CONFIG_DIR_NAME, SETTINGS_FILE), join(project, HOST_CONFIG_DIR_NAME, SETTINGS_LOCAL_FILE));
  const out: Record<string, unknown> = {};
  for (const file of files) {
    const text = readOrNull(file);
    const doc = text === null ? null : parseOrNull(text);
    const on = isRecord(doc) ? doc[ENABLED_PLUGINS_KEY] : undefined;
    if (isRecord(on)) Object.assign(out, on);
  }
  return out;
}

/** D-DOC-D3-SCOPE-1: the marketplace root Claude Code uses for this project, or the live installs when it cannot be told. */
export type MarketplaceChoice = { root: string } | { installs: RecordedInstall[] } | { record: false };

/** D-DOC-D3-SCOPE-1 order over the host record: (0) CLAUDE_PLUGIN_ROOT that is the running bundle's dir (a directory
 *  marketplace runs from its source dir, which is not recorded); (1) the recorded dir that is the running bundle's dir;
 *  (2) the one enabled entry that applies to this project, by scope rank local > project > user (a project/local entry
 *  applies only when projectPath is the project); (3) the only live entry (checked before (2): settings cannot change it); else the live installs, no pick (#901). */
export function marketplaceChoice(env: NodeJS.ProcessEnv, worktree?: string): MarketplaceChoice {
  const claudeDir = claudeDirOf(env, requireHomeDir(env));
  const script = process.argv[1];
  const ownReal = script === undefined || script === "" ? null : realOrNull(dirname(script)); // no script: no own dir, never the cwd
  const hostRoot = env[CLAUDE_PLUGIN_ROOT_ENV];
  if (ownReal !== null && hostRoot !== undefined && hostRoot !== "" && realOrNull(hostRoot) === ownReal) return { root: ownReal };
  const record = readOrNull(join(claudeDir, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE));
  const recorded = record === null ? [] : recordedInstalls(record);
  if (recorded.length === 0) return { record: false };
  const live = recorded.filter((r) => existsSync(r.installPath));
  const mine = live.find((r) => realOrNull(r.installPath) === ownReal);
  if (mine !== undefined) return { root: mine.installPath };
  const dirs = live.filter((r, i) => live.findIndex((o) => samePath(o.installPath, r.installPath)) === i);
  if (dirs.length === 1) return { root: dirs[0].installPath }; // one live dir: settings cannot change the pick
  const projectEnv = env[CLAUDE_PROJECT_DIR_ENV];
  const project = worktree ?? (projectEnv === undefined || projectEnv === "" ? undefined : projectEnv);
  const on = enabledPlugins(claudeDir, project);
  const applies = (r: RecordedInstall): boolean => !PROJECT_PLUGIN_SCOPES.includes(r.scope)
    || (project !== undefined && r.projectPath !== undefined && samePath(r.projectPath, project));
  const rank = (r: RecordedInstall): number => PLUGIN_SCOPE_RANK[r.scope] ?? PLUGIN_SCOPE_RANK[DEFAULT_PLUGIN_SCOPE];
  const used = live.filter((r) => on[r.key] === true && applies(r));
  if (used.length > 0) {
    const best = Math.min(...used.map(rank));
    const top = used.filter((r) => rank(r) === best);
    if (top.every((r) => samePath(r.installPath, top[0].installPath))) return { root: top[0].installPath };
  }
  return { installs: live.length === 0 ? recorded : live };
}

// marketplace (D-DOC-D3-ROOT-1, supersedes the parent-dir pick of D-M5-O1-1): Claude Code copies the plugin to
// <claude dir>/plugins/cache/<marketplace>/context-mode/<version> and records that dir as installPath. Order:
//   1. the host record, through marketplaceChoice (D-DOC-D3-SCOPE-1). No pick: PLUGIN_ROOT_MISSING with the dirs.
//   2. no record: the running bundle's own dir, when it sits inside the plugin cache and holds the server script.
//   3. no record, flat cache <marketplace>/context-mode that holds no version dir (npm/flat layout, D-M5-O1-1).
function marketplaceRoot(adapter: RootInput, env: NodeJS.ProcessEnv, worktree?: string): string {
  const claudeDir = claudeDirOf(env, requireHomeDir(env));
  const plugins = join(claudeDir, HOST_PLUGINS_DIR_NAME);
  const cache = join(plugins, PLUGIN_CACHE_DIR_NAME);
  const script = process.argv[1];
  const ownReal = script === undefined || script === "" ? null : realOrNull(dirname(script)); // no script: no own dir, never the cwd
  const choice = marketplaceChoice(env, worktree);
  if ("root" in choice) return choice.root;
  if ("installs" in choice) throw missing(adapter.id, choice.installs.map((r) => r.installPath).join(", "));
  const cacheReal = realOrNull(cache);
  if (ownReal !== null && cacheReal !== null && ownReal.startsWith(cacheReal + sep) && existsSync(join(ownReal, SERVER_ENTRY_FILE))) return ownReal;
  const pattern = join(cache, "*", PLUGIN_NAME);
  if (!existsSync(cache)) throw missing(adapter.id, pattern);
  const found = readdirSync(cache)
    .sort()
    .map((marketplace) => join(cache, marketplace, PLUGIN_NAME))
    .filter((dir) => existsSync(dir));
  if (found.length !== 1) throw missing(adapter.id, found.length === 0 ? pattern : found.join(", "));
  return found[0];
}

// config-mcp / mcp-entry / hooks+mcp: dirname of the server script in the agent's own MCP entry (D-M5-O1-2).
function configEntryRoot(adapter: RootInput, env: NodeJS.ProcessEnv): string {
  const spec = OWN_MCP_ENTRY[adapter.id];
  if (spec === undefined) throw missing(adapter.id, SERVER_KEY);
  const file = ownMcpFileOf(adapter.id, spec.file, env, requireHomeDir(env));
  if (!existsSync(file)) throw missing(adapter.id, file);
  const current = readHostConfig(adapter.id, file);
  const value = parseHostConfig(adapter.id, file, current.text, current.format);
  const args = hostConfigValueAt(value, [...spec.key, MCP_ARGS_FIELD]);
  const script = Array.isArray(args) ? args[0] : undefined;
  if (typeof script !== "string" || !isAbsolute(script)) throw missing(adapter.id, file);
  return dirname(script);
}

function candidate(adapter: RootInput, env: NodeJS.ProcessEnv, worktree?: string): string {
  switch (adapter.installMode) {
    case "marketplace":
      return marketplaceRoot(adapter, env, worktree);
    case "config-mcp":
    case "mcp-entry":
    case "hooks+mcp":
      return configEntryRoot(adapter, env);
    case "extension":
      // D-R38-GEMINI-HOME-1: gemini-cli keeps extensions under $GEMINI_CLI_HOME/.gemini when it is set.
      return join(adapter.id === "gemini" ? geminiDirOf(env, requireHomeDir(env)) : join(requireHomeDir(env), ...AGENT_HOME_DIR[adapter.id]), EXTENSIONS_DIR_NAME, PLUGIN_NAME);
    case "plugin":
      return join(resolveConfigDir(env), DATA_PLUGINS_DIR_NAME, adapter.id, PLUGIN_CURRENT_LINK);
    case "in-process":
      return dirname(fileURLToPath(import.meta.url));
  }
}

/** impl/07 §1: the absolute, realpath'd plugin root for one agent. Never cached; the caller owns any scope.
 *  worktree: the project a marketplace install is judged for (D-DOC-D3-SCOPE-1); none: CLAUDE_PROJECT_DIR. */
export function resolvePluginRoot(adapter: RootInput, env: NodeJS.ProcessEnv, worktree?: string): string {
  const path = candidate(adapter, env, worktree);
  try {
    return realpathSync.native(path);
  } catch {
    throw missing(adapter.id, path);
  }
}
