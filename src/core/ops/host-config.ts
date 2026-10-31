// impl/07 §2 (readHostConfig, mergeOwnEntries, stripJsonComments), ADR-0010 §4 (#1226 keep user values,
// #849 .jsonc wins, #808 string-aware comment strip), TECH-SPEC §3.11; DEVIATIONS D-M5-O1-1..4.
// No regex: every parse below is a character scanner. JSON/JSONC edits touch only the edited value span,
// so comments and untouched text survive byte for byte.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import type { AST } from "toml-eslint-parser";
import {
  AGENT_ARG, HOST_CONFIG_TEXT_PATH, HOST_NODE_COMMAND, JSON_INDENT_UNIT, JSONC_EXT,
  MCP_ARGS_FIELD, MCP_COMMAND_FIELD, OPENCODE_CONFIG_FILES, OPENCODE_GIT_SPEC, OPENCODE_PLUGIN_KEY, OWN_MCP_ENTRY,
  PI_GIT_PACKAGE, PI_PACKAGES_KEY, SERVER_ENTRY_FILE, TOML_EXT, V1_OPENCODE_PLUGIN_SPEC, V1_PATH_SEPS, V1_PI_PACKAGE,
  VSCODE_WORKSPACE_VAR, WORKSPACE_FOLDER_FLAG, EXE_SUFFIX,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import { atomicWriteFile } from "./atomic-file.ts";
import { hostLayout, hostText, withLayout } from "./host-text.ts";
import type { HostLayout } from "./host-text.ts";
import type { AdapterRow, AgentId, HostConfigEdit, HostConfigFormat, HostConfigResult } from "../contracts/types.ts";

export interface HostConfigText { agent: AgentId; text: string; format: HostConfigFormat; path: string; layout?: HostLayout; }
type KeyPath = readonly string[];

// ---------------------------------------------------------------------------------------------- read

function formatOf(path: string): HostConfigFormat {
  if (path.endsWith(JSONC_EXT)) return "jsonc";
  if (path.endsWith(TOML_EXT)) return "toml";
  return "json";
}

/** impl/07 §2: raw text + format. OpenCode: a sibling opencode.jsonc wins over opencode.json (#849, D-M5-O1-3).
 *  A file that does not exist reads as "" (an empty config the first write creates). */
export function readHostConfig(agent: AgentId, path: string): HostConfigText {
  let file = path;
  if (agent === "opencode") {
    const jsonc = join(dirname(path), OPENCODE_CONFIG_FILES[0]);
    if (existsSync(jsonc)) file = jsonc;
  }
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
  return { agent, text: hostText(raw), format: agent === "opencode" && !file.endsWith(TOML_EXT) ? "jsonc" : formatOf(file), path: file, layout: hostLayout(raw) }; // CC-WIN-3: BOM and CRLF off for parsing
}

// ------------------------------------------------------------------------------------------ JSONC scan

/** Blank every // and block comment with spaces (newlines kept), tracking string and escape state. Offsets
 *  are unchanged, so a span found in the result is the same span in the original text. */
export function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") { out += " "; i += 1; }
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i += 1) out += text[i] === "\n" ? "\n" : " ";
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

type Node =
  | { kind: "object"; start: number; end: number; members: Member[] }
  | { kind: "array"; start: number; end: number; items: Node[] }
  | { kind: "scalar"; start: number; end: number };
interface Member { key: string; keyStart: number; node: Node; }

