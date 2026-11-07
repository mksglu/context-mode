// .github/scripts/issue-intake.mjs
// Scores an issue body for repro readiness. It reads lines, headings and fenced blocks by prefix and
// substring, with zero regex (owner rule). It accepts any layout: the agent-report form, the bug form,
// or free Markdown with "##" headings. Prints a JSON result for issue-intake-act.mjs.
// D-INTAKE-SCORE-1 (owner 2026-11-05: "bu GitHub Actions bot u cok kati calisiyor"; #1306 and #1307
// were clear reports with steps, output and the source line, and the old check closed both).
// ADR-0014 §2/§3/§5, DEVIATIONS D-M6-arch-6, D-M6-I2-1.
// D-INTAKE-LABELS-1 (owner 2026-11-07: "GitHub Actions, labelleri kendisi otomatik yapmali"): score() also
// returns the issue type ("bug", "feature" or null) and the fingerprint of a context-mode setup/doctor report.
import { pathToFileURL } from "node:url";

// Mirror of the ctx_doctor report (src/core/ops/report.ts, src/core/contracts/constants.ts):
// REPORT_HEADER, REPORT_HEADER_RULE, DOCTOR_CHECK_ORDER, REPORT_ENV_PREFIX + REPORT_ENV_ENUMS keys,
// REPORT_COMMAND_PREFIX (ADR-0019 D7), REPORT_TRUNCATED_LINE prefix, DOCTOR_NOTE_PREFIXES.
// GP11/issue-intake-allowed-keys and tests/0014-repo-hygiene.test.mjs fail when the two sides differ.
export const REPORT_HEADER = "| Check | Status | Detail | Fix |";
export const REPORT_HEADER_RULE = "|---|---|---|---|";
export const CHECK_KEYS = ["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"];
export const ENV_KEYS = ["env.NODE_ENV"];
export const ALLOWED_KEYS = new Set([...CHECK_KEYS, ...ENV_KEYS]);
export const NOTE_PREFIXES = ["Environment: ", "Docs: ", "Report file: ", "File it: ", "--", "Or open: ", "Rules: "]; // = DOCTOR_NOTE_PREFIXES
// = the agent-report.yml field the doctor report goes in (ISSUE_FORM_HEADINGS[1]).
export const REPORT_FIELD = "ctx-report";
const TRUNCATED_PREFIX = "(report truncated at ";
const COMMAND_PREFIX = "Run in a terminal: ";
const HEADER_START = "| Check | Status"; // the 3-column table of 2.0.0 and the 4-column table of 2.0.1+
const ROW_PREFIX = "| ";
const ENV_PREFIX = "env.";
const FENCE = "```";
const NO_RESPONSE = "_No response_"; // GitHub's text for an empty form field

// What a maintainer needs to replay a report, in the order the comment lists the missing ones.
export const ITEMS = [
  { key: "report", label: "ctx_doctor report", hint: "call the `ctx_doctor` tool and paste its full output unchanged in the `ctx-report` field" },
  { key: "version", label: "context-mode version", hint: "row D1 of the doctor report, or `npm ls -g context-mode --depth=0`" },
  { key: "agent", label: "agent name and version", hint: "for example `claude --version`, `codex --version`, `opencode --version`" },
  { key: "os", label: "OS and arch", hint: "`uname -sm`; on Windows, `$env:OS` and `$env:PROCESSOR_ARCHITECTURE`" },
  { key: "node", label: "Node version", hint: "`node --version`" },
  { key: "steps", label: "numbered repro steps from a fresh project", hint: "start from `mktemp -d` and the agent's own install command" },
  { key: "expected", label: "what you expected", hint: "one line under an `Expected` heading" },
  { key: "observed", label: "what happened instead", hint: "one line under an `Actual` or `What happened` heading" },
  { key: "output", label: "exact command and exact output", hint: "in a fenced code block, copied unchanged" },
];
// A body with these three is repro-ready, with or without the doctor table (owner 2026-11-05).
export const READY_KEYS = ["version", "steps", "output"];

const AGENT_MARKERS = ["claude code", "claude-code", "claude", "codex", "gemini cli", "gemini", "qwen code", "qwen", "opencode",
  "pi coding agent", "pi", "copilot cli", "copilot", "vs code", "vscode", "kiro", "zcode", "cursor"];
const RUNTIME_MARKERS = ["node", "bun"];
const OS_MARKERS = ["linux", "macos", "darwin", "windows", "win32", "wsl", "ubuntu", "debian", "fedora", "alpine"];
const OBSERVED_MARKERS = ["observed", "actual", "what happened", "output", "error", "warning"];
const STEP_HEAD_MARKERS = ["step", "repro"];
const VERSION_FILLERS = [" ", "\t", ":", "@", "=", "(", "version", "-cli", "cli", "v"];
// ADR-0014 §3: a substring scan for secret prefixes; a hit adds a note to the comment and changes nothing else.
const SECRET_MARKERS = ["github_pat_", "ghp_", "sk-ant-", "sk-proj-", "TOKEN="];

