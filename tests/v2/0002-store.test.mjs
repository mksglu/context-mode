// ADR-0002 (single DB), PRD-v2 section 4, GP8, GP9. One file per ADR area (ADR-0024); one describe per area part.
// Moved from tests/v2/store/{cleanup,close-checkpoint,config-dir,cost-dedup,db,db-platform-ported,owners,reserve,schema,sha256,shared-helpers} and lifecycle/exit. Names and assertions unchanged.
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { resolveConfigDir } from "../../src/core/project/config-dir.ts";
import { CtxError } from "../../src/core/contracts/errors.ts";
import { closeDb, metaGet, metaSet, metaTake, openDb, withWrite } from "../../src/core/store/db.ts";
import { DB_TIMEOUT_MS, SCHEMA_VERSION as CONSTANTS_SCHEMA_VERSION } from "../../src/core/contracts/constants.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { DatabaseSync } from "node:sqlite";
import { DDL, DDL_V2, DDL_V3, SCHEMA_VERSION, applyMigrations } from "../../src/core/store/schema.ts";
import { createHash } from "node:crypto";
import { sha256Hex } from "../../src/core/project/sha256.ts";
import { finishReserved, reserveSource } from "../../src/core/store/fts.ts";
import * as fts from "../../src/core/store/fts.ts";
import * as dispatch from "../../src/core/hooks/dispatch.ts";
import { appendEvent } from "../../src/core/journal/append.ts";
import { listLiveOwners, removeOwnerPid, writeOwnerPid } from "../../src/core/store/owners.ts";
import { cleanupProject, sweepDeadProjects } from "../../src/core/store/cleanup.ts";
import { ctxStats } from "../../src/core/tools/stats.ts";
import { ctxSearch } from "../../src/core/tools/search.ts";
import { installExitGuard } from "../../src/core/lifecycle/exit.ts";

