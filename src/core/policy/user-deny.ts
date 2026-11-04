// impl/08 §4 (module enforcement): the user's own deny rules. DECISIONS-r9 E2 (fail-closed signal), V17
// (Read glob anchors). DEVIATIONS D-M3-E2-1..4. No regex: patterns are walked by a hand-written glob matcher.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { readFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { isAbsolute, join, relative, sep } from "node:path";
import type { AgentId } from "../contracts/agents.ts";
import { CLAUDE_CONFIG_DIR_ENV } from "../contracts/constants.ts";
import { claudeDirOf, homeDirOf } from "../project/config-dir.ts";
import { hostText } from "../ops/host-text.ts";

// Host file names, not tunable values (same rule as index/walk.ts GITIGNORE). D-M3-E2-2.
const CLAUDE_DIR = ".claude";
const LOCAL_SETTINGS = "settings.local.json";
const SETTINGS = "settings.json";

const BASH_TOOL = "Bash";
const READ_TOOL = "Read";
const PREFIX_RULE = ":*";     // Bash(cmd:*) = cmd alone, or cmd + whitespace + anything
const ABS_ANCHOR = "//";      // Read(//abs/**): absolute path, any root
const HOME_ANCHOR = "~/";     // Read(~/x/**): $HOME + "/x/**"
const PROJECT_ANCHOR = "./";  // Read(./x/**): path relative to projectDir only
const PARENT = "..";
const WHITESPACE = " \t\n\r";

/** What a deny pattern is tested against. Bash: the raw command text. Read: the resolved absolute path. */
export interface DenySubject { tool: string; projectDir?: string; }
const BASH_SUBJECT: DenySubject = Object.freeze({ tool: BASH_TOOL });

/** Deny-config files for an agent, project first, then user. Only claude-code documents one (D-M3-E2-1). */
function denyFiles(projectDir: string, agent: AgentId): string[] {
  if (agent !== "claude-code") return [];
  // D-M3-F-8: the homeDirOf rule (D-M1-T3-1, D-WIN-HOME-2: USERPROFILE first on win32, HOME first on POSIX).
  const home = homeDirOf(process.env);
  const cfg = process.env[CLAUDE_CONFIG_DIR_ENV];
  const userDir = cfg !== undefined && cfg !== "" ? cfg : home === null ? null : claudeDirOf(process.env, home);
  const project = [join(projectDir, CLAUDE_DIR, LOCAL_SETTINGS), join(projectDir, CLAUDE_DIR, SETTINGS)];
  return userDir === null ? project : [...project, join(userDir, SETTINGS)];
}

type FileDeny = { kind: "absent" } | { kind: "bad" } | { kind: "ok"; deny: string[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readOne(file: string): FileDeny {
  let text: string;
  try {
    text = hostText(readFileSync(file, "utf8"));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "absent" } : { kind: "bad" };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { kind: "bad" };
  }
  if (!isObject(doc)) return { kind: "bad" };
  const perms = doc.permissions;
  if (perms === undefined) return { kind: "ok", deny: [] };
  if (!isObject(perms)) return { kind: "bad" };
  const deny = perms.deny;
  if (deny === undefined) return { kind: "ok", deny: [] };
  if (!Array.isArray(deny) || !deny.every((p) => typeof p === "string")) return { kind: "bad" };
  return { kind: "ok", deny: deny as string[] };
}

/**
 * impl/08 §4.1. Raw deny patterns, project files first, then the user file, unchanged.
 * [] when no deny-config file exists; null when a present file cannot be read or parsed (E2: decide.ts
 * denies every PreToolUse under REQUIRE_SECURITY_ENV="1", else treats null as []).
 */
export function readUserDeny(projectDir: string, agent: AgentId): string[] | null {
  const out: string[] = [];
  for (const file of denyFiles(projectDir, agent)) {
    const r = readOne(file);
    if (r.kind === "bad") return null;
    if (r.kind === "ok") out.push(...r.deny);
  }
  return out;
}

// ---- glob matcher (no regex) ----

type GlobTok = { t: "lit"; c: string } | { t: "any1" } | { t: "star" } | { t: "globstar" } | { t: "globstarDir" };

function tokenize(glob: string, path: boolean): GlobTok[] {
  const toks: GlobTok[] = [];
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*" && path && glob[i + 1] === "*") {
      const dir = glob[i + "**".length] === "/";
      toks.push({ t: dir ? "globstarDir" : "globstar" });
      i += dir ? "**/".length : "**".length;
      continue;
    }
    if (c === "*") {
      if (toks.length === 0 || toks[toks.length - 1].t !== "star") toks.push({ t: "star" });
    } else if (c === "?") toks.push({ t: "any1" });
    else toks.push({ t: "lit", c });
    i++;
  }
  return toks;
}

