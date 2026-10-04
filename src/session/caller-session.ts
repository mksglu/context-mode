import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveClaudeConfigDir } from "../util/claude-config.js";

/** Resolve the Claude Code session that owns this MCP process, if available. */
export function resolveCallerSessionId(
  opts: {
    env?: NodeJS.ProcessEnv;
    parentPid?: number;
    configDir?: string;
  } = {},
): string | undefined {
  const env = opts.env ?? process.env;

  // The per-process file is read FIRST, and that ordering is the fix. Claude
  // Code rewrites this file after /clear and after resume, while a long-lived
  // MCP process keeps the environment it inherited at startup — so
  // CLAUDE_SESSION_ID goes stale the moment the user clears or resumes, and
  // everything the server writes lands on the previous session's rows. The
  // upstream PR read the env first while its own comment argued for the file,
  // which made the whole fix a no-op whenever Claude Code propagates the var.
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

  // Only now the inherited environment, as a fallback for the window before
  // Claude Code writes the file for a freshly spawned session.
  return env.CLAUDE_SESSION_ID || env.CLAUDE_CODE_SESSION_ID || undefined;
}
