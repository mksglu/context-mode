/**
 * lifecycle — Process lifecycle guard for MCP server.
 *
 * Detects parent process death (ppid polling) and OS signals to prevent
 * orphaned MCP server processes consuming 100% CPU (issue #103).
 *
 * Stdin close is NOT used as a *standalone* shutdown signal — the MCP stdio
 * transport owns stdin and transient pipe events cause spurious -32000
 * errors (#236). We do, however, treat stdin EOF as a hint to re-run the
 * parent-liveness probe immediately (instead of waiting up to 30 s for the
 * next poll tick), which closes the multi-day CPU-spin window seen in
 * #311/#388 without reintroducing the false-positive shutdowns of #236.
 *
 * Additionally, for MCP BRIDGE CHILDREN only (CONTEXT_MODE_BRIDGE_DEPTH>0), a
 * request-idle self-shutdown reaps a child that a pi/omp sub-context abandoned
 * while its long-lived parent keeps running (#854) — gated so the depth-0
 * keep-alive servers #602 restored are never reaped, never via stdin EOF, and
 * never while a tool call is in flight (#643).
 *
 * Cross-platform: macOS, Linux, Windows.
 */

import { execFileSync } from "node:child_process";

export interface LifecycleGuardOptions {
  /** Interval in ms to check parent liveness. Default: 30_000 */
  checkIntervalMs?: number;
  /** Called when parent death or OS signal is detected. */
  onShutdown: () => void;
  /** Injectable parent-alive check (for testing). Default: ppid-based check. */
  isParentAlive?: () => boolean;
  /**
   * #854: request-idle shutdown timeout (ms) for MCP bridge children. Default:
   * {@link bridgeChildIdleTimeoutMs}() — 0 (disabled) unless CONTEXT_MODE_BRIDGE_DEPTH>0.
   * Exposed for testing.
   */
  bridgeIdleMs?: number;
}

/** Read grandparent PID via `ps -o ppid= -p $PPID`. Returns NaN on failure or Windows. */
function readGrandparentPpidImpl(): number {
  if (process.platform === "win32") return NaN;
  const ppid = process.ppid;
  if (!ppid || ppid <= 1) return NaN;
  try {
    const out = execFileSync("ps", ["-o", "ppid=", "-p", String(ppid)], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? n : NaN;
  } catch {
    return NaN;
  }
}

/** Injectable dependencies for {@link makeDefaultIsParentAlive}. */
export interface IsParentAliveDeps {
  /** Read the current ppid. Default: `() => process.ppid`. */
  getPpid?: () => number;
  /** Read the grandparent ppid. Default: ps-based POSIX probe, NaN on Windows. */
  readGrandparentPpid?: () => number;
}

/**
 * Build a parent-liveness check that handles the npm-exec wrapper case (#311).
 *
 * A plain ppid comparison misses Claude Code sessions launched via
 * `start.mjs → npm exec → context-mode server`: when Claude Code dies,
 * `start.mjs` reparents to init but `npm exec` stays alive, so the server's
 * direct ppid never changes. We additionally check whether the grandparent
 * process has been reparented to init (PID 1). When the original grandparent
 * was already 1 (daemonized startup) the check is skipped, and on Windows
 * where there's no cheap `ps` equivalent we also skip — so this change is
 * strictly additive to the previous behavior.
 *
 * Exported for unit-testing with injected readers. Production code uses
 * {@link defaultIsParentAlive} (captured once at module load).
 */
export function makeDefaultIsParentAlive(deps: IsParentAliveDeps = {}): () => boolean {
  const getPpid = deps.getPpid ?? (() => process.ppid);
  const readGp = deps.readGrandparentPpid ?? readGrandparentPpidImpl;
  const originalPpid = getPpid();
  const originalGrandparentPpid = readGp();

  return () => {
    const ppid = getPpid();
    if (ppid !== originalPpid) return false;
    if (ppid === 0 || ppid === 1) return false;

    // Grandparent orphan check (#311): npm-exec wrappers stay alive past the
    // session owner. If our grandparent is now PID 1 but wasn't at startup,
    // the wrapping chain is orphaned and we should shut down.
    if (!Number.isNaN(originalGrandparentPpid) && originalGrandparentPpid > 1) {
      if (readGp() === 1) return false;
    }

    return true;
  };
}

const defaultIsParentAlive = makeDefaultIsParentAlive();

/**
 * Resolve the parent-liveness poll interval based on context (#534).
 *
 * When this process is the MCP bridge child spawned by the Pi adapter
 * (`bootstrapMCPTools` in `src/adapters/pi/mcp-bridge.ts` sets
 * `CONTEXT_MODE_BRIDGE_DEPTH=1` in the child env), we tighten the poll to
 * 1 s. The Pi parent can disappear in under 50 ms (`pi --help` prints
 * usage and returns), so the default 30 s window leaves a long-lived
 * CPU-spinning orphan. For top-level MCP servers (depth 0 / absent) we
 * keep the original 30 s cadence — the existing #311/#388 ppid + stdin
 * recovery paths already cover Claude Code style hosts.
 *
 * Exported for unit-testing.
 */
export function lifecycleGuardIntervalForEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.CONTEXT_MODE_BRIDGE_DEPTH;
  if (raw === undefined) return 30_000;
  const depth = Number.parseInt(raw, 10);
  if (!Number.isFinite(depth) || depth <= 0) return 30_000;
  return 1000;
}

