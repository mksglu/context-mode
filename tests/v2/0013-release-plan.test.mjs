// ADR-0013 (release automation), ADR-0019 (npm channel), PRD-v2 section 14: release plan, smoke, rollback, npm tarball check.
// One file per ADR area (docs/v2/TEST-LAYOUT.md, ADR-0024); a fix adds its red test here.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Sections are independent: each builds its own temp git repos and stubs; none changes process.env or the cwd, so they run concurrently.
describe("ADR-0013 / ADR-0019 / PRD-v2 section 14 release plan", { concurrency: true }, () => {
describe("ADR-0013 release: plan", () => {
  // Unit tests for scripts/release/plan.mjs (impl/13 §10, A11, DEVIATIONS D-M6-arch-4).
  // Each test seeds a scratch git repo and runs the real script in it.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const PLAN = path.join(REPO, "scripts", "release", "plan.mjs");
  const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

  function git(dir, ...args) {
    const r = spawnSync("git", [...GIT_ID, ...args], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  }

  function commit(dir, subject) {
    git(dir, "commit", "--allow-empty", "-q", "-m", subject);
    return git(dir, "rev-parse", "HEAD");
  }

  // A work repo with a local bare `origin` (plan.mjs reads the pushed tags there; D-FU-RF-1).
  function seed(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-v2-plan-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bare = path.join(root, "origin.git");
    const dir = path.join(root, "work");
    git(root, "init", "-q", "--bare", bare);
    git(root, "init", "-q", dir);
    git(dir, "remote", "add", "origin", bare);
    return dir;
  }

  // release branch commit: plugin.json at `version` and the Source-Commit trailer. Makes the branch as an
  // orphan, or adds a child when it exists. tag: "annotated" (pushed v<version>), "lightweight", or "none"
  // (a rehearsal commit: nothing pushed to origin).
  function release(dir, version, sourceSha, { tag = "annotated" } = {}) {
    const exists = spawnSync("git", ["rev-parse", "--verify", "--quiet", "refs/heads/release"], { cwd: dir }).status === 0;
    if (exists) {
      git(dir, "checkout", "-q", "release");
    } else {
      git(dir, "checkout", "-q", "--orphan", "release");
      git(dir, "rm", "-rq", "--cached", "--ignore-unmatch", ".");
    }
    mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "context-mode", version }));
    git(dir, "add", ".claude-plugin/plugin.json");
    git(dir, "commit", "-q", "-m", `release ${version}\n\nSource-Commit: ${sourceSha}`);
    rmSync(path.join(dir, ".claude-plugin"), { recursive: true, force: true });
    if (tag === "annotated") git(dir, "tag", "-a", `v${version}`, "-m", `v${version}`, "release");
    if (tag === "lightweight") git(dir, "tag", `v${version}`, "release");
    if (tag !== "none") git(dir, "push", "-q", "origin", `refs/tags/v${version}`);
    git(dir, "checkout", "-q", "main");
  }

  function plan(dir, ...args) {
    const r = spawnSync(process.execPath, [PLAN, ...args], { cwd: dir, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  function released(t, version, after, opts) {
    const dir = seed(t);
    commit(dir, "feat: old feature");
    const src = commit(dir, "fix: old fix");
    release(dir, version, src, opts);
    for (const s of after) commit(dir, s);
    return dir;
  }

  function versionOf(stdout) {
    return stdout.split("\n")[0];
  }

  test("[M6] release/plan: no release branch -> first release 2.0.0 (A11)", (t) => {
    const dir = seed(t);
    commit(dir, "chore: init");
    commit(dir, "feat: first");
    const r = plan(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.0");
  });

  test("[M6] release/plan: fix/perf since Source-Commit -> patch", (t) => {
    const r = plan(released(t, "2.0.0", ["fix: a", "perf(store): b", "docs: c"]));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.1");
  });

  test("[M6] release/plan: feat -> minor, patch resets", (t) => {
    const r = plan(released(t, "2.3.4", ["fix: a", "feat(tools): b"]));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.4.0");
  });

  test("[M6] release/plan: feat! and fix(core)! -> major", (t) => {
    for (const s of ["feat!: drop x", "fix(core)!: change y"]) {
      const r = plan(released(t, "2.3.4", ["feat: a", s]));
      assert.equal(r.status, 0, r.stderr);
      assert.equal(versionOf(r.stdout), "version=3.0.0");
    }
  });

  test("[M6] release/plan: commits before the Source-Commit trailer are not counted", (t) => {
    // "feat: old feature" sits before the trailer sha; only the fix after it counts.
    const r = plan(released(t, "2.0.0", ["fix: only this"]));
    assert.equal(versionOf(r.stdout), "version=2.0.1");
    assert.ok(!r.stdout.includes("old feature"));
  });

  test("[M6] release/plan: no releasable commit -> exit 1, one stderr line", (t) => {
    const dir = released(t, "2.0.0", ["docs: a", "chore: b", "featx: c"]);
    const src = git(dir, "log", "-1", "--format=%B", "release").split("Source-Commit: ")[1].trim();
    const r = plan(dir);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, `release failed: no releasable commits since ${src}\n`);
  });

  test("[M6] release/plan: GITHUB_OUTPUT form, notes grouped by type", (t) => {
    const r = plan(released(t, "2.0.0", ["fix: f1", "feat(a): n1", "perf: p1", "feat!: b1", "chore: skip me"]));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, [
      "version=3.0.0",
      "notes<<EOF",
      "### Breaking", "- feat!: b1", "",
      "### Features", "- feat(a): n1", "",
      "### Fixes", "- fix: f1", "",
      "### Performance", "- perf: p1",
      "EOF", "",
    ].join("\n"));
  });

  test("[M6] release/plan: --dry-run prints text, --skip-live adds the line", (t) => {
    const r = plan(released(t, "2.0.0", ["fix: f1"]), "--dry-run", "--skip-live");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, [
      "version: 2.0.1", "",
      "### Fixes", "- fix: f1", "",
      "Live E2E skipped for this release.", "",
    ].join("\n"));
  });

  test("[M6] release/plan: unknown flag -> exit 1", (t) => {
    const r = plan(released(t, "2.0.0", ["fix: f1"]), "--bogus");
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "release failed: unknown argument --bogus\n");
  });

  // D-FU-RF-1: the last release is the newest annotated v2+ tag on origin that the release branch contains.

  test("[M6] release/plan: rehearsal release branch (no pushed tag) -> 2.0.0 over all history", (t) => {
    const dir = released(t, "2.0.0", ["fix: after the rehearsal"], { tag: "none" });
    const r = plan(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.0");
    assert.ok(r.stdout.includes("- feat: old feature"), "range is the whole history, not since the rehearsal trailer");
    assert.ok(r.stdout.includes("- fix: after the rehearsal"));
  });

  test("[M6] release/plan: rehearsal branch with only docs commits after it still plans 2.0.0", (t) => {
    const r = plan(released(t, "2.0.0", ["docs: a"], { tag: "none" }));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.0");
  });

  test("[M6] release/plan: tagged v2.0.0 on origin + new commits -> next version", (t) => {
    const dir = released(t, "2.0.0", ["feat: new"]);
    const r = plan(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.1.0");
  });

  test("[M6] release/plan: the newest tagged release on the branch is the base, an untagged commit after it is ignored", (t) => {
    const dir = released(t, "2.0.0", []);
    const src2 = commit(dir, "fix: second release source");
    release(dir, "2.0.1", src2);
    const src3 = commit(dir, "docs: later");
    release(dir, "2.0.2", src3, { tag: "none" }); // a rehearsal commit on top of the tagged release
    commit(dir, "fix: newest");
    const r = plan(dir, "--dry-run");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, ["version: 2.0.2", "", "### Fixes", "- fix: newest", ""].join("\n"));
  });

  test("[M6] release/plan: tagged release v2.0.0 that the release branch does not contain -> refuse", (t) => {
    const dir = released(t, "2.0.0", ["fix: a"]);
    const tagged = git(dir, "rev-parse", "v2.0.0^{commit}");
    git(dir, "branch", "-D", "release");
    release(dir, "2.0.0", commit(dir, "fix: other source"), { tag: "none" }); // a new orphan release branch
    const r = plan(dir);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, `release failed: tagged release v2.0.0 (${tagged}) is not in release; refusing\n`);
  });

  test("[M6] release/plan: tagged release on origin but no release branch -> refuse", (t) => {
    const dir = released(t, "2.0.0", ["fix: a"]);
    git(dir, "branch", "-D", "release");
    const r = plan(dir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.startsWith("release failed: tagged release v2.0.0 ("), r.stderr);
  });

  test("[M6] release/plan: v1 tags and lightweight v2 tags on origin are not releases", (t) => {
    const dir = seed(t);
    commit(dir, "chore: init");
    git(dir, "tag", "-a", "v1.0.0", "-m", "v1.0.0");
    git(dir, "push", "-q", "origin", "refs/tags/v1.0.0");
    const src = commit(dir, "feat: first");
    const noBranch = plan(dir);
    assert.equal(noBranch.status, 0, noBranch.stderr);
    assert.equal(versionOf(noBranch.stdout), "version=2.0.0");
    release(dir, "2.0.0", src, { tag: "lightweight" }); // pushed as a lightweight tag: not a release
    const r = plan(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.0");
  });

  test("[M6] release/plan: origin that cannot be read -> exit 1, one stderr line", (t) => {
    const dir = released(t, "2.0.0", ["fix: a"]);
    git(dir, "remote", "set-url", "origin", path.join(dir, "no-such-remote"));
    const r = plan(dir);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.ok(r.stderr.startsWith("release failed: git ls-remote origin: "), r.stderr);
    assert.equal(r.stderr.trim().split("\n").length, 1);
  });

  // Release-next (D-RN-TAG-1): release.yml started by a pushed v2.* tag passes --tag <name>. The version is
  // the tag without "v" (a semver prerelease is allowed), never a bump; notes cover commits since the last
  // tagged release, or all history on the first one.
  function pushTag(dir, name, ref = "HEAD") {
    git(dir, "tag", "-a", name, "-m", name, ref);
    git(dir, "push", "-q", "origin", `refs/tags/${name}`);
  }

  test("[RN] release/plan: --tag v2.0.0-next.1 on HEAD, first release -> that version, notes over all history", (t) => {
    const dir = seed(t);
    commit(dir, "feat: first");
    commit(dir, "fix: second");
    pushTag(dir, "v2.0.0-next.1");
    const r = plan(dir, "--tag", "v2.0.0-next.1");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.0-next.1");
    assert.ok(r.stdout.includes("- feat: first") && r.stdout.includes("- fix: second"), r.stdout);
  });

  test("[RN] release/plan: --tag after a tagged release -> no bump, notes since that release's Source-Commit", (t) => {
    for (const name of ["v2.1.0-next.1", "v2.0.5"]) {
      const dir = released(t, "2.0.0", ["feat: new", "docs: d"]);
      pushTag(dir, name);
      const r = plan(dir, "--tag", name);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(versionOf(r.stdout), `version=${name.slice(1)}`);
      assert.ok(r.stdout.includes("- feat: new"), r.stdout);
      assert.ok(!r.stdout.includes("old feature") && !r.stdout.includes("old fix"), r.stdout);
    }
  });

  test("[RN] release/plan: --tag with only non-releasable commits still plans (the tag is the decision)", (t) => {
    const dir = released(t, "2.0.0", ["docs: only"]);
    pushTag(dir, "v2.0.1-next.1");
    const r = plan(dir, "--tag", "v2.0.1-next.1");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(versionOf(r.stdout), "version=2.0.1-next.1");
  });

  test("[RN] release/plan: --tag that is not a v2+ semver tag -> exit 1, one stderr line", (t) => {
    const dir = seed(t);
    commit(dir, "feat: first");
    for (const bad of ["2.0.0-next.1", "v2.0.0-", "v2.0.0-next..1", "v2.0.0-next.01", "v2.0", "v1.0.0-next.1", "v2.0.0+b"]) {
      const r = plan(dir, "--tag", bad);
      assert.equal(r.status, 1, bad);
      assert.equal(r.stdout, "", bad);
      assert.equal(r.stderr, `release failed: --tag ${bad} is not v<x.y.z>[-<prerelease>] with major >= 2\n`, bad);
    }
    const none = plan(dir, "--tag");
    assert.equal(none.status, 1);
    assert.equal(none.stderr, "release failed: --tag needs a value\n");
  });

  test("[RN] release/plan: --tag not pushed, or pushed on another commit -> refuse", (t) => {
    const dir = seed(t);
    const first = commit(dir, "feat: first");
    commit(dir, "fix: second");
    const missing = plan(dir, "--tag", "v2.0.0-next.1");
    assert.equal(missing.status, 1);
    assert.equal(missing.stderr, "release failed: tag v2.0.0-next.1 is not on origin\n");
    pushTag(dir, "v2.0.0-next.1", first);
    const other = plan(dir, "--tag", "v2.0.0-next.1");
    assert.equal(other.status, 1);
    assert.equal(other.stderr, `release failed: tag v2.0.0-next.1 on origin points at ${first}, not HEAD ${git(dir, "rev-parse", "HEAD")}\n`);
  });
});

describe("ADR-0013 release: smoke", () => {
  // Unit tests for scripts/release/smoke.mjs (impl/13-build-release.md §11.2, DEVIATIONS D-M6-arch-5, D-M6-P3-1..3).
  // Runs the real script against a local bare repo (file://) with stub agent CLIs on PATH; nothing leaves the machine.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SCRIPT = path.join(REPO, "scripts", "release", "smoke.mjs");
  const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  const POSIX = process.platform !== "win32";

  function git(cwd, ...args) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  }

  // A fake MCP server: answers the first request line with an initialize result named <name>.
  const serverSrc = (name) => `process.stdin.once("data", (d) => { const m = JSON.parse(String(d).split("\\n")[0]);
process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: {}, serverInfo: { name: ${JSON.stringify(name)}, version: "t" } } }) + "\\n"); process.exit(0); });\n`;

  // Stub CLIs (test code; they read only what smoke.mjs writes). Each records the HOME it saw in $TMPDIR/probe-<cli>.json.
  const STUBS = {
    claude: `const fs = require("fs"), path = require("path"), cp = require("child_process");
const a = process.argv.slice(2), H = process.env.HOME, st = path.join(H, "stub-claude.json");
fs.writeFileSync(path.join(process.env.TMPDIR, "probe-claude.json"), JSON.stringify({ home: H, argv: a }));
const s = fs.existsSync(st) ? JSON.parse(fs.readFileSync(st, "utf8")) : {};
const save = () => fs.writeFileSync(st, JSON.stringify(s));
if (a[1] === "marketplace") { s.mkt = JSON.parse(fs.readFileSync(path.join(a[3], ".claude-plugin", "marketplace.json"), "utf8")); s.root = a[3]; save(); }
else if (a[1] === "install" && typeof s.mkt.plugins[0].source === "string") { const p = s.mkt.plugins[0]; const dir = path.join(H, ".claude", "plugins", "cache", s.mkt.name, p.name, "v");
  fs.cpSync(path.join(s.root, p.source), dir, { recursive: true }); s.id = a[2]; s.dir = dir; save(); }
else if (a[1] === "install") { const p = s.mkt.plugins[0]; const dir = path.join(H, ".claude", "plugins", "cache", s.mkt.name, p.name, "v");
  cp.execFileSync("git", ["clone", "-q", "--branch", p.source.ref, p.source.url, dir]); s.id = a[2]; s.dir = dir; save(); }
else if (a[1] === "list") process.stdout.write(JSON.stringify(s.id ? [{ id: s.id, installPath: s.dir }] : []));
else if (a[1] === "validate") process.exit(fs.existsSync(path.join(a[2], ".claude-plugin", "plugin.json")) ? 0 : 1);
else process.exit(2);`,
    // codex: `plugin marketplace add <dir>`, `plugin add <id>`, `plugin list --json` (installed copy of a local source) and
    // `mcp list --json` (reads the installed plugin's .codex-plugin/mcp.json, else the config.toml entry of the release layout).
    // Every call is logged to $TMPDIR/codex-argv.log. An npm source cannot install here (exit 3), as with an offline registry.
    codex: `const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), CH = process.env.CODEX_HOME;
fs.writeFileSync(path.join(process.env.TMPDIR, "probe-codex.json"), JSON.stringify({ home: process.env.HOME, codexHome: CH }));
fs.appendFileSync(path.join(process.env.TMPDIR, "codex-argv.log"), JSON.stringify(a) + "\\n");
const st = path.join(CH, "stub-plugin.json");
const s = fs.existsSync(st) ? JSON.parse(fs.readFileSync(st, "utf8")) : {};
const save = () => fs.writeFileSync(st, JSON.stringify(s));
if (a[0] === "plugin" && a[1] === "marketplace" && a[2] === "add") { s.root = a[3]; s.mkt = JSON.parse(fs.readFileSync(path.join(a[3], ".agents", "plugins", "marketplace.json"), "utf8")); save(); }
else if (a[0] === "plugin" && a[1] === "add") { const e = s.mkt.plugins[0]; if (e.source.source !== "local") { process.stderr.write("unsupported source " + e.source.source + "\\n"); process.exit(3); }
  const src = path.join(s.root, e.source.path), dir = path.join(CH, "plugins", "cache", s.mkt.name, e.name, "v");
  fs.cpSync(src, dir, { recursive: true }); s.id = e.name + "@" + s.mkt.name; s.src = src; s.dir = dir; save(); }
else if (a[0] === "plugin" && a[1] === "list") { const v = s.dir ? JSON.parse(fs.readFileSync(path.join(s.dir, ".codex-plugin", "plugin.json"), "utf8")).version : null;
  process.stdout.write(JSON.stringify({ installed: s.id ? [{ pluginId: s.id, name: "context-mode", version: v, installed: true, enabled: true, source: { source: "local", path: s.src } }] : [] })); }
else if (a[0] === "mcp" && s.dir) { const m = JSON.parse(fs.readFileSync(path.join(s.dir, ".codex-plugin", "mcp.json"), "utf8")).mcpServers["context-mode"];
  process.stdout.write(JSON.stringify([{ name: "context-mode", transport: { type: "stdio", command: m.command, args: m.args, cwd: path.join(s.dir, m.cwd) } }])); }
else if (a[0] === "mcp") { const lines = fs.readFileSync(path.join(CH, "config.toml"), "utf8").split("\\n");
  const val = (k) => JSON.parse(lines.find((l) => l.startsWith(k + " = ")).slice(k.length + 3));
  process.stdout.write(JSON.stringify([{ name: lines[0].slice(1, -1).split(".")[1], transport: { type: "stdio", command: val("command"), args: val("args") } }])); }
else process.exit(2);`,
    gemini: `process.stderr.write("not logged in\\n"); process.exit(41);`,
    // qwen: `extensions install <dir>:<plugin> --consent` copies <dir> to $HOME/.qwen/extensions/<plugin>
    qwen: `const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), src = a[2].slice(0, a[2].lastIndexOf(":")), name = a[2].slice(a[2].lastIndexOf(":") + 1);
fs.cpSync(src, path.join(process.env.HOME, ".qwen", "extensions", name), { recursive: true });
process.stdout.write("Extension installed\\n");`,
  };

  // tmp root: bare repo with branch release-staging carrying a tiny release tree; bin dir with node + git + chosen stubs.
  function fixture(t, { stubs = [], serverName = "context-mode" } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-v2-smoke-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bare = path.join(root, "remote.git");
    const seed = path.join(root, "seed");
    git(root, "init", "-q", "--bare", bare);
    git(root, "init", "-q", "-b", "release-staging", seed);
    mkdirSync(path.join(seed, ".claude-plugin"));
    writeFileSync(path.join(seed, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "context-mode", version: "0.0.0-dev" }));
    writeFileSync(path.join(seed, "server.mjs"), serverSrc(serverName));
    git(seed, "add", "-A");
    git(seed, "commit", "-q", "-m", "release v0.0.0");
    git(seed, "push", "-q", bare, "release-staging");
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    symlinkSync(process.execPath, path.join(bin, "node"));
    for (const name of stubs) {
      writeFileSync(path.join(bin, name), `#!${process.execPath}\n${STUBS[name]}\n`);
      chmodSync(path.join(bin, name), 0o755);
    }
    const tmp = path.join(root, "tmp");
    mkdirSync(tmp);
    // The dir on this process's PATH that holds git (git.exe on Windows). No `which`: Windows has none,
    // and Git for Windows' libexec/git-core binary needs DLLs from another dir (M7-W5).
    const gitDir = (process.env.PATH ?? "").split(path.delimiter)
      .find((d) => d !== "" && ["git", "git.exe"].some((n) => existsSync(path.join(d, n))));
    assert.ok(gitDir, "git on PATH");
    const PATH = [bin, gitDir].join(path.delimiter);
    return { root, repo: pathToFileURL(bare).href, tmp, PATH, stubs };
  }

  function smoke(fx, ...args) {
    // The claude stubs are scripts, not binaries: name the stub explicitly (D-FU-RF-2); PATH resolution has its own tests.
    const override = fx.stubs.includes("claude") ? { CONTEXT_MODE_SMOKE_CLAUDE: path.join(fx.root, "bin", "claude") } : {};
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: "utf8",
      env: { PATH: fx.PATH, HOME: process.env.HOME, TMPDIR: fx.tmp, ...override, ...(fx.env ?? {}) } });
    return { status: r.status, out: r.stdout, err: r.stderr };
  }
  const smokeHomes = (fx) => readdirSync(fx.tmp).filter((n) => n.startsWith("context-mode-smoke-"));

  test("[M6] release/smoke: unknown --agent exits 1 and names the four agents", (t) => {
    const fx = fixture(t);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "nope", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.includes("claude-code, codex, gemini, qwen"), r.err);
  });

  test("[M6] release/smoke: gemini CLI absent is SKIPPED, exit 0", (t) => {
    const fx = fixture(t);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, "gemini: SKIPPED: gemini not available\n");
  });

  test("[M6] release/smoke: gemini CLI present but failing (not logged in) is SKIPPED, exit 0", { skip: !POSIX }, (t) => {
    const fx = fixture(t, { stubs: ["gemini"] });
    const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, "gemini: SKIPPED: gemini not available\n");
  });

  test("[M6] release/smoke: codex clones <repo>@<ref>, writes the config.toml entry, server answers initialize", { skip: !POSIX }, (t) => {
    const fx = fixture(t, { stubs: ["codex"] });
    const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("codex: PASS: "), r.out);
    const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-codex.json"), "utf8"));
    assert.equal(probe.codexHome, path.join(probe.home, ".codex"));
    assert.ok(probe.home.startsWith(realpathSync.native(fx.tmp)), "CODEX_HOME sits in the throwaway HOME");
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
  });

  // D-RN-WIN-1: v2.0.0-next.1 smoke (windows-latest) failed "spawnSync codex ENOENT": npm on Windows puts only
  // codex.cmd/codex.ps1 on PATH. An npm-style .cmd shim per agent CLI, in a dir whose name has a space.
  function winShim(fx, name, src) {
    const dir = path.join(fx.root, "npm bin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${name}.js`), `${src}\n`);
    writeFileSync(path.join(dir, `${name}.cmd`), `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`);
    fx.PATH = [dir, path.dirname(process.execPath), fx.PATH].join(path.delimiter); // node.exe for the server handshake
    fx.env = { TEMP: fx.tmp, TMP: fx.tmp, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec };
  }

  test("[RN] release/smoke: on Windows codex is the npm codex.cmd shim; smoke runs it and passes (D-RN-WIN-1)", { skip: POSIX && "cmd.exe is Windows only" }, (t) => {
    const fx = fixture(t);
    winShim(fx, "codex", STUBS.codex);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("codex: PASS: "), r.out);
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
  });

  test("[RN] release/smoke: on Windows gemini is the npm gemini.cmd shim; smoke runs it with every argument (D-RN-WIN-1)", { skip: POSIX && "cmd.exe is Windows only" }, (t) => {
    const fx = fixture(t);
    winShim(fx, "gemini", `require("fs").writeFileSync(require("path").join(process.env.TMPDIR, "probe-gemini.json"), JSON.stringify(process.argv.slice(2)));`);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("gemini: PASS: "), r.out);
    assert.deepEqual(JSON.parse(readFileSync(path.join(fx.tmp, "probe-gemini.json"), "utf8")),
      ["extensions", "install", fx.repo, "--ref", "release-staging", "--auto-update", "--consent", "--skip-settings"]);
  });

  // D-RN-GEM-1: v2.0.0-next.2 smoke (ubuntu/macos) hung 20 min on the gemini step. gemini 0.65 relaunches itself as a
  // child node process (stdio inherited, so the child holds smoke's pipes) and, without --consent, the child asks
  // "workspace ... is not trusted ... Do you want to continue? [Y/n]" and waits. This stub does the same: the
  // relaunched child records its argv, passes on --consent, and otherwise waits (bounded, so no process is left behind).
  const geminiRelaunch = (childBody) => `const cp = require("child_process"), fs = require("fs"), path = require("path");
const a = process.argv.slice(2);
if (!process.env.STUB_GEMINI_CHILD) {
  const c = cp.spawn(process.execPath, [__filename, ...a], { stdio: "inherit", env: { ...process.env, STUB_GEMINI_CHILD: "1" } });
  c.on("exit", (code) => process.exit(code ?? 1));
} else { ${childBody} }`;
  const GEMINI_065 = geminiRelaunch(`fs.writeFileSync(path.join(process.env.TMPDIR, "probe-gemini.json"), JSON.stringify(a));
  if (a.includes("--consent")) { process.stdout.write('Extension "context-mode" installed successfully and enabled.\\n'); process.exit(0); }
  process.stdout.write("The current workspace is not trusted. Do you want to continue? [Y/n]: ");
  setTimeout(() => process.exit(1), 20000);`);
  const GEMINI_HANG = geminiRelaunch(`setTimeout(() => process.exit(1), 20000);`);

  function geminiStub(fx, src) {
    writeFileSync(path.join(fx.root, "bin", "gemini"), `#!${process.execPath}\n${src}\n`);
    chmodSync(path.join(fx.root, "bin", "gemini"), 0o755);
  }

  test("[RN] release/smoke: gemini install runs with --consent and --skip-settings, so no trust prompt waits (D-RN-GEM-1)", { skip: !POSIX }, (t) => {
    const fx = fixture(t);
    geminiStub(fx, GEMINI_065);
    const t0 = Date.now();
    const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, `gemini: PASS: gemini extensions install ${fx.repo} --ref release-staging passed\n`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(fx.tmp, "probe-gemini.json"), "utf8")),
      ["extensions", "install", fx.repo, "--ref", "release-staging", "--auto-update", "--consent", "--skip-settings"]);
    assert.ok(Date.now() - t0 < 15000, `smoke took ${Date.now() - t0} ms`);
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
  });

  test("[RN] release/smoke: a step whose relaunched child holds the pipes still stops at the step timeout (D-RN-GEM-1)", { skip: !POSIX }, (t) => {
    const fx = fixture(t);
    geminiStub(fx, GEMINI_HANG);
    fx.env = { CONTEXT_MODE_SMOKE_TIMEOUT_MS: "1000" };
    const t0 = Date.now();
    const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
    const ms = Date.now() - t0;
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, "gemini: SKIPPED: gemini not available\n");
    assert.ok(ms < 10000, `smoke took ${ms} ms; the 1000 ms step timeout did not hold`);
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
  });

  test("[M6] release/smoke: codex FAIL when the installed server does not answer as context-mode", { skip: !POSIX }, (t) => {
    const fx = fixture(t, { stubs: ["codex"], serverName: "other" });
    const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("codex: FAIL: "), r.err);
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed on failure too");
  });

  test("[M6] release/smoke: codex CLI absent is FAIL (codex is not a skipped leg)", (t) => {
    const fx = fixture(t);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("codex: FAIL: codex mcp list --json"), r.err);
  });

  test("[M6] release/smoke: claude-code installs context-mode@context-mode from <repo>@<ref> in a throwaway HOME and validates it", { skip: !POSIX }, (t) => {
    const fx = fixture(t, { stubs: ["claude"] });
    const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("claude-code: PASS: installed context-mode@context-mode"), r.out);
    const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-claude.json"), "utf8"));
    assert.notEqual(probe.home, process.env.HOME);
    assert.deepEqual(probe.argv.slice(0, 2), ["plugin", "validate"], "validate is the last step");
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
  });

  test("[M6] release/smoke: claude-code FAIL names the first failing command (bad --ref)", { skip: !POSIX }, (t) => {
    const fx = fixture(t, { stubs: ["claude"] });
    const r = smoke(fx, "--ref", "no-such-branch", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith(`claude-code: FAIL: ${realpathSync(path.join(fx.root, "bin", "claude"))} plugin install context-mode@context-mode`), r.err);
    const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-claude.json"), "utf8"));
    assert.equal(probe.argv[1], "install", "no later step ran");
  });

  // D-FU-RF-2: smoke runs the real claude binary (Mach-O/ELF/PE magic), never a shim script on PATH.
  // A real binary for the test: a symlink to node. `claude plugin ...` then fails inside node, which proves which file ran.
  function claudeOnPath(t, { shim, real }) {
    const fx = fixture(t);
    const dirs = [];
    if (shim) {
      const d = path.join(fx.root, "shimbin");
      mkdirSync(d);
      writeFileSync(path.join(d, "claude"), `#!/bin/sh\necho shim-ran > ${JSON.stringify(path.join(fx.root, "shim-ran"))}\nexit 0\n`);
      chmodSync(path.join(d, "claude"), 0o755);
      dirs.push(d);
    }
    if (real) {
      const d = path.join(fx.root, "realbin");
      mkdirSync(d);
      symlinkSync(process.execPath, path.join(d, "claude"));
      dirs.push(d);
    }
    fx.PATH = [...dirs, fx.PATH].join(path.delimiter);
    return fx;
  }

  test("[M6] release/smoke: claude-code skips a shim script on PATH and runs the real binary behind it", { skip: !POSIX }, (t) => {
    const fx = claudeOnPath(t, { shim: true, real: true });
    const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 1, "the symlinked node is not a claude, so the first plugin command fails");
    assert.ok(r.err.startsWith(`claude-code: FAIL: ${realpathSync(process.execPath)} plugin marketplace add`), r.err);
    assert.ok(!existsSync(path.join(fx.root, "shim-ran")), "the shim script never ran");
  });

  test("[M6] release/smoke: claude-code with only a shim script on PATH fails with a clear message", { skip: !POSIX }, (t) => {
    const fx = claudeOnPath(t, { shim: true, real: false });
    const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("claude-code: FAIL: no real claude binary on PATH"), r.err);
    assert.ok(r.err.includes("shim script"), r.err);
    assert.ok(!existsSync(path.join(fx.root, "shim-ran")), "the shim script never ran");
    assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
  });

  test("[M6] release/smoke: claude-code with no claude on PATH fails with the same clear message", (t) => {
    const fx = fixture(t);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("claude-code: FAIL: no real claude binary on PATH"), r.err);
  });

  test("[M6] release/smoke: CONTEXT_MODE_SMOKE_CLAUDE naming a missing file fails with a clear message", (t) => {
    const fx = fixture(t);
    fx.env = { CONTEXT_MODE_SMOKE_CLAUDE: path.join(fx.root, "nope") };
    const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("claude-code: FAIL: CONTEXT_MODE_SMOKE_CLAUDE "), r.err);
  });

  test("[M6] release/smoke: claude-code finds the native claude.exe under node_modules beside a shim (npm on Windows layout)", { skip: !POSIX }, (t) => {
    const fx = fixture(t);
    const d = path.join(fx.root, "npmbin");
    mkdirSync(path.join(d, "node_modules", "@anthropic-ai", "claude-code", "bin"), { recursive: true });
    writeFileSync(path.join(d, "claude"), "#!/bin/sh\ntouch " + JSON.stringify(path.join(fx.root, "shim-ran")) + "\n");
    chmodSync(path.join(d, "claude"), 0o755);
    symlinkSync(process.execPath, path.join(d, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"));
    fx.PATH = [d, fx.PATH].join(path.delimiter);
    const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith(`claude-code: FAIL: ${realpathSync(process.execPath)} plugin marketplace add`), r.err);
    assert.ok(!existsSync(path.join(fx.root, "shim-ran")));
  });

  // MAIN-ONLY (docs/v2/release/MAIN-ONLY.md): --layout main smokes the tree a release commit on main holds: the built
  // plugin under plugins/claude-code, root manifests for Gemini and Qwen. The "remote" is a bare repo with branch main.
  function mainFixture(t, opts) {
    const fx = fixture(t, opts);
    const seed = path.join(fx.root, "seed-main");
    git(fx.root, "init", "-q", "-b", "main", seed);
    const plugin = path.join(seed, "plugins", "claude-code");
    mkdirSync(path.join(plugin, ".claude-plugin"), { recursive: true });
    writeFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "context-mode", version: "0.0.0-dev" }));
    writeFileSync(path.join(plugin, "server.mjs"), serverSrc(opts?.serverName ?? "context-mode"));
    mkdirSync(path.join(seed, ".claude-plugin"));
    writeFileSync(path.join(seed, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ name: "context-mode", owner: { name: "o" }, plugins: [{ name: "context-mode", source: "./plugins/claude-code" }] }));
    mkdirSync(path.join(plugin, ".codex-plugin"));
    writeFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "context-mode", version: "0.0.0-dev", mcpServers: "./.codex-plugin/mcp.json" }));
    writeFileSync(path.join(plugin, ".codex-plugin", "mcp.json"), JSON.stringify({ mcpServers: { "context-mode": { command: "node", args: ["./server.mjs", "--agent", "codex"], cwd: "." } } }));
    mkdirSync(path.join(seed, ".agents", "plugins"), { recursive: true });
    writeFileSync(path.join(seed, ".agents", "plugins", "marketplace.json"), JSON.stringify({ name: "context-mode", plugins: [{ name: "context-mode",
      source: opts?.codexSource ?? { source: "local", path: "./plugins/claude-code" } }] }));
    writeFileSync(path.join(seed, "qwen-extension.json"), JSON.stringify({ name: "context-mode", mcpServers: { "context-mode": { command: "node", args: ["x/plugins/claude-code/server.mjs", "--agent", fx.qwenAgent ?? "qwen"] } } }));
    git(seed, "add", "-A");
    git(seed, "commit", "-q", "-m", "chore(release): v0.0.0");
    git(seed, "push", "-q", path.join(fx.root, "remote.git"), "main");
    return fx;
  }

  test("[MAIN-ONLY] release/smoke --layout main: claude-code adds the cloned repo as marketplace, installs the subfolder plugin and validates it", { skip: !POSIX }, (t) => {
    const fx = mainFixture(t, { stubs: ["claude"] });
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "claude-code", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("claude-code: PASS: installed context-mode@context-mode"), r.out);
  });

  // Owner decision 2026-10-28: Codex is installed the native way from the cloned main tree: marketplace add, plugin add
  // (a local subfolder source), then the installed copy is listed and its MCP server answers initialize.
  test("[MAIN-ONLY] release/smoke --layout main: codex runs marketplace add + plugin add on the clone, lists the local source, installed server answers initialize", { skip: !POSIX }, (t) => {
    const fx = mainFixture(t, { stubs: ["codex"] });
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("codex: PASS: installed context-mode@context-mode"), r.out);
    const calls = readFileSync(path.join(fx.tmp, "codex-argv.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.deepEqual(calls.slice(0, 2).map((c) => c.slice(0, 3).join(" ")), ["plugin marketplace add", "plugin add context-mode@context-mode"]);
    assert.ok(calls.some((c) => c[0] === "plugin" && c[1] === "list"), "plugin list read back");
    const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-codex.json"), "utf8"));
    assert.ok(!existsSync(path.join(probe.codexHome, "config.toml")), "no hand-written config.toml entry (native install only)");
  });

  test("[MAIN-ONLY] release/smoke --layout main: codex FAIL when the marketplace entry is an npm source", { skip: !POSIX }, (t) => {
    const fx = mainFixture(t, { stubs: ["codex"], codexSource: { source: "npm", package: "context-mode", version: "0.0.0" } });
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("codex: FAIL: "), r.err);
  });

  test("[MAIN-ONLY] release/smoke --layout main: codex FAIL when the installed server does not answer as context-mode", { skip: !POSIX }, (t) => {
    const fx = mainFixture(t, { stubs: ["codex"], serverName: "other" });
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "codex", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("codex: FAIL: "), r.err);
  });

  test("[MAIN-ONLY] release/smoke --layout main: qwen installs <clone>:context-mode and the installed server runs --agent qwen", { skip: !POSIX }, (t) => {
    const fx = mainFixture(t, { stubs: ["qwen"] });
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "qwen", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.ok(r.out.startsWith("qwen: PASS: "), r.out);
  });

  test("[MAIN-ONLY] release/smoke --layout main: qwen installed with another --agent is FAIL (the gap the probe found)", { skip: !POSIX }, (t) => {
    const fx = mainFixture(t, { stubs: ["qwen"] });
    fx.qwenAgent = "claude-code";
    const fx2 = mainFixture(t, { stubs: ["qwen"] });
    assert.ok(fx2);
    // rebuild the main branch with the wrong agent flag
    const seed = path.join(fx.root, "seed-main");
    writeFileSync(path.join(seed, "qwen-extension.json"), JSON.stringify({ name: "context-mode", mcpServers: { "context-mode": { command: "node", args: ["x/server.mjs", "--agent", "claude-code"] } } }));
    git(seed, "commit", "-qam", "bad");
    git(seed, "push", "-q", "-f", path.join(fx.root, "remote.git"), "main");
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "qwen", "--repo", fx.repo);
    assert.equal(r.status, 1);
    assert.ok(r.err.startsWith("qwen: FAIL: "), r.err);
  });

  test("[MAIN-ONLY] release/smoke --layout main: qwen CLI absent is SKIPPED (tier 2)", (t) => {
    const fx = mainFixture(t);
    const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "qwen", "--repo", fx.repo);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, "qwen: SKIPPED: qwen not available\n");
  });
});

