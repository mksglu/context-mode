import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveCodexSessionCwd,
  resolveCodexToolContext,
  resolveProjectDir,
} from "../../src/util/project-dir.js";
import { pathToFileURL } from "node:url";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length) {
    const p = cleanup.pop();
    if (p) try { rmSync(p, { recursive: true, force: true }); } catch {}
  }
});

function makeCodexHome(): string {
  const d = mkdtempSync(join(tmpdir(), "ctx-codex-home-"));
  cleanup.push(d);
  return d;
}

function writeSession(
  codexHome: string,
  uuid: string,
  cwd: string | null,
  mtime?: Date,
  malformed = false,
): string {
  const sessionsDir = join(codexHome, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  const file = join(sessionsDir, `${uuid}.jsonl`);

  let content: string;
  if (malformed) {
    content = "{not valid json\n";
  } else {
    // Mirror Codex's SessionMeta shape — line 1 carries `meta.cwd`.
    const meta: Record<string, unknown> = { sessionId: uuid };
    if (cwd !== null) meta.cwd = cwd;
    content = JSON.stringify({ meta }) + "\n";
  }
  writeFileSync(file, content);
  if (mtime) utimesSync(file, mtime, mtime);
  return file;
}

function writeDesktopSession(
  codexHome: string,
  name: string,
  cwd: string,
  mtime?: Date,
  extraPayload?: Record<string, unknown>,
): string {
  const sessionsDir = join(codexHome, "sessions", "2026", "05", "28");
  mkdirSync(sessionsDir, { recursive: true });
  const file = join(sessionsDir, `${name}.jsonl`);
  const lines = [
    JSON.stringify({ type: "session_meta", payload: { id: name, cwd, ...extraPayload } }),
    JSON.stringify({ type: "turn_context", payload: { cwd } }),
  ];
  writeFileSync(file, lines.join("\n") + "\n");
  if (mtime) utimesSync(file, mtime, mtime);
  return file;
}

describe("resolveCodexSessionCwd", () => {
  it("uses the host's request workspace URI and thread identity without scanning other sessions", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "other-session", "/project/other");
    const projectDir = join(codexHome, "own with spaces");
    expect(resolveCodexToolContext({
      threadId: "own-session",
      "codex/sandbox-state-meta": { sandboxCwd: pathToFileURL(projectDir).href },
    }, codexHome)).toEqual({ projectDir, sessionId: "own-session" });
  });

  it("rejects invalid host workspace URIs instead of falling back to another project", () => {
    expect(() => resolveCodexToolContext({ threadId: "own-session", "codex/sandbox-state-meta": { sandboxCwd: "https://example.com/project" } })).toThrow(/workspace/i);
  });

  it("uses only the matching thread transcript when the host does not provide a workspace URI", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "own-session", "/project/own", new Date(0));
    writeSession(codexHome, "other-session", "/project/other");
    expect(resolveCodexToolContext({ threadId: "own-session" }, codexHome)).toEqual({ projectDir: "/project/own", sessionId: "own-session" });
    expect(() => resolveCodexToolContext({ threadId: "missing-session" }, codexHome)).toThrow(/workspace/i);
  });

  it("resolves the requesting session even while another project has the newest transcript", () => {
    const codexHome = makeCodexHome();
    const own = writeSession(codexHome, "own-session", "/project/own", new Date(0));
    const other = writeSession(codexHome, "other-session", "/project/other", new Date());

    expect(resolveCodexSessionCwd({ codexHome, sessionId: "own-session" })).toBe("/project/own");
    utimesSync(other, new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "own-session" })).toBe("/project/own");
    expect(own).not.toBe(other);
  });

  it("does not borrow another project's transcript when the requesting session is unknown", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "other-session", "/project/other", new Date());

    expect(resolveCodexSessionCwd({ codexHome, sessionId: "missing-session" })).toBeNull();
  });

  it("does not infer a requesting project from global transcript recency", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "other-session", "/project/other", new Date());

    expect(resolveProjectDir({
      env: {}, cwd: "/project/own", pwd: "/project/own", strictPlatform: "codex", codexHome,
    })).toBe("/project/own");
  });

  it("requires a requesting session identity before reading transcripts", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "other-session", "/project/other");
    expect(resolveCodexSessionCwd({ codexHome })).toBeNull();
  });

  it("rejects a filename match whose metadata belongs to a different session", () => {
    const codexHome = makeCodexHome();
    writeDesktopSession(codexHome, "own-session", "/project/other", undefined, { id: "other-session" });
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "own-session" })).toBeNull();
  });

  it("returns meta.cwd from the identified session.jsonl", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "old-uuid", "/project/old", new Date(Date.now() - 60_000));
    writeSession(codexHome, "new-uuid", "/project/new", new Date());

    expect(resolveCodexSessionCwd({ codexHome, sessionId: "new-uuid" })).toBe("/project/new");
  });

  it("returns payload.cwd from Codex Desktop's dated rollout session layout", () => {
    const codexHome = makeCodexHome();
    writeDesktopSession(
      codexHome,
      "rollout-2026-05-28T12-00-00-000Z",
      "/Users/x/Work/Dev/ucw",
      new Date(),
    );

    expect(resolveCodexSessionCwd({ codexHome, sessionId: "rollout-2026-05-28T12-00-00-000Z" })).toBe("/Users/x/Work/Dev/ucw");
  });

  it("handles Codex Desktop session_meta lines larger than the old 8KB head read", () => {
    const codexHome = makeCodexHome();
    writeDesktopSession(
      codexHome,
      "rollout-large-meta",
      "/project/large-meta",
      new Date(),
      { dynamic_tools: "x".repeat(16_000) },
    );

    expect(resolveCodexSessionCwd({ codexHome, sessionId: "rollout-large-meta" })).toBe("/project/large-meta");
  });

  it("finds an identified Codex Desktop session recursively", () => {
    const codexHome = makeCodexHome();
    writeDesktopSession(
      codexHome,
      "rollout-old",
      "/project/old",
      new Date(Date.now() - 60_000),
    );
    writeDesktopSession(codexHome, "rollout-new", "/project/new", new Date());

    expect(resolveCodexSessionCwd({ codexHome, sessionId: "rollout-new" })).toBe("/project/new");
  });

  it("keeps an identified inactive session bound to its project", () => {
    const codexHome = makeCodexHome();
    const now = Date.now();
    writeSession(codexHome, "stale", "/project/stale", new Date(now - 60_000));

    const result = resolveCodexSessionCwd({
      codexHome,
      sessionId: "stale",
      transcriptMaxAgeMs: 30_000,
      now,
    });
    expect(result).toBe("/project/stale");
  });

  it("returns meta.cwd for the identified active session", () => {
    const codexHome = makeCodexHome();
    const now = Date.now();
    writeSession(codexHome, "fresh", "/project/fresh", new Date(now - 10_000));

    const result = resolveCodexSessionCwd({
      codexHome,
      sessionId: "fresh",
      transcriptMaxAgeMs: 30_000,
      now,
    });
    expect(result).toBe("/project/fresh");
  });

  it("rejects when meta.cwd points to plugin install path (isPluginInstallPath)", () => {
    const codexHome = makeCodexHome();
    writeSession(
      codexHome,
      "poisoned",
      "/Users/x/.claude/plugins/cache/context-mode/context-mode/1.0.148",
    );
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "poisoned" })).toBeNull();
  });

  it("rejects when meta.cwd points to Codex plugin install path (isPluginInstallPath)", () => {
    const codexHome = makeCodexHome();
    writeSession(
      codexHome,
      "poisoned-codex",
      "/Users/x/.codex/plugins/cache/context-mode/context-mode/1.0.151",
    );
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "poisoned-codex" })).toBeNull();
  });

  it("rejects when Codex Desktop payload.cwd points to Codex plugin install path", () => {
    const codexHome = makeCodexHome();
    writeDesktopSession(
      codexHome,
      "rollout-poisoned",
      "/Users/x/.codex/plugins/cache/context-mode/context-mode/1.0.151",
    );
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "rollout-poisoned" })).toBeNull();
  });

  it("returns null when sessions dir does not exist", () => {
    const codexHome = makeCodexHome();
    // No sessions/ subdir created.
    expect(resolveCodexSessionCwd({ codexHome })).toBeNull();
  });

  it("returns null when codexHome itself does not exist", () => {
    expect(resolveCodexSessionCwd({ codexHome: "/nonexistent/.codex" })).toBeNull();
  });

  it("returns null when sessions dir is empty", () => {
    const codexHome = makeCodexHome();
    mkdirSync(join(codexHome, "sessions"), { recursive: true });
    expect(resolveCodexSessionCwd({ codexHome })).toBeNull();
  });

  it("handles malformed session.jsonl gracefully (no throw)", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "broken", null, undefined, /* malformed */ true);
    expect(() => resolveCodexSessionCwd({ codexHome, sessionId: "broken" })).not.toThrow();
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "broken" })).toBeNull();
  });

  it("returns null when meta.cwd is missing from the SessionMeta line", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "no-cwd", null);
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "no-cwd" })).toBeNull();
  });

  it("returns null when meta.cwd is non-string", () => {
    const codexHome = makeCodexHome();
    const sessionsDir = join(codexHome, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, "weird.jsonl"),
      JSON.stringify({ meta: { cwd: 123 } }) + "\n",
    );
    expect(resolveCodexSessionCwd({ codexHome, sessionId: "weird" })).toBeNull();
  });
});

