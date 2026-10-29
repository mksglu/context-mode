// src/setup/registry.ts
// ADR-0019 section 3: one check registry, built from src/adapters/table.ts, shared by setup, doctor and upgrade.
// Every write path is absolute and listed; every command is absolute node + absolute bundle file (never npx).
import path from "node:path";

import { ADAPTERS, getAdapter } from "../adapters/table.ts";
import { AGENT_HOME_DIR, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE, OPENCODE_BASE_CONFIG_FILE, OPENCODE_PLUGIN_PATH, OWN_MCP_ENTRY, SERVER_KEY, TOOL_ORDER } from "../core/contracts/constants.ts";
import type { AgentId, AdapterRow, HostConfigFormat } from "../core/contracts/types.ts";
import { claudeDirOf, copilotDirOf, kiroDirOf, opencodeDirOf, ownMcpFileOf } from "../core/project/config-dir.ts";
import { ownMcpValue } from "../core/ops/host-config.ts";
import { HOOK_SHAPES, type JsonObject } from "./hook-shapes.ts";

export const SERVER_BUNDLE = "server.mjs";
export const HOOK_BUNDLE = "hook.mjs";
export const AGENT_FLAG = "--agent";
export const STATE_DIR = ".context-mode";
export const LOCK_FILE = "setup.lock";
export const BACKUP_DIR = "backups";
const PLUGIN_ID = `${SERVER_KEY}@${SERVER_KEY}`;
const SKILLS_DIR_NAME = "skills";

// Routing-instruction files: setup never writes them, even if a row lists one by mistake (ADR-0019 section 3).
export const INSTRUCTION_FILES: readonly string[] = Object.freeze([
  "CLAUDE.md", "AGENTS.md", "AGENTS.override.md", "GEMINI.md", "QWEN.md", "copilot-instructions.md", "KIRO.md",
]);

export interface SetupContext { home: string; pkgDir: string; env: Record<string, string | undefined>; }

/** A config file setup edits itself: the exact diff is known before apply. */
export interface ConfigTarget {
  file: string; format: HostConfigFormat; key: readonly string[]; value: unknown;
  /** Sibling key paths the host needs set for the entry to load (zcode features.mcp, D-HF-ZCODE-SHAPE-1). */
  also?: [readonly string[], unknown][];
}
/** Every key path a config target writes: the entry, then its sibling keys. */
export function configEdits(c: ConfigTarget): [readonly string[], unknown][] { return [[c.key, c.value], ...(c.also ?? [])]; }

/** Host settings files that may hold v1 hook commands (S-V1). rewrite = setup owns the hooks (D4: absolute form);
 *  drop = the installed package ships its own hooks, so a v1 copy would run twice. */
export interface HookFile { file: string; mode: "rewrite" | "drop"; }

/** ADR-0020: the one hook channel setup writes. file = a host hook file under HOME (merged, user entries kept);
 *  plugin-list = an in-process plugin entry in a host config list (opencode); package = the installed package
 *  ships the hooks (claude-code, gemini, qwen, pi through its CLI install). */
export type HookInstall =
  | { kind: "file"; file: string; shape: JsonObject; command: string; trust?: string }
  | { kind: "plugin-list"; file: string; key: readonly string[]; entry: string }
  | { kind: "package"; via: string };

/** ADR-0020: the one skill channel. dir = setup writes <dir>/<name>/SKILL.md rendered with the agent's tool name
 *  prefix from the package's skills/; package = the installed package ships skills/ itself. */
export interface SkillFile { name: string; src: string; file: string; }
export type SkillInstall = { kind: "dir"; dir: string; files: SkillFile[]; prefixes: readonly string[] } | { kind: "package"; via: string };

export const COMMAND_SKILLS: readonly string[] = Object.freeze(["ctx-doctor", "ctx-stats", "ctx-upgrade"]);
export const SKILLS_DIR = "skills";
export const SKILL_FILE = "SKILL.md";
const CODEX_CONFIG_FILE = "config.toml";
const CODEX_HOME_ENV = "CODEX_HOME";
const CODEX_DIR = ".codex";
const COPILOT_DIR = ".copilot";
const KIRO_DIR = AGENT_HOME_DIR.kiro[0];
const OPENCODE_HOME_SEGS = AGENT_HOME_DIR.opencode;

