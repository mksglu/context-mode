// Step 2. Usage: node scripts/v1-cases/convert.mjs <log.jsonl> <v1-version> <out.json>
// Turns the router log into data rows. Same input on the same v1 line is kept once. Nothing is dropped.
import { readFileSync, writeFileSync } from "node:fs";
const [log, v1Version, out] = process.argv.slice(2);
const lines = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const seen = new Map();
for (const r of lines) {
  if (r.src.includes("hook-latency.test.ts")) continue; // timing loop: the log wrapper itself breaks its 3 ms budget
  const key = JSON.stringify([r.src, r.tool, r.input, r.platform, r.options, r.mcpReady, r.settings]);
  if (!seen.has(key)) seen.set(key, r);
}
const settingsTable = {};
const settingsId = (v) => { if (!v) return null; const k = "S" + (Object.keys(settingsTable).find((x) => JSON.stringify(settingsTable[x]) === JSON.stringify(v))?.slice(1) ?? (Object.keys(settingsTable).length + 1)); settingsTable[k] = v; return k; };
const rows = [...seen.values()].map((r, i) => ({
  id: "v1-" + String(i + 1).padStart(3, "0"),
  source: r.src,                      // v1 test file:line that made the call ("subprocess" = hook run by a v1 test)
  tool: r.tool ?? null,
  input: r.input ?? null,
  platform: r.platform ?? null,
  projectDir: r.projectDir ?? null,
  options: r.options ?? {},
  settings: settingsId(r.settings),       // user deny-rule files v1 read for this call (projectLocal, project, user)
  mcpReady: r.mcpReady,               // v1 only blocks while its machine-global MCP marker file exists
  v1: r.res === null || r.res === undefined
    ? { action: "passthrough" }
    : { action: r.res.action, reason: r.res.reason ?? null, rewritten: !!r.res.updatedInput, hasContext: !!r.res.additionalContext },
}));
writeFileSync(out, JSON.stringify({ v1Version, generatedBy: "scripts/v1-cases/{instrument,convert}.mjs on a vitest run of tests/hooks tests/core/routing tests/guidance-throttle", count: rows.length, settings: settingsTable, rows }, null, 1) + "\n");
const by = {}; for (const r of rows) by[r.v1.action] = (by[r.v1.action] || 0) + 1;
console.log(JSON.stringify({ rows: rows.length, by }));
