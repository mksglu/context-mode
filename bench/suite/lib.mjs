// bench/suite/lib.mjs: plumbing shared by bench/run.mjs and the group folders. Plain Node, no deps, no network, no model calls.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BENCH = path.resolve(HERE, "..");
export const REPO = path.resolve(BENCH, "..");
export const DATA = path.join(BENCH, "fixtures", "data");
export const bytes = (s) => Buffer.byteLength(s, "utf8");
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const read = (rel) => readFileSync(path.join(DATA, rel), "utf8");

/** Token estimate: bytes / 4. An estimate, not a tokenizer count (no tokenizer is vendored). */
export const tokens = (b) => Math.round(b / 4);

/** mean, sample sigma, min, max, median over the raw samples. */
export function stats(samples) {
  const n = samples.length;
  if (n === 0) return { n: 0, median: null, mean: null, sigma: null, min: null, max: null, samples: [] };
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sigma = n > 1 ? Math.sqrt(s.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const r = (x) => Math.round(x * 100) / 100;
  return { n, median: r(median), mean: r(mean), sigma: r(sigma), min: r(s[0]), max: r(s[n - 1]), samples: samples.map(r) };
}

/** mulberry32: fixed-seed PRNG for the synthetic inputs. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An isolated home + project (git init) holding a copy of bench/fixtures/data. */
export function sandbox() {
  const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-bench-")));
  const home = path.join(tmp, "home"), project = path.join(tmp, "project");
  mkdirSync(home); mkdirSync(project);
  cpSync(DATA, path.join(project, "data"), { recursive: true });
  spawnSync("git", ["init", "-q", project]);
  const env = {
    PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", PATHEXT: process.env.PATHEXT ?? "", ComSpec: process.env.ComSpec ?? "",
    HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_PROJECT_DIR: project, NO_COLOR: "1",
  };
  return { tmp, home, project, env, dispose: () => rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) };
}

/** Newline-delimited JSON-RPC client over the built server.mjs (MCP stdio). */
export function mcp(bundle, sb, agent = "claude-code") {
  const child = spawn(process.execPath, [path.join(bundle, "server.mjs"), "--agent", agent], { cwd: sb.project, env: sb.env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0, err = "";
  const pending = new Map();
  child.stderr.on("data", (d) => { err += d; });
  child.stdout.on("data", (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.trim() === "") continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  child.once("exit", (c) => { for (const r of pending.values()) r({ error: { message: "server exited " + c + ": " + err.slice(-400) } }); pending.clear(); });
  const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
  const client = {
    request: (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); send({ jsonrpc: "2.0", id: i, method, params }); }),
    notify: (method, params) => send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }),
    close: () => new Promise((resolve) => { child.once("exit", resolve); child.stdin.end(); setTimeout(() => child.kill(), 2000); }),
    /** tools/call; `session` goes in _meta.sessionId so the call joins the journal the hooks write to. */
    async call(name, args, session) {
      const t = performance.now();
      const m = await client.request("tools/call", { name, arguments: args, ...(session ? { _meta: { sessionId: session } } : {}) });
      const ms = performance.now() - t;
      if (m.error) return { error: m.error.message, ms };
      const text = (m.result.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
      return { text, isError: m.result.isError === true, ms };
    },
  };
  return client;
}

export async function startServer(bundle, sb, agent) {
  const c = mcp(bundle, sb, agent);
  const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "context-mode-bench", version: "0" } });
  if (init.error) throw new Error("initialize: " + init.error.message);
  c.notify("notifications/initialized");
  return c;
}

/** One hook process: node hook.mjs --agent <id>, the payload on stdin. */
export function runHook(bundle, sb, agent, payload) {
  const t = performance.now();
  const r = spawnSync(process.execPath, [path.join(bundle, "hook.mjs"), "--agent", agent], { cwd: sb.project, env: sb.env, input: JSON.stringify(payload), encoding: "utf8", timeout: 30000 });
  const ms = performance.now() - t;
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms };
}

let golden;
/** Claude Code PostToolUse Bash payload (golden shape e2e/fixtures/claude-code/2.1.303), the text as stdout. */
export function postToolUse(sb, text, { command = "cat data/x", session = "bench-session", n = 1 } = {}) {
  golden ??= JSON.parse(readFileSync(path.join(REPO, "e2e", "fixtures", "claude-code", "2.1.303", "PostToolUse-Bash-large.json"), "utf8"));
  return {
    ...golden, session_id: session, transcript_path: path.join(sb.project, "transcript.jsonl"), cwd: sb.project,
    tool_input: { command }, tool_response: { ...golden.tool_response, stdout: text }, tool_use_id: "toolu_bench_" + String(n).padStart(3, "0"),
  };
}

