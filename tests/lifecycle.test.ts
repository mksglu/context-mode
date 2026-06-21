/**
 * lifecycle.test.ts — Process lifecycle guard tests.
 *
 * Tests that the lifecycle guard correctly detects parent death
 * and triggers shutdown. Uses injectable check function for testability.
 */

import { describe, test, assert } from "vitest";
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { startLifecycleGuard, makeDefaultIsParentAlive, bridgeChildIdleTimeoutMs, noteMcpActivity, noteRequestStart, noteRequestEnd, attachMcpActivityTap } from "../src/lifecycle.js";

// Resolve the tsx binary. Prefer the local devDep so the test doesn't depend
// on a global tsx install or on Git Bash's `which` being on PATH; the PATH
// probe is a fallback for environments where node_modules/.bin isn't
// populated. Windows ships tsx as tsx.cmd and uses `where`; everywhere else
// it's `tsx` with `which`.
function resolveTsxPath(): string {
  const isWindows = process.platform === "win32";
  const localBin = join(
    process.cwd(),
    "node_modules",
    ".bin",
    isWindows ? "tsx.cmd" : "tsx",
  );
  if (existsSync(localBin)) return localBin;
  const probe = isWindows ? "where tsx" : "which tsx";
  return execSync(probe, { encoding: "utf-8" }).trim().split(/\r?\n/)[0];
}
const TSX_PATH = resolveTsxPath();
const PROJECT_ROOT = process.cwd();
// file:// URL form so the spawned ESM module can import lifecycle.ts by
// absolute path regardless of where the script itself lives.
const LIFECYCLE_SRC_URL = pathToFileURL(
  join(PROJECT_ROOT, "src", "lifecycle.ts"),
).href;

// Sandboxed write target. Pre-fix this wrote _lifecycle_test_*.ts directly
// to process.cwd() (the project root) and only cleaned up on the child's
// `close` event. A hang or hard crash left the temp scripts in the repo
// (not gitignored). Use a per-test mkdtempSync directory under tmpdir
// instead so partial state can't escape the sandbox even when the child
// dies without firing its close handler. The vitest worker tears down its
// per-test environment when the run ends, so worst case the dir lingers
// only for the lifetime of the run.
function spawnGuardChild(exitCode: number): {
  child: ReturnType<typeof spawn>;
  ready: Promise<void>;
} {
  const scratchDir = mkdtempSync(join(tmpdir(), "ctx-lifecycle-test-"));
  const script = join(scratchDir, `guard_${exitCode}.ts`);
  writeFileSync(script, `
import { startLifecycleGuard } from ${JSON.stringify(LIFECYCLE_SRC_URL)};
startLifecycleGuard({
  checkIntervalMs: 60000,
  onShutdown: () => process.exit(${exitCode}),
});
process.stdout.write("READY");
setInterval(() => {}, 1000);
`);
  const child = spawn(TSX_PATH, [script], {
    cwd: PROJECT_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.on("close", () => {
    try { rmSync(scratchDir, { recursive: true, force: true }); } catch {}
  });
  const ready = new Promise<void>((resolve) => {
    child.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("READY")) resolve();
    });
    setTimeout(resolve, 3000); // fallback
  });
  return { child, ready };
}

