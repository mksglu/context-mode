/**
 * OpenCode v2 (`setup`) mouth for context-mode.
 *
 * This is the v2 half of the dual-support adapter. It shares all host-agnostic
 * machinery with the v1 (`server`) mouth via the load-idempotent
 * {@link ContextModeCore} in ./core.js, and only adapts the v2 hook shapes.
 *
 * Wiring (v1 → v2):
 *   - tool.execute.before        → ctx.tool.hook("execute.before")   routing enforcement
 *   - tool.execute.after         → ctx.tool.hook("execute.after")    session capture
 *   - chat.message               → ctx.session.hook("prompt")        user-prompt capture
 *   - experimental.chat.system.transform
 *                              → ctx.session.hook("context")       routing block + resume
 *   - experimental.session.compacting
 *                              → ctx.session.hook("compaction")    DB TOC as summary
 *   - session.step.started/ended
 *                              → ctx.event.subscribe()             per-step usage capture
 *
 * In v2 native-tool mode there is no MCP stdio server, so this mouth also
 * publishes the MCP-readiness sentinel itself (see {@link startReadinessSentinel})
 * — otherwise the routing redirects would silently depend on some unrelated
 * context-mode MCP process being alive.
 *
 * `@opencode/plugin` is a TYPE-ONLY dependency: every import from it is an
 * `import type`, erased at compile time, so this module loads on a v2 host where
 * the package is absent from the runtime tree.
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Plugin } from "@opencode/plugin";
import z from "zod/v4";

import { getCore, detectPlatform, type ContextModeCore } from "./core.js";
import { zod3ShapeToV4 } from "./zod3tov4.js";
import { parseOpencodeV2StepUsage, buildAgentUsageEvent } from "../../session/extract.js";

/**
 * The three sandbox-execute tools borrow the host `bash` action so a blanket
 * `bash: { "*": "deny" }` hides them from the model. This is visibility only —
 * the host performs no per-call evaluation of plugin tools (see the permission
 * posture spec).
 */
const BASH_PERMISSION_TOOLS = new Set(["ctx_execute", "ctx_execute_file", "ctx_batch_execute"]);

/**
 * Destructive tools the v2 host cannot gate per call. Because a plugin tool cannot
 * raise a host permission request, context-mode owns their in-execute policy: they
 * are refused by default and only run when the user explicitly opts in. The
 * refusal is attributed to context-mode policy, never to a host permission denial.
 */
const DESTRUCTIVE_TOOLS = new Set(["ctx_purge", "ctx_upgrade"]);

/**
 * Context-mode-owned destructive-tool policy. Returns true when a destructive
 * tool may run. Opt-in via `CONTEXT_MODE_ALLOW_DESTRUCTIVE` (1/true/yes); unset
 * means refused. Non-destructive tools are always allowed.
 */
