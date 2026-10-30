// ADR-0016: subagent routing. Policy cases, the run wrapper, and the vscode project and tool-name handling.
// One file per area (docs/v2/TEST-LAYOUT.md).
import { test, before, after, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import path, { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { TOOL_ORDER, SERVER_KEY } from "../../src/core/contracts/constants.ts";
import * as C from "../../src/core/contracts/constants.ts";
import { getAdapter } from "../../src/adapters/table.ts";
import { pickSubagentCase, toolSetForAgentType, isSubagentCall, geminiToolName } from "../../src/core/policy/subagent.ts";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handleHook } from "../../src/core/hooks/dispatch.ts";
import { buildRegistry } from "../../src/setup/index.ts";
import { decode } from "../../src/adapters/vscode.ts";
import { generateManifests } from "../../build/manifests.ts";

describe("ADR-0016: subagent policy cases", { concurrency: CONC }, () => {
  // Unit tests for src/core/policy/subagent.ts (impl/08 §5, Assumption B4; ADR-0016; DECISIONS-r3 Q23).
  // GP3 ADR-0016 golden cases at the pick level: case A/B/C, unknown built-in type, no tools: line,
  // disallowedTools: mcp__*, main thread of --agent x, Gemini generateValidName() name.
  const ev = (agent, extra = {}) => ({ event: "PreToolUse", agent, sessionId: "s", cwd: "/p", ...extra });
  const sub = (agent, agentType) => ev(agent, { agentId: "a-1", agentType });
  const CC = getAdapter("claude-code").toolNamePrefix;

  // ---------- pickSubagentCase (§5.1) ----------

  test("toolSet null -> C for every agent (B4)", () => {
    for (const a of ["claude-code", "codex", "kiro", "qwen"]) assert.equal(pickSubagentCase(sub(a, "x"), null), "C");
  });

  test("ctx tool in toolSet -> A, even with Bash", () => {
    assert.equal(pickSubagentCase(sub("claude-code", "x"), ["Bash", CC + "ctx_search"]), "A");
    for (const t of TOOL_ORDER) assert.equal(pickSubagentCase(sub("claude-code", "x"), [CC + t]), "A");
  });

  test("ctx prefix is the row's own: codex underscore form is A, hyphen form is not (DECISIONS-r9 R1)", () => {
    const cx = getAdapter("codex").toolNamePrefix;
    assert.equal(pickSubagentCase(sub("codex", "x"), [cx + "ctx_execute"]), "A");
    assert.equal(pickSubagentCase(sub("codex", "x"), ["mcp__context-mode__ctx_execute"]), "C");
  });

  test("Bash and no ctx tool -> B; native shell name comes from the row", () => {
    assert.equal(pickSubagentCase(sub("claude-code", "x"), ["Bash", "Read"]), "B");
    assert.equal(pickSubagentCase(sub("qwen", "x"), ["run_shell_command"]), "B");
    assert.equal(pickSubagentCase(sub("qwen", "x"), ["Bash"]), "C");
  });

  test("neither ctx tool nor Bash -> C (incl. other MCP servers, Q1)", () => {
    assert.equal(pickSubagentCase(sub("claude-code", "x"), ["Read", "Grep", "WebFetch"]), "C");
    assert.equal(pickSubagentCase(sub("claude-code", "x"), ["mcp__grafana__query"]), "C");
    assert.equal(pickSubagentCase(sub("claude-code", "x"), []), "C");
  });

  // ---------- toolSetForAgentType (§5.2) ----------

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "cm-sub-"));
    const project = join(root, "proj");
    const home = join(root, "home");
    mkdirSync(join(project, ".claude/agents"), { recursive: true });
    mkdirSync(join(home, ".claude/agents"), { recursive: true });
    const put = (dir, name, front) => writeFileSync(join(dir, ".claude/agents", name + ".md"), "---\nname: " + name + "\ndescription: d\n" + front + "---\nbody\n");
    return { root, project, home, env: { HOME: home, USERPROFILE: home }, put, done: () => rmSync(root, { recursive: true, force: true }) };
  }

  test("main thread of claude --agent x (agentType, no agentId) is not a subagent call (step 1)", () => {
    assert.equal(isSubagentCall(ev("claude-code", { agentType: "x" })), false);
    assert.equal(isSubagentCall(sub("claude-code", "x")), true);
    assert.equal(toolSetForAgentType(ev("claude-code", { agentType: "x" }), { projectDir: "/nope", env: {} }), null);
  });

  test("project tools: minus disallowedTools; comma, bracket and list forms", () => {
    const f = fixture();
    try {
      f.put(f.project, "a", "tools: Bash, Read, Grep\ndisallowedTools: Grep\n");
      f.put(f.project, "b", "tools: [\"Bash\", 'Read']\n");
      f.put(f.project, "c", "tools:\n  - Read\n  - WebFetch\n");
      const s = { projectDir: f.project, env: f.env };
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "a"), s), ["Bash", "Read"]);
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "b"), s), ["Bash", "Read"]);
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "c"), s), ["Read", "WebFetch"]);
      assert.equal(pickSubagentCase(sub("claude-code", "a"), toolSetForAgentType(sub("claude-code", "a"), s)), "B");
      assert.equal(pickSubagentCase(sub("claude-code", "c"), toolSetForAgentType(sub("claude-code", "c"), s)), "C");
    } finally { f.done(); }
  });

  test("no tools: line -> inherits all tools incl. ctx tools -> case A, same deny as main session", () => {
    const f = fixture();
    try {
      f.put(f.project, "all", "");
      const set = toolSetForAgentType(sub("claude-code", "all"), { projectDir: f.project, env: f.env });
      assert.ok(set.includes("Bash") && set.includes(CC + "ctx_execute"));
      assert.equal(pickSubagentCase(sub("claude-code", "all"), set), "A");
    } finally { f.done(); }
  });

  test("disallowedTools: mcp__* -> ctx tools excluded -> case B, never A", () => {
    const f = fixture();
    try {
      f.put(f.project, "nomcp", "disallowedTools: mcp__*\n");
      const set = toolSetForAgentType(sub("claude-code", "nomcp"), { projectDir: f.project, env: f.env });
      assert.equal(set.some((n) => n.startsWith("mcp__")), false);
      assert.equal(pickSubagentCase(sub("claude-code", "nomcp"), set), "B");
    } finally { f.done(); }
  });

  test("source order: project wins over user, no merge; user used when project lacks it", () => {
    const f = fixture();
    try {
      f.put(f.project, "both", "tools: Read\n");
      f.put(f.home, "both", "tools: Bash\n");
      f.put(f.home, "onlyuser", "tools: Bash\n");
      const s = { projectDir: f.project, env: f.env };
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "both"), s), ["Read"]);
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "onlyuser"), s), ["Bash"]);
    } finally { f.done(); }
  });

  test("plugin agents: <plugin>:<agent> read from installed_plugins.json installPath/agents/", () => {
    const f = fixture();
    try {
      const install = join(f.root, "cache/myplug/1.0.0");
      mkdirSync(join(install, "agents"), { recursive: true });
      writeFileSync(join(install, "agents/rev.md"), "---\nname: rev\ntools: Bash\n---\n");
      mkdirSync(join(f.home, ".claude/plugins"), { recursive: true });
      writeFileSync(join(f.home, ".claude/plugins/installed_plugins.json"),
        JSON.stringify({ version: 2, plugins: { "myplug@mkt": [{ scope: "user", installPath: install }] } }));
      const s = { projectDir: f.project, env: f.env };
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "myplug:rev"), s), ["Bash"]);
      assert.equal(toolSetForAgentType(sub("claude-code", "other:rev"), s), null);
    } finally { f.done(); }
  });

  test("--agents JSON is the last source; it never overrides a file source", () => {
    const f = fixture();
    try {
      f.put(f.project, "p", "tools: Read\n");
      const cliAgents = { j: { description: "d", prompt: "p", tools: ["Bash"], disallowedTools: [] }, p: { tools: ["Bash"] } };
      const s = { projectDir: f.project, env: f.env, cliAgents };
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "j"), s), ["Bash"]);
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "p"), s), ["Read"]);
    } finally { f.done(); }
  });

  test("unknown built-in type before LV8 (Explore, Plan, general-purpose) -> null -> C, never A or allow", () => {
    const f = fixture();
    try {
      for (const t of ["Explore", "Plan", "general-purpose", "nope"]) {
        const set = toolSetForAgentType(sub("claude-code", t), { projectDir: f.project, env: f.env });
        assert.equal(set, null);
        assert.equal(pickSubagentCase(sub("claude-code", t), set), "C");
      }
    } finally { f.done(); }
  });

  test("agentType with a path separator or dot segment never reads a file", () => {
    const f = fixture();
    try {
      f.put(f.project, "x", "tools: Bash\n");
      const s = { projectDir: join(f.project, "sub"), env: f.env };
      mkdirSync(join(f.project, "sub/.claude/agents"), { recursive: true });
      assert.equal(toolSetForAgentType(sub("claude-code", "../../.claude/agents/x"), s), null);
      assert.equal(toolSetForAgentType(sub("claude-code", ".."), s), null);
      assert.equal(toolSetForAgentType(sub("claude-code", ""), s), null);
    } finally { f.done(); }
  });

  test("no frontmatter or unreadable file -> not defined there, no exception", () => {
    const f = fixture();
    try {
      writeFileSync(join(f.project, ".claude/agents/raw.md"), "just text\n");
      assert.equal(toolSetForAgentType(sub("claude-code", "raw"), { projectDir: f.project, env: f.env }), null);
      assert.equal(toolSetForAgentType(sub("claude-code", "raw"), { projectDir: "/does/not/exist", env: {} }), null);
    } finally { f.done(); }
  });

  // ---------- Gemini generateValidName() matcher (§5.2 step 4) ----------

  test("geminiToolName builds the generateValidName() shape and matches the gemini row prefix", () => {
    const g = getAdapter("gemini").toolNamePrefix;
    assert.equal(geminiToolName(SERVER_KEY, "ctx_execute"), g + "ctx_execute");
    assert.equal(geminiToolName("my server", "do/it!"), "mcp_my_server_do_it_");
  });

  test("gemini frontmatter names are normalized before the ctx-prefix check", () => {
    const f = fixture();
    try {
      f.put(f.project, "g", "tools: mcp_context-mode_ctx search\n");
      const set = toolSetForAgentType(sub("gemini", "g"), { projectDir: f.project, env: f.env });
      assert.deepEqual(set, [getAdapter("gemini").toolNamePrefix + "ctx_search"]);
      assert.equal(pickSubagentCase(sub("gemini", "g"), set), "A");
    } finally { f.done(); }
  });
});

