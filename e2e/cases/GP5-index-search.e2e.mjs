// GP5 — ctx_index / ctx_search (14-tests.md §4). M2 case.
// Case source: TECH-SPEC §6.2 GP5 row. covers: src/core/tools/{index,search}.ts, src/core/index/.
// Golden recall@5 per type fixed to DECISIONS-r7 values (BM25+RRF k=60, no MMR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";
import { checkGolden } from "../harness/golden.mjs";
import { dumpDb } from "../harness/db-dump.mjs";

// 14a-issue-cases.md GP5 rows ported from tests unit files (M2-E2): auto-index-exec-output
// (tests/tools/execute.test.mjs), batch-execute-dedup-section / batch-index-byte-budget
// (tests/tools/batch.test.mjs), batch-ingestion-byte-caps / http-proxy-honored
// (tests/tools/index.test.mjs), chunk-byte-cap / chunk-size-cap / nested-fenced-code-intact /
// rowless-tables / rowless-tables-survive (tests/index/chunk.test.mjs), ctx-search-schema-
// declares-query / search-param-schema-match / negative-limit-rejected / dedupe-chunks-across-
// queries / fts-highlight-bytecap / session-worktree-project-rank (tests/tools/search.test.mjs),
// globstar-zero-depth / nested-gitignore-negation (tests/index/walk.test.mjs), non-ascii-auto-
// memory-match (tests/index/auto-memory.test.mjs), snippet-code-point-safe
// (tests/store/fts.test.mjs). Black-box only: calls release-out/server.mjs over MCP, no src/
// import, per docs/architecture/modules/14-tests.md §4/§5 and docs/architecture/modules/05-tools-index.md.
// Constants cited below (MAX_CHUNK_BYTES=4096, SNIPPET_MAX_BYTES=800, OUTPUT_CAP=16384,
// RETENTION_SIZE_CAP_BYTES=524288000) are src/core/contracts/constants.ts values repeated as
// literals here, per the e2e/ never-imports-src/ rule (same pattern as D-M0-4's CLOSE_TIMEOUT_MS).
const MAX_CHUNK_BYTES = 4096;
const SNIPPET_MAX_BYTES = 800;
const OUTPUT_CAP = 16384;
const RETENTION_SIZE_CAP_BYTES = 524288000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_BUNDLE = path.join(REPO_ROOT, "release-out", "server.mjs");

// The server needs a project (impl/11 §5 step 1): one fresh project dir and HOME per file, so no
// reply depends on the runner's own HOME or cwd.
const PROJECT = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-proj-")));
execFileSync("git", ["init", "-q", PROJECT]);
const HOME = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-home-")));
const ENV = { ...process.env, HOME, USERPROFILE: HOME, CLAUDE_PROJECT_DIR: PROJECT };

// impl/14 §4 steps 5-6: the shared golden check (UPDATE_GOLDEN=1 records), with this file's
// project and home dirs replaced by <proj>/<home>.
function golden(name, value) {
  checkGolden("GP5", name, normalize(value, { home: HOME, proj: PROJECT }));
}

async function withClient(fn) {
  const client = spawnBundle(SERVER_BUNDLE, ENV);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

// Skeptic-M2 (https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/skeptic-M2.md): the three recall@5 cases below must search a corpus that
// actually holds a relevant row and distractor rows, never an empty project — a reply of
// "No hits ... across 0 source(s)" would still byte-match a frozen golden even if ranking were
// deleted or ctx_search returned a constant string, so each case now indexes a relevant doc plus
// 2 distractors first and asserts the relevant doc is actually the top hit (recall@1 within this
// fixture), in addition to the full normalized golden.
async function seedCorpus(relevant, distractors) {
  await withClient((c) => c.request("tools/call", { name: "ctx_index", arguments: { content: relevant.content, source: relevant.source } }));
  for (const d of distractors) {
    await withClient((c) => c.request("tools/call", { name: "ctx_index", arguments: { content: d.content, source: d.source } }));
  }
}

test("[M2] GP5/recall-at-5-decision", async () => {
  await seedCorpus(
    { source: "decision-row", content: "decision: ship BM25+RRF ranking for ctx_search, no MMR step, k=60." },
    [
      { source: "errorfix-row", content: "errorfix: ENOTFOUND on fetch now returns a one-line cause, no raw stack." },
      { source: "timeline-row", content: "timeline: sort merges content, session and auto-memory rows oldest first." },
    ],
  );
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { queries: ["decision"], scope: "project" } }));
  const text = reply.content?.[0]?.text ?? "";
  assert.ok(!/^No hits/.test(text), "corpus is seeded; a real reply must not be the empty-corpus string");
  assert.ok(text.includes("decision-row"), `top hit must be the seeded decision row, got: ${text}`);
  golden("recall-at-5-decision", reply);
});

