// impl/07 §6 (ctx_upgrade), ADR-0010 §4, ADR-0011, DECISIONS-r3 Q16 Q21; DEVIATIONS D-M5-U1-1..6, D-M5-U2..U7, D-M5-U8-1..3.
// Thin handler: step 0 plugin-root check, then upgrade (the agent's own update command, host config regeneration,
// v1 removal) or uninstall (ops/uninstall.ts). Reply: change table + "restart needed".
// D-R44-UPGRADE-NATIVE-1 (#1309): no git clone; every agent updates with its own command (UPGRADE_HOST_COMMAND).
import { z } from "zod/v4";
import {
  TABLE_CELL_SEP, TABLE_PIPE, TABLE_PIPE_ESCAPED, TABLE_ROW_END, TABLE_ROW_START, UPGRADE_DEFAULT_MODE,
  UPGRADE_HOST_AREA, UPGRADE_HOST_COMMAND, UPGRADE_MODES, UPGRADE_NOT_FOUND, UPGRADE_PLUGIN_ROOT_AREA,
  UPGRADE_RESTART_LINE, UPGRADE_TABLE_HEADER, UPGRADE_TABLE_RULE,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { AdapterRow, CtxUpgradeInput, ProjectContext, ToolContext, ToolReply, UpgradeChangeRow } from "../contracts/types.ts";
import { getAdapter } from "../../adapters/table.ts";
import { claudeDirOf, hostUpdateCommand, copilotDirOf, geminiDirOf, kiroDirOf, opencodeDirOf, piAgentDirOf, requireHomeDir } from "../project/config-dir.ts";
import { detectV1 } from "../ops/detect-v1.ts";
import { regenerateHostConfig, type HostFileWriter } from "../ops/host-write.ts";
import { ownBundleDir } from "../ops/bundle-dir.ts";
import { resolvePluginRoot } from "../ops/plugin-root.ts";
import { runUninstall } from "../ops/uninstall.ts";
import { removeV1, type V1Removal } from "../ops/v1-remove.ts";
import { unknownField } from "./search.ts";

export type { CtxUpgradeInput } from "../contracts/types.ts";

export const ctxUpgradeSchema = z.object({
  mode: z.enum(UPGRADE_MODES).optional(),
  confirmDelete: z.boolean().optional(),
}, { error: unknownField }).strict();

/** What the handler takes from its ToolContext and process; tests pass a temp HOME and a failing writer (D-M5-U8-1). */
export interface UpgradeDeps {
  project: Pick<ProjectContext, "projectKey" | "worktree" | "agent">;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  write?: HostFileWriter;
}

function row(area: string, before: string, after: string): UpgradeChangeRow {
  return { area, before, after };
}

// The running server bundle's dir: the same anchor host-config.ts uses for the MCP entry (D-M3-arch-3).
function bundleDir(): string {
  return ownBundleDir(); // D-OC2-BUNDLE-DIR-1
}

// Step 0 (both modes): resolvePluginRoot vs the running bundle dir. Equal: no row. Different or missing: one
// row, the stale-cache class (I2-0) that step 4 corrects (D-M5-U8-2).
function pluginRootRow(adapter: AdapterRow, env: NodeJS.ProcessEnv): UpgradeChangeRow[] {
  const own = bundleDir();
  let root: string;
  try {
    root = resolvePluginRoot(adapter, env);
  } catch (err) {
    if (err instanceof CtxError && err.code === "PLUGIN_ROOT_MISSING") return [row(UPGRADE_PLUGIN_ROOT_AREA, UPGRADE_NOT_FOUND, own)];
    throw err;
  }
  return root === own ? [] : [row(UPGRADE_PLUGIN_ROOT_AREA, root, own)];
}

function hostRow(adapter: AdapterRow, env: NodeJS.ProcessEnv): UpgradeChangeRow {
  return row(UPGRADE_HOST_AREA, "", hostUpdateCommand(adapter.id, env)); // #1338: the profile words come from one function, shared with doctor D1
}

// Steps 4-7. Step 4 is the agent's own update command (the user runs it); step 5 rewrites only context-mode's own
// entries; a failure after v1 removal puts every removed path back. Host config writes roll back on their own.
function upgrade(adapter: AdapterRow, deps: UpgradeDeps, home: string): UpgradeChangeRow[] {
  let removal: V1Removal | null = null;
  try {
    const step5 = regenerateHostConfig(adapter, home, { env: deps.env, write: deps.write });
    const findings = detectV1(adapter.id, home, { project: deps.project.worktree, piAgentDir: piAgentDirOf(deps.env, home), claudeDir: claudeDirOf(deps.env, home), geminiDir: geminiDirOf(deps.env, home), copilotDir: copilotDirOf(deps.env, home), kiroDir: kiroDirOf(deps.env, home), opencodeDir: opencodeDirOf(deps.env, home) });
    removal = removeV1(adapter.id, findings, deps.project.worktree);
    const rows = [hostRow(adapter, deps.env), ...step5, ...removal.rows];
    removal.commit();
    return rows;
  } catch (err) {
    removal?.rollback();
    throw err;
  }
}

function cell(text: string): string {
  return text.split(TABLE_PIPE).join(TABLE_PIPE_ESCAPED);
}

function renderTable(rows: readonly UpgradeChangeRow[]): string {
  const lines = [UPGRADE_TABLE_HEADER, UPGRADE_TABLE_RULE];
  for (const r of rows) lines.push(TABLE_ROW_START + [r.area, r.before, r.after].map(cell).join(TABLE_CELL_SEP) + TABLE_ROW_END);
  return lines.join("\n");
}

/** impl/07 §6 steps 1-8 and Uninstall steps 1-6, with the process inputs passed in (D-M5-U8-1). */
export async function runUpgrade(input: CtxUpgradeInput, deps: UpgradeDeps): Promise<ToolReply> {
  const adapter = getAdapter(deps.project.agent);
  const home = requireHomeDir(deps.env);
  const rows = pluginRootRow(adapter, deps.env);
  if ((input.mode ?? UPGRADE_DEFAULT_MODE) === "uninstall") {
    const result = runUninstall({ adapter, project: deps.project, env: deps.env, confirmDelete: input.confirmDelete === true });
    rows.push(...result.rows);
  } else {
    rows.push(...upgrade(adapter, deps, home));
  }
  return { text: renderTable(rows) + "\n\n" + UPGRADE_RESTART_LINE, isError: false, sandboxBytes: 0 };
}

async function handler(input: CtxUpgradeInput, ctx: ToolContext): Promise<ToolReply> {
  return runUpgrade(input, { project: ctx.project, env: process.env, signal: ctx.signal });
}

export const ctxUpgrade = Object.freeze({
  name: "ctx_upgrade",
  description: "",
  schema: ctxUpgradeSchema,
  readOnly: false,
  alwaysLoad: false,
  handler,
});
