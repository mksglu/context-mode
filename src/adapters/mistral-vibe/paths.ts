/**
 * adapters/mistral-vibe/paths — Config directory resolution for Mistral Vibe.
 *
 * Vibe honors the VIBE_HOME environment variable for relocated installs,
 * falling back to ~/.vibe when unset. Mirrors Vibe's own resolution logic
 * in vibe/core/config/harness_files/_harness_manager.py.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Resolve the Mistral Vibe user config directory.
 *
 * Precedence:
 *   1. $VIBE_HOME env var (expanded, absolute) — matches Vibe's own logic
 *   2. ~/.vibe (default)
 *
 * Contract: ALWAYS returns an absolute path.
 */
export function resolveVibeConfigDir(): string {
  const envVal = process.env.VIBE_HOME;
  if (envVal) {
    if (envVal.startsWith("~")) {
      return resolve(homedir(), envVal.replace(/^~[/\\]?/, ""));
    }
    return resolve(envVal);
  }
  return resolve(homedir(), ".vibe");
}
