// impl/07 §5 D3, D4, D5b; ADR-0010 (checks), ADR-0011 (v1 cleanup); DEVIATIONS D-M5-arch-3, D-M5-O1-3/4,
// D-M5-O2-1..5, D-M5-U1-6, D-M5-D2-1..4. Read-only: every check reads files and returns one DoctorRow.
// D3 diffs parsed data (never text): the MCP entry, the own hook entries (command + matcher composed from the
// row), and the hook timeout. D4 folds detectV1's findings into one row. D5b flags Claude Code hooks that VS
// Code's chat.useClaudeHooks re-runs in the same repo.
import { join } from "node:path";
import {
  AGENT_ARG, AGENT_HOME_DIR, CODEX_FEATURES_HOOKS_KEY, CONFIG_TOML_FILE, D3_DETAIL, D3_PARTS, D4_REASON_JOIN,
  D5B_DETAIL, D5B_FIX, DOCTOR_FIX_UPGRADE, DOCTOR_LABEL, DOCTOR_PASS_DETAIL, HOOK_COMMAND_FIELD, HOOK_COMMAND_SEP,
  HOOK_ENTRY_FILE, HOOK_SCRIPT_SEPS, HOOK_GROUP_HOOKS_FIELD, HOOKS_JSON_FILE, HOOK_HOST_FILE, HOOK_MATCHER_FIELD, HOST_CONFIG_DIR_NAME, HOST_NODE_COMMAND, EXE_SUFFIX,
  HOOKS_KEY, MCP_ANY_MATCH, POST_TOOL_USE, KIRO_ACTION_FIELD, KIRO_TOOL_MATCHERS, KIRO_TRIGGER_FIELD, MATCHER_ALT, MATCHER_ANY, MATCHER_CLOSE, MATCHER_OPEN,
  OPENCODE_BASE_CONFIG_FILE, OWN_MCP_ENTRY, OWN_TOOL_PREFIX, REGEX_ESCAPE,
  REGEX_SPECIAL_CHARS, SETTINGS_FILE, SHELL_QUOTE, TOOL_HOOK_EVENTS, V1_PATH_SEPS, VSCODE_CLAUDE_HOOKS_SETTING,
  VSCODE_DIR_NAME, VSCODE_SETTINGS_FILE,
} from "../contracts/constants.ts";
import type { AdapterRow, AgentId, DoctorRow } from "../contracts/types.ts";
import { hasReplace } from "../../adapters/table.ts";
import { codexDirOf, copilotDirOf, homeDirOf, kiroDirOf, opencodeDirOf, ownMcpFileOf, piAgentDirOf } from "../project/config-dir.ts";
import { detectV1, type V1Scope } from "./detect-v1.ts";
import { hostConfigValueAt, mergeOwnEntries, opencodePluginFile, parseHostConfig, readHostConfig } from "./host-config.ts";
import { resolvePluginRoot } from "./plugin-root.ts";

type D3Part = (typeof D3_PARTS)[number];
const [PART_MCP, PART_HOOKS, PART_TIMEOUT] = D3_PARTS;

/** One own hook entry as data, whatever the host's shape. */
interface OwnHook { command: string; matcher: unknown; timeout: unknown; }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function pass(id: "D3" | "D4" | "D5b"): DoctorRow {
  return { id, label: DOCTOR_LABEL[id], status: "PASS", detail: DOCTOR_PASS_DETAIL };
}

function fail(id: "D3" | "D4" | "D5b", detail: string, fixCommand: string): DoctorRow {
  return { id, label: DOCTOR_LABEL[id], status: "FAIL", detail, fixCommand };
}

/** Parsed host config at `file`; a missing file is {} (D-M5-O1-3). Throws CONFIG_PARSE_FAILED on bad syntax. */
function readParsed(agent: AgentId, file: string): { value: unknown; text: string; format: "json" | "jsonc" | "toml" } {
  const cur = readHostConfig(agent, file);
  return { value: parseHostConfig(agent, cur.path, cur.text, cur.format), text: cur.text, format: cur.format };
}

