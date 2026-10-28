// impl/07 §4, ADR-0010 (FAIL string), ADR-0014 §2-§3 (cap, redaction by structure), 14a GP11
// redact-secrets-in-debug-report (#1144) and redact-secrets-in-doctor-output (#1141); DEVIATIONS D-M5-O3-1..3.
// Pure function: renders the ctx_doctor table plus typed env lines, ; buildReportHead shortens the reply, never the stored report.
import {
  DOCTOR_FAIL_LINE,
  REPORT_CAP,
  REPORT_COMMAND_PREFIX,
  REPORT_ENV_ENUMS,
  REPORT_ENV_PREFIX,
  REPORT_HEADER,
  REPORT_HEADER_RULE,
  REPORT_INVALID,
  REPORT_POINTER,
  REPORT_REST_PREFIX,
} from "../contracts/constants.ts";
import type { AgentId, DoctorRow } from "../contracts/types.ts";

export interface ReportInput {
  agent: AgentId; // <host> in the ADR-0010 FAIL string
  rows: DoctorRow[]; // D1..D10 order, D5b between D5 and D6; never re-sorted here
  env: Readonly<Record<string, string>>; // raw env; only typed facts about it reach the output
  command?: string; // ADR-0019 D7: the exact context-mode CLI command to run in a terminal; built from typed ids only
}

// ADR-0014 §3: a key passes only if every char is A-Z, 0-9 or "_" (char scanner, no regex).
function keyIsTyped(key: string): boolean {
  if (key.length === 0) return false;
  for (const ch of key) {
    const upper = ch >= "A" && ch <= "Z";
    const digit = ch >= "0" && ch <= "9";
    if (!upper && !digit && ch !== "_") return false;
  }
  return true;
}

// ADR-0014 §3: a value passes only as a member of its key's closed enum; anything else is dropped whole.
function envLine(key: string, value: string): string {
  const typedKey = keyIsTyped(key) ? key : REPORT_INVALID;
  const allowed = REPORT_ENV_ENUMS[typedKey];
  const typedValue = allowed !== undefined && allowed.includes(value) ? value : REPORT_INVALID;
  return REPORT_ENV_PREFIX + typedKey + ": " + typedValue;
}

function rowLine(agent: AgentId, row: DoctorRow): string {
  const fix = row.status === "FAIL" ? DOCTOR_FAIL_LINE(agent, row.id, row.detail, row.fixCommand ?? "") : "";
  return "| " + [row.id + " " + row.label, row.status, row.detail, fix].join(" | ") + " |";
}

// The whole report: every row, then the command line, then the typed env lines. Never cut (D-NO-LOSSY-CUT-1).
export function buildReport(input: ReportInput): string {
  return [
    REPORT_HEADER,
    REPORT_HEADER_RULE,
    ...input.rows.map((row) => rowLine(input.agent, row)),
    ...(input.command === undefined ? [] : [REPORT_COMMAND_PREFIX + input.command]),
    ...Object.keys(input.env).sort().map((key) => envLine(key, input.env[key])),
  ].join("\n");
}

// D-NO-LOSSY-CUT-1: the reply when the whole report is over REPORT_CAP (ADR-0014: a report pasted into an issue
// stays small). The caller has stored the whole report; this keeps the header, the FAIL rows and the command
// line, then the pointer that reads the rest. A FAIL row that does not fit is in the stored report.
export function buildReportHead(input: ReportInput): string {
  const tail = [
    ...(input.command === undefined ? [] : [REPORT_COMMAND_PREFIX + input.command]),
    REPORT_REST_PREFIX + REPORT_POINTER,
  ];
  const lines = [REPORT_HEADER, REPORT_HEADER_RULE];
  let used = Buffer.byteLength(lines.concat(tail).join("\n"), "utf8");
  for (const row of input.rows) {
    if (row.status !== "FAIL") continue;
    const line = rowLine(input.agent, row);
    const cost = Buffer.byteLength(line, "utf8") + 1;
    if (used + cost > REPORT_CAP) break;
    lines.push(line);
    used += cost;
  }
  return lines.concat(tail).join("\n");
}
