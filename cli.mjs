#!/usr/bin/env node
import{createRequire as __cmRequire}from"node:module";if(typeof process.getBuiltinModule!=="function")process.getBuiltinModule=(id)=>__cmRequire(import.meta.url)(id);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/sisteransi/src/index.js
var require_src = __commonJS({
  "node_modules/sisteransi/src/index.js"(exports, module) {
    "use strict";
    var ESC2 = "\x1B";
    var CSI2 = `${ESC2}[`;
    var beep = "\x07";
    var cursor3 = {
      to(x2, y2) {
        if (!y2) return `${CSI2}${x2 + 1}G`;
        return `${CSI2}${y2 + 1};${x2 + 1}H`;
      },
      move(x2, y2) {
        let ret = "";
        if (x2 < 0) ret += `${CSI2}${-x2}D`;
        else if (x2 > 0) ret += `${CSI2}${x2}C`;
        if (y2 < 0) ret += `${CSI2}${-y2}A`;
        else if (y2 > 0) ret += `${CSI2}${y2}B`;
        return ret;
      },
      up: (count = 1) => `${CSI2}${count}A`,
      down: (count = 1) => `${CSI2}${count}B`,
      forward: (count = 1) => `${CSI2}${count}C`,
      backward: (count = 1) => `${CSI2}${count}D`,
      nextLine: (count = 1) => `${CSI2}E`.repeat(count),
      prevLine: (count = 1) => `${CSI2}F`.repeat(count),
      left: `${CSI2}G`,
      hide: `${CSI2}?25l`,
      show: `${CSI2}?25h`,
      save: `${ESC2}7`,
      restore: `${ESC2}8`
    };
    var scroll = {
      up: (count = 1) => `${CSI2}S`.repeat(count),
      down: (count = 1) => `${CSI2}T`.repeat(count)
    };
    var erase3 = {
      screen: `${CSI2}2J`,
      up: (count = 1) => `${CSI2}1J`.repeat(count),
      down: (count = 1) => `${CSI2}J`.repeat(count),
      line: `${CSI2}2K`,
      lineEnd: `${CSI2}K`,
      lineStart: `${CSI2}1K`,
      lines(count) {
        let clear = "";
        for (let i2 = 0; i2 < count; i2++)
          clear += this.line + (i2 < count - 1 ? cursor3.up() : "");
        if (count)
          clear += cursor3.left;
        return clear;
      }
    };
    module.exports = { cursor: cursor3, scroll, erase: erase3, beep };
  }
});

// src/entries/cli.ts
import { spawn as spawn2 } from "node:child_process";
import { readFileSync as readFileSync6, realpathSync as realpathSync6 } from "node:fs";
import path8 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/core/contracts/constants.ts
var SERVER_KEY = "context-mode";
var TOOL_ORDER = Object.freeze(["ctx_execute", "ctx_batch", "ctx_index", "ctx_search", "ctx_resume", "ctx_stats", "ctx_doctor", "ctx_upgrade", "ctx_purge"]);
var OUTPUT_CAP = 16384;
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
var DB_WAL_SUFFIX = "-wal";
var DB_SHM_SUFFIX = "-shm";
var HOOK_TIMEOUT_MS = 5e3;
var IN_PROCESS_TIMEOUT_MS = 0;
var PROJECTS_DIR_NAME = "projects";
var DB_FILE_NAME = "context.db";
var WORKSPACE_FOLDER_FLAG = "--workspace-folder";
var EXEC_LANGUAGES = Object.freeze(["shell", "powershell", "javascript", "typescript", "python"]);
var PLAIN_OUTPUT_ENV = Object.freeze({ NO_COLOR: "1", FORCE_COLOR: "0" });
var HOST_SESSION_ENV = Object.freeze({ "claude-code": "CLAUDE_CODE_SESSION_ID" });
var NODE_MIN = "24.15.0";
var DATA_ROOT = "~/.context-mode";
var HOST_PLUGINS_DIR_NAME = "plugins";
var INSTALLED_PLUGINS_FILE = "installed_plugins.json";
var MCP_HINT_EVERY_DEFAULT = 10;
function readHintEvery(raw) {
  if (raw === void 0 || raw.trim() === "") return MCP_HINT_EVERY_DEFAULT;
  const n3 = Number(raw);
  return Number.isSafeInteger(n3) && n3 > 0 ? n3 : MCP_HINT_EVERY_DEFAULT;
}
var MCP_HINT_EVERY = readHintEvery(process.env.CTX_MCP_HINT_EVERY);
var DENY_WHAT = Object.freeze({
  curl: "This curl/wget call",
  http: "This inline HTTP call",
  build: "This build command",
  webfetch: "WebFetch"
});
var DENY_WEBFETCH_TOOLS = Object.freeze(["ctx_index", "ctx_search"]);
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
var NEVER_DENY_HOSTS = Object.freeze(["claude.ai", "claude.site", "claudeusercontent.com"]);
var CURL_COMMANDS = Object.freeze(["curl", "wget"]);
var CURL_SILENT_FLAGS = Object.freeze({ curl: { short: "s", long: "--silent" }, wget: { short: "q", long: "--quiet" } });
var CURL_VERBOSE_FLAGS = Object.freeze(["-v", "--verbose", "--trace", "--trace-ascii"]);
var BUILD_COMMANDS = Object.freeze(["gradlew", "gradle", "mvnw", "mvn", "sbt"]);
var INLINE_HTTP_CALLS = Object.freeze(["requests.get(", "requests.post(", "requests.put(", "http.get(", "http.request("]);
var SHELL_DUMP_COMMANDS = Object.freeze(["cat", "head", "tail", "sed", "less", "jq", "bat", "more"]);
var DUMP_COUNT_COMMANDS = Object.freeze(["head", "tail"]);
var DUMP_COUNT_FLAGS = Object.freeze(["-n", "-c", "--lines", "--bytes"]);
var SED_QUIET_FLAGS = Object.freeze(["-n", "--quiet", "--silent"]);
var READ_PATH_KEYS = Object.freeze(["file_path", "absolute_path", "path"]);
var OWN_TOOL_PREFIX = "ctx_";
var EDIT_TOOLS = Object.freeze(["Write", "Edit"]);
var EDIT_PATH_KEYS = Object.freeze(["file_path", "path"]);
var AGENT_ARG = "--agent";
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
var MATCHER_OPEN = "^(";
var MATCHER_CLOSE = ")$";
var MATCHER_ALT = "|";
var MCP_ANY_MATCH = "mcp__.*";
var POST_TOOL_USE = "PostToolUse";
var MATCHER_ANY = ".*";
var REGEX_SPECIAL_CHARS = ".*+?^${}()|[]\\";
var REGEX_ESCAPE = "\\";
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
var V1_HOOK_COMMAND = "context-mode hook";
var V1_CODEX_HOOK_COMMAND = "context-mode hook codex";
var V1_CODEX_HOOKS_DIR = Object.freeze(["hooks", "codex"]);
var V1_CACHE_HEAL_NAME = "context-mode-cache-heal";
var V1_CACHE_HEAL_EXTS = Object.freeze([".mjs", ".sh"]);
var V1_STATUSLINE_COMMAND = "context-mode statusline";
var V1_PI_PACKAGE = "npm:context-mode";
var V1_OPENCODE_PLUGIN_SPEC = "context-mode";
var V1_TMP_PREFIX = "context-mode-";
var V1_TOML_SECTION_PREFIX = "[mcp_servers.context-mode";
var V1_HOOKS_DIR_NAME = "hooks";
var SETTINGS_FILE = "settings.json";
var CLAUDE_USER_CONFIG_FILE = ".claude.json";
var HOOKS_JSON_FILE = "hooks.json";
var CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
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
var OPENCODE_TOOL_PREFIX = SERVER_KEY + "_";
var ATOMIC_RENAME_RETRIES = 5;
var ATOMIC_RENAME_DELAY_MS = 50;
var ATOMIC_RENAME_BUSY_CODES = ["EPERM", "EBUSY", "EACCES"];
var ATOMIC_TMP_PREFIX = ".";
var ATOMIC_TMP_MARK = ".cm-tmp-";
var JSON_INDENT_UNIT = "  ";
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
  const sep2 = rest.indexOf(MCP_SEP);
  if (sep2 < 0) return name;
  return "mcp:" + rest.slice(0, sep2) + ":" + rest.slice(sep2 + MCP_SEP.length);
}
function outputOf(resp) {
  if (resp === void 0) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return blocksOf(resp).text;
  if (typeof resp === "object" && resp !== null) {
    const r2 = resp;
    if (typeof r2.stdout === "string" || typeof r2.stderr === "string") {
      const out2 = typeof r2.stdout === "string" ? r2.stdout : "";
      const err2 = typeof r2.stderr === "string" ? r2.stderr : "";
      return err2 === "" ? out2 : out2 === "" ? err2 : out2 + "\n" + err2;
    }
  }
  if (typeof resp === "object" && resp !== null && isGrepContent(resp)) return resp.content;
  return JSON.stringify(resp);
}
function isGrepContent(resp) {
  const r2 = resp;
  return r2.mode === "content" && typeof r2.content === "string";
}
function blocksOf(resp) {
  const parts = [];
  let keep = false;
  for (const b3 of resp) {
    const blk = typeof b3 === "object" && b3 !== null ? b3 : {};
    if (blk.type === "text" && typeof blk.text === "string") parts.push(blk.text);
    else keep = true;
  }
  return { text: parts.join("\n"), keep };
}
function readResult(resp) {
  const text2 = outputOf(resp);
  const isError = typeof resp === "object" && resp !== null && resp.is_error === true;
  const info = { isError, bytes: Buffer.byteLength(text2), text: text2 };
  if (typeof resp === "object" && resp !== null && !Array.isArray(resp) && isGrepContent(resp)) info.shape = resp;
  if (Array.isArray(resp)) {
    info.blocks = true;
    if (blocksOf(resp).keep) info.keep = true;
  }
  if (typeof resp === "object" && resp !== null) {
    const r2 = resp;
    if (typeof r2.persistedOutputPath === "string" && r2.persistedOutputPath !== "" && typeof r2.persistedOutputSize === "number" && r2.persistedOutputSize > info.bytes) {
      info.persistedPath = r2.persistedOutputPath;
    }
  }
  return info;
}
function decodeClaudeShape(raw, agent, ownPrefix, sources) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(agent + ": hook payload is not a JSON object");
  const p3 = raw;
  const event = CLAUDE_SHAPE_EVENTS.find((e) => e === p3.hook_event_name);
  if (event === void 0) throw new Error(agent + ": unknown hook event " + String(p3.hook_event_name));
  const ev = { event, agent, sessionId: String(p3.session_id ?? ""), cwd: String(p3.cwd ?? "") };
  if (typeof p3.agent_id === "string") {
    ev.agentId = p3.agent_id;
    if (typeof p3.agent_type === "string") ev.agentType = p3.agent_type;
  }
  if (event === "SessionStart" && typeof p3.source === "string" && sources[p3.source] !== void 0) ev.source = sources[p3.source];
  if (event === "UserPromptSubmit" && typeof p3.prompt === "string") ev.prompt = p3.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p3.tool_name ?? "");
    const input = typeof p3.tool_input === "object" && p3.tool_input !== null ? p3.tool_input : {};
    const tool = { name, canonicalName: canonicalName(name, ownPrefix), input };
    if (typeof p3.tool_use_id === "string" && p3.tool_use_id !== "") tool.callId = p3.tool_use_id;
    ev.tool = tool;
  }
  if (event === "PostToolUse") ev.result = readResult(p3.tool_response);
  return ev;
}
function replaceShape(ev, output) {
  if (ev.tool?.canonicalName === "Bash") return { stdout: output, stderr: "", interrupted: false };
  if (ev.result?.shape !== void 0) return { ...ev.result.shape, content: output };
  if (ev.result?.blocks === true) return [{ type: "text", text: output }];
  return output;
}
function encodeClaudeShape(ev, d, hasReplace2) {
  const out2 = (fields) => ({
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: ev.event, ...fields } }),
    exitCode: 0
  });
  switch (d.kind) {
    case "allow":
      return { stdout: "", exitCode: 0 };
    case "hint":
      return out2({ additionalContext: d.text });
    case "deny":
      return out2({ permissionDecision: "deny", permissionDecisionReason: d.rewritten === void 0 ? d.reason : d.rewritten + "\n" + d.reason });
    case "replace":
      return hasReplace2 && ev.event === "PostToolUse" ? out2({ updatedToolOutput: replaceShape(ev, d.output) }) : { stdout: "", exitCode: 0 };
  }
}
var REQUIRED_FIELDS = {
  PreToolUse: ["tool_name"],
  PostToolUse: ["tool_name", "tool_response"]
};
function fnv1a(s) {
  let h2 = 2166136261;
  for (let i2 = 0; i2 < s.length; i2++) {
    h2 ^= s.charCodeAt(i2);
    h2 = Math.imul(h2, 16777619);
  }
  return (h2 >>> 0).toString(16).padStart(8, "0");
}
function requireFields(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  const p3 = raw;
  if (p3.hook_event_name === void 0) throw new Error("claude-code: missing required field hook_event_name");
  for (const f2 of REQUIRED_FIELDS[p3.hook_event_name] ?? []) {
    if (p3[f2] === void 0) throw new Error("claude-code: missing required field " + f2);
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
function own(p3, key) {
  return Object.hasOwn(p3, key) ? p3[key] : void 0;
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
  const m3 = mcp;
  const server = own(m3, "server_name");
  const tool = own(m3, "tool_name");
  if (typeof server !== "string" || typeof tool !== "string") return name;
  return "mcp:" + server + ":" + tool;
}
function readResult2(resp) {
  const obj = typeof resp === "object" && resp !== null ? resp : void 0;
  const llm = obj === void 0 ? void 0 : own(obj, "llmContent");
  const text2 = resp === void 0 ? "" : typeof resp === "string" ? resp : typeof llm === "string" ? llm : JSON.stringify(resp);
  const err2 = obj === void 0 ? void 0 : own(obj, "error");
  return { isError: err2 !== void 0 && err2 !== null, bytes: Buffer.byteLength(text2), text: text2 };
}
function decode3(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("gemini: hook payload is not a JSON object");
  const p3 = raw;
  const native = own(p3, "hook_event_name");
  const event = typeof native === "string" && Object.hasOwn(GEMINI_EVENTS, native) ? GEMINI_EVENTS[native] : void 0;
  if (event === void 0) throw new Error("gemini: unknown hook event " + String(native));
  const ev = { event, agent: "gemini", sessionId: String(own(p3, "session_id") ?? ""), cwd: String(own(p3, "cwd") ?? "") };
  const source = own(p3, "source");
  if (event === "SessionStart" && typeof source === "string" && Object.hasOwn(GEMINI_SOURCES, source)) ev.source = GEMINI_SOURCES[source];
  const prompt = own(p3, "prompt");
  if (event === "UserPromptSubmit" && typeof prompt === "string") ev.prompt = prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(own(p3, "tool_name") ?? "");
    const input = own(p3, "tool_input");
    ev.tool = {
      name,
      canonicalName: canonicalName2(name, own(p3, "mcp_context")),
      input: typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}
    };
  }
  if (event === "PostToolUse") ev.result = readResult2(own(p3, "tool_response"));
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
    const text2 = typeof error === "string" ? error : error === void 0 ? "" : JSON.stringify(error);
    ev.result = { isError: true, bytes: Buffer.byteLength(text2), text: text2 };
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
  const r2 = isRecord(v) ? v : {};
  const text2 = typeof r2[k.text] === "string" ? r2[k.text] : "";
  const isError = failure || typeof r2[k.type] === "string" && r2[k.type] !== RESULT_SUCCESS;
  return { isError, bytes: Buffer.byteLength(text2), text: text2 };
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
  ...SHELL_TOOL_NAMES.map((n3) => [n3, "Bash"]),
  ...READ_TOOL_NAMES.map((n3) => [n3, "Read"]),
  ...WEBFETCH_TOOL_NAMES.map((n3) => [n3, "WebFetch"])
]);
function canonicalName4(name) {
  if (name.startsWith(TOOL_NAME_PREFIX6)) return name.slice(TOOL_NAME_PREFIX6.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL4, name)) return NATIVE_TO_CANONICAL4[name];
  if (!name.startsWith(MCP_PREFIX2)) return name;
  const rest = name.slice(MCP_PREFIX2.length);
  const sep2 = rest.indexOf(MCP_SEP2);
  if (sep2 <= 0 || sep2 === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep2) + ":" + rest.slice(sep2 + MCP_SEP2.length);
}
var isNum = (v) => typeof v === "number" && Number.isFinite(v);
function policyInput(name, canonical, input) {
  if (canonical === "Read" && READ_TOOL_NAMES.includes(name)) {
    const out2 = { ...input };
    if (name === "read_file") {
      if (typeof input.filePath === "string") out2.file_path = input.filePath;
      if (isNum(input.startLine)) out2.offset = input.startLine;
      if (isNum(input.startLine) && isNum(input.endLine) && input.endLine >= input.startLine) out2.limit = input.endLine - input.startLine + 1;
    } else if (Array.isArray(input.view_range) && isNum(input.view_range[0])) {
      out2.offset = input.view_range[0];
      const end = input.view_range[1];
      if (isNum(end) && end >= input.view_range[0]) out2.limit = end - input.view_range[0] + 1;
    }
    return out2;
  }
  if (canonical === "WebFetch" && name === "fetch_webpage" && Array.isArray(input.urls) && typeof input.urls[0] === "string") {
    return { ...input, url: input.urls[0] };
  }
  return input;
}
function readResult4(resp) {
  const text2 = resp === void 0 ? "" : typeof resp === "string" ? resp : JSON.stringify(resp);
  const isError = typeof resp === "object" && resp !== null && resp.is_error === true;
  return { isError, bytes: Buffer.byteLength(text2), text: text2 };
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
  const r2 = isRecord2(v) ? v : {};
  const text2 = typeof r2.textResultForLlm === "string" ? r2.textResultForLlm : "";
  return { isError: typeof r2.resultType === "string" && r2.resultType !== RESULT_SUCCESS2, bytes: Buffer.byteLength(text2), text: text2 };
}
function decodeCamel(p3, name) {
  const event = typeof name === "string" ? CAMEL_EVENTS[name] ?? VSCODE_EVENTS.find((e) => e === name) : void 0;
  if (event === void 0) throw new Error("vscode: unknown hook event " + String(name));
  const ev = { event, agent: "vscode", sessionId: String(p3.sessionId ?? ""), cwd: String(p3.cwd ?? "") };
  if (event === "SessionStart" && typeof p3.source === "string" && SESSION_SOURCES[p3.source] !== void 0) ev.source = SESSION_SOURCES[p3.source];
  if (event === "UserPromptSubmit" && typeof p3.prompt === "string") ev.prompt = p3.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const toolName = String(p3.toolName ?? "");
    const canonical = canonicalName4(toolName);
    ev.tool = { name: toolName, canonicalName: canonical, input: policyInput(toolName, canonical, readArgs2(p3.toolArgs)) };
  }
  if (event === "PostToolUse") ev.result = readCamelResult(p3.toolResult);
  return ev;
}
function decode6(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("vscode: hook payload is not a JSON object");
  const p3 = raw;
  if (p3.hookEventName !== void 0) return decodeCamel(p3, p3.hookEventName);
  if (p3.hook_event_name === void 0) {
    const byKey = EVENT_BY_KEY2.find(([key]) => Object.hasOwn(p3, key))?.[1];
    if (byKey === void 0) throw new Error("vscode: missing required field hook_event_name");
    return decodeCamel(p3, byKey);
  }
  const event = VSCODE_EVENTS.find((e) => e === p3.hook_event_name);
  if (event === void 0) throw new Error("vscode: unknown hook event " + String(p3.hook_event_name));
  const ev = { event, agent: "vscode", sessionId: String(p3.session_id ?? ""), cwd: String(p3.cwd ?? "") };
  if (event === "SessionStart" && p3.source === SESSION_START_NEW) ev.source = "startup";
  if (event === "UserPromptSubmit" && typeof p3.prompt === "string") ev.prompt = p3.prompt;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p3.tool_name ?? "");
    const input = isRecord2(p3.tool_input) ? p3.tool_input : {};
    const canonical = canonicalName4(name);
    ev.tool = { name, canonicalName: canonical, input: policyInput(name, canonical, input) };
  }
  if (event === "PostToolUse") ev.result = readResult4(p3.tool_response);
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
var NATIVE_TO_CANONICAL5 = Object.fromEntries(SHELL_TOOL_NAMES2.map((n3) => [n3, "Bash"]));
var MCP_SEP3 = "_";
var KIRO_SOURCES = { startup: "startup", resume: "resume", clear: "clear", compact: "compact" };
function canonicalName5(name) {
  if (name.startsWith(TOOL_NAME_PREFIX7)) return name.slice(TOOL_NAME_PREFIX7.length);
  if (Object.hasOwn(NATIVE_TO_CANONICAL5, name)) return NATIVE_TO_CANONICAL5[name];
  if (!name.startsWith(MCP_PREFIX3)) return name;
  const rest = name.slice(MCP_PREFIX3.length);
  const sep2 = rest.indexOf(MCP_SEP3);
  if (sep2 <= 0 || sep2 === rest.length - 1) return name;
  return "mcp:" + rest.slice(0, sep2) + ":" + rest.slice(sep2 + MCP_SEP3.length);
}
function readResult5(resp) {
  const text2 = resp === void 0 ? "" : typeof resp === "string" ? resp : JSON.stringify(resp);
  return { isError: false, bytes: Buffer.byteLength(text2), text: text2 };
}
function decode7(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("kiro: hook payload is not a JSON object");
  const p3 = raw;
  const native = typeof p3.hook_event_name === "string" ? p3.hook_event_name : "";
  const event = Object.prototype.hasOwnProperty.call(KIRO_EVENTS, native) ? KIRO_EVENTS[native] : void 0;
  if (event === void 0) throw new Error("kiro: unknown hook event " + String(p3.hook_event_name));
  const ev = { event, agent: "kiro", sessionId: String(p3.session_id ?? ""), cwd: String(p3.cwd ?? "") };
  if (event === "SessionStart" && typeof p3.source === "string" && KIRO_SOURCES[p3.source] !== void 0) ev.source = KIRO_SOURCES[p3.source];
  if (event === "UserPromptSubmit") {
    const prompt = process.env[PROMPT_ENV];
    if (prompt !== void 0) ev.prompt = prompt;
  }
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p3.tool_name ?? "");
    const input = typeof p3.tool_input === "object" && p3.tool_input !== null && !Array.isArray(p3.tool_input) ? p3.tool_input : {};
    ev.tool = { name, canonicalName: canonicalName5(name), input };
  }
  if (event === "PostToolUse") ev.result = readResult5(p3.tool_response);
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
  const p3 = { ...raw };
  for (const [snake2, camel] of Object.entries(TWINS)) if (p3[snake2] === void 0) p3[snake2] = p3[camel];
  const failure = p3.hook_event_name === FAILURE_EVENT2;
  if (failure) p3.hook_event_name = "PostToolUse";
  const ev = decodeClaudeShape(p3, "zcode", TOOL_NAME_PREFIX8, ZCODE_SOURCES);
  if (failure) {
    const text2 = typeof p3.error === "string" ? p3.error : p3.error === void 0 ? "" : JSON.stringify(p3.error);
    ev.result = { isError: true, bytes: Buffer.byteLength(text2), text: text2 };
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
function readResult6(p3) {
  const text2 = p3.content === void 0 ? "" : typeof p3.content === "string" ? p3.content : JSON.stringify(p3.content);
  const info = { isError: p3.isError === true, bytes: Buffer.byteLength(text2), text: text2 };
  if (typeof p3.exitCode === "number") info.exitCode = p3.exitCode;
  return info;
}
function decode9(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("pi: hook payload is not an object");
  const p3 = raw;
  const native = typeof p3.type === "string" ? p3.type : "";
  const row = Object.prototype.hasOwnProperty.call(PI_EVENTS, native) ? PI_EVENTS[native] : void 0;
  if (row === void 0) throw new Error("pi: unknown hook event " + String(p3.type));
  const ev = { event: row.event, agent: "pi", sessionId: String(p3.sessionId ?? ""), cwd: String(p3.cwd ?? "") };
  if (row.source !== void 0) ev.source = row.source;
  if (row.event === "UserPromptSubmit" && typeof p3.message === "string") ev.prompt = p3.message;
  if (row.event === "PreToolUse" || row.event === "PostToolUse") {
    const name = String(p3.toolName ?? "");
    ev.tool = { name, canonicalName: Object.hasOwn(NATIVE_TO_CANONICAL6, name) ? NATIVE_TO_CANONICAL6[name] : name, input: record(p3.input) };
    if (typeof p3.toolCallId === "string") ev.tool.callId = p3.toolCallId;
  }
  if (row.event === "PostToolUse") ev.result = readResult6(p3);
  if (typeof p3.turn === "number") ev.turn = p3.turn;
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
  const out2 = stdoutFor(ev, d);
  if (d?.kind === "allow") return out2;
  return { stdout: out2.stdout, exitCode: out2.exitCode, role: PI_ROLE, content: out2.stdout, timestamp: Date.now() };
}
function checkPermission(out2) {
  return out2.exitCode === 2 ? { block: true, reason: out2.stdout } : void 0;
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
function readResult7(p3) {
  const text2 = p3.output === void 0 ? "" : typeof p3.output === "string" ? p3.output : JSON.stringify(p3.output);
  const info = { isError: p3.isError === true, bytes: Buffer.byteLength(text2), text: text2 };
  if (typeof p3.exitCode === "number") info.exitCode = p3.exitCode;
  return info;
}
function decode10(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("opencode: hook payload is not an object");
  const p3 = raw;
  const native = typeof p3.type === "string" ? p3.type : "";
  const event = Object.prototype.hasOwnProperty.call(OPENCODE_EVENTS, native) ? OPENCODE_EVENTS[native] : void 0;
  if (event === void 0) throw new Error("opencode: unknown hook event " + String(p3.type));
  const ev = { event, agent: "opencode", sessionId: String(p3.sessionID ?? ""), cwd: String(p3.directory ?? "") };
  if (event === "UserPromptSubmit" && typeof p3.message === "string") ev.prompt = p3.message;
  if (event === "PreToolUse" || event === "PostToolUse") {
    const name = String(p3.tool ?? "");
    ev.tool = { name, canonicalName: toCanonicalTool(name), input: record2(p3.args) };
    if (typeof p3.callID === "string") ev.tool.callId = p3.callID;
  }
  if (event === "PostToolUse") ev.result = readResult7(p3);
  if (typeof p3.turn === "number") ev.turn = p3.turn;
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
var BY_ID = new Map(ADAPTERS.map((r2) => [r2.id, r2]));
var REPLACE_ROWS = /* @__PURE__ */ new Set(["claude-code", "gemini", "copilot-cli", "pi"]);
function hasReplace(row) {
  return REPLACE_ROWS.has(row.id);
}
function getAdapter(id) {
  return BY_ID.get(id);
}

// src/cli/args.ts
var COMMANDS = ["setup", "doctor", "upgrade"];
var ALL_COMMANDS = ["setup", "doctor", "upgrade", "server", "mcp", "hook", "help"];
var AGENT_IDS = ADAPTERS.map((a2) => a2.id);
var COMMON = ["--help", "-h", "--json", "--yes", "-y", "--no-input", "--debug", "--quiet", "-q", "--verbose", "--no-color", "--agents"];
var FLAGS = {
  setup: [...COMMON, "--dry-run", "--list", "--remove", "--repair", "--print"],
  doctor: COMMON,
  upgrade: [...COMMON, "--dry-run", "--tag"]
};
var VALUE_FLAGS = /* @__PURE__ */ new Set(["--agents", "--tag", "--print"]);
var TAG_RE = /^[a-z0-9][a-z0-9.+-]*$/i;
var UsageError = class extends Error {
};
function distance(a2, b3) {
  const row = Array.from({ length: b3.length + 1 }, (_2, i2) => i2);
  for (let i2 = 1; i2 <= a2.length; i2++) {
    let prev = row[0]++;
    for (let j2 = 1; j2 <= b3.length; j2++) {
      const cur = row[j2];
      row[j2] = Math.min(row[j2] + 1, row[j2 - 1] + 1, prev + (a2[i2 - 1] === b3[j2 - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b3.length];
}
function suggest(word, candidates) {
  let best = "";
  let bestD = Infinity;
  for (const c3 of candidates) {
    const d = distance(word, c3);
    if (d < bestD) {
      best = c3;
      bestD = d;
    }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? ` Did you mean "${best}"?` : "";
}
function parseFlags(cmd, argv) {
  const f2 = { help: false, json: false, yes: false, noInput: false, dryRun: false, debug: false, quiet: false, verbose: false, noColor: false, list: false, remove: false, repair: false };
  for (let i2 = 0; i2 < argv.length; i2++) {
    const raw = argv[i2];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const name = eq > 0 ? raw.slice(0, eq) : raw;
    if (!FLAGS[cmd].includes(name)) {
      const kind = name.startsWith("-") ? "option" : "argument";
      throw new UsageError(`unknown ${kind} "${name}" for context-mode ${cmd}.${name.startsWith("-") ? suggest(name, FLAGS[cmd]) : ""}`);
    }
    let value;
    if (VALUE_FLAGS.has(name)) {
      value = eq > 0 ? raw.slice(eq + 1) : argv[++i2];
      if (value === void 0 || value === "" || value.startsWith("-")) throw new UsageError(`${name} needs a value.`);
    } else if (eq > 0) throw new UsageError(`${name} takes no value.`);
    switch (name) {
      case "--help":
      case "-h":
        f2.help = true;
        break;
      case "--json":
        f2.json = true;
        break;
      case "--yes":
      case "-y":
        f2.yes = true;
        break;
      case "--no-input":
        f2.noInput = true;
        break;
      case "--dry-run":
        f2.dryRun = true;
        break;
      case "--debug":
        f2.debug = true;
        break;
      case "--quiet":
      case "-q":
        f2.quiet = true;
        break;
      case "--verbose":
        f2.verbose = true;
        break;
      case "--no-color":
        f2.noColor = true;
        break;
      case "--list":
        f2.list = true;
        break;
      case "--remove":
        f2.remove = true;
        break;
      case "--repair":
        f2.repair = true;
        break;
      case "--tag":
        if (!TAG_RE.test(value)) throw new UsageError(`--tag "${value}" is not an npm dist-tag or version.`);
        f2.tag = value;
        break;
      case "--print":
        if (!AGENT_IDS.includes(value)) throw new UsageError(`unknown agent "${value}".${suggest(value, AGENT_IDS)} Run context-mode setup --list.`);
        f2.print = value;
        break;
      case "--agents": {
        const ids = value.split(",").map((s) => s.trim()).filter(Boolean);
        for (const id of ids) {
          if (!AGENT_IDS.includes(id)) throw new UsageError(`unknown agent "${id}".${suggest(id, AGENT_IDS)} Run context-mode setup --list.`);
        }
        f2.agents = [...new Set(ids)];
        break;
      }
    }
  }
  if (f2.list && f2.remove) throw new UsageError("--list and --remove cannot be used together.");
  if (f2.print) {
    const mixed = [["--remove", f2.remove], ["--list", f2.list], ["--dry-run", f2.dryRun], ["--repair", f2.repair], ["--agents", !!f2.agents]].find(([, on]) => on);
    if (mixed) throw new UsageError(`--print cannot be used with ${mixed[0]}.`);
  }
  return f2;
}
var EXIT_CODES = `Exit codes:
  0    success
  1    a check or step failed
  2    usage error (unknown command, option or agent; an answer is needed but there is no TTY)
  130  stopped with Ctrl-C (the agent in progress is rolled back)
`;
var HELP_MAIN = `Usage: context-mode <command> [options]

Commands:
  setup                       Find your agents, show the plan, apply it, verify each agent
  doctor                      Check every agent; changes nothing
  upgrade                     Install the newest context-mode from npm, then repair each agent
  server [--agent <id>]       Run the MCP server on stdio (alias: mcp)
  hook --agent <id>           Run one hook call: JSON on stdin, answer on stdout
  hook <platform> <event>     Old form of hook; still works, run context-mode setup to update it

Options:
  -h, --help                  Show this help (context-mode <command> --help for a command)
  -v, --version               Show the version

${EXIT_CODES}
Examples:
  context-mode setup
  context-mode doctor --agents codex
  context-mode server --agent codex
`;
var COMMON_HELP = `  --agents <ids>     Only these agents, comma-separated (ids: context-mode setup --list)
  -y, --yes          Do not ask; apply
  --no-input         Never prompt; exit 2 if an answer is needed
  --json             Write only JSON to stdout
  -q, --quiet        Results only; no progress lines
  --verbose          Show every check
  --debug            Print the full debug report on failure
  --no-color         No colour (also NO_COLOR, TERM=dumb, or no TTY)
  -h, --help         Show this help
`;
var HELP = {
  setup: `Usage: context-mode setup [options]

Find your agents, show the plan, apply it, then verify each agent (MCP handshake, one hook call).
A failed agent is rolled back byte for byte. Instruction files (CLAUDE.md, AGENTS.md, ...) are never touched.

Options:
  --list             Print every supported agent and its support level; change nothing
  --dry-run          Show the plan; change nothing
  --remove           Undo every setup run: put each touched file back
  --repair           Apply again and verify (upgrade runs this)
  --print <id>       Print the manual step for one agent, paths filled in; change nothing
${COMMON_HELP}
${EXIT_CODES}
Examples:
  context-mode setup
  context-mode setup --yes --agents codex,claude-code
  context-mode setup --dry-run --json
  context-mode setup --print codex
`,
  doctor: `Usage: context-mode doctor [options]

Check each agent: config entry, old context-mode entries, MCP handshake, one hook call. Changes nothing.
On a TTY, a failed agent gets one question: fix now (runs context-mode setup for that agent).

Options:
${COMMON_HELP}
${EXIT_CODES}
Examples:
  context-mode doctor
  context-mode doctor --agents codex --json
  context-mode doctor --no-input
`,
  upgrade: `Usage: context-mode upgrade [options]

Run npm i -g context-mode@<tag>, then the new version runs context-mode setup --repair.

Options:
  --tag <tag>        npm dist-tag or version to install (default: the dist-tag of this version)
  --dry-run          Print the commands; run nothing
${COMMON_HELP}
${EXIT_CODES}
Examples:
  context-mode upgrade
  context-mode upgrade --tag next --yes
  context-mode upgrade --dry-run
`
};

// src/cli/commands.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync7, mkdirSync as mkdirSync4, writeFileSync as writeFileSync3 } from "node:fs";
import os from "node:os";
import path7 from "node:path";

// node_modules/@clack/prompts/dist/index.mjs
var dist_exports = {};
__export(dist_exports, {
  CANCEL_SYMBOL: () => CANCEL_SYMBOL,
  MULTISELECT_INSTRUCTIONS: () => MULTISELECT_INSTRUCTIONS,
  SELECT_INSTRUCTIONS: () => SELECT_INSTRUCTIONS,
  S_BAR: () => S_BAR,
  S_BAR_END: () => S_BAR_END,
  S_BAR_END_RIGHT: () => S_BAR_END_RIGHT,
  S_BAR_H: () => S_BAR_H,
  S_BAR_START: () => S_BAR_START,
  S_BAR_START_RIGHT: () => S_BAR_START_RIGHT,
  S_CHECKBOX_ACTIVE: () => S_CHECKBOX_ACTIVE,
  S_CHECKBOX_INACTIVE: () => S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED: () => S_CHECKBOX_SELECTED,
  S_CONNECT_LEFT: () => S_CONNECT_LEFT,
  S_CORNER_BOTTOM_LEFT: () => S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT: () => S_CORNER_BOTTOM_RIGHT,
  S_CORNER_TOP_LEFT: () => S_CORNER_TOP_LEFT,
  S_CORNER_TOP_RIGHT: () => S_CORNER_TOP_RIGHT,
  S_ERROR: () => S_ERROR,
  S_INFO: () => S_INFO,
  S_PASSWORD_MASK: () => S_PASSWORD_MASK,
  S_RADIO_ACTIVE: () => S_RADIO_ACTIVE,
  S_RADIO_INACTIVE: () => S_RADIO_INACTIVE,
  S_STEP_ACTIVE: () => S_STEP_ACTIVE,
  S_STEP_CANCEL: () => S_STEP_CANCEL,
  S_STEP_ERROR: () => S_STEP_ERROR,
  S_STEP_SUBMIT: () => S_STEP_SUBMIT,
  S_SUCCESS: () => S_SUCCESS,
  S_WARN: () => S_WARN,
  autocomplete: () => autocomplete,
  autocompleteMultiselect: () => autocompleteMultiselect,
  box: () => box,
  cancel: () => cancel,
  confirm: () => confirm,
  date: () => date,
  formatInstructionFooter: () => formatInstructionFooter,
  group: () => group,
  groupMultiselect: () => groupMultiselect,
  intro: () => intro,
  isCI: () => isCI,
  isCancel: () => isCancel,
  isTTY: () => isTTY,
  limitOptions: () => limitOptions,
  log: () => log,
  multiline: () => multiline,
  multiselect: () => multiselect,
  note: () => note,
  outro: () => outro,
  password: () => password,
  path: () => path,
  progress: () => progress,
  select: () => select,
  selectKey: () => selectKey,
  settings: () => settings,
  spinner: () => spinner,
  stream: () => stream,
  symbol: () => symbol,
  symbolBar: () => symbolBar,
  taskLog: () => taskLog,
  tasks: () => tasks,
  text: () => text,
  unicode: () => unicode,
  unicodeOr: () => unicodeOr,
  updateSettings: () => updateSettings
});

// node_modules/@clack/core/dist/index.mjs
import { styleText } from "node:util";
import { stdout, stdin } from "node:process";
import * as l from "node:readline";
import l__default from "node:readline";

// node_modules/fast-string-truncated-width/dist/utils.js
var getCodePointsLength = /* @__PURE__ */ (() => {
  const SURROGATE_PAIR_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  return (input) => {
    let surrogatePairsNr = 0;
    SURROGATE_PAIR_RE.lastIndex = 0;
    while (SURROGATE_PAIR_RE.test(input)) {
      surrogatePairsNr += 1;
    }
    return input.length - surrogatePairsNr;
  };
})();
var isFullWidth = (x2) => {
  return x2 === 12288 || x2 >= 65281 && x2 <= 65376 || x2 >= 65504 && x2 <= 65510;
};
var isWideNotCJKTNotEmoji = (x2) => {
  return x2 === 8987 || x2 === 9001 || x2 >= 12272 && x2 <= 12287 || x2 >= 12289 && x2 <= 12350 || x2 >= 12441 && x2 <= 12543 || x2 >= 12549 && x2 <= 12591 || x2 >= 12593 && x2 <= 12686 || x2 >= 12688 && x2 <= 12771 || x2 >= 12783 && x2 <= 12830 || x2 >= 12832 && x2 <= 12871 || x2 >= 12880 && x2 <= 19903 || x2 >= 65040 && x2 <= 65049 || x2 >= 65072 && x2 <= 65106 || x2 >= 65108 && x2 <= 65126 || x2 >= 65128 && x2 <= 65131 || x2 >= 127488 && x2 <= 127490 || x2 >= 127504 && x2 <= 127547 || x2 >= 127552 && x2 <= 127560 || x2 >= 131072 && x2 <= 196605 || x2 >= 196608 && x2 <= 262141;
};

// node_modules/fast-string-truncated-width/dist/index.js
var ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001b\]8;[^;]*;.*?(?:\u0007|\u001b\u005c)/y;
var CONTROL_RE = /[\x00-\x08\x0A-\x1F\x7F-\x9F]{1,1000}/y;
var CJKT_WIDE_RE = /(?:(?![\uFF61-\uFF9F\uFF00-\uFFEF])[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Tangut}]){1,1000}/yu;
var TAB_RE = /\t{1,1000}/y;
var EMOJI_RE = new RegExp("[\\u{1F1E6}-\\u{1F1FF}]{2}|\\u{1F3F4}[\\u{E0061}-\\u{E007A}]{2}[\\u{E0030}-\\u{E0039}\\u{E0061}-\\u{E007A}]{1,3}\\u{E007F}|(?:\\p{Emoji}\\uFE0F\\u20E3?|\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Presentation})(?:\\u200D(?:\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F\\u20E3?))*", "yu");
var LATIN_RE = /(?:[\x20-\x7E\xA0-\xFF](?!\uFE0F)){1,1000}/y;
var MODIFIER_RE = new RegExp("\\p{M}+", "gu");
var NO_TRUNCATION = { limit: Infinity, ellipsis: "" };
var getStringTruncatedWidth = (input, truncationOptions = {}, widthOptions = {}) => {
  const LIMIT = truncationOptions.limit ?? Infinity;
  const ELLIPSIS = truncationOptions.ellipsis ?? "";
  const ELLIPSIS_WIDTH = truncationOptions?.ellipsisWidth ?? (ELLIPSIS ? getStringTruncatedWidth(ELLIPSIS, NO_TRUNCATION, widthOptions).width : 0);
  const ANSI_WIDTH = 0;
  const CONTROL_WIDTH = widthOptions.controlWidth ?? 0;
  const TAB_WIDTH = widthOptions.tabWidth ?? 8;
  const EMOJI_WIDTH = widthOptions.emojiWidth ?? 2;
  const FULL_WIDTH_WIDTH = 2;
  const REGULAR_WIDTH = widthOptions.regularWidth ?? 1;
  const WIDE_WIDTH = widthOptions.wideWidth ?? FULL_WIDTH_WIDTH;
  const PARSE_BLOCKS = [
    [LATIN_RE, REGULAR_WIDTH],
    [ANSI_RE, ANSI_WIDTH],
    [CONTROL_RE, CONTROL_WIDTH],
    [TAB_RE, TAB_WIDTH],
    [EMOJI_RE, EMOJI_WIDTH],
    [CJKT_WIDE_RE, WIDE_WIDTH]
  ];
  let indexPrev = 0;
  let index = 0;
  let length = input.length;
  let lengthExtra = 0;
  let truncationEnabled = false;
  let truncationIndex = length;
  let truncationLimit = Math.max(0, LIMIT - ELLIPSIS_WIDTH);
  let unmatchedStart = 0;
  let unmatchedEnd = 0;
  let width = 0;
  let widthExtra = 0;
  outer: while (true) {
    if (unmatchedEnd > unmatchedStart || index >= length && index > indexPrev) {
      const unmatched = input.slice(unmatchedStart, unmatchedEnd) || input.slice(indexPrev, index);
      lengthExtra = 0;
      for (const char of unmatched.replaceAll(MODIFIER_RE, "")) {
        const codePoint = char.codePointAt(0) || 0;
        if (isFullWidth(codePoint)) {
          widthExtra = FULL_WIDTH_WIDTH;
        } else if (isWideNotCJKTNotEmoji(codePoint)) {
          widthExtra = WIDE_WIDTH;
        } else {
          widthExtra = REGULAR_WIDTH;
        }
        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(truncationIndex, Math.max(unmatchedStart, indexPrev) + lengthExtra);
        }
        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }
        lengthExtra += char.length;
        width += widthExtra;
      }
      unmatchedStart = unmatchedEnd = 0;
    }
    if (index >= length) {
      break outer;
    }
    for (let i2 = 0, l2 = PARSE_BLOCKS.length; i2 < l2; i2++) {
      const [BLOCK_RE, BLOCK_WIDTH] = PARSE_BLOCKS[i2];
      BLOCK_RE.lastIndex = index;
      if (BLOCK_RE.test(input)) {
        lengthExtra = BLOCK_RE === CJKT_WIDE_RE ? getCodePointsLength(input.slice(index, BLOCK_RE.lastIndex)) : BLOCK_RE === EMOJI_RE ? 1 : BLOCK_RE.lastIndex - index;
        widthExtra = lengthExtra * BLOCK_WIDTH;
        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / BLOCK_WIDTH));
        }
        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }
        width += widthExtra;
        unmatchedStart = indexPrev;
        unmatchedEnd = index;
        index = indexPrev = BLOCK_RE.lastIndex;
        continue outer;
      }
    }
    index += 1;
  }
  return {
    width: truncationEnabled ? truncationLimit : width,
    index: truncationEnabled ? truncationIndex : length,
    truncated: truncationEnabled,
    ellipsed: truncationEnabled && LIMIT >= ELLIPSIS_WIDTH
  };
};
var dist_default = getStringTruncatedWidth;

