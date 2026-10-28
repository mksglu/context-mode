// D-FU-RM-DOCS-1: Pi and Gemini install guides must match release 05e97724.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
const section = (md, h) => md.split("## " + h)[1].split("\n## ")[0];

test("gemini guide installs with the extension (method 1)", () => {
  const md = read("docs/install/gemini.md");
  assert.ok(section(md, "Install").includes("gemini extensions install https://github.com/mksglu/context-mode"));
  assert.doesNotMatch(md, /It does not work yet/);
  assert.match(md, /gemini extensions update context-mode/);
  assert.match(md, /gemini extensions uninstall context-mode/);
  assert.match(read("docs/install/README.md"), /\| Gemini CLI \| `gemini extensions install https:\/\/github\.com\/mksglu\/context-mode --ref release` \| `gemini extensions update context-mode` \|/);
});

test("pi guide does not claim a missing package.json or a /ctx-doctor command in Pi", () => {
  const md = read("docs/install/pi.md");
  assert.doesNotMatch(md, /no `package\.json` with a `pi` key/);
  assert.doesNotMatch(md, /run `\/ctx-doctor`/);
  assert.doesNotMatch(md, /run `\/ctx-doctor`, then `\/ctx-upgrade`/);
  assert.doesNotMatch(md, /Pi does not know `\/ctx-doctor`/);
  assert.match(md, /05e97724/);
});

test("no install guide cites the old release commit 0438537 or 87a17f8", () => {
  for (const f of ["README", "pi", "gemini", "qwen", "codex"]) {
    const md = read(`docs/install/${f}.md`);
    assert.doesNotMatch(md, /commit 0438537|commit 87a17f8|commit 0438537; Qwen/, f);
  }
});
