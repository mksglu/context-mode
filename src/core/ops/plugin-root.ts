// impl/07 §1 (resolvePluginRoot), ADR-0010 "one path per install mode, no fallback", DECISIONS-r4 A38,
// TECH-SPEC §3.11 (#771 generalized), PRD §13 (never cached, #711 #1005); DEVIATIONS D-M5-O1-1..2.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_HOME_DIR, DATA_PLUGINS_DIR_NAME, EXTENSIONS_DIR_NAME, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE,
  MCP_ARGS_FIELD, OWN_MCP_ENTRY, PLUGIN_CACHE_DIR_NAME, PLUGIN_CURRENT_LINK, PLUGIN_KEY_SEPARATOR, PLUGIN_NAME, SERVER_ENTRY_FILE, SERVER_KEY,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { AdapterRow } from "../contracts/types.ts";
import { claudeDirOf, ownMcpFileOf, requireHomeDir, resolveConfigDir } from "../project/config-dir.ts";
import { hostText } from "./host-text.ts";
import { hostConfigValueAt, parseHostConfig, readHostConfig } from "./host-config.ts";

type RootInput = Pick<AdapterRow, "id" | "installMode">;

function missing(agent: string, path: string): CtxError {
  return new CtxError("PLUGIN_ROOT_MISSING", { agent, path });
}

/** D-DOC-D3-ROOT-1: the install paths Claude Code itself recorded for this plugin in installed_plugins.json. The file maps
 *  "<plugin>@<marketplace>" to a list of entries; each entry's installPath is the plugin root (the versioned cache dir,
 *  whatever the marketplace source form was). Strings are returned as written: a Windows path keeps its backslashes. */
export function recordedInstallPaths(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(hostText(text));
  } catch {
    return [];
  }
  const plugins = (parsed as { plugins?: Record<string, unknown> } | null)?.plugins;
  if (plugins === null || typeof plugins !== "object") return [];
  const out: string[] = [];
  for (const key of Object.keys(plugins)) {
    const at = key.indexOf(PLUGIN_KEY_SEPARATOR);
    if ((at < 0 ? key : key.slice(0, at)) !== PLUGIN_NAME) continue;
    const entries = plugins[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const dir = (e as { installPath?: unknown } | null)?.installPath;
      if (typeof dir === "string" && dir !== "" && !out.includes(dir)) out.push(dir);
    }
  }
  return out;
}

const realOrNull = (path: string): string | null => {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
};

// marketplace (D-DOC-D3-ROOT-1, supersedes the parent-dir pick of D-M5-O1-1): Claude Code copies the plugin to
// <claude dir>/plugins/cache/<marketplace>/context-mode/<version> and records that dir as installPath. Order:
//   1. installPath in installed_plugins.json (the host's own record). Several: the one that is the running bundle's dir,
//      else the only one that exists, else PLUGIN_ROOT_MISSING (no pick, #901 "two install trees").
//   2. no record: the running bundle's own dir, when it sits inside the plugin cache and holds the server script.
//   3. no record, flat cache <marketplace>/context-mode that holds no version dir (npm/flat layout, D-M5-O1-1).
function marketplaceRoot(adapter: RootInput, env: NodeJS.ProcessEnv): string {
  const claudeDir = claudeDirOf(env, requireHomeDir(env));
  const plugins = join(claudeDir, HOST_PLUGINS_DIR_NAME);
  const cache = join(plugins, PLUGIN_CACHE_DIR_NAME);
  const script = process.argv[1];
  const ownReal = script === undefined || script === "" ? null : realOrNull(dirname(script)); // no script: no own dir, never the cwd
  let record: string | null = null;
  try {
    record = readFileSync(join(plugins, INSTALLED_PLUGINS_FILE), "utf8");
  } catch {
    record = null;
  }
  const recorded = record === null ? [] : recordedInstallPaths(record);
  if (recorded.length > 0) {
    const live = recorded.filter((dir) => existsSync(dir));
    const mine = live.find((dir) => realOrNull(dir) === ownReal);
    if (mine !== undefined) return mine;
    if (live.length === 1) return live[0];
    throw missing(adapter.id, recorded.join(", "));
  }
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

function candidate(adapter: RootInput, env: NodeJS.ProcessEnv): string {
  switch (adapter.installMode) {
    case "marketplace":
      return marketplaceRoot(adapter, env);
    case "config-mcp":
    case "mcp-entry":
    case "hooks+mcp":
      return configEntryRoot(adapter, env);
    case "extension":
      return join(requireHomeDir(env), ...AGENT_HOME_DIR[adapter.id], EXTENSIONS_DIR_NAME, PLUGIN_NAME);
    case "plugin":
      return join(resolveConfigDir(env), DATA_PLUGINS_DIR_NAME, adapter.id, PLUGIN_CURRENT_LINK);
    case "in-process":
      return dirname(fileURLToPath(import.meta.url));
  }
}

/** impl/07 §1: the absolute, realpath'd plugin root for one agent. Never cached; the caller owns any scope. */
export function resolvePluginRoot(adapter: RootInput, env: NodeJS.ProcessEnv): string {
  const path = candidate(adapter, env);
  try {
    return realpathSync.native(path);
  } catch {
    throw missing(adapter.id, path);
  }
}
