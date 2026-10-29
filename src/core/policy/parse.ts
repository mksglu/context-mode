// impl/08 §2 (module enforcement): recursive-descent parser over the lexer's tokens. No regex (ADR-0008).
// DECISIONS-r9 P1 ([[ ]], (( )), case, function bodies, VAR=val prefixes), P2 (the ParseError codes), P4 (GP3 rows).
// DEVIATIONS D-M3-E1-1 (process substitution parses), -3 (if/while/until/for bodies, depth count, assignment
// carriers), -4 (redirect forms), -5 (bounded sink marks the whole pipeline; head -c N needs N <= OUTPUT_CAP).
// parseShell never throws.
import { JQ_WHITELIST, MAX_NEST_DEPTH, OUTPUT_CAP } from "../contracts/constants.ts";
import type { ParseErrorConstruct, ParseResult, SimpleCommand, Token } from "../contracts/types.ts";
import { dequote, isAssignment, scan, substitutions } from "./lexer.ts";

const SEPARATORS: readonly string[] = [";", "&", "&&", "||"];
const PIPES: readonly string[] = ["|", "|&"];
const SUBSHELL_OPEN = "(";
const SUBSHELL_CLOSE = ")";
const CASE_BREAK = ";;";
const FUNC_PARENS: readonly string[] = ["(", ")"];
const NOT = "!";
const KW = Object.freeze({
  group: "{", groupEnd: "}", if: "if", then: "then", elif: "elif", else: "else", fi: "fi", while: "while",
  until: "until", for: "for", in: "in", do: "do", done: "done", case: "case", esac: "esac", function: "function",
  coproc: "coproc", select: "select",
});
const NO_STOP: readonly string[] = [];
const COND_PREFIX = "[[";
const ARITH_PREFIX = "((";
// io operators that write stdout to their target word (fd "" or "1"); impl/08 §2.3 step 5
const TO_FILE_OPS: readonly string[] = [">", ">>", ">|", "&>", "&>>", ">&"];
const TARGET_OPS: readonly string[] = [...TO_FILE_OPS, "<", "<>", "<<<", "<<", "<<-"];
const STDOUT_FDS: readonly string[] = ["", "1"];
const STDOUT_ALIASES: readonly string[] = ["-", "/dev/stdout", "/dev/stderr"];
const OPT = "-";
const LONG_OPT = "--";
const OPT_VALUE = "=";
const PATH_SEP = "/";
const OUTPUT_FLAGS: Readonly<Record<string, { short: string; long: string }>> = Object.freeze({
  curl: { short: "o", long: "--output" },
  wget: { short: "O", long: "--output-document" },
});
const SINK = Object.freeze({ head: "head", wc: "wc", grep: "grep", jq: "jq" });
const HEAD_BYTES = "-c";
const HEAD_BYTES_LONG = "--bytes";
const GREP_COUNT_SHORT = "c";
const GREP_COUNT_LONG = "--count";

interface Ctx { toks: Token[]; src: string; bodies: Set<number>; i: number; depth: number; err: ParseErrorConstruct | null; }
interface El { cmds: SimpleCommand[]; simple: SimpleCommand | null; }

const EMPTY = (): El => ({ cmds: [], simple: null });
const at = (p: Ctx, k = 0): Token | undefined => p.toks[p.i + k];
const isOp = (t: Token | undefined, text: string): boolean => t !== undefined && t.kind === "op" && t.text === text;
const isWord = (t: Token | undefined, text: string): boolean => t !== undefined && t.kind === "word" && t.text === text;
const isDigit = (c: string): boolean => c !== "" && c >= "0" && c <= "9";
const isWordChar = (c: string): boolean =>
  isDigit(c) || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

/** Last path part: `/usr/bin/curl` -> `curl`, `./gradlew` -> `gradlew`. */
export function baseName(word: string): string {
  const k = word.lastIndexOf(PATH_SEP);
  return k >= 0 && k < word.length - 1 ? word.slice(k + 1) : word;
}

/** impl/08 §2.3 step 5, argv0 part: curl -o / wget -O (also clustered, `--opt=v`) to a word that is not stdout. */
export function writesFile(argv0: string, args: readonly string[]): boolean {
  const flag = OUTPUT_FLAGS[argv0.toLowerCase()];
  if (flag === undefined) return false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === LONG_OPT) break;
    let value: string | undefined;
    if (a === flag.long) value = args[k + 1];
    else if (a.startsWith(flag.long + OPT_VALUE)) value = a.slice(flag.long.length + OPT_VALUE.length);
    else if (a.startsWith(OPT) && !a.startsWith(LONG_OPT)) {
      const pos = a.indexOf(flag.short, OPT.length);
      if (pos < 0) continue;
      value = pos + flag.short.length < a.length ? a.slice(pos + flag.short.length) : args[k + 1];
    } else continue;
    if (value !== undefined && !STDOUT_ALIASES.includes(value)) return true;
  }
  return false;
}

