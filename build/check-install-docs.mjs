#!/usr/bin/env node
// build/check-install-docs.mjs — every command and config line in a fenced block of docs/install/*.md must run as copied (owner rule 2026-10-21).
// A fenced line fails on: a user path (/Users/you, /home/you, C:\Users\you, Users\\you), a <placeholder>,
// `npx context-mode` (v2 has no npm; ADR-0011/0013), or a path to .context-mode-app that does not start with
// $HOME, ~, %USERPROFILE%, $env:USERPROFILE or an agent variable ({env:HOME}, ${extensionPath}, ${CLAUDE_PLUGIN_ROOT}).
// A quoted bare ".context-mode-app" segment is allowed: the node one-liners join it to os.homedir().
// In a config fence (json, jsonc, toml, yaml) no shell runs, so $HOME, ~ and %USERPROFILE% do not expand there:
// only an agent variable ({env:HOME}, ${extensionPath}, ${CLAUDE_PLUGIN_ROOT}) passes.
// Shell fences also fail on forms that do not expand as copied: a quoted "~/..." in sh (the shell keeps the ~),
// $env:USERPROFILE in sh, and ~ or %USERPROFILE% in powershell (Windows PowerShell 5.1 passes them to git/node as is).
// A fenced `npm i -g context-mode` without a version tag fails (@next = v2 preview, @1 = v1): latest is v1 until the owner moves it (ADR-0019 D2). The default run also checks README.md.
// Any fenced line with "change this", "your path" or "edit this" fails: the reader must not edit a block.
// D-INST-4 (npm route): a fenced `context-mode setup|doctor|upgrade` line may use only flags that command has (checkLines);
// checkPages: README.md names Node 24.15.0, the two-command install and the uninstall command; each agent page names `context-mode setup` (no upgrade section: D-V1OUT-1).
// D-V1OUT-1 (owner 2026-10-25): the word "v1" must not appear in README.md, CONTRIBUTING.md, docs/*.md, docs/install/**, skills/**,
// src/prompt/**, e2e/golden/cli/** (CLI help goldens) or .github/ISSUE_TEMPLATE/** (checkNoV1, v1FreeFiles). docs/benchmarks/** and docs/v2/** are exempt. CLI help and output
// are checked by tests/v2/repo/install-docs-v1out.test.mjs, which runs the CLI.
// Simple rules (owner 2026-10-25: users never type paths, JSON or scripts), checkSimpleLines over docFiles: a fenced line
// must not hold `node -e`, `npm root -g`, `$(...)` or a path under a home dir (~/, $HOME, %USERPROFILE%, $env:USERPROFILE,
// {env:HOME}, /Users/, /home/, C:\Users); a line in a shell or unlabelled fence is at most 100 chars. checkSimplePages: a
// README names `npm i -g context-mode@next` and `context-mode setup` as two fenced lines; an agent page <id>.md names
// `context-mode setup --agents <id>` (or the two lines), `context-mode setup --print <id>` and `context-mode setup --remove --agents <id>`.
// Usage: node build/check-install-docs.mjs [dir]   (default: docs/install). Prints "PASS|FAIL install-docs <n> files"; exit 1 on FAIL.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "docs", "install");
const USER_PATH = /\/Users\/you\b|\/home\/you\b|C:\\+Users\\+you\b|Users\\\\you\b/i;
const APP = /\.context-mode-app/g;
// Allowed text right before ".context-mode-app".
const OK_BEFORE = [
  /(\$HOME|\$\{HOME\}|~|%USERPROFILE%|\$env:USERPROFILE|\{env:HOME\}|\{env:USERPROFILE\}|\$\{extensionPath\}|\$\{CLAUDE_PLUGIN_ROOT\})(\\|\/|\$\{\/\})$/,
  /["'`]$/, // quoted bare segment: p.join(os.homedir(), ".context-mode-app")
];
const AGENT_VAR_BEFORE = /(\{env:HOME\}|\{env:USERPROFILE\}|\$\{extensionPath\}|\$\{CLAUDE_PLUGIN_ROOT\})(\\|\/|\$\{\/\})$/;
const CONFIG_LANG = /^(json|jsonc|json5|toml|ya?ml)$/i;
const SH_LANG = /^(sh|bash|zsh|shell|console)$/i;
const PS_LANG = /^(powershell|pwsh|ps1)$/i;
const EDIT_HINT = /change this|edit this|your (own )?path|replace (this|with your)/i;

const CLI_FLAGS = new Set(["--list", "--dry-run", "--remove", "--repair", "--agents", "--yes", "-y", "--no-input", "--json", "-q", "--quiet",
  "--verbose", "--debug", "--no-color", "-h", "--help", "--tag", "--print"]); // setup, doctor and upgrade --help
const CLI_CMD = /(?:^|[&|;]\s*|^\s*)context-mode\s+(setup|doctor|upgrade)\b([^&|;\n]*)/g;

export function checkPages(pages) {
  const bad = [];
  for (const [name, text] of Object.entries(pages)) {
    if (name === "README.md") {
      if (!text.includes("24.15.0")) bad.push("README.md needs Node 24.15.0");
      if (!text.includes("npm i -g context-mode@next && context-mode setup") && !hasTwoLines(text)) bad.push("README.md needs the two-command install");
      if (!text.includes("context-mode setup --remove && npm rm -g context-mode") && !/^context-mode setup --remove\n(?:[^\n]*\n)*?npm rm -g context-mode$/m.test(fencedLines(text).join("\n"))) bad.push("README.md needs the uninstall command");
    } else {
      if (!text.includes("context-mode setup")) bad.push(`${name} needs context-mode setup`);
    }
  }
  return bad;
}

export function checkLines(name, text) {
  const bad = [];
  let fence = null;
  let config = false;
  let lang = "";
  text.split("\n").forEach((line, i) => {
    const m = /^\s*(`{3,})\s*([\w+-]*)/.exec(line);
    if (m) {
      if (fence === null) { fence = m[1]; lang = m[2]; config = CONFIG_LANG.test(m[2]); }
      else if (line.trim().startsWith(fence)) { fence = null; config = false; lang = ""; }
      return;
    }
    if (fence === null) return;
    const at = `${name}:${i + 1}`;
    if (/<[A-Za-z.][^<>\n]*>/.test(line) || /\.\.\.>/.test(line)) bad.push(`${at} placeholder: ${line.trim()}`);
    if (/npx\s+(-y\s+)?context-mode/.test(line)) bad.push(`${at} npx context-mode: ${line.trim()}`);
    // v2 preview is on dist-tag next; a bare install gets v1 until the owner moves latest (ADR-0019 D2).
    if (/\bnpm\s+(i|install|add)\b[^\n&;|]*\bcontext-mode(?![\w./@-])/.test(line)) bad.push(`${at} npm install of context-mode needs a version tag (@next for v2, @1 for v1): ${line.trim()}`);
    for (const c of line.matchAll(CLI_CMD)) {
      for (const f of c[2].match(/(?:^|\s)(--?[A-Za-z][\w-]*)/g) ?? []) if (!CLI_FLAGS.has(f.trim())) bad.push(`${at} unknown flag ${f.trim()} for context-mode ${c[1]}: ${line.trim()}`);
    }
    if (USER_PATH.test(line)) bad.push(`${at} user path: ${line.trim()}`);
    if (EDIT_HINT.test(line)) bad.push(`${at} edit step: ${line.trim()}`);
    if (SH_LANG.test(lang)) {
      if (/["']~[\/\\]/.test(line)) bad.push(`${at} quoted ~ does not expand in sh, use "$HOME/...": ${line.trim()}`);
      if (/\$env:USERPROFILE|%USERPROFILE%/.test(line)) bad.push(`${at} Windows variable in an sh block: ${line.trim()}`);
    }
    if (PS_LANG.test(lang)) {
      if (/(^|[\s"'=(])~[\/\\]/.test(line)) bad.push(`${at} ~ does not expand for git/node in PowerShell 5.1, use $env:USERPROFILE: ${line.trim()}`);
      if (/%USERPROFILE%/.test(line)) bad.push(`${at} %USERPROFILE% does not expand in PowerShell, use $env:USERPROFILE: ${line.trim()}`);
    }
    for (const a of line.matchAll(APP)) {
      const before = line.slice(0, a.index);
      const quotedBare = OK_BEFORE[1].test(before) && /^\.context-mode-app["'`]/.test(line.slice(a.index));
      if (config) {
        if (!AGENT_VAR_BEFORE.test(before)) bad.push(`${at} .context-mode-app path in a config block needs an agent variable ({env:HOME}, \${extensionPath}): ${line.trim()}`);
        continue;
      }
      if (!OK_BEFORE[0].test(before) && !quotedBare) bad.push(`${at} .context-mode-app path without $HOME/~/%USERPROFILE%/agent variable: ${line.trim()}`);
    }
  });
  return bad;
}

