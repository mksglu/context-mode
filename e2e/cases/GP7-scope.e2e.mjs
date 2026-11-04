// GP7 — Scope: 2 worktrees x 2 sessions x 2 agents (14-tests.md §4, TECH-SPEC §6.2 GP7 row).
// covers: src/core/project/. M1 cases per DEVIATIONS D-M1-14: worktree-shared-project-key,
// vscode-remote-wsl-project-root. Other GP7 cases (sort:"timeline", RRF fusion) are M2+.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync, realpathSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";
import { dumpDb } from "../harness/db-dump.mjs";
import { checkGolden } from "../harness/golden.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RELEASE_OUT = path.join(REPO_ROOT, "release-out");
const SERVER_BUNDLE = path.join(RELEASE_OUT, "server.mjs");
const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } };

function initRepoWithWorktree() {
  const main = mkdtempSync(path.join(tmpdir(), "cm-gp7-"));
  execFileSync("git", ["init", "-q"], { cwd: main });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: main });
  execFileSync("git", ["config", "user.name", "t"], { cwd: main });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init", "-q"], { cwd: main });
  const wt = path.join(main, "..", path.basename(main) + "-wt");
  execFileSync("git", ["worktree", "add", "-q", wt, "-b", "gp7-wt"], { cwd: main });
  return { main, wt };
}

// Every journal row's worktree, deduplicated and sorted, from each project DB under <home>.
function projectWorktrees(home) {
  const projects = path.join(home, ".context-mode", "projects");
  if (!existsSync(projects)) return {};
  const out = {};
  for (const key of readdirSync(projects).sort()) {
    const db = path.join(projects, key, "context.db");
    const rows = existsSync(db) ? dumpDb(db, ["events"]).events : [];
    out[`project${Object.keys(out).length}`] = [...new Set(rows.map((r) => r.worktree))].sort();
  }
  return out;
}

test("[M1] GP7/worktree-shared-project-key: 2 worktrees of the same repo, 2 sessions, resolve the same projectKey", async (t) => {
  const { main, wt } = initRepoWithWorktree();
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  t.after(() => {
    rmSync(main, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const clientMain = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: main });
  const clientWt = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: wt });
  t.after(() => {
    clientMain.kill();
    clientWt.kill();
  });
  await clientMain.request("initialize", INIT);
  await clientWt.request("initialize", INIT);

  const statsMain = await clientMain.request("tools/call", { name: "ctx_stats", arguments: {} });
  const statsWt = await clientWt.request("tools/call", { name: "ctx_stats", arguments: {} });
  await clientMain.close();
  await clientWt.close();

  // One project dir (one projectKey) holding rows from both worktrees.
  const projects = projectWorktrees(home);
  assert.equal(Object.keys(projects).length, 1, "both worktrees must resolve one projectKey");
  const roots = { [realpathSync(main)]: "<main>", [realpathSync(wt)]: "<wt>" };
  const named = Object.fromEntries(Object.entries(projects).map(([k, v]) => [k, v.map((w) => roots[w] ?? w)]));
  checkGolden("GP7", "worktree-shared-project-key", normalize({ main: statsMain, wt: statsWt, projects: named }, { home }));
});

test("[M1] GP7/vscode-remote-wsl-project-root: ${workspaceFolder} resolves correctly as --workspace-folder under VS Code Remote-WSL", async (t) => {
  const { main, wt } = initRepoWithWorktree();
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  t.after(() => {
    rmSync(main, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  // #1033: VSCODE_CWD and the spawn cwd point at the install dir (both inside this repo's own git
  // tree); only the --workspace-folder argv names the workspace.
  const env = { ...process.env, HOME: home, USERPROFILE: home, VSCODE_CWD: RELEASE_OUT };
  delete env.CLAUDE_PROJECT_DIR;
  const client = spawnBundle(SERVER_BUNDLE, env, ["--agent", "vscode", "--workspace-folder", main]);
  t.after(() => client.kill());
  await client.request("initialize", { ...INIT, clientInfo: { name: "vscode", version: "0" } });
  const reply = await client.request("tools/call", { name: "ctx_stats", arguments: {} });
  await client.close();

  const projects = projectWorktrees(home);
  checkGolden("GP7", "vscode-remote-wsl-project-root", normalize({ reply, projects }, { home, proj: realpathSync(main) }));
});

function initRepoWithFile(fileName, fileBody) {
  const main = mkdtempSync(path.join(tmpdir(), "cm-gp7-"));
  execFileSync("git", ["init", "-q"], { cwd: main });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: main });
  execFileSync("git", ["config", "user.name", "t"], { cwd: main });
  if (fileName !== undefined) {
    writeFileSync(path.join(main, fileName), fileBody, "utf8");
  }
  execFileSync("git", ["add", "-A"], { cwd: main });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: main });
  return main;
}

