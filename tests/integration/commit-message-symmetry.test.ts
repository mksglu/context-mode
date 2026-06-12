/**
 * Bug 2 repro — rollup `commit_message` asymmetric with `has_commit`.
 *
 * Symptom: a session with one git commit event followed by N non-git events
 * produces N+1 outgoing POSTs where ALL carry `has_commit=1` (the rollup
 * stamps it per-event) but only ONE carries `commit_message`. Result on the
 * platform: ~(N/(N+1)) rows arrive with `has_commit=1` AND `commit_message=NULL`.
 *
 * Per /diagnose discipline this seam reproduces the asymmetry before any
 * fix is applied. The fix is correct when every captured body has the same
 * `commit_message` value alongside `has_commit=1`.
 */

import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import { SessionDB } from "../../src/session/db.js";
import { attributeAndInsertEvents } from "../../hooks/session-loaders.mjs";

function platformConfigFile(fakeHome: string): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(fakeHome, "AppData", "Roaming"),
      "context-mode",
      "platform.json",
    );
  }
  return join(fakeHome, ".context-mode", "platform.json");
}

describe("session-loaders — Bug 2 repro: commit_message symmetric stamp", () => {
  let fakeHome: string;
  let dbPath: string;
  let origHome: string | undefined;
  let origAppData: string | undefined;
  let origXdg: string | undefined;
  let captured: { body: Record<string, unknown> }[];
  let origFetch: typeof fetch;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "commit-msg-symmetry-"));
    dbPath = join(fakeHome, "test.db");
    origHome = process.env.HOME;
    origAppData = process.env.APPDATA;
    origXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = fakeHome;
    process.env.APPDATA = join(fakeHome, "AppData", "Roaming");
    delete process.env.XDG_CONFIG_HOME;

    const cfgFile = platformConfigFile(fakeHome);
    mkdirSync(dirname(cfgFile), { recursive: true });
    writeFileSync(
      cfgFile,
      JSON.stringify({ api_key: "ctxm_repro", platform_url: "https://capture.local/api/v1" }),
    );

    captured = [];
    origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init: { body: string }) => {
      captured.push({ body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
    if (origAppData !== undefined) process.env.APPDATA = origAppData;
    else delete process.env.APPDATA;
    if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
    else delete process.env.XDG_CONFIG_HOME;
    try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* */ }
    vi.restoreAllMocks();
  });

  test("session with 1 commit + 3 file edits — every body MUST carry commit_message alongside has_commit", async () => {
    const db = new SessionDB({ dbPath });
    const sid = "commit-msg-symmetry-" + Date.now();
    db.ensureSession(sid, fakeHome);

    // Bypass extract.ts to isolate Bug 2 — feed the rollup query a session
    // shape where ONE event IS the commit (data carries the commit subject)
    // and three follow-up events are non-git. Today every body gets
    // has_commit=1 via rollup stamp, but only the git event has the
    // commit_message field.
    // Shape mirrors post-Bug-1-fix extract.ts output: actual commits surface as
    // type='git_commit' with data=<message>. Non-commit git ops keep type='git'
    // with data=<operation> (not exercised here — Bug 2 is about per-event
    // commit_message symmetry, not commit detection accuracy).
    const events = [
      { type: "git_commit", category: "git",  data: "feat: rollup symmetry", priority: 2 },
      { type: "file_edit",  category: "file", data: "/proj/a.ts",            priority: 2 },
      { type: "file_edit",  category: "file", data: "/proj/b.ts",            priority: 2 },
      { type: "file_edit",  category: "file", data: "/proj/c.ts",            priority: 2 },
    ];
    const resolveAttribs = (evs: { type: string }[]) =>
      evs.map(() => ({ projectDir: fakeHome, source: "input_cwd", confidence: 1 }));

    attributeAndInsertEvents(
      db,
      sid,
      events,
      { workspace_roots: [fakeHome] },
      fakeHome,
      "PostToolUse",
      resolveAttribs,
    );

    await new Promise((r) => setTimeout(r, 80));

    expect(captured.length).toBe(events.length);

    // Diagnostic — surface the asymmetry counts before the assertion fires.
    const withHasCommit = captured.filter((c) => c.body.has_commit === 1).length;
    const withMsg = captured.filter((c) => typeof c.body.commit_message === "string" && (c.body.commit_message as string).length > 0).length;
    // eslint-disable-next-line no-console
    console.log(`[Bug 2 repro] has_commit=1: ${withHasCommit}/${captured.length} · commit_message present: ${withMsg}/${captured.length}`);

    // RED today — withMsg === 1 because the rollup stamp doesn't include
    // commit_message. Fix is correct when this equals captured.length.
    expect(withMsg).toBe(captured.length);

    db.close?.();
  });
});
