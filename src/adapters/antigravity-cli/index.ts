/**
 * adapters/antigravity-cli — Google Antigravity CLI (`agy`) adapter.
 *
 * Integration: MCP tools plus agy's Claude-compatible hook surface. `agy`
 * reads its global MCP profile from `~/.gemini/config/mcp_config.json`
 * (distinct from the Antigravity IDE's `~/.gemini/antigravity/mcp_config.json`)
 * and hooks from `~/.gemini/config/hooks.json`, or from an installed agy
 * plugin's root `hooks.json`.
 *
 * context-mode wires only the surfaces that have a verified mapping:
 *   - PreToolUse for bounded routing enforcement on Bash/Read/Grep/WebFetch
 *   - PostToolUse capture for executed tool calls
 *   - best-effort Stop capture for session-end continuity when agy emits it
 *
 * PreInvocation/PostInvocation are intentionally not registered here: there is
 * no verified payload/response contract or shared context-mode pipeline target
 * for those agy events yet.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

import { AntigravityAdapter } from "../antigravity/index.js";
import { parseJsonc } from "../../util/jsonc.js";
import type {
  DiagnosticResult,
  HookParadigm,
  PlatformCapabilities,
  PostToolUseEvent,
  PostToolUseResponse,
  PreToolUseEvent,
  PreToolUseResponse,
} from "../types.js";

export function antigravityCliMcpConfigPath(): string {
  return resolve(homedir(), ".gemini", "config", "mcp_config.json");
}

export function antigravityCliConfigDir(): string {
  return resolve(homedir(), ".gemini", "antigravity-cli");
}

/** agy reads user hooks from ~/.gemini/config/hooks.json (sibling of mcp_config.json). */
export function antigravityCliHooksPath(): string {
  return resolve(homedir(), ".gemini", "config", "hooks.json");
}

/**
 * `agy plugin install <bundle>` registers MCP + hook + skill into agy's plugin
 * profile under ~/.gemini/config/plugins/<name>/ (verified on agy 1.0.6, re-verified 1.0.10) — the
 * canonical install. The global mcp_config.json / hooks.json paths above are the
 * manual (no-plugin) fallback. doctor must recognize BOTH.
 */
export function antigravityCliPluginDir(): string {
  return resolve(homedir(), ".gemini", "config", "plugins", "context-mode");
}
function antigravityCliPluginMcpPath(): string {
  return resolve(antigravityCliPluginDir(), "mcp_config.json");
}
function antigravityCliPluginHooksPath(): string {
  return resolve(antigravityCliPluginDir(), "hooks.json");
}

