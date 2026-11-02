#!/usr/bin/env node
// build/readme-agents.mjs — D-README-1, D-README-AGENT-LINES-1: renders one line per README install block from the adapter
// table (src/adapters/table.ts) and the setup registry (src/setup/registry.ts).
// Agent name = the "# Install context-mode v2 on <name>" heading of docs/install/<id>.md.
// Columns (DEVIATIONS D-README-2): Hooks = the row's hookChannel kind in table.ts (every agent has one, ADR-0020);
// MCP = "yes", or "plugin inside the agent" when the registry row has no MCP config and the agent runs in process (Pi);
// Skills = the row's skillChannel; Install = every command of the first fence in the page's Install section, joined by
// <br>, when it is the agent's own command (D-README-INSTALL-CELL-1), else "npm + context-mode setup".
// The line ("Hooks: ... · MCP: ... · Skills: ... · Guide: ...") sits inside each <details id="install-<id>"> block; the
// owner dropped the Supported agents table (2026-11-02). Usage: node build/readme-agents.mjs [--write]. Without --write it
// prints the lines; --write puts them into README.md. build/check-readme.mjs calls checkAgentLines() and fails on any problem.
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
const SECTIONS = { install: { heading: "## Install", anchor: "install" } };
export const LINE_PREFIX = "Hooks: ";

function pageOf(id) {
  const rel = `docs/install/${id}.md`;
  const lines = readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\n");
  const title = lines[0] ?? "";
  if (!title.startsWith(TITLE_PREFIX)) throw new Error(`${rel}: first line must start with "${TITLE_PREFIX}"`);
  for (const { heading } of Object.values(SECTIONS)) {
    if (!lines.includes(heading)) throw new Error(`${rel}: no "${heading}" heading`);
  }
  return { rel, name: title.slice(TITLE_PREFIX.length).trim(), lines };
}

/** The Install cell: every line of the first fence under "## Install" when it is the agent's own command, joined by <br>
 * (D-README-INSTALL-CELL-1: a reader who copies the cell runs the whole install), else the npm route. */
function installCell(lines, bin) {
  const at = lines.indexOf(SECTIONS.install.heading);
  const open = lines.findIndex((l, i) => i > at && l.startsWith("```"));
  const close = lines.findIndex((l, i) => i > open && l.startsWith("```"));
  const cmds = lines.slice(open + 1, close).filter((l) => l.trim() !== "");
  const last = cmds[cmds.length - 1] ?? "";
  if (cmds[0]?.startsWith("npm ") || !last.startsWith(`${bin} `)) return FALLBACK_INSTALL;
  return cmds.map((c) => `\`${c.trim()}\``).join("<br>");
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
    const mcp = a.installMode === "in-process" && !reg.config ? "plugin inside the agent" : "yes";
    const bin = reg.nativePlugin?.bin ?? reg.cli?.bin ?? (a.installMode === "in-process" ? a.id : "");
    return { id: a.id, name, hooks, mcp, skills: a.skillChannel ? "yes" : "no", install: installCell(lines, bin), page: rel };
  }).sort((x, y) => x.name.localeCompare(y.name));
}

/** The generated line for one agent: hooks, MCP, skills and the guide link (D-README-AGENT-LINES-1). */
export function agentLine(r) {
  const hooks = r.hooks.startsWith("yes, ") ? `yes (${r.hooks.slice(5)})` : r.hooks;
  return `${LINE_PREFIX}${hooks} · MCP: ${r.mcp} · Skills: ${r.skills} · Guide: [${r.page}](${r.page}#install)`;
}

/** id -> generated line, one per adapter. */
export function renderAgentLines() {
  return Object.fromEntries(agentRows().map((r) => [r.id, agentLine(r)]));
}

/** The install block of one agent: from its <details id="install-<id>"> tag to the closing tag. */
function blockOf(text, id) {
  const start = text.indexOf(`id="install-${id}">`);
  if (start < 0) return null;
  const end = text.indexOf("</details>", start);
  return end < 0 ? null : { start, end, body: text.slice(start, end) };
}

/** Problems with the README copy of the lines; [] when each install block holds its rendered line once. */
export function checkAgentLines(text) {
  const problems = [];
  for (const [id, line] of Object.entries(renderAgentLines())) {
    const b = blockOf(text, id);
    if (!b) { problems.push(`${id}: README has no install block id="install-${id}"`); continue; }
    const own = b.body.split("\n").filter((l) => l.startsWith(LINE_PREFIX));
    if (own.length !== 1 || own[0] !== line) problems.push(`${id}: install block line differs from build/readme-agents.mjs; run node build/readme-agents.mjs --write`);
  }
  if (text.includes("| Agent | Hooks |")) problems.push("README still has the agent table; the lines in the install blocks replace it");
  return problems;
}

/** README text with each install block's line replaced (or added before </details>). Throws when a block is missing. */
export function writeAgentLines(text) {
  let out = text;
  for (const [id, line] of Object.entries(renderAgentLines())) {
    const b = blockOf(out, id);
    if (!b) throw new Error(`README.md has no install block for ${id}`);
    const kept = b.body.split("\n").filter((l) => !l.startsWith(LINE_PREFIX));
    const body = kept.join("\n") + (kept[kept.length - 1] === "" ? "" : "\n");
    out = out.slice(0, b.start) + body.replace(/\n$/, "\n" + line + "\n") + out.slice(b.end);
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
    console.log(Object.values(renderAgentLines()).join("\n"));
  }
}
