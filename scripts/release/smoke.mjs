#!/usr/bin/env node
// scripts/release/smoke.mjs — impl/13-build-release.md §11.2, DEVIATIONS D-M6-arch-5, D-M6-P3-1..3.
// Installs <repo>@<ref> for one agent inside a throwaway HOME and checks the install answers.
// Usage: node scripts/release/smoke.mjs --ref <branch> --agent <claude-code|codex|gemini|qwen> [--repo <git url>] [--layout release|main]
// --layout main (MAIN-ONLY, D-MO-1): the ref holds the main tree (built plugin in plugins/claude-code, root manifests
// for Gemini and Qwen, marketplace on the repo root). claude-code adds a clone of the ref as marketplace, codex
// runs `plugin marketplace add` + `plugin add` on the clone (local subfolder source) and starts the installed server, qwen installs <clone>:context-mode and checks --agent qwen.
// Exit 0 = PASS or SKIPPED (gemini CLI absent or failing, tier-2 per GS2); exit 1 = FAIL.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import {
  AGENT_ARG, AGENT_HOME_DIR, CONFIG_TOML_FILE, GIT_BIN, GIT_CLONE_ARGS, HOST_NODE_COMMAND,
  OWN_MCP_ENTRY, PLUGIN_KEY_SEPARATOR, PLUGIN_MARKETPLACE_NAME, PLUGIN_NAME, RELEASE_BRANCH, RELEASE_REPO_URL,
  SERVER_ENTRY_FILE, SERVER_KEY, UPGRADE_GIT_TIMEOUT_MS,
} from "../../src/core/contracts/constants.ts";
import { pathEntries, spawnShim, whichBin } from "../../src/setup/spawn-bin.ts";

class StepFailed extends Error {}
const WIN_ENV_KEYS = Object.freeze(["ComSpec", "PATHEXT", "SystemRoot", "TEMP", "TMP"]);

// The real claude binary, the way bench/live/run.mjs realClaude() finds it (D-FU-RF-2): the first claude on PATH
// whose resolved file starts with a native-binary magic (Mach-O, ELF, PE). A shim script is skipped, because a
// shim may call a wrapper or the wrong version. CONTEXT_MODE_SMOKE_CLAUDE names the file directly (test seam).
const BINARY_MAGICS = Object.freeze(["cffaedfe", "cefaedfe", "7f454c46", "4d5a"]);
// npm on Windows puts only claude.cmd (a shim) in the PATH dir; the native claude.exe sits under node_modules there.
const CLAUDE_CANDIDATES = Object.freeze([["claude"], ["claude.exe"], ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"]]);
const CLAUDE_OVERRIDE_ENV = "CONTEXT_MODE_SMOKE_CLAUDE";

function isNativeBinary(file) {
  const head = Buffer.alloc(4);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, head, 0, 4, 0); } finally { fs.closeSync(fd); }
  const hex = head.toString("hex");
  return BINARY_MAGICS.some((m) => hex.startsWith(m));
}

function realClaude(pathVar) {
  const override = process.env[CLAUDE_OVERRIDE_ENV];
  if (override) {
    if (!fs.existsSync(override)) throw new StepFailed(`${CLAUDE_OVERRIDE_ENV} ${override} does not exist`);
    return fs.realpathSync(override);
  }
  const shims = [];
  for (const dir of pathEntries(pathVar)) {
    for (const parts of CLAUDE_CANDIDATES) {
      const candidate = path.join(dir, ...parts);
      if (!fs.existsSync(candidate)) continue;
      const real = fs.realpathSync(candidate);
      if (isNativeBinary(real)) return real;
      shims.push(candidate);
    }
  }
  const seen = shims.length > 0 ? `; found only shim script(s): ${shims.join(", ")}` : "";
  throw new StepFailed(`no real claude binary on PATH${seen}`);
}