describe("Lifecycle Guard", () => {
  test("calls onShutdown when parent is detected as dead", async () => {
    let shutdownCalled = false;

    const cleanup = startLifecycleGuard({
      checkIntervalMs: 50, // fast for testing
      onShutdown: () => { shutdownCalled = true; },
      isParentAlive: () => false, // simulate dead parent
    });

    // Wait for at least one interval tick
    await new Promise((r) => setTimeout(r, 100));

    cleanup();
    assert.equal(shutdownCalled, true, "onShutdown should be called when parent is dead");
  });

  test("does NOT call onShutdown when parent is alive", async () => {
    let shutdownCalled = false;

    const cleanup = startLifecycleGuard({
      checkIntervalMs: 50,
      onShutdown: () => { shutdownCalled = true; },
      isParentAlive: () => true, // parent alive
    });

    await new Promise((r) => setTimeout(r, 150));

    cleanup();
    assert.equal(shutdownCalled, false, "onShutdown should NOT be called when parent is alive");
  });

  test("onShutdown is called only once even with multiple triggers", async () => {
    let shutdownCount = 0;

    const cleanup = startLifecycleGuard({
      checkIntervalMs: 30,
      onShutdown: () => { shutdownCount++; },
      isParentAlive: () => false,
    });

    // Wait for multiple ticks
    await new Promise((r) => setTimeout(r, 150));

    cleanup();
    assert.equal(shutdownCount, 1, "onShutdown should be called exactly once");
  });

  test("cleanup function prevents further checks", async () => {
    let shutdownCalled = false;
    let checkCount = 0;

    const cleanup = startLifecycleGuard({
      checkIntervalMs: 30,
      onShutdown: () => { shutdownCalled = true; },
      isParentAlive: () => { checkCount++; return true; },
    });

    // Let a few checks run
    await new Promise((r) => setTimeout(r, 100));
    const checksBeforeCleanup = checkCount;
    cleanup();

    // Wait more — no new checks should run
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(checkCount, checksBeforeCleanup, "No checks after cleanup");
    assert.equal(shutdownCalled, false);
  });

  test("touches only the 'end' stdin listener and restores it on cleanup (#236, #388)", async () => {
    // The guard is permitted exactly one stdin assist — an 'end' listener
    // used as a faster trigger for the same isParentAlive check the periodic
    // timer runs (see lifecycle.ts). It must NOT touch 'close', 'data',
    // 'error', or 'readable', and it must remove its own 'end' listener on
    // cleanup. This test pins both halves of that contract.
    const sample = (event: "close" | "end" | "data" | "error" | "readable") =>
      process.stdin.listenerCount(event);

    // Snapshot non-'end' listeners — these must be invariant across the
    // guard lifecycle. Skipping 'end' on TTY since the guard skips itself.
    const before = {
      close: sample("close"),
      data: sample("data"),
      error: sample("error"),
      readable: sample("readable"),
      end: sample("end"),
    };

    const cleanup = startLifecycleGuard({
      checkIntervalMs: 50,
      onShutdown: () => {},
      isParentAlive: () => true,
    });

    const afterStart = {
      close: sample("close"),
      data: sample("data"),
      error: sample("error"),
      readable: sample("readable"),
      end: sample("end"),
    };

    cleanup();

    const afterCleanup = {
      close: sample("close"),
      data: sample("data"),
      error: sample("error"),
      readable: sample("readable"),
      end: sample("end"),
    };

    // Non-'end' listeners must be untouched at every phase (#236 contract).
    for (const ev of ["close", "data", "error", "readable"] as const) {
      assert.equal(afterStart[ev], before[ev],
        `startLifecycleGuard must not add a stdin '${ev}' listener`);
      assert.equal(afterCleanup[ev], before[ev],
        `cleanup must not touch the stdin '${ev}' listener`);
    }

    // 'end' listener: +1 only when stdin is not a TTY; restored on cleanup.
    const expectedEndDelta = process.stdin.isTTY ? 0 : 1;
    assert.equal(afterStart.end - before.end, expectedEndDelta,
      "startLifecycleGuard adds exactly one stdin 'end' listener (or none on TTY)");
    assert.equal(afterCleanup.end, before.end,
      "cleanup must remove the 'end' listener it added");
  });

  test("startLifecycleGuard does NOT call process.stdin.resume()", async () => {
    let resumeCalled = false;
    const originalResume = process.stdin.resume.bind(process.stdin);
    process.stdin.resume = (() => { resumeCalled = true; return originalResume(); }) as typeof process.stdin.resume;

    try {
      const cleanup = startLifecycleGuard({
        checkIntervalMs: 50,
        onShutdown: () => {},
        isParentAlive: () => true,
      });

      // Give one tick to ensure any async resume would have fired
      await new Promise((r) => setTimeout(r, 100));

      cleanup();
      assert.equal(resumeCalled, false, "process.stdin.resume() must not be called by lifecycle guard");
    } finally {
      // Restore original resume to avoid polluting other tests
      process.stdin.resume = originalResume;
    }
  });

  test("stdin 'end' triggers immediate isParentAlive re-check; shuts down only if dead (#388)", async () => {
    // Skip on TTY — the guard intentionally does not register the 'end'
    // listener when stdin is a TTY (e.g. OpenCode ts-plugin), so this
    // assertion would not apply to that environment.
    if (process.stdin.isTTY) return;

    let shutdownCalled = false;
    let parentAlive = true;
    let aliveCallCount = 0;

    const cleanup = startLifecycleGuard({
      // Long interval so we know the next assertion can only be driven by
      // the 'end' listener, not the periodic timer.
      checkIntervalMs: 60_000,
      onShutdown: () => { shutdownCalled = true; },
      isParentAlive: () => { aliveCallCount++; return parentAlive; },
    });

    // Phase 1: parent alive — emitting 'end' must run the check but NOT
    // shut down. This is the #236 contract: stdin close alone is not a
    // shutdown signal.
    const callsBeforeAliveEnd = aliveCallCount;
    process.stdin.emit("end");
    assert.ok(aliveCallCount > callsBeforeAliveEnd,
      "'end' must run isParentAlive() — that's the whole point of the assist");
    assert.equal(shutdownCalled, false,
      "'end' with a live parent must not shut down (regression of #236)");

    // Phase 2: parent now dead — the next 'end' must collapse the
    // detection window from 30 s to ~0 ms.
    parentAlive = false;
    process.stdin.emit("end");
    assert.equal(shutdownCalled, true,
      "'end' with a dead parent must shut down without waiting for the poll tick");

    cleanup();
  });

  test("detects ppid=0 as dead parent (Windows behavior)", async () => {
    let shutdownCalled = false;

    const cleanup = startLifecycleGuard({
      checkIntervalMs: 30,
      onShutdown: () => { shutdownCalled = true; },
      isParentAlive: () => false, // simulates ppid=0 or ppid changed
    });

    await new Promise((r) => setTimeout(r, 80));
    cleanup();
    assert.equal(shutdownCalled, true);
  });
});

