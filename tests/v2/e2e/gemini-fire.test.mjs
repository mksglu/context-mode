// D-NI-GEMINI-GATE-1: the real `gemini -p` (no login, no key) against a local fake Gemini API. The fake answers with one
// run_shell_command call "cat big.log" (208 KB file), then a final text. The built context-mode extension is linked into a
// temp HOME with the host's own `gemini extensions link`; the hook must block the call and the model must see the redirect,
// not the file. Then each gate that stops hooks (D-NI-GEMINI-GATE-1) is switched on and the model must see the file again.
// Skipped when gemini is not on PATH (CI installs @google/gemini-cli where it can). Temp HOME only.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BUILD = resolve("build/build.mjs");
const hasGemini = spawnSync("gemini", ["--version"], { stdio: "ignore" }).status === 0;
const RUN_MS = 100000;

function provider(command, bodies) {
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      bodies.push({ url: req.url, body: b });
      const stream = req.url.includes("streamGenerateContent");
      if (!stream && !req.url.includes(":generateContent")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ totalTokens: 1 })); return; }
      let answered = false;
      try { answered = (JSON.parse(b).contents ?? []).some((c) => (c.parts ?? []).some((p) => p.functionResponse)); } catch { /* not JSON */ }
      const parts = !answered && stream
        ? [{ functionCall: { name: "run_shell_command", args: { command, description: "show log" } } }]
        : [{ text: stream ? "done" : '{"reasoning":"x","model_choice":"flash"}' }];
      const out = { candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
      if (stream) { res.writeHead(200, { "content-type": "text/event-stream" }); res.write(`data: ${JSON.stringify(out)}\n\n`); res.end(); }
      else { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); }
    });
  });
}

/** The function response the model got for the shell call (JSON text), or "" when gemini never sent one. */
async function fire(t, { command = "cat big.log", settings = {}, setup } = {}) {
  const d = mkdtempSync(join(tmpdir(), "cm-gemfire-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const home = join(d, "home");
  const work = join(d, "work");
  const pkg = join(d, "pkg");
  mkdirSync(join(home, ".gemini"), { recursive: true });
  mkdirSync(work);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6500));
  writeFileSync(join(home, ".gemini", "settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } }, general: { enableAutoUpdate: false }, ...settings }));
  const built = spawnSync(process.execPath, [BUILD, "--out", pkg], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const bodies = [];
  const srv = provider(command, bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const env = { ...process.env, HOME: home, USERPROFILE: home, GEMINI_CLI_HOME: home, GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${srv.address().port}`,
    GEMINI_API_KEY: "fake", GEMINI_CLI_TRUST_WORKSPACE: "true", GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(d, "no-system.json") };
  const link = spawnSync("gemini", ["extensions", "link", pkg], { cwd: work, env, input: "y\n", encoding: "utf8", timeout: 60000 });
  assert.equal(link.status, 0, `${link.stdout}${link.stderr}`);
  if (setup) setup({ env, work, home });
  await new Promise((resolveRun) => {
    const c = spawn("gemini", ["-p", "show the log", "--approval-mode", "yolo", "-o", "json"], { cwd: work, env, stdio: "ignore" });
    const k = setTimeout(() => c.kill(), RUN_MS);
    c.on("close", () => { clearTimeout(k); resolveRun(); });
  });
  for (const { body } of bodies) {
    let j;
    try { j = JSON.parse(body); } catch { continue; }
    for (const c of j.contents ?? []) for (const p of c.parts ?? []) if (p.functionResponse) return JSON.stringify(p.functionResponse);
  }
  return "";
}

const opts = { skip: !hasGemini && "gemini not on PATH", timeout: 150000 };
const REDIRECT = /ctx_execute|ctx_search/;

test("D-NI-GEMINI-GATE-1: gemini run_shell_command cat of a large log is blocked and the model sees the ctx_execute redirect", opts, async (t) => {
  const out = await fire(t);
  assert.match(out, /Tool execution blocked/, out.slice(0, 400));
  assert.match(out, REDIRECT, out.slice(0, 400));
  assert.ok(out.length < 4000, `the model got ${out.length} bytes, not the 208 KB file`);
});

test("D-NI-GEMINI-GATE-1: gemini bounded head of a large log is not blocked", opts, async (t) => {
  const out = await fire(t, { command: "head -n 3 big.log" });
  assert.doesNotMatch(out, /Tool execution blocked/, out.slice(0, 400));
  assert.ok(out.includes("lorem ipsum"), out.slice(0, 400));
});

test("D-NI-GEMINI-GATE-1: hooksConfig.enabled=false stops the hook (the gate doctor reports), the model gets the file", opts, async (t) => {
  const out = await fire(t, { settings: { hooksConfig: { enabled: false } } });
  assert.doesNotMatch(out, /Tool execution blocked/, out.slice(0, 400));
  assert.ok(out.length > 20000, `${out.length}`);
});

test("D-NI-GEMINI-GATE-1: the extension disabled for the workspace scope stops the hook (the gate doctor reports)", opts, async (t) => {
  const out = await fire(t, { setup: ({ env, work }) => {
    const r = spawnSync("gemini", ["extensions", "disable", "context-mode", "--scope", "workspace"], { cwd: work, env, encoding: "utf8", timeout: 60000 });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  } });
  assert.doesNotMatch(out, /Tool execution blocked/, out.slice(0, 400));
  assert.ok(out.length > 20000, `${out.length}`);
});
