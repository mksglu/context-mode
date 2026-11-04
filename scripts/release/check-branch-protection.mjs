// impl/13 §12 step 3 / §14.2: weekly.yml's drift check. GETs the branch protection on `main`
// and compares 4 fields byte-for-byte against branch-protection-settings.json. Exit 1 on drift.
import { PROTECTION_ENDPOINT, SETTINGS, ghApi, protectionDrift } from "./branch-protection.mjs";

const r = ghApi([PROTECTION_ENDPOINT]);
if (r.json === undefined) {
  process.stderr.write(`branch protection check failed: gh api exited ${r.code}\n${r.stderr}`);
  process.exit(1);
}
const drift = protectionDrift(SETTINGS, r.json);
for (const d of drift) process.stderr.write(`branch protection drift: ${d.field} expected ${d.expected} got ${d.actual}\n`);
if (drift.length > 0) process.exit(1);
process.stdout.write("branch protection matches branch-protection-settings.json\n");
