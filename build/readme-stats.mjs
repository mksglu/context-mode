#!/usr/bin/env node
// build/readme-stats.mjs: D-README-STATS-1. Reads the public counts for the README and writes them to files.
//   node build/readme-stats.mjs            reads stars (GitHub GraphQL, needs GITHUB_TOKEN) and npm downloads (public API),
//                                          writes stats.json and docs/assets/readme/src/star-data.js
//   node build/readme-stats.mjs --dry-run  reads the same, prints the result, writes nothing
//   node build/readme-stats.mjs --history  reads GitHub traffic (gh CLI), stars and npm counts; merges them by day into
//                                          docs/assets/readme/data/adoption-history.json (D-README-HISTORY-1). Once a day
//                                          unless --force; --backfill-v1 adds the v1 stats.json series from origin/main.
// stats.json fields are named by what they count: npm_downloads (all-time npm downloads of the package), stars, read_at.
// star-data.js feeds docs/assets/readme/src/star-history.html; render.mjs turns it into the two PNGs.
// No regex: dates are cut and compared as ISO strings.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = "context-mode";
const STEP_DAYS = 1; // one point per day (D-README-STAR-1)
const DAY_MS = 86_400_000;
const ISO_DAY = 10; // "YYYY-MM-DD"
const PAGE = 100;

/** [[day, cumulative stars at the end of that day], ...]: one point per day from the first star day; the last point is the total on readDay. */
export function starTimeline(starredAt, readDay, total) {
  const days = starredAt.map((t) => t.slice(0, ISO_DAY)).sort();
  if (days.length === 0) return [[readDay, total]];
  const points = [];
  let upTo = 0;
  for (let t = Date.parse(days[0]); new Date(t).toISOString().slice(0, ISO_DAY) < readDay; t += STEP_DAYS * DAY_MS) {
    const day = new Date(t).toISOString().slice(0, ISO_DAY);
    while (upTo < days.length && days[upTo] <= day) upTo++;
    points.push([day, upTo]);
  }
  points.push([readDay, total]);
  return points;
}

function isDay(text) {
  return typeof text === "string" && text.length === ISO_DAY && !Number.isNaN(Date.parse(text)) && new Date(Date.parse(text)).toISOString().slice(0, ISO_DAY) === text;
}

/** The stats.json object. Throws when a field is not a count or a day. */
export function statsJson({ npmDownloads, stars, readAt }) {
  if (!Number.isInteger(npmDownloads) || npmDownloads < 0) throw new Error(`npm_downloads is not a count: ${String(npmDownloads)}`);
  if (!Number.isInteger(stars) || stars < 0) throw new Error(`stars is not a count: ${String(stars)}`);
  if (!isDay(readAt)) throw new Error(`read_at is not a YYYY-MM-DD day: ${String(readAt)}`);
  return { npm_downloads: npmDownloads, stars, read_at: readAt };
}