/**
 * #854: idle-shutdown timeout (ms) for an MCP BRIDGE CHILD. Returns 0 (disabled)
 * unless this process is a bridge child (CONTEXT_MODE_BRIDGE_DEPTH>0). depth-0 /
 * absent always returns 0, so the long-lived keep-alive servers that #602
 * restored are NEVER reaped on idle. Default for bridge children is 3 min;
 * override with CONTEXT_MODE_BRIDGE_IDLE_MS (a non-positive value disables it).
 * The reaper additionally never fires while a tool call is in flight (see
 * {@link noteRequestStart}), so the window only bounds how fast *abandoned*
 * children drain — it does not cap legitimate long-running calls.
 *
 * Exported for unit-testing.
 */
export function bridgeChildIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const depth = Number.parseInt(env.CONTEXT_MODE_BRIDGE_DEPTH ?? "", 10);
  if (!Number.isFinite(depth) || depth <= 0) return 0;
  const raw = env.CONTEXT_MODE_BRIDGE_IDLE_MS;
  if (raw !== undefined) {
    const v = Number.parseInt(raw, 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  return 180_000;
}

// #854 idle-reaper state, module-level by design: an MCP server is exactly one
// process (one StdioServerTransport + one lifecycle guard), so these are never
// shared across concurrent servers in production. Multiple startLifecycleGuard()
// instances arise only in tests, which pair/reset these explicitly.
/** Last MCP activity timestamp (inbound message, tool-call start/end, or response). */
let _lastMcpActivity = Date.now();
/** In-flight tool-call count — the reaper never fires while this is > 0. */
let _inFlight = 0;

/**
 * #854: record MCP activity (inbound message or response). The server calls this
 * so the bridge-child idle reaper in {@link startLifecycleGuard} can distinguish
 * an actively-used child from an abandoned one. Cheap; safe on the hot path.
 */
export function noteMcpActivity(): void {
  _lastMcpActivity = Date.now();
}

/**
 * #854: mark a tool call as started. Suppresses the bridge-child idle reaper so a
 * single long-running ctx_execute / ctx_batch_execute (which sends one inbound
 * frame then runs unbounded, #643) is never reaped mid-execution.
 */
export function noteRequestStart(): void {
  _inFlight++;
  _lastMcpActivity = Date.now();
}

/** #854: mark a tool call as finished (success or error). */
export function noteRequestEnd(): void {
  if (_inFlight > 0) _inFlight--;
  _lastMcpActivity = Date.now();
}

/**
 * #854: wrap an MCP stdio transport's `onmessage` so each inbound message
 * refreshes the idle clock. Best-effort: call after `connect()` (onmessage set);
 * a no-op if it isn't a function, and a throw in noteMcpActivity never breaks
 * dispatch. No stdin touch (preserves the #236 contract). Exported for testing.
 */
export function attachMcpActivityTap(
  transport: { onmessage?: (message: unknown, extra?: unknown) => unknown } | null | undefined,
): void {
  if (!transport) return;
  const prev = typeof transport.onmessage === "function" ? transport.onmessage.bind(transport) : null;
  if (!prev) return;
  transport.onmessage = (message: unknown, extra?: unknown) => {
    try { noteMcpActivity(); } catch { /* never break message dispatch */ }
    return prev(message, extra);
  };
}

/**
 * Start the lifecycle guard. Returns a cleanup function.
 * Skipped automatically when stdin is a TTY (e.g. OpenCode ts-plugin).
 */
export function startLifecycleGuard(opts: LifecycleGuardOptions): () => void {
  const interval = opts.checkIntervalMs ?? lifecycleGuardIntervalForEnv();
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

  // P0: OS signals — terminal close, kill, ctrl+c
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  if (process.platform !== "win32") signals.push("SIGHUP");
  for (const sig of signals) process.on(sig, shutdown);

  // P0: Stdin-EOF assist (#311/#388). The vendored MCP SDK's
  // StdioServerTransport only registers 'data' / 'error' listeners — not
  // 'end' — so when the parent (e.g. Claude Code) dies abruptly without
  // sending SIGTERM, the server keeps reading from a half-closed pipe and
  // CPU-spins until the 30 s ppid poll catches up. Observed in #388 with
  // single processes accumulating ~80 h of CPU time before SIGKILL.
  //
  // We deliberately DO NOT call shutdown() unconditionally on 'end' — that
  // is exactly the false-positive behavior #236 tore out. Instead we run
  // the same isParentAlive() check the periodic timer uses, just earlier.
  // If the parent is alive, this is a no-op and the existing #236
  // regression test still passes; if the parent is gone, we collapse the
  // 30 s detection window to ~0.
  //
  // Skipped on TTY (OpenCode ts-plugin) where stdin is not the MCP channel.
  const onStdinEnd = () => {
    if (!check()) shutdown();
  };
  if (!process.stdin.isTTY) {
    process.stdin.on("end", onStdinEnd);
  }

  // #854: request-idle self-shutdown for MCP BRIDGE CHILDREN only
  // (CONTEXT_MODE_BRIDGE_DEPTH>0). Pi/omp loads the extension once per
  // sub-context and spawns one bridge child each, tearing them down only at
  // session_shutdown — which never fires for sub-contexts while the long-lived
  // parent stays alive, so idle children accumulate (#854, same class as #565).
  // A bridge child that receives no inbound MCP message for `idleMs` exits
  // itself; the extension's single-flight path respawns one on the next call.
  //
  // Scoped strictly to depth>0 so the depth-0 keep-alive servers that #602
  // restored are never reaped on idle. The trigger is idle TIME via
  // noteMcpActivity() (NOT stdin EOF), so the #236 contract — and lifecycle's
  // hands-off-stdin invariant — are untouched.
  const idleMs = opts.bridgeIdleMs ?? bridgeChildIdleTimeoutMs();
  let idleTimer: ReturnType<typeof setInterval> | undefined;
  if (idleMs > 0) {
    _lastMcpActivity = Date.now();
    idleTimer = setInterval(() => {
      // Reap only when truly quiescent: NO tool call in flight AND no MCP
      // activity for `idleMs`. The in-flight guard prevents reaping a child
      // mid-execution during a long single ctx_execute/batch that sends no
      // further messages (#643 unbounded calls) — the false-reap regression the
      // adversarial review flagged.
      if (_inFlight === 0 && Date.now() - _lastMcpActivity >= idleMs) {
        process.stderr.write(
          `[context-mode] idle MCP bridge child self-shutdown after ${idleMs}ms with no activity (#854)\n`,
        );
        shutdown();
      }
    }, Math.max(1000, Math.min(Math.floor(idleMs / 4), 30_000)));
    idleTimer.unref();
  }

  return () => {
    stopped = true;
    clearInterval(timer);
    if (idleTimer) clearInterval(idleTimer);
    for (const sig of signals) process.removeListener(sig, shutdown);
    process.stdin.removeListener("end", onStdinEnd);
  };
}
