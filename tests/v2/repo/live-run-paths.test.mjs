// D-LEF-2: e2e/live/run.mjs ran on Windows CI and built "D:\D:\a\..." from new URL(import.meta.url).pathname
// ("/D:/a/..."). Every e2e/live entry script takes its own directory from fileURLToPath(import.meta.url).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SRC = readFileSync(path.join(REPO, "e2e", "live", "run.mjs"), "utf8");

test("e2e/live/run.mjs finds its root with fileURLToPath, not URL.pathname (Windows drive paths)", () => {
  assert.equal(SRC.includes("new URL(import.meta.url).pathname"), false, "URL.pathname gives /D:/a/... on Windows");
  assert.ok(SRC.includes("fileURLToPath(import.meta.url)"), "root comes from fileURLToPath(import.meta.url)");
});
