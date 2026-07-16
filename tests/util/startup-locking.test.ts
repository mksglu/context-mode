import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  applyWALPragmas,
  loadDatabase,
  openDatabaseWithWAL,
  SQLiteBase,
} from "../../src/db-base.js";

const scratchDirs: string[] = [];
const workerPath = resolve("tests/fixtures/concurrent-db-startup-worker.ts");

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.doUnmock("../../src/db-base.js");
  vi.resetModules();
  while (scratchDirs.length > 0) {
    rmSync(scratchDirs.pop()!, { recursive: true, force: true });
  }
});

describe("startup SQLITE_BUSY retry boundaries", () => {
  it("ContentStore retries fake-DB WAL, schema, and migration lock failures", async () => {
    const state = {
      journalCalls: 0,
      schemaCalls: 0,
      filePathAlterCalls: 0,
      contentHashAlterCalls: 0,
    };

    class FakeDatabase {
      pragma(source: string): unknown {
        if (source === "journal_mode = WAL") {
          state.journalCalls++;
          if (state.journalCalls === 1) {
            throw new Error("SQLITE_BUSY: database is locked during WAL setup");
          }
        }
        return undefined;
      }

      exec(sql: string): this {
        if (sql.includes("CREATE TABLE IF NOT EXISTS sources")) {
          state.schemaCalls++;
          if (state.schemaCalls === 1) {
            throw new Error("database is locked during schema creation");
          }
        } else if (sql.includes("ALTER TABLE sources ADD COLUMN file_path")) {
          state.filePathAlterCalls++;
          if (state.filePathAlterCalls === 1) {
            throw new Error("SQLITE_BUSY: migration lock");
          }
        } else if (sql.includes("ALTER TABLE sources ADD COLUMN content_hash")) {
          state.contentHashAlterCalls++;
          throw new Error("duplicate column name: content_hash");
        }
        return this;
      }

      prepare(_sql: string) {
        return {
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
          get: () => undefined,
          all: () => [],
          iterate: () => [][Symbol.iterator](),
        };
      }

      transaction<T extends (...args: never[]) => unknown>(fn: T): T {
        return fn;
      }

      close(): void {}
    }

    vi.doMock("../../src/db-base.js", async () => {
      const actual = await vi.importActual<typeof import("../../src/db-base.js")>(
        "../../src/db-base.js",
      );
      return {
        ...actual,
        loadDatabase: () => FakeDatabase,
      };
    });

    const { ContentStore } = await import("../../src/store.js");
    const store = new ContentStore(join(scratch("ctx-startup-fake-"), "content.db"));
    store.close();

    expect(state.journalCalls).toBe(2);
    expect(state.schemaCalls).toBe(3);
    expect(state.filePathAlterCalls).toBe(2);
    expect(state.contentHashAlterCalls).toBe(1);
  });

  it("SessionDB migration lets SQLITE_BUSY reach the outer retry and ignores only duplicate columns", async () => {
    const { applyMissingSessionEventsColumns } = await import("../../src/session/db.js");
    const { withRetry } = await import("../../src/db-base.js");
    let alterCalls = 0;
    const fakeDb = {
      pragma: () => [
        { name: "attribution_source" },
        { name: "attribution_confidence" },
        { name: "bytes_avoided" },
        { name: "bytes_returned" },
      ],
      exec: (sql: string) => {
        if (sql.includes("ADD COLUMN project_dir")) {
          alterCalls++;
          if (alterCalls === 1) throw new Error("SQLITE_BUSY: migration lock");
          if (alterCalls === 2) throw new Error("duplicate column name: project_dir");
        }
      },
    };

    expect(() => applyMissingSessionEventsColumns(fakeDb)).toThrow(/SQLITE_BUSY/);
    expect(withRetry(() => applyMissingSessionEventsColumns(fakeDb), [0])).toBe(false);
    expect(alterCalls).toBe(2);

    expect(() => applyMissingSessionEventsColumns({
      pragma: fakeDb.pragma,
      exec: () => { throw new Error("SQLITE_IOERR: disk I/O error"); },
    })).toThrow(/SQLITE_IOERR/);
  });

  it("startup wrappers cover only WAL and schema initialization", () => {
    const dbBase = readFileSync(resolve("src/db-base.ts"), "utf8");
    const store = readFileSync(resolve("src/store.ts"), "utf8");
    const baseCtor = dbBase.slice(
      dbBase.indexOf("constructor(dbPath: string)"),
      dbBase.indexOf("protected abstract initSchema"),
    );
    const storeCtor = store.slice(
      store.indexOf("constructor(dbPath?: string)"),
      store.indexOf("/** Delete this session's DB files"),
    );

    expect(baseCtor).toContain("openDatabaseWithWAL(Database, dbPath, { timeout: 30000 })");
    expect(baseCtor).toContain("withRetry(() => this.initSchema())");
    expect(storeCtor).toContain("openDatabaseWithWAL(Database, this.#dbPath, { timeout: 30000 })");
    expect(storeCtor).toContain("withRetry(() => this.#initSchema())");
    expect(baseCtor).not.toMatch(/locking_mode\s*=\s*EXCLUSIVE/i);
    expect(storeCtor).not.toMatch(/locking_mode\s*=\s*EXCLUSIVE/i);
  });

  it("closes an opened handle when WAL initialization fails", () => {
    let closeCalls = 0;
    class FailingWalDatabase {
      pragma(source: string): unknown {
        if (source === "journal_mode = WAL") {
          throw new Error("SQLITE_IOERR: WAL setup failed");
        }
        return undefined;
      }
      close(): void { closeCalls++; }
    }

    expect(() => openDatabaseWithWAL(
      FailingWalDatabase as unknown as ReturnType<typeof loadDatabase>,
      join(scratch("ctx-wal-close-"), "wal.db"),
    )).toThrow(/WAL setup failed/);
    expect(closeCalls).toBe(1);
  });

  it("closes ContentStore handles after schema, destructive migration, and prepare failures", async () => {
    let failure: "schema" | "destructive migration" | "prepare" = "schema";
    let closeCalls = 0;

    class FailingDatabase {
      pragma(): unknown { return undefined; }
      exec(sql: string): this {
        if (failure === "schema" && sql.includes("CREATE TABLE IF NOT EXISTS sources")) {
          throw new Error("schema failure");
        }
        if (failure === "destructive migration" && sql.includes("CREATE VIRTUAL TABLE chunks USING")) {
          throw new Error("already exists midway through destructive migration");
        }
        return this;
      }
      prepare(sql: string) {
        if (failure === "prepare" && sql.startsWith("INSERT INTO sources")) {
          throw new Error("prepare failure");
        }
        return {
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
          get: () => undefined,
          all: () => failure === "destructive migration" ? [{ name: "title" }] : [],
          iterate: () => [][Symbol.iterator](),
        };
      }
      transaction<T extends (...args: never[]) => unknown>(fn: T): T { return fn; }
      close(): void { closeCalls++; }
    }

    vi.doMock("../../src/db-base.js", async () => {
      const actual = await vi.importActual<typeof import("../../src/db-base.js")>(
        "../../src/db-base.js",
      );
      return { ...actual, loadDatabase: () => FailingDatabase };
    });

    for (const phase of ["schema", "destructive migration", "prepare"] as const) {
      failure = phase;
      vi.resetModules();
      const { ContentStore } = await import("../../src/store.js");
      expect(() => new ContentStore(join(scratch(`ctx-${phase.replace(" ", "-")}-close-`), "content.db")))
        .toThrow(new RegExp(phase));
    }
    expect(closeCalls).toBe(3);
  });

  it("releases SQLiteBase handles after schema and prepare failures", () => {
    class SchemaFailureDB extends SQLiteBase {
      protected initSchema(): void { throw new Error("schema failure"); }
      protected prepareStatements(): void {}
    }
    class PrepareFailureDB extends SQLiteBase {
      protected initSchema(): void { this.db.exec("CREATE TABLE test (id INTEGER)"); }
      protected prepareStatements(): void { throw new Error("prepare failure"); }
    }

    for (const [name, DB] of [
      ["schema", SchemaFailureDB],
      ["prepare", PrepareFailureDB],
    ] as const) {
      const dbPath = join(scratch(`ctx-base-${name}-close-`), "base.db");
      expect(() => new DB(dbPath)).toThrow(new RegExp(`${name} failure`));
      // This is the Windows lock-leak regression check: removing an opened DB
      // fails with EBUSY/EPERM if the failed constructor left its handle open.
      rmSync(dbPath, { force: true });
      expect(existsSync(dbPath)).toBe(false);
    }
  });
});

