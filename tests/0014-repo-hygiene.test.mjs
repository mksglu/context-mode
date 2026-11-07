// ADR-0013 (release automation), ADR-0014 (issue forms), ADR-0015 (README and repo cleanup): repo shape, gates, workflows, docs facts.
// One file per ADR area (docs/architecture/TEST-LAYOUT.md, ADR-0024); a fix adds its red test here.
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { HOOK_WORDS, LINE_PREFIX, agentRows, checkAgentLines, renderAgentBlocks, renderAgentLines, writeAgentLines } from "../build/readme-agents.mjs";
import { installWithRetry, missingPackages } from "../scripts/ci-install.mjs";
import { ADAPTERS } from "../src/adapters/table.ts";
import { AGENT_IDS } from "../src/core/contracts/agents.ts";
import { DOCTOR_CHECK_ORDER, REPORT_CAP, REPORT_SOURCE_LABEL } from "../src/core/contracts/constants.ts";

// Sections are independent: own temp dirs or read-only reads of the repo; none changes process.env or the cwd, so they run concurrently.
// One dated DEVIATIONS row per README change, and it quotes the owner.
function datedRow(id, quote) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs/architecture/modules/DEVIATIONS.md");
  const rows = readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("| 2026-") && l.includes(`(${id})`));
  assert.equal(rows.length, 1, `modules/DEVIATIONS.md has one ${id} row`);
  assert.ok(rows[0].includes(quote), `the ${id} row quotes the owner`);
}

// D-TIC-README-2: the README and docs/tools.md show real tool calls the way the agent terminal shows them.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRoot = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
// The terminal form of an MCP tool call as Claude Code shows it: the call line with its parameters, then the result.
// A string parameter keeps its JSON form; its \n breaks the line. A line over `cut` chars keeps its start and its end, with "…" between.
function terminalForm(tool, input, result, { cut = 100, lines = Infinity } = {}) {
  const call = `⏺ context-mode - ${tool} (MCP)(${Object.entries(input).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")})`.split("\\n");
  const out = result.split("\n");
  const rows = [...call.map((l, i) => (i ? "  " : "") + l), ...out.slice(0, lines).map((l, i) => (i ? "     " : "  ⎿  ") + l)];
  if (out.length > lines) rows.push(`     … +${out.length - lines} lines (ctrl+o to expand)`);
  return rows.map((l) => (l.length > cut ? l.slice(0, cut - 40) + "…" + l.slice(-39) : l)).join("\n");
}
// The text fences of a Markdown part, with the list-item indent taken off.
function textFences(md) {
  const all = [];
  let cur = null;
  let pad = "";
  for (const line of md.split("\n")) {
    if (cur === null && line.trimStart() === "```text") { cur = []; pad = line.slice(0, line.indexOf("```")); continue; }
    if (cur !== null && line === pad + "```") { all.push(cur.join("\n")); cur = null; continue; }
    if (cur !== null) cur.push(line.startsWith(pad) ? line.slice(pad.length) : line);
  }
  return all;
}
// The two real calls: ctx_execute from the Try-it stream (04-api-json) and ctx_batch from its live MCP run.
function realCalls() {
  const ev = JSON.parse(readRoot("bench/evidence/try-it-2026-11-02/04-api-json.json"));
  const use = ev.stream.flatMap((e) => (e.type === "assistant" ? e.message.content : [])).find((c) => c.type === "tool_use");
  const res = ev.stream.flatMap((e) => (e.type === "user" ? e.message.content : [])).find((c) => c.tool_use_id === use.id);
  const text = res.content.map((c) => c.text).join("");
  const agent = readRoot("bench/evidence/try-it-2026-11-02/README.md").match(/Claude Code (\d+\.\d+\.\d+)/)[1];
  const b = JSON.parse(readRoot("bench/evidence/thinking-in-code/2026-11-03-ctx-batch.json"));
  const produced = b.files.reduce((n, f) => n + statSync(path.join(ROOT, f)).size, 0);
  return {
    exec: { tool: use.name.split("__").pop(), form: terminalForm("ctx_execute", use.input, text), read: ev.summary.raw_bytes, returned: Buffer.byteLength(text), agent, version: ev.summary.version },
    batch: { ev: b, form: terminalForm("ctx_batch", b.input, b.result, { lines: b.shown_lines }), produced, returned: Buffer.byteLength(b.result) },
  };
}

describe("ADR-0013 / ADR-0014 / ADR-0015 repo hygiene", { concurrency: CONC }, () => {
describe("ADR-0015 repo: removed-file gate (allow-list)", () => {
  // build/check-removed.mjs — GS5 repo-cleanup gate (impl/15 §2, TECH-SPEC §1 GS5 + §3.10,
  // DEVIATIONS D-M7-arch-4, D-M7-CLN-W3c). Each case runs the real script in a throwaway git repo.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const SCRIPT = path.join(REPO, "build", "check-removed.mjs");
  const SOURCE = readFileSync(SCRIPT, "utf8");

  // files: { path: content }. tracked: paths to `git add` (default: all).
  function fixture(files, untracked = []) {
    const dir = mkdtempSync(path.join(tmpdir(), "check-removed-"));
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      writeFileSync(path.join(dir, p), body);
    }
    execFileSync("git", ["init", "-q"], { cwd: dir });
    const add = Object.keys(files).filter((p) => !untracked.includes(p));
    if (add.length) execFileSync("git", ["add", "-f", "--", ...add], { cwd: dir });
    return dir;
  }

  function run(dir) {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    rmSync(dir, { recursive: true, force: true });
    return { status: r.status, lines: r.stdout.split("\n").filter((l) => l !== "") };
  }

  const ALLOWED = {
    "skills/ctx-stats/SKILL.md": "x",
    "skills/ctx-doctor/SKILL.md": "x",
    "skills/ctx-upgrade/SKILL.md": "x",
    ".claude/skills/release/SKILL.md": "x",
    "src/core/a.ts": "export const a = 1;\n",
    "package.json": JSON.stringify({ name: "context-mode" }),
  };

  test("clean tree: prints 'check-removed: clean', exit 0", () => {
    const r = run(fixture(ALLOWED));
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, ["check-removed: clean"]);
  });

  test("every kind of hit: one line per path, all reported, exit 1", () => {
    const r = run(fixture({
      ...ALLOWED,
      "web/index.html": "x",
      "bun.lock": "x",
      ".mcp.json.codex.example": "{}",
      "configs/claude-code/hooks.json": "{}",
      "configs/kiro/extra.toml": "x",
      "configs/zed/notes.txt": "x",
      "src/adapters/zed/extra.ts": "x",
      "skills/ctx-search/SKILL.md": "x",
      "configs/kiro/AGENTS.md": "x",
      "CLAUDE.md": "x",
      ".github/copilot-instructions.md": "x",
      "src/other.ts": "const t = 'ctx_batch_execute';\n",
      "build/x.mjs": "// ctx_fetch_and_index\n",
      "openclaw.plugin.json": "{}",
      "package.json": JSON.stringify({ name: "context-mode", openclaw: {} }),
    }));
    assert.equal(r.status, 1);
    const got = r.lines.map((l) => l.slice("check-removed: still present: ".length)).sort();
    assert.ok(r.lines.every((l) => l.startsWith("check-removed: still present: ")));
    assert.deepEqual(got, [
      ".github/copilot-instructions.md",
      ".mcp.json.codex.example",
      "CLAUDE.md",
      "build/x.mjs",
      "bun.lock",
      "configs/claude-code/hooks.json",
      "configs/kiro/extra.toml",
      "configs/kiro/AGENTS.md",
      "configs/zed/notes.txt",
      "openclaw.plugin.json",
      "package.json#openclaw",
      "skills/ctx-search/SKILL.md",
      "src/adapters/zed/extra.ts",
      "src/other.ts",
      "web/index.html",
    ].sort());
  });

  test("retired-name scan: src/, build/ and top-level non-Markdown only (D-M7-arch-4)", () => {
    const r = run(fixture({
      ...ALLOWED,
      "README.md": "ctx_fetch_and_index was renamed\n",
      "docs/architecture/x.md": "ctx_batch_execute\n",
      "e2e/x.mjs": "ctx_batch_execute\n",
      "top.mjs": "ctx_batch_execute\n",
    }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines, ["check-removed: still present: top.mjs"]);
  });

  test("reads the tracked tree only: untracked files are not reported (D-M7-arch-4)", () => {
    const r = run(fixture({ ...ALLOWED, "build/cli.js": "ctx_batch_execute\n", "web/a.html": "x" }, ["build/cli.js", "web/a.html"]));
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, ["check-removed: clean"]);
  });

  const OUT = "check-removed: outside target tree: ";

  // Every file class the allow-list names (cleanup-plan W3-check-removed): the full target tree passes.
  const TARGET_TREE = {
    ...ALLOWED,
    "src/core/contracts/a.ts": "x", "src/prompt/instructions.md": "x", "src/entries/run.ts": "x",
    "src/adapters/table.ts": "x", "src/adapters/claude-code.ts": "x", "src/adapters/codex.ts": "x",
    "src/adapters/gemini.ts": "x", "src/adapters/qwen.ts": "x", "src/adapters/copilot-cli.ts": "x",
    "src/adapters/vscode.ts": "x", "src/adapters/kiro.ts": "x", "src/adapters/zcode.ts": "x",
    "src/adapters/pi.ts": "x", "src/adapters/opencode.ts": "x",
    "tests/0001-a.test.mjs": "x", "tests/_lib/a.mjs": "x", "e2e/cases/a.mjs": "x", "build/build.mjs": "x", "bench/a.mjs": "x",
    "docs/architecture/TECH-SPEC.md": "x", "docs/install/README.md": "x", "docs/tools.md": "x", "docs/UPSTREAM-CREDITS.md": "x",
    "scripts/gate.mjs": "x", "scripts/ci-gs4-lint.mjs": "x", "scripts/record-fixtures.mjs": "x", "scripts/release/plan.mjs": "x",
    ".github/workflows/ci.yml": "x",
    ".claude/settings.json": "{}", ".claude-plugin/plugin.json": "{}", ".codex-plugin/mcp.json": "{}",
    ".agents/plugins/marketplace.json": "{}",
    "README.md": "x", "CONTRIBUTING.md": "x", "LICENSE": "x", "tsconfig.json": "{}", ".gitignore": "x", ".gitattributes": "x",
  };

  test("allow-list: the whole target tree passes (every allowed class)", () => {
    const r = run(fixture(TARGET_TREE));
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, ["check-removed: clean"]);
  });

  test("allow-list: a stray v1 path outside the target tree fails, one line per path", () => {
    const r = run(fixture({
      ...TARGET_TREE,
      "hooks/pretooluse.mjs": "x",
      "src/store.ts": "x",
      "src/adapters/base.ts": "x",
      "src/adapters/claude-code/index.ts": "x",
      "tests/adapters/a.test.ts": "x",
      "scripts/heal-installed-plugins.mjs": "x",
      "docs/platform-support.md": "x",
      "stray.txt": "x",
    }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines.slice().sort(), [
      "docs/platform-support.md", "hooks/pretooluse.mjs", "scripts/heal-installed-plugins.mjs", "src/adapters/base.ts",
      "src/adapters/claude-code/index.ts", "src/store.ts", "stray.txt", "tests/adapters/a.test.ts",
    ].map((p) => OUT + p));
  });

  test("allow-list: near-miss prefixes are not allowed (src/core-v1/, testsx/, scripts/gate.mjs.bak)", () => {
    const r = run(fixture({ ...ALLOWED, "src/core-v1/a.ts": "x", "testsx/a.mjs": "x", "scripts/gate.mjs.bak": "x" }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines.slice().sort(), ["scripts/gate.mjs.bak", "src/core-v1/a.ts", "testsx/a.mjs"].map((p) => OUT + p));
  });

  test("allow-list: a path on the removed list prints one 'still present' line, not a second 'outside' line", () => {
    const r = run(fixture({ ...ALLOWED, "web/a.html": "x", "src/cli.ts": "x" }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines.slice().sort(), ["check-removed: still present: src/cli.ts", "check-removed: still present: web/a.html"]);
  });

  test("allow-list: untracked stray files are not reported (tracked tree only)", () => {
    const r = run(fixture({ ...ALLOWED, "hooks/a.mjs": "x" }, ["hooks/a.mjs"]));
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, ["check-removed: clean"]);
  });

  test("HELD_FOR_OWNER: the four open-decision v1 tests are skipped (cleanup-plan §3, D-M7-CLN-2)", () => {
    const held = {
      "tests/hooks/platform-bridge-wire.test.ts": "x",
      "tests/hooks/stdin-idle-timeout.test.ts": "x",
      "tests/integration/commit-message-symmetry.test.ts": "x",
      "tests/integration/seed-parity-coverage.test.ts": "x",
    };
    assert.deepEqual(run(fixture({ ...ALLOWED, ...held })).lines, ["check-removed: clean"]);
    const r = run(fixture({ ...ALLOWED, ...held, "tests/hooks/other.test.ts": "x" }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines, [OUT + "tests/hooks/other.test.ts"]);
  });

  test("no KEPT_FOR_KEEP_PASS list remains: the KEEP-PASS layer is gone (D-M7-CLN-5)", () => {
    assert.ok(!SOURCE.includes("KEPT_FOR_KEEP_PASS"));
    const r = run(fixture({ ...ALLOWED, "vitest.config.ts": "x", "src/cli.ts": "ctx_fetch_and_index\n", "configs/codex/hooks.json": "{}" }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines.slice().sort(), ["check-removed: still present: configs/codex/hooks.json", "check-removed: still present: src/cli.ts", "check-removed: still present: vitest.config.ts"]);
  });

  test("no regex in the script: literal compares only (impl/15 §2.3 step 2, 4)", () => {
    for (const s of ["RegExp", ".match(", ".matchAll(", ".test(", ".search(", ".replace("]) {
      assert.ok(!SOURCE.includes(s), `script uses ${s}`);
    }
    assert.ok(SOURCE.includes('"ls-files", "-z"'), "tracked tree via git ls-files -z");
  });

  test("badge data: stats.json passes the target tree; readme-stats.yml replaces update-stats.yml (D-README-STATS-1)", () => {
    const ok = run(fixture({ ...ALLOWED, "stats.json": "{}", ".github/workflows/readme-stats.yml": "x" }));
    assert.equal(ok.status, 0, ok.lines.join("\n"));
    assert.deepEqual(ok.lines, ["check-removed: clean"]);
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") + path.sep;
    assert.ok(!existsSync(root + ".github/workflows/update-stats.yml"), "update-stats.yml wrote a users label from clone counts; it is gone");
    const j = JSON.parse(readFileSync(root + "stats.json", "utf8"));
    assert.deepEqual(Object.keys(j).sort(), ["npm_downloads", "read_at", "stars"], "stats.json: only fields named by what they count");
    assert.equal(typeof j.npm_downloads, "number");
    assert.equal(typeof j.stars, "number");
    assert.equal(typeof j.read_at, "string");
  });

  test("allow-list: bench/evidence/ passes, a stray root file still fails (D-FU-RF-BENCH-1)", () => {
    const ok = run(fixture({ ...ALLOWED, "bench/evidence/README.md": "x", "bench/evidence/data/a.json": "{}" }));
    assert.equal(ok.status, 0);
    assert.deepEqual(ok.lines, ["check-removed: clean"]);
    const bad = run(fixture({ ...ALLOWED, "bench/evidence/README.md": "x", "stray.txt": "x" }));
    assert.equal(bad.status, 1);
    assert.deepEqual(bad.lines, [OUT + "stray.txt"]);
    const sibling = run(fixture({ ...ALLOWED, "docs/architecture-old/a.md": "x" }));
    assert.equal(sibling.status, 1);
  });

  test("allow-list: ADR-0019 src/cli/ and src/setup/ pass; src/cli.ts stays removed (D-CR-0019-1)", () => {
    const ok = run(fixture({ ...ALLOWED, "src/cli/args.ts": "x", "src/setup/engine.ts": "x" }));
    assert.equal(ok.status, 0);
    assert.deepEqual(ok.lines, ["check-removed: clean"]);
    const bad = run(fixture({ ...ALLOWED, "src/cli/args.ts": "x", "src/cli.ts": "x", "src/setupx/a.ts": "x" }));
    assert.equal(bad.status, 1);
    assert.deepEqual(bad.lines.slice().sort(), ["check-removed: outside target tree: src/setupx/a.ts", "check-removed: still present: src/cli.ts"]);
  });

  test("bench fixture data holds no file named SKILL.md (GS5, D-CR-0019-1)", () => {
    const r = run(fixture({ ...ALLOWED, "bench/fixtures/data/skills/SKILL.md": "x" }));
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines, ["check-removed: still present: bench/fixtures/data/skills/SKILL.md"]);
  });

  test("allow-list: scripts/ci-install.mjs passes; scripts/v1-cases/ and near-miss names fail (D-CR-SCRIPTS-1, D-REPO-CLEAN-1)", () => {
    const ok = run(fixture({ ...ALLOWED, "scripts/ci-install.mjs": "x" }));
    assert.equal(ok.status, 0);
    assert.deepEqual(ok.lines, ["check-removed: clean"]);
    const bad = run(fixture({ ...ALLOWED, "scripts/ci-install.mjs.bak": "x", "scripts/v1-cases/convert.mjs": "x", "scripts/v1-cases-x/a.mjs": "x", "scripts/v1-case/a.mjs": "x" }));
    assert.equal(bad.status, 1);
    assert.deepEqual(bad.lines.slice().sort(), [
      ...["scripts/ci-install.mjs.bak", "scripts/v1-case/a.mjs", "scripts/v1-cases-x/a.mjs"].map((p) => OUT + p),
      "check-removed: still present: scripts/v1-cases/convert.mjs",
    ].sort());
  });

  // D-CR-SCRIPTS-1 follow-up: the live gate caught scripts/ci-install.mjs because no unit test ran the script on the
  // real tracked tree. A new tracked file outside the target tree now fails here, in `node --test tests/`.
  test("the real tracked tree is clean: a new tracked file outside the target tree fails fast", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout);
    assert.deepEqual(r.stdout.split("\n").filter((l) => l !== ""), ["check-removed: clean"]);
  });
});

describe("ADR-0015 repo: secrets gate", () => {
  // build/check-secrets.mjs: no gateway tenant id (t_ + 8 hex) in a tracked text file (D-FU-OI-TENANT-1).
  // Each case runs the real script in a throwaway git repo. The ids below are built from parts, so this file holds none.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const SCRIPT = path.join(REPO, "build", "check-secrets.mjs");
  const ID = "t" + "_" + "0123abcd";

  function run(files, untracked = []) {
    const dir = mkdtempSync(path.join(tmpdir(), "check-secrets-"));
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      writeFileSync(path.join(dir, p), body);
    }
    execFileSync("git", ["init", "-q"], { cwd: dir });
    const add = Object.keys(files).filter((p) => !untracked.includes(p));
    if (add.length) execFileSync("git", ["add", "-f", "--", ...add], { cwd: dir });
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    rmSync(dir, { recursive: true, force: true });
    return { status: r.status, lines: r.stdout.split("\n").filter((l) => l !== "") };
  }

  test("clean tree: prints 'check-secrets: clean', exit 0", () => {
    const r = run({ "a.md": "nothing here\n", "b.mjs": "const x = 1;\n" });
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, ["check-secrets: clean"]);
  });

  test("a tenant id in a tracked file fails with path and line, never the id", () => {
    const r = run({ "docs/x.md": `ok\nowner is ${ID} here\n`, ".github/workflows/w.yml": `rule: "${ID}"\n` });
    assert.equal(r.status, 1);
    assert.deepEqual(r.lines.sort(), [
      "check-secrets: tenant id pattern in .github/workflows/w.yml:1",
      "check-secrets: tenant id pattern in docs/x.md:2",
    ]);
    assert.ok(!r.lines.join("\n").includes(ID));
  });

  test("longer words and other prefixes are not tenant ids", () => {
    const r = run({ "a.txt": ["get_0123abcd", "t_0123abcdef", "t_0123abc", "t_0123abcg", "split_0123abcd"].join("\n") + "\n" });
    assert.equal(r.status, 0);
  });

  test("untracked files and binary files are skipped", () => {
    const r = run({ "n.md": `${ID}\n`, "bin.dat": `\0${ID}\n` }, ["n.md"]);
    assert.equal(r.status, 0);
  });
});

describe("ADR-0015 repo: no TRUNCATE and no lossy cut", () => {
  // Owner main rule (2026-10-28): TRUNCATE is forbidden in shipped code (D-NO-TRUNCATE-1).
  // Covers SQLite `wal_checkpoint(TRUNCATE)` and `TRUNCATE` SQL, and Node file truncation APIs.
  // Plain substring checks, no regex. Tests and e2e diagnostics may name the word; shipped code may not.

  const ROOTS = ["src", "build", "scripts"];
  const EXTS = [".ts", ".mjs", ".js", ".cjs"];
  const BANNED = ["(TRUNCATE)", "TRUNCATE TABLE", "truncateSync", "ftruncate", ".truncate("];

  function walk(dir, out) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules") continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (EXTS.some((e) => name.endsWith(e))) out.push(p);
    }
    return out;
  }

  test("no-truncate: shipped code never uses TRUNCATE (owner main rule, D-NO-TRUNCATE-1)", () => {
    const hits = [];
    for (const root of ROOTS) {
      for (const file of walk(root, [])) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          for (const b of BANNED) if (line.includes(b)) hits.push(`${file}:${i + 1}: ${b}`);
        });
      }
    }
    assert.deepEqual(hits, [], `TRUNCATE is forbidden:\n${hits.join("\n")}`);
  });

  // D-NO-LOSSY-CUT-1: shipped code may not say "truncat" in a string (comments are free).
  test("no-lossy-cut: no user-facing 'truncat' word in shipped code", () => {
    const hits = [];
    for (const root of ROOTS) {
      for (const file of walk(root, [])) {
        readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          const at = line.toLowerCase().indexOf("truncat");
          if (at < 0) return;
          const comment = line.indexOf("//");
          if (comment >= 0 && comment < at) return;
          if (line.trimStart().startsWith("*")) return;
          hits.push(`${file}:${i + 1}`);
        });
      }
    }
    assert.deepEqual(hits, [], `user-facing text must not say truncat:\n${hits.join("\n")}`);
  });

  // Every capBytes call site is listed as lossless in docs/architecture/NO-LOSSY-CUT.md (same file, same count).
  test("no-lossy-cut: every capBytes call site is a lossless row in NO-LOSSY-CUT.md", () => {
    const table = readFileSync("docs/architecture/NO-LOSSY-CUT.md", "utf8").split("\n").filter((l) => l.startsWith("|"));
    const calls = new Map();
    for (const root of ROOTS) {
      for (const file of walk(root, [])) {
        if (file.endsWith(path.join("sandbox", "cap.ts"))) continue;
        const n = readFileSync(file, "utf8").split("\n").filter((l) => l.includes("capBytes(") && !l.trimStart().startsWith("//")).length;
        if (n > 0) calls.set(file.split(path.sep).join("/"), n);
      }
    }
    assert.ok(calls.size > 0);
    for (const [file, n] of calls) {
      const rows = table.filter((l) => l.includes("| " + file + ":") && l.includes("capBytes") && l.includes("| lossless |"));
      assert.equal(rows.length, n, `${file}: ${n} capBytes call(s), ${rows.length} lossless row(s) in NO-LOSSY-CUT.md`);
    }
  });
});

