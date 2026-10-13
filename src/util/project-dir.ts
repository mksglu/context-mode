import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { PlatformId } from "../adapters/types.js";
import { workspaceEnvVarsFor } from "../adapters/detect.js";

/**
 * Universal escape hatch. NEVER appears in any platform's foreignWorkspaceEnv()
 * (because it isn't registered in PLATFORM_ENV_VARS), so it survives strict
 * mode and bridge env scrubs. Documented as the cross-strict user override
 * for every adapter (set in `~/.<host>/mcp.json` env when nothing else works).
 */
const UNIVERSAL_WORKSPACE_ENV = ["CONTEXT_MODE_PROJECT_DIR"] as const;

/**
 * Frozen legacy candidate list — preserves bit-for-bit behavior of every
 * non-strict caller (`start.mjs` and any caller that doesn't pass
 * `strictPlatform`). Order is locked for semver compatibility.
 *
 * If a new adapter is added, DO NOT add its workspace var here — register it
 * in `PLATFORM_ENV_VARS` and let strict callers pick it up via
 * `workspaceEnvVarsFor(platform)`. Strict mode is the default forward path.
 */
const LEGACY_NON_STRICT_CANDIDATES: readonly string[] = [
  "CLAUDE_PROJECT_DIR",
  "GEMINI_PROJECT_DIR",
  "VSCODE_CWD",
  "OPENCODE_PROJECT_DIR",
  "PI_PROJECT_DIR",
  "IDEA_INITIAL_DIRECTORY",
  "CURSOR_CWD",
  "CONTEXT_MODE_PROJECT_DIR",
];

/**
 * Project-dir resolution helpers — shared between `start.mjs` (the MCP entry
 * point) and `src/server.ts getProjectDir()` (the consumer).
 *
 * Background: when Claude Code runs `/ctx-upgrade`, it kills + respawns the
 * MCP server. The respawn happens with `cwd` set to the plugin install
 * directory (`~/.claude/plugins/cache/context-mode/context-mode/<version>/`).
 * The legacy `start.mjs` then set `CLAUDE_PROJECT_DIR = originalCwd`, which
 * poisoned every downstream `ctx_stats` / SessionDB / hash computation —
 * sessions silently re-rooted under the plugin install path.
 *
 * Defense-in-depth fix (v1.0.113):
 *   - `start.mjs` calls `isPluginInstallPath(originalCwd)` and skips the env
 *     auto-set when true (no poisoning at the source).
 *   - `getProjectDir()` calls `resolveProjectDir(...)` which rejects plugin-
 *     pathed env vars and the plugin cwd, preferring `process.env.PWD`
 *     (shell-set, survives `process.chdir`) before falling back.
 */

/**
 * Detect whether a path lives inside an agent plugin install tree —
 * specifically `<home>/.claude/plugins/cache/<plugin>/<plugin>/<version>/`,
 * `<home>/.codex/plugins/cache/<plugin>/<plugin>/<version>/`, or the
 * marketplace mirror under `<home>/.{claude,codex}/plugins/marketplaces/...`.
 *
 * Cross-OS: matches both POSIX (`/`) and Windows (`\`) path separators.
 * Independent of `home` location — we only care about the agent plugin
 * suffix pattern.
 */
export function isPluginInstallPath(p: string): boolean {
  if (!p) return false;
  return /[/\\]\.(claude|codex)[/\\]plugins[/\\](cache|marketplaces)[/\\]/.test(p);
}

/**
 * Read the per-session project dir from Claude Code's transcript files.
 *
 * Claude Code writes session transcripts under
 * `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Each line is a JSON
 * event; an early line (typically line 2) carries a `cwd` field with the
 * literal project directory the session is running against. The encoded dir
 * name itself is lossy (`/` and `.` both become `-`), so we read the JSONL.
 *
 * This is the strongest available signal when Claude Code does NOT propagate
 * `CLAUDE_PROJECT_DIR` to the spawned MCP env (the common case when Claude
 * Code is launched from the desktop app rather than `cd <project> && claude`).
 *
 * Returns `undefined` when no transcript exists, the projects dir is empty,
 * or no transcript carries a `cwd` field — caller falls through.
 *
 * Multi-window safety: the most-recently-modified jsonl wins. When the user
 * actively talks to one Claude Code window, that window's transcript is the
 * one being written to RIGHT NOW, so its mtime is freshest. Other windows'
 * transcripts have older mtimes and are correctly ignored.
 */
