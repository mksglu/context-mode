/**
 * Session event extraction — pure functions, zero side effects.
 * Extracts structured events from Claude Code tool calls and user messages.
 *
 * All 13 event categories as specified in PRD Section 3.
 */

// ── Public interfaces ──────────────────────────────────────────────────────

export interface SessionEvent {
  /** e.g. "file_read", "file_write", "cwd", "error_tool", "git", "task",
   *  "decision", "rule", "env", "role", "skill", "subagent", "data", "intent" */
  type: string;
  /** e.g. "file", "cwd", "error", "git", "task", "decision",
   *  "rule", "env", "role", "skill", "subagent", "data", "intent" */
  category: string;
  /** Extracted payload — full data, no truncation */
  data: string;
  /** 1=critical (rules, files, tasks) … 5=low */
  priority: number;
  /**
   * Optional — bytes context-mode prevented from entering the model context
   * window for this event. Currently populated by external_ref when a
   * ctx_fetch_and_index tool_response carries the
   * `Fetched and indexed N sections (XKB)` preamble.
   */
  bytes_avoided?: number;
}

export interface ToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResponse?: string;
  isError?: boolean;
}

/**
 * Hook input shape as received from Claude Code PostToolUse hook stdin.
 * Uses snake_case to match the raw hook JSON.
 */
export interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: string;
  /** Optional structured output from the tool (may carry isError) */
  tool_output?: { isError?: boolean; is_error?: boolean };
}

// ── Internal helpers ───────────────────────────────────────────────────────

