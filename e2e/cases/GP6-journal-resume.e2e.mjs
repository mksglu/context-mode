// GP6 — journal, compaction state, resume (ADR-0009 §§0-8, impl/00 §5.4, impl/09 §4.3-4.4).
// Case source: TECH-SPEC §6.2 GP6 row + ADR-0009 "Golden cases" + §8.4. covers:
// src/core/compaction/{candidates,score,render}.ts, src/core/tools/resume.ts, src/core/hooks/dispatch.ts.
//
// Black box only (ADR-0003, impl/14, GS4): every case drives the built release bundle —
// release-out/server.mjs over MCP stdio and release-out/hook.mjs with host-shaped payloads — and reads
// the result from tool output or the project DB file. Journal fixtures are rows written into that DB
// file (the store's events table), the same way a host session would leave them. No src/ import: every
// expected value below is a literal from the doc line cited next to it (D-M0-4, D-M4-GS4-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { runHook } from "../harness/hook-runner.mjs";
import { dumpDb } from "../harness/db-dump.mjs";
import { normalize } from "../harness/normalize.mjs";
import { checkGolden } from "../harness/golden.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RELEASE_OUT = path.join(REPO_ROOT, "release-out");
const SERVER_BUNDLE = path.join(RELEASE_OUT, "server.mjs");
const HOOK_BUNDLE = path.join(RELEASE_OUT, "hook.mjs");

const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } };
const STATE_BUDGET = 2048; // ADR-0009 §4 "Budget B = 2,048 UTF-8 bytes"
const RESUME_CAP = 2048; // ADR-0009 Golden cases: ctx_resume() returns the same <= 2,048 B block
const POINTER_MIN = 640; // ADR-0009 §4 "An item over 640 B is never cut. It becomes a pointer line"
const POINTER_LINE = // DECISIONS-r6 D6 item 1 (pointer line of compactSummary "host"; no row is "host" after D-M7-CL-1)
  'context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").';
const CLOSE_TAG = "</context_mode_state>"; // ADR-0009 §5 block
const EMPTY_MORE = 'more: ctx_search(queries:[], scope:"session")'; // ADR-0009 §5 block, DECISIONS-r9 M11
const openTag = (sid, upto) => `<context_mode_state session="${sid}" upto="${upto}">`; // ADR-0009 §5
// DECISIONS-r9 M10: the pointer string is exactly `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`.
const POINTER_RE = /^#(\d+) \((\d+) B\) ctx_resume\(seq:(\d+)\)$/;
// DECISIONS-r9 M4 line formats; M10 pointer; ADR-0009 §5 tags and the more: line. Nothing else is rendered.
// DECISIONS-r11 (A): "decided #" is the decisions section line.
const LINE_PREFIXES = ["<context_mode_state ", "now: ", "error #", "edited ", "decided #", "asked #", "indexed ", "more: ", CLOSE_TAG];

const B = (s) => Buffer.byteLength(s, "utf8");

