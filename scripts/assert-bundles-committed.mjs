#!/usr/bin/env node
// Drift guard — are the tracked bundles what the tracked sources produce?
//
// scripts/assert-bundle.mjs checks bundle CONTENT for one violation class (the
// esbuild __require throwing shim, #511). It never compares a bundle against a
// fresh build, so editing src/ and forgetting `npm run bundle` yields a green
// tsc, a green assert-bundle, a green assert-asymmetric-drift and a green
// vitest run — while the artifact that actually ships is the previous build.
// The maintainer compensated with a post-merge bot whose only job was to
// rewrite the bundles; this makes the pre-merge case fail instead.
//
// Run it AFTER a build. A bundle that differs from HEAD was stale in the
// commit under review.
//
// This is deliberately NOT wired into `npm run build`: `pretest` builds before
// testing, so failing there would break the suite for anyone mid-edit, before
// they have a chance to commit the regenerated output. CI and pre-commit call
// it instead.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Run a git command, returning stdout. Throws on a non-zero exit. */
function git(args) {
  return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function inGitWorkTree() {
  try {
    return git(["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

function isTracked(file) {
  try {
    git(["ls-files", "--error-unmatch", "--", file]);
    return true;
  } catch {
    return false;
  }
}

function differsFromHead(file) {
  try {
    git(["diff", "--quiet", "HEAD", "--", file]);
    return false;
  } catch {
    return true;
  }
}

export function checkBundleCommitted(file) {
  if (!isTracked(file)) {
    return { committed: false, reason: "not tracked by git — a build of this path would be lost" };
  }
  if (differsFromHead(file)) {
    return {
      committed: false,
      reason: "differs from HEAD — the committed bundle is stale; run `npm run bundle` and commit the result",
    };
  }
  return { committed: true, reason: null };
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error(
      "assert-bundles-committed: no bundle paths provided.\nUsage: node scripts/assert-bundles-committed.mjs <file> [<file>...]",
    );
    process.exit(2);
  }

  // Tarball installs and vendored copies have no git metadata. There is
  // nothing to compare against, and failing would break `npm i -g` consumers.
  if (!inGitWorkTree()) {
    console.log("assert-bundles-committed: SKIP (not a git work tree — nothing to compare against)");
    return;
  }

  let failed = false;
  for (const f of files) {
    const { committed, reason } = checkBundleCommitted(f);
    if (committed) {
      console.log(`assert-bundles-committed: OK       ${f}`);
    } else {
      failed = true;
      console.error(`assert-bundles-committed: FAIL     ${f}`);
      console.error(`  - ${reason}`);
    }
  }

  if (failed) {
    console.error(
      "\nA tracked bundle does not match a build of the tracked sources. The fix is in the\nrepository but would not ship. Run `npm run bundle` and commit the regenerated files.",
    );
  }
  process.exit(failed ? 1 : 0);
}

// Run only when invoked directly. Compare via pathToFileURL: on Windows
// `import.meta.url` is `file:///C:/...` while `process.argv[1]` is `C:\...`,
// and a literal `file://${argv[1]}` template never matches — which is exactly
// how assert-bundle's main() went unsung on Windows until #... fixed it.
const isDirectInvocation =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectInvocation) {
  main();
}
