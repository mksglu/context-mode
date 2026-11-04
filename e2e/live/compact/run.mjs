// T-CMP runner (DECISIONS-r9 §V T-CMP: 10 sessions per arm (a)-(e); TECH-SPEC §6.9 stream-json /compact turn;
// ADR-0012 keyless: Sonnet 5, effort low, --max-budget-usd on every call through session.mjs).
// Per arm and run: a fresh temp project (arms.mjs), one fixture session (fixtures.mjs, round robin),
// one keyless `claude -p` session (session.mjs), then the score fields for score.mjs:
//   factInSummary - false on every run: session.mjs does not expose the host summary text, so every run
//                   counts as "fact missing" and the arm (a) call rate is over all its runs (stricter).
//   calledTool    - a ctx_resume or ctx_search call in the turn after the reset turn.
//   correct       - exactMatch(final text, fixture answer key).
//   resumeSeqOk   - ctx_resume({session, seq}) on the release-out server returns the > 640 B fact row whole.
// stdout: one JSON line (e2e/live/run.mjs reads its `ok` field); table and cost go to stderr. Exit 1 on fail.
// Usage: node e2e/live/compact/run.mjs [--bin <claude>] [--release-out <dir>] [--root <scratch dir>]
//        [--runs 10] [--budget 0.25] [--model <id>] [--effort <level>] [--arms a,b,c,d,e] [--out <result.json>]
// Result file: after every run the full JSON (per-arm stats, per-run rows with tool calls and final text, cost)
// is rewritten to --out (default <scratch>/t-cmp-result-<time>.json), so no arm's numbers are lost.
// With --arms the run is partial: the table is printed, `ok` is true only when the verdict passes.
// Dry mode: --bin <fake claude stub> (no model, no network); the stub runs no hooks, so resume_seq fails.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readSync, closeSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARM_IDS, RUNS_PER_ARM, TOOL_PREFIX, setupArm } from "./arms.mjs";
import { FIXTURES } from "./fixtures.mjs";
import { runSession } from "./session.mjs";
import { exactMatch, table, verdict } from "./score.mjs";
import { dumpDb } from "../../harness/db-dump.mjs";
import { spawnBundle } from "../../harness/mcp-client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BIN = arg("--bin", "");
const RELEASE_OUT = path.resolve(arg("--release-out", path.join(ROOT, "release-out")));
const SCRATCH = path.resolve(arg("--root", os.tmpdir()));
const RUNS = Number(arg("--runs", String(RUNS_PER_ARM)));
const BUDGET = arg("--budget", "0.25");
const MODEL = arg("--model", undefined);
const EFFORT = arg("--effort", undefined);
const ARMS_SEL = arg("--arms", ARM_IDS.join(",")).split(",").filter((x) => ARM_IDS.includes(x));
const OUT = path.resolve(arg("--out", path.join(SCRATCH, `t-cmp-result-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)));
const READ_TOOLS = ["ctx_resume", "ctx_search"].map((t) => TOOL_PREFIX + t);
const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t-cmp-run", version: "0" } };
// Same store path as the hook and server (impl/02 §2): ~/.context-mode/projects/<sha256(git dir) 16 hex>/context.db
const projectDir = (cwd) => path.join(os.homedir(), ".context-mode", "projects",
  createHash("sha256").update(realpathSync.native(path.join(cwd, ".git"))).digest("hex").slice(0, 16));

// Real Claude Code binary only (Mach-O or ELF magic), as e2e/live/run.mjs picks it.
function realClaude() {
  for (const dir of (process.env.PATH || "").split(":")) {
    const c = path.join(dir, "claude");
    if (!existsSync(c)) continue;
    const r = realpathSync(c);
    const b = Buffer.alloc(4); const fd = openSync(r, "r"); readSync(fd, b, 0, 4, 0); closeSync(fd);
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(b.toString("hex"))) return r;
  }
  return "";
}

function fail(msg) {
  console.log(JSON.stringify({ id: "T-CMP", ok: false, error: msg }));
  console.error(msg);
  process.exit(1);
}

// ctx_resume(seq) check: the prompt row that holds the big fact, read back through the release-out server.
async function resumeSeqOk(cwd, fact) {
  const db = path.join(projectDir(cwd), "context.db");
  if (!existsSync(db)) return false;
  const row = dumpDb(db, ["events"]).events.find((r) => r.kind === "prompt" && String(r.body).includes(fact));
  if (row === undefined) return false;
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: process.env.TMPDIR, CLAUDE_PROJECT_DIR: cwd };
  const c = spawnBundle(path.join(RELEASE_OUT, "server.mjs"), env, ["--agent", "claude-code"]);
  try {
    await c.request("initialize", INIT);
    c.notify("notifications/initialized");
    const r = await c.request("tools/call", { name: "ctx_resume", arguments: { session: row.session_id, seq: row.seq } });
    await c.close();
    return r.isError !== true && String(r.content?.[0]?.text ?? "").includes(fact);
  } finally {
    c.kill();
  }
}

function returnedAfter(r, after, fact) {
  const ids = new Set(r.toolCalls.filter((t) => t.turn >= after && READ_TOOLS.includes(t.name)).map((t) => t.id));
  const res = r.toolResults.filter((x) => ids.has(x.id));
  return { calls: res.length, bytes: res.reduce((n, x) => n + x.bytes, 0), errors: res.filter((x) => x.isError).length, factReturned: res.some((x) => x.text.includes(fact)) };
}

async function one(id, i, bin, root) {
  const f = FIXTURES[i % FIXTURES.length];
  const big = f.facts.find((x) => Buffer.byteLength(x.value) > 640).value;
  const s = setupArm(id, { releaseOut: RELEASE_OUT, root });
  const data = projectDir(s.cwd);
  const ours = !existsSync(data); // drop only the store this run created (fresh temp git dir, fresh key)
  try {
    const r = await runSession({ bin, turns: f.turns, nextRequest: f.nextRequest, budgetUsd: BUDGET, model: MODEL, effort: EFFORT, cwd: s.cwd, args: s.args, reset: s.reset });
    const after = f.turns.length + 1; // turn index of the next request (turns, reset, next)
    return {
      fixture: f.id,
      factInSummary: false,
      calledTool: r.toolCalls.some((t) => t.turn >= after && READ_TOOLS.includes(t.name)),
      correct: exactMatch(r.finalText, f.answer.exact, { caseSensitive: f.answer.caseSensitive !== false }),
      resumeSeqOk: await resumeSeqOk(s.cwd, big),
      compacted: r.compacted,
      isError: r.isError,
      costUsd: r.costUsd,
      toolCalls: r.toolCalls,
      // Returned bytes of the read tools after the reset turn, and whether the big fact came back whole.
      returned: returnedAfter(r, after, big),
      // Hook additionalContext bytes over the whole session (from --include-hook-events).
      hookContexts: r.hookContexts,
      injectedBytes: r.hookContexts.reduce((n, x) => n + x.bytes, 0),
      finalText: r.finalText,
      exitCode: r.exitCode,
    };
  } finally {
    if (ours) rmSync(data, { recursive: true, force: true });
    s.cleanup();
  }
}

const bin = BIN || realClaude();
if (bin === "") fail("T-CMP: no real claude binary on PATH (pass --bin)");
if (!existsSync(path.join(RELEASE_OUT, ".claude-plugin", "plugin.json"))) fail(`T-CMP: no built plugin in ${RELEASE_OUT} (node build/build.mjs --out release-out)`);
mkdirSync(SCRATCH, { recursive: true });
const root = mkdtempSync(path.join(SCRATCH, "cm-t-cmp-"));
const byArm = {};
let cost = 0;
// Median over arm (a) runs of the hook additionalContext bytes per session; null when no run exists.
const injectedMedian = () => {
  const xs = (byArm.a ?? []).map((r) => r.injectedBytes).sort((x, y) => x - y);
  if (xs.length === 0) return null;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
};
const snapshot = (final) => {
  const v = verdict(byArm);
  const doc = { id: "T-CMP", model: MODEL ?? "session.mjs default", effort: EFFORT ?? "session.mjs default", budgetUsd: BUDGET,
    runsPerArm: RUNS, arms: ARMS_SEL, complete: final, costUsd: Number(cost.toFixed(4)), stats: v.arms, checks: v.checks, info: { ...v.info, injectedBytesMedian: injectedMedian() }, runs: byArm };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc, null, 2));
  return v;
};
try {
  for (const id of ARMS_SEL) {
    byArm[id] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await one(id, i, bin, root);
      byArm[id].push(r);
      cost += r.costUsd;
      snapshot(false);
      console.error(`arm ${id} run ${i + 1}/${RUNS} ${r.fixture}: called ${r.calledTool} returned ${r.returned.bytes}B fact ${r.returned.factReturned} correct ${r.correct} resumeSeq ${r.resumeSeqOk} compacted ${r.compacted} $${r.costUsd.toFixed(4)}`);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
const v = snapshot(true);
const sessions = ARMS_SEL.reduce((n, id) => n + byArm[id].length, 0);
console.log(JSON.stringify({ id: v.id, ok: v.pass, sessions, costUsd: Number(cost.toFixed(4)), resultFile: OUT, checks: v.checks.map(({ name, pass }) => ({ name, pass })), info: { ...v.info, injectedBytesMedian: injectedMedian() } }));
console.error(table(v));
console.error(`result file: ${OUT}`);
console.error(`T-CMP ${v.pass ? "PASS" : "FAIL"} | ${sessions} sessions | list-price $${cost.toFixed(4)}`);
process.exit(v.pass ? 0 : 1);