// One isolated HOME (the store root, resolveConfigDir) and one git repo (the project) per case, as GP10 does.
function fixture(t) {
  const repo = mkdtempSync(path.join(tmpdir(), "cm-gp6-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp6-home-"));
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };
  const clients = [];
  t.after(() => {
    for (const c of clients) c.kill();
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const server = async () => {
    const c = spawnBundle(SERVER_BUNDLE, env);
    clients.push(c);
    await c.request("initialize", INIT);
    return c;
  };
  // A host hook call: one hook.mjs process per event, payload shaped like the recorded fixtures
  // (e2e/fixtures/claude-code/2.1.283/*.json). Returns additionalContext, or null for allow.
  const hook = async (agent, sessionId, fields) => {
    const payload = { session_id: sessionId, cwd: repo, ...fields };
    const r = await runHook(HOOK_BUNDLE, { agent, event: fields.hook_event_name, payload, env });
    assert.equal(r.exitCode, 0, r.stderr);
    return r.stdout === "" ? null : JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  };
  const projectsDir = path.join(home, ".context-mode", "projects");
  const dbPath = () => path.join(projectsDir, readdirSync(projectsDir)[0], "context.db");
  return { repo, home, server, hook, dbPath };
}

const call = (c, name, args, meta) => c.request("tools/call", { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
const textOf = (r) => r.content[0].text;
const linesOf = (block) => block.split("\n");

// Creates the project DB through a real tool call, then writes journal rows into its events table.
async function seedRows(f, c, rows) {
  await call(c, "ctx_index", { content: "seed", source: "gp6-seed" }, { sessionId: "gp6-seed" });
  const db = new DatabaseSync(f.dbPath());
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const worktree = db.prepare("SELECT worktree FROM events LIMIT 1").get().worktree;
    const ins = db.prepare(
      "INSERT INTO events(seq, session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn," +
        " sandbox_bytes, returned_bytes, created_at, accessed_at) VALUES (?, ?, ?, 'claude-code', ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, 0, 1, 1)",
    );
    db.exec("BEGIN");
    for (const r of rows) {
      const body = r.body ?? r.key ?? r.path ?? "";
      ins.run(r.seq, r.session, worktree, r.kind, r.tool ?? null, r.key ?? null, r.path ?? null, r.ok ?? 1, B(body), body, r.turn ?? 1);
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}

const eventsOf = (f, sid) => dumpDb(f.dbPath(), ["events"]).events.filter((e) => e.session_id === sid).sort((a, b) => a.seq - b.seq);

function assertStateBlock(text, sid) {
  assert.ok(text.startsWith(`<context_mode_state session="${sid}" upto="`), text);
  assert.ok(text.endsWith("\n" + CLOSE_TAG), text);
  assert.ok(B(text) <= STATE_BUDGET, `block is ${B(text)} B`);
}

// ADR-0009 "Golden cases": <= 2,048 B for a journal of 10,000 rows (#1022); no foreign session rows (#1274);
// an error fixed later is not listed; the same rows give identical bytes; the one measured open-error miss
// is a budget skip (DECISIONS-r6 D1): it is reported on the more: line, never a silent drop.
test("[M4] GP6/D1-open-error-budget-skip golden", async (t) => {
  const f = fixture(t);
  const c = await f.server();
  const sid = "gp6-d1";
  const rows = [];
  const special = new Set([10_995, 10_998, 10_999, 11_000]); // written below instead of a generated row
  for (let i = 0; i < 10_000; i++) {
    const seq = 1001 + i;
    if (special.has(seq)) continue;
    const turn = Math.floor(i / 10);
    switch (i % 5) {
      case 0:
        rows.push({ seq, session: sid, kind: "prompt", body: "step " + i + ": run the suite\nsecond line", turn });
        break;
      case 1: // failing runs; 400 keys, each fails 5 times
        rows.push({ seq, session: sid, kind: "cmd", tool: "ctx_execute", key: "ctx_execute:run test-" + (i % 400), ok: 0, turn });
        break;
      case 2: // a later success closes keys whose index is a multiple of 3 (impl/06 §1 step 3)
        if ((i % 400) % 3 === 0) rows.push({ seq, session: sid, kind: "cmd", tool: "ctx_execute", key: "ctx_execute:run test-" + ((i - 1) % 400), ok: 1, turn });
        else rows.push({ seq, session: sid, kind: "edit", tool: "Edit", path: "src/mod-" + (i % 300) + ".ts", turn });
        break;
      case 3:
        rows.push({ seq, session: sid, kind: "edit", tool: "Edit", path: "src/mod-" + (i % 300) + ".ts", turn });
        break;
      default:
        rows.push({ seq, session: sid, kind: "index", key: "doc-" + i, path: "doc-" + i, turn });
    }
  }
  // fixed later: fails at 10,995 and succeeds at 10,998, so it is no candidate.
  rows.push({ seq: 10_995, session: sid, kind: "toolerr", tool: "Bash", key: "Bash:fixed-later", ok: 0, turn: 999 });
  rows.push({ seq: 10_998, session: sid, kind: "toolerr", tool: "Bash", key: "Bash:fixed-later", ok: 1, turn: 999 });
  // one open error that failed once: the 5x-repeated keys outrank it (repeat bonus, ADR-0009 §3).
  rows.push({ seq: 10_999, session: sid, kind: "toolerr", tool: "Bash", key: "Bash:newest-open", ok: 0, turn: 999 });
  rows.push({ seq: 11_000, session: sid, kind: "prompt", body: "ship the release", turn: 999 });
  rows.push({ seq: 20_000, session: "gp6-foreign", kind: "toolerr", tool: "Bash", key: "Bash:foreign-row", ok: 0, turn: 999 });
  await seedRows(f, c, rows);
  assert.equal(eventsOf(f, sid).length, 10_000);

  const first = await call(c, "ctx_resume", { session: sid });
  const second = await call(c, "ctx_resume", { session: sid });
  assert.equal(first.isError, false);
  const text = textOf(first);
  assert.equal(textOf(second), text, "same rows give identical bytes");
  assertStateBlock(text, sid);
  assert.ok(text.startsWith(openTag(sid, 11_000) + "\nnow: ship the release\n"), text); // newest own seq, pinned request
  assert.ok(!text.includes("foreign-row") && !text.includes("20000"), "no foreign session rows");
  assert.ok(!text.includes("fixed-later"), "an error fixed later is not listed");
  const lines = linesOf(text);
  const errorLines = lines.filter((l) => l.startsWith("error #"));
  const more = lines.at(-2);
  assert.ok(more.startsWith("more: ctx_search(queries:["), more);
  // Budget skip (ADR-0009 §4 "An item that does not fit is skipped"; Golden cases D1): the open errors
  // are the latest failing row per key with no later success (impl/06 §1 step 3, DECISIONS-r9 M2). Each one
  // is rendered, or its line did not fit: used bytes only grow, so a skipped line is still larger than the
  // bytes left after the item lines (the more: line takes its queries from that same room, M12).
  const lastFail = new Map();
  const lastOk = new Map();
  for (const r of rows) {
    if (r.session !== sid || (r.kind !== "cmd" && r.kind !== "toolerr")) continue;
    if (r.ok === 0) lastFail.set(r.key, r);
    else lastOk.set(r.key, r.seq);
  }
  const open = [...lastFail.values()].filter((r) => (lastOk.get(r.key) ?? 0) < r.seq);
  const room = STATE_BUDGET - B(text) + (B(more) - B(EMPTY_MORE));
  let skipped = 0;
  for (const r of open) {
    const line = "error #" + r.seq + " " + r.tool + ": " + r.key; // DECISIONS-r9 M4
    if (lines.includes(line)) continue;
    skipped++;
    assert.ok(B(line) + 1 > room, line + " was dropped with " + room + " B free: a scoring bug, not a budget skip");
  }
  assert.ok(skipped > 0 && errorLines.length > 0, "the fixture must render some open errors and skip others");
  assert.equal(errorLines.length + skipped, open.length);
  checkGolden("GP6", "D1-open-error-budget-skip", normalize(first, { home: f.home, proj: f.repo }));
});

// Claude Code compactSummary:"none" (DECISIONS-r9 V9: T-CMP arm (a) failed live, D-M7-CL-1; impl/10 §1.3 note):
// SessionStart(compact) injects the full <= STATE_BUDGET block once, never the pointer line; a second
// SessionStart(compact) in the same session is throttled (impl/09 A23). ctx_resume() returns the same block.
test("[M4] GP6/compact-summary-claude-code-none", async (t) => {
  const f = fixture(t);
  const sid = "gp6-cc-none";
  assert.equal(await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "rename the config loader" }), null);
  const text = await f.hook("claude-code", sid, { hook_event_name: "SessionStart", source: "compact" });
  assert.ok(text !== null, "SessionStart(compact) delivers the block");
  assertStateBlock(text, sid);
  assert.notEqual(text, POINTER_LINE);
  assert.ok(!text.includes(POINTER_LINE), text);
  assert.ok(linesOf(text).includes("now: rename the config loader"), text);
  assert.equal(await f.hook("claude-code", sid, { hook_event_name: "SessionStart", source: "compact" }), null, "delivered once");

  const c = await f.server();
  const resumed = textOf(await call(c, "ctx_resume", {}, { sessionId: sid }));
  assertStateBlock(resumed, sid);
  assert.ok(B(resumed) <= RESUME_CAP);
  assert.ok(linesOf(resumed).includes("now: rename the config loader"), resumed);
});

// compactSummary:"none" (gemini, pending-flag delivery, ADR-0009 §6): PreCompress sets the meta
// "pending_compact:<sid>" flag; the next BeforeAgent delivers the full block once, never the pointer line.
test("[M4] GP6/compact-summary-none", async (t) => {
  const f = fixture(t);
  const sid = "gp6-none";
  assert.equal(await f.hook("gemini", sid, { hook_event_name: "BeforeAgent", prompt: "rename the config loader" }), null);
  assert.equal(await f.hook("gemini", sid, { hook_event_name: "PreCompress" }), null);
  const text = await f.hook("gemini", sid, { hook_event_name: "BeforeAgent", prompt: "go on" });
  assert.ok(text !== null, "the pending flag delivers the block");
  assertStateBlock(text, sid);
  assert.notEqual(text, POINTER_LINE);
  assert.ok(text.includes("rename the config loader"), text);
  assert.equal(await f.hook("gemini", sid, { hook_event_name: "BeforeAgent", prompt: "and again" }), null, "delivered once");
});

// ADR-0009 §4 + Golden cases: an item over 640 B becomes a pointer, and ctx_resume(seq) returns it whole.
test("[M4] GP6/resume-seq-pointer", async (t) => {
  const f = fixture(t);
  const sid = "gp6-pointer";
  const big = "p".repeat(POINTER_MIN + 60);
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: big });
  const c = await f.server();
  const state = textOf(await call(c, "ctx_resume", {}, { sessionId: sid }));
  assertStateBlock(state, sid);
  assert.ok(!state.includes(big), "an item over POINTER_MIN is never inlined");
  const pointer = linesOf(state).map((l) => POINTER_RE.exec(l)).find(Boolean);
  assert.ok(pointer, "expected a pointer line for an item over POINTER_MIN bytes: " + state);
  assert.equal(pointer[1], pointer[3]);
  assert.equal(Number(pointer[2]), B("now: " + big)); // the line's own bytes (DECISIONS-r9 M4, M10)
  const prompt = eventsOf(f, sid).find((e) => e.kind === "prompt");
  assert.equal(Number(pointer[1]), prompt.seq);
  const whole = await call(c, "ctx_resume", { seq: Number(pointer[3]) }, { sessionId: sid });
  assert.equal(whole.isError, false);
  assert.equal(textOf(whole), big, "ctx_resume(seq) returns the row whole");
});

