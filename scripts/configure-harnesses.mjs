#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const hermesHome = path.resolve(process.env.HERMES_HOME || path.join(home, ".hermes"));
const ompRoot = path.resolve(process.env.OMP_HOME || path.join(home, ".omp"));
const ompAgentHome = path.resolve(process.env.OMP_AGENT_DIR || path.join(ompRoot, "agent"));
const serverEntry = path.join(root, "server.bundle.mjs");
const cliEntry = path.join(root, "cli.bundle.mjs");
const pluginSource = path.join(root, "integrations", "hermes-plugin");
const backupRoot = path.join(home, ".local", "state", "context-mode", "backups");
const legacyPlugin = "hermes-context-mode";
const retiredSkillNames = ["context-mode", "ctx-mode", "context-mode-enforcement", "context-mode-integration"];
const missing = Symbol("missing");
let backupStamp = "";

function usage() {
  return `Usage: bun scripts/configure-harnesses.mjs [install|uninstall] [options]

  --target hermes|omp|all  target client; repeatable (default: all)
  --dry-run                print operations without writing
  --help                   show this help

Environment: HERMES_HOME, OMP_HOME, OMP_AGENT_DIR`;
}

function parseArgs(argv) {
  const options = { action: "install", targets: [], dryRun: false };
  const args = [...argv];
  if (["install", "uninstall"].includes(args[0])) options.action = args.shift();
  while (args.length) {
    const argument = args.shift();
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--target") options.targets.push(String(args.shift() || ""));
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!options.targets.length || options.targets.includes("all")) options.targets = ["hermes", "omp"];
  options.targets = [...new Set(options.targets)];
  const invalid = options.targets.filter((target) => !["hermes", "omp"].includes(target));
  if (invalid.length) throw new Error(`Unknown target: ${invalid.join(", ")}`);
  return options;
}

const options = parseArgs(process.argv.slice(2));

function log(message) {
  process.stdout.write(`${options.dryRun ? "[dry-run] " : ""}${message}\n`);
}

function commandPath(name) {
  try {
    return execFileSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function run(command, args, environment = {}, capture = false) {
  log(`run ${[command, ...args].map((value) => JSON.stringify(value)).join(" ")}`);
  if (options.dryRun) return "";
  return execFileSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  })?.toString() || "";
}