// D-INTAKE-LABELS-1: the type of an issue, read from its title and its form headings.
export const FEATURE_TITLES = ["feature request", "[feature request]", "[feature]"];
export const BUG_TITLE = "bug"; // "[Bug]: ..." titles of bug.yml
// = the agent dropdown of .github/ISSUE_TEMPLATE/feature.yml; "[<agent>] ..." titles are bug reports.
export const AGENT_IDS = ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode", "pi", "opencode"];
// = the field labels of feature.yml; a body with all three came from the feature form.
export const FEATURE_FORM_HEADS = ["Agent", "Problem", "Evidence links"];
// = the first field of bug.yml and REPORT_FIELD of agent-report.yml; a body with one came from a bug form.
export const BUG_FORM_HEADS = ["Did you run `/ctx-doctor`?", REPORT_FIELD];
// = buildIssueReport in src/cli/commands.ts: "# context-mode <command> report" and these field lines.
const SETUP_HEAD = "# context-mode ";
const SETUP_HEAD_END = " report";
export const SETUP_FIELDS = ["fingerprint", "version", "node", "platform"];

const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";
const isWordChar = (c) => c !== undefined && ((c >= "a" && c <= "z") || isDigit(c) || c === "_" || c === "-" || c === ".");

/** A line a reporter left unfilled: blank, GitHub's "_No response_", or a value that starts with "<". */
export function isPlaceholder(raw) {
  let t = raw.trim();
  if (t === "" || t === NO_RESPONSE) return true;
  if (t.startsWith("- ") || t.startsWith("* ")) t = t.slice(2).trim();
  const n = numberedRest(t);
  if (n !== null) t = n;
  const colon = t.indexOf(": ");
  const value = colon === -1 ? t : t.slice(colon + 2).trim();
  return value === "" ? t.startsWith("<") : value.startsWith("<");
}

/** "3. text" or "3) text" -> "text"; any other line -> null. */
function numberedRest(t) {
  let i = 0;
  while (isDigit(t[i])) i++;
  if (i === 0 || i > 3) return null;
  if ((t[i] === "." || t[i] === ")") && t[i + 1] === " ") return t.slice(i + 2).trim();
  return null;
}

/** Splits a body into headed sections and fenced blocks; "#" lines inside a fence stay code. */
export function parse(body) {
  const sections = [{ head: "", lines: [], fences: [] }];
  const fences = [];
  let fence = null;
  for (const raw of body.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const t = line.trim();
    const sec = sections[sections.length - 1];
    if (t.startsWith(FENCE)) {
      if (fence === null) { fence = []; continue; }
      fences.push(fence);
      sec.fences.push(fence);
      fence = null;
      continue;
    }
    if (fence !== null) { fence.push(line); continue; }
    if (t.startsWith("#")) {
      let i = 0;
      while (t[i] === "#") i++;
      if (i <= 6 && t[i] === " ") {
        sections.push({ head: t.slice(i + 1).trim(), lines: [], fences: [] });
        continue;
      }
    }
    sec.lines.push(line);
  }
  if (fence !== null) { fences.push(fence); sections[sections.length - 1].fences.push(fence); }
  return { sections, fences };
}

const filled = (lines) => lines.filter((l) => !isPlaceholder(l));
const sectionFilled = (s) => filled(s.lines).length > 0 || s.fences.some((f) => filled(f).length > 0);

/** True when `marker` occurs as a word and a version number follows it (after "version", ":", "@", "v" ...). */
export function versionAfter(lower, marker) {
  let at = lower.indexOf(marker);
  while (at !== -1) {
    const before = lower[at - 1];
    if (!isWordChar(before)) {
      let i = at + marker.length;
      let moved = true;
      while (moved) {
        moved = false;
        for (const f of VERSION_FILLERS) if (lower.startsWith(f, i)) { i += f.length; moved = true; break; }
      }
      if (isDigit(lower[i]) && i > at + marker.length) return true;
    }
    at = lower.indexOf(marker, at + 1);
  }
  return false;
}

/** The key of a ctx_doctor table row, with or without the leading "| ", or null. */
function rowKey(line) {
  let t = line.trim();
  if (t.startsWith(ROW_PREFIX)) t = t.slice(ROW_PREFIX.length);
  const end = t.indexOf(" ");
  if (end === -1 || !t.includes(" | ")) return null;
  const key = t.slice(0, end);
  return CHECK_KEYS.includes(key) ? key : null;
}