// Golden cases: not the user role (#1263), bare tool names (#1028), no "directive" text (#911, #1259).
test("[M4] GP6/code-echo-default", async (t) => {
  const f = fixture(t);
  const sid = "gp6-echo";
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "fix the login test" });
  const post = (tool_name, tool_input, tool_response) => f.hook("claude-code", sid, { hook_event_name: "PostToolUse", tool_name, tool_input, tool_response });
  await post("Bash", { command: "npm test -- login" }, { is_error: true, stdout: "", stderr: "1 failing" });
  await post("Edit", { file_path: "src/login.ts", old_string: "a", new_string: "b" }, { filePath: "src/login.ts" });
  await post("Write", { file_path: "src/session.ts", content: "x" }, { filePath: "src/session.ts" });
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "now run it again" });
  const c = await f.server();
  const state = textOf(await call(c, "ctx_resume", {}, { sessionId: sid }));
  assertStateBlock(state, sid);
  assert.ok(!/^\s*(Write|Edit|Bash)\s*$/m.test(state), state);
  for (const l of linesOf(state)) {
    assert.ok(LINE_PREFIXES.some((p) => l.startsWith(p)) || POINTER_RE.test(l), "undocumented line: " + l);
  }
  assert.ok(linesOf(state).includes("edited src/login.ts x1") && linesOf(state).includes("edited src/session.ts x1"), state);
});

