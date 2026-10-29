import{createRequire as __cmRequire}from"node:module";if(typeof process.getBuiltinModule!=="function")process.getBuiltinModule=(id)=>__cmRequire(import.meta.url)(id);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/contracts/constants.ts
var SERVER_KEY = "context-mode";
var TOOL_ORDER = Object.freeze(["ctx_execute", "ctx_batch", "ctx_index", "ctx_search", "ctx_resume", "ctx_stats", "ctx_doctor", "ctx_upgrade", "ctx_purge"]);
function prefixToolNames(text, prefix) {
  if (prefix === "") return text;
  let out = text;
  for (const name of TOOL_ORDER) out = out.split(name).join(prefix + name);
  return out;
}
var OUTPUT_CAP = 16384;
var STATE_BUDGET = 2048;
var RESUME_CAP = 2048;
var REPORT_CAP = 4096;
var POINTER_MIN = 640;
var STATE_CLOSE_TAG = "</context_mode_state>";
var INDEX_WRITE_CHUNK = 1048576;
var SYNC_INDEX_MAX_BYTES = 65536;
var REPLACE_TRIGGER_BYTES = 4096;
var REPLACE_RETURN_BYTES = 96;
var SHAPE_RETURN_BYTES = 256;
var REPLACE_CHUNK_BYTES = 48;
function REPLACE_HANDLE_LINE(intent, handle, bytes4, prefix = "", asked = "") {
  const queries = asked === "" ? [intent] : [intent, asked];
  return prefix + "ctx_search({queries:[" + queries.map((q) => JSON.stringify(q)).join(",") + "], source:" + JSON.stringify(handle) + "}) searches the whole output (" + bytes4 + " B).";
}
var HANDLE_PROMPT_WORDS = 3;
var MAX_CHUNK_BYTES = 4096;
var SEARCH_PAGE_SIZE = 20;
var SNIPPET_MAX_BYTES = 800;
var SNIPPET_CODE_MAX_BYTES = 2048;
var MAX_CANDIDATES = 85;
var MAX_CANDIDATES_TOTAL = 340;
var WEIGHT = Object.freeze({ toolerr: 900, decision: 700, prompt: 500, edit: 400, index: 200 });
var RATIO_SECTION_DECAY = 0.7;
var MMR_RELEVANCE_WEIGHT = 0.7;
var MMR_REDUNDANCY_WEIGHT = 0.3;
var DECAY_X1000 = Object.freeze([
  1e3,
  881,
  780,
  696,
  625,
  565,
  515,
  473,
  438,
  408,
  383,
  361,
  344,
  329,
  316,
  306,
  297,
  289,
  283,
  278,
  273,
  270,
  267,
  264,
  262,
  260,
  258,
  257,
  256,
  255,
  254,
  253,
  253,
  252,
  252,
  252,
  251,
  251,
  251,
  251,
  251,
  251,
  251,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250,
  250
]);
var COMPACT_POINTER_LINE = 'context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").';
var RRF_K = 60;
var SOURCE_HANDLE_MAX_DIGITS = 10;
var EXEC_TIMEOUT_MS = 6e5;
var KILL_GRACE_MS = 1e3;
var DB_TIMEOUT_MS = 5e3;
var DB_WAL_SUFFIX = "-wal";
var DB_SHM_SUFFIX = "-shm";
var DB_TMP_SUFFIX = ".tmp";
var SQLITE_PRIMARY_CODE_MASK = 255;
var SQLITE_CORRUPT_CODE = 11;
var SQLITE_NOTADB_CODE = 26;
var HOOK_P95_MS = 40;
var HOOK_TIMEOUT_MS = 5e3;
var IN_PROCESS_TIMEOUT_MS = 0;
var PROJECT_KEY_HEX_LEN = 16;
var SCHEMA_VERSION = 5;
var RETENTION_SIZE_CAP_BYTES = 524288e3;
var PROJECTS_DIR_NAME = "projects";
var DB_FILE_NAME = "context.db";
var OWNERS_DIR_NAME = "owners";
var OWNER_PID_EXT = ".pid";
var GIT_DIR_NAME = ".git";
var GIT_WORKTREE_LINE_PREFIX = "worktree ";
var GITDIR_FILE_PREFIX = "gitdir: ";
var GIT_COMMONDIR_FILE = "commondir";
var GIT_HEAD_FILE = "HEAD";
var WORKSPACE_FOLDER_FLAG = "--workspace-folder";
var EXEC_LANGUAGES = Object.freeze(["shell", "powershell", "javascript", "typescript", "python"]);
var PATHEXT_DEFAULT = ".COM;.EXE;.BAT;.CMD";
var FETCH_MAX_HOPS = 5;
var SOURCE_LABEL_MAX_CHARS = 80;
var CANCELLED_LINE = "Cancelled.";
var BACKGROUND_REPLY_PREFIX = "started in background, pid ";
var PLAIN_OUTPUT_ENV = Object.freeze({ NO_COLOR: "1", FORCE_COLOR: "0" });
var HOST_SESSION_ENV = Object.freeze({ "claude-code": "CLAUDE_CODE_SESSION_ID" });
var NODE_MIN = "24.15.0";
var DATA_ROOT = "~/.context-mode";
var INTERNAL_ERROR_LINE = "Internal error. Fix: run ctx_doctor.";
var REQUIRE_SECURITY_ENV = "CONTEXT_MODE_REQUIRE_SECURITY";
var HOST_CONFIG_DIR_NAME = ".claude";
var AGENTS_DIR_NAME = "agents";
var AGENT_FILE_EXT = ".md";
var HOST_PLUGINS_DIR_NAME = "plugins";
var INSTALLED_PLUGINS_FILE = "installed_plugins.json";
var PLUGIN_AGENT_SEPARATOR = ":";
var PLUGIN_KEY_SEPARATOR = "@";
var FRONTMATTER_FENCE = "---";
var FRONTMATTER_TOOLS_KEY = "tools";
var FRONTMATTER_DISALLOWED_KEY = "disallowedTools";
var MCP_SERVER_TOOL_PREFIX = "mcp__";
var MCP_NAME_JOIN = "__";
var GEMINI_MCP_PREFIX = "mcp_";
var GEMINI_NAME_EXTRA_CHARS = "_-.:";
var MCP_HINT_EVERY_DEFAULT = 10;
function readHintEvery(raw) {
  if (raw === void 0 || raw.trim() === "") return MCP_HINT_EVERY_DEFAULT;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : MCP_HINT_EVERY_DEFAULT;
}
var MCP_HINT_EVERY = readHintEvery(process.env.CTX_MCP_HINT_EVERY);
var MAX_NEST_DEPTH = 32;
var DENY_PREFIX = "context-mode: ";
var DENY_WHAT = Object.freeze({
  curl: "This curl/wget call",
  http: "This inline HTTP call",
  build: "This build command",
  webfetch: "WebFetch"
});
var DENY_WHAT_SUFFIX = " sends its body into the conversation.";
var DENY_RUN_HERE_LINE = "Run it here instead; the full output is indexed and only the part that matches your intent comes back.";
var DENY_TOOL_LABEL = "Tool: ";
var DENY_INTENT_DEFAULT = "state what you need";
var DENY_EXEC_TOOL = "ctx_execute";
var DENY_WEBFETCH_TOOLS = Object.freeze(["ctx_index", "ctx_search"]);
var USER_DENY_REASON_PREFIX = "Blocked by security policy: matches deny pattern ";
var POLICY_UNREADABLE_LINE = "context-mode: your deny rules could not be read. Fix: run ctx_doctor.";
var PARSE_ERROR_DENY_LINE = "context-mode: could not parse this command; it may be blocked by your own rules. Run it through ctx_execute instead.";
var HOOK_ERROR_LOG_FILE = "hook-errors.log";
var HOOK_LOG_TAIL_BYTES = 65536;
var HOOK_FAIL_TOOL_KEYS = Object.freeze(["tool_name", "toolName", "tool"]);
var HOOK_FAIL_EVENT_KEYS = Object.freeze(["hook_event_name", "hookEventName", "type"]);
var HOOK_FAIL_INPUT_KEYS = Object.freeze(["tool_input", "toolArgs", "input", "args"]);
var HOOK_FAIL_CWD_KEYS = Object.freeze(["cwd", "directory"]);
var HOOK_FAIL_PRE_EVENTS = Object.freeze(["pretooluse", "beforetool", "tool_call", "execute.before", "tool.execute.before"]);
var HOOK_FAULT_ENV = "CM_HOOK_FAULT";
var HOOK_FAULT_STAGES = Object.freeze(["decode", "project", "policy", "store", "encode"]);
var HOOK_FAIL_TOOLS = Object.freeze({
  shell: Object.freeze(["Bash", "bash", "shell"]),
  read: Object.freeze(["Read", "read_file"]),
  grep: Object.freeze(["Grep", "grep_search"]),
  fetch: Object.freeze(["WebFetch", "web_fetch", "fetch"])
});
function HOOK_FAIL_LINE(label, prefix) {
  return `${DENY_PREFIX}the hook failed (${label}). Fix: run ${prefix}ctx_doctor.`;
}
var HOOK_FAIL_REDIRECT = Object.freeze({
  read: "Read the file in parts with offset and limit, or process it with ctx_execute(language, code); only what you print comes back.",
  shell: "Run the command with ctx_execute(language, code) or ctx_batch instead; only the part that matches your intent comes back.",
  grep: "Search with ctx_execute(language, code), or index the files with ctx_index and query them with ctx_search.",
  fetch: "Index the URL with ctx_index and query it with ctx_search."
});
function D5_LAST_HOOK_ERROR(ts, stage, label) {
  return `; last hook error ${ts} at ${stage} (${label}), stack in ${HOOK_ERROR_LOG_FILE}`;
}
var BOUNDED_COMMANDS = Object.freeze(["pwd", "whoami", "uname", "id", "realpath", "ln"]);
var BOUNDED_GIT_SUBCOMMANDS = Object.freeze(["status"]);
var VERSION_PROBE_FLAGS = Object.freeze(["--version", "-v"]);
var BOUNDED_UNLESS_VERBOSE = Object.freeze(["cp", "mv", "rm"]);
var VERBOSE_FLAGS = Object.freeze(["-v", "--verbose"]);
var JQ_WHITELIST = Object.freeze({ identity: ".", length: "length", pipeLength: "| length", fieldSep: "." });
var TOOL_PREFIX_SLOT = "{prefix}";
var DENY_WEBFETCH_JOIN = ", then ";
var POLICY_UNREADABLE_WARNING = "context-mode: your deny rules could not be read, so they are not applied. Fix: run ctx_doctor.";
var NEVER_DENY_HOSTS = Object.freeze(["claude.ai", "claude.site", "claudeusercontent.com"]);
var CURL_COMMANDS = Object.freeze(["curl", "wget"]);
var CURL_SILENT_FLAGS = Object.freeze({ curl: { short: "s", long: "--silent" }, wget: { short: "q", long: "--quiet" } });
var CURL_VERBOSE_FLAGS = Object.freeze(["-v", "--verbose", "--trace", "--trace-ascii"]);
var CURL_DUMP_HEADER_FLAG = "-D";
var BUILD_COMMANDS = Object.freeze(["gradlew", "gradle", "mvnw", "mvn", "sbt"]);
var FETCH_CALL = "fetch(";
var FETCH_QUOTES = "'\"`";
var HTTP_SCHEME = "http";
var INLINE_HTTP_CALLS = Object.freeze(["requests.get(", "requests.post(", "requests.put(", "http.get(", "http.request("]);
var SHELL_DUMP_COMMANDS = Object.freeze(["cat", "head", "tail", "sed", "less", "jq", "bat", "more"]);
var DUMP_COUNT_COMMANDS = Object.freeze(["head", "tail"]);
var DUMP_COUNT_FLAGS = Object.freeze(["-n", "-c", "--lines", "--bytes"]);
var SED_COMMAND = "sed";
var SED_QUIET_FLAGS = Object.freeze(["-n", "--quiet", "--silent"]);
var JQ_COMMAND = "jq";
var READ_PATH_KEYS = Object.freeze(["file_path", "absolute_path", "path"]);
var OWN_TOOL_PREFIX = "ctx_";
var SHELL_TOOL = "Bash";
var EDIT_TOOLS = Object.freeze(["Write", "Edit"]);
var EDIT_PATH_KEYS = Object.freeze(["file_path", "path"]);
var EXIT_CODE_LINE_PREFIX = "Exit code ";
var RESUME_HINT_KEY = "resume-hint";
var COMPACT_STATE_KEY = "compact-state";
var PENDING_COMPACT_KEY = "pending-compact";
var PENDING_COMPACT_META_PREFIX = "pending_compact:";
var PENDING_COMPACT_FLAG = "1";
var RECALL_BUDGET_BYTES = 2048;
var RECALL_MIN_SCORE = 5;
var RECALL_MAX_ROWS = 340;
var COMPACTED_META_PREFIX = "compacted:";
var RECALL_UNITS_SEEN_META_PREFIX = "recall_units_seen:";
var RECALL_UNIT_CANDIDATES = 64;
var RECALL_SEEN_META_PREFIX = "recall_seen:";
var RECALL_OPEN_TAG = "<context_mode_recall>";
var RECALL_CLOSE_TAG = "</context_mode_recall>";
var RECALL_KEY = "recall";
var RESUME_HINT = "This session may have run before. Call {prefix}ctx_resume for a summary of what happened.";
var SUBAGENT_SOURCE_PREFIX = "subagent:";
var RUN_WRAPPER_FILE = "run.mjs";
var RUN_WRAPPER_NODE = "node";
var SUBAGENT_RUN_DENY = "context-mode: This command sends its body into the conversation.\nRun the command on the line above with Bash instead. It runs the same command in the same folder, indexes the full output and prints only the part that matches your intent, with the same exit code.";
var AGENT_ARG = "--agent";
var DECAY_SCALE = 1e3;
var PERCENT_SCALE = 100;
var SQLITE_BUSY_CODE = 5;
var RESUME_UNKNOWN_FIELD_LINE = "ctx_resume: unknown field \u2014 only session and seq are accepted.";
var RESUME_NO_SESSION_LINE = "ctx_resume: no session id \u2014 pass session or call from an active session.";
function RESUME_NO_ROW_LINE(seq) {
  return `ctx_resume: no row at seq ${seq} for this session.`;
}
var RESUME_EMPTY_LINE = "ctx_resume: no journal rows for this session yet.";
var STATS_UNKNOWN_FIELD_LINE = "ctx_stats: unknown field \u2014 this tool takes no arguments.";
function STATS_SUMMARY(allTimePct, sessionPct) {
  return `ctx_stats: ${allTimePct}% kept out all-time, ${sessionPct}% this session.`;
}
var STATS_COLUMNS = Object.freeze(["Scope", "Produced", "Returned", "Saved", "Reduction %"]);
var STATS_NO_DATA = "no data \u2014 no tool calls recorded yet";
var PURGE_SCOPES = Object.freeze(["session", "source", "project"]);
var PURGE_NO_SCOPE_LINE = "ctx_purge: pick one scope \u2014 session, source, or project.";
var PURGE_MANY_SCOPES_LINE = "ctx_purge: pick only one scope \u2014 session, source, or project.";
var PURGE_BUSY_LINE = "ctx_purge: database busy \u2014 try again.";
function PURGE_SUMMARY(rows, scope) {
  return `ctx_purge: deleted ${rows} rows (scope: ${scope}). This cannot be undone.`;
}
var DECISION_SOURCE = "decision";
var DECISION_USER_LABEL = "decision (user)";
var DECISION_TOOL = "AskUserQuestion";
var DECISION_ANSWERS_KEY = "answers";
var DECISION_OPTION_KEY = "option";
var DECISION_LABEL_JOIN = " | ";
var RELEASE_REPO_URL = "https://github.com/mksglu/context-mode.git";
var RELEASE_BRANCH = "release";
var BUNDLE_SHA = true ? "a66617dc9637c129dbf43f4a8c07cdc689884a22" : void 0;
var DOCTOR_CHECK_ORDER = Object.freeze(["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"]);
var DOCTOR_LABEL = Object.freeze({
  D1: "version",
  D2: "node",
  D3: "host config",
  D4: "old entries",
  D5: "hook round trip",
  D5b: "double-fire",
  D6: "MCP",
  D7: "project and worktree",
  D8: "context.db",
  D9: "index",
  D10: "enforcement mode",
  D11: "shell"
});
var HOOK_FIXTURE_DIR = "fixtures";
var HOOK_FIXTURE_FILE = "hook-roundtrip.json";
var HOOK_ENTRY_FILE = "hook.mjs";
var REPORT_HEADER = "| Check | Status | Detail | Fix |";
var REPORT_HEADER_RULE = "|---|---|---|---|";
var REPORT_COMMAND_PREFIX = "Run in a terminal: ";
var ECHO_MAX_BYTES = 256;
var REPORT_SOURCE_LABEL = "ctx_doctor:report";
var REPORT_REST_PREFIX = "Rows not shown here are stored in full. Read them with: ";
var REPORT_POINTER = `ctx_search({queries:["FAIL","PASS","UNKNOWN"], source:${JSON.stringify(REPORT_SOURCE_LABEL)}})`;
function DOCTOR_FAIL_LINE(host, check2, cause, command) {
  return `FAIL ${host}: ${check2} \u2014 ${cause}. Fix: ${command}`;
}
var DOCTOR_FIX_UPGRADE = "run ctx_upgrade";
var D1_NO_NETWORK_DETAIL = "no network";
var D1_DEV_BUILD_DETAIL = "dev build";
var D1_UPDATE_DETAIL = "update available";
var GIT_LS_REMOTE = "ls-remote";
var D2_NODE_FIX = `install Node ${NODE_MIN} or later`;
function D2_NODE_DETAIL(version2) {
  return `Node ${version2} is below ${NODE_MIN}`;
}
var D2_SQLITE_DETAIL = "node:sqlite failed to load";
var D2_SQLITE_FIX = "run ctx_doctor";
function D2_BUN_DETAIL(version2) {
  return `running under Bun ${version2}`;
}
var D3_PARTS = Object.freeze(["MCP entry", "hook entries", "hook timeout"]);
var D4_REASON_JOIN = "; ";
var D5_CODEX_UNTRUSTED_DETAIL = "Codex hooks not trusted";
function D5_NO_FIXTURE_DETAIL(agent) {
  return `no recorded fixture for ${agent}`;
}
var D5B_DETAIL = "both Claude Code hooks and VS Code chat.useClaudeHooks are active for this repo";
var D5B_FIX = "disable chat.useClaudeHooks or the Claude Code hooks block";
var VSCODE_CLAUDE_HOOKS_SETTING = "chat.useClaudeHooks";
var VSCODE_SETTINGS_FILE = "settings.json";
var D6_UNKNOWN_DETAIL = "no clientInfo or protocolVersion on the request";
function D7_DETAIL(got) {
  return `resolved project source ${got} does not match the host's actual cwd`;
}
var D7_FIX = "restart the agent in the correct directory";
function D8_STALE_SCHEMA_DETAIL(got, want) {
  return `stale schema (v${got}, expected v${want})`;
}
var D8_INTEGRITY_DETAIL = "integrity_check failed";
var D8_INTEGRITY_FIX = "doctor will heal context.db on the next run";
var D8_HEALED_LOSSLESS_DETAIL = "healed (lossless)";
function D8_HEALED_RECREATE_DETAIL(ts) {
  return `healed by recreate \u2014 old data kept at context.db.${ts}.bak`;
}
var INTEGRITY_OK = "ok";
var HEAL_BACKUP_SUFFIX = ".bak";
function D9_INDEX_DETAIL(sources, chunks) {
  return `${sources} sources, ${chunks} chunks indexed`;
}
var PLUGIN_CACHE_DIR_NAME = "cache";
var DATA_PLUGINS_DIR_NAME = "plugins";
var PLUGIN_CURRENT_LINK = "current";
var RELEASE_SUMS_FILE = "SHA256SUMS";
var EXTENSIONS_DIR_NAME = "extensions";
var AGENT_HOME_DIR = Object.freeze({
  "claude-code": [".claude"],
  codex: [".codex"],
  gemini: [".gemini"],
  qwen: [".qwen"],
  "copilot-cli": [".copilot"],
  vscode: [".vscode"],
  kiro: [".kiro"],
  zcode: [".zcode"],
  pi: [".pi"],
  opencode: [".config", "opencode"]
});
var UPGRADE_RESTART_LINE = "restart needed";
var UPGRADE_HOST_AREA = "host update";
var UPGRADE_REMOVED = "removed";
var UPGRADE_DATA_KEPT = "user data kept (confirmDelete not set)";
var UPGRADE_DEFAULT_MODE = "upgrade";
var UPGRADE_MODES = Object.freeze(["upgrade", "uninstall"]);
var UPGRADE_TABLE_HEADER = "| Area | Before | After |";
var UPGRADE_TABLE_RULE = "|---|---|---|";
var UPGRADE_PLUGIN_ROOT_AREA = "plugin root";
var UPGRADE_CHECKOUT_AREA = "plugin checkout";
var UPGRADE_SERVER_AREA = "server";
var UPGRADE_SERVER_RUNNING = "running";
var UPGRADE_SERVER_STOPPED = "stopped after this reply";
var UPGRADE_CACHE_AREA = "cache";
var UPGRADE_NOT_FOUND = "not found";
var UPGRADE_DATA_AREA = "user data";
var UPGRADE_REPORT_ONLY = "report only: remove it by hand if you no longer use it";
var UPGRADE_AREA_KEY_SEP = ": ";
var V1_KEY_PATH_SEP = ".";
var UPGRADE_GIT_TIMEOUT_MS = 12e4;
var GIT_CLONE_ARGS = Object.freeze(["clone", "--depth", "1", "--branch"]);
var GIT_HEAD_SHA_ARGS = Object.freeze(["rev-parse", "HEAD"]);
var UPGRADE_FETCH_DIR_PREFIX = ".fetch-";
var SUMS_LINE_SEP = "  ";
var SUMS_HASH_ALGORITHM = "sha256";
var UPGRADE_GIT_CHECKOUT_AGENTS = Object.freeze(["pi", "opencode"]);
var UPGRADE_HOST_MANUAL = "update with the host's own install command, then restart";
var UPGRADE_CONFIG_AREA = "host config";
var UPGRADE_OWN_ENTRY = "context-mode entry";
var UPGRADE_CACHE_BY_HAND = "remove the release dir by hand: its place is your choice";
var GIT_NO_PROMPT_ENV = Object.freeze({ GIT_TERMINAL_PROMPT: "0" });
var GIT_NO_CRLF_ENV = Object.freeze({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" });
var GIT_NOT_STARTED = "git did not start";
var GIT_BIN = "git";
var WIN_SHELL_LANGS = Object.freeze(["shell", "bash", "sh"]);
var GIT_BASH_RELATIVE = Object.freeze([["..", "bin", "bash.exe"], ["..", "..", "bin", "bash.exe"]]);
var GIT_EXIT_LABEL = "git exit ";
var UPGRADE_TRASH_SUFFIX = ".ctx-upgrade-removing";
var TABLE_ROW_START = "| ";
var TABLE_CELL_SEP = " | ";
var TABLE_ROW_END = " |";
var TABLE_PIPE = "|";
var TABLE_PIPE_ESCAPED = "\\|";
var OPS_SPLIT_FILES = Object.freeze([
  "doctor-env.ts",
  "doctor-config.ts",
  "doctor-hook.ts",
  "doctor-db.ts",
  "doctor-heal.ts",
  "release-fetch.ts",
  "verify-sums.ts",
  "plugin-swap.ts",
  "host-write.ts",
  "v1-remove.ts",
  "uninstall.ts"
]);
var SQLITE_MODULE = "node:sqlite";
var NODE_VERSION_PREFIX = "v";
var NODE_VERSION_SEP = ".";
var LS_REMOTE_FIELD_SEP = "	";
var GIT_SHA_HEX_LEN = 40;
var DOCTOR_GIT_TIMEOUT_MS = 1e4;
var DOCTOR_PASS_DETAIL = "ok";
var D3_PART_JOIN = ", ";
function D3_DETAIL(parts) {
  return `wrong: ${parts.join(D3_PART_JOIN)}`;
}
var HOOK_HOST_FILE = Object.freeze({
  "claude-code": { root: "plugin", file: ["hooks", "claude-code.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: true },
  codex: { root: "home", file: [".codex", "hooks.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: true },
  gemini: { root: "plugin", file: ["hooks", "hooks.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: false },
  qwen: { root: "plugin", file: ["hooks", "qwen.json"], key: ["hooks"], shape: "nested", timeoutKey: "timeout", matcher: true },
  "copilot-cli": { root: "home", file: [".copilot", "hooks", "context-mode.json"], key: ["hooks"], shape: "flat", timeoutKey: "timeoutSec", matcher: false },
  vscode: { root: "home", file: [".copilot", "hooks", "context-mode-vscode.json"], key: ["hooks"], shape: "flat", timeoutKey: "timeout", matcher: false },
  kiro: { root: "home", file: [".kiro", "hooks", "context-mode.json"], key: ["hooks"], shape: "kiro", timeoutKey: "timeout", matcher: false },
  zcode: { root: "home", file: [".zcode", "cli", "config.json"], key: ["hooks", "events"], shape: "zcode", timeoutKey: "timeoutMs", matcher: true },
  pi: null,
  opencode: null
});
var TOOL_HOOK_EVENTS = Object.freeze(["PreToolUse", "PostToolUse"]);
var HOOK_MATCHER_FIELD = "matcher";
var KIRO_TRIGGER_FIELD = "trigger";
var KIRO_TOOL_MATCHERS = Object.freeze([["@mcp", "mcp"], ["shell", "shell"]]);
var KIRO_ACTION_FIELD = "action";
var HOOK_COMMAND_FIELD = "command";
var HOOK_GROUP_HOOKS_FIELD = "hooks";
var HOOK_COMMAND_SEP = " ";
var SHELL_QUOTE = '"';
var MATCHER_OPEN = "^(";
var MATCHER_CLOSE = ")$";
var MATCHER_ALT = "|";
var MCP_ANY_MATCH = "mcp__.*";
var POST_TOOL_USE = "PostToolUse";
var MATCHER_ANY = ".*";
var REGEX_SPECIAL_CHARS = ".*+?^${}()|[]\\";
var REGEX_ESCAPE = "\\";
var CODEX_FEATURES_HOOKS_KEY = Object.freeze(["features", "hooks"]);
var D5_SHAPE_DETAIL = "hook output is not the agent's native shape";
function D5_SLOW_DETAIL(ms) {
  return `hook round trip took ${ms} ms, over ${HOOK_P95_MS} ms`;
}
var D5_FIX = "run ctx_upgrade";
var PRAGMA_INTEGRITY_CHECK = "PRAGMA integrity_check";
function D10_DETAIL(mode) {
  return `enforcement mode: ${mode}`;
}
var D11_WIN_DETAIL = "Git Bash not found";
var D11_WIN_FIX = "install Git for Windows";
var D11_POSIX_DETAIL = "no sh on PATH";
var D11_POSIX_FIX = "install sh or add it to PATH";
function D11_PASS_DETAIL(shell, win) {
  return `${win ? "Git Bash" : "sh"}: ${shell}`;
}
var DB_SIBLING_SUFFIXES = Object.freeze(["", DB_WAL_SUFFIX, DB_SHM_SUFFIX]);
var HEAL_TMP_SUFFIX = ".heal";
var HEAL_TS_SEP = ".";
var SUMS_LINE_END = "\n";
var HASH_ENCODING = "hex";
var PLUGIN_LINK_TMP_SUFFIX = ".swap";
var PLUGIN_LINK_OLD_SUFFIX = ".old";
var PLUGIN_LINK_TYPE = "dir";
var PLUGIN_LINK_TYPE_WIN32 = "junction";
var OWNER_STOP_EXT = ".stop";
var UPGRADE_DATA_DELETED = "user data deleted";
var UPGRADE_HOST_COMMAND = Object.freeze({
  "claude-code": "claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode",
  codex: "rewrite config.toml's [mcp_servers.context-mode*] block to the v2 entry, then restart Codex",
  gemini: "gemini extensions install https://github.com/mksglu/context-mode --ref release --auto-update",
  qwen: "qwen extensions install https://github.com/mksglu/context-mode --ref release --auto-update"
});
var PI_GIT_PACKAGE = "git:github.com/mksglu/context-mode@release";
var OPENCODE_GIT_SPEC = "git+https://github.com/mksglu/context-mode.git#release";
var V1_SCRIPT_NAMES = Object.freeze([
  "afteragentresponse.mjs",
  "aftermodel.mjs",
  "aftertool.mjs",
  "agentspawn.mjs",
  "beforeagent.mjs",
  "beforetool.mjs",
  "posttooluse.mjs",
  "precompact.mjs",
  "precompress.mjs",
  "pretooluse.mjs",
  "sessionend.mjs",
  "sessionstart.mjs",
  "stop.mjs",
  "userpromptsubmit.mjs"
]);
var V1_HOOK_COMMAND = "context-mode hook";
var V1_CODEX_HOOK_COMMAND = "context-mode hook codex";
var V1_CODEX_HOOKS_DIR = Object.freeze(["hooks", "codex"]);
var V1_CACHE_HEAL_NAME = "context-mode-cache-heal";
var V1_CACHE_HEAL_EXTS = Object.freeze([".mjs", ".sh"]);
var V1_STATUSLINE_COMMAND = "context-mode statusline";
var V1_PI_PACKAGE = "npm:context-mode";
var V1_OPENCODE_PLUGIN_SPEC = "context-mode";
var V1_TMP_PREFIX = "context-mode-";
var V1_TOML_SECTION_ROOT = "mcp_servers";
var V1_HOOKS_DIR_NAME = "hooks";
var SETTINGS_FILE = "settings.json";
var CLAUDE_USER_CONFIG_FILE = ".claude.json";
var HOOKS_JSON_FILE = "hooks.json";
var CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
var CODEX_HOME_ENV = "CODEX_HOME";
var COPILOT_HOME_ENV = "COPILOT_HOME";
var KIRO_HOME_ENV = "KIRO_HOME";
var OPENCODE_CONFIG_DIR_ENV = "OPENCODE_CONFIG_DIR";
var APPDATA_ENV = "APPDATA";
var VSCODE_USER_DIR_SEGMENTS = Object.freeze(["Code", "User"]);
var XDG_CONFIG_HOME_ENV = "XDG_CONFIG_HOME";
var CONFIG_TOML_FILE = "config.toml";
var CONFIG_JSON_FILE = "config.json";
var ZCODE_CLI_DIR = "cli";
var OWN_HOOK_FILE = "context-mode.json";
var GITHUB_DIR_NAME = ".github";
var VSCODE_DIR_NAME = ".vscode";
var VSCODE_MCP_FILE = "mcp.json";
var KIRO_AGENT_FILE = Object.freeze(["agents", "default.json"]);
var KIRO_AGENTS_DIR = "agents";
var KIRO_AGENT_FILE_EXT = ".json";
var KIRO_AGENT_NAME_KEY = "name";
var KIRO_STEERING_FILE = Object.freeze(["steering", "KIRO.md"]);
var PI_AGENT_DIR = "agent";
var OPENCODE_CONFIG_FILES = Object.freeze(["opencode.jsonc", "opencode.json"]);
var OPENCODE_BASE_CONFIG_FILE = "opencode.json";
var JSONC_EXT = ".jsonc";
var TOML_EXT = ".toml";
var MCP_SERVERS_KEY = "mcpServers";
var HOOKS_KEY = "hooks";
var STATUS_LINE_KEY = "statusLine";
var PI_PACKAGES_KEY = "packages";
var OPENCODE_PLUGIN_KEY = "plugin";
var V1_DATA_DIR_NAME = "context-mode";
var V1_DATA_ROOT_ENTRIES = Object.freeze(["content", "platform.json"]);
var V1_SESSIONS_DIR_NAME = "sessions";
var V1_SCRIPT_EXT = ".mjs";
var V1_BIN_COMMAND = SERVER_KEY;
var VSCODE_MCP_SERVERS_KEY = "servers";
var ZCODE_EVENTS_KEY = "events";
var PI_ROLE = "custom";
var PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
var PI_PACKAGE_SOURCE_KEY = "source";
var V1_PATH_SEPS = Object.freeze(["/", "\\"]);
var HOST_SEP_TOKEN = "${/}";
var HOOK_SCRIPT_SEPS = Object.freeze([...V1_PATH_SEPS, HOST_SEP_TOKEN]);
var V1_REASON = Object.freeze({
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
  tmpFile: "old context-mode temp file context-mode-* under the OS temp dir: report only, no action needed"
});
var UPGRADE_REPORT_ONLY_REASONS = Object.freeze([V1_REASON.statusLine, V1_REASON.vscodeMcp, V1_REASON.dataDirShared, V1_REASON.tmpFile, V1_REASON.kiroSteering]);
var PLUGIN_ID = SERVER_KEY;
var PLUGIN_NAME = SERVER_KEY;
var OPENCODE_TOOL_PREFIX = SERVER_KEY + "_";
var SERVER_ENTRY_FILE = "server.mjs";
var VSCODE_WORKSPACE_VAR = "${workspaceFolder}";
var OPENCODE_PLUGIN_PATH = Object.freeze(["opencode", "plugin.js"]);
var HOST_NODE_COMMAND = "node";
var EXE_SUFFIX = ".exe";
var HOST_CONFIG_TMP_SUFFIX = ".tmp";
var ATOMIC_RENAME_RETRIES = 5;
var ATOMIC_RENAME_DELAY_MS = 50;
var ATOMIC_RENAME_BUSY_CODES = ["EPERM", "EBUSY", "EACCES"];
var ATOMIC_TMP_PREFIX = ".";
var ATOMIC_TMP_MARK = ".cm-tmp-";
var HOST_CONFIG_TEXT_PATH = "(given text)";
var JSON_INDENT_UNIT = "  ";
var MCP_COMMAND_FIELD = "command";
var MCP_ARGS_FIELD = "args";
var ZCODE_MCP_FEATURE_KEY = Object.freeze(["features", "mcp"]);
var CODEX_OMIT_TOOLS_FROM_FIELD = "omit_tools_from";
var CODEX_OMIT_DEFERRED = Object.freeze(["deferred"]);
var CODEX_APPROVAL_MODE_FIELD = "default_tools_approval_mode";
var CODEX_APPROVAL_APPROVE = "approve";
var OWN_MCP_ENTRY = Object.freeze({
  codex: { file: [".codex", "config.toml"], key: ["mcp_servers", SERVER_KEY], fields: { [CODEX_OMIT_TOOLS_FROM_FIELD]: CODEX_OMIT_DEFERRED, [CODEX_APPROVAL_MODE_FIELD]: CODEX_APPROVAL_APPROVE } },
  vscode: { file: [VSCODE_MCP_FILE], key: ["servers", SERVER_KEY] },
  kiro: { file: [".kiro", "settings", "mcp.json"], key: ["mcpServers", SERVER_KEY] },
  zcode: {
    file: [".zcode", "cli", "config.json"],
    key: ["mcp", "servers", SERVER_KEY],
    fields: { type: "stdio", enabled: true, timeoutMs: EXEC_TIMEOUT_MS },
    also: [[ZCODE_MCP_FEATURE_KEY, true]]
  }
});
var REPORT_INVALID = "<invalid>";
var REPORT_ENV_PREFIX = "env.";
var REPORT_ENV_ENUMS = Object.freeze({
  NODE_ENV: Object.freeze(["development", "production", "test"])
});

// src/core/contracts/errors.ts
var ERROR_TEXT = Object.freeze({
  NODE_TOO_OLD: "Node <v> is below 24.15.0. Fix: install Node 24.15.0 or later.",
  NO_SQLITE: "node:sqlite failed to load. Fix: run ctx_doctor.",
  DB_GONE: "context.db path vanished. Fix: run ctx_doctor.",
  NO_PROJECT: "Project source <kind> is missing. Fix: run ctx_doctor.",
  UNKNOWN_FIELD: 'Unknown field "<f>". Fix: use "queries".',
  TIMEOUT: "Timed out after <ms> ms. Fix: pass background: true.",
  NO_GIT_BASH: "Git Bash not found. Fix: install Git for Windows.",
  // D-VT-WINBASH-1
  NO_RUNTIME: "No <lang> runtime on PATH. Fix: install it or pick another language.",
  FETCH_FAILED: "Fetch failed: <code>. Fix: check the URL or proxy.",
  SSRF: "Blocked private address <host>. Fix: use a public URL.",
  OUTSIDE_ROOT: "Path <p> is outside the project. Fix: use a path inside <root>.",
  INVALID_ARGS: "Invalid argument <field>. Fix: <action>.",
  ONE_OF_INPUT: "Pass exactly one of <names>. Fix: drop the extra field.",
  SPAWN_FAILED: "Failed to start the process: <detail>. Fix: check the command and PATH.",
  DB_CORRUPT: "context.db failed integrity_check. Fix: run ctx_doctor.",
  SCHEMA_STALE: "context.db schema is version <found>, expected <want>. Fix: run ctx_doctor.",
  NO_GIT_DIR: "No git repository at <path>. Fix: run context-mode inside a git repository.",
  NO_HOME: "Env var <name> is not set. Fix: set <name> to your home directory.",
  PLUGIN_ROOT_MISSING: "Plugin root for <agent> not found at <path>. Fix: run ctx_upgrade.",
  // impl/07 §1 Errors
  BUNDLE_HASH_MISMATCH: "Fetched bundle hash does not match SHA256SUMS. Fix: run ctx_upgrade again.",
  // impl/07 §6 Errors
  CONFIG_PARSE_FAILED: "<agent> config at <path> did not parse as <format>. Fix: fix the syntax error and re-run ctx_upgrade."
  // impl/07 §2 Errors
});
function formatError(code, vars) {
  const template = ERROR_TEXT[code];
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "<") {
      out += template[i];
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < template.length && template[j] !== "<" && template[j] !== ">") j += 1;
    if (j >= template.length) {
      out += template.slice(i);
      break;
    }
    if (template[j] === "<") {
      out += "<";
      i += 1;
      continue;
    }
    const name = template.slice(i + 1, j);
    const value = vars[name];
    if (value === void 0) throw new Error("formatError: missing var " + name + " for " + code);
    out += String(value);
    i = j + 1;
  }
  return out;
}
var CtxError = class extends Error {
  code;
  vars;
  constructor(code, vars) {
    super(formatError(code, vars ?? {}));
    this.code = code;
    this.vars = vars ?? {};
  }
  toLine() {
    return this.message;
  }
};

// src/core/hooks/dispatch.ts
import { dirname as dirname3, join as join6 } from "node:path";

// src/core/contracts/agents.ts
var AGENT_IDS = ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode", "pi", "opencode"];

// src/adapters/claude-code.ts
var TOOL_NAME_PREFIX = "mcp__plugin_context-mode_context-mode__";
var CLAUDE_SHAPE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"];
var MCP_PREFIX = "mcp__";
var MCP_SEP = "__";
var CLAUDE_SOURCES = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };
function canonicalName(name, ownPrefix) {
  if (name.startsWith(ownPrefix)) return name.slice(ownPrefix.length);
  if (!name.startsWith(MCP_PREFIX)) return name;
  const rest = name.slice(MCP_PREFIX.length);
  const sep4 = rest.indexOf(MCP_SEP);
  if (sep4 < 0) return name;
  return "mcp:" + rest.slice(0, sep4) + ":" + rest.slice(sep4 + MCP_SEP.length);
}
function outputOf(resp) {
  if (resp === void 0) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return blocksOf(resp).text;
  if (typeof resp === "object" && resp !== null) {
    const r = resp;
    if (typeof r.stdout === "string" || typeof r.stderr === "string") {
      const out = typeof r.stdout === "string" ? r.stdout : "";
      const err = typeof r.stderr === "string" ? r.stderr : "";
      return err === "" ? out : out === "" ? err : out + "\n" + err;
    }
  }
  if (typeof resp === "object" && resp !== null && isGrepContent(resp)) return resp.content;
  return JSON.stringify(resp);
}
function isGrepContent(resp) {
  const r = resp;
  return r.mode === "content" && typeof r.content === "string";
}
function blocksOf(resp) {
  const parts = [];
  let keep = false;
  for (const b of resp) {
    const blk = typeof b === "object" && b !== null ? b : {};
    if (blk.type === "text" && typeof blk.text === "string") parts.push(blk.text);
    else keep = true;
  }
  return { text: parts.join("\n"), keep };
}
function readResult(resp) {
  const text = outputOf(resp);
  const isError = typeof resp === "object" && resp !== null && resp.is_error === true;
  const info = { isError, bytes: Buffer.byteLength(text), text };
  if (typeof resp === "object" && resp !== null && !Array.isArray(resp) && isGrepContent(resp)) info.shape = resp;
  if (Array.isArray(resp)) {
    info.blocks = true;
    if (blocksOf(resp).keep) info.keep = true;
  }
  if (typeof resp === "object" && resp !== null) {
    const r = resp;
    if (typeof r.persistedOutputPath === "string" && r.persistedOutputPath !== "" && typeof r.persistedOutputSize === "number" && r.persistedOutputSize > info.bytes) {
      info.persistedPath = r.persistedOutputPath;
    }
  }
  return info;
}
function decodeClaudeShape(raw, agent, ownPrefix, sources) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(agent + ": hook payload is not a JSON object");
  const p = raw;
  const event = CLAUDE_SHAPE_EVENTS.find((e) => e === p.hook_event_name);
  if (event === void 0) throw new Error(agent + ": unknown hook event " + String(p.hook_event_name));
  const ev = { event, agent, sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  if (typeof p.agent_id === "string") {
    ev.agentId = p.agent_id;
    if (typeof p.agent_type === "string") ev.agentType = p.agent_type;
  }
  if (event === "SessionStart" && typeof p.source === "string" && sources[p.source] !== void 0) ev.source = sources[p.source];
  if (event === "UserPromptSubmit" && typeof p.prompt === "string") ev.prompt = p.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool_name ?? "");
    const input = typeof p.tool_input === "object" && p.tool_input !== null ? p.tool_input : {};
    const tool = { name, canonicalName: canonicalName(name, ownPrefix), input };
    if (typeof p.tool_use_id === "string" && p.tool_use_id !== "") tool.callId = p.tool_use_id;
    ev.tool = tool;
  }
  if (event === "PostToolUse") ev.result = readResult(p.tool_response);
  return ev;
}
function replaceShape(ev, output) {
  if (ev.tool?.canonicalName === "Bash") return { stdout: output, stderr: "", interrupted: false };
  if (ev.result?.shape !== void 0) return { ...ev.result.shape, content: output };
  if (ev.result?.blocks === true) return [{ type: "text", text: output }];
  return output;
}
function encodeClaudeShape(ev, d, hasReplace2) {
  const out = (fields) => ({
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: ev.event, ...fields } }),
    exitCode: 0
  });
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return out({ additionalContext: d.text });
    case "deny":
      return out({ permissionDecision: "deny", permissionDecisionReason: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason });
    case "replace":
      return hasReplace2 && ev.event === "PostToolUse" ? out({ updatedToolOutput: replaceShape(ev, d.output) }) : { stdout: "", exitCode: 0 };
  }
}
var REQUIRED_FIELDS = {
  PreToolUse: ["tool_name"],
  PostToolUse: ["tool_name", "tool_response"]
};
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function requireFields(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  const p = raw;
  if (p.hook_event_name === void 0) throw new Error("claude-code: missing required field hook_event_name");
  for (const f of REQUIRED_FIELDS[p.hook_event_name] ?? []) {
    if (p[f] === void 0) throw new Error("claude-code: missing required field " + f);
  }
}
function decode(raw) {
  requireFields(raw);
  const ev = decodeClaudeShape(raw, "claude-code", TOOL_NAME_PREFIX, CLAUDE_SOURCES);
  if (ev.cwd === "") ev.cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (ev.event === "PostToolUse" && ev.tool !== void 0 && ev.tool.callId === void 0) {
    const cmd = typeof ev.tool.input.command === "string" ? ev.tool.input.command : JSON.stringify(ev.tool.input);
    ev.tool.callId = "h" + fnv1a(ev.tool.name + "\0" + cmd + "\0" + String(ev.turn ?? 0));
  }
  return ev;
}
function encode(ev, d, _extra) {
  return encodeClaudeShape(ev, d, true);
}

// src/adapters/codex.ts
var TOOL_NAME_PREFIX2 = "mcp__context_mode__";
var CODEX_SOURCES = { startup: "startup", resume: "resume", clear: "clear", compact: "compact", fork: "resume" };
function decode2(raw) {
  return decodeClaudeShape(raw, "codex", TOOL_NAME_PREFIX2, CODEX_SOURCES);
}
function encode2(ev, d, _extra) {
  return encodeClaudeShape(ev, d, false);
}

// src/adapters/gemini.ts
var TOOL_NAME_PREFIX3 = "mcp_context-mode_";
var GEMINI_EVENTS = {
  SessionStart: "SessionStart",
  BeforeAgent: "UserPromptSubmit",
  BeforeTool: "PreToolUse",
  AfterTool: "PostToolUse",
  PreCompress: "PreCompact"
};
var GEMINI_SOURCES = { startup: "startup", resume: "resume", clear: "clear" };
var HINT_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse"];
var DENY_EVENTS = ["UserPromptSubmit", "PreToolUse"];
var EMPTY = { stdout: "", exitCode: 0 };
function own(p, key) {
  return Object.hasOwn(p, key) ? p[key] : void 0;
}
var NATIVE_TO_CANONICAL = {
  run_shell_command: "Bash",
  read_file: "Read",
  grep_search: "Grep",
  web_fetch: "WebFetch"
};
function canonicalName2(name, mcp) {
  if (name.startsWith(TOOL_NAME_PREFIX3)) return name.slice(TOOL_NAME_PREFIX3.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL, name)) return NATIVE_TO_CANONICAL[name];
  if (typeof mcp !== "object" || mcp === null) return name;
  const m = mcp;
  const server2 = own(m, "server_name");
  const tool = own(m, "tool_name");
  if (typeof server2 !== "string" || typeof tool !== "string") return name;
  return "mcp:" + server2 + ":" + tool;
}
function readResult2(resp) {
  const obj = typeof resp === "object" && resp !== null ? resp : void 0;
  const llm = obj === void 0 ? void 0 : own(obj, "llmContent");
  const text = resp === void 0 ? "" : typeof resp === "string" ? resp : typeof llm === "string" ? llm : JSON.stringify(resp);
  const err = obj === void 0 ? void 0 : own(obj, "error");
  return { isError: err !== void 0 && err !== null, bytes: Buffer.byteLength(text), text };
}
function decode3(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("gemini: hook payload is not a JSON object");
  const p = raw;
  const native = own(p, "hook_event_name");
  const event = typeof native === "string" && Object.hasOwn(GEMINI_EVENTS, native) ? GEMINI_EVENTS[native] : void 0;
  if (event === void 0) throw new Error("gemini: unknown hook event " + String(native));
  const ev = { event, agent: "gemini", sessionId: String(own(p, "session_id") ?? ""), cwd: String(own(p, "cwd") ?? "") };
  const source = own(p, "source");
  if (event === "SessionStart" && typeof source === "string" && Object.hasOwn(GEMINI_SOURCES, source)) ev.source = GEMINI_SOURCES[source];
  const prompt = own(p, "prompt");
  if (event === "UserPromptSubmit" && typeof prompt === "string") ev.prompt = prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(own(p, "tool_name") ?? "");
    const input = own(p, "tool_input");
    ev.tool = {
      name,
      canonicalName: canonicalName2(name, own(p, "mcp_context")),
      input: typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}
    };
  }
  if (event === "PostToolUse") ev.result = readResult2(own(p, "tool_response"));
  return ev;
}
function encode3(ev, d, _extra) {
  switch (d.kind) {
    case "allow":
      return EMPTY;
    case "hint":
      if (!HINT_EVENTS.includes(ev.event)) return EMPTY;
      return { stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: d.text } }), exitCode: 0 };
    case "deny":
      if (!DENY_EVENTS.includes(ev.event)) return EMPTY;
      return { stdout: JSON.stringify({ decision: "deny", reason: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason }), exitCode: 0 };
    case "replace":
      if (ev.event !== "PostToolUse") return EMPTY;
      return { stdout: JSON.stringify({ decision: "deny", reason: d.output }), exitCode: 0 };
  }
}

// src/adapters/qwen.ts
var TOOL_NAME_PREFIX4 = "mcp__context-mode__";
var QWEN_SOURCES = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };
var NATIVE_TO_CANONICAL2 = {
  run_shell_command: "Bash",
  Shell: "Bash",
  read_file: "Read",
  grep_search: "Grep",
  web_fetch: "WebFetch"
};
var FAILURE_EVENT = "PostToolUseFailure";
function decode4(raw) {
  const failure = typeof raw === "object" && raw !== null && !Array.isArray(raw) && raw.hook_event_name === FAILURE_EVENT;
  const payload = failure ? { ...raw, hook_event_name: "PostToolUse" } : raw;
  const ev = decodeClaudeShape(payload, "qwen", TOOL_NAME_PREFIX4, QWEN_SOURCES);
  if (ev.tool !== void 0 && Object.hasOwn(NATIVE_TO_CANONICAL2, ev.tool.name)) ev.tool.canonicalName = NATIVE_TO_CANONICAL2[ev.tool.name];
  if (failure) {
    const error40 = raw.error;
    const text = typeof error40 === "string" ? error40 : error40 === void 0 ? "" : JSON.stringify(error40);
    ev.result = { isError: true, bytes: Buffer.byteLength(text), text };
  }
  return ev;
}
function encode4(ev, d, _extra) {
  return encodeClaudeShape(ev, d, false);
}

// src/adapters/copilot-cli.ts
var TOOL_NAME_PREFIX5 = "context-mode-";
var NATIVE_EVENTS = {
  sessionStart: { event: "SessionStart", casing: "camel", failure: false },
  userPromptSubmitted: { event: "UserPromptSubmit", casing: "camel", failure: false },
  preToolUse: { event: "PreToolUse", casing: "camel", failure: false },
  postToolUse: { event: "PostToolUse", casing: "camel", failure: false },
  postToolUseFailure: { event: "PostToolUse", casing: "camel", failure: true },
  SessionStart: { event: "SessionStart", casing: "snake", failure: false },
  UserPromptSubmit: { event: "UserPromptSubmit", casing: "snake", failure: false },
  PreToolUse: { event: "PreToolUse", casing: "snake", failure: false },
  PostToolUse: { event: "PostToolUse", casing: "snake", failure: false },
  PostToolUseFailure: { event: "PostToolUse", casing: "snake", failure: true }
};
var COPILOT_SOURCES = { startup: "startup", resume: "resume", new: "startup" };
var KEYS = {
  camel: { event: "hookEventName", session: "sessionId", tool: "toolName", args: "toolArgs", result: "toolResult" },
  snake: { event: "hook_event_name", session: "session_id", tool: "tool_name", args: "tool_input", result: "tool_result" }
};
var RESULT_SUCCESS = "success";
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
var NATIVE_TO_CANONICAL3 = { bash: "Bash" };
function canonicalName3(name) {
  if (name.startsWith(TOOL_NAME_PREFIX5)) return name.slice(TOOL_NAME_PREFIX5.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL3, name)) return NATIVE_TO_CANONICAL3[name];
  return name;
}
function readArgs(v) {
  if (isRecord(v)) return v;
  if (typeof v !== "string") return {};
  try {
    const parsed = JSON.parse(v);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
var RESULT_KEYS = {
  camel: { type: "resultType", text: "textResultForLlm" },
  snake: { type: "result_type", text: "text_result_for_llm" }
};
function readResult3(v, casing, failure) {
  const k = RESULT_KEYS[casing];
  const r = isRecord(v) ? v : {};
  const text = typeof r[k.text] === "string" ? r[k.text] : "";
  const isError = failure || typeof r[k.type] === "string" && r[k.type] !== RESULT_SUCCESS;
  return { isError, bytes: Buffer.byteLength(text), text };
}
var EVENT_BY_KEY = [
  ["toolResult", "postToolUse"],
  ["toolName", "preToolUse"],
  ["prompt", "userPromptSubmitted"],
  ["source", "sessionStart"]
];
function eventName(raw) {
  if (typeof raw.hookEventName === "string") return raw.hookEventName;
  if (raw.hook_event_name !== void 0) return raw.hook_event_name;
  return EVENT_BY_KEY.find(([key]) => Object.hasOwn(raw, key))?.[1];
}
function decode5(raw) {
  if (!isRecord(raw)) throw new Error("copilot-cli: hook payload is not a JSON object");
  const name = eventName(raw);
  const native = typeof name === "string" ? NATIVE_EVENTS[name] : void 0;
  if (native === void 0) throw new Error("copilot-cli: unknown hook event " + String(name));
  const k = KEYS[native.casing];
  const event = native.event;
  const ev = { event, agent: "copilot-cli", sessionId: String(raw[k.session] ?? ""), cwd: String(raw.cwd ?? "") };
  if (event === "SessionStart" && typeof raw.source === "string" && COPILOT_SOURCES[raw.source] !== void 0) ev.source = COPILOT_SOURCES[raw.source];
  if (event === "UserPromptSubmit" && typeof raw.prompt === "string") ev.prompt = raw.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const toolName = String(raw[k.tool] ?? "");
    const tool = { name: toolName, canonicalName: canonicalName3(toolName), input: readArgs(raw[k.args]) };
    ev.tool = tool;
  }
  if (event === "PostToolUse") ev.result = readResult3(raw[k.result], native.casing, native.failure);
  return ev;
}
var EMPTY2 = { stdout: "", exitCode: 0 };
function encode5(ev, d, _extra) {
  switch (d.kind) {
    case "allow":
      return EMPTY2;
    case "hint":
      return ev.event === "PostToolUse" ? EMPTY2 : { stdout: JSON.stringify({ additionalContext: d.text }), exitCode: 0 };
    case "deny":
      if (ev.event !== "PreToolUse") return EMPTY2;
      return {
        stdout: JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason }),
        exitCode: 0
      };
    case "replace":
      if (ev.event !== "PostToolUse") return EMPTY2;
      return { stdout: JSON.stringify({ modifiedResult: { resultType: RESULT_SUCCESS, textResultForLlm: d.output } }), exitCode: 0 };
  }
}

// src/adapters/vscode.ts
var TOOL_NAME_PREFIX6 = "mcp_context-mode_";
var VSCODE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact"];
var MCP_PREFIX2 = "mcp_";
var MCP_SEP2 = "_";
var SESSION_START_NEW = "new";
var SHELL_TOOL_NAMES = Object.freeze(["run_in_terminal", "runTerminalCommand", "bash", "powershell"]);
var READ_TOOL_NAMES = Object.freeze(["read_file", "view"]);
var WEBFETCH_TOOL_NAMES = Object.freeze(["fetch_webpage", "web_fetch"]);
var NATIVE_TO_CANONICAL4 = Object.fromEntries([
  ...SHELL_TOOL_NAMES.map((n) => [n, "Bash"]),
  ...READ_TOOL_NAMES.map((n) => [n, "Read"]),
  ...WEBFETCH_TOOL_NAMES.map((n) => [n, "WebFetch"])
]);
function canonicalName4(name) {
  if (name.startsWith(TOOL_NAME_PREFIX6)) return name.slice(TOOL_NAME_PREFIX6.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL4, name)) return NATIVE_TO_CANONICAL4[name];
  if (!name.startsWith(MCP_PREFIX2)) return name;
  const rest = name.slice(MCP_PREFIX2.length);
  const sep4 = rest.indexOf(MCP_SEP2);
  if (sep4 <= 0 || sep4 === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep4) + ":" + rest.slice(sep4 + MCP_SEP2.length);
}
var isNum = (v) => typeof v === "number" && Number.isFinite(v);
function policyInput(name, canonical, input) {
  if (canonical === "Read" && READ_TOOL_NAMES.includes(name)) {
    const out = { ...input };
    if (name === "read_file") {
      if (typeof input.filePath === "string") out.file_path = input.filePath;
      if (isNum(input.startLine)) out.offset = input.startLine;
      if (isNum(input.startLine) && isNum(input.endLine) && input.endLine >= input.startLine) out.limit = input.endLine - input.startLine + 1;
    } else if (Array.isArray(input.view_range) && isNum(input.view_range[0])) {
      out.offset = input.view_range[0];
      const end = input.view_range[1];
      if (isNum(end) && end >= input.view_range[0]) out.limit = end - input.view_range[0] + 1;
    }
    return out;
  }
  if (canonical === "WebFetch" && name === "fetch_webpage" && Array.isArray(input.urls) && typeof input.urls[0] === "string") {
    return { ...input, url: input.urls[0] };
  }
  return input;
}
function readResult4(resp) {
  const text = resp === void 0 ? "" : typeof resp === "string" ? resp : JSON.stringify(resp);
  const isError = typeof resp === "object" && resp !== null && resp.is_error === true;
  return { isError, bytes: Buffer.byteLength(text), text };
}
var CAMEL_EVENTS = {
  sessionStart: "SessionStart",
  userPromptSubmitted: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  preCompact: "PreCompact"
};
var EVENT_BY_KEY2 = [
  ["toolResult", "postToolUse"],
  ["toolName", "preToolUse"],
  ["prompt", "userPromptSubmitted"],
  ["source", "sessionStart"],
  ["trigger", "preCompact"]
];
var SESSION_SOURCES = { new: "startup", startup: "startup", resume: "resume" };
var RESULT_SUCCESS2 = "success";
function isRecord2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readArgs2(v) {
  if (isRecord2(v)) return v;
  if (typeof v !== "string") return {};
  try {
    const parsed = JSON.parse(v);
    return isRecord2(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function readCamelResult(v) {
  const r = isRecord2(v) ? v : {};
  const text = typeof r.textResultForLlm === "string" ? r.textResultForLlm : "";
  return { isError: typeof r.resultType === "string" && r.resultType !== RESULT_SUCCESS2, bytes: Buffer.byteLength(text), text };
}
function decodeCamel(p, name) {
  const event = typeof name === "string" ? CAMEL_EVENTS[name] ?? VSCODE_EVENTS.find((e) => e === name) : void 0;
  if (event === void 0) throw new Error("vscode: unknown hook event " + String(name));
  const ev = { event, agent: "vscode", sessionId: String(p.sessionId ?? ""), cwd: String(p.cwd ?? "") };
  if (event === "SessionStart" && typeof p.source === "string" && SESSION_SOURCES[p.source] !== void 0) ev.source = SESSION_SOURCES[p.source];
  if (event === "UserPromptSubmit" && typeof p.prompt === "string") ev.prompt = p.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const toolName = String(p.toolName ?? "");
    const canonical = canonicalName4(toolName);
    ev.tool = { name: toolName, canonicalName: canonical, input: policyInput(toolName, canonical, readArgs2(p.toolArgs)) };
  }
  if (event === "PostToolUse") ev.result = readCamelResult(p.toolResult);
  return ev;
}
function decode6(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("vscode: hook payload is not a JSON object");
  const p = raw;
  if (p.hookEventName !== void 0) return decodeCamel(p, p.hookEventName);
  if (p.hook_event_name === void 0) {
    const byKey = EVENT_BY_KEY2.find(([key]) => Object.hasOwn(p, key))?.[1];
    if (byKey === void 0) throw new Error("vscode: missing required field hook_event_name");
    return decodeCamel(p, byKey);
  }
  const event = VSCODE_EVENTS.find((e) => e === p.hook_event_name);
  if (event === void 0) throw new Error("vscode: unknown hook event " + String(p.hook_event_name));
  const ev = { event, agent: "vscode", sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  if (event === "SessionStart" && p.source === SESSION_START_NEW) ev.source = "startup";
  if (event === "UserPromptSubmit" && typeof p.prompt === "string") ev.prompt = p.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool_name ?? "");
    const input = isRecord2(p.tool_input) ? p.tool_input : {};
    const canonical = canonicalName4(name);
    ev.tool = { name, canonicalName: canonical, input: policyInput(name, canonical, input) };
  }
  if (event === "PostToolUse") ev.result = readResult4(p.tool_response);
  return ev;
}
function encode6(ev, d, _extra) {
  return encodeClaudeShape(ev, d, false);
}

// src/adapters/kiro.ts
var TOOL_NAME_PREFIX7 = "mcp_context-mode_";
var KIRO_EVENTS = {
  SessionStart: "SessionStart",
  agentSpawn: "SessionStart",
  UserPromptSubmit: "UserPromptSubmit",
  PromptSubmit: "UserPromptSubmit",
  userPromptSubmit: "UserPromptSubmit",
  PreToolUse: "PreToolUse",
  preToolUse: "PreToolUse",
  PostToolUse: "PostToolUse",
  postToolUse: "PostToolUse"
};
var PROMPT_ENV = "USER_PROMPT";
var MCP_PREFIX3 = "mcp_";
var SHELL_TOOL_NAMES2 = Object.freeze(["execute_bash", "execute_pwsh", "shell"]);
var NATIVE_TO_CANONICAL5 = Object.fromEntries(SHELL_TOOL_NAMES2.map((n) => [n, "Bash"]));
var MCP_SEP3 = "_";
var KIRO_SOURCES = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };
function canonicalName5(name) {
  if (name.startsWith(TOOL_NAME_PREFIX7)) return name.slice(TOOL_NAME_PREFIX7.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL5, name)) return NATIVE_TO_CANONICAL5[name];
  if (!name.startsWith(MCP_PREFIX3)) return name;
  const rest = name.slice(MCP_PREFIX3.length);
  const sep4 = rest.indexOf(MCP_SEP3);
  if (sep4 <= 0 || sep4 === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep4) + ":" + rest.slice(sep4 + MCP_SEP3.length);
}
function readResult5(resp) {
  const text = resp === void 0 ? "" : typeof resp === "string" ? resp : JSON.stringify(resp);
  return { isError: false, bytes: Buffer.byteLength(text), text };
}
function decode7(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("kiro: hook payload is not a JSON object");
  const p = raw;
  const native = typeof p.hook_event_name === "string" ? p.hook_event_name : "";
  const event = Object.prototype.hasOwnProperty.call(KIRO_EVENTS, native) ? KIRO_EVENTS[native] : void 0;
  if (event === void 0) throw new Error("kiro: unknown hook event " + String(p.hook_event_name));
  const ev = { event, agent: "kiro", sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
  if (event === "SessionStart" && typeof p.source === "string" && KIRO_SOURCES[p.source] !== void 0) ev.source = KIRO_SOURCES[p.source];
  if (event === "UserPromptSubmit") {
    const prompt = process.env[PROMPT_ENV];
    if (prompt !== void 0) ev.prompt = prompt;
  }
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool_name ?? "");
    const input = typeof p.tool_input === "object" && p.tool_input !== null && !Array.isArray(p.tool_input) ? p.tool_input : {};
    ev.tool = { name, canonicalName: canonicalName5(name), input };
  }
  if (event === "PostToolUse") ev.result = readResult5(p.tool_response);
  return ev;
}
function encode7(ev, d, _extra) {
  if (ev.event === "UserPromptSubmit") return { stdout: "", exitCode: 0 };
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return { stdout: d.text, exitCode: 0 };
    case "deny":
      return { stdout: "", stderr: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason, exitCode: 2 };
    case "replace":
      return { stdout: "", exitCode: 0 };
  }
}

// src/adapters/zcode.ts
var TOOL_NAME_PREFIX8 = "mcp__context-mode__";
var ZCODE_SOURCES = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };
var TWINS = { hook_event_name: "hookEventName", session_id: "sessionId" };
var FAILURE_EVENT2 = "PostToolUseFailure";
function decode8(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("zcode: hook payload is not a JSON object");
  const p = { ...raw };
  for (const [snake, camel] of Object.entries(TWINS)) if (p[snake] === void 0) p[snake] = p[camel];
  const failure = p.hook_event_name === FAILURE_EVENT2;
  if (failure) p.hook_event_name = "PostToolUse";
  const ev = decodeClaudeShape(p, "zcode", TOOL_NAME_PREFIX8, ZCODE_SOURCES);
  if (failure) {
    const text = typeof p.error === "string" ? p.error : p.error === void 0 ? "" : JSON.stringify(p.error);
    ev.result = { isError: true, bytes: Buffer.byteLength(text), text };
  }
  return ev;
}
function encode8(ev, d, _extra) {
  return encodeClaudeShape(ev, d, false);
}

// src/adapters/pi.ts
var TOOL_NAME_PREFIX9 = "";
var PI_EVENTS = {
  session_start: { event: "SessionStart", source: "startup" },
  session_compact: { event: "SessionStart", source: "compact" },
  input: { event: "UserPromptSubmit" },
  tool_call: { event: "PreToolUse" },
  tool_result: { event: "PostToolUse" }
};
var NATIVE_TO_CANONICAL6 = { bash: "Bash", read: "Read" };
function record(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : {};
}
function readResult6(p) {
  const text = p.content === void 0 ? "" : typeof p.content === "string" ? p.content : JSON.stringify(p.content);
  const info = { isError: p.isError === true, bytes: Buffer.byteLength(text), text };
  if (typeof p.exitCode === "number") info.exitCode = p.exitCode;
  return info;
}
function decode9(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("pi: hook payload is not an object");
  const p = raw;
  const native = typeof p.type === "string" ? p.type : "";
  const row5 = Object.prototype.hasOwnProperty.call(PI_EVENTS, native) ? PI_EVENTS[native] : void 0;
  if (row5 === void 0) throw new Error("pi: unknown hook event " + String(p.type));
  const ev = { event: row5.event, agent: "pi", sessionId: String(p.sessionId ?? ""), cwd: String(p.cwd ?? "") };
  if (row5.source !== void 0) ev.source = row5.source;
  if (row5.event === "UserPromptSubmit" && typeof p.message === "string") ev.prompt = p.message;
  if (row5.event === "PreToolUse" || row5.event === "PostToolUse") {
    const name = String(p.toolName ?? "");
    ev.tool = { name, canonicalName: Object.hasOwn(NATIVE_TO_CANONICAL6, name) ? NATIVE_TO_CANONICAL6[name] : name, input: record(p.input) };
    if (typeof p.toolCallId === "string") ev.tool.callId = p.toolCallId;
  }
  if (row5.event === "PostToolUse") ev.result = readResult6(p);
  if (typeof p.turn === "number") ev.turn = p.turn;
  return ev;
}
function stdoutFor(ev, d) {
  switch (d?.kind) {
    case "hint":
      return { stdout: ev.event === "SessionStart" ? d.text : "", exitCode: 0 };
    case "deny":
      if (ev.event !== "PreToolUse") return { stdout: "", exitCode: 0 };
      return { stdout: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason, exitCode: 2 };
    case "replace":
      return { stdout: ev.event === "PostToolUse" ? d.output : "", exitCode: 0 };
  }
  return { stdout: "", exitCode: 0 };
}
function encode9(ev, d, _extra) {
  const out = stdoutFor(ev, d);
  if (d?.kind === "allow") return out;
  return { stdout: out.stdout, exitCode: out.exitCode, role: PI_ROLE, content: out.stdout, timestamp: Date.now() };
}
function checkPermission(out) {
  return out.exitCode === 2 ? { block: true, reason: out.stdout } : void 0;
}

// src/adapters/opencode.ts
var TOOL_NAME_PREFIX10 = "";
var OWN_WIRE_PREFIX = SERVER_KEY + "_";
var OPENCODE_EVENTS = {
  context: "SessionStart",
  prompt: "UserPromptSubmit",
  "execute.before": "PreToolUse",
  "execute.after": "PostToolUse",
  compaction: "PreCompact",
  "step-finish": "Usage"
};
var SHELL_TOOL_NAME = "bash";
var NATIVE_TO_CANONICAL7 = { webfetch: "WebFetch", [SHELL_TOOL_NAME]: "Bash" };
function toCanonicalTool(name) {
  if (name.startsWith(OWN_WIRE_PREFIX)) return name.slice(OWN_WIRE_PREFIX.length);
  return Object.prototype.hasOwnProperty.call(NATIVE_TO_CANONICAL7, name) ? NATIVE_TO_CANONICAL7[name] : name;
}
function record2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : {};
}
function readResult7(p) {
  const text = p.output === void 0 ? "" : typeof p.output === "string" ? p.output : JSON.stringify(p.output);
  const info = { isError: p.isError === true, bytes: Buffer.byteLength(text), text };
  if (typeof p.exitCode === "number") info.exitCode = p.exitCode;
  return info;
}
function decode10(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("opencode: hook payload is not an object");
  const p = raw;
  const native = typeof p.type === "string" ? p.type : "";
  const event = Object.prototype.hasOwnProperty.call(OPENCODE_EVENTS, native) ? OPENCODE_EVENTS[native] : void 0;
  if (event === void 0) throw new Error("opencode: unknown hook event " + String(p.type));
  const ev = { event, agent: "opencode", sessionId: String(p.sessionID ?? ""), cwd: String(p.directory ?? "") };
  if (event === "UserPromptSubmit" && typeof p.message === "string") ev.prompt = p.message;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p.tool ?? "");
    ev.tool = { name, canonicalName: toCanonicalTool(name), input: record2(p.args) };
    if (typeof p.callID === "string") ev.tool.callId = p.callID;
  }
  if (event === "PostToolUse") ev.result = readResult7(p);
  if (typeof p.turn === "number") ev.turn = p.turn;
  return ev;
}
function encode10(ev, d, _extra) {
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return { stdout: ev.event === "SessionStart" ? d.text : "", exitCode: 0 };
    case "deny":
      if (ev.event !== "PreToolUse") return { stdout: "", exitCode: 0 };
      return { stdout: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason, exitCode: 2 };
    case "replace":
      return { stdout: "", exitCode: 0 };
  }
}

// src/adapters/table.ts
var CLAUDE_EVENTS = { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" };
var CLAUDE_TOOLS = { shell: ["Bash"], read: ["Read"], grep: ["Grep"], webfetch: ["WebFetch"], edit: ["Write", "Edit", "NotebookEdit"] };
var ADAPTERS = Object.freeze([
  {
    id: "claude-code",
    installMode: "marketplace",
    projectSource: "env:CLAUDE_PROJECT_DIR",
    toolNamePrefix: TOOL_NAME_PREFIX,
    nativeTools: CLAUDE_TOOLS,
    execReadOnlyHint: false,
    eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "package", path: "hooks/claude-code.json" },
    skillChannel: { kind: "package", path: "claude-code/skills" },
    // ADR-0020, D-HQ-SKILLS-2
    decode,
    encode
  },
  {
    id: "codex",
    installMode: "config-mcp",
    projectSource: "arg:--agent+cwd",
    toolNamePrefix: TOOL_NAME_PREFIX2,
    nativeTools: { shell: ["Bash"], edit: ["apply_patch"] },
    execReadOnlyHint: true,
    eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".codex/hooks.json" },
    skillChannel: { kind: "home-dir", path: ".codex/skills" },
    // ADR-0020
    decode: decode2,
    encode: encode2
  },
  {
    id: "gemini",
    installMode: "extension",
    projectSource: "spawn-cwd",
    toolNamePrefix: TOOL_NAME_PREFIX3,
    // D-HA-GEMINI-NAMES-1: gemini-cli 0.65.0 *_TOOL_NAME constants.
    nativeTools: { shell: ["run_shell_command"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"] },
    execReadOnlyHint: false,
    // D-FU-GCH-1: no SessionStart. Claude Code also loads hooks/hooks.json (Gemini's file) and would run a SessionStart
    // entry through /bin/sh, which fails on ${extensionPath}. Gemini's SessionStart only sent the resume hint (compact never
    // arrives there), and GP6 forbids that hint on BeforeAgent, so Gemini goes without it.
    eventMap: { UserPromptSubmit: "BeforeAgent", PreToolUse: "BeforeTool", PostToolUse: "AfterTool", PreCompact: "PreCompress" },
    compactDelivery: "pending-flag",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "package", path: "hooks/hooks.json" },
    skillChannel: { kind: "package", path: "skills" },
    // ADR-0020
    decode: decode3,
    encode: encode3
  },
  {
    id: "qwen",
    installMode: "extension",
    projectSource: "spawn-cwd",
    toolNamePrefix: TOOL_NAME_PREFIX4,
    nativeTools: { shell: ["run_shell_command", "Shell"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"] },
    execReadOnlyHint: false,
    eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "package", path: "hooks/qwen.json" },
    skillChannel: { kind: "package", path: "skills" },
    // ADR-0020, D-HQ-SKILLS-3: qwen loads <extension>/skills, shared with gemini
    decode: decode4,
    encode: encode4
  },
  {
    id: "copilot-cli",
    installMode: "plugin",
    projectSource: "arg:--agent+cwd",
    toolNamePrefix: TOOL_NAME_PREFIX5,
    nativeTools: { shell: ["bash"] },
    execReadOnlyHint: false,
    eventMap: { SessionStart: "sessionStart", UserPromptSubmit: "userPromptSubmitted", PreToolUse: "preToolUse", PostToolUse: "postToolUse" },
    compactDelivery: "pending-flag",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".copilot/hooks/context-mode.json" },
    skillChannel: { kind: "home-dir", path: ".copilot/skills" },
    // ADR-0020
    decode: decode5,
    encode: encode5
  },
  {
    id: "vscode",
    installMode: "mcp-entry",
    projectSource: "arg:workspaceFolder",
    toolNamePrefix: TOOL_NAME_PREFIX6,
    // PreCompact sets the pending flag (ADR-0009 §6, DEVIATIONS D-M3-A4-1).
    nativeTools: { shell: [...SHELL_TOOL_NAMES], read: [...READ_TOOL_NAMES], webfetch: [...WEBFETCH_TOOL_NAMES] },
    // D-HF-VSCODE-PROJECT-1, D-N7-VSCODE-TOOLS-1
    execReadOnlyHint: false,
    eventMap: { ...CLAUDE_EVENTS, PreCompact: "PreCompact" },
    compactDelivery: "pending-flag",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".copilot/hooks/context-mode-vscode.json" },
    skillChannel: { kind: "home-dir", path: ".agents/skills" },
    // ADR-0020, D-HQ-COPILOT-NAMES-3: Copilot CLI owns ~/.copilot/skills
    decode: decode6,
    encode: encode6
  },
  {
    id: "kiro",
    installMode: "mcp-entry",
    projectSource: "arg:--agent+cwd",
    toolNamePrefix: TOOL_NAME_PREFIX7,
    nativeTools: { shell: [...SHELL_TOOL_NAMES2] },
    execReadOnlyHint: false,
    // D-HF-KIRO-SHELL-1, D-N7-KIRO-1
    eventMap: { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" },
    compactDelivery: "none",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "hint-only",
    hookChannel: { kind: "home-file", path: ".kiro/hooks/context-mode.json" },
    skillChannel: { kind: "home-dir", path: ".kiro/skills" },
    // ADR-0020
    decode: decode7,
    encode: encode7
  },
  {
    // toolNamePrefix is the documented ZCode name mcp__<server>__<tool> (D-N7-ZCODE-NAMES-1); nativeTools are Claude names.
    id: "zcode",
    installMode: "hooks+mcp",
    projectSource: "spawn-cwd",
    toolNamePrefix: TOOL_NAME_PREFIX8,
    nativeTools: CLAUDE_TOOLS,
    execReadOnlyHint: false,
    eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart",
    compactSummary: "none",
    hookTimeoutMs: HOOK_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".zcode/cli/config.json" },
    skillChannel: { kind: "home-dir", path: ".zcode/skills" },
    // ADR-0020
    decode: decode8,
    encode: encode8
  },
  {
    id: "pi",
    installMode: "in-process",
    projectSource: "pi:ctx.cwd",
    toolNamePrefix: TOOL_NAME_PREFIX9,
    nativeTools: { shell: ["bash"], read: ["read"] },
    execReadOnlyHint: false,
    eventMap: { SessionStart: "session_start", UserPromptSubmit: "input", PreToolUse: "tool_call", PostToolUse: "tool_result" },
    compactDelivery: "pi-flag",
    compactSummary: "none",
    hookTimeoutMs: IN_PROCESS_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "in-process", path: "pi/index.js" },
    skillChannel: { kind: "package", path: "pi/skills" },
    // ADR-0020
    decode: decode9,
    encode: encode9,
    checkPermission
  },
  {
    id: "opencode",
    installMode: "in-process",
    projectSource: "spawn-cwd",
    toolNamePrefix: TOOL_NAME_PREFIX10,
    nativeTools: { shell: [SHELL_TOOL_NAME] },
    execReadOnlyHint: false,
    // D-HF-OPENCODE-SHELL-1
    // Usage: step-finish cost row (DEVIATIONS D-M5-arch-2).
    eventMap: { SessionStart: "context", UserPromptSubmit: "prompt", PreToolUse: "execute.before", PostToolUse: "execute.after", PreCompact: "compaction", Usage: "step-finish" },
    compactDelivery: "opencode-cache",
    compactSummary: "none",
    hookTimeoutMs: IN_PROCESS_TIMEOUT_MS,
    denyChannel: "deny-reason",
    hookChannel: { kind: "in-process", path: "opencode/plugin.js" },
    skillChannel: { kind: "home-dir", path: ".config/opencode/skills" },
    // ADR-0020
    decode: decode10,
    encode: encode10,
    toCanonicalTool
  }
]);
var BY_ID = new Map(ADAPTERS.map((r) => [r.id, r]));
var REPLACE_ROWS = /* @__PURE__ */ new Set(["claude-code", "gemini", "copilot-cli", "pi"]);
function hasReplace(row5) {
  return REPLACE_ROWS.has(row5.id);
}
var DUMP_REPLACE_ROWS = /* @__PURE__ */ new Set(["claude-code", "copilot-cli", "pi"]);
function dumpRunsThenReplaces(row5) {
  return DUMP_REPLACE_ROWS.has(row5.id) && hasReplace(row5);
}
var RECALL_ROWS = /* @__PURE__ */ new Set(["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "zcode"]);
function hasRecall(row5) {
  return RECALL_ROWS.has(row5.id);
}
function getAdapter(id2) {
  return BY_ID.get(id2);
}

// src/core/policy/decide.ts
import { resolve } from "node:path";

// src/core/policy/lexer.ts
var OPS = ["&&", "||", ";;", "|&", ";", "|", "&", "(", ")"];
var IO_BOTH = ["&>>", "&>"];
var IO_AFTER_FD = [">>", ">|", ">&", ">", "<<<", "<<-", "<<", "<&", "<>", "<"];
var DUP_SUFFIX = "&";
var HEREDOC = "<<";
var HEREDOC_STRIP = "<<-";
var NEWLINE_OP = ";";
var CRLF = "\r\n";
var LINE_CONT = "\\\n";
var LINE_CONT_CRLF = "\\\r\n";
var DOLLAR_PAREN = "$(";
var DOLLAR_BRACE = "${";
var ANSI_QUOTE = "$'";
var ARITH_OPEN = "((";
var ARITH_CLOSE = "))";
var COND_OPEN = "[[";
var COND_CLOSE = "]]";
var PROC_IN = "<(";
var PROC_OUT = ">(";
var ESCAPED = "\\x".length;
var BOUNDARY = " 	\n\r;&|()<>";
var BLANK = " 	\n\r";
var DQ_ESCAPABLE = '$`"\\\n';
var CASE_WORD = "case";
var ESAC_WORD = "esac";
function fail(st, end) {
  if (st.end === "complete") st.end = end;
}
function isDigit(c) {
  return c !== "" && c >= "0" && c <= "9";
}
function isAlpha(c) {
  return c !== "" && (c >= "a" && c <= "z" || c >= "A" && c <= "Z");
}
function isBoundary(c) {
  return c === "" || BOUNDARY.includes(c);
}
function isBlank(c) {
  return c !== "" && BLANK.includes(c);
}
function push(out, kind, text, start, end) {
  if (out !== null) out.push({ kind, text, start, end });
}
function skipSingle(st, i) {
  const j = st.s.indexOf("'", i + 1);
  if (j < 0) {
    fail(st, "unterminated-quote");
    return st.n;
  }
  return j + 1;
}
function skipAnsi(st, i) {
  let j = i + ANSI_QUOTE.length;
  while (j < st.n) {
    const c = st.s.charAt(j);
    if (c === "\\") {
      j += ESCAPED;
      continue;
    }
    if (c === "'") return j + 1;
    j++;
  }
  fail(st, "unterminated-quote");
  return st.n;
}
function skipDouble(st, i, depth) {
  let j = i + 1;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (c === "\\") {
      j += ESCAPED;
      continue;
    }
    if (c === '"') return j + 1;
    if (c === "$" && next === "(") {
      j = skipDollarParen(st, j, depth);
      continue;
    }
    if (c === "$" && next === "{") {
      j = skipBrace(st, j, depth);
      continue;
    }
    if (c === "`") {
      j = skipBacktick(st, j);
      continue;
    }
    j++;
  }
  fail(st, "unterminated-quote");
  return st.n;
}
function skipBacktick(st, i) {
  let j = i + 1;
  while (j < st.n) {
    const c = st.s.charAt(j);
    if (c === "\\") {
      j += ESCAPED;
      continue;
    }
    if (c === "`") return j + 1;
    j++;
  }
  return st.n;
}
function skipBrace(st, i, depth) {
  let j = i + DOLLAR_BRACE.length;
  let open = 0;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (c === "\\") {
      j += ESCAPED;
      continue;
    }
    if (c === "'") {
      j = skipSingle(st, j);
      continue;
    }
    if (c === '"') {
      j = skipDouble(st, j, depth);
      continue;
    }
    if (c === "$" && next === "(") {
      j = skipDollarParen(st, j, depth);
      continue;
    }
    if (c === "`") {
      j = skipBacktick(st, j);
      continue;
    }
    if (c === "{") open++;
    if (c === "}") {
      if (open === 0) return j + 1;
      open--;
    }
    j++;
  }
  return st.n;
}
function arithEnd(s, i) {
  let open = 0;
  let j = i + ARITH_OPEN.length;
  while (j < s.length) {
    const c = s.charAt(j);
    if (c === "(") open++;
    if (c === ")") {
      if (open === 0) return s.startsWith(ARITH_CLOSE, j) ? j + ARITH_CLOSE.length : -1;
      open--;
    }
    j++;
  }
  return -1;
}
function skipDollarParen(st, i, depth) {
  const open = i + DOLLAR_PAREN.length - 1;
  if (st.s.startsWith(ARITH_OPEN, open)) {
    const e = arithEnd(st.s, open);
    if (e > 0) return e;
  }
  return lexSpan(st, open + 1, true, depth + 1, null, null);
}
function condEnd(st, i, depth) {
  let j = i + COND_OPEN.length;
  let open = 0;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (c === "\\") {
      j += ESCAPED;
      continue;
    }
    if (c === "'") {
      j = skipSingle(st, j);
      continue;
    }
    if (c === '"') {
      j = skipDouble(st, j, depth);
      continue;
    }
    if (c === "$" && next === "(") {
      j = skipDollarParen(st, j, depth);
      continue;
    }
    if (c === "$" && next === "{") {
      j = skipBrace(st, j, depth);
      continue;
    }
    if (c === "`") {
      j = skipBacktick(st, j);
      continue;
    }
    const blankBefore = isBlank(st.s.charAt(j - 1));
    if (blankBefore && st.s.startsWith(COND_CLOSE, j) && isBoundary(st.s.charAt(j + COND_CLOSE.length))) {
      if (open === 0) return j + COND_CLOSE.length;
      open--;
      j += COND_CLOSE.length;
      continue;
    }
    if (blankBefore && st.s.startsWith(COND_OPEN, j) && isBlank(st.s.charAt(j + COND_OPEN.length))) {
      open++;
      j += COND_OPEN.length;
      continue;
    }
    j++;
  }
  return -1;
}
function ioAt(s, i) {
  let j = i;
  while (isDigit(s.charAt(j))) j++;
  if (j === i) {
    for (const op of IO_BOTH) if (s.startsWith(op, i)) return { end: i + op.length, op };
  }
  for (const op of IO_AFTER_FD) {
    if (!s.startsWith(op, j)) continue;
    let e = j + op.length;
    if (op.endsWith(DUP_SUFFIX)) {
      if (s.charAt(e) === "-") e++;
      else while (isDigit(s.charAt(e))) e++;
    }
    return { end: e, op };
  }
  return null;
}
function readWord(st, i, depth) {
  let j = i;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (BOUNDARY.includes(c)) break;
    if (c === "\\") {
      j += ESCAPED;
      continue;
    }
    if (c === "'") {
      j = skipSingle(st, j);
      continue;
    }
    if (c === '"') {
      j = skipDouble(st, j, depth);
      continue;
    }
    if (c === "$" && next === "'") {
      j = skipAnsi(st, j);
      continue;
    }
    if (c === "$" && next === "(") {
      j = skipDollarParen(st, j, depth);
      continue;
    }
    if (c === "$" && next === "{") {
      j = skipBrace(st, j, depth);
      continue;
    }
    if (c === "`") {
      j = skipBacktick(st, j);
      continue;
    }
    j++;
  }
  return Math.min(j, st.n);
}
function readBodies(st, i, pending, out, bodies) {
  let at2 = i;
  for (const h of pending) {
    const start = at2;
    let found = false;
    while (at2 < st.n) {
      const nl = st.s.indexOf("\n", at2);
      const lineEnd = nl < 0 ? st.n : nl;
      let line = st.s.slice(at2, lineEnd);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      at2 = nl < 0 ? st.n : nl + 1;
      if ((h.strip ? line.trim() : line) === h.tag) {
        found = true;
        break;
      }
    }
    if (out !== null && bodies !== null) bodies.push(out.length);
    push(out, "unhandled", st.s.slice(start, at2), start, at2);
    if (!found) {
      fail(st, "unterminated-heredoc");
      return st.n;
    }
  }
  pending.length = 0;
  return at2;
}
function lexSpan(st, from, inParen, depth, out, bodies) {
  if (depth > MAX_NEST_DEPTH) {
    fail(st, "too-deep");
    return st.n;
  }
  const s = st.s;
  let i = from;
  let parens = 0;
  let cases = 0;
  let tagStrip = null;
  const pending = [];
  while (i < st.n) {
    const c = s.charAt(i);
    const next = s.charAt(i + 1);
    if (c === " " || c === "	") {
      i++;
      continue;
    }
    if (s.startsWith(LINE_CONT, i)) {
      i += LINE_CONT.length;
      continue;
    }
    if (s.startsWith(LINE_CONT_CRLF, i)) {
      i += LINE_CONT_CRLF.length;
      continue;
    }
    if (c === "\n" || c === "\r") {
      const start2 = i;
      i += s.startsWith(CRLF, i) ? CRLF.length : 1;
      push(out, "op", NEWLINE_OP, start2, i);
      tagStrip = null;
      if (pending.length > 0) i = readBodies(st, i, pending, out, bodies);
      continue;
    }
    if (c === "#") {
      while (i < st.n && s.charAt(i) !== "\n" && s.charAt(i) !== "\r") i++;
      continue;
    }
    if (s.startsWith(PROC_IN, i) || s.startsWith(PROC_OUT, i)) {
      const e = lexSpan(st, i + PROC_IN.length, true, depth + 1, null, null);
      push(out, "unhandled", s.slice(i, e), i, e);
      i = e;
      tagStrip = null;
      continue;
    }
    const io = ioAt(s, i);
    if (io !== null) {
      push(out, "io", s.slice(i, io.end), i, io.end);
      tagStrip = io.op === HEREDOC || io.op === HEREDOC_STRIP ? io.op === HEREDOC_STRIP : null;
      i = io.end;
      continue;
    }
    if (s.startsWith(COND_OPEN, i) && isBlank(s.charAt(i + COND_OPEN.length))) {
      const e = condEnd(st, i, depth);
      if (e > 0) {
        push(out, "unhandled", s.slice(i, e), i, e);
        i = e;
        tagStrip = null;
        continue;
      }
    }
    if (s.startsWith(ARITH_OPEN, i)) {
      const e = arithEnd(s, i);
      if (e > 0) {
        push(out, "unhandled", s.slice(i, e), i, e);
        i = e;
        tagStrip = null;
        continue;
      }
    }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op !== void 0) {
      if (inParen && op === "(") parens++;
      if (inParen && op === ")") {
        if (parens > 0) parens--;
        else if (cases === 0) return i + 1;
      }
      push(out, "op", op, i, i + op.length);
      i += op.length;
      tagStrip = null;
      continue;
    }
    if (c === "$" && next === "(" || c === "`") {
      const e = c === "`" ? skipBacktick(st, i) : skipDollarParen(st, i, depth);
      if (isBoundary(s.charAt(e))) {
        push(out, "unhandled", s.slice(i, e), i, e);
        i = e;
        tagStrip = null;
        continue;
      }
    }
    const start = i;
    i = readWord(st, i, depth);
    const text = s.slice(start, i);
    push(out, "word", text, start, i);
    if (tagStrip !== null) {
      pending.push({ tag: dequote(text), strip: tagStrip });
      tagStrip = null;
    }
    if (inParen && text === CASE_WORD) cases++;
    if (inParen && text === ESAC_WORD && cases > 0) cases--;
  }
  if (pending.length > 0) fail(st, "unterminated-heredoc");
  return st.n;
}
function scan(cmd) {
  const st = { s: cmd, n: cmd.length, end: "complete" };
  const tokens = [];
  const heredocBodies = [];
  lexSpan(st, 0, false, 0, tokens, heredocBodies);
  return { tokens, heredocBodies, end: st.end };
}
function dequote(word) {
  let out = "";
  let i = 0;
  const n = word.length;
  while (i < n) {
    const c = word.charAt(i);
    if (c === "\\") {
      out += word.charAt(i + 1);
      i += ESCAPED;
      continue;
    }
    if (c === "'") {
      const j = word.indexOf("'", i + 1);
      const e = j < 0 ? n : j;
      out += word.slice(i + 1, e);
      i = e + 1;
      continue;
    }
    if (c === "$" && word.charAt(i + 1) === "'") {
      let j = i + ANSI_QUOTE.length;
      while (j < n && word.charAt(j) !== "'") {
        if (word.charAt(j) === "\\") {
          out += word.charAt(j + 1);
          j += ESCAPED;
          continue;
        }
        out += word.charAt(j);
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && word.charAt(j) !== '"') {
        const e = word.charAt(j + 1);
        if (word.charAt(j) === "\\" && e !== "" && DQ_ESCAPABLE.includes(e)) {
          out += e;
          j += ESCAPED;
          continue;
        }
        out += word.charAt(j);
        j++;
      }
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
function substitutions(text) {
  const st = { s: text, n: text.length, end: "complete" };
  const found = [];
  let inDouble = false;
  let i = 0;
  while (i < st.n) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === "\\") {
      i += ESCAPED;
      continue;
    }
    if (!inDouble && c === "'") {
      i = skipSingle(st, i);
      continue;
    }
    if (!inDouble && c === "$" && next === "'") {
      i = skipAnsi(st, i);
      continue;
    }
    if (c === '"') {
      inDouble = !inDouble;
      i++;
      continue;
    }
    if (c === "$" && next === "{") {
      i += DOLLAR_BRACE.length;
      continue;
    }
    const procIn = text.startsWith(PROC_IN, i);
    if (c === "$" && next === "(" || !inDouble && (procIn || text.startsWith(PROC_OUT, i))) {
      const open = i + 1;
      if (c === "$" && text.startsWith(ARITH_OPEN, open)) {
        if (arithEnd(text, open) > 0) {
          i = open + ARITH_OPEN.length;
          continue;
        }
      }
      const e = lexSpan(st, open + 1, true, 1, null, null);
      const bodyEnd = e > open + 1 && text.charAt(e - 1) === ")" ? e - 1 : e;
      found.push({ wrapper: c === "$" ? "$()" : procIn ? "<()" : ">()", body: text.slice(open + 1, bodyEnd) });
      i = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(st, i);
      const bodyEnd = e > i + 1 && text.charAt(e - 1) === "`" ? e - 1 : e;
      found.push({ wrapper: "`", body: text.slice(i + 1, bodyEnd) });
      i = e;
      continue;
    }
    i++;
  }
  return found;
}
function isAssignment(word) {
  const first = word.charAt(0);
  if (!(isAlpha(first) || first === "_")) return false;
  for (let i = 1; i < word.length; i++) {
    const c = word.charAt(i);
    if (c === "=") return true;
    if (c === "+" && word.charAt(i + 1) === "=") return true;
    if (!(isAlpha(c) || isDigit(c) || c === "_")) return false;
  }
  return false;
}

// src/core/policy/parse.ts
var SEPARATORS = [";", "&", "&&", "||"];
var PIPES = ["|", "|&"];
var SUBSHELL_OPEN = "(";
var SUBSHELL_CLOSE = ")";
var CASE_BREAK = ";;";
var FUNC_PARENS = ["(", ")"];
var NOT = "!";
var KW = Object.freeze({
  group: "{",
  groupEnd: "}",
  if: "if",
  then: "then",
  elif: "elif",
  else: "else",
  fi: "fi",
  while: "while",
  until: "until",
  for: "for",
  in: "in",
  do: "do",
  done: "done",
  case: "case",
  esac: "esac",
  function: "function",
  coproc: "coproc",
  select: "select"
});
var NO_STOP = [];
var COND_PREFIX = "[[";
var ARITH_PREFIX = "((";
var TO_FILE_OPS = [">", ">>", ">|", "&>", "&>>", ">&"];
var TARGET_OPS = [...TO_FILE_OPS, "<", "<>", "<<<", "<<", "<<-"];
var STDOUT_FDS = ["", "1"];
var STDOUT_ALIASES = ["-", "/dev/stdout", "/dev/stderr"];
var OPT = "-";
var LONG_OPT = "--";
var OPT_VALUE = "=";
var PATH_SEP = "/";
var OUTPUT_FLAGS = Object.freeze({
  curl: { short: "o", long: "--output" },
  wget: { short: "O", long: "--output-document" }
});
var SINK = Object.freeze({ head: "head", wc: "wc", grep: "grep", jq: "jq" });
var HEAD_BYTES = "-c";
var HEAD_BYTES_LONG = "--bytes";
var GREP_COUNT_SHORT = "c";
var GREP_COUNT_LONG = "--count";
var EMPTY3 = () => ({ cmds: [], simple: null });
var at = (p, k = 0) => p.toks[p.i + k];
var isOp = (t, text) => t !== void 0 && t.kind === "op" && t.text === text;
var isWord = (t, text) => t !== void 0 && t.kind === "word" && t.text === text;
var isDigit2 = (c) => c !== "" && c >= "0" && c <= "9";
var isWordChar = (c) => isDigit2(c) || c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
function baseName(word) {
  const k = word.lastIndexOf(PATH_SEP);
  return k >= 0 && k < word.length - 1 ? word.slice(k + 1) : word;
}
function writesFile(argv0, args) {
  const flag = OUTPUT_FLAGS[argv0.toLowerCase()];
  if (flag === void 0) return false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === LONG_OPT) break;
    let value;
    if (a === flag.long) value = args[k + 1];
    else if (a.startsWith(flag.long + OPT_VALUE)) value = a.slice(flag.long.length + OPT_VALUE.length);
    else if (a.startsWith(OPT) && !a.startsWith(LONG_OPT)) {
      const pos = a.indexOf(flag.short, OPT.length);
      if (pos < 0) continue;
      value = pos + flag.short.length < a.length ? a.slice(pos + flag.short.length) : args[k + 1];
    } else continue;
    if (value !== void 0 && !STDOUT_ALIASES.includes(value)) return true;
  }
  return false;
}
function allDigits(s) {
  if (s === "") return false;
  for (const c of s) if (!isDigit2(c)) return false;
  return true;
}
function headBounded(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    let n;
    if (a === HEAD_BYTES || a === HEAD_BYTES_LONG) n = args[k + 1];
    else if (a.startsWith(HEAD_BYTES_LONG + OPT_VALUE)) n = a.slice(HEAD_BYTES_LONG.length + OPT_VALUE.length);
    else if (a.startsWith(HEAD_BYTES) && !a.startsWith(LONG_OPT)) n = a.slice(HEAD_BYTES.length);
    if (n !== void 0) return allDigits(n) && Number(n) <= OUTPUT_CAP;
  }
  return false;
}
function grepCounts(args) {
  for (const a of args) {
    if (a === LONG_OPT) return false;
    if (a === GREP_COUNT_LONG) return true;
    if (a.startsWith(OPT) && !a.startsWith(LONG_OPT) && a.includes(GREP_COUNT_SHORT)) return true;
  }
  return false;
}
function jqPath(s) {
  if (!s.startsWith(JQ_WHITELIST.fieldSep)) return false;
  for (const seg of s.slice(JQ_WHITELIST.fieldSep.length).split(JQ_WHITELIST.fieldSep)) {
    if (seg === "") return false;
    for (const c of seg) if (!isWordChar(c)) return false;
  }
  return true;
}
function jqWhitelisted(filter) {
  const s = filter.trim();
  if (s === JQ_WHITELIST.identity || s === JQ_WHITELIST.length) return true;
  const bar = s.indexOf(JQ_WHITELIST.pipeLength.charAt(0));
  if (bar < 0) return jqPath(s);
  const left = s.slice(0, bar).trim();
  const right = JQ_WHITELIST.pipeLength.slice(1).trim();
  return (left === JQ_WHITELIST.identity || jqPath(left)) && s.slice(bar + 1).trim() === right;
}
function isBoundedSink(c) {
  const name = c.argv0.toLowerCase();
  if (name === SINK.wc) return true;
  if (name === SINK.head) return headBounded(c.args);
  if (name === SINK.grep) return grepCounts(c.args);
  if (name === SINK.jq) {
    const positional = c.args.filter((a) => !a.startsWith(OPT));
    return positional.length === 1 && jqWhitelisted(positional[0]);
  }
  return false;
}
function carrier(raw) {
  if (substitutions(raw).length === 0) return [];
  return [{ argv0: "", args: [], redirectsToFile: false, endsInBoundedSink: false, raw }];
}
function carrierOf(p, from, to) {
  if (to <= from) return [];
  return carrier(p.src.slice(p.toks[from].start, p.toks[to - 1].end));
}
function tag(cmds, name) {
  for (const c of cmds) if (c.insideConstruct === void 0) c.insideConstruct = name;
}
function splitIo(text) {
  let k = 0;
  while (isDigit2(text.charAt(k))) k++;
  return { fd: text.slice(0, k), op: text.slice(k) };
}
function ioRedirect(p) {
  const io = splitIo(p.toks[p.i].text);
  p.i++;
  if (!TARGET_OPS.includes(io.op)) return false;
  const target = at(p);
  if (target === void 0 || target.kind === "op" || target.kind === "io") return false;
  p.i++;
  return TO_FILE_OPS.includes(io.op) && STDOUT_FDS.includes(io.fd) && !STDOUT_ALIASES.includes(dequote(target.text));
}
function trailingRedirects(p) {
  let toFile = false;
  while (at(p)?.kind === "io") toFile = ioRedirect(p) || toFile;
  return toFile;
}
function skipSeparators(p) {
  while (at(p)?.kind === "op" && SEPARATORS.includes(at(p)?.text ?? "")) p.i++;
}
function compound(p, body) {
  p.depth++;
  if (p.depth > MAX_NEST_DEPTH) {
    p.err = "nesting-too-deep";
    return EMPTY3();
  }
  const cmds = body();
  p.depth--;
  if (trailingRedirects(p)) for (const c of cmds) c.redirectsToFile = true;
  return { cmds, simple: null };
}
function doBlock(p) {
  skipSeparators(p);
  if (!isWord(at(p), KW.do)) return [];
  p.i++;
  const body = list(p, [KW.done]);
  if (isWord(at(p), KW.done)) p.i++;
  return body;
}
function ifBody(p) {
  p.i++;
  const out = list(p, [KW.then]);
  while (p.err === null) {
    const t = at(p);
    if (isWord(t, KW.then) || isWord(t, KW.else)) {
      p.i++;
      out.push(...list(p, [KW.elif, KW.else, KW.fi]));
      continue;
    }
    if (isWord(t, KW.elif)) {
      p.i++;
      out.push(...list(p, [KW.then]));
      continue;
    }
    if (isWord(t, KW.fi)) p.i++;
    break;
  }
  return out;
}
function loopBody(p) {
  p.i++;
  const out = list(p, [KW.do]);
  out.push(...doBlock(p));
  return out;
}
function forBody(p) {
  p.i++;
  const out = [];
  const t = at(p);
  if (t?.kind === "unhandled") p.i++;
  else {
    if (t?.kind === "word") p.i++;
    if (isWord(at(p), KW.in)) {
      p.i++;
      const from = p.i;
      while ((at(p)?.kind === "word" || at(p)?.kind === "unhandled") && !isWord(at(p), KW.do)) p.i++;
      out.push(...carrierOf(p, from, p.i));
    }
  }
  out.push(...doBlock(p));
  return out;
}
function caseBody(p) {
  p.i++;
  const out = [];
  const subject = at(p);
  if (subject !== void 0 && subject.kind !== "op" && subject.kind !== "io") {
    p.i++;
    out.push(...carrierOf(p, p.i - 1, p.i));
  }
  if (isWord(at(p), KW.in)) p.i++;
  while (p.i < p.toks.length && p.err === null) {
    const t = p.toks[p.i];
    if (p.bodies.has(p.i) || t.kind === "op" && (SEPARATORS.includes(t.text) || t.text === CASE_BREAK)) {
      p.i++;
      continue;
    }
    if (isWord(t, KW.esac)) {
      p.i++;
      break;
    }
    if (isOp(t, SUBSHELL_OPEN)) p.i++;
    while (p.i < p.toks.length && !isOp(at(p), SUBSHELL_CLOSE)) {
      const pt = p.toks[p.i];
      if (pt.kind === "op" && !PIPES.includes(pt.text)) break;
      p.i++;
    }
    if (!isOp(at(p), SUBSHELL_CLOSE)) break;
    p.i++;
    const body = list(p, [KW.esac]);
    tag(body, KW.case);
    out.push(...body);
  }
  return out;
}
function functionBody(p, name) {
  skipSeparators(p);
  const el = element(p);
  tag(el.cmds, name);
  return { cmds: el.cmds, simple: null };
}
function hasFuncParens(p, from) {
  return FUNC_PARENS.every((text, k) => isOp(p.toks[from + k], text));
}
function simple(p) {
  const first = p.i;
  const words = [];
  let toFile = false;
  while (p.i < p.toks.length) {
    const t = p.toks[p.i];
    if (t.kind === "op") break;
    if (t.kind === "io") {
      toFile = ioRedirect(p) || toFile;
      continue;
    }
    if (words.length === 0 && t.kind === "word" && isAssignment(t.text)) {
      p.i++;
      const open = at(p);
      if (t.text.endsWith(OPT_VALUE) && open !== void 0 && isOp(open, SUBSHELL_OPEN) && open.start === t.end) {
        let parens = 0;
        while (p.i < p.toks.length) {
          const a = p.toks[p.i];
          p.i++;
          if (isOp(a, SUBSHELL_OPEN)) parens++;
          if (isOp(a, SUBSHELL_CLOSE) && --parens === 0) break;
        }
      }
      continue;
    }
    words.push(t);
    p.i++;
  }
  if (p.i === first) return EMPTY3();
  const raw = p.src.slice(p.toks[first].start, p.toks[p.i - 1].end);
  if (words.length === 0) return { cmds: carrier(raw), simple: null };
  const text = (t) => t.kind === "word" ? dequote(t.text) : t.text;
  const argv0 = baseName(text(words[0]));
  const args = words.slice(1).map(text);
  const cmd = { argv0, args, redirectsToFile: toFile || writesFile(argv0, args), endsInBoundedSink: false, raw };
  return { cmds: [cmd], simple: cmd };
}
function element(p) {
  const t = at(p);
  if (t === void 0) return EMPTY3();
  if (t.kind === "op") {
    if (t.text !== SUBSHELL_OPEN) return EMPTY3();
    return compound(p, () => {
      p.i++;
      const body = list(p, NO_STOP);
      if (isOp(at(p), SUBSHELL_CLOSE)) p.i++;
      return body;
    });
  }
  if (t.kind === "unhandled" && (t.text.startsWith(COND_PREFIX) || t.text.startsWith(ARITH_PREFIX))) {
    p.i++;
    trailingRedirects(p);
    return { cmds: carrier(t.text), simple: null };
  }
  if (t.kind === "word") {
    switch (t.text) {
      case KW.group:
        return compound(p, () => {
          p.i++;
          const body = list(p, [KW.groupEnd]);
          if (isWord(at(p), KW.groupEnd)) p.i++;
          return body;
        });
      case KW.if:
        return compound(p, () => ifBody(p));
      case KW.while:
      case KW.until:
        return compound(p, () => loopBody(p));
      case KW.for:
        return compound(p, () => forBody(p));
      case KW.case:
        return compound(p, () => caseBody(p));
      case KW.coproc:
        p.err = "coproc";
        return EMPTY3();
      case KW.select:
        p.err = "select";
        return EMPTY3();
      case KW.function: {
        p.i++;
        const nameTok = at(p);
        let name = "";
        if (nameTok?.kind === "word") {
          name = dequote(nameTok.text);
          p.i++;
        }
        if (hasFuncParens(p, p.i)) p.i += FUNC_PARENS.length;
        return functionBody(p, name);
      }
      default:
        if (hasFuncParens(p, p.i + 1)) {
          p.i += FUNC_PARENS.length + 1;
          return functionBody(p, dequote(t.text));
        }
    }
  }
  return simple(p);
}
function pipeline(p) {
  if (isWord(at(p), NOT)) p.i++;
  const all = [];
  let last2 = EMPTY3();
  while (p.err === null) {
    last2 = element(p);
    all.push(...last2.cmds);
    const t = at(p);
    if (t !== void 0 && t.kind === "op" && PIPES.includes(t.text)) {
      for (const c of last2.cmds) c.pipesOut = true;
      p.i++;
      continue;
    }
    break;
  }
  if (last2.simple !== null && isBoundedSink(last2.simple)) for (const c of all) c.endsInBoundedSink = true;
  return all;
}
function list(p, stop) {
  const out = [];
  while (p.i < p.toks.length && p.err === null) {
    const t = p.toks[p.i];
    if (p.bodies.has(p.i)) {
      p.i++;
      continue;
    }
    if (t.kind === "op") {
      if (t.text === SUBSHELL_CLOSE || t.text === CASE_BREAK) return out;
      if (t.text !== SUBSHELL_OPEN) {
        p.i++;
        continue;
      }
    }
    if (t.kind === "word" && stop.includes(t.text)) return out;
    const before = p.i;
    out.push(...pipeline(p));
    if (p.i === before && p.err === null) p.i++;
  }
  return out;
}
function parseShell(cmd) {
  const s = scan(cmd);
  if (s.end === "unterminated-quote") return { ok: false, construct: "unterminated-quote" };
  if (s.end === "unterminated-heredoc") return { ok: false, construct: "unterminated-heredoc" };
  if (s.end === "too-deep") return { ok: false, construct: "nesting-too-deep" };
  const p = { toks: s.tokens, src: cmd, bodies: new Set(s.heredocBodies), i: 0, depth: 0, err: null };
  const commands = [];
  while (p.i < p.toks.length && p.err === null) {
    commands.push(...list(p, NO_STOP));
    if (p.i < p.toks.length) p.i++;
  }
  if (p.err !== null) return { ok: false, construct: p.err };
  return { ok: true, commands };
}

// src/core/policy/subagent.ts
import { join as join2 } from "node:path";

// src/core/ops/host-text.ts
var BOM_CODE = 65279;
var CR_CODE = 13;
var CRLF2 = "\r\n";
var LF = "\n";
function hostLayout(raw) {
  let crlf = 0;
  let lf = 0;
  for (let i = raw.indexOf(LF); i >= 0; i = raw.indexOf(LF, i + 1)) {
    if (i > 0 && raw.charCodeAt(i - 1) === CR_CODE) crlf += 1;
    else lf += 1;
  }
  return { bom: raw.length > 0 && raw.charCodeAt(0) === BOM_CODE, crlf: crlf > 0 && crlf >= lf };
}
function hostText(raw) {
  const bare2 = raw.length > 0 && raw.charCodeAt(0) === BOM_CODE ? raw.slice(1) : raw;
  return bare2.indexOf(CRLF2) < 0 ? bare2 : bare2.split(CRLF2).join(LF);
}
function withLayout(text, layout) {
  const eol = layout.crlf ? text.split(LF).join(CRLF2) : text;
  return layout.bom ? String.fromCharCode(BOM_CODE) + eol : eol;
}

// src/core/project/config-dir.ts
import { join, posix, win32 } from "node:path";
var { mkdirSync, realpathSync } = process.getBuiltinModule("node:fs");
function homeDirOf(env, platform = process.platform) {
  const set3 = (v) => v !== void 0 && v !== "";
  if (platform === "win32") {
    if (set3(env.USERPROFILE)) return env.USERPROFILE;
    if (set3(env.HOMEDRIVE) && set3(env.HOMEPATH)) return env.HOMEDRIVE + env.HOMEPATH;
    return set3(env.HOME) ? env.HOME : null;
  }
  if (set3(env.HOME)) return env.HOME;
  return set3(env.USERPROFILE) ? env.USERPROFILE : null;
}
function codexDirOf(env, home) {
  const dir = env[CODEX_HOME_ENV];
  return dir !== void 0 && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR.codex);
}
function copilotDirOf(env, home) {
  const dir = env[COPILOT_HOME_ENV];
  return dir !== void 0 && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR["copilot-cli"]);
}
function kiroDirOf(env, home, platform = process.platform) {
  const p = platform === "win32" ? win32 : posix;
  const fallback = p.join(home, ...AGENT_HOME_DIR.kiro);
  const dir = env[KIRO_HOME_ENV];
  if (dir === void 0 || dir === "" || !p.isAbsolute(dir)) return fallback;
  if (platform === "win32" && p.parse(dir).root.length < 2) return fallback;
  const abs = p.resolve(dir);
  if (p.dirname(abs) === abs) return fallback;
  const up = p.relative(abs, p.resolve(home));
  if (!p.isAbsolute(up) && up.split(p.sep)[0] !== "..") return fallback;
  return dir;
}
function claudeDirOf(env, home) {
  const dir = env[CLAUDE_CONFIG_DIR_ENV];
  return dir !== void 0 && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR["claude-code"]);
}
function opencodeDirOf(env, home) {
  const own2 = env[OPENCODE_CONFIG_DIR_ENV];
  if (own2 !== void 0 && own2 !== "") return own2;
  const xdg = env[XDG_CONFIG_HOME_ENV];
  if (xdg !== void 0 && xdg !== "") return join(xdg, AGENT_HOME_DIR.opencode[AGENT_HOME_DIR.opencode.length - 1]);
  return join(home, ...AGENT_HOME_DIR.opencode);
}
function piAgentDirOf(env, home) {
  const dir = env[PI_AGENT_DIR_ENV];
  return dir !== void 0 && dir !== "" ? dir : join(home, ...AGENT_HOME_DIR.pi, PI_AGENT_DIR);
}
function vscodeUserDirOf(env, home, platform = process.platform) {
  const set3 = (v) => v !== void 0 && v !== "";
  const p = platform === "win32" ? win32 : posix;
  if (platform === "win32") return p.join(set3(env[APPDATA_ENV]) ? env[APPDATA_ENV] : p.join(home, "AppData", "Roaming"), ...VSCODE_USER_DIR_SEGMENTS);
  if (platform === "darwin") return p.join(home, "Library", "Application Support", ...VSCODE_USER_DIR_SEGMENTS);
  return p.join(set3(env[XDG_CONFIG_HOME_ENV]) ? env[XDG_CONFIG_HOME_ENV] : p.join(home, ".config"), ...VSCODE_USER_DIR_SEGMENTS);
}
function ownMcpFileOf(agent, file2, env, home) {
  if (agent === "kiro") return join(kiroDirOf(env, home), ...file2.slice(1));
  return agent === "vscode" ? join(vscodeUserDirOf(env, home), ...file2) : join(home, ...file2);
}
function requireHomeDir(env, platform = process.platform) {
  const home = homeDirOf(env, platform);
  if (home !== null) return home;
  throw new CtxError("NO_HOME", { name: platform === "win32" ? "USERPROFILE" : "HOME" });
}
function resolveConfigDir(env) {
  const dir = join(requireHomeDir(env), DATA_ROOT.slice(1));
  mkdirSync(dir, { recursive: true });
  return realpathSync.native(dir);
}

// src/core/policy/subagent.ts
var { readFileSync } = process.getBuiltinModule("node:fs");
function isSubagentCall(ev) {
  return ev.agentId !== void 0 && ev.agentId !== "";
}
function pickSubagentCase(ev, toolSet) {
  if (toolSet === null) return "C";
  const row5 = getAdapter(ev.agent);
  const have = new Set(toolSet);
  for (const t of TOOL_ORDER) if (have.has(row5.toolNamePrefix + t)) return "A";
  for (const s of row5.nativeTools.shell) if (have.has(s)) return "B";
  return "C";
}
function toolSetForAgentType(ev, src) {
  if (!isSubagentCall(ev)) return null;
  const row5 = getAdapter(ev.agent);
  if (src.manifestTools !== void 0) return unique(src.manifestTools.map((n) => norm(row5, n)));
  const type = ev.agentType ?? "";
  const def = findDef(type, src);
  if (def === null) return null;
  const tools = (def.tools ?? allKnownToolNames(row5)).map((n) => norm(row5, n));
  const deny2 = def.disallowed.map((n) => norm(row5, n));
  return unique(tools.filter((n) => !deny2.some((d) => denies(d, n))));
}
function findDef(type, src) {
  if (!safeType(type)) return null;
  const home = homeDir(src.env);
  const plugin = type.indexOf(PLUGIN_AGENT_SEPARATOR) >= 0;
  if (!plugin) {
    const p = readAgentFile(join2(src.projectDir, HOST_CONFIG_DIR_NAME, AGENTS_DIR_NAME, type + AGENT_FILE_EXT));
    if (p !== null) return p;
    if (home !== null) {
      const u = readAgentFile(join2(claudeDirOf(src.env, home), AGENTS_DIR_NAME, type + AGENT_FILE_EXT));
      if (u !== null) return u;
    }
  } else if (home !== null) {
    const pl = readPluginAgent(claudeDirOf(src.env, home), type);
    if (pl !== null) return pl;
  }
  const cli = src.cliAgents;
  if (cli !== void 0 && Object.prototype.hasOwnProperty.call(cli, type)) {
    const d = cli[type];
    return { tools: Array.isArray(d.tools) ? d.tools : null, disallowed: Array.isArray(d.disallowedTools) ? d.disallowedTools : [] };
  }
  return null;
}
function safeType(type) {
  if (type === "" || type === "." || type === "..") return false;
  if (type.indexOf("/") >= 0 || type.indexOf("\\") >= 0) return false;
  for (const part of type.split(PLUGIN_AGENT_SEPARATOR)) if (part === "" || part === "." || part === "..") return false;
  return true;
}
function homeDir(env) {
  return homeDirOf(env);
}
function readPluginAgent(claudeDir, type) {
  const cut = type.indexOf(PLUGIN_AGENT_SEPARATOR);
  const plugin = type.slice(0, cut);
  const agent = type.slice(cut + PLUGIN_AGENT_SEPARATOR.length);
  if (agent.indexOf(PLUGIN_AGENT_SEPARATOR) >= 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(hostText(readFileSync(join2(claudeDir, HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE), "utf8")));
  } catch {
    return null;
  }
  const plugins = parsed?.plugins;
  if (plugins === null || typeof plugins !== "object") return null;
  for (const key of Object.keys(plugins)) {
    const at2 = key.indexOf(PLUGIN_KEY_SEPARATOR);
    if ((at2 < 0 ? key : key.slice(0, at2)) !== plugin) continue;
    const entries = plugins[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const dir = e?.installPath;
      if (typeof dir !== "string" || dir === "") continue;
      const d = readAgentFile(join2(dir, AGENTS_DIR_NAME, agent + AGENT_FILE_EXT));
      if (d !== null) return d;
    }
  }
  return null;
}
function readAgentFile(path5) {
  let text;
  try {
    text = readFileSync(path5, "utf8");
  } catch {
    return null;
  }
  return parseFrontmatter(text);
}
function parseFrontmatter(text) {
  const lines = text.split("\n").map((l) => l.endsWith("\r") ? l.slice(0, -1) : l);
  if (lines.length === 0 || lines[0].trim() !== FRONTMATTER_FENCE) return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === FRONTMATTER_FENCE) {
    end = i;
    break;
  }
  if (end < 0) return null;
  const body = lines.slice(1, end);
  const tools = readList(body, FRONTMATTER_TOOLS_KEY);
  const disallowed = readList(body, FRONTMATTER_DISALLOWED_KEY);
  return { tools: tools !== null && tools.length > 0 ? tools : null, disallowed: disallowed ?? [] };
}
function readList(body, key) {
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (!line.startsWith(key + ":")) continue;
    let value = line.slice(key.length + 1).trim();
    if (value === "") {
      const items = [];
      for (let j = i + 1; j < body.length; j++) {
        const t = body[j].trim();
        if (!t.startsWith("-")) break;
        items.push(unquote(t.slice(1).trim()));
      }
      return items.filter((s) => s !== "");
    }
    if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
    return value.split(",").map((s) => unquote(s.trim())).filter((s) => s !== "");
  }
  return null;
}
function unquote(s) {
  if (s.length > 1 && (s[0] === '"' || s[0] === "'") && s.endsWith(s[0])) return s.slice(1, -1);
  return s;
}
function allKnownToolNames(row5) {
  const n = row5.nativeTools;
  return [
    ...n.shell,
    ...n.read ?? [],
    ...n.grep ?? [],
    ...n.webfetch ?? [],
    ...n.edit ?? [],
    ...TOOL_ORDER.map((t) => row5.toolNamePrefix + t)
  ];
}
function norm(row5, raw) {
  const p = raw.indexOf("(");
  const name = (p >= 0 ? raw.slice(0, p) : raw).trim();
  if (row5.id === "gemini" && name.startsWith(GEMINI_MCP_PREFIX)) return geminiValid(name);
  return name;
}
function geminiValid(s) {
  let out = "";
  for (const ch of s) {
    const ok = ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch >= "0" && ch <= "9" || GEMINI_NAME_EXTRA_CHARS.indexOf(ch) >= 0;
    out += ok ? ch : "_";
  }
  return out;
}
function denies(rule, name) {
  if (rule.endsWith("*")) return name.startsWith(rule.slice(0, -1));
  if (rule === name) return true;
  if (rule.startsWith(MCP_SERVER_TOOL_PREFIX)) {
    const server2 = rule.slice(MCP_SERVER_TOOL_PREFIX.length);
    if (server2 !== "" && server2.indexOf(MCP_NAME_JOIN) < 0) return name.startsWith(rule + MCP_NAME_JOIN);
  }
  return false;
}
function unique(names) {
  return [...new Set(names.filter((n) => n !== ""))];
}

// src/core/policy/unwrap.ts
var NONE = "";
var WRAPPERS = Object.freeze({
  sudo: { valueShorts: "ugpChDrtUTR", valueLongs: ["--user", "--group", "--prompt", "--chdir", "--host"], assignments: true, duration: false, refuseShorts: NONE },
  env: { valueShorts: "uCS", valueLongs: ["--unset", "--chdir", "--split-string"], assignments: true, duration: false, refuseShorts: NONE },
  time: { valueShorts: "fo", valueLongs: ["--format", "--output"], assignments: false, duration: false, refuseShorts: NONE },
  nice: { valueShorts: "n", valueLongs: ["--adjustment"], assignments: false, duration: false, refuseShorts: NONE },
  timeout: { valueShorts: "sk", valueLongs: ["--signal", "--kill-after"], assignments: false, duration: true, refuseShorts: NONE },
  command: { valueShorts: NONE, valueLongs: [], assignments: false, duration: false, refuseShorts: "vV" },
  xargs: { valueShorts: "aEdILnPs", valueLongs: ["--arg-file", "--delimiter", "--max-args", "--max-procs", "--max-chars"], assignments: false, duration: false, refuseShorts: NONE }
});
var SHELLS = ["bash", "sh", "zsh"];
var SCRIPT_FLAG = "c";
var SHELL_LABEL_SUFFIX = " -c";
var SHELL_VALUE_OPTS = ["-o", "+o", "-O", "+O"];
var OPT2 = "-";
var PLUS_OPT = "+";
var LONG_OPT2 = "--";
var DURATION_SUFFIXES = "smhd";
var DECIMAL = ".";
var isDigit3 = (c) => c !== "" && c >= "0" && c <= "9";
function isDuration(s) {
  if (s === "" || !isDigit3(s.charAt(0))) return false;
  for (let k = 0; k < s.length; k++) {
    const c = s.charAt(k);
    if (isDigit3(c) || c === DECIMAL) continue;
    return k === s.length - 1 && DURATION_SUFFIXES.includes(c);
  }
  return true;
}
function peel(w, args) {
  let k = 0;
  while (k < args.length) {
    const a = args[k];
    if (a === LONG_OPT2) {
      k++;
      break;
    }
    if (w.assignments && isAssignment(a)) {
      k++;
      continue;
    }
    if (a.startsWith(LONG_OPT2)) {
      k++;
      if (w.valueLongs.includes(a)) k++;
      continue;
    }
    if (a.startsWith(OPT2) && a.length > OPT2.length) {
      k++;
      for (const c of w.refuseShorts) if (a.includes(c)) return null;
      for (let j = OPT2.length; j < a.length; j++) {
        if (!w.valueShorts.includes(a.charAt(j))) continue;
        if (j === a.length - 1) k++;
        break;
      }
      continue;
    }
    break;
  }
  if (w.duration) {
    if (k >= args.length || !isDuration(args[k])) return null;
    k++;
  }
  return k < args.length ? args.slice(k) : null;
}
function shellScript(args) {
  let script = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a.startsWith(LONG_OPT2)) continue;
    if (a.startsWith(OPT2) || a.startsWith(PLUS_OPT)) {
      if (a.includes(SCRIPT_FLAG)) script = true;
      if (SHELL_VALUE_OPTS.includes(a)) k++;
      continue;
    }
    return script ? a : null;
  }
  return null;
}
function inherit(inner, from) {
  const c = { ...inner };
  if (c.insideConstruct === void 0 && from.insideConstruct !== void 0) c.insideConstruct = from.insideConstruct;
  return c;
}
function expand(c, outer, depth, out) {
  const by = [...outer];
  let argv0 = c.argv0;
  let args = c.args;
  let toFile = c.redirectsToFile;
  for (; ; ) {
    const name = argv0.toLowerCase();
    if (SHELLS.includes(name)) {
      const script = shellScript(args);
      const r = script !== null && depth < MAX_NEST_DEPTH ? parseShell(script) : null;
      if (r === null || !r.ok) break;
      for (const inner of r.commands) {
        const spliced = inherit(inner, c);
        spliced.redirectsToFile = inner.redirectsToFile || toFile;
        spliced.endsInBoundedSink = inner.endsInBoundedSink || c.endsInBoundedSink;
        expand(spliced, [...by, name + SHELL_LABEL_SUFFIX], depth + 1, out);
      }
      return;
    }
    const w = Object.hasOwn(WRAPPERS, name) ? WRAPPERS[name] : void 0;
    const rest = w === void 0 ? null : peel(w, args);
    if (rest === null) break;
    by.push(name);
    argv0 = baseName(rest[0]);
    args = rest.slice(1);
    toFile = toFile || writesFile(argv0, args);
  }
  out.push({ ...c, argv0, args, redirectsToFile: toFile, wrappedBy: by });
  if (depth >= MAX_NEST_DEPTH) return;
  for (const s of substitutions(c.raw)) {
    const r = parseShell(s.body);
    if (!r.ok) continue;
    for (const inner of r.commands) expand(inherit(inner, c), [...outer, s.wrapper], depth + 1, out);
  }
}
function unwrap(commands) {
  const out = [];
  for (const c of commands) expand(c, [], 0, out);
  return out;
}

// src/core/policy/user-deny.ts
import { isAbsolute, join as join3, relative, sep } from "node:path";
var { readFileSync: readFileSync2 } = process.getBuiltinModule("node:fs");
var CLAUDE_DIR = ".claude";
var LOCAL_SETTINGS = "settings.local.json";
var SETTINGS = "settings.json";
var BASH_TOOL = "Bash";
var READ_TOOL = "Read";
var PREFIX_RULE = ":*";
var ABS_ANCHOR = "//";
var HOME_ANCHOR = "~/";
var PROJECT_ANCHOR = "./";
var PARENT = "..";
var WHITESPACE = " 	\n\r";
var BASH_SUBJECT = Object.freeze({ tool: BASH_TOOL });
function denyFiles(projectDir, agent) {
  if (agent !== "claude-code") return [];
  const home = homeDirOf(process.env);
  const cfg = process.env[CLAUDE_CONFIG_DIR_ENV];
  const userDir = cfg !== void 0 && cfg !== "" ? cfg : home === null ? null : claudeDirOf(process.env, home);
  const project = [join3(projectDir, CLAUDE_DIR, LOCAL_SETTINGS), join3(projectDir, CLAUDE_DIR, SETTINGS)];
  return userDir === null ? project : [...project, join3(userDir, SETTINGS)];
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readOne(file2) {
  let text;
  try {
    text = hostText(readFileSync2(file2, "utf8"));
  } catch (err) {
    return err.code === "ENOENT" ? { kind: "absent" } : { kind: "bad" };
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { kind: "bad" };
  }
  if (!isObject(doc)) return { kind: "bad" };
  const perms = doc.permissions;
  if (perms === void 0) return { kind: "ok", deny: [] };
  if (!isObject(perms)) return { kind: "bad" };
  const deny2 = perms.deny;
  if (deny2 === void 0) return { kind: "ok", deny: [] };
  if (!Array.isArray(deny2) || !deny2.every((p) => typeof p === "string")) return { kind: "bad" };
  return { kind: "ok", deny: deny2 };
}
function readUserDeny(projectDir, agent) {
  const out = [];
  for (const file2 of denyFiles(projectDir, agent)) {
    const r = readOne(file2);
    if (r.kind === "bad") return null;
    if (r.kind === "ok") out.push(...r.deny);
  }
  return out;
}
function tokenize(glob, path5) {
  const toks = [];
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*" && path5 && glob[i + 1] === "*") {
      const dir = glob[i + "**".length] === "/";
      toks.push({ t: dir ? "globstarDir" : "globstar" });
      i += dir ? "**/".length : "**".length;
      continue;
    }
    if (c === "*") {
      if (toks.length === 0 || toks[toks.length - 1].t !== "star") toks.push({ t: "star" });
    } else if (c === "?") toks.push({ t: "any1" });
    else toks.push({ t: "lit", c });
    i++;
  }
  return toks;
}
function globMatch(glob, text, path5) {
  const toks = tokenize(glob, path5);
  const n = text.length;
  let next = new Uint8Array(n + 1);
  next[n] = 1;
  for (let i = toks.length - 1; i >= 0; i--) {
    const tok = toks[i];
    const cur = new Uint8Array(n + 1);
    let acc = 0;
    for (let j = n; j >= 0; j--) {
      const has3 = j < n;
      const ch = has3 ? text[j] : "";
      switch (tok.t) {
        case "lit":
          cur[j] = has3 && ch === tok.c ? next[j + 1] : 0;
          break;
        case "any1":
          cur[j] = has3 && !(path5 && ch === "/") ? next[j + 1] : 0;
          break;
        case "star":
          cur[j] = next[j] || (has3 && !(path5 && ch === "/") ? cur[j + 1] : 0);
          break;
        case "globstar":
          cur[j] = next[j] || (has3 ? cur[j + 1] : 0);
          break;
        case "globstarDir":
          if (has3 && ch === "/" && next[j + 1]) acc = 1;
          cur[j] = next[j] || acc;
          break;
      }
    }
    next = cur;
  }
  return next[0] === 1;
}
function parsePattern(pattern) {
  const open = pattern.indexOf("(");
  if (open < 1 || !pattern.endsWith(")")) return null;
  const glob = pattern.slice(open + 1, pattern.length - ")".length);
  return glob === "" ? null : { tool: pattern.slice(0, open), glob };
}
function matchCommand(glob, text) {
  if (!glob.endsWith(PREFIX_RULE)) return globMatch(glob, text, false);
  const head = glob.slice(0, glob.length - PREFIX_RULE.length);
  if (globMatch(head, text, false)) return true;
  for (let k = 0; k < text.length; k++) {
    if (WHITESPACE.includes(text[k]) && globMatch(head, text.slice(0, k), false)) return true;
  }
  return false;
}
var DRIVE_PREFIX = /^[A-Za-z]:(?=\/)/;
function toSlash(p) {
  return sep === "/" ? p : p.split(sep).join("/");
}
function matchPath(glob, absPath, projectDir) {
  if (glob.startsWith(PROJECT_ANCHOR)) {
    if (projectDir === void 0) return false;
    const rel = relative(projectDir, absPath);
    if (rel === "" || rel === PARENT || rel.startsWith(PARENT + sep) || isAbsolute(rel)) return false;
    return globMatch(glob.slice(PROJECT_ANCHOR.length), toSlash(rel), true);
  }
  const target = toSlash(absPath);
  if (glob.startsWith(ABS_ANCHOR)) {
    const g = toSlash(glob.slice(ABS_ANCHOR.length - "/".length));
    return globMatch(g, target, true) || globMatch(g, target.replace(DRIVE_PREFIX, ""), true);
  }
  if (glob.startsWith(HOME_ANCHOR)) {
    const home = homeDirOf(process.env);
    return home !== null && globMatch(toSlash(home) + glob.slice(HOME_ANCHOR.length - "/".length), target, true);
  }
  return globMatch(toSlash(glob), target, true);
}
function matchesAnyDenyPattern(text, patterns, subject = BASH_SUBJECT) {
  for (const pattern of patterns) {
    const p = parsePattern(pattern);
    if (p === null || p.tool !== subject.tool) continue;
    const hit = subject.tool === READ_TOOL ? matchPath(p.glob, text, subject.projectDir) : matchCommand(p.glob, text);
    if (hit) return pattern;
  }
  return null;
}

// src/prompt/_generated.ts
var INSTRUCTIONS = "context-mode keeps large output out of the conversation.\n\nWhen a step counts, sums, filters or finds something in over about 20 lines of data (logs, test or build output, big JSON or CSV, long files, web pages), use ctx_execute and print only the answer, not a raw Bash or Read result.\n\nA large tool result is indexed and cut to its best-matching parts; ctx_search finds the rest. A large file's Read is denied: use offset and limit, or ctx_execute with file set. Use normal tools for small output and edits.\n";
var TOOL_DESCRIPTIONS = Object.freeze({
  ctx_execute: "Runs code in a sandboxed subprocess in the project directory (shell, powershell, javascript, typescript, python, or another runtime on PATH); only what the code prints comes back. For a large file, set `file` to its local path: the code gets it in the CTX_FILE environment variable. Set `intent` when output may be large: the matching sections come back and the full output is indexed for ctx_search. `timeoutMs` defaults to and caps at 600000; then the whole process tree is killed.\n",
  ctx_batch: "Runs several shell commands, then answers several search queries over their combined output, in one call. Use it to collect facts from more than one command at once, for example test results plus recent commits, when you need specific answers rather than the full text. Returns the matching sections and a one-line footer.",
  ctx_index: "Stores content so it can be searched later: a local file or folder (nested .gitignore files are respected), raw text, or a URL, which is fetched and converted to Markdown. Use it for documentation or large files you will query more than once, then use ctx_search instead of reading the content again. Returns the source label and how many chunks were stored.",
  ctx_search: "Searches content stored with ctx_index and earlier sandbox output in this project. Pass several queries in one call. By default it searches the current worktree; set `scope` to `project` for all worktrees or `session` for this session only. Results from the current session rank first, then by relevance, ranked with measurably better recall than plain keyword search. Set `sort` to `timeline` for oldest-first order across this session, prior sessions and memory, paged with `after`; `offset` is for relevance order only. Set `source` to `decision` to search only rows where the user answered a question. Every hit names its source. When nothing matches, the reply states the scope and how many sources are indexed.",
  ctx_resume: "Returns a summary of up to 2 KB for this session: the last task and user request, files changed, open errors, and search terms for ctx_search. A large row is shown as a pointer line instead of its full text; call `ctx_resume(seq: N)` with that line's number to read the full row. Call it with no `seq` to get the state block on demand. Use it after the conversation was compacted or resumed, before you repeat earlier work.",
  ctx_stats: "Reports how many bytes context-mode kept out of the conversation in this session and in this project, per agent, as a Markdown table. Show the table to the user as it is. Use it when the user asks what context-mode saved.",
  ctx_doctor: "Checks this context-mode install and reports a table with one row per check: version, Node and node:sqlite, host config and hooks for this agent, MCP connection, project and worktree, database health, index contents, and hook timing. Each failed row names its cause and the fix in one line. It changes nothing. Use it when the user asks whether context-mode works, or after a context-mode error.",
  ctx_upgrade: "Updates context-mode to the latest release for this agent and rewrites only context-mode's own entries in the host config. User entries and user settings such as hook timeouts are kept, and old entries are erased. Returns a table of what changed and whether a restart is needed. Use it only when the user asks to update context-mode.",
  ctx_purge: "Deletes stored data: one session, one indexed source, or everything stored for this project. This cannot be undone. Use it only when the user asks to forget or reset data."
});
var READ_DENY_TEMPLATE = 'context-mode: {size}-byte file, over the one-read limit. Run ctx_execute(language, code, file="{path}") and print only the answer.';

// src/core/policy/read-deny.ts
var SIZE = "{size}";
var PATH = "{path}";
function READ_DENY_MESSAGE(path5, size, prefix = "") {
  return prefixToolNames(READ_DENY_TEMPLATE, prefix).split(SIZE).join(String(size)).split(PATH).join(path5);
}

// src/core/policy/decide.ts
var { statSync } = process.getBuiltinModule("node:fs");
var BASH = "Bash";
var READ = "Read";
var WEBFETCH = "WebFetch";
var CTX_EXECUTE = "ctx_execute";
var CTX_BATCH = "ctx_batch";
var SHELL_LANGUAGE = "shell";
var FLAG_ON = "1";
var OPT3 = "-";
var LONG_OPT3 = "--";
var OPT_VALUE2 = "=";
var HOST_SEP = ".";
var SED_RANGE_SEP = ",";
var SED_PRINT = "p";
var SED_SCRIPT_FLAGS = ["-e", "--expression"];
var COMMAND_STARTS = ";&|(`\n\r";
var ALLOW = Object.freeze({ kind: "allow" });
var deny = (reason) => ({ kind: "deny", reason });
var str = (v) => typeof v === "string" ? v : void 0;
var present = (v) => v !== void 0 && v !== null;
var has = (list3, v) => list3.includes(v);
function decide(ev, row5, userDeny) {
  const tool = ev.tool;
  if (tool === void 0) return ALLOW;
  const canonical = tool.canonicalName;
  const input = tool.input;
  let rules;
  if (userDeny === null) {
    if (process.env[REQUIRE_SECURITY_ENV] === FLAG_ON) return deny(prefixToolNames(POLICY_UNREADABLE_LINE, row5.toolNamePrefix));
    process.stderr.write(POLICY_UNREADABLE_WARNING + "\n");
    rules = [];
  } else rules = userDeny;
  const hit = userDenyHit(canonical, input, ev.cwd, rules);
  if (hit !== null) return deny(USER_DENY_REASON_PREFIX + hit);
  if (canonical === WEBFETCH) return webFetch(input, row5);
  if (canonical === BASH) return bash(ev, row5, input, rules);
  if (canonical === READ) return read(ev, row5, input);
  return ALLOW;
}
function denyMessage(kind, match, row5, intent) {
  const web = kind === "webfetch";
  const tool = web ? DENY_WEBFETCH_TOOLS.map((t) => row5.toolNamePrefix + t).join(DENY_WEBFETCH_JOIN) : row5.toolNamePrefix + DENY_EXEC_TOOL;
  const call = web ? JSON.stringify({ url: match }) : JSON.stringify({ language: SHELL_LANGUAGE, code: match, intent: intent ?? DENY_INTENT_DEFAULT });
  return [DENY_PREFIX + DENY_WHAT[kind] + DENY_WHAT_SUFFIX, DENY_RUN_HERE_LINE, DENY_TOOL_LABEL + tool, call].join("\n");
}
function readPath(input) {
  for (const k of READ_PATH_KEYS) {
    const p = str(input[k]);
    if (p !== void 0 && p !== "") return p;
  }
  return void 0;
}
function userDenyHit(canonical, input, cwd, rules) {
  if (rules.length === 0) return null;
  const readRule = (p) => matchesAnyDenyPattern(resolve(cwd, p), rules, { tool: READ, projectDir: cwd });
  if (canonical === BASH) {
    const cmd = str(input.command);
    return cmd === void 0 ? null : matchesAnyDenyPattern(cmd, rules);
  }
  if (canonical === READ) {
    const p = readPath(input);
    return p === void 0 ? null : readRule(p);
  }
  if (canonical === CTX_EXECUTE) {
    const file2 = str(input.file);
    const byFile = file2 === void 0 || file2 === "" ? null : readRule(file2);
    if (byFile !== null) return byFile;
    const code = str(input.code);
    return input.language === SHELL_LANGUAGE && code !== void 0 ? matchesAnyDenyPattern(code, rules) : null;
  }
  if (canonical === CTX_BATCH && Array.isArray(input.commands)) {
    for (const c of input.commands) {
      const h = typeof c === "string" ? matchesAnyDenyPattern(c, rules) : null;
      if (h !== null) return h;
    }
  }
  return null;
}
function segmentHit(c, rules) {
  if (rules.length === 0) return null;
  return matchesAnyDenyPattern([c.argv0, ...c.args].join(" "), rules) ?? matchesAnyDenyPattern(c.raw, rules);
}
function couldMatch(text, rules) {
  if (rules.length === 0) return false;
  for (let k = 0; k <= text.length; k++) {
    if (k > 0 && !COMMAND_STARTS.includes(text.charAt(k - 1))) continue;
    if (matchesAnyDenyPattern(text.slice(k).trimStart(), rules) !== null) return true;
  }
  return false;
}
function neverDenied(url2) {
  let host;
  try {
    host = new URL(url2).hostname.toLowerCase();
  } catch {
    return false;
  }
  return NEVER_DENY_HOSTS.some((h) => host === h || host.endsWith(HOST_SEP + h));
}
function webFetch(input, row5) {
  const url2 = str(input.url) ?? "";
  return neverDenied(url2) ? ALLOW : deny(denyMessage("webfetch", url2, row5));
}
function bash(ev, row5, input, rules) {
  const cmd = str(input.command) ?? "";
  const parsed = parseShell(cmd);
  if (!parsed.ok) return couldMatch(cmd, rules) ? deny(prefixToolNames(PARSE_ERROR_DENY_LINE, row5.toolNamePrefix)) : ALLOW;
  const cmds = unwrap(parsed.commands);
  for (const c of cmds) {
    const h = segmentHit(c, rules);
    if (h !== null) return deny(USER_DENY_REASON_PREFIX + h);
  }
  if (!hasReplace(row5) || isSubagentCall(ev)) {
    for (const c of cmds) {
      const kind = denyKind(c);
      if (kind !== null) return deny(denyMessage(kind, cmd, row5, str(input.description)));
    }
  }
  return shellDump(cmds, ev.cwd, row5) ?? ALLOW;
}
function denyKind(c) {
  const name = c.argv0.toLowerCase();
  if (has(CURL_COMMANDS, name) && bodyReachesOutput(name, c)) return "curl";
  if (inlineHttp(c.raw)) return "http";
  if (has(BUILD_COMMANDS, name)) return "build";
  return null;
}
function bodyReachesOutput(name, c) {
  if (c.redirectsToFile) return !quiet(name, c.args);
  return !c.endsInBoundedSink;
}
function quiet(name, args) {
  const flag = CURL_SILENT_FLAGS[name];
  let silent = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === LONG_OPT3) break;
    if (has(CURL_VERBOSE_FLAGS, a)) return false;
    if (a === CURL_DUMP_HEADER_FLAG && args[k + 1] === OPT3) return false;
    if (a === flag.long || a.startsWith(OPT3) && !a.startsWith(LONG_OPT3) && a.includes(flag.short, OPT3.length)) silent = true;
  }
  return silent;
}
function inlineHttp(raw) {
  const low = raw.toLowerCase();
  for (const call of INLINE_HTTP_CALLS) if (low.includes(call)) return true;
  for (let i = low.indexOf(FETCH_CALL); i >= 0; i = low.indexOf(FETCH_CALL, i + 1)) {
    const q = low.charAt(i + FETCH_CALL.length);
    if (q !== "" && FETCH_QUOTES.includes(q) && low.startsWith(HTTP_SCHEME, i + FETCH_CALL.length + q.length)) return true;
  }
  return false;
}
var CD_COMMAND = "cd";
function fileSize(abs) {
  try {
    const st = statSync(abs);
    return st.isFile() ? st.size : -1;
  } catch {
    return -1;
  }
}
function read(ev, row5, input) {
  if (!present(input.offset) && !present(input.limit)) {
    const p = readPath(input);
    if (p !== void 0) {
      const abs = resolve(ev.cwd, p);
      const size = fileSize(abs);
      if (size > OUTPUT_CAP) return deny(READ_DENY_MESSAGE(abs, size, row5.toolNamePrefix));
    }
  }
  return ALLOW;
}
function shellDump(cmds, cwd, row5) {
  if (row5.nativeTools.read !== void 0 && row5.nativeTools.read.length > 0 && dumpRunsThenReplaces(row5)) return null;
  let dir = cwd;
  let verdict = null;
  for (const c of cmds) {
    const name = c.argv0.toLowerCase();
    if (name === CD_COMMAND && c.args.length === 1 && c.insideConstruct === void 0) dir = resolve(dir, c.args[0]);
    if (c.redirectsToFile || c.endsInBoundedSink || c.pipesOut === true || c.insideConstruct !== void 0) continue;
    if (!has(SHELL_DUMP_COMMANDS, name)) continue;
    const d = dumpTarget(name, c.args);
    if (d === null) continue;
    if (d.bounded) {
      verdict = ALLOW;
      continue;
    }
    const abs = resolve(dir, d.file);
    const size = fileSize(abs);
    if (size > OUTPUT_CAP) return deny(READ_DENY_MESSAGE(abs, size, row5.toolNamePrefix));
  }
  return verdict;
}
var allDigits2 = (s) => s !== "" && [...s].every((ch) => ch >= "0" && ch <= "9");
function countFlag(a) {
  if (has(DUMP_COUNT_FLAGS, a)) return 1;
  for (const f of DUMP_COUNT_FLAGS) {
    if (f.startsWith(LONG_OPT3) ? a.startsWith(f + OPT_VALUE2) : a.startsWith(f)) return 0;
  }
  return a.startsWith(OPT3) && allDigits2(a.slice(OPT3.length)) ? 0 : -1;
}
function sedScript(script) {
  if (script === SED_PRINT) return "all";
  if (!script.endsWith(SED_PRINT)) return null;
  const body = script.slice(0, script.length - SED_PRINT.length);
  const comma = body.indexOf(SED_RANGE_SEP);
  const range = comma < 0 ? allDigits2(body) : allDigits2(body.slice(0, comma)) && allDigits2(body.slice(comma + SED_RANGE_SEP.length));
  return range ? "range" : null;
}
function dumpTarget(name, args) {
  const files = [];
  let bounded = false;
  let quietSed = false;
  let script;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (has(DUMP_COUNT_COMMANDS, name)) {
      const skip = countFlag(a);
      if (skip >= 0) {
        bounded = true;
        k += skip;
        continue;
      }
    }
    if (name === SED_COMMAND && has(SED_QUIET_FLAGS, a)) {
      quietSed = true;
      continue;
    }
    if (name === SED_COMMAND && has(SED_SCRIPT_FLAGS, a)) {
      script = args[k + 1];
      k++;
      continue;
    }
    if (a.startsWith(OPT3) && a !== OPT3) continue;
    files.push(a);
  }
  if (name === SED_COMMAND) {
    if (!quietSed) return null;
    if (script === void 0) script = files.shift();
    const kind = script === void 0 ? null : sedScript(script);
    if (kind === null) return null;
    bounded = kind === "range";
  }
  if (name === JQ_COMMAND) {
    if (files.shift() !== JQ_WHITELIST.identity) return null;
  }
  return files.length === 1 && files[0] !== OPT3 ? { file: files[0], bounded } : null;
}

// src/core/project/resolve.ts
import { basename, dirname as dirname2, join as join4, resolve as resolve2 } from "node:path";

// src/core/project/contain.ts
import { dirname, sep as sep2 } from "node:path";
var { realpathSync: realpathSync2 } = process.getBuiltinModule("node:fs");
function real(p) {
  try {
    return realpathSync2.native(p);
  } catch {
    return void 0;
  }
}
function components(p) {
  return p.split(sep2).filter((c) => c !== "");
}
function isInside(root, p) {
  const r = real(root);
  const q = real(p);
  if (r === void 0 || q === void 0) return false;
  const rc = components(r);
  const qc = components(q);
  if (qc.length < rc.length) return false;
  for (let i = 0; i < rc.length; i += 1) {
    if (rc[i] !== qc[i]) return false;
  }
  return true;
}
function commonRoot(paths) {
  const reals = paths.map(real).filter((r) => r !== void 0);
  if (reals.length === 0) throw new RangeError("commonRoot needs at least one existing path");
  const first = reals[0];
  let n = components(first).length;
  for (const r of reals) {
    const rc = components(r);
    const fc = components(first);
    let i = 0;
    while (i < n && i < rc.length && rc[i] === fc[i]) i += 1;
    n = i;
  }
  let q = first;
  while (components(q).length > n && dirname(q) !== q) q = dirname(q);
  return q;
}

// src/core/project/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var H0 = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
var rotr = (x, n) => x >>> n | x << 32 - n;
function sha256Hex(text) {
  const msg = Buffer.from(text, "utf8");
  const bitLen = msg.length * 8;
  const total = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = Buffer.alloc(total);
  msg.copy(buf);
  buf[msg.length] = 128;
  buf.writeUInt32BE(Math.floor(bitLen / 4294967296), total - 8);
  buf.writeUInt32BE(bitLen >>> 0, total - 4);
  const h = H0.slice();
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = buf.readUInt32BE(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i] >>> 0;
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

// src/core/project/resolve.ts
var { existsSync, readFileSync: readFileSync3, realpathSync: realpathSync3, statSync: statSync2 } = process.getBuiltinModule("node:fs");
function sourceOf(agent) {
  switch (agent) {
    case "claude-code":
      return "env:CLAUDE_PROJECT_DIR";
    case "codex":
    case "copilot-cli":
    case "kiro":
      return "arg:--agent+cwd";
    case "vscode":
      return "arg:workspaceFolder";
    case "gemini":
    case "qwen":
    case "zcode":
    case "opencode":
      return "spawn-cwd";
    case "pi":
      return "pi:ctx.cwd";
  }
}
function present2(v) {
  return v === void 0 || v === "" ? void 0 : v;
}
function dirOf(kind, src) {
  switch (kind) {
    case "env:CLAUDE_PROJECT_DIR":
      return present2(src.env.CLAUDE_PROJECT_DIR) ?? present2(src.cwd) ?? process.cwd();
    case "arg:--agent+cwd":
    case "spawn-cwd":
      return present2(src.cwd);
    case "arg:workspaceFolder": {
      const i = src.argv.indexOf(WORKSPACE_FOLDER_FLAG);
      return i < 0 ? void 0 : present2(src.argv[i + 1]);
    }
    case "pi:ctx.cwd":
      return present2(src.piCwd);
  }
}
function gitDirs(dir) {
  let cur;
  try {
    cur = realpathSync3.native(dir);
  } catch {
    throw new CtxError("NO_GIT_DIR", { path: dir });
  }
  const start = cur;
  for (; ; ) {
    const gitDir = gitDirAt(join4(cur, GIT_DIR_NAME));
    if (gitDir !== null) {
      const common = firstLine(join4(gitDir, GIT_COMMONDIR_FILE));
      return { commonDir: realpathSync3.native(common === null ? gitDir : resolve2(gitDir, common)), worktree: cur, start };
    }
    const up = dirname2(cur);
    if (up === cur) return { commonDir: null, start };
    cur = up;
  }
}
function gitDirAt(dotGit) {
  let gitDir;
  try {
    if (statSync2(dotGit).isDirectory()) {
      gitDir = dotGit;
    } else {
      const line = firstLine(dotGit);
      if (line === null || !line.startsWith(GITDIR_FILE_PREFIX)) return null;
      gitDir = resolve2(dirname2(dotGit), line.slice(GITDIR_FILE_PREFIX.length));
    }
  } catch {
    return null;
  }
  return existsSync(join4(gitDir, GIT_HEAD_FILE)) ? gitDir : null;
}
function firstLine(file2) {
  let text;
  try {
    text = readFileSync3(file2, "utf8");
  } catch {
    return null;
  }
  const nl = text.indexOf("\n");
  const line = (nl < 0 ? text : text.slice(0, nl)).trim();
  return line === "" ? null : line;
}
function git(dir, args) {
  const { spawnSync } = process.getBuiltinModule("node:child_process");
  const r = spawnSync("git", args, { cwd: dir, shell: false, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  if (r.error !== void 0 || r.status !== 0) throw new CtxError("NO_GIT_DIR", { path: dir });
  return r.stdout.split("\n").filter((l) => l !== "");
}
function containmentRootOf(dir, commonDir) {
  const repoDir = basename(commonDir) === GIT_DIR_NAME ? dirname2(commonDir) : commonDir;
  const worktrees = git(dir, ["worktree", "list", "--porcelain"]).filter((l) => l.startsWith(GIT_WORKTREE_LINE_PREFIX)).map((l) => l.slice(GIT_WORKTREE_LINE_PREFIX.length));
  return commonRoot([dirname2(repoDir), ...worktrees]);
}
function resolveProject(agent, src) {
  const source = sourceOf(agent);
  const dir = dirOf(source, src);
  if (dir === void 0) throw new CtxError("NO_PROJECT", { kind: source });
  const repo = gitDirs(dir);
  const plain = repo.commonDir === null ? repo.start : void 0;
  const commonDir = repo.commonDir ?? repo.start;
  const worktree = repo.commonDir === null ? repo.start : repo.worktree;
  let key;
  let pdir;
  let root;
  return {
    get projectKey() {
      key ??= sha256Hex(commonDir).slice(0, PROJECT_KEY_HEX_LEN);
      return key;
    },
    get projectDir() {
      pdir ??= join4(resolveConfigDir(process.env), PROJECTS_DIR_NAME, this.projectKey);
      return pdir;
    },
    get dbPath() {
      return join4(this.projectDir, DB_FILE_NAME);
    },
    worktree,
    get containmentRoot() {
      root ??= plain ?? containmentRootOf(dir, commonDir);
      return root;
    },
    agent,
    source
  };
}

// src/core/store/schema.ts
var SCHEMA_VERSION2 = SCHEMA_VERSION;
var PRAGMAS = `
PRAGMA busy_timeout = ${DB_TIMEOUT_MS};
PRAGMA journal_mode = WAL;
`;
var FTS_TOKENIZE = "tokenize = 'porter unicode61 remove_diacritics 2'";
var FTS_TOKENIZE_V1 = "tokenize = 'unicode61 remove_diacritics 2'";
var DDL = `
CREATE TABLE IF NOT EXISTS events (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT NOT NULL,
  worktree       TEXT NOT NULL,
  agent          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('prompt','edit','cmd','toolerr','index','cost','decision')),
  tool           TEXT,
  key            TEXT,
  path           TEXT,
  ok             INTEGER,
  exit_code      INTEGER,
  bytes          INTEGER,
  body           TEXT,
  turn           INTEGER NOT NULL,
  sandbox_bytes  INTEGER NOT NULL DEFAULT 0,
  returned_bytes INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  accessed_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session_kind_seq ON events(session_id, kind, seq);
CREATE INDEX IF NOT EXISTS idx_events_session_kind_key_seq ON events(session_id, kind, key, seq);

CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  worktree    TEXT NOT NULL,
  agent       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('path','content','url')),
  label       TEXT NOT NULL,
  bytes_total INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_ts  INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  accessed_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_accessed ON sources(accessed_ts);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  source_id UNINDEXED,
  session_id UNINDEXED,
  worktree UNINDEXED,
  agent UNINDEXED,
  ord UNINDEXED,
  body,
  ${FTS_TOKENIZE_V1}
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
var DDL_V2 = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_cost_session_turn ON events(session_id, turn) WHERE kind = 'cost';
`;
var DDL_V3 = `
CREATE VIRTUAL TABLE chunks_v3 USING fts5(
  source_id UNINDEXED,
  session_id UNINDEXED,
  worktree UNINDEXED,
  agent UNINDEXED,
  ord UNINDEXED,
  body,
  title,
  ${FTS_TOKENIZE}
);
INSERT INTO chunks_v3(rowid, source_id, session_id, worktree, agent, ord, body, title)
  SELECT rowid, source_id, session_id, worktree, agent, ord, body, '' FROM chunks;
DROP TABLE chunks;
ALTER TABLE chunks_v3 RENAME TO chunks;
`;
var DDL_V4 = `
CREATE VIRTUAL TABLE chunks_tri USING fts5(
  body,
  title,
  tokenize = 'trigram',
  content = ''
);
INSERT INTO chunks_tri(rowid, body, title) SELECT rowid, body, title FROM chunks;
CREATE VIRTUAL TABLE chunks_vocab USING fts5vocab(chunks, 'row');
`;
var DDL_V5 = `
CREATE VIRTUAL TABLE line_units USING fts5(
  body,
  source_id UNINDEXED,
  session_id UNINDEXED,
  ord UNINDEXED,
  ${FTS_TOKENIZE}
);
`;
var MIGRATIONS = [
  { version: 1, sql: DDL },
  { version: 2, sql: DDL_V2 },
  { version: 3, sql: DDL_V3 },
  { version: 4, sql: DDL_V4 },
  { version: 5, sql: DDL_V5 }
];
function applyMigrations(db, fromVersion) {
  if (fromVersion === SCHEMA_VERSION2) return;
  if (fromVersion > SCHEMA_VERSION2) {
    throw new CtxError("SCHEMA_STALE", { found: fromVersion, want: SCHEMA_VERSION2 });
  }
  db.exec(PRAGMAS);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const step of MIGRATIONS) {
      if (step.version > fromVersion) db.exec(step.sql);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION2}`);
    db.exec("COMMIT");
  } catch (err) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw err;
  }
}

// src/core/store/db.ts
var { existsSync: existsSync2, linkSync, mkdirSync: mkdirSync2, rmSync } = process.getBuiltinModule("node:fs");
function versionParts(v) {
  const bare2 = v.startsWith("v") ? v.slice(1) : v;
  return bare2.split(".").map((p) => Number.parseInt(p, 10));
}
function isBelow(found, min) {
  const a = versionParts(found);
  const b = versionParts(min);
  for (let i = 0; i < b.length; i += 1) {
    const x = a[i] ?? 0;
    if (x !== b[i]) return x < b[i];
  }
  return false;
}
function isCorrupt(err) {
  if (typeof err !== "object" || err === null) return false;
  const code = err.errcode;
  if (typeof code !== "number") return false;
  const primary = code & SQLITE_PRIMARY_CODE_MASK;
  return primary === SQLITE_CORRUPT_CODE || primary === SQLITE_NOTADB_CODE;
}
async function loadSqlite() {
  try {
    return await import("node:sqlite");
  } catch {
    throw new CtxError("NO_SQLITE");
  }
}
function readUserVersion(raw) {
  const row5 = raw.prepare("PRAGMA user_version").get();
  return row5.user_version;
}
function createAtomically(sqlite, path5) {
  const { randomUUID } = process.getBuiltinModule("node:crypto");
  const tmp = path5 + "." + randomUUID() + DB_TMP_SUFFIX;
  try {
    const raw = new sqlite.DatabaseSync(tmp, { timeout: DB_TIMEOUT_MS });
    try {
      applyMigrations(raw, readUserVersion(raw));
    } finally {
      raw.close();
    }
    try {
      linkSync(tmp, path5);
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  } finally {
    for (const suffix of ["", DB_WAL_SUFFIX, DB_SHM_SUFFIX]) rmSync(tmp + suffix, { force: true });
  }
}
function openWritable(sqlite, path5) {
  let raw = null;
  try {
    if (!existsSync2(path5)) createAtomically(sqlite, path5);
    raw = new sqlite.DatabaseSync(path5, { timeout: DB_TIMEOUT_MS });
    applyMigrations(raw, readUserVersion(raw));
    return raw;
  } catch (err) {
    if (raw) raw.close();
    throw err;
  }
}
function openReadOnly(sqlite, path5) {
  const raw = new sqlite.DatabaseSync(path5, { timeout: DB_TIMEOUT_MS, readOnly: true });
  try {
    const found = readUserVersion(raw);
    if (found !== SCHEMA_VERSION) throw new CtxError("SCHEMA_STALE", { found, want: SCHEMA_VERSION });
    return raw;
  } catch (err) {
    raw.close();
    throw err;
  }
}
async function openDb(project, opts) {
  if (isBelow(process.version, NODE_MIN)) throw new CtxError("NODE_TOO_OLD", { v: process.version });
  const sqlite = await loadSqlite();
  mkdirSync2(project.projectDir, { recursive: true });
  const path5 = project.dbPath;
  const sibling = existsSync2(path5 + DB_WAL_SUFFIX) || existsSync2(path5 + DB_SHM_SUFFIX);
  if (sibling && !existsSync2(path5)) {
    throw new CtxError("DB_GONE");
  }
  try {
    let raw;
    if (opts?.readOnly === true) {
      if (!existsSync2(path5)) openWritable(sqlite, path5).close();
      raw = openReadOnly(sqlite, path5);
    } else {
      raw = openWritable(sqlite, path5);
    }
    return { raw, projectKey: project.projectKey, path: path5, ...opts?.readOnly === true ? { readOnly: true } : {} };
  } catch (err) {
    if (isCorrupt(err)) throw new CtxError("DB_CORRUPT");
    throw err;
  }
}
function withWrite(db, fn) {
  db.raw.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(db);
    db.raw.exec("COMMIT");
    return result;
  } catch (err) {
    if (db.raw.isTransaction) db.raw.exec("ROLLBACK");
    throw err;
  }
}
function closeDb(db) {
  if (db.readOnly !== true) {
    try {
      db.raw.exec("PRAGMA wal_checkpoint(PASSIVE)");
    } catch {
    }
  }
  try {
    db.raw.close();
  } catch {
  }
}
function inWrite(db, fn) {
  return db.raw.isTransaction ? fn(db) : withWrite(db, fn);
}
function metaGet(db, key) {
  const row5 = db.raw.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row5 === void 0 ? null : row5.value;
}
function metaSet(db, key, v) {
  inWrite(db, (h) => {
    h.raw.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, v);
  });
}
function metaTake(db, key) {
  return inWrite(db, (h) => {
    const row5 = h.raw.prepare("DELETE FROM meta WHERE key = ? RETURNING value").get(key);
    return row5 === void 0 ? null : row5.value;
  });
}

// src/core/journal/append.ts
var COLUMNS = "events(session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn, sandbox_bytes, returned_bytes, created_at, accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
var INSERT_SQL = "INSERT INTO " + COLUMNS;
var INSERT_COST_SQL = "INSERT OR IGNORE INTO " + COLUMNS;
var COST_SEQ_SQL = "SELECT seq FROM events WHERE kind = 'cost' AND session_id = ? AND turn = ?";
function appendEvent(db, row5) {
  return withWrite(db, (h) => {
    const now = Date.now();
    const isCost = row5.kind === "cost";
    const res = h.raw.prepare(isCost ? INSERT_COST_SQL : INSERT_SQL).run(
      row5.session_id,
      row5.worktree,
      row5.agent,
      row5.kind,
      row5.tool,
      row5.key,
      row5.path,
      row5.ok,
      row5.exit_code,
      row5.bytes,
      row5.body,
      row5.turn,
      row5.sandbox_bytes,
      row5.returned_bytes,
      now,
      now
    );
    if (res.changes === 1) return Number(res.lastInsertRowid);
    const kept = h.raw.prepare(COST_SEQ_SQL).get(row5.session_id, row5.turn);
    return kept.seq;
  });
}
function canonicalKey(tool, code) {
  let out = "";
  let quote = "";
  let escaped = false;
  let gap = false;
  for (const ch of code) {
    if (quote === "" && !escaped && ch.trim() === "") {
      gap = out !== "";
      continue;
    }
    if (gap) {
      out += " ";
      gap = false;
    }
    out += ch;
    if (escaped) {
      escaped = false;
    } else if (ch === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote === "" && (ch === "'" || ch === '"')) {
      quote = ch;
    } else if (ch === quote) {
      quote = "";
    }
  }
  return tool + ":" + out;
}
function ownCallRow(project, ctx, name, reply4) {
  const facts = reply4.journal;
  return {
    session_id: ctx.sessionId,
    worktree: project.worktree,
    agent: project.agent,
    kind: reply4.isError ? "toolerr" : facts?.kind ?? "cmd",
    // an error is toolerr, as the hook writes it
    tool: name,
    key: facts?.key ?? null,
    path: facts?.path ?? null,
    ok: reply4.isError ? 0 : 1,
    exit_code: facts?.exit_code ?? null,
    bytes: reply4.sandboxBytes,
    body: reply4.text,
    turn: ctx.turn,
    sandbox_bytes: reply4.sandboxBytes,
    returned_bytes: Buffer.byteLength(reply4.text, "utf8")
  };
}

// src/core/journal/read.ts
function readSessionEvents(db, sessionId, kind) {
  if (sessionId === "") return [];
  if (kind === void 0) {
    return db.raw.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC").all(sessionId);
  }
  return db.raw.prepare("SELECT * FROM events WHERE session_id = ? AND kind = ? ORDER BY seq ASC").all(sessionId, kind);
}
function readEventBySeq(db, seq) {
  const row5 = db.raw.prepare("SELECT * FROM events WHERE seq = ?").get(seq);
  return row5 === void 0 ? null : row5;
}
function readLastPrompt(db, sessionId) {
  if (sessionId === "") return "";
  const row5 = db.raw.prepare("SELECT body FROM events WHERE session_id = ? AND kind = 'prompt' ORDER BY seq DESC LIMIT 1").get(sessionId);
  return row5 === void 0 ? "" : row5.body;
}
function readFirstPrompt(db, sessionId) {
  if (sessionId === "") return "";
  const row5 = db.raw.prepare("SELECT body FROM events WHERE session_id = ? AND kind = 'prompt' ORDER BY seq ASC LIMIT 1").get(sessionId);
  return row5 === void 0 ? "" : row5.body;
}
function readRecallRows(db, sessionId, worktree, limit) {
  if (sessionId === "") return [];
  return db.raw.prepare("SELECT * FROM events WHERE kind <> 'cost' AND (session_id = ? OR worktree = ?) ORDER BY seq DESC LIMIT ?").all(sessionId, worktree, limit);
}
function hasAgentRows(db, worktree, agent) {
  return db.raw.prepare("SELECT 1 FROM events WHERE worktree = ? AND agent = ? LIMIT 1").get(worktree, agent) !== void 0;
}
function hasSessionRows(db, sessionId) {
  return db.raw.prepare("SELECT 1 FROM events WHERE session_id = ? LIMIT 1").get(sessionId) !== void 0;
}

// src/core/store/snippet.ts
var K1 = 1.2;
var B = 0.75;
var MAX_POSITIONS = 4096;
function isAlnum(c) {
  return c >= 48 && c <= 57 || c >= 97 && c <= 122 || c >= 65 && c <= 90 || c > 127;
}
function isUpper(c) {
  return c >= 65 && c <= 90;
}
function isLowerOrDigit(c) {
  return c >= 97 && c <= 122 || c >= 48 && c <= 57;
}
function identParts(w) {
  const parts = [];
  let cur = "";
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i);
    if (!isAlnum(c)) {
      if (cur !== "") parts.push(cur);
      cur = "";
      continue;
    }
    if (cur !== "" && isUpper(c) && isLowerOrDigit(w.charCodeAt(i - 1))) {
      parts.push(cur);
      cur = "";
    }
    cur += w[i];
  }
  if (cur !== "") parts.push(cur);
  return parts;
}
function snippetTerms(words) {
  const out = /* @__PURE__ */ new Map();
  const add = (text, weight, symbol2) => {
    if (text === "") return;
    const prev = out.get(text);
    if (!prev || prev.weight < weight) out.set(text, { text, weight, symbol: symbol2 });
  };
  for (const raw of words) {
    let a = 0;
    let b = raw.length;
    while (a < b && !isAlnum(raw.charCodeAt(a))) a++;
    while (b > a && !isAlnum(raw.charCodeAt(b - 1))) b--;
    const w = raw.slice(a, b);
    if (w === "") continue;
    const parts = identParts(w);
    if (parts.length > 1) {
      add(w.toLowerCase(), 2, true);
      for (const p of parts) if (p.length >= 2) add(p.toLowerCase(), 1, false);
    } else {
      add(w.toLowerCase(), 1, false);
    }
  }
  return [...out.values()];
}
function byteLen(s) {
  return Buffer.byteLength(s, "utf8");
}
function buildSnippet(row5, given, maxBytes, codeMaxBytes = SNIPPET_CODE_MAX_BYTES) {
  if (row5 === "") return "";
  const codeCap = Math.max(maxBytes, codeMaxBytes);
  const ls = [];
  const le = [];
  for (let p = 0; ; ) {
    const n = row5.indexOf("\n", p);
    ls.push(p);
    if (n < 0) {
      le.push(row5.length);
      break;
    }
    le.push(n);
    p = n + 1;
  }
  const L = ls.length;
  const lb = new Array(L);
  const cb = new Array(L);
  let acc = 0;
  for (let i = 0; i < L; i++) {
    cb[i] = acc;
    lb[i] = L === 1 ? byteLen(row5) : byteLen(row5.slice(ls[i], le[i]));
    acc += lb[i] + 1;
  }
  const rangeBytes = (i, j) => cb[j] + lb[j] - cb[i];
  const slice = (i, j) => row5.slice(ls[i], le[j]);
  const fenceOf2 = (i) => {
    let p = ls[i];
    const end = Math.min(le[i], p + 3);
    while (p < end && row5.charCodeAt(p) === 32) p++;
    const c = row5.charCodeAt(p);
    if (c !== 96 && c !== 126 || row5.charCodeAt(p + 1) !== c || row5.charCodeAt(p + 2) !== c || p + 2 >= le[i]) return "";
    return row5.slice(p, p + 3);
  };
  const blank = (i) => {
    for (let p = ls[i]; p < le[i]; p++) {
      const c = row5.charCodeAt(p);
      if (c !== 32 && c !== 9 && c !== 13) return false;
    }
    return true;
  };
  const blocks = [];
  const fenceClose = /* @__PURE__ */ new Map();
  for (let i = 0; i < L; ) {
    const f = fenceOf2(i);
    if (f !== "") {
      let j2 = i + 1;
      while (j2 < L && fenceOf2(j2) !== f) j2++;
      const closed = j2 < L;
      fenceClose.set(blocks.length, closed ? j2 : -1);
      blocks.push({ first: i, last: closed ? j2 : L - 1, code: true });
      i = (closed ? j2 : L - 1) + 1;
      continue;
    }
    if (blank(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < L && !blank(j + 1) && fenceOf2(j + 1) === "") j++;
    blocks.push({ first: i, last: j, code: false });
    i = j + 1;
  }
  if (blocks.length === 0) return clipLine(row5, 0, row5.length, -1, maxBytes);
  const lower = row5.toLowerCase();
  const hay = lower.length === row5.length ? lower : row5;
  const find = (t) => {
    const out = [];
    if (t.text === "") return out;
    for (let p = hay.indexOf(t.text); p >= 0 && out.length < MAX_POSITIONS; p = hay.indexOf(t.text, p + 1)) {
      const prev = p === 0 ? 32 : row5.charCodeAt(p - 1);
      if (!isAlnum(prev) || isLowerOrDigit(prev) && isUpper(row5.charCodeAt(p))) out.push(p);
    }
    return out;
  };
  let terms = given;
  let pos = terms.map(find);
  if (pos.every((p) => p.length === 0)) {
    terms = given.filter((t) => t.text.length >= 5).map((t) => ({ ...t, text: t.text.slice(0, Math.max(4, t.text.length - 2)) }));
    pos = terms.map(find);
  }
  const count = (ti, a, b) => {
    const ps = pos[ti];
    let lo = 0, hi = ps.length;
    while (lo < hi) {
      const m = lo + hi >> 1;
      if (ps[m] < a) lo = m + 1;
      else hi = m;
    }
    let n = 0;
    for (let k = lo; k < ps.length && ps[k] < b; k++) n++;
    return n;
  };
  const N = blocks.length;
  const blen = blocks.map((bk2) => rangeBytes(bk2.first, bk2.last));
  const avg = blen.reduce((a, b) => a + b, 0) / N || 1;
  const tf = blocks.map((bk2) => terms.map((_, ti) => count(ti, ls[bk2.first], le[bk2.last])));
  const idf = terms.map((_, ti) => {
    let df = 0;
    for (let k = 0; k < N; k++) if (tf[k][ti] > 0) df++;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });
  const weight = (ti, code) => terms[ti].weight * (terms[ti].symbol && code ? 2 : 1) * idf[ti];
  const scores = blocks.map((bk2, k) => {
    let s = 0;
    const norm2 = K1 * (1 - B + B * blen[k] / avg);
    terms.forEach((_, ti) => {
      const f = tf[k][ti];
      if (f > 0) s += weight(ti, bk2.code) * f * (K1 + 1) / (f + norm2);
    });
    return s;
  });
  let best = 0;
  for (let k = 1; k < N; k++) if (scores[k] > scores[best]) best = k;
  const bk = blocks[best];
  const lineScore = (i) => {
    let s = 0;
    terms.forEach((_, ti) => {
      if (count(ti, ls[i], le[i]) > 0) s += weight(ti, bk.code);
    });
    return s;
  };
  const firstHit = (i) => {
    let at2 = -1;
    let w = -1;
    terms.forEach((_, ti) => {
      const c = count(ti, ls[i], le[i]);
      if (c === 0 || weight(ti, bk.code) <= w) return;
      const ps = pos[ti];
      let lo = 0, hi = ps.length;
      while (lo < hi) {
        const m = lo + hi >> 1;
        if (ps[m] < ls[i]) lo = m + 1;
        else hi = m;
      }
      at2 = ps[lo];
      w = weight(ti, bk.code);
    });
    return at2;
  };
  const lineWindow = (a, b, budget) => {
    let anchor2 = a;
    let top2 = -1;
    for (let i2 = a; i2 <= b; i2++) {
      const s = lineScore(i2);
      if (s > top2) {
        top2 = s;
        anchor2 = i2;
      }
    }
    if (lb[anchor2] > budget) return null;
    let i = anchor2, j = anchor2;
    for (; ; ) {
      const up = i > a && rangeBytes(i - 1, j) <= budget;
      const down = j < b && rangeBytes(i, j + 1) <= budget;
      if (!up && !down) break;
      if (up && down) {
        if (lineScore(i - 1) > lineScore(j + 1)) i--;
        else j++;
      } else if (up) i--;
      else j++;
    }
    return [i, j];
  };
  if (bk.code) {
    if (blen[best] <= codeCap) return grow(best);
    const close = fenceClose.get(best) ?? -1;
    const open = bk.first;
    const innerA = open + 1;
    const innerB = close >= 0 ? close - 1 : bk.last;
    const total = innerB - innerA + 1;
    const openText = slice(open, open);
    const closeText = close >= 0 ? slice(close, close) : fenceOf2(open);
    const markerMax = byteLen(`
[lines ${total}-${total} of ${total}]`);
    const budget = codeCap - lb[open] - 1 - 1 - byteLen(closeText) - markerMax;
    if (total <= 0) return clipLine(row5, ls[open], le[bk.last], -1, codeCap);
    const win2 = lineWindow(innerA, innerB, budget);
    if (win2 === null) {
      let anchor2 = innerA, top2 = -1;
      for (let i2 = innerA; i2 <= innerB; i2++) {
        const s = lineScore(i2);
        if (s > top2) {
          top2 = s;
          anchor2 = i2;
        }
      }
      const body = clipLine(row5, ls[anchor2], le[anchor2], firstHit(anchor2), Math.max(0, budget));
      const n = anchor2 - innerA + 1;
      return `${openText}
${body}
${closeText}
[lines ${n}-${n} of ${total}]`;
    }
    const [i, j] = win2;
    return `${openText}
${slice(i, j)}
${closeText}
[lines ${i - innerA + 1}-${j - innerA + 1} of ${total}]`;
  }
  if (blen[best] <= maxBytes) return grow(best);
  const win = lineWindow(bk.first, bk.last, maxBytes);
  if (win !== null) return slice(win[0], win[1]);
  let anchor = bk.first, top = -1;
  for (let i = bk.first; i <= bk.last; i++) {
    const s = lineScore(i);
    if (s > top) {
      top = s;
      anchor = i;
    }
  }
  return clipLine(row5, ls[anchor], le[anchor], firstHit(anchor), maxBytes);
  function grow(k) {
    let a = k, b = k;
    let code = blocks[k].code;
    const fits = (i, j, c) => rangeBytes(blocks[i].first, blocks[j].last) <= (c ? codeCap : maxBytes);
    for (; ; ) {
      const up = a > 0 && fits(a - 1, b, code || blocks[a - 1].code);
      const down = b < N - 1 && fits(a, b + 1, code || blocks[b + 1].code);
      if (!up && !down) break;
      if (up && down) {
        if (scores[a - 1] > scores[b + 1]) a--;
        else b++;
      } else if (up) a--;
      else b++;
      code = code || blocks[a].code || blocks[b].code;
    }
    return slice(blocks[a].first, blocks[b].last);
  }
}
function clipLine(row5, s, e, hit, budget) {
  if (budget <= 0) return "";
  let start = s;
  if (hit > s) {
    start = Math.max(s, hit - (budget >> 2));
    if (start > s) {
      const sp = row5.indexOf(" ", start);
      start = sp >= 0 && sp < hit ? sp + 1 : start;
    }
  }
  const cu = row5.charCodeAt(start);
  if (start > s && cu >= 56320 && cu <= 57343) start++;
  let used = 0;
  let end = start;
  while (end < e) {
    const c = row5.charCodeAt(end);
    const pair = c >= 55296 && c <= 56319 && end + 1 < e;
    const n = c < 128 ? 1 : c < 2048 ? 2 : pair ? 4 : 3;
    if (used + n > budget) break;
    used += n;
    end += pair ? 2 : 1;
  }
  if (end < e) {
    const sp = row5.lastIndexOf(" ", end - 1);
    if (sp > start && sp - start >= end - start >> 1) end = sp;
  }
  return row5.slice(start, end);
}

// src/core/store/words.ts
var WORD_RANGES = Object.freeze([
  170,
  170,
  178,
  179,
  181,
  181,
  185,
  186,
  188,
  190,
  192,
  214,
  216,
  246,
  248,
  705,
  710,
  721,
  736,
  740,
  748,
  748,
  750,
  750,
  880,
  884,
  886,
  887,
  890,
  893,
  895,
  895,
  902,
  902,
  904,
  906,
  908,
  908,
  910,
  929,
  931,
  1013,
  1015,
  1153,
  1162,
  1327,
  1329,
  1366,
  1369,
  1369,
  1376,
  1416,
  1488,
  1514,
  1519,
  1522,
  1568,
  1610,
  1632,
  1641,
  1646,
  1647,
  1649,
  1747,
  1749,
  1749,
  1765,
  1766,
  1774,
  1788,
  1791,
  1791,
  1808,
  1808,
  1810,
  1839,
  1869,
  1957,
  1969,
  1969,
  1984,
  2026,
  2036,
  2037,
  2042,
  2042,
  2048,
  2069,
  2074,
  2074,
  2084,
  2084,
  2088,
  2088,
  2112,
  2136,
  2144,
  2154,
  2160,
  2183,
  2185,
  2191,
  2208,
  2249,
  2308,
  2361,
  2365,
  2365,
  2384,
  2384,
  2392,
  2401,
  2406,
  2415,
  2417,
  2432,
  2437,
  2444,
  2447,
  2448,
  2451,
  2472,
  2474,
  2480,
  2482,
  2482,
  2486,
  2489,
  2493,
  2493,
  2510,
  2510,
  2524,
  2525,
  2527,
  2529,
  2534,
  2545,
  2548,
  2553,
  2556,
  2556,
  2565,
  2570,
  2575,
  2576,
  2579,
  2600,
  2602,
  2608,
  2610,
  2611,
  2613,
  2614,
  2616,
  2617,
  2649,
  2652,
  2654,
  2654,
  2662,
  2671,
  2674,
  2676,
  2693,
  2701,
  2703,
  2705,
  2707,
  2728,
  2730,
  2736,
  2738,
  2739,
  2741,
  2745,
  2749,
  2749,
  2768,
  2768,
  2784,
  2785,
  2790,
  2799,
  2809,
  2809,
  2821,
  2828,
  2831,
  2832,
  2835,
  2856,
  2858,
  2864,
  2866,
  2867,
  2869,
  2873,
  2877,
  2877,
  2908,
  2909,
  2911,
  2913,
  2918,
  2927,
  2929,
  2935,
  2947,
  2947,
  2949,
  2954,
  2958,
  2960,
  2962,
  2965,
  2969,
  2970,
  2972,
  2972,
  2974,
  2975,
  2979,
  2980,
  2984,
  2986,
  2990,
  3001,
  3024,
  3024,
  3046,
  3058,
  3077,
  3084,
  3086,
  3088,
  3090,
  3112,
  3114,
  3129,
  3133,
  3133,
  3160,
  3162,
  3164,
  3165,
  3168,
  3169,
  3174,
  3183,
  3192,
  3198,
  3200,
  3200,
  3205,
  3212,
  3214,
  3216,
  3218,
  3240,
  3242,
  3251,
  3253,
  3257,
  3261,
  3261,
  3292,
  3294,
  3296,
  3297,
  3302,
  3311,
  3313,
  3314,
  3332,
  3340,
  3342,
  3344,
  3346,
  3386,
  3389,
  3389,
  3406,
  3406,
  3412,
  3414,
  3416,
  3425,
  3430,
  3448,
  3450,
  3455,
  3461,
  3478,
  3482,
  3505,
  3507,
  3515,
  3517,
  3517,
  3520,
  3526,
  3558,
  3567,
  3585,
  3632,
  3634,
  3635,
  3648,
  3654,
  3664,
  3673,
  3713,
  3714,
  3716,
  3716,
  3718,
  3722,
  3724,
  3747,
  3749,
  3749,
  3751,
  3760,
  3762,
  3763,
  3773,
  3773,
  3776,
  3780,
  3782,
  3782,
  3792,
  3801,
  3804,
  3807,
  3840,
  3840,
  3872,
  3891,
  3904,
  3911,
  3913,
  3948,
  3976,
  3980,
  4096,
  4138,
  4159,
  4169,
  4176,
  4181,
  4186,
  4189,
  4193,
  4193,
  4197,
  4198,
  4206,
  4208,
  4213,
  4225,
  4238,
  4238,
  4240,
  4249,
  4256,
  4293,
  4295,
  4295,
  4301,
  4301,
  4304,
  4346,
  4348,
  4680,
  4682,
  4685,
  4688,
  4694,
  4696,
  4696,
  4698,
  4701,
  4704,
  4744,
  4746,
  4749,
  4752,
  4784,
  4786,
  4789,
  4792,
  4798,
  4800,
  4800,
  4802,
  4805,
  4808,
  4822,
  4824,
  4880,
  4882,
  4885,
  4888,
  4954,
  4969,
  4988,
  4992,
  5007,
  5024,
  5109,
  5112,
  5117,
  5121,
  5740,
  5743,
  5759,
  5761,
  5786,
  5792,
  5866,
  5870,
  5880,
  5888,
  5905,
  5919,
  5937,
  5952,
  5969,
  5984,
  5996,
  5998,
  6e3,
  6016,
  6067,
  6103,
  6103,
  6108,
  6108,
  6112,
  6121,
  6128,
  6137,
  6160,
  6169,
  6176,
  6264,
  6272,
  6276,
  6279,
  6312,
  6314,
  6314,
  6320,
  6389,
  6400,
  6430,
  6470,
  6509,
  6512,
  6516,
  6528,
  6571,
  6576,
  6601,
  6608,
  6618,
  6656,
  6678,
  6688,
  6740,
  6784,
  6793,
  6800,
  6809,
  6823,
  6823,
  6917,
  6963,
  6981,
  6988,
  6992,
  7001,
  7043,
  7072,
  7086,
  7141,
  7168,
  7203,
  7232,
  7241,
  7245,
  7293,
  7296,
  7306,
  7312,
  7354,
  7357,
  7359,
  7401,
  7404,
  7406,
  7411,
  7413,
  7414,
  7418,
  7418,
  7424,
  7615,
  7680,
  7957,
  7960,
  7965,
  7968,
  8005,
  8008,
  8013,
  8016,
  8023,
  8025,
  8025,
  8027,
  8027,
  8029,
  8029,
  8031,
  8061,
  8064,
  8116,
  8118,
  8124,
  8126,
  8126,
  8130,
  8132,
  8134,
  8140,
  8144,
  8147,
  8150,
  8155,
  8160,
  8172,
  8178,
  8180,
  8182,
  8188,
  8304,
  8305,
  8308,
  8313,
  8319,
  8329,
  8336,
  8348,
  8450,
  8450,
  8455,
  8455,
  8458,
  8467,
  8469,
  8469,
  8473,
  8477,
  8484,
  8484,
  8486,
  8486,
  8488,
  8488,
  8490,
  8493,
  8495,
  8505,
  8508,
  8511,
  8517,
  8521,
  8526,
  8526,
  8528,
  8585,
  9312,
  9371,
  9450,
  9471,
  10102,
  10131,
  11264,
  11492,
  11499,
  11502,
  11506,
  11507,
  11517,
  11517,
  11520,
  11557,
  11559,
  11559,
  11565,
  11565,
  11568,
  11623,
  11631,
  11631,
  11648,
  11670,
  11680,
  11686,
  11688,
  11694,
  11696,
  11702,
  11704,
  11710,
  11712,
  11718,
  11720,
  11726,
  11728,
  11734,
  11736,
  11742,
  11823,
  11823,
  12293,
  12295,
  12321,
  12329,
  12337,
  12341,
  12344,
  12348,
  12353,
  12438,
  12445,
  12447,
  12449,
  12538,
  12540,
  12543,
  12549,
  12591,
  12593,
  12686,
  12690,
  12693,
  12704,
  12735,
  12784,
  12799,
  12832,
  12841,
  12872,
  12879,
  12881,
  12895,
  12928,
  12937,
  12977,
  12991,
  13312,
  19903,
  19968,
  42124,
  42192,
  42237,
  42240,
  42508,
  42512,
  42539,
  42560,
  42606,
  42623,
  42653,
  42656,
  42735,
  42775,
  42783,
  42786,
  42888,
  42891,
  42972,
  42993,
  43009,
  43011,
  43013,
  43015,
  43018,
  43020,
  43042,
  43056,
  43061,
  43072,
  43123,
  43138,
  43187,
  43216,
  43225,
  43250,
  43255,
  43259,
  43259,
  43261,
  43262,
  43264,
  43301,
  43312,
  43334,
  43360,
  43388,
  43396,
  43442,
  43471,
  43481,
  43488,
  43492,
  43494,
  43518,
  43520,
  43560,
  43584,
  43586,
  43588,
  43595,
  43600,
  43609,
  43616,
  43638,
  43642,
  43642,
  43646,
  43695,
  43697,
  43697,
  43701,
  43702,
  43705,
  43709,
  43712,
  43712,
  43714,
  43714,
  43739,
  43741,
  43744,
  43754,
  43762,
  43764,
  43777,
  43782,
  43785,
  43790,
  43793,
  43798,
  43808,
  43814,
  43816,
  43822,
  43824,
  43866,
  43868,
  43881,
  43888,
  44002,
  44016,
  44025,
  44032,
  55203,
  55216,
  55238,
  55243,
  55291,
  63744,
  64109,
  64112,
  64217,
  64256,
  64262,
  64275,
  64279,
  64285,
  64285,
  64287,
  64296,
  64298,
  64310,
  64312,
  64316,
  64318,
  64318,
  64320,
  64321,
  64323,
  64324,
  64326,
  64433,
  64467,
  64829,
  64848,
  64911,
  64914,
  64967,
  65008,
  65019,
  65136,
  65140,
  65142,
  65276,
  65296,
  65305,
  65313,
  65338,
  65345,
  65370,
  65382,
  65470,
  65474,
  65479,
  65482,
  65487,
  65490,
  65495,
  65498,
  65500,
  65536,
  65547,
  65549,
  65574,
  65576,
  65594,
  65596,
  65597,
  65599,
  65613,
  65616,
  65629,
  65664,
  65786,
  65799,
  65843,
  65856,
  65912,
  65930,
  65931,
  66176,
  66204,
  66208,
  66256,
  66273,
  66299,
  66304,
  66339,
  66349,
  66378,
  66384,
  66421,
  66432,
  66461,
  66464,
  66499,
  66504,
  66511,
  66513,
  66517,
  66560,
  66717,
  66720,
  66729,
  66736,
  66771,
  66776,
  66811,
  66816,
  66855,
  66864,
  66915,
  66928,
  66938,
  66940,
  66954,
  66956,
  66962,
  66964,
  66965,
  66967,
  66977,
  66979,
  66993,
  66995,
  67001,
  67003,
  67004,
  67008,
  67059,
  67072,
  67382,
  67392,
  67413,
  67424,
  67431,
  67456,
  67461,
  67463,
  67504,
  67506,
  67514,
  67584,
  67589,
  67592,
  67592,
  67594,
  67637,
  67639,
  67640,
  67644,
  67644,
  67647,
  67669,
  67672,
  67702,
  67705,
  67742,
  67751,
  67759,
  67808,
  67826,
  67828,
  67829,
  67835,
  67867,
  67872,
  67897,
  67904,
  67929,
  67968,
  68023,
  68028,
  68047,
  68050,
  68096,
  68112,
  68115,
  68117,
  68119,
  68121,
  68149,
  68160,
  68168,
  68192,
  68222,
  68224,
  68255,
  68288,
  68295,
  68297,
  68324,
  68331,
  68335,
  68352,
  68405,
  68416,
  68437,
  68440,
  68466,
  68472,
  68497,
  68521,
  68527,
  68608,
  68680,
  68736,
  68786,
  68800,
  68850,
  68858,
  68899,
  68912,
  68921,
  68928,
  68965,
  68975,
  68997,
  69216,
  69246,
  69248,
  69289,
  69296,
  69297,
  69314,
  69319,
  69376,
  69415,
  69424,
  69445,
  69457,
  69460,
  69488,
  69505,
  69552,
  69579,
  69600,
  69622,
  69635,
  69687,
  69714,
  69743,
  69745,
  69746,
  69749,
  69749,
  69763,
  69807,
  69840,
  69864,
  69872,
  69881,
  69891,
  69926,
  69942,
  69951,
  69956,
  69956,
  69959,
  69959,
  69968,
  70002,
  70006,
  70006,
  70019,
  70066,
  70081,
  70084,
  70096,
  70106,
  70108,
  70108,
  70113,
  70132,
  70144,
  70161,
  70163,
  70187,
  70207,
  70208,
  70272,
  70278,
  70280,
  70280,
  70282,
  70285,
  70287,
  70301,
  70303,
  70312,
  70320,
  70366,
  70384,
  70393,
  70405,
  70412,
  70415,
  70416,
  70419,
  70440,
  70442,
  70448,
  70450,
  70451,
  70453,
  70457,
  70461,
  70461,
  70480,
  70480,
  70493,
  70497,
  70528,
  70537,
  70539,
  70539,
  70542,
  70542,
  70544,
  70581,
  70583,
  70583,
  70609,
  70609,
  70611,
  70611,
  70656,
  70708,
  70727,
  70730,
  70736,
  70745,
  70751,
  70753,
  70784,
  70831,
  70852,
  70853,
  70855,
  70855,
  70864,
  70873,
  71040,
  71086,
  71128,
  71131,
  71168,
  71215,
  71236,
  71236,
  71248,
  71257,
  71296,
  71338,
  71352,
  71352,
  71360,
  71369,
  71376,
  71395,
  71424,
  71450,
  71472,
  71483,
  71488,
  71494,
  71680,
  71723,
  71840,
  71922,
  71935,
  71942,
  71945,
  71945,
  71948,
  71955,
  71957,
  71958,
  71960,
  71983,
  71999,
  71999,
  72001,
  72001,
  72016,
  72025,
  72096,
  72103,
  72106,
  72144,
  72161,
  72161,
  72163,
  72163,
  72192,
  72192,
  72203,
  72242,
  72250,
  72250,
  72272,
  72272,
  72284,
  72329,
  72349,
  72349,
  72368,
  72440,
  72640,
  72672,
  72688,
  72697,
  72704,
  72712,
  72714,
  72750,
  72768,
  72768,
  72784,
  72812,
  72818,
  72847,
  72960,
  72966,
  72968,
  72969,
  72971,
  73008,
  73030,
  73030,
  73040,
  73049,
  73056,
  73061,
  73063,
  73064,
  73066,
  73097,
  73112,
  73112,
  73120,
  73129,
  73136,
  73179,
  73184,
  73193,
  73440,
  73458,
  73474,
  73474,
  73476,
  73488,
  73490,
  73523,
  73552,
  73561,
  73648,
  73648,
  73664,
  73684,
  73728,
  74649,
  74752,
  74862,
  74880,
  75075,
  77712,
  77808,
  77824,
  78895,
  78913,
  78918,
  78944,
  82938,
  82944,
  83526,
  90368,
  90397,
  90416,
  90425,
  92160,
  92728,
  92736,
  92766,
  92768,
  92777,
  92784,
  92862,
  92864,
  92873,
  92880,
  92909,
  92928,
  92975,
  92992,
  92995,
  93008,
  93017,
  93019,
  93025,
  93027,
  93047,
  93053,
  93071,
  93504,
  93548,
  93552,
  93561,
  93760,
  93846,
  93856,
  93880,
  93883,
  93907,
  93952,
  94026,
  94032,
  94032,
  94099,
  94111,
  94176,
  94177,
  94179,
  94179,
  94194,
  94198,
  94208,
  101589,
  101631,
  101662,
  101760,
  101874,
  110576,
  110579,
  110581,
  110587,
  110589,
  110590,
  110592,
  110882,
  110898,
  110898,
  110928,
  110930,
  110933,
  110933,
  110948,
  110951,
  110960,
  111355,
  113664,
  113770,
  113776,
  113788,
  113792,
  113800,
  113808,
  113817,
  118e3,
  118009,
  119488,
  119507,
  119520,
  119539,
  119648,
  119672,
  119808,
  119892,
  119894,
  119964,
  119966,
  119967,
  119970,
  119970,
  119973,
  119974,
  119977,
  119980,
  119982,
  119993,
  119995,
  119995,
  119997,
  120003,
  120005,
  120069,
  120071,
  120074,
  120077,
  120084,
  120086,
  120092,
  120094,
  120121,
  120123,
  120126,
  120128,
  120132,
  120134,
  120134,
  120138,
  120144,
  120146,
  120485,
  120488,
  120512,
  120514,
  120538,
  120540,
  120570,
  120572,
  120596,
  120598,
  120628,
  120630,
  120654,
  120656,
  120686,
  120688,
  120712,
  120714,
  120744,
  120746,
  120770,
  120772,
  120779,
  120782,
  120831,
  122624,
  122654,
  122661,
  122666,
  122928,
  122989,
  123136,
  123180,
  123191,
  123197,
  123200,
  123209,
  123214,
  123214,
  123536,
  123565,
  123584,
  123627,
  123632,
  123641,
  124112,
  124139,
  124144,
  124153,
  124368,
  124397,
  124400,
  124410,
  124608,
  124638,
  124640,
  124642,
  124644,
  124645,
  124647,
  124653,
  124656,
  124660,
  124670,
  124671,
  124896,
  124902,
  124904,
  124907,
  124909,
  124910,
  124912,
  124926,
  124928,
  125124,
  125127,
  125135,
  125184,
  125251,
  125259,
  125259,
  125264,
  125273,
  126065,
  126123,
  126125,
  126127,
  126129,
  126132,
  126209,
  126253,
  126255,
  126269,
  126464,
  126467,
  126469,
  126495,
  126497,
  126498,
  126500,
  126500,
  126503,
  126503,
  126505,
  126514,
  126516,
  126519,
  126521,
  126521,
  126523,
  126523,
  126530,
  126530,
  126535,
  126535,
  126537,
  126537,
  126539,
  126539,
  126541,
  126543,
  126545,
  126546,
  126548,
  126548,
  126551,
  126551,
  126553,
  126553,
  126555,
  126555,
  126557,
  126557,
  126559,
  126559,
  126561,
  126562,
  126564,
  126564,
  126567,
  126570,
  126572,
  126578,
  126580,
  126583,
  126585,
  126588,
  126590,
  126590,
  126592,
  126601,
  126603,
  126619,
  126625,
  126627,
  126629,
  126633,
  126635,
  126651,
  127232,
  127244,
  130032,
  130041,
  131072,
  173791,
  173824,
  178205,
  178208,
  183981,
  183984,
  191456,
  191472,
  192093,
  194560,
  195101,
  196608,
  201546,
  201552,
  210041
]);
function isWordChar2(cp) {
  if (cp < 128) return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 95;
  let lo = 0;
  let hi = WORD_RANGES.length / 2 - 1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    const first = WORD_RANGES[2 * mid];
    const last2 = WORD_RANGES[2 * mid + 1];
    if (cp < first) hi = mid - 1;
    else if (cp > last2) lo = mid + 1;
    else return true;
  }
  return false;
}
function isBlank2(cp) {
  if (cp === 0 || cp === 32 || cp >= 9 && cp <= 13) return true;
  return cp === 160 || cp === 5760 || cp >= 8192 && cp <= 8202 || cp === 8232 || cp === 8233 || cp === 8239 || cp === 8287 || cp === 12288 || cp === 65279;
}
function splitRuns(s, isSeparator) {
  const out = [];
  let start = -1;
  let i = 0;
  for (const ch of s) {
    if (isSeparator(ch.codePointAt(0))) {
      if (start >= 0) {
        out.push(s.slice(start, i));
        start = -1;
      }
    } else if (start < 0) {
      start = i;
    }
    i += ch.length;
  }
  if (start >= 0) out.push(s.slice(start));
  return out;
}
function wordTokens(s) {
  return splitRuns(s, (cp) => !isWordChar2(cp));
}
function blankTokens(s) {
  return splitRuns(s, isBlank2);
}

// src/core/store/fts.ts
var INSERT_SOURCE = `
INSERT INTO sources(session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts)
VALUES (:session_id, :worktree, :agent, :kind, :label, :bytes_total, :chunk_count, :created_ts, :created_at, :created_ts)
RETURNING id`;
var INSERT_CHUNK = `
INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body, title) VALUES (?, ?, ?, ?, ?, ?, ?)`;
var TITLE_WEIGHT = 1;
var PORTER_MATCH = `
  SELECT chunks.rowid AS rid, chunks.source_id AS source_id, chunks.session_id AS session_id,
         chunks.worktree AS worktree, chunks.ord AS ord, s.created_ts AS created_ts,
         bm25(chunks, 0, 0, 0, 0, 0, 1.0, ${TITLE_WEIGHT}) AS bm,
         (chunks.rowid IN (SELECT rowid FROM chunks WHERE chunks MATCH :all)) AS full
  FROM chunks JOIN sources s ON s.id = chunks.source_id
  WHERE chunks MATCH :match
    AND (:scope <> 'session' OR chunks.session_id = :session_id)
    AND (:scope <> 'worktree' OR chunks.worktree = :worktree)
    AND (:source IS NULL OR s.label = :source)`;
var PORTER_ORDER = `
ORDER BY (session_id = :session_id) DESC, (worktree = :worktree) DESC, full DESC, score DESC, source_id DESC, ord ASC`;
var PORTER_RANK_PROJECT = `
WITH m AS (${PORTER_MATCH}
), r AS (
  SELECT *,
         ROW_NUMBER() OVER (ORDER BY full DESC, bm ASC, source_id DESC, ord ASC) AS rank_a,
         ROW_NUMBER() OVER (ORDER BY created_ts DESC, source_id DESC, ord ASC) AS rank_b
  FROM m
)
SELECT rid, source_id, session_id, worktree, ord, full, 1.0 / (:k + rank_a) + 1.0 / (:k + rank_b) AS score
FROM r${PORTER_ORDER}`;
var PORTER_RANK_BM25 = `
WITH m AS (${PORTER_MATCH}
)
SELECT rid, source_id, session_id, worktree, ord, full, -bm AS score
FROM m${PORTER_ORDER}`;
function porterRankSql(scope) {
  return scope === "project" ? PORTER_RANK_PROJECT : PORTER_RANK_BM25;
}
var TRI_RANK = `
SELECT t.rowid AS rid, c.source_id AS source_id, c.session_id AS session_id, c.worktree AS worktree, c.ord AS ord
FROM chunks_tri t JOIN chunks c ON c.rowid = t.rowid JOIN sources s ON s.id = c.source_id
WHERE chunks_tri MATCH :match
  AND (:scope <> 'session' OR c.session_id = :session_id)
  AND (:scope <> 'worktree' OR c.worktree = :worktree)
  AND (:source IS NULL OR s.label = :source)
ORDER BY bm25(chunks_tri, 1.0, ${TITLE_WEIGHT}) ASC, c.source_id DESC, c.ord ASC`;
var PAGE_ROWS = `
SELECT c.rowid AS rid, c.source_id AS source_id, c.ord AS ord, c.body AS body, s.label AS label
FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.rowid IN (SELECT value FROM json_each(:ids))`;
var INSERT_TRI = "INSERT INTO chunks_tri(rowid, body, title) VALUES (?, ?, ?)";
var TRI_DELETE = "INSERT INTO chunks_tri(chunks_tri, rowid, body, title) SELECT 'delete', rowid, body, title FROM chunks";
function ftsInsert(db, src, chunks) {
  const id2 = reserveSource(db, src, chunks);
  insertChunks(db, id2, src, chunks);
  return id2;
}
function reserveSource(db, src, chunks) {
  let total = 0;
  for (const c of chunks) total += c.bytes;
  return withWrite(db, (h) => {
    const row5 = h.raw.prepare(INSERT_SOURCE).get({
      session_id: src.sessionId,
      worktree: src.worktree,
      agent: src.agent,
      kind: src.kind,
      label: src.label,
      bytes_total: total,
      chunk_count: chunks.length,
      created_ts: src.createdAt,
      created_at: new Date(src.createdAt).toISOString()
    });
    return Number(row5.id);
  });
}
function finishReserved(db, id2, src, chunks, units) {
  try {
    insertChunks(db, id2, src, chunks);
    insertUnits(db, id2, src.sessionId, units);
  } catch (err) {
    withWrite(db, (h) => {
      deleteChunkRows(h.raw, { sourceId: id2 });
      h.raw.prepare("DELETE FROM sources WHERE id = ?").run(id2);
    });
    throw err;
  }
}
function insertChunks(db, id2, src, chunks) {
  const batches = [];
  let batch = [];
  let batchBytes = 0;
  for (const c of chunks) {
    if (batch.length > 0 && batchBytes + c.bytes > INDEX_WRITE_CHUNK) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(c);
    batchBytes += c.bytes;
  }
  if (batch.length > 0) batches.push(batch);
  for (const rows of batches) {
    withWrite(db, (h) => {
      const ins = h.raw.prepare(INSERT_CHUNK);
      const tri = h.raw.prepare(INSERT_TRI);
      for (const c of rows) {
        const title = c.title ?? "";
        const rid = ins.run(id2, src.sessionId, src.worktree, src.agent, c.ord, c.text, title).lastInsertRowid;
        tri.run(rid, c.text, title);
      }
    });
  }
}
function deleteChunkRows(raw, scope) {
  if (scope === "all") {
    raw.exec("INSERT INTO chunks_tri(chunks_tri) VALUES ('delete-all')");
    raw.exec("DELETE FROM line_units");
    return Number(raw.prepare("DELETE FROM chunks").run().changes);
  }
  const [where, arg] = "sourceId" in scope ? ["source_id = ?", scope.sourceId] : ["source_id IN (SELECT id FROM sources WHERE label = ?)", scope.label];
  raw.prepare(TRI_DELETE + " WHERE " + where).run(arg);
  raw.prepare("DELETE FROM line_units WHERE " + where).run(arg);
  return Number(raw.prepare("DELETE FROM chunks WHERE " + where).run(arg).changes);
}
function toMatch(q) {
  const words = [];
  let cur = "";
  for (const ch of q) {
    if (ch.trim() === "" || ch === "\0") {
      if (cur !== "") words.push(cur);
      cur = "";
    } else {
      cur += ch === '"' ? '""' : ch;
    }
  }
  if (cur !== "") words.push(cur);
  return words.map((w) => `"${w}"*`).join(" ");
}
function toMatchAny(q) {
  const terms = new Set(toMatch(q).split(" ").filter((t) => t !== ""));
  return [...terms].join(" OR ");
}
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "is",
  "be",
  "it",
  "as",
  "do",
  "i",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "had",
  "her",
  "was",
  "one",
  "our",
  "out",
  "has",
  "his",
  "how",
  "its",
  "may",
  "who",
  "did",
  "get",
  "got",
  "let",
  "she",
  "too",
  "will",
  "with",
  "this",
  "that",
  "from",
  "they",
  "been",
  "have",
  "some",
  "them",
  "than",
  "each",
  "into",
  "your",
  "could",
  "would",
  "about",
  "which",
  "their",
  "there",
  "other",
  "should",
  "also",
  "very",
  "when",
  "what",
  "then",
  "these",
  "those",
  "being",
  "does",
  "both",
  "while",
  "where",
  "here",
  "were",
  "much",
  "any",
  "my",
  "me",
  "we"
]);
function searchTerms(q) {
  const all = [...new Set(toMatch(q).split(" ").filter((t) => t !== ""))];
  const kept = all.filter((t) => !STOPWORDS.has(t.slice(1, -2).toLowerCase()));
  return kept.length > 0 ? kept : all;
}
function trigramMatch(q) {
  const words = blankTokens(q);
  const kept = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const parts = new Set((kept.length > 0 ? kept : words).filter((w) => [...w].length >= 3));
  const whole = words.join(" ");
  if (words.length > 1 && [...whole].length >= 3) parts.add(whole);
  return [...parts].map((w) => `"${w.replaceAll('"', '""')}"`).join(" OR ");
}
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
var STMTS = /* @__PURE__ */ new WeakMap();
function stmt(raw, sql) {
  let m = STMTS.get(raw);
  if (m === void 0) {
    m = /* @__PURE__ */ new Map();
    STMTS.set(raw, m);
  }
  let st = m.get(sql);
  if (st === void 0) {
    st = raw.prepare(sql);
    m.set(sql, st);
  }
  return st;
}
function queryStems(q) {
  const sqlite = process.getBuiltinModule("node:sqlite");
  if (sqlite === void 0) throw new CtxError("NO_SQLITE");
  const mem = new sqlite.DatabaseSync(":memory:");
  try {
    mem.exec(`CREATE VIRTUAL TABLE q USING fts5(body, ${FTS_TOKENIZE}); CREATE VIRTUAL TABLE v USING fts5vocab(q, 'row');`);
    mem.prepare("INSERT INTO q(body) VALUES (?)").run(q);
    return mem.prepare("SELECT term FROM v").all().map((r) => r.term);
  } finally {
    mem.close();
  }
}
var TYPO_MIN_LEN = 5;
var TYPO_MAX_DIST = 2;
function typoTerms(db, words) {
  const has3 = stmt(db.raw, "SELECT 1 AS x FROM chunks_vocab WHERE term = ?");
  const near = stmt(db.raw, "SELECT term, doc, length(term) AS n FROM chunks_vocab WHERE length(term) BETWEEN ? AND ?");
  const stems = queryStems(words.join(" "));
  const miss = stems.map((stem) => has3.get(stem) === void 0 && [...stem].length >= TYPO_MIN_LEN);
  if (!miss.includes(true)) return null;
  const lens = stems.filter((_, i) => miss[i]).map((stem) => stem.length);
  const rows = near.all(Math.min(...lens) - TYPO_MAX_DIST, Math.max(...lens) + TYPO_MAX_DIST);
  let changed = false;
  const out = [];
  stems.forEach((stem, i) => {
    if (!miss[i]) {
      out.push(stem);
      return;
    }
    let best = null;
    for (const r of rows) {
      const n = Number(r.n);
      if (n < stem.length - TYPO_MAX_DIST || n > stem.length + TYPO_MAX_DIST) continue;
      const d = editDistance(stem, r.term, TYPO_MAX_DIST);
      if (d > TYPO_MAX_DIST) continue;
      if (best === null || d < best.d || d === best.d && (r.doc > best.doc || r.doc === best.doc && r.term < best.term)) {
        best = { term: r.term, d, doc: Number(r.doc) };
      }
    }
    if (best !== null) {
      out.push(best.term);
      changed = true;
    }
  });
  return changed ? out.map((t) => `"${t.replaceAll('"', '""')}"*`) : null;
}
function ftsQuery(db, q, scope, ctx, sessionId, limit, offset, source) {
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  const filter = { scope, session_id: sessionId, worktree: ctx.worktree, source: source ?? null };
  const rrf = scope === "project" ? { k: RRF_K } : {};
  const porter = (t) => stmt(db.raw, porterRankSql(scope)).all({ ...filter, match: t.join(" OR "), all: t.join(" "), ...rrf });
  let pList = porter(terms);
  if (pList.length === 0) {
    const fixed = typoTerms(db, terms.map((t) => t.slice(1, -2).replaceAll('""', '"')));
    if (fixed !== null) pList = porter(fixed);
  }
  const tm = trigramMatch(q);
  const tList = tm === "" ? [] : stmt(db.raw, TRI_RANK).all({ ...filter, match: tm });
  const fused = /* @__PURE__ */ new Map();
  pList.forEach((r, i) => fused.set(Number(r.rid), { r, s: 1 / (RRF_K + i + 1), full: Number(r.full ?? 0), p: i }));
  tList.forEach((r, i) => {
    const e = fused.get(Number(r.rid));
    if (e) e.s += 1 / (RRF_K + i + 1);
    else fused.set(Number(r.rid), { r, s: 1 / (RRF_K + i + 1), full: 0, p: Number.MAX_SAFE_INTEGER });
  });
  const tier = (r) => (r.session_id === sessionId ? 2 : 0) + (r.worktree === ctx.worktree ? 1 : 0);
  const page2 = [...fused.values()].sort((a, b) => tier(b.r) - tier(a.r) || b.full - a.full || b.s - a.s || a.p - b.p || Number(b.r.source_id) - Number(a.r.source_id) || Number(a.r.ord) - Number(b.r.ord)).slice(offset, offset + limit);
  if (page2.length === 0) return [];
  const rows = /* @__PURE__ */ new Map();
  for (const r of stmt(db.raw, PAGE_ROWS).all({ ids: JSON.stringify(page2.map((e) => Number(e.r.rid))) })) {
    rows.set(Number(r.rid), r);
  }
  return page2.map((e) => {
    const r = rows.get(Number(e.r.rid));
    return { sourceId: Number(r.source_id), label: r.label, ord: Number(r.ord), snippet: highlight(r.body, q, SNIPPET_MAX_BYTES), score: e.s };
  });
}
var LIST = `
WITH p AS (
  SELECT c.rowid AS rid, c.source_id AS source_id, c.ord AS ord, s.session_id AS session_id,
         s.worktree AS worktree, s.label AS label
  FROM chunks c JOIN sources s ON s.id = c.source_id
  WHERE c.source_id IN (
    SELECT id FROM sources
    WHERE label = :source
      AND (:scope <> 'session' OR session_id = :session_id)
      AND (:scope <> 'worktree' OR worktree = :worktree))
  ORDER BY (s.session_id = :session_id) DESC, (s.worktree = :worktree) DESC, c.source_id DESC, c.ord ASC
  LIMIT :limit OFFSET :offset
)
SELECT p.source_id AS source_id, p.label AS label, p.ord AS ord, c.body AS body, 0 AS score
FROM p JOIN chunks c ON c.rowid = p.rid
ORDER BY (p.session_id = :session_id) DESC, (p.worktree = :worktree) DESC, p.source_id DESC, p.ord ASC`;
function ftsListSource(db, source, scope, ctx, sessionId, limit, offset) {
  const rows = db.raw.prepare(LIST).all({
    source,
    scope,
    session_id: sessionId,
    worktree: ctx.worktree,
    limit,
    offset
  });
  return rows.map((r) => ({
    sourceId: Number(r.source_id),
    label: r.label,
    ord: Number(r.ord),
    snippet: highlight(r.body, "", SNIPPET_MAX_BYTES),
    score: Number(r.score)
  }));
}
function highlight(row5, terms, maxBytes = SNIPPET_MAX_BYTES) {
  const words = blankTokens(terms);
  const kept = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  return buildSnippet(row5, snippetTerms(kept.length > 0 ? kept : words), maxBytes);
}
var TL_SCOPE = `
    AND (:scope <> 'session' OR session_id = :session_id)
    AND (:scope <> 'worktree' OR worktree = :worktree)`;
var TL_EVENTS = `
WITH e AS (
  SELECT seq, kind, key, path, body, created_at FROM events
  WHERE created_at > :after${TL_SCOPE}
    AND (:source IS NULL OR kind = :source)
)
SELECT seq, kind, key, path, body, created_at FROM e
WHERE created_at <= IFNULL((SELECT created_at FROM e ORDER BY created_at, seq LIMIT 1 OFFSET :off), created_at)
ORDER BY created_at ASC, seq ASC`;
var TL_SOURCES = `
WITH s AS (
  SELECT id, label, created_ts FROM sources
  WHERE created_ts > :after${TL_SCOPE}
    AND (:source IS NULL OR label = :source)
    AND label <> :reserved
)
SELECT id, label, created_ts FROM s
WHERE created_ts <= IFNULL((SELECT created_ts FROM s ORDER BY created_ts, id LIMIT 1 OFFSET :off), created_ts)
ORDER BY created_ts ASC, id ASC`;
var TL_FIRST_CHUNK = `
SELECT source_id, body FROM chunks WHERE ord = 0 AND source_id IN (SELECT value FROM json_each(:ids))`;
var TL_MORE = `
SELECT EXISTS(SELECT 1 FROM events WHERE created_at > :after${TL_SCOPE} AND (:source IS NULL OR kind = :source))
    OR EXISTS(SELECT 1 FROM sources WHERE created_ts > :after${TL_SCOPE} AND (:source IS NULL OR label = :source)
                 AND label <> :reserved) AS more`;
function timelineOrder(a, b) {
  if (a.ts !== b.ts) return a.ts - b.ts;
  const ca = a.seq !== null ? 0 : a.sourceId !== null ? 1 : 2;
  const cb = b.seq !== null ? 0 : b.sourceId !== null ? 1 : 2;
  if (ca !== cb) return ca - cb;
  if (ca === 0) return a.seq - b.seq;
  if (ca === 1) return a.sourceId - b.sourceId;
  const pa = a.path ?? "";
  const pb = b.path ?? "";
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}
function ftsQueryTimeline(db, scope, ctx, sessionId, limit, after, source, memory) {
  const filter = {
    scope,
    session_id: sessionId,
    worktree: ctx.worktree,
    source: source ?? null
  };
  const from = after ?? -1;
  const reserved = DECISION_SOURCE;
  const off = limit - 1;
  const merged = [];
  for (const e of db.raw.prepare(TL_EVENTS).all({ ...filter, after: from, off })) {
    merged.push({
      origin: "session",
      ts: Number(e.created_at),
      seq: Number(e.seq),
      sourceId: null,
      path: e.path,
      label: e.kind,
      text: e.body ?? e.key ?? e.path ?? ""
    });
  }
  const srcRows = db.raw.prepare(TL_SOURCES).all({ ...filter, after: from, off, reserved });
  if (srcRows.length > 0) {
    const bodies = /* @__PURE__ */ new Map();
    const ids = JSON.stringify(srcRows.map((r) => Number(r.id)));
    for (const c of db.raw.prepare(TL_FIRST_CHUNK).all({ ids })) {
      bodies.set(Number(c.source_id), c.body);
    }
    for (const r of srcRows) {
      const id2 = Number(r.id);
      merged.push({ origin: "content", ts: Number(r.created_ts), seq: null, sourceId: id2, path: null, label: r.label, text: bodies.get(id2) ?? "" });
    }
  }
  for (const m of memory) {
    if (m.ts > from && (source === void 0 || m.label === source)) merged.push(m);
  }
  merged.sort(timelineOrder);
  let end = Math.min(limit, merged.length);
  if (end > 0) {
    const last2 = merged[end - 1].ts;
    while (end < merged.length && merged[end].ts === last2) end++;
  }
  const rows = merged.slice(0, end);
  if (rows.length === 0) return { rows, more: false };
  if (merged.length > end) return { rows, more: true };
  const res = db.raw.prepare(TL_MORE).get({ ...filter, after: rows[rows.length - 1].ts, reserved });
  return { rows, more: Number(res.more) === 1 };
}
var RANK_DDL = `CREATE VIRTUAL TABLE r USING fts5(body, ${FTS_TOKENIZE}, content='')`;
var RANK_INSERT = "INSERT INTO r(rowid, body) VALUES (?, ?)";
var RANK_QUERY = "SELECT rowid AS id, bm25(r) AS bm FROM r WHERE r MATCH ?";
function rankTexts(texts, q, mode = "all") {
  const scores = texts.map(() => 0);
  const match = mode === "any" ? toMatchAny(q) : toMatch(q);
  if (match === "" || texts.length === 0) return scores;
  const sqlite = process.getBuiltinModule("node:sqlite");
  if (sqlite === void 0) throw new CtxError("NO_SQLITE");
  const mem = new sqlite.DatabaseSync(":memory:");
  try {
    mem.exec(RANK_DDL);
    const ins = mem.prepare(RANK_INSERT);
    mem.exec("BEGIN");
    for (let i = 0; i < texts.length; i++) ins.run(i + 1, texts[i]);
    mem.exec("COMMIT");
    for (const r of mem.prepare(RANK_QUERY).all(match)) {
      scores[Number(r.id) - 1] = -r.bm;
    }
    return scores;
  } finally {
    mem.close();
  }
}
var BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
var SOURCE_ID_PREFIX = "s";
var LABEL_SUFFIX_SEP = "#";
function sourceHandle(id2) {
  return SOURCE_ID_PREFIX + id2.toString(36);
}
function parseSourceHandle(s) {
  if (!s.startsWith(SOURCE_ID_PREFIX) || s.length <= SOURCE_ID_PREFIX.length || s.length > SOURCE_ID_PREFIX.length + SOURCE_HANDLE_MAX_DIGITS) return null;
  let n = 0;
  for (const ch of s.slice(SOURCE_ID_PREFIX.length)) {
    const d = BASE36.indexOf(ch);
    if (d < 0) return null;
    n = n * 36 + d;
  }
  return n > 0 && sourceHandle(n) === s ? n : null;
}
function resolveSourceLabel(db, source) {
  const id2 = parseSourceHandle(source);
  if (id2 !== null) {
    const row5 = stmt(db.raw, "SELECT label FROM sources WHERE id = ?").get(id2);
    if (row5 !== void 0) return row5.label;
  }
  if (stmt(db.raw, "SELECT 1 AS x FROM sources WHERE label = ? LIMIT 1").get(source) !== void 0) return source;
  const prefix = source + LABEL_SUFFIX_SEP;
  const rows = stmt(db.raw, "SELECT label FROM sources WHERE substr(label, 1, ?) = ? ORDER BY id DESC").all(prefix.length, prefix);
  for (const r of rows) {
    if (r.label.lastIndexOf(LABEL_SUFFIX_SEP) === source.length) return r.label;
  }
  return source;
}
function listSessionSources(db, sessionId, limit) {
  const rows = stmt(db.raw, "SELECT id, label, bytes_total FROM sources WHERE session_id = ? ORDER BY id DESC LIMIT ?").all(sessionId, limit);
  return rows.map((r) => ({ id: Number(r.id), label: r.label, bytes: Number(r.bytes_total) }));
}
function insertUnits(db, sourceId, sessionId, units) {
  let start = 0;
  while (start < units.length) {
    let end = start;
    let bytes4 = 0;
    while (end < units.length && (end === start || bytes4 + units[end].body.length <= INDEX_WRITE_CHUNK)) {
      bytes4 += units[end].body.length;
      end++;
    }
    const from = start;
    withWrite(db, (h) => {
      const ins = h.raw.prepare("INSERT INTO line_units(body, source_id, session_id, ord) VALUES (?, ?, ?, ?)");
      for (let i = from; i < end; i++) {
        const u = units[i];
        ins.run(u.body, sourceId, sessionId, u.ord);
      }
    });
    start = end;
  }
}
function recallQueryText(prompt, goal) {
  return goal === prompt ? prompt : prompt + " " + goal;
}
function queryUnits(db, sessionId, q, limit) {
  const match = searchTerms(q).join(" OR ");
  if (match === "" || sessionId === "") return [];
  const rows = db.raw.prepare(
    "SELECT u.source_id AS source_id, u.ord AS ord, u.body AS body, -bm25(line_units) AS score, s.label AS label FROM line_units u JOIN sources s ON s.id = u.source_id WHERE line_units MATCH ? AND u.session_id = ? ORDER BY bm25(line_units) LIMIT ?"
  ).all(match, sessionId, limit);
  return rows.map((r) => ({ sourceId: Number(r.source_id), ord: Number(r.ord), label: r.label, body: r.body, score: r.score }));
}

// src/core/index/units.ts
function indentOf(line) {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "	")) n++;
  return n;
}
function buildUnits(text) {
  const lines = text.split("\n");
  const stack = [];
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
    const indent = indentOf(line);
    if (indent === line.length) continue;
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    out.push({ ord: i, body: [...stack.map((s) => s.line), line].join("\n") });
    stack.push({ indent, line });
  }
  return out;
}

// src/core/compaction/candidates.ts
function firstLine2(body) {
  const nl = body.indexOf("\n");
  return (nl < 0 ? body : body.slice(0, nl)).replaceAll("\r", " ");
}
function make(section, row5, text, repeatCount, query) {
  const bytes4 = Buffer.byteLength(text, "utf8");
  if (bytes4 < 1) throw new Error("compaction: empty candidate line (DECISIONS-r9 M9).");
  return { section, seq: row5.seq, turn: row5.turn, text, bytes: bytes4, repeatCount, pinned: section === "last_request", query };
}
function capSection(list3) {
  return list3.length > MAX_CANDIDATES ? list3.slice(list3.length - MAX_CANDIDATES) : list3;
}
function emptySet() {
  return { lastRequest: null, openErrors: [], changedFiles: [], decisions: [], earlierRequests: [], indexedSources: [] };
}
function buildCandidates(rows, sessionId) {
  if (!sessionId) return emptySet();
  const own2 = rows.filter((r) => r.session_id === sessionId).sort((a, b) => a.seq - b.seq);
  const prompts = own2.filter((r) => r.kind === "prompt");
  const last2 = prompts.length > 0 ? prompts[prompts.length - 1] : void 0;
  const lastRequest = last2 === void 0 ? null : make("last_request", last2, "now: " + firstLine2(last2.body), 1, null);
  const earlierRequests = prompts.slice(0, prompts.length - 1).map((r) => make("earlier_requests", r, "asked #" + r.seq + ": " + firstLine2(r.body), 1, null));
  const failures = /* @__PURE__ */ new Map();
  const lastOk = /* @__PURE__ */ new Map();
  for (const r of own2) {
    if (r.kind !== "cmd" && r.kind !== "toolerr" || r.key === null) continue;
    if (r.ok === 1) {
      lastOk.set(r.key, r.seq);
      continue;
    }
    failures.set(r.key, { row: r, count: (failures.get(r.key)?.count ?? 0) + 1 });
  }
  const openErrors = [];
  for (const [key, f] of failures) {
    if ((lastOk.get(key) ?? 0) > f.row.seq) continue;
    openErrors.push(make("open_errors", f.row, "error #" + f.row.seq + " " + (f.row.tool ?? "") + ": " + key, f.count, key));
  }
  openErrors.sort((a, b) => a.seq - b.seq);
  const edits = /* @__PURE__ */ new Map();
  for (const r of own2) {
    if (r.kind !== "edit" || r.path === null) continue;
    edits.set(r.path, { row: r, count: (edits.get(r.path)?.count ?? 0) + 1 });
  }
  const changedFiles = [];
  for (const [path5, e] of edits) {
    const c = make("changed_files", e.row, "edited " + path5 + " x" + e.count, e.count, path5);
    changedFiles.push({ ...c, editCount: e.count });
  }
  changedFiles.sort((a, b) => a.seq - b.seq);
  const decided = /* @__PURE__ */ new Map();
  for (const r of own2) {
    if (r.kind !== "decision" || r.body === "") continue;
    const key = r.key ?? r.body;
    decided.set(key, { row: r, count: (decided.get(key)?.count ?? 0) + 1 });
  }
  const decisions = [];
  for (const [key, d] of decided) decisions.push(make("decisions", d.row, "decided #" + d.row.seq + ": " + firstLine2(d.row.body), d.count, key));
  decisions.sort((a, b) => a.seq - b.seq);
  const indexedSources = own2.filter((r) => r.kind === "index").map((r) => make("indexed_sources", r, "indexed " + (r.key ?? ""), 1, r.key));
  const set3 = {
    lastRequest,
    openErrors: capSection(openErrors),
    changedFiles: capSection(changedFiles),
    decisions: capSection(decisions),
    earlierRequests: capSection(earlierRequests),
    indexedSources: capSection(indexedSources)
  };
  const rest = [...set3.openErrors, ...set3.changedFiles, ...set3.decisions, ...set3.earlierRequests, ...set3.indexedSources];
  const total = rest.length + (lastRequest === null ? 0 : 1);
  if (total <= MAX_CANDIDATES_TOTAL) return set3;
  const drop = new Set(rest.map((c) => c.seq).sort((a, b) => a - b).slice(0, total - MAX_CANDIDATES_TOTAL));
  return {
    lastRequest,
    openErrors: set3.openErrors.filter((c) => !drop.has(c.seq)),
    changedFiles: set3.changedFiles.filter((c) => !drop.has(c.seq)),
    decisions: set3.decisions.filter((c) => !drop.has(c.seq)),
    earlierRequests: set3.earlierRequests.filter((c) => !drop.has(c.seq)),
    indexedSources: set3.indexedSources.filter((c) => !drop.has(c.seq))
  };
}

// src/core/compaction/score.ts
function scoreCandidate(input) {
  if (!Object.hasOwn(WEIGHT, input.section)) {
    throw new Error(`compaction: "${String(input.section)}" has no weight; only toolerr, decision, prompt, edit and index rows are scored (ADR-0009 \xA73, DECISIONS-r11).`);
  }
  const age = Math.max(0, input.currentTurn - input.itemTurn);
  const decay = DECAY_X1000[Math.min(age, DECAY_X1000.length - 1)];
  let bonus = 1;
  for (let n = Math.max(1, input.repeatCount); n > 1; n >>= 1) bonus += 1;
  return Math.round(WEIGHT[input.section] * decay * bonus / DECAY_SCALE);
}
function weightKey(section) {
  switch (section) {
    case "last_request":
    case "earlier_requests":
      return "prompt";
    case "open_errors":
      return "toolerr";
    case "changed_files":
      return "edit";
    case "decisions":
      return "decision";
    case "indexed_sources":
      return "index";
  }
}
function scoreCandidates(candidates2, currentTurn) {
  return candidates2.map((c) => ({
    ...c,
    score: scoreCandidate({ section: weightKey(c.section), currentTurn, itemTurn: c.turn, repeatCount: c.repeatCount })
  }));
}

// src/core/compaction/recall.ts
function unitKey(u) {
  return u.sourceId + ":" + u.ord;
}
function unitLine(u) {
  return "@" + u.label + " line " + (u.ord + 1) + ":\n" + u.body;
}
function wordsOf(s) {
  return new Set(wordTokens(s.toLowerCase()));
}
function overlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return a.size + b.size - n === 0 ? 0 : n / (a.size + b.size - n);
}
function pickUnits(cands, seen, budget) {
  const pool = cands.filter((u) => !seen.has(unitKey(u)) && u.score >= RECALL_MIN_SCORE);
  if (pool.length === 0) return [];
  const top = Math.max(...pool.map((u) => u.score));
  const words = pool.map((u) => wordsOf(u.body));
  const taken = [];
  const left = new Set(pool.map((_, i) => i));
  let used = 0;
  while (left.size > 0) {
    let best = -1;
    let bestVal = -Infinity;
    for (const i of left) {
      let sim = 0;
      for (const j of taken) sim = Math.max(sim, overlap(words[i], words[j]));
      const val = MMR_RELEVANCE_WEIGHT * (pool[i].score / top) - MMR_REDUNDANCY_WEIGHT * sim;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    left.delete(best);
    const cost = bytesOf(unitLine(pool[best])) + 1;
    if (used + cost > budget) continue;
    used += cost;
    taken.push(best);
  }
  return taken.map((i) => pool[i]);
}
var NONE2 = { text: "", seqs: [] };
function bytesOf(s) {
  return Buffer.byteLength(s, "utf8");
}
function textOf(r) {
  return [r.key ?? "", r.path ?? "", r.body].filter((t) => t !== "").join("\n");
}
function recallLine(r) {
  return "#" + r.seq + " " + r.kind + (r.tool === null ? "" : " " + r.tool) + ": " + textOf(r);
}
function pickRecall(rows, prompt, seen, units = [], seenUnits = /* @__PURE__ */ new Set()) {
  if (prompt.trim() === "") return NONE2;
  const pool = rows.filter((r) => !seen.has(r.seq) && r.kind !== "cost" && !(r.kind === "prompt" && r.body === prompt) && textOf(r) !== "");
  const scores = pool.length === 0 ? [] : rankTexts(pool.map(textOf), prompt, "any");
  const order = pool.map((r, i) => ({ r, score: scores[i] })).filter((x) => x.score >= RECALL_MIN_SCORE).sort((a, b) => b.score - a.score || b.r.seq - a.r.seq);
  let used = bytesOf(RECALL_OPEN_TAG) + 1 + bytesOf(RECALL_CLOSE_TAG);
  const taken = [];
  for (const { r } of order) {
    const cost = bytesOf(recallLine(r)) + 1;
    if (used + cost > RECALL_BUDGET_BYTES) continue;
    used += cost;
    taken.push(r);
  }
  const picked = pickUnits(units, seenUnits, RECALL_BUDGET_BYTES - used);
  if (taken.length === 0 && picked.length === 0) return NONE2;
  taken.sort((a, b) => a.seq - b.seq);
  const lines = [...taken.map(recallLine), ...picked.map(unitLine)];
  return { text: [RECALL_OPEN_TAG, ...lines, RECALL_CLOSE_TAG].join("\n"), seqs: taken.map((r) => r.seq), ...picked.length > 0 ? { units: picked.map(unitKey) } : {} };
}

// src/core/compaction/render.ts
function bytesOf2(s) {
  return Buffer.byteLength(s, "utf8");
}
function lineOf(c, prefix) {
  return c.bytes > POINTER_MIN ? "#" + c.seq + " (" + c.bytes + " B) " + prefix + "ctx_resume(seq:" + c.seq + ")" : c.text;
}
function moreLine(queries, prefix) {
  return "more: " + prefix + "ctx_search(queries:" + JSON.stringify(queries) + ', scope:"session")';
}
function renderState(rows, turn, extras, prefix = "") {
  let newest;
  for (const r of rows) if (newest === void 0 || r.seq > newest.seq) newest = r;
  const sessionId = newest === void 0 ? "" : newest.session_id;
  const upto = newest === void 0 || sessionId === "" ? 0 : newest.seq;
  const set3 = buildCandidates(rows, sessionId);
  const openTag = `<context_mode_state session="${sessionId}" upto="${upto}">`;
  const emptyMoreBytes = bytesOf2(moreLine([], prefix));
  const budget = STATE_BUDGET - (bytesOf2(openTag) + 1 + emptyMoreBytes + 1 + bytesOf2(STATE_CLOSE_TAG));
  let used = 0;
  const pinnedLine = set3.lastRequest === null ? null : lineOf(set3.lastRequest, prefix);
  if (pinnedLine !== null) used += bytesOf2(pinnedLine) + 1;
  const remaining = scoreCandidates(
    [...set3.openErrors, ...set3.changedFiles, ...set3.decisions, ...set3.earlierRequests, ...set3.indexedSources],
    turn
  );
  const k = /* @__PURE__ */ new Map();
  const taken = [];
  const skipped = [];
  while (remaining.length > 0) {
    let best = 0;
    let bestRatio = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c2 = remaining[i];
      const ratio = c2.score * RATIO_SECTION_DECAY ** (k.get(c2.section) ?? 0) / c2.bytes;
      if (ratio > bestRatio || ratio === bestRatio && c2.seq > remaining[best].seq) {
        best = i;
        bestRatio = ratio;
      }
    }
    const c = remaining.splice(best, 1)[0];
    const lineBytes = bytesOf2(lineOf(c, prefix)) + 1;
    if (used + lineBytes <= budget) {
      used += lineBytes;
      taken.push(c);
      k.set(c.section, (k.get(c.section) ?? 0) + 1);
    } else {
      skipped.push(c);
    }
  }
  const lines = [openTag];
  if (pinnedLine !== null) lines.push(pinnedLine);
  for (const section of ["open_errors", "changed_files", "decisions", "earlier_requests", "indexed_sources"]) {
    for (const c of taken.filter((t) => t.section === section).sort((a, b) => a.seq - b.seq)) lines.push(lineOf(c, prefix));
  }
  if (extras !== void 0) {
    for (const l of extras.sources) {
      const b = bytesOf2(l) + 1;
      if (used + b > budget) continue;
      used += b;
      lines.push(l);
    }
    for (const u of pickUnits(extras.units, /* @__PURE__ */ new Set(), budget - used)) {
      const l = unitLine(u);
      used += bytesOf2(l) + 1;
      lines.push(l);
    }
  }
  const queries = [];
  const seen = /* @__PURE__ */ new Set();
  for (const c of skipped.sort((a, b) => a.seq - b.seq)) {
    if (c.query === null || seen.has(c.query)) continue;
    if (bytesOf2(moreLine([...queries, c.query], prefix)) - emptyMoreBytes > budget - used) break;
    queries.push(c.query);
    seen.add(c.query);
  }
  lines.push(moreLine(queries, prefix), STATE_CLOSE_TAG);
  return lines.join("\n");
}

// src/core/index/chunk.ts
var VOID_TAGS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var RAW_TAGS = /* @__PURE__ */ new Set(["script", "style"]);
var encoder = new TextEncoder();
function chunkText(text, kind, maxBytes = MAX_CHUNK_BYTES) {
  const src = normalize(text);
  if (src.length === 0) return [];
  const cap = Math.max(4, Math.min(MAX_CHUNK_BYTES, Math.floor(maxBytes)));
  if (kind === "md") return mdChunks(src, cap, cap < MAX_CHUNK_BYTES);
  const blocks = kind === "html" ? htmlBlocks(src) : lineBlocks(src, false);
  return merge(src, blocks, kind !== "text", cap, cap < MAX_CHUNK_BYTES);
}
function mdChunks(src, cap, lineCut) {
  const out = [];
  const stack = [];
  let title = "";
  let run = [];
  const push2 = (text, bytes4) => {
    out.push({ ord: out.length, text, bytes: bytes4, title });
  };
  const flush = () => {
    if (run.length === 0) return;
    for (const c of merge(src, run, true, cap, lineCut)) push2(c.text, c.bytes);
    run = [];
  };
  for (const b of lineBlocks(src, true)) {
    if (b.heading !== void 0) {
      flush();
      while (stack.length > 0 && stack[stack.length - 1].level >= b.heading.level) stack.pop();
      stack.push(b.heading);
      title = stack.map((h) => h.text).join(" > ");
    }
    if (b.fence !== void 0 && utf8Bytes(src.slice(b.start, b.end)) > cap) {
      const pieces = fencePieces(src, b, b.fence, cap);
      if (pieces !== void 0) {
        flush();
        for (const p of pieces) push2(p, utf8Bytes(p));
        continue;
      }
    }
    run.push(b);
  }
  flush();
  return out;
}
function fencePieces(src, b, f, cap) {
  const opener = src.slice(b.start, f.openEnd);
  const closer = f.closeStart >= 0 ? src.slice(f.closeStart, b.end) : f.fence;
  const innerEnd = f.closeStart >= 0 ? Math.max(f.openEnd + 1, f.closeStart - 1) : b.end;
  const inner = src.slice(Math.min(f.openEnd + 1, innerEnd), innerEnd);
  const room = cap - utf8Bytes(opener) - utf8Bytes(closer) - 2;
  if (room < 16 || inner.length === 0) return void 0;
  return merge(inner, lineBlocks(inner, false), true, room, true).map((c) => opener + "\n" + c.text + "\n" + closer);
}
function normalize(text) {
  const lf = text.split("\r\n").join("\n");
  return lf.startsWith("\uFEFF") ? lf.slice(1) : lf;
}
function lineBlocks(src, md) {
  const out = [];
  let start = -1;
  let end = -1;
  let inTable = false;
  let fence = "";
  let heading;
  let fenceInfo;
  const close = () => {
    if (start >= 0) {
      const span = { start, end };
      if (heading !== void 0) span.heading = heading;
      if (fenceInfo !== void 0) span.fence = fenceInfo;
      out.push(span);
    }
    start = -1;
    heading = void 0;
    fenceInfo = void 0;
  };
  const add = (from, to, table) => {
    if (start < 0) start = from;
    end = to;
    inTable = table;
  };
  let pos = 0;
  while (pos <= src.length) {
    const nl = src.indexOf("\n", pos);
    const eol = nl < 0 ? src.length : nl;
    const line = src.slice(pos, eol);
    if (fence !== "") {
      add(pos, eol, false);
      if (closesFence(line, fence)) {
        fence = "";
        if (md && fenceInfo !== void 0) {
          fenceInfo.closeStart = pos;
          close();
        }
      }
    } else if (line.length === 0) {
      close();
    } else {
      const opener = md ? fenceOf(line) : "";
      const head = md && opener === "" ? headingOf(line) : void 0;
      const table = md && opener === "" && head === void 0 && line.includes("|");
      if (md && start >= 0 && (table !== inTable || opener !== "" || head !== void 0)) close();
      add(pos, eol, table);
      fence = opener;
      if (opener !== "") fenceInfo = { fence: opener, openEnd: eol, closeStart: -1 };
      if (head !== void 0) {
        heading = head;
        close();
      }
    }
    pos = eol + 1;
  }
  close();
  return out;
}
function hasMdStructure(text) {
  let pos = 0;
  while (pos <= text.length) {
    const nl = text.indexOf("\n", pos);
    const eol = nl < 0 ? text.length : nl;
    const line = text.slice(pos, eol).replace("\r", "");
    if (fenceOf(line) !== "" || headingOf(line) !== void 0) return true;
    pos = eol + 1;
  }
  return false;
}
function headingOf(line) {
  let i = 0;
  while (i < line.length && i < 4 && line[i] === " ") i += 1;
  if (i > 3) return void 0;
  let level = 0;
  while (i + level < line.length && line[i + level] === "#") level += 1;
  if (level < 1 || level > 6) return void 0;
  const after = line[i + level];
  if (after !== void 0 && after !== " " && after !== "	") return void 0;
  let text = line.slice(i + level).trim();
  let k = text.length;
  while (k > 0 && text[k - 1] === "#") k -= 1;
  if (k === 0) text = "";
  else if (k < text.length && (text[k - 1] === " " || text[k - 1] === "	")) text = text.slice(0, k).trim();
  return { level, text };
}
function fenceOf(line) {
  const t = line.trimStart();
  if (!t.startsWith("```") && !t.startsWith("~~~")) return "";
  let n = 0;
  while (n < t.length && t[n] === t[0]) n += 1;
  return t.slice(0, n);
}
function closesFence(line, fence) {
  const t = line.trim();
  if (t.length < fence.length) return false;
  for (let i = 0; i < t.length; i += 1) if (t[i] !== fence[0]) return false;
  return true;
}
function htmlBlocks(src) {
  const out = [];
  const open = /* @__PURE__ */ new Map();
  let depth = 0;
  let blockStart = 0;
  let i = 0;
  const split = (at2) => {
    pushTrimmed(out, src, blockStart, at2);
    blockStart = at2;
  };
  while (i < src.length) {
    if (src[i] !== "<") {
      i += 1;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + "<!--".length);
      i = e < 0 ? src.length : e + "-->".length;
      continue;
    }
    const tag2 = readTag(src, i);
    if (tag2 === void 0) {
      i += 1;
      continue;
    }
    i = tag2.end;
    if (tag2.close) {
      const n = open.get(tag2.name) ?? 0;
      if (n === 0) continue;
      open.set(tag2.name, n - 1);
      depth -= 1;
      if (depth === 0) split(i);
      continue;
    }
    if (tag2.selfClose || VOID_TAGS.has(tag2.name)) continue;
    if (RAW_TAGS.has(tag2.name)) {
      i = rawEnd(src, i, tag2.name);
      if (depth === 0) split(i);
      continue;
    }
    open.set(tag2.name, (open.get(tag2.name) ?? 0) + 1);
    depth += 1;
  }
  pushTrimmed(out, src, blockStart, src.length);
  return out;
}
function isLetter(c) {
  return c >= "a" && c <= "z" || c >= "A" && c <= "Z";
}
function isNameChar(c) {
  return isLetter(c) || c >= "0" && c <= "9" || c === "-" || c === ":";
}
function readTag(src, i) {
  let j = i + 1;
  const close = src[j] === "/";
  if (close) j += 1;
  if (j >= src.length || !isLetter(src[j])) return void 0;
  const nameStart = j;
  while (j < src.length && isNameChar(src[j])) j += 1;
  const name = src.slice(nameStart, j).toLowerCase();
  let quote = "";
  while (j < src.length) {
    const c = src[j];
    if (quote !== "") {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      break;
    }
    j += 1;
  }
  if (j >= src.length) return void 0;
  return { name, close, selfClose: src[j - 1] === "/", end: j + 1 };
}
function rawEnd(src, from, name) {
  let k = src.indexOf("</", from);
  while (k >= 0) {
    const after = k + "</".length + name.length;
    const named = src.slice(k + "</".length, after).toLowerCase() === name;
    if (named && (after >= src.length || !isNameChar(src[after]))) {
      const gt = src.indexOf(">", after);
      return gt < 0 ? src.length : gt + 1;
    }
    k = src.indexOf("</", k + "</".length);
  }
  return src.length;
}
function isSpace(c) {
  return c === " " || c === "\n" || c === "	" || c === "\f" || c === "\r";
}
function pushTrimmed(out, src, start, end) {
  let s = start;
  let e = end;
  while (s < e && isSpace(src[s])) s += 1;
  while (e > s && isSpace(src[e - 1])) e -= 1;
  if (s < e) out.push({ start: s, end: e });
}
function utf8Bytes(s) {
  return Buffer.byteLength(s, "utf8");
}
function cutPoint(src, start, end, scratch) {
  let limit = Math.min(end, start + scratch.length);
  if (limit < end && [...src.slice(limit - 1, limit + 1)].length === 1) limit -= 1;
  const r = encoder.encodeInto(src.slice(start, limit), scratch);
  return { end: start + r.read, written: r.written };
}
function merge(src, blocks, join23, cap, lineCut) {
  const out = [];
  const scratch = new Uint8Array(cap);
  let wide;
  let cur;
  let curBytes = 0;
  const emit = (start, end, bytes4) => {
    out.push({ ord: out.length, text: src.slice(start, end), bytes: bytes4 });
  };
  for (const b of blocks) {
    if (cur !== void 0 && !join23) {
      emit(cur.start, cur.end, curBytes);
      cur = void 0;
    }
    if (cur !== void 0) {
      const add = utf8Bytes(src.slice(cur.end, b.end));
      if (curBytes + add <= cap) {
        cur.end = b.end;
        curBytes += add;
        continue;
      }
      emit(cur.start, cur.end, curBytes);
      cur = void 0;
    }
    let start = b.start;
    let bytes4 = utf8Bytes(src.slice(b.start, b.end));
    while (bytes4 > cap) {
      const cut = cutPoint(src, start, b.end, scratch);
      const nl = lineCut ? src.lastIndexOf("\n", cut.end - 1) : -1;
      if (nl > start) {
        const w = utf8Bytes(src.slice(start, nl + 1));
        emit(start, nl + 1, w);
        start = nl + 1;
        bytes4 -= w;
        continue;
      }
      if (lineCut) {
        const eol = src.indexOf("\n", start);
        const lineEnd = eol < 0 || eol >= b.end ? b.end : eol + 1;
        const w = utf8Bytes(src.slice(start, lineEnd));
        if (w <= MAX_CHUNK_BYTES) {
          emit(start, lineEnd, w);
          start = lineEnd;
          bytes4 -= w;
          continue;
        }
        wide ??= new Uint8Array(MAX_CHUNK_BYTES);
        const big = cutPoint(src, start, lineEnd, wide);
        emit(start, big.end, big.written);
        start = big.end;
        bytes4 -= big.written;
        continue;
      }
      emit(start, cut.end, cut.written);
      start = cut.end;
      bytes4 -= cut.written;
    }
    if (start >= b.end) continue;
    cur = { start, end: b.end };
    curBytes = bytes4;
  }
  if (cur !== void 0) emit(cur.start, cur.end, curBytes);
  return out;
}

// src/core/index/select.ts
var READ_CHUNKS = "SELECT ord, body FROM chunks WHERE source_id = ?";
var READ_LABEL = "SELECT label FROM sources WHERE id = ?";
var SEP = "\n";
var SEP_BYTES = 1;
function selectChunks(db, sourceId, intent, budget) {
  const rows = db.raw.prepare(READ_CHUNKS).all(sourceId);
  if (rows.length === 0) return { text: "", more: null };
  const chunks = rows.map((r) => ({ ord: Number(r.ord), text: r.body, bytes: Buffer.byteLength(r.body, "utf8") }));
  const row5 = db.raw.prepare(READ_LABEL).get(sourceId);
  return select(chunks, intent, budget, row5?.label);
}
function selectChunksInMemory(chunks, intent, budget, source, rankQuery) {
  return select(chunks, intent, budget, source, rankQuery);
}
function select(chunks, intent, budget, label, rankQuery) {
  if (chunks.length === 0) return { text: "", more: null };
  const texts = chunks.map((c) => c.text);
  const scores = rankQuery === void 0 ? rankTexts(texts, intent) : rankTexts(texts, rankQuery, "any");
  const order = chunks.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || chunks[b].ord - chunks[a].ord);
  const picked = [];
  let used = 0;
  let skipped = false;
  for (const i of order) {
    const cost = chunks[i].bytes + (picked.length > 0 ? SEP_BYTES : 0);
    if (used + cost > budget) {
      skipped = true;
      continue;
    }
    picked.push(chunks[i]);
    used += cost;
  }
  picked.sort((a, b) => a.ord - b.ord);
  const text = picked.map((c) => c.text).join(SEP);
  return { text, more: skipped ? moreLine2(intent, label) : null };
}
function moreLine2(intent, label) {
  const source = label === void 0 ? "" : ", source:" + JSON.stringify(label);
  const query = Buffer.byteLength(intent, "utf8") > ECHO_MAX_BYTES ? "..." : JSON.stringify(intent);
  return "ctx_search({queries:[" + query + "]" + source + "})";
}

// src/core/index/shape.ts
var SHAPE_MIN_ROWS = 20;
var SHAPE_RARE_MAX = 2;
var SHAPE_RARE_UNITS_MAX = 9;
var SHAPE_CATEGORICAL_MAX = 8;
var SHAPE_DOMINANT = 0.9;
var SHAPE_SIMILARITY = 0.5;
var SHAPE_MAX_CLUSTERS = 64;
var SHAPE_EXTREME_KEYS = 2;
var SHAPE_COMMON_MAX = 4;
var SEP2 = "\n";
var ABSENT = "(absent)";
var bytes = (s) => Buffer.byteLength(s, "utf8");
function shapeDigest(text, query, budget) {
  const shape = jsonShape(text, query) ?? jsonExtremes(text, query) ?? lineShape(text);
  if (shape === null || query.trim() === "") return null;
  const scores = shape.direct === true ? shape.units.map(() => 1) : rankTexts(shape.units.map((u) => u.rank), query, "any");
  const order = shape.units.map((_, i) => i).filter((i) => scores[i] > 0).sort((a, b) => scores[b] - scores[a] || shape.units[a].pos - shape.units[b].pos);
  const picked = [];
  let used = 0;
  for (const i of order) {
    const sep4 = picked.length > 0 ? bytes(SEP2) : 0;
    const r = shape.units[i].render(budget - used - sep4);
    if (r === null || used + sep4 + bytes(r) > budget) continue;
    picked.push({ pos: shape.units[i].pos, text: r });
    used += sep4 + bytes(r);
  }
  if (picked.length === 0) return null;
  picked.sort((a, b) => a.pos - b.pos);
  const body = picked.map((p) => p.text);
  if (used + bytes(SEP2) + bytes(shape.header) <= budget) body.unshift(shape.header);
  return body.join(SEP2);
}
function firstNonSpace(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== " " && c !== "\n" && c !== "\r" && c !== "	") return c;
  }
  return "";
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function rareOfSkewed(n, counts, totals) {
  if (totals.size < 2 || totals.size > SHAPE_CATEGORICAL_MAX) return [];
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (totals.size <= SHAPE_RARE_MAX + 1) {
    if (sorted[0][1] < SHAPE_DOMINANT * n || n - sorted[0][1] > SHAPE_RARE_MAX) return [];
    return sorted.slice(1).flatMap(([v]) => counts.get(v) ?? []);
  }
  const common = sorted.filter(([, c]) => c > SHAPE_RARE_MAX);
  const oneOff = sorted.filter(([, c]) => c <= SHAPE_RARE_MAX);
  if (common.length < 2 || oneOff.length === 0) return [];
  return oneOff.flatMap(([v]) => counts.get(v) ?? []);
}
function jsonRows(text) {
  if (firstNonSpace(text) !== "[") return null;
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < SHAPE_MIN_ROWS || !rows.every(isPlainObject)) return null;
  const objs = rows;
  const keys = [];
  const seen = /* @__PURE__ */ new Set();
  for (const o of objs) for (const k of Object.keys(o)) if (!seen.has(k)) {
    seen.add(k);
    keys.push(k);
  }
  return { objs, keys };
}
var schemaOf = (n, keys) => n + " objects {" + keys.join(",") + "}";
function jsonShape(text, query) {
  const parsedRows = jsonRows(text);
  if (parsedRows === null) return null;
  const { objs, keys } = parsedRows;
  const outliers = /* @__PURE__ */ new Map();
  for (const k of keys) {
    const counts = /* @__PURE__ */ new Map();
    const totals = /* @__PURE__ */ new Map();
    let scalar = true;
    for (let i = 0; i < objs.length && scalar; i++) {
      const v = k in objs[i] ? objs[i][k] : void 0;
      if (typeof v === "object" && v !== null) {
        scalar = false;
        break;
      }
      const s = v === void 0 ? ABSENT : JSON.stringify(v);
      totals.set(s, (totals.get(s) ?? 0) + 1);
      const at2 = counts.get(s) ?? [];
      if (at2.length <= SHAPE_RARE_MAX) at2.push(i);
      counts.set(s, at2);
      if (totals.size > SHAPE_CATEGORICAL_MAX) break;
    }
    if (!scalar) continue;
    for (const i of rareOfSkewed(objs.length, counts, totals)) outliers.set(i, [...outliers.get(i) ?? [], k]);
  }
  if (outliers.size === 0 || outliers.size > SHAPE_RARE_UNITS_MAX) return null;
  const keyScore = rankTexts(keys, query, "any");
  const named = new Set(keys.filter((_, i) => keyScore[i] > 0));
  const units = [...outliers.entries()].map(([i, skewed]) => ({
    pos: i,
    rank: JSON.stringify(objs[i]),
    render: (budget) => renderRow(i, objs[i], skewed, named, budget)
  }));
  return { header: schemaOf(objs.length, keys) + ", " + outliers.size + " rare:", units };
}
function renderRow(i, row5, skewed, named, budget) {
  const prefix = "[" + i + "] ";
  const body = fitRow(row5, skewed, named, budget - bytes(prefix));
  return body === null ? null : prefix + body;
}
function fitRow(row5, skewed, named, budget) {
  const whole = JSON.stringify(row5);
  if (bytes(whole) <= budget) return whole;
  const own2 = Object.keys(row5);
  const tier = (k) => skewed.includes(k) ? 0 : named.has(k) ? 1 : typeof row5[k] !== "object" || row5[k] === null ? 2 : 3;
  const order = [...own2].sort((a, b) => tier(a) - tier(b) || own2.indexOf(a) - own2.indexOf(b));
  const field = (k) => JSON.stringify(k) + ":" + JSON.stringify(row5[k]);
  const chosen = /* @__PURE__ */ new Set();
  let used = 2;
  for (const k of order) {
    const cost = bytes(field(k)) + (chosen.size > 0 ? 1 : 0);
    if (used + cost > budget) continue;
    chosen.add(k);
    used += cost;
  }
  if (!skewed.every((k) => chosen.has(k))) return null;
  return "{" + own2.filter((k) => chosen.has(k)).map(field).join(",") + "}";
}
function namedKeys(keys, query) {
  const score = rankTexts(keys, query, "any");
  return new Set(keys.filter((_, i) => score[i] > 0));
}
function jsonExtremes(text, query) {
  const parsedRows = jsonRows(text);
  if (parsedRows === null) return null;
  const { objs, keys } = parsedRows;
  const named = namedKeys(keys, query);
  const picks = /* @__PURE__ */ new Map();
  let used = 0;
  for (const k of keys) {
    if (!named.has(k) || used >= SHAPE_EXTREME_KEYS) continue;
    if (!objs.every((o) => typeof o[k] === "number" && Number.isFinite(o[k]))) continue;
    let hi = 0, lo = 0;
    for (let i = 1; i < objs.length; i++) {
      if (objs[i][k] > objs[hi][k]) hi = i;
      if (objs[i][k] < objs[lo][k]) lo = i;
    }
    if (hi === lo) continue;
    used++;
    picks.set(hi, k);
    picks.set(lo, k);
  }
  if (picks.size === 0) return null;
  const units = [...picks.entries()].map(([i, k]) => ({
    pos: i,
    rank: "",
    render: (budget) => renderRow(i, objs[i], [k], named, budget)
  }));
  return { header: schemaOf(objs.length, keys) + ", extremes of " + [...new Set(picks.values())].join(",") + ":", units, direct: true };
}
function hasDigit(t) {
  for (let i = 0; i < t.length; i++) if (t[i] >= "0" && t[i] <= "9") return true;
  return false;
}
function similarity(tpl, toks) {
  let same = 0;
  for (let i = 0; i < tpl.length; i++) if (tpl[i] === toks[i] || tpl[i] === "<*>" || toks[i] === "<*>") same++;
  return same / tpl.length;
}
function lineShape(text) {
  const all = text.split("\n");
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  if (all.length < SHAPE_MIN_ROWS) return null;
  const groups = /* @__PURE__ */ new Map();
  const clusters = [];
  for (let n = 0; n < all.length; n++) {
    const raw = all[n].split(" ").filter((t) => t !== "");
    const toks = raw.map((t) => hasDigit(t) ? "<*>" : t);
    const key = toks.length + " " + (toks[0] ?? "");
    const group = groups.get(key) ?? [];
    let hit;
    for (const c of group) if (similarity(c.tpl, toks) >= SHAPE_SIMILARITY) {
      hit = c;
      break;
    }
    if (hit === void 0) {
      hit = { tpl: [...toks], count: 0, lines: [], pos: raw.map(() => ({ counts: /* @__PURE__ */ new Map(), totals: /* @__PURE__ */ new Map() })) };
      group.push(hit);
      groups.set(key, group);
      clusters.push(hit);
      if (clusters.length > SHAPE_MAX_CLUSTERS) return null;
    } else {
      for (let i = 0; i < hit.tpl.length; i++) if (hit.tpl[i] !== toks[i]) hit.tpl[i] = "<*>";
    }
    hit.count++;
    if (hit.lines.length <= SHAPE_RARE_MAX) hit.lines.push(n);
    for (let i = 0; i < hit.pos.length; i++) {
      const p = hit.pos[i];
      if (p === null) continue;
      p.totals.set(raw[i], (p.totals.get(raw[i]) ?? 0) + 1);
      const at2 = p.counts.get(raw[i]) ?? [];
      if (at2.length <= SHAPE_RARE_MAX) at2.push(n);
      p.counts.set(raw[i], at2);
      if (p.totals.size > SHAPE_RARE_MAX + 1) hit.pos[i] = null;
    }
  }
  const common = clusters.filter((c) => c.count > SHAPE_RARE_MAX);
  if (common.length === 0 || common.length > SHAPE_COMMON_MAX) return null;
  if (common.some((c) => c.tpl.every((t) => t === "<*>"))) return null;
  const rare = new Set(clusters.filter((c) => c.count <= SHAPE_RARE_MAX).flatMap((c) => c.lines));
  for (const c of common) for (const p of c.pos) if (p !== null) for (const n of rareOfSkewed(c.count, p.counts, p.totals)) rare.add(n);
  if (rare.size === 0 || rare.size > SHAPE_RARE_UNITS_MAX) return null;
  const header = all.length + " lines, " + rare.size + " rare:";
  const units = [...rare].sort((a, b) => a - b).map((n) => {
    const line = n + 1 + ": " + all[n];
    return { pos: n, rank: all[n], render: (budget) => bytes(line) <= budget ? line : null };
  });
  return { header, units };
}

// src/core/index/text.ts
function storeText(db, project, sessionId, sourceKind, label, text, kind, chunks = chunkText(text, kind)) {
  const sourceId = ftsInsert(db, {
    projectKey: project.projectKey,
    sessionId,
    worktree: project.worktree,
    agent: project.agent,
    kind: sourceKind,
    label,
    bytes: Buffer.byteLength(text, "utf8"),
    chunkCount: chunks.length,
    createdAt: Date.now()
  }, chunks);
  return { sourceId, chunks: chunks.length };
}
function indexText(db, ctx, sessionId, source, text, kind, chunks) {
  return storeText(db, ctx, sessionId, "content", source, text, kind, chunks);
}

// src/core/hooks/detached.ts
async function write(project, row5) {
  try {
    const db = await openDb(project);
    appendEvent(db, row5);
  } catch (err) {
    const message3 = err instanceof Error ? err.message : String(err);
    process.stderr.write("hooks: journal write failed: " + message3 + "\n");
  }
}
function appendDetached(project, sessionId, row5) {
  void write(project, row5);
}

// src/core/hooks/handle-query.ts
function askedWords(intent, prompt, text) {
  const want = new Set(wordTokens(prompt.toLowerCase()));
  for (const w of wordTokens(intent.toLowerCase())) want.delete(w);
  if (want.size === 0) return "";
  const counts = /* @__PURE__ */ new Map();
  for (const w of wordTokens(text.toLowerCase())) {
    if (want.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const picked = [...counts.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, HANDLE_PROMPT_WORDS).map((e) => e[0]);
  return picked.join(" ");
}

// src/core/hooks/decision.ts
function isObject2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function labelText(v) {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return "";
  return v.filter((x) => typeof x === "string" && x !== "").join(DECISION_LABEL_JOIN);
}
function answerPairs(answers) {
  if (Array.isArray(answers)) {
    return answers.filter(isObject2).filter((a) => typeof a.question === "string").map((a) => [a.question, a.label]);
  }
  return isObject2(answers) ? Object.entries(answers) : [];
}
function answerDecisions(responseText) {
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return [];
  }
  if (!isObject2(parsed)) return [];
  const out = [];
  for (const [question, value] of answerPairs(parsed[DECISION_ANSWERS_KEY])) {
    const label = labelText(value);
    if (question === "" || label === "") continue;
    out.push({ key: question, body: "Q: " + question + " \u2192 A: " + label });
  }
  return out;
}
function askOptionLabels(toolInput) {
  const questions = toolInput.questions;
  if (!Array.isArray(questions)) return [];
  const out = [];
  for (const q of questions) {
    if (!isObject2(q) || !Array.isArray(q.options)) continue;
    for (const o of q.options) if (isObject2(o) && typeof o.label === "string" && o.label !== "") out.push(o.label);
  }
  return out;
}
function fold(s) {
  return s.trim().toLowerCase();
}
function optionEchoDecision(prompt, labels, refSeq) {
  const p = fold(prompt);
  if (p === "") return null;
  const label = labels.find((l) => fold(l) === p);
  if (label === void 0) return null;
  return { key: DECISION_OPTION_KEY, body: "A: " + label + "\nref: #" + refSeq };
}

// src/core/hooks/throttle.ts
function markerKey(sessionId, onceKey) {
  return "hint:" + sessionId + ":" + onceKey;
}
function takeOnce(db, key) {
  if (metaGet(db, key) !== null) return false;
  metaSet(db, key, "1");
  return true;
}
function takeEvery(db, key, everyN) {
  const stored = metaGet(db, key);
  const count = (stored === null ? 0 : Number.parseInt(stored, 10)) + 1;
  metaSet(db, key, String(count));
  return (count - 1) % everyN === 0;
}
function shouldHint(db, sessionId, onceKey, everyN) {
  if (sessionId === "") return false;
  const key = markerKey(sessionId, onceKey);
  const decide2 = (h) => everyN === void 0 ? takeOnce(h, key) : takeEvery(h, key, everyN);
  return db.raw.isTransaction ? decide2(db) : withWrite(db, decide2);
}

// src/core/hooks/fallback.ts
import { join as join5, resolve as resolve3 } from "node:path";
var fs = process.getBuiltinModule("node:fs");
function isRec(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function firstString(o, keys) {
  for (const k of keys) if (typeof o[k] === "string") return o[k];
  return "";
}
function inputOf(o) {
  for (const k of HOOK_FAIL_INPUT_KEYS) {
    let v = o[k];
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        v = void 0;
      }
    }
    if (isRec(v)) return v;
  }
  return {};
}
function homeOf(env) {
  return env.HOME ?? env.USERPROFILE ?? "";
}
function hookLogPath(env) {
  const home = homeOf(env);
  return home === "" ? "" : join5(home, DATA_ROOT.slice(1), HOOK_ERROR_LOG_FILE);
}
function errorLabel(err) {
  const code = isRec(err) ? err.code : void 0;
  if (typeof code === "string" && code !== "") return code;
  return err instanceof Error ? err.name : "Error";
}
function logHookError(env, agent, stage, err) {
  try {
    const file2 = hookLogPath(env);
    if (file2 === "") return;
    fs.mkdirSync(join5(file2, ".."), { recursive: true });
    const line = JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      agent,
      stage,
      label: errorLabel(err),
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack ?? "" : ""
    });
    fs.appendFileSync(file2, line + "\n");
  } catch {
    process.stderr.write("hooks: " + stage + " failed: " + (err instanceof Error ? err.message : String(err)) + "\n");
  }
}
function lastHookError(env) {
  try {
    const file2 = hookLogPath(env);
    if (file2 === "" || !fs.existsSync(file2)) return null;
    const fd = fs.openSync(file2, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - HOOK_LOG_TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const j = JSON.parse(lines[i] ?? "");
          if (typeof j.ts === "string" && typeof j.stage === "string" && typeof j.label === "string") return { ts: j.ts, stage: j.stage, label: j.label };
        } catch {
        }
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}
var fired = false;
function fault(env, stage) {
  if (fired || env[HOOK_FAULT_ENV] !== stage) return;
  fired = true;
  throw new Error("injected fault at " + stage);
}
function nodeTooOld(version2) {
  const a = (version2.startsWith("v") ? version2.slice(1) : version2).split(".");
  const b = NODE_MIN.split(".");
  for (let i = 0; i < b.length; i++) {
    const x = Number(a[i] ?? 0) || 0;
    const y = Number(b[i]);
    if (x !== y) return x < y;
  }
  return false;
}
function has2(list3, name) {
  return list3 !== void 0 && list3.some((n) => n.toLowerCase() === name);
}
function kindOf(row5, name) {
  const n = name.toLowerCase();
  if (has2(row5.nativeTools.shell, n) || has2(HOOK_FAIL_TOOLS.shell, n)) return "shell";
  if (has2(row5.nativeTools.read, n) || has2(HOOK_FAIL_TOOLS.read, n)) return "read";
  if (has2(row5.nativeTools.grep, n) || has2(HOOK_FAIL_TOOLS.grep, n)) return "grep";
  if (has2(row5.nativeTools.webfetch, n) || has2(HOOK_FAIL_TOOLS.fetch, n)) return "fetch";
  return null;
}
function isPreTool(row5, event) {
  const e = event.toLowerCase();
  return HOOK_FAIL_PRE_EVENTS.includes(e) || (row5.eventMap.PreToolUse ?? "").toLowerCase() === e;
}
function bigRead(input, cwd) {
  if ((input.offset ?? null) !== null || (input.limit ?? null) !== null) return false;
  const p = firstString(input, READ_PATH_KEYS);
  if (p === "") return false;
  try {
    const st = fs.statSync(resolve3(cwd, p));
    return st.isFile() && st.size > OUTPUT_CAP;
  } catch {
    return false;
  }
}
function failureOutput(agent, raw, err, cwdFallback = "") {
  const row5 = getAdapter(agent);
  const allow = () => row5.encode({ event: "PreToolUse", agent, sessionId: "", cwd: "", turn: 0 }, { kind: "allow" });
  try {
    if (!isRec(raw)) return allow();
    if (!isPreTool(row5, firstString(raw, HOOK_FAIL_EVENT_KEYS))) return allow();
    const name = firstString(raw, HOOK_FAIL_TOOL_KEYS);
    if (name === "" || name.includes(OWN_TOOL_PREFIX)) return allow();
    const kind = kindOf(row5, name);
    if (kind === null) return allow();
    const cwd = firstString(raw, HOOK_FAIL_CWD_KEYS) || cwdFallback;
    if (kind === "read" && !bigRead(inputOf(raw), cwd)) return allow();
    const redirect = kind === "read" ? HOOK_FAIL_REDIRECT.read : HOOK_FAIL_REDIRECT[kind];
    const reason = prefixToolNames(redirect, row5.toolNamePrefix) + "\n" + HOOK_FAIL_LINE(errorLabel(err), row5.toolNamePrefix);
    return row5.encode({ event: "PreToolUse", agent, sessionId: "", cwd, turn: 0 }, { kind: "deny", reason });
  } catch {
    return { stdout: "", exitCode: 0 };
  }
}

// src/core/hooks/io.ts
var { read: read2, writeSync } = process.getBuiltinModule("node:fs");

// src/core/hooks/dispatch.ts
var { readFileSync: readFileSync4 } = process.getBuiltinModule("node:fs");
var ALLOW2 = { kind: "allow" };
var EMPTY4 = { stdout: "", exitCode: 0 };
var DIGIT_0 = 48;
function isAgentId(s) {
  return AGENT_IDS.includes(s);
}
function message(err) {
  return err instanceof Error ? err.message : String(err);
}
function str2(v) {
  return typeof v === "string" ? v : "";
}
async function handleHook(agent, raw, env) {
  if (!isAgentId(agent)) {
    process.stderr.write("hooks: unknown agent " + JSON.stringify(agent) + "\n");
    return EMPTY4;
  }
  const row5 = getAdapter(agent);
  const fail7 = (stage, err, line) => {
    logHookError(env, agent, stage, err);
    process.stderr.write(line ?? "hooks: " + stage + " failed: " + message(err) + "\n");
    return failureOutput(agent, raw, err);
  };
  if (nodeTooOld(process.version)) return fail7("node", new CtxError("NODE_TOO_OLD", { v: process.version }));
  let ev;
  try {
    fault(env, "decode");
    ev = row5.decode(raw);
  } catch (err) {
    return fail7("decode", err);
  }
  let project;
  try {
    fault(env, "project");
    const argv = agent === "vscode" ? [WORKSPACE_FOLDER_FLAG, ev.cwd] : process.argv;
    project = resolveProject(agent, { env, argv, cwd: ev.cwd, piCwd: agent === "pi" ? ev.cwd : void 0 });
  } catch (err) {
    return fail7("project", err, "hooks: no project: " + String(err.code ?? "ERROR") + " " + message(err) + "\n");
  }
  let decision;
  try {
    fault(env, "policy");
    decision = await dispatch(ev, row5, project, env);
  } catch (err) {
    return fail7("store", err);
  }
  try {
    fault(env, "encode");
    return row5.encode(ev, decision);
  } catch (err) {
    return fail7("encode", err);
  }
}
function dispatch(ev, row5, project, env) {
  switch (ev.event) {
    case "SessionStart":
      return sessionStart(ev, row5, project);
    case "UserPromptSubmit":
      return userPromptSubmit(ev, row5, project);
    case "PreToolUse":
      return preToolUse(ev, row5, project, env);
    case "PostToolUse":
      return postToolUse(ev, row5, project, env);
    case "PreCompact":
      return preCompact(ev, row5, project);
    case "Usage":
      return usage(ev, project);
  }
  return Promise.resolve(ALLOW2);
}
function withPrefix(template, row5) {
  return template.split(TOOL_PREFIX_SLOT).join(row5.toolNamePrefix);
}
function compactText(db, ev, row5) {
  if (row5.compactSummary === "host") return prefixToolNames(COMPACT_POINTER_LINE, row5.toolNamePrefix);
  return renderState(readSessionEvents(db, ev.sessionId), ev.turn ?? 0, void 0, row5.toolNamePrefix);
}
async function sessionStart(ev, row5, project) {
  if (ev.source === "compact" && hasRecall(row5)) markCompacted(await openDb(project), ev.sessionId);
  if (ev.source === "compact" && row5.compactDelivery === "sessionstart") {
    const db2 = await openDb(project);
    if (!shouldHint(db2, ev.sessionId, COMPACT_STATE_KEY)) return ALLOW2;
    return { kind: "hint", text: compactText(db2, ev, row5), onceKey: COMPACT_STATE_KEY };
  }
  const db = await openDb(project);
  if (row5.compactDelivery === "opencode-cache" && metaTake(db, PENDING_COMPACT_META_PREFIX + ev.sessionId) !== null) {
    return { kind: "hint", text: compactText(db, ev, row5), onceKey: PENDING_COMPACT_KEY };
  }
  if (!shouldHint(db, ev.sessionId, RESUME_HINT_KEY)) return ALLOW2;
  return { kind: "hint", text: withPrefix(RESUME_HINT, row5), onceKey: RESUME_HINT_KEY };
}
async function userPromptSubmit(ev, row5, project) {
  const body = ev.prompt ?? "";
  const resume = await firstTurnResume(ev, row5, project);
  appendDetached(project, ev.sessionId, {
    session_id: ev.sessionId,
    worktree: project.worktree,
    agent: ev.agent,
    kind: "prompt",
    tool: null,
    key: null,
    path: null,
    ok: 1,
    exit_code: null,
    bytes: Buffer.byteLength(body),
    body,
    turn: ev.turn ?? 0,
    sandbox_bytes: 0,
    returned_bytes: 0
  });
  echoDetached(ev, project, body);
  if (row5.compactDelivery === "pending-flag") {
    const db = await openDb(project);
    if (metaTake(db, PENDING_COMPACT_META_PREFIX + ev.sessionId) !== null) {
      return { kind: "hint", text: compactText(db, ev, row5), onceKey: PENDING_COMPACT_KEY };
    }
  }
  if (resume !== null) return resume;
  return recall(ev, row5, project, body);
}
async function firstTurnResume(ev, row5, project) {
  if (row5.eventMap.SessionStart !== void 0 || ev.sessionId === "") return null;
  const db = await openDb(project);
  if (hasSessionRows(db, ev.sessionId)) return null;
  if (!shouldHint(db, ev.sessionId, RESUME_HINT_KEY)) return null;
  if (!hasAgentRows(db, project.worktree, ev.agent)) return null;
  return { kind: "hint", text: withPrefix(RESUME_HINT, row5), onceKey: RESUME_HINT_KEY };
}
function markCompacted(db, sessionId) {
  if (sessionId !== "") metaSet(db, COMPACTED_META_PREFIX + sessionId, PENDING_COMPACT_FLAG);
}
function seenSeqs(value) {
  if (value === null) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}
function seenUnitKeys(value) {
  if (value === null) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}
async function recall(ev, row5, project, prompt) {
  if (!hasRecall(row5) || ev.sessionId === "") return ALLOW2;
  const db = await openDb(project);
  if (metaGet(db, COMPACTED_META_PREFIX + ev.sessionId) === null) return ALLOW2;
  const seenKey = RECALL_SEEN_META_PREFIX + ev.sessionId;
  const seen = seenSeqs(metaGet(db, seenKey));
  const unitsKey = RECALL_UNITS_SEEN_META_PREFIX + ev.sessionId;
  const seenUnits = seenUnitKeys(metaGet(db, unitsKey));
  const goal = readFirstPrompt(db, ev.sessionId);
  const units = queryUnits(db, ev.sessionId, recallQueryText(prompt, goal), RECALL_UNIT_CANDIDATES);
  const picked = pickRecall(readRecallRows(db, ev.sessionId, project.worktree, RECALL_MAX_ROWS), prompt, new Set(seen), units, new Set(seenUnits));
  if (picked.text === "") return ALLOW2;
  if (picked.seqs.length > 0) metaSet(db, seenKey, JSON.stringify([...seen, ...picked.seqs]));
  if (picked.units !== void 0) metaSet(db, unitsKey, JSON.stringify([...seenUnits, ...picked.units]));
  return { kind: "hint", text: picked.text, onceKey: RECALL_KEY };
}
function optionsKey(sessionId) {
  return DECISION_SOURCE + ":" + DECISION_OPTION_KEY + ":" + sessionId;
}
function readOptions(value) {
  try {
    const v = JSON.parse(value);
    if (typeof v !== "object" || v === null) return null;
    const { seq, labels } = v;
    if (typeof seq !== "number" || !Array.isArray(labels)) return null;
    return { seq, labels: labels.filter((l) => typeof l === "string") };
  } catch {
    return null;
  }
}
function echoDetached(ev, project, prompt) {
  if (ev.sessionId === "") return;
  const key = optionsKey(ev.sessionId);
  void openDb(project).then((db) => {
    if (metaGet(db, key) === null) return;
    const taken = metaTake(db, key);
    const offered = taken === null ? null : readOptions(taken);
    if (offered === null) return;
    const part = optionEchoDecision(prompt, offered.labels, offered.seq);
    if (part !== null) writeDecisions(db, ev, project, [part]);
  }).catch((err) => {
    process.stderr.write("hooks: decision write failed: " + message(err) + "\n");
  });
}
function writeDecisions(db, ev, project, parts) {
  for (const part of parts) {
    appendEvent(db, {
      session_id: ev.sessionId,
      worktree: project.worktree,
      agent: ev.agent,
      kind: "decision",
      tool: DECISION_TOOL,
      key: part.key,
      path: null,
      ok: 1,
      exit_code: null,
      bytes: Buffer.byteLength(part.body),
      body: part.body,
      turn: ev.turn ?? 0,
      sandbox_bytes: 0,
      returned_bytes: 0
    });
    indexText(db, project, ev.sessionId, DECISION_SOURCE, part.body, "text");
  }
}
function askDetached(ev, project, tool, text) {
  const parts = answerDecisions(text);
  const labels = parts.length === 0 ? askOptionLabels(tool.input) : [];
  if (parts.length === 0 && labels.length === 0) return;
  void openDb(project).then((db) => {
    if (parts.length > 0) return writeDecisions(db, ev, project, parts);
    const prompts = readSessionEvents(db, ev.sessionId, "prompt");
    const last2 = prompts[prompts.length - 1];
    if (last2 === void 0 || ev.sessionId === "") return;
    metaSet(db, optionsKey(ev.sessionId), JSON.stringify({ seq: last2.seq, labels }));
  }).catch((err) => {
    process.stderr.write("hooks: decision write failed: " + message(err) + "\n");
  });
}
async function preToolUse(ev, row5, project, env) {
  const userDeny = readUserDeny(project.worktree, ev.agent);
  const decision0 = decide(ev, row5, userDeny);
  let decision = decision0;
  if (decision0.kind === "deny" && isSubagentCall(ev)) {
    const subCase = pickSubagentCase(ev, toolSetForAgentType(ev, { projectDir: project.worktree, env }));
    if (subCase === "B") decision = caseB(ev, row5, decision0, userDeny);
  }
  return decision;
}
function isShell(tool, row5) {
  return tool.canonicalName === SHELL_TOOL || row5.nativeTools.shell.includes(tool.name);
}
function isUserPolicyDeny(reason, row5) {
  return reason.startsWith(USER_DENY_REASON_PREFIX) || reason === prefixToolNames(POLICY_UNREADABLE_LINE, row5.toolNamePrefix) || reason === prefixToolNames(PARSE_ERROR_DENY_LINE, row5.toolNamePrefix);
}
function b64(s) {
  return Buffer.from(s, "utf8").toString("base64url");
}
function caseB(ev, row5, d0, userDeny) {
  const tool = ev.tool;
  if (tool === void 0 || !isShell(tool, row5) || isUserPolicyDeny(d0.reason, row5)) return d0;
  const command = tool.input.command;
  if (typeof command !== "string") return d0;
  const wrapper = '"' + join6(dirname3(process.argv[1] ?? ""), RUN_WRAPPER_FILE) + '"';
  const rewritten = [RUN_WRAPPER_NODE, wrapper, b64(command), b64(JSON.stringify(userDeny ?? [])), b64(str2(tool.input.description))].join(" ");
  return { kind: "deny", reason: SUBAGENT_RUN_DENY, rewritten };
}
function journalKind(tool, row5, isError) {
  if (isError) return "toolerr";
  if (EDIT_TOOLS.includes(tool.canonicalName) || (row5.nativeTools.edit ?? []).includes(tool.name)) return "edit";
  if (isShell(tool, row5)) return "cmd";
  return null;
}
function stableJson(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (typeof v === "object" && v !== null) {
    const o = v;
    const keys = Object.keys(o).filter((k) => o[k] !== void 0).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableJson(o[k])).join(",") + "}";
  }
  return JSON.stringify(v) ?? "null";
}
function exitCodeOf(text) {
  const nl = text.indexOf("\n");
  const first = nl < 0 ? text : text.slice(0, nl);
  if (!first.startsWith(EXIT_CODE_LINE_PREFIX)) return null;
  let n = 0;
  let digits = 0;
  for (const ch of first.slice(EXIT_CODE_LINE_PREFIX.length)) {
    const d = ch.charCodeAt(0) - DIGIT_0;
    if (d < 0 || d > 9) break;
    n = n * 10 + d;
    digits++;
  }
  return digits === 0 ? null : n;
}
function pathOf(input) {
  for (const k of EDIT_PATH_KEYS) if (typeof input[k] === "string") return input[k];
  return null;
}
async function postToolUse(ev, row5, project, env) {
  const tool = ev.tool;
  if (tool === void 0 || tool.canonicalName.startsWith(OWN_TOOL_PREFIX)) return ALLOW2;
  const result = ev.result ?? { isError: false, bytes: 0 };
  const text = wholeOutput(result);
  if (result.persistedPath !== void 0) result.bytes = Buffer.byteLength(text);
  if (tool.canonicalName === DECISION_TOOL) askDetached(ev, project, tool, text);
  const kind = journalKind(tool, row5, result.isError);
  if (kind !== null) {
    const key = kind === "cmd" ? canonicalKey(tool.canonicalName, str2(tool.input.command)) : kind === "toolerr" ? tool.canonicalName + ":" + stableJson(tool.input) : null;
    appendDetached(project, ev.sessionId, {
      // step 4; body is the whole text (D-M3-H2-6)
      session_id: ev.sessionId,
      worktree: project.worktree,
      agent: ev.agent,
      kind,
      tool: tool.canonicalName,
      key,
      path: pathOf(tool.input),
      ok: result.isError ? 0 : 1,
      exit_code: exitCodeOf(text),
      bytes: result.bytes,
      body: text,
      turn: ev.turn ?? 0,
      sandbox_bytes: result.bytes,
      returned_bytes: result.bytes
    });
  }
  if (result.bytes <= REPLACE_TRIGGER_BYTES) return ALLOW2;
  if (result.keep === true) return ALLOW2;
  let label;
  if (isSubagentCall(ev)) {
    const subCase = pickSubagentCase(ev, toolSetForAgentType(ev, { projectDir: project.worktree, env }));
    if (subCase === "A") return ALLOW2;
    label = SUBAGENT_SOURCE_PREFIX + tool.canonicalName + ":" + String(ev.turn ?? 0);
  } else {
    if (!hasReplace(row5)) return ALLOW2;
    label = mainLabel(tool, ev);
  }
  const intent = [tool.input.description, tool.input.command, tool.input.file_path, tool.input.pattern, tool.input.url].map(str2).find((v) => v.trim() !== "") ?? "";
  const chunks = chunkText(text, "text", REPLACE_CHUNK_BYTES);
  const db = await openDb(project);
  let sourceId;
  if (result.bytes <= SYNC_INDEX_MAX_BYTES) {
    sourceId = indexText(db, project, ev.sessionId, label, text, "text", chunks).sourceId;
    insertUnits(db, sourceId, ev.sessionId, buildUnits(text));
  } else {
    sourceId = reserveSource(db, sourceRowOf(project, ev.sessionId, label), chunks);
    indexDetached(project, ev.sessionId, sourceId, label, text, chunks);
  }
  const handle = sourceHandle(sourceId);
  const prompt = await lastPrompt(project, ev.sessionId);
  const rankQuery = prompt.trim() === "" ? void 0 : intent + " " + prompt;
  const handleLine = REPLACE_HANDLE_LINE(intent, handle, result.bytes, row5.toolNamePrefix, askedWords(intent, prompt, text));
  const budget = replaceBudget(handleLine, moreLine2(intent, label));
  const digest = shapeDigest(text, rankQuery ?? intent, SHAPE_RETURN_BYTES);
  if (digest !== null) return { kind: "replace", output: replaceOutput(digest, handleLine) };
  const selected = selectChunksInMemory(chunks, intent, budget, label, rankQuery);
  return { kind: "replace", output: selected.more !== null ? replaceOutput(selected.text, handleLine) : selected.text };
}
function replaceOutput(body, handleLine) {
  return body === "" ? handleLine : body + "\n" + handleLine;
}
function replaceBudget(handleLine, more) {
  return Math.max(0, REPLACE_RETURN_BYTES + Buffer.byteLength("\n" + more) - 1 - Buffer.byteLength(handleLine));
}
function wholeOutput(result) {
  const head = result.text ?? "";
  if (result.persistedPath === void 0) return head;
  try {
    return readFileSync4(result.persistedPath, "utf8");
  } catch {
    return head;
  }
}
async function lastPrompt(project, sessionId) {
  try {
    return readLastPrompt(await openDb(project), sessionId);
  } catch {
    return "";
  }
}
function mainLabel(tool, ev) {
  const cmd = str2(tool.input.command) ?? str2(tool.input.file_path) ?? "";
  const nl = cmd.indexOf("\n");
  const head = (tool.canonicalName + ":" + (nl < 0 ? cmd : cmd.slice(0, nl))).slice(0, SOURCE_LABEL_MAX_CHARS);
  return head + "#" + (tool.callId ?? String(ev.turn ?? 0));
}
function indexDetached(project, sessionId, sourceId, label, text, chunks) {
  void openDb(project).then((db) => {
    finishReserved(db, sourceId, sourceRowOf(project, sessionId, label), chunks, buildUnits(text));
  }).catch((err) => {
    process.stderr.write("hooks: index write failed: " + message(err) + "\n");
  });
}
function sourceRowOf(project, sessionId, label) {
  return { sessionId, worktree: project.worktree, agent: project.agent, kind: "content", label, createdAt: Date.now() };
}
async function preCompact(ev, row5, project) {
  const db = await openDb(project);
  metaSet(db, PENDING_COMPACT_META_PREFIX + ev.sessionId, PENDING_COMPACT_FLAG);
  if (hasRecall(row5)) markCompacted(db, ev.sessionId);
  return ALLOW2;
}
function usage(ev, project) {
  appendDetached(project, ev.sessionId, {
    session_id: ev.sessionId,
    worktree: project.worktree,
    agent: ev.agent,
    kind: "cost",
    tool: null,
    key: null,
    path: null,
    ok: 1,
    exit_code: null,
    bytes: 0,
    body: "",
    turn: ev.turn ?? 0,
    sandbox_bytes: 0,
    returned_bytes: 0
  });
  return Promise.resolve(ALLOW2);
}

// src/core/journal/own-call.ts
function ownJournal() {
  const handles = /* @__PURE__ */ new Map();
  return async (project, ctx, name, reply4) => {
    let opening = handles.get(project.dbPath);
    if (opening === void 0) {
      opening = openDb(project);
      handles.set(project.dbPath, opening);
      opening.catch(() => handles.delete(project.dbPath));
    }
    try {
      appendEvent(await opening, ownCallRow(project, ctx, name, reply4));
    } catch (err) {
      process.stderr.write("context-mode: no journal row: " + (err instanceof Error ? err.message : String(err)) + "\n");
    }
  };
}

// node_modules/zod/v4/classic/external.js
var external_exports = {};
__export(external_exports, {
  $brand: () => $brand,
  $input: () => $input,
  $output: () => $output,
  NEVER: () => NEVER,
  TimePrecision: () => TimePrecision,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBase64: () => ZodBase64,
  ZodBase64URL: () => ZodBase64URL,
  ZodBigInt: () => ZodBigInt,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBoolean: () => ZodBoolean,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCUID: () => ZodCUID,
  ZodCUID2: () => ZodCUID2,
  ZodCatch: () => ZodCatch,
  ZodCustom: () => ZodCustom,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodE164: () => ZodE164,
  ZodEmail: () => ZodEmail,
  ZodEmoji: () => ZodEmoji,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFile: () => ZodFile,
  ZodGUID: () => ZodGUID,
  ZodIPv4: () => ZodIPv4,
  ZodIPv6: () => ZodIPv6,
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodJWT: () => ZodJWT,
  ZodKSUID: () => ZodKSUID,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNanoID: () => ZodNanoID,
  ZodNever: () => ZodNever,
  ZodNonOptional: () => ZodNonOptional,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodPipe: () => ZodPipe,
  ZodPrefault: () => ZodPrefault,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRealError: () => ZodRealError,
  ZodRecord: () => ZodRecord,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodStringFormat: () => ZodStringFormat,
  ZodSuccess: () => ZodSuccess,
  ZodSymbol: () => ZodSymbol,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodTransform: () => ZodTransform,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodULID: () => ZodULID,
  ZodURL: () => ZodURL,
  ZodUUID: () => ZodUUID,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  ZodXID: () => ZodXID,
  _ZodString: () => _ZodString,
  _default: () => _default2,
  any: () => any,
  array: () => array,
  base64: () => base642,
  base64url: () => base64url2,
  bigint: () => bigint2,
  boolean: () => boolean2,
  catch: () => _catch2,
  check: () => check,
  cidrv4: () => cidrv42,
  cidrv6: () => cidrv62,
  clone: () => clone,
  coerce: () => coerce_exports,
  config: () => config,
  core: () => core_exports2,
  cuid: () => cuid3,
  cuid2: () => cuid22,
  custom: () => custom,
  date: () => date3,
  discriminatedUnion: () => discriminatedUnion,
  e164: () => e1642,
  email: () => email2,
  emoji: () => emoji2,
  endsWith: () => _endsWith,
  enum: () => _enum2,
  file: () => file,
  flattenError: () => flattenError,
  float32: () => float32,
  float64: () => float64,
  formatError: () => formatError2,
  function: () => _function,
  getErrorMap: () => getErrorMap,
  globalRegistry: () => globalRegistry,
  gt: () => _gt,
  gte: () => _gte,
  guid: () => guid2,
  includes: () => _includes,
  instanceof: () => _instanceof,
  int: () => int,
  int32: () => int32,
  int64: () => int64,
  intersection: () => intersection,
  ipv4: () => ipv42,
  ipv6: () => ipv62,
  iso: () => iso_exports,
  json: () => json,
  jwt: () => jwt,
  keyof: () => keyof,
  ksuid: () => ksuid2,
  lazy: () => lazy,
  length: () => _length,
  literal: () => literal,
  locales: () => locales_exports,
  looseObject: () => looseObject,
  lowercase: () => _lowercase,
  lt: () => _lt,
  lte: () => _lte,
  map: () => map,
  maxLength: () => _maxLength,
  maxSize: () => _maxSize,
  mime: () => _mime,
  minLength: () => _minLength,
  minSize: () => _minSize,
  multipleOf: () => _multipleOf,
  nan: () => nan,
  nanoid: () => nanoid2,
  nativeEnum: () => nativeEnum,
  negative: () => _negative,
  never: () => never,
  nonnegative: () => _nonnegative,
  nonoptional: () => nonoptional,
  nonpositive: () => _nonpositive,
  normalize: () => _normalize,
  null: () => _null3,
  nullable: () => nullable,
  nullish: () => nullish2,
  number: () => number2,
  object: () => object,
  optional: () => optional,
  overwrite: () => _overwrite,
  parse: () => parse2,
  parseAsync: () => parseAsync2,
  partialRecord: () => partialRecord,
  pipe: () => pipe,
  positive: () => _positive,
  prefault: () => prefault,
  preprocess: () => preprocess,
  prettifyError: () => prettifyError,
  promise: () => promise,
  property: () => _property,
  readonly: () => readonly,
  record: () => record3,
  refine: () => refine,
  regex: () => _regex,
  regexes: () => regexes_exports,
  registry: () => registry,
  safeParse: () => safeParse2,
  safeParseAsync: () => safeParseAsync2,
  set: () => set,
  setErrorMap: () => setErrorMap,
  size: () => _size,
  startsWith: () => _startsWith,
  strictObject: () => strictObject,
  string: () => string2,
  stringFormat: () => stringFormat,
  stringbool: () => stringbool,
  success: () => success,
  superRefine: () => superRefine,
  symbol: () => symbol,
  templateLiteral: () => templateLiteral,
  toJSONSchema: () => toJSONSchema,
  toLowerCase: () => _toLowerCase,
  toUpperCase: () => _toUpperCase,
  transform: () => transform,
  treeifyError: () => treeifyError,
  trim: () => _trim,
  tuple: () => tuple,
  uint32: () => uint32,
  uint64: () => uint64,
  ulid: () => ulid2,
  undefined: () => _undefined3,
  union: () => union,
  unknown: () => unknown,
  uppercase: () => _uppercase,
  url: () => url,
  uuid: () => uuid2,
  uuidv4: () => uuidv4,
  uuidv6: () => uuidv6,
  uuidv7: () => uuidv7,
  void: () => _void2,
  xid: () => xid2
});

// node_modules/zod/v4/core/index.js
var core_exports2 = {};
__export(core_exports2, {
  $ZodAny: () => $ZodAny,
  $ZodArray: () => $ZodArray,
  $ZodAsyncError: () => $ZodAsyncError,
  $ZodBase64: () => $ZodBase64,
  $ZodBase64URL: () => $ZodBase64URL,
  $ZodBigInt: () => $ZodBigInt,
  $ZodBigIntFormat: () => $ZodBigIntFormat,
  $ZodBoolean: () => $ZodBoolean,
  $ZodCIDRv4: () => $ZodCIDRv4,
  $ZodCIDRv6: () => $ZodCIDRv6,
  $ZodCUID: () => $ZodCUID,
  $ZodCUID2: () => $ZodCUID2,
  $ZodCatch: () => $ZodCatch,
  $ZodCheck: () => $ZodCheck,
  $ZodCheckBigIntFormat: () => $ZodCheckBigIntFormat,
  $ZodCheckEndsWith: () => $ZodCheckEndsWith,
  $ZodCheckGreaterThan: () => $ZodCheckGreaterThan,
  $ZodCheckIncludes: () => $ZodCheckIncludes,
  $ZodCheckLengthEquals: () => $ZodCheckLengthEquals,
  $ZodCheckLessThan: () => $ZodCheckLessThan,
  $ZodCheckLowerCase: () => $ZodCheckLowerCase,
  $ZodCheckMaxLength: () => $ZodCheckMaxLength,
  $ZodCheckMaxSize: () => $ZodCheckMaxSize,
  $ZodCheckMimeType: () => $ZodCheckMimeType,
  $ZodCheckMinLength: () => $ZodCheckMinLength,
  $ZodCheckMinSize: () => $ZodCheckMinSize,
  $ZodCheckMultipleOf: () => $ZodCheckMultipleOf,
  $ZodCheckNumberFormat: () => $ZodCheckNumberFormat,
  $ZodCheckOverwrite: () => $ZodCheckOverwrite,
  $ZodCheckProperty: () => $ZodCheckProperty,
  $ZodCheckRegex: () => $ZodCheckRegex,
  $ZodCheckSizeEquals: () => $ZodCheckSizeEquals,
  $ZodCheckStartsWith: () => $ZodCheckStartsWith,
  $ZodCheckStringFormat: () => $ZodCheckStringFormat,
  $ZodCheckUpperCase: () => $ZodCheckUpperCase,
  $ZodCustom: () => $ZodCustom,
  $ZodCustomStringFormat: () => $ZodCustomStringFormat,
  $ZodDate: () => $ZodDate,
  $ZodDefault: () => $ZodDefault,
  $ZodDiscriminatedUnion: () => $ZodDiscriminatedUnion,
  $ZodE164: () => $ZodE164,
  $ZodEmail: () => $ZodEmail,
  $ZodEmoji: () => $ZodEmoji,
  $ZodEnum: () => $ZodEnum,
  $ZodError: () => $ZodError,
  $ZodFile: () => $ZodFile,
  $ZodFunction: () => $ZodFunction,
  $ZodGUID: () => $ZodGUID,
  $ZodIPv4: () => $ZodIPv4,
  $ZodIPv6: () => $ZodIPv6,
  $ZodISODate: () => $ZodISODate,
  $ZodISODateTime: () => $ZodISODateTime,
  $ZodISODuration: () => $ZodISODuration,
  $ZodISOTime: () => $ZodISOTime,
  $ZodIntersection: () => $ZodIntersection,
  $ZodJWT: () => $ZodJWT,
  $ZodKSUID: () => $ZodKSUID,
  $ZodLazy: () => $ZodLazy,
  $ZodLiteral: () => $ZodLiteral,
  $ZodMap: () => $ZodMap,
  $ZodNaN: () => $ZodNaN,
  $ZodNanoID: () => $ZodNanoID,
  $ZodNever: () => $ZodNever,
  $ZodNonOptional: () => $ZodNonOptional,
  $ZodNull: () => $ZodNull,
  $ZodNullable: () => $ZodNullable,
  $ZodNumber: () => $ZodNumber,
  $ZodNumberFormat: () => $ZodNumberFormat,
  $ZodObject: () => $ZodObject,
  $ZodOptional: () => $ZodOptional,
  $ZodPipe: () => $ZodPipe,
  $ZodPrefault: () => $ZodPrefault,
  $ZodPromise: () => $ZodPromise,
  $ZodReadonly: () => $ZodReadonly,
  $ZodRealError: () => $ZodRealError,
  $ZodRecord: () => $ZodRecord,
  $ZodRegistry: () => $ZodRegistry,
  $ZodSet: () => $ZodSet,
  $ZodString: () => $ZodString,
  $ZodStringFormat: () => $ZodStringFormat,
  $ZodSuccess: () => $ZodSuccess,
  $ZodSymbol: () => $ZodSymbol,
  $ZodTemplateLiteral: () => $ZodTemplateLiteral,
  $ZodTransform: () => $ZodTransform,
  $ZodTuple: () => $ZodTuple,
  $ZodType: () => $ZodType,
  $ZodULID: () => $ZodULID,
  $ZodURL: () => $ZodURL,
  $ZodUUID: () => $ZodUUID,
  $ZodUndefined: () => $ZodUndefined,
  $ZodUnion: () => $ZodUnion,
  $ZodUnknown: () => $ZodUnknown,
  $ZodVoid: () => $ZodVoid,
  $ZodXID: () => $ZodXID,
  $brand: () => $brand,
  $constructor: () => $constructor,
  $input: () => $input,
  $output: () => $output,
  Doc: () => Doc,
  JSONSchema: () => json_schema_exports,
  JSONSchemaGenerator: () => JSONSchemaGenerator,
  NEVER: () => NEVER,
  TimePrecision: () => TimePrecision,
  _any: () => _any,
  _array: () => _array,
  _base64: () => _base64,
  _base64url: () => _base64url,
  _bigint: () => _bigint,
  _boolean: () => _boolean,
  _catch: () => _catch,
  _cidrv4: () => _cidrv4,
  _cidrv6: () => _cidrv6,
  _coercedBigint: () => _coercedBigint,
  _coercedBoolean: () => _coercedBoolean,
  _coercedDate: () => _coercedDate,
  _coercedNumber: () => _coercedNumber,
  _coercedString: () => _coercedString,
  _cuid: () => _cuid,
  _cuid2: () => _cuid2,
  _custom: () => _custom,
  _date: () => _date,
  _default: () => _default,
  _discriminatedUnion: () => _discriminatedUnion,
  _e164: () => _e164,
  _email: () => _email,
  _emoji: () => _emoji2,
  _endsWith: () => _endsWith,
  _enum: () => _enum,
  _file: () => _file,
  _float32: () => _float32,
  _float64: () => _float64,
  _gt: () => _gt,
  _gte: () => _gte,
  _guid: () => _guid,
  _includes: () => _includes,
  _int: () => _int,
  _int32: () => _int32,
  _int64: () => _int64,
  _intersection: () => _intersection,
  _ipv4: () => _ipv4,
  _ipv6: () => _ipv6,
  _isoDate: () => _isoDate,
  _isoDateTime: () => _isoDateTime,
  _isoDuration: () => _isoDuration,
  _isoTime: () => _isoTime,
  _jwt: () => _jwt,
  _ksuid: () => _ksuid,
  _lazy: () => _lazy,
  _length: () => _length,
  _literal: () => _literal,
  _lowercase: () => _lowercase,
  _lt: () => _lt,
  _lte: () => _lte,
  _map: () => _map,
  _max: () => _lte,
  _maxLength: () => _maxLength,
  _maxSize: () => _maxSize,
  _mime: () => _mime,
  _min: () => _gte,
  _minLength: () => _minLength,
  _minSize: () => _minSize,
  _multipleOf: () => _multipleOf,
  _nan: () => _nan,
  _nanoid: () => _nanoid,
  _nativeEnum: () => _nativeEnum,
  _negative: () => _negative,
  _never: () => _never,
  _nonnegative: () => _nonnegative,
  _nonoptional: () => _nonoptional,
  _nonpositive: () => _nonpositive,
  _normalize: () => _normalize,
  _null: () => _null2,
  _nullable: () => _nullable,
  _number: () => _number,
  _optional: () => _optional,
  _overwrite: () => _overwrite,
  _parse: () => _parse,
  _parseAsync: () => _parseAsync,
  _pipe: () => _pipe,
  _positive: () => _positive,
  _promise: () => _promise,
  _property: () => _property,
  _readonly: () => _readonly,
  _record: () => _record,
  _refine: () => _refine,
  _regex: () => _regex,
  _safeParse: () => _safeParse,
  _safeParseAsync: () => _safeParseAsync,
  _set: () => _set,
  _size: () => _size,
  _startsWith: () => _startsWith,
  _string: () => _string,
  _stringFormat: () => _stringFormat,
  _stringbool: () => _stringbool,
  _success: () => _success,
  _symbol: () => _symbol,
  _templateLiteral: () => _templateLiteral,
  _toLowerCase: () => _toLowerCase,
  _toUpperCase: () => _toUpperCase,
  _transform: () => _transform,
  _trim: () => _trim,
  _tuple: () => _tuple,
  _uint32: () => _uint32,
  _uint64: () => _uint64,
  _ulid: () => _ulid,
  _undefined: () => _undefined2,
  _union: () => _union,
  _unknown: () => _unknown,
  _uppercase: () => _uppercase,
  _url: () => _url,
  _uuid: () => _uuid,
  _uuidv4: () => _uuidv4,
  _uuidv6: () => _uuidv6,
  _uuidv7: () => _uuidv7,
  _void: () => _void,
  _xid: () => _xid,
  clone: () => clone,
  config: () => config,
  flattenError: () => flattenError,
  formatError: () => formatError2,
  function: () => _function,
  globalConfig: () => globalConfig,
  globalRegistry: () => globalRegistry,
  isValidBase64: () => isValidBase64,
  isValidBase64URL: () => isValidBase64URL,
  isValidJWT: () => isValidJWT,
  locales: () => locales_exports,
  parse: () => parse,
  parseAsync: () => parseAsync,
  prettifyError: () => prettifyError,
  regexes: () => regexes_exports,
  registry: () => registry,
  safeParse: () => safeParse,
  safeParseAsync: () => safeParseAsync,
  toDotPath: () => toDotPath,
  toJSONSchema: () => toJSONSchema,
  treeifyError: () => treeifyError,
  util: () => util_exports,
  version: () => version
});

// node_modules/zod/v4/core/core.js
var NEVER = Object.freeze({
  status: "aborted"
});
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer3, params) {
  function init(inst, def) {
    var _a;
    Object.defineProperty(inst, "_zod", {
      value: inst._zod ?? {},
      enumerable: false
    });
    (_a = inst._zod).traits ?? (_a.traits = /* @__PURE__ */ new Set());
    inst._zod.traits.add(name);
    initializer3(inst, def);
    for (const k in _.prototype) {
      if (!(k in inst))
        Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
    }
    inst._zod.constr = _;
    inst._zod.def = def;
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $brand = Symbol("zod_brand");
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
var globalConfig = {};
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  isObject: () => isObject3,
  isPlainObject: () => isPlainObject2,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  merge: () => merge2,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  required: () => required,
  stringifyPrimitive: () => stringifyPrimitive,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {
}
function assertNever(_x) {
  throw new Error();
}
function assert(_) {
}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array2, separator = "|") {
  return array2.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set3 = false;
  return {
    get value() {
      if (!set3) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function defineLazy(object2, key, getter) {
  const set3 = false;
  Object.defineProperty(object2, key, {
    get() {
      if (!set3) {
        const value = getter();
        object2[key] = value;
        return value;
      }
      throw new Error("cached value already set");
    },
    set(v) {
      Object.defineProperty(object2, key, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function getElementAtPath(obj, path5) {
  if (!path5)
    return obj;
  return path5.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str3 = "";
  for (let i = 0; i < length; i++) {
    str3 += chars[Math.floor(Math.random() * chars.length)];
  }
  return str3;
}
function esc(str3) {
  return JSON.stringify(str3);
}
var captureStackTrace = Error.captureStackTrace ? Error.captureStackTrace : (..._args) => {
};
function isObject3(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = cached(() => {
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject2(o) {
  if (isObject3(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  const prot = ctor.prototype;
  if (isObject3(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set(["string", "number", "bigint", "boolean", "symbol", "undefined"]);
function escapeRegex(str3) {
  return str3.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const newShape = {};
  const currDef = schema._zod.def;
  for (const key in mask) {
    if (!(key in currDef.shape)) {
      throw new Error(`Unrecognized key: "${key}"`);
    }
    if (!mask[key])
      continue;
    newShape[key] = currDef.shape[key];
  }
  return clone(schema, {
    ...schema._zod.def,
    shape: newShape,
    checks: []
  });
}
function omit(schema, mask) {
  const newShape = { ...schema._zod.def.shape };
  const currDef = schema._zod.def;
  for (const key in mask) {
    if (!(key in currDef.shape)) {
      throw new Error(`Unrecognized key: "${key}"`);
    }
    if (!mask[key])
      continue;
    delete newShape[key];
  }
  return clone(schema, {
    ...schema._zod.def,
    shape: newShape,
    checks: []
  });
}
function extend(schema, shape) {
  if (!isPlainObject2(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const def = {
    ...schema._zod.def,
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    checks: []
    // delete existing checks
  };
  return clone(schema, def);
}
function merge2(a, b) {
  return clone(a, {
    ...a._zod.def,
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    catchall: b._zod.def.catchall,
    checks: []
    // delete existing checks
  });
}
function partial(Class2, schema, mask) {
  const oldShape = schema._zod.def.shape;
  const shape = { ...oldShape };
  if (mask) {
    for (const key in mask) {
      if (!(key in oldShape)) {
        throw new Error(`Unrecognized key: "${key}"`);
      }
      if (!mask[key])
        continue;
      shape[key] = Class2 ? new Class2({
        type: "optional",
        innerType: oldShape[key]
      }) : oldShape[key];
    }
  } else {
    for (const key in oldShape) {
      shape[key] = Class2 ? new Class2({
        type: "optional",
        innerType: oldShape[key]
      }) : oldShape[key];
    }
  }
  return clone(schema, {
    ...schema._zod.def,
    shape,
    checks: []
  });
}
function required(Class2, schema, mask) {
  const oldShape = schema._zod.def.shape;
  const shape = { ...oldShape };
  if (mask) {
    for (const key in mask) {
      if (!(key in shape)) {
        throw new Error(`Unrecognized key: "${key}"`);
      }
      if (!mask[key])
        continue;
      shape[key] = new Class2({
        type: "nonoptional",
        innerType: oldShape[key]
      });
    }
  } else {
    for (const key in oldShape) {
      shape[key] = new Class2({
        type: "nonoptional",
        innerType: oldShape[key]
      });
    }
  }
  return clone(schema, {
    ...schema._zod.def,
    shape,
    // optional: [],
    checks: []
  });
}
function aborted(x, startIndex = 0) {
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true)
      return true;
  }
  return false;
}
function prefixIssues(path5, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path5);
    return iss;
  });
}
function unwrapMessage(message3) {
  return typeof message3 === "string" ? message3 : message3?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const full = { ...iss, path: iss.path ?? [] };
  if (!iss.message) {
    const message3 = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
    full.message = message3;
  }
  delete full.inst;
  delete full.continue;
  if (!ctx?.reportInput) {
    delete full.input;
  }
  return full;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
var Class = class {
  constructor(..._args) {
  }
};

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  Object.defineProperty(inst, "message", {
    get() {
      return JSON.stringify(def, jsonStringifyReplacer, 2);
    },
    enumerable: true
    // configurable: false,
  });
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error40, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error40.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError2(error40, _mapper) {
  const mapper = _mapper || function(issue2) {
    return issue2.message;
  };
  const fieldErrors = { _errors: [] };
  const processError = (error41) => {
    for (const issue2 of error41.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues });
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues });
      } else if (issue2.path.length === 0) {
        fieldErrors._errors.push(mapper(issue2));
      } else {
        let curr = fieldErrors;
        let i = 0;
        while (i < issue2.path.length) {
          const el = issue2.path[i];
          const terminal = i === issue2.path.length - 1;
          if (!terminal) {
            curr[el] = curr[el] || { _errors: [] };
          } else {
            curr[el] = curr[el] || { _errors: [] };
            curr[el]._errors.push(mapper(issue2));
          }
          curr = curr[el];
          i++;
        }
      }
    }
  };
  processError(error40);
  return fieldErrors;
}
function treeifyError(error40, _mapper) {
  const mapper = _mapper || function(issue2) {
    return issue2.message;
  };
  const result = { errors: [] };
  const processError = (error41, path5 = []) => {
    var _a, _b;
    for (const issue2 of error41.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, issue2.path));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, issue2.path);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, issue2.path);
      } else {
        const fullpath = [...path5, ...issue2.path];
        if (fullpath.length === 0) {
          result.errors.push(mapper(issue2));
          continue;
        }
        let curr = result;
        let i = 0;
        while (i < fullpath.length) {
          const el = fullpath[i];
          const terminal = i === fullpath.length - 1;
          if (typeof el === "string") {
            curr.properties ?? (curr.properties = {});
            (_a = curr.properties)[el] ?? (_a[el] = { errors: [] });
            curr = curr.properties[el];
          } else {
            curr.items ?? (curr.items = []);
            (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
            curr = curr.items[el];
          }
          if (terminal) {
            curr.errors.push(mapper(issue2));
          }
          i++;
        }
      }
    }
  };
  processError(error40);
  return result;
}
function toDotPath(path5) {
  const segs = [];
  for (const seg of path5) {
    if (typeof seg === "number")
      segs.push(`[${seg}]`);
    else if (typeof seg === "symbol")
      segs.push(`[${JSON.stringify(String(seg))}]`);
    else if (/[^\w$]/.test(seg))
      segs.push(`[${JSON.stringify(seg)}]`);
    else {
      if (segs.length)
        segs.push(".");
      segs.push(seg);
    }
  }
  return segs.join("");
}
function prettifyError(error40) {
  const lines = [];
  const issues = [...error40.issues].sort((a, b) => a.path.length - b.path.length);
  for (const issue2 of issues) {
    lines.push(`\u2716 ${issue2.message}`);
    if (issue2.path?.length)
      lines.push(`  \u2192 at ${toDotPath(issue2.path)}`);
  }
  return lines.join("\n");
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// node_modules/zod/v4/core/regexes.js
var regexes_exports = {};
__export(regexes_exports, {
  _emoji: () => _emoji,
  base64: () => base64,
  base64url: () => base64url,
  bigint: () => bigint,
  boolean: () => boolean,
  browserEmail: () => browserEmail,
  cidrv4: () => cidrv4,
  cidrv6: () => cidrv6,
  cuid: () => cuid,
  cuid2: () => cuid2,
  date: () => date,
  datetime: () => datetime,
  domain: () => domain,
  duration: () => duration,
  e164: () => e164,
  email: () => email,
  emoji: () => emoji,
  extendedDuration: () => extendedDuration,
  guid: () => guid,
  hostname: () => hostname,
  html5Email: () => html5Email,
  integer: () => integer,
  ipv4: () => ipv4,
  ipv6: () => ipv6,
  ksuid: () => ksuid,
  lowercase: () => lowercase,
  nanoid: () => nanoid,
  null: () => _null,
  number: () => number,
  rfc5322Email: () => rfc5322Email,
  string: () => string,
  time: () => time,
  ulid: () => ulid,
  undefined: () => _undefined,
  unicodeEmail: () => unicodeEmail,
  uppercase: () => uppercase,
  uuid: () => uuid,
  uuid4: () => uuid4,
  uuid6: () => uuid6,
  uuid7: () => uuid7,
  xid: () => xid
});
var cuid = /^[cC][^\s-]{8,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version2) => {
  if (!version2)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var uuid4 = /* @__PURE__ */ uuid(4);
var uuid6 = /* @__PURE__ */ uuid(6);
var uuid7 = /* @__PURE__ */ uuid(7);
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
var unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
var browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var hostname = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
var domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
var e164 = /^\+(?:[0-9]){6,14}[0-9]$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time3 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-]\\d{2}:\\d{2})`);
  const timeRegex = `${time3}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var bigint = /^\d+n?$/;
var integer = /^\d+$/;
var number = /^-?\d+(?:\.\d+)?/i;
var boolean = /true|false/i;
var _null = /null/i;
var _undefined = /undefined/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a;
    (_a = inst2._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inst
      });
    }
  };
});
var $ZodCheckBigIntFormat = /* @__PURE__ */ $constructor("$ZodCheckBigIntFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  const [minimum, maximum] = BIGINT_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (input < minimum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_big",
        maximum,
        inst
      });
    }
  };
});
var $ZodCheckMaxSize = /* @__PURE__ */ $constructor("$ZodCheckMaxSize", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size <= def.maximum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_big",
      maximum: def.maximum,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinSize = /* @__PURE__ */ $constructor("$ZodCheckMinSize", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size >= def.minimum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_small",
      minimum: def.minimum,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckSizeEquals = /* @__PURE__ */ $constructor("$ZodCheckSizeEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.size;
    bag.maximum = def.size;
    bag.size = def.size;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size === def.size)
      return;
    const tooBig = size > def.size;
    payload.issues.push({
      origin: getSizableOrigin(input),
      ...tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function handleCheckPropertyResult(result, payload, property) {
  if (result.issues.length) {
    payload.issues.push(...prefixIssues(property, result.issues));
  }
}
var $ZodCheckProperty = /* @__PURE__ */ $constructor("$ZodCheckProperty", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    const result = def.schema._zod.run({
      value: payload.value[def.property],
      issues: []
    }, {});
    if (result instanceof Promise) {
      return result.then((result2) => handleCheckPropertyResult(result2, payload, def.property));
    }
    handleCheckPropertyResult(result, payload, def.property);
    return;
  };
});
var $ZodCheckMimeType = /* @__PURE__ */ $constructor("$ZodCheckMimeType", (inst, def) => {
  $ZodCheck.init(inst, def);
  const mimeSet = new Set(def.mime);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.mime = def.mime;
  });
  inst._zod.check = (payload) => {
    if (mimeSet.has(payload.value.type))
      return;
    payload.issues.push({
      code: "invalid_value",
      values: def.mime,
      input: payload.value.type,
      inst
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
var Doc = class {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split("\n").filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join("\n"));
  }
};

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 0,
  patch: 0
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    inst._zod.run = (payload, ctx) => {
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  inst["~standard"] = {
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  };
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === void 0)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const orig = payload.value;
      const url2 = new URL(orig);
      const href = url2.href;
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url2.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url2.protocol.endsWith(":") ? url2.protocol.slice(0, -1) : url2.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (!orig.endsWith("/") && href.endsWith("/")) {
        payload.value = href.slice(0, -1);
      } else {
        payload.value = href;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = `ipv4`;
  });
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = `ipv6`;
  });
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const [address, prefix] = payload.value.split("/");
    try {
      if (!prefix)
        throw new Error();
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error();
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error();
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.contentEncoding = "base64";
  });
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base643 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base643.padEnd(Math.ceil(base643.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.contentEncoding = "base64url";
  });
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCustomStringFormat = /* @__PURE__ */ $constructor("$ZodCustomStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (def.fn(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: def.format,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodBigInt = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = bigint;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = BigInt(payload.value);
      } catch (_) {
      }
    if (typeof payload.value === "bigint")
      return payload;
    payload.issues.push({
      expected: "bigint",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodBigIntFormat = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodCheckBigIntFormat.init(inst, def);
  $ZodBigInt.init(inst, def);
});
var $ZodSymbol = /* @__PURE__ */ $constructor("$ZodSymbol", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "symbol")
      return payload;
    payload.issues.push({
      expected: "symbol",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUndefined = /* @__PURE__ */ $constructor("$ZodUndefined", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _undefined;
  inst._zod.values = /* @__PURE__ */ new Set([void 0]);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "undefined",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = /* @__PURE__ */ new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodVoid = /* @__PURE__ */ $constructor("$ZodVoid", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "void",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodDate = /* @__PURE__ */ $constructor("$ZodDate", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce) {
      try {
        payload.value = new Date(payload.value);
      } catch (_err) {
      }
    }
    const input = payload.value;
    const isDate = input instanceof Date;
    const isValidDate2 = isDate && !Number.isNaN(input.getTime());
    if (isValidDate2)
      return payload;
    payload.issues.push({
      expected: "date",
      code: "invalid_type",
      input,
      ...isDate ? { received: "Invalid Date" } : {},
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handleObjectResult(result, final, key) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(key, result.issues));
  }
  final.value[key] = result.value;
}
function handleOptionalObjectResult(result, final, key, input) {
  if (result.issues.length) {
    if (input[key] === void 0) {
      if (key in input) {
        final.value[key] = void 0;
      } else {
        final.value[key] = result.value;
      }
    } else {
      final.issues.push(...prefixIssues(key, result.issues));
    }
  } else if (result.value === void 0) {
    if (key in input)
      final.value[key] = void 0;
  } else {
    final.value[key] = result.value;
  }
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const _normalized = cached(() => {
    const keys = Object.keys(def.shape);
    for (const k of keys) {
      if (!(def.shape[k] instanceof $ZodType)) {
        throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
      }
    }
    const okeys = optionalKeys(def.shape);
    return {
      shape: def.shape,
      keys,
      keySet: new Set(keys),
      numKeys: keys.length,
      optionalKeys: new Set(okeys)
    };
  });
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = /* @__PURE__ */ Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {}`);
    for (const key of normalized.keys) {
      if (normalized.optionalKeys.has(key)) {
        const id2 = ids[key];
        doc.write(`const ${id2} = ${parseStr(key)};`);
        const k = esc(key);
        doc.write(`
        if (${id2}.issues.length) {
          if (input[${k}] === undefined) {
            if (${k} in input) {
              newResult[${k}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${id2}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${k}, ...iss.path] : [${k}],
              }))
            );
          }
        } else if (${id2}.value === undefined) {
          if (${k} in input) newResult[${k}] = undefined;
        } else {
          newResult[${k}] = ${id2}.value;
        }
        `);
      } else {
        const id2 = ids[key];
        doc.write(`const ${id2} = ${parseStr(key)};`);
        doc.write(`
          if (${id2}.issues.length) payload.issues = payload.issues.concat(${id2}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${esc(key)}, ...iss.path] : [${esc(key)}]
          })));`);
        doc.write(`newResult[${esc(key)}] = ${id2}.value`);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject6 = isObject3;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject6(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
    } else {
      payload.value = {};
      const shape = value.shape;
      for (const key of value.keys) {
        const el = shape[key];
        const r = el._zod.run({ value: input[key], issues: [] }, ctx);
        const isOptional = el._zod.optin === "optional" && el._zod.optout === "optional";
        if (r instanceof Promise) {
          proms.push(r.then((r2) => isOptional ? handleOptionalObjectResult(r2, payload, key, input) : handleObjectResult(r2, payload, key)));
        } else if (isOptional) {
          handleOptionalObjectResult(r, payload, key, input);
        } else {
          handleObjectResult(r, payload, key);
        }
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    const unrecognized = [];
    const keySet = value.keySet;
    const _catchall = catchall._zod;
    const t = _catchall.def.type;
    for (const key of Object.keys(input)) {
      if (keySet.has(key))
        continue;
      if (t === "never") {
        unrecognized.push(key);
        continue;
      }
      const r = _catchall.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handleObjectResult(r2, payload, key)));
      } else {
        handleObjectResult(r, payload, key);
      }
    }
    if (unrecognized.length) {
      payload.issues.push({
        code: "unrecognized_keys",
        keys: unrecognized,
        input,
        inst
      });
    }
    if (!proms.length)
      return payload;
    return Promise.all(proms).then(() => {
      return payload;
    });
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k, v] of Object.entries(pv)) {
        if (!propValues[k])
          propValues[k] = /* @__PURE__ */ new Set();
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map2 = /* @__PURE__ */ new Map();
    for (const o of opts) {
      const values = o._zod.propValues[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
      for (const v of values) {
        if (map2.has(v)) {
          throw new Error(`Duplicate discriminator value "${String(v)}"`);
        }
        map2.set(v, o);
      }
    }
    return map2;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject3(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback) {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject2(a) && isPlainObject2(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  if (left.issues.length) {
    result.issues.push(...left.issues);
  }
  if (right.issues.length) {
    result.issues.push(...right.issues);
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  const optStart = items.length - [...items].reverse().findIndex((item) => item._zod.optin !== "optional");
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    if (!def.rest) {
      const tooBig = input.length > items.length;
      const tooSmall = input.length < optStart - 1;
      if (tooBig || tooSmall) {
        payload.issues.push({
          input,
          inst,
          origin: "array",
          ...tooBig ? { code: "too_big", maximum: items.length } : { code: "too_small", minimum: items.length }
        });
        return payload;
      }
    }
    let i = -1;
    for (const item of items) {
      i++;
      if (i >= input.length) {
        if (i >= optStart)
          continue;
      }
      const result = item._zod.run({
        value: input[i],
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleTupleResult(result2, payload, i)));
      } else {
        handleTupleResult(result, payload, i);
      }
    }
    if (def.rest) {
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({
          value: el,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleTupleResult(result2, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject2(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    if (def.keyType._zod.values) {
      const values = def.keyType._zod.values;
      payload.value = {};
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[key] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[key] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!values.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        if (keyResult.issues.length) {
          payload.issues.push({
            origin: "record",
            code: "invalid_key",
            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
            input: key,
            path: [key],
            inst
          });
          payload.value[keyResult.value] = keyResult.value;
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodMap = /* @__PURE__ */ $constructor("$ZodMap", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Map)) {
      payload.issues.push({
        expected: "map",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    payload.value = /* @__PURE__ */ new Map();
    for (const [key, value] of input) {
      const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
      const valueResult = def.valueType._zod.run({ value, issues: [] }, ctx);
      if (keyResult instanceof Promise || valueResult instanceof Promise) {
        proms.push(Promise.all([keyResult, valueResult]).then(([keyResult2, valueResult2]) => {
          handleMapResult(keyResult2, valueResult2, payload, key, input, inst, ctx);
        }));
      } else {
        handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
      }
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
  if (keyResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, keyResult.issues));
    } else {
      final.issues.push({
        origin: "map",
        code: "invalid_key",
        input,
        inst,
        issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  if (valueResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, valueResult.issues));
    } else {
      final.issues.push({
        origin: "map",
        code: "invalid_element",
        input,
        inst,
        key,
        issues: valueResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  final.value.set(keyResult.value, valueResult.value);
}
var $ZodSet = /* @__PURE__ */ $constructor("$ZodSet", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Set)) {
      payload.issues.push({
        input,
        inst,
        expected: "set",
        code: "invalid_type"
      });
      return payload;
    }
    const proms = [];
    payload.value = /* @__PURE__ */ new Set();
    for (const item of input) {
      const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleSetResult(result2, payload)));
      } else
        handleSetResult(result, payload);
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleSetResult(result, final) {
  if (result.issues.length) {
    final.issues.push(...result.issues);
  }
  final.value.add(result.value);
}
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  inst._zod.values = new Set(values);
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (inst._zod.values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.values = new Set(def.values);
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? o.toString() : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (inst._zod.values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodFile = /* @__PURE__ */ $constructor("$ZodFile", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input instanceof File)
      return payload;
    payload.issues.push({
      expected: "file",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const _out = def.transform(payload.value, payload);
    if (_ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError();
    }
    payload.value = _out;
    return payload;
  };
});
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodSuccess = /* @__PURE__ */ $constructor("$ZodSuccess", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.issues.length === 0;
        return payload;
      });
    }
    payload.value = result.issues.length === 0;
    return payload;
  };
});
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
    }
    return payload;
  };
});
var $ZodNaN = /* @__PURE__ */ $constructor("$ZodNaN", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "nan",
        code: "invalid_type"
      });
      return payload;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  inst._zod.parse = (payload, ctx) => {
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def, ctx));
    }
    return handlePipeResult(left, def, ctx);
  };
});
function handlePipeResult(left, def, ctx) {
  if (aborted(left)) {
    return left;
  }
  return def.out._zod.run({ value: left.value, issues: left.issues }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodTemplateLiteral = /* @__PURE__ */ $constructor("$ZodTemplateLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const regexParts = [];
  for (const part of def.parts) {
    if (part instanceof $ZodType) {
      if (!part._zod.pattern) {
        throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
      }
      const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
      if (!source)
        throw new Error(`Invalid template literal part: ${part._zod.traits}`);
      const start = source.startsWith("^") ? 1 : 0;
      const end = source.endsWith("$") ? source.length - 1 : source.length;
      regexParts.push(source.slice(start, end));
    } else if (part === null || primitiveTypes.has(typeof part)) {
      regexParts.push(escapeRegex(`${part}`));
    } else {
      throw new Error(`Invalid template literal part: ${part}`);
    }
  }
  inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "string") {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "template_literal",
        code: "invalid_type"
      });
      return payload;
    }
    inst._zod.pattern.lastIndex = 0;
    if (!inst._zod.pattern.test(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        code: "invalid_format",
        format: "template_literal",
        pattern: inst._zod.pattern.source
      });
      return payload;
    }
    return payload;
  };
});
var $ZodPromise = /* @__PURE__ */ $constructor("$ZodPromise", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
  };
});
var $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => def.getter());
  defineLazy(inst._zod, "pattern", () => inst._zod.innerType._zod.pattern);
  defineLazy(inst._zod, "propValues", () => inst._zod.innerType._zod.propValues);
  defineLazy(inst._zod, "optin", () => inst._zod.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => inst._zod.innerType._zod.optout);
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

// node_modules/zod/v4/locales/index.js
var locales_exports = {};
__export(locales_exports, {
  ar: () => ar_default,
  az: () => az_default,
  be: () => be_default,
  ca: () => ca_default,
  cs: () => cs_default,
  de: () => de_default,
  en: () => en_default,
  eo: () => eo_default,
  es: () => es_default,
  fa: () => fa_default,
  fi: () => fi_default,
  fr: () => fr_default,
  frCA: () => fr_CA_default,
  he: () => he_default,
  hu: () => hu_default,
  id: () => id_default,
  it: () => it_default,
  ja: () => ja_default,
  kh: () => kh_default,
  ko: () => ko_default,
  mk: () => mk_default,
  ms: () => ms_default,
  nl: () => nl_default,
  no: () => no_default,
  ota: () => ota_default,
  pl: () => pl_default,
  ps: () => ps_default,
  pt: () => pt_default,
  ru: () => ru_default,
  sl: () => sl_default,
  sv: () => sv_default,
  ta: () => ta_default,
  th: () => th_default,
  tr: () => tr_default,
  ua: () => ua_default,
  ur: () => ur_default,
  vi: () => vi_default,
  zhCN: () => zh_CN_default,
  zhTW: () => zh_TW_default
});

// node_modules/zod/v4/locales/ar.js
var error = () => {
  const Sizable = {
    string: { unit: "\u062D\u0631\u0641", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" },
    file: { unit: "\u0628\u0627\u064A\u062A", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" },
    array: { unit: "\u0639\u0646\u0635\u0631", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" },
    set: { unit: "\u0639\u0646\u0635\u0631", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0645\u062F\u062E\u0644",
    email: "\u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A",
    url: "\u0631\u0627\u0628\u0637",
    emoji: "\u0625\u064A\u0645\u0648\u062C\u064A",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u062A\u0627\u0631\u064A\u062E \u0648\u0648\u0642\u062A \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    date: "\u062A\u0627\u0631\u064A\u062E \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    time: "\u0648\u0642\u062A \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    duration: "\u0645\u062F\u0629 \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    ipv4: "\u0639\u0646\u0648\u0627\u0646 IPv4",
    ipv6: "\u0639\u0646\u0648\u0627\u0646 IPv6",
    cidrv4: "\u0645\u062F\u0649 \u0639\u0646\u0627\u0648\u064A\u0646 \u0628\u0635\u064A\u063A\u0629 IPv4",
    cidrv6: "\u0645\u062F\u0649 \u0639\u0646\u0627\u0648\u064A\u0646 \u0628\u0635\u064A\u063A\u0629 IPv6",
    base64: "\u0646\u064E\u0635 \u0628\u062A\u0631\u0645\u064A\u0632 base64-encoded",
    base64url: "\u0646\u064E\u0635 \u0628\u062A\u0631\u0645\u064A\u0632 base64url-encoded",
    json_string: "\u0646\u064E\u0635 \u0639\u0644\u0649 \u0647\u064A\u0626\u0629 JSON",
    e164: "\u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0628\u0645\u0639\u064A\u0627\u0631 E.164",
    jwt: "JWT",
    template_literal: "\u0645\u062F\u062E\u0644"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0645\u062F\u062E\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644\u0629: \u064A\u0641\u062A\u0631\u0636 \u0625\u062F\u062E\u0627\u0644 ${issue2.expected}\u060C \u0648\u0644\u0643\u0646 \u062A\u0645 \u0625\u062F\u062E\u0627\u0644 ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0645\u062F\u062E\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644\u0629: \u064A\u0641\u062A\u0631\u0636 \u0625\u062F\u062E\u0627\u0644 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0627\u062E\u062A\u064A\u0627\u0631 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062A\u0648\u0642\u0639 \u0627\u0646\u062A\u0642\u0627\u0621 \u0623\u062D\u062F \u0647\u0630\u0647 \u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return ` \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0623\u0646 \u062A\u0643\u0648\u0646 ${issue2.origin ?? "\u0627\u0644\u0642\u064A\u0645\u0629"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0635\u0631"}`;
        return `\u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0623\u0646 \u062A\u0643\u0648\u0646 ${issue2.origin ?? "\u0627\u0644\u0642\u064A\u0645\u0629"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0623\u0635\u063A\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0644\u0640 ${issue2.origin} \u0623\u0646 \u064A\u0643\u0648\u0646 ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0623\u0635\u063A\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0644\u0640 ${issue2.origin} \u0623\u0646 \u064A\u0643\u0648\u0646 ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0628\u0640 "${issue2.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0646\u062A\u0647\u064A \u0628\u0640 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0636\u0645\u0651\u064E\u0646 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0637\u0627\u0628\u0642 \u0627\u0644\u0646\u0645\u0637 ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644`;
      }
      case "not_multiple_of":
        return `\u0631\u0642\u0645 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u0646 \u0645\u0636\u0627\u0639\u0641\u0627\u062A ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u0645\u0639\u0631\u0641${issue2.keys.length > 1 ? "\u0627\u062A" : ""} \u063A\u0631\u064A\u0628${issue2.keys.length > 1 ? "\u0629" : ""}: ${joinValues(issue2.keys, "\u060C ")}`;
      case "invalid_key":
        return `\u0645\u0639\u0631\u0641 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644 \u0641\u064A ${issue2.origin}`;
      case "invalid_union":
        return "\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644";
      case "invalid_element":
        return `\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644 \u0641\u064A ${issue2.origin}`;
      default:
        return "\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644";
    }
  };
};
function ar_default() {
  return {
    localeError: error()
  };
}

// node_modules/zod/v4/locales/az.js
var error2 = () => {
  const Sizable = {
    string: { unit: "simvol", verb: "olmal\u0131d\u0131r" },
    file: { unit: "bayt", verb: "olmal\u0131d\u0131r" },
    array: { unit: "element", verb: "olmal\u0131d\u0131r" },
    set: { unit: "element", verb: "olmal\u0131d\u0131r" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Yanl\u0131\u015F d\u0259y\u0259r: g\xF6zl\u0259nil\u0259n ${issue2.expected}, daxil olan ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Yanl\u0131\u015F d\u0259y\u0259r: g\xF6zl\u0259nil\u0259n ${stringifyPrimitive(issue2.values[0])}`;
        return `Yanl\u0131\u015F se\xE7im: a\u015Fa\u011F\u0131dak\u0131lardan biri olmal\u0131d\u0131r: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ox b\xF6y\xFCk: g\xF6zl\u0259nil\u0259n ${issue2.origin ?? "d\u0259y\u0259r"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        return `\xC7ox b\xF6y\xFCk: g\xF6zl\u0259nil\u0259n ${issue2.origin ?? "d\u0259y\u0259r"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ox ki\xE7ik: g\xF6zl\u0259nil\u0259n ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `\xC7ox ki\xE7ik: g\xF6zl\u0259nil\u0259n ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Yanl\u0131\u015F m\u0259tn: "${_issue.prefix}" il\u0259 ba\u015Flamal\u0131d\u0131r`;
        if (_issue.format === "ends_with")
          return `Yanl\u0131\u015F m\u0259tn: "${_issue.suffix}" il\u0259 bitm\u0259lidir`;
        if (_issue.format === "includes")
          return `Yanl\u0131\u015F m\u0259tn: "${_issue.includes}" daxil olmal\u0131d\u0131r`;
        if (_issue.format === "regex")
          return `Yanl\u0131\u015F m\u0259tn: ${_issue.pattern} \u015Fablonuna uy\u011Fun olmal\u0131d\u0131r`;
        return `Yanl\u0131\u015F ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Yanl\u0131\u015F \u0259d\u0259d: ${issue2.divisor} il\u0259 b\xF6l\xFCn\u0259 bil\u0259n olmal\u0131d\u0131r`;
      case "unrecognized_keys":
        return `Tan\u0131nmayan a\xE7ar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} daxilind\u0259 yanl\u0131\u015F a\xE7ar`;
      case "invalid_union":
        return "Yanl\u0131\u015F d\u0259y\u0259r";
      case "invalid_element":
        return `${issue2.origin} daxilind\u0259 yanl\u0131\u015F d\u0259y\u0259r`;
      default:
        return `Yanl\u0131\u015F d\u0259y\u0259r`;
    }
  };
};
function az_default() {
  return {
    localeError: error2()
  };
}

// node_modules/zod/v4/locales/be.js
function getBelarusianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error3 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "\u0441\u0456\u043C\u0432\u0430\u043B",
        few: "\u0441\u0456\u043C\u0432\u0430\u043B\u044B",
        many: "\u0441\u0456\u043C\u0432\u0430\u043B\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    },
    array: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    },
    set: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    },
    file: {
      unit: {
        one: "\u0431\u0430\u0439\u0442",
        few: "\u0431\u0430\u0439\u0442\u044B",
        many: "\u0431\u0430\u0439\u0442\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u043B\u0456\u043A";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u043C\u0430\u0441\u0456\u045E";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0443\u0432\u043E\u0434",
    email: "email \u0430\u0434\u0440\u0430\u0441",
    url: "URL",
    emoji: "\u044D\u043C\u043E\u0434\u0437\u0456",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0434\u0430\u0442\u0430 \u0456 \u0447\u0430\u0441",
    date: "ISO \u0434\u0430\u0442\u0430",
    time: "ISO \u0447\u0430\u0441",
    duration: "ISO \u043F\u0440\u0430\u0446\u044F\u0433\u043B\u0430\u0441\u0446\u044C",
    ipv4: "IPv4 \u0430\u0434\u0440\u0430\u0441",
    ipv6: "IPv6 \u0430\u0434\u0440\u0430\u0441",
    cidrv4: "IPv4 \u0434\u044B\u044F\u043F\u0430\u0437\u043E\u043D",
    cidrv6: "IPv6 \u0434\u044B\u044F\u043F\u0430\u0437\u043E\u043D",
    base64: "\u0440\u0430\u0434\u043E\u043A \u0443 \u0444\u0430\u0440\u043C\u0430\u0446\u0435 base64",
    base64url: "\u0440\u0430\u0434\u043E\u043A \u0443 \u0444\u0430\u0440\u043C\u0430\u0446\u0435 base64url",
    json_string: "JSON \u0440\u0430\u0434\u043E\u043A",
    e164: "\u043D\u0443\u043C\u0430\u0440 E.164",
    jwt: "JWT",
    template_literal: "\u0443\u0432\u043E\u0434"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434: \u0447\u0430\u043A\u0430\u045E\u0441\u044F ${issue2.expected}, \u0430\u0442\u0440\u044B\u043C\u0430\u043D\u0430 ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0432\u0430\u0440\u044B\u044F\u043D\u0442: \u0447\u0430\u043A\u0430\u045E\u0441\u044F \u0430\u0434\u0437\u0456\u043D \u0437 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u0432\u044F\u043B\u0456\u043A\u0456: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u044D\u043D\u043D\u0435"} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 ${sizing.verb} ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u0432\u044F\u043B\u0456\u043A\u0456: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u044D\u043D\u043D\u0435"} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 \u0431\u044B\u0446\u044C ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u043C\u0430\u043B\u044B: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 ${sizing.verb} ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u043C\u0430\u043B\u044B: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 \u0431\u044B\u0446\u044C ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u043F\u0430\u0447\u044B\u043D\u0430\u0446\u0446\u0430 \u0437 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0437\u0430\u043A\u0430\u043D\u0447\u0432\u0430\u0446\u0446\u0430 \u043D\u0430 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0437\u043C\u044F\u0448\u0447\u0430\u0446\u044C "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0430\u0434\u043F\u0430\u0432\u044F\u0434\u0430\u0446\u044C \u0448\u0430\u0431\u043B\u043E\u043D\u0443 ${_issue.pattern}`;
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u043B\u0456\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0431\u044B\u0446\u044C \u043A\u0440\u0430\u0442\u043D\u044B\u043C ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u0430\u0441\u043F\u0430\u0437\u043D\u0430\u043D\u044B ${issue2.keys.length > 1 ? "\u043A\u043B\u044E\u0447\u044B" : "\u043A\u043B\u044E\u0447"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u043A\u043B\u044E\u0447 \u0443 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434";
      case "invalid_element":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u0430\u0435 \u0437\u043D\u0430\u0447\u044D\u043D\u043D\u0435 \u045E ${issue2.origin}`;
      default:
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434`;
    }
  };
};
function be_default() {
  return {
    localeError: error3()
  };
}

// node_modules/zod/v4/locales/ca.js
var error4 = () => {
  const Sizable = {
    string: { unit: "car\xE0cters", verb: "contenir" },
    file: { unit: "bytes", verb: "contenir" },
    array: { unit: "elements", verb: "contenir" },
    set: { unit: "elements", verb: "contenir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entrada",
    email: "adre\xE7a electr\xF2nica",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "durada ISO",
    ipv4: "adre\xE7a IPv4",
    ipv6: "adre\xE7a IPv6",
    cidrv4: "rang IPv4",
    cidrv6: "rang IPv6",
    base64: "cadena codificada en base64",
    base64url: "cadena codificada en base64url",
    json_string: "cadena JSON",
    e164: "n\xFAmero E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Tipus inv\xE0lid: s'esperava ${issue2.expected}, s'ha rebut ${parsedType4(issue2.input)}`;
      // return `Tipus invàlid: s'esperava ${issue.expected}, s'ha rebut ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Valor inv\xE0lid: s'esperava ${stringifyPrimitive(issue2.values[0])}`;
        return `Opci\xF3 inv\xE0lida: s'esperava una de ${joinValues(issue2.values, " o ")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "com a m\xE0xim" : "menys de";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} contingu\xE9s ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} fos ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "com a m\xEDnim" : "m\xE9s de";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Massa petit: s'esperava que ${issue2.origin} contingu\xE9s ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Massa petit: s'esperava que ${issue2.origin} fos ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Format inv\xE0lid: ha de comen\xE7ar amb "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Format inv\xE0lid: ha d'acabar amb "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Format inv\xE0lid: ha d'incloure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Format inv\xE0lid: ha de coincidir amb el patr\xF3 ${_issue.pattern}`;
        return `Format inv\xE0lid per a ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `N\xFAmero inv\xE0lid: ha de ser m\xFAltiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clau${issue2.keys.length > 1 ? "s" : ""} no reconeguda${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clau inv\xE0lida a ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inv\xE0lida";
      // Could also be "Tipus d'unió invàlid" but "Entrada invàlida" is more general
      case "invalid_element":
        return `Element inv\xE0lid a ${issue2.origin}`;
      default:
        return `Entrada inv\xE0lida`;
    }
  };
};
function ca_default() {
  return {
    localeError: error4()
  };
}

// node_modules/zod/v4/locales/cs.js
var error5 = () => {
  const Sizable = {
    string: { unit: "znak\u016F", verb: "m\xEDt" },
    file: { unit: "bajt\u016F", verb: "m\xEDt" },
    array: { unit: "prvk\u016F", verb: "m\xEDt" },
    set: { unit: "prvk\u016F", verb: "m\xEDt" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u010D\xEDslo";
      }
      case "string": {
        return "\u0159et\u011Bzec";
      }
      case "boolean": {
        return "boolean";
      }
      case "bigint": {
        return "bigint";
      }
      case "function": {
        return "funkce";
      }
      case "symbol": {
        return "symbol";
      }
      case "undefined": {
        return "undefined";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "pole";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "regul\xE1rn\xED v\xFDraz",
    email: "e-mailov\xE1 adresa",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "datum a \u010Das ve form\xE1tu ISO",
    date: "datum ve form\xE1tu ISO",
    time: "\u010Das ve form\xE1tu ISO",
    duration: "doba trv\xE1n\xED ISO",
    ipv4: "IPv4 adresa",
    ipv6: "IPv6 adresa",
    cidrv4: "rozsah IPv4",
    cidrv6: "rozsah IPv6",
    base64: "\u0159et\u011Bzec zak\xF3dovan\xFD ve form\xE1tu base64",
    base64url: "\u0159et\u011Bzec zak\xF3dovan\xFD ve form\xE1tu base64url",
    json_string: "\u0159et\u011Bzec ve form\xE1tu JSON",
    e164: "\u010D\xEDslo E.164",
    jwt: "JWT",
    template_literal: "vstup"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Neplatn\xFD vstup: o\u010Dek\xE1v\xE1no ${issue2.expected}, obdr\u017Eeno ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neplatn\xFD vstup: o\u010Dek\xE1v\xE1no ${stringifyPrimitive(issue2.values[0])}`;
        return `Neplatn\xE1 mo\u017Enost: o\u010Dek\xE1v\xE1na jedna z hodnot ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je p\u0159\xEDli\u0161 velk\xE1: ${issue2.origin ?? "hodnota"} mus\xED m\xEDt ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "prvk\u016F"}`;
        }
        return `Hodnota je p\u0159\xEDli\u0161 velk\xE1: ${issue2.origin ?? "hodnota"} mus\xED b\xFDt ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je p\u0159\xEDli\u0161 mal\xE1: ${issue2.origin ?? "hodnota"} mus\xED m\xEDt ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "prvk\u016F"}`;
        }
        return `Hodnota je p\u0159\xEDli\u0161 mal\xE1: ${issue2.origin ?? "hodnota"} mus\xED b\xFDt ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED za\u010D\xEDnat na "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED kon\u010Dit na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED obsahovat "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED odpov\xEDdat vzoru ${_issue.pattern}`;
        return `Neplatn\xFD form\xE1t ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neplatn\xE9 \u010D\xEDslo: mus\xED b\xFDt n\xE1sobkem ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nezn\xE1m\xE9 kl\xED\u010De: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neplatn\xFD kl\xED\u010D v ${issue2.origin}`;
      case "invalid_union":
        return "Neplatn\xFD vstup";
      case "invalid_element":
        return `Neplatn\xE1 hodnota v ${issue2.origin}`;
      default:
        return `Neplatn\xFD vstup`;
    }
  };
};
function cs_default() {
  return {
    localeError: error5()
  };
}

// node_modules/zod/v4/locales/de.js
var error6 = () => {
  const Sizable = {
    string: { unit: "Zeichen", verb: "zu haben" },
    file: { unit: "Bytes", verb: "zu haben" },
    array: { unit: "Elemente", verb: "zu haben" },
    set: { unit: "Elemente", verb: "zu haben" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "Zahl";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "Array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "Eingabe",
    email: "E-Mail-Adresse",
    url: "URL",
    emoji: "Emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-Datum und -Uhrzeit",
    date: "ISO-Datum",
    time: "ISO-Uhrzeit",
    duration: "ISO-Dauer",
    ipv4: "IPv4-Adresse",
    ipv6: "IPv6-Adresse",
    cidrv4: "IPv4-Bereich",
    cidrv6: "IPv6-Bereich",
    base64: "Base64-codierter String",
    base64url: "Base64-URL-codierter String",
    json_string: "JSON-String",
    e164: "E.164-Nummer",
    jwt: "JWT",
    template_literal: "Eingabe"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ung\xFCltige Eingabe: erwartet ${issue2.expected}, erhalten ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ung\xFCltige Eingabe: erwartet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ung\xFCltige Option: erwartet eine von ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Zu gro\xDF: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
        return `Zu gro\xDF: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ist`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} hat`;
        }
        return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ist`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ung\xFCltiger String: muss mit "${_issue.prefix}" beginnen`;
        if (_issue.format === "ends_with")
          return `Ung\xFCltiger String: muss mit "${_issue.suffix}" enden`;
        if (_issue.format === "includes")
          return `Ung\xFCltiger String: muss "${_issue.includes}" enthalten`;
        if (_issue.format === "regex")
          return `Ung\xFCltiger String: muss dem Muster ${_issue.pattern} entsprechen`;
        return `Ung\xFCltig: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ung\xFCltige Zahl: muss ein Vielfaches von ${issue2.divisor} sein`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Unbekannte Schl\xFCssel" : "Unbekannter Schl\xFCssel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ung\xFCltiger Schl\xFCssel in ${issue2.origin}`;
      case "invalid_union":
        return "Ung\xFCltige Eingabe";
      case "invalid_element":
        return `Ung\xFCltiger Wert in ${issue2.origin}`;
      default:
        return `Ung\xFCltige Eingabe`;
    }
  };
};
function de_default() {
  return {
    localeError: error6()
  };
}

// node_modules/zod/v4/locales/en.js
var parsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "number";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error7 = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Invalid input: expected ${issue2.expected}, received ${parsedType(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error7()
  };
}

// node_modules/zod/v4/locales/eo.js
var parsedType2 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "nombro";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "tabelo";
      }
      if (data === null) {
        return "senvalora";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error8 = () => {
  const Sizable = {
    string: { unit: "karaktrojn", verb: "havi" },
    file: { unit: "bajtojn", verb: "havi" },
    array: { unit: "elementojn", verb: "havi" },
    set: { unit: "elementojn", verb: "havi" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "enigo",
    email: "retadreso",
    url: "URL",
    emoji: "emo\u011Dio",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datotempo",
    date: "ISO-dato",
    time: "ISO-tempo",
    duration: "ISO-da\u016Dro",
    ipv4: "IPv4-adreso",
    ipv6: "IPv6-adreso",
    cidrv4: "IPv4-rango",
    cidrv6: "IPv6-rango",
    base64: "64-ume kodita karaktraro",
    base64url: "URL-64-ume kodita karaktraro",
    json_string: "JSON-karaktraro",
    e164: "E.164-nombro",
    jwt: "JWT",
    template_literal: "enigo"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Nevalida enigo: atendi\u011Dis ${issue2.expected}, ricevi\u011Dis ${parsedType2(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nevalida enigo: atendi\u011Dis ${stringifyPrimitive(issue2.values[0])}`;
        return `Nevalida opcio: atendi\u011Dis unu el ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Tro granda: atendi\u011Dis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
        return `Tro granda: atendi\u011Dis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Tro malgranda: atendi\u011Dis ke ${issue2.origin} havu ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Tro malgranda: atendi\u011Dis ke ${issue2.origin} estu ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nevalida karaktraro: devas komenci\u011Di per "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nevalida karaktraro: devas fini\u011Di per "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
        return `Nevalida ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nevalida nombro: devas esti oblo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nekonata${issue2.keys.length > 1 ? "j" : ""} \u015Dlosilo${issue2.keys.length > 1 ? "j" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nevalida \u015Dlosilo en ${issue2.origin}`;
      case "invalid_union":
        return "Nevalida enigo";
      case "invalid_element":
        return `Nevalida valoro en ${issue2.origin}`;
      default:
        return `Nevalida enigo`;
    }
  };
};
function eo_default() {
  return {
    localeError: error8()
  };
}

// node_modules/zod/v4/locales/es.js
var error9 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "tener" },
    file: { unit: "bytes", verb: "tener" },
    array: { unit: "elementos", verb: "tener" },
    set: { unit: "elementos", verb: "tener" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "n\xFAmero";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "arreglo";
        }
        if (data === null) {
          return "nulo";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entrada",
    email: "direcci\xF3n de correo electr\xF3nico",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "fecha y hora ISO",
    date: "fecha ISO",
    time: "hora ISO",
    duration: "duraci\xF3n ISO",
    ipv4: "direcci\xF3n IPv4",
    ipv6: "direcci\xF3n IPv6",
    cidrv4: "rango IPv4",
    cidrv6: "rango IPv6",
    base64: "cadena codificada en base64",
    base64url: "URL codificada en base64",
    json_string: "cadena JSON",
    e164: "n\xFAmero E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Entrada inv\xE1lida: se esperaba ${issue2.expected}, recibido ${parsedType4(issue2.input)}`;
      // return `Entrada inválida: se esperaba ${issue.expected}, recibido ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inv\xE1lida: se esperaba ${stringifyPrimitive(issue2.values[0])}`;
        return `Opci\xF3n inv\xE1lida: se esperaba una de ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Demasiado grande: se esperaba que ${issue2.origin ?? "valor"} tuviera ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Demasiado grande: se esperaba que ${issue2.origin ?? "valor"} fuera ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Demasiado peque\xF1o: se esperaba que ${issue2.origin} tuviera ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Demasiado peque\xF1o: se esperaba que ${issue2.origin} fuera ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Cadena inv\xE1lida: debe comenzar con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Cadena inv\xE1lida: debe terminar en "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cadena inv\xE1lida: debe incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cadena inv\xE1lida: debe coincidir con el patr\xF3n ${_issue.pattern}`;
        return `Inv\xE1lido ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `N\xFAmero inv\xE1lido: debe ser m\xFAltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Llave${issue2.keys.length > 1 ? "s" : ""} desconocida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Llave inv\xE1lida en ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inv\xE1lida";
      case "invalid_element":
        return `Valor inv\xE1lido en ${issue2.origin}`;
      default:
        return `Entrada inv\xE1lida`;
    }
  };
};
function es_default() {
  return {
    localeError: error9()
  };
}

// node_modules/zod/v4/locales/fa.js
var error10 = () => {
  const Sizable = {
    string: { unit: "\u06A9\u0627\u0631\u0627\u06A9\u062A\u0631", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" },
    file: { unit: "\u0628\u0627\u06CC\u062A", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" },
    array: { unit: "\u0622\u06CC\u062A\u0645", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" },
    set: { unit: "\u0622\u06CC\u062A\u0645", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0639\u062F\u062F";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u0622\u0631\u0627\u06CC\u0647";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0648\u0631\u0648\u062F\u06CC",
    email: "\u0622\u062F\u0631\u0633 \u0627\u06CC\u0645\u06CC\u0644",
    url: "URL",
    emoji: "\u0627\u06CC\u0645\u0648\u062C\u06CC",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u062A\u0627\u0631\u06CC\u062E \u0648 \u0632\u0645\u0627\u0646 \u0627\u06CC\u0632\u0648",
    date: "\u062A\u0627\u0631\u06CC\u062E \u0627\u06CC\u0632\u0648",
    time: "\u0632\u0645\u0627\u0646 \u0627\u06CC\u0632\u0648",
    duration: "\u0645\u062F\u062A \u0632\u0645\u0627\u0646 \u0627\u06CC\u0632\u0648",
    ipv4: "IPv4 \u0622\u062F\u0631\u0633",
    ipv6: "IPv6 \u0622\u062F\u0631\u0633",
    cidrv4: "IPv4 \u062F\u0627\u0645\u0646\u0647",
    cidrv6: "IPv6 \u062F\u0627\u0645\u0646\u0647",
    base64: "base64-encoded \u0631\u0634\u062A\u0647",
    base64url: "base64url-encoded \u0631\u0634\u062A\u0647",
    json_string: "JSON \u0631\u0634\u062A\u0647",
    e164: "E.164 \u0639\u062F\u062F",
    jwt: "JWT",
    template_literal: "\u0648\u0631\u0648\u062F\u06CC"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A ${issue2.expected} \u0645\u06CC\u200C\u0628\u0648\u062F\u060C ${parsedType4(issue2.input)} \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F`;
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A ${stringifyPrimitive(issue2.values[0])} \u0645\u06CC\u200C\u0628\u0648\u062F`;
        }
        return `\u06AF\u0632\u06CC\u0646\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u06CC\u06A9\u06CC \u0627\u0632 ${joinValues(issue2.values, "|")} \u0645\u06CC\u200C\u0628\u0648\u062F`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u062E\u06CC\u0644\u06CC \u0628\u0632\u0631\u06AF: ${issue2.origin ?? "\u0645\u0642\u062F\u0627\u0631"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0635\u0631"} \u0628\u0627\u0634\u062F`;
        }
        return `\u062E\u06CC\u0644\u06CC \u0628\u0632\u0631\u06AF: ${issue2.origin ?? "\u0645\u0642\u062F\u0627\u0631"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} \u0628\u0627\u0634\u062F`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u062E\u06CC\u0644\u06CC \u06A9\u0648\u0686\u06A9: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} ${sizing.unit} \u0628\u0627\u0634\u062F`;
        }
        return `\u062E\u06CC\u0644\u06CC \u06A9\u0648\u0686\u06A9: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} \u0628\u0627\u0634\u062F`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0628\u0627 "${_issue.prefix}" \u0634\u0631\u0648\u0639 \u0634\u0648\u062F`;
        }
        if (_issue.format === "ends_with") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0628\u0627 "${_issue.suffix}" \u062A\u0645\u0627\u0645 \u0634\u0648\u062F`;
        }
        if (_issue.format === "includes") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0634\u0627\u0645\u0644 "${_issue.includes}" \u0628\u0627\u0634\u062F`;
        }
        if (_issue.format === "regex") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0628\u0627 \u0627\u0644\u06AF\u0648\u06CC ${_issue.pattern} \u0645\u0637\u0627\u0628\u0642\u062A \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F`;
        }
        return `${Nouns[_issue.format] ?? issue2.format} \u0646\u0627\u0645\u0639\u062A\u0628\u0631`;
      }
      case "not_multiple_of":
        return `\u0639\u062F\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0645\u0636\u0631\u0628 ${issue2.divisor} \u0628\u0627\u0634\u062F`;
      case "unrecognized_keys":
        return `\u06A9\u0644\u06CC\u062F${issue2.keys.length > 1 ? "\u0647\u0627\u06CC" : ""} \u0646\u0627\u0634\u0646\u0627\u0633: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u06A9\u0644\u06CC\u062F \u0646\u0627\u0634\u0646\u0627\u0633 \u062F\u0631 ${issue2.origin}`;
      case "invalid_union":
        return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631`;
      case "invalid_element":
        return `\u0645\u0642\u062F\u0627\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u062F\u0631 ${issue2.origin}`;
      default:
        return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631`;
    }
  };
};
function fa_default() {
  return {
    localeError: error10()
  };
}

// node_modules/zod/v4/locales/fi.js
var error11 = () => {
  const Sizable = {
    string: { unit: "merkki\xE4", subject: "merkkijonon" },
    file: { unit: "tavua", subject: "tiedoston" },
    array: { unit: "alkiota", subject: "listan" },
    set: { unit: "alkiota", subject: "joukon" },
    number: { unit: "", subject: "luvun" },
    bigint: { unit: "", subject: "suuren kokonaisluvun" },
    int: { unit: "", subject: "kokonaisluvun" },
    date: { unit: "", subject: "p\xE4iv\xE4m\xE4\xE4r\xE4n" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "s\xE4\xE4nn\xF6llinen lauseke",
    email: "s\xE4hk\xF6postiosoite",
    url: "URL-osoite",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-aikaleima",
    date: "ISO-p\xE4iv\xE4m\xE4\xE4r\xE4",
    time: "ISO-aika",
    duration: "ISO-kesto",
    ipv4: "IPv4-osoite",
    ipv6: "IPv6-osoite",
    cidrv4: "IPv4-alue",
    cidrv6: "IPv6-alue",
    base64: "base64-koodattu merkkijono",
    base64url: "base64url-koodattu merkkijono",
    json_string: "JSON-merkkijono",
    e164: "E.164-luku",
    jwt: "JWT",
    template_literal: "templaattimerkkijono"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Virheellinen tyyppi: odotettiin ${issue2.expected}, oli ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Virheellinen sy\xF6te: t\xE4ytyy olla ${stringifyPrimitive(issue2.values[0])}`;
        return `Virheellinen valinta: t\xE4ytyy olla yksi seuraavista: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian suuri: ${sizing.subject} t\xE4ytyy olla ${adj}${issue2.maximum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian suuri: arvon t\xE4ytyy olla ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian pieni: ${sizing.subject} t\xE4ytyy olla ${adj}${issue2.minimum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian pieni: arvon t\xE4ytyy olla ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Virheellinen sy\xF6te: t\xE4ytyy alkaa "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Virheellinen sy\xF6te: t\xE4ytyy loppua "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Virheellinen sy\xF6te: t\xE4ytyy sis\xE4lt\xE4\xE4 "${_issue.includes}"`;
        if (_issue.format === "regex") {
          return `Virheellinen sy\xF6te: t\xE4ytyy vastata s\xE4\xE4nn\xF6llist\xE4 lauseketta ${_issue.pattern}`;
        }
        return `Virheellinen ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Virheellinen luku: t\xE4ytyy olla luvun ${issue2.divisor} monikerta`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Virheellinen avain tietueessa";
      case "invalid_union":
        return "Virheellinen unioni";
      case "invalid_element":
        return "Virheellinen arvo joukossa";
      default:
        return `Virheellinen sy\xF6te`;
    }
  };
};
function fi_default() {
  return {
    localeError: error11()
  };
}

// node_modules/zod/v4/locales/fr.js
var error12 = () => {
  const Sizable = {
    string: { unit: "caract\xE8res", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "\xE9l\xE9ments", verb: "avoir" },
    set: { unit: "\xE9l\xE9ments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "nombre";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tableau";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entr\xE9e",
    email: "adresse e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date et heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "dur\xE9e ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "cha\xEEne encod\xE9e en base64",
    base64url: "cha\xEEne encod\xE9e en base64url",
    json_string: "cha\xEEne JSON",
    e164: "num\xE9ro E.164",
    jwt: "JWT",
    template_literal: "entr\xE9e"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Entr\xE9e invalide : ${issue2.expected} attendu, ${parsedType4(issue2.input)} re\xE7u`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entr\xE9e invalide : ${stringifyPrimitive(issue2.values[0])} attendu`;
        return `Option invalide : une valeur parmi ${joinValues(issue2.values, "|")} attendue`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : ${issue2.origin ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\xE9l\xE9ment(s)"}`;
        return `Trop grand : ${issue2.origin ?? "valeur"} doit \xEAtre ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Trop petit : ${issue2.origin} doit ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Trop petit : ${issue2.origin} doit \xEAtre ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Cha\xEEne invalide : doit commencer par "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Cha\xEEne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cha\xEEne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cha\xEEne invalide : doit correspondre au mod\xE8le ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit \xEAtre un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Cl\xE9${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Cl\xE9 invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entr\xE9e invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entr\xE9e invalide`;
    }
  };
};
function fr_default() {
  return {
    localeError: error12()
  };
}

// node_modules/zod/v4/locales/fr-CA.js
var error13 = () => {
  const Sizable = {
    string: { unit: "caract\xE8res", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "\xE9l\xE9ments", verb: "avoir" },
    set: { unit: "\xE9l\xE9ments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entr\xE9e",
    email: "adresse courriel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date-heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "dur\xE9e ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "cha\xEEne encod\xE9e en base64",
    base64url: "cha\xEEne encod\xE9e en base64url",
    json_string: "cha\xEEne JSON",
    e164: "num\xE9ro E.164",
    jwt: "JWT",
    template_literal: "entr\xE9e"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Entr\xE9e invalide : attendu ${issue2.expected}, re\xE7u ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entr\xE9e invalide : attendu ${stringifyPrimitive(issue2.values[0])}`;
        return `Option invalide : attendu l'une des valeurs suivantes ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "\u2264" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} ait ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} soit ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\u2265" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Trop petit : attendu que ${issue2.origin} ait ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Trop petit : attendu que ${issue2.origin} soit ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Cha\xEEne invalide : doit commencer par "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Cha\xEEne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cha\xEEne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cha\xEEne invalide : doit correspondre au motif ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit \xEAtre un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Cl\xE9${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Cl\xE9 invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entr\xE9e invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entr\xE9e invalide`;
    }
  };
};
function fr_CA_default() {
  return {
    localeError: error13()
  };
}

// node_modules/zod/v4/locales/he.js
var error14 = () => {
  const Sizable = {
    string: { unit: "\u05D0\u05D5\u05EA\u05D9\u05D5\u05EA", verb: "\u05DC\u05DB\u05DC\u05D5\u05DC" },
    file: { unit: "\u05D1\u05D9\u05D9\u05D8\u05D9\u05DD", verb: "\u05DC\u05DB\u05DC\u05D5\u05DC" },
    array: { unit: "\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD", verb: "\u05DC\u05DB\u05DC\u05D5\u05DC" },
    set: { unit: "\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD", verb: "\u05DC\u05DB\u05DC\u05D5\u05DC" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u05E7\u05DC\u05D8",
    email: "\u05DB\u05EA\u05D5\u05D1\u05EA \u05D0\u05D9\u05DE\u05D9\u05D9\u05DC",
    url: "\u05DB\u05EA\u05D5\u05D1\u05EA \u05E8\u05E9\u05EA",
    emoji: "\u05D0\u05D9\u05DE\u05D5\u05D2'\u05D9",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05D6\u05DE\u05DF ISO",
    date: "\u05EA\u05D0\u05E8\u05D9\u05DA ISO",
    time: "\u05D6\u05DE\u05DF ISO",
    duration: "\u05DE\u05E9\u05DA \u05D6\u05DE\u05DF ISO",
    ipv4: "\u05DB\u05EA\u05D5\u05D1\u05EA IPv4",
    ipv6: "\u05DB\u05EA\u05D5\u05D1\u05EA IPv6",
    cidrv4: "\u05D8\u05D5\u05D5\u05D7 IPv4",
    cidrv6: "\u05D8\u05D5\u05D5\u05D7 IPv6",
    base64: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D1\u05D1\u05E1\u05D9\u05E1 64",
    base64url: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D1\u05D1\u05E1\u05D9\u05E1 64 \u05DC\u05DB\u05EA\u05D5\u05D1\u05D5\u05EA \u05E8\u05E9\u05EA",
    json_string: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA JSON",
    e164: "\u05DE\u05E1\u05E4\u05E8 E.164",
    jwt: "JWT",
    template_literal: "\u05E7\u05DC\u05D8"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05E6\u05E8\u05D9\u05DA ${issue2.expected}, \u05D4\u05EA\u05E7\u05D1\u05DC ${parsedType4(issue2.input)}`;
      // return `Invalid input: expected ${issue.expected}, received ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05E6\u05E8\u05D9\u05DA ${stringifyPrimitive(issue2.values[0])}`;
        return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05E6\u05E8\u05D9\u05DA \u05D0\u05D7\u05EA \u05DE\u05D4\u05D0\u05E4\u05E9\u05E8\u05D5\u05D9\u05D5\u05EA  ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9: ${issue2.origin ?? "value"} \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `\u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9: ${issue2.origin ?? "value"} \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u05E7\u05D8\u05DF \u05DE\u05D3\u05D9: ${issue2.origin} \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u05E7\u05D8\u05DF \u05DE\u05D3\u05D9: ${issue2.origin} \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4: \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC \u05D1"${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4: \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05D4\u05E1\u05EA\u05D9\u05D9\u05DD \u05D1 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4: \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05DB\u05DC\u05D5\u05DC "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4: \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05D4\u05EA\u05D0\u05D9\u05DD \u05DC\u05EA\u05D1\u05E0\u05D9\u05EA ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF`;
      }
      case "not_multiple_of":
        return `\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05DE\u05DB\u05E4\u05DC\u05D4 \u05E9\u05DC ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u05DE\u05E4\u05EA\u05D7${issue2.keys.length > 1 ? "\u05D5\u05EA" : ""} \u05DC\u05D0 \u05DE\u05D6\u05D5\u05D4${issue2.keys.length > 1 ? "\u05D9\u05DD" : "\u05D4"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u05DE\u05E4\u05EA\u05D7 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF \u05D1${issue2.origin}`;
      case "invalid_union":
        return "\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF";
      case "invalid_element":
        return `\u05E2\u05E8\u05DA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF \u05D1${issue2.origin}`;
      default:
        return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF`;
    }
  };
};
function he_default() {
  return {
    localeError: error14()
  };
}

// node_modules/zod/v4/locales/hu.js
var error15 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "legyen" },
    file: { unit: "byte", verb: "legyen" },
    array: { unit: "elem", verb: "legyen" },
    set: { unit: "elem", verb: "legyen" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "sz\xE1m";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "t\xF6mb";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "bemenet",
    email: "email c\xEDm",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO id\u0151b\xE9lyeg",
    date: "ISO d\xE1tum",
    time: "ISO id\u0151",
    duration: "ISO id\u0151intervallum",
    ipv4: "IPv4 c\xEDm",
    ipv6: "IPv6 c\xEDm",
    cidrv4: "IPv4 tartom\xE1ny",
    cidrv6: "IPv6 tartom\xE1ny",
    base64: "base64-k\xF3dolt string",
    base64url: "base64url-k\xF3dolt string",
    json_string: "JSON string",
    e164: "E.164 sz\xE1m",
    jwt: "JWT",
    template_literal: "bemenet"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\xC9rv\xE9nytelen bemenet: a v\xE1rt \xE9rt\xE9k ${issue2.expected}, a kapott \xE9rt\xE9k ${parsedType4(issue2.input)}`;
      // return `Invalid input: expected ${issue.expected}, received ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\xC9rv\xE9nytelen bemenet: a v\xE1rt \xE9rt\xE9k ${stringifyPrimitive(issue2.values[0])}`;
        return `\xC9rv\xE9nytelen opci\xF3: valamelyik \xE9rt\xE9k v\xE1rt ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `T\xFAl nagy: ${issue2.origin ?? "\xE9rt\xE9k"} m\xE9rete t\xFAl nagy ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elem"}`;
        return `T\xFAl nagy: a bemeneti \xE9rt\xE9k ${issue2.origin ?? "\xE9rt\xE9k"} t\xFAl nagy: ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `T\xFAl kicsi: a bemeneti \xE9rt\xE9k ${issue2.origin} m\xE9rete t\xFAl kicsi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `T\xFAl kicsi: a bemeneti \xE9rt\xE9k ${issue2.origin} t\xFAl kicsi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\xC9rv\xE9nytelen string: "${_issue.prefix}" \xE9rt\xE9kkel kell kezd\u0151dnie`;
        if (_issue.format === "ends_with")
          return `\xC9rv\xE9nytelen string: "${_issue.suffix}" \xE9rt\xE9kkel kell v\xE9gz\u0151dnie`;
        if (_issue.format === "includes")
          return `\xC9rv\xE9nytelen string: "${_issue.includes}" \xE9rt\xE9ket kell tartalmaznia`;
        if (_issue.format === "regex")
          return `\xC9rv\xE9nytelen string: ${_issue.pattern} mint\xE1nak kell megfelelnie`;
        return `\xC9rv\xE9nytelen ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\xC9rv\xE9nytelen sz\xE1m: ${issue2.divisor} t\xF6bbsz\xF6r\xF6s\xE9nek kell lennie`;
      case "unrecognized_keys":
        return `Ismeretlen kulcs${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\xC9rv\xE9nytelen kulcs ${issue2.origin}`;
      case "invalid_union":
        return "\xC9rv\xE9nytelen bemenet";
      case "invalid_element":
        return `\xC9rv\xE9nytelen \xE9rt\xE9k: ${issue2.origin}`;
      default:
        return `\xC9rv\xE9nytelen bemenet`;
    }
  };
};
function hu_default() {
  return {
    localeError: error15()
  };
}

// node_modules/zod/v4/locales/id.js
var error16 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "memiliki" },
    file: { unit: "byte", verb: "memiliki" },
    array: { unit: "item", verb: "memiliki" },
    set: { unit: "item", verb: "memiliki" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "alamat email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tanggal dan waktu format ISO",
    date: "tanggal format ISO",
    time: "jam format ISO",
    duration: "durasi format ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "rentang alamat IPv4",
    cidrv6: "rentang alamat IPv6",
    base64: "string dengan enkode base64",
    base64url: "string dengan enkode base64url",
    json_string: "string JSON",
    e164: "angka E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Input tidak valid: diharapkan ${issue2.expected}, diterima ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak valid: diharapkan ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak valid: diharapkan salah satu dari ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} memiliki ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} menjadi ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: diharapkan ${issue2.origin} memiliki ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: diharapkan ${issue2.origin} menjadi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak valid: harus menyertakan "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} tidak valid`;
      }
      case "not_multiple_of":
        return `Angka tidak valid: harus kelipatan dari ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak valid di ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak valid";
      case "invalid_element":
        return `Nilai tidak valid di ${issue2.origin}`;
      default:
        return `Input tidak valid`;
    }
  };
};
function id_default() {
  return {
    localeError: error16()
  };
}

// node_modules/zod/v4/locales/it.js
var error17 = () => {
  const Sizable = {
    string: { unit: "caratteri", verb: "avere" },
    file: { unit: "byte", verb: "avere" },
    array: { unit: "elementi", verb: "avere" },
    set: { unit: "elementi", verb: "avere" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "numero";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "vettore";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "indirizzo email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e ora ISO",
    date: "data ISO",
    time: "ora ISO",
    duration: "durata ISO",
    ipv4: "indirizzo IPv4",
    ipv6: "indirizzo IPv6",
    cidrv4: "intervallo IPv4",
    cidrv6: "intervallo IPv6",
    base64: "stringa codificata in base64",
    base64url: "URL codificata in base64",
    json_string: "stringa JSON",
    e164: "numero E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Input non valido: atteso ${issue2.expected}, ricevuto ${parsedType4(issue2.input)}`;
      // return `Input non valido: atteso ${issue.expected}, ricevuto ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input non valido: atteso ${stringifyPrimitive(issue2.values[0])}`;
        return `Opzione non valida: atteso uno tra ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Troppo grande: ${issue2.origin ?? "valore"} deve avere ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementi"}`;
        return `Troppo grande: ${issue2.origin ?? "valore"} deve essere ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Troppo piccolo: ${issue2.origin} deve avere ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Troppo piccolo: ${issue2.origin} deve essere ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Stringa non valida: deve includere "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Numero non valido: deve essere un multiplo di ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chiav${issue2.keys.length > 1 ? "i" : "e"} non riconosciut${issue2.keys.length > 1 ? "e" : "a"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chiave non valida in ${issue2.origin}`;
      case "invalid_union":
        return "Input non valido";
      case "invalid_element":
        return `Valore non valido in ${issue2.origin}`;
      default:
        return `Input non valido`;
    }
  };
};
function it_default() {
  return {
    localeError: error17()
  };
}

// node_modules/zod/v4/locales/ja.js
var error18 = () => {
  const Sizable = {
    string: { unit: "\u6587\u5B57", verb: "\u3067\u3042\u308B" },
    file: { unit: "\u30D0\u30A4\u30C8", verb: "\u3067\u3042\u308B" },
    array: { unit: "\u8981\u7D20", verb: "\u3067\u3042\u308B" },
    set: { unit: "\u8981\u7D20", verb: "\u3067\u3042\u308B" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u6570\u5024";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u914D\u5217";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u5165\u529B\u5024",
    email: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9",
    url: "URL",
    emoji: "\u7D75\u6587\u5B57",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO\u65E5\u6642",
    date: "ISO\u65E5\u4ED8",
    time: "ISO\u6642\u523B",
    duration: "ISO\u671F\u9593",
    ipv4: "IPv4\u30A2\u30C9\u30EC\u30B9",
    ipv6: "IPv6\u30A2\u30C9\u30EC\u30B9",
    cidrv4: "IPv4\u7BC4\u56F2",
    cidrv6: "IPv6\u7BC4\u56F2",
    base64: "base64\u30A8\u30F3\u30B3\u30FC\u30C9\u6587\u5B57\u5217",
    base64url: "base64url\u30A8\u30F3\u30B3\u30FC\u30C9\u6587\u5B57\u5217",
    json_string: "JSON\u6587\u5B57\u5217",
    e164: "E.164\u756A\u53F7",
    jwt: "JWT",
    template_literal: "\u5165\u529B\u5024"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u7121\u52B9\u306A\u5165\u529B: ${issue2.expected}\u304C\u671F\u5F85\u3055\u308C\u307E\u3057\u305F\u304C\u3001${parsedType4(issue2.input)}\u304C\u5165\u529B\u3055\u308C\u307E\u3057\u305F`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u7121\u52B9\u306A\u5165\u529B: ${stringifyPrimitive(issue2.values[0])}\u304C\u671F\u5F85\u3055\u308C\u307E\u3057\u305F`;
        return `\u7121\u52B9\u306A\u9078\u629E: ${joinValues(issue2.values, "\u3001")}\u306E\u3044\u305A\u308C\u304B\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      case "too_big": {
        const adj = issue2.inclusive ? "\u4EE5\u4E0B\u3067\u3042\u308B" : "\u3088\u308A\u5C0F\u3055\u3044";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u5927\u304D\u3059\u304E\u308B\u5024: ${issue2.origin ?? "\u5024"}\u306F${issue2.maximum.toString()}${sizing.unit ?? "\u8981\u7D20"}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        return `\u5927\u304D\u3059\u304E\u308B\u5024: ${issue2.origin ?? "\u5024"}\u306F${issue2.maximum.toString()}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\u4EE5\u4E0A\u3067\u3042\u308B" : "\u3088\u308A\u5927\u304D\u3044";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u5C0F\u3055\u3059\u304E\u308B\u5024: ${issue2.origin}\u306F${issue2.minimum.toString()}${sizing.unit}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        return `\u5C0F\u3055\u3059\u304E\u308B\u5024: ${issue2.origin}\u306F${issue2.minimum.toString()}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: "${_issue.prefix}"\u3067\u59CB\u307E\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        if (_issue.format === "ends_with")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: "${_issue.suffix}"\u3067\u7D42\u308F\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        if (_issue.format === "includes")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: "${_issue.includes}"\u3092\u542B\u3080\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        if (_issue.format === "regex")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: \u30D1\u30BF\u30FC\u30F3${_issue.pattern}\u306B\u4E00\u81F4\u3059\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        return `\u7121\u52B9\u306A${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u7121\u52B9\u306A\u6570\u5024: ${issue2.divisor}\u306E\u500D\u6570\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      case "unrecognized_keys":
        return `\u8A8D\u8B58\u3055\u308C\u3066\u3044\u306A\u3044\u30AD\u30FC${issue2.keys.length > 1 ? "\u7FA4" : ""}: ${joinValues(issue2.keys, "\u3001")}`;
      case "invalid_key":
        return `${issue2.origin}\u5185\u306E\u7121\u52B9\u306A\u30AD\u30FC`;
      case "invalid_union":
        return "\u7121\u52B9\u306A\u5165\u529B";
      case "invalid_element":
        return `${issue2.origin}\u5185\u306E\u7121\u52B9\u306A\u5024`;
      default:
        return `\u7121\u52B9\u306A\u5165\u529B`;
    }
  };
};
function ja_default() {
  return {
    localeError: error18()
  };
}

// node_modules/zod/v4/locales/kh.js
var error19 = () => {
  const Sizable = {
    string: { unit: "\u178F\u17BD\u17A2\u1780\u17D2\u179F\u179A", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" },
    file: { unit: "\u1794\u17C3", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" },
    array: { unit: "\u1792\u17B6\u178F\u17BB", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" },
    set: { unit: "\u1792\u17B6\u178F\u17BB", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "\u1798\u17B7\u1793\u1798\u17C2\u1793\u1787\u17B6\u179B\u17C1\u1781 (NaN)" : "\u179B\u17C1\u1781";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u17A2\u17B6\u179A\u17C1 (Array)";
        }
        if (data === null) {
          return "\u1782\u17D2\u1798\u17B6\u1793\u178F\u1798\u17D2\u179B\u17C3 (null)";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B",
    email: "\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793\u17A2\u17CA\u17B8\u1798\u17C2\u179B",
    url: "URL",
    emoji: "\u179F\u1789\u17D2\u1789\u17B6\u17A2\u17B6\u179A\u1798\u17D2\u1798\u178E\u17CD",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u1780\u17B6\u179B\u1794\u179A\u17B7\u1785\u17D2\u1786\u17C1\u1791 \u1793\u17B7\u1784\u1798\u17C9\u17C4\u1784 ISO",
    date: "\u1780\u17B6\u179B\u1794\u179A\u17B7\u1785\u17D2\u1786\u17C1\u1791 ISO",
    time: "\u1798\u17C9\u17C4\u1784 ISO",
    duration: "\u179A\u1799\u17C8\u1796\u17C1\u179B ISO",
    ipv4: "\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv4",
    ipv6: "\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv6",
    cidrv4: "\u178A\u17C2\u1793\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv4",
    cidrv6: "\u178A\u17C2\u1793\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv6",
    base64: "\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u17A2\u17CA\u17B7\u1780\u17BC\u178A base64",
    base64url: "\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u17A2\u17CA\u17B7\u1780\u17BC\u178A base64url",
    json_string: "\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A JSON",
    e164: "\u179B\u17C1\u1781 E.164",
    jwt: "JWT",
    template_literal: "\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.expected} \u1794\u17C9\u17BB\u1793\u17D2\u178F\u17C2\u1791\u1791\u17BD\u179B\u1794\u17B6\u1793 ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${stringifyPrimitive(issue2.values[0])}`;
        return `\u1787\u1798\u17D2\u179A\u17BE\u179F\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1787\u17B6\u1798\u17BD\u1799\u1780\u17D2\u1793\u17BB\u1784\u1785\u17C6\u178E\u17C4\u1798 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u1792\u17C6\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin ?? "\u178F\u1798\u17D2\u179B\u17C3"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "\u1792\u17B6\u178F\u17BB"}`;
        return `\u1792\u17C6\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin ?? "\u178F\u1798\u17D2\u179B\u17C3"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u178F\u17BC\u1785\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u178F\u17BC\u1785\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin} ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1785\u17B6\u1794\u17CB\u1795\u17D2\u178F\u17BE\u1798\u178A\u17C4\u1799 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1794\u1789\u17D2\u1785\u1794\u17CB\u178A\u17C4\u1799 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1798\u17B6\u1793 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u178F\u17C2\u1795\u17D2\u1782\u17BC\u1795\u17D2\u1782\u1784\u1793\u17B9\u1784\u1791\u1798\u17D2\u179A\u1784\u17CB\u178A\u17C2\u179B\u1794\u17B6\u1793\u1780\u17C6\u178E\u178F\u17CB ${_issue.pattern}`;
        return `\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u179B\u17C1\u1781\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u178F\u17C2\u1787\u17B6\u1796\u17A0\u17BB\u1782\u17BB\u178E\u1793\u17C3 ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u179A\u1780\u1783\u17BE\u1789\u179F\u17C4\u1798\u17B7\u1793\u179F\u17D2\u1782\u17B6\u179B\u17CB\u17D6 ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u179F\u17C4\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u1793\u17C5\u1780\u17D2\u1793\u17BB\u1784 ${issue2.origin}`;
      case "invalid_union":
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C`;
      case "invalid_element":
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u1793\u17C5\u1780\u17D2\u1793\u17BB\u1784 ${issue2.origin}`;
      default:
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C`;
    }
  };
};
function kh_default() {
  return {
    localeError: error19()
  };
}

// node_modules/zod/v4/locales/ko.js
var error20 = () => {
  const Sizable = {
    string: { unit: "\uBB38\uC790", verb: "to have" },
    file: { unit: "\uBC14\uC774\uD2B8", verb: "to have" },
    array: { unit: "\uAC1C", verb: "to have" },
    set: { unit: "\uAC1C", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\uC785\uB825",
    email: "\uC774\uBA54\uC77C \uC8FC\uC18C",
    url: "URL",
    emoji: "\uC774\uBAA8\uC9C0",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \uB0A0\uC9DC\uC2DC\uAC04",
    date: "ISO \uB0A0\uC9DC",
    time: "ISO \uC2DC\uAC04",
    duration: "ISO \uAE30\uAC04",
    ipv4: "IPv4 \uC8FC\uC18C",
    ipv6: "IPv6 \uC8FC\uC18C",
    cidrv4: "IPv4 \uBC94\uC704",
    cidrv6: "IPv6 \uBC94\uC704",
    base64: "base64 \uC778\uCF54\uB529 \uBB38\uC790\uC5F4",
    base64url: "base64url \uC778\uCF54\uB529 \uBB38\uC790\uC5F4",
    json_string: "JSON \uBB38\uC790\uC5F4",
    e164: "E.164 \uBC88\uD638",
    jwt: "JWT",
    template_literal: "\uC785\uB825"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\uC798\uBABB\uB41C \uC785\uB825: \uC608\uC0C1 \uD0C0\uC785\uC740 ${issue2.expected}, \uBC1B\uC740 \uD0C0\uC785\uC740 ${parsedType4(issue2.input)}\uC785\uB2C8\uB2E4`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\uC798\uBABB\uB41C \uC785\uB825: \uAC12\uC740 ${stringifyPrimitive(issue2.values[0])} \uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4`;
        return `\uC798\uBABB\uB41C \uC635\uC158: ${joinValues(issue2.values, "\uB610\uB294 ")} \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4`;
      case "too_big": {
        const adj = issue2.inclusive ? "\uC774\uD558" : "\uBBF8\uB9CC";
        const suffix = adj === "\uBBF8\uB9CC" ? "\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" : "\uC5EC\uC57C \uD569\uB2C8\uB2E4";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "\uC694\uC18C";
        if (sizing)
          return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4: ${issue2.maximum.toString()}${unit} ${adj}${suffix}`;
        return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4: ${issue2.maximum.toString()} ${adj}${suffix}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\uC774\uC0C1" : "\uCD08\uACFC";
        const suffix = adj === "\uC774\uC0C1" ? "\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" : "\uC5EC\uC57C \uD569\uB2C8\uB2E4";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "\uC694\uC18C";
        if (sizing) {
          return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uC791\uC2B5\uB2C8\uB2E4: ${issue2.minimum.toString()}${unit} ${adj}${suffix}`;
        }
        return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uC791\uC2B5\uB2C8\uB2E4: ${issue2.minimum.toString()} ${adj}${suffix}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: "${_issue.prefix}"(\uC73C)\uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4`;
        }
        if (_issue.format === "ends_with")
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: "${_issue.suffix}"(\uC73C)\uB85C \uB05D\uB098\uC57C \uD569\uB2C8\uB2E4`;
        if (_issue.format === "includes")
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: "${_issue.includes}"\uC744(\uB97C) \uD3EC\uD568\uD574\uC57C \uD569\uB2C8\uB2E4`;
        if (_issue.format === "regex")
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: \uC815\uADDC\uC2DD ${_issue.pattern} \uD328\uD134\uACFC \uC77C\uCE58\uD574\uC57C \uD569\uB2C8\uB2E4`;
        return `\uC798\uBABB\uB41C ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\uC798\uBABB\uB41C \uC22B\uC790: ${issue2.divisor}\uC758 \uBC30\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4`;
      case "unrecognized_keys":
        return `\uC778\uC2DD\uD560 \uC218 \uC5C6\uB294 \uD0A4: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\uC798\uBABB\uB41C \uD0A4: ${issue2.origin}`;
      case "invalid_union":
        return `\uC798\uBABB\uB41C \uC785\uB825`;
      case "invalid_element":
        return `\uC798\uBABB\uB41C \uAC12: ${issue2.origin}`;
      default:
        return `\uC798\uBABB\uB41C \uC785\uB825`;
    }
  };
};
function ko_default() {
  return {
    localeError: error20()
  };
}

// node_modules/zod/v4/locales/mk.js
var error21 = () => {
  const Sizable = {
    string: { unit: "\u0437\u043D\u0430\u0446\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" },
    file: { unit: "\u0431\u0430\u0458\u0442\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" },
    array: { unit: "\u0441\u0442\u0430\u0432\u043A\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" },
    set: { unit: "\u0441\u0442\u0430\u0432\u043A\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0431\u0440\u043E\u0458";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u043D\u0438\u0437\u0430";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0432\u043D\u0435\u0441",
    email: "\u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0430 \u0435-\u043F\u043E\u0448\u0442\u0430",
    url: "URL",
    emoji: "\u0435\u043C\u043E\u045F\u0438",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0434\u0430\u0442\u0443\u043C \u0438 \u0432\u0440\u0435\u043C\u0435",
    date: "ISO \u0434\u0430\u0442\u0443\u043C",
    time: "ISO \u0432\u0440\u0435\u043C\u0435",
    duration: "ISO \u0432\u0440\u0435\u043C\u0435\u0442\u0440\u0430\u0435\u045A\u0435",
    ipv4: "IPv4 \u0430\u0434\u0440\u0435\u0441\u0430",
    ipv6: "IPv6 \u0430\u0434\u0440\u0435\u0441\u0430",
    cidrv4: "IPv4 \u043E\u043F\u0441\u0435\u0433",
    cidrv6: "IPv6 \u043E\u043F\u0441\u0435\u0433",
    base64: "base64-\u0435\u043D\u043A\u043E\u0434\u0438\u0440\u0430\u043D\u0430 \u043D\u0438\u0437\u0430",
    base64url: "base64url-\u0435\u043D\u043A\u043E\u0434\u0438\u0440\u0430\u043D\u0430 \u043D\u0438\u0437\u0430",
    json_string: "JSON \u043D\u0438\u0437\u0430",
    e164: "E.164 \u0431\u0440\u043E\u0458",
    jwt: "JWT",
    template_literal: "\u0432\u043D\u0435\u0441"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.expected}, \u043F\u0440\u0438\u043C\u0435\u043D\u043E ${parsedType4(issue2.input)}`;
      // return `Invalid input: expected ${issue.expected}, received ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0413\u0440\u0435\u0448\u0430\u043D\u0430 \u043E\u043F\u0446\u0438\u0458\u0430: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 \u0435\u0434\u043D\u0430 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u0433\u043E\u043B\u0435\u043C: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin ?? "\u0432\u0440\u0435\u0434\u043D\u043E\u0441\u0442\u0430"} \u0434\u0430 \u0438\u043C\u0430 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0438"}`;
        return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u0433\u043E\u043B\u0435\u043C: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin ?? "\u0432\u0440\u0435\u0434\u043D\u043E\u0441\u0442\u0430"} \u0434\u0430 \u0431\u0438\u0434\u0435 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u043C\u0430\u043B: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin} \u0434\u0430 \u0438\u043C\u0430 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u043C\u0430\u043B: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin} \u0434\u0430 \u0431\u0438\u0434\u0435 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0437\u0430\u043F\u043E\u0447\u043D\u0443\u0432\u0430 \u0441\u043E "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0437\u0430\u0432\u0440\u0448\u0443\u0432\u0430 \u0441\u043E "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0432\u043A\u043B\u0443\u0447\u0443\u0432\u0430 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u043E\u0434\u0433\u043E\u0430\u0440\u0430 \u043D\u0430 \u043F\u0430\u0442\u0435\u0440\u043D\u043E\u0442 ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u0431\u0440\u043E\u0458: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0431\u0438\u0434\u0435 \u0434\u0435\u043B\u0438\u0432 \u0441\u043E ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "\u041D\u0435\u043F\u0440\u0435\u043F\u043E\u0437\u043D\u0430\u0435\u043D\u0438 \u043A\u043B\u0443\u0447\u0435\u0432\u0438" : "\u041D\u0435\u043F\u0440\u0435\u043F\u043E\u0437\u043D\u0430\u0435\u043D \u043A\u043B\u0443\u0447"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u043A\u043B\u0443\u0447 \u0432\u043E ${issue2.origin}`;
      case "invalid_union":
        return "\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441";
      case "invalid_element":
        return `\u0413\u0440\u0435\u0448\u043D\u0430 \u0432\u0440\u0435\u0434\u043D\u043E\u0441\u0442 \u0432\u043E ${issue2.origin}`;
      default:
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441`;
    }
  };
};
function mk_default() {
  return {
    localeError: error21()
  };
}

// node_modules/zod/v4/locales/ms.js
var error22 = () => {
  const Sizable = {
    string: { unit: "aksara", verb: "mempunyai" },
    file: { unit: "bait", verb: "mempunyai" },
    array: { unit: "elemen", verb: "mempunyai" },
    set: { unit: "elemen", verb: "mempunyai" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "nombor";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "alamat e-mel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tarikh masa ISO",
    date: "tarikh ISO",
    time: "masa ISO",
    duration: "tempoh ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "julat IPv4",
    cidrv6: "julat IPv6",
    base64: "string dikodkan base64",
    base64url: "string dikodkan base64url",
    json_string: "string JSON",
    e164: "nombor E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Input tidak sah: dijangka ${issue2.expected}, diterima ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak sah: dijangka ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak sah: dijangka salah satu daripada ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} adalah ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: dijangka ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: dijangka ${issue2.origin} adalah ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} tidak sah`;
      }
      case "not_multiple_of":
        return `Nombor tidak sah: perlu gandaan ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak sah dalam ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak sah";
      case "invalid_element":
        return `Nilai tidak sah dalam ${issue2.origin}`;
      default:
        return `Input tidak sah`;
    }
  };
};
function ms_default() {
  return {
    localeError: error22()
  };
}

// node_modules/zod/v4/locales/nl.js
var error23 = () => {
  const Sizable = {
    string: { unit: "tekens" },
    file: { unit: "bytes" },
    array: { unit: "elementen" },
    set: { unit: "elementen" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "getal";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "invoer",
    email: "emailadres",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum en tijd",
    date: "ISO datum",
    time: "ISO tijd",
    duration: "ISO duur",
    ipv4: "IPv4-adres",
    ipv6: "IPv6-adres",
    cidrv4: "IPv4-bereik",
    cidrv6: "IPv6-bereik",
    base64: "base64-gecodeerde tekst",
    base64url: "base64 URL-gecodeerde tekst",
    json_string: "JSON string",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "invoer"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ongeldige invoer: verwacht ${issue2.expected}, ontving ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ongeldige invoer: verwacht ${stringifyPrimitive(issue2.values[0])}`;
        return `Ongeldige optie: verwacht \xE9\xE9n van ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Te lang: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementen"} bevat`;
        return `Te lang: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} is`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Te kort: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} bevat`;
        }
        return `Te kort: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} is`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
        }
        if (_issue.format === "ends_with")
          return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
        if (_issue.format === "includes")
          return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
        if (_issue.format === "regex")
          return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
        return `Ongeldig: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ongeldig getal: moet een veelvoud van ${issue2.divisor} zijn`;
      case "unrecognized_keys":
        return `Onbekende key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ongeldige key in ${issue2.origin}`;
      case "invalid_union":
        return "Ongeldige invoer";
      case "invalid_element":
        return `Ongeldige waarde in ${issue2.origin}`;
      default:
        return `Ongeldige invoer`;
    }
  };
};
function nl_default() {
  return {
    localeError: error23()
  };
}

// node_modules/zod/v4/locales/no.js
var error24 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "\xE5 ha" },
    file: { unit: "bytes", verb: "\xE5 ha" },
    array: { unit: "elementer", verb: "\xE5 inneholde" },
    set: { unit: "elementer", verb: "\xE5 inneholde" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "tall";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "liste";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "e-postadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkeslett",
    date: "ISO-dato",
    time: "ISO-klokkeslett",
    duration: "ISO-varighet",
    ipv4: "IPv4-omr\xE5de",
    ipv6: "IPv6-omr\xE5de",
    cidrv4: "IPv4-spekter",
    cidrv6: "IPv6-spekter",
    base64: "base64-enkodet streng",
    base64url: "base64url-enkodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ugyldig input: forventet ${issue2.expected}, fikk ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig verdi: forventet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldig valg: forventet en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `For stor(t): forventet ${issue2.origin ?? "value"} til \xE5 ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor(t): forventet ${issue2.origin ?? "value"} til \xE5 ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `For lite(n): forventet ${issue2.origin} til \xE5 ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lite(n): forventet ${issue2.origin} til \xE5 ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: m\xE5 starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: m\xE5 ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: m\xE5 inneholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: m\xE5 matche m\xF8nsteret ${_issue.pattern}`;
        return `Ugyldig ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldig tall: m\xE5 v\xE6re et multiplum av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukjente n\xF8kler" : "Ukjent n\xF8kkel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig n\xF8kkel i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldig input";
      case "invalid_element":
        return `Ugyldig verdi i ${issue2.origin}`;
      default:
        return `Ugyldig input`;
    }
  };
};
function no_default() {
  return {
    localeError: error24()
  };
}

// node_modules/zod/v4/locales/ota.js
var error25 = () => {
  const Sizable = {
    string: { unit: "harf", verb: "olmal\u0131d\u0131r" },
    file: { unit: "bayt", verb: "olmal\u0131d\u0131r" },
    array: { unit: "unsur", verb: "olmal\u0131d\u0131r" },
    set: { unit: "unsur", verb: "olmal\u0131d\u0131r" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "numara";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "saf";
        }
        if (data === null) {
          return "gayb";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "giren",
    email: "epostag\xE2h",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO heng\xE2m\u0131",
    date: "ISO tarihi",
    time: "ISO zaman\u0131",
    duration: "ISO m\xFCddeti",
    ipv4: "IPv4 ni\u015F\xE2n\u0131",
    ipv6: "IPv6 ni\u015F\xE2n\u0131",
    cidrv4: "IPv4 menzili",
    cidrv6: "IPv6 menzili",
    base64: "base64-\u015Fifreli metin",
    base64url: "base64url-\u015Fifreli metin",
    json_string: "JSON metin",
    e164: "E.164 say\u0131s\u0131",
    jwt: "JWT",
    template_literal: "giren"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `F\xE2sit giren: umulan ${issue2.expected}, al\u0131nan ${parsedType4(issue2.input)}`;
      // return `Fâsit giren: umulan ${issue.expected}, alınan ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `F\xE2sit giren: umulan ${stringifyPrimitive(issue2.values[0])}`;
        return `F\xE2sit tercih: m\xFBteberler ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Fazla b\xFCy\xFCk: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmal\u0131yd\u0131.`;
        return `Fazla b\xFCy\xFCk: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} olmal\u0131yd\u0131.`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Fazla k\xFC\xE7\xFCk: ${issue2.origin}, ${adj}${issue2.minimum.toString()} ${sizing.unit} sahip olmal\u0131yd\u0131.`;
        }
        return `Fazla k\xFC\xE7\xFCk: ${issue2.origin}, ${adj}${issue2.minimum.toString()} olmal\u0131yd\u0131.`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `F\xE2sit metin: "${_issue.prefix}" ile ba\u015Flamal\u0131.`;
        if (_issue.format === "ends_with")
          return `F\xE2sit metin: "${_issue.suffix}" ile bitmeli.`;
        if (_issue.format === "includes")
          return `F\xE2sit metin: "${_issue.includes}" ihtiv\xE2 etmeli.`;
        if (_issue.format === "regex")
          return `F\xE2sit metin: ${_issue.pattern} nak\u015F\u0131na uymal\u0131.`;
        return `F\xE2sit ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `F\xE2sit say\u0131: ${issue2.divisor} kat\u0131 olmal\u0131yd\u0131.`;
      case "unrecognized_keys":
        return `Tan\u0131nmayan anahtar ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} i\xE7in tan\u0131nmayan anahtar var.`;
      case "invalid_union":
        return "Giren tan\u0131namad\u0131.";
      case "invalid_element":
        return `${issue2.origin} i\xE7in tan\u0131nmayan k\u0131ymet var.`;
      default:
        return `K\u0131ymet tan\u0131namad\u0131.`;
    }
  };
};
function ota_default() {
  return {
    localeError: error25()
  };
}

// node_modules/zod/v4/locales/ps.js
var error26 = () => {
  const Sizable = {
    string: { unit: "\u062A\u0648\u06A9\u064A", verb: "\u0648\u0644\u0631\u064A" },
    file: { unit: "\u0628\u0627\u06CC\u067C\u0633", verb: "\u0648\u0644\u0631\u064A" },
    array: { unit: "\u062A\u0648\u06A9\u064A", verb: "\u0648\u0644\u0631\u064A" },
    set: { unit: "\u062A\u0648\u06A9\u064A", verb: "\u0648\u0644\u0631\u064A" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0639\u062F\u062F";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u0627\u0631\u06D0";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0648\u0631\u0648\u062F\u064A",
    email: "\u0628\u0631\u06CC\u069A\u0646\u0627\u0644\u06CC\u06A9",
    url: "\u06CC\u0648 \u0622\u0631 \u0627\u0644",
    emoji: "\u0627\u06CC\u0645\u0648\u062C\u064A",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u0646\u06CC\u067C\u0647 \u0627\u0648 \u0648\u062E\u062A",
    date: "\u0646\u06D0\u067C\u0647",
    time: "\u0648\u062E\u062A",
    duration: "\u0645\u0648\u062F\u0647",
    ipv4: "\u062F IPv4 \u067E\u062A\u0647",
    ipv6: "\u062F IPv6 \u067E\u062A\u0647",
    cidrv4: "\u062F IPv4 \u0633\u0627\u062D\u0647",
    cidrv6: "\u062F IPv6 \u0633\u0627\u062D\u0647",
    base64: "base64-encoded \u0645\u062A\u0646",
    base64url: "base64url-encoded \u0645\u062A\u0646",
    json_string: "JSON \u0645\u062A\u0646",
    e164: "\u062F E.164 \u0634\u0645\u06D0\u0631\u0647",
    jwt: "JWT",
    template_literal: "\u0648\u0631\u0648\u062F\u064A"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0646\u0627\u0633\u0645 \u0648\u0631\u0648\u062F\u064A: \u0628\u0627\u06CC\u062F ${issue2.expected} \u0648\u0627\u06CC, \u0645\u06AB\u0631 ${parsedType4(issue2.input)} \u062A\u0631\u0644\u0627\u0633\u0647 \u0634\u0648`;
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `\u0646\u0627\u0633\u0645 \u0648\u0631\u0648\u062F\u064A: \u0628\u0627\u06CC\u062F ${stringifyPrimitive(issue2.values[0])} \u0648\u0627\u06CC`;
        }
        return `\u0646\u0627\u0633\u0645 \u0627\u0646\u062A\u062E\u0627\u0628: \u0628\u0627\u06CC\u062F \u06CC\u0648 \u0644\u0647 ${joinValues(issue2.values, "|")} \u0685\u062E\u0647 \u0648\u0627\u06CC`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0689\u06CC\u0631 \u0644\u0648\u06CC: ${issue2.origin ?? "\u0627\u0631\u0632\u069A\u062A"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0635\u0631\u0648\u0646\u0647"} \u0648\u0644\u0631\u064A`;
        }
        return `\u0689\u06CC\u0631 \u0644\u0648\u06CC: ${issue2.origin ?? "\u0627\u0631\u0632\u069A\u062A"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} \u0648\u064A`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0689\u06CC\u0631 \u06A9\u0648\u0686\u0646\u06CC: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} ${sizing.unit} \u0648\u0644\u0631\u064A`;
        }
        return `\u0689\u06CC\u0631 \u06A9\u0648\u0686\u0646\u06CC: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} \u0648\u064A`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F \u062F "${_issue.prefix}" \u0633\u0631\u0647 \u067E\u06CC\u0644 \u0634\u064A`;
        }
        if (_issue.format === "ends_with") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F \u062F "${_issue.suffix}" \u0633\u0631\u0647 \u067E\u0627\u06CC \u062A\u0647 \u0648\u0631\u0633\u064A\u0696\u064A`;
        }
        if (_issue.format === "includes") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F "${_issue.includes}" \u0648\u0644\u0631\u064A`;
        }
        if (_issue.format === "regex") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F \u062F ${_issue.pattern} \u0633\u0631\u0647 \u0645\u0637\u0627\u0628\u0642\u062A \u0648\u0644\u0631\u064A`;
        }
        return `${Nouns[_issue.format] ?? issue2.format} \u0646\u0627\u0633\u0645 \u062F\u06CC`;
      }
      case "not_multiple_of":
        return `\u0646\u0627\u0633\u0645 \u0639\u062F\u062F: \u0628\u0627\u06CC\u062F \u062F ${issue2.divisor} \u0645\u0636\u0631\u0628 \u0648\u064A`;
      case "unrecognized_keys":
        return `\u0646\u0627\u0633\u0645 ${issue2.keys.length > 1 ? "\u06A9\u0644\u06CC\u0689\u0648\u0646\u0647" : "\u06A9\u0644\u06CC\u0689"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u0646\u0627\u0633\u0645 \u06A9\u0644\u06CC\u0689 \u067E\u0647 ${issue2.origin} \u06A9\u06D0`;
      case "invalid_union":
        return `\u0646\u0627\u0633\u0645\u0647 \u0648\u0631\u0648\u062F\u064A`;
      case "invalid_element":
        return `\u0646\u0627\u0633\u0645 \u0639\u0646\u0635\u0631 \u067E\u0647 ${issue2.origin} \u06A9\u06D0`;
      default:
        return `\u0646\u0627\u0633\u0645\u0647 \u0648\u0631\u0648\u062F\u064A`;
    }
  };
};
function ps_default() {
  return {
    localeError: error26()
  };
}

// node_modules/zod/v4/locales/pl.js
var error27 = () => {
  const Sizable = {
    string: { unit: "znak\xF3w", verb: "mie\u0107" },
    file: { unit: "bajt\xF3w", verb: "mie\u0107" },
    array: { unit: "element\xF3w", verb: "mie\u0107" },
    set: { unit: "element\xF3w", verb: "mie\u0107" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "liczba";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tablica";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "wyra\u017Cenie",
    email: "adres email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i godzina w formacie ISO",
    date: "data w formacie ISO",
    time: "godzina w formacie ISO",
    duration: "czas trwania ISO",
    ipv4: "adres IPv4",
    ipv6: "adres IPv6",
    cidrv4: "zakres IPv4",
    cidrv6: "zakres IPv6",
    base64: "ci\u0105g znak\xF3w zakodowany w formacie base64",
    base64url: "ci\u0105g znak\xF3w zakodowany w formacie base64url",
    json_string: "ci\u0105g znak\xF3w w formacie JSON",
    e164: "liczba E.164",
    jwt: "JWT",
    template_literal: "wej\u015Bcie"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Nieprawid\u0142owe dane wej\u015Bciowe: oczekiwano ${issue2.expected}, otrzymano ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nieprawid\u0142owe dane wej\u015Bciowe: oczekiwano ${stringifyPrimitive(issue2.values[0])}`;
        return `Nieprawid\u0142owa opcja: oczekiwano jednej z warto\u015Bci ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za du\u017Ca warto\u015B\u0107: oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie mie\u0107 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element\xF3w"}`;
        }
        return `Zbyt du\u017C(y/a/e): oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie wynosi\u0107 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za ma\u0142a warto\u015B\u0107: oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie mie\u0107 ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "element\xF3w"}`;
        }
        return `Zbyt ma\u0142(y/a/e): oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie wynosi\u0107 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi zaczyna\u0107 si\u0119 od "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi ko\u0144czy\u0107 si\u0119 na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi zawiera\u0107 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi odpowiada\u0107 wzorcowi ${_issue.pattern}`;
        return `Nieprawid\u0142ow(y/a/e) ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nieprawid\u0142owa liczba: musi by\u0107 wielokrotno\u015Bci\u0105 ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nierozpoznane klucze${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nieprawid\u0142owy klucz w ${issue2.origin}`;
      case "invalid_union":
        return "Nieprawid\u0142owe dane wej\u015Bciowe";
      case "invalid_element":
        return `Nieprawid\u0142owa warto\u015B\u0107 w ${issue2.origin}`;
      default:
        return `Nieprawid\u0142owe dane wej\u015Bciowe`;
    }
  };
};
function pl_default() {
  return {
    localeError: error27()
  };
}

// node_modules/zod/v4/locales/pt.js
var error28 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "ter" },
    file: { unit: "bytes", verb: "ter" },
    array: { unit: "itens", verb: "ter" },
    set: { unit: "itens", verb: "ter" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "n\xFAmero";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "nulo";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "padr\xE3o",
    email: "endere\xE7o de e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "dura\xE7\xE3o ISO",
    ipv4: "endere\xE7o IPv4",
    ipv6: "endere\xE7o IPv6",
    cidrv4: "faixa de IPv4",
    cidrv6: "faixa de IPv6",
    base64: "texto codificado em base64",
    base64url: "URL codificada em base64",
    json_string: "texto JSON",
    e164: "n\xFAmero E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Tipo inv\xE1lido: esperado ${issue2.expected}, recebido ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inv\xE1lida: esperado ${stringifyPrimitive(issue2.values[0])}`;
        return `Op\xE7\xE3o inv\xE1lida: esperada uma das ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Muito grande: esperado que ${issue2.origin ?? "valor"} tivesse ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Muito grande: esperado que ${issue2.origin ?? "valor"} fosse ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Muito pequeno: esperado que ${issue2.origin} tivesse ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Muito pequeno: esperado que ${issue2.origin} fosse ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Texto inv\xE1lido: deve come\xE7ar com "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Texto inv\xE1lido: deve terminar com "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Texto inv\xE1lido: deve incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Texto inv\xE1lido: deve corresponder ao padr\xE3o ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} inv\xE1lido`;
      }
      case "not_multiple_of":
        return `N\xFAmero inv\xE1lido: deve ser m\xFAltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chave${issue2.keys.length > 1 ? "s" : ""} desconhecida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chave inv\xE1lida em ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inv\xE1lida";
      case "invalid_element":
        return `Valor inv\xE1lido em ${issue2.origin}`;
      default:
        return `Campo inv\xE1lido`;
    }
  };
};
function pt_default() {
  return {
    localeError: error28()
  };
}

// node_modules/zod/v4/locales/ru.js
function getRussianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error29 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "\u0441\u0438\u043C\u0432\u043E\u043B",
        few: "\u0441\u0438\u043C\u0432\u043E\u043B\u0430",
        many: "\u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    },
    file: {
      unit: {
        one: "\u0431\u0430\u0439\u0442",
        few: "\u0431\u0430\u0439\u0442\u0430",
        many: "\u0431\u0430\u0439\u0442"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    },
    array: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    },
    set: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0447\u0438\u0441\u043B\u043E";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u043C\u0430\u0441\u0441\u0438\u0432";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0432\u0432\u043E\u0434",
    email: "email \u0430\u0434\u0440\u0435\u0441",
    url: "URL",
    emoji: "\u044D\u043C\u043E\u0434\u0437\u0438",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0434\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043C\u044F",
    date: "ISO \u0434\u0430\u0442\u0430",
    time: "ISO \u0432\u0440\u0435\u043C\u044F",
    duration: "ISO \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C",
    ipv4: "IPv4 \u0430\u0434\u0440\u0435\u0441",
    ipv6: "IPv6 \u0430\u0434\u0440\u0435\u0441",
    cidrv4: "IPv4 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D",
    cidrv6: "IPv6 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D",
    base64: "\u0441\u0442\u0440\u043E\u043A\u0430 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 base64",
    base64url: "\u0441\u0442\u0440\u043E\u043A\u0430 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 base64url",
    json_string: "JSON \u0441\u0442\u0440\u043E\u043A\u0430",
    e164: "\u043D\u043E\u043C\u0435\u0440 E.164",
    jwt: "JWT",
    template_literal: "\u0432\u0432\u043E\u0434"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0432\u043E\u0434: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C ${issue2.expected}, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0432\u043E\u0434: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0434\u043D\u043E \u0438\u0437 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435"} \u0431\u0443\u0434\u0435\u0442 \u0438\u043C\u0435\u0442\u044C ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435"} \u0431\u0443\u0434\u0435\u0442 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin} \u0431\u0443\u0434\u0435\u0442 \u0438\u043C\u0435\u0442\u044C ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin} \u0431\u0443\u0434\u0435\u0442 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C\u0441\u044F \u0441 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0442\u044C\u0441\u044F \u043D\u0430 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D\u0443 ${_issue.pattern}`;
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E: \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043A\u0440\u0430\u0442\u043D\u044B\u043C ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u043D${issue2.keys.length > 1 ? "\u044B\u0435" : "\u044B\u0439"} \u043A\u043B\u044E\u0447${issue2.keys.length > 1 ? "\u0438" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043B\u044E\u0447 \u0432 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0432\u0445\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435";
      case "invalid_element":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0432 ${issue2.origin}`;
      default:
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0432\u0445\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435`;
    }
  };
};
function ru_default() {
  return {
    localeError: error29()
  };
}

// node_modules/zod/v4/locales/sl.js
var error30 = () => {
  const Sizable = {
    string: { unit: "znakov", verb: "imeti" },
    file: { unit: "bajtov", verb: "imeti" },
    array: { unit: "elementov", verb: "imeti" },
    set: { unit: "elementov", verb: "imeti" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0161tevilo";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tabela";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "vnos",
    email: "e-po\u0161tni naslov",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum in \u010Das",
    date: "ISO datum",
    time: "ISO \u010Das",
    duration: "ISO trajanje",
    ipv4: "IPv4 naslov",
    ipv6: "IPv6 naslov",
    cidrv4: "obseg IPv4",
    cidrv6: "obseg IPv6",
    base64: "base64 kodiran niz",
    base64url: "base64url kodiran niz",
    json_string: "JSON niz",
    e164: "E.164 \u0161tevilka",
    jwt: "JWT",
    template_literal: "vnos"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Neveljaven vnos: pri\u010Dakovano ${issue2.expected}, prejeto ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neveljaven vnos: pri\u010Dakovano ${stringifyPrimitive(issue2.values[0])}`;
        return `Neveljavna mo\u017Enost: pri\u010Dakovano eno izmed ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Preveliko: pri\u010Dakovano, da bo ${issue2.origin ?? "vrednost"} imelo ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementov"}`;
        return `Preveliko: pri\u010Dakovano, da bo ${issue2.origin ?? "vrednost"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Premajhno: pri\u010Dakovano, da bo ${issue2.origin} imelo ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Premajhno: pri\u010Dakovano, da bo ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Neveljaven niz: mora se za\u010Deti z "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Neveljaven niz: mora se kon\u010Dati z "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
        return `Neveljaven ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neveljavno \u0161tevilo: mora biti ve\u010Dkratnik ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neprepoznan${issue2.keys.length > 1 ? "i klju\u010Di" : " klju\u010D"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neveljaven klju\u010D v ${issue2.origin}`;
      case "invalid_union":
        return "Neveljaven vnos";
      case "invalid_element":
        return `Neveljavna vrednost v ${issue2.origin}`;
      default:
        return "Neveljaven vnos";
    }
  };
};
function sl_default() {
  return {
    localeError: error30()
  };
}

// node_modules/zod/v4/locales/sv.js
var error31 = () => {
  const Sizable = {
    string: { unit: "tecken", verb: "att ha" },
    file: { unit: "bytes", verb: "att ha" },
    array: { unit: "objekt", verb: "att inneh\xE5lla" },
    set: { unit: "objekt", verb: "att inneh\xE5lla" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "antal";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "lista";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "regulj\xE4rt uttryck",
    email: "e-postadress",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datum och tid",
    date: "ISO-datum",
    time: "ISO-tid",
    duration: "ISO-varaktighet",
    ipv4: "IPv4-intervall",
    ipv6: "IPv6-intervall",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodad str\xE4ng",
    base64url: "base64url-kodad str\xE4ng",
    json_string: "JSON-str\xE4ng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "mall-literal"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ogiltig inmatning: f\xF6rv\xE4ntat ${issue2.expected}, fick ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ogiltig inmatning: f\xF6rv\xE4ntat ${stringifyPrimitive(issue2.values[0])}`;
        return `Ogiltigt val: f\xF6rv\xE4ntade en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `F\xF6r stor(t): f\xF6rv\xE4ntade ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        }
        return `F\xF6r stor(t): f\xF6rv\xE4ntat ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `F\xF6r lite(t): f\xF6rv\xE4ntade ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `F\xF6r lite(t): f\xF6rv\xE4ntade ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ogiltig str\xE4ng: m\xE5ste b\xF6rja med "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Ogiltig str\xE4ng: m\xE5ste sluta med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ogiltig str\xE4ng: m\xE5ste inneh\xE5lla "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ogiltig str\xE4ng: m\xE5ste matcha m\xF6nstret "${_issue.pattern}"`;
        return `Ogiltig(t) ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ogiltigt tal: m\xE5ste vara en multipel av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ok\xE4nda nycklar" : "Ok\xE4nd nyckel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ogiltig nyckel i ${issue2.origin ?? "v\xE4rdet"}`;
      case "invalid_union":
        return "Ogiltig input";
      case "invalid_element":
        return `Ogiltigt v\xE4rde i ${issue2.origin ?? "v\xE4rdet"}`;
      default:
        return `Ogiltig input`;
    }
  };
};
function sv_default() {
  return {
    localeError: error31()
  };
}

// node_modules/zod/v4/locales/ta.js
var error32 = () => {
  const Sizable = {
    string: { unit: "\u0B8E\u0BB4\u0BC1\u0BA4\u0BCD\u0BA4\u0BC1\u0B95\u0BCD\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" },
    file: { unit: "\u0BAA\u0BC8\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" },
    array: { unit: "\u0B89\u0BB1\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" },
    set: { unit: "\u0B89\u0BB1\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "\u0B8E\u0BA3\u0BCD \u0B85\u0BB2\u0BCD\u0BB2\u0BBE\u0BA4\u0BA4\u0BC1" : "\u0B8E\u0BA3\u0BCD";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u0B85\u0BA3\u0BBF";
        }
        if (data === null) {
          return "\u0BB5\u0BC6\u0BB1\u0BC1\u0BAE\u0BC8";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1",
    email: "\u0BAE\u0BBF\u0BA9\u0BCD\u0BA9\u0B9E\u0BCD\u0B9A\u0BB2\u0BCD \u0BAE\u0BC1\u0B95\u0BB5\u0BB0\u0BBF",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0BA4\u0BC7\u0BA4\u0BBF \u0BA8\u0BC7\u0BB0\u0BAE\u0BCD",
    date: "ISO \u0BA4\u0BC7\u0BA4\u0BBF",
    time: "ISO \u0BA8\u0BC7\u0BB0\u0BAE\u0BCD",
    duration: "ISO \u0B95\u0BBE\u0BB2 \u0B85\u0BB3\u0BB5\u0BC1",
    ipv4: "IPv4 \u0BAE\u0BC1\u0B95\u0BB5\u0BB0\u0BBF",
    ipv6: "IPv6 \u0BAE\u0BC1\u0B95\u0BB5\u0BB0\u0BBF",
    cidrv4: "IPv4 \u0BB5\u0BB0\u0BAE\u0BCD\u0BAA\u0BC1",
    cidrv6: "IPv6 \u0BB5\u0BB0\u0BAE\u0BCD\u0BAA\u0BC1",
    base64: "base64-encoded \u0B9A\u0BB0\u0BAE\u0BCD",
    base64url: "base64url-encoded \u0B9A\u0BB0\u0BAE\u0BCD",
    json_string: "JSON \u0B9A\u0BB0\u0BAE\u0BCD",
    e164: "E.164 \u0B8E\u0BA3\u0BCD",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.expected}, \u0BAA\u0BC6\u0BB1\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0BB5\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0BAE\u0BCD: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${joinValues(issue2.values, "|")} \u0B87\u0BB2\u0BCD \u0B92\u0BA9\u0BCD\u0BB1\u0BC1`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0BAE\u0BBF\u0B95 \u0BAA\u0BC6\u0BB0\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin ?? "\u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0B89\u0BB1\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD"} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        }
        return `\u0BAE\u0BBF\u0B95 \u0BAA\u0BC6\u0BB0\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin ?? "\u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1"} ${adj}${issue2.maximum.toString()} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0BAE\u0BBF\u0B95\u0B9A\u0BCD \u0B9A\u0BBF\u0BB1\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        }
        return `\u0BAE\u0BBF\u0B95\u0B9A\u0BCD \u0B9A\u0BBF\u0BB1\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin} ${adj}${issue2.minimum.toString()} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: "${_issue.prefix}" \u0B87\u0BB2\u0BCD \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        if (_issue.format === "ends_with")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: "${_issue.suffix}" \u0B87\u0BB2\u0BCD \u0BAE\u0BC1\u0B9F\u0BBF\u0BB5\u0B9F\u0BC8\u0BAF \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        if (_issue.format === "includes")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: "${_issue.includes}" \u0B90 \u0B89\u0BB3\u0BCD\u0BB3\u0B9F\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        if (_issue.format === "regex")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: ${_issue.pattern} \u0BAE\u0BC1\u0BB1\u0BC8\u0BAA\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B9F\u0BA9\u0BCD \u0BAA\u0BCA\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B8E\u0BA3\u0BCD: ${issue2.divisor} \u0B87\u0BA9\u0BCD \u0BAA\u0BB2\u0BAE\u0BBE\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
      case "unrecognized_keys":
        return `\u0B85\u0B9F\u0BC8\u0BAF\u0BBE\u0BB3\u0BAE\u0BCD \u0BA4\u0BC6\u0BB0\u0BBF\u0BAF\u0BBE\u0BA4 \u0BB5\u0BBF\u0B9A\u0BC8${issue2.keys.length > 1 ? "\u0B95\u0BB3\u0BCD" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} \u0B87\u0BB2\u0BCD \u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0BB5\u0BBF\u0B9A\u0BC8`;
      case "invalid_union":
        return "\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1";
      case "invalid_element":
        return `${issue2.origin} \u0B87\u0BB2\u0BCD \u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1`;
      default:
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1`;
    }
  };
};
function ta_default() {
  return {
    localeError: error32()
  };
}

// node_modules/zod/v4/locales/th.js
var error33 = () => {
  const Sizable = {
    string: { unit: "\u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" },
    file: { unit: "\u0E44\u0E1A\u0E15\u0E4C", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" },
    array: { unit: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" },
    set: { unit: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02 (NaN)" : "\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u0E2D\u0E32\u0E23\u0E4C\u0E40\u0E23\u0E22\u0E4C (Array)";
        }
        if (data === null) {
          return "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E04\u0E48\u0E32 (null)";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1B\u0E49\u0E2D\u0E19",
    email: "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E2D\u0E35\u0E40\u0E21\u0E25",
    url: "URL",
    emoji: "\u0E2D\u0E34\u0E42\u0E21\u0E08\u0E34",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E40\u0E27\u0E25\u0E32\u0E41\u0E1A\u0E1A ISO",
    date: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E1A\u0E1A ISO",
    time: "\u0E40\u0E27\u0E25\u0E32\u0E41\u0E1A\u0E1A ISO",
    duration: "\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E41\u0E1A\u0E1A ISO",
    ipv4: "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48 IPv4",
    ipv6: "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48 IPv6",
    cidrv4: "\u0E0A\u0E48\u0E27\u0E07 IP \u0E41\u0E1A\u0E1A IPv4",
    cidrv6: "\u0E0A\u0E48\u0E27\u0E07 IP \u0E41\u0E1A\u0E1A IPv6",
    base64: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E1A\u0E1A Base64",
    base64url: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E1A\u0E1A Base64 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A URL",
    json_string: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E1A\u0E1A JSON",
    e164: "\u0E40\u0E1A\u0E2D\u0E23\u0E4C\u0E42\u0E17\u0E23\u0E28\u0E31\u0E1E\u0E17\u0E4C\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E1B\u0E23\u0E30\u0E40\u0E17\u0E28 (E.164)",
    jwt: "\u0E42\u0E17\u0E40\u0E04\u0E19 JWT",
    template_literal: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1B\u0E49\u0E2D\u0E19"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19 ${issue2.expected} \u0E41\u0E15\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0E04\u0E48\u0E32\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E43\u0E19 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19" : "\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin ?? "\u0E04\u0E48\u0E32"} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23"}`;
        return `\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin ?? "\u0E04\u0E48\u0E32"} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E19\u0E49\u0E2D\u0E22" : "\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E25\u0E07\u0E17\u0E49\u0E32\u0E22\u0E14\u0E49\u0E27\u0E22 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35 "${_issue.includes}" \u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21`;
        if (_issue.format === "regex")
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E15\u0E49\u0E2D\u0E07\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14 ${_issue.pattern}`;
        return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E08\u0E33\u0E19\u0E27\u0E19\u0E17\u0E35\u0E48\u0E2B\u0E32\u0E23\u0E14\u0E49\u0E27\u0E22 ${issue2.divisor} \u0E44\u0E14\u0E49\u0E25\u0E07\u0E15\u0E31\u0E27`;
      case "unrecognized_keys":
        return `\u0E1E\u0E1A\u0E04\u0E35\u0E22\u0E4C\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E23\u0E39\u0E49\u0E08\u0E31\u0E01: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u0E04\u0E35\u0E22\u0E4C\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E19 ${issue2.origin}`;
      case "invalid_union":
        return "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E22\u0E39\u0E40\u0E19\u0E35\u0E22\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E44\u0E27\u0E49";
      case "invalid_element":
        return `\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E19 ${issue2.origin}`;
      default:
        return `\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07`;
    }
  };
};
function th_default() {
  return {
    localeError: error33()
  };
}

// node_modules/zod/v4/locales/tr.js
var parsedType3 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "number";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error34 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "olmal\u0131" },
    file: { unit: "bayt", verb: "olmal\u0131" },
    array: { unit: "\xF6\u011Fe", verb: "olmal\u0131" },
    set: { unit: "\xF6\u011Fe", verb: "olmal\u0131" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "girdi",
    email: "e-posta adresi",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO tarih ve saat",
    date: "ISO tarih",
    time: "ISO saat",
    duration: "ISO s\xFCre",
    ipv4: "IPv4 adresi",
    ipv6: "IPv6 adresi",
    cidrv4: "IPv4 aral\u0131\u011F\u0131",
    cidrv6: "IPv6 aral\u0131\u011F\u0131",
    base64: "base64 ile \u015Fifrelenmi\u015F metin",
    base64url: "base64url ile \u015Fifrelenmi\u015F metin",
    json_string: "JSON dizesi",
    e164: "E.164 say\u0131s\u0131",
    jwt: "JWT",
    template_literal: "\u015Eablon dizesi"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ge\xE7ersiz de\u011Fer: beklenen ${issue2.expected}, al\u0131nan ${parsedType3(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ge\xE7ersiz de\u011Fer: beklenen ${stringifyPrimitive(issue2.values[0])}`;
        return `Ge\xE7ersiz se\xE7enek: a\u015Fa\u011F\u0131dakilerden biri olmal\u0131: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ok b\xFCy\xFCk: beklenen ${issue2.origin ?? "de\u011Fer"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\xF6\u011Fe"}`;
        return `\xC7ok b\xFCy\xFCk: beklenen ${issue2.origin ?? "de\u011Fer"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ok k\xFC\xE7\xFCk: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `\xC7ok k\xFC\xE7\xFCk: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ge\xE7ersiz metin: "${_issue.prefix}" ile ba\u015Flamal\u0131`;
        if (_issue.format === "ends_with")
          return `Ge\xE7ersiz metin: "${_issue.suffix}" ile bitmeli`;
        if (_issue.format === "includes")
          return `Ge\xE7ersiz metin: "${_issue.includes}" i\xE7ermeli`;
        if (_issue.format === "regex")
          return `Ge\xE7ersiz metin: ${_issue.pattern} desenine uymal\u0131`;
        return `Ge\xE7ersiz ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ge\xE7ersiz say\u0131: ${issue2.divisor} ile tam b\xF6l\xFCnebilmeli`;
      case "unrecognized_keys":
        return `Tan\u0131nmayan anahtar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} i\xE7inde ge\xE7ersiz anahtar`;
      case "invalid_union":
        return "Ge\xE7ersiz de\u011Fer";
      case "invalid_element":
        return `${issue2.origin} i\xE7inde ge\xE7ersiz de\u011Fer`;
      default:
        return `Ge\xE7ersiz de\u011Fer`;
    }
  };
};
function tr_default() {
  return {
    localeError: error34()
  };
}

// node_modules/zod/v4/locales/ua.js
var error35 = () => {
  const Sizable = {
    string: { unit: "\u0441\u0438\u043C\u0432\u043E\u043B\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" },
    file: { unit: "\u0431\u0430\u0439\u0442\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" },
    array: { unit: "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" },
    set: { unit: "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0447\u0438\u0441\u043B\u043E";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u043C\u0430\u0441\u0438\u0432";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456",
    email: "\u0430\u0434\u0440\u0435\u0441\u0430 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438",
    url: "URL",
    emoji: "\u0435\u043C\u043E\u0434\u0437\u0456",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u0434\u0430\u0442\u0430 \u0442\u0430 \u0447\u0430\u0441 ISO",
    date: "\u0434\u0430\u0442\u0430 ISO",
    time: "\u0447\u0430\u0441 ISO",
    duration: "\u0442\u0440\u0438\u0432\u0430\u043B\u0456\u0441\u0442\u044C ISO",
    ipv4: "\u0430\u0434\u0440\u0435\u0441\u0430 IPv4",
    ipv6: "\u0430\u0434\u0440\u0435\u0441\u0430 IPv6",
    cidrv4: "\u0434\u0456\u0430\u043F\u0430\u0437\u043E\u043D IPv4",
    cidrv6: "\u0434\u0456\u0430\u043F\u0430\u0437\u043E\u043D IPv6",
    base64: "\u0440\u044F\u0434\u043E\u043A \u0443 \u043A\u043E\u0434\u0443\u0432\u0430\u043D\u043D\u0456 base64",
    base64url: "\u0440\u044F\u0434\u043E\u043A \u0443 \u043A\u043E\u0434\u0443\u0432\u0430\u043D\u043D\u0456 base64url",
    json_string: "\u0440\u044F\u0434\u043E\u043A JSON",
    e164: "\u043D\u043E\u043C\u0435\u0440 E.164",
    jwt: "JWT",
    template_literal: "\u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F ${issue2.expected}, \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043E ${parsedType4(issue2.input)}`;
      // return `Неправильні вхідні дані: очікується ${issue.expected}, отримано ${util.getParsedType(issue.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0430 \u043E\u043F\u0446\u0456\u044F: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F \u043E\u0434\u043D\u0435 \u0437 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u0432\u0435\u043B\u0438\u043A\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0456\u0432"}`;
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u0432\u0435\u043B\u0438\u043A\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F"} \u0431\u0443\u0434\u0435 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u043C\u0430\u043B\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u043C\u0430\u043B\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin} \u0431\u0443\u0434\u0435 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u043F\u043E\u0447\u0438\u043D\u0430\u0442\u0438\u0441\u044F \u0437 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0432\u0430\u0442\u0438\u0441\u044F \u043D\u0430 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u043C\u0456\u0441\u0442\u0438\u0442\u0438 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0442\u0438 \u0448\u0430\u0431\u043B\u043E\u043D\u0443 ${_issue.pattern}`;
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0435 \u0447\u0438\u0441\u043B\u043E: \u043F\u043E\u0432\u0438\u043D\u043D\u043E \u0431\u0443\u0442\u0438 \u043A\u0440\u0430\u0442\u043D\u0438\u043C ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u043D\u0438\u0439 \u043A\u043B\u044E\u0447${issue2.keys.length > 1 ? "\u0456" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u043A\u043B\u044E\u0447 \u0443 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456";
      case "invalid_element":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F \u0443 ${issue2.origin}`;
      default:
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456`;
    }
  };
};
function ua_default() {
  return {
    localeError: error35()
  };
}

// node_modules/zod/v4/locales/ur.js
var error36 = () => {
  const Sizable = {
    string: { unit: "\u062D\u0631\u0648\u0641", verb: "\u06C1\u0648\u0646\u0627" },
    file: { unit: "\u0628\u0627\u0626\u0679\u0633", verb: "\u06C1\u0648\u0646\u0627" },
    array: { unit: "\u0622\u0626\u0679\u0645\u0632", verb: "\u06C1\u0648\u0646\u0627" },
    set: { unit: "\u0622\u0626\u0679\u0645\u0632", verb: "\u06C1\u0648\u0646\u0627" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "\u0646\u0645\u0628\u0631";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u0622\u0631\u06D2";
        }
        if (data === null) {
          return "\u0646\u0644";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0627\u0646 \u067E\u0679",
    email: "\u0627\u06CC \u0645\u06CC\u0644 \u0627\u06CC\u0688\u0631\u06CC\u0633",
    url: "\u06CC\u0648 \u0622\u0631 \u0627\u06CC\u0644",
    emoji: "\u0627\u06CC\u0645\u0648\u062C\u06CC",
    uuid: "\u06CC\u0648 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    uuidv4: "\u06CC\u0648 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC \u0648\u06CC 4",
    uuidv6: "\u06CC\u0648 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC \u0648\u06CC 6",
    nanoid: "\u0646\u06CC\u0646\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    guid: "\u062C\u06CC \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    cuid: "\u0633\u06CC \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    cuid2: "\u0633\u06CC \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC 2",
    ulid: "\u06CC\u0648 \u0627\u06CC\u0644 \u0622\u0626\u06CC \u0688\u06CC",
    xid: "\u0627\u06CC\u06A9\u0633 \u0622\u0626\u06CC \u0688\u06CC",
    ksuid: "\u06A9\u06D2 \u0627\u06CC\u0633 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    datetime: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u0688\u06CC\u0679 \u0679\u0627\u0626\u0645",
    date: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u062A\u0627\u0631\u06CC\u062E",
    time: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u0648\u0642\u062A",
    duration: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u0645\u062F\u062A",
    ipv4: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 4 \u0627\u06CC\u0688\u0631\u06CC\u0633",
    ipv6: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 6 \u0627\u06CC\u0688\u0631\u06CC\u0633",
    cidrv4: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 4 \u0631\u06CC\u0646\u062C",
    cidrv6: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 6 \u0631\u06CC\u0646\u062C",
    base64: "\u0628\u06CC\u0633 64 \u0627\u0646 \u06A9\u0648\u0688\u0688 \u0633\u0679\u0631\u0646\u06AF",
    base64url: "\u0628\u06CC\u0633 64 \u06CC\u0648 \u0622\u0631 \u0627\u06CC\u0644 \u0627\u0646 \u06A9\u0648\u0688\u0688 \u0633\u0679\u0631\u0646\u06AF",
    json_string: "\u062C\u06D2 \u0627\u06CC\u0633 \u0627\u0648 \u0627\u06CC\u0646 \u0633\u0679\u0631\u0646\u06AF",
    e164: "\u0627\u06CC 164 \u0646\u0645\u0628\u0631",
    jwt: "\u062C\u06D2 \u0688\u0628\u0644\u06CC\u0648 \u0679\u06CC",
    template_literal: "\u0627\u0646 \u067E\u0679"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679: ${issue2.expected} \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627\u060C ${parsedType4(issue2.input)} \u0645\u0648\u0635\u0648\u0644 \u06C1\u0648\u0627`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679: ${stringifyPrimitive(issue2.values[0])} \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
        return `\u063A\u0644\u0637 \u0622\u067E\u0634\u0646: ${joinValues(issue2.values, "|")} \u0645\u06CC\u06BA \u0633\u06D2 \u0627\u06CC\u06A9 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0628\u06C1\u062A \u0628\u0691\u0627: ${issue2.origin ?? "\u0648\u06CC\u0644\u06CC\u0648"} \u06A9\u06D2 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0627\u0635\u0631"} \u06C1\u0648\u0646\u06D2 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u06D2`;
        return `\u0628\u06C1\u062A \u0628\u0691\u0627: ${issue2.origin ?? "\u0648\u06CC\u0644\u06CC\u0648"} \u06A9\u0627 ${adj}${issue2.maximum.toString()} \u06C1\u0648\u0646\u0627 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0628\u06C1\u062A \u0686\u06BE\u0648\u0679\u0627: ${issue2.origin} \u06A9\u06D2 ${adj}${issue2.minimum.toString()} ${sizing.unit} \u06C1\u0648\u0646\u06D2 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u06D2`;
        }
        return `\u0628\u06C1\u062A \u0686\u06BE\u0648\u0679\u0627: ${issue2.origin} \u06A9\u0627 ${adj}${issue2.minimum.toString()} \u06C1\u0648\u0646\u0627 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: "${_issue.prefix}" \u0633\u06D2 \u0634\u0631\u0648\u0639 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        }
        if (_issue.format === "ends_with")
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: "${_issue.suffix}" \u067E\u0631 \u062E\u062A\u0645 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        if (_issue.format === "includes")
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: "${_issue.includes}" \u0634\u0627\u0645\u0644 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        if (_issue.format === "regex")
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: \u067E\u06CC\u0679\u0631\u0646 ${_issue.pattern} \u0633\u06D2 \u0645\u06CC\u0686 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        return `\u063A\u0644\u0637 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u063A\u0644\u0637 \u0646\u0645\u0628\u0631: ${issue2.divisor} \u06A9\u0627 \u0645\u0636\u0627\u0639\u0641 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
      case "unrecognized_keys":
        return `\u063A\u06CC\u0631 \u062A\u0633\u0644\u06CC\u0645 \u0634\u062F\u06C1 \u06A9\u06CC${issue2.keys.length > 1 ? "\u0632" : ""}: ${joinValues(issue2.keys, "\u060C ")}`;
      case "invalid_key":
        return `${issue2.origin} \u0645\u06CC\u06BA \u063A\u0644\u0637 \u06A9\u06CC`;
      case "invalid_union":
        return "\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679";
      case "invalid_element":
        return `${issue2.origin} \u0645\u06CC\u06BA \u063A\u0644\u0637 \u0648\u06CC\u0644\u06CC\u0648`;
      default:
        return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679`;
    }
  };
};
function ur_default() {
  return {
    localeError: error36()
  };
}

// node_modules/zod/v4/locales/vi.js
var error37 = () => {
  const Sizable = {
    string: { unit: "k\xFD t\u1EF1", verb: "c\xF3" },
    file: { unit: "byte", verb: "c\xF3" },
    array: { unit: "ph\u1EA7n t\u1EED", verb: "c\xF3" },
    set: { unit: "ph\u1EA7n t\u1EED", verb: "c\xF3" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "s\u1ED1";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "m\u1EA3ng";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u0111\u1EA7u v\xE0o",
    email: "\u0111\u1ECBa ch\u1EC9 email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ng\xE0y gi\u1EDD ISO",
    date: "ng\xE0y ISO",
    time: "gi\u1EDD ISO",
    duration: "kho\u1EA3ng th\u1EDDi gian ISO",
    ipv4: "\u0111\u1ECBa ch\u1EC9 IPv4",
    ipv6: "\u0111\u1ECBa ch\u1EC9 IPv6",
    cidrv4: "d\u1EA3i IPv4",
    cidrv6: "d\u1EA3i IPv6",
    base64: "chu\u1ED7i m\xE3 h\xF3a base64",
    base64url: "chu\u1ED7i m\xE3 h\xF3a base64url",
    json_string: "chu\u1ED7i JSON",
    e164: "s\u1ED1 E.164",
    jwt: "JWT",
    template_literal: "\u0111\u1EA7u v\xE0o"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i ${issue2.expected}, nh\u1EADn \u0111\u01B0\u1EE3c ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i ${stringifyPrimitive(issue2.values[0])}`;
        return `T\xF9y ch\u1ECDn kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i m\u1ED9t trong c\xE1c gi\xE1 tr\u1ECB ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Qu\xE1 l\u1EDBn: mong \u0111\u1EE3i ${issue2.origin ?? "gi\xE1 tr\u1ECB"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "ph\u1EA7n t\u1EED"}`;
        return `Qu\xE1 l\u1EDBn: mong \u0111\u1EE3i ${issue2.origin ?? "gi\xE1 tr\u1ECB"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Qu\xE1 nh\u1ECF: mong \u0111\u1EE3i ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Qu\xE1 nh\u1ECF: mong \u0111\u1EE3i ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i k\u1EBFt th\xFAc b\u1EB1ng "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i bao g\u1ED3m "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i kh\u1EDBp v\u1EDBi m\u1EABu ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} kh\xF4ng h\u1EE3p l\u1EC7`;
      }
      case "not_multiple_of":
        return `S\u1ED1 kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i l\xE0 b\u1ED9i s\u1ED1 c\u1EE7a ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kh\xF3a kh\xF4ng \u0111\u01B0\u1EE3c nh\u1EADn d\u1EA1ng: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kh\xF3a kh\xF4ng h\u1EE3p l\u1EC7 trong ${issue2.origin}`;
      case "invalid_union":
        return "\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7";
      case "invalid_element":
        return `Gi\xE1 tr\u1ECB kh\xF4ng h\u1EE3p l\u1EC7 trong ${issue2.origin}`;
      default:
        return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7`;
    }
  };
};
function vi_default() {
  return {
    localeError: error37()
  };
}

// node_modules/zod/v4/locales/zh-CN.js
var error38 = () => {
  const Sizable = {
    string: { unit: "\u5B57\u7B26", verb: "\u5305\u542B" },
    file: { unit: "\u5B57\u8282", verb: "\u5305\u542B" },
    array: { unit: "\u9879", verb: "\u5305\u542B" },
    set: { unit: "\u9879", verb: "\u5305\u542B" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "\u975E\u6570\u5B57(NaN)" : "\u6570\u5B57";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "\u6570\u7EC4";
        }
        if (data === null) {
          return "\u7A7A\u503C(null)";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u8F93\u5165",
    email: "\u7535\u5B50\u90AE\u4EF6",
    url: "URL",
    emoji: "\u8868\u60C5\u7B26\u53F7",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO\u65E5\u671F\u65F6\u95F4",
    date: "ISO\u65E5\u671F",
    time: "ISO\u65F6\u95F4",
    duration: "ISO\u65F6\u957F",
    ipv4: "IPv4\u5730\u5740",
    ipv6: "IPv6\u5730\u5740",
    cidrv4: "IPv4\u7F51\u6BB5",
    cidrv6: "IPv6\u7F51\u6BB5",
    base64: "base64\u7F16\u7801\u5B57\u7B26\u4E32",
    base64url: "base64url\u7F16\u7801\u5B57\u7B26\u4E32",
    json_string: "JSON\u5B57\u7B26\u4E32",
    e164: "E.164\u53F7\u7801",
    jwt: "JWT",
    template_literal: "\u8F93\u5165"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u65E0\u6548\u8F93\u5165\uFF1A\u671F\u671B ${issue2.expected}\uFF0C\u5B9E\u9645\u63A5\u6536 ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u65E0\u6548\u8F93\u5165\uFF1A\u671F\u671B ${stringifyPrimitive(issue2.values[0])}`;
        return `\u65E0\u6548\u9009\u9879\uFF1A\u671F\u671B\u4EE5\u4E0B\u4E4B\u4E00 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u6570\u503C\u8FC7\u5927\uFF1A\u671F\u671B ${issue2.origin ?? "\u503C"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u4E2A\u5143\u7D20"}`;
        return `\u6570\u503C\u8FC7\u5927\uFF1A\u671F\u671B ${issue2.origin ?? "\u503C"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u6570\u503C\u8FC7\u5C0F\uFF1A\u671F\u671B ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u6570\u503C\u8FC7\u5C0F\uFF1A\u671F\u671B ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u4EE5 "${_issue.prefix}" \u5F00\u5934`;
        if (_issue.format === "ends_with")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u4EE5 "${_issue.suffix}" \u7ED3\u5C3E`;
        if (_issue.format === "includes")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u5305\u542B "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u6EE1\u8DB3\u6B63\u5219\u8868\u8FBE\u5F0F ${_issue.pattern}`;
        return `\u65E0\u6548${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u65E0\u6548\u6570\u5B57\uFF1A\u5FC5\u987B\u662F ${issue2.divisor} \u7684\u500D\u6570`;
      case "unrecognized_keys":
        return `\u51FA\u73B0\u672A\u77E5\u7684\u952E(key): ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} \u4E2D\u7684\u952E(key)\u65E0\u6548`;
      case "invalid_union":
        return "\u65E0\u6548\u8F93\u5165";
      case "invalid_element":
        return `${issue2.origin} \u4E2D\u5305\u542B\u65E0\u6548\u503C(value)`;
      default:
        return `\u65E0\u6548\u8F93\u5165`;
    }
  };
};
function zh_CN_default() {
  return {
    localeError: error38()
  };
}

// node_modules/zod/v4/locales/zh-TW.js
var error39 = () => {
  const Sizable = {
    string: { unit: "\u5B57\u5143", verb: "\u64C1\u6709" },
    file: { unit: "\u4F4D\u5143\u7D44", verb: "\u64C1\u6709" },
    array: { unit: "\u9805\u76EE", verb: "\u64C1\u6709" },
    set: { unit: "\u9805\u76EE", verb: "\u64C1\u6709" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "\u8F38\u5165",
    email: "\u90F5\u4EF6\u5730\u5740",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u65E5\u671F\u6642\u9593",
    date: "ISO \u65E5\u671F",
    time: "ISO \u6642\u9593",
    duration: "ISO \u671F\u9593",
    ipv4: "IPv4 \u4F4D\u5740",
    ipv6: "IPv6 \u4F4D\u5740",
    cidrv4: "IPv4 \u7BC4\u570D",
    cidrv6: "IPv6 \u7BC4\u570D",
    base64: "base64 \u7DE8\u78BC\u5B57\u4E32",
    base64url: "base64url \u7DE8\u78BC\u5B57\u4E32",
    json_string: "JSON \u5B57\u4E32",
    e164: "E.164 \u6578\u503C",
    jwt: "JWT",
    template_literal: "\u8F38\u5165"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `\u7121\u6548\u7684\u8F38\u5165\u503C\uFF1A\u9810\u671F\u70BA ${issue2.expected}\uFF0C\u4F46\u6536\u5230 ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u7121\u6548\u7684\u8F38\u5165\u503C\uFF1A\u9810\u671F\u70BA ${stringifyPrimitive(issue2.values[0])}`;
        return `\u7121\u6548\u7684\u9078\u9805\uFF1A\u9810\u671F\u70BA\u4EE5\u4E0B\u5176\u4E2D\u4E4B\u4E00 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u6578\u503C\u904E\u5927\uFF1A\u9810\u671F ${issue2.origin ?? "\u503C"} \u61C9\u70BA ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u500B\u5143\u7D20"}`;
        return `\u6578\u503C\u904E\u5927\uFF1A\u9810\u671F ${issue2.origin ?? "\u503C"} \u61C9\u70BA ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u6578\u503C\u904E\u5C0F\uFF1A\u9810\u671F ${issue2.origin} \u61C9\u70BA ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u6578\u503C\u904E\u5C0F\uFF1A\u9810\u671F ${issue2.origin} \u61C9\u70BA ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u4EE5 "${_issue.prefix}" \u958B\u982D`;
        }
        if (_issue.format === "ends_with")
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u4EE5 "${_issue.suffix}" \u7D50\u5C3E`;
        if (_issue.format === "includes")
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u5305\u542B "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u7B26\u5408\u683C\u5F0F ${_issue.pattern}`;
        return `\u7121\u6548\u7684 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u7121\u6548\u7684\u6578\u5B57\uFF1A\u5FC5\u9808\u70BA ${issue2.divisor} \u7684\u500D\u6578`;
      case "unrecognized_keys":
        return `\u7121\u6CD5\u8B58\u5225\u7684\u9375\u503C${issue2.keys.length > 1 ? "\u5011" : ""}\uFF1A${joinValues(issue2.keys, "\u3001")}`;
      case "invalid_key":
        return `${issue2.origin} \u4E2D\u6709\u7121\u6548\u7684\u9375\u503C`;
      case "invalid_union":
        return "\u7121\u6548\u7684\u8F38\u5165\u503C";
      case "invalid_element":
        return `${issue2.origin} \u4E2D\u6709\u7121\u6548\u7684\u503C`;
      default:
        return `\u7121\u6548\u7684\u8F38\u5165\u503C`;
    }
  };
};
function zh_TW_default() {
  return {
    localeError: error39()
  };
}

// node_modules/zod/v4/core/registries.js
var $output = Symbol("ZodOutput");
var $input = Symbol("ZodInput");
var $ZodRegistry = class {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      if (this._idmap.has(meta.id)) {
        throw new Error(`ID ${meta.id} already exists in the registry`);
      }
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new Map();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      return { ...pm, ...this._map.get(schema) };
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
};
function registry() {
  return new $ZodRegistry();
}
var globalRegistry = /* @__PURE__ */ registry();

// node_modules/zod/v4/core/api.js
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
function _coercedString(Class2, params) {
  return new Class2({
    type: "string",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
var TimePrecision = {
  Any: null,
  Minute: -1,
  Second: 0,
  Millisecond: 3,
  Microsecond: 6
};
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _coercedNumber(Class2, params) {
  return new Class2({
    type: "number",
    coerce: true,
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _float32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float32",
    ...normalizeParams(params)
  });
}
function _float64(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float64",
    ...normalizeParams(params)
  });
}
function _int32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "int32",
    ...normalizeParams(params)
  });
}
function _uint32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "uint32",
    ...normalizeParams(params)
  });
}
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _coercedBoolean(Class2, params) {
  return new Class2({
    type: "boolean",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _bigint(Class2, params) {
  return new Class2({
    type: "bigint",
    ...normalizeParams(params)
  });
}
function _coercedBigint(Class2, params) {
  return new Class2({
    type: "bigint",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _int64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "int64",
    ...normalizeParams(params)
  });
}
function _uint64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "uint64",
    ...normalizeParams(params)
  });
}
function _symbol(Class2, params) {
  return new Class2({
    type: "symbol",
    ...normalizeParams(params)
  });
}
function _undefined2(Class2, params) {
  return new Class2({
    type: "undefined",
    ...normalizeParams(params)
  });
}
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params)
  });
}
function _any(Class2) {
  return new Class2({
    type: "any"
  });
}
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
function _void(Class2, params) {
  return new Class2({
    type: "void",
    ...normalizeParams(params)
  });
}
function _date(Class2, params) {
  return new Class2({
    type: "date",
    ...normalizeParams(params)
  });
}
function _coercedDate(Class2, params) {
  return new Class2({
    type: "date",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _nan(Class2, params) {
  return new Class2({
    type: "nan",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _positive(params) {
  return _gt(0, params);
}
function _negative(params) {
  return _lt(0, params);
}
function _nonpositive(params) {
  return _lte(0, params);
}
function _nonnegative(params) {
  return _gte(0, params);
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxSize(maximum, params) {
  return new $ZodCheckMaxSize({
    check: "max_size",
    ...normalizeParams(params),
    maximum
  });
}
function _minSize(minimum, params) {
  return new $ZodCheckMinSize({
    check: "min_size",
    ...normalizeParams(params),
    minimum
  });
}
function _size(size, params) {
  return new $ZodCheckSizeEquals({
    check: "size_equals",
    ...normalizeParams(params),
    size
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _property(property, schema, params) {
  return new $ZodCheckProperty({
    check: "property",
    property,
    schema,
    ...normalizeParams(params)
  });
}
function _mime(types, params) {
  return new $ZodCheckMimeType({
    check: "mime_type",
    mime: types,
    ...normalizeParams(params)
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _array(Class2, element2, params) {
  return new Class2({
    type: "array",
    element: element2,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
function _union(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
function _discriminatedUnion(Class2, discriminator, options, params) {
  return new Class2({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
function _intersection(Class2, left, right) {
  return new Class2({
    type: "intersection",
    left,
    right
  });
}
function _tuple(Class2, items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new Class2({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
function _record(Class2, keyType, valueType, params) {
  return new Class2({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function _map(Class2, keyType, valueType, params) {
  return new Class2({
    type: "map",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function _set(Class2, valueType, params) {
  return new Class2({
    type: "set",
    valueType,
    ...normalizeParams(params)
  });
}
function _enum(Class2, values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
function _nativeEnum(Class2, entries, params) {
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
function _literal(Class2, value, params) {
  return new Class2({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
function _file(Class2, params) {
  return new Class2({
    type: "file",
    ...normalizeParams(params)
  });
}
function _transform(Class2, fn) {
  return new Class2({
    type: "transform",
    transform: fn
  });
}
function _optional(Class2, innerType) {
  return new Class2({
    type: "optional",
    innerType
  });
}
function _nullable(Class2, innerType) {
  return new Class2({
    type: "nullable",
    innerType
  });
}
function _default(Class2, innerType, defaultValue) {
  return new Class2({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
  });
}
function _nonoptional(Class2, innerType, params) {
  return new Class2({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
function _success(Class2, innerType) {
  return new Class2({
    type: "success",
    innerType
  });
}
function _catch(Class2, innerType, catchValue) {
  return new Class2({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
function _pipe(Class2, in_, out) {
  return new Class2({
    type: "pipe",
    in: in_,
    out
  });
}
function _readonly(Class2, innerType) {
  return new Class2({
    type: "readonly",
    innerType
  });
}
function _templateLiteral(Class2, parts, params) {
  return new Class2({
    type: "template_literal",
    parts,
    ...normalizeParams(params)
  });
}
function _lazy(Class2, getter) {
  return new Class2({
    type: "lazy",
    getter
  });
}
function _promise(Class2, innerType) {
  return new Class2({
    type: "promise",
    innerType
  });
}
function _custom(Class2, fn, _params) {
  const norm2 = normalizeParams(_params);
  norm2.abort ?? (norm2.abort = true);
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...norm2
  });
  return schema;
}
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _stringbool(Classes, _params) {
  const params = normalizeParams(_params);
  let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
  let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
  if (params.case !== "sensitive") {
    truthyArray = truthyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
    falsyArray = falsyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
  }
  const truthySet = new Set(truthyArray);
  const falsySet = new Set(falsyArray);
  const _Pipe = Classes.Pipe ?? $ZodPipe;
  const _Boolean = Classes.Boolean ?? $ZodBoolean;
  const _String = Classes.String ?? $ZodString;
  const _Transform = Classes.Transform ?? $ZodTransform;
  const tx = new _Transform({
    type: "transform",
    transform: (input, payload) => {
      let data = input;
      if (params.case !== "sensitive")
        data = data.toLowerCase();
      if (truthySet.has(data)) {
        return true;
      } else if (falsySet.has(data)) {
        return false;
      } else {
        payload.issues.push({
          code: "invalid_value",
          expected: "stringbool",
          values: [...truthySet, ...falsySet],
          input: payload.value,
          inst: tx
        });
        return {};
      }
    },
    error: params.error
  });
  const innerPipe = new _Pipe({
    type: "pipe",
    in: new _String({ type: "string", error: params.error }),
    out: tx,
    error: params.error
  });
  const outerPipe = new _Pipe({
    type: "pipe",
    in: innerPipe,
    out: new _Boolean({
      type: "boolean",
      error: params.error
    }),
    error: params.error
  });
  return outerPipe;
}
function _stringFormat(Class2, format, fnOrRegex, _params = {}) {
  const params = normalizeParams(_params);
  const def = {
    ...normalizeParams(_params),
    check: "string_format",
    type: "string",
    format,
    fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
    ...params
  };
  if (fnOrRegex instanceof RegExp) {
    def.pattern = fnOrRegex;
  }
  const inst = new Class2(def);
  return inst;
}

// node_modules/zod/v4/core/function.js
var $ZodFunction = class {
  constructor(def) {
    this._def = def;
    this.def = def;
  }
  implement(func) {
    if (typeof func !== "function") {
      throw new Error("implement() must be called with a function");
    }
    const impl = (...args) => {
      const parsedArgs = this._def.input ? parse(this._def.input, args, void 0, { callee: impl }) : args;
      if (!Array.isArray(parsedArgs)) {
        throw new Error("Invalid arguments schema: not an array or tuple schema.");
      }
      const output = func(...parsedArgs);
      return this._def.output ? parse(this._def.output, output, void 0, { callee: impl }) : output;
    };
    return impl;
  }
  implementAsync(func) {
    if (typeof func !== "function") {
      throw new Error("implement() must be called with a function");
    }
    const impl = async (...args) => {
      const parsedArgs = this._def.input ? await parseAsync(this._def.input, args, void 0, { callee: impl }) : args;
      if (!Array.isArray(parsedArgs)) {
        throw new Error("Invalid arguments schema: not an array or tuple schema.");
      }
      const output = await func(...parsedArgs);
      return this._def.output ? parseAsync(this._def.output, output, void 0, { callee: impl }) : output;
    };
    return impl;
  }
  input(...args) {
    const F = this.constructor;
    if (Array.isArray(args[0])) {
      return new F({
        type: "function",
        input: new $ZodTuple({
          type: "tuple",
          items: args[0],
          rest: args[1]
        }),
        output: this._def.output
      });
    }
    return new F({
      type: "function",
      input: args[0],
      output: this._def.output
    });
  }
  output(output) {
    const F = this.constructor;
    return new F({
      type: "function",
      input: this._def.input,
      output
    });
  }
};
function _function(params) {
  return new $ZodFunction({
    type: "function",
    input: Array.isArray(params?.input) ? _tuple($ZodTuple, params?.input) : params?.input ?? _array($ZodArray, _unknown($ZodUnknown)),
    output: params?.output ?? _unknown($ZodUnknown)
  });
}

// node_modules/zod/v4/core/to-json-schema.js
var JSONSchemaGenerator = class {
  constructor(params) {
    this.counter = 0;
    this.metadataRegistry = params?.metadata ?? globalRegistry;
    this.target = params?.target ?? "draft-2020-12";
    this.unrepresentable = params?.unrepresentable ?? "throw";
    this.override = params?.override ?? (() => {
    });
    this.io = params?.io ?? "output";
    this.seen = /* @__PURE__ */ new Map();
  }
  process(schema, _params = { path: [], schemaPath: [] }) {
    var _a;
    const def = schema._zod.def;
    const formatMap = {
      guid: "uuid",
      url: "uri",
      datetime: "date-time",
      json_string: "json-string",
      regex: ""
      // do not set
    };
    const seen = this.seen.get(schema);
    if (seen) {
      seen.count++;
      const isCycle = _params.schemaPath.includes(schema);
      if (isCycle) {
        seen.cycle = _params.path;
      }
      return seen.schema;
    }
    const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
    this.seen.set(schema, result);
    const overrideSchema = schema._zod.toJSONSchema?.();
    if (overrideSchema) {
      result.schema = overrideSchema;
    } else {
      const params = {
        ..._params,
        schemaPath: [..._params.schemaPath, schema],
        path: _params.path
      };
      const parent = schema._zod.parent;
      if (parent) {
        result.ref = parent;
        this.process(parent, params);
        this.seen.get(parent).isParent = true;
      } else {
        const _json = result.schema;
        switch (def.type) {
          case "string": {
            const json2 = _json;
            json2.type = "string";
            const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
            if (typeof minimum === "number")
              json2.minLength = minimum;
            if (typeof maximum === "number")
              json2.maxLength = maximum;
            if (format) {
              json2.format = formatMap[format] ?? format;
              if (json2.format === "")
                delete json2.format;
            }
            if (contentEncoding)
              json2.contentEncoding = contentEncoding;
            if (patterns && patterns.size > 0) {
              const regexes = [...patterns];
              if (regexes.length === 1)
                json2.pattern = regexes[0].source;
              else if (regexes.length > 1) {
                result.schema.allOf = [
                  ...regexes.map((regex) => ({
                    ...this.target === "draft-7" ? { type: "string" } : {},
                    pattern: regex.source
                  }))
                ];
              }
            }
            break;
          }
          case "number": {
            const json2 = _json;
            const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
            if (typeof format === "string" && format.includes("int"))
              json2.type = "integer";
            else
              json2.type = "number";
            if (typeof exclusiveMinimum === "number")
              json2.exclusiveMinimum = exclusiveMinimum;
            if (typeof minimum === "number") {
              json2.minimum = minimum;
              if (typeof exclusiveMinimum === "number") {
                if (exclusiveMinimum >= minimum)
                  delete json2.minimum;
                else
                  delete json2.exclusiveMinimum;
              }
            }
            if (typeof exclusiveMaximum === "number")
              json2.exclusiveMaximum = exclusiveMaximum;
            if (typeof maximum === "number") {
              json2.maximum = maximum;
              if (typeof exclusiveMaximum === "number") {
                if (exclusiveMaximum <= maximum)
                  delete json2.maximum;
                else
                  delete json2.exclusiveMaximum;
              }
            }
            if (typeof multipleOf === "number")
              json2.multipleOf = multipleOf;
            break;
          }
          case "boolean": {
            const json2 = _json;
            json2.type = "boolean";
            break;
          }
          case "bigint": {
            if (this.unrepresentable === "throw") {
              throw new Error("BigInt cannot be represented in JSON Schema");
            }
            break;
          }
          case "symbol": {
            if (this.unrepresentable === "throw") {
              throw new Error("Symbols cannot be represented in JSON Schema");
            }
            break;
          }
          case "null": {
            _json.type = "null";
            break;
          }
          case "any": {
            break;
          }
          case "unknown": {
            break;
          }
          case "undefined": {
            if (this.unrepresentable === "throw") {
              throw new Error("Undefined cannot be represented in JSON Schema");
            }
            break;
          }
          case "void": {
            if (this.unrepresentable === "throw") {
              throw new Error("Void cannot be represented in JSON Schema");
            }
            break;
          }
          case "never": {
            _json.not = {};
            break;
          }
          case "date": {
            if (this.unrepresentable === "throw") {
              throw new Error("Date cannot be represented in JSON Schema");
            }
            break;
          }
          case "array": {
            const json2 = _json;
            const { minimum, maximum } = schema._zod.bag;
            if (typeof minimum === "number")
              json2.minItems = minimum;
            if (typeof maximum === "number")
              json2.maxItems = maximum;
            json2.type = "array";
            json2.items = this.process(def.element, { ...params, path: [...params.path, "items"] });
            break;
          }
          case "object": {
            const json2 = _json;
            json2.type = "object";
            json2.properties = {};
            const shape = def.shape;
            for (const key in shape) {
              json2.properties[key] = this.process(shape[key], {
                ...params,
                path: [...params.path, "properties", key]
              });
            }
            const allKeys = new Set(Object.keys(shape));
            const requiredKeys = new Set([...allKeys].filter((key) => {
              const v = def.shape[key]._zod;
              if (this.io === "input") {
                return v.optin === void 0;
              } else {
                return v.optout === void 0;
              }
            }));
            if (requiredKeys.size > 0) {
              json2.required = Array.from(requiredKeys);
            }
            if (def.catchall?._zod.def.type === "never") {
              json2.additionalProperties = false;
            } else if (!def.catchall) {
              if (this.io === "output")
                json2.additionalProperties = false;
            } else if (def.catchall) {
              json2.additionalProperties = this.process(def.catchall, {
                ...params,
                path: [...params.path, "additionalProperties"]
              });
            }
            break;
          }
          case "union": {
            const json2 = _json;
            json2.anyOf = def.options.map((x, i) => this.process(x, {
              ...params,
              path: [...params.path, "anyOf", i]
            }));
            break;
          }
          case "intersection": {
            const json2 = _json;
            const a = this.process(def.left, {
              ...params,
              path: [...params.path, "allOf", 0]
            });
            const b = this.process(def.right, {
              ...params,
              path: [...params.path, "allOf", 1]
            });
            const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
            const allOf = [
              ...isSimpleIntersection(a) ? a.allOf : [a],
              ...isSimpleIntersection(b) ? b.allOf : [b]
            ];
            json2.allOf = allOf;
            break;
          }
          case "tuple": {
            const json2 = _json;
            json2.type = "array";
            const prefixItems = def.items.map((x, i) => this.process(x, { ...params, path: [...params.path, "prefixItems", i] }));
            if (this.target === "draft-2020-12") {
              json2.prefixItems = prefixItems;
            } else {
              json2.items = prefixItems;
            }
            if (def.rest) {
              const rest = this.process(def.rest, {
                ...params,
                path: [...params.path, "items"]
              });
              if (this.target === "draft-2020-12") {
                json2.items = rest;
              } else {
                json2.additionalItems = rest;
              }
            }
            if (def.rest) {
              json2.items = this.process(def.rest, {
                ...params,
                path: [...params.path, "items"]
              });
            }
            const { minimum, maximum } = schema._zod.bag;
            if (typeof minimum === "number")
              json2.minItems = minimum;
            if (typeof maximum === "number")
              json2.maxItems = maximum;
            break;
          }
          case "record": {
            const json2 = _json;
            json2.type = "object";
            json2.propertyNames = this.process(def.keyType, { ...params, path: [...params.path, "propertyNames"] });
            json2.additionalProperties = this.process(def.valueType, {
              ...params,
              path: [...params.path, "additionalProperties"]
            });
            break;
          }
          case "map": {
            if (this.unrepresentable === "throw") {
              throw new Error("Map cannot be represented in JSON Schema");
            }
            break;
          }
          case "set": {
            if (this.unrepresentable === "throw") {
              throw new Error("Set cannot be represented in JSON Schema");
            }
            break;
          }
          case "enum": {
            const json2 = _json;
            const values = getEnumValues(def.entries);
            if (values.every((v) => typeof v === "number"))
              json2.type = "number";
            if (values.every((v) => typeof v === "string"))
              json2.type = "string";
            json2.enum = values;
            break;
          }
          case "literal": {
            const json2 = _json;
            const vals = [];
            for (const val of def.values) {
              if (val === void 0) {
                if (this.unrepresentable === "throw") {
                  throw new Error("Literal `undefined` cannot be represented in JSON Schema");
                } else {
                }
              } else if (typeof val === "bigint") {
                if (this.unrepresentable === "throw") {
                  throw new Error("BigInt literals cannot be represented in JSON Schema");
                } else {
                  vals.push(Number(val));
                }
              } else {
                vals.push(val);
              }
            }
            if (vals.length === 0) {
            } else if (vals.length === 1) {
              const val = vals[0];
              json2.type = val === null ? "null" : typeof val;
              json2.const = val;
            } else {
              if (vals.every((v) => typeof v === "number"))
                json2.type = "number";
              if (vals.every((v) => typeof v === "string"))
                json2.type = "string";
              if (vals.every((v) => typeof v === "boolean"))
                json2.type = "string";
              if (vals.every((v) => v === null))
                json2.type = "null";
              json2.enum = vals;
            }
            break;
          }
          case "file": {
            const json2 = _json;
            const file2 = {
              type: "string",
              format: "binary",
              contentEncoding: "binary"
            };
            const { minimum, maximum, mime } = schema._zod.bag;
            if (minimum !== void 0)
              file2.minLength = minimum;
            if (maximum !== void 0)
              file2.maxLength = maximum;
            if (mime) {
              if (mime.length === 1) {
                file2.contentMediaType = mime[0];
                Object.assign(json2, file2);
              } else {
                json2.anyOf = mime.map((m) => {
                  const mFile = { ...file2, contentMediaType: m };
                  return mFile;
                });
              }
            } else {
              Object.assign(json2, file2);
            }
            break;
          }
          case "transform": {
            if (this.unrepresentable === "throw") {
              throw new Error("Transforms cannot be represented in JSON Schema");
            }
            break;
          }
          case "nullable": {
            const inner = this.process(def.innerType, params);
            _json.anyOf = [inner, { type: "null" }];
            break;
          }
          case "nonoptional": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            break;
          }
          case "success": {
            const json2 = _json;
            json2.type = "boolean";
            break;
          }
          case "default": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            _json.default = JSON.parse(JSON.stringify(def.defaultValue));
            break;
          }
          case "prefault": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            if (this.io === "input")
              _json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
            break;
          }
          case "catch": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            let catchValue;
            try {
              catchValue = def.catchValue(void 0);
            } catch {
              throw new Error("Dynamic catch values are not supported in JSON Schema");
            }
            _json.default = catchValue;
            break;
          }
          case "nan": {
            if (this.unrepresentable === "throw") {
              throw new Error("NaN cannot be represented in JSON Schema");
            }
            break;
          }
          case "template_literal": {
            const json2 = _json;
            const pattern = schema._zod.pattern;
            if (!pattern)
              throw new Error("Pattern not found in template literal");
            json2.type = "string";
            json2.pattern = pattern.source;
            break;
          }
          case "pipe": {
            const innerType = this.io === "input" ? def.in._zod.def.type === "transform" ? def.out : def.in : def.out;
            this.process(innerType, params);
            result.ref = innerType;
            break;
          }
          case "readonly": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            _json.readOnly = true;
            break;
          }
          // passthrough types
          case "promise": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            break;
          }
          case "optional": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            break;
          }
          case "lazy": {
            const innerType = schema._zod.innerType;
            this.process(innerType, params);
            result.ref = innerType;
            break;
          }
          case "custom": {
            if (this.unrepresentable === "throw") {
              throw new Error("Custom types cannot be represented in JSON Schema");
            }
            break;
          }
          default: {
            def;
          }
        }
      }
    }
    const meta = this.metadataRegistry.get(schema);
    if (meta)
      Object.assign(result.schema, meta);
    if (this.io === "input" && isTransforming(schema)) {
      delete result.schema.examples;
      delete result.schema.default;
    }
    if (this.io === "input" && result.schema._prefault)
      (_a = result.schema).default ?? (_a.default = result.schema._prefault);
    delete result.schema._prefault;
    const _result = this.seen.get(schema);
    return _result.schema;
  }
  emit(schema, _params) {
    const params = {
      cycles: _params?.cycles ?? "ref",
      reused: _params?.reused ?? "inline",
      // unrepresentable: _params?.unrepresentable ?? "throw",
      // uri: _params?.uri ?? ((id) => `${id}`),
      external: _params?.external ?? void 0
    };
    const root = this.seen.get(schema);
    if (!root)
      throw new Error("Unprocessed schema. This is a bug in Zod.");
    const makeURI = (entry) => {
      const defsSegment = this.target === "draft-2020-12" ? "$defs" : "definitions";
      if (params.external) {
        const externalId = params.external.registry.get(entry[0])?.id;
        const uriGenerator = params.external.uri ?? ((id3) => id3);
        if (externalId) {
          return { ref: uriGenerator(externalId) };
        }
        const id2 = entry[1].defId ?? entry[1].schema.id ?? `schema${this.counter++}`;
        entry[1].defId = id2;
        return { defId: id2, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id2}` };
      }
      if (entry[1] === root) {
        return { ref: "#" };
      }
      const uriPrefix = `#`;
      const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
      const defId = entry[1].schema.id ?? `__schema${this.counter++}`;
      return { defId, ref: defUriPrefix + defId };
    };
    const extractToDef = (entry) => {
      if (entry[1].schema.$ref) {
        return;
      }
      const seen = entry[1];
      const { ref, defId } = makeURI(entry);
      seen.def = { ...seen.schema };
      if (defId)
        seen.defId = defId;
      const schema2 = seen.schema;
      for (const key in schema2) {
        delete schema2[key];
      }
      schema2.$ref = ref;
    };
    if (params.cycles === "throw") {
      for (const entry of this.seen.entries()) {
        const seen = entry[1];
        if (seen.cycle) {
          throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
        }
      }
    }
    for (const entry of this.seen.entries()) {
      const seen = entry[1];
      if (schema === entry[0]) {
        extractToDef(entry);
        continue;
      }
      if (params.external) {
        const ext = params.external.registry.get(entry[0])?.id;
        if (schema !== entry[0] && ext) {
          extractToDef(entry);
          continue;
        }
      }
      const id2 = this.metadataRegistry.get(entry[0])?.id;
      if (id2) {
        extractToDef(entry);
        continue;
      }
      if (seen.cycle) {
        extractToDef(entry);
        continue;
      }
      if (seen.count > 1) {
        if (params.reused === "ref") {
          extractToDef(entry);
          continue;
        }
      }
    }
    const flattenRef = (zodSchema, params2) => {
      const seen = this.seen.get(zodSchema);
      const schema2 = seen.def ?? seen.schema;
      const _cached = { ...schema2 };
      if (seen.ref === null) {
        return;
      }
      const ref = seen.ref;
      seen.ref = null;
      if (ref) {
        flattenRef(ref, params2);
        const refSchema = this.seen.get(ref).schema;
        if (refSchema.$ref && params2.target === "draft-7") {
          schema2.allOf = schema2.allOf ?? [];
          schema2.allOf.push(refSchema);
        } else {
          Object.assign(schema2, refSchema);
          Object.assign(schema2, _cached);
        }
      }
      if (!seen.isParent)
        this.override({
          zodSchema,
          jsonSchema: schema2,
          path: seen.path ?? []
        });
    };
    for (const entry of [...this.seen.entries()].reverse()) {
      flattenRef(entry[0], { target: this.target });
    }
    const result = {};
    if (this.target === "draft-2020-12") {
      result.$schema = "https://json-schema.org/draft/2020-12/schema";
    } else if (this.target === "draft-7") {
      result.$schema = "http://json-schema.org/draft-07/schema#";
    } else {
      console.warn(`Invalid target: ${this.target}`);
    }
    if (params.external?.uri) {
      const id2 = params.external.registry.get(schema)?.id;
      if (!id2)
        throw new Error("Schema is missing an `id` property");
      result.$id = params.external.uri(id2);
    }
    Object.assign(result, root.def);
    const defs = params.external?.defs ?? {};
    for (const entry of this.seen.entries()) {
      const seen = entry[1];
      if (seen.def && seen.defId) {
        defs[seen.defId] = seen.def;
      }
    }
    if (params.external) {
    } else {
      if (Object.keys(defs).length > 0) {
        if (this.target === "draft-2020-12") {
          result.$defs = defs;
        } else {
          result.definitions = defs;
        }
      }
    }
    try {
      return JSON.parse(JSON.stringify(result));
    } catch (_err) {
      throw new Error("Error converting schema to JSON.");
    }
  }
};
function toJSONSchema(input, _params) {
  if (input instanceof $ZodRegistry) {
    const gen2 = new JSONSchemaGenerator(_params);
    const defs = {};
    for (const entry of input._idmap.entries()) {
      const [_, schema] = entry;
      gen2.process(schema);
    }
    const schemas = {};
    const external = {
      registry: input,
      uri: _params?.uri,
      defs
    };
    for (const entry of input._idmap.entries()) {
      const [key, schema] = entry;
      schemas[key] = gen2.emit(schema, {
        ..._params,
        external
      });
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = gen2.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const gen = new JSONSchemaGenerator(_params);
  gen.process(input);
  return gen.emit(input, _params);
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const schema = _schema;
  const def = schema._zod.def;
  switch (def.type) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "date":
    case "symbol":
    case "undefined":
    case "null":
    case "any":
    case "unknown":
    case "never":
    case "void":
    case "literal":
    case "enum":
    case "nan":
    case "file":
    case "template_literal":
      return false;
    case "array": {
      return isTransforming(def.element, ctx);
    }
    case "object": {
      for (const key in def.shape) {
        if (isTransforming(def.shape[key], ctx))
          return true;
      }
      return false;
    }
    case "union": {
      for (const option of def.options) {
        if (isTransforming(option, ctx))
          return true;
      }
      return false;
    }
    case "intersection": {
      return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
    }
    case "tuple": {
      for (const item of def.items) {
        if (isTransforming(item, ctx))
          return true;
      }
      if (def.rest && isTransforming(def.rest, ctx))
        return true;
      return false;
    }
    case "record": {
      return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    case "map": {
      return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    case "set": {
      return isTransforming(def.valueType, ctx);
    }
    // inner types
    case "promise":
    case "optional":
    case "nonoptional":
    case "nullable":
    case "readonly":
      return isTransforming(def.innerType, ctx);
    case "lazy":
      return isTransforming(def.getter(), ctx);
    case "default": {
      return isTransforming(def.innerType, ctx);
    }
    case "prefault": {
      return isTransforming(def.innerType, ctx);
    }
    case "custom": {
      return false;
    }
    case "transform": {
      return true;
    }
    case "pipe": {
      return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
    }
    case "success": {
      return false;
    }
    case "catch": {
      return false;
    }
    default:
      def;
  }
  throw new Error(`Unknown schema type: ${def.type}`);
}

// node_modules/zod/v4/core/json-schema.js
var json_schema_exports = {};

// node_modules/zod/v4/classic/iso.js
var iso_exports = {};
__export(iso_exports, {
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  date: () => date2,
  datetime: () => datetime2,
  duration: () => duration2,
  time: () => time2
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError2(inst, mapper)
      // enumerable: false,
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
      // enumerable: false,
    },
    addIssue: {
      value: (issue2) => inst.issues.push(issue2)
      // enumerable: false,
    },
    addIssues: {
      value: (issues2) => inst.issues.push(...issues2)
      // enumerable: false,
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
      // enumerable: false,
    }
  });
};
var ZodError = $constructor("ZodError", initializer2);
var ZodRealError = $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse2 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  inst.def = def;
  Object.defineProperty(inst, "_def", { value: def });
  inst.check = (...checks) => {
    return inst.clone(
      {
        ...def,
        checks: [
          ...def.checks ?? [],
          ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }
      // { parent: true }
    );
  };
  inst.clone = (def2, params) => clone(inst, def2, params);
  inst.brand = () => inst;
  inst.register = (reg, meta) => {
    reg.add(inst, meta);
    return inst;
  };
  inst.parse = (data, params) => parse2(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.refine = (check2, params) => inst.check(refine(check2, params));
  inst.superRefine = (refinement) => inst.check(superRefine(refinement));
  inst.overwrite = (fn) => inst.check(_overwrite(fn));
  inst.optional = () => optional(inst);
  inst.nullable = () => nullable(inst);
  inst.nullish = () => optional(nullable(inst));
  inst.nonoptional = (params) => nonoptional(inst, params);
  inst.array = () => array(inst);
  inst.or = (arg) => union([inst, arg]);
  inst.and = (arg) => intersection(inst, arg);
  inst.transform = (tx) => pipe(inst, transform(tx));
  inst.default = (def2) => _default2(inst, def2);
  inst.prefault = (def2) => prefault(inst, def2);
  inst.catch = (params) => _catch2(inst, params);
  inst.pipe = (target) => pipe(inst, target);
  inst.readonly = () => readonly(inst);
  inst.describe = (description) => {
    const cl = inst.clone();
    globalRegistry.add(cl, { description });
    return cl;
  };
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  inst.meta = (...args) => {
    if (args.length === 0) {
      return globalRegistry.get(inst);
    }
    const cl = inst.clone();
    globalRegistry.add(cl, args[0]);
    return cl;
  };
  inst.isOptional = () => inst.safeParse(void 0).success;
  inst.isNullable = () => inst.safeParse(null).success;
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  inst.regex = (...args) => inst.check(_regex(...args));
  inst.includes = (...args) => inst.check(_includes(...args));
  inst.startsWith = (...args) => inst.check(_startsWith(...args));
  inst.endsWith = (...args) => inst.check(_endsWith(...args));
  inst.min = (...args) => inst.check(_minLength(...args));
  inst.max = (...args) => inst.check(_maxLength(...args));
  inst.length = (...args) => inst.check(_length(...args));
  inst.nonempty = (...args) => inst.check(_minLength(1, ...args));
  inst.lowercase = (params) => inst.check(_lowercase(params));
  inst.uppercase = (params) => inst.check(_uppercase(params));
  inst.trim = () => inst.check(_trim());
  inst.normalize = (...args) => inst.check(_normalize(...args));
  inst.toLowerCase = () => inst.check(_toLowerCase());
  inst.toUpperCase = () => inst.check(_toUpperCase());
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function email2(params) {
  return _email(ZodEmail, params);
}
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function guid2(params) {
  return _guid(ZodGUID, params);
}
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function uuid2(params) {
  return _uuid(ZodUUID, params);
}
function uuidv4(params) {
  return _uuidv4(ZodUUID, params);
}
function uuidv6(params) {
  return _uuidv6(ZodUUID, params);
}
function uuidv7(params) {
  return _uuidv7(ZodUUID, params);
}
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function url(params) {
  return _url(ZodURL, params);
}
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function emoji2(params) {
  return _emoji2(ZodEmoji, params);
}
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function nanoid2(params) {
  return _nanoid(ZodNanoID, params);
}
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid3(params) {
  return _cuid(ZodCUID, params);
}
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid22(params) {
  return _cuid2(ZodCUID2, params);
}
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ulid2(params) {
  return _ulid(ZodULID, params);
}
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function xid2(params) {
  return _xid(ZodXID, params);
}
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ksuid2(params) {
  return _ksuid(ZodKSUID, params);
}
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv42(params) {
  return _ipv4(ZodIPv4, params);
}
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv62(params) {
  return _ipv6(ZodIPv6, params);
}
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv42(params) {
  return _cidrv4(ZodCIDRv4, params);
}
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv62(params) {
  return _cidrv6(ZodCIDRv6, params);
}
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base642(params) {
  return _base64(ZodBase64, params);
}
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base64url2(params) {
  return _base64url(ZodBase64URL, params);
}
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function e1642(params) {
  return _e164(ZodE164, params);
}
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function jwt(params) {
  return _jwt(ZodJWT, params);
}
var ZodCustomStringFormat = /* @__PURE__ */ $constructor("ZodCustomStringFormat", (inst, def) => {
  $ZodCustomStringFormat.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function stringFormat(format, fnOrRegex, _params = {}) {
  return _stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.int = (params) => inst.check(int(params));
  inst.safe = (params) => inst.check(int(params));
  inst.positive = (params) => inst.check(_gt(0, params));
  inst.nonnegative = (params) => inst.check(_gte(0, params));
  inst.negative = (params) => inst.check(_lt(0, params));
  inst.nonpositive = (params) => inst.check(_lte(0, params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  inst.step = (value, params) => inst.check(_multipleOf(value, params));
  inst.finite = () => inst;
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
function float32(params) {
  return _float32(ZodNumberFormat, params);
}
function float64(params) {
  return _float64(ZodNumberFormat, params);
}
function int32(params) {
  return _int32(ZodNumberFormat, params);
}
function uint32(params) {
  return _uint32(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodBigInt = /* @__PURE__ */ $constructor("ZodBigInt", (inst, def) => {
  $ZodBigInt.init(inst, def);
  ZodType.init(inst, def);
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.positive = (params) => inst.check(_gt(BigInt(0), params));
  inst.negative = (params) => inst.check(_lt(BigInt(0), params));
  inst.nonpositive = (params) => inst.check(_lte(BigInt(0), params));
  inst.nonnegative = (params) => inst.check(_gte(BigInt(0), params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  const bag = inst._zod.bag;
  inst.minValue = bag.minimum ?? null;
  inst.maxValue = bag.maximum ?? null;
  inst.format = bag.format ?? null;
});
function bigint2(params) {
  return _bigint(ZodBigInt, params);
}
var ZodBigIntFormat = /* @__PURE__ */ $constructor("ZodBigIntFormat", (inst, def) => {
  $ZodBigIntFormat.init(inst, def);
  ZodBigInt.init(inst, def);
});
function int64(params) {
  return _int64(ZodBigIntFormat, params);
}
function uint64(params) {
  return _uint64(ZodBigIntFormat, params);
}
var ZodSymbol = /* @__PURE__ */ $constructor("ZodSymbol", (inst, def) => {
  $ZodSymbol.init(inst, def);
  ZodType.init(inst, def);
});
function symbol(params) {
  return _symbol(ZodSymbol, params);
}
var ZodUndefined = /* @__PURE__ */ $constructor("ZodUndefined", (inst, def) => {
  $ZodUndefined.init(inst, def);
  ZodType.init(inst, def);
});
function _undefined3(params) {
  return _undefined2(ZodUndefined, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
  $ZodAny.init(inst, def);
  ZodType.init(inst, def);
});
function any() {
  return _any(ZodAny);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodVoid = /* @__PURE__ */ $constructor("ZodVoid", (inst, def) => {
  $ZodVoid.init(inst, def);
  ZodType.init(inst, def);
});
function _void2(params) {
  return _void(ZodVoid, params);
}
var ZodDate = /* @__PURE__ */ $constructor("ZodDate", (inst, def) => {
  $ZodDate.init(inst, def);
  ZodType.init(inst, def);
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  const c = inst._zod.bag;
  inst.minDate = c.minimum ? new Date(c.minimum) : null;
  inst.maxDate = c.maximum ? new Date(c.maximum) : null;
});
function date3(params) {
  return _date(ZodDate, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst.element = def.element;
  inst.min = (minLength, params) => inst.check(_minLength(minLength, params));
  inst.nonempty = (params) => inst.check(_minLength(1, params));
  inst.max = (maxLength, params) => inst.check(_maxLength(maxLength, params));
  inst.length = (len, params) => inst.check(_length(len, params));
  inst.unwrap = () => inst.element;
});
function array(element2, params) {
  return _array(ZodArray, element2, params);
}
function keyof(schema) {
  const shape = schema._zod.def.shape;
  return literal(Object.keys(shape));
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObject.init(inst, def);
  ZodType.init(inst, def);
  util_exports.defineLazy(inst, "shape", () => def.shape);
  inst.keyof = () => _enum2(Object.keys(inst._zod.def.shape));
  inst.catchall = (catchall) => inst.clone({ ...inst._zod.def, catchall });
  inst.passthrough = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
  inst.loose = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
  inst.strict = () => inst.clone({ ...inst._zod.def, catchall: never() });
  inst.strip = () => inst.clone({ ...inst._zod.def, catchall: void 0 });
  inst.extend = (incoming) => {
    return util_exports.extend(inst, incoming);
  };
  inst.merge = (other) => util_exports.merge(inst, other);
  inst.pick = (mask) => util_exports.pick(inst, mask);
  inst.omit = (mask) => util_exports.omit(inst, mask);
  inst.partial = (...args) => util_exports.partial(ZodOptional, inst, args[0]);
  inst.required = (...args) => util_exports.required(ZodNonOptional, inst, args[0]);
});
function object(shape, params) {
  const def = {
    type: "object",
    get shape() {
      util_exports.assignProp(this, "shape", { ...shape });
      return this.shape;
    },
    ...util_exports.normalizeParams(params)
  };
  return new ZodObject(def);
}
function strictObject(shape, params) {
  return new ZodObject({
    type: "object",
    get shape() {
      util_exports.assignProp(this, "shape", { ...shape });
      return this.shape;
    },
    catchall: never(),
    ...util_exports.normalizeParams(params)
  });
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    get shape() {
      util_exports.assignProp(this, "shape", { ...shape });
      return this.shape;
    },
    catchall: unknown(),
    ...util_exports.normalizeParams(params)
  });
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...util_exports.normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...util_exports.normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...util_exports.normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record3(keyType, valueType, params) {
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function partialRecord(keyType, valueType, params) {
  return new ZodRecord({
    type: "record",
    keyType: union([keyType, never()]),
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodMap = /* @__PURE__ */ $constructor("ZodMap", (inst, def) => {
  $ZodMap.init(inst, def);
  ZodType.init(inst, def);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function map(keyType, valueType, params) {
  return new ZodMap({
    type: "map",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodSet = /* @__PURE__ */ $constructor("ZodSet", (inst, def) => {
  $ZodSet.init(inst, def);
  ZodType.init(inst, def);
  inst.min = (...args) => inst.check(_minSize(...args));
  inst.nonempty = (params) => inst.check(_minSize(1, params));
  inst.max = (...args) => inst.check(_maxSize(...args));
  inst.size = (...args) => inst.check(_size(...args));
});
function set(valueType, params) {
  return new ZodSet({
    type: "set",
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum2(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params)
  });
}
function nativeEnum(entries, params) {
  return new ZodEnum({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...util_exports.normalizeParams(params)
  });
}
var ZodFile = /* @__PURE__ */ $constructor("ZodFile", (inst, def) => {
  $ZodFile.init(inst, def);
  ZodType.init(inst, def);
  inst.min = (size, params) => inst.check(_minSize(size, params));
  inst.max = (size, params) => inst.check(_maxSize(size, params));
  inst.mime = (types, params) => inst.check(_mime(Array.isArray(types) ? types : [types], params));
});
function file(params) {
  return _file(ZodFile, params);
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        _issue.continue ?? (_issue.continue = true);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    payload.value = output;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
function nullish2(innerType) {
  return optional(nullable(innerType));
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default2(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodSuccess = /* @__PURE__ */ $constructor("ZodSuccess", (inst, def) => {
  $ZodSuccess.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function success(innerType) {
  return new ZodSuccess({
    type: "success",
    innerType
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch2(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodNaN = /* @__PURE__ */ $constructor("ZodNaN", (inst, def) => {
  $ZodNaN.init(inst, def);
  ZodType.init(inst, def);
});
function nan(params) {
  return _nan(ZodNaN, params);
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodTemplateLiteral = /* @__PURE__ */ $constructor("ZodTemplateLiteral", (inst, def) => {
  $ZodTemplateLiteral.init(inst, def);
  ZodType.init(inst, def);
});
function templateLiteral(parts, params) {
  return new ZodTemplateLiteral({
    type: "template_literal",
    parts,
    ...util_exports.normalizeParams(params)
  });
}
var ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
var ZodPromise = /* @__PURE__ */ $constructor("ZodPromise", (inst, def) => {
  $ZodPromise.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function promise(innerType) {
  return new ZodPromise({
    type: "promise",
    innerType
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
});
function check(fn) {
  const ch = new $ZodCheck({
    check: "custom"
    // ...util.normalizeParams(params),
  });
  ch._zod.check = fn;
  return ch;
}
function custom(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn) {
  const ch = check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    return fn(payload.value, payload);
  });
  return ch;
}
function _instanceof(cls, params = {
  error: `Input not instance of ${cls.name}`
}) {
  const inst = new ZodCustom({
    type: "custom",
    check: "custom",
    fn: (data) => data instanceof cls,
    abort: true,
    ...util_exports.normalizeParams(params)
  });
  inst._zod.bag.Class = cls;
  return inst;
}
var stringbool = (...args) => _stringbool({
  Pipe: ZodPipe,
  Boolean: ZodBoolean,
  String: ZodString,
  Transform: ZodTransform
}, ...args);
function json(params) {
  const jsonSchema = lazy(() => {
    return union([string2(params), number2(), boolean2(), _null3(), array(jsonSchema), record3(string2(), jsonSchema)]);
  });
  return jsonSchema;
}
function preprocess(fn, schema) {
  return pipe(transform(fn), schema);
}

// node_modules/zod/v4/classic/compat.js
var ZodIssueCode = {
  invalid_type: "invalid_type",
  too_big: "too_big",
  too_small: "too_small",
  invalid_format: "invalid_format",
  not_multiple_of: "not_multiple_of",
  unrecognized_keys: "unrecognized_keys",
  invalid_union: "invalid_union",
  invalid_key: "invalid_key",
  invalid_element: "invalid_element",
  invalid_value: "invalid_value",
  custom: "custom"
};
function setErrorMap(map2) {
  config({
    customError: map2
  });
}
function getErrorMap() {
  return config().customError;
}

// node_modules/zod/v4/classic/coerce.js
var coerce_exports = {};
__export(coerce_exports, {
  bigint: () => bigint3,
  boolean: () => boolean3,
  date: () => date4,
  number: () => number3,
  string: () => string3
});
function string3(params) {
  return _coercedString(ZodString, params);
}
function number3(params) {
  return _coercedNumber(ZodNumber, params);
}
function boolean3(params) {
  return _coercedBoolean(ZodBoolean, params);
}
function bigint3(params) {
  return _coercedBigint(ZodBigInt, params);
}
function date4(params) {
  return _coercedDate(ZodDate, params);
}

// node_modules/zod/v4/classic/external.js
config(en_default());

// src/core/sandbox/cap.ts
import { StringDecoder } from "node:string_decoder";
function capBytes(s, cap) {
  const buf = Buffer.from(s, "utf8");
  const fullBytes = buf.length;
  if (fullBytes <= cap) return { text: s, cut: false, fullBytes };
  const text = new StringDecoder("utf8").write(buf.subarray(0, cap));
  return { text, cut: true, fullBytes };
}

// src/core/sandbox/env.ts
var NODE_PREFIX = "NODE_";
var OPTIONS_SUFFIX = "_OPTIONS";
var STRIPPED_KEYS = Object.freeze([
  "NODE_OPTIONS",
  "NODE_REPL_EXTERNAL_MODULE",
  "NODE_V8_COVERAGE",
  "BUN_OPTIONS",
  "DENO_OPTIONS"
]);
function isStripped(key) {
  const name = key.toUpperCase();
  if (STRIPPED_KEYS.includes(name)) return true;
  return name.startsWith(NODE_PREFIX) && name.endsWith(OPTIONS_SUFFIX);
}
function buildChildEnv(parent, extra) {
  const env = {};
  for (const key of Object.keys(parent)) {
    const value = parent[key];
    if (value === void 0 || isStripped(key)) continue;
    env[key] = value;
  }
  if (extra !== void 0) {
    for (const key of Object.keys(extra)) env[key] = extra[key];
  }
  return env;
}

// src/core/sandbox/runtimes.ts
import { accessSync, constants as fsConstants, statSync as statSync3 } from "node:fs";
import path from "node:path";

// src/core/sandbox/path-entries.ts
function pathEntries(value, platform = process.platform, delimiter = platform === "win32" ? ";" : ":") {
  const win = platform === "win32";
  return value.split(delimiter).map((e) => win && e.length >= 2 && e.startsWith('"') && e.endsWith('"') ? e.slice(1, -1) : e).filter(Boolean);
}

// src/core/sandbox/runtimes.ts
var PATHEXT_SEPARATOR = ";";
var WIN_STARTABLE_EXT = Object.freeze([".exe", ".com"]);
function isWin() {
  return process.platform === "win32";
}
function candidates(lang) {
  const win = isWin();
  switch (lang) {
    case "shell":
      return win ? [] : ["sh"];
    case "powershell":
      return ["pwsh", "pwsh.exe", "powershell.exe"];
    case "javascript":
    case "typescript":
      return ["node", "node.exe"];
    case "python":
      return win ? ["python.exe", "py.exe", "python"] : ["python3", "python"];
    default:
      return win ? [lang, lang + ".exe"] : [lang];
  }
}
function fileNames(name, pathExt) {
  if (!isWin() || path.extname(name) !== "") return [name];
  return [...pathExt.map((ext) => name + ext), name];
}
function isRunnable(full) {
  const st = statSync3(full, { throwIfNoEntry: false });
  if (st === void 0 || !st.isFile()) return false;
  if (isWin()) {
    const ext = path.extname(full).toLowerCase();
    return ext === "" || WIN_STARTABLE_EXT.includes(ext);
  }
  try {
    accessSync(full, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function findRuntime(lang, env = process.env) {
  if (isWin() && WIN_SHELL_LANGS.includes(lang)) return findGitBash(env);
  const dirs = pathEntries(env.PATH ?? "", process.platform, path.delimiter);
  const pathExt = isWin() ? (env.PATHEXT ?? PATHEXT_DEFAULT).split(PATHEXT_SEPARATOR).filter((e) => e !== "") : [];
  const names = candidates(lang);
  let shim = null;
  for (const dir of dirs) {
    for (const name of names) {
      for (const file2 of fileNames(name, pathExt)) {
        const full = path.join(dir, file2);
        if (!isRunnable(full)) continue;
        if (!isWin() || path.extname(full) !== "") return full;
        if (shim === null) shim = full;
      }
    }
  }
  return shim;
}
function findGitBash(env) {
  const git3 = findRuntime(GIT_BIN, env);
  if (git3 === null) return null;
  for (const rel of GIT_BASH_RELATIVE) {
    const full = path.resolve(path.dirname(git3), ...rel);
    if (isRunnable(full)) return full;
  }
  return null;
}
function noRuntimeError(lang) {
  return isWin() && WIN_SHELL_LANGS.includes(lang) ? new CtxError("NO_GIT_BASH") : new CtxError("NO_RUNTIME", { lang });
}

// src/core/sandbox/spawn.ts
import { spawn } from "node:child_process";
import path2 from "node:path";

// src/core/sandbox/kill.ts
import { execFileSync } from "node:child_process";
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
  }
}
function killTree(pid) {
  if (process.platform !== "win32") {
    signalGroup(pid, "SIGTERM");
    setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS).unref();
    return;
  }
  try {
    execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
  } catch {
  }
}

// src/core/sandbox/spawn.ts
var NOT_STARTED = Object.freeze({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: null, killed: null });
function startArgv(argv) {
  if (process.platform !== "win32" || path2.extname(argv[0]) !== "") return argv;
  const sh = findRuntime("shell");
  return sh === null ? null : [sh, ...argv];
}
function runProcess(argv, o) {
  return new Promise((resolve6) => {
    const isWin2 = process.platform === "win32";
    const start = startArgv(argv);
    if (start === null) return resolve6(NOT_STARTED);
    let child;
    try {
      child = spawn(start[0], start.slice(1), {
        cwd: o.cwd,
        env: o.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        // Step 1: POSIX group leader so killTree's -pid reaches grandchildren.
        detached: !isWin2,
        // DEVIATIONS D-M2-T4-2: #384/#1154 (GP4/windows-hide-console-on-spawn); no-op on POSIX.
        windowsHide: true
      });
    } catch {
      return resolve6(NOT_STARTED);
    }
    const stdoutChunks = [];
    const stderrChunks = [];
    let killedBy = null;
    let settled = false;
    const kill = () => {
      if (child.pid !== void 0) killTree(child.pid);
    };
    const onAbort = () => {
      if (killedBy !== null || settled) return;
      killedBy = "cancel";
      clearTimeout(timer);
      kill();
    };
    const timer = setTimeout(() => {
      if (killedBy !== null || settled) return;
      killedBy = "timeout";
      kill();
    }, o.timeoutMs);
    const settle = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      o.signal.removeEventListener("abort", onAbort);
      resolve6({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        exitCode,
        killed: killedBy
      });
    };
    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("close", (code) => settle(code));
    child.on("error", () => settle(null));
    child.stdin.on("error", () => {
    });
    if (o.stdin !== void 0) child.stdin.write(o.stdin);
    child.stdin.end();
    if (o.signal.aborted) onAbort();
    else o.signal.addEventListener("abort", onAbort, { once: true });
  });
}

// src/core/index/auto-memory.ts
import { readFileSync as readFileSync5, statSync as statSync4 } from "node:fs";
import { join as join7 } from "node:path";
var CLAUDE_CODE_MEMORY_FILES = Object.freeze([
  Object.freeze(["CLAUDE.md"]),
  Object.freeze(["CLAUDE.local.md"]),
  Object.freeze([".claude", "CLAUDE.md"])
]);
function readAutoMemory(project) {
  if (project.agent !== "claude-code") return [];
  const rows = [];
  for (const segs of CLAUDE_CODE_MEMORY_FILES) {
    const path5 = join7(project.worktree, ...segs);
    if (!isInside(project.worktree, path5)) continue;
    try {
      const st = statSync4(path5);
      if (!st.isFile()) continue;
      rows.push({
        origin: "memory",
        ts: Math.trunc(st.mtimeMs),
        seq: null,
        sourceId: null,
        path: path5,
        label: segs.join("/"),
        text: readFileSync5(path5, "utf8")
      });
    } catch {
    }
  }
  return rows;
}

// src/core/tools/search.ts
function unknownField(issue2) {
  return issue2.code === "unrecognized_keys" ? formatError("UNKNOWN_FIELD", { f: issue2.keys[0] }) : void 0;
}
var ctxSearchSchema = external_exports.object({
  queries: external_exports.array(external_exports.string()),
  scope: external_exports.enum(["session", "worktree", "project"]).optional(),
  source: external_exports.string().optional(),
  offset: external_exports.number().int().nonnegative().optional(),
  sort: external_exports.enum(["relevance", "timeline"]).optional(),
  after: external_exports.number().int().nonnegative().optional()
}, { error: unknownField }).strict();
var COUNT_SOURCES = `
SELECT COUNT(*) AS n FROM sources
WHERE (:scope <> 'session' OR session_id = :session_id)
  AND (:scope <> 'worktree' OR worktree = :worktree)
  AND (:source IS NULL OR label = :source)`;
function bytes2(s) {
  return Buffer.byteLength(s, "utf8");
}
function reply(text, isError) {
  return { text: capBytes(text, OUTPUT_CAP).text, isError, sandboxBytes: 0 };
}
function invalid(field, action) {
  return reply(formatError("INVALID_ARGS", { field, action }), true);
}
function sourceCount(db, scope, ctx, source) {
  const row5 = db.raw.prepare(COUNT_SOURCES).get({
    scope,
    session_id: ctx.sessionId,
    worktree: ctx.project.worktree,
    source: source ?? null
  });
  return Number(row5.n);
}
function zeroHits(db, scope, ctx, source) {
  return reply('No hits in scope "' + scope + '" across ' + sourceCount(db, scope, ctx, source) + " source(s).", false);
}
function callText(queries, scope, source, cursor) {
  const src = source === void 0 ? "" : ", source:" + JSON.stringify(source);
  return "ctx_search({queries:" + JSON.stringify(queries) + ", scope:" + JSON.stringify(scope) + src + ", " + cursor + "})";
}
function decisionQueries(input) {
  return input.source === DECISION_SOURCE && input.queries.length === 0 ? [""] : input.queries;
}
function page(db, q, input, scope, ctx, offset) {
  if (input.source === DECISION_SOURCE && q.trim() === "") {
    return ftsListSource(db, DECISION_SOURCE, scope, ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, offset);
  }
  const hits = ftsQuery(db, q, scope, ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, offset, input.source);
  if (hits.length > 0 || input.source === void 0) return hits;
  const any2 = offset === 0 ? hits : ftsQuery(db, q, scope, ctx.project, ctx.sessionId, 1, 0, input.source);
  if (any2.length > 0) return hits;
  return ftsListSource(db, input.source, scope, ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, offset);
}
var JSON_ROWS_PAGE = 5;
var JSON_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
var JSON_SOURCE = `
SELECT id, bytes_total FROM sources
WHERE label = :source
  AND (:scope <> 'session' OR session_id = :session_id)
  AND (:scope <> 'worktree' OR worktree = :worktree)
ORDER BY id DESC LIMIT 1`;
function jsonRowsReply(db, input, scope, ctx) {
  if (input.source === void 0 || input.source === DECISION_SOURCE || input.queries.length === 0) return null;
  const src = db.raw.prepare(JSON_SOURCE).get({ source: input.source, scope, session_id: ctx.sessionId, worktree: ctx.project.worktree });
  if (src === void 0 || Number(src.bytes_total) > JSON_SOURCE_MAX_BYTES) return null;
  const bodies = db.raw.prepare("SELECT body FROM chunks WHERE source_id = ? ORDER BY CAST(ord AS INTEGER)").all(Number(src.id)).map((r) => r.body);
  const parsed = jsonRows(bodies.join("")) ?? jsonRows(bodies.join("\n"));
  if (parsed === null) return null;
  const { objs, keys } = parsed;
  const texts = objs.map((o) => JSON.stringify(o));
  const offset = input.offset ?? 0;
  const out = [objs.length + " objects {" + keys.join(",") + "}"];
  let shown2 = 0;
  let more = false;
  for (const q of input.queries) {
    const scores = rankTexts(texts, q, "any");
    const order = objs.map((_, i) => i).filter((i) => scores[i] > 0).sort((a, b) => scores[b] - scores[a] || a - b);
    const named = namedKeys(keys, q);
    out.push("Query " + JSON.stringify(q) + ":");
    for (const i of order.slice(offset, offset + JSON_ROWS_PAGE)) {
      const row5 = fitRow(objs[i], [], named, SNIPPET_MAX_BYTES);
      if (row5 === null) continue;
      out.push(input.source + " [" + i + "]: " + row5);
      shown2++;
    }
    if (order.length > offset + JSON_ROWS_PAGE) {
      out.push("More: " + callText([q], scope, input.source, "offset:" + (offset + JSON_ROWS_PAGE)));
      more = true;
    }
  }
  return shown2 === 0 && !more ? null : reply(out.join("\n"), false);
}
function relevance(db, given, scope, ctx) {
  const input = { ...given, queries: decisionQueries(given) };
  const offset = input.offset ?? 0;
  const seen = /* @__PURE__ */ new Set();
  const entries = [];
  const full = /* @__PURE__ */ new Set();
  input.queries.forEach((q, qi) => {
    const hits = page(db, q, input, scope, ctx, offset);
    if (hits.length === SEARCH_PAGE_SIZE) full.add(qi);
    hits.forEach((hit, i) => {
      const key = hit.sourceId + ":" + hit.ord;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ qi, pos: offset + i, hit });
    });
  });
  if (entries.length === 0) return zeroHits(db, scope, ctx, input.source);
  const moreLine3 = (q, pos) => "More: " + callText([q], scope, input.source, "offset:" + pos);
  let reserve = 0;
  for (const q of input.queries) reserve += bytes2(moreLine3(q, offset + SEARCH_PAGE_SIZE)) + 1;
  const lines = [];
  const more = [];
  let used = 0;
  let stopped = false;
  input.queries.forEach((q, qi) => {
    const mine = entries.filter((e) => e.qi === qi);
    if (stopped) {
      more.push(moreLine3(q, mine.length > 0 ? mine[0].pos : offset));
      return;
    }
    const head = "Query " + JSON.stringify(q) + ":";
    lines.push(head);
    used += bytes2(head) + 1;
    for (const e of mine) {
      const line = e.hit.label + " #" + e.hit.ord + ": " + e.hit.snippet;
      if (used + bytes2(line) + 1 + reserve > OUTPUT_CAP) {
        more.push(moreLine3(q, e.pos));
        stopped = true;
        break;
      }
      lines.push(line);
      used += bytes2(line) + 1;
    }
    if (!stopped && full.has(qi)) more.push(moreLine3(q, offset + SEARCH_PAGE_SIZE));
  });
  return reply(lines.concat(more).join("\n"), false);
}
function timelineLine(r) {
  const nl = r.text.indexOf("\n");
  const first = nl < 0 ? r.text : r.text.slice(0, nl);
  const seq = r.seq === null ? "" : " #" + r.seq;
  return "[" + new Date(r.ts).toISOString() + "] " + r.label + seq + " " + first;
}
function timeline(db, input, scope, ctx) {
  const memory = scope === "session" ? [] : readAutoMemory(ctx.project);
  const page2 = ftsQueryTimeline(db, scope, ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, input.after ?? null, input.source, memory);
  if (page2.rows.length === 0) return zeroHits(db, scope, ctx, input.source);
  const moreLine3 = (ts) => "more: " + callText(input.queries, scope, input.source, 'sort:"timeline", after:' + ts);
  const reserve = bytes2(moreLine3(page2.rows[page2.rows.length - 1].ts)) + 1;
  const lines = [];
  let used = 0;
  let lastTs = null;
  let more = page2.more;
  let i = 0;
  while (i < page2.rows.length) {
    const ts = page2.rows[i].ts;
    const group = [];
    let groupBytes = 0;
    while (i < page2.rows.length && page2.rows[i].ts === ts) {
      const line = timelineLine(page2.rows[i]);
      group.push(line);
      groupBytes += bytes2(line) + 1;
      i += 1;
    }
    if (lastTs !== null && used + groupBytes + reserve > OUTPUT_CAP) {
      more = true;
      break;
    }
    lines.push(...group);
    used += groupBytes;
    lastTs = ts;
  }
  if (more && lastTs !== null) lines.push(moreLine3(lastTs));
  return reply(lines.join("\n"), false);
}
async function handler(input, ctx) {
  const sort = input.sort ?? "relevance";
  if (sort === "timeline" && input.offset !== void 0) {
    return invalid("offset", 'drop offset; page a timeline with "after"');
  }
  if (sort === "relevance" && input.after !== void 0) {
    return invalid("after", 'drop after, or pass sort:"timeline"');
  }
  const scope = input.scope ?? "worktree";
  const db = await openDb(ctx.project, { readOnly: true });
  try {
    if (input.source !== void 0 && input.source !== DECISION_SOURCE) input = { ...input, source: resolveSourceLabel(db, input.source) };
    if (sort === "timeline") return timeline(db, input, scope, ctx);
    return jsonRowsReply(db, input, scope, ctx) ?? relevance(db, input, scope, ctx);
  } finally {
    closeDb(db);
  }
}
var ctxSearch = Object.freeze({
  name: "ctx_search",
  description: "",
  schema: ctxSearchSchema,
  readOnly: true,
  alwaysLoad: false,
  handler
});

// src/core/tools/batch.ts
var ctxBatchSchema = external_exports.object({
  commands: external_exports.array(external_exports.string().min(1)).min(1),
  queries: external_exports.array(external_exports.string().min(1)).min(1)
}, { error: unknownField }).strict();
var TOOL = "ctx_batch";
var LABEL_PREFIX = TOOL + ":";
var SHELL = "shell";
var SHELL_INLINE_FLAG = "-c";
var MARKER = "$ ";
var BLOCK_SEP = "\n\n";
var LINE_SEP = "\n";
var ONE_AT_A_TIME = 1;
async function runPool(jobs, concurrency, stop) {
  const results = [];
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < jobs.length) {
      const i = next;
      next += 1;
      const r = await jobs[i]();
      results[i] = r;
      if (stop(r)) stopped = true;
    }
  };
  const width = Math.min(concurrency, jobs.length);
  await Promise.all(Array.from({ length: width }, worker));
  return { results, capped: jobs.length >= concurrency };
}
function headOf(cmd) {
  return MARKER + cmd + LINE_SEP;
}
function stoppedAt(cmd, error40) {
  return { head: headOf(cmd), block: headOf(cmd) + error40, exitCode: null, bytes: 0, error: error40 };
}
async function runCommand(cmd, shell, ctx, deadline, boundMs) {
  if (shell === null) return stoppedAt(cmd, noRuntimeError(SHELL).toLine());
  const left = deadline - Date.now();
  if (left <= 0) return stoppedAt(cmd, formatError("TIMEOUT", { ms: boundMs }));
  const r = await runProcess([shell, SHELL_INLINE_FLAG, cmd], {
    cwd: ctx.project.worktree,
    env: buildChildEnv(process.env),
    signal: ctx.signal,
    timeoutMs: left
  });
  if (r.killed === "timeout") return stoppedAt(cmd, formatError("TIMEOUT", { ms: boundMs }));
  if (r.killed === "cancel") return stoppedAt(cmd, CANCELLED_LINE);
  if (r.exitCode === null && r.stdout.length === 0 && r.stderr.length === 0) {
    return stoppedAt(cmd, formatError("SPAWN_FAILED", { detail: shell }));
  }
  const withErr = r.exitCode !== 0;
  const out = r.stdout.toString("utf8") + (withErr ? r.stderr.toString("utf8") : "");
  return { head: headOf(cmd), block: headOf(cmd) + out, exitCode: r.exitCode, bytes: r.stdout.length + (withErr ? r.stderr.length : 0), error: null };
}
function chunkKey(sourceId, ord) {
  return sourceId + ":" + ord;
}
function shown(chunks, heads) {
  let k = 0;
  return chunks.map((c) => {
    if (k < heads.length && c.text.startsWith(heads[k])) {
      const body = c.text.slice(heads[k].length);
      k += 1;
      return body;
    }
    return c.text;
  });
}
function indexCombined(db, ctx, label, ran, deadline, budgetBytes) {
  const chunks = chunkText(ran.map((r) => r.block).join(BLOCK_SEP), "text");
  const display = shown(chunks, ran.map((r) => r.head));
  const bodies = /* @__PURE__ */ new Map();
  let total = 0;
  for (const c of chunks) total += c.bytes;
  let indexed = 0;
  let queued = 0;
  let group = [];
  let groupBytes = 0;
  const flush = () => {
    if (group.length === 0) return true;
    if (ctx.signal.aborted || indexed > 0 && Date.now() >= deadline) return false;
    const id2 = ftsInsert(db, {
      projectKey: ctx.project.projectKey,
      sessionId: ctx.sessionId,
      worktree: ctx.project.worktree,
      agent: ctx.project.agent,
      kind: "content",
      label,
      bytes: groupBytes,
      chunkCount: group.length,
      createdAt: Date.now()
    }, group);
    for (const c of group) bodies.set(chunkKey(id2, c.ord), display[c.ord]);
    indexed += groupBytes;
    group = [];
    groupBytes = 0;
    return true;
  };
  for (const c of chunks) {
    if (queued + c.bytes > budgetBytes) {
      const stop2 = flush() ? "budget" : "deadline";
      return { bodies, indexed, total, stop: stop2 };
    }
    if (group.length > 0 && groupBytes + c.bytes > INDEX_WRITE_CHUNK && !flush()) return { bodies, indexed, total, stop: "deadline" };
    group.push(c);
    groupBytes += c.bytes;
    queued += c.bytes;
  }
  const stop = flush() ? null : "deadline";
  return { bodies, indexed, total, stop };
}
function bytes3(s) {
  return Buffer.byteLength(s, "utf8");
}
function answer(db, ctx, label, queries, share, own2) {
  const seen = /* @__PURE__ */ new Set();
  const lines = [];
  for (const [qi, q] of queries.entries()) {
    if (ctx.signal.aborted) break;
    let hits = ftsQuery(db, q, "session", ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, 0, label);
    if (hits.length === 0) hits = ftsQuery(db, q, "session", ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, 0);
    const head = "## " + (bytes3(q) > ECHO_MAX_BYTES ? "query " + (qi + 1) : q);
    let used = bytes3(head) + 1;
    const body = [];
    for (const h of hits) {
      const key = chunkKey(h.sourceId, h.ord);
      if (seen.has(key)) continue;
      const text = own2.get(key) ?? h.snippet;
      if (text === "") {
        seen.add(key);
        continue;
      }
      const cost = bytes3(text) + 1;
      if (used + cost > share) continue;
      seen.add(key);
      body.push(text);
      used += cost;
    }
    if (hits.length === 0) body.push("No hits.");
    else if (body.length === 0) body.push("No new section.");
    lines.push(head, ...body);
  }
  return lines;
}
async function runBatch(input, ctx, boundMs, budgetBytes) {
  const parsed = ctxBatchSchema.safeParse(input);
  if (!parsed.success) {
    const issue2 = parsed.error.issues[0];
    const text = issue2.code === "unrecognized_keys" ? formatError("UNKNOWN_FIELD", { f: issue2.keys[0] }) : issue2.message;
    return { text, isError: true, sandboxBytes: 0 };
  }
  const { commands, queries } = parsed.data;
  const deadline = Date.now() + boundMs;
  const shell = findRuntime(SHELL);
  const pool = await runPool(commands.map((c) => () => runCommand(c, shell, ctx, deadline, boundMs)), ONE_AT_A_TIME, (r) => r.error !== null);
  const ran = pool.results;
  const last2 = ran[ran.length - 1];
  const sandboxBytes = ran.reduce((n, r) => n + r.bytes, 0);
  const label = LABEL_PREFIX + ctx.turn;
  try {
    const db = await openDb(ctx.project);
    let sections;
    let idx;
    const summary = commands.length + " command(s), " + queries.length + " querie(s), exit " + last2.exitCode;
    const footer = "more: ctx_search({queries:[...], source:" + JSON.stringify(label) + "})";
    let notice;
    try {
      idx = indexCombined(db, ctx, label, ran, deadline, budgetBytes);
      const stop = last2.error;
      const cut = idx.indexed < idx.total ? "Indexed " + idx.indexed + " of " + idx.total + " B." : null;
      const timeout = formatError("TIMEOUT", { ms: boundMs });
      const cause = stop ?? (ctx.signal.aborted ? CANCELLED_LINE : idx.stop === "deadline" ? timeout : null);
      notice = cut === null ? stop : cause === null ? cut : cause + " " + cut;
      const fixed = bytes3(summary) + 1 + (notice === null ? 0 : bytes3(notice) + 1) + bytes3(footer);
      const share = Math.floor((OUTPUT_CAP - fixed) / queries.length);
      sections = answer(db, ctx, label, queries, share, idx.bodies);
    } finally {
      closeDb(db);
    }
    const lines = [summary, ...notice === null ? [] : [notice], ...sections, footer];
    return {
      text: capBytes(lines.join(LINE_SEP), OUTPUT_CAP).text,
      // step 10: final bound (D-M2-6)
      isError: false,
      // step 11
      sandboxBytes,
      journal: { kind: "cmd", key: canonicalKey(TOOL, commands.join(LINE_SEP)), path: null, exit_code: last2.exitCode }
    };
  } catch (err) {
    if (err instanceof CtxError) return { text: err.toLine(), isError: true, sandboxBytes };
    throw err;
  }
}
var ctxBatch = Object.freeze({
  name: TOOL,
  schema: ctxBatchSchema,
  readOnly: false,
  // A12
  alwaysLoad: false,
  handler: (input, ctx) => runBatch(input, ctx, EXEC_TIMEOUT_MS, RETENTION_SIZE_CAP_BYTES)
});

// src/core/tools/doctor.ts
import { readdirSync as readdirSync4, readFileSync as readFileSync11, existsSync as existsSync10 } from "node:fs";
import { basename as basename3, dirname as dirname6, join as join13 } from "node:path";

// src/core/ops/doctor-config.ts
import { join as join11 } from "node:path";

// src/core/ops/detect-v1.ts
import { existsSync as existsSync4, opendirSync, readdirSync, readFileSync as readFileSync7 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join9 } from "node:path";

// src/core/ops/host-config.ts
import { existsSync as existsSync3, readFileSync as readFileSync6 } from "node:fs";
import { dirname as dirname4, join as join8 } from "node:path";

// node_modules/eslint-visitor-keys/lib/visitor-keys.js
var KEYS2 = {
  ArrayExpression: ["elements"],
  ArrayPattern: ["elements"],
  ArrowFunctionExpression: ["params", "body"],
  AssignmentExpression: ["left", "right"],
  AssignmentPattern: ["left", "right"],
  AwaitExpression: ["argument"],
  BinaryExpression: ["left", "right"],
  BlockStatement: ["body"],
  BreakStatement: ["label"],
  CallExpression: ["callee", "arguments"],
  CatchClause: ["param", "body"],
  ChainExpression: ["expression"],
  ClassBody: ["body"],
  ClassDeclaration: ["id", "superClass", "body"],
  ClassExpression: ["id", "superClass", "body"],
  ConditionalExpression: ["test", "consequent", "alternate"],
  ContinueStatement: ["label"],
  DebuggerStatement: [],
  DoWhileStatement: ["body", "test"],
  EmptyStatement: [],
  ExperimentalRestProperty: ["argument"],
  ExperimentalSpreadProperty: ["argument"],
  ExportAllDeclaration: ["exported", "source", "attributes"],
  ExportDefaultDeclaration: ["declaration"],
  ExportNamedDeclaration: [
    "declaration",
    "specifiers",
    "source",
    "attributes"
  ],
  ExportSpecifier: ["local", "exported"],
  ExpressionStatement: ["expression"],
  ForInStatement: ["left", "right", "body"],
  ForOfStatement: ["left", "right", "body"],
  ForStatement: ["init", "test", "update", "body"],
  FunctionDeclaration: ["id", "params", "body"],
  FunctionExpression: ["id", "params", "body"],
  Identifier: [],
  IfStatement: ["test", "consequent", "alternate"],
  ImportAttribute: ["key", "value"],
  ImportDeclaration: ["specifiers", "source", "attributes"],
  ImportDefaultSpecifier: ["local"],
  ImportExpression: ["source", "options"],
  ImportNamespaceSpecifier: ["local"],
  ImportSpecifier: ["imported", "local"],
  JSXAttribute: ["name", "value"],
  JSXClosingElement: ["name"],
  JSXClosingFragment: [],
  JSXElement: ["openingElement", "children", "closingElement"],
  JSXEmptyExpression: [],
  JSXExpressionContainer: ["expression"],
  JSXFragment: ["openingFragment", "children", "closingFragment"],
  JSXIdentifier: [],
  JSXMemberExpression: ["object", "property"],
  JSXNamespacedName: ["namespace", "name"],
  JSXOpeningElement: ["name", "attributes"],
  JSXOpeningFragment: [],
  JSXSpreadAttribute: ["argument"],
  JSXSpreadChild: ["expression"],
  JSXText: [],
  LabeledStatement: ["label", "body"],
  Literal: [],
  LogicalExpression: ["left", "right"],
  MemberExpression: ["object", "property"],
  MetaProperty: ["meta", "property"],
  MethodDefinition: ["key", "value"],
  NewExpression: ["callee", "arguments"],
  ObjectExpression: ["properties"],
  ObjectPattern: ["properties"],
  PrivateIdentifier: [],
  Program: ["body"],
  Property: ["key", "value"],
  PropertyDefinition: ["key", "value"],
  RestElement: ["argument"],
  ReturnStatement: ["argument"],
  SequenceExpression: ["expressions"],
  SpreadElement: ["argument"],
  StaticBlock: ["body"],
  Super: [],
  SwitchCase: ["test", "consequent"],
  SwitchStatement: ["discriminant", "cases"],
  TaggedTemplateExpression: ["tag", "quasi"],
  TemplateElement: [],
  TemplateLiteral: ["quasis", "expressions"],
  ThisExpression: [],
  ThrowStatement: ["argument"],
  TryStatement: ["block", "handler", "finalizer"],
  UnaryExpression: ["argument"],
  UpdateExpression: ["argument"],
  VariableDeclaration: ["declarations"],
  VariableDeclarator: ["id", "init"],
  WhileStatement: ["test", "body"],
  WithStatement: ["object", "body"],
  YieldExpression: ["argument"]
};
var NODE_TYPES = Object.keys(KEYS2);
for (const type of NODE_TYPES) {
  Object.freeze(KEYS2[type]);
}
Object.freeze(KEYS2);
var visitor_keys_default = KEYS2;

// node_modules/eslint-visitor-keys/lib/index.js
function unionWith(additionalKeys) {
  const retv = (
    /** @type {{ [type: string]: ReadonlyArray<string> }} */
    Object.assign({}, visitor_keys_default)
  );
  for (const type of Object.keys(additionalKeys)) {
    if (Object.hasOwn(retv, type)) {
      const keys = new Set(additionalKeys[type]);
      for (const key of retv[type]) {
        keys.add(key);
      }
      retv[type] = Object.freeze(Array.from(keys));
    } else {
      retv[type] = Object.freeze(Array.from(additionalKeys[type]));
    }
  }
  return Object.freeze(retv);
}

// node_modules/toml-eslint-parser/lib/index.mjs
function last(arr) {
  return arr[arr.length - 1] ?? null;
}
function toKeyName(node) {
  return node.type === "TOMLBare" ? node.name : node.value;
}
var TOMLVerImpl = class {
  constructor(major, minor) {
    this.major = major;
    this.minor = minor;
  }
  lt(major, minor) {
    return this.major < major || this.major === major && this.minor < minor;
  }
  gte(major, minor) {
    return this.major > major || this.major === major && this.minor >= minor;
  }
};
var TOML_VERSION_1_0 = new TOMLVerImpl(1, 0);
var TOML_VERSION_1_1 = new TOMLVerImpl(1, 1);
var DEFAULT_TOML_VERSION = TOML_VERSION_1_1;
var SUPPORTED_TOML_VERSIONS = {
  "1.0": TOML_VERSION_1_0,
  "1.0.0": TOML_VERSION_1_0,
  "1.1": TOML_VERSION_1_1,
  "1.1.0": TOML_VERSION_1_1,
  latest: TOML_VERSION_1_1,
  next: TOML_VERSION_1_1
};
function getTOMLVer(v) {
  return v && SUPPORTED_TOML_VERSIONS[v] || DEFAULT_TOML_VERSION;
}
var MESSAGES = {
  "unterminated-string": "Unterminated string constant",
  "unterminated-table-key": "Unterminated table-key",
  "unterminated-array": "Unterminated array",
  "unterminated-inline-table": "Unterminated inline table",
  "missing-key": "Empty bare keys are not allowed",
  "missing-newline": "Must be a newline",
  "missing-equals-sign": "Expected equal (=) token",
  "missing-value": "Unspecified values are invalid",
  "missing-comma": "Expected comma (,) token",
  "dupe-keys": "Defining a key multiple times is invalid",
  "unexpected-char": "Unexpected character",
  "unexpected-token": "Unexpected token",
  "invalid-control-character": "Control characters (codes < 0x1f and 0x7f) are not allowed",
  "invalid-comment-character": "Invalid code point {{cp}} within comments",
  "invalid-key-value-newline": "The key, equals sign, and value must be on the same line",
  "invalid-inline-table-newline": "No newlines are allowed between the curly braces unless they are valid within a value",
  "invalid-underscore": "Underscores are allowed between digits",
  "invalid-space": "Unexpected spaces",
  "invalid-three-quotes": "Three or more quotes are not permitted",
  "invalid-date": "Unexpected invalid date",
  "invalid-time": "Unexpected invalid time",
  "invalid-leading-zero": "Leading zeros are not allowed",
  "invalid-trailing-comma-in-inline-table": "Trailing comma is not permitted in an inline table",
  "invalid-char-in-escape-sequence": "Invalid character in escape sequence",
  "invalid-consecutive-dots-in-key": "Consecutive dots are not permitted in keys",
  "invalid-code-point": "Invalid code point {{cp}}",
  "invalid-trailing-dot-in-key": "Keys cannot end with a dot",
  "invalid-leading-dot-in-key": "Keys cannot start with a dot"
};
function getMessage(code, data) {
  if (data) return MESSAGES[code].replace(/\{\{(.*?)\}\}/gu, (_, name$2) => {
    if (name$2 in data) return data[name$2];
    return `{{${name$2}}}`;
  });
  return MESSAGES[code];
}
var ParseError = class extends SyntaxError {
  /**
  * Initialize this ParseError instance.
  *
  */
  constructor(code, offset, line, column, data) {
    super(getMessage(code, data));
    this.index = offset;
    this.lineNumber = line;
    this.column = column;
  }
};
var CodePoint = {
  EOF: -1,
  NULL: 0,
  SOH: 1,
  BACKSPACE: 8,
  TABULATION: 9,
  LINE_FEED: 10,
  FORM_FEED: 12,
  CARRIAGE_RETURN: 13,
  ESCAPE: 27,
  SO: 14,
  US: 31,
  SPACE: 32,
  QUOTATION_MARK: 34,
  HASH: 35,
  SINGLE_QUOTE: 39,
  PLUS_SIGN: 43,
  COMMA: 44,
  DASH: 45,
  DOT: 46,
  DIGIT_0: 48,
  DIGIT_1: 49,
  DIGIT_2: 50,
  DIGIT_3: 51,
  DIGIT_7: 55,
  DIGIT_9: 57,
  COLON: 58,
  EQUALS_SIGN: 61,
  LATIN_CAPITAL_A: 65,
  LATIN_CAPITAL_E: 69,
  LATIN_CAPITAL_F: 70,
  LATIN_CAPITAL_T: 84,
  LATIN_CAPITAL_U: 85,
  LATIN_CAPITAL_Z: 90,
  LEFT_BRACKET: 91,
  BACKSLASH: 92,
  RIGHT_BRACKET: 93,
  UNDERSCORE: 95,
  LATIN_SMALL_A: 97,
  LATIN_SMALL_B: 98,
  LATIN_SMALL_E: 101,
  LATIN_SMALL_F: 102,
  LATIN_SMALL_I: 105,
  LATIN_SMALL_L: 108,
  LATIN_SMALL_N: 110,
  LATIN_SMALL_O: 111,
  LATIN_SMALL_R: 114,
  LATIN_SMALL_S: 115,
  LATIN_SMALL_T: 116,
  LATIN_SMALL_U: 117,
  LATIN_SMALL_X: 120,
  LATIN_SMALL_Z: 122,
  LEFT_BRACE: 123,
  RIGHT_BRACE: 125,
  TILDE: 126,
  DELETE: 127,
  PAD: 128,
  SUPERSCRIPT_TWO: 178,
  SUPERSCRIPT_THREE: 179,
  SUPERSCRIPT_ONE: 185,
  VULGAR_FRACTION_ONE_QUARTER: 188,
  VULGAR_FRACTION_THREE_QUARTERS: 190,
  LATIN_CAPITAL_LETTER_A_WITH_GRAVE: 192,
  LATIN_CAPITAL_LETTER_O_WITH_DIAERESIS: 214,
  LATIN_CAPITAL_LETTER_O_WITH_STROKE: 216,
  LATIN_SMALL_LETTER_O_WITH_DIAERESIS: 246,
  LATIN_SMALL_LETTER_O_WITH_STROKE: 248,
  GREEK_SMALL_REVERSED_DOTTED_LUNATE_SIGMA_SYMBOL: 891,
  GREEK_CAPITAL_LETTER_YOT: 895,
  CP_1FFF: 8191,
  ZERO_WIDTH_NON_JOINER: 8204,
  ZERO_WIDTH_JOINER: 8205,
  UNDERTIE: 8255,
  CHARACTER_TIE: 8256,
  SUPERSCRIPT_ZERO: 8304,
  CP_218F: 8591,
  CIRCLED_DIGIT_ONE: 9312,
  NEGATIVE_CIRCLED_DIGIT_ZERO: 9471,
  GLAGOLITIC_CAPITAL_LETTER_AZU: 11264,
  CP_2FEF: 12271,
  IDEOGRAPHIC_COMMA: 12289,
  CP_D7FF: 55295,
  CP_E000: 57344,
  CJK_COMPATIBILITY_IDEOGRAPH_F900: 63744,
  ARABIC_LIGATURE_SALAAMUHU_ALAYNAA: 64975,
  ARABIC_LIGATURE_SALLA_USED_AS_KORANIC_STOP_SIGN_ISOLATED_FORM: 65008,
  REPLACEMENT_CHARACTER: 65533,
  LINEAR_B_SYLLABLE_B008_A: 65536,
  CP_EFFFF: 983039,
  CP_10FFFF: 1114111
};
function isControl(cp) {
  return cp >= CodePoint.NULL && cp <= CodePoint.US;
}
function isWhitespace(cp) {
  return cp === CodePoint.TABULATION || cp === CodePoint.SPACE;
}
function isEOL(cp) {
  return cp === CodePoint.LINE_FEED || cp === CodePoint.CARRIAGE_RETURN;
}
function isUpperLetter(cp) {
  return cp >= CodePoint.LATIN_CAPITAL_A && cp <= CodePoint.LATIN_CAPITAL_Z;
}
function isLowerLetter(cp) {
  return cp >= CodePoint.LATIN_SMALL_A && cp <= CodePoint.LATIN_SMALL_Z;
}
function isLetter2(cp) {
  return isLowerLetter(cp) || isUpperLetter(cp);
}
function isDigit4(cp) {
  return cp >= CodePoint.DIGIT_0 && cp <= CodePoint.DIGIT_9;
}
function isHexDig(cp) {
  return isDigit4(cp) || cp >= CodePoint.LATIN_SMALL_A && cp <= CodePoint.LATIN_SMALL_F || cp >= CodePoint.LATIN_CAPITAL_A && cp <= CodePoint.LATIN_CAPITAL_F;
}
function isOctalDig(cp) {
  return cp >= CodePoint.DIGIT_0 && cp <= CodePoint.DIGIT_7;
}
function isUnicodeScalarValue(cp) {
  return cp >= 0 && cp <= 55295 || cp >= 57344 && cp <= 1114111;
}
function sortedLastIndex(array2, value) {
  let low = 0;
  let high = array2.length;
  while (low < high) {
    const mid = low + high >>> 1;
    const val = array2[mid];
    if (val === value) return mid + 1;
    if (val < value) low = mid + 1;
    else high = mid;
  }
  return low;
}
var Locations = class {
  constructor() {
    this.offsets = [];
  }
  addOffset(offset) {
    for (let i = this.offsets.length - 1; i >= 0; i--) {
      const element2 = this.offsets[i];
      if (element2 === offset) return;
      if (element2 < offset) break;
    }
    this.offsets.push(offset);
  }
  /**
  * Calculate the location of the given index.
  * @param index The index to calculate their location.
  * @returns The location of the index.
  */
  getLocFromIndex(offset) {
    const line = sortedLastIndex(this.offsets, offset) + 1;
    return {
      line,
      column: offset - (line === 1 ? 0 : this.offsets[line - 2])
    };
  }
};
var CodePointIterator = class {
  /**
  * Initialize this char iterator.
  */
  constructor(text) {
    this.locs = new Locations();
    this.lastCodePoint = CodePoint.NULL;
    this.start = -1;
    this.end = 0;
    this.text = text;
  }
  next() {
    if (this.lastCodePoint === CodePoint.EOF) return CodePoint.EOF;
    return this.lastCodePoint = this.moveAt(this.end);
  }
  getLocFromIndex(index) {
    return this.locs.getLocFromIndex(index);
  }
  eat(cp) {
    if (this.text.codePointAt(this.end) === cp) {
      this.next();
      return true;
    }
    return false;
  }
  moveAt(offset) {
    this.start = this.end = offset;
    const cp = this.text.codePointAt(this.start) ?? CodePoint.EOF;
    if (cp === CodePoint.EOF) {
      this.end = this.start;
      return cp;
    }
    this.end += cp >= 65536 ? 2 : 1;
    if (cp === CodePoint.LINE_FEED) this.locs.addOffset(this.end);
    else if (cp === CodePoint.CARRIAGE_RETURN) {
      if (this.text.codePointAt(this.end) === CodePoint.LINE_FEED) {
        this.end++;
        this.locs.addOffset(this.end);
      }
      return CodePoint.LINE_FEED;
    }
    return cp;
  }
};
var HAS_BIGINT = typeof BigInt !== "undefined";
var RADIX_PREFIXES = {
  16: "0x",
  10: "",
  8: "0o",
  2: "0b"
};
var ESCAPES_1_0 = {
  [CodePoint.QUOTATION_MARK]: CodePoint.QUOTATION_MARK,
  [CodePoint.BACKSLASH]: CodePoint.BACKSLASH,
  [CodePoint.LATIN_SMALL_B]: CodePoint.BACKSPACE,
  [CodePoint.LATIN_SMALL_F]: CodePoint.FORM_FEED,
  [CodePoint.LATIN_SMALL_N]: CodePoint.LINE_FEED,
  [CodePoint.LATIN_SMALL_R]: CodePoint.CARRIAGE_RETURN,
  [CodePoint.LATIN_SMALL_T]: CodePoint.TABULATION
};
var ESCAPES_LATEST = {
  ...ESCAPES_1_0,
  [CodePoint.LATIN_SMALL_E]: CodePoint.ESCAPE
};
var Tokenizer = class {
  /**
  * Initialize this tokenizer.
  */
  constructor(text, parserOptions) {
    this.backCode = false;
    this.lastCodePoint = CodePoint.NULL;
    this.state = "DATA";
    this.token = null;
    this.tokenStart = -1;
    this.valuesEnabled = false;
    this.text = text;
    this.parserOptions = parserOptions || {};
    this.codePointIterator = new CodePointIterator(text);
    this.tomlVersion = getTOMLVer(this.parserOptions.tomlVersion);
    this.ESCAPES = this.tomlVersion.gte(1, 1) ? ESCAPES_LATEST : ESCAPES_1_0;
  }
  get start() {
    return this.codePointIterator.start;
  }
  get end() {
    return this.codePointIterator.end;
  }
  getLocFromIndex(index) {
    return this.codePointIterator.getLocFromIndex(index);
  }
  /**
  * Report an invalid character error.
  */
  reportParseError(code, data) {
    const offset = this.codePointIterator.start;
    const loc = this.codePointIterator.getLocFromIndex(offset);
    throw new ParseError(code, offset, loc.line, loc.column, data);
  }
  /**
  * Get the next token.
  */
  nextToken() {
    let token = this.token;
    if (token != null) {
      this.token = null;
      return token;
    }
    let cp = this.lastCodePoint;
    while (cp !== CodePoint.EOF && !this.token) {
      cp = this.nextCode();
      const nextState = this[this.state](cp);
      if (!nextState) throw new Error(`Unknown error: pre state=${this.state}`);
      this.state = nextState;
    }
    token = this.token;
    this.token = null;
    return token;
  }
  /**
  * Get the next code point.
  */
  nextCode() {
    if (this.lastCodePoint === CodePoint.EOF) return CodePoint.EOF;
    if (this.backCode) {
      this.backCode = false;
      return this.lastCodePoint;
    }
    return this.lastCodePoint = this.codePointIterator.next();
  }
  /**
  * Eat the next code point.
  */
  eatCode(cp) {
    if (this.lastCodePoint === CodePoint.EOF) return false;
    if (this.backCode) {
      if (this.lastCodePoint === cp) {
        this.backCode = false;
        return true;
      }
      return false;
    }
    return this.codePointIterator.eat(cp);
  }
  /**
  * Moves the character position to the given position.
  */
  moveAt(loc) {
    if (this.backCode) this.backCode = false;
    this.lastCodePoint = this.codePointIterator.moveAt(loc);
  }
  /**
  * Back the current code point as the given state.
  */
  back(state) {
    this.backCode = true;
    return state;
  }
  punctuatorToken() {
    this.startToken();
    this.endToken("Punctuator", "end");
  }
  startToken() {
    this.tokenStart = this.codePointIterator.start;
  }
  /**
  * Commit the current token.
  */
  endToken(type, pos, option1, option2) {
    const { tokenStart } = this;
    const end = this.codePointIterator[pos];
    const range = [tokenStart, end];
    const loc = {
      start: this.codePointIterator.getLocFromIndex(tokenStart),
      end: this.codePointIterator.getLocFromIndex(end)
    };
    if (type === "Block") this.token = {
      type,
      value: this.text.slice(tokenStart + 1, end),
      range,
      loc
    };
    else {
      let token;
      const value = this.text.slice(tokenStart, end);
      if (type === "BasicString" || type === "LiteralString" || type === "MultiLineBasicString" || type === "MultiLineLiteralString") token = {
        type,
        value,
        string: option1,
        range,
        loc
      };
      else if (type === "Integer") {
        const text = option1;
        token = {
          type,
          value,
          number: parseInt(text, option2),
          bigint: HAS_BIGINT ? BigInt(RADIX_PREFIXES[option2] + text) : null,
          range,
          loc
        };
      } else if (type === "Float") token = {
        type,
        value,
        number: option1,
        range,
        loc
      };
      else if (type === "Boolean") token = {
        type,
        value,
        boolean: option1,
        range,
        loc
      };
      else if (type === "LocalDate" || type === "LocalTime" || type === "LocalDateTime" || type === "OffsetDateTime") token = {
        type,
        value,
        date: option1,
        range,
        loc
      };
      else token = {
        type,
        value,
        range,
        loc
      };
      this.token = token;
    }
  }
  DATA(cp) {
    while (isWhitespace(cp) || isEOL(cp)) cp = this.nextCode();
    if (cp === CodePoint.HASH) {
      this.startToken();
      return "COMMENT";
    }
    if (cp === CodePoint.QUOTATION_MARK) {
      this.startToken();
      return "BASIC_STRING";
    }
    if (cp === CodePoint.SINGLE_QUOTE) {
      this.startToken();
      return "LITERAL_STRING";
    }
    if (cp === CodePoint.DOT || cp === CodePoint.EQUALS_SIGN || cp === CodePoint.LEFT_BRACKET || cp === CodePoint.RIGHT_BRACKET || cp === CodePoint.LEFT_BRACE || cp === CodePoint.RIGHT_BRACE || cp === CodePoint.COMMA) {
      this.punctuatorToken();
      return "DATA";
    }
    if (this.valuesEnabled) {
      if (cp === CodePoint.DASH || cp === CodePoint.PLUS_SIGN) {
        this.startToken();
        return "SIGN";
      }
      if (cp === CodePoint.LATIN_SMALL_N || cp === CodePoint.LATIN_SMALL_I) {
        this.startToken();
        return this.back("NAN_OR_INF");
      }
      if (isDigit4(cp)) {
        this.startToken();
        return this.back("NUMBER");
      }
      if (cp === CodePoint.LATIN_SMALL_T || cp === CodePoint.LATIN_SMALL_F) {
        this.startToken();
        return this.back("BOOLEAN");
      }
    } else if (isUnquotedKeyChar(cp, this.tomlVersion)) {
      this.startToken();
      return "BARE";
    }
    if (cp === CodePoint.EOF) return "DATA";
    return this.reportParseError("unexpected-char");
  }
  COMMENT(cp) {
    const processCommentChar = this.tomlVersion.gte(1, 1) ? (c) => {
      if (!isNonEOL(c)) this.reportParseError("invalid-comment-character", { cp: JSON.stringify(String.fromCodePoint(c)).slice(1, -1) });
    } : (c) => {
      if (isControlOtherThanTab(c)) this.reportParseErrorControlChar();
    };
    while (!isEOL(cp) && cp !== CodePoint.EOF) {
      processCommentChar(cp);
      cp = this.nextCode();
    }
    this.endToken("Block", "start");
    return "DATA";
  }
  BARE(cp) {
    while (isUnquotedKeyChar(cp, this.tomlVersion)) cp = this.nextCode();
    this.endToken("Bare", "start");
    return this.back("DATA");
  }
  BASIC_STRING(cp) {
    if (cp === CodePoint.QUOTATION_MARK) {
      cp = this.nextCode();
      if (cp === CodePoint.QUOTATION_MARK) return "MULTI_LINE_BASIC_STRING";
      this.endToken("BasicString", "start", "");
      return this.back("DATA");
    }
    const out = [];
    while (cp !== CodePoint.QUOTATION_MARK && cp !== CodePoint.EOF && cp !== CodePoint.LINE_FEED) {
      if (isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      if (cp === CodePoint.BACKSLASH) {
        cp = this.nextCode();
        const ecp = this.ESCAPES[cp];
        if (ecp) {
          out.push(ecp);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_U) {
          const code = this.parseUnicode(4);
          out.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_CAPITAL_U) {
          const code = this.parseUnicode(8);
          out.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_X && this.tomlVersion.gte(1, 1)) {
          const code = this.parseUnicode(2);
          out.push(code);
          cp = this.nextCode();
          continue;
        }
        return this.reportParseError("invalid-char-in-escape-sequence");
      }
      out.push(cp);
      cp = this.nextCode();
    }
    if (cp !== CodePoint.QUOTATION_MARK) return this.reportParseError("unterminated-string");
    this.endToken("BasicString", "end", String.fromCodePoint(...out));
    return "DATA";
  }
  MULTI_LINE_BASIC_STRING(cp) {
    const out = [];
    if (cp === CodePoint.LINE_FEED) cp = this.nextCode();
    while (cp !== CodePoint.EOF) {
      if (cp !== CodePoint.LINE_FEED && isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      if (cp === CodePoint.QUOTATION_MARK) {
        const startPos = this.codePointIterator.start;
        if (this.eatCode(CodePoint.QUOTATION_MARK) && this.eatCode(CodePoint.QUOTATION_MARK)) {
          if (this.eatCode(CodePoint.QUOTATION_MARK)) {
            out.push(CodePoint.QUOTATION_MARK);
            if (this.eatCode(CodePoint.QUOTATION_MARK)) {
              out.push(CodePoint.QUOTATION_MARK);
              if (this.eatCode(CodePoint.QUOTATION_MARK)) {
                this.moveAt(startPos);
                return this.reportParseError("invalid-three-quotes");
              }
            }
          }
          this.endToken("MultiLineBasicString", "end", String.fromCodePoint(...out));
          return "DATA";
        }
        this.moveAt(startPos);
      }
      if (cp === CodePoint.BACKSLASH) {
        cp = this.nextCode();
        const ecp = this.ESCAPES[cp];
        if (ecp) {
          out.push(ecp);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_U) {
          const code = this.parseUnicode(4);
          out.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_CAPITAL_U) {
          const code = this.parseUnicode(8);
          out.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_X && this.tomlVersion.gte(1, 1)) {
          const code = this.parseUnicode(2);
          out.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LINE_FEED) {
          cp = this.nextCode();
          while (isWhitespace(cp) || cp === CodePoint.LINE_FEED) cp = this.nextCode();
          continue;
        } else if (isWhitespace(cp)) {
          let valid = true;
          const startPos = this.codePointIterator.start;
          let nextCp;
          while ((nextCp = this.nextCode()) !== CodePoint.EOF) {
            if (nextCp === CodePoint.LINE_FEED) break;
            if (!isWhitespace(nextCp)) {
              this.moveAt(startPos);
              valid = false;
              break;
            }
          }
          if (valid) {
            cp = this.nextCode();
            while (isWhitespace(cp) || cp === CodePoint.LINE_FEED) cp = this.nextCode();
            continue;
          }
        }
        return this.reportParseError("invalid-char-in-escape-sequence");
      }
      out.push(cp);
      cp = this.nextCode();
    }
    return this.reportParseError("unterminated-string");
  }
  LITERAL_STRING(cp) {
    if (cp === CodePoint.SINGLE_QUOTE) {
      cp = this.nextCode();
      if (cp === CodePoint.SINGLE_QUOTE) return "MULTI_LINE_LITERAL_STRING";
      this.endToken("LiteralString", "start", "");
      return this.back("DATA");
    }
    const out = [];
    while (cp !== CodePoint.SINGLE_QUOTE && cp !== CodePoint.EOF && cp !== CodePoint.LINE_FEED) {
      if (isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      out.push(cp);
      cp = this.nextCode();
    }
    if (cp !== CodePoint.SINGLE_QUOTE) return this.reportParseError("unterminated-string");
    this.endToken("LiteralString", "end", String.fromCodePoint(...out));
    return "DATA";
  }
  MULTI_LINE_LITERAL_STRING(cp) {
    const out = [];
    if (cp === CodePoint.LINE_FEED) cp = this.nextCode();
    while (cp !== CodePoint.EOF) {
      if (cp !== CodePoint.LINE_FEED && isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      if (cp === CodePoint.SINGLE_QUOTE) {
        const startPos = this.codePointIterator.start;
        if (this.eatCode(CodePoint.SINGLE_QUOTE) && this.eatCode(CodePoint.SINGLE_QUOTE)) {
          if (this.eatCode(CodePoint.SINGLE_QUOTE)) {
            out.push(CodePoint.SINGLE_QUOTE);
            if (this.eatCode(CodePoint.SINGLE_QUOTE)) {
              out.push(CodePoint.SINGLE_QUOTE);
              if (this.eatCode(CodePoint.SINGLE_QUOTE)) {
                this.moveAt(startPos);
                return this.reportParseError("invalid-three-quotes");
              }
            }
          }
          this.endToken("MultiLineLiteralString", "end", String.fromCodePoint(...out));
          return "DATA";
        }
        this.moveAt(startPos);
      }
      out.push(cp);
      cp = this.nextCode();
    }
    return this.reportParseError("unterminated-string");
  }
  SIGN(cp) {
    if (cp === CodePoint.LATIN_SMALL_N || cp === CodePoint.LATIN_SMALL_I) return this.back("NAN_OR_INF");
    if (isDigit4(cp)) return this.back("NUMBER");
    return this.reportParseError("unexpected-char");
  }
  NAN_OR_INF(cp) {
    if (cp === CodePoint.LATIN_SMALL_N) {
      const startPos = this.codePointIterator.start;
      if (this.eatCode(CodePoint.LATIN_SMALL_A) && this.eatCode(CodePoint.LATIN_SMALL_N)) {
        this.endToken("Float", "end", NaN);
        return "DATA";
      }
      this.moveAt(startPos);
    } else if (cp === CodePoint.LATIN_SMALL_I) {
      const startPos = this.codePointIterator.start;
      if (this.eatCode(CodePoint.LATIN_SMALL_N) && this.eatCode(CodePoint.LATIN_SMALL_F)) {
        this.endToken("Float", "end", this.text[this.tokenStart] === "-" ? -Infinity : Infinity);
        return "DATA";
      }
      this.moveAt(startPos);
    }
    return this.reportParseError("unexpected-char");
  }
  NUMBER(cp) {
    const start = this.text[this.tokenStart];
    const sign = start === "+" ? CodePoint.PLUS_SIGN : start === "-" ? CodePoint.DASH : CodePoint.NULL;
    if (cp === CodePoint.DIGIT_0) {
      if (sign === CodePoint.NULL) {
        const startPos = this.codePointIterator.start;
        const nextCp$1 = this.nextCode();
        if (isDigit4(nextCp$1)) {
          const nextNextCp = this.nextCode();
          if (nextNextCp === CodePoint.COLON) {
            this.data = {
              hasDate: false,
              year: 0,
              month: 0,
              day: 0,
              hour: Number(String.fromCodePoint(CodePoint.DIGIT_0, nextCp$1)),
              minute: 0,
              second: 0
            };
            return "TIME_MINUTE";
          }
          if (isDigit4(nextNextCp)) {
            const nextNextNextCp = this.nextCode();
            if (isDigit4(nextNextNextCp) && this.eatCode(CodePoint.DASH)) {
              this.data = {
                hasDate: true,
                year: Number(String.fromCodePoint(CodePoint.DIGIT_0, nextCp$1, nextNextCp, nextNextNextCp)),
                month: 0,
                day: 0,
                hour: 0,
                minute: 0,
                second: 0
              };
              return "DATE_MONTH";
            }
          }
          this.moveAt(startPos);
          return this.reportParseError("invalid-leading-zero");
        }
        this.moveAt(startPos);
      }
      cp = this.nextCode();
      if (cp === CodePoint.LATIN_SMALL_X || cp === CodePoint.LATIN_SMALL_O || cp === CodePoint.LATIN_SMALL_B) {
        if (sign !== CodePoint.NULL) return this.reportParseError("unexpected-char");
        return cp === CodePoint.LATIN_SMALL_X ? "HEX" : cp === CodePoint.LATIN_SMALL_O ? "OCTAL" : "BINARY";
      }
      if (cp === CodePoint.LATIN_SMALL_E || cp === CodePoint.LATIN_CAPITAL_E) {
        this.data = {
          minus: sign === CodePoint.DASH,
          left: [CodePoint.DIGIT_0]
        };
        return "EXPONENT_RIGHT";
      }
      if (cp === CodePoint.DOT) {
        this.data = {
          minus: sign === CodePoint.DASH,
          absInt: [CodePoint.DIGIT_0]
        };
        return "FRACTIONAL_RIGHT";
      }
      this.endToken("Integer", "start", "0", 10);
      return this.back("DATA");
    }
    const { out, nextCp, hasUnderscore } = this.parseDigits(cp, isDigit4);
    if (nextCp === CodePoint.DASH && sign === CodePoint.NULL && !hasUnderscore && out.length === 4) {
      this.data = {
        hasDate: true,
        year: Number(String.fromCodePoint(...out)),
        month: 0,
        day: 0,
        hour: 0,
        minute: 0,
        second: 0
      };
      return "DATE_MONTH";
    }
    if (nextCp === CodePoint.COLON && sign === CodePoint.NULL && !hasUnderscore && out.length === 2) {
      this.data = {
        hasDate: false,
        year: 0,
        month: 0,
        day: 0,
        hour: Number(String.fromCodePoint(...out)),
        minute: 0,
        second: 0
      };
      return "TIME_MINUTE";
    }
    if (nextCp === CodePoint.LATIN_SMALL_E || nextCp === CodePoint.LATIN_CAPITAL_E) {
      this.data = {
        minus: sign === CodePoint.DASH,
        left: out
      };
      return "EXPONENT_RIGHT";
    }
    if (nextCp === CodePoint.DOT) {
      this.data = {
        minus: sign === CodePoint.DASH,
        absInt: out
      };
      return "FRACTIONAL_RIGHT";
    }
    this.endToken("Integer", "start", sign === CodePoint.DASH ? String.fromCodePoint(CodePoint.DASH, ...out) : String.fromCodePoint(...out), 10);
    return this.back("DATA");
  }
  HEX(cp) {
    const { out } = this.parseDigits(cp, isHexDig);
    this.endToken("Integer", "start", String.fromCodePoint(...out), 16);
    return this.back("DATA");
  }
  OCTAL(cp) {
    const { out } = this.parseDigits(cp, isOctalDig);
    this.endToken("Integer", "start", String.fromCodePoint(...out), 8);
    return this.back("DATA");
  }
  BINARY(cp) {
    const { out } = this.parseDigits(cp, (c) => c === CodePoint.DIGIT_0 || c === CodePoint.DIGIT_1);
    this.endToken("Integer", "start", String.fromCodePoint(...out), 2);
    return this.back("DATA");
  }
  FRACTIONAL_RIGHT(cp) {
    const { minus, absInt } = this.data;
    const { out, nextCp } = this.parseDigits(cp, isDigit4);
    const absNum = [
      ...absInt,
      CodePoint.DOT,
      ...out
    ];
    if (nextCp === CodePoint.LATIN_SMALL_E || nextCp === CodePoint.LATIN_CAPITAL_E) {
      this.data = {
        minus,
        left: absNum
      };
      return "EXPONENT_RIGHT";
    }
    const value = Number(minus ? String.fromCodePoint(CodePoint.DASH, ...absNum) : String.fromCodePoint(...absNum));
    this.endToken("Float", "start", value);
    return this.back("DATA");
  }
  EXPONENT_RIGHT(cp) {
    const { left, minus: leftMinus } = this.data;
    let minus = false;
    if (cp === CodePoint.DASH || cp === CodePoint.PLUS_SIGN) {
      minus = cp === CodePoint.DASH;
      cp = this.nextCode();
    }
    const { out } = this.parseDigits(cp, isDigit4);
    const right = out;
    if (minus) right.unshift(CodePoint.DASH);
    const value = Number(leftMinus ? String.fromCodePoint(CodePoint.DASH, ...left, CodePoint.LATIN_SMALL_E, ...right) : String.fromCodePoint(...left, CodePoint.LATIN_SMALL_E, ...right));
    this.endToken("Float", "start", value);
    return this.back("DATA");
  }
  BOOLEAN(cp) {
    if (cp === CodePoint.LATIN_SMALL_T) {
      const startPos = this.codePointIterator.start;
      if (this.eatCode(CodePoint.LATIN_SMALL_R) && this.eatCode(CodePoint.LATIN_SMALL_U) && this.eatCode(CodePoint.LATIN_SMALL_E)) {
        this.endToken("Boolean", "end", true);
        return "DATA";
      }
      this.moveAt(startPos);
    } else if (cp === CodePoint.LATIN_SMALL_F) {
      const startPos = this.codePointIterator.start;
      if (this.eatCode(CodePoint.LATIN_SMALL_A) && this.eatCode(CodePoint.LATIN_SMALL_L) && this.eatCode(CodePoint.LATIN_SMALL_S) && this.eatCode(CodePoint.LATIN_SMALL_E)) {
        this.endToken("Boolean", "end", false);
        return "DATA";
      }
      this.moveAt(startPos);
    }
    return this.reportParseError("unexpected-char");
  }
  DATE_MONTH(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (cp !== CodePoint.DASH) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.start;
    const data = this.data;
    data.month = Number(this.text.slice(start, end));
    return "DATE_DAY";
  }
  DATE_DAY(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.end;
    const data = this.data;
    data.day = Number(this.text.slice(start, end));
    if (!isValidDate(data.year, data.month, data.day)) return this.reportParseError("invalid-date");
    cp = this.nextCode();
    if (cp === CodePoint.LATIN_CAPITAL_T || cp === CodePoint.LATIN_SMALL_T) return "TIME_HOUR";
    if (cp === CodePoint.SPACE) {
      const startPos = this.codePointIterator.start;
      if (isDigit4(this.nextCode()) && isDigit4(this.nextCode())) {
        this.moveAt(startPos);
        return "TIME_HOUR";
      }
      this.moveAt(startPos);
    }
    const dateValue = getDateFromDateTimeData(data, "");
    this.endToken("LocalDate", "start", dateValue);
    return this.back("DATA");
  }
  TIME_HOUR(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (cp !== CodePoint.COLON) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.start;
    const data = this.data;
    data.hour = Number(this.text.slice(start, end));
    return "TIME_MINUTE";
  }
  TIME_MINUTE(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.end;
    const data = this.data;
    data.minute = Number(this.text.slice(start, end));
    cp = this.nextCode();
    if (cp === CodePoint.COLON) return "TIME_SECOND";
    if (this.tomlVersion.lt(1, 1)) return this.reportParseError("unexpected-char");
    if (!isValidTime(data.hour, data.minute, data.second)) return this.reportParseError("invalid-time");
    return this.processTimeEnd(cp, data);
  }
  TIME_SECOND(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.end;
    const data = this.data;
    data.second = Number(this.text.slice(start, end));
    if (!isValidTime(data.hour, data.minute, data.second)) return this.reportParseError("invalid-time");
    cp = this.nextCode();
    if (cp === CodePoint.DOT) return "TIME_SEC_FRAC";
    return this.processTimeEnd(cp, data);
  }
  TIME_SEC_FRAC(cp) {
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    const start = this.codePointIterator.start;
    while (isDigit4(cp)) cp = this.nextCode();
    const end = this.codePointIterator.start;
    const data = this.data;
    data.frac = this.text.slice(start, end);
    return this.processTimeEnd(cp, data);
  }
  processTimeEnd(cp, data) {
    if (data.hasDate) {
      if (cp === CodePoint.DASH || cp === CodePoint.PLUS_SIGN) {
        data.offsetSign = cp;
        return "TIME_OFFSET";
      }
      if (cp === CodePoint.LATIN_CAPITAL_Z || cp === CodePoint.LATIN_SMALL_Z) {
        const dateValue$2 = getDateFromDateTimeData(data, "Z");
        this.endToken("OffsetDateTime", "end", dateValue$2);
        return "DATA";
      }
      const dateValue$1 = getDateFromDateTimeData(data, "");
      this.endToken("LocalDateTime", "start", dateValue$1);
      return this.back("DATA");
    }
    const dateValue = getDateFromDateTimeData(data, "");
    this.endToken("LocalTime", "start", dateValue);
    return this.back("DATA");
  }
  TIME_OFFSET(cp) {
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    const hourStart = this.codePointIterator.start;
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (cp !== CodePoint.COLON) return this.reportParseError("unexpected-char");
    const hourEnd = this.codePointIterator.start;
    cp = this.nextCode();
    const minuteStart = this.codePointIterator.start;
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit4(cp)) return this.reportParseError("unexpected-char");
    const minuteEnd = this.codePointIterator.end;
    const hour = Number(this.text.slice(hourStart, hourEnd));
    const minute = Number(this.text.slice(minuteStart, minuteEnd));
    if (!isValidTime(hour, minute, 0)) return this.reportParseError("invalid-time");
    const data = this.data;
    const dateValue = getDateFromDateTimeData(data, `${String.fromCodePoint(data.offsetSign)}${padStart(hour, 2)}:${padStart(minute, 2)}`);
    this.endToken("OffsetDateTime", "end", dateValue);
    return "DATA";
  }
  parseDigits(cp, checkDigit) {
    if (cp === CodePoint.UNDERSCORE) return this.reportParseError("invalid-underscore");
    if (!checkDigit(cp)) return this.reportParseError("unexpected-char");
    const out = [];
    let before = CodePoint.NULL;
    let hasUnderscore = false;
    while (checkDigit(cp) || cp === CodePoint.UNDERSCORE) {
      if (cp === CodePoint.UNDERSCORE) {
        hasUnderscore = true;
        if (before === CodePoint.UNDERSCORE) return this.reportParseError("invalid-underscore");
      } else out.push(cp);
      before = cp;
      cp = this.nextCode();
    }
    if (before === CodePoint.UNDERSCORE) return this.reportParseError("invalid-underscore");
    return {
      out,
      nextCp: cp,
      hasUnderscore
    };
  }
  parseUnicode(count) {
    const startLoc = this.codePointIterator.start;
    const start = this.codePointIterator.end;
    let charCount = 0;
    let cp;
    while ((cp = this.nextCode()) !== CodePoint.EOF) {
      if (!isHexDig(cp)) {
        this.moveAt(startLoc);
        return this.reportParseError("invalid-char-in-escape-sequence");
      }
      charCount++;
      if (charCount >= count) break;
    }
    const end = this.codePointIterator.end;
    const code = this.text.slice(start, end);
    const codePoint = parseInt(code, 16);
    if (!isUnicodeScalarValue(codePoint)) return this.reportParseError("invalid-code-point", { cp: code });
    return codePoint;
  }
  reportParseErrorControlChar() {
    return this.reportParseError("invalid-control-character");
  }
};
function isUnquotedKeyChar(cp, tomlVersion) {
  if (isLetter2(cp) || isDigit4(cp) || cp === CodePoint.UNDERSCORE || cp === CodePoint.DASH) return true;
  if (tomlVersion.lt(1, 1)) return false;
  return false;
}
function isControlOtherThanTab(cp) {
  return isControl(cp) && cp !== CodePoint.TABULATION || cp === CodePoint.DELETE;
}
function isNonEOL(cp) {
  return cp === CodePoint.TABULATION || CodePoint.SPACE <= cp && cp <= CodePoint.TILDE || isNonAscii(cp);
}
function isNonAscii(cp) {
  return CodePoint.PAD <= cp && cp <= CodePoint.CP_D7FF || CodePoint.CP_E000 <= cp && cp <= CodePoint.CP_10FFFF;
}
function isValidDate(y, m, d) {
  if (y >= 0 && m <= 12 && m >= 1 && d >= 1) return d <= (m === 2 ? y & 3 || !(y % 25) && y & 15 ? 28 : 29 : 30 + (m + (m >> 3) & 1));
  return false;
}
function isValidTime(h, m, s) {
  if (h >= 24 || h < 0 || m > 59 || m < 0 || s > 60 || s < 0) return false;
  return true;
}
function getDateFromDateTimeData(data, timeZone) {
  const year = padStart(data.year, 4);
  const month = data.month ? padStart(data.month, 2) : "01";
  const day = data.day ? padStart(data.day, 2) : "01";
  const hour = padStart(data.hour, 2);
  const minute = padStart(data.minute, 2);
  const second = padStart(data.second, 2);
  const textDate = `${year}-${month}-${day}`;
  const frac = data.frac ? `.${data.frac}` : "";
  const dateValue = /* @__PURE__ */ new Date(`${textDate}T${hour}:${minute}:${second}${frac}${timeZone}`);
  if (!isNaN(dateValue.getTime()) || data.second !== 60) return dateValue;
  return /* @__PURE__ */ new Date(`${textDate}T${hour}:${minute}:59${frac}${timeZone}`);
}
function padStart(num, maxLength) {
  return String(num).padStart(maxLength, "0");
}
var VALUE_KIND_VALUE = Symbol("VALUE_KIND_VALUE");
var VALUE_KIND_INTERMEDIATE = Symbol("VALUE_KIND_INTERMEDIATE");
var KeysResolver = class {
  constructor(ctx) {
    this.rootKeys = /* @__PURE__ */ new Map();
    this.tables = [];
    this.ctx = ctx;
  }
  applyResolveKeyForTable(node) {
    let keys = this.rootKeys;
    const peekKeyIndex = node.key.keys.length - 1;
    for (let index = 0; index < peekKeyIndex; index++) {
      const keyNode = node.key.keys[index];
      const keyName = toKeyName(keyNode);
      node.resolvedKey.push(keyName);
      let keyStore = keys.get(keyName);
      if (!keyStore) {
        keyStore = {
          node: keyNode,
          keys: /* @__PURE__ */ new Map()
        };
        keys.set(keyName, keyStore);
      } else if (keyStore.table === "array") {
        const peekIndex = keyStore.peekIndex;
        node.resolvedKey.push(peekIndex);
        keyStore = keyStore.keys.get(peekIndex);
      }
      keys = keyStore.keys;
    }
    const lastKeyNode = node.key.keys[peekKeyIndex];
    const lastKeyName = toKeyName(lastKeyNode);
    node.resolvedKey.push(lastKeyName);
    const lastKeyStore = keys.get(lastKeyName);
    if (!lastKeyStore) if (node.kind === "array") {
      node.resolvedKey.push(0);
      const newKeyStore = {
        node: lastKeyNode,
        keys: /* @__PURE__ */ new Map()
      };
      keys.set(lastKeyName, {
        table: node.kind,
        node: lastKeyNode,
        keys: /* @__PURE__ */ new Map([[0, newKeyStore]]),
        peekIndex: 0
      });
      this.tables.push({
        node,
        keys: newKeyStore.keys
      });
    } else {
      const newKeyStore = {
        table: node.kind,
        node: lastKeyNode,
        keys: /* @__PURE__ */ new Map()
      };
      keys.set(lastKeyName, newKeyStore);
      this.tables.push({
        node,
        keys: newKeyStore.keys
      });
    }
    else if (!lastKeyStore.table) if (node.kind === "array") this.ctx.reportParseError("dupe-keys", lastKeyNode);
    else {
      const transformKey = {
        table: node.kind,
        node: lastKeyNode,
        keys: lastKeyStore.keys
      };
      keys.set(lastKeyName, transformKey);
      this.tables.push({
        node,
        keys: transformKey.keys
      });
    }
    else if (lastKeyStore.table === "array") if (node.kind === "array") {
      const newKeyStore = {
        node: lastKeyNode,
        keys: /* @__PURE__ */ new Map()
      };
      const newIndex = lastKeyStore.peekIndex + 1;
      node.resolvedKey.push(newIndex);
      lastKeyStore.keys.set(newIndex, newKeyStore);
      lastKeyStore.peekIndex = newIndex;
      this.tables.push({
        node,
        keys: newKeyStore.keys
      });
    } else this.ctx.reportParseError("dupe-keys", lastKeyNode);
    else this.ctx.reportParseError("dupe-keys", lastKeyNode);
  }
  verifyDuplicateKeys(node) {
    for (const body of node.body) if (body.type === "TOMLKeyValue") verifyDuplicateKeysForKeyValue(this.ctx, this.rootKeys, body);
    for (const { node: tableNode, keys } of this.tables) for (const body of tableNode.body) verifyDuplicateKeysForKeyValue(this.ctx, keys, body);
  }
};
function verifyDuplicateKeysForKeyValue(ctx, defineKeys, node) {
  let keys = defineKeys;
  const lastKey = last(node.key.keys);
  for (const keyNode of node.key.keys) {
    const key = toKeyName(keyNode);
    let defineKey = keys.get(key);
    if (defineKey) {
      if (defineKey.value === VALUE_KIND_VALUE) ctx.reportParseError("dupe-keys", getAfterNode(keyNode, defineKey.node));
      else if (lastKey === keyNode) ctx.reportParseError("dupe-keys", getAfterNode(keyNode, defineKey.node));
      else if (defineKey.table) ctx.reportParseError("dupe-keys", getAfterNode(keyNode, defineKey.node));
      defineKey.value = VALUE_KIND_INTERMEDIATE;
    } else {
      if (lastKey === keyNode) defineKey = {
        value: VALUE_KIND_VALUE,
        node: keyNode,
        keys: /* @__PURE__ */ new Map()
      };
      else defineKey = {
        value: VALUE_KIND_INTERMEDIATE,
        node: keyNode,
        keys: /* @__PURE__ */ new Map()
      };
      keys.set(key, defineKey);
    }
    keys = defineKey.keys;
  }
  if (node.value.type === "TOMLInlineTable") verifyDuplicateKeysForInlineTable(ctx, keys, node.value);
  else if (node.value.type === "TOMLArray") verifyDuplicateKeysForArray(ctx, keys, node.value);
}
function verifyDuplicateKeysForInlineTable(ctx, defineKeys, node) {
  for (const body of node.body) verifyDuplicateKeysForKeyValue(ctx, defineKeys, body);
}
function verifyDuplicateKeysForArray(ctx, defineKeys, node) {
  const keys = defineKeys;
  for (let index = 0; index < node.elements.length; index++) {
    const element2 = node.elements[index];
    let defineKey = keys.get(index);
    if (defineKey) ctx.reportParseError("dupe-keys", getAfterNode(element2, defineKey.node));
    else {
      defineKey = {
        value: VALUE_KIND_VALUE,
        node: element2,
        keys: /* @__PURE__ */ new Map()
      };
      defineKeys.set(index, defineKey);
      if (element2.type === "TOMLInlineTable") verifyDuplicateKeysForInlineTable(ctx, defineKey.keys, element2);
      else if (element2.type === "TOMLArray") verifyDuplicateKeysForArray(ctx, defineKey.keys, element2);
    }
  }
}
function getAfterNode(a, b) {
  return a.range[0] <= b.range[0] ? b : a;
}
var Context = class {
  constructor(data) {
    this.tokens = [];
    this.comments = [];
    this.back = null;
    this.stateStack = [];
    this.needNewLine = false;
    this.needSameLine = false;
    this.currToken = null;
    this.prevToken = null;
    this.valueContainerStack = [];
    this.tokenizer = new Tokenizer(data.text, data.parserOptions);
    this.topLevelTable = data.topLevelTable;
    this.table = data.topLevelTable;
    this.keysResolver = new KeysResolver(this);
  }
  /**
  * Get the next token.
  */
  nextToken(option) {
    this.prevToken = this.currToken;
    if (this.back) {
      this.currToken = this.back;
      this.back = null;
    } else this.currToken = this._nextTokenFromTokenizer(option);
    if ((this.needNewLine || this.needSameLine || option?.needSameLine) && this.prevToken && this.currToken) if (this.prevToken.loc.end.line === this.currToken.loc.start.line) {
      if (this.needNewLine) return this.reportParseError("missing-newline", this.currToken);
    } else {
      const needSameLine = this.needSameLine || option?.needSameLine;
      if (needSameLine) return this.reportParseError(needSameLine, this.currToken);
    }
    this.needNewLine = false;
    this.needSameLine = false;
    return this.currToken;
  }
  _nextTokenFromTokenizer(option) {
    const valuesEnabled = this.tokenizer.valuesEnabled;
    if (option?.valuesEnabled) this.tokenizer.valuesEnabled = option.valuesEnabled;
    let token = this.tokenizer.nextToken();
    while (token && token.type === "Block") {
      this.comments.push(token);
      token = this.tokenizer.nextToken();
    }
    if (token) this.tokens.push(token);
    this.tokenizer.valuesEnabled = valuesEnabled;
    return token;
  }
  backToken() {
    if (this.back) throw new Error("Illegal state");
    this.back = this.currToken;
    this.currToken = this.prevToken;
  }
  addValueContainer(valueContainer) {
    this.valueContainerStack.push(valueContainer);
    this.tokenizer.valuesEnabled = true;
  }
  consumeValueContainer() {
    const valueContainer = this.valueContainerStack.pop();
    this.tokenizer.valuesEnabled = this.valueContainerStack.length > 0;
    return valueContainer;
  }
  applyResolveKeyForTable(node) {
    this.keysResolver.applyResolveKeyForTable(node);
  }
  verifyDuplicateKeys() {
    this.keysResolver.verifyDuplicateKeys(this.topLevelTable);
  }
  /**
  * Report an invalid token error.
  */
  reportParseError(code, token) {
    let offset, line, column;
    if (token) {
      offset = token.range[0];
      line = token.loc.start.line;
      column = token.loc.start.column;
    } else {
      offset = this.tokenizer.start;
      const startPos = this.tokenizer.getLocFromIndex(offset);
      line = startPos.line;
      column = startPos.column;
    }
    throw new ParseError(code, offset, line, column);
  }
};
var STATE_FOR_ERROR = { VALUE: "missing-value" };
var STRING_VALUE_STYLE_MAP = {
  BasicString: "basic",
  MultiLineBasicString: "basic",
  LiteralString: "literal",
  MultiLineLiteralString: "literal"
};
var STRING_KEY_STYLE_MAP = {
  BasicString: "basic",
  LiteralString: "literal"
};
var DATETIME_VALUE_KIND_MAP = {
  OffsetDateTime: "offset-date-time",
  LocalDateTime: "local-date-time",
  LocalDate: "local-date",
  LocalTime: "local-time"
};
var TOMLParser = class {
  /**
  * Initialize this parser.
  */
  constructor(text, parserOptions) {
    this.text = text;
    this.parserOptions = parserOptions || {};
    this.tomlVersion = getTOMLVer(this.parserOptions.tomlVersion);
  }
  /**
  * Parse TOML
  */
  parse() {
    const ast = {
      type: "Program",
      body: [],
      sourceType: "module",
      tokens: [],
      comments: [],
      parent: null,
      range: [0, 0],
      loc: {
        start: {
          line: 1,
          column: 0
        },
        end: {
          line: 1,
          column: 0
        }
      }
    };
    const node = {
      type: "TOMLTopLevelTable",
      body: [],
      parent: ast,
      range: cloneRange(ast.range),
      loc: cloneLoc(ast.loc)
    };
    ast.body = [node];
    const ctx = new Context({
      text: this.text,
      parserOptions: this.parserOptions,
      topLevelTable: node
    });
    let token = ctx.nextToken();
    if (token) {
      node.range[0] = token.range[0];
      node.loc.start = clonePos(token.loc.start);
      while (token) {
        const state$1 = ctx.stateStack.pop() || "TABLE";
        ctx.stateStack.push(...this[state$1](token, ctx));
        token = ctx.nextToken();
      }
      const state = ctx.stateStack.pop() || "TABLE";
      if (state in STATE_FOR_ERROR) return ctx.reportParseError(STATE_FOR_ERROR[state], null);
      if (ctx.table.type === "TOMLTable") applyEndLoc(ctx.table, last(ctx.table.body));
      applyEndLoc(node, last(node.body));
    }
    ctx.verifyDuplicateKeys();
    ast.tokens = ctx.tokens;
    ast.comments = ctx.comments;
    const endOffset = ctx.tokenizer.end;
    const endPos = ctx.tokenizer.getLocFromIndex(endOffset);
    ast.range[1] = endOffset;
    ast.loc.end = {
      line: endPos.line,
      column: endPos.column
    };
    return ast;
  }
  TABLE(token, ctx) {
    if (isBare(token) || isString(token)) return this.processKeyValue(token, ctx.table, ctx);
    if (isLeftBracket(token)) return this.processTable(token, ctx.topLevelTable, ctx);
    return ctx.reportParseError("unexpected-token", token);
  }
  VALUE(token, ctx) {
    if (isString(token) || isMultiLineString(token)) return this.processStringValue(token, ctx);
    if (isNumber(token)) return this.processNumberValue(token, ctx);
    if (isBoolean(token)) return this.processBooleanValue(token, ctx);
    if (isDateTime(token)) return this.processDateTimeValue(token, ctx);
    if (isLeftBracket(token)) return this.processArray(token, ctx);
    if (isLeftBrace(token)) return this.processInlineTable(token, ctx);
    return ctx.reportParseError("unexpected-token", token);
  }
  processTable(token, topLevelTableNode, ctx) {
    const tableNode = {
      type: "TOMLTable",
      kind: "standard",
      key: null,
      resolvedKey: [],
      body: [],
      parent: topLevelTableNode,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    if (ctx.table.type === "TOMLTable") applyEndLoc(ctx.table, last(ctx.table.body));
    topLevelTableNode.body.push(tableNode);
    ctx.table = tableNode;
    let targetToken = ctx.nextToken({ needSameLine: "invalid-key-value-newline" });
    if (isLeftBracket(targetToken)) {
      if (token.range[1] < targetToken.range[0]) return ctx.reportParseError("invalid-space", targetToken);
      tableNode.kind = "array";
      targetToken = ctx.nextToken({ needSameLine: "invalid-key-value-newline" });
    }
    if (isRightBracket(targetToken)) return ctx.reportParseError("missing-key", targetToken);
    if (!targetToken) return ctx.reportParseError("unterminated-table-key", null);
    targetToken = this.processKeyNode(targetToken, tableNode, ctx).nextToken;
    if (!isRightBracket(targetToken)) return ctx.reportParseError("unterminated-table-key", targetToken);
    if (tableNode.kind === "array") {
      const rightBracket = targetToken;
      targetToken = ctx.nextToken({ needSameLine: "invalid-key-value-newline" });
      if (!isRightBracket(targetToken)) return ctx.reportParseError("unterminated-table-key", targetToken);
      if (rightBracket.range[1] < targetToken.range[0]) return ctx.reportParseError("invalid-space", targetToken);
    }
    applyEndLoc(tableNode, targetToken);
    ctx.applyResolveKeyForTable(tableNode);
    ctx.needNewLine = true;
    return [];
  }
  processKeyValue(token, tableNode, ctx) {
    const keyValueNode = {
      type: "TOMLKeyValue",
      key: null,
      value: null,
      parent: tableNode,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    tableNode.body.push(keyValueNode);
    const { nextToken: targetToken } = this.processKeyNode(token, keyValueNode, ctx);
    if (!isEq(targetToken)) return ctx.reportParseError("missing-equals-sign", targetToken);
    ctx.addValueContainer({
      parent: keyValueNode,
      set: (valNode) => {
        keyValueNode.value = valNode;
        applyEndLoc(keyValueNode, valNode);
        ctx.needNewLine = true;
        return [];
      }
    });
    ctx.needSameLine = "invalid-key-value-newline";
    return ["VALUE"];
  }
  processKeyNode(token, parent, ctx) {
    if (isDot(token)) ctx.reportParseError("invalid-leading-dot-in-key", token);
    const keyNode = {
      type: "TOMLKey",
      keys: [],
      parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    parent.key = keyNode;
    let targetToken = token;
    let dotToken = null;
    do {
      if (isBare(targetToken)) this.processBareKey(targetToken, keyNode);
      else if (isString(targetToken)) this.processStringKey(targetToken, keyNode);
      else break;
      dotToken = null;
      targetToken = ctx.nextToken({ needSameLine: "invalid-key-value-newline" });
      if (!isDot(targetToken)) break;
      dotToken = targetToken;
      targetToken = ctx.nextToken({ needSameLine: "invalid-key-value-newline" });
    } while (targetToken);
    if (dotToken) ctx.reportParseError(isDot(targetToken) ? "invalid-consecutive-dots-in-key" : "invalid-trailing-dot-in-key", dotToken);
    applyEndLoc(keyNode, last(keyNode.keys));
    return {
      keyNode,
      nextToken: targetToken
    };
  }
  processBareKey(token, keyNode) {
    const node = {
      type: "TOMLBare",
      name: token.value,
      parent: keyNode,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    keyNode.keys.push(node);
  }
  processStringKey(token, keyNode) {
    const node = {
      type: "TOMLQuoted",
      kind: "string",
      value: token.string,
      style: STRING_KEY_STYLE_MAP[token.type],
      multiline: false,
      parent: keyNode,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    keyNode.keys.push(node);
  }
  processStringValue(token, ctx) {
    const valueContainer = ctx.consumeValueContainer();
    const node = {
      type: "TOMLValue",
      kind: "string",
      value: token.string,
      style: STRING_VALUE_STYLE_MAP[token.type],
      multiline: isMultiLineString(token),
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    return valueContainer.set(node);
  }
  processNumberValue(token, ctx) {
    const valueContainer = ctx.consumeValueContainer();
    const text = this.text;
    const [startRange, endRange] = token.range;
    let numberString = null;
    const getNumberText = () => {
      return numberString ?? (numberString = text.slice(startRange, endRange).replace(/_/g, ""));
    };
    let node;
    if (token.type === "Integer") node = {
      type: "TOMLValue",
      kind: "integer",
      value: token.number,
      bigint: token.bigint,
      get number() {
        return getNumberText();
      },
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    else node = {
      type: "TOMLValue",
      kind: "float",
      value: token.number,
      get number() {
        return getNumberText();
      },
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    return valueContainer.set(node);
  }
  processBooleanValue(token, ctx) {
    const valueContainer = ctx.consumeValueContainer();
    const node = {
      type: "TOMLValue",
      kind: "boolean",
      value: token.boolean,
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    return valueContainer.set(node);
  }
  processDateTimeValue(token, ctx) {
    const valueContainer = ctx.consumeValueContainer();
    const node = {
      type: "TOMLValue",
      kind: DATETIME_VALUE_KIND_MAP[token.type],
      value: token.date,
      datetime: token.value,
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    return valueContainer.set(node);
  }
  processArray(token, ctx) {
    const valueContainer = ctx.consumeValueContainer();
    const node = {
      type: "TOMLArray",
      elements: [],
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    const nextToken = ctx.nextToken({ valuesEnabled: true });
    if (isRightBracket(nextToken)) {
      applyEndLoc(node, nextToken);
      return valueContainer.set(node);
    }
    ctx.backToken();
    return this.processArrayValue(node, valueContainer, ctx);
  }
  processArrayValue(node, valueContainer, ctx) {
    ctx.addValueContainer({
      parent: node,
      set: (valNode) => {
        node.elements.push(valNode);
        let nextToken = ctx.nextToken({ valuesEnabled: true });
        const hasComma = isComma(nextToken);
        if (hasComma) nextToken = ctx.nextToken({ valuesEnabled: true });
        if (isRightBracket(nextToken)) {
          applyEndLoc(node, nextToken);
          return valueContainer.set(node);
        }
        if (hasComma) {
          ctx.backToken();
          return this.processArrayValue(node, valueContainer, ctx);
        }
        return ctx.reportParseError(nextToken ? "missing-comma" : "unterminated-array", nextToken);
      }
    });
    return ["VALUE"];
  }
  processInlineTable(token, ctx) {
    const valueContainer = ctx.consumeValueContainer();
    const node = {
      type: "TOMLInlineTable",
      body: [],
      parent: valueContainer.parent,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    const needSameLine = this.tomlVersion.gte(1, 1) ? void 0 : "invalid-inline-table-newline";
    const nextToken = ctx.nextToken({ needSameLine });
    if (nextToken) {
      if (isBare(nextToken) || isString(nextToken)) return this.processInlineTableKeyValue(nextToken, node, valueContainer, ctx);
      if (isRightBrace(nextToken)) {
        applyEndLoc(node, nextToken);
        return valueContainer.set(node);
      }
    }
    return ctx.reportParseError("unexpected-token", nextToken);
  }
  processInlineTableKeyValue(token, inlineTableNode, valueContainer, ctx) {
    const keyValueNode = {
      type: "TOMLKeyValue",
      key: null,
      value: null,
      parent: inlineTableNode,
      range: cloneRange(token.range),
      loc: cloneLoc(token.loc)
    };
    inlineTableNode.body.push(keyValueNode);
    const { nextToken: targetToken } = this.processKeyNode(token, keyValueNode, ctx);
    if (!isEq(targetToken)) return ctx.reportParseError("missing-equals-sign", targetToken);
    const needSameLine = this.tomlVersion.gte(1, 1) ? void 0 : "invalid-inline-table-newline";
    ctx.addValueContainer({
      parent: keyValueNode,
      set: (valNode) => {
        keyValueNode.value = valNode;
        applyEndLoc(keyValueNode, valNode);
        let nextToken = ctx.nextToken({ needSameLine });
        if (isComma(nextToken)) {
          nextToken = ctx.nextToken({ needSameLine });
          if (nextToken && (isBare(nextToken) || isString(nextToken))) return this.processInlineTableKeyValue(nextToken, inlineTableNode, valueContainer, ctx);
          if (isRightBrace(nextToken)) {
            if (this.tomlVersion.lt(1, 1)) return ctx.reportParseError("invalid-trailing-comma-in-inline-table", nextToken);
          } else return ctx.reportParseError(nextToken ? "unexpected-token" : "unterminated-inline-table", nextToken);
        }
        if (isRightBrace(nextToken)) {
          applyEndLoc(inlineTableNode, nextToken);
          return valueContainer.set(inlineTableNode);
        }
        return ctx.reportParseError(nextToken ? "missing-comma" : "unterminated-inline-table", nextToken);
      }
    });
    ctx.needSameLine = "invalid-key-value-newline";
    return ["VALUE"];
  }
};
function isDot(token) {
  return isPunctuator(token) && token.value === ".";
}
function isEq(token) {
  return isPunctuator(token) && token.value === "=";
}
function isLeftBracket(token) {
  return isPunctuator(token) && token.value === "[";
}
function isRightBracket(token) {
  return isPunctuator(token) && token.value === "]";
}
function isLeftBrace(token) {
  return isPunctuator(token) && token.value === "{";
}
function isRightBrace(token) {
  return isPunctuator(token) && token.value === "}";
}
function isComma(token) {
  return isPunctuator(token) && token.value === ",";
}
function isPunctuator(token) {
  return Boolean(token && token.type === "Punctuator");
}
function isBare(token) {
  return token.type === "Bare";
}
function isString(token) {
  return token.type === "BasicString" || token.type === "LiteralString";
}
function isMultiLineString(token) {
  return token.type === "MultiLineBasicString" || token.type === "MultiLineLiteralString";
}
function isNumber(token) {
  return token.type === "Integer" || token.type === "Float";
}
function isBoolean(token) {
  return token.type === "Boolean";
}
function isDateTime(token) {
  return token.type === "OffsetDateTime" || token.type === "LocalDateTime" || token.type === "LocalDate" || token.type === "LocalTime";
}
function applyEndLoc(node, child) {
  if (child) {
    node.range[1] = child.range[1];
    node.loc.end = clonePos(child.loc.end);
  }
}
function cloneRange(range) {
  return [range[0], range[1]];
}
function cloneLoc(loc) {
  return {
    start: clonePos(loc.start),
    end: clonePos(loc.end)
  };
}
function clonePos(pos) {
  return {
    line: pos.line,
    column: pos.column
  };
}
var tomlKeys = {
  Program: ["body"],
  TOMLTopLevelTable: ["body"],
  TOMLTable: ["key", "body"],
  TOMLKeyValue: ["key", "value"],
  TOMLKey: ["keys"],
  TOMLArray: ["elements"],
  TOMLInlineTable: ["body"],
  TOMLBare: [],
  TOMLQuoted: [],
  TOMLValue: []
};
var KEYS3 = unionWith(tomlKeys);
function parseForESLint(code, options) {
  return {
    ast: new TOMLParser(code, options).parse(),
    visitorKeys: KEYS3,
    services: { isTOML: true }
  };
}
var getStaticTOMLValue = generateConvertTOMLValue((node) => node.value);
function generateConvertTOMLValue(convertValue) {
  function resolveValue(node, baseTable) {
    return resolver[node.type](node, baseTable);
  }
  const resolver = {
    Program(node, baseTable = {}) {
      return resolveValue(node.body[0], baseTable);
    },
    TOMLTopLevelTable(node, baseTable = {}) {
      for (const body of node.body) resolveValue(body, baseTable);
      return baseTable;
    },
    TOMLKeyValue(node, baseTable = {}) {
      const value = resolveValue(node.value);
      set2(baseTable, resolveValue(node.key), value);
      return baseTable;
    },
    TOMLTable(node, baseTable = {}) {
      const table = getTable(baseTable, resolveValue(node.key), node.kind === "array");
      for (const body of node.body) resolveValue(body, table);
      return baseTable;
    },
    TOMLArray(node) {
      return node.elements.map((e) => resolveValue(e));
    },
    TOMLInlineTable(node) {
      const table = {};
      for (const body of node.body) resolveValue(body, table);
      return table;
    },
    TOMLKey(node) {
      return node.keys.map((key) => resolveValue(key));
    },
    TOMLBare(node) {
      return node.name;
    },
    TOMLQuoted(node) {
      return node.value;
    },
    TOMLValue(node) {
      return convertValue(node);
    }
  };
  return (node) => resolveValue(node);
}
function getTable(baseTable, keys, array2) {
  let target = baseTable;
  for (let index = 0; index < keys.length - 1; index++) {
    const key = keys[index];
    target = getNextTargetFromKey(target, key);
  }
  const lastKey = last(keys);
  const lastTarget = target[lastKey];
  if (lastTarget == null) {
    const tableValue$1 = {};
    target[lastKey] = array2 ? [tableValue$1] : tableValue$1;
    return tableValue$1;
  }
  if (isValue(lastTarget)) {
    const tableValue$1 = {};
    target[lastKey] = array2 ? [tableValue$1] : tableValue$1;
    return tableValue$1;
  }
  if (!array2) {
    if (Array.isArray(lastTarget)) {
      const tableValue$1 = {};
      target[lastKey] = tableValue$1;
      return tableValue$1;
    }
    return lastTarget;
  }
  if (Array.isArray(lastTarget)) {
    const tableValue$1 = {};
    lastTarget.push(tableValue$1);
    return tableValue$1;
  }
  const tableValue = {};
  target[lastKey] = [tableValue];
  return tableValue;
  function getNextTargetFromKey(currTarget, key) {
    const nextTarget = currTarget[key];
    if (nextTarget == null) {
      const val = {};
      currTarget[key] = val;
      return val;
    }
    if (isValue(nextTarget)) {
      const val = {};
      currTarget[key] = val;
      return val;
    }
    let resultTarget = nextTarget;
    while (Array.isArray(resultTarget)) {
      const lastIndex = resultTarget.length - 1;
      const nextElement = resultTarget[lastIndex];
      if (isValue(nextElement)) {
        const val = {};
        resultTarget[lastIndex] = val;
        return val;
      }
      resultTarget = nextElement;
    }
    return resultTarget;
  }
}
function set2(baseTable, keys, value) {
  let target = baseTable;
  for (let index = 0; index < keys.length - 1; index++) {
    const key = keys[index];
    const nextTarget = target[key];
    if (nextTarget == null) {
      const val = {};
      target[key] = val;
      target = val;
    } else if (isValue(nextTarget) || Array.isArray(nextTarget)) {
      const val = {};
      target[key] = val;
      target = val;
    } else target = nextTarget;
  }
  target[last(keys)] = value;
}
function isValue(value) {
  return typeof value !== "object" || value instanceof Date;
}
function parseTOML(code, options) {
  return parseForESLint(code, options).ast;
}

// src/core/ops/atomic-file.ts
import { mkdirSync as mkdirSync3, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path3 from "node:path";
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function errCode(e) {
  return e.code;
}
function renameWithRetry(from, to, opts = {}) {
  const rename = opts.rename ?? renameSync;
  const sleep = opts.sleep ?? sleepSync;
  const win = (opts.platform ?? process.platform) === "win32";
  for (let attempt = 0; ; attempt += 1) {
    try {
      rename(from, to);
      return;
    } catch (e) {
      const busy = win && ATOMIC_RENAME_BUSY_CODES.includes(errCode(e) ?? "");
      if (!busy || attempt >= ATOMIC_RENAME_RETRIES) throw e;
      sleep(ATOMIC_RENAME_DELAY_MS);
    }
  }
}
function unlinkWithRetry(file2, opts = {}) {
  const unlink = opts.unlink ?? unlinkSync;
  const sleep = opts.sleep ?? sleepSync;
  const win = (opts.platform ?? process.platform) === "win32";
  for (let attempt = 0; ; attempt += 1) {
    try {
      unlink(file2);
      return;
    } catch (e) {
      if (errCode(e) === "ENOENT") return;
      const busy = win && ATOMIC_RENAME_BUSY_CODES.includes(errCode(e) ?? "");
      if (!busy || attempt >= ATOMIC_RENAME_RETRIES) throw replaceFailure(file2, e);
      sleep(ATOMIC_RENAME_DELAY_MS);
    }
  }
}
function replaceFailure(file2, e) {
  const busy = ATOMIC_RENAME_BUSY_CODES.includes(errCode(e) ?? "");
  const cause = e.message;
  return new Error(busy ? `Could not replace ${file2}: ${cause}. Fix: close the program using ${file2}, then re-run` : `Could not write ${file2}: ${cause}. Fix: check the path and its permissions, then re-run`, { cause: e });
}
function removeTmpFile(tmp, opts = {}) {
  try {
    unlinkWithRetry(tmp, opts);
  } catch {
  }
}
function atomicWriteFile(file2, text, opts = {}) {
  mkdirSync3(path3.dirname(file2), { recursive: true });
  const tmp = path3.join(path3.dirname(file2), `${ATOMIC_TMP_PREFIX}${path3.basename(file2)}${ATOMIC_TMP_MARK}${process.pid}`);
  try {
    writeFileSync(tmp, text);
    renameWithRetry(tmp, file2, opts);
  } catch (e) {
    removeTmpFile(tmp, opts);
    throw replaceFailure(file2, e);
  }
}

// src/core/ops/host-config.ts
function formatOf(path5) {
  if (path5.endsWith(JSONC_EXT)) return "jsonc";
  if (path5.endsWith(TOML_EXT)) return "toml";
  return "json";
}
function readHostConfig(agent, path5) {
  let file2 = path5;
  if (agent === "opencode") {
    const jsonc = join8(dirname4(path5), OPENCODE_CONFIG_FILES[0]);
    if (existsSync3(jsonc)) file2 = jsonc;
  }
  const raw = existsSync3(file2) ? readFileSync6(file2, "utf8") : "";
  return { agent, text: hostText(raw), format: agent === "opencode" && !file2.endsWith(TOML_EXT) ? "jsonc" : formatOf(file2), path: file2, layout: hostLayout(raw) };
}
function stripJsonComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i += 1;
      }
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i += 1) out += text[i] === "\n" ? "\n" : " ";
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}
var Scanner = class {
  i = 0;
  s;
  constructor(s) {
    this.s = s;
  }
  ws() {
    while (this.i < this.s.length && " 	\r\n".includes(this.s[this.i])) this.i += 1;
  }
  fail() {
    throw new SyntaxError("offset " + this.i);
  }
  str() {
    const start = this.i;
    this.i += 1;
    while (this.i < this.s.length && this.s[this.i] !== '"') this.i += this.s[this.i] === "\\" ? 2 : 1;
    if (this.i >= this.s.length) this.fail();
    this.i += 1;
    return JSON.parse(this.s.slice(start, this.i));
  }
  value() {
    this.ws();
    const start = this.i;
    const c = this.s[this.i];
    if (c === "{") {
      this.i += 1;
      const members = [];
      for (; ; ) {
        this.ws();
        if (this.s[this.i] === "}") break;
        if (this.s[this.i] !== '"') this.fail();
        const keyStart = this.i;
        const key = this.str();
        this.ws();
        if (this.s[this.i] !== ":") this.fail();
        this.i += 1;
        members.push({ key, keyStart, node: this.value() });
        this.ws();
        if (this.s[this.i] === ",") {
          this.i += 1;
          continue;
        }
        if (this.s[this.i] !== "}") this.fail();
      }
      this.i += 1;
      return { kind: "object", start, end: this.i, members };
    }
    if (c === "[") {
      this.i += 1;
      const items = [];
      for (; ; ) {
        this.ws();
        if (this.s[this.i] === "]") break;
        items.push(this.value());
        this.ws();
        if (this.s[this.i] === ",") {
          this.i += 1;
          continue;
        }
        if (this.s[this.i] !== "]") this.fail();
      }
      this.i += 1;
      return { kind: "array", start, end: this.i, items };
    }
    if (c === '"') {
      this.str();
      return { kind: "scalar", start, end: this.i };
    }
    while (this.i < this.s.length && !" 	\r\n,}]".includes(this.s[this.i])) this.i += 1;
    if (this.i === start) this.fail();
    return { kind: "scalar", start, end: this.i };
  }
};
function blankTrailingCommas(s) {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && " 	\r\n".includes(s[j])) j += 1;
      if (s[j] === "}" || s[j] === "]") {
        out += " ";
        continue;
      }
    }
    out += c;
  }
  return out;
}
function scanJson(text, format) {
  const clean = format === "jsonc" ? blankTrailingCommas(stripJsonComments(text)) : text;
  if (clean.trim() === "") return { clean, root: null, value: {} };
  const value = JSON.parse(clean);
  const sc = new Scanner(clean);
  const root = sc.value();
  sc.ws();
  if (sc.i !== clean.length) sc.fail();
  return { clean, root, value };
}
function keyNames(key) {
  return key.keys.map((k) => k.type === "TOMLBare" ? k.name : k.value);
}
function lineStartOf(text, at2) {
  return at2 === 0 ? 0 : text.lastIndexOf("\n", at2 - 1) + 1;
}
function lineEndOf(text, at2) {
  const nl = text.indexOf("\n", at2);
  return nl < 0 ? text.length : nl + 1;
}
function tomlValue(text) {
  return getStaticTOMLValue(parseTOML(text));
}
function scanToml(text) {
  const program = parseTOML(text);
  const tables = [];
  const keys = [];
  const addKey = (base, kv) => {
    keys.push({ base, full: [...base, ...keyNames(kv.key)], start: kv.range[0], end: kv.range[1], inline: kv.value.type === "TOMLInlineTable" });
  };
  for (const node of program.body[0].body) {
    if (node.type === "TOMLKeyValue") {
      addKey([], node);
      continue;
    }
    if (!node.resolvedKey.every((seg) => typeof seg === "string")) continue;
    const path5 = node.resolvedKey;
    for (const kv of node.body) addKey(path5, kv);
    if (node.kind !== "standard") continue;
    const start = lineStartOf(text, node.range[0]);
    const headEnd = lineEndOf(text, node.key.range[1]);
    const last2 = node.body[node.body.length - 1];
    tables.push({
      path: path5,
      header: text.slice(start, text[headEnd - 1] === "\n" ? headEnd - 1 : headEnd),
      start,
      end: last2 === void 0 ? headEnd : lineEndOf(text, last2.range[1])
    });
  }
  return { value: getStaticTOMLValue(program), tables, keys };
}
function tomlTableSpans(text) {
  return scanToml(text).tables;
}
function parseHostConfig(agent, path5, text, format) {
  try {
    return format === "toml" ? scanToml(text).value : scanJson(text, format).value;
  } catch {
    throw new CtxError("CONFIG_PARSE_FAILED", { agent, path: path5, format });
  }
}
function hostConfigValueAt(value, path5) {
  let cur = value;
  for (const seg of path5) {
    if (!isPlainObject3(cur)) return void 0;
    cur = cur[seg];
  }
  return cur;
}
function isPlainObject3(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, k) => sameValue(x, b[k]));
  if (isPlainObject3(a) && isPlainObject3(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => sameValue(a[k], b[k]));
  }
  return false;
}
function lineIndent(text, at2) {
  let s = at2;
  while (s > 0 && text[s - 1] !== "\n") s -= 1;
  let e = s;
  while (text[e] === " " || text[e] === "	") e += 1;
  return text.slice(s, e);
}
function indentUnit(root, clean) {
  if (root === null || root.kind !== "object" || root.members.length === 0) return JSON_INDENT_UNIT;
  const own2 = lineIndent(clean, root.members[0].keyStart);
  return own2 === "" ? JSON_INDENT_UNIT : own2;
}
function render(value, unit, base) {
  return JSON.stringify(value, null, unit).split("\n").join("\n" + base);
}
function nest(path5, value) {
  let out = value;
  for (let k = path5.length - 1; k >= 0; k -= 1) out = { [path5[k]]: out };
  return out;
}
function setJsonText(text, format, path5, value) {
  const doc = scanJson(text, format);
  const unit = indentUnit(doc.root, doc.clean);
  if (doc.root === null) return render(nest(path5, value), unit, "") + "\n";
  let node = doc.root;
  let depth = 0;
  while (depth < path5.length && node.kind === "object") {
    const hit = node.members.find((m) => m.key === path5[depth]);
    if (hit === void 0) break;
    node = hit.node;
    depth += 1;
  }
  if (depth === path5.length) {
    return text.slice(0, node.start) + render(value, unit, lineIndent(doc.clean, node.start)) + text.slice(node.end);
  }
  if (node.kind !== "object") throw new SyntaxError("not an object at " + path5.slice(0, depth).join("."));
  const rest = nest(path5.slice(depth + 1), value);
  const last2 = node.members[node.members.length - 1];
  if (last2 === void 0) {
    const base2 = lineIndent(doc.clean, node.start);
    const member2 = "\n" + base2 + unit + JSON.stringify(path5[depth]) + ": " + render(rest, unit, base2 + unit) + "\n" + base2;
    return text.slice(0, node.start + 1) + member2 + text.slice(node.end - 1);
  }
  const base = lineIndent(doc.clean, last2.keyStart);
  let at2 = last2.node.end;
  while (" 	\r\n".includes(doc.clean[at2])) at2 += 1;
  const trailing = doc.clean[at2] === ",";
  const insertAt = trailing ? at2 + 1 : last2.node.end;
  const member = (trailing ? "" : ",") + "\n" + base + JSON.stringify(path5[depth]) + ": " + render(rest, unit, base);
  return text.slice(0, insertAt) + member + text.slice(insertAt);
}
function tomlScalar(v) {
  if (Array.isArray(v)) return "[" + v.map(tomlScalar).join(", ") + "]";
  if (isPlainObject3(v)) return "{ " + Object.entries(v).map(([k, x]) => tomlHeaderKey(k) + " = " + tomlScalar(x)).join(", ") + " }";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new SyntaxError("unsupported TOML value");
}
function tomlHeaderKey(seg) {
  if (seg === "") return '""';
  for (const ch of seg) {
    const bare2 = ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch >= "0" && ch <= "9" || ch === "_" || ch === "-";
    if (!bare2) return JSON.stringify(seg);
  }
  return seg;
}
function tomlBlock(path5, value) {
  let out = "[" + path5.map(tomlHeaderKey).join(".") + "]\n";
  const subs = [];
  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject3(v)) subs.push(tomlBlock([...path5, k], v));
    else out += tomlHeaderKey(k) + " = " + tomlScalar(v) + "\n";
  }
  return [out, ...subs].join("\n");
}
function under(path5, prefix) {
  return path5.length >= prefix.length && prefix.every((seg, k) => path5[k] === seg);
}
function keyLineRange(text, k) {
  const ls = lineStartOf(text, k.start);
  const le = lineEndOf(text, k.end);
  const rest = text.slice(k.end, le).trim();
  const alone = text.slice(ls, k.start).trim() === "" && (rest === "" || rest.startsWith("#"));
  return alone ? [ls, le] : [k.start, k.end];
}
function withValueAt(root, rel, value) {
  if (rel.length === 0) return value;
  const base = isPlainObject3(root) ? { ...root } : {};
  const next = withValueAt(base[rel[0]], rel.slice(1), value);
  if (next === void 0) delete base[rel[0]];
  else base[rel[0]] = next;
  return base;
}
function replaceToml(text, doc, path5, value) {
  const block = value === void 0 ? "" : tomlBlock(path5, value);
  const owned = doc.tables.filter((t) => under(t.path, path5));
  const cuts = doc.keys.filter((k) => under(k.full, path5) && !under(k.base, path5)).map((k) => [...keyLineRange(text, k), ""]);
  owned.forEach((t, n) => cuts.push([t.start, t.end, n === 0 ? block : ""]));
  cuts.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, put] of cuts) out = out.slice(0, s) + put + out.slice(e);
  if (owned.length > 0 || block === "") return out;
  const sep4 = out === "" ? "" : out.endsWith("\n\n") ? "" : out.endsWith("\n") ? "\n" : "\n\n";
  return out + sep4 + block;
}
var tableLike = (v) => v === void 0 || isPlainObject3(v);
function setTomlText(text, path5, value) {
  if (value !== void 0 && !isPlainObject3(value)) throw new SyntaxError("TOML edits replace a whole table");
  const doc = scanToml(text);
  const cur = hostConfigValueAt(doc.value, path5);
  if (sameValue(cur, value)) return text;
  const inline = doc.keys.find((k) => k.inline && k.full.length < path5.length && under(path5, k.full));
  if (inline !== void 0) {
    const whole = withValueAt(hostConfigValueAt(doc.value, inline.full), path5.slice(inline.full.length), value);
    return replaceToml(text, doc, inline.full, whole);
  }
  if (isPlainObject3(cur) && isPlainObject3(value)) {
    const names = [.../* @__PURE__ */ new Set([...Object.keys(cur), ...Object.keys(value)])].filter((k) => !sameValue(cur[k], value[k]));
    if (names.every((k) => tableLike(cur[k]) && tableLike(value[k]))) {
      let out = text;
      for (const k of names) out = setTomlText(out, [...path5, k], value[k]);
      return out;
    }
  }
  return replaceToml(text, doc, path5, value);
}
function setText(agent, path5, text, format, key, value) {
  try {
    if (format !== "toml") return setJsonText(text, format, key, value);
    const out = setTomlText(text, key, value);
    const landed = hostConfigValueAt(tomlValue(out), key);
    const emptyTable = isPlainObject3(value) && Object.keys(value).length === 0;
    if (!sameValue(landed, value) && !(emptyTable && landed === void 0)) throw new SyntaxError("edit did not land");
    return out;
  } catch {
    throw new CtxError("CONFIG_PARSE_FAILED", { agent, path: path5, format });
  }
}
function serverScript() {
  return join8(dirname4(process.argv[1] ?? ""), SERVER_ENTRY_FILE);
}
function isNodeCommand(command) {
  if (typeof command !== "string") return false;
  let at2 = -1;
  for (const sep4 of V1_PATH_SEPS) at2 = Math.max(at2, command.lastIndexOf(sep4));
  const exe = command.slice(at2 + 1).toLowerCase();
  return exe === HOST_NODE_COMMAND || exe === HOST_NODE_COMMAND + EXE_SUFFIX;
}
function ownMcpValue(agent, node, server2) {
  const mcp = OWN_MCP_ENTRY[agent];
  if (mcp === void 0) return void 0;
  const tail = agent === "vscode" ? [WORKSPACE_FOLDER_FLAG, VSCODE_WORKSPACE_VAR] : [];
  return { ...mcp.fields, [MCP_COMMAND_FIELD]: node, [MCP_ARGS_FIELD]: [server2, AGENT_ARG, agent, ...tail] };
}
function opencodePluginFile() {
  return join8(dirname4(process.argv[1] ?? ""), ...OPENCODE_PLUGIN_PATH);
}
function listTarget(key, own2, v1, alt = []) {
  return {
    key: [key],
    next(current) {
      const list3 = Array.isArray(current) ? current.filter((x) => x !== v1) : [];
      return list3.includes(own2) || alt.some((a) => list3.includes(a)) ? list3 : [...list3, own2];
    }
  };
}
function ownTargets(agent, accept) {
  const mcp = OWN_MCP_ENTRY[agent];
  if (mcp !== void 0) {
    return [{
      key: mcp.key,
      next(current) {
        const keep = isPlainObject3(current) ? current : {};
        const node = accept.nodePath === true && isNodeCommand(keep[MCP_COMMAND_FIELD]) ? keep[MCP_COMMAND_FIELD] : HOST_NODE_COMMAND;
        return { ...keep, ...ownMcpValue(agent, node, serverScript()) };
      }
    }, ...(mcp.also ?? []).map(([key, value]) => ({ key, next: () => value }))];
  }
  if (agent === "opencode") return [listTarget(OPENCODE_PLUGIN_KEY, OPENCODE_GIT_SPEC, V1_OPENCODE_PLUGIN_SPEC, accept.listEntries)];
  if (agent === "pi") return [listTarget(PI_PACKAGES_KEY, PI_GIT_PACKAGE, V1_PI_PACKAGE)];
  return [];
}
function applyEdits(agent, path5, text, format, wanted) {
  const parsed = parseHostConfig(agent, path5, text, format);
  let out = text;
  const edits = [];
  for (const [key, after] of wanted) {
    const before = hostConfigValueAt(parsed, key);
    if (sameValue(before, after)) continue;
    out = setText(agent, path5, out, format, key, after);
    edits.push({ path: key.join("."), before, after });
  }
  return { text: out, format, edits };
}
function mergeOwnEntries(agent, current, format, row5, accept = {}) {
  const parsed = parseHostConfig(row5.id, HOST_CONFIG_TEXT_PATH, current, format);
  const wanted = ownTargets(agent, accept).map((t) => [t.key, t.next(hostConfigValueAt(parsed, t.key))]);
  return applyEdits(agent, HOST_CONFIG_TEXT_PATH, current, format, wanted);
}
function writeHostConfigEdit(_requested, current, patch) {
  const wanted = Object.entries(patch).map(([k, v]) => [[k], v]);
  const result = applyEdits(current.agent, current.path, current.text, current.format, wanted);
  if (result.edits.length === 0) return [];
  atomicWriteFile(current.path, current.layout === void 0 ? result.text : withLayout(result.text, current.layout));
  return result.edits;
}

// src/core/ops/detect-v1.ts
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var keyPath = (...parts) => parts.join(".");
var finding = (file2, path5, reason) => ({ file: file2, path: path5, reason });
function stripJsonc(text) {
  let out = "";
  let inStr = false;
  let esc2 = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (esc2) esc2 = false;
      else if (c === "\\") esc2 = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && " 	\r\n".includes(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += c;
  }
  return out;
}
function readJson(file2) {
  try {
    return JSON.parse(stripJsonc(hostText(readFileSync7(file2, "utf8"))));
  } catch {
    return void 0;
  }
}
function readText(file2) {
  try {
    return hostText(readFileSync7(file2, "utf8"));
  } catch {
    return "";
  }
}
function readTomlTables(file2) {
  try {
    return tomlTableSpans(readText(file2));
  } catch {
    return [];
  }
}
function readTomlValue(file2) {
  try {
    return parseHostConfig("codex", file2, readText(file2), "toml");
  } catch {
    return {};
  }
}
function isV2McpTable(v) {
  if (!isObj(v) || !isNodeCommand(v[MCP_COMMAND_FIELD])) return false;
  const first = Array.isArray(v[MCP_ARGS_FIELD]) ? v[MCP_ARGS_FIELD][0] : void 0;
  if (typeof first !== "string") return false;
  let at2 = -1;
  for (const sep4 of V1_PATH_SEPS) at2 = Math.max(at2, first.lastIndexOf(sep4));
  return first.slice(at2 + 1) === SERVER_ENTRY_FILE;
}
var listOf = (v) => Array.isArray(v) ? v : [];
var commandOf = (v) => isObj(v) && typeof v.command === "string" ? v.command : null;
function nestedCommands(doc) {
  const out = [];
  if (!isObj(doc) || !isObj(doc[HOOKS_KEY])) return out;
  for (const [event, groups] of Object.entries(doc[HOOKS_KEY])) {
    listOf(groups).forEach((group, i) => {
      if (!isObj(group)) return;
      listOf(group[HOOKS_KEY]).forEach((inner, j) => {
        const command = commandOf(inner);
        if (command !== null) out.push({ path: keyPath(HOOKS_KEY, event, i, HOOKS_KEY, j), command });
      });
    });
  }
  return out;
}
function flatCommands(events, prefix) {
  const out = [];
  if (!isObj(events)) return out;
  for (const [event, entries] of Object.entries(events)) {
    listOf(entries).forEach((entry, i) => {
      const command = commandOf(entry);
      if (command !== null) out.push({ path: keyPath(...prefix, event, i), command });
    });
  }
  return out;
}
var isV1Hook = (cmd) => cmd.includes(SERVER_KEY) && (V1_SCRIPT_NAMES.some((name) => cmd.includes(name)) || cmd.includes(V1_HOOK_COMMAND));
var isCodexScript = (cmd) => cmd.includes(V1_SCRIPT_EXT) && V1_PATH_SEPS.some((sep4) => cmd.includes(V1_CODEX_HOOKS_DIR.join(sep4) + sep4));
function dataDir(dir, reason, out) {
  if (existsSync4(dir)) out.push(finding(dir, "", reason));
}
function mcpEntry(file2, doc, out) {
  if (isObj(doc) && isObj(doc[MCP_SERVERS_KEY]) && Object.hasOwn(doc[MCP_SERVERS_KEY], SERVER_KEY)) {
    out.push(finding(file2, keyPath(MCP_SERVERS_KEY, SERVER_KEY), V1_REASON.mcpEntry));
  }
}
function claudeShapeSettings(agentHome, out) {
  const file2 = join9(agentHome, SETTINGS_FILE);
  const doc = readJson(file2);
  for (const c of nestedCommands(doc)) {
    if (c.command.includes(V1_CACHE_HEAL_NAME)) out.push(finding(file2, c.path, V1_REASON.cacheHealHook));
    else if (isV1Hook(c.command)) out.push(finding(file2, c.path, V1_REASON.hook));
  }
  const status = isObj(doc) ? commandOf(doc[STATUS_LINE_KEY]) : null;
  if (status !== null && status.includes(V1_STATUSLINE_COMMAND)) {
    out.push(finding(file2, STATUS_LINE_KEY, V1_REASON.statusLine));
  }
  mcpEntry(file2, doc, out);
}
function v1HookFile(file2, out) {
  const doc = readJson(file2);
  const cmds = isObj(doc) ? flatCommands(doc[HOOKS_KEY], [HOOKS_KEY]) : [];
  if (cmds.some((c) => c.command.includes(V1_HOOK_COMMAND))) out.push(finding(file2, "", V1_REASON.hookFile));
}
function scanClaudeCode(home, agentHome, out) {
  claudeShapeSettings(agentHome, out);
  for (const ext of V1_CACHE_HEAL_EXTS) {
    const file2 = join9(agentHome, V1_HOOKS_DIR_NAME, V1_CACHE_HEAL_NAME + ext);
    if (existsSync4(file2)) out.push(finding(file2, "", V1_REASON.cacheHealFile));
  }
  const userFile = join9(home, CLAUDE_USER_CONFIG_FILE);
  mcpEntry(userFile, readJson(userFile), out);
  dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}
function scanCodex(agentHome, out) {
  const hooksFile = join9(agentHome, HOOKS_JSON_FILE);
  for (const c of nestedCommands(readJson(hooksFile))) {
    if (c.command.includes(V1_CODEX_HOOK_COMMAND) || isCodexScript(c.command)) {
      out.push(finding(hooksFile, c.path, V1_REASON.codexHook));
    }
  }
  const tomlFile = join9(agentHome, CONFIG_TOML_FILE);
  const config2 = readTomlValue(tomlFile);
  for (const span of readTomlTables(tomlFile)) {
    if (span.path[0] !== V1_TOML_SECTION_ROOT || span.path[1] !== SERVER_KEY) continue;
    if (span.path.length === 2 && isV2McpTable(hostConfigValueAt(config2, span.path))) continue;
    out.push(finding(tomlFile, span.header.trim(), V1_REASON.codexToml));
  }
  dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}
function scanGemini(agentHome, out) {
  const file2 = join9(agentHome, SETTINGS_FILE);
  for (const c of nestedCommands(readJson(file2))) {
    if (c.command.includes(SERVER_KEY)) out.push(finding(file2, c.path, V1_REASON.hook));
  }
  dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDirShared, out);
}
function scanVscode(agentHome, project, out) {
  if (project !== void 0) {
    v1HookFile(join9(project, GITHUB_DIR_NAME, V1_HOOKS_DIR_NAME, OWN_HOOK_FILE), out);
    const mcpFile2 = join9(project, VSCODE_DIR_NAME, VSCODE_MCP_FILE);
    const doc = readJson(mcpFile2);
    const servers = isObj(doc) && isObj(doc[VSCODE_MCP_SERVERS_KEY]) ? doc[VSCODE_MCP_SERVERS_KEY] : {};
    const entry = Object.hasOwn(servers, SERVER_KEY) ? servers[SERVER_KEY] : void 0;
    if (isObj(entry) && (entry.command === V1_BIN_COMMAND || listOf(entry.args).some((a) => a === V1_BIN_COMMAND))) {
      out.push(finding(mcpFile2, keyPath(VSCODE_MCP_SERVERS_KEY, SERVER_KEY), V1_REASON.vscodeMcp));
    }
    dataDir(join9(project, GITHUB_DIR_NAME, V1_DATA_DIR_NAME, V1_SESSIONS_DIR_NAME), V1_REASON.dataDir, out);
  }
  dataDir(join9(agentHome, V1_DATA_DIR_NAME, V1_SESSIONS_DIR_NAME), V1_REASON.dataDir, out);
}
function jsonFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(KIRO_AGENT_FILE_EXT)).sort();
  } catch {
    return [];
  }
}
function scanKiro(agentHome, project, out) {
  const agentsDir = join9(agentHome, KIRO_AGENTS_DIR);
  const defaultFile = join9(agentHome, ...KIRO_AGENT_FILE);
  for (const name of jsonFiles(agentsDir)) {
    const file2 = join9(agentsDir, name);
    const doc = readJson(file2);
    if (isObj(doc) && doc[KIRO_AGENT_NAME_KEY] === SERVER_KEY) {
      out.push(finding(file2, "", V1_REASON.kiroAgentFile));
      continue;
    }
    if (file2 !== defaultFile) continue;
    for (const c of isObj(doc) ? flatCommands(doc[HOOKS_KEY], [HOOKS_KEY]) : []) {
      if (isV1Hook(c.command)) out.push(finding(file2, c.path, V1_REASON.kiroHook));
    }
  }
  const steeringDocs = [join9(agentHome, ...KIRO_STEERING_FILE)];
  if (project !== void 0) steeringDocs.push(join9(project, ...AGENT_HOME_DIR.kiro, ...KIRO_STEERING_FILE));
  for (const file2 of steeringDocs) {
    if (existsSync4(file2)) out.push(finding(file2, "", V1_REASON.kiroSteering));
  }
  dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}
function scanPi(piAgentDir, agentHome, out) {
  const file2 = join9(piAgentDir, SETTINGS_FILE);
  const doc = readJson(file2);
  listOf(isObj(doc) ? doc[PI_PACKAGES_KEY] : void 0).forEach((pkg, i) => {
    const spec = isObj(pkg) ? pkg[PI_PACKAGE_SOURCE_KEY] : pkg;
    if (spec === V1_PI_PACKAGE) out.push(finding(file2, keyPath(PI_PACKAGES_KEY, i), V1_REASON.piNpm));
  });
  dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
}
function scanOpencode(agentHome, out) {
  for (const name of OPENCODE_CONFIG_FILES) {
    const file2 = join9(agentHome, name);
    const doc = readJson(file2);
    if (!isObj(doc) || !Array.isArray(doc[OPENCODE_PLUGIN_KEY])) continue;
    doc[OPENCODE_PLUGIN_KEY].forEach((spec, i) => {
      if (spec === V1_OPENCODE_PLUGIN_SPEC) out.push(finding(file2, keyPath(OPENCODE_PLUGIN_KEY, i), V1_REASON.opencodePlugin));
    });
    return;
  }
}
function scanZcode(agentHome, out) {
  const configFile = join9(agentHome, ZCODE_CLI_DIR, CONFIG_JSON_FILE);
  const config2 = readJson(configFile);
  const events = isObj(config2) && isObj(config2[HOOKS_KEY]) ? config2[HOOKS_KEY][ZCODE_EVENTS_KEY] : void 0;
  for (const c of flatCommands(events, [HOOKS_KEY, ZCODE_EVENTS_KEY])) {
    if (c.command.includes(V1_HOOK_COMMAND)) out.push(finding(configFile, c.path, V1_REASON.zcodeHook));
  }
  const hooksFile = join9(agentHome, ZCODE_CLI_DIR, HOOKS_JSON_FILE);
  for (const c of nestedCommands(readJson(hooksFile))) {
    if (c.command.includes(V1_HOOK_COMMAND)) out.push(finding(hooksFile, c.path, V1_REASON.zcodeHook));
  }
}
function firstTmpMatch(dir) {
  let handle;
  try {
    handle = opendirSync(dir);
  } catch {
    return null;
  }
  try {
    for (let e = handle.readSync(); e !== null; e = handle.readSync()) {
      if (e.name.startsWith(V1_TMP_PREFIX)) return e.name;
    }
    return null;
  } catch {
    return null;
  } finally {
    handle.closeSync();
  }
}
function scanAll(home, tmp, out) {
  const root = join9(home, DATA_ROOT.slice(1));
  for (const name of V1_DATA_ROOT_ENTRIES) dataDir(join9(root, name), V1_REASON.dataRoot, out);
  if (firstTmpMatch(tmp) !== null) out.push(finding(tmp, V1_TMP_PREFIX + "*", V1_REASON.tmpFile));
}
function detectV1(agent, home, scope = {}) {
  const out = [];
  const project = scope.project;
  const agentHome = agent === "claude-code" && scope.claudeDir !== void 0 ? scope.claudeDir : agent === "codex" && scope.codexDir !== void 0 ? scope.codexDir : agent === "copilot-cli" && scope.copilotDir !== void 0 ? scope.copilotDir : agent === "kiro" && scope.kiroDir !== void 0 ? scope.kiroDir : agent === "opencode" && scope.opencodeDir !== void 0 ? scope.opencodeDir : join9(home, ...AGENT_HOME_DIR[agent]);
  switch (agent) {
    case "claude-code":
      scanClaudeCode(home, agentHome, out);
      break;
    case "codex":
      scanCodex(agentHome, out);
      break;
    case "gemini":
      scanGemini(agentHome, out);
      break;
    case "qwen":
      claudeShapeSettings(agentHome, out);
      dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
      break;
    case "copilot-cli":
      v1HookFile(join9(agentHome, V1_HOOKS_DIR_NAME, OWN_HOOK_FILE), out);
      dataDir(join9(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out);
      break;
    case "vscode":
      scanVscode(agentHome, project, out);
      break;
    case "kiro":
      scanKiro(agentHome, project, out);
      break;
    case "pi":
      scanPi(scope.piAgentDir !== void 0 && scope.piAgentDir !== "" ? scope.piAgentDir : join9(agentHome, PI_AGENT_DIR), agentHome, out);
      break;
    // D-WIN-PIDIR-1: empty is unset
    case "opencode":
      scanOpencode(agentHome, out);
      break;
    case "zcode":
      scanZcode(agentHome, out);
      break;
  }
  scanAll(home, scope.tmp ?? tmpdir(), out);
  return out;
}

// src/core/ops/plugin-root.ts
import { existsSync as existsSync5, readdirSync as readdirSync2, readFileSync as readFileSync8, realpathSync as realpathSync4 } from "node:fs";
import { dirname as dirname5, isAbsolute as isAbsolute2, join as join10, sep as sep3 } from "node:path";
import { fileURLToPath } from "node:url";
function missing(agent, path5) {
  return new CtxError("PLUGIN_ROOT_MISSING", { agent, path: path5 });
}
function recordedInstallPaths(text) {
  let parsed;
  try {
    parsed = JSON.parse(hostText(text));
  } catch {
    return [];
  }
  const plugins = parsed?.plugins;
  if (plugins === null || typeof plugins !== "object") return [];
  const out = [];
  for (const key of Object.keys(plugins)) {
    const at2 = key.indexOf(PLUGIN_KEY_SEPARATOR);
    if ((at2 < 0 ? key : key.slice(0, at2)) !== PLUGIN_NAME) continue;
    const entries = plugins[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const dir = e?.installPath;
      if (typeof dir === "string" && dir !== "" && !out.includes(dir)) out.push(dir);
    }
  }
  return out;
}
var realOrNull = (path5) => {
  try {
    return realpathSync4.native(path5);
  } catch {
    return null;
  }
};
function marketplaceRoot(adapter, env) {
  const claudeDir = claudeDirOf(env, requireHomeDir(env));
  const plugins = join10(claudeDir, HOST_PLUGINS_DIR_NAME);
  const cache = join10(plugins, PLUGIN_CACHE_DIR_NAME);
  const script = process.argv[1];
  const ownReal = script === void 0 || script === "" ? null : realOrNull(dirname5(script));
  let record4 = null;
  try {
    record4 = readFileSync8(join10(plugins, INSTALLED_PLUGINS_FILE), "utf8");
  } catch {
    record4 = null;
  }
  const recorded = record4 === null ? [] : recordedInstallPaths(record4);
  if (recorded.length > 0) {
    const live = recorded.filter((dir) => existsSync5(dir));
    const mine = live.find((dir) => realOrNull(dir) === ownReal);
    if (mine !== void 0) return mine;
    if (live.length === 1) return live[0];
    throw missing(adapter.id, recorded.join(", "));
  }
  const cacheReal = realOrNull(cache);
  if (ownReal !== null && cacheReal !== null && ownReal.startsWith(cacheReal + sep3) && existsSync5(join10(ownReal, SERVER_ENTRY_FILE))) return ownReal;
  const pattern = join10(cache, "*", PLUGIN_NAME);
  if (!existsSync5(cache)) throw missing(adapter.id, pattern);
  const found = readdirSync2(cache).sort().map((marketplace) => join10(cache, marketplace, PLUGIN_NAME)).filter((dir) => existsSync5(dir));
  if (found.length !== 1) throw missing(adapter.id, found.length === 0 ? pattern : found.join(", "));
  return found[0];
}
function configEntryRoot(adapter, env) {
  const spec = OWN_MCP_ENTRY[adapter.id];
  if (spec === void 0) throw missing(adapter.id, SERVER_KEY);
  const file2 = ownMcpFileOf(adapter.id, spec.file, env, requireHomeDir(env));
  if (!existsSync5(file2)) throw missing(adapter.id, file2);
  const current = readHostConfig(adapter.id, file2);
  const value = parseHostConfig(adapter.id, file2, current.text, current.format);
  const args = hostConfigValueAt(value, [...spec.key, MCP_ARGS_FIELD]);
  const script = Array.isArray(args) ? args[0] : void 0;
  if (typeof script !== "string" || !isAbsolute2(script)) throw missing(adapter.id, file2);
  return dirname5(script);
}
function candidate(adapter, env) {
  switch (adapter.installMode) {
    case "marketplace":
      return marketplaceRoot(adapter, env);
    case "config-mcp":
    case "mcp-entry":
    case "hooks+mcp":
      return configEntryRoot(adapter, env);
    case "extension":
      return join10(requireHomeDir(env), ...AGENT_HOME_DIR[adapter.id], EXTENSIONS_DIR_NAME, PLUGIN_NAME);
    case "plugin":
      return join10(resolveConfigDir(env), DATA_PLUGINS_DIR_NAME, adapter.id, PLUGIN_CURRENT_LINK);
    case "in-process":
      return dirname5(fileURLToPath(import.meta.url));
  }
}
function resolvePluginRoot(adapter, env) {
  const path5 = candidate(adapter, env);
  try {
    return realpathSync4.native(path5);
  } catch {
    throw missing(adapter.id, path5);
  }
}

// src/core/ops/doctor-config.ts
var [PART_MCP, PART_HOOKS, PART_TIMEOUT] = D3_PARTS;
var isObject4 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var list2 = (v) => Array.isArray(v) ? v : [];
function pass(id2) {
  return { id: id2, label: DOCTOR_LABEL[id2], status: "PASS", detail: DOCTOR_PASS_DETAIL };
}
function fail2(id2, detail, fixCommand) {
  return { id: id2, label: DOCTOR_LABEL[id2], status: "FAIL", detail, fixCommand };
}
function readParsed(agent, file2) {
  const cur = readHostConfig(agent, file2);
  return { value: parseHostConfig(agent, cur.path, cur.text, cur.format), text: cur.text, format: cur.format };
}
function composeMatcher(row5, event) {
  let prefix = "";
  for (const ch of row5.toolNamePrefix) prefix += REGEX_SPECIAL_CHARS.includes(ch) ? REGEX_ESCAPE + ch : ch;
  const names = Object.values(row5.nativeTools).flat();
  const alts = [...names, prefix + OWN_TOOL_PREFIX + MATCHER_ANY];
  if (event === POST_TOOL_USE && hasReplace(row5)) alts.push(MCP_ANY_MATCH);
  return MATCHER_OPEN + alts.join(MATCHER_ALT) + MATCHER_CLOSE;
}
var lastSegment = (p) => {
  let at2 = -1;
  for (const sep4 of V1_PATH_SEPS) at2 = Math.max(at2, p.lastIndexOf(sep4));
  return p.slice(at2 + 1);
};
function splitHead(command) {
  if (command.startsWith(SHELL_QUOTE)) {
    const close = command.indexOf(SHELL_QUOTE, 1);
    if (close < 0 || command.slice(close + 1, close + 1 + HOOK_COMMAND_SEP.length) !== HOOK_COMMAND_SEP) return null;
    return { head: command.slice(1, close), rest: command.slice(close + 1 + HOOK_COMMAND_SEP.length) };
  }
  const end = command.indexOf(HOOK_COMMAND_SEP);
  return end < 0 ? null : { head: command.slice(0, end), rest: command.slice(end + HOOK_COMMAND_SEP.length) };
}
function isOwnCommand(command, agent) {
  if (typeof command !== "string") return false;
  const split = splitHead(command);
  if (split === null) return false;
  const exe = lastSegment(split.head).toLowerCase();
  if (exe !== HOST_NODE_COMMAND && exe !== HOST_NODE_COMMAND + EXE_SUFFIX) return false;
  const tail = HOOK_COMMAND_SEP + AGENT_ARG + HOOK_COMMAND_SEP + agent;
  if (!split.rest.endsWith(tail) || split.rest.length <= tail.length) return false;
  let script = split.rest.slice(0, split.rest.length - tail.length);
  if (script.startsWith(SHELL_QUOTE) && script.endsWith(SHELL_QUOTE) && script.length > 1) script = script.slice(1, -1);
  return script === HOOK_ENTRY_FILE || HOOK_SCRIPT_SEPS.some((sep4) => script.endsWith(sep4 + HOOK_ENTRY_FILE));
}
function ownHooks(block, shape, timeoutKey, native, agent) {
  const out = [];
  if (shape === "kiro") {
    for (const e of list2(block)) {
      if (!isObject4(e) || e[KIRO_TRIGGER_FIELD] !== native) continue;
      const action = e[KIRO_ACTION_FIELD];
      const command = isObject4(action) ? action[HOOK_COMMAND_FIELD] : void 0;
      if (isOwnCommand(command, agent)) out.push({ command, matcher: e[HOOK_MATCHER_FIELD], timeout: e[timeoutKey] });
    }
    return out;
  }
  const entries = isObject4(block) ? list2(block[native]) : [];
  for (const e of entries) {
    if (!isObject4(e)) continue;
    if (shape === "nested" || shape === "zcode") {
      for (const h of list2(e[HOOK_GROUP_HOOKS_FIELD])) {
        if (isObject4(h) && isOwnCommand(h[HOOK_COMMAND_FIELD], agent)) {
          out.push({ command: h[HOOK_COMMAND_FIELD], matcher: e[HOOK_MATCHER_FIELD], timeout: h[timeoutKey] });
        }
      }
    } else if (isOwnCommand(e[HOOK_COMMAND_FIELD], agent)) {
      out.push({ command: e[HOOK_COMMAND_FIELD], matcher: e[HOOK_MATCHER_FIELD], timeout: e[timeoutKey] });
    }
  }
  return out;
}
var validTimeout = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
function mcpFile(row5, home, env) {
  const spec = OWN_MCP_ENTRY[row5.id];
  if (row5.id === "codex") return join11(codexDirOf(env, home), CONFIG_TOML_FILE);
  if (spec !== void 0) return ownMcpFileOf(row5.id, spec.file, env, home);
  if (row5.id === "opencode") return join11(opencodeDirOf(env, home), OPENCODE_BASE_CONFIG_FILE);
  if (row5.id === "pi") {
    return join11(piAgentDirOf(env, home), SETTINGS_FILE);
  }
  return null;
}
function mcpWrong(row5, home, env) {
  const file2 = mcpFile(row5, home, env);
  try {
    if (file2 === null) {
      resolvePluginRoot(row5, env);
      return false;
    }
    const cur = readHostConfig(row5.id, file2);
    return mergeOwnEntries(row5.id, cur.text, cur.format, row5, { nodePath: true, listEntries: [opencodePluginFile()] }).edits.length > 0;
  } catch {
    return true;
  }
}
function hookParts(row5, home, env, worktree) {
  const spec = HOOK_HOST_FILE[row5.id];
  if (spec === null) return [];
  let block;
  try {
    const root = spec.root === "plugin" ? resolvePluginRoot(row5, env) : spec.root === "home" ? home : worktree;
    const file2 = row5.id === "codex" ? join11(codexDirOf(env, home), HOOKS_JSON_FILE) : row5.id === "copilot-cli" ? join11(copilotDirOf(env, home), ...spec.file.slice(1)) : row5.id === "kiro" ? join11(kiroDirOf(env, home), ...spec.file.slice(1)) : join11(root, ...spec.file);
    block = hostConfigValueAt(readParsed(row5.id, file2).value, spec.key);
    if (row5.id === "codex") {
      const config2 = readParsed(row5.id, join11(codexDirOf(env, home), CONFIG_TOML_FILE)).value;
      if (hostConfigValueAt(config2, CODEX_FEATURES_HOOKS_KEY) === false) return [PART_HOOKS];
    }
  } catch {
    return [PART_HOOKS];
  }
  let hooksBad = false;
  let timeoutBad = false;
  for (const [canonical, native] of Object.entries(row5.eventMap)) {
    if (native === void 0) continue;
    const own2 = ownHooks(block, spec.shape, spec.timeoutKey, native, row5.id);
    if (spec.shape === "kiro" && TOOL_HOOK_EVENTS.includes(canonical)) {
      const got = own2.map((h) => h.matcher).sort();
      const want = KIRO_TOOL_MATCHERS.map(([m]) => m).sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) hooksBad = true;
      for (const h of own2) if (!validTimeout(h.timeout)) timeoutBad = true;
      continue;
    }
    if (own2.length !== 1) {
      hooksBad = true;
      continue;
    }
    if (spec.matcher && TOOL_HOOK_EVENTS.includes(canonical) && own2[0].matcher !== composeMatcher(row5, canonical)) hooksBad = true;
    if (!validTimeout(own2[0].timeout)) timeoutBad = true;
  }
  return [...hooksBad ? [PART_HOOKS] : [], ...timeoutBad ? [PART_TIMEOUT] : []];
}
function checkHostConfig(row5, env, worktree) {
  const home = homeDirOf(env);
  if (home === null) return fail2("D3", D3_DETAIL(D3_PARTS), DOCTOR_FIX_UPGRADE);
  const parts = [...mcpWrong(row5, home, env) ? [PART_MCP] : [], ...hookParts(row5, home, env, worktree)];
  const read3 = row5.id === "pi" ? mcpFile(row5, home, env) : null;
  if (parts.length === 0) return read3 === null ? pass("D3") : { ...pass("D3"), detail: read3 };
  const detail = D3_DETAIL(parts);
  return fail2("D3", read3 === null ? detail : detail + D4_REASON_JOIN + read3, DOCTOR_FIX_UPGRADE);
}
function checkV1Leftovers(agent, home, scope = {}) {
  const findings = detectV1(agent, home, scope);
  if (findings.length === 0) return pass("D4");
  return fail2("D4", findings.map((f) => f.reason).join(D4_REASON_JOIN), DOCTOR_FIX_UPGRADE);
}
function parsedOrNull(agent, file2, jsonc) {
  try {
    const cur = readHostConfig(agent, file2);
    return parseHostConfig(agent, cur.path, cur.text, jsonc ? "jsonc" : cur.format);
  } catch {
    return null;
  }
}
function checkDoubleFire(agent, worktree) {
  if (agent !== "claude-code" && agent !== "vscode") return pass("D5b");
  const claude = parsedOrNull(agent, join11(worktree, HOST_CONFIG_DIR_NAME, SETTINGS_FILE), false);
  const hooks = isObject4(claude) ? claude[HOOKS_KEY] : void 0;
  const hooksOn = isObject4(hooks) && Object.keys(hooks).length > 0;
  const vscode = parsedOrNull(agent, join11(worktree, VSCODE_DIR_NAME, VSCODE_SETTINGS_FILE), true);
  const useClaudeHooks = isObject4(vscode) && vscode[VSCODE_CLAUDE_HOOKS_SETTING] === true;
  return hooksOn && useClaudeHooks ? fail2("D5b", D5B_DETAIL, D5B_FIX) : pass("D5b");
}

// src/core/ops/doctor-db.ts
import { existsSync as existsSync6 } from "node:fs";
var unknown2 = (id2, detail) => ({ id: id2, label: DOCTOR_LABEL[id2], status: "UNKNOWN", detail });
var pass2 = (id2, detail) => ({ id: id2, label: DOCTOR_LABEL[id2], status: "PASS", detail });
var fail3 = (detail, fixCommand) => ({ id: "D8", label: DOCTOR_LABEL.D8, status: "FAIL", detail, fixCommand });
function isCorrupt2(err) {
  if (typeof err !== "object" || err === null) return false;
  const code = err.errcode;
  if (typeof code !== "number") return false;
  const primary = code & SQLITE_PRIMARY_CODE_MASK;
  return primary === SQLITE_CORRUPT_CODE || primary === SQLITE_NOTADB_CODE;
}
var message2 = (err) => err instanceof Error ? err.message : String(err);
async function loadSqlite2() {
  try {
    return await import(SQLITE_MODULE);
  } catch {
    return null;
  }
}
function openRead(sqlite, path5) {
  return new sqlite.DatabaseSync(path5, { timeout: DB_TIMEOUT_MS, readOnly: true });
}
var cell = (row5) => Object.values(row5)[0];
function readSchema(raw) {
  return Number(cell(raw.prepare("PRAGMA user_version").get()));
}
function integrityOk(raw) {
  const rows = raw.prepare(PRAGMA_INTEGRITY_CHECK).all();
  return rows.length === 1 && cell(rows[0]) === INTEGRITY_OK;
}
function failsOnCorrupt(step) {
  try {
    return step();
  } catch (err) {
    if (isCorrupt2(err)) return true;
    throw err;
  }
}
async function checkDb(project) {
  const clean = { schemaStale: false, integrityFailed: false };
  if (!existsSync6(project.dbPath)) return { row: pass2("D8", DOCTOR_PASS_DETAIL), ...clean };
  const sqlite = await loadSqlite2();
  if (sqlite === null) return { row: unknown2("D8", D2_SQLITE_DETAIL), ...clean };
  let raw = null;
  try {
    raw = openRead(sqlite, project.dbPath);
    const db = raw;
    let got = null;
    try {
      got = readSchema(db);
    } catch (err) {
      if (!isCorrupt2(err)) throw err;
    }
    const schemaStale = got !== null && got !== SCHEMA_VERSION;
    const integrityFailed = failsOnCorrupt(() => !integrityOk(db));
    if (integrityFailed) return { row: fail3(D8_INTEGRITY_DETAIL, D8_INTEGRITY_FIX), schemaStale, integrityFailed };
    if (schemaStale && got !== null) return { row: fail3(D8_STALE_SCHEMA_DETAIL(got, SCHEMA_VERSION), DOCTOR_FIX_UPGRADE), schemaStale, integrityFailed };
    return { row: pass2("D8", DOCTOR_PASS_DETAIL), ...clean };
  } catch (err) {
    if (isCorrupt2(err)) return { row: fail3(D8_INTEGRITY_DETAIL, D8_INTEGRITY_FIX), schemaStale: false, integrityFailed: true };
    return { row: unknown2("D8", message2(err)), ...clean };
  } finally {
    raw?.close();
  }
}
async function checkIndex(project) {
  if (!existsSync6(project.dbPath)) return pass2("D9", D9_INDEX_DETAIL(0, 0));
  const sqlite = await loadSqlite2();
  if (sqlite === null) return unknown2("D9", D2_SQLITE_DETAIL);
  let raw = null;
  try {
    raw = openRead(sqlite, project.dbPath);
    const sources = Number(cell(raw.prepare("SELECT count(*) FROM sources").get()));
    const chunks = Number(cell(raw.prepare("SELECT count(*) FROM chunks").get()));
    return pass2("D9", D9_INDEX_DETAIL(sources, chunks));
  } catch (err) {
    return unknown2("D9", message2(err));
  } finally {
    raw?.close();
  }
}

// src/core/ops/doctor-env.ts
import { existsSync as existsSync7, realpathSync as realpathSync5 } from "node:fs";
import { isAbsolute as isAbsolute3, relative as relative2 } from "node:path";
function pass3(id2, detail = DOCTOR_PASS_DETAIL) {
  return { id: id2, label: DOCTOR_LABEL[id2], status: "PASS", detail };
}
function unknown3(id2, detail) {
  return { id: id2, label: DOCTOR_LABEL[id2], status: "UNKNOWN", detail };
}
function fail4(id2, detail, fixCommand) {
  return { id: id2, label: DOCTOR_LABEL[id2], status: "FAIL", detail, fixCommand };
}
async function checkVersion(i) {
  if (i.bundleSha === void 0) return unknown3("D1", D1_DEV_BUILD_DETAIL);
  const r = await runProcess([GIT_BIN, GIT_LS_REMOTE, RELEASE_REPO_URL, RELEASE_BRANCH], {
    cwd: i.cwd,
    env: { ...i.env, ...GIT_NO_PROMPT_ENV },
    signal: i.signal,
    timeoutMs: DOCTOR_GIT_TIMEOUT_MS
  });
  if (r.exitCode !== 0 || r.killed !== null) return unknown3("D1", D1_NO_NETWORK_DETAIL);
  const latest = r.stdout.toString("utf8").split(LS_REMOTE_FIELD_SEP)[0];
  if (latest.length !== GIT_SHA_HEX_LEN) return unknown3("D1", D1_NO_NETWORK_DETAIL);
  return latest === i.bundleSha ? pass3("D1") : fail4("D1", D1_UPDATE_DETAIL, DOCTOR_FIX_UPGRADE);
}
function numbers(v) {
  const bare2 = v.startsWith(NODE_VERSION_PREFIX) ? v.slice(NODE_VERSION_PREFIX.length) : v;
  return bare2.split(NODE_VERSION_SEP).map(Number);
}
function belowMin(version2) {
  const got = numbers(version2);
  const min = numbers(NODE_MIN);
  for (let k = 0; k < min.length; k++) {
    const g = got[k] ?? 0;
    if (g !== min[k]) return g < min[k];
  }
  return false;
}
async function sqliteLoads() {
  try {
    await import(SQLITE_MODULE);
    return true;
  } catch {
    return false;
  }
}
async function checkNode(i) {
  const bun = i.bunVersion === void 0 ? [] : [D2_BUN_DETAIL(i.bunVersion)];
  const withBun = (detail) => [detail, ...bun].join(D4_REASON_JOIN);
  if (belowMin(i.nodeVersion)) return fail4("D2", withBun(D2_NODE_DETAIL(i.nodeVersion)), D2_NODE_FIX);
  if (!await sqliteLoads()) return fail4("D2", withBun(D2_SQLITE_DETAIL), D2_SQLITE_FIX);
  return pass3("D2", bun.length === 0 ? DOCTOR_PASS_DETAIL : bun.join(D4_REASON_JOIN));
}
function checkMcp(ctx) {
  const named = ctx.clientInfo !== void 0 && ctx.clientInfo.name !== "";
  const versioned = ctx.protocolVersion !== void 0 && ctx.protocolVersion !== "";
  return named || versioned ? pass3("D6") : unknown3("D6", D6_UNKNOWN_DETAIL);
}
function piCwdInside(worktree, piCwd) {
  if (piCwd === void 0 || !existsSync7(piCwd)) return false;
  const rel = relative2(worktree, realpathSync5.native(piCwd));
  return rel === "" || !rel.startsWith("..") && !isAbsolute3(rel);
}
function checkProject(i) {
  const bad = fail4("D7", D7_DETAIL(i.project.source), D7_FIX);
  if (i.project.source !== i.adapter.projectSource) return bad;
  if (i.adapter.projectSource === "pi:ctx.cwd" && !piCwdInside(i.project.worktree, i.piCwd)) return bad;
  return pass3("D7");
}
function checkMode(adapter) {
  return pass3("D10", D10_DETAIL(adapter.denyChannel));
}
function checkShell(env) {
  const win = process.platform === "win32";
  const shell = findRuntime("shell", env);
  if (shell !== null) return pass3("D11", D11_PASS_DETAIL(shell, win));
  return win ? fail4("D11", D11_WIN_DETAIL, D11_WIN_FIX) : fail4("D11", D11_POSIX_DETAIL, D11_POSIX_FIX);
}

// src/core/ops/doctor-hook.ts
import { existsSync as existsSync8, readFileSync as readFileSync9 } from "node:fs";
import path4 from "node:path";
var row = (status, detail, fixCommand) => fixCommand === void 0 ? { id: "D5", label: DOCTOR_LABEL.D5, status, detail } : { id: "D5", label: DOCTOR_LABEL.D5, status, detail, fixCommand };
function isObject5(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function loadFixture(bundleDir2, agent) {
  const file2 = path4.join(bundleDir2, HOOK_FIXTURE_DIR, HOOK_FIXTURE_FILE);
  if (!existsSync8(file2)) return null;
  let all;
  try {
    all = JSON.parse(hostText(readFileSync9(file2, "utf8")));
  } catch {
    return null;
  }
  if (!isObject5(all) || !Object.hasOwn(all, agent)) return null;
  const e = all[agent];
  if (!isObject5(e) || typeof e.event !== "string" || !Object.hasOwn(e, "payload")) return null;
  return { event: e.event, payload: e.payload };
}
function isNativeShape(stdout, exitCode, killed, event) {
  if (killed !== null || exitCode !== 0 && exitCode !== 2) return false;
  if (stdout.length === 0) return true;
  let out;
  try {
    out = JSON.parse(stdout);
  } catch {
    return false;
  }
  return isObject5(out) && isObject5(out.hookSpecificOutput) && out.hookSpecificOutput.hookEventName === event;
}
function codexHookJournaled(db) {
  if (db === null) return false;
  return db.raw.prepare("SELECT 1 FROM events WHERE agent = ? LIMIT 1").get("codex") !== void 0;
}
async function checkHookRoundTrip(i) {
  if (i.agent === "codex" && existsSync8(path4.join(i.codexConfigDir, HOOKS_JSON_FILE)) && !codexHookJournaled(i.db)) {
    return row("UNKNOWN", D5_CODEX_UNTRUSTED_DETAIL);
  }
  const fixture = loadFixture(i.bundleDir, i.agent);
  if (fixture === null) return row("UNKNOWN", D5_NO_FIXTURE_DETAIL(i.agent));
  const now = i.now ?? (() => performance.now());
  const start = now();
  const r = await runProcess([process.execPath, path4.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
    cwd: i.bundleDir,
    env: i.env,
    signal: i.signal,
    timeoutMs: HOOK_TIMEOUT_MS,
    stdin: JSON.stringify(fixture.payload)
  });
  const ms = Math.round(now() - start);
  if (!isNativeShape(r.stdout.toString("utf8"), r.exitCode, r.killed, fixture.event)) return row("FAIL", D5_SHAPE_DETAIL, D5_FIX);
  if (ms > HOOK_P95_MS) return row("FAIL", D5_SLOW_DETAIL(ms), D5_FIX);
  return row("PASS", DOCTOR_PASS_DETAIL);
}

// src/core/ops/db-heal.ts
import { existsSync as existsSync9, rmSync as rmSync3 } from "node:fs";

// src/core/store/owners.ts
import { mkdirSync as mkdirSync4, readdirSync as readdirSync3, readFileSync as readFileSync10, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { basename as basename2, join as join12 } from "node:path";
function ownersDir(configDir, projectKey) {
  return join12(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME);
}
function errCode2(err) {
  return err.code;
}
function isLive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (errCode2(err) === "ESRCH") return false;
    if (errCode2(err) === "EPERM") return true;
    throw err;
  }
}
function listLiveOwners(configDir, projectKey) {
  const dir = ownersDir(configDir, projectKey);
  let names;
  try {
    names = readdirSync3(dir);
  } catch (err) {
    if (errCode2(err) === "ENOENT") return [];
    throw err;
  }
  const live = [];
  for (const name of names) {
    if (!name.endsWith(OWNER_PID_EXT)) continue;
    const file2 = join12(dir, name);
    let text;
    try {
      text = readFileSync10(file2, "utf8");
    } catch (err) {
      if (errCode2(err) === "ENOENT") continue;
      throw err;
    }
    const serverId = basename2(name, OWNER_PID_EXT);
    if (isLive(Number(text.trim()))) live.push(serverId);
    else rmSync2(file2, { force: true });
  }
  return live;
}

// src/core/ops/db-heal.ts
function integrityOk2(rows) {
  return rows.length === 1 && rows[0].integrity_check === INTEGRITY_OK;
}
async function healLossless(dbPath) {
  const { DatabaseSync } = await import(SQLITE_MODULE);
  const tmp = dbPath + HEAL_TMP_SUFFIX;
  rmSync3(tmp, { force: true });
  try {
    const src = new DatabaseSync(dbPath, { readOnly: true, timeout: DB_TIMEOUT_MS });
    try {
      src.prepare("VACUUM INTO ?").run(tmp);
    } finally {
      src.close();
    }
    const copy = new DatabaseSync(tmp, { timeout: DB_TIMEOUT_MS });
    try {
      copy.exec("REINDEX");
      copy.exec("PRAGMA journal_mode = WAL");
      if (!integrityOk2(copy.prepare(PRAGMA_INTEGRITY_CHECK).all())) throw new CtxError("DB_CORRUPT");
    } finally {
      copy.close();
    }
    rmSync3(dbPath + DB_WAL_SUFFIX, { force: true });
    rmSync3(dbPath + DB_SHM_SUFFIX, { force: true });
    renameWithRetry(tmp, dbPath);
  } finally {
    rmSync3(tmp, { force: true });
  }
}
function renameAside(dbPath) {
  const ts = String(Date.now());
  for (const suffix of DB_SIBLING_SUFFIXES) {
    const file2 = dbPath + suffix;
    if (existsSync9(file2)) renameWithRetry(file2, file2 + HEAL_TS_SEP + ts + HEAL_BACKUP_SUFFIX);
  }
  return ts;
}
async function healD8(input) {
  const { project, configDir, serverId, row: row5 } = input;
  const live = listLiveOwners(configDir, project.projectKey);
  if (live.length === 1 && live[0] === serverId) {
    try {
      await healLossless(project.dbPath);
      const { fixCommand: _omit, ...rest } = row5;
      return { ...rest, status: "PASS", detail: D8_HEALED_LOSSLESS_DETAIL };
    } catch {
    }
  }
  const ts = renameAside(project.dbPath);
  closeDb(await openDb(project));
  return { ...row5, status: "FAIL", detail: D8_HEALED_RECREATE_DETAIL(ts) };
}

// src/core/ops/report.ts
function keyIsTyped(key) {
  if (key.length === 0) return false;
  for (const ch of key) {
    const upper = ch >= "A" && ch <= "Z";
    const digit = ch >= "0" && ch <= "9";
    if (!upper && !digit && ch !== "_") return false;
  }
  return true;
}
function envLine(key, value) {
  const typedKey = keyIsTyped(key) ? key : REPORT_INVALID;
  const allowed = REPORT_ENV_ENUMS[typedKey];
  const typedValue = allowed !== void 0 && allowed.includes(value) ? value : REPORT_INVALID;
  return REPORT_ENV_PREFIX + typedKey + ": " + typedValue;
}
function rowLine(agent, row5) {
  const fix = row5.status === "FAIL" ? DOCTOR_FAIL_LINE(agent, row5.id, row5.detail, row5.fixCommand ?? "") : "";
  return "| " + [row5.id + " " + row5.label, row5.status, row5.detail, fix].join(" | ") + " |";
}
function buildReport(input) {
  return [
    REPORT_HEADER,
    REPORT_HEADER_RULE,
    ...input.rows.map((row5) => rowLine(input.agent, row5)),
    ...input.command === void 0 ? [] : [REPORT_COMMAND_PREFIX + input.command],
    ...Object.keys(input.env).sort().map((key) => envLine(key, input.env[key]))
  ].join("\n");
}
function buildReportHead(input) {
  const tail = [
    ...input.command === void 0 ? [] : [REPORT_COMMAND_PREFIX + input.command],
    REPORT_REST_PREFIX + REPORT_POINTER
  ];
  const lines = [REPORT_HEADER, REPORT_HEADER_RULE];
  let used = Buffer.byteLength(lines.concat(tail).join("\n"), "utf8");
  for (const row5 of input.rows) {
    if (row5.status !== "FAIL") continue;
    const line = rowLine(input.agent, row5);
    const cost = Buffer.byteLength(line, "utf8") + 1;
    if (used + cost > REPORT_CAP) break;
    lines.push(line);
    used += cost;
  }
  return lines.concat(tail).join("\n");
}

// src/core/tools/doctor.ts
var ctxDoctorSchema = external_exports.object({}).strict();
function lineOf2(err) {
  if (err instanceof CtxError) return err.toLine();
  return err instanceof Error ? err.message : String(err);
}
async function guard(id2, run) {
  try {
    return await run();
  } catch (err) {
    return { id: id2, label: DOCTOR_LABEL[id2], status: "UNKNOWN", detail: lineOf2(err) };
  }
}
async function codexDb(ctx, adapter) {
  if (adapter.id !== "codex" || !existsSync10(ctx.project.dbPath)) return null;
  try {
    return await openDb(ctx.project, { readOnly: true });
  } catch {
    return null;
  }
}
async function hookRow(ctx, adapter, host) {
  const db = await codexDb(ctx, adapter);
  try {
    const row5 = await checkHookRoundTrip({
      agent: adapter.id,
      bundleDir: host.bundleDir,
      env: buildChildEnv(host.env),
      signal: ctx.signal,
      codexConfigDir: codexDirOf(host.env, requireHomeDir(host.env)),
      // same Codex dir D3 reads (D-N6-CODEX-HOME-2)
      db
    });
    const last2 = lastHookError(host.env);
    return last2 === null ? row5 : { ...row5, detail: row5.detail + D5_LAST_HOOK_ERROR(last2.ts, last2.stage, last2.label) };
  } finally {
    if (db !== null) closeDb(db);
  }
}
function ownServerId(configDir, projectKey) {
  const dir = join13(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME);
  if (!existsSync10(dir)) return "";
  for (const name of readdirSync4(dir)) {
    if (!name.endsWith(OWNER_PID_EXT)) continue;
    if (readFileSync11(join13(dir, name), "utf8").trim() === String(process.pid)) return basename3(name, OWNER_PID_EXT);
  }
  return "";
}
async function runDoctorChecks(ctx, adapter, host) {
  const env = host.env;
  const project = ctx.project;
  let integrityFailed = false;
  const checks = {
    D1: () => checkVersion({ bundleSha: BUNDLE_SHA, env: buildChildEnv(env), cwd: project.worktree, signal: ctx.signal }),
    D2: () => checkNode({ nodeVersion: process.version, bunVersion: process.versions.bun }),
    D3: () => checkHostConfig(adapter, env, project.worktree),
    D4: () => checkV1Leftovers(adapter.id, requireHomeDir(env), { project: project.worktree, piAgentDir: piAgentDirOf(env, requireHomeDir(env)), claudeDir: claudeDirOf(env, requireHomeDir(env)), codexDir: codexDirOf(env, requireHomeDir(env)), copilotDir: copilotDirOf(env, requireHomeDir(env)), kiroDir: kiroDirOf(env, requireHomeDir(env)), opencodeDir: opencodeDirOf(env, requireHomeDir(env)) }),
    D5: () => hookRow(ctx, adapter, host),
    D5b: () => checkDoubleFire(adapter.id, project.worktree),
    D6: () => checkMcp(ctx),
    D7: () => checkProject({ project, adapter, piCwd: host.piCwd }),
    D8: async () => {
      const r = await checkDb(project);
      integrityFailed = r.integrityFailed;
      return r.row;
    },
    D9: () => checkIndex(project),
    D10: () => checkMode(adapter),
    D11: () => checkShell(env)
  };
  const rows = [];
  for (const id2 of DOCTOR_CHECK_ORDER) rows.push(await guard(id2, checks[id2]));
  if (!integrityFailed) return rows;
  const at2 = DOCTOR_CHECK_ORDER.indexOf("D8");
  rows[at2] = await guard("D8", () => {
    const configDir = resolveConfigDir(env);
    return healD8({ project, configDir, serverId: ownServerId(configDir, project.projectKey), row: rows[at2] });
  });
  return rows;
}
function reportEnv(env) {
  const out = {};
  for (const key of Object.keys(REPORT_ENV_ENUMS)) {
    const value = env[key];
    if (value !== void 0) out[key] = value;
  }
  return out;
}
async function handler2(_input, ctx) {
  const adapter = getAdapter(ctx.project.agent);
  const host = { env: process.env, bundleDir: dirname6(process.argv[1]), piCwd: void 0 };
  const rows = await runDoctorChecks(ctx, adapter, host);
  const command = `context-mode ${rows.some((r) => r.status === "FAIL") ? "setup" : "doctor"} --agents ${adapter.id}`;
  const input = { agent: adapter.id, rows, env: reportEnv(process.env), command };
  const whole = buildReport(input);
  const bytes4 = Buffer.byteLength(whole, "utf8");
  if (bytes4 <= REPORT_CAP) return { text: whole, isError: false, sandboxBytes: bytes4 };
  const db = await openDb(ctx.project);
  try {
    indexText(db, ctx.project, ctx.sessionId, REPORT_SOURCE_LABEL, whole, "text");
  } finally {
    closeDb(db);
  }
  const text = buildReportHead(input);
  return { text, isError: false, sandboxBytes: bytes4 };
}
var ctxDoctor = Object.freeze({
  name: "ctx_doctor",
  schema: ctxDoctorSchema,
  readOnly: false,
  // D8 heal is the one write (ADR-0010)
  alwaysLoad: false,
  handler: handler2
});

// src/core/tools/execute.ts
import { existsSync as existsSync11, mkdtempSync, rmSync as rmSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { dirname as dirname7, join as join14, parse as parse3, resolve as resolve4 } from "node:path";

// src/core/sandbox/win-build.ts
var SEPARATORS2 = ";&|(\n";
var BLANKS = " 	\n";
var MVN = "mvn";
var MVN_CMD = "mvn.cmd";
function rewriteWindowsBuildTools(code, platform) {
  if (platform !== "win32") return code;
  let out = "";
  let atStart = true;
  let i = 0;
  while (i < code.length) {
    const ch = code.charAt(i);
    if (atStart && (ch === " " || ch === "	")) {
      out += ch;
      i++;
      continue;
    }
    if (atStart && code.startsWith(MVN, i)) {
      const after = code.charAt(i + MVN.length);
      if (after === "" || BLANKS.includes(after)) {
        out += MVN_CMD;
        i += MVN.length;
        atStart = false;
        continue;
      }
    }
    out += ch;
    atStart = SEPARATORS2.includes(ch);
    i++;
  }
  return out;
}

// src/core/tools/execute.ts
var TOOL2 = "ctx_execute";
var ctxExecuteSchema = external_exports.object({
  language: external_exports.enum(EXEC_LANGUAGES).or(external_exports.string()),
  code: external_exports.string().min(1),
  file: external_exports.string().optional(),
  intent: external_exports.string().optional(),
  timeoutMs: external_exports.number().int().positive().max(EXEC_TIMEOUT_MS).optional(),
  background: external_exports.boolean().optional(),
  summary: external_exports.boolean().optional()
}, { error: unknownField }).strict();
var SHELL_FAMILY = Object.freeze(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
var SCRIPT_EXT = Object.freeze({
  javascript: ".js",
  typescript: ".ts",
  python: ".py",
  powershell: ".ps1"
});
var SCRIPT_NAME = "code";
var TMP_PREFIX = "ctx-exec-";
var PS_BOM = "\uFEFF";
var PS_PRELUDE = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8";
var PS_ARGS = Object.freeze(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]);
var PLAIN_OUTPUT_ENV2 = Object.freeze({ NO_COLOR: "1", FORCE_COLOR: "0" });
var SOFT_EXIT = 1;
var LAUNCHER = [
  'const { spawn } = require("node:child_process");',
  'const { rmSync } = require("node:fs");',
  "const [mode, dir, ...argv] = process.argv.slice(1);",
  'if (mode === "start") {',
  '  const b = spawn(process.execPath, [...process.execArgv, "--", "run", dir, ...argv], { detached: true, stdio: "ignore", windowsHide: true });',
  "  b.unref();",
  "  process.stdout.write(String(b.pid));",
  "} else {",
  '  const done = () => { if (dir !== "") rmSync(dir, { recursive: true, force: true }); };',
  '  const c = spawn(argv[0], argv.slice(1), { stdio: "ignore", windowsHide: true });',
  '  c.on("close", done);',
  '  c.on("error", done);',
  "}"
].join("\n");
function fail5(text, journal) {
  return journal === void 0 ? { text, isError: true, sandboxBytes: 0 } : { text, isError: true, sandboxBytes: 0, journal };
}
function schemaLine(issue2) {
  if (issue2.code === "unrecognized_keys") return new CtxError("UNKNOWN_FIELD", { f: issue2.keys[0] }).toLine();
  return issue2.message;
}
function fileError(given, abs, root) {
  let dir = abs;
  while (!existsSync11(dir) && dirname7(dir) !== dir) dir = dirname7(dir);
  if (isInside(root, dir)) return null;
  return new CtxError("OUTSIDE_ROOT", { p: given, root }).toLine();
}
function takesDashC(language, runtime) {
  if (language === "shell") return true;
  if (SCRIPT_EXT[language] !== void 0) return false;
  return SHELL_FAMILY.includes(parse3(runtime).name);
}
function scriptArgv(language, runtime, file2) {
  return language === "powershell" ? [runtime, ...PS_ARGS, file2] : [runtime, file2];
}
function scriptText(language, code) {
  return language === "powershell" ? PS_BOM + PS_PRELUDE + "\n" + code : code;
}
function summaryLine(exitCode, fullBytes) {
  return "exit " + exitCode + " \xB7 " + fullBytes + " B";
}
function echoBlock(language, code) {
  return "```" + language + "\n" + code + "\n```";
}
function sourceLabel(code) {
  const nl = code.indexOf("\n");
  const first = nl < 0 ? code : code.slice(0, nl);
  return Array.from(TOOL2 + ":" + first).slice(0, SOURCE_LABEL_MAX_CHARS).join("");
}
function moreReserve(intent, label) {
  return Buffer.byteLength(moreLine2(intent, label), "utf8");
}
function spawnFailed(argv0, cwd) {
  return new CtxError("SPAWN_FAILED", { detail: argv0 + " gave no exit code in " + cwd }).toLine();
}
async function finish(input, ctx, r, exitCode, journal) {
  const isError = exitCode !== 0 && !(input.language === "shell" && exitCode === SOFT_EXIT && r.stderr.length === 0);
  const combined = r.stdout.toString("utf8") + (exitCode !== 0 ? r.stderr.toString("utf8") : "");
  const fullBytes = Buffer.byteLength(combined, "utf8");
  const head = summaryLine(exitCode, fullBytes);
  const intent = input.intent ?? "";
  const direct = head + "\n" + (input.summary === true ? echoBlock(input.language, input.code) + "\n" : "") + combined;
  if (intent === "" && Buffer.byteLength(direct, "utf8") <= OUTPUT_CAP) {
    return { text: direct, isError, sandboxBytes: fullBytes, journal };
  }
  const label = sourceLabel(input.code);
  const budget = OUTPUT_CAP - Buffer.byteLength(head, "utf8") - 2 - moreReserve(intent, label);
  const db = await openDb(ctx.project);
  let picked;
  try {
    const { sourceId } = indexText(db, ctx.project, ctx.sessionId, label, combined, "text");
    picked = selectChunks(db, sourceId, intent, budget);
  } finally {
    closeDb(db);
  }
  const text = head + "\n" + picked.text + (picked.more === null ? "" : "\n" + picked.more);
  return { text: capBytes(text, OUTPUT_CAP).text, isError, sandboxBytes: fullBytes, journal };
}
async function handler3(raw, ctx) {
  const parsed = ctxExecuteSchema.safeParse(raw);
  if (!parsed.success) return fail5(schemaLine(parsed.error.issues[0]));
  const input = parsed.data;
  const cwd = ctx.project.worktree;
  const extra = { ...PLAIN_OUTPUT_ENV2 };
  if (input.file !== void 0) {
    const abs = resolve4(cwd, input.file);
    const bad = fileError(input.file, abs, ctx.project.containmentRoot);
    if (bad !== null) return fail5(bad);
    extra.CTX_FILE = abs;
  }
  const runtime = findRuntime(input.language);
  if (runtime === null) return fail5(noRuntimeError(input.language).toLine());
  const env = buildChildEnv(process.env, extra);
  const timeoutMs = input.timeoutMs ?? EXEC_TIMEOUT_MS;
  const journal = { kind: "cmd", key: canonicalKey(TOOL2, input.code), path: input.file ?? null, exit_code: null };
  let tmpDir = null;
  let handedOff = false;
  try {
    let argv;
    if (takesDashC(input.language, runtime)) {
      argv = [runtime, "-c", input.language === "shell" ? rewriteWindowsBuildTools(input.code, process.platform) : input.code];
    } else {
      tmpDir = mkdtempSync(join14(tmpdir2(), TMP_PREFIX));
      const file2 = join14(tmpDir, SCRIPT_NAME + (SCRIPT_EXT[input.language] ?? ""));
      writeFileSync3(file2, scriptText(input.language, input.code), "utf8");
      argv = scriptArgv(input.language, runtime, file2);
    }
    if (input.background === true) {
      const r2 = await runProcess([process.execPath, "-e", LAUNCHER, "--", "start", tmpDir ?? "", ...argv], { cwd, env, signal: ctx.signal, timeoutMs });
      const pid = r2.stdout.toString("utf8");
      if (r2.exitCode !== 0 || pid === "" || !Number.isSafeInteger(Number(pid))) return fail5(spawnFailed(argv[0], cwd), journal);
      handedOff = true;
      return { text: BACKGROUND_REPLY_PREFIX + pid, isError: false, sandboxBytes: 0, journal };
    }
    const r = await runProcess(argv, { cwd, env, signal: ctx.signal, timeoutMs });
    if (r.killed === "timeout") return fail5(new CtxError("TIMEOUT", { ms: timeoutMs }).toLine(), journal);
    if (r.killed === "cancel") return fail5(CANCELLED_LINE, journal);
    if (r.exitCode === null) return fail5(spawnFailed(argv[0], cwd), journal);
    return await finish(input, ctx, r, r.exitCode, { ...journal, exit_code: r.exitCode });
  } catch (err) {
    if (err instanceof CtxError) return fail5(err.toLine(), journal);
    if (err instanceof Error && typeof err.code === "string") {
      return fail5(new CtxError("SPAWN_FAILED", { detail: err.message }).toLine(), journal);
    }
    throw err;
  } finally {
    if (tmpDir !== null && !handedOff) rmSync4(tmpDir, { recursive: true, force: true });
  }
}
var ctxExecute = {
  name: TOOL2,
  schema: ctxExecuteSchema,
  readOnly: false,
  alwaysLoad: true,
  handler: handler3
};

// src/core/tools/index.ts
import { existsSync as existsSync12, readFileSync as readFileSync13, statSync as statSync6 } from "node:fs";
import { dirname as dirname8, extname, join as join16, relative as relative3, resolve as resolve5 } from "node:path";

// src/core/index/walk.ts
import { readdirSync as readdirSync5, readFileSync as readFileSync12, realpathSync as realpathSync6, statSync as statSync5 } from "node:fs";
import { join as join15 } from "node:path";
var GITIGNORE = ".gitignore";
var GIT_DIR = ".git";
function walkDir(root, containmentRoot) {
  const real2 = realpathSync6(root);
  if (!isInside(containmentRoot, real2)) throw new CtxError("OUTSIDE_ROOT", { p: root, root: containmentRoot });
  const found = [];
  visit(real2, [], [], containmentRoot, /* @__PURE__ */ new Set([real2]), found);
  found.sort(compareFound);
  return found.map((f) => ({ absPath: f.absPath, relPath: join15(...f.dir, f.name) }));
}
function visit(abs, rel, parent, contain, seen, found) {
  let entries;
  try {
    entries = readdirSync5(abs, { withFileTypes: true });
  } catch {
    return;
  }
  const rules = entries.some((e) => e.name === GITIGNORE && e.isFile()) ? parent.concat(readRules(join15(abs, GITIGNORE), rel)) : parent;
  for (const e of entries) {
    if (e.name === GIT_DIR) continue;
    const path5 = join15(abs, e.name);
    let isDir = e.isDirectory();
    let isFile = e.isFile();
    let target = path5;
    if (e.isSymbolicLink()) {
      let resolved;
      try {
        resolved = realpathSync6(path5);
      } catch {
        continue;
      }
      if (!isInside(contain, resolved)) continue;
      const st = statSync5(resolved);
      isDir = st.isDirectory();
      isFile = st.isFile();
      target = resolved;
    }
    const segs = rel.concat(e.name);
    if (ignored(rules, segs, isDir)) continue;
    if (isFile) {
      found.push({ dir: rel, name: e.name, absPath: path5 });
    } else if (isDir) {
      const key = e.isSymbolicLink() ? target : realpathSync6(path5);
      if (seen.has(key)) continue;
      seen.add(key);
      visit(path5, segs, rules, contain, seen, found);
    }
  }
}
function compareFound(a, b) {
  const n = Math.min(a.dir.length, b.dir.length);
  for (let i = 0; i < n; i += 1) {
    if (a.dir[i] !== b.dir[i]) return a.dir[i] < b.dir[i] ? -1 : 1;
  }
  if (a.dir.length !== b.dir.length) return a.dir.length - b.dir.length;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
function readRules(file2, base) {
  let body;
  try {
    body = readFileSync12(file2, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const raw of body.split("\n")) {
    const rule = parseRule(raw, base);
    if (rule !== void 0) out.push(rule);
  }
  return out;
}
function parseRule(raw, base) {
  let line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  let end = line.length;
  while (end > 0 && line[end - 1] === " " && !(end > 1 && line[end - 2] === "\\")) end -= 1;
  line = line.slice(0, end);
  if (line.length === 0 || line.startsWith("#")) return void 0;
  const negate = line.startsWith("!");
  if (negate) line = line.slice(1);
  else if (line.startsWith("\\#") || line.startsWith("\\!")) line = line.slice(1);
  const dirOnly = line.endsWith("/");
  if (dirOnly) line = line.slice(0, -1);
  const anchored = line.startsWith("/");
  if (anchored) line = line.slice(1);
  const parts = line.split("/").filter((p) => p !== "");
  if (parts.length === 0) return void 0;
  return { base, parts, negate, dirOnly, anchored };
}
function ignored(rules, segs, isDir) {
  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const r = rules[i];
    if (r.dirOnly && !isDir) continue;
    if (matches(r, segs)) return !r.negate;
  }
  return false;
}
function matches(r, segs) {
  if (segs.length <= r.base.length) return false;
  for (let i = 0; i < r.base.length; i += 1) if (segs[i] !== r.base[i]) return false;
  if (r.anchored) return matchSegs(r.parts, 0, segs, r.base.length);
  for (let from = r.base.length; from < segs.length; from += 1) {
    if (matchSegs(r.parts, 0, segs, from)) return true;
  }
  return false;
}
function matchSegs(pat, p, segs, s) {
  if (p === pat.length) return s === segs.length;
  if (pat[p] === "**") {
    const first = p === pat.length - 1 ? s + 1 : s;
    for (let k = first; k <= segs.length; k += 1) if (matchSegs(pat, p + 1, segs, k)) return true;
    return false;
  }
  return s < segs.length && globSeg(pat[p], segs[s]) && matchSegs(pat, p + 1, segs, s + 1);
}
function globSeg(pat, name) {
  let p = 0;
  let n = 0;
  let star = -1;
  let mark = 0;
  while (n < name.length) {
    if (p < pat.length && pat[p] === "*") {
      star = p;
      mark = n;
      p += 1;
    } else if (p < pat.length && pat[p] === "\\" && p + 1 < pat.length && pat[p + 1] === name[n]) {
      p += 2;
      n += 1;
    } else if (p < pat.length && pat[p] !== "\\" && (pat[p] === "?" || pat[p] === name[n])) {
      p += 1;
      n += 1;
    } else if (star >= 0) {
      p = star + 1;
      mark += 1;
      n = mark;
    } else {
      return false;
    }
  }
  while (p < pat.length && pat[p] === "*") p += 1;
  return p === pat.length;
}

// src/core/sandbox/fetch.ts
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { connect as tlsConnect } from "node:tls";
var PRIVATE_RANGES = [
  ["127.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["0.0.0.0", 32, "ipv4"],
  ["::1", 128, "ipv6"],
  ["::", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"]
];
var BLOCKED = new BlockList();
for (const [net, prefix, type] of PRIVATE_RANGES) BLOCKED.addSubnet(net, prefix, type);
var STATUS_OK_FIRST = 200;
var STATUS_OK_END = 300;
var STATUS_REDIRECT = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function fail6(code) {
  return new CtxError("FETCH_FAILED", { code });
}
function causeCode(err) {
  if (err instanceof CtxError) return "";
  const e = err;
  if (e && typeof e.code === "string" && e.code !== "") return e.code;
  if (e && Array.isArray(e.errors) && e.errors.length > 0) return causeCode(e.errors[0]);
  if (e && typeof e.name === "string" && e.name !== "") return e.name;
  return "UNKNOWN";
}
function bare(hostname2) {
  return hostname2.startsWith("[") && hostname2.endsWith("]") ? hostname2.slice(1, -1) : hostname2;
}
function defaultPort(protocol) {
  const agent = protocol === "https:" ? https.globalAgent : http.globalAgent;
  return agent.defaultPort;
}
function parseUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (err) {
    throw fail6(causeCode(err));
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw fail6("ERR_INVALID_PROTOCOL");
  return u;
}
function envValue(upper) {
  const v = process.env[upper] ?? process.env[upper.toLowerCase()];
  return v === void 0 || v.trim() === "" ? void 0 : v.trim();
}
function pickProxy(u) {
  const raw = envValue(u.protocol === "https:" ? "HTTPS_PROXY" : "HTTP_PROXY");
  if (raw === void 0) return void 0;
  const host = bare(u.hostname).toLowerCase();
  for (const item of (envValue("NO_PROXY") ?? "").split(",")) {
    let entry = item.trim().toLowerCase();
    if (entry.startsWith(".")) entry = entry.slice(1);
    if (entry !== "" && (host === entry || host.endsWith("." + entry))) return void 0;
  }
  const p = parseUrl(raw.includes("://") ? raw : "http://" + raw);
  if (p.protocol !== "http:") throw fail6("ERR_INVALID_PROTOCOL");
  const auth = p.username === "" ? void 0 : "Basic " + Buffer.from(decodeURIComponent(p.username) + ":" + decodeURIComponent(p.password)).toString("base64");
  return { url: p, auth };
}
function checkAddress(hostname2, address) {
  const family = isIP(address);
  if (family === 0 || BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6")) {
    throw new CtxError("SSRF", { host: hostname2 });
  }
}
async function resolveTarget(u, signal) {
  const host = bare(u.hostname);
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch (err) {
    throw fail6(causeCode(err));
  }
  if (signal.aborted) throw fail6("ABORT_ERR");
  if (addrs.length === 0) throw fail6("ENOTFOUND");
  for (const a of addrs) checkAddress(host, a.address);
  return { host, port: u.port === "" ? defaultPort(u.protocol) : Number(u.port), address: addrs[0].address };
}
function tlsName(host) {
  return isIP(host) === 0 ? host : void 0;
}
function request(u, conn, proxy, signal) {
  const host = bare(u.hostname);
  const port = u.port === "" ? defaultPort(u.protocol) : Number(u.port);
  const path5 = u.pathname + u.search;
  return new Promise((resolve6, reject) => {
    const onErr = (err) => reject(fail6(causeCode(err)));
    if (proxy === void 0) {
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.request({ host: conn.address, port, path: path5, signal, servername: tlsName(host), headers: { host: u.host } });
      req.on("response", resolve6).on("error", onErr).end();
      return;
    }
    const proxyHeaders = proxy.auth === void 0 ? {} : { "proxy-authorization": proxy.auth };
    if (u.protocol === "http:") {
      const req = http.request({ host: conn.address, port: conn.port, path: u.href, signal, headers: { host: u.host, ...proxyHeaders } });
      req.on("response", resolve6).on("error", onErr).end();
      return;
    }
    const authority = (isIP(host) === 6 ? "[" + host + "]" : host) + ":" + port;
    const tunnel = http.request({ host: conn.address, port: conn.port, method: "CONNECT", path: authority, signal, headers: { host: authority, ...proxyHeaders } });
    tunnel.on("error", onErr);
    tunnel.on("connect", (res, socket) => {
      if (res.statusCode !== STATUS_OK_FIRST) {
        socket.destroy();
        reject(fail6(res.statusCode ?? "ERR_PROXY_CONNECT"));
        return;
      }
      const req = https.request({
        host,
        port,
        path: path5,
        signal,
        headers: { host: u.host },
        createConnection: () => tlsConnect({ socket, host, servername: tlsName(host) })
      });
      req.on("response", resolve6).on("error", onErr).end();
    });
    tunnel.end();
  });
}
function readBody(res) {
  return new Promise((resolve6, reject) => {
    const parts = [];
    res.on("data", (b) => parts.push(b));
    res.on("end", () => resolve6(Buffer.concat(parts)));
    res.on("error", (err) => reject(fail6(causeCode(err))));
    res.on("aborted", () => reject(fail6("ECONNRESET")));
  });
}
async function safeFetch(url2, signal) {
  let current = parseUrl(url2);
  for (let hop = 0; ; hop += 1) {
    if (signal.aborted) throw fail6("ABORT_ERR");
    const proxy = pickProxy(current);
    const origin = bare(current.hostname);
    if (proxy !== void 0 && isIP(origin) !== 0) checkAddress(origin, origin);
    const conn = await resolveTarget(proxy === void 0 ? current : proxy.url, signal);
    const res = await request(current, conn, proxy, signal);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (STATUS_REDIRECT.has(status) && location !== void 0) {
      res.resume();
      if (hop >= FETCH_MAX_HOPS) throw fail6("ERR_TOO_MANY_REDIRECTS");
      let next;
      try {
        next = new URL(location, current);
      } catch (err) {
        throw fail6(causeCode(err));
      }
      current = parseUrl(next.href);
      continue;
    }
    if (status < STATUS_OK_FIRST || status >= STATUS_OK_END) {
      res.resume();
      throw fail6(status);
    }
    const body = await readBody(res);
    const shown2 = new URL(current.href);
    shown2.username = "";
    shown2.password = "";
    return { body, contentType: res.headers["content-type"] ?? "", finalUrl: shown2.href };
  }
}

// src/core/tools/index.ts
var ctxIndexSchema = external_exports.object({
  path: external_exports.string().optional(),
  content: external_exports.string().optional(),
  url: external_exports.string().optional(),
  source: external_exports.string().optional()
}, { error: unknownField }).strict();
var INPUT_FIELDS = ["path", "content", "url"];
var EXT_KIND = Object.freeze({ ".md": "md", ".html": "html", ".htm": "html" });
var TYPE_KIND = Object.freeze({ "text/html": "html", "text/markdown": "md" });
var DEFAULT_CONTENT_LABEL = "content";
var utf8 = new TextDecoder("utf-8", { fatal: true });
function userLabel(label) {
  return label === DECISION_SOURCE ? DECISION_USER_LABEL : label;
}
function kindOfPath(p) {
  return EXT_KIND[extname(p).toLowerCase()] ?? "text";
}
function kindOfType(contentType) {
  const semi = contentType.indexOf(";");
  const media = (semi < 0 ? contentType : contentType.slice(0, semi)).trim().toLowerCase();
  return TYPE_KIND[media] ?? "text";
}
function readUtf8(absPath) {
  try {
    return utf8.decode(readFileSync13(absPath));
  } catch {
    return void 0;
  }
}
function missingOrOutside(given, abs, root) {
  let dir = abs;
  while (!existsSync12(dir) && dirname8(dir) !== dir) dir = dirname8(dir);
  if (dir !== abs && isInside(root, dir)) return new CtxError("INVALID_ARGS", { field: "path", action: "pass an existing file or folder" });
  return new CtxError("OUTSIDE_ROOT", { p: given, root });
}
function pathItems(input, project) {
  const abs = resolve5(project.worktree, input.path);
  if (!isInside(project.containmentRoot, abs)) throw missingOrOutside(input.path, abs, project.containmentRoot);
  const base = relative3(project.worktree, abs);
  if (statSync6(abs).isDirectory()) {
    return walkDir(abs, project.containmentRoot).map((f) => ({
      sourceKind: "path",
      label: join16(base, f.relPath),
      kind: kindOfPath(f.relPath),
      read: () => readUtf8(f.absPath)
    }));
  }
  return [{ sourceKind: "path", label: base === "" ? input.path : base, kind: kindOfPath(abs), read: () => readUtf8(abs) }];
}
async function itemsOf(input, ctx) {
  if (input.content !== void 0) {
    const text2 = input.content;
    const label2 = input.source ?? DEFAULT_CONTENT_LABEL;
    const kind = hasMdStructure(text2) ? "md" : "text";
    return { items: [{ sourceKind: "content", label: label2, kind, read: () => text2 }], from: label2 };
  }
  if (input.path !== void 0) {
    const items = pathItems({ ...input, path: input.path }, ctx.project);
    return { items, from: items.length === 1 ? items[0].label : input.path };
  }
  const res = await safeFetch(input.url ?? "", AbortSignal.any([ctx.signal, AbortSignal.timeout(EXEC_TIMEOUT_MS)]));
  const text = res.body.toString("utf8");
  const label = res.finalUrl;
  return { items: [{ sourceKind: "url", label, kind: kindOfType(res.contentType), read: () => text }], from: label };
}
async function handler4(input, ctx) {
  const given = INPUT_FIELDS.filter((f) => input[f] !== void 0);
  if (given.length !== 1) return { text: new CtxError("ONE_OF_INPUT", { names: INPUT_FIELDS.join(", ") }).toLine(), isError: true, sandboxBytes: 0 };
  try {
    const got = await itemsOf(input, ctx);
    const items = got.items.map((it) => ({ ...it, label: userLabel(it.label) }));
    const from = userLabel(got.from);
    const db = await openDb(ctx.project);
    let sources = 0;
    let chunks = 0;
    let bytes4 = 0;
    let lastId = 0;
    try {
      for (const it of items) {
        const text = it.read();
        if (text === void 0) continue;
        const stored = storeText(db, ctx.project, ctx.sessionId, it.sourceKind, it.label, text, it.kind);
        chunks += stored.chunks;
        lastId = stored.sourceId;
        bytes4 += Buffer.byteLength(text, "utf8");
        sources += 1;
      }
    } finally {
      closeDb(db);
    }
    const shown2 = Buffer.byteLength(from, "utf8") > ECHO_MAX_BYTES ? sourceHandle(lastId) : from;
    const line = "Indexed " + sources + " source(s), " + chunks + " chunk(s) from " + shown2 + ".";
    return {
      text: capBytes(line, OUTPUT_CAP).text,
      isError: false,
      sandboxBytes: bytes4,
      journal: { kind: "index", key: from, path: from, exit_code: null }
    };
  } catch (err) {
    if (err instanceof CtxError) return { text: err.toLine(), isError: true, sandboxBytes: 0 };
    throw err;
  }
}
var ctxIndex = {
  name: "ctx_index",
  schema: ctxIndexSchema,
  readOnly: false,
  alwaysLoad: false,
  handler: handler4
};

// src/core/tools/purge.ts
var ctxPurgeSchema = external_exports.object({
  session: external_exports.string().optional(),
  source: external_exports.string().optional(),
  project: external_exports.boolean().optional()
}, { error: unknownField }).strict();
function reply2(text, isError) {
  return { text, isError, sandboxBytes: 0 };
}
function scopesOf(input) {
  const set3 = {
    session: input.session !== void 0,
    source: input.source !== void 0,
    project: input.project === true
  };
  return PURGE_SCOPES.filter((s) => set3[s]);
}
function changes(raw, sql, ...args) {
  return Number(raw.prepare(sql).run(...args).changes);
}
function purgeScope(raw, scope, input) {
  if (scope === "session") return changes(raw, "DELETE FROM events WHERE session_id = ?", input.session);
  if (scope === "source") {
    const label = input.source;
    return deleteChunkRows(raw, { label }) + changes(raw, "DELETE FROM sources WHERE label = ?", label);
  }
  const chunks = deleteChunkRows(raw, "all");
  return changes(raw, "DELETE FROM events") + chunks + changes(raw, "DELETE FROM sources");
}
function isBusy(err) {
  const code = err?.errcode;
  return typeof code === "number" && (code & SQLITE_PRIMARY_CODE_MASK) === SQLITE_BUSY_CODE;
}
async function handler5(input, ctx) {
  const scopes = scopesOf(input);
  if (scopes.length === 0) return reply2(PURGE_NO_SCOPE_LINE, true);
  if (scopes.length > 1) return reply2(PURGE_MANY_SCOPES_LINE, true);
  const scope = scopes[0];
  try {
    const db = await openDb(ctx.project);
    try {
      const rows = withWrite(db, (h) => purgeScope(h.raw, scope, input));
      return reply2(PURGE_SUMMARY(rows, scope), false);
    } finally {
      closeDb(db);
    }
  } catch (err) {
    if (isBusy(err)) return reply2(PURGE_BUSY_LINE, true);
    throw err;
  }
}
var ctxPurge = Object.freeze({
  name: "ctx_purge",
  description: "",
  schema: ctxPurgeSchema,
  readOnly: false,
  alwaysLoad: false,
  handler: handler5
});

// src/core/tools/resume.ts
var ctxResumeSchema = external_exports.object({
  session: external_exports.string().optional(),
  seq: external_exports.number().int().positive().optional()
}, {
  error: (issue2) => issue2.code === "unrecognized_keys" ? RESUME_UNKNOWN_FIELD_LINE : void 0
}).strict();
function reply3(text, isError) {
  return { text, isError, sandboxBytes: 0 };
}
async function handler6(input, ctx) {
  const sessionId = input.session ?? ctx.sessionId;
  if (sessionId === "") return reply3(RESUME_NO_SESSION_LINE, true);
  const db = await openDb(ctx.project, { readOnly: true });
  try {
    if (input.seq !== void 0) {
      const row5 = readEventBySeq(db, input.seq);
      if (row5 === null || row5.session_id !== sessionId) return reply3(RESUME_NO_ROW_LINE(input.seq), true);
      return reply3(row5.body, false);
    }
    const rows = readSessionEvents(db, sessionId);
    const newest = rows.at(-1);
    if (newest === void 0) return reply3(RESUME_EMPTY_LINE, false);
    const sources = listSessionSources(db, sessionId, MAX_CANDIDATES).map((r) => "source " + sourceHandle(r.id) + ": " + r.label + " (" + r.bytes + " B)");
    const goal = readFirstPrompt(db, sessionId);
    const last2 = readLastPrompt(db, sessionId);
    const units = queryUnits(db, sessionId, recallQueryText(last2, goal), RECALL_UNIT_CANDIDATES).map((u) => ({ ...u, label: sourceHandle(u.sourceId) }));
    const block = renderState(rows, newest.turn, { sources, units });
    if (Buffer.byteLength(block, "utf8") > RESUME_CAP) throw new Error("ctx_resume: state block over RESUME_CAP (render bug).");
    return reply3(block, false);
  } finally {
    closeDb(db);
  }
}
var ctxResume = Object.freeze({
  name: "ctx_resume",
  schema: ctxResumeSchema,
  readOnly: true,
  alwaysLoad: false,
  handler: handler6
});

// src/core/tools/stats.ts
var ctxStatsSchema = external_exports.object({}, {
  error: (issue2) => issue2.code === "unrecognized_keys" ? STATS_UNKNOWN_FIELD_LINE : void 0
}).strict();
var GROUPS = "SELECT session_id, agent, COUNT(*) AS calls, COALESCE(SUM(sandbox_bytes), 0) AS produced, COALESCE(SUM(returned_bytes), 0) AS returned FROM events WHERE tool IS NOT NULL AND kind <> 'cost' GROUP BY session_id, agent ORDER BY agent, session_id";
var EMPTY5 = Object.freeze({ calls: 0, produced: 0, returned: 0, saved: 0 });
function readGroups(raw) {
  return raw.prepare(GROUPS).all().map((r) => {
    const produced = Number(r.produced);
    const returned = Number(r.returned);
    return { session: String(r.session_id), agent: String(r.agent), calls: Number(r.calls), produced, returned, saved: Math.max(0, produced - returned) };
  });
}
function sum(groups) {
  return groups.reduce((t, g) => ({
    calls: t.calls + g.calls,
    produced: t.produced + g.produced,
    returned: t.returned + g.returned,
    saved: t.saved + g.saved
  }), EMPTY5);
}
function reductionPct(t) {
  if (t.calls === 0) return 0;
  return Number((t.saved * PERCENT_SCALE / Math.max(1, t.produced)).toFixed(1));
}
function tableRow(label, t) {
  const last2 = t.calls === 0 ? STATS_NO_DATA : String(reductionPct(t));
  return "| " + [label, t.produced + " B", t.returned + " B", t.saved + " B", last2].join(" | ") + " |";
}
async function handler7(_input, ctx) {
  const db = await openDb(ctx.project, { readOnly: true });
  let groups;
  try {
    groups = readGroups(db.raw);
  } finally {
    closeDb(db);
  }
  const session = sum(groups.filter((g) => g.session === ctx.sessionId));
  const project = sum(groups);
  const allTime = project;
  const agentIds = [.../* @__PURE__ */ new Set([...groups.map((g) => g.agent), ctx.project.agent])].sort();
  const table = [
    "| " + STATS_COLUMNS.join(" | ") + " |",
    "|" + STATS_COLUMNS.map(() => "---").join("|") + "|",
    tableRow("session", session),
    tableRow("project", project),
    tableRow("all-time", allTime),
    ...agentIds.map((a) => tableRow("agent " + a, sum(groups.filter((g) => g.agent === a))))
  ].join("\n");
  const summary = STATS_SUMMARY(reductionPct(allTime), reductionPct(session));
  return { text: capBytes(summary + "\n\n" + table, OUTPUT_CAP).text, isError: false, sandboxBytes: 0 };
}
var ctxStats = Object.freeze({
  name: "ctx_stats",
  schema: ctxStatsSchema,
  readOnly: true,
  alwaysLoad: false,
  handler: handler7
});

// src/core/tools/upgrade.ts
import { existsSync as existsSync18, realpathSync as realpathSync7, rmSync as rmSync9 } from "node:fs";
import { basename as basename5, dirname as dirname10, join as join22 } from "node:path";

// src/core/ops/host-write.ts
import { copyFileSync, existsSync as existsSync13, mkdirSync as mkdirSync5, writeFileSync as writeFileSync4 } from "node:fs";
import { dirname as dirname9, join as join17 } from "node:path";
function defaultWrite(file2, text) {
  writeFileSync4(file2, text, "utf8");
}
function hostConfigPath(agent, home, env) {
  const own2 = OWN_MCP_ENTRY[agent];
  if (own2 !== void 0) return ownMcpFileOf(agent, own2.file, env, home);
  switch (agent) {
    case "opencode":
      return join17(opencodeDirOf(env, home), OPENCODE_BASE_CONFIG_FILE);
    // D-WIN-OPENCODE-DIR-1
    case "pi":
      return join17(piAgentDirOf(env, home), SETTINGS_FILE);
    case "copilot-cli":
      return null;
    default:
      return join17(home, ...AGENT_HOME_DIR[agent], SETTINGS_FILE);
  }
}
function cell2(value) {
  return value === void 0 ? "" : JSON.stringify(value);
}
function toRow(file2, edit) {
  return { area: file2 + UPGRADE_AREA_KEY_SEP + edit.path, before: cell2(edit.before), after: cell2(edit.after) };
}
function writeWithRollback(file2, text, write2, atomic) {
  const trash = file2 + UPGRADE_TRASH_SUFFIX;
  const tmp = `${file2}${HOST_CONFIG_TMP_SUFFIX}.${process.pid}`;
  const had = existsSync13(file2);
  mkdirSync5(dirname9(file2), { recursive: true });
  if (had) copyFileSync(file2, trash);
  try {
    write2(tmp, text);
    renameWithRetry(tmp, file2, atomic);
  } catch (err) {
    removeTmpFile(tmp, atomic);
    if (!had) {
      removeTmpFile(file2, atomic);
      throw replaceFailure(file2, err);
    }
    try {
      renameWithRetry(trash, file2, atomic);
    } catch (restoreErr) {
      throw new Error(`${replaceFailure(file2, err).message}. The original is kept at ${trash}`, { cause: restoreErr });
    }
    throw replaceFailure(file2, err);
  }
  try {
    unlinkWithRetry(trash, atomic);
  } catch {
  }
}
function regenerateHostConfig(row5, home, opts = {}) {
  const env = opts.env ?? process.env;
  const requested = hostConfigPath(row5.id, home, env);
  if (requested === null) return [];
  const current = readHostConfig(row5.id, requested);
  const result = mergeOwnEntries(row5.id, current.text, current.format, row5);
  const exists = existsSync13(current.path);
  if (exists && result.text === current.text) return [];
  const text = result.text === "" && current.format !== "toml" ? JSON.stringify({}) : result.text;
  writeWithRollback(current.path, current.layout === void 0 ? text : withLayout(text, current.layout), opts.write ?? defaultWrite, opts.atomic ?? {});
  return result.edits.map((e) => toRow(current.path, e));
}

// src/core/ops/plugin-swap.ts
import { existsSync as existsSync14, lstatSync, readdirSync as readdirSync6, readlinkSync, rmSync as rmSync5, symlinkSync, unlinkSync as unlinkSync2 } from "node:fs";
import { basename as basename4, join as join18, win32 as win322 } from "node:path";
function linkTarget(path5, win) {
  if (!isLink(path5)) return null;
  const target = readlinkSync(path5);
  return win ? win322.basename(target) : target;
}
function isLink(path5) {
  return lstatSync(path5, { throwIfNoEntry: false })?.isSymbolicLink() === true;
}
function generations(agentDir) {
  return readdirSync6(agentDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).filter((name) => !name.startsWith(UPGRADE_FETCH_DIR_PREFIX) && !name.endsWith(UPGRADE_TRASH_SUFFIX)).sort();
}
function settleLinks(link, tmp, old, opts) {
  if (isLink(tmp)) unlinkSync2(tmp);
  if (!isLink(old)) return;
  if (isLink(link)) unlinkSync2(old);
  else renameWithRetry(old, link, opts);
}
function swapPluginCurrent(agentDir, sha, opts = {}) {
  const next = join18(agentDir, sha);
  if (!existsSync14(next) || !lstatSync(next).isDirectory()) {
    throw new CtxError("PLUGIN_ROOT_MISSING", { agent: basename4(agentDir), path: next });
  }
  const link = join18(agentDir, PLUGIN_CURRENT_LINK);
  const tmp = link + PLUGIN_LINK_TMP_SUFFIX;
  const old = link + PLUGIN_LINK_OLD_SUFFIX;
  settleLinks(link, tmp, old, opts);
  const win = (opts.platform ?? process.platform) === "win32";
  const before = linkTarget(link, win);
  if (before === sha) return { current: next, previous: null, removed: [] };
  const symlink = opts.symlink ?? symlinkSync;
  if (win) symlink(next, tmp, PLUGIN_LINK_TYPE_WIN32);
  else symlink(sha, tmp, PLUGIN_LINK_TYPE);
  if (before !== null) renameWithRetry(link, old, opts);
  renameWithRetry(tmp, link, opts);
  if (before !== null) unlinkSync2(old);
  const keep = /* @__PURE__ */ new Set([sha]);
  if (before !== null) keep.add(before);
  const removed = generations(agentDir).filter((name) => !keep.has(name)).map((name) => join18(agentDir, name));
  for (const dir of removed) rmSync5(dir, { recursive: true, force: true });
  const previous = before !== null && existsSync14(join18(agentDir, before)) ? join18(agentDir, before) : null;
  return { current: next, previous, removed };
}

// src/core/ops/release-fetch.ts
import { existsSync as existsSync15, mkdirSync as mkdirSync6, rmSync as rmSync6 } from "node:fs";
import { join as join19 } from "node:path";
function failed(r) {
  if (r.exitCode === null && r.killed === null) return new CtxError("FETCH_FAILED", { code: GIT_NOT_STARTED });
  const status = r.killed ?? String(r.exitCode);
  return new CtxError("FETCH_FAILED", { code: GIT_EXIT_LABEL + status + UPGRADE_AREA_KEY_SEP + r.stderr.toString().trim() });
}
async function git2(bin, args, cwd, env, signal) {
  const r = await runProcess([bin, ...args], { cwd, env, signal, timeoutMs: UPGRADE_GIT_TIMEOUT_MS });
  if (r.exitCode !== 0 || r.killed !== null) throw failed(r);
  return r.stdout.toString().trim();
}
async function fetchRelease(agent, url2, env, signal, opts = {}) {
  const agentDir = join19(resolveConfigDir(env), DATA_PLUGINS_DIR_NAME, agent);
  mkdirSync6(agentDir, { recursive: true });
  const fetchDir = join19(agentDir, UPGRADE_FETCH_DIR_PREFIX + process.pid);
  rmSync6(fetchDir, { recursive: true, force: true });
  const gitBin = findRuntime(GIT_BIN, env);
  if (gitBin === null) throw new CtxError("FETCH_FAILED", { code: GIT_NOT_STARTED });
  const childEnv = buildChildEnv(env, { ...GIT_NO_PROMPT_ENV, ...GIT_NO_CRLF_ENV });
  try {
    await git2(gitBin, [...GIT_CLONE_ARGS, RELEASE_BRANCH, url2, fetchDir], agentDir, childEnv, signal);
    const sha = await git2(gitBin, GIT_HEAD_SHA_ARGS, fetchDir, childEnv, signal);
    const dir = join19(agentDir, sha);
    if (existsSync15(dir)) rmSync6(fetchDir, { recursive: true, force: true });
    else renameWithRetry(fetchDir, dir, opts);
    return { sha, dir };
  } catch (e) {
    rmSync6(fetchDir, { recursive: true, force: true });
    throw e;
  }
}

// src/core/ops/uninstall.ts
import { existsSync as existsSync16, readdirSync as readdirSync7, rmSync as rmSync7, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join20 } from "node:path";
function row2(area, before, after) {
  return { area, before, after };
}
function stopServers(configDir, projectKey) {
  const stopped = listLiveOwners(configDir, projectKey);
  const dir = join20(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME);
  for (const serverId of stopped) writeFileSync5(join20(dir, serverId + OWNER_STOP_EXT), "", "utf8");
  return stopped.length === 0 ? { row: row2(UPGRADE_SERVER_AREA, "", UPGRADE_NOT_FOUND), stopped } : { row: row2(UPGRADE_SERVER_AREA, UPGRADE_SERVER_RUNNING, UPGRADE_SERVER_STOPPED), stopped };
}
function rootOrNull(adapter, env) {
  try {
    return resolvePluginRoot(adapter, env);
  } catch (err) {
    if (err instanceof CtxError && err.code === "PLUGIN_ROOT_MISSING") return null;
    throw err;
  }
}
function removeCache(adapter, env, configDir) {
  switch (adapter.installMode) {
    case "marketplace":
    case "extension": {
      const root = rootOrNull(adapter, env);
      if (root === null) return row2(UPGRADE_CACHE_AREA, "", UPGRADE_NOT_FOUND);
      rmSync7(root, { recursive: true, force: true });
      return row2(UPGRADE_CACHE_AREA, root, UPGRADE_REMOVED);
    }
    case "plugin": {
      const agentDir = join20(configDir, DATA_PLUGINS_DIR_NAME, adapter.id);
      if (!existsSync16(agentDir)) return row2(UPGRADE_CACHE_AREA, "", UPGRADE_NOT_FOUND);
      rmSync7(agentDir, { recursive: true, force: true });
      return row2(UPGRADE_CACHE_AREA, agentDir, UPGRADE_REMOVED);
    }
    case "config-mcp":
    case "mcp-entry":
    case "hooks+mcp":
    case "in-process": {
      const root = rootOrNull(adapter, env);
      return row2(UPGRADE_CACHE_AREA, root ?? "", root === null ? UPGRADE_NOT_FOUND : UPGRADE_CACHE_BY_HAND);
    }
  }
}
function isObj2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function piSource(entry) {
  return isObj2(entry) ? entry[PI_PACKAGE_SOURCE_KEY] : entry;
}
function ownEntries(agent, env) {
  const home = requireHomeDir(env);
  const mcp = OWN_MCP_ENTRY[agent];
  if (mcp !== void 0) {
    const top = mcp.key[0];
    const inner = mcp.key.slice(1, -1);
    const own2 = mcp.key[mcp.key.length - 1];
    const holder = (v) => inner.reduce((cur, k) => isObj2(cur) ? cur[k] : void 0, v);
    const without = (v, path5) => {
      const o = v;
      if (path5.length === 0) return Object.fromEntries(Object.entries(o).filter(([k]) => k !== own2));
      return { ...o, [path5[0]]: without(o[path5[0]], path5.slice(1)) };
    };
    return [{
      file: ownMcpFileOf(agent, mcp.file, env, home),
      key: top,
      shown: mcp.key.join(V1_KEY_PATH_SEP),
      has: (v) => {
        const h = holder(v);
        return isObj2(h) && Object.hasOwn(h, own2);
      },
      drop: (v) => without(v, inner)
    }];
  }
  if (agent === "opencode") {
    return [{
      file: join20(opencodeDirOf(env, home), OPENCODE_BASE_CONFIG_FILE),
      // D-WIN-OPENCODE-DIR-1
      key: OPENCODE_PLUGIN_KEY,
      shown: OPENCODE_PLUGIN_KEY,
      has: (v) => Array.isArray(v) && v.includes(OPENCODE_GIT_SPEC),
      drop: (v) => v.filter((x) => x !== OPENCODE_GIT_SPEC)
    }];
  }
  if (agent === "pi") {
    const agentDir = piAgentDirOf(env, home);
    return [{
      file: join20(agentDir, SETTINGS_FILE),
      key: PI_PACKAGES_KEY,
      shown: PI_PACKAGES_KEY,
      has: (v) => Array.isArray(v) && v.some((x) => piSource(x) === PI_GIT_PACKAGE),
      drop: (v) => v.filter((x) => piSource(x) !== PI_GIT_PACKAGE)
    }];
  }
  return [];
}
function removeOwnEntries(agent, env) {
  const rows = [];
  for (const entry of ownEntries(agent, env)) {
    const current = readHostConfig(agent, entry.file);
    if (current.text === "") continue;
    const value = hostConfigValueAt(parseHostConfig(agent, current.path, current.text, current.format), [entry.key]);
    if (!entry.has(value)) continue;
    writeHostConfigEdit(entry.file, current, { [entry.key]: entry.drop(value) });
    rows.push(row2(current.path + UPGRADE_AREA_KEY_SEP + entry.shown, UPGRADE_OWN_ENTRY, UPGRADE_REMOVED));
  }
  return rows.length === 0 ? [row2(UPGRADE_CONFIG_AREA, "", UPGRADE_NOT_FOUND)] : rows;
}
function removeProjectData(configDir, projectKey) {
  const projects = join20(configDir, PROJECTS_DIR_NAME);
  const dir = join20(projects, projectKey);
  if (!existsSync16(dir)) return row2(UPGRADE_DATA_AREA, "", UPGRADE_NOT_FOUND);
  if (dir === projects || !isInside(projects, dir)) throw new CtxError("OUTSIDE_ROOT", { p: dir, root: projects });
  for (const name of readdirSync7(dir)) {
    if (name !== OWNERS_DIR_NAME) rmSync7(join20(dir, name), { recursive: true, force: true });
  }
  return row2(UPGRADE_DATA_AREA, dir, UPGRADE_DATA_DELETED);
}
function runUninstall(input) {
  const configDir = resolveConfigDir(input.env);
  const stop = stopServers(configDir, input.project.projectKey);
  const rows = [stop.row, removeCache(input.adapter, input.env, configDir), ...removeOwnEntries(input.adapter.id, input.env)];
  rows.push(input.confirmDelete ? removeProjectData(configDir, input.project.projectKey) : row2(UPGRADE_DATA_AREA, join20(configDir, PROJECTS_DIR_NAME, input.project.projectKey), UPGRADE_DATA_KEPT));
  return { rows, stopped: stop.stopped };
}

// src/core/ops/v1-remove.ts
import { copyFileSync as copyFileSync2, existsSync as existsSync17, readFileSync as readFileSync14, rmSync as rmSync8 } from "node:fs";
var isObj3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var areaOf = (f) => f.path === "" ? f.file : f.file + UPGRADE_AREA_KEY_SEP + f.path;
var row3 = (f, after) => ({ area: areaOf(f), before: f.reason, after });
function moveAside(target, undo) {
  const trash = target + UPGRADE_TRASH_SUFFIX;
  rmSync8(trash, { recursive: true, force: true });
  renameWithRetry(target, trash);
  undo.push({ trash, target });
}
function keepOriginal(file2, kept, undo) {
  if (kept.has(file2)) return;
  const trash = file2 + UPGRADE_TRASH_SUFFIX;
  rmSync8(trash, { recursive: true, force: true });
  copyFileSync2(file2, trash);
  kept.add(file2);
  undo.push({ trash, target: file2 });
}
function cutTomlTable(text, header) {
  let span;
  try {
    span = tomlTableSpans(text).find((t) => t.header.trim() === header);
  } catch {
    return null;
  }
  return span === void 0 ? null : text.slice(0, span.start) + text.slice(span.end);
}
function writeAtomic(file2, text) {
  atomicWriteFile(file2, text);
}
function locate(doc, path5) {
  const segs = path5.split(V1_KEY_PATH_SEP);
  let cur = doc;
  for (const seg of segs.slice(0, -1)) {
    if (Array.isArray(cur)) cur = cur[Number(seg)];
    else if (isObj3(cur)) cur = cur[seg];
    else return null;
  }
  const last2 = segs[segs.length - 1];
  if (Array.isArray(cur)) return Number(last2) < cur.length ? [cur, last2] : null;
  if (isObj3(cur)) return Object.hasOwn(cur, last2) ? [cur, last2] : null;
  return null;
}
function stripJsonEntries(agent, file2, findings, kept, undo) {
  const layout = hostLayout(readFileSync14(file2, "utf8"));
  const text = hostText(readFileSync14(file2, "utf8"));
  const doc = parseHostConfig(agent, file2, text, "jsonc");
  const hit = /* @__PURE__ */ new Set();
  const byContainer = /* @__PURE__ */ new Map();
  const topKeys = /* @__PURE__ */ new Set();
  for (const f of findings) {
    const at2 = locate(doc, f.path);
    if (at2 === null) continue;
    hit.add(f);
    topKeys.add(f.path.split(V1_KEY_PATH_SEP)[0]);
    const keys = byContainer.get(at2[0]) ?? /* @__PURE__ */ new Set();
    keys.add(at2[1]);
    byContainer.set(at2[0], keys);
  }
  if (hit.size === 0) return hit;
  for (const [container, keys] of byContainer) {
    if (Array.isArray(container)) {
      for (const i of [...keys].map(Number).sort((a, b) => b - a)) container.splice(i, 1);
    } else {
      for (const k of keys) delete container[k];
    }
  }
  const patch = {};
  for (const k of topKeys) patch[k] = doc[k];
  keepOriginal(file2, kept, undo);
  writeHostConfigEdit(file2, { agent, text, format: "jsonc", path: file2, layout }, patch);
  return hit;
}
function removeV1(agent, findings) {
  const undo = [];
  const kept = /* @__PURE__ */ new Set();
  const done = /* @__PURE__ */ new Map();
  const entries = /* @__PURE__ */ new Map();
  for (const f of findings) {
    if (UPGRADE_REPORT_ONLY_REASONS.includes(f.reason)) done.set(f, UPGRADE_REPORT_ONLY);
    else if (f.path === "") {
      if (existsSync17(f.file)) {
        moveAside(f.file, undo);
        done.set(f, UPGRADE_REMOVED);
      } else done.set(f, UPGRADE_NOT_FOUND);
    } else entries.set(f.file, [...entries.get(f.file) ?? [], f]);
  }
  for (const [file2, list3] of entries) {
    if (!existsSync17(file2)) {
      for (const f of list3) done.set(f, UPGRADE_NOT_FOUND);
      continue;
    }
    if (file2.endsWith(TOML_EXT)) {
      const rawToml = readFileSync14(file2, "utf8");
      const tomlLayout = hostLayout(rawToml);
      let text = hostText(rawToml);
      for (const f of list3) {
        const next = cutTomlTable(text, f.path);
        if (next === null) {
          done.set(f, UPGRADE_NOT_FOUND);
          continue;
        }
        text = next;
        done.set(f, UPGRADE_REMOVED);
      }
      if (list3.some((f) => done.get(f) === UPGRADE_REMOVED)) {
        keepOriginal(file2, kept, undo);
        writeAtomic(file2, withLayout(text, tomlLayout));
      }
      continue;
    }
    const hit = stripJsonEntries(agent, file2, list3, kept, undo);
    for (const f of list3) done.set(f, hit.has(f) ? UPGRADE_REMOVED : UPGRADE_NOT_FOUND);
  }
  return {
    rows: findings.map((f) => row3(f, done.get(f) ?? UPGRADE_NOT_FOUND)),
    commit() {
      for (const u of undo.splice(0)) rmSync8(u.trash, { recursive: true, force: true });
    },
    rollback() {
      for (const u of undo.splice(0).reverse()) {
        if (!existsSync17(u.trash)) continue;
        rmSync8(u.target, { recursive: true, force: true });
        renameWithRetry(u.trash, u.target);
      }
    }
  };
}

// src/core/ops/verify-sums.ts
import { createHash } from "node:crypto";
import { lstatSync as lstatSync2, readdirSync as readdirSync8, readFileSync as readFileSync15 } from "node:fs";
import { join as join21 } from "node:path";
function mismatch() {
  return new CtxError("BUNDLE_HASH_MISMATCH");
}
function parseSums(text) {
  const lines = text.split(SUMS_LINE_END);
  if (lines[lines.length - 1] === "") lines.pop();
  const sums = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const at2 = line.indexOf(SUMS_LINE_SEP);
    if (at2 < 0) throw mismatch();
    const rel = line.slice(at2 + SUMS_LINE_SEP.length);
    if (rel === "" || sums.has(rel)) throw mismatch();
    sums.set(rel, line.slice(0, at2));
  }
  return sums;
}
function walk(dir, prefix, out) {
  for (const entry of readdirSync8(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : prefix + "/" + entry.name;
    if (prefix === "" && (entry.name === GIT_DIR_NAME || entry.name === RELEASE_SUMS_FILE)) continue;
    const abs = join21(dir, entry.name);
    if (entry.isDirectory()) walk(abs, rel, out);
    else if (entry.isFile()) out.set(rel, abs);
    else throw mismatch();
  }
}
function verifySums(dir) {
  const sumsPath = join21(dir, RELEASE_SUMS_FILE);
  const sumsStat = lstatSync2(sumsPath, { throwIfNoEntry: false });
  if (sumsStat === void 0 || !sumsStat.isFile()) throw mismatch();
  const sums = parseSums(readFileSync15(sumsPath, "utf8"));
  const files = /* @__PURE__ */ new Map();
  walk(dir, "", files);
  if (files.size !== sums.size) throw mismatch();
  for (const [rel, abs] of files) {
    const want = sums.get(rel);
    if (want === void 0) throw mismatch();
    const got = createHash(SUMS_HASH_ALGORITHM).update(readFileSync15(abs)).digest(HASH_ENCODING);
    if (got !== want) throw mismatch();
  }
}

// src/core/tools/upgrade.ts
var ctxUpgradeSchema = external_exports.object({
  mode: external_exports.enum(UPGRADE_MODES).optional(),
  confirmDelete: external_exports.boolean().optional()
}, { error: unknownField }).strict();
function row4(area, before, after) {
  return { area, before, after };
}
function bundleDir() {
  return dirname10(process.argv[1] ?? "");
}
function pluginRootRow(adapter, env) {
  const own2 = bundleDir();
  let root;
  try {
    root = resolvePluginRoot(adapter, env);
  } catch (err) {
    if (err instanceof CtxError && err.code === "PLUGIN_ROOT_MISSING") return [row4(UPGRADE_PLUGIN_ROOT_AREA, UPGRADE_NOT_FOUND, own2)];
    throw err;
  }
  return root === own2 ? [] : [row4(UPGRADE_PLUGIN_ROOT_AREA, root, own2)];
}
function isCurrent(agentDir, dir) {
  const link = join22(agentDir, PLUGIN_CURRENT_LINK);
  return existsSync18(link) && realpathSync7.native(link) === realpathSync7.native(dir);
}
async function checkout(adapter, deps) {
  const fetched = await fetchRelease(adapter.id, deps.releaseUrl, deps.env, deps.signal);
  const agentDir = dirname10(fetched.dir);
  try {
    verifySums(fetched.dir);
  } catch (err) {
    if (!isCurrent(agentDir, fetched.dir)) rmSync9(fetched.dir, { recursive: true, force: true });
    throw err;
  }
  const swap = swapPluginCurrent(agentDir, fetched.sha);
  const rows = [row4(UPGRADE_CHECKOUT_AREA, swap.previous ?? "", swap.current)];
  for (const dir of swap.removed) rows.push(row4(UPGRADE_CACHE_AREA, dir, UPGRADE_REMOVED));
  return { rows, agentDir, swap };
}
function hostRow(adapter) {
  return row4(UPGRADE_HOST_AREA, "", UPGRADE_HOST_COMMAND[adapter.id] ?? UPGRADE_HOST_MANUAL);
}
async function upgrade(adapter, deps, home) {
  let done = null;
  let removal = null;
  try {
    const step4 = UPGRADE_GIT_CHECKOUT_AGENTS.includes(adapter.id) ? (done = await checkout(adapter, deps)).rows : [hostRow(adapter)];
    const step5 = regenerateHostConfig(adapter, home, { env: deps.env, write: deps.write });
    const findings = detectV1(adapter.id, home, { project: deps.project.worktree, piAgentDir: piAgentDirOf(deps.env, home), claudeDir: claudeDirOf(deps.env, home), copilotDir: copilotDirOf(deps.env, home), kiroDir: kiroDirOf(deps.env, home), opencodeDir: opencodeDirOf(deps.env, home) });
    removal = removeV1(adapter.id, findings);
    const rows = [...step4, ...step5, ...removal.rows];
    removal.commit();
    return rows;
  } catch (err) {
    removal?.rollback();
    if (done !== null && done.swap.previous !== null) swapPluginCurrent(done.agentDir, basename5(done.swap.previous));
    throw err;
  }
}
function cell3(text) {
  return text.split(TABLE_PIPE).join(TABLE_PIPE_ESCAPED);
}
function renderTable(rows) {
  const lines = [UPGRADE_TABLE_HEADER, UPGRADE_TABLE_RULE];
  for (const r of rows) lines.push(TABLE_ROW_START + [r.area, r.before, r.after].map(cell3).join(TABLE_CELL_SEP) + TABLE_ROW_END);
  return lines.join("\n");
}
async function runUpgrade(input, deps) {
  const adapter = getAdapter(deps.project.agent);
  const home = requireHomeDir(deps.env);
  const rows = pluginRootRow(adapter, deps.env);
  if ((input.mode ?? UPGRADE_DEFAULT_MODE) === "uninstall") {
    const result = runUninstall({ adapter, project: deps.project, env: deps.env, confirmDelete: input.confirmDelete === true });
    rows.push(...result.rows);
  } else {
    rows.push(...await upgrade(adapter, deps, home));
  }
  return { text: renderTable(rows) + "\n\n" + UPGRADE_RESTART_LINE, isError: false, sandboxBytes: 0 };
}
async function handler8(input, ctx) {
  return runUpgrade(input, { project: ctx.project, env: process.env, signal: ctx.signal, releaseUrl: RELEASE_REPO_URL });
}
var ctxUpgrade = Object.freeze({
  name: "ctx_upgrade",
  description: "",
  schema: ctxUpgradeSchema,
  readOnly: false,
  alwaysLoad: false,
  handler: handler8
});

// src/core/tools/registry.ts
var READ_ONLY = /* @__PURE__ */ new Set(["ctx_search", "ctx_resume", "ctx_stats"]);
var ALWAYS_LOAD = /* @__PURE__ */ new Set(["ctx_execute"]);
var BUILT = Object.freeze({
  ctx_execute: ctxExecute,
  ctx_batch: ctxBatch,
  ctx_index: ctxIndex,
  ctx_search: ctxSearch,
  ctx_resume: ctxResume,
  // D-M4-arch-3: handler (input, ctx), session from ctx.sessionId
  ctx_stats: ctxStats,
  ctx_doctor: ctxDoctor,
  // D-M5-arch-6
  ctx_upgrade: ctxUpgrade,
  // D-M5-arch-6
  ctx_purge: ctxPurge
});
function define(name) {
  const built = BUILT[name];
  return {
    name,
    description: TOOL_DESCRIPTIONS[name],
    schema: built.schema,
    readOnly: READ_ONLY.has(name),
    alwaysLoad: ALWAYS_LOAD.has(name),
    handler: built.handler
  };
}
var TOOLS = Object.freeze(TOOL_ORDER.map(define));

// src/entries/opencode.ts
var AGENT = "opencode";
var id = PLUGIN_ID;
async function setup(app) {
  const cwd = app.directory;
  const env = process.env;
  const turns = /* @__PURE__ */ new Map();
  const payloads = /* @__PURE__ */ new Map();
  const call = (raw) => handleHook(AGENT, { ...raw, directory: cwd }, env);
  const turnOf = (sessionId) => turns.get(sessionId) ?? 0;
  function payloadFor(sessionId) {
    let p = payloads.get(sessionId);
    if (p === void 0) {
      p = call({ type: "context", sessionID: sessionId, turn: turnOf(sessionId) }).then((out) => [out.stdout, INSTRUCTIONS].filter((s) => s !== "").join("\n\n"));
      payloads.set(sessionId, p);
    }
    return p;
  }
  const journal = ownJournal();
  function project() {
    return resolveProject(AGENT, { env, argv: process.argv, cwd: cwd ?? "" });
  }
  for (const tool of TOOLS) {
    app.tool(tool.name, {
      description: tool.description,
      args: tool.schema,
      async execute(args, toolCtx) {
        const parsed = tool.schema.safeParse(args);
        if (!parsed.success) return parsed.error.message;
        const sessionId = toolCtx.sessionID ?? "";
        let resolved;
        const ctx = {
          get project() {
            resolved ??= project();
            return resolved;
          },
          sessionId,
          turn: turnOf(sessionId),
          signal: toolCtx.abort ?? new AbortController().signal,
          protocolVersion: ""
        };
        let reply4;
        try {
          reply4 = await tool.handler(parsed.data, ctx);
        } catch (err) {
          return err instanceof CtxError ? err.toLine() : INTERNAL_ERROR_LINE;
        }
        if (resolved !== void 0) await journal(resolved, ctx, tool.name, reply4);
        return reply4.text;
      }
    });
  }
  return {
    // UserPromptSubmit; also the turn counter step-finish and tool calls read (D-M5-P2-2).
    "chat.message": async (input, output) => {
      const sessionId = input.sessionID ?? "";
      turns.set(sessionId, turnOf(sessionId) + 1);
      const message3 = (output.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
      await call({ type: "prompt", sessionID: sessionId, message: message3, turn: turnOf(sessionId) });
    },
    // §4.4. Deny (exit 2) throws with the reason; the reason carries any rewritten command (Q3, D-M5-P2-3).
    "tool.execute.before": async (input, output) => {
      const sessionId = input.sessionID ?? "";
      await payloadFor(sessionId);
      const out = await call({
        type: "execute.before",
        sessionID: sessionId,
        tool: input.tool,
        callID: input.callID,
        args: output.args,
        turn: turnOf(sessionId)
      });
      if (out.exitCode === 2) throw new Error(out.stdout);
    },
    // §4.5. OpenCode's encode has no replace field (impl/10 §11), so output.output is never changed here.
    "tool.execute.after": async (input, output) => {
      const sessionId = input.sessionID ?? "";
      await payloadFor(sessionId);
      await call({
        type: "execute.after",
        sessionID: sessionId,
        tool: input.tool,
        callID: input.callID,
        args: input.args,
        output: output.output,
        turn: turnOf(sessionId)
      });
    },
    // §4.6: one system entry per session, the same bytes on every request (#1085, Q12). A second
    // transform on the same array finds the entry and adds nothing.
    "experimental.chat.system.transform": async (input, output) => {
      const payload = await payloadFor(input.sessionID ?? "");
      if (!output.system.includes(payload)) output.system.push(payload);
    },
    // PreCompact: handleHook sets the pending-compact marker the next session payload reads (§4.6 step 2).
    "experimental.session.compacting": async (input) => {
      const sessionId = input.sessionID ?? "";
      await call({ type: "compaction", sessionID: sessionId, turn: turnOf(sessionId) });
    },
    // step-finish is the Usage event (D-M5-arch-2): one cost row per (session, turn), deduped by the store.
    event: async ({ event }) => {
      const part = event.properties?.part;
      if (event.type !== "message.part.updated" || part?.type !== "step-finish") return;
      const sessionId = part.sessionID ?? "";
      await call({ type: "step-finish", sessionID: sessionId, turn: turnOf(sessionId) });
    }
  };
}
async function server(input, _options) {
  const tool = {};
  const hooks = await setup({
    directory: input.directory,
    tool(name, def) {
      const shape = def.args.shape;
      tool[name] = { ...def, args: shape ?? {} };
    }
  });
  return { ...hooks, tool };
}
var opencode_default = { id: PLUGIN_ID, server, setup };
export {
  opencode_default as default,
  id,
  server,
  setup
};
