// D-HNE-GUARD-1 (owner decision 2026-10-29): a hook never errors. On any internal failure the hook still exits 0 with a
// valid decision for its host, built from the tool-name table alone: no project, no store, no policy module.
//   - own ctx_* tools and tools that cannot flood the context: allowed (ctx_doctor and the sandbox stay reachable);
//   - shell, large Read, grep and fetch tools: denied with the usual redirect plus one line naming the error.
// The error and its stack go to <DATA_ROOT>/hook-errors.log (append only, never cut), never only to stderr.
// Imports: contracts and the adapter table only. Nothing here throws.
const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { join, resolve } from "node:path";
import type { AgentId } from "../contracts/agents.ts";
import {
  DATA_ROOT, HOOK_ERROR_LOG_FILE, HOOK_FAULT_ENV, HOOK_FAULT_STAGES, NODE_MIN, HOOK_FAIL_CWD_KEYS, HOOK_FAIL_EVENT_KEYS, HOOK_FAIL_INPUT_KEYS, HOOK_FAIL_LINE, HOOK_FAIL_PRE_EVENTS, HOOK_FAIL_REDIRECT,
  HOOK_FAIL_TOOLS, HOOK_FAIL_TOOL_KEYS, HOOK_LOG_TAIL_BYTES, OUTPUT_CAP, OWN_TOOL_PREFIX, prefixToolNames, READ_PATH_KEYS,
} from "../contracts/constants.ts";
import type { AdapterRow, HookOutput } from "../contracts/types.ts";
import { getAdapter } from "../../adapters/table.ts";

type Rec = Record<string, unknown>;
type Kind = "shell" | "read" | "grep" | "fetch";

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstString(o: Rec, keys: readonly string[]): string {
  for (const k of keys) if (typeof o[k] === "string") return o[k] as string;
  return "";
}

/** The tool input as an object: a JSON string (Copilot toolArgs) is parsed, anything else unreadable gives {}. */
function inputOf(o: Rec): Rec {
  for (const k of HOOK_FAIL_INPUT_KEYS) {
    let v = o[k];
    if (typeof v === "string") {
      try { v = JSON.parse(v); } catch { v = undefined; }
    }
    if (isRec(v)) return v;
  }
  return {};
}

function homeOf(env: NodeJS.ProcessEnv): string {
  return env.HOME ?? env.USERPROFILE ?? "";
}

/** <home>/<DATA_ROOT>/hook-errors.log, or "" when no home is known. */
export function hookLogPath(env: NodeJS.ProcessEnv): string {
  const home = homeOf(env);
  return home === "" ? "" : join(home, DATA_ROOT.slice(1), HOOK_ERROR_LOG_FILE);
}

/** A short, stable label: the CtxError code, else the error name. */
export function errorLabel(err: unknown): string {
  const code = isRec(err) ? err.code : undefined;
  if (typeof code === "string" && code !== "") return code;
  return err instanceof Error ? err.name : "Error";
}

/** Append one JSON line (time, agent, stage, label, message, stack). Never throws. */
export function logHookError(env: NodeJS.ProcessEnv, agent: string, stage: string, err: unknown): void {
  try {
    const file = hookLogPath(env);
    if (file === "") return;
    fs.mkdirSync(join(file, ".."), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(), agent, stage, label: errorLabel(err),
      message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack ?? "" : "",
    });
    fs.appendFileSync(file, line + "\n");
  } catch {
    process.stderr.write("hooks: " + stage + " failed: " + (err instanceof Error ? err.message : String(err)) + "\n"); // no log possible
  }
}