// One-slot scenario: the pinned line plus exactly one of the two candidate lines fit; both together miss by
// 1 byte. The session id pads the open tag to that size (budget = STATE_BUDGET minus the open tag, the close
// tag, the empty more: line and their newlines; DECISIONS-r9 M12).
function oneSlotSid(prefix, upto, pinnedLine, lineA, lineB) {
  const fixed = 1 + B(EMPTY_MORE) + 1 + B(CLOSE_TAG);
  const tagBytes = STATE_BUDGET - fixed - (B(pinnedLine) + 1) - (B(lineA) + 1 + B(lineB) + 1 - 1);
  const pad = tagBytes - B(openTag(prefix, upto));
  assert.ok(pad >= 0, "scenario does not fit");
  return prefix + "s".repeat(pad);
}

const keyOfBytes = (prefix, bytes, lead) => lead + "k".repeat(bytes - B(prefix) - B(lead));

// WEIGHT polarity (ADR-0009 §3: open error 900 · prompt 500 · edit 400 · index 200; impl/06 §3 ratio =
// score / bytes, ties to the higher seq, DECISIONS-r9 M25). Read through what render selects:
//  (a) equal bytes, the index row newer: the open error still takes the one slot (900 > 200);
//  (b)/(c) error 450 B vs earlier request 250 B is an exact ratio tie only if toolerr:prompt = 900:500,
//      so the newer one must win both ways round (a weight of 899 or 901 flips one of them).
test("[M4] GP6/priority-polarity", async (t) => {
  const f = fixture(t);
  const c = await f.server();
  const pinned = "now: go";
  const scenarios = [];
  const errLine = (seq, len) => {
    const head = "error #" + seq + " ctx_execute: ";
    const key = keyOfBytes(head, len, "ctx_execute:e" + seq + "-");
    return { line: head + key, key };
  };
  { // (a) open error (seq 10) vs indexed source (seq 11), 300 B each
    const e = errLine(10, 300);
    const idxKey = keyOfBytes("indexed ", 300, "doc-11-");
    const sid = oneSlotSid("gp6-pa-", 12, pinned, e.line, "indexed " + idxKey);
    scenarios.push({ sid, win: e.line, lose: "indexed " + idxKey, rows: [
      { seq: 10, session: sid, kind: "cmd", tool: "ctx_execute", key: e.key, ok: 0 },
      { seq: 11, session: sid, kind: "index", key: idxKey, path: idxKey },
      { seq: 12, session: sid, kind: "prompt", body: "go" },
    ] });
  }
  { // (b) open error (seq 20, 450 B) vs earlier request (seq 21, 250 B): tie, the newer request wins
    const e = errLine(20, 450);
    const asked = "asked #21: " + "q".repeat(250 - B("asked #21: "));
    const sid = oneSlotSid("gp6-pb-", 22, pinned, e.line, asked);
    scenarios.push({ sid, win: asked, lose: e.line, rows: [
      { seq: 20, session: sid, kind: "cmd", tool: "ctx_execute", key: e.key, ok: 0 },
      { seq: 21, session: sid, kind: "prompt", body: asked.slice(B("asked #21: ")) },
      { seq: 22, session: sid, kind: "prompt", body: "go" },
    ] });
  }
  { // (c) earlier request (seq 30, 250 B) vs open error (seq 31, 450 B): tie, the newer error wins
    const e = errLine(31, 450);
    const asked = "asked #30: " + "q".repeat(250 - B("asked #30: "));
    const sid = oneSlotSid("gp6-pc-", 32, pinned, e.line, asked);
    scenarios.push({ sid, win: e.line, lose: asked, rows: [
      { seq: 30, session: sid, kind: "prompt", body: asked.slice(B("asked #30: ")) },
      { seq: 31, session: sid, kind: "cmd", tool: "ctx_execute", key: e.key, ok: 0 },
      { seq: 32, session: sid, kind: "prompt", body: "go" },
    ] });
  }
  await seedRows(f, c, scenarios.flatMap((s) => s.rows));
  for (const s of scenarios) {
    const text = textOf(await call(c, "ctx_resume", { session: s.sid }));
    assertStateBlock(text, s.sid);
    assert.equal(B(text) <= STATE_BUDGET, true);
    const lines = linesOf(text);
    assert.ok(lines.includes(pinned), text);
    assert.ok(lines.includes(s.win), s.sid.slice(0, 7) + ": expected the winning line");
    assert.ok(!lines.includes(s.lose), s.sid.slice(0, 7) + ": the losing line must be skipped");
  }
});