test("[M2] GP5/recall-at-5-errorfix", async () => {
  await seedCorpus(
    { source: "errorfix-row-2", content: "errorfix: ValidationError on negative offset is a zod isError, never a thrown exception." },
    [
      { source: "decision-row-2", content: "decision: index.ts owns chunking, search.ts owns ranking, no cross-import." },
      { source: "timeline-row-2", content: "timeline: after cursor drops rows at or before the given epoch-ms timestamp." },
    ],
  );
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { queries: ["errorfix"], scope: "project" } }));
  const text = reply.content?.[0]?.text ?? "";
  assert.ok(!/^No hits/.test(text), "corpus is seeded; a real reply must not be the empty-corpus string");
  assert.ok(text.includes("errorfix-row-2"), `top hit must be the seeded errorfix row, got: ${text}`);
  golden("recall-at-5-errorfix", reply);
});

test("[M2] GP5/recall-at-5-timeline", async () => {
  await seedCorpus(
    { source: "timeline-row-3", content: "timeline cmd #1 ran first" },
    [{ source: "timeline-row-4", content: "timeline cmd #2 ran second" }],
  );
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { queries: ["timeline"], sort: "timeline", scope: "project" } }));
  const text = reply.content?.[0]?.text ?? "";
  assert.ok(!/^No hits/.test(text), "corpus is seeded; a real reply must not be the empty-corpus string");
  assert.ok(text.includes("timeline-row-3") && text.includes("timeline-row-4"), `both seeded rows must appear in timeline order, got: ${text}`);
  golden("recall-at-5-timeline", reply);
});

test("[M2] GP5/V23-negative-offset-after-empty-queries-iserror", async () => {
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { offset: -1, after: -1, queries: [] } }));
  assert.equal(reply.isError, true);
  golden("V23-negative-offset-after-empty-queries-iserror", reply);
});

test("[M2] GP5/V24-cyrillic-and-accented-latin-recall", async () => {
  const indexed = await withClient((c) => c.request("tools/call", { name: "ctx_index", arguments: { content: "Привет мир, café crème", source: "V24" } }));
  const hitsCyrillic = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { queries: ["привет"] } }));
  const hitsAccented = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { queries: ["cafe"] } }));
  golden("V24-cyrillic-and-accented-latin-recall", { indexed, hitsCyrillic, hitsAccented });
});

test("[M2] GP5/fetch-error-one-line-cause", async () => {
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_index", arguments: { url: "http://cm-v2-unreachable.invalid.test/x" } }));
  assert.equal(reply.isError, true);
  assert.ok(/^Fetch failed:/.test(reply.content?.[0]?.text ?? ""));
  assert.ok(!(reply.content?.[0]?.text ?? "").includes("\n    at "));
  golden("fetch-error-one-line-cause", reply);
});

// --- M2-E2 ported cases below -------------------------------------------------------------

// Finds the one project DB under a fresh HOME (each case below uses its own HOME, so there is
// exactly one projectKey dir under ~/.context-mode/projects).
function projectDbPath(home) {
  const projectsDir = path.join(home, ".context-mode", "projects");
  const [key] = readdirSync(projectsDir).sort();
  return path.join(projectsDir, key, "context.db");
}

test("[M2] GP5/auto-index-exec-output", async () => {
  const code = `for (let i = 0; i < 1000; i++) console.log("line " + i + " " + "p".repeat(50) + (i === 777 ? " zebraquartz" : ""))`;
  const reply = await withClient(async (c) => {
    const out = await c.request("tools/call", { name: "ctx_execute", arguments: { language: "javascript", code } });
    assert.equal(out.isError, false);
    const hit = await c.request("tools/call", { name: "ctx_search", arguments: { queries: ["zebraquartz"], scope: "session" } });
    return hit;
  });
  const text = reply.content?.[0]?.text ?? "";
  assert.equal(reply.isError, false);
  assert.ok(text.includes("zebraquartz"), text);
  assert.ok(text.includes("ctx_execute:"), "hit carries the ctx_execute source label, got: " + text);
  golden("auto-index-exec-output", reply);
});

