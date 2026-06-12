/**
 * Session module loaders — bundle-first with build/ fallback.
 *
 * All session modules are loaded from esbuild bundles (hooks/session-*.bundle.mjs).
 * Bundles are built by CI (bundle.yml) and shipped with every release.
 * Fallback: if bundles are missing (marketplace installs), try build/session/*.js.
 */

import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { hasPlatformConfig, maybeForward } from "./platform-bridge.mjs";
import { detectPlatformFromEnv } from "./core/platform-detect.mjs";

export function createSessionLoaders(hookDir) {
  // Auto-detect bundle directory: bundles live in hooks/ root, not platform subdirs.
  // If hookDir itself has bundles, use it; otherwise go up one level.
  const bundleDir = existsSync(join(hookDir, "session-db.bundle.mjs"))
    ? hookDir
    : join(hookDir, "..");

  // Fallback: if bundles missing, try build/session/*.js (marketplace installs)
  const pluginRoot = join(bundleDir, "..");
  const buildSession = join(pluginRoot, "build", "session");

  async function loadModule(bundleName, buildName) {
    const bundlePath = join(bundleDir, bundleName);
    if (existsSync(bundlePath)) {
      return await import(pathToFileURL(bundlePath).href);
    }
    const buildPath = join(buildSession, buildName);
    return await import(pathToFileURL(buildPath).href);
  }

  return {
    async loadSessionDB() {
      return await loadModule("session-db.bundle.mjs", "db.js");
    },
    async loadProjectAttribution() {
      const bundlePath = join(bundleDir, "session-attribution.bundle.mjs");
      if (existsSync(bundlePath)) {
        return await import(pathToFileURL(bundlePath).href);
      }
      const buildPath = join(buildSession, "project-attribution.js");
      if (existsSync(buildPath)) {
        return await import(pathToFileURL(buildPath).href);
      }
      // Last-resort fallback for dev environments without a fresh build.
      const localPath = join(bundleDir, "project-attribution.mjs");
      return await import(pathToFileURL(localPath).href);
    },
    async loadExtract() {
      return await loadModule("session-extract.bundle.mjs", "extract.js");
    },
    async loadSnapshot() {
      return await loadModule("session-snapshot.bundle.mjs", "snapshot.js");
    },
  };
}

/**
 * Shared helper — resolves project attributions and inserts events into the DB.
 * Eliminates the ~15-line attribution block duplicated across all hook files.
 *
 * @returns {Array} The resolved attributions array (useful when a subsequent
 *   attribution block needs `lastKnownProjectDir` from the first).
 */