// ---- Adoption history (D-README-HISTORY-1) ----
// GitHub keeps traffic for 14 days only, and Claude Code, Codex, Gemini CLI and Qwen Code install from GitHub, so npm
// never sees them: their only count is the clone traffic. The file keeps every day it ever read (merge by day, the
// newer read wins its own day, old days stay; nothing is cut).
export const HISTORY_FILE = "docs/assets/readme/data/adoption-history.json";
export const HISTORY_SERIES = ["github_clones", "github_views", "github_clones_14d", "github_views_14d", "github_referrers", "stars", "npm_totals", "npm_versions_last_week", "v1_marketplace"];
const SERIES_TEXT = {
  github_clones: "[day, clones, unique cloners] per UTC day. GitHub REST /repos/mksglu/context-mode/traffic/clones (keeps 14 days). Counts git clones and fetches of the repo: Claude Code, Codex, Gemini CLI and Qwen Code plugin installs and updates, CI machines and people.",
  github_views: "[day, views, unique visitors] per UTC day. GitHub REST /repos/mksglu/context-mode/traffic/views (keeps 14 days).",
  github_clones_14d: "[read day, clones, unique cloners] for the 14 days GitHub keeps, as GitHub counts them (a person who clones on two days counts once). Do not add days of github_clones uniques together; use this.",
  github_views_14d: "[read day, views, unique visitors] for the 14 days GitHub keeps, as GitHub counts them.",
  github_referrers: "[read day, [[referrer, views, unique visitors], ...]]: the top 10 referrers for the 14 days before the read day. GitHub REST /repos/mksglu/context-mode/traffic/popular/referrers.",
  stars: "[read day, GitHub stars total]. GitHub REST /repos/mksglu/context-mode stargazers_count.",
  npm_totals: "[read day, all-time, last week, last month] npm downloads of context-mode. api.npmjs.org/downloads/point/{2000-01-01:<day>,last-week,last-month}/context-mode. Counts installs, updates and CI runs of Pi, OpenCode, Copilot CLI, Kiro, VS Code and ZCode setups.",
  npm_versions_last_week: "[read day, 1.x downloads, -next downloads, other downloads, versions] for the last 7 days npm counted. api.npmjs.org/versions/context-mode/last-week.",
  v1_marketplace: "[day, unique cloners in the 14 days before, commit sha]: the 'marketplace' field of the v1 stats.json on main (written by .github/workflows/update-stats.yml from traffic/clones uniques), the last readable commit of each UTC day. Rounded as v1 wrote it (63.3k+ is 63300).",
};

/** A v1 stats.json count ("63.3k+", "1.2M+", "211") as an integer; null when it is not a count. */
export function v1Count(text) {
  if (typeof text !== "string") return null;
  let s = text.endsWith("+") ? text.slice(0, -1) : text;
  let mult = 1;
  if (s.endsWith("k")) { mult = 1_000; s = s.slice(0, -1); } else if (s.endsWith("M")) { mult = 1_000_000; s = s.slice(0, -1); }
  if (s === "" || s.split(".").length > 2 || [...s].some((c) => c !== "." && (c < "0" || c > "9"))) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

/** git log rows ({ sha, at }) of v1 stats.json -> [[UTC day, marketplace count, sha]]: the last readable commit of each day. */
export function v1Series(log, read) {
  const best = new Map();
  for (const { sha, at } of log) {
    const t = Date.parse(at);
    if (Number.isNaN(t)) continue;
    let v = null;
    try { v = v1Count(JSON.parse(read(sha)).marketplace); } catch { v = null; }
    if (v === null) continue;
    const day = new Date(t).toISOString().slice(0, ISO_DAY);
    const b = best.get(day);
    if (!b || t > b.t) best.set(day, { t, v, sha });
  }
  return [...best].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, b]) => [d, b.v, b.sha]);
}