/** Null-safe string coercion — no truncation, preserves full data. */
function safeString(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

/** Serialise an unknown value to a string — no truncation. */
function safeStringAny(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isToolError(input: HookInput): boolean {
  const response = String(input.tool_response ?? "");
  // PreToolUse rewrites curl/wget/inline-HTTP/WebFetch commands into
  //   echo "context-mode: <guidance text including 'retry', 'fails', 'error'>"
  // The user-facing copy legitimately mentions failure modes ("retry if it
  // fails with a transient DNS error"), but those words must NOT classify
  // our OWN guidance message as a tool error or it gets captured into
  // session_resume and surfaces as a fake error in the next chat.
  // We check BOTH sides because:
  //   - real shell run → response starts with `context-mode:` (echo stdout)
  //   - test/captured-output path → response is the raw command itself
  //     (`echo "context-mode: …"`), so we also match the command shape
  const command = String(input.tool_input?.command ?? "");
  if (
    response.startsWith("context-mode:") ||
    command.startsWith('echo "context-mode:') ||
    command.startsWith("echo 'context-mode:")
  ) {
    return false;
  }
  const isErrorFlag = input.tool_output?.isError === true || input.tool_output?.is_error === true;
  const isBashError =
    input.tool_name === "Bash" &&
    /exit code [1-9]|error:|Error:|FAIL|failed/i.test(response);
  return isBashError || isErrorFlag;
}

interface ApplyPatchTarget {
  path: string;
  type: "file_write" | "file_edit";
}

function extractApplyPatchTargets(command: string): ApplyPatchTarget[] {
  if (!command) return [];

  const targets: ApplyPatchTarget[] = [];
  for (const line of command.split(/\r?\n/)) {
    if (line.startsWith("*** Add File: ")) {
      targets.push({ path: line.slice(14).trim(), type: "file_write" });
      continue;
    }
    if (line.startsWith("*** Update File: ")) {
      targets.push({ path: line.slice(17).trim(), type: "file_edit" });
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      targets.push({ path: line.slice(17).trim(), type: "file_edit" });
      continue;
    }
    if (line.startsWith("*** Move to: ")) {
      targets.push({ path: line.slice(13).trim(), type: "file_edit" });
    }
  }

  const seen = new Set<string>();
  return targets.filter((target) => {
    if (!target.path) return false;
    const key = `${target.type}:${target.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPlanFilePath(filePath: string): boolean {
  return /(?:^|[/\\])\.claude[/\\]plans[/\\]/.test(filePath);
}

// ── Category extractors ────────────────────────────────────────────────────

/**
 * Category 1 & 2: rule + file
 *
 * CLAUDE.md / .claude/ reads → emit both a "rule" event (priority 1) AND a
 * "file_read" event (priority 1) because the file is being actively accessed.
 *
 * Other Edit/Write/Read tool calls → emit a file_edit / file_write / file_read
 * event (priority 1).
 */
function extractFileAndRule(input: HookInput): SessionEvent[] {
  const { tool_name, tool_input, tool_response } = input;
  const events: SessionEvent[] = [];

  if (tool_name === "Read") {
    const filePath = String(tool_input["file_path"] ?? "");

    // Rule detection — covers every supported platform's instruction
    // file convention plus per-user memory directories. Hardcoding here
    // (instead of dispatching through the adapter) keeps extract.ts
    // pure / sync / hot-path-safe — the tradeoff is that adding a new
    // platform requires updating this regex.
    //
    //   Filenames: CLAUDE.md, AGENTS.md, AGENTS.override.md, GEMINI.md,
    //              QWEN.md, KIRO.md, copilot-instructions.md,
    //              context-mode.mdc
    //   Directories: .claude/, .codex/memories/, .qwen/memory/,
    //                .gemini/memory/, .config/<plat>/memory/, .cursor/memory/,
    //                .github/memory/, .kiro/memory/, etc.
    const isRuleFile =
      /(?:CLAUDE|AGENTS(?:\.override)?|GEMINI|QWEN|KIRO)\.md$/i.test(filePath)
      || /\/copilot-instructions\.md$/i.test(filePath)
      || /\/context-mode\.mdc$/i.test(filePath)
      || /\.claude[\\/]/i.test(filePath)
      || /[\\/]memor(?:y|ies)[\\/][^\\/]+\.md$/i.test(filePath);
    if (isRuleFile) {
      events.push({
        type: "rule",
        category: "rule",
        data: safeString(filePath),
        priority: 1,
      });

      // Capture rule content so it survives context compaction
      if (tool_response && tool_response.length > 0) {
        events.push({
          type: "rule_content",
          category: "rule",
          data: safeString(tool_response),
          priority: 1,
        });
      }
    }

    // Always emit file_read for any Read call
    events.push({
      type: "file_read",
      category: "file",
      data: safeString(filePath),
      priority: 1,
    });

    return events;
  }

  if (tool_name === "Edit") {
    const filePath = String(tool_input["file_path"] ?? "");
    events.push({
      type: "file_edit",
      category: "file",
      data: safeString(filePath),
      priority: 1,
    });
    return events;
  }

  if (tool_name === "NotebookEdit") {
    const notebookPath = String(tool_input["notebook_path"] ?? "");
    events.push({
      type: "file_edit",
      category: "file",
      data: safeString(notebookPath),
      priority: 1,
    });
    return events;
  }

  if (tool_name === "Write") {
    const filePath = String(tool_input["file_path"] ?? "");
    events.push({
      type: "file_write",
      category: "file",
      data: safeString(filePath),
      priority: 1,
    });
    return events;
  }

  if (tool_name === "apply_patch") {
    if (isToolError(input)) return [];
    const patchTargets = extractApplyPatchTargets(
      String(tool_input["command"] ?? tool_input["patch"] ?? ""),
    );
    for (const target of patchTargets) {
      events.push({
        type: target.type,
        category: "file",
        data: safeString(target.path),
        priority: 1,
      });
    }
    return events;
  }

  // Glob — file pattern exploration
  if (tool_name === "Glob") {
    const pattern = String(tool_input["pattern"] ?? "");
    events.push({
      type: "file_glob",
      category: "file",
      data: safeString(pattern),
      priority: 3,
    });
    return events;
  }

  // Grep — code search
  if (tool_name === "Grep") {
    const searchPattern = String(tool_input["pattern"] ?? "");
    const searchPath = String(tool_input["path"] ?? "");
    events.push({
      type: "file_search",
      category: "file",
      data: safeString(`${searchPattern} in ${searchPath}`),
      priority: 3,
    });
    return events;
  }

  return events;
}

/**
 * Category 4: cwd
 * Matches the first `cd <path>` in a Bash command (handles quoted paths).
 */
function extractCwd(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Bash") return [];

  const cmd = String(input.tool_input["command"] ?? "");
  // Match: cd "path" | cd 'path' | cd path
  const cdMatch = cmd.match(/\bcd\s+("([^"]+)"|'([^']+)'|(\S+))/);
  if (!cdMatch) return [];

  const dir = cdMatch[2] ?? cdMatch[3] ?? cdMatch[4] ?? "";
  return [{
    type: "cwd",
    category: "cwd",
    data: safeString(dir),
    priority: 2,
  }];
}

/**
 * Category 5: error
 * Detects failures from bash exit codes / error patterns, or an explicit
 * isError flag in tool_output.
 */
function extractError(input: HookInput): SessionEvent[] {
  const { tool_response } = input;
  const response = String(tool_response ?? "");
  if (!isToolError(input)) return [];

  return [{
    type: "error_tool",
    category: "error",
    data: safeString(response),
    priority: 2,
  }];
}

/**
 * Category 11: git
 * Matches common git operations from Bash commands.
 */

const GIT_PATTERNS: Array<{ pattern: RegExp; operation: string }> = [
  { pattern: /\bgit\s+checkout\b/, operation: "branch" },
  { pattern: /\bgit\s+commit\b/, operation: "commit" },
  { pattern: /\bgit\s+merge\s+\S+/, operation: "merge" },
  { pattern: /\bgit\s+rebase\b/, operation: "rebase" },
  { pattern: /\bgit\s+stash\b/, operation: "stash" },
  { pattern: /\bgit\s+push\b/, operation: "push" },
  { pattern: /\bgit\s+pull\b/, operation: "pull" },
  { pattern: /\bgit\s+log\b/, operation: "log" },
  { pattern: /\bgit\s+diff\b/, operation: "diff" },
  { pattern: /\bgit\s+status\b/, operation: "status" },
  { pattern: /\bgit\s+branch\b/, operation: "branch" },
  { pattern: /\bgit\s+reset\b/, operation: "reset" },
  { pattern: /\bgit\s+add\b/, operation: "add" },
  { pattern: /\bgit\s+cherry-pick\b/, operation: "cherry-pick" },
  { pattern: /\bgit\s+tag\b/, operation: "tag" },
  { pattern: /\bgit\s+fetch\b/, operation: "fetch" },
  { pattern: /\bgit\s+clone\b/, operation: "clone" },
  { pattern: /\bgit\s+worktree\b/, operation: "worktree" },
];

function extractGit(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Bash") return [];

  const cmd = String(input.tool_input["command"] ?? "");

  // Bug 8 (v1.0.162) — parse the git invocation algorithmically so flags
  // between `git` and the operation token are tolerated (`git -C /path
  // status`, `git --no-pager log`, etc.). Falls back to the legacy regex
  // pattern scan when the algorithmic parse cannot locate a `git` token —
  // preserves backward compat for commands like `cd /repo && git status`
  // where the algorithmic parse sees `cd` as the first token instead.
  const parsed = parseGitInvocation(cmd);
  let match: { pattern: RegExp; operation: string } | undefined;
  if (parsed && parsed.operation) {
    match = GIT_PATTERNS.find(p => p.operation === parsed.operation);
  }
  if (!match) {
    match = GIT_PATTERNS.find(p => p.pattern.test(cmd));
  }
  if (!match) return [];

  // Bug 1 (v1.0.161) — for `git commit` operations, parse -m / -am / --message=
  // from the Bash command via shell-like argv tokenization so downstream
  // consumers receive the actual commit subject in `data`. Falls back to the
  // operation name when no message argument is present (--amend / --no-edit /
  // -F file / interactive editor flow). Tokenizer is hand-rolled char-by-char
  // (no regex) to mirror real shell quoting/cluster-flag semantics.
  //
  // When a message is captured, the event surfaces as type='git_commit' so the
  // rollup aggregator can distinguish ACTUAL commits from other git operations
  // (status/diff/log were inflating has_commit on every event — see
  // session-loaders.mjs rollup stamp + Bug 2).
  // Bug 8 cwd hint — when `-C <dir>` is present in the git invocation, emit
  // a leading cwd event so the attribution carry-forward (LAST_SEEN source)
  // routes downstream events in the same batch to the scoped directory's
  // project. Without the hint, `git -C /projB status` while cwd=/projA
  // misattributes to /projA.
  const out: SessionEvent[] = [];
  if (parsed?.scopedDir) {
    out.push({
      type: "cwd",
      category: "cwd",
      data: safeString(parsed.scopedDir),
      priority: 2,
    });
  }

  if (match.operation === "commit") {
    const msg = extractCommitMessageFromCommand(cmd);
    if (msg) {
      out.push({
        type: "git_commit",
        category: "git",
        data: safeString(msg),
        priority: 2,
      });
      return out;
    }
  }

  out.push({
    type: "git",
    category: "git",
    data: safeString(match.operation),
    priority: 2,
  });
  return out;
}

// Algorithmic git invocation parser — tokenizes the Bash command and walks
// argv to extract the `-C <dir>` scope hint and the operation subcommand.
// Tolerates env-prefix assignments and any number of flags between `git`
// and the operation. Returns null when no `git` token is found (caller
// falls back to the legacy regex pattern scan).
interface ParsedGit {
  scopedDir: string | null;
  operation: string | null;
}

/**
 * Gap #2 (16-oss-verify-gap-prd) — expand leading `~` / `~/` to homedir.
 * Does NOT support `~user/path` (no current-user resolution at bridge
 * layer; that requires a passwd lookup). Returns input unchanged when
 * there is no tilde or the path starts with `~<otheruser>`.
 */
function expandHomeTilde(path: string): string {
  if (typeof path !== "string" || path.length === 0) return path;
  if (path === "~") return getHomedirSafe();
  if (path.startsWith("~/")) return getHomedirSafe() + path.slice(1);
  return path;
}

/**
 * Lazily-resolved homedir — avoids a require/import at module init time.
 * Falls back to "~" (no-op expansion) when the environment is sandboxed
 * without HOME / USERPROFILE.
 */
function getHomedirSafe(): string {
  try {
    const home = process.env.HOME
      || process.env.USERPROFILE
      || (process.env.HOMEDRIVE && process.env.HOMEPATH
          ? process.env.HOMEDRIVE + process.env.HOMEPATH
          : "");
    return home || "~";
  } catch {
    return "~";
  }
}

function parseGitInvocation(cmd: string): ParsedGit | null {
  const tokens = tokenizeCommand(cmd);
  let i = 0;
  // Skip env-style assignments at the head (FOO=bar git ...)
  while (i < tokens.length && isEnvAssignment(tokens[i])) i++;
  // Locate the `git` token (allow common runners like `sudo git ...`)
  while (i < tokens.length && tokens[i] !== "git" && !tokens[i].endsWith("/git")) {
    // Stop runner-skipping at the first non-assignment, non-runner token
    if (!isCommonRunner(tokens[i])) break;
    i++;
  }
  if (i >= tokens.length) return null;
  if (tokens[i] !== "git" && !tokens[i].endsWith("/git")) return null;
  i++; // consume `git`

  let scopedDir: string | null = null;
  let operation: string | null = null;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "-C" || t === "--directory") {
      scopedDir = tokens[i + 1] ?? null;
      i += 2;
      continue;
    }
    // Gap #2 — `--directory=/path` equals-form (tokenizer keeps it as one)
    if (t.startsWith("--directory=")) {
      scopedDir = t.slice("--directory=".length);
      i++;
      continue;
    }
    if (t.length > 0 && t[0] === "-") {
      // Generic flag — skip the flag itself. We do NOT consume the next
      // token as its value generically because git's per-flag arg shape
      // varies; the dedicated extractCommitMessageFromCommand handles -m
      // separately.
      i++;
      continue;
    }
    // First bare (non-flag) token after `git` = operation
    operation = t;
    break;
  }
  if (scopedDir) scopedDir = expandHomeTilde(scopedDir);
  return { scopedDir, operation };
}

function isEnvAssignment(token: string): boolean {
  if (token.length === 0) return false;
  // FOO=bar shape: starts with an uppercase letter, contains an `=`
  let sawEq = false;
  for (let j = 0; j < token.length; j++) {
    const c = token.charCodeAt(j);
    if (j === 0) {
      // First char must be A-Z or underscore
      if (!((c >= 65 && c <= 90) || c === 95)) return false;
    } else if (c === 61 /* = */) {
      sawEq = true;
      break;
    } else if (!((c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95)) {
      // Body chars must be A-Z, 0-9, or _
      return false;
    }
  }
  return sawEq;
}

function isCommonRunner(token: string): boolean {
  // Runners that wrap real commands. We skip them when locating `git`
  // so `sudo git status` works the same as `git status`.
  switch (token) {
    case "sudo":
    case "doas":
    case "env":
    case "exec":
    case "time":
      return true;
    default:
      return false;
  }
}

// Shell-like argv tokenizer — handles single/double quotes, backslash escapes,
// and merges adjacent quoted/unquoted segments per POSIX shell behavior
// (`echo a"b c"d` → ["ab cd"]). Pure char loop; no regex.
function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];
  const n = cmd.length;
  let i = 0;
  while (i < n) {
    while (i < n && (cmd[i] === " " || cmd[i] === "\t")) i++;
    if (i >= n) break;
    let buf = "";
    while (i < n && cmd[i] !== " " && cmd[i] !== "\t") {
      const ch = cmd[i];
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < n && cmd[i] !== quote) {
          if (cmd[i] === "\\" && i + 1 < n) {
            buf += cmd[i + 1];
            i += 2;
          } else {
            buf += cmd[i];
            i++;
          }
        }
        if (i < n) i++; // consume closing quote
      } else if (ch === "\\" && i + 1 < n) {
        buf += cmd[i + 1];
        i += 2;
      } else {
        buf += ch;
        i++;
      }
    }
    tokens.push(buf);
  }
  return tokens;
}

