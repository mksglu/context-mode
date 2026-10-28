// release.yml publish-npm job (ADR-0019 D1/D2) and check-npm-tarball.mjs. Text checks: no YAML parser is a dependency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const yml = readFileSync(path.join(REPO, ".github", "workflows", "release.yml"), "utf8");
// D-MO-2: the old jobs end where the main-only jobs begin; the old-path checks below read only the old jobs.
const oldJobs = yml.slice(yml.indexOf("\njobs:"), yml.indexOf("# ---- MAIN-ONLY path"));
const job = yml.slice(yml.indexOf("\n  publish-npm:"), yml.indexOf("\n  rollback:"));

test("release.yml: publish-npm job has the ADR-0019 shape", () => {
  assert.ok(job.length > 50, "job exists, placed before rollback");
  for (const s of ["environment: npm-publish", "id-token: write", "contents: read", 'node-version: "24.15.0"', "11.5.1",
    "check-npm-tarball.mjs", "npm publish --provenance --access public --tag next"]) assert.ok(job.includes(s), s);
  assert.ok(!/NODE_AUTH_TOKEN|NPM_TOKEN/.test(yml), "no token: trusted publishing only");
  assert.ok(!/--tag latest/.test(yml), "CI never moves latest");
  assert.ok(/needs:\s*\[[^\]]*publish-promote/.test(job), "runs after the release job");
  assert.ok(/startsWith\(github\.ref, 'refs\/tags\/v2\.'\)/.test(job) && /inputs\.publish/.test(job), "only a v2.* tag or publish=true");
});

test("release.yml: publish input exists and is a boolean defaulting to false", () => {
  assert.match(yml, /publish:\n\s+description:[^\n]*\n\s+required: false\n\s+type: boolean\n\s+default: false/);
  assert.match(yml, /tags:\s*\n\s*- "v2\.\*"/);
});

test("release.yml: no ${{ }} inside a run text of publish-npm", () => {
  const runs = job.split("\n").filter((l) => /^\s+run:/.test(l));
  for (const r of runs) assert.ok(!r.includes("${{"), r);
});

function sha(b) { return createHash("sha256").update(b).digest("hex"); }
function tree(files) {
  const d = mkdtempSync(path.join(tmpdir(), "cm-v2-tarball-"));
  const sums = [];
  for (const [n, c] of Object.entries(files)) { mkdirSync(path.dirname(path.join(d, n)), { recursive: true }); writeFileSync(path.join(d, n), c); sums.push(`${sha(c)}  ${n}`); }
  writeFileSync(path.join(d, "SHA256SUMS"), sums.join("\n") + "\n");
  return d;
}
const PKG = JSON.stringify({ name: "context-mode", version: "2.0.0", type: "module", bin: { "context-mode": "cli.mjs" } }, null, 2) + "\n";
const run = (d) => spawnSync(process.execPath, [path.join(REPO, "scripts", "release", "check-npm-tarball.mjs"), d], { encoding: "utf8", env: { ...process.env, npm_config_cache: path.join(d, "..", "cm-npm-cache") } });

