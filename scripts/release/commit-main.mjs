#!/usr/bin/env node
// scripts/release/commit-main.mjs — the last write step of the one-click release (docs/v2/release/MAIN-ONLY.md,
// DEVIATIONS D-MO-1). Run in a checkout of the repo; the remote's `main` is the base.
//   release:  node scripts/release/commit-main.mjs --pkg <unpacked package dir> --version <v> [--remote origin]
//             writes the main tree (build/main-tree.mjs), one commit `chore(release): v<v>`, annotated tag v<v> on it,
//             one atomic push of main + tag. If main moved: rebase onto it, re-tag, push again (3 tries).
//   rollback: node scripts/release/commit-main.mjs --rollback-to <sha> [--remote origin]
//             a forward commit that restores the generated paths from that release commit. No tag. main is never reset.
// --before-push <shell command>: test seam, runs once before the first push.
// Failure: one stderr line `release failed: <reason>` and exit 1.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAIN_BRANCH = "main";
const TAG_PREFIX = "v";
const PUSH_TRIES = 3;
const GENERATED = Object.freeze(["plugins", ".claude-plugin", ".agents", "gemini-extension.json", "hooks", "qwen-extension.json", "package.json"]);
const BOT = Object.freeze(["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false"]);
const MAIN_TREE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "build", "main-tree.mjs");
const VALUE_FLAGS = Object.freeze(["--pkg", "--version", "--remote", "--rollback-to", "--before-push"]);

function fail(reason) {
  process.stderr.write(`release failed: ${reason}\n`);
  process.exit(1);
}

function git(...args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim().split("\n")[0] };
}
function mustGit(...args) {
  const r = git(...args);
  if (!r.ok) fail(`git ${args.find((a) => !a.startsWith("-")) ?? args[0]}: ${r.err}`);
  return r.out;
}

function parseArgs(argv) {
  const out = { remote: "origin" };
  for (let i = 0; i < argv.length; i += 2) {
    if (!VALUE_FLAGS.includes(argv[i]) || argv[i + 1] === undefined) fail(`unknown argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

// Base = the remote's main, as a detached HEAD (no local or remote branch is created).
function checkoutBase(remote) {
  mustGit("fetch", "-q", "--no-tags", remote, MAIN_BRANCH);
  mustGit("checkout", "-q", "--detach", "FETCH_HEAD");
}

function pushWithRetry(remote, tag, beforePush) {
  for (let attempt = 1; attempt <= PUSH_TRIES; attempt++) {
    if (attempt === 1 && beforePush !== undefined) {
      const r = spawnSync(beforePush, { shell: true, encoding: "utf8" });
      if (r.status !== 0) fail(`--before-push failed: ${(r.stderr ?? "").trim()}`);
    }
    const push = git("push", "-q", "--atomic", remote, `HEAD:refs/heads/${MAIN_BRANCH}`, ...(tag ? [`refs/tags/${tag}`] : []));
    if (push.ok) return;
    if (attempt === PUSH_TRIES) fail(`push to ${remote} ${MAIN_BRANCH} failed after ${PUSH_TRIES} tries: ${push.err}`);
    mustGit("fetch", "-q", "--no-tags", remote, MAIN_BRANCH);
    const rebase = git(...BOT, "rebase", "FETCH_HEAD");
    if (!rebase.ok) { git("rebase", "--abort"); fail(`rebase onto ${remote}/${MAIN_BRANCH} failed: ${rebase.err}`); }
    if (tag) mustGit(...BOT, "tag", "-f", "-a", tag, "-m", tag);
  }
}

function release({ pkg, version, remote, "before-push": beforePush }) {
  if (pkg === undefined || version === undefined) fail("--pkg and --version are required");
  const tag = TAG_PREFIX + version;
  if (mustGit("ls-remote", "--tags", remote, `refs/tags/${tag}`) !== "") fail(`tag ${tag} is already on the remote`);
  checkoutBase(remote);
  const r = spawnSync(process.execPath, [MAIN_TREE, "--pkg", path.resolve(pkg), "--repo", process.cwd(), "--version", version], { encoding: "utf8" });
  if (r.status !== 0) fail((r.stderr ?? "").trim().replace("main-tree failed: ", "main tree: "));
  if (existsSync("package.json")) {
    const p = JSON.parse(readFileSync("package.json", "utf8"));
    if (p.version !== version) { p.version = version; writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n"); }
  }
  mustGit("add", "-A", "--", ...GENERATED.filter((g) => existsSync(g)));
  mustGit(...BOT, "commit", "-q", "--allow-empty", "-m", `chore(release): ${tag}`);
  mustGit(...BOT, "tag", "-a", tag, "-m", tag);
  pushWithRetry(remote, tag, beforePush);
}

function rollback({ "rollback-to": sha, remote, "before-push": beforePush }) {
  checkoutBase(remote);
  if (!git("cat-file", "-e", `${sha}^{commit}`).ok) mustGit("fetch", "-q", "--no-tags", remote, sha);
  const at = mustGit("rev-parse", "--verify", `${sha}^{commit}`);
  for (const g of GENERATED) {
    git("rm", "-r", "-q", "-f", "--ignore-unmatch", "--", g);
    if (git("ls-tree", "--name-only", at, "--", g).out !== "") mustGit("checkout", at, "--", g);
  }
  mustGit("add", "-A", "--", ...GENERATED.filter((g) => existsSync(g)));
  mustGit(...BOT, "commit", "-q", "--allow-empty", "-m", `chore(release): roll back to ${at.slice(0, 12)}`);
  pushWithRetry(remote, null, beforePush);
}

const args = parseArgs(process.argv.slice(2));
if (args["rollback-to"] !== undefined) rollback(args);
else release(args);
