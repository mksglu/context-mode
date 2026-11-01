// D-CR3-WATCHDOG-1: process-group spawn and kill for live runners. `child.kill()` signals only the direct
// child; a model-run grandchild (`find /`) keeps the stdout pipe open, so "close" never fires and the run
// hangs. spawnGroup starts the child as a process-group leader (detached: true on POSIX); killGroup sends
// SIGKILL to the whole group (negative pid). New runs only: the frozen runners (e2e/live/compact-hard/run.mjs,
// bench/m2/eval.mjs) import no shared harness and stay unchanged; see https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/compact/RESULT.md.
import { spawn } from "node:child_process";

/** spawn() with the child as the leader of its own process group (POSIX). */
export function spawnGroup(cmd, args, opts = {}) {
  return spawn(cmd, args, { ...opts, detached: process.platform !== "win32" });
}

/** SIGKILL the child's whole process group. Returns false when no such group is left. */
export function killGroup(child, signal = "SIGKILL") {
  if (child.pid === undefined) return false;
  try {
    if (process.platform === "win32") return child.kill(signal);
    process.kill(-child.pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Arm a watchdog: after `ms` kill the group and call onFire(). Returns a disarm function. */
export function watchdog(child, ms, onFire = () => {}) {
  const t = setTimeout(() => { killGroup(child); onFire(); }, ms);
  child.once("close", () => clearTimeout(t));
  return () => clearTimeout(t);
}

/**
 * Run a command in its own process group and collect its output. On timeout the whole group is killed
 * (D-CR3-WATCHDOG-1), so a grandchild such as a model-run `find /` cannot outlive the run.
 * Resolves { status, stdout, stderr, timedOut }; status is null when the run was killed.
 */
export function runGroup(cmd, args, opts = {}, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawnGroup(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const disarm = watchdog(child, timeoutMs, () => { timedOut = true; });
    child.on("error", (e) => { disarm(); reject(e); });
    child.on("close", (status) => { disarm(); resolve({ status, stdout, stderr, timedOut }); });
  });
}
