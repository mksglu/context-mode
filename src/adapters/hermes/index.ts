/** Native Hermes Agent adapter. Hermes hooks are bridged by the root Python plugin. */
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { BaseAdapter, resolveContextModeDataRoot } from "../base.js";
import type { HookAdapter, HookParadigm, PlatformCapabilities, DiagnosticResult, PreToolUseEvent, PostToolUseEvent, PreCompactEvent, SessionStartEvent, PreToolUseResponse, PostToolUseResponse, PreCompactResponse, SessionStartResponse, HookRegistration } from "../types.js";

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;

export class HermesAdapter extends BaseAdapter implements HookAdapter {
  constructor() { super([".hermes"]); }
  readonly name = "Hermes Agent";
  readonly paradigm: HookParadigm = "python-plugin";
  readonly capabilities: PlatformCapabilities = {
    preToolUse: true, postToolUse: true, preCompact: false, sessionStart: true,
    canModifyArgs: false, canModifyOutput: true, canInjectSessionContext: true,
  };
  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const r = record(raw); return { toolName: text(r.tool_name), toolInput: record(r.args), sessionId: text(r.session_id, "hermes"), projectDir: text(r.project_dir) || undefined, raw };
  }
  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const r = record(raw); return { ...this.parsePreToolUseInput(raw), toolOutput: text(r.result), isError: r.is_error === true };
  }
  parsePreCompactInput(raw: unknown): PreCompactEvent { const r = record(raw); return { sessionId: text(r.session_id, "hermes"), projectDir: text(r.project_dir) || undefined, raw }; }
  parseSessionStartInput(raw: unknown): SessionStartEvent { const r = record(raw); const source = r.source === "resume" || r.source === "compact" || r.source === "clear" ? r.source : "startup"; return { sessionId: text(r.session_id, "hermes"), source, projectDir: text(r.project_dir) || undefined, raw }; }
  formatPreToolUseResponse(response: PreToolUseResponse): unknown { return response; }
  formatPostToolUseResponse(response: PostToolUseResponse): unknown { return response; }
  formatPreCompactResponse(response: PreCompactResponse): unknown { return response; }
  formatSessionStartResponse(response: SessionStartResponse): unknown { return response; }
  getConfigDir(): string {
    const configured = process.env.HERMES_HOME;
    if (!configured || configured.trim() === "") return join(homedir(), ".hermes");
    return configured.startsWith("~")
      ? resolve(homedir(), configured.replace(/^~[/\\]?/, ""))
      : resolve(configured);
  }
  getSessionDir(): string {
    const override = resolveContextModeDataRoot();
    const dir = join(override ?? this.getConfigDir(), "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  getSettingsPath(): string { return join(this.getConfigDir(), "config.yaml"); }
  getInstructionFiles(): string[] { return ["HERMES.md", "AGENTS.md"]; }
  generateHookConfig(_pluginRoot: string): HookRegistration { return {}; }
  readSettings(): Record<string, unknown> | null { return null; }
  writeSettings(_settings: Record<string, unknown>): void { /* Hermes owns YAML config. */ }
  validateHooks(pluginRoot: string): DiagnosticResult[] { return [{ check: "Hermes plugin", status: existsSync(join(pluginRoot, "plugin.yaml")) ? "pass" : "fail", message: "Native Python control-plane manifest" }]; }
  checkPluginRegistration(): DiagnosticResult { return { check: "Plugin registration", status: "pass", message: "Managed by `hermes plugins`" }; }
  getInstalledVersion(): string { return "standalone"; }
  configureAllHooks(_pluginRoot: string): string[] { return []; }
  setHookPermissions(_pluginRoot: string): string[] { return []; }
  updatePluginRegistry(_pluginRoot: string, _version: string): void { /* managed by Hermes */ }
}