// Regression coverage for #311 — zombie context-mode servers persist because
// the Claude Code process tree is
//   Claude Code → start.mjs → npm exec → server
// and when Claude Code dies, `start.mjs` reparents to init (PID 1) but
// `npm exec` (our direct parent) keeps running, so a ppid-only check stays
// green forever. The grandparent-orphan check closes this gap.
describe("makeDefaultIsParentAlive — grandparent orphan detection (#311)", () => {
  test("returns false when grandparent is reparented to init after startup", () => {
    // Startup chain: server (ppid=100) → npm exec (ppid=50) → start.mjs (ppid=7, alive)
    let currentGrandparent = 7;
    const isAlive = makeDefaultIsParentAlive({
      getPpid: () => 100,
      readGrandparentPpid: () => currentGrandparent,
    });

    assert.equal(isAlive(), true, "alive at startup when grandparent is a normal process");

    // Claude Code dies → start.mjs reparents to init.
    currentGrandparent = 1;
    assert.equal(isAlive(), false, "must detect grandparent reparenting (#311)");
  });

  test("does not false-positive when grandparent was already init at startup", () => {
    // Daemon-style launch — grandparent is init from the start (e.g. launchd,
    // systemd, or a detached nohup process). The check must skip in this case,
    // otherwise the guard would shut down immediately on every poll.
    const isAlive = makeDefaultIsParentAlive({
      getPpid: () => 100,
      readGrandparentPpid: () => 1,
    });

    // Multiple polls — never flip to false while ppid is stable.
    assert.equal(isAlive(), true);
    assert.equal(isAlive(), true);
    assert.equal(isAlive(), true);
  });

  test("tolerates NaN grandparent (Windows / ps failure)", () => {
    // On Windows readGrandparentPpidImpl returns NaN; the check must fall
    // back to the original ppid-only path and stay green while ppid is stable.
    const isAlive = makeDefaultIsParentAlive({
      getPpid: () => 100,
      readGrandparentPpid: () => NaN,
    });

    assert.equal(isAlive(), true);
  });

  test("direct ppid death still takes precedence over grandparent check", () => {
    // If our own parent dies (ppid flips to init), shut down immediately —
    // don't wait for a grandparent poll to confirm.
    let ppid = 50;
    const isAlive = makeDefaultIsParentAlive({
      getPpid: () => ppid,
      readGrandparentPpid: () => 7, // grandparent alive the whole time
    });

    assert.equal(isAlive(), true);
    ppid = 1; // direct parent dies
    assert.equal(isAlive(), false);
  });

  test("grandparent check kicks in through startLifecycleGuard end-to-end", async () => {
    // Integration-shaped check: plug the orphan-aware factory into the
    // real guard and prove it triggers onShutdown without touching stdin.
    let currentGrandparent = 7;
    const aliveCheck = makeDefaultIsParentAlive({
      getPpid: () => 100,
      readGrandparentPpid: () => currentGrandparent,
    });

    let shutdownCalled = false;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 30,
      onShutdown: () => { shutdownCalled = true; },
      isParentAlive: aliveCheck,
    });

    // Flip the grandparent to init — guard should notice within one interval.
    currentGrandparent = 1;
    await new Promise((r) => setTimeout(r, 100));
    cleanup();
    assert.equal(shutdownCalled, true);
  });
});