// Linear scan over argv looking for a commit-message-bearing flag:
//   --message=<value>   long form, attached value
//   --message <value>   long form, separate token
//   -m / -am / -cm ...  short cluster ending in 'm', value in next token
// Returns null when no message arg is present — caller falls back to
// operation name. Pure char checks; no regex.
function extractCommitMessageFromCommand(cmd: string): string | null {
  const argv = tokenizeCommand(cmd);
  const longPrefix = "--message=";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Long form: --message=VALUE
    if (arg.length > longPrefix.length && arg.startsWith(longPrefix)) {
      const v = arg.slice(longPrefix.length);
      return v.length > 0 ? v : null;
    }
    // Long form: --message VALUE
    if (arg === "--message") {
      const v = argv[i + 1];
      return v && v.length > 0 ? v : null;
    }
    // Short cluster ending in 'm' (e.g. -m, -am, -cm). Cluster must be
    // single-dash followed by only lowercase letters, last letter 'm'.
    if (
      arg.length >= 2 &&
      arg[0] === "-" &&
      arg[1] !== "-" &&
      arg[arg.length - 1] === "m" &&
      isLowerAlphaRun(arg, 1)
    ) {
      const v = argv[i + 1];
      return v && v.length > 0 ? v : null;
    }
  }
  return null;
}

function isLowerAlphaRun(s: string, start: number): boolean {
  if (start >= s.length) return false;
  for (let i = start; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 97 || c > 122) return false; // not a-z
  }
  return true;
}

/**
 * Category 3: task
 * TodoWrite / TaskCreate / TaskUpdate tool calls.
 */
function extractTask(input: HookInput): SessionEvent[] {
  const TASK_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate"]);
  if (!TASK_TOOLS.has(input.tool_name)) return [];

  // Store tool name as type so create vs update can be reliably distinguished
  const type = input.tool_name === "TaskUpdate" ? "task_update"
    : input.tool_name === "TaskCreate" ? "task_create"
    : "task"; // TodoWrite fallback

  return [{
    type,
    category: "task",
    data: safeString(JSON.stringify(input.tool_input)),
    priority: 1,
  }];
}

/**
 * Category 15: plan
 * Tracks the full plan mode lifecycle:
 * - EnterPlanMode → plan_enter
 * - Write/Edit to ~/.claude/plans/ → plan_file_write
 * - ExitPlanMode → plan_exit (with allowedPrompts)
 * - ExitPlanMode tool_response → plan_approved / plan_rejected
 *
 * Note: Shift+Tab and /plan command do NOT fire PostToolUse hooks
 * (Claude Code bug #15660). Only programmatic EnterPlanMode is tracked.
 */
/**
 * FNV-1a 32-bit hash → 8-char lowercase hex. Stable across runs/platforms.
 * Used for plan_hash so identical plans dedupe at the platform side.
 */
function fnv1a32Hex(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Read the plan text from the ExitPlanMode envelope. SDK carries it on
 * the OUTPUT (ExitPlanModeOutput @ :2222), but the PRD body cites input.
 * Try both so we are spec-flexible.
 */
function extractExitPlanText(input: HookInput): string | null {
  const inputPlan = input.tool_input["plan"];
  if (typeof inputPlan === "string" && inputPlan.length > 0) return inputPlan;
  const resp = input.tool_response;
  if (typeof resp === "string" && resp.length > 0) {
    try {
      const parsed = JSON.parse(resp);
      if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).plan === "string") {
        return (parsed as Record<string, unknown>).plan as string;
      }
    } catch { /* fall through */ }
  }
  return null;
}

function extractPlan(input: HookInput): SessionEvent[] {
  if (input.tool_name === "EnterPlanMode") {
    return [{
      type: "plan_enter",
      category: "plan",
      data: "entered plan mode",
      priority: 2,
    }];
  }

  if (input.tool_name === "ExitPlanMode") {
    const events: SessionEvent[] = [];

    // Plan exit event with allowedPrompts detail
    const prompts = input.tool_input["allowedPrompts"];
    let detail = Array.isArray(prompts) && prompts.length > 0
      ? `exited plan mode (allowed: ${safeStringAny(prompts.map((p: unknown) => {
          if (typeof p === "object" && p !== null && "prompt" in p) return String((p as Record<string, unknown>).prompt);
          return String(p);
        }).join(", "))})`
      : "exited plan mode";

    // §11 / PRD #6 — append plan_bytes + plan_hash so the platform can
    // dedupe identical plans across sessions and JOIN plan_mode_authorized
    // writes against a stable plan id. Plan source: tool_input.plan first
    // (per PRD), fall back to tool_response.plan (SDK actually carries it
    // there per ExitPlanModeOutput @ sdk-tools.d.ts:2222).
    const plan = extractExitPlanText(input);
    if (typeof plan === "string" && plan.length > 0) {
      detail += ` plan_bytes:${plan.length} plan_hash:${fnv1a32Hex(plan)}`;
    }

    events.push({
      type: "plan_exit",
      category: "plan",
      data: safeString(detail),
      priority: 2,
    });

    // Detect approval/rejection from tool_response
    const response = String(input.tool_response ?? "").toLowerCase();
    if (response.includes("approved") || response.includes("approve")) {
      events.push({
        type: "plan_approved",
        category: "plan",
        data: "plan approved by user",
        priority: 1,
      });
    } else if (response.includes("rejected") || response.includes("decline") || response.includes("denied")) {
      events.push({
        type: "plan_rejected",
        category: "plan",
        data: safeString(`plan rejected: ${input.tool_response ?? ""}`),
        priority: 2,
      });
    }

    return events;
  }

  // Detect plan file writes (Write/Edit to ~/.claude/plans/)
  if (input.tool_name === "Write" || input.tool_name === "Edit") {
    const filePath = String(input.tool_input["file_path"] ?? "");
    if (isPlanFilePath(filePath)) {
      return [{
        type: "plan_file_write",
        category: "plan",
        data: safeString(`plan file: ${filePath.split(/[/\\]/).pop() ?? filePath}`),
        priority: 2,
      }];
    }
  }

  if (input.tool_name === "apply_patch") {
    if (isToolError(input)) return [];
    const patchTargets = extractApplyPatchTargets(
      String(input.tool_input["command"] ?? input.tool_input["patch"] ?? ""),
    );
    return patchTargets
      .filter((target) => isPlanFilePath(target.path))
      .map((target) => ({
        type: "plan_file_write",
        category: "plan",
        data: safeString(`plan file: ${target.path.split(/[/\\]/).pop() ?? target.path}`),
        priority: 2,
      }));
  }

  return [];
}

/**
 * Category 8: env
 * Environment setup commands in Bash: venv, export, nvm, pyenv, conda, rbenv.
 */

const ENV_PATTERNS: RegExp[] = [
  /\bsource\s+\S*activate\b/,
  /\bexport\s+\w+=/,
  /\bnvm\s+use\b/,
  /\bpyenv\s+(shell|local|global)\b/,
  /\bconda\s+activate\b/,
  /\brbenv\s+(shell|local|global)\b/,
  /\bnpm\s+install\b/,
  /\bnpm\s+ci\b/,
  /\bpip\s+install\b/,
  /\bbun\s+install\b/,
  /\byarn\s+(add|install)\b/,
  /\bpnpm\s+(add|install)\b/,
  /\bcargo\s+(install|add)\b/,
  /\bgo\s+(install|get)\b/,
  /\brustup\b/,
  /\basdf\b/,
  /\bvolta\b/,
  /\bdeno\s+install\b/,
];

function extractEnv(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Bash") return [];

  const cmd = String(input.tool_input["command"] ?? "");
  const isEnvCmd = ENV_PATTERNS.some(p => p.test(cmd));
  if (!isEnvCmd) return [];

  // Sanitize export commands to prevent secret leakage
  const sanitized = cmd.replace(/\bexport\s+(\w+)=\S*/g, "export $1=***");

  return [{
    type: "env",
    category: "env",
    data: safeString(sanitized),
    priority: 2,
  }];
}

/**
 * Category 10: skill
 * Skill tool invocations.
 */
function extractSkill(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Skill") return [];

  const skillName = String(input.tool_input["skill"] ?? "");
  return [{
    type: "skill",
    category: "skill",
    data: safeString(skillName),
    priority: 2,
  }];
}

/**
 * Category 16: constraint
 * Constraints discovered through error events — tool failures reveal
 * platform/environment limitations worth remembering.
 */
function extractConstraint(input: HookInput): SessionEvent[] {
  // Only fire on error events — constraints are discovered through failures
  if (!input.tool_response?.includes("Error") && !input.tool_output?.isError) return [];

  const response = String(input.tool_response || "");
  const patterns = [/not supported/i, /cannot/i, /does not support/i, /FAIL/i, /refused/i, /permission denied/i, /incompatible/i];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      // Extract context around the match
      const idx = response.toLowerCase().indexOf(match[0].toLowerCase());
      const context = response.slice(Math.max(0, idx - 50), Math.min(response.length, idx + 200)).trim();
      return [{
        type: "constraint_discovered",
        category: "constraint",
        data: safeString(context),
        priority: 2,
      }];
    }
  }
  return [];
}

/**
 * Category 9: subagent
 * Agent tool calls — tracks both launch and completion.
 * When tool_response is present, the agent has completed and the result
 * is captured at higher priority (P2) so it survives budget trimming.
 */