describe("ADR-0016: run wrapper", { concurrency: CONC }, () => {
  // Each case runs the real entry as a child process in a temp git repo with a temp HOME.
  const ENTRY = resolve(fileURLToPath(import.meta.url), "../../../src/entries/run.ts");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");

  function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), "cm-v2-runwrap-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const ws = join(dir, "ws");
    const bundle = join(dir, "bundle");
    for (const d of [ws, bundle]) mkdirSync(d, { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: ws });
    // Two shims named like the release files: the entry picks its job from argv[1]'s file name.
    for (const f of ["run.mjs", C.SEARCH_WRAPPER_FILE]) writeFileSync(join(bundle, f), `import ${JSON.stringify(pathToFileURL(ENTRY).href)};\n`);
    const run = (args) => spawnSync(process.execPath, [join(bundle, "run.mjs"), ...args], {
      cwd: ws, encoding: "utf8", env: { PATH: process.env.PATH, HOME: dir, USERPROFILE: dir, TMPDIR: tmpdir() },
    });
    const search = (args) => spawnSync(process.execPath, [join(bundle, C.SEARCH_WRAPPER_FILE), ...args], {
      cwd: ws, encoding: "utf8", env: { PATH: process.env.PATH, HOME: dir, USERPROFILE: dir, TMPDIR: tmpdir() },
    });
    return { ws, bundle, run, search };
  }

  test("[M3] run.mjs: no payload -> usage line on stderr, exit 1", (t) => {
    const { run } = fixture(t);
    const r = run([]);
    assert.equal(r.status, C.RUN_FAIL_EXIT);
    assert.equal(r.stderr, C.RUN_USAGE_LINE + "\n");
    assert.equal(r.stdout, "");
  });

  test("[M3] run.mjs: a deny snapshot that is not a JSON string[] is a usage error", (t) => {
    const { run } = fixture(t);
    const r = run([b64("echo hi"), b64("{not json")]);
    assert.equal(r.status, C.RUN_FAIL_EXIT);
    assert.equal(r.stderr, C.RUN_USAGE_LINE + "\n");
  });

  test("[M3] run.mjs: small output comes back whole after the summary line, exit 0", (t) => {
    const { run } = fixture(t);
    const r = run([b64("echo hello"), b64("[]")]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "exit 0 · 6 B\nhello\n");
  });

  test("[M3] run.mjs: the subagent sees the command's own exit code", (t) => {
    const { run } = fixture(t);
    const r = run([b64("echo out; echo err >&2; exit 3"), b64("[]")]);
    assert.equal(r.status, 3);
    assert.ok(r.stdout.startsWith("exit 3 · "), r.stdout);
    assert.ok(r.stdout.includes("err"), "stderr joins the output on a non-zero exit");
  });

  test("[M3] GP3/case-B deny re-check: a user deny rule still blocks the decoded command; it never runs", (t) => {
    const { ws, run } = fixture(t);
    const r = run([b64("touch marker"), b64(JSON.stringify(["Bash(touch:*)"]))]);
    assert.equal(r.status, C.RUN_FAIL_EXIT);
    assert.ok(r.stderr.startsWith(C.USER_DENY_REASON_PREFIX), r.stderr);
    assert.equal(r.stdout, "");
    assert.equal(existsSync(join(ws, "marker")), false);
  });

  test("[M3] run.mjs: a routing deny (the reason the hook sent it here) does not refuse the command", (t) => {
    const { run } = fixture(t);
    const r = run([b64("cat /dev/null; echo ran"), b64("[]")]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.endsWith("ran\n"), r.stdout);
  });

  test("[M3] GP3/case-B large output: reply <= OUTPUT_CAP, matching chunk kept, more: line names search.mjs", (t) => {
    const { bundle, run, search } = fixture(t);
    const r = run([b64("seq 1 40000"), b64("[]"), b64("39999")]);
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.slice(0, -1);
    assert.ok(Buffer.byteLength(out, "utf8") <= C.OUTPUT_CAP, `reply ${Buffer.byteLength(out)} B`);
    const lines = out.split("\n");
    assert.ok(lines[0].startsWith("exit 0 · "), lines[0]);
    assert.ok(lines.includes("39999"), "the chunk that matches the description is in the reply");
    const more = lines[lines.length - 1];
    const want = C.RUN_MORE_PREFIX + JSON.stringify(join(bundle, C.SEARCH_WRAPPER_FILE)) + " ";
    assert.ok(more.startsWith(want), more);
    assert.ok(more.endsWith(' "39999"'), more);
    // The more: line works: search.mjs <source-id> "<terms>" reads the same indexed output.
    const id = more.slice(want.length).split(" ")[0];
    const s = search([id, "12345"]);
    assert.equal(s.status, 0, s.stderr);
    assert.ok(s.stdout.split("\n").includes("12345"), "search.mjs returns the matching chunk");
    assert.ok(Buffer.byteLength(s.stdout, "utf8") <= C.OUTPUT_CAP + 1);
  });

  test("[M3] search.mjs: a missing or bad source id is a usage error", (t) => {
    const { search } = fixture(t);
    for (const args of [[], ["x"], ["-1"]]) {
      const s = search(args);
      assert.equal(s.status, C.RUN_FAIL_EXIT, JSON.stringify(args));
      assert.equal(s.stderr, C.SEARCH_USAGE_LINE + "\n");
    }
  });

  test("[M3] case-B constants carry the impl/04 §4 values", () => {
    assert.equal(C.RUN_TIMEOUT_EXIT, 124);
    assert.equal(C.RUN_FAIL_EXIT, 1);
    assert.equal(C.RUN_USAGE_LINE, "Usage: run.mjs <base64>");
    assert.equal(C.RUN_LABEL_PREFIX, "run.mjs:");
  });
});

