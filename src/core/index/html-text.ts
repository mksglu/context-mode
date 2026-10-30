// D-HTML-READABLE-1: HTML to markdown-like readable text, before chunking. Kept apart from text.ts and chunk.ts so the
// hook bundles never load the parser (GS6 hook budget); only tools/index.ts (ctx_index) imports this file.
// The parser is htmlparser2 (a real HTML tokenizer and tree builder, bundled by esbuild; devDependency only, the
// published package stays dependency-free). No regex: the walk is over the parsed tree.
import { DomUtils, parseDocument } from "htmlparser2";
import type { ChildNode, Element, Text } from "domhandler";

// Node guards on the parser's own `type` field (domhandler is a transitive dependency, so its helpers are not imported).
function isText(n: ChildNode): n is Text {
  return n.type === "text";
}
function isTag(n: ChildNode): n is Element {
  return n.type === "tag" || n.type === "script" || n.type === "style";
}

export interface Readable {
  /** Markdown-like text: headings, paragraphs, lists, tables, fenced code with language, links as [text](url). */
  text: string;
  /** The <title> text, "" when the page has none. */
  title: string;
  /** Words of body text (the synthetic title line is not counted); 0 means the page has no readable text. */
  words: number;
  /** True when the page is a client-rendered shell: almost no text next to a lot of markup. */
  sparse: boolean;
}

// Elements whose content is not page text: code that runs, styles, hidden templates, vector art, form controls,
// embedded documents, and page chrome. `head` is dropped too; the title is read from it before the walk.
const DROP = new Set([
  "script", "style", "noscript", "template", "svg", "math", "iframe", "canvas", "object", "embed", "head", "title",
  "nav", "footer", "button", "select", "option", "textarea", "input", "dialog", "audio", "video", "picture", "img",
]);
const DROP_ROLES = new Set(["navigation", "banner", "contentinfo", "search", "dialog", "tooltip"]);
// One line break around these, a blank line around the PARA set.
const LINE = new Set(["div", "section", "article", "main", "header", "aside", "figure", "figcaption", "details", "summary", "address", "dl", "dt", "dd", "fieldset", "form", "center", "li", "tr", "body", "html", "caption"]);
const PARA = new Set(["p", "blockquote", "hr", "table", "ul", "ol", "pre", "h1", "h2", "h3", "h4", "h5", "h6"]);
// Code-block line wrappers: a syntax highlighter puts each source line in one of these (react.dev/Sandpack: div).
const PRE_LINE = new Set(["div", "p", "li", "tr"]);
const LANG_PREFIXES = ["language-", "lang-", "highlight-source-", "highlight-text-"];
const BLOCK_INSIDE_LINK = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "pre", "ul", "ol", "table", "blockquote", "section", "article"]);

function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === " ";
}

function isInvisible(c: string): boolean {
  return c === "​" || c === "﻿" || c === "­";
}

/** Runs of white space become one space; zero-width characters go. */
function collapse(s: string): string {
  let out = "";
  let gap = false;
  for (const c of s) {
    if (isInvisible(c)) continue;
    if (isSpace(c)) { gap = true; continue; }
    if (gap) { out += " "; gap = false; }
    out += c;
  }
  return gap ? out + " " : out;
}

function hidden(el: Element): boolean {
  const a = el.attribs;
  if (a.hidden !== undefined || a["aria-hidden"] === "true") return true;
  if (a.role !== undefined && DROP_ROLES.has(a.role.toLowerCase())) return true;
  if (a.style !== undefined) {
    let s = "";
    for (const c of a.style.toLowerCase()) if (!isSpace(c)) s += c;
    if (s.includes("display:none")) return true;
  }
  return false;
}

function dropped(el: Element): boolean {
  return DROP.has(el.name) || hidden(el);
}

/** The text content of a node on one line: no markup, links and code shown as their text. */
function plainText(node: ChildNode): string {
  let out = "";
  const visit = (n: ChildNode): void => {
    if (isText(n)) { out += n.data; return; }
    if (!isTag(n) || dropped(n)) return;
    if (n.name === "br") { out += " "; return; }
    const block = LINE.has(n.name) || PARA.has(n.name);
    if (block) out += " ";
    for (const c of n.children) visit(c);
    if (block) out += " ";
  };
  visit(node);
  return collapse(out).trim();
}

/** The text of a code block, line breaks kept: <br> is a break, a line wrapper (div, p, li, tr) ends a line. */
function preText(node: Element): string {
  const buf: string[] = [];
  let last = "\n";
  const put = (s: string): void => {
    if (s === "") return;
    buf.push(s);
    last = s[s.length - 1];
  };
  const visit = (n: ChildNode): void => {
    if (isText(n)) {
      let s = "";
      for (const c of n.data) {
        if (isInvisible(c)) continue;
        s += c === " " ? " " : c;
      }
      put(s);
      return;
    }
    if (!isTag(n) || dropped(n)) return;
    if (n.name === "br") { put("\n"); return; }
    for (const c of n.children) visit(c);
    if (PRE_LINE.has(n.name) && last !== "\n") put("\n");
  };
  for (const c of node.children) visit(c);
  let code = "";
  for (const s of buf) code += s;
  const lines = code.split("\r\n").join("\n").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}

