// Owner main rule (2026-10-28): TRUNCATE is forbidden in shipped code (D-NO-TRUNCATE-1).
// Covers SQLite `wal_checkpoint(TRUNCATE)` and `TRUNCATE` SQL, and Node file truncation APIs.
// Plain substring checks, no regex. Tests and e2e diagnostics may name the word; shipped code may not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["src", "build", "scripts"];
const EXTS = [".ts", ".mjs", ".js", ".cjs"];
const BANNED = ["(TRUNCATE)", "TRUNCATE TABLE", "truncateSync", "ftruncate", ".truncate("];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

test("no-truncate: shipped code never uses TRUNCATE (owner main rule, D-NO-TRUNCATE-1)", () => {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of walk(root, [])) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const b of BANNED) if (line.includes(b)) hits.push(`${file}:${i + 1}: ${b}`);
      });
    }
  }
  assert.deepEqual(hits, [], `TRUNCATE is forbidden:\n${hits.join("\n")}`);
});