test("check-npm-tarball: passes when the tarball equals SHA256SUMS", (t) => {
  const d = tree({ "package.json": PKG, "cli.mjs": "#!/usr/bin/env node\n", "server.mjs": "x\n" });
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const r = run(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("check-npm-tarball: fails when a file differs from SHA256SUMS", (t) => {
  const d = tree({ "package.json": PKG, "cli.mjs": "#!/usr/bin/env node\n", "server.mjs": "x\n" });
  t.after(() => rmSync(d, { recursive: true, force: true }));
  writeFileSync(path.join(d, "server.mjs"), "changed\n");
  const r = run(d);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout + r.stderr, /server\.mjs/);
});

// Release-next (D-RN-TAG-1): a pushed v2.* tag is the version. The plan step passes the tag name to
// plan.mjs through env (never ${{ }} in run text); a branch run keeps plan.mjs's own version.
test("[RN] release.yml: plan step passes --tag \"$REF_NAME\" on a tag push, plain plan.mjs otherwise", () => {
  const plan = yml.slice(yml.indexOf("\n  plan:"), yml.indexOf("\n  build:"));
  const step = plan.slice(plan.indexOf("- id: plan"));
  for (const s of ["REF_TYPE: ${{ github.ref_type }}", "REF_NAME: ${{ github.ref_name }}", 'if [ "$REF_TYPE" = "tag" ]; then',
    'node scripts/release/plan.mjs --tag "$REF_NAME" >> "$GITHUB_OUTPUT"', 'node scripts/release/plan.mjs >> "$GITHUB_OUTPUT"']) {
    assert.ok(step.includes(s), s);
  }
  const runText = step.slice(step.indexOf("run:"));
  assert.ok(!runText.includes("${{"), "no ${{ }} in the plan run text");
});

test("[RN] release.yml: publish-npm stays --tag next and never names latest", () => {
  const npmLines = job.split("\n").filter((l) => l.includes("npm publish"));
  assert.deepEqual(npmLines.map((l) => l.trim()), ["run: npm publish --provenance --access public --tag next"]);
  assert.ok(!oldJobs.includes("npm dist-tag"), "CI never runs npm dist-tag");
  const latest = oldJobs.split("\n").filter((l) => l.includes("latest") && !l.includes("-latest") && !l.trim().startsWith("- name:"));
  assert.deepEqual(latest, [], "no release.yml command names latest (runner labels and step names aside)");
});

// D-RN-ORDER-1: run 40496186557 (v2.0.0-next.4) made the GitHub prerelease in publish-promote, then publish-npm failed.
// The GitHub release is now its own job: it runs after publish-npm, and only when npm publish succeeded or was not asked for.
const jobOf = (name) => {
  const start = yml.indexOf(`\n  ${name}:`);
  assert.ok(start > 0, `job ${name} exists`);
  const rest = yml.slice(start + 1);
  const next = rest.split("\n").findIndex((l, i) => i > 0 && l.startsWith("  ") && !l.startsWith("   ") && l.trim().endsWith(":"));
  return next < 0 ? rest : rest.split("\n").slice(0, next).join("\n");
};

test("[N5] release.yml: publish-promote makes no GitHub release (D-RN-ORDER-1)", () => {
  const promote = jobOf("publish-promote");
  assert.ok(promote.includes('run: node scripts/release/publish.mjs --promote --version "$VERSION"'), promote);
  for (const s of ["GH_TOKEN", "--notes", "NOTES", "--github-release"]) assert.ok(!promote.includes(s), s);
});

test("[N5] release.yml: github-release job needs publish-npm and runs only when npm publish succeeded or was not asked for (D-RN-ORDER-1)", () => {
  const gh = jobOf("github-release");
  assert.ok(gh.includes("needs: [plan, publish-promote, publish-npm]"), gh);
  const cond = gh.split("\n").find((l) => l.trim().startsWith("if:"));
  assert.equal(cond.trim(), "if: ${{ !cancelled() && inputs.mode != 'rollback' && needs.publish-promote.result == 'success' && " +
    "(needs.publish-npm.result == 'success' || (needs.publish-npm.result == 'skipped' && !inputs.publish && !startsWith(github.ref, 'refs/tags/v2.'))) }}");
  for (const s of ["contents: write", "GH_TOKEN: ${{ github.token }}", "VERSION: ${{ needs.plan.outputs.version }}",
    "NOTES: ${{ needs.plan.outputs.notes }}", "name: release-out",
    'run: node scripts/release/publish.mjs --github-release --version "$VERSION" --notes "$NOTES"']) assert.ok(gh.includes(s), s);
  for (const r of gh.split("\n").filter((l) => l.trim().startsWith("run:"))) assert.ok(!r.includes("${{"), r);
  assert.ok(!gh.includes("environment:"), "no npm-publish environment: no second approval for the GitHub release");
  assert.ok(yml.indexOf("\n  publish-npm:") < yml.indexOf("\n  github-release:"), "job order in the file follows the run order");
  assert.equal(oldJobs.split("--github-release").length - 1, 1, "one place makes the GitHub release (old path)");
});
