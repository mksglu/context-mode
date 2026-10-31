// D-PWSH-DUMP-1 (ADR-0008 step 6a for PowerShell). Codex 0.166 runs commands in PowerShell on Windows, and the POSIX
// parser reads a Windows path wrong (`C:\logs\app.log` loses its backslashes). This is a small PowerShell word reader:
// quotes, the backtick, `;` `&&` `||` `|`, redirects, groups and `[Type]::Method(args)` calls. No regex (ADR-0008).
// It answers one question: which one-file reads put a whole file on stdout? Never throws.
import { resolve } from "node:path";
import { MAX_NEST_DEPTH } from "../contracts/constants.ts";

export interface PsStage {
  words: string[];
  toFile: boolean;   // stdout goes to a file (`> f`, `>> f`, `1> f`, `*> f`)
  chained: boolean;  // a member or index follows a method call: `[IO.File]::ReadAllText('f').Substring(0,9)`
}

const SQ = "'";
const DQ = '"';
const TICK = "`";
const SPACES = " \t\r";
const OPENERS = "([{";
const CLOSERS = ")]}";
const GLUE_END = " \t\r\n|;>";
const FD_STAR = "*";
const STDOUT_FD = "1";
const METHOD_MARK = "::";
const PAIR = METHOD_MARK.length; // a two-character operator: `||`, `&&`, `\`` + newline
const MIN_STATIC_CALL = PAIR; // a static call word plus its first argument

/** Index of the quote that closes the one at `at`, or -1. `''` / `""` and (double quote only) the backtick escape. */
function quoteEnd(text: string, at: number): number {
  const q = text.charAt(at);
  for (let j = at + 1; j < text.length; j++) {
    const c = text.charAt(j);
    if (q === DQ && c === TICK) { j++; continue; }
    if (c !== q) continue;
    if (text.charAt(j + 1) === q) { j++; continue; }
    return j;
  }
  return -1;
}

function unquote(body: string, q: string): string {
  let out = "";
  for (let j = 0; j < body.length; j++) {
    const c = body.charAt(j);
    if (q === DQ && c === TICK && j + 1 < body.length) { out += body.charAt(++j); continue; }
    if (c === q && body.charAt(j + 1) === q) j++;
    out += c;
  }
  return out;
}

/** Index of the bracket that closes the opener at `at`, or -1. */
function closeOf(text: string, at: number): number {
  let depth = 0;
  for (let j = at; j < text.length; j++) {
    const c = text.charAt(j);
    if (c === SQ || c === DQ) {
      const e = quoteEnd(text, j);
      if (e < 0) return -1;
      j = e;
      continue;
    }
    if (c === TICK) { j++; continue; }
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c) && --depth === 0) return j;
  }
  return -1;
}

/** The end of the text glued after a call's `)`: `.Substring(0, 9)`, `[0..9]`. */
function glueEnd(text: string, from: number): number {
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    const c = text.charAt(j);
    if (c === SQ || c === DQ) {
      const e = quoteEnd(text, j);
      if (e < 0) return text.length;
      j = e;
      continue;
    }
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth--;
    else if (depth <= 0 && GLUE_END.includes(c)) return j;
  }
  return text.length;
}

function splitArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let j = 0; j < inner.length; j++) {
    const c = inner.charAt(j);
    if (c === SQ || c === DQ) {
      const e = quoteEnd(inner, j);
      if (e < 0) break;
      j = e;
      continue;
    }
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth--;
    else if (c === "," && depth === 0) { parts.push(inner.slice(from, j)); from = j + 1; }
  }
  parts.push(inner.slice(from));
  return parts;
}

const isFd = (w: string): boolean => w !== "" && (w === FD_STAR || [...w].every((ch) => ch >= "0" && ch <= "9"));
const fresh = (): PsStage => ({ words: [], toFile: false, chained: false });

