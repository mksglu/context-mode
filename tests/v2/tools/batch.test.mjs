// Unit tests for src/core/tools/batch.ts (impl/04 §3). ctx_batch: {commands[], queries[]}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctxBatch } from "../../../src/core/tools/batch.ts";
import * as C from "../../../src/core/contracts/constants.ts";

function ctxFor(root) {
  return {
    project: { projectKey: "1".repeat(16), projectDir: join(root, "projects", "1".repeat(16)), dbPath: join(root, "projects", "1".repeat(16), "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
    sessionId: "s1", turn: 1, signal: new AbortController().signal,
  };
}

test("ctx_batch is not readOnly (it runs commands)", () => {
  assert.equal(ctxBatch.name, "ctx_batch");
  assert.equal(ctxBatch.readOnly, false);
});

test("ctxBatch runs each command and answers each query from the combined output", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-ba-"));
  try {
    const out = await ctxBatch.handler({ commands: ["echo alpha", "echo beta"], queries: ["alpha"] }, ctxFor(root));
    assert.equal(out.isError, false);
    assert.ok(out.text.includes("alpha"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ctxBatch rejects an unknown field", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-ba2-"));
  try {
    const out = await ctxBatch.handler({ commands: ["echo a"], queries: ["a"], bogus: 1 }, ctxFor(root));
    assert.equal(out.isError, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ctxBatch rejects an empty commands or queries array (min(1))", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-ba3-"));
  try {
    const out = await ctxBatch.handler({ commands: [], queries: ["a"] }, ctxFor(root));
    assert.equal(out.isError, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ctxBatch deduplicates a chunk returned as the top hit for two queries", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-ba4-"));
  try {
    const out = await ctxBatch.handler({ commands: ["echo shared-term-xyz"], queries: ["shared-term-xyz", "shared"] }, ctxFor(root));
    const occurrences = out.text.split("shared-term-xyz").length - 1;
    assert.ok(occurrences <= 2); // heading + body, not duplicated per query
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ctxBatch summary line reports command and query counts plus last exit code", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-ba5-"));
  try {
    const out = await ctxBatch.handler({ commands: ["echo a", "echo b"], queries: ["a"] }, ctxFor(root));
    assert.ok(/2 command\(s\), 1 querie\(s\), exit \d+/.test(out.text));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runPool capped === (jobs >= concurrency) (TECH-SPEC §5, #915, #932)", async () => {
  const { runPool } = await import("../../../src/core/tools/batch.ts");
  const job = (v) => () => Promise.resolve(v);
  assert.equal((await runPool([job(1)], 2, () => false)).capped, false);
  assert.equal((await runPool([job(1), job(2)], 2, () => false)).capped, true);
  const r = await runPool([job(1), job(2), job(3)], 1, (v) => v === 2);
  assert.deepEqual(r.results, [1, 2]); // a job after a stop never starts
  assert.equal(r.capped, true);
});

// D-CI-BATCH-DEADLINE-1: no wall-clock budget decides this test (a loaded Windows runner needs 2-3.5 s to start
// Git Bash, run taskkill and drain the pipes, CI run 40613700600). The child sleeps CHILD_SLEEP_S, so "bounded"
// means the handler returned while the child still had that long to run; "never start" is proven by a marker
// file the third command would write. The test timeout only ends a run whose deadline never fires.
const CHILD_SLEEP_S = 3600;
test("ctx_batch: one deadline bounds the whole handler, later commands never start (Q8, #947)", { timeout: 120000 }, async () => {
  const { runBatch } = await import("../../../src/core/tools/batch.ts");
  const root = mkdtempSync(join(tmpdir(), "cm-ba6-"));
  const marker = join(root, "third-command-ran");
  try {
    const start = Date.now();
    const out = await runBatch({ commands: ["echo before-xyz", "sleep " + CHILD_SLEEP_S, "echo after-xyz; echo ran > '" + marker.split("\\").join("/") + "'"], queries: ["before-xyz", "after-xyz"] }, ctxFor(root), 800, C.RETENTION_SIZE_CAP_BYTES);
    assert.ok(Date.now() - start < CHILD_SLEEP_S * 1000);
    assert.equal(out.isError, false);
    assert.ok(out.text.includes("Timed out after 800 ms"));
    assert.ok(out.text.includes("before-xyz"));
    assert.equal(out.text.includes("\nafter-xyz"), false);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ctx_batch: reply stays inside OUTPUT_CAP and every output byte is indexed", async () => {
  const root = mkdtempSync(join(tmpdir(), "cm-ba7-"));
  try {
    const out = await ctxBatch.handler({ commands: ["for i in $(seq 1 3000); do echo \"row $i needle\"; echo; done"], queries: ["needle", "row"] }, ctxFor(root));
    assert.ok(Buffer.byteLength(out.text) <= 16384);
    assert.ok(out.text.startsWith("1 command(s), 2 querie(s), exit 0"));
    assert.ok(out.text.trimEnd().endsWith('source:"ctx_batch:1"})'));
    assert.ok(out.sandboxBytes > 16384);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- M2-R4 named rows (14a-issue-cases.md GP4/GP5/GP8, DEVIATIONS D-M2-T11-1, D-M2-R4-1) ----
import { realpathSync } from "node:fs";
import { runBatch, runPool } from "../../../src/core/tools/batch.ts";

function tmpRoot(tag) {
  return realpathSync(mkdtempSync(join(tmpdir(), "cm-r4b-" + tag + "-")));
}

test("[M2] GP8/runpool-capped-flag: 2 jobs at concurrency 8 -> capped false; jobs >= slots -> true", async () => {
  const job = (v) => () => Promise.resolve(v);
  assert.equal((await runPool([job(1), job(2)], 8, () => false)).capped, false);
  assert.equal((await runPool(Array.from({ length: 8 }, (_, i) => job(i)), 8, () => false)).capped, true);
  const r = await runPool([job(1), job(2)], 8, () => false);
  assert.deepEqual(r.results, [1, 2]);
});

test("[M2] GP5/batch-execute-dedup-section: two queries on the same chunk show it once", async () => {
  const root = tmpRoot("dd");
  try {
    const out = await ctxBatch.handler({ commands: ["echo 'alpha zebraquartz omega'"], queries: ["zebraquartz", "alpha zebraquartz"] }, ctxFor(root));
    assert.equal(out.isError, false);
    const bodyLines = out.text.split("\n").filter((l) => l === "alpha zebraquartz omega");
    assert.equal(bodyLines.length, 1);
    const second = out.text.split("\n");
    const i = second.indexOf("## alpha zebraquartz");
    assert.equal(second[i + 1], "No new section.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[M2] GP5/batch-index-byte-budget: indexed bytes stay within the budget and the reply says it was cut", async () => {
  const root = tmpRoot("bb");
  try {
    const budget = 1048576; // the tool passes RETENTION_SIZE_CAP_BYTES; a small budget keeps the test fast
    const cmd = `node -e "for (let i = 0; i < 60000; i++) console.log('row ' + i + ' needle ' + 'x'.repeat(40))"`;
    const out = await runBatch({ commands: [cmd], queries: ["needle"] }, ctxFor(root), C.EXEC_TIMEOUT_MS, budget);
    assert.equal(out.isError, false);
    assert.ok(out.sandboxBytes > budget);
    const line = out.text.split("\n").find((l) => l.startsWith("Indexed "));
    assert.ok(line, "reply states the cut");
    const [indexed, total] = line.slice("Indexed ".length).split(" of ").map((p) => Number.parseInt(p, 10));
    assert.ok(indexed > 0 && indexed <= budget, `indexed ${indexed} <= ${budget}`);
    assert.ok(total > budget);
    assert.equal(line.includes("Timed out"), false); // the budget, not the deadline, ended the ingest
    assert.ok(Buffer.byteLength(out.text) <= C.OUTPUT_CAP);
    assert.ok(C.RETENTION_SIZE_CAP_BYTES >= budget);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[M2] GP4/batch-timeout-bounds-whole-handler: a never-ending huge output returns within the bound plus a small margin", async () => {
  if (process.platform === "win32") return;
  const root = tmpRoot("tb");
  try {
    const bound = 1500;
    const flood = `node -e "setInterval(() => process.stdout.write('needle '.repeat(15000) + '\\n'), 5)"`;
    const t0 = Date.now();
    const out = await runBatch({ commands: ["echo first-xyz", flood, "echo never-xyz"], queries: ["first-xyz", "needle"] }, ctxFor(root), bound, C.RETENTION_SIZE_CAP_BYTES);
    const took = Date.now() - t0;
    assert.ok(took < bound + 1500, `took ${took} ms`);
    assert.equal(out.isError, false);
    assert.ok(out.text.includes("Timed out after " + bound + " ms"));
    assert.ok(out.text.includes("first-xyz"));
    assert.equal(out.text.includes("\nnever-xyz"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
