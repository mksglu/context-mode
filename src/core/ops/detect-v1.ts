// impl/07 §3, ADR-0011 "v1 cleanup", impl/15. DEVIATIONS D-M5-O2-1..5.
// detectV1: one scan per agent from the ADR-0011 table plus the All row; one V1Finding per match.
// Pure report: reads files, never writes, never deletes, never throws.
import { existsSync, opendirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentId } from "../contracts/agents.ts";
import type { V1Finding } from "../contracts/types.ts";
import { hostConfigValueAt, isNodeCommand, parseHostConfig, tomlTableSpans } from "./host-config.ts";
import { hostText } from "./host-text.ts";
import {
  AGENT_HOME_DIR, CLAUDE_USER_CONFIG_FILE, CONFIG_JSON_FILE, CONFIG_TOML_FILE, DATA_ROOT, GITHUB_DIR_NAME,
  HOOKS_JSON_FILE, HOOKS_KEY, KIRO_AGENT_FILE, KIRO_AGENT_FILE_EXT, KIRO_AGENT_NAME_KEY, KIRO_AGENTS_DIR,
  KIRO_STEERING_FILE, MCP_SERVERS_KEY, OPENCODE_CONFIG_FILES, OPENCODE_PLUGIN_KEY,
  OWN_HOOK_FILE, PI_AGENT_DIR, PI_PACKAGE_SOURCE_KEY, PI_PACKAGES_KEY, SERVER_KEY, SETTINGS_FILE, STATUS_LINE_KEY,
  V1_BIN_COMMAND, V1_CACHE_HEAL_EXTS, V1_CACHE_HEAL_NAME, V1_CODEX_HOOK_COMMAND, V1_CODEX_HOOKS_DIR,
  V1_DATA_DIR_NAME, V1_DATA_ROOT_ENTRIES, V1_HOOK_COMMAND, V1_HOOKS_DIR_NAME, V1_OPENCODE_PLUGIN_SPEC,
  V1_PATH_SEPS, V1_PI_PACKAGE, V1_REASON, V1_SCRIPT_EXT, V1_SCRIPT_NAMES, V1_SESSIONS_DIR_NAME,
  V1_STATUSLINE_COMMAND, V1_TMP_PREFIX, V1_TOML_SECTION_ROOT, SERVER_ENTRY_FILE, MCP_ARGS_FIELD, MCP_COMMAND_FIELD, VSCODE_DIR_NAME, VSCODE_MCP_FILE,
  VSCODE_MCP_SERVERS_KEY, ZCODE_CLI_DIR, ZCODE_EVENTS_KEY,
} from "../contracts/constants.ts";

type Obj = Record<string, unknown>;
interface Cmd { path: string; command: string; }

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const keyPath = (...parts: (string | number)[]): string => parts.join(".");
const finding = (file: string, path: string, reason: string): V1Finding => ({ file, path, reason });

