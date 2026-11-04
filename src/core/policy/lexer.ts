// impl/08 §1 (module enforcement): shell lexer, a hand-written state machine. No regex (ADR-0008).
// DECISIONS-r9 P1 ([[ ]], (( )), $(( )), process substitution, here-strings), P3 (quote stack, quoted text is
// never a command), E1 (unquoted LF/CR is an op ";", backslash+LF joins lines). DEVIATIONS D-M3-E1-1..4.
// The lexer never throws: an unterminated quote, heredoc or a nesting deeper than MAX_NEST_DEPTH only sets
// Scan.end; parse.ts turns that into the ParseError code (impl/08 §2.3 step 2a).
import { MAX_NEST_DEPTH } from "../contracts/constants.ts";
import type { Token, TokenKind } from "../contracts/types.ts";

export type LexEnd = "complete" | "unterminated-quote" | "unterminated-heredoc" | "too-deep";
/** tokens plus the indexes of heredoc-body tokens (parse.ts reads those as dividers, never as commands). */
export interface Scan { tokens: Token[]; heredocBodies: number[]; end: LexEnd; }
/** A command substitution or process substitution found outside single quotes (unwrap.ts, impl/08 §3.1 step 4). */
export interface Substitution { wrapper: "$()" | "`" | "<()" | ">()"; body: string; }

// Longest match first (impl/08 §1.2 steps 3-4).
const OPS = ["&&", "||", ";;", "|&", ";", "|", "&", "(", ")"] as const;
const IO_BOTH = ["&>>", "&>"] as const;
const IO_AFTER_FD = [">>", ">|", ">&", ">", "<<<", "<<-", "<<", "<&", "<>", "<"] as const;
const DUP_SUFFIX = "&";
const HEREDOC = "<<";
const HEREDOC_STRIP = "<<-";
const NEWLINE_OP = ";";
const CRLF = "\r\n";
const LINE_CONT = "\\\n";
const LINE_CONT_CRLF = "\\\r\n";
const DOLLAR_PAREN = "$(";
const DOLLAR_BRACE = "${";
const ANSI_QUOTE = "$'";
const ARITH_OPEN = "((";
const ARITH_CLOSE = "))";
const COND_OPEN = "[[";
const COND_CLOSE = "]]";
const PROC_IN = "<(";
const PROC_OUT = ">(";
const ESCAPED = "\\x".length; // a backslash and the one character it escapes
const BOUNDARY = " \t\n\r;&|()<>";
const BLANK = " \t\n\r";
const DQ_ESCAPABLE = "$`\"\\\n";
const CASE_WORD = "case";
const ESAC_WORD = "esac";

interface State { s: string; n: number; end: LexEnd; }
interface Heredoc { tag: string; strip: boolean; }

function fail(st: State, end: LexEnd): void {
  if (st.end === "complete") st.end = end;
}
function isDigit(c: string): boolean { return c !== "" && c >= "0" && c <= "9"; }
function isAlpha(c: string): boolean { return c !== "" && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")); }
function isBoundary(c: string): boolean { return c === "" || BOUNDARY.includes(c); }
function isBlank(c: string): boolean { return c !== "" && BLANK.includes(c); }

function push(out: Token[] | null, kind: TokenKind, text: string, start: number, end: number): void {
  if (out !== null) out.push({ kind, text, start, end });
}

function skipSingle(st: State, i: number): number {
  const j = st.s.indexOf("'", i + 1);
  if (j < 0) { fail(st, "unterminated-quote"); return st.n; }
  return j + 1;
}

function skipAnsi(st: State, i: number): number {
  let j = i + ANSI_QUOTE.length;
  while (j < st.n) {
    const c = st.s.charAt(j);
    if (c === "\\") { j += ESCAPED; continue; }
    if (c === "'") return j + 1;
    j++;
  }
  fail(st, "unterminated-quote");
  return st.n;
}

// P3: a $( ) or backtick opened inside double quotes gets its own state and pops back here on close.
function skipDouble(st: State, i: number, depth: number): number {
  let j = i + 1;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (c === "\\") { j += ESCAPED; continue; }
    if (c === "\"") return j + 1;
    if (c === "$" && next === "(") { j = skipDollarParen(st, j, depth); continue; }
    if (c === "$" && next === "{") { j = skipBrace(st, j, depth); continue; }
    if (c === "`") { j = skipBacktick(st, j); continue; }
    j++;
  }
  fail(st, "unterminated-quote");
  return st.n;
}

