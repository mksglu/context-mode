// impl/08 §6: decide() rule table, §6.3 golden table (30 rows), V8 25/25 deny, DECISIONS-r8 Read-deny 4 cases,
// GP3/webfetch-allow-claude-ai-artifacts, GP3/powershell-same-hint-as-bash, drafts.md hook text blocks (B2).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { decide, denyMessage } from "../../../src/core/policy/decide.ts";
import { getAdapter } from "../../../src/adapters/table.ts";
import { READ_DENY_MESSAGE } from "../../../src/core/policy/read-deny.ts";
import {
  OUTPUT_CAP, PARSE_ERROR_DENY_LINE, prefixToolNames,
  POLICY_UNREADABLE_LINE, REQUIRE_SECURITY_ENV, USER_DENY_REASON_PREFIX,
} from "../../../src/core/contracts/constants.ts";

const CC = getAdapter("claude-code");
const CODEX = getAdapter("codex"); // no Read tool: shell dumps are checked (6a); no replace: size-guess denies stay
let dir, big, small;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "cm-decide-"));
  big = join(dir, "big.log");
  small = join(dir, "small.txt");
  writeFileSync(big, "x".repeat(300 * 1024));
  writeFileSync(small, "hello\n");
});
after(() => rmSync(dir, { recursive: true, force: true }));

function ev(canonicalName, input, extra = {}) {
  return { event: "PreToolUse", agent: "claude-code", sessionId: "s1", cwd: dir, tool: { name: canonicalName, canonicalName, input }, ...extra };
}
const bash = (command, row = CC, deny = []) => decide(ev("Bash", { command }), row, deny);
// Owner decision 2026-10-20 (D-M7-RR-1): size-guess denies run only on rows with no replace (CODEX here).
const bashNoReplace = (command, deny = []) => bash(command, CODEX, deny);

// §6.3: [command, expected kind, deny kind or null]
const CURL = "curl -s https://x.io/a.json";
const GOLDEN = [
  [CURL, "deny", "curl"],
  ["curl -sL -o out.bin https://x.io/f", "allow-or-hint", null],
  ["curl -s https://x.io | head -c 200", "allow-or-hint", null],
  ['git log --grep="curl"', "allow-or-hint", null],
  ["cat <<EOF\ncurl -s https://x.io/a.json\nEOF", "allow-or-hint", null],
  [`npm ci && ${CURL} && npm test`, "deny", "curl"],
  ["./gradlew build", "deny", "build"],
  [`sudo ${CURL}`, "deny", "curl"],
  [`env FOO=1 ${CURL}`, "deny", "curl"],
  [`time ${CURL}`, "deny", "curl"],
  [`nice -n 10 ${CURL}`, "deny", "curl"],
  [`timeout 5 ${CURL}`, "deny", "curl"],
  ["echo url | xargs curl -s", "deny", "curl"],
  [`command ${CURL}`, "deny", "curl"],
  [`bash -c "${CURL}"`, "deny", "curl"],
  [`sh -c "${CURL}"`, "deny", "curl"],
  [`echo "$(${CURL})"`, "deny", "curl"],
  ["echo `" + CURL + "`", "deny", "curl"],
  ["curl -s https://x.io/a.json | jq '.data'", "allow-or-hint", null],
  ["curl -s https://x.io/a.json | jq 'length'", "allow-or-hint", null],
  ["[[ -f a.txt ]] && echo ok", "allow-or-hint", null],
  ["echo $((1+1))", "allow-or-hint", null],
  [`deploy() { ${CURL}; }; deploy`, "deny", "curl"],
  [`case "$1" in x) ${CURL};; esac`, "deny", "curl"],
];

for (const [cmd, want, kind] of GOLDEN) {
  test(`§6.3 golden: ${JSON.stringify(cmd)}`, () => {
    const d = bashNoReplace(cmd);
    if (want === "deny") {
      assert.equal(d.kind, "deny");
      assert.equal(d.reason, denyMessage(kind, cmd, CODEX));
    } else assert.notEqual(d.kind, "deny", JSON.stringify(d));
  });
}

