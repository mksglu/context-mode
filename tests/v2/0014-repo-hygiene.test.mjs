// ADR-0013 (release automation), ADR-0014 (issue forms), ADR-0015 (README and repo cleanup): repo shape, gates, workflows, docs facts.
// One file per ADR area (docs/v2/TEST-LAYOUT.md, ADR-0024); a fix adds its red test here.
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { HOOK_WORDS, MARKERS, agentRows, checkAgentTables, renderAgentTables } from "../../build/readme-agents.mjs";
import { installWithRetry, missingPackages } from "../../scripts/ci-install.mjs";
import { ADAPTERS } from "../../src/adapters/table.ts";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import { DOCTOR_CHECK_ORDER, REPORT_CAP, REPORT_SOURCE_LABEL } from "../../src/core/contracts/constants.ts";

// Sections are independent: own temp dirs or read-only reads of the repo; none changes process.env or the cwd, so they run concurrently.
describe("ADR-0013 / ADR-0014 / ADR-0015 repo hygiene", { concurrency: CONC }, () => {
describe("ADR-0015 repo: removed-file gate (allow-list)", () => {
  // build/check-removed.mjs — GS5 repo-cleanup gate (impl/15 §2, TECH-SPEC §1 GS5 + §3.10,
  // DEVIATIONS D-M7-arch-4, D-M7-CLN-W3c). Each case runs the real script in a throwaway git repo.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
});

describe("ADR-0015 repo: secrets gate", () => {
  // build/check-secrets.mjs: no gateway tenant id (t_ + 8 hex) in a tracked text file (D-FU-OI-TENANT-1).
  // Each case runs the real script in a throwaway git repo. The ids below are built from parts, so this file holds none.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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

  // Every capBytes call site is listed as lossless in docs/v2/release/NO-LOSSY-CUT.md (same file, same count).
  test("no-lossy-cut: every capBytes call site is a lossless row in NO-LOSSY-CUT.md", () => {
    const table = readFileSync("docs/v2/release/NO-LOSSY-CUT.md", "utf8").split("\n").filter((l) => l.startsWith("|"));
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

  const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
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

  const root = fileURLToPath(new URL("../../", import.meta.url));

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

  const root = fileURLToPath(new URL("../../", import.meta.url));
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
  // MAIN-ONLY (docs/v2/release/MAIN-ONLY.md, DEVIATIONS D-MO-2): shape of the one-click release in release.yml.
  // A dispatch on `main` takes the main path (jobs main-*); every other start keeps the release-branch path until merge day.
  // Line-based, no regex.

  const root = fileURLToPath(new URL("../../", import.meta.url));
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

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
    "metrics/live-skip-streak.json",
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

  test("metrics/live-skip-streak.json starts at streak 0", () => {
    const j = JSON.parse(readFileSync(path.join(REPO, "metrics", "live-skip-streak.json"), "utf8"));
    assert.deepEqual(j, { streak: 0 });
  });
});

describe("ADR-0013 repo: live run paths", () => {
  // D-LEF-2: e2e/live/run.mjs ran on Windows CI and built "D:\D:\a\..." from new URL(import.meta.url).pathname
  // ("/D:/a/..."). Every e2e/live entry script takes its own directory from fileURLToPath(import.meta.url).

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SRC = readFileSync(path.join(REPO, "e2e", "live", "run.mjs"), "utf8");

  test("e2e/live/run.mjs finds its root with fileURLToPath, not URL.pathname (Windows drive paths)", () => {
    assert.equal(SRC.includes("new URL(import.meta.url).pathname"), false, "URL.pathname gives /D:/a/... on Windows");
    assert.ok(SRC.includes("fileURLToPath(import.meta.url)"), "root comes from fileURLToPath(import.meta.url)");
  });
});

describe("ADR-0015 repo: command skills", () => {
  // The 3 user command skills (impl/13 §5, D-M6-arch-6): each skills/<name>/SKILL.md equals the
  // drafts.md block skill_<name> verbatim (frontmatter + body), plus one trailing newline.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const DRAFTS = readFileSync(path.join(REPO, "docs", "v2", "prompt", "drafts.md"), "utf8");
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

  const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
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

  test("docs/benchmarks/README.md try-it numbers equal try-it/ab.json", () => {
    const ab = json("docs/benchmarks/try-it/ab.json");
    const p = ab.pooled;
    const md = read("docs/benchmarks/README.md");
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
    const rows = read("docs/v2/release/MAIN-ONLY.md").split("\n").filter((l) => l.startsWith("|"));
    assert.ok(rows.every((l) => !l.includes("plugins/gemini/")));
  });

  test("both DEVIATIONS files say which file holds which rows", () => {
    assert.ok(read("docs/v2/DEVIATIONS.md").includes("docs/v2/impl/DEVIATIONS.md"));
    assert.ok(read("docs/v2/impl/DEVIATIONS.md").includes("docs/v2/DEVIATIONS.md"));
  });
});

describe("ADR-0015 repo: README agent tables", () => {
  // README agent tables come from the adapter table (src/adapters/table.ts) and the setup registry
  // (src/setup/registry.ts). build/readme-agents.mjs renders them; build/check-readme.mjs fails when the README
  // copy differs (D-README-1).

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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

// ADR-0024: every test file is listed in docs/v2/TEST-LAYOUT.md. A fix puts its red test in the file of its area, never in a new file.
describe("ADR-0024 test layout: every test file is in the table", { concurrency: CONC }, () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const TABLE = readFileSync(path.join(ROOT, "docs", "v2", "TEST-LAYOUT.md"), "utf8");

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

  const hint = (f) => f.map((x) => x + ": add the test to the file that owns its ADR area (see docs/v2/TEST-LAYOUT.md); a new area needs a table row and an ADR first").join("\n");

  test("every *.test.mjs under tests/v2 is listed in docs/v2/TEST-LAYOUT.md", () => {
    const files = walk(path.join(ROOT, "tests", "v2"), ".test.mjs", []);
    assert.ok(files.length > 0);
    const bad = unlisted(files);
    assert.deepEqual(bad, [], hint(bad));
  });

  test("every case file under e2e/cases is listed in docs/v2/TEST-LAYOUT.md", () => {
    const files = walk(path.join(ROOT, "e2e", "cases"), ".e2e.mjs", []);
    assert.ok(files.length > 0);
    const bad = unlisted(files);
    assert.deepEqual(bad, [], hint(bad));
  });

  test("the guard finds an unlisted file (self-check on a name that is not in the table)", () => {
    assert.deepEqual(unlisted(["tests/v2/9999-not-an-area.test.mjs"]), ["tests/v2/9999-not-an-area.test.mjs"]);
  });
});
});