// One spawned step. A missing binary (ENOENT) has status null and its error on r.error. A bare name is looked up on
// PATH the way setup does it (PATHEXT on Windows, where npm puts only <bin>.cmd/.ps1 shims), and a .cmd shim runs
// through cmd.exe (D-RN-WIN-1); a name not found keeps its ENOENT.
// stdout and stderr go to files, not pipes (D-RN-GEM-1): gemini relaunches itself as a child node process that
// inherits stdio, and spawnSync waits for every pipe holder, so a pipe let that child outlive the step timeout.
// With files, spawnSync returns when the direct child exits or the timeout kills it.
function run(env, cwd, cmd, args, input) {
  const file = path.basename(cmd) === cmd ? (whichBin(cmd, env) ?? cmd) : cmd;
  const io = fs.mkdtempSync(path.join(os.tmpdir(), `${SERVER_KEY}-smoke-io-`));
  const outFile = path.join(io, "out"), errFile = path.join(io, "err");
  const fds = [fs.openSync(outFile, "w"), fs.openSync(errFile, "w")];
  let r;
  try {
    r = spawnShim(file, args, env, { cwd, input, stdio: [input === undefined ? "ignore" : "pipe", ...fds], timeout: stepTimeoutMs() });
  } finally {
    for (const fd of fds) fs.closeSync(fd);
  }
  const out = fs.readFileSync(outFile, "utf8"), stderr = fs.readFileSync(errFile, "utf8");
  fs.rmSync(io, { recursive: true, force: true });
  return { cmd: [cmd, ...args].join(" "), ok: r.status === 0, missing: r.error?.code === "ENOENT",
    out, err: r.error ? String(r.error.message) : stderr };
}

// Step timeout: UPGRADE_GIT_TIMEOUT_MS; CONTEXT_MODE_SMOKE_TIMEOUT_MS sets a shorter one (test seam, D-RN-GEM-1).
const TIMEOUT_OVERRIDE_ENV = "CONTEXT_MODE_SMOKE_TIMEOUT_MS";
function stepTimeoutMs() {
  const n = Number(process.env[TIMEOUT_OVERRIDE_ENV]);
  return Number.isInteger(n) && n > 0 && n < UPGRADE_GIT_TIMEOUT_MS ? n : UPGRADE_GIT_TIMEOUT_MS;
}

function must(step) {
  if (!step.ok) throw new StepFailed(`${step.cmd}: ${step.err.split("\n")[0]}`);
  return step;
}

// claude-code (§11.2 step 1). The CLI has no `marketplace add --ref` and the release branch carries no
// marketplace.json (ADR-0011 b keeps it on main), so the throwaway HOME gets a one-entry marketplace whose
// plugin source is <repo>@<ref> — the same source shape main's marketplace.json uses (D-M6-P3-1).
const MAIN_PLUGIN_DIR = path.join("plugins", "claude-code");
const MAIN_LAYOUT = "main";
const QWEN_EXTENSIONS_DIR = [".qwen", "extensions"];
const QWEN_MANIFEST = "qwen-extension.json";

function cloneRef(env, home, a, name) {
  const dir = path.join(home, name);
  must(run(env, home, GIT_BIN, [...GIT_CLONE_ARGS, a.ref, a.repo, dir]));
  return dir;
}

function claudeCode(env, home, a) {
  const claude = realClaude(env.PATH);
  let mkt;
  if (a.layout === MAIN_LAYOUT) {
    mkt = cloneRef(env, home, a, "main-clone"); // the repo root is the marketplace; its entry source is ./plugins/claude-code
  } else {
    mkt = path.join(home, PLUGIN_MARKETPLACE_NAME);
    fs.mkdirSync(path.join(mkt, ".claude-plugin"), { recursive: true });
    const manifest = { name: PLUGIN_MARKETPLACE_NAME, owner: { name: SERVER_KEY },
      plugins: [{ name: PLUGIN_NAME, source: { source: "url", url: a.repo, ref: a.ref } }] };
    fs.writeFileSync(path.join(mkt, ".claude-plugin", "marketplace.json"), JSON.stringify(manifest));
  }
  const id = PLUGIN_NAME + PLUGIN_KEY_SEPARATOR + PLUGIN_MARKETPLACE_NAME;
  must(run(env, home, claude, ["plugin", "marketplace", "add", mkt]));
  must(run(env, home, claude, ["plugin", "install", id]));
  const listed = JSON.parse(must(run(env, home, claude, ["plugin", "list", "--json"])).out);
  const entry = listed.find((p) => p.id === id);
  if (!entry) throw new StepFailed(`claude plugin list --json: ${id} not listed`);
  if (!fs.existsSync(path.join(entry.installPath, SERVER_ENTRY_FILE))) {
    throw new StepFailed(`installed plugin dir has no ${SERVER_ENTRY_FILE}: ${entry.installPath}`);
  }
  must(run(env, home, claude, ["plugin", "validate", entry.installPath]));
  return `installed ${id} at ${entry.installPath}; validate passed`;
}

