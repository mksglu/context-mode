/**
 * util/jsonc — string-aware JSONC comment + trailing-comma stripping and a
 * tolerant parse. Several agent CLIs ship config files as JSONC (VS Code
 * `mcp.json`, Zed `settings.json`), so a strict `JSON.parse` false-fails on a
 * perfectly valid commented file. Use `parseJsonc` whenever reading a
 * platform config we did not write ourselves.
 */

/** Strip `//` line + `/* *​/` block comments and trailing commas, string-aware. */
export function stripJsonComments(str: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let inBlockComment = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];
    if (inBlockComment) {
      if (c === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }
    if (escaped) { out += c; escaped = false; continue; }
    if (c === "\\") { out += c; escaped = inString; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (!inString && c === "/" && next === "/") {
      while (i < str.length && str[i] !== "\n") i++;
      if (i < str.length) out += "\n";
      continue;
    }
    if (!inString && c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    out += c;
  }
  // Trailing-comma removal, string-aware. The scan above already removed
  // comments, so this second pass over `out` only needs to track string state:
  // a comma is "trailing" when the next significant char is `}` or `]`. Doing
  // it here — instead of a post-hoc trailing-comma regex over the whole string —
  // preserves commas inside string literals (e.g. "[1, ]"), which that regex
  // silently corrupted to "[1 ]". See #787 review.
  let result = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (esc) { result += c; esc = false; continue; }
    if (c === "\\") { result += c; esc = inStr; continue; }
    if (c === '"') { inStr = !inStr; result += c; continue; }
    if (!inStr && c === ",") {
      let j = i + 1;
      while (j < out.length && (out[j] === " " || out[j] === "\t" || out[j] === "\r" || out[j] === "\n")) j++;
      if (out[j] === "}" || out[j] === "]") continue;
    }
    result += c;
  }
  return result;
}

/**
 * Parse JSON or JSONC. Tries strict `JSON.parse` first (fast, exact), then a
 * comment/trailing-comma-stripped parse. Returns `undefined` when both fail.
 */
export function parseJsonc<T = unknown>(raw: string): T | undefined {
  for (const candidate of [raw, stripJsonComments(raw)]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }
  return undefined;
}
