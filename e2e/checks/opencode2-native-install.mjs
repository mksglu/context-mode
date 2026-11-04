#!/usr/bin/env node
// e2e/checks/opencode2-native-install.mjs — D-OC2-NATIVE-CMD-1. Runs the OpenCode 2 install, update and remove commands
// that docs/install/opencode.md documents, with the real @opencode/cli (CM_OPENCODE2_DIR/node_modules/@opencode/cli),
// in a temp HOME, and checks exit 0 and the "plugins" entry of opencode.json after each step. Also runs the 1.19 form
// and checks that OpenCode 2 refuses it (the bug this guards). Prints one JSON line; exit 1 on a failed step.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OPENCODE2_INSTALL, OPENCODE2_REMOVE, OPENCODE2_UPDATE } from "../../build/check-install-docs.mjs";

const dir = process.env.CM_OPENCODE2_DIR;
const bin = dir ? path.join(dir, "node_modules", "@opencode", "cli", "bin", "opencode.exe") : undefined;
if (!bin || !existsSync(bin)) {
  console.log(JSON.stringify({ ok: true, skipped: "CM_OPENCODE2_DIR has no @opencode/cli" }));
  process.exit(0);
}
const home = mkdtempSync(path.join(tmpdir(), "cm-oc2-native-"));
const env = { ...process.env, HOME: home, USERPROFILE: home };
for (const k of ["XDG_CONFIG_HOME", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG"]) delete env[k];
const file = path.join(home, ".config", "opencode", "opencode.json");
const steps = [];
const go = (args) => spawnSync(bin, args, { cwd: home, env, encoding: "utf8", timeout: 180000 });
const run = (line) => {
  const args = line.split(" ").slice(1); // the documented line minus the "opencode" word
  let r = go(args);
  let note;
  // A dev machine that already runs its own OpenCode service holds the default port; the command then needs --standalone.
  // A clean CI runner has no such service, so the documented line runs as written there.
  if (r.status !== 0 && `${r.stdout}${r.stderr}`.includes("is already in use by PID")) { r = go([...args, "--standalone"]); note = "retried with --standalone: the default service port is taken on this machine"; }
  const plugins = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).plugins : undefined;
  return { line, exit: r.status, plugins, note, out: `${r.stdout}${r.stderr}`.trim().split("\n").slice(-2).join(" | ") };
};
try {
  const add = run(OPENCODE2_INSTALL);
  steps.push({ ...add, pass: add.exit === 0 && Array.isArray(add.plugins) && add.plugins.includes("context-mode") });
  const upd = run(OPENCODE2_UPDATE);
  steps.push({ ...upd, pass: upd.exit === 0 && Array.isArray(upd.plugins) && upd.plugins.includes("context-mode") });
  const rm = run(OPENCODE2_REMOVE);
  steps.push({ ...rm, pass: rm.exit === 0 && Array.isArray(rm.plugins) && !rm.plugins.includes("context-mode") });
  const old = run("opencode plugin context-mode --global");
  steps.push({ ...old, pass: old.exit !== 0 || old.out.includes("Unknown subcommand") || old.out.includes("Unrecognized flag") });
} finally {
  // Windows keeps a handle on the temp HOME for a moment after the host exits (EPERM on rm); the dir is in the OS temp, so a failed clean-up is not a failed check.
  try { rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* temp dir, left for the OS */ }
}
const ok = steps.every((s) => s.pass);
console.log(JSON.stringify({ ok, steps }));
process.exit(ok ? 0 : 1);
