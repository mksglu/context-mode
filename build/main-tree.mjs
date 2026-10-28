#!/usr/bin/env node
// ADR-0023 (D-NI-MAIN-1): writes the files a host's native install command reads from the git repo `main`, from an
// unpacked npm package (the released bytes). The release workflow runs it in the release commit:
//   plugins/claude-code/            the Claude Code plugin (package tree without its own marketplace file;
//                                   SHA256SUMS rewritten for that tree, so ctx_upgrade verifies it)
//   .claude-plugin/marketplace.json source "./plugins/claude-code" (/plugin marketplace add mksglu/context-mode)
//   .agents/plugins/marketplace.json npm entry at this version (codex plugin marketplace add mksglu/context-mode)
//   gemini-extension.json, hooks/hooks.json   Gemini CLI reads the repo root of the tagged release commit (no subfolder
//   qwen-extension.json, hooks/qwen.json       option); Qwen reads the root when installed from the repo. Their paths point
//                                              into the one built copy under plugins/claude-code (D-MO-1).
// Usage: node build/main-tree.mjs --pkg <unpacked package dir> --repo <repo root> --version <x.y.z>
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeHashes } from "./hash.mjs";

const SERVER_KEY = "context-mode";
const PLUGIN_DIR = path.join("plugins", "claude-code");
const PLUGIN_SOURCE = "./plugins/claude-code";
const CLAUDE_MARKETPLACE = path.join(".claude-plugin", "marketplace.json");
const CODEX_MARKETPLACE = path.join(".agents", "plugins", "marketplace.json");

const BUILT_PREFIX = "plugins/claude-code/";
const BUNDLES = ["server.mjs", "hook.mjs"];

// Every string in a manifest that ends a path with a shipped bundle gets the built-copy folder in front of the bundle name.
function repoint(value) {
  if (typeof value === "string") {
    let out = value;
    for (const b of BUNDLES) out = out.split(b).join(BUILT_PREFIX + b);
    return out;
  }
  if (Array.isArray(value)) return value.map(repoint);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, repoint(v)]));
  return value;
}

class MainTreeError extends Error {}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!["--pkg", "--repo", "--version"].includes(key) || value === undefined) throw new MainTreeError("unknown argument " + key);
    out[key.slice(2)] = value;
  }
  for (const key of ["pkg", "repo", "version"]) if (out[key] === undefined) throw new MainTreeError("missing --" + key);
  return out;
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function writeMainTree(pkg, repo, version) {
  const pkgJson = readJson(path.join(pkg, "package.json"));
  if (pkgJson.version !== version) throw new MainTreeError("package version " + pkgJson.version + " is not " + version);
  const pkgMarket = readJson(path.join(pkg, CLAUDE_MARKETPLACE));
  const plugin = path.join(repo, PLUGIN_DIR);
  rmSync(plugin, { recursive: true, force: true });
  cpSync(pkg, plugin, { recursive: true });
  rmSync(path.join(plugin, CLAUDE_MARKETPLACE)); // the marketplace lives at the repo root, not inside the plugin
  writeHashes(plugin);
  writeJson(path.join(repo, CLAUDE_MARKETPLACE), {
    ...pkgMarket,
    plugins: pkgMarket.plugins.map((p) => ({ ...p, source: PLUGIN_SOURCE })),
  });
  writeJson(path.join(repo, "gemini-extension.json"), repoint(readJson(path.join(pkg, "gemini-extension.json"))));
  writeJson(path.join(repo, "hooks", "hooks.json"), repoint(readJson(path.join(pkg, "hooks", "hooks.json"))));
  const qwen = readJson(path.join(pkg, "qwen-extension.json"));
  writeJson(path.join(repo, "qwen-extension.json"), repoint(qwen));
  writeJson(path.join(repo, qwen.hooks), repoint(readJson(path.join(pkg, qwen.hooks))));
  writeJson(path.join(repo, CODEX_MARKETPLACE), {
    name: SERVER_KEY,
    interface: { displayName: SERVER_KEY },
    plugins: [{
      name: SERVER_KEY,
      source: { source: "npm", package: SERVER_KEY, version },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Productivity",
    }],
  });
}

try {
  const { pkg, repo, version } = parseArgs(process.argv.slice(2));
  if (!existsSync(path.join(pkg, "package.json"))) throw new MainTreeError("no package.json in " + pkg);
  writeMainTree(path.resolve(pkg), path.resolve(repo), version);
} catch (err) {
  process.stderr.write("main-tree failed: " + (err && err.message ? err.message : String(err)) + "\n");
  process.exitCode = 1;
}
