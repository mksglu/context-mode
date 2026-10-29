// tests/v2/hooks/hook-never-errors.test.mjs
// D-HNE-GUARD-1 (owner decision 2026-10-29): a hook never errors. On any internal failure it exits 0 with a valid decision
// for its host: own ctx_* tools allowed, flooding tools denied with the redirect plus "run ctx_doctor", and the error with
// its stack in <HOME>/.context-mode/hook-errors.log. Runs the built bundle for all 10 hosts (CM_HNE_BUNDLE overrides it).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..", "..");
let root;
let bundle;
let repo;

before(() => {
  root = mkdtempSync(join(tmpdir(), "cm-hne-"));
  if (process.env.CM_HNE_BUNDLE) bundle = process.env.CM_HNE_BUNDLE;
  else {
    const out = join(root, "bundle");
    const r = spawnSync(process.execPath, [join(REPO, "build", "build.mjs"), "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    bundle = join(out, "hook.mjs");
  }
  repo = join(root, "repo");
  mkdirSync(repo);
  spawnSync("git", ["init", "-q", repo]);
});

after(() => rmSync(root, { recursive: true, force: true }));

const SNAKE = (event, tool, input) => ({ hook_event_name: event, session_id: "s1", cwd: repo, tool_name: tool, tool_input: input });
const CAMEL = (event, tool, input) => ({ hookEventName: event, sessionId: "s1", cwd: repo, toolName: tool, toolArgs: JSON.stringify(input) });
const CMD = { command: "cat README.md | head -500" };

// shell: the host's native shell tool; own: this host's wire name for ctx_execute.
const HOSTS = {
  "claude-code": { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "Bash", own: "mcp__plugin_context-mode_context-mode__ctx_execute", safe: "TodoWrite" },
  codex: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "Bash", own: "mcp__context_mode__ctx_execute", safe: "update_plan" },
  gemini: { pay: (t, i) => SNAKE("BeforeTool", t, i), shell: "run_shell_command", own: "mcp_context-mode_ctx_execute", safe: "activate_skill" },
  qwen: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "run_shell_command", own: "mcp__context-mode__ctx_execute", safe: "todo_write" },
  "copilot-cli": { pay: (t, i) => CAMEL("preToolUse", t, i), shell: "bash", own: "context-mode-ctx_execute", safe: "skill" },
  vscode: { pay: (t, i) => CAMEL("preToolUse", t, i), shell: "run_in_terminal", own: "mcp_context-mode_ctx_execute", safe: "manage_todo_list" },
  kiro: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "execute_bash", own: "mcp_context-mode_ctx_execute", safe: "todo_list" },
  zcode: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "Bash", own: "mcp__context-mode__ctx_execute", safe: "TodoWrite" },
  pi: { pay: (t, i) => ({ type: "tool_call", sessionId: "s1", cwd: repo, toolName: t, input: i }), shell: "bash", own: "ctx_execute", safe: "todo" },
  opencode: { pay: (t, i) => ({ type: "execute.before", sessionID: "s1", directory: repo, tool: t, args: i }), shell: "bash", own: "context-mode_ctx_execute", safe: "todowrite" },
};
const EXIT2 = new Set(["kiro", "pi", "opencode"]); // these hosts deny by exit code 2 and text

function run(host, payload, { fault, env = {}, preload } = {}) {
  const home = mkdtempSync(join(root, "home-"));
  const args = preload ? ["--require", preload] : [];
  const r = spawnSync(process.execPath, [...args, bundle, "--agent", host], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, ...(fault ? { CM_HOOK_FAULT: fault } : {}), ...env },
    timeout: 20000,
  });
  return { ...r, home };
}

function denyText(host, r) {
  if (EXIT2.has(host)) return r.status === 2 ? (r.stdout + r.stderr) : null;
  if (r.status !== 0 || r.stdout === "") return null;
  const j = JSON.parse(r.stdout); // must be valid JSON for every host that is not exit-2
  const reason = j.hookSpecificOutput?.permissionDecisionReason ?? j.permissionDecisionReason ?? j.reason;
  const dec = j.hookSpecificOutput?.permissionDecision ?? j.permissionDecision ?? j.decision;
  return dec === "deny" && typeof reason === "string" ? reason : null;
}

function logLines(home) {
  const f = join(home, ".context-mode", "hook-errors.log");
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l)) : [];
}

const STAGES = ["decode", "project", "policy", "encode"];