export function resolveProjectDirFromTranscript(opts: {
  projectsRoot: string;
  /**
   * Optional freshness guard. Claude Code updates the active transcript while
   * the session is being used; stale transcripts from previous days must not
   * become a global project-dir signal for other hosts that merely have
   * ~/.claude on disk.
   */
  maxAgeMs?: number;
  /** Test seam for maxAgeMs. Defaults to Date.now(). */
  nowMs?: number;
}): string | undefined {
  if (!fs.existsSync(opts.projectsRoot)) return undefined;

  let bestPath: string | undefined;
  let bestMtime = 0;
  try {
    for (const dir of fs.readdirSync(opts.projectsRoot)) {
      const dirPath = path.join(opts.projectsRoot, dir);
      let stat;
      try { stat = fs.statSync(dirPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      let files;
      try { files = fs.readdirSync(dirPath); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dirPath, f);
        try {
          const m = fs.statSync(fp).mtimeMs;
          if (m > bestMtime) { bestMtime = m; bestPath = fp; }
        } catch { /* skip */ }
      }
    }
  } catch { return undefined; }

  if (!bestPath) return undefined;
  if (typeof opts.maxAgeMs === "number") {
    const nowMs = opts.nowMs ?? Date.now();
    if (nowMs - bestMtime > opts.maxAgeMs) return undefined;
  }

  // Read first ~10 lines until we find a cwd field. The jsonl is
  // append-only and can be huge (60+ MB on long sessions) — never load it
  // into memory; stream a small head buffer.
  try {
    const fd = fs.openSync(bestPath, "r");
    try {
      const buf = Buffer.alloc(8192);
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
      const text = buf.subarray(0, bytes).toString("utf-8");
      for (const line of text.split("\n").slice(0, 10)) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { cwd?: unknown };
          if (typeof obj.cwd === "string" && obj.cwd.length > 0) return obj.cwd;
        } catch { /* skip malformed line */ }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* file vanished mid-read */ }

  return undefined;
}

export function resolveCodexSessionCwd(opts: {
  codexHome?: string;
  sessionId?: string;
  transcriptMaxAgeMs?: number;
  now?: number;
} = {}): string | null {
  const { sessionId } = opts;
  if (!sessionId || !/^[a-zA-Z0-9_-]{1,200}$/.test(sessionId)) return null;
  const codexHome = opts.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const sessionsDir = path.join(codexHome, "sessions");
  let visited = 0;
  const visit = (dir: string, depth: number): string | null => {
    if (depth > 4 || visited >= 10_000) return null;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries.reverse()) {
      if (++visited > 10_000) break;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const cwd = visit(file, depth + 1);
        if (cwd) return cwd;
      } else if (entry.isFile() && (entry.name === `${sessionId}.jsonl` || entry.name.endsWith(`-${sessionId}.jsonl`))) {
        const cwd = readCodexSessionCwd(file, sessionId);
        if (cwd) return cwd;
      }
    }
    return null;
  };
  return visit(sessionsDir, 0);
}

