// Differential test: every PreToolUse call the v1 suite makes (tests/v2/fixtures/v1-cases/pretooluse.json, recorded from
// context-mode 1.0.169 by scripts/v1-cases/) goes through the built v2 hook bundle. v1 allow/deny must equal v2 allow/deny,
// or the difference must sit in ALLOW below with a DEVIATIONS row id. A difference in neither fails the test: no silent skips.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/v2/fixtures/v1-cases/pretooluse.json"), "utf8"));
const DEVIATIONS = readFileSync(join(ROOT, "docs/v2/DEVIATIONS.md"), "utf8");

// v1 platform name -> v2 agent id. A v1 host with no v2 hook entry runs as codex (the plain Claude hook shape, no replace).
const HOST = { "claude-code": "claude-code", codex: "codex", "gemini-cli": "gemini", "qwen-code": "qwen", "vscode-copilot": "vscode", kiro: "kiro" };
// canonical tool -> the name that host sends (src/adapters/table.ts nativeTools, live fixtures).
const NATIVE = {
  gemini: { Bash: "run_shell_command", WebFetch: "web_fetch", Read: "read_file", Grep: "grep_search" },
  qwen: { Bash: "run_shell_command", WebFetch: "web_fetch", Read: "read_file", Grep: "grep_search" },
  vscode: { Bash: "run_in_terminal", WebFetch: "fetch_webpage", Read: "read_file" },
  kiro: { Bash: "execute_bash" },
};
const PREFIX = { "claude-code": "mcp__plugin_context-mode_context-mode__", codex: "mcp__context_mode__" };
const FOREIGN = "mcp__other__";
const V1_ONLY_NAMES = new Set(["exec_command", "run_command", "read_url_content", "mcp_web_fetch", "mcp_fetch_tool", "view_file", "local_shell", "shell_command", "Shell"]);

/** Allowed differences: id -> [DEVIATIONS row id, predicate(row, ctx)]. Every entry must match at least one row (no stale entries). */
const ALLOW = {
  replace: ["D-V1DIFF-REPLACE-1", (r, c) => c.agent !== "codex" && r.tool === "Bash" && r.v1.action === "modify" && c.v2 === "allow" && c.leg2 === "deny"],
  noInject: ["D-V1DIFF-NOINJECT-1", (r) => (r.tool === "Agent" || r.tool === "Task") && r.v1.action === "modify"],
  cwdPin: ["D-V1DIFF-CWDPIN-1", (r) => r.v1.action === "modify" && /ctx_(execute|batch_execute|execute_file)$/.test(r.tool ?? "")],
  noMarker: ["D-V1DIFF-NOMARKER-1", (r, c) => r.v1.action === "passthrough" && c.v2 === "deny" && (r.mcpReady === false || r.options?.mcpToolsAvailable === false)],
  hostNames: ["D-V1DIFF-HOSTNAMES-1", (r) => V1_ONLY_NAMES.has(r.tool ?? "")],
  foreign: ["D-V1DIFF-FOREIGN-1", (r) => (r.tool ?? "").startsWith(FOREIGN)],
  failClosed: ["D-V1DIFF-SECMODULE-1", (r) => (r.v1.reason || "").includes("fail-closed engaged")],
};

let work, bundle;
before(() => {
  work = mkdtempSync(join(tmpdir(), "cm-v1diff-"));
  bundle = join(work, "out");
  const b = spawnSync(process.execPath, [join(ROOT, "build", "build.mjs"), "--out", bundle], { encoding: "utf8", cwd: ROOT });
  assert.equal(b.status, 0, b.stderr);
});
after(() => rmSync(work, { recursive: true, force: true }));

function translate(row, agent) {
  let tool = row.tool ?? "", input = row.input ?? {};
  const base = tool.includes("__") ? tool.slice(tool.lastIndexOf("__") + 2) : tool;
  const own = !tool.startsWith(FOREIGN);
  if (own && (tool.startsWith("ctx_") || tool.startsWith("mcp__plugin_context-mode"))) {
    let name = base;
    if (base === "ctx_execute_file") { name = "ctx_execute"; input = { language: input.language, code: input.code, file: input.path }; }
    if (base === "ctx_batch_execute") { name = "ctx_batch"; input = { commands: (input.commands || []).map((c) => c.command) }; }
    tool = (PREFIX[agent] ?? PREFIX.codex) + name;
  } else if (NATIVE[agent]?.[tool]) tool = NATIVE[agent][tool];
  return { tool, input };
}

