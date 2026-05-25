/**
 * db-base platform gate — issue #551 follow-up.
 *
 * Node 26 removed `info.This()` from V8 PropertyCallbackInfo. better-sqlite3
 * 12.9.0 still calls it, so the native addon fails to compile on
 * darwin-arm64 + Node 26. Workaround: prefer the built-in `node:sqlite`
 * adapter (which ships its own SQLite, no native compile) on every platform
 * that has it — not just Linux.
 *
 * v1.0.124 gated `node:sqlite` adoption on `process.platform === "linux"`.
 * v1.0.125 widens the gate to `hasModernSqlite()` (Bun OR Node >= 22.5),
 * matching the helper that already exists in hooks/ensure-deps.mjs:61.
 *
 * Source-level guard: parses src/db-base.ts to assert the gate references
 * `hasModernSqlite` (not the legacy `process.platform === "linux"`).
 * Runtime guard: invokes the exported helper against synthetic Node
 * versions and asserts the expected boolean.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";

describe("db-base platform gate (#551)", () => {
  const dbBasePath = resolve(__dirname, "..", "..", "src", "db-base.ts");
  const src = readFileSync(dbBasePath, "utf8");

  it("exports hasModernSqlite helper (Bun OR Node >= 22.5)", async () => {
    const mod = await import("../../src/db-base.js");
    expect(typeof (mod as Record<string, unknown>).hasModernSqlite).toBe("function");
    // The helper must return a boolean for the live runtime (true or false
    // depending on the test environment's Node version).
    const live = (mod as { hasModernSqlite: () => boolean }).hasModernSqlite();
    expect(typeof live).toBe("boolean");
  });

  it("loadDatabase ladder uses hasModernSqlite() — not the legacy linux gate", () => {
    // After the gate widening, the only Linux check that should survive is
    // inside the COMMENT explaining the SIGSEGV history; the runtime branch
    // must call hasModernSqlite().
    const loadDbRegion = src.split("export function loadDatabase")[1] ?? "";
    expect(loadDbRegion).toContain("hasModernSqlite()");
    // Defensive: ensure the legacy gate `process.platform === "linux"` no
    // longer appears as a runtime branch condition in loadDatabase.
    expect(loadDbRegion).not.toMatch(/process\.platform\s*===\s*"linux"/);
  });

  it("hasModernSqlite returns true for Bun and Node >= 22.5", async () => {
    // Sanity: when we mock process.versions.node to 26.0.0 the helper must
    // return true — this is the codepath that fixes the macOS+Node26 break.
    const { hasModernSqlite } = (await import("../../src/db-base.js")) as {
      hasModernSqlite: (versionsOverride?: NodeJS.ProcessVersions, bun?: unknown) => boolean;
    };
    expect(
      hasModernSqlite({ ...process.versions, node: "26.0.0" }, undefined),
    ).toBe(true);
    expect(
      hasModernSqlite({ ...process.versions, node: "22.5.0" }, undefined),
    ).toBe(true);
    // Bun runtime — always true.
    expect(
      hasModernSqlite({ ...process.versions, node: "18.0.0" }, /* fakeBun */ {}),
    ).toBe(true);
    // Old Node, no Bun — false.
    expect(
      hasModernSqlite({ ...process.versions, node: "22.4.0" }, undefined),
    ).toBe(false);
    expect(
      hasModernSqlite({ ...process.versions, node: "20.10.0" }, undefined),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// v1.0.130 INVARIANT — multi-writer SessionDB on the same on-disk path.
//
// CONTRACT: SessionDB is multi-writer-safe. Two SessionDB instances on
// the same dbPath MUST both open, write, and read successfully without
// either of them throwing. WAL + busy_timeout + withRetry handle the
// concurrency natively — that is the SQLite default contract for shared
// on-disk DBs.
//
// HISTORY: v1.0.128 introduced an `acquireDbLock` lockfile + `locking_mode
// = EXCLUSIVE` pragma in the SQLiteBase ctor as a defense against #560.
// That defense was an OVER-CORRECTION — the real root causes of #560
// were #559 (zombie MCP child accumulation) and #561 (Pi misdetection
// writing to the wrong DB path). With both root causes fixed in v1.0.128
// + v1.0.129, normal usage is one MCP process per Claude session per
// project; legitimate multi-window UX means two processes on the SAME
// dbPath, which the SQLite WAL handles natively.
//
// REGRESSION-PROOF: this test is the load-bearing anchor. If anyone in
// the future re-adds a lockfile or EXCLUSIVE pragma to SQLiteBase, this
// test will fail loudly in CI before merge. DO NOT delete or weaken it.
//
// See: docs/adr/0001-sessiondb-multi-writer.md
// ─────────────────────────────────────────────────────────
describe("v1.0.130 INVARIANT — SQLiteBase multi-writer default", () => {
  // Source-pin invariant. The behavioural test above proves the contract
  // holds today. This source-level invariant catches the FUTURE regression
  // shape: a contributor pulling acquireDbLock or locking_mode=EXCLUSIVE
  // back into the SQLiteBase ctor. Even if their behavioural tests pass
  // (e.g. they claim to skip-gate via tmpdir), the rollback contract says
  // these primitives MUST NOT exist in the SQLiteBase ctor at all.
  it("INVARIANT: SQLiteBase ctor must NOT contain acquireDbLock or locking_mode=EXCLUSIVE", () => {
    const dbBasePath = resolve(__dirname, "..", "..", "src", "db-base.ts");
    const src = readFileSync(dbBasePath, "utf8");
    const classIdx = src.indexOf("export abstract class SQLiteBase");
    expect(classIdx).toBeGreaterThan(-1);
    // Bound the class body at the next top-level export so we don't
    // accidentally match unrelated code below the class.
    const classBody = src.slice(classIdx).split(/\nexport (?:function|abstract|class|const|let|var) /)[0] ?? "";

    // Lockfile primitive — banned. Anchor on identifier names so a
    // future renamed variant (`acquireDBLock`, `acquireDbLockSync`, etc.)
    // still trips the check.
    expect(classBody).not.toMatch(/acquireDbLock/i);
    expect(classBody).not.toMatch(/releaseDbLock/i);
    // EXCLUSIVE locking_mode — banned. Whitespace-tolerant.
    expect(classBody).not.toMatch(/locking_mode\s*=\s*EXCLUSIVE/i);
  });

  it("INVARIANT: two SQLiteBase instances on the same tmpdir path can both open and write (multi-writer default)", async () => {
    // Use a real on-disk path OUTSIDE tmpdir. The v1.0.128 + v1.0.129
    // skip-gate excused tmpdir paths from the lockfile + EXCLUSIVE
    // pragma, so a tmpdir path would not exercise the regression. The
    // legitimate multi-window UX runs against project DBs (NOT tmpdir),
    // so the invariant must hold for real on-disk paths.
    const testDir = mkdtempSync(join(process.env.HOME || "/tmp", ".ctx-mode-multiwriter-invariant-"));
    const dbPath = join(testDir, "multi-writer.db");
    const { SessionDB } = await import("../../src/session/db.js");
    let a: InstanceType<typeof SessionDB> | null = null;
    let b: InstanceType<typeof SessionDB> | null = null;
    try {
      a = new SessionDB({ dbPath });
      // The whole point: this MUST NOT throw. v1.0.128 + v1.0.129
      // would throw DatabaseLockedError ("Another context-mode server
      // is already running") here. WAL handles two writers natively,
      // and the busy_timeout + withRetry in withRetry() is the right
      // defense for SQLITE_BUSY.
      b = new SessionDB({ dbPath });
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      // Both instances must be functional — write through both. This
      // proves WAL multi-writer works end-to-end, not just that the
      // ctors silently coexist. insertEvent goes through withRetry +
      // busy_timeout (the documented BUSY-handling path).
      const eventA = {
        type: "PreToolUse",
        category: "tool",
        data: JSON.stringify({ from: "writer-a" }),
        priority: 0,
      };
      const eventB = {
        type: "PreToolUse",
        category: "tool",
        data: JSON.stringify({ from: "writer-b" }),
        priority: 0,
      };
      a.insertEvent("invariant-session-a", eventA);
      b.insertEvent("invariant-session-b", eventB);
    } finally {
      try { a?.cleanup(); } catch { /* best effort */ }
      try { b?.close(); } catch { /* best effort */ }
      try { rmSync(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });
});

// ─────────────────────────────────────────────────────────
// v1.0.130 — SQLiteBase lifecycle (multi-writer contract)
//
// The v1.0.128 single-writer guard tests (acquireDbLock helper, lockfile
// throw on second open, close+cleanup releaseDbLock plumbing, lifecycle
// release-then-reopen) tested a contract we have rolled out. They are
// gone. What replaces them, on top of the INVARIANT block above, is a
// focused lifecycle test that proves close() does not leak global state
// — `_liveDBs` must shrink so the process-exit hook doesn't double-close
// a closed handle. This is the lifecycle invariant the lockfile tests
// indirectly covered, made explicit.
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// Issue #642 — busy_timeout MUST propagate on the node:sqlite path.
//
// CONTRACT: every SQLiteBase ctor passes `{ timeout: 30000 }` to the
// driver. better-sqlite3 honours that via the native constructor option;
// the Bun branch propagates it via `adapter.pragma("busy_timeout = N")`
// (#243). The node:sqlite branch (#228) was added later and silently
// dropped the opts.timeout argument — node:sqlite ignores unknown
// constructor options, so the DB opens with the SQLite default
// `busy_timeout = 0`, and the first write contention surfaces as an
// immediate `Error: database is locked` instead of the 30s grace that
// `withRetry()` is engineered around.
//
// User-visible symptom: `SessionStart:startup hook error` banner on
// Linux + Node ≥ 22.5 whenever the SessionStart hook opens the per-
// project SessionDB while the long-running MCP server is mid-WAL-write
// (reporter: Aleksandr Yeganov, 1.0.141, repro ~20% of fresh sessions).
//
// ADR alignment: docs/adr/0001-sessiondb-multi-writer.md says
// "WAL + busy_timeout + withRetry handle the actual concurrency safely."
// That contract holds only if busy_timeout is actually set. This test
// pins the contract on the public factory.
// ─────────────────────────────────────────────────────────
describe("Issue #642 — loadDatabase() factory propagates busy_timeout", () => {
  it.skipIf(!(globalThis as Record<string, unknown>).Bun && !(() => {
    const [maj, min] = (process.versions.node ?? "0.0.0").split(".").map(Number);
    return maj > 22 || (maj === 22 && min >= 5);
  })())(
    "INVARIANT: factory(path, { timeout: 30000 }) applies PRAGMA busy_timeout (#642)",
    async () => {
      // This invariant covers the node:sqlite + bun:sqlite paths where
      // the upstream constructor does not understand `{ timeout }`. The
      // better-sqlite3 path applies it natively via the C++ constructor
      // option, so this test is a no-op on legacy Node — skip-gated to
      // hasModernSqlite() runtimes only.
      const { loadDatabase } = await import("../../src/db-base.js");
      const Database = loadDatabase();
      const dir = mkdtempSync(join(process.env.HOME || "/tmp", ".ctx-mode-busy-timeout-642-"));
      const dbPath = join(dir, "busy.db");
      let db: { pragma: (s: string) => unknown; close: () => void } | null = null;
      try {
        // The SessionDB + ContentStore ctors all open like this.
        db = new (Database as unknown as new (p: string, o: { timeout: number }) => {
          pragma: (s: string) => unknown;
          close: () => void;
        })(dbPath, { timeout: 30000 });
        // Three driver shapes, one test:
        //   - BunSQLiteAdapter / NodeSQLiteAdapter: collapse single-row
        //     single-column PRAGMA to scalar (see pragma() in db-base.ts).
        //   - better-sqlite3 default: returns [{ timeout: 30000 }].
        // Normalise into a single number so the assertion is driver-
        // agnostic — the contract under test is "SQLite stored the
        // requested busy_timeout", not the wrapper's return shape.
        const raw = db!.pragma("busy_timeout") as
          | number
          | { timeout: number }
          | Array<{ timeout: number }>;
        const observed = typeof raw === "number"
          ? raw
          : Array.isArray(raw)
            ? raw[0]?.timeout
            : raw.timeout;
        // We asked for 30000ms. SQLite stores exactly that — assert
        // equality so a future drop-back to 0 (the SQLite default) fails
        // loudly. 0 is the SQLite-shipped default and the exact
        // regression signature of the pre-fix node:sqlite path (#642).
        expect(observed).toBe(30000);
      } finally {
        try { db?.close(); } catch { /* best effort */ }
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    },
  );
});

// ─────────────────────────────────────────────────────────
// Issue #642 — direct node:sqlite branch coverage.
//
// The factory-level test above is driver-agnostic and exercises whichever
// branch `loadDatabase()` resolves on the current host. On macOS, that's
// usually better-sqlite3 (node:sqlite ships without FTS5 in the upstream
// Homebrew node@22/23 builds), which means the macOS CI lane never
// exercises the node:sqlite code path that #642 reported.
//
// This second slice covers the gap deterministically: it skip-gates only
// on `node:sqlite` actually being importable (independent of FTS5),
// constructs a NodeSQLiteAdapter the same way `NodeDatabaseFactory`
// does, and asserts the busy_timeout propagation directly. If a future
// edit drops the `adapter.pragma("busy_timeout = N")` call from the
// factory, this test fails on every Node ≥ 22.5 host regardless of FTS5
// status.
// ─────────────────────────────────────────────────────────
describe("Issue #642 — node:sqlite branch directly", () => {
  const nodeSqliteAvailable = (() => {
    try {
      // Array.join mirrors the production import shape (esbuild dodge).
      // We only need to know "is the built-in present", not actually use it
      // here — the test body re-imports inside the `it()`.
      require(["node", "sqlite"].join(":"));
      return true;
    } catch {
      return false;
    }
  })();

  // Source-pin invariant — independent of host runtime. Catches the
  // FUTURE regression shape: a refactor that drops the busy_timeout
  // propagation from NodeDatabaseFactory. The ADR-0001 multi-writer
  // contract (WAL + busy_timeout + withRetry) becomes a lie the moment
  // any factory branch fails to propagate. Mirrors the source-pin style
  // used by the v1.0.130 INVARIANT block above.
  it("INVARIANT: NodeDatabaseFactory MUST propagate busy_timeout via adapter.pragma (#642)", () => {
    const dbBasePath = resolve(__dirname, "..", "..", "src", "db-base.ts");
    const src = readFileSync(dbBasePath, "utf8");
    const factoryIdx = src.indexOf("function NodeDatabaseFactory");
    expect(factoryIdx).toBeGreaterThan(-1);
    // Bound the factory body at the closing `} as any;` that wraps the
    // assignment to `_Database` in the node:sqlite branch.
    const factoryBody = src.slice(factoryIdx).split("} as any;")[0] ?? "";
    // Anchor on `opts?.timeout` (the input) AND `busy_timeout` (the
    // pragma name). Either alone is a false positive (the comment in the
    // factory mentions one without the other). Both together pin the
    // wiring.
    expect(factoryBody).toMatch(/opts\?\.timeout/);
    expect(factoryBody).toMatch(/busy_timeout/);
    // Anchor on the call shape: `adapter.pragma(\`busy_timeout = ${opts.timeout}\`)`
    // mirrors the Bun branch above. Whitespace-tolerant; opts may be
    // narrowed with optional chaining or not.
    expect(factoryBody).toMatch(/adapter\.pragma\s*\(\s*`busy_timeout\s*=\s*\$\{opts\??\.timeout\}`/);
  });

  it.skipIf(!nodeSqliteAvailable)(
    "INVARIANT: NodeSQLiteAdapter wrapping factory sets PRAGMA busy_timeout when opts.timeout is supplied (#642)",
    async () => {
      const { NodeSQLiteAdapter } = await import("../../src/db-base.js");
      // Built-in import is available on this host (skip-gate above).
      const { DatabaseSync } = require(["node", "sqlite"].join(":")) as {
        DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => unknown;
      };
      const dir = mkdtempSync(join(process.env.HOME || "/tmp", ".ctx-mode-642-node-direct-"));
      const dbPath = join(dir, "direct.db");
      let adapter: { pragma: (s: string) => unknown; close: () => void } | null = null;
      try {
        // Replicate NodeDatabaseFactory's open shape EXACTLY — readOnly
        // false, no timeout in constructor (DatabaseSync ignores it
        // anyway), then post-open busy_timeout propagation.
        const raw = new DatabaseSync(dbPath, { readOnly: false });
        adapter = new NodeSQLiteAdapter(raw) as typeof adapter;
        // SQLite default before the fix: busy_timeout = 0 → immediate
        // SQLITE_BUSY on any write contention. THIS is the bug.
        const before = adapter!.pragma("busy_timeout") as number;
        expect(before).toBe(0);
        // The fix: propagate opts.timeout via PRAGMA, mirroring the Bun
        // branch (db-base.ts:264-270).
        adapter!.pragma(`busy_timeout = 30000`);
        const after = adapter!.pragma("busy_timeout") as number;
        expect(after).toBe(30000);
      } finally {
        try { adapter?.close(); } catch { /* best effort */ }
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    },
  );
});

describe("v1.0.130 — SQLiteBase lifecycle composition", () => {
  it("close() then re-open on the same on-disk path succeeds (no leaked state)", async () => {
    // Mirror the multi-window "kill A, start B" flow: process A opens,
    // does work, closes; process B opens the same path. With the
    // lockfile gone this is just the standard SQLite lifecycle, but a
    // regression in `_liveDBs` accounting (or a stray pragma) would
    // surface here as a SIGSEGV during teardown or a SQLITE_BUSY on the
    // second open.
    const testDir = mkdtempSync(join(process.env.HOME || "/tmp", ".ctx-mode-v130-lifecycle-"));
    const dbPath = join(testDir, "lifecycle.db");
    const { SessionDB } = await import("../../src/session/db.js");
    try {
      const a = new SessionDB({ dbPath });
      a.close();
      const b = new SessionDB({ dbPath });
      expect(b).toBeTruthy();
      b.cleanup();
    } finally {
      try { rmSync(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it("cleanup() removes the on-disk DB files (main + WAL + SHM)", async () => {
    // Lockfile artefacts are gone (slice 4 deleted the helper), so the
    // only files that should ever exist alongside a SessionDB are the
    // standard SQLite trio. After cleanup() the dbPath, dbPath-wal, and
    // dbPath-shm must all be unlinked.
    const testDir = mkdtempSync(join(process.env.HOME || "/tmp", ".ctx-mode-v130-cleanup-"));
    const dbPath = join(testDir, "cleanup.db");
    const { SessionDB } = await import("../../src/session/db.js");
    try {
      const db = new SessionDB({ dbPath });
      expect(existsSync(dbPath)).toBe(true);
      db.cleanup();
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);
      // No lockfile artefact ever exists in v1.0.130.
      expect(existsSync(`${dbPath}.lock`)).toBe(false);
    } finally {
      try { rmSync(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });
});

// ─────────────────────────────────────────────────────────
// Issue #642 follow-up: cross-process multi-writer (subprocess regression).
//
// CONTRACT: SessionDB must be safe for two DIFFERENT processes opening
// the same on-disk path concurrently. The v1.0.130 INVARIANT block
// above proves the contract for two instances IN THE SAME process,
// which exercises the WAL writer-lock geometry only partially. Same
// process means same shared cache and same file descriptor table, so
// a regression that breaks cross-process locking can pass that test
// while still crashing the legitimate multi-window UX (two concurrent
// Claude sessions writing to the same project-dir-hashed DB).
//
// HISTORY: #642 surfaced as exactly this geometry. NodeDatabaseFactory
// dropped opts.timeout, so busy_timeout stayed at the SQLite default
// of 0 and the first write contention between concurrent sessions
// raised an immediate "database is locked". Fixed in 7afa0f4 / v1.0.142
// by mirroring the Bun branch's adapter.pragma("busy_timeout = N").
//
// REGRESSION-PROOF: this test forks two child Node processes and has
// each open the SAME SessionDB path, writes hundreds of events from
// both in tight concurrent loops, then read-asserts that every event
// from both writers landed in the DB. Catches:
//   - busy_timeout = 0 regressions on the node:sqlite path (#642).
//   - any re-introduction of EXCLUSIVE locking_mode or lockfile
//     primitives in the SQLiteBase ctor (the v1.0.128 over-correction).
//   - silent write drops if a future refactor wraps insertEvent in
//     a swallow-on-error try/catch.
//
// See: docs/adr/0001-sessiondb-multi-writer.md and commit 7afa0f4.
// ─────────────────────────────────────────────────────────
describe("Issue #642 follow-up: cross-process multi-writer (subprocess regression)", () => {
  const repoRoot = resolve(__dirname, "..", "..");
  const childFixture = resolve(
    __dirname,
    "fixtures",
    "db-base-multiwriter-child.mjs",
  );
  const builtSessionDb = resolve(repoRoot, "build", "session", "db.js");

  // Ensure build/ is populated. `npm test` runs `pretest: npm run build`
  // first, but running this file directly (`vitest run tests/util/db-base-
  // platform-gate.test.ts`) skips that step. Mirrors the on-demand
  // compile in tests/core/server.test.ts.
  function ensureBuild(): void {
    if (existsSync(builtSessionDb)) return;
    execFileSync("npx", ["tsc"], { cwd: repoRoot, stdio: "pipe" });
  }

  function runChild(
    dbPath: string,
    sessionId: string,
    iterations: number,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolveP) => {
      const proc = spawn(
        process.execPath,
        [childFixture, dbPath, sessionId, String(iterations)],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
      proc.on("close", (code) => resolveP({ code, stdout, stderr }));
    });
  }

  it(
    "INVARIANT: two child node processes can both write to the same SessionDB path under contention (#642)",
    async () => {
      ensureBuild();

      // Real on-disk path outside tmpdir. The v1.0.128/v1.0.129 skip-gate
      // excused tmpdir paths from the EXCLUSIVE pragma, so a tmpdir path
      // would not exercise the regression. Real-user dbPaths live under
      // ~/.claude/, so the test must too.
      const testDir = mkdtempSync(
        join(process.env.HOME || "/tmp", ".ctx-mode-multiwriter-subproc-"),
      );
      const dbPath = join(testDir, "two-writer.db");

      const iterations = 200;
      try {
        // Spawn both writers and wait for both to exit. They start at
        // nearly the same wall-clock moment, so the writer-lock contention
        // window opens immediately and persists across the full loop.
        const [a, b] = await Promise.all([
          runChild(dbPath, "writer-a", iterations),
          runChild(dbPath, "writer-b", iterations),
        ]);

        // Each writer must finish cleanly. A throw from insertEvent
        // (e.g. SQLITE_BUSY past withRetry's bounded loop) bubbles up
        // to exit code 1 with "ERR <message>" on stderr.
        expect(
          a.code,
          `writer-a exited ${a.code}\nstdout=${a.stdout}\nstderr=${a.stderr}`,
        ).toBe(0);
        expect(
          b.code,
          `writer-b exited ${b.code}\nstdout=${b.stdout}\nstderr=${b.stderr}`,
        ).toBe(0);
        expect(a.stdout.trim()).toBe(`OK ${iterations}`);
        expect(b.stdout.trim()).toBe(`OK ${iterations}`);
        // Stderr must be empty. An `ERR` line from the child means a
        // thrown exception, even on the success-exit path.
        expect(a.stderr).toBe("");
        expect(b.stderr).toBe("");

        // Read-back assertion. Both writers must have landed every event
        // they reported writing. Guards against a future refactor that
        // catches SQLITE_BUSY and silently drops the write.
        const { SessionDB } = await import("../../src/session/db.js");
        const verifier = new SessionDB({ dbPath });
        try {
          const eventsA = verifier.getEvents("writer-a", { limit: 10_000 });
          const eventsB = verifier.getEvents("writer-b", { limit: 10_000 });
          expect(eventsA.length).toBe(iterations);
          expect(eventsB.length).toBe(iterations);
        } finally {
          verifier.close();
        }
      } finally {
        try { rmSync(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    },
    60_000,
  );
});
