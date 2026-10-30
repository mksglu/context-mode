// PRD-v2 section 10 (hooks never error). One file on purpose: the seeded hook fuzz is the long pole of the parallel run (ADR-0024).
// Moved from tests/v2/hooks/hook-fuzz.test.mjs. Test names and bodies unchanged.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after, describe } from "node:test";
import { ADAPTERS } from "../../src/adapters/table.ts";
import { HOOK_TIMEOUT_MS } from "../../src/core/contracts/constants.ts";
import { REGRESSIONS } from "./_lib/hook-fuzz-regressions.mjs";

describe("PRD-v2 section 10: seeded hook fuzz on every host", () => {
  // Property test for the built hook bundle (owner decision 2026-10-29: a hook never errors).
  // For each of the 10 hosts: seeded random payloads plus named regression cases are piped into release-out/hook.mjs
  // (a fresh child per case, temp HOME). Invariants per call:
  //   1. the process exits 0 (kiro, pi and opencode may exit 2 only for a deny that carries its reason text);
  //   2. stdout is empty or in the documented shape of that host (JSON object with the host's keys, or plain text
  //      on kiro, pi and opencode);
  //   3. a ctx_* tool of the host is never denied;
  //   4. the call ends inside HOOK_TIMEOUT_MS (the host timeout of the hook config).
  // CM_FUZZ_N sets the cases per host (default 500, the CI size). CM_FUZZ_SEED_EXTRA adds one more seed for a local run.
  // Seeds are fixed, so a red run reproduces: the failure text prints host, seed, index and the stdin bytes.
  // Serial on purpose: the shared before/after build one bundle and one temp root, COUNT and slow are shared, and each host test already runs a pool sized to the cores.
  const REPO = join(import.meta.dirname, "..", "..");
  const BUNDLE_DIR = join(REPO, "release-out");
  const SEEDS = [1, 7, 42, 1337, 2026, 9001, 31337, 65521];
  const N = Number(process.env.CM_FUZZ_N ?? 500);
  const SEED_LIST = process.env.CM_FUZZ_SEED_EXTRA ? [...SEEDS, Number(process.env.CM_FUZZ_SEED_EXTRA)] : SEEDS;
  const WIDTH = Math.max(2, Math.min(6, cpus().length - 1));
  const IS_WIN = process.platform === "win32";

  let root;
  let bundle;
  let repoDir;
  let spaceDir;
  let lockedDir;
  const slow = [];
  const COUNT = {}; // per host: calls, empty answers, non-empty answers, denies, exit 2

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-hook-fuzz-"));
    // The built bundle is the thing under test. Build into the temp root when release-out is missing or stale.
    bundle = join(BUNDLE_DIR, "hook.mjs");
    const out = join(root, "bundle");
    const r = spawnSync(process.execPath, [join(REPO, "build", "build.mjs"), "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    bundle = join(out, "hook.mjs");
    repoDir = join(root, "repo");
    mkdirSync(repoDir);
    spawnSync("git", ["init", "-q", repoDir]);
    spaceDir = join(root, "dir with spaces");
    mkdirSync(spaceDir);
    lockedDir = join(root, "locked");
    mkdirSync(lockedDir);
    if (!IS_WIN) chmodSync(lockedDir, 0o500);
  });

  after(() => {
    if (!IS_WIN && lockedDir !== undefined) chmodSync(lockedDir, 0o700);
    rmSync(root, { recursive: true, force: true });
    slow.sort((a, b) => b.ms - a.ms);
    console.log("hook-fuzz coverage: " + JSON.stringify(COUNT));
    console.log("hook-fuzz slowest: " + JSON.stringify(slow.slice(0, 5)));
  });

  // ---------- seeded RNG ----------

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (r, list) => list[Math.floor(r() * list.length)];
  const chance = (r, p) => r() < p;

  // ---------- host table ----------

  const PREFIX = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.toolNamePrefix]));
  const SHELL = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.nativeTools.shell ?? []]));
  const READ = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.nativeTools.read ?? []]));
  const HOSTS = ADAPTERS.map((a) => a.id);

  // Per host: the payload key set and the native event names.
  const SNAKE = { event: "hook_event_name", session: "session_id", tool: "tool_name", input: "tool_input", result: "tool_response", prompt: "prompt", cwd: "cwd" };
  const CAMEL = { event: "hookEventName", session: "sessionId", tool: "toolName", input: "toolArgs", result: "toolResult", prompt: "prompt", cwd: "cwd" };
  const CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"];
  const SPEC = {
    "claude-code": { keys: [SNAKE], events: CLAUDE_EVENTS },
    codex: { keys: [SNAKE], events: CLAUDE_EVENTS },
    qwen: { keys: [SNAKE], events: [...CLAUDE_EVENTS, "PostToolUseFailure"] },
    zcode: { keys: [SNAKE, { ...SNAKE, event: "hookEventName", session: "sessionId" }], events: [...CLAUDE_EVENTS, "PostToolUseFailure"] },
    gemini: { keys: [SNAKE], events: ["SessionStart", "BeforeAgent", "BeforeTool", "AfterTool", "PreCompress"] },
    "copilot-cli": { keys: [CAMEL, SNAKE], events: ["sessionStart", "userPromptSubmitted", "preToolUse", "postToolUse", "postToolUseFailure", ...CLAUDE_EVENTS, "PostToolUseFailure"] },
    vscode: { keys: [CAMEL, SNAKE], events: ["sessionStart", "userPromptSubmitted", "preToolUse", "postToolUse", "preCompact", ...CLAUDE_EVENTS, "PreCompact"] },
    kiro: { keys: [SNAKE], events: ["SessionStart", "agentSpawn", "UserPromptSubmit", "PromptSubmit", "userPromptSubmit", "PreToolUse", "preToolUse", "PostToolUse", "postToolUse"] },
    pi: { keys: [{ event: "type", session: "sessionId", tool: "toolName", input: "input", result: "content", prompt: "message", cwd: "cwd" }], events: ["session_start", "session_compact", "input", "tool_call", "tool_result"] },
    opencode: { keys: [{ event: "type", session: "sessionID", tool: "tool", input: "args", result: "output", prompt: "message", cwd: "directory" }], events: ["context", "prompt", "execute.before", "execute.after", "compaction", "step-finish"] },
  };
  const PRE_TOOL = new Set(["PreToolUse", "preToolUse", "BeforeTool", "tool_call", "execute.before"]);

  // Own ctx_* tool names on the wire of each host (what the host sends for this server's tools).
  function ownWire(host, tool) {
    if (host === "opencode") return "context-mode_" + tool;
    return PREFIX[host] + tool;
  }

  // ---------- value generators ----------

  const WORDS = ["alpha", "bravo", "src/index.ts", "README.md", "ctx_execute", "node_modules", "../..", "/etc", "~", "$HOME", "a b c", "ü", "日本語", "😀", "‮", "\u0000", "\ud800", "x".repeat(300)];
  const COMMANDS = [
    "ls", "ls -la", "cat README.md", "cat /etc/hosts | head", "git log", "git status", "curl https://example.com", "wget -qO- http://x.y", "npm test", "node -e 'console.log(1)'",
    "grep -r foo .", "find / -name '*.js'", "echo 'unterminated", "echo \"$(", "a | b | c | d ;; &&", "(((", "`", "\\", "sed -n '1,5p' file", "jq . x.json", "cat <<EOF\nbody\nEOF",
    "powershell -c Get-ChildItem", "", " ", "\n", "cat " + "a/".repeat(500), "ls " + "x ".repeat(2000),
  ];
  const URLS = ["https://example.com", "http://localhost:3000/x", "ftp://x", "not a url", "", "https://" + "a".repeat(5000) + ".com"];

  function str(r) {
    const k = Math.floor(r() * 9);
    if (k === 0) return "";
    if (k === 1) return pick(r, WORDS);
    if (k === 2) return pick(r, COMMANDS);
    if (k === 3) return pick(r, URLS);
    if (k === 4) return "a\u0000b" + pick(r, WORDS);
    if (k === 5) return String.fromCharCode(...Array.from({ length: 1 + Math.floor(r() * 12) }, () => Math.floor(r() * 0xd7ff)));
    if (k === 6) return "z".repeat(1000 + Math.floor(r() * 100000));
    if (k === 7) return pick(r, WORDS) + " " + pick(r, WORDS);
    return Math.floor(r() * 1e6).toString(36);
  }

  function deep(depth) {
    return "{\"a\":".repeat(depth) + "1" + "}".repeat(depth);
  }

  function value(r, level = 0) {
    const k = Math.floor(r() * 12);
    if (k === 0) return null;
    if (k === 1) return Math.floor(r() * 1000) - 500;
    if (k === 2) return r() < 0.5;
    if (k === 3) return level < 3 ? Array.from({ length: Math.floor(r() * 4) }, () => value(r, level + 1)) : [];
    if (k === 4) return level < 3 ? object(r, level + 1) : {};
    if (k === 5) return 1e308 * 10 > 0 ? 1.5e300 : 0;
    return str(r);
  }

  function object(r, level = 0) {
    const o = {};
    const n = Math.floor(r() * 5);
    for (let i = 0; i < n; i++) o[pick(r, ["command", "file_path", "url", "path", "content", "stdout", "stderr", "mode", "is_error", "x", "__proto__", "constructor", "toString", "hasOwnProperty", "persistedOutputPath", "persistedOutputSize", "type", "text"])] = value(r, level);
    return o;
  }

  // A tool input that can look real: command / file_path / url keys with generated values.
  function toolInput(r) {
    const k = Math.floor(r() * 8);
    if (k === 0) return {};
    if (k === 1) return { command: str(r) };
    if (k === 2) return { command: pick(r, COMMANDS) };
    if (k === 3) return { file_path: pick(r, ["README.md", "/etc/hosts", "/nonexistent/x", repoDir, "", "a\u0000b", "~/x", "../../.."]), offset: value(r), limit: value(r) };
    if (k === 4) return { url: pick(r, URLS) };
    if (k === 5) return { filePath: str(r), startLine: value(r), endLine: value(r), urls: value(r), path: str(r), view_range: value(r) };
    if (k === 6) return object(r);
    return { command: pick(r, COMMANDS), description: str(r) };
  }

  // toolArgs and kin: object, JSON string, invalid JSON, huge string, other.
  function args(r, host) {
    const base = toolInput(r);
    const k = Math.floor(r() * 7);
    if (k === 0) return base;
    if (k === 1) return JSON.stringify(base);
    if (k === 2) return JSON.stringify(base) + "{";
    if (k === 3) return "{\"command\":\"" + "q".repeat(200000 + Math.floor(r() * 200000));
    if (k === 4) return deep(1000);
    if (k === 5) return value(r);
    return host === "pi" || host === "opencode" ? base : JSON.stringify(JSON.stringify(base));
  }

  function toolName(r, host, pre) {
    const k = Math.floor(r() * 9);
    if (k === 0) return ownWire(host, pick(r, ["ctx_execute", "ctx_batch", "ctx_search", "ctx_doctor", "ctx_fetch_and_index", "ctx_stats", "ctx_x" + str(r)]));
    if (k === 1 && SHELL[host].length) return pick(r, SHELL[host]);
    if (k === 2 && READ[host].length) return pick(r, READ[host]);
    if (k === 3) return pick(r, ["Bash", "Read", "WebFetch", "Grep", "Edit", "Write", "bash", "shell", "execute_bash", "powershell", "run_in_terminal", "read_file", "web_fetch", "fetch_webpage", "view", "webfetch", "Skill", "TodoWrite", "AskUserQuestion", "fetch_copilot_cli_documentation"]);
    if (k === 4) return pick(r, ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]);
    if (k === 5) return "mcp__" + str(r) + "__" + str(r);
    if (k === 6) return "mcp_" + pick(r, ["a_b", "_", "a_", "_a", "x"]);
    if (k === 7) return str(r);
    return pre ? pick(r, ["Bash", "Read", "WebFetch"]) : "Bash";
  }

  function toolResult(r, host) {
    const k = Math.floor(r() * 10);
    if (k === 0) return undefined;
    if (k === 1) return str(r);
    if (k === 2) return { stdout: str(r), stderr: str(r), interrupted: value(r) };
    if (k === 3) return [{ type: "text", text: str(r) }, value(r)];
    if (k === 4) return { mode: "content", content: str(r), numLines: value(r) };
    if (k === 5) return { persistedOutputPath: pick(r, [repoDir, "/nonexistent/f", "", spaceDir, "a\u0000b", 5]), persistedOutputSize: pick(r, [1e9, -1, "x", 100, null]), stdout: "head" };
    if (k === 6) return { resultType: pick(r, ["success", "failure", "denied", 5]), textResultForLlm: str(r), result_type: pick(r, ["success", "error"]), text_result_for_llm: str(r) };
    if (k === 7) return { llmContent: value(r), returnDisplay: value(r), error: value(r) };
    if (k === 8) return JSON.parse(deep(500));
    return value(r);
  }

  function cwdValue(r, host) {
    const k = Math.floor(r() * 9);
    if (k === 0) return repoDir;
    if (k === 1) return spaceDir;
    if (k === 2) return lockedDir;
    if (k === 3) return join(root, "does", "not", "exist");
    if (k === 4) return "";
    if (k === 5) return 12;
    if (k === 6) return "relative/dir";
    if (k === 7) return "a\u0000b";
    return repoDir;
  }

  // ---------- payload builder ----------

  function build(r, host) {
    const spec = SPEC[host];
    const keys = pick(r, spec.keys);
    const event = chance(r, 0.04) ? str(r) : pick(r, spec.events);
    const pre = PRE_TOOL.has(event);
    const p = {};
    if (!chance(r, 0.03)) p[keys.event] = chance(r, 0.03) ? value(r) : event;
    if (!chance(r, 0.1)) p[keys.session] = chance(r, 0.15) ? value(r) : "s" + Math.floor(r() * 5);
    if (!chance(r, 0.15)) p[keys.cwd] = cwdValue(r, host);
    if (!chance(r, 0.08)) p[keys.tool] = chance(r, 0.05) ? value(r) : toolName(r, host, pre);
    if (!chance(r, 0.1)) p[keys.input] = host === "copilot-cli" || host === "vscode" ? args(r, host) : chance(r, 0.15) ? value(r) : toolInput(r);
    if (!chance(r, 0.3)) p[keys.result] = toolResult(r, host);
    if (!chance(r, 0.5)) p[keys.prompt] = chance(r, 0.15) ? value(r) : str(r);
    if (chance(r, 0.25)) p.source = pick(r, ["startup", "resume", "clear", "compact", "fork", "new", "other", 5, null]);
    if (chance(r, 0.1)) p.trigger = str(r);
    if (chance(r, 0.1)) p.error = value(r);
    if (chance(r, 0.1)) p.mcp_context = pick(r, [{ server_name: str(r), tool_name: str(r) }, null, "x", { server_name: 5 }]);
    if (chance(r, 0.1)) p.agent_id = pick(r, ["sub1", "", 5, null]);
    if (chance(r, 0.1)) p.agent_type = pick(r, ["general-purpose", "Explore", "", 5]);
    if (chance(r, 0.08)) p.tool_use_id = pick(r, ["tu1", "", 5]);
    if (chance(r, 0.1)) p.turn = pick(r, [0, 3, -1, 1.5, "x", null, 1e12]);
    if (chance(r, 0.1)) p.toolCallId = pick(r, ["c1", 5]);
    if (chance(r, 0.1)) p.isError = pick(r, [true, false, "yes", 1]);
    if (chance(r, 0.1)) p.exitCode = pick(r, [0, 1, "x", null]);
    if (chance(r, 0.1)) p.callID = pick(r, ["c1", 5]);
    if (chance(r, 0.15)) p[str(r) || "k"] = value(r); // an unknown extra field
    if (chance(r, 0.05)) p.extra = object(r);
    return p;
  }

  // stdin text for one case: usually the JSON of the payload, sometimes a broken form of it.
  // A well-formed call that the policy answers (deny or hint): the encode path of each host gets real input.
  function targeted(r, host) {
    const spec = SPEC[host];
    const keys = pick(r, spec.keys);
    const pre = spec.events.filter((e) => PRE_TOOL.has(e));
    const start = spec.events.filter((e) => e === "SessionStart" || e === "sessionStart" || e === "context" || e === "session_start" || e === "agentSpawn");
    const p = { [keys.session]: "s1", [keys.cwd]: repoDir };
    if (start.length && chance(r, 0.3)) {
      p[keys.event] = pick(r, start);
      p.source = pick(r, ["startup", "resume", "compact", "new"]);
      return p;
    }
    p[keys.event] = pick(r, pre);
    const kind = Math.floor(r() * 4);
    if (kind === 0 && SHELL[host].length) { p[keys.tool] = pick(r, SHELL[host]); p[keys.input] = { command: pick(r, ["curl https://example.com", "wget -qO- http://x.y", "cat /etc/hosts", "cat README.md", "find / -name '*.js'", "git log", "sed -n '1,5p' f"]) }; }
    else if (kind === 1) { p[keys.tool] = pick(r, ["WebFetch", "web_fetch", "fetch_webpage", "webfetch"]); p[keys.input] = { url: pick(r, URLS) }; }
    else if (kind === 2 && READ[host].length) { p[keys.tool] = pick(r, READ[host]); p[keys.input] = { file_path: pick(r, ["/etc/hosts", "README.md", repoDir]), filePath: "/etc/hosts" }; }
    else { p[keys.tool] = ownWire(host, pick(r, ["ctx_execute", "ctx_batch", "ctx_doctor", "ctx_search"])); p[keys.input] = { command: "curl x" }; }
    if (keys.input === "toolArgs" && chance(r, 0.5)) p[keys.input] = JSON.stringify(p[keys.input]);
    return p;
  }

  function stdinFor(r, host) {
    if (chance(r, 0.35)) return JSON.stringify(targeted(r, host));
    const k = Math.floor(r() * 40);
    if (k === 0) return "";
    if (k === 1) return "not json";
    if (k === 2) return "{";
    if (k === 3) return "null";
    if (k === 4) return "[]";
    if (k === 5) return "\"str\"";
    if (k === 6) return "12";
    if (k === 7) return "\u0000\u0000";
    if (k === 8) return deep(100000);
    if (k === 9) return deep(40);
    if (k === 10) return "{" + "\"k\":1,".repeat(50000) + "\"z\":1}";
    if (k === 11) return JSON.stringify(build(r, host)).slice(0, 20);
    if (k === 12) return "﻿" + JSON.stringify(build(r, host));
    if (k === 13) return JSON.stringify(build(r, host)) + "\n" + JSON.stringify(build(r, host));
    if (k === 14) return JSON.stringify(build(r, host)).replaceAll("\"", "'");
    if (k === 15) return "{\"" + "a".repeat(2_000_000) + "\":1}";
    return JSON.stringify(build(r, host));
  }

  // Env variants.
  function envFor(r, home) {
    const env = { PATH: process.env.PATH ?? "" };
    if (process.env.SystemRoot !== undefined) env.SystemRoot = process.env.SystemRoot; // Windows needs it to start a process
    const k = Math.floor(r() * 12);
    if (k === 0) return env; // HOME and USERPROFILE unset
    if (k === 1) return { ...env, HOME: "", USERPROFILE: "" };
    if (k === 2) return { ...env, HOME: join(lockedDir, "h"), USERPROFILE: join(lockedDir, "h") };
    if (k === 3) return { ...env, HOME: join(root, "repo", ".git", "HEAD"), USERPROFILE: join(root, "repo", ".git", "HEAD") }; // a file, not a dir
    const e = { ...env, HOME: home, USERPROFILE: home };
    if (k === 4) e.CLAUDE_PROJECT_DIR = join(root, "nope");
    if (k === 5) e.CLAUDE_PROJECT_DIR = repoDir;
    if (k === 6) e.USER_PROMPT = str(r).replaceAll("\u0000", "?"); // spawn refuses a null byte in an env value
    if (k === 7) e.CONTEXT_MODE_REQUIRE_SECURITY = "1";
    return e;
  }

  // ---------- runner ----------

  function runHook(host, stdin, env, cwd, argv = ["--agent", host]) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const child = spawn(process.execPath, [bundle, ...argv], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
      const out = [];
      const err = [];
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, HOOK_TIMEOUT_MS);
      child.stdout.on("data", (c) => out.push(c));
      child.stderr.on("data", (c) => err.push(c));
      child.stdin.on("error", () => {}); // the child may exit before it reads a huge stdin
      child.stdin.end(stdin);
      child.on("error", (e) => { clearTimeout(timer); resolve({ status: null, spawnError: String(e), ms: performance.now() - t0, stdout: "", stderr: "" }); });
      child.on("close", (status, signal) => {
        clearTimeout(timer);
        resolve({ status, signal, timedOut, ms: performance.now() - t0, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
      });
    });
  }

  const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

  // The documented stdout shape of each host. Returns a problem text, or "" when fine.
  function shapeProblem(host, stdout) {
    if (stdout === "") return "";
    if (host === "kiro" || host === "pi" || host === "opencode") return ""; // plain text hosts
    let j;
    try { j = JSON.parse(stdout); } catch { return "stdout is not JSON: " + stdout.slice(0, 120); }
    if (!isObj(j)) return "stdout JSON is not an object";
    const keys = Object.keys(j);
    if (host === "copilot-cli") {
      const ok = keys.every((k) => ["additionalContext", "permissionDecision", "permissionDecisionReason", "modifiedResult"].includes(k));
      return ok ? "" : "copilot-cli unknown output keys " + keys.join(",");
    }
    if (host === "gemini") {
      const ok = keys.every((k) => ["hookSpecificOutput", "decision", "reason"].includes(k));
      return ok ? "" : "gemini unknown output keys " + keys.join(",");
    }
    // claude-code, codex, qwen, zcode, vscode: {hookSpecificOutput:{hookEventName, ...}}
    if (!(keys.length === 1 && keys[0] === "hookSpecificOutput" && isObj(j.hookSpecificOutput) && typeof j.hookSpecificOutput.hookEventName === "string")) return host + " output is not {hookSpecificOutput:{hookEventName}}: " + stdout.slice(0, 120);
    return "";
  }

  function isDeny(host, res) {
    if (res.status === 2) return true;
    if (res.stdout === "") return false;
    if (host === "kiro" || host === "pi" || host === "opencode") return false;
    try {
      const j = JSON.parse(res.stdout);
      return j.decision === "deny" || j.permissionDecision === "deny" || j.hookSpecificOutput?.permissionDecision === "deny";
    } catch { return false; }
  }

  // A PreToolUse payload that names one of this host's own ctx_* tools (any casing of the key set).
  function namesOwnTool(host, stdin) {
    let p;
    try { p = JSON.parse(stdin); } catch { return false; }
    if (!isObj(p)) return false;
    const spec = SPEC[host];
    for (const keys of spec.keys) {
      const ev = p[keys.event];
      if (typeof ev !== "string" || !PRE_TOOL.has(ev)) continue;
      const name = p[keys.tool];
      if (typeof name !== "string") continue;
      const own = host === "opencode" ? "context-mode_ctx_" : PREFIX[host] + "ctx_";
      if (name.startsWith(own) && name.length > own.length) return true;
    }
    return false;
  }

  function problems(host, c, res) {
    const out = [];
    if (res.spawnError) out.push("spawn error " + res.spawnError);
    if (res.timedOut) out.push("timed out after " + HOOK_TIMEOUT_MS + " ms");
    else if (res.signal) out.push("killed by " + res.signal);
    const deny2 = res.status === 2 && (host === "kiro" || host === "pi" || host === "opencode") && (res.stdout !== "" || res.stderr !== "");
    if (res.status !== 0 && !deny2 && !res.timedOut && !res.signal) out.push("exit " + res.status);
    const shape = shapeProblem(host, res.stdout);
    if (shape !== "") out.push(shape);
    if (c.own && isDeny(host, res)) out.push("an own ctx_* tool was denied");
    if (res.ms >= HOOK_TIMEOUT_MS) out.push("call took " + Math.round(res.ms) + " ms");
    return out;
  }

  async function pool(items, fn) {
    let i = 0;
    const worker = async () => { for (;;) { const k = i++; if (k >= items.length) return; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: WIDTH }, worker));
  }

  function casesFor(host) {
    const cases = [];
    const per = Math.ceil(N / SEED_LIST.length);
    for (const seed of SEED_LIST) {
      const r = rng(seed * 100003 + HOSTS.indexOf(host));
      for (let i = 0; i < per && cases.length < N + (SEED_LIST.length - (N % SEED_LIST.length || SEED_LIST.length)); i++) {
        const stdin = stdinFor(r, host);
        cases.push({ name: `seed ${seed} #${i}`, stdin, envR: r(), own: namesOwnTool(host, stdin), cwdPick: Math.floor(r() * 3) });
      }
    }
    return cases.slice(0, Math.max(N, 1));
  }

  function spawnCwd(c) {
    return [repoDir, spaceDir, IS_WIN ? repoDir : lockedDir][c.cwdPick];
  }

  for (const host of HOSTS) {
    test(`hook-fuzz ${host}: ${N} seeded payloads plus the named regressions, every call exits 0 with a valid answer`, { timeout: 30 * 60 * 1000 }, async () => {
      const home = mkdtempSync(join(root, "home-"));
      const cases = casesFor(host);
      const bad = [];
      let ran = 0;
      await pool(cases, async (c) => {
        const env = envFor(rng(Math.floor(c.envR * 4294967296)), home);
        const res = await runHook(host, c.stdin, env, spawnCwd(c));
        ran++;
        const cn = (COUNT[host] ??= { calls: 0, empty: 0, answer: 0, deny: 0, exit2: 0 });
        cn.calls++;
        if (res.stdout === "") cn.empty++; else cn.answer++;
        if (isDeny(host, res)) cn.deny++;
        if (res.status === 2) cn.exit2++;
        slow.push({ host, name: c.name, ms: Math.round(res.ms) });
        if (slow.length > 400) { slow.sort((a, b) => b.ms - a.ms); slow.length = 50; }
        const pr = problems(host, c, res);
        if (pr.length > 0) bad.push({ name: c.name, problems: pr, stdin: c.stdin.length > 600 ? c.stdin.slice(0, 600) + `...(${c.stdin.length} chars)` : c.stdin, stderr: res.stderr.slice(0, 300) });
      });
      assert.equal(ran, cases.length);
      // The generator must reach the deny path; a fuzz that only sees empty answers proves nothing.
      if (N >= 200) assert.ok(COUNT[host].deny > 0 || host === "kiro" && COUNT[host].exit2 > 0, host + ": no deny seen in " + ran + " calls, the generator misses the policy");
      assert.equal(bad.length, 0, host + ": " + bad.length + " of " + cases.length + " calls broke an invariant. First 3: " + JSON.stringify(bad.slice(0, 3), null, 1));
    });
  }

  // Named regression cases: each was a crash the fuzz found. They run once per listed host with a fixed stdin.
  test("hook-fuzz regressions: every named crash case now exits 0 with a valid answer", async () => {
    const home = mkdtempSync(join(root, "home-reg-"));
    const bad = [];
    for (const c of REGRESSIONS) {
      for (const host of c.hosts === "all" ? HOSTS : c.hosts) {
        const stdin = typeof c.stdin === "function" ? c.stdin(host, { repoDir, spaceDir, lockedDir, root }) : c.stdin;
        const env = { PATH: process.env.PATH ?? "", ...(c.noHome ? {} : { HOME: home, USERPROFILE: home }) };
        if (process.env.SystemRoot !== undefined) env.SystemRoot = process.env.SystemRoot;
        const res = await runHook(host, stdin, env, repoDir);
        const pr = problems(host, { own: namesOwnTool(host, stdin) }, res);
        if (pr.length > 0) bad.push({ regression: c.name, host, problems: pr, stderr: res.stderr.slice(0, 300) });
      }
    }
    assert.equal(bad.length, 0, JSON.stringify(bad, null, 1));
  });

  test("hook-fuzz: the generator is deterministic (same seed, same bytes)", () => {
    const a = casesFor("claude-code").slice(0, 20).map((c) => c.stdin);
    const b = casesFor("claude-code").slice(0, 20).map((c) => c.stdin);
    assert.deepEqual(a, b);
    assert.ok(new Set(a).size > 5, "the cases vary");
    assert.ok(existsSync(join(REPO, "build", "build.mjs")));
  });


  // Owner decision 2026-10-29: on any internal failure the hook falls back to the policy table with no store access.
  // A call the policy denies when healthy must still be denied when the project cannot be resolved (cwd not a git dir,
  // cwd missing, cwd not a string, HOME unset). Fail-open here lets the raw output flood the context.
  const FLOODERS = [
    (keys, host) => ({ [keys.tool]: pick0(["WebFetch", "web_fetch", "fetch_webpage", "webfetch"]), [keys.input]: { url: "https://example.com" } }),
    (keys, host) => ({ [keys.tool]: SHELL[host][0] ?? "Bash", [keys.input]: { command: "curl https://example.com" } }),
    (keys, host) => ({ [keys.tool]: SHELL[host][0] ?? "Bash", [keys.input]: { command: "cat /etc/hosts" } }),
  ];
  const pick0 = (l) => l[0];

  function floodPayload(host, keys, variant, cwd) {
    const spec = SPEC[host];
    const pre = spec.events.find((e) => PRE_TOOL.has(e));
    const p = { [keys.event]: pre, [keys.session]: "s1", ...FLOODERS[variant](keys, host) };
    if (cwd !== undefined) p[keys.cwd] = cwd;
    if (host === "copilot-cli" || host === "vscode") p[keys.input] = JSON.stringify(p[keys.input]);
    return p;
  }

  for (const host of HOSTS) {
    test(`hook-fuzz ${host}: a flooding call that is denied when healthy is still denied when the project cannot be resolved`, async () => {
      const home = mkdtempSync(join(root, "home-fb-"));
      const keys = SPEC[host].keys[0];
      let found = -1;
      for (let v = 0; v < FLOODERS.length && found < 0; v++) {
        const res = await runHook(host, JSON.stringify(floodPayload(host, keys, v, repoDir)), { PATH: process.env.PATH, HOME: home, USERPROFILE: home }, repoDir);
        if (isDeny(host, res)) found = v;
      }
      if (found < 0) return; // this host has no flooding call its policy denies (the table decides, not this test)
      const broken = [
        ["cwd is not a git dir", join(root, "does", "not", "exist"), { HOME: home, USERPROFILE: home }],
        ["no cwd field", undefined, { HOME: home, USERPROFILE: home }],
        ["cwd empty", "", { HOME: home, USERPROFILE: home }],
        ["HOME and USERPROFILE unset", repoDir, {}],
      ];
      const bad = [];
      for (const [label, cwd, env] of broken) {
        const res = await runHook(host, JSON.stringify(floodPayload(host, keys, found, cwd)), { PATH: process.env.PATH, ...env }, spaceDir);
        if (!isDeny(host, res) || res.status !== (host === "kiro" || host === "pi" || host === "opencode" ? 2 : 0)) bad.push({ label, status: res.status, stdout: res.stdout.slice(0, 100), stderr: res.stderr.slice(0, 160) });
      }
      assert.equal(bad.length, 0, host + " fails open on an internal failure: " + JSON.stringify(bad, null, 1));
    });
  }

  void writeFileSync;
});