// One report line -> its key, or null when the line carries no key (header, rule, command, note, truncation).
// A line that is none of these returns undefined: it was written by hand.
export function lineKey(line) {
  if (line === REPORT_HEADER || line === REPORT_HEADER_RULE || line.startsWith(TRUNCATED_PREFIX) || line.startsWith(COMMAND_PREFIX)) return null;
  if (NOTE_PREFIXES.some((p) => line.startsWith(p))) return null;
  if (line.startsWith(ROW_PREFIX)) {
    const cell = line.slice(ROW_PREFIX.length);
    const end = cell.indexOf(" ");
    return end === -1 ? cell : cell.slice(0, end);
  }
  if (line.startsWith(ENV_PREFIX)) {
    const end = line.indexOf(": ");
    return end === -1 ? line : line.slice(0, end);
  }
  return undefined;
}

// Keys of a pasted report, in order; `bad` holds lines that ctx_doctor did not write.
export function reportKeys(lines) {
  const keys = [];
  const bad = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(FENCE)) continue;
    const key = lineKey(line);
    if (key === undefined) bad.push(line);
    else if (key !== null) keys.push(key);
  }
  return { keys, bad };
}

const isHex = (v) => v.length >= 8 && v.length <= 64 && [...v].every((c) => isDigit(c) || (c >= "a" && c <= "f"));

/** The fields of a context-mode setup/doctor report ("# context-mode setup report"), or null. */
export function setupReport(body) {
  const lines = (body || "").split("\n").map((l) => l.trim());
  if (!lines.some((l) => l.startsWith(SETUP_HEAD) && l.endsWith(SETUP_HEAD_END))) return null;
  const out = {};
  for (const f of SETUP_FIELDS) {
    const line = lines.find((l) => l.startsWith(f + ": "));
    if (line === undefined) return null;
    out[f] = line.slice(f.length + 2).trim();
  }
  return isHex(out.fingerprint) && isDigit(out.version[0]) ? out : null;
}

/** The fingerprint of the setup/doctor report in a body, or null. */
export const fingerprintOf = (body) => setupReport(body)?.fingerprint ?? null;

/** "bug", "feature" or null, from the title prefix, then the form headings, then a report or a replayable repro. */
export function kindOf(title, heads, report, ready = false) {
  const t = (title || "").trim().toLowerCase();
  if (FEATURE_TITLES.some((p) => t.startsWith(p))) return "feature";
  const close = t.indexOf("]");
  if (t.startsWith("[") && close !== -1) {
    const tag = t.slice(1, close).trim();
    if (tag === BUG_TITLE || AGENT_IDS.includes(tag) || AGENT_MARKERS.includes(tag)) return "bug";
  }
  const has = (h) => heads.includes(h.toLowerCase());
  if (FEATURE_FORM_HEADS.every(has)) return "feature";
  if (BUG_FORM_HEADS.some(has) || report || ready) return "bug";
  return null;
}

/** Scores a body: which ITEMS it holds, which are missing, and "repro-ready" or "needs-info". */
export function score(body, title = "") {
  const { sections, fences } = parse(body || "");
  const textLines = filled(sections.flatMap((s) => s.lines));
  const codeLines = filled(fences.flat());
  const all = [...textLines, ...codeLines];
  const lower = all.join("\n").toLowerCase();
  const heads = sections.filter((s) => s.head !== "" && sectionFilled(s)).map((s) => s.head.toLowerCase());
  const said = (markers) => markers.some((m) => heads.some((h) => h.includes(m)) || textLines.some((l) => l.toLowerCase().includes(m)));

  const rows = new Set(all.map(rowKey).filter((k) => k !== null));
  const steps = sections.filter((s) => STEP_HEAD_MARKERS.some((m) => s.head.toLowerCase().includes(m)));
  const have = {
    report: all.some((l) => l.trim().startsWith(HEADER_START)) || rows.size >= 3,
    version: versionAfter(lower, "context-mode"),
    agent: AGENT_MARKERS.some((m) => versionAfter(lower, m)),
    os: OS_MARKERS.some((m) => lower.includes(m)),
    node: RUNTIME_MARKERS.some((m) => versionAfter(lower, m)),
    steps: textLines.filter((l) => numberedRest(l.trim()) !== null).length >= 2 || steps.some((s) => s.fences.some((f) => filled(f).length > 0)),
    expected: said(["expected"]),
    observed: said(OBSERVED_MARKERS),
    output: fences.some((f) => filled(f).length > 0),
  };
  // A setup/doctor report holds the version, Node, platform, the command it ran and its result table.
  const setup = setupReport(body);
  if (setup) for (const k of ["report", "version", "os", "node", "steps", "observed", "output"]) have[k] = true;
  const missing = ITEMS.filter((i) => !have[i.key]).map((i) => i.key);
  const status = READY_KEYS.every((k) => have[k]) ? "repro-ready" : "needs-info";
  const warnings = SECRET_MARKERS.filter((m) => (body || "").includes(m));
  const kind = kindOf(title, sections.map((s) => s.head.toLowerCase()), have.report, status === "repro-ready");
  return { status, kind, fingerprint: setup ? setup.fingerprint : null, have, missing, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(score(process.env.BODY || "", process.env.TITLE || "")));
}
