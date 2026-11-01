// Prompt-cache A/B on Codex (https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/cache). Arms: off (no plugin) and v2 (setup --agents codex into a temp
// CODEX_HOME). A 5-turn session through `codex exec --json` then `codex exec resume <thread>`; usage per model
// request is read from the rollout file (token_usage_record), per turn from the exec JSON (turn.completed.usage).
// Codex reports input_tokens INCLUDING cached_input_tokens and no write count: cache_read = cached,
// cache_creation = input - cached, uncached input = 0. The transcript is the evidence, never model prose.
// No regex, no truncation: every raw stdout, stderr and rollout is stored whole.
import { runGroup } from "../lib/proc-group.mjs";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const MODEL = "gpt-6-astra";
const EFFORT = "low";
const BREAK_BYTES = 1024;

// ---- pure analysis (unit-tested in tests/cache/codex-usage.test.mjs) ----

/** Parse `codex exec --json` stdout. Every line must be JSON. */
export function parseExecJson(stdout) {
  let threadId = null, finalText = "";
  const turns = [], items = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    let e;
    try { e = JSON.parse(line); } catch { throw new Error(`codex exec line is not JSON: ${line.length} chars`); }
    if (e.type === "thread.started") threadId = e.thread_id;
    else if (e.type === "item.completed") {
      items.push(e.item);
      if (e.item?.type === "agent_message") finalText = e.item.text;
    } else if (e.type === "turn.completed") {
      const u = e.usage ?? {};
      turns.push({ usage: { input: u.input_tokens ?? 0, cached: u.cached_input_tokens ?? 0, output: u.output_tokens ?? 0 } });
    }
  }
  return { threadId, turns, items, finalText };
}

/** Cache hit ratio of one usage row: cache_read / (cache_read + cache_creation + input) = cached / input here. */
export function hitRatio(u) { return u.input === 0 ? 0 : u.cached / u.input; }

/** Per model request usage from a rollout JSONL, in ordinal order. */
export function requestsFromRollout(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const e = JSON.parse(line);
    if (e.type !== "token_usage_record") continue;
    const u = e.payload.usage;
    rows.push({ ordinal: e.ordinal, turnId: e.payload.turn_id, input: u.input_tokens, cached: u.cached_input_tokens ?? 0, output: u.output_tokens ?? 0 });
  }
  rows.sort((a, b) => a.ordinal - b.ordinal);
  return rows.map(({ turnId, input, cached, output }) => ({ turnId, input, cached, output }));
}

/**
 * Cache breaks. Request k (k>0): everything of request k-1's prompt is old prefix and should be read.
 * rewritten = prev.input - cached_k. Output tokens of k-1 enter the prefix for the first time, so they are
 * new content and are not counted. A break is rewritten > 1024.
 */
export function findBreaks(reqs) {
  const out = [];
  for (let i = 1; i < reqs.length; i++) {
    const rewritten = reqs[i - 1].input - reqs[i].cached;
    if (rewritten > BREAK_BYTES) out.push({ index: i, turnId: reqs[i].turnId, rewritten });
  }
  return out;
}

/** Cross-session prefix read: session B's first request cached tokens over session A's first request input. */
export function crossSessionRead(reqsA, reqsB) {
  const prefixA = reqsA[0].input, cachedB = reqsB[0].cached;
  return { prefixA, cachedB, fraction: cachedB / prefixA };
}

// ---- runner ----

const SEARCH_OFF = "Search the project for the string handleRetry (use any search tool you have) and list which files contain it.";
const SEARCH_V2 = "Call the tool ctx_index on the file module.js, then call the tool ctx_search with the query handleRetry, and list which functions it finds.";
/** Same 5-turn mix per arm. Only turn 3 differs: the v2 arm is told to use the ctx tools so they are exercised. */
export function promptsFor(arm) {
  return [
    "Run `cat big.log` in the shell and tell me how many lines contain the word ERROR.",
    "Read lines 1 to 300 of module.js and tell me the name of the longest function.",
    arm === "v2" ? SEARCH_V2 : SEARCH_OFF,
    "In one sentence, what is a prompt cache?",
    "Run `echo hello` in the shell and show me the output.",
  ];
}
const CROSS_PROMPT = "Reply with the word ok.";

function writeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const lines = [];
  let bytes = 0, i = 0;
  while (bytes < 200 * 1024) {
    const lvl = i % 37 === 0 ? "ERROR" : i % 11 === 0 ? "WARN" : "INFO";
    const l = `2026-10-25T10:${String(i % 60).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}Z ${lvl} request id=${i} route=/api/v1/items status=${lvl === "ERROR" ? 500 : 200} took=${(i * 13) % 900}ms`;
    lines.push(l); bytes += l.length + 1; i++;
  }
  writeFileSync(join(dir, "big.log"), lines.join("\n") + "\n");
  const mod = [];
  for (let f = 0; f < 30; f++) {
    mod.push(`export function task${f}(input) {`);
    for (let k = 0; k < f % 7 + 2; k++) mod.push(`  const v${k} = input + ${k}; // step ${k} of task ${f}`);
    mod.push(`  return ${f === 12 ? "handleRetry(input)" : "input"};`, "}", "");
  }
  mod.push("export function handleRetry(x) { return x; }");
  writeFileSync(join(dir, "module.js"), mod.join("\n") + "\n");
}

function makeHome(root, name, arm, authSrc) {
  const home = join(root, name);
  const codexHome = join(home, ".codex");
  mkdirSync(codexHome, { recursive: true });
  copyFileSync(authSrc, join(codexHome, "auth.json"));
  return { home, codexHome };
}