/** statements -> pipeline stages. A statement ends at `;`, `&&`, `||` or a newline; a stage ends at `|`. */
export function psParse(text: string): PsStage[][] {
  const statements: PsStage[][] = [];
  let stages: PsStage[] = [];
  let stage = fresh();
  let word = "";
  let has = false;   // a word is being built (an empty quoted word counts)
  let bare = true;   // the word so far has no quote in it
  let target: "file" | "skip" | null = null; // the next word is a redirect target
  const n = text.length;

  const endWord = (): void => {
    if (!has) return;
    if (target !== null) {
      if (target === "file") stage.toFile = true;
      target = null;
    } else stage.words.push(word);
    word = "";
    has = false;
    bare = true;
  };
  const endStage = (): void => {
    endWord();
    if (stage.words.length > 0 || stage.toFile) stages.push(stage);
    stage = fresh();
  };
  const endStatement = (): void => {
    endStage();
    if (stages.length > 0) statements.push(stages);
    stages = [];
  };
  const grow = (s: string, quoted: boolean): void => {
    word += s;
    has = true;
    if (quoted) bare = false;
  };

  let i = 0;
  while (i < n) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === SQ || c === DQ) {
      const e = quoteEnd(text, i);
      grow(unquote(text.slice(i + 1, e < 0 ? n : e), c), true);
      i = e < 0 ? n : e + 1;
    } else if (c === TICK) {
      if (next !== "\n" && next !== "") grow(next, false);
      i += PAIR;
    } else if (c === "\n") { endStatement(); i++; }
    else if (SPACES.includes(c)) { endWord(); i++; }
    else if (c === ";") { endStatement(); i++; }
    else if (c === "|") {
      if (next === "|") { endStatement(); i += PAIR; } else { endStage(); i++; }
    } else if (c === "&") {
      if (next === "&") { endStatement(); i += PAIR; } else { if (has || stage.words.length > 0) grow(c, false); i++; } // a lone & at the start is the call operator
    } else if (c === "#" && !has) {
      while (i < n && text.charAt(i) !== "\n") i++;
    } else if (c === ">") {
      let fd = STDOUT_FD;
      if (has && bare && isFd(word)) { fd = word; word = ""; has = false; }
      else if (has) endWord();
      let j = i + 1;
      if (text.charAt(j) === ">") j++;
      if (text.charAt(j) === "&") {
        j++;
        while (j < n && !GLUE_END.includes(text.charAt(j))) j++;
      } else target = fd === STDOUT_FD || fd === FD_STAR ? "file" : "skip";
      i = j;
    } else if (c === "(" && has && bare && word.includes(METHOD_MARK)) {
      const e = closeOf(text, i);
      const inner = text.slice(i + 1, e < 0 ? n : e);
      endWord();
      for (const a of inner.trim() === "" ? [] : splitArgs(inner)) {
        const first = psParse(a)[0]?.[0]?.words[0];
        stage.words.push(first ?? a.trim());
      }
      i = e < 0 ? n : e + 1;
      if (i < n && !GLUE_END.includes(text.charAt(i))) { stage.chained = true; i = glueEnd(text, i); }
    } else if (c === "[" && !has && text.startsWith(METHOD_MARK, closeOf(text, i) + 1) && closeOf(text, i) >= 0) {
      // a type literal before `::` is the head of a static call word: `[IO.File]::ReadAllText`
      const e = closeOf(text, i);
      grow(text.slice(i, e + 1), false);
      i = e + 1;
    } else if (OPENERS.includes(c) && (c !== "[" || !has) || ((c === "$" || c === "@") && OPENERS.includes(next) && next !== "[")) {
      // a group, a subexpression or a script block stays one opaque word, so `|` and `;` inside it do not split
      const open = c === "$" || c === "@" ? i + 1 : i;
      const e = closeOf(text, open);
      grow(text.slice(i, e < 0 ? n : e + 1), true);
      i = e < 0 ? n : e + 1;
    } else { grow(c, false); i++; }
  }
  endStatement();
  return statements;
}

/** The words of the first stage: stops at a pipe, a redirect, `;` and the like. */
export function psWords(text: string): string[] {
  return psParse(text)[0]?.[0]?.words ?? [];
}

// Get-Content (aliases gc, cat, type; cmd's type) and the [IO.File] readers.
const READ_COMMANDS: readonly string[] = ["get-content", "gc", "cat", "type"];
const FILE_CLASSES: readonly string[] = ["[io.file]::", "[system.io.file]::"];
const FILE_READS: readonly string[] = ["readalltext", "readalllines", "readallbytes", "readlines"];
const PATH_PARAMS: readonly string[] = ["path", "literalpath"];
const BOUND_PARAMS: readonly string[] = ["totalcount", "head", "first", "tail", "last"]; // -First/-Head are -TotalCount aliases, -Last is -Tail's
const VALUE_PARAMS: readonly string[] = [...PATH_PARAMS, ...BOUND_PARAMS, "encoding", "readcount", "delimiter", "filter", "include", "exclude", "stream", "credential"];
const SWITCH_PARAMS: readonly string[] = ["raw", "wait", "force", "asbytestream"];
const ALL_PARAMS: readonly string[] = [...VALUE_PARAMS, ...SWITCH_PARAMS];
// A stage after the read that still shows every line.
const PASS_THROUGH: readonly string[] = ["out-string", "write-output", "echo", "write", "out-host", "write-host", "out-default", "tee-object"];
const CD_COMMANDS: readonly string[] = ["cd", "chdir", "sl", "set-location", "pushd", "push-location"];
const POWERSHELLS: readonly string[] = ["powershell", "powershell.exe", "pwsh", "pwsh.exe"];
const CMDS: readonly string[] = ["cmd", "cmd.exe"];
const CMD_RUN_FLAGS: readonly string[] = ["/c", "/k", "/r"];
const COMMAND_PARAM = "command";
const DASH = "-";

