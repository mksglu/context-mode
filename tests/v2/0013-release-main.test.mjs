// ADR-0013 (release automation), PRD-v2 section 14: release to main. One file per ADR area (ADR-0024); one describe per script.
// Moved from tests/v2/release/{publish,plan-main,commit-main,branch-protection,release-next}. Names and assertions unchanged.
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTECTION_ENDPOINT, SETTINGS, protectionDrift } from "../../scripts/release/branch-protection.mjs";

describe("ADR-0013: plan.mjs on main", { concurrency: CONC }, () => {
  // Main-only release plan (docs/v2/release/MAIN-ONLY.md, owner decision 2026-10-28): `plan.mjs --main --channel next|latest`
  // reads the v2 tags on origin and the commits on main. Each test seeds a scratch repo with a local bare origin and
  // runs the real script in it. No release branch, no Source-Commit trailer.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
});

describe("ADR-0013: publish.mjs", { concurrency: CONC }, () => {
  // Unit tests for scripts/release/publish.mjs (impl/13-build-release.md §11.1, DEVIATIONS D-M6-arch-5,
  // D-M6-P2-1). Runs the real script against a local bare repo passed via --remote; nothing leaves the machine.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SCRIPT = path.join(REPO, "scripts", "release", "publish.mjs");
  const SRC = "0123456789abcdef0123456789abcdef01234567";
  const ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };

  function git(cwd, ...args) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  }

  function publish(cwd, ...args) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: ENV });
  }

  // root/remote.git (bare, `main` with one commit) and root/work: a clone on `main` with a stray file.
  function fixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-v2-publish-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bare = path.join(root, "remote.git");
    const seed = path.join(root, "seed");
    git(root, "init", "-q", "--bare", "-b", "main", bare);
    git(root, "init", "-q", "-b", "main", seed);
    writeFileSync(path.join(seed, "source.txt"), "dev tree");
    git(seed, "add", "-A");
    git(seed, "commit", "-qm", "dev");
    git(seed, "push", "-q", bare, "main");
    const work = path.join(root, "work");
    git(root, "clone", "-q", bare, work);
    return { root, bare, work };
  }

  // The downloaded artifact: release-out/{server.mjs, hooks/a.json, SHA256SUMS}.
  function artifact(dir, body) {
    const out = path.join(dir, "release-out");
    mkdirSync(path.join(out, "hooks"), { recursive: true });
    writeFileSync(path.join(out, "server.mjs"), body);
    writeFileSync(path.join(out, "hooks", "a.json"), "{}");
    writeFileSync(path.join(out, "SHA256SUMS"), `sums ${body}`);
  }

  const remoteRef = (bare, ref) => spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: bare, encoding: "utf8", env: ENV }).stdout.trim();

  test("[M6] publish/stage-first: orphan release-staging holds only release-out/*, trailer, local annotated tag", (t) => {
    const { bare, work } = fixture(t);
    artifact(work, "v2.0.0 bundle");
    const r = publish(work, "--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare);
    assert.equal(r.status, 0, r.stderr);

    const head = remoteRef(bare, "refs/heads/release-staging");
    assert.equal(head, git(work, "rev-parse", "HEAD"));
    assert.equal(git(bare, "rev-list", "--count", "release-staging"), "1", "orphan: no dev history");
    assert.deepEqual(git(bare, "ls-tree", "-r", "--name-only", "release-staging").split("\n"), ["SHA256SUMS", "hooks/a.json", "server.mjs"]);
    assert.equal(git(bare, "show", "release-staging:server.mjs"), "v2.0.0 bundle");
    assert.equal(git(bare, "log", "-1", "--format=%s", "release-staging"), "release v2.0.0");
    assert.equal(git(bare, "log", "-1", "--format=%(trailers:key=Source-Commit,valueonly)", "release-staging"), SRC);

    assert.equal(git(work, "cat-file", "-t", "refs/tags/v2.0.0"), "tag", "annotated tag");
    assert.equal(git(work, "rev-parse", "v2.0.0^{commit}"), head);
    assert.equal(remoteRef(bare, "refs/tags/v2.0.0"), "", "draft tag is not pushed by --stage");
    assert.deepEqual(readdirSync(work).sort(), [".git", "SHA256SUMS", "hooks", "server.mjs"]);
  });

  test("[M6] publish/stage-next: an existing release-staging gets one child commit; old files go", (t) => {
    const { root, bare, work } = fixture(t);
    artifact(work, "one");
    writeFileSync(path.join(work, "release-out", "old.txt"), "gone next time");
    assert.equal(publish(work, "--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare).status, 0);
    const first = remoteRef(bare, "refs/heads/release-staging");

    const next = path.join(root, "next");
    git(root, "clone", "-q", "--branch", "release-staging", bare, next);
    artifact(next, "two");
    const src2 = "f".repeat(40);
    const r = publish(next, "--stage", "--version", "2.1.0", "--source-commit", src2, "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(bare, "rev-parse", "release-staging^"), first);
    assert.equal(git(bare, "show", "release-staging:server.mjs"), "two");
    assert.ok(!git(bare, "ls-tree", "-r", "--name-only", "release-staging").split("\n").includes("old.txt"));
    assert.equal(git(bare, "log", "-1", "--format=%(trailers:key=Source-Commit,valueonly)", "release-staging"), src2);
  });

  test("[M6] publish/stage-lease: a release-staging that moved after the check is not overwritten", (t) => {
    const { root, bare, work } = fixture(t);
    // A stale view: the work clone thinks release-staging is absent, but it now exists on the remote.
    const other = path.join(root, "other");
    git(root, "clone", "-q", bare, other);
    artifact(other, "other");
    assert.equal(publish(other, "--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare).status, 0);
    const theirs = remoteRef(bare, "refs/heads/release-staging");
    // The script reads the remote head itself, so a second stage builds on top (no lost commit).
    artifact(work, "mine");
    const r = publish(work, "--stage", "--version", "2.0.1", "--source-commit", SRC, "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(bare, "rev-parse", "release-staging^"), theirs);
  });

  test("[M6] publish/promote: release = release-staging commit, tag pushed, gh skipped for a non-origin remote", (t) => {
    const { root, bare, work } = fixture(t);
    artifact(work, "bundle");
    assert.equal(publish(work, "--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare).status, 0);
    const staged = remoteRef(bare, "refs/heads/release-staging");

    // publish-promote runs in a fresh checkout: the draft tag is not there; it is made on the staged commit.
    const fresh = path.join(root, "fresh");
    git(root, "clone", "-q", bare, fresh);
    const r = publish(fresh, "--promote", "--version", "2.0.0", "--notes", "n", "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(remoteRef(bare, "refs/heads/release"), staged);
    assert.equal(git(bare, "cat-file", "-t", "refs/tags/v2.0.0"), "tag");
    assert.equal(git(bare, "rev-parse", "v2.0.0^{commit}"), staged);
    assert.ok(r.stdout.includes("gh release skipped"), r.stdout);

    // Promote in the stage checkout reuses its local draft tag.
    artifact(work, "bundle 2");
    assert.equal(publish(work, "--stage", "--version", "2.0.1", "--source-commit", SRC, "--remote", bare).status, 0);
    const r2 = publish(work, "--promote", "--version", "2.0.1", "--remote", bare);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(remoteRef(bare, "refs/heads/release"), remoteRef(bare, "refs/heads/release-staging"));
    assert.equal(git(bare, "rev-parse", "release^"), staged, "release moved forward by one commit");
  });

  test("[M6] publish/promote-tag-mismatch: a local tag on another commit fails, release untouched", (t) => {
    const { bare, work } = fixture(t);
    artifact(work, "bundle");
    assert.equal(publish(work, "--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare).status, 0);
    git(work, "tag", "-f", "-a", "v2.0.0", "-m", "v2.0.0", "main");
    const r = publish(work, "--promote", "--version", "2.0.0", "--remote", bare);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.startsWith("release failed: tag v2.0.0 points at"), r.stderr);
    assert.equal(remoteRef(bare, "refs/heads/release"), "");
  });

  test("[M6] publish/promote-no-staging and bad arguments: one 'release failed:' line, exit 1", (t) => {
    const { bare, work } = fixture(t);
    const cases = [
      [["--promote", "--version", "2.0.0", "--remote", bare], "release failed: release-staging does not exist on"],
      [["--stage", "--promote", "--version", "2.0.0"], "release failed: pass exactly one of --stage or --promote"],
      [["--stage", "--version", "2.0", "--source-commit", SRC], "release failed: --version <x.y.z> is required"],
      [["--stage", "--version", "2.0.0", "--source-commit", "abc"], "release failed: --stage needs --source-commit"],
      [["--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare], "release failed: release-out/SHA256SUMS not found"],
      [["--bogus"], "release failed: unknown argument --bogus"],
    ];
    for (const [args, want] of cases) {
      const r = publish(work, ...args);
      assert.equal(r.status, 1, args.join(" "));
      assert.ok(r.stderr.startsWith(want), `${args.join(" ")}: ${r.stderr}`);
      assert.equal(r.stderr.trim().split("\n").length, 1);
    }
    assert.equal(readFileSync(path.join(work, "source.txt"), "utf8"), "dev tree", "a failed stage changes no file");
  });

  // D-FU-RF-1: a release branch with only untagged (rehearsal) commits is replaced; a tagged release is never dropped.
  // root/work has a commit pushed as `release` on the bare remote; `tagged` also pushes an annotated v2.0.0 tag on it.
  function seedRelease(work, bare, tagged) {
    writeFileSync(path.join(work, "rehearsal.txt"), "old");
    git(work, "add", "-A");
    git(work, "commit", "-qm", "rehearsal build");
    git(work, "push", "-q", bare, "HEAD:refs/heads/release");
    if (tagged) {
      git(work, "tag", "-a", "v2.0.0", "-m", "v2.0.0");
      git(work, "push", "-q", bare, "refs/tags/v2.0.0");
    }
    return git(work, "rev-parse", "HEAD");
  }

  test("[M6] publish/promote-rehearsal: an untagged release branch is replaced by the staged commit", (t) => {
    const { root, bare, work } = fixture(t);
    const rehearsal = seedRelease(work, bare, false);
    const fresh = path.join(root, "fresh");
    git(root, "clone", "-q", bare, fresh);
    artifact(fresh, "real build");
    assert.equal(publish(fresh, "--stage", "--version", "2.0.0", "--source-commit", SRC, "--remote", bare).status, 0);
    const staged = remoteRef(bare, "refs/heads/release-staging");
    const r = publish(fresh, "--promote", "--version", "2.0.0", "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(remoteRef(bare, "refs/heads/release"), staged);
    assert.notEqual(remoteRef(bare, "refs/heads/release"), rehearsal);
    assert.equal(git(bare, "cat-file", "-t", "refs/tags/v2.0.0"), "tag");
  });

  test("[M6] publish/promote-tagged: a tagged release that the staged commit does not contain is not dropped", (t) => {
    const { root, bare, work } = fixture(t);
    const tagged = seedRelease(work, bare, true);
    // release-staging was built without that history (an unrelated orphan).
    const other = path.join(root, "other");
    git(root, "init", "-q", "-b", "main", other);
    artifact(other, "unrelated");
    assert.equal(publish(other, "--stage", "--version", "2.0.1", "--source-commit", SRC, "--remote", bare).status, 0);
    const r = publish(other, "--promote", "--version", "2.0.1", "--remote", bare);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.startsWith(`release failed: tagged release v2.0.0 (${tagged}) is not in release-staging; refusing`), r.stderr);
    assert.equal(r.stderr.trim().split("\n").length, 1);
    assert.equal(remoteRef(bare, "refs/heads/release"), tagged, "release untouched");
    assert.equal(remoteRef(bare, "refs/tags/v2.0.1"), "", "no tag pushed");
  });

  test("[M6] publish/promote-tagged-ok: a staged commit that contains the tagged release is promoted", (t) => {
    const { root, bare, work } = fixture(t);
    const tagged = seedRelease(work, bare, true);
    git(work, "push", "-q", bare, "HEAD:refs/heads/release-staging");
    const next = path.join(root, "next");
    git(root, "clone", "-q", "--branch", "release-staging", bare, next);
    artifact(next, "next build");
    assert.equal(publish(next, "--stage", "--version", "2.0.1", "--source-commit", SRC, "--remote", bare).status, 0);
    const r = publish(next, "--promote", "--version", "2.0.1", "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(bare, "rev-parse", "release^"), tagged);
  });

  // Release-next (D-RN-TAG-1): release.yml started by a pushed v2.* tag. The tag already sits on the source
  // commit on the remote; stage and promote reuse it: no second tag, no tag push, no refusal.
  const posixGh = { skip: process.platform === "win32" ? "stub gh is a sh script" : false };

  function pushTag(work, remote, name, ref = "HEAD") {
    git(work, "tag", "-a", name, "-m", name, ref);
    git(work, "push", "-q", remote, `refs/tags/${name}`);
    return git(work, "rev-parse", `refs/tags/${name}^{commit}`);
  }

  test("[RN] publish/stage-reuse-tag: a pushed tag on the source commit is reused, not created again", (t) => {
    const { bare, work } = fixture(t);
    const src = pushTag(work, bare, "v2.0.0-next.1");
    const tagObject = remoteRef(bare, "refs/tags/v2.0.0-next.1");
    artifact(work, "next build");
    const r = publish(work, "--stage", "--version", "2.0.0-next.1", "--source-commit", src, "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes("tag v2.0.0-next.1 already on"), r.stdout);
    assert.equal(remoteRef(bare, "refs/tags/v2.0.0-next.1"), tagObject, "remote tag untouched");
    assert.equal(git(work, "rev-parse", "refs/tags/v2.0.0-next.1^{commit}"), src, "local tag not moved to the staged commit");
    assert.ok(git(work, "log", "-1", "--format=%B", "release-staging").includes(`Source-Commit: ${src}`));
  });

  test("[RN] publish/stage-reuse-tag-mismatch: a pushed tag on another commit than --source-commit -> refuse", (t) => {
    const { bare, work } = fixture(t);
    const src = pushTag(work, bare, "v2.0.0-next.1");
    artifact(work, "next build");
    const r = publish(work, "--stage", "--version", "2.0.0-next.1", "--source-commit", SRC, "--remote", bare);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, `release failed: tag v2.0.0-next.1 on ${bare} points at ${src}, not source commit ${SRC}\n`);
    assert.equal(remoteRef(bare, "refs/heads/release-staging"), "", "nothing staged");
  });

  test("[RN] publish/promote-reuse-tag: release moves to the staged commit; the pushed tag is not pushed again", (t) => {
    const { root, bare, work } = fixture(t);
    const src = pushTag(work, bare, "v2.0.0-next.1");
    const tagObject = remoteRef(bare, "refs/tags/v2.0.0-next.1");
    artifact(work, "next build");
    assert.equal(publish(work, "--stage", "--version", "2.0.0-next.1", "--source-commit", src, "--remote", bare).status, 0);
    const staged = remoteRef(bare, "refs/heads/release-staging");
    const fresh = path.join(root, "fresh");
    git(root, "clone", "-q", bare, fresh);
    const r = publish(fresh, "--promote", "--version", "2.0.0-next.1", "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(remoteRef(bare, "refs/heads/release"), staged);
    assert.equal(remoteRef(bare, "refs/tags/v2.0.0-next.1"), tagObject, "remote tag untouched");
    assert.equal(remoteRef(bare, "refs/tags/v2.0.0-next.1^{commit}"), src);
  });

  test("[RN] publish/promote-reuse-tag-mismatch: a pushed tag that is not the staged Source-Commit -> refuse, release untouched", (t) => {
    const { bare, work } = fixture(t);
    const main = git(work, "rev-parse", "HEAD");
    artifact(work, "build");
    assert.equal(publish(work, "--stage", "--version", "2.0.0-next.1", "--source-commit", SRC, "--remote", bare).status, 0);
    const staged = remoteRef(bare, "refs/heads/release-staging");
    git(work, "tag", "-d", "v2.0.0-next.1");
    git(work, "tag", "-a", "v2.0.0-next.1", "-m", "x", main);
    git(work, "push", "-q", bare, "refs/tags/v2.0.0-next.1");
    const r = publish(work, "--promote", "--version", "2.0.0-next.1", "--remote", bare);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, `release failed: tag v2.0.0-next.1 on ${bare} points at ${main}, not Source-Commit ${SRC} of release-staging ${staged}\n`);
    assert.equal(remoteRef(bare, "refs/heads/release"), "");
  });

  test("[RN] publish/version-prerelease: --version takes x.y.z-<prerelease>; bad prerelease parts fail", (t) => {
    const { work } = fixture(t);
    for (const bad of ["2.0.0-", "2.0.0-next..1", "2.0.0-next.01", "2.0.0+b", "v2.0.0-next.1"]) {
      const r = publish(work, "--stage", "--version", bad, "--source-commit", SRC);
      assert.equal(r.status, 1, bad);
      assert.equal(r.stderr, "release failed: --version <x.y.z> is required\n", bad);
    }
  });

  // Stub gh: logs its argv to <bin>/argv.
  function stubGh(t) {
    const bin = mkdtempSync(path.join(tmpdir(), "cm-v2-gh-"));
    t.after(() => rmSync(bin, { recursive: true, force: true }));
    writeFileSync(path.join(bin, "gh"), `#!/bin/sh\necho "$@" > "${bin}/argv"\n`, { mode: 0o755 });
    return bin;
  }

  test("[RN] publish/gh-prerelease: a version with a '-' part is a prerelease and never Latest; x.y.z is unchanged", posixGh, (t) => {
    for (const [version, pre] of [["2.0.0-next.1", true], ["2.0.0", false]]) {
      const { bare, work } = fixture(t);
      const src = pre ? pushTag(work, bare, `v${version}`) : SRC;
      artifact(work, "b");
      assert.equal(publish(work, "--stage", "--version", version, "--source-commit", src).status, 0);
      const bin = stubGh(t);
      const env = { ...ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
      const r = spawnSync(process.execPath, [SCRIPT, "--promote", "--version", version, "--notes", "n"], { cwd: work, encoding: "utf8", env });
      assert.equal(r.status, 0, r.stderr);
      // D-RN-ORDER-1: the GitHub release is its own step, run only after npm publish.
      const g = spawnSync(process.execPath, [SCRIPT, "--github-release", "--version", version, "--notes", "n"], { cwd: work, encoding: "utf8", env });
      assert.equal(g.status, 0, g.stderr);
      const argv = readFileSync(path.join(bin, "argv"), "utf8").trim().split(" ");
      assert.deepEqual(argv.slice(0, 4), ["release", "create", `v${version}`, "--verify-tag"], version);
      assert.equal(argv.includes("--prerelease"), pre, version);
      assert.equal(argv.includes("--latest=false"), pre, version);
      assert.ok(!argv.includes("--latest") && !argv.includes("--latest=true"), version);
      assert.equal(remoteRef(bare, `refs/tags/v${version}^{commit}`), pre ? src : remoteRef(bare, "refs/heads/release"), version);
    }
  });

  // D-RN-ORDER-1: run 40496186557 (v2.0.0-next.4) made the GitHub prerelease in publish-promote, then npm publish
  // failed, so GitHub showed a release that npm did not have. --promote now moves `release` and pushes the tag only;
  // --github-release makes the GitHub release, and release.yml runs it only after publish-npm succeeds.
  test("[N5] publish/promote-no-gh: promote on origin moves release and pushes the tag, but makes no GitHub release (D-RN-ORDER-1)", posixGh, (t) => {
    const { bare, work } = fixture(t);
    artifact(work, "b");
    assert.equal(publish(work, "--stage", "--version", "2.0.0-next.5", "--source-commit", SRC).status, 0);
    const staged = remoteRef(bare, "refs/heads/release-staging");
    const bin = stubGh(t);
    const env = { ...ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const r = spawnSync(process.execPath, [SCRIPT, "--promote", "--version", "2.0.0-next.5"], { cwd: work, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(remoteRef(bare, "refs/heads/release"), staged);
    assert.equal(remoteRef(bare, "refs/tags/v2.0.0-next.5^{commit}"), staged);
    assert.equal(existsSync(path.join(bin, "argv")), false, "promote never calls gh");
  });

  test("[N5] publish/github-release: makes the GitHub release for the pushed tag with SHA256SUMS (D-RN-ORDER-1)", posixGh, (t) => {
    const { bare, work } = fixture(t);
    const src = pushTag(work, bare, "v2.0.0-next.5");
    artifact(work, "b");
    const bin = stubGh(t);
    const env = { ...ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const r = spawnSync(process.execPath, [SCRIPT, "--github-release", "--version", "2.0.0-next.5", "--notes", "n"], { cwd: work, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(bin, "argv"), "utf8").trim(),
      `release create v2.0.0-next.5 --verify-tag --prerelease --latest=false --title v2.0.0-next.5 --notes n ${path.join("release-out", "SHA256SUMS")}`);
    assert.equal(remoteRef(bare, "refs/tags/v2.0.0-next.5^{commit}"), src, "tag untouched");
  });

  test("[N5] publish/github-release-no-tag: the tag is not on the remote -> refuse, gh not called (D-RN-ORDER-1)", posixGh, (t) => {
    const { work } = fixture(t);
    artifact(work, "b");
    const bin = stubGh(t);
    const env = { ...ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const r = spawnSync(process.execPath, [SCRIPT, "--github-release", "--version", "2.0.0-next.5", "--notes", "n"], { cwd: work, encoding: "utf8", env });
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "release failed: tag v2.0.0-next.5 is not on origin; promote pushes it first\n");
    assert.equal(existsSync(path.join(bin, "argv")), false);
  });

  test("[N5] publish/github-release-args: exactly one mode; --github-release needs --version (D-RN-ORDER-1)", (t) => {
    const { work } = fixture(t);
    const cases = [
      [["--github-release", "--promote", "--version", "2.0.0"], "release failed: pass exactly one of --stage or --promote or --github-release\n"],
      [["--github-release"], "release failed: --version <x.y.z> is required\n"],
    ];
    for (const [args, want] of cases) {
      const r = publish(work, ...args);
      assert.equal(r.status, 1, args.join(" "));
      assert.equal(r.stderr, want, args.join(" "));
    }
  });

  test("[N5] publish/github-release-non-origin: a non-default remote skips gh, as promote did (D-M6-arch-5)", (t) => {
    const { bare, work } = fixture(t);
    pushTag(work, bare, "v2.0.0");
    artifact(work, "b");
    const r = publish(work, "--github-release", "--version", "2.0.0", "--notes", "n", "--remote", bare);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes("gh release skipped"), r.stdout);
  });
});

describe("ADR-0013: release-next (plan then publish)", { concurrency: CONC }, () => {
  // Release-next dry run (DEVIATIONS D-RN-TAG-1): the release.yml path for a pushed v2.* tag, run locally against
  // a bare temp remote. plan.mjs --tag -> publish.mjs --stage -> publish.mjs --promote (fresh checkout) -> publish.mjs
  // --github-release (fresh checkout) with a stub gh. Nothing leaves the machine; npm is never called.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const PLAN = path.join(REPO, "scripts", "release", "plan.mjs");
  const PUBLISH = path.join(REPO, "scripts", "release", "publish.mjs");
  const TAG = "v2.0.0-next.1";
  const VERSION = "2.0.0-next.1";
  const ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };

  function git(cwd, ...args) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  }

  const node = (cwd, script, args, env = ENV) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env });
  const remoteRef = (bare, ref) => spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: bare, encoding: "utf8", env: ENV }).stdout.trim();

  test("[RN] release-next dry run: tag v2.0.0-next.1 -> plan, stage, promote; one tag, prerelease, never Latest", {
    skip: process.platform === "win32" ? "stub gh is a sh script" : false,
  }, (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "cm-v2-release-next-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bare = path.join(root, "remote.git");
    const dev = path.join(root, "dev");
    git(root, "init", "-q", "--bare", "-b", "main", bare);
    git(root, "init", "-q", "-b", "main", dev);
    for (const s of ["feat: first feature", "fix: a fix", "docs: no note"]) {
      writeFileSync(path.join(dev, "f.txt"), s);
      git(dev, "add", "-A");
      git(dev, "commit", "-qm", s);
    }
    git(dev, "remote", "add", "origin", bare);
    git(dev, "push", "-q", "origin", "main");
    // The owner's trigger: an annotated tag pushed to origin.
    git(dev, "tag", "-a", TAG, "-m", TAG);
    git(dev, "push", "-q", "origin", `refs/tags/${TAG}`);
    const src = git(dev, "rev-parse", "HEAD");
    const tagObject = remoteRef(bare, `refs/tags/${TAG}`);

    // plan job: fresh full checkout at the tag, ref_type=tag, ref_name=v2.0.0-next.1.
    const planDir = path.join(root, "plan");
    git(root, "clone", "-q", bare, planDir);
    git(planDir, "checkout", "-q", "--detach", src);
    const p = node(planDir, PLAN, ["--tag", TAG]);
    assert.equal(p.status, 0, p.stderr);
    const out = p.stdout.split("\n");
    assert.equal(out[0], `version=${VERSION}`);
    assert.ok(p.stdout.includes("- feat: first feature") && p.stdout.includes("- fix: a fix"), p.stdout);
    assert.ok(!p.stdout.includes("docs: no note"), p.stdout);
    const notes = p.stdout.slice(p.stdout.indexOf("notes<<EOF\n") + "notes<<EOF\n".length, p.stdout.lastIndexOf("\nEOF\n"));

    // publish-stage job: checkout of the source commit plus the downloaded artifact.
    const stageDir = path.join(root, "stage");
    git(root, "clone", "-q", bare, stageDir);
    git(stageDir, "checkout", "-q", "--detach", src);
    mkdirSync(path.join(stageDir, "release-out"));
    writeFileSync(path.join(stageDir, "release-out", "server.mjs"), "built");
    writeFileSync(path.join(stageDir, "release-out", "SHA256SUMS"), "sums");
    const s = node(stageDir, PUBLISH, ["--stage", "--version", VERSION, "--source-commit", src]);
    assert.equal(s.status, 0, s.stderr);
    const staged = remoteRef(bare, "refs/heads/release-staging");
    assert.notEqual(staged, "");
    assert.equal(remoteRef(bare, `refs/tags/${TAG}`), tagObject, "stage leaves the pushed tag alone");

    // publish-promote job: fresh checkout, artifact, stub gh on PATH, default remote origin.
    const promoteDir = path.join(root, "promote");
    git(root, "clone", "-q", bare, promoteDir);
    git(promoteDir, "checkout", "-q", "--detach", src);
    mkdirSync(path.join(promoteDir, "release-out"));
    writeFileSync(path.join(promoteDir, "release-out", "SHA256SUMS"), "sums");
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "gh"), `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done > "${bin}/argv"\n`, { mode: 0o755 });
    const env = { ...ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const r = node(promoteDir, PUBLISH, ["--promote", "--version", VERSION], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(path.join(bin, "argv")), false, "promote makes no GitHub release (D-RN-ORDER-1)");

    // publish-npm runs here (not in this test). github-release job, only after it succeeds: fresh checkout, artifact.
    const ghDir = path.join(root, "gh-release");
    git(root, "clone", "-q", bare, ghDir);
    git(ghDir, "checkout", "-q", "--detach", src);
    mkdirSync(path.join(ghDir, "release-out"));
    writeFileSync(path.join(ghDir, "release-out", "SHA256SUMS"), "sums");
    const g = node(ghDir, PUBLISH, ["--github-release", "--version", VERSION, "--notes", notes], env);
    assert.equal(g.status, 0, g.stderr);

    assert.equal(remoteRef(bare, "refs/heads/release"), staged, "release = release-staging");
    assert.equal(remoteRef(bare, `refs/tags/${TAG}`), tagObject, "one tag: the pushed one, never re-made");
    assert.equal(remoteRef(bare, `refs/tags/${TAG}^{commit}`), src);
    const tags = git(bare, "tag", "-l");
    assert.equal(tags, TAG, "no second tag on the remote");
    const argv = readFileSync(path.join(bin, "argv"), "utf8").split("\0").slice(0, -1); // NUL: notes span lines
    assert.deepEqual(argv, ["release", "create", TAG, "--verify-tag", "--prerelease", "--latest=false",
      "--title", TAG, "--notes", notes, path.join("release-out", "SHA256SUMS")]);
  });
});

describe("ADR-0013: commit-main.mjs", { concurrency: CONC }, () => {
  // MAIN-ONLY (docs/v2/release/MAIN-ONLY.md): scripts/release/commit-main.mjs makes the release commit on `main` from an unpacked
  // package, tags it (annotated) and pushes both to the remote in one push. Local bare remote; no network.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SCRIPT = path.join(REPO, "scripts", "release", "commit-main.mjs");
  const ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];
  const git = (cwd, ...a) => {
    const r = spawnSync("git", [...ID, ...a], { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const put = (root, rel, value) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), typeof value === "string" ? value : JSON.stringify(value));
  };

  function fixture(t, version) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-v2-commitmain-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bare = path.join(root, "origin.git");
    git(root, "init", "-q", "--bare", bare);
    const work = path.join(root, "work");
    git(root, "clone", "-q", bare, work);
    put(work, "README.md", "x");
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", "feat: init");
    git(work, "push", "-q", "origin", "HEAD:refs/heads/main");
    const pkg = path.join(root, "pkg");
    put(pkg, "package.json", { name: "context-mode", version });
    put(pkg, ".claude-plugin/marketplace.json", { name: "context-mode", owner: { name: "o" }, plugins: [{ name: "context-mode", source: "./", version }] });
    put(pkg, ".claude-plugin/plugin.json", { name: "context-mode", version });
    put(pkg, "server.mjs", "// s");
    put(pkg, "hook.mjs", "// h");
    put(pkg, "gemini-extension.json", { name: "context-mode", version, mcpServers: { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "gemini"] } } });
    put(pkg, "hooks/hooks.json", { hooks: { BeforeTool: [{ hooks: [{ type: "command", command: 'node "${extensionPath}${/}hook.mjs" --agent gemini' }] }] } });
    put(pkg, "hooks/qwen.json", { hooks: {} });
    put(pkg, "qwen-extension.json", { name: "context-mode", version, hooks: "hooks/qwen.json", mcpServers: { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "qwen"] } } });
    return { root, bare, work, pkg };
  }
  const run = (fx, version, extra = []) =>
    spawnSync(process.execPath, [SCRIPT, "--pkg", fx.pkg, "--version", version, "--remote", fx.bare, ...extra], { cwd: fx.work, encoding: "utf8" });

  test("[MAIN-ONLY] commit-main: one release commit on main with the built tree, annotated tag on it, both pushed", (t) => {
    const fx = fixture(t, "2.0.0-next.9");
    const r = run(fx, "2.0.0-next.9");
    assert.equal(r.status, 0, r.stderr);
    const head = git(fx.bare, "rev-parse", "refs/heads/main");
    assert.equal(git(fx.bare, "log", "-1", "--format=%s", head), "chore(release): v2.0.0-next.9");
    assert.equal(git(fx.bare, "cat-file", "-t", "refs/tags/v2.0.0-next.9"), "tag");
    assert.equal(git(fx.bare, "rev-parse", "refs/tags/v2.0.0-next.9^{}"), head);
    const files = git(fx.bare, "ls-tree", "-r", "--name-only", head).split("\n");
    for (const f of ["plugins/claude-code/server.mjs", "plugins/claude-code/SHA256SUMS", ".claude-plugin/marketplace.json",
      ".agents/plugins/marketplace.json", "gemini-extension.json", "hooks/hooks.json", "qwen-extension.json", "README.md"]) {
      assert.ok(files.includes(f), f + " in " + files.join(","));
    }
    assert.equal(git(fx.bare, "log", "-2", "--format=%an").split("\n")[0], "github-actions[bot]");
  });

  test("[MAIN-ONLY] commit-main: main moved meanwhile -> rebase onto it and push again; the tag names the pushed commit", (t) => {
    const fx = fixture(t, "2.0.0");
    const racer = path.join(fx.root, "racer");
    git(fx.root, "clone", "-q", fx.bare, racer);
    // The racer is a second clone: it needs its own identity, a CI runner has no global one.
    const g = `git -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false -C "${racer}"`;
    const r = run(fx, "2.0.0", ["--before-push", `${g} commit -q --allow-empty -m "docs: raced" && ${g} push -q origin HEAD:refs/heads/main`]);
    assert.equal(r.status, 0, r.stderr);
    const head = git(fx.bare, "rev-parse", "refs/heads/main");
    assert.equal(git(fx.bare, "rev-parse", "refs/tags/v2.0.0^{}"), head);
    assert.ok(git(fx.bare, "log", "--format=%s", head).includes("docs: raced"));
  });

  test("[MAIN-ONLY] commit-main: tag already on the remote -> exit 1, nothing pushed", (t) => {
    const fx = fixture(t, "2.0.0");
    git(fx.work, "tag", "-a", "v2.0.0", "-m", "v2.0.0");
    git(fx.work, "push", "-q", fx.bare, "refs/tags/v2.0.0");
    const before = git(fx.bare, "rev-parse", "refs/heads/main");
    const r = run(fx, "2.0.0");
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "release failed: tag v2.0.0 is already on the remote\n");
    assert.equal(git(fx.bare, "rev-parse", "refs/heads/main"), before);
  });

  test("[MAIN-ONLY] commit-main: package version differs from --version -> exit 1", (t) => {
    const fx = fixture(t, "2.0.0");
    const r = run(fx, "2.0.1");
    assert.equal(r.status, 1);
    assert.ok(r.stderr.startsWith("release failed: "), r.stderr);
    assert.ok(!existsSync(path.join(fx.bare, "refs", "tags", "v2.0.1")));
  });

  test("[MAIN-ONLY] commit-main: --rollback-to <sha> restores the generated paths from that release commit as a forward commit, no tag", (t) => {
    const fx = fixture(t, "2.0.0");
    assert.equal(run(fx, "2.0.0").status, 0);
    const good = git(fx.bare, "rev-parse", "refs/heads/main");
    put(fx.pkg, "package.json", { name: "context-mode", version: "2.0.1" });
    assert.equal(run(fx, "2.0.1").status, 0);
    const r = spawnSync(process.execPath, [SCRIPT, "--rollback-to", good, "--remote", fx.bare], { cwd: fx.work, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const head = git(fx.bare, "rev-parse", "refs/heads/main");
    assert.notEqual(head, good);
    assert.equal(git(fx.bare, "merge-base", "--is-ancestor", good, head) === "", true);
    assert.equal(git(fx.bare, "log", "-1", "--format=%s", head), `chore(release): roll back to ${good.slice(0, 12)}`);
    assert.equal(git(fx.bare, "diff", "--stat", good, head, "--", "plugins", ".agents", ".claude-plugin", "gemini-extension.json", "hooks", "qwen-extension.json"), "");
    assert.equal(spawnSync("git", ["rev-parse", "--verify", "--quiet", "refs/tags/v2.0.2"], { cwd: fx.bare }).status, 1);
  });
});

describe("ADR-0013: branch protection check", { concurrency: CONC }, () => {
  // Unit tests for scripts/release/branch-protection.mjs and check-branch-protection.mjs
  // (impl/13 §12, §14.2). No network: the GitHub API is a stub `gh` placed first on PATH.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const DIR = path.join(REPO, "scripts", "release");

  // impl/13 §12.1 step 1, the exact PUT body (ADR-0013 r3 Q14, A70).
  const DOC_BODY = {
    required_status_checks: { strict: true, contexts: ["ci"] },
    enforce_admins: true,
    required_pull_request_reviews: null,
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  };

  // The GET shape GitHub returns when the live setting matches DOC_BODY.
  function liveMatching() {
    return {
      url: "https://api.github.com/repos/o/r/branches/main/protection",
      required_status_checks: { strict: true, contexts: ["ci"], checks: [{ context: "ci", app_id: null }] },
      enforce_admins: { url: "x", enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    };
  }

  test("[M6] branch-protection/settings: settings JSON equals the impl/13 §12 body", () => {
    const onDisk = JSON.parse(readFileSync(path.join(DIR, "branch-protection-settings.json"), "utf8"));
    assert.deepEqual(onDisk, DOC_BODY);
    assert.deepEqual(SETTINGS, DOC_BODY);
  });

  test("[M6] branch-protection/endpoint: targets main of the current repo", () => {
    assert.equal(PROTECTION_ENDPOINT, "repos/{owner}/{repo}/branches/main/protection");
  });

  test("[M6] branch-protection/drift-none: a matching live setting has no drift", () => {
    assert.deepEqual(protectionDrift(SETTINGS, liveMatching()), []);
  });

  test("[M6] branch-protection/drift-each: each of the 4 fields is reported by name", () => {
    const cases = [
      ["required_status_checks.contexts", (l) => { l.required_status_checks.contexts = ["ci", "x"]; }],
      ["enforce_admins.enabled", (l) => { l.enforce_admins.enabled = false; }],
      ["allow_force_pushes", (l) => { l.allow_force_pushes.enabled = true; }],
      ["allow_deletions", (l) => { l.allow_deletions.enabled = true; }],
    ];
    for (const [field, mutate] of cases) {
      const live = liveMatching();
      mutate(live);
      const drift = protectionDrift(SETTINGS, live);
      assert.deepEqual(drift.map((d) => d.field), [field], field);
    }
  });

  test("[M6] branch-protection/drift-missing: no protection at all drifts on all 4 fields", () => {
    assert.equal(protectionDrift(SETTINGS, {}).length, 4);
  });

  // Stub gh: logs its argv and stdin, prints $GH_STUB_OUT, exits $GH_STUB_CODE.
  function stubGh(t) {
    const bin = mkdtempSync(path.join(tmpdir(), "cm-v2-gh-"));
    t.after(() => rmSync(bin, { recursive: true, force: true }));
    const gh = path.join(bin, "gh");
    writeFileSync(gh, `#!/bin/sh\necho "$@" > "${bin}/argv"\ncat > "${bin}/stdin"\nprintf '%s' "$GH_STUB_OUT"\nexit "\${GH_STUB_CODE:-0}"\n`);
    chmodSync(gh, 0o755);
    return bin;
  }

  function run(bin, script, out, code = 0) {
    return spawnSync(process.execPath, [path.join(DIR, script)], {
      encoding: "utf8",
      input: "",
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, GH_STUB_OUT: out, GH_STUB_CODE: String(code) },
    });
  }

  const posix = { skip: process.platform === "win32" ? "stub gh is a sh script" : false };

  test("[M6] branch-protection/put: PUTs the settings file on stdin and prints url + enforce_admins", posix, (t) => {
    const bin = stubGh(t);
    const r = run(bin, "branch-protection.mjs", JSON.stringify(liveMatching()));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(bin, "argv"), "utf8").trim(), `api ${PROTECTION_ENDPOINT} -X PUT --input -`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(bin, "stdin"), "utf8")), DOC_BODY);
    assert.match(r.stdout, /url: https:\/\/api\.github\.com\/repos\/o\/r\/branches\/main\/protection/);
    assert.match(r.stdout, /enforce_admins\.enabled: true/);
  });

  test("[M6] branch-protection/check-pass: GET matches, exit 0", posix, (t) => {
    const bin = stubGh(t);
    const r = run(bin, "check-branch-protection.mjs", JSON.stringify(liveMatching()));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(bin, "argv"), "utf8").trim(), `api ${PROTECTION_ENDPOINT}`);
  });

  test("[M6] branch-protection/check-drift: a drifted field exits 1 and names the field", posix, (t) => {
    const bin = stubGh(t);
    const live = liveMatching();
    live.allow_force_pushes.enabled = true;
    const r = run(bin, "check-branch-protection.mjs", JSON.stringify(live));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /branch protection drift: allow_force_pushes expected false got true/);
  });

  test("[M6] branch-protection/check-gh-fail: a failed gh call exits 1", posix, (t) => {
    const bin = stubGh(t);
    const r = run(bin, "check-branch-protection.mjs", "", 1);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /branch protection check failed: gh api exited 1/);
  });
});
