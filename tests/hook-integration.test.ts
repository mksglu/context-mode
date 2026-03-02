/**
 * Hook Integration Tests -- pretooluse.mjs
 *
 * Directly invokes the pretooluse.mjs hook script by piping simulated
 * JSON stdin (the same JSON that Claude Code sends) and asserts correct output.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, "..", "hooks", "pretooluse.mjs");

// Isolate tests from the user's real ~/.claude/settings.json so the
// security module (if built) finds no policies and falls through.
const ISOLATED_HOME = mkdtempSync(join(tmpdir(), "hook-test-home-"));

// Create mock project dir with security deny patterns so the security
// module has policies to enforce when CLAUDE_PROJECT_DIR is set.
const MOCK_PROJECT_DIR = mkdtempSync(join(tmpdir(), "hook-test-project-"));
mkdirSync(join(MOCK_PROJECT_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(MOCK_PROJECT_DIR, ".claude", "settings.json"),
  JSON.stringify({
    permissions: {
      deny: [
        "Bash(sudo *)",
        "Bash(rm -rf /*)",
        "Read(.env)",
        "Read(**/.env*)",
      ],
      allow: [
        "Bash(git:*)",
        "Bash(ls:*)",
      ],
    },
  }),
);

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

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runHook(input: Record<string, unknown>, env?: Record<string, string>): HookResult {
  const result = spawnSync("node", [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: 5000,
    env: { ...process.env, HOME: ISOLATED_HOME, ...env },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

/** Assert hook redirects Bash command to an echo message via updatedInput */
function assertRedirect(result: HookResult, substringInEcho: string) {
  assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}`);
  assert.ok(result.stdout.length > 0, "Expected non-empty stdout for redirect");
  const parsed = JSON.parse(result.stdout);
  const hso = parsed.hookSpecificOutput;
  assert.ok(hso, "Expected hookSpecificOutput in response");
  assert.ok(hso.updatedInput, "Expected updatedInput in hookSpecificOutput");
  assert.ok(
    hso.updatedInput.command.includes("echo"),
    `Expected updatedInput.command to be an echo, got: ${hso.updatedInput.command}`,
  );
  assert.ok(
    hso.updatedInput.command.includes(substringInEcho),
    `Expected echo to contain "${substringInEcho}", got: ${hso.updatedInput.command}`,
  );
}

/** Assert hook denies with permissionDecision: deny */
function assertDeny(result: HookResult, substringInReason: string) {
  assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}`);
  assert.ok(result.stdout.length > 0, "Expected non-empty stdout for deny");
  const parsed = JSON.parse(result.stdout);
  const hso = parsed.hookSpecificOutput;
  assert.ok(hso, "Expected hookSpecificOutput in response");
  assert.equal(hso.permissionDecision, "deny", `Expected permissionDecision=deny`);
  assert.ok(
    hso.reason.includes(substringInReason),
    `Expected reason to contain "${substringInReason}", got: ${hso.reason}`,
  );
}

function assertPassthrough(result: HookResult) {
  assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}`);
  assert.equal(result.stdout, "", `Expected empty stdout for passthrough, got: "${result.stdout}"`);
}

function assertHookSpecificOutput(result: HookResult, key: string) {
  assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}`);
  assert.ok(result.stdout.length > 0, "Expected non-empty stdout for hookSpecificOutput");
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.hookSpecificOutput, "Expected hookSpecificOutput in response");
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.ok(
    parsed.hookSpecificOutput[key] !== undefined,
    `Expected hookSpecificOutput.${key} to be defined`,
  );
}

