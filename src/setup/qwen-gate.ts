// D-NI-QWEN-GATE-1: qwen 0.26.4 loads an enabled extension's hooks, then runs none of them while "disableAllHooks" is true
// in its system, user or project settings.json (live: the model saw the full 192 KB). Read-only: the user's file is never edited.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseHostConfig, hostConfigValueAt } from "../core/ops/host-config.ts";
import { hostText } from "../core/ops/host-text.ts";

const KEY = "disableAllHooks";
const SETTINGS = "settings.json";
const SYSTEM_ENV = "QWEN_CODE_SYSTEM_SETTINGS_PATH";
const HOME_ENV = "QWEN_HOME";
const DARWIN_SYSTEM = "/Library/Application Support/QwenCode/settings.json";
const WIN_SYSTEM = "C:\\ProgramData\\qwen-code\\settings.json";
const LINUX_SYSTEM = "/etc/qwen-code/settings.json";

/** The settings files qwen reads, as qwen resolves them (getSystemSettingsPath, getGlobalQwenDirLite, <cwd>/.qwen). */
function settingsFiles(env: Record<string, string | undefined>, home: string, cwd: string, platform: NodeJS.Platform): string[] {
  const sys = env[SYSTEM_ENV] || (platform === "darwin" ? DARWIN_SYSTEM : platform === "win32" ? WIN_SYSTEM : LINUX_SYSTEM);
  const userDir = env[HOME_ENV] || path.join(home, ".qwen");
  return [sys, path.join(userDir, SETTINGS), path.join(cwd, ".qwen", SETTINGS)];
}

/** One line naming the first qwen settings file that turns every hook off; undefined when none does. A file qwen cannot parse
 *  is qwen's own error, not ours. */
export function qwenHooksOff(env: Record<string, string | undefined>, home: string, cwd: string = process.cwd(), platform: NodeJS.Platform = process.platform): string | undefined {
  for (const file of settingsFiles(env, home, cwd, platform)) {
    if (!existsSync(file)) continue;
    let value: unknown;
    try { value = hostConfigValueAt(parseHostConfig("qwen", file, hostText(readFileSync(file, "utf8")), "jsonc"), [KEY]); } catch { continue; }
    if (value === true) return `qwen runs no hook: "${KEY}" is true in ${file}; set it to false`;
  }
  return undefined;
}
