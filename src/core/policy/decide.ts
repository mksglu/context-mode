// impl/08 §6 (module enforcement): decide(ev, row, userDeny) -> Decision for PreToolUse only.
// Rule order (T-ROUTE, DECISIONS-r9 V6): user deny, WebFetch, curl/http/build (rows with no replace and subagent
// calls only, D-M7-RR-1), Read and shell dump. No hints (D-M7-RR-2). ADR-0008, DECISIONS-r8 (Read deny), DECISIONS-r9 E1-E5. DEVIATIONS D-M3-E4-1..10. No regex, nothing cut.
// Never returns "replace" (PostToolUse only). Subagent case B/C is applied by hooks/dispatch.ts (D-M3-E4-1).
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { statSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { resolve } from "node:path";
import {
  BUILD_COMMANDS, CURL_COMMANDS, CURL_DUMP_HEADER_FLAG, CURL_SILENT_FLAGS, CURL_VERBOSE_FLAGS,
  DENY_EXEC_TOOL, DENY_INTENT_DEFAULT, DENY_PREFIX, DENY_RUN_HERE_LINE, DENY_TOOL_LABEL, DENY_WEBFETCH_JOIN,
  DENY_WEBFETCH_TOOLS, DENY_WHAT, DENY_WHAT_SUFFIX, DUMP_COUNT_COMMANDS, DUMP_COUNT_FLAGS, FETCH_CALL, FETCH_QUOTES,
  HTTP_SCHEME, INLINE_HTTP_CALLS, JQ_COMMAND, JQ_WHITELIST, NEVER_DENY_HOSTS,
  OUTPUT_CAP, PARSE_ERROR_DENY_LINE, prefixToolNames, POLICY_UNREADABLE_LINE, POLICY_UNREADABLE_WARNING,
  READ_PATH_KEYS, REQUIRE_SECURITY_ENV, SED_COMMAND, SED_QUIET_FLAGS, SHELL_DUMP_COMMANDS,
  USER_DENY_REASON_PREFIX,
} from "../contracts/constants.ts";
import type { AdapterRow, CanonicalHookEvent, Decision, DenyKind, SimpleCommand } from "../contracts/types.ts";
import { dumpRunsThenReplaces, hasReplace } from "../../adapters/table.ts";
import { parseShell } from "./parse.ts";
import { isSubagentCall } from "./subagent.ts";
import { unwrap } from "./unwrap.ts";
import { matchesAnyDenyPattern } from "./user-deny.ts";
import { READ_DENY_MESSAGE } from "./read-deny.ts";

// Canonical tool names (impl/01 §2) and input field values; names, not tunable values.
const BASH = "Bash";
const READ = "Read";
const WEBFETCH = "WebFetch";
const CTX_EXECUTE = "ctx_execute";
const CTX_BATCH = "ctx_batch";
const SHELL_LANGUAGE = "shell";
const FLAG_ON = "1";
const OPT = "-";
const LONG_OPT = "--";
const OPT_VALUE = "=";
const HOST_SEP = ".";
const SED_RANGE_SEP = ",";
const SED_PRINT = "p";
const SED_SCRIPT_FLAGS: readonly string[] = ["-e", "--expression"];
const COMMAND_STARTS = ";&|(`\n\r"; // a command can start after these (parse-error "could match", D-M3-E4-8)

const ALLOW: Decision = Object.freeze({ kind: "allow" }) as Decision;
const deny = (reason: string): Decision => ({ kind: "deny", reason });
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const present = (v: unknown): boolean => v !== undefined && v !== null;
const has = (list: readonly string[], v: string): boolean => list.includes(v);

/** impl/08 §6.1. `userDeny === null`: a present policy file could not be read (DECISIONS-r9 E2). */
export function decide(ev: CanonicalHookEvent, row: AdapterRow, userDeny: string[] | null): Decision {
  const tool = ev.tool;
  if (tool === undefined) return ALLOW; // a PreToolUse with no tool is a dispatch bug (§6.1 input)
  const canonical = tool.canonicalName;
  const input = tool.input;

  // step 3: user deny, always first, for every canonical name.
  let rules: string[];
  if (userDeny === null) {
    if (process.env[REQUIRE_SECURITY_ENV] === FLAG_ON) return deny(prefixToolNames(POLICY_UNREADABLE_LINE, row.toolNamePrefix));
    process.stderr.write(POLICY_UNREADABLE_WARNING + "\n");
    rules = [];
  } else rules = userDeny;
  const hit = userDenyHit(canonical, input, ev.cwd, rules);
  if (hit !== null) return deny(USER_DENY_REASON_PREFIX + hit);

  if (canonical === WEBFETCH) return webFetch(input, row); // step 4
  if (canonical === BASH) return bash(ev, row, input, rules); // steps 5, 6a
  if (canonical === READ) return read(ev, row, input); // step 6
  // Steps 5d, 7, 8 (Bash/PowerShell/Read/Grep/other-MCP hints) are retired: D-M7-RR-2, DECISIONS-r10 (2).
  return ALLOW; // step 9
}

/**
 * impl/08 §6.2, ADR-0008 "Deny message". `match` is the original command (or URL), never rewritten.
 * B1: WebFetch names the v2 tools `ctx_index`, then `ctx_search`; its last line is ctx_index input (D-M3-E4-3).
 */
export function denyMessage(kind: DenyKind, match: string, row: AdapterRow, intent?: string): string {
  const web = kind === "webfetch";
  const tool = web
    ? DENY_WEBFETCH_TOOLS.map((t) => row.toolNamePrefix + t).join(DENY_WEBFETCH_JOIN)
    : row.toolNamePrefix + DENY_EXEC_TOOL;
  const call = web
    ? JSON.stringify({ url: match })
    : JSON.stringify({ language: SHELL_LANGUAGE, code: match, intent: intent ?? DENY_INTENT_DEFAULT });
  return [DENY_PREFIX + DENY_WHAT[kind] + DENY_WHAT_SUFFIX, DENY_RUN_HERE_LINE, DENY_TOOL_LABEL + tool, call].join("\n");
}

// ---------- step 3: user deny (Q5, V17; D-M3-E4-2) ----------

function readPath(input: Record<string, unknown>): string | undefined {
  for (const k of READ_PATH_KEYS) {
    const p = str(input[k]);
    if (p !== undefined && p !== "") return p;
  }
  return undefined;
}

function userDenyHit(canonical: string, input: Record<string, unknown>, cwd: string, rules: string[]): string | null {
  if (rules.length === 0) return null;
  const readRule = (p: string): string | null => matchesAnyDenyPattern(resolve(cwd, p), rules, { tool: READ, projectDir: cwd });
  if (canonical === BASH) {
    const cmd = str(input.command);
    return cmd === undefined ? null : matchesAnyDenyPattern(cmd, rules);
  }
  if (canonical === READ) {
    const p = readPath(input);
    return p === undefined ? null : readRule(p);
  }
  if (canonical === CTX_EXECUTE) {
    const file = str(input.file);
    const byFile = file === undefined || file === "" ? null : readRule(file);
    if (byFile !== null) return byFile;
    const code = str(input.code);
    return input.language === SHELL_LANGUAGE && code !== undefined ? matchesAnyDenyPattern(code, rules) : null;
  }
  if (canonical === CTX_BATCH && Array.isArray(input.commands)) {
    for (const c of input.commands) {
      const h = typeof c === "string" ? matchesAnyDenyPattern(c, rules) : null;
      if (h !== null) return h;
    }
  }
  return null;
}

/** Each unwrapped command (as argv and as written) against the Bash rules: v1 checked every segment and subshell. */
function segmentHit(c: SimpleCommand, rules: string[]): string | null {
  if (rules.length === 0) return null;
  return matchesAnyDenyPattern([c.argv0, ...c.args].join(" "), rules) ?? matchesAnyDenyPattern(c.raw, rules);
}

/** Q4 on a ParseError: could a Bash rule match a command that starts anywhere in the raw text? (D-M3-E4-8) */
function couldMatch(text: string, rules: string[]): boolean {
  if (rules.length === 0) return false;
  for (let k = 0; k <= text.length; k++) {
    if (k > 0 && !COMMAND_STARTS.includes(text.charAt(k - 1))) continue;
    if (matchesAnyDenyPattern(text.slice(k).trimStart(), rules) !== null) return true;
  }
  return false;
}

// ---------- step 4: WebFetch ----------

function neverDenied(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return NEVER_DENY_HOSTS.some((h) => host === h || host.endsWith(HOST_SEP + h));
}

function webFetch(input: Record<string, unknown>, row: AdapterRow): Decision {
  const url = str(input.url) ?? "";
  return neverDenied(url) ? ALLOW : deny(denyMessage("webfetch", url, row));
}

// ---------- step 5: Bash ----------

function bash(ev: CanonicalHookEvent, row: AdapterRow, input: Record<string, unknown>, rules: string[]): Decision {
  const cmd = str(input.command) ?? "";
  const parsed = parseShell(cmd);
  if (!parsed.ok) return couldMatch(cmd, rules) ? deny(prefixToolNames(PARSE_ERROR_DENY_LINE, row.toolNamePrefix)) : ALLOW; // 5b, Q4
  const cmds = unwrap(parsed.commands);
  for (const c of cmds) {
    const h = segmentHit(c, rules);
    if (h !== null) return deny(USER_DENY_REASON_PREFIX + h);
  }
  // 5c size-guess denies: only where no post-run replace exists, or on a subagent call (ADR-0016).
  // On a replace row the main agent runs the command and PostToolUse replaces a large result (D-M7-RR-1).
  if (!hasReplace(row) || isSubagentCall(ev)) {
    for (const c of cmds) {
      const kind = denyKind(c);
      if (kind !== null) return deny(denyMessage(kind, cmd, row, str(input.description)));
    }
  }
  return shellDump(cmds, ev.cwd, row) ?? ALLOW; // 6a: file size known by stat, kept (D-M7-RR-1)
}

/** 5c, in the §6.1 order: curl/wget, inline HTTP, build tool. */
function denyKind(c: SimpleCommand): DenyKind | null {
  const name = c.argv0.toLowerCase();
  if (has(CURL_COMMANDS, name) && bodyReachesOutput(name as "curl" | "wget", c)) return "curl";
  if (inlineHttp(c.raw)) return "http";
  if (has(BUILD_COMMANDS, name)) return "build";
  return null;
}

/** Body to a file is allowed only when silent and not verbose (#166, v1 routing.mjs:745-765). */
function bodyReachesOutput(name: "curl" | "wget", c: SimpleCommand): boolean {
  if (c.redirectsToFile) return !quiet(name, c.args);
  return !c.endsInBoundedSink;
}

function quiet(name: "curl" | "wget", args: readonly string[]): boolean {
  const flag = CURL_SILENT_FLAGS[name];
  let silent = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === LONG_OPT) break;
    if (has(CURL_VERBOSE_FLAGS, a)) return false;
    if (a === CURL_DUMP_HEADER_FLAG && args[k + 1] === OPT) return false;
    if (a === flag.long || (a.startsWith(OPT) && !a.startsWith(LONG_OPT) && a.includes(flag.short, OPT.length))) silent = true;
  }
  return silent;
}

