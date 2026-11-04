#!/usr/bin/env node
// build/npm-downloads.mjs: D-README-NPM-1. Reads the daily npm downloads of the package and writes the data for the four
// npm download charts (docs/assets/readme/src/npm-downloads.html, rendered by render.mjs).
//   node build/npm-downloads.mjs            reads the public npm API (open, keyless), writes docs/assets/readme/src/npm-data.js
//   node build/npm-downloads.mjs --dry-run  reads the same, prints a summary, writes nothing
// Range: from the first publish day (registry time.created) to yesterday UTC, the last full day the API counts.
// The range API answers up to 18 months per call, so the script asks in 500-day chunks and joins them.
// The script writes the file only when its text changes, so a second run on the same day changes nothing. Plain string code.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = "context-mode";
const DAY_MS = 86_400_000;
const ISO_DAY = 10; // "YYYY-MM-DD"
const CHUNK_DAYS = 500; // the API limit is 18 months (about 548 days)
const DAILY_DAYS = 90;
export const DATA_FILE = path.join(REPO_ROOT, "docs", "assets", "readme", "src", "npm-data.js");
const HEADER = "// Written by build/npm-downloads.mjs. Run that script to update it.\n";

const day = (t) => new Date(t).toISOString().slice(0, ISO_DAY);
const addDays = (d, n) => day(Date.parse(d) + n * DAY_MS);

/** [[from, to], ...]: inclusive day ranges of at most 500 days that cover from..to end to end. */
export function rangeChunks(from, to) {
  const out = [];
  for (let start = from; start <= to; start = addDays(start, CHUNK_DAYS)) {
    const end = addDays(start, CHUNK_DAYS - 1);
    out.push([start, end < to ? end : to]);
  }
  return out;
}

/** The Monday that starts the ISO week of the day. */
export function weekStart(d) {
  const dow = new Date(Date.parse(d)).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

function lastDayOfMonth(month) {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return day(Date.UTC(y, m, 0));
}

/**
 * The chart data from [[day, downloads], ...]. A day the list skips counts as 0; trailing 0 days drop off the end.
 * daily: the last 90 days; weekly: full ISO weeks [monday, sum]; monthly: full months ["YYYY-MM", sum];
 * yearly: ["YYYY", sum] for every year (the current one up to the last day); running: ["YYYY-MM", total up to that month's end].
 */
export function aggregate(days, readAt) {
  const sorted = days.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  // The API answers 0 for the newest days until it has counted them, so the data ends on the last day with downloads.
  while (sorted.length > 1 && sorted[sorted.length - 1][1] === 0) sorted.pop();
  const first = sorted[0][0], last = sorted[sorted.length - 1][0];
  const by = new Map(sorted);
  const all = [];
  for (let d = first; d <= last; d = addDays(d, 1)) all.push([d, by.get(d) || 0]);
  const weeks = new Map(), months = new Map(), years = new Map();
  let total = 0;
  for (const [d, n] of all) {
    total += n;
    const w = weekStart(d), m = d.slice(0, 7), y = d.slice(0, 4);
    weeks.set(w, (weeks.get(w) || 0) + n);
    months.set(m, (months.get(m) || 0) + n);
    years.set(y, (years.get(y) || 0) + n);
  }
  let run = 0;
  const running = [...months].map(([m, n]) => [m, (run += n)]);
  return {
    read_at: readAt, first, last, total,
    daily: all.slice(-DAILY_DAYS),
    weekly: [...weeks].filter(([w]) => addDays(w, 6) <= last),
    monthly: [...months].filter(([m]) => lastDayOfMonth(m) <= last),
    yearly: [...years],
    running,
  };
}

/** 950 -> "950", 683261 -> "683K", 1250000 -> "1.3M". */
export function fmtK(n) {
  if (n < 1000) return String(n);
  if (n < 999_500) return Math.round(n / 1000) + "K";
  const m = (Math.round(n / 100_000) / 10).toFixed(1);
  return (m.endsWith(".0") ? m.slice(0, -2) : m) + "M";
}

export function dataFileText(data) {
  return HEADER + "var NPM=" + JSON.stringify(data) + ";\n";
}

async function getJson(url) {
  const r = await fetch(url, { headers: { "user-agent": "readme-stats" } });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.json();
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const readAt = day(Date.now());
  const yesterday = addDays(readAt, -1);
  const created = (await getJson(`https://registry.npmjs.org/${PACKAGE}`)).time.created.slice(0, ISO_DAY);
  const days = [];
  for (const [from, to] of rangeChunks(created, yesterday)) {
    const body = await getJson(`https://api.npmjs.org/downloads/range/${from}:${to}/${PACKAGE}`);
    for (const row of body.downloads) days.push([row.day, row.downloads]);
  }
  const data = aggregate(days, readAt);
  console.log(`npm downloads ${data.first}..${data.last}: total ${data.total} (${fmtK(data.total)}), ${data.weekly.length} weeks, ${data.monthly.length} months, ${data.yearly.length} years`);
  if (dry) return;
  const text = dataFileText(data);
  if (existsSync(DATA_FILE) && readFileSync(DATA_FILE, "utf8") === text) console.log("npm-data.js: same text, kept");
  else { writeFileSync(DATA_FILE, text); console.log("npm-data.js: written"); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`npm-downloads failed: ${e.message}`); process.exit(1); });
}
