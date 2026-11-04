#!/usr/bin/env node
// scripts/release/rollback.mjs — impl/13-build-release.md §11.3, DEVIATIONS D-M6-arch-5.
// Hard-resets the `release` branch on <remote> to a known-good prior commit <sha>.
// Usage: node scripts/release/rollback.mjs --sha <sha> [--remote <name-or-path>]
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { GIT_LS_REMOTE, GIT_REMOTE_NAME, LS_REMOTE_FIELD_SEP, RELEASE_BRANCH } from "../../src/core/contracts/constants.ts";

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function fail(msg) {
  process.stderr.write(`rollback: ${msg}\n`);
  process.exit(1);
}

async function main(args) {
  // 1. fetch the current release tip from the remote.
  const fetched = git(["fetch", args.remote, RELEASE_BRANCH]);
  if (!fetched.ok) fail(`git fetch ${args.remote} ${RELEASE_BRANCH} failed: ${fetched.err}`);
  const tip = git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
  if (!tip.ok) fail(`cannot resolve fetched ${RELEASE_BRANCH} tip: ${tip.err}`);
  const target = git(["rev-parse", "--verify", `${args.sha}^{commit}`]);
  if (!target.ok) fail(`unknown commit ${args.sha}: ${target.err}`);

  // 2. refuse to roll forward: sha must be an ancestor of the current release tip.
  const anc = git(["merge-base", "--is-ancestor", target.out, tip.out]);
  if (!anc.ok) fail(`${target.out} is not an ancestor of ${RELEASE_BRANCH} tip ${tip.out}; refusing`);

  // 3. hard reset of the remote branch ref (no smoke re-run, §11.3 step 3).
  const pushed = git(["push", args.remote, `${target.out}:refs/heads/${RELEASE_BRANCH}`, "--force"]);
  if (!pushed.ok) fail(`git push ${args.remote} ${target.out}:${RELEASE_BRANCH} failed: ${pushed.err}`);

  // 4. operator log: rolled-back-to sha and the current release tip on the remote.
  const now = git([GIT_LS_REMOTE, args.remote, `refs/heads/${RELEASE_BRANCH}`]);
  const current = now.ok ? now.out.split(LS_REMOTE_FIELD_SEP)[0] : "unknown";
  process.stdout.write(`rolled back to: ${target.out}\nprevious ${RELEASE_BRANCH} tip: ${tip.out}\ncurrent ${RELEASE_BRANCH} tip: ${current}\n`);
}

const { values } = parseArgs({
  options: { sha: { type: "string" }, remote: { type: "string", default: GIT_REMOTE_NAME } },
  strict: true,
});
if (!values.sha) fail("--sha <sha> is required");
await main({ sha: values.sha, remote: values.remote });
