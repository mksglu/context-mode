#!/usr/bin/env node
// build/check-prompt-static.mjs — ADR-0021 rule 1 (OPEN-ITEMS C5): tool descriptions and instructions are
// build-time literals with no dynamic token, so initialize and tools/list stay byte-identical across starts.
// Scans src/prompt/instructions.md and src/prompt/tools/*.md (hooks/ templates are not prefix text).
// A dynamic token is: a date (dddd-dd-dd), a clock time (d:dd or dd:dd), a template (${...}), a brace
// placeholder ({name}), a user path (/Users/, /home/, ~/, <drive>:\), or a UUID (8-4-4-4-12 hex).
// Plain character scans, no regex. Usage: node build/check-prompt-static.mjs [--prompt-dir <dir>]
// Prints one line: "PASS check-prompt-static ..." (exit 0) or "FAIL <file>: <kind> ..." per hit (exit 1).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const at = argv.indexOf("--prompt-dir");
const DIR = at >= 0
  ? path.resolve(argv[at + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "prompt");

const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";
const isHex = (c) => isDigit(c) || (c !== undefined && ((c >= "a" && c <= "f") || (c >= "A" && c <= "F")));
const isWord = (c) => c !== undefined && (isDigit(c) || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "-");
const isAlpha = (c) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

// Does `shape` match text at i? Shape chars: "d" digit, "h" hex, any other char literal.
function shapeAt(text, i, shape) {
  for (let k = 0; k < shape.length; k++) {
    const c = text[i + k];
    const s = shape[k];
    if (s === "d" ? !isDigit(c) : s === "h" ? !isHex(c) : c !== s) return false;
  }
  return true;
}

// Each check returns the kind of token that starts at i, or undefined.
function tokenAt(text, i) {
  const prev = text[i - 1];
  if (!isHex(prev) && shapeAt(text, i, "hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh") && !isHex(text[i + 36])) return "uuid";
  if (!isDigit(prev) && shapeAt(text, i, "dddd-dd-dd") && !isDigit(text[i + 10])) return "date";
  if (!isDigit(prev) && (shapeAt(text, i, "d:dd") || shapeAt(text, i, "dd:dd"))) return "time";
  if (text.startsWith("${", i)) return "template";
  if (text[i] === "{") {
    let j = i + 1;
    while (isWord(text[j])) j++;
    if (j > i + 1 && text[j] === "}") return "brace placeholder";
  }
  if (text.startsWith("/Users/", i) || text.startsWith("/home/", i)) return "user path";
  if (text.startsWith("~/", i) || text.startsWith("~\\", i)) return "user path";
  if (!isAlpha(prev) && isAlpha(text[i]) && text.startsWith(":\\", i + 1)) return "user path";
  return undefined;
}

function scan(rel) {
  const text = readFileSync(path.join(DIR, rel), "utf8");
  const hits = [];
  for (let i = 0; i < text.length; i++) {
    const kind = tokenAt(text, i);
    if (kind !== undefined) hits.push(`FAIL ${rel}: ${kind} at char ${i}: ${JSON.stringify(text.slice(i, i + 24))}`);
  }
  return hits;
}

const files = ["instructions.md", ...readdirSync(path.join(DIR, "tools")).filter((f) => f.endsWith(".md")).sort().map((f) => path.join("tools", f))];
const hits = files.flatMap(scan);
if (hits.length) {
  console.log(hits.join("\n"));
  process.exit(1);
}
console.log(`PASS check-prompt-static ${files.length} prompt files, no dynamic token (ADR-0021 rule 1)`);
