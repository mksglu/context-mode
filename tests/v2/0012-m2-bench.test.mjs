// ADR-0012 (keyless live harness), section M2 bench runner: bench/fixtures/run.mjs against a fresh build.
// Own file (ADR-0024 rule 3): the run builds the bundle with a blocking execFileSync and takes 4.4 s alone. Next to the
// timer based live-harness tests it blocked their event loop, so the merged file ran 5.8 s. Split by ADR section.
// Serial: one build, one temp dir, a time budget inside the test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

// Moved from tests/v2/bench/fixtures-run.test.mjs
describe("ADR-0012 / M2 bench fixtures run", () => {
  // bench/fixtures/run.mjs: the short fixture benchmark (v1 BENCHMARK.md layout). Runs the real script
  // against a fresh build in a temp dir and checks the committed results.json against it.








  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const BENCH = path.join(REPO, "bench", "fixtures");
  const scenarios = JSON.parse(readFileSync(path.join(BENCH, "scenarios.json"), "utf8"));
  const results = JSON.parse(readFileSync(path.join(BENCH, "results.json"), "utf8"));
  const baseline = JSON.parse(readFileSync(path.join(BENCH, "v1-baseline.json"), "utf8"));

  test("21 v1 scenarios: 14 execute-file, 7 index+search, every fixture present", () => {
    assert.equal(scenarios.part1.length, 14);
    assert.equal(scenarios.part2.length, 7);
    for (const s of scenarios.part1) assert.ok(existsSync(path.join(BENCH, "data", s.fixture)), s.fixture);
    for (const s of scenarios.part2) {
      const files = s.fixture ? [s.fixture] : s.concat ?? [s.mcpTools];
      for (const f of files) assert.ok(existsSync(path.join(BENCH, "data", f)), f);
      assert.ok(s.queries.length >= 2, s.scenario);
    }
  });

  test("part 1 fixture sizes equal the raw sizes v1 printed (byte-exact copy)", () => {
    for (const s of scenarios.part1) {
      const kb = (statSync(path.join(BENCH, "data", s.fixture)).size / 1024).toFixed(1);
      const row = results.rows.find((r) => r.part === 1 && r.scenario === s.name);
      assert.ok(row, s.name);
      assert.equal((row.raw_bytes / 1024).toFixed(1), kb, s.name);
    }
    for (const r of baseline.rows.filter((x) => x.part === 2)) {
      const row = results.rows.find((x) => x.part === 2 && x.scenario === r.scenario);
      assert.equal(row.raw_bytes, r.raw_bytes, r.scenario);
    }
  });

  test("results.json: schema, 21 rows, no errors, versions and shas", () => {
    assert.equal(results.rows.length, 21);
    for (const r of results.rows) {
      for (const k of ["scenario", "source", "raw_bytes", "v1_context_bytes", "v2_tool_context_bytes", "v2_hook_context_bytes", "v2_ms", "code_blocks"]) {
        assert.ok(k in r, r.scenario + " lacks " + k);
      }
      assert.equal(r.error ?? null, null, r.scenario);
      assert.ok(r.raw_bytes > 0 && r.v2_tool_context_bytes > 0 && r.v2_hook_context_bytes > 0, r.scenario);
    }
    assert.match(results.shas.v1, /^[0-9a-f]{40}$/);
    assert.ok(results.versions.v1 && results.versions.v2 && results.date);
  });

  test("run.mjs --check passes on a fresh build, under 60 s", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "bench-fixtures-"));
    try {
      const out = path.join(tmp, "out");
      execFileSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out], { cwd: REPO, stdio: "pipe" });
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [path.join(BENCH, "run.mjs"), "--check", "--bundle", out], { cwd: REPO, encoding: "utf8", timeout: 120000 });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.ok(Date.now() - t0 < 60000, "run took " + (Date.now() - t0) + " ms");
      assert.match(r.stdout, /check: ok/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
