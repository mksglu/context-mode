#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const hermesHome = path.resolve(process.env.HERMES_HOME || path.join(home, ".hermes"));
const ompRoot = path.resolve(process.env.OMP_HOME || path.join(home, ".omp"));
const ompAgentHome = path.resolve(process.env.OMP_AGENT_DIR || path.join(ompRoot, "agent"));
const serverEntry = path.join(root, "server.bundle.mjs");
const pluginSource = path.join(root, "integrations", "hermes-plugin");
const retiredSkillNames = ["context-mode", "ctx-mode", "context-mode-enforcement", "context-mode-integration"];

function parseArgs(argv) {
  const options = { targets: [] };
  const args = [...argv];
  while (args.length) {
    const argument = args.shift();
    if (argument === "--target") options.targets.push(String(args.shift() || ""));
    else if (argument === "--dry-run") continue;
    else if (argument === "--help" || argument === "-h") {
      console.log("Usage: bun scripts/doctor-harnesses.mjs [--target hermes|omp|all]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (!options.targets.length || options.targets.includes("all")) options.targets = ["hermes", "omp"];
  options.targets = [...new Set(options.targets)];
  return options;
}

const options = parseArgs(process.argv.slice(2));
let checks = 0;
let failures = 0;

function check(condition, message, detail = "") {
  checks += 1;
  if (condition) console.log(`ok ${checks} - ${message}`);
  else {
    failures += 1;
    console.error(`not ok ${checks} - ${message}${detail ? `: ${detail}` : ""}`);
  }
}

function commandPath(name) {
  try {
    return execFileSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function run(command, args, environment = {}) {
  try {
    return {
      ok: true,
      text: execFileSync(command, args, {
        cwd: root,
        env: { ...process.env, ...environment },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (cause) {
    return { ok: false, text: `${cause.stdout || ""}${cause.stderr || ""}${cause.message || ""}` };
  }
}

function getJson(file, fallback = {}) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return structuredClone(fallback);
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

function hermesGet(hermes, profile, key, fallback = undefined) {
  const result = run(hermes, hermesArgs(profile, ["config", "get", "--json", key]), hermesEnvironment(profile));
  if (!result.ok) return fallback;
  try {
    return JSON.parse(result.text.trim());
  } catch {
    return fallback;
  }
}

function hermesProfiles() {
  const profiles = [{ name: "default", directory: hermesHome }];
  const profilesRoot = path.join(hermesHome, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      const directory = path.join(profilesRoot, entry.name);
      if (entry.isDirectory() && existsSync(path.join(directory, "config.yaml"))) profiles.push({ name: entry.name, directory });
    }
  }
  return profiles;
}

function isPrivateHermesProfile(hermes, profile) {
  return hermesGet(hermes, profile, "mcp_servers.librarian-okf", undefined) !== undefined;
}

function checkHermes() {
  const hermes = commandPath("hermes");
  check(Boolean(hermes), "Hermes native CLI is available");
  if (!hermes) return;
  for (const profile of hermesProfiles()) {
    const label = `hermes:${profile.name}`;
    const isolated = isPrivateHermesProfile(hermes, profile);
    const mcp = hermesGet(hermes, profile, "mcp_servers.context-mode", undefined);
    const pluginDir = path.join(profile.directory, "plugins", "context-mode");
    const enabled = hermesGet(hermes, profile, "plugins.enabled", []);
    const disabled = hermesGet(hermes, profile, "plugins.disabled", []);
    const entries = hermesGet(hermes, profile, "plugins.entries", {});
    const staleSkills = retiredSkillNames.filter((name) => {
      try {
        return Boolean(lstatSync(path.join(profile.directory, "skills", name)));
      } catch {
        return false;
      }
    });

    check(staleSkills.length === 0, `${label} has no stale Context Mode skills`, staleSkills.join(", "));
    check(!enabled.includes("hermes-context-mode") && !disabled.includes("hermes-context-mode"), `${label} has no legacy plugin selector`);
    check(!Object.hasOwn(entries || {}, "hermes-context-mode"), `${label} has no legacy plugin permission entry`);
    check(!Object.hasOwn(entries || {}, "context-mode"), `${label} grants no unnecessary tool override`);

    if (isolated) {
      check(mcp === undefined, `${label} excludes the general Context Mode MCP`);
      check(!existsSync(pluginDir), `${label} excludes the general Context Mode plugin`);
      check(!enabled.includes("context-mode"), `${label} does not enable Context Mode`);
      continue;
    }

    check(mcp?.command === commandPath("bun"), `${label} uses Bun/Sandwich for the MCP`);
    check(Array.isArray(mcp?.args) && mcp.args.length === 1 && path.resolve(mcp.args[0]) === serverEntry, `${label} pins the checked-out MCP bundle`);
    check(mcp?.cwd === root && mcp?.enabled === true, `${label} MCP is enabled from the checked-out repository`);
    check(mcp?.env?.CONTEXT_MODE_PLATFORM === "hermes" && path.resolve(mcp?.env?.HERMES_HOME || "") === profile.directory, `${label} MCP has profile-correct environment`);
    check(existsSync(pluginDir), `${label} native plugin is installed`);
    if (existsSync(pluginDir)) {
      check(sha256(path.join(pluginDir, "__init__.py")) === sha256(path.join(pluginSource, "__init__.py")), `${label} plugin control plane matches source`);
      check(sha256(path.join(pluginDir, "plugin.yaml")) === sha256(path.join(pluginSource, "plugin.yaml")), `${label} plugin manifest matches source`);
    }
    check(enabled.includes("context-mode") && !disabled.includes("context-mode"), `${label} native plugin is enabled`);
    const pluginList = run(hermes, hermesArgs(profile, ["plugins", "list", "--plain", "--no-bundled"]), hermesEnvironment(profile));
    check(pluginList.ok && /^enabled\s+user\s+\S+\s+context-mode$/m.test(pluginList.text), `${label} native plugin registry resolves Context Mode`, pluginList.text.trim());
    const pluginDoctor = run(hermes, hermesArgs(profile, ["plugins", "doctor", "context-mode", "--ci"]), hermesEnvironment(profile));
    check(pluginDoctor.ok, `${label} native plugin doctor passes`, pluginDoctor.text.trim());
    const mcpList = run(hermes, hermesArgs(profile, ["mcp", "list"]), hermesEnvironment(profile));
    check(mcpList.ok && /context-mode/.test(mcpList.text), `${label} native MCP registry lists Context Mode`, mcpList.text.trim());
    const tools = run(hermes, hermesArgs(profile, ["tools", "list"]), hermesEnvironment(profile));
    check(tools.ok && /context-mode/.test(tools.text) && !/context-mode[^\n]*disabled/i.test(tools.text), `${label} Context Mode tools are available`, tools.text.trim());
  }
}

function isOrdinaryOmpConfig(config) {
  const servers = config?.mcpServers;
  if (!servers || typeof servers !== "object" || Object.hasOwn(servers, "librarian-okf")) return false;
  return ["retrieval", "camofox", "localflame", "context-mode", "codebase-memory-mcp"]
    .some((name) => Object.hasOwn(servers, name));
}

function ompAgentDirectories() {
  const directories = [ompAgentHome];
  const profilesRoot = path.join(ompRoot, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(profilesRoot, entry.name, "agent");
      const file = path.join(directory, "mcp.json");
      if (existsSync(file) && isOrdinaryOmpConfig(getJson(file, {}))) directories.push(directory);
    }
  }
  return [...new Set(directories.map((directory) => path.resolve(directory)))];
}

function checkOmp() {
  const omp = commandPath("omp");
  check(Boolean(omp), "OMP native CLI is available");
  if (!omp) return;
  const plugins = run(omp, ["plugin", "list"]);
  check(plugins.ok && /context-mode@/.test(plugins.text), "OMP native plugin registry lists Context Mode", plugins.text.trim());
  const linked = path.join(ompRoot, "plugins", "node_modules", "context-mode");
  check(existsSync(linked) && realpathSync(linked) === root, "OMP plugin link targets the checked-out repository");
  const pluginDoctor = run(omp, ["plugin", "doctor", "context-mode"]);
  check(pluginDoctor.ok, "OMP native plugin doctor passes", pluginDoctor.text.trim());
  for (const directory of ompAgentDirectories()) {
    const label = `omp:${directory}`;
    const mcp = getJson(path.join(directory, "mcp.json"), {}).mcpServers?.["context-mode"];
    check(mcp?.type === "stdio" && mcp?.command === commandPath("bun"), `${label} uses Bun/Sandwich stdio`);
    check(Array.isArray(mcp?.args) && mcp.args.length === 1 && path.resolve(mcp.args[0]) === serverEntry, `${label} pins the checked-out MCP bundle`);
    check(mcp?.cwd === root, `${label} runs from the checked-out repository`);
  }
}

check(existsSync(serverEntry), "MCP bundle exists");
check(existsSync(path.join(root, "cli.bundle.mjs")), "CLI bundle exists");
check(existsSync(path.join(pluginSource, "__init__.py")), "minimal Hermes plugin package exists");
check(existsSync(path.join(pluginSource, "plugin.yaml")), "minimal Hermes plugin manifest exists");
check(sha256(path.join(root, "__init__.py")) === sha256(path.join(pluginSource, "__init__.py")), "Hermes plugin copies are byte-identical");
check(sha256(path.join(root, "plugin.yaml")) === sha256(path.join(pluginSource, "plugin.yaml")), "Hermes manifests are byte-identical");

if (options.targets.includes("hermes")) checkHermes();
if (options.targets.includes("omp")) checkOmp();

console.log(`1..${checks}`);
console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