// node_modules/fast-string-width/dist/index.js
var NO_TRUNCATION2 = {
  limit: Infinity,
  ellipsis: "",
  ellipsisWidth: 0
};
var fastStringWidth = (input, options = {}) => {
  return dist_default(input, NO_TRUNCATION2, options).width;
};
var dist_default2 = fastStringWidth;

// node_modules/fast-wrap-ansi/lib/main.js
var ESC = "\x1B";
var CSI = "\x9B";
var END_CODE = 39;
var ANSI_ESCAPE_BELL = "\x07";
var ANSI_CSI = "[";
var ANSI_OSC = "]";
var ANSI_SGR_TERMINATOR = "m";
var ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
var GROUP_REGEX = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`, "y");
var getClosingCode = (openingCode) => {
  if (openingCode >= 30 && openingCode <= 37)
    return 39;
  if (openingCode >= 90 && openingCode <= 97)
    return 39;
  if (openingCode >= 40 && openingCode <= 47)
    return 49;
  if (openingCode >= 100 && openingCode <= 107)
    return 49;
  if (openingCode === 1 || openingCode === 2)
    return 22;
  if (openingCode === 3)
    return 23;
  if (openingCode === 4)
    return 24;
  if (openingCode === 7)
    return 27;
  if (openingCode === 8)
    return 28;
  if (openingCode === 9)
    return 29;
  if (openingCode === 0)
    return 0;
  return void 0;
};
var wrapAnsiCode = (code) => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
var wrapAnsiHyperlink = (url) => `${ESC}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;
var wrapWord = (rows, word, columns) => {
  const characters = word[Symbol.iterator]();
  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let lastRow = rows.at(-1);
  let visible = lastRow === void 0 ? 0 : dist_default2(lastRow);
  let currentCharacter = characters.next();
  let nextCharacter = characters.next();
  let rawCharacterIndex = 0;
  while (!currentCharacter.done) {
    const character = currentCharacter.value;
    const characterLength = dist_default2(character);
    if (visible + characterLength <= columns) {
      rows[rows.length - 1] += character;
    } else {
      rows.push(character);
      visible = 0;
    }
    if (character === ESC || character === CSI) {
      isInsideEscape = true;
      isInsideLinkEscape = word.startsWith(ANSI_ESCAPE_LINK, rawCharacterIndex + 1);
    }
    if (isInsideEscape) {
      if (isInsideLinkEscape) {
        if (character === ANSI_ESCAPE_BELL) {
          isInsideEscape = false;
          isInsideLinkEscape = false;
        }
      } else if (character === ANSI_SGR_TERMINATOR) {
        isInsideEscape = false;
      }
    } else {
      visible += characterLength;
      if (visible === columns && !nextCharacter.done) {
        rows.push("");
        visible = 0;
      }
    }
    currentCharacter = nextCharacter;
    nextCharacter = characters.next();
    rawCharacterIndex += character.length;
  }
  lastRow = rows.at(-1);
  if (!visible && lastRow !== void 0 && lastRow.length && rows.length > 1) {
    rows[rows.length - 2] += rows.pop();
  }
};
var stringVisibleTrimSpacesRight = (string) => {
  const words = string.split(" ");
  let last2 = words.length;
  while (last2) {
    if (dist_default2(words[last2 - 1])) {
      break;
    }
    last2--;
  }
  if (last2 === words.length) {
    return string;
  }
  return words.slice(0, last2).join(" ") + words.slice(last2).join("");
};
var exec = (string, columns, options = {}) => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }
  let returnValue = "";
  let escapeCode;
  let escapeUrl;
  const words = string.split(" ");
  let rows = [""];
  let rowLength = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (options.trim !== false) {
      const row = rows.at(-1) ?? "";
      const trimmed = row.trimStart();
      if (row.length !== trimmed.length) {
        rows[rows.length - 1] = trimmed;
        rowLength = dist_default2(trimmed);
      }
    }
    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push("");
        rowLength = 0;
      }
      if (rowLength || options.trim === false) {
        rows[rows.length - 1] += " ";
        rowLength++;
      }
    }
    const wordLength = dist_default2(word);
    if (options.hard && wordLength > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((wordLength - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push("");
      }
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    if (rowLength + wordLength > columns && rowLength && wordLength) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        rowLength = dist_default2(rows.at(-1) ?? "");
        continue;
      }
      rows.push("");
      rowLength = 0;
    }
    if (rowLength + wordLength > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    rows[rows.length - 1] += word;
    rowLength += wordLength;
  }
  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }
  const preString = rows.join("\n");
  let inSurrogate = false;
  for (let i2 = 0; i2 < preString.length; i2++) {
    const character = preString[i2];
    returnValue += character;
    if (!inSurrogate) {
      inSurrogate = character >= "\uD800" && character <= "\uDBFF";
      if (inSurrogate) {
        continue;
      }
    } else {
      inSurrogate = false;
    }
    if (character === ESC || character === CSI) {
      GROUP_REGEX.lastIndex = i2 + 1;
      const groupsResult = GROUP_REGEX.exec(preString);
      const groups = groupsResult?.groups;
      if (groups?.code !== void 0) {
        const code = Number.parseFloat(groups.code);
        escapeCode = code === END_CODE ? void 0 : code;
      } else if (groups?.uri !== void 0) {
        escapeUrl = groups.uri.length === 0 ? void 0 : groups.uri;
      }
    }
    if (preString[i2 + 1] === "\n") {
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink("");
      }
      const closingCode = escapeCode ? getClosingCode(escapeCode) : void 0;
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(closingCode);
      }
    } else if (character === "\n") {
      if (escapeCode && getClosingCode(escapeCode)) {
        returnValue += wrapAnsiCode(escapeCode);
      }
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink(escapeUrl);
      }
    }
  }
  return returnValue;
};
var CRLF_OR_LF = /\r?\n/;
function wrapAnsi(string, columns, options) {
  return String(string).normalize().split(CRLF_OR_LF).map((line) => exec(line, columns, options)).join("\n");
}

