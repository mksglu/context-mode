/**
 * Unit tests for the ctx_search handler decision helpers.
 *
 * Issue #737 MAJOR D (round-2 review): the handler's branching logic is
 * extracted into pure functions so it can be tested without spinning up an
 * MCP server process.
 *
 * Tests cover:
 *   - planCtxSearchScope: all four branches (global, absPathPerProject,
 *     rowFilter, current) across both shared-DB and per-project modes.
 *   - shouldReturnEmptyGuidance: post-search empty-KB guidance predicate.
 *   - BLOCKER A: abs-path in shared mode → rowFilter (NOT absPathPerProject).
 *   - BLOCKER D: guidance only fires when chunks=0 AND totalResults=0.
 *   - BLOCKER D integration: empty content store + auto-memory hit is not
 *     blocked by the guidance predicate.
 */

import { describe, test, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planCtxSearchScope, shouldReturnEmptyGuidance } from "../../src/search/ctx-search-plan.js";
import { ContentStore } from "../../src/store.js";
import { searchAllSources } from "../../src/search/unified.js";

// ─────────────────────────────────────────────────────────────────────────────
// planCtxSearchScope
// ─────────────────────────────────────────────────────────────────────────────

describe("planCtxSearchScope — global", () => {
  test('project:"global" → {kind:"global"} in per-project mode', () => {
    const plan = planCtxSearchScope("global", false, () => "/cwd");
    expect(plan).toEqual({ kind: "global" });
  });

  test('project:"global" → {kind:"global"} in shared mode', () => {
    const plan = planCtxSearchScope("global", true, () => "/cwd");
    expect(plan).toEqual({ kind: "global" });
  });
});

describe("planCtxSearchScope — absPath in per-project mode (BLOCKER A)", () => {
  test("abs-path in per-project mode → absPathPerProject", () => {
    const plan = planCtxSearchScope("/home/user/other-proj", false, () => "/cwd");
    expect(plan).toEqual({ kind: "absPathPerProject", dir: "/home/user/other-proj" });
  });
});

describe("planCtxSearchScope — absPath in SHARED mode (BLOCKER A fix)", () => {
  test("abs-path in SHARED mode → rowFilter (NOT absPathPerProject)", () => {
    // BLOCKER A: in shared-DB mode, abs-path must filter rows of the shared DB,
    // NOT open separate per-project hashed DBs (which would be empty).
    const plan = planCtxSearchScope("/home/user/project", true, () => "/cwd");
    expect(plan).toEqual({ kind: "rowFilter", scope: "/home/user/project" });
    expect(plan.kind).not.toBe("absPathPerProject");
  });
});

describe("planCtxSearchScope — shared mode, current / undefined", () => {
  test("undefined project in shared mode → rowFilter with real cwd", () => {
    const plan = planCtxSearchScope(undefined, true, () => "/real/cwd");
    expect(plan).toEqual({ kind: "rowFilter", scope: "/real/cwd" });
  });

  test('"current" string in shared mode → rowFilter with real cwd (not treated as abs)', () => {
    const plan = planCtxSearchScope("current", true, () => "/real/cwd");
    expect(plan).toEqual({ kind: "rowFilter", scope: "/real/cwd" });
  });

  test("pinned env path is NOT the scope — real cwd is (BLOCKER D proxy)", () => {
    const pinnedDir = "/pinned/shared/db";
    const realCwd = "/home/user/active-project";
    const plan = planCtxSearchScope(undefined, true, () => realCwd);
    expect((plan as { scope: string }).scope).toBe(realCwd);
    expect((plan as { scope: string }).scope).not.toBe(pinnedDir);
  });
});

describe("planCtxSearchScope — per-project default", () => {
  test("undefined project in per-project mode → current (no row filter)", () => {
    const plan = planCtxSearchScope(undefined, false, () => "/cwd");
    expect(plan).toEqual({ kind: "current" });
  });

  test('"current" in per-project mode → current', () => {
    const plan = planCtxSearchScope("current", false, () => "/cwd");
    expect(plan).toEqual({ kind: "current" });
  });

  test("relative path in per-project mode → current (not abs-path)", () => {
    const plan = planCtxSearchScope("subdir", false, () => "/cwd");
    expect(plan).toEqual({ kind: "current" });
  });
});