/** The matcher text the row composes: same rule as build/manifests.ts buildMatcher (D-M5-arch-3). Never compiled here. */
export function composeMatcher(row: AdapterRow, event?: string): string {
  let prefix = "";
  for (const ch of row.toolNamePrefix) prefix += REGEX_SPECIAL_CHARS.includes(ch) ? REGEX_ESCAPE + ch : ch;
  const names = Object.values(row.nativeTools).flat();
  const alts = [...names, prefix + OWN_TOOL_PREFIX + MATCHER_ANY];
  if (event === POST_TOOL_USE && hasReplace(row)) alts.push(MCP_ANY_MATCH); // D-M2-MCP-1
  return MATCHER_OPEN + alts.join(MATCHER_ALT) + MATCHER_CLOSE;
}

// <node> <dir>/hook.mjs --agent <id>. <node> is bare `node` (claude-code) or the quoted absolute execPath setup
// writes, e.g. "C:\\Program Files\\nodejs\\node.exe" (D-VT-DOCTOR-CMD-1). The dir may be quoted too.
const lastSegment = (p: string): string => {
  let at = -1;
  for (const sep of V1_PATH_SEPS) at = Math.max(at, p.lastIndexOf(sep));
  return p.slice(at + 1);
};

/** Split the leading token: quoted ("...", no escapes, as setup writes it) or bare up to the first space. */
function splitHead(command: string): { head: string; rest: string } | null {
  if (command.startsWith(SHELL_QUOTE)) {
    const close = command.indexOf(SHELL_QUOTE, 1);
    if (close < 0 || command.slice(close + 1, close + 1 + HOOK_COMMAND_SEP.length) !== HOOK_COMMAND_SEP) return null;
    return { head: command.slice(1, close), rest: command.slice(close + 1 + HOOK_COMMAND_SEP.length) };
  }
  const end = command.indexOf(HOOK_COMMAND_SEP);
  return end < 0 ? null : { head: command.slice(0, end), rest: command.slice(end + HOOK_COMMAND_SEP.length) };
}

function isOwnCommand(command: unknown, agent: AgentId): command is string {
  if (typeof command !== "string") return false;
  const split = splitHead(command);
  if (split === null) return false;
  const exe = lastSegment(split.head).toLowerCase();
  if (exe !== HOST_NODE_COMMAND && exe !== HOST_NODE_COMMAND + EXE_SUFFIX) return false;
  const tail = HOOK_COMMAND_SEP + AGENT_ARG + HOOK_COMMAND_SEP + agent;
  if (!split.rest.endsWith(tail) || split.rest.length <= tail.length) return false;
  let script = split.rest.slice(0, split.rest.length - tail.length);
  if (script.startsWith(SHELL_QUOTE) && script.endsWith(SHELL_QUOTE) && script.length > 1) script = script.slice(1, -1);
  return script === HOOK_ENTRY_FILE || HOOK_SCRIPT_SEPS.some((sep) => script.endsWith(sep + HOOK_ENTRY_FILE));
}

/** Own hook entries for one native event, per the host shape (impl/10 §1.5). */
function ownHooks(block: unknown, shape: string, timeoutKey: string, native: string, agent: AgentId): OwnHook[] {
  const out: OwnHook[] = [];
  if (shape === "kiro") {
    for (const e of list(block)) {
      if (!isObject(e) || e[KIRO_TRIGGER_FIELD] !== native) continue;
      const action = e[KIRO_ACTION_FIELD];
      const command = isObject(action) ? action[HOOK_COMMAND_FIELD] : undefined;
      if (isOwnCommand(command, agent)) out.push({ command, matcher: e[HOOK_MATCHER_FIELD], timeout: e[timeoutKey] });
    }
    return out;
  }
  const entries = isObject(block) ? list(block[native]) : [];
  for (const e of entries) {
    if (!isObject(e)) continue;
    if (shape === "nested" || shape === "zcode") { // zcode: matcher groups (D-HF-ZCODE-SHAPE-1)
      for (const h of list(e[HOOK_GROUP_HOOKS_FIELD])) {
        if (isObject(h) && isOwnCommand(h[HOOK_COMMAND_FIELD], agent)) {
          out.push({ command: h[HOOK_COMMAND_FIELD] as string, matcher: e[HOOK_MATCHER_FIELD], timeout: h[timeoutKey] });
        }
      }
    } else if (isOwnCommand(e[HOOK_COMMAND_FIELD], agent)) {
      out.push({ command: e[HOOK_COMMAND_FIELD] as string, matcher: e[HOOK_MATCHER_FIELD], timeout: e[timeoutKey] });
    }
  }
  return out;
}