/** JSONC → JSON: drops comments and trailing commas outside strings (character scan, no regex). */
function stripJsonc(text: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && " \t\r\n".includes(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

/** A missing or unparseable file is not a finding (impl/07 §3 Errors: this function cannot fail). */
function readJson(file: string): unknown {
  try {
    return JSON.parse(stripJsonc(hostText(readFileSync(file, "utf8"))));
  } catch {
    return undefined;
  }
}

function readText(file: string): string {
  try {
    return hostText(readFileSync(file, "utf8"));
  } catch {
    return "";
  }
}

/** The standard tables of a TOML file; none when it is missing or not valid TOML (same reader as setup, D-TOML-PARSER-1). */
function readTomlTables(file: string): ReturnType<typeof tomlTableSpans> {
  try {
    return tomlTableSpans(readText(file));
  } catch {
    return [];
  }
}

function readTomlValue(file: string): unknown {
  try {
    return parseHostConfig("codex", file, readText(file), "toml");
  } catch {
    return {};
  }
}

/** The v2 Codex MCP table: command is node, args[0] is the package server bundle (D-DOC-RT-1). */
function isV2McpTable(v: unknown): boolean {
  if (!isObj(v) || !isNodeCommand(v[MCP_COMMAND_FIELD])) return false;
  const first = Array.isArray(v[MCP_ARGS_FIELD]) ? (v[MCP_ARGS_FIELD] as unknown[])[0] : undefined;
  if (typeof first !== "string") return false;
  let at = -1;
  for (const sep of V1_PATH_SEPS) at = Math.max(at, first.lastIndexOf(sep));
  return first.slice(at + 1) === SERVER_ENTRY_FILE;
}

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const commandOf = (v: unknown): string | null => (isObj(v) && typeof v.command === "string" ? v.command : null);

/** Nested shape (Claude Code, Qwen, Gemini, Codex, ZCode hooks.json): hooks.<Event>[i].hooks[j].command. */
function nestedCommands(doc: unknown): Cmd[] {
  const out: Cmd[] = [];
  if (!isObj(doc) || !isObj(doc[HOOKS_KEY])) return out;
  for (const [event, groups] of Object.entries(doc[HOOKS_KEY] as Obj)) {
    listOf(groups).forEach((group, i) => {
      if (!isObj(group)) return;
      listOf(group[HOOKS_KEY]).forEach((inner, j) => {
        const command = commandOf(inner);
        if (command !== null) out.push({ path: keyPath(HOOKS_KEY, event, i, HOOKS_KEY, j), command });
      });
    });
  }
  return out;
}

/** Flat shape (Kiro, Copilot CLI/VS Code hook files, ZCode config.json events): <events>.<Event>[i].command. */
function flatCommands(events: unknown, prefix: string[]): Cmd[] {
  const out: Cmd[] = [];
  if (!isObj(events)) return out;
  for (const [event, entries] of Object.entries(events)) {
    listOf(entries).forEach((entry, i) => {
      const command = commandOf(entry);
      if (command !== null) out.push({ path: keyPath(...prefix, event, i), command });
    });
  }
  return out;
}

/** ADR-0011 Claude Code rule: contains context-mode and (a v1 script name or "context-mode hook"). */
const isV1Hook = (cmd: string): boolean =>
  cmd.includes(SERVER_KEY) && (V1_SCRIPT_NAMES.some((name) => cmd.includes(name)) || cmd.includes(V1_HOOK_COMMAND));

const isCodexScript = (cmd: string): boolean =>
  cmd.includes(V1_SCRIPT_EXT) && V1_PATH_SEPS.some((sep) => cmd.includes(V1_CODEX_HOOKS_DIR.join(sep) + sep));

function dataDir(dir: string, reason: string, out: V1Finding[]): void {
  if (existsSync(dir)) out.push(finding(dir, "", reason));
}

function mcpEntry(file: string, doc: unknown, out: V1Finding[]): void {
  if (isObj(doc) && isObj(doc[MCP_SERVERS_KEY]) && Object.hasOwn(doc[MCP_SERVERS_KEY] as Obj, SERVER_KEY)) {
    out.push(finding(file, keyPath(MCP_SERVERS_KEY, SERVER_KEY), V1_REASON.mcpEntry));
  }
}

/** Claude Code and Qwen settings.json (ADR-0011: Qwen "same rule as Claude Code"). */
function claudeShapeSettings(agentHome: string, out: V1Finding[]): void {
  const file = join(agentHome, SETTINGS_FILE);
  const doc = readJson(file);
  for (const c of nestedCommands(doc)) {
    if (c.command.includes(V1_CACHE_HEAL_NAME)) out.push(finding(file, c.path, V1_REASON.cacheHealHook));
    else if (isV1Hook(c.command)) out.push(finding(file, c.path, V1_REASON.hook));
  }
  const status = isObj(doc) ? commandOf(doc[STATUS_LINE_KEY]) : null;
  if (status !== null && status.includes(V1_STATUSLINE_COMMAND)) {
    out.push(finding(file, STATUS_LINE_KEY, V1_REASON.statusLine));
  }
  mcpEntry(file, doc, out); // D-M5-O2-2: settings.json mcpServers too
}

/** Whole hook file (Copilot CLI, VS Code): v1 when one of its commands runs the v1 bin (D-M5-O2-3). */
function v1HookFile(file: string, out: V1Finding[]): void {
  const doc = readJson(file);
  const cmds = isObj(doc) ? flatCommands(doc[HOOKS_KEY], [HOOKS_KEY]) : [];
  if (cmds.some((c) => c.command.includes(V1_HOOK_COMMAND))) out.push(finding(file, "", V1_REASON.hookFile));
}

function scanClaudeCode(home: string, agentHome: string, out: V1Finding[]): void {
  claudeShapeSettings(agentHome, out);
  for (const ext of V1_CACHE_HEAL_EXTS) {
    const file = join(agentHome, V1_HOOKS_DIR_NAME, V1_CACHE_HEAL_NAME + ext);
    if (existsSync(file)) out.push(finding(file, "", V1_REASON.cacheHealFile));
  }
  const userFile = join(home, CLAUDE_USER_CONFIG_FILE);
  mcpEntry(userFile, readJson(userFile), out);
  dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}

function scanCodex(agentHome: string, out: V1Finding[]): void {
  const hooksFile = join(agentHome, HOOKS_JSON_FILE);
  for (const c of nestedCommands(readJson(hooksFile))) {
    if (c.command.includes(V1_CODEX_HOOK_COMMAND) || isCodexScript(c.command)) {
      out.push(finding(hooksFile, c.path, V1_REASON.codexHook));
    }
  }
  const tomlFile = join(agentHome, CONFIG_TOML_FILE);
  const config = readTomlValue(tomlFile);
  for (const span of readTomlTables(tomlFile)) { // real tables only: a header-looking line inside a multiline string is not one
    if (span.path[0] !== V1_TOML_SECTION_ROOT || span.path[1] !== SERVER_KEY) continue; // sibling servers (context-mode-x) are not ours
    // D-DOC-RT-1: v2 setup writes [mcp_servers.context-mode] too. It is v2 when it runs node on our server bundle; any
    // sub-table (v1 [..tools.ctx_*]) or any other command (v1 `context-mode` bin) is the old section.
    if (span.path.length === 2 && isV2McpTable(hostConfigValueAt(config, span.path))) continue;
    out.push(finding(tomlFile, span.header.trim(), V1_REASON.codexToml));
  }
  dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}

function scanGemini(agentHome: string, out: V1Finding[]): void {
  const file = join(agentHome, SETTINGS_FILE);
  for (const c of nestedCommands(readJson(file))) {
    if (c.command.includes(SERVER_KEY)) out.push(finding(file, c.path, V1_REASON.hook));
  }
  dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDirShared, out);
}

function scanVscode(agentHome: string, project: string | undefined, out: V1Finding[]): void {
  if (project !== undefined) {
    v1HookFile(join(project, GITHUB_DIR_NAME, V1_HOOKS_DIR_NAME, OWN_HOOK_FILE), out);
    const mcpFile = join(project, VSCODE_DIR_NAME, VSCODE_MCP_FILE);
    const doc = readJson(mcpFile);
    const servers = isObj(doc) && isObj(doc[VSCODE_MCP_SERVERS_KEY]) ? (doc[VSCODE_MCP_SERVERS_KEY] as Obj) : {};
    const entry = Object.hasOwn(servers, SERVER_KEY) ? servers[SERVER_KEY] : undefined;
    if (isObj(entry) && (entry.command === V1_BIN_COMMAND || listOf(entry.args).some((a) => a === V1_BIN_COMMAND))) {
      out.push(finding(mcpFile, keyPath(VSCODE_MCP_SERVERS_KEY, SERVER_KEY), V1_REASON.vscodeMcp));
    }
    dataDir(join(project, GITHUB_DIR_NAME, V1_DATA_DIR_NAME, V1_SESSIONS_DIR_NAME), V1_REASON.dataDir, out);
  }
  dataDir(join(agentHome, V1_DATA_DIR_NAME, V1_SESSIONS_DIR_NAME), V1_REASON.dataDir, out);
}

/** Sorted *.json names in dir; a missing or unreadable dir has none. */
function jsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(KIRO_AGENT_FILE_EXT)).sort();
  } catch {
    return [];
  }
}

