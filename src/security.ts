import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

import { resolveAdapterGlobalSettingsPaths } from "./util/claude-config.js";

// ==============================================================================
// Types
// ==============================================================================

export type PermissionDecision = "allow" | "deny" | "ask";

export interface SecurityPolicy {
  allow: string[];
  deny: string[];
  ask: string[];
}

// ==============================================================================
// Pattern Parsing
// ==============================================================================

/**
 * Extract the glob from a Bash permission pattern.
 * "Bash(sudo *)" returns "sudo *", "Read(.env)" returns null.
 */
export function parseBashPattern(pattern: string): string | null {
  // .+ is greedy: for "Bash(echo (foo))" it captures "echo (foo)"
  // because $ forces the final \) to match only the last paren.
  const match = pattern.match(/^Bash\((.+)\)$/);
  return match ? match[1] : null;
}

/**
 * Parse any tool permission pattern like "ToolName(glob)".
 * Returns { tool, glob } or null if not a valid pattern.
 */
export function parseToolPattern(
  pattern: string,
): { tool: string; glob: string } | null {
  // .+ is greedy: for "Read(some(path))" it captures "some(path)"
  // because $ forces the final \) to match only the last paren.
  const match = pattern.match(/^(\w+)\((.+)\)$/);
  return match ? { tool: match[1], glob: match[2] } : null;
}

// ==============================================================================
// Glob-to-Regex Conversion
// ==============================================================================

/** Escape all regex special characters (including *). */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\\/\-]/g, "\\$&");
}

/** Escape regex specials except *, then convert * to .* */
function convertGlobPart(glob: string): string {
  return glob
    .replace(/[.+?^${}()|[\]\\\/\-]/g, "\\$&")
    .replace(/\*/g, ".*");
}

// Same ReDoS guard as store-directory.ts's globToRegExp: a glob with many
// wildcards compiles to a chain of `.*` groups that backtrack catastrophically
// on a non-matching input, and these patterns reach us from project-local
// `.claude/settings*.json` deny lists (readToolDenyPatterns), which a hostile
// clone controls. So we cap the wildcard count and compile an over-cap glob to
// a never-match regex rather than stalling the deny check in-process. Legit
// deny globs (`**/.env`, `rm:*`) stay far under the cap.
const MAX_GLOB_WILDCARDS = 12;
function exceedsGlobWildcardCap(glob: string): boolean {
  return (glob.match(/\*/g) ?? []).length > MAX_GLOB_WILDCARDS;
}

/**
 * Convert a Bash permission glob to a regex.
 *
 * Two formats:
 * - Colon: "tree:*" becomes /^tree(\s.*)?$/ (command with optional args)
 * - Space: "sudo *" becomes /^sudo .*$/  (literal glob match)
 */
export function globToRegex(
  glob: string,
  caseInsensitive: boolean = false,
): RegExp {
  if (exceedsGlobWildcardCap(glob)) return new RegExp("(?!)", caseInsensitive ? "i" : "");
  let regexStr: string;

  const colonIdx = glob.indexOf(":");
  if (colonIdx !== -1) {
    // Colon format: "command:argsGlob"
    const command = glob.slice(0, colonIdx);
    const argsGlob = glob.slice(colonIdx + 1);
    const escapedCmd = escapeRegex(command);
    const argsRegex = convertGlobPart(argsGlob);
    // Match command alone OR command + space + args
    regexStr = `^${escapedCmd}(\\s${argsRegex})?$`;
  } else {
    // Plain glob: "sudo *", "ls*", "* commit *"
    regexStr = `^${convertGlobPart(glob)}$`;
  }

  return new RegExp(regexStr, caseInsensitive ? "i" : "");
}

/**
 * Convert a file path glob to a regex.
 *
 * Unlike `globToRegex` (which handles command patterns with colon and
 * space semantics), this handles file path globs where:
 * - `**` matches any number of path segments (including zero)
 * - `*` matches anything except path separators
 * - Paths are matched with forward slashes (callers normalize first)
 */
