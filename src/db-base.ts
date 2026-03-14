/**
 * db-base — Reusable SQLite infrastructure for context-mode packages.
 *
 * Provides lazy-loading of better-sqlite3, WAL pragma setup, prepared
 * statement caching interface, and DB file cleanup helpers. Both
 * ContentStore and SessionDB build on top of these primitives.
 */

import type DatabaseConstructor from "better-sqlite3";
import type { Database as DatabaseInstance } from "better-sqlite3";
import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

/**
 * Explicit interface for cached prepared statements that accept varying
 * parameter counts. better-sqlite3's generic `Statement` collapses under
 * `ReturnType` to a single-param signature, so we define our own.
 */
export interface PreparedStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  iterate(...params: unknown[]): IterableIterator<unknown>;
}

// ─────────────────────────────────────────────────────────
// Lazy loader
// ─────────────────────────────────────────────────────────

let _Database: typeof DatabaseConstructor | null = null;

/**
 * Lazy-load better-sqlite3. Only resolves the native module on first call.
 * This allows the MCP server to start instantly even when the native addon
 * is not yet installed (marketplace first-run scenario).
 */
export function loadDatabase(): typeof DatabaseConstructor {
  if (!_Database) {
    const require = createRequire(import.meta.url);
    _Database = require("better-sqlite3") as typeof DatabaseConstructor;
  }
  return _Database;
}

// ─────────────────────────────────────────────────────────
// WAL setup
// ─────────────────────────────────────────────────────────

/**
 * Apply WAL mode and NORMAL synchronous pragma to a database instance.
 * Should be called immediately after opening a new database connection.
 *
 * WAL mode provides:
 * - Concurrent readers while a write is in progress
 * - Dramatically faster writes (no full-page sync on each commit)
 * NORMAL synchronous is safe under WAL and avoids an extra fsync per
 * transaction.
 */
export function applyWALPragmas(db: DatabaseInstance): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
}

// ─────────────────────────────────────────────────────────
// DB file helpers
// ─────────────────────────────────────────────────────────

/**
 * Delete all three SQLite files for a given db path (main, WAL, SHM).
 * Silently ignores individual deletion errors so a partial cleanup
 * does not abort the rest.
 */
export function deleteDBFiles(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + suffix);
    } catch {
      // ignore — file may not exist
    }
  }
}

/**
 * Safely close a database connection. Swallows errors so callers can
 * always call this in a finally/cleanup path without try/catch.
 */
export function closeDB(db: DatabaseInstance): void {
  try {
    // Checkpoint WAL before close to prevent contention on restart (#103)
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch { /* WAL may not be active */ }
  try {
    db.close();
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────
// Default path helper
// ─────────────────────────────────────────────────────────

/**
 * Return the default per-process DB path for context-mode databases.
 * Uses the OS temp directory and embeds the current PID so multiple
 * server instances never share a file.
 */
export function defaultDBPath(prefix: string = "context-mode"): string {
  return join(tmpdir(), `${prefix}-${process.pid}.db`);
}

// ─────────────────────────────────────────────────────────
// Base class
// ─────────────────────────────────────────────────────────

/**
 * SQLiteBase — minimal base class that handles open/close/cleanup lifecycle.
 *
 * Subclasses call `super(dbPath)` to open the database with WAL pragmas
 * applied, then implement `initSchema()` and `prepareStatements()`.
 *
 * The `db` getter exposes the raw `DatabaseInstance` to subclasses only.
 */
export abstract class SQLiteBase {
  readonly #dbPath: string;
  readonly #db: DatabaseInstance;

  constructor(dbPath: string) {
    const Database = loadDatabase();
    this.#dbPath = dbPath;
    this.#db = new Database(dbPath, { timeout: 5000 });
    applyWALPragmas(this.#db);
    this.initSchema();
    this.prepareStatements();
  }

  /** Called once after WAL pragmas are applied. Subclasses run CREATE TABLE/VIRTUAL TABLE here. */
  protected abstract initSchema(): void;

  /** Called once after schema init. Subclasses compile and cache their prepared statements here. */
  protected abstract prepareStatements(): void;

  /** Raw database instance — available to subclasses only. */
  protected get db(): DatabaseInstance {
    return this.#db;
  }

  /** The path this database was opened from. */
  get dbPath(): string {
    return this.#dbPath;
  }

  /** Close the database connection without deleting files. */
  close(): void {
    closeDB(this.#db);
  }

  /**
   * Close the connection and delete all associated DB files (main, WAL, SHM).
   * Call on process exit or at end of session lifecycle.
   */
  cleanup(): void {
    closeDB(this.#db);
    deleteDBFiles(this.#dbPath);
  }
}
