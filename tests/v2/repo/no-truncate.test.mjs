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

// D-NO-LOSSY-CUT-1: shipped code may not say "truncat" in a string (comments are free).
test("no-lossy-cut: no user-facing 'truncat' word in shipped code", () => {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of walk(root, [])) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const at = line.toLowerCase().indexOf("truncat");
        if (at < 0) return;
        const comment = line.indexOf("//");
        if (comment >= 0 && comment < at) return;
        if (line.trimStart().startsWith("*")) return;
        hits.push(`${file}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(hits, [], `user-facing text must not say truncat:\n${hits.join("\n")}`);
});

// Every capBytes call site is listed as lossless in docs/v2/release/NO-LOSSY-CUT.md (same file, same count).
test("no-lossy-cut: every capBytes call site is a lossless row in NO-LOSSY-CUT.md", () => {
  const table = readFileSync("docs/v2/release/NO-LOSSY-CUT.md", "utf8").split("\n").filter((l) => l.startsWith("|"));
  const calls = new Map();
  for (const root of ROOTS) {
    for (const file of walk(root, [])) {
      if (file.endsWith(path.join("sandbox", "cap.ts"))) continue;
      const n = readFileSync(file, "utf8").split("\n").filter((l) => l.includes("capBytes(") && !l.trimStart().startsWith("//")).length;
      if (n > 0) calls.set(file.split(path.sep).join("/"), n);
    }
  }
  assert.ok(calls.size > 0);
  for (const [file, n] of calls) {
    const rows = table.filter((l) => l.includes("| " + file + ":") && l.includes("capBytes") && l.includes("| lossless |"));
    assert.equal(rows.length, n, `${file}: ${n} capBytes call(s), ${rows.length} lossless row(s) in NO-LOSSY-CUT.md`);
  }
});
