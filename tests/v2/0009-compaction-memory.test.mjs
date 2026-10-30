// ADR-0009 (compaction and memory), PRD-v2 section 11, GP6. One file per ADR area (ADR-0024); one describe per ADR section.
// Moved from tests/v2/compaction/*, store/journal*, plugins/inprocess-journal, tools/resume, tools/search-decision. Names and assertions unchanged.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "../../src/core/store/db.ts";
import { appendEvent, canonicalKey } from "../../src/core/journal/append.ts";
import { readEventBySeq, readSessionEvents } from "../../src/core/journal/read.ts";
import { buildCandidates } from "../../src/core/compaction/candidates.ts";
import { DECAY_X1000, MAX_CANDIDATES, OUTPUT_CAP, POINTER_MIN, RECALL_BUDGET_BYTES, RECALL_CLOSE_TAG, RECALL_MIN_SCORE, RECALL_OPEN_TAG, RESUME_CAP, RESUME_EMPTY_LINE, RESUME_NO_ROW_LINE, RESUME_NO_SESSION_LINE, RESUME_UNKNOWN_FIELD_LINE, STATE_BUDGET, WEIGHT } from "../../src/core/contracts/constants.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { scoreCandidate } from "../../src/core/compaction/score.ts";
import { renderState } from "../../src/core/compaction/render.ts";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import * as opencodePlugin from "../../src/entries/opencode.ts";
import piExtension from "../../src/entries/pi.ts";
import { ctxResume } from "../../src/core/tools/resume.ts";
import { pickRecall, recallLine } from "../../src/core/compaction/recall.ts";
import { ctxSearch } from "../../src/core/tools/search.ts";
import { ctxIndex } from "../../src/core/tools/index.ts";
import { ftsInsert } from "../../src/core/store/fts.ts";
import { indexText } from "../../src/core/index/text.ts";

