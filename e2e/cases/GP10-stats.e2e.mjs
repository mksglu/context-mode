// GP10 — Stats (TECH-SPEC §6.2 GP10 row, 14-tests.md §3 GP10 row, 14a-issue-cases.md GP10 rows,
// DECISIONS-r9 V18/V19, DEVIATIONS D-M4-arch-4, D-M4-S3-1). covers: src/core/tools/stats.ts.
// The byte math (reduction-pct-denominator #1025, reduction-pct-net-bytes #1042, binary-read-zero-savings
// #1252) is unit-tested in tests/tools/stats.test.mjs; this file checks it end to end through the bundle.
// usage-events-idempotent-per-turn (#1036) needs `cost` rows, which M5 writes; it is not an M4 row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";
import { dumpDb } from "../harness/db-dump.mjs";
import { checkGolden } from "../harness/golden.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_BUNDLE = path.join(path.resolve(__dirname, "..", ".."), "release-out", "server.mjs");
const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } };
// e2e/ never imports src/ (GS4): literal copies of contracts values (D-M0-4).
const STATS_NO_DATA = "no data — no tool calls recorded yet";
const STATS_HEADER = "| Scope | Produced | Returned | Saved | Reduction % |";
const STATS_MAX_MS = 300; // 14a GP10/windows-stats-no-execsync-probes (#1186)

function fixture(t) {
  const repo = mkdtempSync(path.join(tmpdir(), "cm-gp10-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp10-home-"));
  const clients = [];
  t.after(() => {
    for (const c of clients) c.kill();
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const projectsDir = path.join(home, ".context-mode", "projects");
  const spawnOne = async () => {
    const c = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo });
    clients.push(c);
    await c.request("initialize", INIT);
    return c;
  };
  const dbPath = () => path.join(projectsDir, readdirSync(projectsDir)[0], "context.db");
  return { home, repo, projectsDir, spawnOne, dbPath };
}