class Scanner {
  i = 0;
  readonly s: string;
  constructor(s: string) { this.s = s; }
  ws(): void { while (this.i < this.s.length && " \t\r\n".includes(this.s[this.i])) this.i += 1; }
  fail(): never { throw new SyntaxError("offset " + this.i); }
  str(): string {
    const start = this.i;
    this.i += 1;
    while (this.i < this.s.length && this.s[this.i] !== '"') this.i += this.s[this.i] === "\\" ? 2 : 1;
    if (this.i >= this.s.length) this.fail();
    this.i += 1;
    return JSON.parse(this.s.slice(start, this.i)) as string;
  }
  value(): Node {
    this.ws();
    const start = this.i;
    const c = this.s[this.i];
    if (c === "{") {
      this.i += 1;
      const members: Member[] = [];
      for (;;) {
        this.ws();
        if (this.s[this.i] === "}") break;
        if (this.s[this.i] !== '"') this.fail();
        const keyStart = this.i;
        const key = this.str();
        this.ws();
        if (this.s[this.i] !== ":") this.fail();
        this.i += 1;
        members.push({ key, keyStart, node: this.value() });
        this.ws();
        if (this.s[this.i] === ",") { this.i += 1; continue; }
        if (this.s[this.i] !== "}") this.fail();
      }
      this.i += 1;
      return { kind: "object", start, end: this.i, members };
    }
    if (c === "[") {
      this.i += 1;
      const items: Node[] = [];
      for (;;) {
        this.ws();
        if (this.s[this.i] === "]") break;
        items.push(this.value());
        this.ws();
        if (this.s[this.i] === ",") { this.i += 1; continue; }
        if (this.s[this.i] !== "]") this.fail();
      }
      this.i += 1;
      return { kind: "array", start, end: this.i, items };
    }
    if (c === '"') { this.str(); return { kind: "scalar", start, end: this.i }; }
    while (this.i < this.s.length && !" \t\r\n,}]".includes(this.s[this.i])) this.i += 1;
    if (this.i === start) this.fail();
    return { kind: "scalar", start, end: this.i };
  }
}

// Blank the commas JSONC allows before } or ] so JSON.parse accepts the text (offsets unchanged).
function blankTrailingCommas(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && " \t\r\n".includes(s[j])) j += 1;
      if (s[j] === "}" || s[j] === "]") { out += " "; continue; }
    }
    out += c;
  }
  return out;
}

interface JsonDoc { clean: string; root: Node | null; value: unknown; }

function scanJson(text: string, format: HostConfigFormat): JsonDoc {
  const clean = format === "jsonc" ? blankTrailingCommas(stripJsonComments(text)) : text;
  if (clean.trim() === "") return { clean, root: null, value: {} };
  const value: unknown = JSON.parse(clean);
  const sc = new Scanner(clean);
  const root = sc.value();
  sc.ws();
  if (sc.i !== clean.length) sc.fail();
  return { clean, root, value };
}

// ------------------------------------------------------------------------------------------- TOML scan
// D-TOML-PARSER-1: toml-eslint-parser (bundled by esbuild, no regex) reads and validates every TOML file.
// The scan keeps the byte range of each standard table and of each key line, so an edit touches only the
// span it owns and every other byte of the user's file stays.

interface TomlSpan { path: string[]; header: string; start: number; end: number; }
interface TomlKey { base: string[]; full: string[]; start: number; end: number; inline: boolean; }
interface TomlDoc { value: Record<string, unknown>; tables: TomlSpan[]; keys: TomlKey[]; }

function keyNames(key: AST.TOMLKey): string[] {
  return key.keys.map((k) => (k.type === "TOMLBare" ? k.name : k.value));
}

function lineStartOf(text: string, at: number): number {
  return at === 0 ? 0 : text.lastIndexOf("\n", at - 1) + 1;
}

function lineEndOf(text: string, at: number): number {
  const nl = text.indexOf("\n", at);
  return nl < 0 ? text.length : nl + 1;
}

function tomlValue(text: string): Record<string, unknown> {
  return getStaticTOMLValue(parseTOML(text)) as Record<string, unknown>;
}

