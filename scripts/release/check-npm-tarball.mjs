#!/usr/bin/env node
// Gate before `npm publish` (ADR-0019 D1, S-NPM finding 1): the npm tarball of <dir> must equal <dir>/SHA256SUMS.
// README.md and LICENSE must be listed and not empty (D-NPM-README-1).
// File list = SHA256SUMS rows + SHA256SUMS itself; every row hash must match the packed bytes; `npm pkg fix` must be a no-op.
// Usage: node check-npm-tarball.mjs [dir]   (default: cwd). Prints PASS|FAIL; exit 1 on FAIL. Publishes nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".");
const bad = [];
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
const tmp = mkdtempSync(path.join(tmpdir(), "cm-npm-tarball-"));
try {
  const sums = new Map(readFileSync(path.join(dir, "SHA256SUMS"), "utf8").trim().split("\n").map((l) => { const [h, ...r] = l.split("  "); return [r.join("  "), h]; }));
  for (const need of ["package.json", "cli.mjs", "README.md", "LICENSE"]) if (!sums.has(need)) bad.push(`${need} is not listed in SHA256SUMS`);
  // D-NPM-README-1: npmjs.com shows README.md of the tarball; next.21 and next.22 had none, so the page was empty.
  for (const doc of ["README.md", "LICENSE"]) if (sums.has(doc) && readFileSync(path.join(dir, doc)).length === 0) bad.push(`${doc} is empty`);
  const pack = sh("npm", ["pack", "--json", "--pack-destination", tmp], dir);
  if (pack.status !== 0) { bad.push(`npm pack failed: ${pack.stderr.trim()}`); }
  else {
    const info = JSON.parse(pack.stdout)[0];
    const want = [...sums.keys(), "SHA256SUMS"].sort();
    const got = info.files.map((f) => f.path).sort();
    for (const f of want) if (!got.includes(f)) bad.push(`missing from tarball: ${f}`);
    for (const f of got) if (!want.includes(f)) bad.push(`not in SHA256SUMS: ${f}`);
    const x = sh("tar", ["-xzf", path.join(tmp, info.filename), "-C", tmp], tmp);
    if (x.status !== 0) bad.push(`untar failed: ${x.stderr.trim()}`);
    else for (const [rel, h] of sums) {
      let hash = "";
      try { hash = createHash("sha256").update(readFileSync(path.join(tmp, "package", rel))).digest("hex"); } catch { /* reported as missing above */ }
      if (hash && hash !== h) bad.push(`hash differs: ${rel}`);
    }
  }
  const before = readFileSync(path.join(dir, "package.json"), "utf8");
  const fix = sh("npm", ["pkg", "fix", "--json"], dir);
  const after = readFileSync(path.join(dir, "package.json"), "utf8");
  if (fix.status !== 0 || before !== after) bad.push("npm pkg fix changes package.json (npm would auto-correct the manifest)");
  if (before !== after) writeFileSync(path.join(dir, "package.json"), before); // keep the tree as built
} catch (e) { bad.push(String(e.message ?? e)); }
finally { rmSync(tmp, { recursive: true, force: true }); }
for (const b of bad) console.log("  " + b);
console.log(`${bad.length ? "FAIL" : "PASS"} npm-tarball ${path.basename(dir)}`);
process.exit(bad.length ? 1 : 0);