// node_modules/@clack/core/dist/index.mjs
var import_sisteransi = __toESM(require_src(), 1);
import { ReadStream } from "node:tty";
function findCursor(s, o2, l2) {
  if (!l2.some((r2) => !r2.disabled))
    return s;
  const t2 = s + o2, n3 = Math.max(l2.length - 1, 0), e = t2 < 0 ? n3 : t2 > n3 ? 0 : t2;
  return l2[e]?.disabled ? findCursor(e, o2 < 0 ? -1 : 1, l2) : e;
}
function findTextCursor(s, o2, l2, i2) {
  const t2 = i2.split(`
`);
  let n3 = 0, e = s;
  for (const r2 of t2) {
    if (e <= r2.length)
      break;
    e -= r2.length + 1, n3++;
  }
  for (n3 = Math.max(0, Math.min(t2.length - 1, n3 + l2)), e = Math.min(e, t2[n3].length) + o2; e < 0 && n3 > 0; )
    n3--, e += t2[n3].length + 1;
  for (; e > t2[n3].length && n3 < t2.length - 1; )
    e -= t2[n3].length + 1, n3++;
  e = Math.max(0, Math.min(t2[n3].length, e));
  let h2 = 0;
  for (let r2 = 0; r2 < n3; r2++)
    h2 += t2[r2].length + 1;
  return h2 + e;
}
var a$1 = ["up", "down", "left", "right", "space", "enter", "cancel"];
var t = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var settings = {
  actions: new Set(a$1),
  aliases: /* @__PURE__ */ new Map([
    // vim support
    ["k", "up"],
    ["j", "down"],
    ["h", "left"],
    ["l", "right"],
    ["", "cancel"],
    // opinionated defaults!
    ["escape", "cancel"]
  ]),
  messages: {
    cancel: "Canceled",
    error: "Something went wrong"
  },
  withGuide: true,
  accessible: void 0,
  date: {
    monthNames: [...t],
    messages: {
      required: "Please enter a valid date",
      invalidMonth: "There are only 12 months in a year",
      invalidDay: (n3, e) => `There are only ${n3} days in ${e}`,
      afterMin: (n3) => `Date must be on or after ${n3.toISOString().slice(0, 10)}`,
      beforeMax: (n3) => `Date must be on or before ${n3.toISOString().slice(0, 10)}`
    }
  }
};
function updateSettings(n3) {
  if (n3.aliases !== void 0) {
    const e = n3.aliases;
    for (const s in e) {
      if (!Object.hasOwn(e, s)) continue;
      const i2 = e[s];
      i2 === void 0 || !settings.actions.has(i2) || settings.aliases.has(s) || settings.aliases.set(s, i2);
    }
  }
  if (n3.messages !== void 0) {
    const e = n3.messages;
    e.cancel !== void 0 && (settings.messages.cancel = e.cancel), e.error !== void 0 && (settings.messages.error = e.error);
  }
  if (n3.withGuide !== void 0 && (settings.withGuide = n3.withGuide !== false), n3.accessible !== void 0 && (settings.accessible = n3.accessible === true), n3.date !== void 0) {
    const e = n3.date;
    e.monthNames !== void 0 && (settings.date.monthNames = [...e.monthNames]), e.messages !== void 0 && (e.messages.required !== void 0 && (settings.date.messages.required = e.messages.required), e.messages.invalidMonth !== void 0 && (settings.date.messages.invalidMonth = e.messages.invalidMonth), e.messages.invalidDay !== void 0 && (settings.date.messages.invalidDay = e.messages.invalidDay), e.messages.afterMin !== void 0 && (settings.date.messages.afterMin = e.messages.afterMin), e.messages.beforeMax !== void 0 && (settings.date.messages.beforeMax = e.messages.beforeMax));
  }
}
function isAccessible(n3) {
  if (n3 !== void 0) return n3;
  if (settings.accessible !== void 0) return settings.accessible;
  const e = process.env.ACCESSIBLE;
  return e !== void 0 && e !== "" && e !== "0" && e !== "false";
}
function isActionKey(n3, e) {
  if (typeof n3 == "string")
    return settings.aliases.get(n3) === e;
  for (const s of n3)
    if (s !== void 0 && isActionKey(s, e))
      return true;
  return false;
}
function diffLines(i2, s) {
  if (i2 === s) return;
  const e = i2.split(`
`), t2 = s.split(`
`), r2 = Math.max(e.length, t2.length), f2 = [];
  for (let n3 = 0; n3 < r2; n3++)
    e[n3] !== t2[n3] && f2.push(n3);
  return {
    lines: f2,
    numLinesBefore: e.length,
    numLinesAfter: t2.length,
    numLines: r2
  };
}
var R = globalThis.process.platform.startsWith("win");
var CANCEL_SYMBOL = Symbol("clack:cancel");
function isCancel(e) {
  return e === CANCEL_SYMBOL;
}
function setRawMode(e, r2) {
  const o2 = e;
  o2.isTTY && o2.setRawMode(r2);
}
function block({
  input: e = stdin,
  output: r2 = stdout,
  overwrite: o2 = true,
  hideCursor: n3 = true
} = {}) {
  const s = l.createInterface({
    input: e,
    output: r2,
    prompt: "",
    tabSize: 1
  });
  l.emitKeypressEvents(e, s), e instanceof ReadStream && e.isTTY && e.setRawMode(true);
  const t2 = (f2, { name: a2, sequence: w }) => {
    const c3 = String(f2);
    if (isActionKey([c3, a2, w], "cancel")) {
      n3 && r2.write(import_sisteransi.cursor.show), process.exit(0);
      return;
    }
    if (!o2) return;
    const i2 = a2 === "return" ? 0 : -1, m3 = a2 === "return" ? -1 : 0;
    l.moveCursor(r2, i2, m3, () => {
      l.clearLine(r2, 1, () => {
        e.once("keypress", t2);
      });
    });
  };
  return n3 && r2.write(import_sisteransi.cursor.hide), e.once("keypress", t2), () => {
    e.off("keypress", t2), n3 && r2.write(import_sisteransi.cursor.show), e instanceof ReadStream && e.isTTY && !R && e.setRawMode(false), s.terminal = false, s.close();
  };
}
var getColumns = (e) => "columns" in e && typeof e.columns == "number" ? e.columns : 80;
var getRows = (e) => "rows" in e && typeof e.rows == "number" ? e.rows : 20;
function wrapTextWithPrefix(e, r2, o2, n3 = o2, s = o2, t2) {
  const f2 = getColumns(e ?? stdout);
  return wrapAnsi(r2, f2 - o2.length, {
    hard: true,
    trim: false
  }).split(`
`).map((c3, i2, m3) => {
    const d = t2 ? t2(c3, i2) : c3;
    return i2 === 0 ? `${n3}${d}` : i2 === m3.length - 1 ? `${s}${d}` : `${o2}${d}`;
  }).join(`
`);
}
function runValidation(e, a2) {
  if ("~standard" in e) {
    const n3 = e["~standard"].validate(a2);
    return n3 instanceof Promise ? n3.then((r2) => r2.issues?.at(0)?.message) : n3.issues?.at(0)?.message;
  }
  return e(a2);
}
var y = class {
  input;
  output;
  _abortSignal;
  rl;
  opts;
  _render;
  _track = false;
  _prevFrame = "";
  _subscribers = /* @__PURE__ */ new Map();
  _cursor = 0;
  state = "initial";
  error = "";
  value;
  userInput = "";
  /**
   * Whether accessible (static, screen-reader friendly) output is enabled for
   * this prompt, resolved from the `accessible` option, the global setting,
   * and the `ACCESSIBLE` env var.
   */
  get accessible() {
    return isAccessible(this.opts.accessible);
  }
  constructor(t2, e = true) {
    const { input: i2 = stdin, output: s = stdout, render: r2, signal: n3, ...o2 } = t2;
    this.opts = o2, this.onKeypress = this.onKeypress.bind(this), this.close = this.close.bind(this), this.render = this.render.bind(this), this._render = r2.bind(this), this._track = e, this._abortSignal = n3, this.input = i2, this.output = s;
  }
  /**
   * Unsubscribe all listeners
   */
  unsubscribe() {
    this._subscribers.clear();
  }
  /**
   * Set a subscriber with opts
   * @param event - The event name
   */
  setSubscriber(t2, e) {
    const i2 = this._subscribers.get(t2) ?? [];
    i2.push(e), this._subscribers.set(t2, i2);
  }
  /**
   * Subscribe to an event
   * @param event - The event name
   * @param cb - The callback
   */
  on(t2, e) {
    this.setSubscriber(t2, { cb: e });
  }
  /**
   * Subscribe to an event once
   * @param event - The event name
   * @param cb - The callback
   */
  once(t2, e) {
    this.setSubscriber(t2, { cb: e, once: true });
  }
  /**
   * Emit an event with data
   * @param event - The event name
   * @param data - The data to pass to the callback
   */
  emit(t2, ...e) {
    const i2 = this._subscribers.get(t2) ?? [], s = [];
    for (const r2 of i2)
      r2.cb(...e), r2.once && s.push(() => i2.splice(i2.indexOf(r2), 1));
    for (const r2 of s)
      r2();
  }
  prompt() {
    return new Promise((t2) => {
      if (this._abortSignal) {
        if (this._abortSignal.aborted)
          return this.state = "cancel", this.close(), t2(CANCEL_SYMBOL);
        this._abortSignal.addEventListener(
          "abort",
          () => {
            this.state = "cancel", this.close();
          },
          { once: true }
        );
      }
      this.rl = l__default.createInterface({
        input: this.input,
        tabSize: 2,
        prompt: "",
        escapeCodeTimeout: 50,
        terminal: true
      }), this.rl.prompt(), this.opts.initialUserInput !== void 0 && this._setUserInput(this.opts.initialUserInput, true), this.input.on("keypress", this.onKeypress), setRawMode(this.input, true), this.output.on("resize", this.render), this.render(), this.once("submit", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), setRawMode(this.input, false), t2(this.value);
      }), this.once("cancel", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), setRawMode(this.input, false), t2(CANCEL_SYMBOL);
      });
    });
  }
  _isActionKey(t2, e) {
    return t2 === "	";
  }
  _shouldSubmit(t2, e) {
    return true;
  }
  _setValue(t2) {
    this.value = t2, this.emit("value", this.value);
  }
  _setUserInput(t2, e) {
    this.userInput = t2 ?? "", this.emit("userInput", this.userInput), e && this._track && this.rl && (this.rl.write(this.userInput), this._cursor = this.rl.cursor);
  }
  _clearUserInput() {
    this.rl?.write(null, { ctrl: true, name: "u" }), this._setUserInput("");
  }
  async onKeypress(t2, e) {
    if (this.state !== "validating") {
      if (this._track && e.name !== "return" && (e.name && this._isActionKey(t2, e) && this.rl?.write(null, { ctrl: true, name: "h" }), this._cursor = this.rl?.cursor ?? 0, this._setUserInput(this.rl?.line)), this.state === "error" && (this.state = "active"), e?.name && (!this._track && settings.aliases.has(e.name) && this.emit("cursor", settings.aliases.get(e.name)), settings.actions.has(e.name) && this.emit("cursor", e.name)), t2 && (t2.toLowerCase() === "y" || t2.toLowerCase() === "n") && this.emit("confirm", t2.toLowerCase() === "y"), this.emit("key", t2, e), e?.name === "return" && this._shouldSubmit(t2, e)) {
        if (this.opts.validate) {
          const i2 = runValidation(this.opts.validate, this.value);
          let s;
          i2 instanceof Promise ? (this.state = "validating", this.render(), s = await i2) : s = i2, s && (this.error = s instanceof Error ? s.message : s, this.state = "error", this.rl?.write(this.userInput));
        }
        this.state !== "error" && (this.state = "submit");
      }
      isActionKey([t2, e?.name, e?.sequence], "cancel") && (this.state = "cancel"), (this.state === "submit" || this.state === "cancel") && this.emit("finalize"), this.render(), (this.state === "submit" || this.state === "cancel") && this.close();
    }
  }
  close() {
    this.input.unpipe(), this.input.removeListener("keypress", this.onKeypress), this.output.write(`
`), setRawMode(this.input, false), this.rl?.close(), this.rl = void 0, this.emit(`${this.state}`, this.value), this.unsubscribe();
  }
  restoreCursor() {
    const t2 = wrapAnsi(this._prevFrame, process.stdout.columns, { hard: true, trim: false }).split(`
`).length - 1;
    this.output.write(import_sisteransi.cursor.move(-999, t2 * -1));
  }
  render() {
    const t2 = wrapAnsi(this._render(this) ?? "", process.stdout.columns, {
      hard: true,
      trim: false
    });
    if (t2 !== this._prevFrame) {
      if (this.state === "initial")
        this.output.write(import_sisteransi.cursor.hide);
      else {
        const e = diffLines(this._prevFrame, t2), i2 = getRows(this.output);
        if (this.restoreCursor(), e) {
          const s = Math.max(0, e.numLinesAfter - i2), r2 = Math.max(0, e.numLinesBefore - i2);
          let n3 = e.lines.find((o2) => o2 >= s);
          if (n3 === void 0) {
            this._prevFrame = t2;
            return;
          }
          if (e.lines.length === 1) {
            this.output.write(import_sisteransi.cursor.move(0, n3 - r2)), this.output.write(import_sisteransi.erase.lines(1));
            const o2 = t2.split(`
`);
            this.output.write(o2[n3]), this._prevFrame = t2, this.output.write(import_sisteransi.cursor.move(0, o2.length - n3 - 1));
            return;
          } else if (e.lines.length > 1) {
            if (s < r2)
              n3 = s;
            else {
              const h2 = n3 - r2;
              h2 > 0 && this.output.write(import_sisteransi.cursor.move(0, h2));
            }
            this.output.write(import_sisteransi.erase.down());
            const f2 = t2.split(`
`).slice(n3);
            this.output.write(f2.join(`
`)), this._prevFrame = t2;
            return;
          }
        }
        this.output.write(import_sisteransi.erase.down());
      }
      this.output.write(t2), this.state === "initial" && (this.state = "active"), this._prevFrame = t2;
    }
  }
};
function p$1(l2, e) {
  if (l2 === void 0 || e.length === 0)
    return 0;
  const i2 = e.findIndex((s) => s.value === l2);
  return i2 !== -1 ? i2 : 0;
}
function m(l2, e) {
  return (e.label ?? String(e.value)).toLowerCase().includes(l2.toLowerCase());
}
function g(l2, e) {
  if (e)
    return l2 ? e : e[0];
}
var T$1 = class T extends y {
  filteredOptions;
  multiple;
  isNavigating = false;
  selectedValues = [];
  focusedValue;
  #e = 0;
  #s = "";
  #t;
  #i;
  #n;
  #l;
  get cursor() {
    return this.#e;
  }
  get userInputWithCursor() {
    if (!this.userInput)
      return styleText(["inverse", "hidden"], "_");
    if (this._cursor >= this.userInput.length)
      return `${this.userInput}\u2588`;
    const e = this.userInput.slice(0, this.cursor), t2 = this.userInput.slice(this.cursor, this.cursor + 1), i2 = this.userInput.slice(this.cursor + 1);
    return `${e}${styleText("inverse", t2)}${i2}`;
  }
  get options() {
    return typeof this.#i == "function" ? this.#i() : this.#i;
  }
  constructor(e) {
    super(e), this.#i = e.options, this.#n = e.placeholder, this.#l = e.completeOnTab === true;
    const t2 = this.options;
    this.filteredOptions = [...t2], this.multiple = e.multiple === true, this.#t = typeof e.options == "function" ? e.filter : e.filter ?? m;
    let i2;
    if (e.initialValue && Array.isArray(e.initialValue) ? this.multiple ? i2 = e.initialValue : i2 = e.initialValue.slice(0, 1) : !this.multiple && this.options.length > 0 && (i2 = [this.options[0]?.value]), i2)
      for (const s of i2) {
        const n3 = t2.findIndex((r2) => r2.value === s);
        n3 !== -1 && (this.toggleSelected(s), this.#e = n3);
      }
    this.focusedValue = this.options[this.#e]?.value, this.on("key", (s, n3) => this.#u(s, n3)), this.on("userInput", (s) => this.#o(s));
  }
  _isActionKey(e, t2) {
    return e === "	" || this.multiple && this.isNavigating && t2.name === "space" && e !== void 0 && e !== "";
  }
  #u(e, t2) {
    const i2 = t2.name === "up", s = t2.name === "down", n3 = t2.name === "return", r2 = this.userInput === "" || this.userInput === "	", u5 = this.#n, d = this.options, c3 = u5 !== void 0 && u5 !== "" && d.some(
      (o2) => !o2.disabled && (this.#t ? this.#t(u5, o2) : true)
    );
    if (t2.name === "tab" && r2 && c3) {
      this.userInput === "	" && this._clearUserInput(), this._setUserInput(u5, true), this.isNavigating = false;
      return;
    }
    if (t2.name === "tab" && this.#l && !this.multiple && this.focusedValue !== void 0) {
      const o2 = String(this.focusedValue);
      this._clearUserInput(), this._setUserInput(o2, true), this.isNavigating = false;
      return;
    }
    i2 || s ? (this.#e = findCursor(this.#e, i2 ? -1 : 1, this.filteredOptions), this.focusedValue = this.filteredOptions[this.#e]?.value, this.multiple || (this.selectedValues = [this.focusedValue]), this.isNavigating = true) : n3 ? this.value = g(this.multiple, this.selectedValues) : this.multiple ? this.focusedValue !== void 0 && (t2.name === "tab" || this.isNavigating && t2.name === "space") ? this.toggleSelected(this.focusedValue) : this.isNavigating = false : (this.focusedValue && (this.selectedValues = [this.focusedValue]), this.isNavigating = false);
  }
  deselectAll() {
    this.selectedValues = [];
  }
  toggleSelected(e) {
    this.filteredOptions.length !== 0 && (this.multiple ? this.selectedValues.includes(e) ? this.selectedValues = this.selectedValues.filter((t2) => t2 !== e) : this.selectedValues = [...this.selectedValues, e] : this.selectedValues = [e]);
  }
  #o(e) {
    if (e !== this.#s) {
      this.#s = e;
      const t2 = this.options;
      e && this.#t ? this.filteredOptions = t2.filter((n3) => this.#t?.(e, n3)) : this.filteredOptions = [...t2];
      const i2 = p$1(this.focusedValue, this.filteredOptions);
      this.#e = findCursor(i2, 0, this.filteredOptions);
      const s = this.filteredOptions[this.#e];
      s && !s.disabled ? this.focusedValue = s.value : this.focusedValue = void 0, this.multiple || (this.focusedValue !== void 0 ? this.toggleSelected(this.focusedValue) : this.deselectAll());
    }
  }
};
var r = class extends y {
  get cursor() {
    return this.value ? 0 : 1;
  }
  get _value() {
    return this.cursor === 0;
  }
  constructor(t2) {
    super(t2, false), this.value = !!t2.initialValue, this.on("userInput", () => {
      this.value = this._value;
    }), this.on("confirm", (i2) => {
      this.output.write(import_sisteransi.cursor.move(0, -1)), this.value = i2, this.state = "submit", this.close();
    }), this.on("cursor", () => {
      this.value = !this.value;
    });
  }
};
var _ = {
  Y: { type: "year", len: 4 },
  M: { type: "month", len: 2 },
  D: { type: "day", len: 2 }
};
function M(r2) {
  return [...r2].map((t2) => _[t2]);
}
function P(r2) {
  const i2 = new Intl.DateTimeFormat(r2, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(2e3, 0, 15)), s = [];
  let n3 = "/";
  for (const e of i2)
    e.type === "literal" ? n3 = e.value.trim() || e.value : (e.type === "year" || e.type === "month" || e.type === "day") && s.push({ type: e.type, len: e.type === "year" ? 4 : 2 });
  return { segments: s, separator: n3 };
}
function p(r2) {
  return Number.parseInt((r2 || "0").replace(/_/g, "0"), 10) || 0;
}
function f(r2) {
  return {
    year: p(r2.year),
    month: p(r2.month),
    day: p(r2.day)
  };
}
function c(r2, t2) {
  return new Date(r2 || 2001, t2 || 1, 0).getDate();
}
function b(r2) {
  const { year: t2, month: i2, day: s } = f(r2);
  if (!t2 || t2 < 0 || t2 > 9999 || !i2 || i2 < 1 || i2 > 12 || !s || s < 1) return;
  const n3 = new Date(Date.UTC(t2, i2 - 1, s));
  if (!(n3.getUTCFullYear() !== t2 || n3.getUTCMonth() !== i2 - 1 || n3.getUTCDate() !== s))
    return { year: t2, month: i2, day: s };
}
function C(r2) {
  const t2 = b(r2);
  return t2 ? new Date(Date.UTC(t2.year, t2.month - 1, t2.day)) : void 0;
}
function T2(r2, t2, i2, s) {
  const n3 = i2 ? {
    year: i2.getUTCFullYear(),
    month: i2.getUTCMonth() + 1,
    day: i2.getUTCDate()
  } : null, e = s ? {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate()
  } : null;
  return r2 === "year" ? { min: n3?.year ?? 1, max: e?.year ?? 9999 } : r2 === "month" ? {
    min: n3 && t2.year === n3.year ? n3.month : 1,
    max: e && t2.year === e.year ? e.month : 12
  } : {
    min: n3 && t2.year === n3.year && t2.month === n3.month ? n3.day : 1,
    max: e && t2.year === e.year && t2.month === e.month ? e.day : c(t2.year, t2.month)
  };
}
var U = class extends y {
  #i;
  #o;
  #t;
  #h;
  #u;
  #e = { segmentIndex: 0, positionInSegment: 0 };
  #n = true;
  #s = null;
  inlineError = "";
  get segmentCursor() {
    return { ...this.#e };
  }
  get segmentValues() {
    return { ...this.#t };
  }
  get segments() {
    return this.#i;
  }
  get separator() {
    return this.#o;
  }
  get formattedValue() {
    return this.#l(this.#t);
  }
  #l(t2) {
    return this.#i.map((i2) => t2[i2.type]).join(this.#o);
  }
  #r() {
    this._setUserInput(this.#l(this.#t)), this._setValue(C(this.#t) ?? void 0);
  }
  constructor(t2) {
    const i2 = t2.format ? { segments: M(t2.format), separator: t2.separator ?? "/" } : P(t2.locale), s = t2.separator ?? i2.separator, n3 = t2.format ? M(t2.format) : i2.segments, e = t2.initialValue ?? t2.defaultValue, m3 = e ? {
      year: String(e.getUTCFullYear()).padStart(4, "0"),
      month: String(e.getUTCMonth() + 1).padStart(2, "0"),
      day: String(e.getUTCDate()).padStart(2, "0")
    } : { year: "____", month: "__", day: "__" }, o2 = n3.map((a2) => m3[a2.type]).join(s);
    super({ ...t2, initialUserInput: o2 }, false), this.#i = n3, this.#o = s, this.#t = m3, this.#h = t2.minDate, this.#u = t2.maxDate, this.#r(), this.on("cursor", (a2) => this.#f(a2)), this.on("key", (a2, u5) => this.#y(a2, u5)), this.on("finalize", () => this.#p(t2));
  }
  #a() {
    const t2 = Math.max(0, Math.min(this.#e.segmentIndex, this.#i.length - 1)), i2 = this.#i[t2];
    if (i2)
      return this.#e.positionInSegment = Math.max(
        0,
        Math.min(this.#e.positionInSegment, i2.len - 1)
      ), { segment: i2, index: t2 };
  }
  #m(t2) {
    this.inlineError = "", this.#s = null;
    const i2 = this.#a();
    i2 && (this.#e.segmentIndex = Math.max(
      0,
      Math.min(this.#i.length - 1, i2.index + t2)
    ), this.#e.positionInSegment = 0, this.#n = true);
  }
  #d(t2) {
    const i2 = this.#a();
    if (!i2) return;
    const { segment: s } = i2, n3 = this.#t[s.type], e = !n3 || n3.replace(/_/g, "") === "", m3 = Number.parseInt((n3 || "0").replace(/_/g, "0"), 10) || 0, o2 = T2(
      s.type,
      f(this.#t),
      this.#h,
      this.#u
    );
    let a2;
    e ? a2 = t2 === 1 ? o2.min : o2.max : a2 = Math.max(Math.min(o2.max, m3 + t2), o2.min), this.#t = {
      ...this.#t,
      [s.type]: a2.toString().padStart(s.len, "0")
    }, this.#n = true, this.#s = null, this.#r();
  }
  #f(t2) {
    if (t2)
      switch (t2) {
        case "right":
          return this.#m(1);
        case "left":
          return this.#m(-1);
        case "up":
          return this.#d(1);
        case "down":
          return this.#d(-1);
      }
  }
  #y(t2, i2) {
    if (i2?.name === "backspace" || i2?.sequence === "\x7F" || i2?.sequence === "\b" || t2 === "\x7F" || t2 === "\b") {
      this.inlineError = "";
      const n3 = this.#a();
      if (!n3) return;
      if (!this.#t[n3.segment.type].replace(/_/g, "")) {
        this.#m(-1);
        return;
      }
      this.#t[n3.segment.type] = "_".repeat(n3.segment.len), this.#n = true, this.#e.positionInSegment = 0, this.#r();
      return;
    }
    if (i2?.name === "tab") {
      this.inlineError = "";
      const n3 = this.#a();
      if (!n3) return;
      const e = i2.shift ? -1 : 1, m3 = n3.index + e;
      m3 >= 0 && m3 < this.#i.length && (this.#e.segmentIndex = m3, this.#e.positionInSegment = 0, this.#n = true);
      return;
    }
    if (t2 && /^[0-9]$/.test(t2)) {
      const n3 = this.#a();
      if (!n3) return;
      const { segment: e } = n3, m3 = !this.#t[e.type].replace(/_/g, "");
      if (this.#n && this.#s !== null && !m3) {
        const h2 = this.#s + t2, d = { ...this.#t, [e.type]: h2 }, g2 = this.#g(d, e);
        if (g2) {
          this.inlineError = g2, this.#s = null, this.#n = false;
          return;
        }
        this.inlineError = "", this.#t[e.type] = h2, this.#s = null, this.#n = false, this.#r(), n3.index < this.#i.length - 1 && (this.#e.segmentIndex = n3.index + 1, this.#e.positionInSegment = 0, this.#n = true);
        return;
      }
      this.#n && !m3 && (this.#t[e.type] = "_".repeat(e.len), this.#e.positionInSegment = 0), this.#n = false, this.#s = null;
      const o2 = this.#t[e.type], a2 = o2.indexOf("_"), u5 = a2 >= 0 ? a2 : Math.min(this.#e.positionInSegment, e.len - 1);
      if (u5 < 0 || u5 >= e.len) return;
      let l2 = o2.slice(0, u5) + t2 + o2.slice(u5 + 1), D = false;
      if (u5 === 0 && o2 === "__" && (e.type === "month" || e.type === "day")) {
        const h2 = Number.parseInt(t2, 10);
        l2 = `0${t2}`, D = h2 <= (e.type === "month" ? 1 : 2);
      }
      if (e.type === "year" && (l2 = (o2.replace(/_/g, "") + t2).padStart(e.len, "_")), !l2.includes("_")) {
        const h2 = { ...this.#t, [e.type]: l2 }, d = this.#g(h2, e);
        if (d) {
          this.inlineError = d;
          return;
        }
      }
      this.inlineError = "", this.#t[e.type] = l2;
      const y2 = l2.includes("_") ? void 0 : b(this.#t);
      if (y2) {
        const { year: h2, month: d } = y2, g2 = c(h2, d);
        this.#t = {
          year: String(Math.max(0, Math.min(9999, h2))).padStart(4, "0"),
          month: String(Math.max(1, Math.min(12, d))).padStart(2, "0"),
          day: String(Math.max(1, Math.min(g2, y2.day))).padStart(2, "0")
        };
      }
      this.#r();
      const S = l2.indexOf("_");
      D ? (this.#n = true, this.#s = t2) : S >= 0 ? this.#e.positionInSegment = S : a2 >= 0 && n3.index < this.#i.length - 1 ? (this.#e.segmentIndex = n3.index + 1, this.#e.positionInSegment = 0, this.#n = true) : this.#e.positionInSegment = Math.min(u5 + 1, e.len - 1);
    }
  }
  #g(t2, i2) {
    const { month: s, day: n3 } = f(t2);
    if (i2.type === "month" && (s < 0 || s > 12))
      return settings.date.messages.invalidMonth;
    if (i2.type === "day" && (n3 < 0 || n3 > 31))
      return settings.date.messages.invalidDay(31, "any month");
  }
  #p(t2) {
    const { year: i2, month: s, day: n3 } = f(this.#t);
    if (i2 && s && n3) {
      const e = c(i2, s);
      this.#t = {
        ...this.#t,
        day: String(Math.min(n3, e)).padStart(2, "0")
      };
    }
    this.value = C(this.#t) ?? t2.defaultValue ?? void 0;
  }
};
var u$2 = class u extends y {
  options;
  cursor = 0;
  #t;
  getGroupItems(t2) {
    return this.options.filter((r2) => r2.group === t2);
  }
  isGroupSelected(t2) {
    const r2 = this.getGroupItems(t2), e = this.value;
    return e === void 0 ? false : r2.every((s) => e.includes(s.value));
  }
  toggleValue() {
    const t2 = this.options[this.cursor];
    if (t2 !== void 0)
      if (this.value === void 0 && (this.value = []), t2.group === true) {
        const r2 = t2.value, e = this.getGroupItems(r2);
        this.isGroupSelected(r2) ? this.value = this.value.filter(
          (s) => e.findIndex((i2) => i2.value === s) === -1
        ) : this.value = [...this.value, ...e.map((s) => s.value)], this.value = Array.from(new Set(this.value));
      } else {
        const r2 = this.value.includes(t2.value);
        this.value = r2 ? this.value.filter((e) => e !== t2.value) : [...this.value, t2.value];
      }
  }
  constructor(t2) {
    super(t2, false);
    const { options: r2 } = t2;
    this.#t = t2.selectableGroups !== false, this.options = Object.entries(r2).flatMap(([e, s]) => [
      { value: e, group: true, label: e },
      ...s.map((i2) => ({ ...i2, group: e }))
    ]), this.value = [...t2.initialValues ?? []], this.cursor = Math.max(
      this.options.findIndex(({ value: e }) => e === t2.cursorAt),
      this.#t ? 0 : 1
    ), this.on("cursor", (e) => {
      switch (e) {
        case "left":
        case "up": {
          this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
          const s = this.options[this.cursor]?.group === true;
          !this.#t && s && (this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1);
          break;
        }
        case "down":
        case "right": {
          this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
          const s = this.options[this.cursor]?.group === true;
          !this.#t && s && (this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1);
          break;
        }
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
};
var o = /* @__PURE__ */ new Set(["up", "down", "left", "right"]);
var h = class extends y {
  #t = false;
  #s;
  focused = "editor";
  get userInputWithCursor() {
    if (this.state === "submit")
      return this.userInput;
    const t2 = this.userInput;
    if (this.cursor >= t2.length)
      return `${t2}\u2588`;
    const s = t2.slice(0, this.cursor), r2 = t2.slice(this.cursor, this.cursor + 1), i2 = t2.slice(this.cursor + 1);
    return r2 === `
` ? `${s}\u2588
${i2}` : `${s}${styleText("inverse", r2)}${i2}`;
  }
  get cursor() {
    return this._cursor;
  }
  #r(t2) {
    if (this.userInput.length === 0) {
      this._setUserInput(t2);
      return;
    }
    this._setUserInput(
      this.userInput.slice(0, this.cursor) + t2 + this.userInput.slice(this.cursor)
    );
  }
  #i(t2) {
    const s = this.value ?? "";
    switch (t2) {
      case "up":
        this._cursor = findTextCursor(this._cursor, 0, -1, s);
        return;
      case "down":
        this._cursor = findTextCursor(this._cursor, 0, 1, s);
        return;
      case "left":
        this._cursor = findTextCursor(this._cursor, -1, 0, s);
        return;
      case "right":
        this._cursor = findTextCursor(this._cursor, 1, 0, s);
        return;
    }
  }
  _shouldSubmit(t2, s) {
    if (this.#s)
      return this.focused === "submit" ? true : (this.#r(`
`), this._cursor++, false);
    const r2 = this.#t;
    return this.#t = true, r2 && this.cursor === this.userInput.length ? (this.userInput[this.cursor - 1] === `
` && (this._setUserInput(
      this.userInput.slice(0, this.cursor - 1) + this.userInput.slice(this.cursor)
    ), this._cursor--), true) : (this.#r(`
`), this._cursor++, false);
  }
  constructor(t2) {
    const s = t2.initialUserInput ?? t2.initialValue;
    super(
      {
        ...t2,
        initialUserInput: s
      },
      false
    ), s !== void 0 && (this._cursor = s.length), this.#s = t2.showSubmit ?? false, this.on("key", (r2, i2) => {
      if (i2?.name && o.has(i2.name)) {
        this.#t = false, this.#i(i2.name);
        return;
      }
      if (r2 === "	" && this.#s) {
        this.focused = this.focused === "editor" ? "submit" : "editor";
        return;
      }
      if (i2?.name !== "return") {
        if (this.#t = false, i2?.name === "backspace" && this.cursor > 0) {
          this._setUserInput(
            this.userInput.slice(0, this.cursor - 1) + this.userInput.slice(this.cursor)
          ), this._cursor--;
          return;
        }
        if (i2?.name === "delete" && this.cursor < this.userInput.length) {
          this._setUserInput(
            this.userInput.slice(0, this.cursor) + this.userInput.slice(this.cursor + 1)
          );
          return;
        }
        r2 && (this.#s && this.focused === "submit" && (this.focused = "editor"), this.#r(r2 ?? ""), this._cursor++);
      }
    }), this.on("userInput", (r2) => {
      this._setValue(r2);
    }), this.on("finalize", () => {
      this.value || (this.value = t2.defaultValue), this.value === void 0 && (this.value = "");
    });
  }
};
var a = class extends y {
  options;
  cursor = 0;
  get _value() {
    return this.options[this.cursor]?.value;
  }
  get _enabledOptions() {
    return this.options.filter((e) => e.disabled !== true);
  }
  toggleAll() {
    const e = this._enabledOptions, i2 = this.value !== void 0 && this.value.length === e.length;
    this.value = i2 ? [] : e.map((t2) => t2.value);
  }
  toggleInvert() {
    const e = this.value;
    if (!e)
      return;
    const i2 = this._enabledOptions.filter((t2) => !e.includes(t2.value));
    this.value = i2.map((t2) => t2.value);
  }
  toggleValue() {
    this.value === void 0 && (this.value = []);
    const e = this.value.includes(this._value);
    this.value = e ? this.value.filter((i2) => i2 !== this._value) : [...this.value, this._value];
  }
  constructor(e) {
    super(e, false), this.options = e.options, this.value = [...e.initialValues ?? []];
    const i2 = Math.max(
      this.options.findIndex(({ value: t2 }) => t2 === e.cursorAt),
      0
    );
    this.cursor = this.options[i2]?.disabled ? findCursor(i2, 1, this.options) : i2, this.on("key", (t2, l2) => {
      l2.name === "a" && this.toggleAll(), l2.name === "i" && this.toggleInvert();
    }), this.on("cursor", (t2) => {
      switch (t2) {
        case "left":
        case "up":
          this.cursor = findCursor(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = findCursor(this.cursor, 1, this.options);
          break;
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
};
var u$1 = class u2 extends y {
  _mask = "\u2022";
  get cursor() {
    return this._cursor;
  }
  get masked() {
    return this.userInput.replaceAll(/./g, this._mask);
  }
  get userInputWithCursor() {
    if (this.state === "submit" || this.state === "cancel")
      return this.masked;
    const t2 = this.userInput;
    if (this.cursor >= t2.length)
      return `${this.masked}${styleText(["inverse", "hidden"], "_")}`;
    const s = this.masked, r2 = s.slice(0, this.cursor), i2 = s.slice(this.cursor, this.cursor + 1), o2 = s.slice(this.cursor + 1);
    return `${r2}${styleText("inverse", i2)}${o2}`;
  }
  clear() {
    this._clearUserInput();
  }
  constructor({ mask: t2, ...s }) {
    super(s), this._mask = t2 ?? "\u2022", this.on("userInput", (r2) => {
      this._setValue(r2);
    }), this.on("finalize", () => {
      this.value === void 0 && (this.value = "");
    });
  }
};
var n$1 = class n extends y {
  options;
  cursor = 0;
  get _selectedValue() {
    return this.options[this.cursor];
  }
  changeValue() {
    const e = this._selectedValue;
    this.value = e === void 0 ? void 0 : e.value;
  }
  constructor(e) {
    super(e, false), this.options = e.options;
    const o2 = this.options.findIndex(({ value: s }) => s === e.initialValue), t2 = o2 === -1 ? 0 : o2;
    this.cursor = this.options[t2]?.disabled ? findCursor(t2, 1, this.options) : t2, this.changeValue(), this.on("cursor", (s) => {
      switch (s) {
        case "left":
        case "up":
          this.cursor = findCursor(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = findCursor(this.cursor, 1, this.options);
          break;
      }
      this.changeValue();
    });
  }
};
var u3 = class extends y {
  options;
  cursor = 0;
  constructor(t2) {
    super(t2, false), this.options = t2.options;
    const s = t2.caseSensitive === true, i2 = this.options.map(({ value: [e] }) => s ? e : e?.toLowerCase());
    this.cursor = Math.max(i2.indexOf(t2.initialValue), 0), this.on("key", (e) => {
      if (!e)
        return;
      const o2 = s ? e : e.toLowerCase();
      if (!i2.includes(o2))
        return;
      const n3 = this.options.find(({ value: [r2] }) => s ? r2 === o2 : r2?.toLowerCase() === o2);
      n3 && (this.value = n3.value, this.state = "submit", this.emit("submit"));
    });
  }
};
var n2 = class extends y {
  get userInputWithCursor() {
    if (this.state === "submit")
      return this.userInput;
    const t2 = this.userInput;
    if (this.cursor >= t2.length)
      return `${this.userInput}\u2588`;
    const r2 = t2.slice(0, this.cursor), s = t2.slice(this.cursor, this.cursor + 1), e = t2.slice(this.cursor + 1);
    return `${r2}${styleText("inverse", s)}${e}`;
  }
  get cursor() {
    return this._cursor;
  }
  constructor(t2) {
    super({
      ...t2,
      initialUserInput: t2.initialUserInput ?? t2.initialValue
    }), this.on("userInput", (r2) => {
      this._setValue(r2);
    }), this.on("finalize", () => {
      this.value || (this.value = t2.defaultValue), this.value === void 0 && (this.value = "");
    });
  }
};

// node_modules/@clack/prompts/dist/index.mjs
import { styleText as styleText2, stripVTControlCharacters } from "node:util";
import process$1 from "node:process";
var import_sisteransi2 = __toESM(require_src(), 1);
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
function isUnicodeSupported() {
  if (process$1.platform !== "win32") {
    return process$1.env.TERM !== "linux";
  }
  return Boolean(process$1.env.CI) || Boolean(process$1.env.WT_SESSION) || Boolean(process$1.env.TERMINUS_SUBLIME) || process$1.env.ConEmuTask === "{cmd::Cmder}" || process$1.env.TERM_PROGRAM === "Terminus-Sublime" || process$1.env.TERM_PROGRAM === "vscode" || process$1.env.TERM === "xterm-256color" || process$1.env.TERM === "alacritty" || process$1.env.TERMINAL_EMULATOR === "JetBrains-JediTerm";
}
var unicode = isUnicodeSupported();
var isCI = () => process.env.CI === "true";
var isTTY = (o2) => o2.isTTY === true;
var unicodeOr = (o2, e) => unicode ? o2 : e;
var S_STEP_ACTIVE = unicodeOr("\u25C6", "*");
var S_STEP_CANCEL = unicodeOr("\u25A0", "x");
var S_STEP_ERROR = unicodeOr("\u25B2", "x");
var S_STEP_SUBMIT = unicodeOr("\u25C7", "o");
var S_BAR_START = unicodeOr("\u250C", "T");
var S_BAR = unicodeOr("\u2502", "|");
var S_BAR_END = unicodeOr("\u2514", "\u2014");
var S_BAR_START_RIGHT = unicodeOr("\u2510", "T");
var S_BAR_END_RIGHT = unicodeOr("\u2518", "\u2014");
var S_RADIO_ACTIVE = unicodeOr("\u25CF", ">");
var S_RADIO_INACTIVE = unicodeOr("\u25CB", " ");
var S_CHECKBOX_ACTIVE = unicodeOr("\u25FB", "[\u2022]");
var S_CHECKBOX_SELECTED = unicodeOr("\u25FC", "[+]");
var S_CHECKBOX_INACTIVE = unicodeOr("\u25FB", "[ ]");
var S_PASSWORD_MASK = unicodeOr("\u25AA", "\u2022");
var S_BAR_H = unicodeOr("\u2500", "-");
var S_CORNER_TOP_RIGHT = unicodeOr("\u256E", "+");
var S_CONNECT_LEFT = unicodeOr("\u251C", "+");
var S_CORNER_BOTTOM_RIGHT = unicodeOr("\u256F", "+");
var S_CORNER_BOTTOM_LEFT = unicodeOr("\u2570", "+");
var S_CORNER_TOP_LEFT = unicodeOr("\u256D", "+");
var S_INFO = unicodeOr("\u25CF", "\u2022");
var S_SUCCESS = unicodeOr("\u25C6", "*");
var S_WARN = unicodeOr("\u25B2", "!");
var S_ERROR = unicodeOr("\u25A0", "x");
var symbol = (o2) => {
  switch (o2) {
    case "initial":
    case "active":
      return styleText2("cyan", S_STEP_ACTIVE);
    case "cancel":
      return styleText2("red", S_STEP_CANCEL);
    case "error":
      return styleText2("yellow", S_STEP_ERROR);
    case "submit":
      return styleText2("green", S_STEP_SUBMIT);
    case "validating":
      return styleText2("dim", S_STEP_ACTIVE);
  }
};
var symbolBar = (o2) => {
  switch (o2) {
    case "initial":
    case "active":
      return styleText2("cyan", S_BAR);
    case "cancel":
      return styleText2("red", S_BAR);
    case "error":
      return styleText2("yellow", S_BAR);
    case "submit":
      return styleText2("green", S_BAR);
  }
};
function formatInstructionFooter(o2, e) {
  const r2 = [`${e ? `${styleText2("cyan", S_BAR)}  ` : ""}${o2.join(" \u2022 ")}`];
  return e && r2.push(styleText2("cyan", S_BAR_END)), r2;
}
var I = (l2, e, w, p3, b3, C3 = false) => {
  let r2 = e, O = 0;
  if (C3)
    for (let i2 = p3 - 1; i2 >= w; i2--) {
      const m3 = l2[i2];
      if (m3 && (r2 -= m3.length), O++, r2 <= b3) break;
    }
  else
    for (let i2 = w; i2 < p3; i2++) {
      const m3 = l2[i2];
      if (m3 && (r2 -= m3.length), O++, r2 <= b3) break;
    }
  return { lineCount: r2, removals: O };
};
var limitOptions = ({
  cursor: l2,
  options: e,
  style: w,
  output: p3 = process.stdout,
  maxItems: b3 = Number.POSITIVE_INFINITY,
  columnPadding: C3 = 0,
  rowPadding: r2 = 4
}) => {
  const i2 = getColumns(p3) - C3, m3 = getRows(p3), M2 = styleText2("dim", "..."), v = Math.max(m3 - r2, 0), a2 = Math.max(Math.min(b3, v), 5);
  let f2 = 0;
  l2 >= a2 - 3 && (f2 = Math.max(
    Math.min(l2 - a2 + 3, e.length - a2),
    0
  ));
  let d = a2 < e.length && f2 > 0, c3 = a2 < e.length && f2 + a2 < e.length;
  const W2 = Math.min(
    f2 + a2,
    e.length
  ), s = [];
  let g2 = 0;
  d && g2++, c3 && g2++;
  const T3 = f2 + (d ? 1 : 0), y2 = W2 - (c3 ? 1 : 0);
  for (let t2 = T3; t2 < y2; t2++) {
    const n3 = e[t2], o2 = n3 ? w(n3, t2 === l2) : "", h2 = wrapAnsi(o2, i2, {
      hard: true,
      trim: false
    }).split(`
`);
    s.push(h2), g2 += h2.length;
  }
  if (g2 > v) {
    let t2 = 0, n3 = 0, o2 = g2;
    const h2 = l2 - T3;
    let u5 = v;
    const L = () => I(s, o2, 0, h2, u5), E2 = () => I(
      s,
      o2,
      h2 + 1,
      s.length,
      u5,
      true
    );
    d ? ({ lineCount: o2, removals: t2 } = L(), o2 > u5 && (c3 || (u5 -= 1), { lineCount: o2, removals: n3 } = E2())) : (c3 || (u5 -= 1), { lineCount: o2, removals: n3 } = E2(), o2 > u5 && (u5 -= 1, { lineCount: o2, removals: t2 } = L())), t2 > 0 && (d = true, s.splice(0, t2)), n3 > 0 && (c3 = true, s.splice(s.length - n3, n3));
  }
  const x2 = [];
  d && x2.push(M2);
  for (const t2 of s)
    for (const n3 of t2)
      x2.push(n3);
  return c3 && x2.push(M2), x2;
};
function E(t2) {
  return t2.label ?? String(t2.value ?? "");
}
function P2(t2, c3) {
  if (!t2)
    return true;
  const n3 = (c3.label ?? String(c3.value ?? "")).toLowerCase(), i2 = (c3.hint ?? "").toLowerCase(), r2 = String(c3.value).toLowerCase(), o2 = t2.toLowerCase();
  return n3.includes(o2) || i2.includes(o2) || r2.includes(o2);
}
function j(t2, c3) {
  const n3 = [];
  for (const i2 of c3)
    t2.includes(i2.value) && n3.push(i2);
  return n3;
}
var autocomplete = (t2) => new T$1({
  options: t2.options,
  initialValue: t2.initialValue ? [t2.initialValue] : void 0,
  initialUserInput: t2.initialUserInput,
  placeholder: t2.placeholder,
  completeOnTab: t2.completeOnTab,
  filter: t2.filter ?? ((n3, i2) => P2(n3, i2)),
  signal: t2.signal,
  input: t2.input,
  output: t2.output,
  validate: t2.validate,
  render() {
    const n3 = t2.withGuide ?? settings.withGuide, i2 = n3 ? [`${styleText2("gray", S_BAR)}`, `${symbol(this.state)}  ${t2.message}`] : [`${symbol(this.state)}  ${t2.message}`], r2 = this.userInput, o2 = this.options, m3 = t2.placeholder, p3 = r2 === "" && m3 !== void 0, $ = (l2, s) => {
      const a2 = E(l2), u5 = l2.hint && l2.value === this.focusedValue ? styleText2("dim", ` (${l2.hint})`) : "";
      switch (s) {
        case "active":
          return `${styleText2("green", S_RADIO_ACTIVE)} ${a2}${u5}`;
        case "inactive":
          return `${styleText2("dim", S_RADIO_INACTIVE)} ${styleText2("dim", a2)}`;
        case "disabled":
          return `${styleText2("gray", S_RADIO_INACTIVE)} ${styleText2(["strikethrough", "gray"], a2)}`;
      }
    };
    switch (this.state) {
      case "submit": {
        const l2 = j(this.selectedValues, o2), s = l2.length > 0 ? `  ${styleText2("dim", l2.map(E).join(", "))}` : "", a2 = n3 ? styleText2("gray", S_BAR) : "";
        return `${i2.join(`
`)}
${a2}${s}`;
      }
      case "cancel": {
        const l2 = r2 ? `  ${styleText2(["strikethrough", "dim"], r2)}` : "", s = n3 ? styleText2("gray", S_BAR) : "";
        return `${i2.join(`
`)}
${s}${l2}`;
      }
      default: {
        const l2 = this.state === "error" ? "yellow" : "cyan", s = n3 ? `${styleText2(l2, S_BAR)}  ` : "", a2 = n3 ? styleText2(l2, S_BAR_END) : "";
        let u5 = "";
        if (this.isNavigating || p3) {
          const d = p3 ? m3 : r2;
          u5 = d !== "" ? ` ${styleText2("dim", d)}` : "";
        } else
          u5 = ` ${this.userInputWithCursor}`;
        const V = this.filteredOptions.length !== o2.length ? styleText2(
          "dim",
          ` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? "" : "es"})`
        ) : "", b3 = this.filteredOptions.length === 0 && r2 ? [`${s}${styleText2("yellow", "No matches found")}`] : [], y2 = this.state === "error" ? [`${s}${styleText2("yellow", this.error)}`] : [];
        n3 && i2.push(`${s.trimEnd()}`), i2.push(
          `${s}${styleText2("dim", "Search:")}${u5}${V}`,
          ...b3,
          ...y2
        );
        const S = [
          `${styleText2("dim", "\u2191/\u2193")} to select`,
          ...t2.completeOnTab ? [`${styleText2("dim", "Tab:")} complete`] : [],
          `${styleText2("dim", "Enter:")} confirm`,
          `${styleText2("dim", "Type:")} to search`
        ], g2 = [`${s}${S.join(" \u2022 ")}`, a2], O = this.filteredOptions.length === 0 ? [] : limitOptions({
          cursor: this.cursor,
          options: this.filteredOptions,
          columnPadding: n3 ? 3 : 0,
          // for `|  ` when guide is shown
          rowPadding: i2.length + g2.length,
          style: (d, f2) => $(
            d,
            d.disabled ? "disabled" : f2 ? "active" : "inactive"
          ),
          maxItems: t2.maxItems,
          output: t2.output
        });
        return [
          ...i2,
          ...O.map((d) => `${s}${d}`),
          ...g2
        ].join(`
`);
      }
    }
  }
}).prompt();
var autocompleteMultiselect = (t2) => {
  const c3 = (i2, r2, o2, m3) => {
    const p3 = o2.includes(i2.value), $ = i2.label ?? String(i2.value ?? ""), l2 = i2.hint && m3 !== void 0 && i2.value === m3 ? styleText2("dim", ` (${i2.hint})`) : "", s = p3 ? styleText2("green", S_CHECKBOX_SELECTED) : styleText2("dim", S_CHECKBOX_INACTIVE);
    return i2.disabled ? `${styleText2("gray", S_CHECKBOX_INACTIVE)} ${styleText2(["strikethrough", "gray"], $)}` : r2 ? `${s} ${$}${l2}` : `${s} ${styleText2("dim", $)}`;
  }, n3 = new T$1({
    options: t2.options,
    multiple: true,
    placeholder: t2.placeholder,
    filter: t2.filter ?? ((i2, r2) => P2(i2, r2)),
    validate: () => {
      if (t2.required && n3.selectedValues.length === 0)
        return "Please select at least one item";
    },
    initialValue: t2.initialValues,
    signal: t2.signal,
    input: t2.input,
    output: t2.output,
    render() {
      const i2 = t2.withGuide ?? settings.withGuide, r2 = `${i2 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  ${t2.message}
`, o2 = this.userInput, m3 = t2.placeholder, p3 = o2 === "" && m3 !== void 0, $ = this.isNavigating || p3 ? styleText2("dim", p3 ? m3 : o2) : this.userInputWithCursor, l2 = this.options, s = this.filteredOptions.length !== l2.length ? styleText2(
        "dim",
        ` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? "" : "es"})`
      ) : "";
      switch (this.state) {
        case "submit":
          return `${r2}${i2 ? `${styleText2("gray", S_BAR)}  ` : ""}${styleText2(
            "dim",
            `${this.selectedValues.length} items selected`
          )}`;
        case "cancel":
          return `${r2}${i2 ? `${styleText2("gray", S_BAR)}  ` : ""}${styleText2(
            ["strikethrough", "dim"],
            o2
          )}`;
        default: {
          const a2 = this.state === "error" ? "yellow" : "cyan", u5 = i2 ? `${styleText2(a2, S_BAR)}  ` : "", V = i2 ? styleText2(a2, S_BAR_END) : "", b3 = [
            `${styleText2("dim", "\u2191/\u2193")} to navigate`,
            `${styleText2("dim", this.isNavigating ? "Space/Tab:" : "Tab:")} select`,
            `${styleText2("dim", "Enter:")} confirm`,
            `${styleText2("dim", "Type:")} to search`
          ], y2 = this.filteredOptions.length === 0 && o2 ? [`${u5}${styleText2("yellow", "No matches found")}`] : [], S = this.state === "error" ? [`${u5}${styleText2("yellow", this.error)}`] : [], g2 = [
            ...`${r2}${i2 ? styleText2(a2, S_BAR) : ""}`.split(`
`),
            `${u5}${styleText2("dim", "Search:")} ${$}${s}`,
            ...y2,
            ...S
          ], O = [`${u5}${b3.join(" \u2022 ")}`, V], d = limitOptions({
            cursor: this.cursor,
            options: this.filteredOptions,
            style: (f2, L) => c3(f2, L, this.selectedValues, this.focusedValue),
            maxItems: t2.maxItems,
            output: t2.output,
            rowPadding: g2.length + O.length
          });
          return [
            ...g2,
            ...d.map((f2) => `${u5}${f2}`),
            ...O
          ].join(`
`);
        }
      }
    }
  });
  return n3.prompt();
};
var K = [
  S_CORNER_TOP_LEFT,
  S_CORNER_TOP_RIGHT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT
];
var Q = [S_BAR_START, S_BAR_START_RIGHT, S_BAR_END, S_BAR_END_RIGHT];
function A$1(n3, e, t2, o2) {
  let i2 = t2, f2 = t2;
  return o2 === "center" ? i2 = Math.floor((e - n3) / 2) : o2 === "right" && (i2 = e - n3 - t2), f2 = e - i2 - n3, [i2, f2];
}
var U2 = (n3) => n3;
var box = (n3 = "", e = "", t2) => {
  const o2 = t2?.output ?? process.stdout, i2 = getColumns(o2), R2 = 1 * 2, u5 = t2?.titlePadding ?? 1, h2 = t2?.contentPadding ?? 2, w = t2?.width === void 0 || t2.width === "auto" ? 1 : Math.min(1, t2.width), m3 = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR)} ` : "", b3 = t2?.formatBorder ?? U2, a2 = (t2?.rounded ? K : Q).map(b3), _2 = b3(S_BAR_H), p3 = b3(S_BAR), x2 = dist_default2(m3), B = dist_default2(e), y2 = i2 - x2;
  let r2 = Math.floor(i2 * w) - x2;
  if (t2?.width === "auto") {
    const c3 = n3.split(`
`);
    let s = B + u5 * 2;
    for (const G of c3) {
      const P3 = dist_default2(G) + h2 * 2;
      P3 > s && (s = P3);
    }
    const g2 = s + R2;
    g2 < r2 && (r2 = g2);
  }
  r2 % 2 !== 0 && (r2 < y2 ? r2++ : r2--);
  const d = r2 - R2, T3 = d - u5 * 2, S = B > T3 ? `${e.slice(0, T3 - 3)}...` : e, [O, W2] = A$1(
    dist_default2(S),
    d,
    u5,
    t2?.titleAlign
  ), L = wrapAnsi(n3, d - h2 * 2, {
    hard: true,
    trim: false
  });
  o2.write(
    `${m3}${a2[0]}${_2.repeat(O)}${S}${_2.repeat(W2)}${a2[1]}
`
  );
  const E2 = L.split(`
`);
  for (const c3 of E2) {
    const [s, g2] = A$1(
      dist_default2(c3),
      d,
      h2,
      t2?.contentAlign
    );
    o2.write(
      `${m3}${p3}${" ".repeat(s)}${c3}${" ".repeat(g2)}${p3}
`
    );
  }
  o2.write(`${m3}${a2[2]}${_2.repeat(d)}${a2[3]}
`);
};
var confirm = (e) => {
  const a2 = e.active ?? "Yes", o2 = e.inactive ?? "No";
  return new r({
    active: a2,
    inactive: o2,
    signal: e.signal,
    input: e.input,
    output: e.output,
    initialValue: e.initialValue ?? true,
    render() {
      const i2 = e.withGuide ?? settings.withGuide, u5 = `${symbol(this.state)}  `, l2 = i2 ? `${styleText2("gray", S_BAR)}  ` : "", f2 = wrapTextWithPrefix(
        e.output,
        e.message,
        l2,
        u5
      ), s = `${i2 ? `${styleText2("gray", S_BAR)}
` : ""}${f2}
`, c3 = this.value ? a2 : o2;
      switch (this.state) {
        case "submit": {
          const r2 = i2 ? `${styleText2("gray", S_BAR)}  ` : "";
          return `${s}${r2}${styleText2("dim", c3)}`;
        }
        case "cancel": {
          const r2 = i2 ? `${styleText2("gray", S_BAR)}  ` : "";
          return `${s}${r2}${styleText2(["strikethrough", "dim"], c3)}${i2 ? `
${styleText2("gray", S_BAR)}` : ""}`;
        }
        default: {
          const r2 = i2 ? `${styleText2("cyan", S_BAR)}  ` : "", g2 = i2 ? styleText2("cyan", S_BAR_END) : "";
          return `${s}${r2}${this.value ? `${styleText2("green", S_RADIO_ACTIVE)} ${a2}` : `${styleText2("dim", S_RADIO_INACTIVE)} ${styleText2("dim", a2)}`}${e.vertical ? i2 ? `
${styleText2("cyan", S_BAR)}  ` : `
` : ` ${styleText2("dim", "/")} `}${this.value ? `${styleText2("dim", S_RADIO_INACTIVE)} ${styleText2("dim", o2)}` : `${styleText2("green", S_RADIO_ACTIVE)} ${o2}`}
${g2}
`;
        }
      }
    }
  }).prompt();
};
var date = (e) => {
  const r2 = e.validate;
  return new U({
    ...e,
    validate(t2) {
      if (t2 === void 0)
        return e.defaultValue !== void 0 ? void 0 : r2 ? runValidation(r2, t2) : settings.date.messages.required;
      const o2 = (i2) => i2.toISOString().slice(0, 10);
      if (e.minDate && o2(t2) < o2(e.minDate))
        return settings.date.messages.afterMin(e.minDate);
      if (e.maxDate && o2(t2) > o2(e.maxDate))
        return settings.date.messages.beforeMax(e.maxDate);
      if (r2) return runValidation(r2, t2);
    },
    render() {
      const t2 = (e?.withGuide ?? settings.withGuide) !== false, i2 = `${`${t2 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  `}${e.message}
`, l2 = this.state !== "initial" ? this.state : "active", d = b2(this, l2), c3 = this.value instanceof Date ? this.formattedValue : "";
      switch (this.state) {
        case "error": {
          const a2 = this.error ? `  ${styleText2("yellow", this.error)}` : "", s = t2 ? `${styleText2("yellow", S_BAR)}  ` : "", f2 = t2 ? styleText2("yellow", S_BAR_END) : "";
          return `${i2.trim()}
${s}${d}
${f2}${a2}
`;
        }
        case "submit": {
          const a2 = c3 ? `  ${styleText2("dim", c3)}` : "", s = t2 ? styleText2("gray", S_BAR) : "";
          return `${i2}${s}${a2}`;
        }
        case "cancel": {
          const a2 = c3 ? `  ${styleText2(["strikethrough", "dim"], c3)}` : "", s = t2 ? styleText2("gray", S_BAR) : "";
          return `${i2}${s}${a2}${c3.trim() ? `
${s}` : ""}`;
        }
        default: {
          const a2 = t2 ? `${styleText2("cyan", S_BAR)}  ` : "", s = t2 ? styleText2("cyan", S_BAR_END) : "", f2 = t2 ? `${styleText2("cyan", S_BAR)}  ` : "", g2 = this.inlineError ? `
${f2}${styleText2("yellow", this.inlineError)}` : "";
          return `${i2}${a2}${d}${g2}
${s}
`;
        }
      }
    }
  }).prompt();
};
function b2(e, r2) {
  const t2 = e.segmentValues, o2 = e.segmentCursor;
  if (r2 === "submit" || r2 === "cancel")
    return e.formattedValue;
  const i2 = styleText2("gray", e.separator);
  return e.segments.map((l2, d) => {
    const c3 = d === o2.segmentIndex && !["submit", "cancel"].includes(r2), a2 = p2[l2.type];
    return x(t2[l2.type], { isActive: c3, label: a2 });
  }).join(i2);
}
function x(e, r2) {
  const t2 = !e || e.replace(/_/g, "") === "";
  return r2.isActive ? styleText2("inverse", t2 ? r2.label : e.replace(/_/g, " ")) : t2 ? styleText2("dim", r2.label) : e.replace(/_/g, styleText2("dim", " "));
}
var p2 = {
  year: "yyyy",
  month: "mm",
  day: "dd"
};
var group = async (o2, r2) => {
  const t2 = {}, p3 = Object.keys(o2);
  for (const e of p3) {
    const i2 = o2[e], n3 = await i2({ results: t2 })?.catch((a2) => {
      throw a2;
    });
    if (typeof r2?.onCancel == "function" && isCancel(n3)) {
      t2[e] = "canceled", r2.onCancel({ results: t2 });
      continue;
    }
    t2[e] = n3;
  }
  return t2;
};
var MULTISELECT_INSTRUCTIONS = [
  `${styleText2("dim", "\u2191/\u2193")} to navigate`,
  `${styleText2("dim", "Space:")} select`,
  `${styleText2("dim", "Enter:")} confirm`
];
var m2 = (i2, u5) => i2.split(`
`).map((d) => u5(d)).join(`
`);
var multiselect = (i2) => {
  const u5 = (t2, a2) => {
    const r2 = t2.label ?? String(t2.value);
    return a2 === "disabled" ? `${styleText2("gray", S_CHECKBOX_INACTIVE)} ${m2(r2, (o2) => styleText2(["strikethrough", "gray"], o2))}${t2.hint ? ` ${styleText2("dim", `(${t2.hint ?? "disabled"})`)}` : ""}` : a2 === "active" ? `${styleText2("cyan", S_CHECKBOX_ACTIVE)} ${r2}${t2.hint ? ` ${styleText2("dim", `(${t2.hint})`)}` : ""}` : a2 === "selected" ? `${styleText2("green", S_CHECKBOX_SELECTED)} ${m2(r2, (o2) => styleText2("dim", o2))}${t2.hint ? ` ${styleText2("dim", `(${t2.hint})`)}` : ""}` : a2 === "cancelled" ? `${m2(r2, (o2) => styleText2(["strikethrough", "dim"], o2))}` : a2 === "active-selected" ? `${styleText2("green", S_CHECKBOX_SELECTED)} ${r2}${t2.hint ? ` ${styleText2("dim", `(${t2.hint})`)}` : ""}` : a2 === "submitted" ? `${m2(r2, (o2) => styleText2("dim", o2))}` : `${styleText2("dim", S_CHECKBOX_INACTIVE)} ${m2(r2, (o2) => styleText2("dim", o2))}`;
  }, d = i2.required ?? true, x2 = i2.showInstructions ?? true;
  return new a({
    options: i2.options,
    signal: i2.signal,
    input: i2.input,
    output: i2.output,
    initialValues: i2.initialValues,
    required: d,
    cursorAt: i2.cursorAt,
    validate(t2) {
      if (d && (t2 === void 0 || t2.length === 0))
        return `Please select at least one option.
${styleText2(
          "reset",
          styleText2(
            "dim",
            `Press ${styleText2(["gray", "bgWhite", "inverse"], " space ")} to select, ${styleText2(
              "gray",
              styleText2("bgWhite", styleText2("inverse", " enter "))
            )} to submit`
          )
        )}`;
    },
    render() {
      const t2 = i2.withGuide ?? settings.withGuide, a2 = wrapTextWithPrefix(
        i2.output,
        i2.message,
        t2 ? `${symbolBar(this.state)}  ` : "",
        `${symbol(this.state)}  `
      ), r2 = `${t2 ? `${styleText2("gray", S_BAR)}
` : ""}${a2}
`, o2 = this.value ?? [], g2 = (n3, l2) => {
        if (n3.disabled)
          return u5(n3, "disabled");
        const s = o2.includes(n3.value);
        return l2 && s ? u5(n3, "active-selected") : s ? u5(n3, "selected") : u5(n3, l2 ? "active" : "inactive");
      };
      switch (this.state) {
        case "submit": {
          const n3 = this.options.filter(({ value: s }) => o2.includes(s)).map((s) => u5(s, "submitted")).join(styleText2("dim", ", ")) || styleText2("dim", "none"), l2 = wrapTextWithPrefix(
            i2.output,
            n3,
            t2 ? `${styleText2("gray", S_BAR)}  ` : ""
          );
          return `${r2}${l2}`;
        }
        case "cancel": {
          const n3 = this.options.filter(({ value: s }) => o2.includes(s)).map((s) => u5(s, "cancelled")).join(styleText2("dim", ", "));
          if (n3.trim() === "")
            return `${r2}${styleText2("gray", S_BAR)}`;
          const l2 = wrapTextWithPrefix(
            i2.output,
            n3,
            t2 ? `${styleText2("gray", S_BAR)}  ` : ""
          );
          return `${r2}${l2}${t2 ? `
${styleText2("gray", S_BAR)}` : ""}`;
        }
        case "error": {
          const n3 = t2 ? `${styleText2("yellow", S_BAR)}  ` : "", l2 = this.error.split(`
`).map(
            ($, v) => v === 0 ? `${t2 ? `${styleText2("yellow", S_BAR_END)}  ` : ""}${styleText2("yellow", $)}` : `   ${$}`
          ).join(`
`), s = r2.split(`
`).length, h2 = l2.split(`
`).length + 1;
          return `${r2}${n3}${limitOptions({
            output: i2.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: i2.maxItems,
            columnPadding: n3.length,
            rowPadding: s + h2,
            style: g2
          }).join(`
${n3}`)}
${l2}
`;
        }
        default: {
          const n3 = t2 ? `${styleText2("cyan", S_BAR)}  ` : "", l2 = r2.split(`
`).length, s = x2 ? formatInstructionFooter(MULTISELECT_INSTRUCTIONS, t2) : t2 ? [styleText2("cyan", S_BAR_END)] : [], h2 = s.join(`
`), $ = s.length + 1;
          return `${r2}${n3}${limitOptions({
            output: i2.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: i2.maxItems,
            columnPadding: n3.length,
            rowPadding: l2 + $,
            style: g2
          }).join(`
${n3}`)}
${h2}
`;
        }
      }
    }
  }).prompt();
};
var groupMultiselect = (o2) => {
  const { selectableGroups: f2 = true, groupSpacing: x2 = 0 } = o2, d = (n3, l2, p3 = []) => {
    const a2 = n3.label ?? String(n3.value), t2 = typeof n3.group == "string", s = t2 && (p3[p3.indexOf(n3) + 1] ?? { group: true }), u5 = t2 && s && s.group === true;
    let r2 = "", c3 = "";
    t2 && (f2 ? (r2 = u5 ? `${S_BAR_END} ` : `${S_BAR} `, c3 = u5 ? "  " : `${S_BAR} `) : r2 = "  ");
    let i2 = "";
    if (x2 > 0 && !t2 && (i2 = `
`.repeat(x2)), l2 === "active")
      return wrapTextWithPrefix(
        o2.output,
        `${a2}${n3.hint ? ` ${styleText2("dim", `(${n3.hint})`)}` : ""}`,
        `${i2}${styleText2("dim", r2)} `,
        `${i2}${styleText2("dim", r2)}${styleText2("cyan", S_CHECKBOX_ACTIVE)} `,
        `${i2}${styleText2("dim", c3)} `
      );
    if (l2 === "group-active")
      return wrapTextWithPrefix(
        o2.output,
        a2,
        `${i2}${r2} `,
        `${i2}${r2}${styleText2("cyan", S_CHECKBOX_ACTIVE)} `,
        `${i2}${c3} `,
        (m3) => styleText2("dim", m3)
      );
    if (l2 === "group-active-selected")
      return wrapTextWithPrefix(
        o2.output,
        a2,
        `${i2}${r2} `,
        `${i2}${r2}${styleText2("green", S_CHECKBOX_SELECTED)} `,
        `${i2}${c3} `,
        (m3) => styleText2("dim", m3)
      );
    if (l2 === "selected") {
      const m3 = t2 || f2 ? styleText2("green", S_CHECKBOX_SELECTED) : "";
      return wrapTextWithPrefix(
        o2.output,
        `${a2}${n3.hint ? ` (${n3.hint})` : ""}`,
        `${i2}${styleText2("dim", r2)} `,
        `${i2}${styleText2("dim", r2)}${m3} `,
        `${i2}${styleText2("dim", c3)} `,
        (I2) => styleText2("dim", I2)
      );
    }
    if (l2 === "cancelled")
      return `${styleText2(["strikethrough", "dim"], a2)}`;
    if (l2 === "active-selected")
      return wrapTextWithPrefix(
        o2.output,
        `${a2}${n3.hint ? ` ${styleText2("dim", `(${n3.hint})`)}` : ""}`,
        `${i2}${styleText2("dim", r2)} `,
        `${i2}${styleText2("dim", r2)}${styleText2("green", S_CHECKBOX_SELECTED)} `,
        `${i2}${styleText2("dim", c3)} `
      );
    if (l2 === "submitted")
      return `${styleText2("dim", a2)}`;
    const h2 = t2 || f2 ? styleText2("dim", S_CHECKBOX_INACTIVE) : "";
    return wrapTextWithPrefix(
      o2.output,
      a2,
      `${i2}${styleText2("dim", r2)} `,
      `${i2}${styleText2("dim", r2)}${h2} `,
      `${i2}${styleText2("dim", c3)} `,
      (m3) => styleText2("dim", m3)
    );
  }, y2 = o2.required ?? true, S = o2.showInstructions ?? true;
  return new u$2({
    options: o2.options,
    signal: o2.signal,
    input: o2.input,
    output: o2.output,
    initialValues: o2.initialValues,
    required: y2,
    cursorAt: o2.cursorAt,
    selectableGroups: f2,
    validate(n3) {
      if (y2 && (n3 === void 0 || n3.length === 0))
        return `Please select at least one option.
${styleText2(
          "reset",
          styleText2(
            "dim",
            `Press ${styleText2(["gray", "bgWhite", "inverse"], " space ")} to select, ${styleText2(
              "gray",
              styleText2(["bgWhite", "inverse"], " enter ")
            )} to submit`
          )
        )}`;
    },
    render() {
      const n3 = o2.withGuide ?? settings.withGuide, l2 = `${n3 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  ${o2.message}
`, p3 = this.value ?? [], a2 = (t2, s) => {
        const u5 = this.options, r2 = p3.includes(t2.value) || t2.group === true && this.isGroupSelected(`${t2.value}`);
        return !s && typeof t2.group == "string" && this.options[this.cursor]?.value === t2.group ? d(t2, r2 ? "group-active-selected" : "group-active", u5) : s && r2 ? d(t2, "active-selected", u5) : r2 ? d(t2, "selected", u5) : d(t2, s ? "active" : "inactive", u5);
      };
      switch (this.state) {
        case "submit": {
          const t2 = this.options.filter(({ value: u5 }) => p3.includes(u5)).map((u5) => d(u5, "submitted")), s = t2.length === 0 ? "" : `  ${t2.join(styleText2("dim", ", "))}`;
          return `${l2}${n3 ? styleText2("gray", S_BAR) : ""}${s}`;
        }
        case "cancel": {
          const t2 = this.options.filter(({ value: s }) => p3.includes(s)).map((s) => d(s, "cancelled")).join(styleText2("dim", ", "));
          return `${l2}${n3 ? `${styleText2("gray", S_BAR)}  ` : ""}${t2.trim() ? `${t2}${n3 ? `
${styleText2("gray", S_BAR)}` : ""}` : ""}`;
        }
        case "error": {
          const t2 = n3 ? `${styleText2("yellow", S_BAR)}  ` : "", s = this.error.split(`
`).map(
            (i2, h2) => h2 === 0 ? `${n3 ? `${styleText2("yellow", S_BAR_END)}  ` : ""}${styleText2("yellow", i2)}` : `   ${i2}`
          ).join(`
`), u5 = l2.split(`
`).length, r2 = s.split(`
`).length + 1, c3 = limitOptions({
            output: o2.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: o2.maxItems,
            columnPadding: t2.length,
            rowPadding: u5 + r2,
            style: a2
          }).join(`
${t2}`);
          return `${l2}${t2}${c3}
${s}
`;
        }
        default: {
          const t2 = n3 ? `${styleText2("cyan", S_BAR)}  ` : "", s = l2.split(`
`).length, u5 = S ? formatInstructionFooter(MULTISELECT_INSTRUCTIONS, n3) : n3 ? [styleText2("cyan", S_BAR_END)] : [], r2 = u5.join(`
`), c3 = u5.length + 1, i2 = limitOptions({
            output: o2.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: o2.maxItems,
            columnPadding: t2.length,
            rowPadding: s + c3,
            style: a2
          }).join(`
${t2}`);
          return `${l2}${t2}${i2}
${r2}
`;
        }
      }
    }
  }).prompt();
};
var log = {
  message: (s = [], {
    symbol: e = styleText2("gray", S_BAR),
    secondarySymbol: r2 = styleText2("gray", S_BAR),
    output: m3 = process.stdout,
    spacing: l2 = 1,
    withGuide: c3
  } = {}) => {
    const t2 = [], o2 = c3 ?? settings.withGuide, f2 = o2 ? r2 : "", O = o2 ? `${e}  ` : "", u5 = o2 ? `${r2}  ` : "";
    for (let i2 = 0; i2 < l2; i2++)
      t2.push(f2);
    const g2 = Array.isArray(s) ? s : s.split(`
`);
    if (g2.length > 0) {
      const [i2, ...y2] = g2;
      i2.length > 0 ? t2.push(`${O}${i2}`) : t2.push(o2 ? e : "");
      for (const p3 of y2)
        p3.length > 0 ? t2.push(`${u5}${p3}`) : t2.push(o2 ? r2 : "");
    }
    m3.write(`${t2.join(`
`)}
`);
  },
  info: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("blue", S_INFO) });
  },
  success: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("green", S_SUCCESS) });
  },
  step: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("green", S_STEP_SUBMIT) });
  },
  warn: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("yellow", S_WARN) });
  },
  /** alias for `log.warn()`. */
  warning: (s, e) => {
    log.warn(s, e);
  },
  error: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("red", S_ERROR) });
  }
};
var cancel = (o2 = "", t2) => {
  const i2 = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR_END)}  ` : "";
  i2.write(`${e}${styleText2("red", o2)}

