// ADR-0009 §8.2, DECISIONS-r6 D3, impl/00 §5.3, DEVIATIONS D-M4-arch-5, D-M4-H1-1.
// Pure rules for the `decision` journal row: no DB, no I/O, no regex, no word list. The caller
// (dispatch.ts) appends the row and indexes its body under DECISION_SOURCE.
//   Rule 1: PostToolUse of AskUserQuestion with a JSON tool_response.answers -> "Q: <question> → A: <label>".
//   Rule 2: the user's prompt, trimmed and case-folded, equals one option label -> "A: <label>\nref: #<seq>".
// Anything else gives no row (fail-safe): a missed tag costs nothing, a wrong tag caused #856.
import { DECISION_ANSWERS_KEY, DECISION_LABEL_JOIN, DECISION_OPTION_KEY } from "../contracts/constants.ts";

export interface DecisionPart {
  key: string;  // journal key: the question text (rule 1) or DECISION_OPTION_KEY (rule 2)
  body: string; // journal body, also the one chunk indexed under DECISION_SOURCE
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A single-select label is a string; a multi-select label is a string[] joined with " | ".
// Empty strings and non-string items are skipped, never stringified (v1 #586 "[object Object]").
function labelText(v: unknown): string {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return "";
  return v.filter((x): x is string => typeof x === "string" && x !== "").join(DECISION_LABEL_JOIN);
}

// answers is a map { "<question>": label } (Claude Code, v1 #586) or a list [{ question, label }]
// (the GP6 fixture shape). Both give (question, label) pairs in order; any other shape gives none.
function answerPairs(answers: unknown): Array<[string, unknown]> {
  if (Array.isArray(answers)) {
    return answers.filter(isObject).filter((a) => typeof a.question === "string").map((a) => [a.question as string, a.label]);
  }
  return isObject(answers) ? Object.entries(answers) : [];
}

/** Rule 1. `responseText` is the PostToolUse tool_response text. Non-JSON or no answers -> []. */
export function answerDecisions(responseText: string): DecisionPart[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return []; // non-JSON response writes no row (ADR-0009 §8.2 rule 1)
  }
  if (!isObject(parsed)) return [];
  const out: DecisionPart[] = [];
  for (const [question, value] of answerPairs(parsed[DECISION_ANSWERS_KEY])) {
    const label = labelText(value);
    if (question === "" || label === "") continue;
    out.push({ key: question, body: "Q: " + question + " → A: " + label });
  }
  return out;
}

/** Option labels of an AskUserQuestion call: tool_input.questions[].options[].label. */
export function askOptionLabels(toolInput: Record<string, unknown>): string[] {
  const questions = toolInput.questions;
  if (!Array.isArray(questions)) return [];
  const out: string[] = [];
  for (const q of questions) {
    if (!isObject(q) || !Array.isArray(q.options)) continue;
    for (const o of q.options) if (isObject(o) && typeof o.label === "string" && o.label !== "") out.push(o.label);
  }
  return out;
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isAsciiLetter(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

// One line: a marker at column 0 (digits, or one ASCII letter), then "." or ")", then a space,
// then a non-empty label. Returns the trimmed label, or "" when the line is not an option.
function lineLabel(line: string): string {
  let i = 0;
  while (i < line.length && isDigit(line[i])) i++;
  if (i === 0 && line.length > 0 && isAsciiLetter(line[0])) i = 1;
  if (i === 0) return "";
  if (line[i] !== "." && line[i] !== ")") return "";
  const rest = line.slice(i + 1);
  if (!rest.startsWith(" ")) return "";
  return rest.trim();
}

/** Option labels of a numbered/lettered list (`1.`, `2.`, `A)`, `B)` at line start) in an assistant turn. */
export function listOptionLabels(text: string): string[] {
  return text.split("\n").map(lineLabel).filter((l) => l !== "");
}

function fold(s: string): string {
  return s.trim().toLowerCase();
}

/** Rule 2. `refSeq` is the journal seq of the turn that offered the options. Plain string compare. */
export function optionEchoDecision(prompt: string, labels: readonly string[], refSeq: number): DecisionPart | null {
  const p = fold(prompt);
  if (p === "") return null;
  const label = labels.find((l) => fold(l) === p);
  if (label === undefined) return null;
  return { key: DECISION_OPTION_KEY, body: "A: " + label + "\nref: #" + refSeq };
}
