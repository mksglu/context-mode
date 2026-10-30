// PRD-v2 section 10, GP3, GP6, GP7: the hook process. stdin, entry, dispatch, replace and saving, compaction delivery,
// decisions, errors, throttle and tool names. One file per area (docs/v2/TEST-LAYOUT.md); a describe per ADR/PRD section.
import { test, before, after, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { handleHook } from "../../src/core/hooks/dispatch.ts";
import { ctxSearch } from "../../src/core/tools/search.ts";
import { chunkText } from "../../src/core/index/chunk.ts";
import { getAdapter, ADAPTERS, hasRecall, hasReplace } from "../../src/adapters/table.ts";
import { COMPACT_POINTER_LINE, OUTPUT_CAP, REPLACE_TRIGGER_BYTES, REPLACE_RETURN_BYTES, REPLACE_CHUNK_BYTES, SYNC_INDEX_MAX_BYTES, PENDING_COMPACT_META_PREFIX, DECISION_OPTION_KEY, DECISION_SOURCE, RECALL_BUDGET_BYTES, RECALL_CLOSE_TAG, RECALL_OPEN_TAG, STATE_BUDGET, D5_LAST_HOOK_ERROR, MCP_HINT_EVERY, PARSE_ERROR_DENY_LINE, POLICY_UNREADABLE_LINE, REPLACE_HANDLE_LINE, REQUIRE_SECURITY_ENV, TOOL_ORDER, prefixToolNames } from "../../src/core/contracts/constants.ts";
import { answerDecisions, askOptionLabels, listOptionLabels, optionEchoDecision } from "../../src/core/hooks/decision.ts";
import { decode } from "../../src/adapters/claude-code.ts";
import { openDb, closeDb, withWrite, metaGet } from "../../src/core/store/db.ts";
import { readSessionEvents } from "../../src/core/journal/read.ts";
import { appendDetached } from "../../src/core/hooks/detached.ts";
import { lastHookError, logHookError, hookLogPath } from "../../src/core/hooks/fallback.ts";
import { encode } from "../../src/adapters/kiro.ts";
import { generateManifests } from "../../build/manifests.ts";
import { resolveProject } from "../../src/core/project/resolve.ts";
import { decide } from "../../src/core/policy/decide.ts";
import { decode as copilotDecode } from "../../src/adapters/copilot-cli.ts";
import { READ_DENY_MESSAGE } from "../../src/core/policy/read-deny.ts";
import { pathToFileURL } from "node:url";
import { shouldHint } from "../../src/core/hooks/throttle.ts";
import { renderState } from "../../src/core/compaction/render.ts";

// serial: sets process.env.HOME in before(); process.env is shared by every test in the file
describe("PRD-v2 section 10: dispatch, replace and handle line (GP3, GP6)", () => {
  // Unit tests for src/core/hooks/dispatch.ts (impl/09 §4, ADR-0009 §1 and §6, ADR-0016, DECISIONS-r9 F1;
  // DEVIATIONS D-M3-arch-2, D-M3-arch-3, D-M3-H2-*). handleHook(agent, raw, env) never throws.
  // D-M3-F-9: a hook or detached write keeps its DB handle open by design (A21), and Windows cannot delete
  // an open file, so temp cleanup there is best-effort. The assertions above it are unchanged.
  // D-HL-NAMES-1: hook texts name tools as claude-code calls them (its toolNamePrefix + ctx_*).
  const CCP = getAdapter("claude-code").toolNamePrefix;

  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  let root;
  let repo;
  let oldHome;
  let env;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-dispatch-"));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root; // resolveConfigDir reads the process env (D-M1-T3-5)
    env = { HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo, PATH: process.env.PATH };
    mkdirSync(join(repo, ".claude", "agents"), { recursive: true });
    writeFileSync(join(repo, ".claude", "agents", "reader.md"), "---\nname: reader\ntools: Read\n---\nreads\n");
    writeFileSync(join(repo, ".claude", "agents", "sheller.md"), "---\nname: sheller\ntools: Bash\n---\nruns\n");
  });

  after(() => {
    process.env.HOME = oldHome;
    rmTemp(root);
  });

  function dbFile() {
    const projects = join(root, ".context-mode", "projects");
    if (!existsSync(projects)) return null;
    const keys = readdirSync(projects);
    return keys.length === 0 ? null : join(projects, keys[0], "context.db");
  }

  function query(sql, ...args) {
    const f = dbFile();
    if (f === null || !existsSync(f)) return [];
    const db = new DatabaseSync(f, { readOnly: true });
    try { return db.prepare(sql).all(...args); } finally { db.close(); }
  }

  async function waitRows(sql, args, n) {
    const end = Date.now() + 5000;
    for (;;) {
      const rows = query(sql, ...args);
      if (rows.length >= n || Date.now() > end) return rows;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  function cc(fields) {
    return { session_id: "s-" + Math.random().toString(36).slice(2), cwd: repo, ...fields };
  }

  // D-M7-SV-1: a Bash replace is the Bash output shape {stdout, stderr, interrupted}; other tools get a string.
  function replacedText(v) {
    if (typeof v === "string") return v;
    assert.deepEqual(Object.keys(v).sort(), ["interrupted", "stderr", "stdout"]);
    assert.equal(v.stderr, "");
    assert.equal(v.interrupted, false);
    return v.stdout;
  }

  function parsed(out) {
    assert.equal(out.exitCode, 0);
    return out.stdout === "" ? null : JSON.parse(out.stdout).hookSpecificOutput;
  }

  function captureStderr() {
    const lines = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (c) => { lines.push(String(c)); return true; };
    return { lines, restore: () => { process.stderr.write = orig; } };
  }

  test("unknown agent id: empty stdout, exit 0", async () => {
    assert.deepEqual(await handleHook("nope", {}, env), { stdout: "", exitCode: 0 });
  });

  test("decode failure: allow shape and one stderr line", async () => {
    const cap = captureStderr();
    let out;
    try { out = await handleHook("claude-code", { hook_event_name: "Nope" }, env); } finally { cap.restore(); }
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    assert.equal(cap.lines.length, 1);
    assert.ok(cap.lines[0].startsWith("hooks: decode failed: "));
  });

  test("no project: allow, no hint, no DB", async () => {
    const bare = { HOME: root, USERPROFILE: root, PATH: process.env.PATH };
    const out = await handleHook("claude-code", cc({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "curl https://x.y" } }), bare);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
  });

  test("SessionStart startup: resume hint once per session (GP3/hint-once-per-session)", async () => {
    const p = cc({ hook_event_name: "SessionStart", source: "startup" });
    const first = parsed(await handleHook("claude-code", p, env));
    assert.ok(first.additionalContext.includes("mcp__plugin_context-mode_context-mode__ctx_resume"));
    assert.equal(await handleHook("claude-code", p, env).then((o) => o.stdout), "");
  });

  test("GP6/hint-names-platform-tool: Codex resume hint names mcp__context_mode__ctx_resume", async () => {
    const out = await handleHook("codex", cc({ hook_event_name: "SessionStart", source: "startup" }), env);
    assert.ok(parsed(out).additionalContext.includes("mcp__context_mode__ctx_resume"));
  });

  test("SessionStart compact on claude-code (compactSummary none, D-M7-CL-1): the renderState block, not the pointer", async () => {
    const out = await handleHook("claude-code", cc({ hook_event_name: "SessionStart", source: "compact" }), env);
    const text = parsed(out).additionalContext;
    assert.ok(text.startsWith("<context_mode_state ") && text !== COMPACT_POINTER_LINE, text);
  });

  test("SessionStart compact on codex (compactSummary none): the renderState block, not the pointer (M4, D-M4-H2-4)", async () => {
    const out = await handleHook("codex", cc({ hook_event_name: "SessionStart", source: "compact" }), env);
    const text = parsed(out).additionalContext;
    assert.ok(text.startsWith("<context_mode_state ") && text !== COMPACT_POINTER_LINE, text);
  });

  test("UserPromptSubmit: detached prompt row, allow", async () => {
    const p = cc({ hook_event_name: "UserPromptSubmit", prompt: "find the bug" });
    const out = await handleHook("claude-code", p, env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    const rows = await waitRows("SELECT kind, body, ok FROM events WHERE session_id = ?", [p.session_id], 1);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ kind: "prompt", body: "find the bug", ok: 1 }]);
  });

  test("PreCompact (vscode, pending-flag): sets the pending_compact meta key", async () => {
    // D-HF-VSCODE-PROJECT-1: a vscode hook resolves its project from the payload cwd.
    const p = cc({ hook_event_name: "PreCompact" });
    await handleHook("vscode", p, { ...env, CLAUDE_PROJECT_DIR: "" });
    assert.deepEqual(query("SELECT value FROM meta WHERE key = ?", PENDING_COMPACT_META_PREFIX + p.session_id).map((r) => r.value), ["1"]);
    // No cwd in the payload: no project, so no flag.
    const q = cc({ hook_event_name: "PreCompact", cwd: "" });
    await handleHook("vscode", q, { ...env, CLAUDE_PROJECT_DIR: "" });
    assert.equal(query("SELECT value FROM meta WHERE key = ?", PENDING_COMPACT_META_PREFIX + q.session_id).length, 0);
  });

  test("PreCompact (gemini PreCompress, pending-flag): sets pending_compact:<sid> = 1 (ADR-0009 §6)", async () => {
    const p = cc({ hook_event_name: "PreCompress" });
    const out = await handleHook("gemini", p, env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    const rows = query("SELECT value FROM meta WHERE key = ?", PENDING_COMPACT_META_PREFIX + p.session_id);
    assert.deepEqual(rows.map((r) => r.value), ["1"]);
  });

  // D-M7-RR-1: claude-code now allows curl (run, then replace); codex (no replace) keeps the deny.
  test("PreToolUse curl: deny, never updatedInput (GP3/no-updated-input-rewrite)", async () => {
    const out = parsed(await handleHook("codex", cc({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "curl https://example.com" } }), env));
    assert.equal(out.permissionDecision, "deny");
    assert.equal("updatedInput" in out, false);
  });

  test("PreToolUse ctx_execute: empty stdout, no fields (GP3/no-empty-fields)", async () => {
    const out = await handleHook("claude-code", cc({ hook_event_name: "PreToolUse", tool_name: "mcp__plugin_context-mode_context-mode__ctx_execute", tool_input: { language: "shell", code: "ls" } }), env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
  });

  // D-M7-RR-2 (owner decision 2026-10-20): no PreToolUse/PostToolUse hint on any row; these were hint tests.
  test("PreToolUse Bash, Grep, Read, other MCP: empty allow, no hint, every call (D-M7-RR-2)", async () => {
    const calls = [
      ["Bash", { command: "ls" }], ["Bash", { command: "npm test" }], ["Grep", { pattern: "x" }],
      ["Read", { file_path: join(repo, "nope.txt") }], ["mcp__foo__bar", {}],
    ];
    for (const [tool_name, tool_input] of calls) {
      const p = cc({ hook_event_name: "PreToolUse", tool_name, tool_input });
      for (let i = 0; i < 3; i++) assert.deepEqual(await handleHook("claude-code", p, env), { stdout: "", exitCode: 0 }, tool_name);
    }
  });

  test("PostToolUse at or under REPLACE_TRIGGER_BYTES: empty allow, zero added bytes (D-M7-RR-1, D-M7-SV-1)", async () => {
    for (const agent of ["claude-code", "codex"]) {
      const p = cc({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "x".repeat(REPLACE_TRIGGER_BYTES - 10), stderr: "" } });
      assert.deepEqual(await handleHook(agent, p, env), { stdout: "", exitCode: 0 }, agent);
    }
  });

  test("GP3/tool-prefix-standalone-mcp: Qwen PreToolUse shell gets no hint (D-M7-RR-2)", async () => {
    const out = await handleHook("qwen", cc({ hook_event_name: "PreToolUse", tool_name: "run_shell_command", tool_input: { command: "ls" } }), { ...env });
    assert.equal(out.stdout, "");
  });

  test("GP6/no-false-shell-error-capture: Bash exit 0 with 'Error' text is a cmd row, ok 1", async () => {
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo  'Error: none'" }, tool_response: "Error: none" });
    await handleHook("claude-code", p, env);
    const rows = await waitRows("SELECT kind, ok, key, exit_code FROM events WHERE session_id = ?", [p.session_id], 1);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ kind: "cmd", ok: 1, key: "Bash:echo 'Error: none'", exit_code: null }]);
  });

  test("PostToolUse failure: toolerr row with stable JSON key and the Exit code digits", async () => {
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "Grep", tool_input: { pattern: "x", path: "src" }, tool_response: { is_error: true, content: "Exit code 2\nboom" } });
    await handleHook("claude-code", p, env);
    const rows = await waitRows("SELECT kind, ok, key, path FROM events WHERE session_id = ?", [p.session_id], 1);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ kind: "toolerr", ok: 0, key: 'Grep:{"path":"src","pattern":"x"}', path: "src" }]);
  });

  test("PostToolUse Edit: edit row with the file path", async () => {
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: "/a/b.ts" }, tool_response: "ok" });
    await handleHook("claude-code", p, env);
    const rows = await waitRows("SELECT kind, path FROM events WHERE session_id = ?", [p.session_id], 1);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ kind: "edit", path: "/a/b.ts" }]);
  });

  test("PostToolUse: clean Read and own ctx_* tool write no row (A25, ADR-0009 §0)", async () => {
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "/x" }, tool_response: "text" });
    const q = cc({ hook_event_name: "PostToolUse", tool_name: "mcp__plugin_context-mode_context-mode__ctx_search", tool_input: {}, tool_response: "x" });
    await handleHook("claude-code", p, env);
    await handleHook("claude-code", q, env);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(query("SELECT 1 FROM events WHERE session_id IN (?, ?)", p.session_id, q.session_id).length, 0);
  });

  function bigText(bytes) {
    const lines = [];
    let n = 0;
    for (let i = 0; n < bytes; i++) {
      const l = "line " + i + (i % 50 === 0 ? " needle target" : " filler words here") + "\n";
      lines.push(l);
      n += l.length;
    }
    return lines.join("");
  }

  function subagentPost(text, type) {
    return cc({ hook_event_name: "PostToolUse", agent_id: "sub-1", agent_type: type, tool_name: "Read", tool_input: { file_path: "/big.log", description: "needle target" }, tool_response: text });
  }

  test("case C under OUTPUT_CAP: allow, nothing indexed", async () => {
    const out = await handleHook("claude-code", subagentPost("small", "reader"), env);
    assert.equal(out.stdout, "");
  });

  test("case C, OUTPUT_CAP < bytes <= SYNC_INDEX_MAX_BYTES: indexed inline, whole chunks replace (F1)", async () => {
    const text = bigText(40000);
    const p = subagentPost(text, "reader");
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = out.updatedToolOutput;
    assert.ok(Buffer.byteLength(replaced) <= REPLACE_RETURN_BYTES + 512, "within budget plus the more line");
    assert.ok(replaced.includes("needle target"));
    const src = query("SELECT label, bytes_total FROM sources WHERE session_id = ?", p.session_id);
    // bytes_total is the sum of chunk bytes (store rule): the trailing newline is not a chunk byte.
    assert.equal(src.length, 1);
    assert.equal(src[0].label, "subagent:Read:0");
    assert.ok(src[0].bytes_total >= Buffer.byteLength(text) - 1, "the whole text is indexed, nothing cut");
    // Whole chunks only: the selected chunks, joined by one "\n", make up the body byte for byte.
    const body = replaced.slice(0, replaced.lastIndexOf("\n" + CCP + "ctx_search(") < 0 ? replaced.length : replaced.lastIndexOf("\n" + CCP + "ctx_search("));
    const whole = chunkText(text, "text", REPLACE_CHUNK_BYTES).filter((c) => body.includes(c.text));
    assert.ok(whole.length > 0);
    const joined = whole.reduce((n, c) => n + Buffer.byteLength(c.text), 0) + whole.length - 1;
    assert.equal(joined, Buffer.byteLength(body), "the body is whole chunks, nothing cut");
  });

  test("case C, bytes > SYNC_INDEX_MAX_BYTES: in-memory selection, detached index (F1)", async () => {
    const text = bigText(SYNC_INDEX_MAX_BYTES * 2);
    const p = subagentPost(text, "reader");
    const out = parsed(await handleHook("claude-code", p, env));
    assert.ok(Buffer.byteLength(out.updatedToolOutput) <= REPLACE_RETURN_BYTES + 512);
    assert.ok(out.updatedToolOutput.includes("needle target"));
    const src = await waitRows("SELECT label FROM sources WHERE session_id = ?", [p.session_id], 1);
    assert.equal(src.length, 1);
  });

  test("case B PreToolUse deny: reason names run.mjs next to the hook bundle (D-M3-arch-3)", async () => {
    const cmd = "curl https://example.com/data";
    const p = cc({ hook_event_name: "PreToolUse", agent_id: "sub-2", agent_type: "sheller", tool_name: "Bash", tool_input: { command: cmd } });
    const out = parsed(await handleHook("claude-code", p, env));
    assert.equal(out.permissionDecision, "deny");
    const first = out.permissionDecisionReason.split("\n")[0];
    assert.ok(first.startsWith("node \""));
    assert.ok(first.includes(sep + "run.mjs\" " + Buffer.from(cmd).toString("base64url") + " "));
    // D-M3-F-7: the rest is the case-B text (drafts.md deny-subagent-run); it names no ctx_* tool the subagent lacks.
    const md = readFileSync(new URL("../../docs/v2/prompt/drafts.md", import.meta.url), "utf8");
    const at = md.indexOf("<!-- id: deny-subagent-run -->");
    const open = md.indexOf("```text\n", at) + "```text\n".length;
    assert.ok(at >= 0);
    assert.equal(out.permissionDecisionReason.slice(first.length + 1), md.slice(open, md.indexOf("\n```", open)));
    assert.equal(out.permissionDecisionReason.includes("ctx_"), false);
  });

  test("case A subagent (no agent file, inherits ctx tools): same deny as the main session", async () => {
    const p = cc({ hook_event_name: "PreToolUse", agent_id: "sub-3", tool_name: "Bash", tool_input: { command: "curl https://example.com" } });
    const out = parsed(await handleHook("claude-code", p, env));
    assert.equal(out.permissionDecision, "deny");
    assert.equal(out.permissionDecisionReason.startsWith("node "), false);
  });

  // ---------- D-M7-RR-1: main agent "run, then replace" (owner decision 2026-10-20) ----------

  function mainBashPost(stdout, description = "needle target") {
    return cc({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "cat big.log", description }, tool_use_id: "toolu_" + Math.random().toString(36).slice(2), tool_response: { stdout, stderr: "", interrupted: false, isImage: false } });
  }

  function searchCtx(sessionId) {
    const f = dbFile();
    const projectDir = join(f, "..");
    const projectKey = projectDir.split(sep).pop();
    return {
      project: { projectKey, projectDir, dbPath: f, worktree: repo, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
      sessionId, turn: 1, signal: new AbortController().signal,
    };
  }

  test("D-M7-RR-1: main-agent Bash over OUTPUT_CAP on claude-code: selected whole chunks + more line, full output indexed", async () => {
    const text = bigText(40000);
    const p = mainBashPost(text);
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = replacedText(out.updatedToolOutput);
    assert.equal(typeof replaced, "string");
    assert.ok(Buffer.byteLength(replaced) <= REPLACE_RETURN_BYTES + 512, "within budget plus the more line");
    assert.ok(Buffer.byteLength(replaced) < Buffer.byteLength(text));
    assert.ok(replaced.includes("needle target"));
    const more = replaced.lastIndexOf("\n" + CCP + "ctx_search(");
    assert.ok(more > 0, "the more line names ctx_search");
    const body = replaced.slice(0, more);
    // Whole chunks of the plain stdout (not the JSON tool_response): nothing cut, no escaped newlines.
    const whole = chunkText(text, "text", REPLACE_CHUNK_BYTES).filter((c) => body.includes(c.text));
    assert.ok(whole.length > 0);
    const joined = whole.reduce((n, c) => n + Buffer.byteLength(c.text), 0) + whole.length - 1;
    assert.equal(joined, Buffer.byteLength(body), "the body is whole chunks, nothing cut");
    const src = query("SELECT id, label, bytes_total FROM sources WHERE session_id = ?", p.session_id);
    assert.equal(src.length, 1);
    // D-CR3-HANDLE-1: the more line names the stored source by its short id (ctx_search resolves it to the label).
    assert.ok(replaced.slice(more).includes(JSON.stringify("s" + Number(src[0].id).toString(36))), "the more line names the source id");
    assert.ok(src[0].bytes_total >= Buffer.byteLength(text) - 1, "the whole output is indexed, nothing cut");
    // The full output is findable: a chunk the replace dropped comes back from ctx_search, by a line only it holds.
    const all = chunkText(text, "text", REPLACE_CHUNK_BYTES);
    // D-M7-SV-1: with small chunks the first dropped chunk holds one-digit line numbers, which are not a
    // distinct query; take the first dropped chunk with a line number of 3+ digits (same assertion below).
    const gone = all.find((c) => !body.includes(c.text) && /^line \d{3,} filler/m.test(c.text));
    assert.ok(gone !== undefined, "some chunk was not in the replaced text");
    // D-M7-SV-3: a 48-byte chunk holds one or two whole lines, so the probe line may be the chunk's first line.
    const inner = gone.text.split("\n").find((l) => /^line \d{3,} filler/.test(l));
    const num = inner.split(" ")[1];
    const r = await ctxSearch.handler({ queries: ["line " + num + " filler"], scope: "session", source: src[0].label }, searchCtx(p.session_id));
    assert.equal(r.isError, false, r.text);
    assert.ok(r.text.includes(src[0].label + " #" + gone.ord + ":"), "ctx_search finds the dropped chunk: ord " + gone.ord + " num " + num + "\n" + r.text.slice(0, 600));
  });

  test("D-M7-RR-3: no Bash description: the intent is the command text, never an empty query", async () => {
    const p = mainBashPost(bigText(40000), undefined);
    delete p.tool_input.description;
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = replacedText(out.updatedToolOutput);
    const more = replaced.slice(replaced.lastIndexOf("\n" + CCP + "ctx_search("));
    assert.ok(!more.includes('[""]'), "the more line has no empty query: " + more);
    assert.ok(more.includes("cat big.log"), "the more line queries the command text: " + more);
  });

  test("D-M7-RR-3: no description on Read, Grep, WebFetch: file path, pattern, URL are the intent", async () => {
    for (const [tool, input, want] of [["Read", { file_path: "/tmp/big.log" }, "/tmp/big.log"], ["Grep", { pattern: "needle target" }, "needle target"], ["WebFetch", { url: "https://example.com/x" }, "https://example.com/x"]]) {
      const p = cc({ hook_event_name: "PostToolUse", tool_name: tool, tool_input: input, tool_use_id: "toolu_" + tool, tool_response: bigText(40000) });
      const out = parsed(await handleHook("claude-code", p, env));
      if (typeof out.updatedToolOutput !== "string") continue; // row has no replace channel for this tool
      const replaced = out.updatedToolOutput;
      const more = replaced.slice(replaced.lastIndexOf("\n" + CCP + "ctx_search("));
      assert.ok(!more.includes('[""]'), tool + ": no empty query: " + more);
      assert.ok(more.includes(want), tool + ": the more line queries " + want + ": " + more);
    }
  });

  test("D-M7-RR-1: main-agent replace above SYNC_INDEX_MAX_BYTES: in-memory selection, detached index", async () => {
    const text = bigText(SYNC_INDEX_MAX_BYTES * 2);
    const p = mainBashPost(text);
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = replacedText(out.updatedToolOutput);
    assert.ok(Buffer.byteLength(replaced) <= REPLACE_RETURN_BYTES + 512);
    assert.ok(replaced.includes("needle target"));
    const src = await waitRows("SELECT label FROM sources WHERE session_id = ?", [p.session_id], 1);
    assert.equal(src.length, 1);
  });

  test("D-M7-SV-1: a 4-16K Bash output is replaced by at most REPLACE_RETURN_BYTES of whole small chunks plus the more line", async () => {
    const text = bigText(REPLACE_TRIGGER_BYTES * 2);
    const p = mainBashPost(text);
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = replacedText(out.updatedToolOutput);
    const more = replaced.lastIndexOf("\n" + CCP + "ctx_search(");
    assert.ok(more > 0, "the more line names ctx_search");
    assert.ok(Buffer.byteLength(replaced.slice(0, more)) <= REPLACE_RETURN_BYTES);
    assert.ok(replaced.includes("needle target"));
    for (const c of chunkText(text, "text", REPLACE_CHUNK_BYTES)) assert.ok(c.bytes <= REPLACE_CHUNK_BYTES);
  });

  test("D-M7-SV-1: small chunks drop no byte: chunk bytes sum to the text bytes; the default chunking is unchanged", () => {
    const text = bigText(20000);
    const small = chunkText(text, "text", REPLACE_CHUNK_BYTES);
    assert.equal(small.reduce((n, c) => n + c.bytes, 0) + 1, Buffer.byteLength(text), "only the final newline is not a chunk byte");
    assert.deepEqual(chunkText(text, "text", 1 << 30), chunkText(text, "text"));
  });

  test("D-M2-MCP-1: a large non-ctx MCP result on claude-code is replaced by one text block; the full text is indexed", async () => {
    const text = bigText(40000);
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "mcp__tix__list_tickets", tool_input: { description: "needle target" }, tool_use_id: "toolu_m1", tool_response: [{ type: "text", text }] });
    const out = parsed(await handleHook("claude-code", p, env));
    assert.ok(Array.isArray(out.updatedToolOutput) && out.updatedToolOutput.length === 1 && out.updatedToolOutput[0].type === "text");
    const replaced = out.updatedToolOutput[0].text;
    assert.ok(Buffer.byteLength(replaced) <= REPLACE_RETURN_BYTES + 512 && replaced.includes("needle target"));
    assert.equal(query("SELECT 1 FROM sources WHERE session_id = ?", p.session_id).length, 1);
  });

  test("D-M2-MCP-1: an MCP result with an image block, or a small one, stays as the host made it", async () => {
    const big = bigText(40000);
    const withImage = cc({ hook_event_name: "PostToolUse", tool_name: "mcp__tix__shot", tool_input: {}, tool_response: [{ type: "text", text: big }, { type: "image", data: "AAAA", mimeType: "image/png" }] });
    assert.deepEqual(await handleHook("claude-code", withImage, env), { stdout: "", exitCode: 0 });
    const small = cc({ hook_event_name: "PostToolUse", tool_name: "mcp__tix__get", tool_input: {}, tool_response: [{ type: "text", text: "tiny" }] });
    assert.deepEqual(await handleHook("claude-code", small, env), { stdout: "", exitCode: 0 });
  });

  test("D-M2-MCP-1: a large Grep content result keeps the Grep shape and swaps content", async () => {
    const resp = { mode: "content", numFiles: 0, filenames: [], content: bigText(40000), numLines: 900, totalLines: 900, appliedLimit: 250 };
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "Grep", tool_input: { pattern: "needle target" }, tool_use_id: "toolu_g1", tool_response: resp });
    const out = parsed(await handleHook("claude-code", p, env));
    const u = out.updatedToolOutput;
    assert.deepEqual({ ...u, content: 0 }, { ...resp, content: 0 });
    assert.ok(Buffer.byteLength(u.content) < Buffer.byteLength(resp.content) && u.content.includes("needle target"));
  });

  test("D-M7-RR-1: rows with no replace (codex, qwen) keep their one path: large PostToolUse is the empty allow", async () => {
    for (const agent of ["codex", "qwen"]) {
      const p = mainBashPost(bigText(40000));
      const out = await handleHook(agent, p, env);
      assert.deepEqual(out, { stdout: "", exitCode: 0 }, agent);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(query("SELECT 1 FROM sources WHERE session_id = ?", p.session_id).length, 0, agent + ": nothing indexed");
    }
  });

  test("D-M7-RR-1: main-agent PreToolUse curl on claude-code is allowed (replace takes over); codex still denies", async () => {
    const p = cc({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "curl -s https://x.io/a.json" } });
    assert.deepEqual(await handleHook("claude-code", p, env), { stdout: "", exitCode: 0 });
    const c = parsed(await handleHook("codex", p, env));
    assert.equal(c.permissionDecision, "deny");
  });

  test("D-M7-RR-1: user policy deny and Read deny unchanged on claude-code", async () => {
    mkdirSync(join(repo, ".claude"), { recursive: true });
    const settings = join(repo, ".claude", "settings.json");
    const had = existsSync(settings) ? readFileSync(settings, "utf8") : null;
    writeFileSync(settings, JSON.stringify({ permissions: { deny: ["Bash(rm -rf:*)"] } }));
    try {
      const d = parsed(await handleHook("claude-code", cc({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "rm -rf build" } }), env));
      assert.equal(d.permissionDecision, "deny");
      assert.ok(d.permissionDecisionReason.includes("Bash(rm -rf:*)"));
    } finally {
      if (had === null) rmSync(settings); else writeFileSync(settings, had);
    }
    const big = join(repo, "big-read.log");
    writeFileSync(big, "x".repeat(OUTPUT_CAP * 4));
    const r = parsed(await handleHook("claude-code", cc({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: big } }), env));
    assert.equal(r.permissionDecision, "deny");
  });

  test("D-M7-SV-2: the replace return budget is at most 512 bytes, a constant of its own under OUTPUT_CAP; a 16K output keeps the intent chunk", async () => {
    assert.ok(REPLACE_RETURN_BYTES <= 512, "D-M7-SV-3 pins the exact value");
    assert.ok(REPLACE_RETURN_BYTES < OUTPUT_CAP && REPLACE_RETURN_BYTES >= 2 * REPLACE_CHUNK_BYTES, "at least two whole chunks fit");
    const text = bigText(16000);
    const out = parsed(await handleHook("claude-code", mainBashPost(text), env));
    const replaced = replacedText(out.updatedToolOutput);
    const more = replaced.lastIndexOf("\n" + CCP + "ctx_search(");
    assert.ok(more > 0, "the more line names ctx_search");
    assert.ok(Buffer.byteLength(replaced.slice(0, more)) <= 512);
    assert.ok(replaced.includes("needle target"));
  });

  test("D-M7-SV-3: return budget 96 and chunk cap 48; two whole chunks fit; a 16K output keeps the intent line and drops no byte", async () => {
    assert.equal(REPLACE_RETURN_BYTES, 96);
    assert.equal(REPLACE_CHUNK_BYTES, 48);
    assert.ok(REPLACE_RETURN_BYTES >= 2 * REPLACE_CHUNK_BYTES, "at least two whole chunks fit");
    const text = bigText(16000);
    const out = parsed(await handleHook("claude-code", mainBashPost(text), env));
    const replaced = replacedText(out.updatedToolOutput);
    const more = replaced.lastIndexOf("\n" + CCP + "ctx_search(");
    assert.ok(more > 0, "the more line names ctx_search");
    assert.ok(Buffer.byteLength(replaced.slice(0, more)) <= 96);
    assert.ok(replaced.includes("needle target"));
    const chunks = chunkText(text, "text", REPLACE_CHUNK_BYTES);
    for (const c of chunks) assert.ok(c.bytes <= 48);
    assert.equal(chunks.reduce((n, c) => n + c.bytes, 0) + 1, Buffer.byteLength(text), "only the final newline is not a chunk byte");
    const fail = "FAIL suite/gamma/case_1234_abc123 (12ms) expected 3 got 4\n";
    const log = bigText(8000) + fail + bigText(2000);
    assert.ok(chunkText(log, "text", REPLACE_CHUNK_BYTES).some((c) => c.text.includes("FAIL suite/gamma/case_1234_abc123")), "a test id stays in one chunk");
  });

  // D-M7-SV-5: the replace ranks chunks by the tool intent OR the words of the session's last user prompt,
  // so a cat whose command names no content term still returns the line the user asked for.
  test("D-M7-SV-5: the replace selection also ranks by the last user prompt; budget, more line and indexing unchanged", async () => {
    const p = cc({ hook_event_name: "UserPromptSubmit", prompt: 'Run cat on data/part1.txt. Find the line starting with SECRET-1 and read the value after "value=".' });
    await handleHook("claude-code", p, env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'prompt'", [p.session_id], 1);
    const text = bigText(8000) + "SECRET-1 value=qz7k2m9x\n" + bigText(8000);
    const post = { ...mainBashPost(text, ""), session_id: p.session_id };
    post.tool_input = { command: "cat data/part1.txt" };
    const out = parsed(await handleHook("claude-code", post, env));
    const replaced = replacedText(out.updatedToolOutput);
    const more = replaced.lastIndexOf("\n" + CCP + "ctx_search(");
    assert.ok(more > 0, "the more line names ctx_search");
    assert.ok(Buffer.byteLength(replaced.slice(0, more)) <= REPLACE_RETURN_BYTES);
    assert.ok(replaced.includes("SECRET-1 value=qz7k2m9x"), "the prompt term selects the asked-for line");
    assert.ok(replaced.slice(more).includes(JSON.stringify("cat data/part1.txt")), "the more line keeps the tool intent");
    // No prompt in the session: the selection is the tool intent alone, as before.
    const q = mainBashPost(text, "");
    q.tool_input = { command: "cat data/part1.txt" };
    const alone = replacedText(parsed(await handleHook("claude-code", q, env)).updatedToolOutput);
    assert.equal(alone.includes("SECRET-1 value=qz7k2m9x"), false, "without a prompt the newest chunks win, as before");
  });

  // D-M2-SHAPE-2: the host persisted the whole output; the hook gets a head only. Dispatch reads the whole file.
  test("D-M2-SHAPE-2: a persisted Bash output is indexed and shaped whole; an unreadable file keeps the head", async () => {
    const lines = Array.from({ length: 1500 }, (_, i) => (i === 900 ? "SECRET-2 value=late9x7q" : "row " + i + " a" + i + " b" + i));
    const full = lines.join("\n") + "\n";
    const head = lines.slice(0, 600).join("\n") + "\n";
    const dir = mkdtempSync(join(tmpdir(), "persist-"));
    try {
      const file = join(dir, "out.txt");
      writeFileSync(file, full);
      const u = cc({ hook_event_name: "UserPromptSubmit", prompt: "Run cat on data/part2.txt. Find the line starting with SECRET-2." });
      await handleHook("claude-code", u, env);
      await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'prompt'", [u.session_id], 1);
      const p = { ...mainBashPost(head, ""), session_id: u.session_id };
      p.tool_input = { command: "cat data/part2.txt" };
      p.tool_response = { stdout: head, stderr: "", interrupted: false, persistedOutputPath: file, persistedOutputSize: Buffer.byteLength(full) };
      const replaced = replacedText(parsed(await handleHook("claude-code", p, env)).updatedToolOutput);
      assert.ok(replaced.includes("SECRET-2 value=late9x7q"), "the line past the head comes back: " + replaced);
      const src = await waitRows("SELECT bytes_total FROM sources WHERE session_id = ?", [p.session_id], 1);
      assert.ok(src[0].bytes_total >= Buffer.byteLength(full) - 1, "the whole file is indexed");
      const q = mainBashPost(head, "");
      q.tool_input = { command: "cat data/part2.txt" };
      q.tool_response = { stdout: head, stderr: "", interrupted: false, persistedOutputPath: join(dir, "none.txt"), persistedOutputSize: Buffer.byteLength(full) };
      const out = replacedText(parsed(await handleHook("claude-code", q, env)).updatedToolOutput);
      assert.equal(out.includes("late9x7q"), false, "unreadable file: the head only");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // D-CR3-HANDLE-1 (replaces D-CR2-HANDLE-1): every replacement ends with one handle line: the exact ctx_search
  // call over the stored source by its short id, and the full size. The line counts inside the budget, so a
  // replace is never larger than the 18e4a6cd form (selection within REPLACE_RETURN_BYTES + the more line).
  test("D-CR3-HANDLE-1: golden handle line: short id, exact call, full size, inside the 18e4a6cd byte bound", async () => {
    const { lintPromptText } = await import("../../docs/v2/prompt/lint.mjs");
    const { moreLine } = await import("../../src/core/index/select.ts");
    const text = bigText(40000);
    const p = mainBashPost(text);
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = replacedText(out.updatedToolOutput);
    const src = query("SELECT id, label, bytes_total FROM sources WHERE session_id = ?", p.session_id);
    assert.equal(src.length, 1);
    const id = "s" + Number(src[0].id).toString(36);
    const nl = replaced.lastIndexOf("\n");
    assert.ok(nl > 0, "a body, then the handle line");
    const intent = p.tool_input.description ?? p.tool_input.command;
    const golden = CCP + "ctx_search({queries:[" + JSON.stringify(intent) + "], source:" + JSON.stringify(id) + "}) searches the whole output (" + Buffer.byteLength(text) + " B).";
    assert.equal(replaced.slice(nl + 1), golden);
    assert.equal(replaced.split("\n" + CCP + "ctx_search(").length, 2, "one call line, no second more line: " + replaced);
    for (const r of lintPromptText(golden)) assert.ok(r.ok, r.rule + " " + JSON.stringify(r.matches));
    const bound = REPLACE_RETURN_BYTES + Buffer.byteLength("\n" + moreLine(intent, src[0].label));
    assert.ok(Buffer.byteLength(replaced) <= bound, Buffer.byteLength(replaced) + " > " + bound);
  });

  test("D-CR3-HANDLE-1: a subagent replacement carries the same handle line", async () => {
    const text = bigText(40000);
    const p = cc({ hook_event_name: "PostToolUse", tool_name: "Read", agent_id: "a1", agent_type: "general-purpose", tool_input: { file_path: "/tmp/big.log" }, tool_use_id: "toolu_sub", tool_response: text });
    const out = parsed(await handleHook("claude-code", p, env));
    if (out === null || typeof out.updatedToolOutput !== "string") return; // no subagent replace for this shape
    const replaced = out.updatedToolOutput;
    const src = query("SELECT id FROM sources WHERE session_id = ?", p.session_id);
    assert.equal(src.length, 1);
    const last = replaced.slice(replaced.lastIndexOf("\n") + 1);
    assert.ok(last.includes(", source:" + JSON.stringify("s" + Number(src[0].id).toString(36)) + "})"), last);
    assert.ok(last.endsWith("(" + Buffer.byteLength(text) + " B)."), last);
  });

  // D-CR3-HANDLE-2: above SYNC_INDEX_MAX_BYTES the source row id is reserved before the detached write, so the
  // handle is the short id too (not the full label) and the selection budget stays above 0.
  test("D-CR3-HANDLE-2: a > SYNC_INDEX_MAX_BYTES output: the handle is the short id of the stored row, the body keeps chunks", async () => {
    const { moreLine } = await import("../../src/core/index/select.ts");
    const text = bigText(SYNC_INDEX_MAX_BYTES * 2);
    const p = mainBashPost(text);
    const out = parsed(await handleHook("claude-code", p, env));
    const replaced = replacedText(out.updatedToolOutput);
    const src = query("SELECT id, label FROM sources WHERE session_id = ?", p.session_id);
    assert.equal(src.length, 1, "the source row exists when the hook returns");
    const id = "s" + Number(src[0].id).toString(36);
    const nl = replaced.lastIndexOf("\n");
    assert.ok(nl > 0, "a body, then the handle line");
    const intent = p.tool_input.description;
    assert.equal(replaced.slice(nl + 1), CCP + "ctx_search({queries:[" + JSON.stringify(intent) + "], source:" + JSON.stringify(id) + "}) searches the whole output (" + Buffer.byteLength(text) + " B).");
    assert.ok(Buffer.byteLength(replaced.slice(0, nl)) > 0 && replaced.slice(0, nl).includes("needle target"), "the selection budget is not 0");
    const bound = REPLACE_RETURN_BYTES + Buffer.byteLength("\n" + moreLine(intent, src[0].label));
    assert.ok(Buffer.byteLength(replaced) <= bound, Buffer.byteLength(replaced) + " > " + bound);
    const chunks = await waitRows("SELECT ord FROM chunks WHERE source_id = ?", [src[0].id], 1);
    assert.ok(chunks.length > 0, "the detached write stores the chunks under the reserved id");
    const units = await waitRows("SELECT ord FROM line_units WHERE source_id = ?", [src[0].id], 1);
    assert.ok(units.length > 0, "the detached write stores the line units under the reserved id");
  });

  // D-M2-JSON-1: a JSON output above the sync-index limit has the full label as its handle (a long line). The
  // digest budget does not depend on the handle line, so the rare row the prompt names still comes back whole.
  test("D-M2-JSON-1: a 200 KB JSON cat returns the rare row whole next to a long handle line", async () => {
    const rows = Array.from({ length: 900 }, (_, i) => ({ id: "ord-" + i, region: "north", amount: i * 3 + 1, priority: i === 411, items: ["a", "b"], note: "some filler words number " + i }));
    const text = JSON.stringify(rows, null, 2);
    assert.ok(Buffer.byteLength(text) > SYNC_INDEX_MAX_BYTES);
    const pr = cc({ hook_event_name: "UserPromptSubmit", prompt: 'Exactly one order has "priority": true. Give three times its "amount".' });
    await handleHook("claude-code", pr, env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'prompt'", [pr.session_id], 1);
    const post = { ...mainBashPost(text, ""), session_id: pr.session_id };
    post.tool_input = { command: "cat data/orders.json" };
    const replaced = replacedText(parsed(await handleHook("claude-code", post, env)).updatedToolOutput);
    assert.ok(replaced.includes('"amount":1234,"priority":true'), replaced);
    assert.ok(replaced.split("\n")[0].includes("{id,region,amount,priority,items,note}"), replaced);
    const nl = replaced.lastIndexOf("\n" + CCP + "ctx_search(");
    assert.ok(Buffer.byteLength(replaced.slice(0, nl)) <= 256, "digest within SHAPE_RETURN_BYTES");
  });

  // D-R4-BUDGET-1: at selection budget 0 the replace is the handle line alone, with no leading newline.
  // Through dispatch the budget is never 0 (chunks are at most REPLACE_CHUNK_BYTES, the budget is at least
  // REPLACE_RETURN_BYTES - 35), so the join step is tested directly, plus one end-to-end check of the normal join.
  test("D-R4-BUDGET-1: replaceOutput with an empty body is the handle line alone, no leading newline", async () => {
    const { replaceOutput } = await import("../../src/core/hooks/dispatch.ts");
    const line = "ctx_search({queries:[\"q\"], source:\"s1\"}) searches the whole output (9 B).";
    assert.equal(replaceOutput("", line), line);
    assert.equal(replaceOutput("body", line), "body\n" + line);
  });

  test("D-R4-BUDGET-1: end-to-end a replace never starts with a newline and ends with the handle line after one newline", async () => {
    const out = parsed(await handleHook("claude-code", mainBashPost(bigText(40000), "needle target"), env));
    const replaced = replacedText(out.updatedToolOutput);
    assert.ok(!replaced.startsWith("\n"), JSON.stringify(replaced.slice(0, 40)));
    assert.equal(replaced.split("\n" + CCP + "ctx_search(").length, 2, "body, newline, one handle line");
  });

  test("D-R4-BUDGET-1: replaceBudget is 0 when the handle line is longer than the more line plus REPLACE_RETURN_BYTES", async () => {
    const { replaceBudget } = await import("../../src/core/hooks/dispatch.ts");
    const more = "ctx_search({queries:[\"a\"], source:\"l\"})";
    assert.equal(replaceBudget("\n" + "x".repeat(REPLACE_RETURN_BYTES + 500), more), 0);
    assert.ok(replaceBudget("\nshort", more) > 0);
  });
});

// serial: sets process.env.HOME in before(); process.env is shared by every test in the file
describe("PRD-v2 section 10: compaction delivery, recall and decision rows (GP6)", () => {
  // Unit tests for the M4 branches of src/core/hooks/dispatch.ts: compactSummary "none" delivery through
  // renderState (impl/09 §4.3 step 1.2-1.3, §4.4 step 2.4; DECISIONS-r6 D6) and the ADR-0009 §8.2 decision
  // rows (DECISIONS-r6 D3; DEVIATIONS D-M4-arch-5, D-M4-H2-1..3).
  let root;
  let repo;
  let oldHome;
  let env;

  // A hook keeps its DB handle open by design (A21); Windows cannot delete an open file (D-M3-F-9).
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-dispatch-compact-"));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root; // resolveConfigDir reads the process env (D-M1-T3-5)
    env = { HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo, PATH: process.env.PATH };
  });

  after(() => {
    process.env.HOME = oldHome;
    rmTemp(root);
  });

  function dbFile() {
    const projects = join(root, ".context-mode", "projects");
    if (!existsSync(projects)) return null;
    const keys = readdirSync(projects);
    return keys.length === 0 ? null : join(projects, keys[0], "context.db");
  }

  function query(sql, ...args) {
    const f = dbFile();
    if (f === null || !existsSync(f)) return [];
    const db = new DatabaseSync(f, { readOnly: true });
    try { return db.prepare(sql).all(...args).map((r) => ({ ...r })); } finally { db.close(); }
  }

  async function waitRows(sql, args, n) {
    const end = Date.now() + 5000;
    for (;;) {
      const rows = query(sql, ...args);
      if (rows.length >= n || Date.now() > end) return rows;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  const settle = () => new Promise((r) => setTimeout(r, 150));

  function sid() {
    return "s-" + Math.random().toString(36).slice(2);
  }

  function payload(sessionId, fields) {
    return { session_id: sessionId, cwd: repo, ...fields };
  }

  function context(out) {
    assert.equal(out.exitCode, 0);
    return out.stdout === "" ? null : JSON.parse(out.stdout).hookSpecificOutput.additionalContext;
  }

  function isStateBlock(text) {
    return text.startsWith("<context_mode_state ") && text.endsWith("</context_mode_state>")
      && Buffer.byteLength(text, "utf8") <= STATE_BUDGET;
  }

  const decisionsOf = (s) => query("SELECT key, body, tool, ok FROM events WHERE session_id = ? AND kind = 'decision' ORDER BY seq", s);

  // ---------- compactSummary "none" (DECISIONS-r6 D6) ----------

  test("[M4] SessionStart(compact) on codex (none): the renderState block, once per session (A23)", async () => {
    const s = sid();
    await handleHook("codex", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "fix the flaky login test" }), env);
    await waitRows("SELECT seq FROM events WHERE session_id = ?", [s], 1);
    const text = context(await handleHook("codex", payload(s, { hook_event_name: "SessionStart", source: "compact" }), env));
    assert.ok(text !== null && isStateBlock(text), String(text));
    assert.notEqual(text, COMPACT_POINTER_LINE);
    assert.ok(text.includes("fix the flaky login test"), text);
    assert.ok(text.includes('session="' + s + '"'), text);
    const again = await handleHook("codex", payload(s, { hook_event_name: "SessionStart", source: "compact" }), env);
    assert.equal(again.stdout, "");
  });

  test("[M4] SessionStart(compact) on codex with an empty journal: the empty state block, never a throw", async () => {
    const text = context(await handleHook("codex", payload(sid(), { hook_event_name: "SessionStart", source: "compact" }), env));
    assert.ok(text !== null && isStateBlock(text), String(text));
  });

  test("[M4] SessionStart(compact) on claude-code (none, D-M7-CL-1) delivers the state block, not the pointer", async () => {
    const text = context(await handleHook("claude-code", payload(sid(), { hook_event_name: "SessionStart", source: "compact" }), env));
    assert.ok(text !== null && isStateBlock(text), String(text));
    assert.notEqual(text, COMPACT_POINTER_LINE);
  });

  test("[M4] GP6/compact-summary-none: gemini PreCompress then BeforeAgent delivers the block once", async () => {
    const s = sid();
    await handleHook("gemini", payload(s, { hook_event_name: "BeforeAgent", prompt: "rename the config loader" }), env);
    await waitRows("SELECT seq FROM events WHERE session_id = ?", [s], 1);
    await handleHook("gemini", payload(s, { hook_event_name: "PreCompress" }), env);
    const text = context(await handleHook("gemini", payload(s, { hook_event_name: "BeforeAgent", prompt: "go on" }), env));
    assert.ok(text !== null && isStateBlock(text), String(text));
    assert.notEqual(text, COMPACT_POINTER_LINE);
    assert.ok(text.includes("rename the config loader"), text);
    assert.equal(query("SELECT 1 FROM meta WHERE key = ?", "pending_compact:" + s).length, 0, "flag taken");
    const next = await handleHook("gemini", payload(s, { hook_event_name: "BeforeAgent", prompt: "and again" }), env);
    assert.equal(next.stdout, "");
  });

  test("[M4] GP6/no-resume-hint-mid-session: a prompt with no compact signal is allow", async () => {
    const s = sid();
    assert.deepEqual(await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "hi" }), env), { stdout: "", exitCode: 0 });
    assert.deepEqual(await handleHook("gemini", payload(s, { hook_event_name: "BeforeAgent", prompt: "hi" }), env), { stdout: "", exitCode: 0 });
  });

  // ---------- turn-boundary recall (DECISIONS-r11 B) ----------

  // A compaction happens in a long session: fill the journal so BM25 IDF is that of a real session.
  const FILLER = [
    "rename the config loader", "update the changelog for the release", "bump the version in package.json",
    "add a retry to the http client", "write docs for the cli flags", "move the date helpers to utils",
    "check the coverage report", "split the large router file", "tidy the readme headings",
    "add a test for the date parser", "remove the unused logger import", "sort the imports in main",
  ];

  async function longSession(agent, s, promptEvent) {
    for (const p of [...FILLER, ...FILLER]) await handleHook(agent, payload(s, { hook_event_name: promptEvent, prompt: p }), env);
    await handleHook(agent, payload(s, {
      hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm run migrate:zebraquux" },
      tool_response: { stdout: "", stderr: "zebraquux migration failed: ETIMEDOUT connecting to db-replica-7", is_error: true },
    }), env);
    await waitRows("SELECT seq FROM events WHERE session_id = ?", [s], 2 * FILLER.length + 1);
  }

  const ASK_ERROR = "why did the zebraquux migration fail with ETIMEDOUT";

  test("[M7] recall/no-compaction-zero-bytes: a prompt naming an earlier error adds nothing before a compaction", async () => {
    const s = sid();
    await longSession("claude-code", s, "UserPromptSubmit");
    const out = await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: ASK_ERROR }), env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    assert.equal(query("SELECT 1 FROM meta WHERE key = ?", "compacted:" + s).length, 0);
  });

  test("[M7] recall/after-compaction: the prompt naming an earlier error gets that row, once, within budget", async () => {
    const s = sid();
    await longSession("claude-code", s, "UserPromptSubmit");
    const state = context(await handleHook("claude-code", payload(s, { hook_event_name: "SessionStart", source: "compact" }), env));
    assert.ok(state !== null && isStateBlock(state), String(state)); // (A) block unchanged
    const err = query("SELECT seq FROM events WHERE session_id = ? AND kind = 'toolerr'", s)[0];
    const text = context(await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: ASK_ERROR }), env));
    assert.ok(text !== null && text.startsWith(RECALL_OPEN_TAG + "\n") && text.endsWith("\n" + RECALL_CLOSE_TAG), String(text));
    assert.ok(text.includes("#" + err.seq + " toolerr Bash: "), text);
    assert.ok(text.includes("zebraquux migration failed: ETIMEDOUT connecting to db-replica-7"), text);
    assert.ok(Buffer.byteLength(text, "utf8") <= RECALL_BUDGET_BYTES);
    // no repeat: the same question again does not re-inject the row
    const again = context(await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: ASK_ERROR }), env));
    assert.ok(again === null || !again.includes("#" + err.seq + " "), String(again));
    // below threshold: an unrelated prompt adds nothing
    const off = await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "what is the weather" }), env);
    assert.deepEqual(off, { stdout: "", exitCode: 0 });
  });

  test("[M7] recall/pending-flag row (gemini): state block on the first BeforeAgent, recall on a later one", async () => {
    const s = sid();
    await longSession("gemini", s, "BeforeAgent");
    await handleHook("gemini", payload(s, { hook_event_name: "PreCompress" }), env);
    const state = context(await handleHook("gemini", payload(s, { hook_event_name: "BeforeAgent", prompt: "go on" }), env));
    assert.ok(state !== null && isStateBlock(state), String(state));
    const text = context(await handleHook("gemini", payload(s, { hook_event_name: "BeforeAgent", prompt: ASK_ERROR }), env));
    assert.ok(text !== null && text.includes("zebraquux migration failed"), String(text));
  });

  test("[M7] recall/per-agent rows follow the adapter table: recall only where UserPromptSubmit carries additionalContext", () => {
    for (const r of ADAPTERS) {
      const ev = { event: "UserPromptSubmit", agent: r.id, sessionId: "s", cwd: "/w", turn: 1, prompt: "p" };
      const out = r.encode(ev, { kind: "hint", text: "RECALL-PROBE", onceKey: "recall" });
      assert.equal(hasRecall(r), JSON.stringify(out).includes("RECALL-PROBE"), r.id);
    }
    assert.deepEqual(ADAPTERS.filter((r) => !hasRecall(r)).map((r) => r.id), ["kiro", "pi", "opencode"]);
  });

  // ---------- decision rows (ADR-0009 §8.2) ----------

  function ask(s, response, input = {}) {
    return payload(s, { hook_event_name: "PostToolUse", tool_name: "AskUserQuestion", tool_input: input, tool_response: response });
  }

  test("[M4] GP6/decision-askuserquestion-answer: one decision row and one chunk under the reserved label", async () => {
    const s = sid();
    const out = await handleHook("claude-code", ask(s, { answers: { "Deploy now?": "Yes", "Which envs?": ["staging", "prod"] } }), env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    const rows = await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'decision'", [s], 2);
    assert.equal(rows.length, 2);
    assert.deepEqual(decisionsOf(s), [
      { key: "Deploy now?", body: "Q: Deploy now? → A: Yes", tool: "AskUserQuestion", ok: 1 },
      { key: "Which envs?", body: "Q: Which envs? → A: staging | prod", tool: "AskUserQuestion", ok: 1 },
    ]);
    const chunks = query(
      "SELECT c.body AS body FROM chunks c JOIN sources s ON s.id = c.source_id WHERE s.label = ? AND s.session_id = ? ORDER BY s.id",
      DECISION_SOURCE, s,
    );
    assert.deepEqual(chunks.map((c) => c.body.includes("Q: Deploy now? → A: Yes")), [true, false]);
  });

  test("[M4] GP6 fixture shape: answers as a list of {question, label}", async () => {
    const s = sid();
    await handleHook("claude-code", ask(s, { answers: [{ question: "Deploy now?", label: "Yes" }] }), env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'decision'", [s], 1);
    assert.deepEqual(decisionsOf(s).map((r) => r.body), ["Q: Deploy now? → A: Yes"]);
  });

  test("[M4] non-JSON AskUserQuestion response writes no decision row (fail-safe)", async () => {
    const s = sid();
    await handleHook("claude-code", ask(s, "User answered: Yes"), env);
    await settle();
    assert.deepEqual(decisionsOf(s), []);
  });

  const QUESTIONS = { questions: [{ question: "Ship?", options: [{ label: "Ship it" }, { label: "Wait" }] }] };

  test("[M4] GP6/decision-option-echo-ref-seq: the next prompt echoing an option writes A/ref with the offering turn's seq", async () => {
    const s = sid();
    await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "can we release?" }), env);
    const [first] = await waitRows("SELECT seq FROM events WHERE session_id = ? AND kind = 'prompt'", [s], 1);
    await handleHook("claude-code", ask(s, "", QUESTIONS), env); // offered, not answered in the tool
    await waitRows("SELECT 1 FROM meta WHERE key = ?", [DECISION_SOURCE + ":" + DECISION_OPTION_KEY + ":" + s], 1);
    await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "  ship IT \n" }), env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'decision'", [s], 1);
    assert.deepEqual(decisionsOf(s), [{ key: DECISION_OPTION_KEY, body: "A: Ship it\nref: #" + first.seq, tool: "AskUserQuestion", ok: 1 }]);
    // the prompt row is still written; the decision row is extra (ADR-0009 §8.2)
    const prompts = await waitRows("SELECT body FROM events WHERE session_id = ? AND kind = 'prompt'", [s], 2);
    assert.equal(prompts.length, 2);
    // the offer applies to the next prompt only
    await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "Ship it" }), env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'prompt'", [s], 3);
    await settle();
    assert.equal(decisionsOf(s).length, 1);
  });

  test("[M4] option offered, next prompt is prose: no decision row, offer gone", async () => {
    const s = sid();
    await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "release?" }), env);
    await waitRows("SELECT seq FROM events WHERE session_id = ? AND kind = 'prompt'", [s], 1);
    await handleHook("claude-code", ask(s, "", QUESTIONS), env);
    const key = DECISION_SOURCE + ":" + DECISION_OPTION_KEY + ":" + s;
    await waitRows("SELECT 1 FROM meta WHERE key = ?", [key], 1);
    await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "let's go with ship it, decision made" }), env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'prompt'", [s], 2);
    await settle();
    assert.deepEqual(decisionsOf(s), []);
    assert.equal(query("SELECT 1 FROM meta WHERE key = ?", key).length, 0);
  });

  test("[M4] GP6/decision-prose-no-row: a prompt with nothing offered writes no decision row", async () => {
    const s = sid();
    await handleHook("claude-code", payload(s, { hook_event_name: "UserPromptSubmit", prompt: "Ship it" }), env);
    await waitRows("SELECT 1 FROM events WHERE session_id = ? AND kind = 'prompt'", [s], 1);
    await settle();
    assert.deepEqual(decisionsOf(s), []);
  });
});