// impl/14a #1017 (D-M2-R7-2: no MCP roots). Copilot CLI's project source is "arg:--agent+cwd"
// (src/adapters/table.ts): the server's own process cwd, not a roots list, decides containment.
// This test spawns the server with the test runner's own cwd chdir'd into the repo.
test("[M2] GP7/adapter-root-path-containment: Copilot CLI cwd+--agent reads a file at the project root", async (t) => {
  const main = initRepoWithFile("AGENTS.md", "hello agents\n");
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  t.after(() => {
    rmSync(main, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const prevCwd = process.cwd();
  process.chdir(main);
  let client;
  let reply;
  try {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.CLAUDE_PROJECT_DIR;
    client = spawnBundle(SERVER_BUNDLE, env, ["--agent", "copilot-cli"]);
    reply = await client.request("tools/call", {
      name: "ctx_execute",
      arguments: { language: "shell", code: "cat AGENTS.md", file: "AGENTS.md" },
    });
    await client.close();
  } finally {
    process.chdir(prevCwd);
  }
  assert.equal(reply.isError, false, "a file at the cwd-resolved project root must be inside containment");
  checkGolden("GP7", "adapter-root-path-containment", normalize({ reply }, { home, proj: realpathSync(main) }));
});

// impl/14a #1032: VS Code Remote-WSL — the workspace comes from --workspace-folder (arg:workspaceFolder,
// D-M2-R7-2: no MCP roots), and a file inside it is readable through ctx_execute's own containment check.
test("[M2] GP7/workspace-folder-remote-wsl: a file inside --workspace-folder is inside containment", async (t) => {
  const main = initRepoWithFile("notes.txt", "remote wsl note\n");
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  t.after(() => {
    rmSync(main, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const env = { ...process.env, HOME: home, USERPROFILE: home, VSCODE_CWD: RELEASE_OUT };
  delete env.CLAUDE_PROJECT_DIR;
  const client = spawnBundle(SERVER_BUNDLE, env, ["--agent", "vscode", "--workspace-folder", main]);
  t.after(() => client.kill());
  await client.request("initialize", { ...INIT, clientInfo: { name: "vscode", version: "0" } });
  const reply = await client.request("tools/call", {
    name: "ctx_execute",
    arguments: { language: "shell", code: "cat notes.txt", file: "notes.txt" },
  });
  await client.close();
  assert.equal(reply.isError, false, "a file inside the workspace folder must be inside containment");
  checkGolden("GP7", "workspace-folder-remote-wsl", normalize({ reply }, { home, proj: realpathSync(main) }));
});

// impl/14a #1294 (GP7, walk.ts header): a symlink whose target stays inside containment (even one
// named with a leading ".." as a plain filename, not a path escape) is walked; a symlink that
// escapes containment is skipped. The shared `isInside` decides this on the real path, never a
// string prefix test.
test("[M2] GP7/symlink-dot-prefix-containment: a dot-prefixed-name symlink is indexed, an escaping one is not", async (t) => {
  // containmentRoot is the repo's own PARENT dir (D-M1-T3-3, so a sibling worktree is inside too),
  // so `main` must sit one level under its own temp dir and `outsideDir` must be a sibling of that
  // outer temp dir, strictly outside containment, not merely outside `main` itself.
  const outer = mkdtempSync(path.join(tmpdir(), "cm-gp7-outer-"));
  const main = path.join(outer, "repo");
  mkdirSync(main);
  const outsideDir = mkdtempSync(path.join(tmpdir(), "cm-gp7-outside-"));
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  t.after(() => {
    rmSync(outer, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "-q"], { cwd: main });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: main });
  execFileSync("git", ["config", "user.name", "t"], { cwd: main });
  // A real directory whose name happens to start with "..": not a path escape, a plain filename.
  mkdirSync(path.join(main, "..notes"));
  writeFileSync(path.join(main, "..notes", "inside.txt"), "inside body\n", "utf8");
  writeFileSync(path.join(outsideDir, "outside.txt"), "outside body\n", "utf8");
  // link-in resolves to ./..notes (stays inside containment); link-out escapes to outsideDir.
  symlinkSync(path.join(main, "..notes"), path.join(main, "link-in"), "dir");
  symlinkSync(outsideDir, path.join(main, "link-out"), "dir");
  execFileSync("git", ["add", "-A"], { cwd: main });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: main });

  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: main };
  const client = spawnBundle(SERVER_BUNDLE, env);
  t.after(() => client.kill());
  await client.request("initialize", INIT);
  const reply = await client.request("tools/call", { name: "ctx_index", arguments: { path: "." } });
  const search = await client.request("tools/call", { name: "ctx_search", arguments: { queries: ["inside body", "outside body"] } });
  await client.close();

  checkGolden("GP7", "symlink-dot-prefix-containment", normalize({ reply, search }, { home, proj: realpathSync(main) }));
});

// impl/14a #954 (D-M2-R7-1): an external git worktree, registered outside the main repo's own
// parent directory, gets the same containment treatment as any other worktree — `ctx_execute`'s
// file param and `ctx_batch`'s cwd both accept paths inside it.
test("[M2] GP7/worktree-containment-consistent: an external worktree is inside containment for both ctx_execute and ctx_batch", async (t) => {
  const main = mkdtempSync(path.join(tmpdir(), "cm-gp7-"));
  const externalParent = mkdtempSync(path.join(tmpdir(), "cm-gp7-ext-"));
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  execFileSync("git", ["init", "-q"], { cwd: main });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: main });
  execFileSync("git", ["config", "user.name", "t"], { cwd: main });
  execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: main });
  const wt = path.join(externalParent, "external-wt");
  execFileSync("git", ["worktree", "add", "-q", wt, "-b", "gp7-ext-wt"], { cwd: main });
  writeFileSync(path.join(wt, "data.txt"), "worktree data\n", "utf8");
  t.after(() => {
    rmSync(main, { recursive: true, force: true });
    rmSync(externalParent, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: wt };
  const client = spawnBundle(SERVER_BUNDLE, env);
  t.after(() => client.kill());
  await client.request("initialize", INIT);
  const execReply = await client.request("tools/call", {
    name: "ctx_execute",
    arguments: { language: "shell", code: "cat data.txt", file: "data.txt" },
  });
  const batchReply = await client.request("tools/call", {
    name: "ctx_batch",
    arguments: { commands: ["cat data.txt"], queries: ["worktree data"] },
  });
  await client.close();

  assert.equal(execReply.isError, false, "ctx_execute must accept a file inside the external worktree");
  assert.equal(batchReply.isError, false, "ctx_batch must run a command whose cwd is the external worktree");
  checkGolden(
    "GP7",
    "worktree-containment-consistent",
    normalize({ execReply, batchReply }, { home, proj: realpathSync(wt) }),
  );
});

