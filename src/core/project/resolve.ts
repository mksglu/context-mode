// impl/02 §2, impl/00 §3.1 ProjectContext + §4, docs/v2/PRD-v2.md §5, ADR-0007 decision 4,
// DEVIATIONS D-M1-1, D-M1-5, D-M1-T3-2, D-M1-T3-3, D-M1-T3-5.
// One project source per host. Claude Code has one fixed order (D-FU-PS-1, ADR-0001): CLAUDE_PROJECT_DIR,
// then the hook payload cwd, then process.cwd(). Every other host: its one source; missing -> NO_PROJECT.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { existsSync, readFileSync, realpathSync, statSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { basename, dirname, join, resolve } from "node:path";
import type { AgentId } from "../contracts/agents.ts";
import {
  DB_FILE_NAME, GIT_COMMONDIR_FILE, GIT_DIR_NAME, GIT_HEAD_FILE, GIT_WORKTREE_LINE_PREFIX, GITDIR_FILE_PREFIX,
  PROJECTS_DIR_NAME, PROJECT_KEY_HEX_LEN, WORKSPACE_FOLDER_FLAG,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { ProjectContext, ProjectSourceKind } from "../contracts/types.ts";
import { resolveConfigDir } from "./config-dir.ts";
import { commonRoot } from "./contain.ts";
import { sha256Hex } from "./sha256.ts";

export interface ProjectSourceInput {
  env: NodeJS.ProcessEnv;
  argv: string[];
  cwd: string;
  piCwd?: string;
}

// D-M1-T3-2: the store may import contracts only (impl/00 §2), so the PRD §5 host table is
// mirrored here; it equals AdapterRow.projectSource in adapters/table.ts (ctx_doctor D7 compares them).
function sourceOf(agent: AgentId): ProjectSourceKind {
  switch (agent) {
    case "claude-code":
      return "env:CLAUDE_PROJECT_DIR";
    case "codex":
    case "copilot-cli":
    case "kiro":
      return "arg:--agent+cwd";
    case "vscode":
      return "arg:workspaceFolder";
    case "gemini":
    case "qwen":
    case "zcode":
    case "opencode":
      return "spawn-cwd";
    case "pi":
      return "pi:ctx.cwd";
  }
}

function present(v: string | undefined): string | undefined {
  return v === undefined || v === "" ? undefined : v;
}

function dirOf(kind: ProjectSourceKind, src: ProjectSourceInput): string | undefined {
  switch (kind) {
    case "env:CLAUDE_PROJECT_DIR":
      // D-FU-PS-1: cwd is a common Claude Code hook input field (code.claude.com/docs/en/hooks).
      return present(src.env.CLAUDE_PROJECT_DIR) ?? present(src.cwd) ?? process.cwd();
    case "arg:--agent+cwd":
    case "spawn-cwd":
      return present(src.cwd);
    case "arg:workspaceFolder": {
      const i = src.argv.indexOf(WORKSPACE_FOLDER_FLAG);
      return i < 0 ? undefined : present(src.argv[i + 1]);
    }
    case "pi:ctx.cwd":
      return present(src.piCwd);
  }
}

// impl/02 §2 steps 1-3 and 5, read from disk the way git discovers a repo (D-M3-F-4, GS6: a git
// process costs 10-14 ms of the hook budget). Walk up from dir to the first <d>/.git that names a git
// dir with a HEAD: a .git dir is the git dir; a .git file holds "gitdir: <path>" (linked worktree,
// submodule). The common dir is <gitdir>/commondir when that file exists (linked worktree), else the
// git dir. worktree = <d>. Same answers as `git rev-parse --git-common-dir --show-toplevel`.
// D-M7-NG-1: no .git up to the filesystem root -> null; the caller keys the project by realpath(dir).
// D-CI-PERF-8: also returns the realpath of dir (`start`), so the non-git case does not realpath it twice.
function gitDirs(dir: string): { commonDir: string; worktree: string; start: string } | { commonDir: null; start: string } {
  let cur: string;
  try {
    // .native: one canonical letter case, so one repo always hashes to one projectKey (review-M1 #1).
    cur = realpathSync.native(dir);
  } catch {
    throw new CtxError("NO_GIT_DIR", { path: dir });
  }
  const start = cur;
  for (;;) {
    const gitDir = gitDirAt(join(cur, GIT_DIR_NAME));
    if (gitDir !== null) {
      const common = firstLine(join(gitDir, GIT_COMMONDIR_FILE));
      return { commonDir: realpathSync.native(common === null ? gitDir : resolve(gitDir, common)), worktree: cur, start };
    }
    const up = dirname(cur);
    if (up === cur) return { commonDir: null, start };
    cur = up;
  }
}

// <d>/.git -> the git dir it names, or null when it is absent or names no git dir (no HEAD).
function gitDirAt(dotGit: string): string | null {
  let gitDir: string;
  try {
    if (statSync(dotGit).isDirectory()) {
      gitDir = dotGit;
    } else {
      const line = firstLine(dotGit);
      if (line === null || !line.startsWith(GITDIR_FILE_PREFIX)) return null;
      gitDir = resolve(dirname(dotGit), line.slice(GITDIR_FILE_PREFIX.length));
    }
  } catch {
    return null;
  }
  return existsSync(join(gitDir, GIT_HEAD_FILE)) ? gitDir : null;
}

function firstLine(file: string): string | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const nl = text.indexOf("\n");
  const line = (nl < 0 ? text : text.slice(0, nl)).trim();
  return line === "" ? null : line;
}

