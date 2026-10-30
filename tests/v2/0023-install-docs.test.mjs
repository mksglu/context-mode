// ADR-0023 / PRD-setup: install docs facts and rules.
// Area: 0023-install-docs (docs/v2/TEST-LAYOUT.md).
// Merged by ADR-0024 from 8 files (see docs/v2/TEST-LAYOUT.md). One describe block per old file; test names are unchanged.
// Every block only reads files, so all run concurrently.

import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SWITCH_HEADING, checkLines, checkNativePages, checkNoV1, checkPages, checkReleaseRef, checkSimpleLines, checkSimplePages, docFiles, fencedBlocks, installSection, switchSection, v1FreeFiles } from "../../build/check-install-docs.mjs";
import { getAdapter } from "../../src/adapters/table.ts";

describe("ADR-0023 install pages: lines and pages", { concurrency: CONC }, () => {
  // build/check-install-docs.mjs: docs/install/*.md fenced blocks must run as copied (owner rule 2026-10-21).

  const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "install");

  test("install-docs: a bad sample fails on every rule", () => {
    const bad = ["```json", '{"args":["/Users/you/.context-mode-app/server.mjs"]}', "npx -y context-mode", "node <path>/server.mjs",
      "node /opt/.context-mode-app/server.mjs", "C:\\Users\\you\\x", "```", "/Users/you outside a fence"].join("\n");
    const out = checkLines("a.md", bad).join("\n");
    for (const s of ["a.md:2 user path", "a.md:3 npx context-mode", "a.md:4 placeholder", "a.md:5 .context-mode-app path", "a.md:6 user path"]) assert.ok(out.includes(s), s);
    assert.ok(!out.includes("a.md:8"), "text outside a fence is not checked");
  });

  test("install-docs: more user paths and placeholders fail", () => {
    const bad = ["```sh", "ls /home/you/.context-mode-app", '"Users\\\\you\\\\x"', "node <...>/server.mjs", "npx context-mode", "```"].join("\n");
    const out = checkLines("c.md", bad).join("\n");
    for (const s of ["c.md:2 user path", "c.md:3 user path", "c.md:4 placeholder", "c.md:5 npx context-mode"]) assert.ok(out.includes(s), s);
  });

  test("install-docs: config blocks need an agent variable, not $HOME or ~", () => {
    const cfg = ["```json", '{"command":["node","~/.context-mode-app/server.mjs"]}', '{"args":["$HOME/.context-mode-app/server.mjs"]}',
      '{"command":["node","{env:HOME}/.context-mode-app/server.mjs"]}', '{"args":["${extensionPath}${/}.context-mode-app"]}', "```"].join("\n");
    const out = checkLines("d.md", cfg);
    assert.equal(out.length, 2, out.join("\n"));
    assert.ok(out[0].startsWith("d.md:2 ") && out[1].startsWith("d.md:3 "));
  });

  test("install-docs: allowed path forms pass", () => {
    const ok = ["```sh", "git clone x ~/.context-mode-app", 'node "$HOME/.context-mode-app/server.mjs"',
      '"{env:HOME}/.context-mode-app/server.mjs"', 'a=p.join(h,".context-mode-app")', "```",
      "```powershell", 'git -C "$env:USERPROFILE\\.context-mode-app" pull', "```"].join("\n");
    assert.deepEqual(checkLines("b.md", ok), []);
  });

  test("install-docs: forms that do not expand as copied fail", () => {
    const bad = ["```sh", 'node "~/.context-mode-app/server.mjs"', 'git clone x "$env:USERPROFILE\\.context-mode-app"', "# change this part to your path", "```",
      "```powershell", "git clone x ~/.context-mode-app", 'node "%USERPROFILE%\\.context-mode-app\\server.mjs"', "```"].join("\n");
    const out = checkLines("e.md", bad).join("\n");
    for (const s of ["e.md:2 quoted ~", "e.md:3 Windows variable", "e.md:4 edit step", "e.md:7 ~ does not expand", "e.md:8 %USERPROFILE%"]) assert.ok(out.includes(s), s);
  });

  test("install-docs: the real docs pass", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
    assert.ok(files.length >= 11);
    assert.deepEqual(files.flatMap((f) => checkLines(f, readFileSync(path.join(DIR, f), "utf8"))), []);
  });

  test("install-docs: npm install of context-mode needs a version tag", () => {
    const bad = checkLines("n.md", ["```sh", "npm i -g context-mode", "npm install -g context-mode && context-mode setup", "```"].join("\n")).join("\n");
    assert.ok(bad.includes("n.md:2 npm install") && bad.includes("n.md:3 npm install"), bad);
    assert.deepEqual(checkLines("n.md", ["```sh", "npm i -g context-mode@next && context-mode setup", "npm uninstall -g context-mode", "```"].join("\n")), []);
  });

  test("install-docs: the root README fences pass", () => {
    assert.deepEqual(checkLines("README.md", readFileSync(path.join(DIR, "..", "..", "README.md"), "utf8")), []);
  });

  // D-INST-4: npm route rules. A fenced `context-mode setup|doctor|upgrade` line may only use flags the CLI has.
  test("install-docs: a fenced context-mode command with an unknown flag fails", () => {
    const bad = checkLines("f.md", ["```sh", "context-mode setup --yes --agents codex", "context-mode setup --everything", "context-mode doctor --fix-all", "```"].join("\n")).join("\n");
    assert.ok(!bad.includes("f.md:2"), bad);
    assert.ok(bad.includes("f.md:3 unknown flag --everything") && bad.includes("f.md:4 unknown flag --fix-all"), bad);
    assert.deepEqual(checkLines("f.md", ["```sh", "context-mode setup --remove && npm rm -g context-mode", "context-mode upgrade --tag next --dry-run", "```"].join("\n")), []);
  });

  test("install-docs: page rules for the install page and the agent pages", () => {
    const good = "Node 24.15.0\n```sh\nnpm i -g context-mode@next && context-mode setup\ncontext-mode setup --remove && npm rm -g context-mode\n```\n";
    assert.deepEqual(checkPages({ "README.md": good, "codex.md": "run context-mode setup\n" }), []);
    const out = checkPages({ "README.md": "nothing", "codex.md": "## Install\n" }).join("\n");
    for (const s of ["README.md needs Node 24.15.0", "README.md needs the two-command install", "README.md needs the uninstall command", "codex.md needs context-mode setup"]) assert.ok(out.includes(s), s + "\n" + out);
  });

  test("install-docs: the real pages pass the page rules", () => {
    const pages = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => [f, readFileSync(path.join(DIR, f), "utf8")]));
    assert.deepEqual(checkPages(pages), []);
  });
});

