/**
 * Issue #923 — start.mjs must restore the original CWD before importing the
 * server bundle so tools that resolve a directory from the foreground process
 * cwd (VTE terminals, pane/workspace managers) see the project directory rather
 * than the plugin cache directory.
 *
 * Uses static analysis of start.mjs source — the same pattern as
 * start-mjs-self-heal.test.ts — because spawning the full server under Vitest
 * is complex and out of scope for this single invariant.
 *
 * Contracts pinned here:
 *   1. `originalCwd` is captured before any `chdir`.
 *   2. The restore targets `safeOriginalCwd ?? homedir()`, never raw
 *      `originalCwd` — after a /ctx-upgrade respawn the launch cwd is itself
 *      the plugin install dir, which would reintroduce the bug.
 *   3. The restore is wrapped in try/catch (defensive: avoids crashing on
 *      network FS / cleaned-up temp dirs).
 *   4. The restore happens before the server bundle import.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const src = readFileSync(resolve(ROOT, "start.mjs"), "utf-8");

const RESTORE_RE = /process\.chdir\(safeOriginalCwd \?\? homedir\(\)\)/;

describe("start.mjs — CWD restore for foreground-cwd inheritance (#923)", () => {
  test("captures originalCwd before chdir(__dirname)", () => {
    const captureIdx = src.indexOf("const originalCwd = process.cwd()");
    const chdirIdx = src.indexOf("process.chdir(__dirname)");
    expect(captureIdx).toBeGreaterThan(-1);
    expect(chdirIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeLessThan(chdirIdx);
  });

  test("restores safeOriginalCwd with a homedir() fallback, wrapped in try/catch", () => {
    expect(src).toMatch(
      /try\s*\{\s*process\.chdir\(safeOriginalCwd \?\? homedir\(\)\)/,
    );
  });

  test("never restores raw originalCwd (would reintroduce the plugin-dir cwd)", () => {
    expect(src).not.toMatch(/process\.chdir\(originalCwd\)/);
  });

  test("safeOriginalCwd is computed before the restore", () => {
    const safeIdx = src.indexOf("const safeOriginalCwd =");
    const restoreIdx = src.search(RESTORE_RE);
    expect(safeIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(-1);
    expect(safeIdx).toBeLessThan(restoreIdx);
  });

  test("restore try/catch includes a best-effort comment", () => {
    expect(src).toContain("best effort");
  });

  test("restore happens before server bundle import", () => {
    const restoreIdx = src.search(RESTORE_RE);
    const bundleIdx = src.indexOf('await import("./server.bundle.mjs")');
    expect(restoreIdx).toBeGreaterThan(-1);
    expect(bundleIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeLessThan(bundleIdx);
  });
});
