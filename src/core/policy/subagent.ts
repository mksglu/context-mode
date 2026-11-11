// impl/08 §5 (case A/B/C pick, toolSet resolution), Assumption B4; ADR-0016 "How the subagent's tools are
// known"; DECISIONS-r3 Q23; DEVIATIONS D-M3-E3-1..4. No regex: frontmatter is read line by line.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { readFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { join } from "node:path";
import { hostText } from "../ops/host-text.ts";
import {
  AGENT_FILE_EXT, AGENTS_DIR_NAME, FRONTMATTER_DISALLOWED_KEY, FRONTMATTER_FENCE, FRONTMATTER_TOOLS_KEY,
  GEMINI_MCP_PREFIX, GEMINI_NAME_EXTRA_CHARS, HOST_CONFIG_DIR_NAME, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE,
  MCP_NAME_JOIN, MCP_SERVER_TOOL_PREFIX, PLUGIN_AGENT_SEPARATOR, PLUGIN_KEY_SEPARATOR, TOOL_ORDER,
} from "../contracts/constants.ts";
import type { AdapterRow, CanonicalHookEvent } from "../contracts/types.ts";
import { getAdapter } from "../../adapters/table.ts";
import { claudeDirOf, homeDirOf } from "../project/config-dir.ts";

/** One agent definition from `--agents` JSON (Claude Code CLI shape). */
export interface CliAgentDef { tools?: string[]; disallowedTools?: string[]; }

/** Where the caller (hooks) points the resolver. Each field is one named source, no lookup chain. */
export interface ToolSetSources {
  projectDir: string;                        // project agents: <projectDir>/.claude/agents/<type>.md
  env: NodeJS.ProcessEnv;                    // user agents + plugin agents under the OS home var
  cliAgents?: Record<string, CliAgentDef>;   // `--agents` JSON, last source
  manifestTools?: string[];                  // in-process hosts (OpenCode 2): the spawn-time plugin manifest list
}

type AgentDef = { tools: string[] | null; disallowed: string[] };

/** Q23: presence of `agentId` alone marks a subagent call; `agentType` never does. */
export function isSubagentCall(ev: CanonicalHookEvent): boolean {
  return ev.agentId !== undefined && ev.agentId !== "";
}

/** §5.1. B4: `toolSet === null` is always "C". */
export function pickSubagentCase(ev: CanonicalHookEvent, toolSet: string[] | null): "A" | "B" | "C" {
  if (toolSet === null) return "C";
  const row = getAdapter(ev.agent);
  const have = new Set(toolSet);
  for (const t of TOOL_ORDER) if (have.has(row.toolNamePrefix + t)) return "A";
  for (const s of row.nativeTools.shell) if (have.has(s)) return "B";
  return "C";
}

/** §5.2. `null` = no source defines this agent type (incl. built-in types before LV8); never throws. */
export function toolSetForAgentType(ev: CanonicalHookEvent, src: ToolSetSources): string[] | null {
  if (!isSubagentCall(ev)) return null; // step 1: the caller runs the main-session path instead
  const row = getAdapter(ev.agent);
  if (src.manifestTools !== undefined) return unique(src.manifestTools.map((n) => norm(row, n)));
  const type = ev.agentType ?? "";
  const def = findDef(type, src);
  if (def === null) return null; // step 3
  const tools = (def.tools ?? allKnownToolNames(row)).map((n) => norm(row, n));
  const deny = def.disallowed.map((n) => norm(row, n));
  return unique(tools.filter((n) => !deny.some((d) => denies(d, n))));
}

/** Gemini `generateValidName()` shape: "mcp_" + server + "_" + tool, chars outside [A-Za-z0-9_-.:] -> "_". */
export function geminiToolName(server: string, tool: string): string {
  return geminiValid(GEMINI_MCP_PREFIX + server + "_" + tool);
}

// ---------- sources (step 2: first source that defines <type> wins, no merge) ----------

function findDef(type: string, src: ToolSetSources): AgentDef | null {
  if (!safeType(type)) return null;
  const home = homeDir(src.env);
  const plugin = type.indexOf(PLUGIN_AGENT_SEPARATOR) >= 0;
  if (!plugin) {
    const p = readAgentFile(join(src.projectDir, HOST_CONFIG_DIR_NAME, AGENTS_DIR_NAME, type + AGENT_FILE_EXT));
    if (p !== null) return p;
    if (home !== null) {
      const u = readAgentFile(join(claudeDirOf(src.env, home), AGENTS_DIR_NAME, type + AGENT_FILE_EXT));
      if (u !== null) return u;
    }
  } else if (home !== null) {
    const pl = readPluginAgent(claudeDirOf(src.env, home), type);
    if (pl !== null) return pl;
  }
  const cli = src.cliAgents;
  if (cli !== undefined && Object.prototype.hasOwnProperty.call(cli, type)) {
    const d = cli[type];
    return { tools: Array.isArray(d.tools) ? d.tools : null, disallowed: Array.isArray(d.disallowedTools) ? d.disallowedTools : [] };
  }
  return null;
}

