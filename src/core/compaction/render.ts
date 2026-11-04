// ADR-0009 §4-§5, impl/06 §3, impl/00 §4 renderState(rows, turn) (DEVIATIONS D-M4-arch-2), DECISIONS-r6 D1,
// DECISIONS-r9 M8/M10-M13/M25. Pure: same rows -> same bytes; result <= STATE_BUDGET UTF-8 bytes.
// No line is ever cut: a line over POINTER_MIN becomes a ctx_resume(seq) pointer line.
import { POINTER_MIN, RATIO_SECTION_DECAY, STATE_BUDGET, STATE_CLOSE_TAG } from "../contracts/constants.ts";
import type { CandidateSection, JournalRow } from "../contracts/types.ts";
import { buildCandidates, type SectionCandidate } from "./candidates.ts";
import { scoreCandidates } from "./score.ts";
import { pickUnits, unitLine } from "./recall.ts";
import type { UnitCandidate } from "../contracts/types.ts";

/**
 * D-CR3-RESUME-1: ctx_resume extras. `sources`: one line per stored source of the session, best first
 * ("source <short id>: <label> (<bytes> B)"); `units`: ranked line units for the session goal, labelled by
 * short id. Both take only the budget the journal lines leave, whole lines, before the more: line.
 */
export interface StateExtras { sources: readonly string[]; units: readonly UnitCandidate[] }

type Scored = SectionCandidate & { score: number };

function bytesOf(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** ADR-0009 §4, DECISIONS-r9 M10. */
// D-HL-NAMES-1: `prefix` is the host's toolNamePrefix; tool names in the block are the names the host calls.
function lineOf(c: SectionCandidate, prefix: string): string {
  return c.bytes > POINTER_MIN ? "#" + c.seq + " (" + c.bytes + " B) " + prefix + "ctx_resume(seq:" + c.seq + ")" : c.text;
}

function moreLine(queries: readonly string[], prefix: string): string {
  return "more: " + prefix + "ctx_search(queries:" + JSON.stringify(queries) + ', scope:"session")';
}

/**
 * The session is the one of the newest row (highest seq); rows of any other session are ignored
 * (GP6 "no foreign session rows"). Callers pass readSessionEvents rows, so this is one session (D-M4-S1-1).
 */
export function renderState(rows: readonly JournalRow[], turn: number, extras?: StateExtras, prefix = ""): string {
  let newest: JournalRow | undefined;
  for (const r of rows) if (newest === undefined || r.seq > newest.seq) newest = r;
  const sessionId = newest === undefined ? "" : newest.session_id;
  const upto = newest === undefined || sessionId === "" ? 0 : newest.seq;
  const set = buildCandidates(rows, sessionId);

  // step 2 (DECISIONS-r9 M12): reserve the wrapper and an empty more: line before any item.
  const openTag = `<context_mode_state session="${sessionId}" upto="${upto}">`;
  const emptyMoreBytes = bytesOf(moreLine([], prefix));
  const budget = STATE_BUDGET - (bytesOf(openTag) + 1 + emptyMoreBytes + 1 + bytesOf(STATE_CLOSE_TAG));
  let used = 0;
  const pinnedLine = set.lastRequest === null ? null : lineOf(set.lastRequest, prefix);
  if (pinnedLine !== null) used += bytesOf(pinnedLine) + 1; // always taken first

  // steps 3-5: budgeted lazy greedy (ADR-0009 §4, DECISIONS-r6 D1). Each pick takes the best current
  // ratio = score * RATIO_SECTION_DECAY^k / bytes (k = lines already taken from that section); ties go to
  // the higher seq (M25). A line that does not fit is skipped; smaller ones may still fit (D-M4-S1-4).
  const remaining: Scored[] = scoreCandidates(
    [...set.openErrors, ...set.changedFiles, ...set.decisions, ...set.earlierRequests, ...set.indexedSources],
    turn,
  );
  const k = new Map<CandidateSection, number>();
  const taken: Scored[] = [];
  const skipped: Scored[] = [];
  while (remaining.length > 0) {
    let best = 0;
    let bestRatio = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i] as Scored;
      const ratio = (c.score * RATIO_SECTION_DECAY ** (k.get(c.section) ?? 0)) / c.bytes;
      if (ratio > bestRatio || (ratio === bestRatio && c.seq > (remaining[best] as Scored).seq)) {
        best = i;
        bestRatio = ratio;
      }
    }
    const c = remaining.splice(best, 1)[0] as Scored;
    const lineBytes = bytesOf(lineOf(c, prefix)) + 1;
    if (used + lineBytes <= budget) {
      used += lineBytes;
      taken.push(c);
      k.set(c.section, (k.get(c.section) ?? 0) + 1);
    } else {
      skipped.push(c);
    }
  }

  // step 6: fixed section order, seq ascending inside a section. DECISIONS-r11 (A): goal (now:), open errors,
  // edited files, decisions, then earlier requests and indexed sources.
  const lines: string[] = [openTag];
  if (pinnedLine !== null) lines.push(pinnedLine);
  for (const section of ["open_errors", "changed_files", "decisions", "earlier_requests", "indexed_sources"] as const) {
    for (const c of taken.filter((t) => t.section === section).sort((a, b) => a.seq - b.seq)) lines.push(lineOf(c, prefix));
  }

  // D-CR3-RESUME-1: sources by short id, then line units (pickUnits: MMR, whole units, the budget left).
  if (extras !== undefined) {
    for (const l of extras.sources) {
      const b = bytesOf(l) + 1;
      if (used + b > budget) continue; // skip, a shorter line may still fit
      used += b;
      lines.push(l);
    }
    for (const u of pickUnits(extras.units, new Set(), budget - used)) {
      const l = unitLine(u);
      used += bytesOf(l) + 1;
      lines.push(l);
    }
  }

  // step 7 (DECISIONS-r9 M11-M12): queries of skipped items, dedup, seq ascending, added while they fit.
  const queries: string[] = [];
  const seen = new Set<string>();
  for (const c of skipped.sort((a, b) => a.seq - b.seq)) {
    if (c.query === null || seen.has(c.query)) continue;
    if (bytesOf(moreLine([...queries, c.query], prefix)) - emptyMoreBytes > budget - used) break;
    queries.push(c.query);
    seen.add(c.query);
  }
  lines.push(moreLine(queries, prefix), STATE_CLOSE_TAG);
  return lines.join("\n");
}