function skipBacktick(st: State, i: number): number {
  let j = i + 1;
  while (j < st.n) {
    const c = st.s.charAt(j);
    if (c === "\\") { j += ESCAPED; continue; }
    if (c === "`") return j + 1;
    j++;
  }
  return st.n;
}

function skipBrace(st: State, i: number, depth: number): number {
  let j = i + DOLLAR_BRACE.length;
  let open = 0;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (c === "\\") { j += ESCAPED; continue; }
    if (c === "'") { j = skipSingle(st, j); continue; }
    if (c === "\"") { j = skipDouble(st, j, depth); continue; }
    if (c === "$" && next === "(") { j = skipDollarParen(st, j, depth); continue; }
    if (c === "`") { j = skipBacktick(st, j); continue; }
    if (c === "{") open++;
    if (c === "}") {
      if (open === 0) return j + 1;
      open--;
    }
    j++;
  }
  return st.n;
}

/** `s` has "((" at `i`; returns the index after the matching "))", or -1 when this is not an arithmetic span. */
function arithEnd(s: string, i: number): number {
  let open = 0;
  let j = i + ARITH_OPEN.length;
  while (j < s.length) {
    const c = s.charAt(j);
    if (c === "(") open++;
    if (c === ")") {
      if (open === 0) return s.startsWith(ARITH_CLOSE, j) ? j + ARITH_CLOSE.length : -1;
      open--;
    }
    j++;
  }
  return -1;
}

/** `$(` at `i`: `$(( ))` is arithmetic (never a command); anything else is a nested span lexed to its ")". */
function skipDollarParen(st: State, i: number, depth: number): number {
  const open = i + DOLLAR_PAREN.length - 1;
  if (st.s.startsWith(ARITH_OPEN, open)) {
    const e = arithEnd(st.s, open);
    if (e > 0) return e;
  }
  return lexSpan(st, open + 1, true, depth + 1, null, null);
}

/** `[[` at `i` (followed by a blank): index after the matching `]]`, or -1 if there is none. */
function condEnd(st: State, i: number, depth: number): number {
  let j = i + COND_OPEN.length;
  let open = 0;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (c === "\\") { j += ESCAPED; continue; }
    if (c === "'") { j = skipSingle(st, j); continue; }
    if (c === "\"") { j = skipDouble(st, j, depth); continue; }
    if (c === "$" && next === "(") { j = skipDollarParen(st, j, depth); continue; }
    if (c === "$" && next === "{") { j = skipBrace(st, j, depth); continue; }
    if (c === "`") { j = skipBacktick(st, j); continue; }
    const blankBefore = isBlank(st.s.charAt(j - 1));
    if (blankBefore && st.s.startsWith(COND_CLOSE, j) && isBoundary(st.s.charAt(j + COND_CLOSE.length))) {
      if (open === 0) return j + COND_CLOSE.length;
      open--;
      j += COND_CLOSE.length;
      continue;
    }
    if (blankBefore && st.s.startsWith(COND_OPEN, j) && isBlank(st.s.charAt(j + COND_OPEN.length))) {
      open++;
      j += COND_OPEN.length;
      continue;
    }
    j++;
  }
  return -1;
}

interface Io { end: number; op: string; }
function ioAt(s: string, i: number): Io | null {
  let j = i;
  while (isDigit(s.charAt(j))) j++;
  if (j === i) {
    for (const op of IO_BOTH) if (s.startsWith(op, i)) return { end: i + op.length, op };
  }
  for (const op of IO_AFTER_FD) {
    if (!s.startsWith(op, j)) continue;
    let e = j + op.length;
    if (op.endsWith(DUP_SUFFIX)) {
      if (s.charAt(e) === "-") e++;
      else while (isDigit(s.charAt(e))) e++;
    }
    return { end: e, op };
  }
  return null;
}

function readWord(st: State, i: number, depth: number): number {
  let j = i;
  while (j < st.n) {
    const c = st.s.charAt(j);
    const next = st.s.charAt(j + 1);
    if (BOUNDARY.includes(c)) break;
    if (c === "\\") { j += ESCAPED; continue; }
    if (c === "'") { j = skipSingle(st, j); continue; }
    if (c === "\"") { j = skipDouble(st, j, depth); continue; }
    if (c === "$" && next === "'") { j = skipAnsi(st, j); continue; }
    if (c === "$" && next === "(") { j = skipDollarParen(st, j, depth); continue; }
    if (c === "$" && next === "{") { j = skipBrace(st, j, depth); continue; }
    if (c === "`") { j = skipBacktick(st, j); continue; }
    j++;
  }
  return Math.min(j, st.n);
}