/**
 * Whole-string glob match by dynamic programming over (token, text offset), O(tokens x text).
 * Command mode: * is any run of chars (newlines too), ? one char. Path mode: * and ? never match "/",
 * ** matches anything, a "**" + "/" pair matches zero or more whole directories.
 */
function globMatch(glob: string, text: string, path: boolean): boolean {
  const toks = tokenize(glob, path);
  const n = text.length;
  let next = new Uint8Array(n + 1);
  next[n] = 1; // no tokens left: matches only the empty rest
  for (let i = toks.length - 1; i >= 0; i--) {
    const tok = toks[i];
    const cur = new Uint8Array(n + 1);
    let acc = 0; // globstarDir: some k > j with text[k-1] === "/" and next[k]
    for (let j = n; j >= 0; j--) {
      const has = j < n;
      const ch = has ? text[j] : "";
      switch (tok.t) {
        case "lit": cur[j] = has && ch === tok.c ? next[j + 1] : 0; break;
        case "any1": cur[j] = has && !(path && ch === "/") ? next[j + 1] : 0; break;
        case "star": cur[j] = next[j] || (has && !(path && ch === "/") ? cur[j + 1] : 0); break;
        case "globstar": cur[j] = next[j] || (has ? cur[j + 1] : 0); break;
        case "globstarDir":
          if (has && ch === "/" && next[j + 1]) acc = 1;
          cur[j] = next[j] || acc;
          break;
      }
    }
    next = cur;
  }
  return next[0] === 1;
}

function parsePattern(pattern: string): { tool: string; glob: string } | null {
  const open = pattern.indexOf("(");
  if (open < 1 || !pattern.endsWith(")")) return null;
  const glob = pattern.slice(open + 1, pattern.length - ")".length);
  return glob === "" ? null : { tool: pattern.slice(0, open), glob };
}

function matchCommand(glob: string, text: string): boolean {
  if (!glob.endsWith(PREFIX_RULE)) return globMatch(glob, text, false);
  const head = glob.slice(0, glob.length - PREFIX_RULE.length);
  if (globMatch(head, text, false)) return true;
  for (let k = 0; k < text.length; k++) {
    if (WHITESPACE.includes(text[k]) && globMatch(head, text.slice(0, k), false)) return true;
  }
  return false;
}

const DRIVE_PREFIX = /^[A-Za-z]:(?=\/)/;

function toSlash(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

// DECISIONS-r9 V17 anchors; any other pattern is matched against the absolute path as written (D-M3-E2-3).
function matchPath(glob: string, absPath: string, projectDir: string | undefined): boolean {
  if (glob.startsWith(PROJECT_ANCHOR)) {
    if (projectDir === undefined) return false;
    const rel = relative(projectDir, absPath);
    if (rel === "" || rel === PARENT || rel.startsWith(PARENT + sep) || isAbsolute(rel)) return false;
    return globMatch(glob.slice(PROJECT_ANCHOR.length), toSlash(rel), true);
  }
  const target = toSlash(absPath);
  // Windows: the glob may be written with backslashes (v1 deny-policy rows); the target is already slashed.
  if (glob.startsWith(ABS_ANCHOR)) {
    const g = toSlash(glob.slice(ABS_ANCHOR.length - "/".length));
    // Windows: "//tmp/x" is drive-less; resolve() put the current drive in front of the target.
    return globMatch(g, target, true) || globMatch(g, target.replace(DRIVE_PREFIX, ""), true);
  }
  if (glob.startsWith(HOME_ANCHOR)) {
    const home = homeDirOf(process.env);
    return home !== null && globMatch(toSlash(home) + glob.slice(HOME_ANCHOR.length - "/".length), target, true);
  }
  return globMatch(toSlash(glob), target, true);
}

/**
 * impl/08 §4.2. First pattern (raw, as the user wrote it) whose glob matches `text`, or null.
 * Only `<subject.tool>(<glob>)` patterns take part; other tools' rules and bare names are skipped (v1 parity).
 * Bash (default, also used for ctx_execute / ctx_batch input, Q5): `text` is the command string.
 * Read: `text` is the resolved absolute path; V17 anchors `//`, `~/`, `./` apply (D-M3-E2-4).
 */
export function matchesAnyDenyPattern(text: string, patterns: string[], subject: DenySubject = BASH_SUBJECT): string | null {
  for (const pattern of patterns) {
    const p = parsePattern(pattern);
    if (p === null || p.tool !== subject.tool) continue;
    const hit = subject.tool === READ_TOOL ? matchPath(p.glob, text, subject.projectDir) : matchCommand(p.glob, text);
    if (hit) return pattern;
  }
  return null;
}
