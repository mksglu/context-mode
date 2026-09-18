/**
 * Antigravity CLI (`agy`) hooks — bounded PreToolUse enforcement plus
 * PostToolUse/Stop capture.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fromAgy, extractUserRequest, getLatestUserPromptFromTranscript } from "../../hooks/antigravity-cli/payload.mjs";

const REPO = resolve(__dirname, "..", "..");
const SID = "agy-hook-session";
const CWD = "/tmp/agy-hook-project";

function dispatch(
  hook: string,
  payload: Record<string, unknown> | string,
  home: string,
  env: Record<string, string> = {},
) {
  return spawnSync("node", [join(REPO, "hooks", "antigravity-cli", hook)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf-8",
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      ...env,
    },
  });
}

function openDB(home: string): Database.Database {
  const dir = join(home, ".gemini", "context-mode", "sessions");
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".db")) : undefined;
  if (!file) throw new Error("no session DB created");
  return new Database(join(dir, file));
}

function cleanupMarkers() {
  for (const name of [
    `context-mode-rejected-${SID}.txt`,
    `context-mode-redirect-${SID}.txt`,
  ]) {
    try { rmSync(resolve(tmpdir(), name), { force: true }); } catch { /* ignore */ }
  }
  try { rmSync(resolve(tmpdir(), `context-mode-guidance-s-${SID}`), { recursive: true, force: true }); } catch { /* ignore */ }
}