export function fileGlobToRegex(
  glob: string,
  caseInsensitive: boolean = false,
): RegExp {
  if (exceedsGlobWildcardCap(glob)) return new RegExp("(?!)", caseInsensitive ? "i" : "");
  let regexStr = "";
  let i = 0;

  while (i < glob.length) {
    // Handle ** (globstar): match any number of directory segments
    if (glob[i] === "*" && glob[i + 1] === "*") {
      // **/ at the start or after a slash means "zero or more directories"
      if (i + 2 < glob.length && glob[i + 2] === "/") {
        regexStr += "(.*/)?";
        i += 3; // skip "*" "*" "/"
      } else {
        // Trailing ** matches everything
        regexStr += ".*";
        i += 2;
      }
    } else if (glob[i] === "*") {
      // Single * matches anything except /
      regexStr += "[^/]*";
      i++;
    } else if (glob[i] === "?") {
      regexStr += "[^/]";
      i++;
    } else {
      // Escape regex-special characters
      regexStr += glob[i].replace(/[.+^${}()|[\]\\\/\-]/g, "\\$&");
      i++;
    }
  }

  return new RegExp(`^${regexStr}$`, caseInsensitive ? "i" : "");
}

/**
 * Check if a command matches any Bash pattern in the list.
 * Returns the matching pattern string, or null.
 */
export function matchesAnyPattern(
  command: string,
  patterns: string[],
  caseInsensitive: boolean = false,
): string | null {
  for (const pattern of patterns) {
    const glob = parseBashPattern(pattern);
    if (!glob) continue;
    if (globToRegex(glob, caseInsensitive).test(command)) return pattern;
  }
  return null;
}

// ==============================================================================
// Chained Command Splitting
// ==============================================================================

/**
 * Split a shell command on chain operators (&&, ||, ;, |) while
 * respecting single/double quotes and backticks.
 *
 * "echo hello && sudo rm -rf /" → ["echo hello", "sudo rm -rf /"]
 *
 * This prevents bypassing deny patterns by prepending innocent commands.
 */
export function splitChainedCommands(command: string): string[] {
  // Split a compound command into its constituent simple commands so the deny
  // policy can be checked against each one. Splitting is intentionally
  // aggressive: deny is evaluated per-segment while allow/ask match the whole
  // command (see evaluateCommand), so over-splitting can only ever cause MORE
  // deny matches (fail-safe), never break a legitimate allow. The earlier
  // version split only on ; && || | and treated backticks as opaque, so a
  // denied command could hide after a newline, a lone &, a subshell, a brace
  // group, or a $()/backtick substitution and never be matched against deny.
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  const flush = () => {
    const t = current.trim();
    if (t) parts.push(t);
    current = "";
  };
  // A quote or substitution char is escaped only when preceded by an ODD run of
  // backslashes. A one-character `prev === "\\"` check miscounts `\\` (an even
  // run is a literal backslash that leaves the next char unescaped), which let a
  // real closing quote read as escaped so every later separator got swallowed
  // into one segment and slipped past the per-segment deny check.
  const escaped = (i: number): boolean => {
    let n = 0;
    for (let k = i - 1; k >= 0 && command[k] === "\\"; k--) n++;
    return n % 2 === 1;
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    // Single quotes are fully literal in the shell: backslashes don't escape
    // inside them, so a ' always closes once open; outside quotes a
    // backslash-escaped ' is a literal, not an opener.
    if (ch === "'" && !inDouble) {
      if (inSingle) {
        inSingle = false;
        current += ch;
        continue;
      }
      if (!escaped(i)) {
        inSingle = true;
        current += ch;
        continue;
      }
      current += ch;
      continue;
    }
    if (inSingle) {
      current += ch;
      continue;
    }
    if (ch === '"' && !escaped(i)) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    // Command substitution runs even inside double quotes, so its body is its
    // own command: treat `$(` and backtick as boundaries regardless of the
    // double-quote state (single quotes, handled above, suppress them).
    if (ch === "`" && !escaped(i)) {
      flush();
      continue;
    }
    if (ch === "$" && command[i + 1] === "(" && !escaped(i)) {
      flush();
      i++; // consume the "("
      continue;
    }
    // Inside double quotes, ordinary operators are literal.
    if (inDouble) {
      current += ch;
      continue;
    }
    // Unquoted operator / grouping separators.
    if (
      ch === ";" || ch === "\n" || ch === "\r" ||
      ch === "(" || ch === ")" || ch === "{" || ch === "}"
    ) {
      flush();
      continue;
    }
    if (ch === "|") {
      flush();
      if (command[i + 1] === "|") i++; // skip second |
      continue;
    }
    if (ch === "&") {
      flush();
      if (command[i + 1] === "&") i++; // skip second &
      continue;
    }
    current += ch;
  }
  flush();
  return parts;
}