/** A37: every agents/*.json whose top-level name is context-mode is a v1 file (removed whole, shown in the change
 *  table); default.json keeps the flat hook-entry scan; KIRO.md steering docs are flagged report only. */
function scanKiro(agentHome: string, project: string | undefined, out: V1Finding[]): void {
  const agentsDir = join(agentHome, KIRO_AGENTS_DIR);
  const defaultFile = join(agentHome, ...KIRO_AGENT_FILE);
  for (const name of jsonFiles(agentsDir)) {
    const file = join(agentsDir, name);
    const doc = readJson(file);
    if (isObj(doc) && doc[KIRO_AGENT_NAME_KEY] === SERVER_KEY) { out.push(finding(file, "", V1_REASON.kiroAgentFile)); continue; }
    if (file !== defaultFile) continue;
    for (const c of isObj(doc) ? flatCommands(doc[HOOKS_KEY], [HOOKS_KEY]) : []) {
      if (isV1Hook(c.command)) out.push(finding(file, c.path, V1_REASON.kiroHook));
    }
  }
  const steeringDocs = [join(agentHome, ...KIRO_STEERING_FILE)];
  if (project !== undefined) steeringDocs.push(join(project, ...AGENT_HOME_DIR.kiro, ...KIRO_STEERING_FILE));
  for (const file of steeringDocs) {
    if (existsSync(file)) out.push(finding(file, "", V1_REASON.kiroSteering));
  }
  dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}

