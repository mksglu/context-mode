// .github/scripts/issue-intake.mjs
// Parses an issue body by heading and by line prefix, not by regex (owner rule). Checks the
// required headings, the ctx_doctor report keys, and scans free text for secret prefixes.
// Prints a structured JSON result for issue-intake-act.mjs to act on.
// ADR-0014 §2/§3/§5, https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/agent-issue-intake/VALIDATION.md, DEVIATIONS D-M6-arch-6, D-M6-I2-1.
import { pathToFileURL } from "node:url";

export const REQUIRED_HEADINGS = ["Summary", "ctx-report", "What happened", "Expected", "Steps", "Environment"];

// Mirror of the ctx_doctor report (src/core/ops/report.ts, src/core/contracts/constants.ts):
// REPORT_HEADER, REPORT_HEADER_RULE, DOCTOR_CHECK_ORDER, REPORT_ENV_PREFIX + REPORT_ENV_ENUMS keys,
// REPORT_COMMAND_PREFIX (ADR-0019 D7), REPORT_TRUNCATED_LINE prefix. GP11/issue-intake-allowed-keys fails when the two sides differ.
export const REPORT_HEADER = "| Check | Status | Detail | Fix |";
export const REPORT_HEADER_RULE = "|---|---|---|---|";
export const CHECK_KEYS = ["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"];
export const ENV_KEYS = ["env.NODE_ENV"];
export const ALLOWED_KEYS = new Set([...CHECK_KEYS, ...ENV_KEYS]);
const TRUNCATED_PREFIX = "(report truncated at ";
const COMMAND_PREFIX = "Run in a terminal: ";
const ROW_PREFIX = "| ";
const ENV_PREFIX = "env.";
const FENCE = "```";

// ADR-0014 §3: substring scan of free text; a match is flagged in the comment, never blocks.
const SECRET_MARKERS = ["github_pat_", "sk-", "TOKEN="];
const PATH_MARKERS = ["/Users/", "/home/", "C:\\"];
const SCANNED = ["Summary", "What happened", "Steps"];

function splitHeadings(body) {
  const sections = {};
  const order = [];
  let current = null;
  for (const raw of body.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("### ")) {
      current = line.slice(4).trim();
      order.push(current);
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return { sections, order };
}

// One report line -> its key, or null when the line carries no key (header, rule, command, truncation).
// A line that is none of these returns undefined: it was not written by ctx_doctor.
export function lineKey(line) {
  if (line === REPORT_HEADER || line === REPORT_HEADER_RULE || line.startsWith(TRUNCATED_PREFIX) || line.startsWith(COMMAND_PREFIX)) return null;
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

// Keys of a pasted report, in order; `bad` holds lines that are not report lines.
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

export function check(body) {
  const findings = [];
  const warnings = [];
  const { sections, order } = splitHeadings(body);

  const missing = REQUIRED_HEADINGS.filter((h) => !(h in sections));
  if (missing.length) findings.push({ code: "missing-heading", headings: missing });
  const presentRequired = order.filter((h) => REQUIRED_HEADINGS.includes(h));
  const inOrder = REQUIRED_HEADINGS.filter((h) => presentRequired.includes(h));
  if (presentRequired.join("\n") !== inOrder.join("\n")) findings.push({ code: "heading-order" });

  for (const name of SCANNED) {
    const text = (sections[name] || []).join("\n");
    for (const m of [...SECRET_MARKERS, ...PATH_MARKERS]) if (text.includes(m)) warnings.push({ section: name, marker: m });
  }

  // VALIDATION.md item 5: a Steps line that names a denied tool also names the alternative (substring check).
  const steps = (sections["Steps"] || []).filter((l) => l.includes("denied") && !l.includes("alternative"));
  if (steps.length) findings.push({ code: "steps-deny-no-alt", count: steps.length });

  const reportLines = sections["ctx-report"] || [];
  if (!reportLines.some((l) => l.trim() === REPORT_HEADER)) {
    findings.push({ code: "no-report" });
    return { ok: false, findings, warnings, hasReport: false };
  }
  const { keys, bad } = reportKeys(reportLines);
  if (bad.length) findings.push({ code: "foreign-line", count: bad.length });
  const unknown = keys.filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length) findings.push({ code: "unknown-key", keys: unknown });
  const absent = CHECK_KEYS.filter((k) => !keys.includes(k));
  const truncated = reportLines.some((l) => l.trim().startsWith(TRUNCATED_PREFIX));
  if (absent.length && !truncated) findings.push({ code: "missing-key", keys: absent });

  return { ok: findings.length === 0, findings, warnings, hasReport: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(check(process.env.BODY || "")));
}
