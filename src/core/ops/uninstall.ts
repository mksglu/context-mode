// impl/07 §6 "Steps (Uninstall)", DECISIONS-r3 Q16 Q21, DEVIATIONS D-M5-U1-1, D-M5-U1-3, D-M5-U1-6, D-M5-U7-1..3.
// ctx_upgrade mode "uninstall": three areas that always run (stop, cache, own config entries), then this
// project's data only when confirmDelete is true. tools/upgrade.ts stays a thin handler that calls this.
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_HOME_DIR, DATA_PLUGINS_DIR_NAME, HOST_PLUGINS_DIR_NAME, PLUGIN_CACHE_DIR_NAME, OPENCODE_BASE_CONFIG_FILE, OPENCODE_GIT_SPEC, OPENCODE_PLUGIN_KEY,
  OWN_MCP_ENTRY, OWNER_STOP_EXT, OWNERS_DIR_NAME, PI_GIT_PACKAGE,
  PI_PACKAGE_SOURCE_KEY, PI_PACKAGES_KEY, PROJECTS_DIR_NAME, SETTINGS_FILE, UPGRADE_AREA_KEY_SEP,
  UPGRADE_CACHE_AREA, UPGRADE_CACHE_BY_HAND, UPGRADE_CONFIG_AREA, UPGRADE_DATA_AREA, UPGRADE_DATA_DELETED,
  UPGRADE_DATA_KEPT, UPGRADE_NOT_FOUND, UPGRADE_OWN_ENTRY, UPGRADE_REMOVED, UPGRADE_SERVER_AREA,
  UPGRADE_SERVER_RUNNING, UPGRADE_SERVER_STOPPED, V1_KEY_PATH_SEP,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { AdapterRow, AgentId, ProjectContext, UpgradeChangeRow } from "../contracts/types.ts";
import { isInside } from "../project/contain.ts";
import { claudeDirOf, opencodeDirOf, ownMcpFileOf, piAgentDirOf, requireHomeDir, resolveConfigDir } from "../project/config-dir.ts";
import { listLiveOwners } from "../store/owners.ts";
import { hostConfigValueAt, parseHostConfig, readHostConfig, writeHostConfigEdit } from "./host-config.ts";
import { resolvePluginRoot } from "./plugin-root.ts";

export interface UninstallInput {
  adapter: Pick<AdapterRow, "id" | "installMode">;
  project: Pick<ProjectContext, "projectKey">;
  env: NodeJS.ProcessEnv;
  confirmDelete: boolean;
}
export interface UninstallResult {
  rows: UpgradeChangeRow[];
  stopped: string[]; // server ids that got a stop marker; the caller exits after its reply if its own id is here
}

function row(area: string, before: string, after: string): UpgradeChangeRow {
  return { area, before, after };
}

// ------------------------------------------------------------------------------------------ 1. stop

// Step 1: one <serverId>.stop marker next to every live owner's <serverId>.pid (D-M5-U1-6, store owners.ts).
function stopServers(configDir: string, projectKey: string): { row: UpgradeChangeRow; stopped: string[] } {
  const stopped = listLiveOwners(configDir, projectKey);
  const dir = join(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME);
  for (const serverId of stopped) writeFileSync(join(dir, serverId + OWNER_STOP_EXT), "", "utf8");
  return stopped.length === 0
    ? { row: row(UPGRADE_SERVER_AREA, "", UPGRADE_NOT_FOUND), stopped }
    : { row: row(UPGRADE_SERVER_AREA, UPGRADE_SERVER_RUNNING, UPGRADE_SERVER_STOPPED), stopped };
}

// ----------------------------------------------------------------------------------------- 2. cache

function rootOrNull(adapter: UninstallInput["adapter"], env: NodeJS.ProcessEnv): string | null {
  try {
    return resolvePluginRoot(adapter, env);
  } catch (err) {
    if (err instanceof CtxError && err.code === "PLUGIN_ROOT_MISSING") return null; // a reported state, not a retry
    throw err;
  }
}

