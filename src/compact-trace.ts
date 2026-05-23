import { createHash } from "node:crypto";

export interface CompactTraceSection {
  title: string;
  content: string;
}

export interface CompactTraceHit {
  title: string;
  content: string;
}

export interface CompactTraceQuery {
  query: string;
  hits: CompactTraceHit[];
}

export interface CompactBatchTraceInput {
  commandLabels: string[];
  source: string;
  totalLines: number;
  totalBytes: number;
  indexedSections: CompactTraceSection[];
  queries: CompactTraceQuery[];
  plainText: string;
}

export interface CompactBatchTraceResult {
  text: string;
  plainTokens: number;
  compactTokens: number;
  savedTokens: number;
  savedRatio: number;
  dictionaryAdds: number;
}

export interface DecodedCompactBatchTrace {
  plainTokens: number;
  compactTokens: number;
  savedRatio: number;
  commandLabels: string[];
  source: string;
  totalLines: number;
  totalBytes: number;
  indexedSections: Array<{ title: string; count: number; bytes: number; hash: string }>;
  queries: Array<{
    query: string;
    hits: Array<{ title: string; bytes: number; hash: string }>;
  }>;
}

const kTraceHeader = "CM1";

function toBase36(value: number): string {
  return Math.max(0, Math.floor(value)).toString(36);
}

function fromBase36(value: string): number {
  const parsed = Number.parseInt(value, 36);
  return Number.isFinite(parsed) ? parsed : 0;
}

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function unb64(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function hashText(value: string, width = 8): string {
  return createHash("sha256").update(value).digest("hex").slice(0, width);
}

function parseFields(line: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of line.trim().split(/\s+/).slice(1)) {
    const eq = part.indexOf("=");
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return fields;
}

function isLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isWordSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

/**
 * Pessimistic tokenizer estimate for compact traces.
 *
 * English-like letter/space runs get a 4 chars/token estimate. Dense digit or
 * identifier runs get 2 chars/token. Punctuation is counted one-for-one, which
 * intentionally punishes symbol soup instead of pretending it merges well.
 */
export function estimateCompactTraceTokens(text: string): number {
  let tokens = 0;
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    if (isLetter(code) || isWordSpace(code)) {
      let j = i + 1;
      while (j < text.length) {
        const next = text.charCodeAt(j);
        if (!isLetter(next) && !isWordSpace(next)) break;
        j++;
      }
      tokens += Math.max(1, Math.ceil((j - i) / 4));
      i = j;
      continue;
    }

    if (isDigit(code)) {
      let j = i + 1;
      while (j < text.length && isDigit(text.charCodeAt(j))) j++;
      tokens += Math.max(1, Math.ceil((j - i) / 2));
      i = j;
      continue;
    }

    tokens += 1;
    i++;
  }

  return Math.max(1, tokens);
}

export function compactTraceEnabled(value = process.env.CONTEXT_MODE_COMPACT_TRACE): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "compact"].includes(value.toLowerCase());
}

export class CompactTraceCodec {
  private readonly ids = new Map<string, number>();
  private readonly values: string[] = [];

  reset(): void {
    this.ids.clear();
    this.values.length = 0;
  }

  symbolCount(): number {
    return this.values.length;
  }