async function setupV2(env, releaseOut) {
  const r = await runGroup(process.execPath, [join(releaseOut, "cli.mjs"), "setup", "--yes", "--agents", "codex"], { env, cwd: releaseOut }, 180000);
  if (r.status !== 0) throw new Error(`setup --agents codex failed: ${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const CFG = ["-c", `model="${MODEL}"`, "-c", `model_reasoning_effort="${EFFORT}"`, "-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"'];

async function codexTurn(env, cwd, threadId, prompt, rawDir, tag) {
  const args = threadId === null
    ? ["exec", "--json", "--skip-git-repo-check", ...CFG, prompt]
    : ["exec", "resume", "--json", "--skip-git-repo-check", ...CFG, threadId, prompt];
  const r = await runGroup("codex", args, { env, cwd }, 600000);
  writeFileSync(join(rawDir, `${tag}.stdout.jsonl`), r.stdout);
  writeFileSync(join(rawDir, `${tag}.stderr.txt`), r.stderr);
  if (r.timedOut || r.status !== 0) throw new Error(`codex ${tag} status=${r.status} timedOut=${r.timedOut}`);
  return parseExecJson(r.stdout);
}

function findRollout(codexHome, threadId) {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const hits = walk(join(codexHome, "sessions")).filter((p) => p.endsWith(`${threadId}.jsonl`));
  if (hits.length !== 1) throw new Error(`rollout for ${threadId}: ${hits.length} files`);
  return hits[0];
}

function mcpCalls(items) { return items.filter((i) => i.type === "mcp_tool_call").map((i) => `${i.server}.${i.tool}`); }

async function runSession({ root, rawRoot, arm, label, authSrc, releaseOut, home }) {
  const h = home ?? makeHome(root, `home-${label}`, arm, authSrc);
  const env = { ...process.env, HOME: h.home, USERPROFILE: h.home, CODEX_HOME: h.codexHome };
  const proj = join(root, `proj-${label}`);
  const rawDir = join(rawRoot, label); mkdirSync(rawDir, { recursive: true });
  writeFixtures(proj);
  let setup = null;
  if (arm === "v2" && !existsSync(join(h.codexHome, "config.toml"))) setup = await setupV2(env, releaseOut);
  let threadId = null; const turns = [], calls = [];
  const prompts = promptsFor(arm);
  for (let t = 0; t < prompts.length; t++) {
    const r = await codexTurn(env, proj, threadId, prompts[t], rawDir, `turn${t + 1}`);
    threadId = threadId ?? r.threadId;
    turns.push({ n: t + 1, usage: r.turns[0]?.usage ?? null, mcp: mcpCalls(r.items), shell: r.items.filter((i) => i.type === "command_execution").length });
    calls.push(...mcpCalls(r.items));
  }
  if (arm === "v2" && calls.length === 0) throw new Error(`v2 arm ${label}: no ctx tool call happened; the run does not exercise v2`);
  const rollout = findRollout(h.codexHome, threadId);
  copyFileSync(rollout, join(rawDir, "rollout.jsonl"));
  const reqs = requestsFromRollout(readFileSync(rollout, "utf8"));
  const breaks = findBreaks(reqs);
  const ratioTurns2to5 = (() => {
    const rows = reqs.filter((q) => q.turnId !== reqs[0].turnId);
    const inp = rows.reduce((a, q) => a + q.input, 0), cac = rows.reduce((a, q) => a + q.cached, 0);
    return inp === 0 ? 0 : cac / inp;
  })();
  const total = reqs.reduce((a, q) => ({ input: a.input + q.input, cached: a.cached + q.cached }), { input: 0, cached: 0 });
  return { arm, label, threadId, setup, requests: reqs, turns, breaks, hitRatioSession: total.input === 0 ? 0 : total.cached / total.input,
    hitRatioTurns2to5: ratioTurns2to5, firstRequestInput: reqs[0].input, firstRequestCached: reqs[0].cached, mcpCalls: calls };
}

async function runCross({ root, rawRoot, arm, authSrc, releaseOut }) {
  const label = `cross-${arm}`;
  const h = makeHome(root, `home-${label}`, arm, authSrc);
  const env = { ...process.env, HOME: h.home, USERPROFILE: h.home, CODEX_HOME: h.codexHome };
  const proj = join(root, `proj-${label}`);
  const rawDir = join(rawRoot, label); mkdirSync(rawDir, { recursive: true });
  writeFixtures(proj);
  if (arm === "v2") await setupV2(env, releaseOut);
  const s = [];
  for (const tag of ["A", "B"]) {
    const t0 = Date.now();
    const r = await codexTurn(env, proj, null, CROSS_PROMPT, rawDir, `session${tag}`);
    const rollout = findRollout(h.codexHome, r.threadId);
    copyFileSync(rollout, join(rawDir, `session${tag}.rollout.jsonl`));
    s.push({ tag, threadId: r.threadId, reqs: requestsFromRollout(readFileSync(rollout, "utf8")), startedAt: t0, endedAt: Date.now() });
  }
  const x = crossSessionRead(s[0].reqs, s[1].reqs);
  return { arm, ...x, gapMs: s[1].startedAt - s[0].endedAt, sessionA: s[0].reqs[0], sessionB: s[1].reqs[0] };
}

function median(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

async function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const n = Number(get("--n", "2"));
  const suffix = get("--suffix", "");
  const root = get("--root", "/private/tmp/cm-v2-cp-cx/run");
  const rawRoot = get("--raw", "/private/tmp/cm-v2-impl-private/cache/cx");
  const releaseOut = get("--release-out", join(REPO, "release-out"));
  const authSrc = join(process.env.HOME, ".codex", "auth.json");
  const version = (await runGroup("codex", ["--version"], { env: process.env }, 30000)).stdout.trim();
  mkdirSync(root, { recursive: true }); mkdirSync(rawRoot, { recursive: true });
  const sessions = [];
  for (let i = 1; i <= n; i++) {
    for (const arm of ["off", "v2"]) {
      sessions.push(await runSession({ root, rawRoot, arm, label: `${arm}-${i}`, authSrc, releaseOut }));
      console.error(`done ${arm}-${i}`);
    }
  }
  const cross = [];
  for (const arm of ["off", "v2"]) cross.push(await runCross({ root, rawRoot, arm, authSrc, releaseOut }));
  const arms = {};
  for (const arm of ["off", "v2"]) {
    const ss = sessions.filter((s) => s.arm === arm);
    arms[arm] = { sessions: ss.length, breaksPerSession: ss.map((s) => s.breaks.length), hitRatioTurns2to5: ss.map((s) => s.hitRatioTurns2to5),
      hitRatioTurns2to5Median: median(ss.map((s) => s.hitRatioTurns2to5)), firstRequestInput: ss.map((s) => s.firstRequestInput),
      mcpCalls: ss.map((s) => s.mcpCalls.length) };
  }
  const c = Object.fromEntries(cross.map((x) => [x.arm, x]));
  const pass = {
    breaks: arms.v2.breaksPerSession.reduce((a, b) => a + b, 0) <= arms.off.breaksPerSession.reduce((a, b) => a + b, 0),
    hitRatio: arms.v2.hitRatioTurns2to5Median >= arms.off.hitRatioTurns2to5Median - 0.02,
    crossSession: c.v2.fraction >= 0.9,
  };
  const out = { codexVersion: version, model: MODEL, effort: EFFORT, n, definitions: "cache_read = cached_input_tokens; cache_creation = input_tokens - cached_input_tokens; break = prev request input - cached > 1024",
    usage: "per request from rollout token_usage_record; per turn exec JSON turn.completed.usage is the SUM over the requests of a turn", sessions, cross, arms, pass };
  const dest = join(REPO, "docs", "v2", "spikes", "cache", `codex${suffix}.json`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ arms, cross: c, pass }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
