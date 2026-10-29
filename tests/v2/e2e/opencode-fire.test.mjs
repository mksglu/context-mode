// D-HF-OPENCODE-FIRE-1: the real `opencode run` (no login, no key) against a local fake OpenAI-compatible provider calls
// the bash tool with `cat big.log` (200 KB). Our built plugin (opencode/plugin.js, loaded from the config `plugin` list)
// must replace the output, so the model sees the ctx_execute redirect and not the file. A control run with a plugin
// entry whose file is missing proves the host skips it silently and the model sees the file (the gate setup/doctor guard).
// Skipped when opencode is not on PATH. Temp HOME and XDG dirs only; the plugin is built into a temp dir.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { openSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../..");
let hasOpencode = true;
try { execFileSync("opencode", ["--version"], { stdio: "ignore" }); } catch { hasOpencode = false; }

const chunk = (n, delta, fin) => `data: ${JSON.stringify({ id: "c" + n, object: "chat.completion.chunk", created: 1, model: "fake-model", choices: [{ index: 0, delta, finish_reason: fin ?? null }] })}\n\n`;
function provider(cmd, bodies) {
  let n = 0;
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      if (!req.url.includes("chat/completions")) { res.writeHead(404); res.end("{}"); return; }
      bodies.push(b);
      n++;
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (!b.includes('"role":"tool"')) {
        res.write(chunk(n, { role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: cmd, description: "show log" }) } }] }));
        res.write(chunk(n, {}, "tool_calls"));
      } else {
        res.write(chunk(n, { role: "assistant", content: "done" }));
        res.write(chunk(n, {}, "stop"));
      }
      res.write(`data: ${JSON.stringify({ id: "c" + n, object: "chat.completion.chunk", created: 1, model: "fake-model", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
}

let built;
function buildPlugin() {
  if (built) return built;
  const out = mkdtempSync(join(tmpdir(), "cm-ocfire-build-"));
  execFileSync(process.execPath, [join(REPO, "build/build.mjs"), "--generated-only"], { cwd: REPO, stdio: "ignore" });
  execFileSync(process.execPath, [join(REPO, "build/build.mjs"), "--out", out], { cwd: REPO, stdio: "ignore" });
  built = { out, plugin: join(out, "opencode", "plugin.js") };
  return built;
}

/** Runs opencode once; returns the content of the tool message the model got on its second request. */
async function run(cmd, pluginEntry) {
  const d = mkdtempSync(join(tmpdir(), "cm-ocfire-"));
  const work = join(d, "work");
  const home = join(d, "home");
  mkdirSync(work); mkdirSync(join(home, ".config", "opencode"), { recursive: true });
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6500));
  const bodies = [];
  const srv = provider(cmd, bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  writeFileSync(join(home, ".config", "opencode", "opencode.json"), JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    provider: { fake: { npm: "@ai-sdk/openai-compatible", name: "fake", options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "x" }, models: { "fake-model": { name: "fake-model", tool_call: true, limit: { context: 200000, output: 8000 } } } } },
    model: "fake/fake-model", autoupdate: false, plugin: [pluginEntry],
  }));
  const env = { ...process.env, PWD: work, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"), XDG_CACHE_HOME: join(home, ".cache"), XDG_STATE_HOME: join(home, ".local", "state"), OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_AUTOUPDATE: "1" };
  await new Promise((resolveRun) => {
    const c = spawn("opencode", ["run", "-m", "fake/fake-model", ...(process.env.CM_OC_DEBUG ? ["--print-logs", "--log-level", "INFO"] : []), "show the log"], { cwd: work, env, stdio: process.env.CM_OC_DEBUG ? ["ignore", openSync(process.env.CM_OC_DEBUG, "w"), 2] : "ignore" });
    const t = setTimeout(() => c.kill("SIGKILL"), 150000);
    c.on("close", () => { clearTimeout(t); resolveRun(); });
  });
  srv.close();
  rmSync(d, { recursive: true, force: true });
  // opencode also sends side requests (title); the one that carries the tool result is the one to read
  const tools = bodies.flatMap((b) => JSON.parse(b).messages.filter((m) => m.role === "tool"));
  const tool = tools.reduce((a, m) => (a === undefined || String(m.content).length >= String(a.content).length ? m : a), undefined);
  return tool ? String(tool.content) : "";
}

const opts = { skip: !hasOpencode && "opencode not on PATH", timeout: 400000 };
test("D-HF-OPENCODE-FIRE-1: opencode bash cat of a large log is replaced with the ctx_execute redirect", opts, async () => {
  const b = buildPlugin();
  assert.ok(existsSync(b.plugin), "plugin built");
  const out = await run("cat big.log", b.plugin);
  assert.ok(out.includes("ctx_execute"), out.slice(0, 400));
  assert.ok(out.length < 4000, "the model got " + out.length + " bytes, not the file");
});
test("D-HF-OPENCODE-FIRE-1: control, a plugin entry whose file is missing is skipped and the model sees the file", opts, async () => {
  const out = await run("cat big.log", join(tmpdir(), "cm-ocfire-gone", "opencode", "plugin.js"));
  assert.ok(!out.includes("ctx_execute"), out.slice(0, 200));
  assert.ok(out.length > 20000, "the model got " + out.length + " bytes");
});
test.after?.(() => { if (built) rmSync(built.out, { recursive: true, force: true }); });
