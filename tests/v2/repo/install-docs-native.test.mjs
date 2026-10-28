// ADR-0023: every install page opens with the host's own native install command, then the native update command,
// then "Check: `context-mode doctor`". Hosts with no native step shipped yet open with the npm fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkNativePages, checkReleaseRef, docFiles, installSection, fencedBlocks, switchSection, SWITCH_HEADING } from "../../../build/check-install-docs.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...p) => readFileSync(path.join(REPO, ...p), "utf8");

const NPM = ["npm i -g context-mode@next", "context-mode setup --agents"];
// id -> [install block lines, update block lines]
const NATIVE = {
  "claude-code": [["claude plugin marketplace add mksglu/context-mode#release", "claude plugin install context-mode@context-mode"], ["claude plugin update context-mode@context-mode"]],
  codex: [["codex plugin marketplace add mksglu/context-mode@release", "codex plugin add context-mode@context-mode"], ["codex plugin marketplace upgrade context-mode"]],
  gemini: [["gemini extensions install https://github.com/mksglu/context-mode --ref release"], ["gemini extensions update context-mode"]],
  qwen: [["qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release"], ["qwen extensions update context-mode"]],
  pi: [["pi install npm:context-mode@next"], ["pi update --extensions"]],
  opencode: [["opencode plugin context-mode@next --global"], ["opencode plugin context-mode@next --global --force"]],
};
const FALLBACK = ["copilot-cli", "vscode", "kiro", "zcode"];

test("install-native: each native page opens with the host's own command, then the update command", () => {
  for (const [id, [install, update]] of Object.entries(NATIVE)) {
    const blocks = fencedBlocks(installSection(read("docs", "install", `${id}.md`)));
    assert.deepEqual(blocks[0], install, `${id}.md first block`);
    assert.deepEqual(blocks[1], update, `${id}.md second block`);
  }
});

test("install-native: a host with no native step opens with the npm fallback and updates with context-mode upgrade", () => {
  for (const id of FALLBACK) {
    const blocks = fencedBlocks(installSection(read("docs", "install", `${id}.md`)));
    assert.deepEqual(blocks[0], ["npm i -g context-mode@next", `context-mode setup --agents ${id}`], `${id}.md first block`);
    assert.deepEqual(blocks[1], ["context-mode upgrade"], `${id}.md second block`);
  }
});

test("install-native: every page says check: context-mode doctor and what next is, and has no node -e", () => {
  for (const id of [...Object.keys(NATIVE), ...FALLBACK]) {
    const text = read("docs", "install", `${id}.md`);
    const install = installSection(text);
    assert.ok(install.includes("Check: `context-mode doctor`"), `${id}.md lacks the check line`);
    assert.ok(install.includes("`next` is the v2 prerelease tag"), `${id}.md lacks the next line`);
    assert.ok(!text.includes("node -e"), `${id}.md has node -e`);
  }
});

test("install-native: the real pages pass checkNativePages", () => {
  const pages = Object.fromEntries([...Object.keys(NATIVE), ...FALLBACK].map((id) => [`${id}.md`, read("docs", "install", `${id}.md`)]));
  assert.deepEqual(checkNativePages(pages), []);
});

test("install-native: checkNativePages fails a page that opens with the npm route on a native host, or lacks check, update or next", () => {
  const bad = "# Install context-mode v2 on Codex\n\n## Install\n\n```sh\nnpm i -g context-mode@next\ncontext-mode setup --agents codex\n```\n\n## What setup changes\n";
  const out = checkNativePages({ "codex.md": bad }).join("\n");
  for (const s of ["codex.md first block is the npm route", "codex.md needs an update block", "codex.md needs Check: `context-mode doctor`", "codex.md needs the next-tag line"]) assert.ok(out.includes(s), s + "\n" + out);
  const fb = checkNativePages({ "kiro.md": bad.replace("Codex", "Kiro") }).join("\n");
  assert.ok(!fb.includes("first block is the npm route"), "a fallback host may open with npm: " + fb);
});

test("install-native: both README files list every host with its native install and update command", () => {
  for (const file of [["README.md"], ["docs", "install", "README.md"]]) {
    const text = read(...file);
    for (const [id, [install, update]] of Object.entries(NATIVE)) {
      for (const cmd of [...install, ...update]) assert.ok(text.includes(`\`${cmd}\``), `${file.join("/")} lacks ${cmd} (${id})`);
    }
    assert.ok(text.includes("`next` is the v2 prerelease tag"), `${file.join("/")} lacks the next line`);
    assert.ok(text.includes("context-mode doctor"), `${file.join("/")} lacks doctor`);
    assert.ok(!text.includes("node -e"), `${file.join("/")} has node -e`);
  }
});

// ADR-0023 + tickets/release-on-demand-no-release-branch.md: until v2 is on main, main holds the old build (1.0.169), so
// every command a user copies for the 4 GitHub-source hosts names the release ref in the host's own syntax. D-NI-DOCS-REF-2
// (D-NI-DOCS-REF-1 proved the syntax live). Only the "After v2 is on main:" line may hold the command without the ref.
const AFTER = {
  "claude-code": ["`claude plugin marketplace add mksglu/context-mode`", "`claude plugin install context-mode@context-mode`"],
  codex: ["`codex plugin marketplace add mksglu/context-mode`", "`codex plugin add context-mode@context-mode`"],
  gemini: ["`gemini extensions install https://github.com/mksglu/context-mode`"],
  qwen: ["`qwen extensions install https://github.com/mksglu/context-mode:context-mode`"],
};
// The host's own commands to switch from the old release (installed from main) to the release ref.
const SWITCH = {
  "claude-code": ["claude plugin marketplace remove context-mode", "claude plugin marketplace add mksglu/context-mode#release", "claude plugin install context-mode@context-mode"],
  codex: ["codex plugin remove context-mode@context-mode", "codex plugin marketplace remove context-mode", "codex plugin marketplace add mksglu/context-mode@release", "codex plugin add context-mode@context-mode"],
  gemini: ["gemini extensions uninstall context-mode", "gemini extensions install https://github.com/mksglu/context-mode --ref release"],
  qwen: ["qwen extensions uninstall context-mode", "qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release"],
};

