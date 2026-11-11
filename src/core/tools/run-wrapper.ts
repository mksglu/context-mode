// src/core/tools/run-wrapper.ts — ADR-0016 case B wrapper body, bundled as run.mjs and search.mjs
// (impl/04 §4; DEVIATIONS D-M2-4, D-M3-X1-1..6).
//
// The hook denies a subagent's large shell command and names `node <bundle>/run.mjs <b64 cmd> <b64 deny JSON>
// [<b64 description>]`. run.mjs re-checks the user's own deny rules, runs the command like ctx_execute
// (shell), indexes the full output, prints only the chunks that match the description, and exits with
// the command's own exit code. search.mjs reads more of an indexed output by source id.
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { getAdapter } from "../../adapters/table.ts";
import {
  EXEC_TIMEOUT_MS,
  OUTPUT_CAP,
  PARSE_ERROR_DENY_LINE,
  prefixToolNames,
  PLAIN_OUTPUT_ENV,
  POLICY_UNREADABLE_LINE,
  RUN_FAIL_EXIT,
  RUN_LABEL_PREFIX,
  RUN_MORE_PREFIX,
  RUN_SESSION_PREFIX,
  RUN_TIMEOUT_EXIT,
  RUN_USAGE_LINE,
  RUN_WRAPPER_AGENT,
  SEARCH_USAGE_LINE,
  SEARCH_WRAPPER_FILE,
  SOURCE_LABEL_MAX_CHARS,
  USER_DENY_REASON_PREFIX,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { CanonicalHookEvent, ProjectContext } from "../contracts/types.ts";
import { selectChunks } from "../index/select.ts";
import { decide } from "../policy/decide.ts";
import { resolveProject } from "../project/resolve.ts";
import { capBytes } from "../sandbox/cap.ts";
import { buildChildEnv } from "../sandbox/env.ts";
import { findRuntime, noRuntimeError } from "../sandbox/runtimes.ts";
import { runProcess } from "../sandbox/spawn.ts";
import { closeDb, openDb } from "../store/db.ts";
import { indexText } from "../index/text.ts";

const SHELL = "shell";
const BASH = "Bash";

/** Write, then exit once stdout and stderr have drained (a piped stdout is async). */
function exit(code: number, out: string, err: string): Promise<never> {
  return new Promise<never>(() => {
    process.stderr.write(err, () => process.stdout.write(out, () => process.exit(code)));
  });
}

function decode(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

// §4 step 3: argv[3] is the hook's deny rules snapshot, base64 JSON string[]; anything else is a usage error.
function denyRules(b64: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(b64));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((r) => typeof r === "string")) return null;
  return parsed as string[];
}

// D-M3-X1-1: the user's own rules refuse; a routing deny is why the hook sent the command here.
function userPolicyDeny(reason: string): boolean {
  const prefix = getAdapter(RUN_WRAPPER_AGENT).toolNamePrefix; // D-HL-NAMES-1: decide() names tools as this row does
  return reason.startsWith(USER_DENY_REASON_PREFIX) || reason === prefixToolNames(POLICY_UNREADABLE_LINE, prefix)
    || reason === prefixToolNames(PARSE_ERROR_DENY_LINE, prefix);
}

// §4 step 5, D-M3-X1-3: the project is the wrapper's cwd (the subagent's Bash cwd), one path.
function projectOf(argv: string[], cwd: string): ProjectContext {
  return resolveProject(RUN_WRAPPER_AGENT, { env: { CLAUDE_PROJECT_DIR: cwd }, argv, cwd });
}

// §4 step 7: "run.mjs:" + the command's first line, at most SOURCE_LABEL_MAX_CHARS code points (as execute.ts).
function sourceLabel(command: string): string {
  const nl = command.indexOf("\n");
  const first = nl < 0 ? command : command.slice(0, nl);
  return Array.from(RUN_LABEL_PREFIX + first).slice(0, SOURCE_LABEL_MAX_CHARS).join("");
}

// §4 step 9, ADR-0016 template: more: node "<bundle>/search.mjs" <source-id> "<terms>".
function moreLine(bundleDir: string, sourceId: number, terms: string): string {
  return RUN_MORE_PREFIX + JSON.stringify(join(bundleDir, SEARCH_WRAPPER_FILE)) + " " + sourceId + " " + JSON.stringify(terms);
}

function bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** impl/04 §4: run.mjs. `argv` is process.argv: [node, run.mjs, <b64 cmd>, <b64 deny JSON>, <b64 description>?]. */
export async function runWrapperMain(argv: string[], env: NodeJS.ProcessEnv): Promise<never> {
  // Steps 1-2.
  const cmdArg = argv[2];
  const rulesArg = argv[3];
  if (cmdArg === undefined || cmdArg === "" || rulesArg === undefined) return exit(RUN_FAIL_EXIT, "", RUN_USAGE_LINE + "\n");
  const command = decode(cmdArg);
  const rules = denyRules(rulesArg);
  if (rules === null) return exit(RUN_FAIL_EXIT, "", RUN_USAGE_LINE + "\n");
  const description = argv[4] === undefined ? "" : decode(argv[4]);
  const cwd = process.cwd();
  const sessionId = RUN_SESSION_PREFIX + randomUUID();
  // Steps 3-4: the full deny pipeline on the decoded command, with the rules the hook read.
  const ev: CanonicalHookEvent = {
    event: "PreToolUse",
    agent: RUN_WRAPPER_AGENT,
    sessionId,
    cwd,
    tool: { name: BASH, canonicalName: BASH, input: { command, description } },
  };
  const d = decide(ev, getAdapter(RUN_WRAPPER_AGENT), rules);
  if (d.kind === "deny" && userPolicyDeny(d.reason)) return exit(RUN_FAIL_EXIT, "", d.reason + "\n");
  try {
    // Step 6: as ctx_execute with language "shell" (§2.3 steps 4-8, 10).
    const runtime = findRuntime(SHELL);
    if (runtime === null) throw noRuntimeError(SHELL);
    const project = projectOf(argv, cwd);
    const r = await runProcess([runtime, "-c", command], {
      cwd,
      env: buildChildEnv(env, { ...PLAIN_OUTPUT_ENV }),
      signal: new AbortController().signal,
      timeoutMs: EXEC_TIMEOUT_MS,
    });
    // Step 11.
    if (r.killed === "timeout") return exit(RUN_TIMEOUT_EXIT, new CtxError("TIMEOUT", { ms: EXEC_TIMEOUT_MS }).toLine() + "\n", "");
    if (r.exitCode === null) throw new CtxError("SPAWN_FAILED", { detail: runtime + " gave no exit code in " + cwd });
    const exitCode = r.exitCode;
    const combined = r.stdout.toString("utf8") + (exitCode !== 0 ? r.stderr.toString("utf8") : "");
    const head = "exit " + exitCode + " · " + bytes(combined) + " B";
    // Steps 7-9.
    const db = await openDb(project);
    let text: string;
    try {
      const { sourceId } = indexText(db, project, sessionId, sourceLabel(command), combined, "text");
      const more = moreLine(dirname(argv[1] ?? ""), sourceId, description);
      const picked = selectChunks(db, sourceId, description, OUTPUT_CAP - bytes(head) - bytes(more) - 2);
      text = head + "\n" + picked.text + (picked.more === null ? "" : "\n" + more);
    } finally {
      closeDb(db);
    }
    // Step 10.
    return exit(exitCode, capBytes(text, OUTPUT_CAP).text + "\n", "");
  } catch (err) {
    if (err instanceof CtxError) return exit(RUN_FAIL_EXIT, "", err.toLine() + "\n");
    throw err;
  }
}

/** D-M3-X1-2: search.mjs <source-id> "<terms>": the chunks of one indexed run.mjs output that match the terms. */
export async function searchWrapperMain(argv: string[], _env: NodeJS.ProcessEnv): Promise<never> {
  const id = Number(argv[2] ?? "");
  const terms = argv[3] ?? "";
  if (argv[2] === undefined || argv[2] === "" || !Number.isSafeInteger(id) || id < 0) {
    return exit(RUN_FAIL_EXIT, "", SEARCH_USAGE_LINE + "\n");
  }
  try {
    const db = await openDb(projectOf(argv, process.cwd()));
    let text: string;
    try {
      text = selectChunks(db, id, terms, OUTPUT_CAP).text;
    } finally {
      closeDb(db);
    }
    return exit(0, capBytes(text, OUTPUT_CAP).text + "\n", "");
  } catch (err) {
    if (err instanceof CtxError) return exit(RUN_FAIL_EXIT, "", err.toLine() + "\n");
    throw err;
  }
}