// Step 2. marketplace/extension: delete the resolved tree. plugin: delete <DATA_ROOT>/plugins/<agent>, which holds
// `current`, the kept rollback generation and any in-flight fetch dir. config-entry and in-process installs: the
// dir is not one context-mode created, so report it by hand (D-M5-U1-3, D-M5-U7-2).
function removeCache(adapter: UninstallInput["adapter"], env: NodeJS.ProcessEnv, configDir: string): UpgradeChangeRow {
  switch (adapter.installMode) {
    case "marketplace":
    case "extension": {
      const root = rootOrNull(adapter, env);
      if (root === null) return row(UPGRADE_CACHE_AREA, "", UPGRADE_NOT_FOUND);
      // D-UNINST-CACHE-ONLY-1: a marketplace root outside <claude dir>/plugins/cache is a directory marketplace's
      // source dir (CLAUDE_PLUGIN_ROOT, D-DOC-D3-SCOPE-1): the user's own tree, so report it, never delete it.
      if (adapter.installMode === "marketplace") {
        const cache = join(claudeDirOf(env, requireHomeDir(env)), HOST_PLUGINS_DIR_NAME, PLUGIN_CACHE_DIR_NAME);
        if (!isInside(cache, root) || isInside(root, cache)) return row(UPGRADE_CACHE_AREA, root, UPGRADE_CACHE_BY_HAND);
      }
      rmSync(root, { recursive: true, force: true });
      return row(UPGRADE_CACHE_AREA, root, UPGRADE_REMOVED);
    }
    case "plugin": {
      const agentDir = join(configDir, DATA_PLUGINS_DIR_NAME, adapter.id);
      if (!existsSync(agentDir)) return row(UPGRADE_CACHE_AREA, "", UPGRADE_NOT_FOUND);
      rmSync(agentDir, { recursive: true, force: true });
      return row(UPGRADE_CACHE_AREA, agentDir, UPGRADE_REMOVED);
    }
    case "config-mcp":
    case "mcp-entry":
    case "hooks+mcp":
    case "in-process": {
      const root = rootOrNull(adapter, env);
      return row(UPGRADE_CACHE_AREA, root ?? "", root === null ? UPGRADE_NOT_FOUND : UPGRADE_CACHE_BY_HAND);
    }
  }
}

// ---------------------------------------------------------------------------------- 3. config entries

