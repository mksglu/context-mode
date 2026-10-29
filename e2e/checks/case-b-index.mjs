#!/usr/bin/env node
// e2e/checks/case-b-index.mjs — local check for live case T-F1 (e2e/live/cases/case-b-index.json),
// DECISIONS-r9.md F1/T-F1, docs/v2/impl/09-hooks.md §4.6 step 5, docs/v2/impl/14-tests.md §6.
//
// Drives the built release-out/hook.mjs PostToolUse directly, as a command-hook host would (spawn,
// write JSON on stdin, read stdout, wait for exit). No model call, imports nothing from src/.
//
// DECISIONS-r9 F1 split on a subagent (Case B/C) tool result against OUTPUT_CAP and SYNC_INDEX_MAX_BYTES:
//   bytes <= OUTPUT_CAP (16384)              -> decision "allow" (no chunk, no index at all)
//   OUTPUT_CAP < bytes <= SYNC_INDEX_MAX_BYTES (65536) -> sync: indexText + selectChunks inline, "replace"
//   bytes > SYNC_INDEX_MAX_BYTES              -> in-memory chunk + selectChunksInMemory, detached FTS5 write, "replace"
// Case B (agent type's tools: Bash, no ctx tool) and Case C (no Bash, no ctx tool) hit the exact same
// dispatch.ts PostToolUse branch once `isSubagentCall(ev)` is true and `subCase !== "A"` (08-enforcement.md
// §5.1): the B/C distinction only changes PreToolUse deny/rewrite behaviour, not this PostToolUse split. So
// the 50-run perf budget below is measured once, on Case B (the agentType row named in DECISIONS-r9 F1's own
// evidence file, `out/r9/perf-f1.md`); Case C runs the same three sizes at reduced count (10) to prove the
// branch is case-independent, per docs/v2/impl/DEVIATIONS.md (this file's own deviation row).
//
// Sizes: 16 KB (== OUTPUT_CAP, the allow boundary), 64 KB (== SYNC_INDEX_MAX_BYTES, the sync-vs-in-memory
// boundary), 1 MB (well above it, the detached-write path). Every input byte is ASCII, built from fixed,
// uniquely tagged "lines" separated by a blank line so each line is its own chunkText "text"-kind block
// (05-tools-index.md §2 step 2) — well under MAX_CHUNK_BYTES (4096), so no chunk boundary ever falls inside
// a line. A returned line that is not byte-identical to one of the input's own lines means something was cut.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const HOOK_BUNDLE = path.join(REPO_ROOT, "release-out", "hook.mjs");

// Constants mirrored from src/core/contracts/constants.ts (e2e/ never imports src/, GS4).
const OUTPUT_CAP = 16384; // 00-architecture.md §3.2, Q2
const REPLACE_TRIGGER_BYTES = 4096; // D-M7-SV-1: the replace path has its own trigger; OUTPUT_CAP is no longer the boundary
const SYNC_INDEX_MAX_BYTES = 65536; // 00-architecture.md §3.2, DECISIONS-r9 F1
const HOOK_COMBINED_P95_MS = 60; // 00-architecture.md §3.2, GS6/A31

const SIZES = [REPLACE_TRIGGER_BYTES, 16 * 1024, 64 * 1024, 1024 * 1024]; // 16 KB, 64 KB (== SYNC_INDEX_MAX_BYTES), 1 MB
const RUNS_PER_SIZE = 50;
const CASE_C_RUNS_PER_SIZE = 10; // see deviation note above

function fail(reason) {
  console.log(JSON.stringify({ ok: false, reason }));
  process.exit(0);
}

function ensureBuilt() {
  if (existsSync(HOOK_BUNDLE)) return;
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "build", "build.mjs"), "--out", path.join(REPO_ROOT, "release-out")],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error("build.mjs exit " + r.status + ": " + (r.stderr ?? "").split("\n")[0]);
}

// One fixed-length, uniquely numbered "line", body padded with 'x'. No internal newline, so a line can
// never itself straddle a chunk boundary unless truncated mid-line, which is exactly what this checks for.
function makeLine(n, bodyLen) {
  const tag = "L" + String(n).padStart(8, "0") + ":";
  return tag + "x".repeat(Math.max(0, bodyLen - tag.length));
}

