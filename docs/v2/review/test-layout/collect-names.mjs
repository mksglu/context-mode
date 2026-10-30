#!/usr/bin/env node
// Review tool (not a test, not shipped). Lists every leaf test, one line each: "<status>\t<name>\t<file>".
// Suites (describe blocks) are left out, so wrapping tests in describe() does not change the list.
// Usage: node docs/v2/review/test-layout/collect-names.mjs [--serial] [--out <file>] <file|dir>...
// A dir is walked for *.test.mjs and *.e2e.mjs. --serial runs one file at a time (e2e/cases idle windows).
// Compare two lists ignoring the file column: cut -f1,2 a | sort > a.s ; cut -f1,2 b | sort > b.s ; diff a.s b.s
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { run } from "node:test";

const argv = process.argv.slice(2);
const serial = argv.includes("--serial");
const outIdx = argv.indexOf("--out");
const out = outIdx >= 0 ? argv[outIdx + 1] : null;
const inputs = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");

function walk(p, acc) {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p).sort()) {
      if (e === "node_modules" || e === "fixtures") continue;
      walk(path.join(p, e), acc);
    }
  } else if (p.endsWith(".test.mjs") || p.endsWith(".e2e.mjs")) acc.push(p);
  return acc;
}
const files = inputs.flatMap((p) => walk(p, [])).map((f) => path.resolve(f));
const rows = [];
const stream = run({ files, concurrency: serial ? 1 : true });
for await (const ev of stream) {
  if (ev.type !== "test:pass" && ev.type !== "test:fail") continue;
  if (ev.data.details?.type === "suite") continue;
  const status = ev.type === "test:fail" ? "fail" : ev.data.skip !== undefined ? "skip" : ev.data.todo !== undefined ? "todo" : "pass";
  rows.push(`${status}\t${ev.data.name}\t${path.relative(process.cwd(), ev.data.file ?? "")}`);
}
rows.sort();
const text = rows.join("\n") + "\n";
if (out) writeFileSync(out, text);
else process.stdout.write(text);
console.error(`${rows.length} tests, ${rows.filter((r) => r.startsWith("fail")).length} fail, ${rows.filter((r) => r.startsWith("skip")).length} skip`);