const validTimeout = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;

// The host config file that holds the MCP entry (or the in-process plugin/package list), D-M5-O1-4.
function mcpFile(row: AdapterRow, home: string, env: NodeJS.ProcessEnv): string | null {
  const spec = OWN_MCP_ENTRY[row.id];
  if (row.id === "codex") return join(codexDirOf(env, home), CONFIG_TOML_FILE); // D-N6-CODEX-HOME-2
  if (spec !== undefined) return ownMcpFileOf(row.id, spec.file, env, home);
  if (row.id === "opencode") return join(opencodeDirOf(env, home), OPENCODE_BASE_CONFIG_FILE); // D-WIN-OPENCODE-DIR-1
  if (row.id === "pi") {
    return join(piAgentDirOf(env, home), SETTINGS_FILE);
  }
  return null; // marketplace/extension/plugin: the MCP entry ships in the plugin manifest under the plugin root
}

function mcpWrong(row: AdapterRow, home: string, env: NodeJS.ProcessEnv): boolean {
  const file = mcpFile(row, home, env);
  try {
    if (file === null) {
      resolvePluginRoot(row, env);
      return false;
    }
    const cur = readHostConfig(row.id, file);
    // D-DOC-RT-1: accept the entry setup writes (absolute node, OpenCode plugin file), not only the ctx_upgrade form.
    return mergeOwnEntries(row.id, cur.text, cur.format, row, { nodePath: true, listEntries: [opencodePluginFile()] }).edits.length > 0;
  } catch {
    return true; // root missing or the config did not parse: the entry is not what ctx_upgrade writes
  }
}

/** Parts of the hook block that differ from the row: entries/matcher, or timeout (D-M5-D2-2). */
function hookParts(row: AdapterRow, home: string, env: NodeJS.ProcessEnv, worktree: string): D3Part[] {
  const spec = HOOK_HOST_FILE[row.id];
  if (spec === null) return []; // in-process agent: hooks are code, not a file (impl/10 §1.5)
  let block: unknown;
  try {
    const root = spec.root === "plugin" ? resolvePluginRoot(row, env) : spec.root === "home" ? home : worktree;
    const file = row.id === "codex" ? join(codexDirOf(env, home), HOOKS_JSON_FILE) // D-N6-CODEX-HOME-2
      : row.id === "copilot-cli" ? join(copilotDirOf(env, home), ...spec.file.slice(1)) // D-WIN-COPILOT-HOME-1: file = [".copilot", ...]
      : row.id === "kiro" ? join(kiroDirOf(env, home), ...spec.file.slice(1)) // D-WIN-KIRO-HOME-1: file = [".kiro", ...]
      : join(root, ...spec.file);
    block = hostConfigValueAt(readParsed(row.id, file).value, spec.key);
    if (row.id === "codex") {
      const config = readParsed(row.id, join(codexDirOf(env, home), CONFIG_TOML_FILE)).value;
      if (hostConfigValueAt(config, CODEX_FEATURES_HOOKS_KEY) === false) return [PART_HOOKS]; // no key = true (#1152)
    }
  } catch {
    return [PART_HOOKS];
  }
  let hooksBad = false;
  let timeoutBad = false;
  for (const [canonical, native] of Object.entries(row.eventMap)) {
    if (native === undefined) continue;
    const own = ownHooks(block, spec.shape, spec.timeoutKey, native, row.id);
    if (spec.shape === "kiro" && TOOL_HOOK_EVENTS.includes(canonical)) { // one entry per matcher (D-HF-KIRO-SHELL-1)
      const got = own.map((h) => h.matcher).sort();
      const want = KIRO_TOOL_MATCHERS.map(([m]) => m).sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) hooksBad = true;
      for (const h of own) if (!validTimeout(h.timeout)) timeoutBad = true;
      continue;
    }
    if (own.length !== 1) { hooksBad = true; continue; }
    if (spec.matcher && TOOL_HOOK_EVENTS.includes(canonical) && own[0].matcher !== composeMatcher(row, canonical)) hooksBad = true;
    if (!validTimeout(own[0].timeout)) timeoutBad = true;
  }
  return [...(hooksBad ? [PART_HOOKS] : []), ...(timeoutBad ? [PART_TIMEOUT] : [])];
}

