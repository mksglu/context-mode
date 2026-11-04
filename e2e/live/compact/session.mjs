// T-CMP session driver (TECH-SPEC §6.9, ADR-0012, plan.md §2 E3).
// One keyless `claude -p` process with stream-json in and out. It sends the earlier turns one by one,
// waits for each turn's `result` event, sends `/compact` as a later user turn, then the next request.
// Returns the tool calls, the final text, the list-price cost and whether a compact boundary event came.
import { spawnGroup, killGroup } from "../lib/proc-group.mjs";
import { tmpdir } from "node:os";

const MODEL = "claude-sonnet-5";
const EFFORT = "low";
const ENV_KEYS = ["PATH", "HOME", "USER", "TMPDIR"];
const TURN_TIMEOUT_MS = 300000;

// env -i PATH HOME USER TMPDIR: no ANTHROPIC_*, no CLAUDE_CONFIG_DIR; the login stays in the Keychain.
function childEnv() {
  const env = {};
  for (const k of ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k];
  // DEVIATIONS D-M7-CI-1: Linux and Windows runners do not set TMPDIR; the child always gets one.
  if (env.TMPDIR === undefined) env.TMPDIR = tmpdir();
  // DEVIATIONS D-M7-CL-3: same isolation as e2e/live/run.mjs and harness/live/claude-code.mjs. Without it
  // the host auto-memory, claude.ai MCP servers and the home CLAUDE.md leak into every arm.
  Object.assign(env, { ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
  return env;
}

function userLine(text) {
  return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n";
}

// Bytes of hookSpecificOutput.additionalContext (or a top-level additionalContext) in one hook's stdout JSON; 0 if none.
export function additionalContextBytes(raw) {
  let j;
  try { j = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return 0; }
  const c = j?.hookSpecificOutput?.additionalContext ?? j?.additionalContext;
  return typeof c === "string" ? Buffer.byteLength(c) : 0;
}

/**
 * @param {{ bin: string, turns: string[], nextRequest: string, budgetUsd: string, cwd: string,
 *   model?: string, effort?: string, args?: string[] }} o
 *   `args`: extra argv for the case (tools, MCP config); default `--strict-mcp-config --tools ""`.
 * @returns {Promise<{ toolCalls: {turn: number, id: string, name: string, input: unknown}[], toolResults: {turn: number, id: string, isError: boolean, bytes: number, text: string}[], finalText: string,
 *   costUsd: number, compacted: boolean, isError: boolean, exitCode: number|null, stderr: string }>}
 */
export function runSession(o) {
  const args = o.args ?? ["--strict-mcp-config", "--tools", ""];
  const argv = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-hook-events",
    "--model", o.model ?? MODEL, "--effort", o.effort ?? EFFORT, "--max-budget-usd", String(o.budgetUsd),
    "--no-session-persistence", "--setting-sources", "project", ...args];
  const sends = [...o.turns, "/compact", o.nextRequest];
  const child = spawnGroup(o.bin, argv, { cwd: o.cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const out = { toolCalls: [], toolResults: [], hookContexts: [], finalText: "", costUsd: 0, compacted: false, isError: false, exitCode: null, stderr: "" };
  let turn = 0;
  let timer = null;

  const sendNext = () => {
    clearTimeout(timer);
    if (turn >= sends.length) { child.stdin.end(); return; }
    child.stdin.write(userLine(sends[turn]));
    timer = setTimeout(() => { out.isError = true; killGroup(child); }, TURN_TIMEOUT_MS);
  };

  const onEvent = (ev) => {
    if (ev.type === "system" && ev.subtype === "compact_boundary") out.compacted = true;
    if (ev.type === "system" && ev.subtype === "hook_response") {
      // Hook additionalContext bytes (the injected side of the T-CMP measure), read from the hook's JSON output.
      const bytes = additionalContextBytes(ev.stdout ?? ev.output);
      if (bytes > 0) out.hookContexts.push({ turn, event: String(ev.hook_event ?? ""), bytes });
    }
    if (ev.type === "assistant") {
      for (const c of ev.message?.content ?? []) {
        if (c.type === "tool_use") out.toolCalls.push({ turn, id: c.id, name: c.name, input: c.input });
      }
    }
    if (ev.type === "user") {
      // Bytes the model got back from each tool call: the returned side of the T-CMP measure.
      for (const c of ev.message?.content ?? []) {
        if (c.type !== "tool_result") continue;
        const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((x) => x.text ?? "").join("");
        out.toolResults.push({ turn, id: c.tool_use_id, isError: c.is_error === true, bytes: Buffer.byteLength(text), text });
      }
    }
    if (ev.type === "result") {
      out.costUsd = Math.max(out.costUsd, Number(ev.total_cost_usd ?? 0));
      out.isError = out.isError || ev.is_error === true;
      out.finalText = String(ev.result ?? "");
      turn += 1;
      sendNext();
    }
  };

  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim() === "") continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      onEvent(ev);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { out.stderr += d; });
  child.stdin.on("error", () => {});

  return new Promise((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      out.exitCode = code;
      if (turn < sends.length) out.isError = true;
      resolve(out);
    });
    sendNext();
  });
}
