// Main-only release plan (docs/v2/release/MAIN-ONLY.md, owner decision 2026-10-28): `plan.mjs --main --channel next|latest`
// reads the v2 tags on origin and the commits on main. Each test seeds a scratch repo with a local bare origin and
// runs the real script in it. No release branch, no Source-Commit trailer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PLAN = path.join(REPO, "scripts", "release", "plan.mjs");
const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

function git(dir, ...args) {
  const r = spawnSync("git", [...GIT_ID, ...args], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const commit = (dir, subject) => git(dir, "commit", "--allow-empty", "-q", "-m", subject);

function seed(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-v2-planmain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bare = path.join(root, "origin.git");
  const dir = path.join(root, "work");
  git(root, "init", "-q", "--bare", bare);
  git(root, "init", "-q", dir);
  git(dir, "remote", "add", "origin", bare);
  commit(dir, "chore: init");
  return dir;
}

// A release on main: an empty release commit on the current branch, an annotated pushed tag on it.
function tagged(dir, version) {
  commit(dir, `chore(release): v${version}`);
  git(dir, "tag", "-a", `v${version}`, "-m", `v${version}`);
  git(dir, "push", "-q", "origin", `refs/tags/v${version}`);
}
// A tag that is NOT in main's history (the old release branch / release-staging tags).
function sideTag(dir, version) {
  git(dir, "checkout", "-q", "-b", "side-" + version);
  tagged(dir, version);
  git(dir, "checkout", "-q", "main");
}

function plan(dir, ...args) {
  const r = spawnSync(process.execPath, [PLAN, "--main", ...args], { cwd: dir, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const versionOf = (stdout) => stdout.split("\n")[0];
const NEXT = ["--channel", "next"];
const LATEST = ["--channel", "latest", "--confirm", "latest"];

test("[MAIN-ONLY] plan --main: no tag on main -> first release, next.1 / 2.0.0", (t) => {
  const dir = seed(t);
  commit(dir, "feat: first");
  assert.equal(versionOf(plan(dir, ...NEXT).stdout), "version=2.0.0-next.1");
  assert.equal(versionOf(plan(dir, ...LATEST).stdout), "version=2.0.0");
});

test("[MAIN-ONLY] plan --main: old next tags that are not in main history still number the next one", (t) => {
  const dir = seed(t);
  sideTag(dir, "2.0.0-next.8");
  commit(dir, "feat: first");
  const r = plan(dir, ...NEXT);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(versionOf(r.stdout), "version=2.0.0-next.9");
});

test("[MAIN-ONLY] plan --main: bump comes from commits since the last stable tag on main", (t) => {
  for (const [subject, next, latest] of [
    ["fix: a", "2.0.1-next.1", "2.0.1"],
    ["feat(tools): b", "2.1.0-next.1", "2.1.0"],
    ["feat!: c", "3.0.0-next.1", "3.0.0"],
  ]) {
    const dir = seed(t);
    tagged(dir, "2.0.0");
    commit(dir, "docs: ignored");
    commit(dir, subject);
    assert.equal(versionOf(plan(dir, ...NEXT).stdout), `version=${next}`, subject);
    assert.equal(versionOf(plan(dir, ...LATEST).stdout), `version=${latest}`, subject);
  }
});

test("[MAIN-ONLY] plan --main: a second next increments N; latest drops the suffix", (t) => {
  const dir = seed(t);
  tagged(dir, "2.0.0");
  commit(dir, "fix: a");
  tagged(dir, "2.0.1-next.1");
  commit(dir, "fix: b");
  assert.equal(versionOf(plan(dir, ...NEXT).stdout), "version=2.0.1-next.2");
  assert.equal(versionOf(plan(dir, ...LATEST).stdout), "version=2.0.1");
});

test("[MAIN-ONLY] plan --main: notes list only the commits since the newest tag on main", (t) => {
  const dir = seed(t);
  commit(dir, "feat: old thing");
  tagged(dir, "2.0.0");
  commit(dir, "fix: f1");
  tagged(dir, "2.0.1-next.1");
  commit(dir, "feat(a): n1");
  commit(dir, "chore: skip me");
  const r = plan(dir, ...NEXT);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, ["version=2.1.0-next.1", "notes<<EOF", "### Features", "- feat(a): n1", "EOF", ""].join("\n"));
});

test("[MAIN-ONLY] plan --main: no releasable commit since the last tag -> exit 1, one stderr line", (t) => {
  const dir = seed(t);
  tagged(dir, "2.0.0");
  commit(dir, "docs: a");
  const r = plan(dir, ...NEXT);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "release failed: no releasable commits since v2.0.0\n");
});

test("[MAIN-ONLY] plan --main: latest needs --confirm latest; next needs no confirm", (t) => {
  const dir = seed(t);
  commit(dir, "feat: first");
  for (const args of [["--channel", "latest"], ["--channel", "latest", "--confirm", "yes"], ["--channel", "latest", "--confirm", ""]]) {
    const r = plan(dir, ...args);
    assert.equal(r.status, 1, args.join(" "));
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "release failed: channel latest needs --confirm latest\n");
  }
  assert.equal(plan(dir, ...NEXT).status, 0);
});

test("[MAIN-ONLY] plan --main: unknown or missing channel is refused; latest refuses a version that is already tagged", (t) => {
  const dir = seed(t);
  commit(dir, "feat: first");
  assert.equal(plan(dir).status, 1);
  assert.equal(plan(dir, "--channel", "beta").status, 1);
  tagged(dir, "2.0.0");
  commit(dir, "fix: x");
  tagged(dir, "2.0.1");
  // fix after 2.0.1 -> 2.0.2; make 2.0.2 already exist on origin on a side branch
  sideTag(dir, "2.0.2");
  commit(dir, "fix: y");
  const r = plan(dir, ...LATEST);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "release failed: tag v2.0.2 is already on origin\n");
});
