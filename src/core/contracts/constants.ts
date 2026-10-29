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
export const REPLACE_TRIGGER_BYTES = 4096;
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
export const SCHEMA_VERSION = 5; // ADR-0002 decision 2: PRAGMA user_version; 2 = cost dedup index (D-M5-arch-2); 3 = chunks title + porter (D-SEARCH-3); 4 = trigram table + vocab (D-SEARCH-4); 5 = line_units (r3-ledger)
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
export const PATHEXT_DEFAULT = ".COM;.EXE;.BAT;.CMD"; // impl/03 §2 step 3: Windows PATHEXT when the env var is unset
export const FETCH_MAX_HOPS = 5; // impl/03 §6 step 5: redirect hops; one more is FETCH_FAILED
export const SOURCE_LABEL_MAX_CHARS = 80; // impl/04 §2.3 step 15, §4 step 7: label = "<tool>:" + first line of the code, at most 80 chars
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
export const FRONTMATTER_FENCE = "---";
export const FRONTMATTER_TOOLS_KEY = "tools";
export const FRONTMATTER_DISALLOWED_KEY = "disallowedTools";
export const MCP_SERVER_TOOL_PREFIX = "mcp__"; // Claude-shape MCP name; a bare "mcp__<server>" rule covers all its tools
export const MCP_NAME_JOIN = "__"; // Claude-shape join between server and tool name
export const GEMINI_MCP_PREFIX = "mcp_"; // generateValidName(): "mcp_" + server + "_" + tool (ADR-0016 Gemini row)
export const GEMINI_NAME_EXTRA_CHARS = "_-.:"; // kept besides A-Z a-z 0-9; any other char becomes "_"

// D-M7-RR-2: no caller since the hints are retired; kept because tests/v2/contracts pins it.
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
export const README_MAX_LINES = 200; // ADR-0015: CI cap on README.md length

// Enforcement (M3; impl/08 §2.3 step 2a, §2.4, §6.1 steps 3, 5b, 5d, 6, §6.2; DEVIATIONS D-M3-arch-5:
// the text templates are fixed strings here; the Read deny is a src/prompt template, D-DU-DENY-1).
export const MAX_NEST_DEPTH = 32; // impl/08 §2.3 step 2a, ADR-0008 "Parse errors": deeper -> construct "nesting-too-deep"

// impl/08 §6.1 step 6: Read (or one-file shell dump) over OUTPUT_CAP with no offset/limit. The text is the
// src/prompt/hooks/read-deny.md template (D-DU-DENY-1, src/core/policy/read-deny.ts); this caps its fixed bytes.
export const READ_DENY_FIXED_CAP = 120;

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