describe("ADR-0013 release: rollback", () => {
  // Unit tests for scripts/release/rollback.mjs (impl/13-build-release.md §11.3, DEVIATIONS D-M6-arch-5).
  // Runs the real script against a local bare repo passed via --remote; nothing leaves the machine.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SCRIPT = path.join(REPO, "scripts", "release", "rollback.mjs");
  const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

  function git(cwd, ...args) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  }

  // bare remote with `release` at c3 (c1 <- c2 <- c3) and a side commit `x` that is not on release.
  function fixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-v2-rollback-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bare = path.join(root, "remote.git");
    const seed = path.join(root, "seed");
    const work = path.join(root, "work");
    git(root, "init", "--bare", "-b", "release", bare);
    git(root, "init", "-b", "release", seed);
    const shas = [];
    for (const n of ["1", "2", "3"]) {
      writeFileSync(path.join(seed, "f"), n);
      git(seed, "add", "f");
      git(seed, "commit", "-m", `c${n}`);
      shas.push(git(seed, "rev-parse", "HEAD"));
    }
    git(seed, "push", bare, "release");
    git(seed, "switch", "-c", "side", shas[0]);
    writeFileSync(path.join(seed, "g"), "x");
    git(seed, "add", "g");
    git(seed, "commit", "-m", "x");
    const side = git(seed, "rev-parse", "HEAD");
    git(seed, "push", bare, "side");
    git(root, "clone", bare, work);
    return { bare, work, shas, side };
  }

  function run(cwd, args) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: ENV });
  }

  test("rolls release back to an ancestor sha and prints both shas", (t) => {
    const f = fixture(t);
    const r = run(f.work, ["--sha", f.shas[0], "--remote", f.bare]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(f.bare, "rev-parse", "release"), f.shas[0]);
    assert.ok(r.stdout.includes(f.shas[0]), r.stdout);
    assert.ok(r.stdout.includes(f.shas[2]), "prints the previous release tip");
  });

  test("accepts a short sha", (t) => {
    const f = fixture(t);
    const r = run(f.work, ["--sha", f.shas[1].slice(0, 10), "--remote", f.bare]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(f.bare, "rev-parse", "release"), f.shas[1]);
  });

  test("refuses a sha that is not an ancestor of release (no roll forward)", (t) => {
    const f = fixture(t);
    git(f.work, "fetch", f.bare, "side");
    const r = run(f.work, ["--sha", f.side, "--remote", f.bare]);
    assert.notEqual(r.status, 0);
    assert.equal(git(f.bare, "rev-parse", "release"), f.shas[2]);
  });

  test("refuses a missing --sha", (t) => {
    const f = fixture(t);
    const r = run(f.work, ["--remote", f.bare]);
    assert.notEqual(r.status, 0);
    assert.equal(git(f.bare, "rev-parse", "release"), f.shas[2]);
  });

  test("refuses an unknown sha", (t) => {
    const f = fixture(t);
    const r = run(f.work, ["--sha", "0123456789abcdef0123456789abcdef01234567", "--remote", f.bare]);
    assert.notEqual(r.status, 0);
    assert.equal(git(f.bare, "rev-parse", "release"), f.shas[2]);
  });
});