describe("ADR-0023 native install commands per host", { concurrency: CONC }, () => {
  // ADR-0023: every install page opens with the host's own native install command, then the native update command,
  // then "Check: `context-mode doctor`". Hosts with no native step shipped yet open with the npm fallback.

  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
});

describe("ADR-0023 pi and Gemini pages", { concurrency: CONC }, () => {
  // D-FU-RM-DOCS-1: Pi and Gemini install guides must match release 05e97724.

  const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
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
});

describe("ADR-0023 Qwen and Kiro pages", { concurrency: CONC }, () => {
  // D-FU-RM-QWEN-2 and D-FU-RM-KIRO-2: install guide text for Qwen Code and Kiro must match the release build.

  const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
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
});

describe("ADR-0023 simple wording", { concurrency: CONC }, () => {
  // build/check-install-docs.mjs simple rules (owner 2026-10-25): users never type paths, JSON or scripts.
  // A docs code block must not hold `node -e`, `npm root -g`, `$(...)` or a path under a home dir; a shell line is
  // at most 100 chars; every install page names the two-command path or `context-mode setup --agents`.

  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const DIR = path.join(REPO, "docs", "install");

  test("install-docs-simple: scripts, npm root -g, $(...) and home paths in a code block fail", () => {
    const bad = ["```sh", "node -e 'require(\"fs\")'", 'claude mcp add x -- node "$(npm root -g)/context-mode/server.mjs"',
      "ls $(pwd)", "cat ~/.vscode/mcp.json", 'node "$HOME/.context-mode-app/server.mjs"', "type %USERPROFILE%\\x", "```",
      "```json", '{"command":"/Users/me/.nvm/bin/node"}', '{"args":["{env:HOME}/x"]}', "```",
      "```powershell", 'node "$env:USERPROFILE\\x"', "```", "outside a fence: node -e 1 and ~/.codex"].join("\n");
    const out = checkSimpleLines("s.md", bad).join("\n");
    for (const s of ["s.md:2 node -e", "s.md:3 npm root -g", "s.md:3 $(...)", "s.md:4 $(...)", "s.md:5 home path", "s.md:6 home path",
      "s.md:7 home path", "s.md:10 home path", "s.md:11 home path", "s.md:14 home path"]) assert.ok(out.includes(s), s + "\n" + out);
    assert.ok(!out.includes("s.md:16"), "text outside a fence is not checked");
  });

  test("install-docs-simple: a shell line over 100 chars fails; 100 passes", () => {
    const long = "context-mode setup --agents " + "x".repeat(73); // 101
    const ok = "context-mode setup --agents " + "x".repeat(72); // 100
    const out = checkSimpleLines("l.md", ["```sh", long, ok, "```", "```powershell", long, "```", "```", long, "```"].join("\n")).join("\n");
    assert.ok(out.includes("l.md:2 line over 100 chars"), out);
    assert.ok(!out.includes("l.md:3"), out);
    assert.ok(out.includes("l.md:6 line over 100 chars") && out.includes("l.md:9 line over 100 chars"), out);
  });

  test("install-docs-simple: the simple forms pass", () => {
    const ok = ["```sh", "npm i -g context-mode@next", "context-mode setup", "context-mode setup --agents codex",
      "context-mode setup --print codex", "claude plugin marketplace add mksglu/context-mode", "context-mode doctor", "```"].join("\n");
    assert.deepEqual(checkSimpleLines("ok.md", ok), []);
  });

  test("install-docs-simple: every page has the two-command path or setup --agents", () => {
    const two = "```sh\nnpm i -g context-mode@next\ncontext-mode setup\n```\n";
    // A full agent page (the next test covers --print and --remove); this test is about the install command only.
    const full = "```sh\ncontext-mode setup --agents codex\n```\ncontext-mode setup --print codex\ncontext-mode setup --remove --agents codex\n";
    assert.deepEqual(checkSimplePages({ "README.md": two, "codex.md": full }), []);
    const out = checkSimplePages({ "README.md": "```sh\nnpm i -g context-mode@next\n```\n", "codex.md": "run context-mode setup\n" }).join("\n");
    assert.ok(out.includes("README.md needs the two-command path"), out);
    assert.ok(out.includes("codex.md needs the two-command path or context-mode setup --agents"), out);
  });

  test("install-docs-simple: every agent page names setup --print and setup --remove --agents for its id", () => {
    const page = "```sh\ncontext-mode setup --agents codex\n```\nRun context-mode setup --print codex.\n```sh\ncontext-mode setup --remove --agents codex\n```\n";
    assert.deepEqual(checkSimplePages({ "codex.md": page }), []);
    const out = checkSimplePages({ "codex.md": "```sh\ncontext-mode setup --agents codex\n```\n" }).join("\n");
    assert.ok(out.includes("codex.md needs context-mode setup --print codex"), out);
    assert.ok(out.includes("codex.md needs context-mode setup --remove --agents codex"), out);
  });

  test("install-docs-simple: the real docs pass (install pages, README, top-level docs, CONTRIBUTING)", () => {
    const files = docFiles(REPO);
    assert.ok(files.length >= 13, files.join(","));
    const bad = files.flatMap((f) => checkSimpleLines(path.relative(REPO, f), readFileSync(f, "utf8")));
    assert.deepEqual(bad, []);
    const pages = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => [f, readFileSync(path.join(DIR, f), "utf8")]));
    pages["README.md"] = readFileSync(path.join(REPO, "README.md"), "utf8");
    assert.deepEqual(checkSimplePages(pages), []);
  });

  // New-user test round 2 (D-INST-7): a script or CI run has no TTY, so setup exits 2 unless --yes is given.
  test("install-docs-simple: every agent page says --yes for a run with no terminal, before 'What setup changes'", () => {
    const ids = readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.replace(/\.md$/, ""));
    assert.ok(ids.length >= 10, ids.join(","));
    for (const id of ids) {
      const text = readFileSync(path.join(DIR, `${id}.md`), "utf8");
      const install = text.slice(0, text.indexOf("## What setup changes"));
      assert.ok(/no terminal/i.test(install) && install.includes("`--yes`"), `${id}.md: Install section must say --yes for a run with no terminal`);
    }
    const readme = readFileSync(path.join(DIR, "README.md"), "utf8");
    assert.ok(/no terminal/i.test(readme.slice(0, readme.indexOf("## What setup does"))), "README.md Install section must say --yes for a run with no terminal");
  });

  test("install-docs-simple: the codex page explains the Auth 'Unsupported' column of codex mcp list", () => {
    const text = readFileSync(path.join(DIR, "codex.md"), "utf8");
    assert.ok(/Unsupported/.test(text.slice(text.indexOf("## Verify"), text.indexOf("## Remove"))));
  });
});

