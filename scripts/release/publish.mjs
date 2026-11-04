#!/usr/bin/env node
// scripts/release/publish.mjs — impl/13-build-release.md §11.1; DEVIATIONS D-M6-arch-5, D-M6-P2-1.
//
//   --stage   --version <x.y.z> --source-commit <sha> [--remote <name-or-path>]
//     Run in a checkout of `release-staging` (or any git repo on the first release) with the
//     build artifact in ./release-out. Puts exactly release-out/* on `release-staging`, one commit
//     "release v<x.y.z>" with trailer "Source-Commit: <sha>", tags v<x.y.z> annotated and local only
//     (the draft tag), pushes `release-staging` with --force-with-lease.
//   --promote --version <x.y.z> [--remote <name-or-path>]
//     Moves `release` to the exact `release-staging` commit (--force-with-lease) and pushes the tag.
//     It makes no GitHub release (D-RN-ORDER-1).
//     A `release` branch that holds only untagged (rehearsal) commits is replaced. A pushed annotated v2+
//     tag whose commit is in `release` must be in the staged commit too, else refuse (D-FU-RF-1).
//
// Release-next (D-RN-TAG-1): <version> may be x.y.z-<prerelease>. When v<version> is already on the remote
// (release.yml started by a pushed v2.* tag), stage requires it to name --source-commit and makes no tag;
// promote requires it to name the staged Source-Commit and pushes no tag. A prerelease GitHub release gets
// --prerelease --latest=false, so it never shows as Latest over v1.
//
//   --github-release --version <x.y.z> [--notes <text>] [--remote <name-or-path>]
//     On the default remote runs `gh release create v<x.y.z> --verify-tag` with release-out/SHA256SUMS. The tag
//     must already be on the remote. release.yml runs this only after publish-npm succeeded (or was not asked
//     for), so a failed npm publish leaves no GitHub release (D-RN-ORDER-1, run 40496186557, v2.0.0-next.4).
//
// A failure writes one line "release failed: <reason>" to stderr and exits 1 (impl/13 §1, §10).
// Node built-ins only; no regex (TECH-SPEC §11): arguments and git output are read with plain
// string operations.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  GIT_DIR_NAME,
  GIT_REMOTE_NAME as RELEASE_REMOTE_DEFAULT,
  LS_REMOTE_FIELD_SEP,
  RELEASE_BRANCH,
  RELEASE_SUMS_FILE,
} from "../../src/core/contracts/constants.ts";
import { isPrerelease, isReleaseVersion, parseTaggedReleases, tagCommit } from "./release-tags.mjs";

// Release-script values with no src/ reader (D-M6-P2-1; same pattern as plan.mjs, M6-P1).
const RELEASE_STAGING_BRANCH = "release-staging";
const RELEASE_OUT_DIR = "release-out";
const RELEASE_TAG_PREFIX = "v";
const SOURCE_COMMIT_TRAILER = "Source-Commit";

class ReleaseError extends Error {}

function fail(reason) {
  throw new ReleaseError(reason);
}

function parseArgs(argv) {
  const args = { stage: false, promote: false, githubRelease: false, remote: RELEASE_REMOTE_DEFAULT };
  const valued = { "--version": "version", "--source-commit": "sourceCommit", "--notes": "notes", "--remote": "remote" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stage") args.stage = true;
    else if (a === "--promote") args.promote = true;
    else if (a === "--github-release") args.githubRelease = true;
    else if (a in valued) {
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      args[valued[a]] = argv[++i];
    } else fail(`unknown argument ${a}`);
  }
  if ([args.stage, args.promote, args.githubRelease].filter(Boolean).length !== 1) fail("pass exactly one of --stage or --promote or --github-release");
  if (!isReleaseVersion(args.version)) fail("--version <x.y.z> is required");
  if (args.stage && !isSha(args.sourceCommit)) fail("--stage needs --source-commit <40-hex sha>");
  return args;
}

function isSha(s) {
  return typeof s === "string" && s.length === 40 && [...s].every((c) => (c >= "0" && c <= "9") || (c >= "a" && c <= "f"));
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error) fail(`${cmd} ${args.join(" ")}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")}: ${(r.stderr || r.stdout).trim().split("\n")[0]}`);
  return r.stdout.trim();
}

