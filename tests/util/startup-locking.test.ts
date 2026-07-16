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

    expect(baseCtor).toContain("withRetry(() => applyWALPragmas(db))");
    expect(baseCtor).toContain("withRetry(() => this.initSchema())");
    expect(storeCtor).toContain("withRetry(() => applyWALPragmas(db))");
    expect(storeCtor).toContain("withRetry(() => this.#initSchema())");
    expect(baseCtor).not.toMatch(/locking_mode\s*=\s*EXCLUSIVE/i);
    expect(storeCtor).not.toMatch(/locking_mode\s*=\s*EXCLUSIVE/i);
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

async function runConcurrentColdStart(mode: "session" | "store" | "pi", count = 6): Promise<void> {
  const root = scratch(`ctx-${mode}-cold-start-`);
  const readyDir = join(root, "ready");
  const startPath = join(root, "start");
  const dbPath = join(root, `${mode}.db`);
  const projectDir = join(root, "project");
  mkdirSync(readyDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

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
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill();
    }
  }
}

describe("multi-process cold-start concurrency", () => {
  it("opens one new SessionDB from concurrent processes", async () => {
    await runConcurrentColdStart("session");
  }, 60_000);

  it("opens one new ContentStore from concurrent processes", async () => {
    await runConcurrentColdStart("store");
  }, 60_000);

  it("registers Pi concurrently against one new per-project SessionDB", async () => {
    await runConcurrentColdStart("pi");
  }, 60_000);
});
