import{createRequire as __cmRequire}from"node:module";if(typeof process.getBuiltinModule!=="function")process.getBuiltinModule=(id)=>__cmRequire(import.meta.url)(id);

// src/entries/run.ts
import { basename as basename2 } from "node:path";

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
var INDEX_WRITE_CHUNK = 1048576;
var MAX_CHUNK_BYTES = 4096;
var WEIGHT = Object.freeze({ toolerr: 900, decision: 700, prompt: 500, edit: 400, index: 200 });
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
var EXEC_TIMEOUT_MS = 6e5;
var KILL_GRACE_MS = 1e3;
var DB_TIMEOUT_MS = 5e3;
var DB_WAL_SUFFIX = "-wal";
var DB_SHM_SUFFIX = "-shm";
var DB_TMP_SUFFIX = ".tmp";
var SQLITE_PRIMARY_CODE_MASK = 255;
var SQLITE_CORRUPT_CODE = 11;
var SQLITE_NOTADB_CODE = 26;
var HOOK_TIMEOUT_MS = 5e3;
var IN_PROCESS_TIMEOUT_MS = 0;
var PROJECT_KEY_HEX_LEN = 16;
var SCHEMA_VERSION = 5;
var PROJECTS_DIR_NAME = "projects";
var DB_FILE_NAME = "context.db";
var GIT_DIR_NAME = ".git";
var GIT_WORKTREE_LINE_PREFIX = "worktree ";
var GITDIR_FILE_PREFIX = "gitdir: ";
var GIT_COMMONDIR_FILE = "commondir";
var GIT_HEAD_FILE = "HEAD";
var WORKSPACE_FOLDER_FLAG = "--workspace-folder";
var EXEC_LANGUAGES = Object.freeze(["shell", "powershell", "javascript", "typescript", "python"]);
var PATHEXT_DEFAULT = ".COM;.EXE;.BAT;.CMD";
var SOURCE_LABEL_MAX_CHARS = 80;
var PLAIN_OUTPUT_ENV = Object.freeze({ NO_COLOR: "1", FORCE_COLOR: "0" });
var RUN_USAGE_LINE = "Usage: run.mjs <base64>";
var SEARCH_USAGE_LINE = "Usage: search.mjs <source-id> <terms>";
var RUN_FAIL_EXIT = 1;
var RUN_TIMEOUT_EXIT = 124;
var RUN_LABEL_PREFIX = "run.mjs:";
var RUN_MORE_PREFIX = "more: node ";
var SEARCH_WRAPPER_FILE = "search.mjs";
var RUN_WRAPPER_AGENT = "claude-code";
var RUN_SESSION_PREFIX = "mcp:";
var HOST_SESSION_ENV = Object.freeze({ "claude-code": "CLAUDE_CODE_SESSION_ID" });
var NODE_MIN = "24.15.0";
var DATA_ROOT = "~/.context-mode";
var REQUIRE_SECURITY_ENV = "CONTEXT_MODE_REQUIRE_SECURITY";
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
var HOOK_FAIL_TOOL_KEYS = Object.freeze(["tool_name", "toolName", "tool"]);
var HOOK_FAIL_EVENT_KEYS = Object.freeze(["hook_event_name", "hookEventName", "type"]);
var HOOK_FAIL_INPUT_KEYS = Object.freeze(["tool_input", "toolArgs", "input", "args"]);
var HOOK_FAIL_CWD_KEYS = Object.freeze(["cwd", "directory"]);
var HOOK_FAIL_PRE_EVENTS = Object.freeze(["pretooluse", "beforetool", "tool_call", "execute.before", "tool.execute.before"]);
var HOOK_FAULT_STAGES = Object.freeze(["decode", "project", "policy", "store", "encode"]);
var HOOK_FAIL_TOOLS = Object.freeze({
  shell: Object.freeze(["Bash", "bash", "shell"]),
  read: Object.freeze(["Read", "read_file"]),
  grep: Object.freeze(["Grep", "grep_search"]),
  fetch: Object.freeze(["WebFetch", "web_fetch", "fetch"])
});
var HOOK_FAIL_REDIRECT = Object.freeze({
  read: "Read the file in parts with offset and limit, or process it with ctx_execute(language, code); only what you print comes back.",
  shell: "Run the command with ctx_execute(language, code) or ctx_batch instead; only the part that matches your intent comes back.",
  grep: "Search with ctx_execute(language, code), or index the files with ctx_index and query them with ctx_search.",
  fetch: "Index the URL with ctx_index and query it with ctx_search."
});
var BOUNDED_COMMANDS = Object.freeze(["pwd", "whoami", "uname", "id", "realpath", "ln"]);
var BOUNDED_GIT_SUBCOMMANDS = Object.freeze(["status"]);
var VERSION_PROBE_FLAGS = Object.freeze(["--version", "-v"]);
var BOUNDED_UNLESS_VERBOSE = Object.freeze(["cp", "mv", "rm"]);
var VERBOSE_FLAGS = Object.freeze(["-v", "--verbose"]);
var JQ_WHITELIST = Object.freeze({ identity: ".", length: "length", pipeLength: "| length", fieldSep: "." });
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
var EDIT_TOOLS = Object.freeze(["Write", "Edit"]);
var EDIT_PATH_KEYS = Object.freeze(["file_path", "path"]);
var STATS_COLUMNS = Object.freeze(["Scope", "Produced", "Returned", "Saved", "Reduction %"]);
var PURGE_SCOPES = Object.freeze(["session", "source", "project"]);
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
var ECHO_MAX_BYTES = 256;
var REPORT_SOURCE_LABEL = "ctx_doctor:report";
var REPORT_POINTER = `ctx_search({queries:["FAIL","PASS","UNKNOWN"], source:${JSON.stringify(REPORT_SOURCE_LABEL)}})`;
var D2_NODE_FIX = `install Node ${NODE_MIN} or later`;
var D3_PARTS = Object.freeze(["MCP entry", "hook entries", "hook timeout"]);
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
var UPGRADE_MODES = Object.freeze(["upgrade", "uninstall"]);
var GIT_CLONE_ARGS = Object.freeze(["clone", "--depth", "1", "--branch"]);
var GIT_HEAD_SHA_ARGS = Object.freeze(["rev-parse", "HEAD"]);
var UPGRADE_GIT_CHECKOUT_AGENTS = Object.freeze(["pi", "opencode"]);
var GIT_NO_PROMPT_ENV = Object.freeze({ GIT_TERMINAL_PROMPT: "0" });
var GIT_NO_CRLF_ENV = Object.freeze({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" });
var GIT_BIN = "git";
var WIN_SHELL_LANGS = Object.freeze(["shell", "bash", "sh"]);
var GIT_BASH_RELATIVE = Object.freeze([["..", "bin", "bash.exe"], ["..", "..", "bin", "bash.exe"]]);
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
var KIRO_TOOL_MATCHERS = Object.freeze([["@mcp", "mcp"], ["shell", "shell"]]);
var CODEX_FEATURES_HOOKS_KEY = Object.freeze(["features", "hooks"]);
var DB_SIBLING_SUFFIXES = Object.freeze(["", DB_WAL_SUFFIX, DB_SHM_SUFFIX]);
var UPGRADE_HOST_COMMAND = Object.freeze({
  "claude-code": "claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode",
  codex: "rewrite config.toml's [mcp_servers.context-mode*] block to the v2 entry, then restart Codex",
  gemini: "gemini extensions install https://github.com/mksglu/context-mode --ref release --auto-update",
  qwen: "qwen extensions install https://github.com/mksglu/context-mode --ref release --auto-update"
});
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
var V1_CODEX_HOOKS_DIR = Object.freeze(["hooks", "codex"]);
var V1_CACHE_HEAL_EXTS = Object.freeze([".mjs", ".sh"]);
var VSCODE_USER_DIR_SEGMENTS = Object.freeze(["Code", "User"]);
var VSCODE_MCP_FILE = "mcp.json";
var KIRO_AGENT_FILE = Object.freeze(["agents", "default.json"]);
var KIRO_STEERING_FILE = Object.freeze(["steering", "KIRO.md"]);
var OPENCODE_CONFIG_FILES = Object.freeze(["opencode.jsonc", "opencode.json"]);
var V1_DATA_ROOT_ENTRIES = Object.freeze(["content", "platform.json"]);
var PI_ROLE = "custom";
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
var OPENCODE_TOOL_PREFIX = SERVER_KEY + "_";
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
var REPORT_ENV_ENUMS = Object.freeze({
  NODE_ENV: Object.freeze(["development", "production", "test"])
});

// src/core/tools/run-wrapper.ts
import { randomUUID } from "node:crypto";
import { dirname as dirname3, join as join5 } from "node:path";

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
  const sep3 = rest.indexOf(MCP_SEP);
  if (sep3 < 0) return name;
  return "mcp:" + rest.slice(0, sep3) + ":" + rest.slice(sep3 + MCP_SEP.length);
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
  const server = own(m, "server_name");
  const tool = own(m, "tool_name");
  if (typeof server !== "string" || typeof tool !== "string") return name;
  return "mcp:" + server + ":" + tool;
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
    const error = raw.error;
    const text = typeof error === "string" ? error : error === void 0 ? "" : JSON.stringify(error);
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
  const sep3 = rest.indexOf(MCP_SEP2);
  if (sep3 <= 0 || sep3 === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep3) + ":" + rest.slice(sep3 + MCP_SEP2.length);
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
  const sep3 = rest.indexOf(MCP_SEP3);
  if (sep3 <= 0 || sep3 === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep3) + ":" + rest.slice(sep3 + MCP_SEP3.length);
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
  const row = Object.prototype.hasOwnProperty.call(PI_EVENTS, native) ? PI_EVENTS[native] : void 0;
  if (row === void 0) throw new Error("pi: unknown hook event " + String(p.type));
  const ev = { event: row.event, agent: "pi", sessionId: String(p.sessionId ?? ""), cwd: String(p.cwd ?? "") };
  if (row.source !== void 0) ev.source = row.source;
  if (row.event === "UserPromptSubmit" && typeof p.message === "string") ev.prompt = p.message;
  if (row.event === "PreToolUse" || row.event === "PostToolUse") {
    const name = String(p.toolName ?? "");
    ev.tool = { name, canonicalName: Object.hasOwn(NATIVE_TO_CANONICAL6, name) ? NATIVE_TO_CANONICAL6[name] : name, input: record(p.input) };
    if (typeof p.toolCallId === "string") ev.tool.callId = p.toolCallId;
  }
  if (row.event === "PostToolUse") ev.result = readResult6(p);
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
function hasReplace(row) {
  return REPLACE_ROWS.has(row.id);
}
var DUMP_REPLACE_ROWS = /* @__PURE__ */ new Set(["claude-code", "copilot-cli", "pi"]);
function dumpRunsThenReplaces(row) {
  return DUMP_REPLACE_ROWS.has(row.id) && hasReplace(row);
}
function getAdapter(id) {
  return BY_ID.get(id);
}

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
var { existsSync, linkSync, mkdirSync, rmSync } = process.getBuiltinModule("node:fs");
function versionParts(v) {
  const bare = v.startsWith("v") ? v.slice(1) : v;
  return bare.split(".").map((p) => Number.parseInt(p, 10));
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
  const row = raw.prepare("PRAGMA user_version").get();
  return row.user_version;
}
function createAtomically(sqlite, path3) {
  const { randomUUID: randomUUID2 } = process.getBuiltinModule("node:crypto");
  const tmp = path3 + "." + randomUUID2() + DB_TMP_SUFFIX;
  try {
    const raw = new sqlite.DatabaseSync(tmp, { timeout: DB_TIMEOUT_MS });
    try {
      applyMigrations(raw, readUserVersion(raw));
    } finally {
      raw.close();
    }
    try {
      linkSync(tmp, path3);
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  } finally {
    for (const suffix of ["", DB_WAL_SUFFIX, DB_SHM_SUFFIX]) rmSync(tmp + suffix, { force: true });
  }
}
function openWritable(sqlite, path3) {
  let raw = null;
  try {
    if (!existsSync(path3)) createAtomically(sqlite, path3);
    raw = new sqlite.DatabaseSync(path3, { timeout: DB_TIMEOUT_MS });
    applyMigrations(raw, readUserVersion(raw));
    return raw;
  } catch (err) {
    if (raw) raw.close();
    throw err;
  }
}
function openReadOnly(sqlite, path3) {
  const raw = new sqlite.DatabaseSync(path3, { timeout: DB_TIMEOUT_MS, readOnly: true });
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
  mkdirSync(project.projectDir, { recursive: true });
  const path3 = project.dbPath;
  const sibling = existsSync(path3 + DB_WAL_SUFFIX) || existsSync(path3 + DB_SHM_SUFFIX);
  if (sibling && !existsSync(path3)) {
    throw new CtxError("DB_GONE");
  }
  try {
    let raw;
    if (opts?.readOnly === true) {
      if (!existsSync(path3)) openWritable(sqlite, path3).close();
      raw = openReadOnly(sqlite, path3);
    } else {
      raw = openWritable(sqlite, path3);
    }
    return { raw, projectKey: project.projectKey, path: path3, ...opts?.readOnly === true ? { readOnly: true } : {} };
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
var TRI_RANK = `
SELECT t.rowid AS rid, c.source_id AS source_id, c.session_id AS session_id, c.worktree AS worktree, c.ord AS ord
FROM chunks_tri t JOIN chunks c ON c.rowid = t.rowid JOIN sources s ON s.id = c.source_id
WHERE chunks_tri MATCH :match
  AND (:scope <> 'session' OR c.session_id = :session_id)
  AND (:scope <> 'worktree' OR c.worktree = :worktree)
  AND (:source IS NULL OR s.label = :source)
ORDER BY bm25(chunks_tri, 1.0, ${TITLE_WEIGHT}) ASC, c.source_id DESC, c.ord ASC`;
var INSERT_TRI = "INSERT INTO chunks_tri(rowid, body, title) VALUES (?, ?, ?)";
function ftsInsert(db, src, chunks) {
  const id = reserveSource(db, src, chunks);
  insertChunks(db, id, src, chunks);
  return id;
}
function reserveSource(db, src, chunks) {
  let total = 0;
  for (const c of chunks) total += c.bytes;
  return withWrite(db, (h) => {
    const row = h.raw.prepare(INSERT_SOURCE).get({
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
    return Number(row.id);
  });
}
function insertChunks(db, id, src, chunks) {
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
        const rid = ins.run(id, src.sessionId, src.worktree, src.agent, c.ord, c.text, title).lastInsertRowid;
        tri.run(rid, c.text, title);
      }
    });
  }
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
var TL_MORE = `
SELECT EXISTS(SELECT 1 FROM events WHERE created_at > :after${TL_SCOPE} AND (:source IS NULL OR kind = :source))
    OR EXISTS(SELECT 1 FROM sources WHERE created_ts > :after${TL_SCOPE} AND (:source IS NULL OR label = :source)
                 AND label <> :reserved) AS more`;
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

// src/core/index/select.ts
var READ_CHUNKS = "SELECT ord, body FROM chunks WHERE source_id = ?";
var READ_LABEL = "SELECT label FROM sources WHERE id = ?";
var SEP = "\n";
var SEP_BYTES = 1;
function selectChunks(db, sourceId, intent, budget) {
  const rows = db.raw.prepare(READ_CHUNKS).all(sourceId);
  if (rows.length === 0) return { text: "", more: null };
  const chunks = rows.map((r) => ({ ord: Number(r.ord), text: r.body, bytes: Buffer.byteLength(r.body, "utf8") }));
  const row = db.raw.prepare(READ_LABEL).get(sourceId);
  return select(chunks, intent, budget, row?.label);
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
  return { text, more: skipped ? moreLine(intent, label) : null };
}
function moreLine(intent, label) {
  const source = label === void 0 ? "" : ", source:" + JSON.stringify(label);
  const query = Buffer.byteLength(intent, "utf8") > ECHO_MAX_BYTES ? "..." : JSON.stringify(intent);
  return "ctx_search({queries:[" + query + "]" + source + "})";
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
  let last = EMPTY3();
  while (p.err === null) {
    last = element(p);
    all.push(...last.cmds);
    const t = at(p);
    if (t !== void 0 && t.kind === "op" && PIPES.includes(t.text)) {
      for (const c of last.cmds) c.pipesOut = true;
      p.i++;
      continue;
    }
    break;
  }
  if (last.simple !== null && isBoundedSink(last.simple)) for (const c of all) c.endsInBoundedSink = true;
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

// src/core/project/config-dir.ts
import { join, posix, win32 } from "node:path";
var { mkdirSync: mkdirSync2, realpathSync } = process.getBuiltinModule("node:fs");
function homeDirOf(env, platform = process.platform) {
  const set = (v) => v !== void 0 && v !== "";
  if (platform === "win32") {
    if (set(env.USERPROFILE)) return env.USERPROFILE;
    if (set(env.HOMEDRIVE) && set(env.HOMEPATH)) return env.HOMEDRIVE + env.HOMEPATH;
    return set(env.HOME) ? env.HOME : null;
  }
  if (set(env.HOME)) return env.HOME;
  return set(env.USERPROFILE) ? env.USERPROFILE : null;
}
function requireHomeDir(env, platform = process.platform) {
  const home = homeDirOf(env, platform);
  if (home !== null) return home;
  throw new CtxError("NO_HOME", { name: platform === "win32" ? "USERPROFILE" : "HOME" });
}
function resolveConfigDir(env) {
  const dir = join(requireHomeDir(env), DATA_ROOT.slice(1));
  mkdirSync2(dir, { recursive: true });
  return realpathSync.native(dir);
}

// src/core/policy/subagent.ts
var { readFileSync } = process.getBuiltinModule("node:fs");
function isSubagentCall(ev) {
  return ev.agentId !== void 0 && ev.agentId !== "";
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
var BASH_TOOL = "Bash";
var READ_TOOL = "Read";
var PREFIX_RULE = ":*";
var ABS_ANCHOR = "//";
var HOME_ANCHOR = "~/";
var PROJECT_ANCHOR = "./";
var PARENT = "..";
var WHITESPACE = " 	\n\r";
var BASH_SUBJECT = Object.freeze({ tool: BASH_TOOL });
function tokenize(glob, path3) {
  const toks = [];
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*" && path3 && glob[i + 1] === "*") {
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
function globMatch(glob, text, path3) {
  const toks = tokenize(glob, path3);
  const n = text.length;
  let next = new Uint8Array(n + 1);
  next[n] = 1;
  for (let i = toks.length - 1; i >= 0; i--) {
    const tok = toks[i];
    const cur = new Uint8Array(n + 1);
    let acc = 0;
    for (let j = n; j >= 0; j--) {
      const has2 = j < n;
      const ch = has2 ? text[j] : "";
      switch (tok.t) {
        case "lit":
          cur[j] = has2 && ch === tok.c ? next[j + 1] : 0;
          break;
        case "any1":
          cur[j] = has2 && !(path3 && ch === "/") ? next[j + 1] : 0;
          break;
        case "star":
          cur[j] = next[j] || (has2 && !(path3 && ch === "/") ? cur[j + 1] : 0);
          break;
        case "globstar":
          cur[j] = next[j] || (has2 ? cur[j + 1] : 0);
          break;
        case "globstarDir":
          if (has2 && ch === "/" && next[j + 1]) acc = 1;
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
function READ_DENY_MESSAGE(path3, size, prefix = "") {
  return prefixToolNames(READ_DENY_TEMPLATE, prefix).split(SIZE).join(String(size)).split(PATH).join(path3);
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
var has = (list2, v) => list2.includes(v);
function decide(ev, row, userDeny) {
  const tool = ev.tool;
  if (tool === void 0) return ALLOW;
  const canonical = tool.canonicalName;
  const input = tool.input;
  let rules;
  if (userDeny === null) {
    if (process.env[REQUIRE_SECURITY_ENV] === FLAG_ON) return deny(prefixToolNames(POLICY_UNREADABLE_LINE, row.toolNamePrefix));
    process.stderr.write(POLICY_UNREADABLE_WARNING + "\n");
    rules = [];
  } else rules = userDeny;
  const hit = userDenyHit(canonical, input, ev.cwd, rules);
  if (hit !== null) return deny(USER_DENY_REASON_PREFIX + hit);
  if (canonical === WEBFETCH) return webFetch(input, row);
  if (canonical === BASH) return bash(ev, row, input, rules);
  if (canonical === READ) return read(ev, row, input);
  return ALLOW;
}
function denyMessage(kind, match, row, intent) {
  const web = kind === "webfetch";
  const tool = web ? DENY_WEBFETCH_TOOLS.map((t) => row.toolNamePrefix + t).join(DENY_WEBFETCH_JOIN) : row.toolNamePrefix + DENY_EXEC_TOOL;
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
    const file = str(input.file);
    const byFile = file === void 0 || file === "" ? null : readRule(file);
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
function neverDenied(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return NEVER_DENY_HOSTS.some((h) => host === h || host.endsWith(HOST_SEP + h));
}
function webFetch(input, row) {
  const url = str(input.url) ?? "";
  return neverDenied(url) ? ALLOW : deny(denyMessage("webfetch", url, row));
}
function bash(ev, row, input, rules) {
  const cmd = str(input.command) ?? "";
  const parsed = parseShell(cmd);
  if (!parsed.ok) return couldMatch(cmd, rules) ? deny(prefixToolNames(PARSE_ERROR_DENY_LINE, row.toolNamePrefix)) : ALLOW;
  const cmds = unwrap(parsed.commands);
  for (const c of cmds) {
    const h = segmentHit(c, rules);
    if (h !== null) return deny(USER_DENY_REASON_PREFIX + h);
  }
  if (!hasReplace(row) || isSubagentCall(ev)) {
    for (const c of cmds) {
      const kind = denyKind(c);
      if (kind !== null) return deny(denyMessage(kind, cmd, row, str(input.description)));
    }
  }
  return shellDump(cmds, ev.cwd, row) ?? ALLOW;
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
function read(ev, row, input) {
  if (!present(input.offset) && !present(input.limit)) {
    const p = readPath(input);
    if (p !== void 0) {
      const abs = resolve(ev.cwd, p);
      const size = fileSize(abs);
      if (size > OUTPUT_CAP) return deny(READ_DENY_MESSAGE(abs, size, row.toolNamePrefix));
    }
  }
  return ALLOW;
}
function shellDump(cmds, cwd, row) {
  if (row.nativeTools.read !== void 0 && row.nativeTools.read.length > 0 && dumpRunsThenReplaces(row)) return null;
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
    if (size > OUTPUT_CAP) return deny(READ_DENY_MESSAGE(abs, size, row.toolNamePrefix));
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
var { existsSync: existsSync2, readFileSync: readFileSync3, realpathSync: realpathSync3, statSync: statSync2 } = process.getBuiltinModule("node:fs");
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
  return existsSync2(join4(gitDir, GIT_HEAD_FILE)) ? gitDir : null;
}
function firstLine(file) {
  let text;
  try {
    text = readFileSync3(file, "utf8");
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
      for (const file of fileNames(name, pathExt)) {
        const full = path.join(dir, file);
        if (!isRunnable(full)) continue;
        if (!isWin() || path.extname(full) !== "") return full;
        if (shim === null) shim = full;
      }
    }
  }
  return shim;
}
function findGitBash(env) {
  const git2 = findRuntime(GIT_BIN, env);
  if (git2 === null) return null;
  for (const rel of GIT_BASH_RELATIVE) {
    const full = path.resolve(path.dirname(git2), ...rel);
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
  return new Promise((resolve3) => {
    const isWin2 = process.platform === "win32";
    const start = startArgv(argv);
    if (start === null) return resolve3(NOT_STARTED);
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
      return resolve3(NOT_STARTED);
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
      resolve3({
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
  const push2 = (text, bytes2) => {
    out.push({ ord: out.length, text, bytes: bytes2, title });
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
function merge(src, blocks, join6, cap, lineCut) {
  const out = [];
  const scratch = new Uint8Array(cap);
  let wide;
  let cur;
  let curBytes = 0;
  const emit = (start, end, bytes2) => {
    out.push({ ord: out.length, text: src.slice(start, end), bytes: bytes2 });
  };
  for (const b of blocks) {
    if (cur !== void 0 && !join6) {
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
    let bytes2 = utf8Bytes(src.slice(b.start, b.end));
    while (bytes2 > cap) {
      const cut = cutPoint(src, start, b.end, scratch);
      const nl = lineCut ? src.lastIndexOf("\n", cut.end - 1) : -1;
      if (nl > start) {
        const w = utf8Bytes(src.slice(start, nl + 1));
        emit(start, nl + 1, w);
        start = nl + 1;
        bytes2 -= w;
        continue;
      }
      if (lineCut) {
        const eol = src.indexOf("\n", start);
        const lineEnd = eol < 0 || eol >= b.end ? b.end : eol + 1;
        const w = utf8Bytes(src.slice(start, lineEnd));
        if (w <= MAX_CHUNK_BYTES) {
          emit(start, lineEnd, w);
          start = lineEnd;
          bytes2 -= w;
          continue;
        }
        wide ??= new Uint8Array(MAX_CHUNK_BYTES);
        const big = cutPoint(src, start, lineEnd, wide);
        emit(start, big.end, big.written);
        start = big.end;
        bytes2 -= big.written;
        continue;
      }
      emit(start, cut.end, cut.written);
      start = cut.end;
      bytes2 -= cut.written;
    }
    if (start >= b.end) continue;
    cur = { start, end: b.end };
    curBytes = bytes2;
  }
  if (cur !== void 0) emit(cur.start, cur.end, curBytes);
  return out;
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

// src/core/tools/run-wrapper.ts
var SHELL = "shell";
var BASH2 = "Bash";
function exit(code, out, err) {
  return new Promise(() => {
    process.stderr.write(err, () => process.stdout.write(out, () => process.exit(code)));
  });
}
function decode11(b64) {
  return Buffer.from(b64, "base64").toString("utf8");
}
function denyRules(b64) {
  let parsed;
  try {
    parsed = JSON.parse(decode11(b64));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((r) => typeof r === "string")) return null;
  return parsed;
}
function userPolicyDeny(reason) {
  const prefix = getAdapter(RUN_WRAPPER_AGENT).toolNamePrefix;
  return reason.startsWith(USER_DENY_REASON_PREFIX) || reason === prefixToolNames(POLICY_UNREADABLE_LINE, prefix) || reason === prefixToolNames(PARSE_ERROR_DENY_LINE, prefix);
}
function projectOf(argv, cwd) {
  return resolveProject(RUN_WRAPPER_AGENT, { env: { CLAUDE_PROJECT_DIR: cwd }, argv, cwd });
}
function sourceLabel(command) {
  const nl = command.indexOf("\n");
  const first = nl < 0 ? command : command.slice(0, nl);
  return Array.from(RUN_LABEL_PREFIX + first).slice(0, SOURCE_LABEL_MAX_CHARS).join("");
}
function moreLine2(bundleDir, sourceId, terms) {
  return RUN_MORE_PREFIX + JSON.stringify(join5(bundleDir, SEARCH_WRAPPER_FILE)) + " " + sourceId + " " + JSON.stringify(terms);
}
function bytes(s) {
  return Buffer.byteLength(s, "utf8");
}
async function runWrapperMain(argv, env) {
  const cmdArg = argv[2];
  const rulesArg = argv[3];
  if (cmdArg === void 0 || cmdArg === "" || rulesArg === void 0) return exit(RUN_FAIL_EXIT, "", RUN_USAGE_LINE + "\n");
  const command = decode11(cmdArg);
  const rules = denyRules(rulesArg);
  if (rules === null) return exit(RUN_FAIL_EXIT, "", RUN_USAGE_LINE + "\n");
  const description = argv[4] === void 0 ? "" : decode11(argv[4]);
  const cwd = process.cwd();
  const sessionId = RUN_SESSION_PREFIX + randomUUID();
  const ev = {
    event: "PreToolUse",
    agent: RUN_WRAPPER_AGENT,
    sessionId,
    cwd,
    tool: { name: BASH2, canonicalName: BASH2, input: { command, description } }
  };
  const d = decide(ev, getAdapter(RUN_WRAPPER_AGENT), rules);
  if (d.kind === "deny" && userPolicyDeny(d.reason)) return exit(RUN_FAIL_EXIT, "", d.reason + "\n");
  try {
    const runtime = findRuntime(SHELL);
    if (runtime === null) throw noRuntimeError(SHELL);
    const project = projectOf(argv, cwd);
    const r = await runProcess([runtime, "-c", command], {
      cwd,
      env: buildChildEnv(env, { ...PLAIN_OUTPUT_ENV }),
      signal: new AbortController().signal,
      timeoutMs: EXEC_TIMEOUT_MS
    });
    if (r.killed === "timeout") return exit(RUN_TIMEOUT_EXIT, new CtxError("TIMEOUT", { ms: EXEC_TIMEOUT_MS }).toLine() + "\n", "");
    if (r.exitCode === null) throw new CtxError("SPAWN_FAILED", { detail: runtime + " gave no exit code in " + cwd });
    const exitCode = r.exitCode;
    const combined = r.stdout.toString("utf8") + (exitCode !== 0 ? r.stderr.toString("utf8") : "");
    const head = "exit " + exitCode + " \xB7 " + bytes(combined) + " B";
    const db = await openDb(project);
    let text;
    try {
      const { sourceId } = indexText(db, project, sessionId, sourceLabel(command), combined, "text");
      const more = moreLine2(dirname3(argv[1] ?? ""), sourceId, description);
      const picked = selectChunks(db, sourceId, description, OUTPUT_CAP - bytes(head) - bytes(more) - 2);
      text = head + "\n" + picked.text + (picked.more === null ? "" : "\n" + more);
    } finally {
      closeDb(db);
    }
    return exit(exitCode, capBytes(text, OUTPUT_CAP).text + "\n", "");
  } catch (err) {
    if (err instanceof CtxError) return exit(RUN_FAIL_EXIT, "", err.toLine() + "\n");
    throw err;
  }
}
async function searchWrapperMain(argv, _env) {
  const id = Number(argv[2] ?? "");
  const terms = argv[3] ?? "";
  if (argv[2] === void 0 || argv[2] === "" || !Number.isSafeInteger(id) || id < 0) {
    return exit(RUN_FAIL_EXIT, "", SEARCH_USAGE_LINE + "\n");
  }
  try {
    const db = await openDb(projectOf(argv, process.cwd()));
    let text;
    try {
      text = selectChunks(db, id, terms, OUTPUT_CAP).text;
    } finally {
      closeDb(db);
    }
    return exit(0, capBytes(text, OUTPUT_CAP).text + "\n", "");
  } catch (err) {
    if (err instanceof CtxError) return exit(RUN_FAIL_EXIT, "", err.toLine() + "\n");
    throw err;
  }
}

// src/entries/run.ts
var main = basename2(process.argv[1] ?? "") === SEARCH_WRAPPER_FILE ? searchWrapperMain : runWrapperMain;
void main(process.argv, process.env);
