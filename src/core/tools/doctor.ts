// src/core/tools/doctor.ts — ctx_doctor thin handler (impl/07 §5, ADR-0010, impl/11 §1).
// Runs D1-D11 in DOCTOR_CHECK_ORDER through the ops/doctor-* row builders, heals context.db when D8's
// integrity_check failed (the one write, ops/db-heal.ts), renders buildReport. Never isError: a broken
// check is a row, not a tool error. DEVIATIONS D-M5-arch-3/4/5, D-M5-U1-6, D-M5-D6-1..3.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod/v4";
import { getAdapter } from "../../adapters/table.ts";
import {
  D5_LAST_HOOK_ERROR, D5_PAST_HOOK_ERROR, DOCTOR_CHECK_ORDER, DOCTOR_DOCS_LABEL, DOCTOR_DOCS_LINK, DOCTOR_LABEL, OWNER_PID_EXT, OWNERS_DIR_NAME,
  NATIVE_INSTALL, PI_LIST_COMMAND, PROJECTS_DIR_NAME, REPORT_ENV_ENUMS, BUNDLE_SHA, D1_REGISTRY_URL, DOCTOR_GIT_TIMEOUT_MS, REPORT_CAP, REPORT_SOURCE_LABEL,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type {
  AdapterRow, CtxDoctorInput, DbHandle, DoctorCheckId, DoctorRow, ToolContext, ToolReply,
} from "../contracts/types.ts";
import { ownBundleDir } from "../ops/bundle-dir.ts";
import { checkDoubleFire, checkHostConfig, checkV1Leftovers } from "../ops/doctor-config.ts";
import { checkDb, checkIndex } from "../ops/doctor-db.ts";
import type { DbCheck } from "../ops/doctor-db.ts";
import { bundleVersion, checkMcp, checkMode, checkNode, checkProject, checkShell, checkVersion } from "../ops/doctor-env.ts";
import { checkHookRoundTrip } from "../ops/doctor-hook.ts";
import { lastHookError } from "../hooks/fallback.ts";
import { healD8, healOrphan } from "../ops/db-heal.ts";
import { buildReport, buildReportHead } from "../ops/report.ts";
import { environmentLine, writeIssueReport } from "../ops/doctor-issue.ts";
import { claudeDirOf, codexDirOf, codexRunDirOf, homeDirOf, copilotDirOf, geminiDirOf, kiroDirOf, opencodeDirOf, piAgentDirOf, requireHomeDir, resolveConfigDir } from "../project/config-dir.ts";
import { indexText } from "../index/text.ts";
import { buildChildEnv } from "../sandbox/env.ts";
import { closeDb, openDb } from "../store/db.ts";

export type { CtxDoctorInput } from "../contracts/types.ts";

/** Process facts the checks read; the handler builds them from the live process (D-M5-D6-1). */
export interface DoctorHost {
  env: NodeJS.ProcessEnv;      // live env: HOME for host configs and ~/.context-mode, PATH for git and node
  bundleDir: string;           // directory of the running server bundle; hook.mjs and fixtures/ sit here
  piCwd: string | undefined;   // Pi's ctx.cwd captured at plugin load; undefined for every other agent
}

// impl/07 §5: no input fields; any key is rejected by the server before the handler runs.
export const ctxDoctorSchema = z.object({}).strict();

function lineOf(err: unknown): string {
  if (err instanceof CtxError) return err.toLine();
  return err instanceof Error ? err.message : String(err);
}

// ADR-0010 "doctor always answers": a check that throws is reported as UNKNOWN with its cause (D-M5-D6-2).
async function guard(id: DoctorCheckId, run: () => DoctorRow | Promise<DoctorRow>): Promise<DoctorRow> {
  try {
    return await run();
  } catch (err) {
    return { id, label: DOCTOR_LABEL[id], status: "UNKNOWN", detail: lineOf(err) };
  }
}

// D5 Codex trust sub-case reads the journal; doctor never creates context.db, so no file means no handle.
async function codexDb(ctx: ToolContext, adapter: AdapterRow): Promise<DbHandle | null> {
  if (adapter.id !== "codex" || !existsSync(ctx.project.dbPath)) return null;
  try {
    return await openDb(ctx.project, { readOnly: true });
  } catch {
    return null; // a stale or corrupt DB is D8's row; D5 then sees no journal
  }
}

async function hookRow(ctx: ToolContext, adapter: AdapterRow, host: DoctorHost): Promise<DoctorRow> {
  const db = await codexDb(ctx, adapter);
  const runStart = Date.now();
  try {
    const row = await checkHookRoundTrip({
      worktree: ctx.project.worktree,
      agent: adapter.id,
      bundleDir: host.bundleDir,
      env: buildChildEnv(host.env),
      signal: ctx.signal,
      codexConfigDir: codexDirOf(host.env, requireHomeDir(host.env)), // = codexRunDirOf: runDoctorChecks sets CODEX_HOME for codex (D-CODEX-HOME-RUN-1)
      db,
    });
    // D-HNE-GUARD-1: the hook never errors, it logs; D5 names the last logged failure so the user sees it.
    const last = lastHookError(host.env);
    if (last === null) return row;
    // D-D5-PAST-1: only an error logged since this run began is current; an older line is labelled past (the log stays whole).
    const text = Date.parse(last.ts) >= runStart ? D5_LAST_HOOK_ERROR : D5_PAST_HOOK_ERROR;
    return { ...row, detail: row.detail + text(last.ts, last.stage, last.label) };
  } finally {
    if (db !== null) closeDb(db);
  }
}

// D-M5-D5-1 needs this server's id: the owner file whose PID is this process (impl/02 §7). None -> "".
function ownServerId(configDir: string, projectKey: string): string {
  const dir = join(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME);
  if (!existsSync(dir)) return "";
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(OWNER_PID_EXT)) continue;
    if (readFileSync(join(dir, name), "utf8").trim() === String(process.pid)) return basename(name, OWNER_PID_EXT);
  }
  return "";
}

