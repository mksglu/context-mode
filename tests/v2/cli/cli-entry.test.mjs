// tests/v2/cli/cli-entry.test.mjs
// D-HNE-CLI-ENTRY-1: import.meta.main exists from Node 24.2. On Node 22 (Copilot CLI's own minimum) it is undefined, so
// cli.mjs ran nothing: `context-mode --version`, `setup`, `doctor` and the v1 `hook <platform> <event>` form exited 0
// with no output. isEntry decides "am I the process entry" without import.meta.main when it is missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { isEntry } from "../../../src/entries/is-entry.ts";

test("[D-HNE-CLI-ENTRY-1] cli/isEntry trusts import.meta.main when the Node has it", () => {
  assert.equal(isEntry(true, undefined, "/x/cli.mjs"), true);
  assert.equal(isEntry(false, "/x/cli.mjs", "/x/cli.mjs"), false);
});

test("[D-HNE-CLI-ENTRY-1] cli/isEntry on Node 22 (import.meta.main undefined) compares argv[1] with this file", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-cli-entry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const self = path.join(dir, "cli.mjs");
  const other = path.join(dir, "other.mjs");
  const link = path.join(dir, "context-mode");
  writeFileSync(self, "");
  writeFileSync(other, "");
  symlinkSync(self, link); // the npm bin link
  assert.equal(isEntry(undefined, self, self), true);
  assert.equal(isEntry(undefined, link, self), true);
  assert.equal(isEntry(undefined, other, self), false);
  assert.equal(isEntry(undefined, undefined, self), false);
  assert.equal(isEntry(undefined, path.join(dir, "gone.mjs"), self), false);
});
