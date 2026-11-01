#!/usr/bin/env node
// build/hash.mjs — SHA256SUMS over the release tree (docs/architecture/modules/13-build-release.md §4).
// Usage: node build/hash.mjs --out <dir>
//   Walks <dir> (plain readdirSync recursion), hashes every file except <dir>/SHA256SUMS,
//   sorts by relative POSIX path and writes `<hex>  <relative/path>\n` lines (sha256sum format,
//   no trailing blank line). src/core/ops/verify-sums.ts reads the same shape (D-M5-U3-1).
// Failure: one stderr line `build failed: <reason>` and exit 1 (impl/13 §1).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_SUMS_FILE,
  SUMS_LINE_SEP,
  SUMS_LINE_END,
  SUMS_HASH_ALGORITHM,
  HASH_ENCODING,
} from "../src/core/contracts/constants.ts";

// §4 steps 1-2: every file under dir as [relative POSIX path, absolute path]; the top-level
// SHA256SUMS is skipped so a rerun never hashes its own output.
function walk(dir, prefix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : prefix + "/" + entry.name;
    if (prefix === "" && entry.name === RELEASE_SUMS_FILE) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, rel, out);
    else out.push([rel, abs]);
  }
  return out;
}

export function writeHashes(outDir) {
  const files = walk(outDir, "", []);
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)); // §4 step 3
  const lines = files.map(
    ([rel, abs]) =>
      createHash(SUMS_HASH_ALGORITHM).update(readFileSync(abs)).digest(HASH_ENCODING) + SUMS_LINE_SEP + rel + SUMS_LINE_END,
  );
  writeFileSync(path.join(outDir, RELEASE_SUMS_FILE), lines.join("")); // §4 step 4
}

function parseArgs(argv) {
  if (argv.length === 2 && argv[0] === "--out") return argv[1];
  throw new Error("usage: node build/hash.mjs --out <dir>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    writeHashes(parseArgs(process.argv.slice(2)));
  } catch (err) {
    const reason = String(err && err.message ? err.message : err);
    process.stderr.write(`build failed: ${reason.split("\n").join(" ")}\n`);
    process.exitCode = 1;
  }
}