/** D-N5-CODEX-HOME-1: a path under HOME as the agent reads it. Codex reads config.toml, hooks.json and skills/
 *  from $CODEX_HOME (default ~/.codex), so a ".codex/..." path moves under CODEX_HOME when it is set. */
function agentPath(ctx: SetupContext, id: AgentId, rel: string | readonly string[]): string {
  const segs = typeof rel === "string" ? rel.split("/") : [...rel];
  const codexHome = ctx.env[CODEX_HOME_ENV];
  if (id === "codex" && segs[0] === CODEX_DIR && codexHome !== undefined && codexHome !== "") return path.join(codexHome, ...segs.slice(1));
  // D-WIN-COPILOT-HOME-1: Copilot CLI only; VS Code's hook file also sits under .copilot/ but VS Code does not read COPILOT_HOME.
  if (id === "copilot-cli" && segs[0] === COPILOT_DIR) return path.join(copilotDirOf(ctx.env, ctx.home), ...segs.slice(1));
  // D-WIN-KIRO-HOME-1: Kiro V3 takes its global dir from $KIRO_HOME (absolute, not root/home/ancestor), else ~/.kiro.
  if (id === "kiro" && segs[0] === KIRO_DIR) return path.join(kiroDirOf(ctx.env, ctx.home), ...segs.slice(1));
  // D-WIN-OPENCODE-DIR-1: OpenCode's dir is $OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode, else ~/.config/opencode.
  if (id === "opencode" && segs[0] === OPENCODE_HOME_SEGS[0] && segs[1] === OPENCODE_HOME_SEGS[1]) return path.join(opencodeDirOf(ctx.env, ctx.home), ...segs.slice(2));
  return path.join(ctx.home, ...segs);
}

/** The skill text with every ctx tool name given the agent's tool name prefix (plain split/join, no regex).
 *  A skill dir shared by several agents names each agent's tool, joined by " or " (D-HQ-COPILOT-NAMES-2). */
export function renderSkill(text: string, prefix: string | readonly string[]): string {
  const prefixes = typeof prefix === "string" ? [prefix] : prefix;
  if (prefixes.length === 1 && prefixes[0] === "") return text;
  let out = text;
  for (const tool of TOOL_ORDER) out = out.split(tool).join(prefixes.map((p) => p + tool).join(SKILL_NAME_JOIN));
  return out;
}

const SKILL_NAME_JOIN = " or ";

/** Every distinct tool name prefix of the agents whose skill channel is this home dir, in table order. */
function skillDirPrefixes(dirPath: string): string[] {
  const out: string[] = [];
  for (const r of ADAPTERS) {
    if (r.skillChannel.kind === "home-dir" && r.skillChannel.path === dirPath && !out.includes(r.toolNamePrefix)) out.push(r.toolNamePrefix);
  }
  return out;
}

export interface HostCopy { host: string; bin: string; plugin: string; file: string; refresh: string[]; }

export interface CliPlan { bin: string; install: string[][]; remove: string[][]; input?: string; }

export interface CheckRow {
  id: AgentId;
  installMode: AdapterRow["installMode"];
  serverCommand: string[];
  hookCommand?: string[];
  config?: ConfigTarget;
  cli?: CliPlan;
  listCommand?: { bin: string; args: string[] };
  /** D-US-1: the host runs a copy of the package; `file` records the copied version, `refresh` (run with `bin`) renews it. */
  copy?: HostCopy;
  hookFiles: HookFile[];
  hookInstall: HookInstall;
  skillInstall: SkillInstall;
  /** ADR-0020 hook-runs: the hook bundle for this agent, also for in-process agents (doctor sample event). */
  hookRunCommand: string[];
  allowedWrites: string[];
  goldenPayload: Record<string, unknown>;
  /** D-NI-CODEX-DOCTOR-1 (ADR-0023): the host's own plugin install. When `bin args` lists `plugin` as enabled, the
   *  plugin ships the server, hooks (hooksVia) and skills (skillsVia), so setup writes nothing and doctor checks that. */
  nativePlugin?: NativePlugin;
}

