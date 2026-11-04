// e2e/harness/golden.mjs
// impl/14-tests.md §4 steps 5-6: load e2e/golden/GPn/<case>.json; with UPDATE_GOLDEN=1 write the
// normalized value there and pass; else assert.deepStrictEqual. A missing golden file is a FAIL
// that names the file (never a silent pass).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOLDEN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "golden");

/**
 * @param {string} gpId - e.g. "GP7"
 * @param {string} name - case name, file stem under e2e/golden/<gpId>/
 * @param {unknown} normalized - value already passed through normalize()
 */
export function checkGolden(gpId, name, normalized) {
  const file = path.join(GOLDEN_ROOT, gpId, `${name}.json`);
  if (process.env.UPDATE_GOLDEN === "1") {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(normalized, null, 2) + "\n", "utf8");
    return;
  }
  assert.ok(existsSync(file), `golden file missing: e2e/golden/${gpId}/${name}.json (record it with UPDATE_GOLDEN=1)`);
  assert.deepStrictEqual(normalized, JSON.parse(readFileSync(file, "utf8")));
}