describe("PRD-v2 section 10: decision rows from AskUserQuestion and option echo", { concurrency: CONC }, () => {
  // Unit tests for src/core/hooks/decision.ts (ADR-0009 §8.2, DECISIONS-r6 D3, impl/00 §5.3,
  // DEVIATIONS D-M4-arch-5, D-M4-H1-1). Pure: no DB, no I/O. No regex, no word list.
  // ---- rule 1: AskUserQuestion tool answer ----

  test("rule 1: single-select answer -> Q/A body, key = question", () => {
    const text = JSON.stringify({ questions: [{ question: "Deploy now?" }], answers: { "Deploy now?": "Yes" } });
    assert.deepEqual(answerDecisions(text), [{ key: "Deploy now?", body: "Q: Deploy now? → A: Yes" }]);
  });

  test("rule 1: multi-select labels joined with ' | '", () => {
    const text = JSON.stringify({ answers: { "Which envs?": ["staging", "prod"] } });
    assert.deepEqual(answerDecisions(text), [{ key: "Which envs?", body: "Q: Which envs? → A: staging | prod" }]);
  });

  test("rule 1: array form [{question, label}] gives the same rows", () => {
    const text = JSON.stringify({ answers: [{ question: "Deploy now?", label: "Yes" }, { question: "Envs?", label: ["a", "b"] }] });
    assert.deepEqual(answerDecisions(text), [
      { key: "Deploy now?", body: "Q: Deploy now? → A: Yes" },
      { key: "Envs?", body: "Q: Envs? → A: a | b" },
    ]);
  });

  test("rule 1: one row per answered question, in answer order", () => {
    const text = JSON.stringify({ answers: { "A?": "x", "B?": ["y"] } });
    assert.deepEqual(answerDecisions(text).map((d) => d.body), ["Q: A? → A: x", "Q: B? → A: y"]);
  });

  test("rule 1: non-JSON response writes no row (fail-safe)", () => {
    assert.deepEqual(answerDecisions("not-json at all { broken"), []);
    assert.deepEqual(answerDecisions(""), []);
  });

  test("rule 1: JSON without an answers object writes no row", () => {
    for (const t of ["null", "[]", "\"Yes\"", "{}", JSON.stringify({ answers: "Yes" }), JSON.stringify({ answers: ["Yes"] })]) {
      assert.deepEqual(answerDecisions(t), [], t);
    }
  });

  test("rule 1: empty or non-string labels are skipped, never stringified", () => {
    const text = JSON.stringify({ answers: { "A?": "", "B?": [], "C?": { x: 1 }, "D?": [1, "ok", null] } });
    assert.deepEqual(answerDecisions(text), [{ key: "D?", body: "Q: D? → A: ok" }]);
  });

  // ---- option labels ----

  test("askOptionLabels reads questions[].options[].label from the AskUserQuestion input", () => {
    const input = { questions: [{ question: "Q", options: [{ label: "Ship it" }, { label: "Wait" }, { description: "x" }] }] };
    assert.deepEqual(askOptionLabels(input), ["Ship it", "Wait"]);
    assert.deepEqual(askOptionLabels({}), []);
    assert.deepEqual(askOptionLabels({ questions: "x" }), []);
  });

  test("listOptionLabels: numbered and lettered markers at line start", () => {
    const text = "Pick one:\n1. Ship it\n2) Wait\nA) Roll back\nb. Ask again\r\n10. Tenth\n";
    assert.deepEqual(listOptionLabels(text), ["Ship it", "Wait", "Roll back", "Ask again", "Tenth"]);
  });

  test("listOptionLabels: no marker at column 0, no space, or two letters -> not an option", () => {
    const text = "  1. indented\n1.no space\nAB) two letters\nsee 2. inline\n3.\nversion 1.2\n- dash";
    assert.deepEqual(listOptionLabels(text), []);
  });

  // ---- rule 2: option echo ----

  test("rule 2: trimmed, case-folded prompt equal to a label -> A/ref body, key = option", () => {
    const d = optionEchoDecision("  ship IT \n", ["Ship it", "Wait"], 12);
    assert.deepEqual(d, { key: DECISION_OPTION_KEY, body: "A: Ship it\nref: #12" });
  });

  test("rule 2: non-ASCII labels compare case-folded too", () => {
    assert.deepEqual(optionEchoDecision("ДА", ["да", "нет"], 3), { key: "option", body: "A: да\nref: #3" });
    assert.deepEqual(optionEchoDecision("été", ["ÉTÉ"], 4), { key: "option", body: "A: ÉTÉ\nref: #4" });
  });

  test("rule 2: partial, longer or marker-only prompts write no row", () => {
    for (const p of ["Ship", "Ship it now", "1", "1. Ship it", ""]) {
      assert.equal(optionEchoDecision(p, ["Ship it", "Wait"], 1), null, p);
    }
    assert.equal(optionEchoDecision("Ship it", [], 1), null);
  });

  // GP6/decision-prose-no-row (ADR-0009 §8.2: no marker-word list, no shape classifier).
  test("prose with marker words writes no decision row", () => {
    const prose = "let's go with the blue button, decision made";
    assert.equal(optionEchoDecision(prose, listOptionLabels("1. Red button\n2. Blue button"), 1), null);
    assert.equal(optionEchoDecision(prose, [], 1), null);
    assert.deepEqual(answerDecisions(prose), []);
    assert.deepEqual(answerDecisions(JSON.stringify(prose)), []);
  });

  test("decision.ts holds no RegExp (no regex as a runtime rule)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/core/hooks/decision.ts", import.meta.url), "utf8");
    assert.ok(!src.includes("RegExp") && !src.includes(".match(") && !src.includes(".test("));
  });
});