function scanPi(piAgentDir: string, agentHome: string, out: V1Finding[]): void { // agentHome: data dir
  const file = join(piAgentDir, SETTINGS_FILE);
  const doc = readJson(file);
  listOf(isObj(doc) ? doc[PI_PACKAGES_KEY] : undefined).forEach((pkg, i) => {
    const spec = isObj(pkg) ? pkg[PI_PACKAGE_SOURCE_KEY] : pkg;
    if (spec === V1_PI_PACKAGE) out.push(finding(file, keyPath(PI_PACKAGES_KEY, i), V1_REASON.piNpm));
  });
  dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}

function scanOpencode(agentHome: string, out: V1Finding[]): void {
  for (const name of OPENCODE_CONFIG_FILES) {
    const file = join(agentHome, name);
    const doc = readJson(file);
    if (!isObj(doc) || !Array.isArray(doc[OPENCODE_PLUGIN_KEY])) continue;
    (doc[OPENCODE_PLUGIN_KEY] as unknown[]).forEach((spec, i) => {
      if (spec === V1_OPENCODE_PLUGIN_SPEC) out.push(finding(file, keyPath(OPENCODE_PLUGIN_KEY, i), V1_REASON.opencodePlugin));
    });
    return; // ADR-0011: the first config found with .plugin[]
  }
}

function scanZcode(agentHome: string, out: V1Finding[]): void {
  const configFile = join(agentHome, ZCODE_CLI_DIR, CONFIG_JSON_FILE);
  const config = readJson(configFile);
  const events = isObj(config) && isObj(config[HOOKS_KEY]) ? (config[HOOKS_KEY] as Obj)[ZCODE_EVENTS_KEY] : undefined;
  for (const c of flatCommands(events, [HOOKS_KEY, ZCODE_EVENTS_KEY])) {
    if (c.command.includes(V1_HOOK_COMMAND)) out.push(finding(configFile, c.path, V1_REASON.zcodeHook));
  }
  const hooksFile = join(agentHome, ZCODE_CLI_DIR, HOOKS_JSON_FILE);
  for (const c of nestedCommands(readJson(hooksFile))) {
    if (c.command.includes(V1_HOOK_COMMAND)) out.push(finding(hooksFile, c.path, V1_REASON.zcodeHook));
  }
}