function git(dir: string, args: string[]): string[] {
  // GS6 (D-M7-HP-1): child_process loads only on this lazy path (containmentRoot), not on every hook call.
  const { spawnSync } = process.getBuiltinModule("node:child_process") as typeof import("node:child_process");
  const r = spawnSync("git", args, { cwd: dir, shell: false, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  if (r.error !== undefined || r.status !== 0) throw new CtxError("NO_GIT_DIR", { path: dir });
  return r.stdout.split("\n").filter((l) => l !== "");
}

// D-M1-T3-3: the dir that holds the repo, so every sibling worktree is inside (#954).
// <repo>/.git -> parent of <repo>; a bare <repo>.git -> its own parent.
// D-M2-R7-1: a registered worktree outside that dir (git worktree add /elsewhere) is inside too:
// the root is the deepest dir holding the repo's parent and every registered worktree, so
// ctx_execute_file accepts what ctx_batch runs in, from every session of the project.
function containmentRootOf(dir: string, commonDir: string): string {
  const repoDir = basename(commonDir) === GIT_DIR_NAME ? dirname(commonDir) : commonDir;
  const worktrees = git(dir, ["worktree", "list", "--porcelain"])
    .filter((l) => l.startsWith(GIT_WORKTREE_LINE_PREFIX))
    .map((l) => l.slice(GIT_WORKTREE_LINE_PREFIX.length));
  return commonRoot([dirname(repoDir), ...worktrees]);
}

/** impl/00 §4: resolve the project of this call from the agent's one named project source. */
export function resolveProject(agent: AgentId, src: ProjectSourceInput): ProjectContext {
  const source = sourceOf(agent);
  const dir = dirOf(source, src);
  if (dir === undefined) throw new CtxError("NO_PROJECT", { kind: source });
  // D-M7-NG-1, impl/02 §2: one fixed rule. A .git found walking up -> the project is its git common
  // dir and worktree is the dir that holds the .git. None -> the project is realpath(dir) itself:
  // worktree and containmentRoot are that dir, and no git process runs.
  const repo = gitDirs(dir);
  const plain = repo.commonDir === null ? repo.start : undefined;
  const commonDir = repo.commonDir ?? repo.start;
  const worktree = repo.commonDir === null ? repo.start : repo.worktree;
  // D-CI-PERF-8: the store fields (key, dir, db path) are computed on first read and kept. A PreToolUse hook call
  // reads only worktree, so it no longer hashes the key, creates the data root or realpaths it (3 fs calls, one
  // mkdir with recursive, on every tool call). A missing HOME now throws NO_HOME at the first read, not here.
  let key: string | undefined;
  let pdir: string | undefined;
  // D-M3-F-3 (GS6): `git worktree list` runs on the first read of containmentRoot, not here. Only the
  // tools that check a path read it; the hook never does, so a hook call spawns git once, not twice.
  let root: string | undefined;
  return {
    get projectKey(): string {
      // D-M7-HP-2 (GS6): plain-JS SHA-256, so the hook never loads node:crypto (~3 ms of process start).
      key ??= sha256Hex(commonDir).slice(0, PROJECT_KEY_HEX_LEN);
      return key;
    },
    get projectDir(): string {
      // D-M1-T3-5: the config dir comes from the process env, not src.env (src.env picks the project only).
      pdir ??= join(resolveConfigDir(process.env), PROJECTS_DIR_NAME, this.projectKey);
      return pdir;
    },
    get dbPath(): string {
      return join(this.projectDir, DB_FILE_NAME);
    },
    worktree,
    get containmentRoot(): string {
      root ??= plain ?? containmentRootOf(dir, commonDir);
      return root;
    },
    agent,
    source,
  };
}
