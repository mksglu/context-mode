/**
 * SessionStart Hook Integration Tests -- sessionstart.mjs
 *
 * Verifies the SessionStart hook outputs the XML routing block
 * as additionalContext when a session starts.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, "..", "hooks", "sessionstart.mjs");

let passed = 0;
let failed = 0;
const results: {
  name: string;
  status: "PASS" | "FAIL";
  time: number;
  error?: string;
}[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const time = performance.now() - start;
    passed++;
    results.push({ name, status: "PASS", time });
    console.log(`  ✓ ${name} (${time.toFixed(0)} ms)`);
  } catch (err: any) {
    const time = performance.now() - start;
    failed++;
    results.push({ name, status: "FAIL", time, error: err.message });
    console.log(`  ✗ ${name} (${time.toFixed(0)} ms)`);
    console.log(`    Error: ${err.message}`);
  }
}

function runHook(input: Record<string, unknown>) {
  const result = spawnSync("node", [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: 5000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

async function main() {
  console.log("\nContext Mode — SessionStart Hook Integration Tests");
  console.log("===================================================\n");

  await test("SessionStart: outputs additionalContext with XML routing block", () => {
    const result = runHook({});
    assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}`);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout");
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.hookSpecificOutput, "Expected hookSpecificOutput");
    assert.equal(
      parsed.hookSpecificOutput.hookEventName,
      "SessionStart",
      "Expected hookEventName to be SessionStart",
    );
    assert.ok(
      parsed.hookSpecificOutput.additionalContext,
      "Expected additionalContext in hookSpecificOutput",
    );
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(
      ctx.includes("<context_window_protection>"),
      "Expected <context_window_protection> opening tag",
    );
    assert.ok(
      ctx.includes("</context_window_protection>"),
      "Expected </context_window_protection> closing tag",
    );
    assert.ok(
      ctx.includes("<tool_selection_hierarchy>"),
      "Expected <tool_selection_hierarchy> tag",
    );
    assert.ok(
      ctx.includes("<forbidden_actions>"),
      "Expected <forbidden_actions> tag",
    );
    assert.ok(
      ctx.includes("<output_constraints>"),
      "Expected <output_constraints> tag",
    );
    assert.ok(
      ctx.includes("batch_execute"),
      "Expected batch_execute mentioned in routing block",
    );
  });

  await test("SessionStart: routing block contains tool selection hierarchy", () => {
    const result = runHook({});
    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes("GATHER"), "Expected GATHER step");
    assert.ok(ctx.includes("FOLLOW-UP"), "Expected FOLLOW-UP step");
    assert.ok(ctx.includes("PROCESSING"), "Expected PROCESSING step");
  });

  await test("SessionStart: routing block contains output constraints", () => {
    const result = runHook({});
    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes("500 words"), "Expected 500-word limit");
    assert.ok(
      ctx.includes("Write artifacts"),
      "Expected artifact policy",
    );
  });

  // ===== SUMMARY =====
  console.log("\n" + "=".repeat(60));
  console.log(
    `Results: ${passed} passed, ${failed} failed (${passed + failed} total)`,
  );
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