/** True if context-mode's MCP is registered in any agy profile (plugin or global). */
function readMcpRegistered(paths: string[]): { ok: boolean; where?: string } {
  for (const path of paths) {
    try {
      const config = parseJsonc<Record<string, unknown>>(readFileSync(path, "utf-8")) ?? {};
      const mcpServers = (config?.mcpServers as Record<string, unknown>) ?? {};
      if ("context-mode" in mcpServers) return { ok: true, where: path };
    } catch {
      /* unreadable/missing — try next */
    }
  }
  return { ok: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function agyProjectDir(raw: Record<string, unknown>): string | undefined {
  // Refs-backed FIRST: the only real upstream hook-payload example
  // (refs/platforms/antigravity-cli/examples/title/title.sh:10, README.md:11)
  // reads the working directory from `workspace.current_dir` — an OBJECT field,
  // not an array. Prefer it.
  const workspace = asRecord(raw.workspace);
  if (typeof workspace.current_dir === "string" && workspace.current_dir) {
    return workspace.current_dir;
  }
  // Fallback: `workspacePaths[0]` is empirically-derived/unverified (no upstream
  // doc or example confirms this shape) — retained as a defensive fallback only.
  const workspacePaths = raw.workspacePaths;
  return Array.isArray(workspacePaths) && workspacePaths.length > 0
    ? String(workspacePaths[0])
    : undefined;
}

function agySessionId(raw: Record<string, unknown>): string {
  // `conversationId` is empirically-derived/unverified — no upstream agy doc or
  // example confirms a session-id field in the hook payload. Kept as the
  // best-available identifier; falls back to the process id when absent.
  return typeof raw.conversationId === "string" && raw.conversationId
    ? raw.conversationId
    : `pid-${process.ppid}`;
}

function hookEntryHasCommand(entry: unknown, command: string): boolean {
  const e = asRecord(entry);
  // agy stores Stop (and its invocation hooks) as a flat list of handler
  // objects, so accept `command` directly as well as the grouped
  // matcher/hooks form PreToolUse/PostToolUse use (#1206).
  if (e.command === command) return true;
  const nested = Array.isArray(e.hooks) ? e.hooks : [];
  return nested.some((hook) => asRecord(hook).command === command);
}

function hookEntryJsonHasCommand(entry: unknown, command: string): boolean {
  return JSON.stringify(entry).includes(command);
}

function matcherCoversAgyPreToolUse(matcher: unknown): boolean {
  if (typeof matcher !== "string") return false;
  return ["run_command", "view_file", "grep_search", "web_fetch", "read_url_content"].every((tool) =>
    matcher.includes(tool),
  );
}

function hookGroupHasCommand(group: unknown, command: string): boolean {
  return Array.isArray(group) && group.some((entry) => hookEntryHasCommand(entry, command));
}

function hookGroupHasPreToolUse(group: unknown): boolean {
  return Array.isArray(group) && group.some((entry) => {
    const e = asRecord(entry);
    return matcherCoversAgyPreToolUse(e.matcher) && hookEntryHasCommand(entry, PRE_HOOK_COMMAND);
  });
}

/** True if all context-mode agy hooks are registered in plugin/global profiles. */
function readRegisteredHooks(paths: string[]): {
  ok: boolean;
  preOk: boolean;
  postOk: boolean;
  stopOk: boolean;
  where?: string;
} {
  const found = { preOk: false, postOk: false, stopOk: false, where: undefined as string | undefined };
  for (const path of paths) {
    try {
      const config = parseJsonc<Record<string, unknown>>(readFileSync(path, "utf-8")) ?? {};
      const hooks = (config.hooks as Record<string, unknown> | undefined) ?? {};
      const preOk = hookGroupHasPreToolUse(hooks.PreToolUse);
      const postOk = hookGroupHasCommand(hooks.PostToolUse, POST_HOOK_COMMAND);
      const stopOk = hookGroupHasCommand(hooks.Stop, STOP_HOOK_COMMAND);

      if ((preOk || postOk || stopOk) && !found.where) found.where = path;
      found.preOk ||= preOk;
      found.postOk ||= postOk;
      found.stopOk ||= stopOk;
    } catch {
      /* unreadable/missing — try next */
    }
  }
  // Stop is registered when possible, but agy 1.0.6 `-p` probes did not emit it
  // (no Stop-hook change in agy's changelog through 1.0.10). Treat it as
  // best-effort so doctor does not mark a working Pre/Post install
  // as degraded solely because Stop is absent.
  return { ...found, ok: found.preOk && found.postOk };
}

/** Dispatcher commands agy invokes from hooks.json. */
const PRE_HOOK_COMMAND = "context-mode hook antigravity-cli pretooluse";
const PRE_HOOK_MATCHER = "run_command|view_file|grep_search|web_fetch|read_url_content";
const POST_HOOK_COMMAND = "context-mode hook antigravity-cli posttooluse";
const STOP_HOOK_COMMAND = "context-mode hook antigravity-cli stop";

// Keep in sync with the identical agyContextReason in hooks/core/formatters.mjs:
// two copies exist because the bundled .mjs formatter (runtime hook path) and
// this TS adapter are separate layers; the deny-reason text must not drift.
function agyContextReason(additionalContext: string): string {
  const text = String(additionalContext ?? "")
    .replace(/<\/?context_guidance>/g, " ")
    .replace(/<\/?tip>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text
    ? `context-mode: use the context-mode MCP tools instead of this native tool. ${text}`
    : "context-mode: use the context-mode MCP tools instead of this native tool so raw bytes stay out of the conversation.";
}

function configureHookEntry(
  hooks: Record<string, unknown>,
  type: "PreToolUse" | "PostToolUse" | "Stop",
  desired: Record<string, unknown>,
  command: string,
): boolean {
  const current = Array.isArray(hooks[type]) ? hooks[type] : [];
  const desiredJson = JSON.stringify(desired);
  const alreadyExact =
    current.some((entry) => JSON.stringify(entry) === desiredJson) &&
    current.every((entry) => !hookEntryJsonHasCommand(entry, command) || JSON.stringify(entry) === desiredJson);
  if (alreadyExact) return false;

  hooks[type] = [
    ...current.filter((entry) => !hookEntryJsonHasCommand(entry, command)),
    desired,
  ];
  return true;
}

export class AntigravityCliAdapter extends AntigravityAdapter {
  readonly name = "Antigravity CLI";
  readonly paradigm: HookParadigm = "json-stdio";

  readonly capabilities: PlatformCapabilities = {
    preToolUse: true,
    postToolUse: true,
    preCompact: false,
    sessionStart: false,
    canModifyArgs: false,
    canModifyOutput: false,
    canInjectSessionContext: false,
  };

  getSettingsPath(): string {
    return antigravityCliMcpConfigPath();
  }

  getConfigDir(_projectDir?: string): string {
    return antigravityCliConfigDir();
  }

  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const payload = asRecord(raw);
    const toolCall = asRecord(payload.toolCall);
    return {
      toolName: typeof toolCall.name === "string" ? toolCall.name : "",
      toolInput: asRecord(toolCall.args),
      sessionId: agySessionId(payload),
      projectDir: agyProjectDir(payload),
      raw,
    };
  }

  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const payload = asRecord(raw);
    const toolCall = asRecord(payload.toolCall);
    const error = typeof payload.error === "string" ? payload.error : "";
    return {
      toolName: typeof toolCall.name === "string" ? toolCall.name : "",
      toolInput: asRecord(toolCall.args),
      toolOutput: error,
      isError: error.length > 0,
      sessionId: agySessionId(payload),
      projectDir: agyProjectDir(payload),
      raw,
    };
  }

  formatPreToolUseResponse(response: PreToolUseResponse): unknown {
    if (response.decision === "deny") {
      return { decision: "deny", reason: response.reason ?? "Denied by context-mode" };
    }
    if (response.decision === "ask") {
      // Fallback reason so a security-policy ask is never a bare prompt
      // (mirrors hooks/core/formatters.mjs antigravity-cli.ask).
      return {
        decision: "ask",
        reason: response.reason ?? "Action requires user confirmation",
      };
    }
    if (response.decision === "context" && response.additionalContext) {
      return {
        decision: "deny",
        reason: agyContextReason(response.additionalContext),
      };
    }
    return null;
  }

  formatPostToolUseResponse(_response: PostToolUseResponse): unknown {
    return undefined;
  }

  checkPluginRegistration(): DiagnosticResult {
    // Accept the plugin profile (the canonical `agy plugin install` location,
    // ~/.gemini/config/plugins/context-mode/mcp_config.json) OR the global
    // mcp_config.json (the manual no-plugin fallback).
    const { ok, where } = readMcpRegistered([
      antigravityCliPluginMcpPath(),
      this.getSettingsPath(),
    ]);
    if (ok) {
      return {
        check: "MCP registration",
        status: "pass",
        message: `context-mode found in Antigravity CLI mcpServers (${where})`,
      };
    }
    return {
      check: "MCP registration",
      status: "fail",
      message: "context-mode not found in Antigravity CLI mcpServers",
      fix: "agy plugin install https://github.com/mksglu/context-mode/tree/main/configs/antigravity-cli",
    };
  }

  getInstalledVersion(): string {
    // Plugin install: read the real version from the installed plugin manifest so
    // the doctor compares a true semver against npm latest (PASS when current,
    // a meaningful "outdated bundle" WARN otherwise) — not the literal "configured"
    // which produced the bogus "vconfigured, latest vX" line.
    try {
      const manifest = parseJsonc<Record<string, unknown>>(
        readFileSync(resolve(antigravityCliPluginDir(), "plugin.json"), "utf-8"),
      );
      if (manifest && typeof manifest.version === "string" && manifest.version) {
        return manifest.version;
      }
    } catch {
      /* not plugin-installed — fall through */
    }
    // Manual (global-profile) registration has no plugin manifest: report the
    // version-less "standalone" MCP mode so doctor shows INFO, not a false WARN.
    if (readMcpRegistered([this.getSettingsPath()]).ok) return "standalone";
    return "not installed";
  }

  /**
   * Write/merge the agy hooks into ~/.gemini/config/hooks.json (manual,
   * non-plugin path). Idempotent — unrelated hook entries are preserved.
   */
  configureAllHooks(_pluginRoot: string): string[] {
    const changes: string[] = [];
    const hooksPath = antigravityCliHooksPath();

    let config: Record<string, unknown> = {};
    try {
      config = parseJsonc<Record<string, unknown>>(readFileSync(hooksPath, "utf-8")) ?? {};
    } catch {
      /* fresh file */
    }

    const hooks = (config.hooks as Record<string, unknown> | undefined) ?? {};
    const desiredPre = {
      matcher: PRE_HOOK_MATCHER,
      hooks: [{ type: "command", command: PRE_HOOK_COMMAND }],
    };
    const desiredPost = {
      matcher: "",
      hooks: [{ type: "command", command: POST_HOOK_COMMAND }],
    };
    // agy 1.2.x rejects the whole hooks.json when Stop uses the grouped
    // matcher/hooks form; it expects Stop as a flat list of handler objects
    // (its bundled docs table groups only PreToolUse/PostToolUse) (#1206).
    const desiredStop = {
      type: "command",
      command: STOP_HOOK_COMMAND,
    };

    const changedPre = configureHookEntry(hooks, "PreToolUse", desiredPre, PRE_HOOK_COMMAND);
    const changedPost = configureHookEntry(hooks, "PostToolUse", desiredPost, POST_HOOK_COMMAND);
    const changedStop = configureHookEntry(hooks, "Stop", desiredStop, STOP_HOOK_COMMAND);
    const changed = changedPre || changedPost || changedStop;

    if (changed) {
      config.hooks = hooks;
      mkdirSync(dirname(hooksPath), { recursive: true });
      writeFileSync(hooksPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      changes.push(`Configured Antigravity CLI PreToolUse/PostToolUse hooks and best-effort Stop hook in ${hooksPath}`);
    }

    return changes;
  }

  /** Report agy hook status across plugin and manual profiles. */
  validateHooks(_pluginRoot: string): DiagnosticResult[] {
    // Accept the plugin profile (the canonical `agy plugin install` location,
    // ~/.gemini/config/plugins/context-mode/hooks.json) OR the global hooks.json
    // (the manual `context-mode upgrade` fallback).
    const { ok, where, preOk, postOk, stopOk } = readRegisteredHooks([
      antigravityCliPluginHooksPath(),
      antigravityCliHooksPath(),
    ]);
    const missing = [
      preOk ? null : "PreToolUse",
      postOk ? null : "PostToolUse",
      // Stop is best-effort; do not include it in the health gate.
    ].filter(Boolean).join(", ");
    return [
      {
        check: "Antigravity CLI hooks",
        status: ok ? "pass" : "warn",
        message: ok
          ? `PreToolUse guard and PostToolUse capture configured in ${where}${stopOk ? "; best-effort Stop hook also configured" : ""}`
          : `Antigravity CLI hooks incomplete (${missing || "none found"} missing) — MCP tools still work, but bounded routing enforcement and session capture are degraded. Run \`agy plugin install https://github.com/mksglu/context-mode/tree/main/configs/antigravity-cli\` or \`context-mode upgrade\` to repair hooks.`,
        ...(ok ? {} : { fix: "agy plugin install https://github.com/mksglu/context-mode/tree/main/configs/antigravity-cli" }),
      },
    ];
  }
}
