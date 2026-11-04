// e2e/harness/live/claude-code.mjs
// Keyless Claude Code driver (ADR-0012). Spawns the real `claude` binary,
// never the claude-worktree shim, with an allow-listed env.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// real Claude Code binary only: Mach-O or ELF magic bytes (ADR-0012 traps).
export function findRealClaudeBinary() {
  for (const dir of (process.env.PATH || "").split(":")) {
    const c = path.join(dir, "claude");
    if (!fs.existsSync(c)) continue;
    let real;
    try {
      real = fs.realpathSync(c);
    } catch {
      continue;
    }
    const fd = fs.openSync(real, "r");
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, 0);
    fs.closeSync(fd);
    const magic = b.toString("hex");
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(magic)) return real;
  }
  return null;
}

export function buildKeylessEnv(extra = {}) {
  const env = {};
  for (const k of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM"]) {
    if (process.env[k]) env[k] = process.env[k];
  }
  Object.assign(env, {
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
  }, extra);
  return env;
}

/**
 * Runs one keyless `claude -p` turn.
 * @param {{prompt:string, model?:string, effort?:string, budgetUsd?:string|number, cwd?:string, tools?:string[]}} opts
 */
export function runClaudeCode(opts) {
  const bin = findRealClaudeBinary();
  if (!bin) return { skipped: true, reason: "no real claude binary on PATH" };

  const model = opts.model ?? "claude-sonnet-5";
  const effort = opts.effort ?? "low";
  const budget = String(opts.budgetUsd ?? "0.25");
  const env = buildKeylessEnv();

  const args = [
    "-p",
    opts.prompt,
    "--model",
    model,
    "--effort",
    effort,
    "--max-budget-usd",
    budget,
    "--no-session-persistence",
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--output-format",
    "json",
  ];
  if (opts.tools && opts.tools.length) args.push("--allowedTools", ...opts.tools);
  else args.push("--tools", "");

  const r = spawnSync(bin, args, { cwd: opts.cwd ?? process.cwd(), env, encoding: "utf8", timeout: 600000 });
  let res;
  try {
    res = JSON.parse(r.stdout);
  } catch {
    res = { is_error: true, result: (r.stderr || r.stdout || "").slice(0, 200) };
  }
  return { skipped: false, result: res };
}
