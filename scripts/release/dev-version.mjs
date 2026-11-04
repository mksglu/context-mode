#!/usr/bin/env node
// scripts/release/dev-version.mjs — the version of the dev tree (v2-design), D-DEV-VERSION-1.
// release.yml stamps the release version into release-out only (build.mjs --version), so package.json and the source-tree
// manifests on v2-design kept an old version after every release (bench said next.8 while npm next was next.20).
//   --check            exit 0 when the tree version is >= the highest pushed v2 release tag; exit 1 when behind (stderr names the fix);
//                      exit 2 when the tags cannot be read (no network, no v2 tag). A tag on HEAD is the release being built: not counted.
//   --write            set every dev version source to the highest pushed v2 tag whose commit is on HEAD. Never lowers a version.
//   --write --push <branch>   also one commit and push to origin <branch>; if the branch moved: fetch, rebase, push again (3 tries).
// Options: --repo <dir> (default cwd). Exit 1 on a failure, with one stderr line. Plain string ops, no regex.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReleaseVersions, parseReleaseVersion, parseTaggedReleases } from "./release-tags.mjs";

const REMOTE = "origin";
const PUSH_TRIES = 3;
const SELF = "node scripts/release/dev-version.mjs";
const SOURCES = Object.freeze(["package.json", "package-lock.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json"]);
const BOT = Object.freeze(["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "-c", "commit.gpgsign=false"]);
const SHORT_SHA = 8;

// "<version>+dev <commit8>": what every reader of a source tree prints, one function (a built release prints its stamped version).
export function devVersionLabel(version, commit) {
  return typeof commit === "string" && commit.length > 0 ? `${version}+dev ${commit.slice(0, SHORT_SHA)}` : `${version}+dev`;
}

function git(repo, ...args) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim().split("\n")[0] };
}

const readJson = (repo, rel) => JSON.parse(readFileSync(path.join(repo, rel), "utf8"));
const writeJson = (repo, rel, obj) => writeFileSync(path.join(repo, rel), JSON.stringify(obj, null, 2) + "\n");

// Every place a dev version lives. Dependency versions in the lockfile are not touched.
// D-REL-MAIN-VERSION-1: commit-main.mjs calls this too, so a release commit on main never leaves a manifest behind.
export function setVersions(repo, version) {
  const touched = [];
  const set = (rel, edit) => {
    if (!existsSync(path.join(repo, rel))) return;
    const obj = readJson(repo, rel);
    edit(obj);
    writeJson(repo, rel, obj);
    touched.push(rel);
  };
  set("package.json", (o) => { o.version = version; });
  set("package-lock.json", (o) => { o.version = version; if (o.packages?.[""]) o.packages[""].version = version; });
  for (const rel of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) set(rel, (o) => { o.version = version; });
  set(".claude-plugin/marketplace.json", (o) => {
    if (o.metadata) o.metadata.version = version;
    for (const p of o.plugins ?? []) p.version = version;
  });
  return touched;
}

// { tags: [{tag, commit}] newest first } or { error } with the exit-2 reason.
function pushedTags(repo) {
  const r = git(repo, "ls-remote", "--tags", REMOTE);
  if (!r.ok) return { error: `cannot read tags from ${REMOTE}: ${r.err}` };
  const tags = parseTaggedReleases(r.out, { prerelease: true });
  if (tags.length === 0) return { error: `no v2 release tag on ${REMOTE}` };
  return { tags };
}

function fail(reason, code = 1) {
  process.stderr.write(`${reason}\n`);
  process.exit(code);
}

function treeVersion(repo) {
  const v = readJson(repo, "package.json").version;
  const parsed = parseReleaseVersion(v);
  if (!parsed) fail(`dev-version failed: package.json version ${JSON.stringify(v)} is not x.y.z[-pre]`);
  return { text: v, parsed };
}

function check(repo) {
  const t = pushedTags(repo);
  if (t.error) fail(t.error, 2);
  const head = git(repo, "rev-parse", "HEAD").out;
  const counted = t.tags.filter((x) => x.commit !== head);
  if (counted.length === 0) fail(`no v2 release tag on ${REMOTE} below HEAD`, 2);
  const top = counted[0];
  const have = treeVersion(repo);
  if (compareReleaseVersions(have.parsed, parseReleaseVersion(top.tag.slice(1))) < 0) {
    fail(`dev version ${have.text} is behind ${top.tag}. Fix: ${SELF} --write`);
  }
  process.stdout.write(`dev version ${have.text} is current (highest tag ${top.tag})\n`);
}

function write(repo, branch) {
  const t = pushedTags(repo);
  if (t.error) fail(t.error, 2);
  const top = t.tags[0];
  if (!git(repo, "merge-base", "--is-ancestor", top.commit, "HEAD").ok) {
    process.stdout.write(`${top.tag} is not on ${branch ?? "this branch"}: nothing written\n`);
    return;
  }
  const version = top.tag.slice(1);
  const have = treeVersion(repo);
  if (compareReleaseVersions(have.parsed, parseReleaseVersion(version)) >= 0) {
    process.stdout.write(`dev version ${have.text} already current (highest tag ${top.tag})\n`);
    return;
  }
  const files = setVersions(repo, version);
  process.stdout.write(`dev version ${have.text} -> ${version} (${files.join(", ")})\n`);
  if (branch === undefined) return;
  if (!git(repo, "add", "--", ...files).ok) fail("dev-version failed: git add");
  const c = git(repo, ...BOT, "commit", "-q", "-m", `chore(release): dev tree version ${version}`);
  if (!c.ok) fail(`dev-version failed: git commit: ${c.err}`);
  for (let attempt = 1; attempt <= PUSH_TRIES; attempt++) {
    if (git(repo, "push", "-q", REMOTE, `HEAD:refs/heads/${branch}`).ok) return;
    const f = git(repo, "fetch", "-q", "--no-tags", REMOTE, branch);
    if (!f.ok) fail(`dev-version failed: git fetch: ${f.err}`);
    const rb = git(repo, ...BOT, "rebase", "-q", "FETCH_HEAD");
    if (!rb.ok) {
      git(repo, "rebase", "--abort");
      fail(`dev-version failed: rebase onto ${REMOTE}/${branch}: ${rb.err}`);
    }
  }
  fail(`dev-version failed: push to ${branch} rejected ${PUSH_TRIES} times`);
}

function main(argv) {
  let repo = process.cwd();
  let mode;
  let branch;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && argv[i + 1] !== undefined) repo = path.resolve(argv[++i]);
    else if (a === "--check" || a === "--write") mode = a;
    else if (a === "--push" && argv[i + 1] !== undefined) branch = argv[++i];
    else fail(`dev-version failed: unknown argument ${a}. Usage: ${SELF} --check | --write [--push <branch>] [--repo <dir>]`);
  }
  if (mode === undefined) fail(`dev-version failed: need --check or --write. Usage: ${SELF} --check | --write [--push <branch>] [--repo <dir>]`);
  if (branch !== undefined && mode !== "--write") fail("dev-version failed: --push goes with --write");
  if (mode === "--check") check(repo);
  else write(repo, branch);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