test("§6.3 golden: WebFetch of a claude.ai artifact URL is allowed (GP3/webfetch-allow-claude-ai-artifacts)", () => {
  for (const url of ["https://claude.ai/public/artifacts/abc", "https://x.claude.site/a", "https://a.claudeusercontent.com/b"]) {
    assert.deepEqual(decide(ev("WebFetch", { url }), CC, []), { kind: "allow" });
  }
  for (const url of ["https://example.com/a", "https://claude.ai.evil.io/x", "https://notclaude.ai/x"]) {
    const d = decide(ev("WebFetch", { url }), CC, []);
    assert.equal(d.kind, "deny");
    assert.equal(d.reason, denyMessage("webfetch", url, CC));
    assert.ok(d.reason.includes(CC.toolNamePrefix + "ctx_index, then " + CC.toolNamePrefix + "ctx_search"));
  }
});

test("§6.3 / DECISIONS-r8 Read-deny case 1: unranged Read over OUTPUT_CAP is denied", () => {
  const d = decide(ev("Read", { file_path: big }), CC, []);
  assert.deepEqual(d, { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CC.toolNamePrefix) });
});
test("Read-deny case 2: ranged Read over OUTPUT_CAP is never denied", () => {
  for (const input of [{ file_path: big, offset: 1 }, { file_path: big, limit: 200 }, { file_path: big, offset: 0, limit: 10 }]) {
    assert.deepEqual(decide(ev("Read", input), CC, []), { kind: "allow" }); // D-M7-RR-2: no Read hint
  }
});
test("Read-deny case 3: unbounded one-file shell dump over OUTPUT_CAP is denied (no Read tool host)", () => {
  const p = big.split(sep).join("/"); // shell spelling of the path; "\\" is an escape in Bash
  for (const cmd of [`cat ${p}`, `head ${p}`, `tail ${p}`, `sed -n p ${p}`, `less ${p}`, `jq . ${p}`, `bat ${p}`, `more ${p}`, "cat big.log"]) {
    const d = bash(cmd, CODEX);
    assert.deepEqual(d, { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CODEX.toolNamePrefix) }, cmd);
  }
});
test("Read-deny case 4: bounded shell dump is never denied", () => {
  for (const cmd of ["tail -c 200 big.log", "head -n 20 big.log", "tail -n 20 big.log", "head -20 big.log", "sed -n '1,20p' big.log", "cat small.txt"]) {
    assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
  }
  assert.notEqual(bash("cat big.log", CC).kind, "deny"); // host with a Read tool: no shell-dump rule
  assert.notEqual(decide(ev("Read", { file_path: small }), CC, []).kind, "deny");
});
test("Read path keys: Gemini/Qwen absolute_path", () => {
  assert.equal(decide(ev("Read", { absolute_path: big }), getAdapter("qwen"), []).kind, "deny");
});