async function waitForReady(readyDir: string, count: number, children: ChildProcess[]): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (existsSync(readyDir) && readdirSync(readyDir).length === count) return;
    const earlyExit = children.find((child) => child.exitCode !== null);
    if (earlyExit) {
      throw new Error(`startup worker exited before barrier (code ${earlyExit.exitCode})`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(`timed out waiting for ${count} startup workers`);
}

async function runConcurrentColdStart(
  mode: "session" | "store" | "pi",
  count = 6,
  seed?: (dbPath: string) => void,
): Promise<string> {
  const root = scratch(`ctx-${mode}-cold-start-`);
  const readyDir = join(root, "ready");
  const startPath = join(root, "start");
  const dbPath = join(root, `${mode}.db`);
  const projectDir = join(root, "project");
  mkdirSync(readyDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  seed?.(dbPath);

  const children = Array.from({ length: count }, (_, index) =>
    spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        workerPath,
        mode,
        dbPath,
        join(readyDir, String(index)),
        startPath,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: root,
          USERPROFILE: root,
          PI_PROJECT_DIR: projectDir,
          PI_WORKSPACE_DIR: projectDir,
          PWD: projectDir,
          CONTEXT_MODE_DISABLE_VERSION_CHECK: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    ),
  );

  const completions = children.map(
    (child) =>
      new Promise<{ code: number | null; stderr: string }>((resolveChild, rejectChild) => {
        let stderr = "";
        child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
        child.once("error", rejectChild);
        child.once("close", (code) => resolveChild({ code, stderr }));
      }),
  );

  try {
    await waitForReady(readyDir, count, children);
    writeFileSync(startPath, "go");
    const results = await Promise.all(completions);
    const failures = results.filter((result) => result.code !== 0);
    expect(failures, failures.map((result) => result.stderr).join("\n")).toEqual([]);
    return dbPath;
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill();
    }
  }
}

