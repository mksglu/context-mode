// ADR-0007 and PRD-v2 section 5 (project and session identity), GP7: project resolve, containment, per-host home and config dirs, non-git projects.
// Moved from tests/v2/project/*.test.mjs, tests/v2/store/{contain,resolve}.test.mjs and tests/v2/ops/project-dir-ported.test.mjs. Names and bodies unchanged.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync, symlinkSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { test, before, after, describe } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import { getAdapter } from "../../src/adapters/table.ts";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import { CtxError } from "../../src/core/contracts/errors.ts";
import { handleHook } from "../../src/core/hooks/dispatch.ts";
import { detectV1 } from "../../src/core/ops/detect-v1.ts";
import { checkHostConfig } from "../../src/core/ops/doctor-config.ts";
import { hostConfigPath } from "../../src/core/ops/host-write.ts";
import { resolvePluginRoot } from "../../src/core/ops/plugin-root.ts";
import { runUninstall } from "../../src/core/ops/uninstall.ts";
import { claudeDirOf, copilotDirOf, homeDirOf, resolveConfigDir, kiroDirOf, opencodeDirOf, piAgentDirOf, vscodeUserDirOf } from "../../src/core/project/config-dir.ts";
import { isInside, commonRoot } from "../../src/core/project/contain.ts";
import { resolveProject } from "../../src/core/project/resolve.ts";
import { sha256Hex } from "../../src/core/project/sha256.ts";
import { buildRegistry } from "../../src/setup/registry.ts";

