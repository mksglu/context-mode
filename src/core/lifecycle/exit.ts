// impl/11 §4. Exit on stdin EOF only; no timer, probe or `ps` call while idle (PRD P5, GP9).
// Parent death closes the stdin pipe on every OS, so it reaches this same `end` path
// (Assumptions A1, A2; DECISIONS-r9 F6: no Job Object, no ppid polling).
import { EXIT_SIGKILL_MS, EXIT_SIGTERM_MS } from "../contracts/constants.ts";

export function installExitGuard(opts: { onShutdown: () => void; isTTY: boolean }): void {
  // §4 step 1: TTY gate (#534, #236). A terminal run never exits on idle.
  if (opts.isTTY) return;

  // §4 steps 2-5: one `end` listener; timers start only after EOF and never hold the loop.
  process.stdin.once("end", () => {
    opts.onShutdown();
    const sigtermTimer = setTimeout(() => {
      // §4 step 4: the default SIGTERM handler should have exited by now; this module does not re-send it.
      console.error("context-mode: still running " + EXIT_SIGTERM_MS + " ms after SIGTERM");
    }, EXIT_SIGTERM_MS);
    const sigkillTimer = setTimeout(() => {
      process.kill(process.pid, "SIGKILL");
    }, EXIT_SIGKILL_MS);
    sigtermTimer.unref();
    sigkillTimer.unref();
    process.once("exit", () => {
      clearTimeout(sigtermTimer);
      clearTimeout(sigkillTimer);
    });
    process.kill(process.pid, "SIGTERM");
  });
}