/** What the model sees after a Claude Code PostToolUse hook: the replaced output, or the raw stdout when the hook allows. */
export function seenAfterHook(text, r) {
  if (r.status !== 0) return { error: "hook exit " + r.status + ": " + r.stderr.slice(-300) };
  if (r.stdout.trim() === "") return { seen: text, replaced: false };
  const out = JSON.parse(r.stdout).hookSpecificOutput?.updatedToolOutput;
  return { seen: typeof out === "string" ? out : (out?.stdout ?? "") + (out?.stderr ?? ""), replaced: true };
}

export const fences = (t) => t.match(/```[\s\S]*?```/g) ?? [];
/** ctx_search prints 'Query "<q>":' then the hits; count queries that got at least one. */
export function queriesWithHits(text, queries) {
  if (text === undefined || text.startsWith("No hits")) return 0;
  const parts = text.split(/^Query ".*":$/m).slice(1);
  return Math.min(queries.length, parts.filter((p) => p.trim() !== "").length);
}

export const pct = (raw, x) => (x === null || x === undefined || !raw ? "n/a" : Math.round((1 - x / raw) * 100) + "%");
export const kb = (b) => (b === null || b === undefined ? "n/a" : (b / 1024).toFixed(1));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (stat, d = 0) => (stat && stat.median !== null ? stat.median.toFixed(d) : "n/a");
/** Format a stats object as "median [min-max]" (oxc style range, not one number). */
export const rng3 = (stat, d = 0) => (stat && stat.median !== null ? `${stat.median.toFixed(d)} [${stat.min.toFixed(d)}-${stat.max.toFixed(d)}]` : "n/a");
export const med = (stat, d = 0) => q(stat, d);

/** The ten host adapters: hook event, shell tool name, wire shape, effect (from e2e/checks/windows-hosts.mjs, src/adapters/table.ts). */
export const HOSTS = {
  "claude-code": { effect: "replace", event: "PostToolUse", tool: "Bash", shape: "claude" },
  codex: { effect: "deny", event: "PreToolUse", tool: "Bash", shape: "claude" },
  gemini: { effect: "replace", event: "AfterTool", tool: "run_shell_command", shape: "gemini" },
  qwen: { effect: "deny", event: "PreToolUse", tool: "run_shell_command", shape: "claude" },
  "copilot-cli": { effect: "replace", event: "postToolUse", tool: "bash", shape: "copilot" },
  vscode: { effect: "deny", event: "PreToolUse", tool: "run_in_terminal", shape: "claude" },
  kiro: { effect: "deny", event: "PreToolUse", tool: "execute_bash", shape: "claude", answerOn: "stderr" },
  zcode: { effect: "deny", event: "PreToolUse", tool: "Bash", shape: "claude" },
  pi: { effect: "replace", event: "tool_result", tool: "bash", shape: "pi" },
  opencode: { effect: "deny", event: "execute.before", tool: "bash", shape: "opencode" },
};

/** The shell-dump payload in each host wire shape (`text` is the command output a replace row sees). */
export function hostPayload(id, cwd, command, text) {
  const { event, tool, shape } = HOSTS[id];
  const session = "bench-host-" + id;
  const input = { command };
  switch (shape) {
    case "claude": return { hook_event_name: event, session_id: session, cwd, tool_name: tool, tool_input: input, tool_response: { stdout: text, stderr: "" } };
    case "gemini": return { hook_event_name: event, session_id: session, cwd, tool_name: tool, tool_input: input, tool_response: { llmContent: text } };
    case "copilot": return { sessionId: session, timestamp: Date.now(), cwd, toolName: tool, toolArgs: JSON.stringify(input), toolResult: { resultType: "success", textResultForLlm: text } };
    case "pi": return { type: event, sessionId: session, cwd, toolName: tool, input, content: text, isError: false };
    case "opencode": return { type: event, sessionID: session, directory: cwd, tool, args: input };
    default: throw new Error("unknown shape " + shape);
  }
}

// D-PATH-LABEL-1: a scenario whose own quality check failed (ok false, no error) is a quality miss: it is listed in the
// summary and its table row shows "miss" where a saving would stand, so a failed row never reads as a saving.
export const qualityMisses = (results) => results.filter((r) => !r.error && r.ok === false);
export const savedCell = (row, raw, x) => (row.ok === false ? "miss" : pct(raw, x));
// The source label ctx_index returned, from its reply line "Indexed N source(s), M chunk(s) from <label>." (no regex).
export function indexedLabel(text) {
  const line = String(text).split("\n")[0];
  const at = line.indexOf(" from ");
  if (at < 0) return null;
  const rest = line.slice(at + 6);
  // D-LABEL-HANDLE-1: one source -> "from s2. Label: <label>" (or ". Its label (...)"); the handle names it.
  for (const tail of [". Label: ", ". Its label ("]) {
    const cut = rest.indexOf(tail);
    if (cut >= 0) return rest.slice(0, cut);
  }
  return rest.endsWith(".") ? rest.slice(0, -1) : rest;
}