/** Every line inside a fence, with its 1-based line number and the fence language. */
function fenced(text) {
  const out = [];
  let fence = null;
  let lang = "";
  text.split("\n").forEach((line, i) => {
    const m = /^\s*(`{3,})\s*([\w+-]*)/.exec(line);
    if (m) {
      if (fence === null) { fence = m[1]; lang = m[2]; } else if (line.trim().startsWith(fence)) { fence = null; lang = ""; }
      return;
    }
    if (fence !== null) out.push({ line, n: i + 1, lang });
  });
  return out;
}
const fencedLines = (text) => fenced(text).map((l) => l.line.trim());
const hasTwoLines = (text) => { const l = fencedLines(text); return l.includes("npm i -g context-mode@next") && l.includes("context-mode setup"); };

const HOME_PATH = /(^|[^\w])~[\/\\]|\$HOME\b|\$\{HOME\}|%USERPROFILE%|\$env:USERPROFILE|\{env:(HOME|USERPROFILE)\}|\/Users\/|\/home\/|[A-Z]:\\+Users\\/i;
const SHELL_OR_PLAIN = /^(|sh|bash|zsh|shell|console|powershell|pwsh|ps1|cmd|bat)$/i;
export const MAX_COMMAND_CHARS = 100;

/** Simple rules for one doc: no script, no npm root -g, no $(...), no home path in a fence; shell lines <= 100 chars. */
export function checkSimpleLines(name, text) {
  const bad = [];
  for (const { line, n, lang } of fenced(text)) {
    const at = `${name}:${n}`;
    const t = line.trim().slice(0, 100);
    if (/\bnode\s+-e\b/.test(line)) bad.push(`${at} node -e script: ${t}`);
    if (/\bnpm\s+root\s+-g\b/.test(line)) bad.push(`${at} npm root -g: ${t}`);
    if (/\$\(/.test(line)) bad.push(`${at} $(...) substitution: ${t}`);
    if (HOME_PATH.test(line)) bad.push(`${at} home path (setup or setup --print fills paths): ${t}`);
    if (SHELL_OR_PLAIN.test(lang) && line.length > MAX_COMMAND_CHARS) bad.push(`${at} line over ${MAX_COMMAND_CHARS} chars (${line.length}): ${t}`);
  }
  return bad;
}

/** Page rules: a README has the two-command path; <id>.md has setup --agents <id>, setup --print <id>, setup --remove --agents <id>. */
export function checkSimplePages(pages) {
  const bad = [];
  for (const [name, text] of Object.entries(pages)) {
    const base = path.basename(name);
    if (base === "README.md") { if (!hasTwoLines(text)) bad.push(`${name} needs the two-command path (npm i -g context-mode@next, then context-mode setup)`); continue; }
    const id = base.replace(/\.md$/, "");
    if (!hasTwoLines(text) && !fencedLines(text).includes(`context-mode setup --agents ${id}`)) bad.push(`${name} needs the two-command path or context-mode setup --agents ${id}`);
    if (!text.includes(`context-mode setup --print ${id}`)) bad.push(`${name} needs context-mode setup --print ${id}`);
    if (!text.includes(`context-mode setup --remove --agents ${id}`)) bad.push(`${name} needs context-mode setup --remove --agents ${id}`);
  }
  return bad;
}

/** Hosts whose own native command installs context-mode (ADR-0023). Other hosts open with the npm fallback. */
export const NATIVE_HOSTS = Object.freeze(["claude-code", "codex", "gemini", "qwen", "pi", "opencode"]);
export const NEXT_LINE = "`next` is the v2 prerelease tag";
export const CHECK_LINE = "Check: `context-mode doctor`";
const UPDATE_WORDS = ["update", "upgrade", "--force"];

/** The lines of every fence in `text`, one array per fence (trimmed, empty lines dropped). */
export function fencedBlocks(text) {
  const blocks = [];
  let cur = null;
  let fence = "";
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (cur === null) {
      if (t.startsWith("```")) { fence = "```"; cur = []; }
    } else if (t.startsWith(fence)) { blocks.push(cur); cur = null; }
    else if (t !== "") cur.push(t);
  }
  return blocks;
}

/** The "## Install" section of a page: from its heading to the next "## " heading. */
export function installSection(text) {
  const start = text.indexOf("\n## Install\n");
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const end = rest.indexOf("\n## ", 3);
  return end < 0 ? rest : rest.slice(0, end);
}

/** ADR-0023 page rules: a native host opens with its own command and then its update command; every page has the check line and the next line. */
export function checkNativePages(pages) {
  const bad = [];
  for (const [name, text] of Object.entries(pages)) {
    const base = path.basename(name);
    if (base === "README.md") continue;
    const id = base.replace(".md", "");
    const install = installSection(text);
    const blocks = fencedBlocks(install);
    const first = blocks[0]?.[0] ?? "";
    const second = blocks[1]?.[0] ?? "";
    if (NATIVE_HOSTS.includes(id)) {
      if (first.startsWith("npm i -g context-mode")) bad.push(`${name} first block is the npm route; a native host opens with its own command`);
      if (!UPDATE_WORDS.some((w) => second.includes(w))) bad.push(`${name} needs an update block (the native update command) right after the install block`);
    } else if (second !== "context-mode upgrade") bad.push(`${name} needs a context-mode upgrade block right after the install block`);
    if (!install.includes(CHECK_LINE)) bad.push(`${name} needs ${CHECK_LINE}`);
    if (!install.includes(NEXT_LINE)) bad.push(`${name} needs the next-tag line: ${NEXT_LINE}`);
  }
  return bad;
}

// D-NI-DOCS-REF-2: until v2 is on main, main holds the old build. Every GitHub-source command a user copies names the
// release ref in the host's own syntax (claude and codex: a #release or @release suffix on the repo; gemini and qwen: --ref release).
// Only a line that starts with "After v2 is on main: " may hold the command without it. No regex: plain string search.
export const SWITCH_HEADING = "Already installed from GitHub?";
export const AFTER_PREFIX = "After v2 is on main: ";
const REF_HOSTS = Object.freeze(["claude-code", "codex", "gemini", "qwen"]);
const REF_BOUNDARY = " `,.|)\"'";
const SUFFIX_CMD = "plugin marketplace add mksglu/context-mode"; // claude, /plugin in claude, codex
const FLAG_CMD = "extensions install https://github.com/mksglu/context-mode"; // gemini, qwen
const atBoundary = (rest) => rest === "" || REF_BOUNDARY.includes(rest[0]);

/** The "### Already installed from GitHub?" part of a page: from its heading to the next heading, or "" when absent. */
export function switchSection(text) {
  const start = text.indexOf(`### ${SWITCH_HEADING}`);
  if (start < 0) return "";
  const rest = text.slice(start + 4);
  const end = rest.indexOf("\n#");
  return end < 0 ? rest : rest.slice(0, end);
}

/** Each GitHub-source command in `line` that lacks the release ref (one entry per command). */
function bareCommands(line) {
  const out = [];
  for (const [cmd, flag] of [[SUFFIX_CMD, false], [FLAG_CMD, true]]) {
    let at = line.indexOf(cmd);
    while (at >= 0) {
      const rest = line.slice(at + cmd.length);
      if (!flag) {
        const ok = rest.startsWith("#release") || rest.startsWith("@release") ? atBoundary(rest.slice(8)) : false;
        if (!ok && atBoundary(rest)) out.push(cmd);
      } else if (rest === "" || rest[0] === ":" || atBoundary(rest)) {
        let tail = 0;
        while (tail < rest.length && !" `,|".includes(rest[tail])) tail++;
        const after = rest.slice(tail);
        if (!(after.startsWith(" --ref release") && atBoundary(after.slice(14)))) out.push(cmd);
      }
      at = line.indexOf(cmd, at + cmd.length);
    }
  }
  return out;
}

/** pages: { relative path: text }. Fails a GitHub-source command without the release ref, and a host page without the switch step. */
export function checkReleaseRef(pages) {
  const bad = [];
  for (const [name, text] of Object.entries(pages)) {
    text.split("\n").forEach((line, i) => {
      if (line.trim().startsWith(AFTER_PREFIX)) return;
      for (const cmd of bareCommands(line)) bad.push(`${name}:${i + 1} GitHub-source command without the release ref (claude #release, codex @release, gemini and qwen --ref release): ${cmd}`);
    });
    const parts = name.split("/");
    const id = parts[parts.length - 1].replace(".md", "");
    const inInstall = parts.length === 1 || parts[parts.length - 2] === "install";
    if (inInstall && REF_HOSTS.includes(id) && (!installSection(text).includes(`### ${SWITCH_HEADING}`) || fencedBlocks(switchSection(text)).length !== 1)) {
      bad.push(`${name} needs the switch step: a "### ${SWITCH_HEADING}" part in Install with one block of the host's own remove and add commands`);
    }
  }
  return bad;
}

const V1_WORD = /\bv1\b/i;
/** Lines of `text` that hold the word v1 (any case; v10, ev1 and @1 do not match). */
export function checkNoV1(name, text) {
  return text.split("\n").flatMap((line, i) => (V1_WORD.test(line) ? [`${name}:${i + 1} the word v1 is not allowed in user-facing files: ${line.trim().slice(0, 100)}`] : []));
}

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir).sort()) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f, exts, out);
    else if (exts.some((x) => f.endsWith(x))) out.push(f);
  }
  return out;
}

