// impl/07 §6 step 4b + Errors (BUNDLE_HASH_MISMATCH), impl/13 §4 (SHA256SUMS shape), DEVIATIONS D-M5-U3-1.
// Checks every file of a fetched release tree against <dir>/SHA256SUMS. The tree must hold exactly the listed
// files (the clone's top-level .git dir and SHA256SUMS itself excepted), each with the listed sha256 hex.
// Only regular files and dirs count: a symlink or other entry is a mismatch (D-M6-V1-1, review-M5).
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_DIR_NAME, HASH_ENCODING, RELEASE_SUMS_FILE, SUMS_HASH_ALGORITHM, SUMS_LINE_END, SUMS_LINE_SEP } from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";

function mismatch(): CtxError {
  return new CtxError("BUNDLE_HASH_MISMATCH");
}

// Relative POSIX path -> listed hex. Malformed, empty-path or duplicate lines are a mismatch.
function parseSums(text: string): Map<string, string> {
  const lines = text.split(SUMS_LINE_END);
  if (lines[lines.length - 1] === "") lines.pop(); // the "\n" after the last line
  const sums = new Map<string, string>();
  for (const line of lines) {
    const at = line.indexOf(SUMS_LINE_SEP);
    if (at < 0) throw mismatch();
    const rel = line.slice(at + SUMS_LINE_SEP.length);
    if (rel === "" || sums.has(rel)) throw mismatch();
    sums.set(rel, line.slice(0, at));
  }
  return sums;
}

// Every file under dir as a relative POSIX path, same walk as build/hash.mjs (impl/13 §4 steps 1-3).
function walk(dir: string, prefix: string, out: Map<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : prefix + "/" + entry.name;
    if (prefix === "" && (entry.name === GIT_DIR_NAME || entry.name === RELEASE_SUMS_FILE)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, rel, out);
    else if (entry.isFile()) out.set(rel, abs);
    else throw mismatch(); // symlink, fifo, socket, device
  }
}

export function verifySums(dir: string): void {
  const sumsPath = join(dir, RELEASE_SUMS_FILE);
  const sumsStat = lstatSync(sumsPath, { throwIfNoEntry: false });
  if (sumsStat === undefined || !sumsStat.isFile()) throw mismatch();
  const sums = parseSums(readFileSync(sumsPath, "utf8"));
  const files = new Map<string, string>();
  walk(dir, "", files);
  if (files.size !== sums.size) throw mismatch();
  for (const [rel, abs] of files) {
    const want = sums.get(rel);
    if (want === undefined) throw mismatch();
    const got = createHash(SUMS_HASH_ALGORITHM).update(readFileSync(abs)).digest(HASH_ENCODING);
    if (got !== want) throw mismatch();
  }
}
