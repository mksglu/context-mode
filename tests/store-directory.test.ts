/**
 * walkDirectory — bounded recursive walker for ctx_index directory support.
 *
 * Issue #687: ctx_index refused directory paths via the security gate at
 * src/store.ts:845 (TOCTOU defense from #442 round-3). The gate stays correct;
 * directory support is layered as a separate concern via walkDirectory + a per-file
 * read through the existing `ContentStore.index({ path })` path so the per-file
 * `openSync + fstatSync.isFile()` invariant is preserved.
 *
 * Reported by @matiasduartee across 4 clients × Windows 11.
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join, sep, relative } from "node:path";
import { tmpdir } from "node:os";

import { walkDirectory } from "../src/store-directory.js";

describe("walkDirectory — symlink cycle detection (#687)", () => {
  let rootDir: string;

  beforeAll(() => {
    rootDir = mkdtempSync(join(tmpdir(), "ctx-walk-cycle-"));
    // a -> b, b -> a — classic cycle hazard.
    mkdirSync(join(rootDir, "a"));
    mkdirSync(join(rootDir, "b"));
    writeFileSync(join(rootDir, "a", "real.md"), "# real a\n");
    writeFileSync(join(rootDir, "b", "real.md"), "# real b\n");
    try {
      symlinkSync(join(rootDir, "b"), join(rootDir, "a", "link-to-b"), "dir");
      symlinkSync(join(rootDir, "a"), join(rootDir, "b", "link-to-a"), "dir");
    } catch {
      // Windows symlink may require admin; test will degrade to no-cycle case.
    }
  });

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("does not infinite-loop on symlink cycle (followSymlinks: true)", () => {
    // With followSymlinks: true and cycle present, naive walk would never return.
    // walkDirectory must terminate by tracking resolved paths.
    const files = walkDirectory(rootDir, {
      followSymlinks: true,
      maxDepth: 10,
      maxFiles: 100,
      extensions: [".md"],
    });
    expect(Array.isArray(files)).toBe(true);
    // Two real .md files; cycle traversal must not duplicate them indefinitely.
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.length).toBeLessThan(50);
  });

  test("defaults to followSymlinks: false — does not descend into symlinked dirs", () => {
    const files = walkDirectory(rootDir, {
      maxDepth: 10,
      maxFiles: 100,
      extensions: [".md"],
    });
    // Only the two non-symlinked real.md files.
    expect(files.length).toBe(2);
  });
});

describe("walkDirectory — symlink escape rejection (#687)", () => {
  let rootDir: string;
  let outsideDir: string;

  beforeAll(() => {
    const base = mkdtempSync(join(tmpdir(), "ctx-walk-escape-"));
    rootDir = join(base, "project");
    outsideDir = join(base, "outside");
    mkdirSync(rootDir);
    mkdirSync(outsideDir);
    writeFileSync(join(rootDir, "inside.md"), "# inside\n");
    writeFileSync(join(outsideDir, "secret.md"), "# secret\n");
    try {
      symlinkSync(outsideDir, join(rootDir, "escape"), "dir");
    } catch {
      // Windows admin requirement — test degrades gracefully.
    }
  });

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  test("followSymlinks: true does not escape rootPath", () => {
    const files = walkDirectory(rootDir, {
      followSymlinks: true,
      maxDepth: 10,
      maxFiles: 100,
      extensions: [".md"],
    });
    // Walker must refuse to follow symlinks that resolve outside rootPath.
    for (const f of files) {
      assert.ok(
        !f.includes("outside") || f.startsWith(rootDir),
        `walker leaked outside rootPath: ${f}`,
      );
    }
    // inside.md must always be present.
    expect(files.some(f => f.endsWith("inside.md"))).toBe(true);
  });
});

describe("walkDirectory — cross-OS path separators (#687)", () => {
  let rootDir: string;

  beforeAll(() => {
    rootDir = mkdtempSync(join(tmpdir(), "ctx-walk-sep-"));
    mkdirSync(join(rootDir, "nested", "deep"), { recursive: true });
    writeFileSync(join(rootDir, "top.md"), "# top\n");
    writeFileSync(join(rootDir, "nested", "deep", "leaf.md"), "# leaf\n");
  });

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("returned paths use platform sep and are absolute", () => {
    // Use the realpath of rootDir because walkDirectory normalizes via realpath
    // (macOS /var → /private/var, Windows 8.3 short names → long names) so the
    // walker output is consistent regardless of how the caller supplied the path.
    const realRoot = realpathSync(rootDir);
    const files = walkDirectory(rootDir, {
      maxDepth: 5,
      maxFiles: 50,
      extensions: [".md"],
    });
    expect(files.length).toBe(2);
    for (const f of files) {
      // All returned paths must be absolute and start with the realpath of root.
      expect(f.startsWith(realRoot)).toBe(true);
      // Must use the platform separator.
      expect(f.includes(sep)).toBe(true);
    }
  });
});

describe("walkDirectory globstar boundaries", () => {
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctx-globstar-")));
  roots.push(root);
  for (const file of ["docs/top.md", "docs/nested/deep.md", "docs/nested/deeper/leaf.md", "other.md"]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "content");
  }
  return root;
}
test("globstar between path segments matches zero or more directories", () => {
  const root = fixture();
  const files = walkDirectory(root, { include: ["docs/**/*.md"] });
  expect(files.map(file => relative(root, file).replaceAll("\\", "/")).sort()).toEqual([
    "docs/nested/deep.md", "docs/nested/deeper/leaf.md", "docs/top.md",
  ]);
});
test("globstar exclusions include the directly nested file", () => {
  const root = fixture();
  const files = walkDirectory(root, { exclude: ["docs/**/*.md"] });
  expect(files.map(file => relative(root, file))).toEqual(["other.md"]);
});
test("single-star filters still stay within one directory", () => {
  const root = fixture();
  expect(walkDirectory(root, { include: ["docs/*.md"] }).map(file => relative(root, file).replaceAll("\\", "/"))).toEqual(["docs/top.md"]);
});
test("literal metacharacters and question marks keep their glob meanings", () => {
  const root = fixture();
  writeFileSync(join(root, "docs", "[notes].md"), "content");
  expect(walkDirectory(root, { include: ["docs/[notes].md"] }).length).toBe(1);
  expect(walkDirectory(root, { include: ["docs/to?.md"] }).length).toBe(1);
  expect(walkDirectory(root, { include: ["docs/???.md"] }).length).toBe(1);
});
test("terminal globstar still crosses directory separators", () => {
  const root = fixture();
  expect(walkDirectory(root, { include: ["docs/**"] }).length).toBe(3);
});
test("question marks preserve UTF-16 code-unit matching for supplementary filenames", () => {
  const root = fixture();
  writeFileSync(join(root, "docs", "😀.md"), "content");
  expect(walkDirectory(root, { include: ["docs/?.md"] }).length).toBe(0);
  expect(walkDirectory(root, { include: ["docs/??.md"] }).length).toBe(1);
});

});
