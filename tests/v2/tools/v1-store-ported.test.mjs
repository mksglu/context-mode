// Ported from v1 tests/store.test.ts (context-mode 1.0.169): index and search behaviour through v2's public handlers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctxSearch } from "../../../src/core/tools/search.ts";
import { ctxIndex } from "../../../src/core/tools/index.ts";

function ctxFor(root) {
  const k = "1".repeat(16);
  return {
    project: { projectKey: k, projectDir: join(root, "projects", k), dbPath: join(root, "projects", k, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
    sessionId: "s1", turn: 1, signal: new AbortController().signal,
  };
}
async function withStore(fn) {
  const root = mkdtempSync(join(tmpdir(), "cm-v1st-"));
  const ctx = ctxFor(root);
  try {
    return await fn({
      index: (content, source) => ctxIndex.handler({ content, source }, ctx),
      search: (queries, extra = {}) => ctxSearch.handler({ queries, ...extra }, ctx),
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("v1 store: basic keyword search returns the matching chunk with its source label", async () => {
  await withStore(async (s) => {
    await s.index("# Auth\n\nThe authentication flow uses JWT tokens.\n\n# Cache\n\nCaching strategy runs redis.", "doc_a");
    const r = await s.search(["redis"]);
    assert.equal(r.isError, false);
    assert.ok(r.text.includes("doc_a") && r.text.includes("redis"), r.text);
  });
});

test("v1 store: porter stemming matches word variants", async () => {
  await withStore(async (s) => {
    await s.index("# Connecting\n\nEstablish connections to the database.\n\n# Caching\n\nCache your responses.", "stemming");
    const r = await s.search(["connect"]);
    assert.ok(r.text.includes("connections") || r.text.includes("Connecting"), r.text);
  });
});

test("v1 store: a query with no match returns a no-hits reply, not an error", async () => {
  await withStore(async (s) => {
    await s.index("# React\n\nComponent lifecycle.", "react");
    const r = await s.search(["kubernetes deployment yaml"]);
    assert.equal(r.isError, false);
    assert.ok(/No hits/.test(r.text), r.text);
  });
});

test("v1 store: FTS5 special characters in a query never throw", async () => {
  await withStore(async (s) => {
    await s.index("# Test\n\nSome content here.", "sanitize");
    for (const q of ['test "quoted"', "test AND OR NOT", "test()", "test*", "test:value", "test^2", "{test}", "NEAR/3"]) {
      const r = await s.search([q]);
      assert.equal(typeof r.text, "string", q);
      assert.equal(r.isError, false, `${q}: ${r.text}`);
    }
  });
});

test("v1 store: an empty query never throws", async () => {
  await withStore(async (s) => {
    await s.index("# Doc\n\nContent.", "empty-q");
    const r = await s.search([""]);
    assert.equal(typeof r.isError, "boolean");
  });
});

// v1 replaced the old entry for a label (v1 store.test.ts:558). v2 appends a new source row and keeps the old one until
// retention removes it (ADR-0002 Q7; no content is dropped on re-index). D-V1DIFF-REINDEX-1 records it for the owner to confirm.
test("v1 store: re-indexing the same source label keeps the new content searchable and loses nothing (D-V1DIFF-REINDEX-1)", async () => {
  await withStore(async (s) => {
    await s.index("# Part 1\n\nFirstbatchmarker.", "incremental");
    await s.index("# Part 2\n\nSecondbatchmarker.", "incremental");
    const cur = await s.search(["Secondbatchmarker"]);
    const old = await s.search(["Firstbatchmarker"]);
    assert.ok(cur.text.includes("Secondbatchmarker"), cur.text);
    assert.ok(old.text.includes("Firstbatchmarker"), "v2 keeps the earlier entry: " + old.text);
  });
});

test("v1 store: source filter returns only that source, and a non-matching source returns no hits", async () => {
  await withStore(async (s) => {
    await s.index("# A\n\nsharedword alpha.", "src_one");
    await s.index("# B\n\nsharedword beta.", "src_two");
    const one = await s.search(["sharedword"], { source: "src_one" });
    assert.ok(one.text.includes("src_one") && !one.text.includes("src_two"), one.text);
    const none = await s.search(["sharedword"], { source: "nosuchsource" });
    assert.ok(/No hits/.test(none.text), none.text);
  });
});

test("v1 store: the source filter does not leak through the _ or % wildcard of a source label (#646)", async () => {
  await withStore(async (s) => {
    await s.index("# A\n\nfoo bar baz qux content matter", "api_v1");
    await s.index("# B\n\nfoo bar baz qux different content matter", "apiXv1");
    await s.index("# C\n\nfoo bar baz qux another content matter", "api-v1");
    const u = await s.search(["foo bar baz qux matter"], { source: "api_v1" });
    assert.ok(u.text.includes("api_v1"), u.text);
    assert.ok(!u.text.includes("apiXv1") && !u.text.includes("api-v1"), "underscore leaked: " + u.text);
    await s.index("# D\n\nfoo bar baz qux percent matter", "pct%x");
    await s.index("# E\n\nfoo bar baz qux plain matter", "pctYYx");
    const p = await s.search(["foo bar baz qux matter"], { source: "pct%x" });
    assert.ok(!p.text.includes("pctYYx"), "percent leaked: " + p.text);
  });
});

test("v1 store: index with neither content, path nor url is an error, and whitespace-only content does not crash", async () => {
  await withStore(async (s) => {
    const none = await ctxIndex.handler({ source: "x" }, ctxFor(mkdtempSync(join(tmpdir(), "cm-v1st2-"))));
    assert.equal(none.isError, true);
    const ws = await s.index("   \n\n  ", "blank");
    assert.equal(typeof ws.isError, "boolean");
  });
});

test("v1 store: markdown headings split into separate chunks that are found separately", async () => {
  await withStore(async (s) => {
    await s.index("# One\n\nalphamarker text\n\n## Two\n\nbetamarker text\n\n### Three\n\ngammamarker text", "headings");
    const r = await s.search(["alphamarker", "gammamarker"]);
    assert.ok(r.text.includes("alphamarker") && r.text.includes("gammamarker"), r.text);
  });
});