function allDigits(s: string): boolean {
  if (s === "") return false;
  for (const c of s) if (!isDigit(c)) return false;
  return true;
}

function headBounded(args: readonly string[]): boolean {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    let n: string | undefined;
    if (a === HEAD_BYTES || a === HEAD_BYTES_LONG) n = args[k + 1];
    else if (a.startsWith(HEAD_BYTES_LONG + OPT_VALUE)) n = a.slice(HEAD_BYTES_LONG.length + OPT_VALUE.length);
    else if (a.startsWith(HEAD_BYTES) && !a.startsWith(LONG_OPT)) n = a.slice(HEAD_BYTES.length);
    if (n !== undefined) return allDigits(n) && Number(n) <= OUTPUT_CAP;
  }
  return false;
}

function grepCounts(args: readonly string[]): boolean {
  for (const a of args) {
    if (a === LONG_OPT) return false;
    if (a === GREP_COUNT_LONG) return true;
    if (a.startsWith(OPT) && !a.startsWith(LONG_OPT) && a.includes(GREP_COUNT_SHORT)) return true;
  }
  return false;
}

function jqPath(s: string): boolean {
  if (!s.startsWith(JQ_WHITELIST.fieldSep)) return false;
  for (const seg of s.slice(JQ_WHITELIST.fieldSep.length).split(JQ_WHITELIST.fieldSep)) {
    if (seg === "") return false;
    for (const c of seg) if (!isWordChar(c)) return false;
  }
  return true;
}

/** impl/08 §2.4: closed jq filter whitelist, walked by hand. */
export function jqWhitelisted(filter: string): boolean {
  const s = filter.trim();
  if (s === JQ_WHITELIST.identity || s === JQ_WHITELIST.length) return true;
  const bar = s.indexOf(JQ_WHITELIST.pipeLength.charAt(0));
  if (bar < 0) return jqPath(s);
  const left = s.slice(0, bar).trim();
  const right = JQ_WHITELIST.pipeLength.slice(1).trim();
  return (left === JQ_WHITELIST.identity || jqPath(left)) && s.slice(bar + 1).trim() === right;
}

/** impl/08 §2.3 step 6: argv0 is head -c N, wc, grep -c, or jq with one whitelisted filter. */
function isBoundedSink(c: SimpleCommand): boolean {
  const name = c.argv0.toLowerCase();
  if (name === SINK.wc) return true;
  if (name === SINK.head) return headBounded(c.args);
  if (name === SINK.grep) return grepCounts(c.args);
  if (name === SINK.jq) {
    const positional = c.args.filter((a) => !a.startsWith(OPT));
    return positional.length === 1 && jqWhitelisted(positional[0]);
  }
  return false;
}

/** A command-less span (`x=$(…)`, `[[ $(…) ]]`, a for/case word list) kept only when it holds a substitution. */
function carrier(raw: string): SimpleCommand[] {
  if (substitutions(raw).length === 0) return [];
  return [{ argv0: "", args: [], redirectsToFile: false, endsInBoundedSink: false, raw }];
}

function carrierOf(p: Ctx, from: number, to: number): SimpleCommand[] {
  if (to <= from) return [];
  return carrier(p.src.slice(p.toks[from].start, p.toks[to - 1].end));
}

function tag(cmds: SimpleCommand[], name: string): void {
  for (const c of cmds) if (c.insideConstruct === undefined) c.insideConstruct = name;
}

function splitIo(text: string): { fd: string; op: string } {
  let k = 0;
  while (isDigit(text.charAt(k))) k++;
  return { fd: text.slice(0, k), op: text.slice(k) };
}

/** Consume one io token and its target word; true when it sends stdout to a real file. */
function ioRedirect(p: Ctx): boolean {
  const io = splitIo(p.toks[p.i].text);
  p.i++;
  if (!TARGET_OPS.includes(io.op)) return false;
  const target = at(p);
  if (target === undefined || target.kind === "op" || target.kind === "io") return false;
  p.i++;
  return TO_FILE_OPS.includes(io.op) && STDOUT_FDS.includes(io.fd) && !STDOUT_ALIASES.includes(dequote(target.text));
}

function trailingRedirects(p: Ctx): boolean {
  let toFile = false;
  while (at(p)?.kind === "io") toFile = ioRedirect(p) || toFile;
  return toFile;
}

function skipSeparators(p: Ctx): void {
  while (at(p)?.kind === "op" && SEPARATORS.includes(at(p)?.text ?? "")) p.i++;
}

