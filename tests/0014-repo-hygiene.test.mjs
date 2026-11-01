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
import { HOOK_WORDS, MARKERS, agentRows, checkAgentTables, renderAgentTables } from "../build/readme-agents.mjs";
import { installWithRetry, missingPackages } from "../scripts/ci-install.mjs";
import { ADAPTERS } from "../src/adapters/table.ts";
import { AGENT_IDS } from "../src/core/contracts/agents.ts";
import { DOCTOR_CHECK_ORDER, REPORT_CAP, REPORT_SOURCE_LABEL } from "../src/core/contracts/constants.ts";

// Sections are independent: own temp dirs or read-only reads of the repo; none changes process.env or the cwd, so they run concurrently.
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

describe("ADR-0015 repo: README agent tables", () => {
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

  test("readme-agents: the table has the columns Agent | Hooks | MCP | Skills | Install | Guide and never says MCP only", () => {
    const header = "| Agent | Hooks | MCP | Skills | Install | Guide |";
    assert.ok(renderAgentTables().install.startsWith(header), renderAgentTables().install.split("\n")[0]);
    assert.ok(README.includes(header));
    for (const text of [README, renderAgentTables().install]) {
      assert.ok(!text.includes("MCP only"), "the words MCP only are gone");
      assert.ok(!text.includes("| full |"), "no full label");
    }
    assert.ok(!readFileSync(path.join(REPO, "docs", "install", "README.md"), "utf8").includes("MCP only"));
    assert.ok(!readFileSync(path.join(REPO, "src", "cli", "commands.ts"), "utf8").includes("MCP only"));
  });

  test("readme-agents: install cell is the page's native command, or npm + context-mode setup", () => {
    const by = Object.fromEntries(agentRows().map((r) => [r.id, r.install]));
    assert.ok(by["claude-code"].includes("claude plugin install"), by["claude-code"]);
    assert.ok(by.codex.includes("codex plugin add"), by.codex);
    assert.ok(by.gemini.includes("gemini extensions install"), by.gemini);
    assert.ok(by.pi.includes("pi install"), by.pi);
    for (const id of ["copilot-cli", "kiro", "vscode", "zcode"]) assert.ok(by[id].includes("context-mode setup"), by[id]);
  });

  test("readme-agents: the README holds the rendered tables between the markers", () => {
    assert.deepEqual(checkAgentTables(README), []);
    for (const [start, end] of Object.values(MARKERS)) {
      assert.equal(README.split(start).length - 1, 1, `README has ${start} once`);
      assert.equal(README.split(end).length - 1, 1, `README has ${end} once`);
    }
  });

  test("readme-agents: a hand edit or a missing block fails the check", () => {
    const tables = renderAgentTables();
    const edited = README.replace("| Codex | yes", "| Codex | no");
    assert.notEqual(edited, README, "fixture edit did not apply");
    assert.ok(checkAgentTables(edited).some((p) => p.includes("install")), checkAgentTables(edited).join("\n"));
    const missing = README.split(MARKERS.install[0]).join("");
    assert.ok(checkAgentTables(missing).some((p) => p.includes("install")), checkAgentTables(missing).join("\n"));
    assert.ok(tables.install.includes("(docs/install/codex.md#install)") && !("upgrade" in tables));
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

  test("README line cap is 400 and its DEVIATIONS row quotes the owner", async () => {
    const { README_MAX_LINES } = await import("../src/core/contracts/constants.ts");
    assert.equal(README_MAX_LINES, 400);
    const rows = readRepo("docs/architecture/modules/DEVIATIONS.md").split("\n").filter((l) => l.includes("(D-README-THESIS-1)")); // the row id; later rows may name it in their text
    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes("akademik bir tez"));
  });

  test("README has its parts, and no citation file or block (D-README-NO-CITE-1)", () => {
    const readme = readRepo("README.md");
    for (const part of ["## Abstract", "## License", "Figure 1.", "Table 1."]) assert.ok(readme.includes(part), `README lacks ${part}`);
    for (const bad of ["## Scope", "## Limitations", "## Known"]) assert.ok(!readme.includes(bad), `README has ${bad} (D-README-NO-SCOPE-1)`);
    assert.ok(!readme.includes("OPEN-ITEMS"), "README points to OPEN-ITEMS (D-README-NO-SCOPE-1)");
    assert.ok(!existsSync(path.join(REPO, "CITATION.cff")), "CITATION.cff is back (owner 2026-11-01: CITATION.cff e gerek yok)");
    for (const bad of ["## Cite", "```bibtex", "CITATION.cff"]) assert.ok(!readme.includes(bad), `README has ${bad}`);
  });

  test("README: Gateway text comes first after the badges, and no failed run is quoted", () => {
    const readme = readRepo("README.md");
    const gw = readme.indexOf("Context Mode Gateway");
    assert.ok(gw > 0 && gw < readme.indexOf("## Abstract"), "the Gateway line must sit above the Abstract");
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
    assert.ok(quote.includes("free, local and open source"), "the blockquote says the plugin stays free, local and open source");
    const start = readme.indexOf("## 8. Context Mode Gateway");
    const end = readme.indexOf("\n## 9.", start);
    assert.ok(start > 0 && end > start, "README has no section 8 Context Mode Gateway");
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
      "problem", "problems", "struggle", "risk", "risks", "not", "no", "never", "without", "cannot", "v2", "enterprise", "quota", "pricing"];
    const BANNED_PHRASES = ["still grows", "compacts and", "n't", "1,000 requests", "card-free", "every feature", "start at", "sign up", "sign-up",
      "free plan", "pro plan", "team plan", "per month", "/month", "/mo", "zero compactions", "0 compactions"];
    for (const [name, text] of [["top blockquote", quote], ["section 8", readme.slice(start, end)]]) {
      const ws = new Set(words(text));
      for (const b of BANNED_WORDS) assert.ok(!ws.has(b), `${name} has the word "${b}" (D-README-GW-CALM-1)`);
      for (const b of BANNED_PHRASES) assert.ok(!text.toLowerCase().includes(b), `${name} has "${b}" (D-README-GW-CALM-1)`);
    }
    const rows = readRepo("docs/architecture/DEVIATIONS.md").split("\n").filter((l) => l.startsWith("| D-README-GW-CALM-1 |"));
    assert.equal(rows.length, 1, "DEVIATIONS has one D-README-GW-CALM-1 row");
    assert.ok(rows[0].includes("bu icime sinmedi OSS userleri kaciririz URKUTURUZ"), "the row quotes the owner");
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

  test("readme-stats.yml: daily plus manual, GITHUB_TOKEN only, main only, commits only on change, says it is live after the merge", () => {
    const y = readRepo(".github/workflows/readme-stats.yml");
    for (const need of ["schedule:", "cron:", "workflow_dispatch:", "contents: write", "secrets.GITHUB_TOKEN", "if: github.ref == 'refs/heads/main'",
      "build/readme-stats.mjs", "render.mjs star-history", "git diff --quiet", "PLAYWRIGHT_DIR"]) assert.ok(y.includes(need), `readme-stats.yml lacks ${need}`);
    for (const bad of ["TRAFFIC_TOKEN", "secrets.", "curl "]) if (bad !== "secrets.") assert.ok(!y.includes(bad), `readme-stats.yml has ${bad}`);
    assert.equal(y.split("secrets.").length - 1, 1, "only secrets.GITHUB_TOKEN");
    assert.ok(y.split("\n").slice(0, 8).join("\n").includes("default branch"), "header: scheduled jobs run only on the default branch");
  });

  test("README npm badge reads the npm downloads API with a label that says what it counts; no users or marketplace badge, no live count in the hero (D-README-GW-CALM-1)", () => {
    const readme = readRepo("README.md");
    // main holds the v1 stats.json (no npm_downloads field), so a badge on stats.json@main showed "no result".
    // The npm API answers on every branch; last-year covers every download since the package began (2026-02-23) until 2027-02-23.
    const badge = "https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2Flast-year%2Fcontext-mode&query=%24.downloads&label=npm%20downloads%2C%20last%20365%20days";
    assert.ok(readme.includes(badge), "npm downloads badge reads api.npmjs.org last-year with the label 'npm downloads, last 365 days'");
    assert.ok(!readme.includes("stats.json&query"), "no badge reads stats.json");
    for (const bad of ["query=%24.message", "query=%24.marketplace", "label=users", "747.4k", "683.2k", "64.1k", "33,053"]) assert.ok(!readme.includes(bad), `README has ${bad}`);
    const hero = readRepo(SRC + "hero.html");
    for (const bad of ["Users", "GitHub stars", "33,053", "747.4k", "683.2k"]) assert.ok(!hero.includes(bad), `hero.html has ${bad}`);
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
});