/** impl/07 §5: D1-D10 one at a time in DOCTOR_CHECK_ORDER, then step 7 (D8 heal) after every row is built. */
export async function runDoctorChecks(ctx: ToolContext, adapter: AdapterRow, host0: DoctorHost): Promise<DoctorRow[]> {
  // D-CODEX-HOME-RUN-1: a Codex session may start the server with HOME and CODEX_HOME unset; D3, D4, D5 and every codex
  // app-server call then read the Codex home the running plugin sits in, so CODEX_HOME names it from here on.
  const host = adapter.id === "codex" ? { ...host0, env: { ...host0.env, CODEX_HOME: codexRunDirOf(host0.env, homeDirOf(host0.env) ?? "", host0.bundleDir) } } : host0;
  const env = host.env;
  const project = ctx.project;
  let integrityFailed = false;
  let orphan: DbCheck["orphan"] = [];
  const checks: Record<DoctorCheckId, () => DoctorRow | Promise<DoctorRow>> = {
    D1: () => checkVersion({ bundleSha: BUNDLE_SHA, version: bundleVersion(host.bundleDir), registryUrl: D1_REGISTRY_URL, timeoutMs: DOCTOR_GIT_TIMEOUT_MS, env: buildChildEnv(env), cwd: project.worktree, signal: ctx.signal }),
    D2: () => checkNode({ nodeVersion: process.version, bunVersion: process.versions.bun }),
    D3: () => checkHostConfig(adapter, env, project.worktree),
    D4: () => checkV1Leftovers(adapter.id, requireHomeDir(env), { project: project.worktree, piAgentDir: piAgentDirOf(env, requireHomeDir(env)), claudeDir: claudeDirOf(env, requireHomeDir(env)), codexDir: codexDirOf(env, requireHomeDir(env)), geminiDir: geminiDirOf(env, requireHomeDir(env)), copilotDir: copilotDirOf(env, requireHomeDir(env)), kiroDir: kiroDirOf(env, requireHomeDir(env)), opencodeDir: opencodeDirOf(env, requireHomeDir(env)) }),
    D5: () => hookRow(ctx, adapter, host),
    D5b: () => checkDoubleFire(adapter.id, project.worktree),
    D6: () => checkMcp(ctx),
    D7: () => checkProject({ project, adapter, piCwd: host.piCwd }),
    D8: async () => {
      const r = await checkDb(project);
      integrityFailed = r.integrityFailed;
      orphan = r.orphan;
      return r.row;
    },
    D9: () => checkIndex(project),
    D10: () => checkMode(adapter),
    D11: () => checkShell(env),
  };
  const rows: DoctorRow[] = [];
  for (const id of DOCTOR_CHECK_ORDER) rows.push(await guard(id, checks[id]));
  const at = DOCTOR_CHECK_ORDER.indexOf("D8");
  // D-ORPHAN-WAL-1: a missing context.db with its WAL left: move the WAL files aside, start a new index.
  if (orphan.length > 0) {
    const files = orphan;
    rows[at] = await guard("D8", () => healOrphan(project, files, rows[at] as DoctorRow));
    return rows;
  }
  if (!integrityFailed) return rows;
  // Step 7: the sole write. healD8 returns the updated D8 row (PASS lossless, or FAIL recreate).
  rows[at] = await guard("D8", () => {
    const configDir = resolveConfigDir(env);
    return healD8({ project, configDir, serverId: ownServerId(configDir, project.projectKey), row: rows[at] as DoctorRow });
  });
  return rows;
}

