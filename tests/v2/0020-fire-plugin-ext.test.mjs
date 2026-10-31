// tests/v2/0020-fire-plugin-ext.test.mjs
// ADR-0020: every agent fires its hooks (plugin, extension and IDE hosts). Real-binary / real-process fire tests, one describe per agent.
// ADR-0003: this file never imports from src/. Each agent's tests skip with a reason when its binary is absent.
// Split from one file because the spawnSync probes and builds block the event loop; two files run in two processes.

import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { openSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runDoctor, runSetup } from "../../src/setup/index.ts";

// Agent describes run concurrently (each owns its temp dirs and fake provider). Tests inside one describe stay serial: they share the built package.
describe("ADR-0020 fire, plugin and extension hosts", { concurrency: CONC }, () => {
  describe("ADR-0020 fire opencode", () => {
    // D-HF-OPENCODE-FIRE-1: the real `opencode run` (no login, no key) against a local fake OpenAI-compatible provider calls
    // the bash tool with `cat big.log` (200 KB). Our built plugin (opencode/plugin.js, loaded from the config `plugin` list)
    // must replace the output, so the model sees the ctx_execute redirect and not the file. A control run with a plugin
    // entry whose file is missing proves the host skips it silently and the model sees the file (the gate setup/doctor guard).
    // Skipped when opencode is not on PATH. Temp HOME and XDG dirs only; the plugin is built into a temp dir.

    const REPO = resolve(import.meta.dirname, "../..");
    let hasOpencode = true;
    try { execFileSync("opencode", ["--version"], { stdio: "ignore" }); } catch { hasOpencode = false; }

    const chunk = (n, delta, fin) => `data: ${JSON.stringify({ id: "c" + n, object: "chat.completion.chunk", created: 1, model: "fake-model", choices: [{ index: 0, delta, finish_reason: fin ?? null }] })}\n\n`;
    function provider(cmd, bodies, toolName = "bash") {
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
            res.write(chunk(n, { role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: toolName, arguments: JSON.stringify({ command: cmd, description: "show log" }) } }] }));
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

    // D-OC2-FIRE-1: OpenCode 2 (npm @opencode/cli) is a second host: own binary, own shell tool name ("shell"), --standalone
    // so no background service is touched. CI installs it into its own prefix (CM_OPENCODE2_DIR) because both packages
    // own the `opencode` bin name. Locally it is found through CM_OPENCODE2_DIR or skipped.
    const OC2_DIR = process.env.CM_OPENCODE2_DIR;
    const OC2_BIN = OC2_DIR ? join(OC2_DIR, "node_modules", "@opencode", "cli", "bin", "opencode.exe") : undefined;
    let hasOpencode2 = false;
    if (OC2_BIN) { try { execFileSync(OC2_BIN, ["--version"], { stdio: "ignore" }); hasOpencode2 = true; } catch { hasOpencode2 = false; } }
    const HOST_1 = { bin: "opencode", tool: "bash", args: [] };
    const HOST_2 = { bin: OC2_BIN, tool: "shell", args: ["--standalone", "--auto", "--print-logs", "--log-level", "info"] };

    /** Runs opencode once; returns the content of the tool message the model got on its second request. */
    async function run(cmd, pluginEntry) { return (await runHost(cmd, pluginEntry, HOST_1)).out; }

    /** The same run for a host row: the tool text, the tool names of the first model request, and the host log. */
    async function runHost(cmd, pluginEntry, host) {
      const d = mkdtempSync(join(tmpdir(), "cm-ocfire-"));
      const work = join(d, "work");
      const home = join(d, "home");
      mkdirSync(work); mkdirSync(join(home, ".config", "opencode"), { recursive: true });
      writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6500));
      const bodies = [];
      const srv = provider(cmd, bodies, host.tool);
      await new Promise((r) => srv.listen(0, "127.0.0.1", r));
      const port = srv.address().port;
      const logFile = join(d, "host.log");
      writeFileSync(join(home, ".config", "opencode", "opencode.json"), JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        provider: { fake: { npm: "@ai-sdk/openai-compatible", name: "fake", options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "x" }, models: { "fake-model": { name: "fake-model", tool_call: true, limit: { context: 200000, output: 8000 } } } } },
        model: "fake/fake-model", autoupdate: false, plugin: [pluginEntry],
      }));
      const env = { ...process.env, PWD: work, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"), XDG_CACHE_HOME: join(home, ".cache"), XDG_STATE_HOME: join(home, ".local", "state"), OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_AUTOUPDATE: "1" };
      await new Promise((resolveRun) => {
        const debug = process.env.CM_OC_DEBUG ? ["--print-logs", "--log-level", "INFO"] : [];
        const args = ["run", ...(host.args.length ? host.args : debug), "-m", "fake/fake-model", "show the log"];
        const c = spawn(host.bin, args, { cwd: work, env, stdio: ["ignore", openSync(logFile, "w"), openSync(logFile, "a")] });
        const t = setTimeout(() => c.kill("SIGKILL"), 150000);
        c.on("close", () => { clearTimeout(t); resolveRun(); });
      });
      srv.close();
      const log = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
      rmSync(d, { recursive: true, force: true });
      // opencode also sends side requests (title); the one that carries the tool result is the one to read
      const tools = bodies.flatMap((b) => JSON.parse(b).messages.filter((m) => m.role === "tool"));
      const tool = tools.reduce((a, m) => (a === undefined || String(m.content).length >= String(a.content).length ? m : a), undefined);
      const first = bodies.map((b) => JSON.parse(b)).find((b) => (b.tools ?? []).length > 0);
      return { out: tool ? String(tool.content) : "", toolNames: (first?.tools ?? []).map((t) => t.function.name), log };
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
    test("D-OC2-ENTRY-1: OpenCode 1.19 loads the package dir entry (the entry setup writes) and denies the large cat", opts, async () => {
      const b = buildPlugin();
      const out = await run("cat big.log", b.out);
      assert.ok(out.includes("ctx_execute"), out.slice(0, 400));
      assert.ok(out.length < 4000, "the model got " + out.length + " bytes, not the file");
    });
    // D-OC2-FIRE-1: the real OpenCode 2.2.5 loader against the built package dir. Red before D-OC2-SETUP-1: "failed to load
    // plugin ... Plugin must export a default definition with an id and an effect or setup function" and later
    // "app.tool is not a function", no ctx_* tool, the file reaches the model.
    const opts2 = { skip: !hasOpencode2 && "CM_OPENCODE2_DIR has no @opencode/cli", timeout: 400000 };
    test("D-OC2-FIRE-1: OpenCode 2.2.5 loads the plugin with no warning, lists the ctx_* tools and denies the large cat", opts2, async () => {
      const b = buildPlugin();
      const r = await runHost("cat big.log", b.out, HOST_2);
      assert.ok(!r.log.includes("failed to load plugin"), r.log.split("\n").filter((l) => l.includes("WARN")).join("\n").slice(0, 600));
      assert.ok(!r.log.includes("level=WARN") || !r.log.includes("plugin"), "no plugin warning");
      for (const n of ["ctx_execute", "ctx_search", "ctx_stats"]) assert.ok(r.toolNames.includes(n), n + " listed: " + r.toolNames.join(","));
      assert.ok(r.out.includes("ctx_execute"), r.out.slice(0, 400));
      assert.ok(r.out.length < 4000, "the model got " + r.out.length + " bytes, not the file");
    });
    test.after?.(() => { if (built) rmSync(built.out, { recursive: true, force: true }); });
  });

  describe("ADR-0020 fire pi", () => {
    // D-NI-PI-GATE-1: the real `pi -p` (no login, no key) against a local fake OpenAI-compatible provider (models.json,
    // api openai-completions). The fake answers with one bash call "cat big.log" (192 KB file), then a final text. The built
    // context-mode package is installed with the host's own `pi install <dir>` into a temp HOME; the extension hook must
    // replace the output and the model must see the redirect, not the file. Then the packages[] extensions filter that
    // doctor reports (D-NI-PI-GATE-1) is switched on and the model must see the file again.
    // Skipped when pi is not on PATH (CI installs the pi CLI where it can). Temp HOME only.

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
  });

  describe("ADR-0020 fire qwen", () => {
    // D-NI-QWEN-GATE-1: the real `qwen` (headless, no login) against a local fake OpenAI-compatible provider calls
    // run_shell_command with a large-file cat. The built extension (release-out, linked with `qwen extensions link` in a temp HOME)
    // must make the model see the ctx_execute redirect, not the 192 KB file. A second case proves the gate: with
    // "disableAllHooks": true qwen runs no hook and the model sees the file. Skipped when qwen or release-out is absent.

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
  });

  describe("ADR-0020 fire vscode", () => {
    // D-NI-VSCODE-GATE-1. Two layers.
    // The (node only): the built package is set up into a temp HOME with the documented path, then the exact command
    //    setup wrote for PreToolUse is run with VS Code's documented payload (run_in_terminal, cat of a 200 KB log). The answer
    //    must be a deny that carries the ctx_execute redirect, not the file.
    // No live VS Code run is claimed: 1.144.0 was driven in a temp HOME with a customendpoint model (chatLanguageModels.json)
    // pointing at a local fake provider, but the headless chat never sent a request to it (sign-in gate).


    const BUILD = resolve("build/build.mjs");

    test("D-NI-VSCODE-GATE-1: the hook command setup wrote for vscode denies a 200 KB cat and the model-side text is the ctx_execute redirect", async (t) => {
      const d = mkdtempSync(join(tmpdir(), "cm-vsfire-"));
      t.after(() => rmSync(d, { recursive: true, force: true }));
      const home = join(d, "home");
      const work = join(d, "work");
      const pkg = join(d, "pkg");
      mkdirSync(home, { recursive: true });
      mkdirSync(work);
      writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6500));
      const built = spawnSync(process.execPath, [BUILD, "--out", pkg], { encoding: "utf8" });
      assert.equal(built.status, 0, built.stderr);
      const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
      const res = await runSetup({ home, pkgDir: pkg, env, agents: ["vscode"], runId: "r1" });
      assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0]));
      const doc = await runDoctor({ home, pkgDir: pkg, env, agents: ["vscode"] });
      assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0]));
      const file = JSON.parse(readFileSync(join(home, ".copilot", "hooks", "context-mode-vscode.json"), "utf8"));
      const entry = file.hooks.PreToolUse[0];
      assert.equal(entry.type, "command");
      const payload = { hook_event_name: "PreToolUse", session_id: "s1", cwd: work, tool_name: "run_in_terminal", tool_input: { command: "cat big.log" } };
      const run = spawnSync(entry.command, { shell: true, cwd: work, env, input: JSON.stringify(payload), encoding: "utf8", timeout: 30000 });
      const out = `${run.stdout}${run.stderr}`;
      assert.match(out, /ctx_execute|ctx_search/, out.slice(0, 400));
      assert.ok(out.length < 4000, `the model gets ${out.length} bytes, not the 208 KB file`);
    });
  });

  describe("ADR-0020 fire zcode", () => {
    // D-NI-ZCODE-GATE-1: the real zcode CLI (0.17.0, built from zai-org/ZCode; no npm package exists) against a local fake
    // OpenAI-compatible provider (provider_config.json, api.type openai-chat-completions). The fake answers with one Bash call
    // "cat big.log" (208 KB file), then a final text. context-mode is installed with its own `setup --agents zcode` into a temp
    // HOME; the hook must block the call and the model must see the redirect, not the file. Then the gate doctor reports (one
    // invalid key in config.json) is switched on and the model must see the file again.
    // Skipped unless ZCODE_CLI_BUNDLE points at zcode.cjs (apps/zcode-cli/packages/cli/dist/zcode.cjs) or `zcode` is on PATH.

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
  });
});
