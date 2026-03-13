#!/usr/bin/env node
/**
 * Verify that the guidance throttle is working correctly.
 *
 * Run after upgrading context-mode to confirm that advisory guidance
 * (Read/Bash/Grep tips) fires once per session, not on every tool call.
 *
 * Usage:
 *   node scripts/verify-guidance-throttle.mjs
 *
 * Expected output: all checks PASS.
 */

import { routePreToolUse, resetGuidanceThrottle } from "../hooks/core/routing.mjs";

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  const icon = ok ? "\x1b[32m\u2713\x1b[0m" : "\x1b[31m\u2717\x1b[0m";
  console.log(`  ${icon}  ${label}`);
  if (!ok) {
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       got:      ${JSON.stringify(actual)}`);
    failed++;
  } else {
    passed++;
  }
}

// ── Fresh state ──────────────────────────────────────────
resetGuidanceThrottle();

console.log("\n--- Throttle: first call shows guidance ---\n");

const read1 = routePreToolUse("Read", { file_path: "/tmp/a.ts" });
check("Read: first call returns context guidance", read1?.action, "context");

const bash1 = routePreToolUse("Bash", { command: "ls -la" });
check("Bash: first call returns context guidance", bash1?.action, "context");

const grep1 = routePreToolUse("Grep", { pattern: "TODO" });
check("Grep: first call returns context guidance", grep1?.action, "context");

console.log("\n--- Throttle: subsequent calls are suppressed ---\n");

const read2 = routePreToolUse("Read", { file_path: "/tmp/b.ts" });
check("Read: second call returns null (throttled)", read2, null);

const bash2 = routePreToolUse("Bash", { command: "pwd" });
check("Bash: second call returns null (throttled)", bash2, null);

const grep2 = routePreToolUse("Grep", { pattern: "FIXME" });
check("Grep: second call returns null (throttled)", grep2, null);

console.log("\n--- Deny/modify actions are NEVER throttled ---\n");

const deny1 = routePreToolUse("WebFetch", { url: "https://example.com" });
check("WebFetch: first call is denied", deny1?.action, "deny");

const deny2 = routePreToolUse("WebFetch", { url: "https://other.com" });
check("WebFetch: second call is still denied", deny2?.action, "deny");

console.log("\n--- Per-type independence ---\n");

resetGuidanceThrottle();

routePreToolUse("Read", { file_path: "/tmp/a.ts" }); // consume Read
const bashAfterRead = routePreToolUse("Bash", { command: "ls" });
check("Bash guidance not affected by Read throttle", bashAfterRead?.action, "context");

const grepAfterRead = routePreToolUse("Grep", { pattern: "x" });
check("Grep guidance not affected by Read throttle", grepAfterRead?.action, "context");

console.log("\n--- Reset simulates new session ---\n");

resetGuidanceThrottle();
const readAfterReset = routePreToolUse("Read", { file_path: "/tmp/c.ts" });
check("Read: guidance returns after reset", readAfterReset?.action, "context");

// ── Summary ──────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (failed === 0) {
  console.log(`\x1b[32m\u2713 All ${passed} checks passed\x1b[0m — guidance throttle is working correctly.\n`);
  process.exit(0);
} else {
  console.log(`\x1b[31m\u2717 ${failed}/${passed + failed} checks failed\x1b[0m\n`);
  process.exit(1);
}