function run(agent, row, settings) {
  const home = mkdtempSync(join(work, "h-"));
  const repo = join(home, "repo");
  mkdirSync(join(repo, ".claude"), { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
  if (settings) {
    if (settings.project) writeFileSync(join(repo, ".claude/settings.json"), JSON.stringify(settings.project));
    if (settings.projectLocal) writeFileSync(join(repo, ".claude/settings.local.json"), JSON.stringify(settings.projectLocal));
    if (settings.user) writeFileSync(join(home, ".claude/settings.json"), JSON.stringify(settings.user));
  }
  const { tool, input } = translate(row, agent);
  const payload = { session_id: "s-" + row.id, cwd: repo, hook_event_name: agent === "gemini" ? "BeforeTool" : "PreToolUse", tool_name: tool, tool_input: input };
  const r = spawnSync(process.execPath, [join(bundle, "hook.mjs"), "--agent", agent], { input: JSON.stringify(payload), encoding: "utf8", cwd: repo, env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo } });
  assert.ok(r.status === 0 || r.status === 2, `${row.id}: hook exit ${r.status}: ${r.stderr}`); // the hook never errors: exit 0, or 2 for a host that denies by exit code
  return r.status === 2 || r.stdout.includes('"deny"') ? "deny" : "allow";
}

test("v1 cases: the fixture is the recorded v1 suite", () => {
  assert.equal(FIX.v1Version, "1.0.169");
  assert.ok(FIX.rows.length >= 300, "rows: " + FIX.rows.length);
  for (const r of FIX.rows) assert.ok(r.source && r.v1?.action, r.id);
});

test("every v1 PreToolUse case: same allow/deny in v2, or a named intended difference", () => {
  const hit = {}, unclassified = [], counts = { cases: 0, same: 0, intended: 0 };
  for (const row of FIX.rows) {
    const settings = row.settings ? FIX.settings[row.settings] : null;
    const agent = settings ? "claude-code" : HOST[row.platform] ?? "codex";
    const v1 = row.v1.action === "modify" || row.v1.action === "deny" ? "deny" : "allow";
    const v2 = run(agent, row, settings);
    // Second leg for run-then-replace hosts: the same dump on a host without replace must still deny (rule parity).
    const leg2 = agent !== "codex" && row.tool === "Bash" ? run("codex", row, null) : null;
    counts.cases++;
    if (v1 === v2) { counts.same++; if (leg2 !== null && !settings && v1 === "deny") assert.equal(leg2, "deny", row.id); continue; }
    const ctx = { agent, v2, leg2 };
    const id = Object.keys(ALLOW).find((k) => ALLOW[k][1](row, ctx));
    if (id === undefined) { unclassified.push(`${row.id} ${row.source} ${agent} v1=${row.v1.action} v2=${v2} ${row.tool} ${JSON.stringify(row.input).slice(0, 80)}`); continue; }
    hit[id] = (hit[id] ?? 0) + 1;
    if (process.env.V1DIFF_LIST) console.log("DIFF", id, row.id, agent, row.v1.action, "->", v2, row.tool, JSON.stringify(row.input).slice(0, 70));
    counts.intended++;
  }
  console.log("v1-v2-diff", JSON.stringify({ ...counts, byDeviation: hit }));
  assert.deepEqual(unclassified, [], "v1 and v2 differ and no ALLOW entry names the difference");
  for (const k of Object.keys(ALLOW)) assert.ok(hit[k] > 0, `ALLOW.${k} matched no row (stale entry)`);
});

test("every ALLOW entry cites a DEVIATIONS row", () => {
  for (const [k, [id]] of Object.entries(ALLOW)) assert.ok(DEVIATIONS.includes("| " + id + " |"), `${k}: ${id} is not in docs/v2/DEVIATIONS.md`);
});