export function attributeAndInsertEvents(db, sessionId, events, input, projectDir, hookName, resolveProjectAttributions) {
  const sessionStats = db.getSessionStats(sessionId);
  const lastKnownProjectDir = typeof db.getLatestAttributedProjectDir === "function"
    ? db.getLatestAttributedProjectDir(sessionId)
    : null;
  const attributions = resolveProjectAttributions(events, {
    sessionOriginDir: sessionStats?.project_dir || projectDir,
    inputProjectDir: projectDir,
    workspaceRoots: Array.isArray(input.workspace_roots) ? input.workspace_roots : [],
    lastKnownProjectDir,
  });
  // Build a parallel bytesList from event-level bytes_avoided (currently
  // populated by external_ref's ctx_fetch_and_index preamble parser). When
  // no event carries a positive value we leave bytesList undefined so
  // SessionDB falls back to its 0-default for bytes_avoided/bytes_returned
  // — preserves backward compat with older callers / tests.
  // v1.0.160: handle both bytes_avoided (saved) and bytes_returned (resume
  // snapshot replay) so the snapshot-consumed event from sessionstart.mjs
  // routes through here without losing the bytes_returned column.
  let bytesList;
  const hasBytes = events.some((e) =>
    (typeof e?.bytes_avoided === "number" && e.bytes_avoided > 0) ||
    (typeof e?.bytes_returned === "number" && e.bytes_returned > 0),
  );
  if (hasBytes) {
    bytesList = events.map((e) => {
      const avoided = typeof e?.bytes_avoided === "number" && e.bytes_avoided > 0 ? e.bytes_avoided : 0;
      const returned = typeof e?.bytes_returned === "number" && e.bytes_returned > 0 ? e.bytes_returned : 0;
      if (avoided === 0 && returned === 0) return undefined;
      return { bytesAvoided: avoided, bytesReturned: returned };
    });
  }
  // Prefer bulk path (single transaction = single WAL commit). Falls back
  // to per-event insert for older SessionDB instances that lack bulkInsertEvents.
  if (typeof db.bulkInsertEvents === "function") {
    db.bulkInsertEvents(sessionId, events, hookName, attributions, bytesList);
  } else {
    for (let i = 0; i < events.length; i++) {
      db.insertEvent(sessionId, events[i], hookName, attributions[i], bytesList?.[i]);
    }
  }

  // PRD-context-as-a-service §5.2 — Forwarder injection.
  // Gated: the per-event loop never runs when ~/.context-mode/platform.json
  // is missing. hasPlatformConfig() is a single cached probe (60s TTL), so
  // the unconfigured-user path costs at most one syscall per minute.
  if (hasPlatformConfig()) {
    const platform = detectPlatformFromEnv();
    // Session-wide rollup snapshot — stamped onto every outgoing event so
    // the analytics engine sees the seed.ts shape (tool_calls, errors,
    // unique_tools, ...). Defensive call: older SessionDB bundles that
    // predate v1.0.158 won't have getSessionRollup; fall back to null
    // and the bridge will still pass the per-event facts through.
    const rollup = typeof db.getSessionRollup === "function"
      ? db.getSessionRollup(sessionId)
      : null;

    // v1.0.159: Bash metadata shared across all events from this hook fire.
    // A single Bash tool call may emit multiple canonical events (a `git
    // pull` produces type=git AND type=cwd) — they all share the same
    // command_type / command_tool / exit_code / duration_bucket. Hook
    // metadata (latency, exit_code) is also per-call, not per-event.
    const bashMeta = deriveBashMetadata(input);
    // v1.0.159: latency_ms read from the PreToolUse timestamp stamp.
    // PreToolUse writes ms-precision Date.now() to a tmp file, PostToolUse
    // reads + computes delta + cleans up. Failure → undefined (no field
    // surfaces on the wire; Zod is optional).
    const latencyMs = readLatencyMs(sessionId, input?.tool_name);

    for (let i = 0; i < events.length; i++) {
      const enriched = enrichEventForPlatform(events[i], attributions[i]);
      const withBash = bashMeta ? { ...enriched, ...bashMeta } : enriched;
      const withLatency = latencyMs !== undefined
        ? { ...withBash, latency_ms: latencyMs, duration_bucket: bucketizeDuration(latencyMs) }
        : withBash;
      const payload = rollup ? { ...withLatency, ...rollup } : withLatency;
      maybeForward({ ...payload, session_id: sessionId }, platform);
    }
  }

  return attributions;
}

// ── Per-event enrichment (seed.ts shape parity) ──────────────────────────
//
// Each canonical event from session-extract carries only {type, category, data}.
// The platform's events table has 35 columns; the engine's aggregate SQL reads
// most of them. This helper derives the per-event-derivable subset directly
// from the event's own facts — no I/O, no classifier dependency, no allocation
// beyond the spread. Aggregates (tool_calls, errors, ...) come from the
// session rollup stamp in the caller.
//
// PRD-context-as-a-service §5.4 ABI: bridge stays a dumb pipe. This enrichment
// runs BEFORE maybeForward so the body envelope spreads the enriched event
// unchanged.
function enrichEventForPlatform(event, attribution) {
  const error = event?.category === "error" ? 1 : 0;
  const dataStr = typeof event?.data === "string" ? event.data : "";

  const enriched = {
    ...event,
    ...attribution,
    error,
    // session_* are open-string passthroughs (ADR-0001) — let the platform
    // do forensic queries on the raw shape without forcing the wide→narrow
    // category derivation to ever round-trip.
    session_category: event?.category,
    session_type: event?.type,
    session_data: dataStr.length > 0 ? dataStr.slice(0, 500) : undefined,
  };

  // Error events: surface the message + classify
  if (error === 1) {
    enriched.error_message = dataStr.slice(0, 1000);
    const cls = classifyError(dataStr);
    enriched.error_category = cls.error_category;
    enriched.error_tool = cls.error_tool;
  }

  // blocker_status: derive from the canonical event TYPE, not lexical
  // pattern-matching on prose. session-extract already identifies blocker
  // states semantically (type='blocker' when the agent signals stuck;
  // type='blocker_resolved' on recovery). Regex on error_message would
  // false-positive on the millions of error texts in the wild — we let
  // the extractor's structural judgment be the source of truth.
  if (event?.type === "blocker") enriched.blocker_status = "open";
  else if (event?.type === "blocker_resolved") enriched.blocker_status = "resolved";

  // v1.0.161 (Bug 2): gate per-event commit_message + has_commit on
  // type='git_commit', NOT category='git'. Non-commit git operations
  // (push/diff/status) used to inflate commit_message with the operation
  // name and falsely raise has_commit on rows that should have remained
  // commit-neutral. The rollup spread now stamps both fields symmetrically
  // from the session's latest actual commit — see SessionDB.getSessionRollup
  // and src/session/extract.ts:extractGit type discriminator.
  if (event?.type === "git_commit" && dataStr.length > 0) {
    enriched.commit_message = dataStr.slice(0, 500);
    enriched.has_commit = 1;
  }

  // File events: ship the file path as the single-item array shape the
  // platform schema expects (Zod: z.array(z.string()).max(20))
  if (event?.category === "file" && dataStr.length > 0) {
    enriched.file_paths = [dataStr.slice(0, 500)];
  }

  return enriched;
}

