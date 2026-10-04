#!/usr/bin/env node
/**
 * Redaction for the config files ctx-debug.sh copies into its report.
 *
 * The report is meant to be pasted into a public bug report, so a config
 * file's secrets must never reach it: anything under an `env` block (Claude
 * Code settings put API tokens there), any value whose key looks like a
 * credential, and the well-known token / connection-string shapes that may
 * appear in free text. JSON files are walked structurally so the redaction
 * cannot be defeated by formatting; other files fall back to pattern matching.
 *
 * Usage: node ctx-debug-redact.mjs <file>   → prints the redacted content as a JSON string
 */
import { readFileSync } from "node:fs";

export const REDACTED = "***REDACTED***";

/** Keys whose values are credentials, wherever they sit. */
const SECRET_KEY_RE =
  /(token|secret|passw(or)?d|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization|bearer|cookie|session[_-]?id|dsn|connection[_-]?string)/i;

/** Objects whose every string value is an environment variable, i.e. potentially a credential. */
const ENV_BLOCK_KEY_RE = /^env(ironment)?$/i;

/** Token and connection-string shapes that can appear in any text. */
const TEXT_PATTERNS = [
  [/(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, `$1${REDACTED}`],
  [/(gh[pousr]_[A-Za-z0-9]{4})[A-Za-z0-9]+/g, `$1${REDACTED}`],
  [/(github_pat_[A-Za-z0-9]{4})[A-Za-z0-9_]+/g, `$1${REDACTED}`],
  [/(xox[bpras]-[A-Za-z0-9]{4})[A-Za-z0-9-]+/g, `$1${REDACTED}`],
  [/(AKIA[A-Z0-9]{4})[A-Z0-9]{12}/g, `$1${REDACTED}`],
  [/(eyJ[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, `$1${REDACTED}`],
  [/((?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis|amqp|https?):\/\/[^\s:@/]+:)[^\s@]+(@)/g, `$1${REDACTED}$2`],
];

/** `"SOME_TOKEN": "value"` pairs in text that is not valid JSON. */
const KEYED_VALUE_RE =
  /("[^"\n]*(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization|bearer|cookie)[^"\n]*"\s*:\s*")([^"\n]*)(")/gi;

export function isSecretKey(key) {
  return SECRET_KEY_RE.test(String(key));
}

function redactValue(value) {
  if (typeof value === "string") return value ? REDACTED : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactValue(v);
    return out;
  }
  return value;
}

/** Redact a parsed JSON value: secret-shaped keys and whole env blocks. */
export function redactJson(value, { inEnvBlock = false } = {}) {
  if (Array.isArray(value)) return value.map((item) => redactJson(item, { inEnvBlock }));
  if (value === null || typeof value !== "object") {
    return inEnvBlock ? redactValue(value) : value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (inEnvBlock || isSecretKey(key)) {
      out[key] = redactValue(child);
    } else if (ENV_BLOCK_KEY_RE.test(key)) {
      out[key] = redactJson(child, { inEnvBlock: true });
    } else {
      out[key] = redactJson(child);
    }
  }
  return out;
}

/**
 * `key = value` in a config file that is not JSON. Codex reads
 * ~/.codex/config.toml and ctx-debug.sh copies it into the report, so the
 * unquoted-key form has to be covered: KEYED_VALUE_RE above needs a quoted
 * key and would let the whole line through.
 */
const TOML_ASSIGNMENT_RE = /^(\s*)([A-Za-z0-9_.-]+)(\s*=\s*)(\S+)(\s*(?:#.*)?)$/;
const QUOTED_VALUE_RE = /^(['"])([\s\S]*)\1$/;

/** Redact the value of a `key = value` line when the key looks like a credential. */
function maskAssignmentLine(line) {
  const m = line.match(TOML_ASSIGNMENT_RE);
  if (!m) return line;
  const [, indent, key, eq, value, tail] = m;
  if (!isSecretKey(key)) return line;
  // Already handled by the shape pass above, and re-masking would drop the
  // shape's own prefix — `ghp_abcd***REDACTED***` would become a bare marker.
  if (value.includes(REDACTED)) return line;
  const quoted = QUOTED_VALUE_RE.exec(value);
  const inner = quoted ? quoted[2] : value;
  if (inner === "") return line;
  // Keep the original quoting so the file still parses as TOML/INI after
  // redaction — a bare marker where a string was would not.
  const masked = quoted ? `${quoted[1]}${REDACTED}${quoted[1]}` : REDACTED;
  return `${indent}${key}${eq}${masked}${tail}`;
}

/** Redact token and connection-string shapes in arbitrary text. */
export function redactText(text) {
  let out = String(text);
  for (const [pattern, replacement] of TEXT_PATTERNS) out = out.replace(pattern, replacement);
  out = out.replace(KEYED_VALUE_RE, (_m, prefix, value, suffix) => `${prefix}${value ? REDACTED : ""}${suffix}`);
  return out
    .split("\n")
    .map((line) => maskAssignmentLine(line))
    .join("\n");
}

/**
 * Redact a config file's content. JSON (with or without a trailing newline)
 * is walked structurally and re-serialised; anything else is pattern-matched.
 * The result is cut to `maxChars` AFTER redaction so a secret can never
 * straddle the cut.
 */
export function redactConfigContent(content, { maxChars = 3000 } = {}) {
  let out;
  try {
    out = JSON.stringify(redactJson(JSON.parse(content)), null, 2);
  } catch {
    out = content;
  }
  return redactText(out).slice(0, maxChars);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: ctx-debug-redact.mjs <file>");
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(redactConfigContent(readFileSync(file, "utf8"))));
}
