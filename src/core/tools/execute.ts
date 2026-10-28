// impl/04 §2 (A9-A11, A20), impl/00 §5.2, ADR-0008 (one OUTPUT_CAP), DECISIONS-r3 Q8 (timeout,
// exit class), DEVIATIONS D-M2-2 (journal facts), D-M2-6 (no cut without index), D-M2-T10-1..6.
// ctx_execute: run code in the project dir through the one spawn path (runProcess) and return only
// what it prints. Output that does not fit OUTPUT_CAP is indexed in full and reduced by whole-chunk
// selection; nothing is cut and no byte is lost.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { z } from "zod/v4";
import {
  BACKGROUND_REPLY_PREFIX, CANCELLED_LINE, EXEC_LANGUAGES, EXEC_TIMEOUT_MS, OUTPUT_CAP, SOURCE_LABEL_MAX_CHARS,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { ExecuteInput, JournalFacts, ToolContext, ToolReply } from "../contracts/types.ts";
import { moreLine, selectChunks } from "../index/select.ts";
import { canonicalKey } from "../journal/append.ts";
import { isInside } from "../project/contain.ts";
import { capBytes } from "../sandbox/cap.ts";
import { buildChildEnv } from "../sandbox/env.ts";
import { rewriteWindowsBuildTools } from "../sandbox/win-build.ts";
import { findRuntime, noRuntimeError } from "../sandbox/runtimes.ts";
import { runProcess, type RunResult } from "../sandbox/spawn.ts";
import { closeDb, openDb } from "../store/db.ts";
import { indexText } from "../index/text.ts";
import { unknownField } from "./search.ts";

export type { ExecuteInput } from "../contracts/types.ts";

const TOOL = "ctx_execute";

// §2.1. .strict(): an unknown field is a ZodError, mapped to UNKNOWN_FIELD in step 1.
export const ctxExecuteSchema = z.object({
  language: z.enum(EXEC_LANGUAGES).or(z.string()),
  code: z.string().min(1),
  file: z.string().optional(),
  intent: z.string().optional(),
  timeoutMs: z.number().int().positive().max(EXEC_TIMEOUT_MS).optional(),
  background: z.boolean().optional(),
  summary: z.boolean().optional(),
}, { error: unknownField }).strict(); // 00 §5.2 step 1: the SDK validates first, so the text lives on the schema

// Interpreter and OS facts (not tunables). A9: runtimes that take code with `-c`; all others get a file.
// D-M2-T10-7: ".js", not ".mjs": Node's syntax detection runs both require() and import code.
const SHELL_FAMILY: readonly string[] = Object.freeze(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const SCRIPT_EXT: Readonly<Record<string, string>> = Object.freeze({
  javascript: ".js", typescript: ".ts", python: ".py", powershell: ".ps1",
});
const SCRIPT_NAME = "code";
const TMP_PREFIX = "ctx-exec-";
// TECH-SPEC GP4: PowerShell scripts carry a UTF-8 BOM plus a console-encoding prelude (D-M2-T10-3).
const PS_BOM = "﻿";
const PS_PRELUDE = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8";
const PS_ARGS: readonly string[] = Object.freeze(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]);
// GP4/deleted-cwd-no-ansi (#1286): plain output even when the parent sets FORCE_COLOR (D-M2-T10-4).
const PLAIN_OUTPUT_ENV: Readonly<Record<string, string>> = Object.freeze({ NO_COLOR: "1", FORCE_COLOR: "0" });
// Q8 (v1 grep rule): a shell exit 1 with empty stderr is "no match", not an error (D-M2-T10-1).
const SOFT_EXIT = 1;

// Step 9 (D-M2-T10-2): the background launcher runs through runProcess like any other call. "start"
// starts itself again detached in "run" mode, prints that pid and exits; "run" leads the new process
// group, runs the code, then removes the temp dir. The pid names the whole background tree.
const LAUNCHER = [
  'const { spawn } = require("node:child_process");',
  'const { rmSync } = require("node:fs");',
  "const [mode, dir, ...argv] = process.argv.slice(1);",
  'if (mode === "start") {',
  '  const b = spawn(process.execPath, [...process.execArgv, "--", "run", dir, ...argv], { detached: true, stdio: "ignore", windowsHide: true });',
  "  b.unref();",
  "  process.stdout.write(String(b.pid));",
  "} else {",
  '  const done = () => { if (dir !== "") rmSync(dir, { recursive: true, force: true }); };',
  '  const c = spawn(argv[0], argv.slice(1), { stdio: "ignore", windowsHide: true });',
  '  c.on("close", done);',
  '  c.on("error", done);',
  "}",
].join("\n");

function fail(text: string, journal?: JournalFacts): ToolReply {
  return journal === undefined ? { text, isError: true, sandboxBytes: 0 } : { text, isError: true, sandboxBytes: 0, journal };
}

// Step 1: one line from the first zod issue.
function schemaLine(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") return new CtxError("UNKNOWN_FIELD", { f: issue.keys[0] }).toLine();
  return issue.message;
}

// Step 3 (D-M2-T10-5): `resolve` has already removed every "..", and a component that does not exist
// cannot be a symlink, so the nearest existing ancestor decides containment. A file that does not exist
// yet inside the project still runs (GP4/deleted-cwd-no-ansi); the code sees CTX_FILE and decides.
function fileError(given: string, abs: string, root: string): string | null {
  let dir = abs;
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  if (isInside(root, dir)) return null;
  return new CtxError("OUTSIDE_ROOT", { p: given, root }).toLine();
}

function takesDashC(language: string, runtime: string): boolean {
  if (language === "shell") return true;
  if (SCRIPT_EXT[language] !== undefined) return false;
  return SHELL_FAMILY.includes(parse(runtime).name);
}

// Step 5 for runtimes that read a file.
function scriptArgv(language: string, runtime: string, file: string): string[] {
  return language === "powershell" ? [runtime, ...PS_ARGS, file] : [runtime, file];
}

function scriptText(language: string, code: string): string {
  return language === "powershell" ? PS_BOM + PS_PRELUDE + "\n" + code : code;
}

function summaryLine(exitCode: number, fullBytes: number): string {
  return "exit " + exitCode + " · " + fullBytes + " B";
}

function echoBlock(language: string, code: string): string {
  return "```" + language + "\n" + code + "\n```";
}

// Step 15: "ctx_execute:" + the code's first line, at most SOURCE_LABEL_MAX_CHARS code points.
function sourceLabel(code: string): string {
  const nl = code.indexOf("\n");
  const first = nl < 0 ? code : code.slice(0, nl);
  return Array.from(TOOL + ":" + first).slice(0, SOURCE_LABEL_MAX_CHARS).join("");
}

// Same text as select.ts moreLine; reserved in the budget so the reply always ends with it (D-M2-6).
function moreReserve(intent: string, label: string): number {
  return Buffer.byteLength(moreLine(intent, label), "utf8");
}

function spawnFailed(argv0: string, cwd: string): string {
  return new CtxError("SPAWN_FAILED", { detail: argv0 + " gave no exit code in " + cwd }).toLine();
}

// Steps 12-17.
async function finish(input: ExecuteInput, ctx: ToolContext, r: RunResult, exitCode: number, journal: JournalFacts): Promise<ToolReply> {
  const isError = exitCode !== 0 && !(input.language === "shell" && exitCode === SOFT_EXIT && r.stderr.length === 0);
  const combined = r.stdout.toString("utf8") + (exitCode !== 0 ? r.stderr.toString("utf8") : "");
  const fullBytes = Buffer.byteLength(combined, "utf8");
  const head = summaryLine(exitCode, fullBytes);
  const intent = input.intent ?? "";
  // Step 14: the whole reply, summary and echo included, fits; nothing to index (D-M2-T10-6).
  const direct = head + "\n" + (input.summary === true ? echoBlock(input.language, input.code) + "\n" : "") + combined;
  if (intent === "" && Buffer.byteLength(direct, "utf8") <= OUTPUT_CAP) {
    return { text: direct, isError, sandboxBytes: fullBytes, journal };
  }
  // Steps 15-17: index the full output, then select whole chunks within what is left of the cap.
  const label = sourceLabel(input.code);
  const budget = OUTPUT_CAP - Buffer.byteLength(head, "utf8") - 2 - moreReserve(intent, label);
  const db = await openDb(ctx.project);
  let picked: { text: string; more: string | null };
  try {
    const { sourceId } = indexText(db, ctx.project, ctx.sessionId, label, combined, "text");
    picked = selectChunks(db, sourceId, intent, budget);
  } finally {
    closeDb(db);
  }
  const text = head + "\n" + picked.text + (picked.more === null ? "" : "\n" + picked.more);
  return { text: capBytes(text, OUTPUT_CAP).text, isError, sandboxBytes: fullBytes, journal };
}

async function handler(raw: ExecuteInput, ctx: ToolContext): Promise<ToolReply> {
  // Step 1.
  const parsed = ctxExecuteSchema.safeParse(raw);
  if (!parsed.success) return fail(schemaLine(parsed.error.issues[0]));
  const input: ExecuteInput = parsed.data;
  // Steps 2-3.
  const cwd = ctx.project.worktree;
  const extra: Record<string, string> = { ...PLAIN_OUTPUT_ENV };
  if (input.file !== undefined) {
    const abs = resolve(cwd, input.file);
    const bad = fileError(input.file, abs, ctx.project.containmentRoot);
    if (bad !== null) return fail(bad);
    extra.CTX_FILE = abs;
  }
  // Step 4.
  const runtime = findRuntime(input.language);
  if (runtime === null) return fail(noRuntimeError(input.language).toLine());
  // Steps 6-7.
  const env = buildChildEnv(process.env, extra);
  const timeoutMs = input.timeoutMs ?? EXEC_TIMEOUT_MS;
  const journal: JournalFacts = { kind: "cmd", key: canonicalKey(TOOL, input.code), path: input.file ?? null, exit_code: null };
  let tmpDir: string | null = null;
  let handedOff = false;
  try {
    // Step 5: argv only, never a parent shell; temp files live outside the project and are removed.
    let argv: string[];
    if (takesDashC(input.language, runtime)) {
      argv = [runtime, "-c", input.language === "shell" ? rewriteWindowsBuildTools(input.code, process.platform) : input.code];
    } else {
      tmpDir = mkdtempSync(join(tmpdir(), TMP_PREFIX));
      const file = join(tmpDir, SCRIPT_NAME + (SCRIPT_EXT[input.language] ?? ""));
      writeFileSync(file, scriptText(input.language, input.code), "utf8");
      argv = scriptArgv(input.language, runtime, file);
    }
    // Step 9.
    if (input.background === true) {
      const r = await runProcess([process.execPath, "-e", LAUNCHER, "--", "start", tmpDir ?? "", ...argv], { cwd, env, signal: ctx.signal, timeoutMs });
      const pid = r.stdout.toString("utf8");
      if (r.exitCode !== 0 || pid === "" || !Number.isSafeInteger(Number(pid))) return fail(spawnFailed(argv[0], cwd), journal);
      handedOff = true;
      return { text: BACKGROUND_REPLY_PREFIX + pid, isError: false, sandboxBytes: 0, journal };
    }
    // Steps 8, 10, 11.
    const r = await runProcess(argv, { cwd, env, signal: ctx.signal, timeoutMs });
    if (r.killed === "timeout") return fail(new CtxError("TIMEOUT", { ms: timeoutMs }).toLine(), journal);
    if (r.killed === "cancel") return fail(CANCELLED_LINE, journal);
    // D-M2-T10-4: no exit code = the process did not start (deleted cwd, runtime gone) or died by an
    // outside signal. One line, no fallback directory.
    if (r.exitCode === null) return fail(spawnFailed(argv[0], cwd), journal);
    return await finish(input, ctx, r, r.exitCode, { ...journal, exit_code: r.exitCode });
  } catch (err) {
    // Step 18: one line, never a stack.
    if (err instanceof CtxError) return fail(err.toLine(), journal);
    if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === "string") {
      return fail(new CtxError("SPAWN_FAILED", { detail: err.message }).toLine(), journal);
    }
    throw err;
  } finally {
    if (tmpDir !== null && !handedOff) rmSync(tmpDir, { recursive: true, force: true });
  }
}

export const ctxExecute = {
  name: TOOL,
  schema: ctxExecuteSchema,
  readOnly: false,
  alwaysLoad: true,
  handler,
} as const;
