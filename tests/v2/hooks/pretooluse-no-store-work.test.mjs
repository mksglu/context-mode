// D-CI-PERF-8: a PreToolUse hook call needs only the worktree. It must not create the data root (mkdir),
// realpath it or hash the project key: each is an fs call or CPU on every tool call (D3 gate, windows-latest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../../../src/core/project/resolve.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

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