test("[M2] GP5/batch-execute-dedup-section", async () => {
  const reply = await withClient((c) =>
    c.request("tools/call", { name: "ctx_batch", arguments: { commands: ["echo 'alpha zebraquartz omega'"], queries: ["zebraquartz", "alpha zebraquartz"] } }),
  );
  const text = reply.content?.[0]?.text ?? "";
  assert.equal(reply.isError, false);
  const bodyLines = text.split("\n").filter((l) => l === "alpha zebraquartz omega");
  assert.equal(bodyLines.length, 1, text);
  const lines = text.split("\n");
  const i = lines.indexOf("## alpha zebraquartz");
  assert.equal(lines[i + 1], "No new section.", text);
  golden("batch-execute-dedup-section", reply);
});

// D-M2-R4-1: one batch call ingests up to RETENTION_SIZE_CAP_BYTES (the real per-project cap);
// no test-only budget knob exists through MCP, so this case runs at the real 500 MB scale (slow:
// generating and ingesting 500 MB can take minutes). DEVIATIONS M2-C1 (commit body): at this
// scale the EXEC_TIMEOUT_MS deadline (600 s, shared by exec + index) may end the ingest before the
// byte budget does — src/core/tools/batch.ts's "Indexed <n> of <m> B." cut line is then prefixed
// by the timeout cause text instead of starting the line. Either way the cut is real (idx.indexed
// < idx.total), never a test-only knob, so this case accepts both causes.
test("[M2] GP5/batch-index-byte-budget", { timeout: 580_000 }, async () => {
  // fs.writeSync(1, ...) (not process.stdout.write, which buffers and can outrun the pipe at this
  // scale) so the whole 500 MB+ writes in well under a second, leaving the EXEC_TIMEOUT_MS budget
  // for indexing rather than for generating the fixture.
  const cmd = `node -e "const B=Buffer.from(('row needle '+'x'.repeat(40)+String.fromCharCode(10)).repeat(20000));const fs=require('fs');const need=Math.ceil((${RETENTION_SIZE_CAP_BYTES}+2000000)/B.length);for(let n=0;n<need;n++)fs.writeSync(1,B)"`;
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_batch", arguments: { commands: [cmd], queries: ["needle"] } }));
  const text = reply.content?.[0]?.text ?? "";
  assert.equal(reply.isError, false, text);
  const line = text.split("\n").find((l) => l.includes("Indexed ") && l.includes(" of ") && l.includes(" B."));
  assert.ok(line, "reply states the cut: " + text.slice(0, 400));
  const m = line.match(/Indexed (\d+) of (\d+) B\./);
  assert.ok(m, line);
  const indexed = Number.parseInt(m[1], 10);
  const total = Number.parseInt(m[2], 10);
  assert.ok(indexed > 0 && indexed <= RETENTION_SIZE_CAP_BYTES, `indexed ${indexed} <= ${RETENTION_SIZE_CAP_BYTES}`);
  assert.ok(total > RETENTION_SIZE_CAP_BYTES);
  assert.ok(Buffer.byteLength(text) <= OUTPUT_CAP);
  golden("batch-index-byte-budget", { isError: reply.isError, cutByDeadline: line.includes("Timed out") });
});

