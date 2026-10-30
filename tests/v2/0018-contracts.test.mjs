// ADR-0018 (module map and contracts). One file for the area (ADR-0024, docs/v2/TEST-LAYOUT.md).
// A fix for this area adds its red test inside the describe block of its section. Do not add a new file.
// Concurrent: both sections only read files and constants; they share no state.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path, { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { HOOK_HOST_FILE } from "../../src/core/contracts/constants.ts";
import { CtxError, ERROR_TEXT, formatError } from "../../src/core/contracts/errors.ts";
import { ADAPTERS } from "../../src/adapters/table.ts";

// Concurrent.
describe("ADR-0018: contracts (concurrent)", { concurrency: true }, () => {
  // Moved from tests/v2/contracts/contracts.test.mjs
  describe("ADR-0018 / contracts constants and texts", () => {
    // Unit tests for src/core/contracts (impl/01 §1-§5, impl/00 §3.1-§3.3, TECH-SPEC §6.2a/§11, DECISIONS-r9).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).










    const SRC = join(dirname(fileURLToPath(import.meta.url)), "../../src/core/contracts");

    test("AGENT_IDS has the 10 agents in PRD §3 order", () => {
      assert.deepEqual([...AGENT_IDS], ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode", "pi", "opencode"]);
      assert.equal(AGENT_IDS.length, 10);
    });

    test("TOOL_ORDER has the 9 tool names in order", () => {
      assert.deepEqual([...C.TOOL_ORDER], ["ctx_execute", "ctx_batch", "ctx_index", "ctx_search", "ctx_resume", "ctx_stats", "ctx_doctor", "ctx_upgrade", "ctx_purge"]);
      assert.ok(Object.isFrozen(C.TOOL_ORDER));
    });

    test("NODE_MIN is 24.15.0 and matches the NODE_TOO_OLD text", () => {
      assert.equal(C.NODE_MIN, "24.15.0");
      assert.ok(ERROR_TEXT.NODE_TOO_OLD.includes(C.NODE_MIN));
    });

    test("constants carry the impl/00 §3.2 values", () => {
      const want = {
        SERVER_KEY: "context-mode", OUTPUT_CAP: 16384, STATE_BUDGET: 2048, RESUME_CAP: 2048, REPORT_CAP: 4096,
        POINTER_MIN: 640, MAX_CANDIDATES: 85, DECAY_HALF_LIFE_TURNS: 4, EXEC_TIMEOUT_MS: 600000, KILL_GRACE_MS: 1000,
        DB_TIMEOUT_MS: 5000, INDEX_WRITE_CHUNK: 1048576, INSTRUCTIONS_CAP: 2048, DESCRIPTION_CAP: 1024, SURFACE_CAP: 8000,
        HOOK_P95_MS: 40, HOOK_CPU_OVER_NODE_MS: 20, HOOK_COMBINED_P95_MS: 60, READ_MAX_LINES: 200,
        SYNC_INDEX_MAX_BYTES: 65536, RATIO_SECTION_DECAY: 0.7, MAX_CANDIDATES_TOTAL: 340, SEARCH_PAGE_SIZE: 20,
        MAX_CHUNK_BYTES: 4096, SNIPPET_MAX_BYTES: 800, REQUIRE_SECURITY_ENV: "CONTEXT_MODE_REQUIRE_SECURITY",
        EXIT_SIGTERM_MS: 2000, EXIT_SIGKILL_MS: 5000, GP9_EXIT_MS: 2000, COLD_START_MS: 1000, TOOLS_TTL_MS: 3600000,
        DATA_ROOT: "~/.context-mode", LIVE_MODEL: "claude-sonnet-5", LIVE_EFFORT: "low", LIVE_BUDGET_USD: 0.25,
        LIVE_SKIP_LIMIT: 3, RRF_K: 60, SEARCH_P95_MS: 30, HOOK_TIMEOUT_MS: 5000,
        // store additions (impl/02 §0, DEVIATIONS D-M1-3)
        PROJECT_KEY_HEX_LEN: 16, SCHEMA_VERSION: 5, // r3-ledger: v5 = line_units; D-M5-arch-2: v2 = cost dedup index; D-SEARCH-3: v3 = chunks title + porter; D-SEARCH-4: v4 = trigram table
        RETENTION_IDLE_DAYS: 30, RETENTION_SIZE_CAP_BYTES: 524288000,
        PROJECT_DEAD_IDLE_DAYS: 14, MS_PER_DAY: 86400000,
      };
      for (const [k, v] of Object.entries(want)) assert.equal(C[k], v, k);
      // DECISIONS-r11 (A), D-FU-CMP-PUSH-1: decision rows are scored (700, between toolerr and prompt).
      assert.deepEqual({ ...C.WEIGHT }, { toolerr: 900, decision: 700, prompt: 500, edit: 400, index: 200 });
      assert.equal(C.RECALL_BUDGET_BYTES, 2048);
      assert.equal(C.RECALL_MIN_SCORE, 5);
      assert.ok(Object.isFrozen(C.WEIGHT));
      assert.equal(C.COMPACT_POINTER_LINE, 'context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").');
      assert.equal("READ_HINT_BYTES" in C, false, "READ_HINT_BYTES is retired (DECISIONS-r8)");
      // D-M1-3: impl/00 names win; one name per value, no dead constant.
      for (const k of ["NODE_MIN_VERSION", "INDEX_WRITE_BATCH_BYTES", "OWNER_PID_STALE_CHECK_MS"]) assert.equal(k in C, false, `${k} must not exist (D-M1-3)`);
    });

    test("SNIPPET_MAX_BYTES fits OUTPUT_CAP / SEARCH_PAGE_SIZE (DECISIONS-r9 M21)", () => {
      assert.ok(C.SNIPPET_MAX_BYTES <= Math.floor(C.OUTPUT_CAP / C.SEARCH_PAGE_SIZE));
    });

    test("MCP_HINT_EVERY defaults to 10 without a valid env override", () => {
      const env = process.env.CTX_MCP_HINT_EVERY;
      if (env === undefined) assert.equal(C.MCP_HINT_EVERY, 10);
      assert.ok(Number.isSafeInteger(C.MCP_HINT_EVERY) && C.MCP_HINT_EVERY > 0);
    });

    test("DECAY_X1000 is the 128-entry checked-in table and matches the formula (DECISIONS-r9 M6)", () => {
      assert.equal(C.DECAY_X1000.length, 128);
      assert.ok(Object.isFrozen(C.DECAY_X1000));
      for (let age = 0; age < 128; age++) {
        const want = Math.round(1000 * (0.25 + 0.75 * Math.pow(2, -age / C.DECAY_HALF_LIFE_TURNS)));
        assert.equal(C.DECAY_X1000[age], want, `age ${age}`);
      }
      assert.equal(C.DECAY_X1000[0], 1000);
      assert.equal(C.DECAY_X1000[4], 625);
    });

    const VARS = {
      NODE_TOO_OLD: { v: "22.1.0" }, NO_SQLITE: {}, DB_GONE: {}, NO_PROJECT: { kind: "spawn-cwd" },
      UNKNOWN_FIELD: { f: "query" }, TIMEOUT: { ms: 600000 }, NO_RUNTIME: { lang: "python" },
      NO_GIT_BASH: {}, FETCH_FAILED: { code: "ENOTFOUND" }, SSRF: { host: "127.0.0.1" }, OUTSIDE_ROOT: { p: "/etc/passwd", root: "/repo" },
      INVALID_ARGS: { field: "offset", action: "drop offset with sort:\"timeline\"" }, ONE_OF_INPUT: { names: "code, file" },
      SPAWN_FAILED: { detail: "ENOENT" },
      DB_CORRUPT: {}, SCHEMA_STALE: { found: 2, want: 1 }, NO_GIT_DIR: { path: "/repo" }, NO_HOME: { name: "HOME" },
      // tools-ops additions (impl/07 A-T2)
      PLUGIN_ROOT_MISSING: { agent: "pi", path: "/home/u/.context-mode/plugins/pi/current" }, BUNDLE_HASH_MISMATCH: {},
      CONFIG_PARSE_FAILED: { agent: "codex", path: "/home/u/.codex/config.toml", format: "toml" },
    };
    const EXPECTED = {
      NODE_TOO_OLD: "Node 22.1.0 is below 24.15.0. Fix: install Node 24.15.0 or later.",
      NO_SQLITE: "node:sqlite failed to load. Fix: run ctx_doctor.",
      DB_GONE: "context.db path vanished. Fix: run ctx_doctor.",
      NO_PROJECT: "Project source spawn-cwd is missing. Fix: run ctx_doctor.",
      UNKNOWN_FIELD: 'Unknown field "query". Fix: use "queries".',
      TIMEOUT: "Timed out after 600000 ms. Fix: pass background: true.",
      NO_RUNTIME: "No python runtime on PATH. Fix: install it or pick another language.",
      NO_GIT_BASH: "Git Bash not found. Fix: install Git for Windows.",
      FETCH_FAILED: "Fetch failed: ENOTFOUND. Fix: check the URL or proxy.",
      SSRF: "Blocked private address 127.0.0.1. Fix: use a public URL.",
      OUTSIDE_ROOT: "Path /etc/passwd is outside the project. Fix: use a path inside /repo.",
      INVALID_ARGS: 'Invalid argument offset. Fix: drop offset with sort:"timeline".',
      ONE_OF_INPUT: "Pass exactly one of code, file. Fix: drop the extra field.",
      SPAWN_FAILED: "Failed to start the process: ENOENT. Fix: check the command and PATH.",
      // store additions (DEVIATIONS D-M1-2)
      DB_CORRUPT: "context.db failed integrity_check. Fix: run ctx_doctor.",
      SCHEMA_STALE: "context.db schema is version 2, expected 1. Fix: run ctx_doctor.",
      NO_GIT_DIR: "No git repository at /repo. Fix: run context-mode inside a git repository.",
      NO_HOME: "Env var HOME is not set. Fix: set HOME to your home directory.",
      // tools-ops additions (impl/07 §1 Errors, §2 Errors, §6 Errors; A-T2)
      PLUGIN_ROOT_MISSING: "Plugin root for pi not found at /home/u/.context-mode/plugins/pi/current. Fix: run ctx_upgrade.",
      BUNDLE_HASH_MISMATCH: "Fetched bundle hash does not match SHA256SUMS. Fix: run ctx_upgrade again.",
      CONFIG_PARSE_FAILED: "codex config at /home/u/.codex/config.toml did not parse as toml. Fix: fix the syntax error and re-run ctx_upgrade.",
    };

    test("ERROR_TEXT has exactly the 21 codes, each one line with '. Fix: ' (A-C6, impl/07 A-T2)", () => {
      assert.equal(Object.keys(ERROR_TEXT).length, 21);
      assert.deepEqual(Object.keys(ERROR_TEXT).sort(), Object.keys(EXPECTED).sort());
      assert.ok(Object.isFrozen(ERROR_TEXT));
      for (const [code, text] of Object.entries(ERROR_TEXT)) {
        assert.ok(text.includes(". Fix: "), code);
        assert.equal(text.includes("\n"), false, code);
      }
      for (const k of ["ERR_NODE_VERSION", "ERR_DB_VANISHED", "ERR_PATH_ESCAPE", "ERR_CLEANUP_LOCKED", "ERR_DB_CORRUPT", "ERR_SCHEMA_STALE", "ERR_GIT_COMMON_DIR"]) {
        assert.equal(k in ERROR_TEXT, false, `${k} is mapped or dropped (D-M1-2)`);
      }
    });

    test("every formatted error is one line with '. Fix: ' and no '<' left (A-C6)", () => {
      for (const code of Object.keys(ERROR_TEXT)) {
        const line = new CtxError(code, VARS[code]).toLine();
        assert.ok(line.includes(". Fix: "), code);
        assert.equal(line.includes("\n"), false, code);
        assert.equal(line.includes("<"), false, code);
      }
    });

    test("SCHEMA_STALE formats found (want + 1) and want (SCHEMA_VERSION)", () => {
      const found = C.SCHEMA_VERSION + 1;
      assert.equal(formatError("SCHEMA_STALE", { found, want: C.SCHEMA_VERSION }), `context.db schema is version ${found}, expected ${C.SCHEMA_VERSION}. Fix: run ctx_doctor.`);
    });

    test("every error code formats with its vars", () => {
      for (const code of Object.keys(EXPECTED)) {
        const out = formatError(code, VARS[code]);
        assert.equal(out, EXPECTED[code], code);
        assert.equal(out.includes("<"), false, code);
      }
    });

    test("formatError throws a plain Error on a missing var (A-C3)", () => {
      assert.throws(() => formatError("NODE_TOO_OLD", {}), (e) => e instanceof Error && !(e instanceof CtxError) && e.message === "formatError: missing var v for NODE_TOO_OLD");
      assert.throws(() => formatError("OUTSIDE_ROOT", { p: "/x" }), /missing var root for OUTSIDE_ROOT/);
    });

    test("CtxError carries code, vars and the one-line message; toLine() === message", () => {
      const e = new CtxError("TIMEOUT", { ms: 1000 });
      assert.ok(e instanceof Error);
      assert.equal(e.code, "TIMEOUT");
      assert.deepEqual(e.vars, { ms: 1000 });
      assert.equal(e.message, "Timed out after 1000 ms. Fix: pass background: true.");
      assert.equal(e.toLine(), e.message);
      const bare = new CtxError("DB_GONE");
      assert.deepEqual(bare.vars, {});
      assert.equal(bare.toLine(), EXPECTED.DB_GONE);
    });

    test("contracts source: no regex, imports only node:* or local type re-exports", () => {
      const files = readdirSync(SRC).filter((f) => f.endsWith(".ts")).sort();
      assert.deepEqual(files, ["agents.ts", "client-map.ts", "constants.ts", "errors.ts", "types.ts"]);
      for (const f of files) {
        const src = readFileSync(join(SRC, f), "utf8");
        assert.equal(/new RegExp|\.match\(|\.matchAll\(|\.replace\(|\.replaceAll\(|\.split\(\s*\//.test(src), false, `${f}: regex use`);
        for (const line of src.split("\n")) {
          const t = line.trim();
          // a re-export statement only; a string constant that contains " from " is not an import (M4 RESUME_NO_SESSION_LINE)
          const reExport = ["export {", "export *", "export type {", "export type *"].some((h) => t.startsWith(h)) && t.includes(" from ");
          if (!t.startsWith("import ") && !reExport) continue;
          const ok = t.includes('"node:') || t.includes('from "./agents.js"');
          assert.ok(ok, `${f}: forbidden import: ${t}`);
        }
      }
    });

    // M2 (impl/03 §2 step 3, §6 step 5; impl/04 §2.1, §2.3 steps 9, 11, 15; DEVIATIONS D-M2-2, D-M2-3).
    test("[M2] sandbox and tools-exec constants carry the impl/03, impl/04 values", () => {
      assert.equal(C.FETCH_MAX_HOPS, 5);
      assert.equal(C.PATHEXT_DEFAULT, ".COM;.EXE;.BAT;.CMD");
      assert.equal(C.SOURCE_LABEL_MAX_CHARS, 80);
      assert.equal(C.CANCELLED_LINE, "Cancelled.");
      assert.equal(C.BACKGROUND_REPLY_PREFIX, "started in background, pid ");
      assert.deepEqual([...C.EXEC_LANGUAGES], ["shell", "powershell", "javascript", "typescript", "python"]);
      assert.ok(Object.isFrozen(C.EXEC_LANGUAGES));
    });

    test("[M2] types.ts declares ToolReply.journal, TimelineRow and the four M2 tool inputs", () => {
      const src = readFileSync(join(SRC, "types.ts"), "utf8");
      for (const name of ["export interface TimelineRow", "export type TimelineOrigin", "export type SearchSort",
        "export interface ExecuteInput", "export interface BatchInput", "export interface CtxIndexInput", "export interface CtxSearchInput",
        "export interface JournalFacts"]) {
        assert.ok(src.includes(name), name);
      }
      assert.ok(src.includes("journal?: JournalFacts"), "ToolReply.journal (D-M2-2)");
    });

    // M3 (impl/08 §1.1, §2.1, §2.3 step 2a, §2.4, §6.1 steps 3, 5b, 5d, 6, §6.2; DECISIONS-r9 E2, E4, P2;
    // DEVIATIONS D-M3-arch-5: every M3 policy constant and text template lives in constants.ts).
    test("[M3] MAX_NEST_DEPTH is 32 (impl/08 §2.3 step 2a, ADR-0008 Parse errors)", () => {
      assert.equal(C.MAX_NEST_DEPTH, 32);
    });

    test("[M3] Read deny: constants.ts holds only READ_DENY_FIXED_CAP; the text is the src/prompt template (D-DU-DENY-1)", () => {
      assert.equal(C.READ_DENY_MESSAGE, undefined);
      assert.equal(C.READ_DENY_FIXED_CAP, 120);
      // golden text, byte cap and lint: tests/v2/policy/read-deny.test.mjs
    });

    test("[M3] deny templates carry the ADR-0008 'Deny message' text per kind (impl/08 §6.2)", () => {
      assert.deepEqual({ ...C.DENY_WHAT }, {
        curl: "This curl/wget call", http: "This inline HTTP call", build: "This build command", webfetch: "WebFetch",
      });
      assert.ok(Object.isFrozen(C.DENY_WHAT));
      assert.equal(C.DENY_PREFIX, "context-mode: ");
      assert.equal(C.DENY_WHAT_SUFFIX, " sends its body into the conversation.");
      assert.equal(C.DENY_RUN_HERE_LINE, "Run it here instead; the full output is indexed and only the part that matches your intent comes back.");
      assert.equal(C.DENY_TOOL_LABEL, "Tool: ");
      assert.equal(C.DENY_INTENT_DEFAULT, "state what you need");
      assert.equal(C.DENY_EXEC_TOOL, "ctx_execute");
      assert.equal(C.DENY_WEBFETCH_TOOLS.length, 2);
      assert.deepEqual([...C.DENY_WEBFETCH_TOOLS], ["ctx_index", "ctx_search"]); // impl/08 B1: v2 names, not ctx_fetch_and_index
      assert.ok(Object.isFrozen(C.DENY_WEBFETCH_TOOLS));
      for (const t of [C.DENY_EXEC_TOOL, ...C.DENY_WEBFETCH_TOOLS]) assert.ok(C.TOOL_ORDER.includes(t), t);
    });

    test("[M3] user-deny, policy-unreadable and parse-error deny lines (impl/08 §6.1 steps 3, 5b; DECISIONS-r9 E2)", () => {
      assert.equal(C.USER_DENY_REASON_PREFIX, "Blocked by security policy: matches deny pattern ");
      assert.equal(C.POLICY_UNREADABLE_LINE, "context-mode: your deny rules could not be read. Fix: run ctx_doctor.");
      assert.equal(C.PARSE_ERROR_DENY_LINE, "context-mode: could not parse this command; it may be blocked by your own rules. Run it through ctx_execute instead.");
    });

    test("[M3] structurally bounded command set is the DECISIONS-r9 E4 list (impl/08 §6.1 step 5d)", () => {
      assert.deepEqual([...C.BOUNDED_COMMANDS], ["pwd", "whoami", "uname", "id", "realpath", "ln"]);
      assert.deepEqual([...C.BOUNDED_GIT_SUBCOMMANDS], ["status"]);
      assert.deepEqual([...C.VERSION_PROBE_FLAGS], ["--version", "-v"]);
      assert.deepEqual([...C.BOUNDED_UNLESS_VERBOSE], ["cp", "mv", "rm"]);
      assert.deepEqual([...C.VERBOSE_FLAGS], ["-v", "--verbose"]);
      for (const k of ["BOUNDED_COMMANDS", "BOUNDED_GIT_SUBCOMMANDS", "VERSION_PROBE_FLAGS", "BOUNDED_UNLESS_VERBOSE", "VERBOSE_FLAGS"]) {
        assert.ok(Object.isFrozen(C[k]), k);
      }
      assert.equal("CONTEXT_MODE_BASH_NUDGE_MIN_COMMAND_BYTES" in C, false, "E3: not ported");
    });

    test("[M3] jq filter whitelist is the closed impl/08 §2.4 set", () => {
      assert.deepEqual({ ...C.JQ_WHITELIST }, { identity: ".", length: "length", pipeLength: "| length", fieldSep: "." });
      assert.ok(Object.isFrozen(C.JQ_WHITELIST));
    });

    test("[M3] types.ts declares Token, TokenKind, SimpleCommand, ParseResult, ParseErrorConstruct, DenyKind", () => {
      const src = readFileSync(join(SRC, "types.ts"), "utf8");
      for (const name of ['export type TokenKind = "word" | "op" | "io" | "unhandled";',
        "export interface Token { kind: TokenKind; text: string; start: number; end: number; }",
        "export interface SimpleCommand", "export type ParseResult", "export type ParseErrorConstruct", "export type DenyKind"]) {
        assert.ok(src.includes(name), name);
      }
      for (const c of ["process-substitution", "unterminated-quote", "unterminated-heredoc", "coproc", "select", "nesting-too-deep"]) {
        assert.ok(src.includes(`"${c}"`), c);
      }
      for (const f of ["argv0: string;", "args: string[];", "redirectsToFile: boolean;", "endsInBoundedSink: boolean;", "raw: string;",
        "insideConstruct?: string;", "wrappedBy?: string[];"]) {
        assert.ok(src.includes(f), `SimpleCommand ${f}`);
      }
    });

    // no-literal-number lint on src/core/policy (impl/08 header: "Every number used below is a name from constants.ts;
    // no literal numbers"). CI-side check, so a regex is fine here. 0 and 1 stay legal (index start and step, not tunable values).
    const POLICY = join(SRC, "../policy");
    function numberLiterals(src) {
      const out = [];
      let i = 0;
      const n = src.length;
      while (i < n) {
        const ch = src[i];
        if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
        if (ch === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
        if (ch === '"' || ch === "'" || ch === "`") {
          i++;
          while (i < n && src[i] !== ch) i += src[i] === "\\" ? 2 : 1;
          i++;
          continue;
        }
        if (/[A-Za-z_$]/.test(ch)) { while (i < n && /[\w$]/.test(src[i])) i++; continue; }
        if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
          const m = /^(0[xXbBoO][0-9a-fA-F_]+|[0-9_]*\.?[0-9_]+(?:[eE][+-]?[0-9]+)?n?)/.exec(src.slice(i));
          const lit = m ? m[0] : ch;
          if (lit !== "0" && lit !== "1") out.push(`${lit}@${src.slice(0, i).split("\n").length}`);
          i += lit.length;
          continue;
        }
        i++;
      }
      return out;
    }

    test("[M3] no-literal-number lint: the scanner flags numbers, not strings, comments or names", () => {
      assert.deepEqual(numberLiterals('const a = 32; // 64\nconst b = "128"; /* 7 */ const c2 = x[0] + 1; f(0.7, 1e3);'),
        ["32@1", "0.7@2", "1e3@2"]);
    });

    test("[M3] no-literal-number lint on src/core/policy (only 0 and 1)", () => {
      const files = existsSync(POLICY) ? readdirSync(POLICY).filter((f) => f.endsWith(".ts")) : [];
      for (const f of files) {
        assert.deepEqual(numberLiterals(readFileSync(join(POLICY, f), "utf8")), [], `${f}: use a constants.ts name`);
      }
    });

    // M4 (impl/06 §1-§6 constants table and exact error texts; ADR-0009 §8.2, DECISIONS-r6 D3; DEVIATIONS D-M4-arch-2..5).
    // impl/06 texts are tool reply lines, not ERROR_TEXT keys (same rule as CANCELLED_LINE): ERROR_TEXT keeps its 17 codes (M5 adds 3: impl/07 A-T2).
    test("[M4] ctx_resume reply lines are the impl/06 §4 texts", () => {
      assert.equal(C.RESUME_UNKNOWN_FIELD_LINE, "ctx_resume: unknown field — only session and seq are accepted.");
      assert.equal(C.RESUME_NO_SESSION_LINE, "ctx_resume: no session id — pass session or call from an active session.");
      assert.equal(C.RESUME_NO_ROW_LINE(42), "ctx_resume: no row at seq 42 for this session.");
      assert.equal(C.RESUME_EMPTY_LINE, "ctx_resume: no journal rows for this session yet.");
    });

    test("[M4] ctx_stats reply text is the impl/06 §5 text", () => {
      assert.equal(C.STATS_UNKNOWN_FIELD_LINE, "ctx_stats: unknown field — this tool takes no arguments.");
      assert.equal(C.STATS_SUMMARY(81.2, 40), "ctx_stats: 81.2% kept out all-time, 40% this session.");
      assert.deepEqual([...C.STATS_COLUMNS], ["Scope", "Produced", "Returned", "Saved", "Reduction %"]);
      assert.ok(Object.isFrozen(C.STATS_COLUMNS));
      assert.equal(C.STATS_NO_DATA, "no data — no tool calls recorded yet");
      assert.equal(C.PERCENT_SCALE, 100); // reduction_pct = saved / max(1, produced) * 100
    });

    test("[M4] ctx_purge reply text and scopes are the impl/06 §6 texts", () => {
      assert.deepEqual([...C.PURGE_SCOPES], ["session", "source", "project"]);
      assert.ok(Object.isFrozen(C.PURGE_SCOPES));
      assert.equal(C.PURGE_NO_SCOPE_LINE, "ctx_purge: pick one scope — session, source, or project.");
      assert.equal(C.PURGE_MANY_SCOPES_LINE, "ctx_purge: pick only one scope — session, source, or project.");
      assert.equal(C.PURGE_BUSY_LINE, "ctx_purge: database busy — try again.");
      assert.equal(C.PURGE_SUMMARY(7, "session"), "ctx_purge: deleted 7 rows (scope: session). This cannot be undone.");
      assert.equal(C.SQLITE_BUSY_CODE, 5); // primary code, read through SQLITE_PRIMARY_CODE_MASK like SQLITE_CORRUPT_CODE
    });

    test("[M4] DECAY_SCALE undoes the x1000 of DECAY_X1000 (impl/06 §2 step 6)", () => {
      assert.equal(C.DECAY_SCALE, 1000);
      assert.equal(C.DECAY_X1000[0], C.DECAY_SCALE);
    });

    test("[M4] reserved decision label and decision row keys (ADR-0009 §8.2, DECISIONS-r6 D3, D-M4-arch-5)", () => {
      assert.equal(C.DECISION_SOURCE, "decision");
      assert.equal(C.DECISION_USER_LABEL, "decision (user)");
      assert.equal(C.DECISION_TOOL, "AskUserQuestion");
      assert.equal(C.DECISION_ANSWERS_KEY, "answers");
      assert.equal(C.DECISION_OPTION_KEY, "option");
      assert.equal(C.DECISION_LABEL_JOIN, " | ");
    });

    test("[M4] types.ts declares the impl/06 compaction and tool input types", () => {
      const src = readFileSync(join(SRC, "types.ts"), "utf8");
      for (const name of ["export type CandidateSection", "export interface Candidate {", "export interface ScoredCandidate extends Candidate",
        "export interface CtxResumeInput", "export interface CtxStatsInput", "export interface CtxPurgeInput"]) {
        assert.ok(src.includes(name), name);
      }
      for (const s of ['"last_request"', '"open_errors"', '"changed_files"', '"earlier_requests"', '"indexed_sources"']) assert.ok(src.includes(s), s);
      for (const f of ["section: CandidateSection;", "repeatCount: number;", "pinned: boolean;", "score: number;"]) assert.ok(src.includes(f), f);
    });

    // impl/06: "This module owns none of its own constants" -> the no-literal-number lint covers every M4 file.
    const M4_FILES = ["compaction/candidates.ts", "compaction/score.ts", "compaction/render.ts", "tools/resume.ts",
      "tools/stats.ts", "tools/purge.ts", "hooks/decision.ts"].map((f) => join(SRC, "..", f));
    test("[M4] no-literal-number lint on M4 files (only 0 and 1)", () => {
      for (const f of M4_FILES.filter((p) => existsSync(p))) {
        assert.deepEqual(numberLiterals(readFileSync(f, "utf8")), [], `${f}: use a constants.ts name`);
      }
    });

    // M5 (impl/07 §0 A-T1, A-T2; DEVIATIONS D-M5-arch-2, D-M5-arch-5).
    test("[M5] types.ts declares the impl/07 §0 tools-ops types (A-T1)", () => {
      const src = readFileSync(join(SRC, "types.ts"), "utf8");
      for (const s of [
        'export type DoctorCheckId = "D1" | "D2" | "D3" | "D4" | "D5" | "D5b" | "D6" | "D7" | "D8" | "D9" | "D10" | "D11";',
        "export interface DoctorRow {", "id: DoctorCheckId;", "label: string;", 'status: "PASS" | "FAIL" | "UNKNOWN";',
        "detail: string;", "fixCommand?: string;",
        "export interface V1Finding { file: string; path: string; reason: string; }",
        'export type UpgradeMode = "upgrade" | "uninstall";',
        "export interface UpgradeChangeRow { area: string; before: string; after: string; }",
        "export interface HostConfigEdit { path: string; before: unknown; after: unknown; }",
      ]) assert.ok(src.includes(s), s);
    });

    test("[M5] AuxEventName adds Usage (D-M5-arch-2)", () => {
      const src = readFileSync(join(SRC, "types.ts"), "utf8");
      assert.ok(src.includes('export type AuxEventName = "PreCompact" | "Usage";'));
    });

    test("[M5] tools-ops error keys are the impl/07 texts (A-T2)", () => {
      assert.equal(ERROR_TEXT.PLUGIN_ROOT_MISSING, "Plugin root for <agent> not found at <path>. Fix: run ctx_upgrade.");
      assert.equal(ERROR_TEXT.BUNDLE_HASH_MISMATCH, "Fetched bundle hash does not match SHA256SUMS. Fix: run ctx_upgrade again.");
      assert.equal(ERROR_TEXT.CONFIG_PARSE_FAILED, "<agent> config at <path> did not parse as <format>. Fix: fix the syntax error and re-run ctx_upgrade.");
      const e = new CtxError("CONFIG_PARSE_FAILED", VARS.CONFIG_PARSE_FAILED);
      assert.equal(e.code, "CONFIG_PARSE_FAILED");
      assert.equal(e.toLine(), EXPECTED.CONFIG_PARSE_FAILED);
    });

    test("[M5] release constants for doctor D1 (D-M5-arch-5)", () => {
      assert.equal(C.RELEASE_REPO_URL, "https://github.com/mksglu/context-mode.git");
      assert.equal(C.RELEASE_BRANCH, "release");
      assert.equal(C.BUNDLE_SHA_DEFINE, "__CTX_BUNDLE_SHA__");
      // dev/test build: no esbuild define, so the sha is unset (D1 reports UNKNOWN "dev build")
      assert.equal(C.BUNDLE_SHA, undefined);
      assert.equal("BUNDLE_SHA" in C, true);
    });

    // M5-C2 (impl/07 §1-§6, impl/12 §3.1/§4.1, ADR-0010, ADR-0011; DEVIATIONS D-M5-C2-1..3).
    test("[M5] doctor check order, labels and D5 fixture (ADR-0010, impl/07 §5)", () => {
      assert.deepEqual(C.DOCTOR_CHECK_ORDER, ["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"]);
      assert.deepEqual(Object.keys(C.DOCTOR_LABEL), C.DOCTOR_CHECK_ORDER);
      assert.equal(C.DOCTOR_LABEL.D1, "version");
      assert.equal(C.DOCTOR_LABEL.D8, "context.db");
      assert.equal(C.HOOK_FIXTURE_DIR, "fixtures");
      assert.equal(C.HOOK_FIXTURE_FILE, "hook-roundtrip.json");
      assert.equal(C.DOCTOR_FAIL_LINE("codex", "D8", "integrity_check failed", "run ctx_upgrade"), "FAIL codex: D8 — integrity_check failed. Fix: run ctx_upgrade");
      assert.equal(C.REPORT_HEADER, "| Check | Status | Detail | Fix |");
      assert.equal(C.REPORT_SOURCE_LABEL, "ctx_doctor:report");
      assert.equal(C.REPORT_REST_PREFIX, "Rows not shown here are stored in full. Read them with: ");
      assert.equal(C.D8_STALE_SCHEMA_DETAIL(1, 2), "stale schema (v1, expected v2)");
      assert.equal(C.D9_INDEX_DETAIL(0, 0), "0 sources, 0 chunks indexed");
      assert.equal(C.D5_CODEX_UNTRUSTED_DETAIL, "Codex hooks not trusted");
    });

    test("[M5] plugin root segments (impl/07 §1, §6)", () => {
      assert.equal(C.PLUGIN_CACHE_DIR_NAME, "cache");
      assert.equal(C.PLUGIN_MARKETPLACE_NAME, "context-mode");
      assert.equal(C.DATA_PLUGINS_DIR_NAME, "plugins");
      assert.equal(C.PLUGIN_CURRENT_LINK, "current");
      assert.equal(C.PLUGIN_ROLLBACK_GENERATIONS, 1);
      assert.equal(C.RELEASE_SUMS_FILE, "SHA256SUMS");
      assert.equal(C.EXTENSIONS_DIR_NAME, "extensions");
      assert.deepEqual(Object.keys(C.AGENT_HOME_DIR).sort(), [...AGENT_IDS].sort());
    });

    test("[M5] ADR-0011 v1 names", () => {
      assert.ok(C.V1_SCRIPT_NAMES.includes("pretooluse.mjs"));
      assert.ok(!C.V1_SCRIPT_NAMES.includes("hook.mjs"), "the v2 hook entry is never a v1 script name");
      assert.equal(C.V1_HOOK_COMMAND, "context-mode hook");
      assert.equal(C.V1_CODEX_HOOK_COMMAND, "context-mode hook codex");
      assert.equal(C.V1_CACHE_HEAL_NAME, "context-mode-cache-heal");
      assert.deepEqual(C.V1_CACHE_HEAL_EXTS, [".mjs", ".sh"]);
      assert.equal(C.V1_PI_PACKAGE, "npm:context-mode");
      assert.equal(C.V1_OPENCODE_PLUGIN_SPEC, "context-mode");
      assert.equal(C.V1_TMP_PREFIX, "context-mode-");
      assert.equal(C.PI_GIT_PACKAGE, "git:github.com/mksglu/context-mode@release");
      assert.equal(C.OPENCODE_GIT_SPEC, "git+https://github.com/mksglu/context-mode.git#release");
      assert.equal(C.UPGRADE_HOST_COMMAND.codex, "rewrite config.toml's [mcp_servers.context-mode*] block to the v2 entry, then restart Codex");
    });

    test("[M5] Pi/OpenCode entry ids (impl/12 A21, A28)", () => {
      assert.equal(C.PLUGIN_ID, "context-mode");
      assert.equal(C.PLUGIN_NAME, "context-mode");
      assert.equal(C.OPENCODE_TOOL_PREFIX, "context-mode_");
    });

    test("[M5] types.ts declares host-config and tool input types", () => {
      const src = readFileSync(join(SRC, "types.ts"), "utf8");
      for (const s of [
        'export type HostConfigFormat = "json" | "jsonc" | "toml";',
        "export interface HostConfigResult { text: string; format: HostConfigFormat; edits: HostConfigEdit[]; }",
        "export interface CtxUpgradeInput { mode?: UpgradeMode; confirmDelete?: boolean; }",
        "export interface CtxDoctorInput {}",
      ]) assert.ok(src.includes(s), s);
    });

    // M5-U1 (impl/07 §5-§6; DEVIATIONS D-M5-U1-1..6): constants for the wave-2 ops split files.
    test("[M5] wave-2 doctor and upgrade split-file constants (D-M5-U1-6)", () => {
      assert.equal(C.SQLITE_MODULE, "node:sqlite");
      assert.equal(C.NODE_VERSION_PREFIX, "v");
      assert.equal(C.LS_REMOTE_FIELD_SEP, "\t");
      assert.equal(C.GIT_SHA_HEX_LEN, 40);
      assert.equal(C.D3_DETAIL(["MCP entry", "hook timeout"]), "wrong: MCP entry, hook timeout");
      assert.equal(C.D5_SLOW_DETAIL(55), `hook round trip took 55 ms, over ${C.HOOK_P95_MS} ms`);
      assert.equal(C.D10_DETAIL("deny-reason"), "enforcement mode: deny-reason");
      assert.equal(C.PRAGMA_INTEGRITY_CHECK, "PRAGMA integrity_check");
      assert.deepEqual(C.DB_SIBLING_SUFFIXES, ["", "-wal", "-shm"]);
      assert.equal(C.D8_HEALED_RECREATE_DETAIL("1"), `healed by recreate — old data kept at context.db.1${C.HEAL_BACKUP_SUFFIX}`);
      assert.equal(C.SUMS_LINE_END, "\n");
      assert.equal(C.HASH_ENCODING, "hex");
      assert.equal(C.OWNER_STOP_EXT, ".stop");
      assert.equal(C.UPGRADE_DATA_DELETED, "user data deleted");
      assert.deepEqual([...C.OPS_SPLIT_FILES].sort(), ["doctor-config.ts", "doctor-db.ts", "doctor-env.ts", "doctor-heal.ts", "doctor-hook.ts", "host-write.ts", "plugin-swap.ts", "release-fetch.ts", "uninstall.ts", "v1-remove.ts", "verify-sums.ts"]);
    });

    test("[M5] D-INST-7: the temp-file finding text says it is report only and nothing needs doing", () => {
      assert.match(C.V1_REASON.tmpFile, /context-mode-\*/);
      assert.match(C.V1_REASON.tmpFile, /report only, no action needed/);
    });

    test("SEARCH_REPLY_HITS is 5 and not above SEARCH_PAGE_SIZE (D-SEARCH-REPLY-1)", async () => {
      assert.equal(C.SEARCH_REPLY_HITS, 5);
      assert.ok(C.SEARCH_REPLY_HITS <= C.SEARCH_PAGE_SIZE);
    });
  });

  // Moved from tests/v2/contracts/hook-file-single-source.test.mjs
  describe("ADR-0018 / single hook file source", () => {
    // VS-WIN-6 / D-WIN-VSCODE-HOOKFILE-1: one hook file location per agent. ADAPTERS[].hookChannel (what setup writes,
    // ADR-0020) and HOOK_HOST_FILE (what doctor D3 reads) must name the same file, on every OS.
    // The test builds each expected path with path.join, so it holds on Windows and POSIX alike.







    const POSIX_SEP = "/";

    test("HOOK_HOST_FILE agrees with every adapter hookChannel (root kind and file path)", () => {
      const kinds = { "home-file": "home", package: "plugin" };
      for (const row of ADAPTERS) {
        const spec = HOOK_HOST_FILE[row.id];
        const ch = row.hookChannel;
        if (ch.kind === "in-process") { assert.equal(spec, null, `${row.id}: in-process agent has no hook file`); continue; }
        assert.ok(spec !== null, `${row.id}: hook file row missing`);
        assert.equal(spec.root, kinds[ch.kind], `${row.id}: root ${spec.root} vs channel ${ch.kind}`);
        assert.equal(path.join(...spec.file), path.join(...ch.path.split(POSIX_SEP)), `${row.id}: doctor and setup name different hook files`);
      }
    });

    test("vscode: the hook file is the user file ~/.copilot/hooks/context-mode-vscode.json, never a project .github/hooks file", () => {
      // Documented (page fetched 2026-10-28): code.visualstudio.com/docs/copilot/customization/hooks, "Choose a hook source":
      // personal hooks = "User hook files in ~/.copilot/hooks/"; repo-shared = ".github/hooks/*.json". Setup writes the user
      // file only (docs/install/vscode.md), so doctor D3 must read that same file.
      const spec = HOOK_HOST_FILE.vscode;
      assert.equal(spec.root, "home");
      assert.deepEqual([...spec.file], [".copilot", "hooks", "context-mode-vscode.json"]);
    });
  });
});