// A type name is a file stem: no path separator, no dot segment, not empty (never reads outside agents/).
function safeType(type: string): boolean {
  if (type === "" || type === "." || type === "..") return false;
  if (type.indexOf("/") >= 0 || type.indexOf("\\") >= 0) return false;
  for (const part of type.split(PLUGIN_AGENT_SEPARATOR)) if (part === "" || part === "." || part === "..") return false;
  return true;
}

// Home rule via config-dir.ts (D-M3-F-8, D-WIN-HOME-2): USERPROFILE first on win32, HOME first on POSIX.
function homeDir(env: NodeJS.ProcessEnv): string | null {
  return homeDirOf(env);
}

// Claude Code plugin agent type "<plugin>:<agent>"; installed_plugins.json keys are "<plugin>@<marketplace>".
function readPluginAgent(claudeDir: string, type: string): AgentDef | null {
  const cut = type.indexOf(PLUGIN_AGENT_SEPARATOR);
  const plugin = type.slice(0, cut);
  const agent = type.slice(cut + PLUGIN_AGENT_SEPARATOR.length);
  if (agent.indexOf(PLUGIN_AGENT_SEPARATOR) >= 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(hostText(readFileSync(join(claudeDir, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE), "utf8")));
  } catch {
    return null;
  }
  const plugins = (parsed as { plugins?: Record<string, unknown> } | null)?.plugins;
  if (plugins === null || typeof plugins !== "object") return null;
  for (const key of Object.keys(plugins)) {
    const at = key.indexOf(PLUGIN_KEY_SEPARATOR);
    if ((at < 0 ? key : key.slice(0, at)) !== plugin) continue;
    const entries = plugins[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const dir = (e as { installPath?: unknown } | null)?.installPath;
      if (typeof dir !== "string" || dir === "") continue;
      const d = readAgentFile(join(dir, AGENTS_DIR_NAME, agent + AGENT_FILE_EXT));
      if (d !== null) return d;
    }
  }
  return null;
}

// ---------- frontmatter (line-based, no regex) ----------

function readAgentFile(path: string): AgentDef | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  return parseFrontmatter(text);
}

function parseFrontmatter(text: string): AgentDef | null {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length === 0 || lines[0].trim() !== FRONTMATTER_FENCE) return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === FRONTMATTER_FENCE) { end = i; break; }
  if (end < 0) return null;
  const body = lines.slice(1, end);
  const tools = readList(body, FRONTMATTER_TOOLS_KEY);
  const disallowed = readList(body, FRONTMATTER_DISALLOWED_KEY);
  return { tools: tools !== null && tools.length > 0 ? tools : null, disallowed: disallowed ?? [] };
}

// `key: A, B` | `key: [A, "B"]` | `key:` followed by `- A` lines. null = key absent.
function readList(body: string[], key: string): string[] | null {
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (!line.startsWith(key + ":")) continue;
    let value = line.slice(key.length + 1).trim();
    if (value === "") {
      const items: string[] = [];
      for (let j = i + 1; j < body.length; j++) {
        const t = body[j].trim();
        if (!t.startsWith("-")) break;
        items.push(unquote(t.slice(1).trim()));
      }
      return items.filter((s) => s !== "");
    }
    if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
    return value.split(",").map((s) => unquote(s.trim())).filter((s) => s !== "");
  }
  return null;
}

function unquote(s: string): string {
  if (s.length > 1 && (s[0] === '"' || s[0] === "'") && s.endsWith(s[0])) return s.slice(1, -1);
  return s;
}

// ---------- names ----------

// D-M3-E3-1: "all tools" = every name this row knows: its native tools plus its own ctx tool names.
function allKnownToolNames(row: AdapterRow): string[] {
  const n = row.nativeTools;
  return [...n.shell, ...(n.read ?? []), ...(n.grep ?? []), ...(n.webfetch ?? []), ...(n.edit ?? []),
    ...TOOL_ORDER.map((t) => row.toolNamePrefix + t)];
}

// Tool name only: a permission-rule suffix "Bash(git:*)" names the tool "Bash". Gemini: §5.2 step 4.
function norm(row: AdapterRow, raw: string): string {
  const p = raw.indexOf("(");
  const name = (p >= 0 ? raw.slice(0, p) : raw).trim();
  if (row.id === "gemini" && name.startsWith(GEMINI_MCP_PREFIX)) return geminiValid(name);
  return name;
}

function geminiValid(s: string): string {
  let out = "";
  for (const ch of s) {
    const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || GEMINI_NAME_EXTRA_CHARS.indexOf(ch) >= 0;
    out += ok ? ch : "_";
  }
  return out;
}

// A disallowedTools entry removes: a trailing-"*" prefix, a whole MCP server ("mcp__<server>"), or one exact name.
function denies(rule: string, name: string): boolean {
  if (rule.endsWith("*")) return name.startsWith(rule.slice(0, -1));
  if (rule === name) return true;
  if (rule.startsWith(MCP_SERVER_TOOL_PREFIX)) {
    const server = rule.slice(MCP_SERVER_TOOL_PREFIX.length);
    if (server !== "" && server.indexOf(MCP_NAME_JOIN) < 0) return name.startsWith(rule + MCP_NAME_JOIN);
  }
  return false;
}

function unique(names: string[]): string[] {
  return [...new Set(names.filter((n) => n !== ""))];
}