// serial: tests set and delete process.env.CLAUDE_PROJECT_DIR
describe("PRD-v2 section 10: lenient decode on the claude-code golden payload", () => {
  // Field-by-field goldens for the Claude Code PostToolUse decode (D-FU-RF-DECODE-1). Base payload: the real
  // 2.1.303 Bash capture (e2e/fixtures/claude-code/2.1.303/PostToolUse-Bash-large.json, 8892 bytes of stdout).
  // Rule: a field the hooks docs list as always present may be required; every other field has a defined
  // default. Required here: hook_event_name, tool_name, tool_response. Dropping an optional field still
  // replaces. Dropping a required field gives exit 0, empty stdout and one stderr (debug log) line that
  // names the field, never a silent drop.
  const ROOT = join(import.meta.dirname, "..", "..");
  const ENTRY = join(ROOT, "src", "entries", "hook.ts");
  const GOLDEN = join(ROOT, "e2e", "fixtures", "claude-code", "2.1.303", "PostToolUse-Bash-large.json");
  const BASE = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const FULL_BYTES = Buffer.byteLength(BASE.tool_response.stdout);
  let root;
  let repo;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-decode-lenient-"));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  function payload() {
    const p = structuredClone(BASE);
    p.cwd = repo;
    p.transcript_path = join(root, "transcript.jsonl");
    return p;
  }

  // D-R4-HANDLE-LABEL-1: the label is no longer in the replace; it is the stored source row's label.
  function storedLabel() {
    const projects = join(root, ".context-mode", "projects");
    const db = new DatabaseSync(join(projects, readdirSync(projects)[0], "context.db"), { readOnly: true });
    try { return db.prepare("SELECT label FROM sources ORDER BY id DESC LIMIT 1").get().label; } finally { db.close(); }
  }

  function run(p) {
    const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo };
    return spawnSync(process.execPath, [ENTRY, "--agent", "claude-code"], { input: JSON.stringify(p), cwd: repo, env, encoding: "utf8" });
  }

  // The replace D-M7-RL-1 checks: Bash output shape, far shorter than the full output, names the source.
  function assertReplaced(r, what) {
    assert.equal(r.status, 0, what + " " + r.stderr);
    assert.notEqual(r.stdout, "", what + ": empty stdout");
    const hso = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(hso.hookEventName, "PostToolUse", what);
    const out = hso.updatedToolOutput;
    assert.equal(typeof out, "object", what);
    assert.deepEqual(Object.keys(out).sort(), ["interrupted", "stderr", "stdout"], what);
    assert.ok(Buffer.byteLength(out.stdout) * 10 < FULL_BYTES, what + ": " + Buffer.byteLength(out.stdout) + " bytes");
    assert.ok(out.stdout.includes("ctx_search("), what);
    return out.stdout;
  }

  const OPTIONAL_TOP = ["session_id", "transcript_path", "cwd", "prompt_id", "permission_mode", "effort", "tool_input", "tool_use_id", "duration_ms"];
  const OPTIONAL_RESPONSE = ["stderr", "interrupted", "isImage", "noOutputExpected"];
  const REQUIRED = ["hook_event_name", "tool_name", "tool_response"];

  test("the base payload carries every field this file drops", () => {
    for (const f of [...OPTIONAL_TOP, ...REQUIRED]) assert.ok(f in BASE, f);
    for (const f of ["stdout", ...OPTIONAL_RESPONSE]) assert.ok(f in BASE.tool_response, "tool_response." + f);
  });

  for (const field of OPTIONAL_TOP) {
    test(`D-FU-RF-DECODE-1: optional ${field} dropped -> still replaces`, () => {
      const p = payload();
      delete p[field];
      assertReplaced(run(p), "-" + field);
    });
  }

  for (const field of OPTIONAL_RESPONSE) {
    test(`D-FU-RF-DECODE-1: optional tool_response.${field} dropped -> still replaces`, () => {
      const p = payload();
      delete p.tool_response[field];
      assertReplaced(run(p), "-tool_response." + field);
    });
  }

  test("D-FU-RF-DECODE-1: optional tool_response.stdout dropped -> defaults to \"\", a large stderr still replaces", () => {
    const p = payload();
    p.tool_response.stderr = p.tool_response.stdout;
    delete p.tool_response.stdout;
    const text = assertReplaced(run(p), "-tool_response.stdout");
    assert.ok(!text.includes('\\n'), "read as plain lines, not one escaped JSON string");
  });

  test("D-FU-RF-DECODE-1: tool_use_id dropped -> label from a hash of the command and turn, stable per command", () => {
    const p = payload();
    delete p.tool_use_id;
    assertReplaced(run(p), "-tool_use_id a");
    const la = storedLabel();
    const label = la.match(/Bash:seq 1 2000#(\S+)$/);
    assert.ok(label !== null, la);
    assert.match(label[1], /^h[0-9a-f]{8}$/);
    assertReplaced(run(p), "-tool_use_id b");
    assert.ok(storedLabel().includes("#" + label[1]), "same command, same turn -> same label");
    const q = payload();
    delete q.tool_use_id;
    q.tool_input.command = "seq 1 2000 # other";
    assertReplaced(run(q), "-tool_use_id other command");
    assert.ok(!storedLabel().includes("#" + label[1]), "another command -> another label");
  });

  for (const field of REQUIRED) {
    test(`D-FU-RF-DECODE-1: required ${field} dropped -> exit 0, empty stdout, one debug line naming it`, () => {
      const p = payload();
      delete p[field];
      const r = run(p);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, "");
      const lines = r.stderr.split("\n").filter((l) => l !== "");
      assert.equal(lines.length, 1, r.stderr);
      assert.ok(lines[0].startsWith("hooks: decode failed: "), lines[0]);
      assert.ok(lines[0].includes("missing required field " + field), lines[0]);
    });
  }

  test("D-FU-RF-DECODE-1: decode defaults: cwd -> CLAUDE_PROJECT_DIR, else process.cwd(); session_id -> \"\"; tool_input -> {}", () => {
    const p = { hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: { stdout: "x" } };
    const old = process.env.CLAUDE_PROJECT_DIR;
    try {
      process.env.CLAUDE_PROJECT_DIR = repo;
      const ev = decode(p);
      assert.equal(ev.cwd, repo);
      assert.equal(ev.sessionId, "");
      assert.deepEqual(ev.tool.input, {});
      delete process.env.CLAUDE_PROJECT_DIR;
      assert.equal(decode(p).cwd, process.cwd());
    } finally {
      if (old === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = old;
    }
  });

  test("D-FU-RF-DECODE-1: a given tool_use_id still wins over the hash default", () => {
    const ev = decode({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: "", tool_use_id: "toolu_9" });
    assert.equal(ev.tool.callId, "toolu_9");
  });
});

