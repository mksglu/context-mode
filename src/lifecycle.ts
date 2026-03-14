/**
 * lifecycle — Process lifecycle guard for MCP server.
 *
 * Detects parent process death, stdin close, and OS signals to prevent
 * orphaned MCP server processes consuming 100% CPU (issue #103).
 *
 * Cross-platform: macOS, Linux, Windows.
 */

export interface LifecycleGuardOptions {
  /** Interval in ms to check parent liveness. Default: 30_000 */
  checkIntervalMs?: number;
  /** Called when parent death or stdin close is detected. */
  onShutdown: () => void;
  /** Injectable parent-alive check (for testing). Default: ppid-based check. */
  isParentAlive?: () => boolean;
}

/**
 * Default parent liveness check.
 * Compares current ppid against the original — if it changed (reparented to
 * init/launchd/systemd), parent is dead. This is more reliable than
 * kill(ppid, 0) which succeeds for PID 1 on all platforms.
 *
 * On Windows, ppid becomes 0 when parent exits.
 */
const originalPpid = process.ppid;

function defaultIsParentAlive(): boolean {
  const ppid = process.ppid;
  if (ppid !== originalPpid) return false;
  if (ppid === 0 || ppid === 1) return false;
  return true;
}

/**
 * Start the lifecycle guard. Returns a cleanup function.
 * Skipped automatically when stdin is a TTY (e.g. OpenCode ts-plugin).
 */
export function startLifecycleGuard(opts: LifecycleGuardOptions): () => void {
  const interval = opts.checkIntervalMs ?? 30_000;
  const check = opts.isParentAlive ?? defaultIsParentAlive;
  let stopped = false;

  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    opts.onShutdown();
  };

  // P0: Periodic parent liveness check
  const timer = setInterval(() => {
    if (!check()) shutdown();
  }, interval);
  timer.unref();

  // P0: Stdin close — parent pipe broken
  // Must resume stdin to receive close/end events (Node starts paused)
  const onStdinClose = () => shutdown();
  process.stdin.resume();
  process.stdin.on("end", onStdinClose);
  process.stdin.on("close", onStdinClose);
  process.stdin.on("error", onStdinClose);

  // P0: OS signals — terminal close, kill, ctrl+c
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  if (process.platform !== "win32") signals.push("SIGHUP");
  for (const sig of signals) process.on(sig, shutdown);

  return () => {
    stopped = true;
    clearInterval(timer);
    process.stdin.removeListener("end", onStdinClose);
    process.stdin.removeListener("close", onStdinClose);
    process.stdin.removeListener("error", onStdinClose);
    for (const sig of signals) process.removeListener(sig, shutdown);
  };
}
