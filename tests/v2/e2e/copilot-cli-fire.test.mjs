// D-HF-COPILOT-ENABLED-1: the real `copilot -p` (no login, COPILOT_OFFLINE with a custom OpenAI-compatible provider)
// against a local fake provider that calls the shell tool with `cat big.log` (192 KB). Our hook must deny it with the
// ctx_execute redirect and the model must see that text, not the file. Second test: a user `disabledHooks` entry for our
// hook stops it (the gate); `context-mode setup` removes our key and the hook fires. Skipped when copilot is not on PATH.
// Temp HOME and COPILOT_HOME only.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { generateManifests } from "../../../build/manifests.ts";
import { listCopilotHooks } from "../../../src/setup/copilot-hooks.ts";
import { runSetup } from "../../../src/setup/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const HOOK = join(REPO, "src/entries/hook.ts");
const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
let hasCopilot = true;
try { execFileSync("copilot", ["--version"], { stdio: "ignore" }); } catch { hasCopilot = false; }

function provider(bodies) {
  let n = 0;
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      if (!req.url.includes("chat/completions")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data: [] })); return; }
      bodies.push(b);
      const j = JSON.parse(b || "{}");
      const hasTool = (j.messages || []).some((m) => m.role === "tool");
      const call = { id: "call_1", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: "cat big.log", description: "show" }) } };
      const delta = hasTool ? { role: "assistant", content: "done" } : { role: "assistant", tool_calls: [{ index: 0, ...call }] };
      const fin = hasTool ? "stop" : "tool_calls";
      const chunk = (d, f) => "data: " + JSON.stringify({ id: "c" + n, object: "chat.completion.chunk", model: "fake", choices: [{ index: 0, delta: d, finish_reason: f }], ...(f ? { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } : {}) }) + "\n\n";
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(chunk(delta, null)); res.write(chunk({}, fin)); res.write("data: [DONE]\n\n"); res.end();
      n++;
    });
  });
}

function pkg(root) {
  const dir = join(root, "pkg");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
  writeFileSync(join(dir, "hook.mjs"), `import ${JSON.stringify(HOOK)};\n`); // the real hook entry, run through the setup-written command
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  generateManifests(dir);
  for (const s of SKILLS) cpSync(join(REPO, "skills", s), join(dir, "skills", s), { recursive: true });
  for (const s of SKILLS) cpSync(join(REPO, "skills", s), join(dir, "pi", "skills", s), { recursive: true });
  return dir;
}

async function fire(t, { disable }) {
  const root = mkdtempSync(join(tmpdir(), "cm-copfire-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"); const work = join(root, "work");
  mkdirSync(home); mkdirSync(work);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6000));
  const bodies = [];
  const srv = provider(bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const port = srv.address().port;
  const copilotHome = join(home, ".copilot");
  const env = { ...process.env, HOME: home, USERPROFILE: home, COPILOT_HOME: copilotHome, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
  mkdirSync(copilotHome, { recursive: true });
  const hookFile = join(copilotHome, "hooks", "context-mode.json");
  // The disable key is a host-side hash: take it from the host's own hooks.discover, never compute it.
  const keyOf = async () => (await listCopilotHooks(env, hookFile, work)).find((h) => h.event === "preToolUse").disableKey;
  if (disable !== "before") {
    const r = await runSetup({ home, pkgDir: pkg(root), env, agents: ["copilot-cli"], runId: "r1" });
    assert.equal(r.exitCode, 0, JSON.stringify(r.agents.map((a) => [a.id, a.status, a.reason])));
    if (disable === "after") {
      writeFileSync(join(copilotHome, "settings.json"), JSON.stringify({ disabledHooks: [await keyOf()] }));
      const again = await runSetup({ home, pkgDir: pkg(root), env, agents: ["copilot-cli"], runId: "r2" });
      assert.equal(again.exitCode, 0, JSON.stringify(again.agents.map((a) => [a.id, a.status, a.reason])));
      assert.deepEqual(JSON.parse(readFileSync(join(copilotHome, "settings.json"), "utf8")).disabledHooks, [], "setup removed our key");
    }
  } else {
    // hook file exists, key disabled: the gate. Setup is not run here.
    mkdirSync(join(copilotHome, "hooks"), { recursive: true });
    const cmd = `"${process.execPath}" "${HOOK}" --agent copilot-cli`;
    writeFileSync(hookFile, JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: "command", command: cmd, timeoutSec: 20 }] } }));
    writeFileSync(join(copilotHome, "settings.json"), JSON.stringify({ disabledHooks: [await keyOf()] }));
  }
  const fenv = { ...env, COPILOT_OFFLINE: "true", COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${port}/v1`, COPILOT_PROVIDER_API_KEY: "x", COPILOT_MODEL: "fake" };
  await new Promise((resolveRun) => {
    const c = spawn("copilot", ["-p", "show", "--allow-all-tools", "--no-auto-update", "--log-dir", join(root, "logs")], { cwd: work, env: fenv, stdio: "ignore" });
    const to = setTimeout(() => c.kill(), 90000);
    c.on("close", () => { clearTimeout(to); resolveRun(); });
  });
  const second = bodies.map((b) => JSON.parse(b)).find((j) => (j.messages || []).some((m) => m.role === "tool"));
  return second ? second.messages.filter((m) => m.role === "tool").map((m) => String(m.content)).join("\n") : "";
}

const opts = { skip: !hasCopilot && "copilot not on PATH", timeout: 240000 };
test("D-HF-COPILOT-ENABLED-1: after setup, copilot -p cat of a 192 KB log is denied with the ctx_execute redirect", opts, async (t) => {
  const out = await fire(t, {});
  assert.match(out, /Denied by preToolUse hook/);
  assert.ok(out.includes("ctx_execute"), out);
  assert.ok(out.length < 2000, "the model saw the redirect, not the file: " + out.length);
});
test("D-HF-COPILOT-ENABLED-1: a disabledHooks entry for our hook lets the 192 KB file through (the gate)", opts, async (t) => {
  const out = await fire(t, { disable: "before" });
  assert.doesNotMatch(out, /Denied by preToolUse hook/);
  assert.ok(!out.includes("ctx_execute"), "no hook ran, so no redirect: " + out);
  assert.match(out, /Output too large to read at once/, "only the host's own cut reached the model"); // copilot 1.0.105 saves a big result to a temp file
});
test("D-HF-COPILOT-ENABLED-1: setup after the user disabled our hook removes the key and the hook fires again", opts, async (t) => {
  const out = await fire(t, { disable: "after" });
  assert.match(out, /Denied by preToolUse hook/);
  assert.ok(out.includes("ctx_execute"), out);
});
