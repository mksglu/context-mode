// 20 tasks. build(dir) writes fixtures and returns { prompt, expect }.
import * as F from "./fixtures.mjs";
const T = [];
const add = (id, kind, seed, n, ask) => T.push({ id, kind, build(dir) { const f = F[kind](dir, seed, n); return { prompt: ask(f) + " Reply with only the answer, no other text.", expect: f.expect }; } });
const logQ = (f) => `In ${f.file}, how many lines contain the error code ${f.code}? Use tools to read the file.`;
[[11, 20000], [12, 30000], [13, 25000], [14, 40000], [15, 35000]].forEach(([s, n], i) => add(`log-${i + 1}`, "log", s, n, logQ));
[[21, 3000], [22, 4000], [23, 5000], [24, 6000]].forEach(([s, n], i) => add(`json-${i + 1}`, "json", s, n, () => "In data/records.json, which record id has the highest score? Use tools to read the file."));
[[31, 4000], [32, 5000], [33, 6000], [34, 8000]].forEach(([s, n], i) => add(`tests-${i + 1}`, "testrun", s, n, () => "Run ./run-tests.sh. How many tests failed (lines starting with FAIL)? Use tools to run it."));
[[41, 15000], [42, 20000], [43, 25000], [44, 30000]].forEach(([s, n], i) => add(`file-${i + 1}`, "bigfile", s, n, (f) => `In ${f.file}, find the line starting with ${f.marker} and give the value after "value=". Use tools to read the file.`));
[[51, 300], [52, 400], [53, 500]].forEach(([s, n], i) => add(`git-${i + 1}`, "git", s, n, (f) => `In this git repo, who is the author of the commit whose subject mentions ${f.ticket}? Give the full author name. Use git.`));
export const TASKS = T;
