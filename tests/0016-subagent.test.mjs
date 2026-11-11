// ADR-0016: subagent routing. Policy cases, the run wrapper, and the vscode project and tool-name handling.
// One file per area (docs/architecture/TEST-LAYOUT.md).
import { test, before, after, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path, { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { TOOL_ORDER, SERVER_KEY } from "../src/core/contracts/constants.ts";
import * as C from "../src/core/contracts/constants.ts";
import { getAdapter } from "../src/adapters/table.ts";
import { pickSubagentCase, toolSetForAgentType, isSubagentCall, geminiToolName } from "../src/core/policy/subagent.ts";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handleHook } from "../src/core/hooks/dispatch.ts";
import { buildRegistry } from "../src/setup/index.ts";
import { decode } from "../src/adapters/vscode.ts";
import { generateManifests } from "../build/manifests.ts";

// The words a POSIX shell passes for a line of single-quoted, backslash-escaped and bare words (D-CC-POINTER-5).
function posixWords(line) {
  const words = [];
  let cur = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'") { const end = line.indexOf("'", i + 1); cur = (cur ?? "") + line.slice(i + 1, end); i = end; }
    else if (ch === "\\") { cur = (cur ?? "") + line[i + 1]; i++; }
    else if (ch === " ") { if (cur !== null) words.push(cur); cur = null; }
    else cur = (cur ?? "") + ch;
  }
  if (cur !== null) words.push(cur);
  return words;
}
// Runs a printed `node ...` line in a real shell with `node` as a function that prints its arguments, one per line.
// A $( ), a backtick or a $VAR the shell runs or expands shows up as a file or as changed terms.
function shellArgs(nodeLine, cwd) {
  const sh = process.platform === "win32" ? "bash" : "sh";
  const r = spawnSync(sh, ["-c", "node() { for a in \"$@\"; do printf '%s\\n' \"$a\"; done; }; " + nodeLine], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: cwd } });
  return { status: r.status, args: r.stdout.split("\n").slice(0, -1), stderr: r.stderr };
}

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

  // #1342 (LV8 filled from the Claude Code 2.1.322 binary): general-purpose and fork have tools ["*"]; Explore and
  // Plan have all tools minus their disallowedTools (no MCP removal). claude-code-guide and statusline-setup keep a
  // fixed list with no ctx tool; an unknown name stays null -> C.
  test("#1342 built-in Claude Code types: general-purpose, fork, Explore, Plan -> ctx tools -> A", () => {
    const f = fixture();
    try {
      for (const t of ["general-purpose", "fork", "Explore", "Plan"]) {
        const set = toolSetForAgentType(sub("claude-code", t), { projectDir: f.project, env: f.env });
        assert.ok(Array.isArray(set) && set.includes(CC + "ctx_search"), t);
        assert.equal(pickSubagentCase(sub("claude-code", t), set), "A", t);
      }
      for (const t of ["Explore", "Plan"]) {
        const set = toolSetForAgentType(sub("claude-code", t), { projectDir: f.project, env: f.env });
        for (const n of ["Agent", "Artifact", "ArtifactComments", "ArtifactData", "ArtifactCheck", "ExitPlanMode", "Edit", "Write", "NotebookEdit"]) assert.equal(set.includes(n), false, t + " " + n);
      }
    } finally { f.done(); }
  });

  test("#1342 claude-code-guide, statusline-setup and an unknown type are never A; other rows keep null", () => {
    const f = fixture();
    try {
      for (const t of ["claude-code-guide", "statusline-setup", "nope"]) {
        const set = toolSetForAgentType(sub("claude-code", t), { projectDir: f.project, env: f.env });
        assert.notEqual(pickSubagentCase(sub("claude-code", t), set), "A", t);
      }
      assert.equal(toolSetForAgentType(sub("claude-code", "nope"), { projectDir: f.project, env: f.env }), null);
      // The built-in row keys on claude-code: a Qwen type with the same name is unchanged.
      assert.equal(toolSetForAgentType(sub("qwen", "general-purpose"), { projectDir: f.project, env: f.env }), null);
    } finally { f.done(); }
  });

  test("#1342 a project agent file still wins over a built-in name", () => {
    const f = fixture();
    try {
      f.put(f.project, "Explore", "tools: Read\n");
      assert.deepEqual(toolSetForAgentType(sub("claude-code", "Explore"), { projectDir: f.project, env: f.env }), ["Read"]);
    } finally { f.done(); }
  });

  test("#1342 synced plugin agents: plugins/synced/<id>/<plugin>/agents/<agent>.md; dot dirs are never read", () => {
    const f = fixture();
    try {
      const synced = join(f.home, ".claude/plugins/synced");
      const put = (id, agent, front) => {
        mkdirSync(join(synced, id, "organon/agents"), { recursive: true });
        writeFileSync(join(synced, id, "organon/agents", agent + ".md"), "---\nname: " + agent + "\n" + front + "---\nbody\n");
      };
      put("abc", "canvas-author", "tools: Read, " + CC + "ctx_search\n");
      put("abc", "plain", "tools: Read, Bash\n");
      put(".trash", "hidden", "tools: " + CC + "ctx_search\n");
      const s = { projectDir: f.project, env: f.env };
      const a = toolSetForAgentType(sub("claude-code", "organon:canvas-author"), s);
      assert.deepEqual(a, ["Read", CC + "ctx_search"]);
      assert.equal(pickSubagentCase(sub("claude-code", "organon:canvas-author"), a), "A");
      assert.equal(pickSubagentCase(sub("claude-code", "organon:plain"), toolSetForAgentType(sub("claude-code", "organon:plain"), s)), "B");
      assert.equal(toolSetForAgentType(sub("claude-code", "organon:hidden"), s), null);
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

// #1319 (Claude Code auto mode): v1 added a block to every Agent prompt, and a resend got it again, so auto mode
// never approved the call. v2 never edits the Agent input: the hook answers with no output, first call and resend alike.
describe("ADR-0016: Agent input is never changed (#1319)", { concurrency: CONC }, () => {
  test("claude-code PreToolUse Agent: no output on the first call and on the resend", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "cm-1319-"));
    const env = { HOME: home, USERPROFILE: home, PATH: process.env.PATH, CLAUDE_PROJECT_DIR: home };
    const payload = { hook_event_name: "PreToolUse", session_id: "s-1319", cwd: home, tool_name: "Agent",
      tool_input: { description: "d", prompt: "look at the repo", subagent_type: "general-purpose" } };
    try {
      for (let i = 0; i < 2; i++) assert.deepEqual(await handleHook("claude-code", payload, env), { stdout: "", exitCode: 0 });
    } finally {
      rmSync(home, { recursive: true, force: true, maxRetries: 3 });
    }
  });
});

