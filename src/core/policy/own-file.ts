// D-R48-OWN-FILE-1 (#1326): is this Read target one of the agent's own instruction or skill files?
// Skill references, rule files and CLAUDE.md sit in the agent's own config dir (Claude Code: ~/.claude or
// $CLAUDE_CONFIG_DIR, plugin skills under plugins/cache) or in the shared ~/.agents/skills dir. They are
// instructions: the agent needs the whole text, so the Read deny and the PostToolUse replace let them through.
// Only Markdown files count; transcripts (.jsonl) and other data in the same dirs keep the normal rules.
import { extname, join, resolve } from "node:path";
import type { AgentId } from "../contracts/agents.ts";
import { AGENT_FILE_EXT, AGENT_HOME_DIR, SHARED_SKILLS_DIR } from "../contracts/constants.ts";
import {
  claudeDirOf, codexDirOf, copilotDirOf, geminiDirOf, homeDirOf, kiroDirOf, opencodeDirOf, piAgentDirOf, vscodeUserDirOf,
} from "../project/config-dir.ts";
import { hasParentStep, isInsideAny, isLexicallyInsideAny } from "../project/contain.ts";

/** The dirs this agent reads its own instruction and skill files from, plus the shared skill dir. */
export function ownDirsOf(agent: AgentId, env: NodeJS.ProcessEnv): string[] {
  const home = homeDirOf(env);
  if (home === null) return [];
  const shared = join(home, ...SHARED_SKILLS_DIR);
  const own = agent === "claude-code" ? [claudeDirOf(env, home)]
    : agent === "codex" ? [codexDirOf(env, home)]
    : agent === "gemini" ? [geminiDirOf(env, home)]
    : agent === "copilot-cli" ? [copilotDirOf(env, home)]
    : agent === "kiro" ? [kiroDirOf(env, home)]
    : agent === "opencode" ? [opencodeDirOf(env, home)]
    : agent === "pi" ? [piAgentDirOf(env, home)]
    : agent === "vscode" ? [join(home, ...AGENT_HOME_DIR.vscode), vscodeUserDirOf(env, home)]
    : [join(home, ...AGENT_HOME_DIR[agent])];
  return [...own, shared];
}

/** True when `p` (the path as the tool gave it, relative to `cwd`) is a Markdown file inside one of this agent's own
 *  dirs, by realpath components or, for a link the user made under the dir (D-R54-OWN-FILE-LINK-1, #1345:
 *  ~/.claude/skills/<s> -> ~/dotfiles/...), by the path as written. The ".." check runs on `p` before path.resolve:
 *  resolve folds "link/.." to the link's dir, but the OS reads the parent of the link target. */
export function isOwnFile(agent: AgentId, cwd: string, p: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (extname(p).toLowerCase() !== AGENT_FILE_EXT) return false;
  const dirs = ownDirsOf(agent, env);
  const abs = resolve(cwd, p);
  return (!hasParentStep(cwd, p) && isLexicallyInsideAny(dirs, abs)) || isInsideAny(dirs, abs);
}
