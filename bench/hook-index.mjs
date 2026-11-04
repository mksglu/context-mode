// bench/hook-index.mjs — T-F1 index-path bench (BLOCKED-M7 item 2, DECISIONS-r9 F1, impl/09 §4.6 step 5).
// Spawns release-out/hook.mjs with the T-F1 Case B PostToolUse payload (e2e/checks/case-b-index.mjs:
// Bash subagent, "\n\n"-separated 96-byte tagged lines) at 64 KB and 1 MiB, next to bare `node -e ""`
// at the same load, and prints one JSON line: { loadavg, bareP95Ms, sizes: { <bytes>: p95Ms } }.
// Wall time = spawnSync start to exit, the same clock T-F1 uses.
// Usage: node bench/hook-index.mjs [--runs 50] [--bundle release-out/hook.mjs] [--cpu-prof <dir>]
import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg("--runs", "50"));
const BUNDLE = path.resolve(ROOT, arg("--bundle", "release-out/hook.mjs"));
const PROF = arg("--cpu-prof", "");
const SIZES = [64 * 1024, 1024 * 1024];

if (!existsSync(BUNDLE)) {
  const b = spawnSync(process.execPath, [path.join(ROOT, "build/build.mjs"), "--out", path.join(ROOT, "release-out")], { stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

// Same input shape as e2e/checks/case-b-index.mjs buildInput (exact byte count, whole tagged lines).
function buildInput(total) {
  const lines = [];
  let used = 0;
  for (let n = 0; ; n++) {
    const tag = "L" + String(n).padStart(8, "0") + ":";
    const sep = lines.length === 0 ? 0 : 2;
    if (used + sep + 96 >= total) { lines.push(tag + "x".repeat(Math.max(0, total - used - sep - tag.length))); break; }
    lines.push(tag + "x".repeat(96 - tag.length));
    used += sep + 96;
  }
  return lines.join("\n\n");
}

const work = mkdtempSync(path.join(tmpdir(), "cm-hook-index-"));
const repo = path.join(work, "repo");
const home = path.join(work, "home");
mkdirSync(path.join(repo, ".claude", "agents"), { recursive: true });
mkdirSync(home, { recursive: true });
execFileSync("git", ["init", "-q", repo]);
writeFileSync(path.join(repo, ".claude", "agents", "bash-case-b.md"), "---\nname: bash-case-b\ndescription: fixture.\ntools: Bash\n---\nfixture\n");
const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };

const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.ceil(s.length * 0.95) - 1]; };
const timed = (args, input) => {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, args, { input, cwd: repo, env, encoding: "utf8" });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.status !== 0) throw new Error("exit " + r.status + ": " + r.stderr);
  return { ms, stdout: r.stdout };
};

let seq = 0;
try {
  const loadavg = execFileSync("sysctl", ["-n", "vm.loadavg"], { encoding: "utf8" }).trim();
  const bare = [];
  const sizes = {};
  for (const size of SIZES) {
    const text = buildInput(size);
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      bare.push(timed(["-e", ""], "").ms);
      seq++;
      const payload = JSON.stringify({
        session_id: "hook-index-" + seq, cwd: repo, hook_event_name: "PostToolUse", agent_id: "sub-" + seq,
        agent_type: "bash-case-b", tool_name: "Bash",
        tool_input: { command: "cat big-output.txt", description: "read the output of the long-running build" },
        tool_response: text,
      });
      const pre = PROF !== "" && i === RUNS - 1 ? ["--cpu-prof", "--cpu-prof-dir", PROF, "--cpu-prof-name", size + ".cpuprofile"] : [];
      const r = timed([...pre, BUNDLE, "--agent", "claude-code"], payload);
      if (!r.stdout.includes("updatedToolOutput")) throw new Error("size " + size + ": no replace decision");
      times.push(r.ms);
    }
    sizes[size] = Math.round(p95(times) * 10) / 10;
  }
  console.log(JSON.stringify({ loadavg, runs: RUNS, bareP95Ms: Math.round(p95(bare) * 10) / 10, sizes }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
