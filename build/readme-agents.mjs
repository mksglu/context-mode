#!/usr/bin/env node
// build/readme-agents.mjs — D-README-1: renders the README agent table (install) from the adapter
// table (src/adapters/table.ts) and the setup registry (src/setup/registry.ts).
// Agent name = the "# Install context-mode v2 on <name>" heading of docs/install/<id>.md.
// Columns (DEVIATIONS D-README-2): Hooks = the row's hookChannel kind in table.ts (every agent has one, ADR-0020);
// MCP = "yes", or "in-process" when the registry row has no MCP config and the agent runs in process (Pi);
// Skills = the row's skillChannel; Install = the last command of the first fence in the page's Install section when
// it is the agent's own command, else "npm + context-mode setup".
// Usage: node build/readme-agents.mjs [--write]. Without --write it prints the tables; --write puts them into
// README.md between the markers. build/check-readme.mjs calls checkAgentTables() and fails on any problem.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTERS } from "../src/adapters/table.ts";
import { buildRegistry } from "../src/setup/registry.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(REPO_ROOT, "README.md");
const TITLE_PREFIX = "# Install context-mode v2 on ";
export const HOOK_WORDS = Object.freeze({ package: "package", "home-file": "hook file", "in-process": "in-process" });
const FALLBACK_INSTALL = "npm + `context-mode setup`";
const SECTIONS = { install: { heading: "## Install", anchor: "install" } };

export const MARKERS = Object.freeze(Object.fromEntries(Object.keys(SECTIONS).map((k) => [k, Object.freeze([
  `<!-- agents:${k}:start (node build/readme-agents.mjs --write) -->`,
  `<!-- agents:${k}:end -->`,
])])));

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

/** The Install cell: the page's own agent command (last line of the first fence under "## Install"), else the npm route. */
function installCell(lines, bin) {
  const at = lines.indexOf(SECTIONS.install.heading);
  const open = lines.findIndex((l, i) => i > at && l.startsWith("```"));
  const close = lines.findIndex((l, i) => i > open && l.startsWith("```"));
  const cmds = lines.slice(open + 1, close).filter((l) => l.trim() !== "");
  const last = cmds[cmds.length - 1] ?? "";
  if (cmds[0]?.startsWith("npm ") || !last.startsWith(`${bin} `)) return FALLBACK_INSTALL;
  return `\`${last}\``;
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
    const mcp = a.installMode === "in-process" && !reg.config ? "in-process" : "yes";
    const bin = reg.nativePlugin?.bin ?? reg.cli?.bin ?? (a.installMode === "in-process" ? a.id : "");
    return { id: a.id, name, hooks, mcp, skills: a.skillChannel ? "yes" : "no", install: installCell(lines, bin), page: rel };
  }).sort((x, y) => x.name.localeCompare(y.name));
}

/** The two tables as markdown, without the markers. */
export function renderAgentTables() {
  const rows = agentRows();
  const out = {};
  for (const [key, { anchor }] of Object.entries(SECTIONS)) {
    out[key] = ["| Agent | Hooks | MCP | Skills | Install | Guide |", "|---|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.name} | ${r.hooks} | ${r.mcp} | ${r.skills} | ${r.install} | [${r.page}](${r.page}#${anchor}) |`)].join("\n");
  }
  return out;
}

function block(key, table) {
  const [start, end] = MARKERS[key];
  return `${start}\n${table}\n${end}`;
}

/** Problems with the README copy of the tables; [] when both match the rendered tables. */
export function checkAgentTables(text) {
  const tables = renderAgentTables();
  const problems = [];
  for (const key of Object.keys(SECTIONS)) {
    const [start, end] = MARKERS[key];
    const starts = text.split(start).length - 1;
    const ends = text.split(end).length - 1;
    if (starts !== 1 || ends !== 1) {
      problems.push(`${key}: README needs each marker once (start ${starts}, end ${ends}); run node build/readme-agents.mjs --write`);
      continue;
    }
    if (!text.includes(block(key, tables[key]))) {
      problems.push(`${key}: README table differs from build/readme-agents.mjs; run node build/readme-agents.mjs --write`);
    }
  }
  return problems;
}

/** README text with both blocks replaced by the rendered tables. Throws when a marker is missing. */
export function writeAgentTables(text) {
  const tables = renderAgentTables();
  let out = text;
  for (const key of Object.keys(SECTIONS)) {
    const [start, end] = MARKERS[key];
    const i = out.indexOf(start);
    const j = out.indexOf(end, i);
    if (i < 0 || j < 0) throw new Error(`README.md has no ${key} markers`);
    out = out.slice(0, i) + block(key, tables[key]) + out.slice(j + end.length);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const text = readFileSync(README, "utf8");
    const next = writeAgentTables(text);
    if (next !== text) writeFileSync(README, next);
    console.log(next === text ? "readme-agents: README.md already up to date" : "readme-agents: README.md updated");
  } else {
    const t = renderAgentTables();
    console.log(t.install);
  }
}