describe("ADR-0015 repo: child processes hide the Windows console", () => {
  // GEM-WIN-8 (D-WIN-HIDE-1): on Windows a child process of a console program opens its own console window unless
  // the spawn options carry windowsHide: true. Setup, doctor and the hook sampler spawn up to HOOK_SAMPLES children,
  // so a missing flag shows as flashing windows. This guard reads every .ts file under src with the TypeScript parser
  // (not text matching) and fails on any child_process call whose options object lacks `windowsHide: true`.
  // It runs on every OS: the property is in the source, not in the platform branch.

  const SRC = fileURLToPath(new URL("../src/", import.meta.url));
  const SPAWNERS = new Set(["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"]);

  function tsFiles(dir) {
    return readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? tsFiles(f) : f.endsWith(".ts") ? [f] : [];
    });
  }

  function calleeName(expr) {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
    return undefined;
  }

  function importsChildProcess(sf) {
    let found = false;
    const visit = (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && /^(node:)?child_process$/.test(n.moduleSpecifier.text)) found = true;
      if (ts.isStringLiteral(n) && /^(node:)?child_process$/.test(n.text)) found = true; // getBuiltinModule("node:child_process")
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
  }

  function hidesWindow(call) {
    return call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) =>
      ts.isPropertyAssignment(p) && p.name.getText() === "windowsHide" && p.initializer.kind === ts.SyntaxKind.TrueKeyword));
  }

  test("[WIN] D-WIN-HIDE-1: every child_process call under src sets windowsHide: true", () => {
    const missing = [];
    let calls = 0;
    for (const file of tsFiles(SRC)) {
      const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      if (!importsChildProcess(sf)) continue;
      const visit = (n) => {
        if (ts.isCallExpression(n) && SPAWNERS.has(calleeName(n.expression) ?? "")) {
          calls++;
          if (!hidesWindow(n)) missing.push(`${path.relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    assert.ok(calls >= 10, `the scan must see the known spawn calls, saw ${calls}`);
    assert.deepEqual(missing, [], `child_process calls without windowsHide: true: ${missing.join(", ")}`);
  });

  test("[WIN] D-WIN-HIDE-1: the scan catches a call without the flag (self-check)", () => {
    const sf = ts.createSourceFile("x.ts", 'import { spawnSync } from "node:child_process"; spawnSync("a", [], { env }); spawnSync("b", [], { windowsHide: true });', ts.ScriptTarget.Latest, true);
    const verdicts = [];
    const visit = (n) => { if (ts.isCallExpression(n) && SPAWNERS.has(calleeName(n.expression) ?? "")) verdicts.push(hidesWindow(n)); ts.forEachChild(n, visit); };
    visit(sf);
    assert.deepEqual(verdicts, [false, true]);
  });
});

describe("ADR-0013 repo: CI install retry", () => {
  // D-CI-INSTALL-1: the CI dev install retries a silent npm failure, proves every declared package is on disk,
  // and the repo-check steps do not run (and blame a missing package) after a failed install.

  const root = fileURLToPath(new URL("../", import.meta.url));

  function project(deps, present) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-ci-install-"));
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ devDependencies: deps }));
    for (const n of present) {
      mkdirSync(path.join(dir, "node_modules", n), { recursive: true });
      writeFileSync(path.join(dir, "node_modules", n, "package.json"), "{}");
    }
    return dir;
  }

  test("missingPackages names every declared package that is not on disk", () => {
    const dir = project({ esbuild: "0.24.0", "toml-eslint-parser": "1.0.3", "@clack/prompts": "^1" }, ["esbuild"]);
    assert.deepEqual(missingPackages(dir), ["@clack/prompts", "toml-eslint-parser"]);
  });

  test("a silent exit 1 is retried and the second try passes", async () => {
    const dir = project({ esbuild: "1" }, []);
    let calls = 0;
    const run = () => {
      calls++;
      if (calls === 2) project2(dir);
      return calls === 1 ? 1 : 0;
    };
    const r = await installWithRetry({ root: dir, run, attempts: 3, sleep: async () => {}, log: () => {} });
    assert.equal(r.ok, true);
    assert.equal(calls, 2);
  });

  function project2(dir) {
    mkdirSync(path.join(dir, "node_modules", "esbuild"), { recursive: true });
    writeFileSync(path.join(dir, "node_modules", "esbuild", "package.json"), "{}");
  }

  test("exit 0 with a package missing is a failure, not a pass", async () => {
    const dir = project({ esbuild: "1", "toml-eslint-parser": "1" }, ["esbuild"]);
    const lines = [];
    const r = await installWithRetry({ root: dir, run: () => 0, attempts: 2, sleep: async () => {}, log: (l) => lines.push(l) });
    assert.equal(r.ok, false);
    assert.ok(lines.join("\n").includes("toml-eslint-parser"), lines.join("\n"));
  });

  test("ci.yml: every dev install goes through scripts/ci-install.mjs, none calls npm install directly", () => {
    const y = readFileSync(root + ".github/workflows/ci.yml", "utf8");
    assert.ok(!/- run: npm install/.test(y));
    assert.equal(y.split("- run: node scripts/ci-install.mjs").length - 1, 3);
  });

  test("ci.yml: repo checks after a failed install are skipped, so the install error is the only red step", () => {
    const y = readFileSync(root + ".github/workflows/ci.yml", "utf8");
    assert.ok(y.includes("id: install"));
    for (const s of ["check-readme", "check-install-docs", "check-secrets", "check-prompt-static", "check-removed", "ci-gs4-lint"]) {
      const i = y.indexOf("- run: node " + (s === "ci-gs4-lint" ? "scripts/" : "build/") + s + ".mjs");
      assert.ok(i > 0, s);
      const end = y.indexOf("\n      - ", i + 1);
      const block = y.slice(i, end < 0 ? undefined : end);
      assert.ok(block.includes("steps.install.outcome == 'success'"), s);
    }
  });
});

describe("ADR-0013 repo: scheduled workflows", () => {
  // Repo-shape test for the scheduled workflows (impl/13 §14, D-M6-arch-1, D-M6-arch-7).

  const root = fileURLToPath(new URL("../", import.meta.url));
  const read = (p) => readFileSync(root + p, "utf8");
  const lines = (s) => s.split("\n").map((l) => l.trim());

  test("weekly.yml: schedule, dispatch, one job", () => {
    const y = read(".github/workflows/weekly.yml");
    const l = lines(y);
    assert.ok(l.includes("name: weekly"));
    assert.ok(l.includes('schedule: [{ cron: "0 4 * * 1" }]'));
    assert.ok(l.includes("workflow_dispatch: {}"));
    assert.ok(l.includes("weekly:"));
    assert.ok(l.includes("runs-on: ubuntu-latest"));
  });

  test("weekly.yml: smoke on release for both agents, in order", () => {
    const l = lines(read(".github/workflows/weekly.yml"));
    const a = l.indexOf("- run: node scripts/release/smoke.mjs --ref release --agent claude-code");
    const b = l.indexOf("- run: node scripts/release/smoke.mjs --ref release --agent codex");
    assert.ok(a > 0 && b > a);
  });

  test("weekly.yml: branch-protection drift check with GITHUB_TOKEN", () => {
    const l = lines(read(".github/workflows/weekly.yml"));
    // Block form: the impl/13 flow map `{ GH_TOKEN: ${{ ... }} }` is not valid YAML (D-M6-Y2-1).
    const env = l.indexOf("- env:");
    assert.ok(env > 0);
    assert.equal(l[env + 1], "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    assert.ok(l[env + 2].startsWith("run: node scripts/release/check-branch-protection.mjs"));
  });

  test("weekly.yml: npm audit omits dev deps at level high (D-M6-arch-1)", () => {
    const l = lines(read(".github/workflows/weekly.yml"));
    const setup = l.indexOf("- uses: actions/setup-node@v4");
    assert.ok(setup > 0);
    assert.equal(l[setup + 1], 'with: { node-version: "24.15.0" }');
    assert.ok(l.includes("- run: npm install && npm audit --omit=dev --audit-level=high"));
    assert.ok(!l.includes("- run: npm install && npm audit --audit-level=high"));
  });

  test("weekly.yml: no secrets other than GITHUB_TOKEN, no npx, no publish", () => {
    const y = read(".github/workflows/weekly.yml");
    assert.equal(y.split("secrets.").length - 1, 1);
    assert.ok(!y.includes("npx "));
    assert.ok(!y.includes("npm publish"));
  });

  test("ci.yml: push branches include v2-design and impl/**, no pull_request (ADR-0014 5)", () => {
    const y = read(".github/workflows/ci.yml");
    const l = lines(y);
    const b = l.find((x) => x.startsWith("branches: ["));
    assert.ok(b && b.includes("v2-design") && b.includes('"impl/**"'), b);
    assert.ok(!l.some((x) => x.startsWith("pull_request")));
  });

  test("ci.yml: windows-only T-F5 step runs the check (DECISIONS-r9 F5)", () => {
    const l = lines(read(".github/workflows/ci.yml"));
    const i = l.indexOf("- run: node e2e/checks/windows-grandchild-kill.mjs");
    assert.ok(i > 0);
    const step = l.slice(Math.max(0, i - 4), i + 4).join("\n");
    assert.ok(step.includes("if: runner.os == 'Windows'"), step);
    assert.ok(step.includes("T-F5"), step);
  });

  test("ci.yml: the OpenCode 2 native install check runs on every OS of the test job (D-OC2-NATIVE-CMD-1)", () => {
    const l = lines(read(".github/workflows/ci.yml"));
    const i = l.indexOf("- run: node e2e/checks/opencode2-native-install.mjs");
    assert.ok(i > 0, "step missing");
    assert.ok(!l.slice(i, i + 3).some((x) => x.startsWith("if:")), "no OS filter");
    assert.ok(l.indexOf("- run: echo \"CM_OPENCODE2_DIR=${{ runner.temp }}/opencode2\" >> \"$GITHUB_ENV\"") < i, "CM_OPENCODE2_DIR is set before the step");
  });

  // D-RN-GEM-1: v2.0.0-next.2 smoke hung on the gemini step until the 20-minute job timeout cancelled the job, so
  // continue-on-error never applied. The tier-2 gemini step has its own short timeout.
  test("release.yml: the tier-2 gemini smoke step has its own timeout under the job timeout (D-RN-GEM-1)", () => {
    const l = lines(read(".github/workflows/release.yml"));
    const g = l.indexOf("- run: node scripts/release/smoke.mjs --ref release-staging --agent gemini");
    assert.ok(g > 0);
    const step = [];
    for (let i = g + 1; i < l.length && !l[i].startsWith("- ") && !l[i].endsWith(":"); i++) step.push(l[i]);
    assert.ok(step.includes("timeout-minutes: 5"), step.join(" | "));
    assert.ok(step.some((x) => x.startsWith("continue-on-error: true")), step.join(" | "));
  });
});

describe("ADR-0013 repo: main-only release workflow", () => {
  // MAIN-ONLY (docs/architecture/release/MAIN-ONLY.md, DEVIATIONS D-MO-2): shape of the one-click release in release.yml.
  // A dispatch on `main` takes the main path (jobs main-*); every other start keeps the release-branch path until merge day.
  // Line-based, no regex.

  const root = fileURLToPath(new URL("../", import.meta.url));
  const TEXT = readFileSync(root + ".github/workflows/release.yml", "utf8");
  const LINES = TEXT.split("\n");

  function jobs() {
    const out = {};
    let cur = null;
    for (const x of LINES.slice(LINES.indexOf("jobs:") + 1)) {
      const head = x.startsWith("  ") && !x.startsWith("   ") && x.endsWith(":") && !x.trim().startsWith("#");
      if (head) { cur = x.trim().slice(0, -1); out[cur] = []; } else if (cur !== null) out[cur].push(x);
    }
    return out;
  }
  const J = jobs();
  const body = (name) => { assert.ok(J[name], "job " + name); return J[name].map((l) => l.trim()); };
  const needsOf = (name) => {
    const l = body(name).find((x) => x.startsWith("needs:"));
    return l === undefined ? [] : l.slice(6).split("[").join("").split("]").join("").split(",").map((s) => s.trim()).filter(Boolean);
  };
  const MAIN_JOBS = ["main-plan", "main-build", "main-smoke", "main-npm", "main-commit", "main-github-release", "main-rollback"];
  const inputBlock = (name) => {
    const i = LINES.indexOf("      " + name + ":");
    assert.ok(i > 0, "input " + name);
    const out = [];
    for (let k = i + 1; k < LINES.length && LINES[k].startsWith("        "); k++) out.push(LINES[k].trim());
    return out;
  };

  test("[MAIN-ONLY] release.yml dispatch: channel next|latest (default next) and confirm_latest; old inputs stay", () => {
    const c = inputBlock("channel");
    assert.ok(c.includes("type: choice"), c.join("|"));
    assert.ok(c.includes("options: [next, latest]"), c.join("|"));
    assert.ok(c.includes("default: next"), c.join("|"));
    assert.ok(c.includes("required: false"), "a click with no input must work");
    const f = inputBlock("confirm_latest");
    assert.ok(f.includes("type: string") && f.includes("required: false"), f.join("|"));
    for (const k of ["publish", "sha", "mode"]) inputBlock(k);
    assert.ok(LINES.includes("  push:") && LINES.includes('      - "v2.*"'), "tag push path stays until merge day");
  });

  test("[MAIN-ONLY] release.yml route: the main path only for a dispatch on refs/heads/main", () => {
    const b = body("route").join("\n");
    assert.ok(b.includes('[ "$REF" = "refs/heads/main" ]') && b.includes('[ "$EVENT" = "workflow_dispatch" ]'), b);
    assert.ok(b.includes("layout=main") && b.includes("layout=release"), b);
    assert.ok(body("route").includes("REF: ${{ github.ref }}") && body("route").includes("EVENT: ${{ github.event_name }}"));
  });

  test("[MAIN-ONLY] release.yml: the old path starts only on layout release; the main path only on layout main", () => {
    for (const j of ["plan", "rollback"]) {
      assert.ok(needsOf(j).includes("route"), j + " needs route");
      assert.ok(body(j).some((x) => x.startsWith("if:") && x.includes("needs.route.outputs.layout == 'release'")), j);
    }
    for (const j of MAIN_JOBS) {
      assert.ok(needsOf(j).includes("route"), j + " needs route");
      assert.ok(body(j).some((x) => x.startsWith("if:") && x.includes("needs.route.outputs.layout == 'main'")), j + " is gated on layout main");
    }
  });

  test("[MAIN-ONLY] release.yml main path: job order ci/route -> plan -> build -> smoke -> npm -> commit on main -> github release", () => {
    assert.deepEqual(MAIN_JOBS.filter((j) => J[j]), MAIN_JOBS);
    assert.ok(Object.keys(J).indexOf("main-plan") < Object.keys(J).indexOf("main-build"));
    const chain = { "main-plan": "ci", "main-build": "main-plan", "main-smoke": "main-build", "main-npm": "main-smoke", "main-commit": "main-npm", "main-github-release": "main-commit" };
    for (const [j, dep] of Object.entries(chain)) assert.ok(needsOf(j).includes(dep), j + " needs " + dep + ": " + needsOf(j));
    assert.ok(needsOf("main-rollback").includes("ci"));
  });

  test("[MAIN-ONLY] release.yml main path names no branch but main (no release, no release-staging, no reset)", () => {
    for (const j of MAIN_JOBS) {
      const b = body(j).join("\n");
      for (const bad of ["release-staging", "heads/release", "--ref release", "publish.mjs --stage", "publish.mjs --promote", "scripts/release/rollback.mjs", "--force", "reset --hard"]) {
        assert.ok(!b.includes(bad), j + " must not contain " + bad);
      }
    }
  });

  // Every ${{ }} value a shell reads goes through env: in a main job a line with ${{ is "key: ${{ ... }}" only.
  test("[MAIN-ONLY] release.yml main path: no ${{ }} inside a shell command", () => {
    for (const j of MAIN_JOBS) {
      for (const x of body(j)) {
        if (!x.includes("${{")) continue;
        const cut = x.indexOf(": ");
        assert.ok(cut > 0 && !x.slice(0, cut).includes(" ") && x.slice(cut + 2).startsWith("${{"), j + ": " + x);
      }
    }
  });

  test("[MAIN-ONLY] release.yml main-plan: the guard for latest is the explicit confirm input, passed through env", () => {
    const b = body("main-plan");
    assert.ok(b.includes("CHANNEL: ${{ inputs.channel }}") && b.includes("CONFIRM: ${{ inputs.confirm_latest }}"), b.join("|"));
    assert.ok(b.some((x) => x.startsWith("node scripts/release/plan.mjs --main --channel \"$CHANNEL\" --confirm \"$CONFIRM\"")), b.join("|"));
    assert.ok(b.some((x) => x.startsWith("ref: ${{ github.sha }}")), "plans on the dispatched main head");
  });

  test("[MAIN-ONLY] release.yml main-smoke: three OS, the exact release commit in a local repo, all four agents, tier 2 with own timeout", () => {
    const b = body("main-smoke");
    assert.ok(b.includes("os: [macos-latest, ubuntu-latest, windows-latest]"));
    const t = b.join("\n");
    assert.ok(t.includes("commit-main.mjs --pkg release-out --version \"$VERSION\" --remote \"$bare\""), t);
    for (const a of ["claude-code", "codex", "gemini", "qwen"]) assert.ok(t.includes("smoke.mjs --ref main --layout main --repo \"$bare\" --agent " + a), a);
    for (const a of ["gemini", "qwen"]) {
      const i = b.indexOf("- run: node scripts/release/smoke.mjs --ref main --layout main --repo \"$bare\" --agent " + a);
      assert.ok(i > 0);
      const step = b.slice(i + 1, i + 4);
      assert.ok(step.includes("timeout-minutes: 5") && step.some((x) => x.startsWith("continue-on-error: true")), a + " " + step.join("|"));
    }
  });

  test("[MAIN-ONLY] release.yml main-npm: npm-publish environment, provenance, dist-tag = channel, skip when the version exists", () => {
    const b = body("main-npm");
    const t = b.join("\n");
    assert.ok(b.includes("environment: npm-publish") && b.includes("id-token: write"));
    assert.ok(b.includes("NPM_TAG: ${{ inputs.channel }}"));
    assert.ok(t.includes('npm publish --provenance --access public --tag "$NPM_TAG"'), t);
    assert.ok(!t.includes("--tag next") && !t.includes("--tag latest"), "the tag is never a literal");
    assert.ok(t.includes("npm view") && t.includes("published=true"), "re-run after a failed later job skips a finished publish");
    assert.ok(t.includes("check-npm-tarball.mjs release-out"));
  });

  test("[MAIN-ONLY] release.yml main-commit and main-github-release: one push of main and tag, GitHub release only after it", () => {
    const c = body("main-commit");
    assert.ok(c.includes("contents: write"));
    assert.ok(c.some((x) => x.startsWith("run: node scripts/release/commit-main.mjs --pkg release-out --version \"$VERSION\"")), c.join("|"));
    assert.ok(c.some((x) => x.startsWith("ref: main")) , "commit job checks out main");
    const g = body("main-github-release");
    assert.ok(g.some((x) => x.startsWith("run: node scripts/release/publish.mjs --github-release --version \"$VERSION\" --notes \"$NOTES\"")), g.join("|"));
    assert.ok(g.includes("GH_TOKEN: ${{ github.token }}") && g.includes("contents: write"));
  });

  test("[MAIN-ONLY] release.yml main-rollback: a forward commit through commit-main, only for mode rollback", () => {
    const b = body("main-rollback");
    assert.ok(b.some((x) => x.startsWith("if:") && x.includes("inputs.mode == 'rollback'")), b.join("|"));
    assert.ok(b.some((x) => x.startsWith("run: node scripts/release/commit-main.mjs --rollback-to \"$SHA\"")), b.join("|"));
    assert.ok(b.includes("SHA: ${{ inputs.sha }}") && b.includes("contents: write"));
    for (const j of MAIN_JOBS.filter((x) => x !== "main-rollback")) assert.ok(body(j).some((x) => x.startsWith("if:") && x.includes("inputs.mode != 'rollback'")), j + " skips on rollback");
  });
});

describe("ADR-0013 repo: /release skill", () => {
  // The /release repo skill (impl/13 §13, A12, ADR-0013, DEVIATIONS D-M6-arch-4): the steps an agent
  // follows, in order, and the live-skip streak file it reads and writes.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const SKILL = readFileSync(path.join(REPO, ".claude", "skills", "release", "SKILL.md"), "utf8");
  const LINES = SKILL.split("\n");
  const END = LINES.indexOf("---", 1);
  const BODY = LINES.slice(END + 1).join("\n");
  const CONSTANTS = readFileSync(path.join(REPO, "src", "core", "contracts", "constants.ts"), "utf8");

  test("frontmatter: name release, description, disable-model-invocation true", () => {
    assert.equal(LINES[0], "---");
    assert.ok(END > 0, "frontmatter is closed");
    const keys = LINES.slice(1, END).map((l) => l.slice(0, l.indexOf(":")));
    assert.deepEqual(keys, ["name", "description", "disable-model-invocation"]);
    assert.equal(LINES[1], "name: release");
    assert.equal(LINES[3], "disable-model-invocation: true");
  });

  // §13 steps 1-8 in order: each command appears, and after the one before it.
  const ORDER = [
    "git branch --show-current",
    "git status --porcelain",
    "node e2e/cases/run.mjs",
    "npx vitest run",
    "node e2e/live/run.mjs --all",
    "e2e/live/skip-streak.json",
    "e2e/live/cases/v1-migration-",
    "node scripts/release/plan.mjs --dry-run",
    "gh workflow run release.yml",
    "-f sha=$(git rev-parse HEAD)",
    "gh run watch",
  ];
  test("body runs the §13 steps in order", () => {
    let at = -1;
    for (const s of ORDER) {
      const i = BODY.indexOf(s, at + 1);
      assert.ok(i > at, `"${s}" appears after the step before it`);
      at = i;
    }
  });

  test("step 1 needs branch v2 and a clean tree", () => {
    assert.ok(BODY.includes("`v2`"));
    assert.ok(BODY.includes("stop and report what is dirty"));
  });

  test("live-skip streak: limit names LIVE_SKIP_LIMIT with the constants.ts value", () => {
    const decl = CONSTANTS.split("\n").find((l) => l.startsWith("export const LIVE_SKIP_LIMIT = "));
    assert.ok(decl, "constants.ts declares LIVE_SKIP_LIMIT");
    const value = decl.slice("export const LIVE_SKIP_LIMIT = ".length, decl.indexOf(";"));
    assert.ok(BODY.includes(`\`LIVE_SKIP_LIMIT\` (${value})`), `body names LIVE_SKIP_LIMIT (${value})`);
    assert.ok(BODY.includes("`SKIPPED`"));
    assert.ok(BODY.includes("reset it to 0"));
    assert.ok(BODY.includes("add 1"));
  });

  test("skip-live: skips the live steps and passes --skip-live to plan.mjs", () => {
    assert.ok(BODY.includes("/release skip-live"));
    assert.ok(BODY.includes("node scripts/release/plan.mjs --dry-run --skip-live"));
    assert.ok(BODY.includes("Live E2E skipped for this release."));
  });

  test("starting the skill is the approval; one-time steps are never run", () => {
    assert.ok(BODY.includes("Starting the skill is the approval"));
    for (const s of ['ref: "release"', "adding workflows to `main`", "npm deprecate"]) assert.ok(BODY.includes(s), s);
  });

  test("e2e/live/skip-streak.json starts at streak 0", () => {
    const j = JSON.parse(readFileSync(path.join(REPO, "e2e", "live", "skip-streak.json"), "utf8"));
    assert.deepEqual(j, { streak: 0 });
  });
});

