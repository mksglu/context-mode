// impl/01 §3, impl/00 §3.2, TECH-SPEC §11, DECISIONS-r9. Every constant lives here; no other module writes these literals.
import type { AgentId } from "./agents.js";

export const SERVER_KEY = "context-mode"; // TECH-SPEC §3.8 rule 3
export const TOOL_ORDER = Object.freeze(["ctx_execute","ctx_batch","ctx_index","ctx_search","ctx_resume","ctx_stats","ctx_doctor","ctx_upgrade","ctx_purge"] as const); // PRD §8, Q3b
/** D-HL-NAMES-1: a fixed hook text with each own tool name as the host calls it (prefix + name), by split/join. */
export function prefixToolNames(text: string, prefix: string): string {
  if (prefix === "") return text;
  let out = text;
  for (const name of TOOL_ORDER) out = out.split(name).join(prefix + name);
  return out;
}

// Byte caps
export const OUTPUT_CAP = 16384; // Q2, ADR-0008, ADR-0016: one cap for replies, replace path and Read deny threshold
// D-EXEC-PREVIEW-1: a ctx_execute reply for output that does not fit OUTPUT_CAP is a preview of at most this many bytes;
// the whole output is indexed and the reply ends with the ctx_search call that reaches the rest.
export const EXEC_PREVIEW_BYTES = 4096;
export const STATE_BUDGET = 2048; // ADR-0009 §4
export const RESUME_CAP = 2048; // ADR-0009, GP6
export const REPORT_CAP = 4096; // ADR-0014
export const POINTER_MIN = 640; // ADR-0009 §4
export const STATE_CLOSE_TAG = "</context_mode_state>"; // impl/06 §3 block close line
export const INDEX_WRITE_CHUNK = 1048576; // PRD §4
export const SYNC_INDEX_MAX_BYTES = 65536; // DECISIONS-r9 F1
// D-M7-SV-1: the PostToolUse replace path has its own sizes, separate from OUTPUT_CAP (which stays the cap for
// replies and the Read deny threshold). A result over REPLACE_TRIGGER_BYTES is indexed whole and the model gets
// whole BM25-selected chunks of at most REPLACE_CHUNK_BYTES each, within REPLACE_RETURN_BYTES, plus the more line.
// D-R48-TRIGGER-1 (#1326 coreycoburn): a documented setting, env CTX_REPLACE_TRIGGER_BYTES (a positive safe integer),
// read once at process start; default 4096. Bench (bench/replay.mjs, 602 files, 28,390 calls, 37.9 MB): trigger 4096
// saves 41.99% (1,878 replaces), 6144 saves 30.89% (998), 8192 saves 23.34% (582): raising it costs a quarter to
// half of the saving, so the default stays; a user who wants 2-6 KB outputs whole sets the env var.
export const REPLACE_TRIGGER_BYTES_DEFAULT = 4096;
export const REPLACE_TRIGGER_ENV = "CTX_REPLACE_TRIGGER_BYTES";
export function readReplaceTrigger(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return REPLACE_TRIGGER_BYTES_DEFAULT;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : REPLACE_TRIGGER_BYTES_DEFAULT;
}
export const REPLACE_TRIGGER_BYTES = readReplaceTrigger(process.env[REPLACE_TRIGGER_ENV]);
// D-R41-READ-OFFSET-1 (#1314): a read-like tool (canonical name) called with a range key is the user's own window:
// PostToolUse lets it through whole. Claude Code, Pi, Gemini: offset/limit; VS Code read_file and Copilot view map to them.
export const RANGE_READ_TOOLS = Object.freeze(["Read", "view"]);
export const READ_RANGE_KEYS = Object.freeze(["offset", "limit", "view_range"]);
export const REPLACE_RETURN_BYTES = 96; // D-M7-SV-3: was 512 (D-M7-SV-2), 1024 before; sweeps in DEVIATIONS
// D-M2-JSON-1: a parser-found shape digest (schema, counts, whole rows) has its own budget, independent of the handle line.
export const SHAPE_RETURN_BYTES = 256;
export const REPLACE_CHUNK_BYTES = 48; // D-M7-SV-3: was 256; two whole chunks fit in the return budget
// D-CR3-HANDLE-1: the last line of every replacement (it replaces the more line and the D-CR2-HANDLE-1 line).
// One short line: the exact call over the stored source by its short id, then the full size.
// D-R4-HANDLE-LABEL-1: no label text; the short id is the only name the line carries.
// D-HL-NAMES-1: the tool name carries the host's toolNamePrefix; the intent is never rewritten.
// D-HA-GEMINI-HINT-1: `asked` (prompt words the output holds) is a second query; the intent query stays as is.
export function REPLACE_HANDLE_LINE(intent: string, handle: string, bytes: number, prefix = "", asked = ""): string {
  const queries = asked === "" ? [intent] : [intent, asked];
  return prefix + "ctx_search({queries:[" + queries.map((q) => JSON.stringify(q)).join(",") + "], source:" + JSON.stringify(handle) + "}) searches the whole output (" + bytes + " B).";
}
export const HANDLE_PROMPT_WORDS = 3; // D-HA-GEMINI-HINT-1: prompt words the handle-line query may add
export const MAX_CHUNK_BYTES = 4096; // DECISIONS-r9 §C
export const SEARCH_PAGE_SIZE = 20; // ADR-0009 §8.1 rule 3; DECISIONS-r9 M15
// D-UNIFIED-MEMORY-1, D-MEMORY-SOURCE-1: the prefix a memory file's label carries in a reply ("memory AGENTS.md #0").
export const MEMORY_LABEL_PREFIX = "memory ";
export const SEARCH_REPLY_HITS = 5; // D-SEARCH-REPLY-1: hits in one ctx_search relevance reply; `More:` pages the rest (SEARCH_PAGE_SIZE stays the decision-list page)
export const SNIPPET_MAX_BYTES = 800; // DECISIONS-r9 M21: under floor(OUTPUT_CAP / SEARCH_PAGE_SIZE) = 819
export const SNIPPET_CODE_MAX_BYTES = 2048; // D-SEARCH-7: a whole fenced block up to this; 7 fit one OUTPUT_CAP reply
export const READ_MAX_LINES = 200; // DECISIONS-r8: hint text only, never enforced (READ_HINT_BYTES retired)

// Prompt surface (chars)
export const INSTRUCTIONS_CAP = 2048; // Q5
export const DESCRIPTION_CAP = 1024; // Q5
export const SURFACE_CAP = 8000; // Q5, Q13

// Compaction scoring (ADR-0009, DECISIONS-r6 D1, DECISIONS-r9 §C)
export const MAX_CANDIDATES = 85; // per section, ADR-0009 §3
export const MAX_CANDIDATES_TOTAL = 340; // ADR-0009 §4
// DECISIONS-r11 (A): decision rows score (700: under an open error, over a prompt); they were never candidates before.
export const WEIGHT: Readonly<Record<"toolerr" | "decision" | "prompt" | "edit" | "index", number>> = Object.freeze({ toolerr: 900, decision: 700, prompt: 500, edit: 400, index: 200 });
export const DECAY_HALF_LIFE_TURNS = 4;
export const RATIO_SECTION_DECAY = 0.7;
// r3-ledger pickUnits (recall.ts): MMR picks by relevance (0.7) minus redundancy (0.3), lambda 0.7.
export const MMR_RELEVANCE_WEIGHT = 0.7;
export const MMR_REDUNDANCY_WEIGHT = 0.3;
// DECAY_X1000[age] = round(1000 * (0.25 + 0.75 * 2^(-age / DECAY_HALF_LIFE_TURNS))), ages 0..127.
// DECISIONS-r9 M6 (later than impl/01 A-C1 "0-64, computed at load") wins: a literal, checked-in 128-entry
// integer table; the unit test recomputes the formula; callers clamp age > 127 to entry 127.
export const DECAY_X1000: readonly number[] = Object.freeze([
  1000,881,780,696,625,565,515,473,438,408,383,361,344,329,316,306,
  297,289,283,278,273,270,267,264,262,260,258,257,256,255,254,253,
  253,252,252,252,251,251,251,251,251,251,251,250,250,250,250,250,
  250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,
  250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,
  250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,
  250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,
  250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,
]);
export const COMPACT_POINTER_LINE = 'context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").'; // DECISIONS-r6 D6; byte-stable
export const RRF_K = 60; // ADR-0009 §8.3/§9, DECISIONS-r7 R1, DECISIONS-r9 M20
export const SEARCH_P95_MS = 30; // ADR-0009 §9, DECISIONS-r7 R5
// D-CR3-HANDLE-1: a source handle is SOURCE_ID_PREFIX plus at most this many base-36 digits (parseSourceHandle).
export const SOURCE_HANDLE_MAX_DIGITS = 10;

// Time budgets (ms)
export const EXEC_TIMEOUT_MS = 600000; // S-TIMEOUT, Q8: default and max
export const KILL_GRACE_MS = 1000; // GP4
// D-1337-EXIT-SETTLE-1 (#1337): after the child exits, runProcess waits this long for the pipes to end; each data chunk restarts it.
export const PIPE_EOF_GRACE_MS = 250;
// D-1337-EXIT-SETTLE-1: the most time the pipe drain may take after exit, so a survivor that keeps writing cannot hold the call.
export const PIPE_DRAIN_MAX_MS = 2000;
export const DB_TIMEOUT_MS = 5000; // ADR-0002, PRD §4
export const DB_WAL_SUFFIX = "-wal"; // impl/02 §6.1 step 4, DEVIATIONS D-M1-T5-1: WAL sibling of context.db
export const DB_SHM_SUFFIX = "-shm"; // impl/02 §6.1 step 4, DEVIATIONS D-M1-T5-1: shared-memory sibling of context.db
export const DB_TMP_SUFFIX = ".tmp"; // DEVIATIONS D-M2-CI-3: private build name of a new context.db before linkSync publishes it
export const SQLITE_PRIMARY_CODE_MASK = 255; // DEVIATIONS D-M1-T5-1: extended result code -> primary code (low byte)
export const SQLITE_CORRUPT_CODE = 11; // impl/02 §6.1 error cases: SQLITE_CORRUPT -> DB_CORRUPT
export const SQLITE_NOTADB_CODE = 26; // DEVIATIONS D-M1-T5-1: SQLITE_NOTADB (garbage file) -> DB_CORRUPT
export const HOOK_P95_MS = 40; // GS6, DECISIONS-r9 V14: Claude Code wall
export const HOOK_CPU_OVER_NODE_MS = 20; // GS6: command hooks, CPU over bare Node
export const HOOK_COMBINED_P95_MS = 60; // GS6, A31: command hooks, wall
export const HOOK_TIMEOUT_MS = 5000; // impl/10 A2: hookTimeoutMs for spawn-based agents
export const EXIT_SIGTERM_MS = 2000; // GP9, #862
export const EXIT_SIGKILL_MS = 5000; // GP9, #862
export const GP9_EXIT_MS = 2000; // impl/14 harness lifecycle budget; TECH-SPEC GP9 "exit < 2 s"
export const COLD_START_MS = 1000; // GP4
export const TOOLS_TTL_MS = 3600000; // ADR-0007 (A1)
export const IN_PROCESS_TIMEOUT_MS = 0; // impl/10 §1.3: pi/opencode hookTimeoutMs "n/a (in-process, no spawn)"
export const MS_PER_DAY = 86400000; // DEVIATIONS D-M1-3: day-to-ms factor for the retention cutoffs

// Store (impl/02 §0; DEVIATIONS D-M1-3: impl/00 names NODE_MIN and INDEX_WRITE_CHUNK cover the rest)
export const PROJECT_KEY_HEX_LEN = 16; // impl/00 A5: first 16 hex chars of sha256(git common dir realpath)
export const SCHEMA_VERSION = 6; // ADR-0002 decision 2: PRAGMA user_version; 2 = cost dedup index (D-M5-arch-2); 3 = chunks title + porter (D-SEARCH-3); 4 = trigram table + vocab (D-SEARCH-4); 5 = line_units (r3-ledger); 6 = path labels with forward slashes (D-PATH-LABEL-1)
export const RETENTION_IDLE_DAYS = 30; // impl/02 A-S1: row-level, age since last access
export const RETENTION_SIZE_CAP_BYTES = 524288000; // impl/02 A-S2 (Q7b): 500 MB per project
export const PROJECT_DEAD_IDLE_DAYS = 14; // DECISIONS-r9 V22 (#1024): project-level sweep, dead owner
export const PROJECTS_DIR_NAME = "projects"; // PRD §4: <DATA_ROOT>/projects/<projectKey>/
export const DB_FILE_NAME = "context.db"; // PRD §4: one SQLite file per project
export const OWNERS_DIR_NAME = "owners"; // impl/02 §7, DEVIATIONS D-M1-T6-1: <projectDir>/owners/<serverId>.pid
export const OWNER_PID_EXT = ".pid"; // impl/02 §7, DEVIATIONS D-M1-T6-1: owner file extension
export const GIT_DIR_NAME = ".git"; // DEVIATIONS D-M1-T3-3: containmentRoot of a non-bare repo
export const GIT_WORKTREE_LINE_PREFIX = "worktree "; // DEVIATIONS D-M2-R7-1: `git worktree list --porcelain` path line
export const GITDIR_FILE_PREFIX = "gitdir: "; // D-M3-F-4: a .git file (linked worktree, submodule) names its git dir
export const GIT_COMMONDIR_FILE = "commondir"; // D-M3-F-4: <gitdir>/commondir of a linked worktree
export const GIT_HEAD_FILE = "HEAD"; // D-M3-F-4: a git dir has a HEAD file
export const WORKSPACE_FOLDER_FLAG = "--workspace-folder"; // DEVIATIONS D-M1-5: VS Code ${workspaceFolder} launch arg

