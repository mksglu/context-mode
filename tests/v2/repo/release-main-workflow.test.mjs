// MAIN-ONLY (docs/v2/release/MAIN-ONLY.md, DEVIATIONS D-MO-2): shape of the one-click release in release.yml.
// A dispatch on `main` takes the main path (jobs main-*); every other start keeps the release-branch path until merge day.
// Line-based, no regex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const TEXT = readFileSync(root + ".github/workflows/release.yml", "utf8");
const LINES = TEXT.split("\n");

function jobs() {
  const out = {};
  let cur = null;
  for (const x of LINES.slice(LINES.indexOf("jobs:") + 1)) {
    const head = x.startsWith("  ") && !x.startsWith("   ") && x.endsWith(":") && !x.trim().startsWith("#");
    if (head) { cur = x.trim().slice(0, -1); out[cur] = []; } else if (cur !== null) out[cur].push(x);
  }
  return out;
}
const J = jobs();
const body = (name) => { assert.ok(J[name], "job " + name); return J[name].map((l) => l.trim()); };
const needsOf = (name) => {
  const l = body(name).find((x) => x.startsWith("needs:"));
  return l === undefined ? [] : l.slice(6).split("[").join("").split("]").join("").split(",").map((s) => s.trim()).filter(Boolean);
};
const MAIN_JOBS = ["main-plan", "main-build", "main-smoke", "main-npm", "main-commit", "main-github-release", "main-rollback"];
const inputBlock = (name) => {
  const i = LINES.indexOf("      " + name + ":");
  assert.ok(i > 0, "input " + name);
  const out = [];
  for (let k = i + 1; k < LINES.length && LINES[k].startsWith("        "); k++) out.push(LINES[k].trim());
  return out;
};

test("[MAIN-ONLY] release.yml dispatch: channel next|latest (default next) and confirm_latest; old inputs stay", () => {
  const c = inputBlock("channel");
  assert.ok(c.includes("type: choice"), c.join("|"));
  assert.ok(c.includes("options: [next, latest]"), c.join("|"));
  assert.ok(c.includes("default: next"), c.join("|"));
  assert.ok(c.includes("required: false"), "a click with no input must work");
  const f = inputBlock("confirm_latest");
  assert.ok(f.includes("type: string") && f.includes("required: false"), f.join("|"));
  for (const k of ["publish", "sha", "mode"]) inputBlock(k);
  assert.ok(LINES.includes("  push:") && LINES.includes('      - "v2.*"'), "tag push path stays until merge day");
});

test("[MAIN-ONLY] release.yml route: the main path only for a dispatch on refs/heads/main", () => {
  const b = body("route").join("\n");
  assert.ok(b.includes('[ "$REF" = "refs/heads/main" ]') && b.includes('[ "$EVENT" = "workflow_dispatch" ]'), b);
  assert.ok(b.includes("layout=main") && b.includes("layout=release"), b);
  assert.ok(body("route").includes("REF: ${{ github.ref }}") && body("route").includes("EVENT: ${{ github.event_name }}"));
});

test("[MAIN-ONLY] release.yml: the old path starts only on layout release; the main path only on layout main", () => {
  for (const j of ["plan", "rollback"]) {
    assert.ok(needsOf(j).includes("route"), j + " needs route");
    assert.ok(body(j).some((x) => x.startsWith("if:") && x.includes("needs.route.outputs.layout == 'release'")), j);
  }
  for (const j of MAIN_JOBS) {
    assert.ok(needsOf(j).includes("route"), j + " needs route");
    assert.ok(body(j).some((x) => x.startsWith("if:") && x.includes("needs.route.outputs.layout == 'main'")), j + " is gated on layout main");
  }
});

test("[MAIN-ONLY] release.yml main path: job order ci/route -> plan -> build -> smoke -> npm -> commit on main -> github release", () => {
  assert.deepEqual(MAIN_JOBS.filter((j) => J[j]), MAIN_JOBS);
  assert.ok(Object.keys(J).indexOf("main-plan") < Object.keys(J).indexOf("main-build"));
  const chain = { "main-plan": "ci", "main-build": "main-plan", "main-smoke": "main-build", "main-npm": "main-smoke", "main-commit": "main-npm", "main-github-release": "main-commit" };
  for (const [j, dep] of Object.entries(chain)) assert.ok(needsOf(j).includes(dep), j + " needs " + dep + ": " + needsOf(j));
  assert.ok(needsOf("main-rollback").includes("ci"));
});

test("[MAIN-ONLY] release.yml main path names no branch but main (no release, no release-staging, no reset)", () => {
  for (const j of MAIN_JOBS) {
    const b = body(j).join("\n");
    for (const bad of ["release-staging", "heads/release", "--ref release", "publish.mjs --stage", "publish.mjs --promote", "scripts/release/rollback.mjs", "--force", "reset --hard"]) {
      assert.ok(!b.includes(bad), j + " must not contain " + bad);
    }
  }
});

