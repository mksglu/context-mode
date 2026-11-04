// impl/07 §6 step 6, ADR-0011 "v1 cleanup"; DEVIATIONS D-M5-O2-1..5, D-M5-U1-4, D-M5-U1-5, D-M5-U6-1..3.
// removeV1: act on detectV1 findings. One UpgradeChangeRow per finding, in finding order:
//   - reason in UPGRADE_REPORT_ONLY_REASONS: file untouched, after = UPGRADE_REPORT_ONLY;
//   - path "" (a whole file or dir): renamed to <path>UPGRADE_TRASH_SUFFIX, deleted on commit();
//   - TOML header path (Codex config.toml): that [table] block is cut out, line scan;
//   - dotted key path (JSON/JSONC): the entry is dropped from its object or list; only the touched
//     top-level keys are rewritten (writeHostConfigEdit), so other keys and their comments are kept.
// Every edited config keeps its original at <file>UPGRADE_TRASH_SUFFIX until commit(); rollback() puts
// every removed path and every original config back. No regex: key paths split on V1_KEY_PATH_SEP.
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AgentId } from "../contracts/agents.ts";
import type { UpgradeChangeRow, V1Finding } from "../contracts/types.ts";
import {
  TOML_EXT, UPGRADE_AREA_KEY_SEP, UPGRADE_NOT_FOUND, UPGRADE_REMOVED,
  UPGRADE_REPORT_ONLY, UPGRADE_REPORT_ONLY_REASONS, UPGRADE_TRASH_SUFFIX, V1_KEY_PATH_SEP,
} from "../contracts/constants.ts";
import { atomicWriteFile, renameWithRetry } from "./atomic-file.ts";
import { parseHostConfig, tomlTableSpans, writeHostConfigEdit } from "./host-config.ts";
import { hostLayout, hostText, withLayout } from "./host-text.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface V1Removal {
  rows: UpgradeChangeRow[];
  /** Delete every <path>UPGRADE_TRASH_SUFFIX this run made (removed paths and config originals). */
  commit(): void;
  /** Put every removed path and every edited config's original back, newest first. */
  rollback(): void;
}

interface Undo { trash: string; target: string; }

const areaOf = (f: V1Finding): string => (f.path === "" ? f.file : f.file + UPGRADE_AREA_KEY_SEP + f.path);
const row = (f: V1Finding, after: string): UpgradeChangeRow => ({ area: areaOf(f), before: f.reason, after });

/** Move `target` aside to its trash name (a stale trash from a crashed run is the same content class: replaced). */
function moveAside(target: string, undo: Undo[]): void {
  const trash = target + UPGRADE_TRASH_SUFFIX;
  rmSync(trash, { recursive: true, force: true });
  renameWithRetry(target, trash);
  undo.push({ trash, target });
}

/** Keep the original of a config file once per run, before its first edit. */
function keepOriginal(file: string, kept: Set<string>, undo: Undo[]): void {
  if (kept.has(file)) return;
  const trash = file + UPGRADE_TRASH_SUFFIX;
  rmSync(trash, { recursive: true, force: true });
  copyFileSync(file, trash);
  kept.add(file);
  undo.push({ trash, target: file });
}

/** Cut the TOML table whose header line is `header`: its real byte span from the TOML parser, so a header-looking
 *  line inside a multiline string is never taken for it. Null when no such table (or the text is not TOML). */
function cutTomlTable(text: string, header: string): string | null {
  let span;
  try {
    span = tomlTableSpans(text).find((t) => t.header.trim() === header);
  } catch {
    return null;
  }
  return span === undefined ? null : text.slice(0, span.start) + text.slice(span.end);
}

function writeAtomic(file: string, text: string): void {
  atomicWriteFile(file, text);
}

/** Resolve a dotted key path to [container, key]; null when any step is missing. */
function locate(doc: unknown, path: string): [Obj | unknown[], string] | null {
  const segs = path.split(V1_KEY_PATH_SEP);
  let cur: unknown = doc;
  for (const seg of segs.slice(0, -1)) {
    if (Array.isArray(cur)) cur = cur[Number(seg)];
    else if (isObj(cur)) cur = cur[seg];
    else return null;
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(cur)) return Number(last) < cur.length ? [cur, last] : null;
  if (isObj(cur)) return Object.hasOwn(cur, last) ? [cur, last] : null;
  return null;
}