// impl/08 §1.2 step 5: each pending heredoc body, in order, becomes one "unhandled" token (tag line included).
function readBodies(st: State, i: number, pending: Heredoc[], out: Token[] | null, bodies: number[] | null): number {
  let at = i;
  for (const h of pending) {
    const start = at;
    let found = false;
    while (at < st.n) {
      const nl = st.s.indexOf("\n", at);
      const lineEnd = nl < 0 ? st.n : nl;
      let line = st.s.slice(at, lineEnd);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      at = nl < 0 ? st.n : nl + 1;
      if ((h.strip ? line.trim() : line) === h.tag) { found = true; break; }
    }
    if (out !== null && bodies !== null) bodies.push(out.length);
    push(out, "unhandled", st.s.slice(start, at), start, at);
    if (!found) { fail(st, "unterminated-heredoc"); return st.n; }
  }
  pending.length = 0;
  return at;
}

/**
 * Lex from `from`. Top level (`inParen` false) runs to the end of the string. A nested span (`$(`, `<(`, `>(`)
 * stops after its unmatched ")" and returns that index; a ")" that closes a `case` pattern does not end it.
 */
function lexSpan(st: State, from: number, inParen: boolean, depth: number, out: Token[] | null, bodies: number[] | null): number {
  if (depth > MAX_NEST_DEPTH) { fail(st, "too-deep"); return st.n; }
  const s = st.s;
  let i = from;
  let parens = 0;
  let cases = 0;
  let tagStrip: boolean | null = null; // set right after "<<" / "<<-": the next word is the heredoc tag
  const pending: Heredoc[] = [];
  while (i < st.n) {
    const c = s.charAt(i);
    const next = s.charAt(i + 1);
    if (c === " " || c === "\t") { i++; continue; }
    if (s.startsWith(LINE_CONT, i)) { i += LINE_CONT.length; continue; }
    if (s.startsWith(LINE_CONT_CRLF, i)) { i += LINE_CONT_CRLF.length; continue; }
    if (c === "\n" || c === "\r") {
      const start = i;
      i += s.startsWith(CRLF, i) ? CRLF.length : 1;
      push(out, "op", NEWLINE_OP, start, i);
      tagStrip = null;
      if (pending.length > 0) i = readBodies(st, i, pending, out, bodies);
      continue;
    }
    if (c === "#") {
      while (i < st.n && s.charAt(i) !== "\n" && s.charAt(i) !== "\r") i++;
      continue;
    }
    if (s.startsWith(PROC_IN, i) || s.startsWith(PROC_OUT, i)) {
      const e = lexSpan(st, i + PROC_IN.length, true, depth + 1, null, null);
      push(out, "unhandled", s.slice(i, e), i, e);
      i = e;
      tagStrip = null;
      continue;
    }
    const io = ioAt(s, i);
    if (io !== null) {
      push(out, "io", s.slice(i, io.end), i, io.end);
      tagStrip = io.op === HEREDOC || io.op === HEREDOC_STRIP ? io.op === HEREDOC_STRIP : null;
      i = io.end;
      continue;
    }
    if (s.startsWith(COND_OPEN, i) && isBlank(s.charAt(i + COND_OPEN.length))) {
      const e = condEnd(st, i, depth);
      if (e > 0) { push(out, "unhandled", s.slice(i, e), i, e); i = e; tagStrip = null; continue; }
    }
    if (s.startsWith(ARITH_OPEN, i)) {
      const e = arithEnd(s, i);
      if (e > 0) { push(out, "unhandled", s.slice(i, e), i, e); i = e; tagStrip = null; continue; }
    }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op !== undefined) {
      if (inParen && op === "(") parens++;
      if (inParen && op === ")") {
        if (parens > 0) parens--;
        else if (cases === 0) return i + 1;
      }
      push(out, "op", op, i, i + op.length);
      i += op.length;
      tagStrip = null;
      continue;
    }
    // impl/08 §1.2 step 6: a word that is exactly one $( ) or backtick span is one "unhandled" token.
    if ((c === "$" && next === "(") || c === "`") {
      const e = c === "`" ? skipBacktick(st, i) : skipDollarParen(st, i, depth);
      if (isBoundary(s.charAt(e))) { push(out, "unhandled", s.slice(i, e), i, e); i = e; tagStrip = null; continue; }
    }
    const start = i;
    i = readWord(st, i, depth);
    const text = s.slice(start, i);
    push(out, "word", text, start, i);
    if (tagStrip !== null) { pending.push({ tag: dequote(text), strip: tagStrip }); tagStrip = null; }
    if (inParen && text === CASE_WORD) cases++;
    if (inParen && text === ESAC_WORD && cases > 0) cases--;
  }
  if (pending.length > 0) fail(st, "unterminated-heredoc");
  return st.n;
}

