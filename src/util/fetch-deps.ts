/**
 * Runtime npm dependencies behind ctx_fetch_and_index (HTML → Markdown).
 *
 * server.bundle.mjs and cli.bundle.mjs leave these external, so they resolve
 * from the plugin root's node_modules. start.mjs installs them in the
 * background at boot, and that install used to fail silently. This module lets
 * `ctx doctor` report what is missing, why the last install failed, and the
 * command that fixes it (#1280).
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FETCH_DEPENDENCIES = ["turndown", "turndown-plugin-gfm", "@mixmark-io/domino"] as const;

/** Log that the boot-time installer in start.mjs writes npm output to. Keep in sync. */
export const DEPS_INSTALL_LOG = "deps-install.log";

/**
 * Resolve a fetch dependency, or throw an error that says how to fix it.
 * `resolve` is injected so the failure path can be tested.
 */
export function requireFetchDependency(name: string, resolve: (id: string) => string): string {
  try {
    return resolve(name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw err;
    throw new Error(
      `ctx_fetch_and_index needs "${name}", which is not installed. Run "ctx doctor" for the install command.`,
    );
  }
}

/** Fetch dependencies that cannot be resolved from the plugin root. */
export function findMissingFetchDependencies(pluginRoot: string): string[] {
  const req = createRequire(join(pluginRoot, "package.json"));
  return FETCH_DEPENDENCIES.filter((name) => {
    try {
      req.resolve(name);
      return false;
    } catch {
      return true;
    }
  });
}

/** npm command that installs the fetch dependencies into the plugin root. */
export function fetchDependencyInstallCommand(pluginRoot: string): string {
  return `npm install --prefix "${pluginRoot}" --no-save --no-package-lock ${FETCH_DEPENDENCIES.join(" ")}`;
}

const INSTALL_ERROR_LINE = /\bnpm error code\b|\b(EACCES|EEXIST|EPERM|ENOENT|ECONNREFUSED|ENOTFOUND|ETIMEDOUT)\b/;

/**
 * Distinct root-cause lines from the last boot-time install attempt (error codes
 * such as EACCES or ECONNREFUSED), first occurrences first. Generic npm footers
 * are skipped so the cause is not cut off.
 */
export function readDepsInstallErrors(pluginRoot: string, maxLines = 3): string[] {
  const logPath = join(pluginRoot, DEPS_INSTALL_LOG);
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => INSTALL_ERROR_LINE.test(line));
  return [...new Set(lines)].slice(0, maxLines);
}