// serial: sets process.env.HOME in before(); process.env is shared by every test in the file
describe("ADR-0016: vscode project resolution", () => {
  // OPEN-ITEMS H1 (D-HF-VSCODE-PROJECT-1). VS Code: the MCP server gets the workspace folder as
  // `--workspace-folder ${workspaceFolder}` (VS Code MCP configuration reference: predefined variables such as
  // ${workspaceFolder} in the server config); a hook gets it from the payload `cwd` (VS Code hooks reference,
  // "Common input": cwd). The VS Code terminal tool is `run_in_terminal`, so a shell dump there reaches the shell rule.
  let root, repo, oldHome;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), "cm-vscode-proj-"));
    repo = path.join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(path.join(repo, "big.log"), "x".repeat(200_000));
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
  });
  after(() => { process.env.HOME = oldHome; rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });

  test("H1: setup writes the VS Code MCP args with --workspace-folder ${workspaceFolder}", () => {
    const row = buildRegistry({ home: "/h", pkgDir: "/abs/pkg", env: {} }).find((r) => r.id === "vscode");
    assert.deepEqual(row.config.value.args, [path.join("/abs/pkg", "server.mjs"), "--agent", "vscode", "--workspace-folder", "${workspaceFolder}"]);
  });

  test("H1: the VS Code shell tools are run_in_terminal, runTerminalCommand, bash, powershell (D-N7-VSCODE-TOOLS-1)", () => {
    assert.deepEqual(getAdapter("vscode").nativeTools.shell, ["run_in_terminal", "runTerminalCommand", "bash", "powershell"]);
  });

  test("H1: a VS Code hook run from a project resolves it from the payload cwd and denies a large shell read", async () => {
    const env = { HOME: root, USERPROFILE: root, PATH: process.env.PATH };
    const out = await handleHook("vscode", {
      hook_event_name: "PreToolUse", session_id: "s-vscode", cwd: repo, timestamp: "2026-10-26T00:00:00Z",
      tool_name: "run_in_terminal", tool_input: { command: "cat big.log" },
    }, env);
    assert.equal(out.exitCode, 0);
    const h = JSON.parse(out.stdout).hookSpecificOutput;
    assert.equal(h.permissionDecision, "deny");
    assert.ok(h.permissionDecisionReason.includes("ctx_execute"), h.permissionDecisionReason);
    assert.ok(h.permissionDecisionReason.includes(path.join(repo, "big.log")) || h.permissionDecisionReason.includes("big.log"), h.permissionDecisionReason);
  });

  // D-HF-VSCODE-DECODE-1: the camelCase payload with hookEventName that next.6 rejected now reaches the shell rule.
  test("D-HF-VSCODE-DECODE-1: a camelCase hook payload (hookEventName) denies a large shell read like the snake_case one", async () => {
    const env = { HOME: root, USERPROFILE: root, PATH: process.env.PATH };
    const out = await handleHook("vscode", {
      hookEventName: "preToolUse", sessionId: "s-vscode-camel", cwd: repo, timestamp: 1790000000000,
      toolName: "run_in_terminal", toolArgs: { command: "cat big.log" },
    }, env);
    assert.equal(out.exitCode, 0);
    assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, "deny");
  });

  test("D-HF-VSCODE-DECODE-1: a payload with no readable event is not silent: allow shape and one decode-failed stderr line", async () => {
    const lines = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (c) => { lines.push(String(c)); return true; };
    let out;
    try { out = await handleHook("vscode", { sessionId: "x", cwd: repo }, { HOME: root, USERPROFILE: root, PATH: process.env.PATH }); } finally { process.stderr.write = orig; }
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    assert.equal(lines.length, 1, lines.join("|"));
    assert.ok(lines[0].startsWith("hooks: decode failed: vscode: missing required field hook_event_name"), lines[0]);
  });
});

