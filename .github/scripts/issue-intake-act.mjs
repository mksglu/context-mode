// .github/scripts/issue-intake-act.mjs
// Reads the result from issue-intake.mjs and labels/comments/closes/reopens the issue through `gh`.
// Acts only on the structured finding codes from the checker, never on free text.
// https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/agent-issue-intake/VALIDATION.md "What it does with the result", ADR-0014 §5.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const issue = process.env.ISSUE_NUMBER;
const state = process.env.ISSUE_STATE;
const repo = process.env.GITHUB_REPOSITORY;
const LABELS = ["has-report", "no-report", "needs-report"];
const AGENT_ISSUE_URL = `https://github.com/${repo}/blob/main/.github/AGENT_ISSUE.md`;

function gh(args) {
  return execFileSync("gh", [...args, "-R", repo], { encoding: "utf8" });
}

function currentLabels() {
  const out = JSON.parse(gh(["issue", "view", issue, "--json", "labels"]));
  return out.labels.map((l) => l.name);
}

function setLabel(label, had) {
  for (const l of LABELS) if (l !== label && had.includes(l)) gh(["issue", "edit", issue, "--remove-label", l]);
  if (!had.includes(label)) gh(["issue", "edit", issue, "--add-label", label]);
}

function comment(lines) {
  gh(["issue", "comment", issue, "--body", lines.join("\n")]);
}

const warningLines = (result.warnings || []).map(
  (w) => `- \`${w.marker}\` appears under "${w.section}": if it is a secret, edit it out (paths and logs are welcome).`,
);
const fixCmd = `gh issue edit ${issue} -R ${repo} --body-file <corrected-body.md>`;
const had = currentLabels();

if (result.ok) {
  setLabel("has-report", had);
  if (state === "closed") gh(["issue", "reopen", issue]);
  if (had.includes("needs-report") || had.includes("no-report") || warningLines.length) {
    comment(["The body now passes the intake check.", ...(warningLines.length ? ["", ...warningLines] : [])]);
  }
  process.exit(0);
}

if (!result.hasReport) {
  setLabel("no-report", had);
  comment([
    "This issue has no `ctx_doctor` report under `### ctx-report`.",
    "",
    `Per ${AGENT_ISSUE_URL} step 1: call the \`ctx_doctor\` tool and paste its report unchanged.`,
    "",
    `Fix: \`${fixCmd}\` once the report is included. Closing as not planned; an edit that passes reopens it.`,
    ...(warningLines.length ? ["", ...warningLines] : []),
  ]);
  if (state !== "closed") gh(["issue", "close", issue, "--reason", "not planned"]);
  process.exit(0);
}

const reasons = result.findings.map((f) => {
  if (f.code === "missing-heading") return `missing heading(s): ${f.headings.join(", ")}`;
  if (f.code === "heading-order") return "headings are present but out of order";
  if (f.code === "unknown-key") return `unknown report key(s): ${f.keys.join(", ")}`;
  if (f.code === "missing-key") return `report check row(s) missing: ${f.keys.join(", ")}`;
  if (f.code === "foreign-line") return `${f.count} line(s) under "### ctx-report" are not ctx_doctor report lines`;
  if (f.code === "steps-deny-no-alt") return `${f.count} Steps line(s) name a denied tool but not the alternative it gave`;
  return f.code;
});

setLabel("needs-report", had);
comment([
  "The `ctx_doctor` report did not pass validation:",
  "",
  ...reasons.map((r) => `- ${r}`),
  "",
  "This usually means the body was edited by hand after `ctx_doctor` ran.",
  `Fix: re-run \`ctx_doctor\`, then \`${fixCmd}\` with the unchanged report.`,
  ...(warningLines.length ? ["", ...warningLines] : []),
]);