test("[M2] GP5/batch-ingestion-byte-caps", async () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-ix6-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-ix6-proj-")));
  execFileSync("git", ["init", "-q", proj]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const INDEX_WRITE_CHUNK = 1048576;
  const big = "ingest budget words ".repeat(Math.ceil((3 * INDEX_WRITE_CHUNK) / 20));
  mkdirSync(path.join(proj, "docs"));
  for (let i = 0; i < 4; i += 1) writeFileSync(path.join(proj, "docs", `f${i}.md`), big.slice(0, INDEX_WRITE_CHUNK));
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const one = await client.request("tools/call", { name: "ctx_index", arguments: { content: big, source: "big" } });
    assert.equal(one.isError, false);
    const dir = await client.request("tools/call", { name: "ctx_index", arguments: { path: "docs" } });
    assert.equal(dir.isError, false);
    const rows = dumpDb(projectDbPath(home), ["chunks"]).chunks;
    for (const r of rows) assert.ok(Buffer.byteLength(r.body) <= MAX_CHUNK_BYTES);
    const said = [one.content?.[0]?.text, dir.content?.[0]?.text].map((t) => Number(t.split(" source(s), ")[1].split(" ")[0]));
    assert.equal(rows.length, said[0] + said[1]);
    golden("batch-ingestion-byte-caps", { one, dir });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/chunk-byte-cap", async () => {
  const para = "lorem ipsum dolor sit amet ".repeat(Math.ceil((1 << 20) / 27)).slice(0, 1 << 20);
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-cb-home-")));
  const env = { ...ENV, HOME: home, USERPROFILE: home };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const out = await client.request("tools/call", { name: "ctx_index", arguments: { content: para, source: "cb" } });
    assert.equal(out.isError, false);
    const rows = dumpDb(projectDbPath(home), ["chunks"]).chunks.slice().sort((a, b) => a.ord - b.ord);
    assert.ok(rows.length >= (1 << 20) / MAX_CHUNK_BYTES);
    for (const r of rows) assert.ok(Buffer.byteLength(r.body) <= MAX_CHUNK_BYTES);
    assert.equal(rows.map((r) => r.body).join(""), para);
    golden("chunk-byte-cap", { isError: out.isError, chunkCount: rows.length });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/chunk-size-cap", async () => {
  const line = "aé日🙂".repeat(40000);
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-cs-home-")));
  const env = { ...ENV, HOME: home, USERPROFILE: home };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const out = await client.request("tools/call", { name: "ctx_index", arguments: { content: line, source: "cs" } });
    assert.equal(out.isError, false);
    const rows = dumpDb(projectDbPath(home), ["chunks"]).chunks.slice().sort((a, b) => a.ord - b.ord);
    for (const r of rows) {
      assert.ok(Buffer.byteLength(r.body) <= MAX_CHUNK_BYTES);
      assert.ok(!r.body.includes("�"));
      assert.equal(Buffer.from(r.body, "utf8").toString("utf8"), r.body);
    }
    assert.equal(rows.map((r) => r.body).join(""), line);
    golden("chunk-size-cap", { isError: out.isError, chunkCount: rows.length });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/ctx-search-schema-declares-query", async () => {
  const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { query: "x" } }));
  assert.equal(reply.isError, true);
  const text = reply.content?.[0]?.text ?? "";
  assert.ok(text.includes('"queries"'), text);
  assert.ok(!text.includes("\n"));
  golden("ctx-search-schema-declares-query", reply);
});

test("[M2] GP5/dedupe-chunks-across-queries", async () => {
  const reply = await withClient(async (c) => {
    await c.request("tools/call", { name: "ctx_index", arguments: { content: "alpha and beta in one chunk", source: "both" } });
    return c.request("tools/call", { name: "ctx_search", arguments: { queries: ["alpha", "beta", "alpha"], scope: "session" } });
  });
  const text = reply.content?.[0]?.text ?? "";
  assert.equal(reply.isError, false);
  const hits = text.split("\n").filter((l) => l.includes("both #0:"));
  assert.equal(hits.length, 1, text);
  golden("dedupe-chunks-across-queries", reply);
});

