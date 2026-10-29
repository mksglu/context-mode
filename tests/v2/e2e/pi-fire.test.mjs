// D-NI-PI-GATE-1: the real `pi -p` (no login, no key) against a local fake OpenAI-compatible provider (models.json,
// api openai-completions). The fake answers with one bash call "cat big.log" (192 KB file), then a final text. The built
// context-mode package is installed with the host's own `pi install <dir>` into a temp HOME; the extension hook must
// replace the output and the model must see the redirect, not the file. Then the packages[] extensions filter that
// doctor reports (D-NI-PI-GATE-1) is switched on and the model must see the file again.
// Skipped when pi is not on PATH (CI installs the pi CLI where it can). Temp HOME only.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BUILD = resolve("build/build.mjs");
const hasPi = spawnSync("pi", ["--version"], { stdio: "ignore" }).status === 0;
const RUN_MS = 80000;

const chunk = (o) => `data: ${JSON.stringify(o)}\n\n`;
function provider(command, bodies) {
  let n = 0;
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      bodies.push(b);
      n++;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const base = { id: "c" + n, object: "chat.completion.chunk", created: 1, model: "fake" };
      if (n === 1) {
        res.write(chunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: JSON.stringify({ command }) } }] }, finish_reason: null }] }));
        res.write(chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }));
      } else {
        res.write(chunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "done" }, finish_reason: null }] }));
        res.write(chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
}

const run = (args, cwd, env) => new Promise((resolveRun) => {
  const c = spawn("pi", args, { cwd, env, stdio: "ignore" });
  const k = setTimeout(() => c.kill(), RUN_MS);
  c.on("close", () => { clearTimeout(k); resolveRun(); });
});

/** The tool message the model got for the bash call (text), or "" when pi never sent a second request. */
async function fire(t, { command = "cat big.log", filter } = {}) {
  const d = mkdtempSync(join(tmpdir(), "cm-pifire-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const home = join(d, "home");
  const agent = join(home, ".pi", "agent");
  const work = join(d, "work");
  const pkg = join(d, "pkg");
  mkdirSync(agent, { recursive: true });
  mkdirSync(work);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6000));
  const built = spawnSync(process.execPath, [BUILD, "--out", pkg], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const bodies = [];
  const srv = provider(command, bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { fake: { baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, api: "openai-completions", apiKey: "x", models: [{ id: "fake-model" }] } } }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
  const inst = spawnSync("pi", ["install", pkg], { cwd: work, env, encoding: "utf8", timeout: 60000 });
  assert.equal(inst.status, 0, `${inst.stdout}${inst.stderr}`);
  if (filter) {
    const file = join(agent, "settings.json");
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.packages = [{ source: doc.packages[0], extensions: filter }];
    writeFileSync(file, JSON.stringify(doc));
  }
  await run(["-p", "--model", "fake/fake-model", "--no-session", "show big.log"], work, env);
  if (bodies.length < 2) return "";
  const msgs = (JSON.parse(bodies[1]).messages ?? []).filter((m) => m.role === "tool");
  return msgs.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
}

const opts = { skip: !hasPi && "pi not on PATH", timeout: 150000 };

test("D-NI-PI-GATE-1: pi bash cat of a large log is replaced and the model sees the ctx_execute redirect", opts, async (t) => {
  const out = await fire(t);
  assert.match(out, /ctx_execute|ctx_search/, out.slice(0, 400));
  assert.ok(out.length < 4000, `the model got ${out.length} bytes, not the 192 KB file`);
});

test("D-NI-PI-GATE-1: pi bounded head of a large log is not replaced", opts, async (t) => {
  const out = await fire(t, { command: "head -n 3 big.log" });
  assert.ok(out.includes("lorem ipsum"), out.slice(0, 400));
  assert.doesNotMatch(out, /ctx_execute/, out.slice(0, 400));
});

test("D-NI-PI-GATE-1: a packages[] extensions filter without pi/index.js stops the hook (the gate doctor reports), the model gets the file", opts, async (t) => {
  const out = await fire(t, { filter: ["!pi/index.js"] });
  assert.ok(out.length > 20000, `${out.length}`);
  assert.doesNotMatch(out, /ctx_execute/, out.slice(0, 400));
});
