#!/usr/bin/env node
// e2e/checks/ci-config.mjs — local check for live case ci-config (14-tests.md §8).
// Line-based checks over .github/workflows/ci.yml text (CI/test script — regex allowed,
// 00-architecture.md "CI scripts may use regex"). Prints one JSON line, never throws.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CI_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

function fail(reason) {
  console.log(JSON.stringify({ ok: false, reason }));
  process.exit(0);
}

function main() {
  if (!existsSync(CI_PATH)) return fail("missing .github/workflows/ci.yml");
  const src = readFileSync(CI_PATH, "utf8");

  if (/\bon:\s*[\s\S]*?\bpull_request\s*:/m.test(src)) {
    return fail("ci.yml must have no pull_request trigger (ADR-0012)");
  }

  const pushBlock = src.match(/\bpush:\s*\n([\s\S]*?)(\n\S|\n\s*\w+:\s*\n|$)/);
  const pushText = pushBlock ? pushBlock[0] : "";
  if (!/branches:\s*\n\s*-\s*v2-design/.test(pushText) && !pushText.includes("v2-design")) {
    return fail("ci.yml push.branches must include v2-design");
  }

  if (!pushText.includes("impl/**")) return fail("ci.yml push.branches must include impl/**");
  if (!/runner\.os == 'Windows'[\s\S]{0,200}windows-grandchild-kill|windows-grandchild-kill[\s\S]{0,200}runner\.os == 'Windows'/.test(src)) {
    return fail("ci.yml needs a windows-only T-F5 step");
  }

  if (!/os:\s*\[[^\]]*macos-latest[^\]]*\]/.test(src) ||
      !/os:\s*\[[^\]]*ubuntu-latest[^\]]*\]/.test(src) ||
      !/os:\s*\[[^\]]*windows-latest[^\]]*\]/.test(src)) {
    return fail("ci.yml matrix must list macos-latest, ubuntu-latest, windows-latest");
  }
  if (!src.includes("24.15.0") || !/node:\s*\[[^\]]*24\.15\.0[^\]]*26/.test(src.replace(/\s/g, ""))) {
    // tolerant secondary check: both version strings present at all
    if (!src.includes("24.15.0") || !/26(\.x)?/.test(src)) {
      return fail("ci.yml node matrix must include 24.15.0 and 26.x");
    }
  }

  const stepLines = [...src.matchAll(/^\s*-\s*(?:name:\s*)?.*$/gm)].map((m) => m[0]);
  const joined = stepLines.join("\n");
  const buildIdx = joined.search(/build/i);
  const lintIdx = joined.search(/lint/i);
  const gpIdx = joined.search(/e2e\/cases\/run\.mjs/);
  const unitIdx = joined.search(/node --test "tests\/v2\/\*\*\/\*\.test\.mjs"|v2 unit tests/);
  if ([buildIdx, lintIdx, gpIdx, unitIdx].some((i) => i === -1)) {
    return fail("ci.yml test job must run build, lint, e2e/cases/run.mjs, then the v2 unit tests (D-M7-CLN-5)");
  }
  if (!(buildIdx < lintIdx && lintIdx < gpIdx && gpIdx < unitIdx)) {
    return fail("ci.yml step order must be build -> lint -> e2e/cases/run.mjs -> v2 unit tests");
  }

  // Open item 1: the D3 hook overhead gate runs on every OS of the ci matrix (no runner.os condition on its step).
  const hookGate = src.match(/-\s*run:\s*node e2e\/checks\/setup-hook-overhead\.mjs[^\n]*\n((?:(?![ \t]*-\s)[ \t]+[^\n]*\n)*)/);
  if (!hookGate) return fail("ci.yml needs the D3 step node e2e/checks/setup-hook-overhead.mjs");
  if (/\bif:/.test(hookGate[1])) return fail("ci.yml D3 hook overhead step must run on all three OSes (no if: condition)");

  // A real secret reference is a "${{ secrets.NAME }}" expression, or a key env name. The bare word "secrets" is
  // safe: line 97 runs build/check-secrets.mjs, whose file name the old \bsecrets\. pattern misread.
  const expressions = src.split("${{").slice(1).map((e) => e.split("}}")[0]);
  if (expressions.some((e) => e.trim().startsWith("secrets.") || e.includes("secrets[")) || src.includes("API_KEY")) {
    return fail("ci.yml must carry no secrets or key env (ADR-0012: no key in CI)");
  }

  if (!/timeout-minutes:\s*20\b/.test(src)) {
    return fail("ci.yml job must set timeout-minutes: 20 (DEVIATIONS D-M7-CI-2: Windows Node 26 hit the 10 min limit)");
  }

  console.log(JSON.stringify({ ok: true }));
}

main();
