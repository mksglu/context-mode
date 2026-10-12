import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { walkDirectory } from "../src/store-directory.js";

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
