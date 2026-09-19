import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { loadDatabase } from "../../src/db-base.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEX_USER_PROMPT_PATH = join(__dirname, "..", "..", "hooks", "codex", "userpromptsubmit.mjs");
const CODEX_PRECOMPACT_PATH = join(__dirname, "..", "..", "hooks", "codex", "precompact.mjs");
const CODEX_SESSIONSTART_PATH = join(__dirname, "..", "..", "hooks", "codex", "sessionstart.mjs");

function runHook(path: string, input: Record<string, unknown>, env: Record<string, string>) {
  return spawnSync("node", [path], {
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
}

function readGoalRows(codexHome: string) {
  const sessionDir = join(codexHome, "context-mode", "sessions");
  const dbFiles = readdirSync(sessionDir).filter((file) => file.endsWith(".db"));
  const Database = loadDatabase();
  const rows: Array<{ data: string; priority: number }> = [];

  for (const file of dbFiles) {
    const db = new Database(join(sessionDir, file), { readonly: true });
    try {
      rows.push(
        ...db.prepare(
          "SELECT data, priority FROM session_events WHERE category = 'goal' ORDER BY id",
        ).all() as Array<{ data: string; priority: number }>,
      );
    } finally {
      db.close();
    }
  }

  return rows;
}

describe("hooks/codex — /goal survives compact resume context", () => {
  let fakeHome: string;
  let fakeProject: string;
  let codexHome: string;
  let env: Record<string, string>;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "ctx-codex-goal-home-"));
    fakeProject = mkdtempSync(join(tmpdir(), "ctx-codex-goal-project-"));
    codexHome = join(fakeHome, ".codex");
    mkdirSync(codexHome, { recursive: true });
    env = {
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      CODEX_HOME: codexHome,
      CONTEXT_MODE_SESSION_SUFFIX: "",
    };
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(fakeProject, { recursive: true, force: true });
  });

  test("restores a Codex slash /goal directive after PreCompact", () => {
    const sessionId = "codex-goal-compact-session";
    const objective = "keep codex slash goal alive through compact";
    const baseInput = {
      session_id: sessionId,
      cwd: fakeProject,
      workspace_roots: [fakeProject],
    };

    const promptResult = runHook(
      CODEX_USER_PROMPT_PATH,
      { ...baseInput, prompt: `/goal ${objective}` },
      env,
    );
    expect(promptResult.status, promptResult.stderr || promptResult.stdout).toBe(0);

    expect(readGoalRows(codexHome)).toEqual([
      expect.objectContaining({ data: objective, priority: 1 }),
    ]);

    const compactResult = runHook(CODEX_PRECOMPACT_PATH, baseInput, env);
    expect(compactResult.status, compactResult.stderr || compactResult.stdout).toBe(0);

    const resumeResult = runHook(
      CODEX_SESSIONSTART_PATH,
      { ...baseInput, source: "compact" },
      env,
    );
    expect(resumeResult.status, resumeResult.stderr || resumeResult.stdout).toBe(0);

    const parsed = JSON.parse(resumeResult.stdout);
    const additionalContext = parsed.hookSpecificOutput.additionalContext as string;
    expect(additionalContext).toContain("<session_goal>");
    expect(additionalContext).toContain(objective);
    expect(additionalContext.indexOf("<session_goal>")).toBeLessThan(
      additionalContext.indexOf("<intent"),
    );
  });
});