// serial: tests replace process.stderr.write
describe("PRD-v2 section 10: detached journal write", () => {
  // Unit tests for src/core/hooks/detached.ts (impl/09 §3, A21; 00 rule "Journal writes from hooks are detached").
  // appendDetached(project, sessionId, row): void. Returns before the write; never throws; never rejects;
  // a failure writes one stderr line "hooks: journal write failed: <message>"; does not close the DB.
  // D-M3-F-9: a hook or detached write keeps its DB handle open by design (A21), and Windows cannot delete
  // an open file, so temp cleanup there is best-effort. The assertions above it are unchanged.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

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

  function row(sessionId, body) {
    return {
      session_id: sessionId, worktree: "/w", agent: "claude-code", kind: "prompt", tool: null, key: null,
      path: null, ok: 1, exit_code: null, bytes: Buffer.byteLength(body), body, turn: 0,
      sandbox_bytes: 0, returned_bytes: 0,
    };
  }

  async function waitFor(check, ms = 5000) {
    const end = Date.now() + ms;
    for (;;) {
      const v = await check();
      if (v) return v;
      if (Date.now() > end) return v;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  function captureStderr() {
    const lines = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      lines.push(String(chunk));
      return true;
    };
    return { lines, restore: () => { process.stderr.write = orig; } };
  }

  test("returns undefined synchronously, before the row is written", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-detached-"));
    const project = fakeProject(root, "a".repeat(16));
    try {
      const ret = appendDetached(project, "s1", row("s1", "hello"));
      assert.equal(ret, undefined);
      assert.equal(ret instanceof Promise, false);
      // The write has not happened in the same tick: openDb is async.
      const reader = await openDb(project);
      try {
        const rows = await waitFor(() => {
          const r = readSessionEvents(reader, "s1");
          return r.length === 1 ? r : null;
        });
        assert.ok(rows, "detached row landed");
        assert.equal(rows[0].body, "hello");
        assert.equal(rows[0].kind, "prompt");
      } finally {
        closeDb(reader);
      }
    } finally {
      rmTemp(root);
    }
  });

  test("several detached writes all land, in call order", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-detached-"));
    const project = fakeProject(root, "b".repeat(16));
    try {
      // Create the DB first so all three opens are plain opens.
      closeDb(await openDb(project));
      for (const b of ["one", "two", "three"]) appendDetached(project, "s2", row("s2", b));
      const reader = await openDb(project);
      try {
        const rows = await waitFor(() => {
          const r = readSessionEvents(reader, "s2");
          return r.length === 3 ? r : null;
        });
        assert.ok(rows);
        assert.deepEqual(rows.map((r) => r.body).sort(), ["one", "three", "two"]);
      } finally {
        closeDb(reader);
      }
    } finally {
      rmTemp(root);
    }
  });

  test("failure: one stderr line, no throw, no unhandled rejection", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-detached-"));
    const project = fakeProject(root, "c".repeat(16));
    // DB_GONE: main file missing but a WAL sibling left behind (impl/02 §6.1 step 4).
    mkdirSync(project.projectDir, { recursive: true });
    writeFileSync(project.dbPath + "-wal", "");
    const unhandled = [];
    const onUnhandled = (e) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    const cap = captureStderr();
    try {
      assert.doesNotThrow(() => appendDetached(project, "s3", row("s3", "x")));
      await waitFor(() => cap.lines.length > 0);
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      cap.restore();
      process.off("unhandledRejection", onUnhandled);
      rmTemp(root);
    }
    assert.equal(cap.lines.length, 1);
    assert.equal(cap.lines[0].startsWith("hooks: journal write failed: "), true);
    assert.equal(cap.lines[0].endsWith("\n"), true);
    assert.deepEqual(unhandled, []);
  });

  test("does not close its DB handle (A21): a caller-side handle keeps working after the write", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-detached-"));
    const project = fakeProject(root, "d".repeat(16));
    try {
      const reader = await openDb(project);
      try {
        appendDetached(project, "s4", row("s4", "y"));
        const rows = await waitFor(() => readSessionEvents(reader, "s4").length === 1);
        assert.ok(rows);
        // No TRUNCATE checkpoint ran from the detached write: the WAL file still exists.
        const { existsSync } = await import("node:fs");
        assert.equal(existsSync(project.dbPath + "-wal"), true);
      } finally {
        closeDb(reader);
      }
    } finally {
      rmTemp(root);
    }
  });
});

