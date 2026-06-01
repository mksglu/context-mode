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
 *   Slice 4: buildCtxSearchInputSchema exposes `project` in BOTH per-project
 *            and shared modes (updated: field is always present, #737 D/F).
 *   Slice 5: resolveProjectScope helper — undefined/"current" → real cwd,
 *            "global" → null (no filter), explicit string → that string.
 *   Slice A: SessionDB.searchEvents null=no-filter (all projects), string=subset.
 *   Slice B: searchAutoMemory null projectDir unions all per-project hash dirs.
 *   Slice C: relevance mode now includes session events (Bug 2 fix).
 *   Slice D: resolveProjectScope handles "current" and accepts getCurrentWorkingProject.
 */

import { describe, test, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { ContentStore } from "../../src/store.js";
import { SessionDB, hashProjectDirCanonical } from "../../src/session/db.js";
import { searchAllSources } from "../../src/search/unified.js";
import { searchAutoMemory } from "../../src/search/auto-memory.js";

function createStore(): ContentStore {
  const path = join(
    tmpdir(),
    `ctx-issue737-store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return new ContentStore(path);
}

function createSessionDB(): SessionDB {
  const path = join(
    tmpdir(),
    `ctx-issue737-session-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return new SessionDB({ dbPath: path });
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

describe("Slice 4: ctx_search inputSchema exposes `project` in both modes (#737 D/F)", () => {
  test("buildCtxSearchInputSchema includes `project` even when shared mode is off", async () => {
    // Updated contract: `project` is always present so per-project users can
    // also use project:"global" to fan-out across all their project DBs.
    const { buildCtxSearchInputSchema } = await import("../../src/search/ctx-search-schema.js");
    const schema = buildCtxSearchInputSchema(false);
    expect(Object.keys(schema.shape)).toContain("project");
  });

  test("buildCtxSearchInputSchema includes `project` when shared mode is on", async () => {
    const { buildCtxSearchInputSchema } = await import("../../src/search/ctx-search-schema.js");
    const schema = buildCtxSearchInputSchema(true);
    expect(Object.keys(schema.shape)).toContain("project");
  });
});

describe("Slice 5: resolveProjectScope (#737 Slice D)", () => {
  test("returns getCurrentWorkingProject() when param is undefined and shared mode is on", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    // The third arg is getCurrentWorkingProject (real cwd), not getProjectDir (pinned env).
    const scope = resolveProjectScope(undefined, true, () => "/my-real-cwd");
    expect(scope).toBe("/my-real-cwd");
  });

  test("returns getCurrentWorkingProject() when param is 'current' and shared mode is on", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope("current", true, () => "/my-real-cwd");
    expect(scope).toBe("/my-real-cwd");
  });

  test("returns null when param is 'global' (cross-project recall / fan-out)", async () => {
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

  test("returns undefined when shared mode is off even for 'current'", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope("current", false, () => "/my-cwd");
    expect(scope).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Slice A: SessionDB.searchEvents null-projectDir (no-filter)
// ═══════════════════════════════════════════════════════════

describe("Slice A: SessionDB.searchEvents null projectDir (global no-filter)", () => {
  test("null returns events from ALL projects", () => {
    const db = createSessionDB();
    const sA = `s-a-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;
    db.ensureSession(sA, "/proj-a");
    db.ensureSession(sB, "/proj-b");
    db.insertEvent(sA, { type: "x", category: "x", data: "zebrafish found in project-a", priority: 2 },
      "PostToolUse", { projectDir: "/proj-a", source: "env", confidence: 1 });
    db.insertEvent(sB, { type: "x", category: "x", data: "zebrafish found in project-b", priority: 2 },
      "PostToolUse", { projectDir: "/proj-b", source: "env", confidence: 1 });

    const results = db.searchEvents("zebrafish", 10, null);
    expect(results.length).toBe(2);
    const data = results.map((r) => r.data);
    expect(data.some((d) => d.includes("project-a"))).toBe(true);
    expect(data.some((d) => d.includes("project-b"))).toBe(true);
  });

  test("string projectDir still filters to that project only", () => {
    const db = createSessionDB();
    const sA = `s-a-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;
    db.ensureSession(sA, "/proj-a");
    db.ensureSession(sB, "/proj-b");
    db.insertEvent(sA, { type: "x", category: "x", data: "walrus spotted in project-a", priority: 2 },
      "PostToolUse", { projectDir: "/proj-a", source: "env", confidence: 1 });
    db.insertEvent(sB, { type: "x", category: "x", data: "walrus spotted in project-b", priority: 2 },
      "PostToolUse", { projectDir: "/proj-b", source: "env", confidence: 1 });

    const results = db.searchEvents("walrus", 10, "/proj-a");
    expect(results.length).toBe(1);
    expect(results[0].data).toContain("project-a");
  });

  test("empty string still matches legacy empty project_dir rows (backwards-compat)", () => {
    const db = createSessionDB();
    const sA = `s-a-${randomUUID()}`;
    const sB = `s-b-${randomUUID()}`;
    db.ensureSession(sA, "");
    db.ensureSession(sB, "/proj-real");
    // event with empty project_dir
    db.insertEvent(sA, { type: "x", category: "x", data: "moose legacy empty dir", priority: 2 },
      "PostToolUse", { projectDir: "", source: "env", confidence: 1 });
    // event with real project_dir
    db.insertEvent(sB, { type: "x", category: "x", data: "moose real project", priority: 2 },
      "PostToolUse", { projectDir: "/proj-real", source: "env", confidence: 1 });

    // "" filter: SQL is WHERE (project_dir = '' OR project_dir = '') → only empty
    const results = db.searchEvents("moose", 10, "");
    expect(results.some((r) => r.data.includes("legacy"))).toBe(true);
    // The /proj-real event should also appear because SQL includes project_dir = ''
    // which means empty-dir events. The real-project event won't match '' filter.
    expect(results.every((r) => !r.data.includes("real project"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Slice B: searchAutoMemory null projectDir (global hash-dir union)
// ═══════════════════════════════════════════════════════════

describe("Slice B: searchAutoMemory null projectDir (global memory scan)", () => {
  function makeTempConfigDir(tag: string): string {
    const dir = join(tmpdir(), `ctx-am-test-${tag}-${Date.now()}-${randomUUID().slice(0, 6)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  test("null projectDir unions all per-project memory hash subdirs", () => {
    const configDir = makeTempConfigDir("global");
    const memBase = join(configDir, "memory");

    // Two fake per-project hash dirs (actual hash not required — global scans ALL subdirs)
    const hashA = "aabbccdd11223344";
    const hashB = "eeff001122334455";
    mkdirSync(join(memBase, hashA), { recursive: true });
    mkdirSync(join(memBase, hashB), { recursive: true });

    writeFileSync(
      join(memBase, hashA, "notes-a.md"),
      "# Project Alpha\nRemember: alpha project uses mongoose ORM for data access.",
    );
    writeFileSync(
      join(memBase, hashB, "notes-b.md"),
      "# Project Beta\nRemember: beta project uses prisma ORM for data access.",
    );

    const mongooseHits = searchAutoMemory(["mongoose"], 10, null, configDir);
    expect(mongooseHits.length).toBeGreaterThan(0);
    expect(mongooseHits.some((r) => r.content.includes("mongoose"))).toBe(true);

    const prismaHits = searchAutoMemory(["prisma"], 10, null, configDir);
    expect(prismaHits.length).toBeGreaterThan(0);
    expect(prismaHits.some((r) => r.content.includes("prisma"))).toBe(true);
  });

  test("string projectDir still resolves to single hashed subdir", () => {
    const configDir = makeTempConfigDir("single");
    const memBase = join(configDir, "memory");
    const projPath = "/tmp/test-project-slice-b";
    const hash = hashProjectDirCanonical(projPath);
    mkdirSync(join(memBase, hash), { recursive: true });
    writeFileSync(
      join(memBase, hash, "notes.md"),
      "# Scoped Project\nRemember: scoped project uses apollo GraphQL.",
    );

    // Using that projectDir should only search its hashed subdir
    const hits = searchAutoMemory(["apollo"], 10, projPath, configDir);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain("apollo");
  });

  test("empty memory base is handled gracefully (no error, no results)", () => {
    const configDir = makeTempConfigDir("empty");
    // No memory dir at all
    expect(() => searchAutoMemory(["anything"], 5, null, configDir)).not.toThrow();
    const results = searchAutoMemory(["anything"], 5, null, configDir);
    expect(results).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// Slice C: relevance mode now includes session events (Bug 2 fix)
// ═══════════════════════════════════════════════════════════

describe("Slice C: searchAllSources relevance mode includes session events (Bug 2 regression guard)", () => {
  test("sort=relevance + projectScope=null returns prior-session events (no longer timeline-only)", () => {
    const store = createStore();
    const db = createSessionDB();
    const sid = `s-c-${randomUUID()}`;
    db.ensureSession(sid, "/proj-c");
    // Event data contains the search term as a plain substring (LIKE matching)
    const uniqueTerm = `xyzquux${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    db.insertEvent(sid, {
      type: "decision",
      category: "decision",
      data: `decided to adopt ${uniqueTerm} strict mode for migration path`,
      priority: 2,
    }, "PostToolUse", { projectDir: "/proj-c", source: "env", confidence: 1 });

    // Relevance mode (default), global scope (null = no filter)
    const results = searchAllSources({
      query: uniqueTerm,
      limit: 10,
      store,
      sort: "relevance",
      sessionDB: db,
      projectScope: null,
      projectDir: "/proj-c",
    });

    // Session events MUST appear even in relevance mode (Bug 2 fix)
    const priorSession = results.filter((r) => r.origin === "prior-session");
    expect(priorSession.length).toBeGreaterThan(0);
    expect(priorSession[0].content).toContain(uniqueTerm);
  });

  test("sort=timeline still returns session events chronologically", () => {
    const store = createStore();
    const db = createSessionDB();
    const sid = `s-tl-${randomUUID()}`;
    db.ensureSession(sid, "/proj-tl");
    const uniqueTerm2 = `tlterm${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    db.insertEvent(sid, {
      type: "decision",
      category: "decision",
      data: `timeline-test decision with ${uniqueTerm2} keyword`,
      priority: 2,
    }, "PostToolUse", { projectDir: "/proj-tl", source: "env", confidence: 1 });

    const results = searchAllSources({
      query: uniqueTerm2,
      limit: 10,
      store,
      sort: "timeline",
      sessionDB: db,
      projectScope: null,
      projectDir: "/proj-tl",
    });

    const priorSession = results.filter((r) => r.origin === "prior-session");
    expect(priorSession.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MAJOR 3 regression: relevance mode must surface session memory
// even when ContentStore fills the per-query limit
// ═══════════════════════════════════════════════════════════

describe("MAJOR 3: searchAllSources relevance interleave — session memory surfaces even when content fills limit", () => {
  test("session event appears in result set when content already has limit matches", () => {
    const store = createStore();
    const db = createSessionDB();
    const sid = `s-m3-${randomUUID()}`;
    db.ensureSession(sid, "/proj-m3");

    // Unique term so results are unambiguous
    const term = `fruitbat${randomUUID().replace(/-/g, "").slice(0, 6)}`;

    // Fill content store with limit=3 matches
    for (let i = 0; i < 3; i++) {
      store.index({ content: `${term} knowledge chunk number ${i}.`, source: `content-${i}` });
    }

    // Session DB has ONE event with the same term
    db.insertEvent(sid, {
      type: "decision",
      category: "decision",
      data: `decided ${term} is the right approach`,
      priority: 2,
    }, "PostToolUse", { projectDir: "/proj-m3", source: "env", confidence: 1 });

    const results = searchAllSources({
      query: term,
      limit: 3,  // content can fill all 3 slots
      store,
      sort: "relevance",
      sessionDB: db,
      projectScope: null,
    });

    // Session event MUST appear despite limit=3 content hits (round-robin interleave fix)
    const sessionHits = results.filter((r) => r.origin === "prior-session");
    expect(sessionHits.length).toBeGreaterThan(0);
    expect(sessionHits[0].content).toContain(term);
  });
});

// ═══════════════════════════════════════════════════════════
// MAJOR 7b: per-project absolute-path scope (BLOCKER 2)
// ═══════════════════════════════════════════════════════════

describe("MAJOR 7b: searchAbsPathProject — per-project absolute-path scope", () => {
  test("returns only content and events from the specified project's DB files", async () => {
    const { searchAbsPathProject } = await import("../../src/search/global-fanout.js");
    const baseDir = join(tmpdir(), `ctx-abspath-${Date.now()}-${randomUUID().slice(0, 8)}`);
    mkdirSync(baseDir, { recursive: true });
    const contentDir = join(baseDir, "content");
    const sessionsDir = join(baseDir, "sessions");
    mkdirSync(contentDir, { recursive: true });
    mkdirSync(sessionsDir, { recursive: true });

    // Use hashProjectDirCanonical to derive the correct DB name for a fake project
    const projPath = "/fake/project/alpha";
    const { hashProjectDirCanonical, resolveContentStorePath, resolveSessionDbPath } = await import("../../src/session/db.js");
    const contentDbPath = resolveContentStorePath({ projectDir: projPath, contentDir });
    const sessionDbPath = resolveSessionDbPath({ projectDir: projPath, sessionsDir });

    // Index content into that project's content DB
    const store = new ContentStore(contentDbPath);
    const uniqueTerm = `condor${randomUUID().replace(/-/g, "").slice(0, 6)}`;
    store.index({ content: `${uniqueTerm} is the main migration strategy.`, source: "alpha-docs" });
    store.close();

    // Write a session event to that project's session DB
    const db = new SessionDB({ dbPath: sessionDbPath });
    const sid = `s-ap-${randomUUID()}`;
    db.ensureSession(sid, projPath);
    db.insertEvent(sid, {
      type: "decision",
      category: "decision",
      data: `decided ${uniqueTerm} approach is correct`,
      priority: 2,
    }, "PostToolUse", { projectDir: projPath, source: "env", confidence: 1 });
    db.close();

    // Also index content into a DIFFERENT project to prove isolation
    const otherProjPath = "/fake/project/beta";
    const otherContentPath = resolveContentStorePath({ projectDir: otherProjPath, contentDir });
    const otherStore = new ContentStore(otherContentPath);
    otherStore.index({ content: `${uniqueTerm} is NOT relevant to beta.`, source: "beta-docs" });
    otherStore.close();

    // searchAbsPathProject with projPath should only open alpha's DBs.
    // The new interface takes dirs + projectDir; canonical paths are computed internally.
    const results = searchAbsPathProject({
      query: uniqueTerm,
      limit: 10,
      contentDir,
      sessionsDir,
      projectDir: projPath,
    });

    // Must find both content and event hits
    expect(results.some((r) => r.source === "alpha-docs")).toBe(true);
    expect(results.some((r) => r.origin === "prior-session")).toBe(true);

    // Must NOT include results from beta project
    expect(results.every((r) => r.source !== "beta-docs")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// MAJOR 7c: getCurrentWorkingProject resolves real cwd in shared mode
// ═══════════════════════════════════════════════════════════

describe("MAJOR 7c: resolveProjectScope with shared-mode + pinned CONTEXT_MODE_PROJECT_DIR", () => {
  test("shared mode + undefined project → getCurrentWorkingProject result, not pinned path", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");

    const pinnedDir = "/pinned/shared/db/root";
    const realCwd = "/real/project/cwd";

    // getCurrentWorkingProject is passed as the 3rd arg.
    // When shared mode is ON and project is undefined, resolveProjectScope
    // returns getProjectDirFn() = realCwd (NOT the pinned path).
    const scope = resolveProjectScope(undefined, true, () => realCwd);
    expect(scope).toBe(realCwd);
    expect(scope).not.toBe(pinnedDir);
  });

  test("shared mode + 'current' → real cwd via getCurrentWorkingProject", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const realCwd = "/real/project/cwd";
    const scope = resolveProjectScope("current", true, () => realCwd);
    expect(scope).toBe(realCwd);
  });

  test("shared mode off + undefined → undefined (per-project DB is the boundary)", async () => {
    const { resolveProjectScope } = await import("../../src/search/ctx-search-schema.js");
    const scope = resolveProjectScope(undefined, false, () => "/anything");
    expect(scope).toBeUndefined();
  });
});
