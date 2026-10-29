// ADR-0019 Owner decisions D1, D4, D7 (PO-NPM-2): the npm bin entry. build/build.mjs bundles it as cli.mjs with a node
// shebang; package.json "bin" points here. For now it only routes: --help, --version, server (= server.mjs), hook
// (= hook.mjs) and the v1 forms `hook <platform> <event>` and `mcp` (alias of server), so a v1 hook or MCP entry that
// runs the `context-mode` bin keeps working after `npm i -g context-mode@2`. setup, doctor and upgrade: src/cli/commands.ts.
// The sibling bundles are found from this file's real path (ADR-0019 step 1: never argv[1], npm root -g or PATH).
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentId } from "../core/contracts/agents.ts";
import { AGENT_ARG, SERVER_KEY } from "../core/contracts/constants.ts";
import { ALL_COMMANDS, COMMANDS, HELP_MAIN, suggest, type Command } from "../cli/args.ts";
import { runCommand } from "../cli/commands.ts";
import { isEntry } from "./is-entry.ts";

export { isEntry };

// D7 exit codes (clig.dev): 0 ok, 1 failure, 2 usage error, 130 Ctrl-C.
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;
const EXIT_SIGINT = 130;
const SERVER_FILE = "server.mjs";
const HOOK_FILE = "hook.mjs";
const PACKAGE_FILE = "package.json";

// D4: v1 `context-mode hook <platform> <event>` platform names (docs/v2/spikes/setup/S-V1.md) -> v2 agent id.
export const V1_PLATFORM_AGENT: Readonly<Record<string, AgentId>> = Object.freeze({
  "claude-code": "claude-code",
  codex: "codex",
  "copilot-cli": "copilot-cli",
  "gemini-cli": "gemini",
  kiro: "kiro",
  "qwen-code": "qwen",
  "vscode-copilot": "vscode",
});

export const HELP = HELP_MAIN;

type Route = { kind: "exit"; code: number; stdout?: string; stderr?: string } | { kind: "run"; file: string; args: string[] }
  | { kind: "cmd"; cmd: Command; args: string[] };

// Pure: argv (after `node cli.mjs`) -> what to do. `version` is package.json's version.
export function route(argv: readonly string[], version: string): Route {
  const [cmd, ...rest] = argv;
  if (cmd === "help" && rest[0] !== undefined) {
    // clig.dev: `context-mode help <command>` is the same as `<command> --help`; a topic that is not a command is a typo.
    if ((COMMANDS as readonly string[]).includes(rest[0])) return { kind: "cmd", cmd: rest[0] as Command, args: ["--help"] };
    if (!ALL_COMMANDS.includes(rest[0])) {
      return { kind: "exit", code: EXIT_USAGE, stderr: `${SERVER_KEY}: no help for ${JSON.stringify(rest[0])}.${suggest(rest[0], ALL_COMMANDS)} Run context-mode --help.\n` };
    }
  }
  if (cmd === undefined || cmd === "-h" || cmd === "--help" || cmd === "help") return { kind: "exit", code: EXIT_OK, stdout: HELP };
  if (cmd === "-v" || cmd === "--version") return { kind: "exit", code: EXIT_OK, stdout: version + "\n" };
  if (cmd === "server" || cmd === "mcp") return { kind: "run", file: SERVER_FILE, args: rest };
  if (cmd === "hook") {
    if (rest.includes(AGENT_ARG)) return { kind: "run", file: HOOK_FILE, args: rest };
    const [platform = ""] = rest;
    const agent = Object.hasOwn(V1_PLATFORM_AGENT, platform) ? V1_PLATFORM_AGENT[platform] : undefined;
    // A hook never blocks the host (impl/09 §5.2): an unknown v1 platform fails open, exit 0, empty stdout.
    if (agent === undefined) {
      return { kind: "exit", code: EXIT_OK, stderr: `${SERVER_KEY}: unknown hook platform ${JSON.stringify(platform)}. Fix: run context-mode setup.\n` };
    }
    return { kind: "run", file: HOOK_FILE, args: [AGENT_ARG, agent] };
  }
  if ((COMMANDS as readonly string[]).includes(cmd)) return { kind: "cmd", cmd: cmd as Command, args: rest };
  return { kind: "exit", code: EXIT_USAGE, stderr: `${SERVER_KEY}: unknown command ${JSON.stringify(cmd)}.${suggest(cmd, ALL_COMMANDS)} Run context-mode --help.\n` };
}

function main(): void {
  const dir = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
  let version = "";
  try {
    version = String(JSON.parse(readFileSync(path.join(dir, PACKAGE_FILE), "utf8")).version);
  } catch (err) {
    process.stderr.write(`${SERVER_KEY}: cannot read ${PACKAGE_FILE}: ${(err as Error).message}\n`);
    process.exitCode = EXIT_FAIL;
    return;
  }
  const r = route(process.argv.slice(2), version);
  if (r.kind === "cmd") {
    runCommand(r.cmd, r.args, { pkgDir: dir, version, argv: process.argv.slice(2) })
      .then((code) => { process.exitCode = code; })
      .catch((e: Error) => { process.stderr.write(`${SERVER_KEY}: ${e.stack ?? e.message}\n`); process.exitCode = EXIT_FAIL; });
    return;
  }
  if (r.kind === "exit") {
    if (r.stdout !== undefined) process.stdout.write(r.stdout);
    if (r.stderr !== undefined) process.stderr.write(r.stderr);
    process.exitCode = r.code;
    return;
  }
  const child = spawn(process.execPath, [path.join(dir, r.file), ...r.args], { stdio: "inherit", windowsHide: true });
  // Ctrl-C reaches the child through the terminal's process group; the CLI only waits and reports 130.
  process.on("SIGINT", () => {});
  child.on("error", (err) => {
    process.stderr.write(`${SERVER_KEY}: ${err.message}\n`);
    process.exitCode = EXIT_FAIL;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal === "SIGINT" ? EXIT_SIGINT : code ?? EXIT_FAIL;
  });
}

if (isEntry(import.meta.main, process.argv[1], fileURLToPath(import.meta.url))) main();
