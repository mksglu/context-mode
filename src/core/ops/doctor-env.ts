// src/core/ops/doctor-env.ts — ctx_doctor environment rows: D1 version, D2 Node and node:sqlite, D6 MCP,
// D7 project and worktree, D10 enforcement mode.
// Spec: impl/07 §5 D1 D2 D6 D7 D10, ADR-0010; DEVIATIONS D-M5-arch-3, D-M5-arch-5, D-M5-C2-1, D-M5-U1-6, D-M5-D1-1.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import {
  D1_CAUSE_JOIN, D1_DEFAULT_TAG, D1_DEV_BUILD_DETAIL, D1_GIT_CANCEL, D1_GIT_CHECK_FIX, D1_GIT_EXIT, D1_GIT_MISSING, D1_GIT_NO_SHA,
  D1_GIT_NO_START, D1_GIT_PASS, D1_GIT_TIMEOUT, D1_LATEST_UNKNOWN, D1_NPM_CHECK_FIX, D1_NPM_ERROR, D1_NPM_HTTP, D1_NPM_NO_TAG,
  D1_NPM_PASS, D1_NPM_TIMEOUT, D1_NPM_UPDATE, D1_PACKAGE_FILE, D1_PREFIX, D1_PRERELEASE_SEP, D1_UPDATE_DETAIL, D10_DETAIL, D11_PASS_DETAIL, D11_POSIX_DETAIL, D11_POSIX_FIX, D11_WIN_DETAIL, D11_WIN_FIX, D2_BUN_DETAIL, D2_NODE_DETAIL, D2_NODE_FIX,
  D2_SQLITE_DETAIL, D2_SQLITE_FIX, D4_REASON_JOIN, D6_UNKNOWN_DETAIL, D7_DETAIL, D7_FIX, DOCTOR_FIX_UPGRADE,
  DOCTOR_GIT_TIMEOUT_MS, DOCTOR_LABEL, DOCTOR_PASS_DETAIL, GIT_BIN, GIT_LS_REMOTE, GIT_NO_PROMPT_ENV, GIT_SHA_HEX_LEN,
  LS_REMOTE_FIELD_SEP, NODE_MIN, NODE_VERSION_PREFIX, NODE_VERSION_SEP, RELEASE_BRANCH, RELEASE_REPO_URL, SQLITE_MODULE,
} from "../contracts/constants.ts";
import type { AdapterRow, DoctorCheckId, DoctorRow, ProjectContext, ToolContext } from "../contracts/types.ts";
import { findRuntime } from "../sandbox/runtimes.ts";
import { runProcess, type RunResult } from "../sandbox/spawn.ts";

function pass(id: DoctorCheckId, detail: string = DOCTOR_PASS_DETAIL): DoctorRow {
  return { id, label: DOCTOR_LABEL[id], status: "PASS", detail };
}
function unknown(id: DoctorCheckId, detail: string, fixCommand?: string): DoctorRow {
  return fixCommand === undefined ? { id, label: DOCTOR_LABEL[id], status: "UNKNOWN", detail } : { id, label: DOCTOR_LABEL[id], status: "UNKNOWN", detail, fixCommand };
}
function fail(id: DoctorCheckId, detail: string, fixCommand: string): DoctorRow {
  return { id, label: DOCTOR_LABEL[id], status: "FAIL", detail, fixCommand };
}

export interface VersionInput {
  bundleSha: string | undefined; // BUNDLE_SHA; undefined in dev/test builds (D-M5-arch-5)
  version: string | undefined;   // the installed version from <bundleDir>/package.json (bundleVersion)
  registryUrl: string;           // D1_REGISTRY_URL; read only when git fails
  timeoutMs: number;             // DOCTOR_GIT_TIMEOUT_MS; one limit for git and for the registry read
  env: Record<string, string>;   // live env: PATH finds git, HOME for its config
  cwd: string;
  signal: AbortSignal;
}