/** `fetch(` + quote + `http`, or a requests./http. call, in this command's own text (heredoc bodies are not in raw). */
function inlineHttp(raw: string): boolean {
  const low = raw.toLowerCase();
  for (const call of INLINE_HTTP_CALLS) if (low.includes(call)) return true;
  for (let i = low.indexOf(FETCH_CALL); i >= 0; i = low.indexOf(FETCH_CALL, i + 1)) {
    const q = low.charAt(i + FETCH_CALL.length);
    if (q !== "" && FETCH_QUOTES.includes(q) && low.startsWith(HTTP_SCHEME, i + FETCH_CALL.length + q.length)) return true;
  }
  return false;
}

// ---------- steps 6, 6a: Read and one-file shell dumps (DECISIONS-r8 VR) ----------

const CD_COMMAND = "cd";

function fileSize(abs: string): number {
  try {
    const st = statSync(abs);
    return st.isFile() ? st.size : -1;
  } catch {
    return -1;
  }
}

function read(ev: CanonicalHookEvent, row: AdapterRow, input: Record<string, unknown>): Decision {
  if (!present(input.offset) && !present(input.limit)) {
    const p = readPath(input);
    if (p !== undefined) {
      const abs = resolve(ev.cwd, p);
      const size = fileSize(abs);
      if (size > OUTPUT_CAP) return deny(READ_DENY_MESSAGE(abs, size, row.toolNamePrefix));
    }
  }
  return ALLOW; // ranged Read is never denied; no Read hint (D-M7-RR-2)
}