function extractSubagent(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Agent") return [];

  const prompt = safeString(String(input.tool_input["prompt"] ?? input.tool_input["description"] ?? ""));
  const response = input.tool_response ? safeString(String(input.tool_response)) : "";
  const isCompleted = response.length > 0;

  return [{
    type: isCompleted ? "subagent_completed" : "subagent_launched",
    category: "subagent",
    data: isCompleted
      ? safeString(`[completed] ${prompt} → ${response}`)
      : safeString(`[launched] ${prompt}`),
    priority: isCompleted ? 2 : 3,
  }];
}

/**
 * Category 14: mcp
 * MCP tool calls (context7, playwright, claude-mem, ctx-stats, etc.).
 */
function extractMcp(input: HookInput): SessionEvent[] {
  const { tool_name, tool_input, tool_response } = input;
  if (!tool_name.startsWith("mcp__")) return [];

  // Extract readable tool name: last segment after __
  const parts = tool_name.split("__");
  const toolShort = parts[parts.length - 1] || tool_name;

  // Extract first string argument for context
  const firstArg = Object.values(tool_input).find((v): v is string => typeof v === "string");
  const argStr = firstArg ? `: ${safeString(String(firstArg))}` : "";

  // Append tool_response so ctx_search can find what the MCP returned — not
  // just the call shape. Without this, bodies from external MCPs (jira tickets,
  // grafana loki lines, sentry issues, context7 docs) are invisible to search.
  // No truncation: matches the rule_content precedent above — SQLite TEXT is
  // unbounded and large responses are the ones a cache most wants to preserve.
  const responseStr = tool_response && tool_response.length > 0
    ? `\nresponse: ${safeString(tool_response)}`
    : "";

  return [{
    type: "mcp",
    category: "mcp",
    data: safeString(`${toolShort}${argStr}${responseStr}`),
    priority: 3,
  }];
}

/**
 * Category 27: mcp_tool_call
 * Records the raw MCP call shape (tool_name + tool_input) so analytics
 * can compute usage patterns like batch concurrency.
 *
 * Distinct from `extractMcp` (category "mcp"), which captures the textual
 * call+response for FTS5 search. This emits a structured JSON payload
 * keyed by tool_name + params, capped to ~2KB to keep SQLite rows small.
 *
 * Priority 4 (informational) — should not crowd out high-signal events
 * during FIFO eviction.
 */
const MCP_PARAMS_BUDGET_BYTES = 2048;

/**
 * UTF-8-aware string truncation. Returns the longest prefix of `s` whose
 * UTF-8 byte length is <= `maxBytes`, never landing mid-multibyte-codepoint.
 *
 * Naive `s.slice(0, N)` operates on UTF-16 code units, so a 2KB cap could
 * either over-shoot (multi-byte codepoints occupy fewer code units than
 * bytes — e.g. a chunk of CJK / emoji-heavy JSON would silently exceed
 * the byte budget) or land mid surrogate pair (corrupt JSON downstream).
 */
function truncateToBytes(s: string, maxBytes: number): { value: string; truncated: boolean } {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return { value: s, truncated: false };
  const buf = Buffer.from(s, "utf8");
  // Walk back from maxBytes until the byte starts a fresh codepoint:
  //   0xxxxxxx → ASCII (start)
  //   11xxxxxx → start of multi-byte
  //   10xxxxxx → continuation; keep walking
  let cut = maxBytes;
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return { value: buf.subarray(0, cut).toString("utf8"), truncated: true };
}

/**
 * Keys whose VALUES must be redacted before persisting tool_input — secrets,
 * tokens, credentials, signatures. Match is on the LAST path segment of the
 * key (case-insensitive substring), so `headers.Authorization`, `auth.token`,
 * `apiKey`, `API_KEY`, `password`, `secret`, `cookie`, `set-cookie`, `signature`,
 * `private_key`, etc. all redact. False-positive risk acceptable — we'd rather
 * over-redact than ship a Bearer token to SQLite.
 */
const SECRET_KEY_PATTERN =
  /(authorization|auth_token|access_token|refresh_token|bearer|token|secret|password|passwd|pwd|api[-_]?key|apikey|cookie|set-cookie|signature|private[-_]?key|client[-_]?secret|x[-_]?api[-_]?key)/i;

const REDACTED = "[REDACTED]";

/**
 * Walk an arbitrary JSON-serializable value and return a clone with values
 * redacted under any key matching SECRET_KEY_PATTERN. Cycle-safe.
 */
function redactSecrets(value: unknown, ancestors: WeakSet<object> = new WeakSet()): unknown {
  if (value == null || typeof value !== "object") return value;
  // Path-based ancestor check: only flag TRUE cycles, not DAG / shared refs
  // (e.g., a single `headers` object passed to multiple sub-requests must
  // be processed at every reference site, not flagged as circular).
  if (ancestors.has(value as object)) return "[CIRCULAR]";
  ancestors.add(value as object);

  let out: unknown;
  if (Array.isArray(value)) {
    out = value.map((v) => redactSecrets(v, ancestors));
  } else {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        obj[k] = REDACTED;
      } else {
        obj[k] = redactSecrets(v, ancestors);
      }
    }
    out = obj;
  }

  ancestors.delete(value as object); // pop ancestor — siblings can re-visit
  return out;
}

function extractMcpToolCall(input: HookInput): SessionEvent[] {
  const { tool_name, tool_input } = input;
  if (!tool_name.startsWith("mcp__")) return [];

  // Redact secrets BEFORE serialization. Any `tool_input` carrying
  // `Authorization: Bearer …`, `api_key: "sk-…"`, cookies, signatures, etc.
  // is masked before it touches SQLite. Over-redaction acceptable — under-
  // redaction is a credential leak to SessionDB.
  const redactedInput = redactSecrets(tool_input ?? {});

  // Serialize the redacted shape, then truncate the *string* (not the object)
  // so the diagnosable shape survives huge payloads.
  let paramsStr: string;
  try {
    paramsStr = JSON.stringify(redactedInput);
  } catch {
    paramsStr = "{}";
  }
  const { value: cappedStr, truncated } = truncateToBytes(paramsStr, MCP_PARAMS_BUDGET_BYTES);

  const payload = truncated
    ? `{"tool_name":${JSON.stringify(tool_name)},"params_raw":${JSON.stringify(cappedStr)},"truncated":true}`
    : `{"tool_name":${JSON.stringify(tool_name)},"params":${cappedStr}}`;

  return [{
    type: "mcp_tool_call",
    category: "mcp_tool_call",
    data: safeString(payload),
    priority: 4,
  }];
}

/**
 * Category 6 (tool-based): decision
 * AskUserQuestion tool — tracks questions posed to user and their answers.
 */
function extractDecision(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "AskUserQuestion") return [];

  const questions = input.tool_input["questions"];
  const questionText = Array.isArray(questions) && questions.length > 0
    ? String((questions[0] as Record<string, unknown>)["question"] ?? "")
    : "";

  // tool_response is a JSON string that echoes the full request payload
  // alongside the answers map: {"questions":[...],"answers":{"<q>":"<label>"}}.
  // Stringifying the raw blob leaks the echoed questions/options into the
  // event row and surfaces as "Unhandled case: [object Object]" downstream.
  const rawResponse = String(input.tool_response ?? "");
  let answerText = "";
  try {
    const parsed = JSON.parse(rawResponse) as { answers?: Record<string, unknown> };
    const answers = parsed?.answers;
    if (answers && typeof answers === "object") {
      // multiSelect: true answers arrive as string[]; single-select arrive as
      // string. Normalize both into a `" | "`-joined string so neither shape
      // silently produces an empty answer.
      const toAnswerText = (value: unknown): string => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
          return value.filter((v): v is string => typeof v === "string").join(" | ");
        }
        return "";
      };

      const matched = questionText ? toAnswerText(answers[questionText]) : "";
      if (matched) {
        answerText = matched;
      } else {
        const values = Object.values(answers)
          .map(toAnswerText)
          .filter((v) => v.length > 0);
        answerText = values.join(" | ");
      }
    }
  } catch {
    // Non-JSON tool_response — fail safe with empty answer rather than
    // leaking the raw text (which would re-introduce the original bug
    // for any future caller that sends a non-JSON payload).
  }

  const answer = safeString(answerText);
  const summary = questionText
    ? `Q: ${safeString(questionText)} → A: ${answer}`
    : `answer: ${answer}`;

  return [{
    type: "decision_question",
    category: "decision",
    data: safeString(summary),
    priority: 2,
  }];
}

/**
 * Category 22: agent-finding
 * When the Agent tool completes (subagent returns), capture a structured
 * summary of its findings (first 500 chars of tool_response).
 */
function extractAgentFinding(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Agent") return [];
  if (!input.tool_response || input.tool_response.length === 0) return [];

  const summary = input.tool_response.length > 500
    ? input.tool_response.slice(0, 500)
    : input.tool_response;

  return [{
    type: "agent_finding",
    category: "agent-finding",
    data: safeString(summary),
    priority: 2,
  }];
}