const git = (...args) => run("git", args);

// The sha of refs/heads/<branch> on the remote, or "" when the branch does not exist there.
function remoteHead(remote, branch) {
  const out = git("ls-remote", "--heads", remote, `refs/heads/${branch}`);
  return out === "" ? "" : out.split(LS_REMOTE_FIELD_SEP)[0];
}

// The commit v<version> names on the remote, or "" when the remote has no such tag.
const remoteTag = (remote, tag) => tagCommit(git("ls-remote", "--tags", remote), tag);

// --force-with-lease=<ref>:<expect>; an empty expect means "the ref must not exist yet".
const lease = (branch, expect) => `--force-with-lease=refs/heads/${branch}:${expect}`;

function stage({ version, sourceCommit, remote }) {
  const cwd = process.cwd();
  const outDir = path.join(cwd, RELEASE_OUT_DIR);
  if (!existsSync(path.join(outDir, RELEASE_SUMS_FILE))) fail(`${RELEASE_OUT_DIR}/${RELEASE_SUMS_FILE} not found`);
  const tag = RELEASE_TAG_PREFIX + version;
  const pushed = remoteTag(remote, tag);
  if (pushed !== "" && pushed !== sourceCommit) fail(`tag ${tag} on ${remote} points at ${pushed}, not source commit ${sourceCommit}`);

  const prior = remoteHead(remote, RELEASE_STAGING_BRANCH);
  if (prior === "") {
    git("switch", "--orphan", RELEASE_STAGING_BRANCH);
  } else {
    git("fetch", remote, `refs/heads/${RELEASE_STAGING_BRANCH}`);
    git("switch", "--force-create", RELEASE_STAGING_BRANCH, "FETCH_HEAD");
  }

  // The artifact sits inside the tree this step empties: move it aside, empty the tree, copy it in.
  const hold = mkdtempSync(path.join(tmpdir(), "cm-release-out-"));
  try {
    cpSync(outDir, hold, { recursive: true });
    for (const name of readdirSync(cwd)) {
      if (name !== GIT_DIR_NAME) rmSync(path.join(cwd, name), { recursive: true, force: true });
    }
    cpSync(hold, cwd, { recursive: true });
  } finally {
    rmSync(hold, { recursive: true, force: true });
  }

  // Empty the index first so `add -A` hashes every file: a same-size file copied in within the
  // index's timestamp granularity (Windows) would otherwise keep the old blob (M7-W5).
  git("read-tree", "--empty");
  git("add", "-A");
  git("commit", "--quiet", "--allow-empty", "-m", `release ${tag}`, "-m", `${SOURCE_COMMIT_TRAILER}: ${sourceCommit}`);
  if (pushed === "") git("tag", "-a", tag, "-m", tag, "--no-sign");
  git("push", remote, `HEAD:refs/heads/${RELEASE_STAGING_BRANCH}`, lease(RELEASE_STAGING_BRANCH, prior));
  const head = git("rev-parse", "HEAD");
  console.log(pushed === ""
    ? `staged ${tag} on ${RELEASE_STAGING_BRANCH} at ${head} (tag local, not pushed)`
    : `staged ${tag} on ${RELEASE_STAGING_BRANCH} at ${head} (tag ${tag} already on ${remote} at ${pushed}, reused)`);
}

// 0 = ancestor, 1 = not, anything else = the commit is not in this clone (so not in the fetched branch).
const isAncestor = (commit, of) => spawnSync("git", ["merge-base", "--is-ancestor", commit, of], { encoding: "utf8" }).status === 0;