/** impl/08 §2.3 step 2a: every compound counts one nesting level; deeper than MAX_NEST_DEPTH is a ParseError. */
function compound(p: Ctx, body: () => SimpleCommand[]): El {
  p.depth++;
  if (p.depth > MAX_NEST_DEPTH) { p.err = "nesting-too-deep"; return EMPTY(); }
  const cmds = body();
  p.depth--;
  if (trailingRedirects(p)) for (const c of cmds) c.redirectsToFile = true;
  return { cmds, simple: null };
}

function doBlock(p: Ctx): SimpleCommand[] {
  skipSeparators(p);
  if (!isWord(at(p), KW.do)) return [];
  p.i++;
  const body = list(p, [KW.done]);
  if (isWord(at(p), KW.done)) p.i++;
  return body;
}

function ifBody(p: Ctx): SimpleCommand[] {
  p.i++;
  const out = list(p, [KW.then]);
  while (p.err === null) {
    const t = at(p);
    if (isWord(t, KW.then) || isWord(t, KW.else)) { p.i++; out.push(...list(p, [KW.elif, KW.else, KW.fi])); continue; }
    if (isWord(t, KW.elif)) { p.i++; out.push(...list(p, [KW.then])); continue; }
    if (isWord(t, KW.fi)) p.i++;
    break;
  }
  return out;
}

function loopBody(p: Ctx): SimpleCommand[] {
  p.i++;
  const out = list(p, [KW.do]);
  out.push(...doBlock(p));
  return out;
}

function forBody(p: Ctx): SimpleCommand[] {
  p.i++;
  const out: SimpleCommand[] = [];
  const t = at(p);
  if (t?.kind === "unhandled") p.i++; // for (( ; ; ))
  else {
    if (t?.kind === "word") p.i++;
    if (isWord(at(p), KW.in)) {
      p.i++;
      const from = p.i;
      while ((at(p)?.kind === "word" || at(p)?.kind === "unhandled") && !isWord(at(p), KW.do)) p.i++;
      out.push(...carrierOf(p, from, p.i));
    }
  }
  out.push(...doBlock(p));
  return out;
}

// impl/08 §2.2 case_stmt: every branch body is a list, tagged insideConstruct "case" (DECISIONS-r9 P1/P4).
function caseBody(p: Ctx): SimpleCommand[] {
  p.i++;
  const out: SimpleCommand[] = [];
  const subject = at(p);
  if (subject !== undefined && subject.kind !== "op" && subject.kind !== "io") {
    p.i++;
    out.push(...carrierOf(p, p.i - 1, p.i));
  }
  if (isWord(at(p), KW.in)) p.i++;
  while (p.i < p.toks.length && p.err === null) {
    const t = p.toks[p.i];
    if (p.bodies.has(p.i) || (t.kind === "op" && (SEPARATORS.includes(t.text) || t.text === CASE_BREAK))) { p.i++; continue; }
    if (isWord(t, KW.esac)) { p.i++; break; }
    if (isOp(t, SUBSHELL_OPEN)) p.i++;
    while (p.i < p.toks.length && !isOp(at(p), SUBSHELL_CLOSE)) {
      const pt = p.toks[p.i];
      if (pt.kind === "op" && !PIPES.includes(pt.text)) break;
      p.i++;
    }
    if (!isOp(at(p), SUBSHELL_CLOSE)) break;
    p.i++;
    const body = list(p, [KW.esac]);
    tag(body, KW.case);
    out.push(...body);
  }
  return out;
}

// impl/08 §2.2 function_def: the body flattens into commands[], tagged with the function's name.
function functionBody(p: Ctx, name: string): El {
  skipSeparators(p);
  const el = element(p);
  tag(el.cmds, name);
  return { cmds: el.cmds, simple: null };
}

function hasFuncParens(p: Ctx, from: number): boolean {
  return FUNC_PARENS.every((text, k) => isOp(p.toks[from + k], text));
}

function simple(p: Ctx): El {
  const first = p.i;
  const words: Token[] = [];
  let toFile = false;
  while (p.i < p.toks.length) {
    const t = p.toks[p.i];
    if (t.kind === "op") break;
    if (t.kind === "io") { toFile = ioRedirect(p) || toFile; continue; }
    if (words.length === 0 && t.kind === "word" && isAssignment(t.text)) {
      p.i++;
      const open = at(p);
      if (t.text.endsWith(OPT_VALUE) && open !== undefined && isOp(open, SUBSHELL_OPEN) && open.start === t.end) {
        let parens = 0;
        while (p.i < p.toks.length) {
          const a = p.toks[p.i];
          p.i++;
          if (isOp(a, SUBSHELL_OPEN)) parens++;
          if (isOp(a, SUBSHELL_CLOSE) && --parens === 0) break;
        }
      }
      continue;
    }
    words.push(t);
    p.i++;
  }
  if (p.i === first) return EMPTY();
  const raw = p.src.slice(p.toks[first].start, p.toks[p.i - 1].end);
  if (words.length === 0) return { cmds: carrier(raw), simple: null };
  const text = (t: Token): string => (t.kind === "word" ? dequote(t.text) : t.text);
  const argv0 = baseName(text(words[0]));
  const args = words.slice(1).map(text);
  const cmd: SimpleCommand = { argv0, args, redirectsToFile: toFile || writesFile(argv0, args), endsInBoundedSink: false, raw };
  return { cmds: [cmd], simple: cmd };
}

