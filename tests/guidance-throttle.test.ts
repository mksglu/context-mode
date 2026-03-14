import { describe, it, expect, beforeEach } from "vitest";
import { routePreToolUse, resetGuidanceThrottle } from "../hooks/core/routing.mjs";

const PROJECT_DIR = "/tmp/test-project";

describe("guidance throttle", () => {
  beforeEach(() => {
    // Reset throttle state between tests so each test starts fresh
    if (typeof resetGuidanceThrottle === "function") resetGuidanceThrottle();
  });

  it("Read: first call returns guidance, subsequent calls return null", () => {
    const r1 = routePreToolUse("Read", { file_path: "/tmp/a.ts" }, PROJECT_DIR);
    const r2 = routePreToolUse("Read", { file_path: "/tmp/b.ts" }, PROJECT_DIR);
    const r3 = routePreToolUse("Read", { file_path: "/tmp/c.ts" }, PROJECT_DIR);

    expect(r1?.action).toBe("context");
    expect(r2).toBeNull();
    expect(r3).toBeNull();
  });

  it("Bash: first call returns guidance, second returns null", () => {
    const r1 = routePreToolUse("Bash", { command: "ls" }, PROJECT_DIR);
    const r2 = routePreToolUse("Bash", { command: "pwd" }, PROJECT_DIR);

    expect(r1?.action).toBe("context");
    expect(r2).toBeNull();
  });

  it("Grep: first call returns guidance, second returns null", () => {
    const r1 = routePreToolUse("Grep", { pattern: "foo" }, PROJECT_DIR);
    const r2 = routePreToolUse("Grep", { pattern: "bar" }, PROJECT_DIR);

    expect(r1?.action).toBe("context");
    expect(r2).toBeNull();
  });

  it("throttle is per-type: Read throttle does not affect Bash or Grep", () => {
    const read1 = routePreToolUse("Read", { file_path: "/tmp/a.ts" }, PROJECT_DIR);
    const bash1 = routePreToolUse("Bash", { command: "ls" }, PROJECT_DIR);
    const grep1 = routePreToolUse("Grep", { pattern: "foo" }, PROJECT_DIR);

    // All first calls return guidance
    expect(read1?.action).toBe("context");
    expect(bash1?.action).toBe("context");
    expect(grep1?.action).toBe("context");

    // All second calls return null
    const read2 = routePreToolUse("Read", { file_path: "/tmp/b.ts" }, PROJECT_DIR);
    const bash2 = routePreToolUse("Bash", { command: "pwd" }, PROJECT_DIR);
    const grep2 = routePreToolUse("Grep", { pattern: "bar" }, PROJECT_DIR);

    expect(read2).toBeNull();
    expect(bash2).toBeNull();
    expect(grep2).toBeNull();
  });

  it("deny/modify actions are NEVER throttled", () => {
    // WebFetch deny should always fire
    const d1 = routePreToolUse("WebFetch", { url: "https://example.com" }, PROJECT_DIR);
    const d2 = routePreToolUse("WebFetch", { url: "https://other.com" }, PROJECT_DIR);

    expect(d1?.action).toBe("deny");
    expect(d2?.action).toBe("deny");
  });

  it("resetGuidanceThrottle clears state (simulates new session)", () => {
    const r1 = routePreToolUse("Read", { file_path: "/tmp/a.ts" }, PROJECT_DIR);
    expect(r1?.action).toBe("context");

    const r2 = routePreToolUse("Read", { file_path: "/tmp/b.ts" }, PROJECT_DIR);
    expect(r2).toBeNull();

    // Reset = new session
    resetGuidanceThrottle();

    const r3 = routePreToolUse("Read", { file_path: "/tmp/c.ts" }, PROJECT_DIR);
    expect(r3?.action).toBe("context");
  });

  it("file-based markers persist across in-memory resets (cross-process sim)", () => {
    // First call creates both in-memory + file marker
    const r1 = routePreToolUse("Read", { file_path: "/tmp/a.ts" }, PROJECT_DIR);
    expect(r1?.action).toBe("context");

    // Clear only in-memory state (simulates new process with same ppid)
    resetGuidanceThrottle();

    // Manually re-create the marker to simulate file persisting from another process
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const wid = process.env.VITEST_WORKER_ID;
    const suffix = wid ? `${process.ppid}-w${wid}` : String(process.ppid);
    const dir = path.resolve(os.tmpdir(), `context-mode-guidance-${suffix}`);
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    try { fs.writeFileSync(path.resolve(dir, "read"), "", "utf-8"); } catch {}

    // Should detect file marker even though in-memory was cleared
    const r2 = routePreToolUse("Read", { file_path: "/tmp/b.ts" }, PROJECT_DIR);
    expect(r2).toBeNull();
  });

  it("Bash passthrough returns null after guidance throttled (not context)", () => {
    // First Bash fires guidance
    const r1 = routePreToolUse("Bash", { command: "ls" }, PROJECT_DIR);
    expect(r1?.action).toBe("context");

    // Second Bash should be null passthrough, not another context
    const r2 = routePreToolUse("Bash", { command: "pwd" }, PROJECT_DIR);
    expect(r2).toBeNull();
  });
});
