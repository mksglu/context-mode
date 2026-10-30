// Unit tests for src/core/tools/search.ts (impl/05 §6). ctx_search: readOnly tool.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctxSearch } from "../../../src/core/tools/search.ts";
import { ctxIndex } from "../../../src/core/tools/index.ts";

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
import { openDb, closeDb } from "../../../src/core/store/db.ts";
import { ftsInsert, highlight } from "../../../src/core/store/fts.ts";
import { ctxSearchSchema } from "../../../src/core/tools/search.ts";
import * as C from "../../../src/core/contracts/constants.ts";

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
    const { openDb, closeDb } = await import("../../../src/core/store/db.ts");
    const { indexText } = await import("../../../src/core/index/text.ts");
    const { sourceHandle, parseSourceHandle } = await import("../../../src/core/store/fts.ts");
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
    const { openDb, closeDb } = await import("../../../src/core/store/db.ts");
    const { indexText } = await import("../../../src/core/index/text.ts");
    const { resolveSourceLabel, sourceHandle, parseSourceHandle } = await import("../../../src/core/store/fts.ts");
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
  const { SEARCH_REPLY_HITS } = await import("../../../src/core/contracts/constants.ts");
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