describe("ADR-0019 release: npm tarball check and publish job", () => {
  // release.yml publish-npm job (ADR-0019 D1/D2) and check-npm-tarball.mjs. Text checks: no YAML parser is a dependency.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const yml = readFileSync(path.join(REPO, ".github", "workflows", "release.yml"), "utf8");
  // D-MO-2: the old jobs end where the main-only jobs begin; the old-path checks below read only the old jobs.
  const oldJobs = yml.slice(yml.indexOf("\njobs:"), yml.indexOf("# ---- MAIN-ONLY path"));
  const job = yml.slice(yml.indexOf("\n  publish-npm:"), yml.indexOf("\n  rollback:"));

  test("release.yml: publish-npm job has the ADR-0019 shape", () => {
    assert.ok(job.length > 50, "job exists, placed before rollback");
    for (const s of ["environment: npm-publish", "id-token: write", "contents: read", 'node-version: "24.15.0"', "11.5.1",
      "check-npm-tarball.mjs", "npm publish --provenance --access public --tag next"]) assert.ok(job.includes(s), s);
    assert.ok(!/NODE_AUTH_TOKEN|NPM_TOKEN/.test(yml), "no token: trusted publishing only");
    assert.ok(!/--tag latest/.test(yml), "CI never moves latest");
    assert.ok(/needs:\s*\[[^\]]*publish-promote/.test(job), "runs after the release job");
    assert.ok(/startsWith\(github\.ref, 'refs\/tags\/v2\.'\)/.test(job) && /inputs\.publish/.test(job), "only a v2.* tag or publish=true");
  });

  test("release.yml: publish input exists and is a boolean defaulting to false", () => {
    assert.match(yml, /publish:\n\s+description:[^\n]*\n\s+required: false\n\s+type: boolean\n\s+default: false/);
    assert.match(yml, /tags:\s*\n\s*- "v2\.\*"/);
  });

  test("release.yml: no ${{ }} inside a run text of publish-npm", () => {
    const runs = job.split("\n").filter((l) => /^\s+run:/.test(l));
    for (const r of runs) assert.ok(!r.includes("${{"), r);
  });

  function sha(b) { return createHash("sha256").update(b).digest("hex"); }
  function tree(files) {
    const d = mkdtempSync(path.join(tmpdir(), "cm-v2-tarball-"));
    const sums = [];
    for (const [n, c] of Object.entries(files)) { mkdirSync(path.dirname(path.join(d, n)), { recursive: true }); writeFileSync(path.join(d, n), c); sums.push(`${sha(c)}  ${n}`); }
    writeFileSync(path.join(d, "SHA256SUMS"), sums.join("\n") + "\n");
    return d;
  }
  const PKG = JSON.stringify({ name: "context-mode", version: "2.0.0", type: "module", bin: { "context-mode": "cli.mjs" } }, null, 2) + "\n";
  const run = (d) => spawnSync(process.execPath, [path.join(REPO, "scripts", "release", "check-npm-tarball.mjs"), d], { encoding: "utf8", env: { ...process.env, npm_config_cache: path.join(d, "..", "cm-npm-cache") } });

  test("check-npm-tarball: passes when the tarball equals SHA256SUMS", (t) => {
    const d = tree({ "package.json": PKG, "cli.mjs": "#!/usr/bin/env node\n", "server.mjs": "x\n" });
    t.after(() => rmSync(d, { recursive: true, force: true }));
    const r = run(d);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test("check-npm-tarball: fails when a file differs from SHA256SUMS", (t) => {
    const d = tree({ "package.json": PKG, "cli.mjs": "#!/usr/bin/env node\n", "server.mjs": "x\n" });
    t.after(() => rmSync(d, { recursive: true, force: true }));
    writeFileSync(path.join(d, "server.mjs"), "changed\n");
    const r = run(d);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout + r.stderr, /server\.mjs/);
  });

  // Release-next (D-RN-TAG-1): a pushed v2.* tag is the version. The plan step passes the tag name to
  // plan.mjs through env (never ${{ }} in run text); a branch run keeps plan.mjs's own version.
  test("[RN] release.yml: plan step passes --tag \"$REF_NAME\" on a tag push, plain plan.mjs otherwise", () => {
    const plan = yml.slice(yml.indexOf("\n  plan:"), yml.indexOf("\n  build:"));
    const step = plan.slice(plan.indexOf("- id: plan"));
    for (const s of ["REF_TYPE: ${{ github.ref_type }}", "REF_NAME: ${{ github.ref_name }}", 'if [ "$REF_TYPE" = "tag" ]; then',
      'node scripts/release/plan.mjs --tag "$REF_NAME" >> "$GITHUB_OUTPUT"', 'node scripts/release/plan.mjs >> "$GITHUB_OUTPUT"']) {
      assert.ok(step.includes(s), s);
    }
    const runText = step.slice(step.indexOf("run:"));
    assert.ok(!runText.includes("${{"), "no ${{ }} in the plan run text");
  });

  test("[RN] release.yml: publish-npm stays --tag next and never names latest", () => {
    const npmLines = job.split("\n").filter((l) => l.includes("npm publish"));
    assert.deepEqual(npmLines.map((l) => l.trim()), ["run: npm publish --provenance --access public --tag next"]);
    assert.ok(!oldJobs.includes("npm dist-tag"), "CI never runs npm dist-tag");
    const latest = oldJobs.split("\n").filter((l) => l.includes("latest") && !l.includes("-latest") && !l.trim().startsWith("- name:"));
    assert.deepEqual(latest, [], "no release.yml command names latest (runner labels and step names aside)");
  });

  // D-RN-ORDER-1: run 40496186557 (v2.0.0-next.4) made the GitHub prerelease in publish-promote, then publish-npm failed.
  // The GitHub release is now its own job: it runs after publish-npm, and only when npm publish succeeded or was not asked for.
  const jobOf = (name) => {
    const start = yml.indexOf(`\n  ${name}:`);
    assert.ok(start > 0, `job ${name} exists`);
    const rest = yml.slice(start + 1);
    const next = rest.split("\n").findIndex((l, i) => i > 0 && l.startsWith("  ") && !l.startsWith("   ") && l.trim().endsWith(":"));
    return next < 0 ? rest : rest.split("\n").slice(0, next).join("\n");
  };

  test("[N5] release.yml: publish-promote makes no GitHub release (D-RN-ORDER-1)", () => {
    const promote = jobOf("publish-promote");
    assert.ok(promote.includes('run: node scripts/release/publish.mjs --promote --version "$VERSION"'), promote);
    for (const s of ["GH_TOKEN", "--notes", "NOTES", "--github-release"]) assert.ok(!promote.includes(s), s);
  });

  test("[N5] release.yml: github-release job needs publish-npm and runs only when npm publish succeeded or was not asked for (D-RN-ORDER-1)", () => {
    const gh = jobOf("github-release");
    assert.ok(gh.includes("needs: [plan, publish-promote, publish-npm]"), gh);
    const cond = gh.split("\n").find((l) => l.trim().startsWith("if:"));
    assert.equal(cond.trim(), "if: ${{ !cancelled() && inputs.mode != 'rollback' && needs.publish-promote.result == 'success' && " +
      "(needs.publish-npm.result == 'success' || (needs.publish-npm.result == 'skipped' && !inputs.publish && !startsWith(github.ref, 'refs/tags/v2.'))) }}");
    for (const s of ["contents: write", "GH_TOKEN: ${{ github.token }}", "VERSION: ${{ needs.plan.outputs.version }}",
      "NOTES: ${{ needs.plan.outputs.notes }}", "name: release-out",
      'run: node scripts/release/publish.mjs --github-release --version "$VERSION" --notes "$NOTES"']) assert.ok(gh.includes(s), s);
    for (const r of gh.split("\n").filter((l) => l.trim().startsWith("run:"))) assert.ok(!r.includes("${{"), r);
    assert.ok(!gh.includes("environment:"), "no npm-publish environment: no second approval for the GitHub release");
    assert.ok(yml.indexOf("\n  publish-npm:") < yml.indexOf("\n  github-release:"), "job order in the file follows the run order");
    assert.equal(oldJobs.split("--github-release").length - 1, 1, "one place makes the GitHub release (old path)");
  });
});
});