describe("resolveProjectDir({strictPlatform: 'codex'})", () => {
  it("honors CONTEXT_MODE_PROJECT_DIR env (universal escape hatch)", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "fresh", "/from/session", new Date());

    const result = resolveProjectDir({
      env: { CONTEXT_MODE_PROJECT_DIR: "/from/env" },
      cwd: "/cwd",
      pwd: "/pwd",
      strictPlatform: "codex",
      codexHome,
    });
    expect(result).toBe("/from/env");
  });

  it("uses launch cwd when no requesting thread identity is available", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "fresh", "/project/from-session", new Date());

    const result = resolveProjectDir({
      env: {},
      cwd: "/should-not-win",
      pwd: undefined,
      strictPlatform: "codex",
      codexHome,
    });
    expect(result).toBe("/should-not-win");
  });

  it("does not recover a plugin cwd from an unidentified desktop session", () => {
    const codexHome = makeCodexHome();
    writeDesktopSession(codexHome, "rollout-active", "/project/from-desktop", new Date());

    const result = resolveProjectDir({
      env: {},
      cwd: "/Users/x/.codex/plugins/cache/context-mode/context-mode/1.0.151",
      pwd: undefined,
      strictPlatform: "codex",
      codexHome,
    });
    expect(result).toBe("/Users/x/.codex/plugins/cache/context-mode/context-mode/1.0.151");
  });

  it("falls through to PWD when no env and no session log", () => {
    const codexHome = makeCodexHome();
    // No sessions written.

    const result = resolveProjectDir({
      env: {},
      cwd: "/cwd-fallback",
      pwd: "/pwd-wins",
      strictPlatform: "codex",
      codexHome,
    });
    expect(result).toBe("/pwd-wins");
  });

  it("ignores foreign workspace env (CLAUDE_PROJECT_DIR) under strict codex", () => {
    const codexHome = makeCodexHome();
    writeSession(codexHome, "fresh", "/project/from-session", new Date());

    const result = resolveProjectDir({
      env: { CLAUDE_PROJECT_DIR: "/leak/from/claude" },
      cwd: "/cwd",
      pwd: undefined,
      strictPlatform: "codex",
      codexHome,
    });
    expect(result).toBe("/cwd");
  });

  it("rejects stale codex session log via transcriptMaxAgeMs", () => {
    const codexHome = makeCodexHome();
    const now = Date.now();
    writeSession(codexHome, "stale", "/project/stale", new Date(now - 60_000));

    const result = resolveProjectDir({
      env: {},
      cwd: "/cwd",
      pwd: "/pwd-real",
      strictPlatform: "codex",
      codexHome,
      transcriptMaxAgeMs: 30_000,
      nowMs: now,
    });
    expect(result).toBe("/pwd-real");
  });
});
