// .github/scripts/fixed-on-main.mjs
// D-FIXED-ON-MAIN-1 (owner 2026-11-12: "tamam supermis bu fixed-on-main etiket fikri bunu bot da uygulasin otomatik";
// earlier: "fixle ve comment at ancak release cikmayalim ... biraz issuler biriksin toplu release cikariz").
// Two modes, one file, string scanning only (no regex, same rule as the intake bot):
//   label  (.github/workflows/fixed-on-main.yml, push to main): a fix:, feat: or perf: commit (any scope, "fix+docs"
//          too) that names #N adds the label "fixed-on-main" to open issue N. A revert commit naming #N removes it when
//          no un-reverted fix commit for #N stays on main. test:, docs:, chore:, data: commits never label. It never
//          comments and never closes.
//   close  (.github/workflows/release.yml job main-close-issues, after the GitHub release of the main path): each open
//          issue with the label whose live fix commits are all in tag v<version> gets one comment with its agent's own
//          update command (UPGRADE_HOST_COMMAND), loses the label and closes as completed. An API error is logged and
//          the run goes on; the step never fails the release.
// The functions above the CLI block are pure (tests/0014-repo-hygiene.test.mjs runs them); the CLI block calls git and gh.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { UPGRADE_HOST_COMMAND } from "../../src/core/contracts/constants.ts";

export const LABEL = { name: "fixed-on-main", color: "0E8A16", description: "Fix is on main, ships in the next release" };
export const FIX_TYPES = ["fix", "feat", "perf"];
export const REVERT_TYPE = "revert";
export const MAINTAINERS = ["OWNER", "MEMBER", "COLLABORATOR"];
export const MARKER = "<!-- context-mode-released -->";
export const INSTALL_GUIDE = "https://github.com/mksglu/context-mode/blob/main/docs/install/README.md";
export const REPO_DEFAULT = "mksglu/context-mode";
const GIT_REVERT = 'Revert "'; // the subject `git revert` writes
const AGENT_HEAD = "### Agent"; // feature.yml dropdown field
const DOCTOR_ENV = "Environment: "; // ctx_doctor env line: "Environment: context-mode 2.1.9 (sha), agent claude-code"
const DOCTOR_AGENT = ", agent ";
// Names a reporter writes for an agent, lower case, mapped to the agent id (the keys of UPGRADE_HOST_COMMAND).
export const AGENT_NAMES = [
  ["claude code", "claude-code"], ["claude-code", "claude-code"], ["claude", "claude-code"], ["codex", "codex"],
  ["gemini cli", "gemini"], ["gemini", "gemini"], ["qwen code", "qwen"], ["qwen", "qwen"], ["opencode", "opencode"],
  ["pi coding agent", "pi"], ["pi", "pi"], ["copilot cli", "copilot-cli"], ["copilot-cli", "copilot-cli"], ["copilot", "copilot-cli"],
  ["vs code", "vscode"], ["vscode", "vscode"], ["kiro", "kiro"], ["z code", "zcode"], ["zcode", "zcode"],
];