/** Drop every finding's entry from one JSON/JSONC file in one write; returns the findings actually found. */
function stripJsonEntries(agent: AgentId, file: string, findings: V1Finding[], kept: Set<string>, undo: Undo[]): Set<V1Finding> {
  const layout = hostLayout(readFileSync(file, "utf8"));
  const text = hostText(readFileSync(file, "utf8"));
  const doc = parseHostConfig(agent, file, text, "jsonc");
  const hit = new Set<V1Finding>();
  const byContainer = new Map<Obj | unknown[], Set<string>>();
  const topKeys = new Set<string>();
  for (const f of findings) {
    const at = locate(doc, f.path); // resolved on the unedited tree, so list indices stay valid
    if (at === null) continue;
    hit.add(f);
    topKeys.add(f.path.split(V1_KEY_PATH_SEP)[0]);
    const keys = byContainer.get(at[0]) ?? new Set<string>();
    keys.add(at[1]);
    byContainer.set(at[0], keys);
  }
  if (hit.size === 0) return hit;
  for (const [container, keys] of byContainer) {
    if (Array.isArray(container)) {
      for (const i of [...keys].map(Number).sort((a, b) => b - a)) container.splice(i, 1);
    } else {
      for (const k of keys) delete container[k];
    }
  }
  const patch: Obj = {};
  for (const k of topKeys) patch[k] = (doc as Obj)[k];
  keepOriginal(file, kept, undo);
  writeHostConfigEdit(file, { agent, text, format: "jsonc", path: file, layout }, patch);
  return hit;
}

/** impl/07 §6 step 6. `agent` only labels CONFIG_PARSE_FAILED. Throws CONFIG_PARSE_FAILED or an fs error; the
 *  caller then calls rollback(). */
export function removeV1(agent: AgentId, findings: readonly V1Finding[]): V1Removal {
  const undo: Undo[] = [];
  const kept = new Set<string>();
  const done = new Map<V1Finding, string>();
  const entries = new Map<string, V1Finding[]>();

  for (const f of findings) {
    if (UPGRADE_REPORT_ONLY_REASONS.includes(f.reason)) done.set(f, UPGRADE_REPORT_ONLY);
    else if (f.path === "") {
      if (existsSync(f.file)) { moveAside(f.file, undo); done.set(f, UPGRADE_REMOVED); }
      else done.set(f, UPGRADE_NOT_FOUND);
    } else entries.set(f.file, [...(entries.get(f.file) ?? []), f]);
  }

  for (const [file, list] of entries) {
    if (!existsSync(file)) { for (const f of list) done.set(f, UPGRADE_NOT_FOUND); continue; }
    if (file.endsWith(TOML_EXT)) {
      const rawToml = readFileSync(file, "utf8");
      const tomlLayout = hostLayout(rawToml);
      let text = hostText(rawToml);
      for (const f of list) {
        const next = cutTomlTable(text, f.path);
        if (next === null) { done.set(f, UPGRADE_NOT_FOUND); continue; }
        text = next;
        done.set(f, UPGRADE_REMOVED);
      }
      if (list.some((f) => done.get(f) === UPGRADE_REMOVED)) { keepOriginal(file, kept, undo); writeAtomic(file, withLayout(text, tomlLayout)); }
      continue;
    }
    const hit = stripJsonEntries(agent, file, list, kept, undo);
    for (const f of list) done.set(f, hit.has(f) ? UPGRADE_REMOVED : UPGRADE_NOT_FOUND);
  }

  return {
    rows: findings.map((f) => row(f, done.get(f) ?? UPGRADE_NOT_FOUND)),
    commit() {
      for (const u of undo.splice(0)) rmSync(u.trash, { recursive: true, force: true });
    },
    rollback() {
      for (const u of undo.splice(0).reverse()) {
        if (!existsSync(u.trash)) continue;
        rmSync(u.target, { recursive: true, force: true });
        renameWithRetry(u.trash, u.target);
      }
    },
  };
}