// The MCP initialize request; returns the server's result or throws.
function handshake(env, cwd, command, args) {
  const req = { jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "smoke", version: "1" } } };
  const r = run(env, cwd, command, args, JSON.stringify(req) + "\n");
  const reply = r.out.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.id === req.id);
  if (reply?.result?.serverInfo?.name !== SERVER_KEY) {
    throw new StepFailed(`${r.cmd}: no initialize result from ${SERVER_KEY}: ${r.err.split("\n")[0]}`);
  }
  return reply.result;
}

// codex (§11.2 step 2, A2): a git checkout of <repo>@<ref> plus a plain config.toml entry under CODEX_HOME.
// --layout main (owner decision 2026-10-28, context7 style): the native commands run on a clone of the ref. The marketplace
// entry is a local subfolder source; `plugin list --json` must show it installed and enabled, and the MCP server of the
// installed copy (read back by `mcp list --json`, started in its own cwd) must answer initialize.
function codexMain(env, home, a) {
  const dir = cloneRef(env, home, a, SERVER_KEY);
  const codexHome = path.join(home, ...AGENT_HOME_DIR.codex);
  fs.mkdirSync(codexHome, { recursive: true });
  const cenv = { ...env, CODEX_HOME: codexHome };
  const id = PLUGIN_NAME + PLUGIN_KEY_SEPARATOR + PLUGIN_MARKETPLACE_NAME;
  must(run(cenv, home, "codex", ["plugin", "marketplace", "add", dir]));
  must(run(cenv, home, "codex", ["plugin", "add", id]));
  const listed = JSON.parse(must(run(cenv, home, "codex", ["plugin", "list", "--json"])).out);
  const entry = (listed.installed ?? []).find((p) => p.pluginId === id);
  if (!entry?.installed || !entry.enabled) throw new StepFailed(`codex plugin list --json: ${id} not installed and enabled`);
  if (entry.source?.source !== "local") throw new StepFailed(`codex plugin list --json: ${id} source is ${entry.source?.source}, not local`);
  const servers = JSON.parse(must(run(cenv, home, "codex", ["mcp", "list", "--json"])).out);
  const server = servers.find((s) => s.name === SERVER_KEY);
  if (!server) throw new StepFailed(`codex mcp list --json: ${SERVER_KEY} not listed`);
  const result = handshake(cenv, server.transport.cwd ?? home, server.transport.command, server.transport.args);
  return `installed ${id} ${entry.version ?? ""} from ${entry.source.path}; initialize answered (protocol ${result.protocolVersion})`;
}

function codex(env, home, a) {
  if (a.layout === MAIN_LAYOUT) return codexMain(env, home, a);
  const dir = cloneRef(env, home, a, SERVER_KEY);
  const server = path.join(dir, SERVER_ENTRY_FILE);
  const args = [server, AGENT_ARG, "codex"];
  const codexHome = path.join(home, ...AGENT_HOME_DIR.codex);
  fs.mkdirSync(codexHome, { recursive: true });
  const toml = `[${OWN_MCP_ENTRY.codex.key.join(".")}]\ncommand = ${JSON.stringify(HOST_NODE_COMMAND)}\n`
    + `args = [${args.map((s) => JSON.stringify(s)).join(", ")}]\n`;
  fs.writeFileSync(path.join(codexHome, CONFIG_TOML_FILE), toml);
  const cenv = { ...env, CODEX_HOME: codexHome };
  const listed = JSON.parse(must(run(cenv, home, "codex", ["mcp", "list", "--json"])).out);
  const entry = listed.find((s) => s.name === SERVER_KEY);
  if (entry?.transport?.args?.[0] !== server) throw new StepFailed(`codex mcp list --json: ${SERVER_KEY} entry not read back`);
  const result = handshake(cenv, home, entry.transport.command, entry.transport.args);
  return `codex reads the ${SERVER_KEY} entry; initialize answered (protocol ${result.protocolVersion})`;
}