// ==============================================================================
// Settings Reader
// ==============================================================================

/** Read one settings file and return a SecurityPolicy with only Bash patterns. */
function readSingleSettings(path: string): SecurityPolicy | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const perms = parsed?.permissions;
  if (!perms || typeof perms !== "object") return null;

  const filterBash = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p): p is string => typeof p === "string" && parseBashPattern(p) !== null,
    );
  };

  return {
    allow: filterBash(perms.allow),
    deny: filterBash(perms.deny),
    ask: filterBash(perms.ask),
  };
}

/**
 * Read Bash permission policies from up to 3 settings files.
 *
 * Returns policies in precedence order (most local first):
 *   1. .claude/settings.local.json  (project-local)
 *   2. .claude/settings.json        (project-shared)
 *   3. ~/.claude/settings.json      (global)
 *
 * Missing or invalid files are silently skipped.
 */
export function readBashPolicies(
  projectDir?: string,
  globalSettingsPath?: string,
): SecurityPolicy[] {
  const policies: SecurityPolicy[] = [];

  if (projectDir) {
    const localPath = resolve(projectDir, ".claude", "settings.local.json");
    const localPolicy = readSingleSettings(localPath);
    if (localPolicy) policies.push(localPolicy);

    const sharedPath = resolve(projectDir, ".claude", "settings.json");
    const sharedPolicy = readSingleSettings(sharedPath);
    if (sharedPolicy) policies.push(sharedPolicy);
  }

  // Issue #451 round-3: read settings from EVERY adapter-specific global path
  // PLUS the claude global (defense in depth). When the caller passes an
  // explicit globalSettingsPath we honor it verbatim (back-compat with tests
  // and callers that already know which file to read).
  const globalPaths =
    globalSettingsPath !== undefined
      ? [globalSettingsPath]
      : resolveAdapterGlobalSettingsPaths();

  for (const globalPath of globalPaths) {
    const globalPolicy = readSingleSettings(globalPath);
    if (globalPolicy) policies.push(globalPolicy);
  }

  return policies;
}

/**
 * Read deny patterns for a specific tool from settings files.
 *
 * Reads the same 3-tier settings as `readBashPolicies`, but extracts
 * only deny globs for the given tool. Used for Read and Grep enforcement
 * — checks if file paths should be blocked by deny patterns.
 *
 * Returns an array of arrays (one per settings file, in precedence order).
 * Each inner array contains the extracted glob strings.
 */
export function readToolDenyPatterns(
  toolName: string,
  projectDir?: string,
  globalSettingsPath?: string,
): string[][] {
  const result: string[][] = [];

  const extractGlobs = (path: string): string[] | null => {
    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const deny = parsed?.permissions?.deny;
    if (!Array.isArray(deny)) return [];

    const globs: string[] = [];
    for (const entry of deny) {
      if (typeof entry !== "string") continue;
      const tp = parseToolPattern(entry);
      if (tp && tp.tool === toolName) {
        globs.push(tp.glob);
      }
    }
    return globs;
  };

  if (projectDir) {
    const localGlobs = extractGlobs(
      resolve(projectDir, ".claude", "settings.local.json"),
    );
    if (localGlobs !== null) result.push(localGlobs);

    const sharedGlobs = extractGlobs(
      resolve(projectDir, ".claude", "settings.json"),
    );
    if (sharedGlobs !== null) result.push(sharedGlobs);
  }

  // Issue #451 round-3: union over every adapter-specific global path PLUS
  // claude global. Each settings file contributes its own globs array entry
  // so the precedence ordering downstream remains per-file rather than
  // collapsed.
  const globalPaths =
    globalSettingsPath !== undefined
      ? [globalSettingsPath]
      : resolveAdapterGlobalSettingsPaths();

  for (const globalPath of globalPaths) {
    const globalGlobs = extractGlobs(globalPath);
    if (globalGlobs !== null) result.push(globalGlobs);
  }

  return result;
}

// ==============================================================================
// Decision Engine
// ==============================================================================

interface CommandDecision {
  decision: PermissionDecision;
  matchedPattern?: string;
}

