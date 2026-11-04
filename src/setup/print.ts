// src/setup/print.ts: `context-mode setup --print <id>`, the manual step for one agent with absolute paths filled
// in (owner 2026-10-25: users never type paths, JSON or scripts). Built from the same registry row setup applies,
// so the printed step and the applied step cannot drift. Writes nothing.
import { readFileSync } from "node:fs";

import { editHostConfigText } from "../core/ops/host-config.ts";
import { codexTrustEntries } from "./codex-trust.ts";
import { configEdits, renderSkill } from "./registry.ts";
import type { CheckRow } from "./registry.ts";

export type PrintStep =
  | { kind: "config"; file: string; format: string; key: readonly string[]; block: string }
  | { kind: "run"; argv: string[]; input?: string }
  | { kind: "hook"; file: string; block: string }   // ADR-0020: the hook channel file (merge, keep user entries)
  | { kind: "skill"; file: string; block: string }; // ADR-0020: one <dir>/<name>/SKILL.md, rendered for this agent
export interface PrintPlan { agent: string; steps: PrintStep[]; verify: string; }

/** One shell word: left bare when safe, else single-quoted (POSIX shells; PowerShell reads '...' the same). */
const SHELL_SAFE_PUNCT = "@%+=:,./-_";
function isShellSafe(s: string): boolean {
  if (s === "") return false;
  for (const c of s) {
    const alnum = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
    if (!alnum && !SHELL_SAFE_PUNCT.includes(c)) return false;
  }
  return true;
}
export function shellWord(s: string): string {
  return isShellSafe(s) ? s : `'${s.replaceAll("'", `'"'"'`)}'`;
}

export function printPlan(row: CheckRow, env?: Record<string, string | undefined>): PrintPlan {
  const steps: PrintStep[] = [];
  const h = row.hookInstall;
  if (row.config) {
    const c = row.config;
    // D-HA-CODEX-TRUST-1: codex trusts its hooks in the same config.toml, so the printed block carries the trust tables.
    const trust = h.kind === "file" && h.trust === c.file ? codexTrustEntries(h.file, h.shape, h.command, env) : [];
    const block = editHostConfigText(row.id, c.file, "", c.format, [...configEdits(c), ...trust]).text;
    steps.push({ kind: "config", file: c.file, format: c.format, key: c.key, block });
  } else if (row.cli) {
    for (const args of row.cli.install) steps.push({ kind: "run", argv: [row.cli.bin, ...args], ...(row.cli.input ? { input: row.cli.input } : {}) });
  }
  if (h.kind === "file") steps.push({ kind: "hook", file: h.file, block: JSON.stringify(h.shape, null, 2) + "\n" });
  else if (h.kind === "plugin-list") steps.push({ kind: "hook", file: h.file, block: JSON.stringify({ [h.key[0]]: [h.entry] }, null, 2) + "\n" });
  const sk = row.skillInstall;
  if (sk.kind === "dir") {
    for (const f of sk.files) steps.push({ kind: "skill", file: f.file, block: renderSkill(readFileSync(f.src, "utf8"), sk.prefixes) });
  }
  return { agent: row.id, steps, verify: `context-mode doctor --agents ${row.id}` };
}

function extraText(p: PrintPlan): string {
  let out = "";
  for (const s of p.steps) {
    // The hook block is a host file format (kiro writes "version": "v1"); the text names it, --json carries it.
    if (s.kind === "hook") out += `\nHooks: add the hook block from \`context-mode setup --print ${p.agent} --json\` to ${s.file}\n(keep your own entries).\n`;
    if (s.kind === "skill") out += `\nSkill: put this in ${s.file}:\n\n${s.block}`;
  }
  return out;
}

export function printText(p: PrintPlan): string {
  const tail = `${extraText(p)}\nThen restart the agent and check it: ${p.verify}\n`;
  const cfg = p.steps.find((s) => s.kind === "config");
  if (cfg && cfg.kind === "config") {
    return `Manual setup for ${p.agent}. Put this in ${cfg.file}\n(If the folder or file is missing, create it. If the file exists, add the context-mode entry\nand keep the rest. These paths are for this machine.)\n\n${cfg.block}${tail}`;
  }
  const runs = p.steps.filter((s): s is Extract<PrintStep, { kind: "run" }> => s.kind === "run");
  if (!runs.length) return `${p.agent} has no manual step. Run: context-mode setup --agents ${p.agent}\n`;
  const ask = runs.find((s) => s.input)?.input?.trim();
  const extra = ask ? `${runs[0].argv[0]} asks to confirm: answer ${ask}.\n` : "";
  return `Manual setup for ${p.agent}. Run:\n\n${runs.map((s) => s.argv.map(shellWord).join(" ")).join("\n")}\n${extra}${tail}`;
}
