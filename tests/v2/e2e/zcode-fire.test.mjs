// D-NI-ZCODE-GATE-1: the real zcode CLI (0.17.0, built from zai-org/ZCode; no npm package exists) against a local fake
// OpenAI-compatible provider (provider_config.json, api.type openai-chat-completions). The fake answers with one Bash call
// "cat big.log" (208 KB file), then a final text. context-mode is installed with its own `setup --agents zcode` into a temp
// HOME; the hook must block the call and the model must see the redirect, not the file. Then the gate doctor reports (one
// invalid key in config.json) is switched on and the model must see the file again.
// Skipped unless ZCODE_CLI_BUNDLE points at zcode.cjs (apps/zcode-cli/packages/cli/dist/zcode.cjs) or `zcode` is on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BUILD = resolve("build/build.mjs");
const BUNDLE = process.env.ZCODE_CLI_BUNDLE;
const onPath = spawnSync("zcode", ["--version"], { stdio: "ignore" }).status === 0;
const cmd = BUNDLE && existsSync(BUNDLE) ? [process.execPath, BUNDLE] : onPath ? ["zcode"] : undefined;
const RUN_MS = 100000;

function provider(command, bodies) {
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      bodies.push(b);
      let answered = false;
      try { answered = (JSON.parse(b).messages ?? []).some((m) => m.role === "tool"); } catch { /* not JSON */ }
      const chunk = (delta, fin) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "fake", choices: [{ index: 0, delta, finish_reason: fin ?? null }] })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (!answered) {
        res.write(chunk({ role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "Bash", arguments: JSON.stringify({ command }) } }] }));
        res.write(chunk({}, "tool_calls"));
      } else {
        res.write(chunk({ role: "assistant", content: "done" }));
        res.write(chunk({}, "stop"));
      }
      res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "fake", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
}

/** The tool message the model got for the Bash call ("" when zcode never sent one). */
async function fire(t, { command = "cat big.log", edit } = {}) {
  const d = mkdtempSync(join(tmpdir(), "cm-zcfire-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const home = join(d, "home");
  const work = join(d, "work");
  const pkg = join(d, "pkg");
  mkdirSync(home, { recursive: true });
  mkdirSync(work);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6500));
  const built = spawnSync(process.execPath, [BUILD, "--out", pkg], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const bodies = [];
  const srv = provider(command, bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, ZCODE_DATA_BASE_DIR: home };
  mkdirSync(join(home, ".zcode", "v2"), { recursive: true });
  writeFileSync(join(home, ".zcode", "v2", "provider_config.json"), JSON.stringify({ schemaVersion: 1, config: {
    providerConfigRules: { providerRules: [{ providerId: "fake", providerName: "Fake", config: { group: "standard-personal", access: { type: "api-key", apiKey: "fake" },
      api: { type: "openai-chat-completions", baseUrl: `http://127.0.0.1:${srv.address().port}/v1` }, personalModelIds: ["fake-model"] } }] },
    modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
    defaultModelSelection: { providerId: "fake", modelId: "fake-model" } } }));
  const setup = spawnSync(process.execPath, [join(pkg, "cli.mjs"), "setup", "--yes", "--agents", "zcode"], { env, encoding: "utf8", timeout: 120000 });
  assert.equal(setup.status, 0, `${setup.stdout}${setup.stderr}`);
  if (edit) {
    const file = join(home, ".zcode", "cli", "config.json");
    const doc = JSON.parse(readFileSync(file, "utf8"));
    edit(doc);
    writeFileSync(file, JSON.stringify(doc, null, 2));
  }
  await new Promise((resolveRun) => {
    const c = spawn(cmd[0], [...cmd.slice(1), "--prompt", "show the log", "--cwd", work, "--mode", "yolo", "--json", "--no-color"], { cwd: work, env, stdio: "ignore" });
    const k = setTimeout(() => c.kill(), RUN_MS);
    c.on("close", () => { clearTimeout(k); resolveRun(); });
  });
  for (const body of bodies) {
    let j;
    try { j = JSON.parse(body); } catch { continue; }
    for (const m of j.messages ?? []) if (m.role === "tool") return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
  }
  return "";
}

const opts = { skip: !cmd && "no zcode binary: set ZCODE_CLI_BUNDLE to zcode.cjs or put zcode on PATH", timeout: 200000 };

test("D-NI-ZCODE-GATE-1: zcode Bash cat of a large log is replaced and the model sees the ctx_execute redirect", opts, async (t) => {
  const out = await fire(t);
  assert.match(out, /ctx_execute/, out.slice(0, 400));
  assert.ok(out.length < 4000, `the model got ${out.length} bytes, not the 208 KB file`);
});

test("D-NI-ZCODE-GATE-1: zcode bounded head of a large log is not replaced", opts, async (t) => {
  const out = await fire(t, { command: "head -n 3 big.log" });
  assert.doesNotMatch(out, /ctx_execute/, out.slice(0, 400));
  assert.ok(out.includes("lorem ipsum"), out.slice(0, 400));
});

test("D-NI-ZCODE-GATE-1: one invalid key (ui.locale) makes zcode drop the whole config.json, hooks included (the gate doctor reports)", opts, async (t) => {
  const out = await fire(t, { edit: (doc) => { doc.ui = { locale: 12345 }; } });
  assert.doesNotMatch(out, /context-mode: /, out.slice(0, 400));
  assert.ok(out.length > 1000, `${out.length}`);
});
