// impl/10 §2 + shared decode/encode pseudocode; ADR-0001 (Claude Code is the reference contract).
// Also exports the Claude-shape decode/encode that codex.ts instantiates with its own fields (impl/10 §3).
import type { AgentId } from "../core/contracts/agents.ts";
import type { CanonicalEventName, CanonicalHookEvent, Decision, HookOutput, ToolCall, ToolResultInfo } from "../core/contracts/types.ts";

export const TOOL_NAME_PREFIX = "mcp__plugin_context-mode_context-mode__"; // impl/10 §1.3, TECH-SPEC §3.8 (plugin install)

// D-CC-PWSH-1 (#1212): Claude Code 2.1.274 binary: `var Gt="PowerShell"`, input schema {command: "The PowerShell command
// to execute", timeout?, description?, run_in_background?, dangerouslyDisableSandbox?}, output {stdout, stderr, interrupted, ...}
// (the Bash shapes). Enabled on Windows (CLAUDE_CODE_USE_POWERSHELL_TOOL). It is the same canonical shell as Bash.
export const SHELL_TOOL_NAMES: readonly string[] = Object.freeze(["Bash", "PowerShell"]);
const POWERSHELL_TOOL = "PowerShell";
const SHELL_CANONICAL = "Bash";

const CLAUDE_SHAPE_EVENTS: readonly CanonicalEventName[] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]; // impl/10 §1.4
const MCP_PREFIX = "mcp__";
const MCP_SEP = "__";

type Source = NonNullable<CanonicalHookEvent["source"]>;
const CLAUDE_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };

// Own tool -> bare ctx_* name; mcp__<server>__<tool> -> "mcp:<server>:<tool>"; native names unchanged (impl/01 §2).
function canonicalName(name: string, ownPrefix: string): string {
  if (name.startsWith(ownPrefix)) return name.slice(ownPrefix.length);
  if (!name.startsWith(MCP_PREFIX)) return name;
  const rest = name.slice(MCP_PREFIX.length);
  const sep = rest.indexOf(MCP_SEP);
  if (sep < 0) return name;
  return "mcp:" + rest.slice(0, sep) + ":" + rest.slice(sep + MCP_SEP.length);
}

// D-M7-RR-1: a Bash tool_response {stdout, stderr, ...} is read as the output the model sees (stdout, then
// stderr on its own line), so the replace selects and indexes plain lines, not one escaped JSON string.
function outputOf(resp: unknown): string {
  if (resp === undefined) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return blocksOf(resp).text; // D-M2-MCP-1
  if (typeof resp === "object" && resp !== null) {
    const r = resp as { stdout?: unknown; stderr?: unknown; content?: unknown; mode?: unknown };
    // D-FU-RF-DECODE-1: a Bash shape with only one of stdout/stderr reads the missing one as "".
    if (typeof r.stdout === "string" || typeof r.stderr === "string") {
      const out = typeof r.stdout === "string" ? r.stdout : "";
      const err = typeof r.stderr === "string" ? r.stderr : "";
      return err === "" ? out : out === "" ? err : out + "\n" + err;
    }
  }
  // D-M2-MCP-1, D-CC-SHAPE-1: a native tool object whose text sits in one field: that field is the output the model sees.
  if (typeof resp === "object" && resp !== null && !Array.isArray(resp)) {
    const slot = textSlot(resp as Record<string, unknown>);
    if (slot !== null) return slot.text;
  }
  return JSON.stringify(resp);
}

// D-CC-SHAPE-1 (#1304): Claude Code checks updatedToolOutput against the tool's own output schema and keeps the
// original output on a mismatch. Shapes from the Claude Code 2.1.274 binary (outputSchema of each tool):
// Read text {type:"text", file:{filePath, content, numLines, startLine, totalLines}}, Grep content {mode:"content",
// content, ...}, Grep files and Glob {filenames: string[], numFiles, ...}, WebFetch {result, url, code, ...}.
// The replace keeps every other field and swaps only the text field, so the object still parses.
type Slot = { text: string; put: (resp: Record<string, unknown>, output: string) => Record<string, unknown> };

function textSlot(r: Record<string, unknown>): Slot | null {
  const file = r.file;
  if (r.type === "text" && typeof file === "object" && file !== null && typeof (file as { content?: unknown }).content === "string") {
    return { text: (file as { content: string }).content, put: (o, output) => ({ ...o, file: readFile(o.file as Record<string, unknown>, output) }) };
  }
  if (isGrepContent(r)) return { text: r.content as string, put: (o, output) => ({ ...o, content: output }) };
  if (Array.isArray(r.filenames) && r.filenames.every((f) => typeof f === "string")) {
    return { text: r.filenames.join("\n"), put: (o, output) => ({ ...o, filenames: output.split("\n") }) };
  }
  if (typeof r.result === "string") return { text: r.result, put: (o, output) => ({ ...o, result: output }) };
  return null;
}

