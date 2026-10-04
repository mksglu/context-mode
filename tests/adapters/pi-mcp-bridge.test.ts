import "../setup-home";
/**
 * Pi MCP bridge — fork-bomb prevention (#516).
 *
 * Original bug: src/adapters/pi/mcp-bridge.ts:76 used `process.execPath`
 * to spawn the MCP server child. When context-mode runs *inside* the
 * Pi binary (Bun-only Fedora 44 ships no `node`), `process.execPath`
 * IS the Pi binary itself — every spawn re-executes Pi, which re-loads
 * context-mode, which spawns another Pi … fork bomb that takes the box
 * down.
 *
 * These tests pin the three guarantees that make the bridge safe:
 *
 *   1. Resolve a real JS runtime (bun/node), reject pi-named binaries
 *      even when they are returned by `detectRuntimes().javascript`.
 *   2. Pass `CONTEXT_MODE_BRIDGE_DEPTH=1` into the child env so any
 *      transitive bridge load can detect the recursion.
 *   3. Refuse to bootstrap if `CONTEXT_MODE_BRIDGE_DEPTH > 0` is
 *      already set in the current process env (catches recursion that
 *      bypasses the binary-name check, e.g. `node` shim that re-execs
 *      Pi).
 *   4. When neither node nor bun is on PATH AND execPath is pi, log
 *      once and skip the bridge instead of throwing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "ctx-pi-forkbomb-"));
});

afterEach(() => {
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  delete process.env.CONTEXT_MODE_BRIDGE_DEPTH;
});

// Slice 1 — runtime name guard
describe("resolveJsRuntimeForBridge — Pi fork-bomb guard (#516)", () => {
  it("rejects a pi-named binary returned by detectRuntimes and falls back to PATH node/bun", async () => {
    const mod = await import("../../src/adapters/pi/mcp-bridge.js");
    const { resolveJsRuntimeForBridge } = mod as unknown as {
      resolveJsRuntimeForBridge: (deps?: {
        detect?: () => { javascript: string | null };
        which?: (cmd: string) => string | null;
        execPath?: string;
      }) => string | null;
    };
    expect(typeof resolveJsRuntimeForBridge).toBe("function");

    // Detect returns the Pi binary (the bug condition). Helper must
    // refuse it and fall back to whatever `which` resolves for node/bun.
    const resolved = resolveJsRuntimeForBridge({
      detect: () => ({ javascript: "/usr/local/bin/pi" }),
      which: (cmd) => (cmd === "node" ? "/usr/bin/node" : null),
      execPath: "/usr/local/bin/pi",
    });

    expect(resolved).toBe("/usr/bin/node");
  });

  it("rejects pi.exe (case-insensitive, .exe suffix) on Windows-shaped paths", async () => {
    const mod = await import("../../src/adapters/pi/mcp-bridge.js");
    const { resolveJsRuntimeForBridge } = mod as unknown as {
      resolveJsRuntimeForBridge: (deps?: {
        detect?: () => { javascript: string | null };
        which?: (cmd: string) => string | null;
        execPath?: string;
      }) => string | null;
    };

    const resolved = resolveJsRuntimeForBridge({
      detect: () => ({ javascript: "C:\\Program Files\\Pi\\Pi.EXE" }),
      which: (cmd) => (cmd === "bun" ? "C:\\bun\\bun.exe" : null),
      execPath: "C:\\Program Files\\Pi\\Pi.EXE",
    });

    expect(resolved).toBe("C:\\bun\\bun.exe");
  });
});

// Slice 2 — env depth counter
describe("MCP bridge spawn — passes CONTEXT_MODE_BRIDGE_DEPTH=1 to child env (#516)", () => {
  it("child process inherits CONTEXT_MODE_BRIDGE_DEPTH=1", async () => {
    // Fake server that prints the depth env var and exits.
    const fakePath = join(scratch, "echo-depth.mjs");
    writeFileSync(
      fakePath,
      `process.stdout.write(JSON.stringify({ depth: process.env.CONTEXT_MODE_BRIDGE_DEPTH }) + "\\n");
       setInterval(() => {}, 1000);`,
      "utf-8",
    );

    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(fakePath);
    client.start();

    // Pluck the live env that was passed into spawn — exposed for tests.
    const live = (client as unknown as { _spawnEnv?: NodeJS.ProcessEnv })._spawnEnv;
    expect(live?.CONTEXT_MODE_BRIDGE_DEPTH).toBe("1");

    client.shutdown();
  });
});

// Slice 3 — recursion guard via env counter
describe("bootstrapMCPTools — recursion guard (#516)", () => {
  it("aborts and logs to pi.logger (NOT the TUI terminal) when CONTEXT_MODE_BRIDGE_DEPTH > 0 already set (#868)", async () => {
    process.env.CONTEXT_MODE_BRIDGE_DEPTH = "1";

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { bootstrapMCPTools } = await import("../../src/adapters/pi/mcp-bridge.js");
    const warn = vi.fn();
    const fakePi = { registerTool: vi.fn(), logger: { warn, debug: vi.fn() } };

    const handle = await bootstrapMCPTools(fakePi, "/non/existent/server.mjs");

    expect(handle.tools).toEqual([]);
    expect(fakePi.registerTool).not.toHaveBeenCalled();
    // #868: the diagnostic must go to Pi's file logger, never process.stderr
    // (Pi's raw-mode TUI renders any console write into the editor).
    expect(stderrSpy).not.toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => String(c[0])).join("");
    expect(
      logged.includes("recursion") || logged.includes("depth") || logged.includes("fork"),
    ).toBe(true);

    stderrSpy.mockRestore();
  });
});

// Slice 4 — graceful skip when no JS runtime
describe("bootstrapMCPTools — no JS runtime + execPath is pi (#516)", () => {
  it("logs to pi.logger (NOT the TUI terminal) and returns an empty handle without throwing (#868)", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { bootstrapMCPTools } = await import("../../src/adapters/pi/mcp-bridge.js");
    const warn = vi.fn();
    const fakePi = { registerTool: vi.fn(), logger: { warn, debug: vi.fn() } };

    // Inject the no-runtime condition through the same DI hook the
    // bridge uses internally — see resolveJsRuntimeForBridge above.
    const handle = await bootstrapMCPTools(fakePi, "/non/existent/server.mjs", {
      _resolveJsRuntime: () => null,
    } as unknown as { env?: NodeJS.ProcessEnv });

    expect(handle.tools).toEqual([]);
    expect(fakePi.registerTool).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => String(c[0])).join("");
    expect(logged.includes("no JS runtime") || logged.includes("runtime")).toBe(true);

    stderrSpy.mockRestore();
  });

  it("makeBridgeDiag routes to pi.logger and NEVER process.stderr; splitDiagLines is regex-free (#868)", async () => {
    const { makeBridgeDiag, splitDiagLines } = await import(
      "../../src/adapters/pi/mcp-bridge.js"
    );
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const warn = vi.fn();
    const debug = vi.fn();
    const diag = makeBridgeDiag({ registerTool: vi.fn(), logger: { warn, debug } });
    // the exact line that corrupted the editor in #868:
    diag(
      "[mcp-bridge] [context-mode] idle MCP bridge child self-shutdown after 180000ms with no activity (#854)",
      "debug",
    );
    diag("[context-mode] WARNING: actionable", "warn");
    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(stderrSpy).not.toHaveBeenCalled();

    // No logger reachable -> drop silently, never throw, never touch stderr.
    const diagNoLogger = makeBridgeDiag({ registerTool: vi.fn() });
    expect(() => diagNoLogger("anything", "warn")).not.toThrow();
    expect(stderrSpy).not.toHaveBeenCalled();

    // splitDiagLines: \n split, trailing \r stripped, final partial preserved.
    expect(splitDiagLines("a\nb\r\nc")).toEqual(["a", "b", "c"]);
    expect(splitDiagLines("solo")).toEqual(["solo"]);
    expect(splitDiagLines("trailing\n")).toEqual(["trailing"]);

    stderrSpy.mockRestore();
  });
});

// Slice 5 — broken-pipe hardening during stdio writes
//
// Regression: if the MCP child closed its stdin after replying to
// initialize but before the bridge sent notifications/initialized,
// notify() could throw `write EPIPE` synchronously. Because initialize()
// calls notify() after the awaited request resolves, that exception
// escaped as a Pi-level uncaughtException and terminated the session.
describe("MCPStdioClient — handles EPIPE when writing to child stdin", () => {
  it("does not throw when an initialize notification hits a broken pipe", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient("/unused/server.mjs");
    const epipe = Object.assign(new Error("write EPIPE"), {
      code: "EPIPE",
      errno: -32,
      syscall: "write",
    });

    (client as unknown as { child: unknown }).child = {
      stdin: {
        destroyed: false,
        writableEnded: false,
        closed: false,
        write: () => {
          throw epipe;
        },
      },
    };

    expect(() => client.notify("notifications/initialized", {})).not.toThrow();
    expect((client as unknown as { exited: boolean }).exited).toBe(true);
  });

  it("rejects a request instead of throwing when the write hits a broken pipe", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient("/unused/server.mjs");
    const epipe = Object.assign(new Error("write EPIPE"), {
      code: "EPIPE",
      errno: -32,
      syscall: "write",
    });

    (client as unknown as { child: unknown }).child = {
      stdin: {
        destroyed: false,
        writableEnded: false,
        closed: false,
        write: () => {
          throw epipe;
        },
      },
    };

    await expect(client.request("tools/list", {}, 100)).rejects.toThrow(
      "MCP server exited",
    );
    expect((client as unknown as { exited: boolean }).exited).toBe(true);
  });

  it("rejects async stdin write callback errors without process-level uncaught exceptions", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient("/unused/server.mjs");
    const stdin = new EventEmitter() as EventEmitter & {
      destroyed: boolean;
      writableEnded: boolean;
      closed: boolean;
      write: (_data: string, cb: (err?: NodeJS.ErrnoException) => void) => boolean;
    };
    stdin.destroyed = false;
    stdin.writableEnded = false;
    stdin.closed = false;
    stdin.write = (_data, cb) => {
      queueMicrotask(() => {
        cb(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      });
      return false;
    };

    (client as unknown as { child: unknown }).child = { stdin };

    await expect(client.request("tools/list", {}, 100)).rejects.toThrow(
      "MCP server exited",
    );
    expect((client as unknown as { exited: boolean }).exited).toBe(true);
  });
});

// Slice 6 — respawn after MCP child exit (#583)
//
// Regression: when the Pi-spawned child exits cleanly while Pi keeps the
// previously-registered tool handles, the bridge client has
// `exited=true` and every subsequent request rejects with
// "MCP server has exited". The user sees a permanently broken set of
// `ctx_*` tools until they restart Pi.
//
// Fix: when `callTool()` is invoked on an exited client, respawn the
// MCP child + re-`initialize()` transparently before issuing the call,
// so already-registered Pi tools recover on the very next use.
describe("MCPStdioClient — respawns after MCP child exit (#583)", () => {
  it("re-spawns the child when callTool is invoked after exit, and the call succeeds", async () => {
    // Fake MCP server: handles initialize, tools/list, tools/call.
    // On its FIRST process incarnation it exits cleanly after the first
    // tools/call — mirroring a clean MCP child shutdown. A marker file on disk distinguishes the original child from
    // the respawned one so the second incarnation stays alive.
    const markerPath = join(scratch, "first-incarnation-marker");
    const fakePath = join(scratch, "exit-after-call.mjs");
    writeFileSync(
      fakePath,
      `
      import { existsSync, writeFileSync } from "node:fs";
      const MARKER = ${JSON.stringify(markerPath)};
      const isFirst = !existsSync(MARKER);
      let line = "";
      let callCount = 0;
      process.stdin.on("data", (chunk) => {
        line += chunk.toString("utf-8");
        let idx;
        while ((idx = line.indexOf("\\n")) >= 0) {
          const raw = line.slice(0, idx).trim();
          line = line.slice(idx + 1);
          if (!raw) continue;
          let msg;
          try { msg = JSON.parse(raw); } catch { continue; }
          if (msg.method === "initialize") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\\n");
          } else if (msg.method === "tools/list") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "ping", description: "p", inputSchema: { type: "object" } }] } }) + "\\n");
          } else if (msg.method === "tools/call") {
            callCount++;
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "pong-pid-" + process.pid }] } }) + "\\n");
            // First incarnation: mimic clean MCP child shutdown after one call.
            if (isFirst && callCount === 1) {
              writeFileSync(MARKER, "1");
              setTimeout(() => process.exit(0), 10);
            }
          }
        }
      });
      // Keep the event loop alive until stdin closes / we exit.
      setInterval(() => {}, 60000);
      `,
      "utf-8",
    );

    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(fakePath);
    client.start();
    await client.initialize();

    // First call: succeeds, then the fake server exits cleanly.
    const r1 = await client.callTool("ping", {});
    const t1 = r1.content?.[0]?.text ?? "";
    expect(t1).toMatch(/^pong-pid-/);
    const pid1 = t1.replace(/^pong-pid-/, "");

    // Wait for the child to actually exit so the client observes onExit.
    await new Promise<void>((resolve) => {
      const wait = () => {
        if ((client as unknown as { exited: boolean }).exited) return resolve();
        setTimeout(wait, 25);
      };
      wait();
    });

    // Second call: MUST NOT reject with "MCP server has exited" — the
    // client should respawn and re-initialize transparently.
    const r2 = await client.callTool("ping", {});
    const t2 = r2.content?.[0]?.text ?? "";
    expect(t2).toMatch(/^pong-pid-/);
    const pid2 = t2.replace(/^pong-pid-/, "");
    // New PID proves a fresh child was spawned, not the original.
    expect(pid2).not.toBe(pid1);

    client.shutdown();
  }, 15_000);
});

// ── #583 follow-up: hardening on top of the original respawn-on-exit fix ──
//
// The original #583 patch put the respawn guard in `callTool()` only.
// The follow-up moves it into `request()` (covering `tools/list` and
// `initialize` paths after idle exit) AND adds a single-flight guard so
// concurrent callers don't each spawn their own child and leak orphans.
describe("MCPStdioClient — request() respawns for any method after idle exit (#583 follow-up)", () => {
  it("listTools() after an idle exit triggers respawn (not just callTool)", async () => {
    // Fake server: exits after the FIRST tools/list response. The bridge
    // must respawn on the next listTools() invocation — proving the
    // respawn guard fires for `tools/list`, not only `tools/call`.
    const markerPath = join(scratch, "first-incarnation-marker-list");
    const fakePath = join(scratch, "exit-after-list.mjs");
    writeFileSync(
      fakePath,
      `
      import { existsSync, writeFileSync } from "node:fs";
      const MARKER = ${JSON.stringify(markerPath)};
      const isFirst = !existsSync(MARKER);
      let line = "";
      let listCount = 0;
      process.stdin.on("data", (chunk) => {
        line += chunk.toString("utf-8");
        let idx;
        while ((idx = line.indexOf("\\n")) >= 0) {
          const raw = line.slice(0, idx).trim();
          line = line.slice(idx + 1);
          if (!raw) continue;
          let msg;
          try { msg = JSON.parse(raw); } catch { continue; }
          if (msg.method === "initialize") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\\n");
          } else if (msg.method === "tools/list") {
            listCount++;
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "ping-pid-" + process.pid, description: "p", inputSchema: { type: "object" } }] } }) + "\\n");
            if (isFirst && listCount === 1) {
              writeFileSync(MARKER, "1");
              setTimeout(() => process.exit(0), 10);
            }
          }
        }
      });
      setInterval(() => {}, 60000);
      `,
      "utf-8",
    );

    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(fakePath);
    client.start();
    await client.initialize();

    // First listTools: original incarnation responds, then exits.
    const tools1 = await client.listTools();
    expect(tools1).toHaveLength(1);
    const pid1 = tools1[0].name.replace(/^ping-pid-/, "");

    // Wait for the child to actually exit.
    await new Promise<void>((resolve) => {
      const wait = () => {
        if ((client as unknown as { exited: boolean }).exited) return resolve();
        setTimeout(wait, 25);
      };
      wait();
    });

    // Second listTools: should respawn + re-init, NOT reject. Bug class:
    // pre-fix, this would reject with "MCP server has exited" because the
    // respawn guard lived in callTool only and tools/list went straight
    // through request().
    const tools2 = await client.listTools();
    expect(tools2).toHaveLength(1);
    const pid2 = tools2[0].name.replace(/^ping-pid-/, "");
    expect(pid2).not.toBe(pid1);

    client.shutdown();
  }, 15_000);

  it("concurrent callTool() invocations after exit share ONE respawn (no orphan children)", async () => {
    // Failure mode without the single-flight guard: caller A and caller B
    // both observe `this.exited === true`, both invoke respawn(), each
    // spawns a child. The loser of the race overwrites `this.child` and
    // its child becomes an orphan with no `.kill()` reference.
    //
    // The fake server marks every PID it spawns under a directory. After
    // two concurrent calls, exactly ONE new PID should be observed.
    const markerPath = join(scratch, "first-incarnation-marker-concurrent");
    const pidsDir = join(scratch, "spawned-pids-concurrent");
    const fakePath = join(scratch, "exit-after-call-concurrent.mjs");
    writeFileSync(
      fakePath,
      `
      import { existsSync, writeFileSync, mkdirSync } from "node:fs";
      import { join as joinPath } from "node:path";
      const MARKER = ${JSON.stringify(markerPath)};
      const PIDS_DIR = ${JSON.stringify(pidsDir)};
      mkdirSync(PIDS_DIR, { recursive: true });
      // Record this process pid the moment we boot — covers both the
      // first incarnation AND any respawned child.
      writeFileSync(joinPath(PIDS_DIR, String(process.pid)), "1");
      const isFirst = !existsSync(MARKER);
      let line = "";
      let callCount = 0;
      process.stdin.on("data", (chunk) => {
        line += chunk.toString("utf-8");
        let idx;
        while ((idx = line.indexOf("\\n")) >= 0) {
          const raw = line.slice(0, idx).trim();
          line = line.slice(idx + 1);
          if (!raw) continue;
          let msg;
          try { msg = JSON.parse(raw); } catch { continue; }
          if (msg.method === "initialize") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\\n");
          } else if (msg.method === "tools/list") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "ping", description: "p", inputSchema: { type: "object" } }] } }) + "\\n");
          } else if (msg.method === "tools/call") {
            callCount++;
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "pong-" + process.pid }] } }) + "\\n");
            if (isFirst && callCount === 1) {
              writeFileSync(MARKER, "1");
              setTimeout(() => process.exit(0), 10);
            }
          }
        }
      });
      setInterval(() => {}, 60000);
      `,
      "utf-8",
    );

    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(fakePath);
    client.start();
    await client.initialize();

    // First call: original incarnation responds and exits.
    await client.callTool("ping", {});

    // Wait for exit.
    await new Promise<void>((resolve) => {
      const wait = () => {
        if ((client as unknown as { exited: boolean }).exited) return resolve();
        setTimeout(wait, 25);
      };
      wait();
    });

    // Now fire TWO callTool invocations simultaneously — both see
    // `this.exited === true`. Without single-flight, both would call
    // respawn(), each spawning its own child. With single-flight, only
    // one child should be spawned and both calls share it.
    const [r1, r2] = await Promise.all([
      client.callTool("ping", {}),
      client.callTool("ping", {}),
    ]);
    const respPid1 = (r1.content?.[0]?.text ?? "").replace(/^pong-/, "");
    const respPid2 = (r2.content?.[0]?.text ?? "").replace(/^pong-/, "");
    // Both calls must resolve through the SAME respawned child.
    expect(respPid1).toBe(respPid2);

    // Filesystem evidence: exactly two pids ever marked (original +
    // one respawn). If two respawns raced, we'd see 3 pid files.
    const { readdirSync } = await import("node:fs");
    const recordedPids = readdirSync(pidsDir);
    expect(recordedPids).toHaveLength(2);

    client.shutdown();
  }, 20_000);

  it("respawn() resets state in the documented order — `exited=false` BEFORE initialize()", async () => {
    // Pin the sequencing contract called out in respawn()'s JSDoc.
    // If a future refactor moves `this.exited = false` to AFTER
    // `await this.initialize()`, the recursive request("initialize", ...)
    // inside respawn would see `exited === true` and re-enter respawn
    // forever (infinite loop, not just a stale reject).
    //
    // We exercise the path: state ALL clears before initialize fires.
    const fakePath = join(scratch, "introspect-respawn.mjs");
    writeFileSync(
      fakePath,
      `
      let line = "";
      process.stdin.on("data", (chunk) => {
        line += chunk.toString("utf-8");
        let idx;
        while ((idx = line.indexOf("\\n")) >= 0) {
          const raw = line.slice(0, idx).trim();
          line = line.slice(idx + 1);
          if (!raw) continue;
          let msg;
          try { msg = JSON.parse(raw); } catch { continue; }
          if (msg.method === "initialize") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\\n");
          } else if (msg.method === "tools/call") {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ok" }] } }) + "\\n");
          }
        }
      });
      setInterval(() => {}, 60000);
      `,
      "utf-8",
    );

    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(fakePath);
    client.start();
    await client.initialize();

    // Force the exited flag, then trigger a callTool — request() should
    // run respawn, which must reset state before initialize() fires.
    const internal = client as unknown as {
      exited: boolean;
      initialized: boolean;
      child: unknown;
    };

    // Mark it as exited manually (simulating the post-onExit state
    // without actually killing the child — keeps test deterministic).
    internal.exited = true;

    // callTool must succeed via the respawn path. If `exited` is not
    // cleared before the recursive request("initialize", ...) call,
    // this hangs forever and the test times out at the per-it limit.
    const res = await client.callTool("ping", {});
    expect((res.content?.[0]?.text ?? "")).toBe("ok");

    // Post-call invariants — proves respawn finished cleanly.
    expect(internal.exited).toBe(false);
    expect(internal.initialized).toBe(true);
    expect(internal.child).not.toBeNull();

    client.shutdown();
  }, 15_000);
});

// ── Slice 8 — callTool MUST NOT impose its own timeout (#643) ──
//
// Reported in #643: the bridge enforced a hardcoded 120s ceiling on
// every `tools/call`, so long-running `ctx_execute` (test suites, builds,
// large `cargo test`) failed at the bridge layer with
//   "MCP request timeout after 120000ms: tools/call"
// even though the executor child would have finished.
//
// Mert's directive (no env var, no hardcode bump): REMOVE the timeout
// for `tools/call` entirely. Preserve the 60s bound on
// initialize/tools-list (bootstrap hang detection — legit timeout case).
// The trade-off (a deliberately hung MCP child during tools/call hangs
// the call indefinitely) is accepted: it belongs to the executor /
// child layer, not to the bridge. Background mode and Pi-level cancel
// remain the user-facing escape hatches.
//
// These tests pin the contract behaviorally via fake timers — advancing
// >120s while a `tools/call` is in flight MUST NOT reject it. The
// initialize path still rejects at 60s by default (regression guard).
describe("MCPStdioClient — callTool has no bridge-imposed timeout (#643)", () => {
  it("callTool does not reject when bridge clock advances past the old 120s ceiling", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient("/unused/server.mjs");
    const stdin = {
      destroyed: false,
      writableEnded: false,
      closed: false,
      write: (_data: string, cb?: (err?: Error) => void) => {
        cb?.();
        return true;
      },
    };
    (client as unknown as { child: unknown }).child = { stdin };

    vi.useFakeTimers();
    try {
      const inFlight = client.callTool("ping", {});
      // Suppress unhandledrejection while we observe pending state.
      const settled: { value: "resolved" | "rejected" | null } = { value: null };
      void inFlight.then(
        () => {
          settled.value = "resolved";
        },
        () => {
          settled.value = "rejected";
        },
      );

      // Advance well past the old DEFAULT_CALL_TIMEOUT_MS = 120_000ms
      // ceiling. Before the fix this rejects with "MCP request timeout
      // after 120000ms". After the fix the bridge installs no timer for
      // tools/call, so the promise stays pending.
      vi.advanceTimersByTime(300_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(settled.value).toBe(null);

      // Now feed the response — proves the call still resolves cleanly
      // when the server eventually replies, no matter how late.
      const id = (client as unknown as { requestId: number }).requestId;
      const response = JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "late-but-fine" }] },
      });
      (client as unknown as {
        onData: (b: Buffer) => void;
      }).onData(Buffer.from(response + "\n", "utf-8"));

      const r = await inFlight;
      expect(r.content?.[0]?.text).toBe("late-but-fine");
    } finally {
      vi.useRealTimers();
    }
  });

  it("initialize still rejects at the 60s default timeout (regression guard)", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient("/unused/server.mjs");
    const stdin = {
      destroyed: false,
      writableEnded: false,
      closed: false,
      write: (_data: string, cb?: (err?: Error) => void) => {
        cb?.();
        return true;
      },
    };
    (client as unknown as { child: unknown }).child = { stdin };

    vi.useFakeTimers();
    try {
      const inFlight = client.initialize();
      const rejection = inFlight.catch((err) => err);

      // Default request timeout for initialize is 60_000ms; advancing
      // past it MUST cause the request to reject. This pins the bound
      // that #643 explicitly preserves.
      vi.advanceTimersByTime(60_001);
      const err = await rejection;
      expect(String(err)).toMatch(/MCP request timeout after 60000ms: initialize/);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── Slice 9 — bootstrap retries on slow `initialize` (#647) ──
//
// Reported in #647: when the spawned MCP child is slow to start (cold
// NFS home dir, first JIT compile of server.bundle.mjs, constrained CI),
// `initialize` can exceed the 60s ceiling. The bridge then catches the
// timeout, logs to stderr, and continues with NO `ctx_*` tools
// registered — the session is silently degraded for its entire lifetime
// while the routing block keeps spending ~2.5K tokens per turn telling
// the LLM to call ctx_* tools it cannot reach.
//
// The 60s timeout itself is correct (per #643) and must stay. The fix
// is at the bootstrap layer: on `initialize` failure, shut down the
// child, respawn, and retry — up to MAX_INIT_RETRIES additional
// attempts, then degrade as today (let the existing extension-level
// rejection handler log + run with empty tool list).
//
// These tests pin three things:
//   1. Two consecutive `initialize` failures followed by success → bridge
//      registers tools normally (recovery happy path).
//   2. All attempts fail → bootstrap rejects (preserves the existing
//      "degrade via extension.ts then/onRejected" contract).
//   3. Each retry shuts down the prior child (no orphan accumulation).
describe("bootstrapMCPTools — retries on slow initialize (#647)", () => {
  it("registers tools after two transient initialize timeouts followed by success", async () => {
    const { bootstrapMCPTools, MCPStdioClient } = await import(
      "../../src/adapters/pi/mcp-bridge.js"
    );

    // Track how many initialize/start/shutdown cycles ran.
    const startCalls: number[] = [];
    const initCalls: number[] = [];
    const shutdownCalls: number[] = [];

    let attempt = 0;
    type AnyClient = MCPStdioClient & { initialized: boolean; exited: boolean };

    // Patch prototype so the inner `new MCPStdioClient(...)` is captured.
    const realStart = MCPStdioClient.prototype.start;
    const realInit = MCPStdioClient.prototype.initialize;
    const realList = MCPStdioClient.prototype.listTools;
    const realShutdown = MCPStdioClient.prototype.shutdown;

    MCPStdioClient.prototype.start = function (this: AnyClient) {
      startCalls.push(Date.now());
      // Stub a non-null `child` so other code paths see a live client.
      (this as unknown as { child: unknown }).child = { kill: () => true };
      this.exited = false;
    };
    MCPStdioClient.prototype.initialize = async function (this: AnyClient) {
      attempt++;
      initCalls.push(attempt);
      if (attempt <= 2) {
        // Simulate the exact rejection shape produced by request() on
        // the 60s timeout — caller must accept any Error-shaped failure.
        throw new Error("MCP request timeout after 60000ms: initialize");
      }
      this.initialized = true;
    };
    MCPStdioClient.prototype.listTools = async function () {
      return [{ name: "ctx_search", description: "search", inputSchema: { type: "object" } }];
    };
    MCPStdioClient.prototype.shutdown = function (this: AnyClient) {
      shutdownCalls.push(Date.now());
      (this as unknown as { child: unknown }).child = null;
      this.initialized = false;
      this.exited = true;
    };

    try {
      const registered: string[] = [];
      const fakePi = {
        registerTool: (tool: { name: string }) => {
          registered.push(tool.name);
        },
      };

      const handle = await bootstrapMCPTools(fakePi, "/unused/server.mjs", {
        _resolveJsRuntime: () => "/usr/bin/node",
      });

      // Happy-path recovery: tool registered after retries.
      expect(handle.tools).toEqual(["ctx_search"]);
      expect(registered).toEqual(["ctx_search"]);
      // Exactly 3 initialize attempts (1 initial + 2 retries).
      expect(initCalls.length).toBe(3);
      // Each failed attempt MUST shutdown the prior child before respawn
      // (no orphan accumulation). Two failures → at least two shutdowns.
      expect(shutdownCalls.length).toBeGreaterThanOrEqual(2);
      // start() called once per attempt (3 total).
      expect(startCalls.length).toBe(3);
    } finally {
      MCPStdioClient.prototype.start = realStart;
      MCPStdioClient.prototype.initialize = realInit;
      MCPStdioClient.prototype.listTools = realList;
      MCPStdioClient.prototype.shutdown = realShutdown;
    }
  }, 30_000);

  it("rejects after exhausting retries so extension.ts can run its degrade-and-log handler", async () => {
    const { bootstrapMCPTools, MCPStdioClient } = await import(
      "../../src/adapters/pi/mcp-bridge.js"
    );

    const realStart = MCPStdioClient.prototype.start;
    const realInit = MCPStdioClient.prototype.initialize;
    const realShutdown = MCPStdioClient.prototype.shutdown;

    let initAttempts = 0;
    MCPStdioClient.prototype.start = function (this: MCPStdioClient) {
      (this as unknown as { child: unknown }).child = { kill: () => true };
      (this as unknown as { exited: boolean }).exited = false;
    };
    MCPStdioClient.prototype.initialize = async function () {
      initAttempts++;
      throw new Error("MCP request timeout after 60000ms: initialize");
    };
    MCPStdioClient.prototype.shutdown = function (this: MCPStdioClient) {
      (this as unknown as { child: unknown }).child = null;
      (this as unknown as { exited: boolean }).exited = true;
    };

    try {
      const fakePi = { registerTool: vi.fn() };
      await expect(
        bootstrapMCPTools(fakePi, "/unused/server.mjs", {
          _resolveJsRuntime: () => "/usr/bin/node",
        }),
      ).rejects.toThrow(/timeout|initialize/i);

      // Must have made the full 1 + MAX_INIT_RETRIES (=2) = 3 attempts
      // before giving up.
      expect(initAttempts).toBe(3);
      expect(fakePi.registerTool).not.toHaveBeenCalled();
    } finally {
      MCPStdioClient.prototype.start = realStart;
      MCPStdioClient.prototype.initialize = realInit;
      MCPStdioClient.prototype.shutdown = realShutdown;
    }
  }, 30_000);
});

// ── Slice 10 — CJK wide-character width-aware truncation (#665) ──
//
// Bug: truncateAnsiLine() counted every JS character as width 1, but
// CJK characters (Chinese, Japanese, Korean) occupy 2 columns in a
// terminal. This caused PiTextComponent.render() to produce lines whose
// actual visible width exceeded the requested `width`, triggering a
// pi-tui crash: "visible width: 162 > terminal width: 147".
//
// The fix: truncateAnsiLine() must measure CJK characters as width 2.
//
// These tests pin the contract:
//   1. Pure CJK text does not exceed the requested width.
//   2. Mixed ASCII + CJK text is correctly truncated.
//   3. ANSI escape sequences are preserved but NOT counted toward width.
//   4. The crash line from the real incident is handled correctly.
describe("truncateAnsiLine / PiTextComponent — CJK width-aware truncation (#665)", () => {
  const testSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  function extractTestTerminalEscape(str: string, pos: number): { length: number } | null {
    if (pos >= str.length || str[pos] !== "\x1b") return null;
    const next = str[pos + 1];
    if (next === "[") {
      let j = pos + 2;
      while (j < str.length) {
        const code = str.charCodeAt(j);
        if (code >= 0x40 && code <= 0x7e) return { length: j + 1 - pos };
        j++;
      }
      return null;
    }
    if (next === "]" || next === "_") {
      let j = pos + 2;
      while (j < str.length) {
        if (str[j] === "\x07") return { length: j + 1 - pos };
        if (str[j] === "\x1b" && str[j + 1] === "\\") return { length: j + 2 - pos };
        j++;
      }
      return null;
    }
    return null;
  }

  function stripTestTerminalEscapes(str: string): string {
    let stripped = "";
    let i = 0;
    while (i < str.length) {
      const escape = extractTestTerminalEscape(str, i);
      if (escape) {
        i += escape.length;
        continue;
      }
      stripped += str[i];
      i++;
    }
    return stripped;
  }

  function testZeroWidthCodePoint(cp: number): boolean {
    return (
      cp < 0x20 ||
      (cp >= 0x7f && cp <= 0x9f) ||
      (cp >= 0x300 && cp <= 0x36f) ||
      (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x1dc0 && cp <= 0x1dff) ||
      (cp >= 0x20d0 && cp <= 0x20ff) ||
      (cp >= 0xfe00 && cp <= 0xfe0f) ||
      (cp >= 0xfe20 && cp <= 0xfe2f) ||
      cp === 0x200b ||
      cp === 0x200c ||
      cp === 0x200d ||
      cp === 0xfeff
    );
  }

  function testWideCodePoint(cp: number): boolean {
    return cp >= 0x1100 && (
      cp <= 0x115f ||
      (cp >= 0xa960 && cp <= 0xa97c) ||
      cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xd7b0 && cp <= 0xd7fb) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x2fffd) ||
      (cp >= 0x30000 && cp <= 0x3fffd)
    );
  }

  function testCouldBeEmoji(segment: string): boolean {
    const cp = segment.codePointAt(0) ?? 0;
    return (
      (cp >= 0x1f000 && cp <= 0x1fbff) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2b50 && cp <= 0x2b55) ||
      segment.includes("\uFE0F") ||
      segment.includes("\u200D")
    );
  }

  // Test oracle modelled after Pi TUI's visibleWidth contract: strip terminal
  // control sequences, segment graphemes, count CJK/fullwidth/emoji as wide,
  // and treat mark-only clusters as zero-width.
  function visibleWidth(s: string): number {
    const stripped = stripTestTerminalEscapes(s.replace(/\t/g, "   "));
    let w = 0;
    for (const { segment } of testSegmenter.segment(stripped)) {
      const cps = [...segment].map((ch) => ch.codePointAt(0) ?? 0);
      if (cps.every(testZeroWidthCodePoint)) continue;
      const cp = cps.find((c) => !testZeroWidthCodePoint(c)) ?? cps[0] ?? 0;
      w += testCouldBeEmoji(segment) || (cp >= 0x1f1e6 && cp <= 0x1f1ff) || testWideCodePoint(cp) ? 2 : 1;
    }
    return w;
  }

  it("pure CJK line does not exceed requested width", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // 10 Chinese characters → visible width 20
    comp.setText("媒体上传一律用数据删除检查不做协议");
    const lines = comp.render(15);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(15);
    }
  });

  it("mixed ASCII + CJK line is width-aware truncated", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // "AB" = 2, "媒体上传" = 8, "CD" = 2 → total 12
    comp.setText("AB媒体上传CD");
    const lines = comp.render(8);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(8);
    }
  });

  it("ANSI escape sequences are preserved and not counted toward width", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // Red color codes around CJK text
    const red = "\x1b[31m";
    const reset = "\x1b[0m";
    comp.setText(`${red}媒体上传一律用数据删除检查不做协议${reset}`);
    const lines = comp.render(10);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(10);
      // ANSI codes must survive
      expect(line).toContain(red);
    }
  });

  it("the real crash line (CJK mixed with ASCII) fits within terminal width", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // The actual line that caused the crash in pi-crash.log:
    // visible width was 161, terminal was 147
    const crashLine =
      "  - **媒体上传**: 一律用 data URL / base64。删除 `KimiFiles` 和 `isinstance(chat_provider, Kimi)` 检查。不做 `MediaUploader` 协议，除非未来出现真实 provider 需求。";
    comp.setText(crashLine);
    const lines = comp.render(147);
    for (const line of lines) {
      const w = visibleWidth(line);
      expect(w).toBeLessThanOrEqual(147);
    }
  });

  it("does not keep an emoji when it would exceed the render width", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // Pi's TUI counts RGI emoji as width 2. Keeping the emoji here would
    // render as width 6 in a width-5 component and trip the TUI guard.
    comp.setText("AAAA😀");
    expect(comp.render(5)).toEqual(["AAAA"]);
  });

  it("does not emit a dangling escape byte when truncating before an APC sequence", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    comp.setText("AAAA\x1b_marker\x07B");
    expect(comp.render(5)).toEqual(["AAAA\x1b_marker\x07B"]);
  });

  it("counts visible text between OSC 8 ST-terminated hyperlink sequences", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    const open = "\x1b]8;;https://example.com\x1b\\";
    const close = "\x1b]8;;\x1b\\";
    comp.setText(`AAAA${open}B${close}C`);
    expect(comp.render(5)).toEqual([`AAAA${open}B${close}`]);
  });

  it("does not count standalone combining marks toward render width", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // Pi's visibleWidth treats mark-only grapheme clusters as zero-width.
    comp.setText("\u0301ABCDE");
    expect(comp.render(5)).toEqual(["\u0301ABCDE"]);
  });

  it("truncateAnsiLine returns empty for maxWidth 0 or negative", async () => {
    const mod = await import("../../src/adapters/pi/mcp-bridge.js");
    const { truncateAnsiLine } = mod as unknown as {
      truncateAnsiLine: (line: string, maxWidth: number) => string;
    };
    expect(truncateAnsiLine("媒体上传", 0)).toBe("");
    expect(truncateAnsiLine("媒体上传", -1)).toBe("");
  });

  it("Hangul Extended-A/B characters are correctly width-aware (#665)", async () => {
    const { PiTextComponent } = await import("../../src/adapters/pi/mcp-bridge.js");
    const comp = new PiTextComponent();
    // Hangul Jamo Extended-A: U+A960..U+A97C (ꥠ..ꥼ)
    // Hangul Jamo Extended-B: U+D7B0..U+D7FB (ퟀ..ퟻ)
    // Mix with ASCII: "A" = 1, "ꥠꥡퟰퟱ" = 8, "B" = 1 → total 10
    const hangulExtA = "\uA960\uA961"; // ꥠꥡ
    const hangulExtB = "\uD7B0\uD7B1"; // ퟰퟱ
    comp.setText(`A${hangulExtA}${hangulExtB}B`);
    const lines = comp.render(4);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(4);
    }
    // Must actually truncate (total width 6 > 4)
    const totalW = lines.reduce((sum, l) => sum + visibleWidth(l), 0);
    expect(totalW).toBeLessThanOrEqual(4);
  });
});

// ── #868: keep the FOREGROUND interactive session's bridge alive ──
// The #854 idle reaper must NOT reap the foreground child (a 3-min pause
// shouldn't drop the user's ctx_* tools), while sub-context / non-interactive
// children keep the reaper so abandoned ones still can't accumulate (#854).
describe("foreground keep-alive — idle reaper scoped by session kind (#868)", () => {
  it("isForegroundSession reads ctx.hasUI with a fail-safe default of foreground", async () => {
    const { isForegroundSession } = await import("../../src/adapters/pi/mcp-bridge.js");
    expect(isForegroundSession({ hasUI: true })).toBe(true);   // interactive foreground
    expect(isForegroundSession({ hasUI: false })).toBe(false); // subagent / print / rpc
    expect(isForegroundSession({})).toBe(true);                // ambiguous -> keep alive
    expect(isForegroundSession(undefined)).toBe(true);         // no ctx -> keep alive
    expect(isForegroundSession(null)).toBe(true);
  });

  it("foregroundBridgeEnv disables the reaper (IDLE_MS=0) for foreground, leaves sub-contexts on", async () => {
    const { foregroundBridgeEnv } = await import("../../src/adapters/pi/mcp-bridge.js");
    const base = { CONTEXT_MODE_BRIDGE_DEPTH: "1", PATH: "/x" };
    const fg = foregroundBridgeEnv(base, true);
    expect(fg.CONTEXT_MODE_BRIDGE_IDLE_MS).toBe("0"); // #868: never idle-reaped
    expect(fg.PATH).toBe("/x");                        // base preserved
    expect(base.CONTEXT_MODE_BRIDGE_IDLE_MS).toBeUndefined(); // no mutation of input
    const sub = foregroundBridgeEnv(base, false);
    expect(sub.CONTEXT_MODE_BRIDGE_IDLE_MS).toBeUndefined(); // #854: sub keeps the reaper
  });

  it("a foreground bridge child inherits CONTEXT_MODE_BRIDGE_IDLE_MS=0 in its spawn env", async () => {
    const { MCPStdioClient, foregroundBridgeEnv } = await import(
      "../../src/adapters/pi/mcp-bridge.js"
    );
    const serverPath = join(scratch, "fake-idle-server.mjs");
    writeFileSync(serverPath, "process.stdin.resume();\n"); // inert child; we only inspect env
    const env = foregroundBridgeEnv(
      { ...process.env, CONTEXT_MODE_BRIDGE_DEPTH: "1" },
      true,
    );
    const client = new MCPStdioClient(serverPath, env, process.execPath);
    client.start();
    const live = (client as unknown as { _spawnEnv?: NodeJS.ProcessEnv })._spawnEnv;
    expect(live?.CONTEXT_MODE_BRIDGE_IDLE_MS).toBe("0");
    client.shutdown();
  });
});
