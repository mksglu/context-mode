import "./setup-home";
/**
 * Tests for the OpenCode v2 (`setup`) mouth of the dual-support adapter.
 *
 * The v2 mouth is driven through a minimal mock of `Plugin.Context` that captures
 * the tools registered via `ctx.tool.transform` and the handlers registered via
 * `ctx.tool.hook` / `ctx.session.hook`, so each hook can be exercised directly.
 *
 * Covers the v2 spec deltas: merged export, ctx-namespace registration, the
 * JSON-Schema input bridge, routing enforcement, capture, compaction ownership,
 * per-session directory resolution, load-idempotency, and cleanup.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import pluginDefault, { ContextModePlugin } from "../src/adapters/opencode/plugin.js";
import { getCore, resetCoreCache } from "../src/adapters/opencode/core.js";

// ── Mock Plugin.Context ───────────────────────────────────

interface MockCtx {
  ctx: any;
  tools: any[];
  toolHooks: Record<string, Array<(ev: any) => any>>;
  sessionHooks: Record<string, Array<(ev: any) => any>>;
  disposed: string[];
  sessionGetCalls: () => number;
}

/**
 * Build a mock v2 context. `directory` is the plugin-load-scope dir;
 * `sessionDir` (optional) is what `session.get` reports as the session's own
 * location, so per-session resolution can be pointed at a different dir.
 */
function makeMockCtx(directory: string, sessionDir?: string): MockCtx {
  const tools: any[] = [];
  const toolHooks: Record<string, Array<(ev: any) => any>> = {};
  const sessionHooks: Record<string, Array<(ev: any) => any>> = {};
  const disposed: string[] = [];
  let getCallCount = 0;

  const reg = (label: string) => ({
    dispose: async () => {
      disposed.push(label);
    },
  });

  const ctx: any = {
    location: { directory },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        getCallCount++;
        return { location: { directory: sessionDir ?? directory }, sessionID };
      },
      hook: async (name: string, handler: (ev: any) => any) => {
        (sessionHooks[name] ??= []).push(handler);
        return reg(`session:${name}`);
      },
    },
    tool: {
      transform: async (fn: (ed: any) => void) => {
        const editor = {
          add: (tool: any) => {
            tools.push(tool);
          },
        };
        fn(editor);
        return reg("tool.transform");
      },
      hook: async (name: string, handler: (ev: any) => any) => {
        (toolHooks[name] ??= []).push(handler);
        return reg(`tool:${name}`);
      },
    },
  };

  return {
    ctx,
    tools,
    toolHooks,
    sessionHooks,
    disposed,
    sessionGetCalls: () => getCallCount,
  };
}

/** Run the v2 setup mouth against a mock context and return the captured state. */
async function setupV2For(directory: string, sessionDir?: string) {
  const mock = makeMockCtx(directory, sessionDir);
  const cleanup = await (pluginDefault.setup as any)(mock.ctx);
  return { ...mock, cleanup: cleanup as () => Promise<void> };
}

// ── MCP readiness sentinel (routing island checks it in-process) ──
const _sentinelDir = process.platform === "win32" ? tmpdir() : "/tmp";
const mcpSentinel = resolve(_sentinelDir, `context-mode-mcp-ready-${process.pid}`);

beforeEach(() => {
  writeFileSync(mcpSentinel, String(process.pid));
  // Ensure the shared platform resolves to "opencode" (not kilo) for these tests.
  delete process.env.KILO_PID;
});
afterEach(() => {
  try {
    unlinkSync(mcpSentinel);
  } catch {
    /* ignore */
  }
});

// ── Tests ─────────────────────────────────────────────────