/** `Microsoft.PowerShell.Management\Get-Content` and `C:\Windows\System32\cmd.exe` read as their last part, lower case. */
function cmdName(word: string): string {
  const k = Math.max(word.lastIndexOf("\\"), word.lastIndexOf("/"));
  return (k >= 0 && k < word.length - 1 ? word.slice(k + 1) : word).toLowerCase();
}

/** A PowerShell parameter word: `-Path`, `-Path:f`, `-Pa` (a unique prefix). `full` is undefined for an unknown one. */
function param(word: string, names: readonly string[]): { full: string | undefined; inline: string | undefined } {
  const body = word.slice(DASH.length);
  const colon = body.indexOf(":");
  const name = (colon < 0 ? body : body.slice(0, colon)).toLowerCase();
  const inline = colon < 0 ? undefined : body.slice(colon + 1);
  if (name === "") return { full: undefined, inline };
  if (names.includes(name)) return { full: name, inline };
  const hits = names.filter((p) => p.startsWith(name));
  return { full: hits.length === 1 ? hits[0] : undefined, inline };
}

/** One file operand and whether a bound flag (-TotalCount, -Head, -First, -Tail, -Last) limits the read. null = not a one-file dump. */
export function psDump(words: readonly string[]): { file: string; bounded: boolean } | null {
  if (words.length === 0) return null;
  const name = cmdName(words[0]);
  if (!READ_COMMANDS.includes(name)) {
    const lower = words[0].toLowerCase();
    const cls = FILE_CLASSES.find((c) => lower.startsWith(c));
    if (cls === undefined || !FILE_READS.includes(lower.slice(cls.length)) || words.length < MIN_STATIC_CALL) return null;
    return { file: words[1], bounded: false };
  }
  const files: string[] = [];
  let bounded = false;
  for (let k = 1; k < words.length; k++) {
    const a = words[k];
    if (!a.startsWith(DASH) || a.length === DASH.length) { files.push(a); continue; }
    const p = param(a, ALL_PARAMS);
    if (p.full === undefined || !VALUE_PARAMS.includes(p.full)) continue; // a switch or an unknown flag
    const value = p.inline ?? words[++k];
    if (value === undefined) return null;
    if (PATH_PARAMS.includes(p.full)) files.push(value);
    if (BOUND_PARAMS.includes(p.full)) bounded = true;
  }
  return files.length === 1 ? { file: files[0], bounded } : null;
}

/** The script string of `powershell -Command "..."`, `pwsh -c ...`, `cmd /c ...`, or null. */
function nestedScript(name: string, words: readonly string[]): string | null {
  if (POWERSHELLS.includes(name)) {
    for (let k = 1; k < words.length; k++) {
      const w = words[k];
      if (!w.startsWith(DASH) || w.length === DASH.length) continue;
      const p = param(w, [COMMAND_PARAM]);
      if (p.full === undefined) continue;
      return [...(p.inline === undefined ? [] : [p.inline]), ...words.slice(k + 1)].join(" ");
    }
    return null;
  }
  if (CMDS.includes(name)) {
    for (let k = 1; k < words.length; k++) {
      if (CMD_RUN_FLAGS.includes(words[k].toLowerCase())) return words.slice(k + 1).join(" ");
    }
  }
  return null;
}

function cdTarget(words: readonly string[]): string | null {
  for (let k = 1; k < words.length; k++) {
    const w = words[k];
    if (w.toLowerCase() === "/d") continue;
    if (!w.startsWith(DASH) || w.length === DASH.length) return w;
    const p = param(w, PATH_PARAMS);
    if (p.full !== undefined) return p.inline ?? words[k + 1] ?? null;
  }
  return null;
}

function walk(script: string, cwd: string, depth: number, found: string[]): void {
  let dir = cwd;
  for (const stages of psParse(script)) {
    const head = stages[0];
    if (head.words.length === 0) continue;
    const name = cmdName(head.words[0]);
    if (stages.length === 1 && CD_COMMANDS.includes(name)) {
      const t = cdTarget(head.words);
      if (t !== null) dir = resolve(dir, t);
      continue;
    }
    const inner = depth < MAX_NEST_DEPTH ? nestedScript(name, head.words) : null;
    if (inner !== null) { walk(inner, dir, depth + 1, found); continue; }
    if (head.toFile || head.chained) continue;
    const d = psDump(head.words);
    if (d === null || d.bounded) continue;
    let shown = true;
    for (let k = 1; k < stages.length; k++) {
      if (stages[k].toFile || !PASS_THROUGH.includes(cmdName(stages[k].words[0] ?? ""))) { shown = false; break; }
    }
    if (shown) found.push(resolve(dir, d.file));
  }
}

/** Absolute paths of the one-file PowerShell reads in `script` that put the whole file on stdout (also inside
 *  `powershell -Command` and `cmd /c`, and after a `cd`). A bounded, piped-on, filtered or redirected read is not listed. */
export function psDumpFiles(script: string, cwd: string): string[] {
  const found: string[] = [];
  walk(script, cwd, 0, found);
  return found;
}