// Sandbox and tools-exec (M2; impl/03 §2 step 3, §6 step 5; impl/04 §2.1, §2.3 steps 9, 11, 15)
export const EXEC_LANGUAGES = Object.freeze(["shell", "powershell", "javascript", "typescript", "python"] as const); // impl/04 §2.1, A9: named runtimes; any PATH runtime is also accepted
// A9: runtimes that take code with `-c`. D-DENY-SHELL-LANG-1: a ctx_execute language of this family (or "shell") gets the Bash deny rules.
export const SHELL_FAMILY: readonly string[] = Object.freeze(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
export const PATHEXT_DEFAULT = ".COM;.EXE;.BAT;.CMD"; // impl/03 §2 step 3: Windows PATHEXT when the env var is unset
export const FETCH_MAX_HOPS = 5; // impl/03 §6 step 5: redirect hops; one more is FETCH_FAILED
export const SOURCE_LABEL_MAX_CHARS = 80; // impl/04 §2.3 step 15, §4 step 7: label = "<tool>:" + first line of the code, at most 80 chars
// D-1337-EXIT-SETTLE-1: appended to a ctx_execute reply when the command exited but a background process still held its output pipes.
export const BACKGROUND_HOLD_NOTE = "note: the command ended while a background process still held its output; that process was stopped, so output it would write later does not exist.";
export const CANCELLED_LINE = "Cancelled."; // impl/04 §2.3 step 11: reply on ctx.signal abort (not an ERROR_TEXT key)
export const BACKGROUND_REPLY_PREFIX = "started in background, pid "; // impl/04 §2.3 step 9, A11 (DECISIONS-r9 S5): + decimal pid, nothing after
export const PLAIN_OUTPUT_ENV: Readonly<Record<string, string>> = Object.freeze({ NO_COLOR: "1", FORCE_COLOR: "0" }); // impl/04 §2.3 step 6: plain child output (ctx_execute and run.mjs, D-M3-X1-4)

// impl/04 §4, ADR-0016 case B: the run.mjs wrapper and its search.mjs follow-up (DEVIATIONS D-M3-X1-1..5).
export const RUN_USAGE_LINE = "Usage: run.mjs <base64>"; // §4 step 1
export const SEARCH_USAGE_LINE = "Usage: search.mjs <source-id> <terms>"; // D-M3-X1-2
export const RUN_FAIL_EXIT = 1; // §4 steps 1, 4: usage error or deny, the command never runs
export const RUN_TIMEOUT_EXIT = 124; // §4 step 11, A18: POSIX timeout convention
export const RUN_LABEL_PREFIX = "run.mjs:"; // §4 step 7 source label, + first line of the command
export const RUN_MORE_PREFIX = "more: node "; // §4 step 9, ADR-0016 template: + "<bundle>/search.mjs" <source-id> "<terms>"
export const SEARCH_WRAPPER_FILE = "search.mjs"; // ADR-0016 more: line target, next to run.mjs (D-M3-X1-2)
export const RUN_WRAPPER_AGENT = "claude-code"; // D-M3-X1-3: case B deny + rewrite is the Claude Code mechanism (ADR-0016 Q3)
export const RUN_SESSION_PREFIX = "mcp:"; // §4 step 5, 00 A8: no MCP _meta, + a process-local id
// D-CR2-SID-1: the env var a host sets in the MCP server process to the session id its hooks receive.
// Claude Code 2.1.303 sets CLAUDE_CODE_SESSION_ID (probe: equals the hook payload session_id). A host not listed keeps mcp:<serverId>.
export const HOST_SESSION_ENV: Readonly<Partial<Record<string, string>>> = Object.freeze({ "claude-code": "CLAUDE_CODE_SESSION_ID" });

// Runtime
export const NODE_MIN = "24.15.0"; // S-NODE
export const DATA_ROOT = "~/.context-mode"; // PRD §4; the store module expands "~"
export const DATA_DIR_ENV = "CONTEXT_MODE_DATA_DIR"; // #1318 D-DATA-DIR-ENV-1: set and not empty, it replaces DATA_ROOT for every read and write
export const INTERNAL_ERROR_LINE = "Internal error. Fix: run ctx_doctor."; // impl/11 §5 step 7d, §7 table
export const REQUIRE_SECURITY_ENV = "CONTEXT_MODE_REQUIRE_SECURITY"; // v1 issue #468; DECISIONS-r9 E2

// Subagent tool-set sources (impl/08 §5.2, ADR-0016 "How the subagent's tools are known", DEVIATIONS D-M3-E3-1)
export const HOST_CONFIG_DIR_NAME = ".claude"; // project and user agents: <root>/.claude/agents/<type>.md
export const AGENTS_DIR_NAME = "agents"; // also the plugin's own agents/ dir under its installPath
export const AGENT_FILE_EXT = ".md";
export const HOST_PLUGINS_DIR_NAME = "plugins"; // ~/.claude/plugins/installed_plugins.json
export const INSTALLED_PLUGINS_FILE = "installed_plugins.json";
export const PLUGIN_AGENT_SEPARATOR = ":"; // plugin agent type "<plugin>:<agent>"
export const PLUGIN_KEY_SEPARATOR = "@"; // installed_plugins.json key "<plugin>@<marketplace>"
// D-DOC-D3-SCOPE-1: Claude Code 2.1.274 writes scope + projectPath per installed_plugins.json entry and counts an
// enabledPlugins value only when it is true; settings merge local > project > user. A local/project entry applies
// only to its projectPath. Lower rank wins. A plugin MCP server gets CLAUDE_PLUGIN_ROOT = the dir the host runs.
export const CLAUDE_PLUGIN_ROOT_ENV = "CLAUDE_PLUGIN_ROOT";
export const CLAUDE_PROJECT_DIR_ENV = "CLAUDE_PROJECT_DIR";
export const ENABLED_PLUGINS_KEY = "enabledPlugins";
export const SETTINGS_LOCAL_FILE = "settings.local.json";
export const DEFAULT_PLUGIN_SCOPE = "user"; // an entry without scope (record v1) is a user install
export const PROJECT_PLUGIN_SCOPES: readonly string[] = Object.freeze(["local", "project"]);
export const PLUGIN_SCOPE_RANK: Readonly<Record<string, number>> = Object.freeze({ local: 0, project: 1, user: 2, managed: 2 });
export const FRONTMATTER_FENCE = "---";
export const FRONTMATTER_TOOLS_KEY = "tools";
export const FRONTMATTER_DISALLOWED_KEY = "disallowedTools";
export const MCP_SERVER_TOOL_PREFIX = "mcp__"; // Claude-shape MCP name; a bare "mcp__<server>" rule covers all its tools
export const MCP_NAME_JOIN = "__"; // Claude-shape join between server and tool name
export const GEMINI_MCP_PREFIX = "mcp_"; // generateValidName(): "mcp_" + server + "_" + tool (ADR-0016 Gemini row)
export const GEMINI_NAME_EXTRA_CHARS = "_-.:"; // kept besides A-Z a-z 0-9; any other char becomes "_"

// D-M7-RR-2: no caller since the hints are retired; kept because tests/contracts pins it.
// MCP_HINT_EVERY: 10, or env CTX_MCP_HINT_EVERY when it is a positive safe integer (Q1, A-C4).
// Read once at process start (impl/09 A20).
const MCP_HINT_EVERY_DEFAULT = 10;
function readHintEvery(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return MCP_HINT_EVERY_DEFAULT;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : MCP_HINT_EVERY_DEFAULT;
}
export const MCP_HINT_EVERY = readHintEvery(process.env.CTX_MCP_HINT_EVERY);

// Live E2E harness (ADR-0017, ADR-0013)
export const LIVE_MODEL = "claude-sonnet-5";
export const LIVE_EFFORT = "low";
export const LIVE_BUDGET_USD = 0.25;
export const LIVE_SKIP_LIMIT = 3;
export const README_MAX_LINES = 700; // ADR-0015: CI cap on README.md length (D-README-THESIS-1: 200 -> 400; D-README-DWELL-1: 400 -> 600; D-TIC-README-1: 600 -> 650; D-TIC-README-3: 650 -> 700)

// Enforcement (M3; impl/08 §2.3 step 2a, §2.4, §6.1 steps 3, 5b, 5d, 6, §6.2; DEVIATIONS D-M3-arch-5:
// the text templates are fixed strings here; the Read deny is a src/prompt template, D-DU-DENY-1).
export const MAX_NEST_DEPTH = 32; // impl/08 §2.3 step 2a, ADR-0008 "Parse errors": deeper -> construct "nesting-too-deep"

// impl/08 §6.1 step 6: Read (or one-file shell dump) over OUTPUT_CAP with no offset/limit. The text is the
// src/prompt/hooks/read-deny.md template (D-DU-DENY-1, src/core/policy/read-deny.ts); this caps its fixed bytes.
export const READ_DENY_FIXED_CAP = 120;
// D-R48-OWN-FILE-1 (#1326): the shared skill dir of the Agent Skills layout (~/.agents/skills), read by several agents.
export const SHARED_SKILLS_DIR = Object.freeze([".agents", "skills"] as const);

// impl/08 §6.2, ADR-0008 "Deny message" (kept verbatim). Lines, joined by "\n":
//   DENY_PREFIX + DENY_WHAT[kind] + DENY_WHAT_SUFFIX
//   DENY_RUN_HERE_LINE
//   DENY_TOOL_LABEL + row.toolNamePrefix + tool name
//   {"language":"shell","code":<cmd>,"intent":<description or DENY_INTENT_DEFAULT>}
export const DENY_PREFIX = "context-mode: ";
export const DENY_WHAT: Readonly<Record<"curl" | "http" | "build" | "webfetch", string>> = Object.freeze({
  curl: "This curl/wget call", http: "This inline HTTP call", build: "This build command", webfetch: "WebFetch",
});
export const DENY_WHAT_SUFFIX = " sends its body into the conversation.";
export const DENY_RUN_HERE_LINE = "Run it here instead; the full output is indexed and only the part that matches your intent comes back.";
export const DENY_TOOL_LABEL = "Tool: ";
export const DENY_INTENT_DEFAULT = "state what you need";
export const DENY_EXEC_TOOL = "ctx_execute"; // curl/http/build alternative
// WebFetch alternative: index the URL, then search it. impl/08 B1: v2 names only (ctx_index absorbs the retired v1 fetch tool).
export const DENY_WEBFETCH_TOOLS = Object.freeze(["ctx_index", "ctx_search"] as const);

export const USER_DENY_REASON_PREFIX = "Blocked by security policy: matches deny pattern "; // impl/08 §6.1 step 3, v1 text verbatim; + pattern
export const POLICY_UNREADABLE_LINE = "context-mode: your deny rules could not be read. Fix: run ctx_doctor."; // DECISIONS-r9 E2
export const PARSE_ERROR_DENY_LINE = "context-mode: could not parse this command; it may be blocked by your own rules. Run it through ctx_execute instead."; // impl/08 §6.1 step 5b, Q4

// D-HNE-GUARD-1: a hook never errors. On any internal failure it exits 0 with a valid decision for its host, built from
// this table with no store access: own ctx_* tools and tools that cannot flood the context are allowed; shell, large
// Read, grep and fetch tools are denied with the usual redirect plus one line naming the error and "run ctx_doctor".
export const HOOK_ERROR_LOG_FILE = "hook-errors.log"; // <DATA_ROOT>/hook-errors.log, one JSON line per failure, append only
export const HOOK_LOG_TAIL_BYTES = 65536; // ctx_doctor reads only this tail of the log; the file itself is never cut
export const HOOK_FAIL_TOOL_KEYS = Object.freeze(["tool_name", "toolName", "tool"] as const); // tool name key of every host payload
export const HOOK_FAIL_EVENT_KEYS = Object.freeze(["hook_event_name", "hookEventName", "type"] as const);
export const HOOK_FAIL_INPUT_KEYS = Object.freeze(["tool_input", "toolArgs", "input", "args"] as const);
export const HOOK_FAIL_CWD_KEYS = Object.freeze(["cwd", "directory"] as const);
export const HOOK_FAIL_PRE_EVENTS = Object.freeze(["pretooluse", "beforetool", "tool_call", "execute.before", "tool.execute.before"]); // lower case; every host's pre-tool event name, next to the adapter row's own eventMap name
export const HOOK_FAULT_ENV = "CM_HOOK_FAULT"; // test seam: one of HOOK_FAULT_STAGES makes that stage throw once, so every failure path is testable
export const HOOK_FAULT_STAGES = Object.freeze(["decode", "project", "policy", "store", "encode"] as const);
export const HOOK_FAIL_TOOLS = Object.freeze({
  shell: Object.freeze(["Bash", "bash", "shell"]),
  read: Object.freeze(["Read", "read_file"]),
  grep: Object.freeze(["Grep", "grep_search"]),
  fetch: Object.freeze(["WebFetch", "web_fetch", "fetch"]),
});
export function HOOK_FAIL_LINE(label: string, prefix: string): string { return `${DENY_PREFIX}the hook failed (${label}). Fix: run ${prefix}ctx_doctor.`; } // prefix: the host's own tool prefix (D-HL-NAMES-1)
export const HOOK_FAIL_REDIRECT = Object.freeze({
  read: "Read the file in parts with offset and limit, or process it with ctx_execute(language, code); only what you print comes back.",
  shell: "Run the command with ctx_execute(language, code) or ctx_batch instead; only the part that matches your intent comes back.",
  grep: "Search with ctx_execute(language, code), or index the files with ctx_index and query them with ctx_search.",
  fetch: "Index the URL with ctx_index and query it with ctx_search.",
});
export function D5_LAST_HOOK_ERROR(ts: string, stage: string, label: string): string { return `; last hook error ${ts} at ${stage} (${label}), stack in ${HOOK_ERROR_LOG_FILE}`; }
// D-D5-PAST-1: a line older than the start of this doctor run is history, shown with its time, never as a current failure.
export function D5_PAST_HOOK_ERROR(ts: string, stage: string, label: string): string { return `; past hook error ${ts} at ${stage} (${label}), before this run, stack in ${HOOK_ERROR_LOG_FILE}`; }

// impl/08 §6.1 step 5d, DECISIONS-r9 E4. D-M7-RR-2: step 5d (bounded -> no hint) is retired with the hints; the
// set stays only because tests/contracts pins it (not owned by this change).
// E3: CONTEXT_MODE_BASH_NUDGE_MIN_COMMAND_BYTES is not ported.
export const BOUNDED_COMMANDS = Object.freeze(["pwd", "whoami", "uname", "id", "realpath", "ln"] as const);
export const BOUNDED_GIT_SUBCOMMANDS = Object.freeze(["status"] as const); // `git status`
export const VERSION_PROBE_FLAGS = Object.freeze(["--version", "-v"] as const); // any argv0 whose only arg is one of these
export const BOUNDED_UNLESS_VERBOSE = Object.freeze(["cp", "mv", "rm"] as const);
export const VERBOSE_FLAGS = Object.freeze(["-v", "--verbose"] as const); // any of these in args removes BOUNDED_UNLESS_VERBOSE commands out of the set

// impl/08 §2.4: closed jq filter whitelist, checked by walking the string (no regex). After stripping quotes the
// filter is exactly `identity`, exactly `length`, a dotted path (fieldSep + [A-Za-z0-9_]+, repeated), or a dotted
// path followed by `pipeLength` (spaces around "|" allowed). Anything else -> not a bounded sink.
export const JQ_WHITELIST: Readonly<{ identity: "."; length: "length"; pipeLength: "| length"; fieldSep: "." }> =
  Object.freeze({ identity: ".", length: "length", pipeLength: "| length", fieldSep: "." });

// TOOL_PREFIX_SLOT is replaced by row.toolNamePrefix in deny and resume texts. The PreToolUse hint texts
// (BASH/GREP/READ/MCP_HINT, HINT_KEY) are retired: D-M7-RR-2, DECISIONS-r10 (2).
export const TOOL_PREFIX_SLOT = "{prefix}";
export const DENY_WEBFETCH_JOIN = ", then "; // "Tool: <p>ctx_index, then <p>ctx_search"
export const POLICY_UNREADABLE_WARNING = "context-mode: your deny rules could not be read, so they are not applied. Fix: run ctx_doctor."; // E2, flag unset (stderr)
// ADR-0008 item 6, #1006/#945: WebFetch to these hosts (or a subdomain) is never denied (claude.ai artifacts).
export const NEVER_DENY_HOSTS = Object.freeze(["claude.ai", "claude.site", "claudeusercontent.com"] as const);

// impl/08 §6.1 step 5c rule tables (argv0 compared lowercased, after unwrap and baseName).
export const CURL_COMMANDS = Object.freeze(["curl", "wget"] as const);
// ADR-0008 "#166 silent/verbose curl checks stay" (v1 routing.mjs:745-765): a body that goes to a file or a bounded
// sink is still a deny when the call is not silent (progress meter on stderr) or is verbose.
export const CURL_SILENT_FLAGS: Readonly<Record<"curl" | "wget", { short: string; long: string }>> =
  Object.freeze({ curl: { short: "s", long: "--silent" }, wget: { short: "q", long: "--quiet" } });
export const CURL_VERBOSE_FLAGS = Object.freeze(["-v", "--verbose", "--trace", "--trace-ascii"] as const);
export const CURL_DUMP_HEADER_FLAG = "-D"; // "-D -": headers to stdout
export const BUILD_COMMANDS = Object.freeze(["gradlew", "gradle", "mvnw", "mvn", "sbt"] as const);
// Inline HTTP: FETCH_CALL + one of FETCH_QUOTES + HTTP_SCHEME, or any INLINE_HTTP_CALLS substring, in a command's raw text.
export const FETCH_CALL = "fetch(";
export const FETCH_QUOTES = "'\"`";
export const HTTP_SCHEME = "http";
export const INLINE_HTTP_CALLS = Object.freeze(["requests.get(", "requests.post(", "requests.put(", "http.get(", "http.request("] as const);
// impl/08 §6.1 step 6a (DECISIONS-r8 "Other hosts"): one-file shell dumps on hosts with no Read tool.
export const SHELL_DUMP_COMMANDS = Object.freeze(["cat", "head", "tail", "sed", "less", "jq", "bat", "more"] as const);
export const DUMP_COUNT_COMMANDS = Object.freeze(["head", "tail"] as const); // bound by a count flag
export const DUMP_COUNT_FLAGS = Object.freeze(["-n", "-c", "--lines", "--bytes"] as const); // also "-n20", "--lines=20", "-20"
export const SED_COMMAND = "sed";
export const SED_QUIET_FLAGS = Object.freeze(["-n", "--quiet", "--silent"] as const); // "sed -n" only
export const JQ_COMMAND = "jq"; // a dump only with the identity filter (D-M3-E4-7)
// impl/08 §6.1 step 6: Read input path key per host shape (Claude file_path, Gemini/Qwen absolute_path, path). D-M3-E4-4.
export const READ_PATH_KEYS = Object.freeze(["file_path", "absolute_path", "path", "filePath"] as const); // filePath: OpenCode (D-R44-OC-READ-1)
export const READ_PATH_LIST_KEY = "filePaths"; // OpenCode 2 multi-read: an array of paths (D-R44-OC-READ-1)
// D-R47-READ-MEDIA-1 (#1321, #1324): a read the host shows as an image or document block costs image tokens, not
// text bytes, so the Read size deny and the replace skip it. A file is media when its extension AND its first bytes
// name the same type (Claude Code picks by extension, Pi and OpenCode by the first bytes; both must agree).
export const READ_MEDIA_TYPES = Object.freeze({
  png: { exts: [".png"], sig: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  jpeg: { exts: [".jpg", ".jpeg"], sig: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }] },
  gif: { exts: [".gif"], sig: [{ at: 0, bytes: [0x47, 0x49, 0x46, 0x38] }] }, // "GIF8"
  webp: { exts: [".webp"], sig: [{ at: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { at: 8, bytes: [0x57, 0x45, 0x42, 0x50] }] }, // "RIFF" .... "WEBP"
  pdf: { exts: [".pdf"], sig: [{ at: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }] }, // "%PDF-"
} as const);
export type ReadMediaType = keyof typeof READ_MEDIA_TYPES;
export const READ_MEDIA_SNIFF_BYTES = 12; // the longest signature end (webp: 8 + 4)
const READ_IMAGES: readonly ReadMediaType[] = Object.freeze(["png", "jpeg", "gif", "webp"]);
const READ_IMAGES_AND_PDF: readonly ReadMediaType[] = Object.freeze([...READ_IMAGES, "pdf"]);
/** Per host, the media its own read tool returns as a block (host source checked, D-R47-READ-MEDIA-1). Claude Code
 *  Read: images + PDF blocks. Gemini/Qwen read_file: inlineData. OpenCode read: MEDIA_MIMES (png, jpeg, gif, webp, pdf).
 *  Pi read: image attachments, a PDF comes back as text. VS Code read_file: images go to its own view_image tool.
 *  ZCode Read (#1333, zai-org/ZCode a9fe401e apps/zcode-cli/packages/core/src/tool/handlers/read.ts:185, read-image.ts:134):
 *  png/jpeg/gif/webp become an image block; a PDF is a block only when the model has supportsPdf (read.ts:195), else text.
 *  Codex has no Read tool (images go to its own view_image, codex-rs core/src/tools/handlers/view_image.rs:75); copilot-cli
 *  ships a closed binary and kiro a closed host, so no media path is checked there.
 *  A host with no checked media path keeps the size deny for every file. */
export const READ_MEDIA_BY_AGENT: Readonly<Record<AgentId, readonly ReadMediaType[]>> = Object.freeze({
  "claude-code": READ_IMAGES_AND_PDF, gemini: READ_IMAGES_AND_PDF, qwen: READ_IMAGES_AND_PDF, opencode: READ_IMAGES_AND_PDF,
  pi: READ_IMAGES, vscode: READ_IMAGES, zcode: READ_IMAGES, "copilot-cli": [], codex: [], kiro: [],
});

// impl/09 §4 hooks dispatch (DEVIATIONS D-M3-H2-1..6). Keys and texts the dispatch reads; no numbers.
export const OWN_TOOL_PREFIX = "ctx_"; // §4.6 step 1: canonical names of this server's own tools
export const SHELL_TOOL = "Bash"; // §4.6 step 2: canonical shell tool -> journal kind "cmd"
export const EDIT_TOOLS = Object.freeze(["Write", "Edit"] as const); // §4.6 step 2 -> journal kind "edit"
export const EDIT_PATH_KEYS = Object.freeze(["file_path", "path"] as const); // §4.6 step 3 path field, in order
export const EXIT_CODE_LINE_PREFIX = "Exit code "; // §4.6 step 3, ADR-0009 §1: first result line
export const RESUME_HINT_KEY = "resume-hint"; // §4.3 step 2 onceKey
export const COMPACT_STATE_KEY = "compact-state"; // §4.3 step 1 onceKey
export const PENDING_COMPACT_KEY = "pending-compact"; // §4.4 step 2 onceKey
export const PENDING_COMPACT_META_PREFIX = "pending_compact:"; // ADR-0009 §6 meta key, + session id
export const PENDING_COMPACT_FLAG = "1";
// DECISIONS-r11 (B) turn-boundary recall: after a compaction, each UserPromptSubmit ranks journal rows by BM25
// against the prompt and injects whole rows. RECALL_MIN_SCORE is the -bm25 floor of the top row (rankTexts
// "any"): on the T-CMP fixtures the asked-for row scores 6.49-10.58 and unrelated prompts top out at 4.08.
export const RECALL_BUDGET_BYTES = 2048; // whole recall block, wrapper included (same size as STATE_BUDGET)
export const RECALL_MIN_SCORE = 5;
export const RECALL_MAX_ROWS = 340; // newest rows read per prompt (= MAX_CANDIDATES_TOTAL)
export const COMPACTED_META_PREFIX = "compacted:"; // meta key + session id: a compaction happened in this session
export const RECALL_UNITS_SEEN_META_PREFIX = "recall_units_seen:"; // r3-ledger: JSON "source:ord" list of line units already injected
export const UNITS_ANCESTOR_FACTOR = 8; // D-UNITS-BOUND-1: ancestor copies per output <= this x its bytes (0 of 680k units in 3520 real files drop a parent at 8)
// D-1330-RECALL-PROMPT-1 (#1330): the recall query is the current prompt only, its first distinct words up to this
// count, so a long prompt costs the same as a 64-word one (aron-intframe: prompt only 1 ms, 31/40 found).
export const RECALL_QUERY_MAX_TERMS = 64;
export const RECALL_UNIT_CANDIDATES = 64; // r3-ledger: line units read per recall query (one ranked FTS query)
export const RECALL_SEEN_META_PREFIX = "recall_seen:"; // meta key + session id: JSON seq list already injected
export const RECALL_OPEN_TAG = "<context_mode_recall>";
export const RECALL_CLOSE_TAG = "</context_mode_recall>";
export const RECALL_KEY = "recall"; // (B) onceKey of the recall hint (the seen list, not a marker, stops repeats)
// §4.3 step 3 text; {prefix} is row.toolNamePrefix so it names the platform tool (GP6/hint-names-platform-tool, D-M3-H2-2).
export const RESUME_HINT = "This session may have run before. Call {prefix}ctx_resume for a summary of what happened.";
export const SUBAGENT_SOURCE_PREFIX = "subagent:"; // §4.6 step 5 source label: + canonical name + ":" + turn
export const RUN_WRAPPER_FILE = "run.mjs"; // §4.5 step 3 case B, D-M3-arch-3: next to hook.mjs
export const RUN_WRAPPER_NODE = "node"; // case B wrapper command head
// ADR-0016 case B deny reason (drafts.md deny-subagent-run, D-M3-F-7): the subagent has Bash and no ctx tools,
// so the reason names only the run.mjs line the encoder puts above it, never a ctx_* tool.
export const SUBAGENT_RUN_DENY = "context-mode: This command sends its body into the conversation.\nRun the command on the line above with Bash instead. It runs the same command in the same folder, indexes the full output and prints only the part that matches your intent, with the same exit code.";
export const AGENT_ARG = "--agent"; // hook entry argv flag (impl/09 §5.2 step 1)

// M4 tools-session (impl/06 §2-§6; DEVIATIONS D-M4-arch-3..5). impl/06 gives these as exact reply texts,
// so they are fixed lines here, not ERROR_TEXT keys (same rule as CANCELLED_LINE); impl/06 owns no constant.
export const DECAY_SCALE = 1000; // impl/06 §2 step 6: undoes the x1000 baked into DECAY_X1000
export const PERCENT_SCALE = 100; // impl/06 §5: reduction_pct = saved / max(1, produced) * 100
export const SQLITE_BUSY_CODE = 5; // impl/06 §6 errors: SQLITE_BUSY primary code (via SQLITE_PRIMARY_CODE_MASK) -> PURGE_BUSY_LINE

// ctx_resume (impl/06 §4 errors and step 5)
export const RESUME_UNKNOWN_FIELD_LINE = "ctx_resume: unknown field — only session and seq are accepted.";
export const RESUME_NO_SESSION_LINE = "ctx_resume: no session id — pass session or call from an active session.";
export function RESUME_NO_ROW_LINE(seq: number): string {
  return `ctx_resume: no row at seq ${seq} for this session.`;
}
export const RESUME_EMPTY_LINE = "ctx_resume: no journal rows for this session yet."; // not an error (step 5)

// ctx_stats (impl/06 §5; DEVIATIONS D-M4-arch-4: sums sandbox_bytes/returned_bytes)
export const STATS_UNKNOWN_FIELD_LINE = "ctx_stats: unknown field — this tool takes no arguments.";
export function STATS_SUMMARY(allTimePct: number, sessionPct: number): string {
  return `ctx_stats: ${allTimePct}% kept out all-time, ${sessionPct}% this session.`;
}
export const STATS_COLUMNS = Object.freeze(["Scope", "Produced", "Returned", "Saved", "Reduction %"] as const);
export const STATS_NO_DATA = "no data — no tool calls recorded yet"; // step 4, PRD §12
// D-STATS-REPORT-1: the detailed report, in a ```text block above the table. Plain text, at most
// STATS_WIDTH columns per line, same journal -> same bytes. Positive labels only.
export const STATS_WIDTH = 80;
export const STATS_BYTES_PER_TOKEN = 4; // a rough estimate, labelled "about" in the report
export const STATS_MAX_TOOL_ROWS = 12;
// Report layout (columns) and units; stats.ts holds no number literal but 0 and 1 (M4 lint).
export const STATS_LABEL_W = 21; // label column, two spaces of indent before it
export const STATS_LABEL_MAX = 20; // longest label text; a longer one ends in "…"
export const STATS_CALLS_W = 7;
export const STATS_NUM_W = 11;
export const STATS_PCT_W = 8;
export const STATS_KIND_W = 9;
export const STATS_HEAD_BAR = 40;
export const STATS_ROW_BAR = 8;
export const STATS_KIND_BAR = 20;
export const STATS_KIB = 1024;
export const STATS_MILLION = 1_000_000;
export const STATS_MS_PER_MINUTE = 60_000;
export const STATS_MINUTES_PER_HOUR = 60;
export const STATS_HOURS_PER_DAY = 24;
export const STATS_CLOCK_DIGITS = 2;
export const STATS_REPORT_TITLE = "context-mode stats";
export const STATS_EMPTY_LINES = Object.freeze([
  "Ready. Your savings show up here after the first tool call.",
  "Large outputs from ctx_execute, ctx_batch and ctx_index stay in the",
  "sandbox, and only the short answer goes to the chat.",
] as const);
// Journal kinds in report order (schema.ts events.kind; `cost` rows are usage events, not shown).
export const STATS_KIND_LABELS = Object.freeze([
  // D-STATS-FIX-1 (8): the first five rows are call kinds, so they add up to the calls of the scope line.
  ["index", "Content indexed"], ["edit", "File edits"], ["toolerr", "Issues kept"],
  ["decision", "Your decisions"], ["cmd", "Other tool calls"], ["prompt", "Your prompts"],
] as const);
export const STATS_JOURNAL_HINTS = Object.freeze([
  "ctx_resume brings back your last task, files changed and open issues",
  "after a compact or a restart; ctx_search finds indexed content by words.",
] as const);

// D-STATS-VALUE-1: the business-value lines of the report (context window, hook work, largest outputs,
// index and search, last 7 days, footer). Same rules: plain text, STATS_WIDTH columns, no clock.
export const STATS_WINDOW_TOKENS = 200_000; // Claude context window size (Anthropic models overview), labelled "about"
export const STATS_THOUSAND = 1000; // K, M, B, T steps of a token count
export const STATS_WHOLE_FROM = 10; // at or past this, a whole number (token steps, windows); below it one decimal
export const STATS_DAYS = 7; // UTC days in "Last 7 days", ending on the day of the latest row
export const STATS_TOP_OUTPUTS = 3;
export const STATS_CARD_W = 19; // one card column: 4 cards = 76 columns with the indent
export const STATS_DAY_BAR = 48; // the largest day of the "Last 7 days of use" chart
// D-STATS-FIX-1 (3): the two assumptions of the token line, named on the line below it.
export const STATS_TOKEN_NOTE = "  (at 4 bytes per token; a Claude context window is 200K tokens)";
// The plugin's own ways of saving, in bar order: [key, bar character, legend name].
export const STATS_WAYS = Object.freeze([
  ["sandbox", "█", "sandbox run"], ["index", "▓", "index + search"],
  ["redirect", "▒", "hook sent to sandbox"], ["replace", "░", "hook cut down"],
] as const);
export const STATS_INDEX_TOOLS: readonly string[] = Object.freeze(["ctx_index", "ctx_search"]);
// D-STATS-FIX-1 (11): the funnel link carries UTM; the repo line reads ISSUE_REPO_SLUG (one place for the org move).
export const STATS_FOOTER_URL = "https://contextmode.ai/?utm_source=ctx_stats&utm_medium=stats&utm_content=footer";

// ctx_purge (impl/06 §6)
export const PURGE_SCOPES = Object.freeze(["session", "source", "project"] as const);
export const PURGE_NO_SCOPE_LINE = "ctx_purge: pick one scope — session, source, or project.";
export const PURGE_MANY_SCOPES_LINE = "ctx_purge: pick only one scope — session, source, or project.";
export const PURGE_BUSY_LINE = "ctx_purge: database busy — try again."; // no retry loop on top of DB_TIMEOUT_MS
export function PURGE_SUMMARY(rows: number, scope: (typeof PURGE_SCOPES)[number]): string {
  return `ctx_purge: deleted ${rows} rows (scope: ${scope}). This cannot be undone.`;
}

// decision rows and the reserved search label (ADR-0009 §8.2, DECISIONS-r6 D3, DEVIATIONS D-M4-arch-5)
export const DECISION_SOURCE = "decision"; // reserved ctx_search source label and its chunk source label
export const DECISION_USER_LABEL = "decision (user)"; // ctx_index renames a user label equal to DECISION_SOURCE
export const DECISION_TOOL = "AskUserQuestion"; // rule 1: PostToolUse of this tool
export const DECISION_ANSWERS_KEY = "answers"; // rule 1: tool_response.answers (JSON); non-JSON writes no row
export const DECISION_OPTION_KEY = "option"; // rule 2: journal key of an option-echo row
export const DECISION_LABEL_JOIN = " | "; // rule 1: multi-select labels

// ctx_doctor D1 / ctx_upgrade release source (impl/07 §5 D1, ADR-0011; DEVIATIONS D-M5-arch-5)
export const RELEASE_REPO_URL = "https://github.com/mksglu/context-mode.git"; // D1: git ls-remote --tags; ctx_upgrade: git clone of release
export const RELEASE_BRANCH = "release"; // CI build output only (PRD §6)
export const BUNDLE_SHA_DEFINE = "__CTX_BUNDLE_SHA__"; // the one esbuild `define` key the release build sets to the commit sha
declare const __CTX_BUNDLE_SHA__: string | undefined;
// Release build: the commit sha of this bundle. Dev/test build (no define): undefined, D1 reports UNKNOWN.
export const BUNDLE_SHA: string | undefined = typeof __CTX_BUNDLE_SHA__ === "string" ? __CTX_BUNDLE_SHA__ : undefined;

// ctx_doctor (impl/07 §4-§5, ADR-0010; DEVIATIONS D-M5-C2-1). Order is the fixed row order; labels are ADR-0010's check names.
export const DOCTOR_CHECK_ORDER = Object.freeze(["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"] as const);
export const DOCTOR_LABEL: Readonly<Record<(typeof DOCTOR_CHECK_ORDER)[number], string>> = Object.freeze({
  D1: "version", D2: "node", D3: "host config", D4: "old entries", D5: "hook round trip", D5b: "double-fire",
  D6: "MCP", D7: "project and worktree", D8: "context.db", D9: "index", D10: "enforcement mode", D11: "shell",
});
export const HOOK_FIXTURE_DIR = "fixtures"; // impl/00 §1 file tree: <bundle>/fixtures/hook-roundtrip.json (D-M5-arch-4)
export const HOOK_FIXTURE_FILE = "hook-roundtrip.json"; // D5 fixture, one JSON object keyed by agent id
export const HOOK_ENTRY_FILE = "hook.mjs"; // D5 runs this next to the server bundle (D-M3-arch-3)
export const REPORT_HEADER = "| Check | Status | Detail | Fix |"; // impl/07 §4 Output
export const REPORT_HEADER_RULE = "|---|---|---|---|";
export const REPORT_COMMAND_PREFIX = "Run in a terminal: "; // ADR-0019 D7: one keyless line after the rows, before env lines
export const ECHO_MAX_BYTES = 256; // D-NO-LOSSY-CUT-2: a caller input echoed in a reply (intent, query, source) longer than this is named by position or id, so a pointer or head always fits OUTPUT_CAP
export const LABEL_PREVIEW_BYTES = 32; // D-LABEL-HANDLE-2: a label over ECHO_MAX_BYTES is shown as its handle, its byte size and this many bytes of its head
export const LABEL_PAGE_BYTES = 8192; // D-LABEL-HANDLE-2: ctx_search({queries:[], source:<handle>}) returns the stored label whole in pages of this many bytes
export const REPORT_SOURCE_LABEL = "ctx_doctor:report"; // D-NO-LOSSY-CUT-1: the full report is stored under this label when it is over REPORT_CAP
export const REPORT_REST_PREFIX = "Rows not shown here are stored in full. Read them with: "; // + moreLine(...) pointer
export const REPORT_POINTER = `ctx_search({queries:["FAIL","PASS","UNKNOWN"], source:${JSON.stringify(REPORT_SOURCE_LABEL)}})`; // every row holds one status word, so these three queries reach every stored row
export function DOCTOR_FAIL_LINE(host: string, check: string, cause: string, command: string): string {
  return `FAIL ${host}: ${check} — ${cause}. Fix: ${command}`; // ADR-0010 per-host FAIL string, impl/07 §4 step 2
}
export const DOCTOR_FIX_UPGRADE = "run ctx_upgrade"; // D1, D3, D4, D8 stale schema
export const D1_DEV_BUILD_DETAIL = "dev build: source checkout; release builds stamp the sha"; // D-DOCTOR-FIX-1 shorter row; // UNKNOWN: BUNDLE_SHA unset (D-M5-arch-5, D-DOCTOR-ISSUE-1 names the cause)
export const D1_UPDATE_DETAIL = "update available"; // WARN with the agent's own update command (D-R49-DOCTOR-1339-1; was FAIL in D-M5-arch-5)
// D-DOCTOR-D1-CAUSE-1: every D1 detail starts with the installed version and the short bundle sha, then names the exact cause.
export const D1_SHORT_SHA_LEN = 7;
export const D1_PACKAGE_FILE = "package.json"; // <bundleDir>/package.json holds the installed version (OUT_PACKAGE_JSON)
export function D1_PREFIX(version: string | undefined, sha: string): string {
  return `${version ?? "bundle"} (${sha.slice(0, D1_SHORT_SHA_LEN)})`;
}
// D-DOCTOR-D1-TAGS-1: D1 compares versions in the bundle's channel; `source` names where the latest version came from.
export const D1_SOURCE_NPM = "npm"; // the dist-tag of the channel: decides first
export const D1_SOURCE_TAGS = "GitHub tags"; // the highest v* tag of the channel: only when npm does not answer
export function D1_LATEST_PASS(tag: string, source: string): string { return `latest ${tag} on ${source}`; }
export function D1_LATEST_UPDATE(tag: string, source: string, latest: string): string { return `${D1_UPDATE_DETAIL}, ${tag} on ${source} is ${latest}`; }
export function D1_LATEST_AHEAD(tag: string, source: string, latest: string): string { return `ahead of ${tag} on ${source} (${latest})`; } // a dev build newer than any release: PASS
export const D1_NO_VERSION = "no version in package.json"; // UNKNOWN without a network call: no channel to ask about
export const D1_LATEST_UNKNOWN = "latest unknown";
export const D1_GIT_MISSING = "git not found on PATH";
export function D1_GIT_EXIT(code: number, stderrLine: string): string { return stderrLine === "" ? `git exit ${code}` : `git exit ${code}: ${stderrLine}`; }
export function D1_GIT_TIMEOUT(ms: number): string { return `git timed out after ${ms} ms`; }
export const D1_GIT_CANCEL = "git stopped by cancel";
export const D1_GIT_NO_START = "git did not start";
export function D1_GIT_NO_TAG(tag: string): string { return `git answered no ${tag} tag`; }
export function D1_NPM_TIMEOUT(ms: number): string { return `npm registry timed out after ${ms} ms`; }
export function D1_NPM_HTTP(status: number): string { return `npm registry answered HTTP ${status}`; }
export function D1_NPM_ERROR(cause: string): string { return `npm registry: ${cause}`; }
export function D1_NPM_NO_TAG(tag: string): string { return `npm registry answered no ${tag} version`; }
export const D1_CAUSE_JOIN = "; ";
export const GIT_LS_REMOTE_TAG_ARGS: readonly string[] = Object.freeze(["--tags", "--refs"]); // tag refs only, no peeled ^{} lines
export const RELEASE_TAG_PATTERN = "v*"; // release tags: v1.0.169, v2.0.0-next.32
export const RELEASE_TAG_REF_PREFIX = "refs/tags/v"; // ls-remote ref of a release tag; the rest is the version
export const D1_GIT_CHECK_FIX = `git ls-remote --tags --refs ${RELEASE_REPO_URL} "${RELEASE_TAG_PATTERN}"`; // UNKNOWN: check by hand
export const D1_NPM_CHECK_FIX = "npm view context-mode dist-tags"; // UNKNOWN with git missing: check by hand
export const D1_REGISTRY_URL = "https://registry.npmjs.org/-/package/context-mode/dist-tags"; // {"latest":..,"next":..}
export const D1_PRERELEASE_SEP = "-"; // 2.0.0-next.26: the text after "-" up to "." is the dist-tag
export const D1_DEFAULT_TAG = "latest"; // a version with no prerelease part
export const GIT_LS_REMOTE = "ls-remote"; // git ls-remote --tags --refs <RELEASE_REPO_URL> v*
// #1328 D-NODE-OLD-1: one text for cli, server (ctx_doctor D2), hook and setup; errors.ts NODE_TOO_OLD is the same line.
export const D2_NODE_FIX = `nvm install ${NODE_MIN.split(".")[0]}, or install it from https://nodejs.org`;
export function D2_NODE_DETAIL(version: string): string { return `Context Mode needs Node ${NODE_MIN} or newer; you have ${version}`; }
export const D2_SQLITE_DETAIL = "node:sqlite failed to load";
export const D2_SQLITE_FIX = "run ctx_doctor";
export function D2_BUN_DETAIL(version: string): string { return `running under Bun ${version}`; }
export const D3_PARTS = Object.freeze(["MCP entry", "hook entries", "hook timeout"] as const); // D3 names which of the 3 is wrong
export const D4_REASON_JOIN = "; ";
export const D5_CODEX_UNTRUSTED_DETAIL = "Codex hooks not trusted"; // DECISIONS-r9 R6, status UNKNOWN
export function D5_NO_FIXTURE_DETAIL(agent: string): string { return `no recorded fixture for ${agent}`; } // D-M5-arch-4
export const D5B_DETAIL = "both Claude Code hooks and VS Code chat.useClaudeHooks are active for this repo";
export const D5B_FIX = "disable chat.useClaudeHooks or the Claude Code hooks block";
export const VSCODE_CLAUDE_HOOKS_SETTING = "chat.useClaudeHooks"; // D5b
export const VSCODE_SETTINGS_FILE = "settings.json"; // <repo>/.vscode/settings.json (D5b)
export const D6_UNKNOWN_DETAIL = "no clientInfo or protocolVersion on the request"; // UNKNOWN, never FAIL
export const D6_IN_PROCESS_DETAIL = "in-process plugin: this call ran inside the agent, no MCP session to read"; // PASS (D-R49-DOCTOR-1339-3)
export function D7_DETAIL(got: string): string { return `resolved project source ${got} does not match the host's actual cwd`; }
export const D7_FIX = "restart the agent in the correct directory";
export function D8_STALE_SCHEMA_DETAIL(got: number, want: number): string { return `stale schema (v${got}, expected v${want})`; }
export const D8_INTEGRITY_DETAIL = "integrity_check failed";
export const D8_INTEGRITY_FIX = "doctor will heal context.db on the next run";
export const D8_HEALED_LOSSLESS_DETAIL = "healed (lossless)";
export function D8_HEALED_RECREATE_DETAIL(ts: string): string { return `healed by recreate — old data kept at context.db.${ts}.bak`; }
export const INTEGRITY_OK = "ok"; // PRAGMA integrity_check single-row pass value
export const HEAL_BACKUP_SUFFIX = ".bak"; // <file>.<ts>.bak
// D-ORPHAN-WAL-1: context.db missing, its -wal/-shm left. D8 names each file and its size; the heal moves them whole
// into <projectDir>/orphan-<UTC stamp>/ and starts a new context.db. Nothing is deleted or cut (D-NO-TRUNCATE-1).
export interface OrphanFile { path: string; bytes: number; }
const orphanList = (files: readonly OrphanFile[]): string => files.map((f) => `${f.path} (${f.bytes} bytes)`).join(", ");
export const ORPHAN_DIR_PREFIX = "orphan-"; // <projectDir>/orphan-20261103T120102Z/
export function D8_ORPHAN_DETAIL(files: readonly OrphanFile[]): string { return `context.db is gone, its WAL files are still here: ${orphanList(files)}`; }
export const D8_ORPHAN_FIX = "run ctx_doctor once; it keeps these files in a dated folder and starts a new index";
export function D8_ORPHAN_HEALED_DETAIL(dir: string, moved: readonly OrphanFile[], dbPath: string): string {
  return `moved the WAL files of the missing context.db, whole and unchanged, to ${dir}: ${orphanList(moved)}; new index at ${dbPath}; the old WAL is kept there, to restore it put the original context.db back next to it`;
}
export const D8_ORPHAN_HEALED_FIX = "run ctx_doctor again; D8 then reads PASS";
export function D8_ORPHAN_MOVE_FAILED(detail: string, cause: string): string { return `${detail}; moving them aside failed: ${cause}`; }
// D-ORPHAN-WAL-1: ctx_doctor keeps its report when its own journal row cannot be written; this one line says so.
export const DOCTOR_TOOL_NAME = "ctx_doctor"; // the one tool whose reply survives a failed journal write
export function JOURNAL_SKIPPED_LINE(cause: string): string { return `Journal row for this call skipped: ${cause}`; }
export function D9_INDEX_DETAIL(sources: number, chunks: number): string { return `${sources} sources, ${chunks} chunks indexed`; }

// Plugin root and git-checkout upgrade (impl/07 §1, §6; ADR-0010, ADR-0011).
export const PLUGIN_CACHE_DIR_NAME = "cache"; // ~/.claude/plugins/cache/<marketplace>/context-mode (HOST_CONFIG_DIR_NAME, HOST_PLUGINS_DIR_NAME)
export const PLUGIN_MARKETPLACE_NAME = "context-mode"; // ADR-0011 install: context-mode@context-mode
export const DATA_PLUGINS_DIR_NAME = "plugins"; // <DATA_ROOT>/plugins/<agent>/{current,<sha>}
export const PLUGIN_CURRENT_LINK = "current"; // symlink to the active version dir
export const PLUGIN_ROLLBACK_GENERATIONS = 1; // impl/07 §6 step 4d: one kept previous dir
export const RELEASE_SUMS_FILE = "SHA256SUMS"; // impl/07 §6 step 4b
export const GIT_REMOTE_NAME = "origin";
export const EXTENSIONS_DIR_NAME = "extensions"; // Gemini/Qwen: <agent home>/extensions/context-mode
// Agent home dir segments under $HOME (ADR-0011 table; impl/07 §3 `home`). VS Code is project scope (<project>/.vscode).
export const AGENT_HOME_DIR: Readonly<Record<AgentId, readonly string[]>> = Object.freeze({
  "claude-code": [".claude"], codex: [".codex"], gemini: [".gemini"], qwen: [".qwen"], "copilot-cli": [".copilot"],
  vscode: [".vscode"], kiro: [".kiro"], zcode: [".zcode"], pi: [".pi"], opencode: [".config", "opencode"],
});
export const UPGRADE_RESTART_LINE = "restart needed"; // impl/07 §6 step 8
export const UPGRADE_HOST_AREA = "host update"; // impl/07 §6 step 4
export const UPGRADE_REMOVED = "removed"; // impl/07 §6 step 6
export const UPGRADE_DATA_KEPT = "user data kept (confirmDelete not set)"; // impl/07 uninstall step 4
export const UPGRADE_DEFAULT_MODE = "upgrade"; // A-T4
// ctx_upgrade change table and areas (impl/07 §6; DEVIATIONS D-M5-U1-1..4).
export const UPGRADE_MODES = Object.freeze(["upgrade", "uninstall"] as const); // A-T4 zod enum
export const UPGRADE_TABLE_HEADER = "| Area | Before | After |";
export const UPGRADE_TABLE_RULE = "|---|---|---|";
export const UPGRADE_PLUGIN_ROOT_AREA = "plugin root"; // step 0: resolvePluginRoot vs the running bundle dir
export const UPGRADE_SERVER_AREA = "server"; // uninstall step 1
export const UPGRADE_SERVER_RUNNING = "running";
export const UPGRADE_SERVER_STOPPED = "stopped after this reply";
export const UPGRADE_CACHE_AREA = "cache"; // uninstall step 2
export const UPGRADE_NOT_FOUND = "not found";
export const UPGRADE_DATA_AREA = "user data"; // uninstall step 4
export const UPGRADE_REPORT_ONLY = "report only: remove it by hand if you no longer use it"; // ADR-0011 report-not-remove rows
export const UPGRADE_STOP_DELAY_MS = 200; // uninstall: SIGTERM to self (server entry only) after the reply is written
export const UPGRADE_AREA_KEY_SEP = ": "; // area cell: <file>: <key path>
export const V1_KEY_PATH_SEP = "."; // V1Finding.path / HostConfigEdit.path segment separator
export const UPGRADE_GIT_TIMEOUT_MS = 120000; // release smoke: one git step
export const GIT_CLONE_ARGS = Object.freeze(["clone", "--depth", "1", "--branch"] as const); // + RELEASE_BRANCH, url, dir
export const GIT_HEAD_SHA_ARGS = Object.freeze(["rev-parse", "HEAD"] as const);
export const UPGRADE_FETCH_DIR_PREFIX = ".fetch-"; // <DATA_ROOT>/plugins/<agent>/.fetch-<pid> before rename to <sha>
export const SUMS_LINE_SEP = "  "; // SHA256SUMS line: "<hex>  <relative/path>" (impl/13 §4)
export const SUMS_HASH_ALGORITHM = "sha256";
export const UPGRADE_CONFIG_AREA = "host config"; // uninstall step 3 when no own entry exists
export const UPGRADE_OWN_ENTRY = "context-mode entry"; // uninstall step 3 "before" cell
export const UPGRADE_CACHE_BY_HAND = "remove the release dir by hand: its place is your choice"; // config-entry installs (D-M5-U1-3)
export const GIT_NO_PROMPT_ENV: Readonly<Record<string, string>> = Object.freeze({ GIT_TERMINAL_PROMPT: "0" }); // never wait on a credential prompt
// D-M7-CI-1: a git child gets core.autocrlf=false by env (argv stays as the spec), so clone bytes match SHA256SUMS.
export const GIT_NO_CRLF_ENV: Readonly<Record<string, string>> = Object.freeze({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" });
export const GIT_NOT_STARTED = "git did not start"; // FETCH_FAILED <code> when git is not on PATH
export const GIT_BIN = "git";
// D-VT-WINBASH-1: Windows shell languages resolve to Git Bash. Paths from the dir of git.exe, in order:
// <root>\cmd\git.exe and <root>\bin\git.exe -> ../bin/bash.exe; <root>\mingw64\bin\git.exe -> ../../bin/bash.exe.
export const WIN_SHELL_LANGS: readonly string[] = Object.freeze(["shell", "bash", "sh"]);
export const GIT_BASH_RELATIVE: readonly (readonly string[])[] = Object.freeze([["..", "bin", "bash.exe"], ["..", "..", "bin", "bash.exe"]]);
export const GIT_EXIT_LABEL = "git exit "; // FETCH_FAILED <code>: git exit <n>: <stderr>
export const UPGRADE_TRASH_SUFFIX = ".ctx-upgrade-removing"; // a removed path is renamed here first, deleted on commit (rollback)
// D-SEC-V1-ASIDE-1 (owner rule: never delete user data): an old v1 data dir is moved to <dir>UPGRADE_ASIDE_SUFFIX and kept
// after commit; a second run picks <dir>UPGRADE_ASIDE_SUFFIX-<n>, so an earlier copy stays too.
export const UPGRADE_ASIDE_SUFFIX = ".ctx-v1-old";
export const UPGRADE_MOVED_ASIDE = "moved aside to "; // + the kept path, the After cell of a data dir row
// D-SEC-PERSIST-1: Claude Code keeps a large tool output at <claude dir>/projects/<project>/<session>/tool-results/<file>.
// The hook reads such a file only at exactly that place for its own session, and only up to this many bytes.
export const CLAUDE_TOOL_RESULTS_DIR_NAME = "tool-results";
export const PERSISTED_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;
export const TABLE_ROW_START = "| ";
export const TABLE_CELL_SEP = " | ";
export const TABLE_ROW_END = " |";
export const TABLE_PIPE = "|";
export const TABLE_PIPE_ESCAPED = "\\|";
export const TOML_TABLE_OPEN = "[";
export const TOML_TABLE_CLOSE = "]";
// Wave-2 split files under src/core/ops/ (size rule; DEVIATIONS D-M5-U1-6). tools/doctor.ts and tools/upgrade.ts
// stay thin handlers that call these.
export const OPS_SPLIT_FILES = Object.freeze([
  "doctor-env.ts", "doctor-config.ts", "doctor-hook.ts", "doctor-db.ts", "doctor-heal.ts",
  "verify-sums.ts", "plugin-swap.ts", "host-write.ts", "v1-remove.ts", "uninstall.ts",
] as const);
// doctor-env.ts: D1 version, D2 Node and node:sqlite, D6 MCP (impl/07 §5).
export const SQLITE_MODULE = "node:sqlite"; // D2: await import(SQLITE_MODULE)
export const NODE_VERSION_PREFIX = "v"; // process.version "v24.15.0" -> compare "24.15.0" with NODE_MIN
export const NODE_VERSION_SEP = "."; // major.minor.patch, compared as numbers
export const LS_REMOTE_FIELD_SEP = "\t"; // git ls-remote line: "<sha>\t<ref>"
export const GIT_SHA_HEX_LEN = 40; // a full commit sha (the first field of a D1 ls-remote tag line)
export const DOCTOR_GIT_TIMEOUT_MS = 10000; // D1: the npm registry read, and git ls-remote --tags after an npm failure (each); a timeout is UNKNOWN
export const DOCTOR_PASS_DETAIL = "ok"; // detail of a PASS row with nothing more to say
// doctor-config.ts: D3 host config, D4 old entries, D7 project (impl/07 §5).
export const D3_PART_JOIN = ", ";
export function D3_DETAIL(parts: readonly string[]): string { return `wrong: ${parts.join(D3_PART_JOIN)}`; }
// D-DOC-D3-SCOPE-1: two or more live installs and none is the one Claude Code runs for this project.
export function D3_ROOT_DETAIL(paths: readonly string[]): string { return `pick one install for this project: ${paths.join(D3_PART_JOIN)}`; }
// D-UNSUPPORTED-HOSTS-1 (owner: "Sadece Antigravity icin degil desteklemediklerimize desteklemiyoruz diye desin"; #1340 first case).
// Hosts that 1.x supported and 2.0 does not. Every field comes from v1.0.169 (src/adapters/client-map.ts, detect.ts), not a guess.
// clientNames: MCP clientInfo.name, lower case. envVars: set by the host itself. pluginPaths: dir segments a plugin bundle sits in.
// configDirs: the host's home dirs (data for the docs; a dir alone never proves the host runs, so detection ignores it).
export interface UnsupportedHost { id: string; name: string; clientNames: readonly string[]; envVars: readonly string[]; pluginPaths: readonly (readonly string[])[]; configDirs: readonly string[]; binaries: readonly string[]; source: string; }
const unsupported = (h: UnsupportedHost): UnsupportedHost => Object.freeze(h);
export const UNSUPPORTED_HOSTS: readonly UnsupportedHost[] = Object.freeze([
  unsupported({ id: "antigravity", name: "Antigravity", clientNames: ["antigravity", "antigravity-client", "antigravity-cli", "agy"], envVars: ["ANTIGRAVITY_CLI_ALIAS"],
    pluginPaths: [[".gemini", "config", "plugins"], [".gemini", "antigravity", "plugins"], [".gemini", "antigravity-cli", "plugins"], [".gemini", "antigravity-ide", "plugins"]],
    configDirs: [".gemini/antigravity", ".gemini/antigravity-cli", ".gemini/config"], binaries: ["agy"], source: "v1.0.169:src/adapters/client-map.ts:15-17; detect.ts:156,481-483; #1340" }),
  unsupported({ id: "cursor", name: "Cursor", clientNames: ["cursor-vscode"], envVars: ["CURSOR_TRACE_ID", "CURSOR_CLI", "CURSOR_CWD"],
    pluginPaths: [], configDirs: [".cursor"], binaries: [], source: "v1.0.169:src/adapters/client-map.ts:18; detect.ts:163-165,584" }),
  unsupported({ id: "omp", name: "OMP (oh-my-pi)", clientNames: ["omp-coding-agent"], envVars: [],
    pluginPaths: [], configDirs: [".omp"], binaries: ["omp"], source: "v1.0.169:src/adapters/client-map.ts:37; detect.ts:543 (PI_CODING_AGENT_DIR is not a signal: supported Pi reads it too)" }),
  unsupported({ id: "openclaw", name: "OpenClaw", clientNames: [], envVars: [],
    pluginPaths: [], configDirs: [".openclaw"], binaries: [], source: "v1.0.169:src/adapters/detect.ts:252,575 (the runtime sets no env var)" }),
  unsupported({ id: "kimi", name: "Kimi Code", clientNames: ["kimi-code", "kimi"], envVars: [],
    pluginPaths: [], configDirs: [".kimi-code"], binaries: ["kimi"], source: "v1.0.169:src/adapters/client-map.ts:42-44; detect.ts:567; adapters/kimi/index.ts:127" }),
  unsupported({ id: "kilo", name: "Kilo Code", clientNames: ["kilo code"], envVars: ["KILO", "KILO_PID"],
    pluginPaths: [], configDirs: [".config/kilo"], binaries: [], source: "v1.0.169:src/adapters/client-map.ts:28; detect.ts:170-171,592" }),
  unsupported({ id: "zed", name: "Zed", clientNames: ["zed"], envVars: ["ZED_SESSION_ID", "ZED_TERM"],
    pluginPaths: [], configDirs: [".config/zed"], binaries: [], source: "v1.0.169:src/adapters/client-map.ts:38-39; detect.ts:189-190,616" }),
  unsupported({ id: "jetbrains-copilot", name: "JetBrains Copilot", clientNames: ["jetbrains client", "intellij idea", "pycharm"], envVars: ["IDEA_INITIAL_DIRECTORY"],
    pluginPaths: [], configDirs: [".config/JetBrains"], binaries: [], source: "v1.0.169:src/adapters/client-map.ts:23-25; detect.ts:213,600" }),
]);
export const SUPPORTED_AGENTS_DOCS_URL = "https://github.com/mksglu/context-mode/blob/main/docs/install/README.md";
export const D3_ROOT_FIX_JOIN = " or ";
export function D3_ROOT_FIX(installs: readonly { key: string; scope: string }[]): string {
  return `remove the extra install: ${installs.map((i) => `claude plugin uninstall ${i.key} --scope ${i.scope}`).join(D3_ROOT_FIX_JOIN)}`;
}
// doctor-config.ts D3 hook entries (DEVIATIONS D-M5-D2-1..3): where each agent's own hook entries live and their
// shape (impl/10 §1.5 table, build/manifests.ts HOOK_SHAPES). root: "plugin" = resolvePluginRoot, "home" = $HOME,
// "project" = the repo worktree. null = in-process agent, no hook file.
export const HOOK_HOST_FILE: Readonly<Record<AgentId, {
  root: "plugin" | "home" | "project"; file: readonly string[]; key: readonly string[];
  shape: "nested" | "flat" | "kiro" | "zcode"; timeoutKey: string; matcher: boolean;
} | null>> = Object.freeze({
  "claude-code": { root: "plugin", file: ["hooks", "claude-code.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: true },
  codex: { root: "home", file: [".codex", "hooks.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: true },
  gemini: { root: "plugin", file: ["hooks", "hooks.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: false },
  qwen: { root: "plugin", file: ["hooks", "qwen.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: true },
  "copilot-cli": { root: "home", file: [".copilot", "hooks", "context-mode.json"], key: ["hooks"], shape: "flat", timeoutKey: "timeoutSec", matcher: false },
  vscode: { root: "home", file: [".copilot", "hooks", "context-mode-vscode.json"], key: ["hooks"], shape: "flat", timeoutKey: "timeout", matcher: false },
  kiro: { root: "home", file: [".kiro", "hooks", "context-mode.json"], key: ["hooks"], shape: "kiro", timeoutKey: "timeout", matcher: false },
  zcode: { root: "home", file: [".zcode", "cli", "config.json"], key: ["hooks", "events"], shape: "zcode", timeoutKey: "timeoutMs", matcher: true },
  pi: null,
  opencode: null,
});
export const TOOL_HOOK_EVENTS: readonly string[] = Object.freeze(["PreToolUse", "PostToolUse"]); // canonical events that carry the matcher
export const HOOK_MATCHER_FIELD = "matcher";
export const KIRO_TRIGGER_FIELD = "trigger";
// impl/10 §1.5 kiro row + D-HF-KIRO-SHELL-1: one tool-event entry per [matcher, name tag]: own MCP tools (@mcp)
// and the native shell tool (Kiro CLI V3 docs hooks-migration, 2026-10-10: matcher "shell" = execute_bash).
export const KIRO_TOOL_MATCHERS: readonly (readonly [matcher: string, tag: string])[] = Object.freeze([["@mcp", "mcp"], ["shell", "shell"]] as const);
export const KIRO_ACTION_FIELD = "action";
export const HOOK_COMMAND_FIELD = "command";
export const HOOK_GROUP_HOOKS_FIELD = "hooks"; // nested shape: {matcher, hooks:[{command, timeout}]}
export const HOOK_COMMAND_SEP = " "; // hook command: node <dir>/hook.mjs --agent <id>
export const SHELL_QUOTE = '"'; // claude-code quotes "${CLAUDE_PLUGIN_ROOT}/hook.mjs"
// Matcher composed from the row as text, same rule as build/manifests.ts buildMatcher (D-M5-arch-3); src/ never runs it.
export const MATCHER_OPEN = "^(";
export const MATCHER_CLOSE = ")$";
export const MATCHER_ALT = "|";
export const MCP_ANY_MATCH = "mcp__.*"; // D-M2-MCP-1: PostToolUse matcher alternative on rows with a replace channel
export const POST_TOOL_USE = "PostToolUse";
export const MATCHER_ANY = ".*"; // OWN_TOOL_PREFIX + MATCHER_ANY = "ctx_.*"
export const REGEX_SPECIAL_CHARS = ".*+?^${}()|[]\\";
export const REGEX_ESCAPE = "\\";
export const CODEX_FEATURES_HOOKS_KEY = Object.freeze(["features", "hooks"] as const); // no key = Codex default hooks=true (#1152)
// doctor-hook.ts: D5 round trip, D5b double-fire (impl/07 §5).
export const D5_SHAPE_DETAIL = "hook output is not the agent's native shape";
// D-D5-READ-SHAPE-1 (#1304): the PostToolUse Read probe got an updatedToolOutput that is not Read's own output object.
// D-R41-READ-OFFSET-1 (#1314): the PostToolUse probe of a bounded Read (offset/limit) got a replace instead of the lines.
export const D5_READ_RANGE_DETAIL = "PostToolUse Read with offset/limit over the replace trigger came back replaced: a bounded Read must reach the model whole";
// D-R48-OWN-FILE-1 (#1326): a PreToolUse Read of a skill reference over the one-read limit under the agent's own config dir.
export const D5_READ_OWN_DETAIL = "PreToolUse Read of a skill file over the one-read limit under the agent's own config dir came back denied: skill and rule files must reach the model whole (#1326)";
export const D5_READ_MEDIA_DETAIL = "PreToolUse Read of a PNG over the one-read limit came back denied: an image Read must reach the model as an image block (#1321)";
export const D5_READ_SHAPE_DETAIL = "PostToolUse Read replace is not Read's output shape {type:\"text\", file:{filePath, content, numLines, startLine, totalLines}}: Claude Code drops it and shows a hook warning";
export function D5_SLOW_DETAIL(ms: number): string { return `hook round trip took ${ms} ms over bare node, over ${HOOK_P95_MS} ms`; }
// D-1323-CODEX-STOP-1 (#1323): the Codex Stop probe (rust-v0.166.0 stop.command.input) failed or wrote a hook-errors.log line.
export const D5_STOP_DETAIL = "Codex Stop event: the hook did not give an empty or Codex Stop reply, or it logged a hook error";
export const D5_FIX = "run ctx_upgrade"; // a broken hook entry is a broken install
// doctor-db.ts: D8 checks, D9 counts, D10 mode (impl/07 §5).
export const PRAGMA_INTEGRITY_CHECK = "PRAGMA integrity_check";
export function D10_DETAIL(mode: string): string { return `enforcement mode: ${mode}`; }
// D-1331-OC-PERM-1 (#1331): D10 also reports whether the host permission check runs before each ctx_* tool.
export function D10_PERMISSION_DETAIL(mode: string): string { return `enforcement mode: ${mode}; OpenCode permission rules apply to ctx_* tools`; }
export const D10_PERMISSION_MISSING_DETAIL = "this OpenCode build gives plugins no permission check (ctx.permission.assert), so ctx_* tools cannot follow OpenCode permission rules";
export const D10_PERMISSION_FIX = "opencode upgrade";
// D-1331-OC-PERM-1: the action names the OpenCode built-in tools assert (2.x: core chunks shell/read/webfetch tools; 1.x: "bash").
export const OC_SHELL_ACTION = "shell";
export const OC_LEGACY_SHELL_ACTION = "bash";
export const OC_READ_ACTION = "read";
export const OC_WEBFETCH_ACTION = "webfetch";
export const OC_ANY_RESOURCE = "*";
// D11 shell (D-VT-WINBASH-1).
export const D11_WIN_DETAIL = "Git Bash not found"; export const D11_WIN_FIX = "install Git for Windows";
export const D11_POSIX_DETAIL = "no sh on PATH"; export const D11_POSIX_FIX = "install sh or add it to PATH";
export function D11_PASS_DETAIL(shell: string, win: boolean): string { return `${win ? "Git Bash" : "sh"}: ${shell}`; }
// doctor-heal.ts: D8 heal (impl/07 §5 step 7). Order: main file, then WAL, then SHM.
export const DB_SIBLING_SUFFIXES = Object.freeze(["", DB_WAL_SUFFIX, DB_SHM_SUFFIX] as const);
export const HEAL_TMP_SUFFIX = ".heal"; // VACUUM INTO <context.db>.heal, then rename over context.db
export const HEAL_TS_SEP = "."; // context.db.<ts>.bak
// verify-sums.ts: SHA256SUMS (impl/07 §6 step 4b, impl/13 §4).
export const SUMS_LINE_END = "\n";
export const HASH_ENCODING = "hex";
// plugin-swap.ts: atomic `current` swap (impl/07 §6 step 4c-4d).
export const PLUGIN_LINK_TMP_SUFFIX = ".swap"; // symlink current.swap -> <sha>, then rename it to current
export const PLUGIN_LINK_OLD_SUFFIX = ".old"; // current is renamed to current.old first (Windows: no rename over a dir link)
export const PLUGIN_LINK_TYPE = "dir"; // fs.symlink type on POSIX: relative <sha> target
export const PLUGIN_LINK_TYPE_WIN32 = "junction"; // on win32 a dir symlink needs admin or Developer Mode (EPERM); a junction needs neither, absolute target (D-WIN-JUNCTION-1)
// uninstall.ts: stop marker read by the owning server (impl/07 uninstall step 1, impl/02 §7).
export const OWNER_STOP_EXT = ".stop"; // <projectDir>/owners/<serverId>.stop next to <serverId>.pid
export const UPGRADE_DATA_DELETED = "user data deleted"; // uninstall step 4 with confirmDelete
// D-R44-UPGRADE-NATIVE-1 (#1309, host audit pi-2 qwen-1 codex-2): ctx_upgrade prints each agent's own update command.
// No agent clones a branch: the agent's own updater (or npm for the setup-route agents) fetches the latest release.
export const UPGRADE_HOST_COMMAND: Readonly<Record<AgentId, string>> = Object.freeze({
  "claude-code": "claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode",
  codex: "codex plugin marketplace upgrade context-mode",
  gemini: "gemini extensions update context-mode",
  qwen: "qwen extensions update context-mode",
  pi: "pi update --extensions",
  opencode: "opencode plugin update",
  "copilot-cli": "npm i -g context-mode && context-mode setup --agents copilot-cli",
  vscode: "npm i -g context-mode && context-mode setup --agents vscode",
  kiro: "npm i -g context-mode && context-mode setup --agents kiro",
  zcode: "npm i -g context-mode && context-mode setup --agents zcode",
});
// Old install forms, kept so uninstall and doctor still find and remove them (ADR-0011 Pi and OpenCode rows).
export const PI_GIT_PACKAGE = "git:github.com/mksglu/context-mode@release"; // old Pi git entry (uninstall removes it)
export const OPENCODE_GIT_SPEC = "git+https://github.com/mksglu/context-mode.git#release"; // old OpenCode git entry (uninstall removes it)

// v1 footprint names (ADR-0011 "v1 cleanup"; impl/07 §3). Script names are the v1 hooks/**/*.mjs event scripts.
export const V1_SCRIPT_NAMES = Object.freeze([
  "afteragentresponse.mjs", "aftermodel.mjs", "aftertool.mjs", "agentspawn.mjs", "beforeagent.mjs", "beforetool.mjs",
  "posttooluse.mjs", "precompact.mjs", "precompress.mjs", "pretooluse.mjs", "sessionend.mjs", "sessionstart.mjs",
  "stop.mjs", "userpromptsubmit.mjs",
] as const);
export const V1_HOOK_COMMAND = "context-mode hook";
export const V1_CODEX_HOOK_COMMAND = "context-mode hook codex";
export const V1_CODEX_HOOKS_DIR = Object.freeze(["hooks", "codex"] as const); // path segments of hooks/codex/*.mjs
export const V1_CACHE_HEAL_NAME = "context-mode-cache-heal"; // hooks/context-mode-cache-heal.{mjs,sh}
export const V1_CACHE_HEAL_EXTS = Object.freeze([".mjs", ".sh"] as const);
export const V1_STATUSLINE_COMMAND = "context-mode statusline"; // report only, never removed
export const V1_PI_PACKAGE = "npm:context-mode";
// D-R38-PI-D4-1: Pi's managed npm dir <agentDir>/npm/node_modules/<name> (package-manager.js getManagedNpmInstallPath).
export const PI_NPM_DIR = "npm";
export const PI_NODE_MODULES_DIR = "node_modules";
export const PI_PACKAGE_JSON_FILE = "package.json";
export const PI_LIST_COMMAND = "pi list"; // D-R38-PI-CMD-1: Pi's own command that lists installed packages
export const PI_CURRENT_MAJOR = 2; // an installed context-mode at this major or later is the current Pi package
export const V1_OPENCODE_PLUGIN_SPEC = "context-mode"; // bare npm spec in .plugin[]
export const V1_TMP_PREFIX = "context-mode-"; // <os tmp>/context-mode-*
export const V1_TOML_SECTION_ROOT = "mcp_servers"; // codex config.toml: v1 wrote [mcp_servers.context-mode] and its .tools.* tables (D-DOC-RT-1)
export const V1_HOOKS_DIR_NAME = "hooks";
export const SETTINGS_FILE = "settings.json"; // claude-code, gemini, qwen; pi under agent/
export const CLAUDE_USER_CONFIG_FILE = ".claude.json"; // $HOME/.claude.json
export const HOOKS_JSON_FILE = "hooks.json"; // codex, zcode cli/
export const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR"; // D-WF-CC-CONFIG-1: Claude Code user dir override (default ~/.claude)
export const SETUP_BACKUP_DIR_NAME = "backups"; // <data root>/backups/<run id>/manifest.json: one setup run (setup/engine.ts Run)
export const SETUP_MANIFEST_FILE = "manifest.json"; // #1327 D-1327-CODEX-ENV-1: the doctor reads which Codex config.toml setup wrote
export const CODEX_HOME_ENV = "CODEX_HOME"; // D-N6-CODEX-HOME-2: Codex reads config.toml and hooks.json from here (default ~/.codex)
export const COPILOT_HOME_ENV = "COPILOT_HOME"; // D-WIN-COPILOT-HOME-1: Copilot CLI replaces ~/.copilot as a whole with it (hooks/, skills/)
export const GEMINI_CLI_HOME_ENV = "GEMINI_CLI_HOME"; // D-R38-GEMINI-HOME-1: gemini-cli homedir() reads it before os.homedir(); <it>/.gemini holds settings.json and extensions/
export const KIRO_HOME_ENV = "KIRO_HOME"; // D-WIN-KIRO-HOME-1: Kiro CLI V3 global dir override (hooks/, settings/mcp.json, skills/, agents/); default ~/.kiro
export const OPENCODE_CONFIG_DIR_ENV = "OPENCODE_CONFIG_DIR"; // D-WIN-OPENCODE-DIR-1: OpenCode custom config dir (opencode.json, skills/)
export const APPDATA_ENV = "APPDATA"; // D-WIN-VSCODE-MCP-1: Windows roaming app data; VS Code keeps its user dir under it
export const VSCODE_USER_DIR_SEGMENTS = Object.freeze(["Code", "User"] as const); // D-WIN-VSCODE-MCP-1: <app data>/Code/User/{mcp.json,settings.json}
export const XDG_CONFIG_HOME_ENV = "XDG_CONFIG_HOME"; // D-WIN-OPENCODE-DIR-1: OpenCode takes its global dir from xdg-basedir: $XDG_CONFIG_HOME/opencode, else ~/.config/opencode
export const CONFIG_TOML_FILE = "config.toml"; // codex
export const CONFIG_JSON_FILE = "config.json"; // zcode cli/
export const ZCODE_CLI_DIR = "cli";
export const OWN_HOOK_FILE = "context-mode.json"; // copilot-cli ~/.copilot/hooks/ (vscode: context-mode-vscode.json, same dir)
export const GITHUB_DIR_NAME = ".github";
export const VSCODE_DIR_NAME = ".vscode";
export const VSCODE_MCP_FILE = "mcp.json";
export const KIRO_AGENT_FILE = Object.freeze(["agents", "default.json"] as const);
export const KIRO_AGENTS_DIR = "agents"; // A37: every ~/.kiro/agents/*.json is read for name == SERVER_KEY
export const KIRO_AGENT_FILE_EXT = ".json";
export const KIRO_AGENT_NAME_KEY = "name"; // v1 template-install agent file (configs/kiro/agent.json) top-level key
export const KIRO_STEERING_FILE = Object.freeze(["steering", "KIRO.md"] as const); // A37: under ~/.kiro and <project>/.kiro
export const PI_AGENT_DIR = "agent";
export const OPENCODE_CONFIG_FILES = Object.freeze(["opencode.jsonc", "opencode.json"] as const); // .jsonc wins (#849)
export const OPENCODE_BASE_CONFIG_FILE = "opencode.json"; // ctx_upgrade reads this; readHostConfig picks a sibling .jsonc (#849)
export const JSONC_EXT = ".jsonc";
export const TOML_EXT = ".toml";
export const MCP_SERVERS_KEY = "mcpServers";
export const HOOKS_KEY = "hooks";
export const STATUS_LINE_KEY = "statusLine";
export const PI_PACKAGES_KEY = "packages";
export const OPENCODE_PLUGIN_KEY = "plugin";
export const OPENCODE_PLUGINS_KEY = "plugins"; // D-OC2-D3-PLUGINS-1: `opencode plugin add context-mode` on OpenCode 2.x writes this key (#1307)
export const OPENCODE_MCP_COMMAND_FIELD = "command"; // D-R44-OC-D3-1: OpenCode local MCP entry: command is the whole argv array
export const OPENCODE_PACKAGE_FIELD = "package"; // D-OC2-D3-PLUGINS-1: an object entry {"package": "context-mode@2.0.1"} in the list (#1307)
export const OPENCODE_NPM_SPEC_PREFIX = `${SERVER_KEY}@`; // D-OC2-D3-PLUGINS-1: the npm spec form "context-mode@2.0.1" / "context-mode@latest"
export const NPM_VERSION_SEP = "@"; // npm spec "<name>@<version or tag>"
// D-R44-UPGRADE-NATIVE-1 (#1309, host audit pi-2): the npm entry that replaces an old release-branch entry. The
// "latest" tag keeps it apart from the bare v1 form, and the agent's own updater follows it to each new release.
export const OPENCODE_NPM_LATEST = `${OPENCODE_NPM_SPEC_PREFIX}latest`; // "context-mode@latest"
export const PI_NPM_LATEST = `${V1_PI_PACKAGE}${NPM_VERSION_SEP}latest`; // "npm:context-mode@latest"
export const V1_DATA_DIR_NAME = "context-mode"; // <agent home>/context-mode/
// detectV1 (impl/07 §3; DEVIATIONS D-M5-O2-1..3). v1 wrote only these entries under ~/.context-mode/ (v1 main:
// "content" dir, "platform.json"); v2 shares the dir (DATA_ROOT), so only these names are v1 content.
export const V1_DATA_ROOT_ENTRIES = Object.freeze(["content", "platform.json"] as const);
export const V1_SESSIONS_DIR_NAME = "sessions"; // VS Code: <.github|.vscode>/context-mode/sessions/
export const V1_SCRIPT_EXT = ".mjs"; // hooks/codex/*.mjs
export const V1_BIN_COMMAND = SERVER_KEY; // v1 global npm bin; v2 never runs it ("no npm for users")
export const VSCODE_MCP_SERVERS_KEY = "servers"; // .vscode/mcp.json {servers:{<name>:{command,args}}}
export const ZCODE_EVENTS_KEY = "events"; // ~/.zcode/cli/config.json hooks.events.<Event>[]
export const PI_ROLE = "custom"; // #1263: Pi injected text is never role "user" (D-M5-A1-1)
export const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR"; // Pi agent-dir override (#1035); caller passes it to detectV1 as scope.piAgentDir
export const PI_PACKAGE_SOURCE_KEY = "source"; // Pi packages[] entry: a string or {source,...}
export const V1_PATH_SEPS = Object.freeze(["/", "\\"] as const); // hooks/codex/ in a command, POSIX or Windows
// GEM-WIN-4: Gemini fills ${/} with the OS separator, so its hook command reads "${extensionPath}${/}hook.mjs".
export const HOST_SEP_TOKEN = "${/}";
export const HOOK_SCRIPT_SEPS: readonly string[] = Object.freeze([...V1_PATH_SEPS, HOST_SEP_TOKEN]);
// V1Finding.reason texts, used verbatim in the D4 row and the upgrade change table (impl/07 §3 step 3).
export const V1_REASON = Object.freeze({
  hook: "old context-mode hook entry: command contains context-mode and an old script name or context-mode hook",
  cacheHealHook: "old context-mode cache-heal SessionStart hook entry",
  cacheHealFile: "old context-mode cache-heal script file",
  statusLine: "old context-mode statusLine (context-mode statusline): report only, never removed",
  mcpEntry: "old context-mode MCP entry mcpServers.context-mode",
  codexHook: "old context-mode Codex hook entry: context-mode hook codex or hooks/codex/*.mjs",
  codexToml: "old context-mode config.toml [mcp_servers.context-mode*] section",
  hookFile: "old context-mode hook file context-mode.json (runs context-mode hook)",
  vscodeMcp: "old context-mode MCP entry servers.context-mode in .vscode/mcp.json: report only, never removed",
  kiroHook: "old Kiro hook entry: command contains context-mode and an old script name or context-mode hook",
  kiroAgentFile: "old context-mode Kiro agent file agents/*.json with name context-mode",
  kiroSteering: "old context-mode Kiro steering doc .kiro/steering/KIRO.md: manual review, report only, never removed",
  piNpm: "old context-mode Pi package npm:context-mode",
  opencodePlugin: "old context-mode OpenCode plugin spec context-mode",
  piGit: "old context-mode Pi entry git:github.com/mksglu/context-mode@release: ctx_upgrade replaces it with npm:context-mode@latest",
  opencodeGit: "old context-mode OpenCode entry git+https://github.com/mksglu/context-mode.git#release: ctx_upgrade replaces it with context-mode@latest",
  zcodeHook: "old context-mode ZCode hook entry: command contains context-mode hook",
  dataDir: "old context-mode data dir <agent home>/context-mode/",
  dataDirShared: "old context-mode data dir ~/.gemini/context-mode/: delete only after a prompt (Antigravity shares it)",
  dataRoot: "old context-mode content under ~/.context-mode/",
  tmpFile: "old context-mode temp file context-mode-* under the OS temp dir: report only, safe to keep",
  projectLink: "context-mode path in the project reached through a link: report only, upgrade keeps it as is and never follows a link",
} as const);
// ADR-0011 "reported with a fix, not removed" rows, Gemini data "only after a prompt" (a tool cannot prompt), and
// tmp context-mode-* (a live v1 server may own them), and the Kiro steering doc (A37: manual review): report only
// (D-M5-U1-4, D-M5-U1-5, D-M7-V2-2). Old release-branch entries: ctx_upgrade step 5 swaps them for the npm spec
// before v1 removal, so removal never cuts them (D-R44-DOCTOR-D4-GIT-1).
export const UPGRADE_REPORT_ONLY_REASONS: readonly string[] = Object.freeze<string[]>([V1_REASON.statusLine, V1_REASON.vscodeMcp, V1_REASON.dataDirShared, V1_REASON.tmpFile, V1_REASON.kiroSteering, V1_REASON.piGit, V1_REASON.opencodeGit, V1_REASON.projectLink]);
// D-SEC-V1-ASIDE-1: these whole-dir findings hold user data: moved aside and kept, never deleted.
export const UPGRADE_KEEP_ASIDE_REASONS: readonly string[] = Object.freeze<string[]>([V1_REASON.dataDir, V1_REASON.dataRoot]);

// Pi / OpenCode in-process entries (impl/12 §3.1 A21, §4.1 A28, §4.4 step 1).
export const PLUGIN_ID = SERVER_KEY;
export const PLUGIN_NAME = SERVER_KEY;
export const OPENCODE_TOOL_PREFIX = SERVER_KEY + "_";

// ops/plugin-root.ts, ops/host-config.ts (impl/07 §1-§2; DEVIATIONS D-M5-O1-1..3).
export const SERVER_ENTRY_FILE = "server.mjs"; // the MCP server bundle next to hook.mjs in the release root
export const VSCODE_WORKSPACE_VAR = "${workspaceFolder}"; // VS Code expands it in MCP server args (D-HF-VSCODE-PROJECT-1)
export const ROOTS_TIMEOUT_MS = 2000; // D-VSCODE-ROOTS-1: one roots/list round trip to the host, then the call goes on without it
export const OPENCODE_PLUGIN_PATH: readonly string[] = Object.freeze(["opencode", "plugin.js"]); // under the package dir (D-WIN-OCENTRY-1)
export const HOST_NODE_COMMAND = "node"; // MCP entry `command`
export const EXE_SUFFIX = ".exe"; // Windows node: "C:\\Program Files\\nodejs\\node.exe" (D-VT-DOCTOR-CMD-1)
export const HOST_CONFIG_TMP_SUFFIX = ".tmp"; // write <file>.tmp.<pid>, then rename over <file>
// ops/atomic-file.ts, DEVIATIONS D-WIN-ATOMIC-1: Windows refuses a rename over a file another process holds open.
export const ATOMIC_RENAME_RETRIES = 5; // retries after the first failed rename (6 tries in all)
export const ATOMIC_RENAME_DELAY_MS = 50; // wait between tries
export const ATOMIC_RENAME_BUSY_CODES: readonly string[] = ["EPERM", "EBUSY", "EACCES"]; // Windows "file in use" codes
export const ATOMIC_TMP_PREFIX = ".";
export const ATOMIC_TMP_MARK = ".cm-tmp-"; // <dir>/.<name>.cm-tmp-<pid>
export const HOST_CONFIG_TEXT_PATH = "(given text)"; // CONFIG_PARSE_FAILED <path> when mergeOwnEntries parses text with no file
export const JSON_INDENT_UNIT = "  "; // indent for a file with no indented member to copy from
export const MCP_COMMAND_FIELD = "command";
export const MCP_ARGS_FIELD = "args";
export const MCP_ENV_FIELD = "env"; // #1327 D-1327-CODEX-ENV-1: Codex passes this table to the MCP server process (mcp_types.rs env)
export const MCP_ENV_VARS_FIELD = "env_vars"; // #1327: Codex forwards these named vars from its own env
// The one host config file (segments under $HOME; VS Code: the name inside its user dir, ownMcpFileOf) and key path of context-mode's own MCP entry, for the
// agents whose MCP entry lives in a host config file (installMode config-mcp, mcp-entry, hooks+mcp).
// fields = host-required members of the entry next to command/args; also = sibling key paths the host needs set
// for the entry to load. D-HF-ZCODE-SHAPE-1: ZCode CLI docs usage/07-mcp.md, mcp.servers.<name> {type:"stdio",
// command, args, enabled, timeoutMs} and features.mcp true.
export interface OwnMcpEntry {
  file: readonly string[]; key: readonly string[];
  fields?: Readonly<Record<string, unknown>>; also?: readonly (readonly [readonly string[], unknown])[];
}
export const ZCODE_MCP_FEATURE_KEY = Object.freeze(["features", "mcp"] as const);
// D-N6-CODEX-DIRECT-1: Codex defers MCP tools behind tool_search; omit_tools_from = ["deferred"] (codex-rs
// config/src/mcp_types.rs, core/src/tools/spec_plan.rs apply_mcp_tool_exposure_policy) makes them direct tools.
export const CODEX_OMIT_TOOLS_FROM_FIELD = "omit_tools_from";
export const CODEX_OMIT_DEFERRED: readonly string[] = Object.freeze(["deferred"]);
// D-N7-CODEX-APPROVE-1: Codex asks approval for MCP tool calls; under approval policy "never" the call is refused.
// default_tools_approval_mode = "approve" (codex-rs config/src/mcp_types.rs RawMcpServerConfig, AppToolApproval
// auto|prompt|approve) lets our own read-only ctx tools run, the same key the plugin mcp.json sets.
export const CODEX_APPROVAL_MODE_FIELD = "default_tools_approval_mode";
export const CODEX_APPROVAL_APPROVE = "approve";
export const OWN_MCP_ENTRY: Readonly<Partial<Record<AgentId, OwnMcpEntry>>> = Object.freeze({
  codex: { file: [".codex", "config.toml"], key: ["mcp_servers", SERVER_KEY], fields: { [CODEX_OMIT_TOOLS_FROM_FIELD]: CODEX_OMIT_DEFERRED, [CODEX_APPROVAL_MODE_FIELD]: CODEX_APPROVAL_APPROVE } },
  vscode: { file: [VSCODE_MCP_FILE], key: ["servers", SERVER_KEY] },
  kiro: { file: [".kiro", "settings", "mcp.json"], key: ["mcpServers", SERVER_KEY] },
  zcode: {
    file: [".zcode", "cli", "config.json"], key: ["mcp", "servers", SERVER_KEY],
    fields: { type: "stdio", enabled: true, timeoutMs: EXEC_TIMEOUT_MS }, also: [[ZCODE_MCP_FEATURE_KEY, true]],
  },
});

// ctx_doctor report env lines (impl/07 §4, ADR-0014 §3; DEVIATIONS D-M5-O3-1). Header, rule, FAIL string and
// stored-report pointer are REPORT_HEADER, REPORT_HEADER_RULE, DOCTOR_FAIL_LINE, REPORT_REST_PREFIX above.
export const REPORT_INVALID = "<invalid>"; // ADR-0014 §3: a value that fails the typed scanner is dropped whole
export const REPORT_ENV_PREFIX = "env."; // one `env.<KEY>: <value>` line per env key, after the table
// ADR-0014 §3: an env value passes only as a member of its key's closed enum; every other value is REPORT_INVALID.
export const REPORT_ENV_ENUMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  NODE_ENV: Object.freeze(["development", "production", "test"]),
});

// D-DOCTOR-ISSUE-1 (owner 2026-11-03): the environment line above the ctx_doctor table, the docs link on each FAIL or
// UNKNOWN row, and the agent issue path (report file, gh line, prefilled form URL) when a row FAILs.
export const DOCTOR_ENV_PREFIX = "Environment: "; // one keyless line above the table
export const DOCTOR_DOCS_URL = "https://contextmode.ai/docs/engine/doctor"; // HTTP 200 on 2026-11-03; live anchors: checks, repair, help
export const DOCTOR_DOCS_ANCHOR = "checks";
export function DOCTOR_DOCS_LINK(check: string): string {
  return `${DOCTOR_DOCS_URL}?utm_source=ctx_doctor&utm_medium=doctor&utm_content=${check}#${DOCTOR_DOCS_ANCHOR}`;
}
export const DOCTOR_DOCS_LABEL = "Docs: ";
export function D3_NO_SETUP_FIX(agent: string): string { return `context-mode setup --agents ${agent}`; } // MCP entry and hooks both absent
export function D5_FIXTURE_FILE_ABSENT(file: string): string { return `hook fixture ${file} is absent: the round trip needs it`; }
export function D5_FIXTURE_PARSE(file: string, cause: string): string { return `the hook fixture file ${file} failed to parse: ${cause}`; }
export function D5_FIXTURE_AGENT_ABSENT(file: string, keys: readonly string[]): string { return `the hook fixture file ${file} records payloads for ${keys.join(", ") || "zero agents"} only`; }
export const DOCTOR_REPORTS_DIR = "reports"; // ~/.context-mode/reports/doctor-<utc>.md
export const DOCTOR_REPORT_FILE_PREFIX = "doctor-";
export const DOCTOR_REPORT_LINE = "Report file: ";
export const DOCTOR_GH_LINE = "File it: ";
export const DOCTOR_URL_LINE = "Or open: ";
export const DOCTOR_RULES_LINE = "Rules: "; // D-INTAKE-SCORE-1: the agent's filing rules, under the form URL
// D-DOCTOR-FIX-1: the gh command wraps; each next line starts with this and the line before ends with " \".
export const DOCTOR_GH_NEXT = "  --";
export const DOCTOR_NOTE_PREFIXES: readonly string[] = Object.freeze([
  DOCTOR_ENV_PREFIX, DOCTOR_DOCS_LABEL, DOCTOR_REPORT_LINE, DOCTOR_GH_LINE, DOCTOR_GH_NEXT.trim(), DOCTOR_URL_LINE, DOCTOR_RULES_LINE,
]);
export const ISSUE_REPO_SLUG = "mksglu/context-mode";
export const ISSUE_FORM_FILE = "agent-report.yml"; // .github/ISSUE_TEMPLATE/agent-report.yml
export const ISSUE_GUIDE_URL = `https://github.com/${ISSUE_REPO_SLUG}/blob/main/.github/AGENT_ISSUE.md`;
// D-INTAKE-SCORE-1: the numbered rules for the user's agent. AGENT_ISSUE.md and agent-report.yml print them word for
// word, and the intake bot (.github/scripts/issue-intake.mjs ITEMS) checks the same facts; tests/0014 pins all three.
export const ISSUE_AGENT_RULES: readonly string[] = Object.freeze([
  "Search for the same problem first: `gh issue list -R mksglu/context-mode --state all --search \"<check id or error>\"`. When one matches, add your facts there as a comment.",
  "File one bug per issue.",
  "Call the `ctx_doctor` tool and paste its full output unchanged in the `ctx-report` field.",
  "Give the versions: context-mode, the agent, the OS and arch, and Node.",
  "Write numbered repro steps that start from a fresh project (`mktemp -d`) and the agent's own install command.",
  "Give the exact command and its exact output in a fenced code block.",
  "Say what you expected and what happened instead.",
  "Name the source file and line when you found the cause.",
  "Replace every secret with `<masked>` and the home folder with `~` before you send.",
]);
export const ISSUE_URL_MAX = 8000; // the prefilled form URL holds the title and the summary fields only
// The report file is the issue body: one "### <label>" section per form field, in the form's order.
export const ISSUE_FORM_HEADINGS: readonly string[] = Object.freeze([
  "Summary", "ctx-report", "What happened", "Hook errors", "Journal rows", "Agent config", "Expected", "Steps", "Environment",
]);
export const DOCTOR_HOOK_LOG_LINES = 50;
export const DOCTOR_JOURNAL_ROWS = 30;
export const DOCTOR_CONFIG_LINES = 40; // config lines that name context-mode or hook.mjs, per file
export const DOCTOR_ENV_NAMES: readonly string[] = Object.freeze([
  "CODEX_HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_PLUGIN_ROOT", "COPILOT_HOME", "KIRO_HOME", "OPENCODE_CONFIG_DIR", "PI_CODING_AGENT_DIR", "XDG_CONFIG_HOME", "SHELL",
]);
export const DOCTOR_PATH_TOOLS: readonly string[] = Object.freeze(["node", "git", "sh"]);
export const DOCTOR_SECRET_WORDS: readonly string[] = Object.freeze(["token", "secret", "password", "apikey", "api_key", "authorization", "bearer"]);
export const DOCTOR_MASK = "<masked>";
// D-DOCTOR-ISSUE-1: each agent's own native install command (docs/install/<agent>.md, first code block), so the
// report names the route the user took and the repro script reinstalls the same way (owner rule: native install first).
export const NATIVE_INSTALL: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "claude-code": ["claude plugin marketplace add mksglu/context-mode", "claude plugin install context-mode@context-mode"],
  codex: ["codex plugin marketplace add mksglu/context-mode", "codex plugin add context-mode@context-mode"],
  gemini: ["gemini extensions install https://github.com/mksglu/context-mode"],
  qwen: ["qwen extensions install https://github.com/mksglu/context-mode:context-mode"],
  opencode: ["opencode plugin add context-mode"],
  pi: ["pi install npm:context-mode"],
  "copilot-cli": ["npm i -g context-mode", "context-mode setup --agents copilot-cli"],
  vscode: ["npm i -g context-mode", "context-mode setup --agents vscode"],
  kiro: ["npm i -g context-mode", "context-mode setup --agents kiro"],
  zcode: ["zcode plugins marketplace add mksglu/context-mode", "zcode plugins install context-mode@context-mode"],
});
export const ISSUE_FORM_URL = `https://github.com/${ISSUE_REPO_SLUG}/issues/new?template=${ISSUE_FORM_FILE}`; // + &title=&summary=
export const DOCTOR_GIT_VERSION_TIMEOUT_MS = 5000; // git --version for the report file only
export const DOCTOR_LOG_TAIL_BYTES = 262144; // hook-errors.log tail read for the last DOCTOR_HOOK_LOG_LINES lines

