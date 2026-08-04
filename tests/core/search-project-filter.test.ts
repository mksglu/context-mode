/**
 * Issue #737: ctx_search `project:` filter — scope ContentStore to current
 * project when running in shared-DB mode (CONTEXT_MODE_PROJECT_DIR set).
 *
 * Vertical slices (TDD RGR):
 *   Slice 1: ContentStore.searchWithFallback accepts a sessionId allow-set
 *            and filters chunks accordingly, preserving legacy session_id=''
 *            visibility (treated as cross-project public surface).
 *   Slice 2: SessionDB.getSessionIdsForProject returns distinct session ids
 *            attributed to a given projectDir.
 *   Slice 3: searchAllSources accepts projectScope and threads it via the
 *            two-step IN-clause (SessionDB → ContentStore allow-set).
 *   Slice 4: server.ts builds ctx_search inputSchema conditionally — the
 *            `project` Zod field exists only when CONTEXT_MODE_PROJECT_DIR
 *            is truthy at module load.
 *   Slice 5: resolveProjectScope helper — undefined → current, "global" →
 *            null (no filter), explicit string → that string.
 */

import { describe, test, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ContentStore } from "../../src/store.js";
import { SessionDB } from "../../src/session/db.js";
import { searchAllSources } from "../../src/search/unified.js";

const activeDBs: Array<{ close?: () => void, cleanup?: () => void }> = [];

afterEach(() => {
  for (const db of activeDBs) {
    try { db.cleanup?.(); } catch {}
    try { db.close?.(); } catch {}
  }
  activeDBs.length = 0;
});

function createStore(): ContentStore {
  const path = join(
    tmpdir(),
    `ctx-issue737-store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const store = new ContentStore(path);
  activeDBs.push(store as any);
  return store;
}

function createSessionDB(): SessionDB {
  const path = join(
    tmpdir(),
    `ctx-issue737-session-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new SessionDB({ dbPath: path });
  activeDBs.push(db as any);
  return db;
}

// ═══════════════════════════════════════════════════════════
// Slice 1: ContentStore — sessionId allow-set filter
// ═══════════════════════════════════════════════════════════

describe("Slice 1: ContentStore.searchWithFallback sessionIdAllowSet", () => {
  test("returns only chunks whose attribution session_id is in the allow-set", () => {
    const store = createStore();

    store.index({
      content: "Authentication middleware validates JWT tokens for project-a flows.",
      source: "session-events-a",
      attribution: { sessionId: "session-A" },
    });
    store.index({
      content: "Authentication middleware validates JWT tokens for project-b flows.",
      source: "session-events-b",
      attribution: { sessionId: "session-B" },
    });

    const results = store.searchWithFallback(
      "authentication JWT",
      10,
      undefined,
      undefined,
      "like",
      new Set(["session-A"]),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === "session-events-a")).toBe(true);
  });

  test("preserves legacy session_id='' chunks alongside allow-set matches", () => {
    const store = createStore();

    store.index({
      content: "Authentication routes use Bearer tokens (project-a).",
      source: "session-events-a",
      attribution: { sessionId: "session-A" },
    });
    store.index({
      content: "Authentication routes use Bearer tokens (project-b).",
      source: "session-events-b",
      attribution: { sessionId: "session-B" },
    });
    // Legacy unattributed chunk — pre-attribution data must remain visible
    // regardless of project scope (cross-project public knowledge surface).
    store.index({
      content: "Authentication routes use Bearer tokens (legacy unattributed).",
      source: "user-indexed-legacy",
    });

    const results = store.searchWithFallback(
      "authentication Bearer tokens",
      10,
      undefined,
      undefined,
      "like",
      new Set(["session-A"]),
    );

    const labels = results.map((r) => r.source);
    expect(labels).toContain("session-events-a");
    expect(labels).toContain("user-indexed-legacy");
    expect(labels).not.toContain("session-events-b");
  });

  test("returns identical results to today when sessionIdAllowSet is undefined (no-op)", () => {
    const store = createStore();

    store.index({
      content: "Project-A authentication notes about JWT.",
      source: "events-a",
      attribution: { sessionId: "S-A" },
    });
    store.index({
      content: "Project-B authentication notes about JWT.",
      source: "events-b",
      attribution: { sessionId: "S-B" },
    });

    const baseline = store.searchWithFallback("authentication JWT", 10);
    const withUndefined = store.searchWithFallback(
      "authentication JWT",
      10,
      undefined,
      undefined,
      "like",
      undefined,
    );

    expect(withUndefined.map((r) => r.source).sort())
      .toEqual(baseline.map((r) => r.source).sort());
  });

  test("empty allow-set returns only legacy session_id='' chunks", () => {
    const store = createStore();
    store.index({
      content: "Attributed chunk with non-empty session_id.",
      source: "attributed",
      attribution: { sessionId: "S1" },
    });
    store.index({
      content: "Legacy unattributed chunk.",
      source: "legacy",
    });

    const results = store.searchWithFallback(
      "chunk",
      10,
      undefined,
      undefined,
      "like",
      new Set<string>(),
    );

    expect(results.map((r) => r.source)).toEqual(["legacy"]);
  });
});