describe("OpenCode v2 setup mouth", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "opencode-v2-test-"));
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* cleanup best effort */
    }
  });

  // ── Merged default export ─────────────────────────────

  describe("merged default export", () => {
    it("carries both a v2 `setup` mouth and a v1 `server` mouth", () => {
      expect(pluginDefault).toHaveProperty("id", "context-mode");
      expect(typeof (pluginDefault as any).setup).toBe("function");
      expect(typeof (pluginDefault as any).server).toBe("function");
    });

    it("preserves the pre-1.18.29 named export lifeline", () => {
      expect(typeof ContextModePlugin).toBe("function");
    });
  });

  // ── Tool registration under the ctx namespace ─────────

  describe("tool registration", () => {
    it("registers the ctx tool set under the `ctx` namespace with bare names", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "reg"));
      try {
        const names = tools.map((t) => t.name).sort();
        // Bare names (ctx_ prefix stripped); namespace supplies the ctx_ prefix.
        expect(names).toEqual([
          "batch_execute",
          "doctor",
          "execute",
          "execute_file",
          "fetch_and_index",
          "index",
          "insight",
          "purge",
          "search",
          "stats",
          "upgrade",
        ]);
        for (const t of tools) {
          expect(t.options?.namespace).toBe("ctx");
        }
      } finally {
        await cleanup();
      }
    });

    it("marks the three sandbox-execute tools with the borrowed `bash` permission", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "perm"));
      try {
        const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
        expect(byName.execute.options.permission).toBe("bash");
        expect(byName.execute_file.options.permission).toBe("bash");
        expect(byName.batch_execute.options.permission).toBe("bash");
        // Read-only tools must NOT borrow bash.
        expect(byName.search.options.permission).toBeUndefined();
        expect(byName.stats.options.permission).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("presents a Zod v4 input schema (StandardSchemaV1 marker) on every tool", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "zodv4"));
      try {
        expect(tools.length).toBeGreaterThan(0);
        for (const t of tools) {
          expect((t.input as any)?._zod, `tool ${t.name} input missing _zod`).toBeDefined();
        }
      } finally {
        await cleanup();
      }
    });
  });

  // ── Tool execute: JSON-Schema input bridge ────────────

  describe("tool execute", () => {
    it("runs the shared handler for valid arguments", async () => {
      const dir = join(tempDir, "exec-valid");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        const res = await stats.execute({}, { sessionID: "s-exec-valid" });
        expect(res.output).toContain("context-mode");
      } finally {
        await cleanup();
      }
    });

    it("surfaces invalid arguments as a tool error (not a crash)", async () => {
      const dir = join(tempDir, "exec-invalid");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const batch = tools.find((t) => t.name === "batch_execute")!;
        await expect(
          batch.execute({ queries: ["x"] } as any, { sessionID: "s-exec-invalid" }),
        ).rejects.toThrow(/Invalid arguments for ctx_batch_execute/);
      } finally {
        await cleanup();
      }
    });

    it("coerces JSON-stringified array args via the v3 schema preprocess", async () => {
      const dir = join(tempDir, "exec-coerce");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        const batch = tools.find((t) => t.name === "batch_execute")!;
        const res = await batch.execute(
          {
            commands: JSON.stringify([{ label: "echo", command: "echo v2-coerce" }]),
            queries: JSON.stringify(["v2-coerce"]),
          } as any,
          { sessionID: "s-exec-coerce" },
        );
        expect(res.output).toContain("Executed");
      } finally {
        await cleanup();
      }
    });

    it("surfaces a throwing handler as a failed tool call (not a crash)", async () => {
      const dir = join(tempDir, "exec-handler-throws");
      const { tools, cleanup } = await setupV2For(dir);
      try {
        // The registered tool's execute closes over the shared core's CoreTool.
        // Patch that same object's run to throw (as an isError handler would) and
        // confirm the rejection propagates as a failed tool call.
        const core = await getCore({ platform: "opencode", loadScopeDir: dir });
        const coreTool = core.getTools().find((t: any) => t.name === "ctx_stats")!;
        const origRun = coreTool.run;
        coreTool.run = async () => {
          throw new Error("handler boom");
        };
        try {
          const stats = tools.find((t) => t.name === "stats")!;
          await expect(stats.execute({}, { sessionID: "s-throw" })).rejects.toThrow(
            "handler boom",
          );
        } finally {
          coreTool.run = origRun;
        }
      } finally {
        await cleanup();
      }
    });
  });

  // ── Destructive-tool policy (context-mode-owned) ──────

  describe("destructive-tool policy", () => {
    it("refuses ctx_purge by default with a context-mode-attributed error", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "destr-purge-default"));
      try {
        const purge = tools.find((t) => t.name === "purge")!;
        await expect(purge.execute({}, { sessionID: "s-purge" })).rejects.toThrow(
          /disabled by context-mode policy/,
        );
        await expect(purge.execute({}, { sessionID: "s-purge" })).rejects.toThrow(
          /not a host permission denial/,
        );
      } finally {
        await cleanup();
      }
    });

    it("refuses ctx_upgrade by default", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "destr-up-default"));
      try {
        const up = tools.find((t) => t.name === "upgrade")!;
        await expect(up.execute({}, { sessionID: "s-up" })).rejects.toThrow(
          /disabled by context-mode policy/,
        );
      } finally {
        await cleanup();
      }
    });

    it("allows destructive tools when CONTEXT_MODE_ALLOW_DESTRUCTIVE=1", async () => {
      const dir = join(tempDir, "destr-allow");
      const { tools, cleanup } = await setupV2For(dir);
      const prev = process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE;
      try {
        // Patch run to a sentinel so the allow path is exercised without real
        // destructive work.
        const core = await getCore({ platform: "opencode", loadScopeDir: dir });
        const coreTool = core.getTools().find((t: any) => t.name === "ctx_purge")!;
        const origRun = coreTool.run;
        coreTool.run = async () => "purge-ran";
        process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE = "1";
        try {
          const purge = tools.find((t) => t.name === "purge")!;
          const res = await purge.execute({}, { sessionID: "s-allow" });
          expect(res.output).toBe("purge-ran");
        } finally {
          coreTool.run = origRun;
          if (prev === undefined) delete process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE;
          else process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE = prev;
        }
      } finally {
        await cleanup();
      }
    });

    it("does not gate non-destructive tools under the default policy", async () => {
      const { tools, cleanup } = await setupV2For(join(tempDir, "destr-nongate"));
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        const res = await stats.execute({}, { sessionID: "s-nongate" });
        expect(res.output).toContain("context-mode");
      } finally {
        await cleanup();
      }
    });
  });

  // ── Routing enforcement (execute.before) ──────────────

  describe("execute.before routing", () => {
    it("blocks a curl command (deny throws, or modify rewrites to echo)", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "route-curl"));
      try {
        const before = toolHooks["execute.before"][0];
        const ev: any = {
          tool: "Bash",
          sessionID: "s-route-curl",
          input: { command: "curl https://example.com/data" },
        };
        try {
          await before(ev);
          expect(String(ev.input.command)).toMatch(/^echo /);
        } catch (e: any) {
          expect(e.message).toContain("context-mode");
        }
      } finally {
        await cleanup();
      }
    });

    it("passes through an unrouted tool unchanged", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "route-pass"));
      try {
        const before = toolHooks["execute.before"][0];
        const ev: any = { tool: "TaskCreate", sessionID: "s-route-pass", input: { subject: "x" } };
        await before(ev);
        expect(ev.input).toEqual({ subject: "x" });
      } finally {
        await cleanup();
      }
    });

    it("injects guidance as additionalContext for an allowed grep", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "route-grep"));
      try {
        const before = toolHooks["execute.before"][0];
        const ev: any = { tool: "grep", sessionID: "s-route-grep", input: { command: "grep hello" } };
        await before(ev);
        expect(ev.input).toHaveProperty("additionalContext");
        expect(String(ev.input.additionalContext)).toContain("<context_guidance>");
      } finally {
        await cleanup();
      }
    });
  });

  // ── Capture (execute.after) ───────────────────────────

  describe("execute.after capture", () => {
    it("captures a completed tool event without throwing", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "cap-ok"));
      try {
        const after = toolHooks["execute.after"][0];
        await expect(
          after({
            tool: "Read",
            sessionID: "s-cap-ok",
            input: { file_path: "/src/index.ts" },
            status: "completed",
            result: { output: "export default {}", metadata: {} },
          }),
        ).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("skips capture on the error status path", async () => {
      const { toolHooks, cleanup } = await setupV2For(join(tempDir, "cap-err"));
      try {
        const after = toolHooks["execute.after"][0];
        await expect(
          after({
            tool: "Read",
            sessionID: "s-cap-err",
            input: {},
            status: "error",
            error: { message: "boom" },
          }),
        ).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });
  });

  // ── Prompt capture ────────────────────────────────────

  describe("prompt capture", () => {
    it("captures a real user prompt", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "prompt-ok"));
      try {
        const prompt = sessionHooks["prompt"][0];
        await expect(
          prompt({ sessionID: "s-prompt-ok", prompt: { text: "please refactor the parser" } }),
        ).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("skips an empty prompt", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "prompt-empty"));
      try {
        const prompt = sessionHooks["prompt"][0];
        await expect(prompt({ sessionID: "s-prompt-empty", prompt: { text: "" } })).resolves.toBeUndefined();
      } finally {
        await cleanup();
      }
    });
  });

  // ── Context hook: routing block + resume ──────────────

  describe("context hook (primary injection)", () => {
    it("injects the routing block on a fresh session", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "ctx-fresh"));
      try {
        const context = sessionHooks["context"][0];
        const ev: any = { sessionID: "s-ctx-fresh", system: [{ type: "text", text: "HEADER" }] };
        await context(ev);
        expect(ev.system[0].text).toBe("HEADER");
        expect(ev.system.length).toBe(2);
        expect(ev.system[1].text).toContain("<context_window_protection>");
      } finally {
        await cleanup();
      }
    });

    it("does not re-inject when routing instructions are already present", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "ctx-existing"));
      try {
        const context = sessionHooks["context"][0];
        const existing =
          "<context_window_protection> use ctx_search and ctx_index for retrieval </context_window_protection>";
        const ev: any = { sessionID: "s-ctx-existing", system: [{ type: "text", text: existing }] };
        await context(ev);
        // Only the pre-existing block; no duplicate appended.
        expect(ev.system.length).toBe(1);
      } finally {
        await cleanup();
      }
    });

    it("appends a claimed resume snapshot alongside the routing block", async () => {
      const dir = join(tempDir, "ctx-resume");
      const first = await setupV2For(dir);
      try {
        // Build a resume row in a prior session via compaction.
        const after = first.toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "prior",
          input: { file_path: "/a.ts" },
          status: "completed",
          result: { output: "content", metadata: {} },
        });
        const compaction = first.sessionHooks["compaction"][0];
        await compaction({ sessionID: "prior" });
      } finally {
        await first.cleanup();
      }

      // A fresh mouth over the same DB claims the resume on the context hook.
      const second = await setupV2For(dir);
      try {
        const context = second.sessionHooks["context"][0];
        const ev: any = { sessionID: "fresh", system: [{ type: "text", text: "HEADER" }] };
        await context(ev);
        const joined = ev.system.map((p: any) => p.text).join("\n");
        expect(joined).toContain("<context_window_protection>");
        expect(joined).toContain("session_resume");
      } finally {
        await second.cleanup();
      }
    });
  });

  // ── Compaction ownership ──────────────────────────────

  describe("compaction", () => {
    it("leaves the result unset when the TOC is empty", async () => {
      const { sessionHooks, cleanup } = await setupV2For(join(tempDir, "compact-empty"));
      try {
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-empty" };
        await compaction(ev);
        expect(ev.result).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("supplies the DB TOC as the summary when events exist", async () => {
      const { toolHooks, sessionHooks, cleanup } = await setupV2For(join(tempDir, "compact-snap"));
      try {
        const after = toolHooks["execute.after"][0];
        await after({
          tool: "Read",
          sessionID: "s-compact-snap",
          input: { file_path: "/src/index.ts" },
          status: "completed",
          result: { output: "export default {}", metadata: {} },
        });
        const compaction = sessionHooks["compaction"][0];
        const ev: any = { sessionID: "s-compact-snap" };
        await compaction(ev);
        expect(ev.result).toBeDefined();
        expect(ev.result.summary).toContain("session_resume");
        expect(ev.result.summary).toContain("index.ts");
        // The summary is the DB TOC only — the routing block (which lives in the
        // `context` hook, fired solely for primary requests) never pollutes it.
        expect(ev.result.summary).not.toContain("<context_window_protection>");
      } finally {
        await cleanup();
      }
    });
  });

  // ── Per-session directory resolution ──────────────────

  describe("per-session directory resolution", () => {
    it("resolves the session dir from session.get and caches it", async () => {
      const loadDir = join(tempDir, "dir-load");
      const sessionDir = join(tempDir, "dir-session");
      const { tools, sessionGetCalls, cleanup } = await setupV2For(loadDir, sessionDir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        // First call resolves (one session.get), second reuses the cache.
        await stats.execute({}, { sessionID: "s-dir" });
        const afterFirst = sessionGetCalls();
        await stats.execute({}, { sessionID: "s-dir" });
        const afterSecond = sessionGetCalls();

        expect(afterFirst).toBe(1);
        expect(afterSecond).toBe(1); // cached — no second resolution
      } finally {
        await cleanup();
      }
    });

    it("resolves each distinct session independently", async () => {
      const loadDir = join(tempDir, "dir-multi-load");
      const sessionDir = join(tempDir, "dir-multi-session");
      const { tools, sessionGetCalls, cleanup } = await setupV2For(loadDir, sessionDir);
      try {
        const stats = tools.find((t) => t.name === "stats")!;
        await stats.execute({}, { sessionID: "sA" });
        await stats.execute({}, { sessionID: "sB" });
        expect(sessionGetCalls()).toBe(2);
      } finally {
        await cleanup();
      }
    });
  });

  // ── Load-idempotency ────────────────────────────────

  describe("load-idempotent core", () => {
    it("getCore memoizes on platform::loadScopeDir", async () => {
      resetCoreCache();
      const dir = join(tempDir, "idem-memo");
      const a = await getCore({ platform: "opencode", loadScopeDir: dir });
      const b = await getCore({ platform: "opencode", loadScopeDir: dir });
      expect(a).toBe(b);
      await a.dispose();
    });

    it("setup and server over the same dir share one core instance", async () => {
      resetCoreCache();
      const dir = join(tempDir, "idem-mouths");
      // Prime the cache the way the first mouth would.
      const primed = await getCore({ platform: "opencode", loadScopeDir: dir });

      // v2 mouth.
      const mock = makeMockCtx(dir);
      const cleanup = await (pluginDefault.setup as any)(mock.ctx);

      // v1 mouth over the same directory.
      const v1 = await (pluginDefault.server as any)({
        directory: dir,
        client: { app: { log: async () => {} } },
      });
      expect(v1).toHaveProperty("tool.execute.before");

      // Both mouths reused the primed core — the cache was never replaced.
      const after = await getCore({ platform: "opencode", loadScopeDir: dir });
      expect(after).toBe(primed);

      await (cleanup as () => Promise<void>)();
    });
  });

  // ── Cleanup ─────────────────────────────────────────

  describe("cleanup", () => {
    it("disposes every registration and the shared core", async () => {
      resetCoreCache();
      const dir = join(tempDir, "cleanup");
      const { disposed, cleanup } = await setupV2For(dir);
      const core = await getCore({ platform: "opencode", loadScopeDir: dir });

      await cleanup();

      expect(disposed).toContain("tool.transform");
      expect(disposed).toContain("tool:execute.before");
      expect(disposed).toContain("tool:execute.after");
      expect(disposed).toContain("session:prompt");
      expect(disposed).toContain("session:context");
      expect(disposed).toContain("session:compaction");
      // Core removed from the cache on dispose.
      const after = await getCore({ platform: "opencode", loadScopeDir: dir });
      expect(after).not.toBe(core);
    });
  });
});
