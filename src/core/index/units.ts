// r3-ledger: line units for turn-boundary recall. One stack pass over a stored output: each non-blank line
// becomes one unit made of its indent ancestors (the nearest earlier line with less indent, then that
// line's own, and so on) and the line itself. A JSON key keeps its parent objects, a TAP diagnostic keeps
// its "not ok" line, a flat log line stands alone. Units are built once at PostToolUse and stored as their
// own FTS rows (store/fts.ts insertUnits), so recall after a compaction runs one query, not a line scan.

export interface LineUnit {
  ord: number; // 0-based line index of the unit's own (last) line
  body: string; // ancestors + line, joined by "\n", never cut
}

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
  return n;
}

export function buildUnits(text: string): LineUnit[] {
  const lines = text.split("\n");
  const stack: Array<{ indent: number; line: string }> = [];
  const out: LineUnit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).endsWith("\r") ? (lines[i] as string).slice(0, -1) : (lines[i] as string);
    const indent = indentOf(line);
    if (indent === line.length) continue; // blank line: no unit, and it does not close a parent
    while (stack.length > 0 && (stack[stack.length - 1] as { indent: number }).indent >= indent) stack.pop();
    out.push({ ord: i, body: [...stack.map((s) => s.line), line].join("\n") });
    stack.push({ indent, line });
  }
  return out;
}