interface OwnEntry {
  file: string;
  key: string;                         // top-level key whose value is rewritten
  shown: string;                       // key path shown in the area cell
  drop(value: unknown): unknown;       // the value without context-mode's own entry
  has(value: unknown): boolean;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function piSource(entry: unknown): unknown {
  return isObj(entry) ? entry[PI_PACKAGE_SOURCE_KEY] : entry;
}

// The own entries a host config file holds per agent: the same set mergeOwnEntries regenerates (D-M5-O1-4),
// here dropped (D-M5-U7-1). Agents with none (marketplace, extension, plugin hosts) get an empty list.
function ownEntries(agent: AgentId, env: NodeJS.ProcessEnv): OwnEntry[] {
  const home = requireHomeDir(env);
  const mcp = OWN_MCP_ENTRY[agent];
  if (mcp !== undefined) {
    // The own entry sits at key = [top, ...inner, own] (zcode: mcp.servers.context-mode, D-HF-ZCODE-SHAPE-1).
    const top = mcp.key[0];
    const inner = mcp.key.slice(1, -1);
    const own = mcp.key[mcp.key.length - 1];
    const holder = (v: unknown): unknown => inner.reduce<unknown>((cur, k) => (isObj(cur) ? cur[k] : undefined), v);
    const without = (v: unknown, path: readonly string[]): unknown => {
      const o = v as Record<string, unknown>;
      if (path.length === 0) return Object.fromEntries(Object.entries(o).filter(([k]) => k !== own));
      return { ...o, [path[0]]: without(o[path[0]], path.slice(1)) };
    };
    return [{
      file: ownMcpFileOf(agent, mcp.file, env, home),
      key: top,
      shown: mcp.key.join(V1_KEY_PATH_SEP),
      has: (v) => { const h = holder(v); return isObj(h) && Object.hasOwn(h, own); },
      drop: (v) => without(v, inner),
    }];
  }
  if (agent === "opencode") {
    return [{
      file: join(opencodeDirOf(env, home), OPENCODE_BASE_CONFIG_FILE), // D-WIN-OPENCODE-DIR-1
      key: OPENCODE_PLUGIN_KEY,
      shown: OPENCODE_PLUGIN_KEY,
      has: (v) => Array.isArray(v) && v.includes(OPENCODE_GIT_SPEC),
      drop: (v) => (v as unknown[]).filter((x) => x !== OPENCODE_GIT_SPEC),
    }];
  }
  if (agent === "pi") {
    const agentDir = piAgentDirOf(env, home); // Pi's own dir rule (#1035)
    return [{
      file: join(agentDir, SETTINGS_FILE),
      key: PI_PACKAGES_KEY,
      shown: PI_PACKAGES_KEY,
      has: (v) => Array.isArray(v) && v.some((x) => piSource(x) === PI_GIT_PACKAGE),
      drop: (v) => (v as unknown[]).filter((x) => piSource(x) !== PI_GIT_PACKAGE),
    }];
  }
  return [];
}

// Step 3: drop each own entry; every other key and value stays (host-config.ts writes only the edited span).
function removeOwnEntries(agent: AgentId, env: NodeJS.ProcessEnv): UpgradeChangeRow[] {
  const rows: UpgradeChangeRow[] = [];
  for (const entry of ownEntries(agent, env)) {
    const current = readHostConfig(agent, entry.file);
    if (current.text === "") continue;
    const value = hostConfigValueAt(parseHostConfig(agent, current.path, current.text, current.format), [entry.key]);
    if (!entry.has(value)) continue;
    writeHostConfigEdit(entry.file, current, { [entry.key]: entry.drop(value) });
    rows.push(row(current.path + UPGRADE_AREA_KEY_SEP + entry.shown, UPGRADE_OWN_ENTRY, UPGRADE_REMOVED));
  }
  return rows.length === 0 ? [row(UPGRADE_CONFIG_AREA, "", UPGRADE_NOT_FOUND)] : rows;
}

// ------------------------------------------------------------------------------------------- 4. data

// Step 4: this project's dir only, proven inside <DATA_ROOT>/projects by isInside (realpath components). The
// owners/ dir stays so every live owner still reads its stop marker; it exits and removes its own .pid (D-M5-U7-3).
function removeProjectData(configDir: string, projectKey: string): UpgradeChangeRow {
  const projects = join(configDir, PROJECTS_DIR_NAME);
  const dir = join(projects, projectKey);
  if (!existsSync(dir)) return row(UPGRADE_DATA_AREA, "", UPGRADE_NOT_FOUND);
  if (dir === projects || !isInside(projects, dir)) throw new CtxError("OUTSIDE_ROOT", { p: dir, root: projects });
  for (const name of readdirSync(dir)) {
    if (name !== OWNERS_DIR_NAME) rmSync(join(dir, name), { recursive: true, force: true });
  }
  return row(UPGRADE_DATA_AREA, dir, UPGRADE_DATA_DELETED);
}

/** impl/07 §6 Uninstall steps 1-5: stop, cache and own config entries always run (Q21); data only on confirmDelete. */
export function runUninstall(input: UninstallInput): UninstallResult {
  const configDir = resolveConfigDir(input.env);
  const stop = stopServers(configDir, input.project.projectKey);
  const rows = [stop.row, removeCache(input.adapter, input.env, configDir), ...removeOwnEntries(input.adapter.id, input.env)];
  rows.push(input.confirmDelete
    ? removeProjectData(configDir, input.project.projectKey)
    : row(UPGRADE_DATA_AREA, join(configDir, PROJECTS_DIR_NAME, input.project.projectKey), UPGRADE_DATA_KEPT));
  return { rows, stopped: stop.stopped };
}
