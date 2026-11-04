// impl/02 §7, A-S5, impl/11 A4, ADR-0002 decision 2, DEVIATIONS D-M1-T6-1.
// One owner file per running server: <configDir>/projects/<projectKey>/owners/<serverId>.pid,
// next to context.db, holding process.pid. Liveness is a signal-0 probe, never a ps spawn (PRD P5).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { OWNER_PID_EXT as PID_EXT, OWNERS_DIR_NAME, PROJECTS_DIR_NAME } from "../contracts/constants.ts";

function ownersDir(configDir: string, projectKey: string): string {
  return join(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME);
}

function ownerFile(configDir: string, projectKey: string, serverId: string): string {
  return join(ownersDir(configDir, projectKey), serverId + PID_EXT);
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException).code;
}

/** impl/02 §7.1: create owners/ and write process.pid as the file's only content. */
export function writeOwnerPid(configDir: string, projectKey: string, serverId: string): void {
  mkdirSync(ownersDir(configDir, projectKey), { recursive: true });
  writeFileSync(ownerFile(configDir, projectKey, serverId), String(process.pid), "utf8");
}

/** impl/02 §7.2: remove the file; a missing file is not an error (rmSync force ignores ENOENT). */
export function removeOwnerPid(configDir: string, projectKey: string, serverId: string): void {
  rmSync(ownerFile(configDir, projectKey, serverId), { force: true });
}

// impl/02 §7.3 step 2: signal 0 checks existence only. ESRCH = dead; EPERM = alive but owned by
// another user, so it counts as live. D-M1-T6-1: a file whose content is not a positive integer
// PID is dead (kill(0|negative) would probe a process group, not one server).
function isLive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (errCode(err) === "ESRCH") return false;
    if (errCode(err) === "EPERM") return true;
    throw err;
  }
}

/** impl/02 §7.3: server ids whose PID answers signal 0; dead files are deleted as a side effect. */
export function listLiveOwners(configDir: string, projectKey: string): string[] {
  const dir = ownersDir(configDir, projectKey);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    if (errCode(err) === "ENOENT") return [];
    throw err;
  }
  const live: string[] = [];
  for (const name of names) {
    if (!name.endsWith(PID_EXT)) continue;
    const file = join(dir, name);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      if (errCode(err) === "ENOENT") continue; // its server removed it between readdir and read
      throw err;
    }
    const serverId = basename(name, PID_EXT); // §7.3 step 4: the filename stem
    if (isLive(Number(text.trim()))) live.push(serverId);
    else rmSync(file, { force: true }); // §7.3 step 3: self-heal a crashed server's leftover file
  }
  return live;
}
