// GP-LIVE-ROUTING runner (TECH-SPEC 6.5, ADR-0012): keyless claude -p with the built plugin.
// node e2e/live/routing/run.mjs --out <json> [--models a,b] [--runs 2] [--budget 0.4] [--conc 6] [--only L1,S2]
// node e2e/live/routing/run.mjs --rescore <old-raw.json>   (no model calls: old rule vs new rule tables)
// Scoring is deterministic and lives in score.mjs (owner decision 2026-10-19): tool class AND returned bytes.
import { execFileSync } from "node:child_process";
import { spawnGroup, watchdog } from "../lib/proc-group.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTasks } from "./tasks.mjs";
import { classOf, parseTranscript, scoreRun, scoreOldRule, tally, toolClass } from "./score.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MODELS = arg("--models", "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5").split(",");
const RUNS = Number(arg("--runs", "2")), BUDGET = arg("--budget", "0.4"), CONC = Number(arg("--conc", "6"));
const OUT = arg("--out", "routing-raw.json"), ONLY = arg("--only", "");
const BIN = arg("--bin", "/opt/homebrew/Caskroom/claude-code@latest/2.1.303/claude");
const env = {};
for (const k of ["PATH", "HOME", "USER", "TMPDIR"]) env[k] = process.env[k];
Object.assign(env, { ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
const GIT = ["-c", "user.name=fx", "-c", "user.email=fx@example.invalid"];

function mkRepo(t) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "cm-route-" + t.id + "-")));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  for (const [n, c] of Object.entries(t.files)) { fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true }); fs.writeFileSync(path.join(dir, n), c); }
  execFileSync("git", ["-C", dir, ...GIT, "add", "-A"]); execFileSync("git", ["-C", dir, ...GIT, "commit", "-q", "-m", "initial fixture commit"]);
  return dir;
}
function drop(dir) {
  const key = createHash("sha256").update(fs.realpathSync.native(path.join(dir, ".git"))).digest("hex").slice(0, 16);
  fs.rmSync(path.join(os.homedir(), ".context-mode", "projects", key), { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}
// D-DU-DENY-1: the old Read deny text named "16384 byte limit"; the new one says "over the one-read limit".
const readDeniedOf = (calls) => calls.some((x) => x.name === "Read" && (x.text.includes("over the one-read limit") || x.text.includes("16384 byte limit")));
function score(t, p) {
  const calls = p.calls.map((c) => ({ name: c.name, bytes: c.bytes }));
  const correct = p.final.includes(t.answer);
  const cls = classOf(t.files); // fixture class, never from the model run
  const sc = scoreRun({ cls, calls, correct });
  const seq = p.calls.filter((x) => x.name !== "ToolSearch").map((x) => x.name).slice(0, 6);
  return { ...sc, old: scoreOldRule({ cls, firstTool: sc.firstTool }), seq, readDenied: readDeniedOf(p.calls), cost: p.cost, bytes: sc.nativeBytes + sc.ctxBytes };
}

// Rescore old raw rows (fields: size, seq, bytes = total returned bytes, per-call bytes were not stored).
// New rule on old data: no ctx call in seq -> all bytes are native. Mixed run -> total is an upper bound for native bytes.
// seq was cut to 6 names and without ToolSearch, so a ctx call after the 6th call is not seen (3 of 174 run3 rows have 6).
async function rescore(file) {
  const fixtures = Object.fromEntries(buildTasks().map((t) => [t.id, t]));
  const rows = JSON.parse(fs.readFileSync(file, "utf8")).map((r) => {
    const cls = classOf(fixtures[r.task].files);
    const hasNative = r.seq.some((n) => toolClass(n) === "native");
    // Per-call bytes were not stored. Put all returned bytes on the first native call (upper bound for native bytes), or on the first call if all are ctx.
    const at = hasNative ? r.seq.findIndex((n) => toolClass(n) === "native") : 0;
    const calls = r.seq.map((n, i) => ({ name: n, bytes: i === at ? r.bytes : 0 }));
    const sc = scoreRun({ cls, calls, correct: r.correct });
    const undecidable = r.seq.some((n) => toolClass(n) === "ctx") && hasNative && r.bytes > 2048 && cls === "large"; // mixed run, total over limit: native share unknown
    return { model: r.model, task: r.task, size: r.size, ...sc, old: scoreOldRule({ cls, firstTool: sc.firstTool }), undecidable };
  });
  const main = rows.filter((r) => r.size !== "t4");
  const o = tally(main.map((r) => ({ ...r, underRouted: r.old.underRouted, overRouted: r.old.overRouted }))), n = tally(main);
  for (const m of Object.keys(n)) console.log(m, "| old under", o[m].under, "over", o[m].over, "| new under", n[m].under, "over", n[m].over, "| correct", n[m].correct, "| undecidable", main.filter((r) => r.model === m && r.undecidable).length);
}
if (arg("--rescore", "")) { await rescore(arg("--rescore", "")); process.exit(0); }
const tasks = buildTasks().filter((t) => !ONLY || ONLY.split(",").includes(t.id));
const jobs = []; for (const m of MODELS) for (const t of tasks) for (let k = 0; k < RUNS; k++) jobs.push({ m, t, k });
const rows = []; let next = 0;
const finish = () => { for (const [m, v] of Object.entries(tally(rows.filter((r) => r.size !== "t4")))) console.log(m, JSON.stringify(v)); };
function runJob(j) { return new Promise((res) => {
  const dir = mkRepo(j.t); let out = "", err = "";
  const c = spawnGroup(BIN, ["-p", j.t.prompt, "--model", j.m, "--effort", "low", "--max-budget-usd", BUDGET, "--no-session-persistence", "--setting-sources", "project",
    "--output-format", "stream-json", "--verbose", "--plugin-dir", path.join(ROOT, "release-out"), "--permission-mode", "bypassPermissions"], { cwd: dir, env });
  watchdog(c, 420000);
  c.stdout.on("data", (d) => out += d); c.stderr.on("data", (d) => err += d);
  c.on("close", () => { drop(dir); const p = parseTranscript(out); const s = score(j.t, p); rows.push({ final: p.final.slice(0, 120), model: j.m, task: j.t.id, size: j.t.size, run: j.k, ...s, stderr: s.firstTool === "(none)" && !s.correct ? err.slice(0, 160) : "" }); fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); res(); });
}); }
await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) await runJob(jobs[next++]); }));
console.log("done", rows.length, "rows ->", OUT);
finish();
