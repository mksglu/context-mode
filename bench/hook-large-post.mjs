// bench/hook-large-post.mjs — PostToolUse wall on the 222 KB compact-hard serverLog (serverLog(101).text),
// main agent Bash "cat -n logs/server.log", the event https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/compact/RESULT.md "D3 on the merged head"
// measures. Interleaves one or more bundles (A B A B ...), n runs each, and prints one JSON line per bundle:
// { bundle, medianMs, p95Ms }, plus the paired median difference of each bundle against the first.
// Usage: node bench/hook-large-post.mjs [--runs 20] [--cpu-prof <dir>] <bundle.mjs> [<bundle.mjs> ...]
import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { serverLog } from "../e2e/live/compact-hard/gen.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const RUNS = Number(opt("--runs", "20"));
const PROF = opt("--cpu-prof", "");
const bundles = args.map((b) => path.resolve(b));
if (bundles.length === 0) { console.error("usage: node bench/hook-large-post.mjs [--runs n] <bundle> [...]"); process.exit(2); }

const { text, command } = serverLog(101);
const work = mkdtempSync(path.join(tmpdir(), "cm-hook-large-"));
// One HOME and repo per bundle: a newer build migrates the store forward, and an older build on that store
// fails SCHEMA_STALE and skips its writes, which would time a build that does less work.
const sandboxes = bundles.map((_, k) => {
  const repo = path.join(work, "repo" + k);
  const home = path.join(work, "home" + k);
  mkdirSync(repo, { recursive: true });
  mkdirSync(home, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  return { repo, env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo } };
});
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.ceil(s.length * 0.95) - 1]; };
const r1 = (x) => Math.round(x * 10) / 10;

let seq = 0;
const times = bundles.map(() => []);
try {
  for (let i = 0; i < RUNS; i++) {
    bundles.forEach((b, k) => {
      seq++;
      const { repo, env } = sandboxes[k];
      const payload = JSON.stringify({
        session_id: "large-post-" + seq, cwd: repo, hook_event_name: "PostToolUse", tool_name: "Bash",
        tool_use_id: "toolu_" + seq, tool_input: { command }, tool_response: { stdout: text, stderr: "", interrupted: false },
      });
      const pre = PROF !== "" && i === RUNS - 1 ? ["--cpu-prof", "--cpu-prof-dir", PROF, "--cpu-prof-name", "b" + k + ".cpuprofile"] : [];
      const t0 = process.hrtime.bigint();
      const r = spawnSync(process.execPath, [...pre, b, "--agent", "claude-code"], { input: payload, cwd: repo, env, encoding: "utf8" });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (r.status !== 0 || r.stderr !== "") throw new Error(b + " exit " + r.status + ": " + r.stderr);
      if (!r.stdout.includes("updatedToolOutput") && !r.stdout.includes("updatedMCPToolOutput")) throw new Error(b + ": no replace decision: " + r.stdout.slice(0, 200));
      times[k].push(ms);
    });
  }
  bundles.forEach((b, k) => {
    const diff = k === 0 ? 0 : median(times[k].map((t, i) => t - times[0][i]));
    console.log(JSON.stringify({ node: process.version, bundle: b, runs: RUNS, medianMs: r1(median(times[k])), p95Ms: r1(p95(times[k])), pairedMedianVsFirstMs: r1(diff) }));
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