/**
 * Category 24: external-ref
 * Scan tool_input and tool_response for external URLs, GitHub issues, and PRs.
 * Deduplicates found refs and skips internal URLs (localhost, 127.0.0.1).
 */
function extractExternalRef(input: HookInput): SessionEvent[] {
  const haystack = [
    safeStringAny(input.tool_input),
    safeString(input.tool_response),
  ].join(" ");

  if (haystack.length === 0) return [];

  const refs = new Set<string>();

  // URLs — skip localhost / 127.0.0.1
  const urlMatches = haystack.match(/https?:\/\/[^\s)]+/g);
  if (urlMatches) {
    for (let url of urlMatches) {
      // Strip trailing punctuation that gets captured from JSON/prose
      url = url.replace(/["'})\],;.]+$/, "");
      if (!/localhost|127\.0\.0\.1/i.test(url)) {
        refs.add(url);
      }
    }
  }

  // Full GitHub issue/PR URLs are already captured above.
  // Shorthand GitHub issue refs: #123 (only bare, not inside a URL)
  const issueMatches = haystack.match(/(?<!\w)#(\d+)/g);
  if (issueMatches) {
    for (const m of issueMatches) {
      refs.add(m);
    }
  }

  if (refs.size === 0) return [];

  // ctx_fetch_and_index returns a preamble like
  //   "Fetched and indexed **5 sections** (47.50KB) from: <label>"
  // Parse the size to credit bytes_avoided on the event so per-session
  // honest-savings stats reflect what was kept out of the context window.
  // KB literal in the preamble is decimal (KB = 1024 bytes per the formatter).
  let bytesAvoided: number | undefined;
  const preambleMatch = safeString(input.tool_response).match(
    /Fetched and indexed[^\(]*\(([\d.]+)\s*KB\)/i,
  );
  if (preambleMatch) {
    const kb = Number(preambleMatch[1]);
    if (Number.isFinite(kb) && kb > 0) {
      bytesAvoided = Math.round(kb * 1024);
    }
  }

  const event: SessionEvent = {
    type: "external_ref",
    category: "external-ref",
    data: safeString(Array.from(refs).join(", ")),
    priority: 3,
  };
  if (bytesAvoided !== undefined) event.bytes_avoided = bytesAvoided;
  return [event];
}

/**
 * Category 8: env (worktree)
 * EnterWorktree + ExitWorktree tools — tracks worktree lifecycle.
 */
function extractWorktree(input: HookInput): SessionEvent[] {
  if (input.tool_name === "EnterWorktree") {
    const name = String(input.tool_input["name"] ?? "unnamed");
    return [{
      type: "worktree",
      category: "env",
      data: safeString(`entered worktree: ${name}`),
      priority: 2,
    }];
  }

  if (input.tool_name === "ExitWorktree") {
    const discard = Boolean(input.tool_input["discard_changes"]);
    return [{
      type: "worktree_exit",
      category: "env",
      data: safeString(`exited worktree (discard_changes:${discard})`),
      priority: 2,
    }];
  }

  return [];
}

/**
 * Algorithmic URL host extraction — no regex.
 * Skips scheme, returns everything up to the first path/query/fragment marker.
 * Port is preserved as part of the host signature.
 */
function extractHostFromUrl(url: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const protoEnd = url.indexOf("://");
  if (protoEnd < 0) return null;
  const start = protoEnd + 3;
  if (start >= url.length) return null;
  let end = url.length;
  for (let i = start; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c === 47 || c === 63 || c === 35) { end = i; break; }
  }
  const host = url.slice(start, end);
  return host.length > 0 ? host : null;
}

/**
 * WebFetch response metadata — captures bytes/code/durationMs and host
 * (privacy: never the full URL or query string). Redirect-loop detection
 * is temporal, not single-field — SDK has no redirect_url.
 */
function extractWebFetchMetadata(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "WebFetch") return [];
  const resp = input.tool_response;
  if (typeof resp !== "string" || resp.length === 0) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(resp); } catch { return []; }
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof obj.code === "number") parts.push(`code:${obj.code}`);
  if (typeof obj.bytes === "number") parts.push(`bytes:${obj.bytes}`);
  if (typeof obj.durationMs === "number") parts.push(`durMs:${obj.durationMs}`);
  if (typeof obj.url === "string") {
    const host = extractHostFromUrl(obj.url);
    if (host) parts.push(`host:${host}`);
  }

  if (parts.length === 0) return [];

  return [{
    type: "webfetch_metadata",
    category: "data",
    data: safeString(parts.join(" ")),
    priority: 3,
  }];
}

/**
 * Bash outcome signals — captures the three fields that DO exist on
 * BashOutput (SDK :2160-2200): interrupted (boolean), stderr (length-only
 * for privacy), returnCodeInterpretation (semantic non-zero exit hint).
 * NO exit_code field exists in the SDK.
 */
function extractBashOutcome(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Bash") return [];
  const resp = input.tool_response;
  if (typeof resp !== "string" || resp.length === 0) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(resp); } catch { return []; }
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const hasSignal =
    typeof obj.interrupted === "boolean" ||
    typeof obj.stderr === "string" ||
    typeof obj.returnCodeInterpretation === "string";
  if (!hasSignal) return [];

  const parts: string[] = [];
  if (typeof obj.interrupted === "boolean") {
    parts.push(`interrupted:${obj.interrupted}`);
  }
  if (typeof obj.returnCodeInterpretation === "string") {
    parts.push(`rcInterp:${obj.returnCodeInterpretation.slice(0, 80)}`);
  }
  if (typeof obj.stderr === "string") {
    parts.push(`stderrBytes:${obj.stderr.length}`);
  }

  return [{
    type: "bash_outcome",
    category: "data",
    data: safeString(parts.join(" ")),
    priority: 3,
  }];
}

/**
 * FileReadOutput size metadata — branches on the text/image variant.
 * Captures sizes/line counts only; never file content. Image dimensions
 * are formatted as "WxH" when both width/height are numeric.
 */
function extractFileReadMetadata(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Read") return [];
  const resp = input.tool_response;
  if (typeof resp !== "string" || resp.length === 0) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(resp); } catch { return []; }
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const variant = obj.type;
  if (variant !== "text" && variant !== "image") return [];

  const parts: string[] = [`type:${variant}`];

  if (variant === "text") {
    if (typeof obj.numLines === "number") parts.push(`lines:${obj.numLines}`);
    if (typeof obj.totalLines === "number") parts.push(`totalLines:${obj.totalLines}`);
    if (typeof obj.startLine === "number") parts.push(`start:${obj.startLine}`);
  } else {
    if (typeof obj.originalSize === "number") parts.push(`origSize:${obj.originalSize}`);
    const dims = obj.dimensions;
    if (dims && typeof dims === "object") {
      const d = dims as Record<string, unknown>;
      if (typeof d.width === "number" && typeof d.height === "number") {
        parts.push(`dims:${d.width}x${d.height}`);
      }
    }
  }

  return [{
    type: "file_read_metadata",
    category: "data",
    data: safeString(parts.join(" ")),
    priority: 3,
  }];
}

/**
 * Per-model USD price table — Anthropic public list pricing, $/MTok.
 * Verified against platform.claude.com/docs/en/about-claude/pricing,
 * cloudzero.com, finout.io 2026-06 (cache: 5-min cache_write = 1.25× input,
 * cache_read = 0.10× input). Fast-mode variants (e.g. opus-4-8-fast at
 * $10/$50) are intentionally NOT mapped — they ship as separate model
 * ids and would dilute the standard-tier dashboards if blended here.
 *
 * NOTE: 16-oss-verify-gap-prd Gap #1 quoted Opus at $15/$75 — that is
 * the prior Opus 4 (non-4.7) rate. Opus 4.7 and 4.8 ship at $5/$25.
 */
const MODEL_PRICING_USD_PER_MTOK: Record<string, {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}> = {
  "claude-opus-4-8":   { input: 5.00, output: 25.00, cache_write: 6.25, cache_read: 0.50 },
  "claude-opus-4-7":   { input: 5.00, output: 25.00, cache_write: 6.25, cache_read: 0.50 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 },
  "claude-haiku-4-5":  { input: 1.00, output:  5.00, cache_write: 1.25, cache_read: 0.10 },
  default:             { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 },
};

function resolveModelKey(input: HookInput, parsedResp: Record<string, unknown>): string {
  const candidates: unknown[] = [
    input.tool_input?.model,
    (input as unknown as Record<string, unknown>).model,
    parsedResp.model,
  ];
  const keys = Object.keys(MODEL_PRICING_USD_PER_MTOK).filter((k) => k !== "default");
  for (const c of candidates) {
    if (typeof c !== "string" || c.length === 0) continue;
    if (c in MODEL_PRICING_USD_PER_MTOK) return c;
    // Prefix match for date-suffixed model ids
    // (e.g. claude-haiku-4-5-20251001 → claude-haiku-4-5)
    for (const key of keys) {
      if (c.startsWith(key)) return key;
    }
  }
  return "default";
}

