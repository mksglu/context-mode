/**
 * Issue #737 Slice E: global fan-out search across all project DB files.
 *
 * Tests cover:
 *   - listProjectDbs: enumerates *.db files, skips sidecars, caps at FANOUT_MAX.
 *   - searchGlobalFanout: hits from all project DBs, RRF-ordered, respects limit.
 *   - Deduplication: identical items across DBs get fused (higher RRF score), not duplicated.
 *   - CONTEXT_MODE_GLOBAL_FANOUT_MAX cap is honoured.
 *   - Auto-memory (null projectDir) is included in global results.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { ContentStore } from "../../src/store.js";
import { SessionDB } from "../../src/session/db.js";
import { listProjectDbs, searchGlobalFanout, readonlySearchContent, searchAbsPathProject, listSessionDbsForProject } from "../../src/search/global-fanout.js";
import { hashProjectDirCanonical, resolveContentStorePath } from "../../src/session/db.js";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

let testRoot: string;

beforeEach(() => {
  testRoot = join(
    tmpdir(),
    `ctx-fanout-${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
});

function makeDirs() {
  const sessionsDir = join(testRoot, "sessions");
  const contentDir = join(testRoot, "content");
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  return { sessionsDir, contentDir };
}

/**
 * Create a ContentStore at a predictable path within contentDir and index
 * the given content. Closes the store before returning.
 */
function seedContent(
  contentDir: string,
  name: string,
  content: string,
  source: string,
): string {
  const dbPath = join(contentDir, `${name}.db`);
  const store = new ContentStore(dbPath);
  store.index({ content, source });
  store.close();
  return dbPath;
}

/**
 * Create a SessionDB at a predictable path within sessionsDir and insert
 * one event. Closes the DB before returning.
 */
function seedSession(
  sessionsDir: string,
  name: string,
  eventData: string,
  projectDir: string = `/tmp/proj-${name}`,
): string {
  const dbPath = join(sessionsDir, `${name}.db`);
  const db = new SessionDB({ dbPath });
  const sid = `sid-${name}-${randomUUID().slice(0, 8)}`;
  db.ensureSession(sid, projectDir);
  db.insertEvent(
    sid,
    { type: "decision", category: "decision", data: eventData, priority: 2 },
    "PostToolUse",
    { projectDir, source: "env", confidence: 1 },
  );
  db.close();
  return dbPath;
}

// ─────────────────────────────────────────────────────────
// listProjectDbs
// ─────────────────────────────────────────────────────────

describe("listProjectDbs", () => {
  test("enumerates *.db files in sessions and content dirs", () => {
    const { sessionsDir, contentDir } = makeDirs();
    // Create stub files (we just need the filenames, not valid DBs)
    writeFileSync(join(sessionsDir, "aaaa1111.db"), "");
    writeFileSync(join(sessionsDir, "bbbb2222.db"), "");
    writeFileSync(join(contentDir, "cccc3333.db"), "");

    const { sessionDbs, contentDbs } = listProjectDbs(sessionsDir, contentDir);
    expect(sessionDbs).toHaveLength(2);
    expect(contentDbs).toHaveLength(1);
    expect(sessionDbs.some((p) => p.endsWith("aaaa1111.db"))).toBe(true);
    expect(contentDbs.some((p) => p.endsWith("cccc3333.db"))).toBe(true);
  });

  test("skips WAL and SHM sidecar files", () => {
    const { sessionsDir, contentDir } = makeDirs();
    writeFileSync(join(sessionsDir, "main.db"), "");
    writeFileSync(join(sessionsDir, "main.db-wal"), "");
    writeFileSync(join(sessionsDir, "main.db-shm"), "");

    const { sessionDbs } = listProjectDbs(sessionsDir, contentDir);
    // Only the main .db should be listed; WAL/SHM are not .db files so they
    // don't end with .db — the filter is f.endsWith(".db").
    expect(sessionDbs).toHaveLength(1);
    expect(sessionDbs[0]).toContain("main.db");
  });

  test("returns empty arrays for non-existent directories", () => {
    const { sessionDbs, contentDbs } = listProjectDbs(
      "/nonexistent/sessions",
      "/nonexistent/content",
    );
    expect(sessionDbs).toEqual([]);
    expect(contentDbs).toEqual([]);
  });

  test("caps results at CONTEXT_MODE_GLOBAL_FANOUT_MAX", () => {
    const { sessionsDir, contentDir } = makeDirs();
    // Create 5 stub DB files
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(sessionsDir, `proj${i}.db`), "");
    }

    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = "3";
    try {
      const { sessionDbs } = listProjectDbs(sessionsDir, contentDir);
      expect(sessionDbs.length).toBeLessThanOrEqual(3);
    } finally {
      if (orig === undefined) {
        delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
      } else {
        process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
      }
    }
  });
});

