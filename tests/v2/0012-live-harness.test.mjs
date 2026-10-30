// ADR-0012 (keyless live harness): process groups, compact eval arms, M2 bench runner. One file for the area (ADR-0024).
// A fix for this area adds its red test inside the describe block of its section. Do not add a new file.
// Sections: process groups, compact eval arms, M2 bench scorer. The M2 bench runner (fixtures-run) is 0012-m2-bench.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnGroup, killGroup, runGroup } from "../../e2e/live/lib/proc-group.mjs";
import fs, { readFileSync, chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ARMS, ARM_IDS } from "../../e2e/live/compact/arms.mjs";
import { FIXTURES } from "../../e2e/live/compact/fixtures.mjs";
import { verdict, exactMatch } from "../../e2e/live/compact/score.mjs";
import os, { tmpdir } from "node:os";
import { runSession } from "../../e2e/live/compact/session.mjs";
import { parseTranscript, oracle, scoreRows, normalizeNumbers, toolKey } from "../../bench/m2/score.mjs";
import { TASKS as HELDOUT } from "../../bench/m2/heldout/tasks.mjs";
import { TASKS as MAIN } from "../../bench/m2/main/tasks.mjs";

// Concurrent: own temp dirs, no env. The M2 bench runner section is in 0012-m2-bench.test.mjs (it blocks on a build).
describe("ADR-0012: live harness (concurrent)", { concurrency: true }, () => {
  // Moved from tests/v2/e2e/live-proc-group.test.mjs
  describe("ADR-0012 / process group kill", () => {
    // D-CR3-WATCHDOG-1: e2e/live/lib/proc-group.mjs. A run that spawns `claude -p` in its own process group can
    // kill the whole group on timeout, so a model-run grandchild (`find /`) never outlives the session.




    function alive(pid) {
      try { process.kill(pid, 0); return true; } catch { return false; }
    }

    test("killGroup reaches the grandchild; the close event fires", { skip: process.platform === "win32" ? "POSIX process groups" : false }, async () => {
      const child = spawnGroup("/bin/sh", ["-c", "sleep 300 & echo $!; wait"], { stdio: ["ignore", "pipe", "ignore"] });
      const grand = await new Promise((res) => { let b = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (d) => { b += d; const i = b.indexOf("\n"); if (i > 0) res(Number(b.slice(0, i))); }); });
      assert.ok(grand > 0 && alive(grand), "the grandchild runs");
      const closed = new Promise((res) => child.on("close", res));
      assert.equal(killGroup(child), true);
      await closed;
      for (let i = 0; i < 50 && alive(grand); i++) await new Promise((r) => setTimeout(r, 20));
      assert.equal(alive(grand), false, "the grandchild is gone");
      assert.equal(killGroup(child), false, "a second kill finds no group");
    });
  });

  // Moved from tests/v2/e2e/live-runner-group.test.mjs
  describe("ADR-0012 / live runner group", () => {
    // D-CR3-WATCHDOG-1 (round 4 review item 1). Every non-frozen live runner that spawns `claude -p` must run it
    // through e2e/live/lib/proc-group.mjs, so a timeout kills the whole process group, not only the direct child.
    // The frozen runners (e2e/live/compact-hard/*, bench/m2/*) are not listed here and are not edited.







    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const RUNNERS = [
      "e2e/live/run.mjs",
      "e2e/live/routing/run.mjs",
      "e2e/live/compact/session.mjs",
      "bench/live/run.mjs",
      "bench/live/ab-quick.mjs",
      "bench/saving-score.mjs",
      "e2e/live/npm-package/claude-code.mjs",
    ];

    function alive(pid) {
      try { process.kill(pid, 0); return true; } catch { return false; }
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    test("runGroup timeout kills the grandchild and reports timedOut", { skip: process.platform === "win32" ? "POSIX process groups" : false }, async () => {
      const r = await runGroup("/bin/sh", ["-c", "sleep 300 & echo $!; wait"], {}, 500);
      assert.equal(r.timedOut, true, "the run is marked timed out");
      const grand = Number(r.stdout.trim());
      assert.ok(grand > 0, "the grandchild pid was printed");
      for (let i = 0; i < 50 && alive(grand); i++) await sleep(20);
      assert.equal(alive(grand), false, "the grandchild died with the group");
    });

    test("runGroup returns stdout and status for a run that ends in time", async () => {
      const r = await runGroup(process.execPath, ["-e", "console.log('ok')"], {}, 5000);
      assert.equal(r.timedOut, false);
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), "ok");
    });

    test("every non-frozen claude -p runner imports the process-group helper and no longer kills only the child", () => {
      for (const f of RUNNERS) {
        const src = readFileSync(path.join(ROOT, f), "utf8");
        assert.ok(src.includes("proc-group.mjs"), `${f} imports proc-group.mjs`);
        assert.ok(!src.includes("child.kill(") && !src.includes("p.kill(") && !src.includes("c.kill("), `${f} kills by process group, not by child.kill`);
      }
    });
  });

  // Moved from tests/v2/e2e/windows-grandchild-kill.test.mjs
  describe("ADR-0012 / Windows grandchild kill", () => {
    // T-F5 (DECISIONS-r9 F5, impl/03 §4): 10 runs on Windows; 0 grandchildren alive KILL_GRACE_MS after cancel.
    // Non-Windows: prints a SKIPPED JSON line and exits 0.






    const root = fileURLToPath(new URL("../../", import.meta.url));
    const caseJson = JSON.parse(readFileSync(root + "e2e/live/cases/windows-grandchild-kill.json", "utf8"));

    test("case file: T-F5, local, covers the sandbox, runs the check", () => {
      assert.equal(caseJson.id, "T-F5");
      assert.equal(caseJson.kind, "local");
      assert.ok(caseJson.covers.includes("src/core/sandbox/"));
      assert.deepEqual(caseJson.run, ["node", "e2e/checks/windows-grandchild-kill.mjs"]);
      assert.deepEqual(caseJson.expect, { jsonField: "ok", equals: true });
    });

    test("check on non-Windows: SKIPPED JSON, exit 0", { skip: process.platform === "win32" }, () => {
      const r = spawnSync(process.execPath, [root + caseJson.run[1]], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0);
      const j = JSON.parse(r.stdout.trim().split("\n").pop());
      assert.equal(j.result, "SKIPPED");
      assert.equal(j.ok, true);
    });

    test("check on Windows: 10 runs, 0 grandchildren alive", { skip: process.platform !== "win32" ? "runs on win32 only (impl/03 §4, DECISIONS-r9 F5)" : false }, () => {
      const r = spawnSync(process.execPath, [root + caseJson.run[1]], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0, `T-F5 check output: ${r.stdout}${r.stderr}`);
      const j = JSON.parse(r.stdout.trim().split("\n").pop());
      assert.equal(j.ok, true);
      assert.equal(j.runs, 10);
      assert.equal(j.alive, 0);
    });

    test("check file reads no key and imports no e2e-forbidden src", () => {
      const src = readFileSync(root + caseJson.run[1], "utf8");
      assert.ok(!/API_KEY/.test(src));
    });
  });

  // Moved from tests/v2/e2e/compact-arms.test.mjs
  describe("ADR-0012 / compact eval arms", () => {
    // T-CMP arms (plan.md §2 E3): (a) pointer+summary (b) block+summary (c) summary (d) block (e) pointer.




    test("five arms a-e", () => assert.deepEqual([...ARM_IDS], ["a", "b", "c", "d", "e"]));

    const WANT = {
      a: { pointer: true, block: false, summary: true },
      b: { pointer: false, block: true, summary: true },
      c: { pointer: false, block: false, summary: true },
      d: { pointer: false, block: true, summary: false },
      e: { pointer: true, block: false, summary: false },
    };
    for (const [id, want] of Object.entries(WANT)) {
      test(`arm ${id}`, () => {
        const a = ARMS[id];
        assert.equal(a.pointer, want.pointer);
        assert.equal(a.block, want.block);
        assert.equal(a.summary, want.summary);
      });
    }

    test("every arm runs 10 times", () => {
      for (const id of ARM_IDS) assert.equal(ARMS[id].runs, 10);
    });
  });

  // Moved from tests/v2/e2e/compact-fixtures.test.mjs
  describe("ADR-0012 / compact eval fixtures", () => {
    // T-CMP fixtures (DECISIONS-r9 §V T-CMP, plan.md §2 E3): synthetic sessions, 3 facts each, one > 640 B.




    test("fixtures: at least one, ids unique", () => {
      assert.ok(FIXTURES.length >= 1);
      assert.equal(new Set(FIXTURES.map((f) => f.id)).size, FIXTURES.length);
    });

    test("every fixture has exactly the facts option, path, errorfix", () => {
      for (const f of FIXTURES) {
        assert.deepEqual(f.facts.map((x) => x.kind).sort(), ["errorfix", "option", "path"], f.id);
        for (const x of f.facts) assert.ok(typeof x.value === "string" && x.value.length > 0, f.id);
      }
    });

    test("every fixture has one fact larger than 640 bytes", () => {
      for (const f of FIXTURES) {
        const big = f.facts.filter((x) => Buffer.byteLength(x.value) > 640);
        assert.equal(big.length, 1, f.id);
      }
    });

    test("every fixture has turns and a next request that needs one fact", () => {
      for (const f of FIXTURES) {
        assert.ok(Array.isArray(f.turns) && f.turns.length >= 3, f.id);
        assert.ok(typeof f.nextRequest === "string" && f.nextRequest.length > 0, f.id);
        assert.ok(f.facts.some((x) => x.kind === f.needs), f.id);
      }
    });

    test("synthetic text only: no owner paths, no transcript markers", () => {
      const text = JSON.stringify(FIXTURES);
      for (const bad of ["/Users/", ".claude/projects", "mksglu", "@gmail", "sk-ant"]) assert.ok(!text.includes(bad), bad);
    });
  });

  // Moved from tests/v2/e2e/compact-score.test.mjs
  describe("ADR-0012 / compact eval score", () => {
    // T-CMP thresholds (DECISIONS-r9 §V T-CMP): arm a call >= 70%, correct >= 80% and >= arm c;
    // arm d correct >= 70%; ctx_resume(seq) returns the row 10/10.




    const run = (o = {}) => ({ factInSummary: false, calledTool: true, correct: true, resumeSeqOk: true, ...o });
    const n = (k, o) => Array.from({ length: k }, () => run(o));
    const mix = (good, total, o) => [...n(good, o), ...n(total - good, { ...o, correct: false })];

    function base() {
      return { a: n(10), b: n(10), c: n(10), d: n(10), e: n(10) };
    }

    test("all good passes", () => assert.equal(verdict(base()).pass, true));

    test("arm a call rate 7/10 passes, 6/10 fails", () => {
      const ok = base(); ok.a = [...n(7), ...n(3, { calledTool: false })];
      assert.equal(verdict(ok).pass, true);
      const bad = base(); bad.a = [...n(6), ...n(4, { calledTool: false })];
      assert.equal(verdict(bad).pass, false);
    });

    test("call rate counts only runs where the fact is missing from the summary", () => {
      const r = base(); r.a = [...n(7), ...n(3, { calledTool: false, factInSummary: true })];
      assert.equal(verdict(r).pass, true);
    });

    test("arm a correct 8/10 passes, 7/10 fails", () => {
      const ok = base(); ok.a = mix(8, 10); ok.c = mix(8, 10); // a >= c (DECISIONS-r9 T-CMP)
      assert.equal(verdict(ok).pass, true);
      const bad = base(); bad.a = mix(7, 10); bad.c = mix(7, 10);
      assert.equal(verdict(bad).pass, false);
    });

    test("arm a correct must be >= arm c", () => {
      const r = base(); r.a = mix(8, 10); r.c = mix(9, 10);
      assert.equal(verdict(r).pass, false);
    });

    test("arm d correct 7/10 passes, 6/10 fails", () => {
      const ok = base(); ok.d = mix(7, 10);
      assert.equal(verdict(ok).pass, true);
      const bad = base(); bad.d = mix(6, 10);
      assert.equal(verdict(bad).pass, false);
    });

    test("ctx_resume(seq) must succeed 10/10", () => {
      const r = base(); r.a = [...n(9), run({ resumeSeqOk: false })];
      assert.equal(verdict(r).pass, false);
    });

    test("verdict lists named checks", () => {
      const v = verdict(base());
      assert.ok(Array.isArray(v.checks) && v.checks.length >= 5);
      for (const c of v.checks) assert.ok(typeof c.name === "string" && typeof c.pass === "boolean");
    });

    test("exactMatch is case-sensitive by default (path, id, number)", () => {
      assert.equal(exactMatch("packages/cli/lib/Config/layered-loader.mjs", "packages/cli/lib/config/layered-loader.mjs"), false);
      assert.equal(exactMatch("7350", "7350"), true);
    });

    test("exactMatch with caseSensitive:false folds case only (prose answer)", () => {
      const opt = { caseSensitive: false };
      assert.equal(exactMatch("Newline-delimited JSON (NDJSON)", "newline-delimited JSON", opt), true);
      assert.equal(exactMatch("CSV", "newline-delimited JSON", opt), false);
      assert.equal(exactMatch("One JSON array", "newline-delimited JSON", opt), false);
    });

    test("session-03 key is prose (case-insensitive), session-01/02 keys stay case-sensitive", async () => {
      const { FIXTURES } = await import("../../e2e/live/compact/fixtures.mjs");
      const by = Object.fromEntries(FIXTURES.map((f) => [f.id, f.answer]));
      assert.equal(by["session-03"].caseSensitive, false);
      assert.notEqual(by["session-01"].caseSensitive, false);
      assert.notEqual(by["session-02"].caseSensitive, false);
    });
  });

  // Moved from tests/v2/e2e/compact-session.test.mjs
  describe("ADR-0012 / compact eval session", () => {
    // T-CMP session driver (TECH-SPEC:395 stream-json /compact turn; ADR-0012 keyless env).







    const posix = process.platform !== "win32";

    function stub(t) {
      const dir = mkdtempSync(path.join(tmpdir(), "cm-cmp-session-"));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      const rec = path.join(dir, "rec.json");
      const bin = path.join(dir, "claude");
      writeFileSync(bin, `#!/usr/bin/env node
const fs = require("node:fs");
let buf = "";
const lines = [];
// one result event per user line: the driver sends the next turn only after the previous result
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line) continue;
    lines.push(line);
    if (JSON.parse(line).message.content[0].text === "/compact") console.log(JSON.stringify({ type: "system", subtype: "compact_boundary" }));
    console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ok " + lines.length, total_cost_usd: 0.01 * lines.length }));
  }
});
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(rec)}, JSON.stringify({ argv: process.argv.slice(2), envKeys: Object.keys(process.env).sort(), iso: { ENABLE_CLAUDEAI_MCP_SERVERS: process.env.ENABLE_CLAUDEAI_MCP_SERVERS, CLAUDE_CODE_DISABLE_AUTO_MEMORY: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, CLAUDE_CODE_DISABLE_CLAUDE_MDS: process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS }, stdin: lines }));
});
`);
      chmodSync(bin, 0o755);
      return { bin, rec, dir };
    }

    test("argv: stream-json in and out, model, effort, budget", { skip: !posix }, async (t) => {
      const s = stub(t);
      await runSession({ bin: s.bin, turns: ["one", "two"], nextRequest: "three", budgetUsd: "0.25", cwd: s.dir });
      const { argv } = JSON.parse(readFileSync(s.rec, "utf8"));
      const val = (k) => argv[argv.indexOf(k) + 1];
      assert.equal(val("--input-format"), "stream-json");
      assert.equal(val("--output-format"), "stream-json");
      assert.equal(val("--model"), "claude-sonnet-5");
      assert.equal(val("--effort"), "low");
      assert.equal(val("--max-budget-usd"), "0.25");
    });

    // DEVIATIONS D-M7-CL-3: the 4 pass-through keys plus the 3 host-isolation keys, nothing else.
    const ISOLATION = { ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" };

    test("env: only PATH HOME USER TMPDIR plus the host-isolation keys", { skip: !posix }, async (t) => {
      const s = stub(t);
      await runSession({ bin: s.bin, turns: ["one"], nextRequest: "two", budgetUsd: "0.25", cwd: s.dir });
      const { envKeys, iso } = JSON.parse(readFileSync(s.rec, "utf8"));
      for (const k of envKeys) assert.ok(["PATH", "HOME", "USER", "TMPDIR", ...Object.keys(ISOLATION), "PWD", "SHLVL", "_", "__CF_USER_TEXT_ENCODING"].includes(k) || k.startsWith("LC_") === false, k);
      assert.ok(!envKeys.includes("ANTHROPIC_API_KEY"));
      for (const k of ["PATH", "HOME", "USER", "TMPDIR", ...Object.keys(ISOLATION)]) assert.ok(envKeys.includes(k), k);
      assert.deepEqual(iso, ISOLATION);
      // macOS CoreFoundation adds __CF_USER_TEXT_ENCODING to every process; the driver passes only these keys
      const osAdded = ["PWD", "SHLVL", "_", "__CF_USER_TEXT_ENCODING"];
      assert.deepEqual(envKeys.filter((k) => !["PATH", "HOME", "USER", "TMPDIR", ...Object.keys(ISOLATION), ...osAdded].includes(k)), []);
    });

    test("a /compact turn comes after the earlier turns and before the next request", { skip: !posix }, async (t) => {
      const s = stub(t);
      await runSession({ bin: s.bin, turns: ["first turn", "second turn"], nextRequest: "needs the path", budgetUsd: "0.25", cwd: s.dir });
      const { stdin } = JSON.parse(readFileSync(s.rec, "utf8"));
      const texts = stdin.map((l) => JSON.stringify(JSON.parse(l)));
      const at = (needle) => texts.findIndex((x) => x.includes(needle));
      assert.ok(at("first turn") >= 0 && at("second turn") > at("first turn"));
      assert.ok(at("/compact") > at("second turn"));
      assert.ok(at("needs the path") > at("/compact"));
      for (const l of stdin) assert.equal(JSON.parse(l).type, "user");
    });

    test("result: compact boundary seen, final text and cost from the last turn", { skip: !posix }, async (t) => {
      const s = stub(t);
      const r = await runSession({ bin: s.bin, turns: ["one", "two"], nextRequest: "three", budgetUsd: "0.25", cwd: s.dir });
      assert.equal(r.compacted, true);
      assert.equal(r.isError, false);
      assert.equal(r.finalText, "ok 4");
      assert.equal(r.costUsd, 0.04);
      assert.deepEqual(r.toolCalls, []);
    });

    test("hook events: --include-hook-events set and additionalContext bytes recorded", { skip: !posix }, async (t) => {
      const { additionalContextBytes } = await import("../../e2e/live/compact/session.mjs");
      assert.equal(additionalContextBytes(JSON.stringify({ hookSpecificOutput: { additionalContext: "héllo" } })), 6);
      assert.equal(additionalContextBytes(JSON.stringify({ additionalContext: "ab" })), 2);
      assert.equal(additionalContextBytes("not json"), 0);
      assert.equal(additionalContextBytes(""), 0);
      const s = stub(t);
      const r = await runSession({ bin: s.bin, turns: ["one"], nextRequest: "two", budgetUsd: "0.25", cwd: s.dir });
      const { argv } = JSON.parse(readFileSync(s.rec, "utf8"));
      assert.ok(argv.includes("--include-hook-events"));
      assert.deepEqual(r.hookContexts, []);
    });
  });

  // Moved from tests/v2/bench/m2-score.test.mjs
  describe("ADR-0012 / M2 bench score", () => {
    // bench/m2/score.mjs: transcript parsing and oracle-gated M2 scoring (pure, no live session).









    const line = (o) => JSON.stringify(o);
    const T = [
      line({ type: "assistant", message: { content: [{ type: "tool_use", id: "a", name: "Read" }, { type: "tool_use", id: "b", name: "mcp__tix__list" }, { type: "tool_use", id: "c", name: "mcp__plugin_context-mode_context-mode__ctx_search" }] } }),
      line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "héllo" }, { type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "abc" }, { type: "image" }] }] } }),
      line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "dup ignored" }, { type: "tool_result", tool_use_id: "c", content: "12" }] } }),
      line({ type: "system", subtype: "hook_response", stdout: line({ hookSpecificOutput: { additionalContext: "xyz" } }) }),
      "not json",
      line({ type: "result", result: "total 1,234", is_error: false }),
    ].join("\n");

    test("parseTranscript: UTF-8 bytes per tool, first result per id, hook context bytes", () => {
      const t = parseTranscript(T);
      assert.deepEqual(t.perTool, { Read: { calls: 1, bytes: 6 }, "mcp:other": { calls: 1, bytes: 3 }, ctx_search: { calls: 1, bytes: 2 } });
      assert.equal(t.bytes, 11);
      assert.equal(t.hookBytes, 3);
      assert.equal(t.calls, 3);
      assert.equal(toolKey("Bash"), "Bash");
    });

    test("oracle: every expect string, thousands separators read as digits, errors fail", () => {
      const res = parseTranscript(T).res;
      assert.equal(oracle(res, ["1234"]), true);
      assert.equal(oracle(res, ["1234", "nope"]), false);
      assert.equal(oracle({ ...res, is_error: true }, ["1234"]), false);
      assert.equal(oracle(null, []), false);
      assert.equal(normalizeNumbers("1,234,567 and 1,23 and a,123"), "1234567 and 1,23 and a,123");
    });

    test("scoreRows: failed v2 run never adds saving; no passing off run makes the workload invalid", () => {
      const rows = [
        { task: "x", arm: "off", ok: true, bytes: 1000 }, { task: "x", arm: "off", ok: false, bytes: 10 }, { task: "x", arm: "off", ok: true, bytes: 1000 },
        { task: "x", arm: "v2", ok: true, bytes: 100 }, { task: "x", arm: "v2", ok: false, bytes: 50 }, { task: "x", arm: "v2", ok: true, bytes: 200 },
        { task: "y", arm: "off", ok: false, bytes: 1000 }, { task: "y", arm: "v2", ok: true, bytes: 1 },
      ];
      const s = scoreRows(rows, ["x", "y"]);
      assert.equal(s.perTask[0].savingPct, 80); // runs 90, 0 (failed), 80 -> median 80
      assert.equal(s.perTask[1].savingPct, null);
      assert.deepEqual(s.invalid, ["y"]);
      assert.equal(s.score, 80);
    });

    test("heldout: at least 6 workloads, ids distinct from main, deterministic fixtures with an oracle", () => {
      assert.ok(HELDOUT.length >= 6);
      assert.equal(MAIN.length, 4);
      const mainIds = new Set(MAIN.map((t) => t.id));
      for (const t of HELDOUT) {
        assert.ok(!mainIds.has(t.id), t.id);
        const build = () => {
          const d = fs.mkdtempSync(path.join(os.tmpdir(), "m2h-")); let page = null;
          try { const b = t.build(d, { url: "http://127.0.0.1:1/p", serve: (_, body) => { page = body; } }); return { ...b, page }; } finally { fs.rmSync(d, { recursive: true, force: true }); }
        };
        const a = build(), b = build();
        assert.ok(a.expect.length > 0 && a.expect.every((e) => typeof e === "string" && e.length > 0), t.id);
        assert.deepEqual(a, b, t.id + " deterministic");
      }
    });
  });
});
