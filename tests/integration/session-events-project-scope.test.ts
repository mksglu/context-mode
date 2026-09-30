/**
 * Issue #1214 — session-event indexing must be scoped to the current project.
 *
 * The sessions directory is shared by every project on the machine. The
 * SessionStart hook writes `<canonicalHash><suffix>-events.md` there, so at
 * any moment the directory may hold one events file per project that has
 * just started a session.
 *
 * The previous implementation globbed `*-events.md` and indexed ALL of them
 * into whichever project's ContentStore happened to be open, then unlinked
 * each one. Two losses, neither of which announces itself:
 *
 *   1. project A's store is polluted with project B's session events, so
 *      ctx_search returns another repository's file paths and commands;
 *   2. project B never receives its own events, because A already consumed
 *      the file. B's next session starts with no continuity and no error.
 *
 * These tests pin the scoped behaviour: exactly this project's events file is
 * indexed and consumed, and a sibling project's file is left untouched on
 * disk for its own server to pick up.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentStore } from "../../src/store.js";
import { resolveSessionPath } from "../../src/session/db.js";
import { maybeIndexSessionEvents } from "../../src/server.js";

const STORAGE_ROOT_ENV = "CONTEXT_MODE_DIR";
const PROJECT_DIR_ENV = "CONTEXT_MODE_PROJECT_DIR";

/** Marker text unique per project, so a search proves WHICH file was indexed. */
function eventsMarkdown(marker: string): string {
  return [
    "# Session events",
    "",
    `| tool | detail |`,
    `| --- | --- |`,
    `| Bash | ${marker} |`,
    "",
  ].join("\n");
}

describe("maybeIndexSessionEvents scopes to the current project (issue #1214)", () => {
  const cleanup: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const stores: ContentStore[] = [];

  function setEnv(key: string, value: string): void {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    for (const k of Object.keys(savedEnv)) delete savedEnv[k];

    while (stores.length) {
      const s = stores.pop();
      try { s?.close?.(); } catch { /* store may not expose close */ }
    }
    while (cleanup.length) {
      const p = cleanup.pop();
      if (p) try { rmSync(p, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  /**
   * Builds a sandbox: an isolated storage root (so the developer's real
   * sessions directory is never read or unlinked), two project directories,
   * and one events file planted for each.
   */
  function setupTwoProjects(): {
    sessionsDir: string;
    projectA: string;
    projectB: string;
    eventsA: string;
    eventsB: string;
    store: ContentStore;
  } {
    const root = mkdtempSync(join(tmpdir(), "ctx-1214-"));
    cleanup.push(root);

    const sessionsDir = join(root, "sessions");
    mkdirSync(sessionsDir, { recursive: true });

    const projectA = join(root, "project-a");
    const projectB = join(root, "project-b");
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });

    // Point the server's storage + project resolution at the sandbox. The
    // storage root is what getSessionDir() resolves through, so the function
    // under test reads THIS sessions directory and not the real one.
    setEnv(STORAGE_ROOT_ENV, root);
    setEnv(PROJECT_DIR_ENV, projectA);

    // Same resolver the production path uses, so the fixture filenames are
    // the real ones rather than a guess at the hashing scheme.
    const eventsA = resolveSessionPath({ projectDir: projectA, sessionsDir, ext: "-events.md" });
    const eventsB = resolveSessionPath({ projectDir: projectB, sessionsDir, ext: "-events.md" });
    expect(eventsA).not.toBe(eventsB);

    writeFileSync(eventsA, eventsMarkdown("alpha_marker_aaa"), "utf-8");
    writeFileSync(eventsB, eventsMarkdown("bravo_marker_bbb"), "utf-8");

    const store = new ContentStore(join(root, "content.db"));
    stores.push(store);

    return { sessionsDir, projectA, projectB, eventsA, eventsB, store };
  }

  it("consumes this project's events file", () => {
    const { eventsA, store } = setupTwoProjects();

    maybeIndexSessionEvents(store);

    expect(existsSync(eventsA)).toBe(false);
    expect(store.search("alpha_marker_aaa", 5).length).toBeGreaterThan(0);
  });

  it("leaves a sibling project's events file on disk, unread", () => {
    const { eventsB, store } = setupTwoProjects();
    const before = readFileSync(eventsB, "utf-8");

    maybeIndexSessionEvents(store);

    // The whole point: project B's server must still find its own file.
    expect(existsSync(eventsB)).toBe(true);
    expect(readFileSync(eventsB, "utf-8")).toBe(before);
    expect(store.search("bravo_marker_bbb", 5)).toHaveLength(0);
  });

  it("is a no-op when this project has no events file", () => {
    const { eventsA, eventsB, store } = setupTwoProjects();
    rmSync(eventsA);

    expect(() => maybeIndexSessionEvents(store)).not.toThrow();

    // A missing file for us must not turn into a reason to take someone else's.
    expect(existsSync(eventsB)).toBe(true);
    expect(store.search("bravo_marker_bbb", 5)).toHaveLength(0);
  });

  it("indexing twice does not re-consume, and still spares the sibling", () => {
    const { eventsA, eventsB, store } = setupTwoProjects();

    maybeIndexSessionEvents(store);
    maybeIndexSessionEvents(store);

    expect(existsSync(eventsA)).toBe(false);
    expect(existsSync(eventsB)).toBe(true);
    expect(store.search("bravo_marker_bbb", 5)).toHaveLength(0);
  });
});
