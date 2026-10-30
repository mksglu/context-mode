// tests/v2/0020-fire-hook-config.test.mjs
// ADR-0020: every agent fires its hooks (hosts that read a hook config). Real-binary / real-process fire tests, one describe per agent.
// ADR-0003: this file never imports from src/. Each agent's tests skip with a reason when its binary is absent.
// Split from one file because the spawnSync probes and builds block the event loop; two files run in two processes.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join, resolve } from "node:path";
import { hostBin, runSetup } from "../../src/setup/index.ts";
import { TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { generateManifests } from "../../build/manifests.ts";
import { listCopilotHooks } from "../../src/setup/copilot-hooks.ts";

// Agent describes run concurrently (each owns its temp dirs and fake provider). Tests inside one describe stay serial:
// they share the built package, and a concurrent run hit ENOTEMPTY on the shared temp dir (codex).
describe("ADR-0020 fire, hook-config hosts", { concurrency: true }, () => {
  describe("ADR-0020 fire claude-code", () => {
    // D-CC-HOOKS-RUN-1: the real `claude -p` (no login, fake Anthropic Messages endpoint through ANTHROPIC_BASE_URL) runs
    // Bash "cat big.log" on a 200 KB file. The plugin is installed the documented way (`claude plugin marketplace add`
    // then `claude plugin install`) into a temp HOME and CLAUDE_CONFIG_DIR. Our PreToolUse hook must replace the output:
    // the model sees the ctx_execute redirect, not 200 KB. Skipped when claude is not on PATH.


    const REPO = resolve(import.meta.dirname, "../..");
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
  });

  describe("ADR-0020 fire codex", () => {
    // D-CDX-CAT-1: the real `codex exec` (no login) against a local fake Responses provider calls exec_command with
    // a large-file cat; our built hook must deny it with the ctx_execute redirect and Codex must pass the deny back.
    // Skipped when codex is not on PATH. Temp HOME and CODEX_HOME only.

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
  });

  describe("ADR-0020 fire copilot-cli", () => {
    // D-HF-COPILOT-ENABLED-1: the real `copilot -p` (no login, COPILOT_OFFLINE with a custom OpenAI-compatible provider)
    // against a local fake provider that calls the shell tool with `cat big.log` (192 KB). Our hook must deny it with the
    // ctx_execute redirect and the model must see that text, not the file. Second test: a user `disabledHooks` entry for our
    // hook stops it (the gate); `context-mode setup` removes our key and the hook fires. Skipped when copilot is not on PATH.
    // Temp HOME and COPILOT_HOME only.


    const REPO = resolve(import.meta.dirname, "../..");
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
  });

  describe("ADR-0020 fire gemini", () => {
    // D-NI-GEMINI-GATE-1: the real `gemini -p` (no login, no key) against a local fake Gemini API. The fake answers with one
    // run_shell_command call "cat big.log" (208 KB file), then a final text. The built context-mode extension is linked into a
    // temp HOME with the host's own `gemini extensions link`; the hook must block the call and the model must see the redirect,
    // not the file. Then each gate that stops hooks (D-NI-GEMINI-GATE-1) is switched on and the model must see the file again.
    // Skipped when gemini is not on PATH (CI installs @google/gemini-cli where it can). Temp HOME only.

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
  });

  describe("ADR-0020 fire kiro", () => {
    // D-NI-KIRO-GATE-1 live check. The real kiro-cli (V3 engine, 2.35.2) loads the hook file setup wrote and logs
    // `hooks.reload.loaded {"read":N,"registered":N}` in ~/.kiro/logs/<run>/kiro.log. N must equal the number of entries in
    // ~/.kiro/hooks/context-mode.json, so the host parsed every own entry. This proves LOAD, not FIRE: kiro needs a real login
    // before its first model call (a fake KIRO_API_KEY stops at "could not load the available models"), and the loader also
    // counts an "enabled": false entry as registered, so the enabled flag is covered by tests/v2/setup/kiro-gate.test.mjs.
    // Skipped with a reason when no kiro-cli binary is found (KIRO_CLI_BIN, else `kiro-cli` on PATH).


    const WIN = process.platform === "win32";
    function findBin() {
      if (process.env.KIRO_CLI_BIN && existsSync(process.env.KIRO_CLI_BIN)) return process.env.KIRO_CLI_BIN;
      const r = spawnSync(WIN ? "where" : "which", ["kiro-cli"], { encoding: "utf8" });
      return r.status === 0 ? r.stdout.split("\n")[0].trim() : undefined;
    }
    const BIN = findBin();
    const LOADED = "hooks.reload.loaded ";
    const WAIT_MS = 60000;

    function fakePkg(root) {
      const dir = path.join(root, "pkg");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "server.mjs"), `
  import { createInterface } from "node:readline";
  const tools = ${JSON.stringify([...TOOL_ORDER])};
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (l) => {
    const m = JSON.parse(l);
    if (m.id === undefined) return;
    const result = m.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
      : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
  });
  `);
      writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; process.stderr.write("deny: run ctx_execute; ctx_search( finds the rest\\n"); process.exit(2); });\n`);
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
      const skills = path.join(import.meta.dirname, "..", "..", "skills");
      for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
      return dir;
    }

    function loadedLine(home) {
      const logs = path.join(home, ".kiro", "logs");
      if (!existsSync(logs)) return undefined;
      for (const run of readdirSync(logs)) {
        const log = path.join(logs, run, "kiro.log");
        if (!existsSync(log)) continue;
        const line = readFileSync(log, "utf8").split("\n").find((l) => l.includes(LOADED));
        if (line) return JSON.parse(JSON.parse(line).message.slice(LOADED.length));
      }
      return undefined;
    }

    test("[D-NI-KIRO-GATE-1] live: the real kiro V3 loader reads and registers every hook entry setup wrote",
      { skip: BIN === undefined && "kiro-cli binary not found (set KIRO_CLI_BIN or put kiro-cli on PATH)" }, async (t) => {
        const root = mkdtempSync(path.join(tmpdir(), "cm-kirofire-"));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        const home = path.join(root, "home");
        const work = path.join(root, "work");
        mkdirSync(home, { recursive: true });
        mkdirSync(work, { recursive: true });
        const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
        const res = await runSetup({ home, pkgDir: fakePkg(root), env, agents: ["kiro"], runId: "kf1" });
        assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0]));
        const want = JSON.parse(readFileSync(path.join(home, ".kiro", "hooks", "context-mode.json"), "utf8")).hooks.length;
        assert.ok(want >= 6, `setup wrote ${want} entries`);

        const child = spawn(BIN, ["chat", "--no-interactive", "--v3", "hi"], {
          cwd: work, stdio: "ignore",
          env: { ...process.env, HOME: home, USERPROFILE: home, KIRO_API_KEY: "ksk_fake", KIRO_DISABLE_TELEMETRY: "1" },
        });
        let got;
        const until = Date.now() + WAIT_MS;
        while (Date.now() < until && (got = loadedLine(home)) === undefined) await new Promise((r) => setTimeout(r, 500));
        child.kill();
        assert.ok(got, "kiro never logged hooks.reload.loaded");
        assert.deepEqual(got, { read: want, registered: want });
      });
  });
});