// A multi-byte code point at a line or budget edge is never split (no lone surrogate, no U+FFFD).
test("[M4] GP6/sessionstart-surrogate-safe-truncation", async (t) => {
  const f = fixture(t);
  const sid = "gp6-surrogate";
  const emoji = "\u{1F600}".repeat(400); // 4 bytes/char UTF-8
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "\u{1F600}".repeat(170) }); // 680 B: pointer
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "\u{1F600}".repeat(158) }); // 632 B: inline
  const c = await f.server();
  await call(c, "ctx_index", { content: emoji, source: "gp6-surrogate" }, { sessionId: sid });
  const state = textOf(await call(c, "ctx_resume", {}, { sessionId: sid }));
  assertStateBlock(state, sid);
  assert.ok(state.isWellFormed(), "no lone surrogate");
  assert.equal(Buffer.from(state, "utf8").toString("utf8"), state);
  assert.ok(!/�/.test(state), "no replacement char from a split surrogate pair");
  assert.ok(linesOf(state).includes("now: " + "\u{1F600}".repeat(158)), "a line under POINTER_MIN is whole");
});

// impl/09 §4.4: mid-session (no compact signal at all), no compaction hint is injected.
test("[M4] GP6/no-resume-hint-mid-session", async (t) => {
  const f = fixture(t);
  assert.equal(await f.hook("claude-code", "gp6-mid", { hook_event_name: "UserPromptSubmit", prompt: "hi" }), null);
  assert.equal(await f.hook("gemini", "gp6-mid-g", { hook_event_name: "BeforeAgent", prompt: "hi" }), null);
});

