// Ported from v1 tests/executor.test.ts (context-mode 1.0.169): the language cases, through v2's public ctx_execute handler.
// A runtime missing on the machine shows as a named skip (node:test prints it), never as a pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctxExecute } from "../../../src/core/tools/execute.ts";

const has = (bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0;
const skipUnless = (bin) => (has(bin) ? false : `${bin} is not on PATH`);

function ctxFor(root) {
  const k = "1".repeat(16);
  return {
    project: { projectKey: k, projectDir: join(root, "projects", k), dbPath: join(root, "projects", k, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
    sessionId: "s1", turn: 1, signal: new AbortController().signal,
  };
}
async function exec(input) {
  const root = mkdtempSync(join(tmpdir(), "cm-v1ex-"));
  try { return await ctxExecute.handler(input, ctxFor(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

const OK = [
  ["JS: hello world", "javascript", 'console.log("hello from js");', "hello from js", "node"],
  ["JS: variables, math, template literals", "javascript", "const x = 42; const y = 58; console.log(`sum: ${x + y}`);", "sum: 100", "node"],
  ["JS: JSON parse + transform", "javascript", 'const d=[{a:30},{a:25},{a:35}]; console.log(JSON.stringify({count:d.length,avg:(d.reduce((s,x)=>s+x.a,0)/d.length).toFixed(1)}));', '"avg":"30.0"', "node"],
  ["JS: async/await + setTimeout", "javascript", 'new Promise(r => setTimeout(() => r("async done"), 50)).then(console.log);', "async done", "node"],
  ["JS: require node:os", "javascript", 'console.log("platform:", require("os").platform());', "platform:", "node"],
  ["JS: Array.from + filter/reduce", "javascript", 'console.log("even sum:", Array.from({length:100},(_, i)=>i+1).filter(n=>n%2===0).reduce((a,b)=>a+b,0));', "even sum: 2550", "node"],
  ["Python: hello world", "python", 'print("hello from python")', "hello from python", "python3"],
  ["Python: list comprehension + math", "python", "nums=[i**2 for i in range(10)]\nprint(f'sum: {sum(nums)}')", "sum: 285", "python3"],
  ["Python: dict + json", "python", 'import json\nprint(json.dumps({"count": len([1,2])}))', '"count": 2', "python3"],
  ["Shell: hello world", "shell", 'echo "hello from shell"', "hello from shell", "sh"],
  ["Shell: pipes + sort", "shell", 'printf "banana\\napple\\ncherry" | sort', "apple\nbanana\ncherry", "sh"],
  ["Shell: arithmetic + variables", "shell", 'X=10\nY=20\necho "sum: $((X + Y))"', "sum: 30", "sh"],
  ["Ruby: hello world", "ruby", 'puts "hello from ruby"', "hello from ruby", "ruby"],
  ["Ruby: array methods", "ruby", "puts [1,2,3,4].select(&:even?).sum", "6", "ruby"],
  ["Perl: hello world", "perl", 'print "hello from perl\\n";', "hello from perl", "perl"],
];
for (const [name, language, code, want, bin] of OK) {
  test("v1 executor: " + name, { skip: skipUnless(bin) }, async () => {
    const out = await exec({ language, code });
    assert.equal(out.isError, false, out.text);
    assert.ok(out.text.startsWith("exit 0"), out.text);
    assert.ok(out.text.includes(want), out.text);
  });
}

const FAIL = [
  ["JS: syntax error returns non-zero", "javascript", "const x = {", /^exit [1-9]/, "node"],
  ["JS: runtime error returns non-zero and keeps the message", "javascript", 'throw new Error("intentional");', /^exit [1-9][\s\S]*intentional/, "node"],
  ["Python: syntax error", "python", "def foo(\n  pass", /^exit [1-9]/, "python3"],
  ["Shell: failing command", "shell", "exit 3", /^exit 3/, "sh"],
];
for (const [name, language, code, re, bin] of FAIL) {
  test("v1 executor: " + name, { skip: skipUnless(bin) }, async () => {
    const out = await exec({ language, code });
    assert.match(out.text, re);
  });
}

// Windows: Git Bash does not export TMPDIR from the host environment (it uses TEMP), so the v1 assertion has no meaning there.
test("v1 executor: shell TMPDIR points to the sandbox temp dir, not the project root", { skip: process.platform === "win32" ? "TMPDIR is a POSIX variable; Windows shells use TEMP" : false }, async () => {
  const out = await exec({ language: "shell", code: 'echo "TMP=$TMPDIR"' });
  const m = /TMP=(\S+)/.exec(out.text);
  assert.ok(m, "TMPDIR is empty: " + out.text);
  assert.ok(m[1].length > 1 && m[1] !== process.cwd(), out.text);
});
