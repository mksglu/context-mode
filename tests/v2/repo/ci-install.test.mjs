// D-CI-INSTALL-1: the CI dev install retries a silent npm failure, proves every declared package is on disk,
// and the repo-check steps do not run (and blame a missing package) after a failed install.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installWithRetry, missingPackages } from "../../../scripts/ci-install.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function project(deps, present) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-ci-install-"));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ devDependencies: deps }));
  for (const n of present) {
    mkdirSync(path.join(dir, "node_modules", n), { recursive: true });
    writeFileSync(path.join(dir, "node_modules", n, "package.json"), "{}");
  }
  return dir;
}

test("missingPackages names every declared package that is not on disk", () => {
  const dir = project({ esbuild: "0.24.0", "toml-eslint-parser": "1.0.3", "@clack/prompts": "^1" }, ["esbuild"]);
  assert.deepEqual(missingPackages(dir), ["@clack/prompts", "toml-eslint-parser"]);
});

test("a silent exit 1 is retried and the second try passes", async () => {
  const dir = project({ esbuild: "1" }, []);
  let calls = 0;
  const run = () => {
    calls++;
    if (calls === 2) project2(dir);
    return calls === 1 ? 1 : 0;
  };
  const r = await installWithRetry({ root: dir, run, attempts: 3, sleep: async () => {}, log: () => {} });
  assert.equal(r.ok, true);
  assert.equal(calls, 2);
});

function project2(dir) {
  mkdirSync(path.join(dir, "node_modules", "esbuild"), { recursive: true });
  writeFileSync(path.join(dir, "node_modules", "esbuild", "package.json"), "{}");
}

test("exit 0 with a package missing is a failure, not a pass", async () => {
  const dir = project({ esbuild: "1", "toml-eslint-parser": "1" }, ["esbuild"]);
  const lines = [];
  const r = await installWithRetry({ root: dir, run: () => 0, attempts: 2, sleep: async () => {}, log: (l) => lines.push(l) });
  assert.equal(r.ok, false);
  assert.ok(lines.join("\n").includes("toml-eslint-parser"), lines.join("\n"));
});

test("ci.yml: every dev install goes through scripts/ci-install.mjs, none calls npm install directly", () => {
  const y = readFileSync(root + ".github/workflows/ci.yml", "utf8");
  assert.ok(!/- run: npm install/.test(y));
  assert.equal(y.split("- run: node scripts/ci-install.mjs").length - 1, 3);
});

test("ci.yml: repo checks after a failed install are skipped, so the install error is the only red step", () => {
  const y = readFileSync(root + ".github/workflows/ci.yml", "utf8");
  assert.ok(y.includes("id: install"));
  for (const s of ["check-readme", "check-install-docs", "check-secrets", "check-prompt-static", "check-removed", "ci-gs4-lint"]) {
    const i = y.indexOf("- run: node " + (s === "ci-gs4-lint" ? "scripts/" : "build/") + s + ".mjs");
    assert.ok(i > 0, s);
    const end = y.indexOf("\n      - ", i + 1);
    const block = y.slice(i, end < 0 ? undefined : end);
    assert.ok(block.includes("steps.install.outcome == 'success'"), s);
  }
});
