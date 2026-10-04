import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadDatabase } from "../../src/db-base.js";
import { resolveCallerSessionId } from "../../src/session/caller-session.js";
import { SessionDB } from "../../src/session/db.js";
import { emitIndexWriteEvent } from "../../src/session/event-emit.js";
import {
  persistToolCallCounter,
  restoreSessionStats,
} from "../../src/session/persist-tool-calls.js";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "caller-session-"));
  tempDirs.push(dir);
  return dir;
}

describe("resolveCallerSessionId", () => {
  // The live file wins over BOTH inherited vars, and CLAUDE_SESSION_ID is set
  // here on purpose: that is the whole point. Upstream read the env first,
  // which meant that whenever Claude Code propagates CLAUDE_SESSION_ID to the
  // MCP process the file was never read and the fix did nothing. Its own test
  // pinned that order and its own comment argued for the opposite one.
  test("uses the live file after /clear instead of the inherited session id", () => {
    const configDir = tempDir();
    mkdirSync(join(configDir, "sessions"));
    const file = join(configDir, "sessions", "123.json");
    writeFileSync(file, JSON.stringify({ sessionId: "before-clear" }));
    const opts = {
      configDir,
      parentPid: 123,
      env: {
        CLAUDE_SESSION_ID: "before-clear",
        CLAUDE_CODE_SESSION_ID: "before-clear",
      },
    };
    expect(resolveCallerSessionId(opts)).toBe("before-clear");
    writeFileSync(file, JSON.stringify({ sessionId: "after-clear" }));
    expect(resolveCallerSessionId(opts)).toBe("after-clear");
  });

  test("falls back to the inherited ID when the file is absent or invalid", () => {
    const configDir = tempDir();
    const opts = {
      configDir,
      parentPid: 123,
      env: { CLAUDE_CODE_SESSION_ID: "inherited" },
    };
    expect(resolveCallerSessionId(opts)).toBe("inherited");
    mkdirSync(join(configDir, "sessions"));
    writeFileSync(join(configDir, "sessions", "123.json"), "{not json");
    expect(resolveCallerSessionId(opts)).toBe("inherited");
    expect(
      resolveCallerSessionId({ configDir, parentPid: 123, env: {} }),
    ).toBeUndefined();
  });

  test("falls back to CLAUDE_SESSION_ID when there is no file at all", () => {
    const configDir = tempDir();
    expect(
      resolveCallerSessionId({
        configDir,
        parentPid: 123,
        env: { CLAUDE_SESSION_ID: "inherited-explicit" },
      }),
    ).toBe("inherited-explicit");
  });
});

test("event and tool-call stats stay with the caller when a newer session exists", () => {
  const configDir = tempDir();
  const dbPath = join(configDir, "sessions.db");
  const db = new SessionDB({ dbPath });
  db.ensureSession("caller", configDir);
  db.ensureSession("neighbor", configDir);
  db.close();

  const Database = loadDatabase();
  const raw = new Database(dbPath);
  raw
    .prepare("UPDATE session_meta SET started_at = ? WHERE session_id = ?")
    .run("2026-01-01 00:00:00", "caller");
  raw
    .prepare("UPDATE session_meta SET started_at = ? WHERE session_id = ?")
    .run("2026-01-02 00:00:00", "neighbor");
  raw.close();

  mkdirSync(join(configDir, "sessions"));
  writeFileSync(
    join(configDir, "sessions", `${process.ppid}.json`),
    JSON.stringify({ sessionId: "caller" }),
  );

  const previous = {
    explicit: process.env.CLAUDE_SESSION_ID,
    inherited: process.env.CLAUDE_CODE_SESSION_ID,
    configDir: process.env.CLAUDE_CONFIG_DIR,
  };
  try {
    delete process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_CODE_SESSION_ID = "neighbor";
    process.env.CLAUDE_CONFIG_DIR = configDir;
    persistToolCallCounter(dbPath, "ctx_search", 42);
    emitIndexWriteEvent({
      sessionDbPath: dbPath,
      source: "sample",
      bytesAvoided: 64,
    });

    expect(restoreSessionStats(dbPath)?.calls.ctx_search).toBe(1);
    const check = new Database(dbPath, { readonly: true });
    try {
      expect(check.prepare("SELECT session_id FROM tool_calls").all()).toEqual([
        { session_id: "caller" },
      ]);
      expect(
        check
          .prepare(
            "SELECT session_id FROM session_events WHERE type = 'index-write'",
          )
          .all(),
      ).toEqual([{ session_id: "caller" }]);
    } finally {
      check.close();
    }
  } finally {
    if (previous.explicit === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = previous.explicit;
    if (previous.inherited === undefined)
      delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = previous.inherited;
    if (previous.configDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous.configDir;
  }
});
