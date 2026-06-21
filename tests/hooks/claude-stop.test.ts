import "../setup-home";
import { fakeHome } from "../setup-home";

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, "..", "..", "hooks", "stop.mjs");

function normalizeProjectPathForSessionHash(projectDir: string): string {
  const normalized = projectDir.replace(/\\/g, "/");
  if (/^\/+$/.test(normalized)) return "/";
  if (/^[A-Za-z]:\/+$/.test(normalized)) return `${normalized.slice(0, 2)}/`;
  return normalized.replace(/\/+$/, "");
}

function hashCanonical(projectDir: string): string {
  const key = (process.platform === "darwin" || process.platform === "win32")
    ? projectDir.toLowerCase()
    : projectDir;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function runStopHook(input: Record<string, unknown>, cwd?: string) {
  const env = { ...process.env };
  delete env.CONTEXT_MODE_DIR;
  delete env.CONTEXT_MODE_DATA_DIR;
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: 30_000,
    env,
    ...(cwd ? { cwd } : {}),
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

describe("Claude Code stop hook", () => {
  let tempDir: string;
  let dbPath: string;

  beforeAll(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "claude-stop-hook-test-")));
    const hash = hashCanonical(normalizeProjectPathForSessionHash(tempDir));
    dbPath = join(fakeHome, ".claude", "context-mode", "sessions", `${hash}.db`);
  });

  afterAll(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* best effort */ }
  });

  test("outputs {} and records turn_end without requesting continuation", async () => {
    const result = runStopHook({
      hook_event_name: "Stop",
      session_id: "claude-stop-test",
      cwd: tempDir,
      stop_hook_active: false,
      last_assistant_message: "done",
    }, tempDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(existsSync(dbPath)).toBe(true);

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db.prepare(
        "SELECT type, data FROM session_events WHERE type IN ('turn_end', 'session_end')",
      ).all() as Array<{ type: string; data: string }>;

      expect(rows.some((row) => row.type === "turn_end")).toBe(true);
      expect(rows.some((row) => row.type === "session_end")).toBe(false);

      const payload = JSON.parse(rows.find((row) => row.type === "turn_end")?.data ?? "{}");
      expect(payload.stop_hook_active).toBe(false);
      expect(payload.last_assistant_message).toBe("done");
    } finally {
      db.close();
    }
  });

  test("handles malformed input without blocking Claude Code", () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: "{",
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env },
    });

    expect(result.status ?? 1).toBe(0);
    expect(JSON.parse((result.stdout ?? "").trim())).toEqual({});
  });
});