// ── Inline error classifier — seed.ts ERROR_CATEGORIES parity ────────────
//
// Mirrors src/session/error-classifier.ts's 10-category table for runtime
// callers (this is a .mjs hook file; the TS classifier ships bundled but
// the bundle import path costs an extra ~20ms on first hook fire and an
// extra disk read per hook subprocess. Inline keeps the hot path fast.)
// If the table ever drifts from error-classifier.ts, the classifier test
// suite (tests/session/classifier.test.ts) is the canonical source — sync
// the patterns there first, then mirror here.
function classifyError(message) {
  const m = String(message ?? "").toLowerCase();
  if (!m) return { error_category: "unknown", error_tool: "Bash" };

  // Order matters: timeout + git_conflict checked BEFORE test_failed so
  // "test timed out" and "CONFLICT … fail" land in the right bucket.
  if (/etimedout|timed out|timeout|deadline exceeded/.test(m)) return { error_category: "timeout", error_tool: "Bash" };
  if (/conflict.*(merge|rebase|git)|merge conflict|^conflict/.test(m)) return { error_category: "git_conflict", error_tool: "Bash" };
  if (/enoent|no such file|cannot find module|filenotfounderror/.test(m)) return { error_category: "file_not_found", error_tool: "Read" };
  if (/command not found|: not found|exit code 127/.test(m)) return { error_category: "command_not_found", error_tool: "Bash" };
  if (/old_string|could not find string|matches multiple/.test(m)) return { error_category: "edit_match_failed", error_tool: "Edit" };
  if (/eacces|permission denied|operation not permitted|eperm/.test(m)) return { error_category: "permission_denied", error_tool: "Bash" };
  if (/syntaxerror|error ts\d+|unexpected token|parse error/.test(m)) return { error_category: "syntax_error", error_tool: "Bash" };
  if (/typeerror|referenceerror|rangeerror|traceback|nullpointer/.test(m)) return { error_category: "runtime_error", error_tool: "Bash" };
  if (/test failed|fail |tests failed|assertion/.test(m)) return { error_category: "test_failed", error_tool: "Bash" };
  return { error_category: "unknown", error_tool: "Bash" };
}

// ── Bash metadata derivation — algorithmic, not enumerative ──────────────
//
// A single Bash tool call may emit MULTIPLE canonical events (a `git pull`
// produces type='git' AND type='cwd'). The platform's command_metadata
// describes the BASH CALL, not the per-event derivative — so all events
// from one PostToolUse fire carry the same shape. Non-Bash tool calls
// return null and the per-event fields stay undefined (Zod optional drops
// them silently — no NULL noise on the wire).
//
// DESIGN: tool ecosystems contain millions of CLI binaries but converge on
// a tiny canonical verb set (test/build/install/lint/format/run/start/
// deploy/...). The classifier scans for these verbs at canonical token
// positions — agnostic of which package manager / language / framework.
// New tools without a registry change automatically classify correctly as
// long as they use the verbs (which is the dominant ecosystem convention).
// This was originally regex-table enumeration; the table never converges.
const CANONICAL_VERBS = new Set([
  "test", "build", "install", "lint", "format", "run", "start",
  "deploy", "compile", "bundle", "watch", "serve", "publish",
]);
// Runners that wrap the actual executable — strip them so command_tool
// reflects the real binary the user invoked (`bunx pytest` → "pytest",
// not "bunx"). NODE_ENV=production npm run build → "npm".
const COMMAND_RUNNERS = new Set([
  "sudo", "doas", "env", "exec", "time",
  "npx", "pnpx", "bunx", "pnpm", "yarn", "bun",
]);
const ENV_ASSIGN_RE = /^[A-Z_][A-Z0-9_]*=/;

