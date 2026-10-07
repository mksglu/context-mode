/**
 * D2 PRD Phase 4 — read-redirected marker pattern (slices 4.4–4.6).
 *
 * Slice 4.4: a Read against a >50 KB file produces a redirect marker.
 * Slice 4.5: PostToolUse emits `read-redirected` with bytes_avoided = actual file size.
 * Slice 4.6: small files (<= 50 KB) do NOT trigger a redirect marker.
 */

import { describe, test, beforeAll, beforeEach, afterAll, afterEach, expect } from "vitest";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

import { loadDatabase } from "../../src/db-base.js";
import { getRealBytesStats } from "../../src/session/analytics.js";


const _hashCanonical = (p: string) => createHash("sha256").update(
  (process.platform === "darwin" || process.platform === "win32") ? p.toLowerCase() : p
).digest("hex").slice(0, 16);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRETOOL_PATH = join(__dirname, "..", "..", "hooks", "pretooluse.mjs");
const POSTTOOL_PATH = join(__dirname, "..", "..", "hooks", "posttooluse.mjs");

interface RawEventRow {
  type: string;
  category: string;
  bytes_avoided: number;
  bytes_returned: number;
  data: string;
}

function readEvents(dbPath: string, sessionId: string, type: string): RawEventRow[] {
  const Database = loadDatabase();
  const raw = new Database(dbPath, { readonly: true });
  try {
    return raw
      .prepare(
        "SELECT type, category, bytes_avoided, bytes_returned, data FROM session_events " +
        "WHERE session_id = ? AND type = ?",
      )
      .all(sessionId, type) as RawEventRow[];
  } finally {
    raw.close();
  }
}

const mcpSentinelDir = process.platform === "win32" ? tmpdir() : "/tmp";
const mcpSentinel = resolve(mcpSentinelDir, `context-mode-mcp-ready-${process.pid}`);