`);
};
var intro = (o2 = "", t2) => {
  const i2 = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR_START)}  ` : "";
  i2.write(`${e}${o2}
`);
};
var outro = (o2 = "", t2) => {
  const i2 = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR)}
${styleText2("gray", S_BAR_END)}  ` : "";
  i2.write(`${e}${o2}

`);
};
var multiline = (e) => new h({
  validate: e.validate,
  placeholder: e.placeholder,
  defaultValue: e.defaultValue,
  initialValue: e.initialValue,
  showSubmit: e.showSubmit,
  output: e.output,
  signal: e.signal,
  input: e.input,
  render() {
    const i2 = e?.withGuide ?? settings.withGuide, o2 = `${`${i2 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  `}${e.message}
`, h2 = e.placeholder && e.placeholder.length > 0 ? (
      // biome-ignore lint/style/noNonNullAssertion: guarded by placeholder.length > 0
      styleText2("inverse", e.placeholder[0]) + styleText2("dim", e.placeholder.slice(1))
    ) : styleText2(["inverse", "hidden"], "_"), a2 = this.userInput ? this.userInputWithCursor : h2, l2 = this.value ?? "", d = e.showSubmit ? `
  ${styleText2(this.focused === "submit" ? "cyan" : "dim", "[ submit ]")}` : "";
    switch (this.state) {
      case "error": {
        const n3 = `${styleText2("yellow", S_BAR)}  `, r2 = i2 ? wrapTextWithPrefix(e.output, a2, n3, void 0) : a2, u5 = styleText2("yellow", S_BAR_END);
        return `${o2}${r2}
${u5}  ${styleText2("yellow", this.error)}${d}
`;
      }
      case "submit": {
        const n3 = `${styleText2("gray", S_BAR)}  `, r2 = i2 ? wrapTextWithPrefix(
          e.output,
          l2,
          n3,
          void 0,
          void 0,
          (u5) => styleText2("dim", u5)
        ) : l2 ? styleText2("dim", l2) : "";
        return `${o2}${r2}`;
      }
      case "cancel": {
        const n3 = `${styleText2("gray", S_BAR)}  `, r2 = i2 ? wrapTextWithPrefix(
          e.output,
          l2,
          n3,
          void 0,
          void 0,
          (u5) => styleText2(["strikethrough", "dim"], u5)
        ) : l2 ? styleText2(["strikethrough", "dim"], l2) : "";
        return `${o2}${r2}`;
      }
      default: {
        const n3 = i2 ? `${styleText2("cyan", S_BAR)}  ` : "", r2 = i2 ? styleText2("cyan", S_BAR_END) : "", u5 = i2 ? wrapTextWithPrefix(e.output, a2, n3) : a2;
        return `${o2}${u5}
${r2}${d}
`;
      }
    }
  }
}).prompt();
var W$1 = (o2) => o2;
var C2 = (o2, e, s) => {
  const a2 = {
    hard: true,
    trim: false
  }, i2 = wrapAnsi(o2, e, a2).split(`
`), c3 = i2.reduce((n3, t2) => Math.max(dist_default2(t2), n3), 0), u5 = i2.map(s).reduce((n3, t2) => Math.max(dist_default2(t2), n3), 0), g2 = e - (u5 - c3);
  return wrapAnsi(o2, g2, a2);
};
var note = (o2 = "", e = "", s) => {
  const a2 = s?.output ?? process$1.stdout, i2 = s?.withGuide ?? settings.withGuide, c3 = s?.format ?? W$1, g2 = ["", ...C2(o2, getColumns(a2) - 6, c3).split(`
`).map(c3), ""], n3 = dist_default2(e), t2 = Math.max(
    g2.reduce((m3, F) => {
      const O = dist_default2(F);
      return O > m3 ? O : m3;
    }, 0),
    n3
  ) + 2, h2 = g2.map(
    (m3) => `${styleText2("gray", S_BAR)}  ${m3}${" ".repeat(t2 - dist_default2(m3))}${styleText2("gray", S_BAR)}`
  ).join(`
`), T3 = i2 ? `${styleText2("gray", S_BAR)}
` : "", l$1 = i2 ? S_CONNECT_LEFT : S_CORNER_BOTTOM_LEFT;
  a2.write(
    `${T3}${styleText2("green", S_STEP_SUBMIT)}  ${styleText2("reset", e)} ${styleText2(
      "gray",
      S_BAR_H.repeat(Math.max(t2 - n3 - 1, 1)) + S_CORNER_TOP_RIGHT
    )}
