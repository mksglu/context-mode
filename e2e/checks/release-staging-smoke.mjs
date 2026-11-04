// e2e check: release-staging smoke install (TECH-SPEC §12 M6 gate, DEVIATIONS D-M6-arch-5, D-M6-P3-4).
// Builds the release tree, stages it as branch release-staging in a local bare repo under --root, then runs
// scripts/release/smoke.mjs for claude-code, codex and gemini against file://<bare>. Prints {"ok":bool,"rows":[...]}.
// ok = claude-code PASS, codex PASS, gemini PASS or SKIPPED. Spawns scripts only; imports nothing from src/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const i = process.argv.indexOf("--root");
const base = i > 0 ? process.argv[i + 1] : fs.realpathSync.native(process.env.TMPDIR ?? "/tmp");
fs.mkdirSync(base, { recursive: true });
const work = fs.mkdtempSync(path.join(base, "release-staging-smoke-"));
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "smoke", GIT_AUTHOR_EMAIL: "smoke@localhost", GIT_COMMITTER_NAME: "smoke", GIT_COMMITTER_EMAIL: "smoke@localhost" };
const sh = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: "utf8", env: GIT_ENV, ...opt });

// real Claude Code binary first on PATH (skips worktree shims): Mach-O or ELF magic, as e2e/live/run.mjs does
function realClaudeDir() {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const c = path.join(dir, "claude");
    if (!fs.existsSync(c)) continue;
    const b = Buffer.alloc(4); const fd = fs.openSync(fs.realpathSync(c), "r"); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(b.toString("hex"))) return path.dirname(fs.realpathSync(c));
  }
  return null;
}

const rows = [];
let ok = false;
try {
  const out = path.join(work, "release-out");
  const b = sh(process.execPath, [path.join(ROOT, "build", "build.mjs"), "--out", out], { cwd: ROOT });
  if (b.status !== 0) throw new Error(`build.mjs exit ${b.status}: ${(b.stderr ?? "").split("\n")[0]}`);
  const bare = path.join(work, "remote.git");
  for (const args of [["init", "-q", "--bare", bare], ["-C", out, "init", "-q", "-b", "release-staging"], ["-C", out, "add", "-A"],
    ["-C", out, "commit", "-q", "-m", "release v0.0.0-smoke"], ["-C", out, "push", "-q", bare, "release-staging"]]) {
    const r = sh("git", args);
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.split("\n")[0]}`);
  }
  const claudeDir = realClaudeDir();
  const PATH = [claudeDir, process.env.PATH].filter(Boolean).join(path.delimiter);
  for (const agent of ["claude-code", "codex", "gemini"]) {
    const r = sh(process.execPath, [path.join(ROOT, "scripts", "release", "smoke.mjs"), "--ref", "release-staging", "--agent", agent,
      "--repo", pathToFileURL(bare).href], { cwd: ROOT, env: { ...process.env, PATH } });
    const line = (r.stdout + r.stderr).split("\n")[0];
    const result = r.status === 0 ? (line.startsWith(`${agent}: SKIPPED`) ? "SKIPPED" : "PASS") : "FAIL";
    rows.push({ agent, result, line });
  }
  const by = Object.fromEntries(rows.map((r) => [r.agent, r.result]));
  ok = by["claude-code"] === "PASS" && by.codex === "PASS" && by.gemini !== "FAIL";
} catch (e) {
  rows.push({ agent: "setup", result: "FAIL", line: String(e.message) });
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify({ ok, rows }) + "\n");
