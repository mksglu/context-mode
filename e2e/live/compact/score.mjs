// T-CMP scorer (DECISIONS-r9 §V T-CMP; plan.md §2 E3 and §3 rows E3 B1-B3, B5).
// Input: per arm a list of runs { factInSummary, calledTool, correct, resumeSeqOk }.
// Output: verdict { pass, arms, checks }; CLI prints one JSON line, then a table.
// Gates come from the DECISIONS-r9 T-CMP row only. Plan.md B2 (a vs b) is reported, not gated:
// DECISIONS-r9 is later and does not list it.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ARM_ORDER = ["a", "b", "c", "d", "e"];
export const RUNS_PER_ARM = 10;
export const MIN_CALL_RATE_A = 0.7;
export const MIN_CORRECT_A = 0.8;
export const MIN_CORRECT_D = 0.7;
export const RESUME_SEQ_RUNS = 10;

// Exact-match checker on the answer key: the answer holds the fact value verbatim.
// Case-sensitive unless the fixture key sets caseSensitive:false (a prose word, not a path, id or number).
export function exactMatch(answer, value, { caseSensitive = true } = {}) {
  if (typeof answer !== "string" || typeof value !== "string") return false;
  const v = value.trim();
  if (v.length === 0) return false;
  return caseSensitive ? answer.includes(v) : answer.toLowerCase().includes(v.toLowerCase());
}

const rate = (k, n) => (n === 0 ? null : k / n);

export function armStats(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const missing = list.filter((r) => r.factInSummary !== true);
  const called = missing.filter((r) => r.calledTool === true).length;
  const correct = list.filter((r) => r.correct === true).length;
  const resume = list.filter((r) => typeof r.resumeSeqOk === "boolean");
  const resumeOk = resume.filter((r) => r.resumeSeqOk).length;
  return {
    runs: list.length,
    missing: missing.length,
    called,
    callRate: rate(called, missing.length),
    correct,
    correctRate: rate(correct, list.length),
    resumeRuns: resume.length,
    resumeOk,
  };
}

const ge = (x, min) => x !== null && x >= min;

export function verdict(byArm) {
  const arms = {};
  for (const id of ARM_ORDER) arms[id] = armStats(byArm?.[id]);
  const { a, b, c, d } = arms;
  const resumeRuns = ARM_ORDER.reduce((s, id) => s + arms[id].resumeRuns, 0);
  const resumeOk = ARM_ORDER.reduce((s, id) => s + arms[id].resumeOk, 0);
  const checks = [
    { name: "runs_per_arm", pass: ARM_ORDER.every((id) => arms[id].runs >= RUNS_PER_ARM), want: `>= ${RUNS_PER_ARM} each` },
    { name: "a_call_rate", pass: ge(a.callRate, MIN_CALL_RATE_A), got: a.callRate, want: `>= ${MIN_CALL_RATE_A}` },
    { name: "a_correct", pass: ge(a.correctRate, MIN_CORRECT_A), got: a.correctRate, want: `>= ${MIN_CORRECT_A}` },
    { name: "a_correct_ge_c", pass: a.correctRate !== null && c.correctRate !== null && a.correctRate >= c.correctRate, got: a.correctRate, want: `>= c ${c.correctRate}` },
    { name: "d_correct", pass: ge(d.correctRate, MIN_CORRECT_D), got: d.correctRate, want: `>= ${MIN_CORRECT_D}` },
    { name: "resume_seq", pass: resumeRuns >= RESUME_SEQ_RUNS && resumeOk === resumeRuns, got: `${resumeOk}/${resumeRuns}`, want: `all, >= ${RESUME_SEQ_RUNS}` },
  ];
  const info = { a_correct_minus_b: a.correctRate !== null && b.correctRate !== null ? a.correctRate - b.correctRate : null };
  return { id: "T-CMP", pass: checks.every((x) => x.pass), arms, checks, info };
}

const fmt = (x) => (x === null || x === undefined ? "-" : typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(2)) : String(x));

export function table(v) {
  const rows = [["arm", "runs", "call", "callRate", "correct", "correctRate", "resumeSeq"]];
  for (const id of ARM_ORDER) {
    const s = v.arms[id];
    rows.push([id, s.runs, `${s.called}/${s.missing}`, s.callRate, s.correct, s.correctRate, `${s.resumeOk}/${s.resumeRuns}`].map(fmt));
  }
  const out = rows.map((r) => `| ${r.join(" | ")} |`);
  out.splice(1, 0, `|${rows[0].map(() => "---").join("|")}|`);
  out.push("", "| check | pass | got | want |", "|---|---|---|---|");
  for (const c of v.checks) out.push(`| ${c.name} | ${c.pass ? "PASS" : "FAIL"} | ${fmt(c.got)} | ${c.want} |`);
  return out.join("\n");
}

// CLI: node e2e/live/compact/score.mjs <results.json>  ({ a: [run...], ..., e: [run...] })
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node e2e/live/compact/score.mjs <results.json>");
    process.exit(2);
  }
  const v = verdict(JSON.parse(readFileSync(file, "utf8")));
  console.log(JSON.stringify({ id: v.id, ok: v.pass, checks: v.checks.map(({ name, pass }) => ({ name, pass })), info: v.info }));
  console.log(table(v));
  process.exit(v.pass ? 0 : 1);
}
