// e2e/live/cases/v1-migration-setup.mjs — plants a v1 install in a temp HOME for the v1-migration-* cases.
// Spec: docs/architecture/modules/15-v1-transition.md §3.1, §7 A3 (literal fixtures from ADR-0011's "v1 cleanup" table);
// DECISIONS-r4 A37 (Kiro agents/*.json name == context-mode, .kiro/steering/KIRO.md), B28 (VS Code both
// session-data dirs, .vscode/mcp.json entry); DEVIATIONS D-M7-arch-6 (fake global bin under a temp npm prefix).
// npm global layout: POSIX <prefix>/bin + <prefix>/lib/node_modules, Windows <prefix> + <prefix>/node_modules.
// Rules: no src/ import (own literal agent list, GS4); never deletes and never overwrites an agent file
// (files open with flag "wx"); the caller creates `home` fresh and owns its removal.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The 10 agent ids (literal copy; GS4 forbids importing src/core/contracts/agents.ts). */
export const AGENT_IDS = Object.freeze(["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode", "pi", "opencode"]);

const BIN = "context-mode"; // v1 global npm bin name
const PROJECT_DIR = "project"; // <home>/project: the workspace for VS Code / Kiro project-scope files
const NPM_PREFIX_DIR = ".npm-global"; // <home>/.npm-global: the temp npm_config_prefix (D-M7-arch-6)
const V1_VERSION = "1.0.0";

/** Project dir the case opens the agent in (VS Code .github/.vscode files, Kiro steering doc). */
export function v1Project(home) {
  return path.join(home, PROJECT_DIR);
}

/** Temp npm prefix: the case sets npm_config_prefix to this and puts v1NpmBinDir first on PATH. */
export function v1NpmPrefix(home) {
  return path.join(home, NPM_PREFIX_DIR);
}

/** npm's global bin dir for the prefix: <prefix>/bin on POSIX, the prefix itself on Windows. */
export function v1NpmBinDir(home) {
  return process.platform === "win32" ? v1NpmPrefix(home) : path.join(v1NpmPrefix(home), "bin");
}

/** npm's global package root (`npm root -g`): <prefix>/lib/node_modules on POSIX, <prefix>/node_modules on Windows. */
function v1NpmRoot(home) {
  return process.platform === "win32"
    ? path.join(v1NpmPrefix(home), "node_modules")
    : path.join(v1NpmPrefix(home), "lib", "node_modules");
}

/** The fake v1 global bin; the case removes it to stand for `npm uninstall -g context-mode`. */
export function v1GlobalBin(home) {
  return path.join(v1NpmBinDir(home), process.platform === "win32" ? BIN + ".cmd" : BIN);
}

const json = (v) => JSON.stringify(v, null, 2) + "\n";
const hookCmd = (agent, event) => `${BIN} hook ${agent} ${event}`; // v1 hooks call the global bin (ADR-0011 Facts)

/** Write a new file; throws EEXIST rather than overwrite anything already there. */
function put(file, text, mode) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, { flag: "wx", mode });
}

/** Shared by every agent in one home (global bin, ~/.context-mode/): written once, kept as is after. */
function putShared(file, text, mode) {
  if (!existsSync(file)) put(file, text, mode);
}

/** Non-empty v1 data dir (ADR-0011 "data <...>/context-mode/"). */
function dataDir(dir) {
  put(path.join(dir, "session.db"), "v1 fixture session data\n");
}

/** Nested hook shape: hooks.<Event>[{matcher, hooks:[{type, command}]}] (Claude Code, Qwen, Gemini, Codex, ZCode). */
const nested = (agent, events) => ({
  hooks: Object.fromEntries(events.map((e) => [e, [{ matcher: "", hooks: [{ type: "command", command: hookCmd(agent, e.toLowerCase()) }] }]])),
});

/** Flat hook shape: hooks.<Event>[{type, command}] (Copilot CLI, VS Code hook files, Kiro, ZCode config.json). */
const flat = (agent, events) => Object.fromEntries(events.map((e) => [e, [{ type: "command", command: hookCmd(agent, e.toLowerCase()) }]]));

function plantGlobalBin(home) {
  putShared(path.join(v1NpmRoot(home), BIN, "package.json"), json({ name: BIN, version: V1_VERSION, bin: { [BIN]: "cli.js" } }));
  const script = process.platform === "win32"
    ? "@echo off\r\nmore >nul\r\nexit /b 0\r\n"
    : "#!/bin/sh\n# fake v1 context-mode global bin: reads the hook payload, allows, exits 0\ncat >/dev/null\nexit 0\n";
  putShared(v1GlobalBin(home), script, 0o755);
}

function plantDataRoot(home) {
  putShared(path.join(home, ".context-mode", "content", "v1-content.db"), "v1 fixture content\n");
  putShared(path.join(home, ".context-mode", "platform.json"), json({ platform: "v1" }));
}

