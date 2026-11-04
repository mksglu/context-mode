// Frozen task set of the saving score (bench/saving-score.mjs). Do not edit after the prep commit:
// the sha256 of this file is recorded in bench/saving-score.lock.
//
// SCORE_TASKS (M2 population, 4 tasks): json-1, multi-1 and two new large tasks, big-tests and big-json.
// SMALL_TASKS (guards, 5 tasks): log-1 json-1 tests-1 file-1 git-1.
// Each task: { id, build(dir) -> { prompt, expect: string[] } }. Success = the final answer holds every
// expected string (thousands separators "1,234" are read as "1234"). Fixtures are local and seeded.
import fs from "node:fs";
import path from "node:path";
import { TASKS } from "./tasks.mjs";

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
const tok = (r, n = 8) => Array.from({ length: n }, () => ALPHA[Math.floor(r() * ALPHA.length)]).join("");
const W = ["alpha", "bravo", "cargo", "delta", "echo", "fable", "gamma", "hotel", "index", "jolly", "karma", "lumen"];
const pick = (r, a) => a[Math.floor(r() * a.length)];
const put = (dir, f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
const ONLY = " Reply with only the answer, no other text.";

// Existing task wrapped to the { prompt, expect: string[] } shape (the same build as bench/live/tasks.mjs).
const wrap = (id) => {
  const t = TASKS.find((x) => x.id === id);
  return { id, build: (dir) => { const b = t.build(dir); return { prompt: b.prompt, expect: [b.expect] }; } };
};

// multi-1: three large outputs in a row, one marker value in each (same fixture as bench/live/ab-quick.mjs).
function multi(dir) {
  const r = rng(7);
  const vals = [];
  for (let k = 1; k <= 3; k++) {
    const v = tok(r); vals.push(v); const at = 400 + Math.floor(r() * 600);
    const lines = Array.from({ length: 1500 }, (_, i) => i === at ? `SECRET-${k} value=${v}` : `row ${i} ${tok(r)} ${tok(r)} ${tok(r)} ${tok(r)}`);
    put(dir, `data/part${k}.txt`, lines.join("\n") + "\n");
  }
  return { prompt: 'Run cat on data/part1.txt, then data/part2.txt, then data/part3.txt (one Bash call each). In each, find the line starting with SECRET-<n> (n = file number) and read the value after "value=". Reply with only the three values separated by spaces, in order.' + ONLY, expect: vals };
}

// big-tests: a test log of at least 25 KB, exactly one FAIL line; the answer is the unique case id on it.
function bigTests(dir) {
  const r = rng(61); const lines = []; let size = 0, i = 0, failAt = -1, id = "";
  const target = 25 * 1024;
  while (size < target) {
    const l = `ok   suite/${pick(r, W)}/case_${i} (${Math.floor(r() * 90)}ms) ${tok(r, 12)}`;
    lines.push(l); size += l.length + 1; i++;
  }
  failAt = 200 + Math.floor(r() * (lines.length - 400));
  id = "case_" + failAt + "_" + tok(r, 6);
  lines[failAt] = `FAIL suite/${pick(r, W)}/${id} (${Math.floor(r() * 90)}ms) expected 3 got 4`;
  put(dir, "tests/out.txt", lines.join("\n") + "\n");
  put(dir, "run-tests.sh", '#!/bin/sh\ncat "$(dirname "$0")/tests/out.txt"\n');
  fs.chmodSync(path.join(dir, "run-tests.sh"), 0o755);
  return { prompt: "Run ./run-tests.sh as a bare command in one Bash call: no pipe, no grep, no redirect, no other command. Exactly one test in its output failed (a line starting with FAIL). Give the case id of that test (the part of its name that starts with case_)." + ONLY, expect: [id] };
}

// big-json: a JSON file of at least 200 KB; exactly one order has priority true; the answer is 3 x its amount.
function bigJson(dir) {
  const r = rng(73); const rows = []; let sum = 0;
  const regions = ["north", "south", "east", "west"], states = ["paid", "refunded", "pending", "void"];
  let n = 0;
  while (JSON.stringify(rows, null, 2).length < 200 * 1024 && n < 100000) {
    const region = pick(r, regions), status = pick(r, states), amount = 1 + Math.floor(r() * 9000);
    rows.push({ id: "ord-" + tok(r, 8), region, status, amount, priority: false, items: [pick(r, W), pick(r, W)], note: Array.from({ length: 6 }, () => pick(r, W)).join(" ") });
    n++;
  }
  const at = Math.floor(rows.length * (0.3 + r() * 0.4));
  rows[at].priority = true; sum = rows[at].amount * 3;
  put(dir, "data/orders.json", JSON.stringify(rows, null, 2));
  return { prompt: 'data/orders.json holds orders. First view the file with one bare `cat data/orders.json` Bash call (no pipe, no jq, no script). Exactly one order has "priority": true. Give three times its "amount".' + ONLY, expect: [String(sum)] };
}

export const SCORE_TASKS = [wrap("json-1"), { id: "multi-1", build: multi }, { id: "big-tests", build: bigTests }, { id: "big-json", build: bigJson }];
export const SMALL_TASKS = ["log-1", "json-1", "tests-1", "file-1", "git-1"].map(wrap);
// Union by id (json-1 is in both lists and runs once).
export const ALL_TASKS = [...new Map([...SCORE_TASKS, ...SMALL_TASKS].map((t) => [t.id, t])).values()];
export const normalize = (text) => String(text).replace(/(\d),(?=\d{3}\b)/g, "$1");
