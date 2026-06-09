/**
 * Issue #801 — Windows `spawnSync npm ENOENT` safety.
 *
 * On Windows, Node's `child_process.spawnSync('npm', args)` without
 * `shell: true` cannot resolve `npm` because the real executable is
 * `npm.cmd` / `npm.exe`. The bare `npm` shell script (from Git Bash's
 * PATH) is not a valid Windows executable for `CreateProcess`.
 *
 * These static-analysis tests assert that every source file in the
 * install/upgrade/boot path uses the Windows-safe pattern:
 *   - `npm.cmd` instead of `npm` on win32
 *   - `npx.cmd` instead of `npx` on win32
 *   - `shell: true` (or `shell: process.platform === "win32"`) when
 *     spawning via execSync/execFileSync/spawn.
 *
 * We use source-code assertions (not subprocess tests) because the
 * Windows-only branches don't execute on macOS/Linux CI runners.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const POSTINSTALL_SRC = readFileSync(
  resolve(ROOT, "scripts", "postinstall.mjs"),
  "utf-8",
);
const START_MJS_SRC = readFileSync(resolve(ROOT, "start.mjs"), "utf-8");

describe("scripts/postinstall.mjs — Windows npm safety (#801)", () => {
  it("uses npm.cmd on Windows for the npm config get prefix call", () => {
    // Must resolve to npm.cmd explicitly, not bare "npm".
    expect(POSTINSTALL_SRC).toMatch(/npmBin\s*=\s*process\.platform\s*===\s*["']win32["']\s*\?\s*["']npm\.cmd["']\s*:\s*["']npm["']/);
  });

  it("passes shell:true on Windows to the npm execSync call", () => {
    // The execSync that runs `npm config get prefix` must have shell enabled
    // on Windows so CreateProcess can resolve the .cmd shim.
    expect(POSTINSTALL_SRC).toMatch(/execSync\(\s*`\$\{npmBin\}\s+config\s+get\s+prefix`\s*,\s*\{[^}]*shell:\s*process\.platform\s*===\s*["']win32["']/);
  });
});

describe("start.mjs — Windows npm/npx safety (#801)", () => {
  it("uses npm.cmd on Windows in the dev fallback block", () => {
    // The dev-mode fallback (server.bundle.mjs missing) must use npm.cmd.
    expect(START_MJS_SRC).toMatch(/NPM_BIN_DEV\s*=\s*IS_WIN32_DEV\s*\?\s*["']npm\.cmd["']\s*:\s*["']npm["']/);
  });

  it("uses npx.cmd on Windows in the dev fallback block", () => {
    expect(START_MJS_SRC).toMatch(/NPX_BIN_DEV\s*=\s*IS_WIN32_DEV\s*\?\s*["']npx\.cmd["']\s*:\s*["']npx["']/);
  });

  it("passes shell:true on Windows to npm install execSync", () => {
    expect(START_MJS_SRC).toMatch(/execSync\(\s*`\$\{NPM_BIN_DEV\}\s+install\s+--silent`\s*,\s*\{[^}]*shell:\s*IS_WIN32_DEV/);
  });

  it("passes shell:true on Windows to npx tsc execSync", () => {
    expect(START_MJS_SRC).toMatch(/execSync\(\s*`\$\{NPX_BIN_DEV\}\s+tsc\s+--silent`\s*,\s*\{[^}]*shell:\s*IS_WIN32_DEV/);
  });
});
