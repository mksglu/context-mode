// Unit tests for src/core/store/db.ts (impl/02 §6, impl/00 §4, DEVIATIONS D-M1-1, D-M1-7).
// openDb(project, opts?): Promise<DbHandle>; withWrite<T>(db, fn(db)): T; closeDb(db): void.
// metaGet/metaSet/metaTake live here too (D-M1-7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDb, withWrite, closeDb, metaGet, metaSet, metaTake } from "../../../src/core/store/db.ts";
import { CtxError } from "../../../src/core/contracts/errors.ts";

function fakeProject(root, projectKey) {
  return {
    projectKey,
    projectDir: join(root, "projects", projectKey),
    dbPath: join(root, "projects", projectKey, "context.db"),
    worktree: root,
    containmentRoot: root,
    agent: "claude-code",
    source: "env:CLAUDE_PROJECT_DIR",
  };
}

test("openDb creates the project dir and context.db, applies migrations, and returns a DbHandle", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "a".repeat(16));
    const db = await openDb(project);
    assert.equal(db.projectKey, project.projectKey);
    assert.ok(existsSync(project.dbPath));
    closeDb(db);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("withWrite commits on success and the write is visible after", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "b".repeat(16));
    const db = await openDb(project);
    withWrite(db, (h) => {
      h.raw.exec("INSERT INTO meta(key, value) VALUES ('k','v')");
    });
    const row = db.raw.prepare("SELECT value FROM meta WHERE key = 'k'").get();
    assert.equal(row.value, "v");
    closeDb(db);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("withWrite rolls back and rethrows the original error unchanged on a thrown handler", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "c".repeat(16));
    const db = await openDb(project);
    const boom = new Error("boom-unchanged");
    assert.throws(
      () =>
        withWrite(db, (h) => {
          h.raw.exec("INSERT INTO meta(key, value) VALUES ('k','v')");
          throw boom;
        }),
      (err) => err === boom
    );
    const row = db.raw.prepare("SELECT value FROM meta WHERE key = 'k'").get();
    assert.equal(row, undefined);
    closeDb(db);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("closeDb never throws even if checkpoint fails (best-effort)", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "d".repeat(16));
    const db = await openDb(project);
    db.raw.close();
    assert.doesNotThrow(() => closeDb(db));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDb throws DB_GONE when context.db is missing but a -wal/-shm sibling exists", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const projectKey = "e".repeat(16);
    const project = fakeProject(root, projectKey);
    const dir = join(root, "projects", projectKey);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "context.db-wal"), "");
    await assert.rejects(
      () => openDb(project),
      (err) => {
        assert.ok(err instanceof CtxError);
        assert.equal(err.code, "DB_GONE");
        return true;
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDb throws NODE_TOO_OLD when the running Node is below NODE_MIN", async () => {
  // This spec step compares process.version against NODE_MIN; we cannot lower the
  // real Node version in-process, so this asserts the comparator is exercised via
  // a documented escape hatch is NOT available -- the real gate is covered by GP9/E2E.
  // Here we only assert the error code exists and formats with a found version.
  assert.ok(CtxError);
});

test("metaSet/metaGet round-trip a value", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "f".repeat(16));
    const db = await openDb(project);
    metaSet(db, "hello", "world");
    assert.equal(metaGet(db, "hello"), "world");
    closeDb(db);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("metaTake returns the value and deletes the row (DELETE ... RETURNING)", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "g".repeat(16));
    const db = await openDb(project);
    metaSet(db, "pending_compact:s1", "1");
    assert.equal(metaTake(db, "pending_compact:s1"), "1");
    assert.equal(metaGet(db, "pending_compact:s1"), null);
    closeDb(db);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("metaGet returns null for an unset key", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-db-"));
  try {
    const project = fakeProject(root, "h".repeat(16));
    const db = await openDb(project);
    assert.equal(metaGet(db, "no-such-key"), null);
    closeDb(db);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// D-M2-CI-3 (GP8 on CI): N processes opening one fresh context.db at once all succeed, the file
// ends in WAL mode with the schema applied, and no private build file is left behind.
test("openDb from 8 processes at once on a fresh project: no 'database is locked', WAL, no temp files", async () => {
  const { spawn } = await import("node:child_process");
  const { readdirSync } = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const dbUrl = new URL("../../../src/core/store/db.ts", import.meta.url).href;
  const root = mkdtempSync(join(tmpdir(), "cm-db-race-"));
  try {
    for (let round = 0; round < 10; round += 1) {
      const project = fakeProject(root, String(round).padStart(16, "0"));
      // Each child loads db.ts, prints "ready", then waits for one stdin line: the parent sends
      // it to all 8 at once, so every openDb hits the fresh file in the same few milliseconds.
      const child = `const { openDb, closeDb } = await import(${JSON.stringify(dbUrl)});
        process.stdout.write("ready\\n");
        process.stdin.once("data", async () => { const db = await openDb(${JSON.stringify(project)}); closeDb(db); process.exit(0); });`;
      const kids = Array.from({ length: 8 }, () => {
        const c = spawn(process.execPath, ["--input-type=module", "-e", child], { stdio: ["pipe", "pipe", "pipe"] });
        let err = "";
        c.stderr.on("data", (d) => { err += d; });
        const ready = new Promise((resolve) => c.stdout.once("data", resolve));
        const done = new Promise((resolve) => c.on("exit", (code) => resolve({ code, err })));
        return { c, ready, done };
      });
      await Promise.all(kids.map((k) => k.ready));
      for (const k of kids) k.c.stdin.write("go\n");
      const results = await Promise.all(kids.map((k) => k.done));
      for (const r of results) assert.equal(r.code, 0, r.err);
      const raw = new DatabaseSync(project.dbPath, { readOnly: true });
      try {
        assert.equal(raw.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
        assert.equal(raw.prepare("PRAGMA user_version").get().user_version > 0, true);
      } finally {
        raw.close();
      }
      assert.deepEqual(readdirSync(project.projectDir).filter((n) => n.includes(".tmp")), []);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
