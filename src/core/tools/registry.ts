// impl/11 §1. The 9 tools in TOOL_ORDER: name, description (src/prompt/tools/<tool>.md, inlined by
// build/build.mjs into src/prompt/_generated.ts), zod schema, readOnly, alwaysLoad, handler.
// Every tool module is built (M5, D-M5-arch-6): schema and handler come from the module (§1 step 1).
import type { z } from "zod/v4";
import { TOOL_ORDER } from "../contracts/constants.ts";
import type { ToolContext, ToolReply } from "../contracts/types.ts";
import { TOOL_DESCRIPTIONS } from "../../prompt/_generated.ts";
import { ctxBatch } from "./batch.ts";
import { ctxDoctor } from "./doctor.ts";
import { ctxExecute } from "./execute.ts";
import { ctxIndex } from "./index.ts";
import { ctxPurge } from "./purge.ts";
import { ctxResume } from "./resume.ts";
import { ctxSearch } from "./search.ts";
import { ctxStats } from "./stats.ts";
import { ctxUpgrade } from "./upgrade.ts";

export type ToolName = (typeof TOOL_ORDER)[number];

// ToolDef (contracts/types.ts) with the schema typed as zod v4: @modelcontextprotocol/server 2.3.1
// cannot turn a zod v3 schema into JSON Schema (DEVIATIONS 2026-10-17 registry.ts, zod/v4).
export interface RegisteredTool<I> {
  name: ToolName;
  description: string;
  schema: z.ZodType<I>;
  readOnly: boolean;
  alwaysLoad: boolean;
  handler(input: I, ctx: ToolContext): Promise<ToolReply>;
}

// impl/11 §1 steps 4-5.
const READ_ONLY: ReadonlySet<ToolName> = new Set<ToolName>(["ctx_search", "ctx_resume", "ctx_stats"]);
const ALWAYS_LOAD: ReadonlySet<ToolName> = new Set<ToolName>(["ctx_execute"]);

// impl/11 §1 step 1: one module per tool; the Record type fails the type check if one is missing.
interface BuiltTool {
  schema: z.ZodType;
  handler(input: never, ctx: ToolContext): Promise<ToolReply>;
}
const BUILT: Readonly<Record<ToolName, BuiltTool>> = Object.freeze({
  ctx_execute: ctxExecute,
  ctx_batch: ctxBatch,
  ctx_index: ctxIndex,
  ctx_search: ctxSearch,
  ctx_resume: ctxResume, // D-M4-arch-3: handler (input, ctx), session from ctx.sessionId
  ctx_stats: ctxStats,
  ctx_doctor: ctxDoctor, // D-M5-arch-6
  ctx_upgrade: ctxUpgrade, // D-M5-arch-6
  ctx_purge: ctxPurge,
});

function define(name: ToolName): RegisteredTool<unknown> {
  const built = BUILT[name];
  return {
    name,
    description: TOOL_DESCRIPTIONS[name],
    schema: built.schema as z.ZodType<unknown>,
    readOnly: READ_ONLY.has(name),
    alwaysLoad: ALWAYS_LOAD.has(name),
    handler: built.handler as (i: unknown, c: ToolContext) => Promise<ToolReply>,
  };
}

// §1 steps 3 and 6. Built from TOOL_ORDER itself, so the order is TOOL_ORDER by construction (§1 step 7
// as a compile-time check).
export const TOOLS: readonly RegisteredTool<unknown>[] = Object.freeze(TOOL_ORDER.map(define));

// D-CALL-SHAPE-1: the exact example call is the first backtick span of the description (src/prompt/tools/<tool>.md).
export function callExample(tool: RegisteredTool<unknown>): string {
  const a = tool.description.indexOf("`");
  const b = tool.description.indexOf("`", a + 1);
  return a < 0 || b < 0 ? tool.name + "({})" : tool.description.slice(a + 1, b);
}

// One isError line for a call with {} or a wrong shape: what was wrong, then the exact correct call. Never a stack.
export function invalidCallLine(tool: RegisteredTool<unknown>, issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  const parts: string[] = [];
  for (const issue of issues.slice(0, 3)) {
    const where = issue.path.length === 0 ? "" : issue.path.map(String).join(".") + ": ";
    let one = (where + issue.message).split("\n").join(" ").trim();
    while (one.endsWith(".")) one = one.slice(0, -1);
    parts.push(one);
  }
  const detail = parts.length === 0 ? "Invalid arguments" : parts.join("; ");
  return tool.name + ": " + detail + ". Correct call: " + callExample(tool);
}

export type CallCheck = { ok: true; data: unknown } | { ok: false; line: string };

export function checkCall(tool: RegisteredTool<unknown>, input: unknown): CallCheck {
  const parsed = tool.schema.safeParse(input);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, line: invalidCallLine(tool, parsed.error.issues) };
}