// Builds ASCII text of exactly `totalBytes` bytes: whole lines joined by "\n\n", last line padded (never
// cut) so the total lands exactly on the byte count the caller wants to test (an OUTPUT_CAP/SYNC_INDEX_MAX_BYTES
// boundary must be hit exactly, not approximately).
function buildInput(totalBytes) {
  const SEP = "\n\n";
  const BODY_LEN = 96;
  const lines = [];
  let used = 0;
  let n = 0;
  for (;;) {
    const sepLen = lines.length === 0 ? 0 : SEP.length;
    const candidate = makeLine(n, BODY_LEN);
    if (used + sepLen + candidate.length >= totalBytes) {
      const tag = "L" + String(n).padStart(8, "0") + ":";
      const remaining = totalBytes - used - sepLen;
      const fillerLen = Math.max(0, remaining - tag.length);
      const last = tag + "x".repeat(fillerLen);
      lines.push(last);
      used += sepLen + last.length;
      break;
    }
    lines.push(candidate);
    used += sepLen + candidate.length;
    n++;
  }
  const text = lines.join(SEP);
  if (Buffer.byteLength(text, "utf8") !== totalBytes) {
    throw new Error("buildInput internal error: built " + Buffer.byteLength(text, "utf8") + " bytes, wanted " + totalBytes);
  }
  return { text, lineSet: new Set(lines) };
}

// Strips the hook's own trailing handle line (D-CR3-HANDLE-1, REPLACE_HANDLE_LINE: the host's tool-name prefix,
// then "ctx_search({queries:[...], source:\"...\"}) searches the whole output (N B)."), which is not part of the
// chunked content and must not be checked against the input's lines. No pattern match: three fixed parts.
function isHandleLine(line) {
  const at = line.indexOf("ctx_search({queries:[");
  return at >= 0 && line.indexOf(", source:", at) > at && line.includes(") searches the whole output (") && line.endsWith(" B).");
}
function stripMoreLine(output) {
  const lines = output.split("\n");
  if (lines.length > 0 && isHandleLine(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}

// Every non-blank line of the (more-stripped) output must be byte-identical to one of the input's own
// lines. A corrupted, partial or merged line fails this; chunk order/subset is not checked (BM25 picks a
// subset under OUTPUT_CAP; only whole-line integrity is asserted, per T-F1 "returned text is whole chunks").
function wholeChunksOnly(output, lineSet) {
  for (const line of stripMoreLine(output).split("\n")) {
    if (line === "") continue;
    if (!lineSet.has(line)) return { ok: false, badLine: line };
  }
  return { ok: true };
}

function p95(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil(s.length * 0.95) - 1];
}

function writeAgent(reposDir, type, tools) {
  const dir = path.join(reposDir, ".claude", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, type + ".md"),
    "---\nname: " + type + "\ndescription: test fixture subagent.\ntools: " + tools + "\n---\nfixture\n"
  );
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "cm-case-b-index-"));
  const repo = path.join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const git = (args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "fixture@localhost"]);
  git(["config", "user.name", "fixture"]);
  writeFileSync(path.join(repo, "README.md"), "fixture\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  writeAgent(repo, "bash-case-b", "Bash"); // Case B: Bash, no ctx tool
  writeAgent(repo, "read-case-c", "Read"); // Case C: no Bash, no ctx tool
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  // claude-code's project source is CLAUDE_PROJECT_DIR (resolve.ts sourceOf), not argv cwd
  // (resolveProject's catch-all fail-open is silent on a missing source, D-M1-T3-2).
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };
  return { root, repo, env };
}

function cleanup(f) {
  rmSync(f.root, { recursive: true, force: true });
}