// ─────────────────────────────────────────────────────────
// searchGlobalFanout — content DBs
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — content hits across multiple projects", () => {
  test("returns hits from all project content DBs", () => {
    const { sessionsDir, contentDir } = makeDirs();

    // Three distinct projects with disjoint unique terms
    seedContent(contentDir, "proj-alpha", "The condor migration uses redux toolkit.", "docs-alpha");
    seedContent(contentDir, "proj-beta", "The condor migration uses zustand state.", "docs-beta");
    seedContent(contentDir, "proj-gamma", "The condor migration uses recoil atoms.", "docs-gamma");

    const results = searchGlobalFanout({
      query: "condor migration",
      limit: 20,
      sessionsDir,
      contentDir,
    });

    expect(results.length).toBeGreaterThan(0);
    const sources = new Set(results.map((r) => r.source));
    expect(sources.has("docs-alpha")).toBe(true);
    expect(sources.has("docs-beta")).toBe(true);
    expect(sources.has("docs-gamma")).toBe(true);
  });

  test("respects limit — truncates to exactly limit results", () => {
    const { sessionsDir, contentDir } = makeDirs();

    for (let i = 0; i < 5; i++) {
      seedContent(
        contentDir,
        `proj-${i}`,
        `The osprey deployment pipeline uses terraform for infrastructure project-${i}.`,
        `docs-${i}`,
      );
    }

    const results = searchGlobalFanout({
      query: "osprey deployment terraform",
      limit: 3,
      sessionsDir,
      contentDir,
    });

    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────
// searchGlobalFanout — session event DBs
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — session event hits across multiple projects", () => {
  test("returns session events from all project session DBs", () => {
    const { sessionsDir, contentDir } = makeDirs();

    seedSession(sessionsDir, "proj-a", "decided to use marmot caching strategy for project A");
    seedSession(sessionsDir, "proj-b", "decided to use marmot caching strategy for project B");
    seedSession(sessionsDir, "proj-c", "decided to use marmot caching strategy for project C");

    const results = searchGlobalFanout({
      query: "marmot caching",
      limit: 20,
      sessionsDir,
      contentDir,
    });

    expect(results.length).toBeGreaterThan(0);
    const eventResults = results.filter((r) => r.origin === "prior-session");
    expect(eventResults.length).toBeGreaterThan(0);

    const contents = eventResults.map((r) => r.content);
    expect(contents.some((c) => c.includes("project A"))).toBe(true);
    expect(contents.some((c) => c.includes("project B"))).toBe(true);
    expect(contents.some((c) => c.includes("project C"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// searchGlobalFanout — RRF ordering
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — RRF merge ordering (MINOR B: exact assertions)", () => {
  test("exact result order: item in 3 DBs ranks first; item in 1 DB ranks second", () => {
    const { sessionsDir, contentDir } = makeDirs();

    // "hawk" in 3 content DBs → 3 RRF contributions → higher score
    seedContent(contentDir, "proj-aaa", "The hawk deployment system is fully operational.", "src-1");
    seedContent(contentDir, "proj-bbb", "The hawk deployment system is fully operational.", "src-2");
    seedContent(contentDir, "proj-ccc", "The hawk deployment system is fully operational.", "src-3");
    // "sparrow" in 1 content DB → 1 RRF contribution → lower score
    seedContent(contentDir, "proj-ddd", "The sparrow legacy system needs migration.", "src-4");

    const results = searchGlobalFanout({
      query: "hawk deployment sparrow legacy",
      limit: 10,
      sessionsDir,
      contentDir,
    });

    // Exact count: exactly 1 hawk (deduped from 3 DBs) + 1 sparrow.
    const hawkItems = results.filter((r) => r.content.includes("hawk"));
    const sparrowItems = results.filter((r) => r.content.includes("sparrow"));
    expect(hawkItems.length).toBe(1);    // deduplicated from 3 identical hits
    expect(sparrowItems.length).toBe(1);

    // Exact order: hawk MUST be index 0, sparrow MUST be index 1.
    expect(results[0].content).toContain("hawk");
    expect(results[1].content).toContain("sparrow");

    // Exact result map (title+content shape).
    expect(results.map((r) => (r.content.includes("hawk") ? "hawk" : "sparrow")))
      .toEqual(["hawk", "sparrow"]);
  });

  test("identical items across DBs are fused into exactly 1 result (key excludes source)", () => {
    const { sessionsDir, contentDir } = makeDirs();

    const identicalContent = "The ibis data pipeline processes events in real-time.";
    // Same content, DIFFERENT source labels in different project DBs
    seedContent(contentDir, "dupe-aaa", identicalContent, "source-proj-a");
    seedContent(contentDir, "dupe-bbb", identicalContent, "source-proj-b");
    seedContent(contentDir, "dupe-ccc", identicalContent, "source-proj-c");

    const results = searchGlobalFanout({
      query: "ibis pipeline events",
      limit: 20,
      sessionsDir,
      contentDir,
    });

    // Exactly 1 result (fused from 3 DBs via dedupe key = title+content, NOT source)
    const ibisResults = results.filter((r) => r.content.includes("ibis"));
    expect(ibisResults.length).toBe(1);
    // Score is higher than a single-DB item (internal; we verify structural fusion)
    expect(results.length).toBe(1); // only ibis content was seeded
  });
});

// ────────────────────────────────────────────────────────
// BLOCKER 3 regression: readonly fan-out must not mutate DB files
// ────────────────────────────────────────────────────────

describe("readonlySearchContent — BLOCKER 3: no writes to fan-out DB files", () => {
  test("mtime and size are unchanged after readonlySearchContent", () => {
    const { contentDir } = makeDirs();
    const dbPath = join(contentDir, "readonly-check.db");

    // Seed a content DB via the normal writable path
    const store = new ContentStore(dbPath);
    store.index({ content: "The walrus optimizer runs every night.", source: "walrus-docs" });
    store.close();

    // Capture mtime + size before read-only search
    const before = statSync(dbPath);

    // Run the read-only fan-out reader
    const results = readonlySearchContent(dbPath, "walrus optimizer", 5);

    // mtime and size must be identical — no WAL checkpoint, no schema write, no optimize
    const after = statSync(dbPath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);

    // But the reader should still find results
    expect(results.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────
// MAJOR 7a: global returns session events even with empty content store
// ────────────────────────────────────────────────────────

describe("searchGlobalFanout — MAJOR 7a: global recalls session events even when content DB is empty", () => {
  test("returns session event hits even when all content DBs are empty", () => {
    const { sessionsDir, contentDir } = makeDirs();

    // Content DB exists but is empty (no indexed content)
    const emptyContentDb = join(contentDir, "empty-proj.db");
    const emptyStore = new ContentStore(emptyContentDb);
    emptyStore.close();

    // Session DB has events
    seedSession(sessionsDir, "empty-proj", "decided to use narwhal streaming for real-time events");

    const results = searchGlobalFanout({
      query: "narwhal streaming",
      limit: 10,
      sessionsDir,
      contentDir,
    });

    expect(results.length).toBeGreaterThan(0);
    const eventResults = results.filter((r) => r.origin === "prior-session");
    expect(eventResults.length).toBeGreaterThan(0);
    expect(eventResults.some((r) => r.content.includes("narwhal"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// searchGlobalFanout — auto-memory (null projectDir)
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — auto-memory via null projectDir", () => {
  test("includes auto-memory hits when configDir has matching hash subdirs", () => {
    const { sessionsDir, contentDir } = makeDirs();
    const configDir = join(testRoot, "config");
    const memBase = join(configDir, "memory");

    // Simulate a per-project memory hash dir
    const hashDir = "fa1b2c3d4e5f6789";
    mkdirSync(join(memBase, hashDir), { recursive: true });
    writeFileSync(
      join(memBase, hashDir, "notes.md"),
      "# Global Memory\nRemember: the pelican service handles all API authentication.",
    );

    const results = searchGlobalFanout({
      query: "pelican service authentication",
      limit: 10,
      sessionsDir,
      contentDir,
      configDir,
    });

    const memoryHits = results.filter((r) => r.origin === "auto-memory");
    expect(memoryHits.length).toBeGreaterThan(0);
    expect(memoryHits[0].content).toContain("pelican");
  });
});

// ─────────────────────────────────────────────────────────
// searchGlobalFanout — fanout cap
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — CONTEXT_MODE_GLOBAL_FANOUT_MAX cap (MAJOR C)", () => {
  test("total DB files opened ≤ CONTEXT_MODE_GLOBAL_FANOUT_MAX (listProjectDbs cap)", () => {
    const { sessionsDir, contentDir } = makeDirs();

    // Seed 5 session DBs + 5 content DBs = 10 total files
    for (let i = 0; i < 5; i++) {
      seedSession(sessionsDir, `cap-proj-${i}`, `capybara system event ${i} for testing`);
      seedContent(contentDir, `cap-proj-${i}`, `capybara content ${i}`, `src-cap-${i}`);
    }

    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = "3";
    try {
      const { sessionDbs, contentDbs } = listProjectDbs(sessionsDir, contentDir);
      // MAJOR C: total file count must be ≤ cap (3), not just project count.
      expect(sessionDbs.length + contentDbs.length).toBeLessThanOrEqual(3);
    } finally {
      if (orig === undefined) {
        delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
      } else {
        process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
      }
    }
  });

  test("reports coverage so callers can warn on incomplete fan-out (#737)", () => {
    const { sessionsDir, contentDir } = makeDirs();
    for (let i = 0; i < 10; i++) writeFileSync(join(contentDir, `p${i}.db`), "");
    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = "4";
    try {
      const cov = listProjectDbs(sessionsDir, contentDir);
      expect(cov.totalAvailable).toBe(10);
      expect(cov.opened).toBe(4);
      expect(cov.cap).toBe(4);
      expect(cov.truncated).toBe(true);
    } finally {
      if (orig === undefined) delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
      else process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
    }
  });

  test("non-numeric CONTEXT_MODE_GLOBAL_FANOUT_MAX falls back to default (#737 strict parse)", () => {
    const { sessionsDir, contentDir } = makeDirs();
    for (let i = 0; i < 10; i++) writeFileSync(join(contentDir, `n${i}.db`), "");
    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = "3abc"; // parseInt would yield 3
    try {
      const cov = listProjectDbs(sessionsDir, contentDir);
      // Must NOT truncate to 3 — strict parse rejects "3abc", uses default.
      expect(cov.cap).toBeGreaterThan(10);
      expect(cov.truncated).toBe(false);
      expect(cov.opened).toBe(10);
    } finally {
      if (orig === undefined) delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
      else process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
    }
  });

  test("coverage reports truncated:false when all DBs fit under the cap (#737)", () => {
    const { sessionsDir, contentDir } = makeDirs();
    for (let i = 0; i < 5; i++) writeFileSync(join(contentDir, `q${i}.db`), "");
    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    try {
      const cov = listProjectDbs(sessionsDir, contentDir);
      expect(cov.truncated).toBe(false);
      expect(cov.opened).toBe(cov.totalAvailable);
    } finally {
      if (orig !== undefined) process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
    }
  });

  test("default cap does NOT truncate a large multi-project install (#737 regression)", () => {
    // Real-world bug: default cap of 64 silently dropped most projects on
    // installs with 150+ DBs. Default must comfortably exceed that.
    const { sessionsDir, contentDir } = makeDirs();
    for (let i = 0; i < 120; i++) {
      writeFileSync(join(sessionsDir, `proj${String(i).padStart(3, "0")}.db`), "");
      writeFileSync(join(contentDir, `proj${String(i).padStart(3, "0")}.db`), "");
    }
    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX; // use the built-in default
    try {
      const { sessionDbs, contentDbs } = listProjectDbs(sessionsDir, contentDir);
      // 240 files total; default cap must keep all of them (no silent drop).
      expect(sessionDbs.length + contentDbs.length).toBe(240);
    } finally {
      if (orig !== undefined) process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
    }
  });

  test("searchGlobalFanout respects cap on results", () => {
    const { sessionsDir, contentDir } = makeDirs();

    // Seed 5 session DBs
    for (let i = 0; i < 5; i++) {
      seedSession(sessionsDir, `cap2-proj-${i}`, `capybara system event ${i} for testing`);
    }

    const orig = process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
    process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = "2";
    try {
      const results = searchGlobalFanout({
        query: "capybara system",
        limit: 20,
        sessionsDir,
        contentDir,
      });
      // With cap=2 total files, at most 2 session events can be found
      const events = results.filter((r) => r.origin === "prior-session");
      expect(events.length).toBeLessThanOrEqual(2);
    } finally {
      if (orig === undefined) {
        delete process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX;
      } else {
        process.env.CONTEXT_MODE_GLOBAL_FANOUT_MAX = orig;
      }
    }
  });
});

// ─────────────────────────────────────────────────────────
// searchGlobalFanout — graceful errors
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — graceful error handling", () => {
  test("empty dirs return empty results without error", () => {
    const { sessionsDir, contentDir } = makeDirs();

    expect(() =>
      searchGlobalFanout({ query: "anything", limit: 10, sessionsDir, contentDir }),
    ).not.toThrow();

    const results = searchGlobalFanout({
      query: "anything",
      limit: 10,
      sessionsDir,
      contentDir,
    });
    expect(results).toEqual([]);
  });

  test("corrupted/stub .db files are skipped gracefully", () => {
    const { sessionsDir, contentDir } = makeDirs();

    // Write garbage to a .db file — should be caught and skipped
    writeFileSync(join(sessionsDir, "corrupt.db"), "not a sqlite file");
    writeFileSync(join(contentDir, "corrupt.db"), "not a sqlite file");

    expect(() =>
      searchGlobalFanout({ query: "anything", limit: 10, sessionsDir, contentDir }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
// MAJOR (round-3): searchAbsPathProject misses worktree-suffixed session DBs
// NIT: focused regression with CONTEXT_MODE_SESSION_SUFFIX
// ─────────────────────────────────────────────────────────

describe("listSessionDbsForProject — enumerates hash.db and hash__suffix.db", () => {
  test("returns the plain hash DB", () => {
    const { sessionsDir } = makeDirs();
    const projPath = "/fake/proj/worktree-test";
    const hash = hashProjectDirCanonical(projPath);

    // Write a plain session DB (no suffix)
    const db = new SessionDB({ dbPath: join(sessionsDir, `${hash}.db`) });
    db.close();

    const paths = listSessionDbsForProject(sessionsDir, projPath);
    expect(paths.length).toBe(1);
    expect(paths[0]).toContain(`${hash}.db`);
  });

  test("returns worktree-suffixed DB alongside plain DB", () => {
    const { sessionsDir } = makeDirs();
    const projPath = "/fake/proj/worktree-test2";
    const hash = hashProjectDirCanonical(projPath);

    // Plain DB
    writeFileSync(join(sessionsDir, `${hash}.db`), "");
    // Suffixed DB (worktree)
    writeFileSync(join(sessionsDir, `${hash}__abcdef12.db`), "");
    // Another project's DB — must NOT appear
    writeFileSync(join(sessionsDir, "0000111122223333.db"), "");

    const paths = listSessionDbsForProject(sessionsDir, projPath);
    expect(paths.length).toBe(2);
    expect(paths.some(p => p.endsWith(`${hash}.db`))).toBe(true);
    expect(paths.some(p => p.endsWith(`${hash}__abcdef12.db`))).toBe(true);
  });

  test("skips WAL/SHM sidecars", () => {
    const { sessionsDir } = makeDirs();
    const projPath = "/fake/proj/wal-skip";
    const hash = hashProjectDirCanonical(projPath);

    writeFileSync(join(sessionsDir, `${hash}.db`), "");
    writeFileSync(join(sessionsDir, `${hash}.db-wal`), "");
    writeFileSync(join(sessionsDir, `${hash}.db-shm`), "");

    const paths = listSessionDbsForProject(sessionsDir, projPath);
    expect(paths.length).toBe(1);
    expect(paths[0]).toContain(`${hash}.db`);
  });
});

describe("searchAbsPathProject — MAJOR round-3: finds events in worktree-suffixed session DB", () => {
  test("returns prior-session hit from suffixed DB (CONTEXT_MODE_SESSION_SUFFIX)", () => {
    // Focused regression: a suffixed session DB (as produced when
    // CONTEXT_MODE_SESSION_SUFFIX / a worktree suffix is active) must still be
    // enumerated by searchAbsPathProject. We materialise the suffixed file
    // directly (deterministic, no process.env mutation / cross-test bleed).
    const { sessionsDir, contentDir } = makeDirs();
    const projPath = "/fake/proj/wt-suffix-regrtest";
    const hash = hashProjectDirCanonical(projPath);
    const suffix = "__abcdef12";
    const suffixedDbPath = join(sessionsDir, `${hash}${suffix}.db`);
    const uniqueTerm = `kestrel${randomUUID().replace(/-/g, "").slice(0, 6)}`;

    // Write session event to the SUFFIXED DB (simulates CONTEXT_MODE_SESSION_SUFFIX=abcdef12)
    const db = new SessionDB({ dbPath: suffixedDbPath });
    const sid = `s-wt-${randomUUID()}`;
    db.ensureSession(sid, projPath);
    db.insertEvent(
      sid,
      { type: "decision", category: "decision", data: `decided ${uniqueTerm} approach`, priority: 2 },
      "PostToolUse",
      { projectDir: projPath, source: "env", confidence: 1 },
    );
    db.close();

    // Content DB is empty (only session matters for this test)
    const contentDbPath = resolveContentStorePath({ projectDir: projPath, contentDir });
    const store = new ContentStore(contentDbPath);
    store.close();

    const results = searchAbsPathProject({
      query: uniqueTerm,
      limit: 10,
      contentDir,
      sessionsDir,
      projectDir: projPath,
    });

    // Must surface the session event from the suffixed DB
    const sessionHits = results.filter(r => r.origin === "prior-session");
    expect(sessionHits.length).toBeGreaterThan(0);
    expect(sessionHits.some(r => r.content.includes(uniqueTerm))).toBe(true);
  });

  test("also finds events in plain hash.db alongside suffixed one", () => {
    // Use a SINGLE shared uniqueTerm so each LIKE search ('%term%') matches
    // in both DBs. Two-term queries only match rows containing BOTH terms
    // as a contiguous substring, which separate events won't have.
    const { sessionsDir, contentDir } = makeDirs();
    const projPath = "/fake/proj/wt-both-dbs";
    const hash = hashProjectDirCanonical(projPath);
    const uniqueTerm = `ibex${randomUUID().replace(/-/g, "").slice(0, 6)}`;

    // Event in plain DB
    const plainDb = new SessionDB({ dbPath: join(sessionsDir, `${hash}.db`) });
    const sidA = `s-plain-${randomUUID()}`;
    plainDb.ensureSession(sidA, projPath);
    plainDb.insertEvent(sidA, { type: "decision", category: "decision", data: `plain version: ${uniqueTerm}`, priority: 2 },
      "PostToolUse", { projectDir: projPath, source: "env", confidence: 1 });
    plainDb.close();

    // Event in suffixed DB (same uniqueTerm, different prefix so we can distinguish)
    const suffixedDb = new SessionDB({ dbPath: join(sessionsDir, `${hash}__cafe1234.db`) });
    const sidB = `s-suffixed-${randomUUID()}`;
    suffixedDb.ensureSession(sidB, projPath);
    suffixedDb.insertEvent(sidB, { type: "decision", category: "decision", data: `suffixed version: ${uniqueTerm}`, priority: 2 },
      "PostToolUse", { projectDir: projPath, source: "env", confidence: 1 });
    suffixedDb.close();

    const contentDbPath = resolveContentStorePath({ projectDir: projPath, contentDir });
    new ContentStore(contentDbPath).close();

    const results = searchAbsPathProject({
      query: uniqueTerm,  // single term LIKE-matches both events
      limit: 20,
      contentDir,
      sessionsDir,
      projectDir: projPath,
    });

    // Both DBs must contribute hits
    const sessionHits = results.filter(r => r.origin === "prior-session");
    expect(sessionHits.length).toBe(2);
    expect(sessionHits.some(r => r.content.includes("plain version"))).toBe(true);
    expect(sessionHits.some(r => r.content.includes("suffixed version"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// MINOR 1 (round-3): global/abs-path no-hit must not trigger "Knowledge base is empty"
// (tested at the helper level: searchGlobalFanout returns [] on no match)
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — MINOR 1: no-hit returns empty array, not an error", () => {
  test("returns [] when nothing matches (server will show 'No results found.' not KB-empty guidance)", () => {
    const { sessionsDir, contentDir } = makeDirs();
    // Seed real content so DBs are non-empty
    seedContent(contentDir, "proj-minor1", "The walrus ate the oysters.", "walrus-docs");
    seedSession(sessionsDir, "proj-minor1", "decided walrus approach");

    const results = searchGlobalFanout({
      query: "xxxxunlikelymatchxxxx9z7q",
      limit: 10,
      sessionsDir,
      contentDir,
    });

    // Must be an empty array (no throw, no special error result)
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
    // The server handler must NOT call shouldReturnEmptyGuidance when store===null.
    // That logic is in server.ts (tested via planCtxSearchScope needsStore=false).
  });
});

// ─────────────────────────────────────────────────────────
// MINOR 2 (round-3): contentType and source filters apply consistently
// ─────────────────────────────────────────────────────────

describe("searchGlobalFanout — MINOR 2: contentType filter suppresses non-content sources", () => {
  test("contentType:'code' returns only content hits — session events and auto-memory suppressed", () => {
    const { sessionsDir, contentDir } = makeDirs();
    const uniqueTerm = `osprey${randomUUID().replace(/-/g, "").slice(0, 6)}`;

    // Content DB with a code-typed chunk.
    // ContentStore detects code via markdown fenced code blocks (hasCode = true
    // when any line starts with ```). Plain prose content is always "prose".
    const codeDbPath = join(contentDir, "proj-code-m2.db");
    const codeStore = new ContentStore(codeDbPath);
    codeStore.index({
      content: `# Module\n\n\`\`\`js\nfunction ${uniqueTerm}() { return true; }\n\`\`\``,
      source: "code-module",
    });
    codeStore.close();

    // Session DB with matching event
    seedSession(sessionsDir, "proj-code-m2", `decided to use ${uniqueTerm} approach`);

    const results = searchGlobalFanout({
      query: uniqueTerm,
      limit: 20,
      sessionsDir,
      contentDir,
      contentType: "code",
    });

    // The core assertion: session events and auto-memory must be absent
    // when contentType filter is set (they have no code/prose classification).
    expect(results.every(r => r.origin !== "prior-session")).toBe(true);
    expect(results.every(r => r.origin !== "auto-memory")).toBe(true);
    // The code content chunk should appear (markdown code fence → hasCode=true → content_type='code').
    expect(results.some(r => r.origin === "current-session")).toBe(true);
  });
});

describe("searchGlobalFanout — MINOR 2: source filter applies to auto-memory results", () => {
  test("source:'notes' filters auto-memory to only matching source labels", () => {
    const { sessionsDir, contentDir } = makeDirs();
    const uniqueTerm = `pelican${randomUUID().replace(/-/g, "").slice(0, 6)}`;
    const configDir = join(testRoot, "config-minor2-src");
    const memBase = join(configDir, "memory");

    // Two memory files under different hash dirs
    const hash1 = "a1b2c3d4e5f67890";
    const hash2 = "b2c3d4e5f6789012";
    mkdirSync(join(memBase, hash1), { recursive: true });
    mkdirSync(join(memBase, hash2), { recursive: true });
    writeFileSync(
      join(memBase, hash1, "notes.md"),
      `${uniqueTerm} service: remember to use auth headers.`,
    );
    writeFileSync(
      join(memBase, hash2, "prefs.md"),
      `${uniqueTerm} service: always use TLS for connections.`,
    );

    const results = searchGlobalFanout({
      query: `${uniqueTerm} service`,
      limit: 10,
      sessionsDir,
      contentDir,
      configDir,
      source: "notes",
    });

    const memHits = results.filter(r => r.origin === "auto-memory");
    expect(memHits.length).toBeGreaterThan(0);
    // Only notes.md should appear — prefs.md filtered out
    expect(memHits.every(r => r.source.toLowerCase().includes("notes"))).toBe(true);
    expect(memHits.some(r => r.source.toLowerCase().includes("prefs"))).toBe(false);
  });
});

describe("searchAbsPathProject — MINOR 2: contentType filter suppresses session/auto-memory", () => {
  test("contentType:'code' returns only code content, not session events", () => {
    const { sessionsDir, contentDir } = makeDirs();
    const projPath = "/fake/proj/minor2-ct";
    const hash = hashProjectDirCanonical(projPath);
    const uniqueTerm = `cormorant${randomUUID().replace(/-/g, "").slice(0, 6)}`;

    // Content DB with code chunk. ContentStore detects code via markdown
    // fenced code blocks (hasCode = true when any line starts with ```).
    const contentDbPath = join(contentDir, `${hash}.db`);
    const store = new ContentStore(contentDbPath);
    store.index({
      content: `# Module\n\n\`\`\`js\nfunction ${uniqueTerm}() { return streaming(); }\n\`\`\``,
      source: "code-src",
    });
    store.close();

    // Session DB with matching event
    const sessionDbPath = join(sessionsDir, `${hash}.db`);
    const db = new SessionDB({ dbPath: sessionDbPath });
    const sid = `s-ct-${randomUUID()}`;
    db.ensureSession(sid, projPath);
    db.insertEvent(sid, { type: "decision", category: "decision", data: `decided ${uniqueTerm}`, priority: 2 },
      "PostToolUse", { projectDir: projPath, source: "env", confidence: 1 });
    db.close();

    const results = searchAbsPathProject({
      query: uniqueTerm,
      limit: 20,
      contentDir,
      sessionsDir,
      projectDir: projPath,
      contentType: "code",
    });

    expect(results.every(r => r.origin !== "prior-session")).toBe(true);
    expect(results.some(r => r.origin === "current-session")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Attribution (#737): project + sessionId on results
// ─────────────────────────────────────────────────────────

describe("attribution (#737): results name their project + session", () => {
  test("global: content hit resolves project_dir via sibling session DB; session hit carries project_dir + session_id", () => {
    const { sessionsDir, contentDir } = makeDirs();
    const projectDir = "/home/user/attrib-proj";
    const hash = hashProjectDirCanonical(projectDir);

    // Session DB named by hash, carrying project_dir + a matching event.
    const sdbPath = join(sessionsDir, `${hash}.db`);
    const sdb = new SessionDB({ dbPath: sdbPath });
    const sid = `sid-${randomUUID().slice(0, 8)}`;
    sdb.ensureSession(sid, projectDir);
    sdb.insertEvent(
      sid,
      { type: "decision", category: "decision", data: "zebra deployment runbook", priority: 2 },
      "PostToolUse",
      { projectDir, source: "env", confidence: 1 },
    );
    sdb.close();

    // Content DB named by the SAME hash so the attribution map resolves it.
    const cdbPath = join(contentDir, `${hash}.db`);
    const cstore = new ContentStore(cdbPath);
    cstore.index({ content: "zebra migration content for attrib-proj", source: "attrib-docs" });
    cstore.close();

    const results = searchGlobalFanout({ query: "zebra", limit: 10, sessionsDir, contentDir, sort: "relevance" });
    expect(results.length).toBeGreaterThan(0);

    const contentHit = results.find((r) => r.origin === "current-session");
    const sessionHit = results.find((r) => r.origin === "prior-session");
    expect(contentHit?.project).toBe(projectDir); // resolved via sibling session DB
    expect(sessionHit?.project).toBe(projectDir);  // from the event row
    expect(sessionHit?.sessionId).toBe(sid);       // from the event row
  });

  test("searchAbsPathProject tags content hits with the requested project", () => {
    const { sessionsDir, contentDir } = makeDirs();
    const projectDir = "/home/user/absproj";
    const cdbPath = resolveContentStorePath({ projectDir, contentDir });
    const cstore = new ContentStore(cdbPath);
    cstore.index({ content: "quokka build steps", source: "absproj-docs" });
    cstore.close();

    const results = searchAbsPathProject({ query: "quokka", limit: 10, contentDir, sessionsDir, projectDir });
    const hit = results.find((r) => r.origin === "current-session");
    expect(hit?.project).toBe(projectDir);
  });
});
