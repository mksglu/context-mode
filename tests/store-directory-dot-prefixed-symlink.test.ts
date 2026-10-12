import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { walkDirectory } from "../src/store-directory.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("a contained symlink target beginning with two dots is not a parent-directory escape", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctx-dot-link-")));
  roots.push(root);
  mkdirSync(join(root, "..notes"));
  writeFileSync(join(root, "..notes", "content.md"), "owned content");
  symlinkSync(join(root, "..notes"), join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
  expect(walkDirectory(root, { followSymlinks: true, include: ["alias/*.md"] })).toEqual([join(root, "alias", "content.md")]);
});
test("an actual parent-directory symlink remains rejected", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctx-parent-link-")));
  roots.push(root);
  const project = join(root, "project");
  mkdirSync(project);
  writeFileSync(join(root, "outside.md"), "outside the walk root");
  symlinkSync(root, join(project, "alias"), process.platform === "win32" ? "junction" : "dir");
  expect(walkDirectory(project, { followSymlinks: true, include: ["alias/*.md"] })).toEqual([]);
});