function readCodexSessionCwd(file: string, sessionId: string): string | null {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
      for (const line of buffer.subarray(0, bytes).toString("utf8").split("\n").slice(0, 10)) {
        if (!line.trim()) continue;
        const record = JSON.parse(line);
        const meta = record.type === "session_meta" ? record.payload : record.meta;
        if ((meta?.id ?? meta?.sessionId) !== sessionId) continue;
        const cwd = meta.cwd;
        if (typeof cwd === "string" && path.isAbsolute(cwd) && !isPluginInstallPath(cwd)) return cwd;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch { return null; }
  return null;
}

export function resolveCodexToolContext(
  meta: Record<string, unknown> | undefined,
  codexHome?: string,
): { projectDir: string; sessionId: string } | undefined {
  const threadId = meta?.threadId;
  if (threadId === undefined) return undefined;
  if (typeof threadId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(threadId)) {
    throw new Error("Invalid Codex workspace thread identity.");
  }
  const sandbox = meta?.["codex/sandbox-state-meta"];
  let projectDir: string | null;
  if (sandbox !== undefined) {
    const uri = sandbox && typeof sandbox === "object" ? (sandbox as Record<string, unknown>).sandboxCwd : undefined;
    try {
      if (typeof uri !== "string") throw new Error();
      projectDir = fileURLToPath(uri);
      if (!path.isAbsolute(projectDir) || isPluginInstallPath(projectDir)) throw new Error();
    } catch {
      throw new Error("Invalid Codex workspace URI in request metadata.");
    }
  } else {
    projectDir = resolveCodexSessionCwd({ codexHome, sessionId: threadId });
  }
  if (!projectDir) throw new Error("Cannot resolve this Codex thread's workspace. Reconnect the MCP server or provide host workspace metadata.");
  return { projectDir, sessionId: threadId };
}

/**
 * Pure project-dir resolver. Mirror of the env-var chain inside
 * `src/server.ts getProjectDir()`, but takes its inputs explicitly so the
 * resolver can be exercised under test without process-level mutation.
 *
 * Resolution order:
 *   1. Adapter-priority env vars (CLAUDE / GEMINI / VSCODE / OPENCODE / PI /
 *      IDEA / CONTEXT_MODE) — first non-empty AND non-plugin-path wins.
 *   2. Claude Code transcript heuristic — read `cwd` from the most-recently-
 *      modified `~/.claude/projects/<encoded>/<session>.jsonl`. This is the
 *      most reliable signal when Claude Code launched MCP from a non-project
 *      cwd (desktop-app launch, `/ctx-upgrade` respawn, etc.).
 *   3. `process.env.PWD` — shell-set, NOT updated by `process.chdir()`, so
 *      it survives the `start.mjs` chdir into the plugin dir. Skipped if
 *      it too points at a plugin install path.
 *   4. `cwd` — last resort. Returned even if it is a plugin path; the
 *      caller is responsible for rendering a graceful "no project context"
 *      message rather than panicking. Keeping the function total preserves
 *      operation of project-independent tools (sandbox execute, fetch).
 */
export function resolveProjectDir(opts: {
  env: Record<string, string | undefined>;
  cwd: string;
  pwd: string | undefined;
  /** Optional override; production code passes `~/.claude/projects`. */
  transcriptsRoot?: string;
  /** Optional freshness guard for Claude Code transcript project recovery. */
  transcriptMaxAgeMs?: number;
  /** Test seam for transcriptMaxAgeMs. Defaults to Date.now(). */
  nowMs?: number;
  /**
   * Issue #545 — opt-in tightening. When set, the candidate list is built
   * algorithmically from `workspaceEnvVarsFor(strictPlatform)` plus the
   * universal escape hatch. Foreign workspace vars (e.g. CLAUDE_PROJECT_DIR
   * leaked into Pi's MCP child env) cannot win, regardless of cascade order.
   *
   * When `undefined`, the legacy literal candidate order is used (semver lock
   * for `start.mjs` and any non-strict consumer).
   */
  strictPlatform?: PlatformId;
  codexHome?: string;
}): string {
  const {
    env, cwd, pwd, transcriptsRoot, transcriptMaxAgeMs, nowMs, strictPlatform,
  } = opts;
  // Build candidate list. Strict path: own workspace vars + universal escape
  // hatch — NO foreign workspace vars, in any order, can win. Non-strict
  // path: frozen legacy literal order for backwards compatibility.
  const candidateVars: readonly string[] = strictPlatform
    ? [...workspaceEnvVarsFor(strictPlatform), ...UNIVERSAL_WORKSPACE_ENV]
    : LEGACY_NON_STRICT_CANDIDATES;
  for (const name of candidateVars) {
    const v = env[name];
    if (v && !isPluginInstallPath(v)) return v;
  }
  if (transcriptsRoot) {
    const fromTranscript = resolveProjectDirFromTranscript({
      projectsRoot: transcriptsRoot,
      maxAgeMs: transcriptMaxAgeMs,
      nowMs,
    });
    if (fromTranscript && !isPluginInstallPath(fromTranscript)) return fromTranscript;
  }
  if (pwd && !isPluginInstallPath(pwd)) return pwd;
  return cwd;
}