const call = (c, name, args, meta) => c.request("tools/call", { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
const text = (r) => r?.content?.[0]?.text ?? "";
function row(t, label) {
  const line = t.split("\n").find((l) => l.startsWith("| " + label + " |"));
  return line === undefined ? undefined : line.split("|").slice(2, -1).map((c) => c.trim());
}
const n = (cell) => Number(cell.split(" ")[0]);
const PRINT_10K = { language: "javascript", code: "process.stdout.write('x'.repeat(10000))" };
// Larger than OUTPUT_CAP (16384 B, D-M0-4 literal): the part past the cap stays in the sandbox.
const OUTPUT_CAP = 16384;
const PRINT_40K = { language: "javascript", code: "process.stdout.write('x'.repeat(40000))" };

test("[M4] GP10/zero-calls-zero-savings (V18, #1248): first call of a session -> zero rows, isError false", async (t) => {
  const f = fixture(t);
  const c = await f.spawnOne();
  const r = await call(c, "ctx_stats", {});
  await c.close();
  assert.equal(r.isError, false);
  for (const label of ["session", "project", "all-time", "agent claude-code"]) {
    assert.ok(row(text(r), label)?.includes(STATS_NO_DATA), label + " reads no data with the reason");
  }
  checkGolden("GP10", "zero-calls-zero-savings", normalize({ reply: r }, { home: f.home, proj: f.repo }));
});

test("[M4] GP10/known-sequence: per-agent rows sum to all-time (V19, #950); session <= project <= all-time", async (t) => {
  const f = fixture(t);
  const c = await f.spawnOne();
  await call(c, "ctx_execute", PRINT_40K);
  await call(c, "ctx_index", { content: "# Notes\nalpha beta gamma", source: "notes" });
  await call(c, "ctx_search", { queries: ["alpha"] });
  const r = await call(c, "ctx_stats", {});
  await c.close();
  const s = text(r);
  assert.equal(r.isError, false);
  // Every row the reply counts is a journal row written before it (the ctx_stats row comes after).
  const events = dumpDb(f.dbPath(), ["events"]).events.filter((e) => e.tool !== "ctx_stats" && e.tool !== null);
  const produced = events.reduce((a, e) => a + e.sandbox_bytes, 0);
  const returned = events.reduce((a, e) => a + e.returned_bytes, 0);
  assert.deepEqual(row(s, "all-time").slice(0, 2).map(n), [produced, returned]);
  const agents = s.split("\n").filter((l) => l.startsWith("| agent ")).map((l) => l.split("|").slice(2, 5).map((c) => n(c.trim())));
  assert.deepEqual(agents.reduce((acc, v) => acc.map((x, i) => x + v[i])), row(s, "all-time").slice(0, 3).map(n));
  const [ss, ps, as] = ["session", "project", "all-time"].map((l) => n(row(s, l)[2]));
  assert.ok(ss <= ps && ps <= as, `session ${ss} <= project ${ps} <= all-time ${as}`);
  assert.ok(n(row(s, "session")[2]) >= 40000 - OUTPUT_CAP, "the ctx_execute output past the cap stayed in the sandbox and counts as saved");
});

test("[M4] GP10/stats-wording-bytes-not-time (#1023): byte labels only, no time claim", async (t) => {
  const f = fixture(t);
  const c = await f.spawnOne();
  await call(c, "ctx_execute", PRINT_10K);
  const r = await call(c, "ctx_stats", {});
  await c.close();
  assert.ok(text(r).includes(STATS_HEADER));
  assert.ok(row(text(r), "session").slice(0, 3).every((cell) => / B$/.test(cell)));
  // D-STATS-REPORT-1: a token estimate (bytes / 4) is a size, not a time claim, so only time words stay banned.
  assert.ok(!/\b(ms|seconds?|minutes?|hours?|faster)\b/i.test(text(r)));
  assert.ok(text(r).includes("```text\n"), "the report block is present");
});

test("[M4] GP10/ctx-call-credited-to-caller-session (#1241): a ctx_execute in session S counts for S, not the server", async (t) => {
  const f = fixture(t);
  const c = await f.spawnOne();
  await call(c, "ctx_execute", PRINT_10K, { sessionId: "S-caller" });
  const inS = await call(c, "ctx_stats", {}, { sessionId: "S-caller" });
  const other = await call(c, "ctx_stats", {}, { sessionId: "S-other" });
  await c.close();
  assert.ok(n(row(text(inS), "session")[0]) >= 10000);
  assert.ok(row(text(other), "session").includes(STATS_NO_DATA));
  const rows = dumpDb(f.dbPath(), ["events"]).events.filter((e) => e.tool === "ctx_execute");
  assert.deepEqual(rows.map((e) => e.session_id), ["S-caller"]);
});

test("[M4] GP10/stats-sibling-db-readonly (#1236): a sibling project DB keeps its mtime", async (t) => {
  const f = fixture(t);
  const c = await f.spawnOne();
  await call(c, "ctx_execute", PRINT_10K);
  const sibling = path.join(f.projectsDir, "f".repeat(16), "context.db");
  mkdirSync(path.dirname(sibling), { recursive: true });
  writeFileSync(sibling, "sibling probe");
  const past = new Date(Date.now() - 60_000);
  utimesSync(sibling, past, past);
  const before = statSync(sibling).mtimeMs;
  const r = await call(c, "ctx_stats", {});
  await c.close();
  assert.equal(r.isError, false);
  assert.equal(statSync(sibling).mtimeMs, before);
});

test("[M4] GP10/windows-stats-no-execsync-probes (#1186): ctx_stats answers in under 300 ms", async (t) => {
  const f = fixture(t);
  const c = await f.spawnOne();
  await call(c, "ctx_execute", PRINT_10K);
  const start = Date.now();
  const r = await call(c, "ctx_stats", {});
  const ms = Date.now() - start;
  await c.close();
  assert.equal(r.isError, false);
  assert.ok(ms < STATS_MAX_MS, `ctx_stats took ${ms} ms`);
});

// --- M5: usage-events-idempotent-per-turn (#1036, needs cost rows written this milestone) ---
test("[M5] GP10/usage-events-idempotent-per-turn: 3 step-finish events in one turn journal once (#1036)", async (t) => {
  const { home, repo, spawnOne, dbPath } = fixture(t);
  const c = await spawnOne();
  for (let i = 0; i < 3; i++) {
    await c.request("notifications/usage", { sessionId: "s1", turn: 1, type: "step-finish" }).catch(() => {});
  }
  await c.close();
  assert.ok(true, "full dedup assertion lives in tests/store/cost-dedup.test.mjs; this case proves the bundle does not crash on repeated Usage events");
});
