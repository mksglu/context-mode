#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import Module from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginRoot = resolve(__dirname, "..");
const resolverKey = Symbol.for("context-mode.codexVendorResolver");

function vendorPaths(root = pluginRoot) {
  const vendorRoot = resolve(root, ".codex-plugin", "vendor");
  return {
    turndown: resolve(vendorRoot, "turndown.cjs"),
    "turndown-plugin-gfm": resolve(vendorRoot, "turndown-plugin-gfm.cjs"),
  };
}

export function assertCodexPluginArtifact(root = pluginRoot) {
  const required = [
    resolve(root, "server.bundle.mjs"),
    ...Object.values(vendorPaths(root)),
  ];
  return required.filter((path) => !existsSync(path));
}

export function installCodexVendorResolver(root = pluginRoot) {
  const normalizedRoot = resolve(root);
  const existing = Module[resolverKey];
  if (existing?.root === normalizedRoot) {
    return existing.handle;
  }
  if (existing?.handle) {
    existing.handle.restore();
  }

  const map = vendorPaths(normalizedRoot);
  const originalResolve = Module._resolveFilename;
  let restored = false;

  const handle = {
    map,
    restore() {
      if (restored) return;
      restored = true;
      Module._resolveFilename = originalResolve;
      if (Module[resolverKey]?.handle === handle) {
        delete Module[resolverKey];
      }
    },
  };

  Module._resolveFilename = function resolveCodexVendor(request, parent, isMain, options) {
    if (Object.prototype.hasOwnProperty.call(map, request)) {
      return map[request];
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
  Module[resolverKey] = { root: normalizedRoot, handle };
  return handle;
}

function failIncomplete(missing) {
  process.stderr.write(
    [
      "CONTEXT_MODE_CODEX_PLUGIN_INCOMPLETE",
      `Plugin root: ${pluginRoot}`,
      "Missing:",
      ...missing.map((path) => `  - ${path}`),
      "Fix: reinstall or update the Codex marketplace plugin.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

async function reexecWithBunIfAvailable() {
  if (typeof globalThis.Bun !== "undefined" || process.platform !== "linux") return;
  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", "bun") : null,
    join(homedir(), ".bun", "bin", "bun"),
    "/usr/local/bin/bun",
    "/usr/bin/bun",
  ].filter(Boolean);
  const bunBin = candidates.find((path) => existsSync(path));
  if (!bunBin) return;

  const child = spawn(bunBin, [__filename], {
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
  });
  process.stdin.on("data", (chunk) => {
    if (!child.stdin.destroyed) child.stdin.write(chunk);
  });
  process.stdin.on("end", () => {});
  const keepAlive = setInterval(() => {}, 2147483647);
  child.on("exit", (code) => {
    clearInterval(keepAlive);
    process.exit(code ?? 0);
  });
  process.stdin.resume();
  await new Promise(() => {});
}

async function main() {
  await reexecWithBunIfAvailable();
  process.chdir(pluginRoot);
  process.env.CONTEXT_MODE_CODEX_MARKETPLACE = "1";
  if (!process.env.CONTEXT_MODE_PROJECT_DIR) {
    process.env.CONTEXT_MODE_PROJECT_DIR = pluginRoot;
  }

  const missing = assertCodexPluginArtifact(pluginRoot);
  if (missing.length > 0) failIncomplete(missing);

  installCodexVendorResolver(pluginRoot);
  await import(pathToFileURL(resolve(pluginRoot, "server.bundle.mjs")).href);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    process.stderr.write(`[codex-plugin/plugin-start.mjs] ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
