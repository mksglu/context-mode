// PRD-v2 sections 8 and 12, GP10: ctx_stats and ctx_purge. One file for the area (ADR-0024).
// A fix for this area adds its red test inside the describe block of its section. Do not add a new file.
// Concurrent: every test builds its own project root and DB; nothing reads process.env.

import { test, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctxStats } from "../src/core/tools/stats.ts";
import { appendEvent } from "../src/core/journal/append.ts";
import { openDb, closeDb } from "../src/core/store/db.ts";
import { OUTPUT_CAP, ISSUE_REPO_SLUG, STATS_COLUMNS, STATS_NO_DATA, STATS_SUMMARY, STATS_UNKNOWN_FIELD_LINE, PURGE_NO_SCOPE_LINE, PURGE_MANY_SCOPES_LINE, PURGE_BUSY_LINE, PURGE_SUMMARY } from "../src/core/contracts/constants.ts";
import { DatabaseSync } from "node:sqlite";
import { ctxPurge } from "../src/core/tools/purge.ts";
import { ctxIndex } from "../src/core/tools/index.ts";
import { ctxSearch } from "../src/core/tools/search.ts";

// Concurrent.
describe("PRD-v2 sections 8 and 12: stats and purge (concurrent)", { concurrency: CONC }, () => {
  // Moved from tests/tools/stats.test.mjs
  describe("PRD-v2 section 8 / ctx_stats", () => {
    // [M4] Unit tests for src/core/tools/stats.ts (impl/06 §5, TECH-SPEC GP10 + §6.2a D3, DECISIONS-r9 V18/V19,
    // DEVIATIONS D-M4-arch-3, D-M4-arch-4, D-M4-S3-1). ctx_stats sums sandbox_bytes/returned_bytes over events rows
    // per scope (session, project, all-time) and per agent, opens only its own context.db, read-only.










    const KEY = "3".repeat(16);
    function ctxFor(root, sessionId = "s1", agent = "claude-code") {
      const projectDir = join(root, "projects", KEY);
      return {
        project: { projectKey: KEY, projectDir, dbPath: join(projectDir, "context.db"), worktree: root, containmentRoot: root, agent, source: "env:CLAUDE_PROJECT_DIR" },
        sessionId, turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18",
      };
    }

    // rows: [sessionId, agent, sandbox_bytes, returned_bytes, kind?]
    async function addRows(ctx, rows) {
      const db = await openDb(ctx.project);
      try {
        for (const [sessionId, agent, sandbox, returned, kind = "cmd"] of rows) {
          appendEvent(db, { session_id: sessionId, worktree: ctx.project.worktree, agent, kind, tool: kind === "prompt" ? null : "ctx_execute",
            key: null, path: null, ok: 1, exit_code: null, bytes: sandbox, body: "x", turn: 1, sandbox_bytes: sandbox, returned_bytes: returned });
        }
      } finally { closeDb(db); }
    }

    async function withRoot(fn) {
      const root = mkdtempSync(join(tmpdir(), "cm-stats-"));
      try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
    }

    // "| <label> | a | b | c | d |" -> [a, b, c, d]; undefined when the row is absent.
    function row(text, label) {
      const line = text.split("\n").find((l) => l.startsWith("| " + label + " |"));
      return line === undefined ? undefined : line.split("|").slice(2, -1).map((c) => c.trim());
    }
    const n = (cell) => Number(cell.split(" ")[0]);

    test("[M4] stats/tool-shape: ctx_stats is readOnly, strict, unknown field is the exact line", () => {
      assert.equal(ctxStats.name, "ctx_stats");
      assert.equal(ctxStats.readOnly, true);
      assert.equal(ctxStats.alwaysLoad, false);
      assert.equal(ctxStats.schema.safeParse({}).success, true);
      const bad = ctxStats.schema.safeParse({ bogus: 1 });
      assert.equal(bad.success, false);
      assert.equal(bad.error.issues[0].message, STATS_UNKNOWN_FIELD_LINE);
    });

    test("[M4] GP10/zero-calls-zero-savings (V18): no rows -> isError false, every scope and the agent row read no data", () => withRoot(async (root) => {
      const out = await ctxStats.handler({}, ctxFor(root));
      assert.equal(out.isError, false);
      assert.equal(out.text.split("\n")[0], STATS_SUMMARY(0, 0));
      for (const label of ["session", "project", "all-time", "agent claude-code"]) {
        assert.ok(row(out.text, label)?.includes(STATS_NO_DATA), label + " reads no data with the reason");
      }
    }));

    test("[M4] GP10/table-columns: header is STATS_COLUMNS, values are labelled bytes (no time claim, #1023)", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 4000, 1000]]);
      const out = await ctxStats.handler({}, ctx);
      assert.ok(out.text.includes("| " + STATS_COLUMNS.join(" | ") + " |"));
      assert.deepEqual(row(out.text, "session"), ["4000 B", "1000 B", "3000 B", "75"]);
      assert.ok(!/\b(ms|seconds?|minutes?|hours?|faster)\b/i.test(out.text));
    }));

    test("[M4] GP10/reduction-pct-denominator (#1025): 10,001 B produced, 3,284 B returned -> returned counted once", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 10001, 3284]]);
      const out = await ctxStats.handler({}, ctx);
      // 6717 / 10001 * 100 = 67.16 -> 67.2; counting returned twice would give 6717 / 13285 = 50.6.
      assert.equal(out.text.split("\n")[0], STATS_SUMMARY(67.2, 67.2));
      assert.deepEqual(row(out.text, "all-time"), ["10001 B", "3284 B", "6717 B", "67.2"]);
    }));

    test("[M4] GP10/reduction-pct-net-bytes (#1042): 10 KB produced, 2 KB returned -> 8 KB kept out", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 10240, 2048]]);
      const out = await ctxStats.handler({}, ctx);
      assert.deepEqual(row(out.text, "session"), ["10240 B", "2048 B", "8192 B", "80"]);
    }));

    test("[M4] GP10/reduction-pct-net-bytes (#1042): 10 KB indexed, 2 KB later returned by search in the same session -> 8 KB", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 10240, 0, "index"], ["s1", "claude-code", 0, 2048]]);
      const out = await ctxStats.handler({}, ctx);
      assert.deepEqual(row(out.text, "session"), ["10240 B", "2048 B", "8192 B", "80"]);
    }));

    test("[M4] GP10/real-savings-only + binary-read-zero-savings (#952, #1252, #1151): bytes that reached the model are not saved", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      // A host Read of a 1 MB binary (hook row: sandbox == returned) and a ctx_search reply (no sandbox, 500 B returned).
      await addRows(ctx, [["s1", "claude-code", 1048576, 1048576], ["s1", "claude-code", 0, 500]]);
      const out = await ctxStats.handler({}, ctx);
      const r = row(out.text, "session");
      assert.equal(n(r[2]), 0, "saved is 0, never negative");
      assert.equal(r[3], "0");
      assert.equal(out.text.split("\n")[0], STATS_SUMMARY(0, 0));
    }));

    test("[M4] GP10/stats-totals-consistent (#950, I1-19): session <= project <= all-time; prompt rows are not calls", () => withRoot(async (root) => {
      const ctx = ctxFor(root, "s1");
      await addRows(ctx, [
        ["s1", "claude-code", 5000, 1000], ["s1", "claude-code", 0, 300], ["s2", "codex", 9000, 500],
        ["s2", "claude-code", 100, 100], ["s1", "claude-code", 50, 0, "prompt"],
        ["s3", "claude-code", 0, 400], // a session of only ctx_stats/ctx_search replies: net negative, adds 0
      ]);
      const out = await ctxStats.handler({}, ctx);
      const [s, p, a] = ["session", "project", "all-time"].map((l) => n(row(out.text, l)[2]));
      assert.ok(s <= p && p <= a, `session ${s} <= project ${p} <= all-time ${a}`);
      assert.deepEqual(row(out.text, "session"), ["5000 B", "1300 B", "3700 B", "74"]);
      assert.deepEqual(row(out.text, "project"), ["14100 B", "2300 B", "12200 B", "86.5"]);
      assert.deepEqual(row(out.text, "all-time"), ["14100 B", "2300 B", "12200 B", "86.5"]);
    }));

    test("[M4] GP10/per-agent-rows-sum-to-total (V19): agent rows add up to the all-time row exactly", () => withRoot(async (root) => {
      const ctx = ctxFor(root, "s9", "codex");
      await addRows(ctx, [["s1", "claude-code", 5000, 1000], ["s2", "codex", 9000, 500], ["s3", "gemini", 777, 7], ["s3", "gemini", 3, 3]]);
      const out = await ctxStats.handler({}, ctx);
      const total = row(out.text, "all-time").slice(0, 3).map(n);
      const agents = ["claude-code", "codex", "gemini"].map((a) => row(out.text, "agent " + a).slice(0, 3).map(n));
      assert.deepEqual(agents.reduce((acc, r) => acc.map((v, i) => v + r[i])), total);
      // The calling session s9 has no rows: its scope row reads no data, the others do not.
      assert.ok(row(out.text, "session").includes(STATS_NO_DATA));
      assert.equal(out.text.split("\n")[0], STATS_SUMMARY(89.8, 0));
    }));

    test("[M4] GP10/stats-sibling-db-readonly + GP8/sibling-db-readonly (#1236, #1213): own DB and sibling DBs keep their mtime", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 4000, 1000]]);
      const sibling = join(root, "projects", "4".repeat(16));
      mkdirSync(sibling, { recursive: true });
      writeFileSync(join(sibling, "context.db"), "sibling");
      const past = new Date(Date.now() - 60_000);
      utimesSync(ctx.project.dbPath, past, past);
      utimesSync(join(sibling, "context.db"), past, past);
      const before = [statSync(ctx.project.dbPath).mtimeMs, statSync(join(sibling, "context.db")).mtimeMs];
      const out = await ctxStats.handler({}, ctx);
      assert.equal(out.isError, false);
      assert.deepEqual([statSync(ctx.project.dbPath).mtimeMs, statSync(join(sibling, "context.db")).mtimeMs], before);
    }));

    test("[M4] stats/output-cap: the reply is at most OUTPUT_CAP bytes", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 4000, 1000]]);
      const out = await ctxStats.handler({}, ctx);
      assert.ok(Buffer.byteLength(out.text, "utf8") <= OUTPUT_CAP);
      assert.equal(out.sandboxBytes, 0);
    }));

    // D-STATS-REPORT-1: the detailed report (v1 style) on the same journal rows. Fixed journal below; every
    // expected number is worked out by hand from these rows, not from the code.
    // rows: { s, agent, tool, kind, p (sandbox_bytes), r (returned_bytes) }
    const FIXED = [
      { tool: "ctx_execute", p: 40000, r: 1000 }, { tool: "ctx_execute", p: 10000, r: 500 },
      { tool: "ctx_batch", p: 120000, r: 2000 }, { tool: "ctx_index", kind: "index", p: 222000, r: 300 },
      { tool: "ctx_search", p: 0, r: 3000 }, { tool: "Bash", p: 160014, r: 421 },
      { tool: "Edit", kind: "edit", p: 200, r: 200 }, { tool: "AskUserQuestion", kind: "decision", p: 0, r: 0 },
      { tool: "Bash", kind: "toolerr", p: 5000, r: 5000 }, { tool: null, kind: "prompt", p: 0, r: 0 },
      { tool: "ctx_stats", p: 0, r: 2500 }, // an earlier ctx_stats reply: reading the report is not work, never counted
      { s: "s2", agent: "codex", tool: "ctx_execute", p: 9000, r: 500 },
    ];
    const T0 = 1793000000000; // 2026-10-26T07:33:20Z; row seq k is written at T0 + k minutes
    async function addFixed(ctx, rows = FIXED) {
      const db = await openDb(ctx.project);
      try {
        for (const x of rows) {
          appendEvent(db, { session_id: x.s ?? "s1", worktree: ctx.project.worktree, agent: x.agent ?? "claude-code", kind: x.kind ?? "cmd",
            tool: x.tool, key: null, path: null, ok: 1, exit_code: null, bytes: x.p, body: "x", turn: 1, sandbox_bytes: x.p, returned_bytes: x.r });
        }
      } finally { closeDb(db); }
      const raw = new DatabaseSync(ctx.project.dbPath);
      try {
        raw.prepare("UPDATE events SET created_at = ? + seq * 60000").run(T0);
        const ins = raw.prepare("INSERT INTO sources (session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts) VALUES ('s1', ?, 'claude-code', 'content', ?, ?, ?, 0, '', 0)");
        ins.run(ctx.project.worktree, "notes", 3000, 4);
        ins.run(ctx.project.worktree, "docs", 222000, 120);
      } finally { raw.close(); }
    }
    // The fenced report block of the reply, DB file size masked (SQLite page use is not part of the contract).
    function report(text) {
      const m = /```text\n([\s\S]*?)\n```/.exec(text);
      assert.ok(m, "the reply holds the report in a ```text block");
      return m[1].replace(/(Database file +)\S+ \S+/, "$1<size>");
    }
    // Labels of a report table: the rows under the header line that starts with `  <title>`, up to a blank line.
    function labels(rep, title) {
      const lines = rep.split("\n");
      const at = lines.findIndex((l) => l.startsWith("  " + title + " "));
      assert.ok(at >= 0, title + " table is present");
      const out = [];
      for (const l of lines.slice(at + 1)) { if (l.trim() === "") break; out.push(l.slice(2, 23).trim()); }
      return out;
    }

    test("[R6] stats/report-headline: session bars, saved bytes, % and the token estimate (bytes / 4)", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addFixed(ctx);
      const out = await ctxStats.handler({}, ctx);
      // project: 10 calls, 566214 produced, 12921 returned, 553293 saved -> 97.7; session s1: 557214 / 12421 / 544793 -> 97.8.
      assert.equal(out.text.split("\n")[0], STATS_SUMMARY(97.7, 97.8));
      const rep = report(out.text);
      // D-STATS-FIX-1 (7): one line right under the scope line says it all, with one verb ("kept out").
      assert.ok(rep.includes("This session · 9 calls · 10m active\n  544.2 KB became 12.1 KB: 532.0 KB kept out (97.8%)\n"), rep);
      assert.ok(rep.includes("  Without context-mode |" + "█".repeat(40) + "|   544.2 KB"), rep);
      assert.ok(rep.includes("  With context-mode    |█" + "░".repeat(39) + "|    12.1 KB"), rep);
      assert.ok(!rep.includes(" saved"), "one verb for the result: kept out");
      // The Markdown table stays for agents that read numbers; ctx_stats rows are not in it either.
      assert.deepEqual(row(out.text, "project"), ["566214 B", "12921 B", "553293 B", "97.7"]);
    }));

    test("[R6] stats/report-sorting: tool rows sorted by saved bytes, host tools marked as hook rows, agents add up", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addFixed(ctx);
      const rep = report((await ctxStats.handler({}, ctx)).text);
      // D-STATS-FIX-1 (1): ctx_search nets against the index it reads (I1-15), so it shares the ctx_index row;
      // the two rows with 0 B kept out fold into "other". No row here is below 0 B, so they add up to the project row.
      assert.deepEqual(labels(rep, "Tool"), ["ctx_index + search", "hook Bash", "ctx_batch", "ctx_execute", "other (2 tools)"]);
      assert.ok(rep.includes("By tool (this project)\n  " + "Tool".padEnd(21) + "Calls".padStart(7) + ["Made", "Sent", "Kept out"].map((h) => h.padStart(11)).join("") + "%".padStart(8) + "\n"), rep);
      assert.ok(rep.includes("  ctx_index + search         2   216.8 KB     3.2 KB   213.6 KB   98.5% ████████"), rep);
      assert.ok(rep.includes("  hook Bash                  2   161.1 KB     5.3 KB   155.9 KB   96.7% ██████"), rep);
      assert.ok(rep.includes("  other (2 tools)            2      200 B      200 B        0 B    0.0%\n"), rep);
      // 218,700 + 159,593 + 118,000 + 57,000 + 0 = 553,293 B, the project row (540.3 KB), each row rounded once.
      const kept = rep.split("\n").filter((l) => labels(rep, "Tool").some((n) => l.startsWith("  " + n + " ")))
        .map((l) => Number(l.slice(2 + 21 + 7 + 22, 2 + 21 + 7 + 33).trim().split(" ")[0]));
      assert.ok(Math.abs(kept.reduce((a, b) => a + b, 0) - 540.3) <= 0.05 * kept.length, String(kept));
      assert.ok(rep.includes("By agent (this project)\n  Agent "), rep);
      assert.deepEqual(labels(rep, "Agent"), ["claude-code", "codex"]);
      assert.ok(rep.includes("  codex                      1     8.8 KB      500 B     8.3 KB   94.4%"), rep);
      // D-STATS-FIX-1 (5): one DB per project holds all of it, so project and all-time are one row.
      assert.deepEqual(labels(rep, "Scope"), ["session", "project (all-time)"]);
    }));

    test("[R6] stats/report-journal-and-store: categories with session/project counts, hints, index state, sessions", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addFixed(ctx);
      const rep = report((await ctxStats.handler({}, ctx)).text);
      // D-STATS-FIX-1 (8, 10): the first five rows add up to the session's 9 calls; positive names.
      assert.deepEqual(labels(rep, "Journal"), ["Content indexed", "File edits", "Issues kept", "Your decisions", "Other tool calls", "Your prompts"]);
      assert.ok(rep.includes("  " + "Other tool calls".padEnd(21) + "5".padStart(9) + "6".padStart(9) + "  " + "█".repeat(20)), rep);
      assert.ok(rep.includes("ctx_resume") && rep.includes("open issues"), "hint names the tool that reads the journal back");
      // D-STATS-FIX-1 (6): the source count shows once.
      assert.ok(rep.includes("  Index and search     2 sources · 124 chunks · 219.7 KB · 1 ctx_search call"), rep);
      assert.ok(!rep.includes("Indexed sources"), rep);
      assert.ok(rep.includes("  Database file        <size>"), rep);
      assert.ok(rep.includes("  Sessions             2 · agents 2 · active days 1"), rep);
    }));

    test("[R6] stats/report-width-80: every line fits 80 columns, also with long names and GB-sized numbers", () => withRoot(async (root) => {
      const ctx = ctxFor(root, "s1", "a-very-long-agent-name-that-goes-on");
      await addFixed(ctx, [...FIXED, { agent: "a-very-long-agent-name-that-goes-on", tool: "mcp__some_server__a_very_long_tool_name", p: 5e12, r: 1e9 }]);
      const out = await ctxStats.handler({}, ctx);
      // The report block and the summary line; the Markdown table below holds raw byte counts for agents.
      for (const line of [out.text.split("\n")[0], ...report(out.text).split("\n")]) assert.ok([...line].length <= 80, `${[...line].length} columns: ${line}`);
      assert.ok(report(out.text).includes("4.5 TB"), "TB unit with one decimal");
      assert.ok(report(out.text).includes(" times a 200K window"), "a saving past one window reads as times");
    }));

    // D-STATS-ZERO-1, tester on 2.0.0-next.34: a ctx_search with no hits made 0 B and sent 47 B; the tool row read
    // "-47 B-4700.0%" while the scope rows read 0 B and 0.0%. A row never keeps out less than 0 B; 0 B made is 0.0%.
    for (const sent of [47, 902]) {
      test(`[R13] stats/zero-made: 0 B made, ${sent} B sent -> every row 0 B kept out and 0.0%, as the scope rows`, () => withRoot(async (root) => {
        const ctx = ctxFor(root);
        await addFixed(ctx, [{ tool: "ctx_search", p: 0, r: sent }]);
        const out = await ctxStats.handler({}, ctx);
        const rep = report(out.text);
        const cells = (name) => "  " + name.padEnd(21) + "1".padStart(7) + ["0 B", sent + " B", "0 B"].map((v) => v.padStart(11)).join("") + "0.0%".padStart(8);
        assert.ok(rep.includes("\n" + cells("ctx_search") + "\n"), rep);
        assert.ok(rep.includes("\n" + cells("session") + "\n"), rep);
        assert.ok(rep.includes(`  0 B became ${sent} B: 0 B kept out (0.0%)\n`), rep);
        assert.ok(!/(^| )-\d/m.test(rep), "no negative value anywhere in the report: " + rep);
        assert.deepEqual(row(out.text, "project"), ["0 B", sent + " B", "0 B", "0"]);
      }));
    }

    test("[R13] stats/columns-never-touch: a value wider than its column still has a space before it", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addFixed(ctx, [{ tool: "ctx_execute", p: 4e15, r: 2e15 }, { tool: "ctx_search", p: 0, r: 47 }]);
      const rep = report((await ctxStats.handler({}, ctx)).text);
      const line = rep.split("\n").find((l) => l.startsWith("  ctx_execute "));
      assert.ok(line, rep);
      // 4e15 B is near the largest safe integer. label | calls | made (n unit) | sent (n unit) | kept out (n unit) | % : each field is set apart by spaces.
      const f = line.slice(23).trim().split(" ").filter((x) => x !== "");
      assert.deepEqual(f.slice(0, 8), ["1", "3638.0", "TB", "1819.0", "TB", "1819.0", "TB", "50.0%"], line);
    }));

    test("[R6] stats/report-deterministic: same journal, same bytes", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addFixed(ctx);
      const a = await ctxStats.handler({}, ctx);
      const b = await ctxStats.handler({}, ctx);
      assert.equal(a.text, b.text);
    }));

    // D-STATS-VALUE-1: the business-value lines (owner, 2026-11-02: "en value uretenleri yapalim ekleyelim").
    // A week of extra rows in session s0, written straight to the DB with their own created_at (UTC days
    // T0 - 9, - 6, - 3, - 2 = 10-17, 10-20, 10-23, 10-24), and one run.mjs source (a hook redirect, ADR-0016 case B).
    const DAY = 86400000;
    const WEEK = [
      { d: -6, tool: "ctx_execute", p: 30000, r: 1000 }, { d: -3, tool: "Bash", p: 90000, r: 500 },
      { d: -3, tool: "ctx_index", kind: "index", p: 50000, r: 200 }, { d: -9, tool: "ctx_batch", p: 70000, r: 700 },
    ];
    async function addWeek(ctx) {
      await addFixed(ctx);
      const raw = new DatabaseSync(ctx.project.dbPath);
      try {
        const ins = raw.prepare("INSERT INTO events (session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn, sandbox_bytes, returned_bytes, created_at, accessed_at) VALUES ('s0', ?, 'claude-code', ?, ?, NULL, NULL, 1, NULL, ?, 'x', 1, ?, ?, ?, ?)");
        for (const x of WEEK) ins.run(ctx.project.worktree, x.kind ?? "cmd", x.tool, x.p, x.p, x.r, T0 + x.d * DAY, T0 + x.d * DAY);
        raw.prepare("INSERT INTO sources (session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts) VALUES ('s0', ?, 'claude-code', 'content', ?, 80000, 20, ?, '', 0)")
          .run(ctx.project.worktree, "run.mjs:git diff --no-index a b", T0 - 2 * DAY);
      } finally { raw.close(); }
    }

    test("[R8] stats/context-window: tokens kept out (bytes / 4, about) as a share of a 200K window", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addFixed(ctx);
      const rep = report((await ctxStats.handler({}, ctx)).text);
      // session s1 saved 544,793 B -> 136,198 tokens -> 68.1% of 200,000.
      // D-STATS-FIX-1 (3): the ratio and the window size show their source.
      assert.ok(rep.includes("\n  about 136K tokens kept out, 68% of a 200K window\n  (at 4 bytes per token; a Claude context window is 200K tokens)\n"), rep);
      // All rows sit in the last 7 days, so the week cards would repeat the project row: only the day chart shows.
      assert.ok(rep.includes("\nLast 7 days of use · 2026-10-20 to 2026-10-26\n  10-26 " + "█".repeat(15)), rep);
      assert.ok(!rep.includes("Tokens kept out "), rep);
    }));

    test("[R8] stats/hook-work: redirects (run.mjs sources) and replaces (host rows returned < produced) are counted", () => withRoot(async (root) => {
      const a = ctxFor(root);
      await addFixed(a);
      // D-STATS-FIX-1 (4): one count, labelled with its scope; a way with nothing to count is left out.
      const ra = report((await ctxStats.handler({}, a)).text);
      assert.ok(ra.includes("\n  Project hooks: 1 large output cut down\n"), ra);
      assert.ok(!/ 0 (redirected|sent|cut)/.test(ra), ra);
      const b = ctxFor(root, "s1", "claude-code");
      b.project = { ...b.project, projectKey: "6".repeat(16), projectDir: join(root, "projects", "6".repeat(16)), dbPath: join(root, "projects", "6".repeat(16), "context.db") };
      await addWeek(b);
      const rb = report((await ctxStats.handler({}, b)).text);
      assert.ok(rb.includes("\n  Project hooks: 3 large outputs kept out · 1 sent to the sandbox, 2 cut down\n"), rb);
    }));

    test("[R8] stats/top-outputs + index-and-search + footer: largest single outputs, sources vs searches, last line", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addWeek(ctx);
      const rep = report((await ctxStats.handler({}, ctx)).text);
      const top = (name, p, r) => "  " + name.padEnd(21) + p.padStart(11) + " → " + r.padStart(11);
      assert.ok(rep.includes("Largest single outputs (made → sent to the chat)\n" +
        [top("ctx_index", "216.8 KB", "300 B"), top("hook Bash", "156.3 KB", "421 B"), top("ctx_batch", "117.2 KB", "2.0 KB")].join("\n") + "\n\n"), rep);
      assert.ok(rep.includes("\n  Index and search     3 sources · 144 chunks · 297.9 KB · 1 ctx_search call\n"), rep);
      // D-STATS-FIX-1 (11): the funnel link carries UTM; the repo slug comes from ISSUE_REPO_SLUG.
      assert.deepEqual(rep.split("\n").slice(-2), ["https://contextmode.ai/?utm_source=ctx_stats&utm_medium=stats&utm_content=footer", "github.com/" + ISSUE_REPO_SLUG]);
    }));

    test("[R8] stats/last-7-days: four cards with spark lines, then one stacked bar per UTC day by way of saving", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addWeek(ctx);
      const rep = report((await ctxStats.handler({}, ctx)).text);
      // Window 10-20..10-26 (the day of the latest row; 10-17 is out). Saved per day by way, worked by hand:
      // 10-20 sandbox 29,000; 10-23 index 49,800 + replace 89,500; 10-24 redirect 80,000 - 16,384 (OUTPUT_CAP) = 63,616;
      // 10-26 sandbox 175,000 + index 218,700 + replace 159,593 = 553,293. Sum 785,209 B, 14 calls (13 rows + 1 run).
      // D-STATS-FIX-1 (6, 9): the year shows, the window ends on the last call (no clock); a 10-17 row is older,
      // so the cards add news; one chart, days with data only, no spark lines.
      const day = (d, bar, v) => "  " + d + " " + bar.padEnd(48) + v.padStart(11);
      assert.ok(rep.includes([
        "Last 7 days of use · 2026-10-20 to 2026-10-26",
        "  Kept out           Tokens kept out    Calls              Kept out per call",
        "  766.8 KB           about 196K         14                 54.8 KB",
        "",
        day("10-20", "█".repeat(3), "28.3 KB"),
        day("10-23", "▓".repeat(4) + "░".repeat(8), "136.0 KB"), day("10-24", "▒".repeat(6), "62.1 KB"),
        day("10-26", "█".repeat(15) + "▓".repeat(19) + "░".repeat(14), "540.3 KB"),
        "  █ sandbox run  ▓ index + search  ▒ hook sent to sandbox  ░ hook cut down",
      ].join("\n")), rep);
      assert.ok(!/ 0 B$/m.test(rep.split("Last 7 days")[1].split("By scope")[0]), "no empty days");
      for (const line of rep.split("\n")) assert.ok([...line].length <= 80, line);
      assert.equal((await ctxStats.handler({}, ctx)).text, (await ctxStats.handler({}, ctx)).text, "same journal, same bytes");
    }));

    // D-STATS-SNAPSHOT-1 (tester, next.34): one reply mixed two snapshots, "project (all-time) 15 calls" and
    // "ctx_index 16 calls". A second handle commits a row after the first SELECT of the reply has run.
    test("[R16] stats/one-snapshot: a write between the reads of one reply does not split its totals", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addRows(ctx, [["s1", "claude-code", 1000, 100], ["s1", "claude-code", 2000, 200], ["s2", "codex", 500, 50]]);
      const writer = await openDb(ctx.project);
      const dbFile = realpathSync(ctx.project.dbPath);
      const proto = DatabaseSync.prototype;
      const prepare = proto.prepare;
      let wrote = 0;
      proto.prepare = function (sql, ...rest) {
        if (wrote === 0 && this.location() !== null && realpathSync(this.location()) === dbFile && String(sql).includes("GROUP BY tool") && !String(sql).includes("day")) {
          wrote++;
          appendEvent(writer, { session_id: "s3", worktree: ctx.project.worktree, agent: "opencode", kind: "cmd", tool: "ctx_index",
            key: null, path: null, ok: 1, exit_code: null, bytes: 70, body: "x", turn: 1, sandbox_bytes: 70, returned_bytes: 7 });
        }
        return prepare.call(this, sql, ...rest);
      };
      let rep;
      try { rep = report((await ctxStats.handler({}, ctx)).text); } finally { proto.prepare = prepare; closeDb(writer); }
      assert.equal(wrote, 1, "the write ran between the reads");
      const callsOf = (title, text = rep) => {
        const lines = text.split("\n");
        const at = lines.findIndex((l) => l.startsWith("  " + title + " "));
        const out = [];
        for (const l of lines.slice(at + 1)) { if (l.trim() === "") break; out.push([l.slice(2, 23).trim(), Number(l.slice(23, 30).trim().replaceAll(",", ""))]); }
        return out;
      };
      const project = callsOf("Scope").find(([n]) => n === "project (all-time)")[1];
      const tools = callsOf("Tool").reduce((a, [, n]) => a + n, 0);
      assert.equal(tools, project, rep);
      assert.equal(project, 3, "the reply reads the snapshot of its first SELECT");
      assert.ok(rep.includes("By agent (this project)"), rep);
      assert.ok(!rep.includes("opencode   "), "the late row is not in the agent table either");
      const after = report((await ctxStats.handler({}, ctx)).text);
      assert.equal(callsOf("Scope", after).find(([n]) => n === "project (all-time)")[1], 4, "the next reply reads the new row");
    }));

    test("[R6] stats/report-empty: an empty journal gives a short, friendly report", () => withRoot(async (root) => {
      const out = await ctxStats.handler({}, ctxFor(root));
      const rep = report(out.text);
      assert.ok(rep.includes("Ready. Your savings show up here after the first tool call."), rep);
      assert.ok(rep.split("\n").length <= 6, rep);
      assert.ok(!/\b(no data|0\.0%)/.test(rep), "no table of zeros");
    }));
  });

  // Moved from tests/tools/purge.test.mjs
  describe("PRD-v2 section 12 / ctx_purge", () => {
    // [M4] Unit tests for src/core/tools/purge.ts (impl/06 §6, DEVIATIONS D-M4-arch-3): one scope of
    // session/source/project, one withWrite, exact reply texts from contracts.












    const KEY = "2".repeat(16);
    function ctxFor(root, sessionId = "s1") {
      const projectDir = join(root, "projects", KEY);
      return {
        project: { projectKey: KEY, projectDir, dbPath: join(projectDir, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
        sessionId, turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18",
      };
    }

    async function addEvents(ctx, sessionId, n) {
      const db = await openDb(ctx.project);
      try {
        for (let i = 0; i < n; i++) {
          appendEvent(db, { session_id: sessionId, worktree: ctx.project.worktree, agent: "claude-code", kind: "prompt", tool: null, key: null,
            path: null, ok: null, exit_code: null, bytes: 1, body: "p" + i, turn: 1, sandbox_bytes: 0, returned_bytes: 0 });
        }
      } finally { closeDb(db); }
    }

    async function counts(ctx) {
      const db = await openDb(ctx.project);
      try {
        const one = (sql) => Number(db.raw.prepare(sql).get().n);
        return { events: one("SELECT COUNT(*) AS n FROM events"), sources: one("SELECT COUNT(*) AS n FROM sources"), chunks: one("SELECT COUNT(*) AS n FROM chunks") };
      } finally { closeDb(db); }
    }

    async function withRoot(fn) {
      const root = mkdtempSync(join(tmpdir(), "cm-purge-"));
      try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
    }

    test("[M4] purge/tool-shape: ctx_purge is a write tool with a strict schema", () => {
      assert.equal(ctxPurge.name, "ctx_purge");
      assert.equal(ctxPurge.readOnly, false);
      assert.equal(ctxPurge.alwaysLoad, false);
      assert.equal(ctxPurge.schema.safeParse({ session: "a" }).success, true);
      assert.equal(ctxPurge.schema.safeParse({ bogus: 1 }).success, false);
    });

    test("[M4] purge/no-scope: zero scopes is the exact isError line", () => withRoot(async (root) => {
      const out = await ctxPurge.handler({}, ctxFor(root));
      assert.deepEqual([out.isError, out.text], [true, PURGE_NO_SCOPE_LINE]);
      const off = await ctxPurge.handler({ project: false }, ctxFor(root));
      assert.deepEqual([off.isError, off.text], [true, PURGE_NO_SCOPE_LINE]);
    }));

    test("[M4] purge/many-scopes: two or three scopes is the exact isError line and deletes nothing", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addEvents(ctx, "s1", 2);
      for (const input of [{ session: "s1", source: "x" }, { session: "s1", project: true }, { session: "s1", source: "x", project: true }]) {
        const out = await ctxPurge.handler(input, ctx);
        assert.deepEqual([out.isError, out.text], [true, PURGE_MANY_SCOPES_LINE]);
      }
      assert.equal((await counts(ctx)).events, 2);
    }));

    test("[M4] purge/session: deletes only that session's events and reports the count", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addEvents(ctx, "s1", 3);
      await addEvents(ctx, "s2", 2);
      await ctxIndex.handler({ content: "alpha beta", source: "note" }, ctx);
      const before = await counts(ctx);
      const out = await ctxPurge.handler({ session: "s1" }, ctx);
      assert.deepEqual([out.isError, out.text], [false, PURGE_SUMMARY(3, "session")]);
      const after = await counts(ctx);
      assert.equal(after.events, before.events - 3);
      assert.deepEqual([after.sources, after.chunks], [before.sources, before.chunks]);
    }));

    test("[M4] purge/session-empty: a session with nothing journaled is not an error", () => withRoot(async (root) => {
      const out = await ctxPurge.handler({ session: "never-seen" }, ctxFor(root));
      assert.deepEqual([out.isError, out.text], [false, PURGE_SUMMARY(0, "session")]);
    }));

    test("[M4] purge/source: deletes that source row and its chunks only", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await ctxIndex.handler({ content: "# one\nalpha\n\n# two\nbeta", source: "gone" }, ctx);
      await ctxIndex.handler({ content: "gamma delta", source: "kept" }, ctx);
      await addEvents(ctx, "s1", 1);
      const before = await counts(ctx);
      const db = await openDb(ctx.project);
      const goneChunks = Number(db.raw.prepare("SELECT COUNT(*) AS n FROM chunks WHERE source_id IN (SELECT id FROM sources WHERE label = 'gone')").get().n);
      closeDb(db);
      assert.ok(goneChunks >= 1);
      const out = await ctxPurge.handler({ source: "gone" }, ctx);
      assert.deepEqual([out.isError, out.text], [false, PURGE_SUMMARY(1 + goneChunks, "source")]);
      const after = await counts(ctx);
      assert.deepEqual(after, { events: before.events, sources: before.sources - 1, chunks: before.chunks - goneChunks });
    }));

    test("D-PATH-LABEL-1: purge/source takes the backslash form of a path label", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      mkdirSync(join(root, "nested"));
      writeFileSync(join(root, "nested", "notes.md"), "# N\n\npurgezedtoken\n");
      await ctxIndex.handler({ path: "nested/notes.md" }, ctx);
      const out = await ctxPurge.handler({ source: "nested\\notes.md" }, ctx);
      assert.equal(out.isError, false);
      assert.notEqual(out.text, PURGE_SUMMARY(0, "source"), "the backslash form reached the row: " + out.text);
      assert.deepEqual((await ctxSearch.handler({ queries: ["purgezedtoken"] }, ctx)).text.includes("nested/notes.md"), false);
    }));

    test("[M4] purge/source-unknown: an unknown source deletes zero rows", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await ctxIndex.handler({ content: "gamma", source: "kept" }, ctx);
      const out = await ctxPurge.handler({ source: "nope" }, ctx);
      assert.deepEqual([out.isError, out.text], [false, PURGE_SUMMARY(0, "source")]);
    }));

    test("[M4] purge/project: deletes every events, sources and chunks row of this project's DB", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addEvents(ctx, "s1", 2);
      await addEvents(ctx, "s2", 1);
      await ctxIndex.handler({ content: "alpha beta", source: "a" }, ctx);
      const before = await counts(ctx);
      const out = await ctxPurge.handler({ project: true }, ctx);
      assert.deepEqual([out.isError, out.text], [false, PURGE_SUMMARY(before.events + before.sources + before.chunks, "project")]);
      assert.deepEqual(await counts(ctx), { events: 0, sources: 0, chunks: 0 });
    }));

    test("[M4] purge/project-isolated: never touches another project's context.db", () => withRoot(async (root) => {
      const a = ctxFor(root);
      const other = mkdtempSync(join(tmpdir(), "cm-purge-other-"));
      try {
        const b = ctxFor(other);
        await addEvents(a, "s1", 1);
        await addEvents(b, "s1", 2);
        await ctxPurge.handler({ project: true }, a);
        assert.equal((await counts(b)).events, 2);
      } finally { rmSync(other, { recursive: true, force: true }); }
    }));

    test("[M4] purge/busy: a held write lock past the DB timeout is the exact busy line, no retry, nothing deleted", () => withRoot(async (root) => {
      const ctx = ctxFor(root);
      await addEvents(ctx, "s1", 2);
      const holder = new DatabaseSync(ctx.project.dbPath);
      holder.exec("BEGIN IMMEDIATE");
      try {
        const out = await ctxPurge.handler({ session: "s1" }, ctx);
        assert.deepEqual([out.isError, out.text], [true, PURGE_BUSY_LINE]);
      } finally {
        holder.exec("ROLLBACK");
        holder.close();
      }
      assert.equal((await counts(ctx)).events, 2);
    }));
  });
});