async function main() {
  console.log("\nContext Mode — Hook Integration Tests (pretooluse.mjs)");
  console.log("======================================================\n");

  // ===== BASH: REDIRECTED COMMANDS =====
  console.log("--- Bash: Redirected Commands ---\n");

  await test("Bash + curl: redirected to echo via updatedInput", () => {
    const result = runHook({
      tool_name: "Bash",
      tool_input: { command: "curl -s http://example.com" },
    });
    assertRedirect(result, "context-mode");
  });

  await test("Bash + wget: redirected to echo via updatedInput", () => {
    const result = runHook({
      tool_name: "Bash",
      tool_input: { command: "wget http://example.com/file.tar.gz" },
    });
    assertRedirect(result, "context-mode");
  });

  await test("Bash + node -e with inline HTTP call: redirected to echo", () => {
    const result = runHook({
      tool_name: "Bash",
      tool_input: { command: `node -e "fetch('http://api.example.com/data')"` },
    });
    assertRedirect(result, "context-mode");
  });

  // ===== BASH: ALLOWED COMMANDS =====
  console.log("\n--- Bash: Allowed Commands ---\n");

  await test("Bash + git status: passthrough", () => {
    const result = runHook({
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });
    assertPassthrough(result);
  });

  await test("Bash + mkdir /tmp/test: passthrough", () => {
    const result = runHook({
      tool_name: "Bash",
      tool_input: { command: "mkdir /tmp/test" },
    });
    assertPassthrough(result);
  });

  // ===== WEBFETCH =====
  console.log("\n--- WebFetch ---\n");

  await test("WebFetch + any URL: denied with sandbox redirect", () => {
    const result = runHook({
      tool_name: "WebFetch",
      tool_input: { url: "https://docs.example.com/api" },
    });
    assertDeny(result, "fetch_and_index");
    const parsed = JSON.parse(result.stdout);
    assert.ok(
      parsed.hookSpecificOutput.reason.includes("https://docs.example.com/api"),
      "Expected original URL in reason",
    );
    assert.ok(
      parsed.hookSpecificOutput.reason.includes("Do NOT use curl"),
      "Expected curl warning in reason",
    );
  });

  // ===== TASK =====
  console.log("\n--- Task ---\n");

  await test("Task + prompt: hookSpecificOutput with updatedInput containing routing block", () => {
    const result = runHook({
      tool_name: "Task",
      tool_input: { prompt: "Analyze this codebase and summarize the architecture." },
    });
    assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}`);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout");
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.hookSpecificOutput, "Expected hookSpecificOutput");
    assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.ok(parsed.hookSpecificOutput.updatedInput, "Expected updatedInput");
    assert.ok(
      parsed.hookSpecificOutput.updatedInput.prompt.includes("<context_window_protection>"),
      "Expected <context_window_protection> XML tag in updatedInput.prompt",
    );
    assert.ok(
      parsed.hookSpecificOutput.updatedInput.prompt.includes("</context_window_protection>"),
      "Expected </context_window_protection> closing tag in updatedInput.prompt",
    );
    assert.ok(
      parsed.hookSpecificOutput.updatedInput.prompt.includes("<tool_selection_hierarchy>"),
      "Expected <tool_selection_hierarchy> tag in updatedInput.prompt",
    );
    assert.ok(
      parsed.hookSpecificOutput.updatedInput.prompt.includes("<forbidden_actions>"),
      "Expected <forbidden_actions> tag in updatedInput.prompt",
    );
    assert.ok(
      parsed.hookSpecificOutput.updatedInput.prompt.includes(
        "Analyze this codebase and summarize the architecture.",
      ),
      "Expected original prompt preserved in updatedInput.prompt",
    );
  });

  await test("Task + Bash subagent: upgraded to general-purpose for MCP access", () => {
    const result = runHook({
      tool_name: "Task",
      tool_input: {
        prompt: "Research this GitHub repository.",
        subagent_type: "Bash",
        description: "Research repo",
      },
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    const updated = parsed.hookSpecificOutput.updatedInput;
    assert.equal(
      updated.subagent_type,
      "general-purpose",
      `Expected subagent_type upgraded to general-purpose, got: ${updated.subagent_type}`,
    );
    assert.ok(
      updated.prompt.includes("<context_window_protection>"),
      "Expected XML routing block in prompt",
    );
    assert.ok(
      updated.prompt.includes("Research this GitHub repository."),
      "Expected original prompt preserved",
    );
    assert.equal(
      updated.description,
      "Research repo",
      "Expected other fields preserved",
    );
  });

  await test("Task + Explore subagent: keeps original subagent_type", () => {
    const result = runHook({
      tool_name: "Task",
      tool_input: {
        prompt: "Find all TypeScript files.",
        subagent_type: "Explore",
      },
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    const updated = parsed.hookSpecificOutput.updatedInput;
    assert.ok(
      updated.subagent_type === undefined || updated.subagent_type === "Explore",
      `Expected subagent_type to remain Explore or undefined, got: ${updated.subagent_type}`,
    );
  });

  // ===== READ =====
  console.log("\n--- Read ---\n");

  await test("Read + file_path: hookSpecificOutput with additionalContext nudge", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: "/some/path/to/file.ts" },
    });
    assertHookSpecificOutput(result, "additionalContext");
    const parsed = JSON.parse(result.stdout);
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes("context-mode"),
      "Expected nudge to mention context-mode",
    );
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes("<context_guidance>"),
      "Expected <context_guidance> XML wrapper in Read nudge",
    );
  });

  // ===== GREP =====
  console.log("\n--- Grep ---\n");

  await test("Grep + pattern: hookSpecificOutput with additionalContext nudge", () => {
    const result = runHook({
      tool_name: "Grep",
      tool_input: { pattern: "TODO", path: "/src" },
    });
    assertHookSpecificOutput(result, "additionalContext");
    const parsed = JSON.parse(result.stdout);
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes("context-mode"),
      "Expected nudge to mention context-mode",
    );
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes("<context_guidance>"),
      "Expected <context_guidance> XML wrapper in Grep nudge",
    );
  });

  // ===== PASSTHROUGH TOOLS =====
  console.log("\n--- Passthrough Tools ---\n");

  await test("Glob + pattern: passthrough", () => {
    const result = runHook({
      tool_name: "Glob",
      tool_input: { pattern: "**/*.ts" },
    });
    assertPassthrough(result);
  });

  await test("WebSearch: passthrough", () => {
    const result = runHook({
      tool_name: "WebSearch",
      tool_input: { query: "typescript best practices" },
    });
    assertPassthrough(result);
  });

  await test("Unknown tool (Edit): passthrough", () => {
    const result = runHook({
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/test.ts", old_string: "foo", new_string: "bar" },
    });
    assertPassthrough(result);
  });

  // ===== SECURITY: DENY/ALLOW =====
  console.log("\n--- Security Policy Enforcement ---\n");

  await test("Bash + sudo: denied by security policy", () => {
    const result = runHook(
      { tool_name: "Bash", tool_input: { command: "sudo apt install vim" } },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for deny");
    const parsed = JSON.parse(result.stdout);
    const hso = parsed.hookSpecificOutput;
    assert.equal(hso.permissionDecision, "deny");
    assert.ok(hso.reason.includes("sudo"), "Expected deny reason to mention sudo pattern");
  });

  await test("Bash + git status: allowed by security policy, passthrough", () => {
    const result = runHook(
      { tool_name: "Bash", tool_input: { command: "git status" } },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    // git:* is in allow list, so security allows it -> falls through to Stage 2
    // git status doesn't match curl/wget/fetch patterns -> passthrough
    assertPassthrough(result);
  });

  await test("Bash + curl: not in deny or allow list, security returns ask", () => {
    const result = runHook(
      { tool_name: "Bash", tool_input: { command: "curl -s http://example.com" } },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    // curl is not in deny list, but also not in allow list (git:*, ls:*).
    // evaluateCommand defaults to "ask" when no pattern matches, and the
    // hook returns permissionDecision: "ask" before reaching Stage 2.
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for ask");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "ask");
  });

  await test("MCP execute + shell + sudo: denied by security policy", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__execute",
        tool_input: { language: "shell", code: "sudo apt update" },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for deny");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  });

  await test("MCP execute + python: passthrough (no Bash patterns for non-shell)", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__execute",
        tool_input: { language: "python", code: "import os; os.system('sudo reboot')" },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    // Non-shell languages pass through even if code contains suspicious content
    assertPassthrough(result);
  });

  await test("MCP execute_file + denied Read path: denied", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__execute_file",
        tool_input: { path: "/project/.env", language: "shell", code: "cat $FILE_CONTENT" },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for deny");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
    assert.ok(
      parsed.hookSpecificOutput.reason.includes("Read deny pattern"),
      "Expected reason to mention Read deny pattern",
    );
  });

  await test("MCP execute_file + allowed path: passthrough", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__execute_file",
        tool_input: { path: "/project/src/main.ts", language: "shell", code: "wc -l $FILE_CONTENT" },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    assertPassthrough(result);
  });

  await test("MCP batch_execute + sudo in batch: denied", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__batch_execute",
        tool_input: {
          commands: [
            { label: "safe", command: "ls -la" },
            { label: "dangerous", command: "sudo rm -rf /" },
          ],
          queries: ["test"],
        },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for deny");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
    assert.ok(
      parsed.hookSpecificOutput.reason.includes("batch command"),
      "Expected reason to mention batch command",
    );
  });

  await test("MCP batch_execute + all allowed commands: passthrough", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__batch_execute",
        tool_input: {
          commands: [
            { label: "list", command: "ls -la" },
            { label: "status", command: "git status" },
          ],
          queries: ["test"],
        },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    // Both ls and git match allow patterns (ls:*, git:*) → all "allow" → passthrough
    assertPassthrough(result);
  });

  await test("MCP execute + shell + unrecognized command: ask", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__execute",
        tool_input: { language: "shell", code: "python3 script.py" },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    // python3 is not in deny or allow list → evaluateCommand defaults to "ask"
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for ask");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "ask");
  });

  await test("MCP batch_execute + unrecognized command in batch: ask", () => {
    const result = runHook(
      {
        tool_name: "mcp__plugin_context-mode_context-mode__batch_execute",
        tool_input: {
          commands: [
            { label: "list", command: "ls -la" },
            { label: "unknown", command: "python3 script.py" },
          ],
          queries: ["test"],
        },
      },
      { CLAUDE_PROJECT_DIR: MOCK_PROJECT_DIR },
    );
    // python3 not in any pattern → "ask" short-circuits the batch
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, "Expected non-empty stdout for ask");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "ask");
  });

  // Cleanup mock dirs
  try { rmSync(MOCK_PROJECT_DIR, { recursive: true, force: true }); } catch {}
  try { rmSync(ISOLATED_HOME, { recursive: true, force: true }); } catch {}

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
