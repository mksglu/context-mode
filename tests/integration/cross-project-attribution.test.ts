/**
 * Bug 7 repro — cross-project attribution.
 *
 * Spec: "User A'da checkout olup B'de çalışırsa B'yi %100 track et."
 *
 * Setup: two fake git repos at /tmp/projA, /tmp/projB. Drive
 * attributeAndInsertEvents with input.cwd=/tmp/projA but an Edit event
 * touching /tmp/projB/src/foo.ts. The captured POST body's `project`
 * field MUST resolve to project B's canonical identity (file's repo),
 * NOT A's (cwd's repo).
 *
 * If GREEN today: existing EVENT_PATH attribution already handles the
 * file-event case and Bug 7 narrows to non-file event types / Bash-only
 * ops (Bug 8 territory).
 * If RED: deep fix needed in src/session/project-attribution.ts or
 * session-loaders.mjs enrichment.
 */

import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

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

const gitSetupShell = process.platform === "win32" ? undefined : "/bin/bash";

function shellPath(path: string): string {
  return path.replace(/\\/g, "/");
}

describe("cross-project attribution — Bug 7 repro", () => {
  let fakeHome: string;
  let projA: string;
  let projB: string;
  let captured: { body: Record<string, unknown> }[];
  let origFetch: typeof fetch;
  let origHome: string | undefined;
  let origAppData: string | undefined;
  let origXdg: string | undefined;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "cross-project-home-"));
    origHome = process.env.HOME;
    origAppData = process.env.APPDATA;
    origXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = fakeHome;
    process.env.APPDATA = join(fakeHome, "AppData", "Roaming");
    delete process.env.XDG_CONFIG_HOME;

    // Real git repos so resolveProjectIdentity in the bridge can canonicalize
    projA = mkdtempSync(join(tmpdir(), "projA-"));
    projB = mkdtempSync(join(tmpdir(), "projB-"));
    for (const [dir, remote] of [
      [projA, "git@github.com:acme/projA.git"],
      [projB, "git@github.com:acme/projB.git"],
    ] as const) {
      execSync(`git init -q && git remote add origin ${remote}`, {
        cwd: dir,
        stdio: "ignore",
        ...(gitSetupShell ? { shell: gitSetupShell } : {}),
      });
    }

    const cfgFile = platformConfigFile(fakeHome);
    mkdirSync(dirname(cfgFile), { recursive: true });
    writeFileSync(cfgFile, JSON.stringify({
      api_key: "ctxm_crossproj",
      platform_url: "https://capture.local/api/v1",
    }));

    captured = [];
    origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init: { body: string }) => {
      captured.push({ body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origHome !== undefined) process.env.HOME = origHome; else delete process.env.HOME;
    if (origAppData !== undefined) process.env.APPDATA = origAppData; else delete process.env.APPDATA;
    if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg; else delete process.env.XDG_CONFIG_HOME;
    try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* */ }
    try { rmSync(projA, { recursive: true, force: true }); } catch { /* */ }
    try { rmSync(projB, { recursive: true, force: true }); } catch { /* */ }
    vi.restoreAllMocks();
  });

  test("tracer: cwd=projA but file_edit on projB/foo.ts → body.project resolves to projB's canonical id", async () => {
    const db = new SessionDB({ dbPath: join(fakeHome, "test.db") });
    const sid = "cross-proj-" + Date.now();
    db.ensureSession(sid, projA);

    // Canonical event from extract.ts for an Edit tool call on projB's file
    const events = [
      { type: "file_edit", category: "file", data: join(projB, "src/foo.ts"), priority: 2 },
    ];

    // Real attribution resolver — comes from src/session/project-attribution.ts
    // via createSessionLoaders.loadProjectAttribution(). We import directly
    // here to exercise the production path.
    const { resolveProjectAttributions } = await import("../../src/session/project-attribution.js");

    attributeAndInsertEvents(
      db,
      sid,
      events,
      { workspace_roots: [projA], cwd: projA, tool_name: "Edit", tool_input: { file_path: join(projB, "src/foo.ts") } },
      projA,                                       // projectDir hint = A (cwd)
      "PostToolUse",
      resolveProjectAttributions,
    );

    await new Promise((r) => setTimeout(r, 80));

    expect(captured.length).toBe(1);
    const body = captured[0].body;

    // Diagnostic — print the attribution outcome before assertion
    // eslint-disable-next-line no-console
    console.log(`[Bug 7 tracer] projA basename=${projA.split("/").pop()}, projB basename=${projB.split("/").pop()}, body.project=${body.project}, body.projectDir=${body.projectDir}`);

    // Spec: file edit on B's file MUST attribute to B regardless of cwd=A.
    // resolveProjectIdentity walks up looking for .git. From projA path it
    // finds projA's remote → "github.com/acme/projA". From projB path it
    // finds projB's remote → "github.com/acme/projB".
    expect(body.project).toBe("github.com/acme/projB");

    db.close?.();
  });

  test("batched events split across projA + projB → each attributes to its own repo", async () => {
    const db = new SessionDB({ dbPath: join(fakeHome, "test.db") });
    const sid = "cross-proj-batch-" + Date.now();
    db.ensureSession(sid, projA);

    const events = [
      { type: "file_edit", category: "file", data: join(projB, "src/a.ts"), priority: 2 },
      { type: "file_edit", category: "file", data: join(projA, "src/b.ts"), priority: 2 },
      { type: "file_edit", category: "file", data: join(projB, "src/c.ts"), priority: 2 },
    ];
    const { resolveProjectAttributions } = await import("../../src/session/project-attribution.js");

    attributeAndInsertEvents(
      db, sid, events,
      { workspace_roots: [projA], cwd: projA, tool_name: "Edit" },
      projA, "PostToolUse", resolveProjectAttributions,
    );
    await new Promise((r) => setTimeout(r, 80));

    expect(captured.length).toBe(3);
    expect(captured[0].body.project).toBe("github.com/acme/projB");
    expect(captured[1].body.project).toBe("github.com/acme/projA");
    expect(captured[2].body.project).toBe("github.com/acme/projB");

    db.close?.();
  });

  test("Bug 8 — Bash 'git -C /projB status' via real extractEvents → project=projB", async () => {
    const db = new SessionDB({ dbPath: join(fakeHome, "test.db") });
    const sid = "bash-c-" + Date.now();
    db.ensureSession(sid, projA);

    // Exercise the real extract.ts → attribution → bridge pipeline. After the
    // Bug 8 fix, extractCwd must surface the `-C <dir>` argument as a cwd
    // event BEFORE the git event so attribution's LAST_SEEN carry-forward
    // captures /projB for downstream git events in the same Bash call.
    const { extractEvents } = await import("../../src/session/extract.js");
    const bashInput = {
      tool_name: "Bash",
      tool_input: { command: `git -C "${shellPath(projB)}" status` },
      tool_response: "",
    };
    const events = extractEvents(bashInput as Parameters<typeof extractEvents>[0]);
    // eslint-disable-next-line no-console
    console.log(`[Bug 8 extract output] ${JSON.stringify(events)}`);

    const { resolveProjectAttributions } = await import("../../src/session/project-attribution.js");

    attributeAndInsertEvents(
      db, sid, events,
      { workspace_roots: [projA], cwd: projA, ...bashInput },
      projA, "PostToolUse", resolveProjectAttributions,
    );
    await new Promise((r) => setTimeout(r, 80));

    // eslint-disable-next-line no-console
    console.log(`[Bug 8 captured] ${captured.map(c => `${c.body.type}→${c.body.project}`).join(", ")}`);

    // The LAST captured body (the git event) MUST resolve to projB.
    // Whether extractEvents emits 1 event (just git) or 2 events (cwd hint +
    // git), the final git event's project should be projB after fix.
    const gitBody = captured.find((c) => c.body.category === "git" || c.body.type === "git");
    expect(gitBody?.body.project).toBe("github.com/acme/projB");

    db.close?.();
  });

  test("Bug 8 — Bash 'cd /projB && npm test' → project=projB", async () => {
    const db = new SessionDB({ dbPath: join(fakeHome, "test.db") });
    const sid = "bash-cd-" + Date.now();
    db.ensureSession(sid, projA);

    const events = [
      { type: "cwd", category: "cwd", data: projB, priority: 2 },
    ];
    const { resolveProjectAttributions } = await import("../../src/session/project-attribution.js");

    attributeAndInsertEvents(
      db, sid, events,
      {
        workspace_roots: [projA],
        cwd: projA,
        tool_name: "Bash",
        tool_input: { command: `cd "${shellPath(projB)}" && npm test` },
      },
      projA, "PostToolUse", resolveProjectAttributions,
    );
    await new Promise((r) => setTimeout(r, 80));

    expect(captured.length).toBe(1);
    // eslint-disable-next-line no-console
    console.log(`[Bug 8 cd] body.project=${captured[0].body.project}`);
    expect(captured[0].body.project).toBe("github.com/acme/projB");

    db.close?.();
  });

  test("Bash without any path indicator → falls back to cwd (projA) — expected behavior", async () => {
    const db = new SessionDB({ dbPath: join(fakeHome, "test.db") });
    const sid = "bash-no-path-" + Date.now();
    db.ensureSession(sid, projA);

    const events = [
      // No git op match, no cwd event — just generic shell activity
      { type: "data", category: "data", data: "free disk space", priority: 3 },
    ];
    const { resolveProjectAttributions } = await import("../../src/session/project-attribution.js");

    attributeAndInsertEvents(
      db, sid, events,
      {
        workspace_roots: [projA],
        cwd: projA,
        tool_name: "Bash",
        tool_input: { command: `df -h` },
      },
      projA, "PostToolUse", resolveProjectAttributions,
    );
    await new Promise((r) => setTimeout(r, 80));

    expect(captured.length).toBe(1);
    // Correct fallback: cwd-derived project (projA)
    expect(captured[0].body.project).toBe("github.com/acme/projA");

    db.close?.();
  });
});
