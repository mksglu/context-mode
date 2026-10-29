// tests/v2/e2e/claude-code-fire.test.mjs
// D-CC-HOOKS-RUN-1: the real `claude -p` (no login, fake Anthropic Messages endpoint through ANTHROPIC_BASE_URL) runs
// Bash "cat big.log" on a 200 KB file. The plugin is installed the documented way (`claude plugin marketplace add`
// then `claude plugin install`) into a temp HOME and CLAUDE_CONFIG_DIR. Our PreToolUse hook must replace the output:
// the model sees the ctx_execute redirect, not 200 KB. Skipped when claude is not on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { hostBin } from "../../../src/setup/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
// hostBin skips wrapper scripts (claude-worktree shim) and returns the real Claude Code file, as setup does.
const CLAUDE = hostBin("claude", process.env).file;
const has = CLAUDE !== undefined && spawnSync(CLAUDE, ["--version"], { stdio: "ignore" }).status === 0;
const LOG_BYTES = 200_000;
const PLUGIN = "context-mode@context-mode";

const ev = (type, o) => `event: ${type}\ndata: ${JSON.stringify({ type, ...o })}\n\n`;
/** Answers the main request with one Bash tool call, then with a final text. Keeps the tool_result text it was sent. */
function provider(seen) {
  let n = 0;
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      if (!req.url.includes("/v1/messages") || req.method !== "POST") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
      let j = {};
      try { j = JSON.parse(b); } catch { /* probe */ }
      const main = Array.isArray(j.tools) && j.tools.some((t) => t.name === "Bash");
      // Claude Code appends its own messages after the tool result, so look at every typed block, not the last message.
      const block = (j.messages ?? []).flatMap((m) => Array.isArray(m.content) ? m.content : []).find((x) => x.type === "tool_result");
      const done = block !== undefined;
      if (main && done && seen.length === 0) seen.push(block.content);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(ev("message_start", { message: { id: "msg_" + (++n), type: "message", role: "assistant", model: j.model ?? "m", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }));
      if (main && !done) {
        res.write(ev("content_block_start", { index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "Bash", input: {} } }));
        res.write(ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ command: "cat big.log", description: "show" }) } }));
        res.write(ev("content_block_stop", { index: 0 }));
        res.write(ev("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }));
      } else {
        res.write(ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }));
        res.write(ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "done" } }));
        res.write(ev("content_block_stop", { index: 0 }));
        res.write(ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }));
      }
      res.write(ev("message_stop", {}));
      res.end();
    });
  });
}

const text = (c) => typeof c === "string" ? c : JSON.stringify(c);

async function fire(t, { disableAllHooks = false } = {}) {
  const d = mkdtempSync(join(tmpdir(), "cm-ccfire-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const pkg = join(d, "pkg");
  const home = join(d, "home");
  const work = join(d, "work");
  for (const p of [home, work]) mkdirSync(p);
  const built = spawnSync(process.execPath, ["build/build.mjs", "--out", pkg], { cwd: REPO, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(Math.ceil(LOG_BYTES / 32)));
  const seen = [];
  const srv = provider(seen);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, ".claude"),
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${srv.address().port}`, ANTHROPIC_API_KEY: "sk-fake", DISABLE_TELEMETRY: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" };
  for (const args of [["plugin", "marketplace", "add", pkg], ["plugin", "install", PLUGIN]]) {
    const r = spawnSync(CLAUDE, args, { env, encoding: "utf8", timeout: 60000 });
    assert.equal(r.status, 0, `claude ${args.join(" ")}: ${r.stdout}${r.stderr}`);
  }
  if (disableAllHooks) writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ disableAllHooks: true }));
  await new Promise((done) => {
    const c = spawn(CLAUDE, ["-p", "show big.log", "--dangerously-skip-permissions", "--model", "claude-sonnet-5-5"], { cwd: work, env, stdio: "ignore" });
    const to = setTimeout(() => c.kill(), 90000);
    c.on("close", () => { clearTimeout(to); done(); });
  });
  return seen.length ? text(seen[0]) : "";
}

const opts = { skip: !has && "claude not on PATH", timeout: 240000 };
test("D-CC-HOOKS-RUN-1: claude -p Bash cat of a 200 KB log gets the ctx_execute redirect, not the file", opts, async (t) => {
  const out = await fire(t);
  assert.ok(out.length > 0, "the model got a tool_result");
  // Live 2.1.274: PostToolUse updatedToolOutput keeps the first line and names the search call that reads the rest.
  assert.ok(out.includes("ctx_search("), out);
  assert.ok(out.includes(`${LOG_BYTES} B`), out);
  assert.ok(Buffer.byteLength(out) < LOG_BYTES / 100, `tool_result is ${Buffer.byteLength(out)} bytes`);
});
test("D-CC-HOOKS-RUN-1: with disableAllHooks the same call gets no context-mode redirect (control: the gate is real)", opts, async (t) => {
  const out = await fire(t, { disableAllHooks: true });
  assert.ok(out.length > 0, "the model got a tool_result");
  assert.ok(!out.includes("ctx_search("), out); // Claude Code's own 2 KB preview of the 195 KB file, no pointer to us
  assert.match(out, /Output too large/);
});
