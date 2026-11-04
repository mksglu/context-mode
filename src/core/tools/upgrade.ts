// impl/07 §6 (ctx_upgrade), ADR-0010 §4, ADR-0011, DECISIONS-r3 Q16 Q21; DEVIATIONS D-M5-U1-1..6, D-M5-U2..U7, D-M5-U8-1..3.
// Thin handler: step 0 plugin-root check, then upgrade (host row or git checkout fetch -> verify -> swap,
// host config regeneration, v1 removal) or uninstall (ops/uninstall.ts). Reply: change table + "restart needed".
import { existsSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod/v4";
import {
  PLUGIN_CURRENT_LINK, RELEASE_REPO_URL, TABLE_CELL_SEP, TABLE_PIPE,
  TABLE_PIPE_ESCAPED, TABLE_ROW_END, TABLE_ROW_START, UPGRADE_CACHE_AREA, UPGRADE_CHECKOUT_AREA, UPGRADE_DEFAULT_MODE,
  UPGRADE_GIT_CHECKOUT_AGENTS, UPGRADE_HOST_AREA, UPGRADE_HOST_COMMAND, UPGRADE_HOST_MANUAL, UPGRADE_MODES,
  UPGRADE_NOT_FOUND, UPGRADE_PLUGIN_ROOT_AREA, UPGRADE_REMOVED, UPGRADE_RESTART_LINE, UPGRADE_TABLE_HEADER,
  UPGRADE_TABLE_RULE,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { AdapterRow, CtxUpgradeInput, ProjectContext, ToolContext, ToolReply, UpgradeChangeRow } from "../contracts/types.ts";
import { getAdapter } from "../../adapters/table.ts";
import { claudeDirOf, copilotDirOf, kiroDirOf, opencodeDirOf, piAgentDirOf, requireHomeDir } from "../project/config-dir.ts";
import { detectV1 } from "../ops/detect-v1.ts";
import { regenerateHostConfig, type HostFileWriter } from "../ops/host-write.ts";
import { resolvePluginRoot } from "../ops/plugin-root.ts";
import { swapPluginCurrent, type PluginSwapResult } from "../ops/plugin-swap.ts";
import { fetchRelease } from "../ops/release-fetch.ts";
import { runUninstall } from "../ops/uninstall.ts";
import { removeV1, type V1Removal } from "../ops/v1-remove.ts";
import { verifySums } from "../ops/verify-sums.ts";
import { unknownField } from "./search.ts";

export type { CtxUpgradeInput } from "../contracts/types.ts";

export const ctxUpgradeSchema = z.object({
  mode: z.enum(UPGRADE_MODES).optional(),
  confirmDelete: z.boolean().optional(),
}, { error: unknownField }).strict();

/** What the handler takes from its ToolContext and process; tests pass a temp HOME, a local release repo and a
 *  failing writer (D-M5-U8-1). */
export interface UpgradeDeps {
  project: Pick<ProjectContext, "projectKey" | "worktree" | "agent">;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  releaseUrl: string;
  write?: HostFileWriter;
}

function row(area: string, before: string, after: string): UpgradeChangeRow {
  return { area, before, after };
}

// The running server bundle's dir: the same anchor host-config.ts uses for the MCP entry (D-M3-arch-3).
function bundleDir(): string {
  return dirname(process.argv[1] ?? "");
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

function isCurrent(agentDir: string, dir: string): boolean {
  const link = join(agentDir, PLUGIN_CURRENT_LINK);
  return existsSync(link) && realpathSync.native(link) === realpathSync.native(dir);
}

interface Checkout { rows: UpgradeChangeRow[]; agentDir: string; swap: PluginSwapResult; }

// Step 4 git checkout (pi, opencode): fetch -> verify -> swap. A fetched tree that fails SHA256SUMS is removed
// unless `current` already points at it, then BUNDLE_HASH_MISMATCH propagates.
async function checkout(adapter: AdapterRow, deps: UpgradeDeps): Promise<Checkout> {
  const fetched = await fetchRelease(adapter.id, deps.releaseUrl, deps.env, deps.signal);
  const agentDir = dirname(fetched.dir);
  try {
    verifySums(fetched.dir);
  } catch (err) {
    if (!isCurrent(agentDir, fetched.dir)) rmSync(fetched.dir, { recursive: true, force: true });
    throw err;
  }
  const swap = swapPluginCurrent(agentDir, fetched.sha);
  const rows = [row(UPGRADE_CHECKOUT_AREA, swap.previous ?? "", swap.current)];
  for (const dir of swap.removed) rows.push(row(UPGRADE_CACHE_AREA, dir, UPGRADE_REMOVED));
  return { rows, agentDir, swap };
}

function hostRow(adapter: AdapterRow): UpgradeChangeRow {
  return row(UPGRADE_HOST_AREA, "", UPGRADE_HOST_COMMAND[adapter.id] ?? UPGRADE_HOST_MANUAL);
}

// Steps 4-7. Any failure after the swap points `current` back at the kept generation; any failure after v1
// removal puts every removed path back. Host config writes roll back on their own (host-write.ts).
async function upgrade(adapter: AdapterRow, deps: UpgradeDeps, home: string): Promise<UpgradeChangeRow[]> {
  let done: Checkout | null = null;
  let removal: V1Removal | null = null;
  try {
    const step4 = UPGRADE_GIT_CHECKOUT_AGENTS.includes(adapter.id)
      ? (done = await checkout(adapter, deps)).rows
      : [hostRow(adapter)];
    const step5 = regenerateHostConfig(adapter, home, { env: deps.env, write: deps.write });
    const findings = detectV1(adapter.id, home, { project: deps.project.worktree, piAgentDir: piAgentDirOf(deps.env, home), claudeDir: claudeDirOf(deps.env, home), copilotDir: copilotDirOf(deps.env, home), kiroDir: kiroDirOf(deps.env, home), opencodeDir: opencodeDirOf(deps.env, home) });
    removal = removeV1(adapter.id, findings);
    const rows = [...step4, ...step5, ...removal.rows];
    removal.commit();
    return rows;
  } catch (err) {
    removal?.rollback();
    if (done !== null && done.swap.previous !== null) swapPluginCurrent(done.agentDir, basename(done.swap.previous));
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
    rows.push(...await upgrade(adapter, deps, home));
  }
  return { text: renderTable(rows) + "\n\n" + UPGRADE_RESTART_LINE, isError: false, sandboxBytes: 0 };
}

async function handler(input: CtxUpgradeInput, ctx: ToolContext): Promise<ToolReply> {
  return runUpgrade(input, { project: ctx.project, env: process.env, signal: ctx.signal, releaseUrl: RELEASE_REPO_URL });
}

export const ctxUpgrade = Object.freeze({
  name: "ctx_upgrade",
  description: "",
  schema: ctxUpgradeSchema,
  readOnly: false,
  alwaysLoad: false,
  handler,
});