// impl/08 §6.1 step 5d, DECISIONS-r9 E4. D-M7-RR-2: step 5d (bounded -> no hint) is retired with the hints; the
// set stays only because tests/v2/contracts pins it (not owned by this change).
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
export const READ_PATH_KEYS = Object.freeze(["file_path", "absolute_path", "path"] as const);

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
export const RELEASE_REPO_URL = "https://github.com/mksglu/context-mode.git"; // git ls-remote <repo> release
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
export const REPORT_SOURCE_LABEL = "ctx_doctor:report"; // D-NO-LOSSY-CUT-1: the full report is stored under this label when it is over REPORT_CAP
export const REPORT_REST_PREFIX = "Rows not shown here are stored in full. Read them with: "; // + moreLine(...) pointer
export const REPORT_POINTER = `ctx_search({queries:["FAIL","PASS","UNKNOWN"], source:${JSON.stringify(REPORT_SOURCE_LABEL)}})`; // every row holds one status word, so these three queries reach every stored row
export function DOCTOR_FAIL_LINE(host: string, check: string, cause: string, command: string): string {
  return `FAIL ${host}: ${check} — ${cause}. Fix: ${command}`; // ADR-0010 per-host FAIL string, impl/07 §4 step 2
}
export const DOCTOR_FIX_UPGRADE = "run ctx_upgrade"; // D1, D3, D4, D8 stale schema
export const D1_NO_NETWORK_DETAIL = "no network"; // UNKNOWN
export const D1_DEV_BUILD_DETAIL = "dev build"; // UNKNOWN: BUNDLE_SHA unset (D-M5-arch-5)
export const D1_UPDATE_DETAIL = "update available"; // FAIL (D-M5-arch-5)
export const GIT_LS_REMOTE = "ls-remote"; // git ls-remote <RELEASE_REPO_URL> <RELEASE_BRANCH>
export const D2_NODE_FIX = `install Node ${NODE_MIN} or later`;
export function D2_NODE_DETAIL(version: string): string { return `Node ${version} is below ${NODE_MIN}`; }
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
export function D7_DETAIL(got: string): string { return `resolved project source ${got} does not match the host's actual cwd`; }
export const D7_FIX = "restart the agent in the correct directory";
export function D8_STALE_SCHEMA_DETAIL(got: number, want: number): string { return `stale schema (v${got}, expected v${want})`; }
export const D8_INTEGRITY_DETAIL = "integrity_check failed";
export const D8_INTEGRITY_FIX = "doctor will heal context.db on the next run";
export const D8_HEALED_LOSSLESS_DETAIL = "healed (lossless)";
export function D8_HEALED_RECREATE_DETAIL(ts: string): string { return `healed by recreate — old data kept at context.db.${ts}.bak`; }
export const INTEGRITY_OK = "ok"; // PRAGMA integrity_check single-row pass value
export const HEAL_BACKUP_SUFFIX = ".bak"; // <file>.<ts>.bak
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
export const UPGRADE_CHECKOUT_AREA = "plugin checkout"; // step 4 git checkout (pi, opencode)
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
export const UPGRADE_GIT_TIMEOUT_MS = 120000; // git clone of the release branch
export const GIT_CLONE_ARGS = Object.freeze(["clone", "--depth", "1", "--branch"] as const); // + RELEASE_BRANCH, url, dir
export const GIT_HEAD_SHA_ARGS = Object.freeze(["rev-parse", "HEAD"] as const);
export const UPGRADE_FETCH_DIR_PREFIX = ".fetch-"; // <DATA_ROOT>/plugins/<agent>/.fetch-<pid> before rename to <sha>
export const SUMS_LINE_SEP = "  "; // SHA256SUMS line: "<hex>  <relative/path>" (impl/13 §4)
export const SUMS_HASH_ALGORITHM = "sha256";
export const UPGRADE_GIT_CHECKOUT_AGENTS: readonly AgentId[] = Object.freeze<AgentId[]>(["pi", "opencode"]); // impl/07 §6 step 4 "plugin" (git checkout)
export const UPGRADE_HOST_MANUAL = "update with the host's own install command, then restart"; // no UPGRADE_HOST_COMMAND row (D-M5-U1-2)
export const UPGRADE_CONFIG_AREA = "host config"; // uninstall step 3 when no own entry exists
export const UPGRADE_OWN_ENTRY = "context-mode entry"; // uninstall step 3 "before" cell
export const UPGRADE_CACHE_BY_HAND = "remove the release dir by hand: its place is your choice"; // config-entry installs (D-M5-U1-3)
export const GIT_NO_PROMPT_ENV: Readonly<Record<string, string>> = Object.freeze({ GIT_TERMINAL_PROMPT: "0" }); // never wait on a credential prompt
// D-M7-CI-1: release-fetch sets core.autocrlf=false by env (argv stays as the spec), so clone bytes match SHA256SUMS.
export const GIT_NO_CRLF_ENV: Readonly<Record<string, string>> = Object.freeze({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" });
export const GIT_NOT_STARTED = "git did not start"; // FETCH_FAILED <code> when git is not on PATH
export const GIT_BIN = "git";
// D-VT-WINBASH-1: Windows shell languages resolve to Git Bash. Paths from the dir of git.exe, in order:
// <root>\cmd\git.exe and <root>\bin\git.exe -> ../bin/bash.exe; <root>\mingw64\bin\git.exe -> ../../bin/bash.exe.
export const WIN_SHELL_LANGS: readonly string[] = Object.freeze(["shell", "bash", "sh"]);
export const GIT_BASH_RELATIVE: readonly (readonly string[])[] = Object.freeze([["..", "bin", "bash.exe"], ["..", "..", "bin", "bash.exe"]]);
export const GIT_EXIT_LABEL = "git exit "; // FETCH_FAILED <code>: git exit <n>: <stderr>
export const UPGRADE_TRASH_SUFFIX = ".ctx-upgrade-removing"; // a removed path is renamed here first, deleted on commit (rollback)
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
  "release-fetch.ts", "verify-sums.ts", "plugin-swap.ts", "host-write.ts", "v1-remove.ts", "uninstall.ts",
] as const);
// doctor-env.ts: D1 version, D2 Node and node:sqlite, D6 MCP (impl/07 §5).
export const SQLITE_MODULE = "node:sqlite"; // D2: await import(SQLITE_MODULE)
export const NODE_VERSION_PREFIX = "v"; // process.version "v24.15.0" -> compare "24.15.0" with NODE_MIN
export const NODE_VERSION_SEP = "."; // major.minor.patch, compared as numbers
export const LS_REMOTE_FIELD_SEP = "\t"; // git ls-remote line: "<sha>\t<ref>"
export const GIT_SHA_HEX_LEN = 40; // a full commit sha
export const DOCTOR_GIT_TIMEOUT_MS = 10000; // D1 git ls-remote; a timeout is "no network" (UNKNOWN)
export const DOCTOR_PASS_DETAIL = "ok"; // detail of a PASS row with nothing more to say
// doctor-config.ts: D3 host config, D4 old entries, D7 project (impl/07 §5).
export const D3_PART_JOIN = ", ";
export function D3_DETAIL(parts: readonly string[]): string { return `wrong: ${parts.join(D3_PART_JOIN)}`; }
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
export function D5_SLOW_DETAIL(ms: number): string { return `hook round trip took ${ms} ms, over ${HOOK_P95_MS} ms`; }
export const D5_FIX = "run ctx_upgrade"; // a broken hook entry is a broken install
// doctor-db.ts: D8 checks, D9 counts, D10 mode (impl/07 §5).
export const PRAGMA_INTEGRITY_CHECK = "PRAGMA integrity_check";
export function D10_DETAIL(mode: string): string { return `enforcement mode: ${mode}`; }
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
// ADR-0011 "Release steps" c): host update commands for host-managed agents. Copilot CLI: "test first" (no command yet).
export const UPGRADE_HOST_COMMAND: Readonly<Partial<Record<AgentId, string>>> = Object.freeze({
  "claude-code": "claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode",
  codex: "rewrite config.toml's [mcp_servers.context-mode*] block to the v2 entry, then restart Codex",
  gemini: "gemini extensions install https://github.com/mksglu/context-mode --ref release --auto-update",
  qwen: "qwen extensions install https://github.com/mksglu/context-mode --ref release --auto-update",
});
export const PI_GIT_PACKAGE = "git:github.com/mksglu/context-mode@release"; // ADR-0011 Pi row
export const OPENCODE_GIT_SPEC = "git+https://github.com/mksglu/context-mode.git#release"; // ADR-0011 OpenCode row

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
export const V1_OPENCODE_PLUGIN_SPEC = "context-mode"; // bare npm spec in .plugin[]
export const V1_TMP_PREFIX = "context-mode-"; // <os tmp>/context-mode-*
export const V1_TOML_SECTION_ROOT = "mcp_servers"; // codex config.toml: v1 wrote [mcp_servers.context-mode] and its .tools.* tables (D-DOC-RT-1)
export const V1_HOOKS_DIR_NAME = "hooks";
export const SETTINGS_FILE = "settings.json"; // claude-code, gemini, qwen; pi under agent/
export const CLAUDE_USER_CONFIG_FILE = ".claude.json"; // $HOME/.claude.json
export const HOOKS_JSON_FILE = "hooks.json"; // codex, zcode cli/
export const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR"; // D-WF-CC-CONFIG-1: Claude Code user dir override (default ~/.claude)
export const CODEX_HOME_ENV = "CODEX_HOME"; // D-N6-CODEX-HOME-2: Codex reads config.toml and hooks.json from here (default ~/.codex)
export const COPILOT_HOME_ENV = "COPILOT_HOME"; // D-WIN-COPILOT-HOME-1: Copilot CLI replaces ~/.copilot as a whole with it (hooks/, skills/)
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
  zcodeHook: "old context-mode ZCode hook entry: command contains context-mode hook",
  dataDir: "old context-mode data dir <agent home>/context-mode/",
  dataDirShared: "old context-mode data dir ~/.gemini/context-mode/: delete only after a prompt (Antigravity shares it)",
  dataRoot: "old context-mode content under ~/.context-mode/",
  tmpFile: "old context-mode temp file context-mode-* under the OS temp dir: report only, no action needed",
} as const);
// ADR-0011 "reported with a fix, not removed" rows, Gemini data "only after a prompt" (a tool cannot prompt), and
// tmp context-mode-* (a live v1 server may own them), and the Kiro steering doc (A37: manual review): report only
// (D-M5-U1-4, D-M5-U1-5, D-M7-V2-2).
export const UPGRADE_REPORT_ONLY_REASONS: readonly string[] = Object.freeze<string[]>([V1_REASON.statusLine, V1_REASON.vscodeMcp, V1_REASON.dataDirShared, V1_REASON.tmpFile, V1_REASON.kiroSteering]);

// Pi / OpenCode in-process entries (impl/12 §3.1 A21, §4.1 A28, §4.4 step 1).
export const PLUGIN_ID = SERVER_KEY;
export const PLUGIN_NAME = SERVER_KEY;
export const OPENCODE_TOOL_PREFIX = SERVER_KEY + "_";

// ops/plugin-root.ts, ops/host-config.ts (impl/07 §1-§2; DEVIATIONS D-M5-O1-1..3).
export const SERVER_ENTRY_FILE = "server.mjs"; // the MCP server bundle next to hook.mjs in the release root
export const VSCODE_WORKSPACE_VAR = "${workspaceFolder}"; // VS Code expands it in MCP server args (D-HF-VSCODE-PROJECT-1)
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
