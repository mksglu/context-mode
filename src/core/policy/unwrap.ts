// impl/08 §3 (module enforcement): wrapper unwrapping. No regex (ADR-0008).
// sudo env time nice timeout command xargs (step 1-2), bash -c / sh -c (step 3), $( ) backticks <( ) >( ) (step 4,
// DECISIONS-r9 P1). An unrecognized wrapper shape stays as-is. Recursion stops at MAX_NEST_DEPTH. Never throws.
import { MAX_NEST_DEPTH } from "../contracts/constants.ts";
import type { SimpleCommand } from "../contracts/types.ts";
import { isAssignment, substitutions as substitutionsOf } from "./lexer.ts";
import { baseName, parseShell, writesFile } from "./parse.ts";

interface Wrapper {
  valueShorts: string;            // short options that take the next word as value when last in their cluster
  valueLongs: readonly string[];  // long options that take the next word as value
  assignments: boolean;           // NAME=val words are skipped (env, sudo)
  duration: boolean;              // a duration operand comes before the command (timeout)
  refuseShorts: string;           // any of these short options means "not a wrapped command" (command -v)
}
const NONE = "";
const WRAPPERS: Readonly<Record<string, Wrapper>> = Object.freeze({
  sudo: { valueShorts: "ugpChDrtUTR", valueLongs: ["--user", "--group", "--prompt", "--chdir", "--host"], assignments: true, duration: false, refuseShorts: NONE },
  env: { valueShorts: "uCS", valueLongs: ["--unset", "--chdir", "--split-string"], assignments: true, duration: false, refuseShorts: NONE },
  time: { valueShorts: "fo", valueLongs: ["--format", "--output"], assignments: false, duration: false, refuseShorts: NONE },
  nice: { valueShorts: "n", valueLongs: ["--adjustment"], assignments: false, duration: false, refuseShorts: NONE },
  timeout: { valueShorts: "sk", valueLongs: ["--signal", "--kill-after"], assignments: false, duration: true, refuseShorts: NONE },
  command: { valueShorts: NONE, valueLongs: [], assignments: false, duration: false, refuseShorts: "vV" },
  xargs: { valueShorts: "aEdILnPs", valueLongs: ["--arg-file", "--delimiter", "--max-args", "--max-procs", "--max-chars"], assignments: false, duration: false, refuseShorts: NONE },
});
const SHELLS: readonly string[] = ["bash", "sh", "zsh"]; // D-CDX-CAT-1: Codex runs the cmd as zsh -lc on macOS
const SCRIPT_FLAG = "c";
const SHELL_LABEL_SUFFIX = " -c";
const SHELL_VALUE_OPTS: readonly string[] = ["-o", "+o", "-O", "+O"];
const OPT = "-";
const PLUS_OPT = "+";
const LONG_OPT = "--";
const DURATION_SUFFIXES = "smhd";
const DECIMAL = ".";

const isDigit = (c: string): boolean => c !== "" && c >= "0" && c <= "9";

function isDuration(s: string): boolean {
  if (s === "" || !isDigit(s.charAt(0))) return false;
  for (let k = 0; k < s.length; k++) {
    const c = s.charAt(k);
    if (isDigit(c) || c === DECIMAL) continue;
    return k === s.length - 1 && DURATION_SUFFIXES.includes(c);
  }
  return true;
}

/** The wrapped command's words (argv0 first), or null when this is not a recognized wrapper shape. */
function peel(w: Wrapper, args: readonly string[]): string[] | null {
  let k = 0;
  while (k < args.length) {
    const a = args[k];
    if (a === LONG_OPT) { k++; break; }
    if (w.assignments && isAssignment(a)) { k++; continue; }
    if (a.startsWith(LONG_OPT)) {
      k++;
      if (w.valueLongs.includes(a)) k++;
      continue;
    }
    if (a.startsWith(OPT) && a.length > OPT.length) {
      k++;
      for (const c of w.refuseShorts) if (a.includes(c)) return null;
      for (let j = OPT.length; j < a.length; j++) {
        if (!w.valueShorts.includes(a.charAt(j))) continue;
        if (j === a.length - 1) k++;
        break;
      }
      continue;
    }
    break;
  }
  if (w.duration) {
    if (k >= args.length || !isDuration(args[k])) return null;
    k++;
  }
  return k < args.length ? args.slice(k) : null;
}

/** `bash -c "<str>"` / `sh -lc '<str>'`: the script string, or null. */
function shellScript(args: readonly string[]): string | null {
  let script = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a.startsWith(LONG_OPT)) continue;
    if (a.startsWith(OPT) || a.startsWith(PLUS_OPT)) {
      if (a.includes(SCRIPT_FLAG)) script = true;
      if (SHELL_VALUE_OPTS.includes(a)) k++;
      continue;
    }
    return script ? a : null;
  }
  return null;
}

function inherit(inner: SimpleCommand, from: SimpleCommand): SimpleCommand {
  const c: SimpleCommand = { ...inner };
  if (c.insideConstruct === undefined && from.insideConstruct !== undefined) c.insideConstruct = from.insideConstruct;
  return c;
}

function expand(c: SimpleCommand, outer: readonly string[], depth: number, out: SimpleCommand[]): void {
  const by = [...outer];
  let argv0 = c.argv0;
  let args = c.args;
  let toFile = c.redirectsToFile;
  for (;;) {
    const name = argv0.toLowerCase();
    if (SHELLS.includes(name)) {
      const script = shellScript(args);
      const r = script !== null && depth < MAX_NEST_DEPTH ? parseShell(script) : null;
      if (r === null || !r.ok) break;
      for (const inner of r.commands) {
        const spliced = inherit(inner, c);
        spliced.redirectsToFile = inner.redirectsToFile || toFile;
        spliced.endsInBoundedSink = inner.endsInBoundedSink || c.endsInBoundedSink;
        expand(spliced, [...by, name + SHELL_LABEL_SUFFIX], depth + 1, out);
      }
      return;
    }
    const w = Object.hasOwn(WRAPPERS, name) ? WRAPPERS[name] : undefined;
    const rest = w === undefined ? null : peel(w, args);
    if (rest === null) break;
    by.push(name);
    argv0 = baseName(rest[0]);
    args = rest.slice(1);
    toFile = toFile || writesFile(argv0, args);
  }
  out.push({ ...c, argv0, args, redirectsToFile: toFile, wrappedBy: by });
  if (depth >= MAX_NEST_DEPTH) return;
  // impl/08 §3.1 step 4: substitutions in this command's own text run as their own commands.
  for (const s of substitutionsOf(c.raw)) {
    const r = parseShell(s.body);
    if (!r.ok) continue;
    for (const inner of r.commands) expand(inherit(inner, c), [...outer, s.wrapper], depth + 1, out);
  }
}

/** impl/08 §3.1. Never throws. */
export function unwrap(commands: SimpleCommand[]): SimpleCommand[] {
  const out: SimpleCommand[] = [];
  for (const c of commands) expand(c, [], 0, out);
  return out;
}