// serial: tests share one temp repo from before()
describe("PRD-v2 section 10: hook entry never crashes the host (#414, #453)", () => {
  // PORT of tests/hooks/run-hook.test.ts (#414, #453) to the v2 hook entry (cleanup-plan W1-hooks).
  // v1 wrapped each hook script and logged a throw to <configDir>/context-mode/hook-errors.log, then exited 0.
  // v2 has no wrapper and no log file (impl/09 §5.2): every failure is empty stdout, exit 0, one stderr line.
  const ENTRY = join(import.meta.dirname, "..", "..", "src", "entries", "hook.ts");
  let root, repo, cfg;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-hook-ported-"));
    repo = join(root, "repo");
    cfg = join(root, "cfg");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
  });
  after(() => rmSync(root, { recursive: true, force: true }));
  const run = (input, env = {}) => spawnSync(process.execPath, [ENTRY, "--agent", "claude-code"],
    { input, cwd: repo, encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo, ...env } });

  test("run-hook #414: empty stdin never crashes the host: exit 0, empty stdout, one stderr line", () => {
    const r = run("");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim().split("\n").length, 1);
  });

  test("run-hook #414: a payload with an unknown event still exits 0 with empty stdout", () => {
    const r = run(JSON.stringify({ hook_event_name: "NoSuchEvent", session_id: "s" }));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  test("run-hook #453: a failure writes nothing under CLAUDE_CONFIG_DIR (no hook-errors.log in v2); stderr is the only trace", () => {
    const r = run("{{", { CLAUDE_CONFIG_DIR: cfg });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.ok(r.stderr.startsWith("hooks:"));
    assert.ok(!existsSync(cfg), "CLAUDE_CONFIG_DIR must not be created by a failing hook");
  });
});

// serial: sets process.env.HOME inside the test
describe("PRD-v2 section 10: gemini live order, prompt then AfterTool", () => {
  // Spec: ADR-0020 decision 4. Gemini CLI 0.65.0 bundle: fireBeforeAgentEvent(partToString(request)) runs before
  // the first model call of a turn, and AfterTool gets {llmContent, returnDisplay, error}. hooks-fast round 1 piped
  // AfterTool alone (no BeforeAgent), so no prompt was stored and the rare FATAL line was not in the replace.
  // This pins the live order: BeforeAgent (prompt) then AfterTool `cat big.log` -> the deny reason holds the line.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  const FATAL = "FATAL: disk controller failure code=E-7731";

  test("gemini BeforeAgent prompt then AfterTool run_shell_command cat: the deny reason holds the FATAL line", async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "cm-gem-live-"));
    const oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
    t.after(() => { process.env.HOME = oldHome; rmTemp(root); });
    const repo = path.join(root, "repo");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    const lines = [];
    for (let i = 0; i < 4000; i++) lines.push(i === 3001 ? FATAL : "INFO line " + i + " request ok");
    const big = lines.join("\n") + "\n";
    writeFileSync(path.join(repo, "big.log"), big);
    const env = { HOME: root, USERPROFILE: root, PATH: process.env.PATH };
    const base = { session_id: "g-live", transcript_path: "", cwd: repo, timestamp: "2026-10-26T00:00:00Z" };

    const ba = await handleHook("gemini", { ...base, hook_event_name: "BeforeAgent", prompt: "What is the FATAL error in big.log?" }, env);
    assert.equal(ba.exitCode, 0);

    const at = await handleHook("gemini", { ...base, hook_event_name: "AfterTool", tool_name: "run_shell_command",
      tool_input: { command: "cat big.log" }, tool_response: { llmContent: big, returnDisplay: big } }, env);
    assert.equal(at.exitCode, 0);
    const j = JSON.parse(at.stdout);
    assert.equal(j.decision, "deny");
    assert.ok(j.reason.includes(FATAL), j.reason);
    assert.ok(Buffer.byteLength(j.reason) < Buffer.byteLength(big) / 100, String(Buffer.byteLength(j.reason)));
  });
});

// serial: tests share one temp repo and one database from before()
describe("PRD-v2 section 10: hook entry argv and stdin handling (GP7)", () => {
  // Unit tests for src/entries/hook.ts main() (impl/09 §5.2, impl/00 §5.3; D-M3-H2-8).
  // Runs the entry as a child process: argv, stdin and exit code are the whole contract.
  const ENTRY = join(import.meta.dirname, "..", "..", "src", "entries", "hook.ts");
  let root;
  let repo;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-hook-entry-"));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  function run(args, input, cwd = repo) {
    const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo };
    return spawnSync(process.execPath, [ENTRY, ...args], { input, cwd, env, encoding: "utf8" });
  }

  test("missing --agent: empty stdout, exit 0, one stderr line", () => {
    const r = run([], "{}");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.ok(r.stderr.includes("hooks: unknown --agent"));
  });

  test("unknown agent id: empty stdout, exit 0", () => {
    const r = run(["--agent", "nope"], "{}");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  test("malformed JSON on stdin: empty stdout, exit 0", () => {
    const r = run(["--agent", "claude-code"], "{not json");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  // D-M7-RR-1: curl is no longer denied on claude-code (run, then replace); WebFetch deny is kept.
  test("claude-code WebFetch PreToolUse: native deny on stdout, exit 0", () => {
    const p = { session_id: "e1", cwd: repo, hook_event_name: "PreToolUse", tool_name: "WebFetch", tool_input: { url: "https://example.com/a" } };
    const r = run(["--agent", "claude-code"], JSON.stringify(p));
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
  });

  test("kiro UserPromptSubmit: stdout is empty (adapter rule A28)", () => {
    const p = { session_id: "k1", cwd: repo, hook_event_name: "userPromptSubmit" };
    const r = run(["--agent", "kiro"], JSON.stringify(p));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  test("kiro UserPromptSubmit trigger from hooks/kiro.json is decoded, not dropped (D-FU-RM-KIRO-2)", () => {
    const p = { session_id: "k2", cwd: repo, hook_event_name: "UserPromptSubmit" };
    const r = run(["--agent", "kiro"], JSON.stringify(p));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.doesNotMatch(r.stderr, /decode failed|unknown hook event/);
  });

  // D-FU-OI-KIRO-1: Kiro CLI V3 SessionStart (https://kiro.dev/docs/hooks/types/, read 2026-10-23): payload
  // hook_event_name, cwd, session_id; exit 0 stdout is added to the agent's context. The hook prints the resume
  // line once per session id (E5, A20): empty stdout is the right answer for a repeat or a payload without session_id.
  const KIRO_RESUME = "This session may have run before. Call mcp_context-mode_ctx_resume for a summary of what happened.";

  test("kiro SessionStart: first call of a session prints the resume line with the kiro tool prefix, exit 0", () => {
    const p = { hook_event_name: "SessionStart", cwd: repo, session_id: "kiro-ss-1" };
    const r = run(["--agent", "kiro"], JSON.stringify(p));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, KIRO_RESUME);
    assert.equal(r.stderr, "");
  });

  test("kiro SessionStart: same session id again prints nothing (once per session, not a failure)", () => {
    const p = { hook_event_name: "SessionStart", cwd: repo, session_id: "kiro-ss-2" };
    assert.equal(run(["--agent", "kiro"], JSON.stringify(p)).stdout, KIRO_RESUME);
    const again = run(["--agent", "kiro"], JSON.stringify(p));
    assert.equal(again.status, 0);
    assert.equal(again.stdout, "");
    assert.equal(again.stderr, "");
    const other = run(["--agent", "kiro"], JSON.stringify({ ...p, session_id: "kiro-ss-3" }));
    assert.equal(other.stdout, KIRO_RESUME);
  });

  test("kiro SessionStart: legacy agentSpawn prints the same line; no session_id prints nothing (E5)", () => {
    const spawn = { hook_event_name: "agentSpawn", cwd: repo, session_id: "kiro-ss-4" };
    assert.equal(run(["--agent", "kiro"], JSON.stringify(spawn)).stdout, KIRO_RESUME);
    const none = run(["--agent", "kiro"], JSON.stringify({ hook_event_name: "SessionStart", cwd: repo }));
    assert.equal(none.status, 0);
    assert.equal(none.stdout, "");
  });

  test("detached journal write lands before the process ends (D-M3-H2-8)", () => {
    const p = { session_id: "e2", cwd: repo, hook_event_name: "UserPromptSubmit", prompt: "hello entry" };
    const r = run(["--agent", "claude-code"], JSON.stringify(p));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    const projects = join(root, ".context-mode", "projects");
    const db = join(projects, readdirSync(projects)[0], "context.db");
    assert.ok(existsSync(db));
    const h = new DatabaseSync(db, { readOnly: true });
    try {
      const rows = h.prepare("SELECT kind, body FROM events WHERE session_id = ?").all("e2");
      assert.deepEqual(rows.map((x) => ({ ...x })), [{ kind: "prompt", body: "hello entry" }]);
    } finally {
      h.close();
    }
  });

  test("GP7/codex-session-project-dir: codex sessions in X and Y write to their own project", () => {
    const x = join(root, "x");
    const y = join(root, "y");
    for (const d of [x, y]) { mkdirSync(d); execFileSync("git", ["init", "-q", d]); }
    const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root };
    for (const [sid, dir] of [["cx-a", x], ["cx-b", y]]) {
      const p = { session_id: sid, cwd: dir, hook_event_name: "UserPromptSubmit", prompt: sid };
      const r = spawnSync(process.execPath, [ENTRY, "--agent", "codex"], { input: JSON.stringify(p), cwd: root, env, encoding: "utf8" });
      assert.equal(r.status, 0);
    }
    const projects = join(root, ".context-mode", "projects");
    const seen = {};
    for (const k of readdirSync(projects)) {
      const h = new DatabaseSync(join(projects, k, "context.db"), { readOnly: true });
      try {
        for (const r of h.prepare("SELECT session_id, worktree FROM events WHERE session_id LIKE 'cx-%'").all()) seen[r.session_id] = r.worktree;
      } finally {
        h.close();
      }
    }
    assert.equal(seen["cx-a"], realpathSync.native(x));
    assert.equal(seen["cx-b"], realpathSync.native(y));
  });
});

describe("PRD-v2 section 10: last hook error log", { concurrency: CONC }, () => {
  // D-HNE-GUARD-1: ctx_doctor (D5) names the last hook error from <HOME>/.context-mode/hook-errors.log.
  test("lastHookError: none when no log exists", (t) => {
    const home = mkdtempSync(join(tmpdir(), "cm-last-"));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    assert.equal(lastHookError({ HOME: home, USERPROFILE: home }), null);
  });

  test("lastHookError: returns the newest line; the log keeps every line", (t) => {
    const home = mkdtempSync(join(tmpdir(), "cm-last-"));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    const env = { HOME: home, USERPROFILE: home };
    const e1 = new Error("first"); e1.code = "NODE_TOO_OLD";
    logHookError(env, "claude-code", "node", e1);
    logHookError(env, "claude-code", "store", new TypeError("second"));
    const last = lastHookError(env);
    assert.equal(last.stage, "store");
    assert.equal(last.label, "TypeError");
    assert.match(D5_LAST_HOOK_ERROR(last.ts, last.stage, last.label), /last hook error .* at store \(TypeError\)/);
    assert.equal(hookLogPath(env).endsWith("hook-errors.log"), true);
  });

  test("logHookError and lastHookError never throw without a home", () => {
    logHookError({}, "claude-code", "decode", new Error("x"));
    assert.equal(lastHookError({}), null);
  });
});

describe("PRD-v2 section 10: PreToolUse module load set", { concurrency: CONC }, () => {
  // D-CI-PERF-7: the built hook bundle on a PreToolUse hook call must not load the stream stack, readline or fs/promises. A static ESM
  // `import ... from "node:fs"` anywhere in the hook graph makes the loader build them (about 3 ms per call on Windows).
  const ROOT = join(import.meta.dirname, "..", "..");
  // The preload writes with fs, not process.stderr: touching process.stderr would itself build the stream stack.
  const PRELOAD = `process.on("exit", () => require("node:fs").writeFileSync(process.env.CM_MODLOAD_OUT, JSON.stringify(process.moduleLoadList)));`;
  const BARE = new Set(JSON.parse(spawnSync(process.execPath, ["-p", "JSON.stringify(process.moduleLoadList)"], { encoding: "utf8" }).stdout));

  test("PreToolUse hook call does not load stream, readline or fs/promises", () => {
    const input = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "mod-load", cwd: process.cwd(), tool_name: "Bash", tool_input: { command: "true" } });
    const dir = mkdtempSync(join(tmpdir(), "cm-modload-"));
    const out = join(dir, "out");
    const b = spawnSync(process.execPath, [join(ROOT, "build", "build.mjs"), "--out", out], { encoding: "utf8", cwd: ROOT });
    assert.equal(b.status, 0, b.stderr);
    const pre = join(dir, "pre.cjs");
    writeFileSync(pre, PRELOAD);
    const r = spawnSync(process.execPath, ["--require", pre, join(out, "hook.mjs"), "--agent", "claude-code"], { input, encoding: "utf8", env: { ...process.env, CM_MODLOAD_OUT: join(dir, "loaded.json") } });
    assert.equal(r.status, 0, r.stderr);
    const loaded = JSON.parse(readFileSync(join(dir, "loaded.json"), "utf8")).filter((m) => !BARE.has(m));
    rmSync(dir, { recursive: true, force: true });
    for (const m of ["NativeModule stream", "NativeModule readline/interface", "NativeModule internal/fs/promises"]) {
      assert.ok(!loaded.includes(m), `${m} is loaded by the hook call`);
    }
  });
});