describe("planCtxSearchScope — needsStore derivation", () => {
  test("global → does NOT need writable store", () => {
    const plan = planCtxSearchScope("global", false, () => "/cwd");
    const needsStore = plan.kind !== "global" && plan.kind !== "absPathPerProject";
    expect(needsStore).toBe(false);
  });

  test("absPathPerProject → does NOT need writable store", () => {
    const plan = planCtxSearchScope("/abs/path", false, () => "/cwd");
    const needsStore = plan.kind !== "global" && plan.kind !== "absPathPerProject";
    expect(needsStore).toBe(false);
  });

  test("rowFilter → needs writable store", () => {
    const plan = planCtxSearchScope(undefined, true, () => "/cwd");
    const needsStore = plan.kind !== "global" && plan.kind !== "absPathPerProject";
    expect(needsStore).toBe(true);
  });

  test("current → needs writable store", () => {
    const plan = planCtxSearchScope(undefined, false, () => "/cwd");
    const needsStore = plan.kind !== "global" && plan.kind !== "absPathPerProject";
    expect(needsStore).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shouldReturnEmptyGuidance (BLOCKER D)
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldReturnEmptyGuidance — BLOCKER D: post-search predicate", () => {
  test("chunks=0 AND totalResults=0 → true (genuinely empty, show guidance)", () => {
    expect(shouldReturnEmptyGuidance({ chunks: 0, totalResults: 0 })).toBe(true);
  });

  test("chunks=5 AND totalResults=0 → false (content exists, just no hits)", () => {
    expect(shouldReturnEmptyGuidance({ chunks: 5, totalResults: 0 })).toBe(false);
  });

  test("chunks=0 AND totalResults=3 → false (auto-memory found results — key BLOCKER D case)", () => {
    // Empty content store but auto-memory returned hits.
    // MUST NOT show the empty-KB guidance.
    expect(shouldReturnEmptyGuidance({ chunks: 0, totalResults: 3 })).toBe(false);
  });

  test("chunks=100 AND totalResults=5 → false (normal hit case)", () => {
    expect(shouldReturnEmptyGuidance({ chunks: 100, totalResults: 5 })).toBe(false);
  });

  test("MINOR 1 guard: global/abs-path scope implies needsStore=false so shouldReturnEmptyGuidance is NOT called", () => {
    // When planCtxSearchScope returns global or absPathPerProject, needsStore is false.
    // The handler sets store = null and skips shouldReturnEmptyGuidance entirely.
    // Without this guard, chunks would be 0 (store?.getStats().chunks ?? 0 = 0)
    // and shouldReturnEmptyGuidance({ chunks:0, totalResults:0 }) would return true,
    // showing 'Knowledge base is empty' even when the target DBs are full but the
    // query simply has no match.
    const globalPlan = planCtxSearchScope("global", false, () => "/cwd");
    const absPlan = planCtxSearchScope("/abs/path", false, () => "/cwd");

    const globalNeedsStore = globalPlan.kind !== "global" && globalPlan.kind !== "absPathPerProject";
    const absNeedsStore = absPlan.kind !== "global" && absPlan.kind !== "absPathPerProject";

    expect(globalNeedsStore).toBe(false); // store will be null → guidance skipped
    expect(absNeedsStore).toBe(false);    // store will be null → guidance skipped

    // The predicate itself correctly fires when chunks=0 and results=0;
    // the server.ts guard (store !== null) prevents it from running on these paths.
    expect(shouldReturnEmptyGuidance({ chunks: 0, totalResults: 0 })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER D integration — auto-memory surfaces even when content store is empty
// ─────────────────────────────────────────────────────────────────────────────

describe("BLOCKER D integration: empty content + auto-memory (searchAllSources)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ctx-blockerd-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("searchAllSources with empty content store returns auto-memory hits (CLAUDE.md)", () => {
    // Empty content store
    const storePath = join(tmpDir, "empty-content.db");
    const store = new ContentStore(storePath);
    // index nothing → 0 chunks

    // Write CLAUDE.md in a project dir that will be scanned as auto-memory
    const projectDir = join(tmpDir, "project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "CLAUDE.md"),
      "Project rule: always use the stork archival system for backups.\n",
    );

    const results = searchAllSources({
      query: "stork archival",
      limit: 10,
      store,
      sort: "relevance",
      projectDir,
    });

    store.close();

    // auto-memory (CLAUDE.md) must appear in results even though content is empty
    const memResults = results.filter((r) => r.origin === "auto-memory");
    expect(memResults.length).toBeGreaterThan(0);
    expect(memResults[0].content).toContain("stork");

    // shouldReturnEmptyGuidance must be false (results > 0)
    expect(shouldReturnEmptyGuidance({ chunks: 0, totalResults: results.length })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// effectiveSearchLimit (#737): breadth scopes need a higher cap
// ─────────────────────────────────────────────────────────

describe("effectiveSearchLimit", () => {
  test("single-DB scope stays tight (max 2 normal, 1 throttled)", async () => {
    const { effectiveSearchLimit } = await import("../../src/search/ctx-search-plan.js");
    expect(effectiveSearchLimit({ breadthScope: false, throttled: false, requestedLimit: 3 })).toBe(2);
    expect(effectiveSearchLimit({ breadthScope: false, throttled: false, requestedLimit: 1 })).toBe(1);
    expect(effectiveSearchLimit({ breadthScope: false, throttled: true, requestedLimit: 5 })).toBe(1);
  });

  test("breadth scope floors at 10 so mid-ranked cross-project hits surface (#737 APK)", async () => {
    const { effectiveSearchLimit } = await import("../../src/search/ctx-search-plan.js");
    // default requestedLimit (3) must still yield >= 9 so a rank-8 hit appears
    expect(effectiveSearchLimit({ breadthScope: true, throttled: false, requestedLimit: 3 })).toBe(10);
    expect(effectiveSearchLimit({ breadthScope: true, throttled: false, requestedLimit: 3 })).toBeGreaterThanOrEqual(9);
  });

  test("breadth scope honors a higher requested limit up to 12", async () => {
    const { effectiveSearchLimit } = await import("../../src/search/ctx-search-plan.js");
    expect(effectiveSearchLimit({ breadthScope: true, throttled: false, requestedLimit: 11 })).toBe(11);
    expect(effectiveSearchLimit({ breadthScope: true, throttled: false, requestedLimit: 50 })).toBe(12);
  });

  test("breadth scope under throttle still returns 5 (not 1)", async () => {
    const { effectiveSearchLimit } = await import("../../src/search/ctx-search-plan.js");
    expect(effectiveSearchLimit({ breadthScope: true, throttled: true, requestedLimit: 3 })).toBe(5);
  });
});
