// build/check-removed.mjs — GS5 repo-cleanup gate (impl/15 §2, TECH-SPEC §1 GS5 + §3.10,
// DEVIATIONS D-M7-arch-4, D-M7-CLN-W3c). Each case runs the real script in a throwaway git repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
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
    "docs/v2/x.md": "ctx_batch_execute\n",
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
  "tests/v2/repo/a.test.mjs": "x", "e2e/cases/a.mjs": "x", "build/build.mjs": "x", "bench/a.mjs": "x",
  "docs/v2/TECH-SPEC.md": "x", "docs/install/README.md": "x", "docs/tools.md": "x", "docs/UPSTREAM-CREDITS.md": "x",
  "scripts/gate.mjs": "x", "scripts/ci-gs4-lint.mjs": "x", "scripts/record-fixtures.mjs": "x", "scripts/release/plan.mjs": "x",
  ".github/workflows/ci.yml": "x", ".impl/progress.json": "{}", "tickets/v2-test-ledger.md": "x", "metrics/traffic.json": "{}",
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

test("allow-list: near-miss prefixes are not allowed (src/core-v1/, tests/v2x/, scripts/gate.mjs.bak)", () => {
  const r = run(fixture({ ...ALLOWED, "src/core-v1/a.ts": "x", "tests/v2x/a.mjs": "x", "scripts/gate.mjs.bak": "x" }));
  assert.equal(r.status, 1);
  assert.deepEqual(r.lines.slice().sort(), ["scripts/gate.mjs.bak", "src/core-v1/a.ts", "tests/v2x/a.mjs"].map((p) => OUT + p));
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

test("allow-list: docs/benchmarks/ passes, a stray root file still fails (D-FU-RF-BENCH-1)", () => {
  const ok = run(fixture({ ...ALLOWED, "docs/benchmarks/README.md": "x", "docs/benchmarks/data/a.json": "{}" }));
  assert.equal(ok.status, 0);
  assert.deepEqual(ok.lines, ["check-removed: clean"]);
  const bad = run(fixture({ ...ALLOWED, "docs/benchmarks/README.md": "x", "stray.txt": "x" }));
  assert.equal(bad.status, 1);
  assert.deepEqual(bad.lines, [OUT + "stray.txt"]);
  const sibling = run(fixture({ ...ALLOWED, "docs/benchmarks-old/a.md": "x" }));
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

test("allow-list: scripts/ci-install.mjs and scripts/v1-cases/ pass; near-miss names still fail (D-CR-SCRIPTS-1)", () => {
  const ok = run(fixture({ ...ALLOWED, "scripts/ci-install.mjs": "x", "scripts/v1-cases/convert.mjs": "x", "scripts/v1-cases/inventory.mjs": "x" }));
  assert.equal(ok.status, 0);
  assert.deepEqual(ok.lines, ["check-removed: clean"]);
  const bad = run(fixture({ ...ALLOWED, "scripts/ci-install.mjs.bak": "x", "scripts/v1-cases-x/a.mjs": "x", "scripts/v1-case/a.mjs": "x" }));
  assert.equal(bad.status, 1);
  assert.deepEqual(bad.lines.slice().sort(), ["scripts/ci-install.mjs.bak", "scripts/v1-case/a.mjs", "scripts/v1-cases-x/a.mjs"].map((p) => OUT + p));
});

// D-CR-SCRIPTS-1 follow-up: the live gate caught scripts/ci-install.mjs because no unit test ran the script on the
// real tracked tree. A new tracked file outside the target tree now fails here, in `node --test tests/v2/`.
test("the real tracked tree is clean: a new tracked file outside the target tree fails fast", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.stdout.split("\n").filter((l) => l !== ""), ["check-removed: clean"]);
});