// serial: tests share one built bundle and one home log from before()
describe("PRD-v2 section 10: hook never errors (D-HNE-GUARD-1)", () => {
  // D-HNE-GUARD-1 (owner decision 2026-10-29): a hook never errors. On any internal failure it exits 0 with a valid decision
  // for its host: own ctx_* tools allowed, flooding tools denied with the redirect plus "run ctx_doctor", and the error with
  // its stack in <HOME>/.context-mode/hook-errors.log. Runs the built bundle for all 10 hosts (CM_HNE_BUNDLE overrides it).
  const REPO = join(import.meta.dirname, "..", "..");
  let root;
  let bundle;
  let repo;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-hne-"));
    if (process.env.CM_HNE_BUNDLE) bundle = process.env.CM_HNE_BUNDLE;
    else {
      const out = join(root, "bundle");
      const r = spawnSync(process.execPath, [join(REPO, "build", "build.mjs"), "--out", out], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      bundle = join(out, "hook.mjs");
    }
    repo = join(root, "repo");
    mkdirSync(repo);
    spawnSync("git", ["init", "-q", repo]);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  const SNAKE = (event, tool, input) => ({ hook_event_name: event, session_id: "s1", cwd: repo, tool_name: tool, tool_input: input });
  const CAMEL = (event, tool, input) => ({ hookEventName: event, sessionId: "s1", cwd: repo, toolName: tool, toolArgs: JSON.stringify(input) });
  const CMD = { command: "cat README.md | head -500" };

  // shell: the host's native shell tool; own: this host's wire name for ctx_execute.
  const HOSTS = {
    "claude-code": { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "Bash", own: "mcp__plugin_context-mode_context-mode__ctx_execute", safe: "TodoWrite" },
    codex: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "Bash", own: "mcp__context_mode__ctx_execute", safe: "update_plan" },
    gemini: { pay: (t, i) => SNAKE("BeforeTool", t, i), shell: "run_shell_command", own: "mcp_context-mode_ctx_execute", safe: "activate_skill" },
    qwen: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "run_shell_command", own: "mcp__context-mode__ctx_execute", safe: "todo_write" },
    "copilot-cli": { pay: (t, i) => CAMEL("preToolUse", t, i), shell: "bash", own: "context-mode-ctx_execute", safe: "skill" },
    vscode: { pay: (t, i) => CAMEL("preToolUse", t, i), shell: "run_in_terminal", own: "mcp_context-mode_ctx_execute", safe: "manage_todo_list" },
    kiro: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "execute_bash", own: "mcp_context-mode_ctx_execute", safe: "todo_list" },
    zcode: { pay: (t, i) => SNAKE("PreToolUse", t, i), shell: "Bash", own: "mcp__context-mode__ctx_execute", safe: "TodoWrite" },
    pi: { pay: (t, i) => ({ type: "tool_call", sessionId: "s1", cwd: repo, toolName: t, input: i }), shell: "bash", own: "ctx_execute", safe: "todo" },
    opencode: { pay: (t, i) => ({ type: "execute.before", sessionID: "s1", directory: repo, tool: t, args: i }), shell: "bash", own: "context-mode_ctx_execute", safe: "todowrite" },
  };
  const EXIT2 = new Set(["kiro", "pi", "opencode"]); // these hosts deny by exit code 2 and text

  function run(host, payload, { fault, env = {}, preload } = {}) {
    const home = mkdtempSync(join(root, "home-"));
    const args = preload ? ["--require", preload] : [];
    const r = spawnSync(process.execPath, [...args, bundle, "--agent", host], {
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, ...(fault ? { CM_HOOK_FAULT: fault } : {}), ...env },
      timeout: 20000,
    });
    return { ...r, home };
  }

  function denyText(host, r) {
    if (EXIT2.has(host)) return r.status === 2 ? (r.stdout + r.stderr) : null;
    if (r.status !== 0 || r.stdout === "") return null;
    const j = JSON.parse(r.stdout); // must be valid JSON for every host that is not exit-2
    const reason = j.hookSpecificOutput?.permissionDecisionReason ?? j.permissionDecisionReason ?? j.reason;
    const dec = j.hookSpecificOutput?.permissionDecision ?? j.permissionDecision ?? j.decision;
    return dec === "deny" && typeof reason === "string" ? reason : null;
  }

  function logLines(home) {
    const f = join(home, ".context-mode", "hook-errors.log");
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l)) : [];
  }

  const STAGES = ["decode", "project", "policy", "encode"];

  for (const host of Object.keys(HOSTS)) {
    const h = HOSTS[host];
    for (const stage of STAGES) {
      test(`[D-HNE-GUARD-1] ${host}: a throw at ${stage} exits 0, denies the shell with the redirect, logs the stack`, () => {
        const r = run(host, h.pay(h.shell, CMD), { fault: stage });
        const reason = denyText(host, r);
        assert.notEqual(reason, null, `${host}/${stage} not a deny: status=${r.status} stdout=${r.stdout.slice(0, 200)} stderr=${r.stderr.slice(0, 200)}`);
        if (!EXIT2.has(host)) assert.equal(r.status, 0);
        assert.ok(reason.includes("ctx_execute"), "redirect names the sandbox: " + reason);
        assert.ok(reason.includes("ctx_doctor"), "names ctx_doctor: " + reason);
        const log = logLines(r.home);
        assert.equal(log.length >= 1, true, "error line in hook-errors.log");
        assert.equal(log[0].agent, host);
        assert.ok(log[0].stack.includes("injected fault at " + stage), log[0].stack.slice(0, 200));
      });

      test(`[D-HNE-GUARD-1] ${host}: a throw at ${stage} still allows the own ctx_* tool and a tool that cannot flood`, () => {
        for (const name of [h.own, h.safe]) {
          const r = run(host, h.pay(name, { code: "1" }), { fault: stage });
          assert.equal(r.status, 0, `${host}/${stage}/${name} exit ${r.status}: ${r.stderr.slice(0, 200)}`);
          assert.equal(denyText(host, r), null, `${host}/${stage}/${name} must not be denied: ${r.stdout.slice(0, 200)}`);
          if (r.stdout !== "") JSON.parse(r.stdout); // never half a document
        }
      });
    }

    test(`[D-HNE-GUARD-1] ${host}: Node below 24.15 gives the same failure decision and does not crash at load`, () => {
      const pre = join(root, "oldnode.cjs");
      writeFileSync(pre, "Object.defineProperty(process, 'version', { value: 'v22.1.0' });");
      const r = run(host, h.pay(h.shell, CMD), { preload: pre });
      const reason = denyText(host, r);
      assert.notEqual(reason, null, `${host} old node not a deny: status=${r.status} stderr=${r.stderr.slice(0, 200)}`);
      assert.ok(reason.includes("NODE_TOO_OLD"), reason);
      assert.ok(reason.includes("ctx_doctor"), reason);
      assert.equal(logLines(r.home)[0].stage, "node");
      const own = run(host, h.pay(h.own, { code: "1" }), { preload: pre });
      assert.equal(own.status, 0);
      assert.equal(denyText(host, own), null);
    });

    test(`[D-HNE-GUARD-1] ${host}: unreadable stdin is logged and answered with exit 0`, () => {
      const r = run(host, "{not json");
      assert.equal(r.status, 0);
      assert.ok(logLines(r.home).some((l) => l.stage === "stdin"), "stdin error logged");
    });
  }

  test("[D-HNE-GUARD-1] a large Read is denied and a small Read allowed when the hook fails", () => {
    const big = join(root, "big.txt");
    const small = join(root, "small.txt");
    writeFileSync(big, "x".repeat(40000));
    writeFileSync(small, "ok");
    const mk = (p) => SNAKE("PreToolUse", "Read", { file_path: p });
    assert.notEqual(denyText("claude-code", run("claude-code", mk(big), { fault: "policy" })), null);
    assert.equal(denyText("claude-code", run("claude-code", mk(small), { fault: "policy" })), null);
    assert.equal(denyText("claude-code", run("claude-code", SNAKE("PreToolUse", "Read", { file_path: big, offset: 1, limit: 20 }), { fault: "policy" })), null, "a ranged Read cannot flood");
  });

  test("[D-HNE-GUARD-1] WebFetch and Grep are denied with their own redirect when the hook fails", () => {
    const f = denyText("claude-code", run("claude-code", SNAKE("PreToolUse", "WebFetch", { url: "https://example.com" }), { fault: "policy" }));
    assert.ok(f.includes("ctx_index") && f.includes("ctx_doctor"), f);
    const g = denyText("claude-code", run("claude-code", SNAKE("PreToolUse", "Grep", { pattern: "x" }), { fault: "policy" }));
    assert.ok(g.includes("ctx_execute") && g.includes("ctx_doctor"), g);
  });

  test("[D-HNE-GUARD-1] a non PreToolUse event that fails answers allow, never a deny", () => {
    const r = run("claude-code", SNAKE("PostToolUse", "Bash", CMD), { fault: "decode" });
    assert.equal(r.status, 0);
    assert.equal(denyText("claude-code", r), null);
  });

  test("[D-HNE-GUARD-1] the log is append only: a second failure adds a line and keeps the first", () => {
    const home = mkdtempSync(join(root, "home-"));
    const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CM_HOOK_FAULT: "decode" };
    for (let i = 0; i < 2; i++) spawnSync(process.execPath, [bundle, "--agent", "claude-code"], { input: JSON.stringify(SNAKE("PreToolUse", "Bash", CMD)), env, encoding: "utf8" });
    assert.equal(logLines(home).length, 2);
  });
});

describe("PRD-v2 section 10: hook on an old node", { concurrency: CONC }, () => {
  // D-HNE-OLDNODE-1: process.getBuiltinModule exists from Node 22.3 (and 20.16). On an older Node on PATH the built hook threw
  // "TypeError: process.getBuiltinModule is not a function" at load and exited 1: Copilot CLI shows "Denied by preToolUse hook
  // (hook errored)" for every tool. The hook must load and answer (exit 0) whatever Node runs it. The preload removes the
  // function, so this test runs on any Node.
  const ROOT = join(import.meta.dirname, "..", "..");

  test("[D-HNE-OLDNODE-1] hook bundle loads and exits 0 when process.getBuiltinModule is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-oldnode-"));
    try {
      const out = join(dir, "out");
      const b = spawnSync(process.execPath, [join(ROOT, "build", "build.mjs"), "--out", out], { encoding: "utf8", cwd: ROOT });
      assert.equal(b.status, 0, b.stderr);
      const pre = join(dir, "pre.cjs");
      writeFileSync(pre, "delete process.getBuiltinModule;");
      const input = JSON.stringify({ hookEventName: "preToolUse", sessionId: "old-node", cwd: dir, toolName: "bash", toolArgs: JSON.stringify({ command: "true" }) });
      const r = spawnSync(process.execPath, ["--require", pre, join(out, "hook.mjs"), "--agent", "copilot-cli"], { input, encoding: "utf8", env: { ...process.env, HOME: dir, USERPROFILE: dir } });
      assert.equal(r.status, 0, r.stderr.slice(-400));
      assert.ok(!r.stderr.includes("getBuiltinModule is not a function"), r.stderr.slice(-400));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// serial: sets process.env.HOME in before(); process.env is shared by every test in the file
describe("PRD-v2 section 10: kiro shell hook", () => {
  // D-HF-KIRO-SHELL-1. Kiro CLI V3 docs (kiro.dev/docs/cli/v3/hooks-migration/, updated 2026-10-10): matcher "shell"
  // selects the execute_bash tool, whose hook input is tool_name "execute_bash". Kiro CLI 2.x reference
  // (kiro.dev/docs/cli/2x-reference/): exit code 2 on preToolUse blocks the tool and STDERR is returned to the agent.
  // Kiro PostToolUse cannot replace output, so saving is PreToolUse deny + redirect to ctx_execute, text on stderr.
  const REPO = path.resolve(import.meta.dirname, "../..");
  let root, repo, oldHome;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), "cm-kiro-shell-"));
    repo = path.join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(path.join(repo, "big.log"), "x".repeat(200_000));
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
  });
  after(() => { process.env.HOME = oldHome; rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });

  test("kiro: execute_bash, execute_pwsh and shell are the native shell tools (D-N7-KIRO-1)", () => {
    assert.deepEqual(getAdapter("kiro").nativeTools.shell, ["execute_bash", "execute_pwsh", "shell"]);
  });

  test("kiro: the hook file registers PreToolUse and PostToolUse for @mcp and for shell", () => {
    const dir = path.join(root, "pkg");
    mkdirSync(dir, { recursive: true });
    generateManifests(dir);
    const k = JSON.parse(readFileSync(path.join(dir, "hooks", "kiro.json"), "utf8"));
    for (const trig of ["PreToolUse", "PostToolUse"]) {
      const m = k.hooks.filter((h) => h.trigger === trig).map((h) => h.matcher).sort();
      assert.deepEqual(m, ["@mcp", "shell"], trig);
    }
  });

  test("kiro: encode deny exits 2 with the reason on stderr and empty stdout", () => {
    const ev = { event: "PreToolUse", agent: "kiro", sessionId: "k", cwd: "/p" };
    assert.deepEqual(encode(ev, { kind: "deny", reason: "why" }), { stdout: "", stderr: "why", exitCode: 2 });
  });

  test("kiro: a native shell cat of a large file is denied with exit 2 and a ctx_execute redirect", async () => {
    const out = await handleHook("kiro", {
      hook_event_name: "PreToolUse", session_id: "s-kiro", cwd: repo,
      tool_name: "execute_bash", tool_input: { command: "cat big.log" },
    }, { HOME: root, USERPROFILE: root, PATH: process.env.PATH });
    assert.equal(out.exitCode, 2);
    assert.equal(out.stdout, "");
    assert.ok(out.stderr.includes("ctx_execute"), out.stderr);
  });

  test("kiro: the hook process writes the deny text to stderr and exits 2", () => {
    const r = spawnSync(process.execPath, [path.join(REPO, "src/entries/hook.ts"), "--agent", "kiro"], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s-kiro2", cwd: repo, tool_name: "execute_bash", tool_input: { command: "cat big.log" } }),
      env: { HOME: root, USERPROFILE: root, PATH: process.env.PATH }, encoding: "utf8",
    });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stdout, "");
    assert.ok(r.stderr.includes("ctx_execute"), r.stderr);
  });
});

