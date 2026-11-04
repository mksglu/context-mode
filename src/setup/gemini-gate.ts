// D-NI-GEMINI-GATE-1: conditions under which gemini-cli 0.66.0 has the context-mode extension installed but runs none of
// its hooks (live, temp HOME, fake model; `gemini extensions list` showed the extension enabled in each case):
//   - hooksConfig.enabled=false in the merged settings (system > workspace > user), bundle key "hooksConfig.enabled";
//   - our hook command named in hooksConfig.disabled (union of the scopes);
//   - admin.extensions.enabled=false (ExtensionManager loads no extension);
//   - the extension disabled for the workspace scope only (`Enabled (Workspace): false`).
// Doctor and setup only read these files; they never write a user's setting.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseHostConfig, hostConfigValueAt } from "../core/ops/host-config.ts";
import { hostText } from "../core/ops/host-text.ts";
import { AGENT_FLAG, HOOK_BUNDLE } from "./registry.ts";

const GEMINI_DIR = ".gemini";
const SETTINGS_FILE = "settings.json";
const SYSTEM_PATH_ENV = "GEMINI_CLI_SYSTEM_SETTINGS_PATH";
const OWN_AGENT = "gemini";

type Env = Record<string, string | undefined>;
interface Source { file: string; doc: unknown }

function systemSettingsPath(env: Env): string {
  const set = env[SYSTEM_PATH_ENV];
  if (set) return set;
  if (process.platform === "darwin") return "/Library/Application Support/GeminiCli/settings.json";
  if (process.platform === "win32") return "C:\\ProgramData\\gemini-cli\\settings.json";
  return "/etc/gemini-cli/settings.json";
}

function load(file: string): Source | undefined {
  if (!existsSync(file)) return undefined;
  try { return { file, doc: parseHostConfig(OWN_AGENT, file, hostText(readFileSync(file, "utf8")), "jsonc") }; }
  catch { return undefined; } // an unreadable file is the host's to report; the gate stays silent
}

/** Lowest to highest precedence, as gemini merges them: user, workspace, system. */
function sources(env: Env, home: string, cwd: string): Source[] {
  return [path.join(home, GEMINI_DIR, SETTINGS_FILE), path.join(cwd, GEMINI_DIR, SETTINGS_FILE), systemSettingsPath(env)]
    .map(load).filter((s): s is Source => s !== undefined);
}

function ownHookEntry(entry: unknown): boolean {
  return typeof entry === "string" && entry.includes(HOOK_BUNDLE) && entry.includes(`${AGENT_FLAG} ${OWN_AGENT}`);
}

/** One line (what stops the hooks, and the fix), or undefined when no setting gates our hooks. */
export function geminiSettingsGate(env: Env, home: string, cwd: string): string | undefined {
  const srcs = sources(env, home, cwd);
  for (const s of srcs) {
    if (hostConfigValueAt(s.doc, ["admin", "extensions", "enabled"]) === false) {
      return `${s.file}: admin.extensions.enabled is false, so gemini loads no extension and runs no context-mode hook; an administrator must change it`;
    }
  }
  let winner: Source | undefined;
  for (const s of srcs) if (typeof hostConfigValueAt(s.doc, ["hooksConfig", "enabled"]) === "boolean") winner = s;
  if (winner && hostConfigValueAt(winner.doc, ["hooksConfig", "enabled"]) === false) {
    return `${winner.file}: hooksConfig.enabled is false, so gemini runs no hook; set it to true`;
  }
  for (const s of srcs) {
    const off = hostConfigValueAt(s.doc, ["hooksConfig", "disabled"]);
    const own = Array.isArray(off) ? off.find(ownHookEntry) : undefined;
    if (own !== undefined) return `${s.file}: hooksConfig.disabled lists the context-mode hook (${own}), so gemini skips it; remove that entry`;
  }
  return undefined;
}