function destructivePolicyAllows(name: string): boolean {
  if (!DESTRUCTIVE_TOOLS.has(name)) return true;
  const flag = (process.env.CONTEXT_MODE_ALLOW_DESTRUCTIVE ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * v2 compaction posture, configurable via the plugin's `options.compaction`.
 *
 * - "own" (default): the DB table-of-contents becomes the compaction summary and
 *   the model summarization call is skipped — the strongest form, deterministic
 *   and model-cost-free.
 * - "passthrough": leave the result unset so the host model narrates its own
 *   summary. The COMPACTING session therefore sees the host's narrative, not the
 *   TOC. The TOC is still persisted (buildCompactionSnapshot upserts it) so a
 *   DIFFERENT resumed session claims it via the `context` hook — the same
 *   cross-session resume delivery own mode also provides. This is the escape hatch
 *   for a host or user who wants the model's narrative continuity back rather than
 *   a deterministic TOC-as-summary.
 *
 * This is deliberately NOT a v1 replica. v1 folded the TOC into the SAME
 * session's compaction summary (`output.context.push`); the v2 `SessionCompaction`
 * type exposes no such lever — only the `result` override that skips the model.
 * So passthrough cannot reproduce v1's same-session TOC-in-summary: it hands the
 * summary to the host and leaves the TOC for cross-session resume only. It is
 * named for that actual behavior, not "v1", to avoid promising a mechanism the
 * v2 API cannot provide.
 */
type CompactionMode = "own" | "passthrough";

/** Resolve `options.compaction` to a {@link CompactionMode}; unrecognized → "own". */
function resolveCompactionMode(raw: unknown): CompactionMode {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "passthrough" || v === "host" ? "passthrough" : "own";
}

/**
 * Strip the `ctx_` prefix so the effective name (`namespace` + `name`) stays
 * `ctx_*`, matching the v1 surface. Registering the bare name under the `ctx`
 * namespace yields `ctx_<bare>`; the bare `execute` name is reserved for CodeMode
 * only when un-namespaced, which we avoid by always setting the namespace.
 */
function bareName(fullName: string): string {
  return fullName.startsWith("ctx_") ? fullName.slice("ctx_".length) : fullName;
}

/** Extract the Zod v3 shape from a tool's inputSchema (mirrors the v1 mouth). */
function extractShape(inputSchema: unknown): Record<string, unknown> {
  const s = inputSchema as { shape?: unknown; _def?: { shape?: unknown } } | undefined;
  if (typeof s?.shape === "object" && s.shape !== null) return s.shape as Record<string, unknown>;
  if (typeof s?._def?.shape === "function") return (s._def.shape as () => Record<string, unknown>)();
  return {};
}

/**
 * Publish the MCP-readiness sentinel from this v2 plugin process.
 *
 * Routing enforcement (hooks/core/routing.mjs) gates redirects behind
 * `isMCPReady()`, which scans the sentinel directory for a live marker written by
 * the MCP stdio server. In v2 native-tool mode there is no MCP server, so without
 * this the routing redirects would silently depend on some unrelated context-mode
 * MCP process being alive. This mirrors the server's sentinel exactly: this
 * process's PID, refreshed every 30s (the reader's freshness window is 90s), and
 * removed on dispose. It reuses `sentinelPathForPid` so the sentinel directory +
 * prefix — and the `CONTEXT_MODE_MCP_SENTINEL_DIR` test override — stay consistent
 * with the reader.
 *
 * Returns a disposer that stops the refresh timer and removes the sentinel.
 */
async function startReadinessSentinel(): Promise<() => void> {
  const buildDir = dirname(fileURLToPath(import.meta.url));
  const mcpReadyPath = resolve(buildDir, "..", "..", "..", "hooks", "core", "mcp-ready.mjs");
  const { sentinelPathForPid } = (await import(pathToFileURL(mcpReadyPath).href)) as {
    sentinelPathForPid: (pid: number) => string;
  };
  const sentinel = sentinelPathForPid(process.pid);
  const write = () => {
    try {
      writeFileSync(sentinel, String(process.pid));
    } catch {
      /* best effort — never break the plugin */
    }
  };
  write();
  const refresh = setInterval(write, 30_000);
  refresh.unref();
  return () => {
    clearInterval(refresh);
    try {
      unlinkSync(sentinel);
    } catch {
      /* best effort */
    }
  };
}

/**
 * Capture per-step token + cost usage from the v2 event bus.
 *
 * v2 has no generic `event` hook like v1's `message.updated`. Instead the
 * `ctx.event` domain exposes an async-iterable of every bus event, which we
 * consume in a background loop and correlate the two durable events that bracket a
 * single model call:
 *   - `session.step.started` carries the model (`{ id, providerID }`) keyed by
 *     `assistantMessageID`;
 *   - `session.step.ended` carries that step's `cost` + `tokens` buckets.
 *
 * Each step.ended becomes one `agent_usage` row written through the core (the
 * same DB path v1 uses, tagged with a `StepEnded` source). Reasoning tokens are
 * folded into output by the v2 parse. The loop is torn down via AbortController on
 * plugin cleanup, and every error is swallowed so usage capture can never break a
 * session.
 *
 * Returns a disposer that aborts the subscription.
 */
function startUsageCapture(
  core: ContextModeCore,
  ctx: Plugin.Context,
  resolveDir: (sessionID: string) => Promise<string>,
): () => void {
  const controller = new AbortController();
  // Model observed on step.started, keyed by assistantMessageID, so the matching
  // step.ended (which omits the model) can be attributed.
  const modelByMessage = new Map<string, string>();

  void (async () => {
    try {
      for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
        const data = (ev as { data?: Record<string, unknown> })?.data;
        if (!data) continue;

        if (ev.type === "session.step.started") {
          const msgId = data.assistantMessageID;
          const model = data.model as { id?: unknown; providerID?: unknown } | undefined;
          if (typeof msgId === "string" && model) {
            const id = typeof model.id === "string" ? model.id : "";
            const providerID = typeof model.providerID === "string" ? model.providerID : "";
            modelByMessage.set(msgId, providerID && id ? `${providerID}/${id}` : id || providerID);
          }
          continue;
        }

        if (ev.type === "session.step.ended") {
          const sessionId = data.sessionID;
          if (typeof sessionId !== "string" || !sessionId) continue;
          const msgId = typeof data.assistantMessageID === "string" ? data.assistantMessageID : "";
          const counts = parseOpencodeV2StepUsage(data, modelByMessage.get(msgId) ?? "");
          if (!counts) continue;
          const usageEvent = buildAgentUsageEvent(counts);
          if (!usageEvent) continue;
          const project = await resolveDir(sessionId);
          core.recordUsage(sessionId, project, usageEvent, "StepEnded");
          // Release the correlation entry once consumed (bounded memory).
          if (msgId) modelByMessage.delete(msgId);
        }
      }
    } catch {
      /* stream closed / aborted — usage capture must never break the session */
    }
  })();

  return () => controller.abort();
}

/**
 * v2 plugin setup. Registers the ctx tool set and all capture / routing /
 * compaction hooks against the shared core, and returns a cleanup that releases
 * every registration and the core's database handle.
 */
export async function setupV2(ctx: Plugin.Context): Promise<Plugin.Cleanup> {
  const platform = detectPlatform();
  const loadScopeDir = ctx.location?.directory ?? process.cwd();

  const core: ContextModeCore = await getCore({ platform, loadScopeDir });

  // Compaction posture from the v2 plugin's `options.compaction`: "own" (default)
  // makes the TOC the summary and skips the model; "passthrough" lets the host
  // model narrate. See {@link CompactionMode}.
  const compactionMode = resolveCompactionMode(ctx.options?.compaction);

  // Per-session workspace directory: resolved from the calling session's own
  // location (not just the plugin-load-scope dir) and cached so repeated calls
  // for one session reuse the resolution. Falls back to the load-scope dir.
  const dirCache = new Map<string, string>();
  async function resolveDir(sessionID: string): Promise<string> {
    const hit = dirCache.get(sessionID);
    if (hit) return hit;
    try {
      const info = await ctx.session.get({ sessionID });
      const dir = info?.location?.directory;
      if (dir) {
        dirCache.set(sessionID, dir);
        return dir;
      }
    } catch {
      /* fall back to the plugin-load-scope directory */
    }
    return loadScopeDir;
  }

  const disposers: Array<() => Promise<void>> = [];

  // ── 1. Register the ctx tool set under the `ctx` namespace ──────────
  const toolReg = await ctx.tool.transform((ed) => {
    for (const t of core.getTools()) {
      ed.add({
        name: bareName(t.name),
        description: t.description,
        input: z.object(zod3ShapeToV4(extractShape(t.inputSchema))),
        execute: async (input, toolCtx) => {
          if (!destructivePolicyAllows(t.name)) {
            // Context-mode-owned refusal — the v2 host cannot gate plugin tools
            // per call, so this decision is ours. Surfaced as a failed tool call
            // attributed to context-mode policy, not a host permission denial.
            throw new Error(
              `ctx tool "${t.name}" is disabled by context-mode policy. This is a ` +
                `context-mode decision, not a host permission denial: the v2 host does ` +
                `not gate plugin tools per call, so context-mode refuses destructive ` +
                `tools by default. Set CONTEXT_MODE_ALLOW_DESTRUCTIVE=1 to enable.`,
            );
          }
          const project = await resolveDir(toolCtx.sessionID);
          // t.run re-parses with the authoritative v3 schema and throws on a
          // schema failure or an isError handler result; the rejection surfaces to
          // the model as a failed tool call without crashing the session.
          const text = await t.run(input, project, toolCtx.sessionID);
          // v2 result contract: this tool declares no `output` schema, so the
          // result must carry the text in `content` (a string). Returning an
          // `output` key here would trip the host's
          // "Tool result declared output without an output schema" guard.
          return { content: text, metadata: { title: t.title } };
        },
        options: {
          namespace: "ctx",
          codemode: false,
          ...(BASH_PERMISSION_TOOLS.has(t.name) ? { permission: "bash" } : {}),
        },
      });
    }
  });
  disposers.push(() => toolReg.dispose());

  // ── Readiness sentinel — the routing island checks it in-process ──────
  // v2 native-tool mode has no MCP stdio server, so this process publishes its
  // own readiness marker; otherwise routing redirects would only fire when some
  // other context-mode MCP process happens to be alive.
  const stopReadinessSentinel = await startReadinessSentinel();

  // ── Usage capture — per-step tokens + cost from the v2 event bus ──────
  const stopUsageCapture = startUsageCapture(core, ctx, resolveDir);

  // ── 2. Routing enforcement before each tool execution ───────────────
  const beforeReg = await ctx.tool.hook("execute.before", async (ev) => {
    const project = await resolveDir(ev.sessionID);
    const decision = core.routePreToolUse(
      ev.tool,
      (ev.input as Record<string, unknown>) ?? {},
      project,
    );
    if (!decision) return; // no routing match → passthrough

    if (decision.action === "deny" || decision.action === "ask") {
      // Throwing blocks the call; the reason surfaces to the model.
      throw new Error(decision.reason ?? "Blocked by context-mode");
    }
    if (decision.action === "modify" && decision.updatedInput) {
      ev.input = { ...((ev.input as Record<string, unknown>) ?? {}), ...decision.updatedInput };
    }
    if (decision.action === "context" && decision.additionalContext) {
      ev.input = {
        ...((ev.input as Record<string, unknown>) ?? {}),
        additionalContext: decision.additionalContext,
      };
    }
  });
  disposers.push(() => beforeReg.dispose());

  // ── 3. Session capture after each successful tool execution ─────────
  // Only the completed path fires for promise-plugin tools (a thrown tool never
  // reaches execute.after), matching v1 where errored tools are not captured.
  const afterReg = await ctx.tool.hook("execute.after", async (ev) => {
    if (ev.status !== "completed") return;
    const project = await resolveDir(ev.sessionID);
    core.captureToolEvent(
      ev.sessionID,
      project,
      ev.tool,
      (ev.input as Record<string, unknown>) ?? {},
      ev.result?.output,
    );
  });
  disposers.push(() => afterReg.dispose());

  // ── 4. User-prompt capture ──────────────────────────────────────────
  const promptReg = await ctx.session.hook("prompt", async (ev) => {
    const text = ev.prompt?.text;
    if (!text) return;
    const project = await resolveDir(ev.sessionID);
    core.captureUserPrompt(ev.sessionID, project, text);
  });
  disposers.push(() => promptReg.dispose());

  // ── 5. Routing block + resume pointer — primary requests only ───────
  // The `context` hook fires only for kind="primary", so this never runs during
  // compaction and cannot pollute the compaction summary.
  const contextReg = await ctx.session.hook("context", async (ev) => {
    const sysTexts = ev.system.map((p) => p.text);
    if (!core.systemHasRoutingInstructions(sysTexts)) {
      ev.system.push({ type: "text", text: core.routingBlock });
    }
    const row = core.claimResume(ev.sessionID);
    if (row) {
      ev.system.push({ type: "text", text: row.snapshot });
    }
  });
  disposers.push(() => contextReg.dispose());

  // ── 6. Compaction — DB table-of-contents as the summary ─────────────
  // "own" (default): supplying `result` skips the model summarization call.
  // "passthrough": `result` is left unset so the host model narrates; the TOC
  // still reaches the model via the resume path (buildCompactionSnapshot upserts
  // it, the `context` hook claims it next turn). An empty TOC leaves the result
  // unset in either mode so the host performs its normal compaction.
  const compactionReg = await ctx.session.hook("compaction", async (ev) => {
    const project = await resolveDir(ev.sessionID);
    const res = core.buildCompactionSnapshot(ev.sessionID, project);
    if (!res || !res.snapshot || res.snapshot.trim().length === 0) return;
    if (compactionMode === "own") {
      ev.result = { summary: res.snapshot };
    }
  });
  disposers.push(() => compactionReg.dispose());

  // ── Cleanup: release registrations, then the shared core ────────────
  return async () => {
    try {
      stopUsageCapture();
    } catch {
      /* best-effort teardown */
    }
    try {
      stopReadinessSentinel();
    } catch {
      /* best-effort teardown */
    }
    for (const dispose of disposers) {
      try {
        await dispose();
      } catch {
        /* best-effort teardown */
      }
    }
    core.dispose();
  };
}