const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";
const isHex = (c) => isDigit(c) || (c >= "a" && c <= "f");
const isAlnum = (c) => c !== undefined && (isDigit(c) || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

/** "fix(core)!: x" -> ["fix"]; "fix+docs: x" -> ["fix", "docs"]; no conventional head -> null. */
export function subjectTypes(subject) {
  const colon = subject.indexOf(": ");
  if (colon <= 0) return null;
  let head = subject.slice(0, colon).trim().toLowerCase();
  if (head.endsWith("!")) head = head.slice(0, -1);
  const paren = head.indexOf("(");
  if (paren >= 0) {
    if (!head.endsWith(")")) return null;
    head = head.slice(0, paren);
  }
  if (head === "" || head.includes(" ")) return null;
  return head.split("+");
}

/** "fix" (fix/feat/perf), "revert", "unrevert" (a revert of a revert) or null (test, docs, chore, data, ...). */
export function commitKind(subject) {
  const s = subject.trim();
  if (s.startsWith(GIT_REVERT)) {
    const inner = s.slice(GIT_REVERT.length);
    if (inner.startsWith(GIT_REVERT)) return "unrevert";
    const t = subjectTypes(inner);
    return t !== null && t.includes(REVERT_TYPE) ? "unrevert" : "revert";
  }
  const types = subjectTypes(s);
  if (types === null) return null;
  if (types.includes(REVERT_TYPE)) return "revert";
  return types.some((t) => FIX_TYPES.includes(t)) ? "fix" : null;
}

/** Issue numbers a text names as "#N", in order, each once. "a#1" and "&#123;" are no reference. */
export function issueRefs(text) {
  const out = [];
  for (let i = text.indexOf("#"); i !== -1; i = text.indexOf("#", i + 1)) {
    if (isAlnum(text[i - 1]) || text[i - 1] === "&") continue;
    let j = i + 1;
    while (isDigit(text[j])) j++;
    if (j === i + 1 || isAlnum(text[j])) continue;
    const n = Number(text.slice(i + 1, j));
    if (n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Words of a commit body that look like a commit sha: 7 to 40 hex characters, bounded by non-alphanumerics. */
export function shaTokens(body) {
  const out = [];
  let word = "";
  for (const ch of body + " ") {
    if (isAlnum(ch)) { word += ch; continue; }
    const w = word.toLowerCase();
    if (w.length >= 7 && w.length <= 40 && [...w].every(isHex)) out.push(w);
    word = "";
  }
  return out;
}

/**
 * The fix commits that stay on main for each issue, after the reverts. Input: commits oldest first, { sha, subject, body }.
 * A revert removes the fix commits its body names by sha ("This reverts commit <sha>", "Reverts ... 4d45b836 921ba58c");
 * a revert whose body names no known commit removes every fix commit of the issues its subject names. A revert of a
 * revert puts back what that revert removed. Output: Map issue -> Set of full shas.
 */
export function liveFixes(commits) {
  const live = new Map();
  const seen = [];
  const removedBy = new Map(); // revert sha -> [[issue, sha]]
  const lastRemoved = new Map(); // issue -> [[issue, sha]]
  const add = (n, sha) => { if (!live.has(n)) live.set(n, new Set()); live.get(n).add(sha); };
  for (const c of commits) {
    const kind = commitKind(c.subject);
    const refs = kind === null ? [] : issueRefs(c.subject);
    const named = kind === null || kind === "fix" ? [] : shaTokens(c.body ?? "");
    const knows = (t) => seen.some((s) => s.startsWith(t));
    seen.push(c.sha);
    if (kind === "fix") { for (const n of refs) add(n, c.sha); continue; }
    if (kind === "revert") {
      const exact = named.filter(knows);
      const out = [];
      for (const [n, set] of live) {
        for (const sha of set) {
          if (exact.length ? exact.some((t) => sha.startsWith(t)) : refs.includes(n)) out.push([n, sha]);
        }
      }
      for (const [n, sha] of out) live.get(n).delete(sha);
      removedBy.set(c.sha, out);
      for (const n of refs) lastRemoved.set(n, out);
      continue;
    }
    if (kind === "unrevert") {
      let back = null;
      for (const [rsha, out] of removedBy) if (named.some((t) => rsha.startsWith(t))) back = out;
      if (back === null) back = refs.flatMap((n) => lastRemoved.get(n) ?? []);
      for (const [n, sha] of back) add(n, sha);
    }
  }
  for (const [n, set] of live) if (set.size === 0) live.delete(n);
  return live;
}

/**
 * Label actions for one push. pushed: the pushed commits { sha, subject }; live: liveFixes() of main after the push;
 * open: Map issue -> label names (open issues only, no pull requests). Output: label-create, label-add, label-remove.
 */
export function labelPlan({ pushed, live, open }) {
  const add = [];
  const remove = [];
  for (const c of pushed) {
    if (commitKind(c.subject) === null) continue;
    for (const n of issueRefs(c.subject)) {
      if (!open.has(n)) continue;
      const has = open.get(n).includes(LABEL.name);
      const alive = live.has(n);
      if (alive && !has && !add.includes(n)) add.push(n);
      if (!alive && has && !remove.includes(n)) remove.push(n);
    }
  }
  return [
    ...(add.length ? [{ op: "label-create", ...LABEL }] : []),
    ...add.map((issue) => ({ op: "label-add", issue, name: LABEL.name })),
    ...remove.map((issue) => ({ op: "label-remove", issue, name: LABEL.name })),
  ];
}

/** The agent id a name stands for, or null. */
export function agentId(name) {
  const t = name.trim().toLowerCase();
  const hit = AGENT_NAMES.find(([n]) => n === t);
  return hit ? hit[1] : null;
}

/** The words of a title prefix, alone and in pairs ("claude code", "gemini cli"). */
function prefixWords(prefix) {
  const words = [];
  let w = "";
  for (const ch of prefix + " ") {
    if (ch === " " || ch === "/" || ch === "," || ch === "\t") { if (w) words.push(w); w = ""; } else w += ch;
  }
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (i + 1 < words.length) out.push(words[i] + " " + words[i + 1]);
    out.push(words[i]);
  }
  return out;
}

/**
 * The agent of an issue: the feature form field "### Agent", then the title prefix ("[claude-code] ...", "Pi: ...",
 * "Windows/OpenCode: ..."), then the ctx_doctor env line ("agent opencode"). null when none names a known agent.
 */
export function agentOf({ title = "", body = "" }) {
  const lines = body.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const head = lines.findIndex((l) => l.trim() === AGENT_HEAD);
  if (head !== -1) {
    const value = lines.slice(head + 1).find((l) => l.trim() !== "");
    const id = value === undefined ? null : agentId(value) ?? agentId(prefixWords(value.trim())[0] ?? "");
    if (id) return id;
  }
  // Title: the "[...]" prefix, then the words before the first colon, then the first word (pair) of the title.
  let t = title.trim().toLowerCase();
  const cands = [];
  const close = t.indexOf("]");
  if (t.startsWith("[") && close !== -1) {
    cands.push(...prefixWords(t.slice(1, close)));
    let k = close + 1;
    while (t[k] === ":" || t[k] === " ") k++;
    t = t.slice(k);
  }
  const colon = t.indexOf(":");
  if (colon > 0) cands.push(...prefixWords(t.slice(0, colon)));
  cands.push(...prefixWords(t).slice(0, 2));
  for (const w of cands) { const id = agentId(w); if (id) return id; }
  for (const l of lines) {
    const s = l.trim();
    const at = s.indexOf(DOCTOR_AGENT);
    if (!s.startsWith(DOCTOR_ENV) || at === -1) continue;
    const rest = s.slice(at + DOCTOR_AGENT.length);
    const space = rest.indexOf(" ");
    const id = agentId(space === -1 ? rest : rest.slice(0, space));
    if (id) return id;
  }
  return null;
}

/** "2.1.11" from "v2.1.11" or "2.1.11". */
export const bareVersion = (v) => (v.startsWith("v") ? v.slice(1) : v).trim();

/** True when text names version v as a whole: "2.1.1" is not named by "2.1.11" or "12.1.1". */
export function namesVersion(text, version) {
  const v = bareVersion(version);
  for (let i = text.indexOf(v); i !== -1; i = text.indexOf(v, i + 1)) {
    const before = text[i - 1];
    const after = text[i + v.length];
    if (isDigit(before) || before === ".") continue;
    if (isDigit(after) || (after === "." && isDigit(text[i + v.length + 1]))) continue;
    return true;
  }
  return false;
}

/** The one release comment: version, the agent's own update command, how to reopen. */
export function releaseComment(version, agent) {
  const v = "v" + bareVersion(version);
  const cmd = agent ? UPGRADE_HOST_COMMAND[agent] : undefined;
  const update = cmd ? `Update with \`${cmd}\`.` : `Update with your agent's own update command: ${INSTALL_GUIDE}.`;
  return `${MARKER}\nReleased in ${v}. ${update} If it still happens on ${v}, please reopen this issue.`;
}

/**
 * Close actions for one release. issues: open issues { number, title, body, labels, comments: [{ body, bot, assoc }] };
 * live: liveFixes() of main; inTag(sha): the sha is in tag v<version>. An issue closes when it holds the label and every
 * fix commit that stays on main for it is in the tag. Output: { actions, skipped }; an action is comment-create,
 * label-remove or close.
 */
export function closePlan({ version, issues, live, inTag }) {
  const actions = [];
  const skipped = [];
  const v = "v" + bareVersion(version);
  for (const i of issues) {
    if (!i.labels.includes(LABEL.name)) continue;
    const shas = [...(live.get(i.number) ?? [])];
    if (shas.length === 0) { skipped.push({ issue: i.number, why: "no fix commit for it stays on main" }); continue; }
    if (!shas.every(inTag)) { skipped.push({ issue: i.number, why: `a fix commit is after ${v}` }); continue; }
    const comments = i.comments ?? [];
    if (comments.some((c) => !c.bot && MAINTAINERS.includes(c.assoc) && namesVersion(c.body, version))) {
      skipped.push({ issue: i.number, why: `a maintainer comment names ${v}` });
      continue;
    }
    if (!comments.some((c) => c.body.includes(MARKER) && namesVersion(c.body, version))) {
      actions.push({ op: "comment-create", issue: i.number, body: releaseComment(version, agentOf(i)) });
    }
    actions.push({ op: "label-remove", issue: i.number, name: LABEL.name }, { op: "close", issue: i.number });
  }
  return { actions, skipped };
}

/** `git log --format=%H%x1f%s%x1f%b%x1e` output -> [{ sha, subject, body }]. */
export function parseLog(text) {
  const out = [];
  for (const rec of text.split("\x1e")) {
    const r = rec.startsWith("\n") ? rec.slice(1) : rec;
    if (r.trim() === "") continue;
    const [sha, subject = "", body = ""] = r.split("\x1f");
    out.push({ sha: sha.trim(), subject, body });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const mode = args[0];
  const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const dry = args.includes("--dry-run");
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY ?? REPO_DEFAULT;
  const LOG = ["log", "--reverse", "--format=%H%x1f%s%x1f%b%x1e"];
  const git = (a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
  const gh = (a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 1 << 28 });
  let failed = 0;
  const run = (a, argv) => {
    if (dry) { console.log("dry-run: " + a.op + (a.issue ? " #" + a.issue : "")); return; }
    try { gh(argv); console.log(a.op + (a.issue ? " #" + a.issue : "")); }
    catch (e) { failed++; console.log(`::warning::${a.op} #${a.issue ?? ""} failed: ${String(e.message).split("\n")[0]}`); }
  };
  const live = () => liveFixes(parseLog(git([...LOG, "HEAD"])));
  try {
    if (mode === "label") {
      // The pushed range is before..HEAD of the push event (its commits list stops at 20); a new branch or a run by hand
      // uses --since, else the newest v* tag.
      const ev = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : null;
      const before = ev && typeof ev.before === "string" && !ev.before.split("").every((c) => c === "0") ? ev.before : null;
      const since = flag("--since") ?? before ?? git(["describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD"]).trim();
      const pushed = parseLog(git([...LOG, since + "..HEAD"]));
      const open = new Map(JSON.parse(gh(["issue", "list", "-R", repo, "--state", "open", "--limit", "1000", "--json", "number,labels"]))
        .map((i) => [i.number, i.labels.map((l) => l.name)]));
      const fixes = live();
      const plan = labelPlan({ pushed, live: fixes, open });
      const holds = [...open.keys()].filter((n) => fixes.has(n) && pushed.some((c) => commitKind(c.subject) === "fix" && issueRefs(c.subject).includes(n)));
      console.log(JSON.stringify({ since, pushed: pushed.length, holds: holds.sort((a, b) => a - b).map((n) => "#" + n + (open.get(n).includes(LABEL.name) ? " (has it)" : "")), ops: plan.map((a) => a.op + (a.issue ? " #" + a.issue : "")) }));
      for (const a of plan) {
        if (a.op === "label-create") run(a, ["label", "create", a.name, "--color", a.color, "--description", a.description, "--force", "-R", repo]);
        if (a.op === "label-add") run(a, ["issue", "edit", String(a.issue), "--add-label", a.name, "-R", repo]);
        if (a.op === "label-remove") run(a, ["issue", "edit", String(a.issue), "--remove-label", a.name, "-R", repo]);
      }
      process.exitCode = failed ? 1 : 0;
    } else if (mode === "close") {
      const version = bareVersion(flag("--version") ?? process.env.VERSION ?? "");
      if (!version) throw new Error("close needs --version");
      const tag = flag("--tag") ?? "v" + version;
      const issues = JSON.parse(gh(["issue", "list", "-R", repo, "--state", "open", "--label", LABEL.name, "--limit", "1000", "--json", "number,title,body,labels"]))
        .map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
      const readable = [];
      for (const i of issues) {
        try {
          i.comments = gh(["api", "--paginate", `repos/${repo}/issues/${i.number}/comments`, "--jq",
            ".[] | {body, bot: (.user.type == \"Bot\"), assoc: .author_association}"])
            .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
          readable.push(i);
        } catch (e) { console.log(`::warning::comments of #${i.number} unread, issue skipped: ${String(e.message).split("\n")[0]}`); }
      }
      const inTag = (sha) => spawnSync("git", ["merge-base", "--is-ancestor", sha, tag]).status === 0;
      const { actions, skipped } = closePlan({ version, issues: readable, live: live(), inTag });
      console.log(JSON.stringify({ tag, labeled: issues.length, ops: actions.map((a) => a.op + " #" + a.issue), skipped }));
      for (const a of actions) {
        if (a.op === "comment-create") run(a, ["issue", "comment", String(a.issue), "--body", a.body, "-R", repo]);
        if (a.op === "label-remove") run(a, ["issue", "edit", String(a.issue), "--remove-label", a.name, "-R", repo]);
        if (a.op === "close") run(a, ["issue", "close", String(a.issue), "--reason", "completed", "-R", repo]);
      }
    } else {
      throw new Error("usage: fixed-on-main.mjs label|close [--dry-run] [--repo o/r] [--since ref] [--version x.y.z] [--tag vX]");
    }
  } catch (e) {
    console.log(`::warning::fixed-on-main ${mode}: ${String(e.message).split("\n")[0]}`);
    // The close step must not fail the release; a label run shows its failure.
    process.exitCode = mode === "close" ? 0 : 1;
  }
}