// gemini (§11.2 step 3): a missing or failing Gemini CLI is SKIPPED, never FAIL (tier-2, GS2).
// --consent answers the install and untrusted-workspace prompts (gemini 0.65 asks "[Y/n]" in a fresh HOME and waits);
// --skip-settings skips the extension settings prompts (D-RN-GEM-1).
function gemini(env, home, a) {
  const r = run(env, home, "gemini", ["extensions", "install", a.repo, "--ref", a.ref, "--auto-update", "--consent", "--skip-settings"]);
  if (!r.ok) return { skipped: "gemini not available" };
  return `gemini extensions install ${a.repo} --ref ${a.ref} passed`;
}

// qwen (MAIN-ONLY): tier-2 like gemini. Installs <clone>:context-mode (the native command, marketplace plugin by name) and
// reads the installed manifest back: the server must run with --agent qwen (the probe found a Claude conversion that did not).
function qwen(env, home, a) {
  const dir = cloneRef(env, home, a, "qwen-src");
  const r = run(env, home, "qwen", ["extensions", "install", `${dir}:${PLUGIN_NAME}`, "--consent"]);
  if (!r.ok) return { skipped: "qwen not available" };
  const manifest = path.join(home, ...QWEN_EXTENSIONS_DIR, PLUGIN_NAME, QWEN_MANIFEST);
  if (!fs.existsSync(manifest)) throw new StepFailed(`qwen extensions install: no ${manifest}`);
  const args = JSON.parse(fs.readFileSync(manifest, "utf8")).mcpServers?.[SERVER_KEY]?.args ?? [];
  if (args[args.indexOf(AGENT_ARG) + 1] !== "qwen" || !args.includes(AGENT_ARG)) throw new StepFailed(`installed ${QWEN_MANIFEST} runs the server with ${args.join(" ")}, not ${AGENT_ARG} qwen`);
  return `qwen extensions install ${PLUGIN_NAME} passed; server runs ${AGENT_ARG} qwen`;
}

const AGENTS = { "claude-code": claudeCode, codex, gemini, qwen };

async function main(a) {
  const step = AGENTS[a.agent];
  if (!step) {
    process.stderr.write(`smoke: unknown --agent ${a.agent}; one of ${Object.keys(AGENTS).join(", ")}\n`);
    process.exit(1);
  }
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `${SERVER_KEY}-smoke-${a.agent}-`)));
  // Windows: cmd.exe (ComSpec), PATHEXT and SystemRoot carry over, or a .cmd shim and the CLIs it starts cannot run.
  const win = Object.fromEntries(WIN_ENV_KEYS.flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : [])));
  const env = { ...win, PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: os.tmpdir() };
  try {
    const res = step(env, home, a);
    if (typeof res === "object") process.stdout.write(`${a.agent}: SKIPPED: ${res.skipped}\n`);
    else process.stdout.write(`${a.agent}: PASS: ${res}\n`);
  } catch (e) {
    if (!(e instanceof StepFailed)) throw e;
    process.stderr.write(`${a.agent}: FAIL: ${e.message}\n`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const { values } = parseArgs({ options: {
  ref: { type: "string", default: RELEASE_BRANCH }, layout: { type: "string", default: "release" }, agent: { type: "string" }, repo: { type: "string", default: RELEASE_REPO_URL },
} });
await main({ ref: values.ref, layout: values.layout, agent: values.agent ?? "", repo: values.repo });
