/**
 * Shared routing block for context-mode hooks.
 * Single source of truth — imported by pretooluse.mjs and sessionstart.mjs.
 *
 * Factory functions accept a tool namer `t(bareTool) => platformSpecificName`
 * so each platform gets correct tool names in guidance messages.
 *
 * Backward compat: static exports (ROUTING_BLOCK, READ_GUIDANCE, etc.)
 * default to claude-code naming convention.
 */

import { createToolNamer } from "./core/tool-naming.mjs";

// ── Factory functions ─────────────────────────────────────

export function createRoutingBlock(t, options = {}) {
  const { includeCommands = true } = options;
  return `
<context_window_protection>
  <priority_instructions>
    Every byte a tool returns enters your conversation memory and costs reasoning capacity for the rest of the session. The context-mode tools let you do the work in a sandbox and surface only the derived answer — the raw bytes stay out. Think-in-Code: program the analysis, do not compute it by reading raw data into your conversation.
  </priority_instructions>

  <tool_selection_hierarchy>
    0. MEMORY: ${t("ctx_search")}(sort: "timeline")
       - On resume or compaction, query prior decisions, errors, plans, user prompts before asking the user — auto-captured session memory is searchable.
    1. GATHER: ${t("ctx_batch_execute")}(commands, queries)
       - Primary research tool. Runs commands in parallel, auto-indexes each output, and (when queries are passed) returns matching sections in the same round trip — no follow-up search call.
       - Each command: {label: "section header", command: "shell command"}; the label becomes the FTS5 chunk title — descriptive labels improve search.
    2. FOLLOW-UP: ${t("ctx_search")}(queries: ["q1", "q2", ...])
       - Multiple related questions about anything already indexed (your captures + session memory). Batch every question in one array; the ranking pipeline runs per-query and the round-trip cost is paid once.
    3. PROCESSING: ${t("ctx_execute")}(language, code) | ${t("ctx_execute_file")}(path, language, code)
       - Derive answers FROM data: filter, count, aggregate, parse, transform. Only what you console.log() enters your conversation; the raw bytes stay in the sandbox.
  </tool_selection_hierarchy>

  <when_not_to_use>
    - You intend to PROCESS the output (filter, count, parse, aggregate) → use ${t("ctx_batch_execute")} or ${t("ctx_execute")}. Bash stays correct when you intend to OBSERVE a short fixed output (git status on a clean tree, whoami, pwd) or when you are mutating state (git, mkdir, rm, mv, navigation).
    - You want to analyze, summarize, or extract from a file → use ${t("ctx_execute_file")}. Read stays correct when you intend to Edit the file (Edit needs the exact bytes in your conversation to match against).
    - WebFetch → use ${t("ctx_fetch_and_index")}; full network access, results indexed for ${t("ctx_search")}, raw page bytes never enter your conversation.
    - ${t("ctx_execute")} and ${t("ctx_execute_file")} for file writes → these run code in a subprocess and discard the sandbox FS; they are for analysis, processing, and computation only.
  </when_not_to_use>

  <file_writing_policy>
    File writes use the native Write or Edit tool — ${t("ctx_execute")}, ${t("ctx_execute_file")}, and Bash subprocesses do not persist edits to the host filesystem.
    Applies to all file types: code, configs, plans, specs, YAML, JSON, markdown.
  </file_writing_policy>

  <output_constraints>
    <artifact_policy>
      Write artifacts (code, configs, PRDs) to files. Return only: file path + 1-line description.
    </artifact_policy>
  </output_constraints>
  <session_continuity>
    Skills, roles, and decisions set during this session remain active until the user revokes them.
    Do not drop behavioral directives as context grows.
  </session_continuity>
${includeCommands ? `
  <ctx_commands>
    "ctx stats" | "ctx-stats" | "/ctx-stats" | context savings question
    → Call stats MCP tool, display full output verbatim.

    "ctx doctor" | "ctx-doctor" | "/ctx-doctor" | diagnose context-mode
    → Call doctor MCP tool, run returned shell command, display as checklist.

    "ctx upgrade" | "ctx-upgrade" | "/ctx-upgrade" | update context-mode
    → Call upgrade MCP tool, run returned shell command, display as checklist.

    "ctx purge" | "ctx-purge" | "/ctx-purge" | wipe/reset knowledge base
    → Call purge MCP tool with confirm: true. Warn: irreversible.

    After /clear or /compact: knowledge base preserved. Tell user: "context-mode knowledge base preserved. Use \`ctx purge\` to start fresh."
  </ctx_commands>
` : ''}
</context_window_protection>`;
}

export function createReadGuidance(t) {
  return '<context_guidance>\n  <tip>\n    Reading to Edit the file? Read is correct — Edit needs the exact bytes in your conversation to match against.\n    Reading to analyze, summarize, or extract from the file? Use ' + t("ctx_execute_file") + '(path, language, code) — the bytes stay in the sandbox and only what your code prints enters your conversation.\n  </tip>\n</context_guidance>';
}

export function createGrepGuidance(t) {
  return '<context_guidance>\n  <tip>\n    Grep results may be larger than you expect. When you intend to count, filter, or aggregate matches (not just spot-check one), run the search through ' + t("ctx_execute") + '(language: "shell", code: "...") — the raw match list stays in the sandbox and only your derived answer enters your conversation.\n  </tip>\n</context_guidance>';
}

export function createBashGuidance(t) {
  return '<context_guidance>\n  <tip>\n    When you intend to PROCESS the output (filter, count, parse, aggregate), use ' + t("ctx_batch_execute") + '(commands, queries) for multiple commands or ' + t("ctx_execute") + '(language: "shell", code: "...") for one — the raw output stays in the sandbox and only what you print enters your conversation. Bash stays the right surface when you intend to OBSERVE a short fixed output or when you are mutating state (git, mkdir, rm, mv, navigation).\n  </tip>\n</context_guidance>';
}

export function createExternalMcpGuidance(t) {
  return '<context_guidance>\n  <tip>\n    External MCP tools commonly return large payloads (channel history, file content, search results) that enter your conversation in full. When you intend to filter, count, or aggregate that data, pipe it through ' + t("ctx_execute") + '(language, code) — the raw payload stays in the sandbox and only the derived answer enters your conversation. For docs-style fetches you will want to query later, prefer ' + t("ctx_fetch_and_index") + '(url, source) then ' + t("ctx_search") + '(queries).\n  </tip>\n</context_guidance>';
}

// ── Backward compat: static exports defaulting to claude-code ──

const _t = createToolNamer("claude-code");
export const ROUTING_BLOCK = createRoutingBlock(_t);
export const READ_GUIDANCE = createReadGuidance(_t);
export const GREP_GUIDANCE = createGrepGuidance(_t);
export const BASH_GUIDANCE = createBashGuidance(_t);
export const EXTERNAL_MCP_GUIDANCE = createExternalMcpGuidance(_t);
