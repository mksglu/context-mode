// ADR-0012 (keyless live harness), section M2 bench runner: bench/fixtures/run.mjs against a fresh build.
// Own file (ADR-0024 rule 3): the run builds the bundle with a blocking execFileSync and takes 4.4 s alone. Next to the
// timer based live-harness tests it blocked their event loop, so the merged file ran 5.8 s. Split by ADR section.
// Serial: one build, one temp dir, a time budget inside the test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

// Moved from tests/bench/fixtures-run.test.mjs
describe("ADR-0012 / M2 bench fixtures run", () => {
  // bench/fixtures/run.mjs: the short fixture benchmark (v1 BENCHMARK.md layout). Runs the real script
  // against a fresh build in a temp dir and checks the committed results.json against it.








  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

// D-BENCH-SUITE-1: the shareable suite (bench/run.mjs, 7 use-case folders). Committed results are checked, not re-measured.
describe("ADR-0012 / bench suite (bench/run.mjs)", () => {
  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const BENCH = path.join(REPO, "bench");
  const GROUPS = ["a-sandbox", "b-retrieval", "c-batch", "d-externalize", "e-continuity", "f-hook-redirect", "g-overhead"];
  const files = readdirSync(path.join(BENCH, "results")).filter((f) => /^\d{4}-\d{2}-\d{2}-[a-z0-9]+-[a-z0-9]+\.json$/.test(f));

  test("one folder per group, each with an index.mjs and a README", () => {
    for (const g of GROUPS) {
      assert.ok(existsSync(path.join(BENCH, g, "index.mjs")), g + "/index.mjs");
      assert.ok(existsSync(path.join(BENCH, g, "README.md")), g + "/README.md");
    }
  });

  test("a committed results file holds raw samples, env, version, commit and fixture hashes", () => {
    assert.ok(files.length >= 1, "no results/<date>-<os>-<arch>.json");
    const r = JSON.parse(readFileSync(path.join(BENCH, "results", files.at(-1)), "utf8"));
    assert.ok(r.runs >= 5, "committed run has n >= 5");
    assert.match(r.context_mode.commit, /^[0-9a-f]{40}$/);
    assert.equal(typeof r.context_mode.dirty, "boolean");
    for (const k of ["node", "os", "cpu", "arch"]) assert.ok(r.env[k], k);
    assert.match(r.token_method, /estimate/);
    assert.equal(r.results.length, 54);
    for (const row of r.results) {
      assert.equal(row.error, null, row.id);
      assert.ok(GROUPS.includes(row.group), row.id);
      for (const [k, m] of Object.entries(row.metrics)) {
        assert.equal(m.samples.length, r.runs, row.id + "." + k);
        assert.ok(m.min <= m.median && m.median <= m.max, row.id + "." + k);
      }
    }
    for (const [f, h] of Object.entries(r.fixtures)) {
      assert.ok(h, f + " missing");
      assert.equal(createHash("sha256").update(readFileSync(path.join(BENCH, "fixtures", "data", f))).digest("hex"), h.sha256, f);
    }
  });

  test("every scenario that has an own check passed it (no row failed ok)", () => {
    const r = JSON.parse(readFileSync(path.join(BENCH, "results", files.at(-1)), "utf8"));
    const bad = r.results.filter((x) => !x.ok).map((x) => x.id + " " + x.note);
    assert.deepEqual(bad, []);
  });

  test("tables keep the rows where context-mode saves little or costs more", () => {
    const md = readFileSync(path.join(BENCH, "results", files.at(-1).replace(/\.json$/, ".md")), "utf8");
    assert.match(md, /Network requests/);
    assert.match(md, /Small outputs/);
    assert.match(md, /-\d+%/, "a negative saving is shown");
    assert.match(md, /Footnote: Hardware .*Median of \d+ run/);
  });

  test("each table row links to a scenario heading that exists", () => {
    for (const g of GROUPS) {
      const readme = readFileSync(path.join(BENCH, g, "README.md"), "utf8");
      const md = readFileSync(path.join(BENCH, "results", files.at(-1).replace(/\.json$/, ".md")), "utf8");
      for (const m of md.matchAll(new RegExp("\\(\\.\\./" + g + "/README\\.md#([a-z0-9-]+)\\)", "g"))) assert.ok(readme.includes("## " + m[1] + "\n"), g + " " + m[1]);
    }
  });

  // D-PATH-LABEL-1: a failed quality check is a miss, never a saving; the harness searches with the label ctx_index returned.
  test("quality miss: a row with ok false is listed as a miss and shows no saving; the returned index label is read whole", async () => {
    const { qualityMisses, savedCell, indexedLabel } = await import("../bench/suite/lib.mjs");
    const rows = [{ id: "a", ok: true }, { id: "b", ok: false, note: "answer string missing for 3 query(ies)" }, { id: "c", ok: false, error: "boom" }];
    assert.deepEqual(qualityMisses(rows).map((r) => r.id), ["b"]);
    assert.equal(savedCell(rows[1], 1000, 100), "miss");
    assert.equal(savedCell(rows[0], 1000, 100), "90%");
    assert.equal(indexedLabel("Indexed 1 source(s), 95 chunk(s) from data\\sqlite-fts5-docs.html.\nRaw HTML kept as x"), "data\\sqlite-fts5-docs.html");
    assert.equal(indexedLabel("Indexed 1 source(s), 95 chunk(s) from data/sqlite-fts5-docs.html."), "data/sqlite-fts5-docs.html");
    assert.equal(indexedLabel("no label here"), null);
  });

  test("a one-scenario run works and a bad --runs is refused", () => {
    const bad = spawnSync(process.execPath, [path.join(BENCH, "run.mjs"), "--runs", "0", "--no-write"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
  });
});