test("install-native: each GitHub-source page has one After v2 is on main line, without the ref, with the plain commands", () => {
  for (const [id, cmds] of Object.entries(AFTER)) {
    const install = installSection(read("docs", "install", `${id}.md`));
    const afters = install.split("\n").filter((l) => l.startsWith("After v2 is on main: "));
    assert.equal(afters.length, 1, `${id}.md needs exactly one "After v2 is on main: " line`);
    assert.ok(!afters[0].includes("#release") && !afters[0].includes("@release") && !afters[0].includes("--ref"), `${id}.md after line holds a ref`);
    for (const c of cmds) assert.ok(afters[0].includes(c), `${id}.md after line lacks ${c}`);
    assert.ok(!install.includes("Testing v2 (next):"), `${id}.md still has a separate Testing line; the top block is the test command`);
  }
  for (const file of [["README.md"], ["docs", "install", "README.md"]]) {
    assert.ok(read(...file).split("\n").some((l) => l.startsWith("After v2 is on main: ")), `${file.join("/")} lacks the After line`);
  }
});

test("install-native: no doc names a GitHub-source command without the release ref, except the After line", () => {
  const repo = REPO;
  const pages = Object.fromEntries(docFiles(repo).map((f) => [path.relative(repo, f), readFileSync(f, "utf8")]));
  assert.deepEqual(checkReleaseRef(pages), []);
});

test("install-native: checkReleaseRef fails each host syntax without the ref and passes it with the ref or on the After line", () => {
  const bare = {
    "a.md": "```sh\nclaude plugin marketplace add mksglu/context-mode\n```",
    "b.md": "| Codex | `codex plugin marketplace add mksglu/context-mode`, then `codex plugin add context-mode@context-mode` |",
    "c.md": "```sh\ngemini extensions install https://github.com/mksglu/context-mode\n```",
    "d.md": "```sh\nqwen extensions install https://github.com/mksglu/context-mode:context-mode\n```",
    "e.md": "In Claude Code itself: `/plugin marketplace add mksglu/context-mode`, then `/plugin install context-mode@context-mode`.",
  };
  for (const [name, text] of Object.entries(bare)) assert.equal(checkReleaseRef({ [name]: text }).length, 1, name + " must fail");
  const ok = {
    "a.md": "```sh\nclaude plugin marketplace add mksglu/context-mode#release\n```",
    "b.md": "| Codex | `codex plugin marketplace add mksglu/context-mode@release` |",
    "c.md": "`gemini extensions install https://github.com/mksglu/context-mode --ref release`",
    "d.md": "```sh\nqwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release\n```",
    "e.md": "After v2 is on main: `claude plugin marketplace add mksglu/context-mode`, then `claude plugin install context-mode@context-mode`",
  };
  assert.deepEqual(checkReleaseRef(ok), []);
  assert.equal(checkReleaseRef({ "f.md": "`gemini extensions install https://github.com/mksglu/context-mode`, then `gemini extensions install https://github.com/mksglu/context-mode --ref release`" }).length, 1, "one bare command beside a ref'd one must fail");
});

test("install-native: each GitHub-source page has the switch step with the host's own remove command and the ref'd add", () => {
  for (const [id, lines] of Object.entries(SWITCH)) {
    const text = read("docs", "install", `${id}.md`);
    assert.ok(installSection(text).includes(SWITCH_HEADING), `${id}.md lacks the "${SWITCH_HEADING}" step in its Install section`);
    assert.deepEqual(fencedBlocks(switchSection(text)), [lines], `${id}.md switch block`);
    assert.ok(!text.includes("node -e"), `${id}.md has node -e`);
  }
  for (const file of [["README.md"], ["docs", "install", "README.md"]]) assert.ok(read(...file).includes(SWITCH_HEADING), `${file.join("/")} lacks the switch pointer`);
});

test("install-native: checkReleaseRef fails a page without the switch step", () => {
  const page = "# Install context-mode v2 on Qwen Code\n\n## Install\n\n```sh\nqwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release\n```\n\n## Remove\n";
  const out = checkReleaseRef({ "qwen.md": page }).join("\n");
  assert.ok(out.includes("qwen.md needs the switch step"), out);
});

// Z-WIN-6, D-WIN-ZCODE-HOME-1: ZCode has no Windows page of its own; the install page must say where the files go on Windows.
test("install-native: the zcode page names the Windows config.json and skills paths and the home rule", () => {
  const text = read("docs", "install", "zcode.md");
  assert.ok(text.includes("%USERPROFILE%\\.zcode\\cli\\config.json"), "zcode.md lacks the Windows config.json path");
  assert.ok(text.includes("%USERPROFILE%\\.zcode\\skills"), "zcode.md lacks the Windows skills path");
  assert.ok(/ignores `?HOME`?/.test(text), "zcode.md must say ZCode ignores HOME on Windows");
});