// Integration tests spawn real child processes with stdin pipes and SIGTERM.
// Windows lacks POSIX signal semantics — SIGTERM kills without handler invocation,
// and stdin pipe close detection behaves differently. Skip on Windows.
const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("Lifecycle Guard — Integration (real process)", () => {
  test("child does NOT exit when stdin is closed (#236)", async () => {
    const { child, ready } = spawnGuardChild(42);

    await ready;
    child.stdin!.end();

    let exited = false;
    let exitCode: number | null = null;
    child.on("close", (code) => { exited = true; exitCode = code; });

    // Give the guard 500ms — if stdin-close still triggered shutdown, it
    // would have fired by now (previous implementation exited within ~1ms).
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(exited, false, `Child must stay alive after stdin.end(); exited with code ${exitCode}`);
    assert.equal(child.killed, false, "Child.killed should still be false");

    // Clean up: SIGTERM the still-alive child so the test runner doesn't leak.
    const closed = new Promise<number | null>((resolve) => {
      if (exited) return resolve(exitCode);
      child.on("close", resolve);
      setTimeout(() => { child.kill("SIGKILL"); resolve(null); }, 3000);
    });
    child.kill("SIGTERM");
    await closed;
  }, 10_000);

  test("child exits on SIGTERM", async () => {
    const { child, ready } = spawnGuardChild(43);

    await ready;
    child.kill("SIGTERM");

    const code = await new Promise<number | null>((resolve) => {
      child.on("close", resolve);
      setTimeout(() => { child.kill("SIGKILL"); resolve(null); }, 5000);
    });

    assert.equal(code, 43, "Child should exit with code 43 on SIGTERM");
  }, 10_000);
});

// #854 — bridge-child request-idle reaper. Pi/omp loads the extension per
// sub-context and spawns one bridge child each, reaping them only at
// session_shutdown (which never fires for sub-contexts), so idle children
// accumulate under one long-lived parent. A depth>0 child with no MCP activity
// self-exits; depth-0 (the #602 keep-alive class) is never touched, and the
// trigger is idle time (not stdin EOF) so the #236 contract holds.
describe("bridgeChildIdleTimeoutMs (#854)", () => {
  test("returns 0 (disabled) for depth-0 / absent / malformed", () => {
    assert.equal(bridgeChildIdleTimeoutMs({}), 0, "absent depth → disabled");
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "0" }), 0);
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "-1" }), 0);
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "x" }), 0);
  });

  test("returns the 3-min default for bridge children (depth>0)", () => {
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "1" }), 180_000);
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "2" }), 180_000);
  });

  test("honors CONTEXT_MODE_BRIDGE_IDLE_MS override (positive only)", () => {
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "1", CONTEXT_MODE_BRIDGE_IDLE_MS: "5000" }), 5000);
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "1", CONTEXT_MODE_BRIDGE_IDLE_MS: "0" }), 0, "non-positive override disables");
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_DEPTH: "1", CONTEXT_MODE_BRIDGE_IDLE_MS: "-5" }), 0);
    assert.equal(bridgeChildIdleTimeoutMs({ CONTEXT_MODE_BRIDGE_IDLE_MS: "5000" }), 0, "override ignored when not a bridge child");
  });
});

