// src/entries/pi.ts — Pi extension, in-process (impl/12 §1-§3, impl/10 §10; DEVIATIONS D-M5-arch-1,
// D-M5-A1-1, D-M5-P1-1). Pi loads `export default function (pi)` and wires handlers with
// `pi.on(<event>, handler)`. No MCP child: TOOLS register through `pi.registerTool` and run in this
// process. Every hook goes through handleHook with the D-M5-A1-1 raw shape (`type` = call-site name).
// One instance per session (impl/12 A22): all state lives in this closure, none at module level, so a
// reload leaves nothing behind (#983). No console writes: Pi owns the terminal (#868).
import { z } from "zod/v4";
import { checkPermission } from "../adapters/pi.ts";
import { INTERNAL_ERROR_LINE } from "../core/contracts/constants.ts";
import { CtxError } from "../core/contracts/errors.ts";
import type { AgentId } from "../core/contracts/agents.ts";
import type { HookOutput, ProjectContext, ToolContext, ToolReply } from "../core/contracts/types.ts";
import { handleHook } from "../core/hooks/dispatch.ts";
import { ownJournal } from "../core/journal/own-call.ts";
import { resolveProject } from "../core/project/resolve.ts";
import { TOOLS, checkCall, type RegisteredTool } from "../core/tools/registry.ts";
import { INSTRUCTIONS } from "./server.ts";

/** The Pi handler context fields this file reads (impl/10 §10). */
export interface PiContext {
  cwd?: string;
  sessionManager?: { getSessionId(): string };
}

export interface PiToolResult {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}

export interface PiTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  /** OMP: "essential" lists the tool as a top-level tool (OMP docs/extensions.md:826). Pi ignores the field. */
  loadMode?: "essential" | "discoverable";
  execute(toolCallId: string, params: unknown, signal?: AbortSignal): Promise<PiToolResult>;
}

/** The Pi extension API surface this file uses. getSettings is Pi >= 1.4 (types.d.ts "Get a copy of the effective settings"). */
export interface PiApi {
  on(event: string, handler: (event: Record<string, unknown>, ctx?: PiContext) => unknown): void;
  registerTool(tool: PiTool): void;
  getSettings?(): unknown;
  /** OMP: the coding-agent module (loader.ts:218-220); its `settings` holds the raw global and project layers. */
  readonly pi?: { settings?: { getGlobalSettings?(): unknown; getProjectSettings?(): unknown } };
}

/** The tool_result patch: Pi keeps a field the patch omits, except structuredContent on a content change. */
interface PiResultPatch {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
}

type PiEvent = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// D-OMP-PROMPT-1 (#1332): our payload goes after the host's system prompt, once, in the host's own shape.
// OMP >= 14.7.0 sends string[] (runner.ts:2682-2686): every block stays, in order, and the payload is the last
// block. A string (Pi, Pi-Bolt, OMP < 14.7.0) keeps the fea7780d bytes. Absent or empty is the payload alone.
// Built from the event on every call, so a re-run with a changed base gets the payload once.
function appendPayload(base: unknown, payload: string): string | unknown[] {
  if (Array.isArray(base)) return [...base, payload];
  const text = str(base);
  return text === "" ? payload : text + "\n\n" + payload;
}

// Pi tool_result content is a list of parts; the text parts are the result text.
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: { type?: unknown; text?: unknown }) => (part.type === "text" ? str(part.text) : "")).join("");
}

function field(v: unknown, key: string): unknown {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>)[key] : undefined;
}

// D-R54-PI-META-1 (#1352): contextMode.excludeTools in Pi settings, exact tool names whose result stays whole.
// Read on each call, so a settings change counts at once. A missing or malformed value, a Pi with no getSettings
// (0.73.1) or a throw (runtime not bound yet) is the empty list: the default replace.
// D-OMP-FILTER-1 (O10): OMP has no getSettings; the same key comes from api.pi.settings, the project list over the
// global list (OMP's own layer order). The Pi entry reads getSettings only, so the Pi path is unchanged.
function listOf(settings: unknown): string[] | undefined {
  const list = field(field(settings, "contextMode"), "excludeTools");
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === "string") : undefined;
}

export function excludedTools(pi: PiApi, host: PiHostId = "pi"): readonly string[] {
  try {
    if (host === "pi") return listOf(pi.getSettings?.()) ?? [];
    const settings = pi.pi?.settings;
    return listOf(settings?.getProjectSettings?.()) ?? listOf(settings?.getGlobalSettings?.()) ?? [];
  } catch {
    return [];
  }
}