/**
 * Evaluate a command against policies in precedence order.
 *
 * Splits chained commands (&&, ||, ;, |) and checks each segment
 * against deny patterns — prevents bypassing deny by prepending
 * innocent commands like "echo ok && sudo rm -rf /".
 *
 * Within each policy: deny > ask > allow (most restrictive wins).
 * First definitive match across policies wins.
 * Default (no match in any policy): "ask".
 *
 * Matching is case-insensitive on win32 and darwin, which default to
 * case-insensitive filesystems: there `RM`/`Rm` resolve to the same binary as
 * `rm`, so a deny like `Bash(rm:*)` must match regardless of case (otherwise an
 * uppercased command slips past the gate and still executes). This is a
 * platform heuristic, not a per-mount probe — a case-sensitive APFS volume or
 * a case-insensitive Linux mount is not tracked.
 */
export function evaluateCommand(
  command: string,
  policies: SecurityPolicy[],
  caseInsensitive: boolean = process.platform === "win32" ||
    process.platform === "darwin",
): CommandDecision {
  // Check each segment of chained commands against deny patterns
  const segments = splitChainedCommands(command);
  for (const segment of segments) {
    for (const policy of policies) {
      const denyMatch = matchesAnyPattern(segment, policy.deny, caseInsensitive);
      if (denyMatch) return { decision: "deny", matchedPattern: denyMatch };
    }
  }

  // Check ask/allow against the full command (original behavior)
  for (const policy of policies) {
    const askMatch = matchesAnyPattern(command, policy.ask, caseInsensitive);
    if (askMatch) return { decision: "ask", matchedPattern: askMatch };

    const allowMatch = matchesAnyPattern(
      command,
      policy.allow,
      caseInsensitive,
    );
    if (allowMatch) return { decision: "allow", matchedPattern: allowMatch };
  }

  return { decision: "ask" };
}

/**
 * Server-side variant: only enforce deny patterns.
 *
 * The server has no UI for "ask" prompts, so allow/ask patterns are
 * irrelevant. Returns "deny" if any deny pattern matches, otherwise "allow".
 *
 * Also splits chained commands to prevent bypass.
 */
export function evaluateCommandDenyOnly(
  command: string,
  policies: SecurityPolicy[],
  caseInsensitive: boolean = process.platform === "win32" ||
    process.platform === "darwin",
): { decision: "deny" | "allow"; matchedPattern?: string } {
  const segments = splitChainedCommands(command);
  for (const segment of segments) {
    for (const policy of policies) {
      const denyMatch = matchesAnyPattern(segment, policy.deny, caseInsensitive);
      if (denyMatch) return { decision: "deny", matchedPattern: denyMatch };
    }
  }

  return { decision: "allow" };
}

// ==============================================================================
// File Path Evaluation
// ==============================================================================

/**
 * Check if a file path should be denied based on deny globs.
 *
 * Normalizes backslashes to forward slashes before matching so that
 * Windows paths work with Unix-style glob patterns.
 *
 * When `projectRoot` is supplied, the path is also matched in its
 * fully-resolved absolute form **and** — when the file exists — in
 * its canonical form (`fs.realpathSync`). This prevents two classes
 * of bypass:
 *
 *   1. `..` traversal: a relative path like `../../.ssh/id_rsa` no
 *      longer evades absolute-path deny rules.
 *   2. Symlink escape: a project-local path whose realpath points
 *      outside the project (e.g. `safe.log -> ~/.ssh/id_rsa`) no
 *      longer evades absolute-path deny rules.
 *
 * realpath is best-effort: if the file does not exist yet (ENOENT)
 * or the syscall fails for any reason, the lexical resolved form is
 * still checked. This keeps the function usable for paths that will
 * be created during execution.
 */