// D-M5-D6-3: only env keys with a closed enum (REPORT_ENV_ENUMS) reach the report; others carry no fact.
function reportEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(REPORT_ENV_ENUMS)) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * D-DOCTOR-ISSUE-1: the reply. Line 1 is the environment line, then the table; when a row FAILs, the full issue
 * report goes to ~/.context-mode/reports/ and three lines under the table name it, the gh command and the form URL.
 */
export async function doctorReply(ctx: ToolContext, host: DoctorHost): Promise<ToolReply> {
  const adapter = getAdapter(ctx.project.agent); // step 1
  const rows = await runDoctorChecks(ctx, adapter, host); // step 2
  const failed = rows.some((r) => r.status === "FAIL");
  // ADR-0019 D7: name the CLI command; setup when a row failed (it repairs and verifies), else doctor.
  // D-R38-PI-CMD-1 (#1312): Pi installs through `pi install` and has no global context-mode CLI; name Pi's own commands.
  const command = adapter.id === "pi" ? (failed ? NATIVE_INSTALL.pi[0] : PI_LIST_COMMAND)
    : `context-mode ${failed ? "setup" : "doctor"} --agents ${adapter.id}`;
  const input = { agent: adapter.id, rows, env: reportEnv(host.env), command };
  const envLine = environmentLine(ctx, adapter, host.env, bundleVersion(host.bundleDir));
  const table = buildReport(input); // step 3
  let notes: string[] = [];
  if (failed) {
    try {
      notes = await writeIssueReport({ ctx, adapter, env: host.env, bundleDir: host.bundleDir, rows, envLine, table });
    } catch (err) {
      notes = [`Report file: ${lineOf(err)}`]; // ADR-0010: doctor always answers
    }
  }
  // D-DOCTOR-FIX-1: one docs link (UTM) under the table, for the first row that needs a look.
  const look = rows.find((r) => r.status === "FAIL") ?? rows.find((r) => r.status !== "PASS");
  const docs = look === undefined ? [] : [DOCTOR_DOCS_LABEL + DOCTOR_DOCS_LINK(look.id)];
  const whole = [envLine, table, ...docs, ...notes].join("\n");
  const bytes = Buffer.byteLength(whole, "utf8");
  if (bytes <= REPORT_CAP) return { text: whole, isError: false, sandboxBytes: bytes }; // step 4
  // D-NO-LOSSY-CUT-1: over the cap, the whole report is stored first; the reply holds the FAIL rows and the pointer.
  const db = await openDb(ctx.project);
  try {
    indexText(db, ctx.project, ctx.sessionId, REPORT_SOURCE_LABEL, whole, "text");
  } finally {
    closeDb(db);
  }
  const text = [envLine, buildReportHead(input), ...docs, ...notes].join("\n");
  return { text, isError: false, sandboxBytes: bytes };
}

async function handler(_input: CtxDoctorInput, ctx: ToolContext): Promise<ToolReply> {
  return doctorReply(ctx, { env: process.env, bundleDir: ownBundleDir(), piCwd: ctx.piCwd }); // D-R38-PI-D7-1: Pi passes its ctx.cwd
}

export const ctxDoctor = Object.freeze({
  name: "ctx_doctor",
  schema: ctxDoctorSchema,
  readOnly: false, // D8 heal is the one write (ADR-0010)
  alwaysLoad: false,
  handler,
});