describe("ADR-0009 section 1: journal, ported v1 session-journal cases", { concurrency: true }, () => {
  // [W1-session-journal] Ported from tests/session/{extract-git-commit,parse-git-invocation}.test.ts.
  // v1 had `git` / `git_commit` / `cwd` event types. v2 keeps one closed set of journal kinds
  // (ADR-0009 §1, schema CHECK on events.kind): git runs are plain `cmd` rows with key = tool + canonical
  // command, so the commit message and `-C <dir>` text stay in the key. Claude Code restores git status
  // itself after compaction (ADR-0009 §0 context), so no git-specific kind exists. See DEVIATIONS D-M7-CLN-2.


  async function freshDb() {
    const root = mkdtempSync(join(tmpdir(), "cm-journal-ported-"));
    const key = "g".repeat(16);
    const project = {
      projectKey: key, projectDir: join(root, "projects", key), dbPath: join(root, "projects", key, "context.db"),
      worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR",
    };
    return { db: await openDb(project), root };
  }

  function cmdRow(command, overrides) {
    return {
      session_id: "s1", worktree: "/w", agent: "claude-code", kind: "cmd", tool: "Bash",
      key: canonicalKey("Bash", command), path: null, ok: 1, exit_code: null, bytes: 0, body: "", turn: 1,
      sandbox_bytes: 0, returned_bytes: 0, ...overrides,
    };
  }

  test("[W1-session-journal] git commit message survives in the cmd key (extract-git-commit)", () => {
    assert.equal(canonicalKey("Bash", `git commit -m "feat: x"`), `Bash:git commit -m "feat: x"`);
    assert.equal(canonicalKey("Bash", `git commit -m 'single quoted'`), `Bash:git commit -m 'single quoted'`);
    assert.equal(canonicalKey("Bash", `git commit -am "stage+commit"`), `Bash:git commit -am "stage+commit"`);
    assert.equal(canonicalKey("Bash", `git commit --message=longform`), `Bash:git commit --message=longform`);
    assert.equal(canonicalKey("Bash", `git commit -m "fix: navbar — handle long URLs"`), `Bash:git commit -m "fix: navbar — handle long URLs"`);
    assert.equal(canonicalKey("Bash", `GIT_AUTHOR_DATE=now git commit -m "with env"`), `Bash:GIT_AUTHOR_DATE=now git commit -m "with env"`);
  });

  test("[W1-session-journal] whitespace in a commit message is kept, outside quotes is folded", () => {
    assert.equal(canonicalKey("Bash", `git   commit  -m "a   b"`), `Bash:git commit -m "a   b"`);
  });

  test("[W1-session-journal] -C / --directory forms stay verbatim in the key (parse-git-invocation)", () => {
    for (const c of ["git -C ~/repos/myrepo status", "git --directory=/abs/x log", "git --directory /abs/x log",
      "git -C ~ status", "git -C ~someoneelse/foo status", "git -C relative/path status", "git --directory=~/abs status"]) {
      assert.equal(canonicalKey("Bash", c), "Bash:" + c);
    }
  });

  test("[W1-session-journal] a git commit is stored as a cmd row, not a git_commit row", async () => {
    const { db, root } = await freshDb();
    try {
      appendEvent(db, cmdRow(`git -C ~/repos commit -m "feat: x"`));
      appendEvent(db, cmdRow(`git push origin main`));
      const rows = readSessionEvents(db, "s1");
      assert.deepEqual(rows.map((r) => r.kind), ["cmd", "cmd"]);
      assert.equal(rows[0].key, `Bash:git -C ~/repos commit -m "feat: x"`);
      assert.deepEqual(readSessionEvents(db, "s1", "cmd").length, 2);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[W1-session-journal] the closed kind set rejects v1 git / git_commit / cwd / rule kinds", async () => {
    const { db, root } = await freshDb();
    try {
      for (const kind of ["git", "git_commit", "cwd", "rule", "intent", "role"]) {
        assert.throws(() => appendEvent(db, cmdRow("git status", { kind })), undefined, kind);
      }
      assert.equal(readSessionEvents(db, "s1").length, 0);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("ADR-0009 section 1: journal write and read", { concurrency: true }, () => {
  // Unit tests for src/core/journal/append.ts and read.ts (impl/02 §10-11, DEVIATIONS D-M1-1).
  // appendEvent(db, row: NewJournalRow): number (seq). readSessionEvents(db, sessionId, kind?): JournalRow[].
  // readEventBySeq(db, seq): JournalRow | null. Empty/unknown session_id -> [] (never "latest session" fallback, F4).


  function fakeProject(root, projectKey) {
    return {
      projectKey,
      projectDir: join(root, "projects", projectKey),
      dbPath: join(root, "projects", projectKey, "context.db"),
      worktree: root,
      containmentRoot: root,
      agent: "claude-code",
      source: "env:CLAUDE_PROJECT_DIR",
    };
  }

  async function freshDb(key) {
    const root = mkdtempSync(join(tmpdir(), "cm-journal-"));
    const project = fakeProject(root, key);
    const db = await openDb(project);
    return { db, root };
  }

  function baseRow(overrides) {
    return {
      session_id: "s1",
      worktree: "/w",
      agent: "claude-code",
      kind: "cmd",
      tool: null,
      key: null,
      path: null,
      ok: 1,
      exit_code: 0,
      bytes: 10,
      body: "hello",
      turn: 1,
      sandbox_bytes: 10,
      returned_bytes: 10,
      ...overrides,
    };
  }

  test("appendEvent inserts a row and returns its seq", async () => {
    const { db, root } = await freshDb("a".repeat(16));
    try {
      const seq1 = appendEvent(db, baseRow({}));
      const seq2 = appendEvent(db, baseRow({}));
      assert.equal(typeof seq1, "number");
      assert.ok(seq2 > seq1);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appendEvent computes ts/created_at inside the write, not from caller input", async () => {
    const { db, root } = await freshDb("b".repeat(16));
    try {
      const before = Date.now();
      const seq = appendEvent(db, baseRow({}));
      const after = Date.now();
      const row = readEventBySeq(db, seq);
      assert.ok(row.created_at >= before && row.created_at <= after);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("readSessionEvents returns rows for the session in seq order", async () => {
    const { db, root } = await freshDb("c".repeat(16));
    try {
      appendEvent(db, baseRow({ session_id: "s1", body: "first" }));
      appendEvent(db, baseRow({ session_id: "s2", body: "other-session" }));
      appendEvent(db, baseRow({ session_id: "s1", body: "second" }));
      const rows = readSessionEvents(db, "s1");
      assert.equal(rows.length, 2);
      assert.equal(rows[0].body, "first");
      assert.equal(rows[1].body, "second");
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("readSessionEvents filters by kind when the optional third arg is passed (D-M1-1)", async () => {
    const { db, root } = await freshDb("d".repeat(16));
    try {
      appendEvent(db, baseRow({ session_id: "s1", kind: "cmd" }));
      appendEvent(db, baseRow({ session_id: "s1", kind: "toolerr" }));
      const rows = readSessionEvents(db, "s1", "toolerr");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, "toolerr");
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("readSessionEvents returns [] for an empty session_id", async () => {
    const { db, root } = await freshDb("e".repeat(16));
    try {
      appendEvent(db, baseRow({ session_id: "s1" }));
      assert.deepEqual(readSessionEvents(db, ""), []);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("readSessionEvents returns [] for an unknown session_id, never falling back to the latest session (F4, PR #398)", async () => {
    const { db, root } = await freshDb("f".repeat(16));
    try {
      appendEvent(db, baseRow({ session_id: "s1" }));
      assert.deepEqual(readSessionEvents(db, "unknown-session"), []);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("readEventBySeq returns the whole row for an existing seq (primary-key read)", async () => {
    const { db, root } = await freshDb("1".repeat(16));
    try {
      const seq = appendEvent(db, baseRow({ body: "payload" }));
      const row = readEventBySeq(db, seq);
      assert.equal(row.seq, seq);
      assert.equal(row.body, "payload");
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("readEventBySeq returns null for a missing seq, never throws", async () => {
    const { db, root } = await freshDb("2".repeat(16));
    try {
      assert.equal(readEventBySeq(db, 999999), null);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appendEvent propagates withWrite errors unchanged (no retry, no swallow)", async () => {
    const { db, root } = await freshDb("3".repeat(16));
    try {
      assert.throws(() => appendEvent(db, baseRow({ kind: "not-a-real-kind" })));
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ADR-0009 §1, DEVIATIONS D-M2-2: key = tool + canonical command, quote-aware whitespace fold.
  test("canonicalKey folds whitespace outside quotes only and prefixes the tool", () => {
    assert.equal(canonicalKey("ctx_execute", "  ls   -la\t\n /tmp  "), "ctx_execute:ls -la /tmp");
    assert.equal(canonicalKey("ctx_execute", "echo 'a   b'   \"c\t d\""), "ctx_execute:echo 'a   b' \"c\t d\"");
    assert.equal(canonicalKey("ctx_execute", "echo a\\   b"), "ctx_execute:echo a\\  b"); // escaped space kept
    assert.equal(canonicalKey("ctx_execute", "echo \"x \\\"  y\"   z"), "ctx_execute:echo \"x \\\"  y\" z");
    assert.equal(canonicalKey("ctx_execute", "echo 'open   quote"), "ctx_execute:echo 'open   quote");
    assert.equal(canonicalKey("ctx_batch", ""), "ctx_batch:");
    assert.equal(canonicalKey("ctx_execute", "ls -la"), canonicalKey("ctx_execute", "ls\t-la "));
  });
});

describe("ADR-0009 section 2: candidates", { concurrency: true }, () => {
  // [M4] Unit tests for src/core/compaction/candidates.ts (ADR-0009 §2, impl/00 §5.4 step 3).
  // Candidate sections: last request (pinned), open errors, changed files, earlier requests,
  // indexed sources. Each section capped at MAX_CANDIDATES (85). decision rows never a candidate.

  function row(partial) {
    return {
      seq: 1, session_id: "s1", worktree: "/w", agent: "claude-code",
      kind: "prompt", tool: null, key: null, path: null, ok: 1, exit_code: null,
      bytes: 0, body: "", turn: 1,
      ...partial,
    };
  }

  test("[M4] candidates/last-request-always-pinned", () => {
    const rows = [
      row({ seq: 1, kind: "prompt", turn: 1, body: "first" }),
      row({ seq: 5, kind: "prompt", turn: 3, body: "latest" }),
    ];
    const out = buildCandidates(rows, "s1");
    assert.equal(out.lastRequest.seq, 5);
    assert.equal(out.lastRequest.pinned, true);
  });

  test("[M4] candidates/open-error-resolved-structurally-by-later-success", () => {
    const rows = [
      row({ seq: 2, kind: "cmd", key: "cmd:npm test", ok: 0, turn: 1 }),
      row({ seq: 4, kind: "cmd", key: "cmd:npm test", ok: 1, turn: 2 }),
    ];
    const out = buildCandidates(rows, "s1");
    assert.deepStrictEqual(out.openErrors, []);
  });

  test("[M4] candidates/open-error-newer-failure-after-success-stays-open", () => {
    const rows = [
      row({ seq: 2, kind: "cmd", key: "cmd:npm test", ok: 1, turn: 1 }),
      row({ seq: 4, kind: "cmd", key: "cmd:npm test", ok: 0, turn: 2 }),
    ];
    const out = buildCandidates(rows, "s1");
    assert.equal(out.openErrors.length, 1);
    assert.equal(out.openErrors[0].seq, 4);
  });

  test("[M4] candidates/changed-files-last-write-wins-with-edit-count", () => {
    const rows = [
      row({ seq: 1, kind: "edit", path: "a.ts", ok: 1, turn: 1 }),
      row({ seq: 3, kind: "edit", path: "a.ts", ok: 1, turn: 2 }),
    ];
    const out = buildCandidates(rows, "s1");
    assert.equal(out.changedFiles.length, 1);
    assert.equal(out.changedFiles[0].seq, 3);
    assert.equal(out.changedFiles[0].editCount, 2);
  });

  test("[M4] candidates/empty-session-id-injects-nothing", () => {
    const rows = [row({ seq: 1, kind: "prompt", session_id: "" })];
    const out = buildCandidates(rows, "");
    assert.deepStrictEqual(out.lastRequest, null);
    assert.deepStrictEqual(out.earlierRequests, []);
  });

  // DECISIONS-r11 (A) supersedes DECISIONS-r6 D3 (DEVIATIONS D-FU-CMP-PUSH-1): decision rows are the
  // "decisions" section, one candidate per key, the latest row wins, never in another section.
  test("[M7] candidates/decision-rows-are-the-decisions-section-latest-per-key", () => {
    const rows = [
      row({ seq: 1, kind: "decision", key: "Q", body: "A: yes" }),
      row({ seq: 2, kind: "prompt", body: "hi" }),
      row({ seq: 3, kind: "decision", key: "Q", body: "A: no\nref: #1" }),
      row({ seq: 4, kind: "decision", key: "R", body: "Q: R? → A: later" }),
    ];
    const out = buildCandidates(rows, "s1");
    assert.deepEqual(out.decisions.map((c) => [c.seq, c.text, c.repeatCount, c.query]),
      [[3, "decided #3: A: no", 2, "Q"], [4, "decided #4: Q: R? → A: later", 1, "R"]]);
    const others = [
      out.lastRequest?.seq,
      ...out.openErrors.map((r) => r.seq),
      ...out.changedFiles.map((r) => r.seq),
      ...out.earlierRequests.map((r) => r.seq),
      ...out.indexedSources.map((r) => r.seq),
    ];
    assert.ok(!others.includes(1) && !others.includes(3) && !others.includes(4));
  });

  test("[M4] candidates/section-capped-at-85", () => {
    const rows = [];
    for (let i = 0; i < 200; i++) {
      rows.push(row({ seq: i + 1, kind: "edit", path: `f${i}.ts`, ok: 1, turn: 1 }));
    }
    const out = buildCandidates(rows, "s1");
    assert.ok(out.changedFiles.length <= MAX_CANDIDATES);
  });

  test("[M4] candidates/other-session-rows-excluded", () => {
    const rows = [
      row({ seq: 1, session_id: "s1", kind: "prompt", body: "mine" }),
      row({ seq: 2, session_id: "s2", kind: "prompt", body: "other" }),
    ];
    const out = buildCandidates(rows, "s1");
    assert.equal(out.lastRequest.seq, 1);
  });
});

describe("ADR-0009 section 3: score", { concurrency: true }, () => {
  // [M4] Unit tests for src/core/compaction/score.ts (ADR-0009 §3, impl/00 §5.4 step 3).
  // score = Math.round(WEIGHT[section] * DECAY_X1000[age] * (1 + floor(log2(repeatCount))) / 1000), integers only
  // (DECISIONS-r9 M7: one Math.round at the end; DEVIATIONS D-M4-S1-5).

  test("[M4] score/age-zero-full-decay-no-repeat", () => {
    const s = scoreCandidate({ section: "prompt", currentTurn: 5, itemTurn: 5, repeatCount: 1 });
    const expected = Math.round((WEIGHT.prompt * DECAY_X1000[0]) / 1000);
    assert.equal(s, expected);
  });

  test("[M4] score/half-life-four-turns-matches-decay-table", () => {
    const s = scoreCandidate({ section: "toolerr", currentTurn: 9, itemTurn: 5, repeatCount: 1 });
    const expected = Math.round((WEIGHT.toolerr * DECAY_X1000[4]) / 1000);
    assert.equal(s, expected);
  });

  test("[M4] score/repeat-bonus-is-1-plus-floor-log2", () => {
    const s1 = scoreCandidate({ section: "edit", currentTurn: 1, itemTurn: 1, repeatCount: 1 });
    const s4 = scoreCandidate({ section: "edit", currentTurn: 1, itemTurn: 1, repeatCount: 4 });
    // repeatCount=1 -> bonus 1; repeatCount=4 -> bonus 1+floor(log2(4))=3
    assert.equal(s4, s1 * 3);
  });

  test("[M4] score/result-is-always-an-integer", () => {
    const s = scoreCandidate({ section: "index", currentTurn: 11, itemTurn: 3, repeatCount: 5 });
    assert.equal(Number.isInteger(s), true);
  });

  test("[M4] score/weight-ordering-toolerr-gt-prompt-gt-edit-gt-index", () => {
    const args = { currentTurn: 1, itemTurn: 1, repeatCount: 1 };
    const toolerr = scoreCandidate({ section: "toolerr", ...args });
    const prompt = scoreCandidate({ section: "prompt", ...args });
    const edit = scoreCandidate({ section: "edit", ...args });
    const index = scoreCandidate({ section: "index", ...args });
    assert.ok(toolerr > prompt && prompt > edit && edit > index);
  });

  // DECISIONS-r11 (A) supersedes DECISIONS-r6 D3 (DEVIATIONS D-FU-CMP-PUSH-1): a decision row is scored,
  // under an open error and over a prompt; a row kind with no weight (cost) is still rejected.
  test("[M7] score/decision-section-scored-between-toolerr-and-prompt", () => {
    const args = { currentTurn: 1, itemTurn: 1, repeatCount: 1 };
    const toolerr = scoreCandidate({ section: "toolerr", ...args });
    const decision = scoreCandidate({ section: "decision", ...args });
    const prompt = scoreCandidate({ section: "prompt", ...args });
    assert.ok(toolerr > decision && decision > prompt, [toolerr, decision, prompt].join(" "));
    assert.throws(() => scoreCandidate({ section: "cost", ...args }));
  });
});

describe("ADR-0009 section 5: render", { concurrency: true }, () => {
  // [M4] Unit tests for src/core/compaction/render.ts (ADR-0009 §4-§5, impl/06 §3, impl/00 §4
  // renderState(rows, turn), DECISIONS-r6 D1, DECISIONS-r9 M4/M8/M10-M13/M25, DEVIATIONS D-M4-arch-2).

  const OPEN = (sid, upto) => `<context_mode_state session="${sid}" upto="${upto}">`;
  const CLOSE = "</context_mode_state>";
  const bytes = (s) => Buffer.byteLength(s, "utf8");

  function row(partial) {
    return {
      seq: 1, session_id: "s1", worktree: "/w", agent: "claude-code",
      kind: "prompt", tool: null, key: null, path: null, ok: 1, exit_code: null,
      bytes: 0, body: "", turn: 1, sandbox_bytes: 0, returned_bytes: 0, created_at: 0, accessed_at: 0,
      ...partial,
    };
  }

  function bigJournal(n) {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const turn = Math.floor(i / 10);
      const m = i % 5;
      if (m === 0) rows.push(row({ seq: i, kind: "prompt", body: `request number ${i}\nsecond line`, turn }));
      else if (m === 1) rows.push(row({ seq: i, kind: "edit", tool: "Edit", path: `src/f${i % 300}.ts`, turn }));
      else if (m === 2) rows.push(row({ seq: i, kind: "cmd", tool: "Bash", key: `Bash:npm test ${i % 40}`, ok: i % 3 === 0 ? 0 : 1, turn }));
      else if (m === 3) rows.push(row({ seq: i, kind: "toolerr", tool: "Read", key: `Read:{"file_path":"x${i % 50}"}`, ok: 0, turn }));
      else rows.push(row({ seq: i, kind: "index", tool: "ctx_index", key: `doc-${i % 120}`, path: `doc-${i % 120}`, turn }));
    }
    return rows;
  }

  test("[M4] render/no-candidates-is-wrapper-and-empty-more-line", () => {
    assert.equal(
      renderState([], 0),
      `${OPEN("", 0)}\nmore: ctx_search(queries:[], scope:"session")\n${CLOSE}`,
    );
  });

  test("[M4] render/10000-row-journal-fits-state-budget", () => {
    const out = renderState(bigJournal(10000), 1000);
    assert.ok(bytes(out) <= STATE_BUDGET, `${bytes(out)} B`);
    assert.ok(out.startsWith(OPEN("s1", 10000) + "\n"));
    assert.ok(out.endsWith("\n" + CLOSE));
    assert.ok(out.split("\n")[1].startsWith("now: request number 10000"), "pinned last request is the first line");
  });

  test("[M4] render/same-rows-same-bytes", () => {
    const rows = bigJournal(3000);
    const a = renderState(rows, 300);
    for (let i = 0; i < 9; i++) assert.equal(renderState(rows, 300), a);
    assert.equal(renderState([...rows].reverse(), 300), a, "row order in the input does not change the bytes");
  });

  test("[M4] render/line-formats-section-order-and-seq-order", () => {
    const rows = [
      row({ seq: 1, kind: "prompt", body: "first ask\nmore text", turn: 1 }),
      row({ seq: 2, kind: "index", tool: "ctx_index", key: "docs-a", path: "docs-a", turn: 1 }),
      row({ seq: 3, kind: "edit", tool: "Edit", path: "b.ts", turn: 1 }),
      row({ seq: 4, kind: "edit", tool: "Edit", path: "a.ts", turn: 1 }),
      row({ seq: 5, kind: "edit", tool: "Edit", path: "b.ts", turn: 2 }),
      row({ seq: 6, kind: "cmd", tool: "Bash", key: "Bash:npm test", ok: 0, turn: 2 }),
      row({ seq: 7, kind: "prompt", body: "fix it\r\nnow", turn: 2 }),
    ];
    assert.equal(
      renderState(rows, 2),
      [
        OPEN("s1", 7),
        "now: fix it ",
        "error #6 Bash: Bash:npm test",
        "edited a.ts x1",
        "edited b.ts x2",
        "asked #1: first ask",
        "indexed docs-a",
        'more: ctx_search(queries:[], scope:"session")',
        CLOSE,
      ].join("\n"),
    );
  });

  test("[M4] render/item-over-pointer-min-becomes-pointer-line", () => {
    const body = "x".repeat(POINTER_MIN);
    const rows = [
      row({ seq: 1, kind: "prompt", body, turn: 1 }),
      row({ seq: 2, kind: "prompt", body: "short", turn: 1 }),
    ];
    const out = renderState(rows, 1);
    const textBytes = bytes("asked #1: " + body);
    assert.ok(out.includes(`\n#1 (${textBytes} B) ctx_resume(seq:1)\n`), out);
    assert.ok(!out.includes("xxxx"), "an oversize item is never cut, only pointed at");
  });

  test("[M4] render/pinned-oversize-last-request-is-a-pointer-too", () => {
    const body = "y".repeat(STATE_BUDGET * 4);
    const out = renderState([row({ seq: 9, kind: "prompt", body, turn: 1 })], 1);
    assert.equal(out.split("\n")[1], `#9 (${bytes("now: " + body)} B) ctx_resume(seq:9)`);
    assert.ok(bytes(out) <= STATE_BUDGET);
  });

  test("[M4] render/surrogate-pairs-never-split", () => {
    const emoji = "\u{1F600}".repeat(400);
    const rows = [
      row({ seq: 1, kind: "prompt", body: emoji.slice(0, 2 * 150), turn: 1 }),
      row({ seq: 2, kind: "index", tool: "ctx_index", key: emoji.slice(0, 2 * 100), turn: 1 }),
      row({ seq: 3, kind: "prompt", body: emoji, turn: 1 }),
    ];
    const out = renderState(rows, 1);
    assert.equal(Buffer.from(out, "utf8").toString("utf8"), out);
    assert.ok(!out.includes("�"));
    assert.ok(bytes(out) <= STATE_BUDGET);
  });

  test("[M4] render/foreign-session-rows-ignored", () => {
    const rows = [
      row({ seq: 1, session_id: "s2", kind: "edit", path: "theirs.ts" }),
      row({ seq: 2, session_id: "s1", kind: "edit", path: "mine.ts" }),
      row({ seq: 3, session_id: "s1", kind: "prompt", body: "go" }),
    ];
    const out = renderState(rows, 1);
    assert.ok(out.includes("edited mine.ts x1"));
    assert.ok(!out.includes("theirs.ts"));
  });

  test("[M4] render/error-fixed-later-not-listed", () => {
    const rows = [
      row({ seq: 1, kind: "cmd", tool: "Bash", key: "Bash:npm test", ok: 0 }),
      row({ seq: 2, kind: "cmd", tool: "Bash", key: "Bash:npm test", ok: 1 }),
      row({ seq: 3, kind: "prompt", body: "go" }),
    ];
    assert.ok(!renderState(rows, 1).includes("error #"));
  });

  // DECISIONS-r11 (A) supersedes DECISIONS-r6 D3 (DEVIATIONS D-FU-CMP-PUSH-1): the anchored block has a
  // decisions section, after edited files and before earlier requests.
  test("[M7] render/decision-rows-rendered-in-fixed-order", () => {
    const rows = [
      row({ seq: 1, kind: "decision", tool: "AskUserQuestion", key: "Q: deploy?", body: "Q: deploy? → A: Yes" }),
      row({ seq: 2, kind: "edit", tool: "Edit", path: "a.ts" }),
      row({ seq: 3, kind: "prompt", body: "first ask" }),
      row({ seq: 4, kind: "prompt", body: "go" }),
    ];
    assert.equal(renderState(rows, 1), [
      OPEN("s1", 4),
      "now: go",
      "edited a.ts x1",
      "decided #1: Q: deploy? → A: Yes",
      "asked #3: first ask",
      'more: ctx_search(queries:[], scope:"session")',
      CLOSE,
    ].join("\n"));
  });

  // ADR-0009 §4 "An item that does not fit is skipped, and smaller ones may still fit" (the D1
  // open-error miss is a budget skip): three open errors fill most of the budget, a fourth does not
  // fit and is skipped, and a smaller, lower-ratio line is still taken after it.
  test("[M4] render/budget-skip-not-stop-and-more-queries", () => {
    const rows = [];
    for (let i = 1; i <= 4; i++) {
      rows.push(row({ seq: i, kind: "toolerr", tool: "Read", key: `${i}-` + "k".repeat(530), ok: 0, turn: 500 }));
    }
    rows.push(row({ seq: 5, kind: "index", tool: "ctx_index", key: "s".repeat(190), turn: 0 }));
    rows.push(row({ seq: 6, kind: "edit", tool: "Edit", path: "p".repeat(600), turn: 0 }));
    rows.push(row({ seq: 7, kind: "edit", tool: "Edit", path: "q".repeat(600), turn: 0 }));
    const out = renderState(rows, 500);
    const lines = out.split("\n");
    assert.equal(lines.filter((l) => l.startsWith("error #")).length, 3, out);
    assert.ok(lines.includes("indexed " + "s".repeat(190)), "a smaller item after a skip is still taken");
    assert.ok(bytes(out) <= STATE_BUDGET, `${bytes(out)} B`);
    const more = lines[lines.length - 2];
    assert.ok(more.startsWith("more: ctx_search(queries:["), more);
    assert.ok(more.endsWith('], scope:"session")'), more);
  });

  test("[M4] render/more-queries-dedup-key-path-no-prompt-seq-ascending", () => {
    const rows = [];
    let seq = 0;
    // Long earlier prompts and long changed-file lines that cannot all fit.
    for (let i = 0; i < 40; i++) rows.push(row({ seq: ++seq, kind: "prompt", body: `ask ${i} ` + "a".repeat(300), turn: 0 }));
    for (let i = 0; i < 40; i++) rows.push(row({ seq: ++seq, kind: "edit", tool: "Edit", path: `dir/file-${i}.ts`, turn: 0 }));
    rows.push(row({ seq: ++seq, kind: "prompt", body: "last", turn: 9 }));
    const out = renderState(rows, 9);
    assert.ok(bytes(out) <= STATE_BUDGET, `${bytes(out)} B`);
    const lines = out.split("\n");
    const more = lines[lines.length - 2];
    const json = more.slice("more: ctx_search(queries:".length, more.length - ', scope:"session")'.length);
    const queries = JSON.parse(json);
    assert.equal(new Set(queries).size, queries.length, "dedup");
    for (const q of queries) assert.ok(q.startsWith("dir/file-"), `only paths, no prompt text: ${q}`);
    const order = queries.map((q) => Number(q.slice("dir/file-".length, q.length - ".ts".length)));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "seq ascending");
    for (const q of queries) assert.ok(!lines.includes(`edited ${q} x1`), "a query names only a dropped item");
  });

  test("[M4] render/no-clock-no-role", () => {
    const out = renderState(bigJournal(500), 50);
    for (const bad of ["user:", "assistant:", "directive", "T0", "Z\n"]) assert.ok(!out.includes(bad), bad);
  });
});

// Serial on purpose: it sets and restores process.env keys.
describe("ADR-0009 section 5: render, ported locale case", () => {
  // [W1-session-journal] Ported from tests/session/detect-locale-esm.test.ts.
  // v1 detected a locale (CONTEXT_MODE_LOCALE, AppleLocale, LANG) for Intl date formatting; LANG=C.UTF-8
  // crashed `new Intl.DateTimeFormat("C")` on Linux CI (fix 9cc6873c). v2 compaction output has no locale
  // use at all (ADR-0009 §4-§5: integers and fixed text only). The case that must hold: the block is
  // byte-identical under any locale env, and rendering never throws under POSIX locale values.

  function row(partial) {
    return {
      seq: 1, session_id: "s1", worktree: "/w", agent: "claude-code",
      kind: "prompt", tool: null, key: null, path: null, ok: 1, exit_code: null,
      bytes: 0, body: "", turn: 1, sandbox_bytes: 0, returned_bytes: 0, created_at: 1700000000000, accessed_at: 1700000000000,
      ...partial,
    };
  }

  const rows = [
    row({ seq: 1, kind: "prompt", body: "ilk istek", turn: 1 }),
    row({ seq: 2, kind: "edit", tool: "Edit", path: "src/a.ts", turn: 1 }),
    row({ seq: 3, kind: "cmd", tool: "Bash", key: "Bash:npm test", ok: 0, turn: 2 }),
    row({ seq: 4, kind: "prompt", body: "son istek", turn: 2 }),
  ];

  function renderUnder(env) {
    const saved = {};
    for (const k of Object.keys(env)) {
      saved[k] = process.env[k];
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    try {
      return renderState(rows, 2);
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  }

  test("[W1-session-journal] renderState output does not depend on locale env", () => {
    const base = renderUnder({ CONTEXT_MODE_LOCALE: undefined, LANG: undefined, LC_ALL: undefined });
    for (const env of [
      { CONTEXT_MODE_LOCALE: "tr-TR", LANG: undefined, LC_ALL: undefined },
      { CONTEXT_MODE_LOCALE: undefined, LANG: "C.UTF-8", LC_ALL: undefined },
      { CONTEXT_MODE_LOCALE: undefined, LANG: "POSIX", LC_ALL: "C" },
      { CONTEXT_MODE_LOCALE: undefined, LANG: "xx_XX.UTF-8", LC_ALL: undefined },
    ]) {
      assert.equal(renderUnder(env), base, JSON.stringify(env));
    }
    assert.ok(base.length > 0);
  });
});

// Serial on purpose: its before/after hooks set HOME and USERPROFILE for the whole process.
describe("ADR-0009 section 0: journal write path from the in-process entries (OpenCode, Pi)", () => {
  // tests/v2/plugins/inprocess-journal.test.mjs
  // OPEN-ITEMS H6 (D-HF-INPROC-JOURNAL-1): a ctx_* call that the opencode plugin or the pi extension runs in process
  // must leave the same per-call journal row the MCP server writes (impl/00 §5.2 step 5, ADR-0009 §0), so ctx_stats
  // counts the saving on every host. Before the fix both in-process entries wrote no row and ctx_stats showed 0 B.


  let root, repo, oldHome, oldProject;
  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cm-inproc-journal-")));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    oldHome = process.env.HOME;
    oldProject = process.env.CLAUDE_PROJECT_DIR;
    process.env.HOME = root; process.env.USERPROFILE = root;
    delete process.env.CLAUDE_PROJECT_DIR;
  });
  after(() => {
    process.env.HOME = oldHome;
    if (oldProject !== undefined) process.env.CLAUDE_PROJECT_DIR = oldProject;
    // The entries keep their journal DB handle open until the process exits (D-HF-INPROC-JOURNAL-1), and Windows
    // refuses to delete an open file. Only that case is tolerated; the OS temp dir is cleaned later (D-HQ-CI-WINRM-1).
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || (err.code !== "EPERM" && err.code !== "EBUSY")) throw err;
    }
  });

  function rows(agent) {
    const base = join(root, ".context-mode", "projects");
    const out = [];
    for (const d of readdirSync(base)) {
      const db = new DatabaseSync(join(base, d, "context.db"), { readOnly: true });
      try {
        out.push(...db.prepare("SELECT agent, tool, session_id, sandbox_bytes, returned_bytes FROM events WHERE agent = ? AND tool = 'ctx_execute'").all(agent));
      } finally {
        db.close();
      }
    }
    return out;
  }

  const CODE = { language: "javascript", code: "console.log('x'.repeat(20000))" };

  test("H6: opencode in-process ctx_execute writes a journal row and ctx_stats counts it", async () => {
    const registered = new Map();
    await opencodePlugin.setup({ directory: repo, tool: (name, def) => registered.set(name, def) });
    await registered.get("ctx_execute").execute(CODE, { sessionID: "oc-1" });
    const r = rows("opencode");
    assert.equal(r.length, 1, "one journal row per in-process call");
    assert.equal(r[0].session_id, "oc-1");
    assert.ok(r[0].sandbox_bytes >= 20000, "sandbox bytes are the bytes the call produced");
    assert.ok(r[0].returned_bytes < r[0].sandbox_bytes, "returned bytes are what reached the model");
    const stats = await registered.get("ctx_stats").execute({}, { sessionID: "oc-1" });
    assert.match(stats, /opencode/);
  });

  test("H6: pi in-process ctx_execute writes a journal row like the MCP server", async () => {
    const handlers = new Map();
    const tools = new Map();
    piExtension({ on: (n, fn) => handlers.set(n, fn), registerTool: (t) => tools.set(t.name, t) });
    await handlers.get("before_agent_start")({ systemPrompt: "" }, { cwd: repo, sessionManager: { getSessionId: () => "pi-1" } });
    await tools.get("ctx_execute").execute("c1", CODE);
    const r = rows("pi");
    assert.equal(r.length, 1, "one journal row per in-process call");
    assert.equal(r[0].session_id, "pi-1");
    assert.ok(r[0].sandbox_bytes >= 20000);
  });
});

describe("ADR-0009 section 6: ctx_resume delivery", { concurrency: true }, () => {
  // [M4] Unit tests for src/core/tools/resume.ts (impl/06 §4, ADR-0009 §4, DECISIONS-r6 D6, DECISIONS-r9 V21,
  // DEVIATIONS D-M4-arch-2 (renderState(rows, turn) over readSessionEvents rows), D-M4-arch-3 (handler (input, ctx),
  // session from ctx.sessionId), D-M4-S2-1 (seq read returns the whole body)).

  const KEY = "4".repeat(16);
  function ctxFor(root, sessionId = "s1") {
    const projectDir = join(root, "projects", KEY);
    return {
      project: { projectKey: KEY, projectDir, dbPath: join(projectDir, "context.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId, turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18",
    };
  }

  function row(sessionId, partial) {
    return {
      session_id: sessionId, worktree: "/w", agent: "claude-code", kind: "prompt", tool: null, key: null, path: null,
      ok: 1, exit_code: null, bytes: 1, body: "p", turn: 1, sandbox_bytes: 0, returned_bytes: 0, ...partial,
    };
  }

  // Returns the seq of each appended row.
  async function add(ctx, rows) {
    const db = await openDb(ctx.project);
    try {
      return rows.map(([sid, partial]) => appendEvent(db, row(sid, partial)));
    } finally { closeDb(db); }
  }

  async function eventCount(ctx) {
    const db = await openDb(ctx.project);
    try { return Number(db.raw.prepare("SELECT COUNT(*) AS n FROM events").get().n); } finally { closeDb(db); }
  }

  async function rowsOf(ctx, sid) {
    const db = await openDb(ctx.project, { readOnly: true });
    try { return readSessionEvents(db, sid); } finally { closeDb(db); }
  }

  async function withRoot(fn) {
    const root = mkdtempSync(join(tmpdir(), "cm-resume-"));
    try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  }

  const bytes = (s) => Buffer.byteLength(s, "utf8");

  test("[M4] resume/tool-shape: ctx_resume is readOnly, strict, unknown field is the exact line", () => {
    assert.equal(ctxResume.name, "ctx_resume");
    assert.equal(ctxResume.readOnly, true);
    assert.equal(ctxResume.alwaysLoad, false);
    assert.equal(ctxResume.schema.safeParse({}).success, true);
    assert.equal(ctxResume.schema.safeParse({ session: "s1", seq: 3 }).success, true);
    const bad = ctxResume.schema.safeParse({ query: "x" });
    assert.equal(bad.success, false);
    assert.equal(bad.error.issues[0].message, RESUME_UNKNOWN_FIELD_LINE);
    assert.equal(ctxResume.schema.safeParse({ seq: 0 }).success, false);
    assert.equal(ctxResume.schema.safeParse({ seq: 1.5 }).success, false);
  });

  test("[M4] resume/no-session-id: empty ctx.sessionId and no session -> exact error line", () => withRoot(async (root) => {
    const out = await ctxResume.handler({}, ctxFor(root, ""));
    assert.deepEqual([out.isError, out.text], [true, RESUME_NO_SESSION_LINE]);
  }));

  test("[M4] resume/fresh-session: no rows -> the empty line, not an error", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    await add(ctx, [["other", { body: "foreign" }]]);
    const out = await ctxResume.handler({}, ctx);
    assert.deepEqual([out.isError, out.text, out.sandboxBytes], [false, RESUME_EMPTY_LINE, 0]);
  }));

  test("[M4] resume/no-seq-block-is-renderState: the reply is renderState(session rows, turn of newest row) and <= RESUME_CAP", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    await add(ctx, [
      ["s1", { body: "first ask", turn: 1 }],
      ["s1", { kind: "edit", tool: "Edit", path: "src/a.ts", turn: 2 }],
      ["other", { body: "FOREIGN-ROW", turn: 9 }],
      ["s1", { kind: "cmd", tool: "Bash", key: "Bash:npm test", ok: 0, turn: 3 }],
      ["s1", { body: "second ask", turn: 4 }],
    ]);
    const out = await ctxResume.handler({}, ctx);
    const rows = await rowsOf(ctx, "s1");
    assert.equal(out.isError, false);
    assert.equal(out.text, renderState(rows, 4));
    assert.ok(out.text.startsWith(`<context_mode_state session="s1" upto="${rows.at(-1).seq}">`));
    assert.ok(!out.text.includes("FOREIGN-ROW"), "no foreign session rows");
    assert.ok(bytes(out.text) <= RESUME_CAP);
  }));

  test("[M4] resume/session-input-overrides-context: session picks the journal, ctx.sessionId is ignored", () => withRoot(async (root) => {
    const ctx = ctxFor(root, "s1");
    await add(ctx, [["s1", { body: "mine" }], ["s2", { body: "theirs ask" }]]);
    const out = await ctxResume.handler({ session: "s2" }, ctx);
    assert.ok(out.text.startsWith('<context_mode_state session="s2"'));
    assert.ok(out.text.includes("now: theirs ask"));
  }));

  test("[M4] resume/large-journal-bounded: 10,000 rows -> block <= RESUME_CAP", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    const rows = [];
    for (let i = 1; i <= 10000; i++) {
      const m = i % 4;
      if (m === 0) rows.push(["s1", { body: "request " + i, turn: i }]);
      else if (m === 1) rows.push(["s1", { kind: "edit", tool: "Edit", path: "src/f" + (i % 300) + ".ts", turn: i }]);
      else if (m === 2) rows.push(["s1", { kind: "toolerr", tool: "Read", key: "Read:x" + (i % 50), ok: 0, turn: i }]);
      else rows.push(["s1", { kind: "index", tool: "ctx_index", key: "doc-" + (i % 120), path: "doc-" + (i % 120), turn: i }]);
    }
    await add(ctx, rows);
    const out = await ctxResume.handler({}, ctx);
    assert.equal(out.isError, false);
    assert.ok(bytes(out.text) <= RESUME_CAP, "got " + bytes(out.text) + " B");
  }));

  test("[M4] resume/seq-pointer-roundtrip: a line over POINTER_MIN is a pointer and ctx_resume(seq) returns the whole row body", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    const big = "b".repeat(POINTER_MIN + 10) + "\nsecond line";
    const [bigSeq] = await add(ctx, [["s1", { body: big, bytes: bytes(big) }], ["s1", { body: "now this" }]]);
    const state = await ctxResume.handler({}, ctx);
    const pointer = "#" + bigSeq + " (" + bytes("asked #" + bigSeq + ": " + "b".repeat(POINTER_MIN + 10)) + " B) ctx_resume(seq:" + bigSeq + ")";
    assert.ok(state.text.split("\n").includes(pointer), state.text);
    const whole = await ctxResume.handler({ seq: bigSeq }, ctx);
    assert.deepEqual([whole.isError, whole.text], [false, big]);
  }));

  test("[M4] resume/seq-whole-row-over-output-cap: the seq read is never cut (D-M4-S2-1)", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    const huge = "line\n".repeat(OUTPUT_CAP); // 5 x OUTPUT_CAP bytes
    const [seq] = await add(ctx, [["s1", { kind: "cmd", tool: "Bash", key: "Bash:cat", body: huge, bytes: bytes(huge) }]]);
    const out = await ctxResume.handler({ seq }, ctx);
    assert.equal(out.isError, false);
    assert.equal(out.text, huge);
  }));

  test("[M4] resume/seq-missing-or-foreign: no row at seq for this session -> exact error line", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    const [foreign] = await add(ctx, [["other", { body: "not yours" }], ["s1", { body: "mine" }]]);
    const missing = await ctxResume.handler({ seq: 999 }, ctx);
    assert.deepEqual([missing.isError, missing.text], [true, RESUME_NO_ROW_LINE(999)]);
    const other = await ctxResume.handler({ seq: foreign }, ctx);
    assert.deepEqual([other.isError, other.text], [true, RESUME_NO_ROW_LINE(foreign)]);
    const viaSession = await ctxResume.handler({ session: "other", seq: foreign }, ctx);
    assert.deepEqual([viaSession.isError, viaSession.text], [false, "not yours"]);
  }));

  test("[M4] resume/read-only: the handler writes no row (the server writes the one journal row)", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    const [seq] = await add(ctx, [["s1", { body: "ask" }]]);
    const before = await eventCount(ctx);
    await ctxResume.handler({}, ctx);
    await ctxResume.handler({ seq }, ctx);
    assert.equal(await eventCount(ctx), before);
  }));

  // D-CR3-RESUME-1: ctx_resume lists this session's stored sources by short id and adds the top line units for
  // the session goal (same ranked query as the post-compact recall), whole lines, inside RESUME_CAP.
  async function storeOutput(ctx, sessionId, label, text) {
    const { indexText } = await import("../../src/core/index/text.ts");
    const { insertUnits } = await import("../../src/core/store/fts.ts");
    const { buildUnits } = await import("../../src/core/index/units.ts");
    const db = await openDb(ctx.project);
    try {
      const { sourceId } = indexText(db, ctx.project, sessionId, label, text, "text");
      insertUnits(db, sourceId, sessionId, buildUnits(text));
      return sourceId;
    } finally { closeDb(db); }
  }

  function deployJson() {
    const lines = ["{", '  "services": {'];
    for (let i = 0; i < 300; i++) lines.push('    "svc' + i + '": { "replicas": ' + (i % 7) + ', "zone": "z' + (i % 5) + '" },');
    lines.push('    "billing": {', '      "deploy_region": "eu-west-3",', '      "replicas": 4', "    }", "  }", "}");
    return lines.join("\n");
  }

  test("D-CR3-RESUME-1: ctx_resume lists stored sources by short id and the goal's line units, inside RESUME_CAP", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    await add(ctx, [["s1", { body: "which deploy_region does billing use", turn: 1 }], ["s1", { kind: "cmd", tool: "Bash", key: "Bash:cat deploy.json", turn: 2 }]]);
    const text = deployJson();
    assert.ok(bytes(text) > RESUME_CAP);
    const id = await storeOutput(ctx, "s1", "Bash:cat deploy.json#toolu_1", text);
    await storeOutput(ctx, "other", "Bash:cat foreign.json#toolu_2", '{\n  "deploy_region": "FOREIGN"\n}');
    const out = await ctxResume.handler({}, ctx);
    const handle = "s" + id.toString(36);
    const lines = out.text.split("\n");
    assert.equal(out.isError, false);
    assert.ok(out.text.startsWith('<context_mode_state session="s1" upto="'), out.text);
    assert.ok(out.text.endsWith("\n</context_mode_state>"), out.text);
    assert.ok(bytes(out.text) <= RESUME_CAP, bytes(out.text) + " B");
    assert.ok(lines.includes("source " + handle + ": Bash:cat deploy.json#toolu_1 (" + bytes(text) + " B)"), out.text);
    const at = lines.findIndex((l) => l.startsWith("@" + handle + " line "));
    assert.ok(at > 0, "a line unit names the source by its short id: " + out.text);
    assert.ok(out.text.includes('"billing": {\n      "deploy_region": "eu-west-3",'), "the unit keeps its parent: " + out.text);
    assert.ok(!out.text.includes("FOREIGN") && !out.text.includes("foreign.json"), "no foreign session source");
  }));

  test("D-CR3-RESUME-1: a 10,000-row journal plus stored sources stays <= RESUME_CAP, whole lines", () => withRoot(async (root) => {
    const ctx = ctxFor(root);
    const rows = [["s1", { body: "which deploy_region does billing use", turn: 0 }]];
    for (let i = 1; i <= 10000; i++) rows.push(["s1", i % 2 === 0 ? { body: "request " + i, turn: i } : { kind: "edit", tool: "Edit", path: "src/f" + (i % 300) + ".ts", turn: i }]);
    await add(ctx, rows);
    for (let i = 0; i < 20; i++) await storeOutput(ctx, "s1", "Bash:cat deploy" + i + ".json#toolu_" + i, deployJson());
    const out = await ctxResume.handler({}, ctx);
    assert.equal(out.isError, false);
    assert.ok(bytes(out.text) <= RESUME_CAP, "got " + bytes(out.text) + " B");
    assert.ok(out.text.endsWith("\n</context_mode_state>"));
  }));
});

describe("ADR-0009 section 7: memory recall", { concurrency: true }, () => {
  // [M7] Unit tests for src/core/compaction/recall.ts (DECISIONS-r11 B): BM25 turn-boundary recall, whole rows,
  // RECALL_BUDGET_BYTES, RECALL_MIN_SCORE, no repeat of a row already injected.

  const bytes = (s) => Buffer.byteLength(s, "utf8");

  function row(partial) {
    return {
      seq: 1, session_id: "s1", worktree: "/w", agent: "claude-code",
      kind: "prompt", tool: null, key: null, path: null, ok: 1, exit_code: null,
      bytes: 0, body: "", turn: 1, sandbox_bytes: 0, returned_bytes: 0, created_at: 0, accessed_at: 0,
      ...partial,
    };
  }

  // A compaction only happens in a long session, so the journal has many rows; BM25 IDF needs that size
  // (a 4-row corpus gives every shared term an IDF near 0). The filler is unrelated work of the same session.
  const FILLER = [
    "rename the config loader", "Exit code 0\nall 42 tests passed", "update the changelog for the release",
    "bump the version in package.json", "Exit code 0\nbuild finished in 2.1 s", "add a retry to the http client",
    "write docs for the cli flags", "Exit code 0\nlint clean", "move the date helpers to utils",
    "check the coverage report", "split the large router file", "Exit code 0\n12 files formatted",
  ];
  const filler = () => FILLER.map((body, i) => row({ seq: 100 + i, kind: i % 3 === 1 ? "cmd" : "prompt", tool: i % 3 === 1 ? "Bash" : null, body }));

  const journal = () => [
    ...filler(),
    row({ seq: 1, kind: "prompt", body: "fix the flaky login test" }),
    row({ seq: 2, kind: "cmd", tool: "Bash", key: "npm test -- login", ok: 0, exit_code: 1,
      body: "Exit code 1\nFAIL tests/login.test.ts\nTimeoutError: waitForSelector #submit exceeded 3000 ms" }),
    row({ seq: 3, kind: "edit", tool: "Edit", path: "src/ui/theme.css", body: "" }),
    row({ seq: 4, kind: "prompt", body: "add a dark mode toggle" }),
  ];

  test("[M7] recall/names-an-earlier-error: the failing row comes back whole", () => {
    const out = pickRecall(journal(), "why did the login test time out on waitForSelector submit", new Set());
    assert.deepEqual(out.seqs, [2]);
    assert.ok(out.text.startsWith(RECALL_OPEN_TAG + "\n") && out.text.endsWith("\n" + RECALL_CLOSE_TAG), out.text);
    assert.ok(out.text.includes(recallLine(journal().find((r) => r.seq === 2))), "the whole row, never cut");
    assert.ok(out.text.includes("TimeoutError: waitForSelector #submit exceeded 3000 ms"));
  });

  test("[M7] recall/below-threshold: an unrelated prompt adds nothing", () => {
    const out = pickRecall(journal(), "what is the weather", new Set());
    assert.deepEqual(out, { text: "", seqs: [] });
    assert.ok(RECALL_MIN_SCORE > 0);
  });

  test("[M7] recall/no-repeat: a seq already injected is never picked again", () => {
    const prompt = "why did the login test time out on waitForSelector submit";
    const first = pickRecall(journal(), prompt, new Set());
    assert.deepEqual(first.seqs, [2]);
    const second = pickRecall(journal(), prompt, new Set(first.seqs));
    assert.equal(second.seqs.includes(2), false);
  });

  test("[M7] recall/own-prompt-not-a-candidate: the prompt's own journal row is skipped", () => {
    const prompt = "fix the flaky login test";
    const out = pickRecall([row({ seq: 9, kind: "prompt", body: prompt })], prompt, new Set());
    assert.deepEqual(out.seqs, []);
  });

  test("[M7] recall/budget: many matching rows stay within RECALL_BUDGET_BYTES, whole rows only", () => {
    // 24 matching rows of ~100 B (more than the budget) in a session of 264 rows: BM25 IDF stays high
    // only while a term is in few rows, as in a real long session (probe: top score 6.70).
    const rows = [];
    for (let k = 0; k < 20; k++) rows.push(...filler().map((r) => ({ ...r, seq: 1000 + 100 * k + r.seq })));
    for (let i = 1; i <= 24; i++) {
      rows.push(row({ seq: i, kind: "toolerr", tool: "Read", key: "yaml parse " + i, ok: 0,
        body: "yaml parse failed at line " + i + " of config/app.yaml: unexpected token" }));
    }
    const out = pickRecall(rows, "why did the yaml parse fail", new Set());
    assert.ok(out.seqs.length > 1 && out.seqs.length < 24, String(out.seqs.length));
    assert.ok(bytes(out.text) <= RECALL_BUDGET_BYTES, String(bytes(out.text)));
    const expected = [RECALL_OPEN_TAG, ...out.seqs.map((s) => recallLine(rows.find((r) => r.seq === s))), RECALL_CLOSE_TAG].join("\n");
    assert.equal(out.text, expected, "whole rows, seq ascending");
    assert.ok(bytes(expected) + bytes(recallLine(rows[rows.length - 1])) + 1 > RECALL_BUDGET_BYTES || out.seqs.length === 23);
  });

  test("[M7] recall/row-over-budget-is-skipped-not-cut", () => {
    const big = row({ seq: 1, kind: "toolerr", tool: "Read", key: "parser crash", ok: 0, body: "parser crash " + "q ".repeat(RECALL_BUDGET_BYTES) });
    const small = row({ seq: 2, kind: "toolerr", tool: "Read", key: "parser crash small", ok: 0, body: "parser crash again" });
    const out = pickRecall([...filler(), big, small], "parser crash", new Set());
    assert.deepEqual(out.seqs, [2]);
  });

  test("[M7] recall/cost-rows-and-empty-prompt-add-nothing", () => {
    assert.deepEqual(pickRecall(journal(), "   ", new Set()).seqs, []);
    assert.deepEqual(pickRecall([row({ seq: 1, kind: "cost", body: "" })], "cost", new Set()).seqs, []);
  });

  test("[M7] recall/deterministic: same rows, same prompt -> same bytes", () => {
    const p = "why did the login test time out on waitForSelector submit";
    const a = pickRecall(journal(), p, new Set()).text;
    for (let i = 0; i < 5; i++) assert.equal(pickRecall(journal(), p, new Set()).text, a);
  });
});

describe("ADR-0009 section 8: decision tag, timeline and cross-session ranking in ctx_search", { concurrency: true }, () => {
  // Unit tests for ctx_search source:"decision" and the ctx_index "decision (user)" rename
  // (ADR-0009 §8.2-§8.4, DECISIONS-r6 D2-D4, DECISIONS-r7 R1-R4, DEVIATIONS D-M4-arch-5).
  // A decision write (hooks/decision.ts) = one kind:"decision" journal row + its body as one chunk
  // under the reserved source label "decision"; seedDecision below writes that same pair.

  function ctxAt(root, sessionId, worktree) {
    const key = "9".repeat(16);
    return {
      project: { projectKey: key, projectDir: join(root, "projects", key), dbPath: join(root, "projects", key, "context.db"), worktree: worktree ?? root, containmentRoot: root, agent: "codex", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId, turn: 1, signal: new AbortController().signal,
    };
  }

  function withRoot(prefix, fn) {
    return async () => {
      const root = mkdtempSync(join(tmpdir(), prefix));
      try {
        await fn(root);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };
  }

  async function withDb(ctx, fn) {
    const db = await openDb(ctx.project);
    try {
      return fn(db);
    } finally {
      closeDb(db);
    }
  }

  function ev(ctx, overrides) {
    return {
      session_id: ctx.sessionId, worktree: ctx.project.worktree, agent: "codex", kind: "cmd", tool: "Bash", key: null, path: null,
      ok: 1, exit_code: 0, bytes: 1, body: "b", turn: 1, sandbox_bytes: 0, returned_bytes: 0, ...overrides,
    };
  }

  // The pair a decision write leaves: journal row + one chunk under the reserved label.
  async function seedDecision(ctx, body, ts) {
    return withDb(ctx, (db) => {
      const seq = appendEvent(db, ev(ctx, { kind: "decision", tool: "AskUserQuestion", key: "Q", body }));
      const { sourceId } = indexText(db, ctx.project, ctx.sessionId, C.DECISION_SOURCE, body, "text");
      if (ts !== undefined) {
        db.raw.prepare("UPDATE events SET created_at = ? WHERE seq = ?").run(ts, seq);
        db.raw.prepare("UPDATE sources SET created_ts = ? WHERE id = ?").run(ts, sourceId);
      }
      return seq;
    });
  }

  function labelsOf(text) {
    const out = [];
    for (const line of text.split("\n")) {
      const at = line.indexOf(" #");
      if (at > 0 && !line.startsWith("Query ") && !line.startsWith("More:")) out.push(line.slice(0, at));
    }
    return out;
  }

  function sourceLabels(ctx) {
    return withDb(ctx, (db) => db.raw.prepare("SELECT label FROM sources ORDER BY id").all().map((r) => r.label));
  }

  // ---- ctx_index rename (§8.2 last rule) ----

  test("[M4] ctx_index stores a user source labelled \"decision\" as \"decision (user)\"", withRoot("cm-sd1-", async (root) => {
    const ctx = ctxAt(root, "s1");
    const out = await ctxIndex.handler({ content: "my own decision notes", source: C.DECISION_SOURCE }, ctx);
    assert.equal(out.isError, false, out.text);
    assert.ok(out.text.endsWith("from " + C.DECISION_USER_LABEL + "."), out.text);
    assert.equal(out.journal.key, C.DECISION_USER_LABEL);
    assert.deepEqual(await sourceLabels(ctx), [C.DECISION_USER_LABEL]);
    // Any other label is stored as given.
    await ctxIndex.handler({ content: "x", source: "decisions" }, ctx);
    assert.deepEqual(await sourceLabels(ctx), [C.DECISION_USER_LABEL, "decisions"]);
  }));

  test("[M4] ctx_index renames a file whose label is \"decision\" too (one rule for every branch)", withRoot("cm-sd2-", async (root) => {
    const ctx = ctxAt(root, "s1");
    writeFileSync(join(root, "decision"), "file body");
    const out = await ctxIndex.handler({ path: "decision" }, ctx);
    assert.equal(out.isError, false, out.text);
    assert.deepEqual(await sourceLabels(ctx), [C.DECISION_USER_LABEL]);
  }));

  // ---- relevance, source:"decision" (§8.2, D-M4-arch-5) ----

  test("[M4] source:\"decision\" finds decision rows, never a user source renamed \"decision (user)\"", withRoot("cm-sd3-", async (root) => {
    const ctx = ctxAt(root, "s1");
    await ctxIndex.handler({ content: "deploy friday user note", source: C.DECISION_SOURCE }, ctx);
    await seedDecision(ctx, "Q: Deploy now? → A: Yes");
    const out = await ctxSearch.handler({ queries: ["deploy"], source: C.DECISION_SOURCE }, ctx);
    assert.equal(out.isError, false);
    assert.deepEqual(labelsOf(out.text), [C.DECISION_SOURCE]);
    assert.ok(out.text.includes("Q: Deploy now? → A: Yes"), out.text);
    const user = await ctxSearch.handler({ queries: ["deploy"], source: C.DECISION_USER_LABEL }, ctx);
    assert.deepEqual(labelsOf(user.text), [C.DECISION_USER_LABEL]);
  }));

  test("[M4] source:\"decision\" relevance: BM25 first, equal score -> newest first (seq desc)", withRoot("cm-sd4-", async (root) => {
    const ctx = ctxAt(root, "s1");
    await seedDecision(ctx, "A: blue");
    await seedDecision(ctx, "A: red red red");
    await seedDecision(ctx, "A: green");
    const out = await ctxSearch.handler({ queries: ["A"], source: C.DECISION_SOURCE }, ctx);
    const bodies = out.text.split("\n").filter((l) => l.startsWith("decision #")).map((l) => l.slice(l.indexOf(": ") + 2));
    // "A" scores the same in each of these one-chunk rows only when lengths match; red is longest.
    assert.deepEqual(bodies.slice(0, 2), ["A: green", "A: blue"]);
    const red = await ctxSearch.handler({ queries: ["red"], source: C.DECISION_SOURCE }, ctx);
    assert.deepEqual(red.text.split("\n").filter((l) => l.startsWith("decision #")).length, 1);
  }));

  test("[M4] empty queries + source:\"decision\" returns every decision row in scope, newest first", withRoot("cm-sd5-", async (root) => {
    const mine = ctxAt(root, "s1");
    const other = ctxAt(root, "s2");
    await seedDecision(mine, "A: first");
    await seedDecision(other, "A: other session");
    await seedDecision(mine, "A: second");
    await ctxIndex.handler({ content: "not a decision", source: "note" }, mine);

    const all = await ctxSearch.handler({ queries: [], source: C.DECISION_SOURCE }, mine);
    assert.equal(all.isError, false);
    const lines = all.text.split("\n").filter((l) => l.startsWith("decision #"));
    // Current session first (#895), then newest first.
    assert.deepEqual(lines.map((l) => l.slice(l.indexOf(": ") + 2)), ["A: second", "A: first", "A: other session"]);
    assert.ok(!all.text.includes("not a decision"));

    const sess = await ctxSearch.handler({ queries: [], source: C.DECISION_SOURCE, scope: "session" }, mine);
    assert.deepEqual(sess.text.split("\n").filter((l) => l.startsWith("decision #")).length, 2);

    // A blank query string is the same listing; without source:"decision" an empty search stays empty.
    const blank = await ctxSearch.handler({ queries: [" "], source: C.DECISION_SOURCE }, mine);
    assert.equal(blank.text.split("\n").filter((l) => l.startsWith("decision #")).length, 3);
    const none = await ctxSearch.handler({ queries: [] }, mine);
    assert.ok(none.text.startsWith("No hits in scope"), none.text);
  }));

  test("[M4] empty queries + source:\"decision\" pages by offset with a More: line", withRoot("cm-sd6-", async (root) => {
    const ctx = ctxAt(root, "s1");
    for (let i = 0; i < C.SEARCH_PAGE_SIZE + 3; i++) await seedDecision(ctx, "A: option " + i);
    const p1 = await ctxSearch.handler({ queries: [], source: C.DECISION_SOURCE }, ctx);
    assert.equal(p1.text.split("\n").filter((l) => l.startsWith("decision #")).length, C.SEARCH_PAGE_SIZE);
    const more = p1.text.split("\n").find((l) => l.startsWith("More: "));
    assert.ok(more && more.includes('source:"decision"') && more.includes("offset:" + C.SEARCH_PAGE_SIZE), p1.text);
    const p2 = await ctxSearch.handler({ queries: [""], source: C.DECISION_SOURCE, offset: C.SEARCH_PAGE_SIZE }, ctx);
    assert.deepEqual(p2.text.split("\n").filter((l) => l.startsWith("decision #")).map((l) => l.slice(l.indexOf(": ") + 2)), ["A: option 2", "A: option 1", "A: option 0"]);
  }));

  test("[M4] empty queries + source:\"decision\" with no decision rows states scope and source count", withRoot("cm-sd7-", async (root) => {
    const ctx = ctxAt(root, "s1");
    const out = await ctxSearch.handler({ queries: [], source: C.DECISION_SOURCE }, ctx);
    assert.equal(out.isError, false);
    assert.equal(out.text, 'No hits in scope "worktree" across 0 source(s).');
  }));

  // ---- timeline (§8.1 rules 4-8, §8.4) ----

  test("[M4] timeline source:\"decision\" lists journal rows only, one line per decision", withRoot("cm-sd8-", async (root) => {
    const ctx = ctxAt(root, "s1");
    const s1 = await seedDecision(ctx, "Q: Ship? → A: Yes", 1000);
    const s2 = await seedDecision(ctx, "Q: Now? → A: Later", 2000);
    const out = await ctxSearch.handler({ queries: [], source: C.DECISION_SOURCE, sort: "timeline" }, ctx);
    assert.equal(out.isError, false);
    assert.deepEqual(out.text.split("\n"), [
      "[1970-01-01T00:00:01.000Z] decision #" + s1 + " Q: Ship? → A: Yes",
      "[1970-01-01T00:00:02.000Z] decision #" + s2 + " Q: Now? → A: Later",
    ]);
    // Without a source filter the reserved chunk source is still not a second timeline row.
    const all = await ctxSearch.handler({ queries: [], sort: "timeline" }, ctx);
    assert.equal(all.text.split("\n").length, 2, all.text);
  }));

  test("[M4] GP5/timeline-repeat-identical: same journal state, same merged order", withRoot("cm-sd9-", async (root) => {
    const ctx = ctxAt(root, "s1");
    await withDb(ctx, (db) => {
      for (const t of [3000, 1000, 2000, 2000]) {
        const seq = appendEvent(db, ev(ctx, { body: "t" + t }));
        db.raw.prepare("UPDATE events SET created_at = ? WHERE seq = ?").run(t, seq);
      }
      const id = ftsInsert(db, { projectKey: ctx.project.projectKey, sessionId: "s1", worktree: root, agent: "codex", kind: "content", label: "doc", bytes: 1, chunkCount: 1, createdAt: 2000 }, [{ ord: 0, text: "d", bytes: 1 }]);
      return id;
    });
    const a = await ctxSearch.handler({ queries: [], sort: "timeline" }, ctx);
    const b = await ctxSearch.handler({ queries: [], sort: "timeline" }, ctx);
    assert.equal(a.text, b.text);
    assert.equal(a.text.split("\n").length, 5);
  }));

  test("[M4] GP5/timeline-tie-by-seq: equal timestamps order by seq, not by source or insert order", withRoot("cm-sd10-", async (root) => {
    const ctx = ctxAt(root, "s1");
    const seqs = await withDb(ctx, (db) => {
      const out = [];
      for (const kind of ["edit", "decision", "cmd"]) out.push(appendEvent(db, ev(ctx, { kind, body: kind })));
      // Write the timestamps in reverse seq order: the same ms for all three.
      for (const s of out.slice().reverse()) db.raw.prepare("UPDATE events SET created_at = 5000 WHERE seq = ?").run(s);
      // A content row at the same ms sorts after every journal row.
      ftsInsert(db, { projectKey: ctx.project.projectKey, sessionId: "s1", worktree: root, agent: "codex", kind: "content", label: "aaa", bytes: 1, chunkCount: 1, createdAt: 5000 }, [{ ord: 0, text: "c", bytes: 1 }]);
      return out;
    });
    const out = await ctxSearch.handler({ queries: [], sort: "timeline" }, ctx);
    assert.deepEqual(out.text.split("\n"), [
      "[1970-01-01T00:00:05.000Z] edit #" + seqs[0] + " edit",
      "[1970-01-01T00:00:05.000Z] decision #" + seqs[1] + " decision",
      "[1970-01-01T00:00:05.000Z] cmd #" + seqs[2] + " cmd",
      "[1970-01-01T00:00:05.000Z] aaa c",
    ]);
  }));

  test("[M4] GP5/timeline-session-scope-excludes-other-sessions", withRoot("cm-sd11-", async (root) => {
    const mine = ctxAt(root, "s1");
    const other = ctxAt(root, "s2");
    await seedDecision(mine, "A: mine", 1000);
    await seedDecision(other, "A: theirs", 2000);
    await ctxIndex.handler({ content: "their note", source: "theirs" }, other);
    const sess = await ctxSearch.handler({ queries: [], sort: "timeline", scope: "session" }, mine);
    assert.ok(sess.text.includes("A: mine"));
    assert.ok(!sess.text.includes("theirs"), sess.text);
    const wt = await ctxSearch.handler({ queries: [], sort: "timeline", scope: "worktree" }, mine);
    assert.ok(wt.text.includes("A: theirs") && wt.text.includes("their note"), wt.text);
  }));

  test("[M4] GP5/timeline-offset-and-relevance-after-invalid-args", withRoot("cm-sd12-", async (root) => {
    const ctx = ctxAt(root, "s1");
    const a = await ctxSearch.handler({ queries: [], sort: "timeline", offset: 0 }, ctx);
    assert.equal(a.isError, true);
    assert.ok(a.text.startsWith("Invalid argument offset."), a.text);
    const b = await ctxSearch.handler({ queries: ["x"], after: 0 }, ctx);
    assert.equal(b.isError, true);
    assert.ok(b.text.startsWith("Invalid argument after."), b.text);
    const c = await ctxSearch.handler({ queries: ["x"], sort: "relevance", after: 0, source: C.DECISION_SOURCE }, ctx);
    assert.equal(c.isError, true);
  }));

  // ---- cross-session ranking (§8.3, D4, #895; ADR-0009 §8.4 last case) ----

  test("[M4] GP5/same-session-outranks-cross-session: a fresh own-session hit beats an older higher-BM25 hit", withRoot("cm-sd13-", async (root) => {
    const mine = ctxAt(root, "s1");
    const other = ctxAt(root, "s2");
    await withDb(mine, (db) => {
      const put = (sessionId, label, text, createdAt) => ftsInsert(db, { projectKey: mine.project.projectKey, sessionId, worktree: root, agent: "codex", kind: "content", label, bytes: 1, chunkCount: 1, createdAt }, [{ ord: 0, text, bytes: Buffer.byteLength(text) }]);
      put("s2", "older-cross", "rrfterm rrfterm rrfterm", 1000);
      put("s1", "fresh-own", "rrfterm " + "pad ".repeat(30), 2000);
    });
    for (const scope of ["project", "worktree"]) {
      const out = await ctxSearch.handler({ queries: ["rrfterm"], scope }, mine);
      assert.deepEqual(labelsOf(out.text), ["fresh-own", "older-cross"], scope + ": " + out.text);
    }
    // The other session sees its own row first: the order is per caller, not per row.
    const theirs = await ctxSearch.handler({ queries: ["rrfterm"], scope: "project" }, other);
    assert.deepEqual(labelsOf(theirs.text), ["older-cross", "fresh-own"]);
  }));

  test("[M4] RRF (k = RRF_K) orders cross-session hits of one tier by fused BM25 + recency rank", withRoot("cm-sd14-", async (root) => {
    const mine = ctxAt(root, "s1");
    await withDb(mine, (db) => {
      const put = (label, text, createdAt) => ftsInsert(db, { projectKey: mine.project.projectKey, sessionId: "s2", worktree: root, agent: "codex", kind: "content", label, bytes: 1, chunkCount: 1, createdAt }, [{ ord: 0, text, bytes: Buffer.byteLength(text) }]);
      // BM25 ranks: a=1, b=2, c=3. Recency ranks: c=1, a=2, b=3.
      put("b", "fuse fuse " + "pad ".repeat(5), 1000);
      put("a", "fuse fuse fuse", 2000);
      put("c", "fuse " + "pad ".repeat(30), 3000);
    });
    // RRF: a = 1/61 + 1/62, c = 1/63 + 1/61, b = 1/62 + 1/63 -> a, c, b.
    assert.equal(C.RRF_K, 60);
    const out = await ctxSearch.handler({ queries: ["fuse"], scope: "project" }, mine);
    assert.deepEqual(labelsOf(out.text), ["a", "c", "b"]);
  }));
});