/** list = one table row per plugin with an "enabled" word (codex plugin list); extension = one block per extension, a
 *  "<mark> <name> (<version>)" header line then an indented "Enabled (User): true|false" line (qwen / gemini
 *  extensions list). enable = the host command that turns a listed but disabled install back on (doctor names it). */
export interface NativePlugin {
  bin: string; args: string[]; plugin: string; hooksVia: string; skillsVia: string;
  format: "table" | "extension"; enable?: string[];
  /** D-NI-CODEX-TRUST-1: the host runs a plugin hook only once its config trusts it (Codex hooks/list trustStatus). */
  hookTrust?: boolean;
}

const EXTENSION_LIST = ["extensions", "list"];
/** D-NI-EXT-DOCTOR-1: `qwen|gemini extensions install <source>` copies the package as an extension: the hooks are the
 *  row's package hook file, the skills are the package skills/ dir (qwen and gemini both load <extension>/skills). */
function extensionPlugin(bin: string, id: AgentId): NativePlugin {
  return { bin, args: EXTENSION_LIST, plugin: SERVER_KEY, hooksVia: getAdapter(id).hookChannel.path, skillsVia: SKILLS_DIR_NAME,
    format: "extension", enable: ["extensions", "enable", SERVER_KEY] };
}

const NATIVE_PLUGIN: Partial<Record<AgentId, NativePlugin>> = {
  codex: { bin: "codex", args: ["plugin", "list"], plugin: PLUGIN_ID, hooksVia: ".codex-plugin", skillsVia: path.join("codex", SKILLS_DIR_NAME), format: "table", hookTrust: true },
  qwen: extensionPlugin("qwen", "qwen"),
  gemini: extensionPlugin("gemini", "gemini"),
};

function serverCmd(ctx: SetupContext, id: AgentId): string[] {
  return [process.execPath, path.join(ctx.pkgDir, SERVER_BUNDLE), AGENT_FLAG, id];
}

/** D4: the one v2 hook command string (quoted, so paths with spaces survive the host shell). */
export function hookCommandString(row: CheckRow): string {
  const [node, file, flag, id] = row.hookCommand ?? [];
  return `"${node}" "${file}" ${flag} ${id}`;
}

function golden(row: AdapterRow, home: string): Record<string, unknown> {
  const shell = row.nativeTools.shell?.[0];
  return {
    hook_event_name: row.eventMap.PreToolUse ?? "PreToolUse",
    session_id: "context-mode-setup-verify",
    cwd: home,
    tool_name: shell ?? "ctx_execute",
    tool_input: { command: "true" },
  };
}

function configFor(ctx: SetupContext, id: AgentId): ConfigTarget | undefined {
  const [node, server, flag, agent] = serverCmd(ctx, id);
  const own = OWN_MCP_ENTRY[id];
  if (own) {
    const file = id === "vscode" ? ownMcpFileOf(id, own.file, ctx.env, ctx.home) : agentPath(ctx, id, own.file); // D-WIN-VSCODE-MCP-1
    const format: HostConfigFormat = file.endsWith(".toml") ? "toml" : id === "vscode" ? "jsonc" : "json";
    const also = own.also?.map(([k, v]): [readonly string[], unknown] => [k, v]);
    return { file, format, key: own.key, value: ownMcpValue(id, node, server), ...(also ? { also } : {}) };
  }
  if (id === "opencode") { // docs/install/opencode.md: a local MCP entry in opencode.json
    return {
      file: path.join(opencodeDirOf(ctx.env, ctx.home), OPENCODE_BASE_CONFIG_FILE), format: "jsonc", key: ["mcp", SERVER_KEY],
      value: { type: "local", command: [node, server, flag, agent], enabled: true },
    };
  }
  return undefined;
}

