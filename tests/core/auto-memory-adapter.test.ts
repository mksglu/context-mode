import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { searchAutoMemory } from "../../src/search/auto-memory.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { GeminiCLIAdapter } from "../../src/adapters/gemini-cli/index.js";

/**
 * Slice 4 — searchAutoMemory accepts an adapter and uses its
 * getInstructionFiles() / getMemoryDir() / getConfigDir() instead of
 * hardcoded ~/.claude / CLAUDE.md.
 *
 * Without an adapter it falls back to the historical Claude defaults
 * (so existing call sites keep working).
 */

describe("searchAutoMemory adapter dispatch", () => {
  let projectDir: string;
  let configDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "ctxam-proj-"));
    configDir = mkdtempSync(join(tmpdir(), "ctxam-cfg-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it("uses adapter.getInstructionFiles() to discover project rule files", () => {
    // Codex declares ['AGENTS.md', 'AGENTS.override.md'].
    writeFileSync(
      join(projectDir, "AGENTS.md"),
      "# Codex Agent Rules\nUse exact terms like ALPHA-CODEX-MARKER everywhere.\n",
      "utf-8",
    );
    const adapter = new CodexAdapter();

    const results = searchAutoMemory(
      ["ALPHA-CODEX-MARKER"],
      5,
      projectDir,
      undefined,
      adapter,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toContain("AGENTS.md");
  });

  it("uses adapter.getMemoryDir() (e.g. ~/.codex/memories) for memory scan", () => {
    // Build a fake codex config with memories/ subdir.
    const fakeMemoriesDir = join(configDir, "memories");
    mkdirSync(fakeMemoriesDir, { recursive: true });
    writeFileSync(
      join(fakeMemoriesDir, "decisions.md"),
      "Always prefer the BETA-MEMORY-TOKEN approach.\n",
      "utf-8",
    );

    // Custom adapter overriding getConfigDir + getMemoryDir to point at fixture.
    const adapter = new CodexAdapter();
    (adapter as unknown as { getConfigDir(): string }).getConfigDir = () => configDir;
    (adapter as unknown as { getMemoryDir(): string }).getMemoryDir = () => fakeMemoriesDir;
    (adapter as unknown as { getInstructionFiles(): string[] }).getInstructionFiles = () => ["AGENTS.md"];

    const results = searchAutoMemory(
      ["BETA-MEMORY-TOKEN"],
      5,
      projectDir,
      undefined,
      adapter,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toContain("decisions.md");
  });

  it("falls back to CLAUDE.md scan when no adapter is provided", () => {
    writeFileSync(
      join(projectDir, "CLAUDE.md"),
      "Project notes mention GAMMA-FALLBACK-FLAG repeatedly.\n",
      "utf-8",
    );

    const results = searchAutoMemory(["GAMMA-FALLBACK-FLAG"], 5, projectDir);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe("project/CLAUDE.md");
  });

  it("scans multiple instruction files when adapter declares multiple (e.g. AGENTS.md + AGENTS.override.md)", () => {
    writeFileSync(
      join(projectDir, "AGENTS.override.md"),
      "Override note: DELTA-OVERRIDE-MARKER takes precedence.\n",
      "utf-8",
    );
    const adapter = new CodexAdapter();

    const results = searchAutoMemory(
      ["DELTA-OVERRIDE-MARKER"],
      5,
      projectDir,
      undefined,
      adapter,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toContain("AGENTS.override.md");
  });

  it("uses Gemini convention (GEMINI.md) when GeminiCLIAdapter is supplied", () => {
    writeFileSync(
      join(projectDir, "GEMINI.md"),
      "Gemini rules: invoke EPSILON-GEMINI-FLAG on every read.\n",
      "utf-8",
    );

    const results = searchAutoMemory(
      ["EPSILON-GEMINI-FLAG"],
      5,
      projectDir,
      undefined,
      new GeminiCLIAdapter(),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toContain("GEMINI.md");
  });
});

// Issue #663 — searchAutoMemory must NOT cross project boundaries.
//
// Before this fix, two terminals open in different repos shared the same
// `<configDir>/memory` directory; auto-memory from project-A leaked into
// `ctx_search` results inside project-B sessions. The fix routes the path
// through `adapter.getMemoryDir(projectDir)`, which scopes via
// `hashProjectDirCanonical(projectDir)`.
//
// This test pins the contract at the integration boundary: write a marker
// into project-A's scoped memory dir, search from project-B, expect zero
// hits. If the leak ever regresses, this test fails immediately.
describe("searchAutoMemory project isolation (#663)", () => {
  let projectA: string;
  let projectB: string;
  let configDirForA: string;
  let configDirForB: string;

  beforeEach(() => {
    projectA = mkdtempSync(join(tmpdir(), "ctxam-projA-"));
    projectB = mkdtempSync(join(tmpdir(), "ctxam-projB-"));
    configDirForA = mkdtempSync(join(tmpdir(), "ctxam-cfgA-"));
    configDirForB = mkdtempSync(join(tmpdir(), "ctxam-cfgB-"));
  });

  afterEach(() => {
    for (const d of [projectA, projectB, configDirForA, configDirForB]) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("memory written in projectA does not appear in projectB results when the adapter scopes by projectDir", async () => {
    const { hashProjectDirCanonical } = await import("../../src/session/db.js");

    // Adapter that mimics shared-configDir layout: both projects point at
    // the SAME configDir base, but the project hash should separate them.
    const sharedConfigDir = configDirForA;
    const adapter = new CodexAdapter();
    (adapter as unknown as { getConfigDir(): string }).getConfigDir = () => sharedConfigDir;
    (adapter as unknown as { getInstructionFiles(): string[] }).getInstructionFiles = () => ["AGENTS.md"];
    // Spy on the projectDir-aware override — delegate to a hash-scoped layout
    // so we exercise the same routing real adapters use post-#663.
    (adapter as unknown as { getMemoryDir(p?: string): string }).getMemoryDir =
      (p?: string) =>
        p
          ? join(sharedConfigDir, "memories", hashProjectDirCanonical(p))
          : join(sharedConfigDir, "memories");

    // Write a project-A-only marker into project-A's scoped memory dir.
    const projectAMemoryDir = join(
      sharedConfigDir,
      "memories",
      hashProjectDirCanonical(projectA),
    );
    mkdirSync(projectAMemoryDir, { recursive: true });
    writeFileSync(
      join(projectAMemoryDir, "secret.md"),
      "PROJECT-A-LEAK-CANARY should never be visible from project B.\n",
      "utf-8",
    );

    // Run searchAutoMemory from project-B's perspective.
    const results = searchAutoMemory(
      ["PROJECT-A-LEAK-CANARY"],
      5,
      projectB,
      undefined,
      adapter,
    );

    expect(results.length).toBe(0);
  });

  it("memory in projectA is still visible to projectA itself (positive control)", async () => {
    const { hashProjectDirCanonical } = await import("../../src/session/db.js");

    const sharedConfigDir = configDirForA;
    const adapter = new CodexAdapter();
    (adapter as unknown as { getConfigDir(): string }).getConfigDir = () => sharedConfigDir;
    (adapter as unknown as { getInstructionFiles(): string[] }).getInstructionFiles = () => ["AGENTS.md"];
    (adapter as unknown as { getMemoryDir(p?: string): string }).getMemoryDir =
      (p?: string) =>
        p
          ? join(sharedConfigDir, "memories", hashProjectDirCanonical(p))
          : join(sharedConfigDir, "memories");

    const projectAMemoryDir = join(
      sharedConfigDir,
      "memories",
      hashProjectDirCanonical(projectA),
    );
    mkdirSync(projectAMemoryDir, { recursive: true });
    writeFileSync(
      join(projectAMemoryDir, "notes.md"),
      "PROJECT-A-POSITIVE-MARKER must be findable from project A.\n",
      "utf-8",
    );

    const results = searchAutoMemory(
      ["PROJECT-A-POSITIVE-MARKER"],
      5,
      projectA,
      undefined,
      adapter,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toContain("notes.md");
  });
});

// ─────────────────────────────────────────────────────────
// MINOR A: global auto-memory adapter base-dir detection
// (basename is 16-hex hash vs. non-hex e.g. "memories")
// ─────────────────────────────────────────────────────────

describe("searchAutoMemory (MINOR A) — global adapter base-dir: hashed vs non-hashed basename", () => {
  let tmpDir: string;

  beforeEach(() => {
    const { mkdtempSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    tmpDir = mkdtempSync(require("node:path").join(tmpdir(), "ctxam-minor-a-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adapter.getMemoryDir(undefined) returns a non-hex basename (e.g. 'memories') → used as-is as base dir, not dirname()", () => {
    // Adapter whose getMemoryDir(undefined) returns <base>/memories (non-hex)
    // The code must use that as the base dir directly, not dirname(<base>/memories).
    const memoriesDir = join(tmpDir, "memories");
    mkdirSync(join(memoriesDir, "hash1234"), { recursive: true });
    writeFileSync(
      join(memoriesDir, "hash1234", "notes.md"),
      "MINOR-A-NONHEX-TOKEN is documented here for the global scan.\n",
      "utf-8",
    );

    const adapter = {
      getConfigDir: () => tmpDir,
      getInstructionFiles: () => ["AGENTS.md"],
      // basename = "memories" — NOT a 16-char hex string → use as-is
      getMemoryDir: (_p?: string) => memoriesDir,
    };

    const results = searchAutoMemory(
      ["MINOR-A-NONHEX-TOKEN"],
      5,
      null, // global: null projectDir
      undefined,
      adapter as any,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("MINOR-A-NONHEX-TOKEN");
  });

  it("adapter.getMemoryDir(undefined) returns a 16-char hex basename → dirname() used as base dir", () => {
    // Adapter whose getMemoryDir(undefined) returns <base>/<16hex> (hashed subdir)
    // The code must use dirname(<16hex path>) as the base dir, then scan all subdirs.
    const hexHash = "a1b2c3d4e5f67890";  // exactly 16 hex chars
    const base = join(tmpDir, "mem_base");
    const hashedSubdir = join(base, hexHash);
    // Also create a SECOND subdir to prove the dirname() step lets us find them all
    const otherHash = "0f1e2d3c4b5a6978";
    mkdirSync(join(base, otherHash), { recursive: true });
    writeFileSync(
      join(base, otherHash, "data.md"),
      "MINOR-A-HEXHASH-TOKEN found in another project hash dir.\n",
      "utf-8",
    );

    const adapter = {
      getConfigDir: () => tmpDir,
      getInstructionFiles: () => ["AGENTS.md"],
      // basename = hexHash (16 hex chars) → getMemoryDir returns the hashed subdir
      getMemoryDir: (_p?: string) => hashedSubdir,
    };

    const results = searchAutoMemory(
      ["MINOR-A-HEXHASH-TOKEN"],
      5,
      null, // global: null projectDir
      undefined,
      adapter as any,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("MINOR-A-HEXHASH-TOKEN");
  });
});