describe("antigravity-cli hooks", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ctx-agy-hooks-"));
    cleanupMarkers();
  });

  afterEach(() => {
    cleanupMarkers();
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test("PreToolUse denies mapped run_command payloads through agy's native decision contract", () => {
    const sentinelDir = mkdtempSync(join(tmpdir(), "ctx-agy-sentinel-"));
    writeFileSync(join(sentinelDir, `context-mode-mcp-ready-${process.pid}`), String(process.pid));
    try {
      const r = dispatch(
        "pretooluse.mjs",
        {
          conversationId: SID,
          workspacePaths: [CWD],
          toolCall: {
            name: "run_command",
            args: { CommandLine: "curl https://example.com" },
          },
        },
        home,
        { CONTEXT_MODE_MCP_SENTINEL_DIR: sentinelDir },
      );
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout.trim());
      expect(parsed).toMatchObject({ decision: "deny" });
      // agy modify surfaces the per-tool routing guidance (curl/wget), not a
      // generic line, using agy's context-mode/<tool> call surface.
      expect(parsed.reason).toContain("curl/wget redirected");
      expect(parsed.reason).toContain("context-mode/ctx_execute");
    } finally {
      try { rmSync(sentinelDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test("PreToolUse denies mapped view_file payloads with ctx_execute_file guidance", () => {
    const r = dispatch(
      "pretooluse.mjs",
      {
        conversationId: SID,
        workspacePaths: [CWD],
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: "/repo/src/app.ts" },
        },
      },
      home,
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed).toMatchObject({ decision: "deny" });
    expect(parsed.reason).toContain("ctx_execute_file");
  });

  test("PreToolUse denies mapped grep_search payloads with ctx_execute guidance", () => {
    const r = dispatch(
      "pretooluse.mjs",
      {
        conversationId: SID,
        workspacePaths: [CWD],
        toolCall: {
          name: "grep_search",
          args: { Pattern: "TODO", path: "/repo" },
        },
      },
      home,
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed).toMatchObject({ decision: "deny" });
    expect(parsed.reason).toContain("ctx_execute");
  });

  test("PreToolUse leaves unmapped list_dir and search_web payloads alone", () => {
    for (const [name, args] of [
      ["list_dir", { path: "/repo" }],
      ["search_web", { query: "context-mode" }],
    ] as const) {
      cleanupMarkers();
      const r = dispatch(
        "pretooluse.mjs",
        {
          conversationId: SID,
          workspacePaths: [CWD],
          toolCall: { name, args },
        },
        home,
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    }
  });

  test("payload normalization covers agy's basic native tool names", () => {
    const cases = [
      ["run_command", { CommandLine: "git status" }, "Bash", "command"],
      ["view_file", { AbsolutePath: "/repo/a.ts" }, "Read", "file_path"],
      ["grep_search", { Pattern: "TODO", path: "/repo" }, "Grep", "pattern"],
      ["list_dir", { path: "/repo" }, "LS", "path"],
      ["read_url_content", { URL: "https://example.com" }, "WebFetch", "url"],
      ["search_web", { query: "context-mode" }, "WebSearch", "query"],
    ] as const;

    for (const [name, args, expectedTool, expectedField] of cases) {
      const input = fromAgy({
        conversationId: SID,
        workspacePaths: [CWD],
        toolCall: { name, args },
      });
      expect(input.tool_name).toBe(expectedTool);
      expect(input.tool_input).toHaveProperty(expectedField);
    }
  });

  test("extractUserRequest extracts text from USER_REQUEST tags and falls back to trimmed prose", () => {
    expect(extractUserRequest("<USER_REQUEST>\nuse vite instead of webpack\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\ntime: now\n</ADDITIONAL_METADATA>")).toBe("use vite instead of webpack");
    expect(extractUserRequest("<USER_REQUEST>remember this decision</USER_REQUEST>")).toBe("remember this decision");
    expect(extractUserRequest("  plain prompt without tags  ")).toBe("plain prompt without tags");
    expect(extractUserRequest("")).toBe("");
    expect(extractUserRequest(null)).toBe("");
  });

  test("getLatestUserPromptFromTranscript returns the most recent USER_INPUT from transcript.jsonl", () => {
    const transcriptFile = join(home, "transcript.jsonl");
    expect(getLatestUserPromptFromTranscript(transcriptFile)).toBeNull();
    expect(getLatestUserPromptFromTranscript("/non/existent/path.jsonl")).toBeNull();

    writeFileSync(transcriptFile, "");
    expect(getLatestUserPromptFromTranscript(transcriptFile)).toBeNull();

    const lines = [
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "<USER_REQUEST>first prompt</USER_REQUEST>" }),
      JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", content: "response 1" }),
      JSON.stringify({ step_index: 2, type: "GENERIC", content: "tool output" }),
      JSON.stringify({ step_index: 3, type: "USER_INPUT", content: "<USER_REQUEST>second decision prompt</USER_REQUEST>\n<ADDITIONAL_METADATA>meta</ADDITIONAL_METADATA>" }),
      JSON.stringify({ step_index: 4, type: "PLANNER_RESPONSE", content: "response 2" }),
    ];
    writeFileSync(transcriptFile, lines.join("\n") + "\n");

    const result = getLatestUserPromptFromTranscript(transcriptFile);
    expect(result).not.toBeNull();
    expect(result?.prompt).toBe("second decision prompt");
    expect(result?.stepIndex).toBe(3);
  });

  test("PostToolUse normalizes agy run_command payloads and captures git events", () => {
    const r = dispatch(
      "posttooluse.mjs",
      {
        conversationId: SID,
        workspacePaths: [CWD],
        toolCall: {
          name: "run_command",
          args: { CommandLine: "git status --short" },
        },
        error: "",
      },
      home,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");

    const db = openDB(home);
    const gitRows = db.prepare("select type, category, data, source_hook from session_events where category = 'git'").all() as Array<{
      type: string;
      category: string;
      data: string;
      source_hook: string;
    }>;
    expect(gitRows).toHaveLength(1);
    expect(gitRows[0]).toMatchObject({
      type: "git",
      category: "git",
      data: "status",
      source_hook: "PostToolUse",
    });
    db.close();
  });

  test("PostToolUse picks up PreToolUse rejected/redirect markers", () => {
    const sentinelDir = mkdtempSync(join(tmpdir(), "ctx-agy-sentinel-"));
    writeFileSync(join(sentinelDir, `context-mode-mcp-ready-${process.pid}`), String(process.pid));
    try {
      const pre = dispatch(
        "pretooluse.mjs",
        {
          conversationId: SID,
          workspacePaths: [CWD],
          toolCall: {
            name: "run_command",
            args: { CommandLine: "curl https://example.com" },
          },
        },
        home,
        { CONTEXT_MODE_MCP_SENTINEL_DIR: sentinelDir },
      );
      expect(pre.status).toBe(0);

      const post = dispatch(
        "posttooluse.mjs",
        {
          conversationId: SID,
          workspacePaths: [CWD],
          toolCall: { name: "run_command", args: { CommandLine: "git status" } },
          error: "",
        },
        home,
      );
      expect(post.status).toBe(0);

      const db = openDB(home);
      const rejected = db.prepare("select data, source_hook from session_events where category = 'rejected-approach'").all() as Array<{
        data: string;
        source_hook: string;
      }>;
      const redirects = db.prepare("select type, category, bytes_avoided, source_hook from session_events where category = 'redirect'").all() as Array<{
        type: string;
        category: string;
        bytes_avoided: number;
        source_hook: string;
      }>;
      expect(rejected[0].data).toContain("Bash");
      expect(rejected[0].source_hook).toBe("PreToolUse");
      expect(redirects[0]).toMatchObject({
        type: "bash-redirected",
        category: "redirect",
        bytes_avoided: 8192,
        source_hook: "PreToolUse",
      });
      db.close();
    } finally {
      try { rmSync(sentinelDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test("rejected/redirect markers round-trip when agy sends a <uuid>.jsonl transcriptPath", () => {
    // Regression guard: getSessionId prefers the transcript UUID over
    // conversationId. pretooluse.mjs must key its marker files with the SAME
    // function posttooluse.mjs reads them with, or the rejected/redirect handoff
    // silently misses for realistic agy payloads (transcriptPath = <uuid>.jsonl).
    const markerId = "11111111-1111-1111-1111-111111111111";
    const transcriptPath = `/tmp/agy/${markerId}.jsonl`;
    const sentinelDir = mkdtempSync(join(tmpdir(), "ctx-agy-sentinel-"));
    writeFileSync(join(sentinelDir, `context-mode-mcp-ready-${process.pid}`), String(process.pid));
    try {
      const pre = dispatch(
        "pretooluse.mjs",
        {
          conversationId: SID,
          transcriptPath,
          workspacePaths: [CWD],
          toolCall: { name: "run_command", args: { CommandLine: "curl https://example.com" } },
        },
        home,
        { CONTEXT_MODE_MCP_SENTINEL_DIR: sentinelDir },
      );
      expect(pre.status).toBe(0);

      const post = dispatch(
        "posttooluse.mjs",
        {
          conversationId: SID,
          transcriptPath,
          workspacePaths: [CWD],
          toolCall: { name: "run_command", args: { CommandLine: "git status" } },
          error: "",
        },
        home,
      );
      expect(post.status).toBe(0);

      const db = openDB(home);
      const rejected = db.prepare("select source_hook from session_events where category = 'rejected-approach'").all() as Array<{ source_hook: string }>;
      const redirects = db.prepare("select bytes_avoided from session_events where category = 'redirect'").all() as Array<{ bytes_avoided: number }>;
      // With the pre/post session-id mismatch bug these arrays are empty.
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected[0].source_hook).toBe("PreToolUse");
      expect(redirects[0]?.bytes_avoided).toBe(8192);
      db.close();
    } finally {
      try { rmSync(sentinelDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { rmSync(resolve(tmpdir(), `context-mode-rejected-${markerId}.txt`), { force: true }); } catch { /* ignore */ }
      try { rmSync(resolve(tmpdir(), `context-mode-redirect-${markerId}.txt`), { force: true }); } catch { /* ignore */ }
    }
  });

  test("PostToolUse normalizes agy grep_search payloads and captures file_search events", () => {
    const r = dispatch(
      "posttooluse.mjs",
      {
        conversationId: SID,
        workspacePaths: [CWD],
        toolCall: {
          name: "grep_search",
          args: { Pattern: "TODO", path: "/repo/src" },
        },
        error: "",
      },
      home,
    );
    expect(r.status).toBe(0);

    const db = openDB(home);
    const rows = db.prepare("select type, category, data from session_events where type = 'file_search'").all() as Array<{
      type: string;
      category: string;
      data: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "file_search",
      category: "file",
      data: "TODO in /repo/src",
    });
    db.close();
  });

  test("Stop captures a session_end event", () => {
    const r = dispatch(
      "stop.mjs",
      {
        conversationId: SID,
        workspacePaths: [CWD],
        transcriptPath: "/tmp/agy/transcript.jsonl",
        status: "completed",
        stepIdx: 7,
      },
      home,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");

    const db = openDB(home);
    const end = db.prepare("select data, source_hook from session_events where type = 'session_end'").all() as Array<{
      data: string;
      source_hook: string;
    }>;
    expect(end).toHaveLength(1);
    expect(end[0].source_hook).toBe("Stop");
    expect(JSON.parse(end[0].data)).toMatchObject({
      status: "completed",
      stepIdx: 7,
      transcriptPath: "/tmp/agy/transcript.jsonl",
    });
    db.close();
  });

  test("PreToolUse fails open on malformed stdin", () => {
    const r = dispatch("pretooluse.mjs", "not-json{{", home);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