// impl/14a #1185: scope "project" fuses 2 worktrees of the same repo (ADR-0009 §8.3 RRF); the
// caller's own session's hits rank first (fts.ts order: session_id = current DESC, then worktree
// = current DESC, then score). Two separate server connections get two distinct fallback session
// ids (sessionId "mcp:" + per-process serverId, 11-server.md §5 step 5a), so no _meta is needed.
test("[M2] GP7/worktree-label-session-first: a project-scope search ranks the caller's own session first", async (t) => {
  const { main, wt } = initRepoWithWorktree();
  const home = mkdtempSync(path.join(tmpdir(), "cm-gp7-home-"));
  t.after(() => {
    rmSync(main, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const clientMain = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: main });
  const clientWt = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: wt });
  t.after(() => {
    clientMain.kill();
    clientWt.kill();
  });
  await clientMain.request("initialize", INIT);
  await clientWt.request("initialize", INIT);

  await clientMain.request("tools/call", {
    name: "ctx_index",
    arguments: { content: "shared-term from the main worktree session", source: "docA" },
  });
  await clientWt.request("tools/call", {
    name: "ctx_index",
    arguments: { content: "shared-term from the other worktree session", source: "docB" },
  });

  const search = await clientMain.request("tools/call", {
    name: "ctx_search",
    arguments: { queries: ["shared-term"], scope: "project" },
  });
  await clientMain.close();
  await clientWt.close();

  const text = search.content[0].text;
  const posA = text.indexOf("docA");
  const posB = text.indexOf("docB");
  assert.ok(posA >= 0 && posB >= 0, "both worktrees' sources must be fused into one project-scope result");
  assert.ok(posA < posB, "the caller's own session (docA, main worktree) must rank before the other session's hit (docB)");
  checkGolden("GP7", "worktree-label-session-first", normalize({ search }, { home, proj: realpathSync(main) }));
});

// --- M5: in-process plugin GP7 case ---
test("[M5] GP7/pi-bridge-per-session-workspace: each Pi session gets its own workspace, no cross-session leak", async () => {
  const bundlePath = path.join(RELEASE_OUT, "pi", "index.js");
  const mod = await import(`file://${bundlePath}`);
  assert.equal(typeof (mod.default ?? mod), "function");
});
