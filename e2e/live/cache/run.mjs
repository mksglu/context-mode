// Prompt-cache A/B on Claude Code (https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/cache). Arms: off (no plugin) and v2 (--plugin-dir <release-out>).
// Parts: (1) main: n 6-turn sessions per arm, one `claude -p` process per turn, turn 1 --session-id, later turns --resume
// on the same id; (2) cross: two fresh sessions back to back in the same project, turn-1 cache_read of the second;
// (3) compact: one session with /compact after turn 3, the turns after it recorded.
// Evidence = the usage fields of the stream-json assistant records (analyze.mjs), never model prose.
// Isolation (ADR-0012, gateway CLAUDE.md): real claude binary, fresh CLAUDE_CONFIG_DIR per session holding only the login
// credential, own HOME, ENABLE_CLAUDEAI_MCP_SERVERS=false, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1, CLAUDE_CODE_DISABLE_CLAUDE_MDS=1,
// explicit --model, stdin /dev/null, --max-budget-usd per call, process-group kill on timeout. No API key.
// Usage: node e2e/live/cache/run.mjs --bundle <release-out> --model <id> [--n 3] [--effort low] [--budget 1] [--cap 10]
//        [--root <scratch>] [--raw <dir>] [--out <json>] [--parts main,cross,compact] [--arms off,v2]
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGroup } from "../lib/proc-group.mjs";
import { analyzeSession, crossSession, parseTurn, verdict } from "./analyze.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BUNDLE = path.resolve(arg("--bundle", "release-out"));
const MODEL = arg("--model", "");
const EFFORT = arg("--effort", "low");
const N = Number(arg("--n", "3"));
const BUDGET = arg("--budget", "1");
const CAP = Number(arg("--cap", "10"));
const ARMS = arg("--arms", "off,v2").split(",");
const PARTS = arg("--parts", "main,cross,compact").split(",");
const SCRATCH = path.resolve(arg("--root", path.join(os.tmpdir(), "cm-v2-cp-cc")));
const RAW = arg("--raw", "") === "" ? null : path.resolve(arg("--raw", ""));
const BASE = arg("--base", "") === "" ? null : path.resolve(arg("--base", ""));
const OUT = path.resolve(arg("--out", path.join(SCRATCH, `cache-claude-code-${Date.now()}.json`)));
const TURN_TIMEOUT_MS = 420000;

function fail(msg) { console.log(JSON.stringify({ id: "cache-claude-code", ok: false, error: msg })); process.exit(1); }

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

function loginCredential() {
  try {
    const s = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { encoding: "utf8" });
    return JSON.parse(s).claudeAiOauth ? s : "";
  } catch { return ""; }
}

// ---- fixtures: a 200 KB log, a 300-line source file, one retry-policy note ----
export function bigLog() {
  const rows = [];
  for (let i = 0; i < 2600; i++) {
    const level = i % 97 === 0 ? "ERROR" : i % 13 === 0 ? "WARN" : "INFO";
    rows.push(`2026-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z ${level} req=${i} route=/api/v${i % 4}/item/${i * 7} status=${level === "ERROR" ? 500 : 200} ms=${(i * 31) % 997} retry=${i % 5}`);
  }
  return rows.join("\n") + "\n";
}
export function appSource() {
  const rows = ["// retry policy: three attempts, backoff doubles from 100 ms."];
  for (let i = 0; rows.length < 300; i++) rows.push(`export function handle${i}(x) { return x * ${i + 2} + ${i}; } // retry slot ${i}`);
  return rows.join("\n") + "\n";
}

const T = {
  cat: "Run `cat big.log` with the Bash tool. Then tell me, in one sentence, how many lines you saw that contain ERROR.",
  read: "Use the Read tool on src/app.js with offset 1 and limit 300. Then name the function on line 10.",
  grep: "Use the Grep tool to find the lines of src/app.js that contain the word retry. How many lines match?",
  search: "Use the ctx_search tool to search for the word retry. If you have no ctx_search tool, use the Grep tool on the whole project for retry instead. Say which tool you used.",
  plain: "What is 17 times 23? Answer with the number only.",
  small: "Run `echo done-six` with the Bash tool and tell me what it printed.",
  ok: "Reply with the single word ok.",
};
const MAIN_TURNS = ["cat", "read", "grep", "search", "plain", "small"];
const COMPACT_TURNS = ["cat", "read", "grep", "/compact", "search", "plain", "small"];

