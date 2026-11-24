// scripts/release/ci-verified.mjs
// D-REL-CI-REUSE-1 (owner 2026-11-24: "simdiden ac isi bir daha bu sekilde beklemem ben! emir bu."): release.yml job
// ci-verified. The release reuses the green main CI of the exact sha it releases: when ci.yml ran on a push to main for
// this sha and the run and every job of it ended success, the release skips its own copy of the ci.yml matrix
// (workflow_call). In every other case (no such run, a red or unfinished run, a skipped job, an API error) it prints
// green=false and the release runs ci.yml as before, so no sha ships without a green full ci.yml on that sha.
// Prints one line for $GITHUB_OUTPUT on stdout (green=true|false) and one reason line on stderr. Always exits 0.
// The functions above the CLI block are pure (tests/0013-release-main.test.mjs runs them); the CLI block calls gh.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const CI_WORKFLOW = ".github/workflows/ci.yml";
export const CI_BRANCH = "main";
export const CI_EVENT = "push";

/** A full 40-hex commit sha. */
export function isSha(s) {
  if (typeof s !== "string" || s.length !== 40) return false;
  for (const c of s) if (!((c >= "0" && c <= "9") || (c >= "a" && c <= "f"))) return false;
  return true;
}

/** Why a workflow run does not prove the sha green, or null when it does (the jobs are checked apart). */
export function runReject(run, sha) {
  if (!run || typeof run !== "object") return "no run";
  if (run.head_sha !== sha) return "head_sha " + run.head_sha;
  if (run.head_branch !== CI_BRANCH) return "branch " + run.head_branch;
  if (run.event !== CI_EVENT) return "event " + run.event;
  if (typeof run.path !== "string" || !(run.path === CI_WORKFLOW || run.path.startsWith(CI_WORKFLOW + "@"))) return "workflow " + run.path;
  if (run.status !== "completed") return "status " + run.status;
  if (run.conclusion !== "success") return "conclusion " + run.conclusion;
  return null;
}

/** Why the jobs of a run do not prove it green, or null when there is at least one job and every job ended success. */
export function jobsReject(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return "no jobs";
  const bad = jobs.filter((j) => !j || j.status !== "completed" || j.conclusion !== "success");
  if (bad.length > 0) return bad.length + " job(s) not success: " + bad.map((j) => (j && j.name) + "=" + (j && j.conclusion)).join(", ");
  return null;
}

/**
 * The decision. runs: the ci.yml runs the API returned for the sha; jobsOf(id): the latest-attempt jobs of a run.
 * Returns { green, reason, runId }. The first run whose run and jobs both pass wins.
 */
export function verify(sha, runs, jobsOf) {
  if (!isSha(sha)) return { green: false, reason: "not a full sha: " + sha, runId: null };
  const notes = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    const r = runReject(run, sha);
    if (r !== null) { notes.push(run && run.id + ": " + r); continue; }
    const j = jobsReject(jobsOf(run.id));
    if (j !== null) { notes.push(run.id + ": " + j); continue; }
    return { green: true, reason: "ci.yml run " + run.id + " on main for " + sha + " ended success, every job success", runId: run.id };
  }
  return { green: false, reason: "no green ci.yml push run on main for " + sha + (notes.length ? " (" + notes.join("; ") + ")" : ""), runId: null };
}

function cli() {
  const sha = process.env.SHA || "";
  const repo = process.env.REPO || "";
  let out;
  try {
    const gh = (p) => JSON.parse(execFileSync("gh", ["api", p], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] }));
    const runs = gh("repos/" + repo + "/actions/workflows/ci.yml/runs?head_sha=" + sha + "&branch=" + CI_BRANCH + "&event=" + CI_EVENT + "&per_page=50").workflow_runs;
    out = verify(sha, runs, (id) => gh("repos/" + repo + "/actions/runs/" + id + "/jobs?filter=latest&per_page=100").jobs);
  } catch (e) {
    const why = String((e && e.stderr) || (e && e.message) || e).trim().split("\n")[0];
    out = { green: false, reason: "GitHub API error (" + why + ")", runId: null };
  }
  console.error("ci-verified: " + (out.green ? "reuse " : "run ci.yml, ") + out.reason);
  console.log("green=" + (out.green ? "true" : "false"));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) cli();