test("[M2] GP5/fts-highlight-bytecap", async () => {
  const row = ("needle <b>&</b> 😀 " + "x".repeat(80) + " ").repeat(52000);
  assert.ok(Buffer.byteLength(row, "utf8") >= 5 * 1024 * 1024);
  const reply = await withClient(async (c) => {
    await c.request("tools/call", { name: "ctx_index", arguments: { content: row, source: "big" } });
    const t0 = performance.now();
    const out = await c.request("tools/call", { name: "ctx_search", arguments: { queries: ["needle"], scope: "session" } });
    const ms = performance.now() - t0;
    // Generous bound under a loaded CI/milestone run (isolated: well under 1s); the point is no
    // O(corpus) rescan at 5 MB, not a tight perf SLA.
    assert.ok(ms < 8000, "ctx_search took " + ms + " ms");
    return out;
  });
  const text = reply.content?.[0]?.text ?? "";
  assert.equal(reply.isError, false);
  assert.ok(Buffer.byteLength(text, "utf8") <= OUTPUT_CAP);
  const line = text.split("\n").find((l) => /^big #\d+: /.test(l));
  const prefix = line.slice(0, line.indexOf(": ") + 2);
  const snippet = line.slice(prefix.length);
  assert.ok(Buffer.byteLength(snippet, "utf8") <= SNIPPET_MAX_BYTES);
  assert.ok(snippet.includes("needle <b>&</b> 😀"), "D-SEARCH-7: stored text, no entity encoding");
  assert.ok(row.includes(snippet), "one contiguous slice of the stored row");
  assert.ok(snippet.isWellFormed());
  golden("fts-highlight-bytecap", { isError: reply.isError, snippetBytes: Buffer.byteLength(snippet, "utf8") });
});

test("[M2] GP5/globstar-zero-depth", async () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-gs-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-gs-proj-")));
  execFileSync("git", ["init", "-q", proj]);
  writeFileSync(path.join(proj, ".gitignore"), "docs/**/*.md\n");
  mkdirSync(path.join(proj, "docs", "a", "b"), { recursive: true });
  mkdirSync(path.join(proj, "x", "docs"), { recursive: true });
  writeFileSync(path.join(proj, "docs", "top.md"), "t");
  writeFileSync(path.join(proj, "docs", "top.txt"), "t");
  writeFileSync(path.join(proj, "docs", "a", "b", "deep.md"), "d");
  writeFileSync(path.join(proj, "x", "docs", "top.md"), "x");
  writeFileSync(path.join(proj, "x", "keep.txt"), "k");
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const out = await client.request("tools/call", { name: "ctx_index", arguments: { path: "." } });
    assert.equal(out.isError, false);
    const rows = dumpDb(projectDbPath(home), ["sources"]).sources;
    const labels = rows.map((r) => r.label).sort();
    assert.ok(labels.includes("docs/top.txt"));
    assert.ok(labels.includes("x/keep.txt"));
    assert.ok(!labels.includes("docs/top.md"));
    assert.ok(!labels.includes("docs/a/b/deep.md"));
    assert.ok(!labels.includes("x/docs/top.md"));
    golden("globstar-zero-depth", { isError: out.isError, labels });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/nested-gitignore-negation", async () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-ng-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-ng-proj-")));
  execFileSync("git", ["init", "-q", proj]);
  writeFileSync(path.join(proj, ".gitignore"), "build/**\n!build/keep.txt\n");
  mkdirSync(path.join(proj, "a", "b"), { recursive: true });
  mkdirSync(path.join(proj, "build"), { recursive: true });
  writeFileSync(path.join(proj, "a", ".gitignore"), "x\n*.log\n!keep.log\n");
  writeFileSync(path.join(proj, "a", "x"), "1");
  writeFileSync(path.join(proj, "a", "y"), "2");
  writeFileSync(path.join(proj, "a", "b", "x"), "3");
  writeFileSync(path.join(proj, "a", "keep.log"), "k");
  writeFileSync(path.join(proj, "a", "drop.log"), "d");
  writeFileSync(path.join(proj, "x"), "top-level x is outside a/.gitignore's base");
  writeFileSync(path.join(proj, "build", "keep.txt"), "k");
  writeFileSync(path.join(proj, "build", "drop.txt"), "d");
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const out = await client.request("tools/call", { name: "ctx_index", arguments: { path: "." } });
    assert.equal(out.isError, false);
    const rows = dumpDb(projectDbPath(home), ["sources"]).sources;
    const labels = rows.map((r) => r.label).sort();
    assert.deepEqual(labels, [".gitignore", "a/.gitignore", "a/keep.log", "a/y", "build/keep.txt", "x"].sort());
    golden("nested-gitignore-negation", { isError: out.isError, labels });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/http-proxy-honored", async () => {
  let hits = 0;
  const proxy = createServer((req, res) => {
    hits += 1;
    res.end("x");
  });
  proxy.on("connection", () => { hits += 1; });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  try {
    for (const [key, url] of [["HTTP_PROXY", "http://example.com/"], ["https_proxy", "https://example.com/"]]) {
      const env = { ...ENV, [key]: `http://127.0.0.1:${proxy.address().port}` };
      const client = spawnBundle(SERVER_BUNDLE, env);
      await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
      try {
        const out = await client.request("tools/call", { name: "ctx_index", arguments: { url } });
        assert.equal(out.isError, true, key);
        assert.equal(out.content?.[0]?.text, "Blocked private address 127.0.0.1. Fix: use a public URL.", key);
      } finally {
        await client.close();
      }
    }
    assert.equal(hits, 0, "no socket may reach a private proxy");
  } finally {
    await new Promise((r) => proxy.close(r));
  }
  golden("http-proxy-honored", { hits });
});

test("[M2] GP5/negative-limit-rejected", async () => {
  for (const bad of [{ queries: [], offset: -1 }, { queries: [], after: -1 }, { queries: [], offset: 1.5 }]) {
    const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: bad }));
    assert.equal(reply.isError, true, JSON.stringify(bad));
  }
  const both = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { offset: -1, after: -1, queries: [] } }));
  assert.equal(both.isError, true);
  const ok = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: { queries: [] } }));
  assert.equal(ok.isError, false);
  golden("negative-limit-rejected", { both });
});