/** 6a: null = not a dump, ALLOW = bounded dump, deny = unbounded dump over the cap. Skipped only on a row with a
 *  Read tool where the dump runs and PostToolUse replaces it (D-HA-QWEN-DUMP-1, D-HA-GEMINI-DUMP-1). */
function shellDump(cmds: SimpleCommand[], cwd: string, row: AdapterRow): Decision | null {
  if (row.nativeTools.read !== undefined && row.nativeTools.read.length > 0 && dumpRunsThenReplaces(row)) return null;
  // D-CDX-CAT-1: every command whose stdout reaches the tool result is checked, also inside a chain (`cd x && cat f`).
  let dir = cwd;
  let verdict: Decision | null = null;
  for (const c of cmds) {
    const name = c.argv0.toLowerCase();
    if (name === CD_COMMAND && c.args.length === 1 && c.insideConstruct === undefined) dir = resolve(dir, c.args[0]);
    if (c.redirectsToFile || c.endsInBoundedSink || c.pipesOut === true || c.insideConstruct !== undefined) continue;
    if (!has(SHELL_DUMP_COMMANDS, name)) continue;
    const d = dumpTarget(name, c.args);
    if (d === null) continue;
    if (d.bounded) { verdict = ALLOW; continue; }
    const abs = resolve(dir, d.file);
    const size = fileSize(abs);
    if (size > OUTPUT_CAP) return deny(READ_DENY_MESSAGE(abs, size, row.toolNamePrefix));
  }
  return verdict;
}

