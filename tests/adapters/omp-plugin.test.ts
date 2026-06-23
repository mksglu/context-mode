import "../setup-home";
/**
 * OMP plugin tests — TDD slices around the four hooks the plugin owns.
 *
 * The OMP plugin (src/adapters/omp/plugin.ts) is a default-exported
 * factory `(pi: HookAPI) => void`. Hook contract verified against
 * refs/platforms/oh-my-pi/packages/coding-agent/src/extensibility/
 * hooks/types.ts:695 (HookAPI) and types.ts:809 (HookFactory).
 *
 * Slices:
 *   1. tool_call — pre-tool-call routing enforcement (block curl/wget)
 *   2. tool_result — post-tool-call event extraction into SessionDB
 *   3. session_start — session row created, cleanup runs
 *   4. session_before_compact — resume snapshot persisted
 *
 * We mock the OMP HookAPI shape: `on(event, handler)` collects
 * handlers, `_trigger(event, ...args)` invokes them and returns the
 * first truthy result (matching how OMP forwards `{block, reason}` to
 * the runtime).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionDB } from "../../src/session/db.js";

// ── Mock OMP HookAPI ────────────────────────────────────────

type HandlerFn = (...args: unknown[]) => unknown | Promise<unknown>;

function createMockOmpApi() {
  const handlers: Record<string, HandlerFn[]> = {};

  return {
    on: (event: string, handler: HandlerFn) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    _trigger: async (event: string, ...args: unknown[]) => {
      for (const h of handlers[event] ?? []) {
        const result = await h(...args);
        if (result) return result;
      }
      return undefined;
    },
    _handlers: handlers,
  };
}

// ── Setup / teardown ────────────────────────────────────────

let tempDir: string;
let api: ReturnType<typeof createMockOmpApi>;

async function registerOmpPlugin(
  mockApi: ReturnType<typeof createMockOmpApi>,
  opts?: { projectDir?: string },
) {
  const projectDir = opts?.projectDir ?? tempDir;
  // OMP_PROJECT_DIR is read by some legacy tests but the production
  // plugin (src/adapters/omp/plugin.ts) actually resolves through
  // PI_PROJECT_DIR — upstream Oh-My-Pi only sets PI_-prefixed env
  // vars. Set BOTH so tests stay forward-compatible if the resolution
  // contract ever broadens.
  process.env.OMP_PROJECT_DIR = projectDir;
  process.env.PI_PROJECT_DIR = projectDir;
  // Reset module-level singletons so each test sees a fresh DB
  const mod = await import("../../src/adapters/omp/plugin.js");
  mod._resetOmpPluginStateForTests();
  const register = mod.default;
  register(mockApi as unknown as Parameters<typeof register>[0]);
  return mockApi;
}

describe("OMP plugin", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omp-plugin-test-"));
    api = createMockOmpApi();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    delete process.env.OMP_PROJECT_DIR;
    delete process.env.PI_PROJECT_DIR;
  });

  // ═══════════════════════════════════════════════════════════
  // Slice 1: tool_call routing enforcement
  // ═══════════════════════════════════════════════════════════

  describe("Slice 1: tool_call routing", () => {
    it("registers a tool_call handler", async () => {
      await registerOmpPlugin(api);
      expect(api._handlers.tool_call).toBeDefined();
      expect(api._handlers.tool_call.length).toBe(1);
    });

    it("blocks bash with curl and surfaces a reason", async () => {
      await registerOmpPlugin(api);
      const result = (await api._trigger("tool_call", {
        toolName: "bash",
        input: { command: "curl https://example.com/api" },
      })) as { block?: boolean; reason?: string } | undefined;

      expect(result?.block).toBe(true);
      expect(result?.reason).toMatch(/context-mode/);
    });

    it("blocks bash with wget", async () => {
      await registerOmpPlugin(api);
      const result = (await api._trigger("tool_call", {
        toolName: "bash",
        input: { command: "wget https://example.com/file" },
      })) as { block?: boolean } | undefined;
      expect(result?.block).toBe(true);
    });

    it("blocks bash with inline node fetch", async () => {
      await registerOmpPlugin(api);
      const result = (await api._trigger("tool_call", {
        toolName: "bash",
        input: { command: "node -e \"fetch('https://api')\"" },
      })) as { block?: boolean } | undefined;
      expect(result?.block).toBe(true);
    });

    it("blocks bash with python requests.get", async () => {
      await registerOmpPlugin(api);
      const result = (await api._trigger("tool_call", {
        toolName: "bash",
        input: { command: "python -c \"requests.get('https://api')\"" },
      })) as { block?: boolean } | undefined;
      expect(result?.block).toBe(true);
    });

    it("blocks PowerShell Invoke-WebRequest", async () => {
      await registerOmpPlugin(api);
      const result = (await api._trigger("tool_call", {
        toolName: "bash",
        input: { command: "Invoke-WebRequest https://api" },
      })) as { block?: boolean } | undefined;
      expect(result?.block).toBe(true);
    });

    it("does NOT block safe bash (git status)", async () => {
      await registerOmpPlugin(api);
      const result = await api._trigger("tool_call", {
        toolName: "bash",
        input: { command: "git status" },
      });
      expect(result).toBeUndefined();
    });

    it("does NOT block non-bash tools", async () => {
      await registerOmpPlugin(api);
      const result = await api._trigger("tool_call", {
        toolName: "edit",
        input: { file_path: "x.ts" },
      });
      expect(result).toBeUndefined();
    });

    it("tolerates malformed event payloads (no throw)", async () => {
      await registerOmpPlugin(api);
      // Missing input, missing toolName — must not throw, must passthrough
      await expect(api._trigger("tool_call", {})).resolves.toBeUndefined();
      await expect(api._trigger("tool_call", { toolName: "bash" })).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Slice 2: tool_result event extraction
  // ═══════════════════════════════════════════════════════════

  describe("Slice 2: tool_result extraction", () => {
    it("registers a tool_result handler", async () => {
      await registerOmpPlugin(api);
      expect(api._handlers.tool_result).toBeDefined();
    });

    it("persists a Read event into the session DB", async () => {
      await registerOmpPlugin(api);
      // Establish a session first so _sessionId is set
      await api._trigger("session_start", { type: "session_start" }, {});

      await api._trigger("tool_result", {
        toolName: "read",
        input: { file_path: "/tmp/x.ts" },
        content: [{ type: "text", text: "export const x = 1;" }],
      });

      // Verify event landed in DB at the canonical OMP storage path.
      // Issue #645 — production plugin resolves through
      // `resolveSessionDbPath`, the same helper the MCP server uses.
      const { OMPAdapter } = await import("../../src/adapters/omp/index.js");
      const adapter = new OMPAdapter();
      const { resolveSessionDbPath } = await import("../../src/session/db.js");
      const db = new SessionDB({
        dbPath: resolveSessionDbPath({
          projectDir: tempDir,
          sessionsDir: adapter.getSessionDir(),
        }),
      });
      const latest = db.getLatestSessionId();
      expect(latest).not.toBeNull();
      const events = db.getEvents(latest as string);
      expect(events.length).toBeGreaterThan(0);
      // file_read category should appear for a Read tool
      expect(events.some((e) => e.category === "file")).toBe(true);
    });

    it("does nothing when no session has started", async () => {
      await registerOmpPlugin(api);
      // Trigger tool_result WITHOUT session_start first
      await expect(
        api._trigger("tool_result", {
          toolName: "read",
          input: { file_path: "/tmp/x.ts" },
          content: [{ type: "text", text: "x" }],
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Slice 3: session_start lifecycle
  // ═══════════════════════════════════════════════════════════

  describe("Slice 3: session_start", () => {
    it("registers a session_start handler", async () => {
      await registerOmpPlugin(api);
      expect(api._handlers.session_start).toBeDefined();
    });

    it("creates a session row in the DB", async () => {
      await registerOmpPlugin(api);
      await api._trigger("session_start", { type: "session_start" }, {});

      // Issue #645 — read from the canonical per-project path the
      // production plugin (and the MCP server) uses.
      const { OMPAdapter } = await import("../../src/adapters/omp/index.js");
      const adapter = new OMPAdapter();
      const { resolveSessionDbPath } = await import("../../src/session/db.js");
      const db = new SessionDB({
        dbPath: resolveSessionDbPath({
          projectDir: tempDir,
          sessionsDir: adapter.getSessionDir(),
        }),
      });
      const latest = db.getLatestSessionId();
      expect(latest).not.toBeNull();
    });

    it("derives a stable session ID from sessionManager.getSessionFile when present", async () => {
      await registerOmpPlugin(api);
      await api._trigger("session_start", { type: "session_start" }, {
        sessionManager: { getSessionFile: () => "/path/to/session-abc.json" },
      });

      const mod = await import("../../src/adapters/omp/plugin.js");
      const sid = mod._getOmpPluginSessionIdForTests();
      // 16-hex SHA-256 prefix per deriveSessionId contract
      expect(sid).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Slice 4: session_before_compact resume snapshot
  // ═══════════════════════════════════════════════════════════

  describe("Slice 4: session_before_compact", () => {
    it("registers a session_before_compact handler", async () => {
      await registerOmpPlugin(api);
      expect(api._handlers.session_before_compact).toBeDefined();
    });

    it("persists a resume snapshot and increments compact_count", async () => {
      const mod = await registerOmpPlugin(api);
      await api._trigger("session_start", { type: "session_start" }, {});
      // Generate at least one event so the snapshot is non-empty
      await api._trigger("tool_result", {
        toolName: "read",
        input: { file_path: "/tmp/x.ts" },
        content: [{ type: "text", text: "x" }],
      });

      await api._trigger("session_before_compact", { type: "session_before_compact" }, {});

      // Read the session ID picked up by THIS test rather than the
      // shared-DB latest, which can collide at second-precision with
      // sibling test sessions.
      const pluginMod = await import("../../src/adapters/omp/plugin.js");
      const sid = pluginMod._getOmpPluginSessionIdForTests();
      expect(sid).not.toBe("");

      // Issue #645 — production plugin writes to the canonical
      // per-project path, not the shared "context-mode.db" literal.
      const { OMPAdapter } = await import("../../src/adapters/omp/index.js");
      const adapter = new OMPAdapter();
      const { resolveSessionDbPath } = await import("../../src/session/db.js");
      const db = new SessionDB({
        dbPath: resolveSessionDbPath({
          projectDir: tempDir,
          sessionsDir: adapter.getSessionDir(),
        }),
      });
      const resume = db.getResume(sid);
      expect(resume).not.toBeNull();
      expect(resume?.snapshot.length).toBeGreaterThan(0);

      const stats = db.getSessionStats(sid);
      expect(stats?.compact_count).toBe(1);
      void mod;
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Issue #645 — OMP plugin SessionDB path must match the MCP
  // server's canonical resolver (`resolveSessionDbPath`). The
  // shared `context-mode.db` literal diverges from the
  // `<hash>.db` the server reads, silently breaking ctx_stats
  // and ctx_search(sort: "timeline") for every OMP user.
  // ═══════════════════════════════════════════════════════════

  describe("Issue #645: SessionDB path matches MCP server's canonical resolver", () => {
    it("writes SessionDB to resolveSessionDbPath({projectDir, sessionsDir}), not the shared 'context-mode.db' literal", async () => {
      // The OMP plugin resolves projectDir from PI_PROJECT_DIR (or
      // cwd()) — see src/adapters/omp/plugin.ts. Set it explicitly
      // so the canonical hash we compute below matches the hash the
      // plugin uses when it opens its SessionDB.
      const priorPi = process.env.PI_PROJECT_DIR;
      process.env.PI_PROJECT_DIR = tempDir;
      try {
        await registerOmpPlugin(api);
        await api._trigger("session_start", { type: "session_start" }, {});

        const { OMPAdapter } = await import("../../src/adapters/omp/index.js");
        const adapter = new OMPAdapter();
        const sessionsDir = adapter.getSessionDir();

        // Mirror the production resolver the MCP server uses
        // (server.ts ctx_stats / ctx_search timeline). The plugin's
        // write target MUST be this exact file or both MCP tools
        // silently degrade.
        const { resolveSessionDbPath } = await import("../../src/session/db.js");
        const canonicalPath = resolveSessionDbPath({
          projectDir: tempDir,
          sessionsDir,
        });

        const { existsSync: fileExists } = await import("node:fs");
        expect(fileExists(canonicalPath)).toBe(true);

        // Verify the canonical file is the one with our session_start row.
        const db = new SessionDB({ dbPath: canonicalPath });
        try {
          const latest = db.getLatestSessionId();
          expect(latest).not.toBeNull();
        } finally {
          try { db.close(); } catch { /* best effort */ }
        }

        // The shared literal must NOT be created — that was the bug.
        const buggyLiteralPath = join(sessionsDir, "context-mode.db");
        if (canonicalPath !== buggyLiteralPath) {
          expect(fileExists(buggyLiteralPath)).toBe(false);
        }
      } finally {
        if (priorPi === undefined) {
          delete process.env.PI_PROJECT_DIR;
        } else {
          process.env.PI_PROJECT_DIR = priorPi;
        }
      }
    });
  });

  // ── Issue #677: package.json `omp` manifest key contract ──────────
  //
  // OMP's plugin runtime exposes TWO manifest-key resolvers (verified
  // against oh-my-pi `packages/coding-agent/src/extensibility/plugins/
  // loader.ts:179-189`):
  //
  //   resolvePluginHookPaths(plugin)        ← reads `omp.hooks`
  //   resolvePluginExtensionPaths(plugin)   ← reads `omp.extensions`
  //
  // Only the `extensions` resolver is wired into the runtime
  // (`extensions/loader.ts` imports `getAllPluginExtensionPaths` and
  // executes the returned modules). The `hooks` resolver is defined and
  // exported but never imported by any runtime consumer — a grep of the
  // oh-my-pi tree confirms `resolvePluginHookPaths` / `getAllPlugin
  // HookPaths` have ONE import site each, both inside `plugins/loader.ts`
  // itself.
  //
  // Result: `omp.hooks` is a dead manifest key. Plugins that declare
  // their entry under `hooks` install cleanly via `omp plugin install`
  // but their handlers never register — every event silently no-ops.
  // Issue #677 surfaced this in production: `tool_call`,
  // `session_start`, `session_before_compact` all dropped after
  // `omp plugin install context-mode`. The fix is mechanical — switch
  // `omp.hooks` → `omp.extensions` in our package.json — but the dead
  // key would silently come back any time someone copy-edits the
  // manifest from an older example. This test pins the contract.
  describe("package.json omp manifest (issue #677)", () => {
    it("declares omp.extensions, NOT omp.hooks (dead key in OMP loader)", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const repoRoot = resolve(__dirname, "..", "..");
      const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8")) as {
        omp?: { hooks?: unknown; extensions?: unknown };
      };
      expect(pkg.omp, "package.json must declare an `omp` field").toBeDefined();
      expect(
        pkg.omp!.hooks,
        "package.json `omp.hooks` is a dead OMP loader key — use `omp.extensions` instead (see oh-my-pi plugins/loader.ts:179-189)",
      ).toBeUndefined();
      expect(
        pkg.omp!.extensions,
        "package.json `omp.extensions` must be set so OMP's runtime extension loader picks up the plugin",
      ).toBeDefined();
    });

    it("omp.extensions is an array of resolvable plugin-relative paths", async () => {
      const { readFileSync, existsSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const repoRoot = resolve(__dirname, "..", "..");
      const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8")) as {
        omp?: { extensions?: unknown };
      };
      // OMP's resolvePluginPaths accepts BOTH string and array
      // (Array.isArray(base) ? base : [base]) but pi.extensions is an
      // array — keep the same shape for consistency + reviewer clarity.
      expect(Array.isArray(pkg.omp?.extensions)).toBe(true);
      const paths = pkg.omp?.extensions as string[];
      expect(paths.length).toBeGreaterThan(0);
      for (const relPath of paths) {
        expect(relPath, "extension path must be plugin-relative").toMatch(/^\.\//);
        expect(
          existsSync(resolve(repoRoot, relPath)),
          `extension file ${relPath} must exist (run npm run build first)`,
        ).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Slice 5: MCP self-registration (issue #677)
  // ═══════════════════════════════════════════════════════════
  // The `omp plugin install` path wires the extension factory (routing
  // hooks fire) but never creates mcp.json, so the `ctx_*` tools stay
  // unreachable. The plugin must self-register the MCP server on load.

  describe("Slice 5: MCP self-registration (issue #677)", () => {
    it("registers the context-mode MCP server in mcp.json when absent", async () => {
      const { OMPAdapter } = await import("../../src/adapters/omp/index.js");
      const { rmSync } = await import("node:fs");
      const adapter = new OMPAdapter();
      // Clean slate — drop any mcp.json a prior test in this suite wrote.
      try {
        rmSync(adapter.getSettingsPath(), { force: true });
      } catch {
        /* best effort */
      }

      await registerOmpPlugin(api);

      const settings = adapter.readSettings();
      const server = (settings?.mcpServers as Record<string, unknown> | undefined)?.[
        "context-mode"
      ] as { command?: string; args?: unknown[] } | undefined;

      expect(
        server,
        "context-mode must be registered in mcp.json after plugin load",
      ).toBeDefined();
      // Plugin install puts the package in ~/.omp/plugins/node_modules where
      // the `context-mode` bin is NOT on PATH — must spawn via node + bundle.
      expect(server?.command).toBe("node");
      expect(Array.isArray(server?.args)).toBe(true);
      expect(String(server?.args?.[0])).toMatch(/server\.bundle\.mjs$/);
    });

    it("does NOT clobber an existing context-mode mcp.json entry", async () => {
      const { OMPAdapter } = await import("../../src/adapters/omp/index.js");
      const adapter = new OMPAdapter();
      // User-supplied entry (e.g. the commenter's own working config) that
      // must survive plugin load untouched.
      adapter.writeSettings({
        mcpServers: {
          "context-mode": { command: "context-mode", args: ["--user-custom"] },
        },
      });

      await registerOmpPlugin(api);

      const settings = adapter.readSettings();
      const server = (settings?.mcpServers as Record<string, unknown>)["context-mode"] as {
        command?: string;
        args?: unknown[];
      };
      expect(server.command).toBe("context-mode");
      expect(server.args).toEqual(["--user-custom"]);
    });
  });
});