describe("ADR-0013 repo: live run paths", () => {
  // D-LEF-2: e2e/live/run.mjs ran on Windows CI and built "D:\D:\a\..." from new URL(import.meta.url).pathname
  // ("/D:/a/..."). Every e2e/live entry script takes its own directory from fileURLToPath(import.meta.url).

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const SRC = readFileSync(path.join(REPO, "e2e", "live", "run.mjs"), "utf8");

  test("e2e/live/run.mjs finds its root with fileURLToPath, not URL.pathname (Windows drive paths)", () => {
    assert.equal(SRC.includes("new URL(import.meta.url).pathname"), false, "URL.pathname gives /D:/a/... on Windows");
    assert.ok(SRC.includes("fileURLToPath(import.meta.url)"), "root comes from fileURLToPath(import.meta.url)");
  });
});

describe("ADR-0015 repo: command skills", () => {
  // The 3 user command skills (impl/13 §5, D-M6-arch-6): each skills/<name>/SKILL.md equals the
  // drafts.md block skill_<name> verbatim (frontmatter + body), plus one trailing newline.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const DRAFTS = readFileSync(path.join(REPO, "docs", "architecture", "prompt-drafts.md"), "utf8");
  const SKILLS = ["ctx-stats", "ctx-doctor", "ctx-upgrade"];
  const TOOL = { "ctx-stats": "ctx_stats", "ctx-doctor": "ctx_doctor", "ctx-upgrade": "ctx_upgrade" };

  function draft(id) {
    const open = `<!-- id: ${id} -->\n\`\`\`text\n`;
    const at = DRAFTS.indexOf(open);
    assert.notEqual(at, -1, `drafts.md has no block ${id}`);
    const start = at + open.length;
    return DRAFTS.slice(start, DRAFTS.indexOf("\n```", start));
  }

  for (const name of SKILLS) {
    test(`skills/${name}/SKILL.md equals drafts.md skill_${name} verbatim`, () => {
      const file = readFileSync(path.join(REPO, "skills", name, "SKILL.md"), "utf8");
      assert.equal(file, draft(`skill_${name}`) + "\n");
    });

    test(`skills/${name}/SKILL.md frontmatter: name, description, disable-model-invocation`, () => {
      const file = readFileSync(path.join(REPO, "skills", name, "SKILL.md"), "utf8");
      const lines = file.split("\n");
      assert.equal(lines[0], "---");
      const end = lines.indexOf("---", 1);
      assert.ok(end > 0, "frontmatter is closed");
      const keys = lines.slice(1, end).map((l) => l.slice(0, l.indexOf(":")));
      assert.deepEqual(keys, ["name", "description", "disable-model-invocation"]);
      assert.equal(lines[1], `name: ${name}`);
      assert.equal(lines[3], "disable-model-invocation: true");
      assert.ok(lines.slice(end + 1).join("\n").includes(`Call the ${TOOL[name]} tool`), "body names its tool");
    });
  }
});

describe("ADR-0015 repo: doc facts", () => {
  // DOCS-SYNC-2026-10-28: doc facts that can drift are read from the code, the package or the raw benchmark data.
  // No regex: plain string checks only.

  const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const json = (p) => JSON.parse(read(p));

  test("docs/tools.md names the doctor check range from DOCTOR_CHECK_ORDER", () => {
    const md = read("docs/tools.md");
    const first = DOCTOR_CHECK_ORDER[0];
    const last = DOCTOR_CHECK_ORDER[DOCTOR_CHECK_ORDER.length - 1];
    assert.ok(md.includes(`(${first}–${last},`), `tools.md must say ${first}–${last}`);
  });

  test("docs/tools.md opens ctx_execute and ctx_batch with Thinking in Code and the bench bytes of a real run (D-TIC-DOCS-1)", () => {
    // Owner 2026-11-03: "Tum web'de, readme'de docslarda her yerde Thinking in Code felsefesini ... gormek istiyorum".
    const md = read("docs/tools.md");
    const res = json("bench/results/2026-11-01-darwin-arm64.json").results;
    const row = (id) => res.find((r) => r.id === id);
    const B = (n) => `${n.toLocaleString("en-US")} B`;
    const exec = md.slice(md.indexOf("## ctx_execute"), md.indexOf("## ctx_batch"));
    const batch = md.slice(md.indexOf("## ctx_batch"));
    assert.ok(md.indexOf("## ctx_execute") > 0 && md.indexOf("## ctx_batch") > md.indexOf("## ctx_execute"));
    for (const [part, id] of [[exec, "a-git-log-stat-vite"], [batch, "c-install-log"]]) {
      assert.ok(part.split("\n").slice(0, 4).join("\n").includes("Thinking in Code"), `${id} section opens with the principle`);
      const m = row(id).metrics;
      assert.ok(part.includes(B(m.raw_bytes.median)) && part.includes(B(m.ctx_bytes.median)), `${id} bytes from the results JSON`);
      assert.ok(part.includes(`../bench/results/2026-11-01-darwin-arm64.json`) && part.includes("```"), `${id} links its row and shows the call`);
    }
    // D-TIC-README-2: each section shows the real call in its terminal form, not a bare script.
    const calls = realCalls();
    assert.deepEqual(textFences(exec), [calls.exec.form], "ctx_execute shows the real call as the terminal shows it");
    assert.deepEqual(textFences(batch), [calls.batch.form], "ctx_batch shows the real call as the terminal shows it");
    assert.ok(!md.includes("```js"), "docs/tools.md shows tool calls, not bare scripts");
    for (const n of [calls.exec.read, calls.exec.returned]) assert.ok(exec.includes(B(n)), `ctx_execute lacks ${B(n)}`);
    for (const n of [calls.batch.produced, calls.batch.returned]) assert.ok(batch.includes(B(n)), `ctx_batch lacks ${B(n)}`);
    assert.ok(exec.includes("https://contextmode.ai/docs/"), "the Gateway line links its own page");
    const how = read("docs/how-it-works.md");
    const during = how.slice(how.indexOf("2. **During the call**"), how.indexOf("3. **After the call**"));
    assert.ok(during.includes("Thinking in Code") && during.includes("tools.md#ctx_execute"), "docs/how-it-works.md names the sandbox step Thinking in Code");
  });

  test("docs/tools.md says where a doctor report over REPORT_CAP is stored (D-NO-LOSSY-CUT-1)", () => {
    const md = read("docs/tools.md");
    assert.ok(md.includes(REPORT_SOURCE_LABEL));
    assert.ok(md.includes(`${REPORT_CAP.toLocaleString("en-US")} B`));
  });

  test("the Node minimum in package.json engines is the one the README and install page state", () => {
    const min = json("package.json").engines.node.replace(">=", "");
    for (const f of ["README.md", "docs/install/README.md"]) assert.ok(read(f).includes(`Node ${min} or later`), f);
  });

  test("README and install page tell Windows users about Git for Windows (D-VT-WINBASH-1)", () => {
    for (const f of ["README.md", "docs/install/README.md"]) assert.ok(read(f).includes("Git for Windows"), f);
  });

  test("Gemini and Qwen pages say the update asks Y/n", () => {
    for (const f of ["docs/install/gemini.md", "docs/install/qwen.md"]) {
      assert.ok(read(f).includes(" extensions update` asks"), f);
      assert.ok(read(f).includes("[Y/n]"), f);
    }
  });

  test("bench/evidence/README.md try-it numbers equal try-it/ab.json", () => {
    const ab = json("bench/evidence/try-it/ab.json");
    const p = ab.pooled;
    const md = read("bench/evidence/README.md");
    const line = md.split("\n").find((l) => l.startsWith('The six "Try It" prompts'));
    assert.ok(line);
    assert.ok(line.includes(`v1 cost ${p.v1.pct}% more`));
    assert.ok(line.includes(`v2 cost ${p.v2.pct}% more`));
    assert.ok(line.includes(`gateway cost ${Math.abs(p.gateway.pct)}% less`));
    const ok = (s) => s.split("/")[0] + " of " + s.split("/")[1];
    assert.ok(line.includes(`Direct passed the task check in ${ok(p.plain_success)} sessions, v1 ${ok(p.v1.success)}, v2 ${ok(p.v2.success)} and the gateway ${ok(p.gateway.success)}`));
    const checks = ab.readme_claims.checks;
    const holds = checks.filter((c) => c.verdict === "HOLDS").length;
    assert.ok(line.includes(`Of ${checks.length} README numbers checked, ${holds} hold`));
  });

  test("MAIN-ONLY.md does not name a plugins/gemini folder: Gemini and Qwen point into plugins/claude-code (D-MO-1)", () => {
    const rows = read("docs/architecture/release/MAIN-ONLY.md").split("\n").filter((l) => l.startsWith("|"));
    assert.ok(rows.every((l) => !l.includes("plugins/gemini/")));
  });

  test("both DEVIATIONS files say which file holds which rows", () => {
    assert.ok(read("docs/architecture/DEVIATIONS.md").includes("docs/architecture/modules/DEVIATIONS.md"));
    assert.ok(read("docs/architecture/modules/DEVIATIONS.md").includes("docs/architecture/DEVIATIONS.md"));
  });
});

describe("ADR-0015 repo: README agent lines", () => {
  // README agent tables come from the adapter table (src/adapters/table.ts) and the setup registry
  // (src/setup/registry.ts). build/readme-agents.mjs renders them; build/check-readme.mjs fails when the README
  // copy differs (D-README-1).

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const README = readFileSync(path.join(REPO, "README.md"), "utf8");

  test("readme-agents: one row per adapter, sorted by name", () => {
    const rows = agentRows();
    assert.deepEqual(rows.map((r) => r.id).sort(), ADAPTERS.map((a) => a.id).sort());
    const names = rows.map((r) => r.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  test("readme-agents: every host row says it has hooks, from its hookChannel in table.ts", () => {
    const rows = agentRows();
    assert.equal(rows.length, 10);
    for (const r of rows) {
      const a = ADAPTERS.find((x) => x.id === r.id);
      assert.ok(a.hookChannel, `${r.id} has a hookChannel`);
      assert.ok(r.hooks.startsWith("yes"), `${r.id} hooks cell: ${r.hooks}`);
      assert.ok(r.hooks.includes(HOOK_WORDS[a.hookChannel.kind]), `${r.id} hooks cell names the ${a.hookChannel.kind} channel: ${r.hooks}`);
      assert.equal(r.skills, "yes", r.id);
      assert.ok(r.install.length > 0, r.id);
    }
  });

  test("readme-agents: D-README-INPROC-WORDS-1 user text says plugin inside the agent, never in-process", () => {
    const rows = Object.fromEntries(agentRows().map((r) => [r.id, r]));
    for (const id of ["pi", "opencode"]) {
      assert.ok(rows[id].hooks.includes("the plugin's own event handlers"), `${id} hooks cell: ${rows[id].hooks}`);
    }
    assert.equal(rows.pi.mcp, "ctx tools built into the plugin");
    assert.ok(!/in[- ]process/i.test(Object.values(HOOK_WORDS).join(" ")), "HOOK_WORDS has no in-process wording");
    for (const rel of ["README.md", "docs/install/README.md", "docs/how-it-works.md", "docs/install/pi.md", "docs/install/opencode.md"]) {
      const text = readFileSync(path.join(REPO, rel), "utf8");
      assert.ok(!/in[- ]process/i.test(text), `${rel} still says in-process / in process`);
    }
    assert.ok(README.includes("Hooks reach each agent in one of three ways"), "the README sentence stays");
    assert.ok(README.includes("plugin inside the agent (OpenCode, Pi)"), "the README sentence names the plugin inside the agent");
  });

  test("readme-agents: each install block ends with one generated line: Hooks ✓ · MCP ✓ · Skills ✓ with the host detail in plain words; the agent table is gone (D-README-AGENT-LINES-1, D-README-DWELL-1)", () => {
    // Owner 2026-11-02: "Supported agents bu table e gerek var mi burdaki bilgiler install adiminda da verebilirsin kisaca linkleri vs".
    const lines = renderAgentLines();
    assert.deepEqual(Object.keys(lines).sort(), ADAPTERS.map((a) => a.id).sort());
    for (const r of agentRows()) {
      const l = lines[r.id];
      assert.ok(l.startsWith(LINE_PREFIX + " ("), `${r.id}: ${l}`);
      for (const need of [" · MCP ✓", " · Skills ✓"]) assert.ok(l.includes(need), `${r.id} line lacks ${need}`);
      assert.ok(!l.includes("`"), `${r.id} line holds inline code: ${l}`);
      assert.ok(!l.includes("Guide:") && !l.includes("]("), `${r.id} line holds a link (D-README-LINKS-2): ${l}`);
    }
    assert.deepEqual(checkAgentLines(README), []);
    for (const bad of ["| Agent | Hooks |", "## Supported agents", "#supported-agents", "agents:install:start"]) assert.ok(!README.includes(bad), `README has ${bad}`);
    for (const text of [README, Object.values(lines).join("\n")]) {
      assert.ok(!text.includes("MCP only"), "the words MCP only are gone");
      assert.ok(!text.includes("| full |"), "no full label");
    }
    assert.ok(!readFileSync(path.join(REPO, "docs", "install", "README.md"), "utf8").includes("MCP only"));
    assert.ok(!readFileSync(path.join(REPO, "src", "cli", "commands.ts"), "utf8").includes("MCP only"));
    datedRow("D-README-AGENT-LINES-1", "Supported agents bu table e gerek var mi");
  });

  test("readme-agents: install cell is the page's native command, or npm + context-mode setup", () => {
    const by = Object.fromEntries(agentRows().map((r) => [r.id, r.install]));
    assert.ok(by["claude-code"].includes("claude plugin install"), by["claude-code"]);
    assert.ok(by.codex.includes("codex plugin add"), by.codex);
    assert.ok(by.gemini.includes("gemini extensions install"), by.gemini);
    assert.ok(by.pi.includes("pi install"), by.pi);
    for (const id of ["copilot-cli", "kiro", "vscode"]) assert.ok(by[id].includes("context-mode setup"), by[id]);
    assert.ok(by.zcode.includes("zcode plugins install"), by.zcode);
  });

  test("readme-agents: the install cell holds every command of the page's native fence, joined by <br> (D-README-INSTALL-CELL-1)", () => {
    // Owner main rule: "tum agentlerin kendi native install commandleri ne ise onlari kullanalim userler yabancilik cekmesin".
    // A reader who copies the cell runs the whole install: Claude Code and Codex need the marketplace step first.
    const by = Object.fromEntries(agentRows().map((r) => [r.id, r.install]));
    assert.equal(by["claude-code"], "`claude plugin marketplace add mksglu/context-mode`<br>`claude plugin install context-mode@context-mode`");
    assert.equal(by.codex, "`codex plugin marketplace add mksglu/context-mode`<br>`codex plugin add context-mode@context-mode`");
    assert.ok(!by.gemini.includes("<br>") && !by.pi.includes("<br>"), "one-command agents keep one command");
    const rows = readFileSync(path.join(REPO, "docs/architecture/DEVIATIONS.md"), "utf8").split("\n").filter((l) => l.startsWith("| D-README-INSTALL-CELL-1 |"));
    assert.equal(rows.length, 1, "DEVIATIONS has one D-README-INSTALL-CELL-1 row");
    assert.ok(rows[0].includes("tum agentlerin kendi native install commandleri"), "the row quotes the owner");
  });

  test("readme-agents: a hand edit, a missing block or a table back in the README fails the check; --write is stable", () => {
    const lines = renderAgentLines();
    const edited = README.replace(lines.codex, lines.codex.replace("Hooks ✓", "Hooks: no"));
    assert.notEqual(edited, README, "fixture edit did not apply");
    assert.ok(checkAgentLines(edited).some((p) => p.startsWith("codex:")), checkAgentLines(edited).join("\n"));
    const missing = README.replace('id="install-codex">', 'id="install-x">');
    assert.ok(checkAgentLines(missing).some((p) => p.startsWith("codex:")), checkAgentLines(missing).join("\n"));
    assert.ok(checkAgentLines(README + "\n| Agent | Hooks | MCP |\n").some((p) => p.includes("table")));
    assert.equal(writeAgentLines(README), README, "--write on a clean README changes nothing");
  });

  test("readme-agents: every install block starts closed: the agent's own install fence, then one fence of # update, # check, # remove, each line copied from its page (D-README-DWELL-1)", () => {
    // Owner 2026-11-03: "Tamami baslangicta acik gelmesin. Ana command i verdikten sonra yuklemek icin bakar misin inline code etiketleri ile alttaki paragraflar ne kadar kullanissiz".
    const blocks = renderAgentBlocks();
    for (const r of agentRows()) {
      const b = blocks[r.id];
      assert.ok(b.startsWith(`<details id="install-${r.id}"><summary>`), `${r.id} block starts closed: ${b.split("\n")[0]}`);
      assert.ok(README.includes(b), `${r.id}: README holds the rendered block`);
      const f = b.split("```sh\n").slice(1).map((s) => s.slice(0, s.indexOf("\n```")).split("\n"));
      assert.equal(f.length, 2, `${r.id}: two sh fences`);
      const second = f[1];
      const [u, c, rm] = ["# update", "# check", "# remove"].map((x) => second.indexOf(x));
      assert.ok(u === 0 && c > u + 1 && rm > c + 1 && rm < second.length - 1, `${r.id}: update, check and remove, each with a command: ${second.join(" / ")}`);
      const page = readFileSync(path.join(REPO, "docs", "install", `${r.id}.md`), "utf8");
      for (const cmd of [...f[0], ...second]) if (!cmd.startsWith("# ")) assert.ok(page.split("\n").includes(cmd), `${r.id}: "${cmd}" is not a line of its page`);
      if (!f[0][0].startsWith("npm ")) {
        // Live temp-HOME runs 2026-11-03: after the agent's own install, the context-mode command is absent from PATH.
        const checks = second.slice(c + 1, rm);
        assert.ok(checks.every((l) => !l.startsWith("context-mode ")), `${r.id}: the check uses the agent's own command: ${checks.join(" / ")}`);
      }
      assert.ok(!b.includes("Update: `") && !b.includes("Check: `"), `${r.id}: the inline-code paragraph is gone`);
    }
    const codex = blocks.codex.split("```sh\n")[1].split("\n```")[0].split("\n");
    assert.equal(codex[codex.length - 1], "context-mode setup --agents codex", "Codex: the trust step is the last line of the install fence");
    assert.ok(codex[codex.length - 3].startsWith("# "), "Codex: a short comment names the trust step (D-README-DWELL-2: the npm line sits before the setup line)");
    for (const line of README.split("\n")) assert.ok(!(line.startsWith("<details") && / open[ >]/.test(line)), `a README details block starts open: ${line.slice(0, 80)}`);
    const opened = README.replace('<details id="install-pi">', '<details open id="install-pi">');
    assert.notEqual(opened, README, "fixture edit did not apply");
    assert.ok(checkAgentLines(opened).some((p) => p.includes("starts open")), checkAgentLines(opened).join("\n"));
  });

  test("readme-agents: a picker line links every block in order; an agent's own install removes with its own command; Codex gets the context-mode command before its trust step (D-README-DWELL-2)", () => {
    // Owner 2026-11-03: "hedefin, bir user i bu sayfada 10 dakikadan fazla tutabilmek olsun"; main rule: each agent's own native command.
    const head = README.slice(README.indexOf("\n## Install\n"), README.indexOf('<details id="install-'));
    const pick = head.split("\n").find((l) => l.startsWith("Pick your agent: "));
    assert.ok(pick, "Install has a picker line");
    const anchors = pick.split("](#").slice(1).map((s) => s.slice(0, s.indexOf(")")));
    const order = README.split('<details id="').slice(1).map((s) => s.slice(0, s.indexOf('"'))).filter((s) => s.startsWith("install-"));
    assert.equal(order.length, ADAPTERS.length);
    assert.deepEqual(anchors, order, "the picker names each block once, in order");
    for (const r of agentRows()) {
      if (!r.cmds.own) continue;
      const bin = r.cmds.install[0].split(" ")[0];
      for (const l of r.cmds.remove) assert.ok(l.startsWith(bin + " "), `${r.id}: remove uses ${bin}: ${l}`);
    }
    assert.ok(renderAgentBlocks().pi.includes("\n# remove\npi remove npm:context-mode\n"), "Pi removes with pi remove");
    const codex = renderAgentBlocks().codex.split("```sh\n")[1].split("\n```")[0].split("\n");
    assert.deepEqual(codex.slice(-2), ["npm i -g context-mode", "context-mode setup --agents codex"], "Codex installs the context-mode command, then trusts the hooks");
  });
});

describe("ADR-0014 repo: issue forms", async () => {
  // Unit test for .github issue forms (13-build-release.md §6, ADR-0014 §5).
  // Runs the same line checks as the live case repo-github-files.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { check } = await import(pathToFileURL(path.join(REPO, "e2e", "checks", "repo-github-files.mjs")).href);

  test("issue forms, removed files and no pull_request trigger match 13-build-release §6", () => {
    const r = check();
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
  });

  test("e2e check mirror of AGENT_IDS matches src contract", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(path.join(REPO, "e2e", "checks", "repo-github-files.mjs"), "utf8");
    for (const id of AGENT_IDS) assert.ok(src.includes(`"${id}"`), id);
  });
});

// ADR-0024: every test file is listed in docs/architecture/TEST-LAYOUT.md. A fix puts its red test in the file of its area, never in a new file.
describe("ADR-0024 test layout: every test file is in the table", { concurrency: CONC }, () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const TABLE = readFileSync(path.join(ROOT, "docs", "architecture", "TEST-LAYOUT.md"), "utf8");

  function walk(dir, suffix, acc) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "fixtures") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, suffix, acc);
      else if (e.name.endsWith(suffix)) acc.push(path.relative(ROOT, p).split(path.sep).join("/"));
    }
    return acc;
  }

  function unlisted(files) {
    return files.filter((f) => !TABLE.includes("`" + f + "`"));
  }

  const hint = (f) => f.map((x) => x + ": add the test to the file that owns its ADR area (see docs/architecture/TEST-LAYOUT.md); a new area needs a table row and an ADR first").join("\n");

  test("every *.test.mjs under tests is listed in docs/architecture/TEST-LAYOUT.md", () => {
    const files = walk(path.join(ROOT, "tests"), ".test.mjs", []);
    assert.ok(files.length > 0);
    const bad = unlisted(files);
    assert.deepEqual(bad, [], hint(bad));
  });

  test("every case file under e2e/cases is listed in docs/architecture/TEST-LAYOUT.md", () => {
    const files = walk(path.join(ROOT, "e2e", "cases"), ".e2e.mjs", []);
    assert.ok(files.length > 0);
    const bad = unlisted(files);
    assert.deepEqual(bad, [], hint(bad));
  });

  test("the guard finds an unlisted file (self-check on a name that is not in the table)", () => {
    assert.deepEqual(unlisted(["tests/9999-not-an-area.test.mjs"]), ["tests/9999-not-an-area.test.mjs"]);
  });

  test("no tracked text file holds a merge conflict marker line (D-NO-CONFLICT-MARKER-1)", () => {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
    const exts = [".md", ".mjs", ".ts", ".json", ".yml", ".yaml"];
    const hits = [];
    for (const rel of out.split("\0")) {
      if (!exts.some((e) => rel.endsWith(e))) continue;
      let text;
      try { text = readFileSync(path.join(ROOT, rel), "utf8"); } catch { continue; }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("<<<<<<< ") || lines[i].startsWith(">>>>>>> ")) hits.push(rel + ":" + (i + 1));
      }
    }
    assert.deepEqual(hits, [], "merge conflict marker left in: " + hits.join(", "));
  });
});
});

