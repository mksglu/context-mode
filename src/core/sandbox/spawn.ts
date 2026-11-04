// impl/03 §5, AS2, AS3: the one process-spawn path for sandboxed code. argv only, shell:false,
// env supplied by the caller (buildChildEnv), raw uncapped Buffers, never rejects.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { killTree } from "./kill.ts";
import { findRuntime } from "./runtimes.ts";

export interface RunOptions {
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
  timeoutMs: number;
  stdin?: string;
}

export interface RunResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
  killed: "timeout" | "cancel" | null;
}

const NOT_STARTED: RunResult = Object.freeze({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: null, killed: null });

/**
 * DEVIATIONS D-M2-R3-3: Windows cannot start an extensionless `#!/bin/sh` shim (pyenv-win, #1208/#1209)
 * directly, so it runs as `[sh.exe, shim, ...args]` with the sh that `findRuntime("shell")` finds on
 * PATH. No sh on PATH: null, and the caller's SPAWN_FAILED line names the shim (argv[0]).
 */
function startArgv(argv: string[]): string[] | null {
  if (process.platform !== "win32" || path.extname(argv[0]) !== "") return argv;
  const sh = findRuntime("shell");
  return sh === null ? null : [sh, ...argv];
}

export function runProcess(argv: string[], o: RunOptions): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const isWin = process.platform === "win32";
    const start = startArgv(argv);
    if (start === null) return resolve(NOT_STARTED);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(start[0], start.slice(1), {
        cwd: o.cwd,
        env: o.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        // Step 1: POSIX group leader so killTree's -pid reaches grandchildren.
        detached: !isWin,
        // DEVIATIONS D-M2-T4-2: #384/#1154 (GP4/windows-hide-console-on-spawn); no-op on POSIX.
        windowsHide: true,
      });
    } catch {
      // Step 7 / D-M2-R3-3: spawn throws (not emits) on bad argv or Windows EINVAL; still never reject.
      return resolve(NOT_STARTED);
    }
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let killedBy: "timeout" | "cancel" | null = null;
    let settled = false;

    const kill = (): void => {
      if (child.pid !== undefined) killTree(child.pid);
    };
    const onAbort = (): void => {
      if (killedBy !== null || settled) return;
      killedBy = "cancel";
      clearTimeout(timer);
      kill();
    };
    const timer = setTimeout(() => {
      if (killedBy !== null || settled) return;
      killedBy = "timeout";
      kill();
    }, o.timeoutMs);

    const settle = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      o.signal.removeEventListener("abort", onAbort);
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        exitCode,
        killed: killedBy,
      });
    };

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    // DEVIATIONS D-M2-T4-3: "close" (exit + stdio drained), so no tail bytes are lost.
    child.on("close", (code: number | null) => settle(code));
    // Step 7: spawn-level failure (ENOENT argv[0], missing cwd) resolves, never rejects.
    child.on("error", () => settle(null));

    // A child that exits before reading stdin makes the write fail with EPIPE; the exit result
    // already carries the outcome, so the stdin stream error is not a second result.
    child.stdin.on("error", () => {});
    if (o.stdin !== undefined) child.stdin.write(o.stdin);
    child.stdin.end();

    if (o.signal.aborted) onAbort();
    else o.signal.addEventListener("abort", onAbort, { once: true });
  });
}