function scanToml(text: string): TomlDoc {
  const program = parseTOML(text);
  const tables: TomlSpan[] = [];
  const keys: TomlKey[] = [];
  const addKey = (base: string[], kv: AST.TOMLKeyValue): void => {
    keys.push({ base, full: [...base, ...keyNames(kv.key)], start: kv.range[0], end: kv.range[1], inline: kv.value.type === "TOMLInlineTable" });
  };
  for (const node of program.body[0].body) {
    if (node.type === "TOMLKeyValue") { addKey([], node); continue; }
    if (!node.resolvedKey.every((seg) => typeof seg === "string")) continue; // inside an array of tables: not ours to edit
    const path = node.resolvedKey as string[];
    for (const kv of node.body) addKey(path, kv);
    if (node.kind !== "standard") continue;
    const start = lineStartOf(text, node.range[0]);
    const headEnd = lineEndOf(text, node.key.range[1]);
    const last = node.body[node.body.length - 1];
    tables.push({
      path,
      header: text.slice(start, text[headEnd - 1] === "\n" ? headEnd - 1 : headEnd),
      start,
      end: last === undefined ? headEnd : lineEndOf(text, last.range[1]),
    });
  }
  return { value: getStaticTOMLValue(program) as Record<string, unknown>, tables, keys };
}

/** Each standard `[table]` of a TOML text with its key path, header line and byte span (header line through the
 *  line of its last key; comments and blank lines after it belong to what follows). Throws SyntaxError on bad TOML. */
export function tomlTableSpans(text: string): TomlSpan[] {
  return scanToml(text).tables;
}

/** The canonical header text of a table path: `[mcp_servers.context-mode]`. */
export function tomlHeaderText(path: readonly string[]): string {
  return "[" + path.map(tomlHeaderKey).join(".") + "]";
}

// ------------------------------------------------------------------------------------------ parse API

/** Parse a host config text; any syntax error is CONFIG_PARSE_FAILED (impl/07 §2 Errors). Empty text is {}. */
export function parseHostConfig(agent: AgentId, path: string, text: string, format: HostConfigFormat): unknown {
  try {
    return format === "toml" ? scanToml(text).value : scanJson(text, format).value;
  } catch {
    throw new CtxError("CONFIG_PARSE_FAILED", { agent, path, format });
  }
}

export function hostConfigValueAt(value: unknown, path: KeyPath): unknown {
  let cur = value;
  for (const seg of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, k) => sameValue(x, b[k]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

// ------------------------------------------------------------------------------------------- edit text

function lineIndent(text: string, at: number): string {
  let s = at;
  while (s > 0 && text[s - 1] !== "\n") s -= 1;
  let e = s;
  while (text[e] === " " || text[e] === "\t") e += 1;
  return text.slice(s, e);
}

function indentUnit(root: Node | null, clean: string): string {
  if (root === null || root.kind !== "object" || root.members.length === 0) return JSON_INDENT_UNIT;
  const own = lineIndent(clean, root.members[0].keyStart);
  return own === "" ? JSON_INDENT_UNIT : own;
}

function render(value: unknown, unit: string, base: string): string {
  return JSON.stringify(value, null, unit).split("\n").join("\n" + base);
}

function nest(path: KeyPath, value: unknown): unknown {
  let out = value;
  for (let k = path.length - 1; k >= 0; k -= 1) out = { [path[k]]: out };
  return out;
}

function setJsonText(text: string, format: HostConfigFormat, path: KeyPath, value: unknown): string {
  const doc = scanJson(text, format);
  const unit = indentUnit(doc.root, doc.clean);
  if (doc.root === null) return render(nest(path, value), unit, "") + "\n";
  let node: Node = doc.root;
  let depth = 0;
  while (depth < path.length && node.kind === "object") {
    const hit: Member | undefined = node.members.find((m) => m.key === path[depth]);
    if (hit === undefined) break;
    node = hit.node;
    depth += 1;
  }
  if (depth === path.length) {
    return text.slice(0, node.start) + render(value, unit, lineIndent(doc.clean, node.start)) + text.slice(node.end);
  }
  if (node.kind !== "object") throw new SyntaxError("not an object at " + path.slice(0, depth).join("."));
  const rest = nest(path.slice(depth + 1), value);
  const last = node.members[node.members.length - 1];
  if (last === undefined) {
    const base = lineIndent(doc.clean, node.start);
    const member = "\n" + base + unit + JSON.stringify(path[depth]) + ": " + render(rest, unit, base + unit) + "\n" + base;
    return text.slice(0, node.start + 1) + member + text.slice(node.end - 1);
  }
  const base = lineIndent(doc.clean, last.keyStart);
  let at = last.node.end;
  while (" \t\r\n".includes(doc.clean[at])) at += 1;
  const trailing = doc.clean[at] === ",";
  const insertAt = trailing ? at + 1 : last.node.end;
  const member = (trailing ? "" : ",") + "\n" + base + JSON.stringify(path[depth]) + ": " + render(rest, unit, base);
  return text.slice(0, insertAt) + member + text.slice(insertAt);
}

function tomlScalar(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(tomlScalar).join(", ") + "]";
  if (isPlainObject(v)) return "{ " + Object.entries(v).map(([k, x]) => tomlHeaderKey(k) + " = " + tomlScalar(x)).join(", ") + " }";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new SyntaxError("unsupported TOML value");
}

function tomlHeaderKey(seg: string): string {
  if (seg === "") return '""';
  for (const ch of seg) {
    const bare = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === "-";
    if (!bare) return JSON.stringify(seg);
  }
  return seg;
}

function tomlBlock(path: KeyPath, value: Record<string, unknown>): string {
  let out = "[" + path.map(tomlHeaderKey).join(".") + "]\n";
  const subs: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject(v)) subs.push(tomlBlock([...path, k], v));
    else out += tomlHeaderKey(k) + " = " + tomlScalar(v) + "\n";
  }
  return [out, ...subs].join("\n");
}