function computeCostUsd(
  modelKey: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
): number {
  const price = MODEL_PRICING_USD_PER_MTOK[modelKey] ?? MODEL_PRICING_USD_PER_MTOK.default;
  const totalMicroDollars =
    inputTokens * price.input +
    outputTokens * price.output +
    cacheCreationTokens * price.cache_write +
    cacheReadTokens * price.cache_read;
  return totalMicroDollars / 1_000_000;
}

/**
 * AgentOutput.usage capture — fires on the Task sub-agent dispatcher.
 * Captures the 7 cost/perf fields from sdk-tools.d.ts:64-75. Derives
 * cost_usd from per-model pricing (Gap #1 fix). The platform persists
 * these as typed columns post-release; the bridge emits them as
 * structured tokens in event.data for forward-compatible ingestion.
 */
function extractAgentUsage(input: HookInput): SessionEvent[] {
  if (input.tool_name !== "Task") return [];
  const resp = input.tool_response;
  if (typeof resp !== "string" || resp.length === 0) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(resp); } catch { return []; }
  if (!parsed || typeof parsed !== "object") return [];

  const out = parsed as Record<string, unknown>;
  const usage = (out.usage && typeof out.usage === "object")
    ? out.usage as Record<string, unknown>
    : {};

  const hasSignal =
    typeof out.totalTokens === "number" ||
    typeof out.totalDurationMs === "number" ||
    typeof usage.input_tokens === "number" ||
    typeof usage.output_tokens === "number" ||
    typeof usage.service_tier === "string";
  if (!hasSignal) return [];

  const parts: string[] = [];
  if (typeof out.totalTokens === "number") parts.push(`totalTokens:${out.totalTokens}`);
  if (typeof out.totalDurationMs === "number") parts.push(`totalDurMs:${out.totalDurationMs}`);
  if (typeof usage.input_tokens === "number") parts.push(`tokens_in:${usage.input_tokens}`);
  if (typeof usage.output_tokens === "number") parts.push(`tokens_out:${usage.output_tokens}`);
  if (typeof usage.cache_creation_input_tokens === "number") {
    parts.push(`cache_create:${usage.cache_creation_input_tokens}`);
  }
  if (typeof usage.cache_read_input_tokens === "number") {
    parts.push(`cache_read:${usage.cache_read_input_tokens}`);
  }
  if (typeof usage.service_tier === "string") {
    parts.push(`tier:${usage.service_tier.slice(0, 32)}`);
  }

  // Gap #1 (16-oss-verify-gap-prd) — derive cost_usd from per-model pricing
  // when at least one token count is present. Zero-token case skips cost
  // so dashboard never shows misleading "$0.00 for nothing" rows.
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  const cacheCreate = typeof usage.cache_creation_input_tokens === "number"
    ? usage.cache_creation_input_tokens
    : 0;
  const cacheRead = typeof usage.cache_read_input_tokens === "number"
    ? usage.cache_read_input_tokens
    : 0;
  const anyTokens = inputTokens > 0 || outputTokens > 0 || cacheCreate > 0 || cacheRead > 0;
  if (anyTokens) {
    const modelKey = resolveModelKey(input, out);
    const cost = computeCostUsd(modelKey, inputTokens, outputTokens, cacheCreate, cacheRead);
    parts.push(`cost_usd:${cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0")}`);
  }

  return [{
    type: "agent_usage",
    category: "cost",
    data: safeString(parts.join(" ")),
    priority: 2,
  }];
}

// ── User-message extractors ────────────────────────────────────────────────

/**
 * Category 6: decision
 * User corrections / approach selections.
 *
 * Universal-rule detector (Hybrid C, issue #535):
 *   A decision message typically takes the structural shape
 *     "{negation/rejection} X {separator} Y" — across every human language.
 *
 *   We treat the following as the structural shape:
 *     - contains a clause separator (ASCII `,` `;`, fullwidth `，` `；`,
 *       Japanese ideographic `、`, Arabic `،`), AND
 *     - codepoint length is in the corrective range (15..500), AND
 *     - the message is not a question (no cross-script `?`), AND
 *     - contains at least one alphabetic codepoint.
 *
 *   The renderer prints the raw message back to the next LLM, so the gate
 *   only needs to be a coarse "looks like a correction" filter — the LLM
 *   handles fine-grained interpretation. No per-language keyword list.
 */

const CLAUSE_SEPARATOR_PATTERN = /[,;，；、،]/u;
const DECISION_MIN_CHARS = 15;
const DECISION_MAX_CHARS = 500;

function looksLikeDecision(trimmed: string): boolean {
  if (QUESTION_MARK_PATTERN.test(trimmed)) return false;
  if (!ALPHABETIC_PATTERN.test(trimmed)) return false;
  if (!CLAUSE_SEPARATOR_PATTERN.test(trimmed)) return false;
  const codepointLength = [...trimmed].length;
  return codepointLength >= DECISION_MIN_CHARS && codepointLength <= DECISION_MAX_CHARS;
}

function extractUserDecision(message: string): SessionEvent[] {
  const trimmed = message.trim();
  if (!looksLikeDecision(trimmed)) return [];

  return [{
    type: "decision",
    category: "decision",
    data: safeString(message),
    priority: 2,
  }];
}

/**
 * Category 7: role
 * Persona / behavioral directive patterns.
 *
 * Universal-rule detector (Hybrid C, issue #535):
 *   A persona/role statement is structurally a single non-question clause
 *   of moderate length containing more than one lexical token — e.g.
 *     "You are a senior engineer", "Tu es développeur",
 *     "あなたは経験豊富なエンジニアです", "Sen kıdemli mühendisisin".
 *
 *   We treat the following as the structural shape:
 *     - codepoint length is in the persona range (12..120), AND
 *     - is not a question (no cross-script `?`), AND
 *     - is a single clause (no clause separator that would mark it as a
 *       decision), AND
 *     - carries enough lexical density: either two whitespace-separated
 *       runs of letters, OR a continuous Unicode-letter run of ≥6
 *       codepoints (a fallback for scripts without word spaces — Japanese,
 *       Chinese, Thai).
 *
 *   The renderer prints the raw message back to the next LLM verbatim,
 *   so the gate only needs a coarse "looks like a persona statement"
 *   filter — no per-language keyword list.
 */

// Lower bound accommodates information-dense scripts (Chinese, Japanese,
// Korean) where a complete persona sentence may use as few as 8 codepoints
// — e.g. "你是高级工程师" — while still excluding bare single-token noise.
const ROLE_MIN_CHARS = 8;
const ROLE_MAX_CHARS = 120;
const TWO_LEXICAL_TOKENS_PATTERN = /\p{L}+\s+\p{L}+/u;
const CONTINUOUS_LETTER_RUN_PATTERN = /\p{L}{6,}/u;

function looksLikeRole(trimmed: string): boolean {
  // Role prompts are persona-prefix shaped: the FIRST SENTENCE declares the
  // role (e.g. "You are a senior backend engineer. <long context...>").
  // Apply the structural test to the first clause only — real-world role
  // prompts often append context paragraphs that would blow the length cap
  // if we tested the whole message. First-clause shape is the load-bearing
  // signal across languages (English "You are X.", French "Tu es X.",
  // Japanese "あなたは X です。" all parse the same way under a period split).
  const firstClause = trimmed.split(/[.!\n。！]/u)[0].trim();
  if (QUESTION_MARK_PATTERN.test(firstClause)) return false;
  if (CLAUSE_SEPARATOR_PATTERN.test(firstClause)) return false;
  if (!ALPHABETIC_PATTERN.test(firstClause)) return false;
  const codepointLength = [...firstClause].length;
  if (codepointLength < ROLE_MIN_CHARS || codepointLength > ROLE_MAX_CHARS) return false;
  return (
    TWO_LEXICAL_TOKENS_PATTERN.test(firstClause) ||
    CONTINUOUS_LETTER_RUN_PATTERN.test(firstClause)
  );
}

function extractRole(message: string): SessionEvent[] {
  const trimmed = message.trim();
  if (!looksLikeRole(trimmed)) return [];

  return [{
    type: "role",
    category: "role",
    data: safeString(message),
    priority: 3,
  }];
}

/**
 * Category 13: intent
 * Session mode classification from user messages.
 *
 * Universal-rule detector (Hybrid C, issue #535):
 *   investigate — message contains a question mark from any script:
 *                 ASCII `?` U+003F, fullwidth `？` U+FF1F, Arabic `؟` U+061F,
 *                 Spanish opening `¿` U+00BF.
 *                 (Greek `;` U+037E and Armenian `՞` U+055E are excluded —
 *                  Greek shares its codepoint with ASCII semicolon, which
 *                  would produce false positives across the corpus.)
 *
 * Structural / Unicode-aware — no per-language keyword list.
 */

const QUESTION_MARK_PATTERN = /[?？؟¿]/u;

/**
 * "Imperative tone" structural heuristic for implement intent:
 *   - trimmed length < IMPERATIVE_MAX_CHARS codepoints (short directive,
 *     not a discursive paragraph)
 *   - contains no question mark from any script
 *   - contains at least one alphabetic codepoint (filters pure punctuation noise)
 *
 * `[...str]` walks Unicode codepoints so CJK / Indic scripts are measured
 * fairly against the budget rather than penalised by UTF-16 unit count.
 */