/** D3 — host config. FAIL names which of the 3 parts is wrong; fix "run ctx_upgrade". Pi also names the
 *  settings file it read (PI_CODING_AGENT_DIR, else ~/.pi/agent), never a legacy path (#1168 #1266, D-M7-G2-1). */
export function checkHostConfig(row: AdapterRow, env: NodeJS.ProcessEnv, worktree: string): DoctorRow {
  const home = homeDirOf(env);
  if (home === null) return fail("D3", D3_DETAIL(D3_PARTS), DOCTOR_FIX_UPGRADE);
  const parts: D3Part[] = [...(mcpWrong(row, home, env) ? [PART_MCP] : []), ...hookParts(row, home, env, worktree)];
  const read = row.id === "pi" ? mcpFile(row, home, env) : null;
  if (parts.length === 0) return read === null ? pass("D3") : { ...pass("D3"), detail: read };
  const detail = D3_DETAIL(parts);
  return fail("D3", read === null ? detail : detail + D4_REASON_JOIN + read, DOCTOR_FIX_UPGRADE);
}

/** D4 — old entries: every finding's reason in one row, joined "; ". */
export function checkV1Leftovers(agent: AgentId, home: string, scope: V1Scope = {}): DoctorRow {
  const findings = detectV1(agent, home, scope);
  if (findings.length === 0) return pass("D4");
  return fail("D4", findings.map((f) => f.reason).join(D4_REASON_JOIN), DOCTOR_FIX_UPGRADE);
}

// A file we cannot read or parse turns nothing on (same rule as detect-v1, D-M5-O2-5). VS Code settings are JSONC.
function parsedOrNull(agent: AgentId, file: string, jsonc: boolean): unknown {
  try {
    const cur = readHostConfig(agent, file);
    return parseHostConfig(agent, cur.path, cur.text, jsonc ? "jsonc" : cur.format);
  } catch {
    return null;
  }
}

/** D5b — double-fire: repo .claude/settings.json hooks block and .vscode/settings.json chat.useClaudeHooks both on. */
export function checkDoubleFire(agent: AgentId, worktree: string): DoctorRow {
  if (agent !== "claude-code" && agent !== "vscode") return pass("D5b");
  const claude = parsedOrNull(agent, join(worktree, HOST_CONFIG_DIR_NAME, SETTINGS_FILE), false);
  const hooks = isObject(claude) ? claude[HOOKS_KEY] : undefined;
  const hooksOn = isObject(hooks) && Object.keys(hooks).length > 0;
  const vscode = parsedOrNull(agent, join(worktree, VSCODE_DIR_NAME, VSCODE_SETTINGS_FILE), true);
  const useClaudeHooks = isObject(vscode) && vscode[VSCODE_CLAUDE_HOOKS_SETTING] === true;
  return hooksOn && useClaudeHooks ? fail("D5b", D5B_DETAIL, D5B_FIX) : pass("D5b");
}