function under(path: KeyPath, prefix: KeyPath): boolean {
  return path.length >= prefix.length && prefix.every((seg, k) => path[k] === seg);
}

// The line (with its newline) a key sits alone on, so deleting a key does not leave a blank line behind.
function keyLineRange(text: string, k: { start: number; end: number }): [number, number] {
  const ls = lineStartOf(text, k.start);
  const le = lineEndOf(text, k.end);
  const rest = text.slice(k.end, le).trim();
  const alone = text.slice(ls, k.start).trim() === "" && (rest === "" || rest.startsWith("#"));
  return alone ? [ls, le] : [k.start, k.end];
}

function withValueAt(root: unknown, rel: KeyPath, value: unknown): unknown {
  if (rel.length === 0) return value;
  const base = isPlainObject(root) ? { ...root } : {};
  const next = withValueAt(base[rel[0]], rel.slice(1), value);
  if (next === undefined) delete base[rel[0]];
  else base[rel[0]] = next;
  return base;
}

// Set (or, for undefined, drop) the table at `path`: its tables and key lines are cut, the new table text goes
// where the first old table stood, or at the end of the file when there was none.
function replaceToml(text: string, doc: TomlDoc, path: KeyPath, value: Record<string, unknown> | undefined): string {
  const block = value === undefined ? "" : tomlBlock(path, value);
  const owned = doc.tables.filter((t) => under(t.path, path));
  const cuts: [number, number, string][] = doc.keys
    .filter((k) => under(k.full, path) && !under(k.base, path))
    .map((k): [number, number, string] => [...keyLineRange(text, k), ""]);
  owned.forEach((t, n) => cuts.push([t.start, t.end, n === 0 ? block : ""]));
  cuts.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, put] of cuts) out = out.slice(0, s) + put + out.slice(e);
  if (owned.length > 0 || block === "") return out;
  const sep = out === "" ? "" : out.endsWith("\n\n") ? "" : out.endsWith("\n") ? "\n" : "\n\n";
  return out + sep + block;
}

const tableLike = (v: unknown): boolean => v === undefined || isPlainObject(v);

