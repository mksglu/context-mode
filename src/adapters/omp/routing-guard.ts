import { statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_READ_FILE_BYTES = 32 * 1024;
export const MAX_RESULT_BYTES = 16 * 1024;
const MAX_RESULT_PREFIX_BYTES = 8 * 1024;
export const TRUNCATION_MARKER =
  "[context-mode routing guard: output truncated; use ctx_execute or ctx_execute_file for analysis]";

const CONTEXT_MODE_TOOL_PATTERN = /(?:ctx_|context-mode|context_mode_ctx_)/i;
const WEB_COMMAND_PATTERN =
  /\b(?:curl|wget|fetch|invoke-webrequest)(?:\.exe)?\b|\b(?:requests\.(?:get|post)|http\.(?:get|request)|urllib\.request)\b/i;
const ANALYSIS_COMMAND_PATTERNS = [
  /\b(?:cat|type|get-content|more|less|head|tail|grep|rg|find|findstr)\b/i,
  /\bgit\s+(?:log|diff|show)\b/i,
  /\b(?:npm|bun)\s+(?:test|run|build|lint)\b/i,
  /\bpytest\b/i,
  /\bcargo\s+test\b/i,
  /\bgo\s+test\b/i,
  /\b(?:gh|aws|docker|kubectl)\b/i,
];
const CLEAR_MUTATION_PATTERN =
  /^(?:(?:set\s+\w+=\S+|env\s+\w+=\S+)\s+)*(?:mkdir|md|mv|move-item|cp|copy-item|rm|del|remove-item|touch|ni|new-item|chmod|set-content|add-content|git\s+(?:add|commit|push|checkout|branch|merge)|npm\s+(?:install|publish)|pip\s+install|bun\s+(?:add|install)|echo|printf)\b/i;
const BROAD_PATHS = new Set([".", "./", "*", "**", "**/*"]);
const READ_SELECTOR_PATTERN = /(?::(?:raw|conflicts|\d+(?:-\d+|\+\d+)))+$/i;
const SPECIAL_SCHEME_PATTERN = /^(?:skill|local|artifact|memory|agent|history|issue|pr):\/\//i;

type RecordLike = Record<string, unknown>;

export interface OmpRoutingToolCallEvent {
  toolName?: unknown;
  tool_name?: unknown;
  name?: unknown;
  input?: unknown;
}

export interface OmpRoutingToolResultEvent {
  toolName?: unknown;
  tool_name?: unknown;
  name?: unknown;
  content?: unknown;
  isError?: unknown;
}

export interface OmpRoutingContext {
  cwd?: string;
}

export interface ToolCallBlock {
  block: true;
  reason: string;
}

export interface ToolResultReplacement {
  content: Array<{ type: "text"; text: string }>;
  isError?: unknown;
}

function asRecord(value: unknown): RecordLike | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordLike;
}

function toolNameOf(event: unknown): string {
  const record = asRecord(event);
  const value = record?.toolName ?? record?.tool_name ?? record?.name;
  return typeof value === "string" ? value : "";
}

function inputOf(event: unknown): RecordLike {
  const record = asRecord(event);
  if (record && asRecord(record.input)) return record.input as RecordLike;
  if (record && typeof record.input === "string") return { command: record.input };
  return {};
}

function isContextModeTool(toolName: string): boolean {
  return CONTEXT_MODE_TOOL_PATTERN.test(toolName);
}

function commandReason(command: string): string {
  if (WEB_COMMAND_PATTERN.test(command)) {
    return "Use context-mode MCP tools (ctx_execute, ctx_fetch_and_index) for command analysis and web/API access.";
  }
  return "Use context-mode MCP tools (ctx_execute) for command analysis instead of direct shell output.";
}

function isClearlyPermittedMutation(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed.includes("|")) return false;
  return CLEAR_MUTATION_PATTERN.test(trimmed);
}

function classifyShellCall(input: RecordLike): ToolCallBlock | undefined {
  const command = input.command;
  if (typeof command !== "string" || command.trim() === "") return undefined;

  if (WEB_COMMAND_PATTERN.test(command)) {
    return { block: true, reason: commandReason(command) };
  }
  if (ANALYSIS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return { block: true, reason: commandReason(command) };
  }

  const hasPipelineOrRedirect = /[|>]/.test(command) || /2>&1/.test(command);
  if (hasPipelineOrRedirect && !isClearlyPermittedMutation(command)) {
    return {
      block: true,
      reason: "Use context-mode MCP tools (ctx_execute) for command analysis; direct pipelines/redirections are reserved for clearly scoped mutations.",
    };
  }
  return undefined;
}

function inputPath(input: RecordLike): string | undefined {
  const pathValue = input.path ?? input.file_path;
  return typeof pathValue === "string" ? pathValue : undefined;
}

function hasReadSelector(pathValue: string): boolean {
  return READ_SELECTOR_PATTERN.test(pathValue);
}

function classifyReadCall(input: RecordLike, ctx: OmpRoutingContext): ToolCallBlock | undefined {
  const pathValue = inputPath(input);
  if (!pathValue || pathValue.trim() === "") return undefined;

  if (/^https?:\/\//i.test(pathValue)) {
    return {
      block: true,
      reason: "Use context-mode MCP tool (ctx_fetch_and_index) for web/API URLs instead of direct read.",
    };
  }
  if (SPECIAL_SCHEME_PATTERN.test(pathValue) || hasReadSelector(pathValue)) return undefined;

  try {
    const cwd = typeof ctx.cwd === "string" && ctx.cwd ? ctx.cwd : process.cwd();
    const stats = statSync(resolve(cwd, pathValue));
    if (stats.isFile() && stats.size > MAX_READ_FILE_BYTES) {
      return {
        block: true,
        reason: "Use context-mode MCP tool (ctx_execute_file) for large local-file analysis or add a line selector to direct read.",
      };
    }
  } catch {
    // Preserve the native OMP error when stat cannot classify the path.
  }
  return undefined;
}