// Every ${{ }} value a shell reads goes through env: in a main job a line with ${{ is "key: ${{ ... }}" only.
test("[MAIN-ONLY] release.yml main path: no ${{ }} inside a shell command", () => {
  for (const j of MAIN_JOBS) {
    for (const x of body(j)) {
      if (!x.includes("${{")) continue;
      const cut = x.indexOf(": ");
      assert.ok(cut > 0 && !x.slice(0, cut).includes(" ") && x.slice(cut + 2).startsWith("${{"), j + ": " + x);
    }
  }
});

test("[MAIN-ONLY] release.yml main-plan: the guard for latest is the explicit confirm input, passed through env", () => {
  const b = body("main-plan");
  assert.ok(b.includes("CHANNEL: ${{ inputs.channel }}") && b.includes("CONFIRM: ${{ inputs.confirm_latest }}"), b.join("|"));
  assert.ok(b.some((x) => x.startsWith("node scripts/release/plan.mjs --main --channel \"$CHANNEL\" --confirm \"$CONFIRM\"")), b.join("|"));
  assert.ok(b.some((x) => x.startsWith("ref: ${{ github.sha }}")), "plans on the dispatched main head");
});

test("[MAIN-ONLY] release.yml main-smoke: three OS, the exact release commit in a local repo, all four agents, tier 2 with own timeout", () => {
  const b = body("main-smoke");
  assert.ok(b.includes("os: [macos-latest, ubuntu-latest, windows-latest]"));
  const t = b.join("\n");
  assert.ok(t.includes("commit-main.mjs --pkg release-out --version \"$VERSION\" --remote \"$bare\""), t);
  for (const a of ["claude-code", "codex", "gemini", "qwen"]) assert.ok(t.includes("smoke.mjs --ref main --layout main --repo \"$bare\" --agent " + a), a);
  for (const a of ["gemini", "qwen"]) {
    const i = b.indexOf("- run: node scripts/release/smoke.mjs --ref main --layout main --repo \"$bare\" --agent " + a);
    assert.ok(i > 0);
    const step = b.slice(i + 1, i + 4);
    assert.ok(step.includes("timeout-minutes: 5") && step.some((x) => x.startsWith("continue-on-error: true")), a + " " + step.join("|"));
  }
});

test("[MAIN-ONLY] release.yml main-npm: npm-publish environment, provenance, dist-tag = channel, skip when the version exists", () => {
  const b = body("main-npm");
  const t = b.join("\n");
  assert.ok(b.includes("environment: npm-publish") && b.includes("id-token: write"));
  assert.ok(b.includes("NPM_TAG: ${{ inputs.channel }}"));
  assert.ok(t.includes('npm publish --provenance --access public --tag "$NPM_TAG"'), t);
  assert.ok(!t.includes("--tag next") && !t.includes("--tag latest"), "the tag is never a literal");
  assert.ok(t.includes("npm view") && t.includes("published=true"), "re-run after a failed later job skips a finished publish");
  assert.ok(t.includes("check-npm-tarball.mjs release-out"));
});

test("[MAIN-ONLY] release.yml main-commit and main-github-release: one push of main and tag, GitHub release only after it", () => {
  const c = body("main-commit");
  assert.ok(c.includes("contents: write"));
  assert.ok(c.some((x) => x.startsWith("run: node scripts/release/commit-main.mjs --pkg release-out --version \"$VERSION\"")), c.join("|"));
  assert.ok(c.some((x) => x.startsWith("ref: main")) , "commit job checks out main");
  const g = body("main-github-release");
  assert.ok(g.some((x) => x.startsWith("run: node scripts/release/publish.mjs --github-release --version \"$VERSION\" --notes \"$NOTES\"")), g.join("|"));
  assert.ok(g.includes("GH_TOKEN: ${{ github.token }}") && g.includes("contents: write"));
});

test("[MAIN-ONLY] release.yml main-rollback: a forward commit through commit-main, only for mode rollback", () => {
  const b = body("main-rollback");
  assert.ok(b.some((x) => x.startsWith("if:") && x.includes("inputs.mode == 'rollback'")), b.join("|"));
  assert.ok(b.some((x) => x.startsWith("run: node scripts/release/commit-main.mjs --rollback-to \"$SHA\"")), b.join("|"));
  assert.ok(b.includes("SHA: ${{ inputs.sha }}") && b.includes("contents: write"));
  for (const j of MAIN_JOBS.filter((x) => x !== "main-rollback")) assert.ok(body(j).some((x) => x.startsWith("if:") && x.includes("inputs.mode != 'rollback'")), j + " skips on rollback");
});