/** Docs a user may copy an install command from: README, CONTRIBUTING, docs/*.md, docs/install/**, skills/**. */
export function docFiles(repo) {
  const top = ["README.md", "CONTRIBUTING.md"].map((f) => path.join(repo, f)).filter(existsSync);
  const docs = readdirSync(path.join(repo, "docs")).filter((f) => f.endsWith(".md")).sort().map((f) => path.join(repo, "docs", f));
  return [...top, ...docs, ...walk(path.join(repo, "docs", "install"), [".md"]), ...walk(path.join(repo, "skills"), [".md"])];
}

/** Files that must not name v1. */
export function v1FreeFiles(repo) {
  const top = ["README.md", "CONTRIBUTING.md"].map((f) => path.join(repo, f)).filter(existsSync);
  const docs = readdirSync(path.join(repo, "docs")).filter((f) => f.endsWith(".md")).sort().map((f) => path.join(repo, "docs", f));
  return [...top, ...docs, ...walk(path.join(repo, "docs", "install"), [".md"]), ...walk(path.join(repo, "skills"), [".md"]),
    ...walk(path.join(repo, "src", "prompt"), [".md"]), ...walk(path.join(repo, "e2e", "golden", "cli"), [".txt"]), ...walk(path.join(repo, ".github", "ISSUE_TEMPLATE"), [".yml", ".yaml", ".md"])];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  const bad = files.flatMap((f) => checkLines(f, readFileSync(path.join(DIR, f), "utf8")));
  if (!process.argv[2]) { // default run also checks the root README fences (v2 preview install, ADR-0019)
    const readme = path.join(DIR, "..", "..", "README.md");
    bad.push(...checkLines("README.md", readFileSync(readme, "utf8")));
    files.push("README.md");
    const repo = path.join(DIR, "..", "..");
    bad.push(...v1FreeFiles(repo).flatMap((f) => checkNoV1(path.relative(repo, f), readFileSync(f, "utf8"))));
    bad.push(...docFiles(repo).flatMap((f) => checkSimpleLines(path.relative(repo, f), readFileSync(f, "utf8"))));
    const pages = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => [f, readFileSync(path.join(DIR, f), "utf8")]));
    pages["../../README.md"] = readFileSync(readme, "utf8"); // root README: same two-command rule
    bad.push(...checkSimplePages(pages));
    bad.push(...checkNativePages(pages));
    bad.push(...checkReleaseRef(Object.fromEntries(docFiles(repo).map((f) => [path.relative(repo, f), readFileSync(f, "utf8")]))));
  }
  for (const b of bad) console.log("  " + b);
  console.log(`${bad.length ? "FAIL" : "PASS"} install-docs ${files.length} files`);
  process.exit(bad.length ? 1 : 0);
}