test("§6.3 golden: echo \"unterminated -> ParseError, Q4 verdict", () => {
  assert.notEqual(bash('echo "unterminated').kind, "deny"); // no user rule could match
  // step 3 sees the whole text first: a rule on the first command is a plain user deny
  assert.deepEqual(bash('echo "unterminated', CC, ["Bash(echo:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(echo:*)" });
  assert.deepEqual(bash('ls; rm -rf / "x', CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: prefixToolNames(PARSE_ERROR_DENY_LINE, CC.toolNamePrefix) });
});

test("V8: 10 curl, 10 wget, 5 build commands -> 25/25 deny", () => {
  const cmds = [];
  for (let i = 0; i < 10; i++) cmds.push(`curl -s https://api.example.com/v1/items?page=${i}`);
  for (let i = 0; i < 10; i++) cmds.push(`wget -qO- https://data.example.com/dump-${i}.json`);
  cmds.push("./gradlew build", "gradle test", "mvn package", "./mvnw verify", "sbt compile");
  let denied = 0;
  for (const c of cmds) if (bashNoReplace(c).kind === "deny") denied++;
  assert.equal(denied, 25);
});

test("inline HTTP is denied with kind http", () => {
  const cmd = `node -e "fetch('https://x.io').then(r=>r.text()).then(console.log)"`;
  assert.deepEqual(bashNoReplace(cmd), { kind: "deny", reason: denyMessage("http", cmd, CODEX) });
  const py = `python3 -c "import requests; print(requests.get('https://x.io').text)"`;
  assert.equal(bashNoReplace(py).reason, denyMessage("http", py, CODEX));
});

test("#166: curl to a file that is not silent, or is verbose, is denied", () => {
  assert.equal(bashNoReplace("curl -o out.bin https://x.io/f").kind, "deny");
  assert.equal(bashNoReplace("curl -s -v -o out.bin https://x.io/f").kind, "deny");
  assert.notEqual(bashNoReplace("curl -s -o out.bin https://x.io/f").kind, "deny");
});

test("deny message: intent from description, tool prefix from the row", () => {
  const d = decide(ev("Bash", { command: CURL, description: "get items" }), CODEX, []);
  assert.equal(d.reason, denyMessage("curl", CURL, CODEX, "get items"));
  const lines = d.reason.split("\n");
  assert.equal(lines[2], "Tool: " + CODEX.toolNamePrefix + "ctx_execute");
  assert.deepEqual(JSON.parse(lines[3]), { language: "shell", code: CURL, intent: "get items" });
});

test("user deny is first, for Bash segments, Read and ctx_execute", () => {
  assert.deepEqual(bash("ls && rm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(rm -rf:*)" });
  assert.deepEqual(bash("sudo rm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(rm -rf:*)" });
  assert.equal(bash(CURL, CC, ["Bash(curl:*)"]).reason, USER_DENY_REASON_PREFIX + "Bash(curl:*)"); // before the curl rule
  const r = decide(ev("ctx_execute", { language: "shell", code: "rm -rf /tmp/x" }), CC, ["Bash(rm -rf:*)"]);
  assert.equal(r.kind, "deny");
  // E1: newline/CR does not bypass a rule
  assert.equal(bash("ls\nrm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]).kind, "deny");
  assert.equal(bash("ls\rrm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]).kind, "deny");
});

test("E2: unreadable policy fails closed only with the env flag", () => {
  const saved = process.env[REQUIRE_SECURITY_ENV];
  const savedWrite = process.stderr.write;
  process.stderr.write = () => true;
  try {
    process.env[REQUIRE_SECURITY_ENV] = "1";
    assert.deepEqual(bash("ls", CC, null), { kind: "deny", reason: prefixToolNames(POLICY_UNREADABLE_LINE, CC.toolNamePrefix) });
    delete process.env[REQUIRE_SECURITY_ENV];
    assert.notEqual(bash("ls", CC, null).kind, "deny");
  } finally {
    process.stderr.write = savedWrite;
    if (saved === undefined) delete process.env[REQUIRE_SECURITY_ENV]; else process.env[REQUIRE_SECURITY_ENV] = saved;
  }
});

test("D-M7-RR-2: no hint on any PreToolUse: bounded and unbounded Bash, PowerShell, Grep, Read, other MCP", () => {
  for (const row of [CC, CODEX]) {
    for (const c of ["pwd", "whoami", "git status", "node --version", "rm a.txt", "mv a b", "cp a b", "ls -la", "rm -v a.txt", "pwd > out.txt", "git log", "npm test"]) {
      assert.deepEqual(bash(c, row), { kind: "allow" }, row.id + " " + c);
    }
  }
});

test("GP3/powershell-same-decision-as-bash", () => {
  const ps = decide(ev("PowerShell", { command: "Get-ChildItem -Recurse" }), CC, []);
  const sh = bash("ls -R");
  assert.deepEqual(ps, sh);
  assert.deepEqual(ps, { kind: "allow" });
});

test("Grep, other MCP, own MCP tools and unknown tools are allowed with no hint (D-M7-RR-2)", () => {
  assert.deepEqual(decide(ev("Grep", { pattern: "x" }), CC, []), { kind: "allow" });
  assert.deepEqual(decide(ev("mcp:github:get_file", {}), CODEX, []), { kind: "allow" });
  assert.deepEqual(decide(ev("mcp:github:get_file", {}), CC, []), { kind: "allow" });
  assert.deepEqual(decide(ev("mcp:context-mode:ctx_stats", {}), CC, []), { kind: "allow" });
  assert.deepEqual(decide(ev("Edit", { file_path: big }), CC, []), { kind: "allow" });
  assert.deepEqual(decide(ev("Read", { file_path: small }), CC, []), { kind: "allow" });
});

test("D-M7-RR-1: a replace row (claude-code, pi) drops the Bash size-guess denies on the main agent", () => {
  const sizeGuess = [CURL, "wget -qO- https://data.example.com/d.json", "./gradlew build", "mvn package",
    `node -e "fetch('https://x.io').then(r=>r.text()).then(console.log)"`];
  for (const cmd of sizeGuess) {
    assert.deepEqual(bash(cmd, CC), { kind: "allow" }, cmd);
    assert.equal(bash(cmd, CODEX).kind, "deny", "no replace: one path, unchanged (ADR-0001) " + cmd);
  }
  const PI = getAdapter("pi");
  assert.deepEqual(decide({ ...ev("Bash", { command: CURL }), agent: "pi" }, PI, []), { kind: "allow" });
});

test("D-M7-RR-1: subagent calls keep the size-guess denies (ADR-0016 case A/B/C)", () => {
  const d = decide(ev("Bash", { command: CURL }, { agentId: "sub-1", agentType: "sheller" }), CC, []);
  assert.deepEqual(d, { kind: "deny", reason: denyMessage("curl", CURL, CC) });
});

test("D-M7-RR-1: kept on a replace row: user deny, parse-error deny, Read deny, WebFetch deny", () => {
  assert.deepEqual(bash(CURL, CC, ["Bash(curl:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(curl:*)" });
  assert.deepEqual(bash('ls; rm -rf / "x', CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: prefixToolNames(PARSE_ERROR_DENY_LINE, CC.toolNamePrefix) });
  assert.deepEqual(decide(ev("Read", { file_path: big }), CC, []), { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CC.toolNamePrefix) });
  assert.equal(decide(ev("WebFetch", { url: "https://example.com/a" }), CC, []).kind, "deny");
});

test("rule order (T-ROUTE): user deny beats the Read deny", () => {
  const rule = `Read(${big.split(sep).join("/")})`; // deny globs use "/" on every OS
  const r = decide(ev("Read", { file_path: big }), CC, [rule]);
  assert.equal(r.reason, USER_DENY_REASON_PREFIX + rule);
});

test("decide never returns replace", () => {
  for (const [cmd] of GOLDEN) assert.notEqual(bash(cmd).kind, "replace");
});

test("B2: drafts.md deny-* blocks equal the code's text (hint-* blocks retired, D-M7-RR-2)", () => {
  const md = readFileSync(new URL("../../../docs/v2/prompt/drafts.md", import.meta.url), "utf8");
  const block = (id) => {
    const at = md.indexOf(`<!-- id: ${id} -->`);
    assert.ok(at >= 0, id);
    const open = md.indexOf("```text\n", at) + "```text\n".length;
    return md.slice(open, md.indexOf("\n```", open));
  };
  const row = { toolNamePrefix: "{prefix}" };
  for (const k of ["curl", "http", "build"]) assert.equal(block("deny-" + k), denyMessage(k, "{command}", row, "{intent}"));
  assert.equal(block("deny-webfetch"), denyMessage("webfetch", "{url}", row));
  assert.equal(block("deny-read"), READ_DENY_MESSAGE("{path}", "{size}"));
  assert.ok(OUTPUT_CAP > 0);
});

// D-CDX-CAT-1: live Codex 0.156.1 (codex exec + fake provider) sends exec_command as tool_name "Bash"; the model
// wraps the cat in a chain or a zsh -lc. Each unbounded one-file dump that reaches stdout is denied, as for one command.
test("D-CDX-CAT-1: a chained or zsh-wrapped unbounded dump over OUTPUT_CAP is denied on a no-Read host", () => {
  const p = big.split(sep).join("/");
  const want = { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CODEX.toolNamePrefix) };
  for (const cmd of [`cd ${dir.split(sep).join("/")} && cat big.log`, "cat big.log; echo done", "ls && cat big.log", "echo ---; cat big.log",
    `zsh -lc "cat ${p}"`, `/bin/zsh -lc 'cat big.log'`, "true || cat big.log"]) {
    assert.deepEqual(bash(cmd, CODEX), want, cmd);
  }
});
test("D-CDX-CAT-1: a dump that feeds a pipe, a file or a bound is not denied; claude-code (Read tool) is unchanged", () => {
  for (const cmd of ["cat big.log | grep x", "cat big.log | head -n 5", "cat big.log > /dev/null", "cat big.log | wc -l; ls", "ls && head -n 3 big.log", "cat small.txt && ls"]) {
    assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
  }
  assert.notEqual(bash("ls && cat big.log", CC).kind, "deny");
});
