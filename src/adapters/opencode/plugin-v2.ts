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
 *
 * `@opencode/plugin` is a TYPE-ONLY dependency: every import from it is an
 * `import type`, erased at compile time, so this module loads on a v2 host where
 * the package is absent from the runtime tree.
 */

import type { Plugin } from "@opencode/plugin";
import z from "zod/v4";

import { getCore, detectPlatform, type ContextModeCore } from "./core.js";
import { zod3ShapeToV4 } from "./zod3tov4.js";

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
 * v2 plugin setup. Registers the ctx tool set and all capture / routing /
 * compaction hooks against the shared core, and returns a cleanup that releases
 * every registration and the core's database handle.
 */
export async function setupV2(ctx: Plugin.Context): Promise<Plugin.Cleanup> {
  const platform = detectPlatform();
  const loadScopeDir = ctx.location?.directory ?? process.cwd();

  const core: ContextModeCore = await getCore({ platform, loadScopeDir });

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
          return { output: text, metadata: { title: t.title } };
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
  // Supplying `result` skips the model summarization call. An empty TOC leaves
  // the result unset so the host performs its normal compaction.
  const compactionReg = await ctx.session.hook("compaction", async (ev) => {
    const project = await resolveDir(ev.sessionID);
    const res = core.buildCompactionSnapshot(ev.sessionID, project);
    if (!res || !res.snapshot || res.snapshot.trim().length === 0) return;
    ev.result = { summary: res.snapshot };
  });
  disposers.push(() => compactionReg.dispose());

  // ── Cleanup: release registrations, then the shared core ────────────
  return async () => {
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
