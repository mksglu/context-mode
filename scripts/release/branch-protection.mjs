// impl/13 §12: PUT the branch protection on `main` from branch-protection-settings.json
// (ADR-0013 r3 Q14, A70). Run by hand with a repo-admin `gh auth`, never in CI.
// The same settings file and the drift compare below back check-branch-protection.mjs
// (weekly.yml, §12 step 3), so the PUT and the check can never drift apart.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "branch-protection-settings.json");
const SETTINGS_TEXT = readFileSync(SETTINGS_FILE, "utf8");
export const SETTINGS = JSON.parse(SETTINGS_TEXT);

// `gh api` fills {owner}/{repo} from the checked-out repo (D-M6-B1-1).
export const PROTECTION_ENDPOINT = "repos/{owner}/{repo}/branches/main/protection";

// The 4 compared fields (§12 step 3): name, value in the settings file, value in the GET reply.
const FIELDS = [
  ["required_status_checks.contexts", (s) => s.required_status_checks.contexts, (l) => l.required_status_checks?.contexts],
  ["enforce_admins.enabled", (s) => s.enforce_admins, (l) => l.enforce_admins?.enabled],
  ["allow_force_pushes", (s) => s.allow_force_pushes, (l) => l.allow_force_pushes?.enabled],
  ["allow_deletions", (s) => s.allow_deletions, (l) => l.allow_deletions?.enabled],
];

/** Fields whose live value differs byte-for-byte (as JSON) from the settings file. */
export function protectionDrift(settings, live) {
  const drift = [];
  for (const [field, want, got] of FIELDS) {
    const expected = JSON.stringify(want(settings));
    const actual = JSON.stringify(got(live)) ?? "missing";
    if (expected !== actual) drift.push({ field, expected, actual });
  }
  return drift;
}

/** Runs `gh api <args>`; returns the parsed JSON reply, or an exit code on failure. */
export function ghApi(args, input) {
  const r = spawnSync("gh", ["api", ...args], { encoding: "utf8", input });
  if (r.status !== 0) return { code: r.status ?? 1, stderr: r.stderr ?? "" };
  return { json: JSON.parse(r.stdout) };
}

async function main() {
  const r = ghApi([PROTECTION_ENDPOINT, "-X", "PUT", "--input", "-"], SETTINGS_TEXT);
  if (r.json === undefined) {
    process.stderr.write(`branch protection failed: gh api exited ${r.code}\n${r.stderr}`);
    process.exit(1);
  }
  process.stdout.write(`url: ${r.json.url}\nenforce_admins.enabled: ${r.json.enforce_admins?.enabled}\n`);
}

if (import.meta.main) await main();