export function evaluateFilePath(
  filePath: string,
  denyGlobs: string[][],
  caseInsensitive: boolean = process.platform === "win32" ||
    process.platform === "darwin",
  projectRoot?: string,
): { denied: boolean; matchedPattern?: string } {
  const toForward = (path: string): string => path.replace(/\\/g, "/");

  // Match against the raw input, the lexically-resolved absolute path,
  // and the canonical (symlink-resolved) path when the file exists.
  // Deduplicated so absolute inputs and paths that don't cross symlinks
  // don't pay the matching cost multiple times.
  const candidates = new Set<string>();
  candidates.add(toForward(filePath));
  if (projectRoot) {
    const lexical = resolve(projectRoot, filePath);
    candidates.add(toForward(lexical));
    try {
      candidates.add(toForward(realpathSync(lexical)));
    } catch {
      // File does not exist yet, or realpath failed — rely on lexical form.
    }
  }

  for (const globs of denyGlobs) {
    for (const glob of globs) {
      // Normalize the glob's path separators the same way candidates were
      // normalized — otherwise a Windows absolute deny rule like
      // `Read(C:\Users\...\secret.env)` parses with literal backslashes that
      // never match a forward-slash candidate.
      const regex = fileGlobToRegex(toForward(glob), caseInsensitive);
      for (const candidate of candidates) {
        if (regex.test(candidate)) {
          return { denied: true, matchedPattern: glob };
        }
      }
    }
  }

  return { denied: false };
}

// ==============================================================================
// Shell-Escape Scanner
// ==============================================================================

// Regex patterns that detect shell-escape calls in non-shell languages.
// Each pattern uses capture groups so that the embedded command string
// can be extracted from the last non-quote group.
//
// NOTE: These regexes contain literal strings like "execSync" — they are
// patterns for *detecting* shell escapes in user code, not actual usage.
const SHELL_ESCAPE_PATTERNS: Record<string, RegExp[]> = {
  python: [
    /os\.system\(\s*(['"])(.*?)\1\s*\)/g,
    /subprocess\.(?:run|call|Popen|check_output|check_call)\(\s*(['"])(.*?)\1/g,
  ],
  javascript: [
    /exec(?:Sync|File|FileSync)?\(\s*(['"`])(.*?)\1/g,
    /spawn(?:Sync)?\(\s*(['"`])(.*?)\1/g,
  ],
  typescript: [
    /exec(?:Sync|File|FileSync)?\(\s*(['"`])(.*?)\1/g,
    /spawn(?:Sync)?\(\s*(['"`])(.*?)\1/g,
  ],
  ruby: [
    /system\(\s*(['"])(.*?)\1/g,
    /`(.*?)`/g,
  ],
  go: [
    /exec\.Command\(\s*(['"`])(.*?)\1/g,
  ],
  php: [
    /shell_exec\(\s*(['"`])(.*?)\1/g,
    /(?:^|[^.])exec\(\s*(['"`])(.*?)\1/g,
    /(?:^|[^.])system\(\s*(['"`])(.*?)\1/g,
    /passthru\(\s*(['"`])(.*?)\1/g,
    /proc_open\(\s*(['"`])(.*?)\1/g,
  ],
  rust: [
    /Command::new\(\s*(['"`])(.*?)\1/g,
  ],
};

/**
 * Extract all string elements from a Python subprocess list call.
 *
 * subprocess.run(["rm", "-rf", "/"]) → "rm -rf /"
 *
 * This catches the list-of-strings form that the single-string regex misses.
 */
function extractPythonSubprocessListArgs(code: string): string[] {
  const commands: string[] = [];
  const pattern =
    /subprocess\.(?:run|call|Popen|check_output|check_call)\(\s*\[([^\]]+)\]/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    const listContent = match[1];
    const args = [...listContent.matchAll(/(['"])(.*?)\1/g)].map((m) => m[2]);
    if (args.length > 0) {
      commands.push(args.join(" "));
    }
  }

  return commands;
}

/**
 * Scan non-shell code for shell-escape calls and extract the embedded
 * command strings.
 *
 * Returns an array of command strings found in the code. For unknown
 * languages or code without shell-escape calls, returns an empty array.
 */
export function extractShellCommands(
  code: string,
  language: string,
): string[] {
  const patterns = SHELL_ESCAPE_PATTERNS[language];
  if (!patterns && language !== "python") return [];

  const commands: string[] = [];

  if (patterns) {
    for (const pattern of patterns) {
      // Reset lastIndex since we reuse the global regex
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(code)) !== null) {
        // The command string is in the last capture group that isn't the
        // quote delimiter. For patterns with 2 groups (quote + content),
        // it's group 2. For Ruby backticks with 1 group, it's group 1.
        const command = match[match.length - 1];
        if (command) commands.push(command);
      }
    }
  }

  // Python: also extract subprocess list-form args
  if (language === "python") {
    commands.push(...extractPythonSubprocessListArgs(code));
  }

  return commands;
}