// D-R33-CC-READ-LINES-1 (claude-code-2): Claude Code 2.1.318 numbers each Read line from file.startLine. The replace
// keeps the first run of output lines that are real file lines, at their own numbers, then the handle line. A later chunk
// after a gap stays in the store (the handle searches it). No real file line kept: the lines start past the lines read,
// so no number names a file line it does not show.
function readFile(file: Record<string, unknown>, output: string): Record<string, unknown> {
  const start = typeof file.startLine === "number" ? file.startLine : 1;
  const lines = String(file.content).split("\n");
  const read = typeof file.numLines === "number" ? file.numLines : lines.length;
  const out = output.split("\n");
  const run = firstRun(lines, out);
  if (run === null) return { ...file, content: output, startLine: start + read, numLines: out.length };
  const kept = out.slice(0, run.length);
  if (run.length < out.length) kept.push(out[out.length - 1]); // the handle line is the last line of a replace
  return { ...file, content: kept.join("\n"), startLine: start + run.at, numLines: kept.length };
}

// The file line index where the longest run of the output's leading lines starts, and the run length; null when the
// first output line is no file line.
function firstRun(lines: readonly string[], out: readonly string[]): { at: number; length: number } | null {
  let best: { at: number; length: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== out[0]) continue;
    let n = 1;
    while (n < out.length && i + n < lines.length && lines[i + n] === out[n]) n++;
    if (best === null || n > best.length) best = { at: i, length: n };
    if (n === out.length) break;
  }
  return best;
}

function isShellShape(resp: object): boolean {
  const r = resp as { stdout?: unknown; stderr?: unknown };
  return typeof r.stdout === "string" || typeof r.stderr === "string";
}

// D-R33-CC-GREP-COUNT-1 (claude-code-3): count mode shows content (per-file counts) too, so content is its text slot.
function isGrepContent(resp: object): boolean {
  const r = resp as { mode?: unknown; content?: unknown };
  return (r.mode === "content" || r.mode === "count") && typeof r.content === "string";
}

// D-M2-MCP-1: an MCP result is an array of content blocks; the text blocks joined by a newline are the output.
// A block of another type (image, resource) is not ours to rewrite: keep marks the result as untouchable.
function blocksOf(resp: unknown[]): { text: string; keep: boolean } {
  const parts: string[] = [];
  let keep = false;
  for (const b of resp) {
    const blk = typeof b === "object" && b !== null ? (b as { type?: unknown; text?: unknown }) : {};
    if (blk.type === "text" && typeof blk.text === "string") parts.push(blk.text);
    else keep = true;
  }
  return { text: parts.join("\n"), keep };
}

function readResult(resp: unknown): ToolResultInfo {
  const text = outputOf(resp);
  const isError = typeof resp === "object" && resp !== null && (resp as { is_error?: unknown }).is_error === true;
  const info: ToolResultInfo = { isError, bytes: Buffer.byteLength(text), text };
  // D-CC-SHAPE-1: an object the replace can rebuild keeps its shape; any other non-Bash object stays as the host made it.
  if (typeof resp === "object" && resp !== null && !Array.isArray(resp) && isShellShape(resp)) info.shape = resp as Record<string, unknown>; // D-R33-CC-SHELL-1
  if (typeof resp === "object" && resp !== null && !Array.isArray(resp) && !isShellShape(resp)) {
    if (textSlot(resp as Record<string, unknown>) !== null) info.shape = resp as Record<string, unknown>;
    else info.keep = true;
  }
  if (Array.isArray(resp)) {
    info.blocks = true;
    if (blocksOf(resp).keep) info.keep = true;
  }
  // D-M2-SHAPE-2: above its inline limit Claude Code gives the hook only the head of stdout and keeps the
  // whole output in persistedOutputPath (persistedOutputSize bytes). The adapter names the file; dispatch reads it.
  if (typeof resp === "object" && resp !== null) {
    const r = resp as { persistedOutputPath?: unknown; persistedOutputSize?: unknown };
    if (typeof r.persistedOutputPath === "string" && r.persistedOutputPath !== "" && typeof r.persistedOutputSize === "number" && r.persistedOutputSize > info.bytes) {
      info.persistedPath = r.persistedOutputPath;
    }
  }
  return info;
}

export function decodeClaudeShape(raw: unknown, agent: AgentId, ownPrefix: string, sources: Readonly<Record<string, Source>>): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(agent + ": hook payload is not a JSON object");
  const p = raw as Record<string, unknown>;
  const event = CLAUDE_SHAPE_EVENTS.find((e) => e === p.hook_event_name);
  if (event === undefined) throw new Error(agent + ": unknown hook event " + String(p.hook_event_name));
  const ev: CanonicalHookEvent = { event, agent, sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  if (typeof p.agent_id === "string") {
    ev.agentId = p.agent_id;
    if (typeof p.agent_type === "string") ev.agentType = p.agent_type;
  }
  if (event === "SessionStart" && typeof p.source === "string" && sources[p.source] !== undefined) ev.source = sources[p.source];
  if (event === "UserPromptSubmit" && typeof p.prompt === "string") ev.prompt = p.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool_name ?? "");
    const input = typeof p.tool_input === "object" && p.tool_input !== null ? (p.tool_input as Record<string, unknown>) : {};
    const tool: ToolCall = { name, canonicalName: canonicalName(name, ownPrefix), input };
    if (typeof p.tool_use_id === "string" && p.tool_use_id !== "") tool.callId = p.tool_use_id;
    ev.tool = tool;
  }
  if (event === "PostToolUse") ev.result = readResult(p.tool_response);
  return ev;
}

