// impl/12 §4 (OpenCode 2 plugin), impl/10 §11; DEVIATIONS D-M5-arch-2, D-M5-A1-1, D-M5-P2-1..4.
// In-process: no spawn, no MCP hop (impl/12 §1). Every hook builds the raw call-site object the
// opencode adapter decodes (D-M5-A1-1) and calls handleHook; this file never opens context.db.
import { INTERNAL_ERROR_LINE, PLUGIN_ID } from "../core/contracts/constants.ts";
import { CtxError } from "../core/contracts/errors.ts";
import type { HookOutput, ProjectContext, ToolContext, ToolReply } from "../core/contracts/types.ts";
import { handleHook } from "../core/hooks/dispatch.ts";
import { ownJournal } from "../core/journal/own-call.ts";
import { resolveProject } from "../core/project/resolve.ts";
import { TOOLS, checkCall, type RegisteredTool } from "../core/tools/registry.ts";
import { INSTRUCTIONS } from "../prompt/_generated.ts";
import { z } from "zod/v4";

const AGENT = "opencode";

/** OpenCode's `app` handle at plugin load: `directory` is the spawn cwd (impl/12 §4.3 step 1). */
export interface OpenCodeApp {
  directory?: string;
  tool(name: string, def: OpenCodeToolDef): void;
}

/** One ctx_* tool as OpenCode registers it (#1171). */
export interface OpenCodeToolDef {
  description: string;
  args: RegisteredTool<unknown>["schema"];
  execute(args: unknown, toolCtx: { sessionID?: string; abort?: AbortSignal }): Promise<string>;
}

interface ToolInput { tool?: string; sessionID?: string; callID?: string; args?: unknown }
interface TextPart { type?: string; text?: string }
interface BusEvent { type?: string; properties?: { part?: { type?: string; sessionID?: string } } }

/** impl/12 §4.1: OpenCode 2.x plugin API `{id, setup}`; id reuses SERVER_KEY (A28). */
export const id = PLUGIN_ID;

/** impl/12 §4.3, the OpenCode 1.19 / KiloCode shape: registers the ctx_* tools through `app.tool` and returns the
 *  hook object, closed over `cwd`. OpenCode 2 does not call this; it calls `setup(ctx)` below (D-OC2-SETUP-1). */
