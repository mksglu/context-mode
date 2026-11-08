// PRD-v2 section 9 (sandbox) and GP4: ctx_execute, ctx_batch, runtimes, child env, output cap, kill, spawn, Git Bash lookup.
// Moved from tests/sandbox/{cap,env,git-bash,kill,runtimes,spawn}.test.mjs and tests/tools/{execute,batch}.test.mjs. Names and bodies unchanged.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync, writeFileSync, chmodSync, readdirSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { test, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import { fileURLToPath } from "node:url";
import * as C from "../src/core/contracts/constants.ts";
import { formatError } from "../src/core/contracts/errors.ts";
import { checkShell } from "../src/core/ops/doctor-env.ts";
import { capBytes } from "../src/core/sandbox/cap.ts";
import { buildChildEnv } from "../src/core/sandbox/env.ts";
import { killTree } from "../src/core/sandbox/kill.ts";
import { findRuntime } from "../src/core/sandbox/runtimes.ts";
import { runProcess } from "../src/core/sandbox/spawn.ts";
import { ctxBatch, runBatch, runPool } from "../src/core/tools/batch.ts";
import { ctxExecute, ctxExecuteSchema } from "../src/core/tools/execute.ts";
import { ctxSearch } from "../src/core/tools/search.ts";

describe("PRD-v2 section 9: output cap", { concurrency: CONC }, () => {
  // Unit tests for src/core/sandbox/cap.ts (impl/03 §3).
  // capBytes(s, cap): { text, cut, fullBytes }. Code-point safe cut, never mid-sequence.
  // Concurrent: pure function, no shared state.
  test("capBytes returns the string unchanged when under cap", () => {
    const out = capBytes("hello", 100);
    assert.deepEqual(out, { text: "hello", cut: false, fullBytes: 5 });
  });

  test("capBytes cuts a plain ASCII string at exactly the cap", () => {
    const out = capBytes("a".repeat(200), 100);
    assert.equal(out.cut, true);
    assert.equal(Buffer.byteLength(out.text, "utf8"), 100);
    assert.equal(out.fullBytes, 200);
  });

  test("capBytes never cuts inside a multi-byte UTF-8 code point", () => {
    const s = "a".repeat(99) + "é" + "b".repeat(50); // é straddles byte 100 (2-byte)
    const out = capBytes(s, 100);
    assert.ok(Buffer.byteLength(out.text, "utf8") <= 100);
    assert.ok(!out.text.includes("�"));
  });

  test("capBytes never cuts inside a surrogate pair (emoji, 4-byte UTF-8)", () => {
    const s = "x".repeat(99) + "\u{1F600}".repeat(5);
    const out = capBytes(s, 100);
    assert.ok(Buffer.byteLength(out.text, "utf8") <= 100);
    assert.ok(!out.text.includes("�"));
    // whole code points only: result length in UTF-16 units is even multiple boundary safe
    const codepoints = [...out.text];
    assert.ok(codepoints.every((cp) => cp.length <= 2));
  });

  test("capBytes fullBytes is always the original UTF-8 byte length", () => {
    const s = "héllo wörld";
    const out = capBytes(s, 4);
    assert.equal(out.fullBytes, Buffer.byteLength(s, "utf8"));
  });

  // impl/14a GP4/code-point-safe-truncation-cut (#903) and GP4/surrogate-safe-truncation (#1176):
  // the cut lands on every byte offset around an emoji; no offset leaves a lone surrogate.
  function hasLoneSurrogate(s) {
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      const high = c >= 0xd800 && c <= 0xdbff;
      const low = c >= 0xdc00 && c <= 0xdfff;
      if (high) {
        const next = s.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i += 1;
      } else if (low) return true;
    }
    return false;
  }

  test("GP4/code-point-safe-truncation-cut: emoji at every cut offset gives a valid prefix", () => {
    const s = "ab" + "\u{1F600}" + "cé中\u{1F680}d";
    const full = Buffer.byteLength(s, "utf8");
    for (let cap = 0; cap < full; cap += 1) {
      const out = capBytes(s, cap);
      assert.equal(out.cut, true);
      assert.ok(Buffer.byteLength(out.text, "utf8") <= cap, `cap ${cap}`);
      assert.ok(s.startsWith(out.text), `prefix at cap ${cap}`);
      assert.ok(!hasLoneSurrogate(out.text), `lone surrogate at cap ${cap}`);
      // longest prefix: one more code point would exceed the cap
      const next = [...s.slice(out.text.length)][0];
      assert.ok(Buffer.byteLength(out.text + next, "utf8") > cap, `not longest at cap ${cap}`);
    }
  });

  test("GP4/surrogate-safe-truncation: output re-encodes to the same UTF-8 bytes (valid UTF-8)", () => {
    const s = "y".repeat(16382) + "\u{1F600}\u{1F600}";
    const out = capBytes(s, 16384);
    assert.equal(out.text, "y".repeat(16382));
    const round = Buffer.from(out.text, "utf8").toString("utf8");
    assert.equal(round, out.text);
    assert.ok(!hasLoneSurrogate(out.text));
  });

  test("capBytes keeps a leading BOM and returns '' for cap 0", () => {
    assert.equal(capBytes("﻿abc", 5).text, "﻿ab");
    assert.deepEqual(capBytes("abc", 0), { text: "", cut: true, fullBytes: 3 });
  });
});

