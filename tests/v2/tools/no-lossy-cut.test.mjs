// D-NO-LOSSY-CUT-1/2 (owner main rule): a reply is bounded only when the full content is stored first and the
// reply says how to read the rest. capBytes stays a final guard that never cuts real content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctxExecute } from "../../../src/core/tools/execute.ts";
import { ctxBatch } from "../../../src/core/tools/batch.ts";
import { ctxSearch } from "../../../src/core/tools/search.ts";
import { ctxIndex } from "../../../src/core/tools/index.ts";
import { ctxStats } from "../../../src/core/tools/stats.ts";
import { buildReport, buildReportHead } from "../../../src/core/ops/report.ts";
import * as C from "../../../src/core/contracts/constants.ts";

const B = (s) => Buffer.byteLength(s, "utf8");

function ctxFor(t) {
  const root = mkdtempSync(join(tmpdir(), "cm-nlc-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = "1".repeat(16);
  return {
    project: { projectKey: key, projectDir: join(root, "projects", key), dbPath: join(root, "projects", key, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env" },
    sessionId: "s1", turn: 1, signal: new AbortController().signal,
  };
}

function rows(n, status) {
  return Array.from({ length: n }, (_, i) => ({ id: "D" + (i + 1), label: "x".repeat(40), status, detail: "d".repeat(120), fixCommand: "fix-" + i }));
}

test("[NLC] report: the whole report keeps every row, no cut", () => {
  const input = { agent: "claude-code", rows: rows(40, "FAIL"), env: {}, command: "context-mode setup --agents claude-code" };
  const whole = buildReport(input);
  assert.ok(B(whole) > C.REPORT_CAP);
  for (const r of input.rows) assert.ok(whole.includes(r.id + " "), r.id);
  assert.ok(!whole.toLowerCase().includes("truncat"));
});

test("[NLC] report: over the cap the head is <= REPORT_CAP, FAIL rows first, with a pointer to the stored rest", () => {
  const input = { agent: "claude-code", rows: [...rows(30, "PASS"), ...rows(3, "FAIL").map((r, i) => ({ ...r, id: "F" + i }))], env: {}, command: "context-mode setup --agents claude-code" };
  const head = buildReportHead(input);
  assert.ok(B(head) <= C.REPORT_CAP);
  assert.ok(head.includes("F0 ") && head.includes("F2 "));
  assert.ok(head.includes(C.REPORT_REST_PREFIX));
  assert.ok(head.includes(C.REPORT_POINTER));
  assert.ok(!head.toLowerCase().includes("truncat"));
});

test("[NLC] ctx_doctor: the stored report reaches every row through the pointer", async (t) => {
  const ctx = ctxFor(t);
  const { indexText } = await import("../../../src/core/index/text.ts");
  const { openDb, closeDb } = await import("../../../src/core/store/db.ts");
  const input = { agent: "claude-code", rows: rows(40, "PASS"), env: {}, command: "c" };
  const whole = buildReport(input);
  const db = await openDb(ctx.project);
  try { indexText(db, ctx.project, ctx.sessionId, C.REPORT_SOURCE_LABEL, whole, "text"); } finally { closeDb(db); }
  const r = await ctxSearch.handler({ queries: ["PASS"], source: C.REPORT_SOURCE_LABEL }, ctx);
  assert.ok(r.text.includes("D1 ") || r.text.includes("D40 "), r.text.slice(0, 300));
});

test("[NLC] execute: a huge intent never cuts the pointer", async (t) => {
  const ctx = ctxFor(t);
  const r = await ctxExecute.handler({ language: "shell", code: "yes line | head -n 20000", intent: "x".repeat(20000) }, ctx);
  assert.ok(B(r.text) <= C.OUTPUT_CAP);
  assert.ok(r.text.endsWith("})"), r.text.slice(-80));
  assert.ok(r.text.includes("ctx_search("));
});

test("[NLC] execute: a normal intent is echoed whole in the pointer", async (t) => {
  const ctx = ctxFor(t);
  const r = await ctxExecute.handler({ language: "shell", code: "yes line | head -n 20000", intent: "line" }, ctx);
  assert.ok(r.text.includes('queries:["line"]'));
});

test("[NLC] batch: huge queries are named by position, the footer pointer survives", async (t) => {
  const ctx = ctxFor(t);
  const r = await ctxBatch.handler({ commands: ["yes line | head -n 5000"], queries: ["q".repeat(9000), "w".repeat(9000)] }, ctx);
  assert.ok(B(r.text) <= C.OUTPUT_CAP);
  assert.ok(r.text.includes("## query 1") && r.text.includes("## query 2"));
  assert.ok(r.text.endsWith("})") && r.text.includes('source:"ctx_batch:1"'));
});

test("[NLC] index: a huge label is stored whole and named by its handle in the reply", async (t) => {
  const ctx = ctxFor(t);
  const label = "L".repeat(20000);
  const r = await ctxIndex.handler({ content: "hello world", source: label }, ctx);
  assert.ok(B(r.text) <= C.OUTPUT_CAP);
  assert.ok(r.text.endsWith("."));
  assert.ok(!r.text.includes("LLLL"));
  const s = await ctxSearch.handler({ queries: ["hello"], source: label }, ctx);
  assert.ok(s.text.includes("hello"));
});

test("[NLC] stats: the reply is always under the cap, so the guard cuts nothing", async (t) => {
  const ctx = ctxFor(t);
  const r = await ctxStats.handler({}, ctx);
  assert.ok(B(r.text) < C.OUTPUT_CAP);
});

test("[NLC] search: an oversize query gives a whole reply under the cap", async (t) => {
  const ctx = ctxFor(t);
  const r = await ctxSearch.handler({ queries: ["z".repeat(20000)] }, ctx);
  assert.ok(B(r.text) < C.OUTPUT_CAP);
});
