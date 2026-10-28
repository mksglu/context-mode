// MAIN-ONLY (docs/v2/release/MAIN-ONLY.md): scripts/release/commit-main.mjs makes the release commit on `main` from an unpacked
// package, tags it (annotated) and pushes both to the remote in one push. Local bare remote; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = path.join(REPO, "scripts", "release", "commit-main.mjs");
const ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];
const git = (cwd, ...a) => {
  const r = spawnSync("git", [...ID, ...a], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const put = (root, rel, value) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), typeof value === "string" ? value : JSON.stringify(value));
};

function fixture(t, version) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-v2-commitmain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bare = path.join(root, "origin.git");
  git(root, "init", "-q", "--bare", bare);
  const work = path.join(root, "work");
  git(root, "clone", "-q", bare, work);
  put(work, "README.md", "x");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "feat: init");
  git(work, "push", "-q", "origin", "HEAD:refs/heads/main");
  const pkg = path.join(root, "pkg");
  put(pkg, "package.json", { name: "context-mode", version });
  put(pkg, ".claude-plugin/marketplace.json", { name: "context-mode", owner: { name: "o" }, plugins: [{ name: "context-mode", source: "./", version }] });
  put(pkg, ".claude-plugin/plugin.json", { name: "context-mode", version });
  put(pkg, "server.mjs", "// s");
  put(pkg, "hook.mjs", "// h");
  put(pkg, "gemini-extension.json", { name: "context-mode", version, mcpServers: { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "gemini"] } } });
  put(pkg, "hooks/hooks.json", { hooks: { BeforeTool: [{ hooks: [{ type: "command", command: 'node "${extensionPath}${/}hook.mjs" --agent gemini' }] }] } });
  put(pkg, "hooks/qwen.json", { hooks: {} });
  put(pkg, "qwen-extension.json", { name: "context-mode", version, hooks: "hooks/qwen.json", mcpServers: { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "qwen"] } } });
  return { root, bare, work, pkg };
}
const run = (fx, version, extra = []) =>
  spawnSync(process.execPath, [SCRIPT, "--pkg", fx.pkg, "--version", version, "--remote", fx.bare, ...extra], { cwd: fx.work, encoding: "utf8" });

test("[MAIN-ONLY] commit-main: one release commit on main with the built tree, annotated tag on it, both pushed", (t) => {
  const fx = fixture(t, "2.0.0-next.9");
  const r = run(fx, "2.0.0-next.9");
  assert.equal(r.status, 0, r.stderr);
  const head = git(fx.bare, "rev-parse", "refs/heads/main");
  assert.equal(git(fx.bare, "log", "-1", "--format=%s", head), "chore(release): v2.0.0-next.9");
  assert.equal(git(fx.bare, "cat-file", "-t", "refs/tags/v2.0.0-next.9"), "tag");
  assert.equal(git(fx.bare, "rev-parse", "refs/tags/v2.0.0-next.9^{}"), head);
  const files = git(fx.bare, "ls-tree", "-r", "--name-only", head).split("\n");
  for (const f of ["plugins/claude-code/server.mjs", "plugins/claude-code/SHA256SUMS", ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json", "gemini-extension.json", "hooks/hooks.json", "qwen-extension.json", "README.md"]) {
    assert.ok(files.includes(f), f + " in " + files.join(","));
  }
  assert.equal(git(fx.bare, "log", "-2", "--format=%an").split("\n")[0], "github-actions[bot]");
});

test("[MAIN-ONLY] commit-main: main moved meanwhile -> rebase onto it and push again; the tag names the pushed commit", (t) => {
  const fx = fixture(t, "2.0.0");
  const racer = path.join(fx.root, "racer");
  git(fx.root, "clone", "-q", fx.bare, racer);
  // The racer is a second clone: it needs its own identity, a CI runner has no global one.
  const g = `git -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false -C "${racer}"`;
  const r = run(fx, "2.0.0", ["--before-push", `${g} commit -q --allow-empty -m "docs: raced" && ${g} push -q origin HEAD:refs/heads/main`]);
  assert.equal(r.status, 0, r.stderr);
  const head = git(fx.bare, "rev-parse", "refs/heads/main");
  assert.equal(git(fx.bare, "rev-parse", "refs/tags/v2.0.0^{}"), head);
  assert.ok(git(fx.bare, "log", "--format=%s", head).includes("docs: raced"));
});

test("[MAIN-ONLY] commit-main: tag already on the remote -> exit 1, nothing pushed", (t) => {
  const fx = fixture(t, "2.0.0");
  git(fx.work, "tag", "-a", "v2.0.0", "-m", "v2.0.0");
  git(fx.work, "push", "-q", fx.bare, "refs/tags/v2.0.0");
  const before = git(fx.bare, "rev-parse", "refs/heads/main");
  const r = run(fx, "2.0.0");
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "release failed: tag v2.0.0 is already on the remote\n");
  assert.equal(git(fx.bare, "rev-parse", "refs/heads/main"), before);
});

test("[MAIN-ONLY] commit-main: package version differs from --version -> exit 1", (t) => {
  const fx = fixture(t, "2.0.0");
  const r = run(fx, "2.0.1");
  assert.equal(r.status, 1);
  assert.ok(r.stderr.startsWith("release failed: "), r.stderr);
  assert.ok(!existsSync(path.join(fx.bare, "refs", "tags", "v2.0.1")));
});

test("[MAIN-ONLY] commit-main: --rollback-to <sha> restores the generated paths from that release commit as a forward commit, no tag", (t) => {
  const fx = fixture(t, "2.0.0");
  assert.equal(run(fx, "2.0.0").status, 0);
  const good = git(fx.bare, "rev-parse", "refs/heads/main");
  put(fx.pkg, "package.json", { name: "context-mode", version: "2.0.1" });
  assert.equal(run(fx, "2.0.1").status, 0);
  const r = spawnSync(process.execPath, [SCRIPT, "--rollback-to", good, "--remote", fx.bare], { cwd: fx.work, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const head = git(fx.bare, "rev-parse", "refs/heads/main");
  assert.notEqual(head, good);
  assert.equal(git(fx.bare, "merge-base", "--is-ancestor", good, head) === "", true);
  assert.equal(git(fx.bare, "log", "-1", "--format=%s", head), `chore(release): roll back to ${good.slice(0, 12)}`);
  assert.equal(git(fx.bare, "diff", "--stat", good, head, "--", "plugins", ".agents", ".claude-plugin", "gemini-extension.json", "hooks", "qwen-extension.json"), "");
  assert.equal(spawnSync("git", ["rev-parse", "--verify", "--quiet", "refs/tags/v2.0.2"], { cwd: fx.bare }).status, 1);
});