// Deny exits 0: the reason travels in the JSON deny field, and Claude-shape hosts ignore stdout JSON on
// exit 2 (only stderr is read there; HookOutput has no stderr). DEVIATIONS D-M0-T8-1.
// D-M7-SV-1: Claude Code checks updatedToolOutput against the tool's own output schema and keeps the
// original output on a mismatch ("does not match Bash's output shape; using original output"). Bash
// output is an object {stdout, stderr, interrupted}, so a bare string never reached the model.
// D-R33-CC-SHELL-1 (claude-code-1): the shell replace is the host's own object with stdout and stderr swapped, so
// interrupted, returnCodeInterpretation and the rest reach the model as the host made them. The persisted-output fields go:
// the replace is the whole output now.
function replaceShape(ev: CanonicalHookEvent, output: string): unknown {
  const shape = ev.result?.shape;
  if (ev.tool?.canonicalName === "Bash") {
    const { persistedOutputPath: _p, persistedOutputSize: _s, ...host } = shape ?? {};
    return { interrupted: false, ...host, stdout: output, stderr: "" };
  }
  const slot = shape === undefined ? null : textSlot(shape);
  if (shape !== undefined && slot !== null) return slot.put(shape, output); // D-CC-SHAPE-1: the tool's own object
  if (ev.result?.blocks === true) return [{ type: "text", text: output }]; // D-M2-MCP-1: the MCP result shape
  return output;
}

export function encodeClaudeShape(ev: CanonicalHookEvent, d: Decision, hasReplace: boolean): HookOutput {
  const out = (fields: Record<string, unknown>): HookOutput => ({
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: ev.event, ...fields } }),
    exitCode: 0,
  });
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return out({ additionalContext: d.text });
    case "deny":
      return out({ permissionDecision: "deny", permissionDecisionReason: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason });
    case "replace":
      return hasReplace && ev.event === "PostToolUse" ? out({ updatedToolOutput: replaceShape(ev, d.output) }) : { stdout: "", exitCode: 0 };
  }
}

// D-FU-RF-DECODE-1: fields the decode cannot run without. The hooks docs list them as always present;
// a payload without one fails decode with a line naming the field (handleHook writes it to stderr and
// answers with the empty allow shape), never a silent empty answer. Every other field has a default.
const REQUIRED_FIELDS: Readonly<Partial<Record<CanonicalEventName, readonly string[]>>> = {
  PreToolUse: ["tool_name"],
  PostToolUse: ["tool_name", "tool_response"],
};

// FNV-1a 32-bit, hex: a short stable id from a string. Not for security; the hook path stays free of
// node:crypto (D-M7-HP-2).
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function requireFields(raw: unknown): void {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return; // decodeClaudeShape throws
  const p = raw as Record<string, unknown>;
  if (p.hook_event_name === undefined) throw new Error("claude-code: missing required field hook_event_name");
  for (const f of REQUIRED_FIELDS[p.hook_event_name as CanonicalEventName] ?? []) {
    if (p[f] === undefined) throw new Error("claude-code: missing required field " + f);
  }
}

export function decode(raw: unknown): CanonicalHookEvent {
  requireFields(raw);
  const ev = decodeClaudeShape(raw, "claude-code", TOOL_NAME_PREFIX, CLAUDE_SOURCES);
  // D-CC-PWSH-1: PowerShell keeps its native name and is decided, replaced and encoded as canonical Bash.
  if (ev.tool !== undefined && ev.tool.name === POWERSHELL_TOOL) ev.tool.canonicalName = SHELL_CANONICAL;
  // D-FU-RF-DECODE-1 defaults. cwd: the project dir Claude Code sets for its hooks, else the hook's own cwd.
  if (ev.cwd === "") ev.cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // tool_use_id: a label from a hash of the command and the turn, so one command in one turn keeps one source.
  if (ev.event === "PostToolUse" && ev.tool !== undefined && ev.tool.callId === undefined) {
    const cmd = typeof ev.tool.input.command === "string" ? ev.tool.input.command : JSON.stringify(ev.tool.input);
    ev.tool.callId = "h" + fnv1a(ev.tool.name + "\0" + cmd + "\0" + String(ev.turn ?? 0));
  }
  return ev;
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  return encodeClaudeShape(ev, d, true);
}
