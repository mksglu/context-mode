// impl/07 §6 step 5 (config regeneration), §2 (readHostConfig, mergeOwnEntries, #849 .jsonc pick);
// DEVIATIONS D-M5-O1-3, D-M5-O1-4, D-M5-U1-6, D-M5-U5-1. One write path: copy the original to
// <file>UPGRADE_TRASH_SUFFIX, write <file>.tmp, rename over <file>; any failure puts the original back.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  AGENT_HOME_DIR, HOST_CONFIG_TMP_SUFFIX, OPENCODE_BASE_CONFIG_FILE, OWN_MCP_ENTRY,
  SETTINGS_FILE, UPGRADE_AREA_KEY_SEP, UPGRADE_TRASH_SUFFIX,
} from "../contracts/constants.ts";
import type { AdapterRow, AgentId, HostConfigEdit, UpgradeChangeRow } from "../contracts/types.ts";
import { type AtomicOptions, removeTmpFile, renameWithRetry, replaceFailure, unlinkWithRetry } from "./atomic-file.ts";
import { opencodeDirOf, ownMcpFileOf, piAgentDirOf } from "../project/config-dir.ts";
import { mergeOwnEntries, readHostConfig } from "./host-config.ts";
import { withLayout } from "./host-text.ts";

/** Writes `text` to `file`. Injected only by tests to force a failure mid-write (GP11 rollback). */
export type HostFileWriter = (file: string, text: string) => void;

export interface HostWriteOptions { env?: NodeJS.ProcessEnv; write?: HostFileWriter; atomic?: AtomicOptions; }

function defaultWrite(file: string, text: string): void {
  writeFileSync(file, text, "utf8");
}

/** The host config file ctx_upgrade regenerates for `agent` (D-M5-U5-1). OpenCode: the .json base name;
 *  readHostConfig picks a sibling .jsonc (#849). Copilot CLI has no host config entry (its hook file ships
 *  with the release, D-M5-O1-4): null. */
export function hostConfigPath(agent: AgentId, home: string, env: NodeJS.ProcessEnv): string | null {
  const own = OWN_MCP_ENTRY[agent];
  if (own !== undefined) return ownMcpFileOf(agent, own.file, env, home);
  switch (agent) {
    case "opencode": return join(opencodeDirOf(env, home), OPENCODE_BASE_CONFIG_FILE); // D-WIN-OPENCODE-DIR-1
    case "pi": return join(piAgentDirOf(env, home), SETTINGS_FILE);
    case "copilot-cli": return null;
    default: return join(home, ...AGENT_HOME_DIR[agent], SETTINGS_FILE);
  }
}

function cell(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value);
}

function toRow(file: string, edit: HostConfigEdit): UpgradeChangeRow {
  return { area: file + UPGRADE_AREA_KEY_SEP + edit.path, before: cell(edit.before), after: cell(edit.after) };
}

/** Replace `file` with `text`. The original is copied to the trash name first and put back on any failure,
 *  so the file is either the old text or the new text, never half written. */
function writeWithRollback(file: string, text: string, write: HostFileWriter, atomic: AtomicOptions): void {
  const trash = file + UPGRADE_TRASH_SUFFIX;
  const tmp = `${file}${HOST_CONFIG_TMP_SUFFIX}.${process.pid}`; // per process: two runs do not share a tmp file
  const had = existsSync(file);
  mkdirSync(dirname(file), { recursive: true });
  if (had) copyFileSync(file, trash);
  try {
    write(tmp, text);
    renameWithRetry(tmp, file, atomic);
  } catch (err) {
    removeTmpFile(tmp, atomic);
    if (!had) { removeTmpFile(file, atomic); throw replaceFailure(file, err); }
    try { renameWithRetry(trash, file, atomic); } catch (restoreErr) {
      // D-WIN-ATOMIC-5: the host holds the file; the original stays in the trash copy, so say where it is.
      throw new Error(`${replaceFailure(file, err).message}. The original is kept at ${trash}`, { cause: restoreErr });
    }
    throw replaceFailure(file, err);
  }
  // The new file is in place. A held trash copy is a leftover, not a failed write.
  try { unlinkWithRetry(trash, atomic); } catch { /* leftover backup copy; the next run overwrites it */ }
}

/** impl/07 §6 step 5: read the agent's host config, regenerate context-mode's own entries, write it back with
 *  rollback. A file that does not exist yet is created as an empty document of its format (GP1 valid config).
 *  Returns one UpgradeChangeRow per HostConfigEdit. CONFIG_PARSE_FAILED propagates and nothing is written. */
export function regenerateHostConfig(row: AdapterRow, home: string, opts: HostWriteOptions = {}): UpgradeChangeRow[] {
  const env = opts.env ?? process.env;
  const requested = hostConfigPath(row.id, home, env);
  if (requested === null) return [];
  const current = readHostConfig(row.id, requested);
  const result = mergeOwnEntries(row.id, current.text, current.format, row);
  const exists = existsSync(current.path);
  if (exists && result.text === current.text) return [];
  const text = result.text === "" && current.format !== "toml" ? JSON.stringify({}) : result.text;
  writeWithRollback(current.path, current.layout === undefined ? text : withLayout(text, current.layout), opts.write ?? defaultWrite, opts.atomic ?? {});
  return result.edits.map((e) => toRow(current.path, e));
}
