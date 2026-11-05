// impl/10 §4 + shared decode/encode pseudocode. Gemini CLI (gemini-cli@51617c1, spike-hooks-verified.md Gemini row).
// Native events: SessionStart (decoded, but no hook entry since D-FU-GCH-1) / BeforeAgent / BeforeTool / AfterTool, plus PreCompress -> aux PreCompact (impl/10 §1.4).
// Own prefix mcp_context-mode_ (single underscore, TECH-SPEC §3.8). No subagent field, no BeforeTool hint field,
// replace is AfterTool decision deny + reason (D-HA-GEMINI-REPLACE-1). Deny is the JSON `decision` field on exit 0 (DEVIATIONS D-M3-A1-1).
import type { CanonicalHookEvent, Decision, HookOutput, ToolResultInfo } from "../core/contracts/types.ts";

export const TOOL_NAME_PREFIX = "mcp_context-mode_"; // impl/10 §1.3, TECH-SPEC §3.8 Gemini row

type Event = CanonicalHookEvent["event"];
type Source = NonNullable<CanonicalHookEvent["source"]>;

// Reverse of the table.ts gemini eventMap row (impl/10 §1.4).
const GEMINI_EVENTS: Readonly<Record<string, Event>> = {
  SessionStart: "SessionStart",
  BeforeAgent: "UserPromptSubmit",
  BeforeTool: "PreToolUse",
  AfterTool: "PostToolUse",
  PreCompress: "PreCompact",
};

// Gemini SessionStartSource is startup|resume|clear only; compact never arrives (impl/10 §4 gap row).
const GEMINI_SOURCES: Readonly<Record<string, Source>> = { startup: "startup", resume: "resume", clear: "clear" };

// Events whose native output reads hookSpecificOutput.additionalContext (spike matrix; BeforeTool has none).
const HINT_EVENTS: readonly Event[] = ["SessionStart", "UserPromptSubmit", "PostToolUse"];
// Events whose native output reads decision deny/block (spike matrix: BeforeAgent, BeforeTool).
const DENY_EVENTS: readonly Event[] = ["UserPromptSubmit", "PreToolUse"];

const EMPTY: HookOutput = { stdout: "", exitCode: 0 };

// D-R38-GEMINI-REPLACE-OK-1: first line of an AfterTool replace reason; the host shows it after "Tool result blocked: ".
export const GEMINI_REPLACE_LEAD = "the tool ran and succeeded; context-mode indexed its full output, and this is the part that answers the call:\n";

function own(p: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(p, key) ? p[key] : undefined;
}

// Own tool -> bare ctx_* name; another MCP server's tool -> "mcp:<server>:<tool>" read from the payload's
// mcp_context {server_name, tool_name}, never split out of the sanitized name (DEVIATIONS D-M3-A1-2);
// the four native ids in NATIVE_TO_CANONICAL map to canonical names; other native names unchanged (impl/01 §2).
// gemini-cli 0.65.0 SHELL/READ_FILE/GREP/WEB_FETCH_TOOL_NAME -> canonical name (D-HA-GEMINI-NAMES-1).
const NATIVE_TO_CANONICAL: Readonly<Record<string, string>> = {
  run_shell_command: "Bash",
  read_file: "Read",
  grep_search: "Grep",
  web_fetch: "WebFetch",
};

function canonicalName(name: string, mcp: unknown): string {
  if (name.startsWith(TOOL_NAME_PREFIX)) return name.slice(TOOL_NAME_PREFIX.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL, name)) return NATIVE_TO_CANONICAL[name];
  if (typeof mcp !== "object" || mcp === null) return name;
  const m = mcp as Record<string, unknown>;
  const server = own(m, "server_name");
  const tool = own(m, "tool_name");
  if (typeof server !== "string" || typeof tool !== "string") return name;
  return "mcp:" + server + ":" + tool;
}

// D-R38-GEMINI-PARTS-1 (host audit gemini-6): read_many_files and MCP tools give llmContent as a Part list. When every
// Part is a text Part, the joined text is what the model sees, so it is the result text (head lines and a real query).
function partsText(llm: unknown): string | undefined {
  if (!Array.isArray(llm) || llm.length === 0) return undefined;
  const out: string[] = [];
  for (const part of llm) {
    if (typeof part === "string") { out.push(part); continue; }
    if (typeof part !== "object" || part === null) return undefined;
    const t = own(part as Record<string, unknown>, "text");
    if (typeof t !== "string") return undefined;
    out.push(t);
  }
  return out.join("");
}