function readJson(file, fallback = {}) {
  if (!existsSync(file)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot parse JSON ${file}: ${cause.message}`);
  }
}

function backup(file) {
  if (!existsSync(file) || options.dryRun) return "";
  if (!backupStamp) backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = path.resolve(file).replace(/^[/\\]+/, "").replace(/:/g, "");
  const destination = path.join(backupRoot, backupStamp, relative);
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(file, destination);
  return destination;
}

function backupMove(source) {
  if (!existsSync(source) && !lstatSafe(source)?.isSymbolicLink()) return;
  if (!backupStamp) backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = path.resolve(source).replace(/^[/\\]+/, "").replace(/:/g, "");
  const destination = path.join(backupRoot, backupStamp, relative);
  log(`retire ${source} -> ${destination}`);
  if (options.dryRun) return;
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  renameSync(source, destination);
}

function atomicWrite(file, content, mode = 0o600) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (existing === normalized) {
    log(`unchanged ${file}`);
    return;
  }
  log(`${existing === null ? "create" : "update"} ${file}`);
  if (options.dryRun) return;
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  backup(file);
  const temporary = `${file}.context-mode-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(temporary, normalized, { mode });
  renameSync(temporary, file);
  chmodSync(file, mode);
}

function lstatSafe(file) {
  try {
    return lstatSync(file);
  } catch {
    return null;
  }
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function hermesArgs(profile, args) {
  return profile.name === "default" ? args : ["--profile", profile.name, ...args];
}

function hermesEnvironment(profile) {
  return { HERMES_HOME: profile.directory };
}

function hermesGet(hermes, profile, key, fallback = null) {
  try {
    const text = execFileSync(
      hermes,
      hermesArgs(profile, ["config", "get", "--json", key]),
      { encoding: "utf8", env: { ...process.env, ...hermesEnvironment(profile) }, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function hermesSet(hermes, profile, key, value) {
  run(
    hermes,
    hermesArgs(profile, ["config", "set", "--force", key, JSON.stringify(value)]),
    hermesEnvironment(profile),
  );
}

function hermesUnset(hermes, profile, key) {
  if (hermesGet(hermes, profile, key, missing) === missing) return;
  run(hermes, hermesArgs(profile, ["config", "unset", key]), hermesEnvironment(profile));
}

function hermesProfiles() {
  const profiles = [{ name: "default", directory: hermesHome }];
  const profilesRoot = path.join(hermesHome, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      const directory = path.join(profilesRoot, entry.name);
      if (entry.isDirectory() && existsSync(path.join(directory, "config.yaml"))) {
        profiles.push({ name: entry.name, directory });
      }
    }
  }
  return profiles;
}

function isPrivateHermesProfile(hermes, profile) {
  return hermesGet(hermes, profile, "mcp_servers.librarian-okf", missing) !== missing;
}

function normalizeHermesConfig(hermes, profile, enabled) {
  const enabledPlugins = hermesGet(hermes, profile, "plugins.enabled", []);
  const disabledPlugins = hermesGet(hermes, profile, "plugins.disabled", []);
  const disabledSkills = hermesGet(hermes, profile, "skills.disabled", []);
  const nextEnabled = Array.isArray(enabledPlugins)
    ? enabledPlugins.filter((name) => name !== legacyPlugin && name !== "context-mode")
    : [];
  if (enabled) nextEnabled.push("context-mode");
  hermesSet(hermes, profile, "plugins.enabled", [...new Set(nextEnabled)]);
  hermesSet(
    hermes,
    profile,
    "plugins.disabled",
    Array.isArray(disabledPlugins)
      ? disabledPlugins.filter((name) => name !== legacyPlugin && name !== "context-mode")
      : [],
  );
  if (Array.isArray(disabledSkills)) {
    hermesSet(
      hermes,
      profile,
      "skills.disabled",
      disabledSkills.filter((name) => !retiredSkillNames.includes(name)),
    );
  }
  hermesUnset(hermes, profile, `plugins.entries.${legacyPlugin}`);
  hermesUnset(hermes, profile, "plugins.entries.context-mode");
}

function retireHermesSkills(profile) {
  for (const name of retiredSkillNames) {
    const candidate = path.join(profile.directory, "skills", name);
    if (lstatSafe(candidate)) backupMove(candidate);
  }
}

function pluginIsPinned(profile, revision) {
  const metadata = readJson(path.join(profile.directory, "plugins", ".install-metadata.json"), {});
  const record = metadata["context-mode"];
  const installed = path.join(profile.directory, "plugins", "context-mode");
  return Boolean(
    record?.pinned === true &&
      record?.revision === revision &&
      existsSync(path.join(installed, "__init__.py")) &&
      existsSync(path.join(installed, "plugin.yaml")) &&
      sha256(path.join(installed, "__init__.py")) === sha256(path.join(pluginSource, "__init__.py")) &&
      sha256(path.join(installed, "plugin.yaml")) === sha256(path.join(pluginSource, "plugin.yaml")),
  );
}

function installHermes() {
  const hermes = commandPath("hermes");
  if (!hermes) throw new Error("Hermes is not on PATH; its native plugin and configuration commands are required.");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const pluginIdentifier = `${pathToFileURL(root).href}#integrations/hermes-plugin`;
  for (const profile of hermesProfiles()) {
    retireHermesSkills(profile);
    if (isPrivateHermesProfile(hermes, profile)) {
      const installed = path.join(profile.directory, "plugins", "context-mode");
      if (lstatSafe(installed)) {
        run(hermes, hermesArgs(profile, ["plugins", "remove", "context-mode"]), hermesEnvironment(profile));
      }
      hermesUnset(hermes, profile, "mcp_servers.context-mode");
      normalizeHermesConfig(hermes, profile, false);
      log(`isolated hermes:${profile.name} (Context Mode excluded)`);
      continue;
    }

    if (!pluginIsPinned(profile, revision)) {
      run(
        hermes,
        hermesArgs(profile, [
          "plugins",
          "install",
          pluginIdentifier,
          "--force",
          "--enable",
          "--ref",
          revision,
        ]),
        hermesEnvironment(profile),
      );
    } else {
      log(`unchanged hermes-plugin:${profile.name} (${revision.slice(0, 8)})`);
    }
    run(
      hermes,
      hermesArgs(profile, ["plugins", "enable", "context-mode", "--no-allow-tool-override"]),
      hermesEnvironment(profile),
    );
    normalizeHermesConfig(hermes, profile, true);
    hermesSet(hermes, profile, "mcp_servers.context-mode", {
      command: commandPath("bun"),
      args: [serverEntry],
      cwd: root,
      env: { CONTEXT_MODE_PLATFORM: "hermes", HERMES_HOME: profile.directory },
      enabled: true,
    });
    log(`integrated hermes:${profile.name} (native plugin + MCP)`);
  }
}

function uninstallHermes() {
  const hermes = commandPath("hermes");
  if (!hermes) throw new Error("Hermes is not on PATH.");
  for (const profile of hermesProfiles()) {
    retireHermesSkills(profile);
    const installed = path.join(profile.directory, "plugins", "context-mode");
    if (lstatSafe(installed)) {
      run(hermes, hermesArgs(profile, ["plugins", "remove", "context-mode"]), hermesEnvironment(profile));
    }
    hermesUnset(hermes, profile, "mcp_servers.context-mode");
    normalizeHermesConfig(hermes, profile, false);
    log(`removed hermes:${profile.name}`);
  }
}

function isOrdinaryOmpConfig(config) {
  const servers = config?.mcpServers;
  if (!servers || typeof servers !== "object" || Object.hasOwn(servers, "librarian-okf")) return false;
  return ["retrieval", "camofox", "localflame", "context-mode", "codebase-memory-mcp"]
    .some((name) => Object.hasOwn(servers, name));
}

function ompAgentDirectories({ configuredOnly = false } = {}) {
  const directories = [ompAgentHome];
  const profilesRoot = path.join(ompRoot, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(profilesRoot, entry.name, "agent");
      const file = path.join(directory, "mcp.json");
      if (!existsSync(file)) continue;
      const config = readJson(file, {});
      if (isOrdinaryOmpConfig(config)) directories.push(directory);
    }
  }
  return [...new Set(directories.map((directory) => path.resolve(directory)))].filter((directory) => {
    if (!configuredOnly) return true;
    return Boolean(readJson(path.join(directory, "mcp.json"), {}).mcpServers?.["context-mode"]);
  });
}

function installOmp() {
  const omp = commandPath("omp");
  if (!omp) throw new Error("OMP is not on PATH; its native plugin command is required.");
  run(omp, ["plugin", "link", root, "--scope", "user", "--force"]);
  for (const directory of ompAgentDirectories()) {
    const file = path.join(directory, "mcp.json");
    const config = readJson(file, {
      $schema: "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
      mcpServers: {},
    });
    config.mcpServers = config.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {};
    config.mcpServers["context-mode"] = {
      type: "stdio",
      command: commandPath("bun"),
      args: [serverEntry],
      cwd: root,
    };
    atomicWrite(file, JSON.stringify(config, null, 2));
    log(`integrated omp:${directory} (native plugin + MCP)`);
  }
}

function uninstallOmp() {
  const omp = commandPath("omp");
  if (!omp) throw new Error("OMP is not on PATH.");
  for (const directory of ompAgentDirectories({ configuredOnly: true })) {
    const file = path.join(directory, "mcp.json");
    const config = readJson(file, {});
    if (config.mcpServers && typeof config.mcpServers === "object") {
      delete config.mcpServers["context-mode"];
      atomicWrite(file, JSON.stringify(config, null, 2));
    }
  }
  run(omp, ["plugin", "uninstall", "context-mode", "--scope", "user"]);
}

if (!existsSync(serverEntry) || !existsSync(cliEntry)) {
  throw new Error("Build artifacts are missing. Run bun run build before integration.");
}
if (!existsSync(path.join(pluginSource, "__init__.py")) || !existsSync(path.join(pluginSource, "plugin.yaml"))) {
  throw new Error("The minimal Hermes plugin package is missing.");
}

for (const target of options.targets) {
  if (target === "hermes") {
    if (options.action === "install") installHermes();
    else uninstallHermes();
  } else if (target === "omp") {
    if (options.action === "install") installOmp();
    else uninstallOmp();
  }
}