/** Lex `cmd` (impl/08 §1.2) and report how it ended. Never throws. */
export function scan(cmd: string): Scan {
  const st: State = { s: cmd, n: cmd.length, end: "complete" };
  const tokens: Token[] = [];
  const heredocBodies: number[] = [];
  lexSpan(st, 0, false, 0, tokens, heredocBodies);
  return { tokens, heredocBodies, end: st.end };
}

/** impl/08 §1.2: the token stream of `cmd`. */
export function lex(cmd: string): Token[] {
  return scan(cmd).tokens;
}

/** Strip quote characters and escapes the way the shell does; nothing is expanded. */
export function dequote(word: string): string {
  let out = "";
  let i = 0;
  const n = word.length;
  while (i < n) {
    const c = word.charAt(i);
    if (c === "\\") { out += word.charAt(i + 1); i += ESCAPED; continue; }
    if (c === "'") {
      const j = word.indexOf("'", i + 1);
      const e = j < 0 ? n : j;
      out += word.slice(i + 1, e);
      i = e + 1;
      continue;
    }
    if (c === "$" && word.charAt(i + 1) === "'") {
      let j = i + ANSI_QUOTE.length;
      while (j < n && word.charAt(j) !== "'") {
        if (word.charAt(j) === "\\") { out += word.charAt(j + 1); j += ESCAPED; continue; }
        out += word.charAt(j);
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "\"") {
      let j = i + 1;
      while (j < n && word.charAt(j) !== "\"") {
        const e = word.charAt(j + 1);
        if (word.charAt(j) === "\\" && e !== "" && DQ_ESCAPABLE.includes(e)) { out += e; j += ESCAPED; continue; }
        out += word.charAt(j);
        j++;
      }
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Top-level `$( )`, backtick, `<( )` and `>( )` bodies in `text`, outside single quotes; `$(( ))` is skipped. */
export function substitutions(text: string): Substitution[] {
  const st: State = { s: text, n: text.length, end: "complete" };
  const found: Substitution[] = [];
  let inDouble = false;
  let i = 0;
  while (i < st.n) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === "\\") { i += ESCAPED; continue; }
    if (!inDouble && c === "'") { i = skipSingle(st, i); continue; }
    if (!inDouble && c === "$" && next === "'") { i = skipAnsi(st, i); continue; }
    if (c === "\"") { inDouble = !inDouble; i++; continue; }
    if (c === "$" && next === "{") { i += DOLLAR_BRACE.length; continue; }
    const procIn = text.startsWith(PROC_IN, i);
    if ((c === "$" && next === "(") || (!inDouble && (procIn || text.startsWith(PROC_OUT, i)))) {
      const open = i + 1;
      if (c === "$" && text.startsWith(ARITH_OPEN, open)) {
        // D-M7-CLN-2: `$(( ))` is not a command, but a `$( )` or backtick inside it runs. Keep scanning its body.
        if (arithEnd(text, open) > 0) { i = open + ARITH_OPEN.length; continue; }
      }
      const e = lexSpan(st, open + 1, true, 1, null, null);
      const bodyEnd = e > open + 1 && text.charAt(e - 1) === ")" ? e - 1 : e;
      found.push({ wrapper: c === "$" ? "$()" : procIn ? "<()" : ">()", body: text.slice(open + 1, bodyEnd) });
      i = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(st, i);
      const bodyEnd = e > i + 1 && text.charAt(e - 1) === "`" ? e - 1 : e;
      found.push({ wrapper: "`", body: text.slice(i + 1, bodyEnd) });
      i = e;
      continue;
    }
    i++;
  }
  return found;
}

/** `NAME=value` or `NAME+=value` (a bare assignment prefix, DECISIONS-r9 P1). */
export function isAssignment(word: string): boolean {
  const first = word.charAt(0);
  if (!(isAlpha(first) || first === "_")) return false;
  for (let i = 1; i < word.length; i++) {
    const c = word.charAt(i);
    if (c === "=") return true;
    if (c === "+" && word.charAt(i + 1) === "=") return true;
    if (!(isAlpha(c) || isDigit(c) || c === "_")) return false;
  }
  return false;
}
