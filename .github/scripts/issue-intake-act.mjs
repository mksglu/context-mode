// .github/scripts/issue-intake-act.mjs
// Reads the score from issue-intake.mjs, then sets one label ("repro-ready" or "needs-info") and keeps ONE
// comment up to date: it finds its own comment by MARKER and edits it in place. The bot leaves issue state
// to maintainers, and it steps back on an issue a maintainer filed, labeled "maintainer-ack" or commented on.
// D-INTAKE-SCORE-1 (owner 2026-11-05: "bu GitHub Actions bot u cok kati calisiyor"). ADR-0014 §5.
// D-INTAKE-LABELS-1 (owner 2026-11-07: "GitHub Actions, labelleri kendisi otomatik yapmali"): it also sets the
// type labels ("bug"; "enhancement" + "priority: low" for a feature request, which gets a short thanks and no
// checklist) and "duplicate" with one link line when an older open issue holds the same setup report fingerprint.
// plan() is pure (tests/0014-repo-hygiene.test.mjs runs it); the bottom block runs its actions through `gh`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { ITEMS, fingerprintOf } from "./issue-intake.mjs";

export const MARKER = "<!-- context-mode-intake -->";
export const MAINTAINERS = ["OWNER", "MEMBER", "COLLABORATOR"];
export const SKIP_LABELS = ["maintainer-ack", "v1-frozen"];
export const STATUS_LABELS = {
  "repro-ready": { color: "0e8a16", description: "Version, steps and output are in the issue" },
  "needs-info": { color: "fbca04", description: "The intake comment lists what to add" },
};
// The values the repo already uses for these labels, so "label create --force" keeps them as they are.
export const TYPE_LABELS = {
  bug: [{ name: "bug", color: "d73a4a", description: "Something isn't working" }],
  feature: [
    { name: "enhancement", color: "a2eeef", description: "New feature or request" },
    { name: "priority: low", color: "C5DEF5", description: "Planned after current bugs" },
  ],
};
export const DUPLICATE_LABEL = { name: "duplicate", color: "cfd3d7", description: "This issue or pull request already exists" };
export const OLD_LABELS = ["has-report", "no-report", "needs-report"]; // labels of the first intake check
export const GUIDE_URL = "https://github.com/mksglu/context-mode/blob/main/.github/AGENT_ISSUE.md";

/** The one intake comment for a score: the status, a checklist of the missing items, secret notes. */
export function commentBody(result, duplicateOf = null) {
  const dup = duplicateOf ? ["", `Same setup report fingerprint \`${result.fingerprint}\` as #${duplicateOf}: please add new facts there.`] : [];
  if (result.kind === "feature") {
    return [MARKER, "**Intake check: feature request**", "", "Thanks for the idea! A maintainer reads each feature request and plans it after the current bug fixes.", ...dup].join("\n");
  }
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
  lines.push(...dup);
  lines.push("", `This comment updates on each edit of the issue body. Guide for coding agents: ${GUIDE_URL}`);
  return lines.join("\n");
}

/**
 * The actions for one run. Input: the score, the issue author's association, the issue's label names and its
 * comments ({ id, body, bot, assoc }), and duplicateOf: the number of an older open issue with the same setup
 * report fingerprint, or null. Output: { skip, actions }; an action is one of label-create, label-add,
 * label-remove, comment-create, comment-edit. Issue state stays with maintainers in every case.
 */
export function plan({ result, author, labels, comments, duplicateOf = null }) {
  if (MAINTAINERS.includes(author)) return { skip: "author is a maintainer", actions: [] };
  const held = SKIP_LABELS.find((l) => labels.includes(l));
  if (held) return { skip: `label ${held}`, actions: [] };
  if (comments.some((c) => !c.bot && MAINTAINERS.includes(c.assoc))) return { skip: "a maintainer commented", actions: [] };
  const actions = [];
  const feature = result.kind === "feature";
  // A feature request has no repro to score, so it carries no status label.
  const label = feature ? null : result.status;
  for (const l of [...Object.keys(STATUS_LABELS), ...OLD_LABELS]) if (l !== label && labels.includes(l)) actions.push({ op: "label-remove", name: l });
  const add = [...(label ? [{ name: label, ...STATUS_LABELS[label] }] : []), ...(TYPE_LABELS[result.kind] ?? []), ...(duplicateOf ? [DUPLICATE_LABEL] : [])];
  for (const l of add) if (!labels.includes(l.name)) actions.push({ op: "label-create", ...l }, { op: "label-add", name: l.name });
  const own = comments.find((c) => c.bot && c.body.includes(MARKER));
  const body = commentBody(result, duplicateOf);
  const needed = feature || duplicateOf !== null || result.missing.length > 0 || result.warnings.length > 0;
  if (own) {
    if (own.body !== body) actions.push({ op: "comment-edit", id: own.id, body });
  } else if (needed) {
    actions.push({ op: "comment-create", body });
  }
  return { skip: null, actions };
}

/** The lowest-numbered open issue, older than `self`, whose body holds a setup report with fingerprint `fp`. */
export function firstWithFingerprint(issues, fp, self) {
  if (!fp) return null;
  const older = issues.filter((i) => i.number < self && fingerprintOf(i.body) === fp).map((i) => i.number);
  return older.length ? Math.min(...older) : null;
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
  const open = result.fingerprint
    ? JSON.parse(gh(["issue", "list", "-R", repo, "--state", "open", "--limit", "1000", "--json", "number,body"]))
    : [];
  const duplicateOf = firstWithFingerprint(open, result.fingerprint, Number(issue));
  const p = plan({ result, author: info.author_association, labels: info.labels.map((l) => l.name), comments, duplicateOf });
  console.log(JSON.stringify({ skip: p.skip, ops: p.actions.map((a) => a.op + (a.name ? " " + a.name : "")) }));
  for (const a of p.actions) {
    if (a.op === "label-create") gh(["label", "create", a.name, "--color", a.color, "--description", a.description, "--force", "-R", repo]);
    if (a.op === "label-add") gh(["issue", "edit", issue, "--add-label", a.name, "-R", repo]);
    if (a.op === "label-remove") gh(["issue", "edit", issue, "--remove-label", a.name, "-R", repo]);
    if (a.op === "comment-create") gh(["issue", "comment", issue, "--body", a.body, "-R", repo]);
    if (a.op === "comment-edit") gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${a.id}`, "-f", `body=${a.body}`]);
  }
}