// serial: sets process.env.HOME in before(); process.env is shared by every test in the file
describe("ADR-0016: vscode tool names", () => {
  // D-N7-VSCODE-TOOLS-1. Tool names a VS Code agent-mode hook payload carries, one list for decoder and table.
  // Local harness (hook_event_name PreToolUse, snake_case): tool_name is the internal tool id.
  //   microsoft/vscode 1.145.0 (90ff6fb, 2026-10-27) src/vs/workbench/contrib/chat/common/tools/terminalToolIds.ts:
  //     TerminalToolId.RunInTerminal = 'run_in_terminal'.
  //   microsoft/vscode-copilot-chat 0.44.0 (5863f5a) src/extension/tools/common/toolNames.ts: ToolName.ReadFile =
  //     'read_file' (input filePath, startLine, endLine: package.json copilot_readFile), FetchWebPage = 'fetch_webpage'
  //     (input urls[], query), CoreRunInTerminal = 'run_in_terminal'; src/extension/chat/vscode-node/chatHookService.ts
  //     executePreToolUseHook sends {tool_name: toolName, tool_input, tool_use_id} with the toolCall name from
  //     src/extension/prompts/node/panel/toolCalling.tsx.
  // Copilot harness (event names the hooks file registers, runs in the Copilot runtime):
  //   docs.github.com copilot/reference/hooks-reference ("Tool names for hook matching", "Claude-format matchers"):
  //   camelCase toolName is bash, powershell, view, web_fetch; PascalCase PreToolUse reports the Claude name
  //   (Bash, Read, WebFetch), which is already the canonical name.
  // "runTerminalCommand" is in none of these sources (vscode, vscode-copilot-chat, vscode-docs, github/docs). It is
  // mapped because the next.7 npm-package test received it live (toolName runTerminalCommand, "cat logs/app.log").
  let root, repo, oldHome;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), "cm-vscode-tools-"));
    repo = path.join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    mkdirSync(path.join(repo, "logs"));
    writeFileSync(path.join(repo, "logs", "app.log"), "x".repeat(200_000));
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
  });
  after(() => { process.env.HOME = oldHome; rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });

  const SHELL = ["run_in_terminal", "runTerminalCommand", "bash", "powershell"]; // runTerminalCommand: seen live in the next.7 npm-package test, in no source
  const READ = ["read_file", "view"];
  const FETCH = ["fetch_webpage", "web_fetch"];

  test("the vscode row lists every documented shell, read and fetch tool name", () => {
    const n = getAdapter("vscode").nativeTools;
    assert.deepEqual(n.shell, SHELL);
    assert.deepEqual(n.read, READ);
    assert.deepEqual(n.webfetch, FETCH);
  });

  test("decode maps each name to its canonical tool, snake_case and camelCase", () => {
    const canon = { run_in_terminal: "Bash", runTerminalCommand: "Bash", bash: "Bash", powershell: "Bash", read_file: "Read", view: "Read", fetch_webpage: "WebFetch", web_fetch: "WebFetch" };
    for (const [name, want] of Object.entries(canon)) {
      const snake = decode({ hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name: name, tool_input: {} });
      assert.equal(snake.tool.canonicalName, want, "snake " + name);
      const camel = decode({ hookEventName: "preToolUse", sessionId: "s", cwd: "/p", toolName: name, toolArgs: {} });
      assert.equal(camel.tool.canonicalName, want, "camel " + name);
    }
    for (const name of ["Bash", "Read", "WebFetch"]) { // Claude names from a PascalCase Copilot payload
      assert.equal(decode({ hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name: name, tool_input: {} }).tool.canonicalName, name);
    }
  });

  test("decode reads each tool's documented input keys", () => {
    const d = (tool_name, tool_input) => decode({ hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name, tool_input }).tool.input;
    assert.deepEqual(d("read_file", { filePath: "/a/b.log", startLine: 5, endLine: 20 }), { filePath: "/a/b.log", startLine: 5, endLine: 20, file_path: "/a/b.log", offset: 5, limit: 16 });
    assert.deepEqual(d("view", { path: "/a/b.log", view_range: [3, 9] }), { path: "/a/b.log", view_range: [3, 9], offset: 3, limit: 7 });
    assert.deepEqual(d("view", { path: "/a/b.log" }), { path: "/a/b.log" });
    assert.deepEqual(d("fetch_webpage", { urls: ["https://example.com/a", "https://example.com/b"], query: "q" }), { urls: ["https://example.com/a", "https://example.com/b"], query: "q", url: "https://example.com/a" });
    assert.deepEqual(d("web_fetch", { url: "https://example.com/a" }), { url: "https://example.com/a" });
  });

  const env = () => ({ HOME: root, USERPROFILE: root, PATH: process.env.PATH });
  const snake = (tool_name, tool_input) => ({ hook_event_name: "PreToolUse", session_id: "s-st", cwd: repo, timestamp: "2026-10-27T00:00:00Z", tool_name, tool_input });
  const camel = (toolName, toolArgs) => ({ hookEventName: "preToolUse", sessionId: "s-ct", cwd: repo, timestamp: 1790000000000, toolName, toolArgs });
  const denied = (out) => {
    assert.equal(out.exitCode, 0);
    assert.notEqual(out.stdout, "", "hook gave no output");
    return JSON.parse(out.stdout).hookSpecificOutput;
  };

  for (const name of SHELL) {
    for (const [form, make] of [["snake_case", snake], ["camelCase", camel]]) {
      test(`${form} ${name}: a 200 KB cat is denied with ctx_execute`, async () => {
        const h = denied(await handleHook("vscode", make(name, { command: "cat logs/app.log" }), env()));
        assert.equal(h.permissionDecision, "deny");
        assert.ok(h.permissionDecisionReason.includes("ctx_execute"), h.permissionDecisionReason);
      });
      test(`${form} ${name}: curl is denied`, async () => {
        const h = denied(await handleHook("vscode", make(name, { command: "curl https://example.org/data.json" }), env()));
        assert.equal(h.permissionDecision, "deny");
      });
    }
  }

  test("Claude-named PascalCase payloads (Copilot harness) deny a 200 KB cat and curl", async () => {
    assert.equal(denied(await handleHook("vscode", snake("Bash", { command: "cat logs/app.log" }), env())).permissionDecision, "deny");
    assert.equal(denied(await handleHook("vscode", snake("Bash", { command: "curl https://example.org/x" }), env())).permissionDecision, "deny");
  });

  for (const [form, make] of [["snake_case", snake], ["camelCase", camel]]) {
    test(`${form}: fetch_webpage and web_fetch are denied like WebFetch`, async () => {
      for (const [name, input] of [["fetch_webpage", { urls: ["https://example.org/page"], query: "q" }], ["web_fetch", { url: "https://example.org/page" }]]) {
        const h = denied(await handleHook("vscode", make(name, input), env()));
        assert.equal(h.permissionDecision, "deny", name);
        assert.ok(h.permissionDecisionReason.includes("https://example.org/page"), h.permissionDecisionReason);
      }
    });
    test(`${form}: view of a 200 KB file is denied, a ranged read_file and view are allowed`, async () => {
      const file = path.join(repo, "logs", "app.log");
      assert.equal(denied(await handleHook("vscode", make("view", { path: file }), env())).permissionDecision, "deny");
      assert.deepEqual(await handleHook("vscode", make("view", { path: file, view_range: [1, 20] }), env()), { stdout: "", exitCode: 0 });
      assert.deepEqual(await handleHook("vscode", make("read_file", { filePath: file, startLine: 1, endLine: 20 }), env()), { stdout: "", exitCode: 0 });
    });
  }

  test("the vscode hook file registers no matcher, so every tool name reaches the hook", () => {
    const dir = path.join(root, "pkg");
    mkdirSync(dir, { recursive: true });
    generateManifests(dir);
    const f = JSON.parse(readFileSync(path.join(dir, "hooks", "vscode.json"), "utf8"));
    for (const native of ["PreToolUse", "PostToolUse"]) {
      assert.equal(f.hooks[native].length, 1, native);
      assert.equal("matcher" in f.hooks[native][0], false, native);
    }
  });
});
