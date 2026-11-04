// impl/07 §6 step 4a, ADR-0010 §3 (git checkout installs: pi, opencode; no npm), DEVIATIONS D-M5-U1-1, D-M5-U2-1.
// Clones the release branch into <DATA_ROOT>/plugins/<agent>/.fetch-<pid>, reads HEAD, renames the dir to <sha>.
// argv only, shell:false (runProcess), GIT_NO_PROMPT_ENV, any git failure is FETCH_FAILED.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  DATA_PLUGINS_DIR_NAME, GIT_BIN, GIT_CLONE_ARGS, GIT_EXIT_LABEL, GIT_HEAD_SHA_ARGS, GIT_NO_CRLF_ENV, GIT_NO_PROMPT_ENV, GIT_NOT_STARTED,
  RELEASE_BRANCH, UPGRADE_AREA_KEY_SEP, UPGRADE_FETCH_DIR_PREFIX, UPGRADE_GIT_TIMEOUT_MS,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { AgentId } from "../contracts/types.ts";
import { resolveConfigDir } from "../project/config-dir.ts";
import { buildChildEnv } from "../sandbox/env.ts";
import { findRuntime } from "../sandbox/runtimes.ts";
import { runProcess, type RunResult } from "../sandbox/spawn.ts";
import { renameWithRetry, type AtomicOptions } from "./atomic-file.ts";

export interface ReleaseFetchResult {
  sha: string; // HEAD of the cloned release branch
  dir: string; // absolute <DATA_ROOT>/plugins/<agent>/<sha>
}

// FETCH_FAILED <code>: "git did not start", or "git exit <n|timeout|cancel>: <stderr>" (D-M5-U2-1).
function failed(r: RunResult): CtxError {
  if (r.exitCode === null && r.killed === null) return new CtxError("FETCH_FAILED", { code: GIT_NOT_STARTED });
  const status = r.killed ?? String(r.exitCode);
  return new CtxError("FETCH_FAILED", { code: GIT_EXIT_LABEL + status + UPGRADE_AREA_KEY_SEP + r.stderr.toString().trim() });
}

async function git(bin: string, args: readonly string[], cwd: string, env: Record<string, string>, signal: AbortSignal): Promise<string> {
  const r = await runProcess([bin, ...args], { cwd, env, signal, timeoutMs: UPGRADE_GIT_TIMEOUT_MS });
  if (r.exitCode !== 0 || r.killed !== null) throw failed(r);
  return r.stdout.toString().trim();
}

/**
 * impl/07 §6 step 4a: a new version dir for a git-checkout agent. A leftover .fetch-<pid> of this pid is
 * removed first; on any failure the .fetch dir is removed. When <sha> already exists it is kept as is and
 * the fresh clone is removed. Does not verify sums or swap `current` (verify-sums.ts, plugin-swap.ts).
 */
export async function fetchRelease(agent: AgentId, url: string, env: NodeJS.ProcessEnv, signal: AbortSignal, opts: AtomicOptions = {}): Promise<ReleaseFetchResult> {
  const agentDir = join(resolveConfigDir(env), DATA_PLUGINS_DIR_NAME, agent);
  mkdirSync(agentDir, { recursive: true });
  const fetchDir = join(agentDir, UPGRADE_FETCH_DIR_PREFIX + process.pid);
  rmSync(fetchDir, { recursive: true, force: true });
  // DEVIATIONS D-M7-W2-1: git is resolved by the one PATH/PATHEXT walk (findRuntime) on the caller's PATH,
  // so Windows spawns git.exe directly instead of handing a bare "git" to sh as a script (exit 126).
  const gitBin = findRuntime(GIT_BIN, env);
  if (gitBin === null) throw new CtxError("FETCH_FAILED", { code: GIT_NOT_STARTED });
  // DEVIATIONS D-M7-CI-1: no CRLF rewrite on Windows (set by env, argv stays as the spec), so the cloned bytes match SHA256SUMS.
  const childEnv = buildChildEnv(env, { ...GIT_NO_PROMPT_ENV, ...GIT_NO_CRLF_ENV });
  try {
    await git(gitBin, [...GIT_CLONE_ARGS, RELEASE_BRANCH, url, fetchDir], agentDir, childEnv, signal);
    const sha = await git(gitBin, GIT_HEAD_SHA_ARGS, fetchDir, childEnv, signal);
    const dir = join(agentDir, sha);
    if (existsSync(dir)) rmSync(fetchDir, { recursive: true, force: true });
    else renameWithRetry(fetchDir, dir, opts); // DEVIATIONS D-WIN-ATOMIC-2
    return { sha, dir };
  } catch (e) {
    rmSync(fetchDir, { recursive: true, force: true });
    throw e;
  }
}
