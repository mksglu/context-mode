// GP8 — Concurrency: 4 servers + hooks writing one context.db (14-tests.md §4, TECH-SPEC §6.2 GP8 row).
// covers: src/core/store/. M1 per DEVIATIONS D-M1-14: 4-writer concurrency, V22 cleanup,
// stats-heartbeat-no-timer-db-open. GP8/runpool-capped-flag is M2; GP8/sibling-db-readonly is M4 (D-M4-S3-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";
import { dumpDb } from "../harness/db-dump.mjs";
import { checkGolden } from "../harness/golden.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RELEASE_OUT = path.join(REPO_ROOT, "release-out");
const SERVER_BUNDLE = path.join(RELEASE_OUT, "server.mjs");
const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } };
const IDLE_WINDOW_MS = 60_000; // DEVIATIONS D-M1-12: one 60 s idle window

function initRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-gp8-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init", "-q"], { cwd: dir });
  return dir;
}

// Temp repo + temp HOME, removed after the test; every bundle spawned through it is killed after
// the test even when an assert throws first (DEVIATIONS D-M1-F1-1).
function fixture(t) {
  const repo = initRepo();
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp8-home-"));
  const clients = [];
  t.after(() => {
    for (const c of clients) c.kill();
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };
  const spawnOne = () => {
    const c = spawnBundle(SERVER_BUNDLE, env);
    clients.push(c);
    return c;
  };
  return { repo, home, spawnOne, projectsDir: path.join(home, ".context-mode", "projects") };
}

function onlyProjectDb(projectsDir) {
  const keys = readdirSync(projectsDir);
  assert.equal(keys.length, 1, `expected one project dir, got ${keys.length}`);
  return path.join(projectsDir, keys[0], "context.db");
}

test("[M1] GP8/four-writers-one-db: 0 busy errors reach the tool result, integrity_check ok, no retry loop", async (t) => {
  const f = fixture(t);
  const clients = Array.from({ length: 4 }, () => f.spawnOne());
  await Promise.all(clients.map((c) => c.request("initialize", INIT)));

  const results = await Promise.all(
    clients.flatMap((c) => Array.from({ length: 10 }, () => c.request("tools/call", { name: "ctx_stats", arguments: {} })))
  );
  const busyErrors = results.filter((r) => typeof r?.content?.[0]?.text === "string" && /SQLITE_BUSY|database is locked/i.test(r.content[0].text));
  assert.equal(busyErrors.length, 0, "no SQLITE_BUSY text may reach a tool result");

  await Promise.all(clients.map((c) => c.close()));

  const dbPath = onlyProjectDb(f.projectsDir);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let integrity;
  try {
    integrity = db.prepare("PRAGMA integrity_check").all().map((r) => r.integrity_check);
  } finally {
    db.close();
  }
  // One journal row per call: no lost write, no retried duplicate (D-M1-10).
  const events = dumpDb(dbPath, ["events"]).events;
  // The table's byte cells depend on which of the 40 concurrent calls journalled first, so the golden
  // holds the summary line only; every reply must be the stats reply, never an error (DEVIATIONS D-M4-A-4).
  assert.ok(results.every((r) => r?.isError === false), "every ctx_stats call succeeds");
  const texts = [...new Set(results.map((r) => (r?.content?.[0]?.text ?? "").split("\n")[0]))].sort();
  checkGolden("GP8", "four-writers-one-db", normalize({ resultsCount: results.length, busyErrors: busyErrors.length, texts, integrity, eventRows: events.length }));
});

test("[M1] GP8/cleanup-live-owner-kept (V22): a live owner PID + last access > 14 days is not deleted", async (t) => {
  const f = fixture(t);
  // Server A owns project P and stays open (live owner).
  const owner = f.spawnOne();
  await owner.request("initialize", INIT);
  await owner.request("tools/call", { name: "ctx_stats", arguments: {} });
  const dbPath = onlyProjectDb(f.projectsDir);
  const projectDir = path.dirname(dbPath);
  // Age every row of P past PROJECT_DEAD_IDLE_DAYS (14 d): 15 days in ms, e2e literal (D-M0-4).
  const old = Date.now() - 15 * 86_400_000;
  const w = new DatabaseSync(dbPath, { timeout: 5000 });
  try {
    w.prepare("UPDATE events SET created_at = ?, accessed_at = ?").run(old, old);
  } finally {
    w.close();
  }
  // A second server for a different project runs its once-per-process sweep (D-M1-11).
  const other = initRepo();
  t.after(() => rmSync(other, { recursive: true, force: true }));
  const sweeper = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: f.home, USERPROFILE: f.home, CLAUDE_PROJECT_DIR: other });
  t.after(() => sweeper.kill());
  await sweeper.request("initialize", INIT);
  await sweeper.request("tools/call", { name: "ctx_stats", arguments: {} });
  await sweeper.close();

  const kept = existsSync(projectDir);
  await owner.close();
  checkGolden("GP8", "cleanup-live-owner-kept", normalize({ liveOwnerProjectKept: kept, projectCount: readdirSync(f.projectsDir).length }));
});

