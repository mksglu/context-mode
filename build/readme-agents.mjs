#!/usr/bin/env node
// build/readme-agents.mjs — D-README-1, D-README-AGENT-LINES-1, D-README-DWELL-1: renders each README install block
// (<details id="install-<id>">, closed) from docs/install/<id>.md, the adapter table (src/adapters/table.ts) and the
// setup registry (src/setup/registry.ts). Every command is copied from the page, never typed here (owner main rule:
// "tum agentlerin kendi native install commandleri ne ise onlari kullanalim").
// Block = summary (agent name from the "# Install context-mode v2 on <name>" heading), then
//   1. a sh fence: the first fence under "## Install" (the agent's own install). Codex adds its one-time hook trust step
//      (the page's "npm i -g context-mode@next" + "context-mode setup --agents codex" fence) as the last lines, after a # comment.
//   2. a sh fence with "# update", "# check" and "# remove" comment lines:
//      update = the page's Update fence;
//      check  = the page's Verify fence. For an agent that installs with its own plugin command, the context-mode CLI
//               is absent from PATH right after that install (live temp-HOME runs, 2026-11-03), so the block keeps the
//               agent's own Verify lines (claude plugin list, codex mcp list, ...) and drops the context-mode doctor line;
//      remove = the agent's own uninstall lines from the page (the "Already installed" switch fence, before the
//               reinstall), else the first fence under "## Remove".
//   3. one line "Hooks ✓ (<channel>) · MCP ✓ · Skills ✓" from table.ts and the registry.
// Usage: node build/readme-agents.mjs [--write]. Without --write it prints the blocks; --write puts them into README.md.
// build/check-readme.mjs calls checkAgentLines() and fails on any problem.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTERS } from "../src/adapters/table.ts";
import { buildRegistry } from "../src/setup/registry.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(REPO_ROOT, "README.md");
const TITLE_PREFIX = "# Install context-mode v2 on ";
export const HOOK_WORDS = Object.freeze({ package: "package", "home-file": "hook file", "in-process": "the plugin's own event handlers" });
const FALLBACK_INSTALL = "npm + `context-mode setup`";
export const LINE_PREFIX = "Hooks ✓";
const TRUST_COMMENT = "# one-time step: trust the plugin hooks";

/** Fences of one "## <heading>" section: [{ before, lines }], before = the last prose line above the fence. */
function sectionFences(lines, heading) {
  const at = lines.indexOf(heading);
  if (at < 0) return [];
  const out = [];
  let fence = null;
  let before = "";
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!fence && l.startsWith("## ")) break;
    if (l.startsWith("```")) {
      if (fence) { out.push({ before, lines: fence }); fence = null; } else fence = [];
      continue;
    }
    if (fence) { if (l.trim() !== "") fence.push(l.trimEnd()); } else if (l.trim() !== "") before = l;
  }
  return out;
}

function pageOf(id) {
  const rel = `docs/install/${id}.md`;
  const lines = readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\n");
  const title = lines[0] ?? "";
  if (!title.startsWith(TITLE_PREFIX)) throw new Error(`${rel}: first line must start with "${TITLE_PREFIX}"`);
  for (const heading of ["## Install", "## Verify", "## Remove"]) {
    if (!lines.includes(heading)) throw new Error(`${rel}: no "${heading}" heading`);
  }
  return { rel, name: title.slice(TITLE_PREFIX.length).trim(), lines };
}

/** The commands of one agent, each list copied from its install page. */
export function agentCommands(id, lines, bin) {
  const install = sectionFences(lines, "## Install");
  const verify = sectionFences(lines, "## Verify")[0]?.lines ?? [];
  const removeFence = sectionFences(lines, "## Remove")[0]?.lines ?? [];
  const first = install[0]?.lines ?? [];
  const update = install.find((f) => f.before.startsWith("Update"))?.lines ?? [];
  const own = !first[0]?.startsWith("npm ") && (first[first.length - 1] ?? "").startsWith(`${bin} `);
  const cmds = { install: [...first], update, check: verify, remove: removeFence, own };
  if (!own) return cmds;
  // The trust step: the page's fence that installs the context-mode command from npm, then runs setup (D-README-DWELL-2).
  const setupLine = `context-mode setup --agents ${id}`;
  const trust = install.find((f) => f.lines.length === 2 && f.lines[0].startsWith("npm i -g ") && f.lines[1] === setupLine)
    ?? install.find((f) => f.lines.length === 1 && f.lines[0] === setupLine);
  if (id === "codex" && trust) cmds.install.push(TRUST_COMMENT, ...trust.lines);
  const agentChecks = verify.filter((l) => !l.startsWith("context-mode "));
  if (agentChecks.length) cmds.check = agentChecks;
  // The switch fence: the agent's own uninstall lines, then the install lines again.
  const sw = install.find((f) => f.lines.length > first.length && first.every((c) => f.lines.includes(c)));
  if (sw) {
    const off = sw.lines.filter((l) => !first.includes(l));
    if (off.length) cmds.remove = off;
  } else if (removeFence[0] && !removeFence[0].startsWith("context-mode ")) {
    cmds.remove = [removeFence[0]];
  }
  return cmds;
}