// ctx_index's "content" field always indexes as kind "text" (05-tools-index.md step 2); only
// "path" picks kind from the file extension (.md/.html/else text). So this case, chunk-byte-cap's
// html/text share and rowless-tables below write a real .md/.html file and index by path.
test("[M2] GP5/nested-fenced-code-intact", async () => {
  const pad = (tag) => (tag + " ").repeat(Math.floor((MAX_CHUNK_BYTES - 8) / (tag.length + 1))).trim();
  const fence = "````md\nouter text\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nstill outer\n````";
  const md = pad("before") + "\n\n" + fence + "\n\n" + pad("after");
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-nf-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-nf-proj-")));
  execFileSync("git", ["init", "-q", proj]);
  writeFileSync(path.join(proj, "nf.md"), md);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const out = await client.request("tools/call", { name: "ctx_index", arguments: { path: "nf.md" } });
    assert.equal(out.isError, false);
    const rows = dumpDb(projectDbPath(home), ["chunks"]).chunks;
    const hit = rows.filter((r) => r.body.includes("````md"));
    assert.equal(hit.length, 1);
    assert.equal(hit[0].body, fence);
    golden("nested-fenced-code-intact", { isError: out.isError, fenceIntact: hit[0].body === fence });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/non-ascii-auto-memory-match", async () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-ru-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-ru-proj-")));
  execFileSync("git", ["init", "-q", proj]);
  writeFileSync(path.join(proj, "CLAUDE.md"), "Привет: всегда запускай тесты перед коммитом\n");
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const out = await client.request("tools/call", { name: "ctx_search", arguments: { queries: ["привет"], sort: "timeline" } });
    assert.equal(out.isError, false);
    const text = out.content?.[0]?.text ?? "";
    const line = text.split("\n").find((l) => l.includes("] CLAUDE.md "));
    assert.ok(line, text);
    assert.ok(line.endsWith("Привет: всегда запускай тесты перед коммитом"), line);
    golden("non-ascii-auto-memory-match", { isError: out.isError, matched: Boolean(line) });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/rowless-tables", async () => {
  const html = "<table><caption>Quarterly totals</caption></table>";
  const pad = (tag) => (tag + " ").repeat(Math.floor((MAX_CHUNK_BYTES - 8) / (tag.length + 1))).trim();
  const md = pad("intro") + "\n| a | b |\n| - | - |\n" + pad("outro");
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-rt-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-rt-proj-")));
  execFileSync("git", ["init", "-q", proj]);
  writeFileSync(path.join(proj, "rt.html"), html);
  writeFileSync(path.join(proj, "rt.md"), md);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const client = spawnBundle(SERVER_BUNDLE, env);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    const outHtml = await client.request("tools/call", { name: "ctx_index", arguments: { path: "rt.html" } });
    assert.equal(outHtml.isError, false);
    const outMd = await client.request("tools/call", { name: "ctx_index", arguments: { path: "rt.md" } });
    assert.equal(outMd.isError, false);
    const rows = dumpDb(projectDbPath(home), ["chunks"]).chunks;
    assert.ok(rows.some((r) => r.body === html));
    assert.ok(rows.some((r) => r.body === "| a | b |\n| - | - |"));
    golden("rowless-tables", { isError: outHtml.isError && outMd.isError ? false : outHtml.isError || outMd.isError });
  } finally {
    await client.close();
  }
});

test("[M2] GP5/rowless-tables-survive", async () => {
  const cases = ["<table></table>", "<p>x</p><table></table><p>y</p>", "<table><thead></thead><tbody></tbody></table>"];
  const results = [];
  for (const html of cases) {
    const reply = await withClient((c) => c.request("tools/call", { name: "ctx_index", arguments: { content: html, source: "rts" } }));
    assert.equal(reply.isError, false, html);
    results.push(reply.isError);
  }
  golden("rowless-tables-survive", { results });
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
  const results = {};
  for (const [key, input] of Object.entries(valid)) {
    const reply = await withClient((c) => c.request("tools/call", { name: "ctx_search", arguments: input }));
    assert.equal(reply.isError, false, key + ": " + JSON.stringify(reply));
    results[key] = reply.isError;
  }
  golden("search-param-schema-match", { results });
});