function langFrom(classes: string | undefined): string {
  if (classes === undefined) return "";
  for (const token of classes.split(" ")) {
    for (const p of LANG_PREFIXES) {
      if (token.startsWith(p) && token.length > p.length) return token.slice(p.length);
    }
  }
  return "";
}

/** The code language: a language-x class on the <pre>, its <code>, or two ancestors, or a data-language attribute. */
function langOf(pre: Element): string {
  const code = DomUtils.findOne((e) => e.name === "code", pre.children, true);
  const chain: Element[] = [pre];
  if (code !== null) chain.push(code);
  let up: Element | null = pre.parent as Element | null;
  for (let i = 0; i < 2 && up !== null && isTag(up); i += 1) { chain.push(up); up = up.parent as Element | null; }
  for (const el of chain) {
    const l = langFrom(el.attribs.class) || el.attribs["data-language"] || el.attribs["data-lang"] || "";
    if (l !== "") return safeLang(l);
  }
  return "";
}

function safeLang(l: string): string {
  let out = "";
  for (const c of l.toLowerCase()) {
    const ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "+" || c === "-" || c === "#" || c === "_" || c === ".";
    if (!ok) return out;
    out += c;
  }
  return out;
}

interface Level { first: string; rest: string; used: boolean; }

/** Output builder: owed line breaks, line prefixes for lists and quotes, one space between words. */
class Writer {
  private parts: string[] = [];
  private pending = 0;
  private fresh = true;
  private endsSpace = false;
  private stack: Level[] = [];

  depth(): number { return this.stack.length; }
  push(first: string, rest: string): void { this.stack.push({ first, rest, used: false }); }
  pop(): void { this.stack.pop(); }
  line(): void { if (this.pending < 1) this.pending = 1; }
  block(): void { this.pending = 2; }

  private prefix(): string {
    let p = "";
    for (const l of this.stack) { p += l.used ? l.rest : l.first; l.used = true; }
    return p;
  }

  private flush(): void {
    if (this.parts.length > 0 && this.pending > 0) {
      const i = this.parts.length - 1;
      let end = this.parts[i].length;
      while (end > 0 && this.parts[i][end - 1] === " ") end -= 1;
      this.parts[i] = this.parts[i].slice(0, end);
      this.parts.push("\n".repeat(this.pending));
      this.fresh = true;
      this.endsSpace = false;
    }
    this.pending = 0;
    if (this.fresh) { this.parts.push(this.prefix()); this.fresh = false; }
  }

  text(raw: string): void {
    let s = raw;
    if ((this.fresh || this.pending > 0 || this.endsSpace) && s.startsWith(" ")) s = s.slice(1);
    if (s === "") return;
    this.flush();
    this.parts.push(s);
    this.endsSpace = s.endsWith(" ");
  }

  /** One whole line, white space kept (a code line, a table row). */
  emitLine(s: string): void {
    this.line();
    this.flush();
    this.parts.push(s);
    this.endsSpace = false;
    this.line();
  }

  code(lang: string, code: string): void {
    let run = 0;
    let most = 0;
    for (const c of code) { run = c === "`" ? run + 1 : 0; if (run > most) most = run; }
    const fence = "`".repeat(Math.max(3, most + 1));
    this.block();
    this.emitLine(fence + lang);
    for (const l of code.split("\n")) this.emitLine(l);
    this.emitLine(fence);
    this.block();
  }

  result(): string {
    let s = "";
    for (const p of this.parts) s += p;
    return s.trimEnd();
  }
}

interface Walk { w: Writer; base: URL | undefined; sawH1: boolean; }

function resolveHref(href: string | undefined, base: URL | undefined): string | undefined {
  if (href === undefined) return undefined;
  const h = href.trim();
  if (h === "" || h.startsWith("#")) return undefined;
  try {
    const u = base !== undefined ? new URL(h, base) : new URL(h);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return base === undefined && !h.includes(":") ? h : undefined;
  }
}

function hasBlock(el: Element): boolean {
  return DomUtils.findOne((e) => BLOCK_INSIDE_LINK.has(e.name), el.children, true) !== null;
}