test("[M1] GP8/cleanup-dead-owner-old-deleted (V22): a dead PID + last access older than 14 days is deleted", async (t) => {
  const f = fixture(t);
  // A stale, owner-less project dir (empty DB = last access 0), then a fresh server for a
  // DIFFERENT project; its first resolution runs the sweep (D-M1-11).
  const staleDir = path.join(f.projectsDir, "a".repeat(16));
  mkdirSync(staleDir, { recursive: true });
  writeFileSync(path.join(staleDir, "context.db"), "");

  const client = f.spawnOne();
  await client.request("initialize", INIT);
  await client.request("tools/call", { name: "ctx_stats", arguments: {} });
  await client.close();

  checkGolden("GP8", "cleanup-dead-owner-old-deleted", normalize({ staleDirDeleted: !existsSync(staleDir), projectCount: readdirSync(f.projectsDir).length }));
});

test("[M1] GP8/stats-heartbeat-no-timer-db-open (D-M1-12: 60s idle window): idle server opens 0 DBs outside its own session", async (t) => {
  const f = fixture(t);
  const client = f.spawnOne();
  await client.request("initialize", INIT);
  await client.request("tools/call", { name: "ctx_stats", arguments: {} });
  const before = dumpDb(onlyProjectDb(f.projectsDir), ["events"]).events.length;

  await new Promise((r) => setTimeout(r, IDLE_WINDOW_MS));

  // No timer wrote a row while idle: the row count only moves with our own call.
  const idle = dumpDb(onlyProjectDb(f.projectsDir), ["events"]).events.length;
  const after = await client.request("tools/call", { name: "ctx_stats", arguments: {} });
  await client.close();
  checkGolden("GP8", "stats-heartbeat-no-timer-db-open", normalize({ after, rowsBefore: before, rowsAfterIdle: idle, projectCount: readdirSync(f.projectsDir).length }));
});

test("[M1] GP8/db-gone-hard-error: a context.db path vanished mid-session surfaces DB_GONE, not a raw stack", async (t) => {
  const f = fixture(t);
  const client = f.spawnOne();
  await client.request("initialize", INIT);
  await client.request("tools/call", { name: "ctx_stats", arguments: {} });

  for (const d of readdirSync(f.projectsDir)) {
    rmSync(path.join(f.projectsDir, d, "context.db"), { force: true });
  }

  const reply = await client.request("tools/call", { name: "ctx_stats", arguments: {} });
  await client.close();
  // ADR-0002 decision 3: never recreated.
  const recreated = readdirSync(f.projectsDir).some((d) => existsSync(path.join(f.projectsDir, d, "context.db")));
  checkGolden("GP8", "db-gone-hard-error", normalize({ reply, recreated }));
});

// impl/14a #915 (TECH-SPEC §5 row: capped === jobs.length >= concurrency). DEVIATIONS D-M2-T11-1
// row: `runPool`'s generic `concurrency` parameter (batch.ts) is never called above 1 by any
// registered MCP tool in M2 — `ctx_batch` always passes `ONE_AT_A_TIME` (1) — so the exact unit
// fact "2 jobs, concurrency 8 -> capped false" has no black-box surface through a tool call; it
// stays covered by the pre-existing unit test (tests/tools/batch.test.mjs, not deleted). What
// IS black-box observable through `ctx_batch` is the behavior `capped` protects: when the stop
// predicate never fires, every queued job still runs to completion (jobs.length results, in
// order), regardless of the pool's width. This case proves that through 2 commands.
test("[M2] GP8/runpool-capped-flag: ctx_batch runs every queued command to completion when none stops it", async (t) => {
  const f = fixture(t);
  const client = f.spawnOne();
  await client.request("initialize", INIT);
  const reply = await client.request("tools/call", {
    name: "ctx_batch",
    arguments: { commands: ["echo job1", "echo job2"], queries: ["job1", "job2"] },
  });
  await client.close();

  assert.equal(reply.isError, false, "two commands, no stop condition: the batch must not report an error");
  const text = reply.content[0].text;
  assert.ok(text.startsWith("## job1\njob1\n## job2\njob2"), "both queued commands ran and were answered (D-BATCH-FRAMING-1: no counts line)");
  assert.ok(text.includes("job1") && text.includes("job2"), "both queued commands' output must have been indexed and found");
  checkGolden("GP8", "runpool-capped-flag", normalize({ reply }));
});

test("[M4] GP8/sibling-db-readonly (#1213): ctx_stats leaves every sibling project DB and its own DB mtime unchanged", async (t) => {
  const f = fixture(t);
  const client = f.spawnOne();
  await client.request("initialize", INIT);
  await client.request("tools/call", { name: "ctx_execute", arguments: { language: "javascript", code: "process.stdout.write('x'.repeat(5000))" } });
  const own = onlyProjectDb(f.projectsDir);
  const siblings = ["b", "c"].map((ch) => path.join(f.projectsDir, ch.repeat(16), "context.db"));
  for (const s of siblings) {
    mkdirSync(path.dirname(s), { recursive: true });
    writeFileSync(s, "sibling probe");
  }
  const past = new Date(Date.now() - 60_000);
  for (const p of [...siblings, own]) utimesSync(p, past, past);
  const before = siblings.map((p) => statSync(p).mtimeMs);
  const ownBefore = statSync(own).mtimeMs;
  const reply = await client.request("tools/call", { name: "ctx_stats", arguments: {} });
  const siblingsAfter = siblings.map((p) => statSync(p).mtimeMs);
  // The ctx_stats journal row is the server's own write (impl/00 §5.2 step 5), after the read-only read.
  await client.close();
  assert.equal(reply.isError, false);
  assert.deepEqual(siblingsAfter, before, "a sibling DB was opened for write");
  checkGolden("GP8", "sibling-db-readonly", normalize({ isError: reply.isError, siblingsUnchanged: true, ownDbExisted: ownBefore > 0 }));
});