// TOML edits are table-level: the table at `path` is changed, never the file around it. When only child
// tables differ, each child is edited alone, so a sibling table (and its comments) keeps its bytes.
function setTomlText(text: string, path: KeyPath, value: unknown): string {
  if (value !== undefined && !isPlainObject(value)) throw new SyntaxError("TOML edits replace a whole table");
  const doc = scanToml(text);
  const cur = hostConfigValueAt(doc.value, path);
  if (sameValue(cur, value)) return text;
  const inline = doc.keys.find((k) => k.inline && k.full.length < path.length && under(path, k.full));
  if (inline !== undefined) { // an ancestor is an inline table (a = { b = {...} }): it cannot be extended, so it becomes a table
    const whole = withValueAt(hostConfigValueAt(doc.value, inline.full), path.slice(inline.full.length), value);
    return replaceToml(text, doc, inline.full, whole as Record<string, unknown>);
  }
  if (isPlainObject(cur) && isPlainObject(value)) {
    const names = [...new Set([...Object.keys(cur), ...Object.keys(value)])].filter((k) => !sameValue(cur[k], value[k]));
    if (names.every((k) => tableLike(cur[k]) && tableLike(value[k]))) {
      let out = text;
      for (const k of names) out = setTomlText(out, [...path, k], value[k]);
      return out;
    }
  }
  return replaceToml(text, doc, path, value);
}

function setText(agent: AgentId, path: string, text: string, format: HostConfigFormat, key: KeyPath, value: unknown): string {
  try {
    if (format !== "toml") return setJsonText(text, format, key, value);
    const out = setTomlText(text, key, value);
    const landed = hostConfigValueAt(tomlValue(out), key);
    const emptyTable = isPlainObject(value) && Object.keys(value).length === 0; // an empty table has no TOML text: it reads back as missing
    if (!sameValue(landed, value) && !(emptyTable && landed === undefined)) throw new SyntaxError("edit did not land");
    return out;
  } catch {
    throw new CtxError("CONFIG_PARSE_FAILED", { agent, path, format });
  }
}

// ------------------------------------------------------------------------------------------ merge API

interface OwnTarget { key: KeyPath; next(current: unknown): unknown; }

// The bundle dir of the running server: the same anchor hook dispatch uses (D-M3-arch-3, D-M5-O1-4).
function serverScript(): string {
  return join(dirname(process.argv[1] ?? ""), SERVER_ENTRY_FILE);
}

/** D-DOC-RT-1: true when `command` runs node: its last path segment is `node` or `node.exe` (any case on Windows). */
export function isNodeCommand(command: unknown): command is string {
  if (typeof command !== "string") return false;
  let at = -1;
  for (const sep of V1_PATH_SEPS) at = Math.max(at, command.lastIndexOf(sep));
  const exe = command.slice(at + 1).toLowerCase();
  return exe === HOST_NODE_COMMAND || exe === HOST_NODE_COMMAND + EXE_SUFFIX;
}

/** D-DOC-RT-1: the ONE shape of an agent's MCP server entry. Setup writes it with the node it runs and the package
 *  server bundle; ctx_upgrade writes it with bare `node` and the running bundle; doctor D3 compares against it. */
export function ownMcpValue(agent: AgentId, node: string, server: string): Record<string, unknown> | undefined {
  const mcp = OWN_MCP_ENTRY[agent];
  if (mcp === undefined) return undefined;
  // D-HF-VSCODE-PROJECT-1: VS Code expands ${workspaceFolder} in MCP server args; the server reads the project from it (D-M1-5).
  const tail = agent === "vscode" ? [WORKSPACE_FOLDER_FLAG, VSCODE_WORKSPACE_VAR] : [];
  return { ...mcp.fields, [MCP_COMMAND_FIELD]: node, [MCP_ARGS_FIELD]: [server, AGENT_ARG, agent, ...tail] };
}

/** What doctor D3 accepts beyond the exact ctx_upgrade form: the entry setup wrote (D-DOC-RT-1). */
export interface OwnAccept {
  nodePath?: boolean;             // an absolute node path (setup writes process.execPath) counts as `node`
  listEntries?: readonly string[]; // list entries setup writes in place of the upgrade form (OpenCode plugin file path)
}

/** D-DOC-RT-1, D-OC2-ENTRY-1: the OpenCode plugin entry setup lists (D-WIN-OCENTRY-1): the package dir, the running server bundle's dir. */
export function opencodePluginFile(): string {
  return dirname(process.argv[1] ?? "");
}

