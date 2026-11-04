// ADR-0009 §2, impl/06 §1, DECISIONS-r9 M1-M5/M9. DECISIONS-r11 (A) supersedes DECISIONS-r6 D3: decision rows
// are now the "decisions" section of the anchored block (last row per key wins, ADR-0009 §8.2 update-beats-duplicate).
// Pure over JournalRow[] (DEVIATIONS D-M4-arch-2): no DB handle here; callers pass readSessionEvents rows.
// The per-section line formats (DECISIONS-r9 M4) live here, not in render.ts: render.ts imports this file,
// so a format import back from render.ts would make an import cycle (DEVIATIONS D-M4-S1-3).
import { MAX_CANDIDATES, MAX_CANDIDATES_TOTAL } from "../contracts/constants.ts";
import type { Candidate, CandidateSection, JournalRow } from "../contracts/types.ts";

/** A candidate plus the `more:` query it adds when render skips it (DECISIONS-r9 M11). */
export interface SectionCandidate extends Candidate {
  query: string | null; // key (open errors, indexed sources), path (changed files), null (prompts)
}
export interface ChangedFileCandidate extends SectionCandidate {
  editCount: number; // count of edit rows for this path (DECISIONS-r9 M3); equal to repeatCount
}
/** The five sections, each in seq ascending order (impl/06 §1 Output). */
export interface CandidateSet {
  lastRequest: SectionCandidate | null;
  openErrors: SectionCandidate[];
  changedFiles: ChangedFileCandidate[];
  decisions: SectionCandidate[];
  earlierRequests: SectionCandidate[];
  indexedSources: SectionCandidate[];
}

/** DECISIONS-r9 M4: the body's first line only, CR folded to a space. */
function firstLine(body: string): string {
  const nl = body.indexOf("\n");
  return (nl < 0 ? body : body.slice(0, nl)).replaceAll("\r", " ");
}

function make(section: CandidateSection, row: JournalRow, text: string, repeatCount: number, query: string | null): SectionCandidate {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes < 1) throw new Error("compaction: empty candidate line (DECISIONS-r9 M9).");
  return { section, seq: row.seq, turn: row.turn, text, bytes, repeatCount, pinned: section === "last_request", query };
}

/** impl/06 §1 step 8: keep the MAX_CANDIDATES newest (list is seq ascending). */
function capSection<T>(list: T[]): T[] {
  return list.length > MAX_CANDIDATES ? list.slice(list.length - MAX_CANDIDATES) : list;
}

function emptySet(): CandidateSet {
  return { lastRequest: null, openErrors: [], changedFiles: [], decisions: [], earlierRequests: [], indexedSources: [] };
}

export function buildCandidates(rows: readonly JournalRow[], sessionId: string): CandidateSet {
  if (!sessionId) return emptySet(); // ADR-0009 §2, DECISIONS-r9 M1
  const own = rows.filter((r) => r.session_id === sessionId).sort((a, b) => a.seq - b.seq);

  // steps 2 and 5: last request (pinned) and earlier requests.
  const prompts = own.filter((r) => r.kind === "prompt");
  const last = prompts.length > 0 ? prompts[prompts.length - 1] : undefined;
  const lastRequest = last === undefined ? null : make("last_request", last, "now: " + firstLine(last.body), 1, null);
  const earlierRequests = prompts
    .slice(0, prompts.length - 1)
    .map((r) => make("earlier_requests", r, "asked #" + r.seq + ": " + firstLine(r.body), 1, null));

  // step 3 (DECISIONS-r9 M2, F2): latest failing cmd/toolerr row per key, open unless a later row of that
  // key succeeded. A row with no key cannot be resolved structurally and is not a candidate (D-M4-S1-2).
  const failures = new Map<string, { row: JournalRow; count: number }>();
  const lastOk = new Map<string, number>();
  for (const r of own) {
    if ((r.kind !== "cmd" && r.kind !== "toolerr") || r.key === null) continue;
    if (r.ok === 1) {
      lastOk.set(r.key, r.seq);
      continue;
    }
    failures.set(r.key, { row: r, count: (failures.get(r.key)?.count ?? 0) + 1 });
  }
  const openErrors: SectionCandidate[] = [];
  for (const [key, f] of failures) {
    if ((lastOk.get(key) ?? 0) > f.row.seq) continue;
    openErrors.push(make("open_errors", f.row, "error #" + f.row.seq + " " + (f.row.tool ?? "") + ": " + key, f.count, key));
  }
  openErrors.sort((a, b) => a.seq - b.seq);

  // step 4 (DECISIONS-r9 M3): last write wins per path, repeatCount = edit rows for that path.
  const edits = new Map<string, { row: JournalRow; count: number }>();
  for (const r of own) {
    if (r.kind !== "edit" || r.path === null) continue;
    edits.set(r.path, { row: r, count: (edits.get(r.path)?.count ?? 0) + 1 });
  }
  const changedFiles: ChangedFileCandidate[] = [];
  for (const [path, e] of edits) {
    const c = make("changed_files", e.row, "edited " + path + " x" + e.count, e.count, path);
    changedFiles.push({ ...c, editCount: e.count });
  }
  changedFiles.sort((a, b) => a.seq - b.seq);

  // DECISIONS-r11 (A): one candidate per decision key, the latest row wins, repeatCount = rows of that key.
  // The line is the body's first line ("Q: ... → A: ..." or "A: <label>"); the key is the more: query.
  const decided = new Map<string, { row: JournalRow; count: number }>();
  for (const r of own) {
    if (r.kind !== "decision" || r.body === "") continue;
    const key = r.key ?? r.body;
    decided.set(key, { row: r, count: (decided.get(key)?.count ?? 0) + 1 });
  }
  const decisions: SectionCandidate[] = [];
  for (const [key, d] of decided) decisions.push(make("decisions", d.row, "decided #" + d.row.seq + ": " + firstLine(d.row.body), d.count, key));
  decisions.sort((a, b) => a.seq - b.seq);

  // step 6: one candidate per index row.
  const indexedSources = own
    .filter((r) => r.kind === "index")
    .map((r) => make("indexed_sources", r, "indexed " + (r.key ?? ""), 1, r.key));

  // step 8 (per section), then step 9 (total, DECISIONS-r9 M5); the pinned last request is never dropped.
  const set: CandidateSet = {
    lastRequest,
    openErrors: capSection(openErrors),
    changedFiles: capSection(changedFiles),
    decisions: capSection(decisions),
    earlierRequests: capSection(earlierRequests),
    indexedSources: capSection(indexedSources),
  };
  const rest = [...set.openErrors, ...set.changedFiles, ...set.decisions, ...set.earlierRequests, ...set.indexedSources];
  const total = rest.length + (lastRequest === null ? 0 : 1);
  if (total <= MAX_CANDIDATES_TOTAL) return set;
  const drop = new Set(rest.map((c) => c.seq).sort((a, b) => a - b).slice(0, total - MAX_CANDIDATES_TOTAL));
  return {
    lastRequest,
    openErrors: set.openErrors.filter((c) => !drop.has(c.seq)),
    changedFiles: set.changedFiles.filter((c) => !drop.has(c.seq)),
    decisions: set.decisions.filter((c) => !drop.has(c.seq)),
    earlierRequests: set.earlierRequests.filter((c) => !drop.has(c.seq)),
    indexedSources: set.indexedSources.filter((c) => !drop.has(c.seq)),
  };
}