/** The last logged hook error as {ts, stage, label}, read from the tail of the log; null when none. Never throws. */
export function lastHookError(env: NodeJS.ProcessEnv): { ts: string; stage: string; label: string } | null {
  try {
    const file = hookLogPath(env);
    if (file === "" || !fs.existsSync(file)) return null;
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - HOOK_LOG_TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const j = JSON.parse(lines[i] ?? "") as Rec;
          if (typeof j.ts === "string" && typeof j.stage === "string" && typeof j.label === "string") return { ts: j.ts, stage: j.stage, label: j.label };
        } catch { /* partial first line of the tail, or a foreign line */ }
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

let fired = false;
/** Test seam (HOOK_FAULT_ENV): throws once when `stage` is the named one. A no-op in production. */
export function fault(env: NodeJS.ProcessEnv, stage: (typeof HOOK_FAULT_STAGES)[number]): void {
  if (fired || env[HOOK_FAULT_ENV] !== stage) return;
  fired = true;
  throw new Error("injected fault at " + stage);
}

/** True when `version` (e.g. "v22.1.0") is below NODE_MIN. Numeric parts only; an unparsable part counts as 0. */
export function nodeTooOld(version: string): boolean {
  const a = (version.startsWith("v") ? version.slice(1) : version).split(".");
  const b = NODE_MIN.split(".");
  for (let i = 0; i < b.length; i++) {
    const x = Number(a[i] ?? 0) || 0;
    const y = Number(b[i]);
    if (x !== y) return x < y;
  }
  return false;
}

function has(list: readonly string[] | undefined, name: string): boolean {
  return list !== undefined && list.some((n) => n.toLowerCase() === name);
}

function kindOf(row: AdapterRow, name: string): Kind | null {
  const n = name.toLowerCase();
  if (has(row.nativeTools.shell, n) || has(HOOK_FAIL_TOOLS.shell, n)) return "shell";
  if (has(row.nativeTools.read, n) || has(HOOK_FAIL_TOOLS.read, n)) return "read";
  if (has(row.nativeTools.grep, n) || has(HOOK_FAIL_TOOLS.grep, n)) return "grep";
  if (has(row.nativeTools.webfetch, n) || has(HOOK_FAIL_TOOLS.fetch, n)) return "fetch";
  return null;
}

function isPreTool(row: AdapterRow, event: string): boolean {
  const e = event.toLowerCase();
  return HOOK_FAIL_PRE_EVENTS.includes(e) || (row.eventMap.PreToolUse ?? "").toLowerCase() === e;
}

/** True when the Read target is a whole file over the output cap. An unreadable, unnamed or ranged target is not denied. */
function bigRead(input: Rec, cwd: string): boolean {
  if ((input.offset ?? null) !== null || (input.limit ?? null) !== null) return false; // a ranged Read is never denied (same as decide)
  const p = firstString(input, READ_PATH_KEYS);
  if (p === "") return false;
  try {
    const st = fs.statSync(resolve(cwd, p));
    return st.isFile() && st.size > OUTPUT_CAP;
  } catch {
    return false;
  }
}

/**
 * The host-shaped answer to a hook that failed. `raw` is the parsed stdin (any shape). Never throws.
 * A PreToolUse call that could flood the context is denied; everything else is this host's allow shape.
 */
export function failureOutput(agent: AgentId, raw: unknown, err: unknown, cwdFallback = ""): HookOutput {
  const row = getAdapter(agent);
  const allow = (): HookOutput => row.encode({ event: "PreToolUse", agent, sessionId: "", cwd: "", turn: 0 }, { kind: "allow" });
  try {
    if (!isRec(raw)) return allow();
    if (!isPreTool(row, firstString(raw, HOOK_FAIL_EVENT_KEYS))) return allow();
    const name = firstString(raw, HOOK_FAIL_TOOL_KEYS);
    if (name === "" || name.includes(OWN_TOOL_PREFIX)) return allow();
    const kind = kindOf(row, name);
    if (kind === null) return allow();
    const cwd = firstString(raw, HOOK_FAIL_CWD_KEYS) || cwdFallback;
    if (kind === "read" && !bigRead(inputOf(raw), cwd)) return allow();
    const redirect = kind === "read" ? HOOK_FAIL_REDIRECT.read : HOOK_FAIL_REDIRECT[kind];
    const reason = prefixToolNames(redirect, row.toolNamePrefix) + "\n" + HOOK_FAIL_LINE(errorLabel(err), row.toolNamePrefix);
    return row.encode({ event: "PreToolUse", agent, sessionId: "", cwd, turn: 0 }, { kind: "deny", reason });
  } catch {
    return { stdout: "", exitCode: 0 };
  }
}