describe("ADR-0023 source install", { concurrency: CONC }, () => {
  // New-user finding (2026-10-25): `npm pack` at the repo root gives a package with no bin, so `context-mode` is missing.
  // The repo root is the dev package. The user package is the release tree from build/build.mjs. The docs must say so.

  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (...p) => readFileSync(path.join(REPO, ...p), "utf8");

  test("install-docs-source: the install README has a From source section with the build and the local install", () => {
    const text = read("docs", "install", "README.md");
    assert.match(text, /^## From source$/m);
    const section = text.split(/^## From source$/m)[1].split(/^## /m)[0];
    assert.ok(section.includes("node build/build.mjs --out release-out"), section);
    assert.ok(section.includes("npm i -g ./release-out"), section);
    assert.ok(section.includes("context-mode --version"), section);
    assert.match(section, /repo root[^\n]*no `?bin`?|no `?bin`?[^\n]*repo root/i, "must say the repo root has no bin");
  });

  test("install-docs-source: a missing command has a Troubleshooting step", () => {
    const text = read("docs", "install", "README.md");
    const t = text.split(/^## Troubleshooting$/m)[1].split(/^## /m)[0];
    assert.ok(t.includes("command not found"), t);
    assert.ok(t.includes("npm prefix -g"), t);
  });

  test("install-docs-source: package.json has a build:release script for the user package", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.scripts["build:release"], "node build/build.mjs --out release-out");
  });
});

describe("ADR-0023 no v1 text in docs", { concurrency: CONC }, () => {
  // D-V1OUT-1 (owner 2026-10-25): users see one product. The word "v1" must not appear in README.md, docs/install/**,
  // src/prompt/**, issue templates or CLI help/output. docs/benchmarks/** and docs/v2/** are exempt.

  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

  test("v1-out: the word v1 fails in any case; v10, ev1 and @1 pass", () => {
    const out = checkNoV1("a.md", ["fine", "from v1 to new", "V1 leftovers", "rollback-to-v1", "v10 ev1 context-mode@1"].join("\n")).join("\n");
    for (const s of ["a.md:2", "a.md:3", "a.md:4"]) assert.ok(out.includes(s), s + "\n" + out);
    assert.ok(!out.includes("a.md:1") && !out.includes("a.md:5"), out);
  });

  test("v1-out: the file list covers README, install docs, prompts and issue templates, not benchmarks or docs/v2", () => {
    const files = v1FreeFiles(REPO).map((f) => path.relative(REPO, f).split(path.sep).join("/"));
    for (const must of ["README.md", "docs/install/README.md", "docs/install/codex.md", "src/prompt/instructions.md", ".github/ISSUE_TEMPLATE/bug.yml", "e2e/golden/cli/help-main.txt"]) assert.ok(files.includes(must), must);
    assert.ok(files.every((f) => !f.startsWith("docs/benchmarks/") && !f.startsWith("docs/v2/")), files.join(","));
  });

  test("v1-out: the real user-facing files have no v1 mention", () => {
    const bad = v1FreeFiles(REPO).flatMap((f) => checkNoV1(path.relative(REPO, f), readFileSync(f, "utf8")));
    assert.deepEqual(bad, []);
  });
});

describe("ADR-0023 VS Code hooks limits", { concurrency: CONC }, () => {
  // tests/v2/repo/install-docs-vscode-hooks.test.mjs
  // D-NI-VSCODE-DOC-1: setup writes the VS Code hooks to ~/.copilot/hooks/context-mode-vscode.json (src/adapters/table.ts
  // hookChannel home-file, src/setup/hook-shapes.ts flatShape with "timeout"). The Known limits line said the opposite.


  const REPO = path.join(import.meta.dirname, "..", "..");
  const doc = readFileSync(path.join(REPO, "docs", "install", "vscode.md"), "utf8");
  const limits = doc.split("## Known limits")[1]?.split("\n## ")[0] ?? "";

  test("[D-NI-VSCODE-DOC-1] vscode.md does not say setup writes no hook file", () => {
    assert.ok(!doc.includes("Setup writes no hook file"), "stale line still in docs/install/vscode.md");
  });

  test("[D-NI-VSCODE-DOC-1] vscode.md Known limits names the hook file setup writes and its shape", () => {
    const ch = getAdapter("vscode").hookChannel;
    assert.equal(ch.kind, "home-file");
    const file = "~/" + ch.path;
    assert.ok(limits.includes(file), `Known limits must name ${file}`);
    for (const w of ["`version: 1`", "`type: \"command\"`", "`timeout`", "--agent vscode"]) assert.ok(limits.includes(w), `Known limits must name ${w}`);
  });
});