describe("D2 Phase 4 — read-redirected marker pattern", () => {
  let fakeHome: string;
  let fakeProject: string;
  let env: Record<string, string>;
  const sessionId = "redirect-read-test-session";
  let dbPath: string;
  let largeFilePath: string;
  let smallFilePath: string;
  const LARGE_SIZE = 80_000;

  beforeAll(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "ctx-redirect-read-home-"));
    fakeProject = mkdtempSync(join(tmpdir(), "ctx-redirect-read-project-"));
    env = {
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      CLAUDE_CONFIG_DIR: join(fakeHome, ".claude"),
      CLAUDE_PROJECT_DIR: fakeProject,
      CLAUDE_SESSION_ID: sessionId,
      CONTEXT_MODE_SESSION_SUFFIX: "",
    };
    // Hooks hash the path AFTER normalizeWorktreePath() (\ → /), so the test
    // must apply the same normalization before SHA — otherwise on Windows the
    // expected hash uses backslashes while the hook uses slashes (#435 pattern).
    const projectHash = _hashCanonical(fakeProject.replace(/\\/g, "/"));
    const dbDir = join(fakeHome, ".claude", "context-mode", "sessions");
    mkdirSync(dbDir, { recursive: true });
    dbPath = join(dbDir, `${projectHash}.db`);

    largeFilePath = join(fakeProject, "big.txt");
    writeFileSync(largeFilePath, "x".repeat(LARGE_SIZE), "utf-8");
    smallFilePath = join(fakeProject, "small.txt");
    writeFileSync(smallFilePath, "tiny", "utf-8");
  });

  afterAll(() => {
    try { rmSync(fakeHome, { recursive: true, force: true }); } catch {}
    try { rmSync(fakeProject, { recursive: true, force: true }); } catch {}
  });

  beforeEach(() => {
    writeFileSync(mcpSentinel, String(process.pid));
    const m = resolve(tmpdir(), `context-mode-redirect-${sessionId}.txt`);
    try { unlinkSync(m); } catch {}
  });

  afterEach(() => {
    try { unlinkSync(mcpSentinel); } catch {}
  });

  function runPre(filePath: string, activeSessionId = sessionId) {
    return spawnSync("node", [PRETOOL_PATH], {
      input: JSON.stringify({
        session_id: activeSessionId,
        tool_name: "Read",
        tool_input: { file_path: filePath },
      }),
      encoding: "utf-8",
      timeout: 30_000,
      windowsHide: true,
      env: { ...process.env, ...env, CLAUDE_SESSION_ID: activeSessionId },
    });
  }

  function runPost(filePath: string, response: string, activeSessionId = sessionId) {
    return spawnSync("node", [POSTTOOL_PATH], {
      input: JSON.stringify({
        session_id: activeSessionId,
        tool_name: "Read",
        tool_input: { file_path: filePath },
        tool_response: response,
      }),
      encoding: "utf-8",
      timeout: 30_000,
      windowsHide: true,
      env: { ...process.env, ...env, CLAUDE_SESSION_ID: activeSessionId },
    });
  }

  // ─── Slice 4.4 ───────────────────────────────────────────
  test("repeated large Reads emit one tip and preserve marker-to-stats accounting (#1267)", () => {
    const activeSessionId = `read-guidance-once-${Date.now()}`;
    const firstPath = join(fakeProject, "once-first.txt");
    const secondPath = join(fakeProject, "once-second.txt");
    const fileSize = 50_001;
    writeFileSync(firstPath, "a".repeat(fileSize));
    writeFileSync(secondPath, "b".repeat(fileSize));
    const markerPath = resolve(tmpdir(), `context-mode-redirect-${activeSessionId}.txt`);
    const guidancePath = resolve(tmpdir(), `context-mode-guidance-s-${activeSessionId}`);
    try {
      const first = runPre(firstPath, activeSessionId);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout).hookSpecificOutput.additionalContext).toContain("Reading to Edit");
      const firstPost = runPost(firstPath, "a".repeat(fileSize), activeSessionId);
      expect(firstPost.status, firstPost.stderr).toBe(0);

      const second = runPre(secondPath, activeSessionId);
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toBe("");
      expect(readFileSync(markerPath, "utf8")).toBe(`Read:read-redirected:${fileSize}:${secondPath}`);
      const secondPost = runPost(secondPath, "b".repeat(fileSize), activeSessionId);
      expect(secondPost.status, secondPost.stderr).toBe(0);
      expect(existsSync(markerPath)).toBe(false);

      const rows = readEvents(dbPath, activeSessionId, "read-redirected");
      expect(rows.map((row) => row.bytes_avoided)).toEqual([fileSize, fileSize]);
      const stats = getRealBytesStats({ sessionId: activeSessionId, sessionsDir: dirname(dbPath) });
      expect(stats.bytesAvoided).toBe(100_002);
    } finally {
      try { unlinkSync(markerPath); } catch {}
      rmSync(guidancePath, { recursive: true, force: true });
    }
  });

  test("4.4: Read on large file (>50KB) writes redirect marker", () => {
    const r = runPre(largeFilePath);
    assert.equal(r.status, 0, `pretooluse non-zero. stderr: ${r.stderr}`);
    const markerPath = resolve(tmpdir(), `context-mode-redirect-${sessionId}.txt`);
    assert.ok(existsSync(markerPath), "marker file must be written for large reads");
    const content = readFileSync(markerPath, "utf-8");
    expect(content.startsWith(`Read:read-redirected:${LARGE_SIZE}:`)).toBe(true);
  });

  // ─── Slice 4.5 ───────────────────────────────────────────
  test("4.5: PostToolUse emits read-redirected with bytes_avoided == file size", () => {
    runPre(largeFilePath);
    const post = runPost(largeFilePath, "x".repeat(LARGE_SIZE));
    assert.equal(post.status, 0, `posttooluse non-zero. stderr: ${post.stderr}`);

    const rows = readEvents(dbPath, sessionId, "read-redirected");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].category).toBe("redirect");
    expect(rows[0].bytes_avoided).toBe(LARGE_SIZE);
    expect(rows[0].bytes_returned).toBe(0);
  });

  // ─── Slice 4.6 ───────────────────────────────────────────
  test("4.6: Read on small file (<=50KB) does NOT write redirect marker", () => {
    runPre(smallFilePath);
    const markerPath = resolve(tmpdir(), `context-mode-redirect-${sessionId}.txt`);
    assert.ok(!existsSync(markerPath), "no marker for small file reads");
  });
});
