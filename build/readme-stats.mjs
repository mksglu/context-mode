#!/usr/bin/env node
// build/readme-stats.mjs: D-README-STATS-1. Reads the public counts for the README and writes them to files.
//   node build/readme-stats.mjs            reads stars (GitHub GraphQL, needs GITHUB_TOKEN) and npm downloads (public API),
//                                          writes stats.json and docs/assets/readme/src/star-data.js
//   node build/readme-stats.mjs --dry-run  reads the same, prints the result, writes nothing
// stats.json fields are named by what they count: npm_downloads (all-time npm downloads of the package), stars, read_at.
// star-data.js feeds docs/assets/readme/src/star-history.html; render.mjs turns it into the two PNGs.
// No regex: dates are cut and compared as ISO strings.
import { writeFileSync } from "node:fs";
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
  main().catch((e) => { console.error(`readme-stats failed: ${e.message}`); process.exit(1); });
}