/** A traffic answer (clones or views) -> [[day, count, uniques]], oldest first; the read day is partial and waits. */
export function trafficDays(body, key, readDay) {
  const list = body && body[key];
  if (!Array.isArray(list)) throw new Error(`traffic answer has no ${key} list`);
  return list.map((r) => [String(r.timestamp).slice(0, ISO_DAY), r.count, r.uniques])
    .filter((r) => r[0] < readDay).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** A traffic answer -> [read day, count, uniques]: the 14-day totals GitHub gives with the days. */
export function trafficWindow(body, readDay) {
  if (!body || !Number.isInteger(body.count) || !Number.isInteger(body.uniques)) throw new Error("traffic answer has no count or uniques");
  return [readDay, body.count, body.uniques];
}

/** api.npmjs.org/versions/<pkg>/last-week -> { v1, next, other, versions }. */
export function versionSplit(j) {
  if (!j || !j.downloads || typeof j.downloads !== "object") throw new Error("npm versions answer has no downloads map");
  const out = { v1: 0, next: 0, other: 0, versions: 0 };
  for (const [v, n] of Object.entries(j.downloads)) {
    out.versions++;
    if (v.includes("-next")) out.next += n; else if (v.startsWith("1.")) out.v1 += n; else out.other += n;
  }
  return out;
}

/** Merge a fresh read into the history: union by day per series, the fresh row wins its day, every old day stays. */
export function mergeHistory(old, fresh) {
  const out = { read_at: fresh.read_at, series: { ...SERIES_TEXT } };
  for (const k of HISTORY_SERIES) {
    const m = new Map();
    for (const r of (old && old[k]) || []) m.set(r[0], r);
    for (const r of fresh[k] || []) m.set(r[0], r);
    out[k] = [...m.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  return out;
}

/** One read a day: due when the file has no read day or an older one. */
export function historyDue(h, today) {
  return !h || typeof h.read_at !== "string" || h.read_at < today;
}

/** The history as JSON with one row per line, so each daily commit shows only the new rows. */
function historyText(h) {
  const parts = [`  "read_at": ${JSON.stringify(h.read_at)}`, `  "series": ${JSON.stringify(h.series, null, 2).split("\n").join("\n  ")}`];
  for (const k of HISTORY_SERIES) parts.push(`  ${JSON.stringify(k)}: [${h[k].length ? "\n" + h[k].map((r) => "    " + JSON.stringify(r)).join(",\n") + "\n  " : ""}]`);
  return "{\n" + parts.join(",\n") + "\n}\n";
}

/** v1 stats.json at every commit on `ref`, read in one git cat-file --batch call. */
function readV1Log(ref) {
  const git = (args, input) => execFileSync("git", args, { cwd: REPO_ROOT, input, maxBuffer: 64 * 1024 * 1024 });
  const log = git(["log", ref, "--format=%H %cI", "--", "stats.json"]).toString().split("\n").filter(Boolean)
    .map((l) => ({ sha: l.split(" ")[0], at: l.split(" ")[1] }));
  const buf = git(["cat-file", "--batch"], log.map((r) => r.sha + ":stats.json").join("\n") + "\n");
  const files = new Map();
  let i = 0;
  for (const { sha } of log) {
    const nl = buf.indexOf(10, i);
    const head = buf.subarray(i, nl).toString().split(" ");
    i = nl + 1;
    if (head[1] !== "blob") continue;
    const size = Number(head[2]);
    files.set(sha, buf.subarray(i, i + size).toString());
    i += size + 1;
  }
  return { log, read: (sha) => files.get(sha) };
}

async function readHistory(slug, today, calls) {
  // GitHub reads go through the gh CLI: GH_TOKEN in CI (TRAFFIC_TOKEN, push access for traffic), the local gh login otherwise.
  const gh = (p) => { calls.n++; return JSON.parse(execFileSync("gh", ["api", p], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })); };
  const npm = async (p) => {
    calls.n++;
    const r = await fetch("https://api.npmjs.org/" + p);
    if (!r.ok) throw new Error(`npm API ${p} answered ${r.status}`);
    return r.json();
  };
  const [all, week, month, versions] = await Promise.all([npm(`downloads/point/2000-01-01:${today}/${PACKAGE}`),
    npm(`downloads/point/last-week/${PACKAGE}`), npm(`downloads/point/last-month/${PACKAGE}`), npm(`versions/${PACKAGE}/last-week`)]);
  const split = versionSplit(versions);
  const refs = gh(`repos/${slug}/traffic/popular/referrers`);
  if (!Array.isArray(refs)) throw new Error("traffic referrers answer is not a list");
  const stars = gh(`repos/${slug}`).stargazers_count;
  if (!Number.isInteger(stars)) throw new Error("repo answer has no stargazers_count");
  const clones = gh(`repos/${slug}/traffic/clones`), views = gh(`repos/${slug}/traffic/views`);
  return {
    read_at: today,
    github_clones: trafficDays(clones, "clones", today),
    github_views: trafficDays(views, "views", today),
    github_clones_14d: [trafficWindow(clones, today)],
    github_views_14d: [trafficWindow(views, today)],
    github_referrers: [[today, refs.slice(0, 10).map((r) => [r.referrer, r.count, r.uniques])]],
    stars: [[today, stars]],
    npm_totals: [[today, all.downloads, week.downloads, month.downloads]],
    npm_versions_last_week: [[today, split.v1, split.next, split.other, split.versions]],
  };
}

/** --history [--force] [--backfill-v1]: read today's counts and merge them into HISTORY_FILE; writes no README file. */
async function historyMain() {
  const t0 = performance.now();
  const file = path.join(REPO_ROOT, HISTORY_FILE);
  const today = new Date().toISOString().slice(0, ISO_DAY);
  const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const backfill = process.argv.includes("--backfill-v1");
  if (!backfill && !process.argv.includes("--force") && !historyDue(old, today)) {
    console.log(`history: already read on ${today}; nothing to do`);
    return;
  }
  const calls = { n: 0 };
  const fresh = await readHistory(process.env.GITHUB_REPOSITORY || "mksglu/context-mode", today, calls);
  if (backfill) {
    const { log, read } = readV1Log(process.env.V1_REF || "origin/main");
    fresh.v1_marketplace = v1Series(log, read);
    console.log(`history: v1 backfill, ${log.length} commits, ${fresh.v1_marketplace.length} days`);
  }
  const merged = mergeHistory(old, fresh);
  const text = historyText(merged);
  writeFileSync(file, text);
  const rows = HISTORY_SERIES.map((k) => `${k} ${merged[k].length}`).join(", ");
  console.log(`history: ${HISTORY_FILE} ${text.length} bytes; ${rows}; ${calls.n} API calls; ${Math.round(performance.now() - t0)} ms`);
}

async function readNpmDownloads(today) {
  const r = await fetch(`https://api.npmjs.org/downloads/point/2000-01-01:${today}/${PACKAGE}`);
  if (!r.ok) throw new Error(`npm downloads API answered ${r.status}`);
  return (await r.json()).downloads;
}

const QUERY = "query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){stargazers(first:" + PAGE +
  ",after:$after,orderBy:{field:STARRED_AT,direction:ASC}){totalCount pageInfo{hasNextPage endCursor} edges{starredAt}}}}";

async function readStars(token, slug) {
  const [owner, name] = slug.split("/");
  const starredAt = [];
  let total = 0;
  for (let after = null; ;) {
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "readme-stats" },
      body: JSON.stringify({ query: QUERY, variables: { owner, name, after } }),
    });
    if (!r.ok) throw new Error(`GitHub GraphQL answered ${r.status}`);
    const body = await r.json();
    if (body.errors) throw new Error(`GitHub GraphQL: ${body.errors[0].message}`);
    const s = body.data.repository.stargazers;
    total = s.totalCount;
    for (const e of s.edges) starredAt.push(e.starredAt);
    if (!s.pageInfo.hasNextPage) break;
    after = s.pageInfo.endCursor;
  }
  return { total, starredAt };
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const slug = process.env.GITHUB_REPOSITORY || "mksglu/context-mode";
  const readAt = new Date().toISOString().slice(0, ISO_DAY);
  const [npmDownloads, { total, starredAt }] = await Promise.all([readNpmDownloads(readAt), readStars(token, slug)]);
  const stats = statsJson({ npmDownloads, stars: total, readAt });
  const timeline = starTimeline(starredAt, readAt, total);
  console.log(JSON.stringify(stats));
  console.log(`timeline: ${timeline.length} points, first ${timeline[0][0]}, last ${timeline[timeline.length - 1][0]} = ${total}; stargazer rows read: ${starredAt.length}`);
  if (dry) return;
  writeFileSync(path.join(REPO_ROOT, "stats.json"), JSON.stringify(stats, null, 2) + "\n");
  writeFileSync(path.join(REPO_ROOT, "docs", "assets", "readme", "src", "star-data.js"),
    `// Written by build/readme-stats.mjs. Do not edit.\nvar STARS=${total},READ_AT=${JSON.stringify(readAt)},D=${JSON.stringify(timeline)};\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv.includes("--history") ? historyMain() : main()).catch((e) => { console.error(`readme-stats failed: ${e.message}`); process.exit(1); });
}
