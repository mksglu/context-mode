// Viet report 1 (docs/v2/review/viet/README.md, D-CKPT-LAT-1): ctx_stats and ctx_search took ~1.45 s each on Windows, all inside
// PRAGMA wal_checkpoint(TRUNCATE) run by closeDb on a read-only handle (now PASSIVE, D-NO-TRUNCATE-1). A read-only handle writes nothing, so it has nothing to
// checkpoint. The server's own writer keeps its checkpoint on close (impl/02 §6.3), so committed data still reaches the main file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { openDb, closeDb } from "../../../src/core/store/db.ts";
import { ctxStats } from "../../../src/core/tools/stats.ts";
import { ctxSearch } from "../../../src/core/tools/search.ts";

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