// Tools whose NAME directly implies their type (no subcommand needed).
// Curated minimum — covers the dominant test/lint/format/build/db/http/
// deploy invocations across ecosystems. New ecosystem tools land in
// "other" until added — preferred to a noisy heuristic that misclassifies.
// Lookup is O(1); contrast with the original regex-table approach which
// scaled to no boundary and still missed unknowns.
const CANONICAL_TOOLS = new Map([
  // test runners
  ["pytest", "test"], ["jest", "test"], ["vitest", "test"], ["mocha", "test"],
  ["ava", "test"], ["jasmine", "test"], ["rspec", "test"], ["junit", "test"],
  ["tap", "test"], ["karma", "test"],
  // linters
  ["eslint", "lint"], ["tslint", "lint"], ["ruff", "lint"], ["rubocop", "lint"],
  ["pylint", "lint"], ["flake8", "lint"], ["clippy", "lint"], ["staticcheck", "lint"],
  ["mypy", "lint"], ["shellcheck", "lint"],
  // formatters
  ["prettier", "format"], ["black", "format"], ["gofmt", "format"], ["rustfmt", "format"],
  ["autopep8", "format"], ["yapf", "format"],
  // bundlers / builders
  ["webpack", "build"], ["vite", "build"], ["rollup", "build"], ["esbuild", "build"],
  ["parcel", "build"], ["tsc", "build"], ["swc", "build"], ["turbo", "build"],
  // deploy / infra
  ["docker", "deploy"], ["kubectl", "deploy"], ["terraform", "deploy"], ["pulumi", "deploy"],
  ["ansible", "deploy"], ["helm", "deploy"], ["aws", "deploy"], ["gcloud", "deploy"], ["az", "deploy"],
  // databases
  ["psql", "database"], ["mysql", "database"], ["sqlite3", "database"],
  ["redis-cli", "database"], ["mongosh", "database"], ["mongo", "database"],
  // http
  ["curl", "http"], ["wget", "http"], ["httpie", "http"], ["http", "http"],
]);

function deriveBashMetadata(input) {
  if (input?.tool_name !== "Bash") return null;
  const cmd = String(input?.tool_input?.command ?? "").trim();
  if (!cmd) return { command_type: "other", command_tool: "Bash" };

  const tokens = cmd.split(/\s+/);
  const command_tool = extractCommandTool(tokens);
  const command_type = classifyCommandType(tokens, command_tool);
  const exit_code = inferExitCode(input?.tool_response);
  return { command_type, command_tool, exit_code };
}

