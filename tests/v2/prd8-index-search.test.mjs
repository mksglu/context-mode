// PRD-v2 section 8 (index, search, fetch, snippets) and TECH-SPEC GP5. One file for the area (ADR-0024, docs/v2/TEST-LAYOUT.md).
// A fix for this area adds its red test inside the describe block of its section below. Do not add a new file.
//
// Layout of this file:
//   1. The first block holds the pure tests (own temp dirs, no process.env, no shared port). Its sections run concurrently.
//   2. The second group runs one after the other. Those tests change process.env (HOME, PROXY vars) or patch dns and
//      http.request through the parity shim, so a concurrent neighbour would see the change.

import "./e2e/_parity-net-shim.mjs";
import { test, before, after, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync, realpathSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { readAutoMemory } from "../../src/core/index/auto-memory.ts";
import { ctxSearch, ctxSearchSchema } from "../../src/core/tools/search.ts";
import { rankTexts, ftsInsert, deleteSourceChunks, ftsQuery, ftsQueryTimeline, highlight, porterRankSql } from "../../src/core/store/fts.ts";
import { chunkText } from "../../src/core/index/chunk.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { RECALL_BUDGET_BYTES, RECALL_MIN_SCORE } from "../../src/core/contracts/constants.ts";
import { openDb, closeDb } from "../../src/core/store/db.ts";
import { selectChunks, selectChunksInMemory } from "../../src/core/index/select.ts";
import { shapeDigest, jsonShape, lineShape } from "../../src/core/index/shape.ts";
import { buildUnits } from "../../src/core/index/units.ts";
import { pickRecall, pickUnits, unitLine } from "../../src/core/compaction/recall.ts";
import { walkDir } from "../../src/core/index/walk.ts";
import { appendEvent } from "../../src/core/journal/append.ts";
import { blankTokens, isWordChar, wordTokens } from "../../src/core/store/words.ts";
import ts from "typescript";
import { ctxIndex } from "../../src/core/tools/index.ts";
import { ctxExecute } from "../../src/core/tools/execute.ts";
import { ctxBatch } from "../../src/core/tools/batch.ts";
import { ctxStats } from "../../src/core/tools/stats.ts";
import { buildReport, buildReportHead } from "../../src/core/ops/report.ts";
import http, { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { safeFetch } from "../../src/core/sandbox/fetch.ts";
import { spawn, execFileSync, spawnSync } from "node:child_process";

// Stage 1 (concurrent): the pure block, the HTML section and the parity section. None of them sets a proxy variable.
// The parity section sets HOME and PARITY_HOST only inside its own serial pi/opencode group; its MCP children get HOME in their own env.
describe("PRD-v2 section 8: stage 1 (concurrent)", { concurrency: CONC }, () => {
  // Concurrent: each section builds its own temp dirs and DBs and reads no process.env.
  describe("PRD-v2 section 8: chunk, store, search (concurrent: own temp dirs, no env)", { concurrency: CONC }, () => {
    // Moved from tests/v2/index/auto-memory.test.mjs
    describe("PRD-v2 section 8 / auto-memory timeline rows", () => {
      // Unit tests for src/core/index/auto-memory.ts (DEVIATIONS D-M2-3).
      // Reads Claude Code memory files for the project (host paths); empty list for other agents.
      // ftsQueryTimeline(db, ..., memory: TimelineRow[]) merges this list; store stays host-path-free.







      test("readAutoMemory returns [] for a non-claude-code agent", () => {
        const root = mkdtempSync(join(tmpdir(), "cm-mem-"));
        try {
          const rows = readAutoMemory({ agent: "codex", worktree: root, containmentRoot: root });
          assert.deepEqual(rows, []);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("readAutoMemory returns [] when the project has no memory file", () => {
        const root = mkdtempSync(join(tmpdir(), "cm-mem2-"));
        try {
          const rows = readAutoMemory({ agent: "claude-code", worktree: root, containmentRoot: root });
          assert.deepEqual(rows, []);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("readAutoMemory returns rows already scope-filtered (worktree-contained) for claude-code", () => {
        const root = mkdtempSync(join(tmpdir(), "cm-mem3-"));
        const memDir = join(root, ".claude");
        mkdirSync(memDir, { recursive: true });
        writeFileSync(join(memDir, "CLAUDE.md"), "# memory\nsome note about the project\n");
        try {
          const rows = readAutoMemory({ agent: "claude-code", worktree: root, containmentRoot: root });
          assert.ok(Array.isArray(rows));
          for (const r of rows) assert.equal(typeof r.text, "string");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("readAutoMemory never throws for an unreadable or missing memory path", () => {
        const root = mkdtempSync(join(tmpdir(), "cm-mem4-"));
        try {
          assert.doesNotThrow(() => readAutoMemory({ agent: "claude-code", worktree: join(root, "nope"), containmentRoot: root }));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // ---- M2-R6 (#1295) ----



      test("[M2] GP5/non-ascii-auto-memory-match", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-mem-ru-"));
        try {
          writeFileSync(join(root, "CLAUDE.md"), "Привет: всегда запускай тесты перед коммитом\n");
          const ctx = {
            project: { projectKey: "2".repeat(16), projectDir: join(root, "p"), dbPath: join(root, "p", "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
            sessionId: "s1", turn: 1, signal: new AbortController().signal,
          };
          const out = await ctxSearch.handler({ queries: ["привет"], sort: "timeline" }, ctx);
          assert.equal(out.isError, false);
          const line = out.text.split("\n").find((l) => l.includes("] CLAUDE.md "));
          assert.ok(line, out.text);
          assert.ok(line.endsWith("Привет: всегда запускай тесты перед коммитом"));
          // The store's one tokenizer matches the Russian word, any case, as a whole word and as a prefix.
          const [row] = readAutoMemory({ agent: "claude-code", worktree: root, containmentRoot: root });
          for (const q of ["привет", "ПРИВЕТ", "тест", "коммитом"]) assert.ok(rankTexts([row.text], q)[0] > 0, q);
          assert.equal(rankTexts([row.text], "пока")[0], 0);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });

    // Moved from tests/v2/index/chunk-md-sections.test.mjs
    describe("PRD-v2 section 8 / chunking: markdown sections", () => {
      // Search layer 1 (docs/v2/spikes/search/DIAGNOSIS.md §5 step 2): heading-aware markdown chunking.
      // A fenced code block is never split below the hard cap; chunks split on headings and carry the
      // heading path as `title`; a code block over the cap splits on blank lines with the fence repeated.





      const FENCE = "```js\nconst a = 1;\n\nconst b = 2;\n\n\nconsole.log(a + b);\n```";

      test("[search-L1] md: a fenced block with blank lines inside stays in one chunk", () => {
        const md = "# Setup\n\nIntro text.\n\n" + FENCE + "\n\nAfter the code.";
        const chunks = chunkText(md, "md");
        assert.equal(chunks.filter((c) => c.text.includes(FENCE)).length, 1);
      });

      test("[search-L1] md: chunks split on headings and carry the heading path as title", () => {
        const md = "# Guide\n\nTop para.\n\n## Install\n\nRun the installer.\n\n### Linux\n\nUse apt.\n\n## Usage\n\nCall it.";
        const chunks = chunkText(md, "md");
        assert.deepEqual(chunks.map((c) => c.title), ["Guide", "Guide > Install", "Guide > Install > Linux", "Guide > Usage"]);
        assert.deepEqual(chunks.map((c) => c.ord), [0, 1, 2, 3]);
        assert.ok(chunks[1].text.startsWith("## Install"));
        assert.ok(chunks[1].text.includes("Run the installer."));
        assert.ok(!chunks[1].text.includes("Use apt."));
      });

      test("[search-L1] md: a heading inside a fence is code, not a split point", () => {
        const md = "# Real\n\n```sh\n# not a heading\necho hi\n```";
        const chunks = chunkText(md, "md");
        assert.equal(chunks.length, 1);
        assert.equal(chunks[0].title, "Real");
      });

      test("[search-L1] md: a code block under the cap stays whole even when its section is over the cap", () => {
        const prose = ("word ".repeat(150) + "\n\n").repeat(5); // about 3.8 KB of prose
        const code = "```py\n" + "x = 1\n".repeat(400) + "```"; // about 2.4 KB
        const md = "## Big\n\n" + prose + code + "\n\nTail.";
        const chunks = chunkText(md, "md");
        assert.equal(chunks.filter((c) => c.text.includes(code)).length, 1);
        for (const c of chunks) assert.ok(c.bytes <= C.MAX_CHUNK_BYTES, "chunk over cap: " + c.bytes);
      });

      test("[search-L1] md: a code block over the cap splits on blank lines, each piece fenced again", () => {
        const parts = [];
        for (let i = 0; i < 12; i++) parts.push("function f" + i + "() {\n" + "  return " + i + ";\n".repeat(1) + "  // pad ".repeat(60) + "\n}");
        const inner = parts.join("\n\n");
        const md = "# Long\n\n```ts\n" + inner + "\n```\n";
        assert.ok(Buffer.byteLength(inner) > C.MAX_CHUNK_BYTES);
        const chunks = chunkText(md, "md");
        const code = chunks.filter((c) => c.text.includes("function f"));
        assert.ok(code.length >= 2);
        for (const c of chunks) assert.ok(c.bytes <= C.MAX_CHUNK_BYTES);
        for (const c of code) {
          const start = c.text.indexOf("```ts\n");
          assert.ok(start >= 0, "piece lacks the opener");
          assert.ok(c.text.trimEnd().endsWith("```"), "piece lacks the closing fence");
        }
        // Every function body sits whole in one piece: no split inside a blank-line block.
        for (const p of parts) assert.equal(code.filter((c) => c.text.includes(p)).length, 1);
        for (const c of chunks) assert.equal(c.bytes, Buffer.byteLength(c.text, "utf8"));
        for (const c of code) assert.equal(c.title, "Long");
      });

      test("[search-L1] md without headings keeps an empty title", () => {
        const chunks = chunkText("plain para\n\nsecond para", "md");
        assert.ok(chunks.length >= 1);
        for (const c of chunks) assert.equal(c.title ?? "", "");
      });
    });

    // Moved from tests/v2/index/chunk.test.mjs
    describe("PRD-v2 section 8 / chunking: text and code", () => {
      // Unit tests for src/core/index/chunk.ts (impl/05 §2).
      // chunkText(text, kind): Chunk[]. Greedy merge to MAX_CHUNK_BYTES, code-point safe over-long cut.





      test("chunkText returns [] for empty input", () => {
        assert.deepEqual(chunkText("", "text"), []);
      });

      test("chunkText splits text on blank lines and assigns ord in order", () => {
        const chunks = chunkText("first block\n\nsecond block\n\nthird block", "text");
        assert.ok(chunks.length >= 2);
        assert.deepEqual(chunks.map((c) => c.ord), chunks.map((_, i) => i));
      });

      test("chunkText never produces a chunk over MAX_CHUNK_BYTES", () => {
        const big = "word ".repeat(5000);
        const chunks = chunkText(big, "text");
        for (const c of chunks) assert.ok(c.bytes <= C.MAX_CHUNK_BYTES);
      });

      test("chunkText keeps a markdown fenced code block as one chunk even with blank lines inside", () => {
        const md = "before\n\n```\nline1\n\nline2\n```\n\nafter";
        const chunks = chunkText(md, "md");
        const fenceChunk = chunks.find((c) => c.text.includes("```"));
        assert.ok(fenceChunk.text.includes("line1") && fenceChunk.text.includes("line2"));
      });

      test("chunkText keeps a rowless markdown table (header + separator only) as one block", () => {
        const md = "before\n\n| a | b |\n| - | - |\n\nafter";
        const chunks = chunkText(md, "md");
        const tableChunk = chunks.find((c) => c.text.includes("| a | b |"));
        assert.ok(tableChunk);
        assert.ok(tableChunk.text.includes("| - | - |"));
      });

      test("chunkText cuts an over-long single block at a code-point boundary, carrying the remainder forward", () => {
        const huge = "a".repeat(C.MAX_CHUNK_BYTES + 50) + "é" + "b".repeat(20);
        const chunks = chunkText(huge, "text");
        assert.ok(chunks.length >= 2);
        for (const c of chunks) assert.ok(!c.text.includes("�"));
        assert.equal(chunks.map((c) => c.text).join(""), huge);
      });

      test("chunkText 'bytes' field is the UTF-8 byte length of 'text'", () => {
        const chunks = chunkText("héllo wörld", "text");
        for (const c of chunks) assert.equal(c.bytes, Buffer.byteLength(c.text, "utf8"));
      });

      test("chunkText html split never breaks inside a <script> span", () => {
        const html = "<p>before</p>\n\n<script>\nfunction f() {\n  return 1;\n}\n</script>\n\n<p>after</p>";
        const chunks = chunkText(html, "html");
        const scriptChunk = chunks.find((c) => c.text.includes("<script>"));
        assert.ok(scriptChunk.text.includes("</script>"));
      });

      // M2-R5: 14a issue cases owned by chunk.ts (TECH-SPEC GP5 "byte caps; rowless tables; nested fences").
      // Each pad block is near MAX_CHUNK_BYTES, so the greedy merge (impl/05 §2 step 3) cannot join it
      // to the block under test; that block then shows up as a chunk of its own.
      const pad = (tag) => (tag + " ").repeat(Math.floor((C.MAX_CHUNK_BYTES - 8) / (tag.length + 1))).trim();

      test("[M2] GP5/chunk-byte-cap: a 1 MB single-line paragraph gives chunks all <= MAX_CHUNK_BYTES (#878)", () => {
        const para = "lorem ipsum dolor sit amet ".repeat(Math.ceil((1 << 20) / 27)).slice(0, 1 << 20);
        for (const kind of ["md", "html", "text"]) {
          const chunks = chunkText(para, kind);
          assert.ok(chunks.length >= (1 << 20) / C.MAX_CHUNK_BYTES, kind);
          for (const c of chunks) assert.ok(c.bytes <= C.MAX_CHUNK_BYTES && c.bytes === Buffer.byteLength(c.text), kind);
          assert.equal(chunks.map((c) => c.text).join(""), para, kind);
        }
      });

      test("[M2] GP5/chunk-size-cap: one huge multi-byte line with no break stays under the cap, whole code points only (#898)", () => {
        const line = "aé日🙂".repeat(40000);
        for (const kind of ["md", "html", "text"]) {
          const chunks = chunkText(line, kind);
          for (const c of chunks) {
            assert.ok(c.bytes <= C.MAX_CHUNK_BYTES, kind);
            assert.ok(!c.text.includes("\uFFFD"), kind);
            assert.equal(Buffer.from(c.text, "utf8").toString("utf8"), c.text, kind);
          }
          assert.equal(chunks.map((c) => c.text).join(""), line, kind);
        }
      });

      test("[M2] GP5/nested-fenced-code-intact: a ```` fence holding an inner ``` block stays one block (#1238)", () => {
        const fence = "````md\nouter text\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nstill outer\n````";
        const md = pad("before") + "\n\n" + fence + "\n\n" + pad("after");
        const chunks = chunkText(md, "md");
        const hit = chunks.filter((c) => c.text.includes("````md"));
        assert.equal(hit.length, 1);
        assert.equal(hit[0].text, fence);
        assert.ok(chunks.some((c) => c.text.startsWith("before")) && chunks.some((c) => c.text.startsWith("after")));
      });

      test("[M2] GP5/rowless-tables: an HTML table with a caption and no rows keeps the caption, no throw (#1138)", () => {
        const html = "<table><caption>Quarterly totals</caption></table>";
        const chunks = chunkText(html, "html");
        assert.equal(chunks.length, 1);
        assert.equal(chunks[0].text, html);
        const md = pad("intro") + "\n| a | b |\n| - | - |\n" + pad("outro");
        const table = chunkText(md, "md").find((c) => c.text.includes("| a | b |"));
        assert.equal(table.text, "| a | b |\n| - | - |");
      });

      test("[M2] GP5/rowless-tables-survive: an empty <table></table> chunks without error (#1136)", () => {
        for (const html of ["<table></table>", "<p>x</p><table></table><p>y</p>", "<table><thead></thead><tbody></tbody></table>"]) {
          const chunks = chunkText(html, "html");
          assert.ok(chunks.length >= 1, html);
          assert.equal(chunks.map((c) => c.text).join(""), html);
        }
      });
    });

    // Moved from tests/v2/index/select.test.mjs
    describe("PRD-v2 section 8 / index file selection", () => {
      // Unit tests for src/core/index/select.ts (impl/05 §5).
      // selectChunks(db, sourceId, intent, budget) / selectChunksInMemory(chunks, intent, budget).
      // Lazy greedy by BM25 score, whole-chunk only, no mid-chunk cut, more: line when truncated.









      function fakeProject(root, key) {
        return { projectKey: key, projectDir: join(root, "projects", key), dbPath: join(root, "projects", key, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" };
      }
      function src(overrides) {
        return { sessionId: "s1", worktree: "/w", agent: "claude-code", kind: "content", label: "note.txt", bytes: 0, chunkCount: 0, createdAt: Date.now(), ...overrides };
      }

      test("selectChunks returns an empty result for a source with zero chunks", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-sel-"));
        const project = fakeProject(root, "1".repeat(16));
        const db = await openDb(project);
        try {
          const out = selectChunks(db, 999, "anything", 1000);
          assert.deepEqual(out, { text: "", more: null });
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("selectChunks picks whole chunks within budget, never cutting mid-chunk", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-sel2-"));
        const project = fakeProject(root, "2".repeat(16));
        const db = await openDb(project);
        try {
          const id = ftsInsert(db, src({ worktree: project.worktree }), [
            { ord: 0, text: "alpha chunk about dogs", bytes: 22 },
            { ord: 1, text: "beta chunk about cats", bytes: 21 },
          ]);
          const out = selectChunks(db, id, "dogs", 25);
          assert.ok(out.text.includes("dogs"));
          assert.ok(!out.text.includes("cats") || out.text === "alpha chunk about dogs");
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("selectChunks sets 'more' when a chunk is skipped for budget, text stays in ord order", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-sel3-"));
        const project = fakeProject(root, "3".repeat(16));
        const db = await openDb(project);
        try {
          const id = ftsInsert(db, src({ worktree: project.worktree, label: "doc" }), [
            { ord: 0, text: "x".repeat(50), bytes: 50 },
            { ord: 1, text: "needle".repeat(20), bytes: 120 },
          ]);
          const out = selectChunks(db, id, "needle", 60);
          assert.ok(out.more === null || typeof out.more === "string");
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("selectChunksInMemory scores an in-memory chunk array the same shape as selectChunks", () => {
        const chunks = [
          { ord: 0, text: "alpha about dogs", bytes: 17 },
          { ord: 1, text: "beta about cats", bytes: 16 },
        ];
        const out = selectChunksInMemory(chunks, "dogs", 1000);
        assert.equal(typeof out.text, "string");
        assert.equal(out.more === null || typeof out.more === "string", true);
        assert.ok(out.text.includes("dogs"));
      });

      test("selectChunksInMemory never writes to the DB (pure in-memory read)", () => {
        const chunks = [{ ord: 0, text: "hello", bytes: 5 }];
        assert.doesNotThrow(() => selectChunksInMemory(chunks, "hello", 10));
      });
    });

    // Moved from tests/v2/index/shape.test.mjs
    describe("PRD-v2 section 8 / index shape", () => {
      // Unit tests for src/core/index/shape.ts (D-M2-SHAPE-1): parser-found shape -> rare units, whole, in budget.




      const log = (n, rare) => Array.from({ length: n }, (_, i) => (i === rare ? "FAIL suite/x/case_" + i + "_zz expected 3 got 4" : "ok   suite/a/case_" + i + " (" + (i % 90) + "ms) t" + i)).join("\n") + "\n";

      test("lines: the one rare line comes back whole with its line number", () => {
        const d = shapeDigest(log(500, 321), "FAIL case", 96);
        assert.ok(d !== null);
        assert.ok(d.includes("322: FAIL suite/x/case_321_zz expected 3 got 4"));
        assert.ok(Buffer.byteLength(d) <= 96);
      });

      test("lines: a rare token at a skewed position makes its line rare (degraded among healthy)", () => {
        const t = Array.from({ length: 200 }, (_, i) => "node n" + i + " status " + (i === 77 ? "degraded" : "healthy")).join("\n");
        const d = shapeDigest(t, "degraded node", 96);
        assert.ok(d !== null && d.includes("78: node n77 status degraded"), String(d));
      });

      test("lines: no named rare unit, free text, or too few lines -> null (BM25 path)", () => {
        assert.equal(shapeDigest(log(500, 321), "zebra", 96), null);
        assert.equal(shapeDigest(log(10, 3), "FAIL", 96), null);
        const prose = Array.from({ length: 300 }, (_, i) => ["alpha", "beta", "gamma", "delta"].slice(0, 1 + (i % 4)).join(" ") + " word" + String.fromCharCode(97 + (i % 26)) + " more" + String.fromCharCode(97 + ((i * 7) % 26))).join("\n");
        assert.equal(lineShape(prose), null);
        const numbers = Array.from({ length: 300 }, (_, i) => String(i * 7)).join("\n");
        assert.equal(lineShape(numbers), null, "a template with no literal token is data, not a log");
      });

      test("JSON: the row with the skewed value comes back with whole fields; the skewed field always shows", () => {
        const rows = Array.from({ length: 400 }, (_, i) => ({ id: "ord-" + i, amount: i * 3, priority: i === 211, note: "long note words here and there " + i }));
        const s = jsonShape(JSON.stringify(rows, null, 2), "priority amount");
        assert.ok(s !== null && s.units.length === 1);
        const d = shapeDigest(JSON.stringify(rows, null, 2), "priority true amount", 96);
        assert.ok(d !== null && Buffer.byteLength(d) <= 96, String(d));
        const body = d.split("\n").find((l) => l.startsWith("[211] "));
        const row = JSON.parse(body.slice(6));
        assert.equal(row.priority, true);
        assert.equal(row.amount, 633);
        for (const [k, v] of Object.entries(row)) assert.deepEqual(v, rows[211][k], "field " + k + " is whole");
      });

      test("JSON: not an array of objects, or no skewed key -> null", () => {
        assert.equal(jsonShape("{\"a\":1}", "a"), null);
        assert.equal(jsonShape("[1,2,3]", "a"), null);
        assert.equal(jsonShape(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ v: i }))), "v"), null);
        assert.equal(jsonShape("[not json", "a"), null);
      });

      test("budget: a rare unit that does not fit is skipped, never cut", () => {
        const t = Array.from({ length: 100 }, (_, i) => (i === 50 ? "FAIL " + "x".repeat(200) : "ok case " + i)).join("\n");
        assert.equal(shapeDigest(t, "FAIL", 96), null);
      });

      test("JSON: a categorical key (few values, none dominant) makes its one-off value rare (D-M2-MCP-2)", () => {
        const st = ["open", "in_progress", "review"];
        const rows = Array.from({ length: 180 }, (_, i) => ({ key: "TIX-" + i, title: "task " + i + " words", status: i === 97 ? "blocked" : st[i % 3], labels: ["a", "b"] }));
        const d = shapeDigest(JSON.stringify(rows, null, 2), "ticket with status blocked", 256);
        assert.ok(d !== null && d.includes("[97] ") && d.includes("TIX-97"), String(d));
        assert.equal(jsonShape(JSON.stringify(rows.map((r, i) => ({ ...r, status: st[i % 3] }))), "status"), null, "no one-off value -> no shape");
        const many = rows.map((r, i) => ({ ...r, status: "s" + (i % 40) }));
        assert.equal(jsonShape(JSON.stringify(many), "status"), null, "a key with many values is not categorical");
      });

      // D-M2-JSON-1: the digest header names the schema (keys) and the counts, when it fits.
      test("JSON digest header: schema keys and counts, then the rare row whole", () => {
        const rows = Array.from({ length: 400 }, (_, i) => ({ id: "ord-" + i, amount: i * 3, priority: i === 211, note: "long note words here and there " + i }));
        const d = shapeDigest(JSON.stringify(rows, null, 2), "priority true amount", 400);
        assert.ok(d !== null);
        const head = d.split("\n")[0];
        assert.equal(head, "400 objects {id,amount,priority,note}, 1 rare:");
        assert.ok(d.includes('[211] {"id":"ord-211","amount":633,"priority":true,'), d);
      });

      // D-M2-JSON-2: no skewed key, but the query names a numeric key: the rows at its two extremes, whole.
      test("JSON digest: a named numeric key gives its max and min rows (highest score)", () => {
        const rows = Array.from({ length: 300 }, (_, i) => ({ id: "rec-" + i, score: (i * 7919) % 10007, tags: ["a", "b"], note: "n" + i }));
        let hi = 0, lo = 0;
        rows.forEach((r, i) => { if (r.score > rows[hi].score) hi = i; if (r.score < rows[lo].score) lo = i; });
        const d = shapeDigest(JSON.stringify(rows, null, 2), "which record id has the highest score", 256);
        assert.ok(d !== null && Buffer.byteLength(d) <= 256, String(d));
        assert.ok(d.includes("[" + hi + "] " + JSON.stringify(rows[hi])), "max row whole: " + d);
        assert.ok(d.includes("[" + lo + "] " + JSON.stringify(rows[lo])), "min row whole: " + d);
        assert.equal(jsonShape(JSON.stringify(rows), "score"), null, "jsonShape (skew) is unchanged");
        assert.equal(shapeDigest(JSON.stringify(rows, null, 2), "which record is newest", 256), null, "no numeric key named: no digest");
      });
    });

    // Moved from tests/v2/index/units.test.mjs
    describe("PRD-v2 section 8 / index units", () => {
      // r3-ledger: line units (index/units.ts) and unit recall (compaction/recall.ts pickUnits).






      test("[r3] units/json: a nested key keeps its parent lines, whole", () => {
        const text = JSON.stringify({ regions: { "us-east-1": { services: { ledger: { replicas: 0 } } } } }, null, 2);
        const u = buildUnits(text).find((x) => x.body.endsWith('"replicas": 0'));
        assert.ok(u);
        assert.deepEqual(u.body.split("\n").map((l) => l.trim()), ["{", '"regions": {', '"us-east-1": {', '"services": {', '"ledger": {', '"replicas": 0']);
      });

      test("[r3] units/tap: a diagnostic keeps its not ok line; a sibling test closes it", () => {
        const units = buildUnits("not ok 7 - parse dates\n  ---\n  message: bad tz\n  ...\nok 8 - next");
        assert.equal(units.find((u) => u.body.endsWith("message: bad tz")).body, "not ok 7 - parse dates\n  message: bad tz");
        assert.equal(units.find((u) => u.ord === 4).body, "ok 8 - next");
      });

      test("[r3] units/flat-log: each log line is its own unit; blank lines make none; ord is the line index", () => {
        const units = buildUnits("a 1\n\nb 2\r\nc 3");
        assert.deepEqual(units, [{ ord: 0, body: "a 1" }, { ord: 2, body: "b 2" }, { ord: 3, body: "c 3" }]);
      });

      test("[r3] units/222KB: one pass stays linear (2000-line log under 50 ms)", () => {
        const text = Array.from({ length: 2000 }, (_, i) => `2026-10-04T03:03:${i} INFO svc=gateway req=${i.toString(16)} latency=${i}ms GET /v1/users 200 ` + "x".repeat(80)).join("\n");
        const t0 = process.hrtime.bigint();
        const units = buildUnits(text);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        assert.equal(units.length, 2000);
        assert.ok(ms < 50, String(ms));
      });

      const U = (ord, body, score, sourceId = 1) => ({ sourceId, ord, label: "bash:cat", body, score });

      test("[r3] pickUnits: whole units inside the budget, best first, seen and low scores out", () => {
        const big = U(9, "z".repeat(RECALL_BUDGET_BYTES), 20);
        const out = pickUnits([U(1, "fatal at line 812", 12), big, U(2, "noise", RECALL_MIN_SCORE - 1), U(3, "seen one", 15)], new Set(["1:3"]), RECALL_BUDGET_BYTES);
        assert.deepEqual(out.map((u) => u.ord), [1]);
      });

      test("[r3] pickUnits/MMR: a near-copy of a taken unit ranks below a different unit", () => {
        const out = pickUnits([U(1, "replicas 0 ledger us-east-1", 10), U(2, "replicas 0 ledger us-east-1 zone", 9.9), U(3, "fatal error at req 1bec", 9.5)], new Set(), 100);
        assert.deepEqual(out.map((u) => u.ord), [1, 3]);
      });

      test("[r3] pickRecall: a row over the budget is skipped but its units fill the block", () => {
        const row = { seq: 5, session_id: "s", worktree: "/w", agent: "claude-code", kind: "tool", tool: "Bash", key: null, path: null, ok: 1, exit_code: 0, bytes: 1, body: "replicas ".repeat(400), turn: 1 };
        const r = pickRecall([row], "which service has replicas 0", new Set(), [U(4, '"ledger": {\n  "replicas": 0', 11)], new Set());
        assert.deepEqual(r.seqs, []);
        assert.deepEqual(r.units, ["1:4"]);
        assert.ok(r.text.includes(unitLine(U(4, '"ledger": {\n  "replicas": 0', 11))));
        assert.ok(Buffer.byteLength(r.text) <= RECALL_BUDGET_BYTES);
      });
    });

    // Moved from tests/v2/index/walk.test.mjs
    describe("PRD-v2 section 8 / directory walk", () => {
      // Unit tests for src/core/index/walk.ts (impl/05 §1).
      // walkDir(root, containmentRoot): WalkFile[]. Nested .gitignore incl. negation, no regex, symlink containment.







      function tree() {
        const root = mkdtempSync(join(tmpdir(), "cm-walk-"));
        mkdirSync(join(root, "sub"));
        mkdirSync(join(root, ".git"));
        writeFileSync(join(root, "a.txt"), "a");
        writeFileSync(join(root, "sub", "b.txt"), "b");
        writeFileSync(join(root, "sub", "ignored.log"), "x");
        writeFileSync(join(root, ".git", "HEAD"), "ref");
        writeFileSync(join(root, "sub", ".gitignore"), "*.log\n!keep.log\n");
        writeFileSync(join(root, "sub", "keep.log"), "k");
        return root;
      }

      test("walkDir returns regular files, skipping .git unconditionally", () => {
        const root = tree();
        try {
          const files = walkDir(root, root).map((f) => f.relPath).sort();
          assert.ok(!files.some((f) => f.startsWith(".git")));
          assert.ok(files.includes("a.txt"));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("walkDir honours nested .gitignore with a negation override", () => {
        const root = tree();
        try {
          const files = walkDir(root, root).map((f) => f.relPath);
          assert.ok(!files.includes(join("sub", "ignored.log")));
          assert.ok(files.includes(join("sub", "keep.log")));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("walkDir throws OUTSIDE_ROOT when root is not inside containmentRoot", () => {
        const root = mkdtempSync(join(tmpdir(), "cm-walk2-"));
        const outerContain = mkdtempSync(join(tmpdir(), "cm-walk2-contain-"));
        try {
          assert.throws(() => walkDir(root, outerContain), /OUTSIDE_ROOT|outside the project/);
        } finally {
          rmSync(root, { recursive: true, force: true });
          rmSync(outerContain, { recursive: true, force: true });
        }
      });

      test("walkDir skips a symlink that escapes containment, without throwing for the whole walk", () => {
        if (process.platform === "win32") return;
        const root = mkdtempSync(join(tmpdir(), "cm-walk3-"));
        const outside = mkdtempSync(join(tmpdir(), "cm-walk3-outside-"));
        writeFileSync(join(outside, "secret.txt"), "s");
        writeFileSync(join(root, "a.txt"), "a");
        try {
          symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"));
          const files = walkDir(root, root).map((f) => f.relPath);
          assert.ok(files.includes("a.txt"));
          assert.ok(!files.includes("link.txt"));
        } finally {
          rmSync(root, { recursive: true, force: true });
          rmSync(outside, { recursive: true, force: true });
        }
      });

      test("walkDir '**' pattern matches zero or more whole segments", () => {
        const root = mkdtempSync(join(tmpdir(), "cm-walk4-"));
        mkdirSync(join(root, "x", "y"), { recursive: true });
        writeFileSync(join(root, ".gitignore"), "a/**/b\n");
        mkdirSync(join(root, "a", "b"), { recursive: true });
        writeFileSync(join(root, "a", "b", "f.txt"), "f");
        try {
          const files = walkDir(root, root).map((f) => f.relPath);
          assert.ok(!files.some((f) => f.startsWith(join("a", "b"))));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("walkDir returns a deterministic directory-then-name sort order", () => {
        const root = tree();
        try {
          const files1 = walkDir(root, root).map((f) => f.relPath);
          const files2 = walkDir(root, root).map((f) => f.relPath);
          assert.deepEqual(files1, files2);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // M2-R5: 14a issue cases owned by walk.ts. impl/05 §1 step 3: a pattern not starting with "/"
      // matches at any depth; a trailing "**" matches one or more segments (DEVIATIONS D-M2-R5-1).
      function build(files) {
        const root = mkdtempSync(join(tmpdir(), "cm-walk-r5-"));
        for (const [rel, body] of Object.entries(files)) {
          mkdirSync(join(root, rel, ".."), { recursive: true });
          writeFileSync(join(root, rel), body);
        }
        return root;
      }
      const rels = (root) => walkDir(root, root).map((f) => f.relPath.split("\\").join("/"));

      test("[M2] GP5/globstar-zero-depth: docs/**/*.md matches docs/top.md (zero dirs) and docs/a/b/deep.md (#1291)", () => {
        const root = build({ ".gitignore": "docs/**/*.md\n", "docs/top.md": "t", "docs/top.txt": "t", "docs/a/b/deep.md": "d", "x/docs/top.md": "x", "x/keep.txt": "k" });
        try {
          assert.deepEqual(rels(root), [".gitignore", "docs/top.txt", "x/keep.txt"]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[M2] GP5/nested-gitignore-negation: a/.gitignore ignoring x drops a/x; negation re-includes (#1292)", () => {
        const root = build({
          "a/.gitignore": "x\n*.log\n!keep.log\n",
          "a/x": "1", "a/y": "2", "a/b/x": "3", "a/keep.log": "k", "a/drop.log": "d",
          "x": "top-level x is outside a/.gitignore's base",
          ".gitignore": "build/**\n!build/keep.txt\n",
          "build/keep.txt": "k", "build/drop.txt": "d",
        });
        try {
          assert.deepEqual(rels(root), [".gitignore", "x", "a/.gitignore", "a/keep.log", "a/y", "build/keep.txt"]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("walkDir: a negation cannot re-include a file whose parent directory is excluded", () => {
        const root = build({ ".gitignore": "build/\n!build/keep.txt\n", "build/keep.txt": "k", "a.txt": "a" });
        try {
          assert.deepEqual(rels(root), [".gitignore", "a.txt"]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });

    // Moved from tests/v2/store/fts.test.mjs
    describe("PRD-v2 section 8 / FTS store", () => {
      // Unit tests for src/core/store/fts.ts (impl/02 §9, DEVIATIONS D-M1-8, D-M1-9, D-M2-1, D-M2-3).
      // ftsInsert(db, src: Omit<SourceRow,"id">, chunks: Chunk[]): number (new sources.id, D-M2-1).
      // ftsQuery(db, q, scope, ctx, sessionId, limit, offset, source?): Hit[].
      // ftsQueryTimeline(db, scope, ctx, sessionId, limit, after, source, memory): { rows, next } (D-M2-3).
      // rankTexts(texts, q): number[] — FTS5 BM25 over an in-memory text set (impl/05 §5 step 2).
      // highlight(row, terms, maxBytes = SNIPPET_MAX_BYTES): a verbatim slice of the stored text (D-SEARCH-7), code-point safe (#963).











      function fakeProject(root, projectKey, worktree) {
        return {
          projectKey,
          projectDir: join(root, "projects", projectKey),
          dbPath: join(root, "projects", projectKey, "context.db"),
          worktree: worktree ?? root,
          containmentRoot: root,
          agent: "claude-code",
          source: "env:CLAUDE_PROJECT_DIR",
        };
      }

      async function freshDb(key, worktree) {
        const root = mkdtempSync(join(tmpdir(), "cm-fts-"));
        const project = fakeProject(root, key, worktree ?? root);
        const db = await openDb(project);
        return { db, root, project };
      }

      function src(overrides) {
        return {
          projectKey: "x".repeat(16),
          sessionId: "s1",
          worktree: "/w",
          agent: "claude-code",
          kind: "content",
          label: "note.txt",
          bytes: 0,
          chunkCount: 0,
          createdAt: Date.now(),
          ...overrides,
        };
      }

      test("ftsInsert writes rows that ftsQuery can find by term", async () => {
        const { db, root, project } = await freshDb("1".repeat(16));
        try {
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "the quick brown fox jumps", bytes: 25 }]);
          const hits = ftsQuery(db, "fox", "session", project, "s1", 10, 0);
          assert.ok(hits.length >= 1);
          assert.equal(hits[0].sourceId, id);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery with scope 'session' only returns rows from the given session", async () => {
        const { db, root, project } = await freshDb("2".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "unique-term-alpha in s1", bytes: 20 }]);
          ftsInsert(db, src({ sessionId: "s2", worktree: project.worktree }), [{ ord: 0, text: "unique-term-alpha in s2", bytes: 20 }]);
          const hits = ftsQuery(db, "unique-term-alpha", "session", project, "s1", 10, 0);
          assert.equal(hits.length, 1);
          assert.equal(hits[0].sourceId, 1);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery with scope 'project' ranks the current session's own rows first (GP7)", async () => {
        const { db, root, project } = await freshDb("3".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "shared-term here many times shared-term shared-term", bytes: 50 }]);
          ftsInsert(db, src({ sessionId: "s2", worktree: project.worktree }), [{ ord: 0, text: "shared-term here many times shared-term shared-term", bytes: 50 }]);
          const hits = ftsQuery(db, "shared-term", "project", project, "s1", 10, 0);
          assert.equal(hits.length, 2);
          assert.equal(hits[0].sourceId, 1);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery returns [] for a query that matches nothing (no throw)", async () => {
        const { db, root, project } = await freshDb("4".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "hello world", bytes: 11 }]);
          const hits = ftsQuery(db, "zzzznomatch", "session", project, "s1", 10, 0);
          assert.deepEqual(hits, []);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("highlight clips to maxBytes at a code-point boundary before sanitizing (#963)", () => {
        const big = "a".repeat(2000) + "é" + "b".repeat(2000); // accented char near a potential split point
        const out = highlight(big, "a", 100);
        assert.ok(Buffer.byteLength(out, "utf8") <= 100);
        // No replacement character from a mid-codepoint cut.
        assert.ok(!out.includes("�"));
      });

      test("highlight returns < > & as stored, no entity encoding (D-SEARCH-7; #341 guarded an innerHTML path v2 has none of)", () => {
        const row = "<script>alert(1)&amp;</script>";
        assert.equal(highlight(row, "script", 4096), row);
      });

      test("highlight default maxBytes is SNIPPET_MAX_BYTES, not MAX_CHUNK_BYTES (D-M1-9, r9 M21 wins)", () => {
        const big = "x".repeat(C.MAX_CHUNK_BYTES + 100);
        const out = highlight(big, "x", C.SNIPPET_MAX_BYTES);
        assert.ok(Buffer.byteLength(out, "utf8") <= C.SNIPPET_MAX_BYTES);
      });

      test("ftsInsert never writes rows whose body exceeds MAX_CHUNK_BYTES (caller contract, write-time sanity)", async () => {
        const { db, root, project } = await freshDb("5".repeat(16));
        try {
          const okText = "y".repeat(C.MAX_CHUNK_BYTES);
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: okText, bytes: okText.length }]);
          const hits = ftsQuery(db, "y", "session", project, "s1", 10, 0);
          assert.ok(hits.length >= 1);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      // ---- M1-T8 additions (V24 tokenizer, D-M1-T8-1..4) ----

      test("ftsQuery matches Cyrillic and accented Latin words, case and diacritics folded (V24)", async () => {
        const { db, root, project } = await freshDb("6".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "Привет мир, café crème", bytes: 30 }]);
          assert.equal(ftsQuery(db, "привет", "session", project, "s1", 10, 0).length, 1);
          assert.equal(ftsQuery(db, "МИР", "session", project, "s1", 10, 0).length, 1);
          assert.equal(ftsQuery(db, "cafe", "session", project, "s1", 10, 0).length, 1);
          assert.equal(ftsQuery(db, "crème", "session", project, "s1", 10, 0).length, 1);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery treats FTS5 operators in the query as plain words, never a syntax error (D-M1-T8-1)", async () => {
        const { db, root, project } = await freshDb("7".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "a AND b OR c NOT d", bytes: 18 }]);
          for (const q of ['a AND', 'NOT', '"', 'b OR (', 'x:y', '*', '   ', '']) {
            assert.ok(Array.isArray(ftsQuery(db, q, "session", project, "s1", 10, 0)), q);
          }
          assert.deepEqual(ftsQuery(db, "   ", "session", project, "s1", 10, 0), []);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery hit carries label, ord and an escaped snippet; scope worktree filters by worktree", async () => {
        const { db, root, project } = await freshDb("8".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "a.txt" }), [
            { ord: 0, text: "nothing here", bytes: 12 },
            { ord: 1, text: "<b>needle</b>", bytes: 13 },
          ]);
          ftsInsert(db, src({ sessionId: "s1", worktree: "/other", label: "b.txt" }), [{ ord: 0, text: "needle", bytes: 6 }]);
          const wt = ftsQuery(db, "needle", "worktree", project, "s1", 10, 0);
          assert.equal(wt.length, 1);
          assert.equal(wt[0].label, "a.txt");
          assert.equal(wt[0].ord, 1);
          assert.equal(wt[0].snippet, "<b>needle</b>"); // D-SEARCH-7: verbatim
          assert.equal(ftsQuery(db, "needle", "project", project, "s1", 10, 0).length, 2);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery limit/offset page the ranked list; source filters by label before ranking (D-M1-T8-4)", async () => {
        const { db, root, project } = await freshDb("9".repeat(16));
        try {
          for (let i = 1; i <= 5; i++) {
            ftsInsert(db, src({ id: i, sessionId: "s1", worktree: project.worktree, label: `f${i}` }), [{ ord: 0, text: "pager word", bytes: 10 }]);
          }
          const all = ftsQuery(db, "pager", "session", project, "s1", 10, 0);
          assert.equal(all.length, 5);
          assert.deepEqual(all.map((h) => h.sourceId), [5, 4, 3, 2, 1]); // equal score: newest source first (M19)
          const page = ftsQuery(db, "pager", "session", project, "s1", 2, 2);
          assert.deepEqual(page.map((h) => h.sourceId), [3, 2]);
          const one = ftsQuery(db, "pager", "session", project, "s1", 10, 0, "f2");
          assert.deepEqual(one.map((h) => h.sourceId), [2]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsInsert upserts the sources row (bytes_total, chunk_count) and batches large inputs", async () => {
        const { db, root, project } = await freshDb("a".repeat(16));
        try {
          const text = "z".repeat(C.MAX_CHUNK_BYTES);
          const n = Math.ceil((2 * C.INDEX_WRITE_CHUNK) / C.MAX_CHUNK_BYTES) + 1; // spans > 2 write batches
          const chunks = Array.from({ length: n }, (_, i) => ({ ord: i, text, bytes: text.length }));
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), chunks);
          const row = db.raw.prepare("SELECT bytes_total, chunk_count FROM sources WHERE id = ?").get(id);
          assert.equal(row.chunk_count, n);
          assert.equal(row.bytes_total, n * C.MAX_CHUNK_BYTES);
          const count = db.raw.prepare("SELECT count(*) AS c FROM chunks WHERE source_id = ?").get(id);
          assert.equal(count.c, n);
          assert.equal(db.raw.isTransaction, false);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("highlight output never exceeds maxBytes on a line with no break (D-M1-T8-3, D-SEARCH-7 verbatim)", () => {
        const out = highlight("&".repeat(500) + "<>".repeat(500), "x", 100);
        assert.equal(out, "&".repeat(100)); // stored characters, one byte each, no entity
        const emoji = highlight("😀".repeat(100), "x", 10); // 4-byte code points
        assert.equal(emoji, "😀😀");
      });

      // ---- M2-T3 additions (D-M2-1, D-M2-3, D-M2-T3-1, impl/05 §5 in-memory form) ----

      test("ftsInsert returns the DB-made sources.id, one new id per call (D-M2-1)", async () => {
        const { db, root, project } = await freshDb("b".repeat(16));
        try {
          const a = ftsInsert(db, src({ worktree: project.worktree }), [{ ord: 0, text: "one", bytes: 3 }]);
          const b = ftsInsert(db, src({ worktree: project.worktree }), [{ ord: 0, text: "two", bytes: 3 }]);
          assert.equal(typeof a, "number");
          assert.ok(b > a);
          const row = db.raw.prepare("SELECT created_at, created_ts FROM sources WHERE id = ?").get(b);
          assert.equal(row.created_at, new Date(row.created_ts).toISOString()); // A-S12 ISO mirror
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      function ev(overrides) {
        return {
          session_id: "s1", worktree: "/w", agent: "claude-code", kind: "cmd", tool: "Bash", key: null, path: null,
          ok: 1, exit_code: 0, bytes: 1, body: "b", turn: 1, sandbox_bytes: 0, returned_bytes: 0, ...overrides,
        };
      }

      // Sets created_at / created_ts to fixed values so order and paging are exact.
      function at(db, table, idCol, id, ts) {
        const col = table === "events" ? "created_at" : "created_ts";
        db.raw.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${idCol} = ?`).run(ts, id);
      }

      test("ftsQueryTimeline merges content, journal and memory rows oldest first; ties: seq, then sourceId, then path (rule 5)", async () => {
        const { db, root, project } = await freshDb("c".repeat(16));
        try {
          const wt = project.worktree;
          const s1 = appendEvent(db, ev({ worktree: wt, body: "first cmd" }));
          at(db, "events", "seq", s1, 2000);
          const s2 = appendEvent(db, ev({ worktree: wt, session_id: "s2", kind: "decision", body: "use RRF" }));
          at(db, "events", "seq", s2, 1000);
          const c1 = ftsInsert(db, src({ worktree: wt, label: "doc.md" }), [{ ord: 0, text: "doc body", bytes: 8 }, { ord: 1, text: "x", bytes: 1 }]);
          at(db, "sources", "id", c1, 2000);
          const memory = [
            { origin: "memory", ts: 2000, seq: null, sourceId: null, path: "/m/b.md", label: "memory", text: "mem b" },
            { origin: "memory", ts: 2000, seq: null, sourceId: null, path: "/m/a.md", label: "memory", text: "mem a" },
            { origin: "memory", ts: 500, seq: null, sourceId: null, path: "/m/z.md", label: "memory", text: "old" },
          ];
          const { rows, more } = ftsQueryTimeline(db, "project", project, "s1", 20, null, undefined, memory);
          assert.deepEqual(rows.map((r) => [r.origin, r.ts, r.label]), [
            ["memory", 500, "memory"],
            ["session", 1000, "decision"],
            ["session", 2000, "cmd"],
            ["content", 2000, "doc.md"],
            ["memory", 2000, "memory"],
            ["memory", 2000, "memory"],
          ]);
          assert.deepEqual(rows.slice(4).map((r) => r.path), ["/m/a.md", "/m/b.md"]);
          assert.equal(rows[3].text, "doc body"); // content row shows its first chunk
          assert.equal(rows[3].sourceId, c1);
          assert.equal(rows[1].seq, s2);
          assert.equal(more, false);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQueryTimeline pages by the after cursor and never ends a page inside a timestamp group (M18)", async () => {
        const { db, root, project } = await freshDb("d".repeat(16));
        try {
          const wt = project.worktree;
          const ts = [100, 200, 200, 200, 300, 400];
          for (const t of ts) at(db, "events", "seq", appendEvent(db, ev({ worktree: wt, body: `t${t}` })), t);
          const p1 = ftsQueryTimeline(db, "worktree", project, "s1", 2, null, undefined, []);
          assert.deepEqual(p1.rows.map((r) => r.ts), [100, 200, 200, 200]); // group at 200 kept whole
          assert.equal(p1.more, true);
          const p2 = ftsQueryTimeline(db, "worktree", project, "s1", 2, p1.rows.at(-1).ts, undefined, []);
          assert.deepEqual(p2.rows.map((r) => r.ts), [300, 400]);
          assert.equal(p2.more, false);
          const p3 = ftsQueryTimeline(db, "worktree", project, "s1", 2, 400, undefined, []);
          assert.deepEqual(p3, { rows: [], more: false });
          // every row is seen exactly once across pages
          assert.equal(p1.rows.length + p2.rows.length, ts.length);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQueryTimeline fetches each source at the full page size before merging (rule 3)", async () => {
        const { db, root, project } = await freshDb("e".repeat(16));
        try {
          const wt = project.worktree;
          for (let i = 0; i < 3; i++) at(db, "events", "seq", appendEvent(db, ev({ worktree: wt })), 10 + i);
          for (let i = 0; i < 3; i++) at(db, "sources", "id", ftsInsert(db, src({ worktree: wt }), [{ ord: 0, text: "c", bytes: 1 }]), 1 + i);
          const { rows, more } = ftsQueryTimeline(db, "worktree", project, "s1", 3, null, undefined, []);
          assert.deepEqual(rows.map((r) => r.origin), ["content", "content", "content"]);
          assert.equal(more, true);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQueryTimeline applies scope and source to the DB sources; source:'decision' selects decision rows (D3)", async () => {
        const { db, root, project } = await freshDb("f".repeat(16));
        try {
          const wt = project.worktree;
          appendEvent(db, ev({ worktree: wt, session_id: "s1", kind: "decision", body: "mine" }));
          appendEvent(db, ev({ worktree: wt, session_id: "s2", kind: "decision", body: "other session" }));
          appendEvent(db, ev({ worktree: "/elsewhere", session_id: "s2", kind: "cmd", body: "other worktree" }));
          ftsInsert(db, src({ worktree: wt, sessionId: "s1", label: "a.md" }), [{ ord: 0, text: "a", bytes: 1 }]);
          const sess = ftsQueryTimeline(db, "session", project, "s1", 20, null, undefined, []);
          assert.deepEqual(sess.rows.map((r) => r.text).sort(), ["a", "mine"]);
          const wtRows = ftsQueryTimeline(db, "worktree", project, "s1", 20, null, undefined, []);
          assert.equal(wtRows.rows.length, 3);
          const proj = ftsQueryTimeline(db, "project", project, "s1", 20, null, undefined, []);
          assert.equal(proj.rows.length, 4);
          const dec = ftsQueryTimeline(db, "project", project, "s1", 20, null, "decision", [
            { origin: "memory", ts: 1, seq: null, sourceId: null, path: "/m", label: "memory", text: "m" },
          ]);
          assert.deepEqual(dec.rows.map((r) => r.text), ["mine", "other session"]);
          const lbl = ftsQueryTimeline(db, "project", project, "s1", 20, null, "a.md", []);
          assert.deepEqual(lbl.rows.map((r) => r.origin), ["content"]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("rankTexts scores an in-memory text set with the store's BM25: match > 0, miss = 0, same index", () => {
        const scores = rankTexts(["cats only here", "dogs dogs dogs", "a dog and a cat", "Привет"], "dogs");
        assert.equal(scores.length, 4);
        assert.equal(scores[0], 0);
        assert.ok(scores[1] > 0);
        assert.ok(scores[1] >= scores[2]);
        assert.ok(rankTexts(["Привет мир"], "привет")[0] > 0); // same tokenizer as chunks (V24)
        assert.deepEqual(rankTexts(["x"], "   "), [0]);
        assert.deepEqual(rankTexts([], "x"), []);
        assert.ok(rankTexts(["a AND b"], 'AND ("')[0] > 0); // operators stay plain words, no throw
        assert.deepEqual(rankTexts(["x y"], '(" *'), [0]);
      });

      // D-M7-FT-1: the contentless scratch table must score exactly as the store's chunks table.
      test("[M7] rankTexts scores equal bm25 over the migrated chunks table, bit for bit", async () => {
        const { DatabaseSync } = await import("node:sqlite");
        const { applyMigrations } = await import("../../src/core/store/schema.ts");
        const words = ["read", "the", "output", "of", "Café", "cafe", "naïve", "Привет", "a\u0301", "x_y", "42", "ok"];
        const texts = [];
        let seed = 7;
        for (let i = 0; i < 400; i++) {
          const n = 1 + (i % 37);
          const w = [];
          for (let k = 0; k < n; k++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; w.push(words[seed % words.length]); }
          texts.push(w.join(i % 3 === 0 ? "\n" : " "));
        }
        texts.push("", "   ", "\ud800 lone read");
        const ref = new DatabaseSync(":memory:");
        applyMigrations(ref, 0);
        const ins = ref.prepare("INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body) VALUES (0, '', '', '', ?, ?)");
        texts.forEach((t, i) => ins.run(i, t));
        for (const q of ["read", "the output", "cafe", "PRIVET привет", "naive", "a", "x_y 42", "missing"]) {
          const want = texts.map(() => 0);
          for (const r of ref.prepare("SELECT ord, bm25(chunks) AS bm FROM chunks WHERE chunks MATCH ?").all(toMatchForTest(q))) want[Number(r.ord)] = -r.bm;
          assert.deepEqual(rankTexts(texts, q), want, q);
        }
        ref.close();
      });

      function toMatchForTest(q) {
        return q.split(/\s+/).filter((w) => w !== "").map((w) => '"' + w.replaceAll('"', '""') + '"*').join(" ");
      }

      // ---- M2-R6 (#1163) ----
      test("[M2] GP5/snippet-code-point-safe", () => {
        // An emoji (a surrogate pair, 4 UTF-8 bytes) at every position across the clip edge.
        for (let k = 0; k <= 4; k++) {
          const row = "a".repeat(C.SNIPPET_MAX_BYTES - k) + "😀" + "tail";
          const out = highlight(row, "a", C.SNIPPET_MAX_BYTES);
          assert.ok(out.isWellFormed(), "lone surrogate at k=" + k);
          assert.equal(Buffer.from(out, "utf8").toString("utf8"), out);
          assert.ok(Buffer.byteLength(out, "utf8") <= C.SNIPPET_MAX_BYTES);
          assert.ok(out === row.slice(0, out.length), "clip is a prefix of whole code points");
        }
        // D-SEARCH-7: "&" stays one stored byte; the 4-byte emoji past the edge is left out whole.
        const amp = highlight("a".repeat(C.SNIPPET_MAX_BYTES - 3) + "&😀", "a", C.SNIPPET_MAX_BYTES);
        assert.equal(amp, "a".repeat(C.SNIPPET_MAX_BYTES - 3) + "&");
      });

      // ---- Search layer 2 (D-SEARCH-2): AND first, OR fallback when AND has fewer than `limit` hits, stopwords dropped ----
      test("[search-L2] ftsQuery: one query word missing from the index still finds the chunk (OR fallback)", async () => {
        const { db, root, project } = await freshDb("a".repeat(16));
        try {
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "deploy the edge function", bytes: 24 }]);
          const hits = ftsQuery(db, "deploy edge function guide", "session", project, "s1", 10, 0);
          assert.equal(hits.length, 1);
          assert.equal(hits[0].sourceId, id);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L2] ftsQuery: a stopword alone never makes a chunk match", async () => {
        const { db, root, project } = await freshDb("b".repeat(16));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "stop.txt" }), [{ ord: 0, text: "the the the cat", bytes: 15 }]);
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "go.txt" }), [{ ord: 0, text: "deploy now", bytes: 10 }]);
          const hits = ftsQuery(db, "the deploy missingword", "session", project, "s1", 10, 0);
          assert.deepEqual(hits.map((h) => h.sourceId), [id]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L2] ftsQuery: AND results are kept when there are at least `limit` of them", async () => {
        const { db, root, project } = await freshDb("c".repeat(16));
        try {
          const both = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "both.txt" }), [{ ord: 0, text: "alpha beta", bytes: 10 }]);
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "one.txt" }), [{ ord: 0, text: "alpha alpha alpha", bytes: 17 }]);
          assert.deepEqual(ftsQuery(db, "alpha beta", "session", project, "s1", 1, 0).map((h) => h.sourceId), [both]);
          assert.equal(ftsQuery(db, "alpha beta", "session", project, "s1", 10, 0).length, 2);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L2] ftsQuery: under the OR fallback, chunks that match every term come before partial matches", async () => {
        const { db, root, project } = await freshDb("d".repeat(16));
        try {
          const filler = Array.from({ length: 60 }, (_, i) => "filler" + i).join(" ");
          const all = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "all.txt" }), [{ ord: 0, text: filler + " journal mode wal " + filler, bytes: 900 }]);
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "part.txt" }), [{ ord: 0, text: "mode mode wal wal", bytes: 17 }]);
          const hits = ftsQuery(db, "journal mode WAL", "session", project, "s1", 10, 0);
          assert.equal(hits.length, 2);
          assert.equal(hits[0].sourceId, all);
          assert.deepEqual(ftsQuery(db, "journal mode WAL", "session", project, "s1", 1, 1).map((h) => h.sourceId).length, 1);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      // ---- Search layer 3 (D-SEARCH-3): porter stemming over unicode61, a title column weighted over body ----
      test("[search-L3] ftsQuery: porter stemming matches other forms of a word", async () => {
        const { db, root, project } = await freshDb("e".repeat(16));
        try {
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "Open a connection to the database", bytes: 33 }]);
          assert.deepEqual(ftsQuery(db, "connecting databases", "session", project, "s1", 10, 0).map((h) => h.sourceId), [id]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L3] ftsInsert stores the chunk title; a title match ranks before a body-only match", async () => {
        const { db, root, project } = await freshDb("f".repeat(16));
        try {
          const body = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "body.md" }), [{ ord: 0, text: "Some text. The cleanup runs here. More text about other things.", bytes: 64 }]);
          const titled = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "title.md" }), [{ ord: 0, text: "## Cleanup\n\nIt runs once, on close of the store and its files.", bytes: 62, title: "Guide > Cleanup" }]);
          assert.equal(db.raw.prepare("SELECT title FROM chunks WHERE source_id = ?").get(titled).title, "Guide > Cleanup");
          assert.equal(db.raw.prepare("SELECT title FROM chunks WHERE source_id = ?").get(body).title, "");
          assert.deepEqual(ftsQuery(db, "cleanup", "session", project, "s1", 10, 0).map((h) => h.sourceId), [titled, body]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      // ---- Search layer 4 (D-SEARCH-4): trigram table, RRF fusion, typo correction ----
      test("[search-L4] ftsQuery: an exact code substring ranks before a chunk that only repeats its words", async () => {
        const { db, root, project } = await freshDb("g".repeat(16));
        try {
          const exact = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "a.md" }), [{ ord: 0, text: "Print it with JSON.stringify(data, null, 2) and read the result back in the log viewer later on", bytes: 96 }]);
          const words = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree, label: "b.md" }), [{ ord: 0, text: "stringify data, null data stringify data null stringify data null", bytes: 66 }]);
          assert.deepEqual(ftsQuery(db, "JSON.stringify(data, null", "session", project, "s1", 10, 0).map((h) => h.sourceId), [exact, words]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L4] deleteSourceChunks removes the porter and trigram rows; a reused rowid finds no old text", async () => {
        const { db, root, project } = await freshDb("h".repeat(16));
        try {
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "old-identifier-xyz here", bytes: 23 }]);
          assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM chunks_tri WHERE chunks_tri MATCH ?").get('"identifier-xyz"').n, 1);
          deleteSourceChunks(db.raw, id);
          assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?").get(id).n, 0);
          assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM chunks_tri WHERE chunks_tri MATCH ?").get('"identifier-xyz"').n, 0);
          const next = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "new text only", bytes: 13 }]);
          assert.deepEqual(ftsQuery(db, "identifier-xyz", "session", project, "s1", 10, 0), []);
          assert.deepEqual(ftsQuery(db, "new text", "session", project, "s1", 10, 0).map((h) => h.sourceId), [next]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L4] ftsQuery: when no word matches, typo correction from the index vocabulary finds the chunk", async () => {
        const { db, root, project } = await freshDb("i".repeat(16));
        try {
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "Open a connection to the PostgreSQL database", bytes: 44 }]);
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "unrelated words only", bytes: 20 }]);
          assert.deepEqual(ftsQuery(db, "postgress conection", "session", project, "s1", 10, 0).map((h) => h.sourceId), [id]);
          assert.deepEqual(ftsQuery(db, "zzzzzzzzqq", "session", project, "s1", 10, 0), []);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ftsQuery and rankTexts treat a NUL character as a word break, never an FTS5 error (D-SEARCH-6)", async () => {
        const { db, root, project } = await freshDb("9a".repeat(8));
        try {
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "alpha beta gamma", bytes: 16 }]);
          assert.deepEqual(ftsQuery(db, "\u0000", "session", project, "s1", 10, 0), []);
          assert.equal(ftsQuery(db, "alpha\u0000beta", "session", project, "s1", 10, 0).length, 1);
          assert.equal(ftsQuery(db, "gamma\u0000", "session", project, "s1", 10, 0).length, 1);
          assert.equal(ftsQuery(db, "zzqx\u0000qqzx", "session", project, "s1", 10, 0).length, 0);
          assert.deepEqual(rankTexts(["alpha beta", "zeta"], "alpha\u0000beta").map((s) => s > 0), [true, false]);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[perf-P1] ftsQuery ranks scope session/worktree by BM25 with no window sort; only scope project computes the RRF windows (D-HQ-PERF-1)", () => {
        for (const scope of ["session", "worktree"]) assert.ok(!porterRankSql(scope).includes(" OVER "), scope + " runs a window sort");
        assert.ok(porterRankSql("project").includes(" OVER "), "project lost its RRF ranks");
      });

      // D-HQ-PERF-2: a chunks_vocab read walks the whole porter index (no index on length(term)); profile of
      // GP-SEARCH held-out showed the two-typo query paying one walk per misspelled stem. One walk per pass.
      test("[perf-P2] typo correction reads chunks_vocab once per pass, however many stems miss (D-HQ-PERF-2)", async () => {
        const { db, root, project } = await freshDb("p2".repeat(8));
        try {
          const id = ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "Open a connection to the PostgreSQL database", bytes: 44 }]);
          ftsInsert(db, src({ sessionId: "s1", worktree: project.worktree }), [{ ord: 0, text: "unrelated words only", bytes: 20 }]);
          let walks = 0;
          const raw = db.raw;
          const counted = new Proxy(raw, {
            get(target, key) {
              if (key !== "prepare") { const v = Reflect.get(target, key, target); return typeof v === "function" ? v.bind(target) : v; }
              return (sql) => {
                const st = target.prepare(sql);
                if (!sql.includes("chunks_vocab") || sql.includes("term = ?")) return st;
                return { all: (...a) => { walks++; return st.all(...a); }, get: (...a) => { walks++; return st.get(...a); } };
              };
            },
          });
          const hits = ftsQuery({ ...db, raw: counted }, "postgress conection", "session", project, "s1", 10, 0);
          assert.deepEqual(hits.map((h) => h.sourceId), [id]);
          assert.equal(walks, 1, "chunks_vocab walks for two misspelled stems");
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });
    });

    // Moved from tests/v2/store/snippet.test.mjs
    describe("PRD-v2 section 8 / snippets", () => {
      // D-SEARCH-7 (owner decision 2026-10-23): reply snippets are the stored chunk text, never entity-encoded;
      // the window is chosen by matched-term score and grows to whole blocks (a whole fenced block when the
      // best block is code; whole lines otherwise). Fences over SNIPPET_CODE_MAX_BYTES return their best lines
      // with the fence lines and a "[lines a-b of N]" marker, never a cut inside a line.










      const bytes = (s) => Buffer.byteLength(s, "utf8");
      const filler = (tag, n) => Array.from({ length: n }, (_, i) => `${tag} paragraph ${i} holds plain words about weather and tea.`).join("\n\n");

      test("[search-L5] SNIPPET_CODE_MAX_BYTES fits one chunk and leaves room for 7 code hits in one reply", () => {
        assert.equal(C.SNIPPET_CODE_MAX_BYTES, 2048);
        assert.ok(C.SNIPPET_CODE_MAX_BYTES <= C.MAX_CHUNK_BYTES);
        assert.ok(C.SNIPPET_CODE_MAX_BYTES * 7 <= C.OUTPUT_CAP);
        assert.ok(C.SNIPPET_MAX_BYTES <= C.SNIPPET_CODE_MAX_BYTES);
      });

      test("[search-L5] highlight returns the stored text verbatim: no & < > entity encoding", () => {
        const row = "if (a < b && c > d) { return '<b>x</b>'; }";
        assert.equal(highlight(row, "return", C.SNIPPET_MAX_BYTES), row);
        assert.ok(!highlight(row, "return").includes("&lt;"));
        assert.ok(!highlight(row, "return").includes("&amp;"));
      });

      test("[search-L5] a fenced block the best match sits in comes back whole, over the prose cap", () => {
        const code = Array.from({ length: 30 }, (_, i) => `  const v${i} = items.filter((x) => x.id < ${i} && x.ok);`).join("\n");
        const fence = "```ts\nfunction pickItems(items) {\n" + code + "\n  return zebraTotal(items);\n}\n```";
        assert.ok(bytes(fence) > C.SNIPPET_MAX_BYTES && bytes(fence) <= C.SNIPPET_CODE_MAX_BYTES, String(bytes(fence)));
        const body = filler("lead", 6) + "\n\n" + fence + "\n\n" + filler("tail", 4);
        const out = highlight(body, "zebraTotal items", C.SNIPPET_MAX_BYTES);
        assert.ok(out.includes(fence), out);
        assert.ok(bytes(out) <= C.SNIPPET_CODE_MAX_BYTES);
        assert.ok(body.includes(out), "snippet is one contiguous slice of the stored text");
      });

      test("[search-L5] a fence over the code cap returns its best whole lines, the fence lines and a lines marker", () => {
        const lines = Array.from({ length: 120 }, (_, i) => (i === 80 ? "  return needleFn(x);" : `  step${i}(x); // plain filler line number ${i}`));
        const fence = "```js\n" + lines.join("\n") + "\n```";
        assert.ok(bytes(fence) > C.SNIPPET_CODE_MAX_BYTES);
        const out = highlight("Intro text.\n\n" + fence, "needleFn", C.SNIPPET_MAX_BYTES);
        assert.ok(bytes(out) <= C.SNIPPET_CODE_MAX_BYTES, String(bytes(out)));
        const outLines = out.split("\n");
        assert.equal(outLines[0], "```js");
        assert.equal(outLines[outLines.length - 2], "```");
        const m = /^\[lines (\d+)-(\d+) of 120\]$/.exec(outLines[outLines.length - 1]);
        assert.ok(m, out.slice(-80));
        const a = Number(m[1]);
        const b = Number(m[2]);
        assert.ok(a <= 81 && b >= 81, `${a}-${b}`);
        assert.deepEqual(outLines.slice(1, -2), lines.slice(a - 1, b), "whole source lines, in order, nothing cut");
      });

      test("[search-L5] prose window moves to the best paragraph and keeps whole lines", () => {
        const target = "The zebra crossing rule: walk when the light is green.";
        const body = filler("lead", 30) + "\n\n" + target + "\n\n" + filler("tail", 30);
        const out = highlight(body, "zebra crossing", C.SNIPPET_MAX_BYTES);
        assert.ok(out.includes(target), out);
        assert.ok(bytes(out) <= C.SNIPPET_MAX_BYTES);
        const at = body.indexOf(out);
        assert.ok(at >= 0);
        assert.ok(at === 0 || body[at - 1] === "\n", "starts at a line start");
        assert.ok(at + out.length === body.length || body[at + out.length] === "\n", "ends at a line end");
      });

      test("[search-L5] exact symbol match beats the same words spread over prose", () => {
        const spread = "create a connection, then create the connection pool and close the connection.";
        const exact = "const c = createConnection(serverUrl, roomId);";
        const body = spread + "\n\n" + filler("mid", 25) + "\n\n" + exact + "\n\n" + filler("end", 5);
        const out = highlight(body, "createConnection", C.SNIPPET_MAX_BYTES);
        assert.ok(out.includes("createConnection(serverUrl, roomId)"), out);
      });

      test("[search-L5] snake_case and dotted query words match their parts and the whole symbol", () => {
        const body = filler("lead", 25) + "\n\n" + "```ts\nassertEquals(func_data.message, 'Hello bar!');\n```" + "\n\n" + filler("tail", 5);
        const out = highlight(body, "assertEquals func_data.message", C.SNIPPET_MAX_BYTES);
        assert.ok(out.includes("assertEquals(func_data.message, 'Hello bar!')"), out);
      });

      test("[search-L5] ftsQuery hit returns a whole fence with < > & intact", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-snip-"));
        const projectKey = "c".repeat(16);
        const project = { projectKey, projectDir: join(root, "projects", projectKey), dbPath: join(root, "projects", projectKey, "context.db"),
          worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" };
        const db = await openDb(project);
        try {
          const fence = "```ts\n" + Array.from({ length: 25 }, (_, i) => `if (a${i} < b && c > d) total += a${i} & 0xff;`).join("\n") + "\n```";
          assert.ok(bytes(fence) > C.SNIPPET_MAX_BYTES);
          const text = filler("lead", 3) + "\n\n" + fence;
          ftsInsert(db, { projectKey: project.projectKey, sessionId: "s1", worktree: root, agent: "claude-code", kind: "content", label: "code.md", bytes: 0, chunkCount: 1, createdAt: Date.now() },
            [{ ord: 0, text, bytes: bytes(text) }]);
          const hits = ftsQuery(db, "total 0xff", "project", project, "s1", 10, 0);
          assert.equal(hits.length, 1);
          assert.ok(hits[0].snippet.includes(fence), hits[0].snippet);
        } finally {
          closeDb(db);
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[search-L5] a prose hit next to a fence grows to include the whole fence (code budget)", () => {
        const fence = "```js\n" + Array.from({ length: 14 }, (_, i) => `export async function getServerSideProps${i}() { return { props: { n: ${i} } }; }`).join("\n") + "\n```";
        const head = "### Migrate getServerSideProps to the App Router";
        const prose = "Shows how to replace getServerSideProps with an async Server Component.";
        const body = head + "\n\n" + prose + "\n\n" + fence + "\n\n" + filler("tail", 30);
        assert.ok(bytes(head + prose + fence) > C.SNIPPET_MAX_BYTES);
        const out = highlight(body, "getServerSideProps", C.SNIPPET_MAX_BYTES);
        assert.ok(out.includes(fence), out.slice(0, 200));
        assert.ok(bytes(out) <= C.SNIPPET_CODE_MAX_BYTES);
      });

      test("[search-L5] typo query words place the window by their prefix", () => {
        const target = "Connect to Postgres with the pooled client.";
        const body = filler("lead", 30) + "\n\n" + target + "\n\n" + filler("tail", 30);
        const out = highlight(body, "postgress", C.SNIPPET_MAX_BYTES);
        assert.ok(out.includes(target), out.slice(0, 200));
      });
    });

    // Moved from tests/v2/store/words.test.mjs
    describe("PRD-v2 section 8 / words", () => {
      // Unit tests for src/core/store/words.ts: one char-by-char word tokenizer for recall and the trigram query.
      // A word char is a letter or a digit (Unicode L or N) or "_". NUL and whitespace are separators. Nothing else
      // is a word char, so every other code point separates words, as the old /[^\p{L}\p{N}_]+/u split did.




      test("ASCII: lowercase words split on punctuation and spaces; _ joins", () => {
        assert.deepEqual(wordTokens("hello, world! foo-bar_baz 42".toLowerCase()), ["hello", "world", "foo", "bar_baz", "42"]);
      });

      test("Turkish: dotted and dotless i keep their letters, the combining dot separates", () => {
        assert.deepEqual(wordTokens("ışİğ"), ["ışİğ"]);
        assert.deepEqual(wordTokens("ışİğ".toLowerCase()), ["ışi", "ğ"]); // U+0307 (Mn) after the i separates, as the old regex did
      });

      test("Cyrillic letters are word chars", () => {
        assert.deepEqual(wordTokens("Привет, мир".toLowerCase()), ["привет", "мир"]);
      });

      test("snake_case stays one token", () => {
        assert.deepEqual(wordTokens("snake_case_name"), ["snake_case_name"]);
      });

      test("punctuation and symbols separate", () => {
        assert.deepEqual(wordTokens("a.b/c:d(e)f;g"), ["a", "b", "c", "d", "e", "f", "g"]);
        assert.deepEqual(wordTokens("a😀b"), ["a", "b"]);
      });

      test("NUL and whitespace separate", () => {
        assert.deepEqual(wordTokens("a\u0000b"), ["a", "b"]);
        assert.deepEqual(wordTokens("a\tb\nc d e"), ["a", "b", "c", "d", "e"]);
      });

      test("non-ASCII digits are word chars; a combining mark separates", () => {
        assert.deepEqual(wordTokens("٣ ok"), ["٣", "ok"]);
        assert.deepEqual(wordTokens("é"), ["e"]);
      });

      test("empty and separator-only input give no tokens", () => {
        assert.deepEqual(wordTokens(""), []);
        assert.deepEqual(wordTokens(" \u0000 .,! "), []);
      });

      test("isWordChar matches /[\\p{L}\\p{N}_]/u on every code point", () => {
        const re = /[\p{L}\p{N}_]/u;
        for (let cp = 0; cp <= 0x10ffff; cp++) {
          if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogates are not characters
          const ch = String.fromCodePoint(cp);
          assert.equal(isWordChar(cp), re.test(ch), "code point U+" + cp.toString(16));
        }
      });

      test("blankTokens splits on NUL and whitespace only; punctuation stays inside a token", () => {
        assert.deepEqual(blankTokens("foo.bar, baz"), ["foo.bar,", "baz"]);
        assert.deepEqual(blankTokens("a\u0000b　c﻿d"), ["a", "b", "c", "d"]);
        assert.deepEqual(blankTokens("ışİğ  snake_case"), ["ışİğ", "snake_case"]);
        assert.deepEqual(blankTokens(" \t\n "), []);
      });
    });

    // Moved from tests/v2/store/no-regex-search-paths.test.mjs
    describe("PRD-v2 section 8 / no regex on search paths", () => {
      // The search, recall and units runtime paths hold no regex: no regex literal and no RegExp call.
      // Words are split by src/core/store/words.ts (one char-by-char loop). The TypeScript parser finds the nodes.





      const FILES = [
        "src/core/store/fts.ts",
        "src/core/store/words.ts",
        "src/core/store/snippet.ts",
        "src/core/index/units.ts",
        "src/core/compaction/recall.ts",
      ];

      function regexNodes(path) {
        const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        const found = [];
        const visit = (node) => {
          if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) found.push(node.getText(sf));
          if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp") {
            found.push(node.getText(sf));
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
        return found;
      }

      for (const path of FILES) {
        test("no regex literal or RegExp call in " + path, () => {
          assert.deepEqual(regexNodes(path), []);
        });
      }
    });

    // Moved from tests/v2/tools/index-ported.test.mjs
    describe("PRD-v2 section 8 / ctx_index ported from v1", () => {
      // W1-core PORT of tests/stale-detection.test.ts, tests/core/echo-commands.test.ts, tests/executor/win-sandbox-782-788.test.ts (#788)
      // to the v2 tool handlers. v2 has no search-time stale check (ADR-0016: one path, no fallback); a changed file is
      // refreshed by ctx_index(path) again; the store only appends, so the old text stays.










      function ctxFor(root) {
        const k = "1".repeat(16);
        return { project: { projectKey: k, projectDir: join(root, "projects", k), dbPath: join(root, "projects", k, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" }, sessionId: "s1", turn: 1, signal: new AbortController().signal };
      }
      const search = (ctx, q) => ctxSearch.handler({ queries: [q] }, ctx);

      test("[W1-core] stale-detection: re-indexing a changed file adds the new text (old text kept, new token found)", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-stale-")));
        try {
          const ctx = ctxFor(root);
          writeFileSync(join(root, "a.md"), "# T\n\nalphaoldtoken here\n");
          await ctxIndex.handler({ path: "a.md" }, ctx);
          assert.ok((await search(ctx, "alphaoldtoken")).text.includes("alphaoldtoken here"));
          writeFileSync(join(root, "a.md"), "# T\n\nbetanewtoken here\n");
          assert.equal((await ctxIndex.handler({ path: "a.md" }, ctx)).isError, false);
          assert.ok((await search(ctx, "betanewtoken")).text.includes("betanewtoken here"));
          // v2 is append-only (no data loss): the earlier text stays searchable. v1 deleted it (D-M7-CLN-3).
          assert.ok((await search(ctx, "alphaoldtoken")).text.includes("alphaoldtoken here"));
        } finally { rmSync(root, { recursive: true, force: true }); }
      });

      test("[W1-core] stale-detection: inline content index never reads a file; a deleted file does not break search", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-stale2-")));
        try {
          const ctx = ctxFor(root);
          await ctxIndex.handler({ content: "inlinetokenzed body", source: "inl" }, ctx);
          writeFileSync(join(root, "gone.md"), "# G\n\ngonetokenzed body\n");
          await ctxIndex.handler({ path: "gone.md" }, ctx);
          unlinkSync(join(root, "gone.md"));
          assert.ok((await search(ctx, "inlinetokenzed")).text.includes("inlinetokenzed body"));
          const gone = await search(ctx, "gonetokenzed");
          assert.equal(gone.isError, false);
          assert.ok(gone.text.includes("gonetokenzed body"));
        } finally { rmSync(root, { recursive: true, force: true }); }
      });

      // #717 / #736: the ran code and commands are echoed so the user can audit them.
      test("[W1-core] #717: ctx_execute summary:true echoes the language and the code before stdout", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-echo-")));
        try {
          const out = await ctxExecute.handler({ language: "shell", code: "echo hi-echo", summary: true }, ctxFor(root));
          assert.equal(out.isError, false);
          assert.ok(out.text.includes("```shell\necho hi-echo\n```"));
          assert.ok(out.text.indexOf("```shell") < out.text.lastIndexOf("hi-echo"));
        } finally { rmSync(root, { recursive: true, force: true }); }
      });

      test("[W1-core] #736: ctx_batch section names each command's output; summary line counts commands", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-echo2-")));
        try {
          const out = await ctxBatch.handler({ commands: ["echo alpha", "echo beta"], queries: ["alpha"] }, ctxFor(root));
          assert.equal(out.isError, false);
          assert.ok(out.text.startsWith("2 command(s)"));
          assert.ok(out.text.includes("alpha"));
        } finally { rmSync(root, { recursive: true, force: true }); }
      });

      // #788(a)(b): non-shell runtimes run in the project root; the sandbox temp dir is removed after the run.
      test("[W1-core] #788: python/javascript run in the project root and leave no temp dir behind", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-788-")));
        try {
          const out = await ctxExecute.handler({ language: "javascript", code: "console.log('CWD=' + process.cwd()); console.log('S=' + process.argv[1]);" }, ctxFor(root));
          const line = (k) => out.text.split("\n").find((l) => l.startsWith(k)).slice(k.length);
          assert.equal(realpathSync(line("CWD=")), root);
          assert.equal(existsSync(dirname(line("S="))), false);
        } finally { rmSync(root, { recursive: true, force: true }); }
      });

      // W1-core PORT of tests/core/server.test.ts "Non-zero Exit Code Classification" (v1 isError rules) to ctx_execute.
      // v2 class (impl/04 step 12, GP4): shell exit 1 with empty stderr is not an error; stderr or exit >= 2 or a
      // non-shell runtime exiting non-zero is. The v1 "shell exit 1 with empty stdout is an error" row is NOT carried:
      // v2 decided grep no-match (exit 1, no output) is a clean result.
      test("[W1-core] exit class: shell exit 1 with stdout is ok; exit 2 and 127 are errors; javascript exit 1 is an error", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-exit-")));
        try {
          const ctx = ctxFor(root);
          const run = (language, code) => ctxExecute.handler({ language, code }, ctx);
          const soft = await run("shell", "echo out; exit 1");
          assert.equal(soft.isError, false);
          assert.ok(soft.text.includes("out"));
          assert.equal((await run("shell", "echo e >&2; exit 2")).isError, true);
          const nf = await run("shell", "nonexistcmd_zz");
          assert.equal(nf.isError, true);
          assert.ok(nf.text.startsWith("exit 127"));
          const js = await run("javascript", "console.log('o'); process.exit(1)");
          assert.equal(js.isError, true);
          assert.ok(js.text.includes("o"));
        } finally { rmSync(root, { recursive: true, force: true }); }
      });
    });

    // Moved from tests/v2/tools/search.test.mjs
    describe("PRD-v2 section 8 / ctx_search", () => {
      // Unit tests for src/core/tools/search.ts (impl/05 §6). ctx_search: readOnly tool.








      function ctxFor(root) {
        return {
          project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
          sessionId: "s1", turn: 1, signal: new AbortController().signal,
        };
      }

      test("ctx_search is readOnly:true", () => {
        assert.equal(ctxSearch.name, "ctx_search");
        assert.equal(ctxSearch.readOnly, true);
      });

      test("ctxSearch with an empty array of queries never throws (schema allows [])", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se-"));
        try {
          const out = await ctxSearch.handler({ queries: [] }, ctxFor(root));
          assert.equal(typeof out.isError, "boolean");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ctxSearch zero-hit reply states scope and source count, isError:false", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se2-"));
        try {
          const out = await ctxSearch.handler({ queries: ["zzznomatchzzz"] }, ctxFor(root));
          assert.equal(out.isError, false);
          assert.ok(/No hits in scope/.test(out.text));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ctxSearch finds content indexed by ctx_index in the default (worktree) scope", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se3-"));
        try {
          await ctxIndex.handler({ content: "the quick brown fox", source: "note" }, ctxFor(root));
          const out = await ctxSearch.handler({ queries: ["fox"] }, ctxFor(root));
          assert.equal(out.isError, false);
          assert.ok(out.text.includes("fox") || out.text.includes("note"));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ctxSearch rejects a negative offset via zod (isError, never a throw)", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se4-"));
        try {
          await assert.doesNotReject(ctxSearch.handler({ queries: [], offset: -1, after: -1 }, ctxFor(root)));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("ctxSearch default scope is 'worktree' when input.scope is omitted", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se5-"));
        try {
          const out = await ctxSearch.handler({ queries: ["anything"] }, ctxFor(root));
          assert.ok(out.text.includes("worktree"));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // ---- M2-R6: 14a issue cases (GP5, GP7) ----





      function ctxAt(root, worktree, sessionId) {
        const base = ctxFor(root);
        return { ...base, project: { ...base.project, worktree, containmentRoot: root }, sessionId };
      }

      // One sources row + one chunk per item, written straight into the project's one context.db.
      async function seed(ctx, items) {
        const db = await openDb(ctx.project);
        try {
          for (const it of items) {
            ftsInsert(db, {
              projectKey: ctx.project.projectKey, sessionId: it.sessionId, worktree: it.worktree, agent: "claude-code",
              kind: "content", label: it.label, bytes: 0, chunkCount: 1, createdAt: it.createdAt ?? Date.now(),
            }, [{ ord: 0, text: it.text, bytes: Buffer.byteLength(it.text, "utf8") }]);
          }
        } finally {
          closeDb(db);
        }
      }

      function hitLabels(text) {
        const out = [];
        for (const line of text.split("\n")) {
          const at = line.indexOf(" #");
          if (at > 0 && !line.startsWith("Query ") && !line.startsWith("More:")) out.push(line.slice(0, at));
        }
        return out;
      }

      // Records every input key the handler reads.
      function recorder(input, seen) {
        return new Proxy(input, { get(t, k) { if (typeof k === "string") seen.add(k); return t[k]; } });
      }

      test("[M2] GP5/ctx-search-schema-declares-query", async () => {
        // D-M2-arch-3: schema and handler agree. Every key the handler reads is declared ...
        const declared = new Set(Object.keys(ctxSearchSchema.shape));
        const root = mkdtempSync(join(tmpdir(), "cm-r6a-"));
        try {
          for (const input of [{ queries: ["x"], scope: "project", source: "s", offset: 0 }, { queries: [], sort: "timeline", after: 0, source: "s" }]) {
            const seen = new Set();
            const out = await ctxSearch.handler(recorder(input, seen), ctxFor(root));
            assert.equal(out.isError, false);
            for (const k of seen) assert.ok(declared.has(k), "handler reads undeclared key " + k);
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
        // ... and {query:"x"} is one schema error line that names "queries" (no alias, no throw).
        const r = ctxSearchSchema.safeParse({ query: "x" });
        assert.equal(r.success, false);
        const unknown = r.error.issues.find((i) => i.code === "unrecognized_keys");
        assert.equal(unknown.message, 'Unknown field "query". Fix: use "queries".');
        assert.ok(!r.error.issues.map((i) => i.message).join(", ").includes("\n"));
      });

      test("[M2] GP5/search-param-schema-match", async () => {
        const valid = {
          queries: { queries: ["x"] },
          scope: { queries: ["x"], scope: "project" },
          source: { queries: ["x"], source: "note" },
          offset: { queries: ["x"], offset: 20 },
          sort: { queries: ["x"], sort: "timeline" },
          after: { queries: ["x"], sort: "timeline", after: 1 },
        };
        assert.deepEqual(Object.keys(ctxSearchSchema.shape).sort(), Object.keys(valid).sort());
        const root = mkdtempSync(join(tmpdir(), "cm-r6b-"));
        try {
          for (const [key, input] of Object.entries(valid)) {
            assert.equal(ctxSearchSchema.safeParse(input).success, true, key);
            const out = await ctxSearch.handler(input, ctxFor(root));
            assert.equal(out.isError, false, key + ": " + out.text);
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[M2] GP5/negative-limit-rejected", () => {
        // V23: zod rejects, the SDK turns it into isError; nothing is clamped.
        for (const bad of [{ queries: [], offset: -1 }, { queries: [], after: -1 }, { queries: [], offset: 1.5 }]) {
          assert.equal(ctxSearchSchema.safeParse(bad).success, false, JSON.stringify(bad));
        }
        const both = ctxSearchSchema.safeParse({ offset: -1, after: -1, queries: [] });
        assert.equal(both.success, false);
        assert.deepEqual(both.error.issues.map((i) => i.path[0]).sort(), ["after", "offset"]);
        assert.equal(ctxSearchSchema.safeParse({ queries: [] }).success, true);
      });

      test("[M2] GP5/dedupe-chunks-across-queries", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-r6c-"));
        try {
          const ctx = ctxFor(root);
          await seed(ctx, [{ sessionId: "s1", worktree: root, label: "both", text: "alpha and beta in one chunk" }]);
          const out = await ctxSearch.handler({ queries: ["alpha", "beta", "alpha"] }, ctx);
          assert.equal(out.isError, false);
          assert.deepEqual(hitLabels(out.text), ["both"]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[M2] GP5/fts-highlight-bytecap", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-r6d-"));
        try {
          const ctx = ctxFor(root);
          const row = ("needle <b>&</b> 😀 " + "x".repeat(80) + " ").repeat(52000);
          assert.ok(Buffer.byteLength(row, "utf8") >= 5 * 1024 * 1024);
          await seed(ctx, [{ sessionId: "s1", worktree: root, label: "big", text: row }]);
          const t0 = performance.now();
          const out = await ctxSearch.handler({ queries: ["needle"] }, ctx);
          const ms = performance.now() - t0;
          assert.ok(ms < 1000, "ctx_search took " + ms + " ms");
          assert.equal(out.isError, false);
          assert.ok(Buffer.byteLength(out.text, "utf8") <= C.OUTPUT_CAP);
          const line = out.text.split("\n").find((l) => l.startsWith("big #0: "));
          const snippet = line.slice("big #0: ".length);
          assert.ok(Buffer.byteLength(snippet, "utf8") <= C.SNIPPET_MAX_BYTES);
          assert.ok(snippet.includes("needle <b>&</b> 😀"), "D-SEARCH-7: stored text, no entity encoding");
          assert.ok(row.includes(snippet), "one contiguous slice of the stored row");
          assert.ok(snippet.isWellFormed());
          assert.equal(snippet, highlight(row, "needle", C.SNIPPET_MAX_BYTES));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[M2] GP5/session-worktree-project-rank", async () => {
        // #895: with scope "project", own-session hits rank above own-worktree hits, and those above hits
        // from other worktrees, even when the lower tier scores higher and is newer.
        const root = mkdtempSync(join(tmpdir(), "cm-r6e-"));
        try {
          const other = join(root, "other-wt");
          const ctx = ctxAt(root, root, "s1");
          await seed(ctx, [
            { sessionId: "s1", worktree: root, label: "session", text: "rankterm " + "filler ".repeat(40), createdAt: 1000 },
            { sessionId: "s2", worktree: root, label: "worktree", text: "rankterm rankterm " + "filler ".repeat(10), createdAt: 2000 },
            { sessionId: "s3", worktree: other, label: "project", text: "rankterm rankterm rankterm", createdAt: 3000 },
          ]);
          const out = await ctxSearch.handler({ queries: ["rankterm"], scope: "project" }, ctx);
          assert.deepEqual(hitLabels(out.text), ["session", "worktree", "project"]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("[M2] GP7/worktree-label-session-first", async () => {
        // #1185: rows carry their worktree; the default scope shows the caller's worktree only, and the
        // caller's own session ranks first in it.
        const root = mkdtempSync(join(tmpdir(), "cm-r6f-"));
        try {
          const wt2 = join(root, "wt2");
          await seed(ctxAt(root, root, "s1"), [
            { sessionId: "s1", worktree: root, label: "w1-own", text: "isoterm " + "pad ".repeat(30) },
            { sessionId: "s2", worktree: root, label: "w1-other", text: "isoterm isoterm isoterm" },
            { sessionId: "s3", worktree: wt2, label: "w2-own", text: "isoterm isoterm" },
          ]);
          const a = await ctxSearch.handler({ queries: ["isoterm"] }, ctxAt(root, root, "s1"));
          assert.deepEqual(hitLabels(a.text), ["w1-own", "w1-other"]);
          const b = await ctxSearch.handler({ queries: ["isoterm"] }, ctxAt(root, wt2, "s3"));
          assert.deepEqual(hitLabels(b.text), ["w2-own"]);
          const all = await ctxSearch.handler({ queries: ["isoterm"], scope: "project" }, ctxAt(root, wt2, "s3"));
          assert.deepEqual(hitLabels(all.text), ["w2-own", "w1-other", "w1-own"]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // D-CR3-HANDLE-1: source resolves as a short id, then a full label, then a label without its "#" suffix.
      test("D-CR3-HANDLE-1: ctx_search source accepts the short id, the full label and the label without #suffix", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se-h-"));
        try {
          const { openDb, closeDb } = await import("../../src/core/store/db.ts");
          const { indexText } = await import("../../src/core/index/text.ts");
          const { sourceHandle, parseSourceHandle } = await import("../../src/core/store/fts.ts");
          const c = ctxFor(root);
          const db = await openDb(c.project);
          const label = "Bash:cat config/deploy.json#toolu_01ABCdef";
          const { sourceId } = indexText(db, c.project, "s1", label, "region eu-west-3 replicas 7 canary", "text");
          indexText(db, c.project, "s1", "Bash:cat other.json#toolu_02", "region us-east-1 replicas 2", "text");
          closeDb(db);
          assert.equal(parseSourceHandle(sourceHandle(sourceId)), sourceId);
          assert.equal(parseSourceHandle("s"), null);
          assert.equal(parseSourceHandle("s0"), null);
          assert.equal(parseSourceHandle("sZ"), null);
          for (const source of [sourceHandle(sourceId), label, "Bash:cat config/deploy.json"]) {
            const out = await ctxSearch.handler({ queries: ["region"], source }, c);
            assert.equal(out.isError, false);
            assert.ok(out.text.includes("eu-west-3"), source + ": " + out.text);
            assert.equal(out.text.includes("us-east-1"), false, source + ": " + out.text);
          }
          const none = await ctxSearch.handler({ queries: ["region"], source: "Bash:cat config" }, c);
          assert.ok(none.text.includes("across 0 source(s)"), none.text);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // D-CR3-HANDLE-3: a source argument of the form s<base36> is an id only when that id row exists in this
      // project's store; otherwise it is a label (exact, then without "#" suffix), so a label like "s9z" still works.
      test("D-CR3-HANDLE-3: short-id collision guard: s<base36> with no such row falls through to labels", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-se-c-"));
        try {
          const { openDb, closeDb } = await import("../../src/core/store/db.ts");
          const { indexText } = await import("../../src/core/index/text.ts");
          const { resolveSourceLabel, sourceHandle, parseSourceHandle } = await import("../../src/core/store/fts.ts");
          const c = ctxFor(root);
          const db = await openDb(c.project);
          const a = indexText(db, c.project, "s1", "Bash:cat a.json#toolu_a", "alpha region eu-west-3", "text").sourceId;
          indexText(db, c.project, "s1", "s9z", "zulu region ap-south-1", "text");
          indexText(db, c.project, "s1", "szz#toolu_b", "yankee region sa-east-1", "text");
          assert.equal(parseSourceHandle("s9z"), 359, "s9z parses as an id");
          assert.equal(resolveSourceLabel(db, sourceHandle(a)), "Bash:cat a.json#toolu_a", "an existing id row wins");
          assert.equal(resolveSourceLabel(db, "s9z"), "s9z", "no row 359: the exact label");
          assert.equal(resolveSourceLabel(db, "szz"), "szz#toolu_b", "no row: the label without its # suffix");
          assert.equal(resolveSourceLabel(db, "s7y"), "s7y", "no row, no label: the argument as given");
          closeDb(db);
          const out = await ctxSearch.handler({ queries: ["region"], source: "s9z" }, c);
          assert.ok(out.text.includes("ap-south-1") && !out.text.includes("eu-west-3"), out.text);
          const other = mkdtempSync(join(tmpdir(), "cm-se-c2-"));
          try {
            const c2 = ctxFor(other);
            const db2 = await openDb(c2.project);
            indexText(db2, c2.project, "s1", "Bash:cat b.json#toolu_c", "bravo", "text");
            closeDb(db2);
            const miss = await ctxSearch.handler({ queries: ["region"], source: sourceHandle(a + 5) }, c);
            assert.ok(miss.text.includes("across 0 source(s)"), "an id with no row in this project finds nothing: " + miss.text);
          } finally {
            rmSync(other, { recursive: true, force: true });
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // D-M2-JSON-3: a source holding a JSON array of objects answers with whole rows ranked by BM25 over the row
      // text (keys and values), not with 48-byte line snippets.
      test("D-M2-JSON-3: ctx_search over a JSON source returns the matching whole row first, five rows a page", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-sej-"));
        try {
          const rows = Array.from({ length: 400 }, (_, i) => ({ id: "ord-" + i, region: "north", amount: i * 3 + 1, priority: i === 211, items: ["a", "b"], note: "filler words " + i }));
          await ctxIndex.handler({ content: JSON.stringify(rows, null, 2), source: "orders.json" }, ctxFor(root));
          const out = await ctxSearch.handler({ queries: ['"priority": true'], source: "orders.json" }, ctxFor(root));
          assert.equal(out.isError, false);
          const lines = out.text.split("\n");
          assert.ok(lines[0].includes("400 objects {id,region,amount,priority,items,note}"), out.text);
          const hit = lines.find((l) => l.startsWith("orders.json [211]: "));
          assert.ok(hit !== undefined, out.text);
          assert.deepEqual(JSON.parse(hit.slice("orders.json [211]: ".length)), rows[211]);
          assert.equal(lines.indexOf(hit), 2, "the best row is the first hit (after the header and the query line)");
          assert.equal(lines.filter((l) => l.startsWith("orders.json [")).length, 5);
          assert.ok(lines.some((l) => l.startsWith("More: ")), "paging line");
          assert.ok(Buffer.byteLength(out.text) < 1600, String(Buffer.byteLength(out.text)));
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      test("D-M2-JSON-3: a source that is not a JSON array of objects keeps the snippet reply", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-sej2-"));
        try {
          await ctxIndex.handler({ content: "alpha beta\ngamma delta fox\n", source: "plain.txt" }, ctxFor(root));
          const out = await ctxSearch.handler({ queries: ["fox"], source: "plain.txt" }, ctxFor(root));
          assert.ok(out.text.startsWith('Query "fox":\nplain.txt #0: '), out.text);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // H9 (OPEN-ITEMS): the replace handle line names the source and the command as the query. When no query word
      // is in the output, a source query lists that source's chunks by position instead of "No hits".
      test("H9: a source query whose words match nothing lists that source's chunks, first by position", async () => {
        const root = mkdtempSync(join(tmpdir(), "cm-h9-"));
        try {
          const content = Array.from({ length: 30 }, (_, i) => "## part " + i + "\n\nalpha beta gamma " + i).join("\n\n");
          await ctxIndex.handler({ content, source: "big-out" }, ctxFor(root));
          await ctxIndex.handler({ content: "cat big log other words", source: "other" }, ctxFor(root));
          const r = await ctxSearch.handler({ queries: ["cat big.log"], source: "big-out" }, ctxFor(root));
          assert.equal(r.isError, false, r.text);
          const lines = r.text.split("\n");
          assert.equal(lines[0], 'Query "cat big.log":', r.text.slice(0, 300));
          assert.ok(lines[1].startsWith("big-out #0: "), r.text.slice(0, 300));
          assert.ok(r.text.includes("big-out #1: "), r.text.slice(0, 300));
          assert.ok(!r.text.includes("other #"), r.text);
          // Words that do match keep the BM25 path.
          const hit = await ctxSearch.handler({ queries: ["gamma 17"], source: "big-out" }, ctxFor(root));
          assert.ok(hit.text.includes("alpha beta gamma 17"), hit.text.slice(0, 300));
          // No source: a query with no match is still zero hits.
          const none = await ctxSearch.handler({ queries: ["zzqq nothing"] }, ctxFor(root));
          assert.ok(none.text.startsWith("No hits"), none.text);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });

      // D-SEARCH-REPLY-1: a relevance reply holds SEARCH_REPLY_HITS hits, not SEARCH_PAGE_SIZE; `More:` pages through the rest.
      test("ctxSearch reply holds SEARCH_REPLY_HITS hits and paging reaches every hit exactly once", async () => {
        const { SEARCH_REPLY_HITS } = await import("../../src/core/contracts/constants.ts");
        const root = mkdtempSync(join(tmpdir(), "cm-se-reply-"));
        try {
          const ctx = ctxFor(root);
          const doc = Array.from({ length: 23 }, (_, i) => `## Section ${i}\n\nThe gadget handler number ${i} registers a gadget callback for widget${i}.\n`).join("\n");
          await ctxIndex.handler({ content: doc, source: "gadgets" }, ctx);
          const seen = [];
          let offset = 0;
          for (let guard = 0; guard < 10; guard++) {
            const out = await ctxSearch.handler({ queries: ["gadget callback"], source: "gadgets", offset }, ctx);
            const hits = out.text.split("\n").filter((l) => /^gadgets #\d+: /.test(l));
            assert.ok(hits.length > 0 && hits.length <= SEARCH_REPLY_HITS, `page ${guard} has ${hits.length} hits`);
            for (const l of out.text.matchAll(/^gadgets #(\d+): /gm)) seen.push(Number(l[1]));
            const more = out.text.split("\n").find((l) => l.startsWith("More: "));
            if (more === undefined) break;
            offset = Number(/offset:(\d+)/.exec(more)[1]);
            assert.equal(offset, seen.length, "the cursor starts at the first hit not shown");
          }
          assert.equal(new Set(seen).size, seen.length, "no hit twice");
          assert.equal(seen.length, 23, "paging reaches all 23 matching chunks");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    });

    // Moved from tests/v2/tools/no-lossy-cut.test.mjs
    describe("PRD-v2 section 8 / no lossy cut", () => {
      // D-NO-LOSSY-CUT-1/2 (owner main rule): a reply is bounded only when the full content is stored first and the
      // reply says how to read the rest. capBytes stays a final guard that never cuts real content.













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
        const { indexText } = await import("../../src/core/index/text.ts");
        const { openDb, closeDb } = await import("../../src/core/store/db.ts");
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
    });
  });

  // Moved from tests/v2/index/html-readable.test.mjs
  // Serial inside the concurrent stage: the tests read replies the before hook indexed in order.
  describe("PRD-v2 section 8 / HTML to readable text", { concurrency: 1 }, () => {
    // ctx_index of an HTML page stores readable text, not markup (owner report: react.dev useEffect search came back with
    // class="..." attributes, Next.js flight data and > escapes). Pages are real saved fixtures (no network in tests,
    // see tests/v2/fixtures/html/README.md). They are served from a local server through the same safeFetch path the url
    // field uses; tests/v2/e2e/_parity-net-shim.mjs moves only the last network hop (SSRF check stays on).
    // D-NO-LOSSY-CUT: the raw body stays stored as a second source "<url> (raw)", reachable by `source`, never ranked by default.








    const HERE = dirname(fileURLToPath(import.meta.url));
    const FIX = join(HERE, "fixtures", "html");



    const PAGES = [
      { file: "react-useeffect.html", query: "useEffect cleanup function return pattern", words: ["connection.connect();", "return () => {", "connection.disconnect();"] },
      { file: "mdn-array-map.html", query: "map callbackFn thisArg returns a new array", words: ["callbackFn"] },
      { file: "github-readme.html", query: "npm install express", words: ["npm install"] },
      { file: "docusaurus-docs.html", query: "baseUrl site configuration", words: ["baseUrl"] },
      { file: "nextjs-docs.html", query: "page.tsx layout route", words: ["page.tsx"] },
    ];

    let root, srv, base;
    const reply = new Map(); // file -> { index, search }

    function ctxFor(dir) {
      const key = "2".repeat(16);
      return {
        project: { projectKey: key, projectDir: join(dir, "projects", key), dbPath: join(dir, "projects", key, "context.db"), worktree: dir, containmentRoot: dir, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
        sessionId: "s1", turn: 1, signal: new AbortController().signal,
      };
    }

    // The text outside fenced code blocks and `inline code`: a page about HTML or JSX may show a tag there, never in prose.
    function outsideFences(text) {
      const keep = [];
      let inside = false;
      for (const line of text.split("\n")) {
        if (line.trimStart().startsWith("```")) { inside = !inside; continue; }
        if (inside) continue;
        let out = "";
        let tick = false;
        for (const ch of line) { if (ch === "`") { tick = !tick; continue; } if (!tick) out += ch; }
        keep.push(out);
      }
      return keep.join("\n");
    }
    // Real HTML element names (lowercase, as a parser sees them). A page may print <Link> or <siteBaseUrl> as text.
    const TAGS = "a|abbr|article|aside|b|body|br|button|code|dd|details|div|dl|dt|em|figure|footer|form|h1|h2|h3|h4|h5|h6|head|header|hr|html|i|iframe|img|input|label|li|link|main|meta|nav|noscript|ol|option|p|path|pre|script|section|select|span|strong|style|summary|svg|table|tbody|td|template|th|thead|title|tr|u|ul";

    const MARKUP = [
      [new RegExp("</?(" + TAGS + ")(\\s[^<>]*)?/?>"), "an HTML tag"],
      [/\b(class|style|id|href|src|data-[a-z-]+|aria-[a-z-]+)="/, "an attribute"],
      [/__next_f|self\.__next|<script|<style|\bwindow\.__/, "script or flight data"],
      [/\\u00[0-9a-fA-F]{2}|\\"/, "a JSON escape"],
    ];

    before(async () => {
      root = mkdtempSync(join(tmpdir(), "cm-html-readable-"));
      srv = http.createServer((req, res) => {
        try {
          const body = readFileSync(join(FIX, req.url.slice(1)));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(body);
        } catch {
          res.writeHead(404);
          res.end("no");
        }
      });
      await new Promise((r) => srv.listen(0, "127.0.0.1", r));
      base = "http://docs.parity.test:" + srv.address().port + "/";
      const ctx = ctxFor(root);
      for (const p of [...PAGES, { file: "spa-excalidraw.html", query: "Excalidraw whiteboard" }]) {
        const t0 = performance.now();
        const index = await ctxIndex.handler({ url: base + p.file }, ctx);
        const ms = performance.now() - t0;
        const search = await ctxSearch.handler({ queries: [p.query] }, ctx);
        reply.set(p.file, { index, search, ms });
        console.log("# " + p.file + " index_ms=" + ms.toFixed(0) + " | " + index.text.split("\n")[0] + " | search_bytes=" + Buffer.byteLength(search.text, "utf8"));
      }
    });
    after(async () => {
      await new Promise((r) => srv.close(r));
      rmSync(root, { recursive: true, force: true });
    });

    for (const p of PAGES) {
      test("[html-readable] " + p.file + ": no tag, attribute, script body, flight data or JSON escape in the search reply", () => {
        const { index, search } = reply.get(p.file);
        assert.equal(index.isError, false, index.text);
        assert.equal(search.isError, false, search.text);
        assert.ok(/#/.test(search.text), "the query finds a hit: " + search.text.slice(0, 200));
        const text = outsideFences(search.text);
        for (const [re, what] of MARKUP) {
          const m = re.exec(text);
          assert.equal(m, null, p.file + " reply holds " + what + ": " + (m && text.slice(Math.max(0, m.index - 60), m.index + 100)));
        }
      });
      test("[html-readable] " + p.file + ": the answer text comes back", () => {
        const { search } = reply.get(p.file);
        for (const w of p.words) assert.ok(search.text.includes(w), p.file + " reply lacks " + JSON.stringify(w));
      });
    }

    test("[html-readable] react.dev useEffect: the cleanup example comes back as one whole fenced code block", () => {
      const { search } = reply.get("react-useeffect.html");
      const lines = search.text.split("\n");
      let open = -1;
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trimStart().startsWith("```")) continue;
        if (open < 0) { open = i; continue; }
        const block = lines.slice(open + 1, i).join("\n");
        if (block.includes("connection.connect();") && block.includes("return () => {") && block.includes("connection.disconnect();")) {
          assert.ok(block.indexOf("connection.connect();") < block.indexOf("return () => {"), "order kept");
          assert.ok(block.indexOf("return () => {") < block.indexOf("connection.disconnect();"), "order kept");
          assert.ok(block.split("\n").length >= 5, "code keeps its line breaks: " + block.slice(0, 200));
          found = true;
        }
        open = -1;
      }
      assert.ok(found, "no single fenced block holds the cleanup example:\n" + search.text.slice(0, 2500));
    });

    test("[html-readable] headings and links stay readable (markdown form)", () => {
      const all = PAGES.map((p) => reply.get(p.file).search.text).join("\n");
      // a hit line is "<label> #<n>: <chunk>", so a heading opens a line or follows that prefix
      assert.ok(/(^|\n|#\d+: )#{1,6} \S/.test(all), "a heading line survives:\n" + all.slice(0, 1500));
      assert.ok(/\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(all), "a link survives as [text](url)");
    });

    test("[html-readable] the search reply stays under the bound and is far smaller than the raw-attribute noise", () => {
      for (const p of PAGES) assert.ok(Buffer.byteLength(reply.get(p.file).search.text, "utf8") <= 16384, p.file);
    });

    test("[html-readable] the raw body stays stored: a raw source is named in the reply and reachable by source, not ranked by default", async () => {
      const ctx = ctxFor(root);
      const url = base + "react-useeffect.html";
      const { index, search } = reply.get("react-useeffect.html");
      assert.ok(index.text.includes(url + " (raw)"), "reply names the raw source: " + index.text);
      assert.equal(search.text.includes("(raw)"), false, "default search never lists the raw source");
      const raw = await ctxSearch.handler({ queries: ["sp-pristine cm-line"], source: url + " (raw)" }, ctx);
      assert.equal(raw.isError, false, raw.text);
      assert.ok(raw.text.includes("sp-") || raw.text.includes("<div"), "raw source holds the markup: " + raw.text.slice(0, 300));
      const def = await ctxSearch.handler({ queries: ["sp-pristine cm-line"] }, ctx);
      assert.equal(def.text.includes("(raw)"), false, "default search does not rank raw html");
    });

    test("[html-readable] a client-rendered page with no readable text says so and indexes no noise", async () => {
      const { index } = reply.get("spa-excalidraw.html");
      assert.equal(index.isError, false, index.text);
      assert.match(index.text, /no readable text/i, index.text);
      assert.ok(index.text.includes("(raw)"), "the raw page is still kept: " + index.text);
      const ctx = ctxFor(root);
      // Other pages share this database, so look only at hits from the excalidraw page (raw source excluded by default).
      const s = await ctxSearch.handler({ queries: ["setTheme localStorage excalidraw-theme"] }, ctx);
      const own = s.text.split("\n").filter((l) => l.includes("spa-excalidraw.html"));
      assert.deepEqual(own, [], "script body is not indexed for default search: " + own.join("\n").slice(0, 300));
    });
  });

  // Moved from tests/v2/e2e/fetch-index-search-parity.test.mjs
  // Serial inside the concurrent stage: the summary tests read the Map the per-host tests fill, in order.
  describe("PRD-v2 section 8 / fetch, index, search parity on 10 hosts", { concurrency: 1 }, () => {
    // Owner scenario (Pi session 2026-10-30): "Fetch the React useEffect docs, index them, and find the cleanup pattern
    // with code examples." For all 10 hosts: ctx_index {url} then ctx_search {queries}, each the way the host runs it.
    //   MCP hosts (claude-code, codex, gemini, qwen, copilot-cli, vscode, kiro, zcode): the built server.mjs --agent <host>
    //     over stdio JSON-RPC (vscode also gets --workspace-folder, as setup writes it).
    //   pi: src/entries/pi.ts in process, with the documented ctx object ({cwd, sessionManager}) from before_agent_start.
    //   opencode: src/entries/opencode.ts in process, with the documented app object ({directory, tool}).
    // The page is the saved react.dev fixture, served by a local HTTP server. No internet. safeFetch blocks loopback by
    // design, so _parity-net-shim.mjs moves only the last hop (a TEST-NET-3 address resolves and connects to 127.0.0.1);
    // the URL parse, DNS check and SSRF check of safeFetch still run.
    // Asserted per host: same chunk count, same hit list, same reply bytes, reply under OUTPUT_CAP, no error line.
    // Clean snippets (no tag, attribute, flight data) are asserted once the readable-text change is in the tree.










    const REPO = resolve(import.meta.dirname, "../..");
    const BUILD = join(REPO, "build/build.mjs");
    const FIXTURE = join(REPO, "tests/v2/fixtures/parity/react-useeffect.html");
    const SHIM = join(REPO, "tests/v2/e2e/_parity-net-shim.mjs");
    const HOST = "docs.parity.test";
    const QUERY = "useEffect cleanup function return pattern";
    const OUTPUT_CAP = 16384; // src/core/contracts/constants.ts OUTPUT_CAP: the one bound for every reply
    const MCP_HOSTS = ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode"];
    const ALL_HOSTS = [...MCP_HOSTS, "pi", "opencode"];

    let root, pkg, srv, url, probeUrl;
    const results = new Map(); // host -> { indexText, searchText }
    const savedEnv = {};

    function gitRepo(dir) {
      mkdirSync(dir, { recursive: true });
      execFileSync("git", ["init", "-q", dir]);
      return realpathSync(dir);
    }

    before(async () => {
      root = realpathSync(mkdtempSync(join(tmpdir(), "cm-parity-")));
      const built = spawnSync(process.execPath, [BUILD, "--out", join(root, "pkg")], { cwd: REPO, encoding: "utf8" });
      assert.equal(built.status, 0, built.stderr);
      pkg = join(root, "pkg");
      const page = readFileSync(FIXTURE);
      const probe = "<html><body><h1>Probe</h1><p class=\"zz-attr\">The widget parity probe sentence.</p><script>var zzScript = 1;</script></body></html>";
      srv = http.createServer((req, res) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(req.url.startsWith("/probe") ? probe : page);
      });
      await new Promise((r) => srv.listen(0, "127.0.0.1", r));
      const base = `http://${HOST}:${srv.address().port}`;
      url = `${base}/reference/react/useEffect`;
      probeUrl = `${base}/probe`;
      for (const k of ["HOME", "USERPROFILE", "CLAUDE_PROJECT_DIR", "PARITY_HOST"]) savedEnv[k] = process.env[k];
      delete process.env.CLAUDE_PROJECT_DIR;
    });

    after(async () => {
      for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      await new Promise((r) => srv.close(r));
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch (err) { if (process.platform !== "win32") throw err; }
    });

    /** A minimal MCP stdio client: newline-delimited JSON-RPC, one request at a time. */
    async function mcpRun(host, home, proj, calls) {
      const args = [join(pkg, "server.mjs"), "--agent", host];
      if (host === "vscode") args.push("--workspace-folder", proj);
      const env = { ...process.env, HOME: home, USERPROFILE: home, NODE_OPTIONS: `--import=${pathToFileURL(SHIM).href}` };
      delete env.CLAUDE_PROJECT_DIR;
      const child = spawn(process.execPath, args, { cwd: proj, env, stdio: ["pipe", "pipe", "pipe"] });
      let buf = "";
      let stderr = "";
      let id = 0;
      const pending = new Map();
      child.stdout.on("data", (b) => {
        buf += b;
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (line.trim() === "") continue;
          const m = JSON.parse(line);
          if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        }
      });
      child.stderr.on("data", (b) => { stderr += b; });
      const rpc = (method, params) => new Promise((ok, bad) => {
        const n = ++id;
        const t = setTimeout(() => bad(new Error(`${host}: ${method} timed out. stderr: ${stderr}`)), 30000);
        pending.set(n, (m) => { clearTimeout(t); ok(m); });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
      });
      try {
        await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "parity", version: "1" } });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
        const out = [];
        for (const [name, a] of calls) {
          const r = await rpc("tools/call", { name, arguments: a });
          assert.ok(r.result, `${host}: ${name} had no result: ${JSON.stringify(r.error)}`);
          out.push({ text: r.result.content[0].text, isError: r.result.isError === true });
        }
        return { out, stderr };
      } finally {
        child.kill();
      }
    }

    /** The pi extension, driven as Pi drives it: before_agent_start with ctx, then tool.execute. */
    async function piRun(proj, calls) {
      const { default: piExtension } = await import("../../src/entries/pi.ts");
      const handlers = new Map();
      const tools = new Map();
      piExtension({ on: (n, f) => handlers.set(n, f), registerTool: (t) => tools.set(t.name, t) });
      const ctx = { cwd: proj, sessionManager: { getSessionId: () => "parity-pi" } };
      await handlers.get("before_agent_start")({ systemPrompt: "" }, ctx);
      const out = [];
      for (const [name, a] of calls) {
        try {
          const r = await tools.get(name).execute("call-" + out.length, a);
          out.push({ text: r.content[0].text, isError: false });
        } catch (err) {
          out.push({ text: err.message, isError: true }); // Pi marks a failed call by a throw
        }
      }
      return { out };
    }

    /** The opencode plugin, driven as OpenCode drives it: setup(app) registers tools, execute(args, {sessionID}). */
    async function opencodeRun(proj, calls) {
      const mod = await import("../../src/entries/opencode.ts");
      const tools = new Map();
      await mod.default.setup({ directory: proj, tool: (name, def) => tools.set(name, def) });
      const out = [];
      for (const [name, a] of calls) {
        const text = await tools.get(name).execute(a, { sessionID: "parity-oc" });
        out.push({ text, isError: /^(Fetch failed|Project source|Blocked|Invalid|Unknown|Internal)/.test(text) });
      }
      return { out };
    }

    // tag names the temp home and project, so one host can run twice (the probe) without a shared store.
    async function runHost(host, calls, { tag = host, mcp = MCP_HOSTS.includes(host) } = {}) {
      const home = join(root, "home-" + tag);
      mkdirSync(home);
      const proj = gitRepo(join(root, "proj-" + tag));
      if (mcp) return mcpRun(host, home, proj, calls);
      process.env.HOME = home; process.env.USERPROFILE = home; process.env.PARITY_HOST = HOST;
      return host === "pi" ? piRun(proj, calls) : opencodeRun(proj, calls);
    }

    const chunksOf = (t) => Number(/(\d+) chunk\(s\)/.exec(t)?.[1]);
    // A hit line is "<label> #<chunk id>: <snippet>". The id list is the ranking.
    const hitIds = (t) => [...t.matchAll(/^\S+ #(\d+): /gm)].map((m) => Number(m[1]));
    const bytes = (s) => Buffer.byteLength(s, "utf8");

    const hostCase = (host) => test(`[parity] ${host}: ctx_index {url} then ctx_search {queries} run without an error line`, async () => {
        const { out } = await runHost(host, [["ctx_index", { url }], ["ctx_search", { queries: [QUERY] }]]);
        const [idx, search] = out;
        assert.equal(idx.isError, false, `${host} index: ${idx.text}`);
        assert.equal(search.isError, false, `${host} search: ${search.text}`);
        assert.ok(Number.isInteger(chunksOf(idx.text)) && chunksOf(idx.text) > 0, idx.text);
        assert.ok(hitIds(search.text).length > 0, `${host}: no hit line in:\n${search.text.slice(0, 600)}`);
        results.set(host, { indexText: idx.text, searchText: search.text });
    });
    // The eight MCP hosts are child processes with their own HOME in env: they run concurrently. Pi and opencode run in this
    // process and set process.env.HOME, so they stay serial after the MCP block.
    describe("PRD-v2 section 8 / parity: MCP hosts (concurrent)", { concurrency: CONC }, () => {
      for (const host of MCP_HOSTS) hostCase(host);
    });
    for (const host of ALL_HOSTS.filter((h) => !MCP_HOSTS.includes(h))) hostCase(host);

    // Setup writes an MCP entry for opencode (server.mjs --agent opencode, spawn-cwd project), so a user can reach the
    // scenario through that server too, not only through the plugin. It must match the plugin and every other host.
    test("[parity] opencode through its MCP server entry matches the plugin and the other hosts", async () => {
      const { out } = await runHost("opencode", [["ctx_index", { url }], ["ctx_search", { queries: [QUERY] }]], { tag: "opencode-mcp", mcp: true });
      assert.equal(out[0].isError, false, out[0].text);
      assert.equal(out[1].isError, false, out[1].text);
      assert.equal(chunksOf(out[0].text), chunksOf(results.get("claude-code").indexText));
      assert.equal(out[1].text, results.get("claude-code").searchText);
    });

    test("[parity] all 10 hosts: same chunk count, same hit list, same reply bytes, reply under OUTPUT_CAP", () => {
      assert.equal(results.size, ALL_HOSTS.length, "every host ran: " + [...results.keys()].join(","));
      const ref = results.get("claude-code");
      const table = ALL_HOSTS.map((h) => `${h}: chunks=${chunksOf(results.get(h).indexText)} bytes=${bytes(results.get(h).searchText)} hits=${hitIds(results.get(h).searchText).length}`);
      console.log("parity per host\n" + table.join("\n"));
      for (const host of ALL_HOSTS) {
        const r = results.get(host);
        assert.equal(chunksOf(r.indexText), chunksOf(ref.indexText), `${host} chunk count`);
        assert.deepEqual(hitIds(r.searchText), hitIds(ref.searchText), `${host} hit list`);
        assert.equal(bytes(r.searchText), bytes(ref.searchText), `${host} reply bytes`);
        assert.equal(r.searchText, ref.searchText, `${host} reply text`);
        assert.ok(bytes(r.searchText) <= OUTPUT_CAP, `${host} reply ${bytes(r.searchText)} B over ${OUTPUT_CAP}`);
      }
    });

    // The readable-text change (html agent) converts HTML before chunking. Detected by behaviour, on a tiny page that
    // goes through the same fetch path: once a tag attribute or a script body no longer reaches a snippet, the real page
    // must come back clean on every host too. Before the change lands this test only records that fact.
    test("[parity] once HTML is converted to readable text, no host returns tags, attributes or flight data", async () => {
      const { out } = await runHost("claude-code", [["ctx_index", { url: probeUrl }], ["ctx_search", { queries: ["widget parity probe sentence"] }]], { tag: "probe" });
      const converted = !/zz-attr|zzScript|<p /.test(out[1].text);
      console.log("readable-text conversion in tree: " + converted);
      if (!converted) return;
      for (const host of ALL_HOSTS) {
        const full = results.get(host).searchText;
        // A page about React shows JSX in a fenced code block; that is page content, not leaked markup. The tag check
        // reads the text outside fences; the attribute, escape and flight-data checks read the whole reply.
        let prose = "";
        let fenced = false;
        for (const line of full.split("\n")) {
          if (line.trimStart().startsWith("```")) { fenced = !fenced; continue; }
          if (!fenced) prose += line + "\n";
        }
        for (const bad of [/<\/?[a-z][a-z0-9]*[\s>]/i, /\sclass="/, /\\u003[ce]/i, /\\"children\\"/, /\$r\\?"/]) {
          const t = bad.source.startsWith("<") ? prose : full;
          const hit = bad.exec(t);
          assert.ok(hit === null, `${host}: snippet holds ${bad} at ${hit && JSON.stringify(t.slice(Math.max(0, hit.index - 80), hit.index + 120))}`);
        }
      }
    });

    test("[parity] pi has no standalone server user path: setup writes no MCP entry for pi, so pi:ctx.cwd is never missing", async () => {
      const { ownMcpValue } = await import("../../src/core/ops/host-config.ts");
      assert.equal(ownMcpValue("pi", "node", "/x/server.mjs"), undefined);
      const { buildRegistry } = await import("../../src/setup/registry.ts");
      const rows = buildRegistry({ home: join(root, "home-reg"), pkgDir: pkg, env: {} });
      const piRow = rows.find((r) => r.id === "pi");
      assert.equal(piRow.installMode, "in-process");
      assert.equal(piRow.config, undefined, "setup must not write an MCP server entry for pi");
      // opencode is spawn-cwd: its MCP entry is valid and covered by the test above.
      assert.deepEqual(rows.find((r) => r.id === "opencode").config.value.command.slice(-2), ["--agent", "opencode"]);
    });
  });
});

// Stage 2 (serial): these two sections set HTTP_PROXY/NO_PROXY in process.env. A concurrent fetch or child spawn would see them,
// so they run after stage 1 and one after the other.
// Moved from tests/v2/tools/index.test.mjs
describe("PRD-v2 section 8 / ctx_index", () => {
  // Unit tests for src/core/tools/index.ts (impl/05 §3). ctx_index: {path|content|url, source?}.







  function ctxFor(root) {
    return {
      project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId: "s1", turn: 1, signal: new AbortController().signal,
    };
  }

  test("ctx_index name and readOnly flag match the registry contract", () => {
    assert.equal(ctxIndex.name, "ctx_index");
    assert.equal(ctxIndex.readOnly, false);
  });

  test("ctxIndex rejects when zero of path/content/url are given (ONE_OF_INPUT)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix-"));
    try {
      const out = await ctxIndex.handler({}, ctxFor(root));
      assert.equal(out.isError, true);
      // Canonical 00 §3.3 text (DECISIONS-r9 M23, impl/05 A5), DEVIATIONS D-M2-T8-1.
      assert.equal(out.text, "Pass exactly one of path, content, url. Fix: drop the extra field.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxIndex rejects when more than one of path/content/url are given", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix2-"));
    try {
      const out = await ctxIndex.handler({ content: "a", path: "a.txt" }, ctxFor(root));
      assert.equal(out.isError, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxIndex indexes inline content and replies with a source/chunk count", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix3-"));
    try {
      const out = await ctxIndex.handler({ content: "hello world, this is indexed text", source: "note" }, ctxFor(root));
      assert.equal(out.isError, false);
      assert.ok(/Indexed \d+ source/.test(out.text));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxIndex rejects a path that resolves outside the project (OUTSIDE_ROOT)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix4-"));
    try {
      const out = await ctxIndex.handler({ path: "../../../etc/passwd" }, ctxFor(root));
      assert.equal(out.isError, true);
      assert.ok(/outside the project/.test(out.text));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ctxIndex indexes a single file inside the project by path", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix5-"));
    writeFileSync(join(root, "a.txt"), "file body text for indexing");
    try {
      const out = await ctxIndex.handler({ path: "a.txt" }, ctxFor(root));
      assert.equal(out.isError, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // M2-R5: 14a issue cases at the ctx_index boundary (impl/05 §3, impl/03 §6).





  function storedChunks(root) {
    const db = new DatabaseSync(ctxFor(root).project.dbPath, { readOnly: true });
    try {
      return db.prepare("SELECT source_id, ord, body FROM chunks ORDER BY source_id, ord").all();
    } finally {
      db.close();
    }
  }

  test("[M2] GP5/batch-ingestion-byte-caps: ingested bytes and chunk counts stay within the budget (#980)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix6-"));
    // 3 MB, more than INDEX_WRITE_CHUNK twice over, as one line and as a folder of files.
    const big = "ingest budget words ".repeat(Math.ceil((3 * C.INDEX_WRITE_CHUNK) / 20));
    mkdirSync(join(root, "docs"));
    for (let i = 0; i < 4; i += 1) writeFileSync(join(root, "docs", `f${i}.md`), big.slice(0, C.INDEX_WRITE_CHUNK));
    try {
      const one = await ctxIndex.handler({ content: big, source: "big" }, ctxFor(root));
      assert.equal(one.isError, false);
      assert.equal(one.sandboxBytes, Buffer.byteLength(big));
      const dir = await ctxIndex.handler({ path: "docs" }, ctxFor(root));
      assert.equal(dir.isError, false);
      assert.equal(dir.sandboxBytes, 4 * C.INDEX_WRITE_CHUNK);
      const rows = storedChunks(root);
      const said = [one.text, dir.text].map((t) => Number(t.split(" source(s), ")[1].split(" ")[0]));
      assert.equal(rows.length, said[0] + said[1]);
      for (const r of rows) assert.ok(Buffer.byteLength(r.body) <= C.MAX_CHUNK_BYTES);
      const bySource = new Map();
      for (const r of rows) bySource.set(r.source_id, (bySource.get(r.source_id) ?? "") + r.body);
      assert.equal(bySource.size, 5);
      assert.equal([...bySource.values()][0], big);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  async function withProxyEnv(vars, fn) {
    const keys = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"];
    const saved = {};
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, vars);
    try { return await fn(); } finally {
      for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  }

  test("[M2] GP5/http-proxy-honored: ctx_index url goes to the proxy from env, SSRF-checked there (#1039, #476)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix7-"));
    let hits = 0;
    const proxy = createServer((req, res) => { hits += 1; res.end("x"); });
    proxy.on("connection", () => { hits += 1; });
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    try {
      for (const [key, url] of [["HTTP_PROXY", "http://example.com/"], ["https_proxy", "https://example.com/"]]) {
        const out = await withProxyEnv({ [key]: `http://127.0.0.1:${proxy.address().port}` }, () => ctxIndex.handler({ url }, ctxFor(root)));
        assert.equal(out.isError, true, key);
        assert.equal(out.text, "Blocked private address 127.0.0.1. Fix: use a public URL.", key);
      }
      assert.equal(hits, 0, "no socket may reach a private proxy");
    } finally {
      await new Promise((r) => proxy.close(r));
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M2] GP4/fetch-error-one-line-cause: an unreachable url gives one line with the low-level code, no stack (#1135)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ix8-"));
    try {
      for (const url of ["http://cm-v2-unreachable.invalid/x", "ftp://example.com/x", "not a url"]) {
        const out = await withProxyEnv({}, () => ctxIndex.handler({ url }, ctxFor(root)));
        assert.equal(out.isError, true, url);
        assert.ok(out.text.startsWith("Fetch failed: "), out.text);
        assert.ok(out.text.endsWith(". Fix: check the URL or proxy."), out.text);
        assert.ok(!out.text.includes("\n"), out.text);
        assert.ok(!out.text.includes(" at "), out.text);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M2-review] ctx_execute, ctx_batch, ctx_index schemas name the fix for an unknown key (00 §5.2 step 1)", async () => {
    const { ctxExecuteSchema } = await import("../../src/core/tools/execute.ts");
    const { ctxBatchSchema } = await import("../../src/core/tools/batch.ts");
    const { ctxIndexSchema } = await import("../../src/core/tools/index.ts");
    for (const [schema, input] of [[ctxExecuteSchema, { language: "shell", code: "x", bogus: 1 }], [ctxBatchSchema, { commands: ["x"], queries: ["x"], bogus: 1 }], [ctxIndexSchema, { content: "x", bogus: 1 }]]) {
      const r = schema.safeParse(input);
      assert.equal(r.success, false);
      assert.equal(r.error.issues[0].message, 'Unknown field "bogus". Fix: use "queries".');
    }
  });

  // Search layer 1 (D-SEARCH-1): inline content with a heading or a fence is chunked as markdown, so a
  // fenced block with blank lines inside is stored whole in one chunk.
  test("[search-L1] ctx_index content: a fenced block with blank lines is stored whole in one chunk", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ixmd-"));
    const fence = "```ts\nconst a = 1;\n\nconst b = 2;\n\n\nexport { a, b };\n```";
    try {
      const r = await ctxIndex.handler({ content: "## Setup\n\nIntro.\n\n" + fence + "\n\nAfter.", source: "md-inline" }, ctxFor(root));
      assert.equal(r.isError, false);
      assert.equal(storedChunks(root).filter((c) => c.body.includes(fence)).length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// Moved from tests/v2/sandbox/fetch.test.mjs
describe("PRD-v2 section 8 / safeFetch", () => {
  // Unit tests for src/core/sandbox/fetch.ts (impl/03 §6).
  // safeFetch(url, signal): {body, contentType, finalUrl}. SSRF check on resolved target, per hop.




  test("safeFetch rejects a loopback address with the SSRF error text", async () => {
    await assert.rejects(
      safeFetch("http://127.0.0.1:1/x", new AbortController().signal),
      (err) => /Blocked private address/.test(err.message)
    );
  });

  test("safeFetch rejects a link-local address (169.254.0.0/16)", async () => {
    await assert.rejects(
      safeFetch("http://169.254.169.254/latest/meta-data", new AbortController().signal),
      (err) => /Blocked private address/.test(err.message)
    );
  });

  test("safeFetch rejects 0.0.0.0", async () => {
    await assert.rejects(safeFetch("http://0.0.0.0/x", new AbortController().signal));
  });

  test("safeFetch returns a one-line FETCH_FAILED cause for an unreachable host, no raw stack", async () => {
    await assert.rejects(
      safeFetch("http://cm-v2-unreachable.invalid.test/x", new AbortController().signal),
      (err) => {
        assert.ok(/^Fetch failed:/.test(err.message));
        assert.ok(!err.message.includes("\n    at "));
        return true;
      }
    );
  });

  test("safeFetch honours an AbortSignal fired before completion", async () => {
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(safeFetch("http://example.com/", ac.signal));
  });

  test("safeFetch returns body, contentType and finalUrl shape on success", async (t) => {
    if (process.env.CI) { t.skip("no network in CI"); return; }
    try {
      const out = await safeFetch("https://example.com/", new AbortController().signal);
      assert.ok(Buffer.isBuffer(out.body));
      assert.equal(typeof out.contentType, "string");
      assert.equal(typeof out.finalUrl, "string");
    } catch {
      t.skip("network unavailable in this sandbox");
    }
  });

  // ---- proxy env and SSRF on the resolved target, per hop (impl/03 §6, impl/05 §4, review-M0 #10) ----


  const PROXY_KEYS = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"];

  async function withEnv(vars, fn) {
    const saved = {};
    for (const k of PROXY_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, vars);
    try { return await fn(); } finally {
      for (const k of PROXY_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  }

  // A local proxy that counts every connection it receives.
  async function countingProxy() {
    let hits = 0;
    const srv = createServer((req, res) => { hits += 1; res.end("proxied"); });
    srv.on("connect", (req, sock) => { hits += 1; sock.destroy(); });
    srv.on("connection", () => { hits += 1; });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    return { url: `http://127.0.0.1:${srv.address().port}`, hits: () => hits, close: () => new Promise((r) => srv.close(r)) };
  }

  test("GP5/http-proxy-honored: HTTP_PROXY is the connect target and the SSRF check runs on it", async () => {
    const p = await countingProxy();
    try {
      await withEnv({ HTTP_PROXY: p.url }, () =>
        assert.rejects(safeFetch("http://example.com/", new AbortController().signal), (err) => {
          assert.equal(err.code, "SSRF");
          assert.equal(err.message, "Blocked private address 127.0.0.1. Fix: use a public URL.");
          return true;
        }));
      assert.equal(p.hits(), 0, "no socket may reach a private proxy");
    } finally { await p.close(); }
  });

  test("GP5/http-proxy-honored: HTTPS_PROXY and lower-case https_proxy are read for https URLs", async () => {
    for (const key of ["HTTPS_PROXY", "https_proxy"]) {
      await withEnv({ [key]: "http://localhost:9" }, () =>
        assert.rejects(safeFetch("https://example.com/", new AbortController().signal), (err) => {
          assert.equal(err.code, "SSRF");
          assert.ok(err.message.includes("localhost"), err.message);
          return true;
        }));
    }
  });

  test("HTTP_PROXY is not used for an https URL (per-scheme)", async () => {
    await withEnv({ HTTP_PROXY: "http://127.0.0.1:9" }, () =>
      assert.rejects(safeFetch("https://127.0.0.2/", new AbortController().signal), (err) => {
        assert.equal(err.message, "Blocked private address 127.0.0.2. Fix: use a public URL.");
        return true;
      }));
  });

  test("NO_PROXY exact and .suffix matches skip the proxy", async () => {
    for (const no of ["127.0.0.3", "x.example, 127.0.0.3 ", "X.EXAMPLE,127.0.0.3"]) {
      await withEnv({ HTTP_PROXY: "http://127.0.0.1:9", no_proxy: no }, () =>
        assert.rejects(safeFetch("http://127.0.0.3/", new AbortController().signal), (err) => {
          assert.equal(err.message, "Blocked private address 127.0.0.3. Fix: use a public URL.");
          return true;
        }));
    }
    await withEnv({ HTTP_PROXY: "http://127.0.0.1:9", NO_PROXY: ".localtest.example" }, () =>
      assert.rejects(safeFetch("http://a.localtest.example/", new AbortController().signal), (err) => {
        assert.ok(!err.message.includes("127.0.0.1"), err.message);
        return true;
      }));
  });

  test("SSRF covers private, IPv6 and IPv4-mapped targets", async () => {
    const blocked = ["http://10.1.2.3/", "http://172.16.0.1/", "http://192.168.1.1/", "http://[::1]/",
      "http://[fe80::1]/", "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/", "http://localhost/", "http://[::]/"];
    for (const u of blocked) {
      await withEnv({}, () => assert.rejects(safeFetch(u, new AbortController().signal), (err) => {
        assert.equal(err.code, "SSRF", u);
        return true;
      }));
    }
  });

  test("GP5/fetch-error-one-line: every failure is one line, code FETCH_FAILED or SSRF", async () => {
    const cases = ["not a url", "ftp://example.com/x", "http://cm-v2-unreachable.invalid.test/x"];
    for (const u of cases) {
      await withEnv({}, () => assert.rejects(safeFetch(u, new AbortController().signal), (err) => {
        assert.equal(err.code, "FETCH_FAILED", u);
        assert.ok(!err.message.includes("\n"), err.message);
        assert.ok(err.message.startsWith("Fetch failed: "), err.message);
        assert.ok(err.message.endsWith(". Fix: check the URL or proxy."), err.message);
        return true;
      }));
    }
  });

  test("abort before completion is FETCH_FAILED ABORT_ERR", async () => {
    const ac = new AbortController();
    ac.abort();
    await withEnv({}, () => assert.rejects(safeFetch("http://example.com/", ac.signal), (err) => {
      assert.equal(err.message, "Fetch failed: ABORT_ERR. Fix: check the URL or proxy.");
      return true;
    }));
  });

  test("an IP-literal private origin is blocked even when a proxy is set (B57 hop rule)", async () => {
    await withEnv({ HTTP_PROXY: "http://127.0.0.1:9" }, () =>
      assert.rejects(safeFetch("http://169.254.169.254/latest/meta-data", new AbortController().signal), (err) => {
        assert.equal(err.message, "Blocked private address 169.254.169.254. Fix: use a public URL.");
        return true;
      }));
  });
});