function cliFor(ctx: SetupContext, id: AgentId): CliPlan | undefined {
  const s = serverCmd(ctx, id);
  switch (id) {
    case "claude-code":
      return { bin: "claude", install: [["plugin", "marketplace", "add", ctx.pkgDir], ["plugin", "install", PLUGIN_ID]], remove: [["plugin", "uninstall", PLUGIN_ID]] };
    // D-INST-1: `extensions install <dir>` waits on a trust prompt even with --consent; `link` does not (ADR-0019 section 3).
    // Qwen has no consent flag, so its risk prompt gets `y` on stdin.
    case "gemini": return { bin: "gemini", install: [["extensions", "link", ctx.pkgDir, "--consent"]], remove: [["extensions", "uninstall", SERVER_KEY]] };
    case "qwen": return { bin: "qwen", install: [["extensions", "link", ctx.pkgDir]], remove: [["extensions", "uninstall", SERVER_KEY]], input: "y\n" };
    case "copilot-cli": return { bin: "copilot", install: [["mcp", "add", SERVER_KEY, "--", ...s]], remove: [["mcp", "remove", SERVER_KEY]] };
    case "pi": return { bin: "pi", install: [["install", ctx.pkgDir]], remove: [["remove", ctx.pkgDir]] };
    default: return undefined;
  }
}

/** D-US-1: Claude Code copies the plugin to ~/.claude/plugins/cache/<marketplace>/context-mode/<version> and records the
 *  version in installed_plugins.json; npm i -g does not touch that copy, `claude plugin update` renews it. */
function copyFor(ctx: SetupContext, id: AgentId): HostCopy | undefined {
  if (id !== "claude-code") return undefined;
  const file = path.join(claudeDirOf(ctx.env, ctx.home), HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE);
  return { host: "Claude Code", bin: "claude", plugin: PLUGIN_ID, file, refresh: ["plugin", "update", PLUGIN_ID] };
}

const LIST: Partial<Record<AgentId, { bin: string; args: string[] }>> = {
  "claude-code": { bin: "claude", args: ["plugin", "list"] },
  codex: { bin: "codex", args: ["mcp", "list"] },
  gemini: { bin: "gemini", args: ["extensions", "list"] },
  qwen: { bin: "qwen", args: ["extensions", "list"] },
  "copilot-cli": { bin: "copilot", args: ["mcp", "list"] },
  pi: { bin: "pi", args: ["list"] },
  // D-HF-OPENCODE-LIST-1: --pure skips external plugins, so a fresh HOME does not wait on the @opencode-ai/plugin install.
  opencode: { bin: "opencode", args: ["mcp", "list", "--pure"] },
};

function hookFilesFor(ctx: SetupContext, id: AgentId): HookFile[] {
  const home = ctx.home;
  switch (id) {
    case "codex": return [{ file: agentPath(ctx, id, [CODEX_DIR, "hooks.json"]), mode: "rewrite" }];
    case "copilot-cli": return [{ file: agentPath(ctx, id, [COPILOT_DIR, "hooks", "context-mode.json"]), mode: "rewrite" }];
    case "claude-code": return [{ file: path.join(claudeDirOf(ctx.env, home), "settings.json"), mode: "drop" }];
    case "gemini": return [{ file: path.join(home, ".gemini", "settings.json"), mode: "drop" }];
    case "qwen": return [{ file: path.join(home, ".qwen", "settings.json"), mode: "drop" }];
    default: return [];
  }
}