describe("ADR-0015 / ADR-0024 repo: no dev folders, no v2 dir names (D-REPO-CLEAN-1)", () => {
  // The release tree holds no dev folders. Design citations to deleted files are permalinks pinned to a commit.
  // Literal string checks only (no regex as mechanism).
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean);
  const NAMES = ["tests/v2/", "docs/v2/", "tickets/", ".impl/"];
  // These may name the old paths: history rows, frozen data, the changelog, and the guards themselves.
  const EXEMPT = (f) => f === "docs/architecture/DEVIATIONS.md" || f === "docs/architecture/modules/DEVIATIONS.md" ||
    f.startsWith("bench/fixtures/data/") || f.startsWith("CHANGELOG") ||
    // generated case pages and their stored replies quote those fixture bytes word for word (D-BENCH-PAGES-1)
    /^bench\/[a-g]-[a-z-]+\/README\.md$/.test(f) || /^bench\/results\/[^/]+-replies\.json$/.test(f) ||
    f === "tests/0014-repo-hygiene.test.mjs" || f === "build/check-removed.mjs";
  const HEX = "0123456789abcdef";
  // True when the text just before position i ends with "/blob/<40 hex>/" or "/tree/<40 hex>/".
  function pinned(text, i) {
    const sha = text.slice(Math.max(0, i - 41), i - 1);
    if (text[i - 1] !== "/" || sha.length !== 40 || ![...sha].every((c) => HEX.includes(c))) return false;
    const kind = text.slice(Math.max(0, i - 47), i - 41);
    return kind === "/blob/" || kind === "/tree/";
  }
  function unpinned(text, name) {
    const out = [];
    for (let i = text.indexOf(name); i >= 0; i = text.indexOf(name, i + 1)) {
      // the name must start a path: the char before is not a letter, digit, "_", "-" or "."
      const p = i === 0 ? "" : text[i - 1];
      if (p !== "" && (p === "_" || p === "-" || p === "." || (p >= "a" && p <= "z") || (p >= "A" && p <= "Z") || (p >= "0" && p <= "9"))) continue;
      if (!pinned(text, i)) out.push(i);
    }
    return out;
  }

  test("no directory named v2 under tests/ or docs/", () => {
    const hits = tracked.filter((f) => (f.startsWith("tests/") || f.startsWith("docs/")) && f.split("/").includes("v2"));
    assert.deepEqual(hits, []);
  });

  test("tickets/, .impl/ and scripts/v1-cases/ hold no tracked file", () => {
    const hits = tracked.filter((f) => f.startsWith("tickets/") || f.startsWith(".impl/") || f.startsWith("scripts/v1-cases/"));
    assert.deepEqual(hits, []);
  });

  test("metrics/ does not exist (D-REPO-NO-METRICS-1)", () => {
    assert.deepEqual(tracked.filter((f) => f.startsWith("metrics/")), []);
    assert.equal(existsSync(path.join(ROOT, "metrics")), false);
  });

  test("no tracked file names tests/v2/, docs/v2/, tickets/ or .impl/ outside a SHA-pinned permalink", () => {
    const hits = [];
    for (const f of tracked) {
      if (EXEMPT(f)) continue;
      let text;
      try { text = readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
      if (text.includes("\0")) continue;
      for (const n of NAMES) if (unpinned(text, n).length) hits.push(f + " names " + n);
    }
    assert.deepEqual(hits, []);
  });

  test("pinned(): a permalink passes, a bare path and a short sha fail", () => {
    const sha = "274600e2ffab843e89c1dfa09b0d649e650c962f";
    const ok = "https://github.com/mksglu/context-mode/blob/" + sha + "/tickets/x.md";
    assert.equal(pinned(ok, ok.indexOf("tickets/")), true);
    const tree = "https://github.com/mksglu/context-mode/tree/" + sha + "/docs/v2/review";
    assert.equal(pinned(tree, tree.indexOf("docs/v2/")), true);
    assert.equal(pinned("see tickets/x.md", 4), false);
    const short = "https://github.com/mksglu/context-mode/blob/274600e2/tickets/x.md";
    assert.equal(pinned(short, short.indexOf("tickets/")), false);
    assert.deepEqual(unpinned("a tickets/x and my-tickets/y", "tickets/"), [2]);
  });
});

