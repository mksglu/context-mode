// e2e/harness/live/codex.mjs
// Keyless Codex driver (ADR-0012, DECISIONS-r9 R6). Runs `codex exec` with
// a temp CODEX_HOME (symlink to auth.json only) and the exec-only trust
// flags, since no trust prompt exists in `exec` and localhost fixtures
// need network.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function findCodexBinary() {
  for (const dir of (process.env.PATH || "").split(":")) {
    const c = path.join(dir, "codex");
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Temp CODEX_HOME containing only a symlink to the real auth.json, so the
// isolated exec sees the owner's login but not ~/.codex/hooks.json (ADR-0012
// "Codex isolation").
function buildCodexHome() {
  const real = path.join(os.homedir(), ".codex");
  const authSrc = path.join(real, "auth.json");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-e2e-codex-home-"));
  if (fs.existsSync(authSrc)) {
    fs.symlinkSync(authSrc, path.join(tmp, "auth.json"));
  }
  return tmp;
}

/**
 * Runs one keyless `codex exec` turn.
 * @param {{prompt:string, cwd?:string}} opts
 */
export function runCodex(opts) {
  const bin = findCodexBinary();
  if (!bin) return { skipped: true, reason: "codex not installed" };

  const codexHome = buildCodexHome();
  const env = {};
  for (const k of ["PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "TERM"]) {
    if (process.env[k]) env[k] = process.env[k];
  }
  env.CODEX_HOME = codexHome;

  const args = [
    "exec",
    "--ignore-user-config",
    "--dangerously-bypass-hook-trust",
    "-c",
    "sandbox_workspace_write.network_access=true",
    opts.prompt,
  ];

  const r = spawnSync(bin, args, { cwd: opts.cwd ?? process.cwd(), env, encoding: "utf8", timeout: 600000 });
  return { skipped: false, stdout: r.stdout, stderr: r.stderr, status: r.status };
}