/** D-DOCTOR-D1-CAUSE-1: the version in <bundleDir>/package.json; no file or no string version is undefined. */
export function bundleVersion(bundleDir: string): string | undefined {
  try {
    const v: unknown = JSON.parse(readFileSync(join(bundleDir, D1_PACKAGE_FILE), "utf8")).version;
    return typeof v === "string" && v !== "" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The npm dist-tag of a version's channel: 2.0.0-next.26 -> "next", 2.0.0 -> "latest". */
export function channelOf(version: string): string {
  const at = version.indexOf(D1_PRERELEASE_SEP);
  if (at < 0) return D1_DEFAULT_TAG;
  const pre = version.slice(at + 1);
  const dot = pre.indexOf(".");
  const tag = dot < 0 ? pre : pre.slice(0, dot);
  return tag === "" ? D1_DEFAULT_TAG : tag;
}

function firstLine(b: Buffer): string {
  const text = b.toString("utf8").trim();
  const nl = text.indexOf("\n");
  return (nl < 0 ? text : text.slice(0, nl)).trim();
}

// The exact git cause, one line (D-DOCTOR-D1-CAUSE-1).
function gitCause(r: RunResult, timeoutMs: number): string {
  if (r.killed === "timeout") return D1_GIT_TIMEOUT(timeoutMs);
  if (r.killed === "cancel") return D1_GIT_CANCEL;
  if (r.exitCode === null) return D1_GIT_NO_START;
  return D1_GIT_EXIT(r.exitCode, firstLine(r.stderr));
}

type Latest = { ok: true; version: string } | { ok: false; cause: string };

function fetchCause(err: unknown, timeoutMs: number): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError") return D1_NPM_TIMEOUT(timeoutMs);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
  const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : "";
  const msg = cause instanceof Error ? cause.message : String(cause);
  return D1_NPM_ERROR(code !== "" && !msg.includes(code) ? `${code} ${msg}` : msg);
}

// After a git failure: the latest version of the channel from the npm registry, same timeout (D-PRIVACY-NET-1 lists it).
async function npmLatest(url: string, tag: string, signal: AbortSignal, timeoutMs: number): Promise<Latest> {
  try {
    const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
    if (!res.ok) return { ok: false, cause: D1_NPM_HTTP(res.status) };
    const body: unknown = await res.json();
    const v = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[tag] : undefined;
    return typeof v === "string" && v !== "" ? { ok: true, version: v } : { ok: false, cause: D1_NPM_NO_TAG(tag) };
  } catch (err) {
    return { ok: false, cause: fetchCause(err, timeoutMs) };
  }
}

// D1 (D-DOCTOR-D1-CAUSE-1): the bundle's commit sha vs the latest commit on RELEASE_BRANCH, through the git binary found on
// PATH (git.exe on Windows, started directly). When git is missing or fails, the latest version of the bundle's channel on
// npm decides. Every detail starts with "<version> (<short sha>)" and names the exact cause. A dev build, or no answer from
// either source, is UNKNOWN with the command that checks it by hand, never FAIL (ADR-0010 D1). Never throws.
export async function checkVersion(i: VersionInput): Promise<DoctorRow> {
  if (i.bundleSha === undefined) return unknown("D1", D1_DEV_BUILD_DETAIL);
  const head = D1_PREFIX(i.version, i.bundleSha) + ": ";
  const git = findRuntime(GIT_BIN, i.env);
  let cause = D1_GIT_MISSING;
  if (git !== null) {
    const r = await runProcess([git, GIT_LS_REMOTE, RELEASE_REPO_URL, RELEASE_BRANCH], {
      cwd: i.cwd,
      env: { ...i.env, ...GIT_NO_PROMPT_ENV },
      signal: i.signal,
      timeoutMs: i.timeoutMs,
    });
    if (r.exitCode === 0 && r.killed === null) {
      const latest = r.stdout.toString("utf8").split(LS_REMOTE_FIELD_SEP)[0];
      if (latest.length === GIT_SHA_HEX_LEN) {
        return latest === i.bundleSha ? pass("D1", head + D1_GIT_PASS) : fail("D1", head + D1_UPDATE_DETAIL, DOCTOR_FIX_UPGRADE);
      }
      cause = D1_GIT_NO_SHA;
    } else {
      cause = gitCause(r, i.timeoutMs);
    }
  }
  const handFix = git === null ? D1_NPM_CHECK_FIX : D1_GIT_CHECK_FIX;
  if (i.version === undefined) return unknown("D1", head + D1_LATEST_UNKNOWN + ", " + cause, handFix);
  const tag = channelOf(i.version);
  const npm = await npmLatest(i.registryUrl, tag, i.signal, i.timeoutMs);
  if (!npm.ok) return unknown("D1", head + D1_LATEST_UNKNOWN + ", " + cause + D1_CAUSE_JOIN + npm.cause, handFix);
  if (npm.version === i.version) return pass("D1", head + D1_NPM_PASS(tag) + D1_CAUSE_JOIN + cause);
  return fail("D1", head + D1_NPM_UPDATE(tag, npm.version) + D1_CAUSE_JOIN + cause, DOCTOR_FIX_UPGRADE);
}

export interface NodeInput {
  nodeVersion: string;             // process.version, e.g. "v24.15.0"
  bunVersion: string | undefined;  // process.versions.bun
}

function numbers(v: string): number[] {
  const bare = v.startsWith(NODE_VERSION_PREFIX) ? v.slice(NODE_VERSION_PREFIX.length) : v;
  return bare.split(NODE_VERSION_SEP).map(Number);
}

function belowMin(version: string): boolean {
  const got = numbers(version);
  const min = numbers(NODE_MIN);
  for (let k = 0; k < min.length; k++) {
    const g = got[k] ?? 0;
    if (g !== min[k]) return g < min[k];
  }
  return false;
}

async function sqliteLoads(): Promise<boolean> {
  try {
    await import(SQLITE_MODULE);
    return true;
  } catch {
    return false;
  }
}

// D2: Node at or above NODE_MIN and node:sqlite loads. A Bun runtime is named on every status (ADR-0010 D2).
export async function checkNode(i: NodeInput): Promise<DoctorRow> {
  const bun = i.bunVersion === undefined ? [] : [D2_BUN_DETAIL(i.bunVersion)];
  const withBun = (detail: string): string => [detail, ...bun].join(D4_REASON_JOIN);
  if (belowMin(i.nodeVersion)) return fail("D2", withBun(D2_NODE_DETAIL(i.nodeVersion)), D2_NODE_FIX);
  if (!(await sqliteLoads())) return fail("D2", withBun(D2_SQLITE_DETAIL), D2_SQLITE_FIX);
  return pass("D2", bun.length === 0 ? DOCTOR_PASS_DETAIL : bun.join(D4_REASON_JOIN));
}

// D6: client name and protocol version from the live request. Missing both is UNKNOWN, never FAIL (PRD §13).
export function checkMcp(ctx: Pick<ToolContext, "clientInfo" | "protocolVersion">): DoctorRow {
  const named = ctx.clientInfo !== undefined && ctx.clientInfo.name !== "";
  const versioned = ctx.protocolVersion !== undefined && ctx.protocolVersion !== "";
  return named || versioned ? pass("D6") : unknown("D6", D6_UNKNOWN_DETAIL);
}

export interface ProjectInput {
  project: ProjectContext;
  adapter: Pick<AdapterRow, "id" | "projectSource">;
  piCwd: string | undefined; // Pi's ctx.cwd captured at plugin load; undefined for every other agent
}

// Pi: the resolved worktree must contain the live ctx.cwd (both realpaths).
function piCwdInside(worktree: string, piCwd: string | undefined): boolean {
  if (piCwd === undefined || !existsSync(piCwd)) return false;
  const rel = relative(worktree, realpathSync.native(piCwd));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// D7: ctx.project.source equals the adapter's declared projectSource; for pi the worktree holds piCwd.
export function checkProject(i: ProjectInput): DoctorRow {
  const bad = fail("D7", D7_DETAIL(i.project.source), D7_FIX);
  if (i.project.source !== i.adapter.projectSource) return bad;
  if (i.adapter.projectSource === "pi:ctx.cwd" && !piCwdInside(i.project.worktree, i.piCwd)) return bad;
  return pass("D7");
}

// D10: the adapter's denyChannel as row data, always PASS (D-M5-arch-3: no enforcement import).
export function checkMode(adapter: Pick<AdapterRow, "denyChannel">): DoctorRow {
  return pass("D10", D10_DETAIL(adapter.denyChannel));
}

// D11 (D-VT-WINBASH-1): the shell ctx_execute and ctx_batch start. Windows: Git Bash from the installed Git; POSIX: sh on PATH.
// No shell is a FAIL, never a silent switch to another shell.
export function checkShell(env: NodeJS.ProcessEnv): DoctorRow {
  const win = process.platform === "win32";
  const shell = findRuntime("shell", env);
  if (shell !== null) return pass("D11", D11_PASS_DETAIL(shell, win));
  return win ? fail("D11", D11_WIN_DETAIL, D11_WIN_FIX) : fail("D11", D11_POSIX_DETAIL, D11_POSIX_FIX);
}
