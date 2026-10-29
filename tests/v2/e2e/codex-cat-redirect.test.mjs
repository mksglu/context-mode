// D-CDX-CAT-1: the real `codex exec` (no login) against a local fake Responses provider calls exec_command with
// a large-file cat; our built hook must deny it with the ctx_execute redirect and Codex must pass the deny back.
// Skipped when codex is not on PATH. Temp HOME and CODEX_HOME only.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HOOK = resolve("src/entries/hook.ts");
let hasCodex = true;
try { execFileSync("codex", ["--version"], { stdio: "ignore" }); } catch { hasCodex = false; }

const sse = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
function provider(cmd, bodies) {
  let n = 0;
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      bodies.push(b);
      res.writeHead(200, { "content-type": "text/event-stream" });
      n++;
      const item = n === 1
        ? { type: "function_call", call_id: "call_1", name: "exec_command", arguments: JSON.stringify({ cmd }) }
        : { type: "message", role: "assistant", id: "m" + n, content: [{ type: "output_text", text: "done" }] };
      res.write(sse({ type: "response.created", response: { id: "r" + n } }));
      res.write(sse({ type: "response.output_item.done", item }));
      res.write(sse({ type: "response.completed", response: { id: "r" + n, usage: { input_tokens: 1, input_tokens_details: null, output_tokens: 1, output_tokens_details: null, total_tokens: 2 } } }));
      res.end();
    });
  });
}

async function run(cmd) {
  const d = mkdtempSync(join(tmpdir(), "cm-cdxcat-"));
  const work = join(d, "work");
  const home = join(d, "home");
  mkdirSync(work); mkdirSync(home);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6000));
  const bodies = [];
  const srv = provider(cmd, bodies);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  writeFileSync(join(home, "config.toml"), `model = "fake-model"\nmodel_provider = "fake"\napproval_policy = "never"\nsandbox_mode = "workspace-write"\n[model_providers.fake]\nname = "fake"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n`);
  writeFileSync(join(home, "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: `"${process.execPath}" "${HOOK}" --agent codex`, timeout: 20 }] }] } }));
  const env = { ...process.env, HOME: home, CODEX_HOME: home };
  // a hook that is not trusted never runs; the bypass flag stands in for the trust hashes setup writes
  await new Promise((resolveRun) => {
    const c = spawn("codex", ["exec", "--skip-git-repo-check", "--dangerously-bypass-hook-trust", "show"], { cwd: work, env, stdio: "ignore" });
    const t = setTimeout(() => c.kill(), 90000);
    c.on("close", () => { clearTimeout(t); resolveRun(); });
  });
  srv.close();
  rmSync(d, { recursive: true, force: true });
  return bodies.length > 1 ? JSON.parse(bodies[1]).input.at(-1).output : "";
}

const opts = { skip: !hasCodex && "codex not on PATH", timeout: 120000 };
test("D-CDX-CAT-1: codex exec_command cat of a large log is denied with the ctx_execute redirect", opts, async () => {
  const out = await run("cat big.log");
  assert.match(out, /blocked by PreToolUse hook/);
  assert.ok(out.includes("ctx_execute"), out);
});
test("D-CDX-CAT-1: codex exec_command chained cd && cat of a large log is denied", opts, async () => {
  const out = await run("ls && cat big.log");
  assert.match(out, /blocked by PreToolUse hook/);
  assert.ok(out.includes("ctx_execute"), out);
});
test("D-CDX-CAT-1: codex exec_command bounded head of a large log is not denied", opts, async () => {
  const out = await run("head -n 3 big.log");
  assert.doesNotMatch(out, /blocked by PreToolUse hook/);
});