const ALPHABETIC_PATTERN = /\p{L}/u;
const IMPERATIVE_MAX_CHARS = 60;

function isImperativeTone(trimmed: string): boolean {
  if (QUESTION_MARK_PATTERN.test(trimmed)) return false;
  if (!ALPHABETIC_PATTERN.test(trimmed)) return false;
  const codepointLength = [...trimmed].length;
  return codepointLength > 0 && codepointLength < IMPERATIVE_MAX_CHARS;
}

function extractIntent(message: string): SessionEvent[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  let mode: string | undefined;

  if (QUESTION_MARK_PATTERN.test(trimmed)) {
    mode = "investigate";
  } else if (isImperativeTone(trimmed)) {
    mode = "implement";
  }

  if (!mode) return [];

  return [{
    type: "intent",
    category: "intent",
    data: safeString(mode),
    priority: 4,
  }];
}

/**
 * Category: session goal (objective).
 *
 * Captures the user's stated objective so it survives compaction and resume —
 * unlike `intent`, which stores only the coarse mode (investigate/implement)
 * and discards the goal text. Triggered by the `/goal <text>` command or an
 * explicit `goal:` / `objective:` marker, so the FULL goal text is preserved
 * (priority 4 = critical in the DB eviction contract) and restored at the top
 * of the resume snapshot.
 * Without this, a `/goal` directive is lost across compaction/resume.
 */
const GOAL_DIRECTIVE_PATTERN =
  /^(?:\/goal\s+|(?:goal|objective)\s*:\s*)(.+)$/is;

function extractGoal(message: string): SessionEvent[] {
  const trimmed = message.trim();
  if (!trimmed) return [];
  const match = trimmed.match(GOAL_DIRECTIVE_PATTERN);
  if (!match) return [];
  const goalText = match[1].trim();
  if (!goalText) return [];
  return [{
    type: "goal",
    category: "goal",
    data: safeString(goalText),
    priority: 4,
  }];
}

/**
 * Category 25: blocked-on
 * Detect when work is blocked on something, or when a blocker is resolved.
 *
 * Universal-rule detector (Hybrid C, issue #535):
 *   Programming-domain error markers are script-agnostic — they are
 *   emitted by tooling regardless of the user's spoken language. The
 *   words "Error", "Exception", "Traceback" stay in their original
 *   English form inside a Chinese / Arabic / Russian terminal log.
 *
 *   blocker matches:
 *     - the literal "Error:" / "Exception:" / "Traceback" tokens, OR
 *     - a Python-style frame line ("File ", `line:col`), OR
 *     - a JS / Java-style stack frame ("at <ident>(...)" with a
 *       `:line:col` suffix).
 *
 *   blocker_resolved matches:
 *     - a Unicode check-mark glyph (✓ U+2713, ✔ U+2714, ✅ U+2705,
 *       ☑ U+2611, 🎉 U+1F389), OR
 *     - the structural marker "fixed: …" / "resolved: …" — these are
 *       programming-domain conventions (git log, PR titles, CHANGELOG
 *       entries) rather than natural-language phrases.
 */

const BLOCKER_MARKERS_PATTERN = /(?:\bError\s*:|\bException\s*:|\bTraceback\b|\bat\s+\S+\s*\([^)]*:\d+:\d+\))/u;
const BLOCKER_RESOLVED_CHECKMARK_PATTERN = /[✓✔✅☑🎉]/u;
const BLOCKER_RESOLVED_MARKER_PATTERN = /^\s*(?:fixed|resolved)\s*:/iu;

function extractBlocker(message: string): SessionEvent[] {
  const events: SessionEvent[] = [];

  // Resolution takes precedence — if both shapes match, render the
  // happier signal so the snapshot reflects the latest state.
  const isResolved =
    BLOCKER_RESOLVED_CHECKMARK_PATTERN.test(message) ||
    BLOCKER_RESOLVED_MARKER_PATTERN.test(message);
  if (isResolved) {
    events.push({
      type: "blocker_resolved",
      category: "blocked-on",
      data: safeString(message),
      priority: 2,
    });
    return events;
  }

  if (BLOCKER_MARKERS_PATTERN.test(message)) {
    events.push({
      type: "blocker",
      category: "blocked-on",
      data: safeString(message),
      priority: 2,
    });
  }

  return events;
}

/**
 * Category 12: data
 * Large user-pasted data references (message > 1KB).
 */
function extractData(message: string): SessionEvent[] {
  if (message.length <= 1024) return [];

  return [{
    type: "data",
    category: "data",
    data: safeString(message),
    priority: 4,
  }];
}

// ── Cross-event stateful extractors ───────────────────────────────────────

/**
 * Category 23: error-resolution
 * Detects when an error is followed by a successful fix (cross-event state).
 */

let lastError: { tool: string; error: string; callsSince: number } | null = null;

function extractErrorResolution(input: HookInput): SessionEvent[] {
  const { tool_name, tool_response } = input;
  const response = String(tool_response ?? "");

  // If this call is an error, store it and return
  if (isToolError(input)) {
    lastError = { tool: tool_name, error: response.slice(0, 200), callsSince: 0 };
    return [];
  }

  // No pending error → nothing to resolve
  if (!lastError) return [];

  // Increment staleness counter
  lastError.callsSince++;

  // Timeout: clear after 10 calls without resolution
  if (lastError.callsSince > 10) {
    lastError = null;
    return [];
  }

  const callSucceeded = !isToolError(input);
  if (!callSucceeded) return [];

  // Check if this is a resolution: same tool, or Edit/Write after a Read error
  const sameTool = tool_name === lastError.tool;
  const editAfterReadError =
    lastError.tool === "Read"
    && (tool_name === "Edit" || tool_name === "Write" || tool_name === "apply_patch");

  if (sameTool || editAfterReadError) {
    const event: SessionEvent = {
      type: "error_resolved",
      category: "error-resolution",
      data: safeString(`Error in ${lastError.tool}: ${lastError.error} → Fixed`),
      priority: 2,
    };
    lastError = null;
    return [event];
  }

  return [];
}

/** Reset error-resolution state (for testing). */
export function resetErrorResolutionState(): void {
  lastError = null;
}

/**
 * Category 26: iteration-loop
 * Detects when the same tool is called repeatedly with similar input (stuck loop).
 */

const callHistory: Array<{ tool: string; inputHash: string }> = [];

function simpleHash(str: string): string {
  return `${str.length}:${str.slice(0, 20)}`;
}

function extractIterationLoop(input: HookInput): SessionEvent[] {
  const { tool_name, tool_input } = input;
  const inputHash = simpleHash(JSON.stringify(tool_input).slice(0, 200));

  callHistory.push({ tool: tool_name, inputHash });

  // Keep history bounded
  if (callHistory.length > 50) {
    callHistory.splice(0, callHistory.length - 50);
  }

  // Check last N entries for repeated pattern (minimum 3)
  if (callHistory.length < 3) return [];

  let count = 0;
  for (let i = callHistory.length - 1; i >= 0; i--) {
    if (callHistory[i].tool === tool_name && callHistory[i].inputHash === inputHash) {
      count++;
    } else {
      break;
    }
  }

  if (count >= 3) {
    // Reset the matching tail to avoid duplicate emissions
    callHistory.splice(callHistory.length - count);
    return [{
      type: "retry_detected",
      category: "iteration-loop",
      data: safeString(`${tool_name} called ${count} times with similar input`),
      priority: 2,
    }];
  }

  return [];
}

