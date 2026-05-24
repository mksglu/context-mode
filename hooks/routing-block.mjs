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
    Raw tool output floods the context window. Use context-mode MCP tools to keep raw data in the sandbox; only your printed summary enters context.
  </priority_instructions>

  <tool_selection_hierarchy>
    0. MEMORY: ${t("ctx_search")}(sort: "timeline")
       - After resume, check prior context before asking the user.
    1. GATHER: ${t("ctx_batch_execute")}(commands, queries)
       - Primary research tool. Runs commands, auto-indexes, searches. ONE call replaces many steps.
       - Each command: {label: "section header", command: "shell command"}
       - label becomes the FTS5 chunk title — descriptive labels improve search.
    2. FOLLOW-UP: ${t("ctx_search")}(queries: ["q1", "q2", ...])
       - All follow-up questions. ONE call, many queries (default relevance mode).
    3. PROCESSING: ${t("ctx_execute")}(language, code) | ${t("ctx_execute_file")}(path, language, code)
       - API calls, log analysis, data processing.
  </tool_selection_hierarchy>

  <when_not_to_use>
    - Bash with output >20 lines → use ${t("ctx_batch_execute")} or ${t("ctx_execute")}; Bash stays correct for git, mkdir, rm, mv, navigation, and other short-output commands.
    - Read for analysis → use ${t("ctx_execute_file")}; Read stays correct for files you intend to Edit (Edit needs the content in context).
    - WebFetch → use ${t("ctx_fetch_and_index")}; full network access, results indexed for ${t("ctx_search")}.
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
  return '<context_guidance>\n  <tip>\n    Reading to Edit? Read is correct — Edit needs content in context.\n    Reading to analyze/explore? Use ' + t("ctx_execute_file") + '(path, language, code) — only printed summary enters context.\n  </tip>\n</context_guidance>';
}

export function createGrepGuidance(t) {
  return '<context_guidance>\n  <tip>\n    May flood context. Use ' + t("ctx_execute") + '(language: "shell", code: "...") to run searches in sandbox. Only printed summary enters context.\n  </tip>\n</context_guidance>';
}

export function createBashGuidance(t) {
  return '<context_guidance>\n  <tip>\n    May produce large output. Use ' + t("ctx_batch_execute") + '(commands, queries) for multiple commands, ' + t("ctx_execute") + '(language: "shell", code: "...") for single. Only printed summary enters context. Bash only for: git, mkdir, rm, mv, navigation.\n  </tip>\n</context_guidance>';
}

export function createExternalMcpGuidance(t) {
  return '<context_guidance>\n  <tip>\n    External MCP tools may return large payloads (channel history, file content, search results) that flood context. After this call, if the result is large or you need to filter/aggregate it, pipe the data through ' + t("ctx_execute") + '(language, code) — only your printed summary enters context. For docs-style fetches, prefer ' + t("ctx_fetch_and_index") + '(url, source) then ' + t("ctx_search") + '(queries).\n  </tip>\n</context_guidance>';
}

// ── Backward compat: static exports defaulting to claude-code ──

const _t = createToolNamer("claude-code");
export const ROUTING_BLOCK = createRoutingBlock(_t);
export const READ_GUIDANCE = createReadGuidance(_t);
export const GREP_GUIDANCE = createGrepGuidance(_t);
export const BASH_GUIDANCE = createBashGuidance(_t);
export const EXTERNAL_MCP_GUIDANCE = createExternalMcpGuidance(_t);