${h2}
${styleText2("gray", l$1 + S_BAR_H.repeat(t2 + 2) + S_CORNER_BOTTOM_RIGHT)}
`
  );
};
var password = (e) => new u$1({
  validate: e.validate,
  mask: e.mask ?? S_PASSWORD_MASK,
  signal: e.signal,
  input: e.input,
  output: e.output,
  render() {
    const r2 = e.withGuide ?? settings.withGuide, o2 = `${r2 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  ${e.message}
`, m3 = this.userInputWithCursor, i2 = this.masked;
    switch (this.state) {
      case "error": {
        const s = r2 ? `${styleText2("yellow", S_BAR)}  ` : "", n3 = r2 ? `${styleText2("yellow", S_BAR_END)}  ` : "", d = i2 ?? "";
        return e.clearOnError && this.clear(), `${o2.trim()}
${s}${d}
${n3}${styleText2("yellow", this.error)}
`;
      }
      case "submit": {
        const s = r2 ? `${styleText2("gray", S_BAR)}  ` : "", n3 = i2 ? styleText2("dim", i2) : "";
        return `${o2}${s}${n3}`;
      }
      case "cancel": {
        const s = r2 ? `${styleText2("gray", S_BAR)}  ` : "", n3 = i2 ? styleText2(["strikethrough", "dim"], i2) : "";
        return `${o2}${s}${n3}${i2 && r2 ? `
${styleText2("gray", S_BAR)}` : ""}`;
      }
      default: {
        const s = r2 ? `${styleText2("cyan", S_BAR)}  ` : "", n3 = r2 ? styleText2("cyan", S_BAR_END) : "";
        return `${o2}${s}${m3}
${n3}
`;
      }
    }
  }
}).prompt();
var path = (e) => {
  const a2 = e.validate;
  return autocomplete({
    ...e,
    initialUserInput: e.initialValue ?? e.root ?? process.cwd(),
    maxItems: 5,
    completeOnTab: true,
    validate(t2) {
      if (!Array.isArray(t2)) {
        if (!t2)
          return "Please select a path";
        if (a2)
          return runValidation(a2, t2);
      }
    },
    options() {
      const t2 = this.userInput;
      if (t2 === "")
        return [];
      try {
        let i2;
        existsSync(t2) ? lstatSync(t2).isDirectory() && (!e.directory || t2.endsWith("/")) ? i2 = t2 : i2 = dirname(t2) : i2 = dirname(t2);
        const c3 = t2.length > 1 && t2.endsWith("/") ? t2.slice(0, -1) : t2;
        return readdirSync(i2).map((r2) => {
          const n3 = join(i2, r2), m3 = lstatSync(n3);
          return {
            name: r2,
            path: n3,
            isDirectory: m3.isDirectory()
          };
        }).filter(
          ({ path: r2, isDirectory: n3 }) => r2.startsWith(c3) && (n3 || !e.directory)
        ).map((r2) => ({
          value: r2.path
        }));
      } catch {
        return [];
      }
    }
  });
};
var W = (l2) => styleText2("magenta", l2);
var spinner = ({
  indicator: l2 = "dots",
  onCancel: h2,
  output: n3 = process.stdout,
  cancelMessage: G,
  errorMessage: O,
  frames: E2 = unicode ? ["\u25D2", "\u25D0", "\u25D3", "\u25D1"] : ["\u2022", "o", "O", "0"],
  delay: F = unicode ? 80 : 120,
  signal: m3,
  ...I2
} = {}) => {
  const u5 = isCI();
  let M2, T3, d = false, S = false, s = "", p3, w = performance.now();
  const x2 = getColumns(n3), k = I2?.styleFrame ?? W, g2 = (e) => {
    const r2 = e > 1 ? O ?? settings.messages.error : G ?? settings.messages.cancel;
    S = e === 1, d && (a2(r2, e), S && typeof h2 == "function" && h2());
  }, f2 = () => g2(2), i2 = () => g2(1), A2 = () => {
    process.on("uncaughtExceptionMonitor", f2), process.on("unhandledRejection", f2), process.on("SIGINT", i2), process.on("SIGTERM", i2), process.on("exit", g2), m3 && m3.addEventListener("abort", i2);
  }, H = () => {
    process.removeListener("uncaughtExceptionMonitor", f2), process.removeListener("unhandledRejection", f2), process.removeListener("SIGINT", i2), process.removeListener("SIGTERM", i2), process.removeListener("exit", g2), m3 && m3.removeEventListener("abort", i2);
  }, y2 = () => {
    if (p3 === void 0) return;
    u5 && n3.write(`
`);
    const r2 = wrapAnsi(p3, x2, {
      hard: true,
      trim: false
    }).split(`
`);
    r2.length > 1 && n3.write(import_sisteransi2.cursor.up(r2.length - 1)), n3.write(import_sisteransi2.cursor.to(0)), n3.write(import_sisteransi2.erase.down());
  }, C3 = (e) => e.replace(/\.+$/, ""), _2 = (e) => {
    const r2 = (performance.now() - e) / 1e3, t2 = Math.floor(r2 / 60), o2 = Math.floor(r2 % 60);
    return t2 > 0 ? `[${t2}m ${o2}s]` : `[${o2}s]`;
  }, N = I2.withGuide ?? settings.withGuide, P3 = (e = "") => {
    d = true, M2 = block({ output: n3 }), s = C3(e), w = performance.now(), N && n3.write(`${styleText2("gray", S_BAR)}
`);
    let r2 = 0, t2 = 0;
    A2(), T3 = setInterval(() => {
      if (u5 && s === p3)
        return;
      y2(), p3 = s;
      const o2 = k(E2[r2]);
      let v;
      if (u5)
        v = `${o2}  ${s}...`;
      else if (l2 === "timer")
        v = `${o2}  ${s} ${_2(w)}`;
      else {
        const B = ".".repeat(Math.floor(t2)).slice(0, 3);
        v = `${o2}  ${s}${B}`;
      }
      const j2 = wrapAnsi(v, x2, {
        hard: true,
        trim: false
      });
      n3.write(j2), r2 = r2 + 1 < E2.length ? r2 + 1 : 0, t2 = t2 < 4 ? t2 + 0.125 : 0;
    }, F);
  }, a2 = (e = "", r2 = 0, t2 = false) => {
    if (!d) return;
    d = false, clearInterval(T3), y2();
    const o2 = r2 === 0 ? styleText2("green", S_STEP_SUBMIT) : r2 === 1 ? styleText2("red", S_STEP_CANCEL) : styleText2("red", S_STEP_ERROR);
    s = e ?? s, t2 || (l2 === "timer" ? n3.write(`${o2}  ${s} ${_2(w)}
`) : n3.write(`${o2}  ${s}
`)), H(), M2();
  };
  return {
    start: P3,
    stop: (e = "") => a2(e, 0),
    message: (e = "") => {
      s = C3(e ?? s);
    },
    cancel: (e = "") => a2(e, 1),
    error: (e = "") => a2(e, 2),
    clear: () => a2("", 0, true),
    get isCancelled() {
      return S;
    }
  };
};
var u4 = {
  light: unicodeOr("\u2500", "-"),
  heavy: unicodeOr("\u2501", "="),
  block: unicodeOr("\u2588", "#")
};
function progress({
  style: o2 = "heavy",
  max: d = 100,
  size: v = 40,
  ...x2
} = {}) {
  const r2 = spinner(x2);
  let a2 = 0, n3 = "";
  const c3 = Math.max(1, d), l2 = Math.max(1, v), S = (t2) => {
    switch (t2) {
      case "initial":
      case "active":
        return (e) => styleText2("magenta", e);
      case "error":
      case "cancel":
        return (e) => styleText2("red", e);
      case "submit":
        return (e) => styleText2("green", e);
      default:
        return (e) => styleText2("magenta", e);
    }
  }, p3 = (t2, e) => {
    const m3 = Math.floor(a2 / c3 * l2);
    return `${S(t2)(u4[o2].repeat(m3))}${styleText2("dim", u4[o2].repeat(l2 - m3))} ${e}`;
  }, h2 = (t2 = "") => {
    n3 = t2, r2.start(p3("initial", t2));
  }, g2 = (t2 = 1, e) => {
    a2 = Math.min(c3, t2 + a2), r2.message(p3("active", e ?? n3)), n3 = e ?? n3;
  };
  return {
    start: h2,
    stop: r2.stop,
    cancel: r2.cancel,
    error: r2.error,
    clear: r2.clear,
    advance: g2,
    isCancelled: r2.isCancelled,
    message: (t2) => g2(0, t2)
  };
}
var SELECT_INSTRUCTIONS = [
  `${styleText2("dim", "\u2191/\u2193")} to navigate`,
  `${styleText2("dim", "Enter:")} confirm`
];
var c2 = (t2, o2) => t2.includes(`
`) ? t2.split(`
`).map((d) => o2(d)).join(`
`) : o2(t2);
var select = (t2) => {
  const o2 = (n3, m3) => {
    if (n3 === void 0)
      return "";
    const s = n3.label ?? String(n3.value);
    switch (m3) {
      case "disabled":
        return `${styleText2("gray", S_RADIO_INACTIVE)} ${c2(s, (i2) => styleText2("gray", i2))}${n3.hint ? ` ${styleText2("dim", `(${n3.hint ?? "disabled"})`)}` : ""}`;
      case "selected":
        return `${c2(s, (i2) => styleText2("dim", i2))}`;
      case "active":
        return `${styleText2("green", S_RADIO_ACTIVE)} ${s}${n3.hint ? ` ${styleText2("dim", `(${n3.hint})`)}` : ""}`;
      case "cancelled":
        return `${c2(s, (i2) => styleText2(["strikethrough", "dim"], i2))}`;
      default:
        return `${styleText2("dim", S_RADIO_INACTIVE)} ${c2(s, (i2) => styleText2("dim", i2))}`;
    }
  }, d = t2.showInstructions ?? true;
  return new n$1({
    options: t2.options,
    signal: t2.signal,
    input: t2.input,
    output: t2.output,
    initialValue: t2.initialValue,
    render() {
      const n3 = t2.withGuide ?? settings.withGuide, m3 = `${symbol(this.state)}  `, s = `${symbolBar(this.state)}  `, i2 = wrapTextWithPrefix(
        t2.output,
        t2.message,
        s,
        m3
      ), u5 = `${n3 ? `${styleText2("gray", S_BAR)}
` : ""}${i2}
`;
      switch (this.state) {
        case "submit": {
          const r2 = n3 ? `${styleText2("gray", S_BAR)}  ` : "", a2 = wrapTextWithPrefix(
            t2.output,
            o2(this.options[this.cursor], "selected"),
            r2
          );
          return `${u5}${a2}`;
        }
        case "cancel": {
          const r2 = n3 ? `${styleText2("gray", S_BAR)}  ` : "", a2 = wrapTextWithPrefix(
            t2.output,
            o2(this.options[this.cursor], "cancelled"),
            r2
          );
          return `${u5}${a2}${n3 ? `
${styleText2("gray", S_BAR)}` : ""}`;
        }
        default: {
          const r2 = n3 ? `${styleText2("cyan", S_BAR)}  ` : "", a2 = u5.split(`
`).length, p3 = d ? formatInstructionFooter(SELECT_INSTRUCTIONS, n3) : n3 ? [styleText2("cyan", S_BAR_END)] : [], f2 = p3.join(`
`), b3 = p3.length + 1;
          return `${u5}${r2}${limitOptions({
            output: t2.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: t2.maxItems,
            columnPadding: r2.length,
            rowPadding: a2 + b3,
            style: (g2, x2) => o2(g2, g2.disabled ? "disabled" : x2 ? "active" : "inactive")
          }).join(`
${r2}`)}
${f2}
`;
        }
      }
    }
  }).prompt();
};
var selectKey = (t2) => {
  const c3 = (e, a2 = "inactive") => {
    if (e === void 0)
      return "";
    const n3 = e.label ?? String(e.value);
    return a2 === "selected" ? `${styleText2("dim", n3)}` : a2 === "cancelled" ? `${styleText2(["strikethrough", "dim"], n3)}` : a2 === "active" ? `${styleText2(["bgCyan", "gray"], ` ${e.value} `)} ${n3}${e.hint ? ` ${styleText2("dim", `(${e.hint})`)}` : ""}` : `${styleText2(["gray", "bgWhite", "inverse"], ` ${e.value} `)} ${n3}${e.hint ? ` ${styleText2("dim", `(${e.hint})`)}` : ""}`;
  };
  return new u3({
    options: t2.options,
    signal: t2.signal,
    input: t2.input,
    output: t2.output,
    initialValue: t2.initialValue,
    caseSensitive: t2.caseSensitive,
    render() {
      const e = t2.withGuide ?? settings.withGuide, a2 = `${e ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  ${t2.message}
`;
      switch (this.state) {
        case "submit": {
          const n3 = e ? `${styleText2("gray", S_BAR)}  ` : "", r2 = this.options.find((u5) => u5.value === this.value) ?? t2.options[0], l2 = wrapTextWithPrefix(
            t2.output,
            c3(r2, "selected"),
            n3
          );
          return `${a2}${l2}`;
        }
        case "cancel": {
          const n3 = e ? `${styleText2("gray", S_BAR)}  ` : "", r2 = wrapTextWithPrefix(
            t2.output,
            c3(this.options[0], "cancelled"),
            n3
          );
          return `${a2}${r2}${e ? `
${styleText2("gray", S_BAR)}` : ""}`;
        }
        default: {
          const n3 = e ? `${styleText2("cyan", S_BAR)}  ` : "", r2 = e ? styleText2("cyan", S_BAR_END) : "", l2 = this.options.map(
            (u5, d) => wrapTextWithPrefix(
              t2.output,
              c3(u5, d === this.cursor ? "active" : "inactive"),
              n3
            )
          ).join(`
`);
          return `${a2}${l2}
${r2}
`;
        }
      }
    }
  }).prompt();
};
var i = `${styleText2("gray", S_BAR)}  `;
var stream = {
  message: async (e, { symbol: l2 = styleText2("gray", S_BAR) } = {}) => {
    process.stdout.write(`${styleText2("gray", S_BAR)}
${l2}  `);
    let s = 3;
    for await (let r2 of e) {
      r2 = r2.replace(/\n/g, `
${i}`), r2.includes(`
`) && (s = 3 + stripVTControlCharacters(r2.slice(r2.lastIndexOf(`
`))).length);
      const o2 = stripVTControlCharacters(r2).length;
      s + o2 < process.stdout.columns ? (s += o2, process.stdout.write(r2)) : (process.stdout.write(`
${i}${r2.trimStart()}`), s = 3 + stripVTControlCharacters(r2.trimStart()).length);
    }
    process.stdout.write(`
`);
  },
  info: (e) => stream.message(e, { symbol: styleText2("blue", S_INFO) }),
  success: (e) => stream.message(e, { symbol: styleText2("green", S_SUCCESS) }),
  step: (e) => stream.message(e, { symbol: styleText2("green", S_STEP_SUBMIT) }),
  warn: (e) => stream.message(e, { symbol: styleText2("yellow", S_WARN) }),
  /** alias for `log.warn()`. */
  warning: (e) => stream.warn(e),
  error: (e) => stream.message(e, { symbol: styleText2("red", S_ERROR) })
};
var tasks = async (o2, e) => {
  for (const t2 of o2) {
    if (t2.enabled === false) continue;
    const s = spinner(e);
    s.start(t2.title);
    const n3 = await t2.task(s.message);
    s.stop(n3 || t2.title);
  }
};
var A = (l2) => l2.replace(/\x1b\[(?:\d+;)*\d*[ABCDEFGHfJKSTsu]|\x1b\[(s|u)/g, "");
var taskLog = (l2) => {
  const r2 = l2.output ?? process.stdout, O = getColumns(r2), i2 = styleText2("gray", S_BAR), p3 = l2.spacing ?? 1, k = 3, m3 = l2.retainLog === true, d = !isCI() && isTTY(r2);
  r2.write(`${i2}
`), r2.write(`${styleText2("green", S_STEP_SUBMIT)}  ${l2.title}
`);
  for (let e = 0; e < p3; e++)
    r2.write(`${i2}
`);
  const n3 = [
    {
      value: "",
      full: ""
    }
  ];
  let v = false;
  const f2 = (e) => {
    if (n3.length === 0)
      return;
    let s = 0;
    e && (s += p3 + 2);
    for (const t2 of n3) {
      const { value: o2, result: a2 } = t2;
      let g2 = a2?.message ?? o2;
      if (g2.length === 0)
        continue;
      a2 === void 0 && t2.header !== void 0 && t2.header !== "" && (g2 += `
${t2.header}`);
      const E2 = g2.split(`
`).reduce((b3, w) => w === "" ? b3 + 1 : b3 + Math.ceil((w.length + k) / O), 0);
      s += E2;
    }
    s > 0 && (s += 1, r2.write(import_sisteransi2.erase.lines(s)));
  }, h2 = (e, s, t2) => {
    const o2 = t2 ? `${e.full}
${e.value}` : e.value;
    e.header !== void 0 && e.header !== "" && log.message(
      e.header.split(`
`).map((a2) => styleText2("bold", a2)),
      {
        output: r2,
        secondarySymbol: i2,
        symbol: i2,
        spacing: 0
      }
    ), log.message(
      o2.split(`
`).map((a2) => styleText2("dim", a2)),
      {
        output: r2,
        secondarySymbol: i2,
        symbol: i2,
        spacing: s ?? p3
      }
    );
  }, T3 = () => {
    for (const e of n3) {
      const { header: s, value: t2, full: o2 } = e;
      (s === void 0 || s.length === 0) && t2.length === 0 || h2(e, void 0, m3 === true && o2.length > 0);
    }
  }, L = (e, s, t2) => {
    if (f2(false), (t2?.raw !== true || !v) && e.value !== "" && (e.value += `
`), e.value += A(s), v = t2?.raw === true, l2.limit !== void 0) {
      const o2 = e.value.split(`
`), a2 = o2.length - l2.limit;
      if (a2 > 0) {
        const g2 = o2.splice(0, a2);
        m3 && (e.full += (e.full === "" ? "" : `
`) + g2.join(`
`));
      }
      e.value = o2.join(`
`);
    }
    d && y2();
  }, y2 = () => {
    for (const e of n3)
      e.result ? e.result.status === "error" ? log.error(e.result.message, { output: r2, secondarySymbol: i2, spacing: 0 }) : log.success(e.result.message, { output: r2, secondarySymbol: i2, spacing: 0 }) : e.value !== "" && h2(e, 0);
  }, B = (e, s) => {
    f2(false), e.result = s, d && y2();
  };
  return {
    message(e, s) {
      L(n3[0], e, s);
    },
    group(e) {
      const s = {
        header: e,
        value: "",
        full: ""
      };
      return n3.push(s), {
        message(t2, o2) {
          L(s, t2, o2);
        },
        error(t2) {
          B(s, {
            status: "error",
            message: t2
          });
        },
        success(t2) {
          B(s, {
            status: "success",
            message: t2
          });
        }
      };
    },
    error(e, s) {
      f2(true), log.error(e, { output: r2, secondarySymbol: i2, spacing: 1 }), s?.showLog !== false && T3(), n3.splice(1, n3.length - 1), n3[0].value = "", n3[0].full = "";
    },
    success(e, s) {
      f2(true), log.success(e, { output: r2, secondarySymbol: i2, spacing: 1 }), s?.showLog === true && T3(), n3.splice(1, n3.length - 1), n3[0].value = "", n3[0].full = "";
    }
  };
};
var text = (t2) => new n2({
  validate: t2.validate,
  placeholder: t2.placeholder,
  defaultValue: t2.defaultValue,
  initialValue: t2.initialValue,
  output: t2.output,
  signal: t2.signal,
  input: t2.input,
  render() {
    const r2 = t2?.withGuide ?? settings.withGuide, l2 = `${`${r2 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  `}${t2.message}
`, d = t2.placeholder && t2.placeholder.length > 0 ? (
      // biome-ignore lint/style/noNonNullAssertion: guarded by placeholder.length > 0
      styleText2("inverse", t2.placeholder[0]) + styleText2("dim", t2.placeholder.slice(1))
    ) : styleText2(["inverse", "hidden"], "_"), o2 = this.userInput ? this.userInputWithCursor : d, s = this.value ?? "";
    switch (this.state) {
      case "validating": {
        const n3 = r2 ? `${styleText2("cyan", S_BAR)}  ` : "", i2 = r2 ? styleText2("cyan", S_BAR_END) : "", c3 = styleText2("dim", o2), $ = styleText2("dim", "Validating...");
        return `${l2}${n3}${c3}
${i2}  ${$}
`;
      }
      case "error": {
        const n3 = this.error ? `  ${styleText2("yellow", this.error)}` : "", i2 = r2 ? `${styleText2("yellow", S_BAR)}  ` : "", c3 = r2 ? styleText2("yellow", S_BAR_END) : "";
        return `${l2.trim()}
${i2}${o2}
${c3}${n3}
`;
      }
      case "submit": {
        const n3 = s ? `${r2 ? "  " : ""}${styleText2("dim", s)}` : "", i2 = r2 ? styleText2("gray", S_BAR) : "";
        return `${l2}${i2}${n3}`;
      }
      case "cancel": {
        const n3 = s ? `  ${styleText2(["strikethrough", "dim"], s)}` : "", i2 = r2 ? styleText2("gray", S_BAR) : "";
        return `${l2}${i2}${n3}${s.trim() ? `
${i2}` : ""}`;
      }
      default: {
        const n3 = r2 ? `${styleText2("cyan", S_BAR)}  ` : "", i2 = r2 ? styleText2("cyan", S_BAR_END) : "";
        return `${l2}${n3}${o2}
${i2}
`;
      }
    }
  }
}).prompt();

// src/core/project/config-dir.ts
import { join as join2, posix, win32 } from "node:path";

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
  let out2 = "";
  let i2 = 0;
  while (i2 < template.length) {
    if (template[i2] !== "<") {
      out2 += template[i2];
      i2 += 1;
      continue;
    }
    let j2 = i2 + 1;
    while (j2 < template.length && template[j2] !== "<" && template[j2] !== ">") j2 += 1;
    if (j2 >= template.length) {
      out2 += template.slice(i2);
      break;
    }
    if (template[j2] === "<") {
      out2 += "<";
      i2 += 1;
      continue;
    }
    const name = template.slice(i2 + 1, j2);
    const value = vars[name];
    if (value === void 0) throw new Error("formatError: missing var " + name + " for " + code);
    out2 += String(value);
    i2 = j2 + 1;
  }
  return out2;
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

// src/core/project/config-dir.ts
var { mkdirSync, realpathSync } = process.getBuiltinModule("node:fs");
function homeDirOf(env, platform = process.platform) {
  const set2 = (v) => v !== void 0 && v !== "";
  if (platform === "win32") {
    if (set2(env.USERPROFILE)) return env.USERPROFILE;
    if (set2(env.HOMEDRIVE) && set2(env.HOMEPATH)) return env.HOMEDRIVE + env.HOMEPATH;
    return set2(env.HOME) ? env.HOME : null;
  }
  if (set2(env.HOME)) return env.HOME;
  return set2(env.USERPROFILE) ? env.USERPROFILE : null;
}
function copilotDirOf(env, home) {
  const dir = env[COPILOT_HOME_ENV];
  return dir !== void 0 && dir !== "" ? dir : join2(home, ...AGENT_HOME_DIR["copilot-cli"]);
}
function kiroDirOf(env, home, platform = process.platform) {
  const p3 = platform === "win32" ? win32 : posix;
  const fallback = p3.join(home, ...AGENT_HOME_DIR.kiro);
  const dir = env[KIRO_HOME_ENV];
  if (dir === void 0 || dir === "" || !p3.isAbsolute(dir)) return fallback;
  if (platform === "win32" && p3.parse(dir).root.length < 2) return fallback;
  const abs = p3.resolve(dir);
  if (p3.dirname(abs) === abs) return fallback;
  const up = p3.relative(abs, p3.resolve(home));
  if (!p3.isAbsolute(up) && up.split(p3.sep)[0] !== "..") return fallback;
  return dir;
}
function claudeDirOf(env, home) {
  const dir = env[CLAUDE_CONFIG_DIR_ENV];
  return dir !== void 0 && dir !== "" ? dir : join2(home, ...AGENT_HOME_DIR["claude-code"]);
}
function opencodeDirOf(env, home) {
  const own2 = env[OPENCODE_CONFIG_DIR_ENV];
  if (own2 !== void 0 && own2 !== "") return own2;
  const xdg = env[XDG_CONFIG_HOME_ENV];
  if (xdg !== void 0 && xdg !== "") return join2(xdg, AGENT_HOME_DIR.opencode[AGENT_HOME_DIR.opencode.length - 1]);
  return join2(home, ...AGENT_HOME_DIR.opencode);
}
function vscodeUserDirOf(env, home, platform = process.platform) {
  const set2 = (v) => v !== void 0 && v !== "";
  const p3 = platform === "win32" ? win32 : posix;
  if (platform === "win32") return p3.join(set2(env[APPDATA_ENV]) ? env[APPDATA_ENV] : p3.join(home, "AppData", "Roaming"), ...VSCODE_USER_DIR_SEGMENTS);
  if (platform === "darwin") return p3.join(home, "Library", "Application Support", ...VSCODE_USER_DIR_SEGMENTS);
  return p3.join(set2(env[XDG_CONFIG_HOME_ENV]) ? env[XDG_CONFIG_HOME_ENV] : p3.join(home, ".config"), ...VSCODE_USER_DIR_SEGMENTS);
}
function ownMcpFileOf(agent, file, env, home) {
  if (agent === "kiro") return join2(kiroDirOf(env, home), ...file.slice(1));
  return agent === "vscode" ? join2(vscodeUserDirOf(env, home), ...file) : join2(home, ...file);
}

// src/setup/registry.ts
import path3 from "node:path";

// src/core/ops/doctor-config.ts
import { join as join6 } from "node:path";

// src/core/ops/detect-v1.ts
import { existsSync as existsSync3, opendirSync, readdirSync as readdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join4 } from "node:path";

// src/core/ops/host-config.ts
import { existsSync as existsSync2, readFileSync } from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";

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
  if (data) return MESSAGES[code].replace(/\{\{(.*?)\}\}/gu, (_2, name$2) => {
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
function isLetter(cp) {
  return isLowerLetter(cp) || isUpperLetter(cp);
}
function isDigit(cp) {
  return cp >= CodePoint.DIGIT_0 && cp <= CodePoint.DIGIT_9;
}
function isHexDig(cp) {
  return isDigit(cp) || cp >= CodePoint.LATIN_SMALL_A && cp <= CodePoint.LATIN_SMALL_F || cp >= CodePoint.LATIN_CAPITAL_A && cp <= CodePoint.LATIN_CAPITAL_F;
}
function isOctalDig(cp) {
  return cp >= CodePoint.DIGIT_0 && cp <= CodePoint.DIGIT_7;
}
function isUnicodeScalarValue(cp) {
  return cp >= 0 && cp <= 55295 || cp >= 57344 && cp <= 1114111;
}
function sortedLastIndex(array, value) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = low + high >>> 1;
    const val = array[mid];
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
    for (let i2 = this.offsets.length - 1; i2 >= 0; i2--) {
      const element = this.offsets[i2];
      if (element === offset) return;
      if (element < offset) break;
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
  constructor(text2) {
    this.locs = new Locations();
    this.lastCodePoint = CodePoint.NULL;
    this.start = -1;
    this.end = 0;
    this.text = text2;
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
  constructor(text2, parserOptions) {
    this.backCode = false;
    this.lastCodePoint = CodePoint.NULL;
    this.state = "DATA";
    this.token = null;
    this.tokenStart = -1;
    this.valuesEnabled = false;
    this.text = text2;
    this.parserOptions = parserOptions || {};
    this.codePointIterator = new CodePointIterator(text2);
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
        const text2 = option1;
        token = {
          type,
          value,
          number: parseInt(text2, option2),
          bigint: HAS_BIGINT ? BigInt(RADIX_PREFIXES[option2] + text2) : null,
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
      if (isDigit(cp)) {
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
    const processCommentChar = this.tomlVersion.gte(1, 1) ? (c3) => {
      if (!isNonEOL(c3)) this.reportParseError("invalid-comment-character", { cp: JSON.stringify(String.fromCodePoint(c3)).slice(1, -1) });
    } : (c3) => {
      if (isControlOtherThanTab(c3)) this.reportParseErrorControlChar();
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
    const out2 = [];
    while (cp !== CodePoint.QUOTATION_MARK && cp !== CodePoint.EOF && cp !== CodePoint.LINE_FEED) {
      if (isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      if (cp === CodePoint.BACKSLASH) {
        cp = this.nextCode();
        const ecp = this.ESCAPES[cp];
        if (ecp) {
          out2.push(ecp);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_U) {
          const code = this.parseUnicode(4);
          out2.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_CAPITAL_U) {
          const code = this.parseUnicode(8);
          out2.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_X && this.tomlVersion.gte(1, 1)) {
          const code = this.parseUnicode(2);
          out2.push(code);
          cp = this.nextCode();
          continue;
        }
        return this.reportParseError("invalid-char-in-escape-sequence");
      }
      out2.push(cp);
      cp = this.nextCode();
    }
    if (cp !== CodePoint.QUOTATION_MARK) return this.reportParseError("unterminated-string");
    this.endToken("BasicString", "end", String.fromCodePoint(...out2));
    return "DATA";
  }
  MULTI_LINE_BASIC_STRING(cp) {
    const out2 = [];
    if (cp === CodePoint.LINE_FEED) cp = this.nextCode();
    while (cp !== CodePoint.EOF) {
      if (cp !== CodePoint.LINE_FEED && isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      if (cp === CodePoint.QUOTATION_MARK) {
        const startPos = this.codePointIterator.start;
        if (this.eatCode(CodePoint.QUOTATION_MARK) && this.eatCode(CodePoint.QUOTATION_MARK)) {
          if (this.eatCode(CodePoint.QUOTATION_MARK)) {
            out2.push(CodePoint.QUOTATION_MARK);
            if (this.eatCode(CodePoint.QUOTATION_MARK)) {
              out2.push(CodePoint.QUOTATION_MARK);
              if (this.eatCode(CodePoint.QUOTATION_MARK)) {
                this.moveAt(startPos);
                return this.reportParseError("invalid-three-quotes");
              }
            }
          }
          this.endToken("MultiLineBasicString", "end", String.fromCodePoint(...out2));
          return "DATA";
        }
        this.moveAt(startPos);
      }
      if (cp === CodePoint.BACKSLASH) {
        cp = this.nextCode();
        const ecp = this.ESCAPES[cp];
        if (ecp) {
          out2.push(ecp);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_U) {
          const code = this.parseUnicode(4);
          out2.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_CAPITAL_U) {
          const code = this.parseUnicode(8);
          out2.push(code);
          cp = this.nextCode();
          continue;
        } else if (cp === CodePoint.LATIN_SMALL_X && this.tomlVersion.gte(1, 1)) {
          const code = this.parseUnicode(2);
          out2.push(code);
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
      out2.push(cp);
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
    const out2 = [];
    while (cp !== CodePoint.SINGLE_QUOTE && cp !== CodePoint.EOF && cp !== CodePoint.LINE_FEED) {
      if (isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      out2.push(cp);
      cp = this.nextCode();
    }
    if (cp !== CodePoint.SINGLE_QUOTE) return this.reportParseError("unterminated-string");
    this.endToken("LiteralString", "end", String.fromCodePoint(...out2));
    return "DATA";
  }
  MULTI_LINE_LITERAL_STRING(cp) {
    const out2 = [];
    if (cp === CodePoint.LINE_FEED) cp = this.nextCode();
    while (cp !== CodePoint.EOF) {
      if (cp !== CodePoint.LINE_FEED && isControlOtherThanTab(cp)) return this.reportParseErrorControlChar();
      if (cp === CodePoint.SINGLE_QUOTE) {
        const startPos = this.codePointIterator.start;
        if (this.eatCode(CodePoint.SINGLE_QUOTE) && this.eatCode(CodePoint.SINGLE_QUOTE)) {
          if (this.eatCode(CodePoint.SINGLE_QUOTE)) {
            out2.push(CodePoint.SINGLE_QUOTE);
            if (this.eatCode(CodePoint.SINGLE_QUOTE)) {
              out2.push(CodePoint.SINGLE_QUOTE);
              if (this.eatCode(CodePoint.SINGLE_QUOTE)) {
                this.moveAt(startPos);
                return this.reportParseError("invalid-three-quotes");
              }
            }
          }
          this.endToken("MultiLineLiteralString", "end", String.fromCodePoint(...out2));
          return "DATA";
        }
        this.moveAt(startPos);
      }
      out2.push(cp);
      cp = this.nextCode();
    }
    return this.reportParseError("unterminated-string");
  }
  SIGN(cp) {
    if (cp === CodePoint.LATIN_SMALL_N || cp === CodePoint.LATIN_SMALL_I) return this.back("NAN_OR_INF");
    if (isDigit(cp)) return this.back("NUMBER");
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
        if (isDigit(nextCp$1)) {
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
          if (isDigit(nextNextCp)) {
            const nextNextNextCp = this.nextCode();
            if (isDigit(nextNextNextCp) && this.eatCode(CodePoint.DASH)) {
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
    const { out: out2, nextCp, hasUnderscore } = this.parseDigits(cp, isDigit);
    if (nextCp === CodePoint.DASH && sign === CodePoint.NULL && !hasUnderscore && out2.length === 4) {
      this.data = {
        hasDate: true,
        year: Number(String.fromCodePoint(...out2)),
        month: 0,
        day: 0,
        hour: 0,
        minute: 0,
        second: 0
      };
      return "DATE_MONTH";
    }
    if (nextCp === CodePoint.COLON && sign === CodePoint.NULL && !hasUnderscore && out2.length === 2) {
      this.data = {
        hasDate: false,
        year: 0,
        month: 0,
        day: 0,
        hour: Number(String.fromCodePoint(...out2)),
        minute: 0,
        second: 0
      };
      return "TIME_MINUTE";
    }
    if (nextCp === CodePoint.LATIN_SMALL_E || nextCp === CodePoint.LATIN_CAPITAL_E) {
      this.data = {
        minus: sign === CodePoint.DASH,
        left: out2
      };
      return "EXPONENT_RIGHT";
    }
    if (nextCp === CodePoint.DOT) {
      this.data = {
        minus: sign === CodePoint.DASH,
        absInt: out2
      };
      return "FRACTIONAL_RIGHT";
    }
    this.endToken("Integer", "start", sign === CodePoint.DASH ? String.fromCodePoint(CodePoint.DASH, ...out2) : String.fromCodePoint(...out2), 10);
    return this.back("DATA");
  }
  HEX(cp) {
    const { out: out2 } = this.parseDigits(cp, isHexDig);
    this.endToken("Integer", "start", String.fromCodePoint(...out2), 16);
    return this.back("DATA");
  }
  OCTAL(cp) {
    const { out: out2 } = this.parseDigits(cp, isOctalDig);
    this.endToken("Integer", "start", String.fromCodePoint(...out2), 8);
    return this.back("DATA");
  }
  BINARY(cp) {
    const { out: out2 } = this.parseDigits(cp, (c3) => c3 === CodePoint.DIGIT_0 || c3 === CodePoint.DIGIT_1);
    this.endToken("Integer", "start", String.fromCodePoint(...out2), 2);
    return this.back("DATA");
  }
  FRACTIONAL_RIGHT(cp) {
    const { minus, absInt } = this.data;
    const { out: out2, nextCp } = this.parseDigits(cp, isDigit);
    const absNum = [
      ...absInt,
      CodePoint.DOT,
      ...out2
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
    const { out: out2 } = this.parseDigits(cp, isDigit);
    const right = out2;
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
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (cp !== CodePoint.DASH) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.start;
    const data = this.data;
    data.month = Number(this.text.slice(start, end));
    return "DATE_DAY";
  }
  DATE_DAY(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.end;
    const data = this.data;
    data.day = Number(this.text.slice(start, end));
    if (!isValidDate(data.year, data.month, data.day)) return this.reportParseError("invalid-date");
    cp = this.nextCode();
    if (cp === CodePoint.LATIN_CAPITAL_T || cp === CodePoint.LATIN_SMALL_T) return "TIME_HOUR";
    if (cp === CodePoint.SPACE) {
      const startPos = this.codePointIterator.start;
      if (isDigit(this.nextCode()) && isDigit(this.nextCode())) {
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
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (cp !== CodePoint.COLON) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.start;
    const data = this.data;
    data.hour = Number(this.text.slice(start, end));
    return "TIME_MINUTE";
  }
  TIME_MINUTE(cp) {
    const start = this.codePointIterator.start;
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
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
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    const end = this.codePointIterator.end;
    const data = this.data;
    data.second = Number(this.text.slice(start, end));
    if (!isValidTime(data.hour, data.minute, data.second)) return this.reportParseError("invalid-time");
    cp = this.nextCode();
    if (cp === CodePoint.DOT) return "TIME_SEC_FRAC";
    return this.processTimeEnd(cp, data);
  }
  TIME_SEC_FRAC(cp) {
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    const start = this.codePointIterator.start;
    while (isDigit(cp)) cp = this.nextCode();
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
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    const hourStart = this.codePointIterator.start;
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (cp !== CodePoint.COLON) return this.reportParseError("unexpected-char");
    const hourEnd = this.codePointIterator.start;
    cp = this.nextCode();
    const minuteStart = this.codePointIterator.start;
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
    cp = this.nextCode();
    if (!isDigit(cp)) return this.reportParseError("unexpected-char");
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
    const out2 = [];
    let before = CodePoint.NULL;
    let hasUnderscore = false;
    while (checkDigit(cp) || cp === CodePoint.UNDERSCORE) {
      if (cp === CodePoint.UNDERSCORE) {
        hasUnderscore = true;
        if (before === CodePoint.UNDERSCORE) return this.reportParseError("invalid-underscore");
      } else out2.push(cp);
      before = cp;
      cp = this.nextCode();
    }
    if (before === CodePoint.UNDERSCORE) return this.reportParseError("invalid-underscore");
    return {
      out: out2,
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
  if (isLetter(cp) || isDigit(cp) || cp === CodePoint.UNDERSCORE || cp === CodePoint.DASH) return true;
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
function isValidDate(y2, m3, d) {
  if (y2 >= 0 && m3 <= 12 && m3 >= 1 && d >= 1) return d <= (m3 === 2 ? y2 & 3 || !(y2 % 25) && y2 & 15 ? 28 : 29 : 30 + (m3 + (m3 >> 3) & 1));
  return false;
}
function isValidTime(h2, m3, s) {
  if (h2 >= 24 || h2 < 0 || m3 > 59 || m3 < 0 || s > 60 || s < 0) return false;
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
    const element = node.elements[index];
    let defineKey = keys.get(index);
    if (defineKey) ctx.reportParseError("dupe-keys", getAfterNode(element, defineKey.node));
    else {
      defineKey = {
        value: VALUE_KIND_VALUE,
        node: element,
        keys: /* @__PURE__ */ new Map()
      };
      defineKeys.set(index, defineKey);
      if (element.type === "TOMLInlineTable") verifyDuplicateKeysForInlineTable(ctx, defineKey.keys, element);
      else if (element.type === "TOMLArray") verifyDuplicateKeysForArray(ctx, defineKey.keys, element);
    }
  }
}
function getAfterNode(a2, b3) {
  return a2.range[0] <= b3.range[0] ? b3 : a2;
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
  constructor(text2, parserOptions) {
    this.text = text2;
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
    const text2 = this.text;
    const [startRange, endRange] = token.range;
    let numberString = null;
    const getNumberText = () => {
      return numberString ?? (numberString = text2.slice(startRange, endRange).replace(/_/g, ""));
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
      set(baseTable, resolveValue(node.key), value);
      return baseTable;
    },
    TOMLTable(node, baseTable = {}) {
      const table2 = getTable(baseTable, resolveValue(node.key), node.kind === "array");
      for (const body of node.body) resolveValue(body, table2);
      return baseTable;
    },
    TOMLArray(node) {
      return node.elements.map((e) => resolveValue(e));
    },
    TOMLInlineTable(node) {
      const table2 = {};
      for (const body of node.body) resolveValue(body, table2);
      return table2;
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
function getTable(baseTable, keys, array) {
  let target = baseTable;
  for (let index = 0; index < keys.length - 1; index++) {
    const key = keys[index];
    target = getNextTargetFromKey(target, key);
  }
  const lastKey = last(keys);
  const lastTarget = target[lastKey];
  if (lastTarget == null) {
    const tableValue$1 = {};
    target[lastKey] = array ? [tableValue$1] : tableValue$1;
    return tableValue$1;
  }
  if (isValue(lastTarget)) {
    const tableValue$1 = {};
    target[lastKey] = array ? [tableValue$1] : tableValue$1;
    return tableValue$1;
  }
  if (!array) {
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
function set(baseTable, keys, value) {
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
import { mkdirSync as mkdirSync2, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path2 from "node:path";
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
function unlinkWithRetry(file, opts = {}) {
  const unlink = opts.unlink ?? unlinkSync;
  const sleep = opts.sleep ?? sleepSync;
  const win = (opts.platform ?? process.platform) === "win32";
  for (let attempt = 0; ; attempt += 1) {
    try {
      unlink(file);
      return;
    } catch (e) {
      if (errCode(e) === "ENOENT") return;
      const busy = win && ATOMIC_RENAME_BUSY_CODES.includes(errCode(e) ?? "");
      if (!busy || attempt >= ATOMIC_RENAME_RETRIES) throw replaceFailure(file, e);
      sleep(ATOMIC_RENAME_DELAY_MS);
    }
  }
}
function replaceFailure(file, e) {
  const busy = ATOMIC_RENAME_BUSY_CODES.includes(errCode(e) ?? "");
  const cause = e.message;
  return new Error(busy ? `Could not replace ${file}: ${cause}. Fix: close the program using ${file}, then re-run` : `Could not write ${file}: ${cause}. Fix: check the path and its permissions, then re-run`, { cause: e });
}
function removeTmpFile(tmp, opts = {}) {
  try {
    unlinkWithRetry(tmp, opts);
  } catch {
  }
}
function atomicWriteFile(file, text2, opts = {}) {
  mkdirSync2(path2.dirname(file), { recursive: true });
  const tmp = path2.join(path2.dirname(file), `${ATOMIC_TMP_PREFIX}${path2.basename(file)}${ATOMIC_TMP_MARK}${process.pid}`);
  try {
    writeFileSync(tmp, text2);
    renameWithRetry(tmp, file, opts);
  } catch (e) {
    removeTmpFile(tmp, opts);
    throw replaceFailure(file, e);
  }
}

// src/core/ops/host-text.ts
var BOM_CODE = 65279;
var CR_CODE = 13;
var CRLF = "\r\n";
var LF = "\n";
function hostLayout(raw) {
  let crlf = 0;
  let lf = 0;
  for (let i2 = raw.indexOf(LF); i2 >= 0; i2 = raw.indexOf(LF, i2 + 1)) {
    if (i2 > 0 && raw.charCodeAt(i2 - 1) === CR_CODE) crlf += 1;
    else lf += 1;
  }
  return { bom: raw.length > 0 && raw.charCodeAt(0) === BOM_CODE, crlf: crlf > 0 && crlf >= lf };
}
function hostText(raw) {
  const bare = raw.length > 0 && raw.charCodeAt(0) === BOM_CODE ? raw.slice(1) : raw;
  return bare.indexOf(CRLF) < 0 ? bare : bare.split(CRLF).join(LF);
}
function withLayout(text2, layout) {
  const eol = layout.crlf ? text2.split(LF).join(CRLF) : text2;
  return layout.bom ? String.fromCharCode(BOM_CODE) + eol : eol;
}

// src/core/ops/host-config.ts
function stripJsonComments(text2) {
  let out2 = "";
  let i2 = 0;
  while (i2 < text2.length) {
    const c3 = text2[i2];
    if (c3 === '"') {
      let j2 = i2 + 1;
      while (j2 < text2.length && text2[j2] !== '"') j2 += text2[j2] === "\\" ? 2 : 1;
      out2 += text2.slice(i2, j2 + 1);
      i2 = j2 + 1;
    } else if (c3 === "/" && text2[i2 + 1] === "/") {
      while (i2 < text2.length && text2[i2] !== "\n") {
        out2 += " ";
        i2 += 1;
      }
    } else if (c3 === "/" && text2[i2 + 1] === "*") {
      const end = text2.indexOf("*/", i2 + 2);
      const stop = end < 0 ? text2.length : end + 2;
      for (; i2 < stop; i2 += 1) out2 += text2[i2] === "\n" ? "\n" : " ";
    } else {
      out2 += c3;
      i2 += 1;
    }
  }
  return out2;
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
    const c3 = this.s[this.i];
    if (c3 === "{") {
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
    if (c3 === "[") {
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
    if (c3 === '"') {
      this.str();
      return { kind: "scalar", start, end: this.i };
    }
    while (this.i < this.s.length && !" 	\r\n,}]".includes(this.s[this.i])) this.i += 1;
    if (this.i === start) this.fail();
    return { kind: "scalar", start, end: this.i };
  }
};
function blankTrailingCommas(s) {
  let out2 = "";
  for (let i2 = 0; i2 < s.length; i2 += 1) {
    const c3 = s[i2];
    if (c3 === '"') {
      let j2 = i2 + 1;
      while (j2 < s.length && s[j2] !== '"') j2 += s[j2] === "\\" ? 2 : 1;
      out2 += s.slice(i2, j2 + 1);
      i2 = j2;
      continue;
    }
    if (c3 === ",") {
      let j2 = i2 + 1;
      while (j2 < s.length && " 	\r\n".includes(s[j2])) j2 += 1;
      if (s[j2] === "}" || s[j2] === "]") {
        out2 += " ";
        continue;
      }
    }
    out2 += c3;
  }
  return out2;
}
function scanJson(text2, format) {
  const clean = format === "jsonc" ? blankTrailingCommas(stripJsonComments(text2)) : text2;
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
function lineStartOf(text2, at) {
  return at === 0 ? 0 : text2.lastIndexOf("\n", at - 1) + 1;
}
function lineEndOf(text2, at) {
  const nl = text2.indexOf("\n", at);
  return nl < 0 ? text2.length : nl + 1;
}
function tomlValue(text2) {
  return getStaticTOMLValue(parseTOML(text2));
}
function scanToml(text2) {
  const program = parseTOML(text2);
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
    const path9 = node.resolvedKey;
    for (const kv of node.body) addKey(path9, kv);
    if (node.kind !== "standard") continue;
    const start = lineStartOf(text2, node.range[0]);
    const headEnd = lineEndOf(text2, node.key.range[1]);
    const last2 = node.body[node.body.length - 1];
    tables.push({
      path: path9,
      header: text2.slice(start, text2[headEnd - 1] === "\n" ? headEnd - 1 : headEnd),
      start,
      end: last2 === void 0 ? headEnd : lineEndOf(text2, last2.range[1])
    });
  }
  return { value: getStaticTOMLValue(program), tables, keys };
}
function tomlTableSpans(text2) {
  return scanToml(text2).tables;
}
function tomlHeaderText(path9) {
  return "[" + path9.map(tomlHeaderKey).join(".") + "]";
}
function parseHostConfig(agent, path9, text2, format) {
  try {
    return format === "toml" ? scanToml(text2).value : scanJson(text2, format).value;
  } catch {
    throw new CtxError("CONFIG_PARSE_FAILED", { agent, path: path9, format });
  }
}
function hostConfigValueAt(value, path9) {
  let cur = value;
  for (const seg of path9) {
    if (!isPlainObject(cur)) return void 0;
    cur = cur[seg];
  }
  return cur;
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function sameValue(a2, b3) {
  if (a2 === b3) return true;
  if (Array.isArray(a2) && Array.isArray(b3)) return a2.length === b3.length && a2.every((x2, k) => sameValue(x2, b3[k]));
  if (isPlainObject(a2) && isPlainObject(b3)) {
    const ka = Object.keys(a2);
    return ka.length === Object.keys(b3).length && ka.every((k) => sameValue(a2[k], b3[k]));
  }
  return false;
}
function lineIndent(text2, at) {
  let s = at;
  while (s > 0 && text2[s - 1] !== "\n") s -= 1;
  let e = s;
  while (text2[e] === " " || text2[e] === "	") e += 1;
  return text2.slice(s, e);
}
function indentUnit(root, clean) {
  if (root === null || root.kind !== "object" || root.members.length === 0) return JSON_INDENT_UNIT;
  const own2 = lineIndent(clean, root.members[0].keyStart);
  return own2 === "" ? JSON_INDENT_UNIT : own2;
}
function render(value, unit, base) {
  return JSON.stringify(value, null, unit).split("\n").join("\n" + base);
}
function nest(path9, value) {
  let out2 = value;
  for (let k = path9.length - 1; k >= 0; k -= 1) out2 = { [path9[k]]: out2 };
  return out2;
}
function setJsonText(text2, format, path9, value) {
  const doc = scanJson(text2, format);
  const unit = indentUnit(doc.root, doc.clean);
  if (doc.root === null) return render(nest(path9, value), unit, "") + "\n";
  let node = doc.root;
  let depth = 0;
  while (depth < path9.length && node.kind === "object") {
    const hit = node.members.find((m3) => m3.key === path9[depth]);
    if (hit === void 0) break;
    node = hit.node;
    depth += 1;
  }
  if (depth === path9.length) {
    return text2.slice(0, node.start) + render(value, unit, lineIndent(doc.clean, node.start)) + text2.slice(node.end);
  }
  if (node.kind !== "object") throw new SyntaxError("not an object at " + path9.slice(0, depth).join("."));
  const rest = nest(path9.slice(depth + 1), value);
  const last2 = node.members[node.members.length - 1];
  if (last2 === void 0) {
    const base2 = lineIndent(doc.clean, node.start);
    const member2 = "\n" + base2 + unit + JSON.stringify(path9[depth]) + ": " + render(rest, unit, base2 + unit) + "\n" + base2;
    return text2.slice(0, node.start + 1) + member2 + text2.slice(node.end - 1);
  }
  const base = lineIndent(doc.clean, last2.keyStart);
  let at = last2.node.end;
  while (" 	\r\n".includes(doc.clean[at])) at += 1;
  const trailing = doc.clean[at] === ",";
  const insertAt = trailing ? at + 1 : last2.node.end;
  const member = (trailing ? "" : ",") + "\n" + base + JSON.stringify(path9[depth]) + ": " + render(rest, unit, base);
  return text2.slice(0, insertAt) + member + text2.slice(insertAt);
}
function tomlScalar(v) {
  if (Array.isArray(v)) return "[" + v.map(tomlScalar).join(", ") + "]";
  if (isPlainObject(v)) return "{ " + Object.entries(v).map(([k, x2]) => tomlHeaderKey(k) + " = " + tomlScalar(x2)).join(", ") + " }";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new SyntaxError("unsupported TOML value");
}
function tomlHeaderKey(seg) {
  if (seg === "") return '""';
  for (const ch of seg) {
    const bare = ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch >= "0" && ch <= "9" || ch === "_" || ch === "-";
    if (!bare) return JSON.stringify(seg);
  }
  return seg;
}
function tomlBlock(path9, value) {
  let out2 = "[" + path9.map(tomlHeaderKey).join(".") + "]\n";
  const subs = [];
  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject(v)) subs.push(tomlBlock([...path9, k], v));
    else out2 += tomlHeaderKey(k) + " = " + tomlScalar(v) + "\n";
  }
  return [out2, ...subs].join("\n");
}
function under(path9, prefix) {
  return path9.length >= prefix.length && prefix.every((seg, k) => path9[k] === seg);
}
function keyLineRange(text2, k) {
  const ls = lineStartOf(text2, k.start);
  const le = lineEndOf(text2, k.end);
  const rest = text2.slice(k.end, le).trim();
  const alone = text2.slice(ls, k.start).trim() === "" && (rest === "" || rest.startsWith("#"));
  return alone ? [ls, le] : [k.start, k.end];
}
function withValueAt(root, rel, value) {
  if (rel.length === 0) return value;
  const base = isPlainObject(root) ? { ...root } : {};
  const next = withValueAt(base[rel[0]], rel.slice(1), value);
  if (next === void 0) delete base[rel[0]];
  else base[rel[0]] = next;
  return base;
}
function replaceToml(text2, doc, path9, value) {
  const block2 = value === void 0 ? "" : tomlBlock(path9, value);
  const owned = doc.tables.filter((t2) => under(t2.path, path9));
  const cuts = doc.keys.filter((k) => under(k.full, path9) && !under(k.base, path9)).map((k) => [...keyLineRange(text2, k), ""]);
  owned.forEach((t2, n3) => cuts.push([t2.start, t2.end, n3 === 0 ? block2 : ""]));
  cuts.sort((a2, b3) => b3[0] - a2[0]);
  let out2 = text2;
  for (const [s, e, put] of cuts) out2 = out2.slice(0, s) + put + out2.slice(e);
  if (owned.length > 0 || block2 === "") return out2;
  const sep2 = out2 === "" ? "" : out2.endsWith("\n\n") ? "" : out2.endsWith("\n") ? "\n" : "\n\n";
  return out2 + sep2 + block2;
}
var tableLike = (v) => v === void 0 || isPlainObject(v);
function setTomlText(text2, path9, value) {
  if (value !== void 0 && !isPlainObject(value)) throw new SyntaxError("TOML edits replace a whole table");
  const doc = scanToml(text2);
  const cur = hostConfigValueAt(doc.value, path9);
  if (sameValue(cur, value)) return text2;
  const inline = doc.keys.find((k) => k.inline && k.full.length < path9.length && under(path9, k.full));
  if (inline !== void 0) {
    const whole = withValueAt(hostConfigValueAt(doc.value, inline.full), path9.slice(inline.full.length), value);
    return replaceToml(text2, doc, inline.full, whole);
  }
  if (isPlainObject(cur) && isPlainObject(value)) {
    const names = [.../* @__PURE__ */ new Set([...Object.keys(cur), ...Object.keys(value)])].filter((k) => !sameValue(cur[k], value[k]));
    if (names.every((k) => tableLike(cur[k]) && tableLike(value[k]))) {
      let out2 = text2;
      for (const k of names) out2 = setTomlText(out2, [...path9, k], value[k]);
      return out2;
    }
  }
  return replaceToml(text2, doc, path9, value);
}
function setText(agent, path9, text2, format, key, value) {
  try {
    if (format !== "toml") return setJsonText(text2, format, key, value);
    const out2 = setTomlText(text2, key, value);
    const landed = hostConfigValueAt(tomlValue(out2), key);
    const emptyTable = isPlainObject(value) && Object.keys(value).length === 0;
    if (!sameValue(landed, value) && !(emptyTable && landed === void 0)) throw new SyntaxError("edit did not land");
    return out2;
  } catch {
    throw new CtxError("CONFIG_PARSE_FAILED", { agent, path: path9, format });
  }
}
function applyEdits(agent, path9, text2, format, wanted) {
  const parsed = parseHostConfig(agent, path9, text2, format);
  let out2 = text2;
  const edits = [];
  for (const [key, after] of wanted) {
    const before = hostConfigValueAt(parsed, key);
    if (sameValue(before, after)) continue;
    out2 = setText(agent, path9, out2, format, key, after);
    edits.push({ path: key.join("."), before, after });
  }
  return { text: out2, format, edits };
}
function editHostConfigText(agent, path9, text2, format, wanted) {
  return applyEdits(agent, path9, text2, format, wanted);
}

// src/core/ops/detect-v1.ts
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var keyPath = (...parts) => parts.join(".");
var finding = (file, path9, reason) => ({ file, path: path9, reason });
function stripJsonc(text2) {
  let out2 = "";
  let inStr = false;
  let esc = false;
  for (let i2 = 0; i2 < text2.length; i2++) {
    const c3 = text2[i2];
    if (inStr) {
      out2 += c3;
      if (esc) esc = false;
      else if (c3 === "\\") esc = true;
      else if (c3 === '"') inStr = false;
      continue;
    }
    if (c3 === '"') {
      inStr = true;
      out2 += c3;
      continue;
    }
    if (c3 === "/" && text2[i2 + 1] === "/") {
      while (i2 < text2.length && text2[i2] !== "\n") i2++;
      out2 += "\n";
      continue;
    }
    if (c3 === "/" && text2[i2 + 1] === "*") {
      const end = text2.indexOf("*/", i2 + 2);
      i2 = end === -1 ? text2.length : end + 1;
      continue;
    }
    if (c3 === ",") {
      let j2 = i2 + 1;
      while (j2 < text2.length && " 	\r\n".includes(text2[j2])) j2++;
      if (text2[j2] === "}" || text2[j2] === "]") continue;
    }
    out2 += c3;
  }
  return out2;
}
function readJson(file) {
  try {
    return JSON.parse(stripJsonc(hostText(readFileSync2(file, "utf8"))));
  } catch {
    return void 0;
  }
}
function readText(file) {
  try {
    return hostText(readFileSync2(file, "utf8"));
  } catch {
    return "";
  }
}
function readTomlTables(file) {
  try {
    return tomlTableSpans(readText(file));
  } catch {
    return [];
  }
}
var listOf = (v) => Array.isArray(v) ? v : [];
var commandOf = (v) => isObj(v) && typeof v.command === "string" ? v.command : null;
function nestedCommands(doc) {
  const out2 = [];
  if (!isObj(doc) || !isObj(doc[HOOKS_KEY])) return out2;
  for (const [event, groups] of Object.entries(doc[HOOKS_KEY])) {
    listOf(groups).forEach((group2, i2) => {
      if (!isObj(group2)) return;
      listOf(group2[HOOKS_KEY]).forEach((inner, j2) => {
        const command = commandOf(inner);
        if (command !== null) out2.push({ path: keyPath(HOOKS_KEY, event, i2, HOOKS_KEY, j2), command });
      });
    });
  }
  return out2;
}
function flatCommands(events2, prefix) {
  const out2 = [];
  if (!isObj(events2)) return out2;
  for (const [event, entries] of Object.entries(events2)) {
    listOf(entries).forEach((entry2, i2) => {
      const command = commandOf(entry2);
      if (command !== null) out2.push({ path: keyPath(...prefix, event, i2), command });
    });
  }
  return out2;
}
var isV1Hook = (cmd) => cmd.includes(SERVER_KEY) && (V1_SCRIPT_NAMES.some((name) => cmd.includes(name)) || cmd.includes(V1_HOOK_COMMAND));
var isCodexScript = (cmd) => cmd.includes(V1_SCRIPT_EXT) && V1_PATH_SEPS.some((sep2) => cmd.includes(V1_CODEX_HOOKS_DIR.join(sep2) + sep2));
function dataDir(dir, reason, out2) {
  if (existsSync3(dir)) out2.push(finding(dir, "", reason));
}
function mcpEntry(file, doc, out2) {
  if (isObj(doc) && isObj(doc[MCP_SERVERS_KEY]) && Object.hasOwn(doc[MCP_SERVERS_KEY], SERVER_KEY)) {
    out2.push(finding(file, keyPath(MCP_SERVERS_KEY, SERVER_KEY), V1_REASON.mcpEntry));
  }
}
function claudeShapeSettings(agentHome, out2) {
  const file = join4(agentHome, SETTINGS_FILE);
  const doc = readJson(file);
  for (const c3 of nestedCommands(doc)) {
    if (c3.command.includes(V1_CACHE_HEAL_NAME)) out2.push(finding(file, c3.path, V1_REASON.cacheHealHook));
    else if (isV1Hook(c3.command)) out2.push(finding(file, c3.path, V1_REASON.hook));
  }
  const status = isObj(doc) ? commandOf(doc[STATUS_LINE_KEY]) : null;
  if (status !== null && status.includes(V1_STATUSLINE_COMMAND)) {
    out2.push(finding(file, STATUS_LINE_KEY, V1_REASON.statusLine));
  }
  mcpEntry(file, doc, out2);
}
function v1HookFile(file, out2) {
  const doc = readJson(file);
  const cmds = isObj(doc) ? flatCommands(doc[HOOKS_KEY], [HOOKS_KEY]) : [];
  if (cmds.some((c3) => c3.command.includes(V1_HOOK_COMMAND))) out2.push(finding(file, "", V1_REASON.hookFile));
}
function scanClaudeCode(home, agentHome, out2) {
  claudeShapeSettings(agentHome, out2);
  for (const ext of V1_CACHE_HEAL_EXTS) {
    const file = join4(agentHome, V1_HOOKS_DIR_NAME, V1_CACHE_HEAL_NAME + ext);
    if (existsSync3(file)) out2.push(finding(file, "", V1_REASON.cacheHealFile));
  }
  const userFile = join4(home, CLAUDE_USER_CONFIG_FILE);
  mcpEntry(userFile, readJson(userFile), out2);
  dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out2);
}
function scanCodex(agentHome, out2) {
  const hooksFile = join4(agentHome, HOOKS_JSON_FILE);
  for (const c3 of nestedCommands(readJson(hooksFile))) {
    if (c3.command.includes(V1_CODEX_HOOK_COMMAND) || isCodexScript(c3.command)) {
      out2.push(finding(hooksFile, c3.path, V1_REASON.codexHook));
    }
  }
  const tomlFile = join4(agentHome, CONFIG_TOML_FILE);
  for (const span of readTomlTables(tomlFile)) {
    if (tomlHeaderText(span.path).startsWith(V1_TOML_SECTION_PREFIX)) out2.push(finding(tomlFile, span.header.trim(), V1_REASON.codexToml));
  }
  dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out2);
}
function scanGemini(agentHome, out2) {
  const file = join4(agentHome, SETTINGS_FILE);
  for (const c3 of nestedCommands(readJson(file))) {
    if (c3.command.includes(SERVER_KEY)) out2.push(finding(file, c3.path, V1_REASON.hook));
  }
  dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDirShared, out2);
}
function scanVscode(agentHome, project, out2) {
  if (project !== void 0) {
    v1HookFile(join4(project, GITHUB_DIR_NAME, V1_HOOKS_DIR_NAME, OWN_HOOK_FILE), out2);
    const mcpFile = join4(project, VSCODE_DIR_NAME, VSCODE_MCP_FILE);
    const doc = readJson(mcpFile);
    const servers = isObj(doc) && isObj(doc[VSCODE_MCP_SERVERS_KEY]) ? doc[VSCODE_MCP_SERVERS_KEY] : {};
    const entry2 = Object.hasOwn(servers, SERVER_KEY) ? servers[SERVER_KEY] : void 0;
    if (isObj(entry2) && (entry2.command === V1_BIN_COMMAND || listOf(entry2.args).some((a2) => a2 === V1_BIN_COMMAND))) {
      out2.push(finding(mcpFile, keyPath(VSCODE_MCP_SERVERS_KEY, SERVER_KEY), V1_REASON.vscodeMcp));
    }
    dataDir(join4(project, GITHUB_DIR_NAME, V1_DATA_DIR_NAME, V1_SESSIONS_DIR_NAME), V1_REASON.dataDir, out2);
  }
  dataDir(join4(agentHome, V1_DATA_DIR_NAME, V1_SESSIONS_DIR_NAME), V1_REASON.dataDir, out2);
}
function jsonFiles(dir) {
  try {
    return readdirSync2(dir).filter((name) => name.endsWith(KIRO_AGENT_FILE_EXT)).sort();
  } catch {
    return [];
  }
}
function scanKiro(agentHome, project, out2) {
  const agentsDir = join4(agentHome, KIRO_AGENTS_DIR);
  const defaultFile = join4(agentHome, ...KIRO_AGENT_FILE);
  for (const name of jsonFiles(agentsDir)) {
    const file = join4(agentsDir, name);
    const doc = readJson(file);
    if (isObj(doc) && doc[KIRO_AGENT_NAME_KEY] === SERVER_KEY) {
      out2.push(finding(file, "", V1_REASON.kiroAgentFile));
      continue;
    }
    if (file !== defaultFile) continue;
    for (const c3 of isObj(doc) ? flatCommands(doc[HOOKS_KEY], [HOOKS_KEY]) : []) {
      if (isV1Hook(c3.command)) out2.push(finding(file, c3.path, V1_REASON.kiroHook));
    }
  }
  const steeringDocs = [join4(agentHome, ...KIRO_STEERING_FILE)];
  if (project !== void 0) steeringDocs.push(join4(project, ...AGENT_HOME_DIR.kiro, ...KIRO_STEERING_FILE));
  for (const file of steeringDocs) {
    if (existsSync3(file)) out2.push(finding(file, "", V1_REASON.kiroSteering));
  }
  dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out2);
}
function scanPi(piAgentDir, agentHome, out2) {
  const file = join4(piAgentDir, SETTINGS_FILE);
  const doc = readJson(file);
  listOf(isObj(doc) ? doc[PI_PACKAGES_KEY] : void 0).forEach((pkg, i2) => {
    const spec = isObj(pkg) ? pkg[PI_PACKAGE_SOURCE_KEY] : pkg;
    if (spec === V1_PI_PACKAGE) out2.push(finding(file, keyPath(PI_PACKAGES_KEY, i2), V1_REASON.piNpm));
  });
  dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out2);
}
function scanOpencode(agentHome, out2) {
  for (const name of OPENCODE_CONFIG_FILES) {
    const file = join4(agentHome, name);
    const doc = readJson(file);
    if (!isObj(doc) || !Array.isArray(doc[OPENCODE_PLUGIN_KEY])) continue;
    doc[OPENCODE_PLUGIN_KEY].forEach((spec, i2) => {
      if (spec === V1_OPENCODE_PLUGIN_SPEC) out2.push(finding(file, keyPath(OPENCODE_PLUGIN_KEY, i2), V1_REASON.opencodePlugin));
    });
    return;
  }
}
function scanZcode(agentHome, out2) {
  const configFile = join4(agentHome, ZCODE_CLI_DIR, CONFIG_JSON_FILE);
  const config = readJson(configFile);
  const events2 = isObj(config) && isObj(config[HOOKS_KEY]) ? config[HOOKS_KEY][ZCODE_EVENTS_KEY] : void 0;
  for (const c3 of flatCommands(events2, [HOOKS_KEY, ZCODE_EVENTS_KEY])) {
    if (c3.command.includes(V1_HOOK_COMMAND)) out2.push(finding(configFile, c3.path, V1_REASON.zcodeHook));
  }
  const hooksFile = join4(agentHome, ZCODE_CLI_DIR, HOOKS_JSON_FILE);
  for (const c3 of nestedCommands(readJson(hooksFile))) {
    if (c3.command.includes(V1_HOOK_COMMAND)) out2.push(finding(hooksFile, c3.path, V1_REASON.zcodeHook));
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
function scanAll(home, tmp, out2) {
  const root = join4(home, DATA_ROOT.slice(1));
  for (const name of V1_DATA_ROOT_ENTRIES) dataDir(join4(root, name), V1_REASON.dataRoot, out2);
  if (firstTmpMatch(tmp) !== null) out2.push(finding(tmp, V1_TMP_PREFIX + "*", V1_REASON.tmpFile));
}
function detectV1(agent, home, scope = {}) {
  const out2 = [];
  const project = scope.project;
  const agentHome = agent === "claude-code" && scope.claudeDir !== void 0 ? scope.claudeDir : agent === "copilot-cli" && scope.copilotDir !== void 0 ? scope.copilotDir : agent === "kiro" && scope.kiroDir !== void 0 ? scope.kiroDir : agent === "opencode" && scope.opencodeDir !== void 0 ? scope.opencodeDir : join4(home, ...AGENT_HOME_DIR[agent]);
  switch (agent) {
    case "claude-code":
      scanClaudeCode(home, agentHome, out2);
      break;
    case "codex":
      scanCodex(agentHome, out2);
      break;
    case "gemini":
      scanGemini(agentHome, out2);
      break;
    case "qwen":
      claudeShapeSettings(agentHome, out2);
      dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out2);
      break;
    case "copilot-cli":
      v1HookFile(join4(agentHome, V1_HOOKS_DIR_NAME, OWN_HOOK_FILE), out2);
      dataDir(join4(agentHome, V1_DATA_DIR_NAME), V1_REASON.dataDir, out2);
      break;
    case "vscode":
      scanVscode(agentHome, project, out2);
      break;
    case "kiro":
      scanKiro(agentHome, project, out2);
      break;
    case "pi":
      scanPi(scope.piAgentDir !== void 0 && scope.piAgentDir !== "" ? scope.piAgentDir : join4(agentHome, PI_AGENT_DIR), agentHome, out2);
      break;
    // D-WIN-PIDIR-1: empty is unset
    case "opencode":
      scanOpencode(agentHome, out2);
      break;
    case "zcode":
      scanZcode(agentHome, out2);
      break;
  }
  scanAll(home, scope.tmp ?? tmpdir(), out2);
  return out2;
}

// src/core/ops/plugin-root.ts
import { existsSync as existsSync4, readdirSync as readdirSync3, readFileSync as readFileSync3, realpathSync as realpathSync2 } from "node:fs";
import { dirname as dirname3, isAbsolute, join as join5, sep } from "node:path";
import { fileURLToPath } from "node:url";

// src/core/ops/doctor-config.ts
var [PART_MCP, PART_HOOKS, PART_TIMEOUT] = D3_PARTS;
function composeMatcher(row, event) {
  let prefix = "";
  for (const ch of row.toolNamePrefix) prefix += REGEX_SPECIAL_CHARS.includes(ch) ? REGEX_ESCAPE + ch : ch;
  const names = Object.values(row.nativeTools).flat();
  const alts = [...names, prefix + OWN_TOOL_PREFIX + MATCHER_ANY];
  if (event === POST_TOOL_USE && hasReplace(row)) alts.push(MCP_ANY_MATCH);
  return MATCHER_OPEN + alts.join(MATCHER_ALT) + MATCHER_CLOSE;
}

// src/setup/hook-shapes.ts
var MS_PER_SECOND = 1e3;
var TOOL_EVENTS = ["PreToolUse", "PostToolUse"];
var seconds = (row) => row.hookTimeoutMs / MS_PER_SECOND;
var entry = (cmd) => ({ type: "command", command: cmd });
var events = (row) => Object.entries(row.eventMap);
var isToolEvent = (canonical) => TOOL_EVENTS.includes(canonical);
function nestedShape(row, cmd, timeout, withMatcher) {
  const hooks = {};
  for (const [canonical, native] of events(row)) {
    const group2 = { hooks: [{ ...entry(cmd), timeout }] };
    if (withMatcher && isToolEvent(canonical)) group2.matcher = composeMatcher(row, native);
    hooks[native] = [group2];
  }
  return { hooks };
}
var POWERSHELL_CALL = "& ";
function flatShape(row, cmd, timeoutKey) {
  const hooks = {};
  for (const [, native] of events(row)) hooks[native] = [{ ...entry(cmd), powershell: POWERSHELL_CALL + cmd, [timeoutKey]: seconds(row) }];
  return { version: 1, hooks };
}
function kiroShape(row, cmd) {
  const hooks = events(row).flatMap(([canonical, native]) => {
    const e = { name: SERVER_KEY + "-" + native, trigger: native, action: entry(cmd), timeout: seconds(row), enabled: true };
    if (!isToolEvent(canonical)) return [e];
    return KIRO_TOOL_MATCHERS.map(([matcher, tag]) => ({ ...e, name: SERVER_KEY + "-" + native + "-" + tag, matcher }));
  });
  return { version: "v1", hooks };
}
function zcodeShape(row, cmd) {
  const byEvent = {};
  for (const [canonical, native] of events(row)) {
    const group2 = { hooks: [{ ...entry(cmd), timeoutMs: row.hookTimeoutMs }] };
    if (isToolEvent(canonical)) group2.matcher = composeMatcher(row, native);
    byEvent[native] = [group2];
  }
  return { hooks: { enabled: true, events: byEvent } };
}
var HOOK_SHAPES = {
  "claude-code": (row, cmd) => nestedShape(row, cmd, seconds(row), true),
  codex: (row, cmd) => nestedShape(row, cmd, seconds(row), true),
  gemini: (row, cmd) => nestedShape(row, cmd, row.hookTimeoutMs, false),
  qwen: (row, cmd) => nestedShape(row, cmd, seconds(row), true),
  "copilot-cli": (row, cmd) => flatShape(row, cmd, "timeoutSec"),
  vscode: (row, cmd) => flatShape(row, cmd, "timeout"),
  kiro: kiroShape,
  zcode: zcodeShape,
  pi: null,
  opencode: null
};

// src/setup/registry.ts
var SERVER_BUNDLE = "server.mjs";
var HOOK_BUNDLE = "hook.mjs";
var AGENT_FLAG = "--agent";
var STATE_DIR = ".context-mode";
var LOCK_FILE = "setup.lock";
var BACKUP_DIR = "backups";
var PLUGIN_ID = `${SERVER_KEY}@${SERVER_KEY}`;
var SKILLS_DIR_NAME = "skills";
var INSTRUCTION_FILES = Object.freeze([
  "CLAUDE.md",
  "AGENTS.md",
  "AGENTS.override.md",
  "GEMINI.md",
  "QWEN.md",
  "copilot-instructions.md",
  "KIRO.md"
]);
function configEdits(c3) {
  return [[c3.key, c3.value], ...c3.also ?? []];
}
var COMMAND_SKILLS = Object.freeze(["ctx-doctor", "ctx-stats", "ctx-upgrade"]);
var SKILL_FILE = "SKILL.md";
var OPENCODE_PLUGIN = ["opencode", "plugin.js"];
var CODEX_CONFIG_FILE = "config.toml";
var CODEX_HOME_ENV2 = "CODEX_HOME";
var CODEX_DIR = ".codex";
var COPILOT_DIR = ".copilot";
var KIRO_DIR = AGENT_HOME_DIR.kiro[0];
var OPENCODE_HOME_SEGS = AGENT_HOME_DIR.opencode;
function agentPath(ctx, id, rel) {
  const segs = typeof rel === "string" ? rel.split("/") : [...rel];
  const codexHome = ctx.env[CODEX_HOME_ENV2];
  if (id === "codex" && segs[0] === CODEX_DIR && codexHome !== void 0 && codexHome !== "") return path3.join(codexHome, ...segs.slice(1));
  if (id === "copilot-cli" && segs[0] === COPILOT_DIR) return path3.join(copilotDirOf(ctx.env, ctx.home), ...segs.slice(1));
  if (id === "kiro" && segs[0] === KIRO_DIR) return path3.join(kiroDirOf(ctx.env, ctx.home), ...segs.slice(1));
  if (id === "opencode" && segs[0] === OPENCODE_HOME_SEGS[0] && segs[1] === OPENCODE_HOME_SEGS[1]) return path3.join(opencodeDirOf(ctx.env, ctx.home), ...segs.slice(2));
  return path3.join(ctx.home, ...segs);
}
function renderSkill(text2, prefix) {
  const prefixes = typeof prefix === "string" ? [prefix] : prefix;
  if (prefixes.length === 1 && prefixes[0] === "") return text2;
  let out2 = text2;
  for (const tool of TOOL_ORDER) out2 = out2.split(tool).join(prefixes.map((p3) => p3 + tool).join(SKILL_NAME_JOIN));
  return out2;
}
var SKILL_NAME_JOIN = " or ";
function skillDirPrefixes(dirPath) {
  const out2 = [];
  for (const r2 of ADAPTERS) {
    if (r2.skillChannel.kind === "home-dir" && r2.skillChannel.path === dirPath && !out2.includes(r2.toolNamePrefix)) out2.push(r2.toolNamePrefix);
  }
  return out2;
}
var EXTENSION_LIST = ["extensions", "list"];
function extensionPlugin(bin, id) {
  return {
    bin,
    args: EXTENSION_LIST,
    plugin: SERVER_KEY,
    hooksVia: getAdapter(id).hookChannel.path,
    skillsVia: SKILLS_DIR_NAME,
    format: "extension",
    enable: ["extensions", "enable", SERVER_KEY]
  };
}
var NATIVE_PLUGIN = {
  codex: { bin: "codex", args: ["plugin", "list"], plugin: PLUGIN_ID, hooksVia: ".codex-plugin", skillsVia: path3.join("codex", SKILLS_DIR_NAME), format: "table" },
  qwen: extensionPlugin("qwen", "qwen"),
  gemini: extensionPlugin("gemini", "gemini")
};
function serverCmd(ctx, id) {
  return [process.execPath, path3.join(ctx.pkgDir, SERVER_BUNDLE), AGENT_FLAG, id];
}
function hookCommandString(row) {
  const [node, file, flag, id] = row.hookCommand ?? [];
  return `"${node}" "${file}" ${flag} ${id}`;
}
function golden(row, home) {
  const shell = row.nativeTools.shell?.[0];
  return {
    hook_event_name: row.eventMap.PreToolUse ?? "PreToolUse",
    session_id: "context-mode-setup-verify",
    cwd: home,
    tool_name: shell ?? "ctx_execute",
    tool_input: { command: "true" }
  };
}
var VSCODE_WORKSPACE_VAR = "${workspaceFolder}";
function configFor(ctx, id) {
  const [node, server, flag, agent] = serverCmd(ctx, id);
  const own2 = OWN_MCP_ENTRY[id];
  if (own2) {
    const file = id === "vscode" ? ownMcpFileOf(id, own2.file, ctx.env, ctx.home) : agentPath(ctx, id, own2.file);
    const format = file.endsWith(".toml") ? "toml" : id === "vscode" ? "jsonc" : "json";
    const args = id === "vscode" ? [server, flag, agent, WORKSPACE_FOLDER_FLAG, VSCODE_WORKSPACE_VAR] : [server, flag, agent];
    const also = own2.also?.map(([k, v]) => [k, v]);
    return { file, format, key: own2.key, value: { ...own2.fields, command: node, args }, ...also ? { also } : {} };
  }
  if (id === "opencode") {
    return {
      file: path3.join(opencodeDirOf(ctx.env, ctx.home), OPENCODE_BASE_CONFIG_FILE),
      format: "jsonc",
      key: ["mcp", SERVER_KEY],
      value: { type: "local", command: [node, server, flag, agent], enabled: true }
    };
  }
  return void 0;
}
function cliFor(ctx, id) {
  const s = serverCmd(ctx, id);
  switch (id) {
    case "claude-code":
      return { bin: "claude", install: [["plugin", "marketplace", "add", ctx.pkgDir], ["plugin", "install", PLUGIN_ID]], remove: [["plugin", "uninstall", PLUGIN_ID]] };
    // D-INST-1: `extensions install <dir>` waits on a trust prompt even with --consent; `link` does not (ADR-0019 section 3).
    // Qwen has no consent flag, so its risk prompt gets `y` on stdin.
    case "gemini":
      return { bin: "gemini", install: [["extensions", "link", ctx.pkgDir, "--consent"]], remove: [["extensions", "uninstall", SERVER_KEY]] };
    case "qwen":
      return { bin: "qwen", install: [["extensions", "link", ctx.pkgDir]], remove: [["extensions", "uninstall", SERVER_KEY]], input: "y\n" };
    case "copilot-cli":
      return { bin: "copilot", install: [["mcp", "add", SERVER_KEY, "--", ...s]], remove: [["mcp", "remove", SERVER_KEY]] };
    case "pi":
      return { bin: "pi", install: [["install", ctx.pkgDir]], remove: [["remove", ctx.pkgDir]] };
    default:
      return void 0;
  }
}
function copyFor(ctx, id) {
  if (id !== "claude-code") return void 0;
  const file = path3.join(claudeDirOf(ctx.env, ctx.home), HOST_PLUGINS_DIR_NAME, INSTALLED_PLUGINS_FILE);
  return { host: "Claude Code", bin: "claude", plugin: PLUGIN_ID, file, refresh: ["plugin", "update", PLUGIN_ID] };
}
var LIST = {
  "claude-code": { bin: "claude", args: ["plugin", "list"] },
  codex: { bin: "codex", args: ["mcp", "list"] },
  gemini: { bin: "gemini", args: ["extensions", "list"] },
  qwen: { bin: "qwen", args: ["extensions", "list"] },
  "copilot-cli": { bin: "copilot", args: ["mcp", "list"] },
  pi: { bin: "pi", args: ["list"] },
  // D-HF-OPENCODE-LIST-1: --pure skips external plugins, so a fresh HOME does not wait on the @opencode-ai/plugin install.
  opencode: { bin: "opencode", args: ["mcp", "list", "--pure"] }
};
function hookFilesFor(ctx, id) {
  const home = ctx.home;
  switch (id) {
    case "codex":
      return [{ file: agentPath(ctx, id, [CODEX_DIR, "hooks.json"]), mode: "rewrite" }];
    case "copilot-cli":
      return [{ file: agentPath(ctx, id, [COPILOT_DIR, "hooks", "context-mode.json"]), mode: "rewrite" }];
    case "claude-code":
      return [{ file: path3.join(claudeDirOf(ctx.env, home), "settings.json"), mode: "drop" }];
    case "gemini":
      return [{ file: path3.join(home, ".gemini", "settings.json"), mode: "drop" }];
    case "qwen":
      return [{ file: path3.join(home, ".qwen", "settings.json"), mode: "drop" }];
    default:
      return [];
  }
}
function hookInstallFor(ctx, row, command) {
  const ch = row.hookChannel;
  if (ch.kind === "home-file") {
    const shape = HOOK_SHAPES[row.id];
    if (!shape) throw new Error(`setup: ${row.id} has a home-file hook channel and no hook shape`);
    const file = agentPath(ctx, row.id, ch.path);
    if (row.id === "codex") return { kind: "file", file, shape: shape(row, command), command, trust: path3.join(path3.dirname(file), CODEX_CONFIG_FILE) };
    return { kind: "file", file, shape: shape(row, command), command };
  }
  if (row.id === "opencode") {
    return {
      kind: "plugin-list",
      file: path3.join(opencodeDirOf(ctx.env, ctx.home), OPENCODE_BASE_CONFIG_FILE),
      key: ["plugin"],
      entry: path3.join(ctx.pkgDir, ...OPENCODE_PLUGIN)
    };
  }
  return { kind: "package", via: ch.path };
}
function bareSkillDir() {
  const row = ADAPTERS.find((r2) => r2.skillChannel.kind === "package" && r2.toolNamePrefix === "");
  if (row === void 0) throw new Error("setup: no package skill channel holds the bare tool names");
  return row.skillChannel.path;
}
function skillInstallFor(ctx, row) {
  const ch = row.skillChannel;
  if (ch.kind === "package") return { kind: "package", via: ch.path };
  const dir = agentPath(ctx, row.id, ch.path);
  const src = path3.join(ctx.pkgDir, bareSkillDir());
  return { kind: "dir", dir, prefixes: skillDirPrefixes(ch.path), files: COMMAND_SKILLS.map((name) => ({
    name,
    src: path3.join(src, name, SKILL_FILE),
    file: path3.join(dir, name, SKILL_FILE)
  })) };
}
function buildRegistry(ctx) {
  return ADAPTERS.map((row) => {
    const id = row.id;
    const config = configFor(ctx, id);
    const hookFiles = hookFilesFor(ctx, id);
    const hookCommand = [process.execPath, path3.join(ctx.pkgDir, HOOK_BUNDLE), AGENT_FLAG, id];
    const command = `"${hookCommand[0]}" "${hookCommand[1]}" ${AGENT_FLAG} ${id}`;
    const hookInstall = hookInstallFor(ctx, getAdapter(id), command);
    const skillInstall = skillInstallFor(ctx, row);
    const writes = [
      ...config ? [config.file] : [],
      ...hookFiles.map((h2) => h2.file),
      ...hookInstall.kind === "package" ? [] : [hookInstall.file],
      ...hookInstall.kind === "file" && hookInstall.trust ? [hookInstall.trust] : [],
      ...skillInstall.kind === "dir" ? skillInstall.files.map((f2) => f2.file) : []
    ];
    const out2 = {
      id,
      installMode: row.installMode,
      serverCommand: serverCmd(ctx, id),
      config,
      cli: cliFor(ctx, id),
      listCommand: LIST[id],
      hookFiles,
      hookInstall,
      skillInstall,
      hookRunCommand: hookCommand,
      allowedWrites: [...new Set(writes.map((f2) => path3.resolve(f2)))],
      goldenPayload: golden(row, ctx.home)
    };
    if (row.installMode !== "in-process") out2.hookCommand = hookCommand;
    const copy = copyFor(ctx, id);
    if (copy) out2.copy = copy;
    const native = NATIVE_PLUGIN[id];
    if (native) out2.nativePlugin = native;
    return out2;
  });
}
function assertWritable(row, file) {
  const abs = path3.resolve(file);
  if (INSTRUCTION_FILES.includes(path3.basename(abs)) || !row.allowedWrites.includes(abs)) {
    throw new Error(`setup: write to ${abs} is not allowed for ${row.id}`);
  }
}

// src/setup/codex-trust.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync5, realpathSync as realpathSync3 } from "node:fs";
import path5 from "node:path";

// src/setup/spawn-bin.ts
import { spawnSync } from "node:child_process";
import { accessSync, constants as fsc, statSync } from "node:fs";
import path4 from "node:path";

// src/core/sandbox/path-entries.ts
function pathEntries(value, platform = process.platform, delimiter = platform === "win32" ? ";" : ":") {
  const win = platform === "win32";
  return value.split(delimiter).map((e) => win && e.length >= 2 && e.startsWith('"') && e.endsWith('"') ? e.slice(1, -1) : e).filter(Boolean);
}

// src/setup/spawn-bin.ts
var WIN_EXT = ".COM;.EXE;.BAT;.CMD";
var WIN_SHIM_EXTS = Object.freeze([".cmd", ".bat"]);
var DEFAULT_COMSPEC = "cmd.exe";
function envGet(env, k) {
  return env[Object.keys(env).find((x2) => x2.toUpperCase() === k) ?? k];
}
function whichBin(bin, env, platform = process.platform) {
  const get = (k) => envGet(env, k);
  const win = platform === "win32";
  const exts = win ? (get("PATHEXT") || WIN_EXT).split(";").filter(Boolean) : [""];
  const names = win && path4.extname(bin) ? [bin] : exts.map((e) => bin + e.toLowerCase());
  for (const dir of pathEntries(get("PATH") ?? "", platform)) {
    for (const n3 of names) {
      const f2 = path4.join(dir, n3);
      try {
        accessSync(f2, fsc.X_OK);
        if (statSync(f2).isFile()) return f2;
      } catch {
      }
    }
  }
  return void 0;
}
var CMD_QUOTE_CHARS = '"&|<>^()!';
var CMD_PERCENT = "%";
var CMD_SUBSTRING_MARK = ":";
var CMD_DYNAMIC_VARS = Object.freeze(["CD", "DATE", "TIME", "RANDOM", "ERRORLEVEL", "CMDEXTVERSION", "CMDCMDLINE", "HIGHESTNUMANODENUMBER"]);
function needsCmdQuotes(a2) {
  if (a2 === "") return true;
  for (const c3 of a2) if (c3.trim() === "" || CMD_QUOTE_CHARS.includes(c3)) return true;
  return false;
}
function expandablePercent(text2, env) {
  const names = new Set(CMD_DYNAMIC_VARS);
  for (const k of Object.keys(env)) names.add(k.toUpperCase());
  for (let i2 = text2.indexOf(CMD_PERCENT); i2 >= 0; i2 = text2.indexOf(CMD_PERCENT, i2 + 1)) {
    for (let j2 = text2.indexOf(CMD_PERCENT, i2 + 1); j2 >= 0; j2 = text2.indexOf(CMD_PERCENT, j2 + 1)) {
      const inner = text2.slice(i2 + 1, j2);
      const cut = inner.indexOf(CMD_SUBSTRING_MARK);
      const name = cut < 0 ? inner : inner.slice(0, cut);
      if (name !== "" && names.has(name.toUpperCase())) return `${CMD_PERCENT}${inner}${CMD_PERCENT}`;
    }
  }
  return void 0;
}
function winCmdLine(file, args, env = {}) {
  for (const a2 of [file, ...args]) {
    const hit = expandablePercent(a2, env);
    if (hit !== void 0) throw new Error(`cannot run ${file} through cmd.exe: cmd.exe expands ${hit} inside quotes, so the value ${JSON.stringify(a2)} would change. Use a path and arguments without it`);
  }
  const q = (a2) => needsCmdQuotes(a2) ? `"${a2.split('"').join('""')}"` : a2;
  return `"${[file, ...args].map(q).join(" ")}"`;
}
function spawnForm(file, args, env, platform = process.platform) {
  if (platform === "win32" && WIN_SHIM_EXTS.includes(path4.extname(file).toLowerCase())) {
    return { command: envGet(env, "COMSPEC") || DEFAULT_COMSPEC, args: ["/d", "/v:off", "/s", "/c", winCmdLine(file, args, env)], windowsVerbatimArguments: true };
  }
  return { command: file, args, windowsVerbatimArguments: false };
}
function spawnShim(file, args, env, opts, platform = process.platform) {
  let f2;
  try {
    f2 = spawnForm(file, args, env, platform);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { pid: 0, output: [null, "", error.message], stdout: "", stderr: error.message, status: null, signal: null, error };
  }
  return spawnSync(f2.command, f2.args, { ...opts, env, windowsVerbatimArguments: f2.windowsVerbatimArguments, windowsHide: true });
}

// src/setup/codex-trust.ts
var isObj2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var TRUST_KEY = ["hooks", "state"];
var CODEX_TRUST_PATH = TRUST_KEY.join(".") + ".";
var HASH_FIELD = "trusted_hash";
var HASH_PREFIX = "sha256:";
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!isObj2(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}
function snake(name) {
  let out2 = "";
  for (const ch of name) {
    const upper = ch >= "A" && ch <= "Z";
    out2 += upper ? (out2 === "" ? "" : "_") + ch.toLowerCase() : ch;
  }
  return out2;
}
function realFile(file) {
  let dir = path5.resolve(file);
  const rest = [];
  while (!existsSync5(dir) && path5.dirname(dir) !== dir) {
    rest.unshift(path5.basename(dir));
    dir = path5.dirname(dir);
  }
  return path5.join(realpathSync3(dir), ...rest);
}
var ASK_TIMEOUT_MS = 1e4;
var ASK_TRIES = 3;
var WIN_VERBATIM_PREFIX = "\\\\?\\";
function codexHomeFromReply(out2) {
  for (const line of out2.split("\n")) {
    let m3;
    try {
      m3 = JSON.parse(line);
    } catch {
      continue;
    }
    if (isObj2(m3) && isObj2(m3.result) && typeof m3.result.codexHome === "string" && m3.result.codexHome !== "") return m3.result.codexHome;
  }
  return void 0;
}
function askCodexHome(env) {
  const bin = whichBin("codex", env);
  if (!bin) return void 0;
  const input = JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "context-mode-setup", version: "2.0.0" } } }) + "\n";
  for (let i2 = 0; i2 < ASK_TRIES; i2++) {
    const r2 = spawnShim(bin, ["app-server"], env, { input, encoding: "utf8", timeout: ASK_TIMEOUT_MS });
    const home = typeof r2.stdout === "string" ? codexHomeFromReply(r2.stdout) : void 0;
    if (home !== void 0) return home;
  }
  return void 0;
}
function sameDir(a2, b3, platform) {
  if (platform !== "win32") return path5.posix.normalize(a2) === path5.posix.normalize(b3);
  const norm = (p3) => {
    const bare = p3.startsWith(WIN_VERBATIM_PREFIX) ? p3.slice(WIN_VERBATIM_PREFIX.length) : p3;
    const n3 = path5.win32.normalize(bare).toLowerCase();
    return n3.length > 3 && n3.endsWith("\\") ? n3.slice(0, -1) : n3;
  };
  return norm(a2) === norm(b3);
}
function codexKeyDir(o2, platform = process.platform) {
  return o2.asked !== void 0 && sameDir(o2.dir, o2.asked, platform) ? o2.asked : o2.real(o2.dir);
}
function codexTrustEntries(hooksFile, doc, command, env) {
  const out2 = [];
  if (!isObj2(doc) || !isObj2(doc.hooks)) return out2;
  const abs = path5.resolve(hooksFile);
  const dir = codexKeyDir({ dir: path5.dirname(abs), asked: env ? askCodexHome(env) : void 0, real: env && !env.CODEX_HOME ? (p3) => path5.resolve(p3) : realFile });
  const real = (dir.startsWith(WIN_VERBATIM_PREFIX) ? path5.win32 : path5).join(dir, path5.basename(abs));
  for (const [event, groups] of Object.entries(doc.hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((g2, gi) => {
      if (!isObj2(g2) || !Array.isArray(g2.hooks)) return;
      g2.hooks.forEach((h2, hi) => {
        if (!isObj2(h2) || h2.command !== command) return;
        const id = { event_name: snake(event), hooks: [{ ...h2, async: false }] };
        if (g2.matcher !== void 0) id.matcher = g2.matcher;
        const hash = HASH_PREFIX + createHash("sha256").update(JSON.stringify(sortKeys(id))).digest("hex");
        out2.push([[...TRUST_KEY, `${real}:${snake(event)}:${gi}:${hi}`], { [HASH_FIELD]: hash }]);
      });
    });
  }
  return out2;
}

// src/setup/engine.ts
import { spawn, spawnSync as spawnSync2 } from "node:child_process";
import { closeSync, existsSync as existsSync6, mkdirSync as mkdirSync3, mkdtempSync, openSync, readFileSync as readFileSync4, readSync, readdirSync as readdirSync4, realpathSync as realpathSync4, rmSync, statSync as statSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import path6 from "node:path";

// src/setup/hook-sample.ts
var SAMPLE_FILE = "big.log";
var SAMPLE_COMMAND = "cat " + SAMPLE_FILE;
var SAMPLE_SESSION = "context-mode-doctor-hook-runs";
var SAMPLE_BYTES = OUTPUT_CAP * 4;
var REDIRECT = "ctx_execute";
var SEARCH_LINE = "ctx_search(";
var DENY_WORD = "deny";
var NO_PROJECT_LINE = "hooks: no project:";
var DENY_EXIT = 2;
var DENY_ON_STDERR = ["kiro"];
function sampleText() {
  const lines = [];
  let bytes = 0;
  for (let i2 = 0; bytes < SAMPLE_BYTES; i2++) {
    const l2 = "context-mode doctor sample line " + i2;
    lines.push(l2);
    bytes += l2.length + 1;
  }
  return lines.join("\n") + "\n";
}
function hookSample(id, cwd, text2) {
  const row = getAdapter(id);
  const effect = hasReplace(row) ? "replace" : "deny";
  const event = effect === "replace" ? row.eventMap.PostToolUse : row.eventMap.PreToolUse;
  const tool = row.nativeTools.shell[0];
  const command = { command: SAMPLE_COMMAND };
  switch (id) {
    case "claude-code":
      return { effect, payload: { hook_event_name: event, session_id: SAMPLE_SESSION, cwd, tool_name: tool, tool_input: command, tool_response: { stdout: text2, stderr: "" } } };
    case "gemini":
      return { effect, payload: { hook_event_name: event, session_id: SAMPLE_SESSION, cwd, tool_name: tool, tool_input: command, tool_response: { llmContent: text2 } } };
    case "copilot-cli":
      return { effect, payload: { sessionId: SAMPLE_SESSION, timestamp: Date.now(), cwd, toolName: tool, toolArgs: JSON.stringify(command), toolResult: { resultType: "success", textResultForLlm: text2 } } };
    case "pi":
      return { effect, payload: { type: event, sessionId: SAMPLE_SESSION, cwd, toolName: tool, input: command, content: text2, isError: false } };
    case "opencode":
      return { effect, payload: { type: event, sessionID: SAMPLE_SESSION, directory: cwd, tool, args: command } };
    case "codex":
    case "qwen":
    case "vscode":
    case "kiro":
    case "zcode":
      return { effect, payload: { hook_event_name: event, session_id: SAMPLE_SESSION, cwd, tool_name: tool, tool_input: command } };
  }
}
function sampleVerdict(id, effect, text2, a2) {
  const noProject = a2.stderr.split("\n").find((l2) => l2.startsWith(NO_PROJECT_LINE));
  if (noProject !== void 0) return "NO_PROJECT: the hook did not resolve the project (" + noProject.trim() + ")";
  if (a2.status === null) return "hook did not finish";
  if (a2.status !== 0 && a2.status !== DENY_EXIT) return `hook exited ${a2.status}: ${a2.stderr.trim()}`;
  if (effect === "replace") {
    if (a2.status === 0 && a2.stdout.includes(SEARCH_LINE) && Buffer.byteLength(a2.stdout) < Buffer.byteLength(text2)) return null;
  } else {
    const seen = DENY_ON_STDERR.includes(id) ? a2.stderr : a2.stdout;
    if (seen.includes(REDIRECT) && (a2.status === DENY_EXIT || a2.stdout.includes(DENY_WORD))) return null;
  }
  return `no saving decision for a large shell read (want ${effect}): exit ${a2.status}, answer ${JSON.stringify(a2.stdout.trim().slice(0, 200))}`;
}

// src/setup/engine.ts
var OVERHEAD_P95_MS = 15;
function overheadBudgetMs(env) {
  const n3 = Number(env.CM_HOOK_OVERHEAD_BUDGET_MS);
  return Number.isFinite(n3) && n3 >= OVERHEAD_P95_MS ? n3 : OVERHEAD_P95_MS;
}
var HOOK_SAMPLES = 9;
var HOOK_ROUNDS = 5;
var P95 = 0.95;
var VERIFY_TIMEOUT_MS = 1e4;
var MANIFEST = "manifest.json";
var MANIFEST_DONE = "manifest.removed.json";
var FILES = "files";
var V1_HOOK_MARK = "context-mode hook";
var which = whichBin;
var REAL_HOST = Object.freeze({
  claude: { pkg: "@anthropic-ai/claude-code", extra: [["claude.exe"], ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"]] }
});
var BINARY_MAGICS = Object.freeze(["cffaedfe", "cefaedfe", "7f454c46", "4d5a"]);
function isNativeBinary(file) {
  const head = Buffer.alloc(4);
  const fd = openSync(file, "r");
  try {
    readSync(fd, head, 0, 4, 0);
  } finally {
    closeSync(fd);
  }
  const hex = head.toString("hex");
  return BINARY_MAGICS.some((m3) => hex.startsWith(m3));
}
function owningPackage(dir) {
  for (let d = dir; ; d = path6.dirname(d)) {
    const f2 = path6.join(d, "package.json");
    if (existsSync6(f2)) {
      try {
        return String(JSON.parse(hostText(readFileSync4(f2, "utf8"))).name);
      } catch {
        return void 0;
      }
    }
    if (path6.dirname(d) === d) return void 0;
  }
}
function hostBin(bin, env, platform = process.platform) {
  const real = REAL_HOST[bin];
  if (!real) return { file: which(bin, env, platform), shims: [] };
  const get = (k) => env[Object.keys(env).find((x2) => x2.toUpperCase() === k) ?? k];
  const shims = [];
  for (const dir of pathEntries(get("PATH") ?? "", platform)) {
    const own2 = which(bin, { PATH: dir, ...get("PATHEXT") ? { PATHEXT: get("PATHEXT") } : {} }, platform);
    for (const f2 of [own2, ...real.extra.map((p3) => path6.join(dir, ...p3))]) {
      if (!f2 || !existsSync6(f2) || !statSync2(f2).isFile()) continue;
      const file = realpathSync4(f2);
      if (isNativeBinary(file) || owningPackage(path6.dirname(file)) === real.pkg) return { file, shims };
      shims.push(f2);
    }
  }
  return { file: void 0, shims };
}
var WIN_EXIT_CRASH = 3221226505;
function installExitOk(status, listed, platform = process.platform) {
  if (status === 0) return true;
  return platform === "win32" && status === WIN_EXIT_CRASH && listed;
}
function runBin(bin, args, env, input) {
  return spawnShim(hostBin(bin, env).file ?? bin, args, env, { encoding: "utf8", input, timeout: VERIFY_TIMEOUT_MS });
}
function readOr(file) {
  return existsSync6(file) ? hostText(readFileSync4(file, "utf8")) : void 0;
}
function readRaw(file) {
  return existsSync6(file) ? readFileSync4(file, "utf8") : void 0;
}
var atomicWrite = atomicWriteFile;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function p95(xs) {
  const s = [...xs].sort((a2, b3) => a2 - b3);
  return s[Math.min(s.length - 1, Math.ceil(s.length * P95) - 1)];
}
function parseFail(_row, file) {
  return `${file} does not parse; left as is. Fix the file, then re-run setup`;
}
var isObj3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function planHookFile(row, hf) {
  const before = readOr(hf.file);
  if (before === void 0) return void 0;
  let doc;
  try {
    doc = JSON.parse(before);
  } catch {
    throw new Error(parseFail(row, hf.file));
  }
  if (!isObj3(doc) || !isObj3(doc.hooks)) return void 0;
  const changes = [];
  const want = hookCommandString(row);
  for (const [event, groups] of Object.entries(doc.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (let g2 = groups.length - 1; g2 >= 0; g2--) {
      const group2 = groups[g2];
      if (isObj3(group2) && typeof group2.command === "string" && !Array.isArray(group2.hooks)) {
        if (!group2.command.includes(V1_HOOK_MARK)) continue;
        const at = `hooks.${event}[${g2}].command`;
        if (hf.mode === "rewrite") {
          changes.push({ file: hf.file, path: at, before: group2.command, after: want });
          group2.command = want;
        } else {
          changes.push({ file: hf.file, path: at, before: group2.command, after: null });
          groups.splice(g2, 1);
        }
        continue;
      }
      const list2 = isObj3(group2) ? group2.hooks : void 0;
      if (!Array.isArray(list2)) continue;
      for (let h2 = list2.length - 1; h2 >= 0; h2--) {
        const cmd = isObj3(list2[h2]) ? list2[h2].command : void 0;
        if (typeof cmd !== "string" || !cmd.includes(V1_HOOK_MARK)) continue;
        const at = `hooks.${event}[${g2}].hooks[${h2}].command`;
        if (hf.mode === "rewrite") {
          list2[h2].command = want;
          changes.push({ file: hf.file, path: at, before: cmd, after: want });
        } else {
          list2.splice(h2, 1);
          changes.push({ file: hf.file, path: at, before: cmd, after: null });
        }
      }
      if (list2.length === 0) groups.splice(g2, 1);
    }
  }
  return changes.length ? { file: hf.file, before, after: JSON.stringify(doc, null, 2) + "\n", changes } : void 0;
}
var MARK_LEFT = ["/", "\\", '"'];
function isOwnHookCommand(cmd, agent) {
  if (typeof cmd !== "string") return false;
  const at = cmd.lastIndexOf(HOOK_BUNDLE);
  if (at <= 0 || !MARK_LEFT.includes(cmd[at - 1])) return false;
  let tail = cmd.slice(at + HOOK_BUNDLE.length);
  if (tail.startsWith('"')) tail = tail.slice(1);
  return tail.trim() === `${AGENT_FLAG} ${agent}`;
}
var holdsOwn = (v, agent) => typeof v === "string" ? isOwnHookCommand(v, agent) : Array.isArray(v) ? v.some((x2) => holdsOwn(x2, agent)) : isObj3(v) ? Object.values(v).some((x2) => holdsOwn(x2, agent)) : false;
var same = (a2, b3) => JSON.stringify(a2) === JSON.stringify(b3);
function mergeOwn(cur, want, agent) {
  if (isObj3(want)) {
    const base = isObj3(cur) ? { ...cur } : {};
    for (const [k, v] of Object.entries(want)) base[k] = mergeOwn(base[k], v, agent);
    return base;
  }
  if (Array.isArray(want)) {
    const base = Array.isArray(cur) ? cur.filter((x2) => !holdsOwn(x2, agent) || want.some((w) => same(w, x2))) : [];
    for (const w of want) if (!base.some((x2) => same(x2, w))) base.push(w);
    return base;
  }
  return want;
}
var fileFormat = (row, file) => row.config?.file === file ? row.config.format : "json";
function planJsonKeys(row, edits, file, format, want) {
  const prior = edits.find((e) => e.file === file);
  const text2 = prior ? prior.after : readOr(file);
  let doc = {};
  if (text2 !== void 0 && text2.trim() !== "") {
    try {
      doc = parseHostConfig(row.id, file, text2, format);
    } catch {
      throw new Error(parseFail(row, file));
    }
  }
  if (!isObj3(doc)) throw new Error(parseFail(row, file));
  let res;
  try {
    res = editHostConfigText(row.id, file, text2 ?? "", format, want(doc));
  } catch (e) {
    if (e instanceof CtxError) throw new Error(parseFail(row, file));
    throw e;
  }
  if (!res.edits.length) return;
  const changes = res.edits.map((e) => ({ file, ...e }));
  if (prior) {
    prior.after = res.text;
    prior.changes.push(...changes);
  } else edits.push({ file, before: text2, after: res.text, changes });
}
function planCodexTrust(row, edits, hooksFile, file, command, env) {
  const hooksText = edits.find((e) => e.file === hooksFile)?.after ?? readOr(hooksFile);
  if (hooksText === void 0) return;
  const want = codexTrustEntries(hooksFile, JSON.parse(hooksText), command, env);
  if (!want.length) return;
  const prior = edits.find((e) => e.file === file);
  const text2 = prior ? prior.after : readOr(file);
  let res;
  try {
    res = editHostConfigText(row.id, file, text2 ?? "", "toml", want);
  } catch (e) {
    if (e instanceof CtxError) throw new Error(parseFail(row, file));
    throw e;
  }
  if (!res.edits.length) return;
  const changes = res.edits.map((e) => ({ file, ...e }));
  if (prior) {
    prior.after = res.text;
    prior.changes.push(...changes);
  } else edits.push({ file, before: text2, after: res.text, changes });
}
function planHookInstall(row, edits, env) {
  const h2 = row.hookInstall;
  if (h2.kind === "file") {
    planJsonKeys(row, edits, h2.file, fileFormat(row, h2.file), (doc) => Object.keys(h2.shape).map((k) => [[k], mergeOwn(doc[k], h2.shape[k], row.id)]));
    if (h2.trust) planCodexTrust(row, edits, h2.file, h2.trust, h2.command, env);
  } else if (h2.kind === "plugin-list") {
    planJsonKeys(row, edits, h2.file, fileFormat(row, h2.file), (doc) => {
      const cur = doc[h2.key[0]];
      const list2 = Array.isArray(cur) ? cur : [];
      return [[h2.key, list2.includes(h2.entry) ? list2 : [...list2, h2.entry]]];
    });
  }
}
function planSkills(row, edits) {
  const s = row.skillInstall;
  if (s.kind !== "dir") return;
  for (const f2 of s.files) {
    if (!existsSync6(f2.src)) throw new Error(`preflight: ${f2.src} is missing`);
    const after = renderSkill(readFileSync4(f2.src, "utf8"), s.prefixes);
    const before = readRaw(f2.file);
    if (before !== after) edits.push({ plain: true, file: f2.file, before, after, changes: [{ file: f2.file, path: f2.name, before: before === void 0 ? null : "old", after: "SKILL.md" }] });
  }
}
function planRow(row, listed, stale, env) {
  const edits = [];
  if (row.config) {
    const c3 = row.config;
    const before = readOr(c3.file);
    let res;
    try {
      res = editHostConfigText(row.id, c3.file, before ?? "", c3.format, configEdits(c3));
    } catch (e) {
      if (e instanceof CtxError) throw new Error(parseFail(row, c3.file));
      throw e;
    }
    if (res.edits.length) edits.push({ file: c3.file, before, after: res.text, changes: res.edits.map((e) => ({ file: c3.file, ...e })) });
  }
  for (const hf of row.hookFiles) {
    const e = planHookFile(row, hf);
    if (e) edits.push(e);
  }
  planHookInstall(row, edits, env);
  planSkills(row, edits);
  const cli = row.config || !row.cli || listed ? [] : row.cli.install;
  const refresh = listed && stale && row.copy ? [row.copy.refresh] : [];
  return { edits, cli, refresh };
}
function listCheck(row, env) {
  const l2 = row.listCommand;
  if (!l2 || !hostBin(l2.bin, env).file) return void 0;
  const r2 = runBin(l2.bin, l2.args, env);
  const ok = r2.status === 0 && `${r2.stdout}${r2.stderr}`.includes("context-mode");
  return { name: "list", ok, detail: ok ? void 0 : `${l2.bin} ${l2.args.join(" ")} does not list context-mode` };
}
function packageVersion(pkgDir) {
  try {
    const v = JSON.parse(hostText(readFileSync4(path6.join(pkgDir, "package.json"), "utf8"))).version;
    return typeof v === "string" ? v : void 0;
  } catch {
    return void 0;
  }
}
function copyCheck(row, pkgDir) {
  const c3 = row.copy;
  const pkg = packageVersion(pkgDir);
  const text2 = c3 ? readOr(c3.file) : void 0;
  if (!c3 || pkg === void 0 || text2 === void 0) return void 0;
  let entries;
  try {
    const doc = JSON.parse(text2);
    entries = isObj3(doc) && isObj3(doc.plugins) ? doc.plugins[c3.plugin] : void 0;
  } catch {
    return { name: "copy", ok: false, detail: `${c3.file} is not valid JSON; run ${c3.bin} ${c3.refresh.join(" ")}` };
  }
  if (!Array.isArray(entries)) return void 0;
  const versions = entries.filter(isObj3).map((e) => e.version).filter((v) => typeof v === "string");
  if (!versions.length) return void 0;
  const old = versions.find((v) => v !== pkg);
  if (old === void 0) return { name: "copy", ok: true };
  return { name: "copy", ok: false, detail: `${c3.host} runs context-mode ${old}, the installed package is ${pkg}; run ${c3.bin} ${c3.refresh.join(" ")}` };
}
function mcpCheck(cmd, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), { env, stdio: ["pipe", "pipe", "ignore"], detached: process.platform !== "win32", windowsHide: true });
    const reap = () => {
      child.kill();
    };
    process.once("exit", reap);
    let buf = "";
    let init = false;
    const done = (ok, detail) => {
      clearTimeout(timer);
      process.off("exit", reap);
      child.kill();
      resolve({ name: "mcp", ok, detail });
    };
    const timer = setTimeout(() => done(false, "no MCP answer before timeout"), VERIFY_TIMEOUT_MS);
    child.on("error", (e) => done(false, e.message));
    child.on("exit", (code) => done(false, `server exited (${code}) before tools/list`));
    child.stdin.on("error", (e) => done(false, `server closed its input: ${e.message}`));
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let m3;
        try {
          m3 = JSON.parse(line);
        } catch {
          continue;
        }
        if (m3.id === 1 && !init) {
          init = true;
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
        } else if (m3.id === 2) {
          const tools = isObj3(m3.result) && Array.isArray(m3.result.tools) ? m3.result.tools.map((t2) => t2.name) : [];
          const want = [...TOOL_ORDER].sort();
          const got = [...tools].sort();
          const ok = JSON.stringify(got) === JSON.stringify(want);
          done(ok, ok ? void 0 : `tools/list returned ${got.join(",")}, expected ${want.join(",")}`);
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "context-mode-setup", version: "2.0.0" }
    } }) + "\n");
  });
}
function hookRound(row, env) {
  const cmd = row.hookCommand;
  const input = JSON.stringify(row.goldenPayload);
  const wall = [];
  const bare = [];
  for (let i2 = 0; i2 < HOOK_SAMPLES; i2++) {
    let t2 = performance.now();
    const r2 = spawnSync2(cmd[0], cmd.slice(1), { env, input, encoding: "utf8", timeout: VERIFY_TIMEOUT_MS, windowsHide: true });
    wall.push(performance.now() - t2);
    if (r2.status !== 0) return { name: "hook", ok: false, detail: `hook exited ${r2.status}: ${`${r2.stderr}`.trim()}` };
    const out2 = `${r2.stdout}`.trim();
    if (out2) {
      let j2;
      try {
        j2 = JSON.parse(out2);
      } catch {
      }
      if (!isObj3(j2)) return { name: "hook", ok: false, detail: `hook answer is not a JSON object: ${out2.slice(0, 200)}` };
    }
    t2 = performance.now();
    spawnSync2(cmd[0], ["-e", ""], { env, timeout: VERIFY_TIMEOUT_MS, windowsHide: true });
    bare.push(performance.now() - t2);
  }
  const wallP95Ms = Math.round(p95(wall));
  const bareP95Ms = Math.round(p95(bare));
  const overheadP95Ms = Math.max(0, wallP95Ms - bareP95Ms);
  const budget = overheadBudgetMs(env);
  const ok = overheadP95Ms <= budget;
  return { name: "hook", ok, overheadP95Ms, wallP95Ms, bareP95Ms, detail: ok ? void 0 : `hook overhead p95 ${overheadP95Ms} ms > ${budget} ms` };
}
function hookCheck(row, env) {
  let best;
  for (let i2 = 0; i2 < HOOK_ROUNDS; i2++) {
    const c3 = hookRound(row, env);
    if (c3.overheadP95Ms === void 0) return c3;
    if (!best || c3.overheadP95Ms < best.overheadP95Ms) best = c3;
    if (c3.ok) break;
  }
  return best;
}
function parseCheck(row) {
  const c3 = row.config;
  if (!c3) return { name: "parse", ok: true };
  try {
    const r2 = editHostConfigText(row.id, c3.file, readOr(c3.file) ?? "", c3.format, configEdits(c3));
    return { name: "parse", ok: r2.edits.length === 0, detail: r2.edits.length ? "entry differs after write" : void 0 };
  } catch (e) {
    return { name: "parse", ok: false, detail: e.message };
  }
}
function hookRegisteredCheck(row, env, list2) {
  const h2 = row.hookInstall;
  if (h2.kind === "package") {
    const l2 = row.listCommand;
    if (!l2) return { name: "hook-registered", ok: false, detail: `no list command for ${row.id}` };
    if (!list2) return { name: "hook-registered", ok: false, detail: `${l2.bin} is not on PATH, so the hooks cannot be checked` };
    return { name: "hook-registered", ok: list2.ok, detail: list2.ok ? void 0 : `${l2.bin} ${l2.args.join(" ")} does not list context-mode (hooks ship in ${h2.via})` };
  }
  const edits = [];
  try {
    planHookInstall(row, edits, env);
  } catch (e) {
    return { name: "hook-registered", ok: false, detail: e.message };
  }
  if (!edits.length) return { name: "hook-registered", ok: true };
  const trust = h2.kind === "file" ? h2.trust : void 0;
  if (trust && edits.every((e) => e.file === trust && e.changes.every((c3) => isTrust(row, c3)))) return { name: "hook-registered", ok: false, detail: `${h2.file}: the context-mode hooks are not trusted in ${trust}; re-run setup` };
  return { name: "hook-registered", ok: false, detail: `${h2.file} lacks the context-mode hook entry` };
}
function hookRunsCheck(row, env) {
  const root = mkdtempSync(path6.join(tmpdir2(), "cm-doctor-runs-"));
  try {
    const home = path6.join(root, "home");
    const proj = path6.join(root, "proj");
    mkdirSync3(home);
    mkdirSync3(proj);
    const text2 = sampleText();
    writeFileSync2(path6.join(proj, SAMPLE_FILE), text2);
    const { effect, payload } = hookSample(row.id, proj, text2);
    const sampleEnv = { ...env, HOME: home, USERPROFILE: home };
    delete sampleEnv.CLAUDE_PROJECT_DIR;
    const cmd = row.hookRunCommand;
    const r2 = spawnSync2(cmd[0], cmd.slice(1), { env: sampleEnv, cwd: proj, input: JSON.stringify(payload), encoding: "utf8", timeout: VERIFY_TIMEOUT_MS, windowsHide: true });
    const bad = sampleVerdict(row.id, effect, text2, { status: r2.status, stdout: `${r2.stdout ?? ""}`, stderr: `${r2.stderr ?? ""}` });
    return bad === null ? { name: "hook-runs", ok: true } : { name: "hook-runs", ok: false, detail: bad };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
var SEEN_SQL = "SELECT 1 FROM events WHERE agent = ? LIMIT 1";
var NOT_SEEN_LINE = "not seen yet, run one tool call";
function hookSeenCheck(row, home) {
  const base = path6.join(home, STATE_DIR, PROJECTS_DIR_NAME);
  const dirs = existsSync6(base) ? readdirSync4(base) : [];
  let sqlite;
  try {
    sqlite = process.getBuiltinModule("node:sqlite");
  } catch {
    sqlite = void 0;
  }
  for (const d of dirs) {
    const file = path6.join(base, d, DB_FILE_NAME);
    if (!sqlite || !existsSync6(file)) continue;
    let db;
    try {
      db = new sqlite.DatabaseSync(file, { readOnly: true });
      if (db.prepare(SEEN_SQL).get(row.id)) return { name: "hook-seen", ok: true };
    } catch {
    } finally {
      db?.close();
    }
  }
  return { name: "hook-seen", ok: true, warn: true, detail: NOT_SEEN_LINE };
}
function skillsCheck(row, pkgDir) {
  const s = row.skillInstall;
  if (s.kind === "package") {
    const miss = COMMAND_SKILLS.map((n3) => path6.join(pkgDir, s.via, n3, SKILL_FILE)).filter((f2) => !existsSync6(f2));
    return { name: "skills", ok: miss.length === 0, detail: miss.length ? `missing ${miss.join(", ")}` : void 0 };
  }
  const bad = s.files.filter((f2) => readRaw(f2.file) !== (existsSync6(f2.src) ? renderSkill(readFileSync4(f2.src, "utf8"), s.prefixes) : void 0));
  return { name: "skills", ok: bad.length === 0, detail: bad.length ? `${bad.map((f2) => f2.file).join(", ")} missing or without the ${s.prefixes.join(" / ") || "plain"} tool prefix` : void 0 };
}
var PLUGIN_ENABLED = "enabled";
var WORD_TRIM = ",;";
var EXT_ENABLED_USER = "Enabled (User):";
var EXT_TRUE = "true";
function tableState(n3, text2) {
  const line = text2.split("\n").find((l2) => l2.split(" ").includes(n3.plugin));
  if (line === void 0) return void 0;
  return line.split(" ").map((w) => trimChars(w, WORD_TRIM)).includes(PLUGIN_ENABLED) ? "enabled" : "disabled";
}
function extensionState(n3, text2) {
  let mine = false;
  for (const raw of text2.split("\n")) {
    const line = raw.trimEnd();
    if (line.length && !line.startsWith(" ")) {
      mine = line.split(" ")[1] === n3.plugin;
      continue;
    }
    const t2 = line.trim();
    if (mine && t2.startsWith(EXT_ENABLED_USER)) return t2.slice(EXT_ENABLED_USER.length).trim() === EXT_TRUE ? "enabled" : "disabled";
  }
  return void 0;
}
function nativeState(row, env) {
  const n3 = row.nativePlugin;
  if (!n3 || !hostBin(n3.bin, env).file) return void 0;
  const r2 = runBin(n3.bin, n3.args, env);
  if (r2.status !== 0) return void 0;
  return n3.format === "extension" ? extensionState(n3, `${r2.stdout}${r2.stderr}`) : tableState(n3, `${r2.stdout}`);
}
function nativeRow(row, n3) {
  return {
    ...row,
    config: void 0,
    cli: void 0,
    copy: void 0,
    hookFiles: [],
    listCommand: { bin: n3.bin, args: n3.args },
    hookInstall: { kind: "package", via: n3.hooksVia },
    skillInstall: { kind: "package", via: n3.skillsVia }
  };
}
function trimChars(w, chars) {
  let a2 = 0;
  let b3 = w.length;
  while (a2 < b3 && chars.includes(w.charAt(a2))) a2++;
  while (b3 > a2 && chars.includes(w.charAt(b3 - 1))) b3--;
  return w.slice(a2, b3);
}
async function nativeResult(row, ctx) {
  const n3 = row.nativePlugin;
  const state = nativeState(row, ctx.env);
  if (!n3 || state === void 0) return void 0;
  const bin = hostBin(n3.bin, ctx.env).file;
  if (state === "disabled") {
    if (!n3.enable) return void 0;
    return {
      id: row.id,
      status: "FAIL",
      v1: [],
      changes: [],
      checks: [],
      bin,
      reason: `context-mode is installed but disabled in ${n3.bin}, run ${n3.bin} ${n3.enable.join(" ")}`
    };
  }
  const res = { id: row.id, status: "PASS", v1: [], changes: [], checks: await verifyRow(nativeRow(row, n3), ctx), bin };
  const bad = res.checks.filter((c3) => !c3.ok);
  if (bad.length) {
    res.status = "FAIL";
    res.reason = bad.map((c3) => `${c3.name}: ${c3.detail}`).join("; ");
  }
  return res;
}
async function verifyRow(row, ctx) {
  const env = ctx.env;
  const checks = [parseCheck(row)];
  const l2 = listCheck(row, env);
  if (l2) checks.push(l2);
  const cp = copyCheck(row, ctx.pkgDir);
  if (cp) checks.push(cp);
  checks.push(await mcpCheck(row.serverCommand, env));
  if (row.hookCommand) checks.push(hookCheck(row, env));
  checks.push(hookRegisteredCheck(row, env, l2), hookRunsCheck(row, env), hookSeenCheck(row, ctx.home), skillsCheck(row, ctx.pkgDir));
  return checks;
}
var Run = class {
  manifest;
  root;
  runId;
  constructor(root, runId) {
    this.root = root;
    this.runId = runId;
  }
  get dir() {
    return path6.join(this.root, BACKUP_DIR, this.runId);
  }
  save() {
    if (this.manifest) atomicWrite(path6.join(this.dir, MANIFEST), JSON.stringify(this.manifest, null, 2));
  }
  record(e, bytes) {
    if (!this.manifest) this.manifest = { runId: this.runId, path: this.dir, entries: [] };
    if (bytes !== void 0) {
      const rel = path6.join(FILES, String(this.manifest.entries.length));
      atomicWrite(path6.join(this.dir, rel), bytes);
      e.backup = rel;
    }
    this.manifest.entries.push(e);
    this.save();
  }
  rollback(agent, env) {
    if (!this.manifest) return;
    undo(this.dir, this.manifest.entries.filter((e) => e.agent === agent), env);
    this.manifest.entries = this.manifest.entries.filter((e) => e.agent !== agent);
    this.save();
  }
};
function undo(dir, entries, env) {
  for (const e of [...entries].reverse()) {
    if (e.undo) {
      runBin(e.undo.bin, e.undo.args, env);
      continue;
    }
    if (!e.file) continue;
    if (e.existed && e.backup) atomicWrite(e.file, readFileSync4(path6.join(dir, e.backup), "utf8"));
    else unlinkWithRetry(e.file);
  }
}
function takeLock(root, runId) {
  const file = path6.join(root, LOCK_FILE);
  mkdirSync3(root, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync2(file, JSON.stringify({ pid: process.pid, runId }), { flag: "wx" });
      return void 0;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let pid = 0;
      try {
        pid = Number(JSON.parse(readFileSync4(file, "utf8")).pid);
      } catch {
      }
      if (pid && pidAlive(pid)) return `setup lock ${file} is held by pid ${pid}; wait for that run or remove the lock`;
      rmSync(file, { force: true });
    }
  }
  return `setup lock ${file} could not be taken`;
}
function agentHomeDir(id, ctx) {
  if (id === "claude-code") return claudeDirOf(ctx.env, ctx.home);
  if (id === "copilot-cli") return copilotDirOf(ctx.env, ctx.home);
  if (id === "kiro") return kiroDirOf(ctx.env, ctx.home);
  if (id === "opencode") return opencodeDirOf(ctx.env, ctx.home);
  return path6.join(ctx.home, ...AGENT_HOME_DIR[id]);
}
function detectAgents(reg, ctx) {
  return reg.filter((r2) => existsSync6(agentHomeDir(r2.id, ctx)) || r2.listCommand && which(r2.listCommand.bin, ctx.env)).map((r2) => r2.id);
}
async function runSetup(opts) {
  const ctx = { home: opts.home, pkgDir: opts.pkgDir, env: opts.env };
  const runId = opts.runId ?? (/* @__PURE__ */ new Date()).toISOString().split(":").join("-").split(".").join("-");
  const reg = buildRegistry(ctx);
  for (const f2 of ["server.mjs", "hook.mjs"]) {
    if (!existsSync6(path6.join(ctx.pkgDir, f2))) return { exitCode: 1, agents: [], error: `preflight: ${path6.join(ctx.pkgDir, f2)} is missing` };
  }
  const ids = opts.agents ?? detectAgents(reg, ctx);
  const root = path6.join(ctx.home, STATE_DIR);
  if (!opts.dryRun) {
    const held = takeLock(root, runId);
    if (held) return { exitCode: 1, agents: [], error: held };
  }
  const run = new Run(root, runId);
  const agents = [];
  let current;
  const onAbort = () => {
    if (current !== void 0 && !opts.dryRun) run.rollback(current, ctx.env);
    if (!opts.dryRun) rmSync(path6.join(root, LOCK_FILE), { force: true });
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (const id of ids) {
      const row = reg.find((r2) => r2.id === id);
      if (!row) {
        agents.push({ id, status: "FAIL", reason: `unknown agent ${id}`, v1: [], changes: [], checks: [] });
        continue;
      }
      current = id;
      opts.onAgent?.(id, "start");
      const res = await nativeResult(row, ctx) ?? await setupRow(row, ctx, run, !!opts.dryRun);
      current = void 0;
      agents.push(res);
      opts.onAgent?.(id, "done", res);
    }
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    if (!opts.dryRun) rmSync(path6.join(root, LOCK_FILE), { force: true });
  }
  return { exitCode: agents.some((a2) => a2.status === "FAIL") ? 1 : 0, agents, backupDir: run.manifest ? run.dir : void 0 };
}
async function setupRow(row, ctx, run, dryRun) {
  const res = { id: row.id, status: "PASS", v1: [], changes: [], checks: [] };
  const needsBin = !row.config && row.cli;
  if (needsBin) {
    const hb = hostBin(row.cli.bin, ctx.env);
    if (!hb.file && hb.shims.length) return { ...res, status: "FAIL", reason: `no real ${row.cli.bin} binary on PATH; found only shim script(s): ${hb.shims.join(", ")}` };
    if (!hb.file) return { ...res, status: "SKIPPED", reason: `${row.cli.bin} not on PATH` };
    res.bin = hb.file;
  }
  if (!row.config && !row.cli) return { ...res, status: "SKIPPED", reason: `${row.id}: no setup path in the registry` };
  let plan;
  try {
    const listed = needsBin ? listCheck(row, ctx.env)?.ok === true : false;
    plan = planRow(row, listed, copyCheck(row, ctx.pkgDir)?.ok === false, ctx.env);
  } catch (e) {
    return { ...res, status: "FAIL", reason: e.message };
  }
  const configEdited = (file) => plan.edits.some((e) => e.file === file && e.changes.some((c3) => !isTrust(row, c3)));
  res.v1 = detectV1(row.id, ctx.home, { claudeDir: claudeDirOf(ctx.env, ctx.home), copilotDir: copilotDirOf(ctx.env, ctx.home), kiroDir: kiroDirOf(ctx.env, ctx.home), opencodeDir: opencodeDirOf(ctx.env, ctx.home) }).filter((f2) => !(row.config && f2.file === row.config.file && !configEdited(f2.file)));
  res.changes = [...plan.edits.flatMap((e) => e.changes), ...[...plan.cli, ...plan.refresh].map((args) => ({ command: [row.cli.bin, ...args] }))];
  if (dryRun) return res;
  try {
    for (const e of plan.edits) {
      assertWritable(row, e.file);
      const raw = readRaw(e.file);
      run.record({ agent: row.id, file: e.file, existed: raw !== void 0 }, raw);
      atomicWrite(e.file, e.plain || raw === void 0 ? e.after : withLayout(e.after, hostLayout(raw)));
    }
    for (const args of plan.cli) {
      const r2 = runBin(row.cli.bin, args, ctx.env, row.cli.input ?? "");
      if (!installExitOk(r2.status, r2.status === WIN_EXIT_CRASH && listCheck(row, ctx.env)?.ok === true)) throw new Error(`${row.cli.bin} ${args.join(" ")} exited ${r2.status}: ${`${r2.stderr}`.trim()}`);
    }
    if (plan.cli.length) for (const args of row.cli.remove) run.record({ agent: row.id, undo: { bin: row.cli.bin, args } });
    for (const args of plan.refresh) {
      const r2 = runBin(row.cli.bin, args, ctx.env);
      if (r2.status !== 0) throw new Error(`${row.cli.bin} ${args.join(" ")} exited ${r2.status}: ${`${r2.stderr}`.trim()}`);
      run.record({ agent: row.id, ran: { bin: row.cli.bin, args } });
    }
    res.checks = await verifyRow(row, ctx);
    const bad = res.checks.filter((c3) => !c3.ok);
    if (bad.length) throw new Error(bad.map((c3) => `${c3.name}: ${c3.detail}`).join("; "));
  } catch (e) {
    run.rollback(row.id, ctx.env);
    return { ...res, status: "FAIL", reason: e.message, rolledBack: true };
  }
  return res;
}
var V1_FORM_REASON = "old context-mode entry, run: context-mode setup";
var NOT_SET_UP_REASON = "not set up, run context-mode setup";
async function runDoctor(opts) {
  const ctx = { home: opts.home, pkgDir: opts.pkgDir, env: opts.env };
  const reg = buildRegistry(ctx);
  for (const f2 of ["server.mjs", "hook.mjs"]) {
    if (!existsSync6(path6.join(ctx.pkgDir, f2))) return { exitCode: 1, agents: [], error: `preflight: ${path6.join(ctx.pkgDir, f2)} is missing` };
  }
  const ids = opts.agents ?? detectAgents(reg, ctx);
  const run = new Run(path6.join(ctx.home, STATE_DIR), "doctor");
  const agents = [];
  for (const id of ids) {
    const row = reg.find((r2) => r2.id === id);
    if (!row) {
      agents.push({ id, status: "FAIL", reason: `unknown agent ${id}`, v1: [], changes: [], checks: [] });
      continue;
    }
    opts.onAgent?.(id, "start");
    const native = await nativeResult(row, ctx);
    if (native) {
      agents.push(native);
      opts.onAgent?.(id, "done", native);
      continue;
    }
    const res = await setupRow(row, ctx, run, true);
    if (res.status === "PASS") {
      if (res.v1.some((f2) => !UPGRADE_REPORT_ONLY_REASONS.includes(f2.reason))) {
        res.status = "FAIL";
        res.reason = V1_FORM_REASON;
      } else if (res.changes.length && !onlyTrust(row, res.changes)) {
        res.status = "FAIL";
        res.reason = NOT_SET_UP_REASON;
      } else {
        res.checks = await verifyRow(row, ctx);
        const bad = res.checks.filter((c3) => !c3.ok);
        if (bad.length) {
          res.status = "FAIL";
          res.reason = bad.map((c3) => `${c3.name}: ${c3.detail}`).join("; ");
        }
      }
    }
    agents.push(res);
    opts.onAgent?.(id, "done", res);
  }
  return { exitCode: agents.some((a2) => a2.status === "FAIL") ? 1 : 0, agents };
}
function onlyTrust(row, changes) {
  return changes.every((c3) => isTrust(row, c3) || isRefresh(row, c3));
}
function isRefresh(row, c3) {
  const r2 = row.copy;
  return r2 !== void 0 && c3.command !== void 0 && c3.command.join(" ") === [r2.bin, ...r2.refresh].join(" ");
}
function isTrust(row, c3) {
  const h2 = row.hookInstall;
  return h2.kind === "file" && h2.trust !== void 0 && c3.file === h2.trust && typeof c3.path === "string" && c3.path.startsWith(CODEX_TRUST_PATH);
}
function runRemove(opts) {
  const env = opts.env ?? process.env;
  const root = path6.join(opts.home, STATE_DIR);
  const base = path6.join(root, BACKUP_DIR);
  if (!existsSync6(base)) return { exitCode: 0, restored: 0 };
  const held = takeLock(root, "remove");
  if (held) return { exitCode: 1, restored: 0, error: held };
  let restored = 0;
  try {
    const runs = readdirSync4(base).map((r2) => path6.join(base, r2)).filter((d) => existsSync6(path6.join(d, MANIFEST))).sort().reverse();
    for (const dir of runs) {
      const m3 = JSON.parse(readFileSync4(path6.join(dir, MANIFEST), "utf8"));
      undo(dir, m3.entries, env);
      restored += m3.entries.length;
      renameWithRetry(path6.join(dir, MANIFEST), path6.join(dir, MANIFEST_DONE));
    }
  } finally {
    rmSync(path6.join(root, LOCK_FILE), { force: true });
  }
  return { exitCode: 0, restored };
}

// src/setup/print.ts
import { readFileSync as readFileSync5 } from "node:fs";
var SHELL_SAFE_PUNCT = "@%+=:,./-_";
function isShellSafe(s) {
  if (s === "") return false;
  for (const c3 of s) {
    const alnum = c3 >= "a" && c3 <= "z" || c3 >= "A" && c3 <= "Z" || c3 >= "0" && c3 <= "9";
    if (!alnum && !SHELL_SAFE_PUNCT.includes(c3)) return false;
  }
  return true;
}
function shellWord(s) {
  return isShellSafe(s) ? s : `'${s.replaceAll("'", `'"'"'`)}'`;
}
function printPlan(row, env) {
  const steps = [];
  const h2 = row.hookInstall;
  if (row.config) {
    const c3 = row.config;
    const trust = h2.kind === "file" && h2.trust === c3.file ? codexTrustEntries(h2.file, h2.shape, h2.command, env) : [];
    const block2 = editHostConfigText(row.id, c3.file, "", c3.format, [...configEdits(c3), ...trust]).text;
    steps.push({ kind: "config", file: c3.file, format: c3.format, key: c3.key, block: block2 });
  } else if (row.cli) {
    for (const args of row.cli.install) steps.push({ kind: "run", argv: [row.cli.bin, ...args], ...row.cli.input ? { input: row.cli.input } : {} });
  }
  if (h2.kind === "file") steps.push({ kind: "hook", file: h2.file, block: JSON.stringify(h2.shape, null, 2) + "\n" });
  else if (h2.kind === "plugin-list") steps.push({ kind: "hook", file: h2.file, block: JSON.stringify({ [h2.key[0]]: [h2.entry] }, null, 2) + "\n" });
  const sk = row.skillInstall;
  if (sk.kind === "dir") {
    for (const f2 of sk.files) steps.push({ kind: "skill", file: f2.file, block: renderSkill(readFileSync5(f2.src, "utf8"), sk.prefixes) });
  }
  return { agent: row.id, steps, verify: `context-mode doctor --agents ${row.id}` };
}
function extraText(p3) {
  let out2 = "";
  for (const s of p3.steps) {
    if (s.kind === "hook") out2 += `
Hooks: add the hook block from \`context-mode setup --print ${p3.agent} --json\` to ${s.file}
(keep your own entries).
`;
    if (s.kind === "skill") out2 += `
Skill: put this in ${s.file}:

${s.block}`;
  }
  return out2;
}
function printText(p3) {
  const tail = `${extraText(p3)}
Then restart the agent and check it: ${p3.verify}
`;
  const cfg = p3.steps.find((s) => s.kind === "config");
  if (cfg && cfg.kind === "config") {
    return `Manual setup for ${p3.agent}. Put this in ${cfg.file}
(If the folder or file is missing, create it. If the file exists, add the context-mode entry
and keep the rest. These paths are for this machine.)

${cfg.block}${tail}`;
  }
  const runs = p3.steps.filter((s) => s.kind === "run");
  if (!runs.length) return `${p3.agent} has no manual step. Run: context-mode setup --agents ${p3.agent}
`;
  const ask = runs.find((s) => s.input)?.input?.trim();
  const extra = ask ? `${runs[0].argv[0]} asks to confirm: answer ${ask}.
` : "";
  return `Manual setup for ${p3.agent}. Run:

${runs.map((s) => s.argv.map(shellWord).join(" ")).join("\n")}
${extra}${tail}`;
}

// src/cli/commands.ts
var EXIT_OK = 0;
var EXIT_FAIL = 1;
var EXIT_USAGE = 2;
var EXIT_SIGINT = 130;
var ISSUE_REPO = "mksglu/context-mode";
var REPORT_DIR = "reports";
var URL_BODY_MAX = 6e3;
var NO_TTY = "an answer is needed and there is no TTY (or --no-input is set). Run again with --yes to apply, or with --dry-run to only see the plan.";
var out = (s) => {
  process.stdout.write(s.endsWith("\n") ? s : s + "\n");
};
var err = (s) => {
  process.stderr.write(s.endsWith("\n") ? s : s + "\n");
};
function progress2(ui, s) {
  if (ui.f.quiet) return;
  if (ui.clack) ui.clack.log.step(s);
  else err(s);
}
var fixFor = (id) => `context-mode setup --agents ${id}`;
function passDetail(a2) {
  if (a2.status !== "PASS" || !a2.checks.length) return "";
  const warns = a2.checks.filter((c3) => c3.warn).map((c3) => `; WARN ${c3.name}: ${c3.detail}`).join("");
  return `checked: ${a2.checks.map((c3) => c3.name).join(", ")}${warns}`;
}
function table(agents) {
  const rows = agents.map((a2) => `${a2.id.padEnd(13)} ${a2.status.padEnd(7)} ${a2.reason ?? passDetail(a2)}${a2.bin ? `; bin: ${a2.bin}` : ""}${a2.rolledBack ? " (rolled back)" : ""}`.trimEnd());
  return [`${"AGENT".padEnd(13)} STATUS  DETAIL`, ...rows].join("\n");
}
function failLines(agents) {
  return agents.filter((a2) => a2.status === "FAIL").map((a2) => `FAIL ${a2.id}: ${a2.reason ?? "failed"}. Fix: ${fixFor(a2.id)}`);
}
function verboseLines(agents) {
  return agents.flatMap((a2) => a2.checks.map((c3) => `  ${a2.id} ${c3.warn ? "WARN" : c3.ok ? "ok  " : "FAIL"} ${c3.name}${c3.detail ? `: ${c3.detail}` : ""}`));
}
function planText(res) {
  const lines = [];
  for (const a2 of res.agents) {
    lines.push(`${a2.id}${a2.status === "PASS" ? "" : `  ${a2.status}: ${a2.reason ?? ""}`}`);
    if (a2.status === "PASS" && !a2.changes.length) lines.push("  no change needed");
    for (const c3 of a2.changes) {
      if (c3.command) lines.push(`  run  ${c3.command.join(" ")}`);
      else lines.push(`  edit ${c3.file ?? ""}${c3.path ? `  ${c3.path}` : ""}`);
    }
    for (const v of a2.v1) lines.push(`  old  ${v.file}${v.path ? `  ${v.path}` : ""}: ${v.reason}`);
  }
  return lines.length ? lines.join("\n") : "No agents found. Run context-mode setup --list.";
}
function spinner2(ui) {
  const live = !ui.f.quiet && !ui.f.json && !!process.stderr.isTTY;
  const frames = ["|", "/", "-", "\\"];
  let t2;
  let width = 0;
  return {
    start(msg) {
      if (!live) return;
      let i2 = 0;
      t2 = setInterval(() => {
        const line = `${frames[i2++ % frames.length]} ${msg}`;
        width = Math.max(width, line.length);
        process.stderr.write(`\r${line}`);
      }, 120);
    },
    stop() {
      if (t2) clearInterval(t2);
      if (t2 && width) process.stderr.write(`\r${" ".repeat(width)}\r`);
      t2 = void 0;
      width = 0;
    }
  };
}
function redact(text2, ctx) {
  let s = text2;
  for (const [from, to] of [[ctx.pkgDir, "<pkg>"], [ctx.home, "~"], [os.tmpdir(), "<tmp>"]]) {
    if (from && from.length > 1) s = s.split(from).join(to);
  }
  return s;
}
function fingerprint(command, agents, ctx) {
  const key = agents.filter((a2) => a2.status === "FAIL").map((a2) => `${a2.id}:${redact(a2.reason ?? "", ctx).replace(/[0-9]+/g, "N")}`).sort().join("\n");
  return createHash2("sha256").update(`${command}
${key}`).digest("hex").slice(0, 12);
}
function buildIssueReport(command, res, ui) {
  const fp = fingerprint(command, res.agents, ui.ctx);
  const failed = res.agents.filter((a2) => a2.status === "FAIL").map((a2) => a2.id);
  const title = `${command} FAIL: ${failed.join(", ") || "run"} (${fp})`;
  const lines = [
    `# context-mode ${command} report`,
    "",
    "<!-- For AI agents filing this issue: keep this report whole, add the exact command you ran and what you expected. -->",
    "",
    `fingerprint: ${fp}`,
    `version: ${ui.env.version}`,
    `node: ${process.version}`,
    `platform: ${process.platform}-${process.arch}`,
    `command: context-mode ${ui.env.argv.join(" ")}`,
    `tty: ${process.stdin.isTTY ? "yes" : "no"}`,
    ...res.error ? [`error: ${res.error}`] : [],
    "",
    "## Agents",
    "",
    "| Agent | Status | Detail |",
    "|---|---|---|",
    ...res.agents.map((a2) => `| ${a2.id} | ${a2.status}${a2.rolledBack ? " (rolled back)" : ""} | ${a2.reason ?? ""} |`),
    "",
    "## Checks",
    "",
    ...res.agents.flatMap((a2) => a2.checks.map((c3) => `- ${a2.id} ${c3.warn ? "WARN" : c3.ok ? "ok" : "FAIL"} ${c3.name}${c3.detail ? `: ${c3.detail}` : ""}`)),
    "",
    "## Old entries",
    "",
    ...res.agents.flatMap((a2) => a2.v1.map((v) => `- ${a2.id} ${v.file} ${v.path}: ${v.reason}`)),
    ""
  ];
  return { text: redact(lines.join("\n"), ui.ctx), title };
}
function ghReady(env) {
  const r2 = spawnSync3("gh", ["auth", "status"], { env, stdio: "ignore", timeout: 1e4, windowsHide: true });
  return r2.status === 0;
}
function issueUrl(title, body) {
  const b3 = body.length > URL_BODY_MAX ? body.slice(0, URL_BODY_MAX) + "\n(cut; attach the report file)" : body;
  return `https://github.com/${ISSUE_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(b3)}`;
}
async function report(ui, command, res, write) {
  const { text: text2, title } = buildIssueReport(command, res, ui);
  let file = "";
  if (write) {
    const dir = path7.join(ui.ctx.home, STATE_DIR, REPORT_DIR);
    mkdirSync4(dir, { recursive: true });
    file = path7.join(dir, `${command}-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync3(file, text2);
  }
  const gh = `gh issue create --repo ${ISSUE_REPO} --title ${JSON.stringify(title)} --body-file ${JSON.stringify(file || "<report>")}`;
  const p3 = ui.clack;
  if (!p3) {
    if (ui.f.debug) err(text2);
    if (file) err(`Debug report (redacted): ${file}`);
    err(`To report it: ${gh}`);
    return;
  }
  p3.note(text2, "Debug report (redacted)");
  const yes = await p3.confirm({ message: `Open an issue on github.com/${ISSUE_REPO} with this report?`, initialValue: false });
  if (p3.isCancel(yes) || !yes) {
    p3.log.info(`Not sent.${file ? ` Report: ${file}` : ""}`);
    return;
  }
  if (file && ghReady(ui.ctx.env)) {
    const r2 = spawnSync3("gh", ["issue", "create", "--repo", ISSUE_REPO, "--title", title, "--body-file", file], { env: ui.ctx.env, encoding: "utf8", timeout: 6e4, windowsHide: true });
    if (r2.status === 0) {
      p3.log.success(`Issue opened: ${`${r2.stdout}`.trim()}`);
      return;
    }
    p3.log.warn(`gh issue create failed: ${`${r2.stderr}`.trim()}`);
  }
  p3.log.info(`Open this URL to file the issue:
${issueUrl(title, text2)}`);
}
async function apply(ui, agents, dryRun) {
  const ac = new AbortController();
  const onSig = () => {
    ac.abort();
    err("\nStopped with Ctrl-C; the agent in progress was rolled back.");
    process.exit(EXIT_SIGINT);
  };
  if (!dryRun) process.on("SIGINT", onSig);
  const spin = spinner2(ui);
  try {
    return await runSetup({
      ...ui.ctx,
      agents,
      dryRun,
      signal: ac.signal,
      onAgent: (id, phase, r2) => {
        if (dryRun) return;
        if (phase === "start") {
          progress2(ui, `${id}: apply and verify ...`);
          spin.start(`${id}: verifying`);
          return;
        }
        spin.stop();
        const line = `${id}: ${r2?.status}${r2?.reason ? ` (${r2.reason})` : ""}`;
        if (ui.f.quiet) return;
        if (!ui.clack) err(line);
        else if (r2?.status === "FAIL") ui.clack.log.error(line);
        else if (r2?.status === "PASS") ui.clack.log.success(line);
        else ui.clack.log.warn(line);
      }
    });
  } finally {
    spin.stop();
    process.off("SIGINT", onSig);
  }
}
async function finish(ui, command, res, writeReport) {
  if (ui.f.json) out(JSON.stringify({ command, ...res }));
  else if (ui.clack) ui.clack.note(table(res.agents), "Summary");
  else out(table(res.agents));
  if (ui.f.verbose && !ui.f.json) for (const l2 of verboseLines(res.agents)) err(l2);
  if (res.error) err(`FAIL ${command}: ${res.error}. Fix: context-mode ${command}${command === "setup" ? " --repair" : ""}`);
  for (const l2 of failLines(res.agents)) err(l2);
  if (res.exitCode !== EXIT_OK) await report(ui, command, res, writeReport);
  return res.exitCode;
}
function list(ui) {
  const reg = buildRegistry(ui.ctx);
  const detected = new Set(detectAgents(reg, ui.ctx));
  const rows = ADAPTERS.map((a2) => ({
    id: a2.id,
    level: Object.keys(a2.eventMap).length ? "full" : "MCP only",
    installMode: a2.installMode,
    detected: detected.has(a2.id)
  }));
  if (ui.f.json) {
    out(JSON.stringify({ agents: rows }));
    return EXIT_OK;
  }
  out(`${"AGENT".padEnd(13)} ${"SUPPORT".padEnd(9)} ${"FOUND".padEnd(9)} INSTALL`);
  for (const r2 of rows) out(`${r2.id.padEnd(13)} ${r2.level.padEnd(9)} ${(r2.detected ? "detected" : "-").padEnd(9)} ${r2.installMode}`);
  return EXIT_OK;
}
async function remove(ui) {
  if (!ui.f.dryRun && !ui.f.yes) {
    if (!ui.clack) {
      err(`context-mode: ${NO_TTY}`);
      return EXIT_USAGE;
    }
    const ok = await ui.clack.confirm({ message: "Undo every setup run and put each touched file back?", initialValue: false });
    if (ui.clack.isCancel(ok)) {
      ui.clack.cancel("Cancelled; nothing changed.");
      return EXIT_SIGINT;
    }
    if (!ok) {
      ui.clack.outro("Nothing changed.");
      return EXIT_OK;
    }
  }
  if (ui.f.dryRun) {
    out(`Would restore every file recorded under ${path7.join(ui.ctx.home, STATE_DIR, "backups")}`);
    return EXIT_OK;
  }
  const r2 = runRemove({ home: ui.ctx.home, env: ui.ctx.env });
  if (ui.f.json) out(JSON.stringify(r2));
  else out(`Restored ${r2.restored} file(s).`);
  if (r2.error) err(`FAIL remove: ${r2.error}. Fix: context-mode setup --remove --yes`);
  return r2.exitCode;
}
function printManual(ui, id) {
  const row = buildRegistry(ui.ctx).find((r2) => r2.id === id);
  const p3 = printPlan(row, ui.ctx.env);
  if (ui.f.json) out(JSON.stringify({ command: "setup", print: p3 }));
  else out(printText(p3));
  return EXIT_OK;
}
async function setup(ui) {
  const { f: f2 } = ui;
  if (f2.print) return printManual(ui, f2.print);
  if (f2.list) return list(ui);
  if (f2.remove) return remove(ui);
  if (f2.dryRun) {
    const plan = await apply(ui, f2.agents, true);
    if (f2.json) out(JSON.stringify({ command: "setup", dryRun: true, ...plan }));
    else out(planText(plan));
    if (plan.error) err(`FAIL setup: ${plan.error}`);
    return plan.exitCode;
  }
  const p3 = ui.clack;
  if (!f2.yes && !p3) {
    const plan = await apply(ui, f2.agents, true);
    if (f2.json) out(JSON.stringify({ command: "setup", dryRun: true, ...plan }));
    else out(planText(plan));
    err(`context-mode: ${NO_TTY}`);
    return EXIT_USAGE;
  }
  let ids = f2.agents;
  if (p3) {
    p3.intro(`context-mode ${ui.env.version} setup`);
    if (!ids) {
      const detected = detectAgents(buildRegistry(ui.ctx), ui.ctx);
      const sel = await p3.multiselect({
        message: "Select agents to set up (space toggles, enter confirms)",
        options: ADAPTERS.map((a2) => ({ value: a2.id, label: a2.id, hint: detected.includes(a2.id) ? "detected" : "not found" })),
        initialValues: detected,
        required: true
      });
      if (p3.isCancel(sel)) {
        p3.cancel("Cancelled; nothing changed.");
        return EXIT_SIGINT;
      }
      ids = sel;
    }
    const plan = await apply(ui, ids, true);
    p3.note(planText(plan), "Plan");
    if (!f2.yes) {
      const ok = await p3.confirm({ message: "Apply this plan?" });
      if (p3.isCancel(ok)) {
        p3.cancel("Cancelled; nothing changed.");
        return EXIT_SIGINT;
      }
      if (!ok) {
        p3.outro("Nothing changed.");
        return EXIT_OK;
      }
    }
  }
  const res = await apply(ui, ids, false);
  const code = await finish(ui, "setup", res, true);
  p3?.outro(code === EXIT_OK ? "Done. Restart your agents to load context-mode." : "Some agents failed; each one was rolled back.");
  return code;
}
async function doctor(ui) {
  const spin = spinner2(ui);
  const res = await runDoctor({
    ...ui.ctx,
    agents: ui.f.agents,
    onAgent: (id, phase) => {
      if (phase === "start") {
        spin.stop();
        spin.start(`${id}: checking`);
      } else spin.stop();
    }
  });
  spin.stop();
  if (!res.agents.length && !res.error && !ui.f.json) {
    out("No agents found. Run context-mode setup --list.");
    return EXIT_OK;
  }
  const code = await finish({ ...ui, clack: void 0 }, "doctor", res, false);
  const p3 = ui.clack;
  if (!p3 || code === EXIT_OK) return code;
  let worst = code;
  for (const a2 of res.agents.filter((x2) => x2.status === "FAIL")) {
    const ok = await p3.confirm({ message: `Fix ${a2.id} now? (runs ${fixFor(a2.id)})`, initialValue: true });
    if (p3.isCancel(ok)) return EXIT_SIGINT;
    if (!ok) continue;
    const fixed = await apply(ui, [a2.id], false);
    worst = await finish(ui, "setup", fixed, true);
  }
  return worst;
}
function channelOf(version) {
  const dash = version.indexOf("-");
  if (dash < 0) return "latest";
  const pre = version.slice(dash + 1).split(".")[0];
  return pre === "" ? "latest" : pre;
}
async function upgrade(ui) {
  const { f: f2 } = ui;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const spec = `context-mode@${f2.tag ?? channelOf(ui.env.version)}`;
  const install = `npm i -g ${spec}`;
  const agentArgs = f2.agents ? ["--agents", f2.agents.join(",")] : [];
  const repairArgs = ["setup", "--repair", "--yes", ...agentArgs, ...f2.json ? ["--json"] : [], ...f2.quiet ? ["--quiet"] : []];
  if (f2.dryRun) {
    out(install);
    out(`context-mode ${repairArgs.join(" ")}`);
    return EXIT_OK;
  }
  if (!f2.yes) {
    const p3 = ui.clack;
    if (!p3) {
      err(`context-mode: ${NO_TTY}`);
      return EXIT_USAGE;
    }
    const ok = await p3.confirm({ message: `Run ${install}, then context-mode setup --repair?` });
    if (p3.isCancel(ok)) return EXIT_SIGINT;
    if (!ok) return EXIT_OK;
  }
  const shell = process.platform === "win32";
  progress2(ui, `running ${install}`);
  const r2 = spawnSync3(npm, ["i", "-g", spec], { env: ui.ctx.env, encoding: "utf8", shell, windowsHide: true });
  if (r2.status !== 0) {
    const why = (`${r2.stderr ?? ""}`.trim().split("\n").pop() ?? "") || (r2.error?.message ?? "");
    err(`FAIL upgrade: ${install} exited ${r2.status ?? "?"}${why ? `: ${why}` : ""}. Fix: ${install}`);
    return EXIT_FAIL;
  }
  const root = `${spawnSync3(npm, ["root", "-g"], { env: ui.ctx.env, encoding: "utf8", shell, windowsHide: true }).stdout ?? ""}`.trim();
  const cli = path7.join(root, "context-mode", "cli.mjs");
  if (!root || !existsSync7(cli)) {
    err(`FAIL upgrade: ${cli} not found after ${install}. Fix: ${install}`);
    return EXIT_FAIL;
  }
  progress2(ui, `running context-mode ${repairArgs.join(" ")}`);
  const c3 = spawnSync3(process.execPath, [cli, ...repairArgs], { env: ui.ctx.env, stdio: "inherit", windowsHide: true });
  return c3.status ?? (c3.signal === "SIGINT" ? EXIT_SIGINT : EXIT_FAIL);
}
async function runCommand(cmd, args, env) {
  let f2;
  try {
    f2 = parseFlags(cmd, args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`context-mode: ${e.message}
Run context-mode ${cmd} --help.`);
    return EXIT_USAGE;
  }
  if (f2.help) {
    out(HELP[cmd].trimEnd());
    return EXIT_OK;
  }
  const ctx = { home: homeDirOf(process.env) ?? os.homedir(), pkgDir: env.pkgDir, env: process.env };
  const tty = !!process.stdin.isTTY && !!process.stdout.isTTY;
  const interactive = tty && !f2.yes && !f2.noInput && !f2.json && !f2.list && !f2.print;
  if (interactive && !process.stdout.columns) Object.defineProperty(process.stdout, "columns", { value: 80, configurable: true });
  const ui = { f: f2, ctx, env, clack: interactive ? dist_exports : void 0 };
  try {
    if (cmd === "setup") return await setup(ui);
    if (cmd === "doctor") return await doctor(ui);
    return await upgrade(ui);
  } catch (e) {
    err(`FAIL ${cmd}: ${e.message}. Fix: context-mode ${cmd} --debug, then report it (gh issue create --repo ${ISSUE_REPO})`);
    if (f2.debug) err(e.stack ?? "");
    return EXIT_FAIL;
  }
}

// src/entries/is-entry.ts
import { realpathSync as realpathSync5 } from "node:fs";
function isEntry(main2, argv1, self) {
  if (main2 !== void 0) return main2;
  if (argv1 === void 0 || argv1 === "") return false;
  try {
    return realpathSync5(argv1) === realpathSync5(self);
  } catch {
    return false;
  }
}

// src/entries/cli.ts
var EXIT_OK2 = 0;
var EXIT_FAIL2 = 1;
var EXIT_USAGE2 = 2;
var EXIT_SIGINT2 = 130;
var SERVER_FILE = "server.mjs";
var HOOK_FILE = "hook.mjs";
var PACKAGE_FILE = "package.json";
var V1_PLATFORM_AGENT = Object.freeze({
  "claude-code": "claude-code",
  codex: "codex",
  "copilot-cli": "copilot-cli",
  "gemini-cli": "gemini",
  kiro: "kiro",
  "qwen-code": "qwen",
  "vscode-copilot": "vscode"
});
var HELP2 = HELP_MAIN;
function route(argv, version) {
  const [cmd, ...rest] = argv;
  if (cmd === "help" && rest[0] !== void 0) {
    if (COMMANDS.includes(rest[0])) return { kind: "cmd", cmd: rest[0], args: ["--help"] };
    if (!ALL_COMMANDS.includes(rest[0])) {
      return { kind: "exit", code: EXIT_USAGE2, stderr: `${SERVER_KEY}: no help for ${JSON.stringify(rest[0])}.${suggest(rest[0], ALL_COMMANDS)} Run context-mode --help.
` };
    }
  }
  if (cmd === void 0 || cmd === "-h" || cmd === "--help" || cmd === "help") return { kind: "exit", code: EXIT_OK2, stdout: HELP2 };
  if (cmd === "-v" || cmd === "--version") return { kind: "exit", code: EXIT_OK2, stdout: version + "\n" };
  if (cmd === "server" || cmd === "mcp") return { kind: "run", file: SERVER_FILE, args: rest };
  if (cmd === "hook") {
    if (rest.includes(AGENT_ARG)) return { kind: "run", file: HOOK_FILE, args: rest };
    const [platform = ""] = rest;
    const agent = Object.hasOwn(V1_PLATFORM_AGENT, platform) ? V1_PLATFORM_AGENT[platform] : void 0;
    if (agent === void 0) {
      return { kind: "exit", code: EXIT_OK2, stderr: `${SERVER_KEY}: unknown hook platform ${JSON.stringify(platform)}. Fix: run context-mode setup.
` };
    }
    return { kind: "run", file: HOOK_FILE, args: [AGENT_ARG, agent] };
  }
  if (COMMANDS.includes(cmd)) return { kind: "cmd", cmd, args: rest };
  return { kind: "exit", code: EXIT_USAGE2, stderr: `${SERVER_KEY}: unknown command ${JSON.stringify(cmd)}.${suggest(cmd, ALL_COMMANDS)} Run context-mode --help.
` };
}
function main() {
  const dir = path8.dirname(realpathSync6(fileURLToPath2(import.meta.url)));
  let version = "";
  try {
    version = String(JSON.parse(readFileSync6(path8.join(dir, PACKAGE_FILE), "utf8")).version);
  } catch (err2) {
    process.stderr.write(`${SERVER_KEY}: cannot read ${PACKAGE_FILE}: ${err2.message}
`);
    process.exitCode = EXIT_FAIL2;
    return;
  }
  const r2 = route(process.argv.slice(2), version);
  if (r2.kind === "cmd") {
    runCommand(r2.cmd, r2.args, { pkgDir: dir, version, argv: process.argv.slice(2) }).then((code) => {
      process.exitCode = code;
    }).catch((e) => {
      process.stderr.write(`${SERVER_KEY}: ${e.stack ?? e.message}
`);
      process.exitCode = EXIT_FAIL2;
    });
    return;
  }
  if (r2.kind === "exit") {
    if (r2.stdout !== void 0) process.stdout.write(r2.stdout);
    if (r2.stderr !== void 0) process.stderr.write(r2.stderr);
    process.exitCode = r2.code;
    return;
  }
  const child = spawn2(process.execPath, [path8.join(dir, r2.file), ...r2.args], { stdio: "inherit", windowsHide: true });
  process.on("SIGINT", () => {
  });
  child.on("error", (err2) => {
    process.stderr.write(`${SERVER_KEY}: ${err2.message}
`);
    process.exitCode = EXIT_FAIL2;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal === "SIGINT" ? EXIT_SIGINT2 : code ?? EXIT_FAIL2;
  });
}
if (isEntry(import.meta.main, process.argv[1], fileURLToPath2(import.meta.url))) main();
export {
  HELP2 as HELP,
  V1_PLATFORM_AGENT,
  route
};