// serial: tests share the process environment
describe("PRD-v2 section 10: PreToolUse does no store work", () => {
  // D-CI-PERF-8: a PreToolUse hook call needs only the worktree. It must not create the data root (mkdir),
  // realpath it or hash the project key: each is an fs call or CPU on every tool call (D3 gate, windows-latest).
  const ROOT = join(import.meta.dirname, "..", "..");

  test("PreToolUse hook call leaves the data root uncreated", () => {
    const home = mkdtempSync(join(tmpdir(), "cm-pre-nostore-"));
    try {
      const input = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s", cwd: home, tool_name: "Bash", tool_input: { command: "true" } });
      const r = spawnSync(process.execPath, [join(ROOT, "src", "entries", "hook.ts"), "--agent", "claude-code"], { input, encoding: "utf8", env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home } });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(existsSync(join(home, ".context-mode")), false, "hook created the data root on PreToolUse");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("resolveProject: store fields are computed on first read, with the same values", () => {
    const home = mkdtempSync(join(tmpdir(), "cm-pre-lazy-"));
    const work = join(home, "w");
    mkdirSync(work);
    try {
      const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      try {
        const ctx = resolveProject("codex", { env: {}, argv: [], cwd: work });
        assert.equal(existsSync(join(home, ".context-mode")), false, "resolveProject created the data root");
        assert.equal(ctx.worktree, realpathSync.native(work));
        assert.match(ctx.projectKey, /^[0-9a-f]{16}$/);
        assert.equal(ctx.dbPath, join(ctx.projectDir, "context.db"));
        assert.equal(ctx.projectDir.startsWith(realpathSync.native(join(home, ".context-mode"))), true);
        assert.equal(ctx.projectKey, resolveProject("codex", { env: {}, argv: [], cwd: work }).projectKey);
      } finally {
        process.env.HOME = saved.HOME;
        process.env.USERPROFILE = saved.USERPROFILE;
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// serial: tests share one temp repo from before()
describe("PRD-v2 section 10: replace on the live golden payload", () => {
  // Golden test for the main-agent Bash replace (D-M7-RL-1). The payload is a real PostToolUse stdin
  // captured live from Claude Code 2.1.303 (`seq 1 2000`, 8892 bytes of stdout), with session, cwd and
  // transcript paths made neutral. Claude Code 2.1.303 applies updatedToolOutput for Bash only when it
  // has Bash's output shape {stdout, stderr, interrupted}; a plain string is ignored and the model sees
  // the full output (live check in docs/v2/benchmarks.md, "Replace live root cause").
  const ROOT = join(import.meta.dirname, "..", "..");
  const ENTRY = join(ROOT, "src", "entries", "hook.ts");
  const GOLDEN = join(ROOT, "e2e", "fixtures", "claude-code", "2.1.303", "PostToolUse-Bash-large.json");
  let root;
  let repo;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-replace-golden-"));
    repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("D-M7-RL-1: real 2.1.303 Bash PostToolUse payload gives a Bash-shaped, much shorter updatedToolOutput", () => {
    const payload = JSON.parse(readFileSync(GOLDEN, "utf8"));
    payload.cwd = repo;
    payload.transcript_path = join(root, "transcript.jsonl");
    const full = payload.tool_response.stdout;
    assert.equal(Buffer.byteLength(full), 8892);
    const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo };
    const r = spawnSync(process.execPath, [ENTRY, "--agent", "claude-code"], { input: JSON.stringify(payload), cwd: repo, env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const hso = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(hso.hookEventName, "PostToolUse");
    const out = hso.updatedToolOutput;
    // Bash's output shape: Claude Code drops a string here and the model sees the full output.
    assert.equal(typeof out, "object");
    assert.deepEqual(Object.keys(out).sort(), ["interrupted", "stderr", "stdout"]);
    assert.equal(out.stderr, "");
    assert.equal(out.interrupted, false);
    assert.equal(typeof out.stdout, "string");
    // Far below the full output, and it names the indexed source so the model can search the rest.
    assert.ok(Buffer.byteLength(out.stdout) * 10 < Buffer.byteLength(full), `replaced ${Buffer.byteLength(out.stdout)} bytes`);
    assert.ok(out.stdout.includes('source:"s'));
    assert.ok(out.stdout.includes("ctx_search("));
  });
});

// serial: tests set process.env.HOME
describe("PRD-v2 section 10: saving decision per host (ADR-0020)", () => {
  // Spec: docs/v2/adr/0020-hooks-and-skills-on-every-agent.md decision 4 and the "Saving" column. Per host, the
  // dispatch uses the strongest effect the host allows: replace (R) on claude-code and pi; deny + redirect (D) to
  // the ctx tool on PreToolUse everywhere else. One effect per host, no fallback.
  const SAVING = {
    "claude-code": "R", codex: "D", gemini: "R", qwen: "D", "copilot-cli": "R",
    vscode: "D", kiro: "D", zcode: "D", pi: "R", opencode: "D",
  };
  // D-M3-F-9: a hook or detached write keeps its DB handle open by design (A21), and Windows cannot delete
  // an open file, so temp cleanup there is best-effort. The assertions are unchanged.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  const CURL = "curl -s https://x.io/a.json";

  test("ADR-0020: every row has exactly one saving effect and it matches the ADR table", () => {
    assert.deepEqual(ADAPTERS.map((r) => r.id).sort(), Object.keys(SAVING).sort());
    for (const r of ADAPTERS) assert.equal(hasReplace(r) ? "R" : "D", SAVING[r.id], r.id);
  });

  for (const id of Object.keys(SAVING)) {
    test(`ADR-0020: ${id} saving decision for a large-output shell call is ${SAVING[id]}`, async (t) => {
      const dir = mkdtempSync(path.join(tmpdir(), "cm-saving-"));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      const row = getAdapter(id);
      const ev = { event: "PreToolUse", agent: id, sessionId: "s1", cwd: dir,
        tool: { name: "Bash", canonicalName: "Bash", input: { command: CURL } } };
      const d = decide(ev, row, []);
      if (SAVING[id] === "R") {
        assert.notEqual(d.kind, "deny", id + ": a replace host runs the call and replaces the output after");
        return;
      }
      assert.equal(d.kind, "deny", id);
      assert.ok(d.reason.includes(row.toolNamePrefix + "ctx_execute"), id + " redirect names " + row.toolNamePrefix + "ctx_execute");
      const mod = await import(`../../src/adapters/${id}.ts`);
      const out = mod.encode(ev, d);
      const blocks = out.exitCode === 2 || /deny|block/i.test(out.stdout);
      assert.ok(blocks, id + " encode blocks the call: " + JSON.stringify(out).slice(0, 200));
      // kiro: exit 2 returns STDERR to the agent (D-HF-KIRO-SHELL-1); every other host reads stdout.
      const seen = id === "kiro" ? out.stderr : out.stdout;
      assert.ok(seen.includes("ctx_execute"), id + " the host sees the redirect");
    });
  }

  // D-HA-GEMINI-NAMES-1 + D-HA-GEMINI-REPLACE-1: a real Gemini AfterTool payload (native run_shell_command, large
  // llmContent) goes through the hook entry and comes back as decision deny whose reason replaces the result: a short
  // selection plus the ctx_search line, far below the raw size, with the whole output indexed.
  test("ADR-0020: gemini AfterTool run_shell_command with a large output is replaced (decision deny + reason)", async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "cm-saving-"));
    const oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
    t.after(() => { process.env.HOME = oldHome; rmTemp(root); });
    const repo = path.join(root, "repo");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    const lines = [];
    for (let i = 0; i < 4000; i++) lines.push("line " + i + (i === 3001 ? " FATAL disk quota code=QX-7731-ZETA" : " filler words here"));
    const big = lines.join("\n") + "\n";
    const { handleHook } = await import("../../src/core/hooks/dispatch.ts");
    const out = await handleHook("gemini", { session_id: "g1", transcript_path: "/tmp/t.json", cwd: repo, hook_event_name: "AfterTool",
      timestamp: "2026-10-25T00:00:00.000Z", tool_name: "run_shell_command", tool_input: { command: "cat logs/app.log", description: "FATAL" },
      tool_response: { llmContent: big, returnDisplay: big } }, { HOME: root, USERPROFILE: root, PATH: process.env.PATH });
    assert.equal(out.exitCode, 0);
    const j = JSON.parse(out.stdout);
    assert.equal(j.decision, "deny");
    assert.ok(Buffer.byteLength(j.reason) < Buffer.byteLength(big) / 2, "replaced text is under half the raw output");
    assert.ok(j.reason.includes("ctx_search("), "the replace names ctx_search for the rest");
  });
});

// serial: tests set process.env.HOME
describe("PRD-v2 section 10: saving on live payload shapes", () => {
  // Spec: docs/v2/adr/0020-hooks-and-skills-on-every-agent.md decision 4 (every agent saves, one effect per host).
  // Live probe failures of 2026-10-26 (D-HA-QWEN-DUMP-1, D-HA-COPILOT-NAMES-1, D-HA-COPILOT-REPLACE-1, D-HA-PI-PROJECT-1):
  // a `cat` of a large log reached the model whole on qwen 0.26.1, copilot-cli 1.0.103 and pi 1.4.0.
  // Payloads are the host's documented shapes: qwen hooks doc (Claude shape, run_shell_command), copilot SDK
  // types.d.ts (toolName "bash", toolResult {resultType, textResultForLlm}; out modifiedResult), pi 1.4.0
  // dist/core/extensions/types.d.ts (tool_call / tool_result, toolName "bash" / "read").
  // D-M3-F-9: a hook or detached write keeps its DB handle open by design (A21), and Windows cannot delete
  // an open file, so temp cleanup there is best-effort. The assertions are unchanged.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  function bigLog() {
    const lines = [];
    for (let i = 0; i < 4000; i++) lines.push("line " + i + (i === 3001 ? " FATAL disk quota code=QX-7731-ZETA" : " filler words here"));
    return lines.join("\n") + "\n";
  }

  function sandbox(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-live-shape-"));
    const oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
    t.after(() => { process.env.HOME = oldHome; rmTemp(root); });
    const repo = path.join(root, "repo");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    mkdirSync(path.join(repo, "logs"));
    const big = bigLog();
    writeFileSync(path.join(repo, "logs", "app.log"), big);
    return { root, repo, big, env: { HOME: root, USERPROFILE: root, PATH: process.env.PATH } };
  }

  test("qwen PreToolUse run_shell_command `cat <large file>` is denied with the ctx_execute redirect (no replace on qwen)", async (t) => {
    const { repo, env } = sandbox(t);
    const out = await handleHook("qwen", { session_id: "q1", transcript_path: "/tmp/t.json", cwd: repo, hook_event_name: "PreToolUse",
      permission_mode: "default", tool_name: "run_shell_command", tool_input: { command: "cat logs/app.log" }, tool_use_id: "u1" }, env);
    assert.equal(out.exitCode, 0);
    const j = JSON.parse(out.stdout);
    assert.equal(j.hookSpecificOutput.permissionDecision, "deny");
    const abs = path.join(repo, "logs", "app.log");
    assert.equal(j.hookSpecificOutput.permissionDecisionReason, READ_DENY_MESSAGE(abs, statSync(abs).size, getAdapter("qwen").toolNamePrefix));
  });

  test("copilot-cli preToolUse with the host's lowercase `bash` tool reaches the shell rules", async (t) => {
    const { repo, env } = sandbox(t);
    const out = await handleHook("copilot-cli", { hookEventName: "preToolUse", sessionId: "c1", timestamp: 1, cwd: repo,
      toolName: "bash", toolArgs: { command: "curl -s https://x.io/a.json" } }, env);
    assert.equal(out.exitCode, 0);
    const d = copilotDecode({ hookEventName: "preToolUse", sessionId: "c1", cwd: repo, toolName: "bash", toolArgs: { command: "ls" } });
    assert.equal(d.tool.canonicalName, "Bash");
    // copilot-cli has a replace channel (modifiedResult), so the size-guess curl deny does not run: the call runs, then is replaced.
    assert.equal(out.stdout, "");
  });

  test("copilot-cli postToolUse with a large bash result is replaced through modifiedResult", async (t) => {
    const { repo, big, env } = sandbox(t);
    const out = await handleHook("copilot-cli", { hookEventName: "postToolUse", sessionId: "c1", timestamp: 1, cwd: repo,
      toolName: "bash", toolArgs: { command: "cat logs/app.log", description: "FATAL" },
      toolResult: { resultType: "success", textResultForLlm: big } }, env);
    assert.equal(out.exitCode, 0);
    const j = JSON.parse(out.stdout);
    assert.equal(j.modifiedResult.resultType, "success");
    assert.ok(Buffer.byteLength(j.modifiedResult.textResultForLlm) < Buffer.byteLength(big) / 2, "replaced text is under half the raw output");
    assert.ok(j.modifiedResult.textResultForLlm.includes("ctx_search("), "the replace names ctx_search for the rest");
  });

  test("copilot-cli snake_case PostToolUse reads tool_result.text_result_for_llm", () => {
    const ev = copilotDecode({ hook_event_name: "PostToolUse", session_id: "c1", cwd: "/tmp", tool_name: "bash", tool_input: {},
      tool_result: { result_type: "success", text_result_for_llm: "abc" } });
    assert.deepEqual(ev.result, { isError: false, bytes: 3, text: "abc" });
    const failed = copilotDecode({ hook_event_name: "PostToolUse", session_id: "c1", cwd: "/tmp", tool_name: "bash", tool_input: {},
      tool_result: { result_type: "failure", text_result_for_llm: "boom" } });
    assert.equal(failed.result.isError, true);
  });

  async function piHandlers(repo) {
    const { default: piExtension } = await import("../../src/entries/pi.ts");
    const handlers = {};
    piExtension({ on: (e, h) => { handlers[e] = h; }, registerTool: () => {} });
    const ctx = { cwd: repo, sessionManager: { getSessionId: () => "p1" } };
    await handlers.before_agent_start({ systemPrompt: "base" }, ctx);
    return { handlers, ctx };
  }

  test("pi tool_call `read` of a large file is blocked with the ctx_execute redirect", async (t) => {
    const { repo } = sandbox(t);
    const { handlers, ctx } = await piHandlers(repo);
    const r = await handlers.tool_call({ type: "tool_call", toolCallId: "c2", toolName: "read", input: { path: "logs/app.log" } }, ctx);
    assert.equal(r?.block, true);
    assert.ok(r.reason.includes("ctx_execute"));
  });

  test("pi tool_result of a large bash output is replaced (content and details)", async (t) => {
    const { repo, big } = sandbox(t);
    const { handlers, ctx } = await piHandlers(repo);
    const input = { command: "cat logs/app.log" };
    const pre = await handlers.tool_call({ type: "tool_call", toolCallId: "c1", toolName: "bash", input }, ctx);
    assert.equal(pre, undefined, "pi has replace: the bash call runs");
    const r = await handlers.tool_result({ type: "tool_result", toolCallId: "c1", toolName: "bash", input,
      content: [{ type: "text", text: big }], isError: false, details: undefined }, ctx);
    assert.ok(r !== undefined, "the large result is replaced");
    const text = r.content[0].text;
    assert.ok(Buffer.byteLength(text) < Buffer.byteLength(big) / 2, "replaced text is under half the raw output");
    assert.ok(text.includes("ctx_search("));
  });

  // D-HQ-COPILOT-EVENT-1: the documented copilot-cli payload has no hookEventName; the hook must still save.
  test("copilot-cli documented postToolUse payload (no hookEventName) is replaced through modifiedResult", async (t) => {
    const { repo, big, env } = sandbox(t);
    const out = await handleHook("copilot-cli", { sessionId: "c1", timestamp: 1, cwd: repo,
      toolName: "bash", toolArgs: JSON.stringify({ command: "cat logs/app.log" }),
      toolResult: { resultType: "success", textResultForLlm: big } }, env);
    assert.equal(out.exitCode, 0);
    const j = JSON.parse(out.stdout);
    assert.equal(j.modifiedResult.resultType, "success");
    assert.ok(Buffer.byteLength(j.modifiedResult.textResultForLlm) < Buffer.byteLength(big) / 2, "replaced text is under half the raw output");
    assert.ok(j.modifiedResult.textResultForLlm.includes("ctx_search("), "the replace names ctx_search for the rest");
  });

  // D-HA-GEMINI-DUMP-1: gemini-cli 0.65.0 docs/hooks/reference.md BeforeTool: decision "deny" stops the tool and the
  // reason goes to the agent. A one-file shell dump over the cap is stopped before it runs, as on every other deny host.
  test("gemini BeforeTool run_shell_command `cat <large file>` is denied before it runs, with the prefixed ctx_execute redirect", async (t) => {
    const { repo, env } = sandbox(t);
    const out = await handleHook("gemini", { session_id: "g1", transcript_path: "", cwd: repo, hook_event_name: "BeforeTool",
      timestamp: "2026-10-26T00:00:00Z", tool_name: "run_shell_command", tool_input: { command: "cat logs/app.log" } }, env);
    assert.equal(out.exitCode, 0);
    const j = JSON.parse(out.stdout);
    assert.equal(j.decision, "deny");
    const abs = path.join(repo, "logs", "app.log");
    assert.equal(j.reason, READ_DENY_MESSAGE(abs, statSync(abs).size, getAdapter("gemini").toolNamePrefix));
    assert.ok(j.reason.includes("mcp_context-mode_ctx_execute("), j.reason);
  });

  test("gemini BeforeTool run_shell_command `cat <small file>` still runs", async (t) => {
    const { repo, env } = sandbox(t);
    writeFileSync(path.join(repo, "small.txt"), "tiny\n");
    const out = await handleHook("gemini", { session_id: "g1", transcript_path: "", cwd: repo, hook_event_name: "BeforeTool",
      timestamp: "2026-10-26T00:00:00Z", tool_name: "run_shell_command", tool_input: { command: "cat small.txt" } }, env);
    assert.equal(out.exitCode, 0);
    assert.equal(out.stdout, "");
  });

  // D-HA-GEMINI-HINT-1: the AfterTool handle line is the hint the agent runs next. With the session prompt naming the
  // FATAL line, that exact ctx_search call returns the FATAL line (before, the bare command matched nothing in the
  // source and H9 listed the first chunks by position).
  test("gemini AfterTool handle line: the ctx_search it names returns the FATAL line the prompt asks for", async (t) => {
    const { repo, big, env } = sandbox(t);
    const { ctxSearch } = await import("../../src/core/tools/search.ts");
    const { resolveProject } = await import("../../src/core/project/resolve.ts");
    const base = { session_id: "g1", transcript_path: "", cwd: repo, timestamp: "2026-10-26T00:00:00Z" };
    await handleHook("gemini", { ...base, hook_event_name: "BeforeAgent", prompt: "read logs/app.log with a shell cat and tell me the value on the FATAL line" }, env);
    const out = await handleHook("gemini", { ...base, hook_event_name: "AfterTool", tool_name: "run_shell_command",
      tool_input: { command: "cat logs/app.log" }, tool_response: { llmContent: big, returnDisplay: big } }, env);
    const reason = JSON.parse(out.stdout).reason;
    const hl = reason.slice(reason.lastIndexOf("\n") + 1);
    assert.ok(hl.startsWith("mcp_context-mode_ctx_search({queries:["), hl);
    const queries = JSON.parse(hl.slice(hl.indexOf("queries:") + 8, hl.indexOf("], source:") + 1));
    const source = JSON.parse(hl.slice(hl.indexOf("source:") + 7, hl.indexOf("})")));
    const project = resolveProject("gemini", { env, argv: [], cwd: repo });
    const ctx = { project, sessionId: "g1", turn: 1, signal: new AbortController().signal };
    // The output is over SYNC_INDEX_MAX_BYTES, so its chunks are written detached: wait for them, then assert.
    let text = "";
    for (const end = Date.now() + 5000; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
      text = (await ctxSearch.handler({ queries, source }, ctx)).text;
      if (text.includes("QX-7731-ZETA")) break;
    }
    assert.ok(text.includes("FATAL disk quota code=QX-7731-ZETA"), hl + "\n" + text.slice(0, 400));
  });
});

describe("PRD-v2 section 10: readStdin without the stream stack (D-CI-PERF-6)", { concurrency: CONC }, () => {
  // Unit tests for src/core/hooks/io.ts readStdin (DEVIATIONS D-CI-PERF-6): the bytes on stdin come back unchanged,
  // and the read does not build the process.stdin stream stack (net, stream, pipe_wrap) on a pipe.
  const IO = join(import.meta.dirname, "..", "..", "src", "core", "hooks", "io.ts");
  const PROBE = `const { readStdin } = await import(${JSON.stringify(pathToFileURL(IO).href)});
const before = new Set(process.moduleLoadList);
const s = await readStdin();
const added = process.moduleLoadList.filter((m) => !before.has(m));
process.stderr.write(JSON.stringify({ len: Buffer.byteLength(s), net: added.includes("NativeModule net"), stream: added.includes("NativeModule stream") }));
process.stdout.write(s);`;

  function run(input) {
    return spawnSync(process.execPath, ["--input-type=module", "-e", PROBE], { input, encoding: "utf8", maxBuffer: 1 << 26 });
  }

  for (const [name, input] of [["empty", ""], ["small JSON", JSON.stringify({ hook_event_name: "PreToolUse", tool_input: { command: "ls ü 😀" } })], ["1 MiB", "x".repeat(1 << 20)]]) {
    test(`readStdin returns the stdin bytes unchanged: ${name}`, () => {
      const r = run(input);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, input);
      assert.equal(JSON.parse(r.stderr).len, Buffer.byteLength(input));
    });
  }

  test("readStdin on a pipe loads no net or stream module (D-CI-PERF-6)", () => {
    const r = run("{}");
    assert.equal(r.status, 0, r.stderr);
    const info = JSON.parse(r.stderr);
    assert.equal(info.net, false, "net loaded: stdin went through the process.stdin stream");
    assert.equal(info.stream, false, "stream loaded: stdin went through the process.stdin stream");
  });
});

describe("PRD-v2 section 10: hint throttle", { concurrency: CONC }, () => {
  // Unit tests for src/core/hooks/throttle.ts (impl/09 §2, A20, A24; DECISIONS-r9 E5; impl/08 §6.1 step 8).
  // shouldHint(db, sessionId, onceKey, everyN?): boolean. Marker lives in meta under
  // "hint:" + sessionId + ":" + onceKey. Keyed by session id only: no ppid, no "latest session" guess.
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

  async function withDb(fn) {
    const root = mkdtempSync(join(tmpdir(), "cm-throttle-"));
    const db = await openDb(fakeProject(root, "a".repeat(16)));
    try {
      await fn(db, root);
    } finally {
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("once key: fires on the first call only, then never again in the same session", async () => {
    await withDb(async (db) => {
      assert.equal(shouldHint(db, "s1", "grep:s1"), true);
      assert.equal(shouldHint(db, "s1", "grep:s1"), false);
      assert.equal(shouldHint(db, "s1", "grep:s1"), false);
      assert.equal(metaGet(db, "hint:s1:grep:s1"), "1");
    });
  });

  test("GP3/hint-once-per-session (throttle slice): same session id, 3 Reads -> one hint, no tmp dirs made", async () => {
    await withDb(async (db, root) => {
      const fired = [1, 2, 3].map(() => shouldHint(db, "sess-read", "read:sess-read"));
      assert.deepEqual(fired, [true, false, false]);
      // The marker is a meta row, not a file or dir: the project dir holds only the DB files.
      assert.deepEqual(
        readdirSync(join(root, "projects", "a".repeat(16))).filter((f) => !f.startsWith("context.db")),
        [],
      );
    });
  });

  test("different session ids get their own marker", async () => {
    await withDb(async (db) => {
      assert.equal(shouldHint(db, "s1", "bash"), true);
      assert.equal(shouldHint(db, "s2", "bash"), true);
      assert.equal(shouldHint(db, "s1", "bash"), false);
      assert.equal(shouldHint(db, "s2", "bash"), false);
    });
  });

  test("different once keys in one session are independent", async () => {
    await withDb(async (db) => {
      assert.equal(shouldHint(db, "s1", "read:s1"), true);
      assert.equal(shouldHint(db, "s1", "grep:s1"), true);
      assert.equal(shouldHint(db, "s1", "read:s1"), false);
    });
  });

  test("E5: same session id from two processes (two ppids) shares one marker -> one hint", async () => {
    const root = mkdtempSync(join(tmpdir(), "cm-throttle-"));
    const project = fakeProject(root, "b".repeat(16));
    const a = await openDb(project);
    const b = await openDb(project);
    try {
      assert.equal(shouldHint(a, "shared", "bash"), true);
      assert.equal(shouldHint(b, "shared", "bash"), false);
    } finally {
      closeDb(a);
      closeDb(b);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("E5: empty session id -> zero hints and no marker written", async () => {
    await withDb(async (db) => {
      assert.equal(shouldHint(db, "", "bash"), false);
      assert.equal(shouldHint(db, "", "bash"), false);
      assert.equal(shouldHint(db, "", "mcp", 3), false);
      const n = db.raw.prepare("SELECT COUNT(*) AS n FROM meta").get().n;
      assert.equal(n, 0);
    });
  });

  test("everyN: fires on calls 1, 1+N, 1+2N (N=3)", async () => {
    await withDb(async (db) => {
      const fired = [];
      for (let i = 1; i <= 8; i++) fired.push(shouldHint(db, "s1", "mcp:s1", 3));
      assert.deepEqual(fired, [true, false, false, true, false, false, true, false]);
      assert.equal(metaGet(db, "hint:s1:mcp:s1"), "8");
    });
  });

  test("everyN = MCP_HINT_EVERY: fires on the 1st and (1+MCP_HINT_EVERY)th call", async () => {
    await withDb(async (db) => {
      const fired = [];
      for (let i = 1; i <= MCP_HINT_EVERY + 1; i++) fired.push(shouldHint(db, "s1", "mcp:s1", MCP_HINT_EVERY));
      assert.equal(fired[0], true);
      assert.equal(fired.slice(1, MCP_HINT_EVERY).every((f) => f === false), true);
      assert.equal(fired[MCP_HINT_EVERY], true);
    });
  });

  test("everyN = 1 fires on every call", async () => {
    await withDb(async (db) => {
      assert.deepEqual([1, 2, 3].map(() => shouldHint(db, "s1", "mcp", 1)), [true, true, true]);
    });
  });

  test("joins the caller's open write transaction (§2.2 step 4): rollback undoes the marker", async () => {
    await withDb(async (db) => {
      assert.throws(() =>
        withWrite(db, (h) => {
          assert.equal(shouldHint(h, "s1", "bash"), true);
          throw new Error("crash after decide");
        }),
      );
      assert.equal(metaGet(db, "hint:s1:bash"), null);
      // After the rollback the hint is still owed exactly once.
      assert.equal(shouldHint(db, "s1", "bash"), true);
      assert.equal(shouldHint(db, "s1", "bash"), false);
    });
  });

  test("inside a caller transaction the marker commits with the journal row", async () => {
    await withDb(async (db) => {
      withWrite(db, (h) => {
        h.raw.prepare(
          "INSERT INTO events(session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn," +
            " sandbox_bytes, returned_bytes, created_at, accessed_at) VALUES ('s1','/w','claude-code','cmd','Bash',NULL,NULL,1,0,1,'x',0,0,0,0,0)",
        ).run();
        assert.equal(shouldHint(h, "s1", "bash"), true);
      });
      assert.equal(metaGet(db, "hint:s1:bash"), "1");
      assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM events").get().n, 1);
    });
  });
});

// serial: tests set process.env.HOME and REQUIRE_SECURITY_ENV
describe("PRD-v2 section 10: host tool names in hook output", () => {
  // Hook texts name tools the way the host calls them: row.toolNamePrefix + ctx_*. A bare ctx_search on Gemini
  // (mcp_context-mode_ctx_search) names a tool the model cannot call. Covers the 10 hosts and every hook text
  // that names a tool: Read deny, parse-error deny, policy-unreadable deny, the replace handle line, the
  // compact state block and the pointer line. DEVIATIONS D-HL-NAMES-1.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  // Every ctx_* name in the text carries the prefix (an empty prefix leaves the text as is).
  function allPrefixed(text, prefix) {
    for (const name of TOOL_ORDER) {
      const parts = text.split(name);
      for (let i = 0; i < parts.length - 1; i++) {
        if (!parts[i].endsWith(prefix)) return false;
      }
    }
    return true;
  }

  const ev = (row, cwd, name, canonicalName, input) => ({
    event: "PreToolUse", agent: row.id, sessionId: "s1", cwd, tool: { name, canonicalName, input },
  });

  test("all 10 hosts: the Read deny names <prefix>ctx_execute", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-names-"));
    try {
      const big = path.join(dir, "big.log");
      writeFileSync(big, "x".repeat(300 * 1024));
      assert.equal(ADAPTERS.length, 10);
      for (const row of ADAPTERS) {
        const d = decide(ev(row, dir, "Read", "Read", { file_path: big }), row, []);
        assert.equal(d.kind, "deny", row.id);
        assert.equal(d.reason, READ_DENY_MESSAGE(big, 300 * 1024, row.toolNamePrefix), row.id);
        assert.ok(d.reason.includes(row.toolNamePrefix + "ctx_execute("), row.id + ": " + d.reason);
        assert.ok(allPrefixed(d.reason, row.toolNamePrefix), row.id + ": " + d.reason);
      }
    } finally {
      rmTemp(dir);
    }
  });

  test("all 10 hosts: parse-error and policy-unreadable denies name <prefix>ctx_*", () => {
    const old = process.env[REQUIRE_SECURITY_ENV];
    try {
      for (const row of ADAPTERS) {
        const parse = decide(ev(row, "/", "Bash", "Bash", { command: 'ls; rm -rf / "x' }), row, ["Bash(rm -rf:*)"]);
        assert.deepEqual(parse, { kind: "deny", reason: prefixToolNames(PARSE_ERROR_DENY_LINE, row.toolNamePrefix) }, row.id);
        assert.ok(parse.reason.includes(row.toolNamePrefix + "ctx_execute"), row.id + ": " + parse.reason);
        assert.ok(allPrefixed(parse.reason, row.toolNamePrefix), row.id + ": " + parse.reason);
        process.env[REQUIRE_SECURITY_ENV] = "1";
        const unread = decide(ev(row, "/", "Bash", "Bash", { command: "ls" }), row, null);
        delete process.env[REQUIRE_SECURITY_ENV];
        assert.deepEqual(unread, { kind: "deny", reason: prefixToolNames(POLICY_UNREADABLE_LINE, row.toolNamePrefix) }, row.id);
        assert.ok(unread.reason.includes(row.toolNamePrefix + "ctx_doctor"), row.id + ": " + unread.reason);
      }
    } finally {
      if (old === undefined) delete process.env[REQUIRE_SECURITY_ENV];
      else process.env[REQUIRE_SECURITY_ENV] = old;
    }
  });

  test("REPLACE_HANDLE_LINE and renderState take the host prefix; the intent is never rewritten", () => {
    const p = "mcp_context-mode_";
    const line = REPLACE_HANDLE_LINE("grep ctx_search notes", "s1", 9, p);
    assert.equal(line, p + 'ctx_search({queries:["grep ctx_search notes"], source:"s1"}) searches the whole output (9 B).');
    assert.equal(REPLACE_HANDLE_LINE("q", "s1", 9), 'ctx_search({queries:["q"], source:"s1"}) searches the whole output (9 B).');
    const rows = [{
      seq: 1, session_id: "s1", worktree: "/w", agent: "gemini", kind: "prompt", tool: null, key: null, path: null, ok: 1,
      exit_code: null, bytes: 0, body: "fix the login test", turn: 1, sandbox_bytes: 0, returned_bytes: 0, created_at: 0, accessed_at: 0,
    }];
    const block = renderState(rows, 1, undefined, p);
    assert.ok(block.includes("more: " + p + "ctx_search("), block);
    assert.ok(allPrefixed(block, p), block);
  });

  test("gemini AfterTool `cat big.log`: the deny reason names mcp_context-mode_ctx_search", async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "cm-names-gem-"));
    const oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
    t.after(() => { process.env.HOME = oldHome; rmTemp(root); });
    const repo = path.join(root, "repo");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    const lines = [];
    for (let i = 0; i < 4000; i++) lines.push("INFO line " + i + " request ok");
    const big = lines.join("\n") + "\n";
    const env = { HOME: root, USERPROFILE: root, PATH: process.env.PATH };
    const base = { session_id: "g-names", transcript_path: "", cwd: repo, timestamp: "2026-10-26T00:00:00Z" };
    const at = await handleHook("gemini", { ...base, hook_event_name: "AfterTool", tool_name: "run_shell_command",
      tool_input: { command: "cat big.log" }, tool_response: { llmContent: big, returnDisplay: big } }, env);
    const j = JSON.parse(at.stdout);
    assert.equal(j.decision, "deny");
    assert.ok(j.reason.includes("mcp_context-mode_ctx_search({queries:"), j.reason.slice(-300));
    assert.ok(allPrefixed(j.reason, "mcp_context-mode_"), j.reason.slice(-300));
  });
});

// serial: sets process.env.HOME in before(); process.env is shared by every test in the file
describe("PRD-v2 section 10: usage rows", () => {
  // D-M5-arch-2: AuxEventName gains "Usage" (OpenCode step-finish -> eventMap.Usage). handleHook
  // appends one kind:"cost" row per event; plugins never touch context.db directly (impl/12 §1),
  // only handleHook does. Dedup lives in the store (cost-dedup.test.mjs), not in handleHook.
  // D-M5-H1-1: handleHook is called with the impl/09 §4 signature handleHook(agent, raw, env) and
  // returns HookOutput { stdout, exitCode }; OpenCode's allow shape is { stdout: "", exitCode: 0 }.
  let root;
  let home;
  let oldHome;
  let env;

  // D-M3-F-9: detached writes keep their handle open (A21); Windows cleanup is best-effort.
  function rmTemp(dir) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  }

  before(() => {
    root = mkdtempSync(path.join(tmpdir(), "cm-usage-"));
    home = path.join(root, "home");
    mkdirSync(home);
    oldHome = process.env.HOME;
    process.env.HOME = home; process.env.USERPROFILE = home; // resolveConfigDir reads the process env (D-M1-T3-5)
    env = { HOME: home, USERPROFILE: home, PATH: process.env.PATH };
  });

  after(() => {
    process.env.HOME = oldHome;
    rmTemp(root);
  });

  function newRepo() {
    const repo = mkdtempSync(path.join(root, "repo-"));
    execFileSync("git", ["init", "-q", repo]);
    return repo;
  }

  function costRows(sessionId) {
    const projects = path.join(home, ".context-mode", "projects");
    if (!existsSync(projects)) return [];
    const rows = [];
    for (const key of readdirSync(projects)) {
      const f = path.join(projects, key, "context.db");
      if (!existsSync(f)) continue;
      const db = new DatabaseSync(f, { readOnly: true });
      try {
        rows.push(...db.prepare("SELECT * FROM events WHERE kind = 'cost' AND session_id = ?").all(sessionId));
      } finally {
        db.close();
      }
    }
    return rows;
  }

  async function waitRows(sessionId, n) {
    const end = Date.now() + 5000;
    for (;;) {
      const rows = costRows(sessionId);
      if (rows.length >= n || Date.now() > end) return rows;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  function stepFinish(repo, sessionID, turn) {
    return { type: "step-finish", sessionID, directory: repo, turn };
  }

  test("[M5] usage/opencode-step-finish-maps-to-Usage-event", async () => {
    const repo = newRepo();
    const out = await handleHook("opencode", stepFinish(repo, "s-usage-1", 1), env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    const rows = await waitRows("s-usage-1", 1);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.kind, "cost");
    assert.equal(r.agent, "opencode");
    assert.equal(r.turn, 1);
    assert.equal(r.tool, null); // not a ctx_stats call row (D-M4-S3-1)
  });

  test("[M5] usage/writes-one-cost-row-per-handleHook-call", async () => {
    const repo = newRepo();
    // Three step-finish events in one turn: one row (store dedup); a new turn adds one row.
    for (let i = 0; i < 3; i++) {
      const out = await handleHook("opencode", stepFinish(repo, "s-usage-2", 1), env);
      assert.deepEqual(out, { stdout: "", exitCode: 0 });
    }
    await handleHook("opencode", stepFinish(repo, "s-usage-2", 2), env);
    const rows = await waitRows("s-usage-2", 2);
    await new Promise((r) => setTimeout(r, 100)); // let any late detached duplicate land
    const final = costRows("s-usage-2");
    assert.equal(final.length, 2, JSON.stringify(rows));
    assert.deepEqual(final.map((r) => r.turn).sort(), [1, 2]);
  });

  test("[M5] usage/plugins-never-touch-context.db-directly (impl/12 §1): handleHook is the only writer", async () => {
    const repo = newRepo();
    // The plugin entry passes only the raw call-site object: no db handle, no path. handleHook opens the DB.
    const out = await handleHook("opencode", stepFinish(repo, "s-usage-3", 1), env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    assert.equal((await waitRows("s-usage-3", 1)).length, 1);
  });

  test("[M5] usage/no-project-fails-open-with-no-row", async () => {
    const out = await handleHook("opencode", { type: "step-finish", sessionID: "s-usage-4", turn: 1 }, env);
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(costRows("s-usage-4").length, 0);
  });

  // D-M5-P2-4, impl/12 §4.6 step 2: the OpenCode `context` call (SessionStart) reads and clears the
  // pending-compact marker inside handleHook; the plugin never opens context.db.
  test("[M5] usage/opencode-context-takes-pending-compact-once", async () => {
    const repo = newRepo();
    const sid = "s-usage-5";
    const ctx = () => handleHook("opencode", { type: "context", sessionID: sid, directory: repo, turn: 1 }, env);
    const pre = await handleHook("opencode", { type: "compaction", sessionID: sid, directory: repo, turn: 1 }, env);
    assert.deepEqual(pre, { stdout: "", exitCode: 0 });
    const first = await ctx();
    assert.equal(first.exitCode, 0);
    assert.notEqual(first.stdout, "");
    const second = await ctx(); // marker taken: no compact state a second time
    assert.notEqual(second.stdout, first.stdout);
  });
});