describe("ADR-0015 repo: README thesis, links and figures (D-README-THESIS-1)", () => {
  // Owner 2026-11-01: the README is written as a paper. Every relative link and image must exist, the figures stay
  // under 2 MB and out of the npm tarball, there is no CITATION.cff (D-README-NO-CITE-1), and runs that failed their own
  // pre-registered rule never appear as a number.
  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const readRepo = (rel) => readFileSync(path.join(REPO, rel), "utf8");

  test("CONTRIBUTING.md links and the issue bot's AGENT_ISSUE.md exist in the repo (D-AGENT-ISSUE-1)", async () => {
    const { missingTargets } = await import("../build/readme-links.mjs");
    assert.deepEqual(missingTargets(readRepo("CONTRIBUTING.md"), REPO), []);
    assert.ok(readRepo(".github/scripts/issue-intake-act.mjs").includes("/.github/AGENT_ISSUE.md"));
    assert.ok(readRepo(".github/AGENT_ISSUE.md").startsWith("# Filing a context-mode issue (for coding agents)"));
  });

  test("AGENT_ISSUE.md is a repro brief: facts with commands, clean-state repro, next check, redaction, template with the bot's headings (D-AGENT-ISSUE-2)", async () => {
    // Owner 2026-11-02: "repro stepleri onemli"; the brief answers "how would I reproduce and fix this if it came to me".
    const { ISSUE_FORM_HEADINGS: REQUIRED_HEADINGS, ISSUE_AGENT_RULES } = await import("../src/core/contracts/constants.ts");
    const text = readRepo(".github/AGENT_ISSUE.md");
    // D-INTAKE-SCORE-1: the brief, the agent-report form and the constant hold the same numbered rules, word for word.
    const form = readRepo(".github/ISSUE_TEMPLATE/agent-report.yml");
    ISSUE_AGENT_RULES.forEach((r, i) => {
      assert.ok(text.includes(`\n${i + 1}. ${r}\n`), "AGENT_ISSUE.md rule " + (i + 1));
      assert.ok(form.includes(`\n        ${i + 1}. ${r}\n`), "agent-report.yml rule " + (i + 1));
    });
    for (const fact of ["ctx_doctor", "ctx-report", "context-mode", "Node", "fresh project", "exact output", "expected", "source file", "one bug", "same problem", "secret"]) {
      assert.ok(ISSUE_AGENT_RULES.some((r) => r.includes(fact)), "rules must name: " + fact);
    }
    const mustHold = [
      "## 1. Collect these facts", "## 2. Reproduce from a clean state", "## 3. Check the newest next release",
      "## 4. Redact", "## 5. Fill in this template", "## 6. A filled example", "## Rules",
      "node --version", "uname -sm", "context-mode doctor", "ctx_doctor", "hook-errors.log", "sqlite3 -readonly",
      "events", "mktemp -d", "HOME=", "wc -c", "npm view context-mode dist-tags",
      "claude plugin marketplace add", "codex plugin add", "gemini extensions install", "pi install", "opencode plugin add",
      "Expected", "Actual", "Reproduced:", "gh issue create",
    ];
    for (const needle of mustHold) assert.ok(text.includes(needle), "AGENT_ISSUE.md must hold: " + needle);
    // The fill-in template carries every heading the intake check requires, in the check's order.
    const tpl = text.slice(text.indexOf("## 5. Fill in this template"));
    let at = -1;
    for (const h of REQUIRED_HEADINGS) {
      const i = tpl.indexOf("### " + h + "\n", at + 1);
      assert.ok(i > at, "template heading missing or out of order: ### " + h);
      at = i;
    }
    for (const field of ["context-mode version:", "Install route:", "Agent and version:", "OS and arch:", "Node version:", "Reproduced:"]) {
      assert.ok(tpl.includes(field), "template field missing: " + field);
    }
    // Positive wording (owner rule), no "v2" in prose, no banned product word: whole-word scan by character walk.
    const words = [];
    let w = "";
    for (const ch of text.toLowerCase()) {
      if ((ch >= "a" && ch <= "z") || ch === "'") w += ch;
      else { if (w) words.push(w); w = ""; }
    }
    if (w) words.push(w);
    for (const bad of ["not", "no", "never", "without", "cannot", "none", "nothing", "rtk"]) {
      assert.ok(!words.includes(bad), "AGENT_ISSUE.md must use positive wording, found: " + bad);
    }
    assert.ok(!words.some((x) => x.endsWith("n't")), "AGENT_ISSUE.md holds an n't word");
    assert.ok(!text.includes("v2"), 'AGENT_ISSUE.md must not say "v2"');
    assert.ok(!text.includes('{"report"'), "ctx_doctor takes no arguments (ctxDoctorSchema is empty and strict)");
  });

  test("readme-links: finds markdown targets and HTML src/srcset/href targets", async () => {
    const { readmeTargets, localPath, missingTargets } = await import("../build/readme-links.mjs");
    const text = '[a](docs/x.md#y) ![b](https://e.com/p.png)\n<img src="a/b.png" alt="b"> <source srcset="c.png" media="m"> <a href="#top">t</a>';
    assert.deepEqual(readmeTargets(text), ["docs/x.md#y", "https://e.com/p.png", "a/b.png", "c.png", "#top"]);
    assert.equal(localPath("./docs/x.md#y"), "docs/x.md");
    assert.equal(localPath('LICENSE "title"'), "LICENSE");
    const dir = mkdtempSync(path.join(tmpdir(), "readme-links-"));
    try {
      mkdirSync(path.join(dir, "a"));
      writeFileSync(path.join(dir, "a", "b.png"), "x");
      assert.deepEqual(missingTargets(text, dir), ["docs/x.md#y", "c.png"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("README: every relative link and image path exists", async () => {
    const { missingTargets } = await import("../build/readme-links.mjs");
    assert.deepEqual(missingTargets(readRepo("README.md"), REPO), []);
  });

  test("README figures: dark and light PNG per figure, used with <picture>, at most 2 MB in total", async () => {
    const { README_ASSET_DIR, README_IMAGES_MAX_BYTES, readmeImageBytes } = await import("../build/readme-links.mjs");
    const readme = readRepo("README.md");
    const pngs = readdirSync(path.join(REPO, README_ASSET_DIR)).filter((f) => f.endsWith(".png")).sort();
    assert.ok(pngs.length >= 2);
    for (const f of pngs.filter((p) => p.endsWith("-dark.png"))) {
      const light = f.replace("-dark.png", "-light.png");
      assert.ok(pngs.includes(light), `${f} has no light twin`);
      assert.ok(readme.includes(`srcset="${README_ASSET_DIR}/${f}"`), `README lacks the dark source ${f}`);
      assert.ok(readme.includes(`src="${README_ASSET_DIR}/${light}"`), `README lacks the light img ${light}`);
    }
    assert.ok(readme.split("<picture>").length === readme.split("</picture>").length);
    assert.ok(readmeImageBytes(REPO) <= README_IMAGES_MAX_BYTES, `README images ${readmeImageBytes(REPO)} B over 2 MB`);
  });

  test("README figures stay out of the npm tarball", () => {
    const files = JSON.parse(readRepo("package.json")).files ?? [];
    assert.ok(files.every((f) => !f.startsWith("docs")), `package.json files ships docs: ${files.join(", ")}`);
    const manifests = readRepo("build/manifests.ts");
    const out = manifests.slice(manifests.indexOf("export const OUT_FILES"), manifests.indexOf("].slice().sort()"));
    assert.ok(!out.includes('"docs'), "OUT_FILES names a docs path");
  });

  test("README line cap is 700 (D-TIC-README-3, was 650 by D-TIC-README-1, 600 by D-README-DWELL-1, 400 before) and its DEVIATIONS row quotes the owner", async () => {
    const { README_MAX_LINES } = await import("../src/core/contracts/constants.ts");
    assert.equal(README_MAX_LINES, 700);
    const rows = readRepo("docs/architecture/modules/DEVIATIONS.md").split("\n").filter((l) => l.includes("(D-README-THESIS-1)")); // the row id; later rows may name it in their text
    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes("akademik bir tez"));
  });

  test("README has its parts, and no citation file or block (D-README-NO-CITE-1, D-README-OSS-1)", () => {
    const readme = readRepo("README.md");
    // Owner 2026-11-01: "fazla akademik olmus, oss community nin kullandigi terimleri kullan". OSS section names, in this order.
    const SECTIONS = ["## Why", "## Adoption: stars and npm downloads", "## Install", "## Try it", "## Use cases", "## Benchmarks", "## How it works", "## Tools",
      "## Security and privacy", "## Context Mode Gateway", "## License", "## Community"];
    let at = -1;
    for (const part of SECTIONS) {
      const i = readme.indexOf("\n" + part + "\n");
      assert.ok(i > at, `README lacks ${part} after the section before it`);
      at = i;
    }
    for (const bad of ["## Abstract", "This paper", "**Figure ", "**Table ", "**Case ", "## 1.", "### 2.1", "Playwright"]) assert.ok(!readme.includes(bad), `README has ${bad} (D-README-OSS-1)`);
    assert.ok(!readme.includes('href="#"'), "README links a badge to #");
    assert.ok(!readme.includes("img.shields.io/badge/Microsoft"), "company badges are one rendered image now (D-README-OSS-1)");
    assert.ok(readme.includes("<details>"), "README uses details blocks");
    for (const id of ["claude-code", "codex", "copilot-cli", "gemini", "kiro", "opencode", "pi", "qwen", "vscode", "zcode"]) {
      assert.ok(readme.includes(`id="install-${id}">`), `README has an install block for ${id}`);
    }
    // Owner 2026-11-01: positive wording only. Prose lines (fences skipped) hold none of these words.
    const NEG = ["not", "no", "never", "without", "cannot", "forget", "forgets", "lose", "loses", "flood", "floods", "fills"];
    let fence = false;
    readme.split("\n").forEach((line, i) => {
      if (line.startsWith("```")) { fence = !fence; return; }
      if (fence) return;
      const words = [];
      let w = "";
      for (const ch of line.toLowerCase() + " ") {
        if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) w += ch;
        else { if (w) words.push(w); w = ""; }
      }
      for (const n of NEG) assert.ok(!words.includes(n), `README line ${i + 1} has the word "${n}": ${line.slice(0, 120)}`);
      assert.ok(!line.includes("n't"), `README line ${i + 1} has n't`);
    });
    for (const bad of ["## Scope", "## Limitations", "## Known"]) assert.ok(!readme.includes(bad), `README has ${bad} (D-README-NO-SCOPE-1)`);
    assert.ok(!readme.includes("OPEN-ITEMS"), "README points to OPEN-ITEMS (D-README-NO-SCOPE-1)");
    assert.ok(!existsSync(path.join(REPO, "CITATION.cff")), "CITATION.cff is back (owner 2026-11-01: CITATION.cff e gerek yok)");
    for (const bad of ["## Cite", "```bibtex", "CITATION.cff"]) assert.ok(!readme.includes(bad), `README has ${bad}`);
  });

  test("README: Gateway text comes first after the badges, and no failed run is quoted", () => {
    const readme = readRepo("README.md");
    const gw = readme.indexOf("Context Mode Gateway");
    assert.ok(gw > 0 && gw < readme.indexOf("\n## Why\n"), "the Gateway line must sit above the first section");
    // Owner 2026-11-01 (D-README-GW-PROBLEM-1, D-README-GW-CALM-1): quota, price and sign-up lines read as an ad.
    for (const ad of ["1,000 requests", "card-free", "Start at", "Every plan has every feature", "contextmode.ai/pricing"]) assert.ok(!readme.includes(ad), `README has ${ad} (D-README-GW-PROBLEM-1)`);
    // Runs that failed their own pre-registered rule (gateway-paid.md §2) and claims with no raw source.
    for (const bad of ["65.5%", "54.9%", "$2.49", "$1.88", "80x", "315 KB becomes"]) assert.ok(!readme.includes(bad), `README quotes ${bad}`);
    // The 1M-window run missed its own pre-registered accuracy rule, so the README leaves it out.
    for (const bad of ["$7.24", "-59.0%"]) assert.ok(!readme.includes(bad), `README quotes ${bad}`);
    for (const l of readme.split("\n").filter((x) => x.includes("43.8%"))) assert.ok(l.includes("15 of 20"), "-43.8% without its task-check loss");
  });

  test("README: the top Gateway blockquote and section 8 read calm: no fear word, no negation, no plan, price or sign-up line (D-README-GW-CALM-1)", () => {
    // Owner 2026-11-01 on the problem-first text: "bu icime sinmedi OSS userleri kaciririz URKUTURUZ". The plugin is complete
    // on its own; the Gateway is an optional hosted service next to it. Words are split by hand (no regex).
    const readme = readRepo("README.md");
    const lines = readme.split("\n");
    const quote = lines.find((l) => l.startsWith("> ") && l.includes("Context Mode Gateway"));
    assert.ok(quote, "README has no top Gateway blockquote");
    assert.ok(lines.indexOf(quote) < lines.findIndex((l) => l.startsWith("## ")), "the Gateway blockquote sits above the first section");
    // D-README-PRIVACY-1: ELv2 is source-available, so the line says "source open on GitHub", not "open source".
    assert.ok(quote.includes("free and local, with its source open on GitHub"), "the blockquote says the plugin stays free and local, with its source open on GitHub");
    const start = readme.indexOf("\n## Context Mode Gateway\n");
    const end = readme.indexOf("\n## License\n", start);
    assert.ok(start > 0 && end > start, "README has no Context Mode Gateway section");
    const words = (text) => {
      const out = [];
      let w = "";
      for (const ch of text.toLowerCase() + " ") {
        if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) w += ch;
        else { if (w) out.push(w); w = ""; }
      }
      return out;
    };
    const BANNED_WORDS = ["forget", "forgets", "forgot", "lose", "loses", "lost", "flood", "floods", "break", "breaks", "limit", "limits", "pain",
      "problem", "problems", "struggle", "risk", "risks", "not", "no", "never", "without", "cannot", "v2", "enterprise", "quota", "pricing",
      // D-README-GW-NAME-1: plan and sales words stay out; "hosted service", "separate" and "subscription" name the product.
      "paid", "prices", "upgrade", "trial", "buy", "purchase", "hobby", "business", "basic"];
    const BANNED_PHRASES = ["still grows", "compacts and", "n't", "1,000 requests", "card-free", "every feature", "start at", "sign up", "sign-up",
      "free plan", "pro plan", "team plan", "per month", "/month", "/mo", "zero compactions", "0 compactions",
      "credit card", "paid plan", "business plan", "hobby plan", "per seat", "per user"];
    for (const [name, text] of [["top blockquote", quote], ["section 8", readme.slice(start, end)]]) {
      const ws = new Set(words(text));
      for (const b of BANNED_WORDS) assert.ok(!ws.has(b), `${name} has the word "${b}" (D-README-GW-CALM-1)`);
      for (const b of BANNED_PHRASES) assert.ok(!text.toLowerCase().includes(b), `${name} has "${b}" (D-README-GW-CALM-1)`);
    }
    // D-README-GW-NAME-1: the reader and an AI agent see two products: the free plugin and a separate hosted service.
    const sec8 = readme.slice(start, end);
    for (const [name, text] of [["top blockquote", quote], ["section 8", sec8]]) {
      for (const need of ["hosted service", "separate", "own account and subscription"]) assert.ok(text.includes(need), `${name} lacks "${need}" (D-README-GW-NAME-1)`);
    }
    const ptable = sec8.slice(sec8.indexOf("| Product | Runs | Scope | Billing |"));
    assert.ok(sec8.indexOf("| Product | Runs | Scope | Billing |") > 0, "section 8 has the two-row product table");
    const prows = ptable.slice(0, ptable.indexOf("\n\n")).split("\n").slice(2);
    assert.equal(prows.length, 2, "the product table has two rows");
    assert.ok(prows[0].startsWith("| Context Mode plugin |") && prows[0].includes("| Free |"), "row 1: the free plugin");
    assert.ok(prows[1].startsWith("| Context Mode Gateway |") && prows[1].includes("Subscription, separate from the plugin"), "row 2: the Gateway, its own subscription");
    datedRow("D-README-GW-NAME-1", "paid diyerek urkutme kimseyi");
    const rows = readRepo("docs/architecture/DEVIATIONS.md").split("\n").filter((l) => l.startsWith("| D-README-GW-CALM-1 |"));
    assert.equal(rows.length, 1, "DEVIATIONS has one D-README-GW-CALM-1 row");
    assert.ok(rows[0].includes("bu icime sinmedi OSS userleri kaciririz URKUTURUZ"), "the row quotes the owner");
  });

  test("readme-links: readmeLinks skips images and image links; outboundLinks drops #anchors; repoDocLinks keeps docs pages only (D-README-LINKS-2)", async () => {
    const { readmeLinks, outboundLinks, repoDocLinks } = await import("../build/readme-links.mjs");
    const text = '[![b](x.svg)](https://a) [t](docs/x.md#y) <a href="y.mp4"><img src="z.webp"></a> <a href="w">w</a> [s](#a) [f](docs/assets/readme/data/c.json) ![i](q.png)';
    assert.deepEqual(readmeLinks(text), ["docs/x.md#y", "#a", "docs/assets/readme/data/c.json", "w"]);
    assert.deepEqual(outboundLinks(text), ["docs/x.md#y", "docs/assets/readme/data/c.json", "w"]);
    assert.deepEqual(repoDocLinks(text), ["docs/x.md#y"]);
  });

  test("README links: guides come from contextmode.ai/docs/engine, one per topic; no repo docs page; at most README_MAX_LINKS links out (D-README-LINKS-1, D-README-LINKS-2)", async () => {
    // Owner 2026-11-02: "readmeki docslarin linkleri github reposundan alinmis linkler ben contextmode.ai de yayinladiklarimizdan bahsetmistim"; "bu kadar link olmasin".
    const { README_MAX_LINKS, outboundLinks, repoDocLinks } = await import("../build/readme-links.mjs");
    const readme = readRepo("README.md");
    const ENGINE = "https://contextmode.ai/docs/engine/";
    const out = outboundLinks(readme);
    // D-README-DWELL-1 (owner 2026-11-03: "Readme linkleri, oruntulu olsun, organik olsun"): guides from the live sitemap,
    // each one at most once (install also has its switch anchor), woven into the section that names the topic.
    const LIVE = ["install", "agents", "first-session", "how-it-works", "tools", "sandbox", "search", "long-sessions", "security", "privacy", "benchmarks", "doctor", "gateway", "for-agents"];
    const guides = out.filter((t) => t.startsWith(ENGINE)).map((t) => t.slice(ENGINE.length, t.indexOf("?")));
    for (const g of guides) assert.ok(LIVE.includes(g), `${g}: a guide outside the live sitemap`);
    for (const g of new Set(guides)) assert.ok(guides.filter((x) => x === g).length <= (g === "install" ? 2 : 1), `${g}: linked more than once`);
    assert.ok(guides.length >= 8, `README links ${guides.length} guides`);
    assert.ok(!readme.includes("#already-installed-from-github"), "no switch link: main is the only source");
    // Repo docs links: architecture records only (ADRs, the hook-run record); install guides live on contextmode.ai.
    // D-README-HOW-2: How it works ends with one link to docs/how-it-works.md, the long form of its steps.
    for (const t of repoDocLinks(readme)) assert.ok(t.startsWith("docs/architecture/") || t === "docs/how-it-works.md", `README links a repo docs page outside docs/architecture: ${t}`);
    assert.ok(repoDocLinks(readme).some((t) => t.startsWith("docs/architecture/adr/")), "README links an ADR");
    for (const need of ["](bench/README.md", "](CONTRIBUTING.md)"]) assert.ok(readme.includes(need), `README lacks ${need}`);
    assert.ok(out.length <= README_MAX_LINKS, `README has ${out.length} links out; the cap is ${README_MAX_LINKS}`);
    // No link lists: a line holds at most 2 links out, except the use-case table rows and the Gateway screen table.
    for (const line of readme.split("\n")) {
      if (line.startsWith("| ") || line.startsWith("<tr>") || line.startsWith("[![")) continue;
      assert.ok(outboundLinks(line).length <= 2, `a line lists ${outboundLinks(line).length} links: ${line.slice(0, 100)}`);
    }
    assert.ok(!readme.includes("Guide: ["), "the per-agent guide links are gone");
    const community = readme.slice(readme.indexOf("\n## Community\n"));
    assert.ok(!community.split("\n").some((l) => l.startsWith("Docs: ")), "the Community docs line is gone");
    assert.ok(!readme.includes("Guides on contextmode.ai"), "the Community guide list is gone");
    const video = readme.split("\n").filter((l) => l.startsWith("**Videos.**"));
    assert.equal(video.length, 1);
    assert.ok(video[0].includes("youtube.com/watch?v=QUHrntlfPo4") && video[0].includes("discord.gg/") && video[0].includes("10K views"), "Videos line: the video, Discord, the 10K rule");
    assert.ok(!video[0].includes("<img") && !video[0].includes("!["), "the Videos line has no thumbnail or badge");
    datedRow("D-README-LINKS-1", "Docs linklerini dump etme");
    datedRow("D-README-LINKS-2", "bu kadar link olmasin");
    datedRow("D-README-DWELL-1", "Readme linkleri, oruntulu olsun, organik olsun");
    // D-README-DWELL-1: every contextmode.ai link carries the README UTM source (funnel rule).
    for (const t of out.filter((x) => x.startsWith("https://contextmode.ai"))) assert.ok(t.includes("utm_source=github"), `${t}: lacks utm_source`);
  });

  test("README: Gateway screenshots gallery names six existing images and the README holds no email address (D-README-GW-SHOTS-1)", () => {
    const readme = readRepo("README.md");
    const dir = "docs/assets/readme/gateway/";
    const named = [];
    for (let i = readme.indexOf(dir); i >= 0; i = readme.indexOf(dir, i + 1)) {
      const end = readme.slice(i).search(/["')\s]/);
      named.push(readme.slice(i, i + end));
    }
    const files = [...new Set(named)];
    for (const f of files) assert.ok(existsSync(path.join(REPO, f)), `README names ${f}, the file is missing`);
    for (const shot of ["overview", "analytics", "spend", "memory", "skills", "protect"]) assert.ok(files.some((f) => f.includes("/" + shot)), `README has no ${shot} screenshot`);
    assert.ok(readme.includes("author's own account over 30 days"), "README says where the screenshot numbers come from");
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]*[a-z]/i.test(readme), "README names an email address");
    // D-README-GW-VIDEO-1 (owner 2026-11-01: "bu ekran videosunu ... GIF yap ya da video yap OSS icin GitHub icin iyi cozunurlukte bunu ekle").
    for (const f of ["live.webp", "live.mp4"]) {
      assert.ok(existsSync(path.join(REPO, dir + f)), `${dir + f} is missing`);
      assert.ok(files.includes(dir + f), `README names ${dir + f}`);
    }
    const gw = readme.indexOf("\n## Context Mode Gateway\n");
    const firstImg = readme.indexOf("<img ", gw);
    assert.ok(readme.slice(firstImg, firstImg + 80).includes(dir + "live.webp"), "the live video is the first visual of the Gateway section");
    assert.ok(readme.includes(`<a href="${dir}live.mp4"><img src="${dir}live.webp"`), "the live image opens the full mp4");
  });

  test("README: every Gateway screen has a docs line under its caption, and every contextmode.ai link carries the README UTM fields (D-README-FUNNEL-1)", async () => {
    // Owner 2026-11-01: "Her bir SS'in altina onlarla alakali Docs linklerini ver textlerin altina bulunsun"; "funnel imizi gelistirmemiz gerek".
    // contextmode.ai/attribution.js reads utm_source, utm_medium, utm_campaign, utm_term and utm_content into its first-party touch.
    const { readmeTargets } = await import("../build/readme-links.mjs");
    const readme = readRepo("README.md");
    const dir = "docs/assets/readme/gateway/";
    const SHOTS = ["live", "overview", "analytics", "spend", "memory", "skills", "protect"];
    const at = SHOTS.map((s) => readme.indexOf(dir + s));
    SHOTS.forEach((s, i) => {
      assert.ok(at[i] > 0, `README has no ${s} screen`);
      const next = i + 1 < SHOTS.length ? at[i + 1] : readme.indexOf("\n## License\n");
      const block = readme.slice(at[i], next);
      assert.ok(block.includes("Docs: "), `${s} screen has no docs line`);
      assert.ok(block.includes("https://contextmode.ai/docs/") && block.includes("utm_content=" + s), `${s} docs line has no contextmode.ai/docs link tagged ${s}`);
      assert.equal(block.split("utm_content=" + s + '"').length + block.split("utm_content=" + s + ")").length - 2, 1, `${s}: one docs link under the screen (D-README-LINKS-2)`);
    });
    const site = readmeTargets(readme).filter((t) => t.startsWith("https://contextmode.ai") || t.startsWith("https://context-mode.com"));
    assert.ok(site.length >= SHOTS.length);
    for (const t of site) {
      assert.ok(t.startsWith("https://contextmode.ai/"), `${t}: link the canonical host`);
      assert.ok(t.includes("utm_source=github&utm_medium=readme&utm_content="), `${t}: lacks the README UTM fields`);
    }
  });

  test("README: free, local, privacy and zero telemetry come before the Gateway section (D-README-PRIVACY-1)", () => {
    // Owner 2026-11-01: "Konu Gateway section'ina gelene kadar free, local, privacy, no telemetry, forever vs daha cok vurgulayalim".
    const readme = readRepo("README.md");
    const head = readme.slice(0, readme.indexOf("\n## Context Mode Gateway\n"));
    const why = head.slice(head.indexOf("\n## Why\n"), head.indexOf("\n## Install\n"));
    for (const need of ["The plugin is free forever", "Runs on your machine", "~/.context-mode", "Zero telemetry", "offline"]) assert.ok(why.includes(need), `Why lacks ${need}`);
    const sec = head.slice(head.indexOf("\n## Security and privacy\n"));
    for (const need of ["zero telemetry", "src/core/sandbox/fetch.ts", "git ls-remote", "tests/0008-enforcement.test.mjs"]) assert.ok(sec.includes(need), `Security and privacy lacks ${need}`);
    assert.ok(head.split("\n")[2].includes("free") && head.split("\n")[2].includes("local"), "the tagline says free and local");
    const lic = readme.slice(readme.indexOf("\n## License\n"), readme.indexOf("\n## Community\n"));
    assert.ok(lic.includes("source-available") && lic.split("\n").filter((l) => l.startsWith("1. ") || l.startsWith("2. ") || l.startsWith("3. ")).length === 3, "License names the three ELv2 limits");
  });

  const devRow = (id, quote) => {
    const rows = readRepo("docs/architecture/DEVIATIONS.md").split("\n").filter((l) => l.startsWith(`| ${id} |`));
    assert.equal(rows.length, 1, `DEVIATIONS has one ${id} row`);
    assert.ok(rows[0].includes(quote), `the ${id} row quotes the owner`);
  };
  const fences = (text) => {
    const out = [];
    let cur = null;
    for (const line of text.split("\n")) {
      if (line.startsWith("```")) { if (cur) { out.push(cur); cur = null; } else cur = []; } else if (cur) cur.push(line);
    }
    return out;
  };

  test("README use cases: the real-capture rows of the newest bench file, numbers equal to it (D-README-USECASES-2)", () => {
    // Owner 2026-11-01: "orneklemeler cok az, sinirli"; "playwright i silelim ... daha populer github da daha cok yildiz almis en populer tool isimlerini yazalim".
    const readme = readRepo("README.md");
    const names = readdirSync(path.join(REPO, "bench/results")).filter((f) => f.endsWith("-darwin-arm64.json") && f.length === "2026-11-01-darwin-arm64.json".length).sort();
    const newest = names[names.length - 1];
    assert.ok(readme.includes(`bench/results/${newest}`), `README cites ${newest}`);
    for (const old of names.slice(0, -1)) assert.ok(!readme.includes(old.slice(0, 10)), `README names the older bench date ${old.slice(0, 10)}`);
    assert.ok(!readme.includes("next.8"), "README names 2.0.0-next.8");
    const bench = JSON.parse(readRepo(`bench/results/${newest}`));
    const version = bench.context_mode.version.split("+")[0];
    assert.ok(readme.includes(version), `README names the bench version ${version}`);
    const sec = readme.slice(readme.indexOf("\n## Use cases\n"), readme.indexOf("\n## Benchmarks\n"));
    assert.ok(sec.includes("| What you do | Tool | Raw | Reaches the context | Saved |"), "Use cases has the table header");
    // D-README-DWELL-1 (owner 2026-11-03: "use case lerde linkler vardi kaldirmissin uzuldum"): each row links its bench case,
    // bench/<category>/README.md#<row id>, and each row matches a bench row by its numbers and its id.
    const head = "| What you do | Tool | Raw | Reaches the context | Saved |";
    const table = sec.slice(sec.indexOf(head));
    const rows = table.slice(0, table.indexOf("\n\n")).split("\n").slice(2);
    assert.ok(rows.length >= 12, `the use-case table has ${rows.length} rows`);
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim());
      assert.ok(cells[1].startsWith("[") && cells[1].includes("](bench/") && cells[1].endsWith(")"), `use-case row links its bench case: ${row.slice(0, 80)}`);
      const target = cells[1].slice(cells[1].indexOf("](") + 2, -1);
      const [file, anchor] = target.split("#");
      assert.ok(readRepo(file).split("\n").includes(`## ${anchor}`), `${target}: the bench case heading exists`);
      const r = bench.results.find((x) => x.ok && x.synthetic === false && x.metrics.raw_bytes && x.metrics.ctx_bytes &&
        x.metrics.raw_bytes.median.toLocaleString("en-US") + " B" === cells[3] && x.metrics.ctx_bytes.median.toLocaleString("en-US") + " B" === cells[4]);
      assert.ok(r, `${cells[1]}: no real-capture row of ${newest} has these numbers`);
      assert.equal(anchor, r.id, `${cells[1]}: links the bench row it quotes`);
      const raw = r.metrics.raw_bytes.median;
      assert.equal(cells[5], (100 * (1 - r.metrics.ctx_bytes.median / raw)).toFixed(1) + "%", `${r.id} saved`);
    }
    const src = table.slice(table.indexOf("\n\n") + 2).split("\n")[0];
    assert.ok(src.startsWith("Source: ") && src.includes(`](bench/results/${newest})`), `one source line under the table: ${src}`);
    for (const tool of ["Chrome DevTools MCP", "GitHub CLI", "Context7", "Vitest", "Biome", "pnpm", "Docker", "Terraform", "git", "Read", "WebFetch"]) {
      assert.ok(sec.includes(tool), `Use cases names ${tool}`);
    }
    // Headline rule: median of the rows with 10 KB or more of raw output.
    const big = bench.results.filter((r) => r.ok && r.metrics.raw_bytes && r.metrics.ctx_bytes && r.metrics.raw_bytes.median >= 10240);
    const s = big.map((r) => 100 * (1 - r.metrics.ctx_bytes.median / r.metrics.raw_bytes.median)).sort((a, b) => a - b);
    const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    assert.ok(readme.includes(`${big.length} bench rows with 10 KB or more`) && readme.includes(`${med.toFixed(1)}%`), `README headline is ${med.toFixed(1)}% over ${big.length} rows`);
    devRow("D-README-USECASES-2", "playwright i silelim");
  });

  test("README Thinking in Code lives in How it works step 5: the real ctx_execute and ctx_batch calls in their terminal form, bytes from the evidence (D-TIC-README-2)", () => {
    // Owner 2026-11-03: "ctx_execute ve batch tool lari icerisinde terminalde nasil gozukecek onu vermeliydin ... Bunu ayrica how its works kismina ekle en basa degil."
    const readme = readRepo("README.md");
    assert.ok(!readme.includes("\n## Thinking in Code\n"), "no top-level Thinking in Code section");
    assert.ok(!readme.split("\n").find((l) => l.startsWith("**Contents:** ")).includes("Thinking in Code"), "Contents names the sections only");
    const why = readme.slice(readme.indexOf("\n## Why\n"), readme.indexOf("\n## Adoption: stars and npm downloads\n"));
    assert.ok(why.split("\n").some((l) => l.startsWith("- **Thinking in Code.**") && l.includes("](#thinking-in-code)")), "a Why bullet names the principle and links it");
    const how = readme.slice(readme.indexOf("\n## How it works\n"), readme.indexOf("\n## Tools\n"));
    const step5 = how.slice(how.indexOf("\n5. **The sandbox.** "), how.indexOf("\n6. **Indexing.** "));
    assert.ok(step5.includes('<a id="thinking-in-code"></a>'), "step 5 holds the #thinking-in-code anchor");
    const B = (n) => `${n.toLocaleString("en-US")} B`;
    const { exec, batch } = realCalls();
    assert.equal(exec.tool, "ctx_execute");
    const [f1, f2] = textFences(step5);
    assert.equal(f1, exec.form, "the ctx_execute transcript is the stored stream, line for line");
    assert.equal(f2, batch.form, "the ctx_batch transcript is the stored MCP reply, line for line");
    assert.equal(batch.ev.produced_bytes, batch.produced, "produced bytes equal the input file sizes");
    assert.equal(batch.ev.returned_bytes, batch.returned, "returned bytes equal the stored reply");
    for (const need of [B(exec.read), B(exec.returned), `Claude Code ${exec.agent}`, exec.version, "](bench/evidence/try-it-2026-11-02/04-api-json.json)",
      B(batch.produced), B(batch.returned), batch.ev.version, batch.ev.date, "](bench/evidence/thinking-in-code/2026-11-03-ctx-batch.json)"]) {
      assert.ok(step5.includes(need), `step 5 lacks ${need}`);
    }
    assert.ok(!how.includes("```js"), "How it works shows tool calls, not bare scripts");
    const use = readme.slice(readme.indexOf("\n## Use cases\n"), readme.indexOf("\n## Benchmarks\n")).split("\n").filter((l) => l.startsWith("| ["));
    for (const row of use) {
      assert.equal(row.includes("[Thinking in Code](#thinking-in-code)"), row.includes("](bench/a-sandbox/README.md#"), `mark only the sandbox script rows: ${row.slice(0, 70)}`);
    }
    devRow("D-TIC-README-2", "terminalde nasil gozukecek");
  });

  test("README How it works and Tools show each other tool as its real terminal call, from the stored MCP frames (D-TIC-README-3)", () => {
    // Owner 2026-11-03: "Bu MCP olarak terminal bazli gosterme konusunu cok cok sevdim. How it works kisminda diger tool lari da gosterebilirsin."
    const readme = readRepo("README.md");
    const B = (n) => `${n.toLocaleString("en-US")} B`;
    const dir = "bench/evidence/terminal-calls-2026-11-03";
    const ev = JSON.parse(readRoot(`${dir}/calls.json`));
    const evReadme = readRoot(`${dir}/README.md`);
    for (const need of [ev.date, ev.version]) assert.ok(evReadme.includes(need), `evidence README names ${need}`);
    const how = readme.slice(readme.indexOf("\n## How it works\n"), readme.indexOf("\n## Tools\n"));
    const step = (n, title) => how.slice(how.indexOf(`\n${n}. **${title}** `), how.indexOf(`\n${n + 1}. **`));
    const tools = readme.slice(readme.indexOf("\n## Tools\n"), readme.indexOf("\n## Security and privacy\n"));
    const where = {
      ctx_index: step(6, "Indexing."), ctx_search: step(7, "Search."), ctx_resume: step(9, "Journal and compaction."),
      ctx_stats: tools, ctx_doctor: tools, ctx_purge: tools,
    };
    for (const [tool, part] of Object.entries(where)) {
      const c = ev.calls.find((x) => x.tool === tool);
      assert.ok(c, `evidence holds a ${tool} call`);
      const form = terminalForm(tool, c.input, c.result, { lines: c.shown_lines });
      assert.ok(textFences(part).includes(form), `${tool} shows its stored call, line for line`);
      assert.ok(form.split("\n").length <= 9, `${tool} block is short`);
      assert.ok(part.includes(B(Buffer.byteLength(c.result))), `${tool}: returned bytes ${B(Buffer.byteLength(c.result))}`);
      if (c.file) {
        assert.equal(c.produced_bytes, statSync(path.join(ROOT, c.file)).size, `${tool} produced bytes equal the file size`);
        assert.ok(part.includes(B(c.produced_bytes)), `${tool}: produced bytes ${B(c.produced_bytes)}`);
      }
      assert.ok(part.includes(`](${dir}/calls.json)`) || part.includes("in the same run"), `${tool} links its evidence or names the same run`);
    }
    assert.ok(where.ctx_index.includes(`](${dir}/calls.json)`) && tools.includes(`](${dir}/calls.json)`), "step 6 and Tools link calls.json");
    for (const bad of [/\bv2\b/, /\bEngine\b/]) assert.ok(!bad.test(tools), `Tools section avoids ${bad}`);
    devRow("D-TIC-README-3", "terminal bazli gosterme");
  });

  test("README install: one collapsed block per agent, its own install command first, then update, check and remove from its page (D-README-INSTALL-2)", () => {
    // Owner 2026-11-01: "install adimlarini collapse kullanarak yap ... README de kullanabilecegimiz tum stilleri kullan".
    const readme = readRepo("README.md");
    for (const id of AGENT_IDS) {
      const start = readme.indexOf(`id="install-${id}">`);
      assert.ok(start > 0, `README has a collapsed install block for ${id}`);
      const block = readme.slice(start, readme.indexOf("</details>", start));
      const page = readRepo(`docs/install/${id}.md`);
      const pageFences = fences(page.slice(page.indexOf("\n## Install\n")));
      const pf = pageFences[0].filter((l) => l.trim() !== "");
      assert.deepEqual(fences(block)[0].slice(0, pf.length), pf, `${id}: the block starts with the page's install fence`);
      const second = fences(block)[1];
      assert.ok(second[0] === "# update" && second[1] === pageFences[1][0], `${id}: update command from the page`);
      for (const need of ["# check", "# remove"]) assert.ok(second.includes(need), `${id}: block lacks ${need}`);
      assert.ok(!block.includes("](docs/"), `${id}: block links a repo docs page (D-README-LINKS-2)`);
    }
    // D-README-DWELL-1 (owner 2026-11-03: "inline code etiketleri ile alttaki paragraflar ne kadar kullanissiz"):
    // outside a fence, an Install line holds at most one inline-code span.
    const inst = readme.slice(readme.indexOf("\n## Install\n"), readme.indexOf("\n## Try it\n"));
    let inFence = false;
    for (const line of inst.split("\n")) {
      if (line.startsWith("```")) { inFence = !inFence; continue; }
      if (!inFence) assert.ok(line.split("`").length - 1 < 4, `Install line holds 2 or more inline-code spans: ${line.slice(0, 100)}`);
    }
    assert.ok(readme.includes("\n**Contents:** "), "README has a short table of contents");
    // No "v2" in prose: it becomes the default release.
    // Skipped: fences and the <!-- --> note for agents in the page source (owner 2026-11-01: "markdown olarak sayfa kaynagina eklesen ai agents daha iyi okur").
    let fence = false;
    let note = false;
    for (const line of readme.split("\n")) {
      if (line.startsWith("```")) fence = !fence;
      if (line === "<!--") note = true;
      if (line === "-->") { note = false; continue; }
      if (fence || note) continue;
      const words = [];
      let w = "";
      for (const ch of line.toLowerCase() + " ") {
        if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) w += ch;
        else { if (w) words.push(w); w = ""; }
      }
      assert.ok(!words.includes("v2"), `README prose says v2: ${line.slice(0, 100)}`);
    }
    devRow("D-README-INSTALL-2", "install adimlarini collapse kullanarak yap");
  });

  test("README dwell, round 2: install proof folds into one closed block; network calls are a table with file links; the Gateway says when to add it and gives its setup command first (D-README-DWELL-2)", () => {
    // Owner 2026-11-03: "hedefin, bir user i bu sayfada 10 dakikadan fazla tutabilmek olsun"; "inline code etiketleri ile alttaki paragraflar ne kadar kullanissiz".
    const readme = readRepo("README.md");
    const inst = readme.slice(readme.indexOf("\n## Install\n"), readme.indexOf("\n## Try it\n"));
    const proofAt = inst.indexOf("<details><summary><b>How we tested the install</b></summary>");
    assert.ok(proofAt > inst.lastIndexOf('<details id="install-'), "a closed proof block after the agent blocks");
    const proof = inst.slice(proofAt, inst.indexOf("</details>", proofAt));
    for (const need of ["We ran the real binary", "Hooks reach each agent in one of three ways", "HOOKS-FIRE.md", "ADR-0023"]) assert.ok(proof.includes(need), `proof block lacks ${need}`);
    const sec = readme.slice(readme.indexOf("\n## Security and privacy\n"), readme.indexOf("\n## Context Mode Gateway\n"));
    assert.ok(sec.includes("\n| Call | When | File |\n"), "network calls are a table");
    for (const f of ["src/core/sandbox/fetch.ts", "src/core/ops/doctor-env.ts", "src/cli/commands.ts"]) assert.ok(sec.includes(`](${f})`), `Security links ${f}`);
    for (const line of sec.split("\n")) if (!line.startsWith("|")) assert.ok(line.split("`").length - 1 < 6, `Security line holds 3 or more inline-code spans: ${line.slice(0, 100)}`);
    const gw = readme.slice(readme.indexOf("\n## Context Mode Gateway\n"), readme.indexOf("\n## License\n"));
    assert.ok(gw.includes("\nAdd the Gateway when you want "), "the Gateway section says when to add it");
    const setup = gw.indexOf("```sh\nnpx @context-mode/cli\n```");
    assert.ok(setup > 0 && setup < gw.indexOf("<table>"), "the Gateway setup fence sits before the screens");
    // The reviewer's pricing link stays out: D-README-GW-PROBLEM-1 and D-README-GW-CALM-1 keep price lines out of the README.
    assert.ok(gw.includes("Gateway only"), "the cost lines say Gateway only");
    datedRow("D-README-DWELL-2", "10 dakikadan fazla");
  });

  test("README: one rendered stargazer-companies image, light and dark, drawn from the JSON, with its source line (D-README-STARRED-1)", () => {
    // Owner 2026-11-01: "Starred by engineers at altindaki logolari labelleri bizim design system e gore yap".
    const readme = readRepo("README.md");
    const data = JSON.parse(readRepo("docs/assets/readme/data/stargazer-companies.json"));
    assert.ok(readme.includes('srcset="docs/assets/readme/stargazers-dark.png"') && readme.includes('src="docs/assets/readme/stargazers-light.png"'), "README shows the stargazers image in both themes");
    const html = readRepo("docs/assets/readme/src/stargazers.html");
    assert.ok(html.includes("window.COMPANIES") && !html.includes(data.companies[0].name), "the page draws the names from the JSON, none typed in");
    assert.ok(readRepo("docs/assets/readme/src/render.mjs").includes("stargazer-companies.json"), "render.mjs feeds the JSON to the page");
    assert.ok(readme.split("\n").some((l) => l.includes("GitHub GraphQL API") && l.includes(data.read_at.slice(0, 10))), "README names the source and the date under the image");
    devRow("D-README-STARRED-1", "Starred by engineers at");
  });

  test("README review pass: table sums equal the headline, KB is 1,024 B, Speed rows name their bench row, hook runs name each agent (D-README-REVIEW-1)", () => {
    // Owner 2026-11-01: "olumsuzluk eki olan olumsuz anlam tasiyan hicbir sey istemiyorum"; owner main rule on native install commands.
    const readme = readRepo("README.md");
    const names = readdirSync(path.join(REPO, "bench/results")).filter((f) => f.endsWith("-darwin-arm64.json") && f.length === "2026-11-01-darwin-arm64.json".length).sort();
    const newest = names[names.length - 1];
    const bench = JSON.parse(readRepo(`bench/results/${newest}`));
    const med = (s) => { s = [...s].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const big = bench.results.filter((r) => r.ok && r.metrics.raw_bytes && r.metrics.ctx_bytes && r.metrics.raw_bytes.median >= 10240);
    // Benchmarks table: one row per category of the headline rows; the Rows cells add up to the headline count.
    const sec = readme.slice(readme.indexOf("\n## Benchmarks\n"), readme.indexOf("\n### Longer sessions\n"));
    const cats = [...new Set(big.map((r) => r.id.split("-")[0]))].sort();
    let sum = 0;
    for (const c of cats) {
      const rows = big.filter((r) => r.id.split("-")[0] === c);
      const line = sec.split("\n").find((l) => l.startsWith(`| ${c}. `));
      assert.ok(line, `Benchmarks table lacks category ${c}`);
      const cells = line.split("|").map((x) => x.trim());
      assert.equal(cells[3], String(rows.length), `${c} rows`);
      assert.equal(cells[4], med(rows.map((r) => 100 * (1 - r.metrics.ctx_bytes.median / r.metrics.raw_bytes.median))).toFixed(1) + "%", `${c} median`);
      sum += rows.length;
    }
    assert.equal(sum, big.length, "the Rows cells add up to the headline count");
    assert.ok(sec.includes("1 KB = 1,024 B"), "the rule line says what KB means");
    assert.ok(readme.includes(bench.context_mode.commit.slice(0, 8)), "README names the bench commit");
    // Use-case labels that name a size use KB = 1,024 B, rounded.
    const uc = readme.slice(readme.indexOf("\n## Use cases\n"), readme.indexOf("\n## Benchmarks\n"));
    const kbRows = uc.split("\n").filter((l) => l.startsWith("| ") && l.split("|")[1].includes(" KB "));
    assert.ok(kbRows.length >= 4, "use-case labels name sizes");
    for (const row of kbRows) {
      const cells = row.split("|").map((c) => c.trim());
      const kb = Number(cells[1].split(" ").find((w, i, a) => a[i + 1] === "KB"));
      const raw = Number(cells[3].split(" ")[0].split(",").join(""));
      assert.equal(kb, Math.round(raw / 1024), `${cells[1]}: label says ${kb} KB, raw is ${raw} B`);
    }
    // Speed: each row links its bench row; the section points to the bench results file.
    const speed = readme.slice(readme.indexOf("\n### Speed\n"), readme.indexOf("\n## How it works\n"));
    // D-README-LINKS-2: Speed names its bench rows in code text, in one source line under the table, with no link.
    assert.ok(speed.includes(`bench/results/${newest.replace(".json", ".md")}`) && !speed.includes("docs/performance.md"), "Speed names the bench results file");
    // D-README-DWELL-1 (owner 2026-11-03: "bench dizini ... referanslari ekleyelim"): Speed links only bench files and page anchors.
    for (const s of speed.split("](").slice(1)) assert.ok(s.startsWith("bench/") || s.startsWith("#"), `Speed links outside bench: ${s.slice(0, 60)}`);
    for (const id of ["g-hook-kiro", "g-hook-claude-code", "g-search-latency", "g-index-per-mb"]) assert.ok(speed.includes("`" + id + "`"), `Speed names ${id}`);
    const hooks = bench.results.filter((r) => r.id.startsWith("g-hook-")).map((r) => r.metrics.overhead_ms.median);
    assert.ok(speed.includes(`${Math.min(...hooks).toFixed(1)} ms to ${Math.max(...hooks).toFixed(1)} ms`), "hook range from the bench rows");
    // Hook runs: one positive line that names each agent.
    const agents = readme.slice(readme.indexOf("\n## Install\n"), readme.indexOf("\n## Use cases\n"));
    assert.ok(!agents.includes("For 8 agents") && !agents.includes("earlier step"), "hook runs read as a list of agents");
    const live = agents.split("\n").find((l) => l.startsWith("We ran the real binary of each agent with the plugin hook"));
    assert.ok(live, "README has the real-binary line");
    for (const n of ["Claude Code", "Codex", "Gemini CLI", "Qwen Code", "Pi", "OpenCode", "Copilot CLI", "ZCode"]) assert.ok(live.includes(n), `real-binary line names ${n}`);
    assert.ok(!live.includes("logged out") && !live.includes(" our "), "the real-binary line reads plain");
    // Install (D-README-DWELL-1, replaces the open blocks of D-README-FIX-1): all 10 blocks closed; one short "pick your agent" line sits before them.
    const firstBlock = readme.indexOf("<details id=\"install-");
    assert.ok(firstBlock > 0, "the first install block is closed");
    const head = readme.slice(readme.indexOf("\n## Install\n"), firstBlock);
    for (const need of ["Pick your agent", "[package.json](package.json)"]) assert.ok(head.includes(need), `Install intro lacks ${need}`);
    for (const a of ADAPTERS) assert.ok(readme.includes(`<details id="install-${a.id}">`), `${a.id} block is closed`);
    const codex = readme.slice(readme.indexOf("<details id=\"install-codex\">"), readme.indexOf("</details>", readme.indexOf("<details id=\"install-codex\">")));
    assert.ok(codex.includes("\ncontext-mode setup --agents codex\n```"), "the Codex block ends its install fence with the hook trust step");
    for (const bad of ["check D11", "After v2", "Switch day", "Agent note", "<!--", "so add `@next`"]) assert.ok(!readme.includes(bad), `README has "${bad}"`);
    datedRow("D-README-FIX-1", "tum agentlerin kendi native install commandleri");
    for (const bad of ["old build", "old release", "rolls back", "recall block", "FAIL"]) assert.ok(!readme.includes(bad), `README has "${bad}"`);
    // "zero" stays only in the owner's own "zero telemetry".
    for (const line of readme.split("\n")) {
      const rest = line.toLowerCase().split("zero telemetry").join("");
      assert.ok(!rest.split(" ").some((w) => w.split(",").join("").split(".").join("") === "zero"), `README line has "zero": ${line.slice(0, 100)}`);
    }
    // Gateway: the intro names the same features as the table, in order.
    const gw = readme.slice(readme.indexOf("\n## Context Mode Gateway\n"), readme.indexOf("\n## License\n"));
    const ft = gw.slice(gw.indexOf("\n| Feature |") + 1);
    const table = ft.slice(0, ft.indexOf("\n\n")).split("\n").slice(2).map((l) => l.split("|")[1].trim());
    assert.ok(table.length >= 10, `Gateway table has ${table.length} rows`);
    const intro = gw.split("\n").find((l) => l.startsWith("The plugin works on tool output"));
    assert.ok(intro.includes(`Its ${table.length} features, the full list: ${table.join(", ")}.`), "the intro lists the table features, in order, and says the list is full");
    devRow("D-README-REVIEW-1", "olumsuzluk eki olan olumsuz anlam tasiyan hicbir sey istemiyorum");
  });

  test("README holds no GitHub alert block: each note is a plain line (D-README-PLAIN-1)", () => {
    // Owner 2026-11-02: "bu mor-yesil renklendirmeler AI-Sloppy gozukuyor ve bizim /brand design-system imimzde bu renkler bu stiller yok".
    const readme = readRepo("README.md");
    for (const line of readme.split("\n")) assert.ok(!line.startsWith("> [!"), `README has an alert block: ${line}`);
    for (const kind of ["IMPORTANT", "TIP", "NOTE", "WARNING", "CAUTION"]) assert.ok(!readme.includes(`[!${kind}]`), `README has [!${kind}]`);
    assert.ok(readme.includes("The plugin needs Node 24.15.0 or later"), "the Node line stays as a plain line");
    datedRow("D-README-PLAIN-1", "bu mor-yesil renklendirmeler AI-Sloppy gozukuyor");
  });

  test("README How it works: the figure, then one tool call in time order, each step with its limits by name and one source link (D-README-HOW-2)", async () => {
    // Owner 2026-11-03: "How it works u README'ye acikca algoritmasi ve kronolojik hikayesi ile yazmayi istiyorum."
    const C = await import("../src/core/contracts/constants.ts");
    const readme = readRepo("README.md");
    const sec = readme.slice(readme.indexOf("\n## How it works\n"), readme.indexOf("\n## Tools\n"));
    assert.ok(sec.includes('srcset="docs/assets/readme/fig-flow-dark.png"'), "the figure stays");
    assert.ok(sec.indexOf("<picture>") < sec.indexOf("\n1. "), "the figure is on top");
    const steps = [];
    for (let n = 1; sec.includes("\n" + n + ". "); n++) {
      const from = sec.indexOf("\n" + n + ". ") + 1;
      const next = sec.indexOf("\n" + (n + 1) + ". ", from);
      steps.push(sec.slice(from, next === -1 ? sec.indexOf("\n\n", from) === -1 ? sec.length : sec.indexOf("\n\n", from) : next));
    }
    assert.ok(steps.length >= 9 && steps.length <= 12, `${steps.length} steps`);
    for (const s of steps) {
      // The step text is its first paragraph; an indented sub-part below it (step 5: Thinking in Code, D-TIC-README-2) is not counted.
      const sentences = s.split("\n\n")[0].split(". ").length;
      assert.ok(sentences >= 2 && sentences <= 6, `step has ${sentences} sentences: ${s.slice(0, 80)}`);
      assert.ok(s.includes("](src/") || s.includes("](docs/architecture/adr/") || s.includes("](docs/v2/adr/"), `step has no source or ADR link: ${s.slice(0, 80)}`);
    }
    const order = ["install", "SessionStart", "PreToolUse", "sandbox", "index", "PostToolUse", "compaction", "context.db", "exit 0"];
    let at = -1;
    for (const w of order) { const i = sec.indexOf(w, at + 1); assert.ok(i > at, `How it works lacks ${w} after the step before it`); at = i; }
    for (const w of ["deny list", "WebFetch", "curl", "Porter", "trigram", "BM25", "Reciprocal Rank Fusion", "spelling", "ctx_resume", "WAL", "PASSIVE checkpoint", "atomic", "one log line"]) {
      assert.ok(sec.includes(w), `How it works lacks ${w}`);
    }
    for (const name of ["OUTPUT_CAP", "EXEC_TIMEOUT_MS", "HOOK_TIMEOUT_MS", "MAX_CHUNK_BYTES", "SNIPPET_MAX_BYTES", "RRF_K", "REPLACE_TRIGGER_BYTES", "STATE_BUDGET", "RESUME_CAP", "DB_TIMEOUT_MS"]) {
      assert.ok(sec.includes("`" + name + "`"), `How it works lacks ${name} by name`);
      assert.ok(sec.includes(C[name].toLocaleString("en-US")), `How it works lacks the value of ${name}`);
    }
    assert.equal(sec.split("](docs/how-it-works.md").length - 1, 1, "How it works links docs/how-it-works.md once");
    assert.ok(sec.lastIndexOf("](docs/how-it-works.md") > sec.indexOf("\n" + steps.length + ". "), "the docs link is at the end");
    for (const bold of ["**Hooks.**", "**Sandbox execution.**", "**Index and search.**", "**Storage.**"]) assert.ok(!sec.includes(bold), `README still has ${bold}`);
    const doc = readRepo("docs/how-it-works.md");
    const eng = doc.slice(doc.indexOf("\n## Engineering details\n"));
    assert.ok(doc.includes("\n## Engineering details\n"), "docs/how-it-works.md has Engineering details");
    for (const fact of ["16,384 B", "always exits 0", "5,000 ms", "600,000 ms", "taskkill /F /T", "NODE_OPTIONS", "Porter-stemmed", "1/(60 + rank)", "spelling fix",
      "Chunks are at most 4,096 B", "800 B", "best-matching whole chunks", "ctx_resume(seq)", "prompt match block", "node:sqlite", "PASSIVE checkpoint", "even after a crash"]) {
      assert.ok(eng.includes(fact), `Engineering details lack ${fact}`);
    }
    datedRow("D-README-HOW-2", "kronolojik hikayesi");
  });

  test("README Try it: a stats step after the prompts, each agent's own command and a real report sample with date and version (D-README-STATS-RUN-1)", () => {
    // Owner 2026-11-03: "stats Skill ini cagirsin hemen ardindan ve sonucunu kendi gozleri ile gorsun."
    const readme = readRepo("README.md");
    const sec = readme.slice(readme.indexOf("\n## Try it\n"), readme.indexOf("\n## Use cases\n"));
    const head = sec.indexOf("\n### See the saving\n");
    assert.ok(head > 0, "Try it has the stats step");
    assert.equal(sec.slice(0, head).split("```text\n").length - 1, 4, "the stats step comes after the four prompts");
    const step = sec.slice(head);
    for (const row of agentRows()) {
      const line = step.split("\n").find((l) => l.startsWith("| " + row.name + " |"));
      assert.ok(line !== undefined, `stats step lacks a row for ${row.name}`);
    }
    assert.ok(step.includes("`/ctx-stats`"), "the slash command");
    const sample = step.slice(step.indexOf("```text\n") + 8, step.indexOf("\n```", step.indexOf("```text\n") + 8));
    assert.ok(step.includes("```text\n") && sample.length > 0, "a report sample in a fence");
    assert.ok(sample.includes("context-mode"), `the sample is the ctx_stats report: ${sample.slice(0, 80)}`);
    const under = step.slice(step.indexOf("\n```", step.indexOf("```text\n") + 8) + 4);
    assert.ok(under.includes("2026-") && under.includes("2.0.0-next."), "the sample names its date and version");
    datedRow("D-README-STATS-RUN-1", "kendi gozleri ile gorsun");
  });

  test("README Try it: the live prompts in fences, each with its measured line, the stats command and the evidence folder (D-README-TRYIT-1)", () => {
    // Owner 2026-11-02: "direkt bu sekilde use-case ler verirsen iste o zaman insanlar bunu denemeye baslarlar".
    const readme = readRepo("README.md");
    const sec = readme.slice(readme.indexOf("\n## Try it\n"), readme.indexOf("\n## Use cases\n"));
    const dir = "bench/evidence/try-it-2026-11-02/";
    for (const id of ["03-docs-page", "04-api-json", "06-large-log", "07-web-page"]) {
      const s = JSON.parse(readRepo(dir + id + ".json")).summary;
      assert.equal(s.verdict, "pass", id);
      assert.ok(sec.includes("```text\n" + s.prompt + "\n```"), `${id}: prompt in a fence`);
      const after = sec.slice(sec.indexOf(s.prompt + "\n```") + s.prompt.length + 5).split("\n").find((l) => l.trim());
      for (const need of [s.raw_bytes.toLocaleString("en-US") + " B", s.context_bytes.toLocaleString("en-US") + " B", s.date, s.version, s.model]) {
        assert.ok(after.includes(need), `${id}: result line lacks ${need}: ${after}`);
      }
    }
    assert.ok(sec.includes("`/ctx-stats`"), "Try it names the stats command");
    assert.ok(sec.includes("(" + dir + "README.md)"), "Try it links the evidence");
    const ev = readRepo(dir + "README.md");
    for (const need of ["## Rerun", "claude plugin marketplace add mksglu/context-mode#release", "claude-haiku-5-5"]) assert.ok(ev.includes(need), `evidence README lacks ${need}`);
    const gw = readme.slice(readme.indexOf("\n## Context Mode Gateway\n"), readme.indexOf("\n## License\n"));
    for (const q of ["Move this project from Jest to Vitest.", "Pick up where we stopped yesterday", "Which date library did we choose on Tuesday"]) {
      assert.ok(gw.includes("```text\n" + q), `Gateway prompt in a fence: ${q}`);
    }
    datedRow("D-README-TRYIT-1", "insanlar bunu denemeye baslarlar");
  });

  test("README Gateway screens: the live video first, then a 2-column gallery of six screens, each with caption and docs (D-README-GW-GALLERY-1)", () => {
    // Owner 2026-11-02: "gateway in ekran goruntulerini alt alta siraladigin icin cok scroll etmem gerekti, galeri tarzinda neden yapmadin".
    const readme = readRepo("README.md");
    const gw = readme.slice(readme.indexOf("\n## Context Mode Gateway\n"), readme.indexOf("\n## License\n"));
    const table = gw.slice(gw.indexOf("<table>"), gw.indexOf("</table>"));
    assert.ok(gw.indexOf("gateway/live.webp") > 0 && gw.indexOf("gateway/live.webp") < gw.indexOf("<table>"), "the video sits above the grid");
    const rows = table.split("<tr>").slice(1);
    assert.equal(rows.length, 3, "three rows");
    for (const r of rows) assert.equal(r.split("<td").length - 1, 2, "two cells per row");
    for (const s of ["overview", "analytics", "spend", "memory", "skills", "protect"]) {
      const cell = table.slice(table.indexOf(`href="docs/assets/readme/gateway/${s}.webp"`)).split("</td>")[0];
      assert.ok(cell.includes("<img ") && cell.includes("Docs: ") && cell.includes("utm_content=" + s), `${s} cell`);
    }
    datedRow("D-README-GW-GALLERY-1", "galeri tarzinda neden yapmadin");
  });

  test("README Use cases add the output-filter rows, and Longer sessions is a story in whole sentences (D-README-STORY-1)", () => {
    // Owner 2026-11-02: "Longer sessions bu kismi iyilestir ... surekli yarim kalmis cumleler ve rakamlar var".
    const readme = readRepo("README.md");
    const uc = readme.slice(readme.indexOf("\n## Use cases\n"), readme.indexOf("\n## Benchmarks\n"));
    const bench = JSON.parse(readRepo("bench/results/2026-11-01-darwin-arm64.json"));
    for (const id of ["f-bash-dump-post", "d-real-git-log", "d-real-github-json", "f-read-large-file", "f-read-big-source"]) {
      const m = bench.results.find((x) => x.id === id).metrics;
      assert.ok(uc.includes(`| ${m.raw_bytes.median.toLocaleString("en-US")} B | ${m.ctx_bytes.median.toLocaleString("en-US")} B |`), `Use cases lack ${id}`);
    }
    const ls = readme.slice(readme.indexOf("\n### Longer sessions\n") + 1, readme.indexOf("\n### Speed\n"));
    const prose = ls.split("\n").slice(1).filter((l) => l.trim() && !l.startsWith("<") && !l.startsWith(" "));
    assert.ok(prose.length >= 3, "story paragraphs");
    for (const l of prose) {
      assert.ok(!l.startsWith("- "), `bullet in Longer sessions: ${l}`);
      assert.ok(l.endsWith(".") || l.endsWith(".)") || l.endsWith(")."), `line ends mid-sentence: ${l.slice(-60)}`);
    }
    for (const n of ["442,893 B", "2,019 B", "666,796 B", "3,380 B", "e-long-session", "d-synth-1m", "compaction"]) assert.ok(ls.includes(n), `Longer sessions lack ${n}`);
    datedRow("D-README-STORY-1", "Longer sessions bu kismi iyilestir");
  });

  test("README privacy: every data-stays or telemetry line before the Gateway names the plugin; the Gateway section links its privacy page (D-README-PRIVACY-2)", () => {
    // Owner 2026-11-01: "Konu Gateway section'ina gelene kadar free, local, privacy, no telemetry, forever vs daha cok vurgulayalim".
    // The plugin claim must read as a plugin claim: requests to the Gateway pass through its server.
    const readme = readRepo("README.md");
    const gwAt = readme.indexOf("\n## Context Mode Gateway\n");
    for (const line of readme.slice(0, gwAt).split("\n")) {
      const l = line.toLowerCase();
      if (l.includes("telemetry") || l.includes("your data") || l.includes("all data")) assert.ok(l.includes("plugin"), `privacy line lacks "plugin": ${line.slice(0, 100)}`);
    }
    const gw = readme.slice(gwAt, readme.indexOf("\n## License\n"));
    assert.ok(gw.includes("The Gateway sends your requests to its server on the way to the model."), "Gateway section says where requests go");
    assert.ok(gw.includes("https://contextmode.ai/privacy?utm_source=github&utm_medium=readme&utm_content=privacy"), "Gateway section links its privacy page");
    devRow("D-README-PRIVACY-2", "free, local, privacy, no telemetry");
  });

  test("README prose names the product contextmode; context-mode stays in commands, code, URLs, link targets and HTML tags (D-README-NAME-1)", () => {
    // Owner 2026-11-03: "context-mode degil ismimiz artik contextmode buna gore guncelleyelim"; "context-mode u sadece readme de fixle simdilik".
    // The npm package, the repo, the command and the data folder keep the name context-mode, so those places still work.
    const readme = readRepo("README.md");
    const drop = (s, open, close) => {
      let out = "", at = 0;
      for (let i = s.indexOf(open); i >= 0; i = s.indexOf(open, at)) {
        const end = s.indexOf(close, i + open.length);
        if (end < 0) break;
        out += s.slice(at, i) + " ";
        at = end + close.length;
      }
      return out + s.slice(at);
    };
    const prose = (line) => ["https://", "http://"].reduce((s, p) => drop(s, p, " "), drop(drop(drop(line, "`", "`"), "<", ">"), "](", ")") + " ");
    const bad = [];
    let fence = false;
    readme.split("\n").forEach((line, i) => {
      if (line.trimStart().startsWith("```")) fence = !fence;
      else if (!fence && prose(line).includes("context-mode")) bad.push(`${i + 1}: ${line.slice(0, 120)}`);
    });
    assert.deepEqual(bad, [], "README prose writes the product name as contextmode");
    const install = readme.slice(readme.indexOf("\n## Install\n"), readme.indexOf("<details id=\"install-"));
    assert.ok(install.includes("contextmode installs as the npm package and command `context-mode`."), "Install says which name npm and the shell use");
    devRow("D-README-NAME-1", "ismimiz artik contextmode");
  });
});