const PLANT = {
  "claude-code"(home) {
    const dir = path.join(home, ".claude");
    const settings = nested("claude-code", ["PreToolUse", "PostToolUse", "UserPromptSubmit", "PreCompact"]);
    settings.hooks.SessionStart = [{ matcher: "", hooks: [
      { type: "command", command: hookCmd("claude-code", "sessionstart") },
      { type: "command", command: `node ${path.join(dir, "hooks", "context-mode-cache-heal.mjs")}` },
    ] }];
    put(path.join(dir, "settings.json"), json(settings));
    put(path.join(dir, "hooks", "context-mode-cache-heal.mjs"), "// v1 cache-heal fixture\n");
    put(path.join(dir, "hooks", "context-mode-cache-heal.sh"), "#!/bin/sh\n# v1 cache-heal fixture\n");
    put(path.join(home, ".claude.json"), json({ mcpServers: { [BIN]: { command: BIN, args: ["mcp"] } } }));
    dataDir(path.join(dir, "context-mode"));
  },
  codex(home) {
    const dir = path.join(home, ".codex");
    put(path.join(dir, "hooks.json"), json(nested("codex", ["PreToolUse", "PostToolUse", "SessionStart"])));
    put(path.join(dir, "config.toml"), `[features]\nhooks = true\n\n[mcp_servers.${BIN}]\ncommand = "${BIN}"\nargs = ["mcp"]\n`);
    dataDir(path.join(dir, "context-mode"));
  },
  gemini(home) {
    const dir = path.join(home, ".gemini");
    put(path.join(dir, "settings.json"), json(nested("gemini", ["BeforeTool", "AfterTool", "SessionStart", "PreCompress"])));
    dataDir(path.join(dir, "context-mode")); // shared with Antigravity: deleted only after a prompt
  },
  qwen(home) {
    const dir = path.join(home, ".qwen");
    put(path.join(dir, "settings.json"), json(nested("qwen", ["PreToolUse", "PostToolUse", "SessionStart"])));
    dataDir(path.join(dir, "context-mode"));
  },
  "copilot-cli"(home) {
    const dir = path.join(home, ".copilot");
    put(path.join(dir, "hooks", "context-mode.json"), json({ version: 1, hooks: flat("copilot-cli", ["preToolUse", "postToolUse", "sessionStart"]) }));
    dataDir(path.join(dir, "context-mode"));
  },
  vscode(home) {
    const project = v1Project(home);
    put(path.join(project, ".github", "hooks", "context-mode.json"), json({ hooks: flat("vscode", ["PreToolUse", "PostToolUse", "SessionStart"]) }));
    put(path.join(project, ".vscode", "mcp.json"), json({ servers: { [BIN]: { command: BIN, args: ["mcp"] } } }));
    dataDir(path.join(project, ".github", "context-mode", "sessions")); // B28 project scope
    dataDir(path.join(home, ".vscode", "context-mode", "sessions")); // B28 home fallback (#649)
  },
  kiro(home) {
    const dir = path.join(home, ".kiro");
    put(path.join(dir, "agents", "default.json"), json({ hooks: flat("kiro", ["preToolUse", "postToolUse", "agentSpawn"]) }));
    // A37: v1's separate template-install channel (configs/kiro/agent.json) wrote a named agent file.
    put(path.join(dir, "agents", "context-mode.json"), json({ name: BIN, hooks: flat("kiro", ["preToolUse", "postToolUse"]) }));
    put(path.join(v1Project(home), ".kiro", "steering", "KIRO.md"), "# context-mode (v1 steering doc fixture)\n");
    dataDir(path.join(dir, "context-mode"));
  },
  zcode(home) {
    const dir = path.join(home, ".zcode", "cli");
    put(path.join(dir, "config.json"), json({ hooks: { events: flat("zcode", ["PreToolUse", "PostToolUse"]) } }));
    put(path.join(dir, "hooks.json"), json(nested("zcode", ["PreToolUse", "SessionStart"])));
  },
  pi(home) {
    put(path.join(home, ".pi", "agent", "settings.json"), json({ packages: ["npm:context-mode"] }));
    dataDir(path.join(home, ".pi", "context-mode"));
  },
  opencode(home) {
    put(path.join(home, ".config", "opencode", "opencode.json"), json({ $schema: "https://opencode.ai/config.json", plugin: [BIN] }));
  },
};

/**
 * impl/15 §3.1: write the ADR-0011 v1 footprint for `agentId` under `home`, plus the shared fake global bin
 * and ~/.context-mode/ v1 content. Throws on an id outside AGENT_IDS (a harness-authoring bug) before writing.
 */
export function plantV1Install(agentId, home) {
  if (!AGENT_IDS.includes(agentId)) {
    throw new Error(`plantV1Install: unknown agent id "${agentId}"; expected one of ${AGENT_IDS.join(", ")}`);
  }
  PLANT[agentId](home);
  plantGlobalBin(home);
  plantDataRoot(home);
}
