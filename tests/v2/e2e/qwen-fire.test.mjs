// D-NI-QWEN-GATE-1: the real `qwen` (headless, no login) against a local fake OpenAI-compatible provider calls
// run_shell_command with a large-file cat. The built extension (release-out, linked with `qwen extensions link` in a temp HOME)
// must make the model see the ctx_execute redirect, not the 192 KB file. A second case proves the gate: with
// "disableAllHooks": true qwen runs no hook and the model sees the file. Skipped when qwen or release-out is absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG = resolve("release-out");
const hasQwen = spawnSync("qwen", ["--version"], { stdio: "ignore" }).status === 0;
const skip = !hasQwen ? "qwen not on PATH" : !existsSync(join(PKG, "hook.mjs")) ? "release-out not built (node build/build.mjs --out release-out)" : false;

function provider(cmd, bodies) {
  let n = 0;
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      bodies.push(b);
      n++;
      const first = n === 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta, finish) => res.write("data: " + JSON.stringify({ id: "c" + n, object: "chat.completion.chunk", created: 1, model: "fake", choices: [{ index: 0, delta, finish_reason: finish }] }) + "\n\n");
      if (first) chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "run_shell_command", arguments: JSON.stringify({ command: cmd, description: "show log", is_background: false }) } }] }, null);
      else chunk({ role: "assistant", content: "done" }, null);
      chunk({}, first ? "tool_calls" : "stop");
      res.write("data: " + JSON.stringify({ id: "c" + n, object: "chat.completion.chunk", created: 1, model: "fake", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + "\n\n");
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
}

function spawnDone(args, opts) {
  return new Promise((done) => {
    const c = spawn("qwen", args, opts);
    const t = setTimeout(() => c.kill(), 90000);
    c.on("close", () => { clearTimeout(t); done(); });
    if (opts.input !== undefined) c.stdin.end(opts.input);
  });
}

async function run(cmd, settings) {
  const d = mkdtempSync(join(tmpdir(), "cm-qwenfire-"));
  const work = join(d, "work");
  const home = join(d, "home");
  mkdirSync(work); mkdirSync(join(home, ".qwen"), { recursive: true });
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6000));
  if (settings) writeFileSync(join(home, ".qwen", "settings.json"), JSON.stringify(settings));
  const env = { ...process.env, HOME: home, USERPROFILE: home, OPENAI_API_KEY: "fake", NO_COLOR: "1", QWEN_CODE_SUPPRESS_YOLO_WARNING: "1" };
  delete env.QWEN_HOME;
  delete env.QWEN_CODE_SYSTEM_SETTINGS_PATH;
  const bodies = [];
  const srv = provider(cmd, bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  await spawnDone(["extensions", "link", PKG], { cwd: work, env, stdio: ["pipe", "ignore", "ignore"], input: "y\n" });
  await spawnDone(["--auth-type", "openai", "--openai-base-url", `http://127.0.0.1:${port}/v1`, "--openai-api-key", "fake", "-m", "fake", "--approval-mode", "yolo", "-o", "stream-json", "show"], { cwd: work, env, stdio: ["ignore", "ignore", "ignore"] });
  srv.close();
  rmSync(d, { recursive: true, force: true });
  if (bodies.length < 2) return "";
  const tool = JSON.parse(bodies[1]).messages.filter((m) => m.role === "tool").at(-1);
  return tool ? (typeof tool.content === "string" ? tool.content : JSON.stringify(tool.content)) : "";
}

const opts = { skip, timeout: 240000 };
test("D-NI-QWEN-GATE-1: qwen run_shell_command cat of a large log gets the ctx_execute redirect, not the file", opts, async () => {
  const out = await run("cat big.log");
  assert.ok(out.includes("ctx_execute"), out.slice(0, 400));
  assert.ok(out.length < 1000, `model saw ${out.length} bytes`);
});
test("D-NI-QWEN-GATE-1: qwen bounded head of a large log is not redirected", opts, async () => {
  const out = await run("head -n 3 big.log");
  assert.ok(!out.includes("ctx_execute"), out.slice(0, 400));
});
test("D-NI-QWEN-GATE-1: with disableAllHooks true qwen runs no hook (the gate doctor reports)", opts, async () => {
  const out = await run("cat big.log", { disableAllHooks: true });
  assert.ok(!out.includes("ctx_execute"), out.slice(0, 400));
  assert.ok(out.length > 1000, `model saw ${out.length} bytes`);
});