/** Name of the first <os tmp>/context-mode-* entry, or null; stops at the first match. */
function firstTmpMatch(dir: string): string | null {
  let handle;
  try {
    handle = opendirSync(dir);
  } catch {
    return null;
  }
  try {
    for (let e = handle.readSync(); e !== null; e = handle.readSync()) {
      if (e.name.startsWith(V1_TMP_PREFIX)) return e.name;
    }
    return null;
  } catch {
    return null;
  } finally {
    handle.closeSync();
  }
}

/** ADR-0011 All row: v1 content under ~/.context-mode/ (D-M5-O2-4) and context-mode-* temp files (one finding). */
function scanAll(home: string, tmp: string, out: V1Finding[]): void {
  const root = join(home, DATA_ROOT.slice(1)); // DATA_ROOT is "~" + "/.context-mode" (same expansion as config-dir.ts)
  for (const name of V1_DATA_ROOT_ENTRIES) dataDir(join(root, name), V1_REASON.dataRoot, out);
  if (firstTmpMatch(tmp) !== null) out.push(finding(tmp, V1_TMP_PREFIX + "*", V1_REASON.tmpFile));
}

/** Optional roots the caller resolves from its env (D-M5-O2-1); each has the default named beside it. */
export interface V1Scope {
  project?: string; // VS Code project-scope rows, Kiro <project>/.kiro/steering/KIRO.md; none → home only
  piAgentDir?: string; // env PI_CODING_AGENT_DIR (#1035); none → <home>/.pi/agent
  claudeDir?: string; // env CLAUDE_CONFIG_DIR (D-WF-CC-CONFIG-1); none → <home>/.claude
  copilotDir?: string; // env COPILOT_HOME (D-WIN-COPILOT-HOME-1); none → <home>/.copilot
  kiroDir?: string; // env KIRO_HOME (D-WIN-KIRO-HOME-1); none → <home>/.kiro
  codexDir?: string; // env CODEX_HOME (D-N6-CODEX-HOME-2); none → <home>/.codex
  opencodeDir?: string; // env OPENCODE_CONFIG_DIR / XDG_CONFIG_HOME (D-WIN-OPENCODE-DIR-1); none → <home>/.config/opencode
  tmp?: string; // none → os.tmpdir()
}

/** impl/07 §3. `home` is the user's home dir ($HOME). Returns [] when no v1 footprint is found. */
export function detectV1(agent: AgentId, home: string, scope: V1Scope = {}): V1Finding[] {
  const out: V1Finding[] = [];
  const project = scope.project;
  const agentHome = agent === "claude-code" && scope.claudeDir !== undefined ? scope.claudeDir
    : agent === "codex" && scope.codexDir !== undefined ? scope.codexDir
    : agent === "copilot-cli" && scope.copilotDir !== undefined ? scope.copilotDir
    : agent === "kiro" && scope.kiroDir !== undefined ? scope.kiroDir
    : agent === "opencode" && scope.opencodeDir !== undefined ? scope.opencodeDir : join(home, ...AGENT_HOME_DIR[agent]);
  switch (agent) {
    case "claude-code": scanClaudeCode(home, agentHome, out); break;
    case "codex": scanCodex(agentHome, out); break;
    case "gemini": scanGemini(agentHome, out); break;
    case "qwen":
      claudeShapeSettings(agentHome, out);
      dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
      break;
    case "copilot-cli":
      v1HookFile(join(agentHome, V1_HOOKS_DIR_NAME, OWN_HOOK_FILE), out);
      dataDir(join(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
      break;
    case "vscode": scanVscode(agentHome, project, out); break;
    case "kiro": scanKiro(agentHome, project, out); break;
    case "pi": scanPi(scope.piAgentDir !== undefined && scope.piAgentDir !== "" ? scope.piAgentDir : join(agentHome, PI_AGENT_DIR), agentHome, out); break; // D-WIN-PIDIR-1: empty is unset
    case "opencode": scanOpencode(agentHome, out); break;
    case "zcode": scanZcode(agentHome, out); break;
  }
  scanAll(home, scope.tmp ?? tmpdir(), out);
  return out;
}
