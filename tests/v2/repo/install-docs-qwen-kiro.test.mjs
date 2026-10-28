// D-FU-RM-QWEN-2 and D-FU-RM-KIRO-2: install guide text for Qwen Code and Kiro must match the release build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
const INSTALL = "qwen extensions install https://github.com/mksglu/context-mode:context-mode";

test("qwen guide installs with the extension (method 1), which registers the server and the hooks", () => {
  const md = read("docs/install/qwen.md");
  const install = md.split("## Install")[1].split("\n## ")[0];
  assert.ok(install.includes(INSTALL), "Install section lacks the extension install command");
  assert.doesNotMatch(install, /qwen mcp add/, "Install section still uses qwen mcp add");
  assert.doesNotMatch(md, /It does not work yet/, "guide still says the extension install is broken");
  assert.match(md, /qwen extensions uninstall context-mode/);
  assert.match(md, /qwen extensions update context-mode/);
  const readme = read("docs/install/README.md");
  assert.match(readme, /\| Qwen Code \| `qwen extensions install https:\/\/github\.com\/mksglu\/context-mode:context-mode --ref release` \| `qwen extensions update context-mode` \|/, "README row for Qwen Code does not name the extension command");
});

test("kiro guide does not claim the release hook file uses PromptSubmit or that hook.mjs drops UserPromptSubmit", () => {
  const md = read("docs/install/kiro.md");
  assert.doesNotMatch(md, /uses the trigger `PromptSubmit`/);
  assert.doesNotMatch(md, /drops `UserPromptSubmit`/);
  assert.doesNotMatch(md, /\(SessionStart, PromptSubmit\)/);
  assert.doesNotMatch(read("docs/install/README.md"), /must accept the event name `UserPromptSubmit`/);
});
