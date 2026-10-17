// GP4 — ctx_execute / ctx_batch (14-tests.md §4). M2 case.
// Case source: TECH-SPEC §6.2 GP4 row. covers: src/core/tools/execute.ts, src/core/sandbox/.
// Imports M0 harness files + release-out/server.mjs; fails until those land.
// M2-M2-E1: ports the 14a GP4 rows from tests/v2/tools/execute.test.mjs,
// tests/v2/tools/batch.test.mjs and tests/v2/sandbox/env.test.mjs into black-box cases that spawn
// release-out/server.mjs only (no src/ import, GS4). The windows-* cases skip on POSIX (D-M2-arch-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IS_WIN = process.platform === "win32";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";
import { checkGolden } from "../harness/golden.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_BUNDLE = path.join(REPO_ROOT, "release-out", "server.mjs");

// The server needs a project (impl/11 §5 step 1): one fresh project dir and HOME per file, so no
// reply depends on the runner's own HOME or cwd.
const PROJECT = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp4-proj-")));
execFileSync("git", ["init", "-q", PROJECT]);
const HOME = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp4-home-")));
const ENV = { ...process.env, HOME, USERPROFILE: HOME, CLAUDE_PROJECT_DIR: PROJECT };

// impl/14 §4 steps 5-6: the shared golden check (UPDATE_GOLDEN=1 records), with this file's
// project and home dirs replaced by <proj>/<home>.
function golden(name, value) {
  checkGolden("GP4", name, normalize(value, { home: HOME, proj: PROJECT }));
}

async function callExecute(args, env) {
  const client = spawnBundle(SERVER_BUNDLE, env ?? ENV);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  const reply = await client.request("tools/call", { name: "ctx_execute", arguments: args });
  await client.close();
  return reply;
}

async function callBatch(args, env) {
  const client = spawnBundle(SERVER_BUNDLE, env ?? ENV);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  const reply = await client.request("tools/call", { name: "ctx_batch", arguments: args });
  await client.close();
  return reply;
}

test("[M2] GP4/exit-class-grep-exit-1-not-error", async () => {
  const reply = await callExecute({ language: "shell", code: "echo nope | grep yes" });
  golden("exit-class-grep-exit-1-not-error", reply);
});

test("[M2] GP4/output-cut-is-code-point-safe", async () => {
  const reply = await callExecute({ language: "javascript", code: "process.stdout.write('é'.repeat(20000))" });
  assert.ok(!JSON.stringify(reply).includes("\\ufffd"), "no replacement character from a mid-codepoint cut");
  golden("output-cut-is-code-point-safe", reply);
});

test("[M2] GP4/env-via-spawn-env-no-node-options-leak", async () => {
  const reply = await callExecute({ language: "shell", code: "echo \"NODE_OPTIONS=[$NODE_OPTIONS]\"" });
  golden("env-via-spawn-env-no-node-options-leak", reply);
});

test("[M2] GP4/deleted-cwd-no-ansi", async () => {
  const reply = await callExecute({ language: "shell", code: "echo x", file: "nonexistent-deleted-cwd-marker.txt" });
  golden("deleted-cwd-no-ansi", reply);
});

