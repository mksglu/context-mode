import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveClaudeConfigDir } from "../util/claude-config.js";

/** Resolve the Claude Code session that owns this MCP process, if available. */
export function resolveCallerSessionId(opts: {
  env?: NodeJS.ProcessEnv;
  parentPid?: number;
  configDir?: string;
} = {}): string | undefined {
  const env = opts.env ?? process.env;
  if (env.CLAUDE_SESSION_ID) return env.CLAUDE_SESSION_ID;

  // Claude Code updates this file after /clear and resume, while the MCP
  // process keeps the environment it inherited when it first started.
  try {
    const file = join(
      opts.configDir ?? resolveClaudeConfigDir(env),
      "sessions",
      `${opts.parentPid ?? process.ppid}.json`,
    );
    const sessionId: unknown = JSON.parse(readFileSync(file, "utf8")).sessionId;
    if (typeof sessionId === "string" && sessionId.trim()) return sessionId;
  } catch {
    // Other hosts do not have Claude Code's per-process session file.
  }

  return env.CLAUDE_CODE_SESSION_ID || undefined;
}