// tool_response is Gemini's {llmContent, returnDisplay, error?}; a non-null `error` marks failure (DEVIATIONS D-M3-A1-3).
// D-HA-GEMINI-REPLACE-1: a string llmContent is the text the model sees, so it is the result text a replace selects
// from; a text-only Part list is joined (D-R38-GEMINI-PARTS-1); any other shape stays the JSON text, as before.
function readResult(resp: unknown): ToolResultInfo {
  const obj = typeof resp === "object" && resp !== null ? (resp as Record<string, unknown>) : undefined;
  const llm = obj === undefined ? undefined : own(obj, "llmContent");
  const text = resp === undefined ? "" : typeof resp === "string" ? resp : typeof llm === "string" ? llm : partsText(llm) ?? JSON.stringify(resp);
  const err = obj === undefined ? undefined : own(obj, "error");
  return { isError: err !== undefined && err !== null, bytes: Buffer.byteLength(text), text };
}

// D-R38-GEMINI-URL-1 (host audit gemini-5): web_fetch takes only `prompt`, with the URLs inside the free text.
// The first http(s) word of the prompt is the url the WebFetch policy and the intent read.
const URL_STARTS = ["https://", "http://"];
const URL_TRAIL = ".,;:!?)]}>'\"";
const SPACE = " \t\n\r\f\v";
function words(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (SPACE.includes(ch)) { if (cur !== "") out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out;
}
function firstUrl(prompt: unknown): string | undefined {
  if (typeof prompt !== "string") return undefined;
  for (const word of words(prompt)) {
    const lower = word.toLowerCase();
    const at = URL_STARTS.map((s) => lower.indexOf(s)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (at === undefined) continue;
    let url = word.slice(at);
    while (url.length > 0 && URL_TRAIL.includes(url[url.length - 1])) url = url.slice(0, -1);
    return url;
  }
  return undefined;
}

// D-R38-GEMINI-PARTS-1: read_many_files names its files in `include` (string list); they are the replace query.
function nativeInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  if (name === "web_fetch" && own(input, "url") === undefined) {
    const url = firstUrl(own(input, "prompt"));
    return url === undefined ? input : { ...input, url };
  }
  if (name === "read_many_files" && own(input, "file_path") === undefined) {
    const inc = own(input, "include");
    const list = Array.isArray(inc) ? inc.filter((v): v is string => typeof v === "string") : [];
    return list.length === 0 ? input : { ...input, file_path: list.join(" ") };
  }
  return input;
}

export function decode(raw: unknown): CanonicalHookEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("gemini: hook payload is not a JSON object");
  const p = raw as Record<string, unknown>;
  const native = own(p, "hook_event_name");
  const event = typeof native === "string" && Object.hasOwn(GEMINI_EVENTS, native) ? GEMINI_EVENTS[native] : undefined;
  if (event === undefined) throw new Error("gemini: unknown hook event " + String(native));
  const ev: CanonicalHookEvent = { event, agent: "gemini", sessionId: String(own(p, "session_id") ?? ""), cwd: String(own(p, "cwd") ?? "") };
  const source = own(p, "source");
  if (event === "SessionStart" && typeof source === "string" && Object.hasOwn(GEMINI_SOURCES, source)) ev.source = GEMINI_SOURCES[source];
  const prompt = own(p, "prompt");
  if (event === "UserPromptSubmit" && typeof prompt === "string") ev.prompt = prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(own(p, "tool_name") ?? "");
    const input = own(p, "tool_input");
    ev.tool = {
      name,
      canonicalName: canonicalName(name, own(p, "mcp_context")),
      input: nativeInput(name, typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}),
    };
  }
  if (event === "PostToolUse") ev.result = readResult(own(p, "tool_response"));
  return ev;
}

export function encode(ev: CanonicalHookEvent, d: Decision, _extra?: string): HookOutput {
  switch (d.kind) {
    case "allow":
      return EMPTY;
    case "hint":
      // BeforeTool has no hint field: dropped (impl/10 shared encode step 1); PreCompress is advisory.
      if (!HINT_EVENTS.includes(ev.event)) return EMPTY;
      return { stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: d.text } }), exitCode: 0 };
    case "deny":
      if (!DENY_EVENTS.includes(ev.event)) return EMPTY;
      return { stdout: JSON.stringify({ decision: "deny", reason: d.rewritten === undefined ? d.reason : d.rewritten + "\n" + d.reason }), exitCode: 0 };
    case "replace":
      // gemini-cli 0.65.0 docs/hooks/reference.md AfterTool: decision "deny" + reason, the reason replaces the tool
      // result sent to the model (D-HA-GEMINI-REPLACE-1). The host code wraps it as "Tool result blocked: <reason>"
      // with error execution_failed, and it has no other replace channel, so the reason starts with a line that tells
      // the model the tool ran and succeeded (D-R38-GEMINI-REPLACE-OK-1, host audit gemini-4).
      if (ev.event !== "PostToolUse") return EMPTY;
      return { stdout: JSON.stringify({ decision: "deny", reason: GEMINI_REPLACE_LEAD + d.output }), exitCode: 0 };
  }
}