export async function setupLegacy(app: OpenCodeApp) {
  const cwd = app.directory; // §4.2 step 2: read once per plugin load
  const env = process.env;
  const turns = new Map<string, number>(); // sessionID -> turn, counted by chat.message
  const payloads = new Map<string, Promise<string>>(); // sessionID -> fixed system payload (§4.6 step 4)

  const call = (raw: Record<string, unknown>): Promise<HookOutput> =>
    handleHook(AGENT, { ...raw, directory: cwd }, env);
  const turnOf = (sessionId: string): number => turns.get(sessionId) ?? 0;

  // §4.4 step 2, §4.6: the first hook seen for a session computes the one system payload (the
  // SessionStart lines handleHook returns, then INSTRUCTIONS). It is never recomputed (Q12).
  function payloadFor(sessionId: string): Promise<string> {
    let p = payloads.get(sessionId);
    if (p === undefined) {
      p = call({ type: "context", sessionID: sessionId, turn: turnOf(sessionId) })
        .then((out) => [out.stdout, INSTRUCTIONS].filter((s) => s !== "").join("\n\n"));
      payloads.set(sessionId, p);
    }
    return p;
  }

  const journal = ownJournal(); // D-HF-INPROC-JOURNAL-1

  function project(): ProjectContext {
    return resolveProject(AGENT, { env, argv: process.argv, cwd: cwd ?? "" });
  }

  // #1171: every ctx_* tool registers through the host's tool API; the handler is the same TOOLS
  // entry the MCP server calls (impl/12 §1).
  for (const tool of TOOLS) {
    app.tool(tool.name, {
      description: tool.description,
      args: tool.schema,
      async execute(args, toolCtx) {
        const checked = checkCall(tool, args);
        if (!checked.ok) return checked.line;
        const sessionId = toolCtx.sessionID ?? "";
        let resolved: ProjectContext | undefined;
        const ctx: ToolContext = {
          get project(): ProjectContext {
            resolved ??= project();
            return resolved;
          },
          sessionId,
          turn: turnOf(sessionId),
          signal: toolCtx.abort ?? new AbortController().signal,
          protocolVersion: "",
        };
        let reply: ToolReply;
        try {
          reply = await tool.handler(checked.data, ctx);
        } catch (err) {
          return err instanceof CtxError ? err.toLine() : INTERNAL_ERROR_LINE;
        }
        // D-HF-INPROC-JOURNAL-1: the row the MCP server writes; an unresolved project has no DB, so no row.
        if (resolved !== undefined) await journal(resolved, ctx, tool.name, reply);
        return reply.text;
      },
    });
  }

  return {
    // UserPromptSubmit; also the turn counter step-finish and tool calls read (D-M5-P2-2).
    "chat.message": async (input: { sessionID?: string }, output: { parts?: TextPart[] }) => {
      const sessionId = input.sessionID ?? "";
      turns.set(sessionId, turnOf(sessionId) + 1);
      const message = (output.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
      await call({ type: "prompt", sessionID: sessionId, message, turn: turnOf(sessionId) });
    },

    // §4.4. Deny (exit 2) throws with the reason; the reason carries any rewritten command (Q3, D-M5-P2-3).
    "tool.execute.before": async (input: ToolInput, output: { args?: unknown }) => {
      const sessionId = input.sessionID ?? "";
      await payloadFor(sessionId);
      const out = await call({
        type: "execute.before", sessionID: sessionId, tool: input.tool, callID: input.callID, args: output.args,
        turn: turnOf(sessionId),
      });
      if (out.exitCode === 2) throw new Error(out.stdout);
    },

    // §4.5. OpenCode's encode has no replace field (impl/10 §11), so output.output is never changed here.
    "tool.execute.after": async (input: ToolInput, output: { output?: unknown; isError?: boolean }) => {
      const sessionId = input.sessionID ?? "";
      await payloadFor(sessionId);
      await call({
        type: "execute.after", sessionID: sessionId, tool: input.tool, callID: input.callID, args: input.args,
        output: output.output, isError: output.isError, turn: turnOf(sessionId),
      });
    },

    // §4.6: one system entry per session, the same bytes on every request (#1085, Q12). A second
    // transform on the same array finds the entry and adds nothing.
    "experimental.chat.system.transform": async (input: { sessionID?: string }, output: { system: string[] }) => {
      const payload = await payloadFor(input.sessionID ?? "");
      if (!output.system.includes(payload)) output.system.push(payload);
    },

    // PreCompact: handleHook sets the pending-compact marker the next session payload reads (§4.6 step 2).
    "experimental.session.compacting": async (input: { sessionID?: string }) => {
      const sessionId = input.sessionID ?? "";
      await call({ type: "compaction", sessionID: sessionId, turn: turnOf(sessionId) });
    },

    // step-finish is the Usage event (D-M5-arch-2): one cost row per (session, turn), deduped by the store.
    event: async ({ event }: { event: BusEvent }) => {
      const part = event.properties?.part;
      if (event.type !== "message.part.updated" || part?.type !== "step-finish") return;
      const sessionId = part.sessionID ?? "";
      await call({ type: "step-finish", sessionID: sessionId, turn: turnOf(sessionId) });
    },
  };
}

// ---- OpenCode 2 (D-OC2-SETUP-1) ----------------------------------------------------------------------------------
// Shapes read from @opencode/plugin 2.2.5 (dist/promise: plugin.d.ts, session.d.ts, tool.d.ts) and probed live on the 2.2.5
// loader. 1.19 hook -> 2.x hook: tool.execute.before -> ctx.tool.hook("execute.before") (throw = deny, the message reaches
// the model), tool.execute.after -> "execute.after" (status completed | error), chat.message -> ctx.session.hook("prompt"),
// experimental.chat.system.transform -> ctx.session.hook("context") (push a text part to `system`),
// experimental.session.compacting -> ctx.session.hook("compaction"), event step-finish -> ctx.event.subscribe
// ("session.step.ended"), plugin tools -> ctx.tool.transform(editor.add). setup returns a dispose function.

interface Oc2Content { type?: string; text?: string }
interface Oc2BeforeInput { tool?: string; sessionID?: string; id?: string; input?: unknown }
interface Oc2AfterInput extends Oc2BeforeInput {
  status?: string;
  result?: { content?: string | Oc2Content[]; output?: unknown };
  error?: { message?: string };
}
interface Oc2Part { type?: string; text?: string }
interface Oc2Tool {
  name: string;
  description: string;
  input: unknown;
  options: { codemode: boolean };
  execute(input: unknown, context: { sessionID?: string; signal?: AbortSignal }): Promise<{ content: string }>;
}
/** The part of the OpenCode 2 `setup(ctx)` argument this plugin uses. */
export interface OpenCode2Context {
  location: { directory: string };
  tool: {
    hook(name: string, cb: (input: never) => Promise<void> | void): Promise<unknown>;
    transform(cb: (editor: { add(tool: Oc2Tool): void }) => void): Promise<unknown>;
  };
  session: { hook(name: string, cb: (input: never) => Promise<void> | void): Promise<unknown> };
  event: { subscribe(options?: { types?: string[]; signal?: AbortSignal }): AsyncIterable<{ data?: { sessionID?: string } }> };
}

function oc2Text(content: string | Oc2Content[] | undefined): string {
  if (typeof content === "string") return content;
  return (content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

/** impl/12 §4.1, OpenCode 2 `{id, setup}`: the same handlers as `setupLegacy`, wired to the 2.x ctx. */
export async function setup(ctx: OpenCode2Context): Promise<() => void> {
  const tools = new Map<string, Oc2Tool>();
  const hooks = await setupLegacy({
    directory: ctx.location.directory,
    tool(name, def) {
      tools.set(name, {
        name, description: def.description,
        input: z.toJSONSchema(def.args as z.ZodType, { target: "draft-2020-12", io: "input" }),
        options: { codemode: false }, // a ctx_* tool is listed to the model by name, not behind the host's code tool
        async execute(input, context) {
          return { content: await def.execute(input, { sessionID: context.sessionID, abort: context.signal }) };
        },
      });
    },
  });

  await ctx.tool.transform((editor) => { for (const t of tools.values()) editor.add(t); });

  await ctx.tool.hook("execute.before", async (i: Oc2BeforeInput) => {
    await hooks["tool.execute.before"]({ tool: i.tool, sessionID: i.sessionID, callID: i.id }, { args: i.input });
  });
  await ctx.tool.hook("execute.after", async (i: Oc2AfterInput) => {
    const failed = i.status === "error";
    const output = failed ? i.error?.message ?? "" : oc2Text(i.result?.content);
    await hooks["tool.execute.after"]({ tool: i.tool, sessionID: i.sessionID, callID: i.id, args: i.input }, { output, isError: failed });
  });
  await ctx.session.hook("prompt", async (p: { sessionID?: string; prompt?: { text?: string } }) => {
    await hooks["chat.message"]({ sessionID: p.sessionID }, { parts: [{ type: "text", text: p.prompt?.text ?? "" }] });
  });
  await ctx.session.hook("context", async (c: { sessionID?: string; system: Oc2Part[] }) => {
    const system: string[] = [];
    await hooks["experimental.chat.system.transform"]({ sessionID: c.sessionID }, { system });
    for (const text of system) if (!c.system.some((p) => p.text === text)) c.system.push({ type: "text", text });
  });
  await ctx.session.hook("compaction", async (c: { sessionID?: string }) => {
    await hooks["experimental.session.compacting"]({ sessionID: c.sessionID });
  });

  // step-finish is the Usage event: one cost row per (session, turn). The loop ends when dispose aborts it.
  const stop = new AbortController();
  void (async () => {
    for await (const e of ctx.event.subscribe({ types: ["session.step.ended"], signal: stop.signal })) {
      await hooks.event({ event: { type: "message.part.updated", properties: { part: { type: "step-finish", sessionID: e.data?.sessionID } } } });
    }
  })().catch(() => { /* a hook never errors (ADR-0001); an ended stream is the dispose path */ });
  return () => stop.abort();
}

/** ADR-0020, D-HA-6: the OpenCode 1.19.4 loader takes `export default { id, server }`; `server(input)` returns the
 *  hook object, and plugin tools ride in its `tool` map with `args` as a record of zod fields (the object shape). */
export async function server(input: { directory?: string }, _options?: unknown) {
  const tool: Record<string, Omit<OpenCodeToolDef, "args"> & { args: unknown }> = {};
  const hooks = await setupLegacy({
    directory: input.directory,
    tool(name, def) {
      const shape = (def.args as { shape?: unknown }).shape;
      tool[name] = { ...def, args: shape ?? {} };
    },
  });
  return { ...hooks, tool };
}

// The 1.19.4 loader reads only id, server and tui on the default export; the 2.x loader reads id and setup (or effect).
export default { id: PLUGIN_ID, server, setup };
