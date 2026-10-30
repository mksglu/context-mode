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

/** impl/12 §4.3. Registers the ctx_* tools once and returns the hook object, closed over `cwd`. */
export async function setup(app: OpenCodeApp) {
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
    "tool.execute.after": async (input: ToolInput, output: { output?: unknown }) => {
      const sessionId = input.sessionID ?? "";
      await payloadFor(sessionId);
      await call({
        type: "execute.after", sessionID: sessionId, tool: input.tool, callID: input.callID, args: input.args,
        output: output.output, turn: turnOf(sessionId),
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

/** ADR-0020, D-HA-6: the OpenCode 1.19.4 loader takes `export default { id, server }`; `server(input)` returns the
 *  hook object, and plugin tools ride in its `tool` map with `args` as a record of zod fields (the object shape). */
export async function server(input: { directory?: string }, _options?: unknown) {
  const tool: Record<string, Omit<OpenCodeToolDef, "args"> & { args: unknown }> = {};
  const hooks = await setup({
    directory: input.directory,
    tool(name, def) {
      const shape = (def.args as { shape?: unknown }).shape;
      tool[name] = { ...def, args: shape ?? {} };
    },
  });
  return { ...hooks, tool };
}

// The 1.19.4 loader reads only id, server and tui on the default export; setup stays for the M5 plugin API tests.
export default { id: PLUGIN_ID, server, setup };