function errorReply(err: unknown): ToolReply {
  return { text: err instanceof CtxError ? err.toLine() : INTERNAL_ERROR_LINE, isError: true, sandboxBytes: 0 };
}

// Pi marks a failed tool call by a throw from execute (impl/12 A26); the reply text is the message.
// The reply's first line is the handler's own plain-text line, never a fence opener (#1094).
function toPi(reply: ToolReply): PiToolResult {
  if (reply.isError) throw new Error(reply.text);
  return { content: [{ type: "text", text: reply.text }], details: {} };
}

// D-OMP-ENTRY-1: the hosts that load this factory. The entry names its host: the Pi entry (default export) passes
// "pi", omp/index.js passes "omp". Env never picks the id: OMP sets PI_CODING_AGENT_DIR and PI_CONFIG_DIR, and so
// can a Pi user. "omp" joins AGENT_IDS in M4 (D-OMP-ROW-1); until then handleHook names it on its stderr line.
export type PiHostId = "pi" | "omp";

export default function piExtension(pi: PiApi): void {
  hostExtension(pi, "pi");
}

export function hostExtension(pi: PiApi, host: PiHostId = "pi"): void {
  const agent = host as AgentId;
  const env = process.env;
  let sessionId = ""; // impl/10 §10: ctx.sessionManager.getSessionId(), captured once (impl/12 §3.2)
  let cwd = ""; // impl/12 §3.2 step 2: ctx.cwd, captured once
  let project: ProjectContext | undefined;
  let turn = 0;
  let compactPending = false; // ADR-0009 §6 Pi row: session_compact flag, then before_agent_start, once
  // D-CACHE-PI-1: the fixed text this session adds after Pi's base prompt. Pi 0.73.1 resets the system
  // prompt to base on a turn that returns no systemPrompt (agent-session.js:791-797), so every turn returns
  // base + payload, byte-identical between compactions. "" until a successful delivery (§3.3 step 8).
  let payload = "";
  const journal = ownJournal(); // D-HF-INPROC-JOURNAL-1
  let toolsRegistered = false; // #1098: a failed registration retries on the next before_agent_start
  // D-OMP-TURN-1 (O2c): the prompt of the open agent run. OMP re-runs before_agent_start in one prompt when its
  // base changed during the call (agent-session.ts:9413-9432); the same event.prompt with no input, agent_end or
  // session_compact in between is that re-run: no new turn, no second SessionStart. Pi never re-runs, so Pi is unchanged.
  let openPrompt: string | undefined;

  function identify(ctx: PiContext | undefined): void {
    if (sessionId === "") sessionId = str(ctx?.sessionManager?.getSessionId());
    if (cwd === "") cwd = str(ctx?.cwd);
  }

  function hook(raw: PiEvent, atTurn: number): Promise<HookOutput> {
    return handleHook(agent, { ...raw, sessionId, cwd, turn: atTurn }, env);
  }

  // #1246: each instance resolves its own project from its own ctx.cwd, at most once.
  function projectOf(): ProjectContext {
    project ??= resolveProject(agent, { env, argv: process.argv, cwd, piCwd: cwd });
    return project;
  }

  async function runTool(tool: RegisteredTool<unknown>, params: unknown, signal: AbortSignal | undefined): Promise<ToolReply> {
    const checked = checkCall(tool, params);
    if (!checked.ok) return { text: checked.line, isError: true, sandboxBytes: 0 };
    const ctx: ToolContext = {
      get project(): ProjectContext {
        return projectOf();
      },
      sessionId,
      turn,
      // #1182: Pi's abort signal reaches the handler, which kills the process tree and replies "Cancelled.".
      signal: signal ?? new AbortController().signal,
      protocolVersion: "",
      piCwd: cwd === "" ? undefined : cwd, // D-R38-PI-D7-1 (#1312): ctx_doctor D7 compares against Pi's live ctx.cwd
    };
    let reply: ToolReply;
    try {
      reply = await tool.handler(checked.data, ctx);
    } catch (err) {
      return errorReply(err);
    }
    // D-HF-INPROC-JOURNAL-1: the row the MCP server writes; an unresolved project has no DB, so no row.
    if (project !== undefined) await journal(project, ctx, tool.name, reply);
    return reply;
  }

  function piTool(tool: RegisteredTool<unknown>): PiTool {
    return {
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.schema),
      loadMode: "essential",
      execute: async (_toolCallId, params, signal) => toPi(await runTool(tool, params, signal)),
    };
  }

  function registerTools(): void {
    if (toolsRegistered) return;
    try {
      for (const tool of TOOLS) pi.registerTool(piTool(tool));
      toolsRegistered = true;
    } catch {
      // #1098: left unregistered; the next before_agent_start registers again.
    }
  }

  // impl/12 §3.3: SessionStart (startup, or compact after a session_compact), then the system prompt.
  pi.on("before_agent_start", async (event, ctx) => {
    identify(ctx);
    const prompt = typeof event.prompt === "string" ? event.prompt : undefined;
    const rerun = prompt !== undefined && prompt === openPrompt;
    openPrompt = prompt;
    if (!rerun) turn += 1;
    registerTools();
    const withPayload = (): { systemPrompt: string | unknown[] } => ({ systemPrompt: appendPayload(event.systemPrompt, payload) });
    if (rerun && payload !== "") return withPayload(); // the new base + the same payload, once
    let out: HookOutput;
    try {
      out = await hook({ type: compactPending ? "session_compact" : "session_start" }, turn);
    } catch {
      // §3.3 step 8: retry next turn. Before a first delivery there is nothing to keep; after it, the same
      // payload keeps the prefix stable (D-CACHE-PI-1), and compactPending stays set for the retry.
      return payload === "" ? {} : withPayload();
    }
    const compactTurn = compactPending;
    compactPending = false; // A27: the very next before_agent_start reads and clears the flag
    if (payload === "" || compactTurn) {
      // First delivery, or a compact turn (the history is new, so the prefix is written anyway): the
      // payload is INSTRUCTIONS plus this hook's text, in system role, never user (#1264, #1263).
      payload = [INSTRUCTIONS, out.stdout].filter((s) => s !== "").join("\n\n");
    } else if (out.stdout !== "") {
      payload += "\n\n" + out.stdout; // appended once, never edits earlier bytes
    }
    return withPayload();
  });

  // impl/10 §10 UserPromptSubmit: the prompt row belongs to the turn it starts.
  pi.on("input", async (event, ctx) => {
    identify(ctx);
    openPrompt = undefined;
    await hook({ type: "input", message: str(event.text) }, turn + 1);
    return undefined;
  });

  // impl/12 §3.4: allow returns nothing; a deny is Pi's {block, reason} (impl/10 §10).
  pi.on("tool_call", async (event, ctx) => {
    identify(ctx);
    const out = await hook({ type: "tool_call", toolName: event.toolName, toolCallId: event.toolCallId, input: event.input }, turn);
    return checkPermission(out);
  });

  // impl/12 §3.5: journal append happens inside handleHook. D-R54-PI-META-1 (#1352): a replace (case C) sets
  // content and the tool's own structuredContent together (ADR-0016:48 Pi row) and leaves details to Pi, so the
  // tool keeps its continuation state. An excludeTools name is sent as keep: journaled, never replaced.
  pi.on("tool_result", async (event, ctx) => {
    identify(ctx);
    const out = await hook({
      type: "tool_result", toolName: event.toolName, toolCallId: event.toolCallId, input: event.input,
      content: textOf(event.content), isError: event.isError === true,
      keep: excludedTools(pi, host).includes(str(event.toolName)),
    }, turn);
    if (out.stdout === "") return undefined;
    const patch: PiResultPatch = { content: [{ type: "text", text: out.stdout }] };
    if (event.structuredContent !== undefined) patch.structuredContent = event.structuredContent;
    return patch;
  });

  // impl/12 §3.6: only the flag; the next before_agent_start delivers (D-M5-P1-1).
  pi.on("session_compact", () => {
    compactPending = true;
    openPrompt = undefined;
    return undefined;
  });

  // D-OMP-TURN-1: the agent run ends, so the next before_agent_start starts a new prompt (print mode has no input).
  pi.on("agent_end", () => {
    openPrompt = undefined;
    return undefined;
  });

  // D-OMP-TURN-1 (O2c probe): OMP gets its tools at load, so the first before_agent_start leaves the base as it is.
  // The Pi entry keeps registering in the first before_agent_start (Pi request bytes unchanged, ADR-0021).
  if (host === "omp") registerTools();
}
