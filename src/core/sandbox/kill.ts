// impl/03 §4, AS1, AS4, AS5, DECISIONS-r9 F6: POSIX process-group SIGTERM then SIGKILL after
// KILL_GRACE_MS; Windows `taskkill /F /T /PID` with no shell. Never a Job Object (needs a new ADR).
import { execFileSync } from "node:child_process";
import { KILL_GRACE_MS } from "../contracts/constants.ts";

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    // Negative pid = every process in group `pid` (the child is spawned detached, so it leads its group).
    process.kill(-pid, signal);
  } catch {
    // ESRCH: the group is already gone. Any other kill error is also not the caller's concern (§4 Error cases).
  }
}

/** Best-effort kill of the tree rooted at `pid`. Returns at once; never throws. */
export function killTree(pid: number): void {
  if (process.platform !== "win32") {
    signalGroup(pid, "SIGTERM");
    // DEVIATIONS D-M2-T4-1: void signature gives the caller no handle, so the timer is unref'd and
    // a SIGKILL to a group that already exited is a swallowed ESRCH.
    setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS).unref();
    return;
  }
  try {
    execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
  } catch {
    // Non-zero exit: the process is already gone (§4 step 2b).
  }
}
