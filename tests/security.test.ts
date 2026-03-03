/**
 * Security Module — Pattern Matching Tests
 *
 * Tests for parseBashPattern, globToRegex, matchesAnyPattern,
 * chained command splitting, shell-escape scanning, and file path evaluation.
 */

import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let passed = 0;
let failed = 0;
const results: { name: string; status: "PASS" | "FAIL"; error?: string }[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    results.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    results.push({ name, status: "FAIL", error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

import {
  parseBashPattern,
  globToRegex,
  matchesAnyPattern,
  splitChainedCommands,
  readBashPolicies,
  evaluateCommand,
  evaluateCommandDenyOnly,
  parseToolPattern,
  readToolDenyPatterns,
  fileGlobToRegex,
  evaluateFilePath,
  extractShellCommands,
} from "../build/security.js";

async function main() {
  console.log("\nSecurity Module — Pattern Matching Tests");
  console.log("========================================\n");

  // ── parseBashPattern ──

  await test("parseBashPattern: extracts glob from Bash(glob)", () => {
    assert.equal(parseBashPattern("Bash(sudo *)"), "sudo *");
  });

  await test("parseBashPattern: handles colon format", () => {
    assert.equal(parseBashPattern("Bash(tree:*)"), "tree:*");
  });

  await test("parseBashPattern: returns null for non-Bash", () => {
    assert.equal(parseBashPattern("Read(.env)"), null);
  });

  await test("parseBashPattern: returns null for malformed", () => {
    assert.equal(parseBashPattern("Bash("), null);
    assert.equal(parseBashPattern("notapattern"), null);
  });

  // ── globToRegex: word boundary tests from SECURITY.md ──

  await test("glob: 'ls *' matches 'ls -la'", () => {
    assert.ok(globToRegex("ls *").test("ls -la"));
  });

  await test("glob: 'ls *' does NOT match 'lsof -i'", () => {
    assert.ok(!globToRegex("ls *").test("lsof -i"));
  });

  await test("glob: 'ls*' matches 'lsof -i' (prefix)", () => {
    assert.ok(globToRegex("ls*").test("lsof -i"));
  });

  await test("glob: 'ls*' matches 'ls -la'", () => {
    assert.ok(globToRegex("ls*").test("ls -la"));
  });

  await test("glob: 'git *' matches 'git commit -m msg'", () => {
    assert.ok(globToRegex("git *").test('git commit -m "msg"'));
  });

  await test("glob: '* commit *' matches 'git commit -m msg'", () => {
    assert.ok(globToRegex("* commit *").test('git commit -m "msg"'));
  });

  // ── globToRegex: colon separator ──

  await test("glob: 'tree:*' matches 'tree' (no args)", () => {
    assert.ok(globToRegex("tree:*").test("tree"));
  });

  await test("glob: 'tree:*' matches 'tree -a'", () => {
    assert.ok(globToRegex("tree:*").test("tree -a"));
  });

  await test("glob: 'tree:*' does NOT match 'treemap'", () => {
    assert.ok(!globToRegex("tree:*").test("treemap"));
  });

  // ── globToRegex: real-world deny patterns ──

  await test("glob: 'sudo *' matches 'sudo apt install'", () => {
    assert.ok(globToRegex("sudo *").test("sudo apt install"));
  });

  await test("glob: 'sudo *' does NOT match 'sudoedit'", () => {
    assert.ok(!globToRegex("sudo *").test("sudoedit"));
  });

  await test("glob: 'rm -rf /*' matches 'rm -rf /etc'", () => {
    assert.ok(globToRegex("rm -rf /*").test("rm -rf /etc"));
  });

  await test("glob: 'chmod -R 777 *' matches 'chmod -R 777 /tmp'", () => {
    assert.ok(globToRegex("chmod -R 777 *").test("chmod -R 777 /tmp"));
  });

  // ── globToRegex: case sensitivity ──

  await test("glob: case-insensitive 'dir *' matches 'DIR /W'", () => {
    assert.ok(globToRegex("dir *", true).test("DIR /W"));
  });

  await test("glob: case-sensitive 'dir *' does NOT match 'DIR /W'", () => {
    assert.ok(!globToRegex("dir *", false).test("DIR /W"));
  });

  // ── matchesAnyPattern ──

  await test("matchesAnyPattern: returns matching pattern on hit", () => {
    const result = matchesAnyPattern(
      "sudo apt install",
      ["Bash(git:*)", "Bash(sudo *)"],
      false,
    );
    assert.equal(result, "Bash(sudo *)");
  });

  await test("matchesAnyPattern: returns null on miss", () => {
    const result = matchesAnyPattern(
      "npm install",
      ["Bash(sudo *)", "Bash(rm -rf /*)"],
      false,
    );
    assert.equal(result, null);
  });

  // ── splitChainedCommands ──
  console.log("\n--- Chained Command Splitting ---\n");

  await test("splitChainedCommands: simple && chain", () => {
    const parts = splitChainedCommands("echo hello && sudo rm -rf /");
    assert.deepEqual(parts, ["echo hello", "sudo rm -rf /"]);
  });

  await test("splitChainedCommands: || chain", () => {
    const parts = splitChainedCommands("test -f /tmp/x || sudo reboot");
    assert.deepEqual(parts, ["test -f /tmp/x", "sudo reboot"]);
  });

  await test("splitChainedCommands: semicolon chain", () => {
    const parts = splitChainedCommands("cd /tmp; sudo rm -rf /");
    assert.deepEqual(parts, ["cd /tmp", "sudo rm -rf /"]);
  });

  await test("splitChainedCommands: pipe chain", () => {
    const parts = splitChainedCommands("cat /etc/passwd | sudo tee /tmp/out");
    assert.deepEqual(parts, ["cat /etc/passwd", "sudo tee /tmp/out"]);
  });

  await test("splitChainedCommands: multiple operators", () => {
    const parts = splitChainedCommands("echo a && echo b; sudo rm -rf /");
    assert.deepEqual(parts, ["echo a", "echo b", "sudo rm -rf /"]);
  });

  await test("splitChainedCommands: respects double quotes", () => {
    const parts = splitChainedCommands('echo "hello && world"');
    assert.deepEqual(parts, ['echo "hello && world"']);
  });

  await test("splitChainedCommands: respects single quotes", () => {
    const parts = splitChainedCommands("echo 'test; value'");
    assert.deepEqual(parts, ["echo 'test; value'"]);
  });

  await test("splitChainedCommands: single command unchanged", () => {
    const parts = splitChainedCommands("git status");
    assert.deepEqual(parts, ["git status"]);
  });

  // ── evaluateCommand with chained commands ──
  console.log("\n--- Chained Command Evaluation ---\n");

  const chainTmpBase = join(tmpdir(), `chain-test-${Date.now()}`);
  const chainGlobalDir = join(chainTmpBase, "global-home", ".claude");
  const chainGlobalPath = join(chainGlobalDir, "settings.json");
  mkdirSync(chainGlobalDir, { recursive: true });
  writeFileSync(
    chainGlobalPath,
    JSON.stringify({
      permissions: {
        deny: ["Bash(sudo *)", "Bash(rm -rf /*)"],
        allow: ["Bash(echo:*)", "Bash(git:*)"],
      },
    }),
  );

  await test("evaluateCommand: detects 'sudo' in 'echo ok && sudo rm -rf /'", () => {
    const policies = readBashPolicies(undefined, chainGlobalPath);
    const result = evaluateCommand("echo ok && sudo rm -rf /", policies, false);
    assert.equal(result.decision, "deny");
    assert.equal(result.matchedPattern, "Bash(sudo *)");
  });

  await test("evaluateCommand: detects 'sudo' after semicolon", () => {
    const policies = readBashPolicies(undefined, chainGlobalPath);
    const result = evaluateCommand("cd /tmp; sudo apt install vim", policies, false);
    assert.equal(result.decision, "deny");
  });

  await test("evaluateCommand: detects 'rm -rf' in piped chain", () => {
    const policies = readBashPolicies(undefined, chainGlobalPath);
    const result = evaluateCommand("cat file | rm -rf /etc", policies, false);
    assert.equal(result.decision, "deny");
  });

  await test("evaluateCommandDenyOnly: detects chained deny", () => {
    const policies = readBashPolicies(undefined, chainGlobalPath);
    const result = evaluateCommandDenyOnly("echo hello && sudo rm -rf /", policies, false);
    assert.equal(result.decision, "deny");
  });

  await test("evaluateCommandDenyOnly: allows safe chained commands", () => {
    const policies = readBashPolicies(undefined, chainGlobalPath);
    const result = evaluateCommandDenyOnly("echo hello && git status", policies, false);
    assert.equal(result.decision, "allow");
  });

  rmSync(chainTmpBase, { recursive: true, force: true });

  // ── readBashPolicies ──
  console.log("\n--- Settings Reader ---\n");

  const tmpBase = join(tmpdir(), `security-test-${Date.now()}`);
  const globalDir = join(tmpBase, "global-home", ".claude");
  const globalSettingsPath = join(globalDir, "settings.json");
  const projectDir = join(tmpBase, "project");
  const projectClaudeDir = join(projectDir, ".claude");

  mkdirSync(globalDir, { recursive: true });
  mkdirSync(projectClaudeDir, { recursive: true });

  writeFileSync(
    globalSettingsPath,
    JSON.stringify({
      permissions: {
        allow: ["Bash(npm:*)", "Read(.env)"],
        deny: ["Bash(sudo *)"],
      },
    }),
  );

  writeFileSync(
    join(projectClaudeDir, "settings.json"),
    JSON.stringify({
      permissions: {
        deny: ["Bash(npm publish)"],
        allow: [],
      },
    }),
  );

  await test("readBashPolicies: reads global only when no projectDir", () => {
    const policies = readBashPolicies(undefined, globalSettingsPath);
    assert.equal(policies.length, 1, "should have 1 policy (global)");
    assert.deepEqual(policies[0].allow, ["Bash(npm:*)"]);
    assert.deepEqual(policies[0].deny, ["Bash(sudo *)"]);
  });

  await test("readBashPolicies: reads project + global with precedence", () => {
    const policies = readBashPolicies(projectDir, globalSettingsPath);
    assert.equal(policies.length, 2, "should have 2 policies");
    assert.deepEqual(policies[0].deny, ["Bash(npm publish)"]);
    assert.deepEqual(policies[1].allow, ["Bash(npm:*)"]);
    assert.deepEqual(policies[1].deny, ["Bash(sudo *)"]);
  });

  await test("readBashPolicies: missing files produce empty policies", () => {
    const policies = readBashPolicies("/nonexistent/path", globalSettingsPath);
    assert.equal(policies.length, 1);
  });

  // ── evaluateCommand ──

  await test("evaluateCommand: global allow matches", () => {
    const policies = readBashPolicies(undefined, globalSettingsPath);
    const result = evaluateCommand("npm install", policies, false);
    assert.equal(result.decision, "allow");
    assert.equal(result.matchedPattern, "Bash(npm:*)");
  });

  await test("evaluateCommand: global deny beats allow", () => {
    const policies = readBashPolicies(undefined, globalSettingsPath);
    const result = evaluateCommand("sudo npm install", policies, false);
    assert.equal(result.decision, "deny");
    assert.equal(result.matchedPattern, "Bash(sudo *)");
  });

  await test("evaluateCommand: local deny overrides global allow", () => {
    const policies = readBashPolicies(projectDir, globalSettingsPath);
    const result = evaluateCommand("npm publish", policies, false);
    assert.equal(result.decision, "deny");
    assert.equal(result.matchedPattern, "Bash(npm publish)");
  });

  await test("evaluateCommand: no match returns ask", () => {
    const policies = readBashPolicies(projectDir, globalSettingsPath);
    const result = evaluateCommand("python script.py", policies, false);
    assert.equal(result.decision, "ask");
    assert.equal(result.matchedPattern, undefined);
  });

  // ── evaluateCommandDenyOnly ──

  await test("evaluateCommandDenyOnly: denied command", () => {
    const policies = readBashPolicies(undefined, globalSettingsPath);
    const result = evaluateCommandDenyOnly("sudo rm -rf /", policies, false);
    assert.equal(result.decision, "deny");
    assert.equal(result.matchedPattern, "Bash(sudo *)");
  });

  await test("evaluateCommandDenyOnly: non-denied returns allow", () => {
    const policies = readBashPolicies(undefined, globalSettingsPath);
    const result = evaluateCommandDenyOnly("npm install", policies, false);
    assert.equal(result.decision, "allow");
    assert.equal(result.matchedPattern, undefined);
  });

  // ── parseToolPattern ──
  console.log("\n--- Tool Pattern Parsing ---\n");

  await test("parseToolPattern: Read(.env)", () => {
    const result = parseToolPattern("Read(.env)");
    assert.deepEqual(result, { tool: "Read", glob: ".env" });
  });

  await test("parseToolPattern: Grep(**/*.ts)", () => {
    const result = parseToolPattern("Grep(**/*.ts)");
    assert.deepEqual(result, { tool: "Grep", glob: "**/*.ts" });
  });

  await test("parseToolPattern: Bash(sudo *)", () => {
    const result = parseToolPattern("Bash(sudo *)");
    assert.deepEqual(result, { tool: "Bash", glob: "sudo *" });
  });

  await test("parseToolPattern: returns null for bare string", () => {
    assert.equal(parseToolPattern("notapattern"), null);
  });

  // ── readToolDenyPatterns ──

  const toolDenyTmpBase = join(tmpdir(), `tool-deny-test-${Date.now()}`);
  const toolDenyGlobalDir = join(toolDenyTmpBase, "global-home", ".claude");
  const toolDenyGlobalPath = join(toolDenyGlobalDir, "settings.json");

  mkdirSync(toolDenyGlobalDir, { recursive: true });
  writeFileSync(
    toolDenyGlobalPath,
    JSON.stringify({
      permissions: {
        deny: [
          "Read(.env)",
          "Read(**/.env)",
          "Read(**/*credentials*)",
          "Bash(sudo *)",
          "Bash(rm -rf /*)",
        ],
        allow: [],
      },
    }),
  );

  await test("readToolDenyPatterns: returns only Read globs for Read", () => {
    const result = readToolDenyPatterns("Read", undefined, toolDenyGlobalPath);
    assert.equal(result.length, 1, "should have 1 settings file");
    assert.deepEqual(result[0], [".env", "**/.env", "**/*credentials*"]);
  });

  await test("readToolDenyPatterns: returns only Bash globs for Bash", () => {
    const result = readToolDenyPatterns("Bash", undefined, toolDenyGlobalPath);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], ["sudo *", "rm -rf /*"]);
  });

  await test("readToolDenyPatterns: returns empty for Grep (no patterns)", () => {
    const result = readToolDenyPatterns("Grep", undefined, toolDenyGlobalPath);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], []);
  });

  rmSync(toolDenyTmpBase, { recursive: true, force: true });

  // ── fileGlobToRegex ──
  console.log("\n--- File Glob Matching ---\n");

  await test("fileGlobToRegex: '.env' matches exactly '.env'", () => {
    assert.ok(fileGlobToRegex(".env").test(".env"));
  });

  await test("fileGlobToRegex: '.env' does not match 'src/.env'", () => {
    assert.ok(!fileGlobToRegex(".env").test("src/.env"));
  });

  await test("fileGlobToRegex: '**/.env' matches 'deep/nested/.env'", () => {
    assert.ok(fileGlobToRegex("**/.env").test("deep/nested/.env"));
  });

  await test("fileGlobToRegex: '**/.env' matches '.env' at root", () => {
    assert.ok(fileGlobToRegex("**/.env").test(".env"));
  });

  await test("fileGlobToRegex: '**/*credentials*' matches nested path", () => {
    assert.ok(fileGlobToRegex("**/*credentials*").test("secrets/credentials.json"));
  });

  await test("fileGlobToRegex: '**/*credentials*' does not match 'readme.md'", () => {
    assert.ok(!fileGlobToRegex("**/*credentials*").test("readme.md"));
  });

  // ── evaluateFilePath ──

  await test("evaluateFilePath: .env denied by ['.env']", () => {
    const result = evaluateFilePath(".env", [[".env"]], false);
    assert.equal(result.denied, true);
    assert.equal(result.matchedPattern, ".env");
  });

  await test("evaluateFilePath: src/config.ts not denied by ['.env']", () => {
    const result = evaluateFilePath("src/config.ts", [[".env"]], false);
    assert.equal(result.denied, false);
    assert.equal(result.matchedPattern, undefined);
  });

  await test("evaluateFilePath: deep/nested/.env denied by ['**/.env']", () => {
    const result = evaluateFilePath("deep/nested/.env", [["**/.env"]], false);
    assert.equal(result.denied, true);
    assert.equal(result.matchedPattern, "**/.env");
  });

  await test("evaluateFilePath: credentials file denied by ['**/*credentials*']", () => {
    const result = evaluateFilePath(
      "secrets/credentials.json",
      [["**/*credentials*"]],
      false,
    );
    assert.equal(result.denied, true);
    assert.equal(result.matchedPattern, "**/*credentials*");
  });

  await test("evaluateFilePath: readme.md not denied by ['**/*credentials*']", () => {
    const result = evaluateFilePath("readme.md", [["**/*credentials*"]], false);
    assert.equal(result.denied, false);
  });

  await test("evaluateFilePath: Windows path with backslashes", () => {
    const result = evaluateFilePath(
      "C:\\Users\\.env",
      [["**/.env"]],
      true,
    );
    assert.equal(result.denied, true);
    assert.equal(result.matchedPattern, "**/.env");
  });

  // ── extractShellCommands ──
  console.log("\n--- Shell-Escape Scanner ---\n");

  await test("extractShellCommands: Python os.system", () => {
    const result = extractShellCommands(
      'os.system("sudo rm -rf /")',
      "python",
    );
    assert.deepEqual(result, ["sudo rm -rf /"]);
  });

  await test("extractShellCommands: Python subprocess.run string", () => {
    const result = extractShellCommands(
      'subprocess.run("sudo apt install vim")',
      "python",
    );
    assert.deepEqual(result, ["sudo apt install vim"]);
  });

  await test("extractShellCommands: Python subprocess.run list args", () => {
    const result = extractShellCommands(
      'subprocess.run(["rm", "-rf", "/"])',
      "python",
    );
    assert.ok(result.length > 0, "should extract commands from list form");
    assert.ok(
      result.some((cmd) => cmd.includes("rm") && cmd.includes("-rf")),
      `should join list args into command string, got: ${JSON.stringify(result)}`,
    );
  });

  await test("extractShellCommands: Python subprocess.call list args", () => {
    const result = extractShellCommands(
      'subprocess.call(["sudo", "reboot"])',
      "python",
    );
    assert.ok(result.some((cmd) => cmd.includes("sudo") && cmd.includes("reboot")));
  });

  await test("extractShellCommands: JS execSync", () => {
    const cmds = extractShellCommands(
      'const r = execSync("sudo apt update")',
      "javascript",
    );
    assert.deepEqual(cmds, ["sudo apt update"]);
  });

  await test("extractShellCommands: JS spawnSync", () => {
    const cmds = extractShellCommands(
      'spawnSync("sudo", ["rm", "-rf"])',
      "javascript",
    );
    assert.ok(cmds.length > 0, "should detect spawnSync");
    assert.ok(cmds[0].includes("sudo"));
  });

  await test("extractShellCommands: Ruby system()", () => {
    const result = extractShellCommands(
      'system("sudo rm -rf /tmp")',
      "ruby",
    );
    assert.deepEqual(result, ["sudo rm -rf /tmp"]);
  });

  await test("extractShellCommands: Go exec.Command", () => {
    const result = extractShellCommands(
      'exec.Command("sudo", "rm", "-rf")',
      "go",
    );
    assert.ok(result.length > 0, "should detect Go exec.Command");
    assert.ok(result[0].includes("sudo"));
  });

  await test("extractShellCommands: PHP shell_exec", () => {
    const result = extractShellCommands(
      'shell_exec("sudo rm -rf /tmp")',
      "php",
    );
    assert.ok(result.length > 0, "should detect PHP shell_exec");
    assert.ok(result[0].includes("sudo"));
  });

  await test("extractShellCommands: PHP system()", () => {
    const result = extractShellCommands(
      'system("sudo reboot")',
      "php",
    );
    assert.ok(result.length > 0, "should detect PHP system()");
  });

  await test("extractShellCommands: Rust Command::new", () => {
    const result = extractShellCommands(
      'Command::new("sudo").arg("reboot")',
      "rust",
    );
    assert.ok(result.length > 0, "should detect Rust Command::new");
    assert.ok(result[0].includes("sudo"));
  });

  await test("extractShellCommands: safe JS code returns empty", () => {
    const result = extractShellCommands(
      'console.log("hello")',
      "javascript",
    );
    assert.deepEqual(result, []);
  });

  await test("extractShellCommands: unknown language returns empty", () => {
    const result = extractShellCommands(
      'os.system("rm -rf /")',
      "haskell",
    );
    assert.deepEqual(result, []);
  });

  // Clean up temp files
  rmSync(tmpBase, { recursive: true, force: true });

  // ── Summary ──
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));
  if (failed > 0) {
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
