// impl/01 §4, impl/00 §3.3. Every error is one line: "<cause>. Fix: <action>" (P1, PRD §13).

export type ErrorCode =
  | "NODE_TOO_OLD" | "NO_SQLITE" | "DB_GONE" | "NO_PROJECT" | "UNKNOWN_FIELD"
  | "TIMEOUT" | "NO_RUNTIME" | "FETCH_FAILED" | "SSRF" | "OUTSIDE_ROOT"
  | "INVALID_ARGS" | "ONE_OF_INPUT" | "SPAWN_FAILED"
  | "DB_CORRUPT" | "SCHEMA_STALE" | "NO_GIT_DIR" | "NO_HOME" // store additions, DEVIATIONS D-M1-2
  | "NO_GIT_BASH" | "PLUGIN_ROOT_MISSING" | "BUNDLE_HASH_MISMATCH" | "CONFIG_PARSE_FAILED"; // tools-ops additions, impl/07 A-T2

export const ERROR_TEXT: Readonly<Record<ErrorCode, string>> = Object.freeze({
  NODE_TOO_OLD: "Context Mode needs Node 24.15.0 or newer; you have <v>. Fix: nvm install 24, or install it from https://nodejs.org.", // #1328 D-NODE-OLD-1
  NO_SQLITE: "node:sqlite failed to load. Fix: run ctx_doctor.",
  DB_GONE: "context.db is gone and its WAL file is still in place. Fix: run ctx_doctor once; it keeps the WAL file in a dated folder and starts a new index.", // D-ORPHAN-WAL-1
  NO_PROJECT: "Project source <kind> is missing. Fix: run ctx_doctor.",
  UNKNOWN_FIELD: 'Unknown field "<f>". Fix: use "queries".',
  TIMEOUT: "Timed out after <ms> ms. Fix: pass background: true.",
  NO_GIT_BASH: "Git Bash not found. Fix: install Git for Windows.", // D-VT-WINBASH-1
  NO_RUNTIME: "No <lang> runtime on PATH. Fix: install it or pick another language.",
  FETCH_FAILED: "Fetch failed: <code>. Fix: check the URL or proxy.",
  SSRF: "Blocked private address <host>. Fix: use a public URL.",
  OUTSIDE_ROOT: "Path <p> is outside the project. Fix: use a path inside <root>.",
  INVALID_ARGS: "Invalid argument <field>. Fix: <action>.",
  ONE_OF_INPUT: "Pass exactly one of <names>. Fix: drop the extra field.",
  SPAWN_FAILED: "Failed to start the process: <detail>. Fix: check the command and PATH.",
  DB_CORRUPT: "context.db failed integrity_check. Fix: run ctx_doctor.",
  SCHEMA_STALE: "context.db schema is version <found>, expected <want>. Fix: run ctx_doctor.",
  NO_GIT_DIR: "No git repository at <path>. Fix: run context-mode inside a git repository.",
  NO_HOME: "Env var <name> is not set. Fix: set <name> to your home directory.",
  PLUGIN_ROOT_MISSING: "Plugin root for <agent> not found at <path>. Fix: run ctx_upgrade.", // impl/07 §1 Errors
  BUNDLE_HASH_MISMATCH: "Fetched bundle hash does not match SHA256SUMS. Fix: run ctx_upgrade again.", // impl/07 §6 Errors
  CONFIG_PARSE_FAILED: "<agent> config at <path> did not parse as <format>. Fix: fix the syntax error and re-run ctx_upgrade.", // impl/07 §2 Errors
});

// impl/01 §4.3: one left-to-right scan for <name> tokens, no regex.
export function formatError(code: ErrorCode, vars: Record<string, string | number>): string {
  const template = ERROR_TEXT[code];
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "<") {
      out += template[i];
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < template.length && template[j] !== "<" && template[j] !== ">") j += 1;
    if (j >= template.length) {
      out += template.slice(i); // unterminated "<": literal text to the end (A-C5)
      break;
    }
    if (template[j] === "<") {
      out += "<"; // second "<" before any ">": the first one is literal (A-C5)
      i += 1;
      continue;
    }
    const name = template.slice(i + 1, j);
    const value = vars[name];
    if (value === undefined) throw new Error("formatError: missing var " + name + " for " + code); // A-C3
    out += String(value);
    i = j + 1;
  }
  return out;
}

export class CtxError extends Error {
  readonly code: ErrorCode;
  readonly vars: Record<string, string | number>;
  constructor(code: ErrorCode, vars?: Record<string, string | number>) {
    super(formatError(code, vars ?? {}));
    this.code = code;
    this.vars = vars ?? {};
  }
  toLine(): string {
    return this.message;
  }
}
