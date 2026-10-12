import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { walkDirectory } from "../src/store-directory.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctx-ignore-")));
  roots.push(root);
  for (const folder of ["docs", "other", "docs/nested"]) mkdirSync(join(root, folder), { recursive: true });
  for (const file of ["docs/private.md", "docs/public.md", "other/private.md", "docs/nested/private.md", "docs/nested/root-ignore.md", "other/root-ignore.md"]) writeFileSync(join(root, file), "content");
  writeFileSync(join(root, ".gitignore"), "root-ignore.md\n");
  writeFileSync(join(root, "docs", ".gitignore"), "private.md\n");
  return root;
}
test("nested gitignore rules apply to their own subtree", () => {
  const root = fixture();
  expect(walkDirectory(root).map(file => relative(root, file).replaceAll("\\", "/")).sort()).toEqual(["docs/public.md", "other/private.md"]);
});
test("root gitignore rules remain inherited by nested directories", () => {
  const root = fixture();
  expect(walkDirectory(root).some(file => file.endsWith("root-ignore.md"))).toBe(false);
});
test("respectGitignore false disables root and nested rules", () => {
  expect(walkDirectory(fixture(), { respectGitignore: false }).length).toBe(6);
});