function inlineCode(text: string): string {
  let run = 0;
  let most = 0;
  for (const c of text) { run = c === "`" ? run + 1 : 0; if (run > most) most = run; }
  const tick = "`".repeat(most === 0 ? 1 : most + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return tick + pad + text + pad + tick;
}

function cell(el: Element): string {
  const t = plainText(el);
  let out = "";
  for (const c of t) out += c === "|" ? "\\|" : c;
  return out;
}

function table(st: Walk, el: Element): void {
  const rows = DomUtils.findAll((e) => e.name === "tr", el.children).map((tr) => tr.children.filter((c): c is Element => isTag(c) && (c.name === "td" || c.name === "th")).map(cell));
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (cols === 0) return;
  st.w.block();
  rows.forEach((r, i) => {
    const padded = r.concat(Array.from({ length: cols - r.length }, () => ""));
    st.w.emitLine("| " + padded.join(" | ") + " |");
    if (i === 0) st.w.emitLine("|" + " --- |".repeat(cols));
  });
  st.w.block();
}

function list(st: Walk, el: Element): void {
  const ordered = el.name === "ol";
  const start = Number.parseInt(el.attribs.start ?? "1", 10);
  let n = Number.isFinite(start) ? start : 1;
  if (st.w.depth() === 0) st.w.block(); else st.w.line();
  for (const c of el.children) {
    if (isTag(c) && c.name === "li" && !dropped(c)) {
      const marker = ordered ? String(n) + ". " : "- ";
      n += 1;
      st.w.line();
      st.w.push(marker, " ".repeat(marker.length));
      for (const k of c.children) walk(st, k);
      st.w.pop();
      st.w.line();
    } else {
      walk(st, c);
    }
  }
  if (st.w.depth() === 0) st.w.block(); else st.w.line();
}

function walk(st: Walk, node: ChildNode): void {
  if (isText(node)) { st.w.text(collapse(node.data)); return; }
  if (!isTag(node) || dropped(node)) return;
  const name = node.name;
  if (name.length === 2 && name[0] === "h" && name[1] >= "1" && name[1] <= "6") {
    const t = plainText(node);
    if (t === "") return;
    if (name === "h1") st.sawH1 = true;
    st.w.block();
    st.w.text("#".repeat(Number(name[1])) + " " + t);
    st.w.block();
    return;
  }
  switch (name) {
    case "pre": {
      const code = preText(node);
      if (code !== "") st.w.code(langOf(node), code);
      return;
    }
    case "ul": case "ol": list(st, node); return;
    case "table": table(st, node); return;
    case "br": st.w.line(); return;
    case "hr": st.w.block(); st.w.text("---"); st.w.block(); return;
    case "blockquote":
      st.w.block();
      st.w.push("> ", "> ");
      for (const c of node.children) walk(st, c);
      st.w.pop();
      st.w.block();
      return;
    case "code": {
      const t = plainText(node);
      if (t !== "") st.w.text(inlineCode(t));
      return;
    }
    case "a": {
      if (hasBlock(node)) break;
      const t = plainText(node);
      if (t === "") return;
      const href = resolveHref(node.attribs.href, st.base);
      st.w.text(href === undefined ? t : "[" + t + "](" + href + ")");
      return;
    }
    default:
  }
  const para = PARA.has(name);
  const line = LINE.has(name);
  if (para) st.w.block(); else if (line) st.w.line();
  for (const c of node.children) walk(st, c);
  if (para) st.w.block(); else if (line) st.w.line();
}

function isWordChar(c: string): boolean {
  return c.toLowerCase() !== c.toUpperCase() || (c >= "0" && c <= "9");
}

/** Words that hold a letter or a digit: heading marks, bullets and rules do not count. */
function wordCount(text: string): number {
  let n = 0;
  for (const w of text.split(" ").join("\n").split("\n")) {
    for (const c of w) if (isWordChar(c)) { n += 1; break; }
  }
  return n;
}

// D-HTML-READABLE-1: a page is "nearly empty" (client-rendered shell) when it has fewer than SPARSE_MAX_WORDS words
// and its markup is more than SPARSE_RATIO times the size of its readable text. A tiny page that is all text is kept.
const SPARSE_MAX_WORDS = 20;
const SPARSE_RATIO = 20;

// The page's own content root: <main>, else the only <article>, else <body>, else the whole document.
function contentRoot(children: ChildNode[]): ChildNode[] {
  const main = DomUtils.findOne((e) => e.name === "main", children, true);
  if (main !== null) return [main];
  const articles = DomUtils.findAll((e) => e.name === "article", children);
  if (articles.length === 1) return articles;
  const body = DomUtils.findOne((e) => e.name === "body", children, true);
  return body !== null ? [body] : children;
}

/**
 * Convert an HTML page to readable text. `baseUrl` (the final URL of a fetched page) resolves relative links.
 * Throws only on a failure of the parser or a tree too deep for the stack; the caller then indexes the raw text.
 */
export function htmlToReadable(html: string, baseUrl?: string): Readable {
  const doc = parseDocument(html);
  const titleEl = DomUtils.findOne((e) => e.name === "title", doc.children, true);
  const title = titleEl === null ? "" : collapse(titleEl.children.map((c) => (isText(c) ? c.data : "")).join("")).trim();
  let base: URL | undefined;
  try { base = baseUrl === undefined ? undefined : new URL(baseUrl); } catch { base = undefined; }
  const st: Walk = { w: new Writer(), base, sawH1: false };
  for (const n of contentRoot(doc.children)) walk(st, n);
  const body = st.w.result();
  const words = wordCount(body);
  const text = !st.sawH1 && title !== "" && words > 0 ? "# " + title + "\n\n" + body : body;
  const sparse = words < SPARSE_MAX_WORDS && html.length > SPARSE_RATIO * Math.max(text.length, 1);
  return { text: text === "" ? "" : text + "\n", title, words, sparse };
}