// ═══════════════════════════════════════════════════════════
// Slice 2: SessionDB.getSessionIdsForProject
// ═══════════════════════════════════════════════════════════

describe("Slice 2: SessionDB.getSessionIdsForProject", () => {
  test("returns distinct session ids attributed to a given project_dir", () => {
    const db = createSessionDB();
    const sA1 = `s-a-1-${randomUUID()}`;
    const sA2 = `s-a-2-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;

    db.ensureSession(sA1, "/project-a");
    db.ensureSession(sA2, "/project-a");
    db.ensureSession(sB, "/project-b");

    db.insertEvent(sA1, { type: "x", category: "x", data: "a1-evt", priority: 2 },
      "PostToolUse", { projectDir: "/project-a", source: "env", confidence: 1 });
    db.insertEvent(sA2, { type: "x", category: "x", data: "a2-evt", priority: 2 },
      "PostToolUse", { projectDir: "/project-a", source: "env", confidence: 1 });
    db.insertEvent(sB, { type: "x", category: "x", data: "b-evt", priority: 2 },
      "PostToolUse", { projectDir: "/project-b", source: "env", confidence: 1 });

    const idsA = db.getSessionIdsForProject("/project-a");
    expect(new Set(idsA)).toEqual(new Set([sA1, sA2]));

    const idsB = db.getSessionIdsForProject("/project-b");
    expect(idsB).toEqual([sB]);
  });

  test("returns empty array when no events match the project", () => {
    const db = createSessionDB();
    expect(db.getSessionIdsForProject("/never-seen")).toEqual([]);
  });

  test("handles 1000 distinct session_ids (perf sanity for 2-step IN-clause)", () => {
    const db = createSessionDB();
    for (let i = 0; i < 1000; i++) {
      const sid = `s-perf-${i}-${randomUUID()}`;
      db.ensureSession(sid, "/perf");
      db.insertEvent(sid, { type: "t", category: "c", data: `e${i}`, priority: 2 },
        "PostToolUse", { projectDir: "/perf", source: "env", confidence: 1 });
    }
    const t0 = Date.now();
    const ids = db.getSessionIdsForProject("/perf");
    const ms = Date.now() - t0;
    expect(ids.length).toBe(1000);
    expect(ms).toBeLessThan(500); // generous bound — index makes this sub-50ms
  });
});

// ═══════════════════════════════════════════════════════════
// Slice 3: searchAllSources projectScope threading
// ═══════════════════════════════════════════════════════════

describe("Slice 3: searchAllSources projectScope", () => {
  test("projectScope filters ContentStore via SessionDB-derived allow-set", () => {
    const store = createStore();
    const db = createSessionDB();

    const sA = `s-a-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;
    db.ensureSession(sA, "/proj-a");
    db.ensureSession(sB, "/proj-b");
    db.insertEvent(sA, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "/proj-a", source: "env", confidence: 1 });
    db.insertEvent(sB, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "/proj-b", source: "env", confidence: 1 });

    store.index({
      content: "Deploy script for project A staging.",
      source: "ev-a",
      attribution: { sessionId: sA },
    });
    store.index({
      content: "Deploy script for project B staging.",
      source: "ev-b",
      attribution: { sessionId: sB },
    });

    const results = searchAllSources({
      query: "deploy staging",
      limit: 10,
      store,
      sort: "relevance",
      sessionDB: db,
      projectScope: "/proj-a",
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === "ev-a")).toBe(true);
  });

  test("projectScope=null spans all projects (no filter)", () => {
    const store = createStore();
    const db = createSessionDB();
    const sA = `s-a-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;
    db.ensureSession(sA, "/proj-a");
    db.ensureSession(sB, "/proj-b");
    db.insertEvent(sA, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "/proj-a", source: "env", confidence: 1 });
    db.insertEvent(sB, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "/proj-b", source: "env", confidence: 1 });

    store.index({
      content: "Deploy alpha A.", source: "ev-a", attribution: { sessionId: sA },
    });
    store.index({
      content: "Deploy beta B.", source: "ev-b", attribution: { sessionId: sB },
    });

    const results = searchAllSources({
      query: "deploy",
      limit: 10,
      store,
      sort: "relevance",
      sessionDB: db,
      projectScope: null,
    });

    const labels = new Set(results.map((r) => r.source));
    expect(labels.has("ev-a")).toBe(true);
    expect(labels.has("ev-b")).toBe(true);
  });

  test("projectScope undefined preserves today's unfiltered behaviour", () => {
    const store = createStore();
    const db = createSessionDB();
    const sA = `s-a-${randomUUID()}`;
    db.ensureSession(sA, "/proj-a");
    db.insertEvent(sA, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "/proj-a", source: "env", confidence: 1 });

    store.index({
      content: "Apple pie recipe.", source: "ev-a", attribution: { sessionId: sA },
    });
    store.index({
      content: "Apple pie alternative.", source: "ev-orphan",
    });

    const results = searchAllSources({
      query: "apple pie",
      limit: 10,
      store,
      sort: "relevance",
      sessionDB: db,
      // projectScope omitted
    });

    const labels = new Set(results.map((r) => r.source));
    expect(labels.has("ev-a")).toBe(true);
    expect(labels.has("ev-orphan")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Slice 4 + 5: server.ts handler — conditional schema & resolver
// ═══════════════════════════════════════════════════════════

describe("Slice 4: ctx_search inputSchema conditional on CONTEXT_MODE_PROJECT_DIR", () => {
  test("buildCtxSearchInputSchema omits `project` when shared mode is off", async () => {
    const { buildCtxSearchInputSchema } = await import("../../src/search/ctx-search-schema.js");
    const schema = buildCtxSearchInputSchema(false);
    expect(Object.keys(schema.shape)).not.toContain("project");
  });

  test("buildCtxSearchInputSchema includes `project` when shared mode is on", async () => {
    const { buildCtxSearchInputSchema } = await import("../../src/search/ctx-search-schema.js");
    const schema = buildCtxSearchInputSchema(true);
    expect(Object.keys(schema.shape)).toContain("project");
  });
});

describe("Slice 5: resolveProjectScope", () => {
  test("returns getProjectDir() when param is undefined and shared mode is on", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope(undefined, true, () => "/my-cwd");
    expect(scope).toBe("/my-cwd");
  });

  test("returns null when param is 'global' (cross-project recall)", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope("global", true, () => "/my-cwd");
    expect(scope).toBeNull();
  });

  test("returns the explicit path string when param is an absolute path", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope("/explicit/project", true, () => "/my-cwd");
    expect(scope).toBe("/explicit/project");
  });

  test("returns undefined (no filter) when shared mode is off — param is ignored", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope("global", false, () => "/my-cwd");
    expect(scope).toBeUndefined();
    const scope2 = resolveProjectScope(undefined, false, () => "/my-cwd");
    expect(scope2).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Slice 6: Issue #827 — project_dir matching is path-shape stable
//
// On Windows the host adapter writes session_events.project_dir in the
// shape it observed (often backslash form, e.g. C:\Users\me\proj), while
// the search path resolves the scope from the MCP server's getProjectDir()
// which can differ by separator (C:/Users/me/proj) or trailing slash. The
// original getSessionIdsForProject did an EXACT `project_dir = ?` match, so
// the allow-set came back EMPTY and every chunk failed the allow-set test —
// ctx_search returned "No results found" even though the content was there
// (reproduced by Adriftnote/aaddrr on Windows 11, v1.0.162).
//
// The fix must NOT disable the #737 project scope (that would re-break the
// shared-DB isolation the filter exists for). Instead, BOTH the stored
// project_dir and the query project_dir are normalized canonically (the
// same normalizeWorktreePath rule already used for project-hash stability,
// src/session/db.ts:310) so equal directories compare equal regardless of
// separator / trailing-slash shape.
// ═══════════════════════════════════════════════════════════

describe("Slice 6: getSessionIdsForProject path-shape normalization (#827)", () => {
  test("matches when stored project_dir uses backslashes but query uses forward slashes (Windows shape)", () => {
    const db = createSessionDB();
    const sid = `s-win-${randomUUID()}`;

    // Host adapter on Windows stored the backslash form...
    db.ensureSession(sid, "C:\\Users\\me\\proj");
    db.insertEvent(
      sid,
      { type: "x", category: "x", data: "win-evt", priority: 2 },
      "PostToolUse",
      { projectDir: "C:\\Users\\me\\proj", source: "env", confidence: 1 },
    );

    // ...but the search path resolved the scope with forward slashes.
    const ids = db.getSessionIdsForProject("C:/Users/me/proj");
    expect(ids).toEqual([sid]);
  });

  test("matches across trailing-slash difference", () => {
    const db = createSessionDB();
    const sid = `s-trail-${randomUUID()}`;

    db.ensureSession(sid, "/home/me/proj");
    db.insertEvent(
      sid,
      { type: "x", category: "x", data: "trail-evt", priority: 2 },
      "PostToolUse",
      { projectDir: "/home/me/proj/", source: "env", confidence: 1 },
    );

    const ids = db.getSessionIdsForProject("/home/me/proj");
    expect(ids).toEqual([sid]);
  });

  test("still isolates distinct projects (does not over-match after normalization)", () => {
    const db = createSessionDB();
    const sA = `s-a-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;

    db.ensureSession(sA, "C:\\work\\alpha");
    db.ensureSession(sB, "C:\\work\\beta");
    db.insertEvent(sA, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "C:\\work\\alpha", source: "env", confidence: 1 });
    db.insertEvent(sB, { type: "x", category: "x", data: "_", priority: 2 },
      "PostToolUse", { projectDir: "C:\\work\\beta", source: "env", confidence: 1 });

    expect(db.getSessionIdsForProject("C:/work/alpha")).toEqual([sA]);
    expect(db.getSessionIdsForProject("C:/work/beta")).toEqual([sB]);
  });
});