function seedLegacySessionSchema(dbPath: string): void {
  const Database = loadDatabase();
  const db = new Database(dbPath);
  try {
    applyWALPragmas(db);
    db.exec(`
      CREATE TABLE session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 2,
        data TEXT NOT NULL,
        source_hook TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        data_hash TEXT GENERATED ALWAYS AS (data) STORED
      );
    `);
  } finally {
    db.close();
  }
}

function seedLegacyContentSchema(dbPath: string): void {
  const Database = loadDatabase();
  const db = new Database(dbPath);
  try {
    applyWALPragmas(db);
    db.exec(`
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        code_chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE VIRTUAL TABLE chunks USING fts5(
        title, content, source_id UNINDEXED, content_type UNINDEXED,
        tokenize='porter unicode61'
      );
      CREATE VIRTUAL TABLE chunks_trigram USING fts5(
        title, content, source_id UNINDEXED, content_type UNINDEXED,
        tokenize='trigram'
      );
      CREATE TABLE vocabulary (word TEXT PRIMARY KEY);
      CREATE INDEX idx_sources_label ON sources(label);
    `);
  } finally {
    db.close();
  }
}

describe("multi-process cold-start concurrency", () => {
  it("opens one new SessionDB from concurrent processes", async () => {
    await runConcurrentColdStart("session");
  }, 60_000);

  it("opens one new ContentStore from concurrent processes", async () => {
    await runConcurrentColdStart("store");
  }, 60_000);

  it("transactionally migrates a legacy SessionDB from concurrent processes", async () => {
    const dbPath = await runConcurrentColdStart("session", 6, seedLegacySessionSchema);
    const Database = loadDatabase();
    const db = new Database(dbPath, { readonly: true });
    try {
      const columns = db.pragma("table_xinfo(session_events)") as Array<{ name: string; hidden: number }>;
      expect(columns.find((column) => column.name === "data_hash")?.hidden).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM session_meta").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  }, 60_000);

  it("transactionally migrates a legacy ContentStore from concurrent processes", async () => {
    const dbPath = await runConcurrentColdStart("store", 6, seedLegacyContentSchema);
    const Database = loadDatabase();
    const db = new Database(dbPath, { readonly: true });
    try {
      const columns = db.prepare("SELECT name FROM pragma_table_xinfo('chunks')").all() as Array<{ name: string }>;
      const trigramColumns = db.prepare("SELECT name FROM pragma_table_xinfo('chunks_trigram')").all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toContain("source_category");
      expect(trigramColumns.map((column) => column.name)).toContain("source_category");
      expect(db.prepare("SELECT COUNT(*) AS count FROM sources").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  }, 60_000);

  it("registers Pi concurrently against one new per-project SessionDB", async () => {
    await runConcurrentColdStart("pi");
  }, 60_000);
});