function hookInstallFor(ctx: SetupContext, row: AdapterRow, command: string): HookInstall {
  const ch = row.hookChannel;
  if (ch.kind === "home-file") {
    const shape = HOOK_SHAPES[row.id];
    if (!shape) throw new Error(`setup: ${row.id} has a home-file hook channel and no hook shape`);
    const file = agentPath(ctx, row.id, ch.path);
    // Codex 0.164.0 runs a hooks.json hook only once config.toml trusts it (D-HA-CODEX-TRUST-1).
    if (row.id === "codex") return { kind: "file", file, shape: shape(row, command), command, trust: path.join(path.dirname(file), CODEX_CONFIG_FILE) };
    return { kind: "file", file, shape: shape(row, command), command };
  }
  if (row.id === "opencode") {
    return { kind: "plugin-list", file: path.join(opencodeDirOf(ctx.env, ctx.home), OPENCODE_BASE_CONFIG_FILE), key: ["plugin"],
      entry: path.join(ctx.pkgDir, ...OPENCODE_PLUGIN_PATH) }; // OpenCode 1.19.4 turns an absolute or drive-letter path into a file URL itself (D-WIN-OCENTRY-1)
  }
  return { kind: "package", via: ch.path };
}

/** D-N5-SKILL-1: the shipped skill dir that holds the bare ctx_* names (a package channel with prefix ""). The
 *  package skills/ dir is Gemini's rendered copy (D-HQ-SKILLS-1), so rendering it again doubled the prefix. */
function bareSkillDir(): string {
  const row = ADAPTERS.find((r) => r.skillChannel.kind === "package" && r.toolNamePrefix === "");
  if (row === undefined) throw new Error("setup: no package skill channel holds the bare tool names");
  return row.skillChannel.path;
}

function skillInstallFor(ctx: SetupContext, row: AdapterRow): SkillInstall {
  const ch = row.skillChannel;
  if (ch.kind === "package") return { kind: "package", via: ch.path };
  const dir = agentPath(ctx, row.id, ch.path);
  const src = path.join(ctx.pkgDir, bareSkillDir());
  return { kind: "dir", dir, prefixes: skillDirPrefixes(ch.path), files: COMMAND_SKILLS.map((name) => ({
    name, src: path.join(src, name, SKILL_FILE), file: path.join(dir, name, SKILL_FILE) })) };
}

export function buildRegistry(ctx: SetupContext): CheckRow[] {
  return ADAPTERS.map((row): CheckRow => {
    const id = row.id;
    const config = configFor(ctx, id);
    const hookFiles = hookFilesFor(ctx, id);
    const hookCommand = [process.execPath, path.join(ctx.pkgDir, HOOK_BUNDLE), AGENT_FLAG, id];
    const command = `"${hookCommand[0]}" "${hookCommand[1]}" ${AGENT_FLAG} ${id}`;
    const hookInstall = hookInstallFor(ctx, getAdapter(id), command);
    const skillInstall = skillInstallFor(ctx, row);
    const writes = [
      ...(config ? [config.file] : []), ...hookFiles.map((h) => h.file),
      ...(hookInstall.kind === "package" ? [] : [hookInstall.file]),
      ...(hookInstall.kind === "file" && hookInstall.trust ? [hookInstall.trust] : []),
      ...(skillInstall.kind === "dir" ? skillInstall.files.map((f) => f.file) : []),
    ];
    const out: CheckRow = {
      id, installMode: row.installMode, serverCommand: serverCmd(ctx, id), config, cli: cliFor(ctx, id),
      listCommand: LIST[id], hookFiles, hookInstall, skillInstall, hookRunCommand: hookCommand,
      allowedWrites: [...new Set(writes.map((f) => path.resolve(f)))],
      goldenPayload: golden(row, ctx.home),
    };
    if (row.installMode !== "in-process") out.hookCommand = hookCommand;
    const copy = copyFor(ctx, id);
    if (copy) out.copy = copy;
    const native = NATIVE_PLUGIN[id];
    if (native) out.nativePlugin = native;
    return out;
  });
}

/** Allowlist guard: only the row's listed files, never an instruction file. */
export function assertWritable(row: CheckRow, file: string): void {
  const abs = path.resolve(file);
  if (INSTRUCTION_FILES.includes(path.basename(abs)) || !row.allowedWrites.includes(abs)) {
    throw new Error(`setup: write to ${abs} is not allowed for ${row.id}`);
  }
}