// #1342, #1358 (ADR-0016 line 16): the replace keeps one budget everywhere, and its follow-up line names only a
// tool the caller can call. Serial: the store dir comes from process.env (D-M1-T3-5).
describe("ADR-0016: replace pointer the caller can call (#1342, #1358)", () => {
  const CC = getAdapter("claude-code").toolNamePrefix;
  const ENTRY = resolve(fileURLToPath(import.meta.url), "../../src/entries/run.ts");
  let root, repo, data, env, oldData, shim;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-ptr-"));
    repo = join(root, "repo");
    data = join(root, "data");
    mkdirSync(join(repo, ".claude/agents"), { recursive: true });
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(join(repo, ".claude/agents/reader.md"), "---\nname: reader\ntools: Read, mcp__x__y\n---\nb\n");
    writeFileSync(join(repo, ".claude/agents/sheller.md"), "---\nname: sheller\ntools: Read, Bash\n---\nb\n");
    shim = join(root, "bundle", C.SEARCH_WRAPPER_FILE);
    mkdirSync(join(root, "bundle"));
    writeFileSync(shim, `import ${JSON.stringify(pathToFileURL(ENTRY).href)};\n`);
    oldData = process.env[C.DATA_DIR_ENV];
    process.env[C.DATA_DIR_ENV] = data;
    env = { HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: repo, PATH: process.env.PATH, [C.DATA_DIR_ENV]: data };
  });

  after(() => {
    if (oldData === undefined) delete process.env[C.DATA_DIR_ENV]; else process.env[C.DATA_DIR_ENV] = oldData;
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });

  const big = (n, word = "row") => Array.from({ length: n }, (_, i) => word + "-" + i + " filler words for the line " + i).join("\n") + "\n";
  const post = (fields) => ({ hook_event_name: "PostToolUse", session_id: "s-" + Math.random().toString(36).slice(2), cwd: repo, ...fields });
  const textOf = (o) => typeof o === "string" ? o : Array.isArray(o) ? o.map((b) => b.text ?? "").join("\n")
    : o.stdout ?? o.content ?? o.file?.content ?? JSON.stringify(o);
  const replaced = async (p) => {
    const out = await handleHook("claude-code", p, env);
    assert.notEqual(out.stdout, "", "a replace, not a passthrough");
    return textOf(JSON.parse(out.stdout).hookSpecificOutput.updatedToolOutput);
  };
  const labels = (sessionId) => {
    const projects = join(data, "projects");
    const db = new DatabaseSync(join(projects, readdirSync(projects)[0], "context.db"), { readOnly: true });
    try { return db.prepare("SELECT label FROM sources WHERE session_id = ? ORDER BY id").all(sessionId).map((r) => r.label); } finally { db.close(); }
  };
  const argsOf = posixWords;
  const runTwin = (line, terms) => {
    const at = line.indexOf("node ");
    assert.ok(at >= 0, line);
    const args = argsOf(line.slice(at + "node ".length));
    assert.equal(basename(args[0]), C.SEARCH_WRAPPER_FILE, line);
    args[2] = terms;
    return spawnSync(process.execPath, [shim, ...args.slice(1)], { cwd: tmpdir(), encoding: "utf8", env });
  };

  test("#1342 case C subagent (tools: Read, mcp__x__y): a replace in budget that names no ctx tool", async () => {
    const text = big(1200);
    const r = await replaced(post({ agent_id: "a1", agent_type: "reader", tool_use_id: "tu-c", tool_name: "Read", tool_input: { file_path: "/big.log" }, tool_response: text }));
    assert.equal(r.includes("ctx_"), false, r);
    assert.ok(Buffer.byteLength(r) < 1024, "within the replace budget: " + Buffer.byteLength(r));
    assert.ok(r.includes(String(Buffer.byteLength(text) - 1)) || r.includes(String(Buffer.byteLength(text))), "states the size: " + r);
  });

  test("#1342 case B subagent (Bash, no ctx): names the search.mjs line and no ctx tool; the line works", async () => {
    const p = post({ agent_id: "a1", agent_type: "sheller", tool_use_id: "tu-b", tool_name: "Bash", tool_input: { command: "seq-like" }, tool_response: { stdout: big(1200), stderr: "", interrupted: false } });
    const r = await replaced(p);
    assert.equal(r.includes("ctx_"), false, r);
    const s = runTwin(r.slice(r.lastIndexOf("\n") + 1), "row-777");
    assert.equal(s.status, 0, s.stderr);
    assert.ok(s.stdout.includes("row-777 "), s.stdout.slice(0, 300));
  });

  test("#1342 case A general-purpose subagent: still a replace, with the callable ctx_search pointer", async () => {
    const r = await replaced(post({ agent_id: "a1", agent_type: "general-purpose", tool_use_id: "tu-a", tool_name: "Read", tool_input: { file_path: "/big.log" }, tool_response: big(1200) }));
    assert.ok(r.includes(CC + "ctx_search({queries:["), r);
  });

  test("#1342 two subagent calls (tool_use_id tu1, tu2) are two sources with two labels", async () => {
    const sid = "s-two-" + Math.random().toString(36).slice(2);
    for (const [a, tu] of [["ag1", "tu1"], ["ag2", "tu2"]]) {
      await replaced({ ...post({ agent_id: a, agent_type: "Explore", tool_use_id: tu, tool_name: "Grep", tool_input: { pattern: "row" }, tool_response: big(1200) }), session_id: sid });
    }
    const l = labels(sid);
    assert.equal(l.length, 2, JSON.stringify(l));
    assert.notEqual(l[0], l[1], JSON.stringify(l));
  });

  // D-CC-POINTER-5: the intent is the Bash command, Grep pattern, path or URL. The twin quotes it for the shell, so
  // running the printed line never runs a $( ), a backtick or a $VAR in it, and search.mjs gets the terms unchanged.
  test("#1358 the search.mjs line quotes $( ), a backtick and $HOME: the shell runs nothing and passes the terms whole", async () => {
    const box = mkdtempSync(join(tmpdir(), "cm-ptr-q-"));
    try {
      const pattern = "row-777 $(touch " + join(box, "PWNED") + ") `touch " + join(box, "PWNED2") + "` $HOME it's";
      const r = await replaced(post({ tool_use_id: "tu-q", tool_name: "Grep", tool_input: { pattern }, tool_response: big(1200) }));
      const line = r.slice(r.lastIndexOf("\n") + 1);
      const s = shellArgs(line.slice(line.indexOf("node ")), box);
      assert.equal(s.status, 0, s.stderr);
      assert.equal(existsSync(join(box, "PWNED")), false, "the shell ran $( ): " + line);
      assert.equal(existsSync(join(box, "PWNED2")), false, "the shell ran a backtick: " + line);
      assert.equal(basename(s.args[0]), C.SEARCH_WRAPPER_FILE, line);
      assert.equal(s.args[2], pattern, "terms reach search.mjs unchanged: " + line);
      assert.deepEqual(posixWords(line.slice(line.indexOf("node ") + "node ".length)), s.args);
      const found = runTwin(line, "row-777");
      assert.equal(found.status, 0, found.stderr);
      assert.ok(found.stdout.includes("row-777 "), found.stdout.slice(0, 300));
    } finally { rmSync(box, { recursive: true, force: true }); }
  });

  test("#1358 main-session MCP result: query is never empty, and the search.mjs line returns a middle line from any cwd", async () => {
    const p = post({ tool_use_id: "tu-mcp", tool_name: "mcp__atlassian__getJiraIssue", tool_input: { issueIdOrKey: "X" }, tool_response: [{ type: "text", text: big(400, "JIRA") }] });
    const r = await replaced(p);
    assert.equal(r.includes('queries:[""]'), false, r);
    assert.ok(r.includes(CC + "ctx_search({queries:["), "the main pointer stays: " + r);
    const s = runTwin(r.slice(r.lastIndexOf("\n") + 1), "JIRA-150");
    assert.equal(s.status, 0, s.stderr);
    assert.ok(s.stdout.includes("JIRA-150 "), s.stdout.slice(0, 300));
  });
});

