#!/usr/bin/env node
// scripts/ci-install.mjs — D-CI-INSTALL-1: the CI dev install (npm is dev-only, never shipped).
// Run 40770118933 (windows node 24.15.0): `npm install` exited 1 after 1.7 s with no output, and the repo checks that
// run after a red step (`!cancelled()`) then failed with "Cannot find package 'toml-eslint-parser'". Same silent exit
// in run 40698523886 (setup e2e, windows). This script (1) retries a failed install, (2) prints the npm debug log of
// every failed try, (3) proves each declared package is on disk, so exit 0 with a missing package is also a failure.
// Usage: node scripts/ci-install.mjs [--no-package-lock]. Exit 0 = every declared package is installed.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Declared dependency names (dependencies + devDependencies) with no node_modules/<name>/package.json. */
export function missingPackages(root) {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  return names.filter((n) => !existsSync(path.join(root, "node_modules", ...n.split("/"), "package.json"))).sort();
}

/** Full text of the newest npm debug log, or "" when none can be found. */
function lastNpmDebugLog() {
  const cache = spawnSync("npm", ["config", "get", "cache"], { encoding: "utf8", shell: process.platform === "win32" });
  const dir = path.join(String(cache.stdout).trim(), "_logs");
  if (!existsSync(dir)) return "";
  const logs = readdirSync(dir).filter((f) => f.endsWith(".log")).sort();
  return logs.length === 0 ? "" : readFileSync(path.join(dir, logs[logs.length - 1]), "utf8");
}

export async function installWithRetry({ root, run, attempts = 3, sleep, log = console.error }) {
  for (let n = 1; n <= attempts; n++) {
    const code = await run();
    const missing = code === 0 ? missingPackages(root) : [];
    if (code === 0 && missing.length === 0) return { ok: true, attempts: n };
    log(`ci-install: try ${n}/${attempts} failed: ${code !== 0 ? `npm exit ${code}` : `exit 0 but not on disk: ${missing.join(", ")}`}`);
    if (n < attempts) await sleep(5000 * n);
  }
  return { ok: false, attempts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = ["install", ...process.argv.slice(2)];
  const run = () => {
    // Windows: npm is npm.cmd, which Node 24 only starts through a shell. The argv is fixed text, no user input.
    const r = spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) {
      console.error(`ci-install: npm status ${r.status} signal ${r.signal} error ${r.error?.message ?? "none"}`);
      console.error(lastNpmDebugLog());
    }
    return r.status ?? 1;
  };
  const r = await installWithRetry({ root, run, sleep: (ms) => new Promise((res) => setTimeout(res, ms)) });
  process.exit(r.ok ? 0 : 1);
}