test("[M2] GP4/cancel-kills-child-tree-1s", async () => {
  // MCP: a receiver sends no response for a cancelled request, so the case checks the effect: the
  // child would write MARK 2 s after start; cancel goes at 0.5 s; MARK must not exist at 3 s.
  const mark = path.join(PROJECT, "cancel-mark.txt");
  const code = "setTimeout(() => require('fs').writeFileSync(" + JSON.stringify(mark) + ", 'x'), 2000)";
  const client = spawnBundle(SERVER_BUNDLE, ENV);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  client.request("tools/call", { name: "ctx_execute", arguments: { language: "javascript", code } }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  client.notify("notifications/cancelled", { requestId: 2 }); // id 1 = initialize, id 2 = this tools/call
  await new Promise((r) => setTimeout(r, 2500));
  const start = Date.now();
  await client.request("ping", {});
  const pingMs = Date.now() - start;
  await client.close();
  assert.ok(pingMs < 1000, `server must stay responsive after cancel, ping took ${pingMs}ms`);
  golden("cancel-kills-child-tree-1s", { markWritten: existsSync(mark) });
});

test("[M2] GP4/cold-start-no-path-probes", async () => {
  // #1159: no PATH probing at cold start. A wall-clock bound ("< 1s") is a proxy that a loaded
  // machine fails even with no probes (D-M2-F1-4), so the probes themselves are counted: a preload
  // in the server process logs every node:fs call on a path under one of 400 bogus PATH entries.
  // initialize must log none; the first ctx_execute (lazy lookup, impl/03 §2) must log some, which
  // proves the counter sees real probes.
  const marker = "cm-gp4-nonexistent-path-entry-";
  const bloatedPath = Array.from({ length: 400 }, (_, i) => path.join(tmpdir(), `${marker}${i}`)).join(path.delimiter);
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp4-probe-")));
  const probeLog = path.join(scratch, "probes.log");
  const preload = path.join(scratch, "probe.mjs");
  writeFileSync(probeLog, "");
  writeFileSync(preload, `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const append = fs.appendFileSync;
const MARK = ${JSON.stringify(marker)};
const LOG = ${JSON.stringify(probeLog)};
// The calls a PATH probe can make: stat/access/exists on a candidate file, sync or async.
for (const key of ["statSync", "lstatSync", "accessSync", "existsSync", "stat", "lstat", "access"]) {
  const fn = fs[key];
  fs[key] = function (...args) {
    if (typeof args[0] === "string" && args[0].includes(MARK)) append(LOG, key + "\\n");
    return fn.apply(this, args);
  };
}
syncBuiltinESMExports();
`);
  const bloatedEnv = {
    ...ENV,
    PATH: `${bloatedPath}${path.delimiter}${ENV.PATH ?? ""}`,
    NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
  };
  const client = spawnBundle(SERVER_BUNDLE, bloatedEnv);
  try {
    await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
    const atBoot = readFileSync(probeLog, "utf8");
    assert.equal(atBoot, "", `cold start probed PATH entries before the initialize reply: ${atBoot.split("\n").length - 1} calls`);
    const reply = await client.request("tools/call", { name: "ctx_execute", arguments: { language: "shell", code: "echo hi" } });
    assert.equal(reply.isError, false, `first ctx_execute failed: ${reply.content?.[0]?.text}`);
    assert.notEqual(readFileSync(probeLog, "utf8"), "", "probe counter saw no PATH lookup on first use; the check is blind");
  } finally {
    await client.close();
  }
});

test("[M2] GP4/background-no-timeout-hang", async (t) => {
  // #975: background:true returns without waiting for the child. Event order, not a stopwatch on the
  // reply (D-M2-F1-4): the child blocks until the test creates `go` and only then writes `done`. A
  // handler that waits for the child can reply only after the child's own release (`go`, or its
  // 600-step self-release as a hang guard), so `done` would exist at reply time. A correct handler
  // replies while the child is still blocked.
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp4-bg-")));
  const go = path.join(scratch, "go");
  const done = path.join(scratch, "done");
  t.after(() => writeFileSync(go, ""));
  const code = `i=0; while [ ! -e '${go}' ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done; : > '${done}'`;
  const reply = await callExecute({ language: "shell", code, background: true });
  assert.equal(existsSync(done), false, "background:true replied only after the child finished");
  assert.match(reply.content?.[0]?.text ?? "", /^started in background, pid \d+$/);
  const pid = (reply.content?.[0]?.text ?? "").slice("started in background, pid ".length);
  checkGolden("GP4", "background-no-timeout-hang", normalize(reply, { pid, home: HOME, proj: PROJECT }));
});

test("[M2] GP4/batch-node-options-compound-cmd", async () => {
  const client = spawnBundle(SERVER_BUNDLE, ENV);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  const reply = await client.request("tools/call", { name: "ctx_batch", arguments: { commands: ["echo a && echo b"], queries: ["a"] } });
  await client.close();
  golden("batch-node-options-compound-cmd", reply);
});

// ---- M2-M2-E1 rows (14a-issue-cases.md GP4; ports tests/v2/tools/execute.test.mjs,
// tests/v2/tools/batch.test.mjs, tests/v2/sandbox/env.test.mjs) ----

test("[M2] GP4/exit1-stderr-is-error", async () => {
  if (IS_WIN) return;
  const bad = await callExecute({ language: "shell", code: "echo boom >&2; exit 1" });
  assert.equal(bad.isError, true);
  const grep = await callExecute({ language: "shell", code: "printf 'a\\n' | grep zzz" });
  assert.equal(grep.isError, false);
  golden("exit1-stderr-is-error", { bad, grep });
});

test("[M2] GP4/project-cwd-temp-dir-cleanup", async () => {
  const reply = await callExecute({
    language: "javascript",
    code: "console.log('CWD=' + process.cwd()); console.log('SCRIPT=' + process.argv[1]);",
  });
  assert.equal(reply.isError, false);
  const text = reply.content?.[0]?.text ?? "";
  const line = (k) => text.split("\n").find((l) => l.startsWith(k)).slice(k.length);
  assert.equal(realpathSync(line("CWD=")), PROJECT);
  const scriptDir = path.dirname(line("SCRIPT="));
  assert.equal(scriptDir.startsWith(PROJECT), false); // temp file lives outside the project
  assert.equal(existsSync(scriptDir), false); // and its dir is removed after the run
  // The per-run temp dir name is random (ctx-exec-<random>); golden on a value with that one
  // field replaced by a stable placeholder so the case is deterministic across runs.
  const stableText = text.replace(scriptDir, "<tmp-script-dir>");
  golden("project-cwd-temp-dir-cleanup", { ...reply, content: [{ ...reply.content[0], text: stableText }] });
});

test("[M2] GP4/hung-execute-cancel-kills-tree", async () => {
  if (IS_WIN) return;
  // #959: ctx_execute runs sleep 999; the timeout hits; the tree is dead and an error returns
  // within 2 s. The hung-execute-cancel-kills-tree-1s case above covers the cancel path; this one
  // covers the timeoutMs path (D-M2-arch-1 names both as GP4 rows the unit test already splits).
  const t0 = Date.now();
  const reply = await callExecute({ language: "shell", code: "sleep 999", timeoutMs: 500 });
  const tookMs = Date.now() - t0;
  assert.ok(tookMs <= 2000, `reply within 2 s, took ${tookMs}ms`);
  assert.equal(reply.isError, true);
  assert.match(reply.content?.[0]?.text ?? "", /^Timed out after 500 ms/);
  golden("hung-execute-cancel-kills-tree", reply);
});

test("[M2] GP4/host-rpc-timeout-governs-no-default", async () => {
  if (IS_WIN) return;
  // Q8 / D-M2-arch-2: with no timeoutMs the only server timer is EXEC_TIMEOUT_MS, so a 3 s sleep
  // is not killed by any short server default.
  const reply = await callExecute({ language: "shell", code: "sleep 3; echo done-xyz" });
  assert.equal(reply.isError, false);
  assert.ok((reply.content?.[0]?.text ?? "").includes("done-xyz"));
  golden("host-rpc-timeout-governs-no-default", reply);
});

const EMOJI = "\u{1F600}"; // 4 UTF-8 bytes, a surrogate pair in UTF-16

test("[M2] GP4/code-point-safe-truncation-cut", async () => {
  // Black-box variant of the unit capBytes-at-every-offset case (that one imports src/core/sandbox
  // /cap.ts directly and stays in tests/v2): here, output padded so an emoji sits exactly at a
  // byte offset near the cap, verified only by the invariant any cut must hold (no lone surrogate,
  // valid UTF-8), since OUTPUT_CAP is a src/ constant e2e/ may not import (GS4).
  const reply = await callExecute({ language: "javascript", code: `process.stdout.write("a".repeat(3) + "${EMOJI}".repeat(400000))` });
  const text = reply.content?.[0]?.text ?? "";
  assert.ok(text.isWellFormed(), "no lone surrogate from a mid-codepoint cut");
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  golden("code-point-safe-truncation-cut", reply);
});

test("[M2] GP4/surrogate-safe-truncation", async () => {
  const reply = await callExecute({ language: "javascript", code: `for (let i = 0; i < 4000; i++) console.log("r" + i + " ${EMOJI}".repeat(1 + (i % 7)))` });
  const text = reply.content?.[0]?.text ?? "";
  assert.equal(reply.isError, false);
  assert.ok(text.isWellFormed());
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  golden("surrogate-safe-truncation", reply);
});

test("[M2] GP4/shell-syntax-with-spawn-env", async () => {
  const reply = await callBatch({ commands: ["if true; then echo ok; fi"], queries: ["ok"] });
  assert.equal(reply.isError, false);
  golden("shell-syntax-with-spawn-env", reply);
});

test("[M2] GP4/no-preload-marker-leak-grandchild", async () => {
  if (IS_WIN) return;
  // #1068: a batch command spawns a node grandchild that asserts its own NODE_OPTIONS is empty;
  // the grandchild's stderr stays empty and the byte count is still reported.
  const cmd = `node -e 'process.stderr.write(process.env.NODE_OPTIONS ?? ""); process.stdout.write("gc-ok")'`;
  const reply = await callBatch({ commands: [cmd], queries: ["gc-ok"] });
  assert.equal(reply.isError, false);
  golden("no-preload-marker-leak-grandchild", reply);
});

test("[M2] GP4/node-options-no-leak-across-servers", async () => {
  if (IS_WIN) return;
  // #951: server A exits with a stale --require on NODE_OPTIONS; server B must still run `node -v`
  // with no MODULE_NOT_FOUND, proving NODE_OPTIONS never leaks across separate server processes.
  const envA = { ...ENV, NODE_OPTIONS: "--require /nonexistent/cm-fs-preload-1.js" };
  await callBatch({ commands: ["true"], queries: ["x"] }, envA).catch(() => {}); // server A starts, runs, exits
  const replyB = await callBatch({ commands: ["node -v"], queries: ["v"] }, ENV); // server B, clean env
  assert.equal(replyB.isError, false);
  assert.ok(!JSON.stringify(replyB).includes("MODULE_NOT_FOUND"));
  golden("node-options-no-leak-across-servers", replyB);
});

test("[M2] GP4/recreate-preload-temp-file", async () => {
  if (IS_WIN) return;
  // #969: the sandbox writes no preload temp file at all, so an OS temp sweep between two runs
  // cannot break the next one — checked by running twice and confirming no cm-fs-preload-* file
  // ever appears in the OS temp dir.
  const preloadFiles = () => readdirSync(tmpdir()).filter((n) => n.startsWith("cm-fs-preload-"));
  const before = preloadFiles();
  const r1 = await callExecute({ language: "javascript", code: "process.stdout.write('run1')" });
  const r2 = await callExecute({ language: "javascript", code: "process.stdout.write('run2')" });
  assert.equal(r1.isError, false);
  assert.equal(r2.isError, false);
  assert.deepEqual(preloadFiles(), before, "the sandbox writes no preload file");
  golden("recreate-preload-temp-file", { r1, r2 });
});

test("[M2] GP4/batch-timeout-bounds-whole-handler", async () => {
  if (IS_WIN) return;
  // #947: ctx_batch has no per-call timeout field (04-tools-exec.md §3.1) — the shared ceiling is
  // EXEC_TIMEOUT_MS (600000 ms), a src/ constant this file may not import or override (GS4), so
  // the literal "returns within 5 s" bound from the unit test (which calls runBatch(..., 1500, ...)
  // directly) cannot be reproduced through the public tool. See DEVIATIONS row in this commit's
  // body. This case instead proves the mechanism end to end at the tool boundary: a huge but
  // finite flood followed by another command still returns well inside a generous sane ceiling
  // (15 s, two orders of magnitude under EXEC_TIMEOUT_MS), so the whole-handler loop is not stuck
  // waiting out a per-command sleep.
  const t0 = Date.now();
  const reply = await callBatch({
    commands: ["echo first-xyz", "node -e \"for (let i=0;i<20000;i++) process.stdout.write('needle '.repeat(50))\"", "echo second-xyz"],
    queries: ["first-xyz", "needle", "second-xyz"],
  });
  const tookMs = Date.now() - t0;
  assert.ok(tookMs < 15000, `whole batch handler took ${tookMs}ms`);
  assert.equal(reply.isError, false);
  golden("batch-timeout-bounds-whole-handler", reply);
});

// ---- windows-only rows (D-M2-arch-1: run only on the Windows CI job, skip on POSIX) ----

test("[M2] GP4/windows-hide-console-on-spawn", { skip: !IS_WIN }, async () => {
  // #1154: every probe/child spawn sets windowsHide so no console window appears. Not directly
  // observable from stdout; checked by a plain spawn completing cleanly (no stray window means no
  // hang waiting on operator input, D-M2-R3-2/R3-3).
  const reply = await callExecute({ language: "shell", code: "echo ok" });
  assert.equal(reply.isError, false);
  golden("windows-hide-console-on-spawn", reply);
});

test("[M2] GP4/windows-inherited-path", { skip: !IS_WIN }, async () => {
  // #1218: a shell command resolves a binary the same way the parent shell's PATH would.
  const reply = await callExecute({ language: "shell", code: "where node" });
  assert.equal(reply.isError, false);
  golden("windows-inherited-path", reply);
});

test("[M2] GP4/windows-path-inherit", { skip: !IS_WIN }, async () => {
  // #1217: ctx_execute shell resolves gh the same way.
  const reply = await callExecute({ language: "shell", code: "gh --version" });
  golden("windows-path-inherit", reply);
});

test("[M2] GP4/windows-pyenv-shim", { skip: !IS_WIN }, async () => {
  // #1208: with only a pyenv-win shim on PATH, ctx_execute python either runs or the error names
  // the shim (D-M2-R3-2).
  const reply = await callExecute({ language: "python", code: "print('ok')" });
  assert.ok(reply.isError === false || (reply.content?.[0]?.text ?? "").toLowerCase().includes("python"));
  golden("windows-pyenv-shim", reply);
});

test("[M2] GP4/windows-shim-interpreter", { skip: !IS_WIN }, async () => {
  // #1209: the only python on PATH is a #!/bin/sh shim; ctx_execute still runs the code (D-M2-R3-3
  // spawn-via-shell fallback for an extensionless Windows shim).
  const reply = await callExecute({ language: "python", code: "print('shim-ok')" });
  assert.equal(reply.isError, false);
  golden("windows-shim-interpreter", reply);
});