for (const host of Object.keys(HOSTS)) {
  const h = HOSTS[host];
  for (const stage of STAGES) {
    test(`[D-HNE-GUARD-1] ${host}: a throw at ${stage} exits 0, denies the shell with the redirect, logs the stack`, () => {
      const r = run(host, h.pay(h.shell, CMD), { fault: stage });
      const reason = denyText(host, r);
      assert.notEqual(reason, null, `${host}/${stage} not a deny: status=${r.status} stdout=${r.stdout.slice(0, 200)} stderr=${r.stderr.slice(0, 200)}`);
      if (!EXIT2.has(host)) assert.equal(r.status, 0);
      assert.ok(reason.includes("ctx_execute"), "redirect names the sandbox: " + reason);
      assert.ok(reason.includes("ctx_doctor"), "names ctx_doctor: " + reason);
      const log = logLines(r.home);
      assert.equal(log.length >= 1, true, "error line in hook-errors.log");
      assert.equal(log[0].agent, host);
      assert.ok(log[0].stack.includes("injected fault at " + stage), log[0].stack.slice(0, 200));
    });

    test(`[D-HNE-GUARD-1] ${host}: a throw at ${stage} still allows the own ctx_* tool and a tool that cannot flood`, () => {
      for (const name of [h.own, h.safe]) {
        const r = run(host, h.pay(name, { code: "1" }), { fault: stage });
        assert.equal(r.status, 0, `${host}/${stage}/${name} exit ${r.status}: ${r.stderr.slice(0, 200)}`);
        assert.equal(denyText(host, r), null, `${host}/${stage}/${name} must not be denied: ${r.stdout.slice(0, 200)}`);
        if (r.stdout !== "") JSON.parse(r.stdout); // never half a document
      }
    });
  }

  test(`[D-HNE-GUARD-1] ${host}: Node below 24.15 gives the same failure decision and does not crash at load`, () => {
    const pre = join(root, "oldnode.cjs");
    writeFileSync(pre, "Object.defineProperty(process, 'version', { value: 'v22.1.0' });");
    const r = run(host, h.pay(h.shell, CMD), { preload: pre });
    const reason = denyText(host, r);
    assert.notEqual(reason, null, `${host} old node not a deny: status=${r.status} stderr=${r.stderr.slice(0, 200)}`);
    assert.ok(reason.includes("NODE_TOO_OLD"), reason);
    assert.ok(reason.includes("ctx_doctor"), reason);
    assert.equal(logLines(r.home)[0].stage, "node");
    const own = run(host, h.pay(h.own, { code: "1" }), { preload: pre });
    assert.equal(own.status, 0);
    assert.equal(denyText(host, own), null);
  });

  test(`[D-HNE-GUARD-1] ${host}: unreadable stdin is logged and answered with exit 0`, () => {
    const r = run(host, "{not json");
    assert.equal(r.status, 0);
    assert.ok(logLines(r.home).some((l) => l.stage === "stdin"), "stdin error logged");
  });
}

test("[D-HNE-GUARD-1] a large Read is denied and a small Read allowed when the hook fails", () => {
  const big = join(root, "big.txt");
  const small = join(root, "small.txt");
  writeFileSync(big, "x".repeat(40000));
  writeFileSync(small, "ok");
  const mk = (p) => SNAKE("PreToolUse", "Read", { file_path: p });
  assert.notEqual(denyText("claude-code", run("claude-code", mk(big), { fault: "policy" })), null);
  assert.equal(denyText("claude-code", run("claude-code", mk(small), { fault: "policy" })), null);
  assert.equal(denyText("claude-code", run("claude-code", SNAKE("PreToolUse", "Read", { file_path: big, offset: 1, limit: 20 }), { fault: "policy" })), null, "a ranged Read cannot flood");
});

test("[D-HNE-GUARD-1] WebFetch and Grep are denied with their own redirect when the hook fails", () => {
  const f = denyText("claude-code", run("claude-code", SNAKE("PreToolUse", "WebFetch", { url: "https://example.com" }), { fault: "policy" }));
  assert.ok(f.includes("ctx_index") && f.includes("ctx_doctor"), f);
  const g = denyText("claude-code", run("claude-code", SNAKE("PreToolUse", "Grep", { pattern: "x" }), { fault: "policy" }));
  assert.ok(g.includes("ctx_execute") && g.includes("ctx_doctor"), g);
});

test("[D-HNE-GUARD-1] a non PreToolUse event that fails answers allow, never a deny", () => {
  const r = run("claude-code", SNAKE("PostToolUse", "Bash", CMD), { fault: "decode" });
  assert.equal(r.status, 0);
  assert.equal(denyText("claude-code", r), null);
});

test("[D-HNE-GUARD-1] the log is append only: a second failure adds a line and keeps the first", () => {
  const home = mkdtempSync(join(root, "home-"));
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CM_HOOK_FAULT: "decode" };
  for (let i = 0; i < 2; i++) spawnSync(process.execPath, [bundle, "--agent", "claude-code"], { input: JSON.stringify(SNAKE("PreToolUse", "Bash", CMD)), env, encoding: "utf8" });
  assert.equal(logLines(home).length, 2);
});