function isBroadPath(pathValue: string): boolean {
  const normalized = pathValue.trim().toLowerCase().replaceAll("\\", "/");
  return BROAD_PATHS.has(normalized);
}

function parseLimit(value: unknown): number | null | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return undefined;
}

function classifyGrepCall(input: RecordLike): ToolCallBlock | undefined {
  const pathValue = input.path;
  if (typeof pathValue !== "string" || pathValue.trim() === "" || isBroadPath(pathValue)) {
    return {
      block: true,
      reason: "Use context-mode MCP tool (ctx_execute) for broad search/analysis; direct grep is reserved for a scoped file or directory.",
    };
  }
  return undefined;
}

function classifyGlobCall(input: RecordLike): ToolCallBlock | undefined {
  const pathValue = input.path;
  if (typeof pathValue !== "string" || pathValue.trim() === "") {
    return {
      block: true,
      reason: "Use context-mode MCP tool (ctx_execute) for broad inventory/analysis; direct glob/list needs a scoped pattern or a limit of 50.",
    };
  }

  const limit = parseLimit(input.limit);
  if (limit !== undefined && (limit === null || limit > 50)) {
    return {
      block: true,
      reason: "Use context-mode MCP tool (ctx_execute) for broad inventory/analysis; direct glob/list is limited to 50 results.",
    };
  }
  if (isBroadPath(pathValue) && !(typeof limit === "number" && limit <= 50)) {
    return {
      block: true,
      reason: "Use context-mode MCP tool (ctx_execute) for broad inventory/analysis; direct glob/list needs an explicit limit of 50 or less.",
    };
  }
  return undefined;
}

/** Classify a tool call; return undefined for permitted or unknown inputs. */
export function classifyOmpToolCall(
  event: OmpRoutingToolCallEvent,
  ctx: OmpRoutingContext = {},
): ToolCallBlock | undefined {
  try {
    const toolName = toolNameOf(event);
    if (!toolName || isContextModeTool(toolName)) return undefined;

    const normalizedName = toolName.toLowerCase();
    const input = inputOf(event);
    if (["bash", "shell", "exec_command"].includes(normalizedName)) return classifyShellCall(input);
    if (["read", "view"].includes(normalizedName)) return classifyReadCall(input, ctx);
    if (normalizedName === "grep") return classifyGrepCall(input);
    if (["glob", "list"].includes(normalizedName)) return classifyGlobCall(input);
  } catch {
    // Routing is best-effort; preserve native OMP behavior on malformed inputs.
  }
  return undefined;
}

function utf8Prefix(value: string, maxBytes: number): string {
  let byteLength = 0;
  let end = 0;
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index)!;
    const character = String.fromCodePoint(codePoint);
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (byteLength + characterBytes > maxBytes) break;
    byteLength += characterBytes;
    index += character.length;
    end = index;
  }
  return value.slice(0, end);
}

function utf8Suffix(value: string, maxBytes: number): string {
  let byteLength = 0;
  let start = value.length;
  for (let index = value.length; index > 0;) {
    let characterStart = index - 1;
    const lastUnit = value.charCodeAt(index - 1);
    if (lastUnit >= 0xdc00 && lastUnit <= 0xdfff && index >= 2) {
      const precedingUnit = value.charCodeAt(index - 2);
      if (precedingUnit >= 0xd800 && precedingUnit <= 0xdbff) characterStart = index - 2;
    }
    const character = value.slice(characterStart, index);
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (byteLength + characterBytes > maxBytes) break;
    byteLength += characterBytes;
    index = characterStart;
    start = index;
  }
  return value.slice(start);
}

/** Replace oversized non-context-mode tool text with a bounded head/tail view. */
export function limitOmpToolResult(event: OmpRoutingToolResultEvent): ToolResultReplacement | undefined {
  try {
    if (isContextModeTool(toolNameOf(event))) return undefined;

    const record = asRecord(event);
    const content = Array.isArray(record?.content) ? record.content : [];
    const textParts = content
      .map(asRecord)
      .filter((part): part is RecordLike => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string);
    if (textParts.length === 0) return undefined;

    const text = textParts.join("\n");
    if (Buffer.byteLength(text, "utf8") <= MAX_RESULT_BYTES) return undefined;

    const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, "utf8");
    const prefix = utf8Prefix(text, MAX_RESULT_PREFIX_BYTES);
    const suffix = utf8Suffix(
      text,
      Math.max(0, MAX_RESULT_BYTES - markerBytes - Buffer.byteLength(prefix, "utf8")),
    );
    const result: ToolResultReplacement = {
      content: [{ type: "text", text: `${prefix}${TRUNCATION_MARKER}${suffix}` }],
    };
    if (record && Object.prototype.hasOwnProperty.call(record, "isError")) {
      result.isError = record.isError;
    }
    return result;
  } catch {
    // Result limiting is a fallback; never break a tool result on guard failure.
    return undefined;
  }
}