function element(p: Ctx): El {
  const t = at(p);
  if (t === undefined) return EMPTY();
  if (t.kind === "op") {
    if (t.text !== SUBSHELL_OPEN) return EMPTY();
    return compound(p, () => {
      p.i++;
      const body = list(p, NO_STOP);
      if (isOp(at(p), SUBSHELL_CLOSE)) p.i++;
      return body;
    });
  }
  if (t.kind === "unhandled" && (t.text.startsWith(COND_PREFIX) || t.text.startsWith(ARITH_PREFIX))) {
    p.i++;
    trailingRedirects(p);
    return { cmds: carrier(t.text), simple: null };
  }
  if (t.kind === "word") {
    switch (t.text) {
      case KW.group:
        return compound(p, () => {
          p.i++;
          const body = list(p, [KW.groupEnd]);
          if (isWord(at(p), KW.groupEnd)) p.i++;
          return body;
        });
      case KW.if: return compound(p, () => ifBody(p));
      case KW.while:
      case KW.until: return compound(p, () => loopBody(p));
      case KW.for: return compound(p, () => forBody(p));
      case KW.case: return compound(p, () => caseBody(p));
      case KW.coproc: p.err = "coproc"; return EMPTY();
      case KW.select: p.err = "select"; return EMPTY();
      case KW.function: {
        p.i++;
        const nameTok = at(p);
        let name = "";
        if (nameTok?.kind === "word") { name = dequote(nameTok.text); p.i++; }
        if (hasFuncParens(p, p.i)) p.i += FUNC_PARENS.length;
        return functionBody(p, name);
      }
      default:
        if (hasFuncParens(p, p.i + 1)) {
          p.i += FUNC_PARENS.length + 1;
          return functionBody(p, dequote(t.text));
        }
    }
  }
  return simple(p);
}

function pipeline(p: Ctx): SimpleCommand[] {
  if (isWord(at(p), NOT)) p.i++;
  const all: SimpleCommand[] = [];
  let last: El = EMPTY();
  while (p.err === null) {
    last = element(p);
    all.push(...last.cmds);
    const t = at(p);
    if (t !== undefined && t.kind === "op" && PIPES.includes(t.text)) { for (const c of last.cmds) c.pipesOut = true; p.i++; continue; }
    break;
  }
  if (last.simple !== null && isBoundedSink(last.simple)) for (const c of all) c.endsInBoundedSink = true;
  return all;
}

/** pipeline_list: stops at ")" / ";;" (left for the caller) or at a stop word in command position. */
function list(p: Ctx, stop: readonly string[]): SimpleCommand[] {
  const out: SimpleCommand[] = [];
  while (p.i < p.toks.length && p.err === null) {
    const t = p.toks[p.i];
    if (p.bodies.has(p.i)) { p.i++; continue; }
    if (t.kind === "op") {
      if (t.text === SUBSHELL_CLOSE || t.text === CASE_BREAK) return out;
      if (t.text !== SUBSHELL_OPEN) { p.i++; continue; }
    }
    if (t.kind === "word" && stop.includes(t.text)) return out;
    const before = p.i;
    out.push(...pipeline(p));
    if (p.i === before && p.err === null) p.i++;
  }
  return out;
}

/** impl/08 §2.3. Never throws. */
export function parseShell(cmd: string): ParseResult {
  const s = scan(cmd);
  if (s.end === "unterminated-quote") return { ok: false, construct: "unterminated-quote" };
  if (s.end === "unterminated-heredoc") return { ok: false, construct: "unterminated-heredoc" };
  if (s.end === "too-deep") return { ok: false, construct: "nesting-too-deep" };
  const p: Ctx = { toks: s.tokens, src: cmd, bodies: new Set(s.heredocBodies), i: 0, depth: 0, err: null };
  const commands: SimpleCommand[] = [];
  while (p.i < p.toks.length && p.err === null) {
    commands.push(...list(p, NO_STOP));
    if (p.i < p.toks.length) p.i++; // a stray ")" or ";;" at top level
  }
  if (p.err !== null) return { ok: false, construct: p.err };
  return { ok: true, commands };
}
