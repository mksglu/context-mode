#!/usr/bin/env node
// scripts/ci-install.mjs — D-CI-INSTALL-1: the CI dev install (npm is dev-only, never shipped).
// Run 40770118933 (windows node 24.15.0): `npm install` exited 1 after 1.7 s with no output, and the repo checks that
// run after a red step (`!cancelled()`) then failed with "Cannot find package 'toml-eslint-parser'". Same silent exit
// in run 40698523886 (setup e2e, windows). This script (1) retries a failed install, (2) prints the npm debug log of
// every failed try, (3) proves each declared package is on disk, so exit 0 with a missing package is also a failure.
// Usage: node scripts/ci-install.mjs [--no-package-lock]. Exit 0 = every declared package is installed.
// D-CI-HOST-INSTALL-1: `node scripts/ci-install.mjs --npm <npm args>` runs one host CLI install (npm i -g <agent CLI>)
// with 3 tries and a growing wait (HOST_WAITS_MS). When npm names a registry 404/5xx or a network fault (ETIMEDOUT,
// ECONNRESET, EAI_AGAIN) for a package that is not ours, one line says so. All 3 tries red is exit 1.
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

// ---------- D-CI-HOST-INSTALL-1: host CLI installs ----------

/** Waits before try 2 and try 3 of a host CLI install. */
export const HOST_WAITS_MS = [15_000, 45_000];
/** Our own npm package names: a fault for one of these is ours to fix, never "not ours". */
export const OWN_PACKAGES = ["context-mode"];
const NET_CODES = ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "ESOCKETTIMEDOUT"];
const REGISTRY = "registry.npmjs.org/";

/** Text between `start` and the first char of `stops` after it, or "" when `start` is absent. */
function cut(text, start, stops) {
  const i = text.indexOf(start);
  if (i < 0) return "";
  let j = i + start.length;
  while (j < text.length && !stops.includes(text[j])) j++;
  return text.slice(i + start.length, j);
}

/** "@aws-sdk%2fmiddleware-websocket" or "@aws-sdk/middleware-websocket/-/x.tgz" -> "@aws-sdk/middleware-websocket". */
function registryName(urlPath) {
  const p = urlPath.split("%2f").join("/").split("%2F").join("/").split("/-/")[0];
  const parts = p.split("/");
  return p.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** "pkg@1.2.3" or "@scope/pkg@1.2.3" -> the name without the version. */
function specName(spec) {
  const at = spec.indexOf("@", 1);
  return at < 0 ? spec : spec.slice(0, at);
}

/**
 * One line naming a registry 404/5xx or a network fault npm printed for a package that is not ours, or null.
 * Reads the npm 10/11 ("npm error") and npm 6-9 ("npm ERR!") forms.
 */
export function registryFault(text, own = OWN_PACKAGES) {
  const t = String(text ?? "").split("npm ERR! ").join("npm error ");
  let code = "";
  for (const line of t.split("\n")) {
    const c = cut(line, "npm error code ", " \r\t").trim();
    if (c) { code = c; break; }
  }
  let status = "";
  for (const line of t.split("\n")) {
    const after = cut(line, "npm error ", "\r\n");
    const head = after.slice(0, 3);
    if (after[3] === " " && head >= "400" && head <= "599" && head.length === 3 && !Number.isNaN(Number(head))) { status = head; break; }
  }
  if (!code && status) code = "E" + status;
  const http = code.startsWith("E") && code.length === 4 && !Number.isNaN(Number(code.slice(1)));
  const n = http ? Number(code.slice(1)) : 0;
  if (!(n === 404 || (n >= 500 && n <= 599) || NET_CODES.includes(code))) return null;
  let name = cut(t, "The requested resource '", "'");
  if (name) name = specName(name.split("@http")[0]);
  if (!name) { const s = cut(t, "404 '", "'"); if (s) name = specName(s); }
  if (!name) { const u = cut(t, "GET https://" + REGISTRY, " \r\n'"); if (u) name = registryName(u); }
  if (!name) { const u = cut(t, "request to https://" + REGISTRY, " \r\n'"); if (u) name = registryName(u); }
  if (!name) return "npm registry fault " + code + " (package not named), not a context-mode package";
  if (own.includes(name)) return null;
  return "npm registry fault " + code + " for " + name + ", not a context-mode package";
}

/** Sync wait (host installs run in sync scripts too). */
export function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/**
 * Run `attempt()` up to waits.length + 1 times; attempt returns { ok, text }. Between tries it waits waits[i].
 * Logs one line per red try, plus the registryFault line when npm named one. Returns { ok, tries, fault, text }.
 */
export function retryHostInstall({ label, attempt, waits = HOST_WAITS_MS, sleep = sleepSync, log = console.error }) {
  const tries = waits.length + 1;
  let last = { ok: false, text: "" };
  let fault = null;
  for (let k = 1; k <= tries; k++) {
    last = attempt(k);
    if (last.ok) return { ok: true, tries: k, fault, text: last.text };
    const f = registryFault(last.text);
    if (f) fault = f;
    log("ci-install: " + label + " try " + k + "/" + tries + " failed" + (f ? ": " + f : "") + (k < tries ? ", next try in " + waits[k - 1] / 1000 + " s" : ""));
    if (k < tries) sleep(waits[k - 1]);
  }
  return { ok: false, tries, fault, text: last.text };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--npm") {
  const args = process.argv.slice(3);
  const r = retryHostInstall({
    label: "npm " + args.join(" "),
    attempt: () => {
      // Windows: npm is npm.cmd, which Node 24 only starts through a shell. The argv is the fixed text of a ci.yml step.
      const p = spawnSync("npm", args, { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8", shell: process.platform === "win32" });
      if (p.stderr) process.stderr.write(p.stderr);
      return { ok: p.status === 0, text: String(p.stderr ?? "") + (p.error ? " " + p.error.message : "") };
    },
  });
  process.exit(r.ok ? 0 : 1);
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