/** Reset iteration-loop state (for testing). */
export function resetIterationLoopState(): void {
  callHistory.length = 0;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Map platform-native tool names (Qwen Code, Gemini CLI, OpenCode, etc.) to the
 * canonical Claude Code names this extractor branches on. Without this, Qwen's
 * `run_shell_command` events would silently produce zero git/cwd/env extractions.
 *
 * Evidence: refs/platforms/qwen-code/packages/core/src/tools/tool-names.ts
 */
const TOOL_NAME_NORMALIZE: Record<string, string> = {
  // Qwen Code / Gemini CLI native names
  run_shell_command: "Bash",
  read_file: "Read",
  read_many_files: "Read",
  grep_search: "Grep",
  search_file_content: "Grep",
  web_fetch: "WebFetch",
  write_file: "Write",
  edit: "Edit",
  glob: "Glob",
  todo_write: "TodoWrite",
  ask_user_question: "AskUserQuestion",
  list_directory: "LS",
  save_memory: "Memory",
  skill: "Skill",
  exit_plan_mode: "ExitPlanMode",
  agent: "Agent",
  // OpenCode native names
  bash: "Bash",
  view: "Read",
  grep: "Grep",
  fetch: "WebFetch",
  // Codex CLI
  shell: "Bash",
  shell_command: "Bash",
  exec_command: "Bash",
  "container.exec": "Bash",
  local_shell: "Bash",
  grep_files: "Grep",
};

function normalizeHookInput(input: HookInput): HookInput {
  const normalized = TOOL_NAME_NORMALIZE[input.tool_name];
  if (!normalized || normalized === input.tool_name) return input;
  return { ...input, tool_name: normalized };
}

/**
 * Extract session events from a PostToolUse hook input.
 *
 * Accepts the raw hook JSON shape (snake_case keys) as received from stdin.
 * Returns an array of zero or more SessionEvents. Never throws.
 */
export function extractEvents(rawInput: HookInput): SessionEvent[] {
  try {
    const input = normalizeHookInput(rawInput);
    const events: SessionEvent[] = [];

    // File + Rule (handles Read/Edit/Write)
    events.push(...extractFileAndRule(input));

    // Bash-based extractors (may overlap on the same command)
    events.push(...extractCwd(input));
    events.push(...extractError(input));
    events.push(...extractGit(input));
    events.push(...extractEnv(input));

    // Tool-specific extractors
    events.push(...extractTask(input));
    events.push(...extractPlan(input));
    events.push(...extractSkill(input));
    events.push(...extractSubagent(input));
    events.push(...extractMcp(input));
    events.push(...extractMcpToolCall(input));
    events.push(...extractDecision(input));
    events.push(...extractConstraint(input));
    events.push(...extractWorktree(input));
    events.push(...extractWebFetchMetadata(input));
    events.push(...extractBashOutcome(input));
    events.push(...extractFileReadMetadata(input));
    events.push(...extractAgentUsage(input));
    events.push(...extractAgentFinding(input));
    events.push(...extractExternalRef(input));

    // Cross-event stateful extractors
    events.push(...extractErrorResolution(input));
    events.push(...extractIterationLoop(input));

    return events;
  } catch {
    // Graceful degradation: if extraction fails, session continues normally
    return [];
  }
}

/**
 * Extract session events from a UserPromptSubmit hook input (user message text).
 *
 * Handles: decision, role, intent, data categories.
 * Returns an array of zero or more SessionEvents. Never throws.
 */
export function extractUserEvents(message: string): SessionEvent[] {
  try {
    const events: SessionEvent[] = [];

    events.push(...extractUserPlan(message));
    events.push(...extractUserDecision(message));
    events.push(...extractRole(message));
    events.push(...extractIntent(message));
    events.push(...extractGoal(message));
    events.push(...extractBlocker(message));
    events.push(...extractData(message));

    return events;
  } catch {
    return [];
  }
}

/**
 * Issue #4 (new PRD) — SessionStart settings + MCP servers snapshot.
 *
 * Emits ONE session_settings_snapshot event when ≥1 setting is available
 * on the SessionStart input. The data field carries key:value tokens
 * (mcp_count, mcp_servers, model, permission_mode) so the platform can
 * compute MCP integration counts and primary-model adoption per org.
 * mcp_servers list is truncated to first 8 names.
 */
export function extractSessionSettings(input: unknown): SessionEvent[] {
  if (!input || typeof input !== "object") return [];

  const obj = input as Record<string, unknown>;
  const parts: string[] = [];

  const mcpServers = obj.mcp_servers;
  let mcpKeys: string[] | null = null;
  if (mcpServers && typeof mcpServers === "object" && !Array.isArray(mcpServers)) {
    mcpKeys = Object.keys(mcpServers as Record<string, unknown>);
    parts.push(`mcp_count:${mcpKeys.length}`);
    if (mcpKeys.length > 0) {
      parts.push(`mcp_servers:${mcpKeys.slice(0, 8).join(",")}`);
    }
  }

  if (typeof obj.model === "string") {
    parts.push(`model:${obj.model.slice(0, 64)}`);
  }

  if (typeof obj.permission_mode === "string") {
    parts.push(`permission_mode:${obj.permission_mode.slice(0, 32)}`);
  }

  if (parts.length === 0) return [];

  return [{
    type: "session_settings_snapshot",
    category: "env",
    data: safeString(parts.join(" ")),
    priority: 2,
  }];
}

/**
 * §11 Layer 1 + Layer 3 — multilingual prompt features.
 *
 * Reference: context-mode-platform/docs/prds/2026-06-insight-data-flow/
 *   11-multilingual-prompt-algorithm.md
 *
 * Script-agnostic via Unicode property regex (`\p{L}`, `\p{Lu}`,
 * `\p{Script=X}`). No per-language tables, no franc/fasttext deps.
 * Layer 1 returns 10 numeric/string features; Layer 3 appends a
 * `prompt_word_tokens: string[]` array for the platform's streaming
 * word-frequency UPSERT.
 *
 * Privacy: features carry no prose. Layer 3 tokens are deduped
 * letter-only words ≥3 chars; platform aggregates by (org_id, week,
 * word) so no individual token surfaces in UI.
 */
export interface PromptFeatures {
  prompt_length: number;
  prompt_word_count: number;
  prompt_uppercase_ratio: number;
  prompt_file_ref_count: number;
  prompt_path_ref_count: number;
  prompt_script_primary: string | null;
  prompt_script_count: number;
  prompt_question_glyph_count: number;
  prompt_code_block_count: number;
  prompt_url_count: number;
  prompt_word_tokens: string[];
}

const PROMPT_SCRIPT_NAMES = [
  "Latin", "Cyrillic", "Arabic", "Han", "Hangul",
  "Hiragana", "Katakana", "Devanagari", "Hebrew", "Thai", "Greek",
] as const;

const EMPTY_PROMPT_FEATURES: PromptFeatures = {
  prompt_length: 0,
  prompt_word_count: 0,
  prompt_uppercase_ratio: 0,
  prompt_file_ref_count: 0,
  prompt_path_ref_count: 0,
  prompt_script_primary: null,
  prompt_script_count: 0,
  prompt_question_glyph_count: 0,
  prompt_code_block_count: 0,
  prompt_url_count: 0,
  prompt_word_tokens: [],
};

/**
 * Verbatim mirror of §11 Layer 1 reference implementation + Layer 3
 * token extraction. Uses Unicode property regex per the spec — the
 * "no regex" project default does NOT apply here because the spec
 * explicitly mandates `\p{Script=X}` for script-agnostic classification.
 */
export function extractUserPromptFeatures(prompt: unknown): PromptFeatures {
  if (typeof prompt !== "string" || prompt.length === 0) {
    return { ...EMPTY_PROMPT_FEATURES, prompt_word_tokens: [] };
  }

  const letters = prompt.match(/\p{L}+/gu) ?? [];
  const upperCount = (prompt.match(/\p{Lu}/gu) ?? []).length;
  const totalLetters = letters.join("").length;
  const fences = (prompt.match(/```/g) ?? []).length;

  const scripts: Record<string, number> = {};
  for (const name of PROMPT_SCRIPT_NAMES) {
    const re = new RegExp(`\\p{Script=${name}}`, "gu");
    const n = (prompt.match(re) ?? []).length;
    if (n > 0) scripts[name] = n;
  }
  const primary =
    Object.entries(scripts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const word of letters) {
    if (word.length < 3) continue;
    const lower = word.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    tokens.push(lower);
  }

  return {
    prompt_length: prompt.length,
    prompt_word_count: letters.length,
    prompt_uppercase_ratio: totalLetters === 0 ? 0 : upperCount / totalLetters,
    prompt_file_ref_count: (prompt.match(/(\w+\/)+\w+\.\w+/g) ?? []).length,
    prompt_path_ref_count: (prompt.match(/\.{0,2}\/[\w\/.-]+/g) ?? []).length,
    prompt_script_primary: primary,
    prompt_script_count: Object.keys(scripts).length,
    prompt_question_glyph_count: (prompt.match(/[?？؟]/gu) ?? []).length,
    prompt_code_block_count: Math.floor(fences / 2),
    prompt_url_count: (prompt.match(/https?:\/\/[^\s]+/gu) ?? []).length,
    prompt_word_tokens: tokens,
  };
}

/**
 * UserPromptSubmit-driven `/plan` slash detector.
 *
 * Compensates for Claude Code Bug #15660: programmatic EnterPlanMode tool
 * calls fire PostToolUse, but the `/plan` slash command and Shift+Tab do
 * NOT. Shift+Tab is unrecoverable from the OSS bridge without an upstream
 * SDK change; this detector handles the slash case.
 *
 * Algorithmic (no regex): tolerate leading whitespace, require lowercase
 * "/plan", reject longer slashes like "/plans" via the next-char check.
 */
function extractUserPlan(message: string): SessionEvent[] {
  if (typeof message !== "string" || message.length === 0) return [];

  let i = 0;
  while (i < message.length) {
    const c = message.charCodeAt(i);
    if (c !== 32 && c !== 9) break;
    i++;
  }

  if (i + 5 > message.length) return [];
  if (message.slice(i, i + 5) !== "/plan") return [];

  if (i + 5 < message.length) {
    const next = message.charCodeAt(i + 5);
    const isWordBoundary =
      next === 32 || next === 9 || next === 10 || next === 13;
    if (!isWordBoundary) return [];
  }

  const arg = message.slice(i + 5).trim();
  const detail = arg.length > 0
    ? `plan via /plan slash: ${arg.slice(0, 120)}`
    : "plan via /plan slash";

  return [{
    type: "plan_enter",
    category: "plan",
    data: safeString(detail),
    priority: 2,
  }];
}
