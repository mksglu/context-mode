// scripts/release/reach.mjs — which agents a release reaches (D-REL-WHO-1). Owner, 2026-11-04: "Claude Code hatasi duzeldi mi?
// npm cikmamiza gerek kalmadi mi Claude Code icin? Release workflow una bunu yazalim bir sekilde."
// One version goes to both channels on every release (the release commit on main for the GitHub agents, npm for the rest), so
// every agent runs the same code and the version numbers stay one line. This module maps the files changed since the last tag
// to the agents they reach and renders the "Who gets this" table: agent, channel, and the agent's own update command, copied
// from docs/install/<id>.md through build/readme-agents.mjs (the same commands the README shows).
// Plain string ops over repo paths; no dependency.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import { ISSUE_REPO_SLUG } from "../../src/core/contracts/constants.ts";
import { ADAPTERS } from "../../src/adapters/table.ts";
import { agentRows } from "../../build/readme-agents.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTER_DIR = "src/adapters/";
const ENTRY_DIR = "src/entries/";
const SETUP_DIR = "src/setup/";
const PLUGIN_DIR = "plugins/claude-code/";
const PLUGIN_HOOKS_DIR = PLUGIN_DIR + "hooks/";
const TS = ".ts";
const JSON_EXT = ".json";

// Paths that ship to no agent: docs, tests, CI, benchmarks, release tooling, repo meta files.
const NO_AGENT_DIRS = Object.freeze(["docs/", "tests/", ".github/", "e2e/", "bench/", "scripts/", ".claude/"]);
const NO_AGENT_FILES = Object.freeze(["README.md", "CONTRIBUTING.md", "LICENSE", "stats.json", ".gitignore", ".gitattributes", "tsconfig.json"]);
// build/: these write the shipped tree; every other build/ file is a check or a README generator.
const BUILD_DIR = "build/";
const BUILD_SHIPPED = Object.freeze(["build/build.mjs", "build/manifests.ts", "build/hash.mjs", "build/main-tree.mjs"]);
// A file name that starts with one of these names belongs to that agent (src/setup/copilot-hooks.ts -> copilot-cli).
const NAME_ALIASES = Object.freeze([["copilot", "copilot-cli"]]);
// Manifest files of one agent at the repo root.
const AGENT_FILES = Object.freeze({
  "qwen-extension.json": "qwen",
  "gemini-extension.json": "gemini",
  ".codex-plugin/": "codex",
  ".agents/plugins/": "codex",
  ".claude-plugin/": "claude-code",
});
// plugins/claude-code/<dir>/ of one agent.
const PLUGIN_DIR_ALIASES = Object.freeze({ copilot: "copilot-cli" });
const TRUST_STEP = ", npm for the one-time hook trust step";
const NPM_GLOBAL = "npm i -g ";

const ROWS = agentRows();
const ROW_BY_ID = new Map(ROWS.map((r) => [r.id, r]));
// GitHub agents: the install command names this repo (marketplace add, extensions install); the rest install from npm.
const GITHUB_AGENTS = Object.freeze(AGENT_IDS.filter((id) => (ROW_BY_ID.get(id)?.cmds.install ?? []).some((c) => c.includes(ISSUE_REPO_SLUG))));
const PACKAGE_HOOKS = new Map(ADAPTERS.filter((a) => a.hookChannel.kind === "package").map((a) => [a.hookChannel.path, a.id]));

function agentOfName(base) {
  for (const id of AGENT_IDS) if (base === id || base.startsWith(id + "-")) return id;
  for (const [name, id] of NAME_ALIASES) if (base === name || base.startsWith(name + "-")) return id;
  return undefined;
}

// src/adapters/<id>.ts -> the agents whose adapter imports it, directly or through another adapter (#1304: codex, qwen,
// vscode and zcode import the Claude shape from claude-code.ts).
function adapterReach() {
  const dir = path.join(REPO, ADAPTER_DIR);
  const names = readdirSync(dir).filter((f) => f.endsWith(TS)).map((f) => f.slice(0, -TS.length)).filter((n) => AGENT_IDS.includes(n));
  const importers = new Map(names.map((n) => [n, names.filter((m) => m !== n && readFileSync(path.join(dir, m + TS), "utf8").includes(`from "./${n}${TS}"`))]));
  const reach = new Map();
  for (const n of names) {
    const seen = new Set([n]);
    const todo = [n];
    while (todo.length) for (const m of importers.get(todo.pop())) if (!seen.has(m)) { seen.add(m); todo.push(m); }
    reach.set(n, [...seen]);
  }
  return reach;
}
const ADAPTER_REACH = adapterReach();

/** The agents one changed path reaches: [] for none, AGENT_IDS for shared code. */
function reachOfFile(file) {
  if (NO_AGENT_FILES.includes(file) || NO_AGENT_DIRS.some((d) => file.startsWith(d))) return [];
  if (file.startsWith(BUILD_DIR)) return BUILD_SHIPPED.includes(file) ? AGENT_IDS : [];
  for (const [key, id] of Object.entries(AGENT_FILES)) if (file === key || (key.endsWith("/") && file.startsWith(key))) return [id];
  if (PACKAGE_HOOKS.has(file)) return [PACKAGE_HOOKS.get(file)];
  const base = path.posix.basename(file);
  const stem = base.includes(".") ? base.slice(0, base.indexOf(".")) : base;
  const dir = path.posix.dirname(file) + "/";
  if (dir === ADAPTER_DIR) return ADAPTER_REACH.get(stem) ?? AGENT_IDS;
  if (dir === ENTRY_DIR || dir === SETUP_DIR) { const id = agentOfName(stem); return id ? [id] : AGENT_IDS; }
  if (dir === PLUGIN_HOOKS_DIR && base.endsWith(JSON_EXT)) {
    const id = PACKAGE_HOOKS.get("hooks/" + base) ?? agentOfName(stem);
    return id ? [id] : GITHUB_AGENTS;
  }
  if (file.startsWith(PLUGIN_DIR)) {
    const top = file.slice(PLUGIN_DIR.length).split("/");
    const id = top.length > 1 ? (PLUGIN_DIR_ALIASES[top[0]] ?? (AGENT_IDS.includes(top[0]) ? top[0] : undefined)) : undefined;
    return id ? [id] : GITHUB_AGENTS;
  }
  return AGENT_IDS;
}

/** The agents a set of changed paths reaches, in AGENT_IDS order. */
export function reachOf(files) {
  const hit = new Set(files.flatMap(reachOfFile));
  return AGENT_IDS.filter((id) => hit.has(id));
}

function channelOf(id) {
  if (!GITHUB_AGENTS.includes(id)) return "npm";
  return (ROW_BY_ID.get(id)?.cmds.install ?? []).some((c) => c.startsWith(NPM_GLOBAL)) ? "GitHub" + TRUST_STEP : "GitHub";
}

/** The "Who gets this" block for the release notes and the job summary. */
export function whoGetsTable(ids) {
  const nameOf = (id) => ROW_BY_ID.get(id)?.name ?? id;
  const rows = ids.map((id) => `| ${nameOf(id)} | ${channelOf(id)} | \`${(ROW_BY_ID.get(id)?.cmds.update ?? []).join("; ")}\` |`);
  const rest = AGENT_IDS.filter((id) => !ids.includes(id));
  return [
    "### Who gets this",
    "",
    "One version on both channels: the release commit on main (GitHub) and npm.",
    "",
    "| Agent | Channel | Update with |",
    "|---|---|---|",
    ...rows,
    ...(rest.length ? ["", `Same version, no code change: ${rest.map(nameOf).join(", ")}.`] : []),
  ].join("\n");
}