describe("ADR-0015 repo: README stats job and brand (D-README-STATS-1)", () => {
  // Owner 2026-11-01: counts live in badges and in one star chart that a daily job renders; the hero holds no live count.
  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const readRepo = (rel) => readFileSync(path.join(REPO, rel), "utf8");
  const SRC = "docs/assets/readme/src/";

  test("starTimeline: one point per day from the first star day, cumulative to the end of that day; last point is the total (D-README-STAR-1)", async () => {
    const { starTimeline } = await import("../build/readme-stats.mjs");
    const at = ["2026-02-23T06:21:45Z", "2026-02-23T23:59:59Z", "2026-02-25T01:00:00Z", "2026-03-02T00:00:01Z", "2026-03-04T10:00:00Z"];
    assert.deepEqual(starTimeline(at, "2026-03-05", 5), [["2026-02-23", 2], ["2026-02-24", 2], ["2026-02-25", 3], ["2026-02-26", 3], ["2026-02-27", 3],
      ["2026-02-28", 3], ["2026-03-01", 3], ["2026-03-02", 4], ["2026-03-03", 4], ["2026-03-04", 5], ["2026-03-05", 5]]);
    assert.deepEqual(starTimeline([], "2026-03-05", 0), [["2026-03-05", 0]]);
    assert.deepEqual(starTimeline(at, "2026-02-25", 6), [["2026-02-23", 2], ["2026-02-24", 2], ["2026-02-25", 6]], "the read day is the total");
  });

  test("statsJson: fields named by what they count, no users label", async () => {
    const { statsJson } = await import("../build/readme-stats.mjs");
    assert.deepEqual(statsJson({ npmDownloads: 683261, stars: 33053, readAt: "2026-11-01" }), { npm_downloads: 683261, stars: 33053, read_at: "2026-11-01" });
    assert.throws(() => statsJson({ npmDownloads: -1, stars: 1, readAt: "2026-11-01" }), /npm_downloads/);
    assert.throws(() => statsJson({ npmDownloads: 1, stars: 1.5, readAt: "2026-11-01" }), /stars/);
    assert.throws(() => statsJson({ npmDownloads: 1, stars: 1, readAt: "yesterday" }), /read_at/);
  });

  test("adoption history: v1 counts, traffic days, npm version split, merge by day keeps every old day (D-README-HISTORY-1)", async () => {
    // Owner 2026-11-03: "claude code kurulumunda hic npm e gerek yoksa biz claude code kurulumunlarinin stats ini nasil alacagiz?"
    // GitHub keeps traffic for 14 days only, so each day the job does not save is gone; the file keeps every day it ever read.
    const H = await import("../build/readme-stats.mjs");
    assert.equal(H.HISTORY_FILE, "docs/assets/readme/data/adoption-history.json");
    assert.deepEqual(["63.3k+", "766.8k+", "211", "1.2M+", "2.4k", "", "{\"message\":\"Resource", undefined].map(H.v1Count), [63300, 766800, 211, 1200000, 2400, null, null, null]);
    const body = { count: 10, uniques: 6, clones: [{ timestamp: "2026-11-02T00:00:00Z", count: 4, uniques: 3 }, { timestamp: "2026-11-01T00:00:00Z", count: 5, uniques: 2 },
      { timestamp: "2026-11-03T00:00:00Z", count: 1, uniques: 1 }] };
    assert.deepEqual(H.trafficDays(body, "clones", "2026-11-03"), [["2026-11-01", 5, 2], ["2026-11-02", 4, 3]], "oldest first; the read day is partial and waits for the next read");
    assert.throws(() => H.trafficDays({}, "views", "2026-11-03"), /views/);
    assert.deepEqual(H.trafficWindow(body, "2026-11-03"), ["2026-11-03", 10, 6], "the 14-day totals GitHub gives with the days");
    assert.throws(() => H.trafficWindow({ count: 1 }, "2026-11-03"), /uniques/);
    assert.deepEqual(H.versionSplit({ package: "context-mode", downloads: { "1.0.169": 30, "1.0.168": 5, "2.0.0-next.33": 4, "0.9.1": 1 } }), { v1: 35, next: 4, other: 1, versions: 4 });
    assert.throws(() => H.versionSplit({}), /downloads/);
    const old = { read_at: "2026-11-01", github_clones: [["2026-10-01", 7, 6], ["2026-10-31", 1, 1]], v1_marketplace: [["2026-02-25", 211, "abc"]] };
    const fresh = { read_at: "2026-11-03", github_clones: [["2026-10-31", 9, 4], ["2026-11-02", 4, 3]], stars: [["2026-11-03", 33100]] };
    const m = H.mergeHistory(old, fresh);
    assert.deepEqual(m.github_clones, [["2026-10-01", 7, 6], ["2026-10-31", 9, 4], ["2026-11-02", 4, 3]], "union by day; the newer read wins its day; old days stay");
    assert.deepEqual(m.v1_marketplace, old.v1_marketplace, "a series missing from the new read stays whole");
    assert.deepEqual(m.stars, [["2026-11-03", 33100]]);
    assert.equal(m.read_at, "2026-11-03");
    for (const k of H.HISTORY_SERIES) assert.ok(typeof m.series[k] === "string" && Array.isArray(m[k]), `${k}: described and present`);
    assert.equal(H.historyDue({ read_at: "2026-11-03" }, "2026-11-03"), false, "one read a day");
    assert.equal(H.historyDue({ read_at: "2026-11-02" }, "2026-11-03"), true);
    assert.equal(H.historyDue({}, "2026-11-03"), true);
    // The v1 backfill: the 'marketplace' field of stats.json on main, one value per UTC day (the day's last commit), sha as the source.
    const log = [{ sha: "c3", at: "2026-02-26T09:00:00+03:00" }, { sha: "c2", at: "2026-02-25T13:33:48+03:00" }, { sha: "c1", at: "2026-02-25T10:34:31+00:00" }];
    const files = { c1: "{\"marketplace\":\"{\\\"message\\\":\\\"Resource\"}", c2: "{\"marketplace\":\"211\"}", c3: "{\"marketplace\":\"1.1k+\"}" };
    assert.deepEqual(H.v1Series(log, (s) => files[s]), [["2026-02-25", 211, "c2"], ["2026-02-26", 1100, "c3"]], "last readable commit of each UTC day");
  });

  test("adoption history file: every series sorted by day, one row a day, 14 traffic days and the v1 backfill with commit shas (D-README-HISTORY-1)", async () => {
    const H = await import("../build/readme-stats.mjs");
    const h = JSON.parse(readRepo(H.HISTORY_FILE));
    for (const k of H.HISTORY_SERIES) {
      const days = h[k].map((r) => r[0]);
      assert.deepEqual(days, [...new Set(days)].sort(), `${k}: sorted, one row a day`);
    }
    assert.ok(h.github_clones.length >= 13 && h.github_views.length >= 13, "the 14-day traffic window, less the partial read day");
    assert.ok(h.v1_marketplace.length >= 100, "the v1 backfill");
    assert.ok(h.github_clones_14d.length >= 1 && h.github_views_14d.length >= 1, "the 14-day windows as GitHub gives them");
    for (const r of h.v1_marketplace) assert.ok(Number.isInteger(r[1]) && r[2].length === 40, `v1 row ${r[0]} names its commit`);
  });

  test("readme-stats.yml: capture job daily, on each v2-design push and by hand; README job main only; commits only on change (D-README-STATS-1, D-README-HISTORY-1)", () => {
    const y = readRepo(".github/workflows/readme-stats.yml");
    for (const need of ["schedule:", "cron:", "workflow_dispatch:", "contents: write", "secrets.GITHUB_TOKEN", "if: github.ref == 'refs/heads/main'",
      "build/readme-stats.mjs", "render.mjs star-history", "git diff --quiet", "PLAYWRIGHT_DIR",
      "push:", "branches: [v2-design]", "paths-ignore:", "concurrency:", "node build/readme-stats.mjs --history"]) assert.ok(y.includes(need), `readme-stats.yml lacks ${need}`);
    assert.ok(!y.includes("curl "), "readme-stats.yml has curl");
    const secrets = y.split("secrets.").slice(1).map((s) => s.split(" ")[0]);
    assert.deepEqual(secrets, ["TRAFFIC_TOKEN", "GITHUB_TOKEN"], "TRAFFIC_TOKEN reads traffic; GITHUB_TOKEN reads stars for the README job");
    const capture = y.slice(y.indexOf("\n  capture:"), y.indexOf("\n  readme-stats:"));
    assert.ok(capture.includes("GH_TOKEN: ${{ secrets.TRAFFIC_TOKEN }}"), "gh api reads traffic with TRAFFIC_TOKEN");
    assert.ok(capture.includes("git add \"$F\"") && !capture.includes("README") && !capture.includes("git add ."), "capture commits the history file only");
    const ignore = y.slice(y.indexOf("paths-ignore:"), y.indexOf("workflow_dispatch:"));
    assert.ok(ignore.includes("docs/assets/readme/data/adoption-history.json"), "its own output starts no run");
    assert.ok(y.split("\n").slice(0, 8).join("\n").includes("default branch"), "header: scheduled jobs run only on the default branch");
  });

  test("README npm badge reads the npm downloads API with a label that says what it counts; no users or marketplace badge, no live count in the hero (D-README-GW-CALM-1)", () => {
    const readme = readRepo("README.md");
    // main holds the v1 stats.json (no npm_downloads field), so a badge on stats.json@main showed "no result".
    // The npm API answers on every branch; last-year covers every download since the package began (2026-02-23) until 2027-02-23.
    // Owner 2026-11-02: "bunu K ekle bu rakamlar okunmuyor". shields prints the count in K.
    // D-README-COUNT-1: npm/dt (all time) so the badge and the 683K total in the README name the same count; npm/dy (last year) differs.
    const badge = "https://img.shields.io/npm/dt/context-mode?label=npm%20downloads";
    assert.ok(readme.includes(badge), "npm downloads badge is shields npm/dt with the label 'npm downloads'");
    assert.ok(!readme.includes("img.shields.io/npm/dy/"), "the last-year badge is gone (D-README-COUNT-1)");
    assert.ok(!readme.includes("badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org"), "the full-digit badge is gone");
    datedRow("D-README-BADGE-K-1", "bunu K ekle bu rakamlar okunmuyor");
    assert.ok(!readme.includes("stats.json&query"), "no badge reads stats.json");
    for (const bad of ["query=%24.message", "query=%24.marketplace", "label=users", "747.4k", "683.2k", "64.1k", "33,053"]) assert.ok(!readme.includes(bad), `README has ${bad}`);
    const hero = readRepo(SRC + "hero.html");
    for (const bad of ["Users", "GitHub stars", "33,053", "747.4k", "683.2k"]) assert.ok(!hero.includes(bad), `hero.html has ${bad}`);
  });

  test("README hero: three measured outcomes from the bench file, each naming its row; agents and tools only in small text (D-README-HERO-2)", () => {
    // Owner 2026-11-02: "image de su 99.4 rakami disindakilar business value katmiyor ... kocaman 10 yaziyor kime ne?".
    const hero = readRepo(SRC + "hero.html");
    const readme = readRepo("README.md");
    const bench = JSON.parse(readRepo("bench/results/2026-11-01-darwin-arm64.json"));
    const text = (html) => { let out = "", tag = false; for (const ch of html) { if (ch === "<") tag = true; else if (ch === ">") tag = false; else if (!tag) out += ch; } return out; };
    const row = (id) => bench.results.find((x) => x.id === id).metrics;
    const big = bench.results.filter((r) => r.ok && r.metrics.raw_bytes && r.metrics.ctx_bytes && r.metrics.raw_bytes.median >= 10240);
    const s = big.map((r) => 100 * (1 - r.metrics.ctx_bytes.median / r.metrics.raw_bytes.median)).sort((a, b) => a - b);
    const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    const k = (b) => Math.round(b / 4 / 1000) + "K"; // tokens at 4 B per token, an estimate
    const t = (b) => String(Math.round(b / 4));
    const g = row("g-session-total"), e = row("e-long-session");
    const tiles = hero.split('<div class="tile"').slice(1).map((x) => x.slice(0, x.indexOf("</div>\n")));
    assert.equal(tiles.length, 3, "three tiles");
    const nums = tiles.map((x) => text(x.slice(x.indexOf('<div class="n">'), x.indexOf("</div>", x.indexOf('<div class="n">')))).trim());
    assert.deepEqual(nums, [med.toFixed(1) + "%", `${k(g.raw_bytes.median)} → ${t(g.ctx_bytes.median)}`, `${k(e.raw_bytes.median)} → ${t(e.resume_bytes.median)}`]);
    for (const [i, need] of [[0, String(big.length)], [1, "g-session-total"], [1, g.raw_bytes.median.toLocaleString("en-US") + " B"], [1, g.ctx_bytes.median.toLocaleString("en-US") + " B"], [1, "4 B per token"],
      [2, "e-long-session"], [2, e.raw_bytes.median.toLocaleString("en-US") + " B"], [2, e.resume_bytes.median.toLocaleString("en-US") + " B"], [2, "4 B per token"]]) assert.ok(text(tiles[i]).includes(need), `tile ${i + 1} lacks ${need}`);
    for (const bad of ['<div class="k">Coding agents', '<div class="k">MCP tools', '<div class="n">10<', '<div class="n">9<']) assert.ok(!hero.includes(bad), `hero.html still has ${bad}`);
    assert.ok(hero.includes('class="small"') && hero.includes("Claude Code") && hero.includes("9 MCP tools"), "agents and tools sit in small text");
    const alt = readme.slice(readme.indexOf('src="docs/assets/readme/hero-light.png" alt="') + 46).split('"')[0];
    for (const need of ["99.4%", "g-session-total", "e-long-session", "estimate"]) assert.ok(alt.includes(need), `hero alt lacks ${need}`);
    datedRow("D-README-HERO-2", "kocaman 10 yaziyor kime ne");
  });

  test("render guard: the page must say it drew 2+ points and a non-empty path, else render.mjs exits 1 (D-README-STAR-1)", async () => {
    const { drawProblems } = await import("../" + SRC + "render-guard.mjs");
    assert.deepEqual(drawProblems({ points: 252, pathLength: 4100 }), []);
    assert.deepEqual(drawProblems(undefined), ["no drawn signal from the page"], "a page script that threw never sets the signal");
    assert.deepEqual(drawProblems({ points: 1, pathLength: 10 }), ["fewer than 2 data points: 1"]);
    assert.deepEqual(drawProblems({ points: 30, pathLength: 0 }), ["drawn path is empty"]);
    const r = readRepo(SRC + "render.mjs");
    for (const need of ["waitForFunction", "__drawn", "drawProblems(", "chartInkProblems("]) assert.ok(r.includes(need), `render.mjs lacks ${need}`);
    assert.ok(readRepo(SRC + "star-history.html").includes("window.__drawn="), "star-history.html sets the drawn signal after it draws");
    assert.ok(readRepo(".github/workflows/readme-stats.yml").includes("node docs/assets/readme/src/render.mjs star-history"), "the daily job uses the same guarded render");
  });

  test("star chart PNGs: the chart area of both themes carries the drawn curve, not an empty band (D-README-STAR-1)", async () => {
    const { chartInkProblems, decodePng, inkShare, STAR_CHART } = await import("../" + SRC + "render-guard.mjs");
    for (const theme of ["dark", "light"]) {
      const buf = readFileSync(path.join(REPO, "docs/assets/readme/star-history-" + theme + ".png"));
      const img = decodePng(buf);
      assert.deepEqual([img.width, img.height], [2560, 1280], theme + ": 1280x640 at 2x");
      assert.deepEqual(chartInkProblems(buf, theme), [], theme);
      // The lower half of the chart (where the area under the curve sits) must not be empty either.
      const c = STAR_CHART.css;
      const low = inkShare(img, { x: c.x * 2, y: (c.y + c.h / 2) * 2, w: c.w * 2, h: (c.h / 2) * 2 }, STAR_CHART.bg[theme], 8);
      assert.ok(low > 0.2, theme + ": lower chart half has the filled area, share " + low.toFixed(3));
    }
  });

  test("figure sources: 10 px card radius, 12 px eyebrows, no upper-casing, hex colors only from the brand tokens, render at 2x", () => {
    // Palette = every "hex" in contextmode.ai/brand tokens.json (2026-10-08) that the figures may use.
    const TOKENS = ["#0a0a0a", "#3f3f46", "#6b6b74", "#a1a1aa", "#e4e4e7", "#efeff1", "#d4d4d8", "#ffffff", "#fafafa", "#f4f4f5", "#1a56db", "#e8effc",
      "#143faa", "#0e9f6e", "#ecfdf5", "#31c48d", "#e5484d", "#fef2f2", "#fecaca", "#bbf7d0", "#dbe7ff", "#141416", "#27272a", "#8b8b93", "#71717a",
      "#111113", "#232326", "#18181b", "#26262a", "#93c5fd", "#fbbf24", "#6ee7b7", "#fca5a5", "#d77757", "#0b0b0c", "#4ade80", "#f87171", "#e7f5f1", "#e8eefb"];
    const files = readdirSync(path.join(REPO, SRC)).filter((f) => f.endsWith(".html") || f.endsWith(".css"));
    assert.ok(files.includes("cm.css") && files.includes("hero.html"));
    for (const f of files) {
      const t = readRepo(SRC + f);
      assert.ok(!t.includes("text-transform"), `${f}: no text-transform`);
      assert.ok(!t.includes("border-radius:12px"), `${f}: card radius is 10px`);
      for (let i = t.indexOf("#"); i >= 0; i = t.indexOf("#", i + 1)) {
        const hex = t.slice(i, i + 7).toLowerCase();
        if (hex.length === 7 && [...hex.slice(1)].every((c) => "0123456789abcdef".includes(c))) assert.ok(TOKENS.includes(hex), `${f}: ${hex} is not a brand token`);
      }
    }
    const css = readRepo(SRC + "cm.css");
    assert.ok(css.includes(".box{") && css.includes("border-radius:10px"));
    assert.ok(css.includes(".eyebrow{font-family:var(--mono);font-size:12px"));
    assert.ok(readRepo(SRC + "render.mjs").includes("deviceScaleFactor: 2"));
  });

  // Owner 2026-11-02: "Star history gibi bir de npm indirme istiyorum ... haftalik gunluk ve aylik ve senelik npm indirmesini versin bana tab sekilde olsun" (D-README-NPM-1).
  test("README Adoption sits right after Why: star chart and npm grid side by side, both linked to the interactive stats page, no npm tabs in the README (D-README-ADOPT-1)", () => {
    // Owner 2026-11-02: "Adaption cok altlarda kalmis" and "daily, weekly diye collapse yapmamiza gerek yok tab sistemi olsa daha iyi olur".
    const readme = readRepo("README.md");
    const at = readme.indexOf("\n## Adoption: stars and npm downloads\n");
    assert.ok(at > readme.indexOf("\n## Why\n") && at < readme.indexOf("\n## Install\n"), "Adoption sits between Why and Install");
    const sec = readme.slice(at, readme.indexOf("\n## Install\n"));
    assert.ok(!readme.includes('<details name="npm"') && !readme.includes("<details open name=\"npm\""), "no npm details blocks");
    const table = sec.slice(sec.indexOf("<table>"), sec.indexOf("</table>"));
    assert.equal(table.split("<td").length - 1, 2, "one row, two cells");
    const cells = table.split("<td").slice(1);
    assert.ok(cells[0].includes("star-history-dark.png") && cells[0].includes("star-history-light.png"), "left cell: star chart");
    assert.ok(cells[1].includes("npm-downloads-dark.png") && cells[1].includes("npm-downloads-light.png"), "right cell: npm downloads per day");
    assert.ok(cells[1].includes("npm downloads per day") && !cells[1].includes("2x2"), "right cell alt names the one daily chart (D-README-COUNT-1)");
    const page = "https://contextmode.ai/open-source/stats?utm_source=github&utm_medium=readme&utm_content=adoption";
    assert.ok(cells[0].includes('href="' + page + '#stars"') && cells[1].includes('href="' + page + '#daily"'), "both charts open the stats page on their tab");
    assert.ok(sec.split("\n").some((l) => l.includes(page) && l.includes("interactive")), "one line points to the interactive page");
    for (const need of ["stargazers-light.png", "**Hacker News.**", "**GitHub Trending.**"]) assert.ok(sec.includes(need), `Adoption lacks ${need}`);
    datedRow("D-README-ADOPT-1", "Adaption cok altlarda kalmis");
  });

  test("README top: four badges, a one-line count from stats.json under them, the plugin named as the free part (D-README-COUNT-1)", () => {
    // Owner 2026-11-02: "Adaption cok altlarda kalmis"; "FREE'den ayri bir urun oldugunu bilmeleri gerek".
    const readme = readRepo("README.md");
    const lines = readme.split("\n");
    const badges = lines.find((l) => l.startsWith("[![npm downloads]"));
    assert.equal(badges.split("[![").length - 1, 4, "badge row: npm downloads, stars, Discord, license");
    for (const bad of ["Hacker%20News", "GitHub-Trending"]) assert.ok(!badges.includes(bad), `badge row has ${bad}; the Adoption bullets hold it`);
    const stats = JSON.parse(readRepo("stats.json"));
    const k = (n) => Math.round(n / 1000) + "K";
    const count = lines.find((l) => l.startsWith("**" + k(stats.stars) + " GitHub stars"));
    assert.ok(count && lines.indexOf(count) < lines.findIndex((l) => l.startsWith("## ")), "a count line from stats.json sits above the first section");
    for (const need of [k(stats.npm_downloads) + " npm downloads", stats.read_at, "(stats.json)", "#adoption-stars-and-npm-downloads"]) assert.ok(count.includes(need), `count line lacks ${need}`);
    assert.ok(lines[2].includes("The plugin is free forever"), "the tagline names the plugin as the free part");
    const why = readme.slice(readme.indexOf("\n## Why\n"), readme.indexOf("\n## Adoption"));
    assert.ok(why.includes("The Context Mode plugin runs that work"), "Why names the plugin");
    const install = readme.slice(readme.indexOf("\n## Install\n"), readme.indexOf("<details id=\"install-"));
    assert.ok(!install.includes("Every command installs"), "Install intro opens with the commands, the tag line follows");
    const gw = readme.slice(readme.indexOf("\n## Context Mode Gateway\n"), readme.indexOf("\n## License\n"));
    assert.ok(gw.split("\n").some((l) => l.includes("npx @context-mode/cli") && l.includes("own subscription")), "the Gateway setup line names its subscription");
    datedRow("D-README-COUNT-1", "Adaption cok altlarda kalmis");
  });

  test("npm downloads data: 500-day API chunks, ISO weeks from Monday, complete weeks and months only, year totals plus the running total (D-README-NPM-1)", async () => {
    const { rangeChunks, weekStart, aggregate, fmtK } = await import("../build/npm-downloads.mjs");
    assert.deepEqual(rangeChunks("2026-02-23", "2026-03-01"), [["2026-02-23", "2026-03-01"]]);
    const long = rangeChunks("2025-01-01", "2026-11-01");
    assert.deepEqual(long, [["2025-01-01", "2026-05-15"], ["2026-05-16", "2026-11-01"]], "500 days per call, under the 18-month API limit, joined end to end");
    assert.equal(weekStart("2026-03-01"), "2026-02-23", "Sunday belongs to the week that starts on Monday");
    assert.equal(weekStart("2026-02-23"), "2026-02-23");
    const days = [];
    for (let t = Date.parse("2026-02-23"), i = 1; t <= Date.parse("2026-04-08"); t += 86_400_000, i++) days.push([new Date(t).toISOString().slice(0, 10), i]);
    const a = aggregate(days.filter((d) => d[0] !== "2026-03-10"), "2026-04-09");
    assert.equal(a.first, "2026-02-23");
    assert.equal(a.last, "2026-04-08");
    assert.equal(a.read_at, "2026-04-09");
    assert.equal(a.daily.length, 45, "a gap day counts as 0, so the daily list stays contiguous");
    assert.deepEqual(a.daily.find((d) => d[0] === "2026-03-10"), ["2026-03-10", 0]);
    assert.deepEqual(a.weekly.map((w) => w[0]), ["2026-02-23", "2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"], "the week of 2026-04-06 is not over on 04-08");
    assert.deepEqual(a.weekly[0], ["2026-02-23", 1 + 2 + 3 + 4 + 5 + 6 + 7]);
    assert.deepEqual(a.monthly.map((m) => m[0]), ["2026-02", "2026-03"], "April is not over on 04-08");
    const total = days.reduce((s, d) => s + d[1], 0) - 16;
    assert.equal(a.total, total);
    assert.deepEqual(a.yearly, [["2026", total]]);
    assert.deepEqual(a.running.map((r) => r[0]), ["2026-02", "2026-03", "2026-04"]);
    assert.equal(a.running[a.running.length - 1][1], total, "the running total ends at the total");
    const many = [];
    for (let t = Date.parse("2026-01-01"); t <= Date.parse("2026-12-31"); t += 86_400_000) many.push([new Date(t).toISOString().slice(0, 10), 1]);
    assert.equal(aggregate(many, "2027-01-01").daily.length, 90, "daily keeps the last 90 days");
    const tail = aggregate([["2026-10-28", 5], ["2026-10-29", 0], ["2026-10-30", 7], ["2026-10-31", 0], ["2026-11-01", 0]], "2026-11-02");
    assert.equal(tail.last, "2026-10-30", "the API answers 0 for days it has not counted yet; the data ends on the last day with downloads");
    assert.deepEqual(tail.daily, [["2026-10-28", 5], ["2026-10-29", 0], ["2026-10-30", 7]], "a 0 inside the range stays");
    assert.deepEqual([fmtK(950), fmtK(1499), fmtK(683261), fmtK(33070), fmtK(1250000)], ["950", "1K", "683K", "33K", "1.3M"]);
  });

  test("npm downloads charts: one page draws the four views as a 2x2 grid, render.mjs renders it, the daily job fetches and renders it (D-README-NPM-1, D-README-ADOPT-1)", () => {
    const html = readRepo(SRC + "npm-downloads.html");
    for (const need of ["npm-data.js", "window.__drawn=", "daily", "weekly", "monthly", "yearly", "api.npmjs.org"]) assert.ok(html.includes(need), `npm-downloads.html lacks ${need}`);
    const data = readRepo(SRC + "npm-data.js");
    assert.ok(data.startsWith("// Written by build/npm-downloads.mjs. Run that script to update it.\nvar NPM="));
    const npm = JSON.parse(data.slice(data.indexOf("var NPM=") + 8, data.lastIndexOf(";")));
    for (const k of ["read_at", "first", "last", "total", "daily", "weekly", "monthly", "yearly", "running"]) assert.ok(k in npm, `npm-data.js lacks ${k}`);
    assert.equal(npm.first, "2026-02-23", "first publish day of context-mode (npm view context-mode time.created)");
    const r = readRepo(SRC + "render.mjs");
    // D-README-COUNT-1: the README cell is half the page wide, so it shows one chart (per day); weeks, months and years live on the stats page.
    assert.ok(r.includes("{ name: 'npm-downloads', view: 'daily'"), "render.mjs renders the daily view for the README");
    for (const v of ["daily", "weekly", "monthly", "yearly"]) assert.ok(!r.includes("name: 'npm-" + v + "'"), `render.mjs still renders npm-${v}`);
    assert.ok(html.includes('VIEW==="grid"'), "npm-downloads.html draws the grid view");
    const y = readRepo(".github/workflows/readme-stats.yml");
    for (const need of ["node build/npm-downloads.mjs", "render.mjs star-history npm-downloads", "playwright sharp"]) assert.ok(y.includes(need), `readme-stats.yml lacks ${need}`);
  });

  test("npm downloads PNGs: one grid image per theme at 2x carries the drawn charts, the 8 single PNGs are gone, and every README figure stays under the image budget (D-README-NPM-1, D-README-ADOPT-1)", async () => {
    const { chartInkProblems, decodePng } = await import("../" + SRC + "render-guard.mjs");
    const { README_IMAGES_MAX_BYTES, readmeImageBytes } = await import("../build/readme-links.mjs");
    for (const v of ["daily", "weekly", "monthly", "yearly"]) for (const theme of ["dark", "light"]) {
      assert.ok(!existsSync(path.join(REPO, "docs/assets/readme/npm-" + v + "-" + theme + ".png")), "single npm PNG left: " + v + " " + theme);
    }
    for (const theme of ["dark", "light"]) {
      const buf = readFileSync(path.join(REPO, "docs/assets/readme/npm-downloads-" + theme + ".png"));
      const img = decodePng(buf);
      assert.deepEqual([img.width, img.height], [2560, 1280], theme + ": 1280x640 at 2x");
      assert.deepEqual(chartInkProblems(buf, theme), [], theme);
      assert.ok(buf.length <= 120 * 1024, theme + ": palette PNG, " + buf.length + " bytes");
    }
    assert.ok(readmeImageBytes(REPO) <= README_IMAGES_MAX_BYTES, "README figures " + readmeImageBytes(REPO) + " bytes");
  });
});

