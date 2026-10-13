import "./setup-home";
/**
 * server / lifecycle — standalone MCP child exit behavior.
 *
 * Background: `lifecycle.ts` already wires `process.stdin.on("end", …)` to
 * re-run the parent-alive probe (added in #388, commit 259077c). #534 verifies
 * the listener is registered as documented AND that an EOF on a half-closed
 * stdin DOES collapse the detection window to ~0 when the parent is gone.
 *
 * Spec from the issue:
 *   "server.ts wires process.stdin.on('end', …) so EOF on parent pipe
 *   terminates cleanly"
 *
 * The exact mechanism is in lifecycle.ts:134 — we deliberately do NOT call
 * `process.exit(0)` unconditionally on 'end' because #236 proved that causes
 * spurious -32000 errors on transient pipe events. Instead, on 'end' we run
 * the same parent-alive probe and shut down only if the parent is gone.
 *
 * These tests pin the contract:
 *   1. `startLifecycleGuard` registers a listener on `process.stdin` 'end'
 *      when stdin is NOT a TTY (the MCP-child case).
 *   2. Emitting 'end' with a dead parent triggers shutdown immediately.
 *   3. Emitting 'end' with a live parent is a no-op (#236 regression guard).
 *   4. The listener is removed on cleanup.
 *
 * #830 adds the fatal exception contract for the same standalone MCP child:
 * an uncaught-exception storm must terminate the process instead of keeping an
 * orphaned server alive indefinitely.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sentinelPathForPid } from "../hooks/core/mcp-ready.mjs";

let stdinBackup: typeof process.stdin;

function makeFakeStdin(): NodeJS.ReadStream {
  const ee = new EventEmitter() as unknown as NodeJS.ReadStream;
  // Force non-TTY: lifecycle.ts gates the 'end' listener on !isTTY.
  Object.defineProperty(ee, "isTTY", { value: false, configurable: true });
  return ee;
}

function waitForClose(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<{ closed: boolean; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveClose) => {
    const timer = setTimeout(() => {
      resolveClose({ closed: false, code: child.exitCode, signal: child.signalCode });
    }, timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveClose({ closed: true, code, signal });
    });
  });
}

beforeEach(() => {
  stdinBackup = process.stdin;
});

afterEach(() => {
  Object.defineProperty(process, "stdin", {
    value: stdinBackup,
    configurable: true,
  });
});

describe("startLifecycleGuard — stdin EOF triggers immediate parent-alive recheck (#534)", () => {
  it("registers an 'end' listener on stdin when stdin is not a TTY", async () => {
    const fakeStdin = makeFakeStdin();
    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const { startLifecycleGuard } = await import("../src/lifecycle.js");
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,
      isParentAlive: () => true,
      onShutdown: () => {},
    });

    expect((fakeStdin as unknown as EventEmitter).listenerCount("end")).toBe(1);
    cleanup();
    expect((fakeStdin as unknown as EventEmitter).listenerCount("end")).toBe(0);
  });

  it("does NOT register an 'end' listener when stdin IS a TTY", async () => {
    const fakeStdin = makeFakeStdin();
    Object.defineProperty(fakeStdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const { startLifecycleGuard } = await import("../src/lifecycle.js");
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,
      isParentAlive: () => true,
      onShutdown: () => {},
    });

    expect((fakeStdin as unknown as EventEmitter).listenerCount("end")).toBe(0);
    cleanup();
  });

  it("triggers shutdown immediately when 'end' fires AND parent is dead", async () => {
    const fakeStdin = makeFakeStdin();
    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const { startLifecycleGuard } = await import("../src/lifecycle.js");
    let alive = false;
    let shutdownCalls = 0;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000, // long poll, so only the EOF path can fire
      isParentAlive: () => alive,
      onShutdown: () => {
        shutdownCalls++;
      },
    });

    (fakeStdin as unknown as EventEmitter).emit("end");
    expect(shutdownCalls).toBe(1);
    cleanup();
  });

  it("does NOT trigger shutdown on 'end' when parent is still alive (#236 regression)", async () => {
    const fakeStdin = makeFakeStdin();
    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const { startLifecycleGuard } = await import("../src/lifecycle.js");
    let shutdownCalls = 0;
    const cleanup = startLifecycleGuard({
      checkIntervalMs: 60_000,
      isParentAlive: () => true,
      onShutdown: () => {
        shutdownCalls++;
      },
    });

    (fakeStdin as unknown as EventEmitter).emit("end");
    expect(shutdownCalls).toBe(0);
    cleanup();
  });
});

describe("standalone MCP server fatal exception handling (#830)", () => {
  it("exits instead of surviving an uncaught exception storm", async () => {
    const serverBundle = resolve(process.cwd(), "server.bundle.mjs");
    expect(existsSync(serverBundle)).toBe(true);

    const scratch = mkdtempSync(join(tmpdir(), "ctx-issue-830-"));
    const preload = join(scratch, "storm.mjs");
    writeFileSync(preload, `
const originalWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  if (String(chunk).includes("[context-mode] uncaughtException")) return true;
  return true;
};

function storm() {
  setImmediate(storm);
  throw new Error("issue-830-storm");
}

function waitForHandler(deadline = Date.now() + 1500) {
  if (process.listenerCount("uncaughtException") > 0 || Date.now() > deadline) {
    setImmediate(storm);
    return;
  }
  setTimeout(() => waitForHandler(deadline), 10);
}

waitForHandler();
setTimeout(() => {
  originalWrite("[issue-830] still alive after uncaught exception storm\\\\n");
}, 1000);
`);

    const child = spawn(process.execPath, ["--import", preload, serverBundle], {
      cwd: process.cwd(),
      stdio: ["pipe", "ignore", "pipe"],
    });

    try {
      const result = await waitForClose(child, 2_000);
      if (!result.closed) {
        child.kill("SIGTERM");
        await waitForClose(child, 1_000);
      }

      expect(result.closed, "server survived the uncaught exception storm").toBe(true);
      expect(result.code, "fatal exception should not exit successfully").not.toBe(0);
    } finally {
      try { child.kill("SIGKILL"); } catch {}
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  });
});

type RpcResponse = {
  id?: number;
  error?: unknown;
  result?: { content?: Array<{ type: string; text?: string }> };
};

async function probe(clientName: string | null, delayed: boolean) {
  const root = mkdtempSync(join(tmpdir(), "context-mode-handshake-"));
  const home = join(root, "home");
  const project = join(root, "project");
  for (const dir of [
    project, join(home, ".claude"), join(home, ".gemini", "antigravity-cli"),
    join(home, ".gemini", "config"), join(home, ".local", "bin"),
    join(home, ".config", "opencode"),
  ]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(home, ".local", "bin", "agy"), "");
  writeFileSync(join(home, ".gemini", "config", "mcp_config.json"), "{}");
  const child = spawn(process.execPath, [resolve("build/server.js")], {
    cwd: project,
    // Do not inherit agent identity/storage overrides from the test runner.
    env: {
      HOME: home, USERPROFILE: home, PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
      APPDATA: join(home, ".config"), LOCALAPPDATA: join(home, ".local"),
      XDG_CONFIG_HOME: join(home, ".config"),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  let stderr = "";
  let buffer = "";
  const responses = new Map<number, (msg: RpcResponse) => void>();
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const msg = JSON.parse(line) as RpcResponse;
        if (msg.id !== undefined) {
          responses.get(msg.id)?.(msg);
          responses.delete(msg.id);
        }
      } catch { /* stderr is the only supported diagnostics channel */ }
    }
  });
  const request = (id: number, method: string, params: unknown) =>
    new Promise<RpcResponse>((resolveResponse, reject) => {
      const timer = setTimeout(() => reject(new Error(`RPC ${method} timed out: ${stderr}`)), 10_000);
      responses.set(id, (msg) => { clearTimeout(timer); resolveResponse(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  try {
    if (delayed || clientName === null) {
      // The readiness sentinel proves connect() has completed. Wait a little
      // longer to catch the old post-connect adapter-selection/restore path.
      const sentinel = sentinelPathForPid(child.pid);
      const deadline = Date.now() + 10_000;
      while (!existsSync(sentinel) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(existsSync(sentinel), stderr).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      expect(existsSync(join(home, ".gemini", "context-mode"))).toBe(false);
      expect(existsSync(join(home, ".config", "opencode", "context-mode"))).toBe(false);
    }
    if (clientName !== null) {
      const init = await request(1, "initialize", {
        protocolVersion: "2024-11-05", capabilities: {},
        clientInfo: { name: clientName, version: "test" },
      });
      expect(init.error).toBeUndefined();
      // Send notification and tool request back-to-back: the SDK does not
      // serialize them with async oninitialized work (adapter import).
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
      const doctor = await request(2, "tools/call", { name: "ctx_doctor", arguments: {} });
      expect(doctor.error).toBeUndefined();
      const text = doctor.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
      const config = clientName === "opencode" ? join(home, ".config", "opencode") : join(home, ".gemini");
      for (const kind of ["sessions", "content", "stats"]) {
        const subdir = kind === "content" ? "content" : "sessions";
        expect(text).toContain(`Storage ${kind}: ${join(config, "context-mode", subdir)} (default)`);
      }
      if (clientName === "opencode") {
        expect(text).not.toContain("Antigravity CLI hooks");
        expect(stderr).toContain("MCP client: opencode vtest → opencode");
      }
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await closed;
    clearTimeout(killTimer);
    try {
      // Stats flush on shutdown must also use the handshake-selected store,
      // and exiting before initialization must not write to a guessed store.
      if (clientName === "opencode" || clientName === null) {
        expect(existsSync(join(home, ".gemini", "context-mode"))).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

describe("MCP platform selection waits for clientInfo (#1255)", () => {
  it.each([false, true])("uses OpenCode storage with delayed=%s despite foreign home markers", async (delayed) => {
    await probe("opencode", delayed);
  });
  it("preserves the filesystem fallback for an unknown client", async () => {
    await probe("unknown-xyz", true);
  });
  it("does not write guessed-platform stats when stopped before initialize", async () => {
    await probe(null, true);
  });
});
