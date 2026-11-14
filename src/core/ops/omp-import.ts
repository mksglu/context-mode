// ADR-0026 decision 11 (O4, D-OMP-SETUP-1): OMP 18.20.0 imports user MCP servers from ~/.claude.json only when the
// `claude` user source is on: `enabledProviders` in ~/.omp/agent/config.yml names `claude`, `*` or `all`, or
// CLAUDE_CONFIG_DIR is set; `disabledProviders: [claude]` wins [src capability/index.ts:51-60,419-429,
// discovery/claude.ts:65-69,86-99]. When it imports a `context-mode` server, OMP's own denylist
// `disabledServers` in ~/.omp/agent/mcp.json keeps that second server off [doc docs/mcp-config.md:96,433-448].
// Setup adds our name only in that case; uninstall drops only our name. PI_CODING_AGENT_DIR never selects these files.
const { existsSync, readFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { join } from "node:path";
import { AGENT_HOME_DIR, CLAUDE_CONFIG_DIR_ENV, CLAUDE_USER_CONFIG_FILE, MCP_SERVERS_KEY, PI_AGENT_DIR, SERVER_KEY } from "../contracts/constants.ts";
import { hostText } from "./host-text.ts";

export const OMP_DISABLED_SERVERS_KEY = "disabledServers";
const OMP_MCP_FILE = "mcp.json";
const OMP_CONFIG_FILE = "config.yml";
const ENABLED_PROVIDERS = "enabledProviders";
const DISABLED_PROVIDERS = "disabledProviders";
const CLAUDE_PROVIDER = "claude";
const ALL_PROVIDERS: readonly string[] = ["*", "all"];

export interface OmpImportFiles { config: string; claude: string; mcp: string; }

/** The three files of the O4 rule: OMP's config.yml and mcp.json under ~/.omp/agent, and Claude's ~/.claude.json. */
export function ompImportFiles(home: string): OmpImportFiles {
  const agentDir = join(home, ...AGENT_HOME_DIR.omp, PI_AGENT_DIR);
  return { config: join(agentDir, OMP_CONFIG_FILE), mcp: join(agentDir, OMP_MCP_FILE), claude: join(home, CLAUDE_USER_CONFIG_FILE) };
}

function readText(file: string): string | undefined {
  try { return existsSync(file) ? hostText(readFileSync(file, "utf8")) : undefined; } catch { return undefined; }
}

const unquote = (s: string): string => {
  const t = s.trim();
  const q = t[0];
  return (q === '"' || q === "'") && t.endsWith(q) && t.length > 1 ? t.slice(1, -1) : t;
};
const withoutComment = (s: string): string => { const at = s.indexOf(" #"); return at === -1 ? s : s.slice(0, at); };

/** A top-level YAML string list: `key: [a, b]` (flow) or `key:` followed by indented `- a` lines (block). Only the two
 *  shapes OMP documents for these keys; any other value reads as an empty list. */
export function yamlTopList(text: string, key: string): string[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const head = `${key}:`;
  const at = lines.findIndex((l) => l.startsWith(head));
  if (at === -1) return [];
  const rest = withoutComment(lines[at].slice(head.length)).trim();
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    return (end === -1 ? rest.slice(1) : rest.slice(1, end)).split(",").map(unquote).filter((x) => x !== "");
  }
  if (rest !== "") return [];
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    if (line === line.trimStart() && !t.startsWith("-")) break; // the next top-level key
    if (!t.startsWith("-")) break;
    out.push(unquote(withoutComment(t.slice(1))));
  }
  return out;
}

/** True when OMP would import a `context-mode` MCP server from ~/.claude.json and run it next to our extension. */
export function ompImportsUs(files: OmpImportFiles, env: Record<string, string | undefined>): boolean {
  const config = readText(files.config) ?? "";
  if (yamlTopList(config, DISABLED_PROVIDERS).includes(CLAUDE_PROVIDER)) return false;
  const enabled = yamlTopList(config, ENABLED_PROVIDERS);
  const dirSet = env[CLAUDE_CONFIG_DIR_ENV] !== undefined && env[CLAUDE_CONFIG_DIR_ENV] !== "";
  if (!dirSet && !enabled.some((p) => p === CLAUDE_PROVIDER || ALL_PROVIDERS.includes(p))) return false;
  const claude = readText(files.claude);
  if (claude === undefined) return false;
  try {
    const servers = (JSON.parse(claude) as Record<string, unknown>)[MCP_SERVERS_KEY];
    return typeof servers === "object" && servers !== null && Object.hasOwn(servers, SERVER_KEY);
  } catch { return false; }
}