// D-FU-GCH-2: Gemini has no SessionStart hook (D-FU-GCH-1), so the resume hint rides the first BeforeAgent of a
// session, once, keyed by the payload session id, and only when this worktree already holds a Gemini journal row.
test("[M4] GP6/gemini-resume-hint-first-turn-only", async (t) => {
  const f = fixture(t);
  const HINT = "This session may have run before. Call mcp_context-mode_ctx_resume for a summary of what happened.";
  const turn = (sid, prompt) => f.hook("gemini", sid, { hook_event_name: "BeforeAgent", prompt });
  assert.equal(await turn("gp6-g-seed", "first ever prompt"), null, "nothing to resume: no hint");
  assert.equal(await turn("gp6-g-seed", "second prompt"), null, "mid-session: no hint");
  assert.equal(await turn("gp6-g-one", "pick up the work"), HINT, "new session, rows to resume: first turn gets the hint");
  assert.equal(await turn("gp6-g-one", "go on"), null, "second turn of the same session: no hint");
  assert.equal(await turn("gp6-g-one", "and on"), null, "third turn of the same session: no hint");
  assert.equal(await turn("gp6-g-two", "again"), HINT, "another new session: first turn gets the hint");
  assert.equal(await turn("gp6-g-two", "more"), null, "its second turn: no hint");
});