const allDigits = (s: string): boolean => s !== "" && [...s].every((ch) => ch >= "0" && ch <= "9");

/** head/tail count bound in any form: -n N, -nN, -cN, --lines=N, --bytes=N, -N. Returns words to skip, or -1. */
function countFlag(a: string): number {
  if (has(DUMP_COUNT_FLAGS, a)) return 1;
  for (const f of DUMP_COUNT_FLAGS) {
    if (f.startsWith(LONG_OPT) ? a.startsWith(f + OPT_VALUE) : a.startsWith(f)) return 0;
  }
  return a.startsWith(OPT) && allDigits(a.slice(OPT.length)) ? 0 : -1;
}

/** `sed -n` script: `N,Mp` / `Np` is a range (bounded), `p` prints all, anything else is a search, not a dump. */
function sedScript(script: string): "range" | "all" | null {
  if (script === SED_PRINT) return "all";
  if (!script.endsWith(SED_PRINT)) return null;
  const body = script.slice(0, script.length - SED_PRINT.length);
  const comma = body.indexOf(SED_RANGE_SEP);
  const range = comma < 0 ? allDigits(body) : allDigits(body.slice(0, comma)) && allDigits(body.slice(comma + SED_RANGE_SEP.length));
  return range ? "range" : null;
}

/** D-M3-E4-7: exactly one file operand; the bound comes from the command's own flags. */
function dumpTarget(name: string, args: readonly string[]): { file: string; bounded: boolean } | null {
  const files: string[] = [];
  let bounded = false;
  let quietSed = false;
  let script: string | undefined;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (has(DUMP_COUNT_COMMANDS, name)) {
      const skip = countFlag(a);
      if (skip >= 0) { bounded = true; k += skip; continue; }
    }
    if (name === SED_COMMAND && has(SED_QUIET_FLAGS, a)) { quietSed = true; continue; }
    if (name === SED_COMMAND && has(SED_SCRIPT_FLAGS, a)) { script = args[k + 1]; k++; continue; }
    if (a.startsWith(OPT) && a !== OPT) continue;
    files.push(a);
  }
  if (name === SED_COMMAND) {
    if (!quietSed) return null;
    if (script === undefined) script = files.shift();
    const kind = script === undefined ? null : sedScript(script);
    if (kind === null) return null;
    bounded = kind === "range";
  }
  if (name === JQ_COMMAND) {
    if (files.shift() !== JQ_WHITELIST.identity) return null;
  }
  return files.length === 1 && files[0] !== OPT ? { file: files[0], bounded } : null;
}