let runSeq = 0;
function postToolUse(f, agentType, text) {
  runSeq++;
  const payload = {
    session_id: "case-b-index-" + agentType + "-" + runSeq,
    cwd: f.repo,
    hook_event_name: "PostToolUse",
    agent_id: "subagent-" + runSeq,
    agent_type: agentType,
    tool_name: "Bash",
    tool_input: { command: "cat big-output.txt", description: "read the output of the long-running build" },
    tool_response: text,
  };
  const start = Date.now();
  const r = spawnSync(process.execPath, [HOOK_BUNDLE, "--agent", "claude-code"], {
    input: JSON.stringify(payload),
    cwd: f.repo,
    env: f.env,
    encoding: "utf8",
  });
  const ms = Date.now() - start;
  return { ms, status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Claude-shape encode (src/adapters/claude-code.ts encodeClaudeShape): "allow" -> stdout ""; "replace" ->
// stdout JSON {hookSpecificOutput:{hookEventName,updatedToolOutput:{stdout,stderr,interrupted}}} for a Bash call (D-M7-SV-1).
function parseDecision(stdout, size) {
  if (stdout === "") return { kind: "allow" };
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error("size " + size + ": hook stdout is not JSON and not empty: " + (err?.message ?? err));
  }
  // D-M7-SV-1: Claude Code checks updatedToolOutput against the tool's own output schema (Bash: an object
  // {stdout, stderr, interrupted}); a bare string is rejected and the original output is kept. The payload
  // here is a Bash call, so the replaced text is updatedToolOutput.stdout, and the shape must be exact.
  const u = parsed?.hookSpecificOutput?.updatedToolOutput;
  if (u === null || typeof u !== "object" || Array.isArray(u) || typeof u.stdout !== "string" || u.stderr !== "" || u.interrupted !== false) {
    throw new Error("size " + size + ": hook stdout has no Bash-shaped hookSpecificOutput.updatedToolOutput {stdout, stderr:\"\", interrupted:false}: " + stdout.slice(0, 200));
  }
  return { kind: "replace", output: u.stdout };
}

function runSize(f, agentType, size, runs) {
  const { text, lineSet } = buildInput(size);
  const times = [];
  for (let i = 0; i < runs; i++) {
    const r = postToolUse(f, agentType, text);
    if (r.status !== 0) throw new Error("size " + size + " run " + i + ": hook exit " + r.status + ": " + (r.stderr ?? "").slice(0, 300));
    times.push(r.ms);
    const decision = parseDecision(r.stdout, size);
    if (size <= REPLACE_TRIGGER_BYTES) {
      if (decision.kind !== "allow") throw new Error("size " + size + ": expected allow at/under REPLACE_TRIGGER_BYTES, got " + decision.kind);
      continue;
    }
    if (decision.kind !== "replace") throw new Error("size " + size + ": expected replace over REPLACE_TRIGGER_BYTES, got " + decision.kind);
    if (decision.output.length === 0) throw new Error("size " + size + ": replace output is empty");
    const check = wholeChunksOnly(decision.output, lineSet);
    if (!check.ok) throw new Error("size " + size + ": returned line is not a byte-exact input line: " + JSON.stringify(check.badLine.slice(0, 80)));
    if (Buffer.byteLength(decision.output, "utf8") > OUTPUT_CAP + 200) {
      throw new Error("size " + size + ": replace output " + Buffer.byteLength(decision.output, "utf8") + " bytes exceeds OUTPUT_CAP budget");
    }
  }
  return { p95: p95(times), max: Math.max(...times), n: times.length };
}

async function main() {
  try {
    ensureBuilt();
  } catch (err) {
    return fail("build failed: " + (err?.message ?? err));
  }

  const f = fixture();
  const sizeResults = [];
  try {
    for (const size of SIZES) {
      const caseB = runSize(f, "bash-case-b", size, RUNS_PER_SIZE);
      if (caseB.p95 > HOOK_COMBINED_P95_MS) {
        return fail("Case B size " + size + " PostToolUse wall p95 " + caseB.p95 + "ms exceeds HOOK_COMBINED_P95_MS " + HOOK_COMBINED_P95_MS + "ms");
      }
      const caseC = runSize(f, "read-case-c", size, CASE_C_RUNS_PER_SIZE);
      sizeResults.push({ size, caseBP95Ms: caseB.p95, caseBMaxMs: caseB.max, caseBRuns: caseB.n, caseCP95Ms: caseC.p95, caseCRuns: caseC.n });
    }
  } catch (err) {
    return fail(err?.message ?? String(err));
  } finally {
    cleanup(f);
  }

  console.log(JSON.stringify({ ok: true, sizes: sizeResults }));
}

await main();
