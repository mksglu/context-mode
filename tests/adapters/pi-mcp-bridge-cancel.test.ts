/**
 * Pi MCP bridge — interrupt support (Esc / app.interrupt).
 *
 * Bug: Pi passes its run AbortSignal into tool execute()
 * (`execute(toolCallId, params, signal, onUpdate, ctx)`), and the agent
 * loop only re-checks `signal.aborted` AFTER the tool promise settles.
 * The previous Pi bridge registered `execute(_toolCallId, params)` —
 * ignoring the signal — and the MCP client had no per-request cancel, so
 * an in-flight ctx_execute call held the whole turn hostage: pressing Esc
 * did nothing until the tool finished on its own.
 *
 * These tests pin the fix:
 *
 *   1. Aborting an in-flight tools/call rejects the promise with
 *      "aborted" promptly and kills the MCP child (stops the real work).
 *   2. A pre-aborted signal rejects immediately, without contacting the
 *      server.
 *   3. Aborting one of two in-flight calls rejects only that call; the
 *      sibling keeps running on the same child and completes normally.
 *   4. After an abort-killed child, the next call self-heals via the
 *      existing respawn path (#583).
 *   5. A broken stdin (the EPIPE race when an abort kills the child while
 *      a `notifications/cancelled` frame is still being written) is handled
 *      as "server exited" instead of becoming an uncaught exception that
 *      crashes the host process.
 */
import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "ctx-pi-cancel-"));
});

afterEach(() => {
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/** Fake MCP server: "slow" calls answer after a delay, "hang" never do. */
function writeFakeServer() {
  const fakePath = join(scratch, "slow-server.mjs");
  writeFileSync(
    fakePath,
    `
    process.stdin.on("data", (chunk) => {
      for (const raw of chunk.toString("utf-8").split("\\n")) {
        const line = raw.trim();
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.method === "initialize") {
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\\n");
        } else if (msg.method === "tools/call") {
          const tag = msg.params?.arguments?.tag;
          if (tag === "slow") {
            setTimeout(() => {
              process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "done-slow" }] } }) + "\\n");
            }, 400);
          }
          // tag === "hang": never answer — models a long ctx_execute.
        }
      }
    });
    setInterval(() => {}, 60000);
    `,
    "utf-8",
  );
  return fakePath;
}

async function pollFor(cond: () => boolean, timeoutMs = 5000, what = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

type TestableClient = {
  exited: boolean;
  pending: Map<number, unknown>;
  child: { stdin: NodeJS.WritableStream | null };
  shutdown(): void;
};

describe("MCPStdioClient — interrupt (abort signal)", () => {
  it("aborting an in-flight tools/call rejects with 'aborted' and kills the child", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(writeFakeServer()) as unknown as TestableClient;
    try {
      client.start();
      await client.initialize();

      const ac = new AbortController();
      const started = performance.now();
      const call = (client as unknown as {
        callTool(name: string, args: unknown, signal?: AbortSignal): Promise<{ content?: Array<{ text?: string }> }>;
      }).callTool("ctx_execute", { tag: "hang" }, ac.signal);

      // Wait until the request is actually in flight.
      await pollFor(() => client.pending.size >= 1, 5000, "in-flight request");

      ac.abort();
      await expect(call).rejects.toThrow("aborted");
      expect(performance.now() - started).toBeLessThan(2000);

      // The child must actually die so the executing work stops.
      await pollFor(() => client.exited, 5000, "child exit");
    } finally {
      client.shutdown();
    }
  });

  it("a pre-aborted signal rejects immediately without contacting the server", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(writeFakeServer()) as unknown as TestableClient;
    try {
      client.start();
      await client.initialize();

      const ac = new AbortController();
      ac.abort();
      const call = (client as unknown as {
        callTool(name: string, args: unknown, signal?: AbortSignal): Promise<unknown>;
      }).callTool("ctx_execute", { tag: "hang" }, ac.signal);
      await expect(call).rejects.toThrow("aborted");
      // Nothing may be in flight and the child must stay alive.
      expect(client.pending.size).toBe(0);
      expect(client.exited).toBe(false);
    } finally {
      client.shutdown();
    }
  });

  it("aborting one of two in-flight calls leaves the sibling running on the same child", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(writeFakeServer()) as unknown as TestableClient;
    const callTool = (
      client as unknown as {
        callTool(name: string, args: unknown, signal?: AbortSignal): Promise<{ content?: Array<{ text?: string }> }>;
      }
    ).callTool.bind(client);
    try {
      client.start();
      await client.initialize();

      const acSibling = new AbortController();
      const acAborted = new AbortController();
      const sibling = callTool("ctx_execute", { tag: "slow" }, acSibling.signal);
      const doomed = callTool("ctx_execute", { tag: "hang" }, acAborted.signal);

      await pollFor(() => client.pending.size >= 2, 5000, "two in-flight requests");
      acAborted.abort();

      await expect(doomed).rejects.toThrow("aborted");
      // One request still in flight → child must NOT be killed.
      expect(client.exited).toBe(false);
      expect(client.pending.size).toBe(1);

      // The sibling completes normally through the surviving child.
      const result = await sibling;
      expect(result.content?.[0]?.text).toBe("done-slow");
      expect(client.exited).toBe(false);
    } finally {
      client.shutdown();
    }
  });

  it("the next call after an abort-killed child self-heals via respawn (#583)", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const fakePath = writeFakeServer();
    const client = new MCPStdioClient(fakePath) as unknown as TestableClient;
    const callTool = (
      client as unknown as {
        callTool(name: string, args: unknown, signal?: AbortSignal): Promise<{ content?: Array<{ text?: string }> }>;
      }
    ).callTool.bind(client);
    try {
      client.start();
      await client.initialize();

      const ac = new AbortController();
      const call = callTool("ctx_execute", { tag: "hang" }, ac.signal);
      await pollFor(() => client.pending.size >= 1, 5000, "in-flight request");
      ac.abort();
      await expect(call).rejects.toThrow("aborted");
      await pollFor(() => client.exited, 5000, "child exit");

      // A fresh call must respawn the child and succeed.
      const next = await callTool("ctx_execute", { tag: "slow" });
      expect(next.content?.[0]?.text).toBe("done-slow");
    } finally {
      client.shutdown();
    }
  });

  it("a broken stdin (EPIPE race on abort) is handled, not uncaught", async () => {
    const { MCPStdioClient } = await import("../../src/adapters/pi/mcp-bridge.js");
    const client = new MCPStdioClient(writeFakeServer()) as unknown as TestableClient;
    try {
      client.start();
      await client.initialize();

      // Deterministic simulation of the OS closing the pipe's read end while
      // a frame write is in flight — exactly what child.kill() in onAbort
      // races against. destroy(err) emits 'error' on the stream; without a
      // handler it is an uncaught exception that would crash the host.
      client.child.stdin?.destroy(new Error("write EPIPE"));
      await pollFor(() => client.exited, 5000, "client marked exited on stdin error");
    } finally {
      client.shutdown();
    }
  });
});
