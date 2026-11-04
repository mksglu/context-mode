// Re-score a stored T-CMP result file from its finalText, no model calls.
// usage: node e2e/live/compact/rescore.mjs <in.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { FIXTURES } from "./fixtures.mjs";
import { exactMatch, verdict, table } from "./score.mjs";

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error("usage: rescore.mjs <in.json> <out.json>"); process.exit(2); }
const doc = JSON.parse(readFileSync(inFile, "utf8"));
const by = Object.fromEntries(FIXTURES.map((f) => [f.id, f.answer]));
for (const runs of Object.values(doc.runs)) {
  for (const r of runs) r.correct = exactMatch(r.finalText, by[r.fixture].exact, { caseSensitive: by[r.fixture].caseSensitive !== false });
}
const v = verdict(doc.runs);
Object.assign(doc, { stats: v.arms, checks: v.checks, info: v.info, rescoredFrom: inFile });
writeFileSync(outFile, JSON.stringify(doc, null, 2));
console.log(table(v));
