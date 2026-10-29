// D-NI-VSCODE-GATE-1: conditions under which VS Code (microsoft/vscode main, 1.144.0 bundle) has our hook file
// ~/.copilot/hooks/context-mode-vscode.json but loads no hook (promptsServiceImpl.ts getHooks: `useChatHooks &&
// isWorkspaceTrusted && areAgentHooksAllowed`; PromptsConfig.getLocationsValue + getPromptSourceFolders):
//   - chat.useHooks is false (workspace .vscode/settings.json wins over the user settings.json);
//   - chat.hookFilesLocations is set and leaves out "~/.copilot/hooks" (a configured object replaces the defaults);
//   - managed-settings.json (GitHubCopilot) has allowManagedHooksOnly or strictPluginOnlyCustomization true.
// Workspace trust is kept in VS Code's own state db, so the gate cannot read it. Doctor and setup only read these files.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { vscodeUserDirOf } from "../core/project/config-dir.ts";
import { hostConfigValueAt, parseHostConfig } from "../core/ops/host-config.ts";
import { hostText } from "../core/ops/host-text.ts";

const SETTINGS_FILE = "settings.json";
const WORKSPACE_DIR = ".vscode";
const USE_HOOKS_KEY = "chat.useHooks";
const LOCATIONS_KEY = "chat.hookFilesLocations";
const OWN_LOCATION = "~/.copilot/hooks";
const MANAGED_KEYS = ["allowManagedHooksOnly", "strictPluginOnlyCustomization"];

type Env = Record<string, string | undefined>;
interface Source { file: string; doc: unknown }

function load(file: string): Source | undefined {
  if (!existsSync(file)) return undefined;
  try { return { file, doc: parseHostConfig("vscode", file, hostText(readFileSync(file, "utf8")), "jsonc") }; }
  catch { return undefined; } // an unreadable file is the host's to report; the gate stays silent
}

/** The file VS Code reads for managed settings on this platform (copilotManagedSettings.ts). */
export function managedSettingsPath(env: Env): string {
  if (process.platform === "darwin") return "/Library/Application Support/GitHubCopilot/managed-settings.json";
  if (process.platform === "win32") return path.join(env.ProgramFiles || "C:\\Program Files", "GitHubCopilot", "managed-settings.json");
  return "/etc/github-copilot/managed-settings.json";
}

/** One line (what stops the hooks, and the fix), or undefined when no setting gates our hooks. */
export function vscodeSettingsGate(env: Env, home: string, cwd: string, managedFile: string = managedSettingsPath(env)): string | undefined {
  const managed = load(managedFile);
  if (managed) {
    for (const key of MANAGED_KEYS) {
      if (hostConfigValueAt(managed.doc, [key]) === true) {
        return `${managed.file}: ${key} is true, so VS Code runs no user hook file; an administrator must change it`;
      }
    }
  }
  // Lowest to highest precedence: user, then workspace.
  const srcs = [path.join(vscodeUserDirOf(env as NodeJS.ProcessEnv, home), SETTINGS_FILE), path.join(cwd, WORKSPACE_DIR, SETTINGS_FILE)]
    .map(load).filter((s): s is Source => s !== undefined);
  let hooks: Source | undefined;
  let locations: Source | undefined;
  for (const s of srcs) {
    if (typeof hostConfigValueAt(s.doc, [USE_HOOKS_KEY]) === "boolean") hooks = s;
    const v = hostConfigValueAt(s.doc, [LOCATIONS_KEY]);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) locations = s;
  }
  if (hooks && hostConfigValueAt(hooks.doc, [USE_HOOKS_KEY]) === false) {
    return `${hooks.file}: ${USE_HOOKS_KEY} is false, so VS Code runs no hook; set it to true`;
  }
  if (locations) {
    const v = hostConfigValueAt(locations.doc, [LOCATIONS_KEY]) as Record<string, unknown>;
    if (v[OWN_LOCATION] !== true) {
      return `${locations.file}: ${LOCATIONS_KEY} leaves out "${OWN_LOCATION}", so VS Code does not read the context-mode hook file; add "${OWN_LOCATION}": true`;
    }
  }
  return undefined;
}