/** One row per adapter, sorted by agent name. */
export function agentRows() {
  // Paths are not used here; the registry only needs a context to build its rows.
  const registry = buildRegistry({ home: path.join(REPO_ROOT, ".readme-home"), pkgDir: REPO_ROOT, env: {} });
  const byId = new Map(registry.map((r) => [r.id, r]));
  return ADAPTERS.map((a) => {
    const reg = byId.get(a.id);
    if (!reg) throw new Error(`setup registry has no row for ${a.id}`);
    const { rel, name, lines } = pageOf(a.id);
    if (!(a.hookChannel.kind in HOOK_WORDS)) throw new Error(`${a.id}: unknown hook channel ${a.hookChannel.kind}`);
    const hooks = `yes, ${HOOK_WORDS[a.hookChannel.kind]}`;
    const mcp = a.installMode === "in-process" && !reg.config ? "ctx tools built into the plugin" : "yes";
    const bin = reg.nativePlugin?.bin ?? reg.cli?.bin ?? (a.installMode === "in-process" ? a.id : "");
    const cmds = agentCommands(a.id, lines, bin);
    const install = cmds.own ? cmds.install.filter((c) => !c.startsWith("#") && !c.startsWith("context-mode ") && !c.startsWith("npm ")).map((c) => `\`${c}\``).join("<br>") : FALLBACK_INSTALL;
    return { id: a.id, name, hooks, mcp, skills: a.skillChannel ? "yes" : "no", install, cmds, page: rel };
  }).sort((x, y) => x.name.localeCompare(y.name));
}

/** The generated Hooks / MCP / Skills line for one agent. */
export function agentLine(r) {
  const hooks = r.hooks.startsWith("yes, ") ? `${LINE_PREFIX} (${r.hooks.slice(5)})` : `Hooks: ${r.hooks}`;
  const mcp = r.mcp === "yes" ? "MCP ✓" : r.mcp.startsWith("no") ? `MCP: ${r.mcp}` : `MCP ✓ (${r.mcp})`;
  const skills = r.skills === "yes" ? "Skills ✓" : "Skills: no";
  return `${hooks} · ${mcp} · ${skills}`;
}

/** id -> generated line, one per adapter. */
export function renderAgentLines() {
  return Object.fromEntries(agentRows().map((r) => [r.id, agentLine(r)]));
}

const fence = (lines) => ["```sh", ...lines, "```"];

/** The whole closed install block of one agent. */
export function agentBlock(r) {
  const c = r.cmds;
  return [
    `<details id="install-${r.id}"><summary><b>${r.name}</b></summary>`,
    "",
    ...fence(c.install),
    "",
    ...fence(["# update", ...c.update, "# check", ...c.check, "# remove", ...c.remove]),
    "",
    agentLine(r),
    "",
    "</details>",
  ].join("\n");
}

/** id -> whole block, one per adapter. */
export function renderAgentBlocks() {
  return Object.fromEntries(agentRows().map((r) => [r.id, agentBlock(r)]));
}

/** The install block of one agent: from its <details ... id="install-<id>"> tag through </details>. */
function blockOf(text, id) {
  const tag = text.indexOf(`id="install-${id}">`);
  if (tag < 0) return null;
  const start = text.lastIndexOf("<details", tag);
  const close = text.indexOf("</details>", tag);
  if (start < 0 || close < 0) return null;
  const end = close + "</details>".length;
  return { start, end, body: text.slice(start, end) };
}

/** Problems with the README copy of the blocks; [] when each install block equals its rendered block. */
export function checkAgentLines(text) {
  const problems = [];
  for (const [id, block] of Object.entries(renderAgentBlocks())) {
    const b = blockOf(text, id);
    if (!b) { problems.push(`${id}: README has no install block id="install-${id}"`); continue; }
    if (b.body !== block) problems.push(`${id}: install block differs from build/readme-agents.mjs; run node build/readme-agents.mjs --write`);
  }
  if (text.includes("| Agent | Hooks |")) problems.push("README still has the agent table; the install blocks replace it");
  for (const line of text.split("\n")) {
    if (line.startsWith("<details") && line.includes(" open")) problems.push(`a details block starts open (D-README-DWELL-1): ${line.slice(0, 80)}`);
  }
  return problems;
}

/** README text with each install block replaced by its rendered block. Throws when a block is missing. */
export function writeAgentLines(text) {
  let out = text;
  for (const [id, block] of Object.entries(renderAgentBlocks())) {
    const b = blockOf(out, id);
    if (!b) throw new Error(`README.md has no install block for ${id}`);
    out = out.slice(0, b.start) + block + out.slice(b.end);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const text = readFileSync(README, "utf8");
    const next = writeAgentLines(text);
    if (next !== text) writeFileSync(README, next);
    console.log(next === text ? "readme-agents: README.md already up to date" : "readme-agents: README.md updated");
  } else {
    console.log(Object.values(renderAgentBlocks()).join("\n\n"));
  }
}