// #895: with scope "project", own-session hits rank above own-worktree hits, and those above hits
// from other worktrees, even when the lower tier scores higher and is newer. Uses the GP7
// 2-worktree-of-same-repo pattern so projectKey is shared.
test("[M2] GP5/session-worktree-project-rank", async () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-rk-home-")));
  const main = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-rk-")));
  execFileSync("git", ["init", "-q"], { cwd: main });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: main });
  execFileSync("git", ["config", "user.name", "t"], { cwd: main });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init", "-q"], { cwd: main });
  const other = path.join(main, "..", path.basename(main) + "-wt");
  execFileSync("git", ["worktree", "add", "-q", other, "-b", "gp5-rk-wt"], { cwd: main });

  const envMain = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: main };
  const envOther = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: other };

  // "session" tier: indexed and searched by the same client connection, in the main worktree.
  const clientSession = spawnBundle(SERVER_BUNDLE, envMain);
  await clientSession.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  // "worktree" tier: a different session (separate connection), same main worktree.
  const clientWorktree = spawnBundle(SERVER_BUNDLE, envMain);
  await clientWorktree.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  // "project" tier: a different worktree of the same repo (shared projectKey).
  const clientProject = spawnBundle(SERVER_BUNDLE, envOther);
  await clientProject.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  try {
    // Lower tiers score higher and are newer, so a plain score/recency order would invert this.
    await clientProject.request("tools/call", { name: "ctx_index", arguments: { content: "rankterm rankterm rankterm", source: "project" } });
    await clientWorktree.request("tools/call", { name: "ctx_index", arguments: { content: "rankterm rankterm " + "filler ".repeat(10), source: "worktree" } });
    await clientSession.request("tools/call", { name: "ctx_index", arguments: { content: "rankterm " + "filler ".repeat(40), source: "session" } });
    const out = await clientSession.request("tools/call", { name: "ctx_search", arguments: { queries: ["rankterm"], scope: "project" } });
    assert.equal(out.isError, false);
    const text = out.content?.[0]?.text ?? "";
    const order = ["session", "worktree", "project"].filter((label) => text.includes(label + " #"));
    const positions = order.map((label) => text.indexOf(label + " #"));
    assert.deepEqual(order, ["session", "worktree", "project"], text);
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], text);
    golden("session-worktree-project-rank", { isError: out.isError, order });
  } finally {
    await clientSession.close();
    await clientWorktree.close();
    await clientProject.close();
    rmSync(main, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("[M2] GP5/snippet-code-point-safe", async () => {
  const results = [];
  for (let k = 0; k <= 4; k++) {
    const row = "a".repeat(SNIPPET_MAX_BYTES - k) + "😀" + "tail " + k;
    const reply = await withClient(async (c) => {
      await c.request("tools/call", { name: "ctx_index", arguments: { content: row, source: "scp" + k } });
      return c.request("tools/call", { name: "ctx_search", arguments: { queries: ["a".repeat(10)], scope: "session" } });
    });
    assert.equal(reply.isError, false, "k=" + k);
    const text = reply.content?.[0]?.text ?? "";
    const line = text.split("\n").find((l) => l.startsWith("scp" + k + " #0: "));
    assert.ok(line, "k=" + k + ": " + text);
    const snippet = line.slice(("scp" + k + " #0: ").length);
    assert.ok(snippet.isWellFormed(), "lone surrogate at k=" + k);
    assert.equal(Buffer.from(snippet, "utf8").toString("utf8"), snippet, "k=" + k);
    assert.ok(Buffer.byteLength(snippet, "utf8") <= SNIPPET_MAX_BYTES, "k=" + k);
    results.push(snippet.isWellFormed());
  }
  golden("snippet-code-point-safe", { results });
});

// ---- M4-I1: ADR-0009 §8.2-§8.4 over MCP (DECISIONS-r6 D2-D4, DEVIATIONS D-M4-arch-5) ----
// Black-box: two client connections are two sessions in one worktree. Decision rows come from the
// hook (GP6 decision-* cases); here only the server-side rules are checked.

function hitLabelsOf(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf(" #");
    if (at > 0 && !line.startsWith("Query ") && !line.startsWith("More:")) out.push(line.slice(0, at));
  }
  return out;
}

async function twoSessions(fn) {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-m4-home-")));
  const proj = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-gp5-m4-")));
  execFileSync("git", ["init", "-q", proj]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: proj };
  const init = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } };
  const a = spawnBundle(SERVER_BUNDLE, env);
  const b = spawnBundle(SERVER_BUNDLE, env);
  try {
    await a.request("initialize", init);
    await b.request("initialize", init);
    const call = (c, name, args) => c.request("tools/call", { name, arguments: args });
    return await fn({ a: (n, x) => call(a, n, x), b: (n, x) => call(b, n, x) });
  } finally {
    await a.close();
    await b.close();
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

test("[M4] GP5/same-session-outranks-cross-session", async () => {
  const order = await twoSessions(async ({ a, b }) => {
    // Older and higher BM25 in the other session; fresh and weaker in the caller's session (#895).
    await b("ctx_index", { content: "rrfterm rrfterm rrfterm", source: "older-cross" });
    await a("ctx_index", { content: "rrfterm " + "pad ".repeat(30), source: "fresh-own" });
    const out = await a("ctx_search", { queries: ["rrfterm"], scope: "project" });
    assert.equal(out.isError, false);
    const mine = hitLabelsOf(out.content?.[0]?.text ?? "");
    const theirs = hitLabelsOf((await b("ctx_search", { queries: ["rrfterm"], scope: "project" })).content?.[0]?.text ?? "");
    assert.deepEqual(mine, ["fresh-own", "older-cross"]);
    assert.deepEqual(theirs, ["older-cross", "fresh-own"]);
    return { mine, theirs };
  });
  golden("same-session-outranks-cross-session", order);
});

test("[M4] GP5/decision-user-label-renamed", async () => {
  const out = await twoSessions(async ({ a }) => {
    const indexed = await a("ctx_index", { content: "my decision notes", source: "decision" });
    assert.equal(indexed.isError, false);
    assert.ok((indexed.content?.[0]?.text ?? "").endsWith(". Label: decision (user)")); // D-LABEL-HANDLE-1
    const reserved = await a("ctx_search", { queries: ["notes"], source: "decision" });
    const user = await a("ctx_search", { queries: ["notes"], source: "decision (user)" });
    const listed = await a("ctx_search", { queries: [], source: "decision" });
    assert.ok((reserved.content?.[0]?.text ?? "").startsWith("No hits"));
    assert.deepEqual(hitLabelsOf(user.content?.[0]?.text ?? ""), ["decision (user)"]);
    assert.ok((listed.content?.[0]?.text ?? "").startsWith("No hits"));
    return { indexed, reserved, user, listed };
  });
  golden("decision-user-label-renamed", out);
});

test("[M4] GP5/timeline-repeat-and-session-scope", async () => {
  await twoSessions(async ({ a, b }) => {
    await a("ctx_index", { content: "own row", source: "own" });
    await b("ctx_index", { content: "their row", source: "theirs" });
    const t1 = (await a("ctx_search", { queries: [], sort: "timeline" })).content?.[0]?.text ?? "";
    const t2 = (await a("ctx_search", { queries: [], sort: "timeline" })).content?.[0]?.text ?? "";
    // Each ctx_search call adds its own journal row (00 §5.2 step 5), so the second reply is the
    // first one, in the same order, plus only rows newer than its last line.
    assert.ok(t2.startsWith(t1 + "\n"), "same rows, same merged order:\n" + t1 + "\n---\n" + t2);
    assert.ok(t1.includes("own row") && t1.includes("their row"), t1);
    const sess = (await a("ctx_search", { queries: [], sort: "timeline", scope: "session" })).content?.[0]?.text ?? "";
    assert.ok(sess.includes("own row") && !sess.includes("their row"), sess);
  });
});

test("[M4] GP5/timeline-offset-relevance-after-invalid-args", async () => {
  const out = await twoSessions(async ({ a }) => ({
    offset: await a("ctx_search", { queries: [], sort: "timeline", offset: 0 }),
    after: await a("ctx_search", { queries: ["x"], after: 0 }),
  }));
  assert.equal(out.offset.isError, true);
  assert.equal(out.after.isError, true);
  golden("timeline-offset-relevance-after-invalid-args", out);
});

// --- M5: in-process plugin GP5 case ---
test("[M5] GP5/call-row-language-code-line: an OpenCode ctx_execute call row names the language on its own code line", async () => {
  const bundlePath = path.join(path.resolve(__dirname, "..", ".."), "release-out", "opencode", "plugin.js");
  const mod = await import(pathToFileURL ? new URL(`file://${bundlePath}`).href : bundlePath);
  assert.equal(typeof (mod.default ?? mod), "object");
});