function listTarget(key: string, own: string, v1: string, alt: readonly string[] = []): OwnTarget {
  return {
    key: [key],
    next(current) {
      const list = Array.isArray(current) ? current.filter((x) => x !== v1) : [];
      return list.includes(own) || alt.some((a) => list.includes(a)) ? list : [...list, own];
    },
  };
}

// D-M5-O1-4: the own entries a host config holds per agent. Hook entries ship in the release's hook files
// (build/manifests.ts); this module regenerates the MCP entry and the plugin/package list entry.
function ownTargets(agent: AgentId, accept: OwnAccept): OwnTarget[] {
  const mcp = OWN_MCP_ENTRY[agent];
  if (mcp !== undefined) {
    return [{
      key: mcp.key,
      next(current) {
        const keep = isPlainObject(current) ? current : {};
        const node = accept.nodePath === true && isNodeCommand(keep[MCP_COMMAND_FIELD]) ? keep[MCP_COMMAND_FIELD] : HOST_NODE_COMMAND;
        return { ...keep, ...ownMcpValue(agent, node, serverScript()) };
      },
    }, ...(mcp.also ?? []).map(([key, value]): OwnTarget => ({ key, next: () => value }))];
  }
  if (agent === "opencode") return [listTarget(OPENCODE_PLUGIN_KEY, OPENCODE_GIT_SPEC, V1_OPENCODE_PLUGIN_SPEC, accept.listEntries)];
  if (agent === "pi") return [listTarget(PI_PACKAGES_KEY, PI_GIT_PACKAGE, V1_PI_PACKAGE)];
  return [];
}

function applyEdits(agent: AgentId, path: string, text: string, format: HostConfigFormat, wanted: [KeyPath, unknown][]): HostConfigResult {
  const parsed = parseHostConfig(agent, path, text, format);
  let out = text;
  const edits: HostConfigEdit[] = [];
  for (const [key, after] of wanted) {
    const before = hostConfigValueAt(parsed, key);
    if (sameValue(before, after)) continue;
    out = setText(agent, path, out, format, key, after);
    edits.push({ path: key.join("."), before, after });
  }
  return { text: out, format, edits };
}

/** ADR-0019 section 3 step 6 (setup engine): set the given key paths in `text`, touching only those spans.
 *  Same edit path as mergeOwnEntries, with the values chosen by the caller. CONFIG_PARSE_FAILED on bad text. */
export function editHostConfigText(agent: AgentId, path: string, text: string, format: HostConfigFormat, wanted: [readonly string[], unknown][]): HostConfigResult {
  return applyEdits(agent, path, text, format, wanted);
}

/** impl/07 §2: regenerate only context-mode's own entries; every other key and user value is kept. */
export function mergeOwnEntries(agent: AgentId, current: string, format: HostConfigFormat, row: AdapterRow, accept: OwnAccept = {}): HostConfigResult {
  const parsed = parseHostConfig(row.id, HOST_CONFIG_TEXT_PATH, current, format);
  const wanted = ownTargets(agent, accept).map((t): [KeyPath, unknown] => [t.key, t.next(hostConfigValueAt(parsed, t.key))]);
  return applyEdits(agent, HOST_CONFIG_TEXT_PATH, current, format, wanted);
}

/** Write top-level key values into the file readHostConfig read (`current.path`: for OpenCode the .jsonc that
 *  won over `_requested`, #849), touching only those spans; the file is replaced by rename, so a failed write
 *  leaves the old file whole. Returns the edits made. */
export function writeHostConfigEdit(_requested: string, current: HostConfigText, patch: Record<string, unknown>): HostConfigEdit[] {
  const wanted = Object.entries(patch).map(([k, v]): [KeyPath, unknown] => [[k], v]);
  const result = applyEdits(current.agent, current.path, current.text, current.format, wanted);
  if (result.edits.length === 0) return [];
  atomicWriteFile(current.path, current.layout === undefined ? result.text : withLayout(result.text, current.layout));
  return result.edits;
}