  encodeBatch(input: CompactBatchTraceInput): CompactBatchTraceResult {
    const additions: string[] = [];
    const ref = (value: string): string => this.ref(value, additions);
    const sourceRef = ref(input.source);
    const commandRefs = input.commandLabels.map(ref);

    const sectionGroups = new Map<string, { count: number; bytes: number; hashes: string[] }>();
    for (const section of input.indexedSections) {
      const existing = sectionGroups.get(section.title) ?? { count: 0, bytes: 0, hashes: [] };
      existing.count++;
      existing.bytes += Buffer.byteLength(section.content);
      existing.hashes.push(hashText(section.content));
      sectionGroups.set(section.title, existing);
    }

    const sections = Array.from(sectionGroups.entries()).map(([title, group]) => {
      const titleRef = ref(title);
      return `${titleRef}:${toBase36(group.count)}:${toBase36(group.bytes)}:${hashText(group.hashes.join(""))}`;
    });

    const queries = input.queries.map((query) => {
      const queryRef = ref(query.query);
      const hits = query.hits.map((hit) => ref(hit.title));
      const hitHash = hashText(query.hits.map((hit) => hashText(hit.content)).join(""));
      return `${queryRef}:${hitHash}>${hits.join(".")}`;
    });

    const baseLines = [
      kTraceHeader,
      additions.length > 0 ? `D ${additions.join(",")}` : "",
      `B src=${sourceRef} n=${toBase36(input.commandLabels.length)} l=${toBase36(input.totalLines)} b=${toBase36(input.totalBytes)} i=${toBase36(input.indexedSections.length)} q=${toBase36(input.queries.length)}`,
      commandRefs.length > 0 ? `C ${commandRefs.join(".")}` : "C",
      sections.length > 0 ? `S ${sections.join(",")}` : "S",
      queries.length > 0 ? `Q ${queries.join(",")}` : "Q",
    ].filter(Boolean);

    const plainTokens = estimateCompactTraceTokens(input.plainText);
    let finalText = baseLines.join("\n");
    let compactTokens = estimateCompactTraceTokens(finalText);

    for (let i = 0; i < 3; i++) {
      const savedTokens = Math.max(0, plainTokens - compactTokens);
      const savedRatio = plainTokens === 0 ? 0 : savedTokens / plainTokens;
      finalText = [
        ...baseLines,
        `M p=${toBase36(plainTokens)} c=${toBase36(compactTokens)} s=${Math.round(savedRatio * 1000).toString(36)}`,
      ].join("\n");
      const nextTokens = estimateCompactTraceTokens(finalText);
      if (nextTokens === compactTokens) break;
      compactTokens = nextTokens;
    }

    const savedTokens = Math.max(0, plainTokens - compactTokens);
    const savedRatio = plainTokens === 0 ? 0 : savedTokens / plainTokens;

    return {
      text: finalText,
      plainTokens,
      compactTokens,
      savedTokens,
      savedRatio,
      dictionaryAdds: additions.length,
    };
  }

  decodeBatch(text: string): DecodedCompactBatchTrace {
    const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (lines[0] !== kTraceHeader) {
      throw new Error(`Unsupported compact trace header: ${lines[0] ?? "(empty)"}`);
    }

    const dictionary = [...this.values];
    const dLine = lines.find((line) => line.startsWith("D "));
    if (dLine) {
      for (const entry of dLine.slice(2).split(",")) {
        const sep = entry.indexOf(":");
        if (sep <= 0) continue;
        const id = fromBase36(entry.slice(0, sep));
        const value = unb64(entry.slice(sep + 1));
        dictionary[id] = value;
        this.values[id] = value;
        this.ids.set(value, id);
      }
    }

    const resolve = (id: string): string => dictionary[fromBase36(id)] ?? "";
    const b = parseFields(lines.find((line) => line.startsWith("B ")) ?? "B");
    const m = parseFields(lines.find((line) => line.startsWith("M ")) ?? "M");

    const commandLine = lines.find((line) => line === "C" || line.startsWith("C "));
    const commandLabels = commandLine && commandLine.length > 1
      ? commandLine.slice(2).split(".").filter(Boolean).map(resolve)
      : [];

    const sectionLine = lines.find((line) => line === "S" || line.startsWith("S "));
    const indexedSections = sectionLine && sectionLine.length > 1
      ? sectionLine.slice(2).split(",").filter(Boolean).map((entry) => {
        const [titleRef = "", count = "0", bytes = "0", hash = ""] = entry.split(":");
        return { title: resolve(titleRef), count: fromBase36(count), bytes: fromBase36(bytes), hash };
      })
      : [];

    const queryLine = lines.find((line) => line === "Q" || line.startsWith("Q "));
    const queries = queryLine && queryLine.length > 1
      ? queryLine.slice(2).split(",").filter(Boolean).map((entry) => {
        const [queryPart = "", hitPart = ""] = entry.split(">");
        const [queryRef = "", hitHash = ""] = queryPart.split(":");
        const hits = hitPart.split(".").filter(Boolean).map((hit) => {
          return { title: resolve(hit), bytes: 0, hash: hitHash };
        });
        return { query: resolve(queryRef), hits };
      })
      : [];

    return {
      plainTokens: fromBase36(m.p ?? "0"),
      compactTokens: fromBase36(m.c ?? "0"),
      savedRatio: fromBase36(m.s ?? "0") / 1000,
      commandLabels,
      source: resolve(b.src ?? "0"),
      totalLines: fromBase36(b.l ?? "0"),
      totalBytes: fromBase36(b.b ?? "0"),
      indexedSections,
      queries,
    };
  }

  private ref(value: string, additions: string[]): string {
    const existing = this.ids.get(value);
    if (existing !== undefined) return toBase36(existing);

    const id = this.values.length;
    this.ids.set(value, id);
    this.values.push(value);
    additions.push(`${toBase36(id)}:${b64(value)}`);
    return toBase36(id);
  }
}

export const globalCompactTraceCodec = new CompactTraceCodec();