// ADR-0009 §8.2 decision tag, rule 1: an answered AskUserQuestion writes "Q: <question> → A: <label>".
test("[M4] GP6/decision-askuserquestion-answer", async (t) => {
  const f = fixture(t);
  const sid = "gp6-ask";
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "deploy?" });
  await f.hook("claude-code", sid, {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Deploy now?", options: [{ label: "Yes" }, { label: "No" }] }] },
    tool_response: { answers: [{ question: "Deploy now?", label: "Yes" }] },
  });
  const decisions = eventsOf(f, sid).filter((e) => e.kind === "decision");
  assert.deepEqual(decisions.map((e) => [e.key, e.body]), [["Deploy now?", "Q: Deploy now? → A: Yes"]]);
  const c = await f.server();
  const hits = textOf(await call(c, "ctx_search", { queries: [], source: "decision" }, { sessionId: sid }));
  assert.ok(hits.includes("Q: Deploy now? → A: Yes"), hits);
});

// ADR-0009 §8.2 rule 2: the next prompt equals one offered option label -> "A: <label>\nref: #<seq>", where
// <seq> is the journal seq of the turn that offered the options.
test("[M4] GP6/decision-option-echo-ref-seq", async (t) => {
  const f = fixture(t);
  const sid = "gp6-echo-ref";
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "what next?" });
  await f.hook("claude-code", sid, {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Next step?", options: [{ label: "Ship it" }, { label: "Wait" }] }] },
    tool_response: "The user has not answered yet.",
  });
  const offeredAt = eventsOf(f, sid).find((e) => e.kind === "prompt").seq;
  assert.equal(eventsOf(f, sid).filter((e) => e.kind === "decision").length, 0, "an unanswered call writes no row");
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "  ship IT " });
  const decisions = eventsOf(f, sid).filter((e) => e.kind === "decision");
  assert.deepEqual(decisions.map((e) => [e.key, e.body]), [["option", "A: Ship it\nref: #" + offeredAt]]);
});

// ADR-0009 §8.2: prose that sounds like a decision writes no row (fail-safe, #856).
test("[M4] GP6/decision-prose-no-row", async (t) => {
  const f = fixture(t);
  const sid = "gp6-prose";
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "let's go with the blue button, decision made" });
  assert.equal(eventsOf(f, sid).filter((e) => e.kind === "decision").length, 0);
  const c = await f.server();
  const hits = textOf(await call(c, "ctx_search", { queries: [], source: "decision" }, { sessionId: sid }));
  assert.ok(!hits.includes("blue button"), hits);
});

// ADR-0009 §3 (DECISIONS-r9 F2/F8) as amended by DECISIONS-r11 (A), D-FU-CMP-PUSH-1: a decision row is the
// decisions section of the state block (it was never a candidate before).
test("[M7] GP6/decision-in-decisions-section", async (t) => {
  const f = fixture(t);
  const sid = "gp6-never";
  await f.hook("claude-code", sid, { hook_event_name: "UserPromptSubmit", prompt: "deploy?" });
  await f.hook("claude-code", sid, {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Deploy now?", options: [{ label: "Yes" }] }] },
    tool_response: { answers: [{ question: "Deploy now?", label: "Yes" }] },
  });
  const decision = eventsOf(f, sid).find((e) => e.kind === "decision");
  assert.ok(decision, "the decision row exists");
  const c = await f.server();
  const state = textOf(await call(c, "ctx_resume", { session: sid }));
  assert.ok(state.startsWith(openTag(sid, decision.seq) + "\n"), state); // the row is read (newest seq) ...
  // ... and rendered as the decisions line (DECISIONS-r11 A supersedes DECISIONS-r6 D3, D-FU-CMP-PUSH-1)
  assert.ok(linesOf(state).includes("decided #" + decision.seq + ": Q: Deploy now? → A: Yes"), state);
  assert.ok(linesOf(state).includes("now: deploy?"), state);
});