describe("PRD-v2 section 9: ctx_execute", { concurrency: CONC }, () => {
  // Unit tests for src/core/tools/execute.ts (impl/04 §2). ctx_execute: alwaysLoad tool.
  // Concurrent: each test makes its own temp root and does not touch process.env or cwd.
  function ctxFor(root) {
    return {
      project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId: "s1", turn: 1, signal: new AbortController().signal,
    };
  }

  test("ctx_execute (D-BATCH-OWN-SOURCE-1): two calls with the same label in one turn answer from their own output", async () => {
    // Same code first line -> same "ctx_execute:" label; the intent selection reads by source id, so no mix.
    const root = mkdtempSync(join(tmpdir(), "cm-exown-"));
    try {
      const ctx = ctxFor(root);
      const a = await ctxExecute.handler({ language: "shell", code: "# snap\nprintf 'N1_SNAPSHOT phase=A\\n'", intent: "N1_SNAPSHOT" }, ctx);
      assert.ok(a.text.includes("phase=A"), a.text);
      const b = await ctxExecute.handler({ language: "shell", code: "# snap\nprintf 'N1_SNAPSHOT phase=B\\n'", intent: "N1_SNAPSHOT" }, ctx);
      assert.ok(b.text.includes("phase=B"), b.text);
      assert.ok(!b.text.includes("phase=A"), b.text);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute runs language:shell and returns stdout (D-EXEC-BARE-1: no head line on exit 0 with the whole output)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "echo hi" }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.equal(out.text, "hi\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // D-EXEC-BARE-1: exit 0 with the whole output in the reply carries nothing the head line adds.
  test("[D-EXEC-BARE-1] exit 0 and the whole output in the reply: the reply is the output, no head line", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex-bare-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "echo hi" }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.equal(out.text, "hi\n");
      assert.equal(out.sandboxBytes, 3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[D-EXEC-BARE-1] the head line stays where it carries information: empty output, non-zero exit, summary echo", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex-head-"));
    try {
      const none = await ctxExecute.handler({ language: "shell", code: "true" }, ctxFor(root));
      assert.equal(none.text, "exit 0 · 0 B\n");
      const bad = await ctxExecute.handler({ language: "shell", code: "echo boom >&2; exit 3" }, ctxFor(root));
      assert.ok(bad.text.startsWith("exit 3 · "));
      assert.ok(bad.text.includes("boom"));
      const echo = await ctxExecute.handler({ language: "shell", code: "echo hi", summary: true }, ctxFor(root));
      assert.ok(echo.text.startsWith("exit 0 · 3 B\n"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // D-EXEC-PREVIEW-1: output kept in the store gets a preview of EXEC_PREVIEW_BYTES; the rest is one ctx_search away.
  test("[D-EXEC-PREVIEW-1] output over OUTPUT_CAP: the reply is a head, a preview of at most EXEC_PREVIEW_BYTES and the search pointer; every marker is found", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex-prev-"));
    try {
      const code = `for (let i = 0; i < 4000; i++) console.log((i === 0 ? "FIRSTMARK-a1 " : i === 2000 ? "MIDMARK-b2 " : i === 3999 ? "LASTMARK-c3 " : "") + "row " + i + " " + "p".repeat(40))`;
      const out = await ctxExecute.handler({ language: "javascript", code }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.ok(out.text.startsWith("exit 0 · "), "kept in the store: the head names the full size");
      assert.ok(Buffer.byteLength(out.text, "utf8") <= C.EXEC_PREVIEW_BYTES, "reply " + Buffer.byteLength(out.text, "utf8") + " B");
      assert.ok(out.text.includes("ctx_search({queries:["), "the reply names how to reach the rest");
      for (const m of ["FIRSTMARK-a1", "MIDMARK-b2", "LASTMARK-c3"]) {
        const hit = await ctxSearch.handler({ queries: [m], scope: "session" }, ctxFor(root));
        assert.ok(hit.text.includes(m), m + " found by search");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute rejects an unknown field (UNKNOWN_FIELD)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex2-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "echo hi", bogus: 1 }, ctxFor(root));
      assert.equal(out.isError, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute returns NO_RUNTIME for an unknown language not on PATH", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex3-"));
    try {
      const out = await ctxExecute.handler({ language: "not-a-real-lang-xyz", code: "x" }, ctxFor(root));
      assert.equal(out.isError, true);
      assert.ok(/No .* runtime on PATH/.test(out.text));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute rejects file paths outside the project (OUTSIDE_ROOT)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex4-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "cat $CTX_FILE", file: "../../etc/passwd" }, ctxFor(root));
      assert.equal(out.isError, true);
      assert.ok(/outside the project/.test(out.text));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute times out at EXEC_TIMEOUT_MS ceiling and returns a TIMEOUT error for a short override", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "cm-ex5-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "sleep 5", timeoutMs: 200 }, ctxFor(root));
      assert.equal(out.isError, true);
      assert.ok(/Timed out after/.test(out.text));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute background:true returns 'started in background, pid <n>' with isError:false", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "cm-ex6-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "sleep 1", background: true }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.ok(/^started in background, pid \d+$/.test(out.text));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // D-R44-OC-BG-1 (#1310, opencode-2): Bun keeps "--" in execArgv, so the launcher drops it before it adds its own.
  test("[D-R44-OC-BG-1] ctx_execute background:true runs under a host whose execArgv holds the -- separator", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "cm-bg-"));
    try {
      const mark = join(root, "ran.txt");
      const { LAUNCHER } = await import("../src/core/tools/execute.ts");
      const r = spawnSync(process.execPath, ["-e", 'process.execArgv.push("--");' + LAUNCHER, "--", "start", "", "/bin/sh", "-c", `echo ok > ${mark}`], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(Number.isSafeInteger(Number(r.stdout)), r.stdout);
      for (let i = 0; i < 50 && !existsSync(mark); i++) await new Promise((res) => setTimeout(res, 100));
      assert.ok(existsSync(mark));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_execute large output is cut to OUTPUT_CAP with a selection, not a raw mid-chunk truncation", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ex7-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: `node -e "process.stdout.write('x'.repeat(${C.OUTPUT_CAP * 2}))"` }, ctxFor(root));
      assert.ok(Buffer.byteLength(out.text, "utf8") <= C.OUTPUT_CAP);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ---- M2-R4 named rows (14a-issue-cases.md GP4/GP5, DEVIATIONS D-M2-T10-1, D-M2-arch-2) ----

  function tmpRoot(tag) {
    return realpathSync(mkdtempSync(join(tmpdir(), "cm-r4-" + tag + "-")));
  }

  function alive(pid) {
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  async function waitFor(fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return fn();
  }

  test("[M2] GP4/exit1-stderr-is-error: exit 1 with stderr is isError; grep no-match exit 1 is not", async () => {
    if (process.platform === "win32") return;
    const root = tmpRoot("e1");
    try {
      const bad = await ctxExecute.handler({ language: "shell", code: "echo boom >&2; exit 1" }, ctxFor(root));
      assert.equal(bad.isError, true);
      assert.ok(bad.text.startsWith("exit 1"));
      assert.ok(bad.text.includes("boom"));
      const js = await ctxExecute.handler({ language: "javascript", code: "console.error('jsboom'); process.exit(1)" }, ctxFor(root));
      assert.equal(js.isError, true);
      const grep = await ctxExecute.handler({ language: "shell", code: "printf 'a\\n' | grep zzz" }, ctxFor(root));
      assert.equal(grep.isError, false);
      assert.ok(grep.text.startsWith("exit 1"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/project-cwd-temp-dir-cleanup: runs in the project cwd, temp dir gone afterward", async () => {
    const root = tmpRoot("cwd");
    try {
      const out = await ctxExecute.handler({
        language: "javascript",
        code: "console.log('CWD=' + process.cwd()); console.log('SCRIPT=' + process.argv[1]);",
      }, ctxFor(root));
      assert.equal(out.isError, false);
      const line = (k) => out.text.split("\n").find((l) => l.startsWith(k)).slice(k.length);
      assert.equal(realpathSync(line("CWD=")), root);
      const scriptDir = dirname(line("SCRIPT="));
      assert.equal(scriptDir.startsWith(root), false); // temp file lives outside the project
      assert.equal(existsSync(scriptDir), false); // and its dir is removed after the run
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const how of ["cancel", "timeout"]) {
    test(`[M2] GP4/hung-execute-cancel-kills-tree (${how}): tree dead and error reply within 2 s`, async () => {
      if (process.platform === "win32") return;
      const root = tmpRoot("hung");
      try {
        const pidFile = join(root, "child.pid");
        const ac = new AbortController();
        const ctx = { ...ctxFor(root), signal: ac.signal };
        const code = `sleep 999 & echo $! > "${pidFile}"; wait`;
        const call = ctxExecute.handler({ language: "shell", code, ...(how === "timeout" ? { timeoutMs: 500 } : {}) }, ctx);
        assert.ok(await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "", 5000));
        const pid = Number(readFileSync(pidFile, "utf8").trim());
        const t0 = Date.now();
        if (how === "cancel") ac.abort();
        const out = await call;
        assert.ok(Date.now() - t0 <= 2000, "reply within 2 s");
        assert.equal(out.isError, true);
        assert.ok(how === "cancel" ? out.text === C.CANCELLED_LINE : out.text.startsWith("Timed out after 500 ms"));
        assert.ok(await waitFor(() => !alive(pid), 2000 - (Date.now() - t0)), "grandchild dead within 2 s");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test("[M2] GP4/host-rpc-timeout-governs-no-default: no short server default (Q8, D-M2-arch-2)", async () => {
    if (process.platform === "win32") return;
    const parsed = ctxExecuteSchema.parse({ language: "shell", code: "true" });
    assert.equal(parsed.timeoutMs, undefined); // no zod .default(): the only server timer is EXEC_TIMEOUT_MS
    assert.equal(ctxExecuteSchema.safeParse({ language: "shell", code: "true", timeoutMs: C.EXEC_TIMEOUT_MS + 1 }).success, false);
    const root = tmpRoot("nodef");
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "sleep 3; echo done-xyz" }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.ok(out.text.includes("done-xyz"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const EMOJI = "\u{1F600}"; // 4 UTF-8 bytes, a surrogate pair in UTF-16

  test("[M2] GP4/code-point-safe-truncation-cut: capBytes at every offset inside an emoji leaves no lone surrogate", () => {
    for (let pad = 0; pad < 4; pad += 1) {
      const s = "a".repeat(pad) + EMOJI.repeat(8);
      for (let cap = 1; cap < Buffer.byteLength(s); cap += 1) {
        const r = capBytes(s, cap);
        assert.ok(r.text.isWellFormed(), `pad ${pad} cap ${cap}`);
        assert.ok(Buffer.byteLength(r.text) <= cap);
        assert.ok(s.startsWith(r.text));
      }
    }
  });

  test("[M2] GP4/surrogate-safe-truncation: ctx_execute output with emoji over the cap is valid UTF-8", async () => {
    const root = tmpRoot("sur");
    try {
      // One long line (no chunk boundary) and many lines, each with an emoji at odd byte offsets.
      for (const code of [
        `process.stdout.write("x" + "${EMOJI}".repeat(${C.OUTPUT_CAP}))`,
        `for (let i = 0; i < 4000; i++) console.log("r" + i + " ${EMOJI}".repeat(1 + (i % 7)))`,
      ]) {
        const out = await ctxExecute.handler({ language: "javascript", code }, ctxFor(root));
        assert.equal(out.isError, false);
        assert.ok(out.text.isWellFormed());
        assert.ok(Buffer.byteLength(out.text) <= C.OUTPUT_CAP);
        assert.ok(Buffer.from(out.text, "utf8").toString("utf8") === out.text);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M2] GP5/auto-index-exec-output: a 50 KB output with no intent is found by ctx_search as a session hit", async () => {
    const root = tmpRoot("auto");
    try {
      const code = `for (let i = 0; i < 1000; i++) console.log("line " + i + " " + "p".repeat(50) + (i === 777 ? " zebraquartz" : ""))`;
      const out = await ctxExecute.handler({ language: "javascript", code }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.ok(out.sandboxBytes >= 50_000);
      assert.ok(Buffer.byteLength(out.text) <= C.OUTPUT_CAP);
      const hit = await ctxSearch.handler({ queries: ["zebraquartz"], scope: "session" }, ctxFor(root));
      assert.equal(hit.isError, false);
      assert.ok(hit.text.includes("zebraquartz"));
      assert.ok(hit.text.includes("ctx_execute:"), "hit carries the ctx_execute source label");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PRD-v2 section 9: ctx_batch", { concurrency: CONC }, () => {
  // Unit tests for src/core/tools/batch.ts (impl/04 §3). ctx_batch: {commands[], queries[]}.
  // Concurrent: each test makes its own temp root and does not touch process.env or cwd.
  function ctxFor(root) {
    return {
      project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId: "s1", turn: 1, signal: new AbortController().signal,
    };
  }

  test("ctx_batch (D-BATCH-OWN-SOURCE-1): a second call in the same turn answers from its own source, not the earlier call's", async () => {
    // Tester finding 1 (next.34): two sequential calls, one session, one turn; the second reply held phase=A too.
    const root = mkdtempSync(join(tmpdir(), "cm-bown-"));
    try {
      const ctx = ctxFor(root);
      const a = await ctxBatch.handler({ commands: ["printf 'N1_SNAPSHOT phase=A queries=51 elapsed_ms=150\\n'"], queries: ["N1_SNAPSHOT"] }, ctx);
      assert.ok(a.text.includes("phase=A"), a.text);
      const b = await ctxBatch.handler({ commands: ["printf 'N1_SNAPSHOT phase=B queries=4 elapsed_ms=26\\n'"], queries: ["N1_SNAPSHOT"] }, ctx);
      assert.ok(b.text.includes("phase=B"), b.text);
      assert.ok(!b.text.includes("phase=A"), b.text);
      // Widen only when the own source has no hit: a query only the first call can answer still finds it.
      const c = await ctxBatch.handler({ commands: ["echo other-zzz"], queries: ["elapsed_ms=150"] }, ctx);
      assert.ok(c.text.includes("phase=A"), c.text);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_batch (D-BATCH-OWN-SOURCE-1): each call's label is unique and readable by ctx_search source", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-blab-"));
    try {
      const ctx = ctxFor(root);
      const big = "b".repeat(200);
      const a = await ctxBatch.handler({ commands: ["echo one-aaa", "echo two-" + big], queries: ["one-aaa"] }, ctx);
      const b = await ctxBatch.handler({ commands: ["echo one-aaa", "echo three-" + big], queries: ["one-aaa"] }, ctx);
      const la = a.text.match(/source:"([^"]+)"/)[1];
      const lb = b.text.match(/source:"([^"]+)"/)[1];
      assert.notEqual(la, lb);
      assert.ok(la.startsWith("ctx_batch:1"), la);
      const { ctxSearch } = await import("../src/core/tools/search.ts");
      const sb = await ctxSearch.handler({ queries: ["three"], source: lb }, ctx);
      assert.ok(sb.text.includes("three-"), sb.text);
      const sa = await ctxSearch.handler({ queries: ["three"], source: la }, ctx);
      assert.ok(!sa.text.includes("three-"), sa.text);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_batch is not readOnly (it runs commands)", () => {
    assert.equal(ctxBatch.name, "ctx_batch");
    assert.equal(ctxBatch.readOnly, false);
  });

  test("ctxBatch runs each command and answers each query from the combined output", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ba-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo alpha", "echo beta"], queries: ["alpha"] }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.ok(out.text.includes("alpha"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxBatch rejects an unknown field", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ba2-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo a"], queries: ["a"], bogus: 1 }, ctxFor(root));
      assert.equal(out.isError, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxBatch rejects an empty commands or queries array (min(1))", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ba3-"));
    try {
      const out = await ctxBatch.handler({ commands: [], queries: ["a"] }, ctxFor(root));
      assert.equal(out.isError, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxBatch deduplicates a chunk returned as the top hit for two queries", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ba4-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo shared-term-xyz"], queries: ["shared-term-xyz", "shared"] }, ctxFor(root));
      const occurrences = out.text.split("shared-term-xyz").length - 1;
      assert.ok(occurrences <= 2); // heading + body, not duplicated per query
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxBatch reply carries no counts line (D-BATCH-FRAMING-1); a failing last command adds its exit code", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ba5-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo a", "echo b; exit 2"], queries: ["a"] }, ctxFor(root));
      assert.equal(out.text.includes("command(s)"), false);
      assert.ok(out.text.startsWith("exit 2\n## a\n"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("runPool capped === (jobs >= concurrency) (TECH-SPEC §5, #915, #932)", async () => {
    const { runPool } = await import("../src/core/tools/batch.ts");
    const job = (v) => () => Promise.resolve(v);
    assert.equal((await runPool([job(1)], 2, () => false)).capped, false);
    assert.equal((await runPool([job(1), job(2)], 2, () => false)).capped, true);
    const r = await runPool([job(1), job(2), job(3)], 1, (v) => v === 2);
    assert.deepEqual(r.results, [1, 2]); // a job after a stop never starts
    assert.equal(r.capped, true);
  });

  // D-CI-BATCH-DEADLINE-1: no wall-clock budget decides this test (a loaded Windows runner needs 2-3.5 s to start
  // Git Bash, run taskkill and drain the pipes, CI run 40613700600). The child sleeps CHILD_SLEEP_S, so "bounded"
  // means the handler returned while the child still had that long to run; "never start" is proven by a marker
  // file the third command would write. The test timeout only ends a run whose deadline never fires.
  const CHILD_SLEEP_S = 3600;
  test("ctx_batch: one deadline bounds the whole handler, later commands never start (Q8, #947)", { timeout: 120000 }, async () => {
    const { runBatch } = await import("../src/core/tools/batch.ts");
    const root = mkdtempSync(join(tmpdir(), "cm-ba6-"));
    const marker = join(root, "third-command-ran");
    try {
      const start = Date.now();
      const out = await runBatch({ commands: ["echo before-xyz", "sleep " + CHILD_SLEEP_S, "echo after-xyz; echo ran > '" + marker.split("\\").join("/") + "'"], queries: ["before-xyz", "after-xyz"] }, ctxFor(root), 800, C.RETENTION_SIZE_CAP_BYTES);
      assert.ok(Date.now() - start < CHILD_SLEEP_S * 1000);
      assert.equal(out.isError, false);
      assert.ok(out.text.includes("Timed out after 800 ms"));
      assert.ok(out.text.includes("before-xyz"));
      assert.equal(out.text.includes("\nafter-xyz"), false);
      assert.equal(existsSync(marker), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_batch: reply stays inside OUTPUT_CAP and every output byte is indexed", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ba7-"));
    try {
      const out = await ctxBatch.handler({ commands: ["for i in $(seq 1 3000); do echo \"row $i needle\"; echo; done"], queries: ["needle", "row"] }, ctxFor(root));
      assert.ok(Buffer.byteLength(out.text) <= 16384);
      assert.ok(out.text.startsWith("## needle\n")); // D-BATCH-FRAMING-1: no counts line, exit 0 is not printed
      assert.ok(out.text.trimEnd().endsWith('source:"ctx_batch:1:1"})'));
      assert.ok(out.sandboxBytes > 16384);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // D-BATCH-FRAMING-1: the reply repeats nothing the model already holds (its own command and query counts)
  // and prints the `more:` pointer only when output was left out. A reply whose output is all shown is
  // the query headings plus the output: the floor of a tiny reply.
  test("ctx_batch (D-BATCH-FRAMING-1): tiny outputs come back plain, no counts line, no pointer", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-bf1-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo alpha-xyz", "echo beta-xyz"], queries: ["alpha-xyz", "beta-xyz"] }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.equal(out.text, "## alpha-xyz\nalpha-xyz\n## beta-xyz\nbeta-xyz");
      assert.equal(out.text.includes("command(s)"), false);
      assert.equal(out.text.includes("more:"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_batch (D-BATCH-FRAMING-1): output no query showed is printed whole when it is smaller than the pointer", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-bf2-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo one-aaa", "echo two-bbb"], queries: ["one-aaa"] }, ctxFor(root));
      assert.equal(out.text, "## one-aaa\none-aaa\n$ echo two-bbb\ntwo-bbb"); // nothing left out, no pointer
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_batch (D-BATCH-FRAMING-1): the pointer is printed when unshown output is larger than the pointer", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-bf4-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo one-aaa", "echo two-" + "b".repeat(200)], queries: ["one-aaa"] }, ctxFor(root));
      assert.equal(out.text, '## one-aaa\none-aaa\nmore: ctx_search({queries:[...], source:"ctx_batch:1:1"})');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctx_batch (D-BATCH-FRAMING-1): the exit line appears only when the last command did not exit 0", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-bf3-"));
    try {
      const out = await ctxBatch.handler({ commands: ["echo fail-xyz; exit 3"], queries: ["fail-xyz"] }, ctxFor(root));
      assert.equal(out.text, "exit 3\n## fail-xyz\nfail-xyz");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ---- M2-R4 named rows (14a-issue-cases.md GP4/GP5/GP8, DEVIATIONS D-M2-T11-1, D-M2-R4-1) ----

  function tmpRoot(tag) {
    return realpathSync(mkdtempSync(join(tmpdir(), "cm-r4b-" + tag + "-")));
  }

  test("[M2] GP8/runpool-capped-flag: 2 jobs at concurrency 8 -> capped false; jobs >= slots -> true", async () => {
    const job = (v) => () => Promise.resolve(v);
    assert.equal((await runPool([job(1), job(2)], 8, () => false)).capped, false);
    assert.equal((await runPool(Array.from({ length: 8 }, (_, i) => job(i)), 8, () => false)).capped, true);
    const r = await runPool([job(1), job(2)], 8, () => false);
    assert.deepEqual(r.results, [1, 2]);
  });

  test("[M2] GP5/batch-execute-dedup-section: two queries on the same chunk show it once", async () => {
    const root = tmpRoot("dd");
    try {
      const out = await ctxBatch.handler({ commands: ["echo 'alpha zebraquartz omega'"], queries: ["zebraquartz", "alpha zebraquartz"] }, ctxFor(root));
      assert.equal(out.isError, false);
      const bodyLines = out.text.split("\n").filter((l) => l === "alpha zebraquartz omega");
      assert.equal(bodyLines.length, 1);
      const second = out.text.split("\n");
      const i = second.indexOf("## alpha zebraquartz");
      assert.equal(second[i + 1], "No new section.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M2] GP5/batch-index-byte-budget: indexed bytes stay within the budget and the reply says it was cut", async () => {
    const root = tmpRoot("bb");
    try {
      const budget = 1048576; // the tool passes RETENTION_SIZE_CAP_BYTES; a small budget keeps the test fast
      const cmd = `node -e "for (let i = 0; i < 60000; i++) console.log('row ' + i + ' needle ' + 'x'.repeat(40))"`;
      const out = await runBatch({ commands: [cmd], queries: ["needle"] }, ctxFor(root), C.EXEC_TIMEOUT_MS, budget);
      assert.equal(out.isError, false);
      assert.ok(out.sandboxBytes > budget);
      const line = out.text.split("\n").find((l) => l.startsWith("Indexed "));
      assert.ok(line, "reply states the cut");
      const [indexed, total] = line.slice("Indexed ".length).split(" of ").map((p) => Number.parseInt(p, 10));
      assert.ok(indexed > 0 && indexed <= budget, `indexed ${indexed} <= ${budget}`);
      assert.ok(total > budget);
      assert.equal(line.includes("Timed out"), false); // the budget, not the deadline, ended the ingest
      assert.ok(Buffer.byteLength(out.text) <= C.OUTPUT_CAP);
      assert.ok(C.RETENTION_SIZE_CAP_BYTES >= budget);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/batch-timeout-bounds-whole-handler: a never-ending huge output returns within the bound plus a small margin", async () => {
    if (process.platform === "win32") return;
    const root = tmpRoot("tb");
    try {
      const bound = 1500;
      const flood = `node -e "setInterval(() => process.stdout.write('needle '.repeat(15000) + '\\n'), 5)"`;
      const t0 = Date.now();
      const out = await runBatch({ commands: ["echo first-xyz", flood, "echo never-xyz"], queries: ["first-xyz", "needle"] }, ctxFor(root), bound, C.RETENTION_SIZE_CAP_BYTES);
      const took = Date.now() - t0;
      assert.ok(took < bound + 1500, `took ${took} ms`);
      assert.equal(out.isError, false);
      assert.ok(out.text.includes("Timed out after " + bound + " ms"));
      assert.ok(out.text.includes("first-xyz"));
      assert.equal(out.text.includes("\nnever-xyz"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PRD-v2 section 9: runProcess", () => {
  // Unit tests for src/core/sandbox/spawn.ts (impl/03 §5).
  // runProcess(argv, {cwd,env,signal,timeoutMs,stdin}): never rejects; resolves {stdout,stderr,exitCode,killed}.
  // Serial: timing tests (kill after timeout and abort) stay free of load from sibling tests in the block.
  const sh = () => findRuntime("shell");

  test("runProcess runs a command and returns its stdout", async () => {
    const bin = sh();
    const out = await runProcess([bin, "-c", "echo hi"], { cwd: process.cwd(), env: buildChildEnv(process.env), signal: new AbortController().signal, timeoutMs: 5000 });
    assert.equal(out.stdout.toString("utf8").trim(), "hi");
    assert.equal(out.exitCode, 0);
    assert.equal(out.killed, null);
  });

  test("runProcess shell:false never routes through a parent shell string", async () => {
    const bin = sh();
    const out = await runProcess([bin, "-c", "echo $0"], { cwd: process.cwd(), env: buildChildEnv(process.env), signal: new AbortController().signal, timeoutMs: 5000 });
    assert.ok(out.stdout.length > 0);
  });

  test("runProcess kills the child on timeout and marks killed:'timeout'", async () => {
    if (process.platform === "win32") return;
    const bin = sh();
    const out = await runProcess([bin, "-c", "sleep 30"], { cwd: process.cwd(), env: buildChildEnv(process.env), signal: new AbortController().signal, timeoutMs: 300 });
    assert.equal(out.killed, "timeout");
  });

  test("runProcess kills the child on abort signal and marks killed:'cancel'", async () => {
    if (process.platform === "win32") return;
    const bin = sh();
    const ac = new AbortController();
    const p = runProcess([bin, "-c", "sleep 30"], { cwd: process.cwd(), env: buildChildEnv(process.env), signal: ac.signal, timeoutMs: 60000 });
    setTimeout(() => ac.abort(), 200);
    const out = await p;
    assert.equal(out.killed, "cancel");
  });

  test("runProcess never rejects, even for a bad cwd", async () => {
    const bin = sh();
    await assert.doesNotReject(
      runProcess([bin, "-c", "echo x"], { cwd: "/this/path/does/not/exist/cm", env: buildChildEnv(process.env), signal: new AbortController().signal, timeoutMs: 5000 })
    );
  });

  test("runProcess writes o.stdin to the child's stdin", async () => {
    const bin = sh();
    const out = await runProcess([bin, "-c", "cat"], { cwd: process.cwd(), env: buildChildEnv(process.env), signal: new AbortController().signal, timeoutMs: 5000, stdin: "piped-in\n" });
    assert.equal(out.stdout.toString("utf8"), "piped-in\n");
  });

  test("runProcess leaves stdout/stderr uncapped (OUTPUT_CAP applied by the caller, not here)", async () => {
    const bin = sh();
    const big = "x".repeat(20000);
    const out = await runProcess([bin, "-c", `printf '%s' "$BIG"`], { cwd: process.cwd(), env: buildChildEnv(process.env, { BIG: big }), signal: new AbortController().signal, timeoutMs: 5000 });
    assert.equal(out.stdout.length, big.length);
  });
});

describe("PRD-v2 section 9: runProcess settles on exit (D-1337-EXIT-SETTLE-1, #1337)", () => {
  // #1337 (spimm, Pi-Bolt 1.1.4 on Windows): `sleep 600 & echo hi` never settled because only "close" settled and the
  // survivor held the pipes. The reporter's target: about 300 ms. Serial: timing.
  const run = (code, o = {}) => runProcess([findRuntime("shell"), "-c", code], { cwd: process.cwd(), env: buildChildEnv(process.env), signal: new AbortController().signal, timeoutMs: 20000, ...o });
  const ctxFor = (root) => ({
    project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
    sessionId: "s1", turn: 1, signal: new AbortController().signal,
  });

  test("a background survivor that holds the pipes does not hold the call", async () => {
    if (process.platform === "win32") return;
    const t0 = Date.now();
    const r = await run("sleep 600 & echo hi");
    const ms = Date.now() - t0;
    assert.equal(r.stdout.toString("utf8").trim(), "hi");
    assert.equal(r.exitCode, 0);
    assert.equal(r.killed, null);
    assert.equal(r.held, true);
    assert.ok(ms < 1500, `settled in ${ms} ms`);
  });

  test("a command with no survivor settles at once and is not marked held", async () => {
    const r = await run("echo plain");
    assert.equal(r.held, undefined);
    assert.equal(r.stdout.toString("utf8").trim(), "plain");
  });

  test("a large output that is still flowing is kept whole next to a survivor", async () => {
    if (process.platform === "win32") return;
    const r = await run("seq 1 400000; sleep 30 &");
    const lines = r.stdout.toString("utf8").trim().split("\n");
    assert.equal(lines.length, 400000);
    assert.equal(lines[399999], "400000");
  });

  test("the survivor is stopped with its process group", async () => {
    if (process.platform === "win32") return;
    const r = await run("sleep 600 & echo $!");
    const pid = Number(r.stdout.toString("utf8").trim());
    assert.ok(Number.isSafeInteger(pid) && pid > 1);
    const deadline = Date.now() + C.KILL_GRACE_MS + 2500;
    let alive = true;
    while (alive && Date.now() < deadline) {
      try { process.kill(pid, 0); await new Promise((res) => setTimeout(res, 50)); } catch { alive = false; }
    }
    assert.equal(alive, false, "survivor still running");
  });

  test("a timeout with a survivor that holds the pipes returns TIMEOUT, not a hang", async () => {
    if (process.platform === "win32") return;
    const t0 = Date.now();
    const r = await run("sleep 600 & sleep 30", { timeoutMs: 300 });
    assert.equal(r.killed, "timeout");
    assert.ok(Date.now() - t0 < 4000);
  });

  test("an abort with a survivor that holds the pipes returns cancel, not a hang", async () => {
    if (process.platform === "win32") return;
    const ac = new AbortController();
    const p = run("sleep 600 & sleep 30", { signal: ac.signal });
    setTimeout(() => ac.abort(), 200);
    const t0 = Date.now();
    const r = await p;
    assert.equal(r.killed, "cancel");
    assert.ok(Date.now() - t0 < 4000);
  });

  test("ctx_execute names the held pipes in its reply and keeps the output so far", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "cm-1337-"));
    try {
      const out = await ctxExecute.handler({ language: "shell", code: "sleep 600 & echo hi" }, ctxFor(root));
      assert.match(out.text, /^hi\n/);
      assert.ok(out.text.includes(C.BACKGROUND_HOLD_NOTE));
      assert.ok(C.BACKGROUND_HOLD_NOTE.includes("was stopped")); // D-R53-REVIEW-1: runProcess kills the group, the note says so
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("PRD-v2 section 9: killTree never blocks the host loop (D-1337-EXIT-SETTLE-1, #1337)", () => {
  test("the Windows branch spawns taskkill async: no execFileSync / spawnSync in kill.ts", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/core/sandbox/kill.ts", import.meta.url)), "utf8");
    assert.equal(/execFileSync|spawnSync|execSync/.test(src), false);
    assert.ok(src.includes('spawn("taskkill"'));
  });

  test("win32 code path: killTree returns void and never throws, even when taskkill is missing", () => {
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      assert.equal(killTree(999999), undefined);
    } finally {
      Object.defineProperty(process, "platform", real);
    }
  });
});

describe("PRD-v2 section 9: killTree", () => {
  // Unit tests for src/core/sandbox/kill.ts (impl/03 §4).
  // killTree(pid): void. SIGTERM, then SIGKILL after KILL_GRACE_MS, process-group on POSIX.
  // Serial: SIGTERM then SIGKILL grace timing.
  test("killTree terminates a running process group within KILL_GRACE_MS", async () => {
    if (process.platform === "win32") return;
    const child = spawn("sh", ["-c", "trap '' TERM; sleep 30"], { detached: true, stdio: "ignore" });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    killTree(child.pid);
    const result = await Promise.race([
      exited.then(() => "exited"),
      new Promise((r) => setTimeout(() => r("timeout"), C.KILL_GRACE_MS + 1500)),
    ]);
    assert.equal(result, "exited");
  });

  test("killTree never throws when the target pid is already gone", () => {
    assert.doesNotThrow(() => killTree(999999));
  });

  test("killTree returns void immediately, not a promise", () => {
    const ret = killTree(999999);
    assert.equal(ret, undefined);
  });
});

describe("PRD-v2 section 9: child env", () => {
  // Unit tests for src/core/sandbox/env.ts (impl/03 §1).
  // buildChildEnv(parent, extra?): Record<string,string>; strips NODE_OPTIONS/preload vars.
  // Serial: a test sets process.env.PATH for its duration.
  test("buildChildEnv copies parent keys and drops undefined values", () => {
    const out = buildChildEnv({ FOO: "bar", GONE: undefined, PATH: "/usr/bin" });
    assert.equal(out.FOO, "bar");
    assert.equal(out.PATH, "/usr/bin");
    assert.equal("GONE" in out, false);
  });

  test("buildChildEnv strips NODE_OPTIONS and NODE_*_OPTIONS vars", () => {
    const out = buildChildEnv({ NODE_OPTIONS: "--require=x", NODE_FOO_OPTIONS: "y", NODE_REPL_EXTERNAL_MODULE: "z", NODE_V8_COVERAGE: "dir", PATH: "/bin" });
    assert.equal("NODE_OPTIONS" in out, false);
    assert.equal("NODE_FOO_OPTIONS" in out, false);
    assert.equal("NODE_REPL_EXTERNAL_MODULE" in out, false);
    assert.equal("NODE_V8_COVERAGE" in out, false);
    assert.equal(out.PATH, "/bin");
  });

  test("buildChildEnv strips BUN_OPTIONS and DENO_OPTIONS", () => {
    const out = buildChildEnv({ BUN_OPTIONS: "a", DENO_OPTIONS: "b", PATH: "/bin" });
    assert.equal("BUN_OPTIONS" in out, false);
    assert.equal("DENO_OPTIONS" in out, false);
  });

  test("buildChildEnv applies extra overrides last", () => {
    const out = buildChildEnv({ PATH: "/bin", CTX_FILE: "old" }, { CTX_FILE: "/proj/a.txt" });
    assert.equal(out.CTX_FILE, "/proj/a.txt");
  });

  test("buildChildEnv returns a plain string-keyed object with no undefined values", () => {
    const out = buildChildEnv(process.env);
    for (const v of Object.values(out)) assert.equal(typeof v, "string");
  });

  test("buildChildEnv is pure: never throws, never mutates the parent object", () => {
    const parent = { PATH: "/bin", NODE_OPTIONS: "x" };
    const copy = { ...parent };
    buildChildEnv(parent);
    assert.deepEqual(parent, copy);
  });

  // ---- M2-R3: env passes through spawn env; NODE_OPTIONS / preload never reach a child (GP4 rows). ----

  const run = (cmd, env) =>
    runProcess([findRuntime("shell"), "-c", cmd], { cwd: process.cwd(), env, signal: new AbortController().signal, timeoutMs: 10000 });

  test("buildChildEnv strips preload vars by case-insensitive name (Windows env names ignore case)", () => {
    const out = buildChildEnv({ Node_Options: "--require=x", node_foo_options: "y", Bun_Options: "z", Path: "C:\\bin" });
    assert.equal("Node_Options" in out, false);
    assert.equal("node_foo_options" in out, false);
    assert.equal("Bun_Options" in out, false);
    assert.equal(out.Path, "C:\\bin");
  });

  test("[M2] GP4/windows-path-inherit (unit): the child env keeps the parent PATH key and value verbatim", () => {
    const winPath = "C:\\Program Files\\GitHub CLI;C:\\Program Files\\Git\\usr\\bin;C:\\Windows\\system32";
    const out = buildChildEnv({ Path: winPath, NODE_OPTIONS: "x" });
    assert.equal(out.Path, winPath);
    assert.deepEqual(Object.keys(out), ["Path"]);
  });

  test("[M2] GP4/windows-inherited-path (unit): a shell child resolves a binary the way the parent PATH does", async () => {
    if (process.platform === "win32") return;
    const dir = mkdtempSync(join(tmpdir(), "cm-r3-path-"));
    const bin = join(dir, "ghx");
    writeFileSync(bin, "#!/bin/sh\necho ghx-version 1\n");
    chmodSync(bin, 0o755);
    const before = process.env.PATH;
    try {
      process.env.PATH = dir + ":" + before;
      const r = await run("command -v ghx && ghx --version", buildChildEnv(process.env));
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.toString("utf8"), bin + "\nghx-version 1\n");
    } finally {
      process.env.PATH = before;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/node-options-no-leak-across-servers (unit): a stale --require from an exited server does not break node -v", async () => {
    if (process.platform === "win32") return;
    const parent = { ...process.env, NODE_OPTIONS: "--require /nonexistent/cm-fs-preload-1.js" };
    const r = await run("node -v", buildChildEnv(parent));
    assert.equal(r.exitCode, 0, r.stderr.toString("utf8"));
    assert.equal(r.stderr.toString("utf8").includes("MODULE_NOT_FOUND"), false);
    assert.ok(r.stdout.toString("utf8").startsWith("v"));
  });

  test("[M2] GP4/no-preload-marker-leak-grandchild (unit): a node grandchild sees no NODE_OPTIONS and writes empty stderr", async () => {
    if (process.platform === "win32") return;
    const parent = { ...process.env, NODE_OPTIONS: "--no-warnings" };
    const r = await run(`node -e 'process.stderr.write(process.env.NODE_OPTIONS ?? ""); process.stdout.write("gc-ok")'`, buildChildEnv(parent));
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr.length, 0);
    assert.equal(r.stdout.toString("utf8"), "gc-ok");
    assert.equal(r.stdout.length, 5, "byte count still reported");
  });

  test("[M2] GP4/recreate-preload-temp-file (unit): runs need no preload temp file, so an OS temp sweep cannot break the next run", async () => {
    if (process.platform === "win32") return;
    const preload = () => readdirSync(tmpdir()).filter((n) => n.startsWith("cm-fs-preload-"));
    const seen = preload();
    for (let i = 0; i < 2; i++) {
      const env = buildChildEnv(process.env);
      for (const v of Object.values(env)) assert.equal(v.includes("cm-fs-preload-"), false);
      const r = await run("node -e 'process.stdout.write(\"run\")'", env);
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.toString("utf8"), "run");
    }
    assert.deepEqual(preload(), seen, "the sandbox writes no preload file");
  });

  test("[M2] GP4/shell-syntax-with-spawn-env (unit): compound shell syntax runs when env goes through spawn env", async () => {
    const r = await run("if true; then echo ok; fi", buildChildEnv(process.env, { CTX_FILE: "/proj/a.txt" }));
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.toString("utf8"), "ok\n");
  });
});

describe("PRD-v2 section 9: runtime lookup", () => {
  // Unit tests for src/core/sandbox/runtimes.ts (impl/03 §2).
  // findRuntime(lang): string | null. Lazy PATH lookup, no caching, no boot probes.
  // Serial: tests set process.env.PATH and spoof process.platform.
  test("findRuntime('javascript') resolves node on PATH", () => {
    const p = findRuntime("javascript");
    assert.ok(p, "expected a node path to be found");
  });

  test("findRuntime('shell') resolves sh on POSIX", () => {
    if (process.platform === "win32") return;
    const p = findRuntime("shell");
    assert.ok(p && p.endsWith("sh"));
  });

  test("findRuntime returns null for an unknown runtime not on PATH", () => {
    const p = findRuntime("definitely-not-a-real-runtime-xyz");
    assert.equal(p, null);
  });

  test("findRuntime re-walks PATH every call (no cross-call cache)", () => {
    if (process.platform === "win32") return;
    const dir = mkdtempSync(join(tmpdir(), "cm-rt-"));
    const bin = join(dir, "myrt");
    writeFileSync(bin, "#!/bin/sh\necho hi\n");
    chmodSync(bin, 0o755);
    try {
      const before = process.env.PATH;
      process.env.PATH = dir;
      const found = findRuntime("myrt");
      process.env.PATH = before;
      assert.equal(found, bin);
      const afterRestore = findRuntime("myrt");
      assert.equal(afterRestore, null, "must not remember the earlier PATH");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("findRuntime accepts a #!/bin/sh shim with the exec bit set, without parsing the shebang", () => {
    if (process.platform === "win32") return;
    const dir = mkdtempSync(join(tmpdir(), "cm-rt2-"));
    const bin = join(dir, "shimmy");
    writeFileSync(bin, "#!/bin/sh\nexit 0\n");
    chmodSync(bin, 0o755);
    try {
      const before = process.env.PATH;
      process.env.PATH = dir;
      const found = findRuntime("shimmy");
      process.env.PATH = before;
      assert.equal(found, bin);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("findRuntime never spawns a child process to look up a binary (no where/which shell-out)", () => {
    // Structural: findRuntime must be synchronous (a spawn-based lookup would be async).
    const start = findRuntime("javascript");
    assert.equal(typeof start === "string" || start === null, true);
  });

  // ---- M2-R3: Windows lookup rules, shim interpreter, windowsHide on every spawn (GP4 rows). ----

  // Run `fn` as if on win32. path stays POSIX, so each case uses one PATH directory.
  async function asWindows(env, fn) {
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    const saved = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT };
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    Object.assign(process.env, env);
    try {
      return await fn();
    } finally {
      Object.defineProperty(process, "platform", real);
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  function tmpBin(files) {
    const dir = mkdtempSync(join(tmpdir(), "cm-r3-win-"));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return dir;
  }

  const SHIM = "#!/bin/sh\necho shim-ran \"$@\"\n";
  const PATHEXT = ".COM;.EXE;.BAT;.CMD";

  test("[M2] GP4/windows-shim-interpreter (unit): on Windows an extensionless #!/bin/sh python shim is found", async () => {
    if (process.platform === "win32") return;
    const dir = tmpBin({ python: SHIM });
    try {
      const found = await asWindows({ PATH: dir, PATHEXT }, () => findRuntime("python"));
      assert.equal(found, join(dir, "python"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/windows-pyenv-shim (unit): pyenv-win shims dir (python + python.bat) resolves to the sh shim, not the .bat", async () => {
    if (process.platform === "win32") return;
    const dir = tmpBin({ python: SHIM, "python.bat": "@echo off\r\n" });
    try {
      const found = await asWindows({ PATH: dir, PATHEXT }, () => findRuntime("python"));
      assert.equal(found, join(dir, "python"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("findRuntime on Windows prefers python.exe over a shim in the same directory", async () => {
    if (process.platform === "win32") return;
    const dir = tmpBin({ python: SHIM, "python.exe": "" });
    try {
      const found = await asWindows({ PATH: dir, PATHEXT }, () => findRuntime("python"));
      assert.equal(found, join(dir, "python.exe"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("findRuntime on Windows rejects a .cmd/.bat file: shell:false cannot start it", async () => {
    if (process.platform === "win32") return;
    const dir = tmpBin({ "node.cmd": "@echo off\r\n", "mytool.bat": "@echo off\r\n" });
    try {
      await asWindows({ PATH: dir, PATHEXT }, () => {
        assert.equal(findRuntime("javascript"), null);
        assert.equal(findRuntime("mytool"), null);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("findRuntime on Windows tries PATHEXT entries for a name with no extension", async () => {
    if (process.platform === "win32") return;
    const dir = tmpBin({ "node.EXE": "" });
    try {
      const found = await asWindows({ PATH: dir, PATHEXT }, () => findRuntime("javascript"));
      assert.equal(found, join(dir, "node.EXE"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[M7] GP4/windows-pathext-beats-shim (unit): a PATHEXT hit wins over an extensionless shim in the same PATH walk (D-M7-W2-1)", async () => {
    if (process.platform === "win32") return;
    // MSYS2 puts an extensionless `git` (a binary sh cannot run: exit 126) before Git's git.exe.
    const shimDir = tmpBin({ git: SHIM });
    const exeDir = tmpBin({ "git.EXE": "" });
    try {
      const found = await asWindows({ PATH: shimDir + ":" + exeDir, PATHEXT }, () => findRuntime("git"));
      assert.equal(found, join(exeDir, "git.EXE"));
      const onlyShim = await asWindows({ PATH: shimDir, PATHEXT }, () => findRuntime("git"));
      assert.equal(onlyShim, join(shimDir, "git"));
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
      rmSync(exeDir, { recursive: true, force: true });
    }
  });

  test("[M7] findRuntime reads PATH from the env it is given, not only process.env (D-M7-W2-1)", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-w2-env-"));
    const bin = join(dir, "only-here");
    writeFileSync(bin, "#!/bin/sh\nexit 0\n");
    chmodSync(bin, 0o755);
    try {
      assert.equal(findRuntime("only-here"), null);
      assert.equal(findRuntime("only-here", { PATH: dir, PATHEXT: process.env.PATHEXT }), bin);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/windows-shim-interpreter (unit): runProcess runs a Windows shim through sh found on PATH", async () => {
    if (process.platform === "win32") return;
    // D-VT-WINBASH-1: the interpreter is Git Bash, found from git.exe: <dir>/cmd/git.exe -> <dir>/bin/bash.exe.
    const dir = tmpBin({ python: SHIM });
    mkdirSync(join(dir, "cmd")); mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "cmd", "git.exe"), "");
    symlinkSync(findRuntime("shell"), join(dir, "bin", "bash.exe"));
    try {
      const r = await asWindows({ PATH: dir + ":" + join(dir, "cmd"), PATHEXT }, () =>
        runProcess([join(dir, "python"), "code.py"], { cwd: dir, env: { PATH: dir }, signal: new AbortController().signal, timeoutMs: 10000 }));
      assert.equal(r.exitCode, 0, r.stderr.toString("utf8"));
      assert.equal(r.stdout.toString("utf8"), "shim-ran code.py\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/windows-pyenv-shim (unit): with no sh on PATH a Windows shim resolves exitCode null, so the caller's error names the shim", async () => {
    if (process.platform === "win32") return;
    const dir = tmpBin({ python: SHIM });
    try {
      const r = await asWindows({ PATH: dir, PATHEXT }, () =>
        runProcess([join(dir, "python"), "code.py"], { cwd: dir, env: { PATH: dir }, signal: new AbortController().signal, timeoutMs: 10000 }));
      assert.deepEqual({ exitCode: r.exitCode, killed: r.killed, out: r.stdout.length + r.stderr.length }, { exitCode: null, killed: null, out: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("runProcess never rejects when spawn throws synchronously (e.g. Windows EINVAL, bad argv)", async () => {
    const r = await runProcess(["/bin/sh\0bad", "-c", "true"], { cwd: process.cwd(), env: {}, signal: new AbortController().signal, timeoutMs: 5000 });
    assert.equal(r.exitCode, null);
    assert.equal(r.killed, null);
  });

  test("[M2] GP4/windows-hide-console-on-spawn (unit): every spawn call in src/core/sandbox sets windowsHide: true; runtimes.ts spawns nothing", () => {
    const dir = fileURLToPath(new URL("../src/core/sandbox/", import.meta.url));
    let calls = 0;
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(join(dir, name), "utf8");
      const n = (src.match(/\b(spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\(/g) ?? []).length;
      const hidden = (src.match(/windowsHide: true/g) ?? []).length;
      assert.ok(hidden >= n, `${name}: ${n} spawn call(s), ${hidden} windowsHide: true`);
      calls += n;
    }
    assert.ok(calls >= 2, "runProcess and killTree spawn");
    assert.equal(readFileSync(join(dir, "runtimes.ts"), "utf8").includes("child_process"), false);
  });
});

describe("PRD-v2 section 9: Windows Git Bash lookup (D-VT-WINBASH-1)", () => {
  // D-VT-WINBASH-1: on Windows the shell is Git Bash, found from the installed Git. A bash.exe on PATH is never used:
  // %LOCALAPPDATA%\Microsoft\WindowsApps\bash.exe is an App Execution Alias (node cannot spawn it: EACCES) and
  // C:\Windows\System32\bash.exe is the WSL launcher (a different filesystem). Fake layouts run on every OS (platform spoof).
  // Serial: asWindows spoofs process.platform and process.env for each case.
  const PATHEXT = ".COM;.EXE;.BAT;.CMD";

  async function asWindows(env, fn) {
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    const saved = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT };
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    Object.assign(process.env, env);
    try {
      return await fn();
    } finally {
      Object.defineProperty(process, "platform", real);
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  // Layout of Git for Windows: <root>\cmd\git.exe, <root>\bin\git.exe, <root>\bin\bash.exe, <root>\mingw64\bin\git.exe.
  function layout() {
    const top = mkdtempSync(join(tmpdir(), "cm-gb-"));
    const apps = join(top, "Microsoft", "WindowsApps");
    const sys32 = join(top, "Windows", "System32");
    const git = join(top, "Program Files", "Git");
    for (const d of [apps, sys32, join(git, "cmd"), join(git, "bin"), join(git, "mingw64", "bin")]) mkdirSync(d, { recursive: true });
    writeFileSync(join(apps, "bash.exe"), "");
    writeFileSync(join(sys32, "bash.exe"), "");
    writeFileSync(join(git, "bin", "bash.exe"), "");
    writeFileSync(join(git, "bin", "git.exe"), "");
    writeFileSync(join(git, "cmd", "git.exe"), "");
    writeFileSync(join(git, "mingw64", "bin", "git.exe"), "");
    return { top, apps, sys32, git, bash: join(git, "bin", "bash.exe") };
  }
  const sep = delimiter; // the spoof keeps the real path module: ":" on POSIX, ";" on Windows

  test("[VT-WIN] shell on Windows: the WindowsApps alias dir first, Git dir later -> Git's bash.exe", async () => {
    const l = layout();
    try {
      const found = await asWindows({ PATH: [l.apps, l.sys32, join(l.git, "cmd")].join(sep), PATHEXT }, () => findRuntime("shell"));
      assert.equal(found, l.bash);
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] shell on Windows: git.exe in <root>\\bin and in <root>\\mingw64\\bin both find <root>\\bin\\bash.exe", async () => {
    const l = layout();
    try {
      for (const dir of [join(l.git, "bin"), join(l.git, "mingw64", "bin")]) {
        const found = await asWindows({ PATH: [l.apps, dir].join(sep), PATHEXT }, () => findRuntime("shell"));
        assert.equal(found, l.bash, dir);
      }
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] shell on Windows: only WindowsApps and System32 bash.exe on PATH, no Git -> null (never the alias)", async () => {
    const l = layout();
    try {
      const found = await asWindows({ PATH: [l.apps, l.sys32].join(sep), PATHEXT }, () => findRuntime("shell"));
      assert.equal(found, null);
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] shell on Windows: a bash.exe in a PATH dir is not used even when no alias dir is named; Git without bash -> null", async () => {
    const l = layout();
    try {
      rmSync(l.bash);
      const other = join(l.top, "msys64");
      mkdirSync(other);
      writeFileSync(join(other, "bash.exe"), "");
      const found = await asWindows({ PATH: [other, join(l.git, "cmd")].join(sep), PATHEXT }, () => findRuntime("shell"));
      assert.equal(found, null);
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] languages bash and sh on Windows use the same resolver as shell", async () => {
    const l = layout();
    try {
      const env = { PATH: [l.apps, join(l.git, "cmd")].join(sep), PATHEXT };
      const got = await asWindows(env, () => [findRuntime("bash"), findRuntime("sh")]);
      assert.deepEqual(got, [l.bash, l.bash]);
      const none = await asWindows({ PATH: l.apps, PATHEXT }, () => [findRuntime("bash"), findRuntime("sh")]);
      assert.deepEqual(none, [null, null]);
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] shell on Windows reads the env it is given", async () => {
    const l = layout();
    try {
      const found = await asWindows({ PATH: l.apps, PATHEXT }, () => findRuntime("shell", { PATH: join(l.git, "cmd"), PATHEXT }));
      assert.equal(found, l.bash);
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] POSIX shell lookup is unchanged: sh", () => {
    if (process.platform === "win32") return;
    const p = findRuntime("shell");
    assert.ok(p && p.endsWith("sh"));
  });

  test("[VT-WIN] NO_GIT_BASH is one line that names the fix", () => {
    assert.equal(formatError("NO_GIT_BASH", {}), "Git Bash not found. Fix: install Git for Windows.");
  });

  test("[VT-WIN] ctx_execute shell on Windows with no Git Bash: the one NO_GIT_BASH line, no other shell is tried", async () => {
    const l = layout();
    const root = mkdtempSync(join(tmpdir(), "cm-gb-x-"));
    try {
      const ctx = { project: { projectKey: "1".repeat(16), projectDir: join(root, "p"), dbPath: join(root, "p", "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" }, sessionId: "s1", turn: 1, signal: new AbortController().signal };
      const out = await asWindows({ PATH: [l.apps, l.sys32].join(sep), PATHEXT }, () => ctxExecute.handler({ language: "shell", code: "echo hi" }, ctx));
      assert.equal(out.isError, true);
      assert.equal(out.text, "Git Bash not found. Fix: install Git for Windows.");
    } finally { rmSync(l.top, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });

  test("[VT-WIN] ctx_batch on Windows with no Git Bash: each command block carries the NO_GIT_BASH line", async () => {
    const l = layout();
    const root = mkdtempSync(join(tmpdir(), "cm-gb-b-"));
    try {
      const ctx = { project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" }, sessionId: "s1", turn: 1, signal: new AbortController().signal };
      const out = await asWindows({ PATH: [l.apps, l.sys32].join(sep), PATHEXT }, () => runBatch({ commands: ["echo hi"], queries: ["hi"] }, ctx, 5000, 1 << 20));
      assert.ok(out.text.includes("Git Bash not found. Fix: install Git for Windows."), out.text);
      assert.equal(out.text.includes("No shell runtime"), false);
    } finally { rmSync(l.top, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });

  test("[VT-WIN] doctor D11 shell: PASS names the resolved shell; Windows without Git Bash is FAIL with the fix", async () => {
    const l = layout();
    try {
      const ok = await asWindows({ PATH: [l.apps, join(l.git, "cmd")].join(sep), PATHEXT }, () => checkShell(process.env));
      assert.deepEqual(ok, { id: "D11", label: "shell", status: "PASS", detail: "Git Bash: " + l.bash });
      const bad = await asWindows({ PATH: [l.apps, l.sys32].join(sep), PATHEXT }, () => checkShell(process.env));
      assert.deepEqual(bad, { id: "D11", label: "shell", status: "FAIL", detail: "Git Bash not found", fixCommand: "install Git for Windows" });
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });

  test("[VT-WIN] doctor D11 shell on POSIX with no sh on PATH is FAIL naming sh", () => {
    if (process.platform === "win32") return;
    const row = checkShell({ PATH: "/nonexistent-dir" });
    assert.equal(row.status, "FAIL");
    assert.equal(row.id, "D11");
  });

  // Windows-only (CI windows-latest has Git for Windows): the resolved bash starts and runs a command.
  test("[VT-WIN] Windows only: the resolved shell is Git's bash.exe and runs a command", { skip: process.platform !== "win32" && "Windows only" }, async () => {
    const bash = findRuntime("shell");
    assert.ok(bash, "Git for Windows must be installed");
    const lower = bash.toLowerCase();
    assert.equal(lower.includes("windowsapps"), false);
    assert.equal(lower.includes("\\system32\\"), false);
    const r = await runProcess([bash, "-c", "echo git-bash-ok"], { cwd: process.cwd(), env: process.env, signal: new AbortController().signal, timeoutMs: 20000 });
    assert.equal(r.exitCode, 0, r.stderr.toString("utf8"));
    assert.equal(r.stdout.toString("utf8").trim(), "git-bash-ok");
  });

  test("[VT-WIN] Windows only: ctx_execute shell and ctx_batch run through Git Bash", { skip: process.platform !== "win32" && "Windows only" }, async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-gb-w-"));
    try {
      const ctx = { project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" }, sessionId: "s1", turn: 1, signal: new AbortController().signal };
      const out = await ctxExecute.handler({ language: "shell", code: "echo hi-exec" }, ctx);
      assert.equal(out.isError, false, out.text);
      assert.ok(out.text.includes("hi-exec"));
      const b = await runBatch({ commands: ["echo hi-batch"], queries: ["hi-batch"] }, ctx, 20000, 1 << 20);
      assert.equal(b.isError, false, b.text);
      assert.ok(b.text.includes("hi-batch"));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("[W-CODEX-6] findRuntime on Windows: a PATH entry wrapped in double quotes is found (fake win32 on any OS)", async () => {
    const l = layout();
    try {
      const quoted = [`"${l.apps}"`, `"${join(l.git, "cmd")}"`].join(sep);
      assert.equal(await asWindows({ PATH: quoted, PATHEXT }, () => findRuntime("shell")), l.bash, "shell: git.exe in a quoted entry");
      assert.equal(await asWindows({ PATH: `"${join(l.git, "bin")}"`, PATHEXT: ".exe;.cmd" }, () => findRuntime("git")), join(l.git, "bin", "git.exe"), "any runtime in a quoted entry");
    } finally { rmSync(l.top, { recursive: true, force: true }); }
  });
});
