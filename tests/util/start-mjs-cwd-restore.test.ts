/**
 * Issue #923 — start.mjs must restore the project directory before importing
 * the server bundle, so foreground processes (VTE terminals, pane and
 * workspace managers) that resolve a directory from the parent's cwd see the
 * project rather than the plugin cache.
 *
 * These are static invariants on start.mjs, not behavioural tests: the
 * observable is the cwd of the process the server becomes, which cannot be
 * read portably from a vitest child (macOS needs lsof, Windows needs a
 * different mechanism entirely). Asserting on the source is weaker than
 * running the server, and these three are the ones that would actually catch a
 * regression — the upstream version of this file also asserted that a
 * "best effort" comment was present, which no edit to the logic can fail.
 *
 * Known gap: no end-to-end coverage of the restored cwd. The restore is three
 * tokens of logic guarded by try/catch, so the residual risk is low, but it is
 * not zero and it is not covered.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "..", "..", "start.mjs"), "utf-8");

const RESTORE = /process\.chdir\(safeOriginalCwd \?\? homedir\(\)\)/;

describe("start.mjs — CWD restore for foreground-cwd inheritance (#923)", () => {
  test("restores safeOriginalCwd, never raw originalCwd", () => {
    // After a /ctx-upgrade respawn the launch cwd IS the plugin install dir, so
    // restoring originalCwd would reintroduce the very bug being fixed.
    expect(src).toMatch(RESTORE);
    expect(src).not.toMatch(/process\.chdir\(originalCwd\)/);
  });

  test("the restore is wrapped so an unresolvable cwd cannot abort startup", () => {
    expect(src).toMatch(
      /try\s*\{\s*process\.chdir\(safeOriginalCwd \?\? homedir\(\)\)/,
    );
  });

  test("the restore happens before the server bundle is imported", () => {
    const restoreIdx = src.search(RESTORE);
    const bundleIdx = src.indexOf('await import("./server.bundle.mjs")');

    expect(restoreIdx).toBeGreaterThan(-1);
    expect(bundleIdx).toBeGreaterThan(-1);
    // Ordering is the whole fix: an import resolves against import.meta.url,
    // but everything the server reads afterwards resolves against cwd.
    expect(restoreIdx).toBeLessThan(bundleIdx);
  });
});