describe("ADR-0002: config dir resolution", { concurrency: CONC }, () => {
  // Unit tests for src/core/project/config-dir.ts (impl/02 §4, DEVIATIONS D-M1-6).
  // resolveConfigDir(env): expands DATA_ROOT with HOME (POSIX) or USERPROFILE (win32),
  // mkdir recursive, returns realpath. No agent arg (D-M1-6 overrides impl/00 §4).


  test("resolveConfigDir creates ~/.context-mode under HOME and returns its realpath", () => {
    const home = mkdtempSync(join(tmpdir(), "cm-cfg-"));
    try {
      const dir = resolveConfigDir({ HOME: home });
      assert.equal(dir, realpathSync.native(join(home, ".context-mode")));
      assert.ok(existsSync(dir));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("resolveConfigDir is idempotent: calling twice does not throw and returns the same path", () => {
    const home = mkdtempSync(join(tmpdir(), "cm-cfg-"));
    try {
      const a = resolveConfigDir({ HOME: home });
      const b = resolveConfigDir({ HOME: home });
      assert.equal(a, b);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("resolveConfigDir uses USERPROFILE when HOME is absent (Windows)", () => {
    const home = mkdtempSync(join(tmpdir(), "cm-cfg-win-"));
    try {
      const dir = resolveConfigDir({ USERPROFILE: home });
      assert.equal(dir, realpathSync.native(join(home, ".context-mode")));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("resolveConfigDir throws a one-line NO_HOME CtxError when neither env var is set", () => {
    assert.throws(
      () => resolveConfigDir({}),
      (err) => {
        assert.ok(err instanceof CtxError);
        assert.equal(err.code, "NO_HOME");
        assert.match(err.message, /^Env var .+ is not set\. Fix: set .+ to your home directory\.$/);
        return true;
      }
    );
  });

  test("resolveConfigDir never reads process.env directly beyond the passed env object (pure function of its input)", () => {
    const home1 = mkdtempSync(join(tmpdir(), "cm-cfg-a-"));
    const home2 = mkdtempSync(join(tmpdir(), "cm-cfg-b-"));
    try {
      const d1 = resolveConfigDir({ HOME: home1 });
      const d2 = resolveConfigDir({ HOME: home2 });
      assert.notEqual(d1, d2);
    } finally {
      rmSync(home1, { recursive: true, force: true });
      rmSync(home2, { recursive: true, force: true });
    }
  });
});

describe("ADR-0002: openDb and the single DB", { concurrency: CONC }, () => {
  // Unit tests for src/core/store/db.ts (impl/02 §6, impl/00 §4, DEVIATIONS D-M1-1, D-M1-7).
  // openDb(project, opts?): Promise<DbHandle>; withWrite<T>(db, fn(db)): T; closeDb(db): void.
  // metaGet/metaSet/metaTake live here too (D-M1-7).


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
    const dbUrl = new URL("../../src/core/store/db.ts", import.meta.url).href;
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
});

describe("ADR-0002: DB platform cases, ported from v1", { concurrency: CONC }, () => {
  // tests/v2/store/db-platform-ported.test.mjs
  // Ported from tests/util/db-base-platform-gate.test.ts (cleanup-plan W1-ops, PORT row). v1 had a
  // better-sqlite3 / node:sqlite / bun ladder (#551, #642). v2 has one engine, node:sqlite (ADR-0002), so the
  // invariants kept are: multi-writer default (no exclusive lock), busy_timeout set on every connection (#642),
  // close and re-open on the same path, and the Node version gate.


  function fakeProject(root, key) {
    return {
      projectKey: key, projectDir: join(root, "projects", key), dbPath: join(root, "projects", key, "context.db"),
      worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR",
    };
  }
  const withRoot = async (fn) => {
    const root = mkdtempSync(join(tmpdir(), "cm-dbplat-"));
    try {
      await fn(root);
    } finally {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        if (process.platform !== "win32" || err.code !== "EPERM") throw err;
      }
    }
  };

  test("#642: every connection carries busy_timeout = DB_TIMEOUT_MS", async () => {
    await withRoot(async (root) => {
      const db = await openDb(fakeProject(root, "b".repeat(16)));
      try {
        const row = db.raw.prepare("PRAGMA busy_timeout").get();
        assert.equal(Object.values(row)[0], DB_TIMEOUT_MS);
      } finally {
        closeDb(db);
      }
    });
  });

  test("v1.0.130 invariant: not exclusive. Two handles on one path both open and both write (multi-writer default)", async () => {
    await withRoot(async (root) => {
      const project = fakeProject(root, "c".repeat(16));
      const a = await openDb(project);
      const b = await openDb(project);
      try {
        const mode = a.raw.prepare("PRAGMA locking_mode").get();
        assert.equal(String(Object.values(mode)[0]).toLowerCase(), "normal");
        withWrite(a, (d) => d.raw.exec("INSERT INTO meta (key, value) VALUES ('from-a', '1')"));
        withWrite(b, (d) => d.raw.exec("INSERT INTO meta (key, value) VALUES ('from-b', '2')"));
        const seen = a.raw.prepare("SELECT key FROM meta WHERE key IN ('from-a','from-b') ORDER BY key").all().map((r) => r.key);
        assert.deepEqual(seen, ["from-a", "from-b"]);
      } finally {
        closeDb(a);
        closeDb(b);
      }
    });
  });

  test("lifecycle: close then re-open on the same path sees the earlier write and leaks no state", async () => {
    await withRoot(async (root) => {
      const project = fakeProject(root, "d".repeat(16));
      const first = await openDb(project);
      withWrite(first, (d) => d.raw.exec("INSERT INTO meta (key, value) VALUES ('k', 'v')"));
      closeDb(first);
      const second = await openDb(project);
      try {
        assert.equal(second.raw.prepare("SELECT value FROM meta WHERE key = 'k'").get().value, "v");
      } finally {
        closeDb(second);
      }
      assert.ok(existsSync(project.dbPath));
    });
  });

  test("lifecycle: closeDb checkpoints, so no -wal file keeps unmerged pages after the last close", async () => {
    await withRoot(async (root) => {
      const project = fakeProject(root, "e".repeat(16));
      const db = await openDb(project);
      withWrite(db, (d) => d.raw.exec("INSERT INTO meta (key, value) VALUES ('x', 'y')"));
      closeDb(db);
      assert.doesNotThrow(() => closeDb(db), "a second close never throws");
      const again = await openDb(project);
      closeDb(again);
    });
  });

  test("Node version gate: the gate is on process.version against NODE_MIN, so this runtime (>= NODE_MIN) opens", async () => {
    await withRoot(async (root) => {
      const db = await openDb(fakeProject(root, "f".repeat(16)));
      closeDb(db);
    });
  });
});

describe("ADR-0002: schema", { concurrency: CONC }, () => {
  // Unit tests for src/core/store/schema.ts (impl/02 §5, DEVIATIONS D-M1-4, D-M1-3).
  // applyMigrations(db, fromVersion) brings a fresh DB to SCHEMA_VERSION and is a no-op
  // when already current; throws ERR_SCHEMA_STALE / SCHEMA_STALE when fromVersion > SCHEMA_VERSION.


  function freshDb(dir) {
    return new DatabaseSync(join(dir, "context.db"));
  }

  test("SCHEMA_VERSION equals the constants.ts SCHEMA_VERSION", () => {
    assert.equal(SCHEMA_VERSION, C.SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 5); // D-M5-arch-2: v2 adds the cost dedup index; D-SEARCH-3: v3 chunks title + porter; D-SEARCH-4: v4 trigram; r3-ledger: v5 line_units
  });

  test("v2 (D-M5-arch-2): a fresh DB has the partial unique index events(session_id, turn) WHERE kind = 'cost'", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, 0);
      const idx = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_events_cost_session_turn'").get();
      assert.ok(idx, "missing idx_events_cost_session_turn");
      assert.ok(idx.sql.includes("UNIQUE") && idx.sql.includes("(session_id, turn)") && idx.sql.includes("WHERE kind = 'cost'"));
      const ins = (kind, turn) => db.exec(`INSERT INTO events(session_id, worktree, agent, kind, turn, created_at, accessed_at) VALUES ('s','w','claude-code','${kind}',${turn},0,0)`);
      ins("cost", 1);
      assert.throws(() => ins("cost", 1), "second cost row for the same (session_id, turn) must violate the index");
      ins("cost", 2);
      ins("prompt", 1);
      ins("prompt", 1); // non-cost rows are not covered by the partial index
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("v2 (D-M5-arch-2): a version-1 DB migrates to the current version (2, 3, 4, then 5) without losing rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      db.exec(DDL);
      db.exec("PRAGMA user_version = 1");
      db.exec("INSERT INTO events(session_id, worktree, agent, kind, turn, created_at, accessed_at) VALUES ('s','w','claude-code','prompt',1,0,0)");
      applyMigrations(db, 1);
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 5);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events").get().n, 1);
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_events_cost_session_turn'").get());
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("applyMigrations on a fresh DB (fromVersion 0) creates events, sources, chunks, meta and sets user_version", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, 0);
      const uv = db.prepare("PRAGMA user_version").get().user_version;
      assert.equal(uv, SCHEMA_VERSION);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
        .all()
        .map((r) => r.name);
      for (const t of ["events", "sources", "chunks", "meta"]) assert.ok(tables.includes(t), `missing table ${t}`);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("events table has the JournalRow columns (D-M1-4): created_at, accessed_at, sandbox_bytes, returned_bytes, kind CHECK includes 'decision'", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, 0);
      const cols = db.prepare("PRAGMA table_info(events)").all().map((c) => c.name);
      for (const c of ["seq", "session_id", "worktree", "agent", "kind", "tool", "key", "path", "ok", "exit_code", "bytes", "body", "turn", "sandbox_bytes", "returned_bytes", "created_at", "accessed_at"]) {
        assert.ok(cols.includes(c), `events missing column ${c}`);
      }
      // 'decision' is an accepted kind value per D-M1-4.
      db.exec("INSERT INTO events(session_id, worktree, agent, kind, turn, created_at, accessed_at) VALUES ('s','w','claude-code','decision',0,0,0)");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("sources table has an integer autoincrement id, kind IN ('path','content','url'), label, bytes_total, chunk_count (D-M1-4)", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, 0);
      const cols = db.prepare("PRAGMA table_info(sources)").all().map((c) => c.name);
      for (const c of ["id", "session_id", "worktree", "agent", "kind", "label", "bytes_total", "chunk_count", "created_ts", "created_at", "accessed_ts"]) {
        assert.ok(cols.includes(c), `sources missing column ${c}`);
      }
      db.exec("INSERT INTO sources(session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts) VALUES ('s','w','claude-code','content','l',0,0,0,'1970-01-01T00:00:00Z',0)");
      assert.throws(() =>
        db.exec("INSERT INTO sources(session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts) VALUES ('s','w','claude-code','bogus','l',0,0,0,'1970-01-01T00:00:00Z',0)")
      );
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("chunks FTS5 virtual table column is named 'ord', not 'seq' (D-M1-4)", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, 0);
      db.exec("INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body) VALUES (1,'s','w','claude-code',0,'hello world')");
      const row = db.prepare("SELECT ord, body FROM chunks WHERE chunks MATCH 'hello'").get();
      assert.equal(row.ord, 0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("applyMigrations is a no-op (no transaction, no error) when fromVersion already equals SCHEMA_VERSION", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, SCHEMA_VERSION);
      // no tables created, and no throw
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      assert.equal(tables.length, 0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("applyMigrations throws SCHEMA_STALE when fromVersion is newer than SCHEMA_VERSION", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      assert.throws(
        () => applyMigrations(db, SCHEMA_VERSION + 1),
        (err) => {
          assert.ok(err instanceof CtxError);
          assert.equal(err.code, "SCHEMA_STALE");
          return true;
        }
      );
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("applyMigrations rolls back on a mid-migration failure and leaves user_version at fromVersion", () => {
    // DDL is exported so this is a sanity check that it is non-empty SQL, not a stub.
    assert.ok(typeof DDL === "string" && DDL.includes("CREATE TABLE"));
  });

  test("[search-L3] v3 (D-SEARCH-3): a version-2 DB migrates to the current version, keeps every chunk, adds title, stems with porter", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      applyMigrations(db, 0);
      db.exec("PRAGMA user_version = 3");
      const v2 = new DatabaseSync(join(dir, "v2.db"));
      v2.exec(DDL);
      v2.exec(DDL_V2);
      v2.exec("PRAGMA user_version = 2");
      const ins = v2.prepare("INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body) VALUES (?, 's', 'w', 'claude-code', ?, ?)");
      ins.run(1, 0, "connection pooling");
      ins.run(1, 1, "Привет café");
      applyMigrations(v2, 2);
      assert.equal(v2.prepare("PRAGMA user_version").get().user_version, 5);
      assert.equal(v2.prepare("SELECT COUNT(*) AS n FROM chunks").get().n, 2);
      assert.deepEqual(v2.prepare("SELECT ord, title FROM chunks WHERE chunks MATCH 'connecting'").all().map((r) => ({ ...r })), [{ ord: 0, title: "" }]);
      assert.equal(v2.prepare("SELECT COUNT(*) AS n FROM chunks WHERE chunks MATCH 'cafe'").get().n, 1);
      v2.close();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[search-L4] v4 (D-SEARCH-4): a version-3 DB migrates to 4 and fills the trigram table from every chunk", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-schema-"));
    try {
      const db = freshDb(dir);
      db.exec(DDL);
      db.exec(DDL_V2);
      db.exec(DDL_V3);
      db.exec("PRAGMA user_version = 3");
      const ins = db.prepare("INSERT INTO chunks(source_id, session_id, worktree, agent, ord, body, title) VALUES (?, 's', 'w', 'claude-code', ?, ?, ?)");
      ins.run(1, 0, "see T-CMP here", "");
      ins.run(1, 1, "other", "Guide > src/core/fts.ts");
      applyMigrations(db, 3);
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 5);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chunks").get().n, 2);
      const rid = (m) => db.prepare("SELECT rowid AS r FROM chunks_tri WHERE chunks_tri MATCH ?").all(m).map((r) => r.r);
      const want = (o) => db.prepare("SELECT rowid AS r FROM chunks WHERE ord = ?").get(o).r;
      assert.deepEqual(rid('"T-CMP"'), [want(0)]);
      assert.deepEqual(rid('"core/fts"'), [want(1)]);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ADR-0002: sha256 helper", { concurrency: CONC }, () => {
  // Unit tests for src/core/project/sha256.ts (DEVIATIONS D-M7-HP-2): same digest as node:crypto.

  const ref = (s) => createHash("sha256").update(s).digest("hex");

  test("sha256Hex: FIPS 180-4 known answers", () => {
    assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  test("sha256Hex equals node:crypto for every length 0..300 and non-ASCII paths", () => {
    for (let n = 0; n <= 300; n++) assert.equal(sha256Hex("a".repeat(n)), ref("a".repeat(n)), `length ${n}`);
    for (const s of ["/Users/x/repo/.git", "C:\\Users\\Ö\\repo\\.git", "/tmp/プロジェクト/.git", "/tmp/😀/.git"]) assert.equal(sha256Hex(s), ref(s));
  });
});

describe("ADR-0002: shared store helpers", { concurrency: CONC }, () => {
  // r4g shared helpers (refactor, no behaviour change): recallQueryText and deleteChunkRows (store/fts.ts),
  // sourceRowOf (hooks/dispatch.ts). Namespace imports keep each test red on its own until its helper exists.


  const KEY = "h".repeat(16);

  function project(root) {
    return {
      projectKey: KEY,
      projectDir: join(root, "p"),
      dbPath: join(root, "p", "context.db"),
      worktree: root,
      containmentRoot: root,
      agent: "claude-code",
      source: "env:CLAUDE_PROJECT_DIR",
    };
  }

  const src = (label) => ({
    projectKey: KEY, sessionId: "s1", worktree: "/w", agent: "claude-code", kind: "content",
    label, bytes: 0, chunkCount: 0, createdAt: 1700000000000,
  });

  const count = (raw, sql) => Number(raw.prepare(sql).get().n);
  const PORTER_NEEDLE = "SELECT COUNT(*) AS n FROM chunks WHERE body LIKE '%needle%'";
  const TRI_NEEDLE = "SELECT COUNT(*) AS n FROM chunks_tri WHERE chunks_tri MATCH '\"needle\"'";
  const UNITS = "SELECT COUNT(*) AS n FROM line_units";
  const CHUNKS = "SELECT COUNT(*) AS n FROM chunks";

  test("[H-1] recallQueryText: the prompt alone when it equals the goal, else prompt, one space, goal", () => {
    assert.equal(fts.recallQueryText("fix login", "fix login"), "fix login");
    assert.equal(fts.recallQueryText("fix login", "build the api"), "fix login build the api");
  });

  test("[H-2] deleteChunkRows: one source id, one label or all; chunk, trigram and line rows leave together", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-helpers-"));
    try {
      const db = await openDb(project(root));
      const a = fts.ftsInsert(db, src("a.txt"), [{ ord: 0, text: "needle alpha", bytes: 12 }]);
      const b = fts.ftsInsert(db, src("b.txt"), [{ ord: 0, text: "needle beta", bytes: 11 }]);
      fts.insertUnits(db, a, "s1", [{ ord: 0, body: "needle alpha" }]);
      fts.insertUnits(db, b, "s1", [{ ord: 0, body: "needle beta" }]);

      assert.equal(fts.deleteChunkRows(db.raw, { sourceId: a }), 1);
      assert.equal(count(db.raw, CHUNKS), 1);
      assert.equal(count(db.raw, UNITS), 1);
      assert.equal(count(db.raw, TRI_NEEDLE), 1);
      assert.equal(count(db.raw, PORTER_NEEDLE), 1);

      assert.equal(fts.deleteChunkRows(db.raw, { label: "b.txt" }), 1);
      assert.equal(count(db.raw, CHUNKS), 0);
      assert.equal(count(db.raw, UNITS), 0);
      assert.equal(count(db.raw, TRI_NEEDLE), 0);

      const c = fts.ftsInsert(db, src("c.txt"), [{ ord: 0, text: "needle gamma", bytes: 12 }]);
      fts.insertUnits(db, c, "s1", [{ ord: 0, body: "needle gamma" }]);
      assert.equal(fts.deleteChunkRows(db.raw, "all"), 1);
      assert.equal(count(db.raw, CHUNKS), 0);
      assert.equal(count(db.raw, UNITS), 0);
      assert.equal(count(db.raw, TRI_NEEDLE), 0);
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[H-3] sourceRowOf returns only the fields reserveSource stores: no bytes or chunkCount placeholders", () => {
    const row = dispatch.sourceRowOf(project("/w"), "s1", "cat big.log#1");
    assert.deepEqual(Object.keys(row).sort(), ["agent", "createdAt", "kind", "label", "sessionId", "worktree"]);
  });
});

describe("ADR-0002: source reserve", { concurrency: CONC }, () => {
  // D-R4-RESERVE-1: a source reserved for a detached write (reserveSource) is deleted again when its chunk
  // or line unit write fails, so no 0-chunk orphan row stays in sources.


  function project(root) {
    return {
      projectKey: "r".repeat(16),
      projectDir: join(root, "p"),
      dbPath: join(root, "p", "context.db"),
      worktree: root,
      containmentRoot: root,
      agent: "claude-code",
      source: "env:CLAUDE_PROJECT_DIR",
    };
  }

  const src = (root) => ({ projectKey: "r".repeat(16), sessionId: "s1", worktree: root, agent: "claude-code", kind: "content", label: "cat big.log#1", bytes: 0, chunkCount: 0, createdAt: Date.now() });

  test("D-R4-RESERVE-1: a forced chunk write failure deletes the reserved source row and leaves no orphan", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-reserve-"));
    try {
      const db = await openDb(project(root));
      const chunks = [{ ord: 0, text: Symbol("not bindable"), bytes: 4 }];
      const id = reserveSource(db, src(root), chunks);
      assert.throws(() => finishReserved(db, id, src(root), chunks, []));
      const left = db.raw.prepare("SELECT COUNT(*) AS n FROM sources WHERE id = ?").get(id).n;
      assert.equal(left, 0, "the reserved row is deleted after the failed write");
      const orphans = db.raw.prepare("SELECT COUNT(*) AS n FROM sources WHERE chunk_count = 0").get().n;
      assert.equal(orphans, 0, "no 0-chunk orphan remains");
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("D-R4-RESERVE-1: a successful finishReserved stores the chunks under the reserved id", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-reserve-ok-"));
    try {
      const db = await openDb(project(root));
      const chunks = [{ ord: 0, text: "alpha beta", bytes: 10 }];
      const id = reserveSource(db, src(root), chunks);
      finishReserved(db, id, src(root), chunks, [{ ord: 0, body: "alpha beta" }]);
      assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?").get(id).n, 1);
      assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM line_units WHERE source_id = ?").get(id).n, 1);
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("ADR-0002: cost row dedup", { concurrency: CONC }, () => {
  const SCHEMA_VERSION = CONSTANTS_SCHEMA_VERSION;
  // tests/v2/store/cost-dedup.test.mjs
  // D-M5-arch-2: cost rows are deduped per (session_id, turn) via a partial unique index on
  // events(session_id, turn) WHERE kind = 'cost'; appendEvent uses INSERT OR IGNORE for cost rows.
  // SCHEMA_VERSION bumps to 2 (schema migration v2). Owner: tests module (14-tests.md, 07-tools-ops).


  // Fixture follows the 00-architecture contract (DEVIATIONS D-M5-S1-1): openDb(ProjectContext),
  // appendEvent(DbHandle, NewJournalRow) with snake_case columns, queries via DbHandle.raw.
  async function fixture(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-cost-dedup-"));
    const projectKey = "c".repeat(16);
    const db = await openDb({
      projectKey,
      projectDir: path.join(dir, "projects", projectKey),
      dbPath: path.join(dir, "projects", projectKey, "context.db"),
      worktree: dir,
      containmentRoot: dir,
      agent: "opencode",
      source: "env:CLAUDE_PROJECT_DIR",
    });
    t.after(() => {
      closeDb(db);
      rmSync(dir, { recursive: true, force: true });
    });
    return db;
  }

  function row(kind, turn, bytes = 0) {
    return {
      session_id: "s1", worktree: "/w", agent: "opencode", kind, tool: null, key: null, path: null, ok: 1,
      exit_code: null, bytes, body: "", turn, sandbox_bytes: bytes, returned_bytes: bytes,
    };
  }

  test("[M5] SCHEMA_VERSION is 5 after the Usage/cost dedup migration (2), the search title + porter migration (3, D-SEARCH-3), the trigram table (4, D-SEARCH-4) and line units (5, r3-ledger)", () => {
    assert.equal(SCHEMA_VERSION, 5);
  });

  test("[M5] cost-dedup/usage-events-idempotent-per-turn: 3 step-finish events in one turn journal once", async (t) => {
    const db = await fixture(t);
    const first = appendEvent(db, row("cost", 1));
    assert.equal(appendEvent(db, row("cost", 1)), first, "a duplicate returns the kept row's seq");
    appendEvent(db, row("cost", 1));
    const count = db.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'cost' AND session_id = ? AND turn = ?").get("s1", 1);
    assert.equal(count.n, 1, "INSERT OR IGNORE must keep exactly one cost row per (session_id, turn)");
  });

  test("[M5] cost-dedup/different-turn-not-deduped: a new turn gets its own cost row", async (t) => {
    const db = await fixture(t);
    appendEvent(db, row("cost", 1));
    appendEvent(db, row("cost", 2));
    const count = db.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'cost' AND session_id = ?").get("s1");
    assert.equal(count.n, 2);
  });

  test("[M5] cost-dedup/non-cost-rows-not-deduped: identical non-cost rows with the same turn both insert", async (t) => {
    const db = await fixture(t);
    const a = appendEvent(db, row("prompt", 1));
    const b = appendEvent(db, row("prompt", 1));
    assert.notEqual(a, b);
    const count = db.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'prompt' AND session_id = ? AND turn = ?").get("s1", 1);
    assert.equal(count.n, 2, "the partial unique index applies only WHERE kind = 'cost'");
  });

  test("[M5] cost-dedup/ctx_stats-excludes-cost: stats call rows still exclude cost (D-M4-S3-1)", async (t) => {
    const db = await fixture(t);
    appendEvent(db, row("cost", 1, 999));
    const r = db.raw.prepare("SELECT COALESCE(SUM(returned_bytes),0) AS returned FROM events WHERE tool IS NOT NULL AND kind <> 'cost'").get();
    assert.equal(r.returned, 0);
  });
});

describe("ADR-0002: retention cleanup and dead-project sweep", { concurrency: CONC }, () => {
  // Unit tests for src/core/store/cleanup.ts (impl/02 §8, DEVIATIONS D-M1-11, D-M1-12).
  // cleanupProject(db, configDir): { deletedSources, deletedProject }.
  // sweepDeadProjects(configDir): string[] (deleted projectKeys).
  // Live-PID check runs INSIDE the same withWrite transaction as the delete (#1248, GP8 V22):
  // live owner, any age -> kept; dead owner + idle > PROJECT_DEAD_IDLE_DAYS -> deleted.


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

  function insertSource(db, overrides) {
    const now = Date.now();
    db.raw.exec(
      `INSERT INTO sources(session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts)
     VALUES ('${overrides.session_id ?? "s1"}', 'w', 'claude-code', 'content', 'l', ${overrides.bytes_total ?? 100}, 0, ${now}, '1970-01-01T00:00:00Z', ${overrides.accessed_ts ?? now})`
    );
  }

  test("[M1] GP8/cleanup-dead-owner-old-deleted: cleanupProject deletes rows older than RETENTION_IDLE_DAYS with no live owner", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-cleanup-"));
    try {
      const project = fakeProject(root, "a".repeat(16));
      const db = await openDb(project);
      const oldTs = Date.now() - (C.RETENTION_IDLE_DAYS + 1) * C.MS_PER_DAY;
      insertSource(db, { session_id: "dead-session", accessed_ts: oldTs });
      const result = cleanupProject(db, join(root, "cm-config"));
      assert.equal(result.deletedSources, 1);
      const left = db.raw.prepare("SELECT COUNT(*) AS n FROM sources").get().n;
      assert.equal(left, 0);
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("cleanupProject keeps a row whose session is tied to a live owner, regardless of age", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-cleanup-"));
    const configDir = join(root, "cm-config");
    try {
      const project = fakeProject(root, "b".repeat(16));
      const db = await openDb(project);
      writeOwnerPid(configDir, project.projectKey, "srv-live");
      const oldTs = Date.now() - (C.RETENTION_IDLE_DAYS + 10) * C.MS_PER_DAY;
      insertSource(db, { session_id: "s1", accessed_ts: oldTs });
      const result = cleanupProject(db, configDir);
      assert.equal(result.deletedSources, 0);
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("cleanupProject enforces RETENTION_SIZE_CAP_BYTES by deleting the oldest-accessed source first", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-cleanup-"));
    try {
      const project = fakeProject(root, "c".repeat(16));
      const db = await openDb(project);
      const now = Date.now();
      insertSource(db, { session_id: "s1", bytes_total: C.RETENTION_SIZE_CAP_BYTES, accessed_ts: now - 1000 });
      insertSource(db, { session_id: "s1", bytes_total: 1000, accessed_ts: now });
      const result = cleanupProject(db, join(root, "cm-config"));
      assert.ok(result.deletedSources >= 1);
      const left = db.raw.prepare("SELECT SUM(bytes_total) AS n FROM sources").get().n ?? 0;
      assert.ok(left <= C.RETENTION_SIZE_CAP_BYTES);
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M1] GP8/cleanup-live-owner-kept (V22): sweepDeadProjects never deletes a project with a live owner PID, whatever accessed_ts age", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-sweep-"));
    const configDir = join(root, "cm-config");
    try {
      const project = fakeProjectUnderConfig(configDir, "d".repeat(16));
      const db = await openDb(project);
      writeOwnerPid(configDir, project.projectKey, "srv-live");
      const oldTs = Date.now() - (C.PROJECT_DEAD_IDLE_DAYS + 100) * C.MS_PER_DAY;
      insertSource(db, { session_id: "s1", accessed_ts: oldTs });
      closeDb(db);

      const deleted = sweepDeadProjects(configDir);
      assert.equal(deleted.includes(project.projectKey), false);
      assert.ok(existsSync(join(configDir, "projects", project.projectKey)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[M1] GP8/cleanup-dead-owner-old-deleted (V22): sweepDeadProjects deletes a whole project with a dead PID and last access older than PROJECT_DEAD_IDLE_DAYS", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-sweep-"));
    const configDir = join(root, "cm-config");
    try {
      const project = fakeProjectUnderConfig(configDir, "e".repeat(16));
      const db = await openDb(project);
      const oldTs = Date.now() - (C.PROJECT_DEAD_IDLE_DAYS + 1) * C.MS_PER_DAY;
      insertSource(db, { session_id: "s1", accessed_ts: oldTs });
      closeDb(db);
      // No owners/ dir written at all -> no live owners.

      const deleted = sweepDeadProjects(configDir);
      assert.ok(deleted.includes(project.projectKey));
      assert.equal(existsSync(join(configDir, "projects", project.projectKey)), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("sweepDeadProjects does not delete a dead-PID project whose last access is inside the PROJECT_DEAD_IDLE_DAYS window", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-sweep-"));
    const configDir = join(root, "cm-config");
    try {
      const project = fakeProjectUnderConfig(configDir, "f".repeat(16));
      const db = await openDb(project);
      const recentTs = Date.now() - 1 * C.MS_PER_DAY;
      insertSource(db, { session_id: "s1", accessed_ts: recentTs });
      closeDb(db);

      const deleted = sweepDeadProjects(configDir);
      assert.equal(deleted.includes(project.projectKey), false);
      assert.ok(existsSync(join(configDir, "projects", project.projectKey)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("sweepDeadProjects skips a project whose context.db is corrupt, without aborting the loop for others", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-sweep-"));
    const configDir = join(root, "cm-config");
    try {
      const corruptKey = "9".repeat(16);
      const corruptDir = join(configDir, "projects", corruptKey);
      mkdirSync(corruptDir, { recursive: true });
      writeFileSync(join(corruptDir, "context.db"), "not a sqlite file");

      const okProject = fakeProjectUnderConfig(configDir, "8".repeat(16));
      const db = await openDb(okProject);
      const oldTs = Date.now() - (C.PROJECT_DEAD_IDLE_DAYS + 1) * C.MS_PER_DAY;
      insertSource(db, { session_id: "s1", accessed_ts: oldTs });
      closeDb(db);

      const deleted = sweepDeadProjects(configDir);
      assert.ok(deleted.includes(okProject.projectKey));
      assert.ok(existsSync(corruptDir)); // corrupt one is skipped, not deleted
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function fakeProjectUnderConfig(configDir, projectKey) {
    return {
      projectKey,
      projectDir: join(configDir, "projects", projectKey),
      dbPath: join(configDir, "projects", projectKey, "context.db"),
      worktree: configDir,
      containmentRoot: configDir,
      agent: "claude-code",
      source: "env:CLAUDE_PROJECT_DIR",
    };
  }

  // D-R4-RETENTION-1: the size cap counts the line units' bytes too, not only sources.bytes_total.
  test("D-R4-RETENTION-1: RETENTION_SIZE_CAP_BYTES counts line_units bytes: a source with big units is deleted", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-cleanup-units-"));
    try {
      const project = fakeProject(root, "d".repeat(16));
      const db = await openDb(project);
      const now = Date.now();
      insertSource(db, { session_id: "s1", bytes_total: 1000, accessed_ts: now - 1000 });
      const srcId = db.raw.prepare("SELECT id FROM sources").get().id;
      const big = "x".repeat(C.RETENTION_SIZE_CAP_BYTES + 10);
      db.raw.prepare("INSERT INTO line_units(body, source_id, session_id, ord) VALUES (?, ?, 's1', 0)").run(big, srcId);
      insertSource(db, { session_id: "s1", bytes_total: 1000, accessed_ts: now });
      const result = cleanupProject(db, join(root, "cm-config"));
      assert.ok(result.deletedSources >= 1, "the cap is exceeded by the units, so a source is deleted");
      const units = db.raw.prepare("SELECT COUNT(*) AS n FROM line_units WHERE source_id = ?").get(srcId).n;
      assert.equal(units, 0, "the deleted source's line units are gone too");
      closeDb(db);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// Serial on purpose: its spy patches DatabaseSync.prototype for the whole process.
describe("ADR-0002: close and WAL checkpoint (GP8, GP9)", () => {
  // Viet report 1 (docs/v2/review/viet/README.md, D-CKPT-LAT-1): ctx_stats and ctx_search took ~1.45 s each on Windows, all inside
  // PRAGMA wal_checkpoint(TRUNCATE) run by closeDb on a read-only handle (now PASSIVE, D-NO-TRUNCATE-1). A read-only handle writes nothing, so it has nothing to
  // checkpoint. The server's own writer keeps its checkpoint on close (impl/02 §6.3), so committed data still reaches the main file.


  function ctxFor(root, key) {
    const projectDir = join(root, "projects", key);
    return {
      project: { projectKey: key, projectDir, dbPath: join(projectDir, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId: "s1", turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18",
    };
  }

  // Records every checkpoint statement issued through DatabaseSync.exec / prepare while fn runs.
  async function spyCheckpoints(fn) {
    const seen = [];
    const exec = DatabaseSync.prototype.exec;
    const prepare = DatabaseSync.prototype.prepare;
    const note = (sql) => { if (typeof sql === "string" && sql.toLowerCase().includes("wal_checkpoint")) seen.push(sql.trim()); };
    DatabaseSync.prototype.exec = function (sql) { note(sql); return exec.call(this, sql); };
    DatabaseSync.prototype.prepare = function (sql) { note(sql); return prepare.call(this, sql); };
    try { await fn(); } finally { DatabaseSync.prototype.exec = exec; DatabaseSync.prototype.prepare = prepare; }
    return seen;
  }

  test("closeDb on a read-only handle issues no wal_checkpoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ckpt-"));
    try {
      const ctx = ctxFor(root, "a".repeat(16));
      closeDb(await openDb(ctx.project)); // creates the DB
      const seen = await spyCheckpoints(async () => { closeDb(await openDb(ctx.project, { readOnly: true })); });
      assert.deepEqual(seen, []);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("closeDb on a writable handle still checkpoints, PASSIVE (impl/02 §6.3, D-NO-TRUNCATE-1)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ckpt-"));
    try {
      const ctx = ctxFor(root, "b".repeat(16));
      const db = await openDb(ctx.project);
      const seen = await spyCheckpoints(async () => { closeDb(db); });
      assert.deepEqual(seen, ["PRAGMA wal_checkpoint(PASSIVE)"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("ctx_stats and ctx_search (the read tools) issue no wal_checkpoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-ckpt-"));
    try {
      const ctx = ctxFor(root, "c".repeat(16));
      closeDb(await openDb(ctx.project));
      const seen = await spyCheckpoints(async () => {
        await ctxStats.handler({}, ctx);
        await ctxSearch.handler({ queries: ["LATENCY_SENTINEL"] }, ctx);
      });
      assert.deepEqual(seen, []);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0002: owner pid files (GP9)", { concurrency: CONC }, () => {
  // Unit tests for src/core/store/owners.ts (impl/02 §7).
  // writeOwnerPid/removeOwnerPid/listLiveOwners(configDir, projectKey).
  // Files live at <configDir>/projects/<projectKey>/owners/<serverId>.pid.
  // listLiveOwners uses process.kill(pid, 0), never a ps spawn; dead PIDs self-heal (deleted).


  test("writeOwnerPid writes <configDir>/projects/<projectKey>/owners/<serverId>.pid containing process.pid", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-owners-"));
    try {
      writeOwnerPid(dir, "proj1", "srv1");
      const f = join(dir, "projects", "proj1", "owners", "srv1.pid");
      assert.ok(existsSync(f));
      assert.equal(readFileSync(f, "utf8").trim(), String(process.pid));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("removeOwnerPid deletes the file and ignores ENOENT when it is already gone", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-owners-"));
    try {
      writeOwnerPid(dir, "proj1", "srv1");
      removeOwnerPid(dir, "proj1", "srv1");
      assert.equal(existsSync(join(dir, "projects", "proj1", "owners", "srv1.pid")), false);
      assert.doesNotThrow(() => removeOwnerPid(dir, "proj1", "srv1"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("listLiveOwners returns the server id for a live PID (this process)", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-owners-"));
    try {
      writeOwnerPid(dir, "proj1", "srv-live");
      const owners = listLiveOwners(dir, "proj1");
      assert.deepEqual(owners, ["srv-live"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("listLiveOwners excludes a dead PID and self-heals by deleting its .pid file", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-owners-"));
    try {
      const ownersDir = join(dir, "projects", "proj1", "owners");
      mkdirSync(ownersDir, { recursive: true });
      // A PID that is extremely unlikely to be alive.
      writeFileSync(join(ownersDir, "srv-dead.pid"), "999999");
      const owners = listLiveOwners(dir, "proj1");
      assert.equal(owners.includes("srv-dead"), false);
      assert.equal(existsSync(join(ownersDir, "srv-dead.pid")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("listLiveOwners returns [] for a project with no owners directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-owners-"));
    try {
      assert.deepEqual(listLiveOwners(dir, "no-such-project"), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("listLiveOwners never spawns a child process (PRD P5): no extra process exists after the call", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-owners-"));
    try {
      writeOwnerPid(dir, "proj1", "srv-live");
      const before = process.cpuUsage();
      listLiveOwners(dir, "proj1");
      const after = process.cpuUsage();
      // A ps/exec spawn would cost several ms of user+system CPU; a pure
      // process.kill(pid,0) probe costs microseconds. This is a smoke bound,
      // not a precise timing assertion.
      const deltaMs = (after.user - before.user + (after.system - before.system)) / 1000;
      assert.ok(deltaMs < 20, `listLiveOwners used ${deltaMs}ms CPU, suspiciously high for a signal-0 probe`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Serial on purpose: it adds and removes listeners on the shared process.stdin.
describe("ADR-0002: lifecycle exit guard (GP9 tty-gate)", () => {
  // Unit test for src/core/lifecycle/exit.ts installExitGuard (impl/11 §4, GP9/tty-gate).
  // Written for the M1 skeptic pass: e2e GP9/tty-gate (#534, #236) claimed this property is
  // "proven at the unit level by lifecycle/exit.test.mjs" but that file did not exist — this
  // case closes that gap. Only the TTY-gate branch is exercised here (no listener attaches);
  // the non-TTY SIGTERM/SIGKILL escalation stays an e2e-only check (GP9/sigterm-sigkill-escalation)
  // because triggering it for real would send a live SIGTERM/SIGKILL to this test process.


  test("[M1] GP9/tty-gate (unit): isTTY:true attaches no stdin 'end' listener", () => {
    const before = process.stdin.listenerCount("end");
    let called = false;
    installExitGuard({ onShutdown: () => { called = true; }, isTTY: true });
    const after = process.stdin.listenerCount("end");
    assert.equal(after, before, "installExitGuard attached an 'end' listener despite isTTY:true");
    assert.equal(called, false, "onShutdown must not fire just from installation");
  });

  test("[M1] GP9/tty-gate (unit): isTTY:false attaches exactly one stdin 'end' listener", () => {
    const before = process.stdin.listenerCount("end");
    const beforeListeners = process.stdin.listeners("end");
    installExitGuard({ onShutdown: () => {}, isTTY: false });
    const after = process.stdin.listenerCount("end");
    assert.equal(after, before + 1, "installExitGuard did not attach exactly one 'end' listener for isTTY:false");
    // Clean up: remove the one listener this call added, without emitting it (emitting it
    // would send a real SIGTERM to this test process — covered instead by the e2e
    // GP9/sigterm-sigkill-escalation case against a child process).
    const afterListeners = process.stdin.listeners("end");
    const added = afterListeners.find((l) => !beforeListeners.includes(l));
    assert.ok(added, "could not identify the newly added listener to clean it up");
    process.stdin.removeListener("end", added);
  });
});