// Strip env-assign prefixes (`FOO=bar`), then strip runner shells,
// then return the basename of the executable token.
function extractCommandTool(tokens) {
  let i = 0;
  // Skip env assignments
  while (i < tokens.length && ENV_ASSIGN_RE.test(tokens[i])) i++;
  // Skip runner shells
  while (i < tokens.length && COMMAND_RUNNERS.has(tokens[i].toLowerCase())) {
    i++;
    // Skip subcommands like `pnpm dlx`, `pnpm exec`, `bun run`
    if (i < tokens.length && /^(dlx|exec|run|x)$/i.test(tokens[i])) i++;
  }
  if (i >= tokens.length) return tokens[0] || "Bash";
  const exe = tokens[i];
  // basename of path-like executables (`/usr/local/bin/foo` → "foo")
  const base = exe.split(/[/\\]/).pop() || "Bash";
  // Strip shell quoting if present
  return base.replace(/^['"]|['"]$/g, "");
}

// Type classification — priority order:
//   1. Tool name implies type (curated CANONICAL_TOOLS map)
//   2. Canonical verb at subcommand position (`npm test`, `cargo build`)
//   3. Argument-shape heuristics (test/ dir, .test.ts suffix, --prod flag)
//   4. Tool-level fallback (git → git, make → build)
//   5. "other"
function classifyCommandType(tokens, command_tool) {
  const toolLc = (command_tool || "").toLowerCase();

  // 1. Tool name itself names the type
  const fromTool = CANONICAL_TOOLS.get(toolLc);
  if (fromTool) return fromTool;

  // Skip env + runners to find subcommand position
  const lower = tokens.map((t) => t.toLowerCase());
  let start = 0;
  while (start < lower.length && ENV_ASSIGN_RE.test(tokens[start])) start++;
  while (start < lower.length && COMMAND_RUNNERS.has(lower[start])) {
    start++;
    if (start < lower.length && /^(dlx|exec|run|x)$/.test(lower[start])) start++;
  }

  // 2. Canonical verb scan within next 4 tokens
  const horizon = Math.min(lower.length, start + 4);
  for (let i = start; i < horizon; i++) {
    if (CANONICAL_VERBS.has(lower[i])) return lower[i];
  }

  // 3. Argument-shape heuristics
  const tail = tokens.slice(start).join(" ");
  if (/\btests?[/\\]|\bspec[/\\]|__tests__|\.(test|spec)\.[mc]?[jt]sx?\b|test_[\w-]+\.py\b|_test\.go\b/.test(tail)) return "test";
  if (/--(prod|production|release|optimize)\b/.test(tail)) return "build";
  if (/\bDockerfile\b|docker-compose/.test(tail)) return "deploy";

  // 4. Tool-level fallback for tools whose mere presence implies the type
  if (toolLc === "git") return "git";
  if (toolLc === "make" || toolLc === "ninja" || toolLc === "cmake") return "build";

  return "other";
}

// Exit code best-effort inference from tool_response. Hook stdin does
// not carry the actual exit code on CC; we read the shape of the output
// for signals. Engine treats exit_code as soft signal (Anomaly #3 — no
// pattern in patterns.ts reads it today), so probabilistic stamps are
// adequate. Captures named exit code when explicit.
function inferExitCode(response) {
  const r = String(response ?? "");
  if (!r) return 0;
  // Explicit exit-code marker (some wrappers emit "exit status 137" etc.)
  const explicit = r.match(/\bexit (?:status|code)\s+(\d+)\b/i);
  if (explicit) return Number(explicit[1]);
  // "command not found" → POSIX standard 127
  if (/^bash:.*: (?:command not found|No such file)/m.test(r)) return 127;
  // Heuristic non-zero indicators (line-anchored to avoid false positives
  // inside narrative text from successful commands).
  if (/^(?:Error: |Traceback|FAIL\b|✗|✘)/m.test(r)) return 1;
  return 0;
}

// ── Latency timing — reads PreToolUse marker ────────────────────────────
//
// PreToolUse already writes `${tmpdir}/context-mode-latency-${sessionId}-
// ${toolName}.txt` with the start timestamp (pretooluse.mjs:177). We
// piggyback on that marker — read + compute delta, do NOT unlink (the
// downstream slow-tool event emission in posttooluse.mjs:128-152 manages
// the unlink lifecycle). Failure modes (missing marker, parse error,
// negative delta, sanity-out-of-range) all return undefined — Zod's
// optional handling drops the field silently. No NULL noise on the wire.
function readLatencyMs(sessionId, toolName) {
  if (!sessionId || !toolName) return undefined;
  const markerPath = resolvePath(
    tmpdir(),
    `context-mode-latency-${sessionId}-${toolName}.txt`,
  );
  try {
    const start = parseInt(readFileSync(markerPath, "utf8").trim(), 10);
    if (!Number.isFinite(start) || start <= 0) return undefined;
    const delta = Date.now() - start;
    if (delta < 0 || delta > 24 * 3600 * 1000) return undefined;
    return delta;
  } catch {
    return undefined;
  }
}

// ── Duration bucket ──────────────────────────────────────────────────────
//
// Open-string label the platform Zod schema accepts (max 20 chars). Three
// buckets cover the seed.ts shape: <5s | 5-30s | 30s+.
function bucketizeDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 5_000) return "<5s";
  if (ms < 30_000) return "5-30s";
  return "30s+";
}
