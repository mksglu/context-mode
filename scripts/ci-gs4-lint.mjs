#!/usr/bin/env node
// scripts/ci-gs4-lint.mjs — GS4 CI lint (TECH-SPEC §1 GS4, §6.8; impl/14-tests.md §7).
// CI tool, not runtime: regex is allowed here (impl/00 "CI scripts may use regex").
//
// Checks:
//   1. No file under e2e/ imports src/ (static import, dynamic import, require, new URL).
//      The KEEP-PASS exception (14-tests.md §7) never applies here: all 131 KEEP-PASS paths
//      live under tests/, session/, adapters/, hooks/, never under e2e/.
//   (The old check 2, the verdict table at https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-test-ledger.md, left with the dev folders: D-REPO-CLEAN-1.)
//
// Usage: node scripts/ci-gs4-lint.mjs [--root <dir>]
// Exit 0 = pass, 1 = fail. One PASS/FAIL line per check.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const ROOT = rootIdx >= 0
  ? path.resolve(argv[rootIdx + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SRC_DIR = path.join(ROOT, "src");
const E2E_DIR = path.join(ROOT, "e2e");
const CODE_EXT = new Set([".mjs", ".js", ".cjs", ".ts", ".mts", ".cts"]);
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\bnew\s+URL\s*\(\s*)(["'`])([^"'`\n]+)\1/g;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (CODE_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function resolveSpecifier(file, spec) {
  // D-M5-F1-1: a template-literal specifier with ${...} names no static path (same as a bare
  // specifier); only a static specifier can be checked against src/.
  if (spec.includes("${")) return null;
  if (spec.startsWith("file:")) return fileURLToPath(spec);
  if (spec.startsWith(".")) return path.resolve(path.dirname(file), spec);
  if (path.isAbsolute(spec)) return spec;
  return null; // bare package specifier
}

function insideSrc(p) {
  const rel = path.relative(SRC_DIR, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function checkE2eImports() {
  if (!existsSync(E2E_DIR)) return { ok: true, line: "PASS gs4-e2e-imports: no e2e/ directory" };
  const files = walk(E2E_DIR);
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(SPECIFIER)) {
      const target = resolveSpecifier(f, m[2]);
      if (target && insideSrc(target)) bad.push(`${path.relative(ROOT, f)} -> ${m[2]}`);
    }
  }
  if (bad.length) return { ok: false, line: `FAIL gs4-e2e-imports: ${bad.length} import(s) of src/ under e2e/\n  ${bad.join("\n  ")}` };
  return { ok: true, line: `PASS gs4-e2e-imports: ${files.length} e2e files, 0 src/ imports` };
}

const results = [checkE2eImports()];
for (const r of results) console.log(r.line);
process.exit(results.every((r) => r.ok) ? 0 : 1);