describe("Lifecycle Guard — bridge-child idle reaper (#854)", () => {
  test("reaps a bridge child with no MCP activity (parent stays alive)", async () => {
    let shutdownCalled = false;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,     // keep the parent-death poll out of the way
      isParentAlive: () => true,    // parent ALIVE — only the idle path can fire
      bridgeIdleMs: 50,             // tiny idle window (idle-tick floor is 1s)
      onShutdown: () => { shutdownCalled = true; },
    });
    await new Promise((r) => setTimeout(r, 1300)); // > one 1s idle tick, no activity
    cleanup();
    assert.equal(shutdownCalled, true, "an idle bridge child must self-shut-down (#854)");
  });

  test("does NOT reap while MCP activity continues", async () => {
    let shutdownCalled = false;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,
      isParentAlive: () => true,
      bridgeIdleMs: 5000,           // 5s window; idle-tick ~1.25s
      onShutdown: () => { shutdownCalled = true; },
    });
    for (let i = 0; i < 4; i++) { noteMcpActivity(); await new Promise((r) => setTimeout(r, 400)); }
    cleanup();
    assert.equal(shutdownCalled, false, "an actively-used bridge child must not be reaped");
  });

  test("depth-0 servers are NEVER reaped on idle (#602 guard)", async () => {
    let shutdownCalled = false;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,
      isParentAlive: () => true,
      bridgeIdleMs: 0,              // depth-0 / disabled → no idle reaper installed
      onShutdown: () => { shutdownCalled = true; },
    });
    await new Promise((r) => setTimeout(r, 1300));
    cleanup();
    assert.equal(shutdownCalled, false, "depth-0 keep-alive servers must never idle-reap (#602)");
  });

  test("does NOT reap while a tool call is in flight (#854 in-flight guard)", async () => {
    let shutdownCalled = false;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,
      isParentAlive: () => true,
      bridgeIdleMs: 50,                 // tiny window; idle-tick floor is 1s
      onShutdown: () => { shutdownCalled = true; },
    });
    noteRequestStart();                 // a long tool call is running…
    try {
      await new Promise((r) => setTimeout(r, 1300)); // …past the idle window, no inbound msgs
      assert.equal(shutdownCalled, false, "must NOT reap a bridge child with a call in flight (#643)");
    } finally {
      noteRequestEnd();                 // always balance the counter — no cross-test leak of module-global state
    }
    await new Promise((r) => setTimeout(r, 1300)); // now genuinely idle
    cleanup();
    assert.equal(shutdownCalled, true, "reaps once the in-flight call ends and it goes idle");
  });

  test("attachMcpActivityTap delegates to the prior onmessage; no-op when absent/null", () => {
    const calls: Array<[unknown, unknown]> = [];
    const t: { onmessage?: (m: unknown, e?: unknown) => unknown } = {
      onmessage: (m: unknown, e?: unknown) => { calls.push([m, e]); return "ok"; },
    };
    attachMcpActivityTap(t);
    const ret = t.onmessage!({ a: 1 }, { b: 2 });
    assert.equal(ret, "ok", "wrapped onmessage must return the prior handler's result");
    assert.deepEqual(calls, [[{ a: 1 }, { b: 2 }]], "wrapped onmessage must delegate args");
    const empty: { onmessage?: (m: unknown, e?: unknown) => unknown } = {};
    attachMcpActivityTap(empty);
    assert.equal(empty.onmessage, undefined, "no onmessage → no-op (does not synthesize one)");
    attachMcpActivityTap(null); // must not throw
  });
});