describe("ADR-0007: resolveProject picks the project dir per host", { concurrency: CONC }, () => {
  // Unit tests for src/core/project/resolve.ts (impl/02 §2, DEVIATIONS D-M1-5).
  // resolveProject(agent, { env, argv, cwd, piCwd? }): ProjectContext.
  // Dir picked per AdapterRow.projectSource: env:CLAUDE_PROJECT_DIR, arg:--agent+cwd,
  // spawn-cwd cwd, arg:workspaceFolder (--workspace-folder <path>), pi:ctx.cwd (piCwd).
  // Missing -> NO_PROJECT with <kind>; not a git repo -> realpath(dir) is the project (D-M7-NG-1);
  // a project dir that does not exist -> NO_GIT_DIR.
  // containmentRoot = parent of gitCommonDir. GP7: identity shared per repo (2 worktrees -> same projectKey).
  // Concurrent: pure resolve calls on explicit env/argv/cwd arguments, own temp repos.
  function initRepo() {
    const dir = mkdtempSync(join(tmpdir(), "cm-repo-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    return dir;
  }

  test("resolveProject reads cwd from env.CLAUDE_PROJECT_DIR for claude-code", () => {
    const repo = initRepo();
    try {
      const ctx = resolveProject("claude-code", { env: { CLAUDE_PROJECT_DIR: repo }, argv: [], cwd: tmpdir() });
      assert.equal(ctx.worktree, realpathSync.native(repo));
      assert.match(ctx.projectKey, /^[0-9a-f]{16}$/);
      assert.equal(ctx.agent, "claude-code");
      assert.equal(ctx.source, "env:CLAUDE_PROJECT_DIR");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("resolveProject uses cwd directly for codex (arg:--agent+cwd)", () => {
    const repo = initRepo();
    try {
      const ctx = resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: repo });
      assert.equal(ctx.worktree, realpathSync.native(repo));
      assert.equal(ctx.source, "arg:--agent+cwd");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("resolveProject reads --workspace-folder from argv", () => {
    const repo = initRepo();
    try {
      const ctx = resolveProject("vscode", { env: {}, argv: ["--workspace-folder", repo], cwd: tmpdir() });
      assert.equal(ctx.worktree, realpathSync.native(repo));
      assert.equal(ctx.source, "arg:workspaceFolder");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("resolveProject reads piCwd for pi", () => {
    const repo = initRepo();
    try {
      const ctx = resolveProject("pi", { env: {}, argv: [], cwd: tmpdir(), piCwd: repo });
      assert.equal(ctx.worktree, realpathSync.native(repo));
      assert.equal(ctx.source, "pi:ctx.cwd");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("resolveProject throws NO_PROJECT with the missing source kind when the project source is missing", () => {
    assert.throws(
      // D-FU-PS-1: claude-code now falls to the payload cwd, then process.cwd(); vscode keeps one source.
      () => resolveProject("vscode", { env: {}, argv: [], cwd: tmpdir() }),
      (err) => {
        assert.ok(err instanceof CtxError);
        assert.equal(err.code, "NO_PROJECT");
        assert.match(err.message, /^Project source .+ is missing\. Fix: run ctx_doctor\.$/);
        return true;
      }
    );
  });

  // D-M7-NG-1 (owner decision 2026-10-21): a dir outside any git repo is a project keyed by its
  // realpath; it used to throw NO_GIT_DIR, which left every hook in that dir without a project.
  test("resolveProject keys a dir outside any git repository by its realpath (D-M7-NG-1)", () => {
    const notRepo = mkdtempSync(join(tmpdir(), "cm-notrepo-"));
    try {
      const ctx = resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: notRepo });
      assert.equal(ctx.worktree, realpathSync.native(notRepo));
      assert.equal(ctx.containmentRoot, realpathSync.native(notRepo));
      assert.match(ctx.projectKey, /^[0-9a-f]{16}$/);
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });

  test("resolveProject throws NO_GIT_DIR when the project dir does not exist", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-gone-"));
    const gone = join(base, "gone");
    try {
      assert.throws(
        () => resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: gone }),
        (err) => {
          assert.ok(err instanceof CtxError);
          assert.equal(err.code, "NO_GIT_DIR");
          return true;
        }
      );
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("GP7: two worktrees of the same repo resolve the same projectKey", () => {
    const repo = initRepo();
    execFileSync("git", ["commit", "--allow-empty", "-m", "init", "-q"], { cwd: repo });
    const wtDir = join(repo, "..", "wt1");
    try {
      execFileSync("git", ["worktree", "add", "-q", wtDir, "-b", "wt1-branch"], { cwd: repo });
      const ctxMain = resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: repo });
      const ctxWt = resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: wtDir });
      assert.equal(ctxMain.projectKey, ctxWt.projectKey);
      assert.notEqual(ctxMain.worktree, ctxWt.worktree);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(wtDir, { recursive: true, force: true });
    }
  });

  test("containmentRoot is the parent of the git common directory", () => {
    const repo = initRepo();
    try {
      const ctx = resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: repo });
      assert.equal(ctx.containmentRoot, realpathSync.native(join(repo, "..")));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // GP7/worktree-containment-consistent (#954): a registered worktree outside the repo's parent dir.
  // ctx_execute_file checks isInside(containmentRoot, file); ctx_batch_execute runs in ctx.worktree.
  // One rule: the worktree and its files are inside, from either session, and both sessions get one root.
  test("[M2] GP7/worktree-containment-consistent: a registered external worktree is inside the one containmentRoot", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-ext-"));
    const repo = join(base, "a", "repo");
    const wt = join(base, "b", "wt");
    try {
      mkdirSync(repo, { recursive: true });
      execFileSync("git", ["init", "-q"], { cwd: repo });
      execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "--allow-empty", "-m", "i", "-q"], { cwd: repo });
      mkdirSync(join(base, "b"), { recursive: true });
      execFileSync("git", ["worktree", "add", "-q", wt, "-b", "ext"], { cwd: repo });
      writeFileSync(join(wt, "f.txt"), "x");
      const fromWt = resolveProject("codex", { env: {}, argv: [], cwd: wt });
      const fromMain = resolveProject("codex", { env: {}, argv: [], cwd: repo });
      assert.equal(fromWt.containmentRoot, fromMain.containmentRoot);
      assert.equal(fromWt.projectKey, fromMain.projectKey);
      for (const ctx of [fromWt, fromMain]) {
        assert.equal(isInside(ctx.containmentRoot, fromWt.worktree), true, "batch cwd");
        assert.equal(isInside(ctx.containmentRoot, join(wt, "f.txt")), true, "execute_file target");
        assert.equal(isInside(ctx.containmentRoot, fromMain.worktree), true);
      }
      // The root is the deepest dir that holds both, not the filesystem root.
      assert.equal(fromWt.containmentRoot, realpathSync.native(base));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // GP7/workspace-folder-remote-wsl (#1032): v2 never reads MCP roots (ADR-0007 decision 6); the
  // workspace comes from --workspace-folder, and a file in it is inside.
  test("[M2] GP7/workspace-folder-remote-wsl: a file in the --workspace-folder workspace is inside", () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, "a.ts"), "x");
      const ctx = resolveProject("vscode", { env: { VSCODE_CWD: tmpdir() }, argv: ["--agent", "vscode", "--workspace-folder", repo], cwd: tmpdir() });
      assert.equal(ctx.worktree, realpathSync.native(repo));
      assert.equal(isInside(ctx.containmentRoot, join(repo, "a.ts")), true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // GP7/adapter-root-path-containment (#1017): Copilot CLI cwd=/repo, /repo/AGENTS.md is inside.
  test("[M2] GP7/adapter-root-path-containment: copilot-cli cwd=repo, repo/AGENTS.md is inside", () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, "AGENTS.md"), "x");
      const ctx = resolveProject("copilot-cli", { env: {}, argv: ["--agent", "copilot-cli"], cwd: repo });
      assert.equal(ctx.source, "arg:--agent+cwd");
      assert.equal(isInside(ctx.containmentRoot, join(repo, "AGENTS.md")), true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("ADR-0007: containment by realpath components, not string prefix", { concurrency: CONC }, () => {
  // Unit tests for src/core/project/contain.ts (impl/02 §3): isInside(root, p) by
  // realpath'd path COMPONENTS, never a string prefix check (A61 — "/root-evil" vs "/root").
  // Concurrent: each test makes its own temp tree.
  test("isInside: a child directory is inside its parent", () => {
    const root = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      const child = join(root, "a", "b");
      mkdirSync(child, { recursive: true });
      assert.equal(isInside(root, child), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("isInside: the root itself is inside itself", () => {
    const root = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      assert.equal(isInside(root, root), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("isInside: a sibling directory whose name is a string-prefix of root is NOT inside (A61)", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      const root = join(base, "root");
      const evil = join(base, "root-evil");
      mkdirSync(root, { recursive: true });
      mkdirSync(evil, { recursive: true });
      assert.equal(isInside(root, evil), false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("isInside: a parent directory is not inside its child", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      const child = join(base, "a", "b");
      mkdirSync(child, { recursive: true });
      assert.equal(isInside(child, base), false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("isInside: resolves symlinks before comparing components (an escaping symlink is not inside)", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      const root = join(base, "root");
      const outside = join(base, "outside");
      mkdirSync(root, { recursive: true });
      mkdirSync(outside, { recursive: true });
      const link = join(root, "escape");
      symlinkSync(outside, link);
      assert.equal(isInside(root, link), false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("isInside: a symlink inside root pointing to another location inside root is still inside", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      const root = join(base, "root");
      mkdirSync(join(root, "real"), { recursive: true });
      const link = join(root, "link");
      symlinkSync(join(root, "real"), link);
      assert.equal(isInside(root, link), true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // GP7/symlink-dot-prefix-containment (#1294): "..notes" is a name, not a climb. Components decide.
  test("[M2] GP7/symlink-dot-prefix-containment: a symlink to ./..notes is inside, a symlink to ../x is not", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      const root = join(base, "root");
      mkdirSync(join(root, "..notes"), { recursive: true });
      mkdirSync(join(base, "x"), { recursive: true });
      symlinkSync(join(root, "..notes"), join(root, "notes-link"));
      symlinkSync(join(base, "x"), join(root, "x-link"));
      assert.equal(isInside(root, join(root, "notes-link")), true);
      assert.equal(isInside(root, join(root, "x-link")), false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("commonRoot: the deepest dir that holds every path, by components", () => {
    const base = mkdtempSync(join(tmpdir(), "cm-in-"));
    try {
      mkdirSync(join(base, "a", "repo"), { recursive: true });
      mkdirSync(join(base, "a", "repo-evil"), { recursive: true });
      mkdirSync(join(base, "b", "wt"), { recursive: true });
      const real = realpathSync.native(base);
      assert.equal(commonRoot([join(base, "a"), join(base, "b", "wt")]), real);
      assert.equal(commonRoot([join(base, "a", "repo"), join(base, "a", "repo-evil")]), join(real, "a"));
      assert.equal(commonRoot([join(base, "a")]), join(real, "a"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("ADR-0007: CLAUDE_CONFIG_DIR is honoured for detection", { concurrency: CONC }, () => {
  // D-WF-CC-CONFIG-1: Claude Code reads its user dir from $CLAUDE_CONFIG_DIR (default <home>/.claude). Windows users with
  // OneDrive-redirected profiles set it. One helper (claudeDirOf) feeds setup, doctor, plugin-root and the subagent reader.
  // Fake Windows paths: path.join is the host's, so the assertions compare against path.join of the same inputs and run on every OS.
  // Concurrent: detection takes an explicit env and a temp home.
  const WIN_HOME = "C:\\Users\\Jo Doe";
  const WIN_CFG = "D:\\OneDrive - Corp\\claude cfg";

  test("claudeDirOf: CLAUDE_CONFIG_DIR wins, empty counts as unset, default is <home>/.claude", () => {
    assert.equal(claudeDirOf({ CLAUDE_CONFIG_DIR: WIN_CFG }, WIN_HOME), WIN_CFG);
    assert.equal(claudeDirOf({ CLAUDE_CONFIG_DIR: "" }, WIN_HOME), path.join(WIN_HOME, ".claude"));
    assert.equal(claudeDirOf({}, WIN_HOME), path.join(WIN_HOME, ".claude"));
  });

  test("registry: claude-code settings.json (drop) and installed_plugins.json (copy) follow CLAUDE_CONFIG_DIR", () => {
    const reg = buildRegistry({ home: WIN_HOME, pkgDir: "/abs/pkg", env: { CLAUDE_CONFIG_DIR: WIN_CFG } });
    const row = reg.find((r) => r.id === "claude-code");
    assert.equal(row.hookFiles[0].file, path.join(WIN_CFG, "settings.json"));
    assert.equal(row.copy.file, path.join(WIN_CFG, "plugins", "installed_plugins.json"));
    assert.ok(row.allowedWrites.includes(path.resolve(path.join(WIN_CFG, "settings.json"))), "the drop target is an allowed write");
    assert.ok(!row.allowedWrites.some((f) => f.includes(".claude")), "nothing is written under <home>/.claude");
  });

  test("registry: claude-code without CLAUDE_CONFIG_DIR keeps <home>/.claude", () => {
    const row = buildRegistry({ home: WIN_HOME, pkgDir: "/abs/pkg", env: {} }).find((r) => r.id === "claude-code");
    assert.equal(row.hookFiles[0].file, path.join(WIN_HOME, ".claude", "settings.json"));
    assert.equal(row.copy.file, path.join(WIN_HOME, ".claude", "plugins", "installed_plugins.json"));
  });

  test("plugin-root: the marketplace cache is found under CLAUDE_CONFIG_DIR", (t) => {
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-cc-cfg-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const cfg = path.join(root, "one drive", "claude cfg");
    const cache = path.join(cfg, "plugins", "cache", "mp", "context-mode");
    mkdirSync(cache, { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(path.join(home, "keep"), "");
    assert.equal(resolvePluginRoot({ id: "claude-code", installMode: "marketplace" }, { HOME: home, CLAUDE_CONFIG_DIR: cfg }), cache);
  });

  test("detectV1 and detectAgents read CLAUDE_CONFIG_DIR, not <home>/.claude", async (t) => {
    const { detectV1 } = await import("../../src/core/ops/detect-v1.ts");
    const { detectAgents } = await import("../../src/setup/engine.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-cc-v1-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const cfg = path.join(root, "cfg dir");
    mkdirSync(home, { recursive: true });
    mkdirSync(cfg, { recursive: true });
    const tmp = path.join(root, "tmp"); // an empty OS-temp stand-in: detectV1 also reports context-mode-* files there
    mkdirSync(tmp, { recursive: true });
    writeFileSync(path.join(cfg, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "context-mode hook claudecode pretooluse" }] }] } }));
    assert.deepEqual(detectV1("claude-code", home, { tmp }), [], "default scope looks under <home>/.claude, which is empty");
    const found = detectV1("claude-code", home, { claudeDir: cfg, tmp });
    assert.ok(found.length > 0 && found.every((f) => f.file.startsWith(cfg)), "the v1 hook in CLAUDE_CONFIG_DIR is found");
    const reg = buildRegistry({ home, pkgDir: "/abs/pkg", env: { CLAUDE_CONFIG_DIR: cfg } });
    assert.ok(detectAgents(reg, { home, pkgDir: "/abs/pkg", env: { CLAUDE_CONFIG_DIR: cfg, PATH: "" } }).includes("claude-code"));
    assert.ok(!detectAgents(reg, { home, pkgDir: "/abs/pkg", env: { PATH: "" } }).includes("claude-code"));
  });

  // Only a real Windows run proves that a backslash CLAUDE_CONFIG_DIR with a space survives path.join and path.resolve.
  test("registry: a real Windows CLAUDE_CONFIG_DIR with backslashes and a space is used as is", { skip: process.platform !== "win32" && "windows only" }, () => {
    const row = buildRegistry({ home: "C:\\Users\\Jo Doe", pkgDir: "C:\\pkg dir", env: { CLAUDE_CONFIG_DIR: WIN_CFG } }).find((r) => r.id === "claude-code");
    assert.equal(row.hookFiles[0].file, "D:\\OneDrive - Corp\\claude cfg\\settings.json");
    assert.deepEqual(row.allowedWrites.filter((f) => f.endsWith("settings.json")), ["D:\\OneDrive - Corp\\claude cfg\\settings.json"]);
  });
});

describe("ADR-0007: Copilot home dir", { concurrency: CONC }, () => {
  // D-WIN-COPILOT-HOME-1: Copilot CLI reads hooks/ and skills/ from $COPILOT_HOME (it replaces ~/.copilot as a whole;
  // docs.github.com cli-config-dir-reference). One helper (copilotDirOf) feeds setup, detection, doctor and the v1 scan.
  // Fake Windows paths: path.join is the host's, so the assertions compare against path.join of the same inputs and run on every OS.
  // Concurrent: explicit env and temp home per test.
  const WIN_HOME = "C:\\Users\\Jo Doe";
  const WIN_CFG = "D:\\OneDrive - Corp\\copilot cfg";

  test("copilotDirOf: COPILOT_HOME wins, empty counts as unset, default is <home>/.copilot", () => {
    assert.equal(copilotDirOf({ COPILOT_HOME: WIN_CFG }, WIN_HOME), WIN_CFG);
    assert.equal(copilotDirOf({ COPILOT_HOME: "" }, WIN_HOME), path.join(WIN_HOME, ".copilot"));
    assert.equal(copilotDirOf({}, WIN_HOME), path.join(WIN_HOME, ".copilot"));
  });

  test("registry: copilot-cli hook file, skills dir and allowed writes follow COPILOT_HOME; vscode stays under <home>", () => {
    const reg = buildRegistry({ home: WIN_HOME, pkgDir: "/abs/pkg", env: { COPILOT_HOME: WIN_CFG } });
    const row = reg.find((r) => r.id === "copilot-cli");
    assert.equal(row.hookFiles[0].file, path.join(WIN_CFG, "hooks", "context-mode.json"));
    assert.equal(row.hookInstall.file, path.join(WIN_CFG, "hooks", "context-mode.json"));
    assert.equal(row.skillInstall.dir, path.join(WIN_CFG, "skills"));
    assert.ok(row.allowedWrites.includes(path.resolve(path.join(WIN_CFG, "hooks", "context-mode.json"))));
    assert.ok(!row.allowedWrites.some((f) => f.includes(".copilot")), "nothing is written under <home>/.copilot");
    const vs = reg.find((r) => r.id === "vscode");
    assert.equal(vs.hookInstall.file, path.join(WIN_HOME, ".copilot", "hooks", "context-mode-vscode.json"), "VS Code is not Copilot CLI");
  });

  test("registry: copilot-cli without COPILOT_HOME keeps <home>/.copilot", () => {
    const row = buildRegistry({ home: WIN_HOME, pkgDir: "/abs/pkg", env: {} }).find((r) => r.id === "copilot-cli");
    assert.equal(row.hookInstall.file, path.join(WIN_HOME, ".copilot", "hooks", "context-mode.json"));
    assert.equal(row.skillInstall.dir, path.join(WIN_HOME, ".copilot", "skills"));
  });

  test("detectAgents sees copilot-cli through COPILOT_HOME; detectV1 scans the v1 hook file there", async (t) => {
    const { detectAgents } = await import("../../src/setup/engine.ts");
    const { detectV1 } = await import("../../src/core/ops/detect-v1.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-cp-home-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const cfg = path.join(root, "copilot cfg");
    const tmp = path.join(root, "tmp");
    for (const d of [home, cfg, tmp, path.join(cfg, "hooks")]) mkdirSync(d, { recursive: true });
    const ctx = { home, pkgDir: "/abs/pkg", env: { PATH: "", COPILOT_HOME: cfg } };
    const reg = buildRegistry(ctx);
    assert.ok(detectAgents(reg, ctx).includes("copilot-cli"), "COPILOT_HOME dir marks the host present");
    assert.ok(!detectAgents(reg, { ...ctx, env: { PATH: "" } }).includes("copilot-cli"), "no dir, no detection");
    writeFileSync(path.join(cfg, "hooks", "context-mode.json"), JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: "command", command: "context-mode hook copilot-cli" }] } }));
    const found = detectV1("copilot-cli", home, { copilotDir: cfg, tmp });
    assert.ok(found.some((f) => f.file === path.join(cfg, "hooks", "context-mode.json")), JSON.stringify(found));
  });

  test("setup writes copilot-cli hooks and skills under COPILOT_HOME and doctor reads them there", async (t) => {
    const { runSetup, runDoctor } = await import("../../src/setup/index.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-cp-run-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const cfg = path.join(root, "copilot cfg");
    const bin = path.join(root, "bin");
    mkdirSync(home, { recursive: true }); mkdirSync(bin, { recursive: true });
    if (process.platform === "win32") writeFileSync(path.join(bin, "copilot.cmd"), "@echo context-mode\r\n");
    else writeFileSync(path.join(bin, "copilot"), "#!/bin/sh\necho context-mode\n", { mode: 0o755 });
    const { cpSync, existsSync, readFileSync } = await import("node:fs");
    const { generateManifests } = await import("../../build/manifests.ts");
    const repo = path.resolve(import.meta.dirname, "../..");
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    const { TOOL_ORDER } = await import("../../src/core/contracts/constants.ts");
    writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
    writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
    writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
    generateManifests(pkgDir);
    for (const base of ["skills", "pi/skills", "claude-code/skills"]) for (const n of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) cpSync(path.join(repo, "skills", n), path.join(pkgDir, base, n), { recursive: true });
    const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
    const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, COPILOT_HOME: cfg, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win };
    const res = await runSetup({ home, pkgDir, env, agents: ["copilot-cli"], runId: "cp" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    assert.ok(existsSync(path.join(cfg, "hooks", "context-mode.json")), "hook file under COPILOT_HOME/hooks");
    for (const n of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) assert.ok(existsSync(path.join(cfg, "skills", n, "SKILL.md")), n);
    assert.equal(existsSync(path.join(home, ".copilot")), false, "nothing written to HOME/.copilot");
    const d = await runDoctor({ home, pkgDir, env, agents: ["copilot-cli"] });
    const checks = d.agents[0].checks;
    assert.equal(checks.find((c) => c.name === "skills")?.ok, true, JSON.stringify(checks));
    assert.equal(readFileSync(path.join(cfg, "hooks", "context-mode.json"), "utf8").includes("copilot-cli"), true);
  });
});

describe("ADR-0007: requireHomeDir and the per-agent home dir table", { concurrency: CONC }, () => {
  // homeDirOf(env, platform): the one home rule (D-M1-T3-1, superseded on win32 by D-WIN-HOME-2).
  // Windows hosts (Gemini, pi, Claude Code, Codex) take their home from os.homedir(), which is USERPROFILE and never HOME,
  // so on win32 USERPROFILE wins. POSIX keeps HOME first. These cases pass the platform in, so they run on every OS.
  // Concurrent: explicit env argument.
  test("[WIN] home-dir: win32 prefers USERPROFILE over a different HOME (Git Bash, MSYS, CI shells) (GEM-WIN-3, PI-WIN-4)", () => {
    const env = { HOME: "/c/Users/x", USERPROFILE: "C:\\Users\\x" };
    assert.equal(homeDirOf(env, "win32"), "C:\\Users\\x");
  });

  test("[WIN] home-dir: win32 order is USERPROFILE, HOMEDRIVE+HOMEPATH, HOME", () => {
    assert.equal(homeDirOf({ HOME: "/h", HOMEDRIVE: "D:", HOMEPATH: "\\Users\\y" }, "win32"), "D:\\Users\\y");
    assert.equal(homeDirOf({ HOME: "/h", HOMEDRIVE: "D:" }, "win32"), "/h", "HOMEPATH missing: HOMEDRIVE alone is not a home");
    assert.equal(homeDirOf({ HOME: "/h", HOMEPATH: "\\Users\\y" }, "win32"), "/h", "HOMEDRIVE missing: HOMEPATH alone is not a home");
    assert.equal(homeDirOf({ HOME: "/h" }, "win32"), "/h", "HOME is the last resort, so a test env with only HOME works");
    assert.equal(homeDirOf({ USERPROFILE: "", HOME: "/h" }, "win32"), "/h", "empty USERPROFILE counts as unset");
    assert.equal(homeDirOf({}, "win32"), null);
  });

  test("home-dir: POSIX keeps HOME first, then USERPROFILE (D-M1-T3-1)", () => {
    for (const platform of ["linux", "darwin"]) {
      assert.equal(homeDirOf({ HOME: "/home/x", USERPROFILE: "/other" }, platform), "/home/x");
      assert.equal(homeDirOf({ USERPROFILE: "/other" }, platform), "/other");
      assert.equal(homeDirOf({ HOME: "", USERPROFILE: "/other" }, platform), "/other");
      assert.equal(homeDirOf({ HOMEDRIVE: "C:", HOMEPATH: "\\x" }, platform), null, "HOMEDRIVE+HOMEPATH is a Windows rule only");
    }
  });

  test("[WIN] home-dir: resolveConfigDir on the live platform uses the same rule (HOME and USERPROFILE differ)", () => {
    const a = mkdtempSync(join(tmpdir(), "cm-home-a-"));
    const b = mkdtempSync(join(tmpdir(), "cm-home-b-"));
    try {
      const env = { HOME: a, USERPROFILE: b };
      const want = process.platform === "win32" ? b : a;
      assert.equal(resolveConfigDir(env), realpathSync.native(join(want, ".context-mode")));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  test("[WIN] home-dir: requireHomeDir names USERPROFILE on win32 and HOME on POSIX when nothing is set (Q-WIN-3)", async () => {
    const { requireHomeDir } = await import("../../src/core/project/config-dir.ts");
    assert.throws(() => requireHomeDir({}, "win32"), (e) => e.code === "NO_HOME" && /USERPROFILE/.test(e.message));
    assert.throws(() => requireHomeDir({}, "linux"), (e) => e.code === "NO_HOME" && /\bHOME\b/.test(e.message) && !/USERPROFILE/.test(e.message));
    assert.equal(requireHomeDir({ HOME: "/h" }, "linux"), "/h");
  });

  test("[WIN] home-dir: qwen under Git Bash HOME resolves to USERPROFILE\\.qwen (Q-WIN-3)", async () => {
    const { AGENT_HOME_DIR } = await import("../../src/core/contracts/constants.ts");
    const { win32 } = await import("node:path");
    const home = homeDirOf({ HOME: "C:\\msys\\home\\u", USERPROFILE: "C:\\Users\\u" }, "win32");
    assert.equal(win32.join(home, ...AGENT_HOME_DIR.qwen), "C:\\Users\\u\\.qwen");
  });
});

describe("ADR-0007: Kiro home dir", { concurrency: CONC }, () => {
  // D-WIN-KIRO-HOME-1: Kiro CLI V3 takes its global dir from $KIRO_HOME (kiro.dev/docs/reference/settings: "overrides the global
  // Kiro directory"; a filesystem root, the home dir, one of its ancestors or a relative path falls back to ~/.kiro).
  // One helper (kiroDirOf) feeds setup, detection, doctor, uninstall, host-write, upgrade and the v1 scan.
  // Fake Windows paths with an explicit platform, so the rule runs on every OS; registry assertions compare with path.join.
  // Concurrent: explicit env and temp home per test.
  const WIN_HOME = "C:\\Users\\Jo Doe";
  const WIN_KIRO = "D:\\Profiles\\work kiro";
  // Host-absolute paths for the registry tests: kiroDirOf checks absoluteness with the real platform.
  const HOME = path.resolve(path.sep, "Users", "Jo Doe");
  const KIRO = path.resolve(path.sep, "Profiles", "work kiro");
  const DEFAULT_WIN = path.win32.join(WIN_HOME, ".kiro");

  test("kiroDirOf: an absolute KIRO_HOME wins on win32 and posix", () => {
    assert.equal(kiroDirOf({ KIRO_HOME: WIN_KIRO }, WIN_HOME, "win32"), WIN_KIRO);
    assert.equal(kiroDirOf({ KIRO_HOME: "/work/kiro" }, "/home/jo", "linux"), "/work/kiro");
  });

  test("kiroDirOf: unset, empty, relative, root, home and an ancestor of home fall back to <home>/.kiro", () => {
    for (const v of [undefined, "", "kiro-profile", ".\\kiro", "C:\\", "D:\\", "\\kiro", WIN_HOME, WIN_HOME + "\\", "C:\\Users", "c:\\users\\jo doe"]) {
      assert.equal(kiroDirOf({ KIRO_HOME: v }, WIN_HOME, "win32"), DEFAULT_WIN, JSON.stringify(v));
    }
    for (const v of ["", "rel/kiro", "/", "/home/jo", "/home", "/home/jo/"]) {
      assert.equal(kiroDirOf({ KIRO_HOME: v }, "/home/jo", "linux"), "/home/jo/.kiro", JSON.stringify(v));
    }
    assert.equal(kiroDirOf({}, "/home/jo", "linux"), "/home/jo/.kiro");
  });

  test("kiroDirOf: a dir beside or under home is accepted", () => {
    assert.equal(kiroDirOf({ KIRO_HOME: "C:\\Users\\Jo Doe.kiro" }, WIN_HOME, "win32"), "C:\\Users\\Jo Doe.kiro");
    assert.equal(kiroDirOf({ KIRO_HOME: "C:\\Users\\Jo Doe\\profiles\\work" }, WIN_HOME, "win32"), "C:\\Users\\Jo Doe\\profiles\\work");
    assert.equal(kiroDirOf({ KIRO_HOME: "/home/jo/..kiro" }, "/home/jo", "linux"), "/home/jo/..kiro");
  });

  test("registry: kiro hook file, MCP file, skills dir and allowed writes follow KIRO_HOME", () => {
    const reg = buildRegistry({ home: HOME, pkgDir: "/abs/pkg", env: { KIRO_HOME: KIRO } });
    const row = reg.find((r) => r.id === "kiro");
    assert.equal(row.hookInstall.file, path.join(KIRO, "hooks", "context-mode.json"));
    assert.equal(row.config.file, path.join(KIRO, "settings", "mcp.json"));
    assert.equal(row.skillInstall.dir, path.join(KIRO, "skills"));
    assert.ok(row.allowedWrites.includes(path.resolve(path.join(KIRO, "settings", "mcp.json"))));
    assert.ok(!row.allowedWrites.some((f) => f.includes(".kiro")), "nothing is written under <home>/.kiro");
    assert.equal(hostConfigPath("kiro", HOME, { KIRO_HOME: KIRO }), path.join(KIRO, "settings", "mcp.json"));
  });

  test("registry: kiro without KIRO_HOME (or with a value Kiro ignores) keeps <home>/.kiro", () => {
    for (const env of [{}, { KIRO_HOME: "" }, { KIRO_HOME: "relative" }]) {
      const row = buildRegistry({ home: HOME, pkgDir: "/abs/pkg", env }).find((r) => r.id === "kiro");
      assert.equal(row.hookInstall.file, path.join(HOME, ".kiro", "hooks", "context-mode.json"), JSON.stringify(env));
      assert.equal(row.config.file, path.join(HOME, ".kiro", "settings", "mcp.json"));
      assert.equal(row.skillInstall.dir, path.join(HOME, ".kiro", "skills"));
    }
  });

  test("registry: other hosts ignore KIRO_HOME", () => {
    const reg = buildRegistry({ home: HOME, pkgDir: "/abs/pkg", env: { KIRO_HOME: KIRO } });
    assert.ok(!reg.find((r) => r.id === "gemini").allowedWrites.some((f) => f.includes("work kiro")));
  });

  test("detectAgents sees kiro through KIRO_HOME; detectV1 scans the v1 agent file there", async (t) => {
    const { detectAgents } = await import("../../src/setup/engine.ts");
    const { detectV1 } = await import("../../src/core/ops/detect-v1.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-kiro-home-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const cfg = path.join(root, "kiro cfg");
    const tmp = path.join(root, "tmp");
    for (const d of [home, cfg, tmp, path.join(cfg, "agents")]) mkdirSync(d, { recursive: true });
    const ctx = { home, pkgDir: "/abs/pkg", env: { PATH: "", KIRO_HOME: cfg } };
    const reg = buildRegistry(ctx);
    assert.ok(detectAgents(reg, ctx).includes("kiro"), "KIRO_HOME dir marks the host present");
    assert.ok(!detectAgents(reg, { ...ctx, env: { PATH: "" } }).includes("kiro"), "no dir, no detection");
    writeFileSync(path.join(cfg, "agents", "old.json"), JSON.stringify({ name: "context-mode" }));
    const found = detectV1("kiro", home, { kiroDir: cfg, tmp });
    assert.ok(found.some((f) => f.file === path.join(cfg, "agents", "old.json")), JSON.stringify(found));
  });

  test("setup writes kiro hooks, MCP entry and skills under KIRO_HOME and doctor reads them there", async (t) => {
    const { runSetup, runDoctor } = await import("../../src/setup/index.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-kiro-run-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const cfg = path.join(root, "kiro cfg");
    const bin = path.join(root, "bin");
    mkdirSync(home, { recursive: true }); mkdirSync(bin, { recursive: true });
    const { cpSync, existsSync, readFileSync } = await import("node:fs");
    const { generateManifests } = await import("../../build/manifests.ts");
    const repo = path.resolve(import.meta.dirname, "../..");
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    const { TOOL_ORDER } = await import("../../src/core/contracts/constants.ts");
    writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
    writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
    writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
    generateManifests(pkgDir);
    for (const base of ["skills", "pi/skills", "claude-code/skills"]) for (const n of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) cpSync(path.join(repo, "skills", n), path.join(pkgDir, base, n), { recursive: true });
    const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
    const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, KIRO_HOME: cfg, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win };
    const res = await runSetup({ home, pkgDir, env, agents: ["kiro"], runId: "ki" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    assert.ok(existsSync(path.join(cfg, "hooks", "context-mode.json")), "hook file under KIRO_HOME/hooks");
    assert.ok(existsSync(path.join(cfg, "settings", "mcp.json")), "MCP entry under KIRO_HOME/settings");
    for (const n of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) assert.ok(existsSync(path.join(cfg, "skills", n, "SKILL.md")), n);
    assert.equal(existsSync(path.join(home, ".kiro")), false, "nothing written to HOME/.kiro");
    const d = await runDoctor({ home, pkgDir, env, agents: ["kiro"] });
    const checks = d.agents[0].checks;
    assert.equal(checks.find((c) => c.name === "skills")?.ok, true, JSON.stringify(checks));
    assert.equal(checks.some((c) => c.ok === false && String(c.detail ?? "").includes(path.join(home, ".kiro"))), false, "doctor names no <home>/.kiro file: " + JSON.stringify(checks));
    assert.equal(readFileSync(path.join(cfg, "hooks", "context-mode.json"), "utf8").includes("kiro"), true);
  });
});

describe("ADR-0007: OpenCode config dir", { concurrency: CONC }, () => {
  // D-WIN-OPENCODE-DIR-1: OpenCode reads opencode.json and skills/ from $OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode
  // (xdg-basedir), else ~/.config/opencode. One helper (opencodeDirOf) feeds setup, host-write, doctor, uninstall, detection
  // and the v1 scan. Fake Windows paths: path.join is the host's, so assertions compare against path.join of the same inputs
  // and run on every OS.
  // Concurrent: explicit env and temp home per test.
  const WIN_HOME = "C:\\Users\\Jo Doe";
  const WIN_XDG = "D:\\xdg config";
  const WIN_OWN = "E:\\oc cfg";

  test("opencodeDirOf: OPENCODE_CONFIG_DIR, then XDG_CONFIG_HOME/opencode, then <home>/.config/opencode; empty is unset", () => {
    assert.equal(opencodeDirOf({ OPENCODE_CONFIG_DIR: WIN_OWN, XDG_CONFIG_HOME: WIN_XDG }, WIN_HOME), WIN_OWN);
    assert.equal(opencodeDirOf({ XDG_CONFIG_HOME: WIN_XDG }, WIN_HOME), path.join(WIN_XDG, "opencode"));
    assert.equal(opencodeDirOf({ OPENCODE_CONFIG_DIR: "", XDG_CONFIG_HOME: "" }, WIN_HOME), path.join(WIN_HOME, ".config", "opencode"));
    assert.equal(opencodeDirOf({}, WIN_HOME), path.join(WIN_HOME, ".config", "opencode"));
  });

  test("opencodeDirOf: OPENCODE_CONFIG (one extra file) does not move the global dir", () => {
    assert.equal(opencodeDirOf({ OPENCODE_CONFIG: "C:\\x\\custom.json" }, WIN_HOME), path.join(WIN_HOME, ".config", "opencode"));
  });

  test("registry: opencode config, plugin list, skills dir and allowed writes follow the env", () => {
    for (const [env, dir] of [
      [{ OPENCODE_CONFIG_DIR: WIN_OWN }, WIN_OWN],
      [{ XDG_CONFIG_HOME: WIN_XDG }, path.join(WIN_XDG, "opencode")],
      [{}, path.join(WIN_HOME, ".config", "opencode")],
    ]) {
      const row = buildRegistry({ home: WIN_HOME, pkgDir: "/abs/pkg", env }).find((r) => r.id === "opencode");
      const file = path.join(dir, "opencode.json");
      assert.equal(row.config.file, file);
      assert.equal(row.hookInstall.file, file);
      assert.equal(row.skillInstall.dir, path.join(dir, "skills"));
      assert.ok(row.allowedWrites.includes(path.resolve(file)), JSON.stringify(row.allowedWrites));
      assert.ok(row.allowedWrites.every((f) => f.startsWith(path.resolve(dir))), "every write is under the OpenCode dir");
    }
  });

  test("hostConfigPath: opencode follows the env", () => {
    assert.equal(hostConfigPath("opencode", WIN_HOME, { OPENCODE_CONFIG_DIR: WIN_OWN }), path.join(WIN_OWN, "opencode.json"));
    assert.equal(hostConfigPath("opencode", WIN_HOME, { XDG_CONFIG_HOME: WIN_XDG }), path.join(WIN_XDG, "opencode", "opencode.json"));
    assert.equal(hostConfigPath("opencode", WIN_HOME, {}), path.join(WIN_HOME, ".config", "opencode", "opencode.json"));
  });

  test("detectAgents sees opencode through XDG_CONFIG_HOME; detectV1 scans the v1 plugin entry there", async (t) => {
    const { detectAgents } = await import("../../src/setup/engine.ts");
    const { detectV1 } = await import("../../src/core/ops/detect-v1.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-oc-dir-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const xdg = path.join(root, "xdg cfg");
    const tmp = path.join(root, "tmp");
    for (const d of [home, tmp, path.join(xdg, "opencode")]) mkdirSync(d, { recursive: true });
    const ctx = { home, pkgDir: "/abs/pkg", env: { PATH: "", XDG_CONFIG_HOME: xdg } };
    assert.ok(detectAgents(buildRegistry(ctx), ctx).includes("opencode"), "XDG dir marks the host present");
    const bare = { home, pkgDir: "/abs/pkg", env: { PATH: "" } };
    assert.ok(!detectAgents(buildRegistry(bare), bare).includes("opencode"), "no dir, no detection");
    writeFileSync(path.join(xdg, "opencode", "opencode.json"), JSON.stringify({ plugin: ["context-mode"] }));
    const found = detectV1("opencode", home, { opencodeDir: path.join(xdg, "opencode"), tmp });
    assert.ok(found.some((f) => f.file === path.join(xdg, "opencode", "opencode.json")), JSON.stringify(found));
  });

  test("setup writes opencode config and skills under XDG_CONFIG_HOME, doctor reads them there, uninstall removes them there", async (t) => {
    const { runSetup, runDoctor } = await import("../../src/setup/index.ts");
    const { existsSync, readFileSync, cpSync } = await import("node:fs");
    const { generateManifests } = await import("../../build/manifests.ts");
    const { TOOL_ORDER } = await import("../../src/core/contracts/constants.ts");
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-oc-run-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const xdg = path.join(root, "xdg cfg");
    const bin = path.join(root, "bin");
    mkdirSync(home, { recursive: true }); mkdirSync(bin, { recursive: true });
    // The fake opencode lists context-mode only when the config sits where OpenCode reads it.
    const conf = path.join(xdg, "opencode", "opencode.json");
    if (process.platform === "win32") {
      writeFileSync(path.join(bin, "opencode.cmd"), `@if exist "${conf}" (echo context-mode connected) else (exit /b 1)\r\n`);
    } else {
      writeFileSync(path.join(bin, "opencode"), `#!/bin/sh\nif [ -f "${conf}" ]; then echo "context-mode connected"; else exit 1; fi\n`, { mode: 0o755 });
    }
    const repo = path.resolve(import.meta.dirname, "../..");
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
    writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
    writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
    mkdirSync(path.join(pkgDir, "opencode"), { recursive: true });
    writeFileSync(path.join(pkgDir, "opencode", "plugin.js"), "export default {};\n");
    generateManifests(pkgDir);
    for (const base of ["skills", "pi/skills", "claude-code/skills"]) for (const n of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) cpSync(path.join(repo, "skills", n), path.join(pkgDir, base, n), { recursive: true });
    const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
    const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: xdg, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win };
    const res = await runSetup({ home, pkgDir, env, agents: ["opencode"], runId: "oc" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    assert.ok(existsSync(conf), "opencode.json under XDG_CONFIG_HOME/opencode");
    const doc = JSON.parse(readFileSync(conf, "utf8"));
    assert.ok(doc.mcp?.["context-mode"], JSON.stringify(doc));
    assert.ok(doc.plugin?.length >= 1, JSON.stringify(doc));
    for (const n of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) assert.ok(existsSync(path.join(xdg, "opencode", "skills", n, "SKILL.md")), n);
    assert.equal(existsSync(path.join(home, ".config")), false, "nothing written to HOME/.config");
    const d = await runDoctor({ home, pkgDir, env, agents: ["opencode"] });
    const checks = d.agents[0].checks;
    assert.equal(checks.find((c) => c.name === "skills")?.ok, true, JSON.stringify(checks));
  });
});

describe("ADR-0007: Pi agent dir", { concurrency: CONC }, () => {
  // D-WIN-PIDIR-1: Pi reads settings.json from $PI_CODING_AGENT_DIR, else <home>/.pi/agent. An empty value counts as unset
  // (same as codexDirOf). One helper (piAgentDirOf) feeds host-write, uninstall, doctor, upgrade and the v1 scan. Before the
  // fix host-write and uninstall used `??`, so "" gave join("", "settings.json") = a relative path in the cwd. Fake Windows
  // paths: path.join is the host's, so assertions compare against path.join of the same inputs and run on every OS.
  // Concurrent: explicit env and temp home per test.
  const WIN_HOME = "C:\\Users\\Jo Doe";
  const WIN_PI = "D:\\pi agent";
  const PI_GIT = "git:github.com/mksglu/context-mode@release";

  function tmp(t) {
    const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-pidir-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  test("piAgentDirOf: PI_CODING_AGENT_DIR wins, empty is unset, else <home>/.pi/agent", () => {
    assert.equal(piAgentDirOf({ PI_CODING_AGENT_DIR: WIN_PI }, WIN_HOME), WIN_PI);
    assert.equal(piAgentDirOf({ PI_CODING_AGENT_DIR: "" }, WIN_HOME), path.join(WIN_HOME, ".pi", "agent"));
    assert.equal(piAgentDirOf({}, WIN_HOME), path.join(WIN_HOME, ".pi", "agent"));
  });

  test("hostConfigPath: pi with an empty PI_CODING_AGENT_DIR is the default file, never a relative path", () => {
    const want = path.join(WIN_HOME, ".pi", "agent", "settings.json");
    assert.equal(hostConfigPath("pi", WIN_HOME, { PI_CODING_AGENT_DIR: "" }), want);
    assert.equal(hostConfigPath("pi", WIN_HOME, { PI_CODING_AGENT_DIR: WIN_PI }), path.join(WIN_PI, "settings.json"));
  });

  test("uninstall: pi with an empty PI_CODING_AGENT_DIR edits <home>/.pi/agent/settings.json", (t) => {
    const home = tmp(t);
    const file = path.join(home, ".pi", "agent", "settings.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ packages: [PI_GIT, "npm:other"] }), "utf8");
    runUninstall({ adapter: { id: "pi", installMode: "in-process" }, project: { projectKey: "abcdef0123456789" },
      env: { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: "" }, confirmDelete: false });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).packages, ["npm:other"]);
  });

  test("doctor D3 and hostConfigPath name the same pi file when PI_CODING_AGENT_DIR is empty", (t) => {
    const home = tmp(t);
    const env = { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: "" };
    const file = hostConfigPath("pi", home, env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ packages: [PI_GIT] }), "utf8");
    const d3 = checkHostConfig(getAdapter("pi"), env, home);
    assert.equal(d3.status, "PASS", d3.detail);
    assert.ok(d3.detail.includes(file), d3.detail);
  });

  test("detectV1: pi scope.piAgentDir empty is unset", (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ packages: ["npm:context-mode"] }), "utf8");
    assert.deepEqual(detectV1("pi", home, { piAgentDir: "", tmp: tmp(t) }).map((f) => f.path), ["packages.0"]);
  });
});

describe("ADR-0007: VS Code user dir", { concurrency: CONC }, () => {
  // D-WIN-VSCODE-MCP-1 (VS-WIN-2): VS Code reads the user-profile mcp.json from its user data dir, not from ~/.vscode
  // (the extensions dir). Rule from microsoft/vscode src/vs/platform/environment/node/userDataPath.ts and
  // src/vs/platform/userDataProfile/common/userDataProfile.ts (default profile = userRoamingDataHome = <data>/Code/User,
  // mcpResource = <profile>/mcp.json): win32 %APPDATA% (else <home>\AppData\Roaming), darwin <home>/Library/Application Support,
  // linux $XDG_CONFIG_HOME (else <home>/.config). One helper (vscodeUserDirOf) feeds setup, doctor, upgrade, uninstall and plugin-root.
  // Fake Windows paths: the helper takes the platform, so the first group runs on every OS.
  // Concurrent: explicit env and temp home per test.
  const WIN_HOME = "C:\\Users\\Jo Doe";

  test("vscodeUserDirOf win32: %APPDATA%\\Code\\User, else <home>\\AppData\\Roaming\\Code\\User, empty APPDATA is unset", () => {
    assert.equal(vscodeUserDirOf({ APPDATA: "D:\\Roam ing" }, WIN_HOME, "win32"), "D:\\Roam ing\\Code\\User");
    assert.equal(vscodeUserDirOf({}, WIN_HOME, "win32"), "C:\\Users\\Jo Doe\\AppData\\Roaming\\Code\\User");
    assert.equal(vscodeUserDirOf({ APPDATA: "" }, WIN_HOME, "win32"), "C:\\Users\\Jo Doe\\AppData\\Roaming\\Code\\User");
  });

  test("vscodeUserDirOf darwin: <home>/Library/Application Support/Code/User; XDG_CONFIG_HOME and APPDATA do not apply", () => {
    assert.equal(vscodeUserDirOf({ XDG_CONFIG_HOME: "/x", APPDATA: "/y" }, "/Users/jo", "darwin"), "/Users/jo/Library/Application Support/Code/User");
  });

  test("vscodeUserDirOf linux: $XDG_CONFIG_HOME/Code/User, else <home>/.config/Code/User, empty is unset", () => {
    assert.equal(vscodeUserDirOf({ XDG_CONFIG_HOME: "/cfg dir" }, "/home/jo", "linux"), "/cfg dir/Code/User");
    assert.equal(vscodeUserDirOf({}, "/home/jo", "linux"), "/home/jo/.config/Code/User");
    assert.equal(vscodeUserDirOf({ XDG_CONFIG_HOME: "" }, "/home/jo", "linux"), "/home/jo/.config/Code/User");
  });

  function tmp(t) {
    const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-vscdir-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  // The same rule spelled out per host OS, so the test is not the helper checking itself.
  function expectedFile(home, env) {
    const tail = ["Code", "User", "mcp.json"];
    if (process.platform === "win32") return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), ...tail);
    if (process.platform === "darwin") return path.join(home, "Library", "Application Support", ...tail);
    return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), ...tail);
  }

  test("hostConfigPath vscode: the user-profile mcp.json, never <home>/.vscode/mcp.json", (t) => {
    const home = tmp(t);
    for (const env of [{}, { APPDATA: path.join(home, "Roam ing"), XDG_CONFIG_HOME: path.join(home, "xdg") }]) {
      const got = hostConfigPath("vscode", home, env);
      assert.equal(got, expectedFile(home, env));
      assert.notEqual(got, path.join(home, ".vscode", "mcp.json"));
    }
  });

  test("uninstall vscode: drops context-mode from the user-profile mcp.json, keeps other servers", (t) => {
    const home = tmp(t);
    const env = { HOME: home, USERPROFILE: home };
    const file = expectedFile(home, env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ servers: { other: { command: "o" }, "context-mode": { command: "node", args: ["/opt/cm/server.mjs"] } } }), "utf8");
    runUninstall({ adapter: { id: "vscode", installMode: "hooks+mcp" }, project: { projectKey: "abcdef0123456789" }, env, confirmDelete: false });
    const after = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(after.servers["context-mode"], undefined);
    assert.deepEqual(after.servers.other, { command: "o" });
  });

  test("plugin-root vscode: the server dir comes from the entry in the user-profile mcp.json", (t) => {
    const home = tmp(t);
    const env = { HOME: home, USERPROFILE: home };
    const pkg = path.join(home, "pkg");
    mkdirSync(pkg, { recursive: true });
    const file = expectedFile(home, env);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ servers: { "context-mode": { command: "node", args: [path.join(pkg, "server.mjs")] } } }), "utf8");
    assert.equal(resolvePluginRoot(getAdapter("vscode"), env), pkg);
    assert.equal(existsSync(path.join(home, ".vscode", "mcp.json")), false);
  });
});

describe("ADR-0007: a project that is not a git repo", { concurrency: CONC }, () => {
  // D-M7-NG-1: one fixed project rule (impl/02 §2). A .git found walking up from the project dir ->
  // the project is the git common dir, worktree = the dir that holds that .git (unchanged). No .git up
  // to the filesystem root -> the project is realpath(dir) and worktree = containmentRoot = realpath(dir).
  // The project source per agent (CLAUDE_PROJECT_DIR, --workspace-folder, cwd, ...) is unchanged.
  // Concurrent: each test makes its own temp dir.
  const keyOf = (p) => sha256Hex(p).slice(0, 16);

  function withTmp(fn) {
    const base = mkdtempSync(join(tmpdir(), "cm-ng-"));
    try {
      return fn(base);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }

  test("D-M7-NG-1: a non-git dir is a project keyed by its realpath", () => {
    withTmp((base) => {
      const real = realpathSync.native(base);
      const ctx = resolveProject("codex", { env: {}, argv: ["--agent", "codex"], cwd: base });
      assert.equal(ctx.worktree, real);
      assert.equal(ctx.projectKey, keyOf(real));
      assert.equal(ctx.containmentRoot, real);
      assert.equal(ctx.source, "arg:--agent+cwd");
      assert.equal(ctx.dbPath.endsWith(join(ctx.projectKey, "context.db")), true);
    });
  });

  test("D-M7-NG-1: claude-code with CLAUDE_PROJECT_DIR on a non-git dir resolves that dir", () => {
    withTmp((base) => {
      const real = realpathSync.native(base);
      const ctx = resolveProject("claude-code", { env: { CLAUDE_PROJECT_DIR: base }, argv: [], cwd: tmpdir() });
      assert.equal(ctx.worktree, real);
      assert.equal(ctx.projectKey, keyOf(real));
      assert.equal(ctx.source, "env:CLAUDE_PROJECT_DIR");
    });
  });

  test("D-M7-NG-1: a nested non-git dir is its own project, not its non-git parent", () => {
    withTmp((base) => {
      const nested = join(base, "a", "b", "c");
      mkdirSync(nested, { recursive: true });
      const outer = resolveProject("codex", { env: {}, argv: [], cwd: base });
      const inner = resolveProject("codex", { env: {}, argv: [], cwd: nested });
      assert.equal(inner.worktree, realpathSync.native(nested));
      assert.equal(inner.projectKey, keyOf(realpathSync.native(nested)));
      assert.notEqual(inner.projectKey, outer.projectKey);
      assert.equal(inner.containmentRoot, realpathSync.native(nested));
    });
  });

  test("D-M7-NG-1: a symlink to a non-git dir gets the same key as the dir", () => {
    withTmp((base) => {
      const dir = join(base, "d");
      mkdirSync(dir);
      symlinkSync(dir, join(base, "link"));
      const viaDir = resolveProject("codex", { env: {}, argv: [], cwd: dir });
      const viaLink = resolveProject("codex", { env: {}, argv: [], cwd: join(base, "link") });
      assert.equal(viaLink.projectKey, viaDir.projectKey);
      assert.equal(viaLink.worktree, viaDir.worktree);
    });
  });

  test("D-M7-NG-1: a dir below a git repo still resolves to the repo (git rule unchanged)", () => {
    withTmp((base) => {
      const repo = join(base, "repo");
      mkdirSync(join(repo, "src", "deep"), { recursive: true });
      execFileSync("git", ["init", "-q", repo]);
      const commonDir = realpathSync.native(join(repo, ".git"));
      const ctx = resolveProject("codex", { env: {}, argv: [], cwd: join(repo, "src", "deep") });
      assert.equal(ctx.worktree, realpathSync.native(repo));
      assert.equal(ctx.projectKey, keyOf(commonDir));
      assert.equal(ctx.containmentRoot, realpathSync.native(base));
    });
  });

  test("D-M7-NG-1: a linked worktree still shares the main repo key (git rule unchanged)", () => {
    withTmp((base) => {
      const repo = join(base, "repo");
      const wt = join(base, "wt");
      mkdirSync(repo);
      execFileSync("git", ["init", "-q", repo]);
      execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "--allow-empty", "-m", "i", "-q"], { cwd: repo });
      execFileSync("git", ["worktree", "add", "-q", wt, "-b", "wt"], { cwd: repo });
      const main = resolveProject("codex", { env: {}, argv: [], cwd: repo });
      const linked = resolveProject("codex", { env: {}, argv: [], cwd: wt });
      assert.equal(linked.projectKey, main.projectKey);
      assert.equal(linked.projectKey, keyOf(realpathSync.native(join(repo, ".git"))));
      assert.equal(linked.worktree, realpathSync.native(wt));
      assert.equal(linked.containmentRoot, main.containmentRoot);
    });
  });

  test("D-M7-NG-1: the filesystem root as project dir is a project keyed by its realpath", (t) => {
    const root = realpathSync.native("/");
    if (existsSync(join(root, ".git"))) return t.skip("the filesystem root is a git repo on this machine");
    const ctx = resolveProject("codex", { env: {}, argv: [], cwd: "/" });
    assert.equal(ctx.worktree, root);
    assert.equal(ctx.projectKey, keyOf(root));
    assert.equal(ctx.containmentRoot, root);
  });
});

describe("ADR-0007: hook run in a non-git project", () => {
  // D-M7-NG-1: the hook works in a non-git project dir. Before the fix resolveProject threw NO_GIT_DIR,
  // handleHook returned the empty allow shape and the model saw the full Bash output. Same real
  // Claude Code 2.1.303 Bash PostToolUse payload as tests/v2/hooks/replace-live-golden.test.mjs.
  // Serial: one shared before/after (temp root and work dir).
  const ROOT = join(import.meta.dirname, "..", "..");
  const ENTRY = join(ROOT, "src", "entries", "hook.ts");
  const GOLDEN = join(ROOT, "e2e", "fixtures", "claude-code", "2.1.303", "PostToolUse-Bash-large.json");
  let root;
  let work;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-ng-hook-"));
    work = join(root, "plain", "dir");
    mkdirSync(work, { recursive: true });
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("D-M7-NG-1: PostToolUse Bash large output in a non-git cwd returns the Bash replace shape", () => {
    assert.equal(existsSync(join(work, ".git")), false);
    const payload = JSON.parse(readFileSync(GOLDEN, "utf8"));
    payload.cwd = work;
    payload.transcript_path = join(root, "transcript.jsonl");
    const full = payload.tool_response.stdout;
    const home = join(root, "home");
    mkdirSync(home);
    const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: work };
    const r = spawnSync(process.execPath, [ENTRY, "--agent", "claude-code"], { input: JSON.stringify(payload), cwd: work, env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(r.stdout.trim(), "", "empty stdout: no project, no replace");
    const hso = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(hso.hookEventName, "PostToolUse");
    const out = hso.updatedToolOutput;
    assert.equal(typeof out, "object");
    assert.deepEqual(Object.keys(out).sort(), ["interrupted", "stderr", "stdout"]);
    assert.equal(out.stderr, "");
    assert.equal(out.interrupted, false);
    assert.ok(Buffer.byteLength(out.stdout) * 10 < Buffer.byteLength(full), `replaced ${Buffer.byteLength(out.stdout)} bytes`);
    assert.ok(out.stdout.includes('source:"s'));
    assert.ok(out.stdout.includes("ctx_search("));
    // The output is indexed in this project's DB, under the config dir in HOME.
    const projects = readdirSync(join(home, ".context-mode", "projects"));
    assert.equal(projects.length, 1);
    assert.equal(existsSync(join(home, ".context-mode", "projects", projects[0], "context.db")), true);
  });
});

describe("ADR-0007: Claude Code cwd source (D-FU-PS-1)", () => {
  // D-FU-PS-1 (owner decision 2026-10-21, ADR-0001: one fixed order per agent, no runtime fallback path).
  // Claude Code project source order: CLAUDE_PROJECT_DIR, then the payload cwd (a documented common hook
  // input field), then process.cwd(). Before the fix a Claude Code payload with cwd but no
  // CLAUDE_PROJECT_DIR threw NO_PROJECT, and handleHook returned the empty allow shape with no log line.
  // handleHook step 3 now writes one stderr line "hooks: no project: <code> <detail>" when it still throws.
  // Serial: process.chdir and a process.stderr.write swap are process-wide.
  const ROOT = join(import.meta.dirname, "..", "..");
  const ENTRY = join(ROOT, "src", "entries", "hook.ts");
  const GOLDEN = join(ROOT, "e2e", "fixtures", "claude-code", "2.1.303", "PostToolUse-Bash-large.json");
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-ps-"));
  });

  after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  function keyOf(dir) {
    return createHash("sha256").update(dir).digest("hex").slice(0, 16);
  }

  // Spawn the real hook entry with the real Claude Code 2.1.303 Bash PostToolUse payload, no CLAUDE_PROJECT_DIR.
  function runHook(name, payloadCwd, spawnCwd) {
    const payload = JSON.parse(readFileSync(GOLDEN, "utf8"));
    if (payloadCwd === undefined) delete payload.cwd;
    else payload.cwd = payloadCwd;
    payload.transcript_path = join(root, name + "-transcript.jsonl");
    const home = join(root, name + "-home");
    mkdirSync(home);
    const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home };
    const r = spawnSync(process.execPath, [ENTRY, "--agent", "claude-code"], { input: JSON.stringify(payload), cwd: spawnCwd, env, encoding: "utf8" });
    return { r, home, payload, full: payload.tool_response.stdout };
  }

  function assertReplaced({ r, home, payload, full }, projectDir) {
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(r.stdout.trim(), "", "empty stdout: no project, no replace. stderr: " + r.stderr);
    const out = JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput;
    assert.equal(typeof out, "object");
    assert.ok(Buffer.byteLength(out.stdout) * 10 < Buffer.byteLength(full), `replaced ${Buffer.byteLength(out.stdout)} bytes`);
    assert.ok(out.stdout.includes('source:"s'));
    const projects = readdirSync(join(home, ".context-mode", "projects"));
    assert.deepEqual(projects, [keyOf(projectDir)]);
  }

  test("D-FU-PS-1: Claude Code payload cwd, no CLAUDE_PROJECT_DIR, non-git dir -> Bash replace keyed by realpath(cwd)", () => {
    const work = join(root, "plain");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(work);
    mkdirSync(elsewhere);
    assertReplaced(runHook("plain", work, elsewhere), realpathSync.native(work));
  });

  test("D-FU-PS-1: Claude Code payload cwd, no CLAUDE_PROJECT_DIR, git dir -> Bash replace keyed by the git common dir", () => {
    const repo = join(root, "repo");
    const elsewhere = join(root, "elsewhere-git");
    mkdirSync(repo);
    mkdirSync(elsewhere);
    execFileSync("git", ["init", "-q", repo]);
    const sub = join(repo, "sub");
    mkdirSync(sub);
    assertReplaced(runHook("git", sub, elsewhere), realpathSync.native(join(repo, ".git")));
  });

  test("D-FU-PS-1: Claude Code payload with no cwd and no CLAUDE_PROJECT_DIR -> the hook's process.cwd() is the project", () => {
    const work = join(root, "spawn-cwd");
    mkdirSync(work);
    assertReplaced(runHook("nocwd", undefined, work), realpathSync.native(work));
  });

  test("D-FU-PS-1: resolveProject claude-code order is CLAUDE_PROJECT_DIR, then cwd, then process.cwd()", () => {
    const a = join(root, "order-a");
    const b = join(root, "order-b");
    const c = join(root, "order-c");
    for (const d of [a, b, c]) mkdirSync(d);
    assert.equal(resolveProject("claude-code", { env: { CLAUDE_PROJECT_DIR: a }, argv: [], cwd: b }).worktree, realpathSync.native(a));
    assert.equal(resolveProject("claude-code", { env: {}, argv: [], cwd: b }).worktree, realpathSync.native(b));
    assert.equal(resolveProject("claude-code", { env: { CLAUDE_PROJECT_DIR: "" }, argv: [], cwd: b }).worktree, realpathSync.native(b));
    const old = process.cwd();
    process.chdir(c);
    try {
      const ctx = resolveProject("claude-code", { env: {}, argv: [], cwd: "" });
      assert.equal(ctx.worktree, realpathSync.native(c));
      assert.equal(ctx.source, "env:CLAUDE_PROJECT_DIR");
    } finally {
      process.chdir(old);
    }
  });

  function captureStderr() {
    const lines = [];
    const orig = process.stderr.write;
    process.stderr.write = (ch) => { lines.push(String(ch)); return true; };
    return { lines, restore: () => { process.stderr.write = orig; } };
  }

  test("D-FU-PS-1: a project dir that does not exist -> allow plus exactly one stderr line with NO_GIT_DIR", async () => {
    const gone = join(root, "does-not-exist");
    const payload = JSON.parse(readFileSync(GOLDEN, "utf8"));
    payload.cwd = gone;
    const cap = captureStderr();
    let out;
    try {
      out = await handleHook("claude-code", payload, { PATH: process.env.PATH, HOME: join(root, "gone-home"), USERPROFILE: join(root, "gone-home") });
    } finally {
      cap.restore();
    }
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    assert.equal(cap.lines.length, 1, JSON.stringify(cap.lines));
    assert.ok(cap.lines[0].startsWith("hooks: no project: NO_GIT_DIR "), cap.lines[0]);
    assert.ok(cap.lines[0].includes(gone), cap.lines[0]);
    assert.ok(cap.lines[0].endsWith("\n"));
  });

  test("D-FU-PS-1: an unknown agent id in handleHook -> empty output plus one stderr line (no silent drop)", async () => {
    const cap = captureStderr();
    let out;
    try {
      out = await handleHook("nope", {}, {});
    } finally {
      cap.restore();
    }
    assert.deepEqual(out, { stdout: "", exitCode: 0 });
    assert.equal(cap.lines.length, 1, JSON.stringify(cap.lines));
    assert.ok(cap.lines[0].startsWith("hooks: unknown agent "), cap.lines[0]);
  });

  test("D-FU-PS-1: every other agent keeps its one project source; Claude Code's env and cwd fallback are not theirs", () => {
    const own = join(root, "own");
    const foreign = join(root, "foreign");
    mkdirSync(own);
    mkdirSync(foreign);
    const expected = {
      codex: "arg:--agent+cwd", "copilot-cli": "arg:--agent+cwd", kiro: "arg:--agent+cwd",
      vscode: "arg:workspaceFolder", gemini: "spawn-cwd", qwen: "spawn-cwd", zcode: "spawn-cwd", opencode: "spawn-cwd",
      pi: "pi:ctx.cwd", "claude-code": "env:CLAUDE_PROJECT_DIR",
    };
    assert.deepEqual([...AGENT_IDS].sort(), Object.keys(expected).sort());
    for (const agent of AGENT_IDS) assert.equal(getAdapter(agent).projectSource, expected[agent], agent);
    const env = { CLAUDE_PROJECT_DIR: foreign };
    for (const agent of ["codex", "copilot-cli", "kiro", "gemini", "qwen", "zcode", "opencode"]) {
      const ctx = resolveProject(agent, { env, argv: ["--agent", agent], cwd: own });
      assert.equal(ctx.worktree, realpathSync.native(own), agent);
      assert.equal(ctx.source, expected[agent], agent);
      // An empty spawn cwd is still NO_PROJECT for them: no process.cwd() fallback.
      assert.throws(() => resolveProject(agent, { env, argv: ["--agent", agent], cwd: "" }), (e) => e instanceof CtxError && e.code === "NO_PROJECT", agent);
    }
    const vs = resolveProject("vscode", { env, argv: ["--workspace-folder", own], cwd: foreign });
    assert.equal(vs.worktree, realpathSync.native(own));
    assert.throws(() => resolveProject("vscode", { env, argv: [], cwd: own }), (e) => e instanceof CtxError && e.code === "NO_PROJECT");
    const pi = resolveProject("pi", { env, argv: [], cwd: foreign, piCwd: own });
    assert.equal(pi.worktree, realpathSync.native(own));
    assert.throws(() => resolveProject("pi", { env, argv: [], cwd: own }), (e) => e instanceof CtxError && e.code === "NO_PROJECT");
  });
});

describe("ADR-0007: project dir cases ported from v1", () => {
  // tests/v2/ops/project-dir-ported.test.mjs
  // Ported from tests/util/{project-dir,project-dir-matrix,codex-session-cwd-resolution}.test.ts (cleanup-plan W1-ops,
  // PORT rows). v1 walked a fallback chain (env vars, PWD, transcript and Codex session logs, plugin-path filter).
  // v2 has ONE named source per host and no fallback (impl/02 §2, ADR-0007 decision 4, DEVIATIONS D-M1-5), so the
  // invariants below are the v2 form: own source wins, foreign host vars are never read (#545 MUST-3, #561),
  // session logs are never read (Codex session cwd), a missing source is an error and never a guess.
  // Serial: before/after set process.env.HOME and USERPROFILE for the whole block.
  let root;
  let repo;
  let other;
  let oldHome;

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cm-projdir-")));
    oldHome = process.env.HOME;
    process.env.HOME = root; process.env.USERPROFILE = root;
    repo = join(root, "repo");
    other = join(root, "other");
    for (const d of [repo, other]) {
      mkdirSync(d);
      execFileSync("git", ["init", "-q", d]);
    }
  });

  after(() => {
    process.env.HOME = oldHome;
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      if (process.platform !== "win32" || err.code !== "EPERM") throw err;
    }
  });

  const FOREIGN_ENV = [
    "CLAUDE_PROJECT_DIR", "GEMINI_PROJECT_DIR", "QWEN_PROJECT_DIR", "VSCODE_CWD", "OPENCODE_PROJECT_DIR",
    "PI_PROJECT_DIR", "PI_WORKSPACE_DIR", "CURSOR_CWD", "IDEA_INITIAL_DIRECTORY", "CONTEXT_MODE_PROJECT_DIR", "PWD",
  ];

  // The input that carries each host's own project (impl/02 §2, PRD §5 host table).
  function ownInput(agent, dir, env = {}) {
    switch (agent) {
      case "claude-code": return { env: { ...env, CLAUDE_PROJECT_DIR: dir }, argv: [], cwd: other };
      case "vscode": return { env, argv: ["--workspace-folder", dir], cwd: other };
      case "pi": return { env, argv: [], cwd: other, piCwd: dir };
      default: return { env, argv: ["--agent", agent], cwd: dir };
    }
  }

  test("matrix: every host resolves its own source and the key is the same for all hosts of one repo (#545 MUST-3)", () => {
    const keys = new Set();
    for (const agent of AGENT_IDS) {
      const ctx = resolveProject(agent, ownInput(agent, repo));
      assert.equal(ctx.worktree, realpathSync.native(repo), agent);
      assert.equal(ctx.agent, agent);
      keys.add(ctx.projectKey);
    }
    assert.equal(keys.size, 1, "one repo, one projectKey, whichever host asks");
  });

  test("matrix: no host reads a foreign workspace or identification variable, even when it points at another repo (#545, #561)", () => {
    const foreign = Object.fromEntries(FOREIGN_ENV.map((k) => [k, other]));
    for (const agent of AGENT_IDS) {
      const env = { ...foreign };
      if (agent === "claude-code") delete env.CLAUDE_PROJECT_DIR; // its own source is set by ownInput
      const ctx = resolveProject(agent, ownInput(agent, repo, env));
      assert.equal(ctx.worktree, realpathSync.native(repo), `${agent} followed a foreign variable`);
    }
  });

  test("matrix: a host whose own source is empty fails with NO_PROJECT and the source kind, whatever foreign variables exist", () => {
    const foreign = Object.fromEntries(FOREIGN_ENV.map((k) => [k, repo]));
    const cases = {
      vscode: { env: foreign, argv: [], cwd: other },
      pi: { env: foreign, argv: [], cwd: other },
    };
    for (const [agent, input] of Object.entries(cases)) {
      assert.throws(() => resolveProject(agent, input), (e) => e instanceof CtxError && e.code === "NO_PROJECT", agent);
    }
    // D-FU-PS-1: Claude Code's fixed order is CLAUDE_PROJECT_DIR, then the payload cwd, then process.cwd();
    // an empty CLAUDE_PROJECT_DIR goes to the cwd, never to a foreign variable.
    const cc = resolveProject("claude-code", { env: { ...foreign, CLAUDE_PROJECT_DIR: "" }, argv: [], cwd: other });
    assert.equal(cc.worktree, realpathSync.native(other));
  });

  test("codex: the project is the spawn cwd; a Codex session log naming another cwd is never read (session-cwd resolution gone)", () => {
    const codexHome = join(root, ".codex", "sessions", "2026", "10", "21");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(join(codexHome, "rollout-1.jsonl"), JSON.stringify({ type: "session_meta", payload: { cwd: other } }) + "\n");
    const ctx = resolveProject("codex", { env: { CODEX_HOME: join(root, ".codex"), CLAUDE_PROJECT_DIR: other }, argv: ["--agent", "codex"], cwd: repo });
    assert.equal(ctx.worktree, realpathSync.native(repo));
  });

  test("a plugin install path as the cwd is not guessed around: with no git repo there it is its own project (D-M7-NG-1), never a fallback to PWD or CLAUDE_PROJECT_DIR", () => {
    const poisoned = join(root, ".claude", "plugins", "cache", "context-mode");
    mkdirSync(poisoned, { recursive: true });
    const ctx = resolveProject("codex", { env: { PWD: repo, CLAUDE_PROJECT_DIR: repo }, argv: ["--agent", "codex"], cwd: poisoned });
    assert.equal(ctx.worktree, realpathSync.native(poisoned));
    assert.notEqual(ctx.worktree, realpathSync.native(repo));
    assert.notEqual(ctx.projectKey, resolveProject("codex", { env: {}, argv: [], cwd: repo }).projectKey);
  });

  test("a cwd below the repo root resolves to the repo; the Claude transcript dir is never consulted", () => {
    const sub = join(repo, "a", "b");
    mkdirSync(sub, { recursive: true });
    const t = join(root, ".claude", "projects", "x");
    mkdirSync(t, { recursive: true });
    writeFileSync(join(t, "s.jsonl"), JSON.stringify({ cwd: other }) + "\n");
    const ctx = resolveProject("gemini", { env: {}, argv: [], cwd: sub });
    assert.equal(ctx.worktree, realpathSync.native(repo));
  });

  test("same repo from different cwd shapes gives one key; two repos give two keys", () => {
    const a = resolveProject("codex", { env: {}, argv: [], cwd: repo });
    const b = resolveProject("gemini", { env: {}, argv: [], cwd: join(repo, "a") });
    const c = resolveProject("codex", { env: {}, argv: [], cwd: other });
    assert.equal(a.projectKey, b.projectKey);
    assert.notEqual(a.projectKey, c.projectKey);
  });

  test("the Windows-style plugin path is a plain directory name to v2: it gets no special-case branch", () => {
    assert.throws(
      () => resolveProject("codex", { env: {}, argv: [], cwd: "C:\\Users\\x\\.claude\\plugins\\cache\\context-mode" }),
      (e) => e instanceof CtxError && e.code === "NO_GIT_DIR",
    );
  });

  test("compiled-ESM guard (v1 'resolver runs under Node without CommonJS require'): resolve.ts loads and runs as ESM under Node", () => {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e",
      `import { resolveProject } from ${JSON.stringify(new URL("../../src/core/project/resolve.ts", import.meta.url).href)};` +
      `console.log(resolveProject("codex", { env: {}, argv: [], cwd: ${JSON.stringify(repo)} }).projectKey);`], { encoding: "utf8", env: { ...process.env, HOME: root, USERPROFILE: root } });
    assert.match(out.trim(), /^[0-9a-f]{16}$/);
  });
});
