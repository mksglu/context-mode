// .github/scripts/issue-intake-act.mjs
// Reads the score from issue-intake.mjs, then sets one label ("repro-ready" or "needs-info") and keeps ONE
// comment up to date: it finds its own comment by MARKER and edits it in place. The bot leaves issue state
// to maintainers, and it steps back on an issue a maintainer filed, labeled "maintainer-ack" or commented on.
// D-INTAKE-SCORE-1 (owner 2026-11-05: "bu GitHub Actions bot u cok kati calisiyor"). ADR-0014 §5.
// plan() is pure (tests/0014-repo-hygiene.test.mjs runs it); the bottom block runs its actions through `gh`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { ITEMS } from "./issue-intake.mjs";

export const MARKER = "<!-- context-mode-intake -->";
export const MAINTAINERS = ["OWNER", "MEMBER", "COLLABORATOR"];
export const SKIP_LABELS = ["maintainer-ack", "v1-frozen"];
export const STATUS_LABELS = {
  "repro-ready": { color: "0e8a16", description: "Version, steps and output are in the issue" },
  "needs-info": { color: "fbca04", description: "The intake comment lists what to add" },
};
export const OLD_LABELS = ["has-report", "no-report", "needs-report"]; // labels of the first intake check
export const GUIDE_URL = "https://github.com/mksglu/context-mode/blob/main/.github/AGENT_ISSUE.md";

/** The one intake comment for a score: the status, a checklist of the missing items, secret notes. */
export function commentBody(result) {
  const ready = result.status === "repro-ready";
  const missing = ITEMS.filter((i) => result.missing.includes(i.key));
  const lines = [MARKER, `**Intake check: ${result.status}**`, ""];
  if (!missing.length) lines.push("Thanks! This report holds everything on the checklist. A maintainer will take it from here.");
  else if (ready) lines.push("Thanks! This report holds the version, the steps and the output, so a maintainer can replay it. These items make the replay faster:");
  else lines.push("Thanks for the report! To replay it, a maintainer needs the items below. Add them by editing the issue body:");
  if (missing.length) lines.push("", ...missing.map((i) => `- [ ] **${i.label}**: ${i.hint}`));
  if (result.warnings.length) {
    lines.push("", ...result.warnings.map((m) => `- \`${m}\` appears in the body: if it starts a secret, replace the value with \`<masked>\`.`));
  }
  lines.push("", `This comment updates on each edit of the issue body. Guide for coding agents: ${GUIDE_URL}`);
  return lines.join("\n");
}

/**
 * The actions for one run. Input: the score, the issue author's association, the issue's label names and its
 * comments ({ id, body, bot, assoc }). Output: { skip, actions }; an action is one of label-create, label-add,
 * label-remove, comment-create, comment-edit. Issue state stays with maintainers in every case.
 */
export function plan({ result, author, labels, comments }) {
  if (MAINTAINERS.includes(author)) return { skip: "author is a maintainer", actions: [] };
  const held = SKIP_LABELS.find((l) => labels.includes(l));
  if (held) return { skip: `label ${held}`, actions: [] };
  if (comments.some((c) => !c.bot && MAINTAINERS.includes(c.assoc))) return { skip: "a maintainer commented", actions: [] };
  const actions = [];
  const label = result.status;
  for (const l of [...Object.keys(STATUS_LABELS), ...OLD_LABELS]) if (l !== label && labels.includes(l)) actions.push({ op: "label-remove", name: l });
  if (!labels.includes(label)) actions.push({ op: "label-create", name: label, ...STATUS_LABELS[label] }, { op: "label-add", name: label });
  const own = comments.find((c) => c.bot && c.body.includes(MARKER));
  const body = commentBody(result);
  const needed = result.missing.length > 0 || result.warnings.length > 0;
  if (own) {
    if (own.body !== body) actions.push({ op: "comment-edit", id: own.id, body });
  } else if (needed) {
    actions.push({ op: "comment-create", body });
  }
  return { skip: null, actions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const issue = process.env.ISSUE_NUMBER;
  const repo = process.env.GITHUB_REPOSITORY;
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
  const info = JSON.parse(gh(["api", `repos/${repo}/issues/${issue}`]));
  const comments = gh(["api", "--paginate", `repos/${repo}/issues/${issue}/comments`,
    "--jq", ".[] | {id, body, bot: (.user.type == \"Bot\"), assoc: .author_association}"])
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const p = plan({ result, author: info.author_association, labels: info.labels.map((l) => l.name), comments });
  console.log(JSON.stringify({ skip: p.skip, ops: p.actions.map((a) => a.op + (a.name ? " " + a.name : "")) }));
  for (const a of p.actions) {
    if (a.op === "label-create") gh(["label", "create", a.name, "--color", a.color, "--description", a.description, "--force", "-R", repo]);
    if (a.op === "label-add") gh(["issue", "edit", issue, "--add-label", a.name, "-R", repo]);
    if (a.op === "label-remove") gh(["issue", "edit", issue, "--remove-label", a.name, "-R", repo]);
    if (a.op === "comment-create") gh(["issue", "comment", issue, "--body", a.body, "-R", repo]);
    if (a.op === "comment-edit") gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${a.id}`, "-f", `body=${a.body}`]);
  }
}