// Refuse to drop a tagged release: every pushed release tag (but the one being promoted) whose commit
// is in the current `release` branch must also be in the staged commit. Untagged commits may go.
function refuseDroppedRelease(remote, tag, staged) {
  const current = remoteHead(remote, RELEASE_BRANCH);
  if (current === "") return;
  // A shallow checkout lacks the release history: deepen only the fetched branch.
  const shallow = git("rev-parse", "--is-shallow-repository") === "true" ? ["--depth=2147483647"] : [];
  git("fetch", "--no-tags", ...shallow, remote, `refs/heads/${RELEASE_BRANCH}`);
  const tip = git("rev-parse", "FETCH_HEAD");
  for (const t of parseTaggedReleases(git("ls-remote", "--tags", remote))) {
    if (t.tag === tag) continue;
    if (isAncestor(t.commit, tip) && !isAncestor(t.commit, staged)) {
      fail(`tagged release ${t.tag} (${t.commit}) is not in ${RELEASE_STAGING_BRANCH}; refusing`);
    }
  }
}

function promote({ version, remote }) {
  const tag = RELEASE_TAG_PREFIX + version;
  if (remoteHead(remote, RELEASE_STAGING_BRANCH) === "") fail(`${RELEASE_STAGING_BRANCH} does not exist on ${remote}`);
  git("fetch", remote, `refs/heads/${RELEASE_STAGING_BRANCH}`);
  const staged = git("rev-parse", "FETCH_HEAD");
  refuseDroppedRelease(remote, tag, staged);

  const pushed = remoteTag(remote, tag);
  if (pushed !== "") {
    const body = git("log", "-1", "--format=%B", staged);
    const line = body.split("\n").find((l) => l.startsWith(`${SOURCE_COMMIT_TRAILER}: `));
    const src = line ? line.slice(SOURCE_COMMIT_TRAILER.length + 2).trim() : "";
    if (pushed !== src) fail(`tag ${tag} on ${remote} points at ${pushed}, not ${SOURCE_COMMIT_TRAILER} ${src} of ${RELEASE_STAGING_BRANCH} ${staged}`);
    git("push", remote, `${staged}:refs/heads/${RELEASE_BRANCH}`, lease(RELEASE_BRANCH, remoteHead(remote, RELEASE_BRANCH)));
    console.log(`promoted ${tag}: ${RELEASE_BRANCH} = ${staged} (tag ${tag} already on ${remote} at ${pushed}, not pushed)`);
  } else {
    pushDraftTag(remote, tag, staged);
  }
  console.log(`gh release skipped: publish.mjs --github-release makes it after npm publish (D-RN-ORDER-1)`);
}

function pushDraftTag(remote, tag, staged) {
  // The draft tag is local to the stage job's checkout; a fresh promote checkout makes the same
  // annotated tag on the staged commit (D-M6-P2-1). An existing tag must already point there.
  const local = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`], { encoding: "utf8" });
  if (local.status === 0) {
    if (local.stdout.trim() !== staged) fail(`tag ${tag} points at ${local.stdout.trim()}, not ${RELEASE_STAGING_BRANCH} ${staged}`);
  } else {
    git("tag", "-a", tag, "-m", tag, "--no-sign", staged);
  }

  git("push", remote, `${staged}:refs/heads/${RELEASE_BRANCH}`, lease(RELEASE_BRANCH, remoteHead(remote, RELEASE_BRANCH)));
  git("push", remote, `refs/tags/${tag}`);
  console.log(`promoted ${tag}: ${RELEASE_BRANCH} = ${staged}`);
}

function githubRelease({ version, notes, remote }) {
  const tag = RELEASE_TAG_PREFIX + version;
  if (remoteTag(remote, tag) === "") fail(`tag ${tag} is not on ${remote}; promote pushes it first`);
  if (remote !== RELEASE_REMOTE_DEFAULT) {
    console.log(`gh release skipped: remote ${remote} is not ${RELEASE_REMOTE_DEFAULT} (D-M6-arch-5)`);
    return;
  }
  const sums = path.join(RELEASE_OUT_DIR, RELEASE_SUMS_FILE);
  const pre = isPrerelease(version) ? ["--prerelease", "--latest=false"] : [];
  run("gh", ["release", "create", tag, "--verify-tag", ...pre, "--title", tag, "--notes", notes ?? "", sums]);
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.stage) stage(args);
  else if (args.promote) promote(args);
  else githubRelease(args);
}

main(process.argv.slice(2)).catch((err) => {
  if (!(err instanceof ReleaseError)) throw err;
  process.stderr.write(`release failed: ${err.message}\n`);
  process.exit(1);
});
