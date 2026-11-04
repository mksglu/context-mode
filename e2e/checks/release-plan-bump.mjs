#!/usr/bin/env node
// e2e/checks/release-plan-bump.mjs — local check for live case release-plan-bump
// (impl/13 §10 E2E proof, A11, DEVIATIONS D-M6-arch-4). Seeds fake git histories in scratch
// repos, runs scripts/release/plan.mjs as a subprocess and checks the bump math.
// Does not import src/. Prints one JSON line, never throws.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLAN = path.join(REPO_ROOT, "scripts", "release", "plan.mjs");
const GIT_ID = ["-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

// [name, release version or null (no release branch), subjects after the trailer, expected first stdout line or exit code]
const CASES = [
  ["first-release", null, ["chore: init", "fix: a"], "version=2.0.0"],
  ["patch", "2.0.0", ["fix: a", "perf: b", "docs: c"], "version=2.0.1"],
  ["minor", "2.1.7", ["fix: a", "feat(x): b"], "version=2.2.0"],
  ["major-bang", "2.1.7", ["feat: a", "fix(core)!: b"], "version=3.0.0"],
  ["none", "2.0.0", ["docs: a", "chore: b"], 1],
];

function git(dir, ...args) {
  const r = spawnSync("git", [...GIT_ID, ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

function commit(dir, subject) {
  git(dir, "commit", "--allow-empty", "-q", "-m", subject);
  return git(dir, "rev-parse", "HEAD");
}

function runCase([name, version, after, expected]) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-v2-e2e-plan-"));
  const dir = path.join(root, "work");
  const bare = path.join(root, "origin.git");
  try {
    // D-FU-RF-1: plan.mjs reads the pushed annotated v2+ tags on origin, so the scratch repo gets a local bare origin.
    git(root, "init", "-q", "--bare", bare);
    git(root, "init", "-q", dir);
    git(dir, "remote", "add", "origin", bare);
    commit(dir, "feat: before release");
    const src = commit(dir, "fix: before release");
    if (version) {
      git(dir, "checkout", "-q", "--orphan", "release");
      mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
      writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ version }));
      git(dir, "add", ".claude-plugin/plugin.json");
      git(dir, "commit", "-q", "-m", `release ${version}\n\nSource-Commit: ${src}`);
      git(dir, "tag", "-a", `v${version}`, "-m", `v${version}`, "release");
      git(dir, "push", "-q", "origin", `refs/tags/v${version}`);
      rmSync(path.join(dir, ".claude-plugin"), { recursive: true, force: true });
      git(dir, "checkout", "-q", "main");
    }
    for (const s of after) commit(dir, s);
    const r = spawnSync(process.execPath, [PLAN], { cwd: dir, encoding: "utf8" });
    if (typeof expected === "number") {
      return r.status === expected && r.stdout === "" ? null : `${name}: want exit ${expected}, got ${r.status}`;
    }
    const first = r.stdout.split("\n")[0];
    if (r.status !== 0) return `${name}: exit ${r.status}: ${r.stderr.trim()}`;
    if (first !== expected) return `${name}: want ${expected}, got ${first}`;
    if (!r.stdout.includes("\nnotes<<EOF\n") || !r.stdout.endsWith("\nEOF\n")) return `${name}: no GITHUB_OUTPUT notes block`;
    return null;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

try {
  const errors = CASES.map(runCase).filter((e) => e !== null);
  console.log(JSON.stringify(errors.length ? { ok: false, reason: errors.join("; ") } : { ok: true, cases: CASES.length }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, reason: String(e.message ?? e) }));
}
