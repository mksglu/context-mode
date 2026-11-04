#!/usr/bin/env node
// build/check-secrets.mjs: no gateway tenant id in a tracked text file (D-FU-OI-TENANT-1).
// Usage: node build/check-secrets.mjs  (run from the repo root; repoRoot = process.cwd()).
// A tenant id is "t_" plus 8 hex digits as a whole word. Reads the tracked tree only (git ls-files -z);
// a file with a NUL byte is binary and is skipped. Prints path and line, never the match.
// Clean: prints "check-secrets: clean", exit 0. Else one line per hit, exit 1:
// "check-secrets: tenant id pattern in <path>:<line>".
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const TENANT_ID = /(?<![A-Za-z0-9_])t_[0-9a-fA-F]{8}(?![A-Za-z0-9_])/;

const repoRoot = process.cwd();
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\0")
  .filter((p) => p !== "");

const hits = [];
for (const rel of tracked) {
  const abs = path.join(repoRoot, rel);
  let buf;
  try {
    if (!statSync(abs).isFile()) continue; // deleted in the work tree, or a submodule
    buf = readFileSync(abs);
  } catch {
    continue;
  }
  if (buf.includes(0)) continue; // binary
  const lines = buf.toString("utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (TENANT_ID.test(lines[i])) hits.push(`check-secrets: tenant id pattern in ${rel}:${i + 1}`);
  }
}

if (hits.length === 0) {
  console.log("check-secrets: clean");
} else {
  for (const h of hits) console.log(h);
  process.exitCode = 1;
}