describe("ADR-0016: run wrapper", { concurrency: CONC }, () => {
  // Each case runs the real entry as a child process in a temp git repo with a temp HOME.
  const ENTRY = resolve(fileURLToPath(import.meta.url), "../../src/entries/run.ts");
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
    assert.ok(more.startsWith(C.RUN_MORE_PREFIX), more);
    const words = posixWords(more.slice(C.RUN_MORE_PREFIX.length));
    assert.equal(words[0], join(bundle, C.SEARCH_WRAPPER_FILE), more);
    assert.equal(words[2], "39999", more);
    // The more: line works: search.mjs <source-id> '<terms>' reads the same indexed output.
    const id = words[1];
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

  // D-VSCODE-ROOTS-1: the user mcp.json has no folder scope, so ${workspaceFolder} there stops the server from starting.
  // Setup writes no workspace arg; the server reads the workspace from MCP roots/list.
  test("H1: setup writes the VS Code MCP args with no ${workspaceFolder} (user scope cannot expand it)", () => {
    const row = buildRegistry({ home: "/h", pkgDir: "/abs/pkg", env: {} }).find((r) => r.id === "vscode");
    assert.deepEqual(row.config.value.args, [path.join("/abs/pkg", "server.mjs"), "--agent", "vscode"]);
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