describe("ADR-0014 issue intake: score, one comment, issue state stays with maintainers (D-INTAKE-SCORE-1)", () => {
  // Owner 2026-11-05: "bu GitHub Actions bot u cok kati calisiyor ... User 2 kez issue acmis issue ise gayet net kodlarina
  // kadar vermis." #1306 and #1307 held steps, output and the source line; the first check closed them for a heading.
  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const readRepo = (rel) => readFileSync(path.join(REPO, rel), "utf8");
  const intake = () => import("../.github/scripts/issue-intake.mjs");
  const act = () => import("../.github/scripts/issue-intake-act.mjs");
  // The body GitHub writes for agent-report.yml when the reporter fills nothing.
  const emptyForm = () => {
    const out = [];
    for (const b of readRepo(".github/ISSUE_TEMPLATE/agent-report.yml").split("\n  - type: ").slice(1)) {
      const at = b.indexOf("label: ");
      if (at === -1) continue;
      const label = b.slice(at + 7, b.indexOf("\n", at)).trim();
      out.push(`### ${label}`, "", b.includes("render: text") ? "```text\n\n```" : "_No response_", "");
    }
    return out.join("\n");
  };

  for (const n of ["1304", "1306", "1307"]) {
    test(`#${n} (real body) scores repro-ready`, async () => {
      const { score } = await intake();
      const r = score(readRepo(`tests/fixtures/issue-intake/${n}.md`));
      assert.equal(r.status, "repro-ready", JSON.stringify(r));
      for (const k of ["version", "agent", "os", "steps", "expected", "observed", "output"]) assert.ok(r.have[k], `#${n} ${k}`);
    });
  }

  test("an empty agent-report form scores needs-info and lists every item", async () => {
    const { score, ITEMS } = await intake();
    const body = emptyForm();
    assert.ok(body.includes("### ctx-report") && body.includes("### Steps"), body);
    const r = score(body);
    assert.equal(r.status, "needs-info");
    assert.deepEqual(r.missing, ITEMS.map((i) => i.key));
    assert.equal(score("").status, "needs-info");
  });

  test("the AGENT_ISSUE.md fill-in template scores needs-info; the filled example scores repro-ready with every item", async () => {
    const { score } = await intake();
    const text = readRepo(".github/AGENT_ISSUE.md");
    const block = (head) => { const a = text.indexOf("````\n", text.indexOf(head)) + 5; return text.slice(a, text.indexOf("\n````", a)); };
    assert.equal(score(block("## 5. Fill in this template")).status, "needs-info");
    const r = score(block("## 6. A filled example"));
    assert.deepEqual([r.status, r.missing], ["repro-ready", []]);
  });

  test("the doctor table counts in a fenced block under any heading, with 3 or 4 columns", async () => {
    const { score } = await intake();
    const table = ["```", "| Check | Status | Detail |", "|---|---|---|", "| D1 version | PASS | 2.0.0 |", "```"].join("\n");
    assert.ok(score("## Doctor output\n\n" + table).have.report);
    assert.ok(score("D1 version | PASS | ok\nD2 node | PASS | ok\nD3 host config | FAIL | x").have.report);
    assert.equal(score("## Notes\n\nall fine").have.report, false);
  });

  test("version, agent, Node and steps read from free text by substring and digit walk", async () => {
    const { score, versionAfter, isPlaceholder } = await intake();
    assert.ok(versionAfter("context-mode version: 2.0.0", "context-mode"));
    assert.ok(versionAfter("installed context-mode@2.0.1", "context-mode"));
    assert.equal(versionAfter("context-mode version: <x.y.z>", "context-mode"), false);
    assert.equal(versionAfter("my-context-mode 2", "context-mode"), false);
    assert.ok(versionAfter("opencode version: 2.2.5", "opencode"));
    assert.ok(versionAfter("node v24.21.0", "node"));
    assert.ok(isPlaceholder("Node version: <vXX.Y.Z>") && isPlaceholder("_No response_") && isPlaceholder("1. <fresh project>"));
    assert.equal(isPlaceholder("Node version: v24.21.0"), false);
    const r = score("1. run x\n2. run y\n\ncontext-mode 2.0.2\n\n```\n$ x\nboom\n```");
    assert.deepEqual([r.status, r.have.steps, r.have.version, r.have.output], ["repro-ready", true, true, true]);
    assert.equal(score("1. run x\n\ncontext-mode 2.0.2\n\n```\nboom\n```").status, "needs-info", "one step is too few");
  });

  test("a secret prefix adds a note to the comment and leaves the status as scored", async () => {
    const { score } = await intake();
    const { commentBody } = await act();
    const r = score("1. a\n2. b\ncontext-mode 2.0.2\n```\nGITHUB_TOKEN=github_pat_x\n```");
    assert.equal(r.status, "repro-ready");
    assert.deepEqual(r.warnings, ["github_pat_", "TOKEN="]);
    assert.ok(commentBody(r).includes("`github_pat_` appears in the body"));
  });

  test("plan(): one comment found by its marker and edited in place; a second run with the same score does nothing", async () => {
    const { score } = await intake();
    const { plan, MARKER, commentBody } = await act();
    const result = score(emptyForm());
    const first = plan({ result, author: "NONE", labels: ["bug"], comments: [] });
    assert.deepEqual(first.actions.map((a) => a.op), ["label-create", "label-add", "comment-create"]);
    assert.equal(first.actions[0].name, "needs-info");
    const body = commentBody(result);
    assert.ok(body.startsWith(MARKER) && body.includes("- [ ] **ctx_doctor report**"), body);
    const own = { id: 7, body, bot: true, assoc: "NONE" };
    assert.deepEqual(plan({ result, author: "NONE", labels: ["bug", "needs-info"], comments: [own] }).actions, []);
    const ready = score(readRepo("tests/fixtures/issue-intake/1307.md"));
    const next = plan({ result: ready, author: "NONE", labels: ["bug", "needs-info", "no-report"], comments: [own] });
    assert.deepEqual(next.actions.map((a) => a.op + " " + (a.name ?? a.id)), ["label-remove needs-info", "label-remove no-report", "label-create repro-ready", "label-add repro-ready", "comment-edit 7"]);
  });

  test("plan(): a complete report gets the label alone; issue state stays with maintainers", async () => {
    const { score } = await intake();
    const { plan } = await act();
    const text = readRepo(".github/AGENT_ISSUE.md");
    const a = text.indexOf("````\n", text.indexOf("## 6. A filled example")) + 5;
    const p = plan({ result: score(text.slice(a, text.indexOf("\n````", a))), author: "NONE", labels: [], comments: [] });
    assert.deepEqual(p.actions.map((x) => x.op + " " + x.name), ["label-create repro-ready", "label-add repro-ready", "label-create bug", "label-add bug"]);
    const src = readRepo(".github/scripts/issue-intake-act.mjs") + readRepo(".github/workflows/issue-intake.yml");
    for (const verb of ['"close"', '"reopen"', "issue close", "issue reopen", "state_reason"]) assert.ok(!src.includes(verb), "intake must leave issue state alone: " + verb);
  });

  // D-INTAKE-LABELS-1 (owner 2026-11-07: "GitHub Actions, labelleri kendisi otomatik yapmali"). Real bodies and titles.
  const REAL = {
    1325: "Feature request: return a stored source in full (`ctx_get`)",
    1326: "[claude-code] 2.x: skill references and rule files under ~/.claude no longer load in full; the Read deny points to ctx_execute(file=…), which refuses them (OUTSIDE_ROOT)",
    1328: "setup FAIL: codex (2e26442450f2)",
    1329: "setup FAIL: codex (2e26442450f2)",
    1334: "Feature request: stateless shared daemon mode (one process per machine, Streamable HTTP) so RAM stops scaling with session count",
  };
  const real = async (n) => (await intake()).score(readRepo(`tests/fixtures/issue-intake/${n}.md`), REAL[n]);

  test("#1325, #1326, #1328, #1329, #1334 (real bodies): the type is read from the title, the form and the report", async () => {
    const { score } = await intake();
    const kinds = {};
    for (const n of Object.keys(REAL)) kinds[n] = (await real(n)).kind;
    assert.deepEqual(kinds, { 1325: "feature", 1326: "bug", 1328: "bug", 1329: "bug", 1334: "feature" });
    assert.equal(score("x", "[Bug]: OpenCode 2.x ctx_* tools never check OpenCode permissions").kind, "bug");
    assert.equal(score("x", "[codex] D3 fails").kind, "bug");
    assert.equal(score("### Agent\n\npi\n\n### Problem\n\nidea\n\n### Evidence links\n\n_No response_", "an idea").kind, "feature");
    assert.equal(score(emptyForm(), "anything").kind, "bug", "the agent-report form is a bug form");
    assert.equal(score("hello", "a question").kind, null);
    // Free Markdown with version, steps and output (#1306, #1307: no form, no title tag) is a bug report.
    for (const n of ["1306", "1307"]) assert.equal(score(readRepo(`tests/fixtures/issue-intake/${n}.md`), "Read hook denies a file").kind, "bug", n);
    // The lists mirror feature.yml: its agent dropdown and its field labels.
    const { AGENT_IDS, FEATURE_FORM_HEADS } = await intake();
    const form = readRepo(".github/ISSUE_TEMPLATE/feature.yml");
    const lines = form.split("\n").map((l) => l.trim());
    assert.deepEqual(lines.filter((l) => l.startsWith("label: ")).map((l) => l.slice(7)), FEATURE_FORM_HEADS);
    const opts = lines.slice(lines.indexOf("options:") + 1);
    assert.deepEqual(opts.slice(0, opts.findIndex((l) => !l.startsWith("- "))).map((l) => l.slice(2)), AGENT_IDS);
  });

  test("#1328 and #1329 (real setup reports): repro-ready with the fingerprint, version, node and platform", async () => {
    const { setupReport } = await intake();
    for (const n of [1328, 1329]) {
      const r = await real(n);
      assert.deepEqual([r.status, r.fingerprint], ["repro-ready", "2e26442450f2"], `#${n} ${JSON.stringify(r)}`);
      for (const k of ["report", "version", "os", "node", "steps", "observed", "output"]) assert.ok(r.have[k], `#${n} ${k}`);
    }
    assert.deepEqual(setupReport(readRepo("tests/fixtures/issue-intake/1328.md")),
      { fingerprint: "2e26442450f2", version: "2.1.5", node: "v23.9.0", platform: "darwin-arm64" });
    assert.equal(setupReport("# context-mode setup report\n\nfingerprint: <fp>\nversion: 2.1.5\nnode: v1\nplatform: x"), null);
    assert.equal((await real(1326)).fingerprint, null);
  });

  test("plan(): a feature request gets enhancement + priority: low and a short thanks, with no checklist", async () => {
    const { plan, MARKER } = await act();
    for (const n of [1325, 1334]) {
      const p = plan({ result: await real(n), author: "NONE", labels: [], comments: [] });
      assert.deepEqual(p.actions.filter((a) => a.op === "label-add").map((a) => a.name), ["enhancement", "priority: low"], `#${n}`);
      const c = p.actions.find((a) => a.op === "comment-create");
      assert.ok(c && c.body.startsWith(MARKER) && c.body.includes("Thanks for the idea"), `#${n}`);
      assert.ok(!c.body.includes("- [ ]") && !c.body.includes("ctx_doctor"), c.body);
      const again = plan({ result: await real(n), author: "NONE", labels: ["enhancement", "priority: low"], comments: [{ id: 3, body: c.body, bot: true, assoc: "NONE" }] });
      assert.deepEqual(again.actions, [], `#${n} second run`);
    }
    const old = plan({ result: await real(1334), author: "NONE", labels: ["needs-info"], comments: [{ id: 9, body: MARKER + "\nold checklist", bot: true, assoc: "NONE" }] });
    assert.deepEqual(old.actions.map((a) => a.op + " " + (a.name ?? a.id)),
      ["label-remove needs-info", "label-create enhancement", "label-add enhancement", "label-create priority: low", "label-add priority: low", "comment-edit 9"]);
  });

  test("plan(): a bug report gets bug + its status; #1326 keeps its labels as they are", async () => {
    const { plan } = await act();
    assert.deepEqual(plan({ result: await real(1326), author: "NONE", labels: ["bug", "repro-ready"], comments: [] }).actions, []);
    const p = plan({ result: await real(1328), author: "NONE", labels: [], comments: [] });
    assert.deepEqual(p.actions.filter((a) => a.op === "label-add").map((a) => a.name), ["repro-ready", "bug"]);
    // The setup report holds version, Node, platform, command and output; the comment lists only what speeds the replay.
    const c = p.actions.find((a) => a.op === "comment-create");
    assert.ok(c.body.includes("**Intake check: repro-ready**") && c.body.includes("make the replay faster"), c.body);
    assert.deepEqual((await real(1328)).missing, ["agent"]);
  });

  test("plan(): a second open issue with the same setup report fingerprint gets duplicate and one link line; nothing closes", async () => {
    const { plan, firstWithFingerprint, commentBody } = await act();
    const open = [1326, 1328, 1329].map((n) => ({ number: n, body: readRepo(`tests/fixtures/issue-intake/${n}.md`) }));
    assert.equal(firstWithFingerprint(open, "2e26442450f2", 1329), 1328);
    assert.equal(firstWithFingerprint(open, "2e26442450f2", 1328), null, "the first one is no duplicate");
    assert.equal(firstWithFingerprint(open, null, 1329), null);
    const r = await real(1329);
    const p = plan({ result: r, author: "NONE", labels: ["bug"], comments: [], duplicateOf: 1328 });
    assert.deepEqual(p.actions.filter((a) => a.op === "label-add").map((a) => a.name), ["repro-ready", "duplicate"]);
    const c = p.actions.find((a) => a.op === "comment-create");
    assert.equal(c.body.split("\n").filter((l) => l.includes("#1328")).length, 1, c.body);
    assert.ok(c.body.includes("`2e26442450f2`"), c.body);
    assert.ok(!p.actions.some((a) => ["close", "issue-close", "state"].includes(a.op)));
    assert.equal(commentBody(r, null).includes("#1328"), false);
  });

  test("intake profile: score() of the 5 real bodies, median of 50 runs, stays under 20 ms", async () => {
    const { score } = await intake();
    const bodies = Object.keys(REAL).map((n) => [readRepo(`tests/fixtures/issue-intake/${n}.md`), REAL[n]]);
    const t = [];
    for (let i = 0; i < 50; i++) { const a = performance.now(); for (const [b, ti] of bodies) score(b, ti); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    assert.ok(t[25] < 20, `median ${t[25]} ms`);
  });

  test("plan(): steps back for a maintainer author, the maintainer-ack label, or a maintainer comment", async () => {
    const { score } = await intake();
    const { plan } = await act();
    const result = score("");
    for (const author of ["OWNER", "MEMBER", "COLLABORATOR"]) assert.ok(plan({ result, author, labels: [], comments: [] }).skip, author);
    assert.equal(plan({ result, author: "NONE", labels: ["maintainer-ack"], comments: [] }).skip, "label maintainer-ack");
    const owner = { id: 1, body: "stop github actions", bot: false, assoc: "OWNER" };
    assert.deepEqual(plan({ result, author: "NONE", labels: [], comments: [owner] }), { skip: "a maintainer commented", actions: [] });
    const user = { id: 2, body: "more info", bot: false, assoc: "NONE" };
    assert.equal(plan({ result, author: "CONTRIBUTOR", labels: [], comments: [user] }).skip, null);
  });
});
