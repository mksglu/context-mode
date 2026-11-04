// Deterministic local fixtures for the live A/B. No network. Each builder writes files into a git repo
// and returns { expect } : the string the final answer must contain.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const W = ["alpha", "bravo", "cargo", "delta", "echo", "fable", "gamma", "hotel", "index", "jolly", "karma", "lumen"];
const tok = (r, n = 6) => Array.from({ length: n }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(r() * 31)]).join("");
const w = (dir, f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };

// log: N lines, K lines carry code E<code>; question counts them.
export function log(dir, seed, n) {
  const r = rng(seed), code = "E" + (400 + (seed % 90));
  let k = 0, lines = [];
  for (let i = 0; i < n; i++) {
    const hit = r() < 0.004; if (hit) k++;
    lines.push(`2026-03-${String(1 + (i % 28)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z ${hit ? "ERROR " + code : pick(r, ["INFO", "DEBUG", "WARN"]) + " W" + (100 + Math.floor(r() * 50))} svc-${pick(r, W)} req=${tok(r, 12)} took=${Math.floor(r() * 900)}ms`);
  }
  w(dir, "logs/service.log", lines.join("\n") + "\n");
  return { file: "logs/service.log", code, expect: String(k) };
}
// json: array of records, one has the highest score.
export function json(dir, seed, n) {
  const r = rng(seed); let best = -1, id = "";
  const rows = Array.from({ length: n }, (_, i) => { const s = Math.floor(r() * 1e6); const rid = "rec-" + tok(r, 8); if (s > best) { best = s; id = rid; } return { id: rid, score: s, tags: [pick(r, W), pick(r, W)], note: Array.from({ length: 8 }, () => pick(r, W)).join(" ") }; });
  w(dir, "data/records.json", JSON.stringify(rows, null, 2));
  return { file: "data/records.json", expect: id };
}
// testrun: script prints N test lines; M fail; question names the count of failures.
export function testrun(dir, seed, n) {
  const r = rng(seed); let m = 0; const names = [];
  for (let i = 0; i < n; i++) { const f = r() < 0.006; if (f) m++; names.push(`${f ? "FAIL" : "ok  "} suite/${pick(r, W)}/case_${i} (${Math.floor(r() * 90)}ms)`); }
  w(dir, "tests/out.txt", names.join("\n") + "\n");
  w(dir, "run-tests.sh", "#!/bin/sh\ncat \"$(dirname \"$0\")/tests/out.txt\"\n");
  fs.chmodSync(path.join(dir, "run-tests.sh"), 0o755);
  return { expect: String(m) };
}
// bigfile: large text, one unique marker line; question asks the value after the marker.
export function bigfile(dir, seed, n) {
  const r = rng(seed), val = tok(r, 10), at = Math.floor(n * (0.3 + r() * 0.5));
  const lines = Array.from({ length: n }, (_, i) => i === at ? `MARKER-${seed} value=${val}` : `${pick(r, W)} ${pick(r, W)} ${tok(r, 20)} ${pick(r, W)} line ${i}`);
  w(dir, "docs/big.txt", lines.join("\n") + "\n");
  return { file: "docs/big.txt", marker: `MARKER-${seed}`, expect: val };
}
// git: N commits; one has a unique ticket id in its subject; question asks its author name.
export function git(dir, seed, n) {
  const r = rng(seed), target = Math.floor(n * (0.2 + r() * 0.6)), ticket = "TKT-" + (1000 + (seed % 9000)); let who = "";
  const authors = ["Ana Lima", "Bo Chen", "Cy Ortiz", "Di Novak", "Ed Kaya"];
  const g = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
  for (let i = 0; i < n; i++) {
    w(dir, `src/f${i % 15}.txt`, `v${i} ${tok(r, 8)}\n`);
    const a = authors[Math.floor(r() * authors.length)]; if (i === target) who = a;
    g("add", "-A");
    g("-c", `user.name=${a}`, "-c", "user.email=a@example.test", "commit", "-q", "-m", i === target ? `fix ${ticket} edge case` : `chore: update ${pick(r, W)} ${i}`);
  }
  return { ticket, expect: who };
}

export function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
}
