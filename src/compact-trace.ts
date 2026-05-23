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

const kTraceHeader = "CM3";
const kLegacyTraceHeader = "CM1";
const kLegacyTraceHeaderV2 = "CM2";

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

function packRefs(refs: string[]): string {
  if (refs.length === 0) return "_";
  return refs.every((ref) => ref.length === 1) ? refs.join("") : `~${refs.join(".")}`;
}

function unpackRefs(value: string): string[] {
  if (value === "_") return [];
  return value.startsWith("~") ? value.slice(1).split(".").filter(Boolean) : Array.from(value);
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

export function shouldReturnCompactTrace(
  trace: Pick<CompactBatchTraceResult, "plainTokens" | "savedRatio">,
  opts: { minPlainTokens?: number; minSavedRatio?: number } = {},
): boolean {
  const minPlainTokens = opts.minPlainTokens ?? 1_000;
  const minSavedRatio = opts.minSavedRatio ?? 0.25;
  return trace.plainTokens >= minPlainTokens && trace.savedRatio >= minSavedRatio;
}

export class CompactTraceCodec {
  private readonly ids = new Map<string, number>();
  private readonly values: string[] = [];
  private lastBatchLine = "";

  reset(): void {
    this.ids.clear();
    this.values.length = 0;
    this.lastBatchLine = "";
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

    const sectionTitles: string[] = [];
    for (const [title, group] of sectionGroups.entries()) {
      void group;
      sectionTitles.push(ref(title));
    }

    const queries = input.queries.map((query) => {
      const queryRef = ref(query.query);
      const hits = query.hits.map((hit) => ref(hit.title));
      return packRefs([queryRef, ...hits]);
    });

    const batchLine = `B ${sourceRef} ${packRefs(commandRefs)} ${toBase36(input.totalLines)} ${toBase36(input.totalBytes)} ${toBase36(input.indexedSections.length)} ${toBase36(input.queries.length)}`;
    const emitBatchLine = batchLine !== this.lastBatchLine;
    this.lastBatchLine = batchLine;

    const baseLines = [
      kTraceHeader,
      additions.length > 0 ? `D ${additions.join(",")}` : "",
      emitBatchLine ? batchLine : "",
      sectionTitles.length > 0 ? `S ${packRefs(sectionTitles)}` : "S",
      queries.length > 0 ? `Q ${queries.join(" ")}` : "Q",
    ].filter(Boolean);

    const plainTokens = estimateCompactTraceTokens(input.plainText);
    let finalText = baseLines.join("\n");
    let compactTokens = estimateCompactTraceTokens(finalText);

    for (let i = 0; i < 3; i++) {
      const savedTokens = Math.max(0, plainTokens - compactTokens);
      const savedRatio = plainTokens === 0 ? 0 : savedTokens / plainTokens;
      finalText = baseLines.join("\n");
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
    if (lines[0] !== kTraceHeader && lines[0] !== kLegacyTraceHeader && lines[0] !== kLegacyTraceHeaderV2) {
      throw new Error(`Unsupported compact trace header: ${lines[0] ?? "(empty)"}`);
    }
    const legacy = lines[0] === kLegacyTraceHeader;
    const v2 = lines[0] === kLegacyTraceHeaderV2;

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
    const bLine = lines.find((line) => line.startsWith("B ")) ?? this.lastBatchLine;
    if (bLine.startsWith("B ")) this.lastBatchLine = bLine;
    const mLine = lines.find((line) => line.startsWith("M ")) ?? "M";
    const b = legacy ? parseFields(bLine) : {};
    const m = legacy ? parseFields(mLine) : {};

    const bParts = legacy ? [] : bLine.slice(2).split(" ");
    const commandLine = lines.find((line) => line === "C" || line.startsWith("C "));
    const commandLabels = legacy || v2
      ? commandLine && commandLine.length > 1
        ? (legacy ? commandLine.slice(2).split(".").filter(Boolean) : unpackRefs(commandLine.slice(2))).map(resolve)
        : []
      : unpackRefs(bParts[1] ?? "_").map(resolve);

    const sectionLine = lines.find((line) => line === "S" || line.startsWith("S "));
    const indexedSections = legacy && sectionLine && sectionLine.length > 1
      ? sectionLine.slice(2).split(",").filter(Boolean).map((entry) => {
        const [titleRef = "", count = "0", bytes = "0", hash = ""] = entry.split(":");
        return { title: resolve(titleRef), count: fromBase36(count), bytes: fromBase36(bytes), hash };
      })
      : v2 && sectionLine && sectionLine.length > 1
        ? (() => {
          const [titleRefs = "", countRefs = "", hashes = ""] = sectionLine.slice(2).split(" ");
          return unpackRefs(titleRefs).map((titleRef, index) => ({
            title: resolve(titleRef),
            count: fromBase36(unpackRefs(countRefs)[index] ?? "0"),
            bytes: 0,
            hash: hashes.slice(index * 4, index * 4 + 4),
          }));
        })()
        : sectionLine && sectionLine.length > 1
          ? unpackRefs(sectionLine.slice(2)).map((titleRef) => ({
            title: resolve(titleRef),
            count: 0,
            bytes: 0,
            hash: "",
          }))
      : [];

    const queryLine = lines.find((line) => line === "Q" || line.startsWith("Q "));
    const queries = legacy && queryLine && queryLine.length > 1
      ? queryLine.slice(2).split(",").filter(Boolean).map((entry) => {
        const [queryPart = "", hitPart = ""] = entry.split(">");
        const [queryRef = "", hitHash = ""] = queryPart.split(":");
        const hits = hitPart.split(".").filter(Boolean).map((hit) => {
          return { title: resolve(hit), bytes: 0, hash: hitHash };
        });
        return { query: resolve(queryRef), hits };
      })
      : queryLine && queryLine.length > 1
        ? queryLine.slice(2).split(" ").filter(Boolean).map((entry) => {
          const [queryRef = "", ...hitRefs] = unpackRefs(entry);
          const hits = hitRefs.map((hit) => ({ title: resolve(hit), bytes: 0, hash: "" }));
          return { query: resolve(queryRef), hits };
        })
      : [];

    const compactMetrics = legacy
      ? {
        plainTokens: fromBase36(m.p ?? "0"),
        compactTokens: fromBase36(m.c ?? "0"),
        savedRatio: fromBase36(m.s ?? "0") / 1000,
      }
      : mLine.startsWith("M ")
        ? (() => {
        const [plainTokens = "0", compactTokens = "0", savedRatio = "0"] = mLine.slice(2).split(" ");
        return {
          plainTokens: fromBase36(plainTokens),
          compactTokens: fromBase36(compactTokens),
          savedRatio: fromBase36(savedRatio) / 1000,
        };
      })()
        : { plainTokens: 0, compactTokens: 0, savedRatio: 0 };

    const batchMetrics = legacy
      ? {
        source: resolve(b.src ?? "0"),
        totalLines: fromBase36(b.l ?? "0"),
        totalBytes: fromBase36(b.b ?? "0"),
      }
      : v2
        ? {
          source: resolve(bParts[0] ?? "0"),
          totalLines: fromBase36(bParts[2] ?? "0"),
          totalBytes: fromBase36(bParts[3] ?? "0"),
        }
        : {
        source: resolve(bParts[0] ?? "0"),
        totalLines: fromBase36(bParts[2] ?? "0"),
        totalBytes: fromBase36(bParts[3] ?? "0"),
      };

    return {
      ...compactMetrics,
      commandLabels,
      ...batchMetrics,
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