const cred = { value: "" };
let spent = 0;
const log = (m) => console.error(`[${new Date().toISOString()}] ${m}`);

function childEnv(cfg, home) {
  const env = {};
  for (const k of ["PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG"]) if (process.env[k] !== undefined) env[k] = process.env[k];
  return Object.assign(env, { HOME: home, CLAUDE_CONFIG_DIR: cfg, ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
}

/** A fresh sandbox: own HOME, own config dir with the login credential only, a git project with the fixtures. */
function sandbox(tag) {
  const dir = mkdtempSync(path.join(SCRATCH, `${tag}-`));
  const cfg = path.join(dir, "config"), home = path.join(dir, "home"), cwd = path.join(dir, "project");
  for (const d of [cfg, home, cwd, path.join(cwd, "src")]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(cfg, ".credentials.json"), cred.value); chmodSync(path.join(cfg, ".credentials.json"), 0o600);
  if (spawnSync("git", ["init", "-q", cwd]).status !== 0) throw new Error("git init failed");
  writeFileSync(path.join(cwd, "big.log"), bigLog());
  writeFileSync(path.join(cwd, "src", "app.js"), appSource());
  return { dir, cfg, home, cwd };
}

/** One claude -p call. first: --session-id, else --resume. Returns the parsed turn plus the raw stdout. */
async function oneTurn(bin, sb, arm, sid, first, text, label) {
  if (spent >= CAP) throw new Error(`cost cap ${CAP} reached (${spent.toFixed(2)})`);
  const args = ["-p", text, "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", BUDGET, "--output-format", "stream-json", "--verbose",
    "--include-hook-events", "--permission-mode", "bypassPermissions", "--tools", "Bash,Read,Grep,Glob",
    ...(first ? ["--session-id", sid] : ["--resume", sid]),
    ...(arm === "v2" ? ["--plugin-dir", BUNDLE] : ["--strict-mcp-config"])];
  const t0 = Date.now();
  const r = await runGroup(bin, args, { cwd: sb.cwd, env: childEnv(sb.cfg, sb.home) }, TURN_TIMEOUT_MS);
  const turn = parseTurn(r.stdout);
  turn.label = label; turn.wallMs = Date.now() - t0; turn.exitCode = r.status; turn.timedOut = r.timedOut; turn.stderrBytes = r.stderr.length;
  if (r.status !== 0 || r.timedOut) turn.isError = true;
  spent += turn.costUsd;
  if (RAW) { mkdirSync(RAW, { recursive: true }); writeFileSync(path.join(RAW, `${path.basename(sb.dir)}-${label.replaceAll("/", "")}-${sid.slice(0, 8)}.jsonl`), r.stdout); }
  return turn;
}

const brief = (t) => ({ label: t.label, tools: t.tools, subagentCalls: t.subagentCalls, mcp: t.mcp, hooks: t.hooks, compacted: t.compacted, isError: t.isError, costUsd: t.costUsd, wallMs: t.wallMs,
  calls: t.calls.map(({ input, cacheRead, cacheCreation, output, afterCompact }) => ({ input, cacheRead, cacheCreation, output, afterCompact })), sessionId: t.sessionId });
const valid = (arm, turns) => turns.every((t) => !t.isError && (t.calls.length > 0 || t.label === "/compact")) && (arm !== "v2" || turns[0].mcp.some((m) => m.includes("context-mode") && m.endsWith(":connected")));

async function runSession(bin, arm, labels, tag) {
  const sb = sandbox(`${arm}-${tag}`);
  const sid = randomUUID();
  const turns = [];
  try {
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      const t = await oneTurn(bin, sb, arm, sid, i === 0, l === "/compact" ? "/compact" : T[l], l);
      turns.push(t);
      log(`${arm} ${tag} turn ${i + 1}/${labels.length} ${l}: calls ${t.calls.length} cost ${t.costUsd.toFixed(3)} total ${spent.toFixed(2)}${t.isError ? " ERROR" : ""}`);
    }
  } finally { rmSync(sb.dir, { recursive: true, force: true }); }
  const real = turns.filter((t) => t.label !== "/compact");
  return { arm, tag, valid: valid(arm, turns), analysis: analyzeSession(turns), turns: turns.map(brief), realTurns: real.length };
}

async function runCross(bin, arm, tag) {
  const sb = sandbox(`${arm}-${tag}`);
  try {
    const a = await oneTurn(bin, sb, arm, randomUUID(), true, T.ok, "ok-a");
    const b = await oneTurn(bin, sb, arm, randomUUID(), true, T.ok, "ok-b");
    log(`${arm} ${tag} cross: a prefix ${a.calls[0]?.cacheCreation + a.calls[0]?.cacheRead} b read ${b.calls[0]?.cacheRead} total ${spent.toFixed(2)}`);
    const ok = !a.isError && !b.isError && a.calls.length > 0 && b.calls.length > 0;
    return { arm, tag, valid: ok, gapMs: null, a: brief(a), b: brief(b), cross: ok ? crossSession(a, b) : null };
  } finally { rmSync(sb.dir, { recursive: true, force: true }); }
}

const median = (xs) => { const v = xs.filter((n) => typeof n === "number").sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };

function main() {
  const bin = realClaude();
  if (bin === "") fail("no real claude binary on PATH");
  if (MODEL === "") fail("--model is required");
  if (ARMS.includes("v2") && !existsSync(path.join(BUNDLE, ".claude-plugin", "plugin.json"))) fail(`no built plugin in ${BUNDLE}`);
  cred.value = loginCredential();
  if (cred.value === "") fail("no login credential in the Keychain (ADR-0012: login only, no API key)");
  mkdirSync(SCRATCH, { recursive: true });
  const version = String(execFileSync(bin, ["--version"], { encoding: "utf8" })).trim();
  const doc = BASE ? JSON.parse(readFileSync(BASE, "utf8")) : { id: "cache-claude-code", claudeVersion: version, model: MODEL, effort: EFFORT, n: N, capUsd: CAP, bundle: path.basename(BUNDLE), complete: false, costUsd: 0, arms: {}, compact: {}, error: null };
  if (BASE) { doc.complete = false; doc.error = null; doc.capUsd = CAP; spent = Number(doc.costUsd ?? 0); }
  const save = () => { doc.costUsd = Number(spent.toFixed(4)); mkdirSync(path.dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(doc, null, 2)); };
  return (async () => {
    try {
      for (const arm of ARMS) doc.arms[arm] ??= { sessions: [], crossRuns: [] };
      if (PARTS.includes("main")) for (let i = 0; i < N; i++) for (const arm of ARMS) { doc.arms[arm].sessions.push(await runSession(bin, arm, MAIN_TURNS, `main${i}`)); save(); }
      if (PARTS.includes("cross")) for (let i = 0; i < N; i++) for (const arm of ARMS) { doc.arms[arm].crossRuns.push(await runCross(bin, arm, `cross${doc.arms[arm].crossRuns.length}`)); save(); }
      if (PARTS.includes("compact")) for (const arm of ARMS) { doc.compact[arm] = await runSession(bin, arm, COMPACT_TURNS, "compact"); save(); }
      doc.complete = true;
    } catch (e) { doc.error = String(e.message ?? e); }
    for (const arm of ARMS) {
      const a = doc.arms[arm];
      const ok = a.sessions.filter((s) => s.valid);
      a.summary = { sessionsValid: ok.length, sessionsRun: a.sessions.length,
        breaksPerSession: ok.map((s) => s.analysis.breaks.length),
        hitRatioPerTurnMean: [0, 1, 2, 3, 4, 5].map((t) => { const v = ok.map((s) => s.analysis.perTurn[t]?.hitRatio).filter((x) => typeof x === "number"); return v.length ? Number((v.reduce((n, x) => n + x, 0) / v.length).toFixed(4)) : null; }),
        firstPrefixTokensMedian: median(ok.map((s) => s.analysis.firstPrefix)),
        crossRuns: a.crossRuns.filter((c) => c.valid).length, crossShares: a.crossRuns.filter((c) => c.valid).map((c) => Number(c.cross.share.toFixed(4))),
        crossTurn1PrefixTokens: a.crossRuns.filter((c) => c.valid).map((c) => c.cross.aPrefix), crossTurn1Read: a.crossRuns.filter((c) => c.valid).map((c) => c.cross.bRead) };
    }
    if (doc.arms.off && doc.arms.v2) {
      const pack = (a) => ({ sessions: a.sessions.filter((s) => s.valid).map((s) => s.analysis), cross: a.crossRuns.filter((c) => c.valid).map((c) => c.cross) });
      doc.verdict = verdict(pack(doc.arms.off), pack(doc.arms.v2));
    }
    save();
    console.log(JSON.stringify({ id: doc.id, ok: doc.complete && doc.error === null, costUsd: doc.costUsd, verdict: doc.verdict ?? null, out: OUT }));
    process.exit(doc.complete ? 0 : 1);
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
